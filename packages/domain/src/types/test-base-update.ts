import type { EquipmentTypeRow } from '../schemas/entities.ts';
import { findDefinition, SEED_VERSION, type DefinitionContext } from '../seed/definitions.ts';
import { BASE_TEXT_KEYS, testHelpEntries, type BaseTextKey, type TestHelp } from '../seed/test-help.ts';
import { listPtBr, plural } from '../text/plural.ts';
import type { CompanyTypeDraft } from './definition.ts';
import { duplicateSeededType } from './duplicate.ts';
import { latestVersionRow, typeNameOf } from './list.ts';
import {
  heldTestBaseType,
  placeBaseTexts,
  testBaseCopyOf,
  testBaseLeftOutLines,
  testBaseRevisionOf,
  testBaseTypesOf,
  type BaseTestTexts,
  type TestBaseCopy,
  type TestBaseFile,
  type TestBaseTypeRows,
} from './test-base-import.ts';

/*
 * Story 25.23 (M27; Bruno's answers 7 and 10 of 2026-11-11; contract 51): "Atualizar base de
 * ensaios". A company that imported the test base applies a newer revision of the same file format
 * over what it holds. The planner reads the same rows as the import (`testBaseTypesOf`) and, for
 * each base equipment and seeded type:
 *
 * - a type the company does not hold is created as the import plans it (`testBaseCopyOf`), as a
 *   draft: the update never publishes;
 * - a held type (`heldTestBaseType`: same seeded source and name) gets a new draft built over its
 *   open draft, else its latest published version, with
 *   - each test the current seed's type has and the held type lacks, with the base's texts, unless
 *     the seed the type was copied from already had it (the office removed it: never re-added);
 *   - each text the held test lacks (and never received from the base), filled;
 *   - each text nobody edited since the base filled it (equal to its record in `base_texts`),
 *     replaced by the newer revision's by itself;
 *   - each text the office edited (or a type imported before this story holds with no record) that
 *     differs from the base's, listed for the office to choose; kept unless it chooses the base's.
 *     An edited text the base did not change since its record is neither listed nor replaced.
 *
 * Every text the base fills or the office kept over it records the newer revision, so the next
 * update replaces by itself only what nobody edited. A criterion is never touched: an added test
 * brings the criteria rows it names that the type lacks, and nothing else. No published version and
 * no placed sheet changes: a sheet keeps the version of the type it was created with.
 */

type Entry = Record<string, unknown>;

/** A text the preview names, by its test and its key. */
export interface TestBaseTextRef {
  testKey: string;
  text: BaseTextKey;
}

/** A text the office edited (or holds with no record) that the newer revision gives differently. */
export interface TestBaseTextDiff extends TestBaseTextRef {
  /** `{typeId}/{testKey}/{text}`: the key of the office's choice. */
  id: string;
  typeId: string;
  typeLabel: string;
  testLabel: string;
  /** The base's text, written when the office chooses it. */
  base: TestHelp | string;
}

/** What the update does to one held type. */
export interface TestBaseTypeUpdate {
  typeId: string;
  label: string;
  /** The type's next draft with every change made by itself, before the office's choices. */
  draft: CompanyTypeDraft;
  /** Test keys added from the current seed's type. */
  added: string[];
  /** Texts the held test lacked, filled. */
  filled: TestBaseTextRef[];
  /** Texts nobody edited since the last update, replaced. */
  replaced: TestBaseTextRef[];
  /** Texts the office chooses for. */
  differing: TestBaseTextDiff[];
}

/** The update's plan. */
export interface TestBaseUpdatePlan {
  revision: string | null;
  /** How many base equipment and seeded types the file reaches (zero: no row has a test in the app). */
  matched: number;
  /** The held types with anything to add, replace or choose; a type the revision leaves as it is is not listed. */
  updates: TestBaseTypeUpdate[];
  /** The types the company does not hold, planned as the import plans them, created as drafts. */
  creates: TestBaseCopy[];
  unattached: string[];
  refused: string[];
}

const isObject = (value: unknown): value is Entry => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Whether a held text is empty: absent, blank, or a help with no filled heading. */
function isEmptyText(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return isObject(value) ? testHelpEntries(value as TestHelp).length === 0 : true;
}

