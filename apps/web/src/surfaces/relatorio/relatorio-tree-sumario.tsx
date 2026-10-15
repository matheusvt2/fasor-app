import { CABINE_META_NONE, duplicateTagText, type TreeEquipmentNode, type TreeLocationNode } from '@app/domain';
import { Button as AriaButton } from 'react-aria-components';
import { memo, useId, type KeyboardEvent } from 'react';
import { WholeWords } from '../../components/whole-words.tsx';
import { OverflowMenu, TextButton, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { DragHandle, PositionBox } from '../templates/reorder-controls.tsx';
import { LIST_FOCUS_WATCH_FRAMES } from '../../input/focus-restore.ts';
import { useReorder, type Reorder } from '../templates/use-reorder.ts';
import { blockTrigger, locationTrigger } from './tree-actions.ts';
import { Chevron, locationMenu, sameRow, treeKeys, type Shared } from './relatorio-tree-shared.tsx';

/*
 * E14-A7: the Sumário presentation of the relatório tree (`relatorio-tree.tsx` says what each
 * presentation draws): section 9's location rows and equipment rows.
 */

const PlusIcon = () => (
  <svg className="ico" aria-hidden="true">
    <use href="/sprite.svg#i-plus" />
  </svg>
);

/** A local row, a painel row or a coluna row, with what hangs under it when open. */
export const SumarioLocation = memo(function SumarioLocation({ node, shared }: { node: TreeLocationNode; shared: Shared }) {
  const t = copy.sumario.tree;
  const open = shared.isOpen(node);
  const eqsId = useId();
  const colsId = useId();
  const pnlsId = useId();
  const reorder = useReorder({
    itemKey: node.id,
    position: node.position,
    siblings: node.siblings,
    onMove: (to) => shared.actions.moveLocation(node, to),
    focusFrames: LIST_FOCUS_WATCH_FRAMES,
  });
  const trigger = () => locationTrigger(reorder.row());
  const menu = locationMenu(node, shared, reorder, trigger);
  // The root row is the local; a `cabine` row drawn under another location is read as a coluna row, as before.
  const local = node.kind === 'cabine' && node.level === 0;
  const painel = node.kind === 'painel';
  const current = shared.currentPath.has(node.id);
  const colunas = node.locations.filter((child) => child.kind !== 'painel');
  const paineis = node.locations.filter((child) => child.kind === 'painel');
  const controls = [node.equipment.length > 0 ? eqsId : null, colunas.length > 0 ? colsId : null, paineis.length > 0 ? pnlsId : null].filter(Boolean).join(' ');

  const chevron = (
    <button
      type="button"
      className="tree-chevron"
      data-tree-chevron={node.id}
      aria-label={open ? t.collapse(node.controlName) : t.expand(node.controlName)}
      aria-expanded={open}
      aria-controls={open && controls !== '' ? controls : undefined}
      onClick={() => shared.setOpen(node, !open)}
    >
      <Chevron />
    </button>
  );
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => treeKeys(event, open, (value) => shared.setOpen(node, value));
  // EXPERIENCE.md › Relatório tree: "drag, Position box, Overflow menu, or Alt+↑/↓" at every level
  // (Story 14.2). The mock draws neither on a location row; the experience wins. Every control of
  // the row reads the kernel's `controlName`: a painel is named with its local, as the mock's
  // chevron and Overflow are ("Mais opções de Painel de entrada de Cubículo Enel").
  const reorderControls = (
    <>
      <DragHandle name={node.controlName} reorder={reorder} />
      <PositionBox name={node.controlName} position={node.position} siblings={node.siblings} reorder={reorder} className="s9-pos" />
    </>
  );
  const equipmentList =
    open && node.equipment.length > 0 ? (
      <ul className="s9-eqs" id={eqsId} aria-label={local ? t.locDirectLabel(node.name) : undefined}>
        {node.equipment.map((row) => (
          <SumarioEquipment key={row.blockId} node={row} shared={shared} />
        ))}
      </ul>
    ) : null;
  const colunaList =
    open && colunas.length > 0 ? (
      <ul className="s9-cols" id={colsId}>
        {colunas.map((child) => (
          <SumarioLocation key={child.id} node={child} shared={shared} />
        ))}
      </ul>
    ) : null;
  const target = shared.paletteLocation(node);

  if (local) {
    const className = ['s9-local', open && 'is-open', current && 'is-current', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
    // The palette opened here adds to the local itself, or to its current coluna when it holds colunas directly.
    const onLocal = target === node.id;
    const addButton =
      open && target !== null ? (
        <AriaButton
          className="btn btn-text s9-add"
          aria-label={onLocal ? t.addEquipamentoNoLocalLabel(node.name) : undefined}
          onPress={() => shared.openPalette({ locationId: target, anchorBlockId: null })}
        >
          <PlusIcon />
          {onLocal ? t.addEquipamentoNoLocal : t.addBlockIn(node.name)}
        </AriaButton>
      ) : null;
    return (
      <li className={className} data-location-id={node.id} {...reorder.rowProps}>
        <div className="s9-loc-row" onKeyDown={onKeyDown}>
          {chevron}
          {reorderControls}
          <span className="s9-loc-body">
            <span className="s9-loc-name">
              {node.name}
              {/* The last sheet's row says it when drawn; a collapsed local says it for it. */}
              {current && !open ? <span className="sum-here"> {copy.sumario.here}</span> : null}
            </span>
            {/* Story 12.3 (`key-relatorio-overview-v09.html`): "falta a umidade" after the data
                line; alone, with no "—" before it, when the local holds no data yet. */}
            {node.metaMissing === null ? (
              <span className="s9-loc-meta">{node.meta}</span>
            ) : node.meta === CABINE_META_NONE ? (
              <span className="s9-loc-meta">
                <span className="cl-missing">{node.metaMissing}</span>
              </span>
            ) : (
              <span className="s9-loc-meta">
                {node.meta}
                {' · '}
                <span className="cl-missing">{node.metaMissing}</span>
              </span>
            )}
            {/* Story 14.3 (`40-relatorio-overview.html` `.s9-verif`): the local's site checklist and its counter, the kernel's text. */}
            {node.site === null ? null : (
              <AriaButton className="btn btn-text s9-verif" aria-label={copy.local.entryLabel(node.site.text, node.name)} onPress={() => shared.actions.openVerificacoes(node.id)}>
                <svg className="ico ico-sm" aria-hidden="true">
                  <use href="/sprite.svg#i-check-all" />
                </svg>
                {node.site.text}
              </AriaButton>
            )}
          </span>
          <span className="progress-counter" data-state={node.counterState}>
            <span className="dot" aria-hidden="true" />
            {node.counterText}
          </span>
          <OverflowMenu name={node.controlName} items={menu.items} destructiveItems={menu.destructiveItems} />
        </div>
        {/* The local's own sheets first, under their heading line (the mock's `.s9-col` of `.s9-eqs`). */}
        {open && node.equipment.length > 0 ? (
          <p className="s9-col s9-col-direct">
            <span className="s9-col-name">{t.locDirectTitle}</span>
            <span className="s9-col-meta">{node.ownCounterText}</span>
          </p>
        ) : null}
        {equipmentList}
        {/* The mock draws "Adicionar equipamento no local" right under the local's own sheets;
            a local that holds colunas directly keeps "Adicionar bloco em ⟨local⟩" after them, as before. */}
        {onLocal ? addButton : null}
        {colunaList}
        {onLocal ? null : addButton}
        {open && paineis.length > 0 ? (
          <ul className="s9-pnls" id={pnlsId} aria-label={t.painelListLabel(node.name)}>
            {paineis.map((child) => (
              <SumarioLocation key={child.id} node={child} shared={shared} />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }
  if (painel) {
    const className = ['s9-painel', open && 'is-open', current && 'is-current', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
    return (
      <li className={className} data-location-id={node.id} data-level={node.level} {...reorder.rowProps}>
        <div className="s9-pnl-row" onKeyDown={onKeyDown}>
          {chevron}
          {reorderControls}
          <span className="s9-pnl-body">
            <span className="s9-pnl-name">
              {node.name}
              {current && !open ? <span className="sum-here"> {copy.sumario.here}</span> : null}
            </span>
            <span className="s9-pnl-meta">{node.meta}</span>
          </span>
          <span className="progress-counter" data-state={node.counterState}>
            <span className="dot" aria-hidden="true" />
            {node.counterText}
          </span>
          <OverflowMenu name={node.controlName} items={menu.items} destructiveItems={menu.destructiveItems} />
        </div>
        {/* A painel takes no block, but a row can still sit on one (a block whose op was folded
            before the painel reached this device): it is counted, so it is drawn. A block never vanishes. */}
        {equipmentList}
        {colunaList}
        {open && colunas.length === 0 ? (
          // A painel only groups colunas: with none, it says why it takes no equipment.
          <>
            <p className="section-note pnl-empty" role="note">
              {t.painelEmpty}
            </p>
            <AriaButton className="btn btn-text s9-add" onPress={() => shared.actions.addLocation(node, 'coluna')}>
              <PlusIcon />
              {t.addColuna}
            </AriaButton>
          </>
        ) : null}
        {open && target !== null ? (
          // The visible words are the mock's; the name adds the painel's local ("… de Cubículo Enel"),
          // so the first painel of two locals, "Painel 1" in each, never names two buttons alike.
          <AriaButton className="btn btn-text s9-add" aria-label={t.addBlockIn(node.controlName)} onPress={() => shared.openPalette({ locationId: target, anchorBlockId: null })}>
            <PlusIcon />
            {t.addBlockIn(node.name)}
          </AriaButton>
        ) : null}
      </li>
    );
  }
  return (
    <li className={['s9-coluna', open && 'is-open', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ')} data-location-id={node.id} data-level={node.level} {...reorder.rowProps}>
      <div className="s9-col" onKeyDown={onKeyDown}>
        {chevron}
        {reorderControls}
        <span className="s9-col-name">{node.name}</span>
        <span className="s9-col-meta">{node.counterText}</span>
        <OverflowMenu name={node.controlName} items={menu.items} destructiveItems={menu.destructiveItems} />
      </div>
      {equipmentList}
      {colunaList}
    </li>
  );
}, sameRow);

function equipmentMenu(node: TreeEquipmentNode, shared: Shared, reorder: Reorder, trigger: () => HTMLElement | null) {
  const t = copy.sumario.tree;
  const s = copy.sumario;
  const items: OverflowMenuAction[] = [{ id: 'add-below', label: s.addBelow, onAction: () => shared.openPalette({ locationId: node.locationId, anchorBlockId: node.blockId }) }];
  if (node.position > 1) items.push({ id: 'up', label: s.moveUp, onAction: () => void reorder.moveTo(node.position - 2, trigger) });
  if (node.position < node.siblings) items.push({ id: 'down', label: s.moveDown, onAction: () => void reorder.moveTo(node.position, trigger) });
  // Story 11.2 (EXPERIENCE.md: "Mover para…" beside "Subir · Descer" wherever a location can change).
  if (shared.canMove(node)) items.push({ id: 'move-to', label: t.moveTo, onAction: () => shared.openDialog({ kind: 'move', node }) });
  items.push({ id: 'duplicate', label: s.duplicate, onAction: () => shared.openDialog({ kind: 'duplicate', node }) });
  // DESIGN.md Block card row: "Marcar não ensaiado" right after "Duplicar"; kept available
  // whatever `concluded_by` holds (AR-17 precedence lets not_tested override it), hidden
  // only once the sheet is already not tested (spec OPEN QUESTION, the literal AC reading).
  if (node.state !== 'nao_ensaiada') items.push({ id: 'not-tested', label: t.markNotTested, onAction: () => shared.openDialog({ kind: 'not-tested', node }) });
  if (node.equipmentId !== null) items.push({ id: 'rename-tag', label: t.renameTag, onAction: () => shared.openDialog({ kind: 'rename-tag', node }) });
  const destructiveItems: OverflowMenuAction[] = [{ id: 'remove', label: s.remove, onAction: () => shared.requestRemove(node) }];
  return { items, destructiveItems };
}

/** An equipment row: drag handle, Position box, the row body that opens the sheet, the Overflow, and the duplicate line. */
export const SumarioEquipment = memo(function SumarioEquipment({ node, shared }: { node: TreeEquipmentNode; shared: Shared }) {
  const t = copy.sumario.tree;
  const reorder = useReorder({
    itemKey: node.blockId,
    position: node.position,
    siblings: node.siblings,
    onMove: (to) => shared.actions.moveBlock(node, to),
    focusFrames: LIST_FOCUS_WATCH_FRAMES,
  });
  const trigger = () => blockTrigger(reorder.row());
  const menu = equipmentMenu(node, shared, reorder, trigger);
  const current = shared.currentBlockId === node.blockId;
  const className = ['s9-eq', current && 'is-current', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
  return (
    <li
      className={className}
      data-block-id={node.blockId}
      data-level={node.level}
      aria-current={current ? 'true' : undefined}
      {...reorder.rowProps}
      onKeyDown={(event) => {
        reorder.rowProps.onKeyDown(event);
        if (!event.defaultPrevented) treeKeys(event, null, () => undefined);
      }}
    >
      <DragHandle name={node.name} reorder={reorder} />
      <PositionBox name={node.name} position={node.position} siblings={node.siblings} reorder={reorder} className="s9-pos" />
      <button type="button" className="s9-eq-open" data-tree-open onClick={() => shared.actions.openSheet(node.blockId)}>
        <span className="block-tag">{node.tag}</span>
        <span className="s9-eq-name">
          <WholeWords className="s9-word" text={node.typeLabel} />
        </span>
        {current ? <span className="sum-here">{copy.sumario.here}</span> : null}
        <span className="s9-state" data-state={node.sumarioStateAttr}>
          <span aria-hidden="true">{node.glyph}</span> {node.stateText}
        </span>
      </button>
      <OverflowMenu name={node.name} items={menu.items} destructiveItems={menu.destructiveItems} />
      {node.duplicate ? (
        <p className="s9-dup">
          <span>{duplicateTagText(node.tag)}</span>
          <TextButton aria-label={t.renameDuplicateLabel(node.tag, shared.pathOf(node.locationId))} onPress={() => shared.openDialog({ kind: 'rename-tag', node })}>
            {t.rename}
          </TextButton>
        </p>
      ) : null}
    </li>
  );
}, sameRow);
