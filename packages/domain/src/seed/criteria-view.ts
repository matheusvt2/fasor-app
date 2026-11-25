import { manufacturerApplies, minimumText, voltsText } from '../relatorio/reading-evaluation.ts';
import { listPtBr } from '../text/plural.ts';
import { formatCriterionValue, type CriterionSeed } from './criteria.ts';
import { NETA_100_1, NETA_100_5, type CriterionTable, type CriterionTableRow } from './criteria-tables.ts';
import { criterionSymbols, getSeed, SEED_VERSION } from './definitions.ts';
import type { BlockDefinition, TestDef } from './schema.ts';

/*
 * Story 27.6 (F10 of the 2026-11-21 pass): what Cadastros › Critérios de aceitação lists beside the
 * seeded criteria: the two ANSI/NETA MTS-2023 tables the fichas judge insulation by, each row as the
 * ficha writes it, with the equipment it judges and when it applies. Every number is the seed's
 * (NFR-14); `apps/web` renders these rows and never a number of its own.
 */

/** Which minimum column a table row carries: one (Table 100.1), or one per medium (Table 100.5). */
export type CriteriaTableColumn = 'min' | 'oil' | 'dry';

export interface CriteriaTableRowView {
  /** "até 250 V", "até 34,5 kV", "acima de 34,5 kV". */
  ratedText: string;
  /** The test voltage the standard pairs with the row: "500 V", "2,5 kV". */
  testVoltageText: string;
  /** The minimums in `columns` order, as the ficha writes a criterion: "≥ 5.000 MΩ". */
  minimums: string[];
}

export interface CriteriaTableView {
  key: string;
  /** "ANSI/NETA MTS-2023, Tabela 100.1", the source a judged row names. */
  title: string;
  /** The equipment whose insulation test reads the table, in the seed's order: "Disjuntor MT, Para-raio e Seccionadora". */
  equipmentText: string;
  /** When the table applies, one sentence. */
  appliesText: string;
  columns: CriteriaTableColumn[];
  rows: CriteriaTableRowView[];
}

/** The block definitions of the latest seed, in its block order. */
function latestDefinitions(): BlockDefinition[] {
  return Object.values(getSeed(SEED_VERSION, 'cabine_primaria').blocks).filter((definition): definition is BlockDefinition => definition !== undefined);
}

/** The equipment labels of the latest seed with a test `matches` picks, in the seed's block order. */
function equipmentWith(matches: (test: TestDef) => boolean): string[] {
  return latestDefinitions().flatMap((definition) => (definition.tests.some(matches) ? [definition.label] : []));
}

/** The equipment labels of the latest seed whose tests read `table` (`criterion_table`), in the seed's block order. */
function equipmentOf(table: CriterionTable): string[] {
  return equipmentWith((test) => test.criterion_table?.table.key === table.key);
}

/**
 * Fix batch e27a-review (R6): whether a test `matches` picks takes the manufacturer's value on the latest seed
 * (`manufacturerApplies`): then the value typed on the ficha judges every row of the test before the seed's
 * criterion or a table row does (`effectiveCriterion`, `rowCriterion`).
 */
function takesManufacturer(matches: (test: TestDef) => boolean): boolean {
  return latestDefinitions().some((definition) => definition.tests.some((test) => matches(test) && manufacturerApplies(test)));
}

// authored (Story 27.6, listed for Bruno): fix batch e27a-review (R6), the manufacturer's value comes first.
const MANUFACTURER_FIRST = 'Quando a ficha traz o valor do fabricante, ele vale antes.';

/** "Vale ..." with the manufacturer's sentence after it when the test takes one. */
function withManufacturer(applies: string, manufacturer: boolean): string {
  return manufacturer ? `${applies} ${MANUFACTURER_FIRST}` : applies;
}

