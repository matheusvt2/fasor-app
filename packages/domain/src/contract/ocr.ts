import { z } from 'zod';
import { dateValueSchema, numberValueSchema } from '../schemas/entities.ts';
import type { FieldDef, FieldKind } from '../seed/schema.ts';

/*
 * Story 8.3 (FR-36, AD-27): the reading pipeline's two provider contracts.
 *
 * `OcrProvider.read` is what the `services/ocr` sidecar answers on `POST /read`: one
 * token per word, boxes in the pixel grid of the received bytes (decoded ignoring EXIF
 * orientation), in reading order. `StructuringProvider.structure` turns those tokens
 * into field values; the model cites `ocr_token_ids` and never emits a coordinate, so
 * every bbox of a Suggestion comes from OCR.
 *
 * This is not the device-server sync contract: `CONTRACT_VERSION` does not follow it.
 * The sidecar reads the JSON Schema exported from here (`pnpm schema:ocr` writes
 * `services/ocr/contract/ocr-contract.schema.json`); a kernel test fails on drift.
 */

/** The sidecar's routes, relative to `OCR_SERVICE_URL`. */
export const OCR_SERVICE_ROUTES = {
  read: { method: 'POST', path: '/read' },
  health: { method: 'GET', path: '/health' },
} as const;

/** The largest image body `POST /read` accepts; a larger one answers `413 too_large` before decoding. */
export const OCR_READ_MAX_BYTES = 20 * 1024 * 1024;

const pixelSchema = z.number().nonnegative();

/** `[x0, y0, x1, y1]` in pixels of the decoded received image; `x0 < x1`, `y0 < y1`. */
export const ocrBboxSchema = z
  .tuple([pixelSchema, pixelSchema, pixelSchema, pixelSchema])
  .refine(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1, { message: 'a box has x0 < x1 and y0 < y1' })
  .describe('[x0, y0, x1, y1] in pixels of the decoded received image, x0 < x1 and y0 < y1.');
export type OcrBbox = z.infer<typeof ocrBboxSchema>;

