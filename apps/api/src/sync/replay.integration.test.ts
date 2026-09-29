import {
  applyOp,
  buildSnapshot,
  canonicalJson,
  clearedMarks,
  entityKey,
  getDefinition,
  invertBatch,
  readPath,
  relatorioSnapshotSchema,
  replay,
  serializeSnapshot,
  stampSeen,
  type BlockRow,
  type JsonValue,
  type Op,
  type OpMeta,
  type RestoreMarks,
} from '@app/domain';
import { BLOCK_1_ID, PHOTO_ID, replaySmall } from '@app/domain/fixtures/replay-small';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

/** The ops the tests below append to the fixture, in order, for the pure replay they compare with. */
const priorExtras: Op[] = [];

describe('1.4-INT-001 replay byte-equality (Drizzle layer)', () => {
  beforeAll(async () => {
    // `op_id` is globally unique (`apply.ts`'s `ForeignOpIdError`: "an op_id that exists
    // under another company can never be inserted"), and this fixture reuses the same
    // fixed op_ids on every run (by design, for a deterministic golden snapshot). A
    // previous run of this exact test that was killed before its own `afterAll` -- a
    // network interruption, a container restart -- leaves those op_ids permanently owned
    // by an abandoned company, which would reject every future run's inserts as
    // `op_invalid` even though nothing is actually wrong with this run's ops. Reclaim the
    // fixture's own op_ids from wherever they currently are before this run claims them.
    await db.delete(ops).where(inArray(ops.op_id, log.map((op) => op.op_id)));
  });

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

  // After the op count above, and before the caption edit below breaks the equality with the pure replay.
  it('reads the company\'s user rows: the responsible and a second user who edited a sheet (Story 7.1), byte-equal to the pure replay', async () => {
    const editorId = newId();
    const server = { scope: 'company' as const, company_id: companyId, project_id: null, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, actor_id: 'system:identity', device_id: 'server' };
    const user = (id: string, name: string): Op => ({
      ...server,
      op_id: newId(),
      kind: 'create',
      path: `user/${id}`,
      value: { id, name, email: `${id}@teste.local`, council: null, registration_number: null, title: null, photo_location_enabled: true },
      client_ts: now().toISOString(),
    });
    const users = [user(replaySmall.userId, 'Ana Alves'), user(editorId, 'Bruno Silva')];
    const edit: Op = {
      ...server,
      op_id: newId(),
      kind: 'put',
      scope: 'relatorio',
      relatorio_id: replaySmall.relatorioId,
      path: `sheet/${BLOCK_1_ID}/observations`,
      value: 'Editado por outro usuário.',
      actor_id: editorId,
      device_id: 'tablet-b',
      client_ts: now().toISOString(),
    };
    const result = await applyOps(db, companyId, [...users, edit], deps);
    expect(result.rejected).toEqual([]);
    priorExtras.push(...users, edit);

    const snapshot = await toSnapshot(db, companyId, replaySmall.relatorioId);
    expect(snapshot.responsible?.id).toBe(replaySmall.userId);
    expect(snapshot.blocks.find((block) => block.id === BLOCK_1_ID)?.last_modified_by).toBe(editorId);
    // The editor is not the responsible, and still comes back with the snapshot.
    expect(editorId).not.toBe(replaySmall.userId);
    expect(snapshot.actors.find((row) => row.id === editorId)?.name).toBe('Bruno Silva');
    const pure = buildSnapshot(replay([...replaySmall.log, ...users, edit], { deadOpIds: dead }), replaySmall.relatorioId);
    expect(serializeSnapshot(snapshot)).toBe(serializeSnapshot(pure));
  });

  // Story 10.1: concurrent sheet puts from two devices merge in the fold on both layers.
  it('merges concurrent sheet puts by rule, byte-equal to the pure replay (Story 10.1)', async () => {
    const block = replaySmall.log.find((op) => op.kind === 'create' && op.path === `block/${BLOCK_1_ID}`)!.value as { seed_version: string; block_type: string };
    const itemKey = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).checklist![0]!.key;
    const device = (device_id: string, path: string, value: JsonValue, prev_op_id: string | null = null): Op => ({
      op_id: newId(),
      kind: 'put',
      scope: 'relatorio',
      company_id: companyId,
      project_id: null,
      relatorio_id: replaySmall.relatorioId,
      path,
      value,
      prev_op_id,
      batch_id: null,
      meta: null,
      actor_id: replaySmall.userId,
      device_id,
      client_ts: now().toISOString(),
    });
    const result = `sheet/${BLOCK_1_ID}/checklist/${itemKey}/result`;
    // The NC device saw whatever the log already held on the item: its write is sequential.
    const seen = [...replaySmall.log, ...priorExtras].filter((op) => op.path === result).at(-1)?.op_id ?? null;
    const nc = device('tablet-nc', result, 'NC', seen);
    const c = device('tablet-c', result, 'C');
    // The fixture's last fabricacao is 'WEG S.A.'; a device that never saw it clears it.
    const cleared = device('tablet-c', `sheet/${BLOCK_1_ID}/nameplate/fabricacao`, null);
    const pair = [nc, c, cleared];
    const applied = await applyOps(db, companyId, pair, deps);
    expect(applied.rejected).toEqual([]);
    expect(applied.superseded.map((s) => s.op_id).sort()).toEqual([c.op_id, cleared.op_id].sort());

    const snapshot = await toSnapshot(db, companyId, replaySmall.relatorioId);
    const sheet = snapshot.blocks.find((row) => row.id === BLOCK_1_ID)!.sheet;
    expect(sheet.checklist[itemKey]?.result).toMatchObject({ value: 'NC', op_id: nc.op_id, merge: { head_op_id: c.op_id, kept: true, rule: 'nc_over_c' } });
    expect(sheet.nameplate.fabricacao).toMatchObject({ value: 'WEG S.A.', merge: { head_op_id: cleared.op_id, kept: true, rule: 'filled_over_empty' } });
    const pure = buildSnapshot(replay([...replaySmall.log, ...priorExtras, ...pair], { deadOpIds: dead }), replaySmall.relatorioId);
    expect(serializeSnapshot(snapshot)).toBe(serializeSnapshot(pure));
    priorExtras.push(...pair);
  });

  // E10-Q2 (contract 13): the undo of a resolution carries the marks back (`meta.restore`),
  // and both layers fold it to the same rows.
  it('undoes "Aplicar" and "Manter" with the marks restored, byte-equal to the pure replay (E10-Q2)', async () => {
    const block = replaySmall.log.find((op) => op.kind === 'create' && op.path === `block/${BLOCK_1_ID}`)!.value as { seed_version: string; block_type: string };
    const itemKey = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).checklist![1]!.key;
    const result = `sheet/${BLOCK_1_ID}/checklist/${itemKey}/result`;
    const removedAt = `block/${BLOCK_1_ID}/removed_at`;
    const device = (device_id: string, kind: 'put' | 'remove', path: string, value: JsonValue, prev_op_id: string | null, meta: OpMeta | null, batch_id: string | null = null): Op => ({
      op_id: newId(),
      kind,
      scope: 'relatorio',
      company_id: companyId,
      project_id: null,
      relatorio_id: replaySmall.relatorioId,
      path,
      value,
      prev_op_id,
      batch_id,
      meta,
      actor_id: replaySmall.userId,
      device_id,
      client_ts: now().toISOString(),
    });
    const logSoFar = (extra: readonly Op[]) => [...replaySmall.log, ...priorExtras, ...extra];
    const blockKey = entityKey('block', BLOCK_1_ID);
    const stateOf = (extra: readonly Op[]) => {
      const row = replay(logSoFar(extra), { deadOpIds: dead }).get(blockKey)!;
      return new Map([[blockKey, row]]);
    };
    /** The device's undo of one op: the kernel inverse with the value and marks it replaced. */
    const undo = (op: Op, extra: readonly Op[]): Op => {
      const state = stateOf(extra);
      const marks = clearedMarks(state, op, applyOp(state, op));
      expect(marks).toBeDefined();
      const [inverse] = invertBatch([op], new Map([[op.op_id, readPath(state, op)]]), { newId, now: now() }, new Map<string, RestoreMarks>([[op.op_id, marks!]]));
      // Stamped as `commit.ts` stamps it, from the rows after the resolution.
      return stampSeen(inverse!, applyOp(state, op));
    };

    // A contradiction (C against NA over the same head), then "Aplicar" and its undo.
    const head = logSoFar([]).filter((op) => op.path === result).at(-1)?.op_id ?? null;
    const e = device('tablet-e', 'put', result, 'C', head, null);
    const a = device('tablet-a', 'put', result, 'NA', head, null);
    const pick = device('tablet-a', 'put', result, 'C', a.op_id, { standing_op_id: a.op_id, seen_conflict_op_id: e.op_id }, newId());
    const undoPick = undo(pick, [e, a]);
    const cellOps = [e, a, pick, undoPick];

    // A removal that did not see the latest edit, then "Manter" and its undo.
    const before = stateOf(cellOps).get(blockKey) as BlockRow;
    const removal = device('tablet-e', 'remove', removedAt, null, null, { seen_modified_at: null });
    const afterRemoval = applyOp(stateOf(cellOps), removal).get(blockKey) as BlockRow;
    expect(before.last_modified_at).not.toBeNull();
    const keep = device('tablet-a', 'put', removedAt, null, removal.op_id, { seen_modified_at: afterRemoval.last_modified_at }, newId());
    const undoKeep = undo(keep, [...cellOps, removal]);
    const extras = [...cellOps, removal, keep, undoKeep];

    const applied = await applyOps(db, companyId, extras, deps);
    expect(applied.rejected).toEqual([]);
    // The block ends removed, so it is read from `entities` (the snapshot lists live blocks).
    const [stored] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), eq(entities.id, BLOCK_1_ID)));
    const row = stored!.row as BlockRow;
    expect(row.sheet.checklist[itemKey]?.result).toEqual({
      value: 'NA',
      source_suggestion_id: null,
      op_id: undoPick.op_id,
      shown_op_id: a.op_id,
      conflict: { op_id: e.op_id, value: 'C', source_suggestion_id: null },
    });
    expect(row.removed_at).toBe(removal.client_ts);
    expect(row.removal_conflict).toEqual(afterRemoval.removal_conflict);
    expect(row.removed_by).toBe(replaySmall.userId);
    const pureState = replay(logSoFar(extras), { deadOpIds: dead });
    expect(canonicalJson(row)).toBe(canonicalJson(pureState.get(blockKey)));
    const snapshot = await toSnapshot(db, companyId, replaySmall.relatorioId);
    expect(serializeSnapshot(snapshot)).toBe(serializeSnapshot(buildSnapshot(pureState, replaySmall.relatorioId)));
    priorExtras.push(...extras);
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
