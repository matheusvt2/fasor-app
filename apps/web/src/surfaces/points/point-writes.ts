import {
  createPointOp,
  livePoints,
  newPointRow,
  priorityPickWrites,
  putPointOp,
  replaceDeadlineWrite,
  type OpDraft,
  type PointPriority,
  type PointPriorityWrites,
  type PointRow,
} from '@app/domain';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { pointRowsOf, relatorioRow } from '../../db/home-store.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { newId } from '../../ids.ts';

/*
 * E6-Q2: the point editor autosaves per field like every other surface (EXPERIENCE.md ›
 * Autosave, FR-61). A new point is created (`point` create op, with the id the editor
 * generated up front) the first time its text or action is not empty; every later change
 * is a `point/{id}/{field}` put. The editor and the draft recovery of a closed editor both
 * write through here, so the two paths cannot disagree.
 *
 * Story 11.9: Responsável autosaves like Ação. A priority pick, a clear, a typed Prazo and
 * "Substituir" are one batch each, decided by the kernel (`priorityPickWrites`,
 * `replaceDeadlineWrite`) against the rows read here, and return the batch id for undo. On a
 * point not yet stored that holds text, an action or a Responsável the batch creates it with
 * the decision in its row; with all three blank nothing is written and the editor keeps the
 * decision pending until the first of them creates the point (an empty point never prints).
 */

/** The draft surface of the point editor (`point/{id}`, the DraftProvider's vocabulary). */
export const POINT_DRAFT_SURFACE = 'point';

export interface PointAuthor {
  id: string;
  companyId: string;
}

/** The editor's typed fields: the text with its photo tokens, the raw action and the raw Responsável. */
export interface PointValues {
  text: string;
  action: string;
  owner: string;
}

/** What a new point is linked to: its equipment and where it came from. */
export interface NewPointLink {
  equipmentId: string | null;
  origin: PointRow['origin'];
}

/** What a write did: `created` when it was the point's create op. */
export type PointWrite = { kind: 'written'; created: boolean } | { kind: 'unchanged' } | { kind: 'gone' };

/** The stored action of a typed one: trimmed, null when blank. */
export function actionValue(action: string): string | null {
  const trimmed = action.trim();
  return trimmed === '' ? null : trimmed;
}

/** The stored Responsável of a typed one: trimmed, null when blank. */
export const ownerValue = actionValue;

/** A new point's row from what the editor holds (its text, action and Responsável), with the priority and deadline picked before it was stored. */
function newRow(relatorioId: string, pointId: string, values: PointValues, link: NewPointLink, fresh: readonly PointRow[], pending: PointPriorityWrites): PointRow {
  const row = newPointRow({ id: pointId, relatorioId, text: values.text, equipmentId: link.equipmentId, origin: link.origin, action: actionValue(values.action) }, fresh);
  return { ...row, owner: ownerValue(values.owner), ...pending };
}

/** Text, action and Responsável all blank: a new point with nothing to print is never stored. */
function blank(values: PointValues): boolean {
  return values.text.trim() === '' && actionValue(values.action) === null && ownerValue(values.owner) === null;
}

/**
 * Writes the named fields of a point, plus `pending` (a priority or deadline the editor holds
 * that is not stored yet: picked on a point not stored, or a typed Prazo recovered from a
 * draft). A point this device does not hold is created when `link` is given (a new point)
 * and a value is not empty, with `pending` in its row, and is `gone` otherwise; a removed
 * point is `gone` and nothing is written.
 */
