import type { EntityState } from '@app/domain';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { relatorioState } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';

/**
 * The relatório the address names, as the Sumário (Story 4.3) and the tree surface
 * (Story 4.4) open it: this device's rows, or, when it holds no such row, one pull of its
 * stream (AD-8, "pulled on open") and then either the not-found sentence or, for a
 * relatório the company summary lists, the download sentence with "Tentar de novo".
 * `children` renders the loaded state.
 */
export function RelatorioGate({ id, children }: { id: string; children: (state: EntityState) => ReactNode }) {
  const session = useSession();
  const sync = useSync();
  const db = session.database;
  const state = useLiveQuery(() => (db === null ? undefined : relatorioState(db, id)), [db, id]);
  // The pull is per address: Back or Forward to another absent relatório starts its own.
  // `attempt` makes a retry a state of its own, so an answer that lands in the same render
  // as the start (React batches both) still re-runs the effect.
  const [pull, setPull] = useState<{ id: string; phase: 'idle' | 'running' | 'done'; attempt: number }>({ id, phase: 'idle', attempt: 0 });
  const { phase, attempt } = pull.id === id ? pull : { phase: 'idle' as const, attempt: 0 };
  useEffect(() => {
    // A cycle already running (Home's absent-online tap starts one just before navigating)
    // answers `busy` without pulling: wait for it to end, then pull once.
    if (state !== null || phase !== 'idle' || sync.running) return;
    const next = attempt + 1;
    setPull({ id, phase: 'running', attempt: next });
    void sync.syncRelatorio(id).then(
      (result) => setPull({ id, phase: result === 'busy' ? 'idle' : 'done', attempt: next }),
      () => setPull({ id, phase: 'done', attempt: next }),
    );
  }, [state, phase, attempt, sync, id]);

  if (state === undefined || (state === null && phase !== 'done')) {
    return (
      <div className="overview-content">
        <p className="section-note" role="status">
          {state === null ? copy.sumario.loading : copy.common.loading}
        </p>
      </div>
    );
  }
  if (state === null) {
    return (
      <div className="overview-content">
        {sync.summaryRelatorios.some((row) => row.id === id) ? (
          // The company knows the relatório but the pull left no row here (a page this
          // device could not apply, an interrupted download): say so and offer the pull again.
          <>
            <p className="section-note">{copy.sumario.downloadFailed}</p>
            <p>
              <Button variant="secondary" onPress={() => setPull({ id, phase: 'idle', attempt })}>
                {copy.sumario.retry}
              </Button>
            </p>
          </>
        ) : (
          <p className="section-note">{copy.sumario.notFound}</p>
        )}
        <Link to="/">{copy.sumario.backHome}</Link>
      </div>
    );
  }
  return <>{children(state)}</>;
}
