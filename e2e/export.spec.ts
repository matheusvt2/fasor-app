import { DOCX_MIME, instantiateTemplate, PDF_MIME, standardTemplate, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { escapeDialog } from './support/dialogs.ts';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { syncNow } from './support/sync.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { pushDrafts } from './support/relatorio-seed.ts';

/*
 * 4.8-E2E: "Gerar relatório" driven as a person would, from the Sumário's foot button
 * (Story 4.3) through the Export dialog (`73-exportar.html`) to the DOCX download. The job
 * runs for real in the api container (LibreOffice, two TOC passes), so each generation
 * takes seconds: the timeouts below are the job's, not the UI's.
 *
 * Two starting points: a relatório born from Home a moment before (223 ops still on
 * their way when the dialog asks for them), and the small Porto Seguro fixture seeded onto
 * Empresa B (Em campo, so the status op `generate` applies; `issue` is the explicit
 * "Marcar como enviado ao cliente" since the status flow of 2026-10-10).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
/** The primary: "Gerar relatório", or "Gerando…" while it sends and the job runs. */
const generateButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const reason = (page: Page) => dialog(page).locator('.generate-row .btn-reason');
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');

/** Status flow 2026-10-10: the one emitter of `issue`, in the result block and on the Sumário's foot. */
const MARK_SENT = 'Marcar como enviado ao cliente';
const NOT_SENT_2 = 'Ainda não enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 2.';
const SENT_2 = 'Enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 2.';

const IDLE_1 = 'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.';
const OFFLINE = 'Gerar relatório precisa de conexão. Conecte e tente de novo.';
const ADDITIONAL_INFO = 'Parada programada de 36 horas';
const FAILED = 'Não foi possível gerar o relatório. Os dados não foram alterados e nenhuma revisão foi criada.';
/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;

/** The small fixture's Sumário, pulled onto this device (AD-8: opening it asks for the stream). */
async function openFixtureSumario(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  // Story 12.5 (J-17): the App bar names the relatório; the Sumário list says where we are.
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });
}


/** Review fixes 2026-10-06 (F-06): the sticky App bar stays at the top and the arrival's heading lands below it, never under it. */
async function expectBelowAppBar(page: Page, heading: Locator): Promise<void> {
  const bar = (await page.locator('.app-bar').boundingBox())!;
  expect(bar.y).toBeCloseTo(0, 0);
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height - 0.5);
}

