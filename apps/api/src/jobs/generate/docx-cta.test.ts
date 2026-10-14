import {
  applyOp,
  blockConfigWithOption,
  blockConfigWithSubBlock,
  blockFieldPath,
  blockPath,
  buildSnapshot,
  choiceValue,
  conclusionTextOnConclude,
  defaultBlockConfig,
  entityKey,
  getDefinition,
  layoutSpec,
  makeOp,
  newEquipmentBlock,
  replay,
  sheetChecklistPath,
  sheetConclusionPath,
  sheetNameplatePath,
  sheetTestCellPath,
  sheetTestValuePath,
  type BlockRow,
  type EntityKey,
  type EntityRow,
  type EntityState,
  type JsonValue,
  type LocationRow,
  type MeasurementTest,
  type RelatorioSnapshot,
} from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { describe, expect, it } from 'vitest';
import { buildDocx, TOC_PLACEHOLDER } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * Story 14.5: section 9 of the DOCX with a library type. A relatório on seed v5 with one local
 * ("Geradores", grouped by type) holding a transformer and a Chave de transferência
 * automática filled on site is rendered and read back from its own headings: the "Outros
 * equipamentos" group after the Transformadores group of the same local, and the sheet's
 * plate, CONFIGURAÇÃO, checklist, measurement tables and conclusion. The renderer draws the
 * kernel's `PrintTable`s as they come; every string asserted here is the kernel's
 * (`packages/domain/src/print/section-9.ts`, pinned by `measurement-print.test.ts`). No
 * database and no LibreOffice: the sheet is folded with `applyOp`, as a device writes it.
 */

const ISSUED_AT = '2026-09-23T12:00:00.000Z';
const SECTION_9 = '9 RELATÓRIOS DOS ENSAIOS';
const CTA = 'chave_transferencia_automatica';
const E1 = 'cta_resistencia_contato';
const E2 = 'cta_isolamento_principal';
const E3 = 'cta_isolamento_controle';
const E4 = 'cta_ajustes_controlador';
const E5 = 'cta_transferencia';
const E6 = 'cta_termografia';
const CTA_TAG = 'CTA-GERADORES';
const CTA_TITLE = `CHAVE DE TRANSFERÊNCIA AUTOMÁTICA ${CTA_TAG}`;
const TRANSFORMADORES = '9.1 Transformadores e Cabos de Alimentação dos Geradores';
const OUTROS = '9.2 Outros equipamentos dos Geradores';
const NC_OBSERVATION = 'Aviso de transferência manual ausente na tampa frontal';
// The paragraph and the criteria line the kernel composes for the sheet filled below (`composeConclusion`):
// the pole out on E1, the setting left different on E4 and the NC item, then the recommendation.
const CONCLUSION_TEXT =
  'A chave de transferência automática CTA-GERADORES (Dalvenor, 440 V, 400 A) apresentou resistência de contato fora do critério em Polo C, Lado Emergência (63 µΩ; critério: ≤ 50 % acima do menor do mesmo lado, NETA 7.22.3 (fonte secundária)) e ajustes do controlador fora do critério em TD 3A · retransferência, Deixado (30 min; critério: Deixado = projeto, manual do fabricante do controlador; ficha DTAC (RJ)) e Aviso de transferência manual ausente na tampa frontal (item 3, NC). Recomenda-se a correção dos pontos indicados antes da próxima manutenção.';
const CRITERIA_LINE = 'E1 Polo C, Lado Emergência 63 µΩ · critério ≤ 50 % acima do menor do mesmo lado · E4 TD 3A · retransferência, Deixado 30 min · critério Deixado = projeto · item 3 NC';

