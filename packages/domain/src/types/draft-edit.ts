import { accuracyClassDeviation } from '../relatorio/accuracy-class.ts';
import { SEEDED_CRITERIA, formatCriterionValue } from '../seed/criteria.ts';
import { equipmentTypesOf, findDefinition } from '../seed/definitions.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { plural } from '../text/plural.ts';
import type { TestHelpKey } from '../seed/test-help.ts';
import { isVectorGroupOptions, VECTOR_GROUP_FIELD } from '../relatorio/vector-group.ts';
import { COMPANY_CRITERION_OPERATORS, criterionTypeOf, type CompanyCriterionOperator, type CompanyTypeDraft } from './definition.ts';

/*
 * Story 14.7 (`43-tipo-equipamento.html`; AD-21 note of 2026-11-06, items 2 and 9): the edits the
 * type editor makes to a draft, each a pure function from the draft to the next one, which the
 * editor writes whole as one `equipment_type/{id}/draft` put (the outbox coalesces them). A draft
 * is loose (`companyTypeDraftSchema`): an edit never refuses an incomplete value, it leaves it for
 * `validateTypeDraft` to name. What an edit keeps consistent beside the part it changes is here
 * too, so the editor never decides it: a new key is unique in its list, a field's unit and options
 * follow its kind, a test's criterion is a row of the type's criteria table (added with the test,
 * dropped with the last test naming it), a measurement row carries its own criterion row (its
 * label and unit follow the row's), and a criterion's source is copied onto every measurement
 * criterion that names it.
 */

type Entry = Record<string, unknown>;
type Draft = Record<string, unknown>;

const asDraft = (draft: CompanyTypeDraft | null | undefined): Draft => (draft !== null && typeof draft === 'object' ? (structuredClone(draft) as Draft) : {});
const back = (draft: Draft): CompanyTypeDraft => draft as CompanyTypeDraft;
const listOf = (draft: Draft, part: string): Entry[] => (Array.isArray(draft[part]) ? (draft[part] as Entry[]) : []);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

/** `base`, else `base_2`, `base_3`…: a key no entry of `taken` holds. */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const clean = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'item';
  if (!used.has(clean)) return clean;
  for (let n = 2; ; n += 1) if (!used.has(`${clean}_${n}`)) return `${clean}_${n}`;
}

const keysOf = (list: readonly Entry[]): string[] => list.map((entry) => textOf(entry.key));

// --- Identificação -----------------------------------------------------------------------------

/** The type's name, its print title (blank clears it), or its TAG prefix (uppercased as typed). */
export function setDraftText(draft: CompanyTypeDraft | null, key: 'label' | 'print_title' | 'tag_prefix', value: string): CompanyTypeDraft {
  const next = asDraft(draft);
  if (key === 'print_title' && value.trim() === '') delete next.print_title;
  else next[key] = key === 'tag_prefix' ? value.toUpperCase() : value;
  return back(next);
}

/** The noun's singular, plural or gender. */
export function setDraftNoun(draft: CompanyTypeDraft | null, patch: { singular?: string; plural?: string; gender?: 'm' | 'f' }): CompanyTypeDraft {
  const next = asDraft(draft);
  const noun = next.noun !== null && typeof next.noun === 'object' ? (next.noun as Entry) : {};
  next.noun = { ...noun, ...patch };
  return back(next);
}

// --- Placa -------------------------------------------------------------------------------------

/** The six AD-11 field kinds, in the mock's order. */
export const FIELD_KINDS = ['text', 'number', 'date', 'select', 'manufacturer', 'voltage_class'] as const;
export type DraftFieldKind = (typeof FIELD_KINDS)[number];

// authored (Story 14.7, from `43-tipo-equipamento.html`): the kinds as the editor names them.
export const FIELD_KIND_WORDS: Readonly<Record<DraftFieldKind, string>> = {
  text: 'Texto',
  number: 'Número',
  date: 'Data',
  select: 'Lista',
  manufacturer: 'Fabricante',
  voltage_class: 'Classe de tensão',
};

/** A field's row line: "Número · VA", "Número · sem unidade", "Lista · 3 opções", "Fabricante · lista de Cadastros". */
export function fieldSummaryText(field: Entry): string {
  const kind = field.kind as DraftFieldKind | undefined;
  // authored (Story 14.7, from `43-tipo-equipamento.html`).
  if (kind === undefined || !(kind in FIELD_KIND_WORDS)) return 'Sem tipo';
  const word = FIELD_KIND_WORDS[kind];
  const unit = textOf(field.unit).trim();
  if (kind === 'number') return `${word} · ${unit === '' ? 'sem unidade' : unit}`;
  if (kind === 'voltage_class') return unit === '' ? word : `${word} · ${unit}`;
  if (kind === 'select') return `${word} · ${plural(Array.isArray(field.options) ? field.options.length : 0, 'opção', 'opções')}`;
  if (kind === 'manufacturer') return `${word} · lista de Cadastros`;
  return word;
}

/** A new text field at the end of the nameplate ("Campo 3"), and its index. */
export function addDraftField(draft: CompanyTypeDraft | null): { draft: CompanyTypeDraft; index: number } {
  const next = asDraft(draft);
  const fields = listOf(next, 'nameplate');
  // authored (Story 14.7): a new field's label until the office names it.
  const label = `Campo ${fields.length + 1}`;
  fields.push({ key: uniqueKey(`campo_${fields.length + 1}`, keysOf(fields)), label, kind: 'text' });
  next.nameplate = fields;
  return { draft: back(next), index: fields.length - 1 };
}

/** Whether a test's table of the draft computes the ratio by the vector group (`ratio_factor: 'vector_group'`). */
function readsVectorGroup(draft: Draft): boolean {
  return listOf(draft, 'tests').some((test) => (Array.isArray(test.tables) ? (test.tables as Entry[]) : []).some((table) => table.ratio_factor === 'vector_group'));
}

/** The label a refusal names the vector-group field by: its own, else its key. */
const vectorFieldLabel = (field: Entry): string => (textOf(field.label).trim() === '' ? VECTOR_GROUP_FIELD : textOf(field.label).trim());