test('@p0 4.8-E2E-001 11.1-E2E-001 a relatório born on Home: the Sumário\'s "Gerar relatório" generates revision 1, the DOCX and the PDF download and share, the row lists it, and a second press answers the same revision', async ({
  page,
}) => {
  test.setTimeout(300_000);
  // Story 11.1 and E11-Q1: a recording share sheet, as a mobile browser has one, that takes
  // files while `__canShareFiles` is true; installed before the first navigation so the dialog
  // sees it and renders the share buttons. Each call is recorded with its keys and its files.
  await page.addInitScript(() => {
    const w = window as unknown as { __shares: unknown[]; __canShareFiles: boolean };
    w.__shares = [];
    w.__canShareFiles = true;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        w.__shares.push({ keys: Object.keys(data).sort(), title: data.title, files: (data.files ?? []).map((file) => ({ name: file.name, type: file.type, size: file.size })) });
      },
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data: ShareData) => w.__canShareFiles && (data.files ?? []).length > 0,
    });
  });
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  // Q3: what Etapa 1's "Informações adicionais" says is what the cover prints.
  const relatorioId = await createRelatorio(page, {
    whileOnSetup: async () => {
      await page.getByLabel('Informações adicionais').fill(ADDITIONAL_INFO);
    },
  });
  await expect(headerPill(page)).toHaveText('Rascunho');
  // The field committed on its blur ("Voltar"), through the setup page's write queue; the
  // Sumário can draw before that IndexedDB write lands, and `setParecer` reloads the page,
  // which would abort a write still in flight. A person does not reload within those
  // milliseconds: wait for the typed value to be stored on the device, as it must be.
  await expect
    .poll(async () =>
      (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((op) => op.path === 'relatorio/setup/additional_info').map((op) => op.value),
    )
    .toEqual([ADDITIONAL_INFO]);
  // Story 7.4: the parecer is set first; "Parecer não preenchido" is the one row that blocks.
  await setParecer(page, relatorioId);

  // The foot's button opens the dialog: modal, labelled by its title, idle with no revision.
  await footButton(page).click();
  const modal = dialog(page);
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(modal.getByRole('heading', { name: 'Gerar relatório' })).toBeVisible();
  await expect(modal.getByText('Nenhuma revisão gerada ainda.')).toBeVisible();
  await expect(reason(page)).toHaveText(IDLE_1);

  // Pressed with the creation batch possibly still in the outbox: the dialog drains it first
  // ("Enviando…", asserted in jsdom), then the working state. F-03 (D1): its 94 sheets are
  // empty, so the issue is confirmed first.
  await generateButton(page).click();
  await confirmIssue(modal, /^Gerar com 94 fichas vazias/);
  await expect(modal.locator('.gen-progress[role="status"]')).toContainText('Gerando revisão 1…', { timeout: 60_000 });
  await expect(modal.locator('.gen-progress')).toContainText('pode fechar — o aviso chega quando terminar');
  await expect(generateButton(page)).toHaveAttribute('aria-disabled', 'true');
  // Matheus, 2026-09-30: a waiting button says so.
  await expect(generateButton(page)).toHaveText('Gerando…');
  await expect(reason(page)).toHaveText('Gerando a revisão 1 — DOCX e PDF juntos');

  // "pode fechar": Esc closes, the focus returns to the foot's button, and reopening shows
  // the same working state.
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(footButton(page)).toBeFocused();
  await footButton(page).click();
  await expect(dialog(page).locator('.gen-progress')).toContainText('Gerando revisão 1…');

  // The revision arrives: the toast, the result block, the row.
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await expect(modal.getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible();
  await expect(modal.locator('.t-meta time')).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  // Status flow 2026-10-10 (B1): `statusTable(Rascunho, generate)` is Em revisão, and the
  // revision's arrival leaves it there, saying it is not yet with the client.
  await expect(modal.locator('.row-wrap .status-pill')).toHaveText('Em revisão');
  await expect(modal.locator('.row-wrap .t-meta')).toHaveText(NOT_SENT_2);
  await expect(modal.getByRole('button', { name: MARK_SENT })).toBeVisible();
  const row = modal.locator('.revision-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.rev-text')).toHaveText(new RegExp(`^Rev\\. 1 — \\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2} — ${account.name}$`));

  // E11-Q1: "DOCX — abrir no Word" saves the revision's DOCX itself, fetched with the session.
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  expect(download.suggestedFilename()).toBe('relatorio-rev-1.docx');
  const bytes = await downloadBytes(download);
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(bytes.byteLength).toBeGreaterThan(1000);
  const cover = extractStructure(bytes).tables[0]!;
  expect(cover.find((row) => row[0] === 'Informações adicionais')).toEqual(['Informações adicionais', ADDITIONAL_INFO]);
  // The Revisões row's own "DOCX" is the same file.
  const again = await downloadFrom(page, () => row.locator('.rev-files').getByRole('button', { name: 'DOCX' }).click());
  expect(again.suggestedFilename()).toBe('relatorio-rev-1.docx');
  expect((await downloadBytes(again)).equals(bytes)).toBe(true);

  // Story 11.1: "PDF — enviar ao cliente" saves the revision's closed PDF.
  const pdf = await downloadFrom(page, () => modal.getByRole('button', { name: 'PDF — enviar ao cliente' }).click());
  expect(pdf.suggestedFilename()).toBe('relatorio-rev-1.pdf');
  const pdfBytes = await downloadBytes(pdf);
  expect(pdfBytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  // The Revisões row's own "PDF" is the same file.
  const pdfAgain = await downloadFrom(page, () => row.locator('.rev-files').getByRole('button', { name: 'PDF' }).click());
  expect(pdfAgain.suggestedFilename()).toBe('relatorio-rev-1.pdf');
  expect((await downloadBytes(pdfAgain)).equals(pdfBytes)).toBe(true);

  // E11-Q1: where the sheet takes files, "Compartilhar PDF" and "Compartilhar DOCX" hand it the
  // file itself with the revision's title, and never a URL.
  const shares = () => page.evaluate(() => (window as unknown as { __shares: unknown[] }).__shares);
  await modal.getByRole('button', { name: 'Compartilhar PDF' }).click();
  await expect.poll(shares).toEqual([{ keys: ['files', 'title'], title: 'Revisão 1 pronta', files: [{ name: 'relatorio-rev-1.pdf', type: PDF_MIME, size: pdfBytes.byteLength }] }]);
  await modal.getByRole('button', { name: 'Compartilhar DOCX' }).click();
  await expect.poll(async () => ((await shares()) as unknown[]).length).toBe(2);
  expect(((await shares()) as unknown[])[1]).toEqual({ keys: ['files', 'title'], title: 'Revisão 1 pronta', files: [{ name: 'relatorio-rev-1.docx', type: DOCX_MIME, size: bytes.byteLength }] });
  // Where it cannot take files, each share saves the file instead and the sheet never opens.
  await page.evaluate(() => {
    (window as unknown as { __canShareFiles: boolean }).__canShareFiles = false;
  });
  const sharedPdf = await downloadFrom(page, () => modal.getByRole('button', { name: 'Compartilhar PDF' }).click());
  expect(sharedPdf.suggestedFilename()).toBe('relatorio-rev-1.pdf');
  expect((await downloadBytes(sharedPdf)).subarray(0, 4).toString('latin1')).toBe('%PDF');
  const sharedDocx = await downloadFrom(page, () => modal.getByRole('button', { name: 'Compartilhar DOCX' }).click());
  expect(sharedDocx.suggestedFilename()).toBe('relatorio-rev-1.docx');
  expect((await downloadBytes(sharedDocx)).subarray(0, 2).toString('latin1')).toBe('PK');
  expect(((await shares()) as unknown[]).length).toBe(2);

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
  await confirmIssue(dialog(page), /^Gerar com 94 fichas vazias/);
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: 30_000 });
  await expect(dialog(page).locator('.revision-row')).toHaveCount(1);
});

