import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { choiceCellValue } from '../relatorio/reading-evaluation.ts';
import { cellAddressesOf } from '../relatorio/readings.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import { companyBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, EquipmentTypeVersionRow, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { definitionContext, EMPTY_DEFINITION_CONTEXT, findDefinition } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { recommendationsText, recommendedPointText } from '../seed/test-help.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { TEXT_CAPS } from '../ops/value-limits.ts';
import { duplicateSeededType, typeVersionRow } from '../types/duplicate.ts';
import { newPointRow } from './checks.ts';
import { hasPointSource, resolvedOriginPoints, sheetPointFindings, type SheetPointFinding } from './derived.ts';

/*
 * 24.17-UNIT (batch e24p, Story 24.17): what "Criar ponto de atenção" on a test or on the Conclusão
 * step starts a point with, for each kind of finding (a reading out, a ratio row, a measurement cell,
 * a polarization index, a choice, a prerequisite with its test on and with its sub-block off, a
 * restricted test, a Reprovado the technician chose), on seed v14 (the finding in the text, the
 * recommendations in the action, with the editor's helper) and on v13 (Story 23.11's text, the
 * recommendations first, an empty action); where the action is offered and where it is not; one point
 * per finding (its live point names the place, and removing it brings the action back). Each sheet is
 * a company copy of the seeded type carrying invented recommendations; every value is invented.
 */

const VERSIONS = ['v14', 'v13'] as const;
type Version = (typeof VERSIONS)[number];

const id = (n: number) => `019966b0-2417-7000-8000-${n.toString(16).padStart(12, '0')}`;
const TYPE_ID = id(1);
const TYPE_VERSION_ID = id(2);
const COPY_BLOCK = id(3);
const COPY_EQUIPMENT = id(4);

let opSeq = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opSeq) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

function fresh(version: Version): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-2417-7100-8000-000000000001', seedVersion: version }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId: idSequence('019966b0-2417-7200-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-2417-7300-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

type TestTexts = { recommendation?: string; index_recommendation?: string };

/**
 * The relatório with one more sheet: a company copy of `base` (published as version 1), its tests
 * carrying `texts` by key, on the same local as the seeded sheet of `base` (the cable's for the CTA).
 */
function withCopy(version: Version, base: EquipmentBlockType, texts: Readonly<Record<string, TestTexts>>): RelatorioSnapshot {
  const snapshot = fresh(version);
  const draft = duplicateSeededType(version, base).draft;
  const patch = <T extends { key: string }>(test: T): T => ({ ...test, ...texts[test.key] });
  const definition: CompanyTypeDefinition = { ...draft, tests: draft.tests.map(patch), ...(draft.measurement_tests === undefined ? {} : { measurement_tests: draft.measurement_tests.map(patch) }) };
  const row: EquipmentTypeVersionRow = typeVersionRow({ id: TYPE_VERSION_ID, type: { id: TYPE_ID, latest_version: 0 }, definition, publishedBy: TEST_USER, publishedAt: T0.toISOString() });
  // The CTA is not on the standard template: its copy sits beside the cable.
  const locationId = seededOf(snapshot, base === 'chave_transferencia_automatica' ? 'cabos_entrada' : base).location_id!;
  const { block, equipment } = newEquipmentBlock({
    definitions: definitionContext([row]),
    blockId: COPY_BLOCK,
    equipmentId: COPY_EQUIPMENT,
    relatorioId: snapshot.relatorio.id,
    projectId: TEST_PROJECT,
    locationId,
    type: companyBlockType(TYPE_ID),
    tag: 'CP-01',
    seedVersion: version,
    orderKey: 'z0',
    typeVersion: { version: 1, id: TYPE_VERSION_ID },
  });
  return { ...snapshot, equipment_types: [row], equipment: [...snapshot.equipment, equipment], blocks: [...snapshot.blocks, block] };
}

function seededOf(snapshot: RelatorioSnapshot, type: string): BlockRow {
  const node = sheetOrder(snapshot).find((one) => snapshot.blocks.find((block) => block.id === one.blockId)?.block_type === type)!;
  return snapshot.blocks.find((block) => block.id === node.blockId)!;
}

/** The copy sheet edited by `fn`. */
function editCopy(snapshot: RelatorioSnapshot, fn: (block: BlockRow) => void): RelatorioSnapshot {
  return {
    ...snapshot,
    blocks: snapshot.blocks.map((block) => {
      if (block.id !== COPY_BLOCK) return block;
      const next = structuredClone(block);
      fn(next);
      return next;
    }),
  };
}

