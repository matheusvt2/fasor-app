/*
 * Story 21.1 (Bruno, 2026-11-05; Matheus: "Considere todos"): the 47 three-phase vector groups
 * of a transformer's turns-ratio test, transcribed from Megger TTR100 Tabla 5-2 as the research
 * note reads it (`_bmad-output/planning-artifacts/research/ttr-vector-groups-2026-11-05/research.md`
 * § The table). Each group fixes, per phase A/B/C, the high-voltage and low-voltage terminal
 * pairs the TTR measures (ANSI H/X marking), the high-voltage winding it short-circuits for that
 * phase (null when none), and the factor k that multiplies the nameplate line-to-line ratio
 * U1/U2 into the measured turns ratio. The rows keep the manual's order and row number.
 *
 * Dyn3, Dyn9, Dy3 and Dy9 ship as transcribed: their k differs from the other delta-star
 * groups and is flagged in the research note for Bruno.
 *
 * Pure data and pure functions (AD-13): the ratio evaluation, the screen helpers, the print
 * headers, the plate reading and the select options all read this one table.
 */

/** The factor k of a group: VAL CALCULADO = U1 · k / U2. */
export type VectorGroupFactor = '1' | 'sqrt3' | 'inv_sqrt3' | 'sqrt3_half' | 'two_inv_sqrt3';

export interface VectorGroupPhase {
  /** The high-voltage lead as the manual prints it: "H1-H3", "H1-(H3+H2)", "H1-H0". */
  h: string;
  /** The low-voltage pair: "X1-X0", "X3-X1". */
  x: string;
  /** The high-voltage winding the TTR short-circuits for this phase ("H3-H2"), null when none. */
  short: string | null;
}

export interface VectorGroup {
  /** The IEC 60076-1 code, high-voltage letters upper case, low-voltage lower case: "Dyn1", "YNyn0", "ZNy11". */
  code: string;
  /** The row of Megger TTR100 Tabla 5-2. */
  row: number;
  /** Phases A, B and C, in the order of the ratio table's three capture columns. */
  phases: readonly [VectorGroupPhase, VectorGroupPhase, VectorGroupPhase];
  k: VectorGroupFactor;
}

type Pair = readonly [h: string, x: string];

/** The shorts of the delta and zigzag rows (phase A, B, C). */
const SHORT_HV = ['H3-H2', 'H1-H3', 'H2-H1'] as const;
/** The shorts of YNy0 and YNy6. */
const SHORT_NEUTRAL = ['H2-H0', 'H3-H0', 'H1-H0'] as const;

function group(code: string, row: number, k: VectorGroupFactor, pairs: readonly [Pair, Pair, Pair], shorts: readonly [string, string, string] | null = null): VectorGroup {
  const phase = (i: 0 | 1 | 2): VectorGroupPhase => ({ h: pairs[i][0], x: pairs[i][1], short: shorts === null ? null : shorts[i] });
  return { code, row, phases: [phase(0), phase(1), phase(2)], k };
}

