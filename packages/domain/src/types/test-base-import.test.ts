import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EquipmentTypeRow, EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { definitionContext, EMPTY_DEFINITION_CONTEXT, findDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { TEST_TEXT_MAX_LENGTH } from '../seed/test-help.ts';
import { companyTypeDefinitionSchema, type CompanyTypeDefinition } from './definition.ts';
import { newEquipmentTypeRow, typeVersionRow } from './duplicate.ts';
import {
  parseTestBaseText,
  planTestBaseImport,
  TEST_BASE_EQUIPMENT_TYPES,
  TEST_BASE_ROW_TESTS,
  testBaseHelpOf,
  testBaseImportedText,
  testBaseImportPreviewText,
  testBaseInvalidText,
  testBaseRecommendationOf,
  type TestBaseFile,
  type TestBaseImportPlan,
  type TestBaseRow,
} from './test-base-import.ts';
import { validateTypeDraft } from './validate.ts';

/*
 * Story 23.12 (batch e23x): the base import's planner. The fixture is synthetic: rev08's shape and
 * row IDs, invented text only (M-1 (b): the base's prose never enters git).
 */

const FIXTURE_TEXT = readFileSync(new URL('../../fixtures/test-base/base-ensaios-sintetica.json', import.meta.url), 'utf8');

function fixture(): TestBaseFile {
  const parsed = parseTestBaseText(FIXTURE_TEXT);
  if (!parsed.ok) throw new Error('the synthetic base does not parse');
  return parsed.file;
}

const rowOf = (file: TestBaseFile, id: string): TestBaseRow => file.ensaios.find((row) => row.id === id)!;

interface TestLike {
  key: string;
  help?: Record<string, string>;
  recommendation?: string;
}
const testOf = (definition: CompanyTypeDefinition, key: string): TestLike | undefined =>
  [...(definition.tests as unknown as TestLike[]), ...((definition.measurement_tests ?? []) as unknown as TestLike[])].find((test) => test.key === key);

/** Whether the current seed's definition of `blockType` carries the test `key` (in either grammar). */
function seedHasTest(blockType: string, key: string): boolean {
  const definition = findDefinition(SEED_VERSION, blockType);
  if (definition === null) return false;
  return [...definition.tests, ...(definition.measurement_tests ?? [])].some((test) => test.key === key);
}

/** The context after the plan's copies were created and published (or left as drafts). */
function importedContext(plan: TestBaseImportPlan, extra: EquipmentTypeRow[] = []): { ctx: ReturnType<typeof definitionContext>; types: EquipmentTypeRow[]; versions: EquipmentTypeVersionRow[] } {
  const types: EquipmentTypeRow[] = [];
  const versions: EquipmentTypeVersionRow[] = [];
  plan.copies.forEach((copy, index) => {
    const row = newEquipmentTypeRow(`type-${index}`, copy.duplicate);
    if (copy.publishable) {
      const version = typeVersionRow({ id: `version-${index}`, type: row, definition: copy.duplicate.draft, publishedBy: 'user', publishedAt: '2026-11-09T12:00:00.000Z' });
      versions.push(version);
      types.push({ ...row, draft: null, latest_version: version.version });
    } else types.push(row);
  });
  const all = [...types, ...extra];
  return { ctx: definitionContext(versions, all), types: all, versions };
}

const WAVE_1 = ['TR-OL-02', 'TR-OL-04', 'TR-SE-02', 'TR-SE-04', 'DJ-02', 'DJ-03', 'SC-02', 'SC-03', 'TC-02', 'TC-03', 'TP-02', 'TP-03', 'PR-02', 'CB-02'];

describe('Story 23.12: the base file', () => {
  it('parses the synthetic base, and refuses invalid JSON and a file with no rows', () => {
    expect(parseTestBaseText(FIXTURE_TEXT).ok).toBe(true);
    expect(parseTestBaseText('{ not json')).toEqual({ ok: false, reason: 'json' });
    expect(parseTestBaseText('{"versao":"x"}')).toEqual({ ok: false, reason: 'shape' });
    expect(parseTestBaseText('{"ensaios":[{"equipamento":"DJ"}]}')).toEqual({ ok: false, reason: 'shape' });
    expect(parseTestBaseText('[]')).toEqual({ ok: false, reason: 'shape' });
  });

  it('keeps unknown keys and every text as written', () => {
    const file = fixture();
    expect((file as Record<string, unknown>)['equipamentos']).toBeDefined();
    const dj = rowOf(file, 'DJ-02');
    expect(testBaseHelpOf(dj).procedure).toBe(dj.procedimento);
    expect(testBaseRecommendationOf(dj)).toBe(dj.recomendacao_reprovado);
  });

  it('composes the criterion from the present levels, one per line, and leaves NR-10 out', () => {
    const dj = rowOf(fixture(), 'DJ-02');
    const help = testBaseHelpOf(dj);
    expect(help.criterion).toBe(`Aprovado: ${dj.criterio_aprovado}\nCom restrições: ${dj.criterio_restricao}\nReprovado: ${dj.criterio_reprovado}`);
    expect(help.nr10).toBeUndefined();
    expect(Object.keys(help)).toHaveLength(7);
    expect(testBaseHelpOf({ ...dj, criterio_restricao: ' — ', criterio_aprovado: '' }).criterion).toBe(`Reprovado: ${dj.criterio_reprovado}`);
  });

  it('treats empty, blank and dash-only values as no value', () => {
    for (const none of ['', '   ', '—', '–', '-', ' - ', '--', '——', '- -', ' –— ']) {
      const row: TestBaseRow = { id: 'DJ-02', equipamento: 'DJ', objetivo: none, recomendacao_reprovado: none };
      expect(testBaseHelpOf(row).objective).toBeUndefined();
      expect(testBaseRecommendationOf(row)).toBeNull();
    }
    expect(testBaseHelpOf({ id: 'DJ-02', equipamento: 'DJ', objetivo: '  texto  ' }).objective).toBe('  texto  ');
    expect(testBaseHelpOf({ id: 'DJ-02', equipamento: 'DJ', objetivo: '-texto-' }).objective).toBe('-texto-');
  });

  it('accepts a null text column as no value, and still plans the row', () => {
    const file = fixture();
    const raw = JSON.parse(FIXTURE_TEXT) as { ensaios: Record<string, unknown>[] };
    raw.ensaios = raw.ensaios.map((row) => (row['id'] === 'DJ-02' ? { ...row, norma: null, recomendacao_reprovado: null } : row));
    const parsed = parseTestBaseText(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const dj = rowOf(parsed.file, 'DJ-02');
    expect(testBaseHelpOf(dj).standard).toBeUndefined();
    expect(testBaseRecommendationOf(dj)).toBeNull();
    const copy = planTestBaseImport(parsed.file, EMPTY_DEFINITION_CONTEXT).copies.find((c) => c.equipmentId === 'DJ')!;
    const test = testOf(copy.duplicate.draft, 'isolacao')!;
    expect(test.help?.['procedure']).toBe(rowOf(file, 'DJ-02').procedimento);
    expect(test.recommendation).toBeUndefined();
  });
});

describe('Story 23.12: the plan over a company with no copies', () => {
  const file = fixture();
  const plan = planTestBaseImport(file, EMPTY_DEFINITION_CONTEXT);

  it('plans one copy per base equipment and seeded type, labelled with the equipment ID', () => {
    for (const copy of plan.copies) {
      const seeded = findDefinition(SEED_VERSION, copy.blockType)!;
      expect(copy.label).toBe(`${seeded.label} (${copy.equipmentId})`);
      expect(copy.duplicate.draft.label).toBe(copy.label);
      expect(copy.duplicate.derived_from).toEqual({ seed_version: SEED_VERSION, block_type: copy.blockType });
      expect(TEST_BASE_EQUIPMENT_TYPES[copy.equipmentId]).toContain(copy.blockType);
    }
    const pairs = plan.copies.map((copy) => `${copy.equipmentId}:${copy.blockType}`);
    expect(pairs).toEqual(expect.arrayContaining(['TR-OL:transformador_forca', 'TR-SE:transformador_forca', 'DJ:disjuntor_mt', 'SC:chave_seccionadora', 'TC:tc', 'TP:tp', 'PR:para_raio', 'CB:cabos_entrada', 'CB:cabos_saida']));
    expect(new Set(plan.copies.map((copy) => copy.label)).size).toBe(plan.copies.length);
    expect(plan.alreadyImported).toEqual([]);
  });

  it('lands every wave 1 row procedure and recommendation verbatim on its mapped test', () => {
    for (const rowId of WAVE_1) {
      const row = rowOf(file, rowId);
      const testKey = TEST_BASE_ROW_TESTS[rowId]!;
      const copies = plan.copies.filter((copy) => copy.equipmentId === row.equipamento);
      expect(copies.length, rowId).toBeGreaterThan(0);
      for (const copy of copies) {
        expect(copy.rows).toContainEqual({ rowId, testKey });
        const test = testOf(copy.duplicate.draft, testKey)!;
        expect(test.help?.['procedure'], rowId).toBe(row.procedimento);
        expect(test.recommendation, rowId).toBe(row.recomendacao_reprovado);
      }
    }
  });

  it('gives drafts that pass the company type schema and the editor validation, so each is published', () => {
    for (const copy of plan.copies) {
      expect(companyTypeDefinitionSchema.safeParse(copy.duplicate.draft).success, copy.label).toBe(true);
      expect(validateTypeDraft(copy.duplicate.draft), copy.label).toEqual([]);
      expect(copy.publishable).toBe(true);
    }
  });

  it('leaves a placeholder heading out (TC-02 voltage)', () => {
    const tc = plan.copies.find((copy) => copy.equipmentId === 'TC')!;
    const help = testOf(tc.duplicate.draft, 'isolacao')!.help!;
    expect(help['voltage']).toBeUndefined();
    expect(help['procedure']).toBe(rowOf(file, 'TC-02').procedimento);
  });

  it('never cuts a text over the cap: the heading is absent and the row refused', () => {
    const sc04 = rowOf(file, 'SC-04');
    expect(sc04.procedimento!.length).toBeGreaterThan(TEST_TEXT_MAX_LENGTH);
    const sc = plan.copies.find((copy) => copy.equipmentId === 'SC')!;
    if (seedHasTest('chave_seccionadora', 'resistencia_fusiveis')) {
      const help = testOf(sc.duplicate.draft, 'resistencia_fusiveis')!.help!;
      expect(help['procedure']).toBeUndefined();
      expect(help['objective']).toBe(sc04.objetivo);
      expect(plan.refused).toEqual(['SC-04']);
    }
    for (const copy of plan.copies) {
      for (const test of [...(copy.duplicate.draft.tests as unknown as TestLike[]), ...((copy.duplicate.draft.measurement_tests ?? []) as unknown as TestLike[])]) {
        for (const text of Object.values(test.help ?? {})) expect(text.length).toBeLessThanOrEqual(TEST_TEXT_MAX_LENGTH);
      }
    }
  });

  it('lists the unmapped rows and the rows whose test the seed lacks as unattached', () => {
    for (const id of ['CM-02', 'CP-02', 'DJ-04']) expect(plan.unattached).toContain(id);
    // Fix batch e23z (W3-7): the IP rows attach to the insulation test that judges the index.
    for (const id of ['TR-OL-03', 'TR-SE-03']) expect(plan.unattached).not.toContain(id);
    for (const [rowId, testKey] of Object.entries(TEST_BASE_ROW_TESTS)) {
      const row = rowOf(file, rowId);
      const blockTypes = row.equipamento === 'TODOS' ? Object.values(TEST_BASE_EQUIPMENT_TYPES).flat() : (TEST_BASE_EQUIPMENT_TYPES[row.equipamento] ?? []);
      const attaches = blockTypes.some((blockType) => seedHasTest(blockType, testKey));
      expect(plan.unattached.includes(rowId), rowId).toBe(!attaches);
    }
    // No copy for an equipment with no attached row (CM, CP have no mapped row; AT has none while its type is absent).
    expect(plan.copies.some((copy) => copy.equipmentId === 'CM' || copy.equipmentId === 'CP')).toBe(false);
    if (findDefinition(SEED_VERSION, 'malha_aterramento') === null) {
      expect(plan.copies.some((copy) => copy.equipmentId === 'AT')).toBe(false);
      expect(plan.unattached).toEqual(expect.arrayContaining(['AT-01', 'AT-02']));
    }
  });

  it('attaches the TODOS row to every planned copy whose definition has its test, and to none other', () => {
    const ge = rowOf(file, 'GE-01');
    for (const copy of plan.copies) {
      const has = seedHasTest(copy.blockType, 'termografia');
      expect(copy.rows.some((row) => row.rowId === 'GE-01'), copy.label).toBe(has);
      if (has) expect(testOf(copy.duplicate.draft, 'termografia')!.recommendation).toBe(ge.recomendacao_reprovado);
    }
  });

  it('after e23e (Stories 23.20, 23.21): GE-01 lands on the termografia of every FO.SERV-03 copy, AT-01 and AT-02 on the malha copy', () => {
    const ge = rowOf(file, 'GE-01');
    const eight = ['transformador_forca', 'disjuntor_mt', 'chave_seccionadora', 'tc', 'tp', 'para_raio', 'cabos_entrada', 'cabos_saida'];
    for (const blockType of eight) {
      const copies = plan.copies.filter((copy) => copy.blockType === blockType);
      expect(copies.length, blockType).toBeGreaterThan(0);
      for (const copy of copies) {
        expect(copy.rows, copy.label).toContainEqual({ rowId: 'GE-01', testKey: 'termografia' });
        const test = testOf(copy.duplicate.draft, 'termografia')!;
        expect(test.recommendation, copy.label).toBe(ge.recomendacao_reprovado);
        expect((test.help as { procedure?: string }).procedure, copy.label).toBe(ge.procedimento);
      }
    }
    expect(plan.unattached).not.toContain('GE-01');
    const malha = plan.copies.filter((copy) => copy.equipmentId === 'AT');
    expect(malha.map((copy) => copy.blockType)).toEqual(['malha_aterramento']);
    expect(malha[0]!.label).toBe('Malha de aterramento (AT)');
    expect(malha[0]!.publishable).toBe(true);
    for (const [rowId, testKey] of [['AT-01', 'resistencia_malha'], ['AT-02', 'continuidade_malha']] as const) {
      const row = rowOf(file, rowId);
      expect(malha[0]!.rows).toContainEqual({ rowId, testKey });
      const test = testOf(malha[0]!.duplicate.draft, testKey)!;
      expect(test.recommendation, rowId).toBe(row.recomendacao_reprovado);
      expect((test.help as { procedure?: string }).procedure, rowId).toBe(row.procedimento);
      expect(plan.unattached).not.toContain(rowId);
    }
  });

  it('derives the preview, the toast and the invalid-file line', () => {
    const preview = testBaseImportPreviewText(plan);
    expect(preview).toMatch(new RegExp(`^Cria ${plan.copies.length} tipos da empresa, com os textos de \\d+ ensaios: `));
    expect(preview).toContain('Disjuntor');
    expect(preview).toContain('Sem ensaio no app: ');
    expect(preview).toContain('CM-02');
    if (plan.refused.length > 0) expect(preview).toContain('Texto acima de 1000 caracteres, deixado de fora: SC-04.');
    expect(testBaseImportedText(1)).toBe('1 tipo importado da base de ensaios');
    expect(testBaseImportedText(9)).toBe('9 tipos importados da base de ensaios');
    expect(testBaseInvalidText('json')).toContain('Nada foi gravado.');
    expect(testBaseInvalidText()).toBe('Este arquivo não é uma base de ensaios. Nada foi gravado.');
  });
});

describe('Story 23.12: re-import is idempotent and partial', () => {
  const file = fixture();
  const first = planTestBaseImport(file, EMPTY_DEFINITION_CONTEXT);

  it('plans none over the published copies, and says so', () => {
    const { ctx } = importedContext(first);
    const again = planTestBaseImport(file, ctx);
    expect(again.copies).toEqual([]);
    expect(again.alreadyImported).toEqual(first.copies.map((copy) => copy.label));
    expect(again.refused).toEqual([]);
    expect(again.unattached).toEqual(first.unattached);
    expect(testBaseImportPreviewText(again).split('\n')[0]).toBe('Todos os tipos desta base já foram importados. Nada será gravado.');
  });

  it('plans again only a discarded copy', () => {
    const { types, versions } = importedContext(first);
    const discarded = types.map((type, index) => (index === 0 ? { ...type, removed_at: '2026-11-09T13:00:00.000Z' } : type));
    const again = planTestBaseImport(file, definitionContext(versions, discarded));
    expect(again.copies.map((copy) => copy.label)).toEqual([first.copies[0]!.label]);
    const others = first.copies.slice(1).map((copy) => copy.label);
    expect(again.alreadyImported).toEqual(others);
    const preview = testBaseImportPreviewText(again);
    expect(preview).toContain(`Cria 1 tipo da empresa`);
    expect(preview).toContain('Já importado: ');
    for (const label of others) expect(preview).toContain(label);
  });

  it('plans again only a renamed copy', () => {
    const { types, versions } = importedContext(first);
    const renamedVersions = versions.map((version, index) => (index === 1 ? { ...version, definition: { ...version.definition, label: 'Nome novo' } } : version));
    const again = planTestBaseImport(file, definitionContext(renamedVersions, types));
    expect(again.copies.map((copy) => copy.label)).toEqual([first.copies[1]!.label]);
  });

  it('ignores a company type of the same name from another source', () => {
    const copy = first.copies[0]!;
    const other: EquipmentTypeRow = { ...newEquipmentTypeRow('other', { derived_from: null as never, draft: { ...copy.duplicate.draft } }), derived_from: null };
    const again = planTestBaseImport(file, definitionContext([], [other]));
    expect(again.copies.map((c) => c.label)).toContain(copy.label);
  });
});

describe('Story 23.12: texts over the cap', () => {
  /** The fixture with one DJ-02 column replaced, planned over an empty company; the DJ copy. */
  function djWith(change: Record<string, string>) {
    const raw = JSON.parse(FIXTURE_TEXT) as { ensaios: Record<string, unknown>[] };
    raw.ensaios = raw.ensaios.map((row) => (row['id'] === 'DJ-02' ? { ...row, ...change } : row));
    const parsed = parseTestBaseText(JSON.stringify(raw));
    if (!parsed.ok) throw new Error('the changed base does not parse');
    const plan = planTestBaseImport(parsed.file, EMPTY_DEFINITION_CONTEXT);
    return { plan, copy: plan.copies.find((copy) => copy.equipmentId === 'DJ')! };
  }

  it('a recommendation over the cap is left out and the row refused; the copy is still published', () => {
    const { plan, copy } = djWith({ recomendacao_reprovado: 'r'.repeat(TEST_TEXT_MAX_LENGTH + 1) });
    const test = testOf(copy.duplicate.draft, 'isolacao')!;
    expect(test.recommendation).toBeUndefined();
    expect(test.help?.['procedure']).toBeDefined();
    expect(plan.refused).toContain('DJ-02');
    expect(copy.publishable).toBe(true);
  });

  it('a composed criterion over the cap, each level under it, is left out and the row refused; the copy is still published', () => {
    const level = 'c'.repeat(400);
    const { plan, copy } = djWith({ criterio_aprovado: level, criterio_restricao: level, criterio_reprovado: level });
    const test = testOf(copy.duplicate.draft, 'isolacao')!;
    expect(test.help?.['criterion']).toBeUndefined();
    expect(test.help?.['objective']).toBeDefined();
    expect(test.recommendation).toBeDefined();
    expect(plan.refused).toContain('DJ-02');
    expect(copy.publishable).toBe(true);
  });
});

describe('Story 23.12: a base with no row the app knows', () => {
  it('says no row has a test in the app, keeps the unattached line, and plans nothing', () => {
    for (const text of ['{"ensaios":[]}', '{"ensaios":[{"id":"CM-02","equipamento":"CM"},{"id":"ZZ-09","equipamento":"ZZ"}]}']) {
      const parsed = parseTestBaseText(text);
      if (!parsed.ok) throw new Error(text);
      const plan = planTestBaseImport(parsed.file, EMPTY_DEFINITION_CONTEXT);
      expect(plan.copies).toEqual([]);
      expect(plan.alreadyImported).toEqual([]);
      const lines = testBaseImportPreviewText(plan).split('\n');
      expect(lines[0]).toBe('Nenhum ensaio desta base tem ensaio correspondente no app. Nada será gravado.');
      if (plan.unattached.length > 0) expect(lines).toContain('Sem ensaio no app: CM-02 e ZZ-09.');
    }
  });
});
