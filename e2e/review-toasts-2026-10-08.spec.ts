import type { Locator, Page } from '@playwright/test';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { holdPhotoBytes, READING_ACTOR } from './support/reading-ops.ts';

/*
 * Review fixes 2026-10-08, batch r8emit (`spec-review-fixes-2026-10-08-emission.md`): toasts
 * that never cover the field or the rows they stand over (H-7, DE-6), and reading arrivals that
 * announce only what the screen does not already draw, caption rows apart, and leave once
 * served (DC-4, merging DB-5, DE-5, DG-3). Driven as the engineer drives them; a reading
 * lands as the job writes it (a server `suggestion` create) and is pulled by a cycle the page
 * starts on its own (`online`), so the screen it lands on stays the one on show.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface EntityRecord<T = Record<string, unknown>> {
  entity: string;
  id: string;
  row: T;
}

const toast = (page: Page) => page.getByTestId('toast');
const strip = (page: Page) => page.getByRole('region', { name: /^Fotos da ficha \(\d+\)$/ });
const stripRows = (page: Page) => strip(page).locator('.photo-list > .photo-row');
const galleryItems = (page: Page) => page.locator('[data-route="/relatorio/:id/fotos"] .gallery-item');
const nameplateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');

/** A sync cycle the page runs by itself (the `online` event), leaving the screen as it is. */
async function pullHere(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

/** Whether the device holds every suggestion of `ids`. */
async function holds(page: Page, ids: readonly string[]): Promise<boolean> {
  const stored = new Set((await entities(page)).filter((record) => record.entity === 'suggestion').map((record) => record.id));
  return ids.every((id) => stored.has(id));
}

/**
 * Runs sync cycles from the page (the `online` event, sent again while a cycle already running
 * ignores it) until the device holds every suggestion of `ids`.
 */
async function pullUntilLanded(page: Page, ...ids: string[]): Promise<void> {
  await expect
    .poll(
      async () => {
        if (await holds(page, ids)) return true;
        await pullHere(page);
        return holds(page, ids);
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
}

/** Records, in the page, every text a toast shows from now on (consecutive repeats once). */
async function recordToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window as unknown as { __r8eToasts: string[] };
    store.__r8eToasts = [];
    const seen = () => {
      const text = document.querySelector('[data-testid="toast"] > span')?.textContent ?? null;
      const list = store.__r8eToasts;
      if (text !== null && list[list.length - 1] !== text) list.push(text);
    };
    new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, characterData: true });
    seen();
  });
}

const recordedToasts = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __r8eToasts?: string[] }).__r8eToasts ?? []);

/** An in-app navigation (no reload, so the device keeps what it has seen), as a link does. */
async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/** Another live Chave seccionadora of the relatório than `blockId`. */
async function otherChave(page: Page, relatorioId: string, blockId: string): Promise<string> {
  const blocks = (await entities<{ block_type?: string; relatorio_id?: string; removed_at?: string | null }>(page)).filter(
    (record) => record.entity === 'block' && record.row.block_type === 'chave_seccionadora' && record.row.relatorio_id === relatorioId && record.row.removed_at === null && record.id !== blockId,
  );
  expect(blocks.length).toBeGreaterThan(0);
  return blocks[0]!.id;
}

/** "Adicionar fotos" on the sheet: `n` files through the picker, saved to this sheet with its caption. */
async function addSheetPhotos(page: Page, n: number): Promise<void> {
  const before = (await devicePhotos(page, database)).length;
  const files = await Promise.all(Array.from({ length: n }, (_, i) => plainJpeg(page, `r8e-${i}.jpg`)));
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles(files);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(which).toBeVisible();
  await which.getByRole('button', { name: `Adicionar ${n} fotos` }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 30_000 }).toBe(before + n);
}

/** Opens `tile` in the viewer and removes it there: the undo toast "Foto N removida do relatório · Desfazer" stays up. */
async function removeFromViewer(page: Page, tile: Locator): Promise<void> {
  await tile.click();
  const viewer = page.getByRole('dialog', { name: /^Foto \d+ de \d+$/ });
  await viewer.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog', { name: /^Remover a foto \d+ do relatório\?$/ }).getByRole('button', { name: 'Remover foto' }).click();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(toast(page)).toContainText(/^Foto \d+ removida do relatório/);
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
}

