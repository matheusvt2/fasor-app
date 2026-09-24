import { DOCX_MIME } from '@app/domain';
import type { Download, Page } from '@playwright/test';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { expect, signIn, test } from './support/merged-fixtures.ts';

/*
 * 4.8-E2E: the Export dialog driven as a person would, on Empresa B with the small Porto
 * Seguro fixture seeded onto it. The Sumário (Story 4.3) is not built in this batch, so
 * the dev-only fixture route mounts the dialog behind a "Gerar relatório" trigger; once
 * the Sumário lands this spec is re-pointed at its button (spec Design Notes).
 */

const RELATORIO_ID = EXPORT_RELATORIO_ID;

async function openExportFixture(page: Page): Promise<void> {
  await page.goto(`/__fixture/export?relatorio=${RELATORIO_ID}`);
  await expect(page.getByTestId('fixture-relatorio')).toHaveText(/Relatório neste aparelho/, { timeout: 30_000 });
}

const trigger = (page: Page) => page.locator('main[data-route="/__fixture/export"]').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });

test('@p0 4.8-E2E-001 Empresa B generates revision 1 from the Export dialog, opens the DOCX, sees the row, and a second press answers the same revision', async ({
  page,
  context,
  seed,
}) => {
  test.setTimeout(240_000);
  await resetEmpresaBWithFixture();
  await signIn(page, seed.companies[1].email);
  await openExportFixture(page);

  await trigger(page).click();
  const modal = dialog(page);
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(modal.getByText('Nenhuma revisão gerada ainda.')).toBeVisible();
  await expect(modal.locator('.generate-row .btn-reason')).toHaveText(
    'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.',
  );

  await generateButton(page).click();
  // Working: the progress line, the disabled button with its reason.
  await expect(modal.locator('.gen-progress[role="status"]')).toContainText('Gerando revisão 1…', { timeout: 30_000 });
  await expect(modal.locator('.gen-progress')).toContainText('pode fechar — o aviso chega quando terminar');
  await expect(generateButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(modal.locator('.generate-row .btn-reason')).toHaveText('Gerando a revisão 1 — DOCX e PDF juntos');

  // The job runs in the api container (LibreOffice, two passes); the toast and the result arrive.
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX', { timeout: 150_000 });
  await expect(modal.getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible();
  const open = modal.getByRole('button', { name: 'DOCX — abrir no Word' });
  await expect(open).toBeVisible();
  await expect(modal.locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await expect(modal.locator('.row-wrap .t-meta')).toHaveText('Qualquer alteração a partir de agora gera a revisão 2.');

  // The Revisões row: "Rev. 1 — dd/mm/aaaa hh:mm — Bento Braga" with its DOCX button.
  const row = modal.locator('.revision-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.rev-text')).toHaveText(/^Rev\. 1 — \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} — Bento Braga$/);
  await expect(row.locator('.rev-files').getByRole('button', { name: 'DOCX' })).toBeVisible();

  // "DOCX — abrir no Word" opens the download route in a new tab, which Chromium takes as a
  // download. The listener is attached to the popup the moment it exists, before the
  // click: the download can start before a later `waitForEvent` would be registered.
  const downloadPromise = new Promise<Download>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no download started within 30 s')), 30_000);
    const settle = (download: Download) => {
      clearTimeout(timer);
      resolve(download);
    };
    context.once('page', (popup) => popup.once('download', settle));
    page.once('download', settle);
  });
  await open.click();
  const download = await downloadPromise;
  expect(download.url()).toMatch(/\/api\/revisions\/[0-9a-f-]{36}\/docx$/);
  expect(download.suggestedFilename()).toBe('relatorio-rev-1.docx');
  const response = await page.request.get(download.url());
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe(DOCX_MIME);
  expect((await response.body()).byteLength).toBeGreaterThan(1000);
  for (const extra of context.pages()) if (extra !== page) await extra.close().catch(() => undefined);
  await page.bringToFront();

  // Esc closes the dialog and the focus returns to the trigger.
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(trigger(page)).toBeFocused();

  // Nothing was edited since: a second "Gerar relatório" answers revision 1 again, no second row.
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Gerar de novo' }).click();
  await expect(dialog(page).locator('.generate-row .btn-reason')).toHaveText(
    'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 2. Precisa de conexão.',
  );
  await generateButton(page).click();
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: 30_000 });
  await expect(dialog(page).locator('.revision-row')).toHaveCount(1);
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
});

test('@p1 4.8-E2E-002 offline, "Gerar relatório" waits with its reason and calls nothing', async ({ page, context, seed }) => {
  await resetEmpresaBWithFixture();
  await signIn(page, seed.companies[1].email);
  await openExportFixture(page);
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();

  await context.setOffline(true);
  const button = generateButton(page);
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog(page).locator('.generate-row .btn-reason')).toHaveText('Gerar relatório precisa de conexão. Conecte e tente de novo.');
  // Playwright refuses to press an `aria-disabled` control by itself; a forced press is what a tap does.
  await button.click({ force: true });
  await expect(dialog(page).locator('.gen-progress')).toHaveCount(0);
  await expect(dialog(page).locator('.generate-row .btn-reason')).toHaveText('Gerar relatório precisa de conexão. Conecte e tente de novo.');
  await context.setOffline(false);
  await expect(button).not.toHaveAttribute('aria-disabled', 'true');
  await expect(dialog(page).locator('.generate-row .btn-reason')).toHaveText(
    'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.',
  );
});
