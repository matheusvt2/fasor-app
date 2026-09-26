import { railHeadText, sheetOrder, type EquipmentRow, type RelatorioSnapshot } from '@app/domain';
import { useMemo, useRef } from 'react';
import { copy } from '../../copy/pt-br.ts';
import type { RelatorioEditor } from '../relatorio/relatorio-editor.ts';
import { RelatorioTree } from '../relatorio/relatorio-tree.tsx';

/** The rail's presentation, carried by the sheet body's `data-rail`. */
export type RailState = 'auto' | 'open' | 'closed';

/** The relatório tree's rail at the sheet's left (from 768 px), and the strip that stands for it when collapsed. */
export function FichaRail({
  relatorioId,
  projectId,
  snapshot,
  equipment,
  blockId,
  editor,
  onRail,
}: {
  relatorioId: string;
  projectId: string;
  snapshot: RelatorioSnapshot;
  equipment: EquipmentRow[];
  blockId: string;
  editor: RelatorioEditor;
  onRail: (rail: RailState) => void;
}) {
  // --- the rail -------------------------------------------------------------------------
  const railT = copy.sumario.rail;
  const relatorio = snapshot.relatorio;
  const stripToggle = useRef<HTMLButtonElement>(null);
  const collapse = useRef<HTMLButtonElement>(null);
  const treeContext = useMemo(
    () => ({ relatorioId, projectId, seedVersion: relatorio.seed_version, editor }),
    [relatorioId, projectId, relatorio.seed_version, editor],
  );
  const total = useMemo(() => sheetOrder(snapshot).length, [snapshot]);

  return (
    <>
      <aside className="rail-collapsed" aria-label={railT.stripLabel}>
        <button
          type="button"
          className="rail-toggle"
          aria-label={railT.open}
          aria-expanded={false}
          ref={stripToggle}
          onClick={() => {
            onRail('open');
            requestAnimationFrame(() => collapse.current?.focus());
          }}
        >
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-tree" />
          </svg>
        </button>
        <span className="rail-vlabel" aria-hidden="true">
          {railT.title}
        </span>
      </aside>
      <aside className="rail" aria-label={railT.title}>
        <div className="rail-head">
          <span>{railHeadText(total)}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={railT.collapse}
            ref={collapse}
            onClick={() => {
              onRail('closed');
              requestAnimationFrame(() => stripToggle.current?.focus());
            }}
          >
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-back" />
            </svg>
          </button>
        </div>
        <RelatorioTree presentation="rail" snapshot={snapshot} equipment={equipment} lastSheetId={blockId} expandToLastSheet context={treeContext} />
      </aside>
    </>
  );
}
