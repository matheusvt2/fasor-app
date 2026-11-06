/*
 * Story 11.6, moved here by e21a (R-4): a provider-neutral step both structuring providers (bedrock
 * and fake) take before the contract parse, so the fake-only path never imports the Bedrock module.
 * `bedrock.ts` re-exports it under the same name.
 */

/**
 * The tool input without the values that cite no OCR token (`ocr_token_ids` missing, `null` or `[]`);
 * anything else, a malformed input included, is left for the schema to judge.
 */
export function withoutUncitedValues(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const values = (input as { values?: unknown }).values;
  if (!Array.isArray(values)) return input;
  const cited = values.filter((value: unknown) => {
    if (typeof value !== 'object' || value === null) return true;
    const ids = (value as { ocr_token_ids?: unknown }).ocr_token_ids;
    return !(ids === undefined || ids === null || (Array.isArray(ids) && ids.length === 0));
  });
  return { ...input, values: cited };
}
