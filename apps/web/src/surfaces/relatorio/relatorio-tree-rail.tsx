import { SITE_CHECKLIST_LABEL, type TreeEquipmentNode, type TreeLocationNode } from '@app/domain';
import { memo, useId } from 'react';
import { OverflowMenu } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { Chevron, locationMenu, sameRow, treeKeys, type Shared } from './relatorio-tree-shared.tsx';

/*
 * E14-A7: the rail presentation of the relatório tree (`relatorio-tree.tsx` says what each
 * presentation draws): locais, painéis, colunas, the site checklist row and the fichas.
 *
 * Story 15.2 (the Story 15.1 mocks, `shell-foot.html` `rail-tree`): a local row is a title band
 * (`.level-band`), a painel row a sub-band (`.level-subband`), a coluna row a group header
 * (`.level-group`), each with its kicker; every sheet is a card (`.level-item.eq-card`: TAG and
 * type as its title, the state word and the NC badge under it) and the local's "Verificações do
 * local" a card of the same kind (`.eq-card.site-card`), the first under its local.
 */

/** The rail row's level class (`shell-foot.html`): a local's band, a painel's sub-band, a coluna's group header. */
function levelClass(node: TreeLocationNode): string {
  if (node.kind === 'cabine' && node.level === 0) return 'level-band';
  if (node.kind === 'painel') return 'level-subband';
  return 'level-group';
}

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
      <div className={`tree-row ${levelClass(node)}`} data-level={node.level} onKeyDown={(event) => treeKeys(event, hasChildren ? open : null, (value) => shared.setOpen(node, value))}>
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
          <span className="level-kicker">{node.kicker}</span>
          <span className="tree-name">{node.name}</span>
          {/* Story 14.2: the rail line of each level is the kernel's (Story 15.2: "Entrada · 1 painel · 3 de 9 fichas", "1 coluna · 3 de 9", "3 de 9"). */}
          <span className="tree-meta">{node.railMeta}</span>
        </div>
        {menu.items.length > 0 ? <OverflowMenu name={node.controlName} items={menu.items} /> : null}
      </div>
      {open && hasChildren ? (
        <ul className="relatorio-tree" id={groupId}>
          {/* Story 14.3 (`shell-foot.html`): the local's site checklist first, one level under it. */}
          {site === null ? null : (
            <li data-site-of={node.id}>
              <div className="tree-row eq-card site-card" data-level={node.level + 1} onKeyDown={(event) => treeKeys(event, null, () => undefined)}>
                {/* Story 15.2: a card of the sheet kind, "N de 19" as its progress and the sheet state words. */}
                <button type="button" className="tree-body" data-tree-open aria-label={copy.local.entryLabel(site.ncBadge === null ? SITE_CHECKLIST_LABEL : `${SITE_CHECKLIST_LABEL} · ${site.ncBadge}`, node.name)} onClick={() => shared.actions.openVerificacoes(node.id)}>
                  <span className="tree-id">
                    <svg className="ico ico-sm" aria-hidden="true">
                      <use href="/sprite.svg#i-check-all" />
                    </svg>
                    <span className="tree-name">{SITE_CHECKLIST_LABEL}</span>
                    <span className="tree-meta">{site.railCounter}</span>
                  </span>
                  <span className="eq-card-status">
                    <span className="tree-state" data-state={site.railStateAttr}>
                      <span aria-hidden="true">{site.glyph}</span>
                      {site.stateWord}
                    </span>
                    {site.ncBadge === null ? null : <span className="nc-badge">{site.ncBadge}</span>}
                  </span>
                </button>
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
        className={current ? 'tree-row level-item eq-card is-selected' : 'tree-row level-item eq-card'}
        data-level={node.level}
        aria-current={current ? 'true' : undefined}
        onKeyDown={(event) => treeKeys(event, null, () => undefined)}
      >
        {/* Story 15.2 (Bruno's answer 6): the whole card is the tap target; TAG and type are its title
            (F-07: the TAG never breaks inside itself), the state word and the NC badge under it. */}
        <button type="button" className="tree-body" data-tree-open data-telemetry="sumario.open_sheet" onClick={() => shared.actions.openSheet(node.blockId)}>
          <span className="tree-id">
            {node.tag === '' ? null : <span className="tree-tag">{node.tag}</span>}
            <span className="tree-name">{node.typeLabel}</span>
          </span>
          <span className="eq-card-status">
            {/* The 320 px rail keeps the state to its word; a not-tested sheet's reason is its own meta line (review F-1). */}
            <span className="tree-state" data-state={node.stateAttr}>
              <span aria-hidden="true">{node.glyph}</span>
              {node.stateWord}
            </span>
            {node.ncBadge === null ? null : <span className="nc-badge">{node.ncBadge}</span>}
          </span>
          {node.reason === null ? null : <span className="tree-meta">{node.reason}</span>}
        </button>
      </div>
    </li>
  );
}, sameRow);
