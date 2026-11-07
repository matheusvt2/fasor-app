import { errorResponseSchema, findDefinition, RELATORIO_MAX_BYTES, relatorioBudgetRowBytes, SEED_VERSION, serializedBytes, SYNC_PUSH_MAX_BYTES, TEXT_CAPS, VALUE_MAX_BYTES, VALUE_MAX_ITEMS, type Entity } from '@app/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { entities } from '../db/schema.ts';
import { shortStringsOfBytes } from '@app/domain/fixtures/value-caps';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * Story 20.9 (contract 29, security pass S4): every op value has a size and a type the server
 * enforces, and the push body is capped at 4 MiB. Every push goes through `POST /api/sync/ops`
 * with a session of Empresa A's user. A refused op is never logged; stored rows are never touched.
 */

const h = routeHarness('tablet-value-rules');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

type RelatorioRowLike = { setup: { additional_info: string | null; site_altitude_m: number | null } };
type BlockRowLike = { sheet: { observations: { value: unknown } | null } };

describe('S4: a value outside its field\'s cap, type or range', () => {
  it('an additional_info of 20 001 characters is refused op_value_invalid; 20 000 are applied', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const put = (text: string) => h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/additional_info', relatorio_id: relatorioId, value: text });
    const over = put('x'.repeat(TEXT_CAPS.long + 1));
    const overResult = await h.push(companyA, [over]);
    expect(overResult.rejected).toEqual([{ op_id: over.op_id, code: 'op_value_invalid' }]);
    expect(await h.logged(over.op_id)).toBe(false);
    expect((await h.rowOf<RelatorioRowLike>(companyA, 'relatorio', relatorioId))?.setup.additional_info).toBeNull();

    const atCap = put('y'.repeat(TEXT_CAPS.long));
    expect((await h.push(companyA, [atCap])).rejected).toEqual([]);
    expect((await h.rowOf<RelatorioRowLike>(companyA, 'relatorio', relatorioId))?.setup.additional_info).toHaveLength(TEXT_CAPS.long);
  });

  it('sheet observations as an object and a site altitude of -99 999 m are refused; -500 m is applied', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const object = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: { texto: 'em objeto' } });
    const deep = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/site_altitude_m', relatorio_id: relatorioId, value: -99_999 });
    const shore = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/site_altitude_m', relatorio_id: relatorioId, value: -500 });
    const result = await h.push(companyA, [object, deep, shore]);
    expect(result.rejected).toEqual([
      { op_id: object.op_id, code: 'op_value_invalid' },
      { op_id: deep.op_id, code: 'op_value_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([shore.op_id]);
    expect((await h.rowOf<BlockRowLike>(companyA, 'block', blocks[0]!.id))?.sheet.observations).toBeNull();
    expect((await h.rowOf<RelatorioRowLike>(companyA, 'relatorio', relatorioId))?.setup.site_altitude_m).toBe(-500);
  });

  it('the refused value of a client batch is refused alone: the batch\'s other ops apply', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const batchId = newId();
    const fine = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: 'Fica', batch_id: batchId });
    const oversized = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[1]!.id}/observations`, relatorio_id: relatorioId, value: 'z'.repeat(TEXT_CAPS.long + 1), batch_id: batchId });
    const result = await h.push(companyA, [fine, oversized]);
    expect(result.applied.map((a) => a.op_id)).toEqual([fine.op_id]);
    expect(result.rejected).toEqual([{ op_id: oversized.op_id, code: 'op_value_invalid' }]);
  });
});

describe('e20f, E20-A1 (R-1): the relatório budget of stored bytes', () => {
  /**
   * The relatório's live rows of client kinds, in bytes, as the server measures them: each row
   * serialized by the push body's serializer (`relatorioBudgetRowBytes`), server rows left out.
   */
  async function storedBytes(relatorioId: string): Promise<number> {
    const rows = await h.db
      .select({ entity: entities.entity, row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.relatorio_id, relatorioId), isNull(entities.removed_at)));
    return rows.reduce((sum, record) => sum + relatorioBudgetRowBytes(record.entity as Entity, record.row, relatorioId), 0);
  }
  const pointCreate = (relatorioId: string, text: string) => {
    const id = newId();
    return { id, op: h.clientOp(companyA, { kind: 'create', path: `point/${id}`, relatorio_id: relatorioId, value: { id, relatorio_id: relatorioId, text, equipment_id: null, origin: 'manual', order_key: `a${id.slice(-6)}`, removed_at: null } }) };
  };
  /** The bytes a point of `text` stores (its row with the schema's defaults): ids and order keys have fixed lengths. */
  const pointBytes = (relatorioId: string, text: string) =>
    serializedBytes({ id: newId(), relatorio_id: relatorioId, text, equipment_id: null, origin: 'manual', order_key: 'a000000', removed_at: null, action: null, priority: null, deadline: null, owner: null });
  const put = (relatorioId: string, path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id: relatorioId, value });
  const remove = (relatorioId: string, id: string) => h.clientOp(companyA, { kind: 'remove', path: `point/${id}/removed_at`, relatorio_id: relatorioId });
  /** Creates points (each within the text cap) until exactly `room` bytes are left under the budget. */
  async function fillTo(relatorioId: string, room: number): Promise<string[]> {
    const empty = pointBytes(relatorioId, '');
    const ids: string[] = [];
    for (let guard = 0; guard < 400; guard++) {
      const length = RELATORIO_MAX_BYTES - (await storedBytes(relatorioId)) - room - empty;
      expect(length, `room ${room}`).toBeGreaterThan(0);
      // The last point takes all that is left; one before it leaves the last at least 1 000 characters.
      const take = length <= TEXT_CAPS.long ? length : Math.min(TEXT_CAPS.long, length - empty - 1_000);
      const filler = pointCreate(relatorioId, 'f'.repeat(take));
      expect((await h.push(companyA, [filler.op])).rejected).toEqual([]);
      ids.push(filler.id);
      if (take === length) break;
    }
    expect(RELATORIO_MAX_BYTES - (await storedBytes(relatorioId))).toBe(room);
    return ids;
  }

  it('one relatório filled near the budget: a crossing create is refused; a shrinking put, a put of null and a removal apply; a restore is refused without room and applies with it; five growing puts of one push apply while they fit', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const full = 'p'.repeat(TEXT_CAPS.long);
    const kept: string[] = [];
    const fullBytes = pointBytes(relatorioId, full);
    // Fill with points of 20 000 characters, each op within every cap, until less than one more fits.
    for (let round = 0; round < 6; round++) {
      const remaining = RELATORIO_MAX_BYTES - (await storedBytes(relatorioId));
      const count = Math.min(150, Math.floor((remaining - fullBytes) / fullBytes));
      if (count <= 0) break;
      const batch = Array.from({ length: count }, () => pointCreate(relatorioId, full));
      expect((await h.push(companyA, batch.map((entry) => entry.op))).rejected).toEqual([]);
      kept.push(...batch.map((entry) => entry.id));
    }
    // Fillers leave exactly 500 bytes: the server measures the rows as this test does.
    await fillTo(relatorioId, 500);

    // One more full point crosses the budget (alone it is within every cap): refused, never logged, the rows unchanged.
    const crossing = pointCreate(relatorioId, full);
    expect((await h.push(companyA, [crossing.op])).rejected).toEqual([{ op_id: crossing.op.op_id, code: 'op_value_invalid' }]);
    expect(await h.logged(crossing.op.op_id)).toBe(false);
    expect(await h.rowOf(companyA, 'point', crossing.id)).toBeUndefined();
    expect(RELATORIO_MAX_BYTES - (await storedBytes(relatorioId))).toBe(500);

    // R-1b: a text replaced by a shorter one (19 999 characters, far over the 500 bytes left) applies.
    const shrink = put(relatorioId, `point/${kept[0]}/text`, 'p'.repeat(TEXT_CAPS.long - 1));
    expect((await h.push(companyA, [shrink])).rejected).toEqual([]);
    expect(RELATORIO_MAX_BYTES - (await storedBytes(relatorioId))).toBe(501);
    // A small value that fits, a put of null and a removal always apply.
    const small = put(relatorioId, 'relatorio/setup/local', 'A');
    const nullPut = put(relatorioId, 'relatorio/setup/additional_info', null);
    const removal = remove(relatorioId, kept[1]!);
    expect((await h.push(companyA, [small, nullPut, removal])).rejected).toEqual([]);

    // R-1a: the room the removal freed is taken; restoring the removed point would cross the budget: refused.
    const takers = await fillTo(relatorioId, 600);
    const restore = put(relatorioId, `point/${kept[1]}/removed_at`, null);
    expect((await h.push(companyA, [restore])).rejected).toEqual([{ op_id: restore.op_id, code: 'op_value_invalid' }]);
    expect(await h.logged(restore.op_id)).toBe(false);
    expect((await h.rowOf<{ removed_at: string | null }>(companyA, 'point', kept[1]!))?.removed_at).not.toBeNull();
    expect(RELATORIO_MAX_BYTES - (await storedBytes(relatorioId))).toBe(600);
    // With the room given back (in the same push, before it), the same restore applies.
    const again = put(relatorioId, `point/${kept[1]}/removed_at`, null);
    expect((await h.push(companyA, [...takers.map((id) => remove(relatorioId, id)), again])).rejected).toEqual([]);
    expect((await h.rowOf<{ removed_at: string | null }>(companyA, 'point', kept[1]!))?.removed_at).toBeNull();

    // R-1e: five puts of one push that each grow a point by 19 999 bytes, with room for three and a half: the last two are refused.
    for (const id of kept.slice(2, 6)) expect((await h.push(companyA, [remove(relatorioId, id)])).rejected).toEqual([]);
    const short = Array.from({ length: 5 }, () => pointCreate(relatorioId, 'a'));
    expect((await h.push(companyA, short.map((entry) => entry.op))).rejected).toEqual([]);
    const growth = TEXT_CAPS.long - 1;
    await fillTo(relatorioId, 3 * growth + growth / 2 + 0.5);
    const before = await storedBytes(relatorioId);
    const grows = short.map((entry) => put(relatorioId, `point/${entry.id}/text`, 'b'.repeat(TEXT_CAPS.long)));
    const answer = await h.push(companyA, grows);
    expect(answer.applied.map((applied) => applied.op_id)).toEqual(grows.slice(0, 3).map((op) => op.op_id));
    expect(answer.rejected).toEqual(grows.slice(3).map((op) => ({ op_id: op.op_id, code: 'op_value_invalid' })));
    expect(await storedBytes(relatorioId)).toBe(before + 3 * growth);
    expect(await storedBytes(relatorioId)).toBeLessThanOrEqual(RELATORIO_MAX_BYTES);
  }, 360_000);

  it('R-1d: a relatório whose stored bytes are server rows only (an audit run, a generation job) still takes a user\'s write', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const huge = 'e'.repeat(RELATORIO_MAX_BYTES);
    for (const [entity, row] of [
      ['audit_run', { status: 'failed', findings: [], error: huge, prompt_version: null, created_at: '2026-11-04T12:00:00.000Z', started_at: null, finished_at: null }],
      ['generation_job', { kind: 'preview', status: 'failed', error: huge, result_file_id: null, result: null, created_at: '2026-11-04T12:00:00.000Z', started_at: null }],
    ] as const) {
      const id = newId();
      await h.db.insert(entities).values({ company_id: companyA.companyId, entity, id, relatorio_id: relatorioId, project_id: null, row: { id, relatorio_id: relatorioId, ...row } as never, removed_at: null, updated_seq: 0 });
    }
    const write = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/additional_info', relatorio_id: relatorioId, value: 'x'.repeat(TEXT_CAPS.long) });
    expect((await h.push(companyA, [write])).rejected).toEqual([]);
    expect((await h.rowOf<RelatorioRowLike>(companyA, 'relatorio', relatorioId))?.setup.additional_info).toHaveLength(TEXT_CAPS.long);
  });
});

describe('e20f (QA N1): a value nested 20 000 levels deep', () => {
  it('answers 200 with that op refused op_value_invalid and the other op of the push applied; the api keeps answering', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const fine = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/local', relatorio_id: relatorioId, value: 'Subestação funda' });
    const deep = h.clientOp(companyA, { kind: 'put', path: `block/${blocks[0]!.id}/config`, relatorio_id: relatorioId, value: '__DEEP__' });
    h.track([fine, deep]);
    // Written as text: a value this deep is the attack, and the runner builds it without recursing.
    const body = JSON.stringify({ ops: [fine, deep] }).replace('"__DEEP__"', `${'{"a":'.repeat(20_000)}"x"${'}'.repeat(20_000)}`);
    const res = await h.pushRaw(companyA, body);
    expect(res.status, await res.clone().text()).toBe(200);
    const answer = (await res.json()) as { applied: { op_id: string }[]; rejected: { op_id: string; code: string }[] };
    expect(answer.rejected).toEqual([{ op_id: deep.op_id, code: 'op_value_invalid' }]);
    expect(answer.applied.map((a) => a.op_id)).toEqual([fine.op_id]);
    expect(await h.logged(deep.op_id)).toBe(false);
    expect((await h.rowOf<RelatorioRowLike & { setup: { local: string | null } }>(companyA, 'relatorio', relatorioId))?.setup.local).toBe('Subestação funda');
    expect((await h.pushRaw(companyA, JSON.stringify({ ops: [] }))).status).toBe(200);
  });
});

describe('S4 body: the push body cap', () => {
  it('a push over 4 MiB (the 5 MB string of the security pass) is answered 413 body_too_large whole; nothing of it is applied', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const huge = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/additional_info', relatorio_id: relatorioId, value: 'x'.repeat(5 * 1024 * 1024) });
    const small = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/local', relatorio_id: relatorioId, value: 'Subestação' });
    h.track([huge, small]);
    const body = JSON.stringify({ ops: [small, huge] });
    expect(Buffer.byteLength(body)).toBeGreaterThan(SYNC_PUSH_MAX_BYTES);
    const res = await h.pushRaw(companyA, body);
    expect(res.status).toBe(413);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('body_too_large');
    expect(await h.logged(small.op_id)).toBe(false);
    expect(await h.logged(huge.op_id)).toBe(false);
  });

  it('a push just under the cap is read and answered per op', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const fine = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/local', relatorio_id: relatorioId, value: 'Subestação' });
    // A value refused by its cap, sized so the body stays under 4 MiB: the route reads it and refuses the op alone.
    const big = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/additional_info', relatorio_id: relatorioId, value: 'x'.repeat(SYNC_PUSH_MAX_BYTES - 64 * 1024) });
    const result = await h.push(companyA, [fine, big]);
    expect(result.applied.map((a) => a.op_id)).toEqual([fine.op_id]);
    expect(result.rejected).toEqual([{ op_id: big.op_id, code: 'op_value_invalid' }]);
  });
});

describe('e20f: an open-shaped value is bounded whole', () => {
  type NameplateRowLike = { sheet: { nameplate: Record<string, { value: unknown } | undefined> }; config: unknown };
  /** The first equipment sheet of the relatório whose type has a nameplate, and that nameplate's first field. */
  const nameplateOf = (blocks: readonly { id: string; blockType: string }[]) => {
    const sheet = blocks.find((candidate) => (findDefinition(SEED_VERSION, candidate.blockType)?.nameplate.length ?? 0) > 0)!;
    return { block: sheet.id, field: findDefinition(SEED_VERSION, sheet.blockType)!.nameplate[0]!.key };
  };

  it('a nameplate cell of 15 000 short strings, and a block config of seven 20 000-character strings, are refused op_value_invalid; the rows are unchanged', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const { block, field } = nameplateOf(blocks);
    const before = await h.rowOf<NameplateRowLike>(companyA, 'block', block);
    const cell = h.clientOp(companyA, { kind: 'put', path: `sheet/${block}/nameplate/${field}`, relatorio_id: relatorioId, value: Array.from({ length: 15_000 }, () => 'x') });
    const config = h.clientOp(companyA, {
      kind: 'put',
      path: `block/${block}/config`,
      relatorio_id: relatorioId,
      value: { ...(before!.config as Record<string, unknown>), notes: Array.from({ length: 7 }, () => 'x'.repeat(TEXT_CAPS.long)) },
    });
    const result = await h.push(companyA, [cell, config]);
    expect(result.rejected).toEqual([
      { op_id: cell.op_id, code: 'op_value_invalid' },
      { op_id: config.op_id, code: 'op_value_invalid' },
    ]);
    for (const op of [cell, config]) expect(await h.logged(op.op_id)).toBe(false);
    const after = await h.rowOf<NameplateRowLike>(companyA, 'block', block);
    expect(after?.sheet.nameplate[field]).toBeUndefined();
    expect(after?.config).toEqual(before!.config);
  });

  it('e22g (review S4): a nameplate number put in the over_range state is refused op_value_invalid and never logged; the same number measured applies', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const sheet = blocks.find((candidate) => findDefinition(SEED_VERSION, candidate.blockType)?.nameplate.some((f) => f.kind === 'number'))!;
    const field = findDefinition(SEED_VERSION, sheet.blockType)!.nameplate.find((f) => f.kind === 'number')!.key;
    const cell = (state: string) => h.clientOp(companyA, { kind: 'put', path: `sheet/${sheet.id}/nameplate/${field}`, relatorio_id: relatorioId, value: { raw: '13.8', unit: 'kV', state } });
    const over = cell('over_range');
    expect((await h.push(companyA, [over])).rejected).toEqual([{ op_id: over.op_id, code: 'op_value_invalid' }]);
    expect(await h.logged(over.op_id)).toBe(false);
    expect((await h.rowOf<NameplateRowLike>(companyA, 'block', sheet.id))?.sheet.nameplate[field]).toBeUndefined();
    expect((await h.push(companyA, [cell('measured')])).rejected).toEqual([]);
    expect((await h.rowOf<NameplateRowLike>(companyA, 'block', sheet.id))?.sheet.nameplate[field]?.value).toEqual({ raw: '13.8', unit: 'kV', state: 'measured' });
  });

  it('a nameplate cell at exactly the byte and count caps applies; one item or one byte more is refused', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const { block, field } = nameplateOf(blocks);
    const cell = (value: string[]) => h.clientOp(companyA, { kind: 'put', path: `sheet/${block}/nameplate/${field}`, relatorio_id: relatorioId, value });
    const overItems = cell(shortStringsOfBytes(VALUE_MAX_ITEMS + 1, VALUE_MAX_BYTES));
    const overBytes = cell(shortStringsOfBytes(VALUE_MAX_ITEMS, VALUE_MAX_BYTES + 1));
    expect((await h.push(companyA, [overItems, overBytes])).rejected).toEqual([
      { op_id: overItems.op_id, code: 'op_value_invalid' },
      { op_id: overBytes.op_id, code: 'op_value_invalid' },
    ]);
    const atCaps = shortStringsOfBytes(VALUE_MAX_ITEMS, VALUE_MAX_BYTES);
    expect((await h.push(companyA, [cell(atCaps)])).rejected).toEqual([]);
    expect((await h.rowOf<NameplateRowLike>(companyA, 'block', block))?.sheet.nameplate[field]?.value).toEqual(atCaps);
  });
});
