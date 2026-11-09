import { evaluateTest, getDefinition, manufacturerValueView, MANUFACTURER_PRINT_SUFFIX, MANUFACTURER_VALUE_REFUSAL, type BlockRow, type TestEvaluation } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Batch e23a (Story 23.3, absorbs 14.13; contract 34): the manufacturer's value of a test, as a person
 * records it on a new (seed v13) relatório at 1280 px. On the disjuntor's contact resistance a value the
 * fold would refuse ("-3") is refused inline and writes nothing; 80 µΩ typed offline is one
 * `criterion_override` op in the outbox, judges every row by < 80 µΩ, survives a reload and syncs;
 * "Limpar" brings < 250 µΩ back; set again, the issued DOCX prints ACEITÁVEL "<80 µΩ (fabricante)".
 * At 390 px the entry fits the screen. Every expected text is the kernel's. It issues a revision
 * through the api's one queue and LibreOffice, so it runs in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const outboxValues = async (page: Page, path: string) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const toast = (page: Page) => page.getByTestId('toast');

/** The block as this device stores it, and the kernel's evaluation of one of its tests. */
async function kernel(page: Page, blockId: string, testKey: string): Promise<{ block: BlockRow; evaluation: TestEvaluation; view: NonNullable<ReturnType<typeof manufacturerValueView>> }> {
  const record = (await readStore<{ entity: string; id: string; row: BlockRow }>(page, database, 'entities')).find((row) => row.entity === 'block' && row.id === blockId)!;
  const block = record.row;
  const definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  const test = definition.tests.find((candidate) => candidate.key === testKey)!;
  return { block, evaluation: evaluateTest(block, definition, test), view: manufacturerValueView(block, definition, test)! };
}

