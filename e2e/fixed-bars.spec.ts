import { DOCX_MIME, makeOp, objectKey, PDF_MIME, permissionRefusalText, SERVER_DEVICE_ID, toIso, type OpInput, type RevisionRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { loadConfig } from '../apps/api/src/config.ts';
import { seedRoleUser } from '../apps/api/src/db/seed.ts';
import { workerRoleUser } from '../apps/api/src/db/e2e-worker-seed.ts';
import { newId } from '../apps/api/src/ids.ts';
import { createS3, putObject } from '../apps/api/src/storage/s3.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { applyAsServer, pushStatusAsServer } from './support/push-server-ops.ts';
import { withSeedDb } from './support/reset-empresa-b.ts';
import { waitForCompanyPull } from './support/sync.ts';
import { escapeDialog } from './support/dialogs.ts';
import { resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { copy } from '../apps/web/src/copy/pt-br.ts';

/*
 * Story 27.11 (batch e27c, F14 of the 2026-11-21 pass): the fixed bars leave room for the work.
 *
 * The ficha (its Porto Seguro chave with every item but the first cleared from the office): the Sticky action bar
 * holds no bulk bar at 390, 768 and 1024 px, so the fixed bar is the stepper and the button row alone; the Bulk
 * action bar stands in the checklist's flow above the first unanswered item and follows it; its keyboard press marks
 * every item left (the outbox holds one C put per item), the focus goes to the list head's action, never the page.
 *
 * The Sumário (Em revisão after one real revision, "Marcar como enviado ao cliente" offered, the banner shown): at
 * 1280 and 768 px the foot is as before (its three buttons); at 390x844 the foot shows "Gerar relatório" alone, the
 * content keeps at least half the screen, and the header menu holds "Pré-visualizar" and "Marcar como enviado ao
 * cliente", which issues (the outbox holds the `emitido` put); offline the menu's "Pré-visualizar" is disabled
 * with its reason. No width scrolls sideways. 27.11-E2E-002: the same phone Sumário of an Emitido relatório opened by the
 * Consulta (no `relatorio.issue`), with its banner and the issued files. It measures the layout, so it runs in the `solo` lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const MARK_SENT = 'Marcar como enviado ao cliente';
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 900 },
] as const;

const bar = (page: Page) => page.locator('.sticky-action-bar');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const rows = (page: Page) => page.locator('#ficha-step-verificacoes li.checklist-row');
const sumarioList = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const headerTrigger = (page: Page) => page.getByRole('button', { name: 'Mais opções do relatório' });

interface OutboxOp {
  path: string;
  value: unknown;
  relatorio_id: string | null;
}
const outbox = (page: Page) => readStore<OutboxOp>(page, database, 'outbox');

/** Revision 1 of `relatorioId` as the generate job leaves it, its two files stored (small stand-ins, no generation; the e26r recipe of `roles-screens.spec.ts`). */
async function storedRevision(owner: { companyId: string; userId: string }, relatorioId: string, pdf: Buffer): Promise<void> {
  const config = loadConfig();
  const s3 = createS3(config);
  const at = new Date();
  const row: RevisionRow = { id: newId(), relatorio_id: relatorioId, number: 1, snapshot_seq: 0, created_by: owner.userId, docx_file_id: newId(), pdf_file_id: newId(), created_at: toIso(at) };
  await putObject(s3, config.S3_BUCKET, objectKey(owner.companyId, 'pdf', row.pdf_file_id), pdf, PDF_MIME);
  await putObject(s3, config.S3_BUCKET, objectKey(owner.companyId, 'docx', row.docx_file_id), Buffer.from('PK e27c'), DOCX_MIME);
  const input: OpInput = {
    kind: 'create',
    scope: 'relatorio',
    company_id: owner.companyId,
    project_id: null,
    relatorio_id: relatorioId,
    path: `revision/${row.id}`,
    value: row as never,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: 'system:generate',
    device_id: SERVER_DEVICE_ID,
  };
  await applyAsServer(owner.companyId, [makeOp(input, { newId, now: at })]);
}

/** The checklist rows' item keys in order, and the first one with no result checked (null when every row has one). */
async function checklistState(page: Page): Promise<{ keys: string[]; unanswered: string[]; firstUnanswered: string | null }> {
  return rows(page).evaluateAll((items) => {
    const keys = items.map((li) => li.getAttribute('data-item-key')!);
    const unanswered = items.filter((li) => li.querySelector('[role="radio"][aria-checked="true"]') === null).map((li) => li.getAttribute('data-item-key')!);
    return { keys, unanswered, firstUnanswered: unanswered[0] ?? null };
  });
}

/** The ficha's Sticky action bar against what it holds: its height, the stepper's, the button row's and its own padding, border and gap. */
async function fichaBars(page: Page) {
  return bar(page).evaluate((element) => {
    const style = getComputedStyle(element);
    const height = (selector: string) => element.querySelector(selector)?.getBoundingClientRect().height ?? 0;
    return {
      bar: element.getBoundingClientRect().height,
      stepper: height('.section-stepper'),
      buttons: height('.bar-buttons'),
      chrome: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.rowGap || '0'),
      bulkInBar: element.querySelectorAll('.bulk-action-bar').length,
      viewport: window.innerHeight,
    };
  });
}

/** The Sumário at the top: the foot's box, the App bar's and the banner's bottom, and the content between them. */
async function sumarioBoxes(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => {
    const foot = document.querySelector('[data-route="/relatorio/:id"] .sticky-action-bar')!.getBoundingClientRect();
    const appBar = document.querySelector('.app-bar')?.getBoundingClientRect().bottom ?? 0;
    const banner = document.querySelector('.banner-slot .banner')?.getBoundingClientRect().bottom ?? 0;
    const top = Math.max(appBar, banner);
    return { foot: Math.round(foot.height), footTop: Math.round(foot.top), appBar: Math.round(appBar), banner: Math.round(banner), content: Math.round(foot.top - top), viewport: window.innerHeight };
  });
}

