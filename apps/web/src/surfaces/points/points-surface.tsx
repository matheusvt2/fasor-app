import {
  buildSnapshot,
  derivedPointReasonText,
  extractPhotoRefs,
  moveLandingIndex,
  numberPhotos,
  photoRefLabel,
  pointMovedText,
  pointMoveOrderKey,
  pointOrderText,
  pointsHeadingText,
  pointSavedText,
  pointTextTokens,
  pointTitle,
  putPointOp,
  removePointOp,
  sectionEightEntries,
  type DerivedPoint,
  type EntityState,
  type PointRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, ConfirmDialog, OverflowMenu, TextButton, type OverflowMenuAction } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { pointRowsOf } from '../../db/home-store.ts';
import { useRelatorioPhotoTiles, type PhotoTile } from '../../db/photo-store.ts';
import { newId } from '../../ids.ts';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from '../../input/focus-restore.ts';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { RelatorioGate } from '../relatorio/relatorio-gate.tsx';
import { DragHandle } from '../templates/reorder-controls.tsx';
import { useReorder } from '../templates/use-reorder.ts';
import { PhotoRefTile } from './photo-ref-tile.tsx';
import { PointEditor } from './point-editor.tsx';
import './points.css';

/*
 * `/relatorio/:id/pontos` (Story 6.6, `72-pontos.html`, Sumário row 8): section 8 in print
 * order. The live points first, each a Point of attention card with its order line, title
 * (its equipment, else "Geral"), text with its photo references as "Imagem N", referenced
 * photos and Ação; they reorder three ways (drag handle, Overflow "Subir · Descer",
 * Alt+↑/↓) with one `point/{id}/order_key` op each, announced. Then one read-only `.is-auto`
 * card per sheet marked Não ensaiado (`derivedPoints`, never stored). "Criar" opens a new
 * card in edit mode after the live points; "Editar" opens a card in place.
 */
export function PointsSurface() {
  const { id = '' } = useParams();
  return (
    <main className="screen" data-route="/relatorio/:id/pontos">
      <RelatorioGate id={id}>{(state) => <Points key={id} relatorioId={id} state={state} />}</RelatorioGate>
    </main>
  );
}

type Editing = { kind: 'new' } | { kind: 'point'; id: string } | null;

