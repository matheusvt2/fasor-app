import { cellAddressesOf, getDefinition, naoEnsaiadasText, SEED_VERSION, type BlockRow, type FieldDef, type JsonValue } from '@app/domain';
import type { Page } from '@playwright/test';
import { cellOf, outbox, stepper } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { expandLocation } from './support/tree.ts';

/*
 * Story 25.6 (M07, decision 6; Story 25.1 Part B's frame `60-ficha.html` #ficha-conc-dj02), on a new relatório
 * (seed v15) at 1280 px: a breaker whose plate and checklist came from the office, every item Conforme and every
 * reading "Não medido" but one, which the technician marks "Não medido" from the cell's Overflow. Opened from the
 * tree, its Conclusão step offers no Aprovado (disabled), says why on the reason line, asks no restriction and
 * offers "Marcar não ensaiado"; a tap on the disabled Aprovado writes nothing. "Marcar não ensaiado" opens the
 * existing dialog; marked with a reason, the sheet's `not_tested` is in the outbox and in the store, and the
 * Sumário's count reads one "não ensaiada". Every expected sentence is the kernel's or the frame's.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TYPE = 'disjuntor_mt';
// authored (Story 25.6, for Bruno): the reason line of the frame, verbatim.
const REASON = 'Nenhum ensaio foi medido nesta ficha. Registre as medições ou marque a ficha como não ensaiada.';
const resultGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Resultado' });
const restrictionGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Restrições' });
const conclusao = (page: Page) => page.locator('#ficha-conc');

/** A plate value by kind, as a technician might type it; a select takes its first option. */
function plateValue(field: FieldDef, n: number): JsonValue {
  switch (field.kind) {
    case 'text':
      return `E25C6-${n + 1}`;
    case 'manufacturer':
      return 'Fabricante E2E';
    case 'number':
      return { raw: String(100 + n * 10), unit: field.unit ?? null, state: 'measured' };
    case 'date':
      return '2020-03-15';
    case 'voltage_class':
      return '15';
    case 'select':
      return field.options![0]!;
  }
}

/** The block row as the device's store holds it (E12-A6). */
async function storedBlock(page: Page, blockId: string): Promise<BlockRow> {
  const records = await readStore<{ entity: string; id: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.id === blockId)!.row;
}

test('@p0 25.6-E2E-001 a v15 breaker with every reading "Não medido": Aprovado refused with its reason, "Marcar não ensaiado" from the Conclusão step, the Sumário counts it not tested', async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const breaker = built.sheets.find((sheet) => sheet.blockType === TYPE)!;
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', TYPE);
  expect(SEED_VERSION).toBe('v15');
  const scope = { relatorioId: built.relatorioId };
  // Every capture "Não medido" from the office but the last insulation one, left for the technician.
  const captures = definition.tests.flatMap((t) => cellAddressesOf(definition, t.key));
  const last = captures.filter((address) => address.testKey === 'isolacao').at(-1)!;
  const unit = (testKey: string) => (testKey === 'isolacao' ? 'GΩ' : 'µΩ');
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    ...definition.nameplate.map((field, n) => officeDraft(account, scope, `sheet/${breaker.blockId}/nameplate/${field.key}`, plateValue(field, n))),
    ...definition.checklist!.map((item) => officeDraft(account, scope, `sheet/${breaker.blockId}/checklist/${item.key}/result`, 'C')),
    ...captures
      .filter((address) => address !== last)
      .map((address) => officeDraft(account, scope, `sheet/${breaker.blockId}/test/${address.testKey}/cell/${address.row}/${address.col}`, { raw: '', unit: unit(address.testKey), state: 'not_measured' })),
  ]);

  // From the tree: section 8's local, the breaker's row.
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: naoEnsaiadasText(0), exact: true })).toBeVisible();
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 8' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, breaker.locationName);
  const row = page.locator(`li.s9-eq[data-block-id="${breaker.blockId}"]`);
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${breaker.blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  // The last reading "Não medido" from the cell's Overflow.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const cell = cellOf(page, last.testKey, last.row, last.col);
  await cell.getByRole('button', { name: /^Mais opções de / }).click();
  await page.getByRole('menuitem', { name: 'Não medido' }).click();
  const lastPath = `sheet/${breaker.blockId}/test/${last.testKey}/cell/${last.row}/${last.col}`;
  await expect.poll(async () => (await outbox(database, page)).filter((op) => op.path === lastPath).at(-1)?.value).toMatchObject({ raw: '', state: 'not_measured' });
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible();

  // The Conclusão step: Aprovado disabled, the reason line, no Restrições group, "Marcar não ensaiado".
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const aprovado = resultGroup(page).getByRole('radio', { name: 'Aprovado' });
  await expect(aprovado).toBeDisabled();
  await expect(resultGroup(page).getByRole('radio', { name: 'Reprovado' })).toBeEnabled();
  await expect(conclusao(page).locator('.conclusion-hint.e25-reason')).toHaveText(REASON);
  await expect(resultGroup(page)).toHaveAccessibleDescription(REASON);
  await expect(restrictionGroup(page)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Prévia da conclusão' })).toHaveCount(0);
  // A tap on the disabled segment writes nothing.
  await aprovado.click({ force: true });
  expect((await outbox(database, page)).filter((op) => op.path === `sheet/${breaker.blockId}/conclusion/result`)).toEqual([]);

  // "Marcar não ensaiado" opens the existing dialog with its reasons.
  await conclusao(page).locator('.e24-point-place').getByRole('button', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Outro' }).click();
  await dialog.getByLabel('Descreva o motivo').fill('Disjuntor sem janela de desligamento');
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('toast')).toContainText('Marcada como não ensaiada');
  await expect
    .poll(async () => (await outbox(database, page)).filter((op) => op.path === `block/${breaker.blockId}/not_tested`).at(-1)?.value)
    .toMatchObject({ reason: 'outro', text: 'Disjuntor sem janela de desligamento' });
  await expect.poll(async () => (await storedBlock(page, breaker.blockId)).not_tested?.reason).toBe('outro');
  // Nothing wrote a result by itself.
  expect((await storedBlock(page, breaker.blockId)).sheet.conclusion.result?.value ?? null).toBeNull();

  // The Sumário counts it under "Não ensaiadas".
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('button', { name: naoEnsaiadasText(1), exact: true })).toBeVisible({ timeout: 30_000 });
});
