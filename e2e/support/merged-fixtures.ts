import { expect, test as base, type Page } from '@playwright/test';
import { TEST_SEED } from '../../apps/api/src/db/test-seed.ts';

/**
 * Every spec imports `test` and `expect` from here, so a fixture added later reaches
 * the whole suite at once. The two seeded companies come from `scripts/seed-users.ts
 * --test`, which `global-setup.ts` runs before the first spec.
 */

export interface Fixtures {
  seed: typeof TEST_SEED;
}

export const test = base.extend<Fixtures>({
  seed: [TEST_SEED, { option: true }],
});

export { expect, TEST_SEED };

/** Fills the Login form and waits for Home. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(TEST_SEED.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
}

/** The name of this user's device database, exactly `releng-{user_id}`. */
export function deviceDatabaseName(userId: string): string {
  return `releng-${userId}`;
}

/** Writes one marker row (a local pref) into the device database, to prove it survives later. */
export async function writeLocalMarker(page: Page, database: string, id: string): Promise<void> {
  await page.evaluate(
    async ([name, key]) => {
      const open = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = open.transaction('local_prefs', 'readwrite');
        tx.objectStore('local_prefs').put({ key, value: { kind: 'relatorio' } });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      open.close();
    },
    [database, id] as const,
  );
}

/** Reads the marker row back, or null when the store or the database is gone. */
export async function readLocalMarker(
  page: Page,
  database: string,
  id: string,
): Promise<unknown | null> {
  return page.evaluate(
    async ([name, key]) => {
      const names = (await indexedDB.databases()).map((info) => info.name);
      if (!names.includes(name as string)) return null;
      const open = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!open.objectStoreNames.contains('local_prefs')) {
        open.close();
        return null;
      }
      const row = await new Promise<unknown>((resolve, reject) => {
        const request = open.transaction('local_prefs', 'readonly').objectStore('local_prefs').get(key as string);
        request.onsuccess = () =>
          resolve((request.result as { value?: unknown } | undefined)?.value ?? null);
        request.onerror = () => reject(request.error);
      });
      open.close();
      return row;
    },
    [database, id] as const,
  );
}

/** The object stores the device database declares. */
export async function readStoreNames(page: Page, database: string): Promise<string[]> {
  return page.evaluate(async (name) => {
    const open = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = [...open.objectStoreNames].sort();
    open.close();
    return stores;
  }, database);
}