/**
 * Story 24.20: why a change of a nameplate field may not apply, else null. The valid vector-group
 * field (`VECTOR_GROUP_FIELD`, a select of exactly the codes) while a test's table computes the ratio
 * by it: a change of its kind, or options that are no longer exactly the codes, would leave the ratio
 * unable to compute. Its label and its unit still change.
 */
export function updateDraftFieldRefusal(draft: CompanyTypeDraft | null, index: number, patch: { label?: string; kind?: DraftFieldKind; unit?: string; options?: string[] }): string | null {
  const source = asDraft(draft);
  const field = listOf(source, 'nameplate')[index];
  if (field === undefined || field.key !== VECTOR_GROUP_FIELD) return null;
  const options = Array.isArray(field.options) ? (field.options as string[]) : undefined;
  if (field.kind !== 'select' || !isVectorGroupOptions(options) || !readsVectorGroup(source)) return null;
  const kindChange = patch.kind !== undefined && patch.kind !== field.kind;
  const optionsChange = patch.options !== undefined && !isVectorGroupOptions(patch.options);
  if (!kindChange && !optionsChange) return null;
  // authored (e24c, listed for Bruno): Story 24.20's refusal toast.
  return `O campo ${vectorFieldLabel(field)} não pode mudar de tipo nem de opções: a relação de transformação é calculada a partir dele. Remova antes o ensaio.`; // authored (e24y, corrected by Bruno 2026-11-11): was "calcula por ele"
}

/**
 * A field's label, kind, unit (blank removes it) or options; a kind change keeps only what the new
 * kind carries. Story 24.20: a kind or options change `updateDraftFieldRefusal` refuses is left out
 * (the label and the unit of the same patch still apply).
 */
export function updateDraftField(draft: CompanyTypeDraft | null, index: number, requested: { label?: string; kind?: DraftFieldKind; unit?: string; options?: string[] }): CompanyTypeDraft {
  const next = asDraft(draft);
  const fields = listOf(next, 'nameplate');
  const field = fields[index];
  if (field === undefined) return back(next);
  const patch = { ...requested };
  if (updateDraftFieldRefusal(draft, index, requested) !== null) {
    delete patch.kind;
    delete patch.options;
  }
  if (patch.label !== undefined) field.label = patch.label;
  if (patch.kind !== undefined && patch.kind !== field.kind) {
    field.kind = patch.kind;
    delete field.option_aliases;
    if (patch.kind === 'select') field.options = Array.isArray(field.options) ? field.options : [];
    else delete field.options;
    if (patch.kind !== 'number' && patch.kind !== 'voltage_class') delete field.unit;
  }
  if (patch.unit !== undefined) {
    if (patch.unit.trim() === '') delete field.unit;
    else field.unit = patch.unit;
  }
  if (patch.options !== undefined) {
    field.options = patch.options;
    delete field.option_aliases;
  }
  next.nameplate = fields;
  return back(next);
}

// --- Verificações --------------------------------------------------------------------------------

/** An item's row line: "3 frases de NC · lembrete na ficha". */
export function itemSummaryText(item: Entry): string {
  const phrases = Array.isArray(item.nc_phrases) ? item.nc_phrases.length : 0;
  // authored (Story 14.7, from `43-tipo-equipamento.html`).
  const parts = [plural(phrases, 'frase de NC', 'frases de NC')];
  if (textOf(item.hint).trim() !== '') parts.push('lembrete na ficha');
  return parts.join(' · ');
}

/** A new item at the end of the checklist (no text, no phrase yet), and its index; a type without a checklist gets one. */
export function addDraftItem(draft: CompanyTypeDraft | null): { draft: CompanyTypeDraft; index: number } {
  const next = asDraft(draft);
  const items = listOf(next, 'checklist');
  items.push({ key: uniqueKey(`item_${items.length + 1}`, keysOf(items)), label: '', nc_phrases: [] });
  next.checklist = items;
  return { draft: back(next), index: items.length - 1 };
}

/** An item's text, NC phrases or reminder (blank removes it). */
export function updateDraftItem(draft: CompanyTypeDraft | null, index: number, patch: { label?: string; nc_phrases?: string[]; hint?: string }): CompanyTypeDraft {
  const next = asDraft(draft);
  const items = listOf(next, 'checklist');
  const item = items[index];
  if (item === undefined) return back(next);
  if (patch.label !== undefined) item.label = patch.label;
  if (patch.nc_phrases !== undefined) item.nc_phrases = patch.nc_phrases;
  if (patch.hint !== undefined) {
    if (patch.hint.trim() === '') delete item.hint;
    else item.hint = patch.hint;
  }
  next.checklist = items;
  return back(next);
}

/** The most NC phrases an item takes, and the fewest. */
export const NC_PHRASES_MAX = 4;
export const NC_PHRASES_MIN = 3;

/** Fix batch e22h (N2): whether an item holds as many NC phrases as it takes (no add input, the "full" note). */
export function ncPhrasesFull(phrases: readonly unknown[]): boolean {
  return phrases.length >= NC_PHRASES_MAX;
}

// --- moving and removing entries -----------------------------------------------------------------

export type DraftListPart = 'nameplate' | 'checklist' | 'tests' | 'measurement_tests';

/** One entry of a list moved from `from` to `to` (clamped); the same draft when either is out of range. */
export function moveDraftEntry(draft: CompanyTypeDraft | null, part: DraftListPart, from: number, to: number): CompanyTypeDraft {
  const next = asDraft(draft);
  const list = listOf(next, part);
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return back(next);
  const [entry] = list.splice(from, 1);
  list.splice(to, 0, entry!);
  next[part] = list;
  return back(next);
}

/** The criterion keys the draft's tests name: a seeded-grammar test's `criterion_key`, a measurement criterion's `seeded`. */
function namedCriteria(draft: Draft): Set<string> {
  const out = new Set<string>();
  for (const test of listOf(draft, 'tests')) if (typeof test.criterion_key === 'string') out.add(test.criterion_key);
  for (const test of listOf(draft, 'measurement_tests')) {
    for (const criterion of (Array.isArray(test.criteria) ? test.criteria : []) as Entry[]) if (typeof criterion.seeded === 'string') out.add(criterion.seeded);
  }
  return out;
}

