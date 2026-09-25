import { fixedRowNote, type SumarioRow as Row } from '@app/domain';
import { useId, type ReactNode } from 'react';
import { OverflowMenu, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { PositionBox } from '../templates/reorder-controls.tsx';
import { LIST_FOCUS_WATCH_FRAMES, useReorder, type Reorder } from '../templates/use-reorder.ts';

export interface RowActions {
  /** Moves the row to a 0-based index among the numbered rows; resolves once written. */
  onMove: (row: Row, toIndex: number) => Promise<void>;
  onOpen: (row: Row) => void;
  onAddBelow: (row: Row) => void;
  onDuplicate: (row: Row) => void;
  onRemove: (row: Row) => void;
}

/**
 * The row's chevron in the trailing `.sum-ctrls` cluster (v0.9, `key-relatorio-overview-v09.html`):
 * a drawn hint that the row opens, not a control of its own; the tap goes to `.sum-open`.
 */
const Chevron = () => (
  <span className="icon-btn sum-chev" aria-hidden="true">
    <svg className="ico" aria-hidden="true">
      <use href="/sprite.svg#i-chev-right" />
    </svg>
  </span>
);

/** `.sum-body`: the title and the status line the kernel wrote; red and bold when blocking. */
export function RowBody({ row }: { row: Row }) {
  return (
    <span className="sum-body">
      <span className="sum-title">{row.title}</span>
      <span className={row.blocking ? 'sum-status is-blocking' : 'sum-status'}>{row.meta}</span>
    </span>
  );
}

/** `.sum-open`: a button on a row that opens somewhere, a plain box on one that does not yet. */
export function RowOpen({ row, onOpen, children }: { row: Row; onOpen?: (row: Row) => void; children?: ReactNode }) {
  if (onOpen === undefined) {
    return (
      <div className="sum-open" data-kind={row.kind}>
        <RowBody row={row} />
        {children}
      </div>
    );
  }
  return (
    <button type="button" className="sum-open" data-kind={row.kind} onClick={() => onOpen(row)}>
      <RowBody row={row} />
      {children}
    </button>
  );
}

/**
 * The Overflow of a numbered row, in the mock's order: Adicionar abaixo · Subir · Descer ·
 * Duplicar, then Remover in its red group; a generated row (7 and 9, produced by the
 * renderer) offers Subir · Descer only (Design Notes). A move off either end is not offered.
 */
export function rowMenu(row: Row, reorder: Reorder, actions: RowActions) {
  const trigger = () => reorder.row()?.querySelector<HTMLElement>('.sum-ctrls .overflow-trigger') ?? null;
  const t = copy.sumario;
  const items: OverflowMenuAction[] = [];
  const generated = row.kind === 'generated';
  if (!generated) items.push({ id: 'add-below', label: t.addBelow, onAction: () => actions.onAddBelow(row) });
  if (row.position > 1) items.push({ id: 'up', label: t.moveUp, onAction: () => void reorder.moveTo(row.position - 2, trigger) });
  if (row.position < row.siblings) items.push({ id: 'down', label: t.moveDown, onAction: () => void reorder.moveTo(row.position, trigger) });
  if (!generated) items.push({ id: 'duplicate', label: t.duplicate, onAction: () => actions.onDuplicate(row) });
  const destructiveItems: OverflowMenuAction[] = generated ? [] : [{ id: 'remove', label: t.remove, onAction: () => actions.onRemove(row) }];
  return { items, destructiveItems };
}

/** One of the two fixed rows: no Position box, no Overflow, the `.sum-ro` note instead. */
export function FixedRow({ row, onOpen }: { row: Row; onOpen?: (row: Row) => void }) {
  return (
    <li className={row.pending ? 'sum-row has-pend' : 'sum-row'} data-row={row.rowKey}>
      <span className="sum-pos-empty" aria-hidden="true" />
      <RowOpen row={row} onOpen={onOpen} />
      <span className="sum-ctrls">
        <span className="sum-ro">{fixedRowNote(row.rowKey as 'capa' | 'controle')}</span>
        {onOpen === undefined ? null : <Chevron />}
      </span>
    </li>
  );
}

/**
 * A numbered row: its number is the Position box (typing another moves it), the body
 * opens the object for the kinds that have one, and the Overflow holds the reorder
 * actions. Alt+Up/Down anywhere in the row moves it (`useReorder`).
 */
export function NumberedRow({ row, actions, openable }: { row: Row; actions: RowActions; openable: boolean }) {
  const reorder = useReorder({ itemKey: row.key, position: row.position, siblings: row.siblings, onMove: (to) => actions.onMove(row, to), focusFrames: LIST_FOCUS_WATCH_FRAMES });
  const menu = rowMenu(row, reorder, actions);
  const className = ['sum-row', row.pending && 'has-pend'].filter(Boolean).join(' ');
  return (
    <li className={className} data-row={row.rowKey} data-block-id={row.blockId ?? undefined} {...reorder.rowProps}>
      <PositionBox
        name={row.title}
        position={row.position}
        siblings={row.siblings}
        reorder={reorder}
        className="sum-pos"
        label={copy.sumario.positionLabel(row.title)}
      />
      <RowOpen row={row} onOpen={openable ? actions.onOpen : undefined} />
      <span className="sum-ctrls">
        {openable ? <Chevron /> : null}
        <OverflowMenu name={row.title} items={menu.items} destructiveItems={menu.destructiveItems} />
      </span>
    </li>
  );
}

export interface Section9RowProps {
  row: Row;
  actions: RowActions;
  expanded: boolean;
  onToggle: () => void;
  /** The tree drawn under the row when expanded, given the id the chevron controls. */
  children: (treeId: string) => ReactNode;
  /** The chevron, so a header count can move the focus here. */
  chevronRef?: (element: HTMLButtonElement | null) => void;
}

/** Row 9: the same row with the `.tree-chevron` in front, and the note and tree below when open. */
export function Section9Row({ row, actions, expanded, onToggle, children, chevronRef }: Section9RowProps) {
  const reorder = useReorder({ itemKey: row.key, position: row.position, siblings: row.siblings, onMove: (to) => actions.onMove(row, to), focusFrames: LIST_FOCUS_WATCH_FRAMES });
  const menu = rowMenu(row, reorder, actions);
  const treeId = useId();
  const className = ['sum-row', 'sum-s9', expanded && 'is-open', row.pending && 'has-pend'].filter(Boolean).join(' ');
  return (
    <li className={className} data-row={row.rowKey} data-block-id={row.blockId ?? undefined} {...reorder.rowProps}>
      <div className="sum-s9-head">
        <button
          type="button"
          className="tree-chevron"
          aria-label={copy.sumario.s9Toggle}
          aria-expanded={expanded}
          aria-controls={treeId}
          onClick={onToggle}
          ref={chevronRef}
        >
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-chev-down" />
          </svg>
        </button>
        <PositionBox
          name={row.title}
          position={row.position}
          siblings={row.siblings}
          reorder={reorder}
          className="sum-pos"
          label={copy.sumario.positionLabel(row.title)}
        />
        <RowBody row={row} />
        <span className="sum-ctrls">
          <OverflowMenu name={row.title} items={menu.items} destructiveItems={menu.destructiveItems} />
        </span>
      </div>
      <p className="s9-note">{copy.sumario.s9Note}</p>
      {children(treeId)}
    </li>
  );
}
