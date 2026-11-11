import { getDefinition, SEED_VERSION, siteItems, type BlockRow, type OpDraft, type PointRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { issueAndReadTables } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 24.7 (every seed, stored points only): an item back to Conforme (or to N.A.) asks whether to
 * remove the point of attention written from it. Driven as a person would at 1280 px on a new
 * relatório (seed v13):
 * - 24.7-E2E-001: a seccionadora with two NC items, each with a stored point written from it (origin
 *   `nc`, its item). Item 1 to Conforme: the question names the point; "Remover ponto" removes it in
 *   the result's batch. Item 2 to Conforme: "Manter ponto" keeps it, flagged "Origem resolvida" on the
 *   Pontos screen. The issued DOCX's section 8 holds the kept point alone.
 * - 24.7-E2E-002: a point written from a contact reading (origin `reading`) whose readings are now within:
 *   its card reads "Origem resolvida" with "Remover ponto", which asks the existing confirmation; the
 *   point is removed and "Desfazer" restores it.
 * - 24.7-E2E-003: a local's NC items: "Criar ponto de atenção" on each writes a point of the local and the
 *   item; setting one to Conforme asks and "Remover ponto" removes it; the other to N.A. asks and
 *   "Manter ponto" keeps it.
 * The issue goes through the api's one queue and LibreOffice: the `queue` lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const SECC = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
const ITEM1 = SECC.checklist![0]!;
const ITEM2 = SECC.checklist![1]!;
const ENEL = 'Cubículo Enel';
const SITE_A = siteItems(SEED_VERSION)[2]!;
const SITE_B = siteItems(SEED_VERSION)[3]!;
const TEXT1 = 'Ponto do item 1, a remover com o item';
const TEXT2 = 'Ponto do item 2, mantido com a origem resolvida';
const TITLE = 'Remover o ponto de atenção deste item?';

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const writes = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path);
const checklistRow = (page: Page, itemKey: string) => page.locator(`li.checklist-row[data-item-key="${itemKey}"]`);
const cards = (page: Page) => page.locator('.poa-list > .point-of-attention-card');

function pointDraft(relatorioId: string, row: Partial<PointRow> & Pick<PointRow, 'id' | 'text' | 'origin' | 'order_key'>): OpDraft {
  const value: PointRow = { relatorio_id: relatorioId, equipment_id: null, removed_at: null, action: 'Corrigir na próxima parada', priority: null, deadline: null, owner: null, ...row };
  return officeDraft(account, { relatorioId }, `point/${row.id}`, value, 'create');
}

async function setUp(page: Page) {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const sheet = built.sheets.find((one) => one.blockType === 'chave_seccionadora' && one.locationName === ENEL)!;
  const block = built.drafts.find((draft) => draft.kind === 'create' && draft.path === `block/${sheet.blockId}`)!.value as unknown as BlockRow;
  const enelId = (built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === ENEL)!.value as { id: string }).id;
  return { built, sheet, equipmentId: block.equipment_id!, enelId };
}

async function openPontos(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
}

