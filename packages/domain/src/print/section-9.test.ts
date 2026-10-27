import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { NOT_APPLICABLE_NUMBER } from '../parse/pt-br-number.ts';
import { photoStampFull } from '../photos/gallery.ts';
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
import { EMPTY_SECTION_NOTE, layoutSpec, tocLines } from './layout.ts';
import { section9Layout, type LayoutSectionSheets, type PrintSheet, type PrintTable, type SheetPart } from './section-9.ts';

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

function photo(n: number, over: { block_id?: string | null; item_key?: string | null; reading_kind?: 'plate' | 'display' | null; caption?: string | null; captured_at: string; removed_at?: string | null; coords?: { lat: number; lng: number; accuracy_m: number; source: 'geolocation' } | null }): RelatorioSnapshot['files'][number] {
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
    coords: over.coords ?? null,
    local_seq: n,
    block_id: over.block_id ?? null,
    item_key: over.item_key ?? null,
    caption: over.caption ?? null,
    reading_kind: over.reading_kind ?? null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
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
    photo(7, { captured_at: '2026-09-06T09:00:00.000Z' }), // a "Geral" photo: number 1 (section 7)
    photo(4, { block_id: block(1), caption: '  ', captured_at: '2026-09-06T10:00:00.000Z' }), // 4, after the tests
    photo(1, { block_id: block(1), item_key: 'contatos', caption: 'Detalhe dos contatos', captured_at: '2026-09-06T10:01:00.000Z' }), // 3, after the checklist
    photo(2, { block_id: block(1), reading_kind: 'plate', captured_at: '2026-09-06T10:02:00.000Z' }), // 2, after the nameplate
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
      'photos 2',
      'VERIFICAÇÕES GERAIS',
      'photos 3',
      'ENSAIO DE ISOLAÇÃO',
      'paragraph',
      'SECCIONADORA CONTATO ABERTO',
      'ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO',
      'paragraph',
      'LINHA',
      'photos 4 5',
      'OBSERVAÇÕES',
      'CONCLUSÃO',
    ]);
  });

  it('numbers photos as `numberPhotos` does, in document order (plate, items, other), with "Imagem N: ⟨legenda⟩." or "Imagem N." beneath', () => {
    const numbers = numberPhotos(snapshot);
    const photos = printed.parts.flatMap((p) => (p.kind === 'photos' ? p.photos : []));
    expect(photos.map((p) => [p.fileId, p.number])).toEqual([
      [id(3002), numbers.get(id(3002))],
      [id(3001), numbers.get(id(3001))],
      [id(3004), numbers.get(id(3004))],
      [id(3003), numbers.get(id(3003))],
    ]);
    expect(photos.map((p) => p.number)).toEqual([2, 3, 4, 5]);
    expect(photos.map((p) => p.caption)).toEqual(['Imagem 2.', 'Imagem 3: Detalhe dos contatos.', 'Imagem 4.', 'Imagem 5: Vista geral.']);
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

  it('16.4: an "N.A" nameplate or cabine number prints "N.A" with no unit (never "-", never " kVA")', () => {
    const se = { type: 'BLINDADA', primary_kv: NOT_APPLICABLE_NUMBER, secondary_kv: measured('380', 'V'), installed_kva: null };
    const env = { altitude_m: null, temperature_c: NOT_APPLICABLE_NUMBER, humidity_pct: measured('65', '%') };
    const trafo = edit(sheet(1, 1, 'transformador_forca', 'a0'), withNameplate({ potencia_nominal: NOT_APPLICABLE_NUMBER }));
    const section = layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0', { se, env })], [trafo]));
    const printed = sheetOf(section, block(1));
    expect(texts(tableNamed(printed, 'CARACTERÍSTICAS DA SE'))[2]).toEqual(['BLINDADA', 'N.A', '380 V', '-']);
    expect(texts(tableNamed(printed, 'AMBIENTE DE ENSAIO'))[2]).toEqual(['-', 'N.A', '65 %']);
    const plate = texts(tableNamed(printed, 'DADOS DO EQUIPAMENTO')).flat();
    expect(plate[plate.indexOf('POTÊNCIA NOMINAL') + 1]).toBe('N.A');
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

    // p020 P-3: a stored text equal to the composed one is never stale, so it prints.
    const composedText = composeConclusion(FULL_CHAVE.block, definition, 'SEC-01').text;
    const withStored = (text: string) =>
      edit(FULL_CHAVE, (b) => {
        b.sheet.conclusion.text = cell(text);
        b.sheet.conclusion.text_status = cell('confirmed');
        b.sheet.conclusion.text_basis = cell('stale-basis');
        return b;
      });

    it('p020 P-3: confirmed, basis moved, text equal to the composed one: prints', () => {
      const { rows, criteria } = conclusionOf(withStored(composedText));
      expect(rows[2]).toEqual([composedText.trim()]);
      expect(criteria).toBe(criteriaLine);
    });

    it('p020 P-3: confirmed, basis moved, text differs from the composed one: not printed (as before)', () => {
      const { rows, criteria } = conclusionOf(withStored(`${composedText} Texto anterior.`));
      expect(rows).toHaveLength(2);
      expect(criteria).toBeNull();
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

  it('F42: prints the transformer ratio\'s TAP Nº from the plate\'s TAP ATUAL and INSATISFATÓRIO with a capture out; "-" with no TAP', () => {
    const cells = { '0/0': measured('13.8', 'kV'), '0/1': measured('380', 'V'), '0/3': measured('36.3', null), '0/4': measured('72.6', null), '0/5': measured('36.3', null) };
    const tr = edit(sheet(1, 1, 'transformador_forca', 'a0', 'TR-1'), (b) => withTest('relacao_transformacao', cells)(withNameplate({ tap_atual: '5' })(b)));
    const rowsOf = (built: Built) => texts(tableNamed(sheetOf(layoutOf(snapshotOf([cabine(1, 'Cabine A', 'a0')], [built])), block(1)), 'TAP Nº'));
    const rows = rowsOf(tr);
    expect(rows[0]).toEqual(['TAP Nº', 'V PRIMÁRIO', 'V SECUNDÁRIO', 'VAL CALCULADO', 'H1-H3 / X1-X0', 'H2-H1 / X2-X0', 'H3-H2 / X3-X0', 'CONDIÇÕES']);
    expect(rows[1]).toEqual(['5', '13,8 kV', '380 V', '36,32', '36,3', '72,6', '36,3', 'INSATISFATÓRIO']);
    const noTap = edit(sheet(1, 1, 'transformador_forca', 'a0', 'TR-1'), withTest('relacao_transformacao', cells));
    expect(rowsOf(noTap)[1]![0]).toBe('-');
    // A voltage typed as TAP ATUAL (the Porto Seguro plates' "13200") is no tap number: "-".
    const voltage = edit(sheet(1, 1, 'transformador_forca', 'a0', 'TR-1'), (b) => withTest('relacao_transformacao', cells)(withNameplate({ tap_atual: '13200' })(b)));
    expect(rowsOf(voltage)[1]![0]).toBe('-');
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

describe('14.2 section9Layout: a painel is an unnumbered band over its sheets', () => {
  const painel = (n: number, name: string, parent: number, orderKey: string): LocationRow => ({ id: id(n), relatorio_id: RELATORIO, parent_id: id(parent), kind: 'painel', name, order_key: orderKey, removed_at: null });
  const coluna = (n: number, name: string, parent: number, orderKey: string): LocationRow => ({ id: id(n), relatorio_id: RELATORIO, parent_id: id(parent), kind: 'coluna', name, order_key: orderKey, removed_at: null });
  const se = { type: 'ALVENARIA', primary_kv: measured('13.8', 'kV'), secondary_kv: null, installed_kva: measured('1500', 'kVA') };
  const env = { altitude_m: null, temperature_c: measured('25', '°C'), humidity_pct: measured('65', '%') };
  const fieldOrder = (snapshot: RelatorioSnapshot): RelatorioSnapshot => ({ ...snapshot, relatorio: { ...snapshot.relatorio, export: { scheme: 'ordem_de_campo' } } });
  const hasCabineBlock = (sheet: PrintSheet) => sheet.parts.some((p) => partName(p) === 'CARACTERÍSTICAS DA SE');

  /** A local with two transformers directly on it and one painel with three colunas, one seccionadora each; then a second local with no painel. */
  const locations = (agrupar: boolean) => [
    cabine(1, 'Cabine de transformação', 'a0', { agrupar_por_tipo: agrupar, se, env, funcao: 'transformacao' }),
    painel(10, 'Painel de média tensão', 1, 'a0'),
    coluna(11, 'Coluna 1', 10, 'a0'),
    coluna(12, 'Coluna 2', 10, 'a1'),
    coluna(13, 'Coluna 3', 10, 'a2'),
    cabine(2, 'Cubículo Enel', 'a1'),
  ];
  const sheets = [
    sheet(1, 1, 'transformador_forca', 'a0', 'TR-1'),
    sheet(2, 1, 'transformador_forca', 'a1', 'TR-2'),
    sheet(3, 11, 'chave_seccionadora', 'a0', 'SEC-C01'),
    sheet(4, 12, 'chave_seccionadora', 'a0', 'SEC-C02'),
    sheet(5, 13, 'chave_seccionadora', 'a0', 'SEC-C03'),
    sheet(6, 2, 'tp', 'a0', 'TP-ENEL'),
  ];

  it('flag off: the local heading with the direct sheets, the painel band (its name in upper case, no number) over its sheets, and the counter skipping the band', () => {
    const section = layoutOf(fieldOrder(snapshotOf(locations(false), sheets)));
    expect(section.subsections.map((s) => [s.heading, s.painel ?? false, s.sheets.map((x) => x.blockId)])).toEqual([
      ['9.1 Cabine de transformação', false, [block(1), block(2)]],
      ['PAINEL DE MÉDIA TENSÃO', true, [block(3), block(4), block(5)]],
      ['9.2 Cubículo Enel', false, [block(6)]],
    ]);
    // Only a painel subsection carries the mark.
    expect(Object.keys(section.subsections[0]!)).not.toContain('painel');
  });

  it('the cabine SE and environment print once, on the first sheet emitted for the cabine: the first direct sheet, never again under the painel', () => {
    const section = layoutOf(fieldOrder(snapshotOf(locations(false), sheets)));
    expect(sheetsOf(section).filter(hasCabineBlock).map((s) => s.blockId)).toEqual([block(1), block(6)]);
    // With nothing directly on the local, its heading stands alone and the first sheet of the painel carries the cabine block.
    const onlyInPainel = layoutOf(fieldOrder(snapshotOf(locations(false), sheets.filter((s) => s.block.location_id !== id(1)))));
    expect(onlyInPainel.subsections.map((s) => [s.heading, s.sheets.map((x) => x.blockId)])).toEqual([
      ['9.1 Cabine de transformação', []],
      ['PAINEL DE MÉDIA TENSÃO', [block(3), block(4), block(5)]],
      ['9.2 Cubículo Enel', [block(6)]],
    ]);
    expect(sheetsOf(onlyInPainel).filter(hasCabineBlock).map((s) => s.blockId)).toEqual([block(3), block(6)]);
  });

  it('flag on: the direct run by type, then the band alone followed by the painel own type groups, numbered across the section without the band', () => {
    const section = layoutOf(snapshotOf(locations(true), sheets));
    expect(section.subsections.map((s) => [s.heading, s.painel ?? false, s.sheets.map((x) => x.blockId)])).toEqual([
      ['9.1 Transformadores e Cabos de Alimentação da Cabine de transformação', false, [block(1), block(2)]],
      ['PAINEL DE MÉDIA TENSÃO', true, []],
      // Story 14.4 (2026-10-13): a type group under a painel names the painel, then the local.
      // Story 14.10 part 8 (2026-10-15): one set of type groups per coluna, each naming its coluna.
      ['9.2 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de média tensão — Cabine de transformação', false, [block(3)]],
      ['9.3 Seccionadoras dos Cubículos de MT da Coluna 2 do Painel de média tensão — Cabine de transformação', false, [block(4)]],
      ['9.4 Seccionadoras dos Cubículos de MT da Coluna 3 do Painel de média tensão — Cabine de transformação', false, [block(5)]],
      ['9.5 Cubículo Enel', false, [block(6)]],
    ]);
    expect(sheetsOf(section).filter(hasCabineBlock).map((s) => s.blockId)).toEqual([block(1), block(6)]);
  });

  it('the ÍNDICE never lists a painel band: its lines are the numbered subsections only', () => {
    const spec = layoutSpec(snapshotOf(locations(true), sheets), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const lines = tocLines(spec).filter((line) => line.level === 2);
    expect(lines.map((line) => line.text)).toEqual([
      '9.1 Transformadores e Cabos de Alimentação da Cabine de transformação',
      '9.2 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de média tensão — Cabine de transformação',
      '9.3 Seccionadoras dos Cubículos de MT da Coluna 2 do Painel de média tensão — Cabine de transformação',
      '9.4 Seccionadoras dos Cubículos de MT da Coluna 3 do Painel de média tensão — Cabine de transformação',
      '9.5 Cubículo Enel',
    ]);
    expect(lines.map((line) => line.key)).toEqual(['9.1', '9.2', '9.3', '9.4', '9.5']);
    // Story 14.10 part 8: the ÍNDICE lines are the section's own numbered headings, word for word.
    expect(lines.map((line) => line.text)).toEqual(
      layoutOf(snapshotOf(locations(true), sheets))
        .subsections.filter((s) => s.painel !== true)
        .map((s) => s.heading),
    );
  });

  it('a painel name is upper-cased the pt-BR way, and a relatório holding sheets only in painéis still prints', () => {
    const locs = [cabine(1, 'Geradores', 'a0'), painel(10, 'painel de distribuição — ação', 1, 'a0'), coluna(11, 'Coluna 1', 10, 'a0')];
    const section = layoutOf(fieldOrder(snapshotOf(locs, [sheet(1, 11, 'disjuntor_mt', 'a0')])));
    expect(section.subsections.map((s) => s.heading)).toEqual(['9.1 Geradores', 'PAINEL DE DISTRIBUIÇÃO — AÇÃO']);
    // No sheet at all: null, as before.
    expect(section9Layout(fieldOrder(snapshotOf(locs, [])), 9, TITLE)).toBeNull();
  });
});

describe('14.4 section9Layout: VERIFICAÇÕES DO LOCAL, once per local, right after AMBIENTE DE ENSAIO', () => {
  type CabineRow = Extract<LocationRow, { kind: 'cabine' }>;
  const painel = (n: number, name: string, parent: number, orderKey: string): LocationRow => ({ id: id(n), relatorio_id: RELATORIO, parent_id: id(parent), kind: 'painel', name, order_key: orderKey, removed_at: null });
  const coluna = (n: number, name: string, parent: number, orderKey: string): LocationRow => ({ id: id(n), relatorio_id: RELATORIO, parent_id: id(parent), kind: 'coluna', name, order_key: orderKey, removed_at: null });
  const se = { type: 'ALVENARIA - CONVENCIONAL', primary_kv: measured('13.8', 'kV'), secondary_kv: null, installed_kva: measured('1500', 'kVA') };
  const env = { altitude_m: null, temperature_c: measured('21', '°C'), humidity_pct: measured('62', '%') };
  const EMERGENCIA = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
  const EXTINTOR = 'extintor_de_incendio_carregado_lacrado_dentro_da_validade_sinalizado_e_desobstruido';
  const checklist: CabineRow['checklist'] = {
    luvas_isolantes_compativeis_com_a_tensao_com_ensaio_dieletrico_valido: { result: cell('C'), observation: cell(' Classe 2, ensaio válido até 11/2026 ') },
    [EXTINTOR]: { result: cell('C') },
    bacia_de_contencao_de_oleo: { result: cell('NA'), observation: cell('Sem equipamento a óleo no local') },
    [EMERGENCIA]: { result: cell('NC'), observation: cell('Duas luminárias de emergência sem carga') },
    // Answered, then cleared: unanswered again.
    ventilacao: { result: cell(null) },
  };
  /** The relatório on `seedVersion` under `scheme`; the sheets stay on their own block seed. */
  const on = (snapshot: RelatorioSnapshot, seedVersion: string, scheme: 'ordem_de_campo' | 'por_local_e_tipo' = 'por_local_e_tipo'): RelatorioSnapshot => ({
    ...snapshot,
    relatorio: { ...snapshot.relatorio, seed_version: seedVersion, export: { scheme } },
  });
  const sitePhoto = (n: number, location: number, itemKey: string | null, capturedAt: string, over: { block_id?: string; caption?: string } = {}): RelatorioSnapshot['files'][number] => {
    const row = photo(n, { item_key: itemKey, captured_at: capturedAt, block_id: over.block_id ?? null, caption: over.caption ?? null });
    if (row.kind !== 'photo') throw new Error('not a photo row');
    return { ...row, location_id: id(location) };
  };
  const localPartNames = (section: LayoutSectionSheets): (string[] | null)[] => section.subsections.map((s) => (s.localParts === undefined ? null : s.localParts.map(partName)));
  const hasCabineBlock = (sheet: PrintSheet) => sheet.parts.some((p) => partName(p) === 'CARACTERÍSTICAS DA SE' || partName(p) === 'AMBIENTE DE ENSAIO');
  const siteTable = (parts: readonly SheetPart[]): PrintTable => {
    const part = parts.find((p): p is Extract<SheetPart, { kind: 'table' }> => p.kind === 'table' && p.table.rows[0]!.cells[0]!.text === 'VERIFICAÇÕES DO LOCAL');
    if (part === undefined) throw new Error('no site table');
    return part.table;
  };

  /**
   * Local 1 "Cabine primária" (answers; two transformers directly on it; a painel with two
   * seccionadoras), then local 2 "Cubículo Enel" with no equipment at all.
   */
  const locations = (agrupar: boolean): LocationRow[] => [
    cabine(1, 'Cabine primária', 'a0', { agrupar_por_tipo: agrupar, se, env, funcao: 'primaria', checklist }),
    painel(10, 'Painel de média tensão', 1, 'a0'),
    coluna(11, 'Coluna 1', 10, 'a0'),
    coluna(12, 'Coluna 2', 10, 'a1'),
    cabine(2, 'Cubículo Enel', 'a1', { agrupar_por_tipo: agrupar }),
  ];
  const sheets = [sheet(1, 1, 'transformador_forca', 'a0', 'TR-1'), sheet(2, 1, 'transformador_forca', 'a1', 'TR-2'), sheet(3, 11, 'chave_seccionadora', 'a0', 'SEC-C01'), sheet(4, 12, 'chave_seccionadora', 'a0', 'SEC-C02')];
  const LOCAL_PARTS = ['CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', 'VERIFICAÇÕES DO LOCAL'];

  it('matrix "Print, v4" with the flag off: under the local first heading, SE, AMBIENTE, then the table; the painel band carries none; no sheet repeats the cabine tables', () => {
    for (const scheme of ['ordem_de_campo', 'por_local_e_tipo'] as const) {
      const section = layoutOf(on(snapshotOf(locations(false), sheets), 'v4', scheme));
      expect(section.subsections.map((s) => [s.heading, s.painel ?? false, s.sheets.map((x) => x.blockId)])).toEqual([
        ['9.1 Cabine primária', false, [block(1), block(2)]],
        ['PAINEL DE MÉDIA TENSÃO', true, [block(3), block(4)]],
        ['9.2 Cubículo Enel', false, []],
      ]);
      expect(localPartNames(section)).toEqual([LOCAL_PARTS, null, LOCAL_PARTS]);
      expect(sheetsOf(section).some(hasCabineBlock)).toBe(false);
      // Only a subsection that prints the local carries the key.
      expect(Object.keys(section.subsections[1]!)).not.toContain('localParts');
    }
  });

  it('matrix "Print, v4" with the flag on: the first type group of the local carries its parts, exactly once; the groups under the painel name the coluna and the painel', () => {
    const section = layoutOf(on(snapshotOf(locations(true), sheets), 'v4'));
    expect(section.subsections.map((s) => [s.heading, s.sheets.map((x) => x.blockId)])).toEqual([
      ['9.1 Transformadores e Cabos de Alimentação da Cabine primária', [block(1), block(2)]],
      ['PAINEL DE MÉDIA TENSÃO', []],
      // Story 14.10 part 8: one group per coluna.
      ['9.2 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de média tensão — Cabine primária', [block(3)]],
      ['9.3 Seccionadoras dos Cubículos de MT da Coluna 2 do Painel de média tensão — Cabine primária', [block(4)]],
      ['9.4 Cubículo Enel', []],
    ]);
    expect(localPartNames(section)).toEqual([LOCAL_PARTS, null, null, null, LOCAL_PARTS]);
    expect(sheetsOf(section).some(hasCabineBlock)).toBe(false);
    // Under ordem_de_campo the flag is ignored and the table still prints once per local.
    expect(localPartNames(layoutOf(on(snapshotOf(locations(true), sheets), 'v4', 'ordem_de_campo')))).toEqual([LOCAL_PARTS, null, LOCAL_PARTS]);
  });

  it('matrix "Type titles under a painel": two painéis each with seccionadoras print two different numbered titles; with no direct equipment the local own heading (empty, with its parts) comes before the first painel band', () => {
    const locs = [
      cabine(1, 'Cabine primária', 'a0', { agrupar_por_tipo: true, se, env, checklist }),
      painel(10, 'Painel de entrada', 1, 'a0'),
      coluna(11, 'Coluna 1', 10, 'a0'),
      painel(20, 'Painel de saída', 1, 'a1'),
      coluna(21, 'Coluna 1', 20, 'a0'),
    ];
    const inPaineis = [sheet(3, 11, 'chave_seccionadora', 'a0', 'SEC-C01'), sheet(4, 21, 'chave_seccionadora', 'a0', 'SEC-C01-2')];
    const expected = [
      ['9.1 Cabine primária', false, []],
      ['PAINEL DE ENTRADA', true, []],
      ['9.2 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de entrada — Cabine primária', false, [block(3)]],
      ['PAINEL DE SAÍDA', true, []],
      ['9.3 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de saída — Cabine primária', false, [block(4)]],
    ];
    const v4 = layoutOf(on(snapshotOf(locs, inPaineis), 'v4'));
    expect(v4.subsections.map((s) => [s.heading, s.painel ?? false, s.sheets.map((x) => x.blockId)])).toEqual(expected);
    expect(localPartNames(v4)).toEqual([LOCAL_PARTS, null, null, null, null]);
    expect(sheetsOf(v4).some(hasCabineBlock)).toBe(false);
    // The headings do not depend on the seed: on v3 the same tree prints them, with no local part and the cabine tables on the first sheet.
    const v3 = layoutOf(on(snapshotOf(locs, inPaineis), 'v3'));
    expect(v3.subsections.map((s) => [s.heading, s.painel ?? false, s.sheets.map((x) => x.blockId)])).toEqual(expected);
    expect(localPartNames(v3)).toEqual([null, null, null, null, null]);
    expect(sheetsOf(v3).filter(hasCabineBlock).map((s) => s.blockId)).toEqual([block(3)]);
    // The ÍNDICE tells the two groups apart.
    const lines = tocLines(layoutSpec(on(snapshotOf(locs, inPaineis), 'v4'), { revisionNumber: 1, issuedAt: ISSUED_AT })).filter((line) => line.level === 2);
    expect(lines.map((line) => line.text)).toEqual(expected.filter((row) => row[1] === false).map((row) => row[0]));
  });

  it('draws the table as the print mock: the title band, the seed columns, a group row before each group, "N. LABEL" in upper case running 1 to 19, an X in the chosen box, the observation as typed', () => {
    const section = layoutOf(on(snapshotOf(locations(false), sheets), 'v4'));
    const printed = siteTable(section.subsections[0]!.localParts!);
    const rows = texts(printed);
    expect(printed.columns).toEqual([5, 0.6, 0.6, 0.6, 3.4]);
    expect(rows[0]).toEqual(['VERIFICAÇÕES DO LOCAL']);
    expect(printed.rows[0]).toMatchObject({ band: true, cells: [{ span: 5, bold: true, shade: true }] });
    expect(rows[1]).toEqual(['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
    expect(printed.rows[1]!.header).toBe(true);
    // 2 head rows + 6 group rows + 19 items.
    expect(rows).toHaveLength(27);
    const groups = printed.rows.filter((row) => row.group === true);
    expect(groups.map((row) => row.cells)).toEqual(
      ['SEGURANÇA E EPC NO LOCAL', 'COMBATE A INCÊNDIO', 'ILUMINAÇÃO', 'ATERRAMENTO', 'SINALIZAÇÃO E DOCUMENTAÇÃO', 'AMBIENTE'].map((text) => [{ text, span: 5, bold: true, align: 'left' }]),
    );
    // A group row is neither a band nor a header: the renderer shades it on its own fill.
    expect(groups.every((row) => row.band === undefined && row.header === undefined)).toBe(true);
    expect(printed.rows.map((row) => row.group === true).flatMap((isGroup, i) => (isGroup ? [i] : []))).toEqual([2, 10, 13, 16, 19, 23]);
    const items = printed.rows.filter((row) => row.group !== true).slice(2).map((row) => row.cells.map((c) => c.text));
    expect(items.map((row) => row[0])).toEqual([
      '1. LUVAS ISOLANTES COMPATÍVEIS COM A TENSÃO, COM ENSAIO DIELÉTRICO VÁLIDO',
      '2. TAPETE OU ESTRADO ISOLANTE',
      '3. VARA DE MANOBRA COM ENSAIO DIELÉTRICO VÁLIDO',
      '4. DETECTOR DE TENSÃO',
      '5. CONJUNTO DE ATERRAMENTO TEMPORÁRIO',
      '6. EPI DISPONÍVEL',
      '7. DISPOSITIVOS DE BLOQUEIO E CARTÕES DE IMPEDIMENTO',
      '8. EXTINTOR DE INCÊNDIO CARREGADO, LACRADO, DENTRO DA VALIDADE, SINALIZADO E DESOBSTRUÍDO',
      '9. BACIA DE CONTENÇÃO DE ÓLEO',
      '10. ILUMINAÇÃO NORMAL',
      '11. ILUMINAÇÃO DE EMERGÊNCIA (AUTONOMIA MÍNIMA DE 2 H)',
      '12. PORTAS, TELAS E GRADES ATERRADAS',
      '13. PONTOS PARA ATERRAMENTO TEMPORÁRIO',
      '14. PLACAS DE ADVERTÊNCIA NA PORTA E NAS GRADES',
      '15. DIAGRAMA UNIFILAR ATUALIZADO NO LOCAL',
      '16. CIRCUITOS E EQUIPAMENTOS IDENTIFICADOS',
      '17. PORTA ABRINDO PARA FORA, COM FECHADURA',
      '18. VENTILAÇÃO',
      '19. LIMPEZA E AUSÊNCIA DE INFILTRAÇÃO',
    ]);
    expect(items[0]).toEqual([items[0]![0], 'X', '', '', 'Classe 2, ensaio válido até 11/2026']);
    expect(items[7]).toEqual([items[7]![0], 'X', '', '', '']);
    expect(items[8]).toEqual([items[8]![0], '', '', 'X', 'Sem equipamento a óleo no local']);
    expect(items[10]).toEqual([items[10]![0], '', 'X', '', 'Duas luminárias de emergência sem carga']);
    // Unanswered (never answered, and answered then cleared): no mark, no text.
    expect(items[1]).toEqual([items[1]![0], '', '', '', '']);
    expect(items[17]).toEqual([items[17]![0], '', '', '', '']);
    // The cabine tables stand before it, as on a v1 to v3 first sheet.
    const [seTable, envTable] = section.subsections[0]!.localParts!.map((part) => (part.kind === 'table' ? texts(part.table) : []));
    expect(seTable![2]).toEqual(['ALVENARIA - CONVENCIONAL', '13,8 kV', '-', '1.500 kVA']);
    expect(envTable![0]).toEqual(['AMBIENTE DE ENSAIO']);
    // A local with nothing answered prints the 19 rows with no mark.
    const empty = siteTable(section.subsections[2]!.localParts!);
    expect(empty.rows.filter((row) => row.group !== true).slice(2).every((row) => row.cells.slice(1).every((c) => c.text === ''))).toBe(true);
  });

  it('matrix "Print, v4, no equipment": a local with no sheet prints its numbered heading and its parts; the section prints even when no local holds a sheet', () => {
    for (const scheme of ['ordem_de_campo', 'por_local_e_tipo'] as const) {
      for (const agrupar of [false, true]) {
        const section = section9Layout(on(snapshotOf(locations(agrupar), []), 'v4', scheme), 9, TITLE);
        expect(section).not.toBeNull();
        expect(section!.subsections.map((s) => [s.heading, s.sheets.length])).toEqual([
          ['9.1 Cabine primária', 0],
          ['9.2 Cubículo Enel', 0],
        ]);
        expect(localPartNames(section!)).toEqual([LOCAL_PARTS, LOCAL_PARTS]);
      }
    }
    // The ÍNDICE lists both headings.
    const lines = tocLines(layoutSpec(on(snapshotOf(locations(false), []), 'v4'), { revisionNumber: 1, issuedAt: ISSUED_AT })).filter((line) => line.level === 2);
    expect(lines.map((line) => line.text)).toEqual(['9.1 Cabine primária', '9.2 Cubículo Enel']);
    // No local at all: null, the section keeps its note.
    expect(section9Layout(on(snapshotOf([], []), 'v4'), 9, TITLE)).toBeNull();
  });

  it('prints the site item photos after the table, in capture order with their section 7 numbers; a photo with no site item, one of another local and one on a block stay out', () => {
    const files = [
      photo(1, { captured_at: '2026-09-06T08:00:00.000Z' }), // 1: a general photo
      sitePhoto(2, 1, EMERGENCIA, '2026-09-06T10:00:00.000Z', { caption: 'Verificação de iluminação de emergência (autonomia mínima de 2 h) da Cabine primária' }), // 3
      sitePhoto(3, 1, EXTINTOR, '2026-09-06T09:00:00.000Z'), // 2
      sitePhoto(4, 1, null, '2026-09-06T11:00:00.000Z'), // 4: a photo of the local, on no item
      sitePhoto(5, 2, EMERGENCIA, '2026-09-06T12:00:00.000Z'), // 5: the other local's
      sitePhoto(6, 1, EMERGENCIA, '2026-09-06T13:00:00.000Z', { block_id: block(1) }), // 6: carries both, read as its block's
      sitePhoto(7, 1, 'contatos', '2026-09-06T14:00:00.000Z'), // 7: an item key outside the site list
      sitePhoto(8, 99, EMERGENCIA, '2026-09-06T15:00:00.000Z'), // 8: a local that is not live
    ];
    const sited = on(snapshotOf(locations(false), sheets, { files }), 'v4');
    const section = layoutOf(sited);
    expect(localPartNames(section)).toEqual([[...LOCAL_PARTS, 'photos 2 3'], null, [...LOCAL_PARTS, 'photos 5']]);
    const photos = section.subsections[0]!.localParts!.find((part) => part.kind === 'photos') as Extract<SheetPart, { kind: 'photos' }>;
    expect(photos.photos).toEqual([
      { fileId: id(3003), number: 2, caption: 'Imagem 2.' },
      { fileId: id(3002), number: 3, caption: 'Imagem 3: Verificação de iluminação de emergência (autonomia mínima de 2 h) da Cabine primária.' },
    ]);
    // The photo carrying both prints on its block's sheet, as any photo of that sheet.
    expect(sheetOf(section, block(1)).parts.some((part) => part.kind === 'photos' && part.photos.some((p) => p.fileId === id(3006)))).toBe(true);
    // The numbers are `numberPhotos`'s: the "Geral" photo 1, then this local's site photos.
    expect(numberPhotos(sited).get(id(3003))).toBe(2);
  });

  it('matrix "Removed local": a local absent from the snapshot prints nothing, its site photos included', () => {
    const files = [sitePhoto(2, 2, EMERGENCIA, '2026-09-06T10:00:00.000Z')];
    const live = locations(false).filter((row) => row.id !== id(2));
    const section = layoutOf(on(snapshotOf(live, sheets, { files }), 'v4'));
    expect(section.subsections.map((s) => s.heading)).toEqual(['9.1 Cabine primária', 'PAINEL DE MÉDIA TENSÃO']);
    expect(JSON.stringify(section)).not.toContain(id(3002));
  });

  it('matrix "Print, v1 to v3": no local part anywhere, the cabine tables on the first sheet, a local with no sheet dropped, and the layout equal across the three versions', () => {
    const files = [sitePhoto(2, 1, EMERGENCIA, '2026-09-06T10:00:00.000Z')];
    const layouts = ['v1', 'v2', 'v3'].map((version) => layoutOf(on(snapshotOf(locations(false), sheets, { files }), version)));
    for (const section of layouts) {
      expect(section.subsections.map((s) => [s.heading, s.sheets.map((x) => x.blockId)])).toEqual([
        ['9.1 Cabine primária', [block(1), block(2)]],
        ['PAINEL DE MÉDIA TENSÃO', [block(3), block(4)]],
      ]);
      expect(section.subsections.every((s) => !('localParts' in s))).toBe(true);
      expect(sheetsOf(section).filter(hasCabineBlock).map((s) => s.blockId)).toEqual([block(1)]);
      expect(JSON.stringify(section)).not.toContain('VERIFICAÇÕES DO LOCAL');
      expect(section).toEqual(layouts[0]);
    }
    expect(section9Layout(on(snapshotOf(locations(false), []), 'v3'), 9, TITLE)).toBeNull();
  });
});

describe('Stories 15.3 and 15.6 (seed v9): what a v9 relatório prints, a v8 one as before', () => {
  /** Sheet `n` like `sheet`, on `version` (block and relatório). */
  function sheetOn(version: string, n: number, type: EquipmentBlockType, tag = `T${n}`): Built {
    return newEquipmentBlock({ blockId: id(1000 + n), equipmentId: id(2000 + n), relatorioId: RELATORIO, projectId: TEST_PROJECT, locationId: id(1), type, tag, seedVersion: version, orderKey: 'a0' });
  }
  const on = (snapshot: RelatorioSnapshot, version: string): RelatorioSnapshot => ({ ...snapshot, relatorio: { ...snapshot.relatorio, seed_version: version } });
  const printedOf = (version: string, built: Built) => sheetOf(layoutOf(on(snapshotOf([cabine(1, 'Cabine A', 'a0')], [built]), version)), block(1));

  it('the TC prints no POTÊNCIA NOMINAL: 13 pairs, the last row padded; v8 prints its 14', () => {
    const plate = (version: string) => texts(tableNamed(printedOf(version, sheetOn(version, 1, 'tc', 'TC-1')), 'DADOS DO EQUIPAMENTO'));
    const v9 = plate('v9');
    const v8 = plate('v8');
    const fieldCount = (version: string) => getDefinition(version, 'cabine_primaria', 'tc').nameplate.length;
    expect(v9.slice(1).flat().filter((text) => text === 'POTÊNCIA NOMINAL')).toEqual([]);
    expect(v8.slice(1).flat()).toContain('POTÊNCIA NOMINAL');
    expect(v9).toHaveLength(1 + Math.ceil(fieldCount('v9') / 3));
    expect(v9.at(-1)!.slice(2)).toEqual(['', '', '', '']);
    expect(v8).toHaveLength(1 + Math.ceil(fieldCount('v8') / 3));
  });

  it('a transformer, TP or TC prints 14 numbered checklist rows on v9 (item 13 renumbered 12), 15 on v8', () => {
    for (const type of ['transformador_forca', 'tp', 'tc'] as const) {
      const rows = (version: string) => texts(tableNamed(printedOf(version, sheetOn(version, 1, type)), 'VERIFICAÇÕES GERAIS'));
      const v9 = rows('v9');
      expect(v9, type).toHaveLength(2 + getDefinition('v9', 'cabine_primaria', type).checklist!.length);
      expect(v9, type).toHaveLength(2 + 14);
      expect(v9.map((row) => row[0])).not.toContain('5. INDICADOR NÍVEL DE ÓLEO');
      expect(v9[2 + 4]![0], type).toBe('5. VENTILADORES');
      expect(v9[2 + 11]![0], type).toBe('12. ÓLEO ISOLANTE/INDICADOR DE NÍVEL');
      const v8 = rows('v8');
      expect(v8, type).toHaveLength(2 + 15);
      expect(v8[2 + 4]![0], type).toBe('5. INDICADOR NÍVEL DE ÓLEO');
    }
  });

  it('VAL CALCULADO: the transformer U1 · √3 / U2 on v9 (62,90) and U1/U2 on v8 (36,32); TP and TC the same on both', () => {
    const ratioRow = (version: string, type: EquipmentBlockType, header: string, cells: Record<string, unknown>, nameplate: Record<string, unknown> = {}) => {
      const built = edit(sheetOn(version, 1, type), (b) => withTest('relacao_transformacao', cells)(withNameplate(nameplate)(b)));
      return texts(tableNamed(printedOf(version, built), header))[1]!;
    };
    const trafo = { '0/0': measured('13.8', 'kV'), '0/1': measured('380', 'V'), '0/3': measured('62.8', null), '0/4': measured('62.8', null), '0/5': measured('62.8', null) };
    expect(ratioRow('v9', 'transformador_forca', 'TAP Nº', trafo)).toEqual(['-', '13,8 kV', '380 V', '62,90', '62,8', '62,8', '62,8', 'SATISFATÓRIO']);
    expect(ratioRow('v8', 'transformador_forca', 'TAP Nº', trafo)).toEqual(['-', '13,8 kV', '380 V', '36,32', '62,8', '62,8', '62,8', 'INSATISFATÓRIO']);
    const tp = { '0/0': measured('13800', 'V'), '0/1': measured('220', 'V'), '0/3': measured('62.7', null) };
    for (const version of ['v8', 'v9']) {
      expect(ratioRow(version, 'tp', "TP's", tp), version).toEqual(['FASE R', '13.800 V', '220 V', '62,73', '62,7', 'SATISFATÓRIO']);
      expect(ratioRow(version, 'tc', 'TPS', { '0/3': measured('40', null) }, { relacao: '200/5' })[3], version).toBe('40,00');
    }
  });

  it('VERIFICAÇÕES DO LOCAL prints 21 numbered rows on v9, the two new ones 20 and 21 under AMBIENTE; v8 prints 19', () => {
    const answers: Extract<LocationRow, { kind: 'cabine' }>['checklist'] = {
      grades_e_portas_estado_e_fixacao: { result: cell('NC'), observation: cell('Grade ou porta solta ou mal fixada') },
      pintura_e_corrosao: { result: cell('C') },
    };
    const siteRows = (version: string) => {
      const local = cabine(1, 'Cabine A', 'a0', { funcao: 'primaria', checklist: version === 'v9' ? answers : {} });
      const section = layoutOf(on(snapshotOf([local], [sheetOn(version, 1, 'chave_seccionadora')]), version));
      const part = section.subsections[0]!.localParts!.find((p): p is Extract<SheetPart, { kind: 'table' }> => p.kind === 'table' && p.table.rows[0]!.cells[0]!.text === 'VERIFICAÇÕES DO LOCAL')!;
      return part.table.rows.filter((row) => row.group !== true).slice(2).map((row) => row.cells.map((c) => c.text));
    };
    const v9 = siteRows('v9');
    expect(v9).toHaveLength(21);
    expect(v9[19]).toEqual(['20. GRADES E PORTAS: ESTADO E FIXAÇÃO', '', 'X', '', 'Grade ou porta solta ou mal fixada']);
    expect(v9[20]).toEqual(['21. PINTURA E CORROSÃO', 'X', '', '', '']);
    expect(siteRows('v8')).toHaveLength(19);
  });
});

describe('17.4 section9Layout: a display shot is numbered and prints "Imagem N: ⟨legenda⟩." after the tests', () => {
  const sheetPhotosOf = (files: RelatorioSnapshot['files']) => {
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [FULL_CHAVE], { files });
    const printed = sheetOf(layoutOf(snapshot), block(1));
    return { snapshot, printed, photos: printed.parts.flatMap((p) => (p.kind === 'photos' ? p.photos : [])) };
  };
  const general = photo(1, { captured_at: '2026-09-06T09:00:00.000Z', caption: 'Vista geral' }); // 1, section 7
  const display = photo(2, { block_id: block(1), reading_kind: 'display', caption: 'Leitura do megômetro', captured_at: '2026-09-06T09:30:00.000Z' }); // 2
  const after = photo(3, { block_id: block(1), caption: 'Detalhe', captured_at: '2026-09-06T10:00:00.000Z' }); // 3

  it('M6: after the test tables, "Imagem 2: Leitura do megômetro." with its number; the sheet photo after it is 3, numbers as numberPhotos gives them', () => {
    const { snapshot, printed, photos } = sheetPhotosOf([general, display, after]);
    expect(photos).toEqual([
      { fileId: display.id, number: 2, caption: 'Imagem 2: Leitura do megômetro.' },
      { fileId: after.id, number: 3, caption: 'Imagem 3: Detalhe.' },
    ]);
    const numbers = numberPhotos(snapshot);
    expect(photos.map((p) => numbers.get(p.fileId))).toEqual([2, 3]);
    // The photos part stands after the last test table and before OBSERVAÇÕES.
    const names = printed.parts.map((part) => (part.kind === 'photos' ? 'photos' : partName(part)));
    expect(names.slice(names.indexOf('photos') - 1, names.indexOf('photos') + 2)).toEqual(['LINHA', 'photos', 'OBSERVAÇÕES']);
  });

  it('M6: a caption already closed keeps its own punctuation; a display shot on a checklist row still prints after the tests', () => {
    const closed = photo(4, { block_id: block(1), reading_kind: 'display', item_key: 'contatos', caption: '  Está oxidado?  ', captured_at: '2026-09-06T09:40:00.000Z' });
    const { printed, photos } = sheetPhotosOf([general, closed]);
    expect(photos).toEqual([{ fileId: closed.id, number: 2, caption: 'Imagem 2: Está oxidado?' }]);
    expect(printed.parts.map((part) => (part.kind === 'photos' ? 'photos' : partName(part))).indexOf('photos')).toBeGreaterThan(
      printed.parts.map(partName).indexOf('LINHA'),
    );
  });

  it('M6: an uncaptioned display shot prints "Imagem N: ⟨full stamp⟩.", never the bare "Imagem N." of a plain uncaptioned photo', () => {
    const coords = { lat: -23.55052, lng: -46.63331, accuracy_m: 5, source: 'geolocation' as const };
    const bare = photo(5, { block_id: block(1), reading_kind: 'display', caption: null, captured_at: '2026-09-06T10:05:00.000Z', coords });
    const blank = photo(6, { block_id: block(1), reading_kind: 'display', caption: '   ', captured_at: '2026-09-06T10:06:00.000Z' });
    const plain = photo(7, { block_id: block(1), caption: null, captured_at: '2026-09-06T10:07:00.000Z' });
    const { photos } = sheetPhotosOf([bare, blank, plain]);
    expect(photos.map((p) => [p.number, p.caption])).toEqual([
      [1, `Imagem 1: ${photoStampFull(bare as Parameters<typeof photoStampFull>[0])}.`],
      [2, 'Imagem 2: 06/09/2026 07:06.'],
      [3, 'Imagem 3.'],
    ]);
    expect(photos[0]!.caption).toBe('Imagem 1: 06/09/2026 07:05 · −23,5505, −46,6333.');
  });

  it('M7: removing the display shot closes the gap (the photo after it becomes 2); restoring it gives the numbers back', () => {
    const live = sheetPhotosOf([general, display, after]).photos;
    const removed = { ...display, removed_at: '2026-09-06T11:00:00.000Z' } as RelatorioSnapshot['files'][number];
    expect(sheetPhotosOf([general, removed, after]).photos).toEqual([{ fileId: after.id, number: 2, caption: 'Imagem 2: Detalhe.' }]);
    const restored = { ...display, removed_at: null } as RelatorioSnapshot['files'][number];
    expect(sheetPhotosOf([general, restored, after]).photos).toEqual(live);
  });

  it('M5: a display shot on a local (no block) prints nowhere in section 9 but still holds a number, after every placed photo', () => {
    const files = [{ ...display, block_id: null, location_id: id(1) } as RelatorioSnapshot['files'][number], general];
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [FULL_CHAVE], { files });
    expect(JSON.stringify(layoutOf(snapshot))).not.toContain(display.id);
    expect([...numberPhotos(snapshot).entries()]).toEqual([
      [general.id, 1],
      [display.id, 2],
    ]);
  });
});