test('@p0 23.3-E2E-001 the manufacturer\'s value on a v13 disjuntor: refused inline when malformed, 80 µΩ typed offline judges every row by < 80 µΩ, survives a reload and syncs, "Limpar" brings < 250 µΩ back, and the DOCX prints "<80 µΩ (fabricante)"', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const disjuntor = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const transformer = built.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  // A seccionadora marked not tested from the office, its contact holding 80 µΩ: the read-only entry.
  const chave = built.sheets.find((sheet) => sheet.blockType === 'chave_seccionadora')!;
  const scope = { relatorioId: built.relatorioId };
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, scope, `sheet/${chave.blockId}/test/resistencia_contato/criterion_override`, { raw: '80', unit: 'µΩ' }),
    officeDraft(account, scope, `block/${chave.blockId}/not_tested`, { reason: 'solicitacao_cliente', text: null, at: new Date().toISOString(), by: account.userId }),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${disjuntor.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();

  const section = page.locator('section[data-test-key="resistencia_contato"]');
  const entry = section.locator('.v13-mfr');
  const input = section.locator('input[data-manufacturer-input="resistencia_contato"]');
  const criterion = section.locator('.mt-criterion');
  const path = `sheet/${disjuntor.blockId}/test/resistencia_contato/criterion_override`;
  const empty = await kernel(page, disjuntor.blockId, 'resistencia_contato');
  expect(empty.block.seed_version).toBe('v13');
  await expect(entry.locator('.field-label')).toHaveText('Valor do fabricante');
  await expect(entry.locator('.mfr-op')).toHaveText(empty.view.operator);
  await expect(entry.locator('.mfr-note')).toHaveText(`${empty.view.note.lead}${empty.view.note.criterion}${empty.view.note.tail}`);
  await expect(criterion).toHaveText(`Aceitável ${empty.evaluation.criterionText}`);
  await expect(input).toHaveAccessibleName('Valor do fabricante, Ensaio de resistência ôhmica de contato');

  // A value the fold refuses: the kernel's refusal under the entry, nothing in the outbox.
  await input.click();
  await page.keyboard.type('-3');
  await page.keyboard.press('Enter');
  await expect(entry.locator('.helper[data-tone="red"]')).toHaveText(MANUFACTURER_VALUE_REFUSAL);
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(await outboxValues(page, path)).toEqual([]);

  // 80 µΩ typed offline: one op, every row judged by it.
  await context.setOffline(true);
  await input.fill('80');
  await page.keyboard.press('Enter');
  await expect.poll(() => outboxValues(page, path)).toEqual([{ raw: '80', unit: 'µΩ' }]);
  await expect(entry.locator('.helper[data-tone="red"]')).toHaveCount(0);
  const set = await kernel(page, disjuntor.blockId, 'resistencia_contato');
  expect(set.evaluation.manufacturer?.criterionText).toBe('<80 µΩ');
  await expect(criterion).toHaveText(`Aceitável ${set.evaluation.criterionText}`);
  await expect(entry.locator('.mfr-note')).toHaveText(`${set.view.note.lead}${set.view.note.criterion}${set.view.note.tail}`);
  await section.locator('summary', { hasText: 'Fonte do critério' }).click();
  await expect(section.locator('.mt-source [data-source-line]')).toHaveText(set.evaluation.sourceLines!);
  // Two readings: 100 µΩ out of < 80 µΩ (within the seeded < 250 µΩ), 70 µΩ within.
  const first = section.locator('.ficha-cell[data-cell="resistencia_contato:0:0"]').filter({ visible: true });
  await first.locator('input.mf-value').click();
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await page.keyboard.type('70');
  await page.keyboard.press('Enter');
  const judged = await kernel(page, disjuntor.blockId, 'resistencia_contato');
  const helper = judged.evaluation.tables[0]!.rows[0]!.cells[0]!.helperText!;
  expect(helper).toBe('Acima do aceitável (<80 µΩ)');
  await expect(first.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(first.locator('.mf-helper[role="status"]')).toContainText(helper);
  await expect(section.locator('.ficha-cell[data-cell="resistencia_contato:1:0"]').filter({ visible: true }).locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');

  // Back online: a reload keeps it, and a sync sends it.
  await context.setOffline(false);
  await page.reload();
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(input).toHaveValue('80', { timeout: 30_000 });
  await expect(criterion).toHaveText('Aceitável <80 µΩ');
  await syncNowAndReturn(page);
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0');
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(input).toHaveValue('80', { timeout: 30_000 });

  // "Limpar": a null put, the seeded criterion again.
  await entry.getByRole('button', { name: 'Limpar' }).click();
  await expect.poll(async () => (await outboxValues(page, path)).at(-1)).toBeNull();
  await expect(criterion).toHaveText(`Aceitável ${empty.evaluation.criterionText}`);
  await expect(input).toHaveValue('');
  await expect(entry.getByRole('button', { name: 'Limpar' })).toHaveCount(0);
  await expect(first.locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');

  // A v13 transformer's insulation: 5 typed, the unit cycle tapped to GΩ, one op, every row judged by ≥ 5 GΩ.
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${transformer.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const tfSection = page.locator('section[data-test-key="isolacao"]');
  const tfInput = tfSection.locator('input[data-manufacturer-input="isolacao"]');
  const tfPath = `sheet/${transformer.blockId}/test/isolacao/criterion_override`;
  await tfInput.click();
  await page.keyboard.type('5');
  await tfSection.locator('.v13-mfr .unit-cycle').click();
  await expect.poll(() => outboxValues(page, tfPath)).toEqual([{ raw: '5', unit: 'GΩ' }]);
  const tfKernel = await kernel(page, transformer.blockId, 'isolacao');
  expect(tfKernel.evaluation.criterionText).toBe('≥ 5 GΩ');
  await expect(tfSection.locator('.mt-criterion')).toHaveText(`Aceitável ${tfKernel.evaluation.criterionText}`);
  await expect(tfSection.locator('.v13-mfr .mfr-op')).toHaveText(tfKernel.view.operator);

  // The not-tested seccionadora: the stored value as text, no entry, no "Limpar".
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${chave.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const readOnly = page.locator('section[data-test-key="resistencia_contato"] .v13-mfr');
  await readOnly.scrollIntoViewIfNeeded();
  await expect(readOnly.getByRole('textbox', { name: 'Valor do fabricante, Ensaio de resistência ôhmica de contato' })).toHaveAttribute('aria-readonly', 'true');
  await expect(readOnly.locator('.mf-value')).toHaveText('80');
  await expect(readOnly.locator('.mf-unit')).toHaveText('µΩ');
  await expect(readOnly.locator('input')).toHaveCount(0);
  await expect(readOnly.getByRole('button', { name: 'Limpar' })).toHaveCount(0);

  // Back on the disjuntor: set again for the document; at 390 px the entry fits the screen.
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${disjuntor.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await input.fill('80');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await outboxValues(page, path)).at(-1)).toEqual({ raw: '80', unit: 'µΩ' });
  await page.setViewportSize({ width: 390, height: 844 });
  await entry.scrollIntoViewIfNeeded();
  const box = (await entry.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 900 });

  // The issued DOCX: the contact test's ACEITÁVEL is the value with " (fabricante)".
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const tables = extractStructure(Buffer.from(await response.body())).tables;
  const printed = (await kernel(page, disjuntor.blockId, 'resistencia_contato')).evaluation.manufacturer!.criterionText;
  const headers = tables.filter((table) => table[0]?.[0] === 'ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO' && table[1]?.at(-1) === 'ACEITÁVEL');
  expect(headers.map((table) => table[2]!.at(-1))).toContain(`${printed}${MANUFACTURER_PRINT_SUFFIX}`);
});
