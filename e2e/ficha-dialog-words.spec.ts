import { sheetChecklistPath, sheetConclusionPath, sheetObservationsPath } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { openStep, outboxValues, stepper } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { expectCameraOpen, openChaveSheet, shoot } from './support/photos.ts';

/*
 * Story 27.13 (batch e27c, F17 to F19 of the 2026-11-21 pass), on a Chave seccionadora of a new relatório at 1024 px:
 * - an item just marked NC carries no red "Obrigatória" (its field is still what a conclude finds); left empty, it does;
 * - the caption dialog shows one hint by its state: a caption the rows generated, the text edited by hand, nothing composed;
 * - the conclusion's three buttons (the adjusted pair, the text, the sheet observation) read and are named apart, and
 *   "Confirmar observação" and "Confirmar resultado" each commit their own put.
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const contatos = (page: Page) => page.locator('#ficha-step-verificacoes li.checklist-row[data-item-key="contatos"]');
const conclusion = (page: Page) => page.locator('#ficha-conc');
const GENERATED = 'Legenda gerada';
const EDITED = 'Texto editado à mão. Desligue Editar texto para montar pelas opções.';
const COMPOSED = 'A legenda é montada com os três campos abaixo.';

/** Which of the three caption hints the dialog shows. */
async function hintsShown(composer: Locator): Promise<string[]> {
  const shown: string[] = [];
  for (const hint of [GENERATED, EDITED, COMPOSED]) if ((await composer.getByText(hint, { exact: true }).count()) > 0) shown.push(hint);
  return shown;
}

test('@p0 27.13-E2E-001 one hint at a time in the caption dialog, Confirmar buttons that say what they write, "Obrigatória" only after the field is left', async ({ page }) => {
  test.setTimeout(180_000);
  const { blockId } = await openChaveSheet(page, account, database, { width: 1024 });

  // The pair stored first (Aprovado · Sem restrições), so an NC item later makes it looser than its floor.
  await openStep(page, '', blockId, 'Conclusão');
  await conclusion(page).getByRole('radio', { name: 'Aprovado', exact: true }).click();
  await conclusion(page).getByRole('radio', { name: 'Sem restrições', exact: true }).click();
  await expect.poll(() => outboxValues(database, page, sheetConclusionPath(blockId, 'restriction'))).toEqual(['sem_restricoes']);
  await expect.poll(() => outboxValues(database, page, sheetConclusionPath(blockId, 'result'))).toEqual(['aprovado']);

  // F19: NC marked, the field required for the conclude path but no red mark; left empty, the mark and its reason.
  await stepper(page).getByRole('button', { name: /^Verificações,/ }).click();
  await contatos(page).getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect.poll(() => outboxValues(database, page, sheetChecklistPath(blockId, 'contatos', 'result'))).toEqual(['NC']);
  const field = contatos(page).getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute('data-missing-field', '');
  await expect(field).not.toHaveAttribute('aria-invalid');
  await expect(field).not.toHaveAttribute('data-required');
  await expect(contatos(page).getByText('Obrigatória em item não conforme')).toHaveCount(0);
  await field.click();
  await page.keyboard.press('Tab');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription('Obrigatória em item não conforme');

  // F17: the photo of the NC item, its caption dialog in each state.
  await contatos(page).getByRole('button', { name: 'Adicionar foto' }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  await contatos(page).locator('.photo-list .photo-row').first().getByRole('button', { name: 'Legendar' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda' });
  await expect(composer).toBeVisible();
  // Generated from the rows.
  await expect(composer.locator('.caption-preview')).not.toHaveText('');
  expect(await hintsShown(composer)).toEqual([GENERATED]);
  // Edited by hand.
  await composer.getByRole('button', { name: 'Editar texto' }).click();
  await expect(composer.getByRole('textbox', { name: 'Texto da legenda' })).toBeVisible();
  expect(await hintsShown(composer)).toEqual([EDITED]);
  // Back to the rows, then every pressed chip released: nothing composed.
  await composer.getByRole('button', { name: 'Editar texto' }).click();
  expect(await hintsShown(composer)).toEqual([GENERATED]);
  for (let pressed = composer.locator('.caption-part .chip[aria-pressed="true"]'); (await pressed.count()) > 0; ) await pressed.first().click();
  await expect(composer.locator('.caption-preview')).toHaveText('');
  expect(await hintsShown(composer)).toEqual([COMPOSED]);
  await composer.getByRole('button', { name: 'Voltar sem alterar' }).click();
  await expect(composer).toHaveCount(0);

  // The NC item's observation, typed and left.
  await field.fill('Contato com desgaste');
  await page.keyboard.press('Tab');
  await expect.poll(() => outboxValues(database, page, sheetChecklistPath(blockId, 'contatos', 'observation'))).toEqual(['Contato com desgaste']);
  await expect(field).not.toHaveAttribute('aria-invalid');

  // F18: the adjusted pair, the text and the sheet observation pending: three buttons, three words, three names.
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const result = conclusion(page).getByRole('button', { name: 'Confirmar resultado', exact: true });
  const text = conclusion(page).getByRole('button', { name: 'Confirmar texto', exact: true });
  const observation = page.locator('#ficha-step-conclusao').getByRole('button', { name: 'Confirmar observação', exact: true });
  for (const button of [result, text, observation]) await expect(button).toBeVisible();
  const words = await Promise.all([result, text, observation].map((button) => button.innerText()));
  expect(new Set(words.map((word) => word.trim())).size).toBe(3);
  await expect(page.locator('#ficha-step-conclusao').getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);

  // Each writes its own put.
  await observation.click();
  await expect.poll(async () => (await outboxValues(database, page, sheetObservationsPath(blockId))).length).toBe(1);
  await expect(observation).toHaveCount(0);
  await result.click();
  await expect.poll(() => outboxValues(database, page, sheetConclusionPath(blockId, 'restriction'))).toEqual(['sem_restricoes', 'com_restricoes']);
  await expect(result).toHaveCount(0);
  await expect(text).toBeVisible();
});