function cells(block: BlockRow, testKey: string, values: Record<string, unknown>): void {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(values)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  block.sheet.test[testKey] = test;
}

function plate(block: BlockRow, values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) block.sheet.nameplate[key] = cell(value);
}

function switchedOff(block: BlockRow, ...keys: string[]): void {
  const config = block.config as { sub_blocks: Record<string, { enabled: boolean }> };
  for (const key of keys) config.sub_blocks[key] = { enabled: false };
}

/** The copy's findings. */
const findings = (snapshot: RelatorioSnapshot): SheetPointFinding[] => sheetPointFindings(snapshot, COPY_BLOCK);

const REC = 'Limpar e reapertar as conexões e repetir o ensaio';
const REC_TWO = 'Programar inspeção com o fabricante.';
const REC_INDEX = 'Secar a parte ativa e repetir o índice de polarização';
const HELPER_ONE = 'Da recomendação do ensaio · editável';
const HELPER_MANY = 'Das recomendações dos ensaios · editável';

/**
 * One finding on both seeds: on v14 the text is the finding alone and the action the joined
 * recommendations (with the helper); on v13 the text is Story 23.11's, the action empty.
 */
function expectBothSeeds(build: (version: Version) => RelatorioSnapshot, expected: { origin: SheetPointFinding['origin']; testKey: string | null; place: SheetPointFinding['place']; recommendations: readonly string[]; startsWith: string }) {
  const [v14] = findings(build('v14'));
  const [v13] = findings(build('v13'));
  expect(findings(build('v14'))).toHaveLength(1);
  expect(findings(build('v13'))).toHaveLength(1);
  const action = recommendationsText(expected.recommendations);
  expect(v14).toMatchObject({ origin: expected.origin, testKey: expected.testKey, place: expected.place, positions: [] });
  expect(v14!.text.startsWith(expected.startsWith), v14!.text).toBe(true);
  expect(v14!.action).toBe(action);
  expect(v14!.actionHelper).toBe(expected.recommendations.length === 0 ? null : expected.recommendations.length === 1 ? HELPER_ONE : HELPER_MANY);
  expect(v13).toMatchObject({ origin: expected.origin, testKey: expected.testKey, place: expected.place, action: '', actionHelper: null, positions: [] });
  // v13 starts as Story 23.11 stored it: the recommendations first, then the same finding.
  expect(v13!.text).toBe(recommendedPointText(expected.recommendations, v14!.text));
  return { v14: v14!, v13: v13! };
}

