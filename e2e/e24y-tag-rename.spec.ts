import { composeConclusion, getDefinition, tagRenamedText, tagTakenText, visitContextOf, type BlockRow, type EquipmentRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceSnapshot, outbox, plateField, setUpRelatorio, sheetTitle } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { section9Chevron } from './support/tree.ts';

/*
 * Fix batch e24y (P2 and P3 of the hands-on pass of 2026-11-11), on a v14 Disjuntor MT the office
 * concluded (its pair and the suggested text confirmed, as "Concluir ficha" stores them):
 * - P2: "Renomear TAG" from the sheet's menu writes, in the rename's batch, the conclusion text composed
 *   with the new TAG and its basis; the sheet offers no "Substituir"; the issued DOCX prints the
 *   paragraph naming the new TAG.
 * - P3: the plate's TAG field, typed and left, renames the equipment the same way (the title, the tree,
 *   the stored row, the plate cell, the text); idle typing writes nothing; a TAG another equipment holds
 *   is refused with the rename's reason and the field shows the TAG again; the equipment keeps its row
 *   and its `reuse_key`, which carry its history (Story 24.21, proven through a rename in
 *   `equipment-history.spec.ts`).
 * It issues a revision through the api's one queue and LibreOffice, so the file runs in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface EntityRecord {
  entity: string;
  id: string;
  row: Record<string, unknown>;
}

const entities = (page: Page) => readStore<EntityRecord>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const conclusion = (page: Page) => page.locator('#ficha-conc');

/** The text and basis "Concluir ficha" would confirm on the sheet as the device holds it now (pair Aprovado · Sem restrições). */
async function confirmedConclusion(page: Page, relatorioId: string, blockId: string): Promise<{ text: string; basis: string; tag: string; equipmentId: string }> {
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  const block: BlockRow = structuredClone(snapshot.blocks.find((row) => row.id === blockId)!);
  const op = (value: string) => ({ value, source_suggestion_id: null, op_id: '019a6400-24f9-7e2e-8000-000000000001' });
  block.sheet.conclusion = { result: op('aprovado'), restriction: op('sem_restricoes') };
  const equipment = snapshot.equipment.find((row) => row.id === block.equipment_id)!;
  const composed = composeConclusion(block, getDefinition(block.seed_version, 'cabine_primaria', block.block_type), equipment.tag, visitContextOf(snapshot, block));
  return { text: composed.text, basis: composed.basis, tag: equipment.tag, equipmentId: equipment.id };
}

/** The ops of the batch holding the TAG put `tag` of `equipmentId`, as [path, value]. */
async function renameBatch(page: Page, equipmentId: string, tag: string): Promise<[string, unknown][]> {
  const rows = await readStore<{ path: string; value: unknown; batch_id: string | null }>(page, database, 'outbox');
  const put = rows.find((row) => row.path === `equipment/${equipmentId}/tag` && row.value === tag);
  if (put === undefined) return [];
  return rows.filter((row) => row.batch_id === put.batch_id).map((row) => [row.path, row.value]);
}

