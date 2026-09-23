import { buildSnapshot, relatorioSnapshotSchema, replay, serializeSnapshot, type Op } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * Story 3.7: the same replay-byte-equality pattern as `replay.integration.test.ts`, run
 * against the Porto Seguro fixture instead of `replay-small`. `file` rows carry company_id in
 * their value, so it is remapped the same way; every other id is already fixed by the
 * fixture and needs no remap since each test claims a fresh `companyId`.
 */

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://app:app@postgres:5432/app';

function remappedLog(log: readonly Op[], companyId: string): Op[] {
  return log.map((op) => {
    const value = op.kind === 'create' && op.path.startsWith('file/') ? { ...(op.value as Record<string, unknown>), company_id: companyId } : op.value;
    return { ...op, company_id: companyId, value, seq: undefined };
  });
}

const { sql, db } = createDb(databaseUrl);
const deps = { now, origin: 'server' as const };

// One pool for both describes below; closed here so it always closes regardless of which
// describe/test a `-t` filter runs (each describe's own afterAll only cleans its own rows).
afterAll(async () => {
  await sql.end();
});

describe('3.7-INT-001 Porto Seguro fixture replay byte-equality (Drizzle layer)', () => {
  const companyId = asCompanyId(newId());
  const log = remappedLog(portoSeguro.log, companyId);

  beforeAll(async () => {
    // Same reclaim-before-claim precaution as `replay.integration.test.ts`: the fixture's
    // op_ids are fixed for a deterministic golden, so a killed previous run's rows must be
    // reclaimed before this run's inserts, or every insert is rejected as `op_invalid`.
    await db.delete(ops).where(
      inArray(
        ops.op_id,
        log.map((op) => op.op_id),
      ),
    );
  });

  afterAll(async () => {
    await db.delete(entities).where(eq(entities.company_id, companyId));
    await db.delete(ops).where(eq(ops.company_id, companyId));
  });

  it(
    'applies all ~2500 ops with zero rejections and materializes the golden snapshot',
    async () => {
      const result = await applyOps(db, companyId, log, deps);
      expect(result.rejected).toEqual([]);
      expect(result.applied).toHaveLength(log.length);

      const drizzle = serializeSnapshot(await toSnapshot(db, companyId, portoSeguro.relatorioId));
      const pure = serializeSnapshot(buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId));
      expect(drizzle).toBe(pure);
      expect(drizzle).toBe(serializeSnapshot(relatorioSnapshotSchema.parse(portoSeguro.golden)));
    },
    // The fixture applies through ~2500 individual, per-op-transaction inserts (apply.ts's
    // own contract) against the compose Postgres, well past vitest's 5s default.
    60_000,
  );
});

describe('3.7-INT-002 Porto Seguro small fixture replay byte-equality (Drizzle layer)', () => {
  const companyId = asCompanyId(newId());
  const log = remappedLog(portoSeguroSmall.log, companyId);

  beforeAll(async () => {
    await db.delete(ops).where(
      inArray(
        ops.op_id,
        log.map((op) => op.op_id),
      ),
    );
  });

  afterAll(async () => {
    await db.delete(entities).where(eq(entities.company_id, companyId));
    await db.delete(ops).where(eq(ops.company_id, companyId));
  });

  it('applies the small fixture with zero rejections and materializes its own golden snapshot', async () => {
    const result = await applyOps(db, companyId, log, deps);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(log.length);

    const drizzle = serializeSnapshot(await toSnapshot(db, companyId, portoSeguroSmall.relatorioId));
    const pure = serializeSnapshot(buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId));
    expect(drizzle).toBe(pure);
    expect(drizzle).toBe(serializeSnapshot(relatorioSnapshotSchema.parse(portoSeguroSmall.golden)));
  });
});