test('@p0 27.11-E2E-001 the fixed bars leave room for the work: no bulk bar in the ficha\'s fixed bar (it stands above the first unanswered item); the phone Sumário foot keeps "Gerar relatório" alone and its other actions are in the header menu; 768 and 1280 px as before', async ({ page, context }) => {
  test.setTimeout(420_000);
  const fixture = await resetEmpresaBWithFixture(account);
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page, account.email);

  // --- the ficha: every answered item but the first cleared with its "Limpar", so the bar stands in the flow ---
  await page.goto(`/relatorio/${fixture.relatorioId}/ficha/${fixture.blockChaveId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Verificações,/ }).click();
  const { keys } = await checklistState(page);
  expect(keys.length).toBeGreaterThanOrEqual(4);
  for (const key of keys.slice(1)) {
    const row = page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
    if ((await row.locator('.seg[aria-checked="true"]').count()) === 0) continue;
    await row.locator('.row-main .overflow-trigger').click();
    await page.getByRole('menuitem', { name: 'Limpar' }).click();
    // A row of the type's N/A defaults shows N/A again once its own cell is cleared.
    await expect(page.getByRole('menu')).toHaveCount(0);
  }
  await expect.poll(async () => (await checklistState(page)).firstUnanswered).not.toBeNull();

  for (const size of [WIDTHS[0], WIDTHS[1], WIDTHS[2]]) {
    await page.setViewportSize(size);
    const { firstUnanswered } = await checklistState(page);
    // The bar in the flow, above the first unanswered item; one bulk bar on the page, none in the fixed bar.
    await expect(page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${firstUnanswered}"] > .bulk-action-bar`)).toBeVisible();
    await expect(page.locator('.bulk-action-bar')).toHaveCount(1);
    const bars = await fichaBars(page);
    console.log(`MEASURE 27.11 ficha ${size.width}x${size.height} ${JSON.stringify(bars)}`);
    expect(bars.bulkInBar, JSON.stringify(bars)).toBe(0);
    expect(bars.bar, JSON.stringify(bars)).toBeLessThanOrEqual(bars.stepper + bars.buttons + bars.chrome + 1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }

  // At 1024x768: answered in order, the bar moves below the item just answered, above the next one.
  await page.setViewportSize(WIDTHS[2]);
  const before = (await checklistState(page)).firstUnanswered!;
  await page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${before}"]`).getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect.poll(async () => (await checklistState(page)).firstUnanswered).not.toBe(before);
  const next = (await checklistState(page)).firstUnanswered!;
  const inFlow = page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${next}"] > .bulk-action-bar`);
  await expect(inFlow).toBeVisible();
  const left = (await checklistState(page)).unanswered;

  // Its keyboard press marks every item left; the focus follows the bar to the list head, never the body.
  await inFlow.getByRole('button', { name: 'Marcar os restantes como Conforme' }).focus();
  await page.keyboard.press('Enter');
  await expect(stepper(page).getByRole('button', { name: /^Verificações, 0 faltando/ })).toBeVisible();
  const head = page.locator('#ficha-step-verificacoes .section > .bulk-action-bar');
  await expect(head.getByRole('button', { name: 'Marcar os restantes como Conforme' })).toBeFocused();
  await expect(head.getByRole('button', { name: 'Marcar os restantes como Conforme' })).toHaveAttribute('aria-disabled', 'true');
  await expect(head.getByText('Todos os itens já estão marcados')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await expect
    .poll(async () => {
      const ops = await outbox(page);
      return left.filter((key) => ops.some((op) => op.path === `sheet/${fixture.blockChaveId}/checklist/${key}/result` && op.value === 'C')).length;
    })
    .toBe(left.length);

  // --- the Sumário: one real revision, Em revisão, "Marcar como enviado ao cliente" offered ---
  await setParecer(page, fixture.relatorioId);
  await page.setViewportSize(WIDTHS[3]);
  await page.goto(`/relatorio/${fixture.relatorioId}`);
  await expect(sumarioList(page)).toBeVisible({ timeout: 30_000 });
  await bar(page).getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await dialog.locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ }).click();
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await escapeDialog(page, dialog);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em revisão');
  await expect(page.locator('.banner-slot .banner')).toBeVisible();

  // 1280 and 768: the foot as before, its three buttons; the wide header menu only.
  for (const size of [WIDTHS[3], WIDTHS[1]]) {
    await page.setViewportSize(size);
    for (const name of ['Pré-visualizar', MARK_SENT, 'Gerar relatório']) await expect(bar(page).getByRole('button', { name })).toBeVisible();
    await expect(headerTrigger(page)).toHaveCount(1);
    await expect(page.locator('.sumario-menu[data-width="wide"] .overflow-trigger')).toBeVisible();
    console.log(`MEASURE 27.11 sumario ${size.width}x${size.height} ${JSON.stringify(await sumarioBoxes(page))}`);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }

  // 390x844: one foot button, the content at least half the screen.
  await page.setViewportSize(WIDTHS[0]);
  await expect(bar(page).getByRole('button')).toHaveCount(1);
  await expect(bar(page).getByRole('button', { name: 'Gerar relatório' })).toBeVisible();
  const phone = await sumarioBoxes(page);
  console.log(`MEASURE 27.11 sumario 390x844 ${JSON.stringify(phone)}`);
  expect(phone.content, JSON.stringify(phone)).toBeGreaterThanOrEqual(phone.viewport / 2);
  expect(phone.footTop + phone.foot).toBeLessThanOrEqual(phone.viewport + 1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The header menu holds the moved actions; it stays inside the viewport; "Marcar como enviado ao cliente" issues.
  await expect(headerTrigger(page)).toHaveCount(1);
  await headerTrigger(page).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Pré-visualizar' })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(menu.getByRole('menuitem', { name: MARK_SENT })).not.toHaveAttribute('aria-disabled', 'true');
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await menu.getByRole('menuitem', { name: MARK_SENT }).click();
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Emitido');
  await expect
    .poll(async () => (await outbox(page)).filter((op) => op.path === 'relatorio/status' && op.relatorio_id === fixture.relatorioId).map((op) => op.value))
    .toEqual(['em_revisao', 'emitido']);
  await expect(headerTrigger(page)).toBeFocused();

  // Offline: the menu's "Pré-visualizar" is disabled with its reason, as the foot button was.
  await context.setOffline(true);
  await headerTrigger(page).click();
  const offline = page.getByRole('menu').getByRole('menuitem', { name: 'Pré-visualizar' });
  await expect(offline).toHaveAttribute('aria-disabled', 'true');
  await expect(offline).toContainText(copy.export.offlineReason);
  await page.keyboard.press('Escape');
  await context.setOffline(false);
});

