import type { OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { resetEmpresaBWithFixture, type SmallFixtureCopy } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Stories 7.4 and 7.5 driven as a person would: the parecer set in Dados do relatório ›
 * Etapa 6, ~~the one blocking row on the Sumário and in the Export dialog with its way there
 * and back~~ (Story 22.6: the verdict is derived from the fichas, a stricter one chosen in
 * Etapa 6, and nothing blocks), the issued DOCX's section 10 (Story 22.6: Não apto with no
 * third bullet, an earlier typed summary as "Observações do responsável"), the RASCUNHO preview in a new tab, the next
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

async function openFixtureSumario(page: Page, fixture: SmallFixtureCopy): Promise<void> {
  await page.goto(`/relatorio/${fixture.relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });
}

test('@p0 7.4-E2E-001 22.6-E2E e22f a new relatório: nothing judged, so no verdict and "Parecer não preenchido" blocks; Etapa 6 checks no segment and shows no box, one tap is one op, the summary is the composed one (no Confirmar, Editar or Substituir), and the back link reopens the dialog unblocked', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);

  // ~~Story 22.6: 94 empty sheets, no point: the derived verdict is Apto, and no row blocks.~~
  // e22f S5: 94 empty sheets, none concluded, no point: nothing is judged, so there is no verdict
  // ("Apto" needs a judged sheet) and row 10 blocks, as before Story 22.6.
  const row10 = sumario(page).getByRole('listitem').nth(11);
  await expect(row10.locator('.sum-status.is-blocking')).toHaveText('Parecer não preenchido');
  // Status flow 2026-10-10 (M6, decision 5): the status's next step, under the status pill.
  // Story 14.3: this relatório is born on seed v4, so the sentence names the site checklist too.
  await expect(page.getByTestId('status-next-step')).toHaveText(/^Rascunho: falta .+ em Dados do relatório\. Preencher uma ficha ou as verificações do local passa o relatório a Em campo\.$/);
  await footButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}\\?exportar=1$`));
  await expect(dialog(page).locator('.precheck li.is-blocking .pc-block')).toHaveText('Parecer não preenchido');
  await expect(generateButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(generateButton(page)).toHaveAccessibleDescription('Preencha o parecer (linha 10 do sumário) para emitir a revisão 1. O rascunho pode ser visto antes.');
  // The document control summary, read-only: a dl whose revision row promises Rev. 1.
  await expect(dialog(page).locator('dl.doc-control dt').nth(1)).toHaveText('Revisão do documento');
  await expect(dialog(page).locator('dl.doc-control dd').nth(1)).toHaveText('Rev. 1');
  await expect(dialog(page).locator('.export-sec9-note')).toContainText('Seção 8 impressa no agrupamento do FO.SERV-03');
  await page.keyboard.press('Escape');

  // Etapa 6 opened from the dialog's way there (`?volta=exportar`), its heading focused.
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=6&volta=exportar`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });

  // e22f S5: no verdict: no segment checked, every verdict choosable (none looser), no reason line, no box yet.
  const group = page.getByRole('radiogroup', { name: 'Parecer' });
  for (const name of ['Apto', 'Apto com restrições', 'Não apto']) {
    await expect(group.getByRole('radio', { name, exact: true })).toBeEnabled();
    await expect(group.getByRole('radio', { name, exact: true })).toHaveAttribute('aria-checked', 'false');
  }
  await expect(group.getByRole('radio', { name: 'Apto', exact: true })).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#setup-parecer .conclusion-hint')).toHaveCount(0);
  const box = page.locator('.parecer-box');
  await expect(box).toHaveCount(0);
  // e22f S3: the note says the parecer follows from the fichas.
  await expect(page.locator('#setup-parecer .section-note').first()).toContainText('O parecer segue das fichas');

  // A stricter verdict: one tap, one op carrying the whole parecer.
  await group.getByRole('radio', { name: 'Apto com restrições', exact: true }).click();
  await expect(group.getByRole('radio', { name: 'Apto com restrições', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await outboxOps(page, 'relatorio/setup/parecer')).map((op) => op.value)).toEqual([
    { verdict: 'apto_com_restricoes', text: null, text_status: null, text_basis: null },
  ]);
  await expect(box).toHaveAttribute('data-verdict', 'restricoes');
  await expect(box.locator('.pb-verdict')).toHaveText('Apto com restrições');

  // The summary: the composed text with its Criteria line, read-only.
  const field = page.locator('.suggestion-field.is-generated');
  await expect(field.locator('.generated-text')).toHaveText(/^Foram registradas 94 fichas de ensaio: 94 ainda não concluídas\./);
  await expect(field.locator('.criteria-line')).toContainText('Critérios usados');
  await expect(field.locator('.criteria-line')).toContainText('94 fichas');
  await expect(field.getByRole('button')).toHaveCount(0);
  await expect(field.locator('textarea')).toHaveCount(0);

  // The back link reopens the dialog.
  await page.getByRole('button', { name: 'Voltar para Gerar relatório' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}\\?exportar=1$`));
  await expect(dialog(page)).toBeVisible();
  await expect(generateButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  await expect(dialog(page).locator('.generate-row .btn-reason')).toHaveText(IDLE_1);
  await page.keyboard.press('Escape');
  await expect(row10.locator('.sum-status')).toHaveText('Apto com restrições');
});

