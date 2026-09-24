import { DOCX_MIME } from '@app/domain';
import type { BrowserContext, Download, Page } from '@playwright/test';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { expect, signIn, test, TEST_SEED } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.ts';
import { createProjectFromHome, createRelatorio } from './support/relatorio-flow.ts';

/*
 * 4.8-E2E: "Gerar relatório" driven as a person would, from the Sumário's foot button
 * (Story 4.3) through the Export dialog (`73-exportar.html`) to the DOCX download. The job
 * runs for real in the api container (LibreOffice, two TOC passes), so each generation
 * takes seconds: the timeouts below are the job's, not the UI's.
 *
 * Two starting points: a relatório born from Home a moment before (223 ops still on
 * their way when the dialog asks for them), and the small Porto Seguro fixture seeded onto
 * Empresa B (Em campo, so the status ops `generate` and `issue` both apply).
 */

const account = TEST_SEED.companies[1];

const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
const reason = (page: Page) => dialog(page).locator('.generate-row .btn-reason');
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');

const IDLE_1 = 'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.';
const OFFLINE = 'Gerar relatório precisa de conexão. Conecte e tente de novo.';
const ADDITIONAL_INFO = 'Parada programada de 36 horas';
const FAILED = 'Não foi possível gerar o relatório. Os dados não foram alterados e nenhuma revisão foi criada.';
/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;

/** The small fixture's Sumário, pulled onto this device (AD-8: opening it asks for the stream). */
async function openFixtureSumario(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  await expect(page.locator('.app-bar h1')).toHaveText('Sumário', { timeout: 30_000 });
  await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });
}

/**
 * Presses "DOCX — abrir no Word" (or a row's "DOCX") and returns the download it starts in
 * the new tab. The listener is attached before the click: the download can begin before a
 * later `waitForEvent` would be registered.
 */
async function downloadFrom(page: Page, context: BrowserContext, press: () => Promise<void>): Promise<Download> {
  const downloadPromise = new Promise<Download>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no download started within 30 s')), 30_000);
    const settle = (download: Download) => {
      clearTimeout(timer);
      resolve(download);
    };
    context.once('page', (popup) => popup.once('download', settle));
    page.once('download', settle);
  });
  await press();
  const download = await downloadPromise;
  for (const extra of context.pages()) if (extra !== page) await extra.close().catch(() => undefined);
  await page.bringToFront();
  return download;
}

