import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { numberPhotos } from '../photos/numbering.ts';
import { composeConclusion } from '../relatorio/conclusion.ts';
import { preIssue, preIssueRowsFor } from '../relatorio/pre-issue.ts';
import { naoEnsaiadasText, progress } from '../relatorio/progress.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType, Role, SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow, Cell, EquipmentRow, LocationRow, SuggestionRow, UserRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { EMPTY_SECTION_NOTE, layoutSpec } from './layout.ts';
import { layoutPhotoIds, section9Layout, type LayoutSectionSheets, type PrintSheet, type PrintTable, type SheetPart } from './section-9.ts';

/*
 * Story 7.1 (+ 7.2 AC2, E12-A2): the section 9 layout over small hand-built relatórios,
 * one test per row of the spec's I/O matrix, then the NFR-17 check on the Porto Seguro
 * fixture. Every printed string is asserted here, in the kernel; the api only draws it.
 */

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const RELATORIO = small.relatorio.id;
const ISSUED_AT = '2026-09-23T12:00:00.000Z';
const TITLE = 'RELATÓRIOS DOS ENSAIOS';

const id = (n: number) => `019966b0-0072-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(50_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const notMeasured = (unit: string | null) => ({ raw: '', unit, state: 'not_measured' as const });

const USER: UserRow = { id: id(900), name: 'Bruno Silva', email: 'bruno@teste.local', council: 'crea', registration_number: '1', title: null, photo_location_enabled: true };

function cabine(n: number, name: string, orderKey: string, over: Partial<Extract<LocationRow, { kind: 'cabine' }>> = {}): LocationRow {
  return {
    id: id(n),
    relatorio_id: RELATORIO,
    parent_id: null,
    kind: 'cabine',
    name,
    order_key: orderKey,
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: false,
    ...over,
  };
}

interface Built {
  block: BlockRow;
  equipment: EquipmentRow;
}

/** An equipment sheet `n` (block id(1000+n), equipment id(2000+n)) at `location`, the default config of its type, `tag` its TAG. */
function sheet(n: number, location: number, type: EquipmentBlockType, orderKey: string, tag = `T${n}`): Built {
  return newEquipmentBlock({
    blockId: id(1000 + n),
    equipmentId: id(2000 + n),
    relatorioId: RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(location),
    type,
    tag,
    seedVersion: 'v1',
    orderKey,
  });
}

/** A copy of `built` whose block has `patch` applied to it. */
function edit(built: Built, patch: (block: BlockRow) => BlockRow): Built {
  return { ...built, block: patch(structuredClone(built.block)) };
}

const withRole = (role: Role) => (block: BlockRow): BlockRow => ({ ...block, config: { ...(block.config as object), role } });

function withSubBlocks(enabled: Partial<Record<SubBlockKey, boolean>>) {
  return (block: BlockRow): BlockRow => {
    const config = block.config as { sub_blocks: Record<string, { enabled: boolean }> };
    const sub_blocks = { ...config.sub_blocks };
    for (const [key, on] of Object.entries(enabled)) sub_blocks[key] = { enabled: on };
    return { ...block, config: { ...config, sub_blocks } };
  };
}

function withNameplate(values: Record<string, unknown>) {
  return (block: BlockRow): BlockRow => {
    for (const [key, value] of Object.entries(values)) block.sheet.nameplate[key] = cell(value);
    return block;
  };
}

function withChecklist(results: Record<string, 'C' | 'NC' | 'NA'>, observations: Record<string, string> = {}) {
  return (block: BlockRow): BlockRow => {
    for (const [key, value] of Object.entries(results)) block.sheet.checklist[key] = { ...block.sheet.checklist[key], result: cell(value) };
    for (const [key, text] of Object.entries(observations)) block.sheet.checklist[key] = { ...block.sheet.checklist[key], observation: cell(text) };
    return block;
  };
}

const INSTRUMENT = { instrument_id: id(800), code: '2E', manufacturer: 'Instrument', model: 'DMG10Ki', serial: 'IN919021', cert_number: '37428/26', calibrated_at: null, valid_until: null, test_parameter: '10 kV' };

/** The cells of one test, addressed "row/col", and optionally its instrument header. */
function withTest(testKey: string, cells: Record<string, unknown>, instrument: unknown = null) {
  return (block: BlockRow): BlockRow => {
    const test = block.sheet.test[testKey] ?? { cells: {} };
    for (const [address, value] of Object.entries(cells)) {
      const [row, col] = address.split('/') as [string, string];
      test.cells[row] = { ...test.cells[row], [col]: cell(value) };
    }
    if (instrument !== null) test.instrument = cell(instrument);
    block.sheet.test[testKey] = test;
    return block;
  };
}

function withConclusion(result: string | null, restriction: string | null) {
  return (block: BlockRow): BlockRow => {
    if (result !== null) block.sheet.conclusion.result = cell(result);
    if (restriction !== null) block.sheet.conclusion.restriction = cell(restriction);
    return block;
  };
}

function snapshotOf(locations: LocationRow[], sheets: Built[], over: Partial<RelatorioSnapshot> = {}): RelatorioSnapshot {
  return { ...small, locations, blocks: sheets.map((s) => s.block), equipment: sheets.map((s) => s.equipment), files: [], points: [], suggestions: [], actors: [], ...over };
}

function layoutOf(snapshot: RelatorioSnapshot, number = 9): LayoutSectionSheets {
  const section = section9Layout(snapshot, number, TITLE);
  if (section === null) throw new Error('section 9 printed nothing');
  return section;
}

/** Every sheet of a layout, in print order. */
const sheetsOf = (section: LayoutSectionSheets): PrintSheet[] => section.subsections.flatMap((s) => s.sheets);
const sheetOf = (section: LayoutSectionSheets, blockId: string): PrintSheet => sheetsOf(section).find((s) => s.blockId === blockId)!;
const texts = (table: PrintTable): string[][] => table.rows.map((row) => row.cells.map((c) => c.text));

/** A part's name: a table's first band or header text, "photos ⟨numbers⟩", "paragraph". */
function partName(part: SheetPart): string {
  if (part.kind === 'paragraph') return 'paragraph';
  if (part.kind === 'photos') return `photos ${part.photos.map((p) => p.number).join(' ')}`;
  return part.table.rows[0]!.cells[0]!.text;
}

/** The table part whose first cell reads `name`. */
function tableNamed(sheet: PrintSheet, name: string): PrintTable {
  const part = sheet.parts.find((p): p is Extract<SheetPart, { kind: 'table' }> => p.kind === 'table' && p.table.rows[0]!.cells[0]!.text === name);
  if (part === undefined) throw new Error(`no table "${name}" in ${sheet.title}`);
  return part.table;
}

function photo(n: number, over: { block_id?: string | null; item_key?: string | null; reading_kind?: 'plate' | null; caption?: string | null; captured_at: string; removed_at?: string | null }): RelatorioSnapshot['files'][number] {
  return {
    id: id(3000 + n),
    relatorio_id: RELATORIO,
    kind: 'photo',
    sha256: 'ab',
    mime: 'image/jpeg',
    size: 1,
    uploaded_at: null,
    variants: null,
    removed_at: over.removed_at ?? null,
    captured_at: over.captured_at,
    tz_offset: -180,
    coords: null,
    local_seq: n,
    block_id: over.block_id ?? null,
    item_key: over.item_key ?? null,
    caption: over.caption ?? null,
    reading_kind: over.reading_kind ?? null,
    reading_target: null,
    reading_status: 'none',
  };
}

const block = (n: number) => id(1000 + n);

// A chave seccionadora of entrada filled on every step: the sheet the order tests read.
const FULL_CHAVE = edit(sheet(1, 1, 'chave_seccionadora', 'a0', 'SEC-01'), (b) =>
  [
    withRole('entrada'),
    withNameplate({ identificacao: 'COLUNA 1 - ENTRADA', fabricacao: 'Celtta', n_serie: '7.620B', tensao_de_placa: '15', corrente_nominal: measured('630', 'A'), data_de_fabricacao: '2012-07' }),
    withChecklist({ abertura_e_fechamento_manual: 'C', contatos: 'NC', motor: 'NA' }, { contatos: 'oxidação nos contatos' }),
    withTest('isolacao', { '0/0': measured('173', 'GΩ'), '1/0': measured('720', 'GΩ'), '2/0': measured('860', 'GΩ'), '3/0': measured('173', 'GΩ'), '4/0': measured('720', 'GΩ'), '5/0': measured('860', 'GΩ') }, INSTRUMENT),
    withTest('resistencia_contato', { '0/0': measured('132', 'µΩ'), '1/0': measured('157', 'µΩ'), '2/0': measured('183', 'µΩ') }, { ...INSTRUMENT, code: '3M', manufacturer: 'Hi-Tech', model: 'HTMO-10', test_parameter: '10 A' }),
    (x: BlockRow) => ({ ...x, sheet: { ...x.sheet, observations: cell('Contatos oxidados.') } }),
    withConclusion('aprovado', 'com_restricoes'),
  ].reduce((acc, step) => step(acc), b),
);

describe('7.1 section9Layout: one sheet in FO.SERV-03 order', () => {
  const files = [
    photo(7, { captured_at: '2026-09-06T09:00:00.000Z' }), // a general photo: number 1
    photo(4, { block_id: block(1), caption: '  ', captured_at: '2026-09-06T10:00:00.000Z' }), // 2, after the tests
    photo(1, { block_id: block(1), item_key: 'contatos', caption: 'Detalhe dos contatos', captured_at: '2026-09-06T10:01:00.000Z' }), // 3, after the checklist
    photo(2, { block_id: block(1), reading_kind: 'plate', captured_at: '2026-09-06T10:02:00.000Z' }), // 4, after the nameplate
    photo(3, { block_id: block(1), caption: 'Vista geral.', captured_at: '2026-09-06T10:03:00.000Z' }), // 5, after the tests
    photo(5, { block_id: block(2), captured_at: '2026-09-06T10:04:00.000Z' }), // 6, another sheet's
    photo(6, { block_id: block(1), captured_at: '2026-09-06T09:30:00.000Z', removed_at: '2026-09-06T11:00:00.000Z' }), // removed: no number
  ];
  const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [FULL_CHAVE, sheet(2, 1, 'disjuntor_mt', 'a1')], { files });
  const layout = layoutOf(snapshot);
  const printed = sheetOf(layout, block(1));

  it('prints title, cabine block, plate, plate photos, checklist, checklist photos, each test, other photos, OBSERVAÇÕES and CONCLUSÃO', () => {
    expect(printed.title).toBe('CHAVE SECCIONADORA DE ENTRADA SEC-01');
    expect(printed.parts.map(partName)).toEqual([
      'CARACTERÍSTICAS DA SE',
      'AMBIENTE DE ENSAIO',
      'DADOS DO EQUIPAMENTO',
      'photos 4',
      'VERIFICAÇÕES GERAIS',
      'photos 3',
      'ENSAIO DE ISOLAÇÃO',
      'paragraph',
      'SECCIONADORA CONTATO ABERTO',
      'ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO',
      'paragraph',
      'LINHA',
      'photos 2 5',
      'OBSERVAÇÕES',
      'CONCLUSÃO',
    ]);
  });

  it('numbers photos as `numberPhotos` does, in capture order, with "Imagem N: ⟨legenda⟩." or "Imagem N." beneath', () => {
    const numbers = numberPhotos(snapshot.files);
    const photos = printed.parts.flatMap((p) => (p.kind === 'photos' ? p.photos : []));
    expect(photos.map((p) => [p.fileId, p.number])).toEqual([
      [id(3002), numbers.get(id(3002))],
      [id(3001), numbers.get(id(3001))],
      [id(3004), numbers.get(id(3004))],
      [id(3003), numbers.get(id(3003))],
    ]);
    expect(photos.map((p) => p.caption)).toEqual(['Imagem 4.', 'Imagem 3: Detalhe dos contatos.', 'Imagem 2.', 'Imagem 5: Vista geral.']);
    // Every photo a sheet prints, in print order: this sheet's, then the disjuntor's.
    expect(layoutPhotoIds({ sections: [layout] })).toEqual([id(3002), id(3001), id(3004), id(3003), id(3005)]);
  });

  it('prints DADOS DO EQUIPAMENTO three pairs a row, labels in caps, values as stored with their units, "-" when empty', () => {
    expect(texts(tableNamed(printed, 'DADOS DO EQUIPAMENTO'))).toEqual([
      ['DADOS DO EQUIPAMENTO'],
      ['IDENTIFICAÇÃO', 'COLUNA 1 - ENTRADA', 'FABRICAÇÃO', 'Celtta', 'Nº SÉRIE', '7.620B'],
      ['TAG', 'SEC-01', 'TIPO', '-', 'MEIO DE EXTINÇÃO', '-'],
      ['TENSÃO DE PLACA', '15 kV', 'CORRENTE NOMINAL', '630 A', 'ACIONAMENTO', '-'],
      ['DATA DE FABRICAÇÃO', '07/2012', '', '', '', ''],
    ]);
  });

  it('prints VERIFICAÇÕES GERAIS in the seed\'s column order: "⟨n⟩. ⟨ITEM⟩", an X in the chosen box, the observation', () => {
    const rows = texts(tableNamed(printed, 'VERIFICAÇÕES GERAIS'));
    expect(rows[1]).toEqual(['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
    expect(rows[2]).toEqual(['1. ABERTURA E FECHAMENTO MANUAL', 'X', '', '', '']);
    expect(rows[3]).toEqual(['2. ABERTURA E FECHAMENTO ELÉTRICO', '', '', '', '']);
    expect(rows[9]).toEqual(['8. CONTATOS', '', 'X', '', 'oxidação nos contatos']);
    expect(rows[10]).toEqual(['9. MOTOR', '', '', 'X', '']);
    expect(rows).toHaveLength(2 + 14);
  });

  it('prints each test\'s copied instrument header, its criterion line and its tables (contato aberto and fechado side by side)', () => {
    expect(texts(tableNamed(printed, 'ENSAIO DE ISOLAÇÃO'))).toEqual([
      ['ENSAIO DE ISOLAÇÃO'],
      ['INSTRUM./FABRIC.', 'TIPO', 'Nº SÉRIE', 'RBC', 'TENSÃO ENSAIO', 'ACEITÁVEL'],
      ['Instrument', 'DMG10Ki', 'IN919021', '37428/26', '10 kV', '>400 MΩ'],
    ]);
    expect(texts(tableNamed(printed, 'ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO'))[1]).toEqual(['INSTRUM./FABRIC.', 'TIPO', 'Nº SÉRIE', 'RBC', 'CORRENTE', 'ACEITÁVEL']);
    expect(printed.parts.filter((p) => p.kind === 'paragraph').map((p) => (p as { text: string }).text)).toEqual([
      'CRITÉRIO: >400 MΩ · aceitável na ficha',
      'CRITÉRIO: <250 µΩ · aceitável na ficha',
    ]);
    expect(texts(tableNamed(printed, 'SECCIONADORA CONTATO ABERTO'))).toEqual([
      ['SECCIONADORA CONTATO ABERTO', 'SECCIONADORA CONTATO FECHADO'],
      ['LINHA', 'TERRA', 'GUARD', 'VALORES (GΩ)', 'LINHA', 'TERRA', 'GUARD', 'VALORES (GΩ)'],
      ['T1', 'T2', 'MASSA', '173 GΩ', 'FASE A', 'MASSA', '', '173 GΩ'],
      ['T3', 'T4', 'MASSA', '720 GΩ', 'FASE B', 'MASSA', '', '720 GΩ'],
      ['T5', 'T6', 'MASSA', '860 GΩ', 'FASE C', 'MASSA', '', '860 GΩ'],
    ]);
    expect(texts(tableNamed(printed, 'LINHA'))).toEqual([
      ['LINHA', 'TERRA', 'GUARD', 'VALORES (µΩ)'],
      ['T1-T2', 'FASE A', 'MASSA', '132 µΩ'],
      ['T3-T4', 'FASE B', 'MASSA', '157 µΩ'],
      ['T5-T6', 'FASE C', 'MASSA', '183 µΩ'],
    ]);
  });

  it('prints OBSERVAÇÕES as typed and CONCLUSÃO with an X on the chosen pair', () => {
    expect(texts(tableNamed(printed, 'OBSERVAÇÕES'))).toEqual([['OBSERVAÇÕES'], ['Contatos oxidados.']]);
    expect(texts(tableNamed(printed, 'CONCLUSÃO'))).toEqual([
      ['CONCLUSÃO'],
      ['APROVADO', 'X', 'REPROVADO', '', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X'],
    ]);
  });

  it('prints the cabine block on its first sheet only, and no photo that belongs to another sheet or was removed', () => {
    const second = sheetOf(layout, block(2));
    expect(second.parts.map(partName)).not.toContain('CARACTERÍSTICAS DA SE');
    expect(layoutPhotoIds({ sections: [layout] })).not.toContain(id(3006));
    expect(second.parts.some((p) => p.kind === 'photos')).toBe(true);
  });
});

describe('7.1 section9Layout: the I/O matrix', () => {
  it('Subsection heading: "N.k ⟨title⟩" with N the section\'s position and k counting across the section', () => {
    const locations = [cabine(1, '1° Subsolo', 'a0', { agrupar_por_tipo: true }), cabine(2, 'Cubículo Enel', 'a1')];
    const snapshot = snapshotOf(locations, [sheet(1, 1, 'disjuntor_mt', 'a0'), sheet(2, 1, 'chave_seccionadora', 'a1'), sheet(3, 2, 'tp', 'a0')]);
    const section = layoutOf(snapshot, 7);
    expect(section).toMatchObject({ number: 7, title: TITLE, kind: 'sheets', warnings: [] });
    expect(section.subsections.map((s) => [s.heading, s.sheets.map((x) => x.blockId)])).toEqual([
      ['7.1 Seccionadoras dos Cubículos de MT do 1° Subsolo', [block(2)]],
      ['7.2 Disjuntores dos Cubículos de MT do 1° Subsolo', [block(1)]],
      ['7.3 Cubículo Enel', [block(3)]],
    ]);
    // `groupForPrint` read the relatório's own scheme: ordem_de_campo keeps one subsection per cabine.
    const fieldOrder = { ...snapshot, relatorio: { ...snapshot.relatorio, export: { scheme: 'ordem_de_campo' as const } } };
    expect(layoutOf(fieldOrder).subsections.map((s) => s.heading)).toEqual(['9.1 1° Subsolo', '9.2 Cubículo Enel']);
  });

  it('Unpaired cable: the section carries groupForPrint\'s integrity warning', () => {
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0', { agrupar_por_tipo: true })], [sheet(1, 1, 'transformador_forca', 'a0'), edit(sheet(2, 1, 'cabos_saida', 'a1'), withRole('alimentacao'))]);
    const section = layoutOf(snapshot);
    expect(section.warnings).toEqual([{ kind: 'integrity', code: 'unpaired_cable', blockId: block(2), cabineId: id(1) }]);
    expect(section.subsections[0]!.sheets.map((s) => s.title)).toEqual(['TRANSFORMADOR DE FORÇA T1', 'CABOS DE ALIMENTAÇÃO T2']);
  });

  it('First sheet of a cabine: the first sheet groupForPrint emits for it prints CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO', () => {
    const se = { type: 'BLINDADA', primary_kv: measured('13.8', 'kV'), secondary_kv: null, installed_kva: measured('1500', 'kVA') };
    const env = { altitude_m: null, temperature_c: measured('25', '°C'), humidity_pct: measured('65', '%') };
    const locations = [cabine(1, 'Cabine A', 'a0', { agrupar_por_tipo: true, se, env }), cabine(2, 'Cabine B', 'a1')];
    // Tree order puts the transformer first, but the seccionadoras group prints first.
    const snapshot = snapshotOf(locations, [sheet(1, 1, 'transformador_forca', 'a0'), sheet(2, 1, 'chave_seccionadora', 'a1'), sheet(3, 1, 'disjuntor_mt', 'a2'), sheet(4, 2, 'tp', 'a0')]);
    const section = layoutOf(snapshot);
    const withCabine = sheetsOf(section)
      .filter((s) => s.parts.some((p) => partName(p) === 'CARACTERÍSTICAS DA SE'))
      .map((s) => s.blockId);
    expect(withCabine).toEqual([block(2), block(4)]);
    const first = sheetOf(section, block(2));
    expect(texts(tableNamed(first, 'CARACTERÍSTICAS DA SE'))).toEqual([
      ['CARACTERÍSTICAS DA SE'],
      ['TIPO DE SE', 'TENSÃO PRIMÁRIA', 'TENSÃO SECUNDÁRIA', 'POTÊNCIA INSTALADA'],
      ['BLINDADA', '13,8 kV', '-', '1.500 kVA'],
    ]);
    expect(texts(tableNamed(first, 'AMBIENTE DE ENSAIO'))).toEqual([['AMBIENTE DE ENSAIO'], ['ALTITUDE', 'TEMPERATURA', 'UMIDADE RELATIVA DO AR'], ['-', '25 °C', '65 %']]);
    expect(texts(tableNamed(sheetOf(section, block(4)), 'CARACTERÍSTICAS DA SE'))[2]).toEqual(['-', '-', '-', '-']);
  });

  it('ALTITUDE prints the setup altitude (Story 12.3 owns it) when the cabine holds none; a cabine value still wins', () => {
    const env = { altitude_m: null, temperature_c: measured('25', '°C'), humidity_pct: measured('65', '%') };
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0', { env }), cabine(2, 'Cabine B', 'a1', { env: { ...env, altitude_m: measured('900', 'm') } })], [sheet(1, 1, 'tp', 'a0'), sheet(2, 2, 'tp', 'a0')]);
    const withSetup = { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, site_altitude_m: 760 } } };
    const section = layoutOf(withSetup);
    expect(texts(tableNamed(sheetOf(section, block(1)), 'AMBIENTE DE ENSAIO'))[2]).toEqual(['760 m', '25 °C', '65 %']);
    expect(texts(tableNamed(sheetOf(section, block(2)), 'AMBIENTE DE ENSAIO'))[2]).toEqual(['900 m', '25 °C', '65 %']);
  });

  it('Não ensaiada: title, attribution, the cabine block on a first sheet, the nameplate and the reason band; nothing else', () => {
    const marked = (n: number, type: EquipmentBlockType, reason: string, text: string | null) =>
      edit(sheet(n, 1, type, `a${n}`), (b) => ({
        ...withChecklist({ limpeza: 'C' })(withTest('isolacao', { '0/0': measured('1', 'GΩ') }, INSTRUMENT)(withNameplate({ fabricacao: 'WEG' })(b))),
        not_tested: { reason, text, at: '2026-09-06T12:00:00.000Z', by: USER.id },
        last_modified_by: USER.id,
        last_modified_at: '2026-09-06T12:00:00.000Z',
      }));
    const files = [photo(1, { block_id: block(1), captured_at: '2026-09-06T10:00:00.000Z' })];
    const snapshot = snapshotOf(
      [cabine(1, 'Cabine A', 'a0')],
      [marked(1, 'chave_seccionadora', 'solicitacao_cliente', null), marked(2, 'disjuntor_mt', 'outro', 'Equipamento energizado'), marked(3, 'tp', 'outro', null), edit(marked(4, 'cabos_saida', 'solicitacao_cliente', 'Texto digitado'), (b) => b)],
      { files, actors: [USER] },
    );
    const section = layoutOf(snapshot);
    const first = sheetOf(section, block(1));
    expect(first.attribution).toBe('Preenchido por Bruno Silva · 06/09/2026 09:00');
    expect(first.parts.map(partName)).toEqual(['CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', 'DADOS DO EQUIPAMENTO', 'NÃO ENSAIADO — Solicitação do cliente: Os ensaios não foram realizados conforme solicitação do cliente.']);
    expect(sheetOf(section, block(2)).parts.map(partName)).toEqual(['DADOS DO EQUIPAMENTO', 'NÃO ENSAIADO — Equipamento energizado']);
    expect(sheetOf(section, block(3)).parts.map(partName)).toEqual(['DADOS DO EQUIPAMENTO', 'NÃO ENSAIADO — Outro']);
    // Cabos carry no nameplate; the seed's justification wins over a typed text (as section 8 prints it).
    expect(sheetOf(section, block(4)).parts.map(partName)).toEqual(['NÃO ENSAIADO — Solicitação do cliente: Os ensaios não foram realizados conforme solicitação do cliente.']);
    // With the nameplate switched off, the band alone.
    const plateOff = snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(9, 1, 'tp', 'a0'), edit(marked(2, 'disjuntor_mt', 'outro', 'Equipamento energizado'), withSubBlocks({ nameplate: false }))]);
    expect(sheetOf(layoutOf(plateOff), block(2)).parts.map(partName)).toEqual(['NÃO ENSAIADO — Equipamento energizado']);
    expect(layoutPhotoIds({ sections: [section] })).toEqual([]);
  });

  it('TAG prefill (E12-A2): the TAG field prints the block\'s TAG while it has no cell; a stored TAG wins; an empty stored cell prints "-"; nothing is written', () => {
    const tagOf = (built: Built) => {
      const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [built]);
      return texts(tableNamed(sheetOf(layoutOf(snapshot), built.block.id), 'DADOS DO EQUIPAMENTO'))[2]!.slice(0, 2);
    };
    const bare = sheet(1, 1, 'chave_seccionadora', 'a0', 'SEC-C05');
    expect(tagOf(bare)).toEqual(['TAG', 'SEC-C05']);
    expect(bare.block.sheet.nameplate.tag).toBeUndefined();
    expect(tagOf(edit(bare, withNameplate({ tag: 'SEC-99' })))).toEqual(['TAG', 'SEC-99']);
    expect(tagOf(edit(bare, withNameplate({ tag: '' })))).toEqual(['TAG', '-']);
    expect(tagOf(sheet(2, 1, 'chave_seccionadora', 'a0', '  '))).toEqual(['TAG', '-']);
  });

  describe('Conclusion text', () => {
    const definition = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
    const basis = composeConclusion(FULL_CHAVE.block, definition, 'SEC-01').basis;
    const withText = (status: string | null, textBasis: string, over: (b: BlockRow) => BlockRow = (b) => b) =>
      edit(FULL_CHAVE, (b) => {
        b.sheet.conclusion.text = cell('A seccionadora SEC-01 apresentou oxidação nos contatos.');
        if (status !== null) b.sheet.conclusion.text_status = cell(status);
        b.sheet.conclusion.text_basis = cell(textBasis);
        return over(b);
      });
    const conclusionOf = (built: Built) => {
      const printed = sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [built])), built.block.id);
      const at = printed.parts.findIndex((p) => partName(p) === 'CONCLUSÃO');
      const next = printed.parts[at + 1];
      return { rows: texts(tableNamed(printed, 'CONCLUSÃO')), criteria: next?.kind === 'paragraph' ? next.text : null };
    };
    const criteriaLine = composeConclusion(FULL_CHAVE.block, definition, 'SEC-01').criteriaLine;

    it('text_status = edited: the stored text prints, the current criteria line beneath (whatever its basis)', () => {
      const { rows, criteria } = conclusionOf(withText('edited', 'stale-basis'));
      expect(rows[2]).toEqual(['A seccionadora SEC-01 apresentou oxidação nos contatos.']);
      expect(criteria).toBe(criteriaLine);
      expect(criteriaLine).toContain('item 8 NC');
    });

    it('confirmed with text_basis equal to the current basis: printed the same as edited', () => {
      const { rows, criteria } = conclusionOf(withText('confirmed', basis));
      expect(rows[2]).toEqual(['A seccionadora SEC-01 apresentou oxidação nos contatos.']);
      expect(criteria).toBe(criteriaLine);
    });

    it('confirmed but stale, unconfirmed, or the pair incomplete: the pair row prints and the text does not', () => {
      for (const built of [
        withText('confirmed', 'stale-basis'),
        withText(null, basis),
        withText('edited', basis, (b) => {
          delete b.sheet.conclusion.restriction;
          return b;
        }),
      ]) {
        const { rows, criteria } = conclusionOf(built);
        expect(rows).toHaveLength(2);
        expect(criteria).toBeNull();
      }
    });
  });

  it('Mixed units: a VALORES header with more than one measured unit reads "VALORES"; each cell keeps its own unit', () => {
    const cabos = (n: number, cells: Record<string, unknown>) => edit(sheet(n, 1, 'cabos_saida', `a${n}`), withTest('isolacao', cells, INSTRUMENT));
    const snapshot = snapshotOf(
      [cabine(1, 'Cabine A', 'a0')],
      [
        cabos(1, { '0/1': measured('2.8', 'GΩ'), '1/1': measured('1.2', 'TΩ'), '2/1': measured('900', 'MΩ'), '3/1': notMeasured('GΩ') }),
        cabos(2, { '0/1': measured('2.8', 'GΩ'), '1/1': measured('3', 'GΩ') }),
        cabos(3, {}),
      ],
    );
    const section = layoutOf(snapshot);
    const grid = (n: number) => texts(tableNamed(sheetOf(section, block(n)), 'PONTO DE ENSAIO/CONEXÃO'));
    expect(grid(1)[0]).toEqual(['PONTO DE ENSAIO/CONEXÃO', 'VALORES', 'QUALIDADE ISOLAÇÃO']);
    expect(grid(1).slice(2).map((row) => row[4])).toEqual(['2,8 GΩ', '1,2 TΩ', '900 MΩ', '-']);
    expect(grid(2)[0]).toEqual(['PONTO DE ENSAIO/CONEXÃO', 'VALORES (GΩ)', 'QUALIDADE ISOLAÇÃO']);
    // Nothing measured: the seed's unit of the column.
    expect(grid(3)[0]).toEqual(['PONTO DE ENSAIO/CONEXÃO', 'VALORES (GΩ)', 'QUALIDADE ISOLAÇÃO']);
  });

  it('Pending suggestion: a pending row targeting a cell changes nothing that prints', () => {
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [FULL_CHAVE]);
    const suggestion: SuggestionRow = {
      id: id(700),
      relatorio_id: RELATORIO,
      target_path: `sheet/${block(1)}/nameplate/tipo`,
      value: 'MOTORIZADA',
      trust: 'suggested',
      mode: 'fill',
      hint: null,
      source: { photo_id: id(701), bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: id(702) },
      status: 'pending',
      prompt_version: 'v1',
    };
    expect(section9Layout({ ...snapshot, suggestions: [suggestion] }, 9, TITLE)).toEqual(section9Layout(snapshot, 9, TITLE));
  });

  it('No equipment: null, and the layout keeps section 9 empty with its note', () => {
    expect(section9Layout(snapshotOf([cabine(1, 'Cabine A', 'a0')], []), 9, TITLE)).toBeNull();
    const layout = layoutSpec(snapshotOf([cabine(1, 'Cabine A', 'a0')], []), { revisionNumber: 1, issuedAt: ISSUED_AT });
    expect(layout.sections.find((s) => s.number === 9)).toEqual({ number: 9, title: TITLE, kind: 'empty', note: EMPTY_SECTION_NOTE });
    expect(layoutPhotoIds(layout)).toEqual([]);
  });
});

describe('7.1 section9Layout: sub-blocks, grids and words', () => {
  it('omits a disabled resistencia_contato and observations, while the insulation grid still prints its five value columns', () => {
    const chave = edit(FULL_CHAVE, withSubBlocks({ resistencia_contato: false, observations: false }));
    const cabos = edit(sheet(2, 1, 'cabos_saida', 'a1'), (b) => withSubBlocks({ observations: false })(withTest('isolacao', { '0/1': measured('2.8', 'GΩ'), '1/1': notMeasured('GΩ') }, INSTRUMENT)(b)));
    const section = layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [chave, cabos]));
    const names = sheetOf(section, block(1)).parts.map(partName);
    expect(names).not.toContain('ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO');
    expect(names).not.toContain('OBSERVAÇÕES');
    expect(names).toContain('ENSAIO DE ISOLAÇÃO');
    const grid = texts(tableNamed(sheetOf(section, block(2)), 'PONTO DE ENSAIO/CONEXÃO'));
    expect(grid[1]).toEqual(['LINHA', 'TERRA', 'GUARD', '30 SEGUNDOS', '1 MINUTO', 'ESTAB./10MIN', 'ABSORÇÃO', 'POLARIZAÇÃO']);
    expect(grid.slice(2)).toEqual([
      ['FASE A', 'MASSA/BLIND.', '', '-', '2,8 GΩ', '-', '-', '-'],
      ['FASE B', 'MASSA/BLIND.', '', '-', '-', '-', '-', '-'],
      ['FASE C', 'MASSA/BLIND.', '', '-', '-', '-', '-', '-'],
      ['FASE RESERVA', 'MASSA/BLIND.', '', '-', '-', '-', '-', '-'],
    ]);
    expect(sheetOf(section, block(2)).parts.map(partName)).not.toContain('OBSERVAÇÕES');
  });

  it('prints ABSORÇÃO and POLARIZAÇÃO typed values only with "IA e IP lidos do visor" on and the cells holding them', () => {
    const cells = { '0/1': measured('2.8', 'GΩ'), '0/3': measured('1.3', null), '0/4': measured('2.1', null), '0/0': measured('9', 'GΩ') };
    const off = edit(sheet(1, 1, 'tp', 'a0'), withTest('isolacao', cells, INSTRUMENT));
    const on = edit(off, withSubBlocks({ ia_ip_display: true }));
    const rowOf = (built: Built) => texts(tableNamed(sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [built])), block(1)), 'PONTO DE ENSAIO/CONEXÃO'))[2];
    expect(rowOf(off)).toEqual(['FASE R', 'MASSA', '', '-', '2,8 GΩ', '-', '-', '-']);
    expect(rowOf(on)).toEqual(['FASE R', 'MASSA', '', '-', '2,8 GΩ', '-', '1,3', '2,1']);
  });

  it('prints VAL CALCULADO and SATISFATÓRIO from the kernel, "-" where it has none, and keeps "TP\'s" as FO.SERV-03 writes it', () => {
    const tp = edit(sheet(1, 1, 'tp', 'a0'), withTest('relacao_transformacao', { '0/0': measured('13800', 'V'), '0/1': measured('115', 'V'), '0/3': measured('120.1', null), '1/3': measured('125', null) }));
    const rows = texts(tableNamed(sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [tp])), block(1)), "TP's"));
    expect(rows).toEqual([
      ["TP's", 'V PRIMÁRIO', 'V SECUNDÁRIO', 'VAL CALCULADO', 'H1-H2 / X1-X2', 'CONDIÇÕES'],
      ['FASE R', '13.800 V', '115 V', '120,00', '120,1', 'SATISFATÓRIO'],
      ['FASE S', '-', '-', '-', '125', '-'],
      ['FASE T', '-', '-', '-', '-', '-'],
    ]);
  });

  it('titles a sheet by type, role and TAG, the role not repeated and the TAG as stored', () => {
    const titleOf = (built: Built) => sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [built])), built.block.id).title;
    expect(titleOf(edit(sheet(1, 1, 'chave_seccionadora', 'a0', 'SEC-C01'), withRole('entrada')))).toBe('CHAVE SECCIONADORA DE ENTRADA SEC-C01');
    expect(titleOf(edit(sheet(1, 1, 'cabos_entrada', 'a0', 'CE-01'), withRole('entrada')))).toBe('CABOS DE ENTRADA CE-01');
    expect(titleOf(edit(sheet(1, 1, 'cabos_saida', 'a0', 'CS-01'), withRole('saida')))).toBe('CABOS DE SAÍDA CS-01');
    expect(titleOf(edit(sheet(1, 1, 'cabos_saida', 'a0', 'CB-S01'), withRole('alimentacao')))).toBe('CABOS DE ALIMENTAÇÃO CB-S01');
    expect(titleOf(edit(sheet(1, 1, 'para_raio', 'a0', 'PR-01'), withRole('saida')))).toBe('PARA-RAIO DE SAÍDA PR-01');
    expect(titleOf(edit(sheet(1, 1, 'transformador_forca', 'a0', 'TR-1'), withRole('alimentacao')))).toBe('TRANSFORMADOR DE FORÇA DE ALIMENTAÇÃO TR-1');
    expect(titleOf(sheet(1, 1, 'disjuntor_mt', 'a0', ''))).toBe('DISJUNTOR MT');
    expect(titleOf(sheet(1, 1, 'tp', 'a0', 'tp-x'))).toBe('TP tp-x');
  });

  it('attributes a sheet to who concluded it, else to who filled it last, with the full date; null for an unknown actor or no timestamp', () => {
    const attributionOf = (patch: (b: BlockRow) => BlockRow) => {
      const built = edit(sheet(1, 1, 'tp', 'a0'), patch);
      return sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [built], { actors: [USER] })), block(1)).attribution;
    };
    const filled = { last_modified_by: USER.id, last_modified_at: '2026-09-06T12:41:00.000Z' };
    expect(attributionOf((b) => ({ ...b, ...filled, concluded_by: { actor_id: USER.id, at: '2026-09-06T13:02:00.000Z' } }))).toBe('Concluída por Bruno Silva · 06/09/2026 10:02');
    expect(attributionOf((b) => ({ ...b, ...filled, concluded_by: { actor_id: id(999), at: '2026-09-06T13:02:00.000Z' } }))).toBe('Preenchido por Bruno Silva · 06/09/2026 09:41');
    expect(attributionOf((b) => ({ ...b, ...filled }))).toBe('Preenchido por Bruno Silva · 06/09/2026 09:41');
    expect(attributionOf((b) => ({ ...b, last_modified_by: id(999), last_modified_at: '2026-09-06T12:41:00.000Z' }))).toBeNull();
    expect(attributionOf((b) => ({ ...b, last_modified_by: USER.id, last_modified_at: null }))).toBeNull();
    expect(attributionOf((b) => b)).toBeNull();
  });

  it('closes a photo line with a period only when the caption has no closing punctuation of its own', () => {
    const captions = ['Está oxidado?', 'Contato aquecido!', 'Ver detalhe…', 'Ver "nota."', '(ver foto 2.)', 'Sem ponto', 'Com ponto.'];
    const files = captions.map((caption, i) => photo(i + 1, { block_id: block(1), caption, captured_at: `2026-09-06T10:0${i}:00.000Z` }));
    const printed = sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(1, 1, 'tp', 'a0')], { files })), block(1));
    expect(printed.parts.flatMap((p) => (p.kind === 'photos' ? p.photos.map((x) => x.caption) : []))).toEqual([
      'Imagem 1: Está oxidado?',
      'Imagem 2: Contato aquecido!',
      'Imagem 3: Ver detalhe…',
      'Imagem 4: Ver "nota."',
      'Imagem 5: (ver foto 2.)',
      'Imagem 6: Sem ponto.',
      'Imagem 7: Com ponto.',
    ]);
  });

  it('prints a checklist row\'s photo with the photos after the tests when the sheet prints no checklist', () => {
    const files = [photo(1, { block_id: block(1), item_key: 'limpeza', caption: 'Limpeza do TP', captured_at: '2026-09-06T10:00:00.000Z' })];
    // The checklist is a locked sub-block (`LOCKED_SUB_BLOCKS`): switched off in the config it
    // still prints, and the row's photo right after it.
    const locked = sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [edit(sheet(1, 1, 'tp', 'a0'), withSubBlocks({ checklist: false }))], { files })), block(1));
    const names = locked.parts.map(partName);
    expect(names.indexOf('photos 1')).toBe(names.indexOf('VERIFICAÇÕES GERAIS') + 1);
    // Only a config the kernel reads as enabling no sub-block leaves the checklist out (and
    // the tests with it): the photo then prints with the photos after the tests.
    const bare = edit(sheet(1, 1, 'tp', 'a1'), (b) => ({ ...b, config: { block_type: 'section_1', sub_blocks: {}, na_defaults: [] } }));
    const section = layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(2, 1, 'disjuntor_mt', 'a0'), bare], { files }));
    const printed = sheetOf(section, block(1));
    expect(printed.parts.map(partName)).toEqual(['photos 1']);
    expect(printed.parts[0]).toEqual({ kind: 'photos', photos: [{ fileId: id(3001), number: 1, caption: 'Imagem 1: Limpeza do TP.' }] });
    expect(layoutPhotoIds({ sections: [section] })).toEqual([id(3001)]);
  });

  it('marks NA the checklist items the block\'s config pre-marks, and leaves an unanswered item blank', () => {
    const chave = edit(sheet(1, 1, 'chave_seccionadora', 'a0'), (b) => ({ ...b, config: { ...(b.config as object), na_defaults: ['motor'] } }));
    const rows = texts(tableNamed(sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [chave])), block(1)), 'VERIFICAÇÕES GERAIS'));
    expect(rows[10]).toEqual(['9. MOTOR', '', '', 'X', '']);
    expect(rows[2]).toEqual(['1. ABERTURA E FECHAMENTO MANUAL', '', '', '', '']);
  });
});

describe('7.1 NFR-17: section 9 of the Porto Seguro fixture and its Sumário row come from the same data', () => {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  const section = layout.sections.find((s): s is LayoutSectionSheets => s.kind === 'sheets')!;

  it('prints every sheet the Sumário counts, once', () => {
    const printed = sheetsOf(section).map((s) => s.blockId);
    expect(printed).toHaveLength(progress(snapshot).sheets_total);
    expect(new Set(printed).size).toBe(printed.length);
  });

  it('prints one reason band per sheet the section 9 pre-issue row counts as não ensaiada', () => {
    const bands = sheetsOf(section).filter((s) => s.parts.some((p) => partName(p).startsWith('NÃO ENSAIADO — '))).map((s) => s.blockId);
    const counted = progress(snapshot).not_tested;
    expect(bands).toHaveLength(counted);
    expect(bands.sort()).toEqual([...portoSeguro.notTestedBlockIds].sort());
    expect(preIssueRowsFor(preIssue(snapshot), 'section_9').find((row) => row.kind === 'not_tested')?.text).toBe(naoEnsaiadasText(counted));
  });

  it('numbers the subsections 9.1 to 9.11 with the FO.SERV-03 titles', () => {
    expect(section.subsections.map((s) => s.heading)).toEqual([
      '9.1 Cubículo Enel',
      '9.2 Seccionadoras dos Cubículos de MT do 1° Subsolo',
      '9.3 Disjuntores dos Cubículos de MT do 1° Subsolo',
      "9.4 TP's e TC's dos Cubículos de MT do 1° Subsolo",
      '9.5 Transformadores e Cabos de Alimentação do 1° Subsolo',
      '9.6 Oxigênio',
      '9.7 Cobertura A',
      '9.8 Cobertura B',
      '9.9 Seccionadoras dos Cubículos de MT dos Geradores',
      '9.10 Disjuntores dos Cubículos de MT dos Geradores',
      "9.11 TP's e TC's dos Cubículos de MT dos Geradores",
    ]);
    expect(section.subsections.map((s) => s.sheets.length)).toEqual([9, 13, 14, 12, 10, 5, 6, 6, 7, 4, 8]);
  });
});
