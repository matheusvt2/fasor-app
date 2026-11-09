import { canonicalDecimal, formatDecimalGroupedPtBr, isNotApplicableNumber, NOT_APPLICABLE_TEXT, printNotApplicable, readOverSqrt3Raw } from '../parse/pt-br-number.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import type { AppliesWhen } from '../seed/measurement.ts';
import type { BlockDefinition, FieldDef } from '../seed/schema.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { isCellFilled } from './sheet-state.ts';

/*
 * Story 23.9 (seed v13, decision J): THE reading of a test's applicability from the nameplate.
 * A test whose definition carries `applies_when` (either grammar, `seed/measurement.ts`) applies
 * while the plate meets its condition; unmet, it is not applicable (NA) with a composed reason,
 * until the technician applies it by hand: one stored override per test,
 * `sheet/{b}/test/{k}/applicability` = `'applied'` (contract 35; null follows the plate again).
 * The kernel never writes the override.
 *
 * An NA test is a switched-off sub-block for every reader but the screen: the evaluation
 * (`evaluateSheetReadings`, the measurement evaluation's live tests), the progress, the
 * conclusion floor, the parecer, the pre-issue list, section 9 (omitted), section 11, the run.
 * The screen shows its heading, the "Não se aplica" pill and the band with the reason; its cells
 * are hidden, never refused (offline and two-device safety: the fold refuses no cell write
 * because a test is NA). A test applied by override counts, judges and prints as any test; a
 * plate that meets the condition applies it with no override, and a stored one stays harmless.
 *
 * The condition over an empty field applies the test unless it says `needs_value` (the
 * conservative reading); an "N/A" on the field is filled and meets no condition.
 */

/** `always`: no condition; `met`: the plate meets it; `na`: unmet, not applied; `applied`: unmet, applied by the override. */
export type ApplicabilityState = 'always' | 'met' | 'na' | 'applied';

export interface TestApplicability {
  state: ApplicabilityState;
  /** While the condition is unmet (`na`, `applied`): "Não se aplica: TIPO DE SECCIONADORA sem fusíveis."; null otherwise. */
  reason: string | null;
  /** The reason after its lead, "TIPO DE SECCIONADORA sem fusíveis." (the band draws the lead in bold); null with `reason`. */
  phrase: string | null;
  /** The applied band's sentence, "A placa diz sem fusíveis."; null with `reason`. */
  appliedText: string | null;
}

/** The one value the override stores; null clears it (the test follows the plate again). */
export const APPLICABILITY_APPLIED = 'applied';

// authored (Story 23.9, listed for Bruno): the reason's lead, as the mock's band draws it (`60-ficha.html` #/ficha/SEC-C05).
export const NA_REASON_LEAD = 'Não se aplica:';

const ALWAYS: TestApplicability = Object.freeze({ state: 'always', reason: null, phrase: null, appliedText: null });
const MET: TestApplicability = Object.freeze({ state: 'met', reason: null, phrase: null, appliedText: null });

/** A test's condition, either grammar; null when it has none (every test of v1 to v12 and every seeded v13 test). */
export function appliesWhenOf(definition: Pick<BlockDefinition, 'tests' | 'measurement_tests'>, testKey: string): AppliesWhen | null {
  const seeded = definition.tests.find((test) => test.key === testKey);
  if (seeded !== undefined) return seeded.applies_when ?? null;
  return (definition.measurement_tests ?? []).find((test) => test.key === testKey)?.applies_when ?? null;
}

/** Whether a stored override value is one the fold accepts: `'applied'` or null (contract 35). */
export function isApplicabilityValue(value: unknown): value is typeof APPLICABILITY_APPLIED | null {
  return value === null || value === APPLICABILITY_APPLIED;
}

/** Whether a nameplate value is an "N/A": the number field's `not_applicable` state, or a text typed as an N/A spelling. */
function isNotApplicableValue(value: unknown): boolean {
  return isNotApplicableNumber(value) || (typeof value === 'string' && printNotApplicable(value) === NOT_APPLICABLE_TEXT);
}

/** A stored two-level value ("380/220", fix batch fxpw G4), whose first number is the one a bound reads. */
const PAIR_RAW = /^(\d+(?:\.\d+)?)\/\d+(?:\.\d+)?$/;

/**
 * A measured number of a nameplate cell in the field's unit: a stored "N/√3" reads N/√3, a pair
 * ("380/220") its first number, as the ratio's plate reading does (`nameplateFirstNumber`); null
 * for anything else.
 */
function numberOf(value: unknown): number | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { raw?: unknown; state?: unknown };
  if (v.state !== 'measured' || typeof v.raw !== 'string') return null;
  const sqrt3 = readOverSqrt3Raw(v.raw);
  if (sqrt3 !== null) return Number(sqrt3) / Math.sqrt(3);
  const pair = PAIR_RAW.exec(v.raw);
  if (pair !== null) return Number(pair[1]);
  return /^-?\d+(\.\d+)?$/.test(v.raw) ? Number(v.raw) : null;
}

