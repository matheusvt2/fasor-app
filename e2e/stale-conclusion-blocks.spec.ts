import { composeConclusion, getDefinition, issueBlockedReason, sectionRefText, visitContextOf, type BlockRow, type PreIssueRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceSnapshot, outbox, setUpRelatorio, sheetTitle } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';

/*
 * Story 25.7 (M20, every seed): a concluded sheet whose stored conclusion text is stale blocks the issue. On the
 * current seed's standard relatório the office concludes a chave seccionadora with a text the engineer edited (its
 * basis the one composed then), and the sheet's TAG is renamed from its menu: an edited text is never rewritten by
 * a rename, so it goes stale. Then, as a person does:
 * - the Sumário's row 9 draws "Texto de conclusão desatualizado: <TAG> — impede gerar" as its blocking part;
 * - the Export dialog lists the blocking row on section 9 with its note and "Abrir ficha", and "Gerar relatório" is
 *   disabled with the kernel's reason (`issueBlockedReason`);
 * - way out 1: "Abrir ficha" opens the sheet (back to the dialog), "Substituir" confirms the text composed now, and
 *   the dialog no longer blocks;
 * - the text edited and the TAG renamed again make it stale again; way out 2: "Editar" and a typed text, left,
 *   store the text with the basis of the moment, and the row goes;
 * - the relatório is issued, and the DOCX prints the edited paragraph.
 * Every step reads the outbox too. It issues a revision through the api's one queue and LibreOffice, so the file
 * runs in the queue lane.
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

const toast = (page: Page) => page.getByTestId('toast');
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const row9 = (page: Page) => sumario(page).locator('li[data-row="section_9"]');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => exportDialog(page).locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
const generated = (page: Page) => page.locator('.ficha-conc-text .suggestion-field.is-generated');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });

/** The last value of a conclusion field this device wrote for the sheet. */
async function lastConclusion(page: Page, blockId: string, field: 'text' | 'text_status' | 'text_basis'): Promise<unknown> {
  return (await outbox(database, page)).filter((row) => row.path === `sheet/${blockId}/conclusion/${field}`).at(-1)?.value;
}

/** The text and basis the sheet composes now under the pair Aprovado · Sem restrições, as the device holds it. */
async function composedNow(page: Page, relatorioId: string, blockId: string): Promise<{ text: string; basis: string }> {
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  const block: BlockRow = structuredClone(snapshot.blocks.find((row) => row.id === blockId)!);
  const op = (value: string) => ({ value, source_suggestion_id: null, op_id: '019a6400-2570-7e2e-8000-000000000001' });
  block.sheet.conclusion = { ...block.sheet.conclusion, result: op('aprovado'), restriction: op('sem_restricoes') };
  const tag = snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag;
  const composed = composeConclusion(block, getDefinition(block.seed_version, 'cabine_primaria', block.block_type), tag, visitContextOf(snapshot, block));
  return { text: composed.text, basis: composed.basis };
}

async function openSumario(page: Page, relatorioId: string, dialog = false): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}${dialog ? '?exportar=1' : ''}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
}

async function openConclusao(page: Page): Promise<void> {
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Resultado' })).toBeVisible();
}

