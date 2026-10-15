import { artOrTrtLabel, CONTRACT_VERSION, CONTRACT_VERSION_HEADER, makeOp, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { escapeDialog } from './support/dialogs.ts';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readDeviceId, readStore } from './support/outbox.ts';
import { addLocal } from './support/local.ts';
import { createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Status flow 2026-10-10 (Matheus; `implementation-artifacts/spec-status-flow-2026-10-10.md`),
 * the whole matrix driven as a person would, at 1280 and at 390 px:
 *
 * - SF-E2E-001, a relatório born on Home (Rascunho): the next-step sentence under the status
 *   pill and Setup name what is missing (every gap at once); a Dados do relatório edit and the
 *   tree's structure (a section removed, a cabine added and renamed) keep Rascunho; a sheet
 *   edit made offline carries Em campo in its own batch and says "Relatório em campo"; and a
 *   status toast never drops a live "Desfazer" toast.
 * - SF-E2E-002, the small Porto Seguro fixture (Em campo): two other devices of one user are
 *   one "Último envio" line; a generate gives Em revisão, and the revision's arrival leaves it
 *   there, "ainda não enviada ao cliente"; "Marcar como enviado ao cliente" is the one issue
 *   (Emitido); an `unchanged` generate after a backward move ends Em revisão, never Emitido;
 *   an Emitido relatório's sheet says that editing reopens it, and the edit does, in its batch;
 *   the Controle do documento row follows the Export dialog's "Rev." line.
 * - SF-E2E-003 (2026-10-13, Matheus; AD-22's `Emitido --generate--> Em revisão` row), at
 *   1280 px: an Emitido relatório regenerated with nothing edited (`unchanged`) stays Emitido;
 *   once it holds content the client does not have and no status op came with it (another
 *   device's edit, pulled here), "Gerar relatório" builds revision 2 and reopens it as
 *   Em revisão, "Ainda não enviada ao cliente", with "Marcar como enviado ao cliente" offered.
 *
 * The second and third tests generate through the one queue and LibreOffice, so the file runs
 * in the serial group (`support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const WIDTHS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
] as const;

const MARK_SENT = 'Marcar como enviado ao cliente';
const JOB_TIMEOUT = 150_000;
const IDLE_1 = 'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.';
const IDLE_2 = 'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 2. Precisa de conexão.';

const sumarioList = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');
const bar = (page: Page) => page.locator('.sticky-action-bar');
/** The Sticky action bar's own reason: the blocking sentence alone (decision 5). */
const foot = (page: Page) => bar(page).locator('.btn-reason').first();
/** The status's next step, right under the status pill in the Sumário header. */
const step = (page: Page) => page.getByTestId('status-next-step');
const footGenerate = (page: Page) => bar(page).getByRole('button', { name: 'Gerar relatório' });
const footMarkSent = (page: Page) => bar(page).getByRole('button', { name: MARK_SENT });
const controle = (page: Page) => sumarioList(page).locator('li[data-row="controle"]');
const banner = (page: Page) => page.locator('.banner-slot .banner');
const toast = (page: Page) => page.getByTestId('toast');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const idleReason = (page: Page) => dialog(page).locator('.generate-row .btn-reason');
const observations = (page: Page) => page.getByRole('textbox', { name: 'Observações da ficha' });

interface OutboxOp {
  path: string;
  value: unknown;
  batch_id: string | null;
  relatorio_id: string | null;
}
const outbox = (page: Page) => readStore<OutboxOp>(page, database, 'outbox');
const statusValues = async (page: Page, relatorioId: string) =>
  (await outbox(page)).filter((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId).map((op) => op.value);

async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumarioList(page)).toBeVisible({ timeout: 30_000 });
}

/** The first equipment sheet this device holds of the relatório, opened by its address. */
async function openFirstSheet(page: Page, relatorioId: string): Promise<string> {
  const entities = await readStore<{ entity: string; id: string; row: { relatorio_id?: string; equipment_id?: string | null; location_id?: string | null; removed_at?: string | null } }>(page, database, 'entities');
  const sheet = entities.find((record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.equipment_id != null && record.row.removed_at == null);
  expect(sheet, 'the relatório has an equipment sheet on this device').toBeDefined();
  await page.goto(`/relatorio/${relatorioId}/ficha/${sheet!.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  return sheet!.id;
}

/** Types into "Observações da ficha" and leaves the field, as a person does. */
async function typeObservation(page: Page, text: string): Promise<void> {
  const field = observations(page);
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await field.fill(text);
  await page.keyboard.press('Tab');
}

/** Opens the header Overflow and confirms the one-step backward move to `to`. */
async function moveBackTo(page: Page, to: string): Promise<void> {
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: `Voltar para ${to}` }).click();
  await page.getByRole('dialog', { name: `Voltar para ${to}` }).getByRole('button', { name: `Voltar para ${to}` }).click();
  await expect(headerPill(page)).toHaveText(to);
}

/** One op pushed as another device of this same user (`suffix` names the device). */
async function pushFromDevice(page: Page, suffix: string, draft: OpDraft): Promise<void> {
  const deviceId = await readDeviceId(page, database);
  const op = makeOp({ ...draft, batch_id: null, device_id: `${deviceId}-${suffix}` }, { newId, now: new Date() });
  const pushed = await page.request.post('/api/sync/ops', { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) }, data: { ops: [op] } });
  expect(pushed.ok(), await pushed.text()).toBe(true);
  expect(((await pushed.json()) as { rejected?: unknown[] }).rejected ?? []).toEqual([]);
}

