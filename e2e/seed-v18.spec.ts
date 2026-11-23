import { getSeed, SEED_VERSION, seedRule, type BlockRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * 28.2-E2E-001 (batch e28a, Story 28.2; Epic 28 opens seed v18). A new relatório, created as a person creates it at
 * 1280 px, is born on the current seed (v18, from the kernel), every sheet with it; its parecer is given and its
 * revision 1 is issued through the api's one queue and LibreOffice, and its PDF prints v17's words (the checklist's
 * "ITEM"), since v18 opens equal to v17. It runs in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;

interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');

test('@p0 28.2-E2E-001 a new relatório is born on v18, every sheet with it, and concludes and prints as a v17 one', async ({ page }) => {
  test.setTimeout(420_000);
  expect(SEED_VERSION).toBe('v18');
  // v18 opens with v17's rule flags and words.
  for (const flag of Object.keys(getSeed('v17', 'cabine_primaria').rules ?? {}) as Parameters<typeof seedRule>[1][]) expect(seedRule(SEED_VERSION, flag), flag).toBe(true);
  expect(getSeed(SEED_VERSION, 'cabine_primaria').checklist_columns[0]).toBe('ITEM');
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect
    .poll(async () => (await entities<{ seed_version: string }>(page)).find((record) => record.entity === 'relatorio' && record.id === relatorioId)?.row.seed_version, { timeout: 30_000 })
    .toBe(SEED_VERSION);
  const sheets = (await entities<BlockRow>(page)).filter((record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.equipment_id !== null).map((record) => record.row);
  expect(sheets.length).toBeGreaterThan(0);
  expect(new Set(sheets.map((sheet) => sheet.seed_version))).toEqual(new Set([SEED_VERSION]));

  // --- concluded (the parecer given) and issued ---
  await setParecer(page, relatorioId);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await expect(dialog).toBeVisible();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  let revisionId = '';
  await expect
    .poll(async () => {
      revisionId = (await entities<{ id: string; relatorio_id: string; number: number }>(page)).find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1)?.row.id ?? '';
      return revisionId;
    })
    .not.toBe('');
  const pdf = await page.request.get(`/api/revisions/${revisionId}/pdf`);
  expect(pdf.status()).toBe(200);
  const text = (await pdfTextItems(new Uint8Array(await pdf.body()))).join(' ');
  expect(text).toContain('ITEM C NC NA OBSERVAÇÕES');
  expect(text).not.toContain('ÍTEM');
});
