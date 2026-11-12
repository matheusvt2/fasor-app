import { getDefinition, screenLabel, type BlockRow, type FieldDef } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { openStep, outbox, outboxValues } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { typeRows } from './support/palette.ts';
import { pushLastNameplate } from './support/push-server-ops.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 24.10-E2E-001 (Story 24.10, seed v14; Bruno's question 18). On a v14 relatório, a TP and a TC added
 * from the field palette of the local Geradores, as a person adds them at 1024 px: the TP asks seven
 * items with "Íntegros e com especificação correta" under FUSÍVEIS, the TC six with no FUSÍVEIS. The TP
 * is all Conforme; the TC's ATERRAMENTO (its item 3) is NC with a chip and its conclusion confirmed. A
 * template TC whose equipment holds a plate of a v13 visit takes "Copiar da última visita": the plate's
 * fields are written and nothing of the checklist. The DOCX prints the TP's seven rows with FUSÍVEIS
 * as its label, the TC's six with the NC on row 3, and the conclusion's "item 3". Every list is the
 * kernel's. It issues a revision through the api's one queue and LibreOffice, so it runs in the serial
 * group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TP = getDefinition('v14', 'cabine_primaria', 'tp');
const TC = getDefinition('v14', 'cabine_primaria', 'tc');
const TC_V13 = getDefinition('v13', 'cabine_primaria', 'tc');
const LOCAL = 'Geradores';

const checklistRow = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const listedItems = (page: Page) => page.locator('#ficha-step-verificacoes li.checklist-row').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-key')));

/** A plate value of a v13 visit, by kind; a select takes its first option. */
function plateValue(field: FieldDef): unknown {
  if (field.kind === 'number') return { raw: '100', unit: field.unit ?? null, state: 'measured' };
  if (field.kind === 'date') return '2020-01-01';
  if (field.kind === 'select') return field.options![0];
  if (field.kind === 'voltage_class') return '15';
  if (field.kind === 'manufacturer') return 'Fabricante V13';
  return `V13-${field.key}`;
}

/** Adds one block of `type` from the field palette of the local and returns its id. */
async function addFromPalette(page: Page, type: string): Promise<string> {
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  const creates = async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string; location_id?: string }).block_type === type);
  const before = (await creates()).length;
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette.locator('.palette-where')).toHaveText(`Em: ${LOCAL}`);
  await typeRows(palette, [type]).click();
  await expect(palette).toBeHidden();
  await expect.poll(async () => (await creates()).length).toBe(before + 1);
  const block = (await creates()).at(-1)!.value as BlockRow;
  expect(block.seed_version).toBe('v14');
  return block.id;
}

