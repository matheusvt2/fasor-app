import type { BaseEquipmentBlockType } from '../schemas/block-config.ts';
import { NETA_100_1, NETA_100_5 } from './criteria-tables.ts';
import type { MeasurementTest } from './measurement.ts';
import type { BlockDefinition, FieldDef, ReportSeed, TestDef } from './schema.ts';
import { CABINE_PRIMARIA_V12 } from './v12.ts';

/*
 * Seed version 13 (Epic 23, Bruno's test base rev08 and Matheus's decisions of 2026-11-08): seed v12
 * plus, story by story, the keys that make the base what new relatórios are judged by. Every new
 * behaviour is reached through a v13 definition key, so a definition of v1 to v12 reads as before in
 * every reader (AD-21); no relatório migrates its seed.
 *
 * Batch e23a's first commit opens v13 equal to v12 (the version only), so batch e23b stacks on it.
 *
 * Derived from v12 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V12_HASH`).
 */

const v12 = CABINE_PRIMARIA_V12;

// --- batch e23a: Stories 23.2 and 23.4 (criteria from the NETA tables, the instrument-limit note) ---

type CriterionTableKey = NonNullable<TestDef['criterion_table']>;

/**
 * Story 23.2: the insulation test of each type the NETA tables judge, and how its rows pick their
 * row: the transformador de força by the winding each row tests and its medium (base rev08 TR-OL-02,
 * TR-SE-02), the TC by its primary voltage and medium (TC-02), the disjuntor, the seccionadora and
 * the para-raio by their class voltage (DJ-02, SC-02, PR-02). The TP (open item B-4) and the cables
 * (CB-02) keep the seeded criterion.
 */
const CRITERION_TABLES: Partial<Record<BaseEquipmentBlockType, () => CriterionTableKey>> = {
  transformador_forca: () => ({ table: structuredClone(NETA_100_5), voltage: 'winding', medium: 'oil_rule' }),
  tc: () => ({ table: structuredClone(NETA_100_5), voltage: { field: 'tensao_nominal_at' }, medium: 'oil_rule' }),
  disjuntor_mt: () => ({ table: structuredClone(NETA_100_1), voltage: { field: 'tensao_nominal' } }),
  chave_seccionadora: () => ({ table: structuredClone(NETA_100_1), voltage: { field: 'tensao_de_placa' } }),
  para_raio: () => ({ table: structuredClone(NETA_100_1), voltage: { field: 'tensao_nominal' } }),
};

/** Story 23.4: the eight FO.SERV-03 types whose insulation test prints the instrument-limit note (not the QGBT types). */
const LIMIT_NOTE_TYPES: readonly BaseEquipmentBlockType[] = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca'];

/** The type's insulation test with its v13 keys; the other tests as they were. */
function insulationV13(type: BaseEquipmentBlockType, definition: BlockDefinition): BlockDefinition {
  const table = CRITERION_TABLES[type];
  const note = LIMIT_NOTE_TYPES.includes(type);
  const tests = definition.tests.map((test): TestDef => {
    if (test.key !== 'isolacao') return test;
    return { ...test, ...(table === undefined ? {} : { criterion_table: table() }), ...(note ? { instrument_limit_note: true as const } : {}) };
  });
  return { ...definition, tests };
}


// --- e23b: Stories 23.7 to 23.9 ---------------------------------------------------------------
/*
 * Story 23.7 (decision K; Base rev08 `equipamentos[].campos` of TR-OL, TR-SE, DJ, SC, TP, TC, PR
 * and CB, each field naming its base key): the nameplate fields the tests depend on. Labels and
 * select options are upper-case pt-BR, as FO.SERV-03 prints them (MATERIAL DO ENROLAMENTO's "Cu"
 * and "Al" as the story writes them); required or optional follows the base's `obrigatorio`, but
 * both equipment temperatures are optional (Story 23.5 falls back to the ambient, decision B).
 * Fields a type gains are appended after v12's, so every v12 field keeps its place; the
 * transformer's text TAP ATUAL gives way in place to TAPS and a numeric TAP ATUAL (a new key, so
 * no copy chip carries v12's text into a number), and its new fields follow DESLOCAMENTO ANGULAR.
 * Kept as the product has them: kV on the AT, a date instead of a year, "AR" and "Outro" in the
 * extinction medium. Out: TIPO DE ISOLAÇÃO's "ÓLEO ISOLANTE" and the liquid fields (Story 23.17),
 * the TC's function (Story 23.18), the capacitor (out of the epic).
 *
 * Story 23.8: the transformer's ratio table takes one row per tap of TAPS (`rows_from`,
 * `relatorio/tap-rows.ts`).
 *
 * Story 23.9: the keys `applies_when` and `initial_off` exist (`seed/schema.ts`), and no seeded
 * test carries them: the base rows of every v13 test apply unconditionally (Base rev08 TR-OL-02
 * and -04, DJ-02 and -03, SC-02 and -03, TC-02 and -03, TP-02 and -03, PR-02, CB-02); Stories
 * 23.15 to 23.21 attach theirs.
 */