/** Two texts read the same: a string as written, a help by its filled headings in the fixed order. */
function sameText(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (!isObject(a) || !isObject(b)) return isEmptyText(a) && isEmptyText(b);
  return JSON.stringify(testHelpEntries(a as TestHelp)) === JSON.stringify(testHelpEntries(b as TestHelp));
}

const listOf = (draft: Entry, part: 'tests' | 'measurement_tests' | 'criteria'): Entry[] => (Array.isArray(draft[part]) ? (draft[part] as unknown[]).filter(isObject) : []);

function testIn(draft: Entry, key: string): Entry | null {
  return listOf(draft, 'tests').find((test) => test.key === key) ?? listOf(draft, 'measurement_tests').find((test) => test.key === key) ?? null;
}

/** The criteria rows a test names: a seeded-grammar test's `criterion_key`, a measurement criterion's `seeded`. */
function criteriaNamedBy(test: Entry): string[] {
  const keys: string[] = [];
  if (typeof test.criterion_key === 'string') keys.push(test.criterion_key);
  for (const criterion of Array.isArray(test.criteria) ? (test.criteria as unknown[]).filter(isObject) : []) {
    if (criterion.type === 'absolute' && typeof criterion.seeded === 'string') keys.push(criterion.seeded);
  }
  return keys;
}

/**
 * The tests the current seed's type has and the held draft lacks, inserted after the nearest earlier test of
 * the seed the draft holds (else first), with the criteria rows they name; a test the seed the type was copied
 * from already had is the office's removal and is never re-added.
 */
function addSeedTests(draft: Entry, type: EquipmentTypeRow, rows: TestBaseTypeRows, seedVersion: string): string[] {
  const seed = duplicateSeededType(seedVersion, rows.blockType).draft as unknown as Entry;
  const from = type.derived_from;
  const original = from !== null && 'seed_version' in from ? findDefinition(from.seed_version, rows.blockType) : null;
  const originalKeys = new Set(original === null ? [] : [...original.tests, ...(original.measurement_tests ?? [])].map((test) => test.key));
  const added: string[] = [];
  for (const part of ['tests', 'measurement_tests'] as const) {
    const seedTests = listOf(seed, part);
    if (seedTests.length === 0) continue;
    const held = listOf(draft, part);
    let changed = false;
    seedTests.forEach((test, i) => {
      if (held.some((one) => one.key === test.key) || testIn(draft, test.key as string) !== null || originalKeys.has(test.key as string)) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = held.findIndex((one) => one.key === seedTests[j]!.key);
        if (k !== -1) {
          at = k + 1;
          break;
        }
      }
      held.splice(at, 0, structuredClone(test));
      added.push(test.key as string);
      changed = true;
    });
    if (changed) draft[part] = held;
  }
  if (added.length > 0) {
    const criteria = listOf(draft, 'criteria');
    const have = new Set(criteria.map((row) => row.key));
    for (const key of added.flatMap((testKey) => criteriaNamedBy(testIn(draft, testKey)!))) {
      if (have.has(key)) continue;
      const row = listOf(seed, 'criteria').find((one) => one.key === key);
      if (row === undefined) continue;
      criteria.push(structuredClone(row));
      have.add(key);
    }
    draft.criteria = criteria;
  }
  return added;
}

/** The held type's next draft before the update: its open draft, else its latest published definition; null when it holds neither. */
function heldDefinition(ctx: DefinitionContext, type: EquipmentTypeRow): Entry | null {
  if (type.draft !== null) return structuredClone(type.draft) as unknown as Entry;
  const latest = latestVersionRow(ctx, type.id);
  return latest === null ? null : (structuredClone(latest.definition) as unknown as Entry);
}

