import { getDefinition, newPointRow, photoToken, type OpDraft, type PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, TEST_SEED } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';

/*
 * 6.6-E2E: section 8 driven as a person would, at 1280 px: Sumário row 8 opens the Points
 * surface; "Criar" writes a point with a quick text, a photo picked in the picker (stored as
 * its token, drawn as "Imagem N") and its action; an NC row's "Criar ponto de atenção"
 * links the sheet's equipment and the item's photo and gives the focus back to the row; an
 * untested sheet lists itself until a point written from it replaces it; the cards reorder
 * by Alt+↑ and the Overflow's "Subir", one `order_key` op each, kept across a reload; and
 * row 8 counts it all. Every test resets Empresa B and pushes a relatório of the standard
 * template (with whatever the scenario needs) from an "office" device.
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);
const SECC = getDefinition('v3', 'cabine_primaria', 'chave_seccionadora');
const FIRST_ITEM = SECC.checklist![0]!;

type Scope = { relatorioId: string };

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}

interface Built {
  relatorioId: string;
  sheets: SeededSheet[];
  /** The equipment id of each sheet, by block id. */
  equipmentOf: Map<string, string>;
}

const outbox = async (page: Page) => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path.startsWith('point/'));
const row8 = (page: Page) => page.locator('li.sum-row[data-row="section_8"]');
const cards = (page: Page) => page.locator('.poa-list > .point-of-attention-card:not(.is-auto):not(.is-editing)');
const autoCards = (page: Page) => page.locator('.poa-list > .point-of-attention-card.is-auto');
const toast = (page: Page) => page.getByTestId('toast');

/** A photo row pushed from the office (metadata only), captured at minute `n` of the visit. */
function photoDraft(scope: Scope, id: string, n: number, where: { blockId: string; itemKey: string } | null = null): OpDraft {
  return officeDraft(
    account,
    scope,
    `file/${id}`,
    {
      id,
      company_id: account.companyId,
      relatorio_id: scope.relatorioId,
      kind: 'photo',
      sha256: n.toString(16).padStart(64, '0'),
      mime: 'image/jpeg',
      size: 1000 + n,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: `2026-09-07T12:${String(n).padStart(2, '0')}:00.000Z`,
      tz_offset: -180,
      coords: null,
      local_seq: n,
      block_id: where?.blockId ?? null,
      item_key: where?.itemKey ?? null,
      caption: `Foto ${n} da visita`,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
    },
    'create',
  );
}

/** A point written on the office device, placed after the ones listed before it. */
function pointDrafts(scope: Scope, texts: readonly { text: string; action: string | null }[]): { drafts: OpDraft[]; rows: PointRow[] } {
  const rows: PointRow[] = [];
  for (const entry of texts) {
    rows.push(newPointRow({ id: newId(), relatorioId: scope.relatorioId, text: entry.text, equipmentId: null, origin: 'manual', action: entry.action }, rows));
  }
  return { drafts: rows.map((row) => officeDraft(account, scope, `point/${row.id}`, row, 'create')), rows };
}

function notTestedDraft(scope: Scope, blockId: string, reason = 'solicitacao_cliente'): OpDraft {
  return officeDraft(account, scope, `block/${blockId}/not_tested`, { reason, text: null, at: '2026-09-07T12:00:00.000Z', by: account.userId });
}