const optionalNumber = (key: string, label: string, unit?: string): FieldDef => ({ key, label, kind: 'number', ...(unit === undefined ? {} : { unit }), optional: true });
const requiredSelect = (key: string, label: string, options: string[]): FieldDef => ({ key, label, kind: 'select', options });

// The transformador de força (TR-OL, TR-SE).
/** TAPS (`taps_V`): the plate's whole list of taps, in kV like the AT, in plate order. */
const TAPS: FieldDef = { key: 'taps', label: 'TAPS', kind: 'number', unit: 'kV', list: true };
/** TAP ATUAL (`tap_atual_V`): the tap in service, picked from TAPS (a plain kV number while TAPS is empty). */
const TAP_ATUAL: FieldDef = { key: 'tap_atual_kv', label: 'TAP ATUAL', kind: 'number', unit: 'kV', pick_from: TAPS.key };
/** The fields after DESLOCAMENTO ANGULAR: IMPEDÂNCIA, MATERIAL DO ENROLAMENTO, the two temperatures and CLASSE TÉRMICA. */
const TEMPERATURA_DO_OLEO = optionalNumber('temperatura_oleo_c', 'TEMPERATURA DO ÓLEO', '°C');
const TEMPERATURA_DO_ENROLAMENTO = optionalNumber('temperatura_enrolamento_c', 'TEMPERATURA DO ENROLAMENTO', '°C');
const CLASSE_TERMICA: FieldDef = { ...requiredSelect('classe_termica', 'CLASSE TÉRMICA', ['B (130)', 'F (155)', 'H (180)']), optional: true };
const TRANSFORMER_AFTER_GROUP: readonly FieldDef[] = [
  optionalNumber('impedancia_pct', 'IMPEDÂNCIA', '%'),
  requiredSelect('material_enrolamento', 'MATERIAL DO ENROLAMENTO', ['Cu', 'Al']),
  TEMPERATURA_DO_OLEO,
  TEMPERATURA_DO_ENROLAMENTO,
  CLASSE_TERMICA,
];

// Disjuntor MT (DJ): appended after AJ. RELÉ 50/51.
const DISJUNTOR_FIELDS: readonly FieldDef[] = [
  requiredSelect('tipo_montagem', 'MONTAGEM', ['EXTRAÍVEL', 'FIXO']),
  // The base types it as text ("125 Vcc", "220 Vca").
  { key: 'tensao_comando_v', label: 'TENSÃO DE COMANDO', kind: 'text' },
  requiredSelect('acionamento', 'ACIONAMENTO', ['MOLA MOTORIZADA', 'MOLA MANUAL', 'MAGNÉTICO']),
  optionalNumber('contador_operacoes', 'CONTADOR DE OPERAÇÕES'),
  // Plate fields for wave 2's timing test (decision G): they judge nothing in this epic.
  optionalNumber('tempo_abertura_fab_ms', 'TEMPO DE ABERTURA DO FABRICANTE', 'ms'),
  optionalNumber('tempo_fechamento_fab_ms', 'TEMPO DE FECHAMENTO DO FABRICANTE', 'ms'),
];

