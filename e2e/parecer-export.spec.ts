import type { OpDraft } from '@app/domain';
import { BLOCK_CHAVE_ID, CABINE_ID, EQUIPMENT_CHAVE_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Stories 7.4 and 7.5 driven as a person would: the parecer set in Dados do relatório ›
 * Etapa 6, the one blocking row on the Sumário and in the Export dialog with its way there
 * and back, the issued DOCX's section 10, the RASCUNHO preview in a new tab, the next
 * visit's "Copiar da última visita", the ready toast off the Sumário (R4), "Restaurar" cut at
 * the last revision (Epic 4 item 29) and the dialog at phone width. The jobs run for real in
 * the api container (LibreOffice), so the timeouts are the job's.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
/** The primary: "Gerar relatório", or "Gerando…" while it sends and the job runs. */
const generateButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const previewButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: /^(Pré-visualizar|Gerando rascunho…)$/ });
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const IDLE_1 = 'Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.';

interface OutboxOp {
  path: string;
  value: unknown;
}
const outboxOps = async (page: Page, path: string | RegExp) =>
  (await readStore<OutboxOp>(page, database, 'outbox')).filter((op) => (typeof path === 'string' ? op.path === path : path.test(op.path)));

async function openFixtureSumario(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });
}

test('@p0 7.4-E2E-001 a relatório with no parecer: row 10 and the dialog say "Parecer não preenchido"; the band sets it (one op), the summary is confirmed and edited, and the back link reopens the dialog, released', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);

  // AC2: row 10 in red, the foot names it; the foot's button still opens the dialog.
  const row10 = sumario(page).getByRole('listitem').nth(11);
  await expect(row10.locator('.sum-status.is-blocking')).toHaveText('Parecer não preenchido');
  await expect(page.locator('.sticky-action-bar .btn-reason').first()).toHaveText('Só Conclusão e parecer (linha 10) impede gerar. O resto está escrito em cada linha.');
  await footButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}\\?exportar=1$`));
  const blocking = dialog(page).locator('.precheck li.is-blocking');
  await expect(blocking.locator('.pc-block')).toHaveText('Parecer não preenchido');
  await expect(generateButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(generateButton(page)).toHaveAccessibleDescription('Preencha o parecer (linha 10 do sumário) para emitir a revisão 1. O rascunho pode ser visto antes.');
  // The document control summary, read-only: a dl whose revision row promises Rev. 1.
  await expect(dialog(page).locator('dl.doc-control dt').nth(1)).toHaveText('Revisão do documento');
  await expect(dialog(page).locator('dl.doc-control dd').nth(1)).toHaveText('Rev. 1');
  await expect(dialog(page).locator('.export-sec9-note')).toContainText('Seção 9 impressa no agrupamento do FO.SERV-03');

  // "Editar em Dados do relatório" opens Etapa 6, its heading focused.
  await blocking.getByRole('button', { name: 'Editar em Dados do relatório' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=6&volta=exportar$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused();

  // AC1: one tap, one op carrying the whole parecer; nothing preselected before.
  const group = page.getByRole('radiogroup', { name: 'Parecer' });
  for (const name of ['Apto', 'Apto com restrições', 'Não apto']) await expect(group.getByRole('radio', { name, exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.parecer-box')).toHaveCount(0);
  await group.getByRole('radio', { name: 'Apto com restrições', exact: true }).click();
  await expect(group.getByRole('radio', { name: 'Apto com restrições', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await outboxOps(page, 'relatorio/setup/parecer')).map((op) => op.value)).toEqual([
    { verdict: 'apto_com_restricoes', text: null, text_status: null, text_basis: null },
  ]);
  const box = page.locator('.parecer-box');
  await expect(box).toHaveAttribute('data-verdict', 'restricoes');
  await expect(box.locator('.pb-verdict')).toHaveText('Apto com restrições');

  // The composed summary with its Criteria line, then Confirmar.
  const field = page.locator('.suggestion-field.is-generated');
  await expect(field).toHaveAttribute('data-state', 'suggested');
  await expect(field.locator('.generated-text')).toHaveText(/^Foram registradas 94 fichas de ensaio: 94 ainda não concluídas\./);
  await expect(field.locator('.criteria-line')).toContainText('Critérios usados');
  await expect(field.locator('.criteria-line')).toContainText('94 fichas');
  await field.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Resumo do parecer confirmado — impresso na seção 10')).toBeVisible();
  await expect(field).toHaveAttribute('data-state', 'confirmed');
  await expect.poll(async () => (await outboxOps(page, 'relatorio/setup/parecer')).map((op) => (op.value as { text_status: string | null }).text_status)).toEqual([null, 'confirmed']);

  // Editar: the text is the engineer's own, stored as edited.
  await field.getByRole('button', { name: 'Editar' }).click();
  const area = field.getByRole('textbox', { name: 'Resumo do parecer' });
  await expect(area).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ver seção 8.');
  await page.keyboard.press('Tab');
  await expect
    .poll(async () => (await outboxOps(page, 'relatorio/setup/parecer')).at(-1)?.value)
    .toMatchObject({ verdict: 'apto_com_restricoes', text_status: 'edited', text: expect.stringMatching(/ Ver seção 8\.$/) });

  // The back link reopens the dialog, released.
  await page.getByRole('button', { name: 'Voltar para Gerar relatório' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}\\?exportar=1$`));
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.precheck li.is-blocking')).toHaveCount(0);
  await expect(generateButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  await expect(dialog(page).locator('.generate-row .btn-reason')).toHaveText(IDLE_1);
  // "Ver no sumário" closes the dialog and marks the rows its warnings stand on.
  await dialog(page).getByRole('button', { name: 'Ver no sumário' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(sumario(page).locator('.sum-row.is-highlighted').first()).toBeVisible();
  await expect(row10.locator('.sum-status')).toHaveText('Apto com restrições');
});

test('@p0 E78-Q1 7.5-E2E-006 a relatório with no section block (the Porto Seguro fixture): row 10 is drawn and blocks, the foot and the dialog both say "linha 10"; with the parecer set nothing blocks', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);

  // The eleven sections the document prints, as virtual rows: numbers as text, no Position box, no Overflow.
  const numbered = sumario(page).locator('li.sum-row[data-virtual]');
  await expect(numbered).toHaveCount(11);
  await expect(numbered.locator('.sum-pos')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  await expect(numbered.locator('input')).toHaveCount(0);
  // The rows' own controls (row 9's tree under it keeps its cabines' menus).
  await expect(numbered.locator(':scope > .sum-ctrls .overflow-trigger, :scope > .sum-s9-head > .sum-ctrls .overflow-trigger')).toHaveCount(0);
  const row10 = sumario(page).locator('li[data-row="section_10"]');
  await expect(row10.locator('.sum-title')).toHaveText('Conclusão e parecer');
  await expect(row10.locator('.sum-status.is-blocking')).toHaveText('Parecer não preenchido');
  const reason = page.locator('.sticky-action-bar .btn-reason').first();
  await expect(reason).toHaveText('Só Conclusão e parecer (linha 10) impede gerar. O resto está escrito em cada linha.');

  // The dialog: the same blocking row and the same line.
  await footButton(page).click();
  await expect(dialog(page).locator('.precheck li.is-blocking .pc-block')).toHaveText('Parecer não preenchido');
  await expect(generateButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(generateButton(page)).toHaveAccessibleDescription('Preencha o parecer (linha 10 do sumário) para emitir a revisão 1. O rascunho pode ser visto antes.');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();

  // Row 10 opens Dados do relatório › Etapa 6 (no block is needed for it).
  await row10.getByRole('button').first().click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${EXPORT_RELATORIO_ID}/setup\\?etapa=6$`));

  // With the parecer set: nothing blocks, on either surface.
  await setParecer(page, EXPORT_RELATORIO_ID, 'Apto com restrições');
  await expect(row10.locator('.sum-status')).toHaveText('Apto com restrições');
  await expect(row10.locator('.sum-status.is-blocking')).toHaveCount(0);
  await expect(reason).toHaveText('Nada impede gerar.');
  await footButton(page).click();
  await expect(dialog(page).locator('.precheck li.is-blocking')).toHaveCount(0);
  await expect(generateButton(page)).toBeEnabled();
  await expect(generateButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
});

test('@p0 7.4-E2E-002 with a parecer set, "Gerar relatório" issues revision 1: section 10 prints the box, the bullets, the validity line and the signature, and the relatório is Emitido', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await setParecer(page, EXPORT_RELATORIO_ID, 'Apto');
  await expect(headerPill(page)).toHaveText('Em campo');
  await footButton(page).click();
  await expect(dialog(page).locator('.generate-row .btn-reason')).toHaveText(IDLE_1);
  await generateButton(page).click();
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await page.keyboard.press('Escape');
  await expect(headerPill(page)).toHaveText('Emitido');

  const revisions = await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities');
  const revision = revisions.find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  expect(structure.tables).toContainEqual([['Apto']]);
  const validity = structure.paragraphs.findIndex((p) => p.startsWith('Este relatório tem validade apenas acompanhada da'));
  expect(validity).toBeGreaterThan(3);
  // The three fixed bullets before it, the signature after it.
  expect(structure.paragraphs.slice(validity - 3, validity).every((p) => p.length > 40)).toBe(true);
  expect(structure.paragraphs[validity + 1]).toBe(account.name);
});

test('@p0 7.5-E2E-001 "Pré-visualizar" opens preview.pdf in a new tab, reading "Gerando rascunho…" meanwhile; no status op, no revision', async ({ page, context }) => {
  test.setTimeout(240_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await footButton(page).click();
  // No parecer: issuing is blocked, previewing is not.
  await expect(generateButton(page)).toHaveAttribute('aria-disabled', 'true');
  const statusBefore = (await outboxOps(page, 'relatorio/status')).length;

  const tabPromise = context.waitForEvent('page');
  await previewButton(page).click();
  const tab = await tabPromise;
  // Headless Chrome has no PDF viewer: the tab's navigation to the PDF is what is observed.
  const requested = tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  await expect(previewButton(page)).toHaveText('Gerando rascunho…');
  const url = (await requested).url();
  await expect(previewButton(page)).toHaveText('Pré-visualizar');
  const pdf = await page.request.get(url);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 4).toString('latin1')).toBe('%PDF');
  await tab.close();

  // Nothing changed: no status op, no revision, the same pill.
  expect((await outboxOps(page, 'relatorio/status')).length).toBe(statusBefore);
  await expect(dialog(page).getByText('Nenhuma revisão gerada ainda.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(headerPill(page)).toHaveText('Em campo');
});

test('@p0 7.5-E2E-002 E5-Q18b: after revision 1 of project P, a second relatório of P opens the same equipment\'s empty sheet with "Copiar da última visita (TAG)", and a tap writes its plate', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  // The fixture's chave prints no Placa (its config enables no optional sub-block), and a
  // disabled nameplate is not the last visit's plate: this visit turns it on before issuing.
  const chaveConfig = (portoSeguroSmall.log.find((op) => op.kind === 'create' && op.path === `block/${BLOCK_CHAVE_ID}`)!.value as { config: object }).config;
  await pushDrafts(page, database, [
    {
      scope: 'relatorio',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: EXPORT_RELATORIO_ID,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
      kind: 'put',
      path: `block/${BLOCK_CHAVE_ID}/config`,
      value: { ...chaveConfig, sub_blocks: { nameplate: { enabled: true } } } as never,
    },
  ]);
  await setParecer(page, EXPORT_RELATORIO_ID);
  await footButton(page).click();
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await generateButton(page).click();
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await page.keyboard.press('Escape');

  // A second relatório of the same obra, born on the office device: its one cabine and the
  // chave sheet bound to the same equipment row, the plate empty.
  const r2 = newId();
  const cabine = newId();
  const block = newId();
  const byPath = (path: string) => portoSeguroSmall.log.find((op) => op.kind === 'create' && op.path === path)!;
  const envelope = { scope: 'relatorio' as const, company_id: account.companyId, project_id: null, relatorio_id: r2, prev_op_id: null, batch_id: null, meta: null, actor_id: account.userId };
  const relatorio = byPath(`relatorio/${EXPORT_RELATORIO_ID}`).value as Record<string, unknown>;
  const location = byPath(`location/${CABINE_ID}`).value as Record<string, unknown>;
  const chave = byPath(`block/${BLOCK_CHAVE_ID}`).value as Record<string, unknown>;
  const drafts: OpDraft[] = [
    { ...envelope, kind: 'create', path: `relatorio/${r2}`, value: { ...relatorio, id: r2, setup: { ...(relatorio.setup as object), responsible_user_id: account.userId } } as never },
    { ...envelope, kind: 'create', path: `location/${cabine}`, value: { ...location, id: cabine, relatorio_id: r2 } as never },
    {
      ...envelope,
      kind: 'create',
      path: `block/${block}`,
      value: {
        ...chave,
        id: block,
        relatorio_id: r2,
        location_id: cabine,
        equipment_id: EQUIPMENT_CHAVE_ID,
        // This visit's sheet shows its Placa (the fixture's own config enables no optional sub-block).
        config: { ...(chave.config as object), sub_blocks: { nameplate: { enabled: true } } },
      } as never,
    },
  ];
  await pushDrafts(page, database, drafts);

  await page.goto(`/relatorio/${r2}/ficha/${block}`);
  const copy = page.getByRole('button', { name: /^Copiar da última visita \(.+\)$/ });
  await expect(copy).toBeVisible({ timeout: 30_000 });
  await copy.click();
  await expect.poll(async () => (await outboxOps(page, new RegExp(`^sheet/${block}/nameplate/`))).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /^Copiar da última visita/ })).toHaveCount(0);
});

test('@p1 7.5-E2E-003 R4: pressed and left for Home, the ready toast and the issue op arrive there, once', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page);
  await setParecer(page, EXPORT_RELATORIO_ID);
  await footButton(page).click();
  await generateButton(page).click();
  await expect(dialog(page).locator('.gen-progress[role="status"]')).toContainText('Gerando revisão 1…', { timeout: 60_000 });
  await page.keyboard.press('Escape');
  // Leave through the app: Voltar to the obra, Voltar to Home.
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await expect.poll(async () => (await outboxOps(page, 'relatorio/status')).map((op) => op.value)).toEqual(['em_revisao', 'emitido']);
  // A while later, still once.
  await page.waitForTimeout(4_000);
  expect((await outboxOps(page, 'relatorio/status')).map((op) => op.value)).toEqual(['em_revisao', 'emitido']);
});

test('@p1 7.5-E2E-004 Epic 4 item 29: "Restaurar" lists only the block removed after the last revision', async ({ page }) => {
  test.setTimeout(360_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  // Removed before revision 1: "2 Definições".
  await page.getByRole('button', { name: 'Mais opções de Definições' }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  await expect(page.getByText('Seção removida deste relatório — numeração refeita')).toBeVisible();
  await setParecer(page, relatorioId);
  await footButton(page).click();
  await generateButton(page).click();
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await page.keyboard.press('Escape');
  // Removed after it: "Requisitos básicos".
  await page.getByRole('button', { name: 'Mais opções de Requisitos básicos' }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  await expect(page.getByText('Seção removida deste relatório — numeração refeita').last()).toBeVisible();
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: 'Restaurar ficha removida' }).click();
  const restore = page.getByRole('dialog', { name: 'Restaurar ficha removida' });
  await expect(restore.getByRole('button', { name: /^Restaurar / })).toHaveCount(1);
  await expect(restore.getByRole('button', { name: 'Restaurar 4 Requisitos básicos' })).toBeVisible();
});

test('@p1 7.5-E2E-005 the Export dialog at 390 px: the precheck, the document control and the generate row fit without sideways scroll', async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixtureSumario(page);
  await footButton(page).click();
  await expect(dialog(page).locator('.precheck li.is-blocking')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  for (const part of ['.precheck', 'dl.doc-control', '.generate-row']) {
    const box = (await dialog(page).locator(part).first().boundingBox())!;
    expect(box.x, part).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, part).toBeLessThanOrEqual(390);
  }
  // Phone: each document control value stacks under its key.
  const [dt, dd] = [dialog(page).locator('dl.doc-control dt').first(), dialog(page).locator('dl.doc-control dd').first()];
  expect((await dd.boundingBox())!.y).toBeGreaterThan((await dt.boundingBox())!.y);
});