test('@p0 e24y-E2E-001 a concluded v14 Disjuntor MT renamed from its menu and from its plate\'s TAG field carries its confirmed text to each new TAG; a taken TAG is refused; the DOCX prints the paragraph naming the last one', async ({ page }) => {
  test.setTimeout(480_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const dj = sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const other = sheets.find((sheet) => sheet.blockType === 'chave_seccionadora')!;

  // The office concludes the sheet: the pair and the suggested text confirmed with its basis.
  const before = await confirmedConclusion(page, relatorioId, dj.blockId);
  expect(before.text).toContain(dj.tag);
  const scope = { relatorioId };
  await pushDrafts(page, database, [
    officeDraft(account, scope, `sheet/${dj.blockId}/conclusion/result`, 'aprovado'),
    officeDraft(account, scope, `sheet/${dj.blockId}/conclusion/restriction`, 'sem_restricoes'),
    officeDraft(account, scope, `sheet/${dj.blockId}/conclusion/text`, before.text),
    officeDraft(account, scope, `sheet/${dj.blockId}/conclusion/text_status`, 'confirmed'),
    officeDraft(account, scope, `sheet/${dj.blockId}/conclusion/text_basis`, before.basis),
  ]);
  const keyBefore = (await entities(page)).find((record) => record.entity === 'equipment' && record.id === before.equipmentId)!.row.reuse_key ?? null;

  // --- P2: "Renomear TAG" from the sheet's menu ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${dj.blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: `Mais opções da ficha ${dj.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Renomear TAG' }).click();
  const dialog = page.getByRole('dialog', { name: `Renomear TAG ${dj.tag}` });
  await dialog.getByRole('textbox', { name: 'TAG' }).fill('QM8');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toast(page)).toContainText(tagRenamedText('QM8'));
  await expect(page.getByRole('button', { name: 'Mais opções da ficha QM8' })).toBeVisible();
  const first = await renameBatch(page, before.equipmentId, 'QM8');
  const textAfterMenu = first.find(([path]) => path === `sheet/${dj.blockId}/conclusion/text`)?.[1];
  expect(textAfterMenu).toBe(before.text.replace(dj.tag, 'QM8'));
  expect(first.map(([path]) => path)).toEqual([`equipment/${before.equipmentId}/tag`, `sheet/${dj.blockId}/conclusion/text`, `sheet/${dj.blockId}/conclusion/text_basis`]);
  await expect(conclusion(page).getByRole('button', { name: /Substituir/ })).toHaveCount(0);

  // --- P3: the plate's TAG field, prefilled with the equipment's TAG ---
  const tagInput = plateField(page, 'tag').locator('input');
  await page.getByRole('button', { name: /^Placa,/ }).click();
  await expect(tagInput).toHaveValue('QM8');
  await tagInput.fill('QM9');
  // Idle mid-typing: nothing is written until the field is left.
  await page.waitForTimeout(1200);
  expect(await renameBatch(page, before.equipmentId, 'QM9')).toEqual([]);
  await tagInput.press('Tab');
  await expect(page.getByRole('button', { name: 'Mais opções da ficha QM9' })).toBeVisible();
  await expect(sheetTitle(page)).toContainText('QM9');
  await expect.poll(async () => (await renameBatch(page, before.equipmentId, 'QM9')).map(([path]) => path)).toEqual([
    `equipment/${before.equipmentId}/tag`,
    `sheet/${dj.blockId}/conclusion/text`,
    `sheet/${dj.blockId}/conclusion/text_basis`,
    `sheet/${dj.blockId}/nameplate/tag`,
  ]);
  const second = await renameBatch(page, before.equipmentId, 'QM9');
  expect(second.find(([path]) => path === `sheet/${dj.blockId}/conclusion/text`)?.[1]).toBe(before.text.replace(dj.tag, 'QM9'));
  expect(second.find(([path]) => path === `sheet/${dj.blockId}/nameplate/tag`)?.[1]).toBe('QM9');
  const row = (await entities(page)).find((record) => record.entity === 'equipment' && record.id === before.equipmentId)!.row as unknown as EquipmentRow;
  expect([row.id, row.tag, row.reuse_key ?? null]).toEqual([before.equipmentId, 'QM9', keyBefore]);

  // A TAG another live equipment holds: refused with the rename's reason, the field shows QM9 again, nothing written.
  const opsBefore = (await outbox(database, page)).length;
  await tagInput.fill(other.tag);
  await tagInput.press('Tab');
  await expect(toast(page)).toContainText(tagTakenText(other.tag, null));
  await expect(plateField(page, 'tag').locator('input')).toHaveValue('QM9');
  expect((await outbox(database, page)).length).toBe(opsBefore);

  // The tree names it QM9 (every location expanded).
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  const tree = page.getByRole('list', { name: 'Locais do relatório' });
  await expect(tree).toBeVisible();
  for (let round = 0; round < 12; round++) {
    const closed = tree.getByRole('button', { name: /^Expandir (?!ou recolher)/ });
    if ((await closed.count()) === 0) break;
    await closed.first().click();
  }
  await expect(tree.locator('li.s9-eq .block-tag', { hasText: /^QM9$/ })).toBeVisible();

  // --- the DOCX: section 9 prints the confirmed paragraph naming QM9 ---
  await setParecer(page, relatorioId, 'Apto');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const generate = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await generate.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(generate);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, generate);
  const revision = (await entities(page)).find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.id}/docx`);
  expect(response.status()).toBe(200);
  const { paragraphs } = extractStructure(Buffer.from(await response.body()));
  expect(paragraphs).toContain(before.text.replace(dj.tag, 'QM9'));
});