test('@p0 4.8-E2E-004 an Em campo relatório: generate moves it to Em revisão, the dialog closed and the page reloaded, the revision arrives and it stays Em revisão until marked as sent', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await setParecer(page, EXPORT_RELATORIO_ID);

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
  // Story 12.5 (J-17): the App bar names the relatório; the Sumário list says where we are.
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });

  // The revision lands with nobody watching the dialog: the toast, and no status change
  // (2026-10-10: a revision's arrival never issues).
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await expect(headerPill(page)).toHaveText('Em revisão');
  await footButton(page).click();
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible();
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Em revisão');
  await expect(dialog(page).locator('.row-wrap .t-meta')).toHaveText(NOT_SENT_2);
  await expect(dialog(page).locator('.revision-row')).toHaveCount(1);
  // "Marcar como enviado ao cliente": one `issue` op, Emitido in the dialog and behind it.
  await dialog(page).getByRole('button', { name: MARK_SENT }).click();
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await expect(dialog(page).locator('.row-wrap .t-meta')).toHaveText(SENT_2);
  await expect(dialog(page).getByRole('button', { name: MARK_SENT })).toHaveCount(0);
  await expect(headerPill(page)).toHaveText('Emitido');
  await expect
    .poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((op) => op.path === 'relatorio/status').map((op) => op.value))
    .toEqual(['em_revisao', 'emitido']);
  // Nothing edited since: "Gerar de novo" promises revision 1 again (Q11).
  await dialog(page).getByRole('button', { name: 'Gerar de novo' }).click();
  await expect(reason(page)).toHaveText(IDLE_1);
});

test('@p1 4.8-E2E-002 offline, "Gerar relatório" waits with its reason and calls nothing', async ({ page, context }) => {
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await setParecer(page, EXPORT_RELATORIO_ID);
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
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await setParecer(page, EXPORT_RELATORIO_ID);
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
  // Status flow 2026-10-10: the job landed with the dialog open on an Em campo relatório:
  // the ready block's pill reads Em revisão (generated, not yet sent), never Emitido.
  const pill = dialog(page).locator('.row-wrap .status-pill');
  await expect(pill).toHaveText('Em revisão');
  await expect(dialog(page).locator('.row-wrap .t-meta')).toHaveText(NOT_SENT_2);
  await expect(dialog(page).getByRole('button', { name: MARK_SENT })).toBeVisible();
});

// --- Epic 4 carry-over (E4-A1, E4-A2, E4-A3) -------------------------------------------

const IDLE_2 = 'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 2. Precisa de conexão.';
const sumarioList = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const banner = (page: Page) => page.locator('.banner-slot .banner');

/** Story 16.2: the Export dialog's banner under its title. */
const exportBanner = (page: Page) => dialog(page).locator('.banner');

