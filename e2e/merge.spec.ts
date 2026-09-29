import { getDefinition, SEED_VERSION, type BlockRow, type OpDraft } from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { resetTestCompanyData, seedAccount } from '../apps/api/src/db/seed.ts';
import { colleagueContext } from './support/colleague.ts';
import { deviceDatabaseName, expect, SEED_PASSWORD, signIn, syncBadge, test, timed, type SeedAccount, type WorkerSeed } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, shoot } from './support/photos.ts';
import { holdPhotoBytes, serverRow } from './support/reading-ops.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { withSeedDb } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 10.1 (FR-58): two engineers of one company on one sheet, each on a tablet (two browser
 * contexts: Ana, this worker's Empresa A user, and her colleague Eduardo), both editing
 * offline, then "Sincronizar agora" on each (never the 60 s timer). The sheet merges by rule
 * in the fold on both devices and on the server; every @p0 asserts the committed cell in
 * IndexedDB on both devices and the server row, and the Sync status row on both.
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

interface Devices {
  ana: { page: Page; context: BrowserContext; account: SeedAccount; database: string };
  eduardo: { page: Page; context: BrowserContext; account: SeedAccount; database: string };
}

const ITEM = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora').checklist![9]!.key;
const X_READING = { raw: '3300', unit: 'GΩ', state: 'measured' } as const;

const rowOf = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const mergeRows = (page: Page) => page.getByTestId('sync-merge-row');

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

/**
 * Both devices signed in on one relatório of the standard template pushed from the office,
 * with `extra` office writes, each holding the relatório; returns the SEC-C12 sheet.
 */
async function twoDevices(
  page: Page,
  browser: Parameters<typeof colleagueContext>[0],
  seed: WorkerSeed,
  extra: (relatorioId: string, blockId: string) => OpDraft[] = () => [],
): Promise<{ devices: Devices; relatorioId: string; blockId: string }> {
  await resetEmpresaA(seed);
  const a = seed.companies[0];
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, a.email);
  const built = newRelatorioDrafts(a);
  const sheet = built.sheets.find((s) => s.tag === 'SEC-C12');
  expect(sheet, 'the standard template has SEC-C12').toBeDefined();
  const anaDb = deviceDatabaseName(a.userId);
  await pushDrafts(page, anaDb, [...built.drafts, ...extra(built.relatorioId, sheet!.blockId)]);
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
  return { devices, relatorioId: built.relatorioId, blockId: sheet!.blockId };
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** The block row this device holds in IndexedDB. */
async function deviceBlock(page: Page, database: string, blockId: string): Promise<BlockRow> {
  const records = await readStore<{ entity: string; id: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.id === blockId)!.row;
}

interface OutboxOp {
  op_id: string;
  path: string;
  value: unknown;
}
const outbox = (page: Page, database: string) => readStore<OutboxOp>(page, database, 'outbox');

/** The last op this device wrote on `path`. */
async function lastWritten(page: Page, database: string, path: string): Promise<OutboxOp> {
  let found: OutboxOp | undefined;
  await expect
    .poll(async () => {
      found = (await outbox(page, database)).filter((op) => op.path === path).at(-1);
      return found !== undefined;
    }, { timeout: 15_000 })
    .toBe(true);
  return found!;
}

async function mark(row: Locator, name: 'Conforme' | 'Não conforme'): Promise<void> {
  const radio = row.getByRole('radio', { name, exact: true });
  await radio.click();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
}

/** Types into a textarea and leaves it, so the field commits. */
async function typeAndLeave(page: Page, field: Locator, text: string): Promise<void> {
  await field.click();
  await page.keyboard.type(text);
  await field.blur();
}

/** Both devices' rows and the server's row of the block, once they converge: all three deep-equal. */
async function expectConverged(devices: Devices, companyId: string, blockId: string): Promise<BlockRow> {
  const server = (await serverRow(companyId, 'block', blockId)) as unknown as BlockRow;
  expect(await deviceBlock(devices.ana.page, devices.ana.database, blockId)).toEqual(server);
  expect(await deviceBlock(devices.eduardo.page, devices.eduardo.database, blockId)).toEqual(server);
  return server;
}

