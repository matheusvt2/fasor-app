import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OCR_READ_MAX_BYTES,
  OCR_SERVICE_ROUTES,
  ocrContractJsonSchema,
  ocrErrorResponseSchema,
  ocrHealthResponseSchema,
  ocrReadResultSchema,
  structuringOutputSchema,
  structuringResultSchema,
  structuringValueSchemaFor,
} from './ocr.ts';

const REGENERATE = 'docker compose --profile tools run --rm tools pnpm schema:ocr';

const token = (index: number, bbox: [number, number, number, number], text = 'TR-01') => ({
  id: `t${index}`,
  text,
  bbox,
  confidence: 0.9,
});

const read = (tokens: unknown[]) => ({ image: { width: 100, height: 50 }, tokens, preprocessing_applied: false });

describe('OCR sidecar contract (Story 8.3)', () => {
  it('the committed JSON Schema equals the zod export', () => {
    const path = fileURLToPath(new URL('../../../../services/ocr/contract/ocr-contract.schema.json', import.meta.url));
    const committed = readFileSync(path, 'utf8');
    const expected = JSON.stringify(ocrContractJsonSchema(), null, 2) + '\n';
    expect(committed === expected, `services/ocr/contract/ocr-contract.schema.json is stale; regenerate it with: ${REGENERATE}`).toBe(true);
  });

  it('exports every definition the sidecar generates models for, as draft 2020-12', () => {
    const schema = ocrContractJsonSchema();
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(Object.keys(schema.$defs as object).sort()).toEqual(
      ['OcrErrorResponse', 'OcrHealthResponse', 'OcrReadResult', 'OcrToken', 'StructuringOutput'].sort(),
    );
  });

  it('names the routes and the size limit', () => {
    expect(OCR_SERVICE_ROUTES.read).toEqual({ method: 'POST', path: '/read' });
    expect(OCR_SERVICE_ROUTES.health).toEqual({ method: 'GET', path: '/health' });
    expect(OCR_READ_MAX_BYTES).toBe(20 * 1024 * 1024);
  });

  it('accepts an empty read and ids t0..tn in order', () => {
    expect(ocrReadResultSchema.safeParse(read([])).success).toBe(true);
    expect(ocrReadResultSchema.safeParse(read([token(0, [0, 0, 10, 10]), token(1, [12, 0, 100, 50])])).success).toBe(true);
  });

  it('rejects ids out of sequence', () => {
    expect(ocrReadResultSchema.safeParse(read([token(1, [0, 0, 10, 10])])).success).toBe(false);
    const swapped = [token(1, [0, 0, 10, 10]), token(0, [12, 0, 20, 10])];
    expect(ocrReadResultSchema.safeParse(read(swapped)).success).toBe(false);
    expect(ocrReadResultSchema.safeParse(read([{ ...token(0, [0, 0, 10, 10]), id: 'w0' }])).success).toBe(false);
  });

  it('rejects boxes out of order or outside the image', () => {
    expect(ocrReadResultSchema.safeParse(read([token(0, [10, 0, 10, 10])])).success).toBe(false);
    expect(ocrReadResultSchema.safeParse(read([token(0, [0, 10, 10, 5])])).success).toBe(false);
    expect(ocrReadResultSchema.safeParse(read([token(0, [-1, 0, 10, 10])])).success).toBe(false);
    expect(ocrReadResultSchema.safeParse(read([token(0, [0, 0, 101, 10])])).success).toBe(false);
    expect(ocrReadResultSchema.safeParse(read([token(0, [0, 0, 10, 51])])).success).toBe(false);
    expect(ocrReadResultSchema.safeParse(read([token(0, [0.5, 0.5, 99.5, 49.5])])).success).toBe(true);
  });

  it('rejects an empty word, a confidence out of [0, 1] and unknown keys', () => {
    expect(ocrReadResultSchema.safeParse(read([token(0, [0, 0, 10, 10], '')])).success).toBe(false);
    expect(ocrReadResultSchema.safeParse(read([{ ...token(0, [0, 0, 10, 10]), confidence: 1.2 }])).success).toBe(false);
    expect(ocrReadResultSchema.safeParse({ ...read([]), extra: 1 }).success).toBe(false);
  });

  it('types health and error bodies', () => {
    expect(ocrHealthResponseSchema.safeParse({ status: 'up', detection: 'PP-OCRv5', recognition: 'parseq' }).success).toBe(true);
    expect(ocrHealthResponseSchema.safeParse({ status: 'down', detection: 'x', recognition: 'y' }).success).toBe(false);
    expect(ocrErrorResponseSchema.safeParse({ error: 'invalid_image' }).success).toBe(true);
    expect(ocrErrorResponseSchema.safeParse({ error: 'too_large' }).success).toBe(true);
    expect(ocrErrorResponseSchema.safeParse({ error: 'nope' }).success).toBe(false);
  });
});

describe('structuring contract (Story 8.3)', () => {
  const value = (v: unknown, ids: string[] = ['t3']) => ({ key: 'potencia_nominal', value: v, ocr_token_ids: ids, confidence: 0.8 });

  it('a number value needs {raw, unit, state}', () => {
    const schema = structuringValueSchemaFor('number');
    expect(schema.safeParse({ raw: '500', unit: 'kVA', state: 'measured' }).success).toBe(true);
    expect(schema.safeParse({ raw: '500', unit: null, state: 'measured' }).success).toBe(true);
    expect(schema.safeParse({ raw: '500' }).success).toBe(false);
    expect(schema.safeParse('500').success).toBe(false);
  });

  it('a date value is YYYY-MM[-DD]', () => {
    const schema = structuringValueSchemaFor('date');
    expect(schema.safeParse('2024-08').success).toBe(true);
    expect(schema.safeParse('2024-08-15').success).toBe(true);
    expect(schema.safeParse('08/2024').success).toBe(false);
  });

  it('every other kind is a non-empty string', () => {
    for (const kind of ['text', 'select', 'manufacturer', 'voltage_class'] as const) {
      const schema = structuringValueSchemaFor(kind);
      expect(schema.safeParse('Celtta').success).toBe(true);
      expect(schema.safeParse('').success).toBe(false);
      expect(schema.safeParse({ raw: '15', unit: 'kV', state: 'measured' }).success).toBe(false);
    }
  });

  it('a value cites at least one token and carries no bbox', () => {
    expect(structuringOutputSchema.safeParse({ values: [value('Celtta')] }).success).toBe(true);
    expect(structuringOutputSchema.safeParse({ values: [value({ raw: '500', unit: 'kVA', state: 'measured' }, ['t3', 't4'])] }).success).toBe(true);
    expect(structuringOutputSchema.safeParse({ values: [value('Celtta', [])] }).success).toBe(false);
    expect(structuringOutputSchema.safeParse({ values: [value('')] }).success).toBe(false);
    expect(structuringOutputSchema.safeParse({ values: [{ ...value('Celtta'), bbox: [0, 0, 1, 1] }] }).success).toBe(false);
    expect(structuringOutputSchema.safeParse({ values: [value('Celtta', ['3'])] }).success).toBe(false);
  });

  it('wraps the output with the reading_run fields', () => {
    const result = {
      output: { values: [] },
      model: 'fake',
      prompt_version: 'fake-1',
      usage: { input_tokens: 0, output_tokens: 0, usd: 0 },
    };
    expect(structuringResultSchema.safeParse(result).success).toBe(true);
    expect(structuringResultSchema.safeParse({ ...result, usage: { input_tokens: 0, output_tokens: 0 } }).success).toBe(false);
  });
});