async function setUp(page: Page, seed: (scope: Scope, sheets: SeededSheet[]) => OpDraft[] = () => []): Promise<Built> {
  await resetEmpresaB({ standard: true });
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

const enelChaves = (sheets: readonly SeededSheet[]) => sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');

async function openPoints(page: Page): Promise<void> {
  await row8(page).getByRole('button', { name: /^Pontos de atenção/ }).click();
  await expect(page).toHaveURL(/\/pontos$/);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
}

/** The text area of an open editor. */
const textArea = (scope: Locator) => scope.getByRole('textbox', { name: 'Texto' });

test('@p0 6.6-E2E-001 row 8 opens the empty Points surface; "Criar" writes one point with a quick text, a picked photo as its token and the action, kept across a reload', async ({ page }) => {
  test.setTimeout(150_000);
  const photoId = newId();
  const { relatorioId } = await setUp(page, (scope) => [photoDraft(scope, photoId, 1)]);

  await expect(row8(page).locator('.sum-status')).toHaveText('Nenhum ponto de atenção');
  await openPoints(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção' })).toBeVisible();
  await expect(page.getByText('Nenhum ponto de atenção.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  await expect(editor).toBeVisible();
  await expect(page.getByText('Nenhum ponto de atenção.', { exact: true })).toHaveCount(0);
  await expect(editor.locator('.poa-equipment')).toHaveText('Geral');
  await expect(editor.getByRole('textbox', { name: 'Ação recomendada' })).toBeVisible();
  const text = textArea(editor);
  await expect(text).toBeFocused();

  // Typed text, then a recurring finding inserted at the caret as plain text.
  await page.keyboard.type('Faltam plaquetas nas cabines.');
  await editor.getByRole('group', { name: 'Textos rápidos' }).getByRole('button', { name: 'Ausência de placas de sinalização de segurança' }).click();
  await expect(text).toContainText('Faltam plaquetas nas cabines. As cabines deverão passar por processo de identificação');

  // A photo picked in the picker lands at the caret as an "Imagem N" chip.
  await editor.getByRole('button', { name: 'Escolher fotos' }).click();
  const picker = page.getByRole('dialog', { name: 'Escolher fotos' });
  await picker.getByRole('button', { name: 'Imagem 1, Foto 1 da visita, referenciar' }).click();
  await expect(picker).toHaveCount(0);
  await expect(text.locator('.photo-ref')).toHaveText('Imagem 1');
  await expect(editor.getByRole('button', { name: 'Imagem 1, remover referência' })).toBeVisible();

  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill('Instalar plaquetas de identificação');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect(toast(page)).toContainText('Ponto de atenção salvo · 1 de 1 na seção 8');

  // One create op; the text holds the token, never the number.
  const ops = await outbox(page);
  expect(ops).toHaveLength(1);
  expect(ops[0]!.kind).toBe('create');
  const row = ops[0]!.value as PointRow;
  expect(row).toMatchObject({ relatorio_id: relatorioId, equipment_id: null, origin: 'manual', action: 'Instalar plaquetas de identificação', removed_at: null });
  expect(row.text).toContain(photoToken(photoId));
  expect(row.text).not.toContain('Imagem');
  expect(row.text.startsWith('Faltam plaquetas nas cabines. As cabines deverão passar')).toBe(true);

  const card = cards(page).first();
  await expect(card.locator('.poa-order')).toHaveText('1 de 1');
  await expect(card.locator('.poa-title')).toHaveText('Geral');
  await expect(card.locator('.poa-text .photo-ref')).toHaveText('Imagem 1');
  await expect(card.locator('.poa-fields dd')).toHaveText('Instalar plaquetas de identificação');

  await page.reload();
  await expect(cards(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(cards(page).first().locator('.poa-text .photo-ref')).toHaveText('Imagem 1');
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (1)' })).toBeVisible();

  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(row8(page).locator('.sum-status')).toHaveText('1 ponto');
});

test('@p0 6.6-E2E-002 an NC row\'s "Criar ponto de atenção" links the sheet\'s equipment and the item\'s photo, and the focus returns to the row', async ({ page }) => {
  test.setTimeout(150_000);
  const photoId = newId();
  const { relatorioId, sheets, equipmentOf } = await setUp(page, (scope, all) => {
    const chave = enelChaves(all)[0]!;
    return [officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/result`, 'NC'), photoDraft(scope, photoId, 2, { blockId: chave.blockId, itemKey: FIRST_ITEM.key })];
  });
  const chave = enelChaves(sheets)[0]!;
  await page.goto(`/relatorio/${relatorioId}/ficha/${chave.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  const row = page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${FIRST_ITEM.key}"]`);
  await row.scrollIntoViewIfNeeded();
  const create = row.getByRole('button', { name: 'Criar ponto de atenção' });
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.poa-equipment')).toHaveText(`${chave.tag} · Cubículo Enel`);
  await expect(textArea(dialog).locator('.photo-ref')).toHaveText('Imagem 1');
  await textArea(dialog).click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Contato com sinais de aquecimento ');
  await dialog.getByRole('textbox', { name: 'Ação recomendada' }).fill('Reapertar e medir de novo');
  await dialog.getByRole('button', { name: 'Concluir' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();

  const ops = await outbox(page);
  expect(ops).toHaveLength(1);
  const point = ops[0]!.value as PointRow;
  expect(point).toMatchObject({ equipment_id: equipmentOf.get(chave.blockId), origin: 'manual', action: 'Reapertar e medir de novo' });
  expect(point.text).toBe(`Contato com sinais de aquecimento ${photoToken(photoId)}`);

  // The Points surface titles it by the equipment.
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(cards(page).first().locator('.poa-title')).toHaveText(`${chave.tag} · Cubículo Enel`, { timeout: 30_000 });
});

test('@p0 6.6-E2E-003 an untested sheet lists itself after the manual points; a point written from that sheet replaces it', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, sheets, equipmentOf } = await setUp(page, (scope, all) => [
    ...pointDrafts(scope, [{ text: 'Ponto geral', action: 'Agir' }]).drafts,
    notTestedDraft(scope, enelChaves(all)[0]!.blockId),
  ]);
  const chave = enelChaves(sheets)[0]!;
  await openPoints(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (1 + 1 automático)' })).toBeVisible();
  const auto = autoCards(page);
  await expect(auto).toHaveCount(1);
  // After the manual point, read-only, with its reason and justification.
  await expect(page.locator('.poa-list > .point-of-attention-card').last()).toHaveClass(/is-auto/);
  await expect(auto.locator('.poa-order')).toHaveText('Listado automaticamente · após os pontos manuais');
  await expect(auto.locator('.poa-title')).toHaveText(`${chave.tag} · Cubículo Enel`);
  await expect(auto.locator('.not-tested-chip')).toHaveText('Não ensaiado');
  await expect(auto.locator('.not-tested-band')).toContainText('Solicitação do cliente — Os ensaios não foram realizados conforme solicitação do cliente.');
  await expect(auto.locator('.drag-handle')).toHaveCount(0);
  await expect(auto.getByRole('textbox')).toHaveCount(0);

  await auto.getByRole('button', { name: `Abrir ficha ${chave.tag}` }).click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${chave.blockId}$`));
  const create = page.locator('.not-tested-point').getByRole('button', { name: 'Criar ponto de atenção' });
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(textArea(dialog)).toHaveText('Os ensaios não foram realizados conforme solicitação do cliente.');
  await dialog.getByRole('button', { name: 'Concluir' }).click();
  await expect(dialog).toHaveCount(0);
  // The sheet now holds its point: the action is gone from the band.
  await expect(page.locator('.not-tested-point')).toHaveCount(0);
  const ops = await outbox(page);
  expect(ops).toHaveLength(1);
  expect(ops[0]!.value).toMatchObject({ origin: 'not_tested', equipment_id: equipmentOf.get(chave.blockId) });

  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(cards(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(autoCards(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (2)' })).toBeVisible();
  await expect(cards(page).nth(1).locator('.poa-title')).toHaveText(`${chave.tag} · Cubículo Enel`);
});

test('@p0 6.6-E2E-004 Alt+↑ and the Overflow\'s "Subir" move a card with one order_key op each, announced, the focus kept, the order kept across a reload', async ({ page }) => {
  test.setTimeout(150_000);
  let rows: PointRow[] = [];
  await setUp(page, (scope) => {
    const built = pointDrafts(scope, [
      { text: 'Primeiro', action: 'A' },
      { text: 'Segundo', action: 'B' },
      { text: 'Terceiro', action: 'C' },
    ]);
    rows = built.rows;
    return built.drafts;
  });
  await openPoints(page);
  const texts = () => cards(page).locator('.poa-text');
  await expect(texts()).toHaveText(['Primeiro', 'Segundo', 'Terceiro']);

  // Alt+↑ with the focus in the second card.
  const edit2 = page.getByRole('button', { name: 'Editar o ponto 2, Geral' });
  await edit2.focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(texts()).toHaveText(['Segundo', 'Primeiro', 'Terceiro']);
  await expect(page.getByTestId('points-announcer')).toHaveText('Ponto de atenção movido: 1 de 3 na seção 8');
  await expect(page.getByRole('button', { name: 'Editar o ponto 1, Geral' })).toBeFocused();
  let ops = await outbox(page);
  expect(ops.map((op) => op.path)).toEqual([`point/${rows[1]!.id}/order_key`]);

  // Alt+↑ on the first card moves nothing.
  await page.keyboard.press('Alt+ArrowUp');
  await expect(texts()).toHaveText(['Segundo', 'Primeiro', 'Terceiro']);

  // The Overflow's "Subir" on the third card.
  await page.getByRole('button', { name: 'Mais opções de ponto 3, Geral' }).click();
  await page.getByRole('menuitem', { name: 'Subir' }).click();
  await expect(texts()).toHaveText(['Segundo', 'Terceiro', 'Primeiro']);
  await expect(page.getByTestId('points-announcer')).toHaveText('Ponto de atenção movido: 2 de 3 na seção 8');
  ops = await outbox(page);
  expect(ops.map((op) => op.path)).toEqual([`point/${rows[1]!.id}/order_key`, `point/${rows[2]!.id}/order_key`]);

  await page.reload();
  await expect(texts()).toHaveText(['Segundo', 'Terceiro', 'Primeiro'], { timeout: 30_000 });
});

test('@p0 6.6-E2E-005 Sumário row 8 reads "5 pontos · 1 sem ação · 3 não ensaiadas" for 2 manual points (one without action) and 3 untested sheets', async ({ page }) => {
  test.setTimeout(120_000);
  await setUp(page, (scope, all) => [
    ...pointDrafts(scope, [
      { text: 'Com ação', action: 'Agir' },
      { text: 'Sem ação', action: null },
    ]).drafts,
    ...all.slice(0, 3).map((sheet) => notTestedDraft(scope, sheet.blockId)),
  ]);
  await expect(row8(page).locator('.sum-status')).toHaveText('5 pontos · 1 sem ação · 3 não ensaiadas');
  await openPoints(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (2 + 3 automáticos)' })).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
  await expect(autoCards(page)).toHaveCount(3);
  await expect(cards(page).nth(1).locator('.poa-fields dd')).toHaveText('—');
});

test('@p1 6.6-E2E-006 a point citing a removed photo is named on row 8; "Remover" asks, tombstones it and "Desfazer" brings it back', async ({ page }) => {
  test.setTimeout(150_000);
  const photoId = newId();
  let point: PointRow | null = null;
  await setUp(page, (scope) => {
    const built = pointDrafts(scope, [{ text: `Ver ${photoToken(photoId)}`, action: 'Agir' }]);
    point = built.rows[0]!;
    return [photoDraft(scope, photoId, 3), { ...officeDraft(account, scope, `file/${photoId}/removed_at`, null), kind: 'remove' as const }, ...built.drafts];
  });
  await expect(row8(page).locator('.sum-status')).toHaveText('1 ponto · Ponto 1 cita uma foto removida');
  await openPoints(page);
  await expect(cards(page).first().locator('.poa-text .photo-ref')).toHaveText('Foto removida');

  await page.getByRole('button', { name: 'Mais opções de ponto 1, Geral' }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remover este ponto de atenção?' });
  await confirm.getByRole('button', { name: 'Remover ponto' }).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByText('Nenhum ponto de atenção.', { exact: true })).toBeVisible();
  const ops = await outbox(page);
  expect(ops.map((op) => [op.kind, op.path])).toEqual([['remove', `point/${point!.id}/removed_at`]]);

  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(cards(page)).toHaveCount(1);
});

test('@p1 6.6-E2E-007 a card dragged by its handle lands where it is dropped, with one order_key op', async ({ page }) => {
  test.setTimeout(150_000);
  let rows: PointRow[] = [];
  await setUp(page, (scope) => {
    const built = pointDrafts(scope, [
      { text: 'Primeiro', action: 'A' },
      { text: 'Segundo', action: 'B' },
      { text: 'Terceiro', action: 'C' },
    ]);
    rows = built.rows;
    return built.drafts;
  });
  await openPoints(page);
  const texts = () => cards(page).locator('.poa-text');
  await expect(texts()).toHaveText(['Primeiro', 'Segundo', 'Terceiro']);
  const handle = page.getByRole('button', { name: 'Reordenar ponto 3, Geral' });
  const from = (await handle.boundingBox())!;
  const target = (await cards(page).first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, target.y + 4, { steps: 12 });
  await page.mouse.up();
  await expect(texts()).toHaveText(['Terceiro', 'Primeiro', 'Segundo']);
  expect((await outbox(page)).map((op) => op.path)).toEqual([`point/${rows[2]!.id}/order_key`]);
});