/** The 47 groups in the manual's order (rows 3 to 50; 1, 2 and 43 are not three-phase). */
export const VECTOR_GROUPS: readonly VectorGroup[] = Object.freeze([
  group('Dd0', 3, '1', [['H1-H3', 'X1-X3'], ['H2-H1', 'X2-X1'], ['H3-H2', 'X3-X2']]),
  group('Dd6', 4, '1', [['H1-H3', 'X3-X1'], ['H2-H1', 'X1-X2'], ['H3-H2', 'X2-X3']]),
  group('Dyn1', 5, 'sqrt3', [['H1-H3', 'X1-X0'], ['H2-H1', 'X2-X0'], ['H3-H2', 'X3-X0']]),
  group('Dyn7', 6, 'sqrt3', [['H1-H3', 'X0-X1'], ['H2-H1', 'X0-X2'], ['H3-H2', 'X0-X3']]),
  group('YNyn0', 7, '1', [['H1-H0', 'X1-X0'], ['H2-H0', 'X2-X0'], ['H3-H0', 'X3-X0']]),
  group('YNyn6', 8, '1', [['H1-H0', 'X0-X1'], ['H2-H0', 'X0-X2'], ['H3-H0', 'X0-X3']]),
  group('YNd1', 9, 'inv_sqrt3', [['H1-H0', 'X1-X2'], ['H2-H0', 'X2-X3'], ['H3-H0', 'X3-X1']]),
  group('YNd7', 10, 'inv_sqrt3', [['H1-H0', 'X2-X1'], ['H2-H0', 'X3-X2'], ['H3-H0', 'X1-X3']]),
  group('Dy1', 11, 'sqrt3', [['H1-(H3-H2)', 'X1-X2'], ['H2-(H1-H3)', 'X2-X3'], ['H3-(H2-H1)', 'X3-X1']], SHORT_HV),
  group('Dyn5', 12, 'sqrt3', [['H1-H3', 'X3-X0'], ['H2-H1', 'X1-X0'], ['H3-H2', 'X2-X0']]),
  group('Dy5', 13, 'sqrt3', [['H1-(H3-H2)', 'X3-X1'], ['H2-(H1-H3)', 'X1-X2'], ['H3-(H2-H1)', 'X2-X3']], SHORT_HV),
  group('Dy7', 14, 'sqrt3', [['H1-(H3-H2)', 'X2-X1'], ['H2-(H1-H3)', 'X3-X2'], ['H3-(H2-H1)', 'X1-X3']], SHORT_HV),
  group('Dyn11', 15, 'sqrt3', [['H1-H3', 'X0-X3'], ['H2-H1', 'X0-X1'], ['H3-H2', 'X0-X2']]),
  group('Dy11', 16, 'sqrt3', [['H1-(H3-H2)', 'X1-X3'], ['H2-(H1-H3)', 'X2-X1'], ['H3-(H2-H1)', 'X3-X2']], SHORT_HV),
  group('Dz0', 17, '1', [['H1-H3', 'X1-X3'], ['H2-H1', 'X2-X1'], ['H3-H2', 'X3-X2']]),
  group('Dz6', 18, '1', [['H1-H3', 'X3-X1'], ['H2-H1', 'X1-X2'], ['H3-H2', 'X2-X3']]),
  group('YNy0', 19, '1', [['H1-(H2-H0)', 'X1-X3'], ['H2-(H3-H0)', 'X2-X1'], ['H3-(H1-H0)', 'X3-X2']], SHORT_NEUTRAL),
  group('Yyn0', 20, '1', [['H1-H3', 'X1-X3'], ['H2-H1', 'X2-X1'], ['H3-H2', 'X3-X2']]),
  group('Yy0', 21, '1', [['H1-H3', 'X1-X3'], ['H2-H1', 'X2-X1'], ['H3-H2', 'X3-X2']]),
  group('YNy6', 22, '1', [['H1-(H2-H0)', 'X3-X1'], ['H2-(H3-H0)', 'X1-X2'], ['H3-(H1-H0)', 'X2-X3']], SHORT_NEUTRAL),
  group('Yyn6', 23, '1', [['H1-H3', 'X3-X1'], ['H2-H1', 'X1-X2'], ['H3-H2', 'X2-X3']]),
  group('Yy6', 24, '1', [['H1-H3', 'X3-X1'], ['H2-H1', 'X1-X2'], ['H3-H2', 'X2-X3']]),
  group('Yzn1', 25, 'sqrt3', [['H1-H3', 'X1-X0'], ['H2-H1', 'X2-X0'], ['H3-H2', 'X3-X0']]),
  group('Yz1', 26, 'sqrt3_half', [['H1-(H3+H2)', 'X1-X2'], ['H2-(H1+H3)', 'X2-X3'], ['H3-(H2+H1)', 'X3-X1']], SHORT_HV),
  group('Yzn5', 27, 'sqrt3', [['H1-H3', 'X3-X0'], ['H2-H1', 'X1-X0'], ['H3-H2', 'X2-X0']]),
  group('Yz5', 28, 'sqrt3_half', [['H1-(H3+H2)', 'X3-X1'], ['H2-(H1+H3)', 'X1-X2'], ['H3-(H2+H1)', 'X2-X3']], SHORT_HV),
  group('Yzn7', 29, 'sqrt3', [['H1-H3', 'X0-X1'], ['H2-H1', 'X0-X2'], ['H3-H2', 'X0-X3']]),
  group('Yz7', 30, 'sqrt3_half', [['H1-(H3+H2)', 'X2-X1'], ['H2-(H1+H3)', 'X3-X2'], ['H3-(H2+H1)', 'X1-X3']], SHORT_HV),
  group('Yzn11', 31, 'sqrt3', [['H1-H3', 'X0-X3'], ['H2-H1', 'X0-X1'], ['H3-H2', 'X0-X2']]),
  group('Yz11', 32, 'sqrt3_half', [['H1-(H3+H2)', 'X1-X3'], ['H2-(H1+H3)', 'X2-X1'], ['H3-(H2+H1)', 'X3-X2']], SHORT_HV),
  group('ZNy5', 33, 'inv_sqrt3', [['H1-H0', 'X3-X1'], ['H2-H0', 'X1-X2'], ['H3-H0', 'X2-X3']]),
  group('Zy5', 34, 'sqrt3_half', [['H1-(H3+H2)', 'X3-X1'], ['H2-(H1+H3)', 'X1-X2'], ['H3-(H2+H1)', 'X2-X3']], SHORT_HV),
  group('ZNy11', 35, 'inv_sqrt3', [['H1-H0', 'X1-X3'], ['H2-H0', 'X2-X1'], ['H3-H0', 'X3-X2']]),
  group('Zy11', 36, 'sqrt3_half', [['H1-(H3+H2)', 'X1-X3'], ['H2-(H1+H3)', 'X2-X1'], ['H3-(H2+H1)', 'X3-X2']], SHORT_HV),
  group('Yd1', 37, 'sqrt3_half', [['H1-(H3+H2)', 'X1-X2'], ['H2-(H1+H3)', 'X2-X3'], ['H3-(H2+H1)', 'X3-X1']], SHORT_HV),
  group('YNd5', 38, 'inv_sqrt3', [['H1-H0', 'X3-X1'], ['H2-H0', 'X1-X2'], ['H3-H0', 'X2-X3']]),
  group('Yd5', 39, 'sqrt3_half', [['H1-(H3+H2)', 'X3-X1'], ['H2-(H1+H3)', 'X1-X2'], ['H3-(H2+H1)', 'X2-X3']], SHORT_HV),
  group('Yd7', 40, 'sqrt3_half', [['H1-(H3+H2)', 'X2-X1'], ['H2-(H1+H3)', 'X3-X2'], ['H3-(H2+H1)', 'X1-X3']], SHORT_HV),
  group('YNd11', 41, 'inv_sqrt3', [['H1-H0', 'X1-X3'], ['H2-H0', 'X2-X1'], ['H3-H0', 'X3-X2']]),
  group('Yd11', 42, 'sqrt3_half', [['H1-(H3+H2)', 'X1-X3'], ['H2-(H1+H3)', 'X2-X1'], ['H3-(H2+H1)', 'X3-X2']], SHORT_HV),
  // Flagged for Bruno (research note): Dyn3, Dy3, Dyn9 and Dy9 as transcribed.
  group('Dyn3', 44, 'inv_sqrt3', [['H3-H1', 'X2-X0'], ['H1-H2', 'X3-X0'], ['H2-H3', 'X1-X0']]),
  group('Dy3', 45, 'two_inv_sqrt3', [['H1-(H3+H2)', 'X3-X2'], ['H2-(H1+H3)', 'X1-X3'], ['H3-(H2+H1)', 'X2-X1']], SHORT_HV),
  group('Dyn9', 46, 'inv_sqrt3', [['H1-H3', 'X2-X0'], ['H2-H1', 'X3-X0'], ['H3-H2', 'X1-X0']]),
  group('Dy9', 47, 'two_inv_sqrt3', [['H1-(H3+H2)', 'X2-X3'], ['H2-(H1+H3)', 'X3-X1'], ['H3-(H2+H1)', 'X1-X2']], SHORT_HV),
  group('YNzn1', 48, 'sqrt3', [['H1-H3', 'X1-X0'], ['H2-H1', 'X2-X0'], ['H3-H2', 'X3-X0']]),
  group('YNzn7', 49, 'sqrt3', [['H1-H3', 'X0-X1'], ['H2-H1', 'X0-X2'], ['H3-H2', 'X0-X3']]),
  group('YNzn11', 50, 'sqrt3', [['H1-H3', 'X0-X3'], ['H2-H1', 'X0-X1'], ['H3-H2', 'X0-X2']]),
]);