// Chave seccionadora (SC): ACIONAMENTO gains MOTORIZADO in place; two fields appended after DATA DE FABRICAÇÃO.
const MOTORIZADO = 'MOTORIZADO';
const SECCIONADORA_FIELDS: readonly FieldDef[] = [
  requiredSelect('tipo_seccionadora', 'TIPO DE SECCIONADORA', ['SEM CARGA', 'SOB CARGA (INTERRUPTORA)', 'SOB CARGA COM FUSÍVEIS', 'CHAVE DE ATERRAMENTO']),
  optionalNumber('fusivel_corrente_a', 'CORRENTE DO FUSÍVEL', 'A'),
];

// TP: TENSÃO NOMINAL AT and BT take "N/√3"; the NBR 6855 group appended after EXATIDÃO.
const TP_SQRT3_FIELDS: readonly string[] = ['tensao_nominal_at', 'tensao_nominal_bt'];
const GRUPO_DE_LIGACAO_TP = requiredSelect('grupo_ligacao_tp', 'GRUPO DE LIGAÇÃO', ['1 (FASE-FASE)', '2 (FASE-TERRA, SISTEMA ATERRADO)', '3 (FASE-TERRA, SISTEMA ISOLADO)']);

// Para-raio (PR): appended after CORRENTE NOMINAL. DESLIGADOR ÍNTEGRO is SIM or NÃO, required (the base's "sem desligador" is the field's N/A).
const PARA_RAIO_FIELDS: readonly FieldDef[] = [
  { key: 'mcov_kv', label: 'MCOV', kind: 'number', unit: 'kV' },
  requiredSelect('involucro', 'INVÓLUCRO', ['POLIMÉRICO', 'CERÂMICO']),
  requiredSelect('desligador_integro', 'DESLIGADOR ÍNTEGRO', ['SIM', 'NÃO']),
];

// Cabos de entrada and de saída (CB): a nameplate of their own, the first sub-block.
const CABOS_FIELDS: readonly FieldDef[] = [
  requiredSelect('classe_cabo', 'CLASSE U0/U', ['3,6/6 kV', '6/10 kV', '8,7/15 kV', '12/20 kV', '15/25 kV', '20/35 kV']),
  requiredSelect('isolacao_cabo', 'ISOLAÇÃO', ['XLPE', 'EPR', 'HEPR', 'PAPEL IMPREGNADO']),
  { key: 'secao_mm2', label: 'SEÇÃO', kind: 'number', unit: 'mm²' },
  { key: 'comprimento_m', label: 'COMPRIMENTO', kind: 'number', unit: 'm' },
  requiredSelect('tipo_terminacao', 'TERMINAÇÃO', ['TERMOCONTRÁTIL', 'CONTRÁTIL A FRIO', 'DESCONECTÁVEL', 'PORCELANA']),
  requiredSelect('condicao_cabo', 'CONDIÇÃO', ['NOVO (ACEITAÇÃO)', 'EM SERVIÇO (MANUTENÇÃO)']),
];

/** The definition's nameplate with `fields` appended; throws when a key is already there (a v12 change this section did not expect). */
function appended(definition: BlockDefinition, fields: readonly FieldDef[]): BlockDefinition {
  for (const field of fields) {
    if (definition.nameplate.some((existing) => existing.key === field.key)) throw new Error(`seed v13: ${definition.block_type} already has "${field.key}"`);
  }
  return { ...definition, nameplate: [...definition.nameplate, ...fields.map((field) => structuredClone(field))] };
}

/** Stories 23.7 and 23.8: TAPS and TAP ATUAL in place of v12's text TAP ATUAL, the new fields after DESLOCAMENTO ANGULAR, the dry fields and the TTR per tap. */
function transformadorForcaE23b(definition: BlockDefinition): BlockDefinition {
  const nameplate = definition.nameplate.flatMap((field): FieldDef[] => {
    if (field.key === 'tap_atual') return [structuredClone(TAPS), structuredClone(TAP_ATUAL)];
    if (field.key === 'ligacao_secundaria') return [field, ...TRANSFORMER_AFTER_GROUP.map((added) => structuredClone(added))];
    return [field];
  });
  if (nameplate.length !== definition.nameplate.length + 1 + TRANSFORMER_AFTER_GROUP.length) throw new Error('seed v13: the transformador de força lacks TAP ATUAL or DESLOCAMENTO ANGULAR');
  const rule = definition.oil_rule!;
  const tests = definition.tests.map((test): TestDef => (test.key === 'relacao_transformacao' ? { ...test, tables: test.tables.map((table) => ({ ...table, rows_from: TAPS.key })) } : test));
  return {
    ...definition,
    nameplate,
    // TEMPERATURA DO ÓLEO is an oil field (excused on a dry unit); the winding's and CLASSE TÉRMICA are a dry unit's (excused on an oil one).
    oil_rule: { ...rule, fields: [...rule.fields, TEMPERATURA_DO_OLEO.key], dry_fields: [TEMPERATURA_DO_ENROLAMENTO.key, CLASSE_TERMICA.key] },
    tests,
  };
}

