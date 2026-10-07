import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openChaveSheet } from './support/photos.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';

/*
 * 13.8-E2E (AI-3, E8-A6): "Conferir antes de emitir" driven as a person would, through the
 * real audit job of the compose api under `LLM_PROVIDER=fake` (its canned findings, one per
 * kind, their refs resolved against the relatório the job assembles; this relatório has no
 * photo, so the caption finding is skipped). Nothing here seeds a server op: the route
 * creates the run, the job fills it, "Sincronizar" pulls it. The findings are information
 * only: no op leaves the device for them, and "Gerar relatório" still issues.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const FINDINGS = 'Pontos apontados pela conferência por IA';
const NOTE = 'Feita por IA: aponta pontos para você conferir. Nada é alterado no relatório.';
/** The api's queue pick-up and one fake call, then the 3 s pull of the dialog. */
const AUDIT_TIMEOUT = 90_000;

const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const auditButton = (scope: Locator) => scope.getByRole('button', { name: /^(Conferir antes de emitir|Conferindo…)$/ });

interface EntityRecord {
  entity: string;
  id: string;
  row: { status?: string; findings?: unknown[] };
}

interface OutboxRecord {
  op_id: string;
  path: string;
}

const outboxIds = async (page: Page) => (await readStore<OutboxRecord>(page, database, 'outbox')).map((row) => row.op_id).sort();

/** The real account answer with the server's AI features off (`ai-features-off.spec.ts`). */
async function aiFeaturesOff(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/account',
    async (route) => {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const body = (await response.json()) as Record<string, unknown>;
      return route.fulfill({ response, json: { ...body, features: { ai: false } } });
    },
  );
}

/** The Sumário of a fresh relatório of Empresa B, its Export dialog open. */
async function openDialog(page: Page, relatorioId: string): Promise<Locator> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await footButton(page).click();
  const modal = dialog(page);
  await expect(modal).toBeVisible();
  return modal;
}

/** One tap, and the rows the real job's run brings back. */
async function audit(page: Page, modal: Locator): Promise<Locator> {
  await expect(modal.getByText('Conferência por IA')).toBeVisible();
  await expect(modal.getByText(NOTE)).toBeVisible();
  await auditButton(modal).click();
  const list = modal.getByRole('list', { name: FINDINGS });
  await expect(list).toBeVisible({ timeout: AUDIT_TIMEOUT });
  await expect(auditButton(modal)).toHaveText('Conferir antes de emitir', { timeout: AUDIT_TIMEOUT });
  return list;
}

test('@p0 13.8-E2E-001 one tap brings the findings to the dialog and the Sumário, "Ver" opens the sheet, nothing is written; with AI features off nothing of it shows', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const modal = await openDialog(page, relatorioId);
  const before = await outboxIds(page);

  const list = await audit(page, modal);
  // The fake's findings on this relatório: the first sheet, its first row, section 10.
  const rows = list.getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Conclusão e itens NC');
  await expect(rows.nth(1)).toContainText('Leitura fora do padrão');
  await expect(rows.nth(2)).toContainText('Parecer e restrições · Seção 10 · Conclusão e parecer');
  for (let i = 0; i < 3; i++) await expect(rows.nth(i).getByRole('button', { name: /^Ver / })).toBeVisible();
  await expect(modal.getByText('3 pontos para conferir')).toBeVisible();
  await expect(modal.getByText(/^Conferido às \d{2}:\d{2}$/)).toBeVisible();

  // The device holds the run as pulled; no op left (or waits to leave) the device for it.
  const runs = (await readStore<EntityRecord>(page, database, 'entities')).filter((record) => record.entity === 'audit_run');
  expect(runs).toHaveLength(1);
  expect(runs[0]!.row.status).toBe('done');
  expect(runs[0]!.row.findings).toHaveLength(3);
  expect(await outboxIds(page)).toEqual(before);
  expect((await readStore<OutboxRecord>(page, database, 'outbox')).some((row) => row.path.startsWith('audit_run'))).toBe(false);

  // A sheet's "Ver" lands on its ficha.
  const sheetRow = rows.nth(0);
  const label = (await sheetRow.getByRole('button', { name: /^Ver / }).getAttribute('aria-label'))!;
  await sheetRow.getByRole('button', { name: label }).click();
  await expect(page).toHaveURL(/\/relatorio\/[^/]+\/ficha\/[^/]+$/);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();

  // The Sumário shows the same rows under the AI note; a section's "Ver" marks its row.
  await page.goto(`/relatorio/${relatorioId}`);
  const block = page.locator('.sumario-audit');
  await expect(block.getByRole('heading', { name: 'Conferência por IA' })).toBeVisible({ timeout: 30_000 });
  await expect(block.getByText(NOTE)).toBeVisible();
  await expect(block.getByRole('list', { name: FINDINGS }).getByRole('listitem')).toHaveCount(3);
  await block.getByRole('button', { name: 'Ver Seção 10 · Conclusão e parecer' }).click();
  await expect(page.locator('.sumario .sum-row[data-row="section_10"]')).toHaveClass(/is-highlighted/);
  expect(await outboxIds(page)).toEqual(before);

  // AI features off: no button in the dialog and no findings block in either place.
  await aiFeaturesOff(page);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('releng.ai-features')), { timeout: 30_000 }).toBe('off');
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sumario-audit')).toHaveCount(0);
  await footButton(page).click();
  const off = dialog(page);
  await expect(off.getByRole('heading', { name: 'Gerar relatório' })).toBeVisible();
  await expect(off.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' })).toBeVisible();
  await expect(off.getByRole('button', { name: 'Conferir antes de emitir' })).toHaveCount(0);
  await expect(off.getByText('Conferência por IA')).toHaveCount(0);
  await expect(off.getByRole('list', { name: FINDINGS })).toHaveCount(0);
});

test('@p1 13.8-E2E-002 at 390 px the findings rows fit, and "Gerar relatório" still issues with findings present', async ({ page }) => {
  test.setTimeout(360_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await setParecer(page, relatorioId);
  await page.setViewportSize({ width: 390, height: 844 });
  const modal = await openDialog(page, relatorioId);
  const list = await audit(page, modal);
  const rows = list.getByRole('listitem');
  await expect(rows).toHaveCount(3);

  // Each row and its "Ver" sit inside the 390 px viewport; the dialog never scrolls sideways.
  for (let i = 0; i < 3; i++) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded();
    const box = (await row.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const see = (await row.getByRole('button', { name: /^Ver / }).boundingBox())!;
    expect(see.x + see.width).toBeLessThanOrEqual(390);
    expect(see.height).toBeGreaterThanOrEqual(44);
  }
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  // The issue is the same with findings on the device: the F-03 question, then the revision.
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await expect(modal.getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible();
});
