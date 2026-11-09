import { z } from 'zod';
import { criterionSourceSchema } from './measurement.ts';

/*
 * Story 23.2 (seed v13, Bruno's test base rev08, Matheus's decisions of 2026-11-08): the two
 * insulation-resistance tables of the public ANSI/NETA MTS-2023 standard a v13 test picks its
 * criterion from, carried as seed data (NFR-14: no criterion number outside the seed module).
 *
 * - Table 100.1: the minimum insulation resistance of an electrical apparatus by its rated
 *   voltage, read by the disjuntor, the seccionadora and the para-raio (base rev08 DJ-02, SC-02,
 *   PR-02).
 * - Table 100.5: the minimum of a transformer winding by its rated voltage, one column for an
 *   oil-filled unit and one for a dry one, read by the transformador de força (base rev08
 *   TR-OL-02, TR-SE-02) and the TC (base rev08 TC-02).
 *
 * Each row applies up to its `up_to_v` (inclusive, in V), in ascending order; the last row's
 * `up_to_v` is null (everything above). A test copies the table it reads into its definition
 * (`criterion_table.table`), so the seed hash covers every number and a company copy carries
 * them; nothing reads these constants at evaluation time.
 *
 * Every row names its source and one of the base's four statuses. Only the numbers are taken:
 * no procedure, recommendation or note text of the standard or of the base is copied here.
 */

/** The base's four statuses of a criterion row (rev08's STATUS column). */
export const CRITERION_ROW_STATUSES = ['CONFIRMADO', 'CONFERIR NA NORMA', 'FABRICANTE', 'PADRÃO FASOR'] as const;
export const criterionRowStatusSchema = z.enum(CRITERION_ROW_STATUSES);
export type CriterionRowStatus = z.infer<typeof criterionRowStatusSchema>;

/** One row of a criterion table: its rated-voltage bound, its test voltage and its minimum (one, or one per medium). */
export const criterionTableRowSchema = z.object({
  /** The highest rated voltage, in V, the row applies to (inclusive); null on the last row. */
  up_to_v: z.number().positive().nullable(),
  /** The test voltage the standard pairs with the row, in V (never judged). */
  test_voltage_v: z.number().positive(),
  /** The minimum on a table with one column (Table 100.1). */
  min: z.number().positive().optional(),
  /** The minimum of an oil-filled unit (Table 100.5). */
  oil: z.number().positive().optional(),
  /** The minimum of a dry unit (Table 100.5). */
  dry: z.number().positive().optional(),
  unit: z.literal('MΩ'),
  source: criterionSourceSchema,
  status: criterionRowStatusSchema,
});
export type CriterionTableRow = z.infer<typeof criterionTableRowSchema>;

/** A criterion table: its key, the name every helper cites ("Tabela 100.5") and its rows, ascending. */
export const criterionTableSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    rows: z.array(criterionTableRowSchema).min(1),
  })
  .refine((table) => table.rows.every((row, i) => (i === table.rows.length - 1 ? row.up_to_v === null : row.up_to_v !== null)), {
    message: 'only the last row has no up_to_v',
  })
  .refine((table) => table.rows.every((row, i) => i === 0 || row.up_to_v === null || row.up_to_v > table.rows[i - 1]!.up_to_v!), {
    message: 'rows ascend by up_to_v',
  })
  .refine((table) => table.rows.every((row) => (row.min !== undefined) !== (row.oil !== undefined && row.dry !== undefined) && (row.oil === undefined) === (row.dry === undefined)), {
    message: 'a row has one minimum, or one per medium (oil and dry)',
  })
  .refine((table) => table.rows.every((row) => row.min !== undefined) || table.rows.every((row) => row.oil !== undefined), {
    message: 'every row of a table has the same columns',
  });
export type CriterionTable = z.infer<typeof criterionTableSchema>;

/** The source every row of the two tables names. */
const NETA_MTS_2023 = { name: 'ANSI/NETA MTS', edition: '2023' } as const;

type Row = Pick<CriterionTableRow, 'up_to_v' | 'test_voltage_v'> & Partial<Pick<CriterionTableRow, 'min' | 'oil' | 'dry'>>;

const confirmed = (row: Row): CriterionTableRow => ({ ...row, unit: 'MΩ', source: { ...NETA_MTS_2023 }, status: 'CONFIRMADO' });

/** ANSI/NETA MTS-2023 Table 100.1 (base rev08 DJ-02, SC-02, PR-02): the minimum of an apparatus by its rated voltage. */
export const NETA_100_1: CriterionTable = criterionTableSchema.parse({
  key: 'neta_100_1',
  name: 'Tabela 100.1',
  rows: (
    [
      [250, 500, 25],
      [600, 1000, 100],
      [1000, 1000, 100],
      [2500, 1000, 500],
      [5000, 2500, 1500],
      [8000, 2500, 2500],
      [15000, 2500, 5000],
      [25000, 5000, 10000],
      [34500, 5000, 100000],
      [null, 5000, 100000],
    ] as const
  ).map(([up_to_v, test_voltage_v, min]) => confirmed({ up_to_v, test_voltage_v, min })),
});

/** ANSI/NETA MTS-2023 Table 100.5 (base rev08 TR-OL-02, TR-SE-02, TC-02): the minimum of a winding, oil-filled or dry. */
export const NETA_100_5: CriterionTable = criterionTableSchema.parse({
  key: 'neta_100_5',
  name: 'Tabela 100.5',
  rows: (
    [
      [600, 1000, 100, 500],
      [5000, 2500, 1000, 5000],
      [null, 5000, 5000, 25000],
    ] as const
  ).map(([up_to_v, test_voltage_v, oil, dry]) => confirmed({ up_to_v, test_voltage_v, oil, dry })),
});
