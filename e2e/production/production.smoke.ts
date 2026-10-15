import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, type Op } from '@app/domain';
import { expect, test, type APIRequestContext, type Download, type Locator, type Page } from '@playwright/test';
import { installPlateCamera } from './camera-stream.ts';
import { readSmokeEnv, SMOKE_PROGRESS_FILE, SMOKE_RESULTS_DIR } from './smoke-env.ts';

/*
 * Story 14.10 part 6: the production smoke, after every deploy (`infra/bin/deploy`), against
 * the deployed URL, signed in as the dedicated test user of `infra/production/smoke.tf`. The
 * deploy's `smoke-seed` task has just reset that company: one user, the standard template and
 * one test relatório (the small Porto Seguro sample, Em campo, "Cabine de Testes" with a
 * chave, a disjuntor and a transformer). The run drives the app as a person would and checks
 * what the server committed, not only the screen: the synced edit, the photo the server
 * holds, the plate reading done, the documents' bytes. At most one real plate reading and no
 * emission audit per run; with the AI features off the plate step is skipped, not failed.
 *
 * Nothing here reads or writes a database or names a local fixture: every id is read off the
 * app. Each step appends its name to `test-results/production-smoke/progress.txt` when it
 * starts, so a red deploy names where it stopped.
 */

const CABINE = 'Cabine de Testes';
const TRANSFORMER = 'Transformador de força';
/** One sync cycle, a reading and a document generation on the production instance. */
const SYNC_TIMEOUT = 90_000;
const READING_TIMEOUT = 240_000;
const DOCUMENT_TIMEOUT = 300_000;
const MIN_DOCUMENT_BYTES = 10 * 1024;

const syncBadge = (page: Page) => page.locator('.app-bar [data-testid="sync-badge"]');
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');
const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const nameplate = (page: Page) => page.locator('#ficha-nameplate');
const camera = (page: Page) => page.getByRole('dialog', { name: 'Câmera' });

/** Runs one named step, appending its name to the progress file first; prints it when it passed. */
async function step<T>(name: string, body: () => Promise<T>): Promise<T> {
  return test.step(name, async () => {
    appendFileSync(SMOKE_PROGRESS_FILE, `${name}\n`);
    const result = await body();
    console.log(`passed: ${name}`);
    return result;
  });
}

/** Pulls one stream to its head through the contract, page by page (as `e2e/support/outbox.ts` does). */
async function pullAll(request: APIRequestContext, path: string): Promise<Op[]> {
  const ops: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await request.get(`${path}?since=${since}`, { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) } });
    if (!res.ok()) throw new Error(`${path} answered ${res.status()}: ${await res.text()}`);
    const page = (await res.json()) as { ops: Op[]; seq: number };
    ops.push(...page.ops);
    const last = page.ops.at(-1)?.seq;
    if (last === undefined || last >= page.seq) return ops;
    since = last;
  }
}

/** The relatório's ops as the server holds them. */
const serverOps = (page: Page, relatorioId: string) => pullAll(page.request, `/api/sync/relatorios/${relatorioId}`);

/** The photo `file/{id}` creates of a pulled log, by id. */
function photoCreates(ops: readonly Op[]): Map<string, { block_id?: string | null; reading_target?: unknown }> {
  const creates = new Map<string, { block_id?: string | null; reading_target?: unknown }>();
  for (const op of ops) {
    const id = /^file\/([0-9a-f-]{36})$/.exec(op.path)?.[1];
    const value = op.value as { kind?: string; block_id?: string | null; reading_target?: unknown } | null;
    if (op.kind === 'create' && id !== undefined && value?.kind === 'photo') creates.set(id, value);
  }
  return creates;
}

/** The last value the log puts on `path`, or undefined. */
function lastPut(ops: readonly Op[], path: string): unknown {
  return ops.filter((op) => op.kind === 'put' && op.path === path).at(-1)?.value;
}

/**
 * Opens Sync status from the App bar badge, runs one cycle with "Sincronizar agora" and waits
 * until that cycle is over and nothing is left pending (as `e2e/support/sync.ts`), then goes
 * back to the page it was on.
 */
async function syncNow(page: Page): Promise<void> {
  const back = page.url();
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: SYNC_TIMEOUT });
  const tappedAt = await page.evaluate(() => Date.now());
  await button.click();
  const lastSync = page.locator('.sync-foot time');
  await expect
    .poll(async () => Date.parse((await lastSync.getAttribute('datetime', { timeout: 1_000 }).catch(() => null)) ?? ''), { timeout: SYNC_TIMEOUT })
    .toBeGreaterThanOrEqual(tappedAt);
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: SYNC_TIMEOUT });
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: SYNC_TIMEOUT });
  await page.goto(back);
}

