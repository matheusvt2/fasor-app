import { buildSnapshot, cellAddressesOf, conclusionFloorReasonText, entityKey, evaluateTest, getDefinition, SEED_VERSION, visitContextOf, type Entity, type EntityRow, type TestEvaluation } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 23.14 (seed v13, decision L; Base rev08 DJ-03, NETA MTS-2023 7.6.3): the disjuntor's contact
 * resistance, as a person types it at 1280 px. Poles at 40, 42 and 70 µΩ with no manufacturer's value
 * are all within the 250 µΩ default; the 70 µΩ pole is more than 50 % above the lowest pole, so it is
 * restricted (the neutral field with the amber rule, the "Com restrição:" helper) and the floor reads
 * Aprovado · Com restrições. The manufacturer's 60 µΩ typed in its entry prevails (Story 23.3): the
 * 70 µΩ pole is out and the floor reads Reprovado. Every expected word is the kernel's over the
 * device's own rows.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TEST_KEY = 'resistencia_contato';
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const outboxValues = async (page: Page, path: string) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
const cellOf = (page: Page, address: { row: number; col: number }): Locator =>
  page.locator(`section[data-test-key="${TEST_KEY}"] .ficha-cell[data-cell="${TEST_KEY}:${address.row}:${address.col}"]`).filter({ visible: true });

/** The kernel's evaluation of the contact test and the floor's reason line, over the device's own rows. */
async function kernel(page: Page, relatorioId: string, blockId: string): Promise<{ evaluation: TestEvaluation; reason: string | null }> {
  const records = await readStore<{ entity: string; id: string; row: unknown }>(page, database, 'entities');
  const snapshot = buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as EntityRow])), relatorioId);
  const block = snapshot.blocks.find((row) => row.id === blockId)!;
  const definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  const visit = visitContextOf(snapshot, block);
  return { evaluation: evaluateTest(block, definition, definition.tests.find((test) => test.key === TEST_KEY)!, visit), reason: conclusionFloorReasonText(block, definition, visit) };
}

test('@p0 23.14-E2E-001 a v13 disjuntor at 40, 42 and 70 µΩ: the 70 µΩ pole restricted by the pole deviation and the floor Com restrições; the manufacturer\'s 60 µΩ makes it out and the floor Reprovado', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const disjuntor = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${disjuntor.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();

  const poles = cellAddressesOf(getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt'), TEST_KEY);
  const path = (address: { row: number; col: number }) => `sheet/${disjuntor.blockId}/test/${TEST_KEY}/cell/${address.row}/${address.col}`;
  await cellOf(page, poles[0]!).locator('input.mf-value').click();
  for (const value of ['40', '42', '70']) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  for (const [i, raw] of ['40', '42', '70'].entries()) await expect.poll(() => outboxValues(page, path(poles[i]!))).toEqual([{ raw, unit: 'µΩ', state: 'measured' }]);

  // The kernel: all three within 250 µΩ, the third restricted; the field and its helper show it.
  const restricted = await kernel(page, built.relatorioId, disjuntor.blockId);
  const cells = restricted.evaluation.tables[0]!.rows.map((row) => row.cells[0]!);
  expect(cells.map((cell) => cell.verdict)).toEqual(['within', 'within', 'restricted']);
  expect(restricted.reason).toBe('A ficha exige no mínimo Aprovado · Com restrições: leitura com restrição.');
  await expect(cellOf(page, poles[2]!).locator('.measurement-field')).toHaveAttribute('data-state', 'restricted');
  await expect(cellOf(page, poles[2]!).locator('.mf-helper[data-tone="restricted"]')).toHaveText(`Com restrição: ${cells[2]!.restriction!.text}`);
  for (const within of poles.slice(0, 2)) await expect(cellOf(page, within).locator('.measurement-field')).not.toHaveAttribute('data-state');
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.locator('.conclusion-hint:not(.e24-preview-line)')).toHaveText(restricted.reason!);

  // The manufacturer's 60 µΩ: one criterion_override op; the 70 µΩ pole now out, the floor Reprovado.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const entry = page.locator(`section[data-test-key="${TEST_KEY}"] input[data-manufacturer-input="${TEST_KEY}"]`);
  await entry.click();
  await page.keyboard.type('60');
  await page.keyboard.press('Enter');
  await expect.poll(() => outboxValues(page, `sheet/${disjuntor.blockId}/test/${TEST_KEY}/criterion_override`)).toEqual([{ raw: '60', unit: 'µΩ' }]);
  const out = await kernel(page, built.relatorioId, disjuntor.blockId);
  const judged = out.evaluation.tables[0]!.rows.map((row) => row.cells[0]!);
  expect(judged.map((cell) => cell.verdict)).toEqual(['within', 'within', 'out']);
  expect(out.reason).toBe('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério.');
  await expect(cellOf(page, poles[2]!).locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellOf(page, poles[2]!).locator('.mf-helper[role="status"]')).toContainText(judged[2]!.helperText!);
  await expect(cellOf(page, poles[2]!).locator('.mf-helper[data-tone="restricted"]')).toHaveCount(0);
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.locator('.conclusion-hint:not(.e24-preview-line)')).toHaveText(out.reason!);
});
