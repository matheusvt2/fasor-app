import { buildSnapshot, relatorioSnapshotSchema, replay, serializeSnapshot, type Op } from '@app/domain';
import { BLOCK_1_ID, PHOTO_ID, replaySmall } from '@app/domain/fixtures/replay-small';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';
import { toSnapshot } from './snapshot.ts';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://app:app@postgres:5432/app';
const companyId = asCompanyId(newId());
const dead = new Set(replaySmall.deadOpIds);

/** The fixture log for this test's fresh tenant (file rows carry company_id in their value). */
const log: Op[] = replaySmall.log.map((op) => {
  const value =
    op.kind === 'create' && op.path.startsWith('file/')
      ? { ...(op.value as Record<string, unknown>), company_id: companyId }
      : op.value;
  return { ...op, company_id: companyId, value, seq: undefined };
});
const live = log.filter((op) => !dead.has(op.op_id));

// The schema comes from the api's boot-time migrate(): the tools service starts only after api is healthy.
const { sql, db } = createDb(databaseUrl);

// The fixture log carries server-only ops (`device_id = server`, `system:*` actors), so it
// is applied as the server's own jobs would apply it; the client origin is covered by
// `sync.integration.test.ts`.
const deps = { now, origin: 'server' as const };

describe('1.4-INT-001 replay byte-equality (Drizzle layer)', () => {
  afterAll(async () => {
    await db.delete(entities).where(eq(entities.company_id, companyId));
    await db.delete(ops).where(eq(ops.company_id, companyId));
    await sql.end();
  });

  it('applies the small fixture in order and materializes the golden snapshot', async () => {
    const result = await applyOps(db, companyId, live, deps);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(live.map((op) => op.op_id));
    const seqs = result.applied.map((a) => a.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);

    const drizzle = serializeSnapshot(await toSnapshot(db, companyId, replaySmall.relatorioId));
    const pure = serializeSnapshot(buildSnapshot(replay(replaySmall.log, { deadOpIds: dead }), replaySmall.relatorioId));
    expect(drizzle).toBe(pure);
    expect(drizzle).toBe(serializeSnapshot(relatorioSnapshotSchema.parse(replaySmall.golden)));
  });

  it('reads timestamps back in the canonical UTC ISO form', async () => {
    const first = live[0]!;
    const [stored] = await db.select({ client_ts: ops.client_ts, received_at: ops.received_at }).from(ops).where(eq(ops.op_id, first.op_id));
    expect(stored?.client_ts).toBe(first.client_ts);
    expect(stored?.received_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returns the existing seq for a duplicate op_id and leaves the state unchanged', async () => {
    const before = serializeSnapshot(await toSnapshot(db, companyId, replaySmall.relatorioId));
    const first = await applyOps(db, companyId, live.slice(0, 3), deps);
    expect(first.rejected).toEqual([]);
    const original = await db.select({ seq: ops.seq, op_id: ops.op_id }).from(ops).where(eq(ops.company_id, companyId));
    for (const { op_id, seq } of first.applied) {
      expect(original.find((o) => o.op_id === op_id)?.seq).toBe(seq);
    }
    expect(original).toHaveLength(live.length);
    expect(serializeSnapshot(await toSnapshot(db, companyId, replaySmall.relatorioId))).toBe(before);
  });

  it('rejects by code without blocking the rest and never stores a rejected op', async () => {
    const template = live.find((op) => op.path === `file/${PHOTO_ID}/caption`)!;
    const unknownPath = { ...template, op_id: newId(), path: `file/${PHOTO_ID}/colour`, value: 'x' };
    const serverOnly = { ...template, op_id: newId(), path: `file/${PHOTO_ID}/uploaded_at`, value: template.client_ts };
    const malformed = { ...template, op_id: newId(), client_ts: 'yesterday' };
    const otherTenant = { ...template, op_id: newId(), company_id: newId() };
    const badValue = { ...template, op_id: newId(), path: `block/${BLOCK_1_ID}/order_key`, value: 42 };
    const fine = { ...template, op_id: newId(), value: 'Placa do disjuntor' };

    const result = await applyOps(db, companyId, [unknownPath, serverOnly, malformed, otherTenant, badValue, fine], deps);
    expect(result.rejected).toEqual([
      { op_id: unknownPath.op_id, code: 'op_path_unknown' },
      { op_id: serverOnly.op_id, code: 'op_server_only' },
      { op_id: malformed.op_id, code: 'op_invalid' },
      { op_id: otherTenant.op_id, code: 'op_tenant_mismatch' },
      { op_id: badValue.op_id, code: 'op_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([fine.op_id]);
    const stored = await db.select({ op_id: ops.op_id }).from(ops).where(eq(ops.company_id, companyId));
    const ids = new Set(stored.map((s) => s.op_id));
    for (const rejected of result.rejected) expect(ids.has(rejected.op_id)).toBe(false);
    expect(ids.has(fine.op_id)).toBe(true);
  });

  it('takes the tenant only as a branded CompanyId (AD-10)', () => {
    // Declared and never called: `pnpm static` fails if either line ever typechecks,
    // because each @ts-expect-error would then be unused.
    const plainStringMustNotCompile = () => {
      // @ts-expect-error applyOps needs the CompanyId the session resolved, not a string
      void applyOps(db, String(companyId), [], deps);
      // @ts-expect-error toSnapshot is tenant-scoped the same way
      void toSnapshot(db, String(companyId), replaySmall.relatorioId);
    };
    void plainStringMustNotCompile;
  });
});
