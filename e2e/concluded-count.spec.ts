import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openChaveSheet } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { syncNow } from './support/sync.ts';

/*
 * 14.10-E2E (Story 14.10 part 10, Matheus 2026-10-15): one concluded-sheet rule. A sheet
 * holding a pending suggestion is not concluded on the Home card, the Project (obra) row and
 * the Sumário header alike (the Sumário's Story 8.1 rule, `relatorioCounter`); tapping the
 * suggestion makes all three count it again.
 *
 * The test resets Empresa B, pushes a relatório of the standard template and opens the first
 * Chave seccionadora of Cubículo Enel; its conclusion and the reading's suggestion are written
 * from elsewhere (an office device, the reading job's server op) and pulled with "Sincronizar
 * agora".
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

/** The relatório's project id, read off the device's row. */
async function projectIdOf(page: Page, relatorioId: string): Promise<string> {
  const records = await readStore<{ entity: string; id: string; row: { project_id: string } }>(page, database, 'entities');
  return records.find((record) => record.entity === 'relatorio' && record.id === relatorioId)!.row.project_id;
}

/** The Sumário header's "n de N fichas concluídas" button. */
async function sumarioConcluded(page: Page, relatorioId: string): Promise<Locator> {
  await page.goto(`/relatorio/${relatorioId}`);
  const summary = page.getByRole('group', { name: 'Resumo do relatório' });
  await expect(summary).toBeVisible({ timeout: 30_000 });
  return summary.getByRole('button', { name: /fichas concluídas$/ });
}

/** The three surfaces' concluded counts agree on `concluded` of `total`. */
async function expectCounts(page: Page, ids: { relatorioId: string; projectId: string }, concluded: number, total: number): Promise<void> {
  await expect(await sumarioConcluded(page, ids.relatorioId)).toHaveText(`${concluded} de ${total} fichas concluídas`);
  await page.goto('/');
  const card = page.locator(`.relatorio-card[data-relatorio="${ids.relatorioId}"]`);
  await expect(card.locator('.card-state .progress-counter')).toHaveText(`${concluded} de ${total} fichas`, { timeout: 30_000 });
  await expect(card.locator('.card-state .progress-counter')).toHaveAttribute('data-state', 'pending');
  await page.goto(`/project/${ids.projectId}`);
  const row = page.locator(`.relatorio-list li[data-relatorio="${ids.relatorioId}"] .progress-counter`);
  await expect(row).toHaveText(`${concluded} de ${total} fichas`, { timeout: 30_000 });
  await expect(row).toHaveAttribute('data-state', 'pending');
}

test('@p0 14.10-E2E-032 a concluded sheet holding a pending suggestion is not counted on the Home card, the Project row and the Sumário alike; confirming the suggestion counts it on all three', async ({ page }) => {
  test.setTimeout(180_000);
  const sheet = await openChaveSheet(page, account, database);
  const projectId = await projectIdOf(page, sheet.relatorioId);
  const ids = { relatorioId: sheet.relatorioId, projectId };
  // The sheet concluded elsewhere.
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId: sheet.relatorioId }, `block/${sheet.blockId}/concluded_by`, { actor_id: account.userId, at: new Date().toISOString() }),
  ]);
  await syncNow(page);
  const concluded = await sumarioConcluded(page, sheet.relatorioId);
  await expect(concluded).toHaveText(/^1 de \d+ fichas concluídas$/);
  const total = Number(/^1 de (\d+) /.exec((await concluded.textContent()) ?? '')![1]);
  await expectCounts(page, ids, 1, total);

  // The reading's suggestion lands on the concluded sheet: none of the three counts it.
  const sid = await pushSuggestion(account.companyId, sheet.relatorioId, {
    targetPath: `sheet/${sheet.blockId}/nameplate/fabricacao`,
    value: 'Schneider',
    actorId: account.userId,
  });
  await syncNow(page);
  await expectCounts(page, ids, 0, total);

  // Confirmed on the sheet: all three count it again.
  await page.goto(`/relatorio/${sheet.relatorioId}/ficha/${sheet.blockId}`);
  await page.locator('#ficha-nameplate').getByRole('button', { name: 'Sugerido, Schneider, confirmar' }).click();
  await expect
    .poll(async () => {
      const records = await readStore<{ entity: string; id: string; row: { status: string } }>(page, database, 'entities');
      return records.find((record) => record.entity === 'suggestion' && record.id === sid)?.row.status;
    })
    .toBe('confirmed');
  await expectCounts(page, ids, 1, total);
});
