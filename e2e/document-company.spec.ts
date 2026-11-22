import { documentControlRows, type EmpresaRow } from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { deviceSnapshot } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.1 (batch e27a, F1 of the 2026-11-21 pass): the document carries the company Cadastros shows. Driven
 * as a person does at 1280 px: Cadastros › Empresa takes the razão social, a CNPJ and the form revision (one
 * create and its puts in the outbox, one live row in the store); a relatório's Gerar dialog shows them in
 * "Controle do documento", row by row the kernel's over the device's rows; and the draft PDF ("Pré-visualizar",
 * rendered by the server from its own snapshot) prints the same name, CNPJ and revision. The draft goes through
 * the api's one queue and LibreOffice, so this spec runs in the `queue` lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const NAME = 'Empresa do Documento Ltda';
const CNPJ = '11.222.333/0001-81';
const REVISION = 'Revisão 07';

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}

const compact = (text: string) => text.replace(/\s+/g, '');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });

/** "Pré-visualizar" in the open Gerar dialog; the draft PDF's text, compacted. */
async function previewText(page: Page, context: BrowserContext): Promise<string> {
  const preview = dialog(page).locator('.generate-row').getByRole('button', { name: 'Pré-visualizar' });
  await expect(preview).toBeEnabled({ timeout: 30_000 });
  const tabPromise = context.waitForEvent('page');
  await preview.click();
  const tab = await tabPromise;
  const requested = await tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const pdf = await page.request.get(requested.url());
  expect(pdf.status()).toBe(200);
  await tab.close();
  return compact((await pdfTextItems(new Uint8Array(await pdf.body()))).join(' '));
}

test('@p0 27.1-E2E-001 a company with its empresa set in Cadastros: the Gerar dialog\'s document control and the draft PDF carry its name, CNPJ and form revision', async ({ page, context }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // Cadastros › Empresa, typed as a person does.
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Empresa' }).click();
  const form = page.locator('.empresa-form');
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.getByLabel('Razão social').fill(NAME);
  await form.getByLabel('CNPJ').fill(CNPJ);
  await form.getByLabel('Revisão do formulário').fill(REVISION);
  await form.getByLabel('Telefone').click();
  const empresaOps = async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path.startsWith('registry/empresa/'));
  await expect.poll(async () => (await empresaOps()).map((row) => row.path.split('/').pop())).toEqual(expect.arrayContaining(['cnpj', 'form_revision']));
  const creates = (await empresaOps()).filter((row) => row.kind === 'create');
  expect(creates).toHaveLength(1);
  const empresaId = (creates[0]!.value as EmpresaRow).id;
  const stored = async () =>
    (await readStore<{ entity: string; row: EmpresaRow }>(page, database, 'entities')).filter((record) => record.entity === 'registry' && record.row.kind === 'empresa' && record.row.removed_at === null).map((record) => record.row);
  await expect.poll(async () => (await stored()).map((row) => [row.id, row.name, row.cnpj, row.form_revision])).toEqual([[empresaId, NAME, CNPJ, REVISION]]);

  // A relatório: the Gerar dialog's "Controle do documento" is the kernel's over the device's rows.
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const control = dialog(page).locator('dl.doc-control');
  await expect(control).toBeVisible({ timeout: 30_000 });
  const snapshot = await deviceSnapshot(page, database, built.relatorioId);
  expect(snapshot.empresa?.id).toBe(empresaId);
  const expected = documentControlRows(snapshot, { revisionNumber: 0, issuedAt: new Date().toISOString(), art: snapshot.relatorio.setup.art_trt_number });
  const contratada = expected.find((row) => row.label === 'Contratada')!.value;
  const documento = expected.find((row) => row.label === 'Documento')!.value;
  expect(contratada).toBe(`${NAME} · CNPJ ${CNPJ}`);
  expect(documento).toBe(`Relatório Técnico de Cabine Primária · FO.SERV-03 · ${REVISION}`);
  await expect(control.locator('.dc-row').filter({ has: page.locator('dt', { hasText: /^Contratada$/ }) }).locator('dd')).toHaveText(contratada);
  await expect(control.locator('.dc-row').filter({ has: page.locator('dt', { hasText: /^Documento$/ }) }).locator('dd')).toHaveText(documento);

  // The draft PDF, from the server's snapshot: the same name, CNPJ and revision.
  const text = await previewText(page, context);
  expect(text, 'the PDF prints the razão social').toContain(compact(NAME));
  expect(text, 'the PDF prints the CNPJ').toContain(compact(CNPJ));
  expect(text, 'the PDF prints the form revision').toContain(compact(REVISION));
  expect(text, 'the PDF prints no other revision of the form').not.toContain(compact('FO.SERV-03 · Revisão 00'));
});
