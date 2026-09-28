import { z } from 'zod';
import { structuringResultSchema, type OcrImage } from './ocr.ts';

/*
 * Stories 9.3 and 9.5 (FR-39, FR-75; Conflict 8 of the Epic 9 context): the prose reading
 * contract. A vision caption and an NC observation draft are one sentence read from the whole
 * image, with no OCR call: the model answers `{text}`, or null when it cannot say anything.
 * Prose is never guessed, so the reading job turns an answer into a `suggested` suggestion or
 * into nothing. This is not the OCR sidecar's contract (`ocr.ts` and its exported schema are
 * unchanged) nor the device-server sync contract.
 */

/** What the prose model answers: one sentence, or null when it cannot describe the photo. */
export const proseOutputSchema = z.object({ text: z.string() }).strict().nullable();
export type ProseOutput = z.infer<typeof proseOutputSchema>;

/** The two prose reading kinds. */
export type ProseKind = 'caption' | 'nc_obs';

/** One prose call: the job's image, the kind, and the sheet context it may name. */
export interface ProseInput {
  image: OcrImage;
  kind: ProseKind;
  context: {
    /** The target block's type (`nc_obs`); null for a caption. */
    block_type: string | null;
    /** The checklist item's label (`nc_obs`); null for a caption. */
    item_label: string | null;
  };
}

/** What one prose call reports, matching the `reading_run` fields (model, prompt_version, llm_usage). */
export const proseResultSchema = z
  .object({
    output: proseOutputSchema,
    model: z.string().min(1),
    prompt_version: z.string().min(1),
    usage: structuringResultSchema.shape.usage,
  })
  .strict();
export type ProseResult = z.infer<typeof proseResultSchema>;

/** The prose step: `fake` replays fixtures in the MVP; `anthropic`/`bedrock` are Epic 11. */
export interface ProseProvider {
  describe(input: ProseInput): Promise<ProseResult>;
}