/** The viewer of the photo tapped opened; it is closed again. */
async function viewerOpened(page: Page): Promise<void> {
  await expect(page.getByRole('dialog', { name: /^Foto \d+ de \d+$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
}

/**
 * At the end of the page, the last row's centre is its own (not the toast's), and a tap there
 * acts (`acted`: by default the viewer of that photo opens). The page can still grow after a
 * navigation (thumbnails, the toast's room), so each poll scrolls to the end again, and the
 * check holds only once the centre is its own and above the toast's top edge at the same point
 * on two polls in a row. A room that never comes leaves the row covered, and the poll fails.
 */
async function lastRowClearOfToast(page: Page, last: Locator, acted: () => Promise<void> = () => viewerOpened(page)): Promise<void> {
  let centre = { x: 0, y: 0 };
  let previous = '';
  await expect
    .poll(
      async () => {
        // Any pass that does not see the row clear breaks the run of two.
        const notClear = (state: string): string => {
          previous = '';
          return state;
        };
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const atEnd = await page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1);
        if (!atEnd) return notClear('not at the end');
        if ((await toast(page).count()) === 0) return notClear('no toast');
        const box = await last.boundingBox({ timeout: 1_000 });
        const toastBox = await toast(page).boundingBox({ timeout: 1_000 });
        if (box === null) return notClear('no row');
        if (toastBox === null) return notClear('no toast');
        centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const own = await last.evaluate((row, at) => {
          const hit = document.elementFromPoint(at.x, at.y);
          return hit !== null && row.contains(hit) && hit.closest('[data-testid="toast"]') === null;
        }, centre);
        if (!own || centre.y >= toastBox.y) return notClear('covered');
        const at = `${centre.x},${centre.y},${toastBox.y}`;
        const settled = at === previous;
        previous = at;
        return settled ? 'own' : 'moving';
      },
      { message: 'the last row at the end of the page, its centre its own', timeout: 15_000 },
    )
    .toBe('own');
  const toastBox = (await toast(page).boundingBox())!;
  expect(centre.y).toBeLessThan(toastBox.y);
  await page.mouse.click(centre.x, centre.y);
  await acted();
}

test('@p0 R8E-E2E-003 at 390 px an undo toast leaves the last photo rows of the ficha strip and of the gallery reachable: their centres are not under it and a tap opens them', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId } = await openChaveSheet(page, account, database, { width: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  await addSheetPhotos(page, 7);
  await expect(stripRows(page)).toHaveCount(7);

  // The ficha strip: remove the first photo, the undo toast stays, the last row is still its own.
  await removeFromViewer(page, stripRows(page).first().getByRole('button', { name: /^Foto \d+, abrir$/ }));
  await expect(stripRows(page)).toHaveCount(6);
  await lastRowClearOfToast(page, stripRows(page).last().getByRole('button', { name: /^Foto \d+, abrir$/ }));
  await expect(toast(page)).toBeVisible();

  // The gallery: the same at the end of its grid.
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await expect(galleryItems(page)).toHaveCount(6);
  await removeFromViewer(page, page.getByRole('button', { name: 'Foto 1, abrir', exact: true }));
  await expect(galleryItems(page)).toHaveCount(5);
  await lastRowClearOfToast(page, galleryItems(page).last().getByRole('button', { name: /^Foto \d+, abrir$/ }));
  await expect(toast(page)).toBeVisible();

  // A page with no Sticky action bar (the tree at 390): its room after the content and its
  // scroll padding come from the toast alone. "Agrupar por tipo" leaves an undo toast up.
  await page.goto(`/relatorio/${relatorioId}/arvore`);
  const tree = page.getByRole('list', { name: 'Árvore do relatório' });
  await expect(tree).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-route="/relatorio/:id/arvore"] .sticky-action-bar')).toHaveCount(0);
  for (let expand = tree.getByRole('button', { name: /^Expandir / }); (await expand.count()) > 0; ) await expand.first().click();
  await tree.getByRole('button', { name: 'Mais opções de Cubículo Enel' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Agrupar por tipo na seção 9' }).or(page.getByRole('menuitem', { name: 'Agrupar por tipo na seção 9' })).click();
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
  await lastRowClearOfToast(page, tree.locator('button.tree-body').last(), async () => {
    await expect(page).toHaveURL(/\/ficha\/[0-9a-f-]{36}$/);
  });
});

test('@p0 R8E-E2E-004 a field focused where a toast appears scrolls clear of it: it ends fully above the toast\'s top edge, still focused', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database, { width: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  const other = await otherChave(page, relatorioId, blockId);
  const input = nameplateField(page, 'n_serie').locator('input');
  await input.focus();
  // The field sits just above the Sticky action bar, where the toast is about to show.
  await input.evaluate((element) => {
    const bar = document.querySelector('.sticky-action-bar')!.getBoundingClientRect();
    window.scrollBy(0, element.getBoundingClientRect().bottom - (bar.top - 8));
  });
  await expect(input).toBeFocused();

  // A reading for another sheet arrives while the engineer is on this field.
  const id = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${other}/nameplate/n_serie`, value: 'SN-R8E-004', actorId: READING_ACTOR });
  await pullUntilLanded(page, id);
  await expect(toast(page)).toContainText('1 leitura pronta para confirmar', { timeout: 30_000 });
  await expect(input).toBeFocused();
  await expect
    .poll(async () => {
      const field = (await input.boundingBox())!;
      const over = (await toast(page).boundingBox())!;
      return field.y + field.height <= over.y;
    })
    .toBe(true);
});

test('@p0 R8E-E2E-005 a reading for the open ficha announces nothing; one for another sheet does, its "Ver" opens that sheet and the toast is gone there', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, blockId: first } = await openChaveSheet(page, account, database);
  // The open ficha is the second Chave; the other sheet (the first Chave) comes before it in tree order.
  const open = await otherChave(page, relatorioId, first);
  await goInApp(page, `/relatorio/${relatorioId}/ficha/${open}`);
  await expect(page).toHaveURL(new RegExp(`/ficha/${open}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();

  // One pull brings two readings: the open ficha's own (drawn on it) and the other sheet's. The
  // toast counts one: the open ficha's reading is not announced.
  const own = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${open}/nameplate/n_serie`, value: 'SN-R8E-OWN', actorId: READING_ACTOR });
  const elsewhere = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${first}/nameplate/n_serie`, value: 'SN-R8E-OTHER', actorId: READING_ACTOR });
  await pullUntilLanded(page, own, elsewhere);
  await expect(toast(page)).toHaveText(/^1 leitura pronta para confirmar/, { timeout: 30_000 });
  await expect(nameplateField(page, 'n_serie').locator('.field.suggestion-field')).toBeVisible();

  // "Ver" leads to the first sheet in tree order with a pending suggestion, the other one, and the toast is gone there.
  await toast(page).getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/ficha/${first}$`));
  await expect(nameplateField(page, 'n_serie').locator('.field.suggestion-field')).toBeVisible({ timeout: 30_000 });
  await expect(toast(page)).toHaveCount(0);
});

/**
 * A "Geral" photo with no caption, its bytes held on the device (`holdPhotoBytes`, so no real
 * caption reading runs): the photo a caption suggestion is for. Added from the screen on show
 * (the ficha's or the gallery's "Adicionar fotos"), so no reload starts the device over.
 */
async function generalPhoto(page: Page): Promise<string> {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, 'r8e-geral.jpg')]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await which.getByRole('radio', { name: 'Geral (sem equipamento)' }).click();
  await which.getByRole('textbox', { name: 'Legenda da foto' }).clear();
  await which.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 30_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  expect(photo).toMatchObject({ block_id: null });
  expect(photo!.caption ?? '').toBe('');
  return photo!.id;
}

/** The device's row of suggestion `id`: still pending (a caption of a photo the device holds is never discarded as stale). */
async function suggestionStatus(page: Page, id: string): Promise<unknown> {
  return (await entities<{ status?: string }>(page)).find((record) => record.entity === 'suggestion' && record.id === id)?.row.status;
}

test('@p1 R8E-E2E-006 a caption-only arrival reads "N legendas sugeridas", never "leituras", and its "Ver" opens the gallery', async ({ page }) => {
  test.setTimeout(240_000);
  await holdPhotoBytes(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const photoId = await generalPhoto(page);
  const id = await pushSuggestion(account.companyId, relatorioId, { targetPath: `file/${photoId}/caption`, value: 'Vista geral do Cubículo Enel', photoId, actorId: READING_ACTOR });
  await pullUntilLanded(page, id);
  expect(await suggestionStatus(page, id)).toBe('pending');
  await expect(toast(page)).toHaveText(/^1 legenda sugerida/, { timeout: 30_000 });
  await expect(toast(page)).not.toContainText('leitura');
  await toast(page).getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/fotos$`));
  await expect(toast(page)).toHaveCount(0);
});