const id = (n: number) => `019966b0-0149-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = id(1);
const CTA_BLOCK = id(1001);
const CTA_EQUIPMENT = id(2001);

const definition = getDefinition('v5', 'cabine_primaria', CTA);
const testOf = (key: string): MeasurementTest => definition.measurement_tests!.find((test) => test.key === key)!;
const rowOf = (testKey: string, rowKey: string) => testOf(testKey).rows.findIndex((row) => row.key === rowKey);
const colOf = (testKey: string, columnKey: string) => testOf(testKey).columns.findIndex((column) => column.key === columnKey);
const num = (raw: string, unit: string | null): JsonValue => ({ raw, unit, state: 'measured' });
const cellPath = (testKey: string, rowKey: string, columnKey: string) => sheetTestCellPath(CTA_BLOCK, testKey, rowOf(testKey, rowKey), colOf(testKey, columnKey));

function base(): RelatorioSnapshot {
  return buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
}

/** Every put of a sheet filled on site at four poles: one item NC, one pole out on E1, one setting left different on E4. */
function filledWrites(): [string, JsonValue][] {
  const writes: [string, JsonValue][] = [];
  const nameplate: Record<string, JsonValue> = {
    identificacao: 'CTA-01',
    fabricante: 'Dalvenor',
    serie: 'TRX-300',
    n_de_catalogo: 'TRX3-0400-N4',
    n_de_serie: 'CT-448120',
    tag: CTA_TAG,
    ano: '2021',
    tensao_nominal: num('440', 'V'),
    corrente_nominal: num('400', 'A'),
    frequencia: num('60', 'Hz'),
    wcr: num('42', 'kA'),
    protecao_a_montante: 'Disjuntor 400 A',
    controlador_e_firmware: 'CG-7 v2.14',
    involucro: 'IP54',
    torque_dos_terminais: num('45', 'N·m'),
  };
  for (const field of definition.nameplate) writes.push([sheetNameplatePath(CTA_BLOCK, field.key), nameplate[field.key]!]);
  definition.checklist!.forEach((item, index) => {
    writes.push([sheetChecklistPath(CTA_BLOCK, item.key, 'result'), index === 2 ? 'NC' : 'C']);
    if (index === 2) writes.push([sheetChecklistPath(CTA_BLOCK, item.key, 'observation'), NC_OBSERVATION]);
  });
  // Lado Normal all within; on Lado Emergência the 63 of Polo C is 62 % above the 39 of Polo B.
  const e1: Record<string, [string, string]> = { polo_a: ['38', '40'], polo_b: ['41', '39'], polo_c: ['36', '63'], polo_n: ['52', '42'] };
  for (const [row, [normal, emergencia]] of Object.entries(e1)) {
    writes.push([cellPath(E1, row, 'lado_normal'), num(normal, 'µΩ')], [cellPath(E1, row, 'lado_emergencia'), num(emergencia, 'µΩ')]);
  }
  // 2026-10-14 (Bruno): E1's test current.
  writes.push([sheetTestValuePath(CTA_BLOCK, E1, 'corrente_ensaio'), num('100', 'A')]);
  for (const row of testOf(E2).rows) {
    for (const column of testOf(E2).columns) if (row.fixed?.[column.key] === undefined) writes.push([cellPath(E2, row.key, column.key), num('12.4', 'GΩ')]);
  }
  writes.push([cellPath(E3, 'fiacao_terra', 'valor'), num('850', 'MΩ')]);
  for (const row of testOf(E4).rows) {
    for (const column of ['projeto', 'encontrado', 'deixado']) {
      // TD 3A found and left at 30 min, against the project's 5.
      const raw = row.key === 'td_3a' && column !== 'projeto' ? '30' : '5';
      writes.push([cellPath(E4, row.key, column), row.kind === 'choice' ? choiceValue(row.options![0]!.key) : num(raw, row.unit ?? null)]);
    }
  }
  const values: Record<string, JsonValue> = {
    metodo: choiceValue('falta_real'),
    carga: choiceValue('com_carga'),
    carga_percentual: num('62', '%'),
    fonte_tempos: choiceValue('instrumento'),
    tensao: num('381', 'V'),
    frequencia: num('60.1', 'Hz'),
    corrente: num('248', 'A'),
  };
  for (const [key, value] of Object.entries(values)) writes.push([sheetTestValuePath(CTA_BLOCK, E5, key), value]);
  const medidos: Record<string, JsonValue> = {
    falha_da_normal_ate_partida: num('3.2', 's'),
    ate_carga_na_emergencia: num('8.4', 's'),
    retransferencia: num('5.0', 'min'),
    resfriamento: num('5.0', 'min'),
    falha_da_emergencia: num('0.9', 's'),
  };
  for (const [row, value] of Object.entries(medidos)) writes.push([cellPath(E5, row, 'medido'), value]);
  for (const row of testOf(E6).rows) writes.push([cellPath(E6, row.key, 'temperatura'), num('41.2', '°C')], [cellPath(E6, row.key, 'classe'), choiceValue('normal')]);
  writes.push([sheetTestValuePath(CTA_BLOCK, E6, 'temperatura_ambiente'), num('27', '°C')]);
  return writes;
}

/**
 * The Porto Seguro snapshot moved to seed v5 with its tree replaced: one local, "Geradores"
 * (grouped by type), holding a transformer and, unless `cta` is false, the filled Chave de
 * transferência automática; `off` switches those tests off after the sheet was filled.
 */
function snapshotOf(options: { cta?: boolean; off?: readonly (typeof E1 | typeof E6)[]; e5NotRun?: boolean } = {}): RelatorioSnapshot {
  const snapshot = base();
  const relatorio = { ...snapshot.relatorio, seed_version: 'v5', export: { scheme: 'por_local_e_tipo' as const } };
  const local: LocationRow = {
    id: LOCAL,
    relatorio_id: relatorio.id,
    parent_id: null,
    kind: 'cabine',
    name: 'Geradores',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: true,
  };
  const transformer = newEquipmentBlock({
    blockId: id(1002),
    equipmentId: id(2002),
    relatorioId: relatorio.id,
    projectId: relatorio.project_id,
    locationId: LOCAL,
    type: 'transformador_forca',
    tag: 'TR-1',
    seedVersion: 'v5',
    orderKey: 'a0',
  });
  // Four poles and a switched neutral: every row of every table prints.
  let config = defaultBlockConfig('v5', CTA) as unknown as JsonValue;
  config = blockConfigWithOption(config, 'polos', '4');
  config = blockConfigWithOption(config, 'neutro', 'chaveado');
  const cta = newEquipmentBlock({ blockId: CTA_BLOCK, equipmentId: CTA_EQUIPMENT, relatorioId: relatorio.id, projectId: relatorio.project_id, locationId: LOCAL, type: CTA, tag: CTA_TAG, seedVersion: 'v5', orderKey: 'a1', config });

  // The sheet as a device writes it: the block create, then one put per value, folded by the only reducer.
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
    [entityKey('equipment', CTA_EQUIPMENT), cta.equipment],
  ]);
  const blockOf = (): BlockRow => state.get(entityKey('block', CTA_BLOCK)) as BlockRow;
  state = applyOp(state, op('create', blockPath(CTA_BLOCK), cta.block as unknown as JsonValue));
  for (const [path, value] of filledWrites()) state = applyOp(state, op('put', path, value));
  state = applyOp(state, op('put', sheetConclusionPath(CTA_BLOCK, 'result'), 'aprovado'));
  state = applyOp(state, op('put', sheetConclusionPath(CTA_BLOCK, 'restriction'), 'com_restricoes'));
  // "Concluir ficha" confirms the composed text with the pair (`conclusionTextOnConclude`).
  const confirmed = conclusionTextOnConclude(blockOf(), definition, CTA_TAG)!;
  state = applyOp(state, op('put', sheetConclusionPath(CTA_BLOCK, 'text'), confirmed.text));
  state = applyOp(state, op('put', sheetConclusionPath(CTA_BLOCK, 'text_status'), 'confirmed'));
  state = applyOp(state, op('put', sheetConclusionPath(CTA_BLOCK, 'text_basis'), confirmed.basis));
  for (const key of options.off ?? []) state = applyOp(state, op('put', blockFieldPath(CTA_BLOCK, 'config'), blockConfigWithSubBlock(blockOf().config, key, false)));
  if (options.e5NotRun === true) state = applyOp(state, op('put', sheetTestValuePath(CTA_BLOCK, E5, 'metodo'), choiceValue('nao_realizado')));

  const sheets = options.cta === false ? [transformer] : [transformer, { block: blockOf(), equipment: cta.equipment }];
  return {
    ...snapshot,
    relatorio,
    locations: [local],
    // The section blocks stay, so the document keeps its eleven sections.
    blocks: [...snapshot.blocks.filter((block) => block.location_id === null), ...sheets.map((sheet) => sheet.block)],
    equipment: sheets.map((sheet) => sheet.equipment),
    files: snapshot.files.filter((file) => file.kind !== 'photo'),
    points: [],
    suggestions: [],
  };
}

async function render(snapshot: RelatorioSnapshot) {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  const structure = extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
  // Everything is read from section 9's own heading on, up to the next section's.
  const from = structure.paragraphs.lastIndexOf(SECTION_9);
  const to = structure.paragraphs.findIndex((p, i) => i > from && p.startsWith('10 CONCLUSÃO'));
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  /** The tables whose title band reads `title`. */
  const titled = (title: string) => structure.tables.filter((table) => table[0]?.[0] === title);
  return { structure, section: structure.paragraphs.slice(from, to), titled };
}

const order = (section: readonly string[], texts: readonly string[]) => texts.map((text) => section.indexOf(text));
const ascending = (indexes: readonly number[]) => indexes.every((at, i) => at > -1 && (i === 0 || at > indexes[i - 1]!));

/** The one render of the filled sheet, shared by the tests that only read it. */
let filled: ReturnType<typeof render> | null = null;
const renderFilled = () => (filled ??= render(snapshotOf()));

describe('14.5-UNIT section 9 in the DOCX: a Chave de transferência automática under "Outros equipamentos"', () => {
  it('the "Outros equipamentos" group is a Heading 2 after the Transformadores group of the same local, and a line of the ÍNDICE', async () => {
    const { structure, section } = await renderFilled();
    expect(ascending(order(section, [SECTION_9, TRANSFORMADORES, 'TRANSFORMADOR DE FORÇA TR-1', OUTROS, CTA_TITLE]))).toBe(true);
    expect(structure.headings.filter((h) => h.level === 2)).toEqual([
      { level: 2, text: TRANSFORMADORES },
      { level: 2, text: OUTROS },
    ]);
    const toc = structure.paragraphs.filter((p) => p.endsWith(`\t${TOC_PLACEHOLDER}`));
    expect(toc.filter((p) => p.startsWith('9.'))).toEqual([`${TRANSFORMADORES}\t${TOC_PLACEHOLDER}`, `${OUTROS}\t${TOC_PLACEHOLDER}`]);
    // Story 14.4 (seed v4 or later): the local prints its own parts once, under its first heading and before
    // any sheet (SE, environment, the site table); the "Outros equipamentos" group repeats none of them.
    for (const title of ['CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', 'VERIFICAÇÕES DO LOCAL']) expect(section.filter((p) => p === title), title).toHaveLength(1);
    expect(ascending(order(section, [TRANSFORMADORES, 'CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', 'VERIFICAÇÕES DO LOCAL', 'TRANSFORMADOR DE FORÇA TR-1', OUTROS, CTA_TITLE]))).toBe(true);
  }, 60_000);

  it('the sheet prints its parts in order: the plate, CONFIGURAÇÃO, the checklist, E1 to E6 and the conclusion', async () => {
    const { section } = await renderFilled();
    const sheet = section.slice(section.indexOf(CTA_TITLE));
    expect(
      ascending(
        order(sheet, [
          CTA_TITLE,
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
        ]),
      ),
    ).toBe(true);
  }, 60_000);

  it('DADOS DO EQUIPAMENTO holds the 15 fields, three pairs a row, and CONFIGURAÇÃO the five options in force', async () => {
    const { titled } = await renderFilled();
    // The transformer's plate and the CTA's: the CTA's is the one that names a FABRICANTE.
    const plate = titled('DADOS DO EQUIPAMENTO').find((table) => table[1]?.[2] === 'FABRICANTE');
    expect(plate).toEqual([
      ['DADOS DO EQUIPAMENTO'],
      ['IDENTIFICAÇÃO', 'CTA-01', 'FABRICANTE', 'Dalvenor', 'SÉRIE', 'TRX-300'],
      ['Nº DE CATÁLOGO', 'TRX3-0400-N4', 'Nº DE SÉRIE', 'CT-448120', 'TAG', CTA_TAG],
      ['ANO', '2021', 'TENSÃO NOMINAL', '440 V', 'CORRENTE NOMINAL', '400 A'],
      ['FREQUÊNCIA', '60 Hz', 'WCR', '42 kA', 'PROTEÇÃO A MONTANTE', 'Disjuntor 400 A'],
      ['CONTROLADOR E FIRMWARE', 'CG-7 v2.14', 'INVÓLUCRO', 'IP54', 'TORQUE DOS TERMINAIS', '45 N·m'],
    ]);
    expect(titled('CONFIGURAÇÃO')).toEqual([
      [['CONFIGURAÇÃO'], ['TENSÃO', 'BT', 'POLOS', '4', 'NEUTRO', 'CHAVEADO'], ['TRANSIÇÃO', 'ABERTA', 'BYPASS-ISOLATION', 'NÃO', '', '']],
    ]);
  }, 60_000);

  it('VERIFICAÇÕES GERAIS holds the 17 items, the NC row with its observation', async () => {
    const { titled } = await renderFilled();
    // The transformer's checklist and the CTA's: the CTA's opens with the plate item.
    const checklist = titled('VERIFICAÇÕES GERAIS').find((table) => table[2]?.[0] === '1. PLACA CONFERE COM O PROJETO');
    expect(checklist).toHaveLength(2 + 17);
    expect(checklist![1]).toEqual(['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
    expect(checklist![2]).toEqual(['1. PLACA CONFERE COM O PROJETO', 'X', '', '', '']);
    expect(checklist![4]).toEqual(['3. TAMPAS E BARREIRAS FIXADAS, AVISO DE TRANSFERÊNCIA MANUAL PRESENTE', '', 'X', '', NC_OBSERVATION]);
    expect(checklist![18]).toEqual(['17. GERADOR DEIXADO EM AUTOMÁTICO AO FINAL', 'X', '', '', '']);
    // Sixteen conformes and one NC, no row left unanswered.
    expect(checklist!.slice(2).filter((row) => row[1] === 'X')).toHaveLength(16);
    expect(checklist!.slice(2).filter((row) => row[2] === 'X')).toHaveLength(1);
  }, 60_000);

  it('E1 prints its instrument and ACEITÁVEL lines, the four poles and the lowest of each side', async () => {
    const { titled } = await renderFilled();
    expect(titled('E1 · RESISTÊNCIA DE CONTATO')).toEqual([
      [
        ['E1 · RESISTÊNCIA DE CONTATO'],
        ['INSTRUMENTO: -'],
        ['CORRENTE DE ENSAIO: 100 A'],
        ['ACEITÁVEL: ≤ 50 % acima do menor do mesmo lado · NETA 7.22.3 (fonte secundária)'],
        ['POLO', 'LADO NORMAL (µΩ)', 'LADO EMERGÊNCIA (µΩ)'],
        ['POLO A', '38', '40'],
        ['POLO B', '41', '39'],
        // The out reading prints as any other: the seeded tables' convention.
        ['POLO C', '36', '63'],
        ['POLO N', '52', '42'],
        ['MENOR DO LADO', '36', '39'],
      ],
    ]);
  }, 60_000);

  it('E5 prints the method line beside the times, the fixed Ajuste cells and the readings under load', async () => {
    const { titled } = await renderFilled();
    expect(titled('E5 · TRANSFERÊNCIA')).toEqual([
      [
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
      ],
    ]);
  }, 60_000);

  it('E2, E3, E4 and E6 print as one table each, with the fixed cells, each row\'s own unit and the classes in caps', async () => {
    const { titled } = await renderFilled();
    const [e2, ...moreE2] = titled('E2 · ISOLAMENTO PRINCIPAL');
    expect(moreE2).toEqual([]);
    expect(e2!.slice(0, 5)).toEqual([
      ['E2 · ISOLAMENTO PRINCIPAL'],
      ['INSTRUMENTO: -'],
      ['ACEITÁVEL: 1.000 Vcc · ≥ 100 MΩ · NETA tabela 100.1 (fonte secundária)'],
      ['MEDIÇÃO', 'NORMAL FECHADA (GΩ)', 'EMERGÊNCIA FECHADA (GΩ)', 'ABERTA (GΩ)'],
      ['A-T', '12,4', '12,4', '12,4'],
    ]);
    expect(e2!.at(-1)).toEqual(['LINHA-CARGA', '—', '—', '12,4']);
    // C1: four poles and a switched neutral, and no N-T row (2026-10-14).
    expect(e2!.slice(4).map((row) => row[0])).toEqual(['A-T', 'B-T', 'C-T', 'A-B', 'B-C', 'C-A', 'LINHA-CARGA']);
    expect(titled('E3 · ISOLAMENTO DO CONTROLE')).toEqual([
      [
        ['E3 · ISOLAMENTO DO CONTROLE'],
        ['INSTRUMENTO: -'],
        ['ACEITÁVEL: 500 Vcc (fiação de 300 V) ou 1.000 Vcc (600 V) · ≥ 2 MΩ, com o chicote do controlador desconectado · NETA 7.22.3 (fonte secundária); manual do fabricante'],
        ['MEDIÇÃO', 'VALOR (MΩ)'],
        ['FIAÇÃO × TERRA', '850'],
      ],
    ]);
    const [e4] = titled('E4 · AJUSTES DO CONTROLADOR');
    expect(e4).toHaveLength(3 + 14);
    expect(e4!.slice(0, 4)).toEqual([
      ['E4 · AJUSTES DO CONTROLADOR'],
      ['ACEITÁVEL: Deixado = projeto · manual do fabricante do controlador; ficha DTAC (RJ)'],
      ['AJUSTE', 'FÁBRICA', 'PROJETO', 'ENCONTRADO', 'DEIXADO'],
      ['NORMAL · PICKUP DE TENSÃO', '-', '5 %', '5 %', '5 %'],
    ]);
    expect(e4!.find((row) => row[0] === 'TD 3A · RETRANSFERÊNCIA')).toEqual(['TD 3A · RETRANSFERÊNCIA', '-', '5 min', '30 min', '30 min']);
    expect(e4!.find((row) => row[0] === 'FALTA DE FASE')).toEqual(['FALTA DE FASE', '-', 'LIGADO', 'LIGADO', 'LIGADO']);
    const [e6] = titled('E6 · TERMOGRAFIA SOB CARGA');
    expect(e6).toHaveLength(4 + 9);
    expect(e6!.slice(0, 5)).toEqual([
      ['E6 · TERMOGRAFIA SOB CARGA'],
      ['TEMPERATURA AMBIENTE: 27 °C'],
      ['ACEITÁVEL: Classe Normal (ΔT entre similares: 1 a 3 °C possível deficiência, 4 a 15 °C provável, acima de 15 °C grave) · NETA tabela 100.18 (fonte secundária)'],
      ['TERMINAL × FASE', 'TEMPERATURA (°C)', 'ΔT SIMILARES (°C)', 'ΔT AMBIENTE (°C)', 'CLASSE'],
      ['NORMAL · A', '41,2', '-', '-', 'NORMAL'],
    ]);
  }, 60_000);

  it('CONCLUSÃO marks the pair and prints the confirmed paragraph, with its criteria line beneath the table', async () => {
    const { titled, section } = await renderFilled();
    // The transformer's conclusion (an empty pair) and, after it, the CTA's.
    const conclusion = titled('CONCLUSÃO').at(-1);
    expect(conclusion).toHaveLength(3);
    expect(conclusion![1]).toEqual(['APROVADO', 'X', 'REPROVADO', '', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']);
    expect(conclusion![2]).toEqual([CONCLUSION_TEXT]);
    expect(section.filter((p) => p === CONCLUSION_TEXT)).toHaveLength(1);
    // The criteria line is the paragraph right under the table, the last of the sheet.
    const sheet = section.slice(section.indexOf(CTA_TITLE));
    expect(sheet.slice(sheet.indexOf(CONCLUSION_TEXT) + 1).filter((p) => p !== '')).toEqual([CRITERIA_LINE]);
    expect(ascending(order(sheet, [CTA_TITLE, 'CONCLUSÃO', CONCLUSION_TEXT, CRITERIA_LINE]))).toBe(true);
  }, 60_000);

  it('a test switched off prints nothing: no table, no line and no off note, and its neighbours stay', async () => {
    const { titled, section } = await render(snapshotOf({ off: [E1, E6] }));
    expect(titled('E1 · RESISTÊNCIA DE CONTATO')).toEqual([]);
    expect(titled('E6 · TERMOGRAFIA SOB CARGA')).toEqual([]);
    const sheet = section.slice(section.indexOf(CTA_TITLE));
    expect(sheet.some((p) => p.includes('RESISTÊNCIA DE CONTATO') || p.includes('TERMOGRAFIA') || p.includes('MENOR DO LADO') || p.includes('TEMPERATURA AMBIENTE'))).toBe(false);
    for (const test of [testOf(E1), testOf(E6)]) expect(sheet.some((p) => p.includes(test.switchable!.off_note))).toBe(false);
    expect(sheet.some((p) => /marque NA/i.test(p))).toBe(false);
    expect(titled('E2 · ISOLAMENTO PRINCIPAL')).toHaveLength(1);
    expect(titled('E5 · TRANSFERÊNCIA')).toHaveLength(1);
    // The group, the sheet and its other parts are untouched.
    expect(ascending(order(section, [OUTROS, CTA_TITLE]))).toBe(true);
    expect(ascending(order(sheet, [CTA_TITLE, 'DADOS DO EQUIPAMENTO', 'CONFIGURAÇÃO', 'VERIFICAÇÕES GERAIS', 'E2 · ISOLAMENTO PRINCIPAL', 'E3 · ISOLAMENTO DO CONTROLE', 'E4 · AJUSTES DO CONTROLADOR', 'E5 · TRANSFERÊNCIA', 'CONCLUSÃO']))).toBe(true);
    // The values changed under the confirmed conclusion text (two tests left it), so it is stale and does not print (AR-11).
    expect(titled('CONCLUSÃO').at(-1)).toHaveLength(2);
    expect(section).not.toContain(CONCLUSION_TEXT);
  }, 60_000);

  it('C3: E5 "Não realizado" prints nothing of E5 (no title, method or criterion line), and E6 keeps its title', async () => {
    const { titled, section } = await render(snapshotOf({ e5NotRun: true }));
    expect(titled('E5 · TRANSFERÊNCIA')).toEqual([]);
    const sheet = section.slice(section.indexOf(CTA_TITLE));
    expect(sheet.some((p) => p.includes('NÃO REALIZADO') || p.includes('Assumir a carga') || p.startsWith('E5 '))).toBe(false);
    expect(titled('E6 · TERMOGRAFIA SOB CARGA')).toHaveLength(1);
  }, 60_000);

  it('a relatório with no such equipment has no "Outros equipamentos" heading, band or ÍNDICE line', async () => {
    const { structure, section } = await render(snapshotOf({ cta: false }));
    expect(structure.headings.filter((h) => h.level === 2)).toEqual([{ level: 2, text: TRANSFORMADORES }]);
    expect(structure.paragraphs.some((p) => p.includes('Outros equipamentos'))).toBe(false);
    expect(section).toContain('TRANSFORMADOR DE FORÇA TR-1');
    expect(section.some((p) => p === 'CONFIGURAÇÃO' || p.startsWith('CHAVE DE TRANSFERÊNCIA'))).toBe(false);
  }, 60_000);
});