/** The toast's own "Fechar" (a toast with an action carries it). */
const closeToast = (page: Page): Locator => toast(page).getByRole('button', { name: 'Fechar' });

for (const viewport of WIDTHS) {
  test(`@p0 SF-E2E-001 (${viewport.width} px) Rascunho: the next step and Setup name every gap; a Setup edit and the tree's structure keep Rascunho; an offline sheet edit carries Em campo and says it; a status toast never drops "Desfazer"`, async ({
    page,
    context,
  }) => {
    test.setTimeout(300_000);
    await resetEmpresaB(account, { standard: true });
    await signIn(page, account.email);
    await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
    await createProjectFromHome(page);
    const relatorioId = await createRelatorio(page);
    await expect(headerPill(page)).toHaveText('Rascunho');

    // A third gap, made at the office: the end date cleared on another device.
    await syncNowAndReturn(page);
    await pushDrafts(page, database, [officeDraft(account, { relatorioId }, 'relatorio/setup/service_end', null)]);
    await syncNowAndReturn(page);
    await page.setViewportSize(viewport);
    await openSumario(page, relatorioId);
    await expect(headerPill(page)).toHaveText('Rascunho');

    // M6, m1, decision 5: the sentence under the status pill names what is missing and what moves the
    // relatório; the bar keeps the blocking sentence alone; Controle, the first revision.
    const document = artOrTrtLabel('crt');
    const gaps = `a data de fim, o número da ${document} e um instrumento`;
    // Story 14.3: a relatório born on seed v4 has the site checklist, and the sentence names it.
    await expect(step(page)).toHaveText(`Rascunho: falta ${gaps} em Dados do relatório. Preencher uma ficha ou as verificações do local passa o relatório a Em campo.`, { timeout: 30_000 });
    await expect(page.locator('.sheet-meta + [data-testid="status-next-step"]')).toHaveCount(1);
    await expect(bar(page).getByTestId('status-next-step')).toHaveCount(0);
    await expect(foot(page)).toHaveText('Só Conclusão e parecer (linha 10) impede gerar. O resto está escrito em cada linha.');
    await expect(controle(page)).toContainText('Rev. 1 na primeira emissão');
    await expect(footMarkSent(page)).toHaveCount(0);

    // M2: Setup names every gap at once, on the disabled "Concluir".
    await sumarioList(page).getByRole('button', { name: /^Capa e dados do relatório/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' })).toBeFocused();
    const complete = page.getByRole('button', { name: 'Concluir dados do relatório' });
    await expect(complete).toHaveAttribute('aria-disabled', 'true');
    await expect(complete).toHaveAccessibleDescription(`Concluir dados do relatório: falta ${gaps}`);

    // Decision 1: a Dados do relatório edit keeps Rascunho and says nothing about the status.
    const info = page.getByLabel('Informações adicionais');
    await info.click();
    await info.pressSequentially('Parada de 12 horas');
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await outbox(page)).filter((op) => op.path === 'relatorio/setup/additional_info').length).toBe(1);
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(sumarioList(page)).toBeVisible();
    await expect(headerPill(page)).toHaveText('Rascunho');
    expect(await statusValues(page, relatorioId)).toEqual([]);
    await expect(toast(page).filter({ hasText: 'Relatório em campo' })).toHaveCount(0);

    // Decision 3: the tree's structure keeps Rascunho too. A section removed (its own "Desfazer"
    // toast and nothing else), a local added, its Função and name changed (Story 14.2: `funcao` is
    // structure): no status op, no status toast.
    await page.getByRole('button', { name: 'Mais opções de Definições' }).click();
    await page.getByRole('menuitem', { name: 'Remover' }).click();
    await expect(toast(page)).toContainText('Seção removida deste relatório — numeração refeita');
    await closeToast(page).click();
    await expect(toast(page)).toHaveCount(0);
    const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    await addLocal(page, { funcao: 'Primária', name: 'Cabine 7' });
    await expect(page.getByRole('button', { name: /^(Expandir|Recolher) Cabine 7$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Mais opções de Cabine 7', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Função e nome' }).click();
    const rename = page.getByRole('dialog', { name: 'Função e nome' });
    await rename.getByRole('radio', { name: 'Transformação' }).click();
    await rename.getByRole('textbox', { name: 'Nome', exact: true }).fill('Cabine nova');
    await rename.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('button', { name: /^(Expandir|Recolher) Cabine nova$/ })).toBeVisible();
    // The new local's own ops: its create, then the `funcao` and `name` puts of "Função e nome".
    await expect
      .poll(async () => {
        const ops = (await outbox(page)).filter((op) => op.path.startsWith('location/'));
        const created = ops.find((op) => /^location\/[^/]+$/.test(op.path) && (op.value as { name?: string } | null)?.name === 'Cabine 7');
        return created === undefined ? [] : ops.filter((op) => op.path.startsWith(created.path)).map((op) => op.path.slice(created.path.length)).sort();
      })
      .toEqual(['', '/funcao', '/name']);
    await expect(headerPill(page)).toHaveText('Rascunho');
    expect(await statusValues(page, relatorioId)).toEqual([]);
    await expect(toast(page).filter({ hasText: 'Relatório em campo' })).toHaveCount(0);

    // Field work, offline: the sheet edit carries Em campo in its own batch, and says so.
    const blockId = await openFirstSheet(page, relatorioId);
    await context.setOffline(true);
    await typeObservation(page, 'Visto em campo');
    await expect(toast(page)).toContainText('Relatório em campo', { timeout: 15_000 });
    const ops = await outbox(page);
    const edit = ops.find((op) => op.path === `sheet/${blockId}/observations`);
    const status = ops.find((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId);
    expect(edit).toBeDefined();
    expect(status).toMatchObject({ value: 'em_campo' });
    expect(edit!.batch_id).not.toBeNull();
    expect(status!.batch_id).toBe(edit!.batch_id);
    await context.setOffline(false);

    await openSumario(page, relatorioId);
    await expect(headerPill(page)).toHaveText('Em campo');
    await expect(step(page)).toHaveText('Em campo: gerar o relatório passa a Em revisão.');

    // Back to Rascunho by the header's move, which is said too.
    await moveBackTo(page, 'Rascunho');
    await expect(toast(page)).toContainText('Relatório voltou para Rascunho', { timeout: 15_000 });

    // An undo toast on screen is not lost to the status toast: the sheet's bulk action is field
    // content (Em campo, in its batch), its "Desfazer" stays, and the status is said once that
    // toast is closed.
    await openFirstSheet(page, relatorioId);
    const before = (await statusValues(page, relatorioId)).length;
    await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
    await expect(toast(page)).toContainText('marcados Conforme');
    await expect.poll(async () => (await statusValues(page, relatorioId)).slice(before)).toEqual(['em_campo']);
    // The status change was committed; the toast on screen is still the undo one.
    await page.waitForTimeout(1_000);
    await expect(toast(page)).toHaveCount(1);
    await expect(toast(page)).toContainText('marcados Conforme');
    await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
    await closeToast(page).click();
    await expect(toast(page)).toHaveText('Relatório em campo');
    // A status toast is passive: it takes no press.
    await expect(toast(page)).toHaveCSS('pointer-events', 'none');
  });

  test(`@p0 SF-E2E-002 (${viewport.width} px) Em campo to Emitido: one "Último envio" line per user; a generate gives Em revisão, not yet sent; "Marcar como enviado ao cliente" issues; an unchanged generate ends Em revisão; a sheet edit after Emitido reopens it`, async ({
    page,
  }) => {
    test.setTimeout(480_000);
    await resetEmpresaBWithFixture(account);
    await signIn(page, account.email);
    await openSumario(page, EXPORT_RELATORIO_ID);
    await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });
    await setParecer(page, EXPORT_RELATORIO_ID);

    // m2: two other devices of this user push; the dialog draws one line for them, not two.
    await pushFromDevice(page, 'office-a', officeDraft(account, { relatorioId: EXPORT_RELATORIO_ID }, 'relatorio/setup/local', 'Sala elétrica A'));
    await pushFromDevice(page, 'office-b', officeDraft(account, { relatorioId: EXPORT_RELATORIO_ID }, 'relatorio/setup/local', 'Sala elétrica B'));
    await syncNowAndReturn(page);
    await page.setViewportSize(viewport);
    await openSumario(page, EXPORT_RELATORIO_ID);
    await expect(step(page)).toHaveText('Em campo: gerar o relatório passa a Em revisão.', { timeout: 30_000 });
    await expect(foot(page)).toHaveText(/^Nada impede gerar\./);
    await expect(foot(page)).not.toContainText('Em campo');
    await expect(controle(page)).toContainText('Rev. 1 na primeira emissão');
    // The bar before mark-as-sent is offered: its height is what one more button row is measured against.
    const barBefore = (await bar(page).boundingBox())!.height;

    await footGenerate(page).click();
    await expect(dialog(page)).toBeVisible();
    const lastSend = dialog(page).locator('.precheck li', { hasText: `Último envio de ${account.name}` });
    await expect(lastSend).toHaveCount(1);
    await expect(lastSend).toHaveText(new RegExp(`^Último envio de ${account.name}: \\d{2}/\\d{2} \\d{2}:\\d{2}$`));

    // Generate from Em campo: Em revisão; the revision arrives and it stays there.
    await expect(idleReason(page)).toHaveText(IDLE_1);
    await generateButton(page).click();
    await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
    await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible();
    await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Em revisão');
    await expect(dialog(page).locator('.row-wrap .t-meta')).toHaveText('Ainda não enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 2.');
    // The action stands above "Gerar de novo".
    const markInDialog = dialog(page).getByRole('button', { name: MARK_SENT });
    await expect(markInDialog).toBeVisible();
    const markBox = (await markInDialog.boundingBox())!;
    const againBox = (await dialog(page).getByRole('button', { name: 'Gerar de novo' }).boundingBox())!;
    expect(markBox.y).toBeLessThan(againBox.y);
    expect(await statusValues(page, EXPORT_RELATORIO_ID)).toEqual(['em_revisao']);
    await escapeDialog(page, dialog(page));

    // The Sumário says the same: the banner, the Controle row ("gerada", decision 4), the next
    // step under the pill, and the action in the bar, described by that sentence.
    await expect(headerPill(page)).toHaveText('Em revisão');
    await expect(banner(page)).toContainText(/Revisão 1 gerada em \d{2}\/\d{2}, ainda não enviada ao cliente\./);
    await expect(controle(page)).toContainText('Rev. 1 gerada');
    const notSent = 'Em revisão: a revisão 1 ainda não foi enviada ao cliente. Depois de enviar, use "Marcar como enviado ao cliente".';
    await expect(step(page)).toHaveText(notSent);
    await expect(footMarkSent(page)).toHaveAccessibleDescription(notSent);
    await expect(foot(page)).not.toContainText('Em revisão');
    // Decision 5: the bar is no taller than before plus one button row (48 px and its gap), and
    // nothing scrolls sideways (390 x 844 above all).
    const barNow = (await bar(page).boundingBox())!.height;
    expect(barNow, `bar ${barNow} px, was ${barBefore} px`).toBeLessThanOrEqual(barBefore + 64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // "Marcar como enviado ao cliente" from the foot: one issue op, Emitido, and the toast names it.
    await footMarkSent(page).click();
    await expect(headerPill(page)).toHaveText('Emitido');
    await expect(toast(page)).toHaveText('Revisão 1 marcada como enviada ao cliente. Relatório emitido.', { timeout: 20_000 });
    await expect(footMarkSent(page)).toHaveCount(0);
    await expect(step(page)).toHaveText('Emitido: nada mudou desde a revisão 1.');
    await expect(banner(page)).toContainText('(revisão 1). Alterações geram a revisão 2.');
    await expect(controle(page)).toContainText('Rev. 1 emitida');
    expect(await statusValues(page, EXPORT_RELATORIO_ID)).toEqual(['em_revisao', 'emitido']);

    // Moved back to Em campo with nothing edited: "Gerar relatório" answers revision 1
    // (`unchanged`), writes `generate` only and ends Em revisão, never Emitido.
    await moveBackTo(page, 'Em revisão');
    await moveBackTo(page, 'Em campo');
    await expect(toast(page)).toContainText('Relatório voltou para Em campo', { timeout: 20_000 });
    await footGenerate(page).click();
    const again = dialog(page).getByRole('button', { name: 'Gerar de novo' });
    await expect(again.or(idleReason(page))).toBeVisible();
    if (await again.isVisible()) await again.click();
    await expect(idleReason(page)).toHaveText(IDLE_1);
    await generateButton(page).click();
    await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: 30_000 });
    await expect(dialog(page).locator('.revision-row')).toHaveCount(1);
    await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Em revisão');
    expect(await statusValues(page, EXPORT_RELATORIO_ID)).toEqual(['em_revisao', 'emitido', 'em_revisao', 'em_campo', 'em_revisao']);
    // Marked as sent again, in the dialog this time.
    await dialog(page).getByRole('button', { name: MARK_SENT }).click();
    await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
    await expect(dialog(page).locator('.row-wrap .t-meta')).toHaveText('Enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 2.');
    await expect(dialog(page).getByRole('button', { name: MARK_SENT })).toHaveCount(0);
    await escapeDialog(page, dialog(page));
    await expect(headerPill(page)).toHaveText('Emitido');

    // An Emitido relatório's sheet says that editing reopens it; the edit does, in its batch.
    const blockId = await openFirstSheet(page, EXPORT_RELATORIO_ID);
    const sheetBanner = 'Relatório emitido (revisão 1). Editar esta ficha reabre o relatório como Em revisão e gera a revisão 2.';
    await expect(banner(page)).toContainText(sheetBanner);
    await typeObservation(page, 'Revisto depois do envio');
    await expect(toast(page)).toHaveText('Relatório reaberto em revisão. A próxima emissão gera a revisão 2.', { timeout: 20_000 });
    await expect(page.getByText(sheetBanner)).toHaveCount(0);
    const ops = await outbox(page);
    const edit = ops.find((op) => op.path === `sheet/${blockId}/observations`);
    const reopened = ops.filter((op) => op.path === 'relatorio/status' && op.relatorio_id === EXPORT_RELATORIO_ID).at(-1);
    expect(edit).toBeDefined();
    expect(reopened).toMatchObject({ value: 'em_revisao' });
    expect(reopened!.batch_id).toBe(edit!.batch_id);

    // The Sumário: Em revisão with newer edits asks for revision 2 first (decision 2), and
    // the Controle row reads the Export dialog's own "Rev." line.
    await openSumario(page, EXPORT_RELATORIO_ID);
    await expect(headerPill(page)).toHaveText('Em revisão');
    await expect(controle(page)).toContainText('Rev. 2 na próxima emissão');
    await expect(step(page)).toHaveText('Em revisão: há alterações desde a revisão 1. Gere a revisão 2 antes de marcar como enviado ao cliente.');
    await expect(footMarkSent(page)).toHaveCount(0);
    await expect(banner(page)).toContainText('Há alterações desde a revisão 1');
    await footGenerate(page).click();
    await expect(idleReason(page)).toHaveText(IDLE_2);
    await expect(dialog(page).locator('dl.doc-control')).toContainText('Rev. 2');

    // Revision 2, marked as sent; then an edit made on the Sumário itself (a cabine added: from
    // Emitido every `editedSince` edit reopens) while the dialog still holds its result block.
    // The note must not say "Ainda não enviada" of a revision that was sent: with edits since
    // it, the plain sentence, and no mark-as-sent.
    await generateButton(page).click();
    await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 2 pronta' })).toBeVisible({ timeout: JOB_TIMEOUT });
    const note = dialog(page).locator('.row-wrap .t-meta');
    await expect(note).toHaveText('Ainda não enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 3.');
    await dialog(page).getByRole('button', { name: MARK_SENT }).click();
    await expect(note).toHaveText('Enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 3.');
    await escapeDialog(page, dialog(page));
    await expect(headerPill(page)).toHaveText('Emitido');
    const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    await addLocal(page, { funcao: 'Primária' });
    await expect(headerPill(page)).toHaveText('Em revisão');
    await expect(step(page)).toHaveText('Em revisão: há alterações desde a revisão 2. Gere a revisão 3 antes de marcar como enviado ao cliente.');
    await footGenerate(page).click();
    await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 2 pronta' })).toBeVisible();
    await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Em revisão');
    await expect(note).toHaveText('Qualquer alteração a partir de agora gera a revisão 3.');
    await expect(dialog(page).getByRole('button', { name: MARK_SENT })).toHaveCount(0);
  });
}

