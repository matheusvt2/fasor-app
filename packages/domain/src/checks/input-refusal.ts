import type { InputRefusalKind } from '../contract/telemetry.ts';
import { parsePlateDateText } from '../format/datetime.ts';
import { parseVoltageClassKv } from '../registry/word-row.ts';
import { measurementReadingRefusal, overRangeRefusal, type ReadingCellInput } from '../relatorio/measurement-evaluation.ts';
import type { InstrumentRange } from '../relatorio/over-range.ts';
import { isNotApplicableText, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import type { FieldDef } from '../seed/schema.ts';
import { isValidCnpjFormat } from './cnpj.ts';

/*
 * Story 18.4 (AD-1): why a typed value was refused, as the closed `kind` of an `input_refused`
 * usage event. Each field's parse stays where it is (`numberFieldValue`,
 * `parseMeasurementReadingPtBr`, `parseReadingPtBr`, `parsePlateDateText` with
 * `plateDateAccepted`, `parseFieldInput`, `isValidCnpjFormat`, `parseVoltageClassKv`); these
 * name the reason of a refusal it decided, so `apps/web` only reports it. The `refused*`
 * functions take a text their field refused; the `*InputRefusal` ones decide too (null when
 * accepted). None returns or keeps the text.
 */

/** A sheet number field refused `typed`: an "N/A" spelling where the field takes none, else no number. */
export function refusedNumberKind(typed: string): InputRefusalKind {
  return isNotApplicableText(typed) ? 'not_applicable' : 'not_a_number';
}

/**
 * A measurement cell refused `text` (`parseMeasurementReadingPtBr`): at or below zero on a cell
 * that takes only a positive reading (`measurementReadingRefusal`), an "N/A" (a measurement
 * never takes one), else no number. Story 22.10: a reading above the limit the cell refuses, or
 * an "OL" with no instrument limit to take (`overRangeRefusal`), is `out_of_range`.
 */
export function refusedMeasurementKind(text: string, cell: ReadingCellInput, defaultUnit: string | null, range: InstrumentRange | null = null): InputRefusalKind {
  if (isNotApplicableText(text)) return 'not_applicable';
  if (overRangeRefusal(text, cell, defaultUnit, range) !== null) return 'out_of_range';
  if (measurementReadingRefusal(text, cell, defaultUnit, range) !== null) return 'not_positive';
  return 'not_a_number';
}

/** A reading typed over a display suggestion was refused (`parseReadingPtBr`): a negative number, an "N/A", else no number. */
export function refusedReadingKind(text: string): InputRefusalKind {
  if (isNotApplicableText(text)) return 'not_applicable';
  const trimmed = text.trim();
  if (trimmed.startsWith('-') && parseDecimalPtBr(trimmed.slice(1).trim()) !== null) return 'not_positive';
  return 'not_a_number';
}

/** A plate date was refused: a text `parsePlateDateText` cannot read is no date; a date it reads fell outside 1900 .. next year (F-22). */
export function refusedPlateDateKind(text: string): InputRefusalKind {
  return parsePlateDateText(text) === null ? 'not_a_date' : 'out_of_range';
}

/** A suggested field refused `text` (`parseFieldInput`), by its kind. */
export function refusedFieldInputKind(field: Pick<FieldDef, 'kind'>, text: string): InputRefusalKind {
  switch (field.kind) {
    case 'number':
      return refusedNumberKind(text);
    case 'date':
      return refusedPlateDateKind(text);
    case 'voltage_class':
      return 'not_a_number';
    default:
      return 'bad_format';
  }
}

/** A CNPJ field's text: null when blank or 14 digits (`isValidCnpjFormat`), else `bad_format`. */
export function cnpjInputRefusal(text: string): InputRefusalKind | null {
  return text.trim() === '' || isValidCnpjFormat(text) ? null : 'bad_format';
}

/** A voltage class field's text: null when blank or a kV number (`parseVoltageClassKv`), else `not_a_number`. */
export function voltageClassInputRefusal(text: string): InputRefusalKind | null {
  return text.trim() === '' || parseVoltageClassKv(text) !== null ? null : 'not_a_number';
}
