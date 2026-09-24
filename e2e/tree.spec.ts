import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, syncBadge, test, TEST_SEED } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';

/*
 * 4.4-E2E and 4.5-E2E: the location tree in the Sumário's section 9 and on the rail, and
 * the blocks added, moved, duplicated, renamed, removed and restored on it, driven as a
 * person would: by pointer and by keyboard, at 1280 and 768 px, online and offline.
 *
 * Every test resets Empresa B and pushes a relatório of the standard template from an
 * "office" device (the `project` create and the 223 `instantiateTemplate` drafts), then
 * opens `/relatorio/:id`, which pulls it on open. Safe mid-run only because the suite runs
 * with `workers: 1`.
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);

const announcer = (page: Page) => page.getByTestId('sumario-announcer');
const toast = (page: Page) => page.locator('.toast');
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const cabine = (page: Page, name: string) => tree(page).locator(':scope > li.s9-cabine').filter({ has: page.locator(':scope > .s9-cab-row .s9-cab-name', { hasText: name }) });
const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const tagsIn = (li: Locator) => li.locator(':scope > .s9-eqs > li.s9-eq .block-tag');
const eqRow = (page: Page, tag: string) => page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });
const menuOf = (page: Page, name: string) => page.getByRole('button', { name: `Mais opções de ${name}`, exact: true });

/** "Sincronizar agora" from the Sync status, until nothing is waiting, then back. */
async function syncNow(page: Page): Promise<void> {
  const back = page.url();
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await button.click();
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 30_000 });
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok');
  await page.goto(back);
}

