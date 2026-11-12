import { z } from 'zod';
import { isEquipmentBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import { findDefinition, SEED_VERSION, type DefinitionContext } from '../seed/definitions.ts';
import type { EquipmentTypeRow } from '../schemas/entities.ts';
import { BASE_TEXT_KEYS, TEST_BASE_REVISION_MAX_LENGTH, TEST_TEXT_MAX_LENGTH, type BaseTextKey, type TestHelp, type TestHelpKey } from '../seed/test-help.ts';
import { listPtBr, plural } from '../text/plural.ts';
import type { CompanyTypeDefinition } from './definition.ts';
import { duplicateSeededType, type TypeDuplicate } from './duplicate.ts';
import { typeNameOf } from './list.ts';
import { validateTypeDraft } from './validate.ts';

/*
 * Story 23.12 (batch e23x, Matheus's decision M-1 (b)): the base's "Como ensaiar" and
 * "Recomendação se reprovado" texts reach the app through a private import, never through git.
 * The office reads the base's JSON file on Modelos > Tipos de equipamento, and this planner turns
 * it into company type copies of the current seed's types ("Duplicar", `duplicateSeededType`):
 * one per base equipment and seeded type, each mapped test carrying its base row's texts, then
 * published as version 1. The web writes only the two existing company-scope creates
 * (`equipment_type/{id}`, `equipment_type_version/{id}`): no route, no op family, no contract.
 *
 * Rows map by base row ID (`TEST_BASE_ROW_TESTS`), equipment by base equipment ID
 * (`TEST_BASE_EQUIPMENT_TYPES`). A row attaches only where the mapped test key exists in the
 * seeded type's definition, so a test a later seed adds attaches by itself. The block types stay
 * strings checked at runtime (`isEquipmentBlockType`, `findDefinition`). The texts are kept as the
 * file has them; a value that is empty, blank or only a dash is the base's "no value" and is left
 * out; a text over the cap is never cut: the heading is left out and the row is listed as refused.
 * The import is idempotent: a copy whose name and seeded source the company already holds (not
 * removed) is listed as already imported and planned again only once discarded or renamed.
 *
 * Story 25.23 (contract 51): a held copy is brought to a newer revision by the update
 * (`types/test-base-update.ts`), never by a second import. From this story on each text the base
 * fills carries its record (`base_texts`: the file's revision and the text as given), and the IP
 * row's "Como ensaiar" fills the index's own (`index_help`).
 */

/** One row of the base's `ensaios`: an ID, its equipment (an equipment ID or `TODOS`), every text column optional. */
const testBaseRowSchema = z.looseObject({
  id: z.string(),
  equipamento: z.string(),
  ensaio: z.string().nullish(),
  objetivo: z.string().nullish(),
  instrumento: z.string().nullish(),
  tensao_corrente_ensaio: z.string().nullish(),
  pontos_medicao: z.string().nullish(),
  procedimento: z.string().nullish(),
  criterio_aprovado: z.string().nullish(),
  criterio_restricao: z.string().nullish(),
  criterio_reprovado: z.string().nullish(),
  norma: z.string().nullish(),
  recomendacao_reprovado: z.string().nullish(),
});
export type TestBaseRow = z.infer<typeof testBaseRowSchema>;

/** The base file: unknown keys pass; `ensaios` is required. */
export const testBaseFileSchema = z.looseObject({
  versao: z.string().optional(),
  ensaios: z.array(testBaseRowSchema),
});
export type TestBaseFile = z.infer<typeof testBaseFileSchema>;

/** Base equipment ID to the seeded block types it copies (strings: a type a later seed adds is checked at runtime). */
export const TEST_BASE_EQUIPMENT_TYPES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'TR-OL': ['transformador_forca'],
  'TR-SE': ['transformador_forca'],
  DJ: ['disjuntor_mt'],
  SC: ['chave_seccionadora'],
  TC: ['tc'],
  TP: ['tp'],
  PR: ['para_raio'],
  CB: ['cabos_entrada', 'cabos_saida'],
  AT: ['malha_aterramento'],
});

/** The equipment ID of the rows that apply to every equipment. */
export const TEST_BASE_ALL_EQUIPMENT = 'TODOS';