export async function writePoint(
  db: AppDatabase,
  author: PointAuthor,
  relatorioId: string,
  pointId: string,
  values: PointValues,
  fields: readonly (keyof PointValues)[],
  link: NewPointLink | null,
  pending: PointPriorityWrites = {},
): Promise<PointWrite> {
  const fresh = await pointRowsOf(db, relatorioId);
  const current = fresh.find((row) => row.id === pointId);
  const action = actionValue(values.action);
  const owner = ownerValue(values.owner);
  const drafts: OpDraft[] = [];
  if (current === undefined) {
    if (link === null) return { kind: 'gone' };
    if (blank(values)) return { kind: 'unchanged' };
    drafts.push(createPointOp(author, newRow(relatorioId, pointId, values, link, fresh, pending)));
  } else {
    if (current.removed_at !== null) return { kind: 'gone' };
    if (fields.includes('text') && values.text !== current.text) drafts.push(putPointOp(author, relatorioId, pointId, 'text', values.text));
    if (fields.includes('action') && action !== current.action) drafts.push(putPointOp(author, relatorioId, pointId, 'action', action));
    if (fields.includes('owner') && owner !== current.owner) drafts.push(putPointOp(author, relatorioId, pointId, 'owner', owner));
    if (pending.priority !== undefined && pending.priority !== current.priority) drafts.push(putPointOp(author, relatorioId, pointId, 'priority', pending.priority));
    if (pending.deadline !== undefined && pending.deadline !== current.deadline) drafts.push(putPointOp(author, relatorioId, pointId, 'deadline', pending.deadline));
    if (drafts.length === 0) return { kind: 'unchanged' };
  }
  await commitBatch(db, drafts, { newId, now });
  return { kind: 'written', created: current === undefined };
}

/**
 * What a priority or Prazo write did: `written` (its batch, for undo, and whether it created
 * the point); `pending` when the point is not stored and holds nothing to print yet, so the
 * editor keeps the pick until the first text, action or Responsável creates it; `gone` for
 * a point removed or unknown; `unchanged` when the decision is empty.
 */
export type PointFieldsWrite =
  | { kind: 'written'; batchId: string; created: boolean }
  | { kind: 'pending'; pending: PointPriorityWrites }
  | { kind: 'gone' }
  | { kind: 'unchanged' };

/**
 * One batch of the kernel's priority/deadline decision for a point, read fresh. A point this
 * device does not hold is decided on the row it would be created with (`pending` included);
 * when the editor holds text, an action or a Responsável the batch creates it with the
 * decision in its row, else nothing is written and the decision comes back as `pending`.
 */
async function writePointFields(
  db: AppDatabase,
  author: PointAuthor,
  relatorioId: string,
  pointId: string,
  decide: (point: PointRow, nextIntervention: string | null) => PointPriorityWrites | null,
  link: NewPointLink | null,
  values: PointValues,
  pending: PointPriorityWrites,
): Promise<PointFieldsWrite> {
  const fresh = await pointRowsOf(db, relatorioId);
  const nextIntervention = (await relatorioRow(db, relatorioId))?.setup.next_intervention_date ?? null;
  const current = fresh.find((row) => row.id === pointId);
  if (current === undefined) {
    if (link === null) return { kind: 'gone' };
    const row = newRow(relatorioId, pointId, values, link, fresh, pending);
    const writes = decide(row, nextIntervention) ?? {};
    if (Object.keys(writes).length === 0) return { kind: 'unchanged' };
    if (blank(values)) return { kind: 'pending', pending: { ...pending, ...writes } };
    const { batch_id } = await commitBatch(db, [createPointOp(author, { ...row, ...writes })], { newId, now });
    return { kind: 'written', batchId: batch_id, created: true };
  }
  if (current.removed_at !== null) return { kind: 'gone' };
  const writes = decide(current, nextIntervention);
  const puts: OpDraft[] = [];
  if (writes?.priority !== undefined) puts.push(putPointOp(author, relatorioId, pointId, 'priority', writes.priority));
  if (writes?.deadline !== undefined) puts.push(putPointOp(author, relatorioId, pointId, 'deadline', writes.deadline));
  if (puts.length === 0) return { kind: 'unchanged' };
  const { batch_id } = await commitBatch(db, puts, { newId, now });
  return { kind: 'written', batchId: batch_id, created: false };
}

