import { cellAddressesOf, getDefinition, SEED_VERSION, type BlockRow, type EquipmentRow, type OpDraft } from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { resetTestCompanyData, seedAccount } from '../apps/api/src/db/seed.ts';
import { colleagueContext } from './support/colleague.ts';
import { deviceDatabaseName, expect, SEED_PASSWORD, signIn, syncBadge, syncWord, test, timed, type SeedAccount, type WorkerSeed } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { serverRow } from './support/reading-ops.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { withSeedDb } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Stories 10.2 and 10.3 (FR-59): what the merge cannot decide alone is asked, and only that.
 * Two tablets of one company (two browser contexts: Ana, this worker's Empresa A user, and
 * her colleague Eduardo) edit offline, then "Sincronizar agora" on each (never the timer).
 * A true contradiction on a cell, a block removed on one tablet and edited on the other, and
 * one TAG created on both become the conflict Banner, the badge's "Conflito", the Sync status
 * "Decisões" rows and the Conflict view; each resolution is a plain client batch. Every @p0
 * asserts the committed rows in IndexedDB on both tablets and the server row.
 */

interface Device {
  page: Page;
  context: BrowserContext;
  account: SeedAccount;
  database: string;
}
interface Devices {
  ana: Device;
  eduardo: Device;
}

const ITEM = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora').checklist![9]!.key;
const X_READING = { raw: '1', unit: 'GΩ', state: 'measured' } as const;

const rowOf = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const conflictBanner = (page: Page) => page.locator('.banner-slot .banner[data-variant="conflict"]');
const decisionRows = (page: Page) => page.getByTestId('sync-decision-row');
const mergeRows = (page: Page) => page.getByTestId('sync-merge-row');
const conflictView = (page: Page) => page.getByRole('dialog', { name: /^SEC-C12 · / });
const toast = (page: Page) => page.getByTestId('toast');

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