/** Story 16.2: the op ids of the `relatorio/status` rows in this device's outbox. */
async function statusOpIds(page: Page): Promise<string[]> {
  const rows = await readStore<{ op_id: string; path: string }>(page, database, 'outbox');
  return rows.filter((row) => row.path === 'relatorio/status').map((row) => row.op_id);
}

/** Story 16.2: the fixture relatório's status as this device's store holds it. */
async function relatorioStatusOnDevice(page: Page): Promise<unknown> {
  const rows = await readStore<{ entity: string; id: string; row: { status?: unknown } }>(page, database, 'entities');
  return rows.find((record) => record.entity === 'relatorio' && record.id === EXPORT_RELATORIO_ID)?.row.status;
}

/** Opens the header Overflow and confirms the one-step backward move to `to`. */
async function moveBackTo(page: Page, to: string): Promise<void> {
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: `Voltar para ${to}` }).click();
  await page.getByRole('dialog', { name: `Voltar para ${to}` }).getByRole('button', { name: `Voltar para ${to}` }).click();
  await expect(headerPill(page)).toHaveText(to);
}

test('@p0 E4-E2E-001 generate, mark as sent, edit, Em revisão, generate revision 2: listed, marked as sent, Emitido; moved back with no edit, Gerar answers revision 2 and it stays Em revisão until marked again', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await setParecer(page, EXPORT_RELATORIO_ID);

  // Revision 1 from Em campo: Em revisão until it is marked as sent, then Emitido.
  await footButton(page).click();
  await expect(reason(page)).toHaveText(IDLE_1);
  await generateButton(page).click();
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Em revisão');
  await dialog(page).getByRole('button', { name: MARK_SENT }).click();
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await escapeDialog(page, dialog(page));
  await expect(headerPill(page)).toHaveText('Emitido');
  await expect(banner(page)).toContainText('(revisão 1). Alterações geram a revisão 2.');

  // An edit in the setup, typed as a person would: the status advances to Em revisão and
  // the Sumário's banner promises revision 2.
  await sumarioList(page).getByRole('button', { name: /^Capa e dados do relatório/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' })).toBeFocused();
  await expectBelowAppBar(page, page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' }));
  const info = page.getByLabel('Informações adicionais');
  await info.click();
  await info.pressSequentially('Parada de 12 horas');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Voltar' }).click();
  // Story 12.5 (J-17): the App bar names the relatório; the Sumário list says where we are.
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible();
  await expect(headerPill(page)).toHaveText('Em revisão');
  // 2026-10-10: Em revisão with edits since revision 1 says where they go, never "emitido".
  await expect(banner(page)).toContainText('Há alterações desde a revisão 1');
  await expect(banner(page)).toContainText('Elas entram na revisão 2.');
  // Decision 2: with newer edits, mark-as-sent is not offered; the next step (under the pill) asks for revision 2 first.
  await expect(page.locator('.sticky-action-bar').getByRole('button', { name: MARK_SENT })).toHaveCount(0);
  await expect(page.getByTestId('status-next-step')).toHaveText('Em revisão: há alterações desde a revisão 1. Gere a revisão 2 antes de marcar como enviado ao cliente.');
  await page.reload();
  // Story 12.5 (J-17): the App bar names the relatório; the Sumário list says where we are.
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect(headerPill(page)).toHaveText('Em revisão');

  // Story 16.2: the dialog says that revision 1 predates the edits: the mock's banner under
  // its title ("emitido": revision 1 was marked as sent) and the tag on its row. Reading it
  // writes nothing: no status op appears and the relatório stays Em revisão.
  const statusOpsBefore = await statusOpIds(page);
  await footButton(page).click();
  await expect(reason(page)).toHaveText(IDLE_2);
  await expect(exportBanner(page)).toHaveText(
    /^Relatório emitido em \d{2}\/\d{2} \(revisão 1\)\. Alterações desde então geram a revisão 2 — as anteriores continuam disponíveis abaixo\.$/,
  );
  await expect(dialog(page).locator('h2.dialog-title + .banner')).toHaveCount(1);
  await expect(dialog(page).locator('.revision-row .rev-text')).toHaveText([/^Rev\. 1 — .* — anterior às alterações$/]);
  expect((await statusOpIds(page)).filter((id) => !statusOpsBefore.includes(id))).toEqual([]);
  expect(await relatorioStatusOnDevice(page)).toBe('em_revisao');

  // Revision 2: listed with revision 1; marked as sent from the Sumário's foot, Emitido again.
  await generateButton(page).click();
  await expect(page.getByTestId('toast')).toHaveText('Revisão 2 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 2 pronta' })).toBeVisible();
  await expect(dialog(page).locator('.revision-row')).toHaveCount(2);
  // Story 16.2: revision 2 holds the edits: no banner, no row tagged.
  await expect(exportBanner(page)).toHaveCount(0);
  await expect(dialog(page).locator('.revision-row .rev-text', { hasText: 'anterior às alterações' })).toHaveCount(0);
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Em revisão');
  await escapeDialog(page, dialog(page));
  await expect(headerPill(page)).toHaveText('Em revisão');
  await expect(banner(page)).toContainText('Revisão 2 gerada em');
  await expect(banner(page)).toContainText('ainda não enviada ao cliente.');
  await page.locator('.sticky-action-bar').getByRole('button', { name: MARK_SENT }).click();
  await expect(headerPill(page)).toHaveText('Emitido');
  await expect(page.locator('.sticky-action-bar').getByRole('button', { name: MARK_SENT })).toHaveCount(0);

  // Moved back to Em revisão with nothing edited, "Gerar relatório" answers the same
  // revision; nothing is issued by that (2026-10-10), and mark-as-sent is offered again.
  await moveBackTo(page, 'Em revisão');
  await footButton(page).click();
  const again = dialog(page).getByRole('button', { name: 'Gerar de novo' });
  // The dialog opens on its last state (ready, or idle): wait for either before deciding.
  await expect(again.or(reason(page))).toBeVisible();
  if (await again.isVisible()) await again.click();
  await expect(reason(page)).toHaveText(IDLE_2);
  await generateButton(page).click();
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 2 pronta' })).toBeVisible({ timeout: 30_000 });
  await expect(dialog(page).locator('.revision-row')).toHaveCount(2);
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Em revisão');
  await dialog(page).getByRole('button', { name: MARK_SENT }).click();
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await escapeDialog(page, dialog(page));
  await expect(headerPill(page)).toHaveText('Emitido');
});