/** The criteria rows no test names any more are dropped (they were added with a test). */
function pruneCriteria(draft: Draft): void {
  const named = namedCriteria(draft);
  draft.criteria = listOf(draft, 'criteria').filter((criterion) => named.has(textOf(criterion.key)));
}

/**
 * Fix batch e23z (item 4, Matheus's decision on the e23g ledger row): why an entry may not be removed, else null. The
 * nameplate field holding the vector group (`VECTOR_GROUP_FIELD`, DESLOCAMENTO ANGULAR on a v12 or later transformer)
 * while a test's table computes the ratio by it (`ratio_factor: 'vector_group'`): removing the test first lifts it.
 * ~~Only removal is refused; changing the field's kind or options is not.~~ (2026-11-11, Story 24.20: a change of its
 * kind or options is refused too, `updateDraftFieldRefusal`.)
 */
export function removeDraftEntryRefusal(draft: CompanyTypeDraft | null, part: DraftListPart, index: number): string | null {
  if (part !== 'nameplate') return null;
  const source = asDraft(draft);
  const field = listOf(source, 'nameplate')[index];
  if (field === undefined || field.key !== VECTOR_GROUP_FIELD) return null;
  if (!readsVectorGroup(source)) return null;
  // authored (e23z, listed for Bruno).
  return `O campo ${vectorFieldLabel(field)} não pode ser removido: a relação de transformação é calculada a partir dele. Remova antes o ensaio.`; // authored (e24y, corrected by Bruno 2026-11-11): was "calcula por ele"
}

/**
 * One entry removed; a removed field or item leaves no test or oil rule naming it, a removed test
 * leaves no criterion only it named. Fix batch e23g (R2-2), the v13 keys: a removed nameplate field
 * leaves the oil rule's `dry_fields` (the key goes when empty), no field's `pick_from`, no table's
 * `rows_from` (the table falls back to its seeded row) and no test's `applies_when` (the test applies
 * always) naming it, so the copy stays publishable.
 */
export function removeDraftEntry(draft: CompanyTypeDraft | null, part: DraftListPart, index: number): CompanyTypeDraft {
  const next = asDraft(draft);
  // Fix batch e23z (item 4): a removal the kernel refuses leaves the draft as it is.
  if (removeDraftEntryRefusal(draft, part, index) !== null) return back(next);
  const list = listOf(next, part);
  const [removed] = list.splice(index, 1);
  if (removed === undefined) return back(next);
  // A type without measurement tables has no `measurement_tests` (the strict schema takes one or more, never an empty list).
  if (part === 'measurement_tests' && list.length === 0) delete next.measurement_tests;
  else next[part] = list;
  if (part === 'nameplate') {
    const key = textOf(removed.key);
    for (const test of listOf(next, 'tests')) {
      if (test.criterion_class_field === key) delete test.criterion_class_field;
      // Review e22h finding 4: the voltage field takes the bands with it; the SELV/PELV field only its own band.
      const bands = test.criterion_bands as Entry | undefined;
      if (bands !== undefined && bands.field === key) delete test.criterion_bands;
      else if (bands !== undefined && bands.selv_field === key) {
        delete bands.selv_field;
        delete bands.selv;
        delete bands.selv_max_voltage;
      }
      for (const table of (Array.isArray(test.tables) ? test.tables : []) as Entry[]) {
        for (const row of (Array.isArray(table.voltage_rows) ? table.voltage_rows : []) as Entry[]) if (row.winding === key) row.winding = null;
      }
      // Batch e23a (Story 23.2): a criterion table read by the removed field goes with it (a winding's rows fall back to the seeded criterion).
      const picked = test.criterion_table as Entry | undefined;
      const voltage = picked?.voltage as Entry | string | undefined;
      if (picked !== undefined && typeof voltage === 'object' && voltage !== null && voltage.field === key) delete test.criterion_table;
      // Review fix (item 5): a table read by winding whose every row lost its winding has nothing left to read.
      const tables = (Array.isArray(test.tables) ? test.tables : []) as Entry[];
      const windings = tables.flatMap((table) => ((Array.isArray(table.voltage_rows) ? table.voltage_rows : []) as Entry[]).map((row) => row.winding));
      if (picked !== undefined && voltage === 'winding' && windings.every((winding) => winding === null || winding === undefined)) delete test.criterion_table;
    }
    // Fix batch e22h (S1): the oil rule a copy carries loses its field with it, or that excused field.
    const rule = next.oil_rule as Entry | undefined;
    if (rule !== undefined && rule.field === key) delete next.oil_rule;
    else if (rule !== undefined) {
      if (Array.isArray(rule.fields)) rule.fields = rule.fields.filter((field) => field !== key);
      // Fix batch e23g (R2-2): a dry field goes the same way; the key goes when none is left (the schema takes one or more).
      if (Array.isArray(rule.dry_fields)) {
        const dry = (rule.dry_fields as unknown[]).filter((field) => field !== key);
        if (dry.length === 0) delete rule.dry_fields;
        else rule.dry_fields = dry;
      }
    }
    // Fix batch e23g (R2-2): a picker whose list went is a plain number field again (TAP ATUAL without TAPS).
    for (const field of listOf(next, 'nameplate')) if (field.pick_from === key) delete field.pick_from;
    for (const test of listOf(next, 'tests')) {
      // A table whose rows came from the removed list keeps its seeded row, as with the list empty.
      for (const table of (Array.isArray(test.tables) ? test.tables : []) as Entry[]) if (table.rows_from === key) delete table.rows_from;
    }
    // A test whose condition reads the removed field applies always, the schema's meaning of no condition (`initial_off` is kept).
    for (const test of [...listOf(next, 'tests'), ...listOf(next, 'measurement_tests')]) {
      const condition = test.applies_when as Entry | undefined;
      if (condition !== undefined && condition !== null && condition.field === key) delete test.applies_when;
    }
    dropMediumTables(next);
  }
  if (part === 'checklist') {
    const rule = next.oil_rule as Entry | undefined;
    if (rule !== undefined && Array.isArray(rule.items)) {
      const items = (rule.items as unknown[]).filter((item) => item !== textOf(removed.key));
      rule.items = items;
      if (items.length === 0) delete next.oil_rule;
    }
    // Seed v14, batch e24s (Story 24.11): the removed item leaves the rule's dry items too, and the key once it lists none.
    if (rule !== undefined && next.oil_rule !== undefined && Array.isArray(rule.dry_items)) {
      const dry = (rule.dry_items as unknown[]).filter((item) => item !== textOf(removed.key));
      if (dry.length === 0) delete rule.dry_items;
      else rule.dry_items = dry;
    }
    dropMediumTables(next);
  }
  if (part === 'tests' || part === 'measurement_tests') pruneCriteria(next);
  // Batch e23v (Stories 23.5 and 23.6): what a test's correction or restriction reads of the removed field (or of a removed oil rule) goes too.
  if (part === 'nameplate' || part === 'checklist') dropE23vReads(next, part === 'nameplate' ? textOf(removed.key) : null);
  // Batch e23t (Stories 23.15 and 23.17): what a winding correction or a field's `excused_unless` reads of the removed field (or of a removed oil rule) goes too.
  if (part === 'nameplate' || part === 'checklist') dropE23tReads(next, part === 'nameplate' ? textOf(removed.key) : null);
  // Batch e23e (Stories 23.13, 23.18 and 23.21): what a voltage default, a notice or a maximum reads of the removed field goes too.
  if (part === 'nameplate') dropE23eReads(next, textOf(removed.key));
  return back(next);
}