describe('24.17-UNIT what a point written from a test starts with, per kind of finding, on v14 and v13', () => {
  it('a reading out of its criterion (the cable\'s insulation, 300 MΩ against > 400 MΩ)', () => {
    const build = (version: Version) =>
      editCopy(withCopy(version, 'cabos_entrada', { isolacao: { recommendation: REC } }), (block) => {
        const [first] = cellAddressesOf(findDefinition(version, 'cabos_entrada')!, 'isolacao');
        cells(block, 'isolacao', { [`${first!.row}/${first!.col}`]: measured('300', 'MΩ') });
      });
    const { v14 } = expectBothSeeds(build, { origin: 'reading', testKey: 'isolacao', place: 'test', recommendations: [REC], startsWith: 'Ensaio de isolação: 300 MΩ em ' });
    expect(v14.action).toBe(`${REC}.`);
  });

  it('a ratio row INSATISFATÓRIO (the TC at 41 against 200/5 A, class 0,3)', () => {
    const build = (version: Version) =>
      editCopy(withCopy(version, 'tc', { relacao_transformacao: { recommendation: REC } }), (block) => {
        plate(block, { exatidao: '0,3' });
        cells(block, 'relacao_transformacao', { '0/0': measured('200', 'A'), '0/1': measured('5', 'A'), '0/3': measured('41', null) });
      });
    const { v14 } = expectBothSeeds(build, { origin: 'reading', testKey: 'relacao_transformacao', place: 'test', recommendations: [REC], startsWith: 'Ensaio de relação de transformação: desvio de ' });
    expect(v14.text).toContain('em Fase R');
  });

  it('a failed choice (the TC\'s polarity INVERTIDA, its deviation within)', () => {
    const build = (version: Version) =>
      editCopy(withCopy(version, 'tc', { relacao_transformacao: { recommendation: REC } }), (block) => {
        plate(block, { exatidao: '0,3' });
        cells(block, 'relacao_transformacao', { '0/0': measured('200', 'A'), '0/1': measured('5', 'A'), '0/3': measured('40', null), '0/5': choiceCellValue('INVERTIDA') });
      });
    const { v14 } = expectBothSeeds(build, { origin: 'reading', testKey: 'relacao_transformacao', place: 'test', recommendations: [REC], startsWith: 'Ensaio de relação de transformação: ' });
    expect(v14.text).toContain('polaridade invertida em Fase R');
  });

  it('a failed polarization index takes the index recommendation (a dry transformer, IP 0,8)', () => {
    const build = (version: Version) =>
      editCopy(withCopy(version, 'transformador_forca', { isolacao: { recommendation: REC, index_recommendation: REC_INDEX } }), (block) => {
        plate(block, { tipo_de_isolacao: 'EPÓXI', material_enrolamento: 'Cu' });
        cells(block, 'isolacao', { '0/1': measured('5', 'GΩ'), '0/4': measured('0.8', null) });
      });
    const { v14 } = expectBothSeeds(build, { origin: 'reading', testKey: 'isolacao', place: 'test', recommendations: [REC_INDEX], startsWith: 'Ensaio de isolação: ' });
    expect(v14.text).toContain('IP de 0,8 em Primário–Massa (critério: IP ≥ 1,0)');
    expect(v14.action).toBe(`${REC_INDEX}.`);
  });

  it('a measurement cell out of its criterion (the CTA copy\'s main insulation table, its recommendation)', () => {
    const cta = findDefinition('v13', 'chave_transferencia_automatica')!;
    const test = cta.measurement_tests!.find((one) => one.key === 'cta_isolamento_principal')!;
    const row = test.rows.findIndex((one) => one.key === 'a_t');
    const col = test.columns.findIndex((one) => one.key === 'normal_fechada');
    const build = (version: Version) =>
      editCopy(withCopy(version, 'chave_transferencia_automatica', { cta_isolamento_principal: { recommendation: REC } }), (block) => {
        const config = block.config as { options?: Record<string, string> };
        config.options = { ...config.options, tensao: 'mt' };
        cells(block, 'cta_isolamento_principal', { [`${row}/${col}`]: measured('1', 'MΩ') });
      });
    const all = findings(build('v14'));
    expect(all.map((one) => [one.origin, one.testKey, one.place]), JSON.stringify(all)).toEqual([['reading', 'cta_isolamento_principal', 'test']]);
    const { v14 } = expectBothSeeds(build, { origin: 'reading', testKey: 'cta_isolamento_principal', place: 'test', recommendations: [REC], startsWith: '' });
    // The measurement grammar's finding: "⟨label⟩: ⟨value⟩ em ⟨where⟩ (critério: …)".
    expect(v14.text).toMatch(/^[^:]+: 1 MΩ em .+ \(critério: .+\)$/);
  });

  it('a failed prerequisite with its test on: under the test; with the test\'s sub-block off: on the Conclusão step', () => {
    const failing = (off: boolean) => (version: Version) =>
      editCopy(withCopy(version, 'para_raio', { isolacao: { recommendation: REC } }), (block) => {
        plate(block, { desligador_integro: 'NÃO' });
        if (off) switchedOff(block, 'isolacao');
      });
    expectBothSeeds(failing(false), { origin: 'reading', testKey: 'isolacao', place: 'test', recommendations: [REC], startsWith: 'Ensaio de isolação: pré-requisito não atendido (Desligador íntegro: NÃO)' });
    expectBothSeeds(failing(true), { origin: 'reading', testKey: 'isolacao', place: 'conclusao', recommendations: [REC], startsWith: 'Ensaio de isolação: pré-requisito não atendido (Desligador íntegro: NÃO)' });
  });

  it('a restricted test (the cable at 5, 5 and 1,5 GΩ): its rows with their reasons, no recommendation, an empty action on any seed', () => {
    const build = (version: Version) =>
      editCopy(withCopy(version, 'cabos_entrada', { isolacao: { recommendation: REC } }), (block) => {
        const [a, b, c] = cellAddressesOf(findDefinition(version, 'cabos_entrada')!, 'isolacao');
        cells(block, 'isolacao', { [`${a!.row}/${a!.col}`]: measured('5', 'GΩ'), [`${b!.row}/${b!.col}`]: measured('5', 'GΩ'), [`${c!.row}/${c!.col}`]: measured('1.5', 'GΩ') });
      });
    const { v14, v13 } = expectBothSeeds(build, { origin: 'restricao', testKey: 'isolacao', place: 'test', recommendations: [], startsWith: 'Ensaio de isolação: valor dentro do critério, com restrição (' });
    expect(v14.text).toBe(v13.text);
  });

  it('a Reprovado the technician chose, nothing out, two tests recommending: the observation, both recommendations in the tests\' order', () => {
    const build = (version: Version) =>
      editCopy(withCopy(version, 'transformador_forca', { isolacao: { recommendation: REC }, relacao_transformacao: { recommendation: REC_TWO } }), (block) => {
        block.sheet.observations = cell('Ruído anormal no núcleo com o transformador em carga.');
        block.sheet.conclusion = { ...block.sheet.conclusion, result: cell('reprovado') };
      });
    const { v14 } = expectBothSeeds(build, { origin: 'reprovado', testKey: null, place: 'conclusao', recommendations: [REC, REC_TWO], startsWith: 'Ruído anormal no núcleo' });
    expect(v14.text).toBe('Ruído anormal no núcleo com o transformador em carga.');
    expect(v14.action).toBe(`${REC}. ${REC_TWO}`);
    expect(v14.actionHelper).toBe(HELPER_MANY);
  });

  it('a test that fails and carries no recommendation: the action starts empty, with no helper, on v14 too', () => {
    const build = (version: Version) =>
      editCopy(withCopy(version, 'cabos_entrada', {}), (block) => {
        const [first] = cellAddressesOf(findDefinition(version, 'cabos_entrada')!, 'isolacao');
        cells(block, 'isolacao', { [`${first!.row}/${first!.col}`]: measured('300', 'MΩ') });
      });
    const { v14, v13 } = expectBothSeeds(build, { origin: 'reading', testKey: 'isolacao', place: 'test', recommendations: [], startsWith: 'Ensaio de isolação: 300 MΩ' });
    expect(v14).toEqual(v13);
  });
});