/** Resets Empresa B, signs in and opens the Sumário of a relatório pushed from the office. */
async function openRelatorio(page: Page, width: number): Promise<{ relatorioId: string; projectId: string }> {
  await resetCompany({ standard: true });
  await page.setViewportSize({ width, height: 900 });
  await signIn(page, account.email);
  const ids = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${ids.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return ids;
}

/** Opens section 9 (a Rascunho relatório opens it collapsed). */
async function openSection9(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
}

async function blockIdOf(page: Page, tag: string): Promise<string> {
  const id = await eqRow(page, tag).getAttribute('data-block-id');
  expect(id).not.toBeNull();
  return id!;
}

test('@p0 4.4-E2E-001 section 9 at 1280: chevrons and Left/Right, coluna and equipment rows with states, cabine meta and Overflow, locations added, renamed and moved', async ({ page }) => {
  // One continuous walk through the tree, as a person does it: longer than the default budget.
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openSection9(page);
  await expect(tree(page).locator(':scope > li.s9-cabine')).toHaveCount(6);
  await expect(page.getByText('Organizados por local aqui; no documento, agrupados como no FO.SERV-03.')).toBeVisible();

  // DESIGN.md: 56 px rows and a 48×56 chevron target apart from the row body.
  const enelChevron = page.getByRole('button', { name: 'Expandir Cubículo Enel' });
  const box = (await enelChevron.boundingBox())!;
  expect(Math.round(box.width)).toBe(48);
  expect(Math.round(box.height)).toBe(56);
  await expect(cabine(page, 'Cubículo Enel').locator('.s9-cab-meta')).toHaveText('—');
  await expect(cabine(page, '1° Subsolo').locator('.s9-cab-meta')).toHaveText('agrupar por tipo');
  await expect(cabine(page, 'Cubículo Enel').locator('.s9-cab-row .progress-counter')).toHaveText('0 de 9');

  // Left/Right on the chevron.
  await enelChevron.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Recolher Cubículo Enel' })).toHaveAttribute('aria-expanded', 'true');
  await expect(tagsIn(cabine(page, 'Cubículo Enel'))).toHaveCount(9);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: 'Expandir Cubículo Enel' })).toHaveAttribute('aria-expanded', 'false');
  await expect(tagsIn(cabine(page, 'Cubículo Enel'))).toHaveCount(0);

  // 1° Subsolo: its own blocks, then its colunas open with it; every sheet reads its state.
  await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  await expect(coluna(page, 'Coluna 1')).toHaveClass(/is-open/);
  await expect(tagsIn(coluna(page, 'Coluna 1'))).toHaveText(['SEC-C01']);
  await expect(coluna(page, 'Coluna 1').locator('.s9-col-meta')).toHaveText('0 de 1');
  const sec = eqRow(page, 'SEC-C01');
  await expect(sec.locator('.s9-state')).toHaveText('○ Vazia');
  await expect(sec.locator('.s9-state [aria-hidden="true"]')).toHaveText('○');
  const rowBox = (await sec.boundingBox())!;
  expect(Math.round(rowBox.height)).toBeGreaterThanOrEqual(56);
  // Left on a leaf's body goes to its coluna's chevron.
  await sec.locator('.s9-eq-open').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: 'Recolher Coluna 1', exact: true })).toBeFocused();
  // Review F-3: "Adicionar bloco em ⟨cabine⟩" opens on the cabine's current coluna (its last, no sheet worked yet).
  await page.getByRole('button', { name: 'Adicionar bloco em 1° Subsolo' }).click();
  await expect(page.getByRole('dialog', { name: 'Adicionar bloco' }).getByText('Em: 1° Subsolo › Coluna 17')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // "Mover para…" is hidden until Epic 11: absent from an open equipment Overflow.
  await menuOf(page, 'SEC-C01').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Duplicar' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Mover para/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // "Abrir primeira ficha" opens the cabine's first sheet (Story 5.1: the App bar names its
  // TAG); back on the Sumário its row is the last sheet worked on.
  await menuOf(page, 'Cubículo Enel').click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page).toHaveURL(/\/ficha\//);
  const tagButton = page.locator('.sheet-header .tag-btn');
  await expect(tagButton).not.toHaveText('');
  const firstTag = (await tagButton.textContent())!.trim();
  await expect(page.locator('.app-bar-title')).toHaveText(firstTag);
  await page.goBack();
  await openSection9(page);
  await page.getByRole('button', { name: 'Expandir Cubículo Enel' }).click();
  await expect(tagsIn(cabine(page, 'Cubículo Enel')).first()).toHaveText(firstTag);
  await expect(eqRow(page, firstTag)).toHaveAttribute('aria-current', 'true');

  // "Agrupar por tipo" toggles the cabine flag, announced, and survives a reload.
  await menuOf(page, 'Cubículo Enel').click();
  const agrupar = page.getByRole('menuitemcheckbox', { name: 'Agrupar por tipo na seção 9' });
  await expect(agrupar).toHaveAttribute('aria-checked', 'false');
  await agrupar.click();
  await expect(announcer(page)).toHaveText('Agrupar por tipo ativado em Cubículo Enel');
  await expect(cabine(page, 'Cubículo Enel').locator('.s9-cab-meta')).toHaveText('agrupar por tipo');
  await page.reload();
  await openSection9(page);
  await expect(cabine(page, 'Cubículo Enel').locator('.s9-cab-meta')).toHaveText('agrupar por tipo');

  // "Adicionar coluna", "Renomear", and a cabine moved up by the Overflow.
  await menuOf(page, 'Cubículo Enel').click();
  await page.getByRole('menuitem', { name: 'Adicionar coluna' }).click();
  await expect(page.getByRole('button', { name: 'Recolher Coluna 1', exact: true })).toBeFocused();
  await expect(toast(page)).toContainText('Coluna 1 adicionada');
  await menuOf(page, 'Coluna 1').click();
  await page.getByRole('menuitem', { name: 'Renomear' }).click();
  const rename = page.getByRole('dialog', { name: 'Renomear Coluna 1' });
  await rename.getByRole('textbox', { name: 'Nome' }).fill('Entrada');
  await rename.getByRole('button', { name: 'Salvar' }).click();
  await expect(coluna(page, 'Entrada')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Recolher Entrada' })).toBeFocused();
  await menuOf(page, 'Geradores').click();
  await page.getByRole('menuitem', { name: 'Subir' }).click();
  await expect(announcer(page)).toHaveText('Cabine Geradores movida para a posição 5 de 6');
  await expect(tree(page).locator(':scope > li.s9-cabine .s9-cab-name')).toHaveText(['Cubículo Enel', '1° Subsolo', 'Oxigênio', 'Cobertura A', 'Geradores', 'Cobertura B']);
  await expect(page.getByRole('button', { name: 'Desfazer' })).toBeVisible();
  // Alt+ArrowUp on its chevron moves it again.
  await page.getByRole('button', { name: /^(Expandir|Recolher) Geradores$/ }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(announcer(page)).toHaveText('Cabine Geradores movida para a posição 4 de 6');

  // "Adicionar cabine" at the foot.
  await page.getByRole('button', { name: 'Adicionar cabine' }).click();
  await expect(page.getByRole('button', { name: 'Expandir Cabine 7' })).toBeFocused();
  await expect(tree(page).locator(':scope > li.s9-cabine')).toHaveCount(7);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Every op of the whole edit is a location op (no block moved between locations).
  const outbox = await readStore<{ path: string }>(page, database, 'outbox');
  expect(outbox.every((op) => op.path.startsWith('location/'))).toBe(true);
});

test('@p0 4.5-E2E-001 at 768: the palette from a coluna creates a block offline; moves by Position box, Overflow, Alt+Arrow and drag; Duplicar, Renomear TAG, Remover, Desfazer and Restaurar with the focus asserted', async ({ page, context }) => {
  // One continuous walk through the tree, as a person does it: longer than the default budget.
  test.setTimeout(120_000);
  const { relatorioId } = await openRelatorio(page, 768);
  await openSection9(page);
  await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  const col1 = coluna(page, 'Coluna 1');
  await expect(tagsIn(col1)).toHaveText(['SEC-C01']);

  // The field palette, as a right drawer, one tap, offline.
  await context.setOffline(true);
  await menuOf(page, 'Coluna 1').click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette.getByText('Em: 1° Subsolo › Coluna 1')).toBeVisible();
  const paletteBox = (await palette.boundingBox())!;
  // A right drawer at the rail width, against the right edge (a scrollbar may take its width).
  expect(Math.round(paletteBox.width)).toBe(320);
  expect(paletteBox.x).toBeGreaterThan(768 - 320 - 24);
  await expect(palette.locator('.pf-field .pi-meta')).toHaveText(['CE-C01', 'PR-C01', 'SEC-C01-2', 'DJ-C01', 'TP-C01', 'TC-C01', 'CS-C01', 'TR-9']);
  await palette.getByRole('button', { name: /Disjuntor MT/ }).click();
  await expect(palette).toBeHidden();
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'DJ-C01']);
  await expect(toast(page)).toContainText('DJ-C01 criada na Coluna 1');
  await expect(eqRow(page, 'DJ-C01').locator('.s9-eq-open')).toBeFocused();
  await expect(syncBadge(page)).not.toHaveAttribute('data-pending', '0');
  const created = await readStore<{ path: string; batch_id: string; kind: string }>(page, database, 'outbox');
  expect(created.map((op) => [op.path.split('/')[0], op.kind])).toEqual([
    ['equipment', 'create'],
    ['block', 'create'],
  ]);
  expect(new Set(created.map((op) => op.batch_id)).size).toBe(1);
  // Back online: a reload keeps it (it lives on the device), "Sincronizar agora" clears the badge.
  await context.setOffline(false);
  await page.reload();
  await openSection9(page);
  await page.getByRole('button', { name: /^(Expandir|Recolher) 1° Subsolo$/ }).click();
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'DJ-C01']);
  await syncNow(page);
  await openSection9(page);
  if ((await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).count()) > 0) await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();

  // The Position box: "9" clamps to the last slot; the focus stays in the box.
  const secBox = eqRow(page, 'SEC-C01').getByRole('textbox', { name: 'Posição de SEC-C01' });
  await secBox.fill('9');
  await secBox.press('Enter');
  await expect(announcer(page)).toHaveText('SEC-C01 movido para a posição 2 de 2');
  await expect(tagsIn(col1)).toHaveText(['DJ-C01', 'SEC-C01']);
  await expect(toast(page)).toContainText('SEC-C01 movido para a posição 2 de 2');
  await expect(secBox).toBeFocused();
  // Overflow "Descer".
  await menuOf(page, 'DJ-C01').click();
  await page.getByRole('menuitem', { name: 'Descer' }).click();
  await expect(announcer(page)).toHaveText('DJ-C01 movido para a posição 2 de 2');
  // The new order has rendered before the next key reads the row's position (a person reads it first).
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'DJ-C01']);
  await expect(menuOf(page, 'DJ-C01')).toBeFocused();
  // Alt+ArrowUp.
  await eqRow(page, 'DJ-C01').locator('.s9-eq-open').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(announcer(page)).toHaveText('DJ-C01 movido para a posição 1 de 2');
  await expect(tagsIn(col1)).toHaveText(['DJ-C01', 'SEC-C01']);
  // A mouse drag from the handle below SEC-C01.
  const handle = page.getByRole('button', { name: 'Reordenar DJ-C01' });
  const from = (await handle.boundingBox())!;
  const below = (await eqRow(page, 'SEC-C01').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, below.y + below.height + 8, { steps: 8 });
  await page.mouse.up();
  await expect(announcer(page)).toHaveText('DJ-C01 movido para a posição 2 de 2');
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'DJ-C01']);

  // Duplicar: a taken TAG is refused inline, then a new one.
  await menuOf(page, 'SEC-C01').click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  const duplicate = page.getByRole('dialog', { name: 'Duplicar SEC-C01' });
  const tagField = duplicate.getByRole('textbox', { name: 'TAG' });
  await expect(tagField).toHaveValue('SEC-C01-2');
  await tagField.fill('sec-c02');
  await tagField.press('Tab');
  await expect(duplicate.getByRole('alert')).toHaveText('TAG já existe nesta obra — SEC-C02 em 1° Subsolo › Coluna 2');
  await expect(duplicate.getByRole('button', { name: 'Duplicar' })).toHaveAttribute('aria-disabled', 'true');
  await tagField.fill('SEC-C01-9');
  await duplicate.getByRole('button', { name: 'Duplicar' }).click();
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'SEC-C01-9', 'DJ-C01']);
  await expect(toast(page)).toContainText('SEC-C01-9 criada na Coluna 1');

  // Renomear TAG keeps the block.
  const dupId = await blockIdOf(page, 'SEC-C01-9');
  await menuOf(page, 'SEC-C01-9').click();
  await page.getByRole('menuitem', { name: 'Renomear TAG' }).click();
  const renameTag = page.getByRole('dialog', { name: 'Renomear TAG SEC-C01-9' });
  await renameTag.getByRole('textbox', { name: 'TAG' }).fill('SEC-C01-B');
  await renameTag.getByRole('button', { name: 'Salvar' }).click();
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'SEC-C01-B', 'DJ-C01']);
  expect(await blockIdOf(page, 'SEC-C01-B')).toBe(dupId);

  // Remover an empty block: no Confirm; the focus goes to the row now in its slot.
  await menuOf(page, 'SEC-C01-B').click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'DJ-C01']);
  await expect(toast(page)).toContainText('Ficha removida');
  await expect(eqRow(page, 'DJ-C01').locator('.s9-eq-open')).toBeFocused();
  // Desfazer: it comes back and its Overflow trigger takes the focus.
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'SEC-C01-B', 'DJ-C01']);
  await expect(menuOf(page, 'SEC-C01-B')).toBeFocused();

  // A block made non-empty on another device (not tested) asks before it goes.
  const secId = await blockIdOf(page, 'SEC-C01');
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId }, `block/${secId}/not_tested`, { reason: 'solicitacao_cliente', text: null, at: new Date().toISOString(), by: account.userId }),
  ]);
  await syncNow(page);
  await openSection9(page);
  if ((await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).count()) > 0) await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  await expect(eqRow(page, 'SEC-C01').locator('.s9-state')).toHaveText('⊘ Não ensaiada · Solicitação do cliente');
  await menuOf(page, 'SEC-C01').click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remover ficha SEC-C01?' });
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Remover ficha' }).click();
  await expect(tagsIn(col1)).toHaveText(['SEC-C01-B', 'DJ-C01']);
  await expect(eqRow(page, 'SEC-C01-B').locator('.s9-eq-open')).toBeFocused();
  // "Restaurar ficha removida" brings it back; its Overflow trigger takes the focus.
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: 'Restaurar ficha removida' }).click();
  const restore = page.getByRole('dialog', { name: 'Restaurar ficha removida' });
  await restore.getByRole('button', { name: 'Restaurar SEC-C01 — 1° Subsolo › Coluna 1' }).click();
  await expect(tagsIn(col1)).toHaveText(['SEC-C01', 'SEC-C01-B', 'DJ-C01']);
  await expect(menuOf(page, 'SEC-C01')).toBeFocused();
  await expect(toast(page)).toContainText('Ficha restaurada');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('@p0 4.5-E2E-002 at 1280: the office palette asks TAG and Local prefilled and refuses an existing TAG on blur', async ({ page }) => {
  await openRelatorio(page, 1280);
  await openSection9(page);
  await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  await menuOf(page, 'Coluna 1').click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  // From 1280 px each type opens its confirm instead of creating at once.
  await expect(palette.locator('.pf-field')).toHaveCount(8);
  await expect(palette.locator('.pf-field').first()).toBeHidden();
  const type = palette.locator('.pf-office').filter({ hasText: 'Chave seccionadora' });
  await type.locator('.palette-item').click();
  await expect(type.locator('.palette-item')).toHaveAttribute('aria-expanded', 'true');
  const tag = type.getByRole('textbox', { name: 'TAG' });
  const local = type.getByRole('combobox', { name: 'Local' });
  await expect(tag).toHaveValue('SEC-C01-2');
  await expect(local.locator('option:checked')).toHaveText('1° Subsolo › Coluna 1');
  await tag.fill('sec-c05 ');
  await tag.press('Tab');
  await expect(type.getByRole('alert')).toHaveText('TAG já existe nesta obra — SEC-C05 em 1° Subsolo › Coluna 5');
  const confirm = type.getByRole('button', { name: 'Confirmar' });
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  await expect(type.getByText('Confirmar: a TAG já existe nesta obra')).toBeVisible();
  await tag.fill('SEC-C01-X');
  await local.selectOption({ label: '1° Subsolo › Coluna 3' });
  await expect(tag).toHaveValue('SEC-C01-X');
  await confirm.click();
  await expect(palette).toBeHidden();
  await expect(tagsIn(coluna(page, 'Coluna 3'))).toContainText(['SEC-C01-X']);
  await expect(toast(page)).toContainText('SEC-C01-X criada na Coluna 3');
  await expect(eqRow(page, 'SEC-C01-X').locator('.s9-eq-open')).toBeFocused();
});