/** One recognized word. `id` is `t` + its index in `tokens`. */
export const ocrTokenSchema = z
  .object({
    id: z.string().regex(/^t\d+$/),
    text: z.string().min(1),
    bbox: ocrBboxSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict()
  .describe('One recognized word; id is "t" followed by the token index in tokens.');
export type OcrToken = z.infer<typeof ocrTokenSchema>;

const ocrImageSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

/**
 * The OCR read of one image. Refinements JSON Schema cannot carry (and the sidecar
 * enforces in its own code): ids are `t0..tn` in array order, every box lies inside
 * the image, the array order is reading order (lines top to bottom, words left to right).
 */
export const ocrReadResultSchema = z
  .object({
    image: ocrImageSchema,
    tokens: z.array(ocrTokenSchema),
    preprocessing_applied: z.boolean(),
  })
  .strict()
  .superRefine((result, ctx) => {
    result.tokens.forEach((token, index) => {
      if (token.id !== `t${index}`) {
        ctx.addIssue({ code: 'custom', path: ['tokens', index, 'id'], message: `token ${index} must have id t${index}` });
      }
      const [, , x1, y1] = token.bbox;
      if (x1 > result.image.width || y1 > result.image.height) {
        ctx.addIssue({ code: 'custom', path: ['tokens', index, 'bbox'], message: 'a box lies inside the image' });
      }
    });
  })
  .describe(
    'The OCR read of one image. Not expressible here and enforced by the producer: token ids are t0..tn in array order; ' +
      'every box satisfies x1 <= image.width and y1 <= image.height; the array order is reading order ' +
      '(lines top to bottom, words left to right). preprocessing_applied is true when a geometric step ' +
      '(downscale, deskew) ran and its boxes were mapped back to the received pixel grid.',
  );
export type OcrReadResult = z.infer<typeof ocrReadResultSchema>;

/** `GET /health` once the models are loaded. */
export const ocrHealthResponseSchema = z
  .object({
    status: z.literal('up'),
    detection: z.string().min(1),
    recognition: z.string().min(1),
  })
  .strict();
export type OcrHealthResponse = z.infer<typeof ocrHealthResponseSchema>;

/** The sidecar's error body: `422 invalid_image`, `413 too_large`, `500 internal`. */
export const ocrErrorResponseSchema = z
  .object({ error: z.enum(['invalid_image', 'too_large', 'internal']) })
  .strict();
export type OcrErrorResponse = z.infer<typeof ocrErrorResponseSchema>;

/** The image both providers receive: the api's `print` variant bytes (JPEG or PNG, no EXIF orientation). */
export interface OcrImage {
  bytes: Uint8Array;
  /** The sidecar reads only these two. */
  mime: 'image/jpeg' | 'image/png';
}

/** The OCR layer: `ocr-svc` (this sidecar) in the MVP, `textract` in Epic 11, `fake` in tests. */
export interface OcrProvider {
  read(image: OcrImage): Promise<OcrReadResult>;
}

// --- structuring (the LLM step) ------------------------------------------------

const nonEmptyTextSchema = z.string().min(1);

/** The value shape of one field kind (AD-11): `number` -> `{raw, unit, state}`, `date` -> `YYYY-MM[-DD]`, else a non-empty string. */
export function structuringValueSchemaFor(kind: FieldKind): z.ZodType {
  switch (kind) {
    case 'number':
      return numberValueSchema.strict();
    case 'date':
      return dateValueSchema;
    default:
      return nonEmptyTextSchema;
  }
}

/** One structured field. No bbox: the model cites OCR tokens, never coordinates. */
export const structuringValueSchema = z
  .object({
    key: z.string().min(1),
    value: z.union([numberValueSchema.strict(), nonEmptyTextSchema]),
    ocr_token_ids: z.array(z.string().regex(/^t\d+$/)).min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type StructuringValue = z.infer<typeof structuringValueSchema>;

export const structuringOutputSchema = z
  .object({ values: z.array(structuringValueSchema) })
  .strict()
  .refine((output) => new Set(output.values.map((v) => v.key)).size === output.values.length, {
    message: 'each field key appears at most once',
    path: ['values'],
  })
  .describe(
    'The structuring step output. Not expressible here: each field key appears at most once (enforced by the ' +
      "zod schema); each value has the shape of its field's kind (structuringValueSchemaFor) and cites only " +
      'token ids present in the OCR read (checked by the job).',
  );
export type StructuringOutput = z.infer<typeof structuringOutputSchema>;

/** What one structuring call reports, matching the `reading_run` fields (model, prompt_version, llm_usage). */
export const structuringResultSchema = z
  .object({
    output: structuringOutputSchema,
    model: z.string().min(1),
    prompt_version: z.string().min(1),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
        usd: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type StructuringResult = z.infer<typeof structuringResultSchema>;

export interface StructuringInput {
  image: OcrImage;
  ocr: OcrReadResult;
  fields: FieldDef[];
}

/** The LLM step: `fake` replays fixtures in the MVP; `anthropic`/`bedrock` are Epic 11. */
export interface StructuringProvider {
  structure(input: StructuringInput): Promise<StructuringResult>;
}

// --- JSON Schema export for the sidecar ----------------------------------------

export const OCR_CONTRACT_SCHEMA_ID = 'ocr-contract.schema.json';

/** One draft 2020-12 document whose `$defs` the sidecar generates its pydantic models from. */
export function ocrContractJsonSchema(): Record<string, unknown> {
  const defs: Record<string, z.ZodType> = {
    OcrReadResult: ocrReadResultSchema,
    OcrToken: ocrTokenSchema,
    OcrHealthResponse: ocrHealthResponseSchema,
    OcrErrorResponse: ocrErrorResponseSchema,
    StructuringOutput: structuringOutputSchema,
  };
  const $defs: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(defs)) {
    const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' }) as Record<string, unknown>;
    void _drop;
    $defs[name] = { title: name, ...rest };
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: OCR_CONTRACT_SCHEMA_ID,
    title: 'OcrContract',
    description:
      'Generated from packages/domain/src/contract/ocr.ts by `pnpm schema:ocr`; do not edit. ' +
      'The OCR sidecar (services/ocr) and the api reading job speak these shapes.',
    $defs,
  };
}