test('@p1 R8E-E2E-007 a caption arrival while the gallery is on screen announces nothing', async ({ page }) => {
  test.setTimeout(240_000);
  await holdPhotoBytes(page);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  const other = await otherChave(page, relatorioId, blockId);
  await goInApp(page, `/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  const photoId = await generalPhoto(page);
  await recordToasts(page);
  const id = await pushSuggestion(account.companyId, relatorioId, { targetPath: `file/${photoId}/caption`, value: 'Vista geral', photoId, actorId: READING_ACTOR });
  await pullUntilLanded(page, id);
  expect(await suggestionStatus(page, id)).toBe('pending');
  await expect(page.getByText('1 legenda sugerida').first()).toBeVisible();
  // A later cycle brings a reading for a sheet: its toast shows, and no caption toast came before it.
  const control = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${other}/nameplate/n_serie`, value: 'SN-R8E-007', actorId: READING_ACTOR });
  await pullUntilLanded(page, control);
  await expect(toast(page)).toHaveText(/^1 leitura pronta para confirmar/, { timeout: 30_000 });
  expect((await recordedToasts(page)).filter((text) => /legendas? sugeridas?|leituras? prontas?/.test(text))).toEqual(['1 leitura pronta para confirmar']);
});

test('@p0 R8E-E2E-009 on a ficha of a complete cabine that is not its first, the cabine block is collapsed: an env reading for the cabine is announced', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const cabine = (await entities<{ name?: string; kind?: string; relatorio_id?: string; env?: Record<string, unknown> }>(page)).find(
    (record) => record.entity === 'location' && record.row.kind === 'cabine' && record.row.name === 'Cubículo Enel' && record.row.relatorio_id === relatorioId,
  )!;
  const n = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
  const scope = { relatorioId };
  // The office completes the cabine; the open ficha (not the cabine's first) folds its block to one line.
  await pushDrafts(page, database, [
    officeDraft(account, scope, `location/${cabine.id}/se/type`, 'BLINDADA'),
    officeDraft(account, scope, `location/${cabine.id}/se/primary_kv`, n('13.8', 'kV')),
    officeDraft(account, scope, `location/${cabine.id}/se/secondary_kv`, n('380', 'V')),
    officeDraft(account, scope, `location/${cabine.id}/se/installed_kva`, n('1500', 'kVA')),
    officeDraft(account, scope, `location/${cabine.id}/env/temperature_c`, n('25', '°C')),
    officeDraft(account, scope, `location/${cabine.id}/env/humidity_pct`, n('60', '%')),
  ]);
  await expect
    .poll(
      async () => {
        await pullHere(page);
        return (await entities<{ env?: { humidity_pct?: unknown } }>(page)).find((record) => record.entity === 'location' && record.id === cabine.id)?.row.env?.humidity_pct != null;
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
  await expect(page.locator('.cabine-line')).toBeVisible({ timeout: 30_000 });

  // A thermo-hygrometer reading for the cabine: not drawn here, so it is announced.
  const id = await pushSuggestion(account.companyId, relatorioId, { targetPath: `location/${cabine.id}/env/temperature_c`, value: n('24', '°C'), actorId: READING_ACTOR });
  await pullUntilLanded(page, id);
  await expect(toast(page)).toHaveText(/^1 leitura pronta para confirmar/, { timeout: 30_000 });
});

test('@p0 R8E-E2E-010 at 390 px a plain toast that leaves while the page is at its end leaves the last row where it was', async ({ page }) => {
  test.setTimeout(240_000);
  // The bytes stay on the device: each row keeps one upload state, so nothing else moves the rows.
  await holdPhotoBytes(page);
  await openChaveSheet(page, account, database, { width: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  await addSheetPhotos(page, 4);
  // "4 fotos adicionadas — legenda aplicada": a plain toast, gone by itself after 6 s.
  await expect(toast(page)).toContainText('4 fotos adicionadas');
  await expect(toast(page).getByRole('button')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1)).toBe(true);
  const last = stripRows(page).last();
  const before = (await last.boundingBox())!.y;
  await expect(toast(page)).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => Math.abs((await last.boundingBox())!.y - before)).toBeLessThanOrEqual(1);
  // Still where it was a moment later (nothing dropped the room under the reader).
  expect(Math.abs((await last.boundingBox())!.y - before)).toBeLessThanOrEqual(1);
});