// --- e23e: Stories 23.13, 23.18, 23.20, 23.21 ---
/**
 * Batch e23e: a removed nameplate field takes with it what reads it: a table's `voltage_default` (the
 * rows then start at the instrument's voltage, as on v12), a test's `notice_when` (no notice), and a
 * measurement criterion `max_field` becomes the absolute maximum of its default (what it judged by
 * with the field empty), so the copy stays publishable and judges as it did on an empty plate.
 */
function dropE23eReads(next: Entry, key: string): void {
  for (const test of listOf(next, 'tests')) {
    for (const table of (Array.isArray(test.tables) ? test.tables : []) as Entry[]) {
      const pick = table.voltage_default as Entry | undefined;
      if (pick !== undefined && pick !== null && pick.field === key) delete table.voltage_default;
    }
    const notice = test.notice_when as Entry | undefined;
    if (notice !== undefined && notice !== null && notice.field === key) delete test.notice_when;
  }
  for (const test of listOf(next, 'measurement_tests')) {
    if (!Array.isArray(test.criteria)) continue;
    test.criteria = (test.criteria as Entry[]).map((criterion) => {
      if (criterion === null || typeof criterion !== 'object' || criterion.type !== 'max_field' || criterion.field !== key) return criterion;
      const sign = '≤';
      const value = typeof criterion.default === 'number' ? criterion.default : 0;
      const unit = typeof criterion.unit === 'string' ? criterion.unit : null;
      // The default's own wording: "≤ 5 Ω".
      const text = `${sign} ${String(value).replace('.', ',')}${unit === null ? '' : ` ${unit}`}`;
      return { type: 'absolute', operator: '<=', value, unit, text, source: criterion.source, ...(criterion.when === undefined ? {} : { when: criterion.when }) };
    });
  }
}

// --- e23t: Stories 23.15 to 23.17 ---
/**
 * Batch e23t: a removed nameplate field takes with it what reads it: a measurement test's winding
 * correction whose material it was goes whole (no material, no correction) and with it the history
 * rule (it compares corrected values), its `oil_field` or `dry_field` alone (the ambient then stands
 * in); a field's `excused_unless` naming it (the field then always shows). With no oil rule left, a
 * deviation criterion read by medium loses its medium (it judges every unit).
 */
function dropE23tReads(next: Entry, key: string | null): void {
  for (const test of (Array.isArray(next.measurement_tests) ? next.measurement_tests : []) as Entry[]) {
    const correction = test.winding_correction as Entry | undefined;
    if (correction !== undefined && key !== null) {
      if (correction.material_field === key) delete test.winding_correction;
      else {
        if (correction.oil_field === key) delete correction.oil_field;
        if (correction.dry_field === key) delete correction.dry_field;
      }
    }
    if (test.winding_correction === undefined) delete test.history_deviation_pct;
    if (next.oil_rule === undefined) for (const criterion of (Array.isArray(test.criteria) ? test.criteria : []) as Entry[]) if (criterion.type === 'phase_deviation') delete criterion.medium;
  }
  if (key === null) return;
  for (const field of (Array.isArray(next.nameplate) ? next.nameplate : []) as Entry[]) {
    if ((field.excused_unless as Entry | undefined)?.field === key) delete field.excused_unless;
  }
}

// --- e23v: Stories 23.5 and 23.6 ---
/**
 * Batch e23v: a removed nameplate field takes with it what a test's temperature correction or restriction
 * reads of it: the correction's `oil_field` or `dry_field` (the ambient then stands in) and the
 * restriction's prerequisite. With no oil rule left, a correction read by the oil rule has no medium to
 * read and goes, and with it a history rule (it compares corrected readings); a restriction left with no
 * rule goes whole.
 */
function dropE23vReads(next: Entry, key: string | null): void {
  for (const test of (Array.isArray(next.tests) ? next.tests : []) as Entry[]) {
    const correction = test.temperature_correction as Entry | undefined;
    if (correction !== undefined && key !== null) {
      if (correction.oil_field === key) delete correction.oil_field;
      if (correction.dry_field === key) delete correction.dry_field;
    }
    if (correction !== undefined && correction.medium === 'oil_rule' && next.oil_rule === undefined) delete test.temperature_correction;
    const restriction = test.restriction as Entry | undefined;
    if (restriction === undefined) continue;
    if (key !== null && (restriction.prerequisite as Entry | undefined)?.field === key) delete restriction.prerequisite;
    if (test.temperature_correction === undefined) delete restriction.history_drop_pct;
    // Fix batch e23w (B-6): `history_rise_out_pct` is a rule too.
    if (restriction.history_drop_pct === undefined && restriction.below_largest_pct === undefined && restriction.pole_deviation_pct === undefined && restriction.history_rise_out_pct === undefined && restriction.prerequisite === undefined) delete test.restriction;
  }
}