function seccionadoraE23b(definition: BlockDefinition): BlockDefinition {
  const nameplate = definition.nameplate.map((field): FieldDef => (field.key === 'acionamento' ? { ...field, options: [...field.options!, MOTORIZADO] } : field));
  if (!nameplate.some((field) => field.key === 'acionamento')) throw new Error('seed v13: the chave seccionadora lacks ACIONAMENTO');
  return appended({ ...definition, nameplate }, SECCIONADORA_FIELDS);
}

function tpE23b(definition: BlockDefinition): BlockDefinition {
  const nameplate = definition.nameplate.map((field): FieldDef => (TP_SQRT3_FIELDS.includes(field.key) ? { ...field, over_sqrt3: true } : field));
  return appended({ ...definition, nameplate }, [GRUPO_DE_LIGACAO_TP]);
}

function tcE23b(definition: BlockDefinition): BlockDefinition {
  if (!definition.nameplate.some((field) => field.key === 'relacao')) throw new Error('seed v13: the TC lacks RELAÇÃO');
  return { ...definition, nameplate: definition.nameplate.map((field): FieldDef => (field.key === 'relacao' ? { ...field, dash_ratio: true } : field)) };
}

/** A cable type with its nameplate, the first sub-block. */
function cabosE23b(definition: BlockDefinition): BlockDefinition {
  return { ...appended(definition, CABOS_FIELDS), sub_blocks: ['nameplate', ...definition.sub_blocks] };
}

const CABOS: readonly BaseEquipmentBlockType[] = ['cabos_entrada', 'cabos_saida'];

/** Batch e23b's whole delta (Stories 23.7 to 23.9), applied after every e23a step. */
function withNameplateFields(seed: ReportSeed): ReportSeed {
  const blocks = { ...seed.blocks };
  blocks.transformador_forca = transformadorForcaE23b(blocks.transformador_forca);
  blocks.disjuntor_mt = appended(blocks.disjuntor_mt, DISJUNTOR_FIELDS);
  blocks.chave_seccionadora = seccionadoraE23b(blocks.chave_seccionadora);
  blocks.tp = tpE23b(blocks.tp);
  blocks.tc = tcE23b(blocks.tc);
  blocks.para_raio = appended(blocks.para_raio, PARA_RAIO_FIELDS);
  for (const type of CABOS) blocks[type] = cabosE23b(blocks[type]);
  return { ...seed, blocks };
}

// --- e23v: Stories 23.5, 23.6, 23.14 ---------------------------------------------------------
/*
 * Story 23.5 (decision B; Base rev08 table CORRECAO_TEMPERATURA): the transformador de força's
 * insulation is judged corrected to 20 °C by its medium, an oil unit from TEMPERATURA DO ÓLEO and a
 * dry one from TEMPERATURA DO ENROLAMENTO (TR-OL-02, TR-SE-02), the disjuntor's and the
 * seccionadora's by the solid factor at the cabine's ambient (DJ-02, SC-02: the base names no
 * medium there). No other test is corrected (the TC, TP, arrester and cable rows name none).
 *
 * Story 23.6 (decision C): only the rules the base states in numbers. TR-OL-02's history rule
 * (TR-SE-02 takes it too: one product type, the same number), CB-02's comparison between phases
 * (its history term is a vague one, open item B-1, and cables are never corrected), PR-02's
 * comparison against the largest unit with its disconnector prerequisite.
 *
 * Story 23.14 (decision L; DJ-03, SC-03, NETA MTS-2023 7.6.3 and 7.5.1): the contact resistance's
 * deviation over the lowest pole; the seeded 250 µΩ criterion stands, its row status PADRÃO FASOR.
 * No rule reads the previous visit's contact resistance (open item B-6).
 */

