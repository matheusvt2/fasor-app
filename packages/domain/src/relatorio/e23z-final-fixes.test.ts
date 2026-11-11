import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { applyOp, entityKey, SeedPathError, type EntityState } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { groupForPrint, printBlockTypeOf, printGroupWordsOf } from '../print/group-for-print.ts';
import { resolvedOriginPoints } from '../points/derived.ts';
import { companyBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, EquipmentRow, EquipmentTypeVersionRow, JsonValue, LocationRow, PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { definitionContext, EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { recommendedPointText } from '../seed/test-help.ts';
import { idSequence, opFactory, T0, TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { asBlockDefinition } from '../types/block-definition.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { removeDraftEntry, removeDraftEntryRefusal } from '../types/draft-edit.ts';
import { duplicateCompanyType, duplicateSeededType, typeVersionRow } from '../types/duplicate.ts';
import { parseTestBaseText, planTestBaseImport, type TestBaseFile } from '../types/test-base-import.ts';
import { composeConclusion, conclusionFloor } from './conclusion.ts';
import { evaluateSheetMeasurements, measurementTestTitle, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import { evaluateSheetReadings } from './readings.ts';
import { tapRowClearable, tapRowClearableCols } from './tap-rows.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Fix batch e23z (the final Epic 23 fixes, seed v13): one case per row of the spec's I/O matrix.
 * W3-1 a restricted measurement point stands beside an out cell and while a rule flags a cell now out;
 * W3-2 a measured cell the deviation between phases cannot judge withholds Aprovado · Sem restrições;
 * W3-3 and W3-4 a company copy of one of the eight prints and is named as its base; W3-7 the base's IP
 * rows reach the derived point; item 2 a Reprovado chosen by hand starts with the recommendations;
 * item 3 a tap row off the plate is cleared; item 4 DESLOCAMENTO ANGULAR kept while the ratio reads it.
 * Every value is invented; the base file is the synthetic fixture.
 */

const id = (n: number) => `019966b0-0e2a-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const ohm = (raw: string) => measured(raw, 'Ω');
const PUBLISHED_AT = '2026-11-09T12:00:00.000Z';

function sheet(type: EquipmentBlockType, seedVersion = 'v13'): BlockRow {
  return newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: id(1), equipmentId: id(2), relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: id(4), type, tag: 'T1', seedVersion, orderKey: 'a0' }).block;
}
const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

function cells(block: BlockRow, testKey: string, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(values)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  next.sheet.test[testKey] = test;
  return next;
}

function switchedOff(block: BlockRow, ...keys: string[]): BlockRow {
  const next = structuredClone(block);
  const config = next.config as { sub_blocks: Record<string, { enabled: boolean }> };
  for (const key of keys) config.sub_blocks[key] = { enabled: false };
  return next;
}

const measurementOf = (block: BlockRow, testKey: string, definition: BlockDefinition = definitionOf(block)): MeasurementTestEvaluation =>
  evaluateSheetMeasurements(block, definition).find((test) => test.testKey === testKey)!;

// --- snapshots ------------------------------------------------------------------------------------

const v13Snapshot = (): RelatorioSnapshot => structuredClone(layoutLockSnapshot('v13', { epic24: false }));
const blockOf = (snapshot: RelatorioSnapshot, type: string) => snapshot.blocks.find((block) => block.block_type === type && block.removed_at === null)!;
function editBlock(snapshot: RelatorioSnapshot, block: BlockRow, edit: (next: BlockRow) => BlockRow | void): BlockRow {
  const draft = structuredClone(block);
  const next = edit(draft) ?? draft;
  snapshot.blocks = snapshot.blocks.map((row) => (row.id === next.id ? next : row));
  return next;
}

/** A published version row of a company type with `definition` (type `id(600 + n)`, version row `id(500 + n)`). */
function versionRow(definition: CompanyTypeDefinition, n: number): EquipmentTypeVersionRow {
  return typeVersionRow({ id: id(500 + n), type: { id: id(600 + n), latest_version: 0 }, definition, publishedBy: id(9), publishedAt: PUBLISHED_AT });
}

const restricaoPoint = (snapshot: RelatorioSnapshot, block: BlockRow, testKey: string, n: number): PointRow => {
  const point: PointRow = { id: id(700 + n), relatorio_id: snapshot.relatorio.id, text: 'x', equipment_id: block.equipment_id, origin: 'restricao', order_key: 'a0', removed_at: null, action: null, priority: null, deadline: null, owner: null, item_key: null, test_key: testKey };
  snapshot.points.push(point);
  return point;
};

/** The v13 snapshot's transformer as an oil, copper unit at 75 °C (no correction factor), its winding cleared. */
function oilTransformer(snapshot: RelatorioSnapshot): BlockRow {
  return editBlock(snapshot, blockOf(snapshot, 'transformador_forca'), (next) => {
    next.sheet.nameplate.tipo_de_isolacao = cell('ÓLEO ISOLANTE');
    next.sheet.nameplate.material_enrolamento = cell('Cu');
    next.sheet.nameplate.temperatura_oleo_c = cell(measured('75', '°C'));
    next.sheet.test.resistencia_enrolamento = { cells: {} };
  });
}
const winding = (snapshot: RelatorioSnapshot, block: BlockRow, values: Record<string, unknown>) =>
  editBlock(snapshot, block, (next) => cells(next, 'resistencia_enrolamento', values));

describe('e23z-UNIT W3-1 a measurement test\'s restricao point stands while a restriction holds', () => {
  it('Fase C restricted (3 %) and later a BT phase out (6 %): the point is not resolved', () => {
    const snapshot = v13Snapshot();
    const block = winding(snapshot, oilTransformer(snapshot), { '0/0': ohm('1'), '0/1': ohm('1'), '0/2': ohm('1.03') });
    // Fix batch e24h: ~~the entries with no stored point~~ (no automatic entry lists any more).
    const point = restricaoPoint(snapshot, block, 'resistencia_enrolamento', 1);
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
    winding(snapshot, block, { '3/0': ohm('1'), '3/1': ohm('1'), '3/2': ohm('1.06') });
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
  });

  it('a cell restricted by a thermography band, then another cell out: not resolved', () => {
    const snapshot = v13Snapshot();
    const block = editBlock(snapshot, blockOf(snapshot, 'transformador_forca'), (next) => {
      const test = { cells: {}, values: { em_carga: cell({ raw: 'sim', unit: null, state: 'measured' }) } };
      next.sheet.test.termografia = test;
      return cells(next, 'termografia', { '0/0': measured('5', '°C') });
    });
    const point = restricaoPoint(snapshot, block, 'termografia', 2);
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
    editBlock(snapshot, block, (next) => cells(next, 'termografia', { '1/0': measured('20', '°C') }));
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
  });

  it('the restricted cell now out (past the restricted band, or past a band table\'s restricted level): not resolved, the test carries restrictionStands', () => {
    const snapshot = v13Snapshot();
    const block = winding(snapshot, oilTransformer(snapshot), { '0/0': ohm('1'), '0/1': ohm('1'), '0/2': ohm('1.06') });
    const point = restricaoPoint(snapshot, block, 'resistencia_enrolamento', 3);
    expect(measurementOf(block, 'resistencia_enrolamento').restrictionStands).toBe(true);
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
    const thermo = cells(plate(sheet('transformador_forca'), {}), 'termografia', { '0/0': measured('20', '°C') });
    thermo.sheet.test.termografia!.values = { em_carga: cell({ raw: 'sim', unit: null, state: 'measured' }) };
    expect(measurementOf(thermo, 'termografia').restrictionStands).toBe(true);
  });

  it('no restricted cell and no rule flags any cell: resolved, as before; v12 and the CTA never carry the keys', () => {
    const snapshot = v13Snapshot();
    const block = winding(snapshot, oilTransformer(snapshot), { '0/0': ohm('1'), '0/1': ohm('1'), '0/2': ohm('1.01') });
    const point = restricaoPoint(snapshot, block, 'resistencia_enrolamento', 4);
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(true);
    const test = measurementOf(block, 'resistencia_enrolamento');
    expect('restrictionStands' in test || 'unjudged' in test).toBe(false);
    const cta = sheet('chave_transferencia_automatica', 'v12');
    for (const one of evaluateSheetMeasurements(cta, definitionOf(cta))) expect('restrictionStands' in one || 'unjudged' in one).toBe(false);
  });
});

describe('e23z-UNIT W3-2 a measured cell the deviation between phases cannot judge is never a pass', () => {
  const quietTransformer = (values: Record<string, unknown>) => switchedOff(plate(sheet('transformador_forca'), { material_enrolamento: 'Cu', ...values }), 'isolacao', 'relacao_transformacao', 'termografia', 'coleta_oleo');
  const quietSeccionadora = () => switchedOff(plate(sheet('chave_seccionadora'), { tipo_seccionadora: 'SOB CARGA COM FUSÍVEIS' }), 'isolacao', 'resistencia_contato', 'termografia');
  const fuses = (values: Record<string, unknown>) => cells(quietSeccionadora(), 'resistencia_fusiveis', values);

  it('TIPO DE ISOLAÇÃO empty, winding AT 10 / 10 / 20 Ω: no floor (no Aprovado · Sem restrições)', () => {
    const block = cells(quietTransformer({}), 'resistencia_enrolamento', { '0/0': ohm('10'), '0/1': ohm('10'), '0/2': ohm('20') });
    expect(measurementOf(block, 'resistencia_enrolamento').unjudged).toBe(true);
    expect(conclusionFloor(block, definitionOf(block))).toBeNull();
  });

  it('a seccionadora with fuses A = 0, B = 10, C = 10 mΩ: no floor; a group with one positive cell only: no floor', () => {
    const zero = fuses({ '0/0': measured('0', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('10', 'mΩ') });
    expect(conclusionFloor(zero, definitionOf(zero))).toBeNull();
    const lone = fuses({ '0/0': measured('10', 'mΩ') });
    expect(measurementOf(lone, 'resistencia_fusiveis').unjudged).toBe(true);
    expect(conclusionFloor(lone, definitionOf(lone))).toBeNull();
  });

  it('every measured cell judged within: Aprovado · Sem restrições, as before; an out or restricted floor still comes first', () => {
    const dry = cells(quietTransformer({ tipo_de_isolacao: 'EPÓXI' }), 'resistencia_enrolamento', { '0/0': ohm('10'), '0/1': ohm('10'), '0/2': ohm('10.1') });
    expect('unjudged' in measurementOf(dry, 'resistencia_enrolamento')).toBe(false);
    expect(conclusionFloor(dry, definitionOf(dry))).toEqual({ pair: { result: 'aprovado', restriction: 'sem_restricoes' }, reasons: [] });
    const fine = fuses({ '0/0': measured('10', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('11', 'mΩ') });
    expect(conclusionFloor(fine, definitionOf(fine))!.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    // A zero fuse beside an out one: the failure floors first.
    const out = fuses({ '0/0': measured('0', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('12', 'mΩ') });
    expect(conclusionFloor(out, definitionOf(out))!.pair.result).toBe('reprovado');
    // A lone phase beside a restricted cell: the restriction floors first.
    const restricted = cells(quietTransformer({ tipo_de_isolacao: 'EPÓXI' }), 'resistencia_enrolamento', { '0/0': ohm('10'), '0/1': ohm('10'), '0/2': ohm('15'), '3/0': ohm('1') });
    expect(measurementOf(restricted, 'resistencia_enrolamento').unjudged).toBe(true);
    expect(conclusionFloor(restricted, definitionOf(restricted))!.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
  });
});

// --- W3-3 and W3-4: a copy prints and reads as its base ----------------------------------------------

describe('e23z-UNIT W3-3 a company copy of one of the eight prints in its base\'s group', () => {
  const RELATORIO = layoutLockSnapshot('v13', { epic24: false }).relatorio;
  const cabine: LocationRow = {
    id: id(10),
    relatorio_id: RELATORIO.id,
    parent_id: null,
    kind: 'cabine',
    name: 'Cabine principal',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: true,
  };
  const copyOf = (type: EquipmentBlockType, base = true): CompanyTypeDefinition => {
    const draft = structuredClone(duplicateSeededType('v13', type).draft);
    if (!base) delete draft.base_block_type;
    return draft;
  };
  const versions = [
    versionRow(copyOf('tc'), 1),
    versionRow(copyOf('tp'), 2),
    versionRow(copyOf('malha_aterramento'), 3),
    versionRow(copyOf('transformador_forca'), 4),
    versionRow(copyOf('cabos_saida'), 5),
    versionRow(copyOf('transformador_forca', false), 6),
    versionRow(copyOf('chave_seccionadora'), 7),
  ];
  const ctx = definitionContext(versions);
  const companySheet = (n: number, version: EquipmentTypeVersionRow, orderKey: string): { block: BlockRow; equipment: EquipmentRow } =>
    newEquipmentBlock({ definitions: ctx, blockId: id(1000 + n), equipmentId: id(2000 + n), relatorioId: RELATORIO.id, projectId: TEST_PROJECT, locationId: cabine.id, type: companyBlockType(version.type_id), tag: `C${n}`, seedVersion: 'v13', orderKey, typeVersion: 1 });
  const sheets = [
    companySheet(1, versions[0]!, 'a1'), // TC copy
    companySheet(2, versions[1]!, 'a2'), // TP copy
    companySheet(3, versions[2]!, 'a3'), // Malha copy
    companySheet(4, versions[3]!, 'a4'), // transformer copy
    // Fix batch e24f (R-4): ~~a cable copy given role alimentação and feeds_block_id by hand~~ (no path writes
    // either on a company block); the copy as the product makes it.
    companySheet(5, versions[4]!, 'a5'), // cable copy, as created: no role, feeding nothing
    companySheet(6, versions[5]!, 'a6'), // transformer copy made before the key
  ];
  const snapshot = (scheme: 'por_local_e_tipo' | 'ordem_de_campo' = 'por_local_e_tipo') =>
    ({ relatorio: { ...RELATORIO, export: { scheme } }, locations: [cabine], blocks: sheets.map((one) => one.block), equipment: sheets.map((one) => one.equipment), equipment_types: versions }) as unknown as RelatorioSnapshot;
  const block = (n: number) => id(1000 + n);

  // Fix batch e24f (R-4): the narrowing as built (deferred-work.md, e24f): a company copy of cabos de saída carries no
  // role, so it prints with the seccionadoras, unpaired, and the transformer copy prints alone.
  it('TP and TC copies pair in TP\'s e TC\'s; a cable copy (no role) prints with the seccionadoras, unpaired, the transformer copy alone; an old copy and the Malha copy (last) in Outros equipamentos', () => {
    const grouping = groupForPrint(snapshot());
    expect(grouping.subsections.map((one) => ({ kind: one.kind, blockIds: one.blockIds }))).toEqual([
      { kind: 'seccionadoras', blockIds: [block(5)] },
      { kind: 'tps_tcs', blockIds: [block(2), block(1)] },
      { kind: 'transformadores', blockIds: [block(4)] },
      { kind: 'outros', blockIds: [block(6), block(3)] },
    ]);
    expect(sheets[4]!.block.feeds_block_id).toBeNull();
    expect('role' in (sheets[4]!.block.config as object)).toBe(false);
    expect(grouping.warnings).toEqual([]);
    expect(grouping.subsections[0]!.title).toBe('Seccionadoras dos Cubículos de MT da Cabine principal');
    expect(grouping.subsections[2]!.title).toBe('Transformadores e Cabos de Alimentação da Cabine principal');
  });

  it('ordem_de_campo and a cabine without "Agrupar por tipo": unchanged', () => {
    expect(groupForPrint(snapshot('ordem_de_campo')).subsections.map((one) => one.blockIds)).toEqual([[1, 2, 3, 4, 5, 6].map(block)]);
    const flat = snapshot();
    flat.locations = [{ ...cabine, agrupar_por_tipo: false }];
    expect(groupForPrint(flat).subsections.map((one) => one.kind)).toEqual(['cabine']);
  });

  it('the print type and the editor\'s group words: the base of the eight, else the company key and null', () => {
    const tr = asBlockDefinition(versions[3]!);
    expect(tr.base_block_type).toBe('transformador_forca');
    expect(printBlockTypeOf(tr, tr.block_type)).toBe('transformador_forca');
    expect(printBlockTypeOf(asBlockDefinition(versions[5]!), companyBlockType(versions[5]!.type_id))).toBe(companyBlockType(versions[5]!.type_id));
    expect(printBlockTypeOf(null, 'tp')).toBe('tp');
    expect(printGroupWordsOf('transformador_forca')).toBe('Transformadores e Cabos de Alimentação');
    expect(printGroupWordsOf('tc')).toBe("TP's e TC's dos Cubículos de MT");
    expect(printGroupWordsOf('para_raio')).toBe('Seccionadoras dos Cubículos de MT');
    // A company block carries no role, so a cabos de saída copy groups with the seccionadoras (`byType`).
    expect(printGroupWordsOf('cabos_saida')).toBe('Seccionadoras dos Cubículos de MT');
    expect(printGroupWordsOf('malha_aterramento')).toBeNull();
    expect(printGroupWordsOf(undefined)).toBeNull();
  });

  it('Duplicar carries the base, a copy of a copy keeps it; its measurement tests are unnumbered as the base, an old copy keeps "E1 ·"', () => {
    expect(duplicateSeededType('v13', 'tc').draft.base_block_type).toBe('tc');
    expect(duplicateCompanyType(versions[3]!).draft.base_block_type).toBe('transformador_forca');
    expect(measurementTestTitle(asBlockDefinition(versions[3]!), 'resistencia_enrolamento')).toBe('Resistência ôhmica dos enrolamentos');
    expect(measurementTestTitle(asBlockDefinition(versions[5]!), 'resistencia_enrolamento')).toMatch(/^E\d+ · Resistência ôhmica dos enrolamentos$/);
    // The Malha (no seeded tests) keeps its numbers, as the seeded Malha does.
    expect(measurementTestTitle(asBlockDefinition(versions[2]!), 'resistencia_malha')).toBe(measurementTestTitle(getDefinition('v13', 'cabine_primaria', 'malha_aterramento'), 'resistencia_malha'));
  });

  it('W3-4: a copy of the v13 seccionadora with one fuse out names "fusíveis HH" in the conclusion', () => {
    const definition = asBlockDefinition(versions[6]!);
    const seccionadora = newEquipmentBlock({ definitions: ctx, blockId: id(1007), equipmentId: id(2007), relatorioId: RELATORIO.id, projectId: TEST_PROJECT, locationId: cabine.id, type: definition.block_type, tag: 'SC-1', seedVersion: 'v13', orderKey: 'a7', typeVersion: 1 }).block;
    const block = cells(plate(seccionadora, { tipo_seccionadora: 'SOB CARGA COM FUSÍVEIS' }), 'resistencia_fusiveis', { '0/0': measured('10', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('12', 'mΩ') });
    expect(composeConclusion(block, definition, 'SC-1').text).toContain('resistência dos fusíveis HH fora do critério');
  });
});

// --- W3-7 and item 2: the base's texts on the derived points ----------------------------------------

const FILE: TestBaseFile = (() => {
  const parsed = parseTestBaseText(readFileSync(new URL('../../fixtures/test-base/base-ensaios-sintetica.json', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('the synthetic base does not parse');
  return parsed.file;
})();
const rec = (rowId: string) => FILE.ensaios.find((row) => row.id === rowId)!.recomendacao_reprovado!;
const PLAN = planTestBaseImport(FILE, EMPTY_DEFINITION_CONTEXT, 'v13');

describe('e23z-UNIT W3-7 the base\'s IP rows reach the derived point', () => {
  it('TR-OL-03 and TR-SE-03 attach to the insulation test as its index_recommendation only', () => {
    for (const [equipmentId, rowId] of [['TR-OL', 'TR-OL-03'], ['TR-SE', 'TR-SE-03']] as const) {
      const copy = PLAN.copies.find((one) => one.equipmentId === equipmentId)!;
      expect(copy.rows).toContainEqual({ rowId, testKey: 'isolacao' });
      const test = (copy.duplicate.draft.tests as unknown as { key: string; index_recommendation?: string; recommendation?: string; help?: { procedure?: string } }[]).find((one) => one.key === 'isolacao')!;
      expect(test.index_recommendation).toBe(rec(rowId));
      expect(test.recommendation).toBe(rec(`${equipmentId}-02`));
      expect(test.help?.procedure).toBe(FILE.ensaios.find((row) => row.id === `${equipmentId}-02`)!.procedimento);
      expect(PLAN.unattached).not.toContain(rowId);
    }
  });

  // Fix batch e24h (Matheus, 2026-11-10): ~~the three cases where the derived IP point starts with the base's recommendation~~
  // went with `derivedPoints`; no automatic point exists, so nothing prints those texts (spec e24h D4). The text helper stays.
  it('recommendedPointText keeps each recommendation once, then the composed text', () => {
    expect(recommendedPointText(['A', 'A.', 'A', null, ' '], 'x')).toBe('A. A. x');
    expect(recommendedPointText(['Trocar', 'Trocar'], 'x')).toBe('Trocar. x');
    expect(recommendedPointText('Trocar', 'x')).toBe('Trocar. x');
    expect(recommendedPointText(null, 'x')).toBe('x');
  });
});

// ~~e23z-UNIT item 2 a Reprovado chosen by hand starts with the in-force tests' recommendations~~: fix batch e24h, a Reprovado
// chosen by hand is no automatic point (spec e24h H1); its three cases on the entry's text went with `derivedPoints`.

// --- item 3: "Apagar leitura" on a tap row off the plate -----------------------------------------

describe('e23z-UNIT item 3 a TTR row off the plate takes a clear, never a value', () => {
  const FIVE_TAPS = measured('13.8;13.2;12.6;12;11.4', 'kV');
  const five = () =>
    plate(sheet('transformador_forca'), { taps: FIVE_TAPS, tap_atual_kv: measured('12.6', 'kV'), tensao_nominal_at: measured('13.8', 'kV'), tensao_nominal_bt: measured('380', 'V'), ligacao_secundaria: 'Dyn1' });
  const dropped = () => {
    const block = cells(five(), 'relacao_transformacao', { '12600/3': measured('70', null), '12600/4': measured('70', null), '12600/5': measured('70', null), '13800/3': measured('62.9', null) });
    block.sheet.nameplate.taps = cell(measured('13.8;13.2;12;11.4', 'kV'));
    return block;
  };
  const tableOf = (block: BlockRow) => definitionOf(block).tests.find((test) => test.key === 'relacao_transformacao')!.tables[0]!;
  const rowsOf = (block: BlockRow) => evaluateSheetReadings(block, definitionOf(block)).find((test) => test.testKey === 'relacao_transformacao')!.tables[0]!.rows.map((row) => row.row);

  it('the off-plate row is clearable by its filled columns; a plate row and a row never stored are not', () => {
    const block = dropped();
    expect(tapRowClearableCols(block, definitionOf(block), tableOf(block), 'relacao_transformacao', 12600)).toEqual([3, 4, 5]);
    expect(tapRowClearable(block, definitionOf(block), tableOf(block), 'relacao_transformacao', 13800)).toBe(false);
    expect(tapRowClearable(block, definitionOf(block), tableOf(block), 'relacao_transformacao', 12601)).toBe(false);
  });

  it('a put of null on each filled cell is accepted and the row leaves the table; a non-null put stays refused', () => {
    const block = dropped();
    const f = opFactory();
    let state: EntityState = new Map([[entityKey('block', block.id), block]]);
    // As a device writes it: `prev_op_id` names the cell's head op (a write with none over a held value is concurrent).
    const head = (row: number, col: number) => (state.get(entityKey('block', block.id)) as BlockRow).sheet.test.relacao_transformacao?.cells[String(row)]?.[String(col)]?.op_id ?? null;
    const put = (col: number, value: JsonValue, row = 12600) => f.op({ path: `sheet/${block.id}/test/relacao_transformacao/cell/${row}/${col}`, value, prev_op_id: head(row, col) });
    expect(() => applyOp(state, put(3, measured('62.9', null)))).toThrow(SeedPathError);
    // Fix batch e24f (R-5, contract 42): ~~a null put on a row never stored is refused~~; a clear off the plate is
    // accepted whatever the row holds, and on a row with no filled cell it changes nothing.
    expect(applyOp(state, put(3, null, 12601)).get(entityKey('block', block.id))).toBe(block);
    expect(rowsOf(block)).toContain(12600);
    for (const col of [3, 4, 5]) state = applyOp(state, put(col, null));
    const cleared = state.get(entityKey('block', block.id)) as BlockRow;
    expect(rowsOf(cleared)).not.toContain(12600);
    expect(rowsOf(cleared)).toEqual([13800, 13200, 12000, 11400]);
    // Cleared, the row is refused a value again; fix batch e24f (R-5): ~~and a null~~ a null is a no-op.
    expect(() => applyOp(state, put(3, measured('70', null)))).toThrow(SeedPathError);
    expect(applyOp(state, put(3, null)).get(entityKey('block', block.id))).toBe(cleared);
    // A row of the plate takes values as before.
    expect(() => applyOp(state, put(3, measured('62.9', null), 13200))).not.toThrow();
  });

  it('e24f-UNIT R-5 a second "Apagar leitura" from another device: each null put and a remove accepted with nothing changed; a value still refused', () => {
    const block = dropped();
    const deviceA = opFactory(T0, idSequence('019966b0-0e24-7000-800a-'));
    const deviceB = opFactory(T0, idSequence('019966b0-0e24-7000-800b-'));
    const key = entityKey('block', block.id);
    const start: EntityState = new Map([[key, block]]);
    // Both devices saw the row filled: each op names the cell's head op of that state.
    const headOf = (row: number, col: number) => block.sheet.test.relacao_transformacao?.cells[String(row)]?.[String(col)]?.op_id ?? null;
    const clear = (f: ReturnType<typeof opFactory>, col: number) => f.op({ path: `sheet/${block.id}/test/relacao_transformacao/cell/12600/${col}`, value: null, prev_op_id: headOf(12600, col) });
    let server = start;
    for (const col of [3, 4, 5]) server = applyOp(server, clear(deviceA, col));
    const afterA = server.get(key) as BlockRow;
    expect(rowsOf(afterA)).not.toContain(12600);
    // Device B's three null puts (synced later): accepted, the row deep-equal before and after.
    for (const col of [3, 4, 5]) {
      const before = server.get(key);
      server = applyOp(server, clear(deviceB, col));
      expect(server.get(key), `col ${col}`).toBe(before);
    }
    expect(server.get(key)).toEqual(afterA);
    // A remove on the emptied row: accepted, no-op. (The op schema takes a remove on a removed_at path only, so this
    // kind reaches the fold from no push; the fold's branch is pinned here alone.)
    const remove = { ...clear(deviceB, 3), kind: 'remove' } as Op;
    expect(applyOp(server, remove).get(key)).toBe(server.get(key));
    // A non-null put on the off-plate row stays refused, on the filled row and on the emptied one.
    const value = () => deviceB.op({ path: `sheet/${block.id}/test/relacao_transformacao/cell/12600/3`, value: measured('70', null), prev_op_id: null });
    expect(() => applyOp(start, value())).toThrow(SeedPathError);
    expect(() => applyOp(server, value())).toThrow(SeedPathError);
  });
});

// --- item 4: DESLOCAMENTO ANGULAR kept while the ratio reads it -------------------------------------

describe('e23z-UNIT item 4 a copy may not remove the vector-group field while its ratio test reads it', () => {
  const tf = () => duplicateSeededType('v13', 'transformador_forca').draft;
  const fieldAt = (draft: CompanyTypeDefinition) => draft.nameplate.findIndex((field) => field.key === 'ligacao_secundaria');

  it('Remover on DESLOCAMENTO ANGULAR: refused with the kernel\'s reason, the draft unchanged', () => {
    const draft = tf();
    expect(removeDraftEntryRefusal(draft, 'nameplate', fieldAt(draft))).toBe('O campo DESLOCAMENTO ANGULAR não pode ser removido: a relação de transformação calcula por ele. Remova antes o ensaio.');
    expect(removeDraftEntry(draft, 'nameplate', fieldAt(draft))).toEqual(draft);
    // Another field is removed as before.
    expect(removeDraftEntryRefusal(draft, 'nameplate', 0)).toBeNull();
    expect((removeDraftEntry(draft, 'nameplate', 0) as CompanyTypeDefinition).nameplate).toHaveLength(draft.nameplate.length - 1);
  });

  it('the ratio test removed first, or a type with no such table: the removal works', () => {
    const draft = tf();
    const withoutRatio = removeDraftEntry(draft, 'tests', draft.tests.findIndex((test) => test.key === 'relacao_transformacao')) as CompanyTypeDefinition;
    expect(removeDraftEntryRefusal(withoutRatio, 'nameplate', fieldAt(withoutRatio))).toBeNull();
    expect((removeDraftEntry(withoutRatio, 'nameplate', fieldAt(withoutRatio)) as CompanyTypeDefinition).nameplate.some((field) => field.key === 'ligacao_secundaria')).toBe(false);
    const tp = duplicateSeededType('v13', 'tp').draft;
    const at = tp.nameplate.findIndex((field) => field.key === 'ligacao_secundaria');
    if (at !== -1) expect(removeDraftEntryRefusal(tp, 'nameplate', at)).toBeNull();
  });
});