/** Batch e23a (Story 23.2): with no oil rule left, a criterion table read by the medium has nothing to read it by and goes. */
function dropMediumTables(next: Entry): void {
  if (next.oil_rule !== undefined) return;
  for (const test of (Array.isArray(next.tests) ? next.tests : []) as Entry[]) {
    const picked = test.criterion_table as Entry | undefined;
    if (picked !== undefined && picked.medium !== undefined) delete test.criterion_table;
  }
}

// --- Ensaios -------------------------------------------------------------------------------------

/** The formats "Adicionar ensaio" offers: the three seeded grammars a company test takes, and the measurement table. */
export const TEST_GRAMMARS = ['isolacao', 'resistencia_contato', 'relacao_transformacao', 'medicoes'] as const;
export type TestGrammar = (typeof TEST_GRAMMARS)[number];

// authored (Story 14.7, from `43-tipo-equipamento.html`): each format's name and line in the picker.
export const TEST_GRAMMAR_WORDS: Readonly<Record<TestGrammar, { label: string; hint: string }>> = {
  isolacao: { label: 'Isolação', hint: 'Tabela por fase e ponto de medição, um critério mínimo' },
  resistencia_contato: { label: 'Resistência de contato', hint: 'Um valor por polo, critério máximo' },
  relacao_transformacao: { label: 'Relação de transformação', hint: 'Por TAP e fase, desvio em %' },
  medicoes: { label: 'Tabela de medições', hint: 'Linhas com nome, colunas com unidade ou opções, um critério por linha' },
};

/** The picker's line for a seeded grammar the type already holds ("… · já usado neste tipo"): a type holds one test per grammar. */
export function grammarHintText(draft: CompanyTypeDraft | null, grammar: TestGrammar): string {
  const words = TEST_GRAMMAR_WORDS[grammar];
  // authored (Story 14.7, from `43-tipo-equipamento.html`).
  return grammarTaken(draft, grammar) ? `${words.hint} · já usado neste tipo` : words.hint;
}

/** Whether the type already holds a test of this seeded grammar (a type takes one of each; any number of measurement tables). */
export function grammarTaken(draft: CompanyTypeDraft | null, grammar: TestGrammar): boolean {
  if (grammar === 'medicoes') return false;
  return listOf(asDraft(draft), 'tests').some((test) => test.key === grammar);
}

/** Where a seeded grammar's table is copied from: the first seeded type of the version holding it, in this order. */
const GRAMMAR_SOURCES: Readonly<Record<Exclude<TestGrammar, 'medicoes'>, readonly EquipmentBlockType[]>> = {
  isolacao: ['cabos_entrada', 'cabos_saida', 'para_raio', 'chave_seccionadora'],
  resistencia_contato: ['disjuntor_mt', 'chave_seccionadora'],
  relacao_transformacao: ['tc', 'tp', 'transformador_forca'],
};

/** A seeded criterion as a row of the type's criteria table. */
function seededCriterionRow(key: string): Entry | null {
  const seeded = SEEDED_CRITERIA.find((criterion) => criterion.key === key);
  if (seeded === undefined) return null;
  return { key: seeded.key, label: seeded.label, operator: seeded.operator, value: seeded.value, unit: seeded.unit, type: seeded.type, source: { name: seeded.source.name, edition: seeded.source.edition } };
}

/** The key of a new measurement row's criterion, unique in the criteria table. */
const rowCriterionKey = (testKey: string, rowKey: string, criteria: readonly Entry[]) => uniqueKey(`${testKey}_${rowKey}`, keysOf(criteria));

/** A measurement row's own criterion: a row of the criteria table and the absolute criterion of the test that names it. */
function rowCriterion(testKey: string, row: Entry, criteria: Entry[]): Entry {
  const key = rowCriterionKey(testKey, textOf(row.key), criteria);
  const unit = textOf(row.unit).trim();
  criteria.push({ key, label: textOf(row.label), operator: '>=', value: 0, unit: unit === '' ? null : unit, type: 'absolute_min', source: { name: '', edition: null } });
  return { type: 'absolute', seeded: key, rows: [textOf(row.key)], source: { name: '', edition: null } };
}

/**
 * "Adicionar ensaio": a seeded grammar copies its table from the first seeded type of the version
 * holding it (its plate-bound criterion rules dropped: a company type picks no criterion from its
 * plate) and adds its seeded criterion to the criteria table; the measurement table starts with
 * one row "Linha 1" in one number column "Valor medido" and the row's own criterion. Null when the
 * grammar is taken or the version ships no table of it.
 */
export function addDraftTest(draft: CompanyTypeDraft | null, grammar: TestGrammar, seedVersion: string): { draft: CompanyTypeDraft; part: 'tests' | 'measurement_tests'; index: number } | null {
  const next = asDraft(draft);
  const criteria = listOf(next, 'criteria');
  if (grammar === 'medicoes') {
    const tests = listOf(next, 'measurement_tests');
    const taken = [...keysOf(tests), ...keysOf(listOf(next, 'tests'))];
    const key = uniqueKey(`medicao_${tests.length + 1}`, taken);
    // authored (Story 14.7): a new measurement table's title, row header, column and first row.
    const row: Entry = { key: 'linha_1', label: 'Linha 1', kind: 'number' };
    tests.push({ key, label: 'Tabela de medições', row_header: 'Medição', columns: [{ key: 'valor', label: 'Valor medido', kind: 'number' }], rows: [row], criteria: [rowCriterion(key, row, criteria)] });
    next.measurement_tests = tests;
    next.criteria = criteria;
    return { draft: back(next), part: 'measurement_tests', index: tests.length - 1 };
  }
  if (grammarTaken(draft, grammar)) return null;
  const sources = [...GRAMMAR_SOURCES[grammar], ...equipmentTypesOf(seedVersion)];
  let test: Entry | null = null;
  for (const type of sources) {
    const found = findDefinition(seedVersion, type)?.tests.find((candidate) => candidate.key === grammar);
    if (found !== undefined) {
      test = structuredClone(found) as unknown as Entry;
      break;
    }
  }
  if (test === null) return null;
  delete test.criterion;
  delete test.criterion_bands;
  delete test.criterion_class_field;
  // Batch e23a (Story 23.2): a criterion table reads the source type's plate, not this one's.
  delete test.criterion_table;
  // Batch e23v (Stories 23.5, 23.6 and 23.14): nor its correction, restriction rules or criterion status, its source type's judging.
  for (const key of ['temperature_correction', 'restriction', 'criterion_status']) delete test[key];
  for (const table of (Array.isArray(test.tables) ? test.tables : []) as Entry[]) {
    for (const row of (Array.isArray(table.voltage_rows) ? table.voltage_rows : []) as Entry[]) row.winding = null;
  }
  const criterionKey = textOf(test.criterion_key);
  if (!keysOf(criteria).includes(criterionKey)) {
    const row = seededCriterionRow(criterionKey);
    if (row !== null) criteria.push(row);
  }
  const tests = listOf(next, 'tests');
  tests.push(test);
  next.tests = tests;
  next.criteria = criteria;
  return { draft: back(next), part: 'tests', index: tests.length - 1 };
}

