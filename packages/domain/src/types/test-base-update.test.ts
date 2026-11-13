import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REVISION_B_DJ_OBJECTIVE, REVISION_B_DJ_RECOMMENDATION, REVISION_B_NAME, REVISION_B_TR_SE_INDEX_PROCEDURE, syntheticRevisionB } from '../../fixtures/test-base/revision-b.ts';
import type { EquipmentTypeRow, EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { definitionContext, EMPTY_DEFINITION_CONTEXT, findDefinition, type DefinitionContext } from '../seed/definitions.ts';
import { testIndexHelpOf, testRecommendationOf } from '../seed/test-help.ts';
import { companyTypeDefinitionSchema, type CompanyTypeDefinition, type CompanyTypeDraft } from './definition.ts';
import { newEquipmentTypeRow, typeVersionRow } from './duplicate.ts';
import { parseTestBaseText, planTestBaseImport, testBaseHelpOf, type TestBaseFile, type TestBaseImportPlan } from './test-base-import.ts';
import { planTestBaseUpdate, testBaseUpdateDraft, testBaseUpdatedText, testBaseUpdatePreview, type TestBaseUpdatePlan } from './test-base-update.ts';
import { validateTypeDraft } from './validate.ts';

/*
 * 25.23-UNIT (Story 25.23, contract 51): "Atualizar base de ensaios". The revisions are synthetic:
 * revision A is the synthetic base of Story 23.12, revision B (`fixtures/test-base/revision-b.ts`)
 * changes three of its texts, and the cases below derive further revisions in code. Nothing of the
 * real base enters git.
 */

const A: TestBaseFile = (() => {
  const parsed = parseTestBaseText(readFileSync(new URL('../../fixtures/test-base/base-ensaios-sintetica.json', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('the synthetic base does not parse');
  return parsed.file;
})();
const B = syntheticRevisionB(A);

type Entry = Record<string, unknown>;

interface Company {
  types: EquipmentTypeRow[];
  versions: EquipmentTypeVersionRow[];
  ctx: DefinitionContext;
}

const AT = '2026-11-12T12:00:00.000Z';

function company(types: EquipmentTypeRow[], versions: EquipmentTypeVersionRow[]): Company {
  return { types, versions, ctx: definitionContext(versions, types) };
}

/** The company after an import's copies were created and published as version 1. */
function imported(plan: TestBaseImportPlan): Company {
  const types: EquipmentTypeRow[] = [];
  const versions: EquipmentTypeVersionRow[] = [];
  plan.copies.forEach((copy, index) => {
    const row = newEquipmentTypeRow(`type-${index}`, copy.duplicate);
    const version = typeVersionRow({ id: `version-${index}-1`, type: row, definition: copy.duplicate.draft, publishedBy: 'user', publishedAt: AT });
    versions.push(version);
    types.push({ ...row, draft: null, latest_version: 1 });
  });
  return company(types, versions);
}

/** The company after the office publishes `definition` as the type's next version. */
function published(state: Company, typeId: string, definition: CompanyTypeDraft): Company {
  const type = state.types.find((one) => one.id === typeId)!;
  const version = typeVersionRow({ id: `version-${typeId}-${type.latest_version + 1}`, type, definition: definition as CompanyTypeDefinition, publishedBy: 'user', publishedAt: AT });
  return company(
    state.types.map((one) => (one.id === typeId ? { ...one, draft: null, latest_version: version.version } : one)),
    [...state.versions, version],
  );
}

/** The company after the update's drafts were written (each as the type's open draft) and published, with `takeBase` chosen. */
function updatedAndPublished(state: Company, plan: TestBaseUpdatePlan, takeBase: ReadonlySet<string> = new Set()): Company {
  let next = state;
  for (const update of plan.updates) {
    const draft = testBaseUpdateDraft(update, takeBase);
    if (draft !== null) next = published(next, update.typeId, draft);
  }
  return next;
}

const typeOf = (state: Company, label: string): EquipmentTypeRow => state.types.find((type) => state.ctx.versions.get(`${type.id}@${type.latest_version}`)?.definition.label === label)!;
const latest = (state: Company, label: string): CompanyTypeDefinition => {
  const type = typeOf(state, label);
  return state.ctx.versions.get(`${type.id}@${type.latest_version}`)!.definition;
};
const testIn = (definition: object, key: string): Entry => {
  const d = definition as { tests?: Entry[]; measurement_tests?: Entry[] };
  return [...(d.tests ?? []), ...(d.measurement_tests ?? [])].find((test) => test.key === key)!;
};
/** The office edits one text of a type's test and publishes it. */
function officeEdit(state: Company, label: string, testKey: string, field: string, value: unknown): Company {
  const definition = structuredClone(latest(state, label)) as unknown as Entry;
  testIn(definition, testKey)[field] = value;
  return published(state, typeOf(state, label).id, definition as CompanyTypeDraft);
}
/** A copy as the import wrote it before Story 25.23: no record of the base's texts and no index help. */
function preStory(state: Company): Company {
  const strip = (definition: CompanyTypeDefinition): CompanyTypeDefinition => {
    const copy = structuredClone(definition) as unknown as { tests: Entry[]; measurement_tests?: Entry[] };
    for (const test of [...copy.tests, ...(copy.measurement_tests ?? [])]) {
      delete test.base_texts;
      delete test.index_help;
    }
    return copy as unknown as CompanyTypeDefinition;
  };
  return company(
    state.types,
    state.versions.map((version) => ({ ...version, definition: strip(version.definition) })),
  );
}

const IMPORT_A = planTestBaseImport(A, EMPTY_DEFINITION_CONTEXT);
const DJ = IMPORT_A.copies.find((copy) => copy.equipmentId === 'DJ')!.label;
const TR_SE = IMPORT_A.copies.find((copy) => copy.equipmentId === 'TR-SE')!.label;
const TR_OL = IMPORT_A.copies.find((copy) => copy.equipmentId === 'TR-OL')!.label;
const row = (file: TestBaseFile, id: string) => file.ensaios.find((one) => one.id === id)!;

describe('25.23-UNIT the provenance of a text', () => {
  it('the import records each text the base fills with the file revision, and the IP row fills the index help', () => {
    const state = imported(IMPORT_A);
    const dj = testIn(latest(state, DJ), 'isolacao');
    expect(dj.base_texts).toEqual({
      help: { revision: 'sintética 1', value: testBaseHelpOf(row(A, 'DJ-02')) },
      recommendation: { revision: 'sintética 1', value: row(A, 'DJ-02').recomendacao_reprovado },
    });
    const tr = testIn(latest(state, TR_SE), 'isolacao');
    expect(tr.index_help).toEqual(testBaseHelpOf(row(A, 'TR-SE-03')));
    expect((tr.base_texts as Entry).index_help).toEqual({ revision: 'sintética 1', value: testBaseHelpOf(row(A, 'TR-SE-03')) });
    expect((tr.base_texts as Entry).index_recommendation).toEqual({ revision: 'sintética 1', value: row(A, 'TR-SE-03').recomendacao_reprovado });
    for (const copy of IMPORT_A.copies) {
      expect(companyTypeDefinitionSchema.safeParse(copy.duplicate.draft).success, copy.label).toBe(true);
      expect(validateTypeDraft(copy.duplicate.draft), copy.label).toEqual([]);
    }
  });

  it('a file with no versao records the revision as null', () => {
    const plan = planTestBaseImport({ ...A, versao: undefined }, EMPTY_DEFINITION_CONTEXT);
    const dj = testIn(plan.copies.find((copy) => copy.label === DJ)!.duplicate.draft, 'isolacao');
    expect((dj.base_texts as Entry).help).toMatchObject({ revision: null });
  });

  it('the strict schema refuses a record whose text is blank or over the cap, and an unknown text key', () => {
    const draft = structuredClone(IMPORT_A.copies.find((copy) => copy.label === DJ)!.duplicate.draft) as unknown as Entry;
    const test = testIn(draft, 'isolacao');
    test.base_texts = { recommendation: { revision: 'x', value: ' ' } };
    expect(companyTypeDefinitionSchema.safeParse(draft).success).toBe(false);
    test.base_texts = { recommendation: { revision: 'x', value: 'y'.repeat(1001) } };
    expect(companyTypeDefinitionSchema.safeParse(draft).success).toBe(false);
    test.base_texts = { norma: { revision: 'x', value: 'y' } };
    expect(companyTypeDefinitionSchema.safeParse(draft).success).toBe(false);
  });
});

describe('25.23-UNIT the update plan', () => {
  it('the same revision over its own import changes nothing and says so', () => {
    const plan = planTestBaseUpdate(A, imported(IMPORT_A).ctx);
    expect(plan.updates).toEqual([]);
    expect(plan.creates).toEqual([]);
    const preview = testBaseUpdatePreview(plan);
    expect(preview.writes).toBe(false);
    expect(preview.lines).toEqual(['Os tipos da empresa já estão com os textos desta base. Nada será gravado.']);
  });

  it('AC1: a text the held test lacks is named in the preview and lands in the draft', () => {
    const before = structuredClone(A);
    row(before, 'DJ-02').recomendacao_reprovado = '—';
    const state = imported(planTestBaseImport(before, EMPTY_DEFINITION_CONTEXT));
    expect(testIn(latest(state, DJ), 'isolacao').recommendation).toBeUndefined();
    const plan = planTestBaseUpdate(A, state.ctx);
    const dj = plan.updates.find((update) => update.label === DJ)!;
    expect(dj.filled).toEqual([{ testKey: 'isolacao', text: 'recommendation' }]);
    expect(plan.updates.map((update) => update.label)).toEqual([DJ]);
    const preview = testBaseUpdatePreview(plan);
    expect(preview.lines).toEqual([
      'Atualiza 1 tipo da empresa com esta base. Nada é publicado: cada tipo ganha um rascunho para você conferir e publicar.',
      'Acrescenta os textos de 1 ensaio que estavam vazios.',
    ]);
    const draft = testBaseUpdateDraft(dj, new Set())!;
    expect(testIn(draft, 'isolacao').recommendation).toBe(row(A, 'DJ-02').recomendacao_reprovado);
    expect((testIn(draft, 'isolacao').base_texts as Entry).recommendation).toEqual({ revision: 'sintética 1', value: row(A, 'DJ-02').recomendacao_reprovado });
    expect(companyTypeDefinitionSchema.safeParse(draft).success).toBe(true);
  });

  it('AC2: a held type copied from an older seed gets the tests the current seed added, with their texts and criteria', () => {
    const old = planTestBaseImport(A, EMPTY_DEFINITION_CONTEXT, 'v12');
    const state = imported(old);
    const held = latest(state, TR_OL);
    const v12 = findDefinition('v12', 'transformador_forca')!;
    const v12Keys = new Set([...v12.tests, ...(v12.measurement_tests ?? [])].map((test) => test.key));
    expect(testIn(held, 'resistencia_enrolamento')).toBeUndefined();
    const plan = planTestBaseUpdate(A, state.ctx);
    const tr = plan.updates.find((update) => update.label === TR_OL)!;
    expect(tr.added).toContain('resistencia_enrolamento');
    for (const key of tr.added) expect(v12Keys.has(key)).toBe(false);
    const draft = testBaseUpdateDraft(tr, new Set())! as unknown as CompanyTypeDefinition;
    const winding = testIn(draft, 'resistencia_enrolamento');
    expect(winding.help).toEqual(testBaseHelpOf(row(A, 'TR-OL-05')));
    expect(winding.base_texts).toBeDefined();
    const criteria = new Set(draft.criteria.map((criterion) => criterion.key));
    for (const test of draft.measurement_tests ?? []) {
      for (const criterion of test.criteria) if (criterion.type === 'absolute' && criterion.seeded !== undefined) expect(criteria.has(criterion.seeded), criterion.seeded).toBe(true);
    }
    expect(testBaseUpdatePreview(plan).lines[1]).toMatch(/^Acrescenta \d+ ensaios? que os tipos ainda não têm/);
  });

  it('AC2: a test the office removed from a copy of the current seed is not added again', () => {
    const state = imported(IMPORT_A);
    const definition = structuredClone(latest(state, TR_OL)) as unknown as { measurement_tests: Entry[] };
    definition.measurement_tests = definition.measurement_tests.filter((test) => test.key !== 'resistencia_enrolamento');
    const removed = published(state, typeOf(state, TR_OL).id, definition as unknown as CompanyTypeDraft);
    const plan = planTestBaseUpdate(A, removed.ctx);
    expect(plan.updates.find((update) => update.label === TR_OL)).toBeUndefined();
  });

  it('AC2: a test an earlier update added and the office then removed is not added again by a later update (review of PR #333)', () => {
    const state = imported(planTestBaseImport(A, EMPTY_DEFINITION_CONTEXT, 'v12'));
    const first = planTestBaseUpdate(A, state.ctx);
    expect(first.updates.find((update) => update.label === TR_OL)!.added).toContain('resistencia_enrolamento');
    const updated = updatedAndPublished(state, first);
    const definition = structuredClone(latest(updated, TR_OL)) as unknown as { measurement_tests: Entry[] };
    definition.measurement_tests = definition.measurement_tests.filter((test) => test.key !== 'resistencia_enrolamento');
    const removed = published(updated, typeOf(updated, TR_OL).id, definition as unknown as CompanyTypeDraft);
    const second = planTestBaseUpdate(B, removed.ctx);
    expect(second.updates.find((update) => update.label === TR_OL)?.added ?? []).not.toContain('resistencia_enrolamento');
  });

  it('AC3: a text the office edited that the revision also changed is listed and kept unless the office takes the base', () => {
    const state = officeEdit(imported(IMPORT_A), DJ, 'isolacao', 'recommendation', 'Texto da empresa.');
    const plan = planTestBaseUpdate(B, state.ctx);
    const dj = plan.updates.find((update) => update.label === DJ)!;
    expect(dj.differing.map((diff) => [diff.testKey, diff.text])).toEqual([['isolacao', 'recommendation']]);
    // The objective nobody edited is replaced by itself.
    expect(dj.replaced).toEqual([{ testKey: 'isolacao', text: 'help' }]);
    const preview = testBaseUpdatePreview(plan);
    expect(preview.differingHeading).toBe('Editados pela empresa e diferentes nesta base (1)');
    expect(preview.differing).toEqual([{ id: `${typeOf(state, DJ).id}/isolacao/recommendation`, where: `${DJ} · ${testIn(latest(state, DJ), 'isolacao').label as string} · Recomendação se reprovado` }]);
    const kept = testBaseUpdateDraft(dj, new Set())!;
    expect(testIn(kept, 'isolacao').recommendation).toBe('Texto da empresa.');
    expect((testIn(kept, 'isolacao').help as Entry).objective).toBe(REVISION_B_DJ_OBJECTIVE);
    const taken = testBaseUpdateDraft(dj, new Set([dj.differing[0]!.id]))!;
    expect(testIn(taken, 'isolacao').recommendation).toBe(REVISION_B_DJ_RECOMMENDATION);
  });

  it('AC3: an edited text the revision did not change is neither listed nor replaced', () => {
    const state = officeEdit(imported(IMPORT_A), DJ, 'isolacao', 'recommendation', 'Texto da empresa.');
    const plan = planTestBaseUpdate(A, state.ctx);
    expect(plan.updates).toEqual([]);
  });

  it('AC4: after one update, a later revision replaces by itself a text nobody edited since, and says so', () => {
    const edited = officeEdit(imported(IMPORT_A), DJ, 'isolacao', 'recommendation', 'Texto da empresa.');
    const afterB = updatedAndPublished(edited, planTestBaseUpdate(B, edited.ctx));
    const dj = testIn(latest(afterB, DJ), 'isolacao');
    expect(dj.recommendation).toBe('Texto da empresa.');
    expect((dj.base_texts as Entry).recommendation).toEqual({ revision: REVISION_B_NAME, value: REVISION_B_DJ_RECOMMENDATION });
    const C = structuredClone(B);
    C.versao = 'sintética 3';
    row(C, 'DJ-02').norma = 'Norma sintética DJ-02, revisão 3';
    const plan = planTestBaseUpdate(C, afterB.ctx);
    const update = plan.updates.find((one) => one.label === DJ)!;
    expect(update.replaced).toEqual([{ testKey: 'isolacao', text: 'help' }]);
    expect(update.differing).toEqual([]);
    expect(testBaseUpdatePreview(plan).lines).toContain('Substitui 1 texto que ninguém editou desde a última atualização.');
    const draft = testBaseUpdateDraft(update, new Set())!;
    expect((testIn(draft, 'isolacao').help as Entry).standard).toBe('Norma sintética DJ-02, revisão 3');
    expect(testIn(draft, 'isolacao').recommendation).toBe('Texto da empresa.');
    expect((testIn(draft, 'isolacao').base_texts as Entry).help).toMatchObject({ revision: 'sintética 3' });
  });

  it('AC5: the update writes drafts only; no published version changes', () => {
    const state = officeEdit(imported(IMPORT_A), DJ, 'isolacao', 'recommendation', 'Texto da empresa.');
    const versions = structuredClone(state.versions);
    const types = structuredClone(state.types);
    const plan = planTestBaseUpdate(B, state.ctx);
    for (const update of plan.updates) testBaseUpdateDraft(update, new Set(update.differing.map((diff) => diff.id)));
    expect(state.versions).toEqual(versions);
    expect(state.types).toEqual(types);
    const after = updatedAndPublished(state, plan);
    for (const version of versions) expect(after.versions.find((one) => one.id === version.id)).toEqual(version);
  });

  it("AC6: revision B's IP row replaces the index's own help, which the sheet reads from the new version", () => {
    const state = imported(IMPORT_A);
    const plan = planTestBaseUpdate(B, state.ctx);
    const tr = plan.updates.find((update) => update.label === TR_SE)!;
    expect(tr.replaced).toEqual([{ testKey: 'isolacao', text: 'index_help' }]);
    const after = updatedAndPublished(state, plan);
    const help = testIndexHelpOf(latest(after, TR_SE) as never, 'isolacao');
    expect(help?.procedure).toBe(REVISION_B_TR_SE_INDEX_PROCEDURE);
    expect(testRecommendationOf(latest(after, TR_SE) as never, 'isolacao')).toBe(row(A, 'TR-SE-02').recomendacao_reprovado);
  });

  it('a type imported before this story: every differing text is listed, none replaced by itself, the index help filled', () => {
    const state = preStory(imported(IMPORT_A));
    const plan = planTestBaseUpdate(B, state.ctx);
    const dj = plan.updates.find((update) => update.label === DJ)!;
    expect(dj.replaced).toEqual([]);
    expect(dj.differing.map((diff) => diff.text).sort()).toEqual(['help', 'recommendation']);
    const tr = plan.updates.find((update) => update.label === TR_SE)!;
    expect(tr.filled).toEqual([{ testKey: 'isolacao', text: 'index_help' }]);
    expect(tr.differing).toEqual([]);
    expect(testBaseUpdatePreview(plan).lines[1]).toBe('Acrescenta os textos de 2 ensaios que estavam vazios, entre eles o "Como ensaiar" do índice de polarização.');
    // Only the index help is new on TR-OL too (A's TR-OL-03 row); its unedited texts get a record.
    const ol = testBaseUpdateDraft(plan.updates.find((update) => update.label === TR_OL)!, new Set())!;
    expect((testIn(ol, 'isolacao').base_texts as Entry).help).toMatchObject({ revision: REVISION_B_NAME });
    // Both kept and nothing else to write: DJ gets no draft, so the same revision lists them again.
    expect(testBaseUpdateDraft(dj, new Set())).toBeNull();
    const after = updatedAndPublished(state, plan);
    expect(planTestBaseUpdate(B, after.ctx).updates.find((update) => update.label === DJ)!.differing).toHaveLength(2);
    // Taking one writes the draft, with a record for both: the kept one is no longer listed for B.
    const taken = updatedAndPublished(state, plan, new Set([dj.differing.find((diff) => diff.text === 'help')!.id]));
    expect(planTestBaseUpdate(B, taken.ctx).updates.find((update) => update.label === DJ)).toBeUndefined();
  });

  it('a type the company does not hold is planned as the import plans it and created as a draft', () => {
    const state = imported(IMPORT_A);
    const discarded = company(
      state.types.map((type) => (type.id === typeOf(state, DJ).id ? { ...type, removed_at: AT } : type)),
      state.versions,
    );
    const plan = planTestBaseUpdate(B, discarded.ctx);
    expect(plan.creates.map((copy) => copy.label)).toEqual([DJ]);
    const preview = testBaseUpdatePreview(plan);
    expect(preview.after[0]).toBe(`Cria 1 tipo que a empresa ainda não tem, como na importação: ${DJ}.`);
    expect(testBaseUpdatedText(1, 1)).toBe('1 tipo atualizado e 1 importado da base de ensaios · rascunhos para publicar');
    expect(testBaseUpdatedText(3, 0)).toBe('3 tipos atualizados da base de ensaios · rascunhos para publicar');
    expect(testBaseUpdatedText(0, 2)).toBe('2 tipos importados da base de ensaios · rascunhos para publicar');
  });

  it('an update over an open draft builds on the draft, not on the published version', () => {
    const state = imported(IMPORT_A);
    const dj = typeOf(state, DJ);
    const draft = structuredClone(latest(state, DJ)) as unknown as Entry;
    draft.print_title = 'Título da empresa';
    const withDraft = company(
      state.types.map((type) => (type.id === dj.id ? { ...type, draft: draft as CompanyTypeDraft } : type)),
      state.versions,
    );
    const update = planTestBaseUpdate(B, withDraft.ctx).updates.find((one) => one.label === DJ)!;
    expect((testBaseUpdateDraft(update, new Set()) as Entry).print_title).toBe('Título da empresa');
  });

  it('a file whose rows reach no test of the app writes nothing and says so', () => {
    const plan = planTestBaseUpdate({ ensaios: [{ id: 'XX-01', equipamento: 'XX' }] }, imported(IMPORT_A).ctx);
    const preview = testBaseUpdatePreview(plan);
    expect(preview.writes).toBe(false);
    expect(preview.lines[0]).toBe('Nenhum ensaio desta base tem ensaio correspondente no app. Nada será gravado.');
    expect(preview.after).toEqual(['Sem ensaio no app: XX-01.']);
  });
});
