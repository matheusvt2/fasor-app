import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openTransformerSheet } from './support/reading-ops.ts';

/*
 * Story 17.5 (F42, E15-A2; Bruno's answer 6 of 2026-10-27): a ratio row INSATISFATÓRIO feeds
 * the conclusion suggestion, the "Sem restrições" warning and the parecer counts, driven as
 * the engineer does on a fresh standard relatório of Empresa B (no fixed ids): the
 * transformer's ratio typed with one capture out, the Conclusão section read and set, then
 * Dados do relatório › Etapa 6 read. The words asserted are the kernel's (`restrictionWarning`,
 * `composeParecer`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  value: unknown;
}

const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`[data-field-key="${key}"]`);
const cellInput = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const lastValue = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).at(-1)?.value;

test('@p0 17.5-E2E-001 a transformer ratio row INSATISFATÓRIO suggests "Aprovado · Com restrições?", warns under "Sem restrições", and the parecer counts the sheet with restrictions and names the ratio in its Critérios line', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { relatorioId, blockId } = await openTransformerSheet(page, account, database, { width: 1280 });

  // QA G2 (fx17r): while TAP ATUAL is blank, a ratio cell is named by its column alone, never ", V primário".
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(cellInput(page, 'V primário')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^, / })).toHaveCount(0);
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();

  // The plate's TAP ATUAL names the ratio row ("5"), as `ficha.spec.ts` UX-F42 types it.
  const tap = field(page, 'tap_atual').locator('input').first();
  await tap.fill('5');
  await tap.press('Tab');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/tap_atual`)).toBe('5');

  // 13,8 kV · √3 / 380 V = 62,90: 62,8 is within ±0,5 %, 36,3 is out (42,29 %).
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const row = page.locator('table.ficha-ttr tbody tr').first();
  await cellInput(page, '5, V primário').click();
  for (const value of ['13,8', '380', '62,8', '36,3', '62,8']) {
    await page.keyboard.type(value);
    await page.keyboard.press('Tab');
  }
  await expect(row.locator('td.cell-calc').first()).toContainText('62,90');
  await expect(row.locator('td').last()).toContainText('Insatisfatório');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/test/relacao_transformacao/cell/0/5`)).toEqual({ raw: '62.8', unit: null, state: 'measured' });

  // The Conclusão: the failed ratio alone suggests "Com restrições".
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const result = page.getByRole('radiogroup', { name: 'Resultado' });
  const restriction = page.getByRole('radiogroup', { name: 'Restrições' });
  await expect(result).toBeVisible();
  await expect(page.getByRole('group', { name: 'Sugestão' })).toContainText('Aprovado · Com restrições?');

  // "Aprovado" and "Sem restrições" tapped over it: the authored warning names the row.
  await result.getByRole('radio', { name: 'Aprovado', exact: true }).click();
  await restriction.getByRole('radio', { name: 'Sem restrições', exact: true }).click();
  await expect(restriction.getByRole('radio', { name: 'Sem restrições', exact: true })).toHaveAttribute('aria-checked', 'true');
  const warning = page.locator('.conclusion-control .conclusion-hint');
  await expect(warning).toHaveText('Há relação de transformação insatisfatória em TAP 5');

  // "Com restrições": the warning goes, the observation is required and typed, the composed text confirmed.
  await restriction.getByRole('radio', { name: 'Com restrições', exact: true }).click();
  await expect(warning).toHaveCount(0);
  await expect.poll(() => lastValue(page, `sheet/${blockId}/conclusion/restriction`)).toBe('com_restricoes');
  const observation = page.getByLabel('Observações da ficha', { exact: true });
  await observation.fill('Relação de transformação fora do critério em uma fase.');
  await observation.press('Tab');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/observations`)).toBe('Relação de transformação fora do critério em uma fase.');
  const generated = page.locator('.ficha-conc-text .suggestion-field.is-generated');
  await expect(generated.locator('.criteria-line')).toContainText('42,29 % · critério ±0,5 %');
  await generated.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => lastValue(page, `sheet/${blockId}/conclusion/text_status`)).toBe('confirmed');
  expect(String(await lastValue(page, `sheet/${blockId}/conclusion/text`))).toContain('desvio de relação de transformação de 42,29 %');
  // E12-A6: the restriction the engineer chose is the one in the outbox.
  expect(await lastValue(page, `sheet/${blockId}/conclusion/restriction`)).toBe('com_restricoes');

  // Etapa 6: the hint counts the sheet with restrictions; the summary and its Critérios line name the ratio.
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  const hint = page.locator('.conclusion-hint').first();
  await expect(hint).toContainText('Sugerido pelas contagens: Apto com restrições?');
  await expect(hint).toContainText('1 com restrições');
  const verdict = page.getByRole('radiogroup', { name: 'Parecer' }).getByRole('radio', { name: 'Apto com restrições', exact: true });
  await verdict.click();
  await expect(verdict).toHaveAttribute('aria-checked', 'true');
  const summary = page.locator('.suggestion-field.is-generated');
  await expect(summary.locator('.generated-text')).toContainText(/Relação de transformação insatisfatória em 1 ficha \(.+\)\./);
  await expect(summary.locator('.criteria-line')).toContainText(/relação de transformação insatisfatória \(.+\)/);
});