describe('24.17-UNIT where the action is offered and where it is not', () => {
  it('a sheet with nothing failed, restricted or chosen offers none; a sheet marked Não ensaiado (read-only) offers none', () => {
    for (const version of VERSIONS) {
      const clean = withCopy(version, 'cabos_entrada', { isolacao: { recommendation: REC } });
      expect(findings(clean), version).toEqual([]);
      const out = editCopy(clean, (block) => {
        const [first] = cellAddressesOf(findDefinition(version, 'cabos_entrada')!, 'isolacao');
        cells(block, 'isolacao', { [`${first!.row}/${first!.col}`]: measured('300', 'MΩ') });
        block.not_tested = { reason: 'impossibilidade_desligamento', text: null, at: T0.toISOString(), by: TEST_USER };
      });
      expect(findings(out), version).toEqual([]);
    }
  });

  it('a Reprovado caused by a test has its action on that test, never on the Conclusão step; an unknown or removed sheet has none', () => {
    const snapshot = editCopy(withCopy('v14', 'cabos_entrada', { isolacao: { recommendation: REC } }), (block) => {
      const [first] = cellAddressesOf(findDefinition('v14', 'cabos_entrada')!, 'isolacao');
      cells(block, 'isolacao', { [`${first!.row}/${first!.col}`]: measured('300', 'MΩ') });
      block.sheet.conclusion = { ...block.sheet.conclusion, result: cell('reprovado') };
    });
    expect(findings(snapshot).map((one) => [one.origin, one.place])).toEqual([['reading', 'test']]);
    expect(sheetPointFindings(snapshot, id(999))).toEqual([]);
    expect(sheetPointFindings({ ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === COPY_BLOCK ? { ...block, removed_at: T0.toISOString() } : block)) }, COPY_BLOCK)).toEqual([]);
  });

  it('an NC row is not a finding here (its own row offers the action)', () => {
    const snapshot = editCopy(withCopy('v14', 'cabos_entrada', {}), (block) => {
      const item = findDefinition('v14', 'cabos_entrada')!.checklist![0]!;
      block.sheet.checklist[item.key] = { result: cell('NC') };
    });
    expect(hasPointSource(snapshot)).toBe(true);
    expect(findings(snapshot)).toEqual([]);
  });
});