/** Base row ID to the test key it fills. */
export const TEST_BASE_ROW_TESTS: Readonly<Record<string, string>> = Object.freeze({
  'TR-OL-02': 'isolacao',
  'TR-SE-02': 'isolacao',
  'DJ-02': 'isolacao',
  'SC-02': 'isolacao',
  'TC-02': 'isolacao',
  'TP-02': 'isolacao',
  'PR-02': 'isolacao',
  'CB-02': 'isolacao',
  'TR-OL-04': 'relacao_transformacao',
  'TR-SE-04': 'relacao_transformacao',
  'TC-03': 'relacao_transformacao',
  'TP-03': 'relacao_transformacao',
  'DJ-03': 'resistencia_contato',
  'SC-03': 'resistencia_contato',
  'TR-OL-05': 'resistencia_enrolamento',
  'TR-SE-05': 'resistencia_enrolamento',
  'TR-OL-07': 'coleta_oleo',
  'DJ-07': 'coleta_oleo',
  'SC-04': 'resistencia_fusiveis',
  'AT-01': 'resistencia_malha',
  'AT-02': 'continuidade_malha',
  'GE-01': 'termografia',
});

/**
 * Fix batch e23z (W3-7): base row ID to the test whose polarization index it describes. The row attaches only to a
 * test carrying `polarization_index` (Story 23.16 judges the IP inside the insulation test), and fills that
 * test's `index_recommendation`: its "Como ensaiar" is not merged into the test's own (a narrowing). Story 25.23:
 * it fills the index's own "Como ensaiar" (`index_help`), shown under the index on the sheet.
 */
export const TEST_BASE_INDEX_ROWS: Readonly<Record<string, string>> = Object.freeze({
  'TR-OL-03': 'isolacao',
  'TR-SE-03': 'isolacao',
});

/** The base's "no value": absent, null, or made only of whitespace and dashes (-, –, —). */
function isNoValue(value: string | null | undefined): value is null | undefined {
  if (value === undefined || value === null) return true;
  return /^[\s\-–—]*$/u.test(value);
}

const present = (value: string | null | undefined): string | null => (isNoValue(value) ? null : value);

/** A file's text parsed and checked; the reason when it is not a base. */
export type TestBaseParse = { ok: true; file: TestBaseFile } | { ok: false; reason: 'json' | 'shape' };

/** The base file from its text: JSON, then the shape (`testBaseFileSchema`). */
export function parseTestBaseText(text: string): TestBaseParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  const parsed = testBaseFileSchema.safeParse(raw);
  return parsed.success ? { ok: true, file: parsed.data } : { ok: false, reason: 'shape' };
}

/**
 * "Como ensaiar" of a base row: objective, instrument, voltage, connections, procedure, the
 * criterion composed of the present levels ("Aprovado: …", "Com restrições: …", "Reprovado: …",
 * one per line) and the standard; NR-10 has no column. A value with no value is left out.
 */
export function testBaseHelpOf(row: TestBaseRow): TestHelp {
  const help: TestHelp = {};
  const set = (key: TestHelpKey, value: string | null | undefined) => {
    const text = present(value);
    if (text !== null) help[key] = text;
  };
  set('objective', row.objetivo);
  set('instrument', row.instrumento);
  set('voltage', row.tensao_corrente_ensaio);
  set('connections', row.pontos_medicao);
  set('procedure', row.procedimento);
  // authored (Story 23.12, listed for Bruno): the three levels of the composed criterion.
  const levels: [string, string | null | undefined][] = [
    ['Aprovado', row.criterio_aprovado],
    ['Com restrições', row.criterio_restricao],
    ['Reprovado', row.criterio_reprovado],
  ];
  const lines = levels.flatMap(([word, value]) => {
    const text = present(value);
    return text === null ? [] : [`${word}: ${text}`];
  });
  if (lines.length > 0) help.criterion = lines.join('\n');
  set('standard', row.norma);
  return help;
}

/** "Recomendação se reprovado" of a base row; null with no value. */
export function testBaseRecommendationOf(row: TestBaseRow): string | null {
  return present(row.recomendacao_reprovado);
}

/** One row attached to a copy. */
export interface TestBaseAttachedRow {
  rowId: string;
  testKey: string;
}

/** One copy the import creates. */
export interface TestBaseCopy {
  equipmentId: string;
  blockType: string;
  label: string;
  duplicate: TypeDuplicate;
  /** The draft passes `validateTypeDraft`: the copy is published as version 1; else it stays a draft. */
  publishable: boolean;
  rows: TestBaseAttachedRow[];
}