type E23vKeys = Pick<TestDef, 'temperature_correction' | 'restriction' | 'criterion_status'>;

/** The e23v keys of each type's tests, by test key; every other test as it was. */
const E23V_KEYS: Partial<Record<BaseEquipmentBlockType, Partial<Record<TestDef['key'], () => E23vKeys>>>> = {
  transformador_forca: {
    isolacao: () => ({
      temperature_correction: { to_c: 20, medium: 'oil_rule', oil_field: TEMPERATURA_DO_OLEO.key, dry_field: TEMPERATURA_DO_ENROLAMENTO.key },
      restriction: { history_drop_pct: 50, status: 'PADRÃO FASOR' },
    }),
  },
  disjuntor_mt: {
    isolacao: () => ({ temperature_correction: { to_c: 20, medium: 'solid' } }),
    resistencia_contato: () => ({ restriction: { pole_deviation_pct: 50, status: 'CONFIRMADO' }, criterion_status: 'PADRÃO FASOR' }),
  },
  chave_seccionadora: {
    isolacao: () => ({ temperature_correction: { to_c: 20, medium: 'solid' } }),
    resistencia_contato: () => ({ restriction: { pole_deviation_pct: 50, status: 'CONFIRMADO' }, criterion_status: 'PADRÃO FASOR' }),
  },
  cabos_entrada: { isolacao: () => ({ restriction: { below_largest_pct: 50, status: 'PADRÃO FASOR' } }) },
  cabos_saida: { isolacao: () => ({ restriction: { below_largest_pct: 50, status: 'PADRÃO FASOR' } }) },
  para_raio: {
    isolacao: () => ({ restriction: { below_largest_pct: 50, prerequisite: { field: 'desligador_integro', fails_on: ['NÃO'] }, status: 'PADRÃO FASOR' } }),
  },
};

/** Batch e23v's whole delta (Stories 23.5, 23.6 and 23.14), applied after e23b's; throws on a test this section did not expect. */
function withCorrectionAndRestrictions(seed: ReportSeed): ReportSeed {
  const blocks = { ...seed.blocks };
  for (const [type, byTest] of Object.entries(E23V_KEYS) as [BaseEquipmentBlockType, Partial<Record<TestDef['key'], () => E23vKeys>>][]) {
    const definition = blocks[type];
    for (const key of Object.keys(byTest)) {
      if (!definition.tests.some((test) => test.key === key)) throw new Error(`seed v13: ${type} lacks the test "${key}"`);
    }
    blocks[type] = { ...definition, tests: definition.tests.map((test): TestDef => (byTest[test.key] === undefined ? test : { ...test, ...byTest[test.key]!() })) };
  }
  return { ...seed, blocks };
}

// --- e23t: Stories 23.15 to 23.17 and 23.19 ---
/*
 * Story 23.15 (decision I; Base rev08 TR-OL-05, TR-SE-05): the transformer's winding resistance, a
 * measurement test (`seed/measurement.ts`) of fixed rows: the AT on the tap in service and on the two
 * extreme taps (those two optional) and the BT, per phase, judged by the deviation between phases
 * over the row's lowest phase (an oil unit within 2 %, restricted to 5 %, out above; a dry one
 * within 2 %, restricted above; an open circuit out on either), each cell also shown corrected to
 * 75 °C by its winding material, and a corrected cell that moved more than 2 % since the previous
 * v13 visit restricted. No comparison with the factory (no per-phase maker's value, B-1).
 *
 * Story 23.16 (Base rev08 TR-OL-03, TR-SE-03, table IP_CLASSIFICACAO): the insulation table's
 * ABSORÇÃO and POLARIZAÇÃO become typed index columns where FO.SERV-03 prints them, the IP judged
 * by class (below 1,0 out, 1,0 to below 2,0 restricted, from 2,0 within), required on a dry unit;
 * the DAR captured, never judged. "IA e IP lidos do visor" leaves this type's v13 sub-blocks. No
 * history rule (its term is a vague one, B-1).
 *
 * Story 23.17 (decision H; Base rev08 TR-OL-07, DJ-07; M-4): TIPO DE ISOLAÇÃO's oil option reads
 * ÓLEO ISOLANTE (ÓLEO and ÓLEO MINERAL its earlier spellings), and v12's TIPO DO ÓLEO gives way in
 * place to NATUREZA DO LÍQUIDO and TIPO (ANP), both oil fields, TIPO (ANP) only for a MINERAL
 * liquid (B-3: it judges nothing). The oil sampling, a record that judges nothing, applies on the
 * transformer while it holds ÓLEO ISOLANTE (silicone included, a reading for Bruno) and on the
 * disjuntor while its extinction medium is Óleo.
 *
 * Story 23.19 (Base rev08 SC-04): the seccionadora's HH fuses, the deviation between fuses within
 * 15 %, out above or open; not applicable unless TIPO DE SECCIONADORA is SOB CARGA COM FUSÍVEIS.
 *
 * Applied after e23v's section: every new key is optional and never defaulted (AD-21).
 */

