import { buildSnapshot, progress, railHeadText, type EntityState, type RelatorioSnapshot } from '@app/domain';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import { useLiveQuery } from '../../db/live.ts';
import { readLastSheet } from '../../db/prefs.ts';
import { useSession } from '../../state/session.tsx';
import { useProjectEquipment, useRelatorioEditor } from './relatorio-editor.ts';
import { RelatorioGate } from './relatorio-gate.tsx';
import { RelatorioTree } from './relatorio-tree.tsx';
import './relatorio.css';

/**
 * `/relatorio/:id/arvore` (Story 4.4): the location tree in its rail presentation until
 * Epic 5 mounts it inside a sheet (EXPERIENCE.md › Responsive & Platform). Below 768 px the
 * tree is the surface itself; from 768 px it is the 320 px `.rail` beside the (future)
 * sheet column, collapsing to the 48 px `.rail-collapsed` strip by default in portrait
 * (768-1023 px) and on "Recolher árvore". Which of the two shows is CSS alone
 * (`relatorio.css`), with `data-rail` carrying the user's choice.
 *
 * The column beside the rail is a tracked stub (owner Epic 5 Story 5.1, `deferred-work.md`).
 */
export function TreeSurface() {
  const { id = '' } = useParams();
  return (
    <main className="screen" data-route="/relatorio/:id/arvore">
      <RelatorioGate id={id}>{(state) => <Arvore key={id} relatorioId={id} state={state} />}</RelatorioGate>
    </main>
  );
}

function Arvore({ relatorioId, state }: { relatorioId: string; state: EntityState }) {
  const t = copy.sumario.rail;
  const db = useSession().database;
  const snapshot: RelatorioSnapshot = useMemo(() => buildSnapshot(state, relatorioId), [state, relatorioId]);
  const equipment = useProjectEquipment(state, snapshot.relatorio.project_id);
  const lastSheet = useLiveQuery(() => (db === null ? Promise.resolve(null) : readLastSheet(db, relatorioId)), [db, relatorioId], null);
  const total = useMemo(() => progress(snapshot).sheets_total, [snapshot]);
  const relatorio = snapshot.relatorio;
  const editor = useRelatorioEditor(relatorioId, relatorio.project_id);
  const context = useMemo(
    () => ({ relatorioId, projectId: relatorio.project_id, seedVersion: relatorio.seed_version, editor }),
    [relatorioId, relatorio.project_id, relatorio.seed_version, editor],
  );
  // `auto` leaves the width to decide (strip in portrait, rail from 1024 px); a press sets it.
  const [rail, setRail] = useState<'auto' | 'open' | 'closed'>('auto');
  const stripToggle = useRef<HTMLButtonElement>(null);
  const collapse = useRef<HTMLButtonElement>(null);

  return (
    <div className="screen-body arvore-body" data-rail={rail}>
      <aside className="rail-collapsed" aria-label={t.stripLabel}>
        <button
          type="button"
          className="rail-toggle"
          aria-label={t.open}
          aria-expanded={false}
          ref={stripToggle}
          onClick={() => {
            setRail('open');
            requestAnimationFrame(() => collapse.current?.focus());
          }}
        >
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-tree" />
          </svg>
        </button>
        <span className="rail-vlabel" aria-hidden="true">
          {t.title}
        </span>
      </aside>
      <aside className="rail" aria-label={t.title}>
        <div className="rail-head">
          <span>{railHeadText(total)}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.collapse}
            ref={collapse}
            onClick={() => {
              setRail('closed');
              requestAnimationFrame(() => stripToggle.current?.focus());
            }}
          >
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-back" />
            </svg>
          </button>
        </div>
        <RelatorioTree presentation="rail" snapshot={snapshot} equipment={equipment} lastSheetId={lastSheet} expandToLastSheet context={context} />
      </aside>
      <div className="arvore-content">
        <p className="section-note">{t.note}</p>
      </div>
      <p className="visually-hidden" role="status" data-testid="arvore-announcer">
        {editor.announcement}
      </p>
    </div>
  );
}