/** What the import would do. */
export interface TestBaseImportPlan {
  copies: TestBaseCopy[];
  /** Labels of the copies the company already holds. */
  alreadyImported: string[];
  /** Row IDs that attach to no copy (no test in the app, or no copy for their equipment). */
  unattached: string[];
  /** Row IDs of planned copies with a text over the cap, left out. */
  refused: string[];
}

/** A row's texts within the cap; `refused` when a text was left out for its length. */
function rowTexts(row: TestBaseRow): { help: TestHelp; recommendation: string | null; refused: boolean } {
  let refused = false;
  const help: TestHelp = {};
  for (const [key, text] of Object.entries(testBaseHelpOf(row)) as [TestHelpKey, string][]) {
    if (text.length > TEST_TEXT_MAX_LENGTH) refused = true;
    else help[key] = text;
  }
  let recommendation = testBaseRecommendationOf(row);
  if (recommendation !== null && recommendation.length > TEST_TEXT_MAX_LENGTH) {
    refused = true;
    recommendation = null;
  }
  return { help, recommendation, refused };
}

interface TestLike {
  key: string;
  help?: unknown;
  recommendation?: unknown;
  index_recommendation?: unknown;
  index_help?: unknown;
  polarization_index?: unknown;
  base_texts?: unknown;
}

/** The draft's test of `key`, in `tests` then `measurement_tests`; null when the type has none. */
function draftTest(draft: CompanyTypeDefinition, key: string): TestLike | null {
  const tests = draft.tests as unknown as TestLike[];
  const measurement = (draft.measurement_tests ?? []) as unknown as TestLike[];
  return tests.find((test) => test.key === key) ?? measurement.find((test) => test.key === key) ?? null;
}

/** The test keys a seeded definition carries in both grammars. */
function testKeysOf(definition: { tests: readonly { key: string }[]; measurement_tests?: readonly { key: string }[] | undefined }): Set<string> {
  return new Set([...definition.tests.map((test) => test.key), ...(definition.measurement_tests ?? []).map((test) => test.key)]);
}

/** Fix batch e23z (W3-7): the seeded-grammar test keys that judge a polarization index. */
function indexTestKeysOf(definition: { tests: readonly { key: string; polarization_index?: unknown }[] }): Set<string> {
  return new Set(definition.tests.filter((test) => test.polarization_index !== undefined).map((test) => test.key));
}

/**
 * Whether the company already holds this copy: a non-removed type of the same seeded source and name.
 * Story 25.23: the first such type, which the update updates; null when the company holds none.
 */
export function heldTestBaseType(ctx: DefinitionContext, blockType: string, label: string): EquipmentTypeRow | null {
  for (const type of ctx.types.values()) {
    if (type.removed_at !== null) continue;
    const from = type.derived_from;
    if (from === null || !('block_type' in from) || from.block_type !== blockType) continue;
    if (typeNameOf(type, ctx) === label) return type;
  }
  return null;
}

/** Story 25.23: what the base gives one test, each text within the cap (a text over it is left out). */
export interface BaseTestTexts {
  help?: TestHelp;
  recommendation?: string;
  /** The polarization index's own "Como ensaiar" and its recommendation (the base's IP row). */
  index_help?: TestHelp;
  index_recommendation?: string;
}

/** One base equipment over one seeded type: its label, the rows that attach and the texts they give each test. */
export interface TestBaseTypeRows {
  equipmentId: string;
  blockType: EquipmentBlockType;
  label: string;
  /** The rows that attach, the equipment's own then the TODOS rows, each with the test it fills. */
  rows: TestBaseAttachedRow[];
  /** By test key. */
  texts: Map<string, BaseTestTexts>;
  /** Row IDs with a text over the cap, left out. */
  refused: Set<string>;
}

/**
 * The base's equipment over the seeded types of `seedVersion`: one entry per base equipment and
 * seeded type with at least one attached row of its own, and the row IDs that attach to none.
 * Story 25.23: the import's loop, shared with the update.
 */