/** A test's title, or whether a measurement test may be switched off on the sheet. */
export function updateDraftTest(draft: CompanyTypeDraft | null, part: 'tests' | 'measurement_tests', index: number, patch: { label?: string; switchable?: boolean }): CompanyTypeDraft {
  const next = asDraft(draft);
  const test = listOf(next, part)[index];
  if (test === undefined) return back(next);
  if (patch.label !== undefined) test.label = patch.label;
  if (patch.switchable !== undefined && part === 'measurement_tests') {
    // authored (Story 14.7): the sheet's line while a company test is switched off.
    if (patch.switchable) test.switchable = test.switchable ?? { off_note: 'Desligado — marque NA quando o ensaio não puder ser feito.' };
    else delete test.switchable;
  }
  return back(next);
}

/**
 * Batch e23h (Story 23.10): one heading of a test's "Como ensaiar", kept as typed (as
 * `setDraftText` keeps a text); a blank value deletes the heading, and a help left with no heading
 * is deleted.
 */
export function setDraftTestHelp(draft: CompanyTypeDraft | null, part: 'tests' | 'measurement_tests', index: number, key: TestHelpKey, value: string): CompanyTypeDraft {
  const next = asDraft(draft);
  const test = listOf(next, part)[index];
  if (test === undefined) return back(next);
  const help: Entry = test.help !== null && typeof test.help === 'object' && !Array.isArray(test.help) ? (test.help as Entry) : {};
  if (value.trim() === '') delete help[key];
  else help[key] = value;
  if (Object.keys(help).length === 0) delete test.help;
  else test.help = help;
  return back(next);
}

/**
 * Batch e23h (Story 23.11): a test's "Recomendação se reprovado", kept as typed; a blank value deletes it.
 * Fix batch e24f (R-3): any write also deletes the test's `index_recommendation` (the base import's IP
 * recommendation, which the editor neither shows nor edits), so no point starts from a text nobody can see; a
 * test the editor never writes keeps it.
 */
export function setDraftTestRecommendation(draft: CompanyTypeDraft | null, part: 'tests' | 'measurement_tests', index: number, value: string): CompanyTypeDraft {
  const next = asDraft(draft);
  const test = listOf(next, part)[index];
  if (test === undefined) return back(next);
  if (value.trim() === '') delete test.recommendation;
  else test.recommendation = value;
  delete test.index_recommendation;
  return back(next);
}

/** A test's row line: "Isolação (tabela por fase) · critério: Isolamento mínimo"; "Tabela de medições · 3 linhas · 1 coluna". */
export function testSummaryText(draft: CompanyTypeDraft | null, part: 'tests' | 'measurement_tests', index: number): string {
  const d = asDraft(draft);
  const test = listOf(d, part)[index];
  if (test === undefined) return '';
  // authored (Story 14.7, from `43-tipo-equipamento.html`).
  if (part === 'measurement_tests') {
    const rows = Array.isArray(test.rows) ? test.rows.length : 0;
    const columns = Array.isArray(test.columns) ? test.columns.length : 0;
    return `${TEST_GRAMMAR_WORDS.medicoes.label} · ${plural(rows, 'linha', 'linhas')} · ${plural(columns, 'coluna', 'colunas')}`;
  }
  const grammar = TEST_GRAMMAR_WORDS[test.key as Exclude<TestGrammar, 'medicoes'>]?.label ?? textOf(test.key);
  const criterion = listOf(d, 'criteria').find((row) => row.key === test.criterion_key);
  const criterionLabel = criterion === undefined ? null : textOf(criterion.label).trim();
  return criterionLabel === null || criterionLabel === '' ? grammar : `${grammar} · critério: ${criterionLabel}`;
}

/** A new row at the end of a measurement table, with its own criterion. */
export function addDraftMeasurementRow(draft: CompanyTypeDraft | null, testIndex: number): CompanyTypeDraft {
  const next = asDraft(draft);
  const test = listOf(next, 'measurement_tests')[testIndex];
  if (test === undefined) return back(next);
  const rows = (Array.isArray(test.rows) ? test.rows : []) as Entry[];
  const criteria = listOf(next, 'criteria');
  // authored (Story 14.7): a new row's name until the office names it.
  const row: Entry = { key: uniqueKey(`linha_${rows.length + 1}`, keysOf(rows)), label: `Linha ${rows.length + 1}`, kind: 'number' };
  rows.push(row);
  test.rows = rows;
  test.criteria = [...((Array.isArray(test.criteria) ? test.criteria : []) as Entry[]), rowCriterion(textOf(test.key), row, criteria)];
  next.criteria = criteria;
  return back(next);
}

/** The measurement criteria of a test that judge exactly one row (the row's own criterion). */
function rowCriteriaOf(test: Entry, rowKey: string): Entry[] {
  return ((Array.isArray(test.criteria) ? test.criteria : []) as Entry[]).filter(
    (criterion) => criterion.type === 'absolute' && typeof criterion.seeded === 'string' && Array.isArray(criterion.rows) && criterion.rows.length === 1 && criterion.rows[0] === rowKey,
  );
}