test('@p0 10.1-E2E-001 NC by Eduardo against C by Ana on item 10: NC stands with his observation and photo on both tablets and the server, Sync status says so, a reload clears it, and Ana tapping C again applies', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(300_000);
  const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  const resultPath = `sheet/${blockId}/checklist/${ITEM}/result`;
  const obsPath = `sheet/${blockId}/checklist/${ITEM}/observation`;
  try {
    await holdPhotoBytes(eduardo.page);
    await openSheet(eduardo.page, relatorioId, blockId);
    await openSheet(ana.page, relatorioId, blockId);
    await eduardo.context.setOffline(true);
    await ana.context.setOffline(true);

    // Eduardo, offline: item 10 NC, its observation and a photo from the row.
    const eRow = rowOf(eduardo.page, ITEM);
    await mark(eRow, 'Não conforme');
    await typeAndLeave(eduardo.page, eRow.getByRole('textbox', { name: 'Observação do item 10' }), 'Fusível com sinais de aquecimento');
    await eRow.getByRole('button', { name: 'Adicionar foto' }).click();
    const camera = await expectCameraOpen(eduardo.page);
    await shoot(eduardo.page, 1);
    await camera.getByRole('button', { name: 'Concluir fotos' }).click();
    await expect.poll(async () => (await devicePhotos(eduardo.page, eduardo.database)).length, { timeout: 15_000 }).toBe(1);
    const [photo] = await devicePhotos(eduardo.page, eduardo.database);
    const eResult = await lastWritten(eduardo.page, eduardo.database, resultPath);
    const eObs = await lastWritten(eduardo.page, eduardo.database, obsPath);
    expect(eObs.value).toBe('Fusível com sinais de aquecimento');

    // Ana, offline, never having seen it: item 10 C and an observation from the row's Overflow.
    const aRow = rowOf(ana.page, ITEM);
    await mark(aRow, 'Conforme');
    await aRow.getByRole('button', { name: /^Mais opções de / }).click();
    await ana.page.getByRole('menuitem', { name: 'Observação' }).click();
    await typeAndLeave(ana.page, aRow.getByRole('textbox', { name: 'Observação do item 10' }), 'Sem anomalias');
    await lastWritten(ana.page, ana.database, obsPath);

    // Eduardo syncs first, then Ana, then Eduardo again.
    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await syncNow(eduardo.page);

    // The committed cells: NC with Eduardo's op, his observation, on both tablets and the server.
    const server = await expectConverged(devices, ana.account.companyId, blockId);
    expect(server.sheet.checklist[ITEM]?.result).toMatchObject({ value: 'NC', op_id: eResult.op_id, merge: { rule: 'nc_over_c' } });
    expect(server.sheet.checklist[ITEM]?.observation).toMatchObject({ value: 'Fusível com sinais de aquecimento', op_id: eObs.op_id });
    // His photo is kept on the item, on Ana's tablet too.
    const anaPhotos = await devicePhotos(ana.page, ana.database);
    expect(anaPhotos.map((p) => ({ id: p.id, block_id: p.block_id, item_key: p.item_key, removed_at: p.removed_at }))).toEqual([
      { id: photo!.id, block_id: blockId, item_key: ITEM, removed_at: null },
    ]);

    // Sync status on both: the merge row, verbatim, among this session's merges.
    const verbatim = 'SEC-C12: item 10 NC de Eduardo (com foto) mesclado';
    for (const device of [ana, eduardo]) {
      await expect(mergeRows(device.page).locator('.sr-primary').filter({ hasText: verbatim })).toHaveCount(1);
      await expect(mergeRows(device.page)).toHaveCount(2);
      expect(await mergeRows(device.page).locator('.sr-primary').allTextContents()).toEqual(
        expect.arrayContaining([verbatim, 'SEC-C12: observação do item 10 de Eduardo mantida (NC vence C)']),
      );
    }

    // A reload clears the session's merge rows.
    await ana.page.reload();
    await syncBadge(ana.page).click();
    await expect(ana.page.getByRole('button', { name: 'Sincronizar agora' })).toBeVisible();
    await expect(mergeRows(ana.page)).toHaveCount(0);

    // Ana, having seen NC, taps C again: C applies on both tablets and the server, no new merge.
    await openSheet(ana.page, relatorioId, blockId);
    await expect(rowOf(ana.page, ITEM).getByRole('radio', { name: 'Não conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
    await mark(rowOf(ana.page, ITEM), 'Conforme');
    const again = await lastWritten(ana.page, ana.database, resultPath);
    await syncNow(ana.page);
    await syncNow(eduardo.page);
    const after = await expectConverged(devices, ana.account.companyId, blockId);
    expect(after.sheet.checklist[ITEM]?.result).toEqual({ value: 'C', source_suggestion_id: null, op_id: again.op_id });
    await expect(mergeRows(ana.page)).toHaveCount(0);
    await expect(mergeRows(eduardo.page)).toHaveCount(2);
  } finally {
    await eduardo.context.close();
  }
});

test('@p0 10.1-E2E-002 a reading typed by Eduardo against the same cell cleared by Ana: the filled reading stands on both tablets and the server', async ({ page, browser, seed }) => {
  test.setTimeout(240_000);
  const cell = (blockId: string) => `sheet/${blockId}/test/isolacao/cell/0/0`;
  const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed, (relatorioId, blockId) => [
    officeDraft(seed.companies[0], { relatorioId }, cell(blockId), X_READING),
  ]);
  const { ana, eduardo } = devices;
  try {
    for (const device of [eduardo, ana]) {
      await openSheet(device.page, relatorioId, blockId);
      await stepper(device.page).getByRole('button', { name: /^Ensaios,/ }).click();
      await expect(device.page.getByRole('textbox', { name: 'T1, Valor', exact: true })).toHaveValue('3.300');
      await device.context.setOffline(true);
    }

    // Eduardo types a reading over X; Ana, not having seen it, empties the cell.
    const eInput = eduardo.page.getByRole('textbox', { name: 'T1, Valor', exact: true });
    await eInput.click();
    await eduardo.page.keyboard.press('ControlOrMeta+A');
    await eduardo.page.keyboard.type('12,5');
    await eduardo.page.keyboard.press('Enter');
    const filled = await lastWritten(eduardo.page, eduardo.database, cell(blockId));
    expect(filled.value).toMatchObject({ raw: '12.5', state: 'measured' });
    const aInput = ana.page.getByRole('textbox', { name: 'T1, Valor', exact: true });
    await aInput.click();
    await ana.page.keyboard.press('ControlOrMeta+A');
    await ana.page.keyboard.press('Backspace');
    await aInput.blur();
    const cleared = await lastWritten(ana.page, ana.database, cell(blockId));
    expect(cleared.value).toBeNull();

    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await syncNow(eduardo.page);

    const server = await expectConverged(devices, ana.account.companyId, blockId);
    expect(server.sheet.test.isolacao?.cells['0']?.['0']).toMatchObject({ value: filled.value, op_id: filled.op_id, merge: { rule: 'filled_over_empty', kept: true } });
    for (const device of [ana, eduardo]) {
      await expect(mergeRows(device.page).filter({ has: device.page.locator('.sr-primary', { hasText: 'SEC-C12: valor de Eduardo mantido (preenchido vence vazio)' }) })).toHaveAttribute(
        'data-rule',
        'filled_over_empty',
      );
    }
  } finally {
    await eduardo.context.close();
  }
});

test('@p1 10.1-E2E-003 the sheet observations edited on both tablets: the later sync stands and Sync status keeps the other text readable', async ({ page, browser, seed }) => {
  test.setTimeout(240_000);
  const { devices, relatorioId, blockId } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  const path = `sheet/${blockId}/observations`;
  try {
    for (const device of [eduardo, ana]) {
      await openSheet(device.page, relatorioId, blockId);
      await stepper(device.page).getByRole('button', { name: /^Conclusão/ }).click();
      await device.context.setOffline(true);
    }
    await typeAndLeave(eduardo.page, eduardo.page.getByRole('textbox', { name: 'Observações da ficha' }), 'Versão do Eduardo');
    const eText = await lastWritten(eduardo.page, eduardo.database, path);
    await typeAndLeave(ana.page, ana.page.getByRole('textbox', { name: 'Observações da ficha' }), 'Versão da Ana');
    const aText = await lastWritten(ana.page, ana.database, path);

    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await syncNow(eduardo.page);

    const server = await expectConverged(devices, ana.account.companyId, blockId);
    expect(server.sheet.observations).toMatchObject({ value: aText.value, op_id: aText.op_id, merge: { rule: 'latest_text' } });
    for (const device of [ana, eduardo]) {
      const row = mergeRows(device.page).filter({ has: device.page.locator('.sr-primary', { hasText: 'SEC-C12: observações da ficha — versão de Ana' }) });
      await expect(row).toHaveAttribute('data-rule', 'latest_text');
      await expect(row).toContainText(`"${String(eText.value)}"`);
    }
  } finally {
    await eduardo.context.close();
  }
});

test('@p1 10.1-E2E-004 blocks added on each tablet are kept on both; the same block moved on both to different places: the later move stands and is listed', async ({ page, browser, seed }) => {
  test.setTimeout(240_000);
  const { devices, relatorioId } = await twoDevices(page, browser, seed);
  const { ana, eduardo } = devices;
  const tree = (p: Page) => p.getByRole('list', { name: 'Locais do relatório' });
  const coluna1 = (p: Page) => p.locator('li.s9-coluna').filter({ has: p.locator(':scope > .s9-col .s9-col-name', { hasText: /^Coluna 1$/ }) });
  const tagsIn = (p: Page) => coluna1(p).locator(':scope > .s9-eqs > li.s9-eq .block-tag');
  const eqRow = (p: Page, tag: string) => p.locator('li.s9-eq').filter({ has: p.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });
  const openColuna1 = async (p: Page) => {
    await p.goto(`/relatorio/${relatorioId}`);
    const chevron = p.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    await expect(tree(p)).toBeVisible();
    const expand = p.getByRole('button', { name: 'Expandir 1° Subsolo' });
    if ((await expand.count()) > 0) await expand.click();
    await expect(tagsIn(p)).toContainText(['SEC-C01']);
  };
  const addBlock = async (p: Page, tag: string, count: number) => {
    await p.getByRole('button', { name: 'Mais opções de Coluna 1', exact: true }).click();
    await p.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
    const palette = p.getByRole('dialog', { name: 'Adicionar bloco' });
    await palette.locator('button.palette-item.pf-field').filter({ has: p.locator('.pi-meta', { hasText: new RegExp(`^${tag}$`) }) }).click();
    await expect(palette).toBeHidden();
    await expect(eqRow(p, tag)).toBeVisible();
    await expect(tagsIn(p)).toHaveCount(count);
  };
  const moveLast = async (p: Page) => {
    const box = eqRow(p, 'SEC-C01').getByRole('textbox', { name: 'Posição de SEC-C01' });
    await box.fill('9');
    await box.press('Enter');
    await expect(tagsIn(p).last()).toHaveText('SEC-C01');
  };
  try {
    for (const device of [eduardo, ana]) {
      // The field palette (a right drawer) is the tablet one, at 768 (`tree.spec.ts` 4.5-E2E-001).
      await device.page.setViewportSize({ width: 768, height: 1024 });
      await openColuna1(device.page);
      await device.context.setOffline(true);
    }
    // Eduardo adds one block and moves SEC-C01 after it; Ana adds two and moves SEC-C01 after
    // both, so the two moves of the same block write different order keys (a same key would be
    // no merge at all).
    await addBlock(eduardo.page, 'TC-C01', 2);
    await moveLast(eduardo.page);
    await addBlock(ana.page, 'DJ-C01', 2);
    await addBlock(ana.page, 'TP-C01', 3);
    await moveLast(ana.page);
    const secId = (await eqRow(ana.page, 'SEC-C01').getAttribute('data-block-id'))!;
    const eMove = await lastWritten(eduardo.page, eduardo.database, `block/${secId}/order_key`);
    const aMove = await lastWritten(ana.page, ana.database, `block/${secId}/order_key`);
    expect(aMove.value).not.toEqual(eMove.value);

    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await syncNow(eduardo.page);

    // Both additions kept on both tablets; the later move (Ana's) stands everywhere.
    const server = await expectConverged(devices, ana.account.companyId, secId);
    expect(server.order_key).toBe(aMove.value);
    for (const device of [ana, eduardo]) {
      const row = mergeRows(device.page).filter({ has: device.page.locator('.sr-primary', { hasText: 'SEC-C01: alteração de Ana mantida (a mais recente prevalece)' }) });
      await expect(row).toHaveAttribute('data-rule', 'latest_edit');
      await openColuna1(device.page);
      // Every new block of both tablets is there; their relative order follows their order keys.
      await expect(tagsIn(device.page)).toHaveCount(4);
      expect(new Set(await tagsIn(device.page).allTextContents())).toEqual(new Set(['SEC-C01', 'DJ-C01', 'TP-C01', 'TC-C01']));
    }
  } finally {
    await eduardo.context.close();
  }
});
