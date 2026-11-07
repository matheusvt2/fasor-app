import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openTransformerSheet } from './support/reading-ops.ts';

/*
 * Story 17.5 (F42, E15-A2; Bruno's answer 6 of 2026-10-27): a ratio row INSATISFATÓRIO feeds
 * the conclusion and the parecer, driven as the engineer does on a fresh standard relatório of
 * Empresa B (no fixed ids): the transformer's ratio typed with one capture out, the Conclusão
 * section read and set, then Dados do relatório › Etapa 6 read. Stories 22.4 and 22.6: the
 * failed ratio sets the floor Reprovado · Com restrições (Aprovado and Sem restrições
 * disabled, one reason line) and the derived verdict Não apto. The words asserted are the
 * kernel's (`conclusionFloorReasonText`, `parecerReasonText`, `composeParecer`).
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

test('@p0 17.5-E2E-001 22.4-E2E 22.6-E2E a transformer ratio row INSATISFATÓRIO sets the floor Reprovado · Com restrições (looser segments disabled), and the parecer is Não apto naming the sheet and the ratio', async ({
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
  // Story 21.1 (seed v11): the group the ratio follows; Dyn1 keeps U1 · √3 / U2.
  await field(page, 'ligacao_secundaria').locator('select').selectOption('Dyn1');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/ligacao_secundaria`)).toBe('Dyn1');

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

  // The Conclusão: the failed ratio alone sets the floor Reprovado · Com restrições, shown before any tap.
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const result = page.getByRole('radiogroup', { name: 'Resultado' });
  const restriction = page.getByRole('radiogroup', { name: 'Restrições' });
  await expect(result).toBeVisible();
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Reprovado · Com restrições?');
  await expect(result.getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(restriction.getByRole('radio', { name: 'Com restrições', exact: true })).toHaveAttribute('aria-checked', 'true');
  // Looser segments are disabled, with the kernel's one reason line.
  await expect(result.getByRole('radio', { name: 'Aprovado', exact: true })).toBeDisabled();
  await expect(restriction.getByRole('radio', { name: 'Sem restrições', exact: true })).toBeDisabled();
  const reason = page.locator('.conclusion-control .conclusion-hint').first();
  await expect(reason).toHaveText('A ficha exige no mínimo Reprovado · Com restrições: relação de transformação insatisfatória.');
  await expect(result).toHaveAccessibleDescription('A ficha exige no mínimo Reprovado · Com restrições: relação de transformação insatisfatória.');

  // The suggestion's Confirmar writes the floor pair, one batch.
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => lastValue(page, `sheet/${blockId}/conclusion/result`)).toBe('reprovado');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/conclusion/restriction`)).toBe('com_restricoes');
  await expect(suggestion).toHaveCount(0);

  // Com restrições requires the observation; typed, the composed text is confirmed.
  const observation = page.getByLabel('Observações da ficha', { exact: true });
  await observation.fill('Relação de transformação fora do critério em uma fase.');
  await observation.press('Tab');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/observations`)).toBe('Relação de transformação fora do critério em uma fase.');
  const generated = page.locator('.ficha-conc-text .suggestion-field.is-generated');
  await expect(generated.locator('.criteria-line')).toContainText('42,29 % · critério ±0,5 %');
  await generated.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => lastValue(page, `sheet/${blockId}/conclusion/text_status`)).toBe('confirmed');
  const text = String(await lastValue(page, `sheet/${blockId}/conclusion/text`));
  expect(text).toContain('desvio de relação de transformação de 42,29 %');
  expect(text).toContain('Recomenda-se a correção dos pontos indicados antes da próxima manutenção.');

  // Etapa 6: the derived verdict is Não apto; Apto and Apto com restrições are disabled with the reason; the summary names the sheet and the ratio.
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  const verdicts = page.getByRole('radiogroup', { name: 'Parecer' });
  await expect(verdicts.getByRole('radio', { name: 'Não apto', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(verdicts.getByRole('radio', { name: 'Apto', exact: true })).toBeDisabled();
  await expect(verdicts.getByRole('radio', { name: 'Apto com restrições', exact: true })).toBeDisabled();
  await expect(page.locator('.conclusion-hint').first()).toHaveText(/^O relatório exige no mínimo Não apto: 1 ficha reprovada \(.+\)\.$/);
  await expect(page.locator('.parecer-box .pb-verdict')).toHaveText('Não apto');
  const summary = page.locator('.suggestion-field.is-generated');
  // Read-only: no Confirmar, Editar or Substituir.
  await expect(summary.getByRole('button')).toHaveCount(0);
  await expect(summary.locator('.generated-text')).toContainText(/1 ficha foi reprovada por relação de transformação insatisfatória \(.+\)\./);
  // e22f N1: the Reprovado sheet is named once, with its reason; no separate ratio sentence repeats it.
  await expect(summary.locator('.generated-text')).not.toContainText('Relação de transformação insatisfatória em');
  // e22f N1: the Critérios line names it once, as reprovada.
  await expect(summary.locator('.criteria-line')).toContainText(/1 reprovada \(.+\)/);
  await expect(summary.locator('.criteria-line')).not.toContainText('relação de transformação insatisfatória');
  // No verdict op was written: the derived one stands.
  expect((await outbox(page)).filter((row) => row.path === 'relatorio/setup/parecer')).toEqual([]);
});
