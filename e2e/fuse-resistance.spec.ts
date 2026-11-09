import { APPLICABILITY_APPLIED } from '@app/domain';
import { cellOf, deviceSnapshot, issueAndReadTables, kernelOf, kernelTablesTitled, openStep, outboxValues, plateField, setUpRelatorio, tablesTitled, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';

/*
 * Story 23.19 (seed v13, decision I; Base rev08 SC-04): the seccionadora's HH fuses, as a person records
 * them at 1280 px. The office set TIPO DE SECCIONADORA SOB CARGA COM FUSÍVEIS. The fuses at 10, 10 and
 * 12 mΩ: the third is 20 % over the lowest, out, and the floor Reprovado. The plate turned SEM CARGA:
 * the test is not applicable, its band naming the plate ("sem fusíveis"), nothing missing; "Aplicar este
 * ensaio" applies it (one override in the outbox) and "Seguir a placa" clears it. The issued DOCX prints
 * no fuse table. Every expected word is the kernel's over the device's own rows. It issues a revision
 * through the api's one queue and LibreOffice, so it runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const KEY = 'resistencia_fusiveis';

test('@p0 23.19-E2E-001 HH fuses at 10, 10 and 12 mΩ: the third fails (Reprovado); SEM CARGA makes the test NA with its reason, "Aplicar este ensaio" and "Seguir a placa" write its override; the DOCX prints no fuse table', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [{ blockType: 'chave_seccionadora', key: 'tipo_seccionadora', value: 'SOB CARGA COM FUSÍVEIS' }]);
  const sc = sheets.find((sheet) => sheet.blockType === 'chave_seccionadora')!;
  await openStep(page, relatorioId, sc.blockId, 'Ensaios');
  const section = testSection(page, KEY);
  await expect(section.locator('h2')).toHaveText('Resistência dos fusíveis HH');

  for (const [row, text] of [[0, '10'], [1, '10'], [2, '12']] as const) await typeCell(page, database, sc.blockId, KEY, row, 0, text);
  expect(await outboxValues(database, page, `sheet/${sc.blockId}/test/${KEY}/cell/2/0`)).toEqual([{ raw: '12', unit: 'mΩ', state: 'measured' }]);
  const judged = await kernelOf(page, database, relatorioId, sc.blockId);
  const fuses = judged.measurement(KEY);
  expect(fuses.rows.map((row) => row.cells[0]!.verdict)).toEqual(['within', 'within', 'out']);
  await expect(cellOf(page, KEY, 2, 0).locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellOf(page, KEY, 2, 0).locator('.mf-helper[role="status"]')).toContainText(fuses.rows[2]!.cells[0]!.helperText!);
  expect(judged.floorReason).toBe('A ficha exige no mínimo Reprovado · Com restrições: medição fora do critério.');
  await openStep(page, relatorioId, sc.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveText(judged.floorReason!);

  // SEM CARGA: not applicable, the band naming the plate; nothing of it counts.
  await openStep(page, relatorioId, sc.blockId, 'Placa');
  await plateField(page, 'tipo_seccionadora').locator('select').selectOption('SEM CARGA');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${sc.blockId}/nameplate/tipo_seccionadora`)).at(-1)).toBe('SEM CARGA');
  const na = (await kernelOf(page, database, relatorioId, sc.blockId)).measurement(KEY).applicability;
  expect(na).toMatchObject({ state: 'na', reason: 'Não se aplica: TIPO DE SECCIONADORA sem fusíveis.' });
  await openStep(page, relatorioId, sc.blockId, 'Ensaios');
  await expect(section).toHaveAttribute('data-applicability', 'na');
  await expect(section.locator('.v13-na-band .band-text')).toContainText(na.phrase!);
  expect((await kernelOf(page, database, relatorioId, sc.blockId)).floorReason).toBeNull();

  // "Aplicar este ensaio": one override; "Seguir a placa" clears it.
  const overridePath = `sheet/${sc.blockId}/test/${KEY}/applicability`;
  await section.getByRole('button', { name: 'Aplicar este ensaio' }).click();
  await expect.poll(async () => (await outboxValues(database, page, overridePath)).at(-1)).toBe(APPLICABILITY_APPLIED);
  await expect(section).toHaveAttribute('data-applicability', 'applied');
  await expect(section.locator('.v13-applied-band')).toBeVisible();
  await section.locator('.v13-applied-band').getByRole('button', { name: 'Seguir a placa' }).click();
  await expect.poll(async () => (await outboxValues(database, page, overridePath)).at(-1)).toBeNull();
  await expect(section).toHaveAttribute('data-applicability', 'na');

  // The DOCX: this sheet's NA test is absent; the template's other seccionadoras (TIPO empty, so the test applies) print theirs.
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  expect(kernelTablesTitled(snapshot, 'RESISTÊNCIA DOS FUSÍVEIS HH', sc.blockId)).toBe(0);
  const others = kernelTablesTitled(snapshot, 'RESISTÊNCIA DOS FUSÍVEIS HH');
  expect(others).toBe(sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora').length - 1);
  const tables = await issueAndReadTables(page, database, relatorioId);
  expect(tablesTitled(tables, 'RESISTÊNCIA DOS FUSÍVEIS HH')).toHaveLength(others);
});