/** The 47 codes in the manual's order: the options of the v11 LIGAÇÃO SECUNDÁRIA select. */
export const VECTOR_GROUP_CODES: readonly string[] = Object.freeze(VECTOR_GROUPS.map((entry) => entry.code));

/** The group the ratio evaluates with when a v9/v10 LIGAÇÃO SECUNDÁRIA does not parse (Story 15.6's fixed √3). */
export const DEFAULT_VECTOR_GROUP_CODE = 'Dyn1';

const BY_CODE = new Map(VECTOR_GROUPS.map((entry) => [entry.code, entry]));

/** One group by its exact canonical code, or null. */
export function vectorGroupByCode(code: string): VectorGroup | null {
  return BY_CODE.get(code) ?? null;
}

/** The high-voltage connections, longest first so "YN" is tried before "Y". */
const HV_LETTERS = ['YN', 'ZN', 'D', 'Y', 'Z'] as const;
/** The low-voltage connections, longest first. */
const LV_LETTERS = ['YN', 'ZN', 'D', 'Y', 'Z'] as const;
const CLOCK = /^(?:[0-9]|1[01])$/;
/** What the parser ignores: every character that is not a letter or a digit (spaces, slashes, hyphens, dots, brackets, commas). */
const IGNORED = /[^\p{L}\p{N}]/gu;
/** e21a: one upper-case I or lower-case l closing the text right after a connection letter (Y, N, D, Z in either case): a plate's clock 1. */
const LETTER_CLOCK_ONE = /(?<=[YNDZyndz])[Il]$/;

