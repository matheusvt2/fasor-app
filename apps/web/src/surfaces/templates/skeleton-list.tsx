import {
  localSubText,
  nodeSummaryText,
  quantityLabel,
  skeletonHeading,
  TOTALS_ORDER,
  type ComposerBlockNode,
  type ComposerCabine,
  type ComposerColuna,
  type ComposerNode,
  type ComposerPainel,
  type ComposerView,
  type EquipmentBlockType,
} from '@app/domain';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Button, OverflowMenu, QuantityStepper, TextButton, Toggle, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { restoreFocus } from '../../input/focus-restore.ts';
import { DragHandle, PositionBox } from './reorder-controls.tsx';
import { useReorder } from './use-reorder.ts';

export interface SkeletonListProps {
  view: ComposerView;
  /** The palette's target: a local (made current by "Adicionar equipamento") or a coluna (its row open), or null. */
  currentRef: string | null;
  /** A coluna row's head: the coluna becomes the palette's target. */
  onSelect: (ref: string) => void;
  onToggleAgrupar: (ref: string, value: boolean) => void;
  onMove: (node: ComposerNode, toIndex: number) => Promise<void>;
  /** "Renomear" of a painel or a coluna; "Função e nome" of a local. */
  onRename: (node: ComposerNode) => void;
  onRemove: (node: ComposerNode) => void;
  onSetQuantity: (ref: string, type: EquipmentBlockType, n: number) => Promise<void>;
  /** The foot's "Adicionar local": opens the Função dialog. */
  onAddLocal: () => void;
  /** A local's "Adicionar equipamento": the local becomes the palette's target. */
  onAddEquipamento: (local: ComposerCabine) => void;
  onAddPainel: (local: ComposerCabine) => void;
  /** "Adicionar coluna" of a painel, or of a local that already holds colunas directly. */
  onAddColuna: (parent: ComposerCabine | ComposerPainel) => void;
}

const Plus = () => (
  <svg className="ico" aria-hidden="true">
    <use href="/sprite.svg#i-plus" />
  </svg>
);

/**
 * The location skeleton of `42-template-composer.html` (Story 14.2: Local › Painel ›
 * Coluna): one `.local-card` per local (kicker, name, `nodeSummaryText`, the Função and
 * Agrupar por tipo sub-line, the Toggle, the Overflow) that expands into its own equipment
 * (`.loc-direct`), the colunas directly under it (the shape before the painel level), its
 * `.painel-card`s and its `.skeleton-actions`; a painel card expands into its
 * `.column-list` of `.column-row`s, or says why it takes no equipment while it has none.
 * The current coluna is open and shows its quantities in `.col-body .qty-grid`; the
 * current local shows its own in `.loc-direct`. Every row reorders every way `useReorder`
 * gives. Cards start open; the card body collapses and expands them.
 */
export function SkeletonList(props: SkeletonListProps) {
  const { view, onAddLocal } = props;
  const headingId = useId();
  // Collapsed cards by ref: local to the mount, never persisted. A new card is open.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (ref: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(ref)) next.add(ref);
      return next;
    });
  const open = (ref: string) => setCollapsed((current) => (current.has(ref) ? new Set([...current].filter((held) => held !== ref)) : current));
  const expand: Expand = { isOpen: (ref) => !collapsed.has(ref), toggle, open };
  return (
    <section className="section" aria-labelledby={headingId}>
      <div className="section-head">
        {/* tabIndex -1: the focus lands here when a removal empties the skeleton. */}
        <h2 id={headingId} tabIndex={-1}>
          {skeletonHeading(view)}
        </h2>
        <span className="section-note">{copy.composer.skeletonNote}</span>
      </div>
      {view.cabines.length === 0 ? null : (
        <ul className="skeleton-list block-list" aria-label={copy.composer.skeletonListLabel} data-composer-list="skeleton">
          {view.cabines.map((cabine) => (
            <LocalCard key={cabine.ref} cabine={cabine} expand={expand} {...props} />
          ))}
        </ul>
      )}
      <div className="skeleton-actions">
        <Button variant="secondary" onPress={onAddLocal}>
          <Plus />
          {copy.composer.addLocal}
        </Button>
        <span className="btn-reason">{copy.composer.skeletonFootNote}</span>
      </div>
    </section>
  );
}

interface Expand {
  isOpen: (ref: string) => boolean;
  toggle: (ref: string) => void;
  /** Opens a collapsed card; an open one stays as it is. */
  open: (ref: string) => void;
}

type CardProps = SkeletonListProps & { expand: Expand };

/**
 * A level's Overflow: its rename ("Função e nome" on a local), Subir · Descer, what the
 * level adds under itself ("Adicionar painel", "Adicionar coluna"), then Remover in its red
 * group; a move off either end is not offered.
 */
