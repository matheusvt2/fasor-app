import { getDefinition, SEED_VERSION, type BlockRow, type EquipmentRow, type JsonValue, type OpDraft } from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { resetTestCompanyData, seedAccount } from '../apps/api/src/db/seed.ts';
import { colleagueContext } from './support/colleague.ts';
import { deviceDatabaseName, expect, horizontalOverflow, SEED_PASSWORD, signIn, test, timed, type SeedAccount, type WorkerSeed } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos } from './support/photos.ts';
import { serverRow } from './support/reading-ops.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB, withSeedDb } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 11.2 (FR-20): "Mover para…" from the Sumário's Block card Overflow and from the sheet
 * header, driven as a person would. The move is one batch (`block/{id}/location_id`,
 * `block/{id}/order_key`, and `equipment/{id}/tag` when the re-suggested TAG is accepted);
 * the sheet's values and photos follow the block id; "Desfazer" restores all of it, on the
 * device and, after a sync, on the server (11.2-UNDO); a move on one tablet against a cell
 * edit on another merges with no contradiction, and two moves of one block leave one
 * `latest_edit` information row (11.2-MERGE).
 */

const ITEM = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora').checklist![0]!.key;

const announcer = (page: Page) => page.getByTestId('sumario-announcer');
const toast = (page: Page) => page.getByTestId('toast');
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const tagsIn = (li: Locator) => li.locator(':scope > .s9-eqs > li.s9-eq .block-tag');
const eqRow = (page: Page, tag: string) => page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });
const menuOf = (page: Page, name: string) => page.getByRole('button', { name: `Mais opções de ${name}`, exact: true });
const moveDialog = (page: Page, tag: string) => page.getByRole('dialog', { name: `Mover ${tag} para…` });
const mergeRows = (page: Page) => page.getByTestId('sync-merge-row');

interface OutboxOp {
  op_id: string;
  path: string;
  value: unknown;
  batch_id: string | null;
}
const outbox = (page: Page, database: string) => readStore<OutboxOp>(page, database, 'outbox');

/** Two photo rows on the sheet's first checklist item, as the office would have pushed them. */
function photoDrafts(account: SeedAccount, relatorioId: string, blockId: string): OpDraft[] {
  return [1, 2].map((n) => {
    const id = newId();
    const value = {
      id,
      company_id: account.companyId,
      relatorio_id: relatorioId,
      kind: 'photo',
      sha256: String(n).repeat(64),
      mime: 'image/jpeg',
      size: 10,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: new Date(Date.UTC(2026, 8, 6, 12, n)).toISOString(),
      tz_offset: -180,
      coords: null,
      local_seq: n,
      block_id: blockId,
      item_key: ITEM,
      caption: null,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
      people_in_photo: false,
    } satisfies Record<string, JsonValue>;
    return officeDraft(account, { relatorioId }, `file/${id}`, value, 'create');
  });
}

/**
 * Pushes a standard relatório with SEC-C05 holding a filled checklist item and two photos,
 * opens its Sumário with section 9 and 1° Subsolo expanded, and returns the ids.
 */
