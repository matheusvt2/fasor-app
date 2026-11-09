import { cellOf, issueAndReadTables, kernelOf, openStep, outboxValues, setUpRelatorio, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';

/*
 * Story 23.16 (seed v13, decision I; Base rev08 TR-SE-03, table IP_CLASSIFICACAO): a dry v13
 * transformer's polarization index typed in the insulation table's POLARIZAÇÃO column, as a person
 * records it at 1280 px. The office set the plate (EPÓXI). With the first row's 1 minuto at 5 GΩ the IP
 * is required; 0,8 is out and the floor Reprovado; 1,5 is restricted (Aprovado · Com restrições). The
 * second row above the instrument's limit ("> 2 TΩ") makes its IP N/A, never typed. The issued DOCX
 * prints the IP column: 1,5, N/A and "-". Every expected word is the kernel's over the device's own
 * rows. It issues a revision through the api's one queue and LibreOffice, so it runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

/** The insulation table's 1 MINUTO (col 1) and POLARIZAÇÃO (col 4) on the transformer. */
const MINUTE = 1;
const IP = 4;

test('@p0 23.16-E2E-001 a dry v13 transformer\'s IP: required once the 1 minuto is typed, 0,8 fails (Reprovado), 1,5 restricts; a row above the instrument\'s limit shows N/A; the DOCX prints the IP column', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [{ blockType: 'transformador_forca', key: 'tipo_de_isolacao', value: 'EPÓXI' }]);
  const tf = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  // The IP and the DAR are columns of the table, where FO.SERV-03 prints them.
  await expect(page.locator('section[data-test-key="isolacao"] thead th')).toContainText(['Absorção', 'Polarização']);

  await typeCell(page, database, tf.blockId, 'isolacao', 0, MINUTE, '5G');
  const required = await kernelOf(page, database, relatorioId, tf.blockId);
  const ipOf = (evaluation: ReturnType<typeof required.test>, row: number) => evaluation.tables[0]!.rows[row]!.cells.find((cell) => cell.index?.kind === 'ip')!;
  expect(ipOf(required.test('isolacao'), 0)).toMatchObject({ missing: true, verdict: null });
  // The first missing field of the sheet now: "Concluir ficha" would jump to it.
  await expect(cellOf(page, 'isolacao', 0, IP).locator('input.mf-value')).toHaveAttribute('data-missing-field', '');

  // 0,8: out of its class, the floor Reprovado.
  await typeCell(page, database, tf.blockId, 'isolacao', 0, IP, '0,8');
  expect((await outboxValues(database, page, `sheet/${tf.blockId}/test/isolacao/cell/0/${IP}`)).at(-1)).toEqual({ raw: '0.8', unit: null, state: 'measured' });
  const out = await kernelOf(page, database, relatorioId, tf.blockId);
  const outIp = ipOf(out.test('isolacao'), 0);
  expect(outIp.verdict).toBe('out');
  await expect(cellOf(page, 'isolacao', 0, IP).locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellOf(page, 'isolacao', 0, IP).locator('.mf-helper[role="status"]')).toContainText(outIp.helperText!);
  expect(out.floorReason).toBe('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério.');
  await openStep(page, relatorioId, tf.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveText(out.floorReason!);

  // 1,5: restricted; the floor Aprovado · Com restrições.
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  await typeCell(page, database, tf.blockId, 'isolacao', 0, IP, '1,5');
  const restricted = await kernelOf(page, database, relatorioId, tf.blockId);
  const restrictedIp = ipOf(restricted.test('isolacao'), 0);
  expect(restrictedIp.verdict).toBe('restricted');
  await expect(cellOf(page, 'isolacao', 0, IP).locator('.measurement-field')).toHaveAttribute('data-state', 'restricted');
  await expect(cellOf(page, 'isolacao', 0, IP).locator('.mf-helper[data-tone="restricted"]')).toHaveText(`Com restrição: ${restrictedIp.restriction!.text}`);
  expect(restricted.floorReason).toBe('A ficha exige no mínimo Aprovado · Com restrições: leitura com restrição.');

  // The second row above the instrument's limit: its IP is N/A, drawn read-only, never missing.
  await typeCell(page, database, tf.blockId, 'isolacao', 1, MINUTE, '> 2T');
  const over = await kernelOf(page, database, relatorioId, tf.blockId);
  expect(ipOf(over.test('isolacao'), 1)).toMatchObject({ index: { kind: 'ip', notApplicable: true, required: false }, missing: false, displayText: 'N/A' });
  const naCell = cellOf(page, 'isolacao', 1, IP);
  await expect(naCell.locator('.measurement-field[aria-readonly="true"]')).toHaveText('N/A');
  await expect(naCell.locator('input')).toHaveCount(0);

  // The DOCX: the transformer's insulation table, its POLARIZAÇÃO column 1,5, N/A and "-".
  const tables = await issueAndReadTables(page, database, relatorioId);
  const insulation = tables.find((table) => table.some((row) => row.includes('POLARIZAÇÃO')) && table.some((row) => row.includes('1,5')))!;
  expect(insulation).toBeDefined();
  const labels = insulation.find((row) => row.includes('POLARIZAÇÃO'))!;
  const col = labels.indexOf('POLARIZAÇÃO');
  const data = insulation.slice(insulation.indexOf(labels) + 1).filter((row) => row.length === labels.length);
  expect(data.map((row) => row[col])).toEqual(['1,5', 'N/A', '-']);
});