test('@p0 27.11-E2E-002 at 390x844 an Emitido relatório opened by the Consulta (no `relatorio.issue`): its banner and the issued files shown, the content at least half the screen, the moved actions disabled with the role\'s reason, the files reachable', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const fixture = await resetEmpresaBWithFixture(account);
  const pdf = Buffer.from('%PDF-1.4\n% e27c stand-in of an issued revision\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');
  await storedRevision(account, fixture.relatorioId, pdf);
  await pushStatusAsServer(account, fixture.relatorioId, 'emitido');
  await withSeedDb((db, auth) => seedRoleUser(db, auth, seed.index, 'consulta'));
  const consulta = workerRoleUser(seed.index, 'consulta');
  await page.setViewportSize(WIDTHS[0]);
  await signIn(page, consulta.email);
  await waitForCompanyPull(page, deviceDatabaseName(consulta.userId));

  await page.goto(`/relatorio/${fixture.relatorioId}`);
  await expect(sumarioList(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Emitido');
  const issued = page.locator('.revision-row');
  await expect(issued).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.banner-slot .banner').first()).toBeVisible();

  // One foot button, the content at least half the screen under the App bar and the banner.
  await expect(bar(page).getByRole('button')).toHaveCount(1);
  await expect(bar(page).getByRole('button', { name: 'Gerar relatório' })).toHaveAttribute('aria-disabled', 'true');
  const boxes = await sumarioBoxes(page);
  const readOnly = await page.locator('.fc-banner').count();
  console.log(`MEASURE 27.11 sumario-consulta-emitido 390x844 ${JSON.stringify({ ...boxes, fcBanner: readOnly })}`);
  expect(boxes.content, JSON.stringify(boxes)).toBeGreaterThanOrEqual(boxes.viewport / 2);
  expect(boxes.footTop + boxes.foot).toBeLessThanOrEqual(boxes.viewport + 1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The phone menu: the moved action disabled with the role's reason; no "Marcar como enviado ao cliente" on an Emitido relatório.
  await headerTrigger(page).click();
  const menu = page.getByRole('menu');
  const previewItem = menu.getByRole('menuitem', { name: 'Pré-visualizar' });
  await expect(previewItem).toHaveAttribute('aria-disabled', 'true');
  await expect(previewItem).toContainText(permissionRefusalText('relatorio.issue'));
  await expect(menu.getByRole('menuitem', { name: MARK_SENT })).toHaveCount(0);
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // The issued files: scrolled to and pressed above the foot, the PDF downloaded as stored.
  await issued.scrollIntoViewIfNeeded();
  const fileBox = (await issued.boundingBox())!;
  const footTop = await bar(page).evaluate((element) => element.getBoundingClientRect().top);
  expect(fileBox.y + fileBox.height).toBeLessThanOrEqual(footTop + 1);
  const download = await downloadFrom(page, () => issued.locator('.rev-files').getByRole('button', { name: 'PDF' }).click());
  expect(download.suggestedFilename()).toBe('relatorio-rev-1.pdf');
  expect((await downloadBytes(download)).byteLength).toBe(pdf.byteLength);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