test('@p0 24.7-E2E-001 back to Conforme, the question names the point: "Remover ponto" removes it in the result\'s batch, "Manter ponto" keeps it flagged; the DOCX section 8 holds the kept one', async ({ page }) => {
  test.setTimeout(360_000);
  const { built, sheet, equipmentId } = await setUp(page);
  const relatorioId = built.relatorioId;
  const scope = { relatorioId };
  const p1 = newId();
  const p2 = newId();
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, relatorioId),
    officeDraft(account, scope, `sheet/${sheet.blockId}/checklist/${ITEM1.key}/result`, 'NC'),
    officeDraft(account, scope, `sheet/${sheet.blockId}/checklist/${ITEM1.key}/observation`, ITEM1.nc_phrases[0]!),
    officeDraft(account, scope, `sheet/${sheet.blockId}/checklist/${ITEM2.key}/result`, 'NC'),
    officeDraft(account, scope, `sheet/${sheet.blockId}/checklist/${ITEM2.key}/observation`, ITEM2.nc_phrases[0]!),
    pointDraft(relatorioId, { id: p1, text: TEXT1, origin: 'nc', equipment_id: equipmentId, item_key: ITEM1.key, order_key: 'a0' }),
    pointDraft(relatorioId, { id: p2, text: TEXT2, origin: 'nc', equipment_id: equipmentId, item_key: ITEM2.key, order_key: 'a1' }),
  ]);
  await page.goto(`/relatorio/${relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  // Item 1 to Conforme: the question, the row already Conforme behind it; "Remover ponto".
  const row1 = checklistRow(page, ITEM1.key);
  await expect(row1.locator('.nc-point-ref')).toHaveText('Ponto de atenção 1', { timeout: 30_000 });
  await row1.getByRole('radio', { name: 'Conforme', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: TITLE });
  await expect(dialog).toHaveAccessibleDescription('O ponto de atenção 1 foi criado a partir deste item, que agora está Conforme. Se mantiver, ele fica com a marca “Item alterado”.');
  await expect(dialog.getByRole('button', { name: 'Manter ponto' })).toBeFocused();
  await expect(row1.locator('.seg[data-value="c"]')).toHaveAttribute('aria-checked', 'true');
  expect(await writes(page, `sheet/${sheet.blockId}/checklist/${ITEM1.key}/result`)).toEqual([]);
  await dialog.getByRole('button', { name: 'Remover ponto' }).click();
  await expect.poll(async () => (await writes(page, `point/${p1}/removed_at`)).map((row) => row.kind)).toEqual(['remove']);
  const [result1] = await writes(page, `sheet/${sheet.blockId}/checklist/${ITEM1.key}/result`);
  expect(result1?.value).toBe('C');
  expect((await writes(page, `point/${p1}/removed_at`))[0]?.batch_id).toBe(result1?.batch_id);
  await expect(page.getByTestId('toast')).toContainText('Ponto de atenção 1 removido');

  // Item 2 to Conforme: "Manter ponto" writes the result alone; the point stays.
  const row2 = checklistRow(page, ITEM2.key);
  await row2.getByRole('radio', { name: 'Conforme', exact: true }).click();
  const second = page.getByRole('dialog', { name: TITLE });
  await expect(second).toHaveAccessibleDescription(/^O ponto de atenção 1 foi criado a partir deste item/);
  await second.getByRole('button', { name: 'Manter ponto' }).click();
  await expect.poll(async () => (await writes(page, `sheet/${sheet.blockId}/checklist/${ITEM2.key}/result`)).map((row) => row.value)).toEqual(['C']);
  expect(await writes(page, `point/${p2}/removed_at`)).toEqual([]);

  // Pontos: the kept point alone, flagged "Origem resolvida" with its "Remover ponto".
  await openPontos(page, relatorioId);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText(TEXT2);
  await expect(cards(page).first().locator('.poa-flag-row')).toContainText('Item alterado');

  // The DOCX's section 8: the kept point, never the removed one.
  const tables = await issueAndReadTables(page, database, relatorioId);
  const cellsText = tables.flat(2).join('\n');
  expect(cellsText).toContain(TEXT2);
  expect(cellsText).not.toContain(TEXT1);
});

test('24.7-E2E-002 a reading point whose readings are back within reads "Origem resolvida" with "Remover ponto"; it is removed behind the confirmation and "Desfazer" restores it', async ({ page }) => {
  test.setTimeout(240_000);
  const { built, sheet, equipmentId } = await setUp(page);
  const relatorioId = built.relatorioId;
  const point = newId();
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, relatorioId),
    officeDraft(account, { relatorioId }, `sheet/${sheet.blockId}/test/resistencia_contato/cell/0/0`, { raw: '120', unit: 'µΩ', state: 'measured' }),
    pointDraft(relatorioId, { id: point, text: 'Contato do polo A acima do aceitável', origin: 'reading', equipment_id: equipmentId, test_key: 'resistencia_contato', order_key: 'a0' }),
  ]);
  await openPontos(page, relatorioId);
  const card = cards(page).filter({ hasText: 'Contato do polo A acima do aceitável' });
  const flag = card.locator('.poa-flag-row');
  await expect(flag).toContainText('Item alterado', { timeout: 30_000 });
  await flag.getByRole('button', { name: 'Remover ponto' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remover este ponto de atenção?' });
  await confirm.getByRole('button', { name: 'Remover ponto' }).click();
  await expect.poll(async () => (await writes(page, `point/${point}/removed_at`)).map((row) => row.kind)).toEqual(['remove']);
  await expect(cards(page)).toHaveCount(0);
  await page.getByTestId('toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(async () => (await writes(page, `point/${point}/removed_at`)).map((row) => [row.kind, row.value])).toEqual([
    ['remove', null],
    ['put', null],
  ]);
  await expect(card.locator('.poa-flag-row')).toContainText('Item alterado');
});

test('24.7-E2E-003 a local\'s NC items: the point created by the tap, then the question on the row with both answers', async ({ page }) => {
  test.setTimeout(240_000);
  const { built, enelId } = await setUp(page);
  const relatorioId = built.relatorioId;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, relatorioId)]);
  await page.goto(`/relatorio/${relatorioId}/local/${enelId}/verificacoes`);

  const created: string[] = [];
  for (const item of [SITE_A, SITE_B]) {
    const row = checklistRow(page, item.key);
    await row.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
    await row.getByRole('group', { name: /^Observações sugeridas do item / }).getByRole('button').first().click();
    await row.getByRole('button', { name: 'Criar ponto de atenção' }).click();
    const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
    await editor.getByRole('button', { name: 'Concluir' }).click();
    await expect(editor).toHaveCount(0);
    await expect
      .poll(async () => (await outbox(page)).filter((op) => op.kind === 'create' && op.path.startsWith('point/')).length)
      .toBe(created.length + 1);
    const create = (await outbox(page)).filter((op) => op.kind === 'create' && op.path.startsWith('point/')).at(-1)!;
    expect(create.value).toMatchObject({ origin: 'nc', item_key: item.key, location_id: enelId, equipment_id: null });
    created.push(create.path.split('/')[1]!);
  }
  await openPontos(page, relatorioId);
  await expect(cards(page)).toHaveCount(2);

  // Item A to Conforme: asked, "Remover ponto".
  await page.goto(`/relatorio/${relatorioId}/local/${enelId}/verificacoes`);
  await checklistRow(page, SITE_A.key).getByRole('radio', { name: 'Conforme', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('dialog', { name: TITLE }).getByRole('button', { name: 'Remover ponto' }).click();
  await expect.poll(async () => (await writes(page, `point/${created[0]}/removed_at`)).map((row) => row.kind)).toEqual(['remove']);

  // Item B to N.A.: asked, "Manter ponto".
  await checklistRow(page, SITE_B.key).getByRole('radio', { name: 'Não se aplica', exact: true }).click();
  const keep = page.getByRole('dialog', { name: TITLE });
  await expect(keep).toHaveAccessibleDescription(/que agora está marcado como Não se aplica/);
  await keep.getByRole('button', { name: 'Manter ponto' }).click();
  await expect.poll(async () => (await writes(page, `location/${enelId}/checklist/${SITE_B.key}/result`)).at(-1)?.value).toBe('NA');
  expect(await writes(page, `point/${created[1]}/removed_at`)).toEqual([]);
  await openPontos(page, relatorioId);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().locator('.poa-flag-row')).toContainText('Item alterado');
});
