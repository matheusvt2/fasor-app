import type { BaseEquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockDefinition, ChecklistItem, ColumnDef, FieldDef, NotTestedReason, ReportSeed, TableDef, TestDef } from './schema.ts';
import { TEST_VOLTAGE_OPTIONS_KV } from './test-voltages.ts';
import { CABINE_PRIMARIA_V10 } from './v10.ts';
import { CABINE_PRIMARIA_V11 } from './v11.ts';

/*
 * Seed version 12 (Epic 22, Bruno's review of 2026-11-06; contract 32): seed v11 plus
 *
 * - Story 22.7: TIPO DE ISOLAÇÃO on the transformador de força, the TP and the TC offers ÓLEO
 *   MINERAL where v11 offered ÓLEO (an earlier ÓLEO reads as ÓLEO MINERAL), the oil value of the
 *   oil rule; the transformador de força gains TIPO DO ÓLEO (A, B) after it, an oil field, and its
 *   LIGAÇÃO SECUNDÁRIA is labelled DESLOCAMENTO ANGULAR (key, options and formula unchanged); the
 *   TP takes the TC's v10 checklist, with VASAMENTO its one oil item; the Não ensaiado reason
 *   "Defeito no equipamento", flagged `defect`, sits before "Outro".
 * - Story 22.8: every insulation table gains a TENSÃO (kV) column, a select per row, appended after
 *   its value columns so their stored indices stay v11's; the transformer's SECUNDÁRIO/MASSA row
 *   starts at 1 kV and its rows name the winding they test (`relatorio/row-voltage.ts`).
 * - Story 22.9: EXATIDÃO is a select of accuracy classes on the TC and a new field on the TP, and
 *   both ratio tests read their criterion from it (`relatorio/accuracy-class.ts`).
 * - Story 22.11: one library type, the Inspeção de QGBT: four nameplate fields, the Quadro
 *   elétrico's visual items, no tests.
 *
 * Derived from v11 rather than retyped, so the two differ only by these (`seed.test.ts` pins the
 * difference). Relatórios on v1 to v11 keep their fields, lists, tables and criteria.
 */

const v11 = CABINE_PRIMARIA_V11;

// --- Story 22.7 ------------------------------------------------------------------------------

/** The oil insulation, Bruno's word ("Tipo de isolação deve ser 'Óleo mineral'"). */
const OIL_INSULATION = 'ÓLEO MINERAL';
/** TIPO DE ISOLAÇÃO on the three transformers: v11's order with ÓLEO MINERAL in ÓLEO's place. */
const TIPO_DE_ISOLACAO_OPTIONS = ['EPÓXI', 'Á SECO', OIL_INSULATION];
/** v11's (and v6's) spelling, read as ÓLEO MINERAL when copied or read from an older plate. */
const TIPO_DE_ISOLACAO_ALIASES: Record<string, string> = { ÓLEO: OIL_INSULATION };

/** TIPO DO ÓLEO: the ANP classes of mineral insulating oil (coordinator's reading, listed for Bruno). */
const TIPO_DO_OLEO: FieldDef = { key: 'tipo_do_oleo', label: 'TIPO DO ÓLEO', kind: 'select', options: ['A', 'B'] };

/** The label of the transformer's vector-group select (Bruno's item 3). */
const DESLOCAMENTO_ANGULAR = 'DESLOCAMENTO ANGULAR';

/** The TP's and the TC's one oil item, VASAMENTO (seed v10's TC list). */
const VASAMENTO = 'vasamento' as const;

// authored (Story 22.7, listed for Bruno): the justification a sheet not tested for a defect prints.
const DEFECT_REASON: NotTestedReason = {
  key: 'defeito_no_equipamento',
  label: 'Defeito no equipamento',
  justification: 'Os ensaios não foram realizados devido a defeito constatado no equipamento.',
  defect: true,
};

function oilInsulation(definition: BlockDefinition): BlockDefinition {
  const nameplate = definition.nameplate.map((field): FieldDef =>
    field.key === 'tipo_de_isolacao' ? { ...field, options: [...TIPO_DE_ISOLACAO_OPTIONS], option_aliases: { ...TIPO_DE_ISOLACAO_ALIASES } } : field,
  );
  return { ...definition, nameplate, oil_rule: { ...definition.oil_rule!, oil_values: [OIL_INSULATION] } };
}