test('@p0 4.8-E2E-001 a relatório born on Home: the Sumário\'s "Gerar relatório" generates revision 1, the DOCX downloads, the row lists it, and a second press answers the same revision', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB({ standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  // Q3: what Etapa 1's "Informações adicionais" says is what the cover prints.
  await createRelatorio(page, {
    whileOnSetup: async () => {
      await page.getByLabel('Informações adicionais').fill(ADDITIONAL_INFO);
    },
  });
  await expect(headerPill(page)).toHaveText('Rascunho');

  // The foot's button opens the dialog: modal, labelled by its title, idle with no revision.
  await footButton(page).click();
  const modal = dialog(page);
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(modal.getByRole('heading', { name: 'Gerar relatório' })).toBeVisible();
  await expect(modal.getByText('Nenhuma revisão gerada ainda.')).toBeVisible();
  await expect(reason(page)).toHaveText(IDLE_1);

  // Pressed with the creation batch possibly still in the outbox: the dialog drains it first
  // ("Enviando…", asserted in jsdom), then the working state.
  await generateButton(page).click();
  await expect(modal.locator('.gen-progress[role="status"]')).toContainText('Gerando revisão 1…', { timeout: 60_000 });
  await expect(modal.locator('.gen-progress')).toContainText('pode fechar — o aviso chega quando terminar');
  await expect(generateButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(reason(page)).toHaveText('Gerando a revisão 1 — DOCX e PDF juntos');

  // "pode fechar": Esc closes, the focus returns to the foot's button, and reopening shows
  // the same working state.
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(footButton(page)).toBeFocused();
  await footButton(page).click();
  await expect(dialog(page).locator('.gen-progress')).toContainText('Gerando revisão 1…');

  // The revision arrives: the toast, the result block, the row.
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX', { timeout: JOB_TIMEOUT });
  await expect(modal.getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible();
  await expect(modal.locator('.t-meta time')).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  // A Rascunho relatório has no `generate` row in the status table: the pill stays.
  await expect(modal.locator('.row-wrap .status-pill')).toHaveText('Rascunho');
  await expect(modal.locator('.row-wrap .t-meta')).toHaveText('Qualquer alteração a partir de agora gera a revisão 2.');
  const row = modal.locator('.revision-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.rev-text')).toHaveText(new RegExp(`^Rev\\. 1 — \\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2} — ${account.name}$`));

  // "DOCX — abrir no Word" downloads the revision's DOCX from the api.
  const download = await downloadFrom(page, context, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  expect(download.url()).toMatch(/\/api\/revisions\/[0-9a-f-]{36}\/docx$/);
  expect(download.suggestedFilename()).toBe('relatorio-rev-1.docx');
  const response = await page.request.get(download.url());
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe(DOCX_MIME);
  const bytes = await response.body();
  expect(bytes.byteLength).toBeGreaterThan(1000);
  const cover = extractStructure(Buffer.from(bytes)).tables[0]!;
  expect(cover.find((row) => row[0] === 'Informações adicionais')).toEqual(['Informações adicionais', ADDITIONAL_INFO]);
  // The Revisões row's own "DOCX" is the same file.
  const again = await downloadFrom(page, context, () => row.locator('.rev-files').getByRole('button', { name: 'DOCX' }).click());
  expect(again.url()).toBe(download.url());

  // Esc closes; the focus is back on the foot's button.
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(footButton(page)).toBeFocused();

  // Nothing was edited since: the idle line names revision 1 (Q11), and a second
  // generation answers revision 1 again, with no second row.
  await footButton(page).click();
  await dialog(page).getByRole('button', { name: 'Gerar de novo' }).click();
  await expect(reason(page)).toHaveText(IDLE_1);
  await generateButton(page).click();
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: 30_000 });
  await expect(dialog(page).locator('.revision-row')).toHaveCount(1);
});

test('@p0 4.8-E2E-004 an Em campo relatório: generate moves it to Em revisão, the dialog closed and the page reloaded, the revision still issues it', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaBWithFixture();
  await signIn(page, account.email);
  await openFixtureSumario(page);

  await footButton(page).click();
  await expect(reason(page)).toHaveText(IDLE_1);
  await generateButton(page).click();
  await expect(dialog(page).locator('.gen-progress[role="status"]')).toContainText('Gerando revisão 1…', { timeout: 60_000 });
  // `statusTable(Em campo, generate)`: the Sumário's pill reads Em revisão behind the dialog.
  await expect(headerPill(page)).toHaveText('Em revisão');

  // Close and reload before the revision arrives: the wait is kept on this device.
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.reload();
  await expect(page.locator('.app-bar h1')).toHaveText('Sumário', { timeout: 30_000 });

  // The revision lands with nobody watching the dialog: the toast, and `statusTable(Em revisão, issue)`.
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX', { timeout: JOB_TIMEOUT });
  await expect(headerPill(page)).toHaveText('Emitido');
  await footButton(page).click();
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible();
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await expect(dialog(page).locator('.revision-row')).toHaveCount(1);
  // Nothing edited since: "Gerar de novo" promises revision 1 again (Q11).
  await dialog(page).getByRole('button', { name: 'Gerar de novo' }).click();
  await expect(reason(page)).toHaveText(IDLE_1);
});

test('@p1 4.8-E2E-002 offline, "Gerar relatório" waits with its reason and calls nothing', async ({ page, context }) => {
  await resetEmpresaBWithFixture();
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await footButton(page).click();
  await expect(dialog(page)).toBeVisible();

  let requests = 0;
  await page.route('**/api/relatorios/*/generate', (route) => {
    requests += 1;
    return route.continue();
  });
  await context.setOffline(true);
  const button = generateButton(page);
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(reason(page)).toHaveText(OFFLINE);
  // Playwright refuses to press an `aria-disabled` control by itself; a forced press is what a tap does.
  await button.click({ force: true });
  await expect(dialog(page).locator('.gen-progress')).toHaveCount(0);
  await expect(reason(page)).toHaveText(OFFLINE);
  expect(requests).toBe(0);
  await context.setOffline(false);
  await expect(button).not.toHaveAttribute('aria-disabled', 'true');
  await expect(reason(page)).toHaveText(IDLE_1);
});

test('@p1 4.8-E2E-005 a failed request says nothing changed and no revision was created; "Tentar novamente" then generates', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaBWithFixture();
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await footButton(page).click();

  await page.route('**/api/relatorios/*/generate', (route) => route.abort('failed'));
  await generateButton(page).click();
  const alert = dialog(page).locator('.gen-error[role="alert"]');
  await expect(alert).toContainText(FAILED, { timeout: 30_000 });
  await expect(dialog(page).getByText('Nenhuma revisão gerada ainda.')).toBeVisible();
  // The request never reached the server: no `generate` status op either.
  await expect(headerPill(page)).toHaveText('Em campo');

  await page.unroute('**/api/relatorios/*/generate');
  await alert.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(dialog(page).locator('.gen-progress')).toContainText('Gerando revisão 1…', { timeout: 60_000 });
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: JOB_TIMEOUT });
  // Q11: the job landed with the dialog open on an Em campo relatório: the ready block's
  // pill reads the status after the issue op, Emitido, never the Em revisão before it.
  const pill = dialog(page).locator('.row-wrap .status-pill');
  expect(await pill.textContent()).not.toBe('Em revisão');
  await expect(pill).toHaveText('Emitido');
});
