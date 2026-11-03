import type { Page } from '@playwright/test';
import { TELEMETRY_ROUTE, uxEventSchema, type UxEvent } from '@app/domain';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { setParecer } from './support/relatorio-flow.ts';

/*
 * 18.4-E2E-002 and 18.4-E2E-003 (Story 18.4): the `preview` and `generate` waits time what the
 * engineer waited for, from the press to the document, not the request that enqueues the job
 * (the first production read: 26.8 s on the screen, 176 ms in the view). The job runs for real
 * (LibreOffice in the api container) on the small Porto Seguro fixture, so this spec is in the
 * serial group. The device ships its queue with each sync cycle, so the wait is looked for in
 * the queue and in what the page posted to `POST /api/telemetry`.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

/** The job's own time: flush, queue pick-up, LibreOffice. */
const JOB_TIMEOUT = 150_000;
const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const previewButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: /^(Pré-visualizar|Gerando rascunho…)$/ });
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');

/** Every event the page posts to the telemetry route, recorded from the call on. */
function recordTelemetryPosts(page: Page): UxEvent[] {
  const posted: UxEvent[] = [];
  page.on('request', (request) => {
    if (request.method() !== TELEMETRY_ROUTE.method || new URL(request.url()).pathname !== TELEMETRY_ROUTE.path) return;
    const body = request.postDataJSON() as unknown;
    if (Array.isArray(body)) posted.push(...(body as UxEvent[]));
  });
  return posted;
}

/** The `wait` events of `kind`, queued or posted, each once. */
async function waitsOf(page: Page, posted: UxEvent[], kind: 'preview' | 'generate'): Promise<UxEvent[]> {
  // The queue's key never leaves the device.
  const queued = (await readStore<UxEvent & { id?: number }>(page, database, 'ux_events')).map((row) => {
    const event = { ...row };
    delete event.id;
    return event as UxEvent;
  });
  const seen = new Map<string, UxEvent>();
  for (const event of [...posted, ...queued]) {
    if (event.name === 'wait' && event.kind === kind) seen.set([event.ts, event.session_id].join('|'), event);
  }
  return [...seen.values()];
}

async function openFixture(page: Page): Promise<void> {
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });
}

test('@p0 18.4-E2E-002 "Pré-visualizar" queues one preview wait, ok, as long as the tap-to-PDF-tab interval', async ({ page, context }) => {
  test.setTimeout(240_000);
  const posted = recordTelemetryPosts(page);
  await openFixture(page);
  await footButton(page).click();

  const tabPromise = context.waitForEvent('page');
  const tapped = Date.now();
  await previewButton(page).click();
  const tab = await tabPromise;
  // Headless Chrome has no PDF viewer: the tab's navigation to the PDF is what is observed.
  await tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const interval = Date.now() - tapped;
  await expect(previewButton(page)).toHaveText('Pré-visualizar');
  await tab.close();

  await expect.poll(async () => (await waitsOf(page, posted, 'preview')).length, { timeout: 15_000 }).toBe(1);
  const [wait] = await waitsOf(page, posted, 'preview');
  expect(uxEventSchema.safeParse(wait).success).toBe(true);
  expect(wait).toMatchObject({ name: 'wait', kind: 'preview', outcome: 'ok', relatorio_id: EXPORT_RELATORIO_ID });
  expect(wait!.duration_ms, `interval ${interval} ms`).toBeGreaterThanOrEqual(interval - 1000);
  expect(wait!.duration_ms!).toBeLessThanOrEqual(interval + 1000);
});

test('@p0 18.4-E2E-003 "Gerar relatório" queues one generate wait, ok once the download buttons enable, as long as the tap-to-download interval', async ({ page }) => {
  test.setTimeout(300_000);
  const posted = recordTelemetryPosts(page);
  await openFixture(page);
  await setParecer(page, EXPORT_RELATORIO_ID);
  await footButton(page).click();

  const tapped = Date.now();
  await generateButton(page).click();
  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: JOB_TIMEOUT });
  // The download can start: the revision is held on this device.
  const docx = dialog(page).getByRole('button', { name: 'DOCX — abrir no Word' });
  await expect(docx).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  const interval = Date.now() - tapped;

  await expect.poll(async () => (await waitsOf(page, posted, 'generate')).length, { timeout: 15_000 }).toBe(1);
  const [wait] = await waitsOf(page, posted, 'generate');
  expect(uxEventSchema.safeParse(wait).success).toBe(true);
  expect(wait).toMatchObject({ name: 'wait', kind: 'generate', outcome: 'ok', relatorio_id: EXPORT_RELATORIO_ID });
  expect(wait!.duration_ms, `interval ${interval} ms`).toBeGreaterThanOrEqual(interval - 1000);
  expect(wait!.duration_ms!).toBeLessThanOrEqual(interval + 1000);
  await page.keyboard.press('Escape');
});