/** The transformer's nameplate: TIPO DO ÓLEO right after TIPO DE ISOLAÇÃO, the group select relabelled. */
function transformerNameplate(nameplate: readonly FieldDef[]): FieldDef[] {
  return nameplate.flatMap((field): FieldDef[] => {
    if (field.key === 'tipo_de_isolacao') return [field, structuredClone(TIPO_DO_OLEO)];
    if (field.key === 'ligacao_secundaria') return [{ ...field, label: DESLOCAMENTO_ANGULAR }];
    return [field];
  });
}

// --- Story 22.9 ------------------------------------------------------------------------------

/**
 * The accuracy classes of a TC (NBR 6856): measurement, then protection (coordinator's reading,
 * listed for Bruno). 2026-11-07 (e22g, Bruno's test base rev03): 5P is judged at ± 1 % (IEC
 * 61869-2, ratio error at rated current), 10P stays ± 3 % and the class 3 stays.
 */
const TC_CLASSES = ['0,3', '0,6', '1,2', '3', '5P', '10P'];
/**
 * The accuracy classes of a TP (NBR 6855; coordinator's reading, listed for Bruno), and since
 * 2026-11-07 (e22g, Bruno's test base rev03) the IEC 61869-3 protection classes 3P (± 3 %) and
 * 6P (± 6 %). CONFERIR NA NORMA: Bruno's own note on the two protection classes.
 */
const TP_CLASSES = ['0,3', '0,6', '1,2', '3P', '6P'];
const EXATIDAO = 'exatidao';

const exatidao = (options: readonly string[]): FieldDef => ({ key: EXATIDAO, label: 'EXATIDÃO', kind: 'select', options: [...options] });

/** The ratio test judged by the class its EXATIDÃO names. */
function classRatio(tests: readonly TestDef[]): TestDef[] {
  return tests.map((test): TestDef => (test.key === 'relacao_transformacao' ? { ...test, criterion_class_field: EXATIDAO } : test));
}

// --- Story 22.8 ------------------------------------------------------------------------------

/** The TENSÃO column of an insulation table: a select per row, in kV, never judged. */
const VOLTAGE_COLUMN: ColumnDef = { label: 'TENSÃO', unit: 'kV', role: 'voltage', derived: false, options: [...TEST_VOLTAGE_OPTIONS_KV] };

type VoltageRow = NonNullable<TableDef['voltage_rows']>[number];

/**
 * The transformer's rows (PRIMÁRIO/MASSA, PRIMÁRIO/SECUNDÁRIO, SECUNDÁRIO/MASSA): the low-voltage
 * one starts at 1 kV (Bruno: "Incluir o teste em BT de 1kV"), each naming the winding its LINHA
 * tests. The high-voltage rows carry no seeded default: since 2026-11-07 (e22g, Bruno's test base
 * rev03; until then they took the instrument's TENSÃO ENSAIO) they start from the plate's TENSÃO
 * NOMINAL AT, 2,5 kV for a winding rated 601 V to 5000 V and 5 kV above
 * (`relatorio/row-voltage.ts`), and take the instrument's TENSÃO ENSAIO only while the rating is
 * empty, unreadable or at most 600 V.
 */
const TRANSFORMER_VOLTAGE_ROWS: VoltageRow[] = [
  { default_kv: null, winding: 'tensao_nominal_at' },
  { default_kv: null, winding: 'tensao_nominal_at' },
  { default_kv: '1', winding: 'tensao_nominal_bt' },
];

function withVoltageColumn(table: TableDef, rows: readonly VoltageRow[] | null): TableDef {
  const voltage_rows = rows === null ? table.rows.map((): VoltageRow => ({ default_kv: null, winding: null })) : rows.map((row) => ({ ...row }));
  if (voltage_rows.length !== table.rows.length) throw new Error(`seed v12: ${table.key} has ${table.rows.length} rows, not ${voltage_rows.length}`);
  return { ...table, value_columns: [...table.value_columns, structuredClone(VOLTAGE_COLUMN)], voltage_rows };
}

/** Every insulation table of the definition with its TENSÃO column; the other tests as they were. */
function voltagePerRow(definition: BlockDefinition, rows: readonly VoltageRow[] | null = null): BlockDefinition {
  const tests = definition.tests.map((test): TestDef => (test.key === 'isolacao' ? { ...test, tables: test.tables.map((table) => withVoltageColumn(table, rows)) } : test));
  return { ...definition, tests };
}

// --- the three transformers ------------------------------------------------------------------

function transformadorForcaV12(definition: BlockDefinition): BlockDefinition {
  const oil = oilInsulation(definition);
  const shaped: BlockDefinition = {
    ...oil,
    nameplate: transformerNameplate(oil.nameplate),
    oil_rule: { ...oil.oil_rule!, fields: [...oil.oil_rule!.fields, TIPO_DO_OLEO.key] },
  };
  return voltagePerRow(shaped, TRANSFORMER_VOLTAGE_ROWS);
}

