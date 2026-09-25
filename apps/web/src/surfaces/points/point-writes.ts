import { createPointOp, livePoints, newPointRow, putPointOp, type OpDraft, type PointRow } from '@app/domain';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { pointRowsOf } from '../../db/home-store.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { newId } from '../../ids.ts';

/*
 * E6-Q2: the point editor autosaves per field like every other surface (EXPERIENCE.md ›
 * Autosave, FR-61). A new point is created (`point` create op, with the id the editor
 * generated up front) the first time its text or action is not empty; every later change
 * is a `point/{id}/{field}` put. The editor and the draft recovery of a closed editor both
 * write through here, so the two paths cannot disagree.
 */

/** The draft surface of the point editor (`point/{id}`, the DraftProvider's vocabulary). */
export const POINT_DRAFT_SURFACE = 'point';

export interface PointAuthor {
  id: string;
  companyId: string;
}

/** The editor's two fields as typed: the text with its photo tokens, and the raw action. */
export interface PointValues {
  text: string;
  action: string;
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
  const drafts: OpDraft[] = [];
  if (current === undefined) {
    if (link === null) return { kind: 'gone' };
    if (values.text.trim() === '' && action === null) return { kind: 'unchanged' };
    const row = newPointRow({ id: pointId, relatorioId, text: values.text, equipmentId: link.equipmentId, origin: link.origin, action }, fresh);
    drafts.push(createPointOp(author, row));
  } else {
    if (current.removed_at !== null) return { kind: 'gone' };
    if (fields.includes('text') && values.text !== current.text) drafts.push(putPointOp(author, relatorioId, pointId, 'text', values.text));
    if (fields.includes('action') && action !== current.action) drafts.push(putPointOp(author, relatorioId, pointId, 'action', action));
    if (drafts.length === 0) return { kind: 'unchanged' };
  }
  await commitBatch(db, drafts, { newId, now });
  return { kind: 'written', created: current === undefined };
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
  return { relatorio_id: v.relatorio_id, text: v.text, action: v.action, is_new: v.is_new, equipmentId: v.equipmentId, origin: v.origin };
}
