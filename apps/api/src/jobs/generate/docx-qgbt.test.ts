import {
  applyOp,
  blockPath,
  buildSnapshot,
  conclusionTextOnConclude,
  entityKey,
  getDefinition,
  layoutSpec,
  makeOp,
  newEquipmentBlock,
  replay,
  sheetChecklistPath,
  sheetConclusionPath,
  sheetNameplatePath,
  sheetObservationsPath,
  sheetTestCellPath,
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
 * Stories 14.9 and 14.11: section 9 of the DOCX on seed v6. One local ("Subestação", grouped by
 * type) holds a dry transformer (Á SECO, with a VOL. ÓLEO stored before it was switched dry) and a
 * Quadro elétrico (QGBT/QD) filled on site at 380 V: one item NC, one of the four insulation rows
 * under 0,5 MΩ. Read back from section 9's own heading: the "Outros equipamentos" group after
 * Transformadores, the QGBT's tables (DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS without the two
 * hints, ENSAIO DE ISOLAÇÃO with its instrument header and ACEITÁVEL MΩ, OBSERVAÇÕES, CONCLUSÃO),
 * and the dry transformer's oil items NA and VOL. ÓLEO "-". Every string is the kernel's
 * (`packages/domain/src/print/section-9.ts`); the sheets are folded with `applyOp`.
 */

const ISSUED_AT = '2026-10-20T12:00:00.000Z';
const SECTION_9 = '9 RELATÓRIOS DOS ENSAIOS';
const QD = 'quadro_eletrico';
const QD_TAG = 'QD-SUBESTACAO';
const QD_TITLE = `QGBT/QD's ${QD_TAG}`;
const TRANSFORMADORES = '9.1 Transformadores e Cabos de Alimentação da Subestação';
const OUTROS = '9.2 Outros equipamentos da Subestação';
const NC_OBSERVATION = 'disjuntor não atua no trip';

