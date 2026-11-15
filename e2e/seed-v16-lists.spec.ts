import { getDefinition, screenLabel, type BlockRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 25.18-E2E-001 (Story 25.18, seed v16; Bruno's answer 11 to B-11, M22 and M21). On a v16 relatório from the
 * standard template, at 1024 px as a person taps it: the TC asks seven items, the seventh on its secondary with
 * Bruno's wording; it is answered Não conforme with a chip, which offers "Criar ponto de atenção", and one tap of
 * "Marcar os restantes como Conforme" answers the six others (the TC's tap count: NC, the chip, the bulk tap). The
 * TP asks the v15 list, without the item. The oil transformer shows the six hints under their labels and no
 * other. The DOCX prints the TC's seven rows, the seventh with its label and the NC, and the transformer's rows
 * with v15's labels and none of the hints. Every list and word is the kernel's. It issues a revision through the
 * api's one queue and LibreOffice, so it runs in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TC = getDefinition('v16', 'cabine_primaria', 'tc');
const TP_V15 = getDefinition('v15', 'cabine_primaria', 'tp');
const TRANSFORMER = getDefinition('v16', 'cabine_primaria', 'transformador_forca');
const TRANSFORMER_V15 = getDefinition('v15', 'cabine_primaria', 'transformador_forca');
const ITEM = 'secundario_fechado_ou_curto_circuitado';

const checklistRow = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const listedItems = (page: Page) => page.locator('#ficha-step-verificacoes li.checklist-row').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-key')));

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#ficha-step-verificacoes li.checklist-row').first()).toBeVisible();
}

test('@p0 25.18-E2E-001 at 1024: a v16 TC asks its secondary as item 7, answered NC with a chip; the TP keeps the v15 list; the transformer shows six hints; the DOCX prints seven TC rows and no hint', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const { relatorioId } = built;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, relatorioId)]);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  const sheetOf = (type: string) => built.sheets.find((sheet) => sheet.blockType === type)!;

  // --- the TC: seven items, the seventh Bruno's; NC with a chip, "Criar ponto de atenção", the rest in one tap ---
  const tc = sheetOf('tc');
  await openSheet(page, relatorioId, tc.blockId);
  const block = (await readStore<{ entity: string; id: string; row: BlockRow }>(page, database, 'entities')).find((record) => record.entity === 'block' && record.id === tc.blockId)!.row;
  expect(block.seed_version).toBe('v16');
  const items = TC.checklist!;
  expect(items).toHaveLength(7);
  expect(await listedItems(page)).toEqual(items.map((item) => item.key));
  const nc = items.findIndex((item) => item.key === ITEM);
  expect(nc).toBe(6);
  const ncItem = items[nc]!;
  expect(ncItem.label).toBe('SECUNDÁRIO FECHADO OU CURTO-CIRCUITADO NOS BORNES (NUNCA ABERTO); BORNES DE AFERIÇÃO EM BOM ESTADO');
  const radios = checklistRow(page, ITEM).getByRole('radiogroup', { name: `${nc + 1}. ${screenLabel(ncItem.label)}` });
  await expect(radios).toBeVisible();
  await radios.getByRole('radio', { name: 'Não conforme' }).click();
  const chips = checklistRow(page, ITEM).getByRole('group', { name: `Observações sugeridas do item ${nc + 1}` });
  for (const phrase of ncItem.nc_phrases) await expect(chips.getByRole('button', { name: phrase })).toBeVisible();
  const phrase = ncItem.nc_phrases[0]!;
  await chips.getByRole('button', { name: phrase }).click();
  await expect(checklistRow(page, ITEM).getByRole('button', { name: 'Criar ponto de atenção' })).toBeVisible();
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(page.getByTestId('toast')).toContainText('marcados Conforme');
  await expect(page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' }).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible();

  // --- the TP: the v15 list, without the item ---
  await openSheet(page, relatorioId, sheetOf('tp').blockId);
  expect(await listedItems(page)).toEqual(TP_V15.checklist!.map((item) => item.key));
  await expect(checklistRow(page, ITEM)).toHaveCount(0);

  // --- the transformer: the six hints under their labels, no other hint, the labels v15's ---
  await openSheet(page, relatorioId, sheetOf('transformador_forca').blockId);
  expect(await listedItems(page)).toEqual(TRANSFORMER_V15.checklist!.map((item) => item.key));
  const hinted = TRANSFORMER.checklist!.filter((item) => item.hint !== undefined);
  expect(hinted.map((item) => item.key).sort()).toEqual(['elemento_secante', 'juntas_vedacoes_e_vazamentos', 'oleo_isolante_indicador_de_nivel', 'rele_de_gas_funcionamento', 'termometro', 'valvula_de_alivio']);
  for (const item of hinted) await expect(checklistRow(page, item.key).locator('.row-hint'), item.key).toHaveText(screenLabel(item.hint!));
  await expect(page.locator('#ficha-step-verificacoes .row-hint')).toHaveCount(6);

  // --- the DOCX: the TC's seven rows with the NC on row 7; the transformer's labels with no hint ---
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
  const tcTable = checklists.find((table) => table.some((cells) => cells[4] === phrase))!;
  expect(tcTable, JSON.stringify(checklists.map((table) => table.length))).toBeDefined();
  expect(tcTable).toHaveLength(2 + 7);
  expect(tcTable.slice(2).map((cells) => cells[0])).toEqual(items.map((item, n) => `${n + 1}. ${item.label}`));
  expect(tcTable[2 + nc]).toEqual([`${nc + 1}. ${ncItem.label}`, '', 'X', '', phrase]);
  const transformerLabels = TRANSFORMER_V15.checklist!.map((item, n) => `${n + 1}. ${item.label}`);
  const transformerTables = checklists.filter((table) => table.length === 2 + transformerLabels.length && table[2]?.[0] === transformerLabels[0]);
  expect(transformerTables.length).toBeGreaterThan(0);
  for (const table of transformerTables) expect(table.slice(2).map((cells) => cells[0])).toEqual(transformerLabels);
  for (const item of hinted) expect(JSON.stringify(transformerTables), item.key).not.toContain(item.hint!);
  expect(JSON.stringify(structure)).not.toContain('SÍLICA GEL DO SECADOR');
  expect(JSON.stringify(structure)).not.toContain('RELÉ BUCHHOLZ');
});