/** The oil insulation on v13 (M-4). */
const OLEO_ISOLANTE = 'ÓLEO ISOLANTE';
const TIPO_DE_ISOLACAO_V13 = ['EPÓXI', 'Á SECO', OLEO_ISOLANTE];
/** v6 to v11's ÓLEO and v12's ÓLEO MINERAL read as ÓLEO ISOLANTE on v13. */
const TIPO_DE_ISOLACAO_ALIASES_V13: Record<string, string> = { ÓLEO: OLEO_ISOLANTE, 'ÓLEO MINERAL': OLEO_ISOLANTE };

/** NATUREZA DO LÍQUIDO (Story 23.17), its help verbatim from `60-ficha.html` #/ficha/TR1. */
const NATUREZA_DO_LIQUIDO: FieldDef = {
  key: 'natureza_liquido',
  label: 'NATUREZA DO LÍQUIDO',
  kind: 'select',
  options: ['MINERAL', 'ÉSTER NATURAL (VEGETAL)', 'ÉSTER SINTÉTICO', 'SILICONE'],
  help: 'Mineral, éster natural (vegetal), éster sintético ou silicone',
};
/** TIPO (ANP): the ANP class of a mineral oil (B-3), its help verbatim from the frame. */
const TIPO_ANP: FieldDef = {
  key: 'tipo_anp',
  label: 'TIPO (ANP)',
  kind: 'select',
  options: ['A', 'B', 'NÃO INFORMADO'],
  help: 'Só para líquido mineral',
  excused_unless: { field: NATUREZA_DO_LIQUIDO.key, in: ['MINERAL'] },
};

/** The insulation table's two quality columns, typed from v13 on (Story 23.16). */
const ABSORCAO = 'ABSORÇÃO';
const POLARIZACAO = 'POLARIZAÇÃO';

// authored (Story 23.15, 23.17 and 23.19, listed for Bruno): the off note of the three new switchable tests.
const OFF_NOTE_E23T = 'Desligado: o ensaio não conta como faltando e não sai no relatório.';

const PHASE_COLUMNS: MeasurementTest['columns'] = [
  { key: 'fase_a', label: 'Fase A', kind: 'number' },
  { key: 'fase_b', label: 'Fase B', kind: 'number' },
  { key: 'fase_c', label: 'Fase C', kind: 'number' },
];

