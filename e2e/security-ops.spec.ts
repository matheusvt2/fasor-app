import {
  charCountText,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  findDefinition,
  GENERATE_ROUTES,
  makeOp,
  opRejectReasonText,
  RELATORIO_MAX_BYTES,
  SYNC_PUSH_MAX_BYTES,
  SYNC_ROUTES,
  TEXT_CAPS,
  VALUE_MAX_BYTES,
  VALUE_MAX_ITEMS,
  type JsonValue,
  type Op,
} from '@app/domain';
import { shortStringsOfBytes } from '@app/domain/fixtures/value-caps';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { appOrigin } from './support/origin.ts';
import { pullAll, readDeviceId, readStore, seedOutbox } from './support/outbox.ts';
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

/** A push's answer body, parsed when it is JSON. */
function parsedBody(text: string): PushAnswer['body'] {
  try {
    return JSON.parse(text) as PushAnswer['body'];
  } catch {
    return null;
  }
}

/** POSTs `ops` to `/api/sync/ops` from the page itself, with the page's cookie and the contract header. */
async function pushFromPage(page: Page, ops: readonly Op[]): Promise<PushAnswer> {
  const answer = await page.evaluate(
    async ({ opsJson, header, version }) => {
      const res = await fetch('/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json', [header]: version }, body: `{"ops":${opsJson}}` });
      return { status: res.status, text: await res.text() };
    },
    { opsJson: JSON.stringify(ops), header: CONTRACT_VERSION_HEADER, version: String(CONTRACT_VERSION) },
  );
  return { status: answer.status, body: parsedBody(answer.text) };
}

/**
 * The same push with the page's own session cookie, sent from the test runner straight to the api
 * (`API_PROXY_TARGET`). For the 5 MB body only: the api answers 413 before the upload ends, and the
 * dev server's proxy in front of the page may report that early answer as a 502 while it is still
 * writing the body (a race of the e2e setup, not of the api).
 */
async function pushFromRunner(page: Page, ops: readonly Op[]): Promise<PushAnswer> {
  const cookie = (await page.context().cookies(page.url())).map((entry) => `${entry.name}=${entry.value}`).join('; ');
  const res = await fetch(`${process.env.API_PROXY_TARGET ?? 'http://localhost:3000'}/api/sync/ops`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: new URL(page.url()).origin, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    body: JSON.stringify({ ops }),
  });
  return { status: res.status, body: parsedBody(await res.text()) };
}

/** A hand-written relatório-scope put of the signed-in user, from a device of their own (`prevOpId`: the op it says it saw on the path). */
function forged(deviceId: string, relatorioId: string, path: string, value: unknown, prevOpId: string | null = null): Op {
  return makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path,
      value: value as JsonValue,
      prev_op_id: prevOpId,
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
  row: { relatorio_id?: string; equipment_id?: string | null; removed_at?: string | null; block_type?: string; seed_version?: string };
}

