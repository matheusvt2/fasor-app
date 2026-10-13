import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { applyOp } from '../ops/apply.ts';
import { blockFieldPath, sheetConclusionPath, sheetObservationsPath, sheetTestPath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import { blockConfigWithSubBlock } from '../relatorio/measurement-evaluation.ts';
import { blockOf, choice, CTA, CTA_BLOCK, ctaFilledWrites, ctaRows, ctaState, E1, E5, writeSheet } from '../relatorio/measurement-test-support.ts';
import { LIBRARY_GROUP_LABEL, newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { groupForPrint, type PrintSubsection } from './group-for-print.ts';
import { section9Layout, type PrintSheet, type PrintTable, type SheetPart } from './section-9.ts';

/*
 * Story 14.5: section 9 with a library type. `groupForPrint` gains the "Outros equipamentos"
 * group after Transformadores, and a Chave de transferência automática prints its
 * configuration and one table per measurement test. A local with no library type groups and
 * prints exactly as before.
 */

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const RELATORIO = small.relatorio.id;
const TITLE = 'RELATÓRIOS DOS ENSAIOS';

const id = (n: number) => `019966b0-0146-7000-8000-${n.toString(16).padStart(12, '0')}`;
const block = (n: number) => id(1000 + n);

function local(n: number, name: string, orderKey: string, agrupar: boolean): LocationRow {
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
    agrupar_por_tipo: agrupar,
  };
}
const painel = (n: number, name: string, parent: number, orderKey: string): LocationRow => ({ id: id(n), relatorio_id: RELATORIO, parent_id: id(parent), kind: 'painel', name, order_key: orderKey, removed_at: null });
const coluna = (n: number, name: string, parent: number, orderKey: string): LocationRow => ({ id: id(n), relatorio_id: RELATORIO, parent_id: id(parent), kind: 'coluna', name, order_key: orderKey, removed_at: null });

interface Built {
  block: BlockRow;
  equipment: EquipmentRow;
}

/** An equipment sheet `n` of a relatório on seed v5 (block id(1000+n), equipment id(2000+n), TAG "T⟨n⟩") at `location`. */
function sheet(n: number, location: number, type: EquipmentBlockType, orderKey: string, tag = `T${n}`): Built {
  return newEquipmentBlock({ blockId: block(n), equipmentId: id(2000 + n), relatorioId: RELATORIO, projectId: TEST_PROJECT, locationId: id(location), type, tag, seedVersion: 'v5', orderKey });
}

function snapshotOf(locations: LocationRow[], sheets: Built[], scheme: 'por_local_e_tipo' | 'ordem_de_campo' = 'por_local_e_tipo'): RelatorioSnapshot {
  return {
    ...small,
    relatorio: { ...small.relatorio, seed_version: 'v5', export: { scheme } },
    locations,
    blocks: sheets.map((s) => s.block),
    equipment: sheets.map((s) => s.equipment),
    files: [],
    points: [],
    suggestions: [],
  };
}

const summary = (subsections: readonly PrintSubsection[]) => subsections.map((s) => ({ kind: s.kind, title: s.title, blockIds: s.blockIds, ...(s.painelId === undefined ? {} : { painelId: s.painelId }) }));

describe('groupForPrint: "Outros equipamentos" after Transformadores', () => {
  // Geradores (flag on): a seccionadora, a CTA, a transformer and a second CTA, in that tree order.
  const locations = [local(1, 'Geradores', 'a0', true)];
  const eight = [sheet(1, 1, 'chave_seccionadora', 'a0'), sheet(3, 1, 'transformador_forca', 'a2')];
  const ctas = [sheet(2, 1, CTA, 'a1', 'CTA-GER'), sheet(4, 1, CTA, 'a3', 'CTA-GER-2')];
  const withCta = snapshotOf(locations, [eight[0]!, ctas[0]!, eight[1]!, ctas[1]!]);
  const without = snapshotOf(locations, eight);

  it('the library type prints in its own group, last, in tree order, titled with the local', () => {
    expect(LIBRARY_GROUP_LABEL).toBe('Outros equipamentos');
    expect(summary(groupForPrint(withCta).subsections)).toEqual([
      { kind: 'seccionadoras', title: 'Seccionadoras dos Cubículos de MT dos Geradores', blockIds: [block(1)] },
      { kind: 'transformadores', title: 'Transformadores e Cabos de Alimentação dos Geradores', blockIds: [block(3)] },
      { kind: 'outros', title: 'Outros equipamentos dos Geradores', blockIds: [block(2), block(4)] },
    ]);
    expect(groupForPrint(withCta).warnings).toEqual([]);
    // Every sheet prints once.
    expect(groupForPrint(withCta).subsections.flatMap((s) => s.blockIds).sort()).toEqual([block(1), block(2), block(3), block(4)].sort());
  });

  it('a local with no library type emits exactly the parts it did: the group is skipped, and what the CTA joins is untouched', () => {
    const before = summary(groupForPrint(without).subsections);
    expect(before).toEqual([
      { kind: 'seccionadoras', title: 'Seccionadoras dos Cubículos de MT dos Geradores', blockIds: [block(1)] },
      { kind: 'transformadores', title: 'Transformadores e Cabos de Alimentação dos Geradores', blockIds: [block(3)] },
    ]);
    // With the CTA, the same two subsections stand unchanged before the new one.
    expect(summary(groupForPrint(withCta).subsections).slice(0, 2)).toEqual(before);
    // A local of CTAs alone prints only that group.
    expect(summary(groupForPrint(snapshotOf(locations, ctas)).subsections)).toEqual([{ kind: 'outros', title: 'Outros equipamentos dos Geradores', blockIds: [block(2), block(4)] }]);
  });

  it('the Porto Seguro fixture (seed v1) has no such group under either scheme', () => {
    const porto = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    for (const scheme of ['ordem_de_campo', 'por_local_e_tipo'] as const) {
      const { subsections } = groupForPrint(porto, scheme);
      expect(subsections.some((s) => s.kind === 'outros')).toBe(false);
      expect(subsections.flatMap((s) => s.blockIds)).toHaveLength(94);
    }
    expect(groupForPrint(porto, 'por_local_e_tipo').subsections).toHaveLength(11);
  });

  it('with the flag off, and under ordem_de_campo, the type prints where the tree has it', () => {
    const off = snapshotOf([local(1, 'Geradores', 'a0', false)], [eight[0]!, ctas[0]!, eight[1]!, ctas[1]!]);
    const expected = [{ kind: 'cabine', title: 'Geradores', blockIds: [block(1), block(2), block(3), block(4)] }];
    expect(summary(groupForPrint(off).subsections)).toEqual(expected);
    expect(summary(groupForPrint(withCta, 'ordem_de_campo').subsections)).toEqual(expected);
  });

  it('inside a painel the group follows that painel\'s own type groups; a CTA directly on the local is in the direct run', () => {
    const tree = [local(1, 'Geradores', 'a0', true), painel(10, 'Painel de média tensão', 1, 'a0'), coluna(11, 'Coluna 1', 10, 'a0')];
    const sheets = [sheet(1, 1, CTA, 'a0', 'CTA-GER'), sheet(2, 11, 'disjuntor_mt', 'a0'), sheet(3, 11, CTA, 'a1', 'CTA-C01')];
    expect(summary(groupForPrint(snapshotOf(tree, sheets)).subsections)).toEqual([
      { kind: 'outros', title: 'Outros equipamentos dos Geradores', blockIds: [block(1)] },
      { kind: 'painel', title: 'Painel de média tensão', blockIds: [], painelId: id(10) },
      { kind: 'disjuntores', title: 'Disjuntores dos Cubículos de MT dos Geradores', blockIds: [block(2)], painelId: id(10) },
      { kind: 'outros', title: 'Outros equipamentos dos Geradores', blockIds: [block(3)], painelId: id(10) },
    ]);
  });
});

// --- section 9 of a filled sheet -----------------------------------------------------------------------

const texts = (table: PrintTable) => table.rows.map((row) => row.cells.map((cell) => cell.text));
const tablesOf = (parts: readonly SheetPart[]) => parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const titled = (sheet: PrintSheet, title: string): PrintTable => tablesOf(sheet.parts).find((table) => table.rows[0]!.cells[0]!.text === title)!;
const bands = (sheet: PrintSheet) => tablesOf(sheet.parts).map((table) => table.rows[0]!.cells[0]!.text);

/** The CTA sheet of the support file placed on a flagged local "Geradores", after a transformer, on a relatório on seed v5. */
function printed(cta: BlockRow, scheme: 'por_local_e_tipo' | 'ordem_de_campo' = 'por_local_e_tipo') {
  const geradores = { ...local(1, 'Geradores', 'a0', true), id: cta.location_id! };
  const transformer = sheet(9, 1, 'transformador_forca', 'a0', 'TR-1');
  const snapshot = snapshotOf(
    [geradores],
    [
      { ...transformer, block: { ...transformer.block, location_id: geradores.id } },
      { block: { ...cta, relatorio_id: RELATORIO, order_key: 'a1' }, equipment: ctaRows().equipment },
    ],
    scheme,
  );
  const layout = section9Layout(snapshot, 9, TITLE)!;
  return { layout, sheet: layout.subsections.flatMap((s) => s.sheets).find((candidate) => candidate.blockId === cta.id)! };
}

function filled() {
  const { state, f } = ctaState({ polos: '4', neutro: 'chaveado' });
  return { state: writeSheet(state, f, ctaFilledWrites()), f };
}

describe('section9Layout: a Chave de transferência automática', () => {
  it('prints in the "Outros equipamentos" group after the Transformadores group of the same local', () => {
    const { layout, sheet: cta } = printed(blockOf(filled().state));
    expect(layout.subsections.map((s) => [s.heading, s.sheets.map((candidate) => candidate.title)])).toEqual([
      ['9.1 Transformadores e Cabos de Alimentação dos Geradores', ['TRANSFORMADOR DE FORÇA TR-1']],
      ['9.2 Outros equipamentos dos Geradores', ['CHAVE DE TRANSFERÊNCIA AUTOMÁTICA CTA-GER']],
    ]);
    expect(cta.title).toBe('CHAVE DE TRANSFERÊNCIA AUTOMÁTICA CTA-GER');
  });

  it('prints its parts in order: the plate, CONFIGURAÇÃO, the checklist, one table per test E1 to E6 and the conclusion', () => {
    const { sheet: cta } = printed(blockOf(filled().state));
    expect(cta.parts.every((part) => part.kind === 'table')).toBe(true);
    expect(bands(cta)).toEqual([
      'DADOS DO EQUIPAMENTO',
      'CONFIGURAÇÃO',
      'VERIFICAÇÕES GERAIS',
      'E1 · RESISTÊNCIA DE CONTATO',
      'E2 · ISOLAMENTO PRINCIPAL',
      'E3 · ISOLAMENTO DO CONTROLE',
      'E4 · AJUSTES DO CONTROLADOR',
      'E5 · TRANSFERÊNCIA',
      'E6 · TERMOGRAFIA SOB CARGA',
      'CONCLUSÃO',
    ]);
  });

  it('DADOS DO EQUIPAMENTO: the 15 fields in caps, three pairs a row; CONFIGURAÇÃO: the five fields with the option in force', () => {
    const { sheet: cta } = printed(blockOf(filled().state));
    const plate = texts(titled(cta, 'DADOS DO EQUIPAMENTO'));
    expect(plate).toHaveLength(6);
    expect(plate[1]).toEqual(['IDENTIFICAÇÃO', 'valor identificacao', 'FABRICANTE', 'valor fabricante', 'SÉRIE', 'valor serie']);
    expect(plate[2]).toEqual(['Nº DE CATÁLOGO', 'valor n_de_catalogo', 'Nº DE SÉRIE', 'valor n_de_serie', 'TAG', 'CTA-GER']);
    expect(plate[3]).toEqual(['ANO', 'valor ano', 'TENSÃO NOMINAL', '400 V', 'CORRENTE NOMINAL', '400 A']);
    expect(plate[4]).toEqual(['FREQUÊNCIA', '400 Hz', 'WCR', '400 kA', 'PROTEÇÃO A MONTANTE', 'valor protecao_a_montante']);
    expect(plate[5]).toEqual(['CONTROLADOR E FIRMWARE', 'valor controlador_e_firmware', 'INVÓLUCRO', 'valor involucro', 'TORQUE DOS TERMINAIS', '400 N·m']);
    expect(texts(titled(cta, 'CONFIGURAÇÃO'))).toEqual([
      ['CONFIGURAÇÃO'],
      ['TENSÃO', 'BT', 'POLOS', '4', 'NEUTRO', 'CHAVEADO'],
      ['TRANSIÇÃO', 'ABERTA', 'BYPASS-ISOLATION', 'NÃO', '', ''],
    ]);
    // The defaults print for a sheet whose config holds no option.
    const plain = printed(blockOf(ctaState().state)).sheet;
    expect(texts(titled(plain, 'CONFIGURAÇÃO'))[1]).toEqual(['TENSÃO', 'BT', 'POLOS', '3', 'NEUTRO', 'SÓLIDO']);
  });

  it('VERIFICAÇÕES GERAIS: the 17 items in caps, the NC row with its observation', () => {
    const { sheet: cta } = printed(blockOf(filled().state));
    const rows = texts(titled(cta, 'VERIFICAÇÕES GERAIS'));
    expect(rows).toHaveLength(2 + 17);
    expect(rows[1]).toEqual(['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
    expect(rows[2]).toEqual(['1. PLACA CONFERE COM O PROJETO', 'X', '', '', '']);
    expect(rows[4]).toEqual(['3. TAMPAS E BARREIRAS FIXADAS, AVISO DE TRANSFERÊNCIA MANUAL PRESENTE', '', 'X', '', 'Aviso de transferência manual ausente na tampa frontal']);
    expect(rows[12]![0]).toBe('11. INTERTRAVAMENTO MECÂNICO E ELÉTRICO N/E');
    expect(rows[18]![0]).toBe('17. GERADOR DEIXADO EM AUTOMÁTICO AO FINAL');
  });

  it('E1: the instrument line, the ACEITÁVEL line with its source, the poles under headers carrying the unit, and the lowest of each side', () => {
    const { state, f } = filled();
    const instrument = { instrument_id: id(800), code: '3M', manufacturer: 'Hi-Tech', model: 'HTMO-10', serial: 'G282926', cert_number: '37276/26', calibrated_at: null, valid_until: null, test_parameter: null };
    const picked = applyOp(state, f.op({ path: sheetTestPath(CTA_BLOCK, E1, 'instrument'), value: instrument }));
    const e1 = titled(printed(blockOf(picked)).sheet, 'E1 · RESISTÊNCIA DE CONTATO');
    expect(texts(e1)).toEqual([
      ['E1 · RESISTÊNCIA DE CONTATO'],
      ['INSTRUMENTO: HTMO-10 · Hi-Tech · Nº SÉRIE G282926 · RBC 37276/26'],
      ['ACEITÁVEL: ≤ 50 % acima do menor do mesmo lado · NETA 7.22.3 (fonte secundária)'],
      ['POLO', 'LADO NORMAL (µΩ)', 'LADO EMERGÊNCIA (µΩ)'],
      ['POLO A', '38', '40'],
      ['POLO B', '41', '39'],
      // The out reading prints as any other: the seeded tables' convention.
      ['POLO C', '36', '63'],
      ['POLO N', '52', '42'],
      ['MENOR DO LADO', '36', '39'],
    ]);
    expect(e1.columns).toHaveLength(3);
    expect(e1.rows[0]).toMatchObject({ band: true, cells: [{ span: 3, shade: true }] });
    expect(e1.rows[1]!.cells[0]).toMatchObject({ span: 3, align: 'left' });
    expect(e1.rows[3]!.header).toBe(true);
    // No instrument picked: the line says so.
    expect(texts(titled(printed(blockOf(state)).sheet, 'E1 · RESISTÊNCIA DE CONTATO'))[1]).toEqual(['INSTRUMENTO: -']);
  });

  it('E2 and E3: GΩ in the headers, the fixed cells as written, the criterion of the tensão', () => {
    const { sheet: cta } = printed(blockOf(filled().state));
    const e2 = texts(titled(cta, 'E2 · ISOLAMENTO PRINCIPAL'));
    expect(e2.slice(0, 5)).toEqual([
      ['E2 · ISOLAMENTO PRINCIPAL'],
      ['INSTRUMENTO: -'],
      ['ACEITÁVEL: 1.000 Vcc · ≥ 100 MΩ · NETA tabela 100.1 (fonte secundária)'],
      ['MEDIÇÃO', 'NORMAL FECHADA (GΩ)', 'EMERGÊNCIA FECHADA (GΩ)', 'ABERTA (GΩ)'],
      ['A-T', '12,4', '12,4', '12,4'],
    ]);
    expect(e2.map((row) => row[0]).slice(4)).toEqual(['A-T', 'B-T', 'C-T', 'N-T', 'A-B', 'B-C', 'C-A', 'LINHA-CARGA']);
    expect(e2[e2.length - 1]).toEqual(['LINHA-CARGA', '—', '—', '12,4']);
    expect(texts(titled(cta, 'E3 · ISOLAMENTO DO CONTROLE'))).toEqual([
      ['E3 · ISOLAMENTO DO CONTROLE'],
      ['INSTRUMENTO: -'],
      ['ACEITÁVEL: 500 Vcc (fiação de 300 V) ou 1.000 Vcc (600 V) · ≥ 2 MΩ, com o chicote do controlador desconectado · NETA 7.22.3 (fonte secundária); manual do fabricante'],
      ['MEDIÇÃO', 'VALOR (MΩ)'],
      ['FIAÇÃO × TERRA', '850'],
    ]);
    // In MT the line reads the firm's seeded criterion.
    const mt = printed(blockOf(ctaState({ tensao: 'mt' }).state)).sheet;
    expect(texts(titled(mt, 'E2 · ISOLAMENTO PRINCIPAL'))[2]).toEqual(['ACEITÁVEL: >400 MΩ · aceitável na ficha']);
  });

  it('E4: no instrument line, each cell with its own unit, a choice in caps', () => {
    const e4 = texts(titled(printed(blockOf(filled().state)).sheet, 'E4 · AJUSTES DO CONTROLADOR'));
    expect(e4.slice(0, 4)).toEqual([
      ['E4 · AJUSTES DO CONTROLADOR'],
      ['ACEITÁVEL: Deixado = projeto · manual do fabricante do controlador; ficha DTAC (RJ)'],
      ['AJUSTE', 'FÁBRICA', 'PROJETO', 'ENCONTRADO', 'DEIXADO'],
      ['NORMAL · PICKUP DE TENSÃO', '-', '5 %', '5 %', '5 %'],
    ]);
    expect(e4).toHaveLength(3 + 14);
    expect(e4.find((row) => row[0] === 'FALTA DE FASE')).toEqual(['FALTA DE FASE', '-', 'LIGADO', 'LIGADO', 'LIGADO']);
    expect(e4.find((row) => row[0] === 'TD 3A · RETRANSFERÊNCIA')).toEqual(['TD 3A · RETRANSFERÊNCIA', '-', '5 min', '30 min', '30 min']);
    expect(e4.find((row) => row[0] === 'EXERCITADOR')).toEqual(['EXERCITADOR', '-', 'DESLIGADO', 'DESLIGADO', 'DESLIGADO']);
  });

  it('E5: the MÉTODO line beside the times, the fixed Ajuste cells, and the "NA EMERGÊNCIA, COM CARGA" row', () => {
    const { state, f } = filled();
    const loaded = writeSheet(state, f, [
      { test: E5, key: 'tensao', value: { raw: '381', unit: 'V', state: 'measured' } },
      { test: E5, key: 'frequencia', value: { raw: '60.1', unit: 'Hz', state: 'measured' } },
      { test: E5, key: 'corrente', value: { raw: '248', unit: 'A', state: 'measured' } },
    ]);
    const e5 = titled(printed(blockOf(loaded)).sheet, 'E5 · TRANSFERÊNCIA');
    expect(texts(e5)).toEqual([
      ['E5 · TRANSFERÊNCIA'],
      ['MÉTODO: FALTA REAL POR ABERTURA DO DISJUNTOR · CARGA: COM CARGA (62 %) · FONTE DOS TEMPOS: INSTRUMENTO'],
      ['ACEITÁVEL: Assumir a carga ≤ 10 s · NFPA 110 nível 1; OVG, SEDI Goiás, BCB e NFPA 70B A.39.2'],
      ['ETAPA', 'AJUSTE', 'MEDIDO'],
      ['FALHA DA NORMAL ATÉ PARTIDA', '-', '3,2 s'],
      ['ATÉ CARGA NA EMERGÊNCIA', 'limite 10 s', '8,4 s'],
      ['RETRANSFERÊNCIA', '-', '5,0 min'],
      ['RESFRIAMENTO', '-', '5,0 min'],
      ['FALHA DA EMERGÊNCIA', '—', '0,9 s'],
      ['NA EMERGÊNCIA, COM CARGA', '381 V · 60,1 Hz · 248 A'],
    ]);
    expect(e5.rows[9]!.cells[1]).toMatchObject({ span: 2 });
    // Without the load readings the row is not printed.
    expect(texts(titled(printed(blockOf(state)).sheet, 'E5 · TRANSFERÊNCIA'))).toHaveLength(9);
  });

  it('E6: the ambient temperature on its line, the classes in caps, the optional ΔT columns "-" when not typed', () => {
    const e6 = texts(titled(printed(blockOf(filled().state)).sheet, 'E6 · TERMOGRAFIA SOB CARGA'));
    expect(e6.slice(0, 5)).toEqual([
      ['E6 · TERMOGRAFIA SOB CARGA'],
      ['TEMPERATURA AMBIENTE: 27 °C'],
      ['ACEITÁVEL: Classe Normal (ΔT entre similares: 1 a 3 °C possível deficiência, 4 a 15 °C provável, acima de 15 °C grave) · NETA tabela 100.18 (fonte secundária)'],
      ['TERMINAL × FASE', 'TEMPERATURA (°C)', 'ΔT SIMILARES (°C)', 'ΔT AMBIENTE (°C)', 'CLASSE'],
      ['NORMAL · A', '41,2', '-', '-', 'NORMAL'],
    ]);
    expect(e6).toHaveLength(4 + 9);
  });

  it('matrix "Test switched off": a test switched off prints nothing; "Config rows": a hidden row is not printed', () => {
    const { state, f } = filled();
    const off = applyOp(state, f.op({ path: blockFieldPath(CTA_BLOCK, 'config'), value: blockConfigWithSubBlock(blockOf(state).config, E1, false) }));
    expect(bands(printed(blockOf(off)).sheet)).not.toContain('E1 · RESISTÊNCIA DE CONTATO');
    expect(bands(printed(blockOf(off)).sheet)).toContain('E2 · ISOLAMENTO PRINCIPAL');
    const three = printed(blockOf(ctaState({ polos: '3' }).state)).sheet;
    expect(texts(titled(three, 'E1 · RESISTÊNCIA DE CONTATO')).map((row) => row[0])).toEqual(['E1 · RESISTÊNCIA DE CONTATO', 'INSTRUMENTO: -', expect.stringMatching(/^ACEITÁVEL: /), 'POLO', 'POLO A', 'POLO B', 'POLO C']);
    const two = printed(blockOf(ctaState({ polos: '2' }).state)).sheet;
    expect(texts(titled(two, 'E2 · ISOLAMENTO PRINCIPAL')).map((row) => row[0]).slice(4)).toEqual(['A-T', 'B-T', 'A-B', 'LINHA-CARGA']);
    // An empty sheet prints "-" in every typed cell and no lowest-of-column row.
    expect(texts(titled(three, 'E1 · RESISTÊNCIA DE CONTATO')).slice(4)).toEqual([
      ['POLO A', '-', '-'],
      ['POLO B', '-', '-'],
      ['POLO C', '-', '-'],
    ]);
  });

  it('matrix "E5 options": "não realizado" prints the E5 title, the method and the criterion, and no time', () => {
    const { state, f } = filled();
    const skipped = writeSheet(state, f, [{ test: E5, key: 'metodo', value: choice('nao_realizado') }]);
    expect(texts(titled(printed(blockOf(skipped)).sheet, 'E5 · TRANSFERÊNCIA'))).toEqual([
      ['E5 · TRANSFERÊNCIA'],
      ['MÉTODO: NÃO REALIZADO'],
      ['ACEITÁVEL: Assumir a carga ≤ 10 s · NFPA 110 nível 1; OVG, SEDI Goiás, BCB e NFPA 70B A.39.2'],
    ]);
  });

  it('CONCLUSÃO: the pair marked and the confirmed text with its criteria line', () => {
    const { state, f } = filled();
    let done = applyOp(state, f.op({ path: sheetConclusionPath(CTA_BLOCK, 'result'), value: 'aprovado' }));
    done = applyOp(done, f.op({ path: sheetConclusionPath(CTA_BLOCK, 'restriction'), value: 'com_restricoes' }));
    done = applyOp(done, f.op({ path: sheetObservationsPath(CTA_BLOCK), value: 'Polo C do lado Emergência a investigar.' }));
    const cta = printed(blockOf(done)).sheet;
    expect(bands(cta).slice(-2)).toEqual(['OBSERVAÇÕES', 'CONCLUSÃO']);
    expect(texts(titled(cta, 'CONCLUSÃO'))[1]).toEqual(['APROVADO', 'X', 'REPROVADO', '', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']);
    // No text was confirmed: none prints.
    expect(texts(titled(cta, 'CONCLUSÃO'))).toHaveLength(2);
    expect(cta.parts.some((part) => part.kind === 'paragraph')).toBe(false);
  });

  it('a sheet marked not tested prints its plate and the reason band, with no configuration and no test', () => {
    const { state, f } = filled();
    const notTested = applyOp(state, f.op({ path: blockFieldPath(CTA_BLOCK, 'not_tested'), value: { reason: 'impossibilidade_desligamento', text: null, at: '2026-09-21T12:00:00.000Z', by: blockOf(state).created_by } }));
    const cta = printed(blockOf(notTested)).sheet;
    expect(bands(cta)).toEqual(['DADOS DO EQUIPAMENTO', expect.stringMatching(/^NÃO ENSAIADO — /)]);
  });

  it('under ordem_de_campo the sheet prints in tree order with the same parts', () => {
    const { layout, sheet: cta } = printed(blockOf(filled().state), 'ordem_de_campo');
    expect(layout.subsections.map((s) => s.heading)).toEqual(['9.1 Geradores']);
    expect(layout.subsections[0]!.sheets.map((candidate) => candidate.title)).toEqual(['TRANSFORMADOR DE FORÇA TR-1', 'CHAVE DE TRANSFERÊNCIA AUTOMÁTICA CTA-GER']);
    expect(bands(cta)).toContain('E5 · TRANSFERÊNCIA');
    expect(JSON.stringify(layout)).not.toMatch(/asco/i);
  });
});