function nodeMenu(
  node: ComposerNode,
  reorder: ReturnType<typeof useReorder>,
  props: Pick<SkeletonListProps, 'onRename' | 'onRemove' | 'onAddPainel' | 'onAddColuna'> & { expand: Expand },
): { items: OverflowMenuAction[]; destructiveItems: OverflowMenuAction[] } {
  const trigger = () => reorder.row()?.querySelector<HTMLElement>(':scope > .overflow-trigger, :scope > .col-line > .overflow-trigger') ?? null;
  const items: OverflowMenuAction[] = [
    { id: 'rename', label: node.kind === 'cabine' ? copy.composer.funcaoENome : copy.composer.rename, onAction: () => props.onRename(node) },
  ];
  if (node.position > 1) {
    items.push({ id: 'up', label: copy.composer.moveUp, onAction: () => void reorder.moveTo(node.position - 2, trigger) });
  }
  if (node.position < node.siblings) {
    items.push({ id: 'down', label: copy.composer.moveDown, onAction: () => void reorder.moveTo(node.position, trigger) });
  }
  // What the Overflow adds is born inside the card: a collapsed card opens, so the new painel or coluna is in view.
  const addUnder = (add: () => void) => () => {
    props.expand.open(node.ref);
    add();
  };
  if (node.kind === 'cabine') items.push({ id: 'add-painel', label: copy.composer.addPainel, onAction: addUnder(() => props.onAddPainel(node)) });
  if (node.kind === 'painel') items.push({ id: 'add-coluna', label: copy.composer.addColuna, onAction: addUnder(() => props.onAddColuna(node)) });
  return { items, destructiveItems: [{ id: 'remove', label: copy.composer.remove, onAction: () => props.onRemove(node) }] };
}

interface QtyGridProps {
  node: ComposerBlockNode;
  onSetQuantity: SkeletonListProps['onSetQuantity'];
  /** The node's head (the coluna's `.col-head`, the local card's body). */
  head: () => HTMLElement | null;
}

/**
 * A node's quantities. A row leaves when its count reaches zero; if it held the keyboard
 * focus, the focus goes to the node's head instead of falling to the page.
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

/** `.card-chev`: the decorative chevron of a card whose body expands and collapses it. */
const CardChevron = () => (
  <span className="icon-btn card-chev" aria-hidden="true">
    <svg className="ico">
      <use href="/sprite.svg#i-chev-down" />
    </svg>
  </span>
);

/** The body of a local or painel card: the kicker, the name, the flag and the sub-line; a press expands or collapses the card. */
function CardBody({ kicker, name, nameId, flag, sub, open, controls, onToggle }: { kicker: string; name: string; nameId?: string; flag: string; sub: ReactNode; open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button type="button" className="block-body" aria-expanded={open} aria-controls={open ? controls : undefined} onClick={onToggle}>
      {/* The spaces keep the parts apart in the button's accessible name ("Local Cubículo Enel 9 blocos"); the flex line drops them. */}
      <span className="block-line">
        <span className="level-kicker">{kicker}</span>{' '}
        <span className="block-name" id={nameId}>
          {name}
        </span>{' '}
        <span className="loc-flag">{flag}</span>
      </span>{' '}
      <span className="block-sub">{sub}</span>
    </button>
  );
}

