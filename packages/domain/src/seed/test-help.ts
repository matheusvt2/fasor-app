import { z } from 'zod';

/*
 * Stories 23.10 and 23.11 (batch e23h, contract 37): the two optional text keys of a test
 * definition, in both grammars (`testDefSchema` and `measurementTestShape`), on a seed or a
 * company type:
 *
 * - `help`, "Como ensaiar": up to eight optional texts, shown on the sheet from the definition
 *   already on the device (so it opens offline) and never printed;
 * - `recommendation`, "Recomendação se reprovado": the text a `reading` derived point starts
 *   with (`points/derived.ts`), before the composed reference of the reading.
 *
 * Both are optional and never defaulted, so every seed parses to the bytes it shipped with. A
 * text is never trimmed or transformed here: the stored value is the op's raw value
 * (`ops/apply.ts`), and this schema only judges it on publish (at most `TEST_TEXT_MAX_LENGTH`
 * UTF-16 code units, never blank). This module imports only zod, so `seed/schema.ts` and
 * `seed/measurement.ts` both take it without a cycle.
 */

/** The eight headings of "Como ensaiar", in the DESIGN.md order: Objetivo · Instrumento · Tensão de ensaio · Ligações · Procedimento · Critério · Norma · Pré-requisito (NR-10). */
export const TEST_HELP_KEYS = ['objective', 'instrument', 'voltage', 'connections', 'procedure', 'criterion', 'standard', 'nr10'] as const;
export type TestHelpKey = (typeof TEST_HELP_KEYS)[number];

/**
 * The cap of one heading's text and of the recommendation: `TEXT_CAPS.medium` of
 * `ops/value-limits.ts` (a test pins the two equal; that module is not imported here, to keep the
 * seed schema free of the ops layer). It keeps a recommendation plus the composed reference of a
 * reading inside a point's `long` text cap.
 */
export const TEST_TEXT_MAX_LENGTH = 1000;

/** One text of a test definition: a string of at most the cap that is not blank, kept as written. */
const testTextSchema = z
  .string()
  .max(TEST_TEXT_MAX_LENGTH)
  .refine((value) => value.trim() !== '', { message: 'a test text is never blank' });

/** "Como ensaiar": each heading optional; an unknown key is refused. */
export const testHelpSchema = z.strictObject(Object.fromEntries(TEST_HELP_KEYS.map((key) => [key, testTextSchema.optional()])) as Record<TestHelpKey, z.ZodOptional<typeof testTextSchema>>);
export type TestHelp = Partial<Record<TestHelpKey, string>>;

/** "Recomendação se reprovado". */
export const testRecommendationSchema = testTextSchema;

/** What the helpers read of a definition: its tests in both grammars, each with its key and the two optional texts. */
interface TestTextsLike {
  key: string;
  help?: unknown;
  recommendation?: unknown;
}
interface DefinitionTextsLike {
  tests: readonly TestTextsLike[];
  measurement_tests?: readonly TestTextsLike[] | undefined;
}

const filled = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** The test of `testKey`, looked for in `tests` then in `measurement_tests`. */
function testOf(definition: DefinitionTextsLike, testKey: string): TestTextsLike | undefined {
  return definition.tests.find((test) => test.key === testKey) ?? definition.measurement_tests?.find((test) => test.key === testKey);
}

/** One filled heading of "Como ensaiar", in the fixed order. */
export interface TestHelpEntry {
  key: TestHelpKey;
  text: string;
}

/** The filled headings of a help, in the fixed order (`TEST_HELP_KEYS`); a heading with no text is left out. */
export function testHelpEntries(help: TestHelp | null | undefined): TestHelpEntry[] {
  if (help === null || help === undefined || typeof help !== 'object') return [];
  const out: TestHelpEntry[] = [];
  for (const key of TEST_HELP_KEYS) {
    const text: unknown = help[key];
    if (filled(text)) out.push({ key, text });
  }
  return out;
}

/** The help of a test with at least one filled heading; null when the test has none (no "Como ensaiar" on its head). */
export function testHelpOf(definition: DefinitionTextsLike, testKey: string): TestHelp | null {
  const help = testOf(definition, testKey)?.help;
  if (help === null || typeof help !== 'object' || Array.isArray(help)) return null;
  return testHelpEntries(help as TestHelp).length === 0 ? null : (help as TestHelp);
}

/**
 * The dialog's meta line: "Do tipo ⟨label⟩ · abre sem conexão · não sai no relatório", then
 * " · N de 8 tópicos preenchidos" unless all eight are filled.
 */
export function testHelpMetaText(typeLabel: string, filledCount: number): string {
  // authored (Story 23.1, `60-ficha.html` `#ficha-dlg-como-iso` and `#ficha-dlg-como-ttr`).
  const head = `Do tipo ${typeLabel} · abre sem conexão · não sai no relatório`;
  return filledCount >= TEST_HELP_KEYS.length ? head : `${head} · ${filledCount} de ${TEST_HELP_KEYS.length} tópicos preenchidos`;
}

/** The recommendation of a test, as written; null when the test has none (or a blank one). */
export function testRecommendationOf(definition: DefinitionTextsLike, testKey: string): string | null {
  const recommendation = testOf(definition, testKey)?.recommendation;
  return filled(recommendation) ? recommendation : null;
}

/**
 * A text already terminated: its last character before any closing quotes, parentheses or
 * brackets is ".", "!", "?", "…", ":" or ";" ("Trocar (urgente.)", "Ver manual:").
 */
const TERMINATED = /[.!?…:;]['"”’)\]]*$/;

/**
 * Story 23.11: a `reading` derived point's text with its test's recommendation first: the
 * recommendation (a period appended unless it is already terminated, `TERMINATED`), a space, then
 * the composed reference of the reading; the composed text alone, byte-equal, with no recommendation.
 */
export function recommendedPointText(recommendation: string | null, composed: string): string {
  const head = recommendation?.trim() ?? '';
  if (head === '') return composed;
  // authored (Story 23.11, open for Bruno): the join of the recommendation and the reading's reference.
  return `${TERMINATED.test(head) ? head : `${head}.`} ${composed}`;
}
