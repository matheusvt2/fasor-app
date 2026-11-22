import { minimumText, voltsText } from '../relatorio/reading-evaluation.ts';
import { listPtBr } from '../text/plural.ts';
import type { CriterionSeed } from './criteria.ts';
import { NETA_100_1, NETA_100_5, type CriterionTable, type CriterionTableRow } from './criteria-tables.ts';
import { getSeed, SEED_VERSION } from './definitions.ts';

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

/** The equipment labels of the latest seed whose tests read `table` (`criterion_table`), in the seed's block order. */
function equipmentOf(table: CriterionTable): string[] {
  const seed = getSeed(SEED_VERSION, 'cabine_primaria');
  return Object.values(seed.blocks).flatMap((definition) =>
    definition !== undefined && definition.tests.some((test) => test.criterion_table?.table.key === table.key) ? [definition.label] : [],
  );
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
    appliesText: applies(equipmentText),
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

/** Story 27.6: when a seeded criterion applies, one sentence; the insulation one stands in for the tables. */
export function seededCriterionAppliesText(criterion: Pick<CriterionSeed, 'key'>): string {
  // authored (Story 27.6, listed for Bruno): the seeded insulation criterion, where no table row judges.
  if (criterion.key === 'isolacao') return 'Vale quando a placa não informa a tensão nominal, nos cabos e nos relatórios anteriores às tabelas ANSI/NETA.';
  // authored (Story 27.6, listed for Bruno): every other seeded criterion.
  return 'Vale em toda ficha com este ensaio.';
}