describe('24.17-UNIT one point per finding', () => {
  const out = (version: Version) =>
    editCopy(withCopy(version, 'cabos_entrada', { isolacao: { recommendation: REC } }), (block) => {
      const [first] = cellAddressesOf(findDefinition(version, 'cabos_entrada')!, 'isolacao');
      cells(block, 'isolacao', { [`${first!.row}/${first!.col}`]: measured('300', 'MΩ') });
    });
  /** The snapshot with a point stored as the editor stores one from the finding, after `before` other points. */
  function withPoint(snapshot: RelatorioSnapshot, fields: Partial<PointRow>, before = 0): RelatorioSnapshot {
    let points = snapshot.points;
    for (let i = 0; i < before; i += 1) points = [...points, newPointRow({ id: id(500 + i), relatorioId: snapshot.relatorio.id, text: `Manual ${i}`, equipmentId: null, origin: 'manual', action: null }, points)];
    const row = newPointRow({ id: id(600), relatorioId: snapshot.relatorio.id, text: 'Ponto', equipmentId: COPY_EQUIPMENT, origin: 'reading', action: null, testKey: 'isolacao' }, points);
    return { ...snapshot, points: [...points, { ...row, ...fields }] };
  }

  it('a live point of that origin, test and equipment names the place by its section 8 position; removing it brings the action back', () => {
    const stored = withPoint(out('v14'), {}, 2);
    expect(findings(stored)).toMatchObject([{ origin: 'reading', testKey: 'isolacao', positions: [3] }]);
    const removed = { ...stored, points: stored.points.map((point) => (point.id === id(600) ? { ...point, removed_at: T0.toISOString() } : point)) };
    expect(findings(removed)).toMatchObject([{ origin: 'reading', testKey: 'isolacao', positions: [] }]);
  });

  it('a point of another origin, test or equipment does not count', () => {
    // ~~a `restricao` point of the test did not count~~ (fix batch e24x, D5: it is that test's point; see below).
    expect(findings(withPoint(out('v14'), { origin: 'reprovado', test_key: null }))[0]!.positions).toEqual([]);
    expect(findings(withPoint(out('v14'), { test_key: 'outro' }))[0]!.positions).toEqual([]);
    expect(findings(withPoint(out('v14'), { equipment_id: id(77) }))[0]!.positions).toEqual([]);
  });

  it('the finding\'s point stays "Origem resolvida"-paired as before: resolved once the reading is corrected', () => {
    const stored = withPoint(out('v13'), {});
    expect(resolvedOriginPoints(stored).has(id(600))).toBe(false);
    const corrected = editCopy(stored, (block) => {
      const [first] = cellAddressesOf(findDefinition('v13', 'cabos_entrada')!, 'isolacao');
      cells(block, 'isolacao', { [`${first!.row}/${first!.col}`]: measured('5', 'GΩ') });
    });
    expect(resolvedOriginPoints(corrected).has(id(600))).toBe(true);
    expect(findings(corrected)).toEqual([]);
  });
});

/*
 * Fix batch e24x (D5): one action per test. A live point of the same test and equipment written as
 * `restricao` (the test restricted when it was created) is that test's point once a reading goes out,
 * and a `reading` one while the test is only restricted: the place names it and offers no second one.
 */