test('@p0 SF-E2E-003 Emitido with content the client does not have: an unchanged generate keeps Emitido; a generate that builds revision 2 reopens it as Em revisão, not yet sent, and "Marcar como enviado ao cliente" is offered again', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openSumario(page, EXPORT_RELATORIO_ID);
  await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });
  await setParecer(page, EXPORT_RELATORIO_ID);
  await page.setViewportSize(WIDTHS[0]);
  const pill = dialog(page).locator('.row-wrap .status-pill');
  const note = dialog(page).locator('.row-wrap .t-meta');
  const ready = (number: number) => dialog(page).getByRole('heading', { level: 2, name: `Revisão ${number} pronta` });

  // Revision 1, marked as sent: Emitido.
  await footGenerate(page).click();
  await expect(idleReason(page)).toHaveText(IDLE_1);
  await generateButton(page).click();
  await expect(ready(1)).toBeVisible({ timeout: JOB_TIMEOUT });
  await dialog(page).getByRole('button', { name: MARK_SENT }).click();
  await expect(pill).toHaveText('Emitido');
  expect(await statusValues(page, EXPORT_RELATORIO_ID)).toEqual(['em_revisao', 'emitido']);

  // "Gerar de novo" with nothing edited: the server answers revision 1 (`unchanged`), which the
  // client already has. Emitido stays, no status op is written and nothing asks to be sent.
  await dialog(page).getByRole('button', { name: 'Gerar de novo' }).click();
  await expect(idleReason(page)).toHaveText(IDLE_1);
  await generateButton(page).click();
  await expect(ready(1)).toBeVisible({ timeout: 30_000 });
  await expect(dialog(page).locator('.revision-row')).toHaveCount(1);
  await expect(pill).toHaveText('Emitido');
  await expect(note).toHaveText('Enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 2.');
  await expect(dialog(page).getByRole('button', { name: MARK_SENT })).toHaveCount(0);
  expect(await statusValues(page, EXPORT_RELATORIO_ID)).toEqual(['em_revisao', 'emitido']);
  await escapeDialog(page, dialog(page));

  // Content the client does not have, with no status op: another device of this user edits
  // the relatório and this device pulls the edit. Its row still says Emitido.
  await syncNowAndReturn(page);
  await pushFromDevice(page, 'office-c', officeDraft(account, { relatorioId: EXPORT_RELATORIO_ID }, 'relatorio/setup/local', 'Sala elétrica C'));
  await syncNowAndReturn(page);
  await openSumario(page, EXPORT_RELATORIO_ID);
  await expect(headerPill(page)).toHaveText('Emitido');
  await expect(step(page)).toHaveText('Emitido: há alterações desde a revisão 1. Gerar cria a revisão 2.', { timeout: 30_000 });
  await expect(controle(page)).toContainText('Rev. 2 na próxima emissão');
  await expect(footMarkSent(page)).toHaveCount(0);
  expect(await statusValues(page, EXPORT_RELATORIO_ID)).toEqual(['em_revisao', 'emitido']);

  // "Gerar relatório" is queued (revision 2 will be built): the press writes Em revisão, and
  // the revision's arrival leaves it there. Nobody marked revision 2 as sent.
  await footGenerate(page).click();
  await expect(idleReason(page)).toHaveText(IDLE_2);
  await generateButton(page).click();
  await expect.poll(() => statusValues(page, EXPORT_RELATORIO_ID), { timeout: 30_000 }).toEqual(['em_revisao', 'emitido', 'em_revisao']);
  await expect(ready(2)).toBeVisible({ timeout: JOB_TIMEOUT });
  await expect(pill).toHaveText('Em revisão');
  await expect(note).toHaveText('Ainda não enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 3.');
  await expect(dialog(page).getByRole('button', { name: MARK_SENT })).toBeVisible();
  expect(await statusValues(page, EXPORT_RELATORIO_ID)).toEqual(['em_revisao', 'emitido', 'em_revisao']);
  await escapeDialog(page, dialog(page));

  // The Sumário says the same, and the action is offered in the bar: it issues revision 2.
  await expect(headerPill(page)).toHaveText('Em revisão');
  await expect(step(page)).toHaveText('Em revisão: a revisão 2 ainda não foi enviada ao cliente. Depois de enviar, use "Marcar como enviado ao cliente".');
  await expect(banner(page)).toContainText(/Revisão 2 gerada em \d{2}\/\d{2}, ainda não enviada ao cliente\./);
  await expect(controle(page)).toContainText('Rev. 2 gerada');
  await footMarkSent(page).click();
  await expect(headerPill(page)).toHaveText('Emitido');
  await expect(controle(page)).toContainText('Rev. 2 emitida');
  expect(await statusValues(page, EXPORT_RELATORIO_ID)).toEqual(['em_revisao', 'emitido', 'em_revisao', 'emitido']);
});
