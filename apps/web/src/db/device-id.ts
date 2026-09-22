import type { NewId } from '@app/domain';
import { DEVICE_ID_PREF, type AppDatabase } from './schema.ts';

/**
 * This device's id, minted once and kept in `local_prefs`. Every committed op carries it
 * (`commitBatch` stamps it, AD-3), and the server's `last_push_at` register is keyed by it.
 */
export async function deviceId(db: AppDatabase, newId: NewId): Promise<string> {
  return db.transaction('rw', db.local_prefs, async () => {
    const existing = await db.local_prefs.get(DEVICE_ID_PREF);
    if (typeof existing?.value === 'string' && existing.value !== '') return existing.value;
    const minted = newId();
    await db.local_prefs.put({ key: DEVICE_ID_PREF, value: minted });
    return minted;
  });
}
