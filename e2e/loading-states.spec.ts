import type { Page, Route } from '@playwright/test';
import { PRODUTO } from '@app/domain';
import { deviceDatabaseName, expect, signIn, test, SEED_PASSWORD, type SeedAccount } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';

/*
 * Matheus, 2026-09-30: a loading screen never looks frozen (EXPERIENCE.md forbids a "Blank
 * screen or spinner with no words"). Driven as a person sees it: the document's own splash
 * while the bundle is held, a surface's "Carregando …" while its device read waits, and a
 * server-bound button that says it is waiting ("Entrando…", "Gerando…") while its request is
 * held. No request here reaches the document queue: the held generate is answered 503.
 */

let account: SeedAccount;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
});

/** A gate the test opens: requests routed through `hold` wait until `release()`. */
function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, release: () => open() };
}

test('@p1 the document says "Carregando PRODUTO…" while the bundle is held, and the app replaces it', async ({ page }) => {
  const held = gate();
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route: Route) => {
    await held.opened;
    await route.continue();
  });
  await page.goto('/login', { waitUntil: 'commit' });
  const splash = page.getByRole('status').filter({ hasText: `Carregando ${PRODUTO}…` });
  await expect(splash).toBeVisible();
  await expect(splash).toHaveClass('boot-splash');
  held.release();
  // The login form replaces the splash inside #root.
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.boot-splash')).toHaveCount(0);
});

/**
 * Holds the device store from a second tab of the same origin: a readwrite transaction on
 * `entities`, kept alive by a chain of reads until `window.__releaseStore()` there, so every
 * read of `entities` from the app's own tab waits behind it (a fresh document has no cached
 * query to answer from).
 */
async function holdDeviceStore(holder: Page, database: string): Promise<void> {
  await holder.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('entities', 'readwrite');
          const store = tx.objectStore('entities');
          let released = false;
          (window as unknown as { __releaseStore: () => void }).__releaseStore = () => {
            released = true;
          };
          const spin = () => {
            if (released) return;
            store.count().onsuccess = spin;
          };
          spin();
          tx.oncomplete = () => db.close();
          resolve();
        };
      }),
    database,
  );
}

test('@p1 Home says "Carregando relatórios…" while the device store has not answered, never its empty state', async ({ page, context }) => {
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  const holder = await context.newPage();
  await holder.goto('/sprite.svg');
  await holdDeviceStore(holder, deviceDatabaseName(account.userId));
  await page.bringToFront();
  await page.reload();
  const note = page.getByRole('status').filter({ hasText: 'Carregando relatórios…' });
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.home-empty')).toHaveCount(0);
  // No status tiles reading zero while the store has not answered.
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toHaveCount(0);
  await holder.evaluate(() => (window as unknown as { __releaseStore: () => void }).__releaseStore());
  await expect(note).toHaveCount(0);
  await expect(page.locator('.home-empty')).toHaveText('Nenhum relatório ainda.');
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await holder.close();
});

test('@p0 a waiting button says so: "Entrar" reads "Entrando…" while the sign-in is held, "Gerar relatório" reads "Gerando…" while the generate is held', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });

  // "Entrar": the sign-in request held at the network.
  const signingIn = gate();
  await page.route('**/api/auth/sign-in/email', async (route: Route) => {
    await signingIn.opened;
    await route.continue();
  });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Senha').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrando…' })).toBeVisible();
  signingIn.release();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 30_000 });
  await page.unroute('**/api/auth/sign-in/email');

  // "Gerar relatório": a relatório born on Home, its parecer set, the generate request held.
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await setParecer(page, relatorioId);
  const generating = gate();
  await page.route(`**/api/relatorios/${relatorioId}/generate`, async (route: Route) => {
    await generating.opened;
    // Never reaches the queue: the server "fails", and the dialog says so.
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'held by the test' }) });
  });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const primary = dialog.locator('.generate-row .btn-primary');
  await expect(primary).toHaveText('Gerar relatório');
  await primary.click();
  // F-03 (D1): the new relatório's sheets are empty, so the issue is confirmed first.
  await confirmIssue(dialog);
  await expect(primary).toHaveText('Gerando…', { timeout: 30_000 });
  await expect(primary).toHaveAttribute('aria-disabled', 'true');
  generating.release();
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível gerar o relatório.', { timeout: 30_000 });
  await expect(primary).toHaveText('Gerar relatório');
});