/** Story 23.15: the winding resistance (TR-OL-05, TR-SE-05). */
const RESISTENCIA_ENROLAMENTO: MeasurementTest = {
  key: 'resistencia_enrolamento',
  label: 'Resistência ôhmica dos enrolamentos',
  instrument_of: 'resistencia_contato',
  switchable: { off_note: OFF_NOTE_E23T },
  row_header: 'Enrolamento',
  columns: PHASE_COLUMNS,
  rows: [
    { key: 'at_tap_atual', label: 'AT, tap atual', kind: 'number', unit: 'Ω' },
    { key: 'at_primeiro_tap', label: 'AT, primeiro tap', kind: 'number', unit: 'Ω', optional: true },
    { key: 'at_ultimo_tap', label: 'AT, último tap', kind: 'number', unit: 'Ω', optional: true },
    { key: 'bt', label: 'BT', kind: 'number', unit: 'mΩ' },
  ],
  criteria: [
    {
      type: 'phase_deviation',
      across: 'columns',
      within_max_pct: 2,
      restricted_max_pct: 5,
      above: 'out',
      medium: 'oil',
      // authored (Story 23.15, listed for Bruno): the criterion's wording.
      text: 'desvio entre fases ≤ 2 % (com restrição até 5 %)',
      status: 'CONFIRMADO',
      source: { name: 'NETA MTS-2023 7.2.2; IEEE C57.152', edition: null },
    },
    {
      type: 'phase_deviation',
      across: 'columns',
      within_max_pct: 2,
      above: 'restricted',
      medium: 'dry',
      // authored (Story 23.15, listed for Bruno).
      text: 'desvio entre fases ≤ 2 % (com restrição acima)',
      status: 'CONFIRMADO',
      source: { name: 'NETA MTS-2023 7.2.1.2', edition: null },
    },
  ],
  winding_correction: { to_c: 75, material_field: 'material_enrolamento', oil_field: TEMPERATURA_DO_OLEO.key, dry_field: TEMPERATURA_DO_ENROLAMENTO.key },
  history_deviation_pct: 2,
};

/** Story 23.17: the oil sampling (TR-OL-07, DJ-07): a record, both answers pass, "Não coletado" asks why. */
function coletaOleo(appliesWhen: NonNullable<MeasurementTest['applies_when']>): MeasurementTest {
  return {
    key: 'coleta_oleo',
    label: 'Coleta de óleo',
    switchable: { off_note: OFF_NOTE_E23T },
    // authored (Story 23.17, listed for Bruno): the row header and the result column.
    row_header: 'Coleta',
    columns: [
      {
        key: 'resultado',
        label: 'Resultado',
        kind: 'choice',
        options: [
          { key: 'coletado', label: 'Coletado' },
          { key: 'nao_coletado', label: 'Não coletado' },
        ],
      },
    ],
    rows: [{ key: 'amostra', label: 'Amostra' }],
    values: [
      {
        key: 'motivo',
        label: 'Motivo',
        kind: 'choice',
        options: [
          { key: 'equipamento_energizado', label: 'Equipamento energizado' },
          { key: 'sem_ponto_de_coleta', label: 'Sem ponto de coleta' },
          { key: 'outro', label: 'Outro' },
        ],
        when: { cell: { row: 'amostra', column: 'resultado' }, equals: 'nao_coletado' },
      },
    ],
    criteria: [
      {
        type: 'choice_pass',
        column: 'resultado',
        pass: ['coletado', 'nao_coletado'],
        // authored (Story 23.17, listed for Bruno): a record that judges nothing; the frame's helper says the lab analyses the oil.
        text: 'registro da coleta (a análise é do laboratório)',
        source: { name: 'NBR 8840:2021; NBR 7070:2006', edition: null },
      },
    ],
    applies_when: appliesWhen,
  };
}

/** Story 23.19: the HH fuses (SC-04). */
const RESISTENCIA_FUSIVEIS: MeasurementTest = {
  key: 'resistencia_fusiveis',
  label: 'Resistência dos fusíveis HH',
  instrument_of: 'resistencia_contato',
  switchable: { off_note: OFF_NOTE_E23T },
  row_header: 'Fusível',
  columns: [{ key: 'resistencia', label: 'Resistência', kind: 'number', unit: 'mΩ' }],
  rows: [
    { key: 'fase_a', label: 'Fase A' },
    { key: 'fase_b', label: 'Fase B' },
    { key: 'fase_c', label: 'Fase C' },
  ],
  criteria: [
    {
      type: 'phase_deviation',
      across: 'rows',
      within_max_pct: 15,
      above: 'out',
      // authored (Story 23.19, listed for Bruno).
      text: 'desvio entre fusíveis ≤ 15 %',
      status: 'CONFIRMADO',
      source: { name: 'NETA MTS-2023', edition: null },
    },
  ],
  applies_when: { field: 'tipo_seccionadora', op: 'in', values: ['SOB CARGA COM FUSÍVEIS'], unmet: 'sem fusíveis' },
};

