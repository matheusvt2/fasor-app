import { isInstrumentReferenced, sortInstrumentRegistryRows, type BlockRow, type InstrumentRow } from '@app/domain';
import { useMemo, useState } from 'react';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { newId } from '../../ids.ts';
import { blockRows, instrumentRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
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
export function InstrumentosTab() {
  const session = useSession();
  const db = session.database;
  const [openId, setOpenId] = useState<string | null>(null);

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
        <div className="registry-toolbar">
          <Button onPress={() => setOpenId(newId())}>{copy.registries.instrumentos.newInstrument}</Button>
        </div>
        <p className="section-note">{copy.registries.instrumentos.note}</p>

        {sorted.length === 0 ? (
          <div className="home-empty">
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