export function testBaseTypesOf(file: TestBaseFile, seedVersion: string = SEED_VERSION): { types: TestBaseTypeRows[]; unattached: string[] } {
  const types: TestBaseTypeRows[] = [];
  const attached = new Set<string>();
  const allRows = file.ensaios.filter((row) => row.equipamento === TEST_BASE_ALL_EQUIPMENT);
  for (const [equipmentId, blockTypes] of Object.entries(TEST_BASE_EQUIPMENT_TYPES)) {
    const ownRows = file.ensaios.filter((row) => row.equipamento === equipmentId);
    if (ownRows.length === 0) continue;
    for (const blockType of blockTypes) {
      if (!isEquipmentBlockType(blockType)) continue;
      const definition = findDefinition(seedVersion, blockType);
      if (definition === null) continue;
      const keys = testKeysOf(definition);
      const indexKeys = indexTestKeysOf(definition);
      // Fix batch e23z (W3-7): an IP row attaches to the test judging the index.
      const indexKey = (row: TestBaseRow): string | null => {
        const key = TEST_BASE_INDEX_ROWS[row.id];
        return key !== undefined && indexKeys.has(key) ? key : null;
      };
      const attaches = (row: TestBaseRow) => {
        const key = TEST_BASE_ROW_TESTS[row.id];
        return (key !== undefined && keys.has(key)) || indexKey(row) !== null;
      };
      const own = ownRows.filter(attaches);
      if (own.length === 0) continue;
      const texts = new Map<string, BaseTestTexts>();
      const refused = new Set<string>();
      const placed: TestBaseAttachedRow[] = [];
      for (const row of [...own, ...allRows.filter(attaches)]) {
        attached.add(row.id);
        const index = indexKey(row);
        const testKey = index ?? TEST_BASE_ROW_TESTS[row.id]!;
        const one = rowTexts(row);
        if (one.refused) refused.add(row.id);
        const entry = texts.get(testKey) ?? {};
        const hasHelp = Object.keys(one.help).length > 0;
        if (index !== null) {
          // Story 25.23: the IP row's "Como ensaiar" is the index's own; its recommendation as fix batch e23z placed it.
          if (hasHelp) entry.index_help = one.help;
          if (one.recommendation !== null) entry.index_recommendation = one.recommendation;
        } else {
          if (hasHelp) entry.help = one.help;
          if (one.recommendation !== null) entry.recommendation = one.recommendation;
        }
        texts.set(testKey, entry);
        placed.push({ rowId: row.id, testKey });
      }
      types.push({ equipmentId, blockType, label: `${definition.label} (${equipmentId})`, rows: placed, texts, refused });
    }
  }
  const unattached = [...new Set(file.ensaios.map((row) => row.id))].filter((id) => !attached.has(id));
  return { types, unattached };
}

/** Story 25.23: the file's revision as a record keeps it: its `versao`; null when absent, blank or longer than the cap. */
export function testBaseRevisionOf(file: TestBaseFile): string | null {
  const name = file.versao;
  return name === undefined || name.trim() === '' || name.length > TEST_BASE_REVISION_MAX_LENGTH ? null : name;
}

/** Story 25.23: the base's texts written on a test, each with its record in `base_texts` (merged into any record the test holds). */
export function placeBaseTexts(test: { [key: string]: unknown }, texts: BaseTestTexts, revision: string | null, only: readonly BaseTextKey[] = BASE_TEXT_KEYS): void {
  const held = test.base_texts !== null && typeof test.base_texts === 'object' && !Array.isArray(test.base_texts) ? (test.base_texts as Record<string, unknown>) : {};
  const record: Record<string, unknown> = { ...held };
  for (const key of only) {
    const value = texts[key];
    if (value === undefined) continue;
    test[key] = structuredClone(value);
    record[key] = { revision, value: structuredClone(value) };
  }
  if (Object.keys(record).length > 0) test.base_texts = record;
}

/** A copy of the seeded type of `rows` with the base's texts on its tests, as the import plans it. */
export function testBaseCopyOf(rows: TestBaseTypeRows, revision: string | null, seedVersion: string = SEED_VERSION): TestBaseCopy {
  const duplicate = duplicateSeededType(seedVersion, rows.blockType);
  duplicate.draft.label = rows.label;
  for (const [testKey, texts] of rows.texts) {
    const test = draftTest(duplicate.draft, testKey);
    if (test !== null) placeBaseTexts(test as unknown as { [key: string]: unknown }, texts, revision);
  }
  return { equipmentId: rows.equipmentId, blockType: rows.blockType, label: rows.label, duplicate, publishable: validateTypeDraft(duplicate.draft).length === 0, rows: rows.rows };
}

