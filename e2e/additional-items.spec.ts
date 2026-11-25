import { SEED_VERSION } from '@app/domain';
import type { Page } from '@playwright/test';
import { escapeDialog } from './support/dialogs.ts';
import { outboxValues, setUpRelatorio } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';

/*
 * 28.9-E2E-001 (batch e28c, Story 28.9, B-15, contract 59; `50-relatorio-setup.html` `#setup-e28-items`), at 1280 px. On a
 * v18 relatório from the standard template, Etapa 6 shows "Itens adicionais" under the parecer, empty. The technician adds
 * two items and opens a third he leaves empty: two are stored, in order, and the empty one is not. A fourth typed and
 * removed from its menu goes, "Desfazer" puts it back, and it is removed again. After a reload the two items read in
 * order. A v17 relatório's Etapa 6 shows no list. The issued PDF prints the two items after section 10's fixed items and
 * before the validity line. It issues a revision through the api's one queue, so it runs in the queue lane. Every text is
 * invented.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const PATH = 'relatorio/setup/additional_items';
const FIRST = 'O ensaio de isolação dos cabos de saída da Coluna 4 foi feito em conjunto, pelo barramento, com as duas chaves fechadas.';
const SECOND = 'Os ajustes dos relés seguem o estudo de seletividade fornecido pelo cliente, que não foi revisado nesta manutenção.';
const EXTRA = 'Item digitado e removido.';

const band = (page: Page) => page.getByRole('group', { name: 'Itens adicionais' });
const item = (page: Page, n: number) => band(page).getByRole('textbox', { name: `Item adicional ${n}`, exact: true });
const stored = async (page: Page) => (await outboxValues(database, page, PATH)).at(-1);

async function openEtapa6(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
}

/** "Adicionar item", as a person taps it: a new empty row, focused. */
async function addItem(page: Page, n: number): Promise<void> {
  await band(page).getByRole('button', { name: 'Adicionar item', exact: true }).click();
  await expect(item(page, n)).toBeFocused();
  await expect(item(page, n)).toHaveValue('');
  await expect(item(page, n)).toHaveAttribute('placeholder', 'Escreva o item');
}

async function removeItem(page: Page, n: number): Promise<void> {
  await band(page).getByRole('button', { name: `Mais opções do item adicional ${n}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
}

test('@p0 28.9-E2E-001 v18: Etapa 6 takes two additional items (an empty third is not stored), removes and restores one, and the PDF prints them as topics in section 10; v17 shows no list', async ({ page }) => {
  test.setTimeout(420_000);
  // Batch e30b (Story 30.3): a new relatório is born on v19, which keeps `additional_items`.
  expect(SEED_VERSION).toBe('v19');
  const { relatorioId } = await setUpRelatorio(page, account, database);

  // A v17 relatório of the same company: its Etapa 6 has no list.
  const older = newRelatorioDrafts(account, { seedVersion: 'v17' });
  await pushDrafts(page, database, [...older.drafts, emCampoDraft(account, older.relatorioId)]);
  await openEtapa6(page, older.relatorioId);
  await expect(page.getByRole('radiogroup', { name: 'Parecer' })).toBeVisible();
  await expect(band(page)).toHaveCount(0);

  // v18: the list under the parecer, empty, with the frame's words.
  await openEtapa6(page, relatorioId);
  await expect(band(page)).toBeVisible();
  await expect(band(page)).toContainText('Observações do relatório inteiro. Cada item sai como um tópico na seção 10, depois dos itens fixos.');
  await expect(band(page).locator('.e28-empty')).toHaveText('Nenhum item adicional.');
  await expect(band(page).locator('.helper')).toHaveText('Um item vazio não é guardado.');

  // Two items typed, a third opened and left empty: two stored, in order.
  await addItem(page, 1);
  await item(page, 1).fill(FIRST);
  await item(page, 1).press('Tab');
  await expect.poll(() => stored(page)).toEqual([FIRST]);
  await expect(band(page).locator('.e28-empty')).toHaveCount(0);
  await addItem(page, 2);
  await item(page, 2).fill(SECOND);
  await item(page, 2).press('Tab');
  await expect.poll(() => stored(page)).toEqual([FIRST, SECOND]);
  const writes = (await outboxValues(database, page, PATH)).length;
  await addItem(page, 3);
  await item(page, 3).press('Tab');
  await expect(item(page, 3)).toBeVisible();
  expect((await outboxValues(database, page, PATH)).length).toBe(writes);

  // The empty row goes from its menu with nothing written; a typed one goes with "Desfazer" and comes back.
  await removeItem(page, 3);
  await expect(item(page, 3)).toHaveCount(0);
  expect((await outboxValues(database, page, PATH)).length).toBe(writes);
  await addItem(page, 3);
  await item(page, 3).fill(EXTRA);
  await item(page, 3).press('Tab');
  await expect.poll(() => stored(page)).toEqual([FIRST, SECOND, EXTRA]);
  await removeItem(page, 3);
  await expect.poll(() => stored(page)).toEqual([FIRST, SECOND]);
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('Item 3 removido');
  await toast.getByRole('button', { name: 'Desfazer' }).click();
  await expect(item(page, 3)).toHaveValue(EXTRA);
  await removeItem(page, 3);
  await expect.poll(() => stored(page)).toEqual([FIRST, SECOND]);
  await expect(item(page, 3)).toHaveCount(0);

  // After a reload the two items read in order.
  await page.reload();
  await expect(item(page, 1)).toHaveValue(FIRST, { timeout: 30_000 });
  await expect(item(page, 2)).toHaveValue(SECOND);
  await expect(item(page, 3)).toHaveCount(0);

  // The issued PDF: the two items after the fixed items, before the validity line.
  await setParecer(page, relatorioId, 'Apto');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await expect(dialog).toBeVisible();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await escapeDialog(page, dialog);
  let revisionId = '';
  await expect
    .poll(async () => {
      const records = await readStore<{ entity: string; row: { id: string; relatorio_id: string; number: number } }>(page, database, 'entities');
      revisionId = records.find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1)?.row.id ?? '';
      return revisionId;
    })
    .not.toBe('');
  const pdf = await page.request.get(`/api/revisions/${revisionId}/pdf`);
  expect(pdf.status()).toBe(200);
  const text = (await pdfTextItems(new Uint8Array(await pdf.body()))).join(' ').replace(/\s+/gu, ' ');
  // The last fixed item but one (the PDF may hyphenate "encontram-se" at a line end).
  const fixed = text.indexOf('deste relatório;');
  const first = text.indexOf('com as duas chaves fechadas.');
  const second = text.indexOf('que não foi revisado nesta manutenção.');
  const validity = text.indexOf('Este relatório tem validade apenas');
  expect(fixed, text.slice(-1500)).toBeGreaterThan(-1);
  expect(first).toBeGreaterThan(fixed);
  expect(second).toBeGreaterThan(first);
  expect(validity).toBeGreaterThan(second);
  expect(text).not.toContain(EXTRA);
});