/** A tap on a Priority picker row (`next`), or Delete on the checked one (`next` null): the kernel's pick in one batch. */
export function writePriorityPick(
  db: AppDatabase,
  author: PointAuthor,
  relatorioId: string,
  pointId: string,
  next: PointPriority | null,
  link: NewPointLink | null,
  values: PointValues,
  pending: PointPriorityWrites,
): Promise<PointFieldsWrite> {
  return writePointFields(db, author, relatorioId, pointId, (point, nextIntervention) => priorityPickWrites(point, next, nextIntervention), link, values, pending);
}

/** A typed Prazo (`YYYY-MM-DD`, or null when cleared): the `deadline` put when it differs. */
export function writeDeadline(
  db: AppDatabase,
  author: PointAuthor,
  relatorioId: string,
  pointId: string,
  deadline: string | null,
  link: NewPointLink | null,
  values: PointValues,
  pending: PointPriorityWrites,
): Promise<PointFieldsWrite> {
  return writePointFields(db, author, relatorioId, pointId, (point) => (deadline === point.deadline ? null : { deadline }), link, values, pending);
}

/** "Substituir": the current priority's suggestion over a typed Prazo. */
export function writeReplaceDeadline(
  db: AppDatabase,
  author: PointAuthor,
  relatorioId: string,
  pointId: string,
  link: NewPointLink | null,
  values: PointValues,
  pending: PointPriorityWrites,
): Promise<PointFieldsWrite> {
  return writePointFields(db, author, relatorioId, pointId, replaceDeadlineWrite, link, values, pending);
}

/** A live point's 1-based place in section 8 and how many live points there are; null when it is not live. */
export async function pointPlace(db: AppDatabase, relatorioId: string, pointId: string): Promise<{ position: number; total: number } | null> {
  const live = livePoints(await pointRowsOf(db, relatorioId));
  const at = live.findIndex((row) => row.id === pointId);
  return at === -1 ? null : { position: at + 1, total: live.length };
}

/** The value a point editor's draft row holds (FR-61): enough to write it with the editor closed. */
export interface PointDraftValue extends PointValues, NewPointLink {
  relatorio_id: string;
  /** The point did not exist when the editor opened: recovering it may create it. */
  is_new: boolean;
  /** Story 11.9: a priority or deadline not stored yet (a typed Prazo before its commit, a pick on a point not stored). */
  pending: PointPriorityWrites;
}

const PRIORITY_VALUES: readonly unknown[] = ['P0', 'P1', 'P2', 'P3', 'P4', null];

/** A draft's pending priority/deadline read back; anything malformed is left out. */
function pendingValue(value: unknown): PointPriorityWrites {
  if (typeof value !== 'object' || value === null) return {};
  const v = value as Record<string, unknown>;
  const out: PointPriorityWrites = {};
  if (PRIORITY_VALUES.includes(v.priority)) out.priority = v.priority as PointPriority | null;
  if (v.deadline === null || (typeof v.deadline === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v.deadline))) out.deadline = v.deadline;
  return out;
}

/** A draft row's value read back, or null when it is not one of the point editor's. */
export function pointDraftValue(value: unknown): PointDraftValue | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.relatorio_id !== 'string' || typeof v.text !== 'string' || typeof v.action !== 'string' || typeof v.is_new !== 'boolean') return null;
  if (v.equipmentId !== null && typeof v.equipmentId !== 'string') return null;
  if (v.origin !== 'manual' && v.origin !== 'not_tested') return null;
  // A draft written before Story 11.9 has no Responsável: it reads as blank.
  const owner = typeof v.owner === 'string' ? v.owner : '';
  return { relatorio_id: v.relatorio_id, text: v.text, action: v.action, owner, is_new: v.is_new, equipmentId: v.equipmentId, origin: v.origin, pending: pendingValue(v.pending) };
}