/** e20f: an equipment sheet of the relatório whose type has a nameplate, and that nameplate's first field, as this device holds it. */
async function nameplateOf(page: Page, relatorioId: string): Promise<{ blockId: string; field: string }> {
  const sheets = (await readStore<EntityRecord>(page, database, 'entities')).filter(
    (record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.equipment_id != null && record.row.removed_at == null,
  );
  for (const sheet of sheets) {
    const field = findDefinition(sheet.row.seed_version ?? '', sheet.row.block_type ?? '')?.nameplate[0]?.key;
    if (field !== undefined) return { blockId: sheet.id, field };
  }
  throw new Error('the relatório has no sheet with a nameplate on this device');
}

/** e20f: "Pré-visualizar" in the Gerar relatório dialog, until the preview PDF answers (within `JOB_TIMEOUT`, no LibreOffice timeout). */
async function previewThroughDialog(page: Page, context: BrowserContext, relatorioId: string): Promise<void> {
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
}

/** e20f: a hand-written point create of the signed-in user, in the relatório. */
function pointOp(deviceId: string, relatorioId: string, text: string): Op {
  const id = newId();
  return makeOp(
    {
      kind: 'create',
      scope: 'relatorio',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: `point/${id}`,
      value: { id, relatorio_id: relatorioId, text, equipment_id: null, origin: 'manual', order_key: `a${id.slice(-8)}`, removed_at: null } as JsonValue,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
      device_id: `${deviceId}-forged`,
    },
    { newId, now: new Date() },
  );
}

/** e20f: queues an issue of the relatório through the generate route, as "Gerar relatório" does, and waits for its revision. */
async function issueRevision(page: Page, relatorioId: string): Promise<void> {
  const route = GENERATE_ROUTES.generate(relatorioId);
  const queued = await page.request.post(route.path, {
    headers: { ...appOrigin(page), [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    data: { last_op_id: null, file_ids_expected: [] },
  });
  expect(queued.status(), await queued.text()).toBe(202);
  await expect
    .poll(async () => (await pullAll(page.request, SYNC_ROUTES.pullRelatorio(relatorioId).path)).ops.some((op) => op.path.startsWith('revision/')), { timeout: JOB_TIMEOUT, intervals: [2_000] })
    .toBe(true);
}

/** An equipment sheet of the relatório, as this device holds it. */
async function sheetOf(page: Page, relatorioId: string): Promise<string> {
  const sheet = (await readStore<EntityRecord>(page, database, 'entities')).find(
    (record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.equipment_id != null && record.row.removed_at == null,
  );
  expect(sheet, 'the relatório has an equipment sheet on this device').toBeDefined();
  return sheet!.id;
}

test('@p0 20.7-E2E-001 20.8-E2E-001 20.9-E2E-001 20.10-E2E-001 e20f-E2E-001 forged ops pushed through the page\'s own session are refused with their codes, the server keeps its rows, and the relatório (a value at the caps included) still previews', async ({ page, context }) => {
  test.setTimeout(540_000);
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
  const huge = forged(deviceId, relatorioId, 'relatorio/setup/additional_info', 'x'.repeat(5 * 1024 * 1024));
  expect(Buffer.byteLength(JSON.stringify({ ops: [huge] }))).toBeGreaterThan(SYNC_PUSH_MAX_BYTES);
  const s4body = await pushFromRunner(page, [huge]);
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

  // e20f: a value naming a row of another relatório (a feeding block of the other one) is refused the same way.
  const otherBlock = (await pullAll(page.request, SYNC_ROUTES.pullRelatorio(other.relatorioId).path)).ops.find((op) => op.kind === 'create' && op.path.startsWith('block/'));
  expect(otherBlock, 'the other relatório has a block').toBeDefined();
  const feedsOther = forged(deviceId, relatorioId, `block/${block}/feeds_block_id`, (otherBlock!.value as { id: string }).id);
  const s5b = await pushFromPage(page, [feedsOther]);
  expect(s5b.body?.rejected).toEqual([{ op_id: feedsOther.op_id, code: 'op_target_missing' }]);

  // e20f: a nameplate cell over the whole-value caps (one item more, or one byte more) is refused; one at exactly the caps applies.
  const plate = await nameplateOf(page, relatorioId);
  const platePath = `sheet/${plate.blockId}/nameplate/${plate.field}`;
  const overItems = forged(deviceId, relatorioId, platePath, shortStringsOfBytes(VALUE_MAX_ITEMS + 1, VALUE_MAX_BYTES));
  const overBytes = forged(deviceId, relatorioId, platePath, shortStringsOfBytes(VALUE_MAX_ITEMS, VALUE_MAX_BYTES + 1));
  const over = await pushFromPage(page, [overItems, overBytes]);
  expect(over.body?.rejected).toEqual([
    { op_id: overItems.op_id, code: 'op_value_invalid' },
    { op_id: overBytes.op_id, code: 'op_value_invalid' },
  ]);
  const atCaps = forged(deviceId, relatorioId, platePath, shortStringsOfBytes(VALUE_MAX_ITEMS, VALUE_MAX_BYTES));
  const capped = await pushFromPage(page, [atCaps]);
  expect(capped.body?.rejected).toEqual([]);
  expect(capped.body?.applied?.map((entry) => entry.op_id)).toEqual([atCaps.op_id]);

  // e20f: a forged seen status gains nothing. The relatório is issued and sent (Emitido), moved back to Rascunho and
  // edited; a status put of Em revisão that names the old Emitido op as what it saw, with no generate, is refused.
  // The parecer is the one blocking pre-issue row of an empty relatório.
  const parecer = forged(deviceId, relatorioId, 'relatorio/setup/parecer', { verdict: 'apto', text: 'Apto para operação.', text_status: 'edited', text_basis: null });
  expect((await pushFromPage(page, [parecer])).body?.rejected).toEqual([]);
  await issueRevision(page, relatorioId);
  const toRevision = forged(deviceId, relatorioId, 'relatorio/status', 'em_revisao');
  expect((await pushFromPage(page, [toRevision])).body?.rejected).toEqual([]);
  const sent = forged(deviceId, relatorioId, 'relatorio/status', 'emitido', toRevision.op_id);
  expect((await pushFromPage(page, [sent])).body?.rejected).toEqual([]);
  expect(await serverStatus(page, relatorioId)).toBe('emitido');
  const back = forged(deviceId, relatorioId, 'relatorio/status', 'rascunho', sent.op_id);
  const edited = forged(deviceId, relatorioId, `sheet/${block}/observations`, 'Editado depois de voltar');
  expect((await pushFromPage(page, [back, edited])).body?.rejected).toEqual([]);
  const forgedSeen = forged(deviceId, relatorioId, 'relatorio/status', 'em_revisao', sent.op_id);
  const seen = await pushFromPage(page, [forgedSeen]);
  expect(seen.body?.rejected).toEqual([{ op_id: forgedSeen.op_id, code: 'op_status_transition' }]);
  expect(await serverStatus(page, relatorioId)).toBe('rascunho');

  // Nothing forged landed, and the value at the caps did: the relatório previews in its usual time, with no LibreOffice timeout.
  await previewThroughDialog(page, context, relatorioId);
  expect(await serverStatus(page, relatorioId)).toBe('rascunho');
});

test('@p0 e20f-E2E-004 a relatório filled with point text to its budget refuses the op past the budget op_value_invalid', async ({ page }) => {
  test.setTimeout(360_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  const deviceId = await readDeviceId(page, database);
  const full = 'p'.repeat(TEXT_CAPS.long);
  // Points of 20 000 characters, each op within every cap: most of the budget in pushes of 100 (each under the body cap), then one at a time until one is refused.
  // Previewing a relatório this full is not asserted: near 2 MiB of point text a preview can outlast the job wait, an accepted risk (Matheus, 2026-11-04, 4 MiB budget).
  const bulk = Array.from({ length: Math.floor((0.9 * RELATORIO_MAX_BYTES) / (TEXT_CAPS.long + 400)) }, () => pointOp(deviceId, built.relatorioId, full));
  for (let start = 0; start < bulk.length; start += 100) {
    expect((await pushFromPage(page, bulk.slice(start, start + 100))).body?.rejected).toEqual([]);
  }
  let refused: Op | null = null;
  for (let guard = 0; guard < 60 && refused === null; guard++) {
    const next = pointOp(deviceId, built.relatorioId, full);
    const answer = await pushFromPage(page, [next]);
    if (answer.body?.rejected?.length) {
      expect(answer.body.rejected).toEqual([{ op_id: next.op_id, code: 'op_value_invalid' }]);
      refused = next;
    }
  }
  expect(refused, 'an op past the budget was refused').not.toBeNull();
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

test('@p0 20.13-E2E-001 a cross-site push with the session cookie (a foreign Origin, or a text/plain body) is refused 403 forbidden_origin and applies nothing', async ({ page }) => {
  await signIn(page, account.email);
  const deviceId = await readDeviceId(page, database);
  const projectId = newId();
  const name = `CROSS-SITE-${Date.now()}`;
  const op = makeOp(
    {
      kind: 'create',
      scope: 'company',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: null,
      path: `project/${projectId}`,
      value: { id: projectId, client_id: null, name, site: name, removed_at: null },
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
      device_id: `${deviceId}-forged`,
    },
    { newId, now: new Date() },
  );
  const body = JSON.stringify({ ops: [op] });
  const version = { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) };
  // `page.request` carries the context's session cookie, as a form post from another site would.
  const foreign = await page.request.post('/api/sync/ops', { headers: { ...version, origin: 'https://evil.example', 'content-type': 'application/json' }, data: body });
  expect(foreign.status()).toBe(403);
  expect(((await foreign.json()) as { code?: string }).code).toBe('forbidden_origin');
  const plain = await page.request.post('/api/sync/ops', { headers: { ...version, origin: new URL(page.url()).origin, 'content-type': 'text/plain' }, data: body });
  expect(plain.status()).toBe(403);
  expect(((await plain.json()) as { code?: string }).code).toBe('forbidden_origin');
  const noOrigin = await page.request.post('/api/sync/ops', { headers: { ...version, 'content-type': 'application/json' }, data: body });
  expect(noOrigin.status()).toBe(403);

  // Nothing reached the server's log, and nothing is waiting on the device.
  const stream = await page.evaluate(
    async ({ header, value }) => (await fetch('/api/sync/company?since=0', { headers: { [header]: value } })).text(),
    { header: CONTRACT_VERSION_HEADER, value: String(CONTRACT_VERSION) },
  );
  expect(stream).not.toContain(op.op_id);
  expect(stream).not.toContain(name);
  expect(JSON.stringify(await readStore(page, database, 'outbox'))).not.toContain(name);

  // The app's own way in (its origin, a JSON body) is the same request accepted.
  const own = await page.request.post('/api/sync/ops', { headers: { ...version, origin: new URL(page.url()).origin, 'content-type': 'application/json' }, data: body });
  expect(own.status(), await own.text()).toBe(200);
});