describe('e24x-UNIT D5 a point of the same test counts whether it was written as reading or restricao', () => {
  const out = (version: Version) =>
    editCopy(withCopy(version, 'cabos_entrada', { isolacao: { recommendation: REC } }), (block) => {
      const [first] = cellAddressesOf(findDefinition(version, 'cabos_entrada')!, 'isolacao');
      cells(block, 'isolacao', { [`${first!.row}/${first!.col}`]: measured('300', 'MΩ') });
    });
  const restricted = (version: Version) =>
    editCopy(withCopy(version, 'cabos_entrada', { isolacao: { recommendation: REC } }), (block) => {
      const [a, b, c] = cellAddressesOf(findDefinition(version, 'cabos_entrada')!, 'isolacao');
      cells(block, 'isolacao', { [`${a!.row}/${a!.col}`]: measured('5', 'GΩ'), [`${b!.row}/${b!.col}`]: measured('5', 'GΩ'), [`${c!.row}/${c!.col}`]: measured('1.5', 'GΩ') });
    });
  const point = (snapshot: RelatorioSnapshot, origin: PointRow['origin'], testKey = 'isolacao', equipmentId = COPY_EQUIPMENT): RelatorioSnapshot => ({
    ...snapshot,
    points: [...snapshot.points, newPointRow({ id: id(700), relatorioId: snapshot.relatorio.id, text: 'Ponto', equipmentId, origin, action: null, testKey }, snapshot.points)],
  });

  it('a reading out with a live restricao point of the test: the place names it', () => {
    for (const version of VERSIONS) expect(findings(point(out(version), 'restricao')), version).toMatchObject([{ origin: 'reading', testKey: 'isolacao', positions: [1] }]);
  });

  it('a restricted test with a live reading point of the test: the place names it', () => {
    expect(findings(point(restricted('v14'), 'reading'))).toMatchObject([{ origin: 'restricao', testKey: 'isolacao', positions: [1] }]);
  });

  it('review of e24x: a restricao point whose restricted cell is corrected while another cell of the test goes out is that test\'s point, never "Origem resolvida"', () => {
    const stored = point(restricted('v14'), 'restricao');
    expect(resolvedOriginPoints(stored).has(id(700))).toBe(false);
    // Each cell rewritten out by the criterion, alike, so no restriction rule flags any of them.
    const moved = editCopy(stored, (block) => {
      const [a, b, c] = cellAddressesOf(findDefinition('v14', 'cabos_entrada')!, 'isolacao');
      cells(block, 'isolacao', { [`${a!.row}/${a!.col}`]: measured('300', 'MΩ'), [`${b!.row}/${b!.col}`]: measured('300', 'MΩ'), [`${c!.row}/${c!.col}`]: measured('300', 'MΩ') });
    });
    expect(findings(moved)).toMatchObject([{ origin: 'reading', testKey: 'isolacao', positions: [1] }]);
    expect(resolvedOriginPoints(moved).has(id(700))).toBe(false);
    // Corrected with nothing out or restricted left on the test, it is resolved, as before.
    const clean = editCopy(stored, (block) => {
      const [, , c] = cellAddressesOf(findDefinition('v14', 'cabos_entrada')!, 'isolacao');
      cells(block, 'isolacao', { [`${c!.row}/${c!.col}`]: measured('5', 'GΩ') });
    });
    expect(resolvedOriginPoints(clean).has(id(700))).toBe(true);
  });

  it('another test or another equipment still does not count', () => {
    expect(findings(point(out('v14'), 'restricao', 'outro'))[0]!.positions).toEqual([]);
    expect(findings(point(out('v14'), 'restricao', 'isolacao', id(77)))[0]!.positions).toEqual([]);
  });
});

/*
 * Fix batch e24x (D2): on v14 the action a point starts with is the joined recommendations only while
 * they fit the action's cap (`TEXT_CAPS.medium`); past it the action starts empty and the
 * recommendations start the text (Story 23.11's form) while that fits the text's cap
 * (`TEXT_CAPS.long`), else the text is the finding alone. "Concluir" never stores a create the server
 * refuses (`op_value_invalid`).
 */
describe('e24x-UNIT D2 the recommendations as the action only while they fit its cap', () => {
  const build = (recommendation: string) =>
    editCopy(withCopy('v14', 'cabos_entrada', { isolacao: { recommendation } }), (block) => {
      const [first] = cellAddressesOf(findDefinition('v14', 'cabos_entrada')!, 'isolacao');
      cells(block, 'isolacao', { [`${first!.row}/${first!.col}`]: measured('300', 'MΩ') });
    });
  /** A recommendation already terminated, `length` characters long. */
  const terminated = (length: number) => `${'R'.repeat(length - 1)}.`;
  const finding = findings(build(terminated(10)))[0]!.text;

  it('999 and 1 000 characters: the action, with its helper', () => {
    for (const length of [999, 1000]) {
      const [one] = findings(build(terminated(length)));
      expect(one!.action, String(length)).toBe(terminated(length));
      expect(one!.action.length).toBeLessThanOrEqual(TEXT_CAPS.medium);
      expect(one).toMatchObject({ text: finding, actionHelper: HELPER_ONE });
    }
  });

  it('1 001 characters, and one of exactly 1 000 that gains its final period: the action empty, the recommendation first in the text', () => {
    for (const recommendation of [terminated(1001), 'R'.repeat(1000)]) {
      const [one] = findings(build(recommendation));
      expect(one).toMatchObject({ action: '', actionHelper: null, text: recommendedPointText([recommendation], finding) });
      expect(one!.text.length).toBeLessThanOrEqual(TEXT_CAPS.long);
    }
  });

  it('a recommendation the text cannot hold either: the finding alone, the action empty', () => {
    const [one] = findings(build(terminated(TEXT_CAPS.long)));
    expect(one).toMatchObject({ action: '', actionHelper: null, text: finding });
  });
});