/** A bound as a sentence says it, "5 kV". */
function boundText(value: number, unit: string | undefined): string {
  const text = formatDecimalGroupedPtBr(canonicalDecimal(String(value)));
  return unit === undefined ? text : `${text} ${unit}`;
}

// authored (Story 23.9, listed for Bruno): what the reason says of the plate's answer when the condition names no `unmet` of its own.
/** The phrase of an unmet condition after the field's label: the condition's own `unmet`, else one per operator. */
function fallbackPhrase(condition: AppliesWhen, field: FieldDef): string {
  switch (condition.op) {
    case 'in':
      return `não é ${condition.values.join(' nem ')}`;
    case 'filled':
      return 'sem valor';
    case 'above':
      return `não passa de ${boundText(condition.value, field.unit)}`;
    case 'below':
      return `não fica abaixo de ${boundText(condition.value, field.unit)}`;
  }
}

// authored (Story 23.9, listed for Bruno): an empty field the test needs, and an "N/A" with no `unmet` of the condition's.
const EMPTY_PHRASE = 'sem valor';
const NOT_APPLICABLE_PHRASE = NOT_APPLICABLE_TEXT;

/** The condition's outcome on the plate: met, or unmet with how its phrase reads (the label's own phrase, or the condition's `unmet`). */
function outcomeOf(condition: AppliesWhen, field: FieldDef, cell: Cell | undefined): { met: true } | { met: false; phrase: string; own: boolean } {
  const value = cell?.value;
  if (isNotApplicableValue(value)) return { met: false, phrase: condition.unmet ?? NOT_APPLICABLE_PHRASE, own: condition.unmet !== undefined };
  if (!isCellFilled(cell)) return condition.needs_value === true ? { met: false, phrase: EMPTY_PHRASE, own: false } : { met: true };
  let met: boolean;
  switch (condition.op) {
    case 'in': {
      const option = selectOptionFor(field, value);
      met = option !== null && condition.values.includes(option);
      break;
    }
    case 'filled':
      met = true;
      break;
    case 'above':
    case 'below': {
      const number = numberOf(value);
      met = number !== null && (condition.op === 'above' ? number > condition.value : number < condition.value);
      break;
    }
  }
  if (met) return { met: true };
  return { met: false, phrase: condition.unmet ?? fallbackPhrase(condition, field), own: condition.unmet !== undefined };
}

/**
 * Story 23.9: the applicability of one test of the sheet: `always` without a condition, `met`
 * when the plate meets it (a stored override then harmless), else `na`, or `applied` while the
 * override stores `'applied'`. A condition naming a field the definition lacks applies the test
 * (the seed and the company schema refuse such a definition before any sheet reads it).
 */
export function testApplicability(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate' | 'tests' | 'measurement_tests'>, testKey: string): TestApplicability {
  const condition = appliesWhenOf(definition, testKey);
  if (condition === null) return ALWAYS;
  const field = definition.nameplate.find((candidate) => candidate.key === condition.field);
  if (field === undefined) return MET;
  const outcome = outcomeOf(condition, field, block.sheet.nameplate[field.key]);
  if (outcome.met) return MET;
  const phrase = `${field.label} ${outcome.phrase}.`;
  const applied = block.sheet.test[testKey]?.applicability?.value === APPLICABILITY_APPLIED;
  return {
    state: applied ? 'applied' : 'na',
    reason: `${NA_REASON_LEAD} ${phrase}`,
    phrase,
    // authored (Story 23.9, from the mock's applied band): "A placa diz sem fusíveis."
    appliedText: outcome.own ? `A placa diz ${outcome.phrase}.` : `A placa diz ${field.label} ${outcome.phrase}.`,
  };
}

/** Story 23.9: whether a test counts on this sheet, judges and prints: every test but one NA by the plate (and not applied by hand). */
export function isTestInForce(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate' | 'tests' | 'measurement_tests'>, testKey: string): boolean {
  return testApplicability(block, definition, testKey).state !== 'na';
}

/** Story 23.9: one enabled test of the seeded grammars in the screen's order, with its applicability (the screen draws an NA one as its band). */
export interface SheetTestApplicability {
  testKey: string;
  applicability: TestApplicability;
}

/** Story 23.9: the applicability of every test of the definition (both grammars), in definition order. */
export function sheetApplicabilities(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate' | 'tests' | 'measurement_tests'>): SheetTestApplicability[] {
  return [...definition.tests, ...(definition.measurement_tests ?? [])].map((test) => ({ testKey: test.key, applicability: testApplicability(block, definition, test.key) }));
}
