import { charCountText, CONTRACT_VERSION, CONTRACT_VERSION_HEADER, makeOp, opRejectReasonText, SYNC_PUSH_MAX_BYTES, TEXT_CAPS, type JsonValue, type Op } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readDeviceId, readStore, seedOutbox } from './support/outbox.ts';
import { createProjectFromHome, createRelatorio } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Stories 20.7 to 20.10 (contract 29): the regression proof of the security pass of 2026-11-03
 * (`test-artifacts/manual/security-pass-2026-11-03.md`, S1 and S3 to S5). A signed-in browser
 * pushes hand-written ops through its own session (a `fetch` from the page, with the contract
 * header), as an edited build or a curl call with the cookie would: the server refuses each one
 * with its code, keeps its rows, and the relatório still previews. Then the inputs: a paste past
 * a field's cap stops at the cap, the counter shows, and the op queued holds exactly the cap.
 * Serial group: the preview runs through the shared queue and LibreOffice.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;

interface PushAnswer {
  status: number;
  body: { applied?: { op_id: string }[]; rejected?: { op_id: string; code: string }[]; code?: string } | null;
}

/**
 * POSTs `ops` to `/api/sync/ops` from the page itself, with the page's cookie and the contract
 * header. `padTo`, when given, fills the first op's value inside the page with that many
 * characters, so a 5 MB body never crosses the test runner's channel.
 */
async function pushFromPage(page: Page, ops: readonly Op[], padTo?: number): Promise<PushAnswer> {
  return page.evaluate(
    async ({ opsJson, padTo, header, version }) => {
      const parsed = JSON.parse(opsJson) as Record<string, unknown>[];
      const sent = padTo === undefined ? parsed : [{ ...parsed[0], value: 'x'.repeat(padTo) }, ...parsed.slice(1)];
      const res = await fetch('/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json', [header]: version }, body: JSON.stringify({ ops: sent }) });
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: res.status, body: body as PushAnswer['body'] };
    },
    { opsJson: JSON.stringify(ops), padTo, header: CONTRACT_VERSION_HEADER, version: String(CONTRACT_VERSION) },
  );
}

/** A hand-written relatório-scope put of the signed-in user, from a device of their own. */
function forged(deviceId: string, relatorioId: string, path: string, value: unknown): Op {
  return makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path,
      value: value as JsonValue,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
      device_id: `${deviceId}-forged`,
    },
    { newId, now: new Date() },
  );
}

/** The status the server holds for the relatório (the company pull's summary). */
async function serverStatus(page: Page, relatorioId: string): Promise<string | undefined> {
  return page.evaluate(
    async ({ relatorioId, header, version }) => {
      const res = await fetch('/api/sync/company?since=999999999999', { headers: { [header]: version } });
      const body = (await res.json()) as { summary?: { relatorios: { id: string; status: string }[] } };
      return body.summary?.relatorios.find((row) => row.id === relatorioId)?.status;
    },
    { relatorioId, header: CONTRACT_VERSION_HEADER, version: String(CONTRACT_VERSION) },
  );
}

/** The four Home status tile counts, in board order (Rascunho, Em campo, Em revisão, Emitido). */
async function tileCounts(page: Page): Promise<number[]> {
  const board = page.getByRole('group', { name: 'Relatórios por status' });
  await expect(board.locator('.status-tile')).toHaveCount(4);
  return (await board.locator('.status-tile .tile-count').allTextContents()).map((text) => Number(text));
}

interface EntityRecord {
  entity: string;
  id: string;
  row: { relatorio_id?: string; equipment_id?: string | null; removed_at?: string | null };
}