test('@p1 4.5-E2E-003 a TAG duplicated by sync reads "TAG ⟨TAG⟩ duplicada" and "Renomear" clears it', async ({ page }) => {
  const { projectId } = await openRelatorio(page, 1280);
  // Another device created the same TAG in the project (no block of this relatório holds it).
  const equipmentId = newId();
  await pushDrafts(page, database, [
    officeDraft(account, { projectId }, `equipment/${equipmentId}`, { id: equipmentId, project_id: projectId, tag: 'SEC-C01', type: 'chave_seccionadora', last_nameplate: null, removed_at: null }, 'create'),
  ]);
  await syncNow(page);
  await openSection9(page);
  await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  const line = eqRow(page, 'SEC-C01').locator('.s9-dup');
  await expect(line).toContainText('TAG SEC-C01 duplicada');
  await line.getByRole('button', { name: 'Renomear TAG SEC-C01 em 1° Subsolo › Coluna 1' }).click();
  const dialog = page.getByRole('dialog', { name: 'Renomear TAG SEC-C01' });
  await dialog.getByRole('textbox', { name: 'TAG' }).fill('SEC-C01-A');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(eqRow(page, 'SEC-C01-A')).toHaveCount(1);
  await expect(page.locator('.s9-dup')).toHaveCount(0);
});