async function renameFromMenu(page: Page, from: string, to: string): Promise<void> {
  await page.getByRole('button', { name: `Mais opções da ficha ${from}` }).click();
  await page.getByRole('menuitem', { name: 'Renomear TAG' }).click();
  const rename = page.getByRole('dialog', { name: `Renomear TAG ${from}` });
  await rename.getByRole('textbox', { name: 'TAG' }).fill(to);
  await rename.getByRole('button', { name: 'Salvar' }).click();
  await expect(rename).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Mais opções da ficha ${to}` })).toBeVisible();
}

/** "Editar", then `suffix` typed at the end and the field left; resolves once the typed text is in the outbox. */
async function editText(page: Page, blockId: string, suffix: string): Promise<string> {
  await generated(page).getByRole('button', { name: 'Editar' }).click();
  const editor = generated(page).locator('textarea');
  await expect(editor).toBeFocused();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(suffix);
  await editor.blur();
  await expect.poll(async () => String(await lastConclusion(page, blockId, 'text'))).toMatch(new RegExp(`${suffix.replace(/[.]/g, '\\.')}$`));
  return String(await lastConclusion(page, blockId, 'text'));
}

/** The blocking row the dialog lists for a stale text, as the kernel names it (`PreIssueRow`), for its reason. */
const staleRow = (blockId: string, name: string): PreIssueRow => ({
  id: 'conclusion_stale',
  row: 'section_9',
  severity: 'blocking',
  text: `Texto de conclusão desatualizado: ${name}`,
  kind: 'conclusion_stale',
  sheets: [{ blockId, name }],
});

test('@p0 25.7-E2E-001 a stale conclusion text blocks "Gerar relatório" on row 9 and in the dialog, which leads to the sheet; "Substituir" and an edit of the text each clear it, and the relatório is issued', async ({ page }) => {
  test.setTimeout(480_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const sec = sheets.find((sheet) => sheet.blockType === 'chave_seccionadora')!;

  // The office concludes the seccionadora with a text the engineer edited, under the basis composed then.
  const then = await composedNow(page, relatorioId, sec.blockId);
  const own = `${then.text} Texto do responsável.`;
  const scope = { relatorioId };
  await pushDrafts(page, database, [
    officeDraft(account, scope, `sheet/${sec.blockId}/conclusion/result`, 'aprovado'),
    officeDraft(account, scope, `sheet/${sec.blockId}/conclusion/restriction`, 'sem_restricoes'),
    officeDraft(account, scope, `sheet/${sec.blockId}/conclusion/text`, own),
    officeDraft(account, scope, `sheet/${sec.blockId}/conclusion/text_status`, 'edited'),
    officeDraft(account, scope, `sheet/${sec.blockId}/conclusion/text_basis`, then.basis),
    officeDraft(account, scope, `block/${sec.blockId}/concluded_by`, { actor_id: account.userId, at: new Date(Date.now() - 60_000).toISOString() }),
  ]);
  await openSumario(page, relatorioId);
  await expect(row9(page)).not.toContainText('Texto de conclusão desatualizado');

  // The TAG renamed from the sheet's menu: the edited text stays as written, so it is stale.
  const renamed = `${sec.tag}-R`;
  await openSheet(page, relatorioId, sec.blockId);
  await renameFromMenu(page, sec.tag, renamed);
  expect(await lastConclusion(page, sec.blockId, 'text')).toBeUndefined();

  // Row 9: the blocking part, in the blocking red, beside the row's other parts.
  await openSumario(page, relatorioId);
  const blockingPart = row9(page).locator('.sum-status .is-blocking');
  await expect(blockingPart).toHaveText(`Texto de conclusão desatualizado: ${renamed} — impede gerar`);
  await expect(row9(page).locator('.sum-status')).toHaveClass('sum-status');
  await expect(row9(page).locator('.sum-status')).toContainText(/fichas vazias/);

  // The Export dialog: the blocking row on section 9, with its note and "Abrir ficha"; "Gerar relatório" disabled with its reason.
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const blocker = exportDialog(page).locator('.precheck li.is-blocking');
  await expect(blocker).toHaveCount(1);
  await expect(blocker.locator('.pc-block')).toHaveText(`Texto de conclusão desatualizado: ${renamed}`);
  // Where the fichas stand in this relatório's Sumário (the kernel's `sectionRefText` of section 9).
  await expect(blocker).toContainText(`— ${sectionRefText(await deviceSnapshot(page, database, relatorioId), 9)} `);
  await expect(blocker.locator('.pc-meta')).toHaveText('(os valores da ficha mudaram depois do texto; Substituir ou editar o texto na ficha)');
  await expect(generateButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(generateButton(page)).toHaveAccessibleDescription(issueBlockedReason([staleRow(sec.blockId, renamed)], 1, 10)!);
  await expect(generateButton(page)).toHaveAccessibleDescription(`Atualize o texto da conclusão de ${renamed} para emitir a revisão 1. O rascunho pode ser visto antes.`);

  // --- way out 1: "Abrir ficha" leads to the sheet; "Substituir" confirms the text composed now ---
  await blocker.getByRole('button', { name: 'Abrir ficha' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/ficha/${sec.blockId}\\?volta=exportar$`));
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await openConclusao(page);
  await expect(generated(page).locator('.suggestion-alt')).toHaveText('Sugerido: texto atualizado — Substituir');
  await generated(page).locator('.suggestion-alt').getByRole('button', { name: 'Substituir' }).click();
  await expect(generated(page).locator('.suggestion-alt')).toHaveCount(0);
  const replaced = await composedNow(page, relatorioId, sec.blockId);
  await expect.poll(async () => lastConclusion(page, sec.blockId, 'text')).toBe(replaced.text);
  expect(replaced.text).toContain(`A seccionadora ${renamed} `);
  expect(await lastConclusion(page, sec.blockId, 'text_status')).toBe('confirmed');
  expect(await lastConclusion(page, sec.blockId, 'text_basis')).toBe(replaced.basis);
  // The dialog again: no blocking row, "Gerar relatório" pressable.
  await openSumario(page, relatorioId, true);
  await expect(exportDialog(page)).toBeVisible();
  await expect(exportDialog(page).locator('.precheck li.is-blocking')).toHaveCount(0);
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await escapeDialog(page, exportDialog(page));
  await expect(row9(page)).not.toContainText('Texto de conclusão desatualizado');

  // Stale again: the text edited, then the TAG renamed once more.
  await openSheet(page, relatorioId, sec.blockId);
  await openConclusao(page);
  await editText(page, sec.blockId, ' Primeira revisão.');
  expect(await lastConclusion(page, sec.blockId, 'text_status')).toBe('edited');
  const again = `${sec.tag}-S`;
  await renameFromMenu(page, renamed, again);
  await openSumario(page, relatorioId);
  await expect(blockingPart).toHaveText(`Texto de conclusão desatualizado: ${again} — impede gerar`);

  // --- way out 2: "Editar" and a typed text, left: stored with the basis of the moment ---
  await openSheet(page, relatorioId, sec.blockId);
  await openConclusao(page);
  await expect(generated(page).locator('.suggestion-alt')).toHaveText('Sugerido: texto atualizado — Substituir');
  const basisBefore = await lastConclusion(page, sec.blockId, 'text_basis');
  const final = await editText(page, sec.blockId, ' Revisado após a troca de TAG.');
  expect(await lastConclusion(page, sec.blockId, 'text_status')).toBe('edited');
  // The basis of the moment: the one the sheet composes now (any pair: the basis hashes the pair stored, Aprovado · Sem restrições).
  expect(await lastConclusion(page, sec.blockId, 'text_basis')).toBe((await composedNow(page, relatorioId, sec.blockId)).basis);
  expect(await lastConclusion(page, sec.blockId, 'text_basis')).not.toBe(basisBefore);
  await expect(generated(page).locator('.suggestion-alt')).toHaveCount(0);
  await openSumario(page, relatorioId);
  await expect(row9(page)).not.toContainText('Texto de conclusão desatualizado');

  // --- the issue: nothing blocks; the DOCX prints the edited paragraph ---
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(exportDialog(page).locator('.precheck li.is-blocking')).toHaveCount(0);
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await generateButton(page).click();
  await confirmIssue(exportDialog(page));
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, exportDialog(page));
  const revision = (await readStore<EntityRecord>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.id}/docx`);
  expect(response.status()).toBe(200);
  const { paragraphs } = extractStructure(Buffer.from(await response.body()));
  expect(paragraphs).toContain(final);
});