/** Both tablets signed in on one relatório pushed from the office (plus `extra` office writes), each holding it. */
async function twoDevices(
  page: Page,
  browser: Parameters<typeof colleagueContext>[0],
  seed: WorkerSeed,
  extra: (relatorioId: string, sheets: SeededSheet[]) => OpDraft[] = () => [],
): Promise<{ devices: Devices; relatorioId: string; sheets: SeededSheet[]; blockId: string }> {
  await resetEmpresaA(seed);
  const a = seed.companies[0];
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, a.email);
  const built = newRelatorioDrafts(a);
  const sheet = built.sheets.find((s) => s.tag === 'SEC-C12');
  expect(sheet, 'the standard template has SEC-C12').toBeDefined();
  const anaDb = deviceDatabaseName(a.userId);
  await pushDrafts(page, anaDb, [...built.drafts, ...extra(built.relatorioId, built.sheets)]);
  const colleague = await colleagueContext(browser, seed);
  await colleague.page.setViewportSize({ width: 1280, height: 900 });
  const devices: Devices = {
    ana: { page, context: page.context(), account: a, database: anaDb },
    eduardo: { ...colleague, database: deviceDatabaseName(colleague.account.userId) },
  };
  for (const device of [devices.ana, devices.eduardo]) {
    await device.page.goto(`/relatorio/${built.relatorioId}`);
    await expect(device.page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
    await syncNow(device.page);
  }
  return { devices, relatorioId: built.relatorioId, sheets: built.sheets, blockId: sheet!.blockId };
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** The Sumário with section 9 open and every location expanded. */
async function openTree(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  await expect(chevron).toBeVisible({ timeout: 30_000 });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(page.getByRole('list', { name: 'Locais do relatório' })).toBeVisible();
  const collapsed = page.getByRole('button', { name: /^Expandir (?!ou recolher)/ });
  for (let i = 0; i < 40 && (await collapsed.count()) > 0; i++) await collapsed.first().click();
}

/** "Remover" of an equipment row of the open tree (an empty sheet: no Confirm). */
async function removeFromTree(page: Page, tag: string): Promise<void> {
  await page.getByRole('button', { name: `Mais opções de ${tag}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  await expect(toast(page)).toContainText('Ficha removida');
}

const entities = <T,>(device: Device) => readStore<{ entity: string; id: string; row: T }>(device.page, device.database, 'entities');

async function deviceBlock(device: Device, blockId: string): Promise<BlockRow> {
  return (await entities<BlockRow>(device)).find((record) => record.entity === 'block' && record.id === blockId)!.row;
}

interface OutboxOp {
  op_id: string;
  path: string;
  value: unknown;
  meta?: Record<string, unknown> | null;
}
const outbox = (device: Device) => readStore<OutboxOp>(device.page, device.database, 'outbox');

/** The last op this device wrote on `path`. */
async function lastWritten(device: Device, path: string): Promise<OutboxOp> {
  let found: OutboxOp | undefined;
  await expect
    .poll(async () => {
      found = (await outbox(device)).filter((op) => op.path === path).at(-1);
      return found !== undefined;
    }, { timeout: 15_000 })
    .toBe(true);
  return found!;
}

/** The first op this device writes on `path` after `previous` (the last one before an action). */
async function writtenAfter(device: Device, path: string, previous: string): Promise<OutboxOp> {
  let found: OutboxOp | undefined;
  await expect
    .poll(async () => {
      found = (await outbox(device)).filter((op) => op.path === path).at(-1);
      return found !== undefined && found.op_id !== previous;
    }, { timeout: 15_000 })
    .toBe(true);
  return found!;
}

async function mark(row: Locator, name: 'Conforme' | 'Não conforme' | 'Não se aplica'): Promise<void> {
  const radio = row.getByRole('radio', { name, exact: true });
  await radio.click();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
}

/** Types a reading into the isolation table's first cell and commits it. */
async function typeReading(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await input.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** Both tablets' rows and the server's row of the block: all three deep-equal. */
async function expectConverged(devices: Devices, blockId: string): Promise<BlockRow> {
  const server = (await serverRow(devices.ana.account.companyId, 'block', blockId)) as unknown as BlockRow;
  expect(await deviceBlock(devices.ana, blockId)).toEqual(server);
  expect(await deviceBlock(devices.eduardo, blockId)).toEqual(server);
  return server;
}

/** Eduardo syncs first, then Ana, then Eduardo again: both tablets hold the whole log. */
async function syncAll(devices: Devices): Promise<void> {
  await devices.eduardo.context.setOffline(false);
  await syncNow(devices.eduardo.page);
  await devices.ana.context.setOffline(false);
  await syncNow(devices.ana.page);
  await syncNow(devices.eduardo.page);
}

/** C by Eduardo against NA by Ana on SEC-C12's item 10, both offline, then synced: a contradiction. */
async function checklistContradiction(devices: Devices, relatorioId: string, blockId: string): Promise<{ e: OutboxOp; a: OutboxOp }> {
  const path = `sheet/${blockId}/checklist/${ITEM}/result`;
  for (const device of [devices.eduardo, devices.ana]) {
    await openSheet(device.page, relatorioId, blockId);
    await device.context.setOffline(true);
  }
  await mark(rowOf(devices.eduardo.page, ITEM), 'Conforme');
  const e = await lastWritten(devices.eduardo, path);
  await mark(rowOf(devices.ana.page, ITEM), 'Não se aplica');
  const a = await lastWritten(devices.ana, path);
  await syncAll(devices);
  return { e, a };
}

test('@p0 10.2-E2E-001 two readings on one cell and NC/C on another item: the Banner, the badge and a view of that cell only; Esc writes nothing; "Aplicar" leaves the pick on both tablets and the server, the NC merge intact', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(300_000);
  const cell = (blockId: string) => `sheet/${blockId}/test/isolacao/cell/0/0`;
  const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed, (relatorioId, sheets) => [
    officeDraft(seed.companies[0], { relatorioId }, cell(sheets.find((s) => s.tag === 'SEC-C12')!.blockId), X_READING),
  ]);
  const { ana, eduardo } = devices;
  const resultPath = `sheet/${blockId}/checklist/${ITEM}/result`;
  try {
    for (const device of [eduardo, ana]) {
      await openSheet(device.page, relatorioId, blockId);
      await device.context.setOffline(true);
    }
    // Eduardo: 330 in the cell and item 10 NC. Ana, not having seen them: 3300 and item 10 C.
    await mark(rowOf(eduardo.page, ITEM), 'Não conforme');
    const eResult = await lastWritten(eduardo, resultPath);
    await stepper(eduardo.page).getByRole('button', { name: /^Ensaios,/ }).click();
    await typeReading(eduardo.page, '330');
    const eReading = await lastWritten(eduardo, cell(blockId));
    await mark(rowOf(ana.page, ITEM), 'Conforme');
    await stepper(ana.page).getByRole('button', { name: /^Ensaios,/ }).click();
    await typeReading(ana.page, '3300');
    const aReading = await lastWritten(ana, cell(blockId));
    // The commit stamped what each tablet saw of the cell (the office reading).
    expect(aReading.meta).toMatchObject({ standing_op_id: expect.any(String) });

    await syncAll(devices);

    // The server and both tablets: Ana's later reading shows, the cell holds Eduardo's; NC merged.
    const server = await expectConverged(devices, blockId);
    expect(server.sheet.test.isolacao?.cells['0']?.['0']).toMatchObject({ op_id: aReading.op_id, value: aReading.value, conflict: { op_id: eReading.op_id, value: eReading.value } });
    expect(server.sheet.checklist[ITEM]?.result).toMatchObject({ value: 'NC', op_id: eResult.op_id, merge: { rule: 'nc_over_c' } });

    // Ana's sheet: the conflict Banner (an alert) and the badge.
    await openSheet(ana.page, relatorioId, blockId);
    await expect(conflictBanner(ana.page)).toHaveAttribute('role', 'alert');
    await expect(conflictBanner(ana.page).locator('.banner-text')).toHaveText('SEC-C12: 1 célula em contradição');
    await expect(syncWord(ana.page)).toHaveText('Conflito');
    await expect(syncBadge(ana.page)).toHaveAttribute('data-state', 'conflict');

    // "Ver": a modal view of the one contradicting cell, two options, none picked.
    await conflictBanner(ana.page).getByRole('button', { name: 'Ver', exact: true }).click();
    const view = conflictView(ana.page);
    await expect(view).toBeVisible();
    await expect(view).toHaveAttribute('aria-modal', 'true');
    await expect(view.locator('.cv-cell')).toHaveCount(1);
    const group = view.getByRole('radiogroup');
    await expect(group).toHaveCount(1);
    await expect(group.getByRole('radio')).toHaveCount(2);
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(group.getByRole('radio').first()).toContainText('A minha');
    await expect(group.getByRole('radio').first()).toContainText('3.300');
    await expect(group.getByRole('radio').nth(1)).toContainText('A de Eduardo');
    await expect(group.getByRole('radio').nth(1)).toContainText('330');
    for (const option of await group.getByRole('radio').all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await expect(view.getByRole('button', { name: 'Aplicar' })).toHaveAttribute('aria-disabled', 'true');

    // Esc: closed, nothing written, the contradiction still there.
    const before = (await outbox(ana)).length;
    await ana.page.keyboard.press('Escape');
    await expect(view).toBeHidden();
    expect((await outbox(ana)).length).toBe(before);
    expect((await deviceBlock(ana, blockId)).sheet.test.isolacao?.cells['0']?.['0']?.conflict).toBeDefined();
    // "Voltar sem decidir" closes it the same way.
    await conflictBanner(ana.page).getByRole('button', { name: 'Ver', exact: true }).click();
    await view.getByRole('button', { name: 'Voltar sem decidir' }).click();
    await expect(view).toBeHidden();
    expect((await outbox(ana)).length).toBe(before);

    // Pick Eduardo's reading and apply: one put, the toast with "Desfazer".
    await conflictBanner(ana.page).getByRole('button', { name: 'Ver', exact: true }).click();
    await view.getByRole('radio', { name: /A de Eduardo/ }).click();
    await expect(view.getByRole('radio', { name: /A de Eduardo/ })).toHaveAttribute('aria-checked', 'true');
    await view.getByRole('button', { name: 'Aplicar' }).click();
    await expect(view).toBeHidden();
    await expect(toast(ana.page)).toContainText('Contradição resolvida — ficha mesclada');
    await expect(toast(ana.page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
    await expect(conflictBanner(ana.page)).toHaveCount(0);
    const pick = await lastWritten(ana, cell(blockId));
    expect(pick.value).toEqual(eReading.value);
    expect(pick.meta).toMatchObject({ standing_op_id: aReading.op_id });

    await syncNow(ana.page);
    await syncNow(eduardo.page);
    const after = await expectConverged(devices, blockId);
    expect(after.sheet.test.isolacao?.cells['0']?.['0']).toEqual({ value: eReading.value, source_suggestion_id: null, op_id: pick.op_id });
    expect(after.sheet.checklist[ITEM]?.result).toEqual(server.sheet.checklist[ITEM]?.result);
    await expect(syncWord(eduardo.page)).toHaveText('Sincronizado');
  } finally {
    await eduardo.context.close();
  }
});

test('@p0 10.2-E2E-002 the Sync status "Decisões" row of a contradiction opens the Conflict view and is gone once applied', async ({ page, browser, seed }) => {
  test.setTimeout(240_000);
  const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  try {
    const { e } = await checklistContradiction(devices, relatorioId, blockId);
    // `syncNow` leaves Eduardo on Sync status: his row, not live (no alert role).
    const row = decisionRows(eduardo.page);
    await expect(row).toHaveCount(1);
    await expect(row.locator('.banner-text')).toHaveText('SEC-C12: 1 célula em contradição');
    await expect(row).not.toHaveAttribute('role', 'alert');
    await row.getByRole('button', { name: 'Resolver' }).click();
    const view = conflictView(eduardo.page);
    await expect(view.getByRole('radiogroup')).toHaveCount(1);
    await view.getByRole('radio', { name: /A minha/ }).click();
    await view.getByRole('button', { name: 'Aplicar' }).click();
    await expect(view).toBeHidden();
    await expect(decisionRows(eduardo.page)).toHaveCount(0);
    await expect(eduardo.page.getByTestId('sync-decisions')).toHaveCount(0);

    await syncNow(eduardo.page);
    await syncNow(ana.page);
    const server = await expectConverged(devices, blockId);
    expect(server.sheet.checklist[ITEM]?.result).toMatchObject({ value: e.value });
    expect(server.sheet.checklist[ITEM]?.result?.conflict).toBeUndefined();
    await expect(decisionRows(ana.page)).toHaveCount(0);
  } finally {
    await eduardo.context.close();
  }
});

/** Eduardo removes SEC-C12 from the tree while Ana, not having seen it, marks its item 10; both sync. */
async function removedVersusEdited(devices: Devices, relatorioId: string, blockId: string): Promise<void> {
  await openTree(devices.eduardo.page, relatorioId);
  await openSheet(devices.ana.page, relatorioId, blockId);
  await devices.eduardo.context.setOffline(true);
  await devices.ana.context.setOffline(true);
  await removeFromTree(devices.eduardo.page, 'SEC-C12');
  const removal = await lastWritten(devices.eduardo, `block/${blockId}/removed_at`);
  expect(removal.meta).toEqual({ seen_modified_at: null });
  await mark(rowOf(devices.ana.page, ITEM), 'Conforme');
  await lastWritten(devices.ana, `sheet/${blockId}/checklist/${ITEM}/result`);
  await syncAll(devices);
}

for (const choice of ['Remover', 'Manter'] as const) {
  test(`@p0 10.3-E2E-00${choice === 'Remover' ? 1 : 2} removed on one tablet, edited on the other: the Sumário Banner, "Ver" shows both sides, "${choice}" settles it on both tablets and the server`, async ({
    page,
    browser,
    seed,
  }) => {
    test.setTimeout(300_000);
    const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed);
    const { ana, eduardo } = devices;
    try {
      await removedVersusEdited(devices, relatorioId, blockId);
      const marked = await expectConverged(devices, blockId);
      expect(marked.removed_at).not.toBeNull();
      expect(marked.removal_conflict).toMatchObject({ removed_by: eduardo.account.userId, edited_by: ana.account.userId });
      expect(marked.sheet.checklist[ITEM]?.result?.value).toBe('C');

      await expect(decisionRows(eduardo.page).locator('.banner-text')).toHaveText(['SEC-C12: removido por você, alterado por Ana']);
      // E10-Q4: a structure case is worded as a decision, never as a contradiction.
      await syncBadge(ana.page).click();
      await expect(ana.page.locator('main[data-route="/sync"] .sh-counts')).toContainText('1 decisão para resolver');
      await expect(ana.page.locator('main[data-route="/sync"] .sync-summary .sync-badge[data-state="conflict"]')).toHaveText('1 decisão');
      await ana.page.goto(`/relatorio/${relatorioId}`);
      const banner = conflictBanner(ana.page);
      await expect(banner).toHaveAttribute('role', 'alert');
      await expect(banner.locator('.banner-text')).toHaveText('SEC-C12: removido por Eduardo, alterado por você');
      await expect(banner.getByRole('button')).toHaveText(['Ver', 'Manter', 'Remover']);
      await expect(banner.getByRole('button', { name: 'Remover' })).toHaveAttribute('data-tone', 'red');
      await expect(syncWord(ana.page)).toHaveText('Conflito');

      await banner.getByRole('button', { name: 'Ver', exact: true }).click();
      const view = conflictView(ana.page);
      await expect(view.locator('.conflict-column')).toHaveCount(2);
      await expect(view.locator('.conflict-column-title').first()).toContainText('Removido por Eduardo');
      await expect(view.locator('.conflict-column-title').nth(1)).toContainText('Alterado por você');
      await ana.page.keyboard.press('Escape');
      await expect(view).toBeHidden();

      await banner.getByRole('button', { name: choice }).click();
      await expect(toast(ana.page)).toContainText(choice === 'Remover' ? 'SEC-C12 removido — a sua edição fica recuperável' : 'SEC-C12 mantido');
      await expect(conflictBanner(ana.page)).toHaveCount(0);

      await syncNow(ana.page);
      await syncNow(eduardo.page);
      const settled = await expectConverged(devices, blockId);
      expect(settled.removal_conflict).toBeUndefined();
      expect(settled.sheet.checklist[ITEM]?.result?.value).toBe('C');
      if (choice === 'Remover') {
        expect(settled.removed_at).not.toBeNull();
        expect(settled.removed_by).toBe(ana.account.userId);
      } else {
        expect(settled.removed_at).toBeNull();
        const equipmentId = settled.equipment_id!;
        expect(((await serverRow(ana.account.companyId, 'equipment', equipmentId)) as unknown as EquipmentRow).removed_at).toBeNull();
        for (const device of [ana, eduardo]) {
          expect((await entities<EquipmentRow>(device)).find((record) => record.id === equipmentId)!.row.removed_at).toBeNull();
        }
      }
      await expect(decisionRows(eduardo.page)).toHaveCount(0);
      await expect(syncWord(eduardo.page)).toHaveText('Sincronizado');
    } finally {
      await eduardo.context.close();
    }
  });
}

/** Opens the tree at 768 px, where "Adicionar bloco" opens the drawer palette (`tree.spec.ts` 4.5-E2E-001). */
async function openTreeForPalette(page: Page, relatorioId: string): Promise<void> {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openTree(page, relatorioId);
}

/** Adds a block of the palette item `tag` under Coluna 1 of the open tree. */
async function addBlock(page: Page, tag: string): Promise<void> {
  await page.getByRole('button', { name: 'Mais opções de Coluna 1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await palette.locator('button.palette-item.pf-field').filter({ has: page.locator('.pi-meta', { hasText: new RegExp(`^${tag}$`) }) }).click();
  await expect(palette).toBeHidden();
  await expect(page.locator('li.s9-eq .block-tag', { hasText: new RegExp(`^${tag}$`) })).toBeVisible();
}

test('@p0 10.3-E2E-003 the same TAG created on both tablets: the Sumário Banner and a Decisões row; "Manter as duas" renames the later one on both tablets and the server', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(300_000);
  const { devices, relatorioId } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  const tcRows = async (device: Device) =>
    (await entities<EquipmentRow>(device)).filter((record) => record.entity === 'equipment' && record.row.tag.startsWith('TC-C01')).map((record) => record.row);
  try {
    for (const device of [eduardo, ana]) {
      await openTreeForPalette(device.page, relatorioId);
      await device.context.setOffline(true);
      await addBlock(device.page, 'TC-C01');
    }
    const [eEquipment] = await tcRows(eduardo);
    const [aEquipment] = await tcRows(ana);
    expect([eEquipment!.tag, aEquipment!.tag]).toEqual(['TC-C01', 'TC-C01']);
    await syncAll(devices);

    await expect(decisionRows(eduardo.page).locator('.banner-text')).toHaveText(['TC-C01 foi criada em dois aparelhos']);
    await ana.page.goto(`/relatorio/${relatorioId}`);
    const banner = conflictBanner(ana.page);
    await expect(banner.locator('.banner-text')).toHaveText('TC-C01 foi criada em dois aparelhos');
    await expect(banner.getByRole('button')).toHaveText(['Renomear uma', 'Manter as duas']);
    // "Renomear uma" opens the rename dialog on the later one (Ana's, pushed second); Cancelar leaves it.
    await banner.getByRole('button', { name: 'Renomear uma' }).click();
    const rename = ana.page.getByRole('dialog', { name: 'Renomear TAG TC-C01' });
    await expect(rename).toBeVisible();
    await rename.getByRole('button', { name: 'Cancelar' }).click();
    await expect(rename).toBeHidden();

    await banner.getByRole('button', { name: 'Manter as duas' }).click();
    await expect(toast(ana.page)).toContainText('A sua ficha passou a TC-C01-2');
    await expect(conflictBanner(ana.page)).toHaveCount(0);

    await syncNow(ana.page);
    await syncNow(eduardo.page);
    const server = (await serverRow(ana.account.companyId, 'equipment', aEquipment!.id)) as unknown as EquipmentRow;
    expect(server.tag).toBe('TC-C01-2');
    expect(((await serverRow(ana.account.companyId, 'equipment', eEquipment!.id)) as unknown as EquipmentRow).tag).toBe('TC-C01');
    for (const device of [ana, eduardo]) {
      const rows = await tcRows(device);
      expect(rows.find((row) => row.id === aEquipment!.id)).toEqual(server);
      expect(rows.find((row) => row.id === eEquipment!.id)!.tag).toBe('TC-C01');
    }
    await expect(decisionRows(eduardo.page)).toHaveCount(0);
  } finally {
    await eduardo.context.close();
  }
});

test('@p0 10.3-E2E-006 the same TAG created on both tablets: "Renomear uma" from the Sync status row opens the Sumário rename dialog on the later one; saving renames it on both tablets and the server', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(300_000);
  const { devices, relatorioId } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  const tcRows = async (device: Device) =>
    (await entities<EquipmentRow>(device)).filter((record) => record.entity === 'equipment' && record.row.tag.startsWith('TC-C01')).map((record) => record.row);
  try {
    for (const device of [eduardo, ana]) {
      await openTreeForPalette(device.page, relatorioId);
      await device.context.setOffline(true);
      await addBlock(device.page, 'TC-C01');
    }
    const [eEquipment] = await tcRows(eduardo);
    const [aEquipment] = await tcRows(ana);
    await syncAll(devices);

    // Eduardo is on Sync status: "Renomear uma" leads to the Sumário, the dialog on the later one (Ana's).
    await eduardo.page.setViewportSize({ width: 1280, height: 900 });
    const row = decisionRows(eduardo.page);
    await expect(row.locator('.banner-text')).toHaveText('TC-C01 foi criada em dois aparelhos');
    await row.getByRole('button', { name: 'Renomear uma' }).click();
    await expect(eduardo.page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
    const rename = eduardo.page.getByRole('dialog', { name: 'Renomear TAG TC-C01' });
    await expect(rename).toBeVisible();
    await rename.getByRole('textbox', { name: 'TAG' }).fill('TC-C01-B');
    await rename.getByRole('button', { name: 'Salvar' }).click();
    await expect(rename).toBeHidden();
    await expect(conflictBanner(eduardo.page)).toHaveCount(0);

    await syncNow(eduardo.page);
    await expect(decisionRows(eduardo.page)).toHaveCount(0);
    await syncNow(ana.page);
    await expect(decisionRows(ana.page)).toHaveCount(0);
    const server = (await serverRow(ana.account.companyId, 'equipment', aEquipment!.id)) as unknown as EquipmentRow;
    expect(server.tag).toBe('TC-C01-B');
    for (const device of [ana, eduardo]) {
      const rows = await tcRows(device);
      expect(rows.find((equipment) => equipment.id === aEquipment!.id)).toEqual(server);
      expect(rows.find((equipment) => equipment.id === eEquipment!.id)!.tag).toBe('TC-C01');
    }
    await ana.page.goto(`/relatorio/${relatorioId}`);
    await expect(ana.page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible();
    await expect(conflictBanner(ana.page)).toHaveCount(0);
  } finally {
    await eduardo.context.close();
  }
});

test('@p1 10.3-E2E-004 a contradiction and a removal conflict at once: the badge says Conflito, the Banner ranks them, each resolves on its own; the view fits 390 px', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(360_000);
  const { devices, relatorioId, blockId, sheets } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  const other = { id: sheets.find((s) => s.tag === 'SEC-C01')!.blockId };
  const otherTag = 'SEC-C01';
  try {
    // A contradiction on SEC-C12, then SEC-C01 removed by Eduardo and edited by Ana.
    await checklistContradiction(devices, relatorioId, blockId);
    await openTree(eduardo.page, relatorioId);
    await openSheet(ana.page, relatorioId, other.id);
    await eduardo.context.setOffline(true);
    await ana.context.setOffline(true);
    await removeFromTree(eduardo.page, otherTag);
    await mark(rowOf(ana.page, ITEM), 'Conforme');
    await syncAll(devices);

    await expect(syncWord(ana.page)).toHaveText('Conflito');
    await expect(decisionRows(ana.page)).toHaveCount(2);
    await ana.page.goto(`/relatorio/${relatorioId}`);
    // The Sumário shows the structure decision; the contradiction waits in Sync status.
    await expect(conflictBanner(ana.page).locator('.banner-text')).toHaveText(`${otherTag}: removido por Eduardo, alterado por você`);

    // 390 px: the removal view's columns and the cell view's options stay inside their scroll containers.
    await ana.page.setViewportSize({ width: 390, height: 844 });
    await conflictBanner(ana.page).getByRole('button', { name: 'Ver', exact: true }).click();
    const removalView = ana.page.getByRole('dialog', { name: new RegExp(`^${otherTag}`) });
    await expect(removalView.locator('.conflict-columns')).toBeVisible();
    await expectFits(ana.page, ['.conflict-dialog .conflict-scroll', '.conflict-dialog .conflict-columns']);
    await ana.page.keyboard.press('Escape');
    await openSheet(ana.page, relatorioId, blockId);
    await conflictBanner(ana.page).getByRole('button', { name: 'Ver', exact: true }).click();
    const cellView = conflictView(ana.page);
    await expect(cellView.locator('.cv-pick')).toHaveCSS('grid-template-columns', /^\S+$/);
    const scroll = await cellView.locator('.conflict-scroll').boundingBox();
    for (const option of await cellView.locator('.cv-option').all()) {
      const box = (await option.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(scroll!.x);
      expect(box.x + box.width).toBeLessThanOrEqual(scroll!.x + scroll!.width + 0.5);
    }
    await expectFits(ana.page, ['.conflict-dialog .conflict-scroll', '.conflict-dialog .cv-pick']);
    await ana.page.keyboard.press('Escape');
    await ana.page.setViewportSize({ width: 1280, height: 900 });

    // Each resolves on its own: "Manter" in Sync status, then the cell through "Resolver".
    await syncBadge(ana.page).click();
    await decisionRows(ana.page).filter({ hasText: 'removido por' }).getByRole('button', { name: 'Manter' }).click();
    await expect(decisionRows(ana.page)).toHaveCount(1);
    await expect(syncWord(ana.page)).toHaveText('Conflito');
    await decisionRows(ana.page).getByRole('button', { name: 'Resolver' }).click();
    await conflictView(ana.page).getByRole('radio', { name: /A minha/ }).click();
    await conflictView(ana.page).getByRole('button', { name: 'Aplicar' }).click();
    await expect(decisionRows(ana.page)).toHaveCount(0);
    await syncNow(ana.page);
    await expect(syncWord(ana.page)).toHaveText('Sincronizado');
    await syncNow(eduardo.page);
    const kept = await expectConverged(devices, other.id);
    expect(kept.removed_at).toBeNull();
    expect(kept.removal_conflict).toBeUndefined();
    expect((await expectConverged(devices, blockId)).sheet.checklist[ITEM]?.result?.conflict).toBeUndefined();
  } finally {
    await eduardo.context.close();
  }
});

/** Each selector's element, and the page, scroll no wider than they are. */
async function expectFits(page: Page, selectors: readonly string[]): Promise<void> {
  for (const selector of selectors) {
    const fits = await page.locator(selector).first().evaluate((element) => element.scrollWidth <= element.clientWidth);
    expect(fits, `${selector} fits`).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test('@p1 10.3-E2E-005 a block added on the other tablet appears in the tree and is listed as information only', async ({ page, browser, seed }) => {
  test.setTimeout(240_000);
  const { devices, relatorioId } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  try {
    await openTreeForPalette(eduardo.page, relatorioId);
    await addBlock(eduardo.page, 'TP-C01');
    await syncNow(eduardo.page);
    await syncNow(ana.page);
    await expect(mergeRows(ana.page).filter({ hasText: 'Eduardo adicionou TP-C01 em Coluna 1' })).toHaveAttribute('data-rule', 'block_added');
    await expect(decisionRows(ana.page)).toHaveCount(0);
    await expect(syncWord(ana.page)).toHaveText('Sincronizado');
    await openTree(ana.page, relatorioId);
    await expect(ana.page.locator('li.s9-eq .block-tag', { hasText: /^TP-C01$/ })).toBeVisible();
  } finally {
    await eduardo.context.close();
  }
});

// --- E10-Q2: "Desfazer" after a resolution brings the decision back (contract 13) --------------

test('@p0 10.2-E2E-003 "Aplicar" then "Desfazer": the cell, its contradiction and each side\'s author come back on both tablets and the server; the Banner and the Decisões row return', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(300_000);
  const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  const path = `sheet/${blockId}/checklist/${ITEM}/result`;
  try {
    // Ana's NA pushed first, Eduardo's C second: his value shows, hers is the displaced side.
    for (const device of [eduardo, ana]) {
      await openSheet(device.page, relatorioId, blockId);
      await device.context.setOffline(true);
    }
    await mark(rowOf(ana.page, ITEM), 'Não se aplica');
    const a = await lastWritten(ana, path);
    await mark(rowOf(eduardo.page, ITEM), 'Conforme');
    const e = await lastWritten(eduardo, path);
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await syncNow(ana.page);
    const marked = await expectConverged(devices, blockId);
    expect(marked.sheet.checklist[ITEM]?.result).toMatchObject({ value: 'C', op_id: e.op_id, conflict: { op_id: a.op_id, value: 'NA' } });

    // Ana keeps her own NA, then undoes it from the toast.
    await openSheet(ana.page, relatorioId, blockId);
    await conflictBanner(ana.page).getByRole('button', { name: 'Ver', exact: true }).click();
    const view = conflictView(ana.page);
    // Eduardo's C shows (the standing side), Ana's NA is the displaced one.
    await expect(view.getByRole('radio', { name: /A de Eduardo/ })).toHaveAttribute('data-side', 'standing');
    await expect(view.getByRole('radio', { name: /A minha/ })).toHaveAttribute('data-side', 'displaced');
    await view.getByRole('radio', { name: /A minha/ }).click();
    await view.getByRole('button', { name: 'Aplicar' }).click();
    await expect(view).toBeHidden();
    await expect(conflictBanner(ana.page)).toHaveCount(0);
    const pick = await writtenAfter(ana, path, a.op_id);
    expect(pick.value).toBe('NA');
    await toast(ana.page).getByRole('button', { name: 'Desfazer' }).click();

    // The undo put carries the marks the pick cleared, and the cell is marked again on Ana's tablet.
    const undo = await writtenAfter(ana, path, pick.op_id);
    expect(undo.value).toBe('C');
    expect(undo.meta).toMatchObject({ restore: { conflict: { op_id: a.op_id, value: 'NA' }, shown_op_id: e.op_id } });
    await expect
      .poll(async () => (await deviceBlock(ana, blockId)).sheet.checklist[ITEM]?.result, { timeout: 15_000 })
      .toEqual({ value: 'C', source_suggestion_id: null, op_id: undo.op_id, shown_op_id: e.op_id, conflict: marked.sheet.checklist[ITEM]!.result!.conflict });
    await expect(conflictBanner(ana.page).locator('.banner-text')).toHaveText('SEC-C12: 1 célula em contradição');
    await expect(syncWord(ana.page)).toHaveText('Conflito');
    // The Conflict view names each side by its original author again (the value shown is
    // Eduardo's, although Ana's undo op wrote it back).
    await conflictBanner(ana.page).getByRole('button', { name: 'Ver', exact: true }).click();
    await expect(view.getByRole('radio')).toHaveCount(2);
    await expect(view.getByRole('radio', { name: /A de Eduardo/ })).toHaveAttribute('data-side', 'standing');
    await expect(view.getByRole('radio', { name: /A minha/ })).toHaveAttribute('data-side', 'displaced');
    await ana.page.keyboard.press('Escape');
    await expect(view).toBeHidden();

    await syncNow(ana.page);
    await syncNow(eduardo.page);
    const restored = await expectConverged(devices, blockId);
    expect(restored.sheet.checklist[ITEM]?.result).toEqual({ value: 'C', source_suggestion_id: null, op_id: undo.op_id, shown_op_id: e.op_id, conflict: marked.sheet.checklist[ITEM]!.result!.conflict });
    await expect(decisionRows(ana.page).locator('.banner-text')).toHaveText(['SEC-C12: 1 célula em contradição']);
    await expect(decisionRows(eduardo.page).locator('.banner-text')).toHaveText(['SEC-C12: 1 célula em contradição']);
    // Eduardo's view: his C is "A minha", Ana's NA is hers.
    await decisionRows(eduardo.page).getByRole('button', { name: 'Resolver' }).click();
    const eView = conflictView(eduardo.page);
    await expect(eView.getByRole('radio')).toHaveCount(2);
    await expect(eView.getByRole('radio', { name: /A minha/ })).toHaveAttribute('data-side', 'standing');
    await expect(eView.getByRole('radio', { name: /A de Ana/ })).toHaveAttribute('data-side', 'displaced');
    // Settle it again, so the worker's company holds no open decision for the specs after this one.
    await eView.getByRole('radio', { name: /A minha/ }).click();
    await eView.getByRole('button', { name: 'Aplicar' }).click();
    await expect(eView).toBeHidden();
    await syncNow(eduardo.page);
    await syncNow(ana.page);
    await expect(decisionRows(eduardo.page)).toHaveCount(0);
    await expect(decisionRows(ana.page)).toHaveCount(0);
    await expect(syncWord(ana.page)).not.toHaveText('Conflito');
  } finally {
    await eduardo.context.close();
  }
});

for (const choice of ['Manter', 'Remover'] as const) {
  test(`@p0 10.3-E2E-00${choice === 'Manter' ? 7 : 8} "${choice}" then "Desfazer" on a removed-versus-edited block: removed_at, removed_by and the mark come back on both tablets and the server; the Sumário Banner returns`, async ({
    page,
    browser,
    seed,
  }) => {
    test.setTimeout(300_000);
    const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed);
    const { ana, eduardo } = devices;
    try {
      await removedVersusEdited(devices, relatorioId, blockId);
      const marked = await expectConverged(devices, blockId);
      expect(marked.removal_conflict).toBeDefined();

      await ana.page.goto(`/relatorio/${relatorioId}`);
      const banner = conflictBanner(ana.page);
      await expect(banner.locator('.banner-text')).toHaveText('SEC-C12: removido por Eduardo, alterado por você');
      const removalPath = `block/${blockId}/removed_at`;
      await banner.getByRole('button', { name: choice }).click();
      await expect(conflictBanner(ana.page)).toHaveCount(0);
      const decision = await lastWritten(ana, removalPath);
      await toast(ana.page).getByRole('button', { name: 'Desfazer' }).click();

      const undo = await writtenAfter(ana, removalPath, decision.op_id);
      expect(undo.meta).toMatchObject({ restore: { removed_by: eduardo.account.userId, removal_conflict: marked.removal_conflict } });
      await expect
        .poll(async () => {
          const row = await deviceBlock(ana, blockId);
          return { removed_at: row.removed_at, removed_by: row.removed_by, removal_conflict: row.removal_conflict };
        }, { timeout: 15_000 })
        .toEqual({ removed_at: marked.removed_at, removed_by: marked.removed_by, removal_conflict: marked.removal_conflict });
      await expect(conflictBanner(ana.page).locator('.banner-text')).toHaveText('SEC-C12: removido por Eduardo, alterado por você');
      await expect(syncWord(ana.page)).toHaveText('Conflito');

      await syncNow(ana.page);
      await syncNow(eduardo.page);
      const restored = await expectConverged(devices, blockId);
      expect(restored.removed_at).toBe(marked.removed_at);
      expect(restored.removed_by).toBe(eduardo.account.userId);
      expect(restored.removal_conflict).toEqual(marked.removal_conflict);
      expect(restored.sheet.checklist[ITEM]?.result?.value).toBe('C');
      await expect(decisionRows(eduardo.page).locator('.banner-text')).toHaveText(['SEC-C12: removido por você, alterado por Ana']);
      await expect(decisionRows(ana.page).locator('.banner-text')).toHaveText(['SEC-C12: removido por Eduardo, alterado por você']);

      // Settle it again, so the worker's company holds no open decision for the specs after this one.
      await ana.page.goto(`/relatorio/${relatorioId}`);
      await conflictBanner(ana.page).getByRole('button', { name: choice }).click();
      await expect(conflictBanner(ana.page)).toHaveCount(0);
      await syncNow(ana.page);
      await syncNow(eduardo.page);
      await expect(decisionRows(ana.page)).toHaveCount(0);
      await expect(decisionRows(eduardo.page)).toHaveCount(0);
      await expect(syncWord(ana.page)).not.toHaveText('Conflito');
    } finally {
      await eduardo.context.close();
    }
  });
}

/** SEC-C12 complete from the office (plate, every item C, every reading within, the pair set), its text never confirmed. */
function completeSec12(seed: WorkerSeed, relatorioId: string, sheets: SeededSheet[]): OpDraft[] {
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
  const blockId = sheets.find((s) => s.tag === 'SEC-C12')!.blockId;
  const account = seed.companies[0];
  const scope = { relatorioId };
  const plate = (kind: string, unit: string | undefined, options: readonly string[] | undefined, key: string): unknown =>
    kind === 'number' ? { raw: '630', unit: unit ?? null, state: 'measured' } : kind === 'date' ? '2020-01-01' : kind === 'select' ? options![0] : kind === 'voltage_class' ? '15' : `P-${key}`;
  return [
    ...definition.nameplate.filter((f) => f.key !== 'tag').map((f) => officeDraft(account, scope, `sheet/${blockId}/nameplate/${f.key}`, plate(f.kind, f.unit, f.options, f.key))),
    ...definition.checklist!.map((item) => officeDraft(account, scope, `sheet/${blockId}/checklist/${item.key}/result`, 'C')),
    ...definition.tests
      .flatMap((t) => cellAddressesOf(definition, t.key))
      .map((c) =>
        officeDraft(account, scope, `sheet/${blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, c.testKey === 'isolacao' ? { raw: '150', unit: 'GΩ', state: 'measured' } : { raw: '100', unit: 'µΩ', state: 'measured' }),
      ),
    officeDraft(account, scope, `sheet/${blockId}/conclusion/result`, 'aprovado'),
    officeDraft(account, scope, `sheet/${blockId}/conclusion/restriction`, 'sem_restricoes'),
  ];
}

test('@p0 R8CONC-E2E-004 an edited conclusion text and a concurrent "Concluir e avançar": the edited text is the contradiction\'s other side, never lost; picking it restores it on both tablets and the server', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(300_000);
  const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed, (relatorioId, sheets) => completeSec12(seed, relatorioId, sheets));
  const { ana, eduardo } = devices;
  const textPath = `sheet/${blockId}/conclusion/text`;
  const statusPath = `sheet/${blockId}/conclusion/text_status`;
  try {
    for (const device of [eduardo, ana]) {
      await openSheet(device.page, relatorioId, blockId);
      await expect(device.page.getByTestId('ficha-progress')).toHaveText('Ficha completa');
      await device.context.setOffline(true);
    }
    // Eduardo: "Editar" on the composed text, his words typed after it.
    await stepper(eduardo.page).getByRole('button', { name: /^Conclusão,/ }).click();
    await eduardo.page.locator('.ficha-conc-text .suggestion-field.is-generated').getByRole('button', { name: 'Editar' }).click();
    await expect.poll(async () => (await lastWritten(eduardo, statusPath)).value).toBe('edited');
    const editor = eduardo.page.getByRole('textbox', { name: 'Texto da conclusão' });
    await expect(editor).toBeFocused();
    await eduardo.page.keyboard.press('ControlOrMeta+End');
    await eduardo.page.keyboard.type(' Texto de Eduardo.');
    await editor.blur();
    await expect.poll(async () => String((await lastWritten(eduardo, textPath)).value)).toMatch(/ Texto de Eduardo\.$/);
    const eText = await lastWritten(eduardo, textPath);

    // Ana, not having seen it: "Concluir e avançar" confirms the composed text in the conclude batch.
    await expect(ana.page.locator('#ficha-primary')).toHaveText(/Concluir e avançar/);
    await ana.page.locator('#ficha-primary').click();
    await expect(toast(ana.page)).toContainText('Ficha concluída');
    expect((await lastWritten(ana, statusPath)).value).toBe('confirmed');
    const aText = await lastWritten(ana, textPath);
    expect(aText.value).not.toBe(eText.value);

    await syncAll(devices);

    // Eduardo's edited text is never folded away: Ana's later text shows, his is the cell's conflict.
    const server = await expectConverged(devices, blockId);
    expect(server.sheet.conclusion.text).toMatchObject({ value: aText.value, conflict: { value: eText.value } });

    // Ana's Conflict view lists "Texto da conclusão"; Eduardo's side picked in every group and applied.
    await openSheet(ana.page, relatorioId, blockId);
    await conflictBanner(ana.page).getByRole('button', { name: 'Ver', exact: true }).click();
    const view = conflictView(ana.page);
    await expect(view).toBeVisible();
    await expect(view.locator('.cv-cell .cc-name', { hasText: 'Texto da conclusão' })).toHaveCount(1);
    for (const group of await view.getByRole('radiogroup').all()) {
      const theirs = group.getByRole('radio', { name: /A de Eduardo/ });
      await theirs.click();
      await expect(theirs).toHaveAttribute('aria-checked', 'true');
    }
    await view.getByRole('button', { name: 'Aplicar' }).click();
    await expect(view).toBeHidden();
    await expect(conflictBanner(ana.page)).toHaveCount(0);

    await syncNow(ana.page);
    await syncNow(eduardo.page);
    const after = await expectConverged(devices, blockId);
    expect(after.sheet.conclusion.text?.value).toBe(eText.value);
    expect(after.sheet.conclusion.text?.conflict).toBeUndefined();
    expect(after.sheet.conclusion.text_status?.value).toBe('edited');
  } finally {
    await eduardo.context.close();
  }
});