test('@p0 4.4-E2E-002 /relatorio/:id/arvore: the tree as a surface at 390, the strip at 768 that opens the rail, the rail at 1280 with the last sheet aria-current', async ({ page }) => {
  const { relatorioId } = await openRelatorio(page, 390);
  await openSection9(page);
  await page.getByRole('button', { name: 'Expandir Geradores' }).click();
  const geradoresFirst = (await tagsIn(cabine(page, 'Geradores')).first().textContent())!;
  const lastSheet = await blockIdOf(page, geradoresFirst);
  // Review F-1: the last sheet is not tested (made so on another device), the longest state the rail draws.
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId }, `block/${lastSheet}/not_tested`, { reason: 'solicitacao_cliente', text: null, at: new Date().toISOString(), by: account.userId }),
  ]);
  await syncNow(page);
  await page.evaluate(
    async ([name, key, value]) => {
      const open = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = open.transaction('local_prefs', 'readwrite');
        tx.objectStore('local_prefs').put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      open.close();
    },
    [database, `last_sheet:${relatorioId}`, lastSheet] as const,
  );

  await page.goto(`/relatorio/${relatorioId}/arvore`);
  await expect(page.locator('.app-bar h1')).toHaveText('Árvore do relatório');
  const rail = page.getByRole('list', { name: 'Árvore do relatório' });
  await expect(rail).toBeVisible();
  await expect(page.locator('.rail-collapsed')).toBeHidden();
  // The whole width, less a scrollbar where one is drawn.
  expect((await page.locator('aside.rail').boundingBox())!.width).toBeGreaterThan(360);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 800, height: 900 });
  const strip = page.getByRole('complementary', { name: 'Árvore do relatório (recolhida)' });
  await expect(strip).toBeVisible();
  expect(Math.round((await strip.boundingBox())!.width)).toBe(48);
  await expect(strip.getByText('Árvore do relatório')).toBeVisible();
  await expect(rail).toBeHidden();
  const toggle = strip.getByRole('button', { name: 'Abrir árvore do relatório' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(rail).toBeVisible();
  expect(Math.round((await page.locator('aside.rail').boundingBox())!.width)).toBe(320);
  // Nothing in the rail scrolls sideways, the not-tested row included.
  await expect(rail.locator('.tree-row[aria-current="true"]')).toBeVisible();
  expect(await page.locator('aside.rail').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Recolher árvore' }).click();
  await expect(rail).toBeHidden();
  await expect(toggle).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(rail).toBeVisible();
  await expect(page.locator('.rail-head')).toHaveText('Árvore do relatório · 94 blocos');
  const current = rail.locator('.tree-row[aria-current="true"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveClass(/is-selected/);
  // The state keeps its word; the reason is on the meta line (review F-1).
  await expect(current.locator('.tree-state')).toHaveText('⊘Não ensaiada');
  await expect(current.locator('.tree-state [aria-hidden="true"]')).toHaveText('⊘');
  await expect(current.locator('.tree-meta')).toHaveText(`${geradoresFirst} · Solicitação do cliente`);
  expect(await page.locator('aside.rail').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  expect((await current.locator('.tree-body').boundingBox())!.width).toBeGreaterThan(120);
  // Cabines and fichas only: no section, no Position box.
  await expect(rail.getByText('Objetivo')).toHaveCount(0);
  await expect(rail.locator('.pos-box')).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('@p0 5.9-E2E-003 "Marcar não ensaiado" from a Block card Overflow: the reason picked shows in the Sumário row and the rail', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openSection9(page);
  await page.getByRole('button', { name: 'Expandir Cubículo Enel' }).click();
  const firstTag = (await tagsIn(cabine(page, 'Cubículo Enel')).first().textContent())!.trim();
  const blockId = await blockIdOf(page, firstTag);

  await menuOf(page, firstTag).click();
  await expect(page.getByRole('menuitem', { name: 'Duplicar' })).toBeVisible();
  // DESIGN.md Block card row: "Marcar não ensaiado" right after "Duplicar".
  const labels = await page.getByRole('menu').getByRole('menuitem').allTextContents();
  expect(labels[labels.indexOf('Duplicar') + 1]).toBe('Marcar não ensaiado');
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await expect(dialog.getByLabel('Descreva o motivo')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Solicitação do cliente' }).click();
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(dialog).toBeHidden();

  await expect(toast(page)).toContainText('Marcada como não ensaiada — entra na seção 8');
  await expect(eqRow(page, firstTag).locator('.s9-state')).toHaveText('⊘ Não ensaiada · Solicitação do cliente');

  // Not offered a second time once the sheet is already not tested (spec OPEN QUESTION).
  await menuOf(page, firstTag).click();
  await expect(page.getByRole('menuitem', { name: 'Marcar não ensaiado' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The rail reads the same state.
  await page.goto(`/relatorio/${relatorioId}/arvore`);
  const rail = page.getByRole('list', { name: 'Árvore do relatório' });
  await expect(rail).toBeVisible();
  const cabineChevron = page.getByRole('button', { name: 'Expandir Cubículo Enel' });
  if ((await cabineChevron.count()) > 0) await cabineChevron.click();
  const railRow = rail.locator(`li[data-block-id="${blockId}"] .tree-row`);
  await expect(railRow.locator('.tree-state')).toHaveText('⊘Não ensaiada');
  await expect(railRow.locator('.tree-meta')).toHaveText(`${firstTag} · Solicitação do cliente`);
});

test('@p0 5.2-E2E-004 (AC2 leftover) cabineMetaText updates live, with no reload, in the Sumário row and the rail once "Da cabine" is filled', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openSection9(page);
  await expect(cabine(page, 'Cubículo Enel').locator('.s9-cab-meta')).toHaveText('—');
  await menuOf(page, 'Cubículo Enel').click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page).toHaveURL(/\/ficha\//);

  await page.getByLabel('TIPO DE SE', { exact: true }).selectOption('BLINDADA');
  const primaria = page.getByLabel('TENSÃO PRIMÁRIA', { exact: true });
  await primaria.fill('13,8');
  await primaria.press('Tab');
  await page.getByLabel('TEMPERATURA', { exact: true }).fill('19');
  const umidade = page.getByLabel('UMIDADE RELATIVA DO AR', { exact: true });
  await umidade.fill('67');
  await umidade.press('Enter');

  // The rail beside the sheet (already on screen at 1280) reads live, no reload.
  const railCabine = page.locator('aside.rail li[data-location-id]').filter({ has: page.locator(':scope > .tree-row > .tree-body > span', { hasText: /^Cubículo Enel$/ }) });
  await expect(railCabine.locator(':scope > .tree-row > .tree-body > .tree-meta')).toHaveText('BLINDADA · 13,8 kV · 19 °C · 67 %');

  // Back on the Sumário, the same value with no reload.
  await page.goBack();
  await openSection9(page);
  await expect(cabine(page, 'Cubículo Enel').locator('.s9-cab-meta')).toHaveText('BLINDADA · 13,8 kV · 19 °C · 67 %');
});