test('@p0 E4-E2E-002 a second relatório of an obra whose Emitido relatório this device never pulled reuses its equipment: no suffixed TAG, no "TAG duplicada"', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });

  // R1, born and issued on another device: the project and the 223 creation ops, the
  // relatório already Emitido (so never pulled here automatically, AD-8).
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra reaberta', site: 'Obra reaberta', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  const r1 = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-03-02', service_end: '2026-03-03', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const issued = r1.drafts.map((draft) =>
    draft.kind === 'create' && draft.path === `relatorio/${r1.relatorioId}` ? { ...draft, value: { ...(draft.value as object), status: 'emitido' } as never } : draft,
  );
  const r1Tags = r1.drafts.filter((draft) => draft.path.startsWith('equipment/')).map((draft) => (draft.value as { tag: string }).tag);
  expect(r1Tags).toHaveLength(94);
  await pushDrafts(page, database, [project, ...issued]);

  // This device knows the obra (company stream) and holds none of R1.
  await page.goto(`/project/${projectId}`);
  await expect(page.locator('.app-bar h1')).toHaveText('Obra', { timeout: 30_000 });
  expect((await readStore<{ entity: string }>(page, database, 'entities')).filter((row) => row.entity === 'equipment')).toHaveLength(0);

  // Online, "Criar relatório" pulls the obra's equipment first and reuses it by base TAG and type.
  await page.getByRole('button', { name: 'Novo relatório a partir de template' }).first().click();
  const r2 = await createRelatorio(page);
  const outbox = await readStore<{ path: string; kind: string; relatorio_id: string | null }>(page, database, 'outbox');
  expect(outbox.filter((row) => row.kind === 'create' && row.path.startsWith('equipment/'))).toHaveLength(0);
  expect(outbox.filter((row) => row.kind === 'create' && row.path.startsWith('block/') && row.relatorio_id === r2)).toHaveLength(105);

  // After "Sincronizar agora", nothing is duplicated: not on Sync status, not in R2's tree.
  await syncNow(page);
  // Story 10.4: Sync status holds the collapsed "Como funciona a mesclagem" text, which names
  // "TAG duplicada" as a case that asks; only a row or a Decisões banner would be a duplicate.
  await expect(page.locator('main :is(.sync-row, .banner)', { hasText: /duplicada/ })).toHaveCount(0);
  await page.goto(`/relatorio/${r2}`);
  // Story 12.5 (J-17): the App bar names the relatório; the Sumário list says where we are.
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(page.getByRole('list', { name: 'Locais do relatório' })).toBeVisible();
  await expect(page.getByText(/duplicada/)).toHaveCount(0);
  // The device holds R1's 94 equipment rows and no other; R2's sheets point at them.
  const entities = await readStore<{ entity: string; id: string; row: { tag?: string; equipment_id?: string | null; relatorio_id?: string } }>(page, database, 'entities');
  const equipment = entities.filter((record) => record.entity === 'equipment');
  expect(equipment.map((record) => record.row.tag).sort()).toEqual([...r1Tags].sort());
  const held = new Set(equipment.map((record) => record.id));
  const r2Equipment = entities.filter((record) => record.entity === 'block' && record.row.relatorio_id === r2).flatMap((record) => (record.row.equipment_id == null ? [] : [record.row.equipment_id]));
  expect(r2Equipment).toHaveLength(94);
  for (const id of r2Equipment) expect(held.has(id)).toBe(true);
});

