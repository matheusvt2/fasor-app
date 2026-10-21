import {
  applyOp,
  blockPath,
  buildSnapshot,
  entityKey,
  getDefinition,
  layoutSpec,
  makeOp,
  newEquipmentBlock,
  replay,
  sheetChecklistPath,
  sheetNameplatePath,
  sheetTestCellPath,
  sheetTestPath,
  SELV_VOLTAGE_NOTICE,
  TEST_VOLTAGE_NOT_CHECKED,
  type BlockRow,
  type EntityKey,
  type EntityRow,
  type EntityState,
  type EquipmentBlockType,
  type EquipmentRow,
  type JsonValue,
  type LocationRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * Story 14.14: section 9 of the DOCX on seed v7, against the same sheets on v6. One local holds a
 * Disjuntor MT and a Quadro elétrico (QGBT/QD). On v7 the disjuntor reads "Outro" with its oil
 * item answered and VOL. ÓLEO typed: both print as typed, never NA nor "-". The QGBT is marked
 * SELV/PELV at 380 V with an instrument whose TENSÃO ENSAIO is not the band's: neither the help
 * text nor any notice prints. On v6 the disjuntor reads "ÓLEO (PVO)" and prints as it shipped.
 * Every string is the kernel's; the sheets are folded with `applyOp`.
 */

const ISSUED_AT = '2026-10-21T12:00:00.000Z';
const SECTION_9 = '9 RELATÓRIOS DOS ENSAIOS';
const OIL_ITEM = 'oleo_isolante_indicador_de_nivel';

const id = (n: number) => `019966b0-0251-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = id(1);
const DJ_BLOCK = id(1001);
const QD_BLOCK = id(1002);
const num = (raw: string, unit: string): JsonValue => ({ raw, unit, state: 'measured' });

function snapshotOf(seedVersion: 'v6' | 'v7', medium: string): RelatorioSnapshot {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  const relatorio = { ...snapshot.relatorio, seed_version: seedVersion, export: { scheme: 'por_local_e_tipo' as const } };
  const local: LocationRow = {
    id: LOCAL,
    relatorio_id: relatorio.id,
    parent_id: null,
    kind: 'cabine',
    name: 'Subestação',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: true,
  };
  const make = (blockId: string, equipmentId: string, type: EquipmentBlockType, tag: string, orderKey: string) =>
    newEquipmentBlock({ blockId, equipmentId, relatorioId: relatorio.id, projectId: relatorio.project_id, locationId: LOCAL, type, tag, seedVersion, orderKey });
  const dj = make(DJ_BLOCK, id(2001), 'disjuntor_mt', 'DJ-1', 'a0');
  const qd = make(QD_BLOCK, id(2002), 'quadro_eletrico', 'QD-1', 'a1');

  const origin = portoSeguro.log[0]!;
  let n = 0;
  const op = (kind: 'create' | 'put', path: string, value: JsonValue) =>
    makeOp(
      { kind, scope: 'relatorio', company_id: origin.company_id, project_id: null, relatorio_id: relatorio.id, prev_op_id: null, batch_id: null, meta: null, actor_id: origin.actor_id, device_id: origin.device_id, path, value },
      { newId: () => id(5000 + ++n), now: new Date(Date.parse(ISSUED_AT) - 3_600_000 + n * 1000) },
    );
  let state: EntityState = new Map<EntityKey, EntityRow>([
    [entityKey('relatorio', relatorio.id), relatorio],
    [entityKey('location', LOCAL), local],
    [entityKey('equipment', id(2001)), dj.equipment],
    [entityKey('equipment', id(2002)), qd.equipment],
  ]);
  const put = (path: string, value: JsonValue) => (state = applyOp(state, op('put', path, value)));
  state = applyOp(state, op('create', blockPath(DJ_BLOCK), dj.block as unknown as JsonValue));
  state = applyOp(state, op('create', blockPath(QD_BLOCK), qd.block as unknown as JsonValue));

  put(sheetNameplatePath(DJ_BLOCK, 'meio_de_extincao'), medium);
  put(sheetNameplatePath(DJ_BLOCK, 'vol_oleo'), num('45', 'L'));
  put(sheetChecklistPath(DJ_BLOCK, OIL_ITEM, 'result'), 'C');

  put(sheetNameplatePath(QD_BLOCK, 'tensao_nominal'), num('380', 'V'));
  put(sheetNameplatePath(QD_BLOCK, 'circuito_selv_pelv'), 'SIM');
  put(sheetTestPath(QD_BLOCK, 'isolacao', 'instrument'), {
    instrument_id: id(3001),
    code: '2E',
    manufacturer: 'Megabras',
    model: 'MI-5000',
    serial: 'MB-1',
    cert_number: null,
    calibrated_at: null,
    valid_until: null,
    test_parameter: '5.000 V',
  });
  put(sheetTestCellPath(QD_BLOCK, 'isolacao', 0, 1), num('850', 'MΩ'));

  const blocks = [DJ_BLOCK, QD_BLOCK].map((blockId) => state.get(entityKey('block', blockId)) as BlockRow);
  return {
    ...snapshot,
    relatorio,
    locations: [local],
    blocks: [...snapshot.blocks.filter((block) => block.location_id === null), ...blocks],
    equipment: [dj.equipment, qd.equipment] as EquipmentRow[],
    files: snapshot.files.filter((file) => file.kind !== 'photo'),
    points: [],
    suggestions: [],
  };
}

async function render(snapshot: RelatorioSnapshot) {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  const structure = extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
  const from = structure.paragraphs.lastIndexOf(SECTION_9);
  expect(from).toBeGreaterThan(-1);
  const titled = (title: string) => structure.tables.filter((table) => table[0]?.[0] === title);
  return { structure, titled };
}

/** The disjuntor's printed plate and its oil item's C · NC · NA marks. */
async function disjuntorOf(seedVersion: 'v6' | 'v7', medium: string) {
  const { titled, structure } = await render(snapshotOf(seedVersion, medium));
  const plate = titled('DADOS DO EQUIPAMENTO').find((table) => table.some((row) => row.includes('MEIO DE EXTINÇÃO')))!.flat();
  const checklist = titled('VERIFICAÇÕES GERAIS').find((table) => table.some((row) => row[0]?.endsWith('ÓLEO ISOLANTE/INDICADOR DE NÍVEL')))!;
  const oilRow = checklist.find((row) => row[0]!.endsWith('ÓLEO ISOLANTE/INDICADOR DE NÍVEL'))!.slice(1, 4);
  return { medium: plate[plate.indexOf('MEIO DE EXTINÇÃO') + 1], volume: plate[plate.indexOf('VOL. ÓLEO') + 1], oilRow, structure };
}

describe('14.14-UNIT section 9 in the DOCX on seed v7', () => {
  it('a disjuntor on "Outro" prints the medium as spelled, VOL. ÓLEO as typed and its oil item as answered', async () => {
    const printed = await disjuntorOf('v7', 'Outro');
    expect(printed.medium).toBe('Outro');
    expect(printed.volume).toBe('45 L');
    expect(printed.oilRow).toEqual(['X', '', '']);
  }, 60_000);

  it('a disjuntor on "Ar" prints its oil item as stored and VOL. ÓLEO "-", as a non-oil unit', async () => {
    const printed = await disjuntorOf('v7', 'Ar');
    expect(printed.medium).toBe('Ar');
    expect(printed.volume).toBe('-');
    expect(printed.oilRow).toEqual(['X', '', '']);
  }, 60_000);

  it('the QGBT prints no help text, no SELV notice and no test-voltage notice; the TENSÃO ENSAIO prints as typed', async () => {
    const { titled, structure } = await render(snapshotOf('v7', 'Outro'));
    const everything = JSON.stringify(structure);
    expect(everything).not.toContain('SELV e PELV');
    expect(everything).not.toContain(SELV_VOLTAGE_NOTICE);
    expect(everything).not.toContain(TEST_VOLTAGE_NOT_CHECKED);
    expect(everything).not.toContain('diferente da prevista');
    const header = titled('ENSAIO DE ISOLAÇÃO').find((table) => table[1]?.at(-1) === 'ACEITÁVEL MΩ')!;
    expect(header[2]!.at(-2)).toBe('5.000 V');
    expect(header[2]!.at(-1)).toBe('0,25');
  }, 60_000);

  it('v6 untouched: a disjuntor on "ÓLEO (PVO)" prints as it shipped; "AR" prints VOL. ÓLEO "-"', async () => {
    const oil = await disjuntorOf('v6', 'ÓLEO (PVO)');
    expect(oil.medium).toBe('ÓLEO (PVO)');
    expect(oil.volume).toBe('45 L');
    expect(oil.oilRow).toEqual(['X', '', '']);
    const ar = await disjuntorOf('v6', 'AR');
    expect(ar.medium).toBe('AR');
    expect(ar.volume).toBe('-');
    expect(getDefinition('v6', 'cabine_primaria', 'disjuntor_mt').nameplate.find((field) => field.key === 'meio_de_extincao')!.options).not.toContain('Outro');
  }, 60_000);
});