/** A measurement row's name or unit (blank removes it); the row's own criterion follows both. */
export function updateDraftMeasurementRow(draft: CompanyTypeDraft | null, testIndex: number, rowIndex: number, patch: { label?: string; unit?: string }): CompanyTypeDraft {
  const next = asDraft(draft);
  const test = listOf(next, 'measurement_tests')[testIndex];
  const rows = (test !== undefined && Array.isArray(test.rows) ? test.rows : []) as Entry[];
  const row = rows[rowIndex];
  if (test === undefined || row === undefined) return back(next);
  const own = new Set(rowCriteriaOf(test, textOf(row.key)).map((criterion) => textOf(criterion.seeded)));
  const criteria = listOf(next, 'criteria').filter((criterion) => own.has(textOf(criterion.key)));
  if (patch.label !== undefined) {
    row.label = patch.label;
    for (const criterion of criteria) criterion.label = patch.label;
  }
  if (patch.unit !== undefined) {
    const unit = patch.unit.trim();
    if (unit === '') delete row.unit;
    else row.unit = patch.unit;
    if (row.kind === undefined) row.kind = 'number';
    for (const criterion of criteria) criterion.unit = unit === '' ? null : patch.unit;
  }
  return back(next);
}

/** A measurement row removed with its own criterion; the last row stays (a table has one). */
export function removeDraftMeasurementRow(draft: CompanyTypeDraft | null, testIndex: number, rowIndex: number): CompanyTypeDraft {
  const next = asDraft(draft);
  const test = listOf(next, 'measurement_tests')[testIndex];
  const rows = (test !== undefined && Array.isArray(test.rows) ? test.rows : []) as Entry[];
  const row = rows[rowIndex];
  if (test === undefined || row === undefined || rows.length <= 1) return back(next);
  const own = new Set(rowCriteriaOf(test, textOf(row.key)));
  rows.splice(rowIndex, 1);
  test.rows = rows;
  const rest = ((Array.isArray(test.criteria) ? test.criteria : []) as Entry[]).filter((criterion) => !own.has(criterion));
  // A table keeps one criterion: a row's own goes only while another remains.
  test.criteria = rest.length > 0 ? rest : [...own];
  pruneCriteria(next);
  return back(next);
}

// --- Critérios -----------------------------------------------------------------------------------

// authored (Story 14.7, from `43-tipo-equipamento.html`): the rules as the Critérios tab names them.
export const CRITERION_RULE_WORDS: Readonly<Record<CompanyCriterionOperator, string>> = {
  '>': 'maior que',
  '<': 'menor que',
  '>=': 'maior ou igual a',
  '<=': 'menor ou igual a',
  between: 'entre',
  // authored (e24c, listed for Bruno): Story 24.18's rule word.
  nominal_pct: 'nominal ± %',
  '±': '±',
  pass_fail: 'aprovado ou reprovado',
};

/** The rules in the order the Critérios tab offers them. */
export const CRITERION_RULES: readonly CompanyCriterionOperator[] = COMPANY_CRITERION_OPERATORS;

/** The tests a criterion is used by, by title ("Resistência de isolamento", "Tensões medidas"); null when none. */
export function criterionUsedByText(draft: CompanyTypeDraft | null, index: number): string | null {
  const d = asDraft(draft);
  const key = textOf(listOf(d, 'criteria')[index]?.key);
  const titles: string[] = [];
  for (const test of listOf(d, 'tests')) if (test.criterion_key === key) titles.push(textOf(test.label));
  for (const test of listOf(d, 'measurement_tests')) {
    if (((Array.isArray(test.criteria) ? test.criteria : []) as Entry[]).some((criterion) => criterion.seeded === key)) titles.push(textOf(test.label));
  }
  const named = titles.filter((title) => title.trim() !== '');
  return named.length === 0 ? null : named.join(', ');
}

/**
 * Story 24.18: a draft criterion row as the sheet and the print will write it ("entre 198 e 242 Vca",
 * "220 V ±5 %"); null while its rule or its numbers are not typed yet.
 */
export function draftCriterionText(criterion: Readonly<Record<string, unknown>> | undefined): string | null {
  if (criterion === undefined) return null;
  const operator = criterion.operator;
  const value = criterion.value;
  if (typeof operator !== 'string' || typeof value !== 'number') return null;
  if (operator === 'between' && typeof criterion.value_max !== 'number') return null;
  if (operator === 'nominal_pct' && typeof criterion.tolerance_pct !== 'number') return null;
  return formatCriterionValue({
    operator,
    value,
    ...(typeof criterion.value_max === 'number' ? { value_max: criterion.value_max } : {}),
    ...(operator === 'nominal_pct' ? { tolerance_pct: criterion.tolerance_pct as number } : {}),
    unit: typeof criterion.unit === 'string' && criterion.unit !== '' ? criterion.unit : null,
  });
}

/**
 * A criterion's name, rule, value, maximum, tolerance or source. A rule change sets the criterion's
 * type and gives `entre` a maximum (the value, until typed) or takes it away; a source change is
 * copied onto every measurement criterion that names the row, so the type carries one source per
 * criterion. Story 24.18: a change to "nominal ± %" keeps the value as the nominal, drops the
 * maximum and leaves the tolerance to be typed (its issue asks for it); a change away from it drops
 * the tolerance, and to `entre` leaves the maximum unset, so the row asks for its two bounds.
 */