const id = (n: number) => `019966b0-0231-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = id(1);
const QD_BLOCK = id(1001);
const TR_BLOCK = id(1002);
const definition = getDefinition('v6', 'cabine_primaria', QD);
const num = (raw: string, unit: string): JsonValue => ({ raw, unit, state: 'measured' });

function base(): RelatorioSnapshot {
  return buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
}

function snapshotOf(volts: string): RelatorioSnapshot {
  const snapshot = base();
  const relatorio = { ...snapshot.relatorio, seed_version: 'v6', export: { scheme: 'por_local_e_tipo' as const } };
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
    newEquipmentBlock({ blockId, equipmentId, relatorioId: relatorio.id, projectId: relatorio.project_id, locationId: LOCAL, type, tag, seedVersion: 'v6', orderKey });
  const qd = make(QD_BLOCK, id(2001), QD, QD_TAG, 'a1');
  const tr = make(TR_BLOCK, id(2002), 'transformador_forca', 'TR-1', 'a0');

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
    [entityKey('equipment', id(2001)), qd.equipment],
    [entityKey('equipment', id(2002)), tr.equipment],
  ]);
  const put = (path: string, value: JsonValue) => (state = applyOp(state, op('put', path, value)));
  state = applyOp(state, op('create', blockPath(QD_BLOCK), qd.block as unknown as JsonValue));
  state = applyOp(state, op('create', blockPath(TR_BLOCK), tr.block as unknown as JsonValue));

  // The QGBT.
  const plate: Record<string, JsonValue> = {
    identificacao: 'QD-01',
    fabricante: 'Brivolta',
    n_serie: 'QD-552013',
    tipo: 'QGBT-800',
    tipo_de_isolacao: 'BARRAMENTO ISOLADO',
    data_de_fabricacao: '2018-05',
    corrente_de_curto: num('50', 'kA'),
    tensao_nominal: num(volts, 'V'),
    ip: 'IP54',
  };
  for (const [key, value] of Object.entries(plate)) put(sheetNameplatePath(QD_BLOCK, key), value);
  definition.checklist!.forEach((item, index) => {
    put(sheetChecklistPath(QD_BLOCK, item.key, 'result'), index === 7 ? 'NC' : 'C');
    if (index === 7) put(sheetChecklistPath(QD_BLOCK, item.key, 'observation'), NC_OBSERVATION);
  });
  ['850', '1200', '0.4', '900'].forEach((raw, row) => put(sheetTestCellPath(QD_BLOCK, 'isolacao', row, 1), num(raw, 'MΩ')));
  put(sheetObservationsPath(QD_BLOCK), 'Quadro com acesso restrito.');
  put(sheetConclusionPath(QD_BLOCK, 'result'), 'aprovado');
  put(sheetConclusionPath(QD_BLOCK, 'restriction'), 'com_restricoes');
  const confirmed = conclusionTextOnConclude(state.get(entityKey('block', QD_BLOCK)) as BlockRow, definition, QD_TAG)!;
  put(sheetConclusionPath(QD_BLOCK, 'text'), confirmed.text);
  put(sheetConclusionPath(QD_BLOCK, 'text_status'), 'confirmed');
  put(sheetConclusionPath(QD_BLOCK, 'text_basis'), confirmed.basis);

  // The dry transformer: VOL. ÓLEO typed while it read ÓLEO, then Á SECO by a plain put, and one oil item answered C.
  put(sheetNameplatePath(TR_BLOCK, 'tipo_de_isolacao'), 'ÓLEO');
  put(sheetNameplatePath(TR_BLOCK, 'vol_oleo'), num('320', 'L'));
  put(sheetNameplatePath(TR_BLOCK, 'tipo_de_isolacao'), 'Á SECO');
  put(sheetChecklistPath(TR_BLOCK, 'termometro', 'result'), 'C');

  const blocks = [TR_BLOCK, QD_BLOCK].map((blockId) => state.get(entityKey('block', blockId)) as BlockRow);
  return {
    ...snapshot,
    relatorio,
    locations: [local],
    blocks: [...snapshot.blocks.filter((block) => block.location_id === null), ...blocks],
    equipment: [tr.equipment, qd.equipment] as EquipmentRow[],
    files: snapshot.files.filter((file) => file.kind !== 'photo'),
    points: [],
    suggestions: [],
  };
}

async function render(snapshot: RelatorioSnapshot) {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  const structure = extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
  const from = structure.paragraphs.lastIndexOf(SECTION_9);
  const to = structure.paragraphs.findIndex((p, i) => i > from && p.startsWith('10 CONCLUSÃO'));
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  const titled = (title: string) => structure.tables.filter((table) => table[0]?.[0] === title);
  return { structure, section: structure.paragraphs.slice(from, to), titled };
}

const ascending = (section: readonly string[], texts: readonly string[]) => texts.map((text) => section.indexOf(text)).every((at, i, all) => at > -1 && (i === 0 || at > all[i - 1]!));

let filled: ReturnType<typeof render> | null = null;
const renderFilled = () => (filled ??= render(snapshotOf('380')));

describe('14.9-UNIT section 9 in the DOCX: a Quadro elétrico (QGBT/QD) under "Outros equipamentos"', () => {
  it('the group is a Heading 2 after the Transformadores group of the same local, and the sheet is titled QGBT/QD\'s', async () => {
    const { structure, section } = await renderFilled();
    expect(ascending(section, [SECTION_9, TRANSFORMADORES, 'TRANSFORMADOR DE FORÇA TR-1', OUTROS, QD_TITLE])).toBe(true);
    expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual([TRANSFORMADORES, OUTROS]);
    const sheet = section.slice(section.indexOf(QD_TITLE));
    expect(ascending(sheet, [QD_TITLE, 'DADOS DO EQUIPAMENTO', 'VERIFICAÇÕES GERAIS', 'ENSAIO DE ISOLAÇÃO', 'Quadro com acesso restrito.', 'CONCLUSÃO'])).toBe(true);
  }, 60_000);

  it('DADOS DO EQUIPAMENTO holds the 10 fields, three pairs a row', async () => {
    const { titled } = await renderFilled();
    const plate = titled('DADOS DO EQUIPAMENTO').find((table) => table[1]?.[0] === 'IDENTIFICAÇÃO' && table[1]?.[2] === 'FABRICANTE');
    expect(plate).toEqual([
      ['DADOS DO EQUIPAMENTO'],
      ['IDENTIFICAÇÃO', 'QD-01', 'FABRICANTE', 'Brivolta', 'Nº SÉRIE', 'QD-552013'],
      ['TIPO', 'QGBT-800', 'TIPO DE ISOLAÇÃO', 'BARRAMENTO ISOLADO', 'DATA DE FABRICAÇÃO', '05/2018'],
      ['CORRENTE DE CURTO', '50 kA', 'TENSÃO NOMINAL', '380 V', 'IP', 'IP54'],
      ['CIRCUITO SELV/PELV', '-', '', '', '', ''],
    ]);
  }, 60_000);

  it('VERIFICAÇÕES GERAIS holds the 17 items, the NC row with its observation, and neither hint prints anywhere', async () => {
    const { titled, structure } = await renderFilled();
    const checklist = titled('VERIFICAÇÕES GERAIS').find((table) => table[2]?.[0] === '1. LIMPEZA INTERNA E EXTERNA');
    expect(checklist).toHaveLength(2 + 17);
    expect(checklist![9]).toEqual(['8. DISJUNTORES TERMOMAGNÉTICOS', '', 'X', '', NC_OBSERVATION]);
    expect(checklist![17]).toEqual(['16. ORGANIZAÇÃO INTERNA', 'X', '', '', '']);
    expect(checklist![18]).toEqual(['17. IDENTIFICAÇÃO DE CIRCUITOS', 'X', '', '', '']);
    const everything = JSON.stringify(structure);
    expect(everything).not.toContain('FUNCIONAMENTO MECÂNICO');
    expect(everything).not.toContain('CANALETA, CHICOTE');
  }, 60_000);

  it('ENSAIO DE ISOLAÇÃO prints its instrument header with ACEITÁVEL MΩ the band minimum, the criterion line and the four rows', async () => {
    const { titled, section, structure } = await renderFilled();
    const header = titled('ENSAIO DE ISOLAÇÃO').find((table) => table[1]?.at(-1) === 'ACEITÁVEL MΩ');
    expect(header).toEqual([['ENSAIO DE ISOLAÇÃO'], ['INSTRUM./FABRIC.', 'TIPO', 'Nº SÉRIE', 'RBC', 'TENSÃO ENSAIO', 'ACEITÁVEL MΩ'], ['-', '-', '-', '-', '-', '0,5']]);
    expect(section).toContain('CRITÉRIO: >=0,5 MΩ · NBR 5410');
    const values = structure.tables.find((table) => table.some((row) => row[0] === 'NEUTRO'))!;
    expect(values.filter((row) => ['FASE A', 'FASE B', 'FASE C', 'NEUTRO'].includes(row[0]!)).map((row) => row.slice(0, 5))).toEqual([
      ['FASE A', 'MASSA', '', '-', '850 MΩ'],
      ['FASE B', 'MASSA', '', '-', '1.200 MΩ'],
      ['FASE C', 'MASSA', '', '-', '0,4 MΩ'],
      ['NEUTRO', 'MASSA', '', '-', '900 MΩ'],
    ]);
  }, 60_000);

  it('OBSERVAÇÕES and the CONCLUSÃO of an NC: the pair marked and the confirmed paragraph naming the item and the reading', async () => {
    const { titled } = await renderFilled();
    expect(titled('OBSERVAÇÕES').at(-1)).toEqual([['OBSERVAÇÕES'], ['Quadro com acesso restrito.']]);
    const conclusion = titled('CONCLUSÃO').at(-1)!;
    expect(conclusion[1]).toEqual(['APROVADO', 'X', 'REPROVADO', '', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']);
    expect(conclusion[2]![0]).toContain(`O quadro elétrico ${QD_TAG} (Brivolta, 380 V) apresentou resistência de isolação mínima de 0,4 MΩ em Fase C–Massa (critério: >=0,5 MΩ, NBR 5410)`);
    expect(conclusion[2]![0]).toContain(`${NC_OBSERVATION} (item 8, NC)`);
  }, 60_000);

  it('above 500 V the ACEITÁVEL MΩ prints 1,0', async () => {
    const { titled } = await render(snapshotOf('690'));
    expect(titled('ENSAIO DE ISOLAÇÃO').find((table) => table[1]?.at(-1) === 'ACEITÁVEL MΩ')![2]!.at(-1)).toBe('1,0');
  }, 60_000);
});

describe('14.11-UNIT section 9 in the DOCX: a dry transformer on seed v6', () => {
  it('its oil items print NA, the C stored on one prints C, and VOL. ÓLEO prints "-" whatever is stored', async () => {
    const { titled } = await renderFilled();
    const plate = titled('DADOS DO EQUIPAMENTO').find((table) => table.some((row) => row.includes('VOL. ÓLEO')))!;
    const cells = plate.flat();
    expect(cells[cells.indexOf('VOL. ÓLEO') + 1]).toBe('-');
    expect(cells[cells.indexOf('TIPO DE ISOLAÇÃO') + 1]).toBe('Á SECO');
    const checklist = titled('VERIFICAÇÕES GERAIS').find((table) => table[2]?.[0] === '1. LIMPEZA')!;
    const row = (label: string) => checklist.find((r) => r[0]!.endsWith(label))!.slice(1, 4);
    for (const label of ['VÁLVULA DE ALÍVIO', 'ELEMENTO SECANTE', 'JUNTAS, VEDAÇÕES E VAZAMENTOS', 'INDICADOR NÍVEL DE ÓLEO', 'REGISTROS, RADIADORES', 'RELÉ DE GÁS, FUNCIONAMENTO', 'ÓLEO ISOLANTE/INDICADOR DE NÍVEL']) {
      expect(row(label), label).toEqual(['', '', 'X']);
    }
    expect(row('TERMÔMETRO')).toEqual(['X', '', '']);
    expect(row('LIMPEZA')).toEqual(['', '', '']);
  }, 60_000);
});