test('@p0 24.10-E2E-001 at 1024: a v14 TP from the palette asks seven items with the FUSÍVEIS hint, a v14 TC six; a TC copied from a v13 visit takes the plate only; the DOCX prints seven and six rows and the conclusion\'s item 3', async ({ page }) => {
  test.setTimeout(480_000);
  // Pinned to v14 since seed v15 opened (Story 25.5): this walk asserts v14 sheets; v15 changes them story by story.
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account, { seedVersion: 'v14' });
  const { relatorioId } = built;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, relatorioId)]);
  // A template TC whose equipment holds the plate of a v13 visit.
  const templateTc = built.sheets.find((sheet) => sheet.blockType === 'tc')!;
  const tcEquipment = (built.drafts.find((draft) => draft.path === `block/${templateTc.blockId}`)!.value as { equipment_id: string }).equipment_id;
  const fields = Object.fromEntries(TC_V13.nameplate.filter((field) => field.key !== 'tag').map((field) => [field.key, plateValue(field)]));
  await pushLastNameplate(
    account.companyId,
    built.projectId,
    tcEquipment,
    { relatorio_id: newId(), revision_number: 1, issued_at: '2026-10-01T12:00:00.000Z', seed_version: 'v13', block_type: 'tc', fields: fields as never },
    account.userId,
  );
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);

  // --- the TP from the palette: seven items, the hint under FUSÍVEIS, all Conforme ---
  const tpId = await addFromPalette(page, 'tp');
  await page.goto(`/relatorio/${relatorioId}/ficha/${tpId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(TP.label, { timeout: 30_000 });
  expect(await listedItems(page)).toEqual(TP.checklist!.map((item) => item.key));
  expect(TP.checklist).toHaveLength(7);
  const fuses = TP.checklist!.find((item) => item.key === 'fusiveis')!;
  await expect(checklistRow(page, 'fusiveis').locator('.row-hint')).toHaveText(screenLabel(fuses.hint!));
  await expect(page.locator('#ficha-step-verificacoes .row-hint')).toHaveCount(1);
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(page.getByTestId('toast')).toContainText('marcados Conforme');

  // --- the TC from the palette: six items, no FUSÍVEIS; ATERRAMENTO (item 3) NC with a chip ---
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const tcId = await addFromPalette(page, 'tc');
  await page.goto(`/relatorio/${relatorioId}/ficha/${tcId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(TC.label, { timeout: 30_000 });
  const tcItems = TC.checklist!;
  expect(tcItems).toHaveLength(6);
  expect(await listedItems(page)).toEqual(tcItems.map((item) => item.key));
  await expect(checklistRow(page, 'fusiveis')).toHaveCount(0);
  const nc = tcItems.findIndex((item) => item.key === 'aterramento');
  expect(nc).toBe(2);
  const ncItem = tcItems[nc]!;
  await checklistRow(page, ncItem.key).getByRole('radiogroup', { name: `${nc + 1}. ${screenLabel(ncItem.label)}` }).getByRole('radio', { name: 'Não conforme' }).click();
  const phrase = ncItem.nc_phrases[0]!;
  await checklistRow(page, ncItem.key).getByRole('group', { name: `Observações sugeridas do item ${nc + 1}` }).getByRole('button', { name: phrase }).click();
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(page.getByTestId('toast')).toContainText('marcados Conforme');
  await openStep(page, relatorioId, tcId, 'Conclusão');
  const suggestion = page.getByRole('group', { name: 'Prévia da conclusão' });
  await expect(suggestion).toContainText('Aprovado · Com restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tcId}/conclusion/restriction`)).at(-1)).toBe('com_restricoes');
  await expect(page.locator('.ficha-conc-text')).toContainText(`(item ${nc + 1}, NC)`);
  // The suggested text confirmed, so the DOCX prints it.
  await page.locator('.ficha-conc-text').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tcId}/conclusion/text_status`)).at(-1)).toBe('confirmed');

  // --- the template TC: "Copiar da última visita" from the v13 plate writes the plate, nothing of the checklist ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${templateTc.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const lastVisit = page.getByRole('group', { name: 'Copiar dados de placa' }).getByRole('button', { name: `Copiar da última visita (${templateTc.tag})` });
  await expect(lastVisit).toBeVisible({ timeout: 30_000 });
  await lastVisit.click();
  await expect(page.getByTestId('toast')).toContainText('copiados');
  const written = (await outbox(database, page)).filter((op) => op.path.startsWith(`sheet/${templateTc.blockId}/`));
  expect(written.length).toBeGreaterThan(0);
  expect(written.every((op) => op.path.startsWith(`sheet/${templateTc.blockId}/nameplate/`))).toBe(true);
  expect(written.some((op) => op.path.includes('fusiveis'))).toBe(false);
  expect(await listedItems(page)).toEqual(tcItems.map((item) => item.key));

  // --- the DOCX: the TP's seven rows with FUSÍVEIS, the TC's six with the NC on row 3, "item 3" ---
  await setParecer(page, relatorioId, 'Apto com restrições');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  const checklists = structure.tables.filter((table) => table[0]?.[0] === 'VERIFICAÇÕES GERAIS');
  // The TC with the NC: six rows, ATERRAMENTO on row 3.
  const tcTable = checklists.find((table) => table.some((cells) => cells[4] === phrase))!;
  expect(tcTable).toHaveLength(2 + 6);
  expect(tcTable.slice(2).map((cells) => cells[0])).toEqual(tcItems.map((item, n) => `${n + 1}. ${item.label}`));
  expect(tcTable[2 + nc]).toEqual([`${nc + 1}. ${ncItem.label}`, '', 'X', '', phrase]);
  // The TP all Conforme: seven rows, FUSÍVEIS its row 3, every row marked C.
  const tpTable = checklists.find((table) => table.length === 2 + 7 && table[2]?.[0] === `1. ${TP.checklist![0]!.label}` && table.slice(2).every((cells) => cells[1] === 'X'))!;
  expect(tpTable, JSON.stringify(checklists.map((table) => table.length))).toBeDefined();
  expect(tpTable[4]![0]).toBe('3. FUSÍVEIS');
  expect(JSON.stringify(structure)).not.toContain(fuses.hint!);
  // The TC's conclusion names its item 3.
  expect(JSON.stringify(structure.tables)).toContain(`${phrase} (item ${nc + 1}, NC)`);
  // No v14 TC prints FUSÍVEIS: every TC-list table of six rows lacks it.
  for (const table of checklists.filter((one) => one.length === 2 + 6 && one[2]?.[0] === `1. ${tcItems[0]!.label}`)) expect(table.some((cells) => cells[0]!.includes('FUSÍVEIS'))).toBe(false);
});