function Points({ relatorioId, state }: { relatorioId: string; state: EntityState }) {
  const t = copy.points;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const edits = useUndoableEdits();
  const snapshot: RelatorioSnapshot = useMemo(() => buildSnapshot(state, relatorioId), [state, relatorioId]);
  const entries = useMemo(() => sectionEightEntries(snapshot), [snapshot]);
  const live = useMemo(() => entries.flatMap((entry) => (entry.kind === 'point' ? [entry.point] : [])), [entries]);
  const derived = useMemo(() => entries.flatMap((entry) => (entry.kind === 'derived' ? [entry.derived] : [])), [entries]);
  const numbers = useMemo(() => numberPhotos(snapshot.files), [snapshot.files]);
  const tiles = useRelatorioPhotoTiles(db, relatorioId);

  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<PointRow | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const createButton = () => bar.current?.querySelector<HTMLElement>('.btn-primary') ?? null;

  const author = user === null ? null : { id: user.id, companyId: user.companyId };

  /** The card of a point (its "Editar", else the card), for the focus after an edit. */
  const cardFocusTarget = (pointId: string): HTMLElement | null => {
    const card = listRef.current?.querySelector<HTMLElement>(`[data-reorder-key="${pointId}"]`) ?? null;
    return card?.querySelector<HTMLElement>(':scope > .poa-body > .row-wrap > .btn') ?? card;
  };

  async function move(point: PointRow, toIndex: number): Promise<void> {
    if (db === null || author === null) return;
    const landing = moveLandingIndex(live.length, toIndex);
    const batch = await edits
      .write(async () => {
        const key = pointMoveOrderKey(await pointRowsOf(db, relatorioId), point.id, toIndex);
        if (key === null) return null;
        return (await commitBatch(db, [putPointOp(author, relatorioId, point.id, 'order_key', key)], { newId, now })).batch_id;
      })
      .catch(() => null);
    if (batch !== null) setAnnouncement(pointMovedText(landing + 1, live.length));
  }

  /** The point whose editor closed with nothing written: its card takes the focus back. */
  const lastEdited = useRef('');

  function onDone(pointId: string | null, wasNew: boolean): void {
    setEditing(null);
    if (pointId === null) {
      restoreFocus(() => (wasNew ? createButton() : cardFocusTarget(lastEdited.current)), { frames: LIST_FOCUS_WATCH_FRAMES, once: true });
      return;
    }
    // The saved point's place: a new one lands last among the live points.
    const index = live.findIndex((row) => row.id === pointId);
    const total = wasNew ? live.length + 1 : live.length;
    const text = pointSavedText(index === -1 ? total : index + 1, total);
    edits.notify(text);
    setAnnouncement(text);
    restoreFocus(() => cardFocusTarget(pointId), { frames: LIST_FOCUS_WATCH_FRAMES, once: true });
  }

  async function remove(point: PointRow): Promise<void> {
    setRemoving(null);
    // Only the removed point's own editor closes: another point open in edit mode keeps its text.
    setEditing((current) => (current?.kind === 'point' && current.id === point.id ? null : current));
    if (db === null || author === null) return;
    const batch = await edits
      .write(async () => {
        const fresh = (await pointRowsOf(db, relatorioId)).find((row) => row.id === point.id);
        if (fresh === undefined || fresh.removed_at !== null) return null;
        return (await commitBatch(db, [removePointOp(author, relatorioId, point.id)], { newId, now })).batch_id;
      })
      .catch(() => null);
    if (batch === null) return;
    restoreFocus(() => heading.current, { frames: LIST_FOCUS_WATCH_FRAMES, once: true });
    edits.undoable(t.removed, batch, {
      label: t.undo,
      onUndo: () => restoreFocus(() => cardFocusTarget(point.id), { frames: LIST_FOCUS_WATCH_FRAMES, once: true }),
    });
  }

  const empty = entries.length === 0 && editing?.kind !== 'new';

  return (
    <>
      <div className="content">
        <section className="section" aria-labelledby={headingId}>
          <div className="section-head">
            <h2 id={headingId} tabIndex={-1} ref={heading}>
              {pointsHeadingText(live.length, derived.length)}
            </h2>
          </div>
          <p className="section-note">{t.sectionNote}</p>
          {empty ? <p className="poa-empty">{t.empty}</p> : null}
          <div className="poa-list" aria-label={t.listLabel} role="group" ref={listRef}>
            {live.map((point, i) =>
              editing?.kind === 'point' && editing.id === point.id ? (
                <PointEditor
                  key={point.id}
                  variant="card"
                  relatorioId={relatorioId}
                  snapshot={snapshot}
                  point={point}
                  position={i + 1}
                  total={live.length}
                  onDone={(pointId) => {
                    lastEdited.current = point.id;
                    onDone(pointId, false);
                  }}
                  onCancel={() => {
                    lastEdited.current = point.id;
                    onDone(null, false);
                  }}
                  onRemove={() => setRemoving(point)}
                />
              ) : (
                <PointCard
                  key={point.id}
                  point={point}
                  position={i + 1}
                  total={live.length}
                  snapshot={snapshot}
                  numbers={numbers}
                  tiles={tiles}
                  editable={editing === null}
                  onMove={(to) => move(point, to)}
                  onEdit={() => setEditing({ kind: 'point', id: point.id })}
                  onRemove={() => setRemoving(point)}
                />
              ),
            )}
            {editing?.kind === 'new' ? (
              <PointEditor
                key="new"
                variant="card"
                relatorioId={relatorioId}
                snapshot={snapshot}
                point={null}
                onDone={(pointId) => onDone(pointId, true)}
                onCancel={() => onDone(null, true)}
              />
            ) : null}
            {derived.map((entry) => (
              <DerivedCard key={entry.block_id} relatorioId={relatorioId} entry={entry} />
            ))}
          </div>
        </section>
      </div>

      <div className="sticky-action-bar" ref={bar}>
        <div className="bar-buttons">
          <Button variant="primary" isDisabled={editing !== null} disabledReason={t.editingReason} onPress={() => setEditing({ kind: 'new' })}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-plus" />
            </svg>
            {t.create}
          </Button>
        </div>
      </div>

      <p className="visually-hidden" role="status" data-testid="points-announcer">
        {announcement}
      </p>

      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t.removeTitle}
        description={t.removeDescription}
        confirmLabel={t.removePoint}
        isDestructive
        onConfirm={() => {
          if (removing !== null) void remove(removing);
        }}
      />
    </>
  );
}