export function updateDraftCriterion(
  draft: CompanyTypeDraft | null,
  index: number,
  patch: { label?: string; operator?: CompanyCriterionOperator; value?: number | null; value_max?: number | null; tolerance_pct?: number | null; source_name?: string; source_edition?: string },
): CompanyTypeDraft {
  const next = asDraft(draft);
  const criteria = listOf(next, 'criteria');
  const criterion = criteria[index];
  if (criterion === undefined) return back(next);
  if (patch.label !== undefined) criterion.label = patch.label;
  if (patch.operator !== undefined) {
    const from = criterion.operator;
    criterion.operator = patch.operator;
    criterion.type = criterionTypeOf(patch.operator);
    if (patch.operator === 'between' && from === 'nominal_pct') delete criterion.value_max;
    else if (patch.operator === 'between') criterion.value_max = typeof criterion.value_max === 'number' ? criterion.value_max : typeof criterion.value === 'number' ? criterion.value : 0;
    else delete criterion.value_max;
    if (patch.operator !== 'nominal_pct') delete criterion.tolerance_pct;
    // A pass/fail reading passes at 1 (aprovado): the rule's value, which the tab never asks for.
    if (patch.operator === 'pass_fail') criterion.value = 1;
  }
  // A cleared number leaves the key out, so the schema names it ("informe o valor").
  if (patch.value !== undefined) {
    if (patch.value === null) delete criterion.value;
    else criterion.value = patch.value;
  }
  if (patch.value_max !== undefined && criterion.operator === 'between') {
    if (patch.value_max === null) delete criterion.value_max;
    else criterion.value_max = patch.value_max;
  }
  if (patch.tolerance_pct !== undefined && criterion.operator === 'nominal_pct') {
    if (patch.tolerance_pct === null) delete criterion.tolerance_pct;
    else criterion.tolerance_pct = patch.tolerance_pct;
  }
  if (patch.source_name !== undefined || patch.source_edition !== undefined) {
    const source = criterion.source !== null && typeof criterion.source === 'object' ? (criterion.source as Entry) : { name: '', edition: null };
    const edition = patch.source_edition === undefined ? (source.edition ?? null) : patch.source_edition.trim() === '' ? null : patch.source_edition;
    criterion.source = { name: patch.source_name ?? textOf(source.name), edition };
    for (const test of listOf(next, 'measurement_tests')) {
      for (const named of (Array.isArray(test.criteria) ? test.criteria : []) as Entry[]) {
        if (named.type === 'absolute' && named.seeded === criterion.key) named.source = structuredClone(criterion.source);
      }
    }
  }
  next.criteria = criteria;
  return back(next);
}

// --- a criterion the plate picks (fix batch e22h S1) ---------------------------------------------

/** What the Critérios tab shows on a row a test picks from the plate, read-only (editing bands is a later story). */
export interface PlateCriterionView {
  /** "Escolhido pela placa: TENSÃO NOMINAL". */
  lead: string;
  /** One line per band or class rule ("até 500 V: >=0,5 MΩ · NBR 5410"). */
  lines: string[];
  /** Whether the row's own rule and value still judge a reading: never under bands, under a class while the plate names none. */
  rowJudges: boolean;
  /** What the row's own rule and value do. */
  rowNote: string;
}

const fieldLabelIn = (draft: Draft, key: unknown): string => {
  const field = listOf(draft, 'nameplate').find((entry) => entry.key === key);
  const label = textOf(field?.label).trim();
  return label === '' ? textOf(key) : label;
};

const decimal = (value: number): string => String(value).replace('.', ',');

/** A band criterion as `formatCriterionValue` words it, with its source (">=0,5 MΩ · NBR 5410"). */
function bandText(band: Entry): string {
  const value = typeof band.value === 'number' ? band.value : 0;
  const unit = typeof band.unit === 'string' ? band.unit : null;
  const operator = band.operator === '>' ? '>' : '>=';
  const source = band.source !== null && typeof band.source === 'object' ? textOf((band.source as Entry).name).trim() : '';
  const criterion = formatCriterionValue({ operator, value, unit });
  return source === '' ? criterion : `${criterion} · ${source}`;
}

// The protection classes in the order the line names them, each judged at `accuracyClassDeviation`.
const PROTECTION_CLASS_ORDER = ['3P', '5P', '6P', '10P'] as const;

/**
 * The plate-picked view of the criteria row at `index`: the bands (`criterion_bands`, the
 * Quadro elétrico's NBR 5410 voltage bands) or the accuracy class (`criterion_class_field`, the TC
 * and TP) of the first test naming it that picks its criterion from the plate; null for a row no
 * such test names. The row judges nothing under bands unless another test or table names it too.
 */
export function plateCriterionOf(draft: CompanyTypeDraft | null, index: number): PlateCriterionView | null {
  const d = asDraft(draft);
  const key = textOf(listOf(d, 'criteria')[index]?.key);
  if (key === '') return null;
  const naming = listOf(d, 'tests').filter((test) => test.criterion_key === key);
  const picked = naming.find((test) => test.criterion_bands !== undefined || test.criterion_class_field !== undefined);
  if (picked === undefined) return null;
  const tables = listOf(d, 'measurement_tests').some((test) => ((Array.isArray(test.criteria) ? test.criteria : []) as Entry[]).some((criterion) => criterion.seeded === key));
  const otherUse = tables || naming.some((test) => test.criterion_bands === undefined);
  // authored: e22h S1, every sentence and line below.
  if (picked.criterion_bands !== undefined && picked.criterion_bands !== null && typeof picked.criterion_bands === 'object') {
    const bands = picked.criterion_bands as Entry;
    const field = fieldLabelIn(d, bands.field);
    const lines: string[] = [];
    if (bands.selv !== null && typeof bands.selv === 'object') lines.push(`${fieldLabelIn(d, bands.selv_field)} SIM: ${bandText(bands.selv as Entry)}`);
    const list = (Array.isArray(bands.bands) ? bands.bands : []) as Entry[];
    for (const band of list) lines.push(`até ${decimal(typeof band.up_to === 'number' ? band.up_to : 0)} V: ${bandText(band)}`);
    const last = list[list.length - 1];
    if (last !== undefined && typeof last.up_to === 'number') lines.push(`acima de ${decimal(last.up_to)} V: critério não avaliado`);
    return {
      lead: `Escolhido pela placa: a faixa de tensão do campo ${field} julga cada leitura.`,
      lines,
      rowJudges: otherUse,
      rowNote: otherUse ? 'Esta linha julga só as outras tabelas que a usam; a faixa da placa julga este ensaio.' : 'Esta linha não julga nenhuma leitura: a faixa da placa decide. Editar as faixas virá depois.',
    };
  }
  const field = fieldLabelIn(d, picked.criterion_class_field);
  const lines = [
    'classe de medição (0,3 · 0,6 · 1,2…): ± o valor da classe, em %',
    ...PROTECTION_CLASS_ORDER.map((cls) => `${cls}: ${formatCriterionValue({ operator: '±', value: accuracyClassDeviation(cls) ?? 0, unit: '%' })}`),
  ];
  return {
    lead: `Escolhido pela placa: a classe de exatidão do campo ${field} julga cada leitura.`,
    lines,
    rowJudges: true,
    rowNote: `Esta linha julga só enquanto a placa não informa a classe no campo ${field}.`,
  };
}