test('@p1 E4-E2E-003 an edited section text reads "texto editado" on its Sumário row', async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  await createRelatorio(page);
  const rows = sumarioList(page).getByRole('listitem');
  await expect(rows.nth(3).locator('.sum-status')).toHaveText('texto padrão', { timeout: 30_000 });
  await rows.nth(3).getByRole('button', { name: /^Definições/ }).click();
  const area = page.getByRole('textbox', { name: 'Texto da seção' });
  await area.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Nota deste relatório.');
  await page.getByRole('button', { name: 'Voltar ao sumário' }).click();
  await expect(rows.nth(3).locator('.sum-status')).toHaveText('texto editado');
});

test('@p1 E4-E2E-004 Etapa 2: an exclusion removed from its menu comes back with "Desfazer", and a blank exclusion never prints', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await setParecer(page, EXPORT_RELATORIO_ID);
  await sumarioList(page).getByRole('button', { name: /^Capa e dados do relatório/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' })).toBeFocused();
  await expectBelowAppBar(page, page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' }));

  // The three seeded exclusions and a blank row, added and never typed.
  const exclusions = page.getByRole('list', { name: 'Exclusões' });
  await expect(exclusions.getByRole('textbox')).toHaveCount(3);
  await page.getByRole('button', { name: 'Adicionar exclusão' }).click();
  await expect(exclusions.getByRole('textbox')).toHaveCount(4);
  const first = await page.getByRole('textbox', { name: 'Exclusão 1' }).inputValue();

  // "Remover" of the filled first one, then "Desfazer".
  await page.getByRole('button', { name: 'Mais opções da exclusão 1' }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  await expect(exclusions.getByRole('textbox')).toHaveCount(3);
  await expect(page.getByTestId('toast')).toContainText('Exclusão 1 removida');
  await expect(page.getByRole('textbox', { name: 'Exclusão 1' })).not.toHaveValue(first);
  await page.getByTestId('toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(exclusions.getByRole('textbox')).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: 'Exclusão 1' })).toHaveValue(first);
  await expect(page.getByRole('button', { name: 'Mais opções da exclusão 1' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Exclusão 4' })).toHaveValue('');

  // The generated document lists the three filled exclusions and no empty bullet.
  await page.getByRole('button', { name: 'Voltar' }).click();
  // Story 12.5 (J-17): the App bar names the relatório; the Sumário list says where we are.
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible();
  await footButton(page).click();
  await generateButton(page).click();
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: JOB_TIMEOUT });
  const revision = (await readStore<{ entity: string; id: string }>(page, database, 'entities')).find((row) => row.entity === 'revision')!;
  const response = await page.request.get(`/api/revisions/${revision.id}/docx`);
  expect(response.status()).toBe(200);
  const { paragraphs, headings } = extractStructure(Buffer.from(await response.body()));
  const at = paragraphs.findIndex((text) => text.startsWith('Exclusões'));
  expect(at).toBeGreaterThan(-1);
  const headingTexts = new Set(headings.map((heading) => heading.text));
  const items: string[] = [];
  for (let i = at + 1; i < paragraphs.length && !headingTexts.has(paragraphs[i]!); i++) items.push(paragraphs[i]!);
  expect(items.filter((text) => text.trim() !== '')).toHaveLength(3);
  expect(items.some((text) => text.trim() === '')).toBe(false);
});
