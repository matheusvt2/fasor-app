import { cellAddressesOf, getDefinition, newPointRow, SEED_VERSION, type OpDraft, type PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, typeDate } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 22.5 (Bruno, 2026-11-06): every NC row and every test out of criterion is a point of
 * attention by itself. Driven as a person would at 1280 px: the derived entries on the Points
 * surface after the manual point, "Editar" on one writing a point of origin `nc` that replaces
 * it, the DOCX's section 8 printing them, and the removal bringing the entry back. It issues a
 * revision through the api's one queue and LibreOffice, so this spec runs in the serial group
 * (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});
const SECC = getDefinition('v3', 'cabine_primaria', 'chave_seccionadora');
const FIRST_ITEM = SECC.checklist![0]!;

type Scope = { relatorioId: string };

const storedPoints = async (page: Page) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
const row8 = (page: Page) => page.locator('li.sum-row[data-row="section_8"]');
const cards = (page: Page) => page.locator('.poa-list > .point-of-attention-card:not(.is-auto):not(.is-editing)');
const autoCards = (page: Page) => page.locator('.poa-list > .point-of-attention-card.is-auto');
const toast = (page: Page) => page.getByTestId('toast');
const textArea = (scope: Locator) => scope.getByRole('textbox', { name: 'Texto' });
const enelChaves = (sheets: readonly SeededSheet[]) => sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');

/** A point written on the office device, placed after the ones listed before it. */
function pointDrafts(scope: Scope, texts: readonly { text: string; action: string | null }[]): { drafts: OpDraft[]; rows: PointRow[] } {
  const rows: PointRow[] = [];
  for (const entry of texts) {
    rows.push(newPointRow({ id: newId(), relatorioId: scope.relatorioId, text: entry.text, equipmentId: null, origin: 'manual', action: entry.action }, rows));
  }
  return { drafts: rows.map((row) => officeDraft(account, scope, `point/${row.id}`, row, 'create')), rows };
}

async function setUp(page: Page, seed: (scope: Scope, sheets: SeededSheet[]) => OpDraft[]): Promise<{ relatorioId: string; sheets: SeededSheet[]; equipmentOf: Map<string, string> }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const equipmentOf = new Map(
    built.drafts
      .filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/'))
      .map((draft) => draft.value as { id: string; equipment_id: string | null })
      .filter((row) => row.equipment_id !== null)
      .map((row) => [row.id, row.equipment_id!] as const),
  );
  await pushDrafts(page, database, [...built.drafts, ...seed(scope, built.sheets)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return { relatorioId: built.relatorioId, sheets: built.sheets, equipmentOf };
}

async function openPoints(page: Page): Promise<void> {
  await row8(page).getByRole('button', { name: /^Pontos de atenção/ }).click();
  await expect(page).toHaveURL(/\/pontos$/);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
}

test('@p0 22.5-E2E-001 NC rows of a sheet and an out insulation list as derived entries after the manual point; "Editar" on one writes an origin nc point that replaces it, removing it brings the entry back, and the DOCX\'s section 8 prints the entries', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const SECOND_ITEM = SECC.checklist![1]!;
  const { relatorioId, sheets, equipmentOf } = await setUp(page, (scope, all) => {
    const chave = enelChaves(all)[0]!;
    const dj = all.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
    // The first capture of the disjuntor's insulation table, 300 MΩ against > 400 MΩ.
    const [first] = cellAddressesOf(getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt'), 'isolacao');
    return [
      ...pointDrafts(scope, [{ text: 'Ponto geral', action: 'Agir' }]).drafts,
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/result`, 'NC'),
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/observation`, 'oxidação nos terminais'),
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${SECOND_ITEM.key}/result`, 'NC'),
      officeDraft(account, scope, `sheet/${dj.blockId}/test/isolacao/cell/${first!.row}/${first!.col}`, { raw: '300', unit: 'MΩ', state: 'measured' }),
    ];
  });
  const chave = enelChaves(sheets)[0]!;

  // Row 8 and the heading count the three automatic entries after the manual point (the local's NC
  // entries are covered by the kernel tests, `derived-kinds.test.ts`).
  await expect(row8(page).locator('.sum-status')).toContainText('1 ponto + 3 automáticos');
  await openPoints(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (1 + 3 automáticos)' })).toBeVisible();
  const auto = autoCards(page);
  await expect(auto).toHaveCount(3);
  await expect(auto.locator('.not-tested-chip', { hasText: 'Não conforme' })).toHaveCount(2);
  await expect(auto.locator('.not-tested-chip', { hasText: 'Fora do critério' })).toHaveCount(1);
  await expect(page.locator('.poa-list > .point-of-attention-card').first()).not.toHaveClass(/is-auto/);
  const ncCard = auto.filter({ hasText: 'oxidação nos terminais' });
  await expect(ncCard).toHaveCount(1);
  await expect(ncCard.locator('.poa-title')).toHaveText(`${chave.tag} · Cubículo Enel`);
  await expect(ncCard.locator('.not-tested-band')).toContainText(`Item 1 (${FIRST_ITEM.label.toLocaleLowerCase('pt-BR')}): oxidação nos terminais`);

  // "Editar": a new point seeded with the entry's text; a new action and deadline saved.
  await ncCard.getByRole('button', { name: /^Editar o ponto automático/ }).click();
  const editor = page.locator('.point-of-attention-card.is-editing');
  await expect(textArea(editor)).toContainText('oxidação nos terminais');
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill('Limpar e reapertar os terminais');
  await typeDate(editor, 'Prazo', '01122026');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await storedPoints(page)).filter((row) => row.origin === 'nc').length).toBe(1);
  const written = (await storedPoints(page)).find((row) => row.origin === 'nc')!;
  expect(written).toMatchObject({ equipment_id: equipmentOf.get(chave.blockId), item_key: FIRST_ITEM.key, action: 'Limpar e reapertar os terminais', deadline: '2026-12-01' });
  // The point replaces the entry.
  await expect(auto).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (2 + 2 automáticos)' })).toBeVisible();

  // The DOCX's section 8: the two points, then the three entries, each its own bullet.
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const footButton = page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await footButton.click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const paragraphs = extractStructure(Buffer.from(await response.body())).paragraphs;
  expect(paragraphs.some((p) => p.startsWith('Limpar e reapertar os terminais') || p.includes('oxidação nos terminais. Limpar e reapertar os terminais'))).toBe(true);
  expect(paragraphs.filter((p) => p.startsWith('Item não conforme: ')).length).toBe(1);
  expect(paragraphs.filter((p) => p.startsWith('Ensaio fora do critério: ')).length).toBe(1);

  // Removing the point brings the entry back.
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(cards(page)).toHaveCount(2, { timeout: 30_000 });
  await cards(page).nth(1).getByRole('button', { name: /^Mais opções de ponto 2/ }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover ponto' }).click();
  await expect(auto).toHaveCount(3);
});

