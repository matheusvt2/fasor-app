import { isInstrumentReferenced, sortInstrumentRegistryRows, type BlockRow, type InstrumentRow } from '@app/domain';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { newId } from '../../ids.ts';
import { blockRows, instrumentRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import { restoreFocus } from '../../input/focus-restore.ts';
import { InstrumentPanel } from './instrument-panel.tsx';
import { InstrumentRow as InstrumentRowItem } from './instrument-row.tsx';

const NO_INSTRUMENTS: InstrumentRow[] = [];
const NO_BLOCKS: BlockRow[] = [];

/**
 * Instrumentos (`80-cadastros.html` frame 1): the registry list, sorted expired-first
 * (AC1, AC3, `sortInstrumentRegistryRows`), and the persistent edit panel (AC2). Opening
 * "Novo instrumento" mints an id locally; nothing is written until the first field
 * commits (`InstrumentPanel`'s create-on-first-field rule, AD-3).
 */
export interface InstrumentosTabProps {
  /** Opens a new instrument's panel on arrival (Story 12.2: setup Etapa 4's "Cadastrar instrumento"). */
  openNew?: boolean;
  /**
   * The arrival's panel is done with, once: `back` when it was closed (the caller returns to
   * the page that asked for it), false when another panel replaced it. `instrumentId` is the
   * arrival panel's instrument, which exists only if a field of it was committed.
   */
  onEntryEnd?: (back: boolean, instrumentId: string) => void;
}

export function InstrumentosTab({ openNew = false, onEntryEnd }: InstrumentosTabProps = {}) {
  const session = useSession();
  const db = session.database;
  // The panel minted for the arrival; only its close returns, and only once.
  const [entryId, setEntryId] = useState<string | null>(() => (openNew ? newId() : null));
  const [openId, setOpenIdState] = useState<string | null>(entryId);
  const setOpenId = (next: string | null) => {
    if (entryId !== null && openId === entryId && next !== entryId) {
      setEntryId(null);
      onEntryEnd?.(next === null, entryId);
    }
    setOpenIdState(next);
  };

  // E12-Q2: the arrival's target is the new instrument's first field ("Código"), focused and
  // so scrolled into view, never the end of the panel with the focus on `<body>`.
  useEffect(() => {
    if (entryId === null) return;
    restoreFocus(() => document.querySelector<HTMLElement>('.registry-panel .panel-body input'), { mode: 'settled' });
    // Once per arrival.
  }, []);

  const instruments = useLiveQuery(
    () => (db === null ? Promise.resolve(NO_INSTRUMENTS) : instrumentRows(db)),
    [db],
    NO_INSTRUMENTS,
  );
  const blocks = useLiveQuery(() => (db === null ? Promise.resolve(NO_BLOCKS) : blockRows(db)), [db], NO_BLOCKS);

  const sorted = useMemo(() => sortInstrumentRegistryRows(instruments, now()), [instruments]);
  const openInstrument = useMemo(() => instruments.find((row) => row.id === openId) ?? null, [instruments, openId]);
  const referenced = openId === null ? false : isInstrumentReferenced(openId, blocks);

  return (
    <div className="registry-layout">
      <div className="registry-main">
        {sorted.length === 0 ? null : (
          <div className="registry-toolbar">
            <Button onPress={() => setOpenId(newId())}>{copy.registries.instrumentos.newInstrument}</Button>
          </div>
        )}
        <p className="section-note">{copy.registries.instrumentos.note}</p>

        {sorted.length === 0 ? (
          // One action only on an empty registry (Epic 2 retro D-8): the empty state's.
          <div className="home-empty">
            <p className="section-note">{copy.registries.instrumentos.emptyText}</p>
            <Button onPress={() => setOpenId(newId())}>{copy.registries.instrumentos.empty}</Button>
          </div>
        ) : (
          <ul className="registry-list" aria-label={copy.registries.tabInstrumentos}>
            {sorted.map(({ instrument, status }) => (
              <InstrumentRowItem
                key={instrument.id}
                instrument={instrument}
                status={status}
                isOpen={instrument.id === openId}
                onOpen={() => setOpenId(instrument.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {openId === null ? null : (
        <InstrumentPanel
          key={openId}
          instrumentId={openId}
          instrument={openInstrument}
          referenced={referenced}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
