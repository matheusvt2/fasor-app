import { vectorGroupReadOf, type FieldDef, type OcrToken, type StructuringResult } from '@app/domain';

/*
 * Story 21.2, moved out of `bedrock-eval.ts` by e21a (R-2) so a test can import it (the script
 * runs on import). The eval's group column reads the kernel classification the job stores by
 * (`vectorGroupReadOf`), so the paid eval's table prints what production keeps.
 */

/**
 * The group a reading gives LIGAÇÃO SECUNDÁRIA (`field`, the v11 select or the v9/v10 text): the code
 * when its cited words print it; "<code> (diagram)" when they print no group (read from the drawn
 * diagram); "<code> (other group)" when they print another; an unparsed text JSON-quoted as stored;
 * "- (dropped)" when the job stores nothing (an unknown cited id, a value naming no option); "-" for no entry.
 */
export function groupRead(result: Pick<StructuringResult, 'output'>, field: Pick<FieldDef, 'key' | 'kind' | 'unit' | 'options' | 'option_aliases'>, ocr: { tokens: readonly Pick<OcrToken, 'id' | 'text'>[] }): string {
  const entry = result.output.values.find((candidate) => candidate.key === field.key);
  if (entry === undefined) return '-';
  const read = vectorGroupReadOf(field, entry, ocr.tokens);
  switch (read.kind) {
    case 'printed':
      return read.code;
    case 'diagram':
      return `${read.code} (diagram)`;
    case 'other_group':
      return `${read.code} (other group)`;
    case 'unparsed':
      return JSON.stringify(read.value);
    case 'dropped':
      return '- (dropped)';
  }
}