/** Leaves the tree's location row `name` expanded, whatever it was (as `e2e/support/tree.ts`). */
async function expandLocation(page: Page, name: string): Promise<void> {
  const expand = page.getByRole('button', { name: `Expandir ${name}`, exact: true });
  const collapse = page.getByRole('button', { name: `Recolher ${name}`, exact: true });
  await expect(async () => {
    if (!(await collapse.isVisible())) await expand.click({ timeout: 2_000 });
    await expect(collapse).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** The camera view, open with its live stream. */
async function expectCameraOpen(page: Page): Promise<Locator> {
  await expect(camera(page)).toBeVisible();
  await expect
    .poll(() => camera(page).locator('video').evaluate((video: HTMLVideoElement) => video.readyState >= 2 && video.videoWidth > 0), { timeout: 30_000 })
    .toBe(true);
  return camera(page);
}

/** Presses the button and returns the download it starts in this tab, with its bytes. */
async function download(page: Page, press: () => Promise<void>): Promise<{ file: Download; bytes: Buffer }> {
  const started = page.waitForEvent('download', { timeout: 60_000 });
  await press();
  const file = await started;
  return { file, bytes: await readFile(await file.path()) };
}

test('production smoke: sign in, edit and sync, a sheet photo, a plate reading, preview, a revision and its documents', async ({ page, context }) => {
  const env = readSmokeEnv(process.env);
  mkdirSync(SMOKE_RESULTS_DIR, { recursive: true });
  rmSync(SMOKE_PROGRESS_FILE, { force: true });
  await installPlateCamera(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  await step('1. sign in and open Home', async () => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(env.email);
    await page.getByLabel('Senha').fill(env.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 60_000 });
  });

  const relatorioId = await step('2. open the test relatório', async () => {
    // The reset left exactly one relatório in the company.
    const card = page.locator('.relatorio-card');
    await expect(card).toHaveCount(1, { timeout: SYNC_TIMEOUT });
    await card.locator('.card-title').click();
    await expect(page).toHaveURL(/\/relatorio\/[0-9a-f-]{36}$/);
    const id = /\/relatorio\/([0-9a-f-]{36})$/.exec(page.url())![1]!;
    await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: SYNC_TIMEOUT });
    await expect(headerPill(page)).toHaveText('Em campo', { timeout: SYNC_TIMEOUT });
    return id;
  });

  const marker = `SMOKE-${Date.now()}`;
  const blockId = await step('3. edit a value and sync', async () => {
    const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    await expect(page.getByRole('list', { name: 'Locais do relatório' })).toBeVisible();
    await expandLocation(page, CABINE);
    const row = page
      .getByRole('list', { name: 'Locais do relatório' })
      .locator('li.s9-eq')
      .filter({ has: page.locator('.s9-eq-name', { hasText: new RegExp(`^${TRANSFORMER}$`) }) })
      .first();
    await expect(row).toBeVisible();
    const id = (await row.getAttribute('data-block-id'))!;
    await row.locator('.s9-eq-open').click();
    await expect(page).toHaveURL(new RegExp(`/ficha/${id}$`));
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

    const serie = nameplate(page).locator('[data-field-key="n_serie"] input');
    await serie.fill(marker);
    await serie.press('Enter');
    await syncNow(page);
    // Committed: the server's log holds the edit.
    const ops = await serverOps(page, relatorioId);
    expect(lastPut(ops, `sheet/${id}/nameplate/n_serie`)).toBe(marker);
    await expect(nameplate(page).locator('[data-field-key="n_serie"] input')).toHaveValue(marker, { timeout: 30_000 });
    return id;
  });

  await step('4. add a sheet photo', async () => {
    const before = new Set(photoCreates(await serverOps(page, relatorioId)).keys());
    await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
    const view = await expectCameraOpen(page);
    await view.getByRole('button', { name: 'Disparar' }).click();
    await expect(view.locator('.cam-count')).toHaveText('1 foto nesta rajada · salva neste aparelho com a legenda do contexto');
    await view.getByRole('button', { name: 'Concluir fotos' }).click();
    await expect(camera(page)).toHaveCount(0);

    // Held by the server: its create and its bytes (`file/{id}/uploaded_at`), sent on their own.
    let photoId = '';
    await expect
      .poll(
        async () => {
          const ops = await serverOps(page, relatorioId);
          const added = [...photoCreates(ops)].filter(([id, value]) => !before.has(id) && value.block_id === blockId);
          photoId = added[0]?.[0] ?? '';
          return added.length === 1 && lastPut(ops, `file/${photoId}/uploaded_at`) != null;
        },
        { timeout: SYNC_TIMEOUT, intervals: [2_000] },
      )
      .toBe(true);
    // And the device knows it: after a sync its tile carries no upload pill.
    await syncNow(page);
    const strip = page.getByRole('region', { name: /^Fotos da ficha \(\d+\)$/ });
    await expect(strip.locator('.photo-list > .photo-row').first()).toBeVisible({ timeout: 30_000 });
    await expect(strip.locator('.upload-pill')).toHaveCount(0, { timeout: 30_000 });
    console.log(`4. add a sheet photo: photo ${photoId} uploaded`);
  });

  await step('5. read the plate', async () => {
    const account = await page.request.get('/api/account');
    expect(account.ok(), `GET /api/account answered ${account.status()}`).toBe(true);
    const features = ((await account.json()) as { features?: { ai?: boolean } }).features;
    if (features?.ai === false) {
      console.log('5. read the plate: skipped, GET /api/account answers features.ai = false');
      return;
    }
    const before = new Set(photoCreates(await serverOps(page, relatorioId)).keys());
    const tile = nameplate(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' });
    await expect(tile).toBeVisible({ timeout: 30_000 });
    await tile.click();
    const view = await expectCameraOpen(page);
    await view.getByRole('button', { name: 'Disparar' }).click();
    // One shot: the camera closes by itself and the plate's row replaces the tile.
    await expect(camera(page)).toHaveCount(0, { timeout: 30_000 });

    // The reading as the server ran it: `reading_status` done, and the fields it read as suggestions.
    let plateId = '';
    let status: unknown;
    await expect
      .poll(
        async () => {
          const ops = await serverOps(page, relatorioId);
          plateId = [...photoCreates(ops)].find(([id, value]) => !before.has(id) && value.reading_target != null)?.[0] ?? '';
          status = plateId === '' ? undefined : lastPut(ops, `file/${plateId}/reading_status`);
          return status === 'done' || status === 'failed';
        },
        { timeout: READING_TIMEOUT, intervals: [3_000] },
      )
      .toBe(true);
    expect(status, `the plate reading of photo ${plateId} ended ${String(status)}`).toBe('done');
    const ops = await serverOps(page, relatorioId);
    const read = ops.filter(
      (op) => op.kind === 'create' && op.path.startsWith('suggestion/') && (op.value as { source?: { photo_id?: string } } | null)?.source?.photo_id === plateId,
    );
    expect(read.length, 'fields read off the plate').toBeGreaterThan(0);
    console.log(`5. read the plate: done, ${read.length} fields read`);
    // The device shows them: the sample's plate is already typed, so each read field offers
    // "Substituir" or "Manter o digitado" beside it.
    await expect(nameplate(page).getByRole('button', { name: 'Substituir' }).first()).toBeVisible({ timeout: SYNC_TIMEOUT });
  });

  await step('6. preview the PDF', async () => {
    await page.goto(`/relatorio/${relatorioId}`);
    await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
    await footButton(page).click();
    const preview = exportDialog(page).locator('.generate-row').getByRole('button', { name: /^(Pré-visualizar|Gerando rascunho…)$/ });
    const opened = context.waitForEvent('page');
    await preview.click();
    const tab = await opened;
    // Headless Chrome has no PDF viewer: the tab's navigation to the PDF is what is observed.
    const requested = await tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: DOCUMENT_TIMEOUT });
    const pdf = await page.request.get(requested.url());
    expect(pdf.status()).toBe(200);
    const bytes = await pdf.body();
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
    console.log(`6. preview the PDF: ${bytes.byteLength} bytes`);
    await tab.close();
    await expect(preview).toHaveText('Pré-visualizar', { timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(exportDialog(page)).toBeHidden();
  });

  await step('7. generate a revision', async () => {
    // "Parecer não preenchido" is the one row that stops "Gerar relatório": Etapa 6 first.
    await page.goto(`/relatorio/${relatorioId}/setup?etapa=6`);
    await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeVisible({ timeout: 30_000 });
    const apto = page.getByRole('radiogroup', { name: 'Parecer' }).getByRole('radio', { name: 'Apto', exact: true });
    await apto.click();
    await expect(apto).toHaveAttribute('aria-checked', 'true');
    await page.goto(`/relatorio/${relatorioId}`);
    await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });

    await footButton(page).click();
    const dialog = exportDialog(page);
    await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
    // A sheet left empty asks first; the sample has none, but a question is answered, not failed on.
    const progress = dialog.locator('.gen-progress[role="status"]');
    const question = dialog.getByRole('group', { name: /^Gerar com \d+ fichas? vazias?/ });
    await expect(progress.or(question).first()).toBeVisible({ timeout: 60_000 });
    if (await question.isVisible()) await question.getByRole('button', { name: 'Gerar mesmo assim' }).click();
    await expect(dialog.getByRole('heading', { level: 2, name: /^Revisão \d+ pronta$/ })).toBeVisible({ timeout: DOCUMENT_TIMEOUT });
    await expect(dialog.locator('.revision-row').first()).toBeVisible();
    console.log(`7. generate a revision: ${await dialog.getByRole('heading', { level: 2, name: /^Revisão \d+ pronta$/ }).textContent()}`);
  });

  await step('8. download DOCX and PDF', async () => {
    const dialog = exportDialog(page);
    const docx = await download(page, () => dialog.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
    expect(docx.file.suggestedFilename()).toMatch(/\.docx$/);
    expect(docx.bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(docx.bytes.byteLength).toBeGreaterThan(MIN_DOCUMENT_BYTES);
    const pdf = await download(page, () => dialog.getByRole('button', { name: 'PDF — enviar ao cliente' }).click());
    expect(pdf.file.suggestedFilename()).toMatch(/\.pdf$/);
    expect(pdf.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(pdf.bytes.byteLength).toBeGreaterThan(MIN_DOCUMENT_BYTES);
    console.log(`8. download DOCX and PDF: DOCX ${docx.bytes.byteLength} bytes, PDF ${pdf.bytes.byteLength} bytes`);
  });
});