function updateOf(ctx: DefinitionContext, type: EquipmentTypeRow, rows: TestBaseTypeRows, revision: string | null, seedVersion: string): TestBaseTypeUpdate | null {
  const draft = heldDefinition(ctx, type);
  if (draft === null) return null;
  const label = typeNameOf(type, ctx);
  const added = addSeedTests(draft, type, rows, seedVersion);
  const filled: TestBaseTextRef[] = [];
  const replaced: TestBaseTextRef[] = [];
  const differing: TestBaseTextDiff[] = [];
  for (const [testKey, texts] of rows.texts) {
    const test = testIn(draft, testKey);
    if (test === null) continue;
    if (added.includes(testKey)) {
      placeBaseTexts(test, texts, revision);
      continue;
    }
    const record = isObject(test.base_texts) ? test.base_texts : {};
    const write: BaseTextKey[] = [];
    const recordOnly: BaseTextKey[] = [];
    for (const key of BASE_TEXT_KEYS) {
      const base = texts[key];
      if (base === undefined) continue;
      const held = test[key];
      const entry = record[key];
      const recorded = isObject(entry) && 'value' in entry ? entry.value : undefined;
      if (recorded === undefined && isEmptyText(held)) {
        write.push(key);
        filled.push({ testKey, text: key });
      } else if (sameText(held, base)) {
        recordOnly.push(key);
      } else if (recorded !== undefined && sameText(held, recorded)) {
        write.push(key);
        replaced.push({ testKey, text: key });
      } else if (recorded !== undefined && sameText(base, recorded)) {
        // Edited by the office, and the base did not change it since: neither listed nor replaced.
      } else {
        recordOnly.push(key);
        differing.push({ id: `${type.id}/${testKey}/${key}`, typeId: type.id, typeLabel: label, testKey, testLabel: typeof test.label === 'string' ? test.label : testKey, text: key, base: structuredClone(base) });
      }
    }
    placeBaseTexts(test, texts, revision, write);
    if (recordOnly.length > 0) {
      const next: Entry = isObject(test.base_texts) ? { ...test.base_texts } : {};
      for (const key of recordOnly) next[key] = { revision, value: structuredClone(texts[key as keyof BaseTestTexts]) };
      test.base_texts = next;
    }
  }
  if (added.length === 0 && filled.length === 0 && replaced.length === 0 && differing.length === 0) return null;
  return { typeId: type.id, label, draft: draft as CompanyTypeDraft, added, filled, replaced, differing };
}

/** The update's plan over the company's types (`TestBaseUpdatePlan`). */
export function planTestBaseUpdate(file: TestBaseFile, ctx: DefinitionContext, seedVersion: string = SEED_VERSION): TestBaseUpdatePlan {
  const revision = testBaseRevisionOf(file);
  const { types, unattached } = testBaseTypesOf(file, seedVersion);
  const updates: TestBaseTypeUpdate[] = [];
  const creates: TestBaseCopy[] = [];
  const refused = new Set<string>();
  for (const rows of types) {
    for (const id of rows.refused) refused.add(id);
    const held = heldTestBaseType(ctx, rows.blockType, rows.label);
    if (held === null) {
      creates.push(testBaseCopyOf(rows, revision, seedVersion));
      continue;
    }
    const update = updateOf(ctx, held, rows, revision, seedVersion);
    if (update !== null) updates.push(update);
  }
  return { revision, matched: types.length, updates, creates, unattached, refused: [...refused] };
}

/**
 * The draft the update writes for one held type, with the base's text where the office chose it
 * (`takeBase` holds the chosen `TestBaseTextDiff.id`s); null when nothing would change (every
 * differing text kept and nothing else to add or replace).
 */
export function testBaseUpdateDraft(update: TestBaseTypeUpdate, takeBase: ReadonlySet<string>): CompanyTypeDraft | null {
  const chosen = update.differing.filter((diff) => takeBase.has(diff.id));
  if (update.added.length === 0 && update.filled.length === 0 && update.replaced.length === 0 && chosen.length === 0) return null;
  const draft = structuredClone(update.draft) as unknown as Entry;
  for (const diff of chosen) {
    const test = testIn(draft, diff.testKey);
    if (test !== null) test[diff.text] = structuredClone(diff.base);
  }
  return draft as CompanyTypeDraft;
}

// --- derived text ------------------------------------------------------------------------------

/** The name of each text in the preview's list. */
export function testBaseTextLabel(text: BaseTextKey): string {
  // authored (Story 25.23, listed for Bruno): the four texts the base fills on a test.
  switch (text) {
    case 'help':
      return 'Como ensaiar';
    case 'recommendation':
      return 'Recomendação se reprovado';
    case 'index_help':
      return 'Como ensaiar do índice de polarização';
    case 'index_recommendation':
      return 'Recomendação do índice de polarização';
  }
}