/**
 * The import's plan over the company's types: the copies to create, those already held, the rows left out.
 * Story 25.23: each text the base fills carries its record (`base_texts`), and the IP row's "Como ensaiar"
 * lands on the index (`index_help`).
 */
export function planTestBaseImport(file: TestBaseFile, ctx: DefinitionContext, seedVersion: string = SEED_VERSION): TestBaseImportPlan {
  const copies: TestBaseCopy[] = [];
  const alreadyImported: string[] = [];
  const refused = new Set<string>();
  const revision = testBaseRevisionOf(file);
  const { types, unattached } = testBaseTypesOf(file, seedVersion);
  for (const rows of types) {
    if (heldTestBaseType(ctx, rows.blockType, rows.label) !== null) {
      alreadyImported.push(rows.label);
      continue;
    }
    for (const id of rows.refused) refused.add(id);
    copies.push(testBaseCopyOf(rows, revision, seedVersion));
  }
  return { copies, alreadyImported, unattached, refused: [...refused] };
}

// --- derived text ------------------------------------------------------------------------------

/** The import's preview, one sentence per line (the dialog renders each line as a paragraph). */
export function testBaseImportPreviewText(plan: TestBaseImportPlan): string {
  const lines: string[] = [];
  if (plan.copies.length === 0 && plan.alreadyImported.length === 0) {
    // authored (Story 23.12, listed for Bruno): no row of the file attaches to a test of the app.
    lines.push('Nenhum ensaio desta base tem ensaio correspondente no app. Nada será gravado.');
  } else if (plan.copies.length === 0) {
    // authored (Story 23.12, listed for Bruno): nothing left to import.
    lines.push('Todos os tipos desta base já foram importados. Nada será gravado.');
  } else {
    const tests = plan.copies.reduce((n, copy) => n + copy.rows.length, 0);
    // authored (Story 23.12, listed for Bruno): what the import creates.
    lines.push(`Cria ${plural(plan.copies.length, 'tipo da empresa', 'tipos da empresa')}, com os textos de ${plural(tests, 'ensaio', 'ensaios')}: ${listPtBr(plan.copies.map((copy) => copy.label))}.`);
    const drafts = plan.copies.filter((copy) => !copy.publishable).map((copy) => copy.label);
    // authored (Story 23.12, listed for Bruno): copies created as drafts only.
    if (drafts.length > 0) lines.push(`Ficam como rascunho, com avisos para publicar: ${listPtBr(drafts)}.`);
    if (plan.alreadyImported.length > 0) lines.push(`Já importado: ${listPtBr(plan.alreadyImported)}.`);
  }
  lines.push(...testBaseLeftOutLines(plan.unattached, plan.refused));
  return lines.join('\n');
}

/** The rows a plan leaves out, one line each (the import's and the update's preview end with them). */
export function testBaseLeftOutLines(unattached: readonly string[], refused: readonly string[]): string[] {
  const lines: string[] = [];
  // authored (Story 23.12, listed for Bruno): rows the import leaves out.
  if (unattached.length > 0) lines.push(`Sem ensaio no app: ${listPtBr(unattached)}.`);
  if (refused.length > 0) lines.push(`Texto acima de ${TEST_TEXT_MAX_LENGTH} caracteres, deixado de fora: ${listPtBr(refused)}.`);
  return lines;
}

/** The toast after the import: "9 tipos importados". */
export function testBaseImportedText(n: number): string {
  // authored (Story 23.12, listed for Bruno).
  return `${plural(n, 'tipo importado', 'tipos importados')} da base de ensaios`;
}

/** The line under the action when the file is not a base. */
export function testBaseInvalidText(reason?: 'json' | 'shape'): string {
  // authored (Story 23.12, listed for Bruno).
  const head = 'Este arquivo não é uma base de ensaios';
  if (reason === 'json') return `${head}: o JSON não pôde ser lido. Nada foi gravado.`;
  if (reason === 'shape') return `${head}: falta a lista "ensaios" com o id e o equipamento de cada linha. Nada foi gravado.`;
  return `${head}. Nada foi gravado.`;
}
