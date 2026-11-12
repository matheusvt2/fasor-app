import { canonicalDecimal, formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { BlockDefinition, TestDef } from '../seed/schema.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { plateCelsiusOf } from './plate-temperature.ts';
import type { VisitContext } from './visit-context.ts';

/*
 * Story 23.5 (seed v13; decision B; Base rev08 table CORRECAO_TEMPERATURA, NETA MTS-2023 Table
 * 100.14.1, IEC 60076-1 / NBR 5356-1): a reading taken at the equipment's temperature, corrected to
 * the reference temperature before it is judged. Only a test whose definition carries
 * `temperature_correction` is corrected (Base rev08 TR-OL-02, TR-SE-02, DJ-02 and SC-02 at 20 °C);
 * every other test, and every test of v1 to v12, is judged raw as before (AD-21).
 *
 * - Insulation to 20 °C: R20 = Rt x 2^((t - 20) / h), h = 10 for an oil-filled unit and 15 for a
 *   solid (dry) one, over NETA 100.14's span of -10 °C to 110 °C (both ends corrected; outside it
 *   nothing is corrected and the raw value is judged).
 * - Winding resistance to 75 °C: R75 = Rt x (K + 75) / (K + t), K = 235 for copper and 225 for
 *   aluminium. Built and tested here; Story 23.15 wires it.
 * - The temperature: the plate field the test names for its medium (TEMPERATURA DO ÓLEO on an oil
 *   unit, TEMPERATURA DO ENROLAMENTO on a dry one), else the cabine's ambient (`VisitContext`), else
 *   none. A test read by the oil rule whose plate leaves the medium unknown corrects nothing.
 *
 * Every text the sheet and the document show about it is composed here (AD-1): the line over the
 * table, the corrected cell's text, the column header, the instrument header's TEMPERATURA cell.
 */

/** The two media of the insulation factor. */
export type InsulationMedium = 'oil' | 'solid';

/** Where the test's temperature comes from: the plate's oil or winding field, or the cabine's ambient. */
export type TemperatureSource = 'oil' | 'winding' | 'ambient';

/** The reference temperature of the insulation correction, °C. */
export const INSULATION_REFERENCE_C = 20;
/** NETA MTS-2023 Table 100.14's span, °C: both ends corrected. */
export const CORRECTION_MIN_C = -10;
export const CORRECTION_MAX_C = 110;

const HALVING_C: Readonly<Record<InsulationMedium, number>> = { oil: 10, solid: 15 };

/** The factor that brings an insulation reading at `tC` to 20 °C, or null outside -10 °C to 110 °C (or not a number). */
export function insulationFactorTo20(tC: number, medium: InsulationMedium): number | null {
  if (!Number.isFinite(tC) || tC < CORRECTION_MIN_C || tC > CORRECTION_MAX_C) return null;
  return 2 ** ((tC - INSULATION_REFERENCE_C) / HALVING_C[medium]);
}

/** The temperature constant of a winding's material (IEC 60076-1). */
const WINDING_K: Readonly<Record<'Cu' | 'Al', number>> = { Cu: 235, Al: 225 };

/**
 * A winding resistance measured at `tC` brought to 75 °C (IEC 60076-1 / NBR 5356-1), or null when
 * the inputs are not finite numbers or K + t is not above zero. Story 23.15 wires it.
 */
export function windingResistanceTo75(r: number, tC: number, material: 'Cu' | 'Al'): number | null {
  const k = WINDING_K[material];
  if (!Number.isFinite(r) || !Number.isFinite(tC) || k + tC <= 0) return null;
  return (r * (k + 75)) / (k + tC);
}

/** The test's temperature and medium, or why none corrects it (with what is known). */
export type TestTemperature =
  | { celsius: number; source: TemperatureSource; medium: InsulationMedium }
  | { missing: 'temperature' | 'medium' | 'range'; celsius?: number; source?: TemperatureSource; medium?: InsulationMedium };

/**
 * Story 23.2 (moved here by batch e23v, unchanged): the oil or dry column the definition's oil rule
 * picks from the plate; null while its field is empty, or holds a value that is no option of it (its
 * aliases first resolved), so a row falls back rather than being judged dry.
 */
export function mediumOf(definition: Pick<BlockDefinition, 'oil_rule' | 'nameplate'>, block: Pick<BlockRow, 'sheet'>): 'oil' | 'dry' | null {
  const rule = definition.oil_rule;
  if (rule === undefined) return null;
  const value = block.sheet.nameplate[rule.field]?.value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const field = definition.nameplate.find((candidate) => candidate.key === rule.field);
  const option = field === undefined ? null : selectOptionFor(field, value);
  if (option === null) return null;
  return rule.oil_values.includes(option) ? 'oil' : 'dry';
}

/**
 * A plate number field in °C: its measured value, or null. Fix batch e25r (R-1, E24-A1 item 2): the
 * parse is `plateCelsiusOf`, the one the previous visit's plate is read by too.
 */
function plateCelsius(block: Pick<BlockRow, 'sheet'>, key: string | undefined): number | null {
  if (key === undefined) return null;
  return plateCelsiusOf(block.sheet.nameplate[key]?.value);
}

/**
 * Story 23.5: the temperature a test of this sheet is corrected at, and the medium its factor takes;
 * null for a test with no `temperature_correction` (every test of v1 to v12). The plate field of the
 * medium (oil: `oil_field`, dry or solid: `dry_field`) first, else the cabine's ambient; a missing
 * medium (the oil rule's field empty), no temperature anywhere, or a temperature outside the table,
 * say so.
 */
export function testTemperature(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'oil_rule' | 'nameplate'>, test: TestDef, visit: VisitContext): TestTemperature | null {
  const correction = test.temperature_correction;
  if (correction === undefined) return null;
  let medium: InsulationMedium;
  if (correction.medium === 'solid') medium = 'solid';
  else {
    const read = mediumOf(definition, block);
    if (read === null) return { missing: 'medium' };
    medium = read === 'oil' ? 'oil' : 'solid';
  }
  const field = medium === 'oil' ? correction.oil_field : correction.dry_field;
  const plate = plateCelsius(block, field);
  const found: { celsius: number; source: TemperatureSource } | null =
    plate !== null ? { celsius: plate, source: medium === 'oil' ? 'oil' : 'winding' } : visit.ambientC !== null ? { celsius: visit.ambientC, source: 'ambient' } : null;
  if (found === null) return { missing: 'temperature', medium };
  if (insulationFactorTo20(found.celsius, medium) === null) return { missing: 'range', ...found, medium };
  return { ...found, medium };
}

/** The factor a resolved temperature gives, or null when it says why none applies. */
export function temperatureFactor(temperature: TestTemperature | null): number | null {
  if (temperature === null || 'missing' in temperature) return null;
  return insulationFactorTo20(temperature.celsius, temperature.medium);
}

/**
 * A corrected value as it is shown and judged, in the reading's unit: the product rounded to three
 * significant figures (the precision of the table's factor), a dot-decimal raw ("8", "6.96",
 * "2610"); null for a product that is not a positive finite number.
 */
export function correctedRaw(value: number, factor: number, digits = 3): string | null {
  const product = value * factor;
  if (!Number.isFinite(product) || product <= 0) return null;
  const rounded = Number(product.toPrecision(digits));
  const magnitude = Math.floor(Math.log10(rounded));
  return canonicalDecimal(rounded.toFixed(Math.max(0, digits - 1 - magnitude)));
}

// --- the texts (authored, Story 23.5, listed for Bruno; the oil line verbatim from `60-ficha.html` #/ficha/TR1) ---

/** "40 °C", "27,5 °C", "-10 °C". */
export function celsiusText(celsius: number): string {
  return `${formatDecimalGroupedPtBr(canonicalDecimal(String(celsius)))} °C`;
}

// authored (Story 23.5, listed for Bruno): the source words of the line and of the printed cell.
const SOURCE_LINE: Readonly<Record<TemperatureSource, string>> = {
  oil: 'do óleo, na placa',
  winding: 'do enrolamento, na placa',
  ambient: 'do ambiente de ensaio, no local',
};
const SOURCE_PRINT: Readonly<Record<TemperatureSource, string>> = { oil: 'ÓLEO', winding: 'ENROLAMENTO', ambient: 'AMBIENTE' };

/** The line over a corrected test's table (`.v13-line`): its label, the value in bold and the rest. */
export interface TemperatureLine {
  label: string;
  /** "40 °C"; "—" with no temperature. */
  value: string;
  note: string;
}

/** What a corrected test shows and prints about its temperature (`TestEvaluation.temperature`). */
export interface TestTemperatureView {
  state: 'corrected' | 'missing_temperature' | 'missing_medium' | 'out_of_range';
  line: TemperatureLine;
  /** The instrument header's TEMPERATURA cell: "40 °C (ÓLEO)", "25 °C (AMBIENTE)", "-". */
  print: string;
  /** The screen column's header, "Corrigido a 20 °C". */
  header: string;
  /** The printed column's header, inside the VALORES group: "20 °C". */
  printHeader: string;
  /** The lead of a corrected cell's line on the phone card: "A 20 °C:". */
  cellLead: string;
}

// authored (Story 23.5, listed for Bruno): the line's label, the column headers and the card lead.
export const TEMPERATURE_LINE_LABEL = 'Temperatura';
export const CORRECTED_COLUMN_HEADER = 'Corrigido a 20 °C';
export const CORRECTED_PRINT_HEADER = '20 °C';
export const CORRECTED_CELL_LEAD = 'A 20 °C:';
/** The instrument header's column, before ACEITÁVEL (Story 23.1's frame, M-5). */
export const TEMPERATURE_PRINT_LABEL = 'TEMPERATURA';
/** What a corrected cell or the TEMPERATURA cell prints with nothing to show. */
const DASH = '-';

/** The line's request when no temperature was found: the plate field of the medium and the ambient, or the ambient alone. */
function missingNote(test: TestDef, medium: InsulationMedium | undefined): string {
  const correction = test.temperature_correction!;
  const field = medium === undefined ? undefined : medium === 'oil' ? correction.oil_field : correction.dry_field;
  // authored (Story 23.5, listed for Bruno): the request of a corrected test with no temperature anywhere.
  const where = field === undefined ? 'a temperatura do ambiente de ensaio no local' : `a temperatura ${medium === 'oil' ? 'do óleo' : 'do enrolamento'} na placa ou a do ambiente de ensaio no local`;
  return `Informe ${where}: sem ela, as leituras são julgadas sem correção a 20 °C.`;
}

/** Story 23.5: the texts of a corrected test (`temperature_correction`) from its resolved temperature; null on every other test. */
export function temperatureView(test: TestDef, temperature: TestTemperature | null): TestTemperatureView | null {
  if (test.temperature_correction === undefined || temperature === null) return null;
  const fixed = { header: CORRECTED_COLUMN_HEADER, printHeader: CORRECTED_PRINT_HEADER, cellLead: CORRECTED_CELL_LEAD };
  if (!('missing' in temperature)) {
    return {
      ...fixed,
      state: 'corrected',
      line: { label: TEMPERATURE_LINE_LABEL, value: celsiusText(temperature.celsius), note: `${SOURCE_LINE[temperature.source]} · as leituras são julgadas corrigidas a 20 °C` },
      print: `${celsiusText(temperature.celsius)} (${SOURCE_PRINT[temperature.source]})`,
    };
  }
  if (temperature.missing === 'range' && temperature.celsius !== undefined && temperature.source !== undefined) {
    // authored (Story 23.5, listed for Bruno): a temperature outside NETA 100.14's span.
    return {
      ...fixed,
      state: 'out_of_range',
      line: { label: TEMPERATURE_LINE_LABEL, value: celsiusText(temperature.celsius), note: `${SOURCE_LINE[temperature.source]} · fora da tabela de correção (${celsiusText(CORRECTION_MIN_C)} a ${celsiusText(CORRECTION_MAX_C)}): as leituras são julgadas sem correção` },
      print: `${celsiusText(temperature.celsius)} (${SOURCE_PRINT[temperature.source]})`,
    };
  }
  if (temperature.missing === 'medium') {
    // authored (Story 23.5, listed for Bruno): the oil rule's field empty, so neither factor applies.
    return { ...fixed, state: 'missing_medium', line: { label: TEMPERATURE_LINE_LABEL, value: '—', note: 'Informe o tipo de isolação na placa: sem ele, as leituras são julgadas sem correção a 20 °C.' }, print: DASH };
  }
  return { ...fixed, state: 'missing_temperature', line: { label: TEMPERATURE_LINE_LABEL, value: '—', note: missingNote(test, temperature.medium) }, print: DASH };
}

/** The corrected value as its cell shows it: "8 GΩ" (the unit after it, none without one). */
export function correctedText(raw: string, unit: string | null): string {
  const value = formatDecimalGroupedPtBr(raw);
  return unit === null || unit === '' ? value : `${value} ${unit}`;
}

// --- batch e23t: the winding resistance at 75 °C (Story 23.15, seed v13) ---------------------------

/** The reference temperature of the winding correction, °C. */
export const WINDING_REFERENCE_C = 75;
/**
 * The significant figures a winding value corrected to 75 °C keeps: four, so a deviation of a few
 * tenths of a percent (the 2 % history rule) is never made by the rounding.
 */
export const WINDING_DIGITS = 4;

/** What a winding correction (`winding_correction`) reads of the plate: the material select and the two temperature fields. */
export interface WindingCorrectionKeys {
  material_field: string;
  oil_field?: string | undefined;
  dry_field?: string | undefined;
}

/** The winding's temperature: the plate field of the medium the oil rule reads, else the cabine's ambient (an unknown medium reads the ambient); else none. */
export type WindingTemperature = { celsius: number; source: TemperatureSource } | { missing: 'temperature' } | { missing: 'range'; celsius: number; source: TemperatureSource };

/**
 * Story 23.15: the temperature a winding resistance is corrected from: TEMPERATURA DO ÓLEO on an oil
 * unit, TEMPERATURA DO ENROLAMENTO on a dry one (the definition's oil rule decides), the cabine's
 * ambient while that field is empty or the medium unknown; outside -10 °C to 110 °C, none.
 */
export function windingTemperature(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'oil_rule' | 'nameplate'>, keys: WindingCorrectionKeys, visit: VisitContext): WindingTemperature {
  const medium = mediumOf(definition, block);
  const field = medium === 'oil' ? keys.oil_field : medium === 'dry' ? keys.dry_field : undefined;
  const plate = plateCelsius(block, field);
  const found: { celsius: number; source: TemperatureSource } | null =
    plate !== null ? { celsius: plate, source: medium === 'oil' ? 'oil' : 'winding' } : visit.ambientC !== null ? { celsius: visit.ambientC, source: 'ambient' } : null;
  if (found === null) return { missing: 'temperature' };
  if (!(found.celsius >= CORRECTION_MIN_C && found.celsius <= CORRECTION_MAX_C)) return { missing: 'range', ...found };
  return found;
}

/** The winding's material, Cu or Al, from the plate select (aliases resolved); null while empty or another value. */
export function windingMaterial(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate'>, keys: WindingCorrectionKeys): 'Cu' | 'Al' | null {
  const field = definition.nameplate.find((candidate) => candidate.key === keys.material_field);
  if (field === undefined) return null;
  const option = selectOptionFor(field, block.sheet.nameplate[keys.material_field]?.value);
  return option === 'Cu' || option === 'Al' ? option : null;
}

/** The factor that brings a winding resistance at the resolved temperature to 75 °C, or null without a temperature or a material. */
export function windingFactor(temperature: WindingTemperature, material: 'Cu' | 'Al' | null): number | null {
  if (material === null || 'missing' in temperature) return null;
  return windingResistanceTo75(1, temperature.celsius, material);
}

// authored (Story 23.15, listed for Bruno): the winding test's headers, lead and requests.
export const WINDING_COLUMN_HEADER = 'Corrigido a 75 °C';
export const WINDING_PRINT_HEADER = '75 °C';
export const WINDING_CELL_LEAD = 'A 75 °C:';

/** Story 23.15: what the winding test shows and prints about its temperature, as `temperatureView` does for the insulation. */
export function windingTemperatureView(keys: WindingCorrectionKeys, temperature: WindingTemperature, medium: 'oil' | 'dry' | null): TestTemperatureView {
  const fixed = { header: WINDING_COLUMN_HEADER, printHeader: WINDING_PRINT_HEADER, cellLead: WINDING_CELL_LEAD };
  if (!('missing' in temperature)) {
    return {
      ...fixed,
      state: 'corrected',
      line: { label: TEMPERATURE_LINE_LABEL, value: celsiusText(temperature.celsius), note: `${SOURCE_LINE[temperature.source]} · os valores são corrigidos a ${WINDING_REFERENCE_C} °C` },
      print: `${celsiusText(temperature.celsius)} (${SOURCE_PRINT[temperature.source]})`,
    };
  }
  if (temperature.missing === 'range') {
    return {
      ...fixed,
      state: 'out_of_range',
      line: { label: TEMPERATURE_LINE_LABEL, value: celsiusText(temperature.celsius), note: `${SOURCE_LINE[temperature.source]} · fora da faixa de correção (${celsiusText(CORRECTION_MIN_C)} a ${celsiusText(CORRECTION_MAX_C)}): os valores não são corrigidos` },
      print: `${celsiusText(temperature.celsius)} (${SOURCE_PRINT[temperature.source]})`,
    };
  }
  const field = medium === 'oil' ? keys.oil_field : medium === 'dry' ? keys.dry_field : undefined;
  const where = field === undefined ? 'a temperatura do ambiente de ensaio no local' : `a temperatura ${medium === 'oil' ? 'do óleo' : 'do enrolamento'} na placa ou a do ambiente de ensaio no local`;
  return { ...fixed, state: 'missing_temperature', line: { label: TEMPERATURE_LINE_LABEL, value: '—', note: `Informe ${where}: sem ela, os valores não são corrigidos a ${WINDING_REFERENCE_C} °C.` }, print: DASH };
}

/** Story 23.15: the request of a winding test whose plate names no material ("Informe o campo MATERIAL DO ENROLAMENTO na placa …"). */
export function windingMaterialMissingText(label: string): string {
  return `Informe o campo ${label} na placa para corrigir os valores a ${WINDING_REFERENCE_C} °C.`;
}