/**
 * The vector group a LIGAÇÃO SECUNDÁRIA text names, or null. Case and every character that is not
 * a letter or a digit are ignored ("DYN1", "Dyn 1", "D/yn1", "dyn-1", "(Dyn1)", "Dyn1," read Dyn1;
 * "LIG:Dyn1" keeps letters in front and reads null). The
 * high-voltage letters are read greedily but must leave a valid low-voltage connection and clock
 * ("YNyn0" is YN + yn + 0, never Y + "Nyn0"); a clock the table has no row for, letters left
 * over, an empty text, "Y" or "DYN" read null.
 *
 * e21a: a real plate prints "Dyn I" (the letter I for the digit 1). A single trailing upper-case I or
 * lower-case l right after a connection letter reads as clock 1 ("Dyn I", "Dynl", "YNd l" read
 * Dyn1, Dyn1, YNd1). No connection letter is I or l, so every such text read null before; the rule
 * maps only to clock 1, never 10 or 11 ("Dyn II", "Dyn 1I", "Dyn lI" stay null), and a lower-case i
 * or an upper-case L stays null.
 */
export function parseVectorGroup(text: unknown): VectorGroup | null {
  if (typeof text !== 'string') return null;
  const compact = text.replace(IGNORED, '').replace(LETTER_CLOCK_ONE, '1').toUpperCase();
  if (compact === '') return null;
  for (const hv of HV_LETTERS) {
    if (!compact.startsWith(hv)) continue;
    const afterHv = compact.slice(hv.length);
    for (const lv of LV_LETTERS) {
      if (!afterHv.startsWith(lv)) continue;
      const clock = afterHv.slice(lv.length);
      if (!CLOCK.test(clock)) continue;
      const found = BY_CODE.get(`${hv}${lv.toLowerCase()}${clock}`);
      if (found !== undefined) return found;
    }
  }
  return null;
}

/** e21f: the shape a winding's vector diagram draws: three arms from one centre, a closed triangle, or a star whose arms bend. */
export type WindingShape = 'star' | 'delta' | 'zigzag';

/**
 * e21f: what a plate's drawn vector diagrams show, as the plate reading describes them (never the
 * code itself): each winding's shape, whether its neutral (H0, X0) is printed at its centre, and
 * the clock hour X1 points to with H1 at 12 o'clock.
 */
export interface VectorDiagramFacts {
  hv_shape: WindingShape;
  hv_neutral: boolean;
  lv_shape: WindingShape;
  lv_neutral: boolean;
  x1_hours: number;
}

const HV_SHAPE_LETTER: Readonly<Record<WindingShape, string>> = { star: 'Y', delta: 'D', zigzag: 'Z' };

/** One winding's letters (upper case): the shape's letter, plus N for a drawn neutral on a star or zigzag; null for a delta with a neutral or an unknown shape. */
function windingLetters(shape: unknown, neutral: unknown): string | null {
  if (typeof shape !== 'string' || !Object.hasOwn(HV_SHAPE_LETTER, shape) || typeof neutral !== 'boolean') return null;
  const letter = HV_SHAPE_LETTER[shape as WindingShape];
  if (!neutral) return letter;
  return letter === 'D' ? null : `${letter}N`;
}

/**
 * e21f (Story 21.2 fix): the vector group code the drawn diagrams compose: the high-voltage letter
 * (star Y, delta D, zigzag Z, N after a star or zigzag whose neutral is drawn), the low-voltage
 * letters in lower case the same way, then `x1_hours`. Null when the facts name no row of the
 * table: a delta with a neutral, an hour that is not an integer from 0 to 11, an unknown shape, or
 * a combination the 47 groups do not hold (star-star at 1 o'clock).
 */
export function composeVectorGroup(facts: VectorDiagramFacts): string | null {
  const hv = windingLetters(facts.hv_shape, facts.hv_neutral);
  const lv = windingLetters(facts.lv_shape, facts.lv_neutral);
  if (hv === null || lv === null) return null;
  const hours = facts.x1_hours;
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 0 || hours > 11) return null;
  const code = `${hv}${lv.toLowerCase()}${hours}`;
  return BY_CODE.has(code) ? code : null;
}