async function openWithSec05(page: Page, account: SeedAccount, width = 1280): Promise<{ relatorioId: string; sec: SeededSheet; sheets: SeededSheet[] }> {
  const database = deviceDatabaseName(account.userId);
  await page.setViewportSize({ width, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const sec = built.sheets.find((s) => s.tag === 'SEC-C05')!;
  expect(sec, 'the standard template has SEC-C05').toBeDefined();
  await pushDrafts(page, database, [
    ...built.drafts,
    officeDraft(account, { relatorioId: built.relatorioId }, `sheet/${sec.blockId}/checklist/${ITEM}/result`, 'C'),
    ...photoDrafts(account, built.relatorioId, sec.blockId),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await openSubsolo(page);
  return { relatorioId: built.relatorioId, sec, sheets: built.sheets };
}

async function openSubsolo(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expandir 1° Subsolo' });
  if ((await expand.count()) > 0) await expand.click();
  await expect(coluna(page, 'Coluna 5')).toBeVisible();
}

/** "Mover para…" from a Block card, picking `target` and, when asked, the rename. */
async function moveFromTree(page: Page, tag: string, target: string, rename: boolean): Promise<void> {
  await menuOf(page, tag).click();
  await page.getByRole('menuitem', { name: 'Mover para…' }).click();
  const dialog = moveDialog(page, tag);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: target }).click();
  if (rename) await dialog.getByRole('checkbox', { name: /^Renomear para / }).click();
  await dialog.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function deviceRow<T>(page: Page, database: string, entity: string, id: string): Promise<T | undefined> {
  const records = await readStore<{ entity: string; id: string; row: T }>(page, database, 'entities');
  return records.find((record) => record.entity === entity && record.id === id)?.row;
}

test('@p0 11.2-E2E-001 "Mover para…" from the Sumário: SEC-C05 moves to Coluna 9 renamed SEC-C09, with its filled item and its photos, in one batch, announced with "Desfazer"', async ({ page, seed }) => {
  test.setTimeout(120_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account, { standard: true });
  const { relatorioId, sec } = await openWithSec05(page, account);
  const coluna9Id = (await coluna(page, 'Coluna 9').getAttribute('data-location-id'))!;

  // DESIGN.md Block card: "Mover para…" right after "Descer".
  await menuOf(page, 'SEC-C05').click();
  const labels = await page.getByRole('menu').getByRole('menuitem').allTextContents();
  expect(labels[labels.indexOf('Descer') + 1]).toBe('Mover para…');
  await page.getByRole('menuitem', { name: 'Mover para…' }).click();
  const dialog = moveDialog(page, 'SEC-C05');
  await expect(dialog).toBeVisible();
  // Nothing is preselected; the primary waits with its reason; its own column is not offered.
  await expect(dialog.locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Mover', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog.getByText('Escolha o local de destino')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: '1° Subsolo › Coluna 5', exact: true })).toHaveCount(0);
  await dialog.getByRole('radio', { name: '1° Subsolo › Coluna 9', exact: true }).click();
  await expect(dialog.getByText('Sugerir TAG para Coluna 9?')).toBeVisible();
  const rename = dialog.getByRole('checkbox', { name: 'Renomear para SEC-C09' });
  await expect(rename).toHaveAttribute('aria-checked', 'false');
  await rename.click();
  await expect(rename).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(announcer(page)).toHaveText('SEC-C09 movida para a Coluna 9');
  await expect(toast(page)).toContainText('SEC-C09 movida para a Coluna 9');
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C09']);
  await expect(tagsIn(coluna(page, 'Coluna 5'))).not.toContainText(['SEC-C05']);
  await expect(eqRow(page, 'SEC-C09').locator('.s9-state')).toHaveText('● Em preenchimento');
  // The focus lands on the moved row.
  await expect(eqRow(page, 'SEC-C09').locator('.s9-eq-open')).toBeFocused();

  // One batch: the location, the order key and the TAG.
  const block = (await deviceRow<BlockRow>(page, database, 'block', sec.blockId))!;
  expect(block.location_id).toBe(coluna9Id);
  const ops = (await outbox(page, database)).filter((op) => op.path.startsWith(`block/${sec.blockId}/`) || op.path === `equipment/${block.equipment_id}/tag`);
  expect(ops.map((op) => op.path).sort()).toEqual([`block/${sec.blockId}/location_id`, `block/${sec.blockId}/order_key`, `equipment/${block.equipment_id}/tag`].sort());
  expect(new Set(ops.map((op) => op.batch_id)).size).toBe(1);
  expect(ops[0]!.batch_id).not.toBeNull();
  expect(ops.find((op) => op.path.endsWith('/tag'))!.value).toBe('SEC-C09');

  // Its photos still hang off the block; the sheet opened from Coluna 9 holds its item.
  const photos = (await devicePhotos(page, database)).filter((photo) => photo.block_id === sec.blockId);
  expect(photos).toHaveLength(2);
  await eqRow(page, 'SEC-C09').locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/ficha/${sec.blockId}$`));
  await expect(page.locator('.sheet-header .sheet-meta').first()).toContainText('Coluna 9');
  await expect(page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${ITEM}"]`).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('@p0 11.2-E2E-002 11.2-UNDO: "Desfazer" puts SEC-C05 back in Coluna 5 with its TAG, on the device and, after a sync, on the server', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account, { standard: true });
  const { relatorioId, sec } = await openWithSec05(page, account);
  const coluna5Id = (await coluna(page, 'Coluna 5').getAttribute('data-location-id'))!;
  const before = (await deviceRow<BlockRow>(page, database, 'block', sec.blockId))!;

  await moveFromTree(page, 'SEC-C05', '1° Subsolo › Coluna 9', true);
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C09']);
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(eqRow(page, 'SEC-C05')).toBeVisible();
  await expect(tagsIn(coluna(page, 'Coluna 5'))).toContainText(['SEC-C05']);
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveCount(0);
  await expect
    .poll(async () => {
      const row = await deviceRow<BlockRow>(page, database, 'block', sec.blockId);
      return [row?.location_id, row?.order_key];
    })
    .toEqual([coluna5Id, before.order_key]);

  await syncNow(page);
  const serverBlock = (await serverRow(account.companyId, 'block', sec.blockId)) as unknown as BlockRow;
  expect(serverBlock.location_id).toBe(coluna5Id);
  expect(serverBlock.order_key).toBe(before.order_key);
  const serverEquipment = (await serverRow(account.companyId, 'equipment', before.equipment_id!)) as unknown as EquipmentRow;
  expect(serverEquipment.tag).toBe('SEC-C05');
  expect((await devicePhotos(page, database)).filter((photo) => photo.block_id === sec.blockId)).toHaveLength(2);

  // A reload pulls the same state back.
  await page.goto(`/relatorio/${relatorioId}`);
  await openSubsolo(page);
  await expect(tagsIn(coluna(page, 'Coluna 5'))).toContainText(['SEC-C05']);
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveCount(0);
});

test('@p1 11.2-E2E-003 "Mover para…" from the sheet header, after "Marcar não ensaiado": the header location line follows, the TAG kept', async ({ page, seed }) => {
  test.setTimeout(120_000);
  const account = seed.companies[1];
  await resetEmpresaB(account, { standard: true });
  const { relatorioId, sec } = await openWithSec05(page, account);
  await page.goto(`/relatorio/${relatorioId}/ficha/${sec.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sheet-header .sheet-meta').first()).toContainText('Coluna 5');

  await page.getByRole('button', { name: 'Mais opções da ficha SEC-C05' }).click();
  const labels = await page.getByRole('menu').getByRole('menuitem').allTextContents();
  expect(labels[labels.indexOf('Marcar não ensaiado') + 1]).toBe('Mover para…');
  await page.getByRole('menuitem', { name: 'Mover para…' }).click();
  const dialog = moveDialog(page, 'SEC-C05');
  await dialog.getByRole('radio', { name: '1° Subsolo › Coluna 9', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText('SEC-C05 movida para a Coluna 9');
  await expect(page.locator('.sheet-header .sheet-meta').first()).toContainText('Coluna 9');
  await expect(page.locator('.sheet-header .sheet-title')).toContainText('SEC-C05');
});

test('@p1 11.2-E2E-004 keyboard only: the Overflow, the target, the rename and "Mover" by keys; the focus lands on the moved row', async ({ page, seed }) => {
  test.setTimeout(120_000);
  const account = seed.companies[1];
  await resetEmpresaB(account, { standard: true });
  await openWithSec05(page, account);

  await menuOf(page, 'SEC-C05').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  for (let i = 0; i < 10; i++) {
    if ((await page.evaluate(() => document.activeElement?.textContent ?? '')) === 'Mover para…') break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(page.getByRole('menuitem', { name: 'Mover para…' })).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = moveDialog(page, 'SEC-C05');
  await expect(dialog).toBeVisible();
  // Tab reaches the chip group (its first chip), the arrows pick; Coluna 9 is some presses away.
  const target = dialog.getByRole('radio', { name: '1° Subsolo › Coluna 9', exact: true });
  for (let i = 0; i < 5 && !(await dialog.getByRole('radio').first().evaluate((el) => el === document.activeElement || el.parentElement?.contains(document.activeElement) === true)); i++) {
    await page.keyboard.press('Tab');
  }
  for (let i = 0; i < 30 && (await target.getAttribute('aria-checked')) !== 'true'; i++) await page.keyboard.press('ArrowRight');
  await expect(target).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  const rename = dialog.getByRole('checkbox', { name: 'Renomear para SEC-C09' });
  await expect(rename).toBeFocused();
  await page.keyboard.press('Space');
  await expect(rename).toHaveAttribute('aria-checked', 'true');
  const move = dialog.getByRole('button', { name: 'Mover', exact: true });
  for (let i = 0; i < 4 && !(await move.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(move).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(announcer(page)).toHaveText('SEC-C09 movida para a Coluna 9');
  await expect(eqRow(page, 'SEC-C09').locator('.s9-eq-open')).toBeFocused();
});

test('@p1 11.2-E2E-005 at 390 px the Move dialog fits: no sideways scroll on the page or inside the dialog, "Mover" reachable', async ({ page, seed }) => {
  test.setTimeout(120_000);
  const account = seed.companies[1];
  await resetEmpresaB(account, { standard: true });
  await openWithSec05(page, account, 390);
  await menuOf(page, 'SEC-C05').click();
  await page.getByRole('menuitem', { name: 'Mover para…' }).click();
  const dialog = moveDialog(page, 'SEC-C05');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: '1° Subsolo › Coluna 9', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Renomear para SEC-C09' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  // Every scroll container inside the dialog scrolls vertically only.
  const sideways = await dialog.evaluate((root) =>
    [root, ...root.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible').length,
  );
  expect(sideways).toBe(0);
  const move = dialog.getByRole('button', { name: 'Mover', exact: true });
  await move.scrollIntoViewIfNeeded();
  await expect(move).toBeInViewport();
  await move.click();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C05']);
});

// --- 11.2-MERGE: two tablets --------------------------------------------------------------

interface Device {
  page: Page;
  context: BrowserContext;
  account: SeedAccount;
  database: string;
}

/** Empties this worker's Empresa A and seeds Ana (with the standard template) and Eduardo again. */
function resetEmpresaA(seed: WorkerSeed): Promise<void> {
  return timed('resetEmpresaA', () =>
    withSeedDb(async (db, auth) => {
      const a = seed.companies[0];
      await resetTestCompanyData(db, [a.companyId]);
      await seedAccount(db, auth, a, SEED_PASSWORD, { standardTemplate: true });
      await seedAccount(db, auth, a.colleague!, SEED_PASSWORD);
    }),
  );
}

test('@p1 11.2-E2E-006 11.2-MERGE: a move on one tablet and a cell edit on the other merge with no contradiction; two moves of one block leave one latest_edit row', async ({ page, browser, seed }) => {
  test.setTimeout(360_000);
  await resetEmpresaA(seed);
  const a = seed.companies[0];
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, a.email);
  const built = newRelatorioDrafts(a);
  const sec05 = built.sheets.find((s) => s.tag === 'SEC-C05')!;
  const sec06 = built.sheets.find((s) => s.tag === 'SEC-C06')!;
  const anaDb = deviceDatabaseName(a.userId);
  await pushDrafts(page, anaDb, built.drafts);
  const colleague = await colleagueContext(browser, seed);
  const ana: Device = { page, context: page.context(), account: a, database: anaDb };
  const eduardo: Device = { ...colleague, database: deviceDatabaseName(colleague.account.userId) };
  try {
    await eduardo.page.setViewportSize({ width: 1280, height: 900 });
    for (const device of [ana, eduardo]) {
      await device.page.goto(`/relatorio/${built.relatorioId}`);
      await expect(device.page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
      await syncNow(device.page);
    }
    const coluna9Id = built.drafts.find((d) => d.path.startsWith('location/') && (d.value as { name: string }).name === 'Coluna 9')!.path.split('/')[1]!;
    const coluna10Id = built.drafts.find((d) => d.path.startsWith('location/') && (d.value as { name: string }).name === 'Coluna 10')!.path.split('/')[1]!;

    // Round 1: Ana moves SEC-C05 to Coluna 9 while Eduardo, offline, marks its first item C.
    await eduardo.page.goto(`/relatorio/${built.relatorioId}/ficha/${sec05.blockId}`);
    await expect(eduardo.page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
    await ana.page.goto(`/relatorio/${built.relatorioId}`);
    await openSubsolo(ana.page);
    await ana.context.setOffline(true);
    await eduardo.context.setOffline(true);
    await moveFromTree(ana.page, 'SEC-C05', '1° Subsolo › Coluna 9', false);
    await expect(tagsIn(coluna(ana.page, 'Coluna 9'))).toHaveText(['SEC-C05']);
    const radio = eduardo.page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${ITEM}"]`).getByRole('radio', { name: 'Conforme', exact: true });
    await radio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await outbox(eduardo.page, eduardo.database)).some((op) => op.path === `sheet/${sec05.blockId}/checklist/${ITEM}/result`)).toBe(true);
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await syncNow(ana.page);

    const server05 = (await serverRow(a.companyId, 'block', sec05.blockId)) as unknown as BlockRow;
    expect(server05.location_id).toBe(coluna9Id);
    expect(server05.sheet.checklist[ITEM]?.result).toMatchObject({ value: 'C' });
    for (const device of [ana, eduardo]) {
      const row = (await deviceRow<BlockRow>(device.page, device.database, 'block', sec05.blockId))!;
      expect(row.location_id).toBe(coluna9Id);
      expect(row.sheet.checklist[ITEM]?.result).toMatchObject({ value: 'C' });
      await expect(device.page.getByTestId('sync-decision-row')).toHaveCount(0);
      await device.page.goto(`/relatorio/${built.relatorioId}`);
      await openSubsolo(device.page);
      await expect(tagsIn(coluna(device.page, 'Coluna 9'))).toHaveText(['SEC-C05']);
      await expect(eqRow(device.page, 'SEC-C05').locator('.s9-state')).toHaveText('● Em preenchimento');
    }

    // Round 2: both move SEC-C06 offline, to different colunas; the later stands, said once.
    for (const device of [ana, eduardo]) await device.context.setOffline(true);
    await moveFromTree(eduardo.page, 'SEC-C06', '1° Subsolo › Coluna 10', false);
    await moveFromTree(ana.page, 'SEC-C06', '1° Subsolo › Coluna 9', false);
    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await syncNow(eduardo.page);
    const server06 = (await serverRow(a.companyId, 'block', sec06.blockId)) as unknown as BlockRow;
    expect([coluna9Id, coluna10Id]).toContain(server06.location_id);
    for (const device of [ana, eduardo]) {
      expect((await deviceRow<BlockRow>(device.page, device.database, 'block', sec06.blockId))!.location_id).toBe(server06.location_id);
      const rows = mergeRows(device.page).filter({ hasText: 'SEC-C06' });
      await expect(rows).toHaveCount(1);
      await expect(rows).toHaveAttribute('data-rule', 'latest_edit');
      await expect(device.page.getByTestId('sync-decision-row')).toHaveCount(0);
    }
  } finally {
    await eduardo.context.close();
  }
});
