import { cabineLocationIds, cabineMetaText, cabineProgress, progressCounterState, progressCounterText, type RelatorioSnapshot } from '@app/domain';
import { copy } from '../../copy/pt-br.ts';

export interface Section9TreeProps {
  snapshot: RelatorioSnapshot;
  /** The block id of the last sheet worked on this device (`local_prefs` `last_sheet:{id}`), or null. */
  lastSheetId: string | null;
  /** The id the section 9 chevron's `aria-controls` names. */
  id?: string;
}

/**
 * Section 9's location tree, as far as this batch draws it: one `.s9-cabine` row per live
 * cabine with its name, its own data line, its progress counter, and "você parou aqui" on
 * the cabine holding the last sheet. No colunas, no equipment rows, no Overflow and no
 * expand: those are Stories 4.4 and 4.5 (batch B), which fills this component in place.
 *
 * Tracked stub, owner batch B (`deferred-work.md`).
 */
export function Section9Tree({ snapshot, lastSheetId, id }: Section9TreeProps) {
  const lastBlock = lastSheetId === null ? null : (snapshot.blocks.find((block) => block.id === lastSheetId) ?? null);
  const cabines = snapshot.locations.filter((location) => location.kind === 'cabine');
  return (
    <ul className="s9-tree" id={id} aria-label={copy.sumario.s9TreeLabel}>
      {cabines.map((cabine) => {
        const counts = cabineProgress(snapshot, cabine.id);
        const current = lastBlock?.location_id !== null && lastBlock !== null && cabineLocationIds(snapshot.locations, cabine.id).has(lastBlock.location_id);
        return (
          <li key={cabine.id} className={current ? 's9-cabine is-current' : 's9-cabine'} data-location-id={cabine.id} aria-current={current ? 'true' : undefined}>
            <div className="s9-cab-row">
              <span className="s9-cab-body">
                <span className="s9-cab-name">
                  {cabine.name}
                  {current ? <span className="sum-here"> {copy.sumario.here}</span> : null}
                </span>
                <span className="s9-cab-meta">{cabineMetaText(cabine)}</span>
              </span>
              <span className="progress-counter" data-state={progressCounterState(counts)}>
                <span className="dot" aria-hidden="true" />
                {progressCounterText(counts)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
