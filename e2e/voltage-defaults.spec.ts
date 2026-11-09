import { deviceSnapshot, issueAndReadTables, kernelOf, openStep, outboxValues, setUpRelatorio, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';

/*
 * Story 23.13 (seed v13, decision D; Base rev08 DJ-02, TC-02, PR-02, CB-02): the default test voltage of
 * each insulation row, as a person sees it at 1280 px and as the document prints it. The office set a
 * disjuntor of class 15 kV, a TC of 13,8 kV, a para-raio's MCOV of 4,99 kV and a cable of class 8,7/15 kV:
 * each row's TENSÃO select starts at the kernel's default (5, 5, 2,5 and 5 kV); one disjuntor row typed
 * at 1 kV keeps its typed value (the outbox holds that one put only). A reading on each sheet makes its
 * row print, and the issued DOCX prints each default in TENSÃO. Every expected word is the kernel's over
 * the device's own rows. It issues a revision through the api's one queue and LibreOffice, so it runs in
 * the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' });

/** The row's TENSÃO select of the insulation test (`ensaios-section.tsx` `RowVoltageField`). */
const voltageSelect = (page: import('@playwright/test').Page, row: number) => testSection(page, 'isolacao').locator(`[data-row-voltage="${row}"] select`);

test('@p0 23.13-E2E-001 a v13 disjuntor of class 15 kV, a TC of 13,8 kV, a para-raio of MCOV 4,99 kV and a cable 8,7/15 kV start each insulation row at its decision D default, a typed one wins, and the DOCX prints them in TENSÃO', async ({ page }) => {
  test.setTimeout(360_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [
    { blockType: 'disjuntor_mt', key: 'tensao_nominal', value: '15' },
    { blockType: 'tc', key: 'tensao_nominal_at', value: measured('13.8', 'kV') },
    { blockType: 'para_raio', key: 'mcov_kv', value: measured('4.99', 'kV') },
    { blockType: 'cabos_entrada', key: 'classe_cabo', value: '8,7/15 kV' },
  ]);
  const cases = [
    { type: 'disjuntor_mt', expected: '5' },
    { type: 'tc', expected: '5' },
    { type: 'para_raio', expected: '2,5' },
    { type: 'cabos_entrada', expected: '5' },
  ] as const;

  for (const { type, expected } of cases) {
    const sheet = sheets.find((one) => one.blockType === type)!;
    await openStep(page, relatorioId, sheet.blockId, 'Ensaios');
    const kernel = await kernelOf(page, database, relatorioId, sheet.blockId);
    const rows = kernel.test('isolacao').tables.flatMap((table) => table.rows);
    // Every row's default is the kernel's, a default and not a typed value.
    expect(rows.map((row) => [row.voltage?.text, row.voltage?.source]), type).toEqual(rows.map(() => [expected, 'default']));
    await expect(voltageSelect(page, rows[0]!.row), type).toHaveValue(expected);
    // One reading, so the row prints its test voltage (the capture column is 1 MINUTO, or VALORES on the switching types).
    const capture = kernel.test('isolacao').tables[0]!.rows[0]!.cells.find((cell) => cell.role === 'capture')!;
    await typeCell(page, database, sheet.blockId, 'isolacao', rows[0]!.row, capture.address.col, '30');
  }

  // A typed TENSÃO wins on its row and leaves the others at the default; the outbox holds that one voltage put.
  const disjuntor = sheets.find((one) => one.blockType === 'disjuntor_mt')!;
  await openStep(page, relatorioId, disjuntor.blockId, 'Ensaios');
  const before = (await kernelOf(page, database, relatorioId, disjuntor.blockId)).test('isolacao').tables[0]!.rows[1]!;
  const voltageCol = before.voltage!.col;
  // A reading on that row too, so it prints its voltage.
  await typeCell(page, database, disjuntor.blockId, 'isolacao', 1, before.cells.find((cell) => cell.role === 'capture')!.address.col, '30');
  await voltageSelect(page, 1).selectOption('1');
  await expect.poll(async () => outboxValues(database, page, `sheet/${disjuntor.blockId}/test/isolacao/cell/1/${voltageCol}`)).toEqual([{ raw: '1', unit: 'kV', state: 'measured' }]);
  const typed = (await kernelOf(page, database, relatorioId, disjuntor.blockId)).test('isolacao').tables[0]!.rows;
  expect(typed.map((row) => [row.voltage?.text, row.voltage?.source])).toEqual([
    ['5', 'default'],
    ['1', 'typed'],
    ['5', 'default'],
  ]);
  await expect(voltageSelect(page, 1)).toHaveValue('1');
  // No other row was written: its default is not a stored value.
  for (const row of [0, 2]) expect(await outboxValues(database, page, `sheet/${disjuntor.blockId}/test/isolacao/cell/${row}/${voltageCol}`)).toEqual([]);

  // The DOCX: each typed row prints its default (2,5 only on the arrester whose MCOV is 4,99 kV).
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  expect(snapshot.blocks.find((block) => block.id === disjuntor.blockId)!.sheet.test.isolacao!.cells['1']![String(voltageCol)]!.value).toEqual({ raw: '1', unit: 'kV', state: 'measured' });
  const tables = await issueAndReadTables(page, database, relatorioId);
  const voltageCells = tables.flatMap((table) => {
    const header = table.findLast((row) => row.some((text) => text === 'TENSÃO (kV)'));
    if (header === undefined) return [];
    const columns = header.flatMap((text, i) => (text === 'TENSÃO (kV)' ? [i] : []));
    return table.slice(table.indexOf(header) + 1).flatMap((row) => columns.map((i) => row[i] ?? ''));
  });
  expect(voltageCells).toContain('2,5');
  expect(voltageCells.filter((text) => text === '5').length).toBeGreaterThanOrEqual(3);
  expect(voltageCells).toContain('1');
});
