import { exportPrecheck, pointMissingFields, pointMissingText, preIssue, type PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceSnapshot } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { typeDate } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.4 (batch e27a, F8 and F12 of the 2026-11-21 pass), driven as a person does at 1280 px. A point of
 * attention saved bare (its text only) says on its card, in amber, what the action plan lacks ("Falta: ação,
 * prazo, prioridade, responsável"), with no dashes; the Gerar dialog names the four rows one by one, counts the
 * rest as "e mais N avisos nas linhas do sumário", and "Gerar relatório" stays enabled. Then the action, the
 * deadline, the priority and the owner are filled one at a time in the editor, each committed (its outbox op),
 * the line losing a word each time, and the dialog's rows are gone. Every expected word is the kernel's over the
 * device's own rows (E12-A6). Nothing is issued.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}

const cards = (page: Page) => page.locator('.poa-list > .point-of-attention-card:not(.is-auto):not(.is-editing)');
const missingLine = (scope: Locator) => scope.locator('.helper[data-tone="amber"][data-missing]');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const pointOps = async (page: Page) => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path.startsWith('point/'));
const storedPoint = async (page: Page, id: string) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).find((record) => record.entity === 'point' && record.row.id === id)?.row ?? null;
const ROWS = ['1 ponto sem ação', '1 ponto sem prazo', '1 ponto sem prioridade', '1 ponto sem responsável'];

/** The Gerar dialog's named rows and its count line, then closed. */
async function readDialog(page: Page, relatorioId: string): Promise<{ named: string[]; count: string | null }> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog(page).locator('ul.precheck')).toBeVisible();
  // Nothing about the points blocks: "Gerar relatório" stays enabled.
  await expect(dialog(page).getByRole('button', { name: 'Gerar relatório', exact: true })).toBeEnabled();
  const named = await dialog(page).locator('ul.precheck > li:not(.is-blocking) .pc-text').allTextContents();
  const countLine = dialog(page).locator('ul.precheck > li').filter({ has: page.getByRole('button', { name: 'Ver no sumário' }) }).locator('.pc-text');
  const count = (await countLine.count()) === 0 ? null : await countLine.textContent();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  return { named, count };
}

/** The kernel's count line over the device's rows: "e mais 7 avisos nas linhas do sumário; nenhum impede gerar.". */
async function kernelCount(page: Page, relatorioId: string): Promise<string> {
  const precheck = exportPrecheck(preIssue(await deviceSnapshot(page, database, relatorioId), undefined, { now: new Date() }));
  return `${precheck.countText}${precheck.countMetaText}`;
}

test('@p0 27.4-E2E-001 a point saved bare: its card says "Falta: …" in amber, the Gerar dialog names the four rows and counts the rest, Gerar stays enabled; filled one field at a time, the line loses a word each time and the rows go', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);

  // A point saved with its text only: saving is allowed.
  await page.goto(`/relatorio/${built.relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  let editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  await expect(editor.getByRole('textbox', { name: 'Texto' })).toBeFocused();
  await page.keyboard.type('Plaquetas de identificação ausentes.');
  await expect(missingLine(editor)).toHaveText('Falta: ação, prazo, prioridade, responsável');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
  const created = (await pointOps(page)).find((op) => op.kind === 'create')!;
  const pointId = (created.value as PointRow).id;
  await expect.poll(async () => (await storedPoint(page, pointId))?.text).toBe('Plaquetas de identificação ausentes.');
  const bare = (await storedPoint(page, pointId))!;
  expect(bare).toMatchObject({ action: null, deadline: null, priority: null, owner: null });

  // The card: the kernel's line in amber, and no dash for a missing field.
  const card = cards(page).first();
  await expect(missingLine(card)).toHaveText(pointMissingText(pointMissingFields(bare))!);
  await expect(missingLine(card)).toHaveText('Falta: ação, prazo, prioridade, responsável');
  await expect(card.locator('.poa-fields')).toHaveCount(0);
  await expect(card).not.toContainText('—');

  // The Gerar dialog: the four rows named one by one, the rest counted after them.
  const before = await readDialog(page, built.relatorioId);
  for (const row of ROWS) expect(before.named).toContain(row);
  expect(before.count).toBe(await kernelCount(page, built.relatorioId));
  expect(before.count).toMatch(/^e mais \d+ avisos? nas? linhas? do sumário; (nenhum|não) impede gerar\.$/);

  // The fields, one at a time, each committed before the next.
  await page.goto(`/relatorio/${built.relatorioId}/pontos`);
  await expect(cards(page)).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Editar o ponto 1, Geral' }).click();
  editor = page.getByRole('article', { name: 'Ponto de atenção 1 em edição' });
  await expect(missingLine(editor)).toHaveText('Falta: ação, prazo, prioridade, responsável');

  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill('Instalar plaquetas');
  await expect(missingLine(editor)).toHaveText('Falta: prazo, prioridade, responsável');
  await editor.getByRole('textbox', { name: 'Responsável' }).click();
  await expect.poll(async () => (await pointOps(page)).filter((op) => op.path === `point/${pointId}/action`).map((op) => op.value)).toEqual(['Instalar plaquetas']);

  await typeDate(editor, 'Prazo', '15032031');
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).click();
  await expect.poll(async () => (await pointOps(page)).filter((op) => op.path === `point/${pointId}/deadline`).map((op) => op.value)).toEqual(['2031-03-15']);
  await expect(missingLine(editor)).toHaveText('Falta: prioridade, responsável');

  await editor.getByRole('radiogroup', { name: 'Prioridade' }).getByRole('radio', { name: 'P3, Longo prazo, 180 dias', exact: true }).click();
  await expect.poll(async () => (await pointOps(page)).filter((op) => op.path === `point/${pointId}/priority`).map((op) => op.value)).toEqual(['P3']);
  await expect(missingLine(editor)).toHaveText('Falta: responsável');

  await editor.getByRole('textbox', { name: 'Responsável' }).fill('Manutenção predial');
  await expect(missingLine(editor)).toHaveCount(0);
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).click();
  await expect.poll(async () => (await pointOps(page)).filter((op) => op.path === `point/${pointId}/owner`).map((op) => op.value)).toEqual(['Manutenção predial']);
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);

  const filled = (await storedPoint(page, pointId))!;
  expect(filled).toMatchObject({ action: 'Instalar plaquetas', deadline: '2031-03-15', priority: 'P3', owner: 'Manutenção predial' });
  expect(pointMissingFields(filled)).toEqual([]);
  await expect(missingLine(cards(page).first())).toHaveCount(0);
  await expect(cards(page).first().locator('.poa-fields')).toContainText('Manutenção predial');

  // The dialog: none of the four rows any more, the count still the kernel's.
  const after = await readDialog(page, built.relatorioId);
  for (const row of ROWS) expect(after.named).not.toContain(row);
  expect(after.count).toBe(await kernelCount(page, built.relatorioId));
});