function tpV12(definition: BlockDefinition): BlockDefinition {
  const oil = oilInsulation(definition);
  const checklist: ChecklistItem[] = structuredClone(CABINE_PRIMARIA_V10.blocks.tc.checklist!);
  return voltagePerRow({
    ...oil,
    nameplate: [...oil.nameplate, exatidao(TP_CLASSES)],
    checklist,
    subtypes: oil.subtypes.map((subtype) => ({ ...subtype, na_defaults: [VASAMENTO] })),
    oil_rule: { ...oil.oil_rule!, items: [VASAMENTO] },
    tests: classRatio(oil.tests),
  });
}

function tcV12(definition: BlockDefinition): BlockDefinition {
  const oil = oilInsulation(definition);
  return voltagePerRow({
    ...oil,
    nameplate: oil.nameplate.map((field) => (field.key === EXATIDAO ? exatidao(TC_CLASSES) : field)),
    tests: classRatio(oil.tests),
  });
}

// --- Story 22.11: the Inspeção de QGBT -------------------------------------------------------

/**
 * The Quadro elétrico's items an inspection judges by eye (coordinator's reading, listed for
 * Bruno), keys, phrases and hints reused. Out: the operational checks (resistência de aquecimento,
 * iluminação interna, lâmpadas de sinalização, relés e contatores, disjuntores termomagnéticos,
 * instrumentos de medição) and REAPERTO GERAL, a maintenance action.
 */
const QGBT_VISUAL_ITEMS: readonly string[] = [
  'limpeza_interna_e_externa',
  'pintura_corrosao_da_caixa',
  'fusiveis',
  'aterramento',
  'barramentos',
  'isoladores',
  'fiacao_interna',
  'placas_de_sinalizacao',
  'organizacao_interna',
  'identificacao_de_circuitos',
];

function inspecaoQgbt(quadro: BlockDefinition): BlockDefinition {
  const same = (key: string): FieldDef => structuredClone(quadro.nameplate.find((field) => field.key === key)!);
  const checklist = quadro.checklist!.filter((item) => QGBT_VISUAL_ITEMS.includes(item.key)).map((item) => structuredClone(item));
  if (checklist.length !== QGBT_VISUAL_ITEMS.length) throw new Error('seed v12: the Quadro elétrico lacks a visual item of the Inspeção de QGBT');
  return {
    block_type: 'inspecao_qgbt',
    // authored (Story 22.11, listed for Bruno): the type's name on screen.
    label: 'Inspeção de QGBT',
    nameplate: [same('identificacao'), same('fabricante'), same('tensao_nominal'), { key: 'corrente_nominal', label: 'CORRENTE NOMINAL', kind: 'number', unit: 'A' }],
    checklist,
    tests: [],
    sub_blocks: ['nameplate', 'checklist', 'observations', 'conclusion'],
    subtypes: [],
    conclusion: true,
    library: true,
    // authored (e22g, review N3, listed for Bruno): the inspection's own printed title, so it never
    // reads as a full Quadro elétrico sheet beside one ("QGBT/QD's").
    print_title: 'INSPEÇÃO DE QGBT',
  };
}

// --- the version -----------------------------------------------------------------------------

/** The eight's insulated types other than the three transformers, each gaining the TENSÃO column. */
const OTHER_INSULATED: readonly BaseEquipmentBlockType[] = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'cabos_saida'];

function cabinePrimariaV12(): ReportSeed {
  const seed = structuredClone(v11);
  const blocks = { ...seed.blocks };
  for (const type of OTHER_INSULATED) blocks[type] = voltagePerRow(blocks[type]);
  const quadro = blocks.quadro_eletrico!;
  const reasons = seed.not_tested_reasons;
  const outro = reasons.findIndex((reason) => reason.key === 'outro');
  return {
    ...seed,
    blocks: {
      ...blocks,
      tp: tpV12(blocks.tp),
      tc: tcV12(blocks.tc),
      transformador_forca: transformadorForcaV12(blocks.transformador_forca),
      quadro_eletrico: voltagePerRow(quadro),
      inspecao_qgbt: inspecaoQgbt(quadro),
    },
    not_tested_reasons: [...reasons.slice(0, outro), DEFECT_REASON, ...reasons.slice(outro)],
  };
}

export const CABINE_PRIMARIA_V12: ReportSeed = cabinePrimariaV12();
