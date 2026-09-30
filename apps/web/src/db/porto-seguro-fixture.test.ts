// @vitest-environment node
import 'fake-indexeddb/auto';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { relatorioSnapshotSchema, serializeSnapshot } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from './schema.ts';
import { toSnapshot } from './snapshot.ts';
import { applyPulled } from './sync-store.ts';

/*
 * Story 3.7: "loads into ... Dexie ... for every test that names the Porto Seguro fixture" --
 * satisfied at least once end to end here, for both the full fixture and the small one.
 */

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966c0-000a-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

describe('Porto Seguro fixture loads into Dexie', () => {
  it('applyPulled(db, portoSeguroSmall.log) resolves without throwing and every row reads back', async () => {
    const db = await freshDb();
    await expect(applyPulled(db, portoSeguroSmall.log)).resolves.toBeUndefined();

    const relatorio = await db.entities.get(['relatorio', portoSeguroSmall.relatorioId]);
    expect(relatorio).toBeDefined();
    const blocks = await db.entities.where('entity').equals('block').toArray();
    expect(blocks).toHaveLength(3);
    const equipment = await db.entities.where('entity').equals('equipment').toArray();
    expect(equipment).toHaveLength(3);
    const locations = await db.entities.where('entity').equals('location').toArray();
    expect(locations).toHaveLength(1);
  });

  it('applyPulled(db, portoSeguro.log) resolves without throwing, the full 94-block relatorio reads back, and toSnapshot is the golden byte for byte (audit 1.4)', async () => {
    const db = await freshDb();
    await expect(applyPulled(db, portoSeguro.log)).resolves.toBeUndefined();
    // Audit 2026-09-30 item 1.4: the device's snapshot of the pulled log serializes exactly as
    // the committed golden (`snapshot.golden.json`), as the kernel's replay does.
    const golden = serializeSnapshot(relatorioSnapshotSchema.parse(portoSeguro.golden));
    expect(serializeSnapshot(await toSnapshot(db, portoSeguro.relatorioId))).toBe(golden);

    const relatorio = await db.entities.get(['relatorio', portoSeguro.relatorioId]);
    expect(relatorio).toBeDefined();
    const blocks = await db.entities.where('entity').equals('block').toArray();
    expect(blocks).toHaveLength(94);
    const equipment = await db.entities.where('entity').equals('equipment').toArray();
    expect(equipment).toHaveLength(94);
    const locations = await db.entities.where('entity').equals('location').toArray();
    expect(locations).toHaveLength(23);
    const files = await db.entities.where('entity').equals('file').toArray();
    expect(files).toHaveLength(82);
    const points = await db.entities.where('entity').equals('point').toArray();
    expect(points).toHaveLength(7);
    const registry = await db.entities.where('entity').equals('registry').toArray();
    // 1 empresa + 1 client + 3 instruments.
    expect(registry).toHaveLength(5);
    // 3841 ops through fake-indexeddb: well under a minute, whatever else the machine runs.
  }, 60_000);
});