/** The multiplier of U1/U2 a factor names. */
export function vectorGroupFactor(k: VectorGroupFactor): number {
  switch (k) {
    case '1':
      return 1;
    case 'sqrt3':
      return Math.sqrt(3);
    case 'inv_sqrt3':
      return 1 / Math.sqrt(3);
    case 'sqrt3_half':
      return Math.sqrt(3) / 2;
    case 'two_inv_sqrt3':
      return 2 / Math.sqrt(3);
  }
}

// authored: Story 21.1, the formula of VAL CALCULADO by the group's factor, shown under the ratio table (never printed).
const FORMULA_TEXT: Readonly<Record<VectorGroupFactor, string>> = {
  '1': 'Calculado: U1 / U2',
  sqrt3: 'Calculado: U1 · √3 / U2',
  inv_sqrt3: 'Calculado: U1 / (U2 · √3)',
  sqrt3_half: 'Calculado: U1 · √3 / (2 · U2)',
  two_inv_sqrt3: 'Calculado: 2 · U1 / (√3 · U2)',
};

/** The formula helper of a group's factor ("Calculado: U1 · √3 / U2"). */
export function vectorGroupFormulaText(k: VectorGroupFactor): string {
  return FORMULA_TEXT[k];
}

/** The capture column label of one phase (0 = A): "H1-H3 / X1-X0", "H1-(H3+H2) / X1-X2". */
export function vectorGroupCaptureLabel(group: VectorGroup, phase: number): string | null {
  const found = group.phases[phase];
  return found === undefined ? null : `${found.h} / ${found.x}`;
}

/**
 * The windings to short-circuit, one per phase, on a group that shorts any:
 * "Curto-circuitar H3-H2 na fase A, H1-H3 na B e H2-H1 na C"; null on a group with no short.
 */
export function vectorGroupShortText(group: VectorGroup): string | null {
  const [a, b, c] = group.phases;
  if (a.short === null || b.short === null || c.short === null) return null;
  // authored: Story 21.1, the TTR short per phase, shown under the ratio table (never printed).
  return `Curto-circuitar ${a.short} na fase A, ${b.short} na B e ${c.short} na C`;
}

// authored: Story 21.1, the helper of a v11 ratio table whose LIGAÇÃO SECUNDÁRIA is empty.
export const VECTOR_GROUP_MISSING_TEXT = 'Informe a LIGAÇÃO SECUNDÁRIA na placa para calcular';
// authored: Story 21.1, the helper of a v9/v10 ratio table whose LIGAÇÃO SECUNDÁRIA names no group.
export const VECTOR_GROUP_UNRECOGNIZED_TEXT = 'Ligação não reconhecida: calculado como Dyn1';
// authored: e21g D2, the helper of a v9/v10 ratio table whose LIGAÇÃO SECUNDÁRIA is empty.
export const VECTOR_GROUP_EMPTY_TEXT = 'LIGAÇÃO SECUNDÁRIA vazia: calculado como Dyn1';

/**
 * e21g D1: the neutral capture column label of one phase (0 = A) while a v11 ratio table has no
 * vector group, so no terminal pair is shown before the group is known: "Fase 1".
 */
export function vectorGroupNeutralCaptureLabel(phase: number): string {
  // authored: e21g D1, the capture header of a v11 ratio table waiting for its group.
  return `Fase ${phase + 1}`;
}

/** Story 21.2: the nameplate field that holds the transformer's vector group. */
export const VECTOR_GROUP_FIELD = 'ligacao_secundaria';
/** Story 21.2: the block type whose LIGAÇÃO SECUNDÁRIA holds a vector group (TP and TC keep it as free text). */
export const VECTOR_GROUP_BLOCK_TYPE = 'transformador_forca';

/** Story 21.2: whether a nameplate field of a block type is the vector group (the transformador de força's LIGAÇÃO SECUNDÁRIA). */
export function isVectorGroupField(blockType: string, key: string): boolean {
  return blockType === VECTOR_GROUP_BLOCK_TYPE && key === VECTOR_GROUP_FIELD;
}

/** Whether a select's options are exactly the vector-group codes (the v11 LIGAÇÃO SECUNDÁRIA). */
export function isVectorGroupOptions(options: readonly string[] | undefined): boolean {
  return options !== undefined && options.length === VECTOR_GROUP_CODES.length && options.every((option, i) => option === VECTOR_GROUP_CODES[i]);
}
