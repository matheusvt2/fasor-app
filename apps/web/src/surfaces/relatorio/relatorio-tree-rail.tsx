import { SITE_CHECKLIST_LABEL, type TreeEquipmentNode, type TreeLocationNode } from '@app/domain';
import { memo, useId } from 'react';
import { OverflowMenu } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { Chevron, locationMenu, sameRow, treeKeys, type Shared } from './relatorio-tree-shared.tsx';

/*
 * E14-A7: the rail presentation of the relatório tree (`relatorio-tree.tsx` says what each
 * presentation draws): locais, painéis, colunas, the site checklist row and the fichas.
 */

export const RailLocation = memo(function RailLocation({ node, shared }: { node: TreeLocationNode; shared: Shared }) {
  const t = copy.sumario.tree;
  const open = shared.isOpen(node);
  const groupId = useId();
  const menu = locationMenu(node, shared, null, () => null);
  // Story 14.3: a local opens on its "Verificações do local" row, so it always has something below.
  const site = node.site;
  const hasChildren = site !== null || node.equipment.length > 0 || node.locations.length > 0;
  return (
    <li data-location-id={node.id}>
      <div className="tree-row" data-level={node.level} onKeyDown={(event) => treeKeys(event, hasChildren ? open : null, (value) => shared.setOpen(node, value))}>
        {hasChildren ? (
          <button
            type="button"
            className="tree-chevron"
            data-tree-chevron={node.id}
            aria-label={open ? t.collapse(node.controlName) : t.expand(node.controlName)}
            aria-expanded={open}
            aria-controls={open ? groupId : undefined}
            onClick={() => shared.setOpen(node, !open)}
          >
            <Chevron />
          </button>
        ) : (
          // Nothing hangs below (an empty local, a new painel or coluna): no control that expands to nothing.
          <span className="tree-chevron" aria-hidden="true" />
        )}
        <div className="tree-body">
          <span>{node.name}</span>
          {/* Story 14.2: the rail line of each level is the kernel's ("Local · Entrada · 1 painel · 3 de 9 fichas", "Painel · 1 coluna · 3 de 9"). */}
          <span className="tree-meta">{node.railMeta}</span>
        </div>
        {menu.items.length > 0 ? <OverflowMenu name={node.controlName} items={menu.items} /> : null}
      </div>
      {open && hasChildren ? (
        <ul className="relatorio-tree" id={groupId}>
          {/* Story 14.3 (`shell-foot.html`): the local's site checklist first, one level under it. */}
          {site === null ? null : (
            <li data-site-of={node.id}>
              <div className="tree-row" data-level={node.level + 1} onKeyDown={(event) => treeKeys(event, null, () => undefined)}>
                <span className="tree-chevron" aria-hidden="true">
                  <svg className="ico" aria-hidden="true">
                    <use href="/sprite.svg#i-check-all" />
                  </svg>
                </span>
                <button type="button" className="tree-body" data-tree-open aria-label={copy.local.entryLabel(SITE_CHECKLIST_LABEL, node.name)} onClick={() => shared.actions.openVerificacoes(node.id)}>
                  <span>{SITE_CHECKLIST_LABEL}</span>
                  <span className="tree-meta">{site.railMeta}</span>
                </button>
                <span className="tree-state" data-state={site.railStateAttr}>
                  <span aria-hidden="true">{site.glyph}</span>
                  {site.railCounter}
                </span>
              </div>
            </li>
          )}
          {node.equipment.map((row) => (
            <RailEquipment key={row.blockId} node={row} shared={shared} />
          ))}
          {node.locations.map((child) => (
            <RailLocation key={child.id} node={child} shared={shared} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}, sameRow);

export const RailEquipment = memo(function RailEquipment({ node, shared }: { node: TreeEquipmentNode; shared: Shared }) {
  const current = shared.currentBlockId === node.blockId;
  return (
    <li data-block-id={node.blockId}>
      <div
        className={current ? 'tree-row is-selected' : 'tree-row'}
        data-level={node.level}
        aria-current={current ? 'true' : undefined}
        onKeyDown={(event) => treeKeys(event, null, () => undefined)}
      >
        <span className="tree-chevron" aria-hidden="true" />
        <button type="button" className="tree-body" data-tree-open onClick={() => shared.actions.openSheet(node.blockId)}>
          <span>{node.typeLabel}</span>
          {/* F-07: the TAG never breaks inside itself; the reason after it wraps as words do. */}
          <span className="tree-meta">
            {node.tag === '' ? null : <span className="tree-tag">{node.tag}</span>}
            {node.railMetaRest}
          </span>
        </button>
        {/* The 320 px rail keeps the state to its word; a not-tested sheet's reason is on the meta line (review F-1). */}
        <span className="tree-state" data-state={node.stateAttr}>
          <span aria-hidden="true">{node.glyph}</span>
          {node.stateWord}
        </span>
      </div>
    </li>
  );
}, sameRow);