/** An equipment sheet of the relatório, as this device holds it. */
async function sheetOf(page: Page, relatorioId: string): Promise<string> {
  const sheet = (await readStore<EntityRecord>(page, database, 'entities')).find(
    (record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.equipment_id != null && record.row.removed_at == null,
  );
  expect(sheet, 'the relatório has an equipment sheet on this device').toBeDefined();
  return sheet!.id;
}

test('@p0 20.7-E2E-001 20.8-E2E-001 20.9-E2E-001 20.10-E2E-001 forged ops pushed through the page\'s own session are refused with their codes, the server keeps its rows, and the relatório still previews', async ({ page, context }) => {
  test.setTimeout(360_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  // The relatório and its sheets reach the server before anything is forged against them.
  await syncNow(page);
  expect(await serverStatus(page, relatorioId)).toBe('rascunho');
  const deviceId = await readDeviceId(page, database);
  const block = await sheetOf(page, relatorioId);

  // S1: one status put straight from Rascunho to Emitido.
  const issue = forged(deviceId, relatorioId, 'relatorio/status', 'emitido');
  const s1 = await pushFromPage(page, [issue]);
  expect(s1.status).toBe(200);
  expect(s1.body?.rejected).toEqual([{ op_id: issue.op_id, code: 'op_status_transition' }]);
  expect(await serverStatus(page, relatorioId)).toBe('rascunho');
  await syncNow(page);
  await page.goto('/');
  expect(await tileCounts(page)).toEqual([1, 0, 0, 0]);
  await expect(page.locator(`.relatorio-card[data-relatorio="${relatorioId}"] .status-pill`)).toHaveText('Rascunho');

  // S3: the sheet concluded in someone else's name, backdated.
  const concluded = forged(deviceId, relatorioId, `block/${block}/concluded_by`, { actor_id: newId(), at: '2020-01-01T00:00:00.000Z' });
  const s3 = await pushFromPage(page, [concluded]);
  expect(s3.status).toBe(200);
  expect(s3.body?.rejected).toEqual([{ op_id: concluded.op_id, code: 'op_attribution' }]);

  // S4: the 5 MB string in one push is over the body cap; a 20 001-character value under it is refused alone.
  const huge = forged(deviceId, relatorioId, 'relatorio/setup/additional_info', '');
  const s4body = await pushFromPage(page, [huge], 5 * 1024 * 1024);
  expect(5 * 1024 * 1024).toBeGreaterThan(SYNC_PUSH_MAX_BYTES);
  expect(s4body.status).toBe(413);
  expect(s4body.body?.code).toBe('body_too_large');
  const oversized = forged(deviceId, relatorioId, 'relatorio/setup/additional_info', 'x'.repeat(TEXT_CAPS.long + 1));
  const s4 = await pushFromPage(page, [oversized]);
  expect(s4.status).toBe(200);
  expect(s4.body?.rejected).toEqual([{ op_id: oversized.op_id, code: 'op_value_invalid' }]);

  // S5: a put on this relatório's sheet filed under another relatório of the company.
  const other = await pushNewRelatorio(page, account, database);
  const misfiled = forged(deviceId, other.relatorioId, `sheet/${block}/observations`, 'No relatório errado');
  const s5 = await pushFromPage(page, [misfiled]);
  expect(s5.status).toBe(200);
  expect(s5.body?.rejected).toEqual([{ op_id: misfiled.op_id, code: 'op_target_missing' }]);

  // Nothing forged landed: the relatório previews in its usual time, with no LibreOffice timeout.
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const preview = dialog.locator('.generate-row').getByRole('button', { name: /^(Pré-visualizar|Gerando rascunho…)$/ });
  await expect(preview).toBeVisible();
  const tabPromise = context.waitForEvent('page');
  await preview.click();
  const tab = await tabPromise;
  const requested = tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const url = (await requested).url();
  const pdf = await page.request.get(url);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString('latin1')).toBe('%PDF');
  await tab.close();
  expect(await serverStatus(page, relatorioId)).toBe('rascunho');
});

test('@p0 20.7-E2E-002 a status op of this device the server refuses: Sync status counts it with its sentence, and the relatório shows the server\'s status', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, built.drafts);
  // What a stale or edited build leaves in this device's outbox: Emitido straight from the Rascunho it saw.
  const deviceId = await readDeviceId(page, database);
  const stale = makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: built.relatorioId,
      path: 'relatorio/status',
      value: 'emitido',
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
      device_id: deviceId,
    },
    { newId, now: new Date() },
  );
  await seedOutbox(page, database, [stale]);
  await page.reload();
  await syncNow(page);

  const row = page.getByTestId('sync-rejected-row');
  await expect(row.locator('.sr-primary')).toHaveText('1 alteração rejeitada');
  await expect(row.locator('.sr-secondary')).toHaveText(opRejectReasonText('op_status_transition')!);
  const dead = (await readStore<{ op_id: string; status: string; error_code: string | null }>(page, database, 'outbox')).find((record) => record.op_id === stale.op_id);
  expect(dead).toMatchObject({ status: 'dead', error_code: 'op_status_transition' });

  // The relatório converges on the status the server holds.
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Rascunho', { timeout: 30_000 });
  expect(await serverStatus(page, built.relatorioId)).toBe('rascunho');
});

/** Writes `text` to the clipboard and pastes it into `field` with the keyboard, as a person does. */
async function paste(page: Page, field: Locator, text: string): Promise<void> {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await page.keyboard.press('ControlOrMeta+V');
}

/** The value of this device's newest outbox op on `path`. */
async function queuedValue(page: Page, path: string): Promise<unknown> {
  const rows = (await readStore<{ path: string; value: unknown; client_ts: string }>(page, database, 'outbox')).filter((row) => row.path === path);
  return rows.sort((a, b) => a.client_ts.localeCompare(b.client_ts)).at(-1)?.value;
}

test('@p0 20.9-E2E-002 a paste past the cap stops at the cap in the sheet observations and in a plain input; the counter shows and the queued op holds exactly the cap', async ({ page, context }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // OBSERVAÇÕES of a sheet: a long text, 20 000 characters.
  const sheet = built.sheets[0]!;
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const observations = page.getByRole('textbox', { name: 'Observações da ficha' });
  await paste(page, observations, 'o'.repeat(TEXT_CAPS.long + 500));
  await expect(observations).toHaveValue('o'.repeat(TEXT_CAPS.long));
  await expect(page.getByTestId('char-count')).toHaveText(charCountText(TEXT_CAPS.long, TEXT_CAPS.long)!);
  await page.keyboard.press('Tab');
  await expect.poll(async () => String((await queuedValue(page, `sheet/${sheet.blockId}/observations`)) ?? '').length, { timeout: 15_000 }).toBe(TEXT_CAPS.long);

  // A plain input of the setup: Etapa 5's "Justificativa", a medium text, 1 000 characters.
  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=5`);
  await expect(page.getByRole('heading', { name: 'Etapa 5 — Local' })).toBeVisible({ timeout: 30_000 });
  const justification = page.getByRole('textbox', { name: 'Justificativa', exact: true });
  await paste(page, justification, 'j'.repeat(TEXT_CAPS.medium + 1));
  await expect(justification).toHaveValue('j'.repeat(TEXT_CAPS.medium));
  await expect(page.getByTestId('char-count')).toHaveText(charCountText(TEXT_CAPS.medium, TEXT_CAPS.medium)!);
  await page.keyboard.press('Tab');
  await expect.poll(async () => String((await queuedValue(page, 'relatorio/setup/next_intervention_justification')) ?? '').length, { timeout: 15_000 }).toBe(TEXT_CAPS.medium);
  // Below 90 % of the cap the counter is not shown.
  await justification.fill('j'.repeat(10));
  await expect(page.getByTestId('char-count')).toHaveCount(0);
});