/** The definition's sub-blocks with `added` before OBSERVAÇÕES and `removed` left out. */
function withSubBlocks(definition: BlockDefinition, added: readonly string[], removed: readonly string[] = []): string[] {
  if (!definition.sub_blocks.includes('observations')) throw new Error(`seed v13: ${definition.block_type} lacks observations`);
  const kept = definition.sub_blocks.filter((key) => !removed.includes(key));
  const before = kept.indexOf('observations');
  return [...kept.slice(0, before), ...added, ...kept.slice(before)];
}

/** The definition with `tests` appended to its measurement tests, each its sub-block. */
function withMeasurementTests(definition: BlockDefinition, tests: readonly MeasurementTest[], removed: readonly string[] = []): BlockDefinition {
  return {
    ...definition,
    sub_blocks: withSubBlocks(definition, tests.map((test) => test.key), removed),
    measurement_tests: [...(definition.measurement_tests ?? []), ...tests.map((test) => structuredClone(test))],
  };
}

/** Stories 23.15 to 23.17: the transformer's liquid, its typed IP and DAR, the winding resistance and the oil sampling. */
function transformadorForcaE23t(definition: BlockDefinition): BlockDefinition {
  const nameplate = definition.nameplate.flatMap((field): FieldDef[] => {
    if (field.key === 'tipo_de_isolacao') return [{ ...field, options: [...TIPO_DE_ISOLACAO_V13], option_aliases: { ...TIPO_DE_ISOLACAO_ALIASES_V13 } }];
    if (field.key === 'tipo_do_oleo') return [structuredClone(NATUREZA_DO_LIQUIDO), structuredClone(TIPO_ANP)];
    return [field];
  });
  if (nameplate.length !== definition.nameplate.length + 1) throw new Error('seed v13: the transformador de força lacks TIPO DO ÓLEO');
  const rule = definition.oil_rule!;
  const fields = rule.fields.flatMap((key) => (key === 'tipo_do_oleo' ? [NATUREZA_DO_LIQUIDO.key, TIPO_ANP.key] : [key]));
  const tests = definition.tests.map((test): TestDef => {
    if (test.key !== 'isolacao') return test;
    const tables = test.tables.map((table) => ({
      ...table,
      value_columns: table.value_columns.map((column) => (column.label === ABSORCAO || column.label === POLARIZACAO ? { ...column, role: 'index' as const } : column)),
    }));
    return { ...test, tables, polarization_index: { column: POLARIZACAO, min: 1, restricted_below: 2, required_on: 'dry', dar_column: ABSORCAO, status: 'CONFIRMADO' } };
  });
  const shaped: BlockDefinition = { ...definition, nameplate, oil_rule: { ...rule, oil_values: [OLEO_ISOLANTE], fields }, tests };
  return withMeasurementTests(
    shaped,
    [RESISTENCIA_ENROLAMENTO, coletaOleo({ field: 'tipo_de_isolacao', op: 'in', values: [OLEO_ISOLANTE] })],
    ['ia_ip_display'],
  );
}

/** Batch e23t's whole delta (Stories 23.15 to 23.17 and 23.19), applied after e23v's. */
function withTransformerAndSwitchingTests(seed: ReportSeed): ReportSeed {
  const blocks = { ...seed.blocks };
  blocks.transformador_forca = transformadorForcaE23t(blocks.transformador_forca);
  blocks.disjuntor_mt = withMeasurementTests(blocks.disjuntor_mt, [coletaOleo({ field: 'meio_de_extincao', op: 'in', values: ['Óleo'] })]);
  blocks.chave_seccionadora = withMeasurementTests(blocks.chave_seccionadora, [RESISTENCIA_FUSIVEIS]);
  return { ...seed, blocks };
}

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV13(): ReportSeed {
  const seed = structuredClone(v12);
  const blocks = { ...seed.blocks };
  // e23a (Stories 23.2 and 23.4).
  for (const type of LIMIT_NOTE_TYPES) blocks[type] = insulationV13(type, blocks[type]);
  // e23b (Stories 23.7 to 23.9), after every e23a step; then e23v (Stories 23.5, 23.6, 23.14); then e23t (Stories 23.15 to 23.17, 23.19).
  return withTransformerAndSwitchingTests(withCorrectionAndRestrictions(withNameplateFields({ ...seed, blocks })));
}

export const CABINE_PRIMARIA_V13: ReportSeed = cabinePrimariaV13();
