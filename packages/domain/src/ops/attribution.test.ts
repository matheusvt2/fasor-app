import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { opLog as portoSeguroLog } from '../../fixtures/porto-seguro/op-log.ts';
import { opLog as portoSeguroSmallLog } from '../../fixtures/porto-seguro/small/op-log.ts';
import { opLog as replaySmallLog } from '../../fixtures/replay-small/op-log.ts';
import { isoTimestampSchema } from '../clock.ts';
import { actorIdSchema } from '../ids.ts';
import { entityRowSchemas } from '../schemas/entities.ts';
import { ATTRIBUTED_FIELDS, attributionIssue, CLOCK_SKEW_MS, historyClaimHolds, lowerBoundIssue, RESTAMP_WINDOW_MS, restampOp, valuePointerOf } from './attribution.ts';
import { opSchema, type Op } from './op.ts';
import { parsePath } from './path.ts';

/*
 * Story 20.8 (contract 29, security pass S3): the attribution table, the check, and the guard
 * that keeps the table complete. Written red-first against `spec-e20s-server-rules.md`.
 */

const COMPANY = '019966c1-0000-7000-8000-00000000000c';
const RELATORIO = '019966c1-0000-7000-8000-0000000000a1';
const BLOCK = '019966c1-0000-7000-8000-0000000000b1';
const FILE = '019966c1-0000-7000-8000-0000000000f1';
const ME = '019966c1-0000-7000-8000-0000000000e1';
const COLLEAGUE = '019966c1-0000-7000-8000-0000000000e2';
const NOW = new Date('2026-11-03T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString();

let seq = 0;
function op(input: Partial<Op> & Pick<Op, 'path' | 'kind'>): Op {
  seq += 1;
  return opSchema.parse({
    op_id: `019966c1-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: RELATORIO,
    value: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: ME,
    device_id: 'tablet-1',
    client_ts: NOW_ISO,
    ...input,
  });
}

const check = (o: Op) => attributionIssue(o, parsePath(o.path), NOW);

/** The guard walk: every leaf of `schema` whose schema is `actorIdSchema` or `isoTimestampSchema`, by pointer. */
function attributedLeaves(schema: z.ZodType, pointer: string, out: Set<string>, recordDepth = 0): void {
  let at: z.ZodType = schema;
  for (;;) {
    if (at instanceof z.ZodOptional || at instanceof z.ZodNullable || at instanceof z.ZodDefault) at = at.unwrap() as z.ZodType;
    else break;
  }
  if (at === (actorIdSchema as z.ZodType) || at === (isoTimestampSchema as z.ZodType)) {
    out.add(pointer);
    return;
  }
  if (at instanceof z.ZodObject) {
    for (const [key, child] of Object.entries(at.shape as Record<string, z.ZodType>)) attributedLeaves(child, `${pointer}.${key}`, out, recordDepth);
    return;
  }
  if (at instanceof z.ZodUnion || at instanceof z.ZodDiscriminatedUnion) {
    for (const option of at.options as readonly z.ZodType[]) attributedLeaves(option, pointer, out, recordDepth);
    return;
  }
  // One level of records (a sheet's cell maps, a cabine's site checklist); arrays are not walked.
  if (at instanceof z.ZodRecord && recordDepth === 0) attributedLeaves(at.valueType as z.ZodType, `${pointer}.*`, out, recordDepth + 1);
}

describe('ATTRIBUTED_FIELDS (Story 20.8)', () => {
  it('guard: every actor-id and instant leaf of the row schemas and of the op schema has an entry, and every entry is such a leaf', () => {
    const leaves = new Set<string>();
    for (const [entity, schema] of Object.entries(entityRowSchemas)) attributedLeaves(schema as z.ZodType, entity, leaves);
    attributedLeaves(opSchema as unknown as z.ZodType, 'op', leaves);
    const table = new Set(ATTRIBUTED_FIELDS.map((field) => field.pointer));
    const missing = [...leaves].filter((pointer) => !table.has(pointer));
    expect(missing, 'leaves with no ATTRIBUTED_FIELDS entry').toEqual([]);
    const stale = [...table].filter((pointer) => !leaves.has(pointer));
    expect(stale, 'entries that are no leaf of any schema').toEqual([]);
    // The walk reaches the leaves the spec names.
    for (const pointer of ['block.concluded_by.actor_id', 'block.not_tested.by', 'op.meta.restore.removed_by', 'op.client_ts', 'file.captured_at']) expect(leaves).toContain(pointer);
  });

  it('names each pointer once, and gives every exemption, future-only bound and history rule a one-line reason', () => {
    const pointers = ATTRIBUTED_FIELDS.map((field) => field.pointer);
    expect(new Set(pointers).size).toBe(pointers.length);
    for (const field of ATTRIBUTED_FIELDS) {
      const needsReason = ('actor' in field && field.actor !== 'op') || ('instant' in field && field.instant !== 'bounded');
      if (!needsReason) continue;
      const reason = (field as { reason?: string }).reason ?? '';
      expect(reason.trim().length, field.pointer).toBeGreaterThan(0);
      expect(reason.includes('\n'), field.pointer).toBe(false);
    }
  });

  it('the attributed values of the spec: concluded_by and not_tested take history, a gallery photo is bounded in the future only', () => {
    const rule = (pointer: string) => ATTRIBUTED_FIELDS.find((field) => field.pointer === pointer);
    expect(rule('block.concluded_by.actor_id')).toMatchObject({ actor: 'history', history: 'same_path_value' });
    expect(rule('block.concluded_by.at')).toMatchObject({ instant: 'bounded' });
    expect(rule('block.not_tested.by')).toMatchObject({ actor: 'history', history: 'same_path_value' });
    expect(rule('op.meta.restore.removed_by')).toMatchObject({ actor: 'history', history: 'same_path_actor' });
    expect(rule('file.captured_at')).toMatchObject({ instant: 'future' });
    expect(rule('op.client_ts')).toMatchObject({ instant: 'bounded' });
    expect(CLOCK_SKEW_MS).toBe(10 * 60_000);
  });
});

describe('valuePointerOf (Story 20.8)', () => {
  it('places a create at its row and a put at its field', () => {
    expect(valuePointerOf(parsePath(`block/${BLOCK}`))).toBe('block');
    expect(valuePointerOf(parsePath(`block/${BLOCK}/concluded_by`))).toBe('block.concluded_by');
    expect(valuePointerOf(parsePath('relatorio/setup/additional_info'))).toBe('relatorio.setup.additional_info');
    expect(valuePointerOf(parsePath('relatorio/removed_at'))).toBe('relatorio.removed_at');
    expect(valuePointerOf(parsePath(`sheet/${BLOCK}/observations`))).toBe('block.sheet');
  });
});

describe('attributionIssue (Story 20.8)', () => {
  it('S3: a concluded_by naming the op\'s own actor at a present instant passes, and leaves its instants to the lower bound', () => {
    const result = check(op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: ME, at: NOW_ISO } }));
    expect(result).toEqual({ ok: true, pending: { history: [], bounded: [NOW_ISO, NOW_ISO] } });
  });

  it('S3: a concluded_by naming a colleague is a history claim on the same path and the same leaf', () => {
    const result = check(op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: COLLEAGUE, at: NOW_ISO } }));
    expect(result).toMatchObject({ ok: true, pending: { history: [{ actorId: COLLEAGUE, rule: 'same_path_value', pointer: ['actor_id'] }] } });
  });

  it('S3: not_tested.by and meta.restore.removed_by naming a colleague are history claims', () => {
    const notTested = check(op({ kind: 'put', path: `block/${BLOCK}/not_tested`, value: { reason: 'sem_acesso', text: null, at: NOW_ISO, by: COLLEAGUE } }));
    expect(notTested).toMatchObject({ ok: true, pending: { history: [{ actorId: COLLEAGUE, rule: 'same_path_value', pointer: ['by'] }] } });
    const restore = check(
      op({
        kind: 'put',
        path: `block/${BLOCK}/removed_at`,
        value: minutes(-60),
        meta: { restore: { removed_by: COLLEAGUE, removal_conflict: { removed_by: COLLEAGUE, removed_at: minutes(-60), edited_by: ME, edited_at: minutes(-30) } } },
      }),
    );
    expect(restore).toMatchObject({ ok: true });
    if (!restore.ok) throw new Error('unreachable');
    expect(restore.pending.history.map((claim) => [claim.field, claim.rule])).toEqual([
      ['op.meta.restore.removed_by', 'same_path_actor'],
      ['op.meta.restore.removal_conflict.removed_by', 'same_path_actor'],
    ]);
  });

  it('S3 clock: a client_ts or a value instant more than 10 minutes past the server\'s clock is refused; 9 minutes passes', () => {
    expect(check(op({ kind: 'put', path: `sheet/${BLOCK}/observations`, value: 'x', client_ts: '2099-01-01T00:00:00.000Z' })).ok).toBe(false);
    expect(check(op({ kind: 'put', path: `sheet/${BLOCK}/observations`, value: 'x', client_ts: minutes(11) })).ok).toBe(false);
    expect(check(op({ kind: 'put', path: `sheet/${BLOCK}/observations`, value: 'x', client_ts: minutes(9) })).ok).toBe(true);
    expect(check(op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: ME, at: '2099-01-01T00:00:00.000Z' } })).ok).toBe(false);
    expect(check(op({ kind: 'put', path: `block/${BLOCK}/removed_at`, value: minutes(11) })).ok).toBe(false);
  });

  it('past instants stay allowed here: an op two days old carries them to the lower bound only', () => {
    const twoDays = minutes(-2 * 24 * 60);
    const result = check(op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: ME, at: twoDays }, client_ts: twoDays }));
    expect(result).toEqual({ ok: true, pending: { history: [], bounded: [twoDays, twoDays] } });
  });

  it('a gallery photo taken before the relatório is bounded in the future only, never by the lower bound', () => {
    const photo = {
      id: FILE,
      company_id: COMPANY,
      relatorio_id: RELATORIO,
      sha256: 'a'.repeat(64),
      mime: 'image/jpeg',
      size: 10,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      kind: 'photo',
      captured_at: '2020-01-01T00:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: null,
      item_key: null,
      caption: null,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
    };
    expect(check(op({ kind: 'create', path: `file/${FILE}`, value: photo }))).toEqual({ ok: true, pending: { history: [], bounded: [NOW_ISO] } });
    expect(check(op({ kind: 'create', path: `file/${FILE}`, value: { ...photo, captured_at: '2099-01-01T00:00:00.000Z' } })).ok).toBe(false);
  });

  it('a block create may not name a colleague in concluded_by unless the log says so; its derived columns are not checked', () => {
    const block = {
      id: BLOCK,
      relatorio_id: RELATORIO,
      location_id: null,
      equipment_id: null,
      block_type: 'tc',
      config: {},
      seed_version: 'v1',
      order_key: 'a',
      feeds_block_id: null,
      not_tested: null,
      concluded_by: { actor_id: COLLEAGUE, at: NOW_ISO },
      sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
      created_by: COLLEAGUE,
      first_edited_at: '2099-01-01T00:00:00.000Z',
      last_modified_by: COLLEAGUE,
      last_modified_at: null,
      removed_at: null,
    };
    const result = check(op({ kind: 'create', path: `block/${BLOCK}`, value: block }));
    expect(result).toMatchObject({ ok: true, pending: { history: [{ actorId: COLLEAGUE, rule: 'same_path_value', pointer: ['concluded_by', 'actor_id'] }] } });
  });

  it('a cleared mark (null) names no one, and a remove carries its client_ts only', () => {
    expect(check(op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: null }))).toEqual({ ok: true, pending: { history: [], bounded: [NOW_ISO] } });
    expect(check(op({ kind: 'remove', path: `block/${BLOCK}/removed_at` }))).toEqual({ ok: true, pending: { history: [], bounded: [NOW_ISO] } });
  });
});

describe('attributionIssue over real data (Story 20.8)', () => {
  it('every op of the Porto Seguro relatório, its small cut and the replay fixture passes, naming no colleague, each instant after its relatório\'s creation', () => {
    for (const [name, log] of [
      ['porto-seguro', portoSeguroLog],
      ['porto-seguro/small', portoSeguroSmallLog],
      ['replay-small', replaySmallLog],
    ] as const) {
      const created = new Map(log.filter((o) => o.kind === 'create' && o.path === `relatorio/${o.relatorio_id}`).map((o) => [o.relatorio_id!, o.client_ts]));
      const problems: string[] = [];
      for (const o of log) {
        const result = attributionIssue(o, parsePath(o.path), new Date());
        if (!result.ok) problems.push(`${o.path}: ${result.issue}`);
        else if (result.pending.history.length > 0) problems.push(`${o.path}: names ${result.pending.history.map((claim) => claim.actorId).join(', ')}`);
        else {
          const at = o.relatorio_id == null ? undefined : created.get(o.relatorio_id);
          const lower = at === undefined ? null : lowerBoundIssue(result.pending.bounded, at);
          if (lower !== null) problems.push(`${o.path}: ${lower}`);
        }
      }
      expect(problems, name).toEqual([]);
    }
  });
});

describe('historyClaimHolds (Story 20.8)', () => {
  const claim = { actorId: COLLEAGUE, rule: 'same_path_value' as const, pointer: ['actor_id'], field: 'block.concluded_by.actor_id' };

  it('undo restores history: the colleague\'s own earlier op holding the same leaf excuses it', () => {
    expect(historyClaimHolds(claim, [{ actor_id: COLLEAGUE, value: { actor_id: COLLEAGUE, at: NOW_ISO } }])).toBe(true);
  });

  it('no matching history: the colleague never wrote it, or wrote another value, or someone else named them', () => {
    expect(historyClaimHolds(claim, [])).toBe(false);
    expect(historyClaimHolds(claim, [{ actor_id: COLLEAGUE, value: null }])).toBe(false);
    expect(historyClaimHolds(claim, [{ actor_id: ME, value: { actor_id: COLLEAGUE, at: NOW_ISO } }])).toBe(false);
  });

  it('the actor rules need only an op of that colleague', () => {
    expect(historyClaimHolds({ ...claim, rule: 'same_path_actor' }, [{ actor_id: COLLEAGUE, value: NOW_ISO }])).toBe(true);
    expect(historyClaimHolds({ ...claim, rule: 'same_relatorio_actor' }, [{ actor_id: ME, value: null }])).toBe(false);
  });
});

describe('lowerBoundIssue (Story 20.8)', () => {
  it('refuses an instant more than 10 minutes before the relatório\'s creation; 9 minutes before, and two days after, pass', () => {
    const created = minutes(-3 * 24 * 60);
    expect(lowerBoundIssue([minutes(-2 * 24 * 60)], created)).toBeNull();
    expect(lowerBoundIssue([minutes(-3 * 24 * 60 - 9)], created)).toBeNull();
    expect(lowerBoundIssue([minutes(-3 * 24 * 60 - 11)], created)).not.toBeNull();
    expect(lowerBoundIssue(['2020-01-01T00:00:00.000Z'], created)).not.toBeNull();
  });
});

describe('restampOp (e20f)', () => {
  const FAST = 30; // minutes the device's clock ran ahead
  it('a fast clock: client_ts becomes now, removed_at and concluded_by.at shift with it, and the op then passes', () => {
    const removed = op({ kind: 'put', path: `block/${BLOCK}/removed_at`, value: minutes(FAST), client_ts: minutes(FAST) });
    expect(check(removed).ok).toBe(false);
    const again = restampOp(removed, NOW, -FAST * 60_000);
    expect(again.client_ts).toBe(NOW_ISO);
    expect(again.value).toBe(NOW_ISO);
    expect(check(again).ok).toBe(true);
    // The input is not mutated.
    expect(removed.client_ts).toBe(minutes(FAST));
    expect(removed.value).toBe(minutes(FAST));

    // concluded_by.at stamped a minute before client_ts by the same clock keeps its distance.
    const concluded = op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: ME, at: minutes(FAST - 1) }, client_ts: minutes(FAST) });
    const restamped = restampOp(concluded, NOW, -FAST * 60_000);
    expect(restamped.value).toEqual({ actor_id: ME, at: minutes(-1) });
    expect(check(restamped).ok).toBe(true);
  });

  it('a colleague\'s edited_at hours earlier stays; the removal instants of the same clock shift', () => {
    const restore = op({
      kind: 'put',
      path: `block/${BLOCK}/removed_at`,
      value: minutes(FAST),
      client_ts: minutes(FAST),
      meta: { restore: { removed_by: ME, removal_conflict: { removed_by: ME, removed_at: minutes(FAST), edited_by: COLLEAGUE, edited_at: minutes(-180) } } },
    });
    const again = restampOp(restore, NOW, -FAST * 60_000);
    expect(again.meta).toEqual({ restore: { removed_by: ME, removal_conflict: { removed_by: ME, removed_at: NOW_ISO, edited_by: COLLEAGUE, edited_at: minutes(-180) } } });
    expect(again.value).toBe(NOW_ISO);
  });

  it('a slow clock (3 days behind) moves the stamps forward to now; a gallery photo\'s capture far from the stamp stays', () => {
    const slow = -3 * 24 * 60;
    const concluded = op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: ME, at: minutes(slow) }, client_ts: minutes(slow) });
    const again = restampOp(concluded, NOW, -slow * 60_000);
    expect(again.client_ts).toBe(NOW_ISO);
    expect(again.value).toEqual({ actor_id: ME, at: NOW_ISO });
    const result = attributionIssue(again, parsePath(again.path), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(lowerBoundIssue(result.pending.bounded, minutes(-5))).toBeNull();

    const photo = op({
      kind: 'create',
      path: `file/${FILE}`,
      client_ts: minutes(slow),
      value: {
        id: FILE,
        company_id: COMPANY,
        relatorio_id: RELATORIO,
        sha256: 'a'.repeat(64),
        mime: 'image/jpeg',
        size: 10,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        kind: 'photo',
        captured_at: '2020-01-01T00:00:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: null,
        item_key: null,
        caption: null,
        reading_kind: null,
        reading_target: null,
        reading_status: 'none',
      },
    });
    expect((restampOp(photo, NOW, -slow * 60_000).value as { captured_at: string }).captured_at).toBe('2020-01-01T00:00:00.000Z');
  });

  it('E20-A1 review loop 1: with no clock error known (0), an in-window instant moves by the stamp\'s own delta, so a slow clock\'s conclusion lands just before the new stamp', () => {
    const slow = -3 * 24 * 60;
    const concluded = op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: ME, at: minutes(slow - 1) }, client_ts: minutes(slow) });
    expect(restampOp(concluded, NOW).value).toEqual({ actor_id: ME, at: minutes(-1) });
    expect(restampOp(concluded, NOW, 0).value).toEqual({ actor_id: ME, at: minutes(-1) });
    // A known error moves it by the error instead.
    expect(restampOp(concluded, NOW, -slow * 60_000 - 5 * 60_000).value).toEqual({ actor_id: ME, at: minutes(-6) });
  });

  it('E20-A1 (R-2): a forged instant far from the stamp is left as it is (the server refuses it again); exempt leaves stay', () => {
    const forged = op({ kind: 'put', path: `block/${BLOCK}/removed_at`, value: '2099-01-01T00:00:00.000Z', client_ts: NOW_ISO });
    expect(restampOp(forged, NOW, -FAST * 60_000).value).toBe('2099-01-01T00:00:00.000Z');
    const seen = op({ kind: 'put', path: `block/${BLOCK}/removed_at`, value: minutes(FAST), client_ts: minutes(FAST), meta: { seen_modified_at: minutes(FAST) } });
    expect(restampOp(seen, NOW, -FAST * 60_000).meta).toEqual({ seen_modified_at: minutes(FAST) });
  });

  it('E20-A1 (R-2): a value instant moves by the learned clock error, not to the resend time; clamped to the new stamp; only within its own window', () => {
    // Concluded at 12:29 by a clock 30 minutes fast (really 11:59), resent two hours later.
    const concluded = op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: ME, at: minutes(FAST - 1) }, client_ts: minutes(FAST) });
    const later = new Date(NOW.getTime() + 120 * 60_000);
    const again = restampOp(concluded, later, -FAST * 60_000);
    expect(again.client_ts).toBe(later.toISOString());
    expect(again.value).toEqual({ actor_id: ME, at: minutes(-1) });
    // Shifted past the new stamp by the error, it becomes the stamp.
    expect(restampOp(concluded, NOW, 60 * 60_000).value).toEqual({ actor_id: ME, at: NOW_ISO });
    // One millisecond outside the window: untouched, even past the new stamp.
    const edge = op({ kind: 'put', path: `block/${BLOCK}/concluded_by`, value: { actor_id: ME, at: new Date(Date.parse(minutes(FAST)) - RESTAMP_WINDOW_MS - 1).toISOString() }, client_ts: minutes(FAST) });
    expect(restampOp(edge, NOW, -FAST * 60_000).value).toEqual(edge.value);
    expect(RESTAMP_WINDOW_MS).toBe(60_000);
  });
});