test('@p0 E78-Q1 7.5-E2E-006 22.6-E2E a relatório with no section block (the Porto Seguro fixture): row 10 is drawn with the derived verdict, and nothing blocks on the foot or in the dialog', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const fixture = await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page, fixture);

  // The eleven sections the document prints, as virtual rows: numbers as text, no Position box, no Overflow.
  const numbered = sumario(page).locator('li.sum-row[data-virtual]');
  await expect(numbered).toHaveCount(11);
  await expect(numbered.locator('.sum-pos')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  // The section rows' own Position box (`input.sum-pos`); the location rows of row 9's tree keep theirs (`.s9-pos`, Story 14.2).
  await expect(numbered.locator('input.sum-pos')).toHaveCount(0);
  // The rows' own controls (row 9's tree under it keeps its cabines' menus).
  await expect(numbered.locator(':scope > .sum-ctrls .overflow-trigger, :scope > .sum-s9-head > .sum-ctrls .overflow-trigger')).toHaveCount(0);
  const row10 = sumario(page).locator('li[data-row="section_10"]');
  await expect(row10.locator('.sum-title')).toHaveText('Conclusão e parecer');
  // The fixture's sheet marked Não ensaiado makes the derived verdict Apto com restrições.
  await expect(row10.locator('.sum-status')).toHaveText('Apto com restrições');
  await expect(row10.locator('.sum-status.is-blocking')).toHaveCount(0);
  const reason = page.locator('.sticky-action-bar .btn-reason').first();
  await expect(reason).toHaveText('Nada impede gerar.');
  await expect(page.getByTestId('status-next-step')).toHaveText('Em campo: gerar o relatório passa a Em revisão.');

  // The dialog: no blocking row, "Gerar relatório" enabled.
  await footButton(page).click();
  await expect(dialog(page).locator('.precheck li.is-blocking')).toHaveCount(0);
  await expect(generateButton(page)).toBeEnabled();
  await expect(generateButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();

  // Row 10 opens Dados do relatório › Etapa 6 (no block is needed for it), Apto disabled.
  await row10.getByRole('button').first().click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${fixture.relatorioId}/setup\\?etapa=6$`));
  const group = page.getByRole('radiogroup', { name: 'Parecer' });
  await expect(group.getByRole('radio', { name: 'Apto', exact: true })).toBeDisabled();
  await expect(group.getByRole('radio', { name: 'Apto com restrições', exact: true })).toHaveAttribute('aria-checked', 'true');
  // Fix batch e24h: the untested sheet is no point of attention any more (was "… e 1 ponto de atenção.").
  await expect(page.locator('#setup-parecer .conclusion-hint')).toHaveText('O relatório exige no mínimo Apto com restrições: 1 não ensaiada.');
});

test('@p0 22.6-E2E-001 a sheet effectively Reprovado: Etapa 6 is Não apto with the looser verdicts disabled, and the DOCX\'s section 10 prints Não apto, the summary naming the sheet, no third bullet, and the earlier typed summary as "Observações do responsável"', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const fixture = await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page, fixture);
  const envelope = { scope: 'relatorio' as const, company_id: account.companyId, project_id: null, relatorio_id: fixture.relatorioId, prev_op_id: null, batch_id: null, meta: null, actor_id: account.userId };
  // The chave concluded Reprovado; a summary typed before Story 22.6 (stored `edited`).
  await pushDrafts(page, database, [
    { ...envelope, kind: 'put', path: `sheet/${fixture.blockChaveId}/conclusion/result`, value: 'reprovado' },
    { ...envelope, kind: 'put', path: `sheet/${fixture.blockChaveId}/conclusion/restriction`, value: 'com_restricoes' },
    { ...envelope, kind: 'put', path: `sheet/${fixture.blockChaveId}/observations`, value: 'Contatos com desgaste acentuado.' },
    {
      ...envelope,
      kind: 'put',
      path: 'relatorio/setup/parecer',
      value: { verdict: 'apto', text: 'Resumo digitado antes pelo engenheiro.', text_status: 'edited', text_basis: 'x' } as never,
    },
  ]);

  await page.goto(`/relatorio/${fixture.relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  const group = page.getByRole('radiogroup', { name: 'Parecer' });
  await expect(group.getByRole('radio', { name: 'Não apto', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(group.getByRole('radio', { name: 'Apto', exact: true })).toBeDisabled();
  await expect(group.getByRole('radio', { name: 'Apto com restrições', exact: true })).toBeDisabled();
  await expect(page.locator('#setup-parecer .conclusion-hint')).toHaveText(/^O relatório exige no mínimo Não apto: 1 ficha reprovada \(.+\)\.$/);
  await expect(page.locator('.parecer-box .pb-verdict')).toHaveText('Não apto');
  const summary = page.locator('.suggestion-field.is-generated .generated-text');
  await expect(summary).toContainText(/1 ficha foi reprovada \(.+\)\./);
  // The earlier typed summary under "Observações do responsável", which can be cleared, never added.
  await expect(page.getByText('Observações do responsável', { exact: true })).toBeVisible();
  await expect(page.getByText('Resumo digitado antes pelo engenheiro.')).toBeVisible();

  // Issued: the DOCX's section 10.
  await page.goto(`/relatorio/${fixture.relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await expect(sumario(page).locator('li[data-row="section_10"] .sum-status')).toHaveText('Não apto');
  await footButton(page).click();
  await generateButton(page).click();
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await page.keyboard.press('Escape');
  const revisions = await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities');
  const revision = revisions.find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  const box = structure.tables.find((table) => table.length === 1 && table[0]!.length === 1 && table[0]![0]!.startsWith('Não apto\n'));
  expect(box).toBeDefined();
  expect(box![0]![0]).toMatch(/1 ficha foi reprovada \(.+\)\./);
  expect(box![0]![0]).toContain('Observações do responsável: Resumo digitado antes pelo engenheiro.');
  expect(structure.paragraphs.some((p) => p.startsWith('Apesar dos resultados dos testes serem positivos'))).toBe(false);
  const validity = structure.paragraphs.findIndex((p) => p.startsWith('Este relatório tem validade apenas acompanhada da'));
  expect(validity).toBeGreaterThan(2);
  // The two fixed bullets left before it.
  expect(structure.paragraphs.slice(validity - 2, validity).every((p) => p.length > 40)).toBe(true);

  // Back in Etapa 6, "Limpar" clears the typed summary (one op) and the box no longer prints it.
  await page.goto(`/relatorio/${fixture.relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  await expect.poll(async () => (await outboxOps(page, 'relatorio/setup/parecer')).at(-1)?.value).toEqual({ verdict: 'apto', text: null, text_status: null, text_basis: null });
  await expect(page.getByText('Observações do responsável', { exact: true })).toHaveCount(0);
});

test('@p0 7.4-E2E-002 with a parecer set, "Gerar relatório" issues revision 1: section 10 prints the box, the bullets, the validity line and the signature; the relatório is Em revisão until marked as sent, then Emitido', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const fixture = await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page, fixture);
  // Story 22.6: the fixture's untested sheet makes the derived verdict Apto com restrições, so Apto is disabled and the derived one prints.
  await setParecer(page, fixture.relatorioId, 'Apto');
  await expect(headerPill(page)).toHaveText('Em campo');
  await footButton(page).click();
  await expect(dialog(page).locator('.generate-row .btn-reason')).toHaveText(IDLE_1);
  await generateButton(page).click();
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  // Status flow 2026-10-10: the arrival leaves it Em revisão; "Marcar como enviado ao cliente" issues.
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Em revisão');
  await dialog(page).getByRole('button', { name: 'Marcar como enviado ao cliente' }).click();
  await expect(dialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await page.keyboard.press('Escape');
  await expect(headerPill(page)).toHaveText('Emitido');

  const revisions = await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities');
  const revision = revisions.find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  const box = structure.tables.find((table) => table.length === 1 && table[0]!.length === 1 && table[0]![0]!.startsWith('Apto com restrições\n'));
  expect(box).toBeDefined();
  // Story 22.6: the composed summary always prints in the box.
  expect(box![0]![0]).toContain('Foram registradas 3 fichas de ensaio');
  const validity = structure.paragraphs.findIndex((p) => p.startsWith('Este relatório tem validade apenas acompanhada da'));
  expect(validity).toBeGreaterThan(3);
  // The three fixed bullets before it, the signature after it.
  expect(structure.paragraphs.slice(validity - 3, validity).every((p) => p.length > 40)).toBe(true);
  expect(structure.paragraphs[validity + 1]).toBe(account.name);
});

test('@p0 7.5-E2E-001 "Pré-visualizar" opens preview.pdf in a new tab, reading "Gerando rascunho…" meanwhile; no status op, no revision', async ({ page, context }) => {
  test.setTimeout(240_000);
  const fixture = await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page, fixture);
  await footButton(page).click();
  // Story 22.6: nothing blocks issuing; previewing does not issue either.
  await expect(generateButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  const statusBefore = (await outboxOps(page, 'relatorio/status')).length;

  const tabPromise = context.waitForEvent('page');
  await previewButton(page).click();
  const tab = await tabPromise;
  // Headless Chrome has no PDF viewer: the tab's navigation to the PDF is what is observed.
  const requested = tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  // Review 2026-10-06: while the job runs the tab is not blank: it names the step and shows a bar.
  await expect(tab.getByRole('progressbar', { name: 'Gerando rascunho…' })).toBeVisible();
  await expect(tab.getByText('O PDF abre nesta aba quando ficar pronto. Pode levar até um minuto.')).toBeVisible();
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
  const fixture = await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page, fixture);
  // The fixture's chave prints no Placa (its config enables no optional sub-block), and a
  // disabled nameplate is not the last visit's plate: this visit turns it on before issuing.
  const chaveConfig = (fixture.log.find((op) => op.kind === 'create' && op.path === `block/${fixture.blockChaveId}`)!.value as { config: object }).config;
  await pushDrafts(page, database, [
    {
      scope: 'relatorio',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: fixture.relatorioId,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
      kind: 'put',
      path: `block/${fixture.blockChaveId}/config`,
      value: { ...chaveConfig, sub_blocks: { nameplate: { enabled: true } } } as never,
    },
  ]);
  await setParecer(page, fixture.relatorioId);
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
  const byPath = (path: string) => fixture.log.find((op) => op.kind === 'create' && op.path === path)!;
  const envelope = { scope: 'relatorio' as const, company_id: account.companyId, project_id: null, relatorio_id: r2, prev_op_id: null, batch_id: null, meta: null, actor_id: account.userId };
  const relatorio = byPath(`relatorio/${fixture.relatorioId}`).value as Record<string, unknown>;
  const location = byPath(`location/${fixture.cabineId}`).value as Record<string, unknown>;
  const chave = byPath(`block/${fixture.blockChaveId}`).value as Record<string, unknown>;
  // Stories 20.7 to 20.10 (contract 29): born Rascunho, then Em campo as the fixture's relatório is, through the table's own move.
  const drafts: OpDraft[] = [
    { ...envelope, kind: 'create', path: `relatorio/${r2}`, value: { ...relatorio, id: r2, status: 'rascunho', setup: { ...(relatorio.setup as object), responsible_user_id: account.userId } } as never },
    { ...envelope, kind: 'put', path: 'relatorio/status', value: 'em_campo' },
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
        equipment_id: fixture.equipmentChaveId,
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

test('@p1 7.5-E2E-003 R4: pressed and left for Home, the ready toast arrives there, once, and no issue op is written (2026-10-10)', async ({ page }) => {
  test.setTimeout(300_000);
  const fixture = await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openFixtureSumario(page, fixture);
  await setParecer(page, fixture.relatorioId);
  await footButton(page).click();
  await generateButton(page).click();
  await expect(dialog(page).locator('.gen-progress[role="status"]')).toContainText('Gerando revisão 1…', { timeout: 60_000 });
  await escapeDialog(page, dialog(page));
  // Leave through the app: Voltar to the obra, Voltar to Home.
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  // Status flow 2026-10-10: the arrival writes no status; the press's own `generate` op is the only one.
  await expect.poll(async () => (await outboxOps(page, 'relatorio/status')).map((op) => op.value)).toEqual(['em_revisao']);
  // A while later, still the one toast and no issue op.
  await page.waitForTimeout(4_000);
  expect((await outboxOps(page, 'relatorio/status')).map((op) => op.value)).toEqual(['em_revisao']);
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
  // F-03 (D1): the new relatório's sheets are empty, so the issue is confirmed first.
  await confirmIssue(dialog(page), /^Gerar com 94 fichas vazias/);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await escapeDialog(page, dialog(page));
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
  const fixture = await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixtureSumario(page, fixture);
  await footButton(page).click();
  await expect(dialog(page).locator('.precheck')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  for (const part of ['.precheck', 'dl.doc-control', '.generate-row']) {
    const box = (await dialog(page).locator(part).first().boundingBox())!;
    expect(box.x, part).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, part).toBeLessThanOrEqual(390);
  }
  // Phone: each document control value stacks under its key.
  const [dt, dd] = [dialog(page).locator('dl.doc-control dt').first(), dialog(page).locator('dl.doc-control dd').first()];
  expect((await dd.boundingBox())!.y).toBeGreaterThan((await dt.boundingBox())!.y);
  // Review fixes 2026-10-06 (F-17): a row's sentence takes the full row and its action drops under it.
  // Story 22.6: the blocking row that carried an action retired; the rows that still carry one keep the rule.
  const rowsWithActions = dialog(page).locator('.precheck li').filter({ has: page.locator('.pc-actions') });
  for (let i = 0; i < (await rowsWithActions.count()); i++) {
    const row = rowsWithActions.nth(i);
    const pcText = (await row.locator('.pc-text').boundingBox())!;
    const pcActions = (await row.locator('.pc-actions').boundingBox())!;
    expect(pcActions.y, `row ${i + 1}`).toBeGreaterThan(pcText.y);
    expect(pcActions.y, `row ${i + 1}`).toBeGreaterThanOrEqual(pcText.y + pcText.height - 1);
  }
});