/** A point's text as the card reads it: literal runs and "Imagem N" references. */
function PointText({ text, numbers }: { text: string; numbers: ReadonlyMap<string, number> }) {
  return (
    <p className="poa-text">
      {pointTextTokens(text).map((token, i) =>
        token.kind === 'text' ? (
          <span key={i}>{token.text}</span>
        ) : (
          <span key={i} className="photo-ref">
            {numbers.has(token.id) ? photoRefLabel(numbers.get(token.id)!) : copy.points.removedPhoto}
          </span>
        ),
      )}
    </p>
  );
}

function PointCard({
  point,
  position,
  total,
  snapshot,
  numbers,
  tiles,
  editable,
  onMove,
  onEdit,
  onRemove,
}: {
  point: PointRow;
  position: number;
  total: number;
  snapshot: RelatorioSnapshot;
  numbers: ReadonlyMap<string, number>;
  tiles: readonly PhotoTile[];
  editable: boolean;
  onMove: (toIndex: number) => Promise<void>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = copy.points;
  const titleId = useId();
  const reorder = useReorder({ itemKey: point.id, position, siblings: total, onMove, focusFrames: LIST_FOCUS_WATCH_FRAMES });
  const title = pointTitle(point, snapshot);
  const name = t.cardName(position, title);
  const refs = extractPhotoRefs(point.text);
  const trigger = () => reorder.row()?.querySelector<HTMLElement>(':scope > .overflow-trigger') ?? null;
  const items: OverflowMenuAction[] = [];
  if (position > 1) items.push({ id: 'up', label: t.moveUp, onAction: () => void reorder.moveTo(position - 2, trigger) });
  if (position < total) items.push({ id: 'down', label: t.moveDown, onAction: () => void reorder.moveTo(position, trigger) });
  const tileOf = new Map(tiles.map((tile) => [tile.id, tile]));
  return (
    <article
      className={reorder.dragging ? 'point-of-attention-card is-dragging' : 'point-of-attention-card'}
      aria-labelledby={titleId}
      {...reorder.rowProps}
    >
      <DragHandle name={name} reorder={reorder} />
      <div className="poa-body">
        <div>
          <span className="poa-order">{pointOrderText(position, total)}</span>
          <h3 className="poa-title" id={titleId}>
            {title}
          </h3>
        </div>
        {point.text.trim() === '' ? null : <PointText text={point.text} numbers={numbers} />}
        {refs.length === 0 ? null : (
          <div>
            <div className="poa-photos">
              {refs.map((id) => (
                <PhotoRefTile
                  key={id}
                  thumb={tileOf.get(id)?.thumb ?? null}
                  number={numbers.get(id) ?? null}
                  label={numbers.has(id) ? photoRefLabel(numbers.get(id)!) : t.removedPhoto}
                />
              ))}
            </div>
            <p className="poa-photos-meta">{t.photosMeta}</p>
          </div>
        )}
        <dl className="poa-fields">
          <div>
            <dt>{t.actionDt}</dt>
            <dd>{point.action === null || point.action.trim() === '' ? t.none : point.action}</dd>
          </div>
        </dl>
        {/* While another point is open in edit mode, "Editar" is absent: one editor at a time. */}
        {editable ? (
          <div className="row-wrap">
            <TextButton aria-label={t.editLabel(title, position)} onPress={onEdit}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-pencil" />
              </svg>
              {t.edit}
            </TextButton>
          </div>
        ) : null}
      </div>
      <OverflowMenu name={name} items={items} destructiveItems={[{ id: 'remove', label: t.remove, onAction: onRemove }]} />
    </article>
  );
}

/** A sheet marked Não ensaiado, listed by itself after the manual points; read-only. */
function DerivedCard({ relatorioId, entry }: { relatorioId: string; entry: DerivedPoint }) {
  const t = copy.points;
  const navigate = useNavigate();
  const titleId = useId();
  return (
    <article className="point-of-attention-card is-auto" aria-labelledby={titleId} data-block-id={entry.block_id}>
      <span className="handle-spacer" aria-hidden="true" />
      <div className="poa-body">
        <div>
          <span className="poa-order">{t.autoOrder}</span>
          <h3 className="poa-title" id={titleId}>
            {entry.title}
          </h3>
        </div>
        <div className="not-tested-band">
          <span className="not-tested-chip">{t.notTestedChip}</span>
          <span>{derivedPointReasonText(entry)}</span>
        </div>
        <div className="row-wrap">
          <TextButton onPress={() => void navigate(`/relatorio/${relatorioId}/ficha/${entry.block_id}`)}>{t.openSheet(entry.name)}</TextButton>
          <span className="btn-reason">{t.autoReason}</span>
        </div>
      </div>
    </article>
  );
}