function LocalCard({ cabine, ...props }: CardProps & { cabine: ComposerCabine }) {
  const { currentRef, onToggleAgrupar, onMove, onSetQuantity, onAddEquipamento, onAddPainel, onAddColuna, expand } = props;
  const reorder = useReorder({
    itemKey: cabine.ref,
    position: cabine.position,
    siblings: cabine.siblings,
    onMove: (to) => onMove(cabine, to),
  });
  const nameId = useId();
  const toggleLabelId = useId();
  const toggleId = useId();
  const expandId = useId();
  const summary = nodeSummaryText(cabine);
  const isCurrent = currentRef === cabine.ref;
  const open = expand.isOpen(cabine.ref);
  const menu = nodeMenu(cabine, reorder, props);
  const className = ['block-card', 'local-card', open && 'is-open', isCurrent && 'is-current', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
  return (
    <li className={className} {...reorder.rowProps}>
      <DragHandle name={cabine.name} reorder={reorder} />
      <PositionBox name={cabine.name} position={cabine.position} siblings={cabine.siblings} reorder={reorder} />
      <CardBody
        kicker={copy.composer.levelLocal}
        name={cabine.name}
        nameId={nameId}
        flag={summary.flag}
        sub={localSubText(cabine)}
        open={open}
        controls={expandId}
        onToggle={() => expand.toggle(cabine.ref)}
      />
      <span className="cabine-toggle">
        {/* Tapping the row label toggles too (EXPERIENCE.md › Toggle). */}
        <label className="loc-flag" id={toggleLabelId} htmlFor={toggleId}>
          {copy.composer.agruparPorTipo}
        </label>
        <Toggle
          id={toggleId}
          isSelected={cabine.agrupar_por_tipo}
          aria-labelledby={`${toggleLabelId} ${nameId}`}
          onChange={(value) => onToggleAgrupar(cabine.ref, value)}
        />
      </span>
      <CardChevron />
      <OverflowMenu name={cabine.name} items={menu.items} destructiveItems={menu.destructiveItems} />
      {open ? (
        <div className="block-expand" id={expandId}>
          {/* `.loc-direct.is-empty` shows only while the local is the palette's target (the mock's own rule). */}
          <div className={cabine.blockCount > 0 ? 'loc-direct' : 'loc-direct is-empty'}>
            <p className="table-title">
              {copy.composer.locDirectTitle} <span className="loc-current">{copy.composer.locCurrent}</span>
            </p>
            {cabine.blockCount > 0 ? (
              <QtyGrid node={cabine} onSetQuantity={onSetQuantity} head={() => reorder.row()?.querySelector<HTMLElement>(':scope > .block-body') ?? null} />
            ) : (
              <p className="section-note loc-none">{copy.composer.locNone}</p>
            )}
          </div>
          {cabine.colunas.length === 0 ? null : (
            <ul className="column-list" aria-label={copy.composer.columnListLabel(cabine.name)}>
              {cabine.colunas.map((coluna) => (
                <ColunaRow key={coluna.ref} coluna={coluna} {...props} />
              ))}
            </ul>
          )}
          {cabine.paineis.length === 0 ? null : (
            <ul className="skeleton-list painel-list" aria-label={copy.composer.painelListLabel(cabine.name)}>
              {cabine.paineis.map((painel) => (
                <PainelCard key={painel.ref} painel={painel} local={cabine} {...props} />
              ))}
            </ul>
          )}
          <div className="skeleton-actions">
            <Button variant="secondary" aria-pressed={isCurrent} onPress={() => onAddEquipamento(cabine)}>
              <Plus />
              {copy.composer.addEquipamento}
            </Button>
            <TextButton onPress={() => onAddPainel(cabine)}>
              <Plus />
              {copy.composer.addPainel}
            </TextButton>
            {/* A local that already holds colunas directly (a template from before the painel level) keeps adding them. */}
            {cabine.colunas.length === 0 ? null : (
              <TextButton onPress={() => onAddColuna(cabine)}>
                <Plus />
                {copy.composer.addColuna}
              </TextButton>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function PainelCard({ painel, local, ...props }: CardProps & { painel: ComposerPainel; local: ComposerCabine }) {
  const { onMove, onAddColuna, expand } = props;
  const reorder = useReorder({
    itemKey: painel.ref,
    position: painel.position,
    siblings: painel.siblings,
    onMove: (to) => onMove(painel, to),
  });
  const expandId = useId();
  const summary = nodeSummaryText(painel);
  const open = expand.isOpen(painel.ref);
  const menu = nodeMenu(painel, reorder, props);
  const empty = painel.colunas.length === 0;
  const className = ['block-card', 'painel-card', open && 'is-open', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
  const add = (
    <>
      <Plus />
      {copy.composer.addColuna}
    </>
  );
  return (
    <li className={className} {...reorder.rowProps}>
      <DragHandle name={painel.name} reorder={reorder} />
      <PositionBox name={painel.name} position={painel.position} siblings={painel.siblings} reorder={reorder} />
      <CardBody
        kicker={copy.composer.levelPainel}
        name={painel.name}
        flag={summary.flag}
        sub={empty ? copy.composer.painelNewSub : summary.sum}
        open={open}
        controls={expandId}
        onToggle={() => expand.toggle(painel.ref)}
      />
      <CardChevron />
      <OverflowMenu name={painel.name} items={menu.items} destructiveItems={menu.destructiveItems} />
      {open ? (
        <div className="block-expand" id={expandId}>
          {empty ? (
            // A painel only groups colunas: with none, it says why it takes no equipment.
            <p className="section-note pnl-empty" role="note">
              {copy.composer.painelEmpty}
            </p>
          ) : (
            <ul className="column-list" aria-label={copy.composer.columnListLabel(`${painel.name} em ${local.name}`)}>
              {painel.colunas.map((coluna) => (
                <ColunaRow key={coluna.ref} coluna={coluna} {...props} />
              ))}
            </ul>
          )}
          <div className="skeleton-actions">
            {/* The mock draws the empty painel's as the secondary button, the others' as text. */}
            {empty ? (
              <Button variant="secondary" onPress={() => onAddColuna(painel)}>
                {add}
              </Button>
            ) : (
              <TextButton onPress={() => onAddColuna(painel)}>{add}</TextButton>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ColunaRow({ coluna, ...props }: CardProps & { coluna: ComposerColuna }) {
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
