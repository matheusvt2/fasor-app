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
 * `replaceDeadlineWrite`) against the rows read here, and return the batch id for undo; on
 * a point not yet stored the batch creates it first, so the picker never waits for text.
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

/** A new point's row from what the editor holds (its text, action and Responsável). */
function newRow(relatorioId: string, pointId: string, values: PointValues, link: NewPointLink, fresh: readonly PointRow[]): PointRow {
  const row = newPointRow({ id: pointId, relatorioId, text: values.text, equipmentId: link.equipmentId, origin: link.origin, action: actionValue(values.action) }, fresh);
  return { ...row, owner: ownerValue(values.owner) };
}

/**
 * Writes the named fields of a point. A point this device does not hold is created when
 * `link` is given (a new point) and a value is not empty, and is `gone` otherwise; a
 * removed point is `gone` and nothing is written.
 */
export async function writePoint(
  db: AppDatabase,
  author: PointAuthor,
  relatorioId: string,
  pointId: string,
  values: PointValues,
  fields: readonly (keyof PointValues)[],
  link: NewPointLink | null,
): Promise<PointWrite> {
  const fresh = await pointRowsOf(db, relatorioId);
  const current = fresh.find((row) => row.id === pointId);
  const action = actionValue(values.action);
  const owner = ownerValue(values.owner);
  const drafts: OpDraft[] = [];
  if (current === undefined) {
    if (link === null) return { kind: 'gone' };
    if (values.text.trim() === '' && action === null && owner === null) return { kind: 'unchanged' };
    drafts.push(createPointOp(author, newRow(relatorioId, pointId, values, link, fresh)));
  } else {
    if (current.removed_at !== null) return { kind: 'gone' };
    if (fields.includes('text') && values.text !== current.text) drafts.push(putPointOp(author, relatorioId, pointId, 'text', values.text));
    if (fields.includes('action') && action !== current.action) drafts.push(putPointOp(author, relatorioId, pointId, 'action', action));
    if (fields.includes('owner') && owner !== current.owner) drafts.push(putPointOp(author, relatorioId, pointId, 'owner', owner));
    if (drafts.length === 0) return { kind: 'unchanged' };
  }
  await commitBatch(db, drafts, { newId, now });
  return { kind: 'written', created: current === undefined };
}

/** What a priority or Prazo write did: its batch (for undo) and whether it created the point; null when nothing was written. */
export interface PointFieldsWrite {
  batchId: string;
  created: boolean;
}

/**
 * One batch of the kernel's priority/deadline decision for a point, read fresh: a point this
 * device does not hold is created first (with what the editor holds) when `link` is given,
 * and nothing is written for a removed or unknown point or an empty decision.
 */
async function writePointFields(
  db: AppDatabase,
  author: PointAuthor,
  relatorioId: string,
  pointId: string,
  decide: (point: PointRow, nextIntervention: string | null) => PointPriorityWrites | null,
  link: NewPointLink | null,
  values: PointValues,
): Promise<PointFieldsWrite | null> {
  const fresh = await pointRowsOf(db, relatorioId);
  const nextIntervention = (await relatorioRow(db, relatorioId))?.setup.next_intervention_date ?? null;
  let current = fresh.find((row) => row.id === pointId);
  const drafts: OpDraft[] = [];
  if (current === undefined) {
    if (link === null) return null;
    current = newRow(relatorioId, pointId, values, link, fresh);
    drafts.push(createPointOp(author, current));
  } else if (current.removed_at !== null) {
    return null;
  }
  const writes = decide(current, nextIntervention);
  const puts: OpDraft[] = [];
  if (writes?.priority !== undefined) puts.push(putPointOp(author, relatorioId, pointId, 'priority', writes.priority));
  if (writes?.deadline !== undefined) puts.push(putPointOp(author, relatorioId, pointId, 'deadline', writes.deadline));
  // Nothing to put: nothing is written, not even the create.
  if (puts.length === 0) return null;
  const { batch_id } = await commitBatch(db, [...drafts, ...puts], { newId, now });
  return { batchId: batch_id, created: drafts.length > 0 };
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
): Promise<PointFieldsWrite | null> {
  return writePointFields(db, author, relatorioId, pointId, (point, nextIntervention) => priorityPickWrites(point, next, nextIntervention), link, values);
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
): Promise<PointFieldsWrite | null> {
  return writePointFields(db, author, relatorioId, pointId, (point) => (deadline === point.deadline ? null : { deadline }), link, values);
}

/** "Substituir": the current priority's suggestion over a typed Prazo. */
export function writeReplaceDeadline(db: AppDatabase, author: PointAuthor, relatorioId: string, pointId: string): Promise<PointFieldsWrite | null> {
  return writePointFields(db, author, relatorioId, pointId, replaceDeadlineWrite, null, { text: '', action: '', owner: '' });
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
  return { relatorio_id: v.relatorio_id, text: v.text, action: v.action, owner, is_new: v.is_new, equipmentId: v.equipmentId, origin: v.origin };
}