/** The update's preview: the lines before the list, the list of texts to choose for, the lines after it. */
export interface TestBaseUpdatePreview {
  lines: string[];
  differingHeading: string | null;
  differing: { id: string; where: string }[];
  after: string[];
  /** Whether "Atualizar" has anything it could write. */
  writes: boolean;
}

/** The update's preview (`41-templates.html` `#tpl-dlg-base-update`), each line a paragraph. */
export function testBaseUpdatePreview(plan: TestBaseUpdatePlan): TestBaseUpdatePreview {
  const lines: string[] = [];
  const after: string[] = [];
  const updates = plan.updates.length;
  const creates = plan.creates.length;
  const writes = updates > 0 || creates > 0;
  if (plan.matched === 0) {
    // authored (Story 23.12, listed for Bruno): no row of the file attaches to a test of the app.
    lines.push('Nenhum ensaio desta base tem ensaio correspondente no app. Nada será gravado.');
  } else if (!writes) {
    // authored (Story 25.23, listed for Bruno): the company's types already hold this revision.
    lines.push('Os tipos da empresa já estão com os textos desta base. Nada será gravado.');
  } else {
    // authored (Story 25.23, listed for Bruno; `41-templates.html` `#tpl-dlg-base-update`).
    const drafts = 'Nada é publicado: cada tipo ganha um rascunho para você conferir e publicar.';
    lines.push(updates > 0 ? `Atualiza ${plural(updates, 'tipo da empresa', 'tipos da empresa')} com esta base. ${drafts}` : drafts);
    const added = plan.updates.reduce((n, one) => n + one.added.length, 0);
    const filledTests = plan.updates.reduce((n, one) => n + new Set(one.filled.map((ref) => ref.testKey)).size, 0);
    const index = plan.updates.some((one) => one.filled.some((ref) => ref.text === 'index_help')) ? ', entre eles o "Como ensaiar" do índice de polarização' : '';
    const addedPart = `${plural(added, 'ensaio', 'ensaios')} que os tipos ainda não têm`;
    const filledPart = `os textos de ${plural(filledTests, 'ensaio', 'ensaios')} que estavam vazios${index}`;
    if (added > 0 && filledTests > 0) lines.push(`Acrescenta ${addedPart} e ${filledPart}.`);
    else if (added > 0) lines.push(`Acrescenta ${addedPart}.`);
    else if (filledTests > 0) lines.push(`Acrescenta ${filledPart}.`);
    const replaced = plan.updates.reduce((n, one) => n + one.replaced.length, 0);
    if (replaced > 0) lines.push(`Substitui ${plural(replaced, 'texto', 'textos')} que ninguém editou desde a última atualização.`);
  }
  const differing = plan.updates.flatMap((one) => one.differing).map((diff) => ({ id: diff.id, where: `${diff.typeLabel} · ${diff.testLabel} · ${testBaseTextLabel(diff.text)}` }));
  // authored (Story 25.23, listed for Bruno).
  const differingHeading = differing.length === 0 ? null : `Editados pela empresa e diferentes nesta base (${differing.length})`;
  // authored (Story 25.23, listed for Bruno).
  if (creates > 0) after.push(`Cria ${plural(creates, 'tipo', 'tipos')} que a empresa ainda não tem, como na importação: ${listPtBr(plan.creates.map((copy) => copy.label))}.`);
  after.push(...testBaseLeftOutLines(plan.unattached, plan.refused));
  return { lines, differingHeading, differing, after, writes };
}

/** The toast after the update: "3 tipos atualizados e 1 importado da base de ensaios · rascunhos para publicar". */
export function testBaseUpdatedText(updated: number, created: number): string {
  // authored (Story 25.23, listed for Bruno; the mock's toast).
  const tail = 'da base de ensaios · rascunhos para publicar';
  if (updated > 0 && created > 0) return `${plural(updated, 'tipo atualizado', 'tipos atualizados')} e ${created} ${created === 1 ? 'importado' : 'importados'} ${tail}`;
  if (updated > 0) return `${plural(updated, 'tipo atualizado', 'tipos atualizados')} ${tail}`;
  if (created > 0) return `${plural(created, 'tipo importado', 'tipos importados')} ${tail}`;
  return 'Nenhum tipo alterado: os textos da empresa foram mantidos';
}
