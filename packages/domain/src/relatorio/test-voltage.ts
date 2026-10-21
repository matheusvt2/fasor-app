import { formatDecimalGroupedPtBr, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import { displayCellTargetSchema } from '../reading/target.ts';
import type { BlockRow, JsonValue } from '../schemas/entities.ts';
import { findDefinition } from '../seed/definitions.ts';
import { SELV_YES, type TestDef } from '../seed/schema.ts';
import { storedInstrumentHeader } from './instrument-pick.ts';
import { pickedBand, voltsOf } from './reading-evaluation.ts';

/*
 * Story 14.14 (seed v7; Bruno 2026-10-21 answers 1 and 3): two non-blocking notices of the
 * Quadro elétrico's sheet, derived here and only rendered by `apps/web`. Neither changes a
 * verdict, a count, a pre-issue row, the Export dialog nor the print (open question 3, default:
 * the sheet only).
 *
 * - The SELV notice: "Circuito SELV/PELV" reads SIM while the plate's TENSÃO NOMINAL is above the
 *   seed's `selv_max_voltage` (50 V). The SELV band still applies, as the mark says.
 * - The test-voltage check: the instrument header's TENSÃO ENSAIO (`test_parameter`, text such as
 *   "5.000 V" or "5 kV") against the test voltage of the band the test is judged by, only when
 *   the test has a live display shot (a "Ler visor" photo of the block whose `reading_target`
 *   names the test), whatever its reading's state (open question 5, default). Equal after the
 *   unit conversion, no tolerance (open question 4, default).
 */

/** A file row as the check reads it. */
type CheckFile = { readonly kind: string; readonly removed_at: string | null; readonly block_id?: string | null; readonly reading_target?: JsonValue | null };

type CheckBlock = Pick<BlockRow, 'id' | 'sheet'>;

/** What the test-voltage check found: `match` shows nothing; `mismatch` and `not_checked` show `text`. */
export interface TestVoltageCheck {
  state: 'match' | 'mismatch' | 'not_checked';
  /** The notice under the test, or null on a match. */
  text: string | null;
  /** The band's test voltage, "500 V". */
  expected: string;
  /** The instrument's TENSÃO ENSAIO in V, "5.000 V", or null when it does not parse. */
  given: string | null;
}

// authored (Story 14.14, listed for Bruno): the test voltage shown without a display shot to check it against.
/** The test voltage could not be checked: no live display shot of the test, or a TENSÃO ENSAIO that does not parse. */
export const TEST_VOLTAGE_NOT_CHECKED = 'Tensão de ensaio não conferida';

/** A voltage in V as the notices print it: "5.000 V", "250 V". */
function voltsText(volts: number): string {
  return `${formatDecimalGroupedPtBr(String(volts))} V`;
}

/** The volts a typed TENSÃO ENSAIO names ("5.000 V", "0,5 kV", "500 Vcc", "5 kV cc", "500 Vdc"), or null when it names none. */
export function testParameterVolts(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null;
  const match = /^\s*([\d.,]+)\s*(k?)v\s*(cc|ca|dc|ac)?\s*$/i.exec(text);
  if (match === null) return null;
  const raw = parseDecimalPtBr(match[1]!);
  if (raw === null) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number <= 0) return null;
  // Rounded to the millivolt so "0,38 kV" reads as 380 V, not 380.00000000000006.
  return Math.round(number * (match[2] === '' ? 1 : 1000) * 1000) / 1000;
}

/** True when the block holds a live display shot naming `testKey`. */
function hasDisplayShot(files: readonly CheckFile[], blockId: string, testKey: string): boolean {
  return files.some((file) => {
    if (file.kind !== 'photo' || file.removed_at !== null || file.block_id !== blockId) return false;
    const target = displayCellTargetSchema.safeParse(file.reading_target ?? null);
    return target.success && target.data.table_key === testKey;
  });
}

/**
 * The test-voltage check of one test of the block: null (nothing shown) when the test is judged
 * by no band, its band names no test voltage (seed v6 and earlier), or the instrument header
 * holds no TENSÃO ENSAIO; else `match`, `mismatch` or `not_checked`. Never throws.
 */
export function testVoltageCheck(input: { readonly block: CheckBlock; readonly files: readonly CheckFile[] }, test: TestDef): TestVoltageCheck | null {
  const band = pickedBand(input.block, test);
  if (band === null || band.test_voltage === undefined) return null;
  const parameter = storedInstrumentHeader(input.block.sheet.test[test.key]?.instrument?.value)?.test_parameter ?? null;
  if (parameter === null || parameter.trim() === '') return null;
  const expected = voltsText(band.test_voltage);
  const volts = testParameterVolts(parameter);
  const given = volts === null ? null : voltsText(volts);
  if (volts === null || !hasDisplayShot(input.files, input.block.id, test.key)) return { state: 'not_checked', text: TEST_VOLTAGE_NOT_CHECKED, expected, given };
  if (volts === band.test_voltage) return { state: 'match', text: null, expected, given };
  // authored (Story 14.14, listed for Bruno): the instrument's test voltage is not the band's.
  return { state: 'mismatch', text: `Tensão de ensaio do instrumento (${given}) diferente da prevista para a faixa (${expected}).`, expected, given };
}

// authored (Story 14.14, listed for Bruno): the SELV/PELV mark and the plate's voltage disagree.
/** The SELV notice. */
export const SELV_VOLTAGE_NOTICE = 'Marcado SELV/PELV, mas a TENSÃO NOMINAL passa de 50 V: confira a marcação ou a tensão.';

/**
 * The SELV notice of a block, under its SELV/PELV field: the text when the mark reads SIM and the
 * TENSÃO NOMINAL is above the seed's `selv_max_voltage`; null otherwise (NÃO, empty mark, empty
 * or unparsable voltage, a seed without the ceiling).
 */
export function selvVoltageNoticeText(block: Pick<BlockRow, 'seed_version' | 'block_type' | 'sheet'>): string | null {
  const definition = findDefinition(block.seed_version, block.block_type);
  if (definition === null) return null;
  for (const test of definition.tests) {
    const bands = test.criterion_bands;
    if (bands?.selv_max_voltage === undefined || bands.selv_field === undefined) continue;
    const mark = block.sheet.nameplate[bands.selv_field]?.value;
    if (typeof mark !== 'string' || mark.trim() !== SELV_YES) continue;
    const volts = voltsOf(block.sheet.nameplate[bands.field]?.value);
    if (volts !== null && volts > bands.selv_max_voltage) return SELV_VOLTAGE_NOTICE;
  }
  return null;
}

/** The nameplate field the SELV notice shows under, or null when the block's definition has none. */
export function selvNoticeFieldOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): string | null {
  const definition = findDefinition(block.seed_version, block.block_type);
  const bands = definition?.tests.find((test) => test.criterion_bands?.selv_max_voltage !== undefined)?.criterion_bands;
  return bands?.selv_field ?? null;
}
