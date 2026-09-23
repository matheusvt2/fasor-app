import {
  nodeSummaryText,
  quantityLabel,
  skeletonHeading,
  TOTALS_ORDER,
  type ComposerCabine,
  type ComposerColuna,
  type ComposerNode,
  type ComposerView,
  type EquipmentBlockType,
} from '@app/domain';
import { useId, useRef } from 'react';
import { Button, OverflowMenu, QuantityStepper, TextButton, Toggle, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { DragHandle, PositionBox } from './reorder-controls.tsx';
import { restoreFocus, useReorder } from './use-reorder.ts';

export interface SkeletonListProps {
  view: ComposerView;
  currentRef: string | null;
  onSelect: (ref: string) => void;
  onToggleAgrupar: (ref: string, value: boolean) => void;
  onMove: (node: ComposerNode, toIndex: number) => Promise<void>;
  onRename: (node: ComposerNode) => void;
  onRemove: (node: ComposerNode) => void;
  onSetQuantity: (ref: string, type: EquipmentBlockType, n: number) => Promise<void>;
  onAddCabine: () => void;
  onAddColuna: () => void;
  /** Why "Adicionar coluna" cannot add now, or undefined when it can. */
  addColunaReason: string | undefined;
}

/**
 * The location skeleton of `42-template-composer.html`: one `.cabine-card` per cabine
 * (name, `nodeSummaryText`, Agrupar por tipo, Overflow) with its `.column-list` of
 * `.column-row`s, and the `.skeleton-actions`. The current node is open: a coluna row
 * shows its quantities in `.col-body .qty-grid`, a cabine card its own (blocks placed on
 * the cabine with no coluna). Every row reorders every way `useReorder` gives.
 */
export function SkeletonList(props: SkeletonListProps) {
  const { view, onAddCabine, onAddColuna, addColunaReason } = props;
  const headingId = useId();
  return (
    <section className="section" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{skeletonHeading(view)}</h2>
        <span className="section-note">{copy.composer.skeletonNote}</span>
      </div>
      {view.cabines.length === 0 ? null : (
        <ul className="skeleton-list block-list" aria-label={copy.composer.skeletonListLabel}>
          {view.cabines.map((cabine) => (
            <CabineCard key={cabine.ref} cabine={cabine} {...props} />
          ))}
        </ul>
      )}
      <div className="skeleton-actions">
        <TextButton isDisabled={addColunaReason !== undefined} disabledReason={addColunaReason} onPress={onAddColuna}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-plus" />
          </svg>
          {copy.composer.addColuna}
        </TextButton>
        <Button variant="secondary" onPress={onAddCabine}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-plus" />
          </svg>
          {copy.composer.addCabine}
        </Button>
      </div>
    </section>
  );
}

/** Renomear · Subir · Descer, then Remover in its red group; a move off either end is not offered. */
function nodeMenu(
  node: ComposerNode,
  reorder: ReturnType<typeof useReorder>,
  props: Pick<SkeletonListProps, 'onRename' | 'onRemove'>,
): { items: OverflowMenuAction[]; destructiveItems: OverflowMenuAction[] } {
  const trigger = () => reorder.row()?.querySelector<HTMLElement>(':scope > .overflow-trigger, :scope > .col-line > .overflow-trigger') ?? null;
  const items: OverflowMenuAction[] = [{ id: 'rename', label: copy.composer.rename, onAction: () => props.onRename(node) }];
  if (node.position > 1) {
    items.push({ id: 'up', label: copy.composer.moveUp, onAction: () => void reorder.moveTo(node.position - 2, trigger) });
  }
  if (node.position < node.siblings) {
    items.push({ id: 'down', label: copy.composer.moveDown, onAction: () => void reorder.moveTo(node.position, trigger) });
  }
  return { items, destructiveItems: [{ id: 'remove', label: copy.composer.remove, onAction: () => props.onRemove(node) }] };
}

interface QtyGridProps {
  node: ComposerNode;
  onSetQuantity: SkeletonListProps['onSetQuantity'];
  /** The node's head (the coluna's `.col-head`, the cabine's body button). */
  head: () => HTMLElement | null;
}

/**
 * The open node's quantities. A row leaves when its count reaches zero; if it held the
 * keyboard focus, the focus goes to the node's head instead of falling to the page.
 */
function QtyGrid({ node, onSetQuantity, head }: QtyGridProps) {
  const types = TOTALS_ORDER.filter((type) => node.quantities[type] > 0);
  if (types.length === 0) return null;
  return (
    <div className="qty-grid">
      {types.map((type) => (
        <div className="qty-row" key={type} data-type={type}>
          <span className="qty-name">{copy.composer.equipmentNames[type]}</span>
          <QuantityStepper
            value={node.quantities[type]}
            label={(n) => quantityLabel(type, n)}
            onCommit={async (n) => {
              const row = document.activeElement?.closest('.qty-row') ?? null;
              const leaving = n === 0 && row !== null && (row as HTMLElement).dataset.type === type;
              await onSetQuantity(node.ref, type, n);
              if (leaving) restoreFocus(head);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function CabineCard({ cabine, ...props }: SkeletonListProps & { cabine: ComposerCabine }) {
  const { currentRef, onSelect, onToggleAgrupar, onMove, onSetQuantity } = props;
  const reorder = useReorder({
    itemKey: cabine.ref,
    position: cabine.position,
    siblings: cabine.siblings,
    onMove: (to) => onMove(cabine, to),
  });
  const nameId = useId();
  const toggleLabelId = useId();
  const bodyButton = useRef<HTMLButtonElement>(null);
  const summary = nodeSummaryText(cabine);
  const isCurrent = currentRef === cabine.ref;
  const showOwn = isCurrent && cabine.blockCount > 0;
  const menu = nodeMenu(cabine, reorder, props);
  const className = ['block-card', 'cabine-card', isCurrent && 'is-open', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
  return (
    <li className={className} {...reorder.rowProps}>
      <DragHandle name={cabine.name} reorder={reorder} />
      <PositionBox name={cabine.name} position={cabine.position} siblings={cabine.siblings} reorder={reorder} />
      <button
        ref={bodyButton}
        type="button"
        className="block-body"
        aria-current={isCurrent || undefined}
        onClick={() => onSelect(cabine.ref)}
      >
        <span className="block-line">
          <span className="block-name" id={nameId}>
            {cabine.name}
          </span>
          <span className="cabine-flag">{summary.flag}</span>
        </span>
        <span className="block-sub">{summary.sum}</span>
      </button>
      <span className="cabine-toggle">
        <span className="cabine-flag" id={toggleLabelId}>
          {copy.composer.agruparPorTipo}
        </span>
        <Toggle
          isSelected={cabine.agrupar_por_tipo}
          aria-labelledby={`${toggleLabelId} ${nameId}`}
          onChange={(value) => onToggleAgrupar(cabine.ref, value)}
        />
      </span>
      <OverflowMenu name={cabine.name} items={menu.items} destructiveItems={menu.destructiveItems} />
      {/* Drawn only with something in it: a cabine with no coluna and no own blocks open has none. */}
      {showOwn || cabine.colunas.length > 0 ? (
        <div className="block-expand">
          {showOwn ? (
            <div className="col-body">
              <QtyGrid node={cabine} onSetQuantity={onSetQuantity} head={() => bodyButton.current} />
            </div>
          ) : null}
          {cabine.colunas.length === 0 ? null : (
            <ul className="column-list" aria-label={copy.composer.columnListLabel(cabine.name)}>
              {cabine.colunas.map((coluna) => (
                <ColunaRow key={coluna.ref} coluna={coluna} {...props} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function ColunaRow({ coluna, ...props }: SkeletonListProps & { coluna: ComposerColuna }) {
  const { currentRef, onSelect, onMove, onSetQuantity } = props;
  const reorder = useReorder({
    itemKey: coluna.ref,
    position: coluna.position,
    siblings: coluna.siblings,
    onMove: (to) => onMove(coluna, to),
  });
  const bodyId = useId();
  const headButton = useRef<HTMLButtonElement>(null);
  const isOpen = currentRef === coluna.ref;
  const menu = nodeMenu(coluna, reorder, props);
  const className = ['column-row', isOpen && 'is-open', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
  return (
    <li className={className} {...reorder.rowProps}>
      <div className="col-line">
        <DragHandle name={coluna.name} reorder={reorder} />
        <PositionBox name={coluna.name} position={coluna.position} siblings={coluna.siblings} reorder={reorder} />
        <button
          ref={headButton}
          type="button"
          className="col-head"
          aria-expanded={isOpen}
          aria-controls={isOpen ? bodyId : undefined}
          onClick={() => onSelect(coluna.ref)}
        >
          <span className="col-name">{coluna.name}</span>
          <span className="col-sum">{nodeSummaryText(coluna).sum}</span>
        </button>
        <OverflowMenu name={coluna.name} items={menu.items} destructiveItems={menu.destructiveItems} />
      </div>
      {isOpen ? (
        <div className="col-body" id={bodyId}>
          <QtyGrid node={coluna} onSetQuantity={onSetQuantity} head={() => headButton.current} />
        </div>
      ) : null}
    </li>
  );
}