function rowView(row: CriterionTableRow, previous: CriterionTableRow | undefined, columns: readonly CriteriaTableColumn[]): CriteriaTableRowView {
  // authored (Story 27.6, listed for Bruno): the rated-voltage bound of a row, and the last row's "above".
  const ratedText = row.up_to_v === null ? `acima de ${voltsText(previous?.up_to_v ?? 0)}` : `até ${voltsText(row.up_to_v)}`;
  return { ratedText, testVoltageText: voltsText(row.test_voltage_v), minimums: columns.map((column) => minimumText(String(row[column]!), row.unit)) };
}

function tableView(table: CriterionTable, applies: (equipment: string) => string): CriteriaTableView {
  const columns: CriteriaTableColumn[] = table.rows[0]!.min !== undefined ? ['min'] : ['oil', 'dry'];
  const source = table.rows[0]!.source;
  const equipmentText = listPtBr(equipmentOf(table));
  return {
    key: table.key,
    title: `${source.name}${source.edition === null ? '' : `-${source.edition}`}, ${table.name}`,
    equipmentText,
    appliesText: withManufacturer(applies(equipmentText), takesManufacturer((test) => test.criterion_table?.table.key === table.key)),
    columns,
    rows: table.rows.map((row, i) => rowView(row, table.rows[i - 1], columns)),
  };
}

/** Story 27.6: the Tabela 100.1 and the Tabela 100.5, in that order, as the Critérios tab lists them. */
export function criteriaTablesView(): CriteriaTableView[] {
  return [
    // authored (Story 27.6, listed for Bruno): when the Tabela 100.1 applies.
    tableView(NETA_100_1, (equipment) => `Vale quando a placa informa a tensão nominal: ${equipment}, pela linha dessa tensão.`),
    // authored (Story 27.6, listed for Bruno): when the Tabela 100.5 applies.
    tableView(NETA_100_5, (equipment) => `Vale quando a placa informa a tensão nominal e o tipo de isolação: ${equipment}, pela linha dessa tensão, na coluna óleo ou seco.`),
  ];
}

/**
 * Story 30.3 (a): a criterion as a surface that belongs to no relatório writes it (the Critérios tab, the type editor,
 * the template composer): in the form of the current seed (`SEED_VERSION`), "> 400 MΩ" and "± 0,5 %" since v19. A
 * sheet and the printed document read the form of their own seed instead.
 */
export function currentCriterionText(criterion: Parameters<typeof formatCriterionValue>[0]): string {
  return formatCriterionValue(criterion, criterionSymbols(SEED_VERSION));
}

/**
 * Story 27.6: when a seeded criterion applies, one sentence; the insulation one stands in for the tables.
 * Fix batch e27a-review (R6): the equipment it always judges is read from the latest seed (the types whose test
 * of that criterion carries no `criterion_table`), and the manufacturer's value, where the test takes one, is
 * said to come first.
 */
export function seededCriterionAppliesText(criterion: Pick<CriterionSeed, 'key'>): string {
  const ofCriterion = (test: TestDef) => test.criterion_key === criterion.key && test.criterion === undefined;
  const manufacturer = takesManufacturer(ofCriterion);
  if (criterion.key === 'isolacao') {
    const always = equipmentWith((test) => ofCriterion(test) && test.criterion_table === undefined);
    // authored (Story 27.6, listed for Bruno): the seeded insulation criterion, where no table row judges.
    const applies =
      always.length === 0
        ? 'Vale quando a placa não informa a tensão nominal ou o tipo de isolação que a tabela pede, e nos relatórios anteriores às tabelas ANSI/NETA.'
        : `Vale sempre em ${listPtBr(always)}; nos demais, quando a placa não informa a tensão nominal ou o tipo de isolação que a tabela pede; e nos relatórios anteriores às tabelas ANSI/NETA.`;
    return withManufacturer(applies, manufacturer);
  }
  // authored (Story 27.6, listed for Bruno): every other seeded criterion.
  return withManufacturer('Vale em toda ficha com este ensaio.', manufacturer);
}
