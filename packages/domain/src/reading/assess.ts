import type { OcrToken } from '../contract/ocr.ts';
import { canonicalDecimal } from '../parse/pt-br-number.ts';
import { wordRowByName } from '../registry/instrument-row.ts';
import { parseVoltageClassKv, type WordRow } from '../registry/word-row.ts';
import type { JsonValue, SuggestionHint, SuggestionRow } from '../schemas/entities.ts';
import type { FieldDef } from '../seed/schema.ts';
import { digitCoverage } from './digits.ts';
import { readingValueText } from './value.ts';

/*
 * Story 8.5: the trust and the hint of one normalized value, computed on the server and
 * never taken from the model.
 *
 * - Digits (AC 1): the value's digits must be the cited tokens' digits, else `verify`.
 * - Voltage class (AC 2): a kV absent from the company's live registry is `verify`; a
 *   match stores the registry row's name.
 * - Manufacturer (AC 2): a name the registry does not hold stays `suggested` (unless the
 *   digit rule says `verify`) and carries `create_registry_entry`, which the device renders
 *   "Criar ⟨nome⟩?"; a match stores the registry's own spelling and no hint.
 */

export interface ReadingRegistry {
  manufacturers: readonly WordRow[];
  voltageClasses: readonly WordRow[];
}

export interface ReadingAssessment {
  value: JsonValue;
  trust: SuggestionRow['trust'];
  hint: SuggestionHint | null;
}

export interface AssessReadingInput {
  field: Pick<FieldDef, 'kind'>;
  /** The value as `normalizeReadingValue` returned it. */
  value: JsonValue;
  /** The tokens the value cites; their order does not matter (the rule reads them in token-array order). */
  cited: readonly Pick<OcrToken, 'id' | 'text'>[];
  registry: ReadingRegistry;
  /** Normalization's own verdict (`NormalizedReadingValue.verify`): true forces `verify`. */
  verify?: boolean;
}

function live<T extends WordRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.removed_at === null);
}

function kvKey(text: string): string | null {
  const kv = parseVoltageClassKv(text);
  return kv === null ? null : canonicalDecimal(kv.replace(',', '.'));
}

export function assessReadingValue(input: AssessReadingInput): ReadingAssessment {
  const { field, cited, registry } = input;
  let value = input.value;
  let trust: SuggestionRow['trust'] = input.verify === true ? 'verify' : 'suggested';
  let hint: SuggestionHint | null = null;

  if (!digitCoverage(readingValueText(field, value), cited)) trust = 'verify';

  if (field.kind === 'voltage_class' && typeof value === 'string') {
    const wanted = kvKey(value);
    const row = wanted === null ? undefined : live(registry.voltageClasses).find((candidate) => kvKey(candidate.name) === wanted);
    if (row === undefined) trust = 'verify';
    else value = row.name;
  }

  if (field.kind === 'manufacturer' && typeof value === 'string') {
    const row = wordRowByName(value, live(registry.manufacturers));
    if (row === null) hint = { create_registry_entry: { kind: 'manufacturer', name: value } };
    else value = row.name;
  }

  return { value, trust, hint };
}
