import { sortWordRegistryRows, wordRegistryRowText, type RegistryKind, type WordRow } from '@app/domain';
import { useMemo, useState } from 'react';
import { Button } from '../../components/index.ts';
import { newId } from '../../ids.ts';
import { manufacturerRows, voltageClassRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import { WordRegistryPanel, type WordRegistryCopy } from './word-registry-panel.tsx';

const NO_ROWS: WordRow[] = [];

interface WordRowItemProps {
  row: WordRow;
  isOpen: boolean;
  onOpen: () => void;
}

/** One `.registry-row` of the Fabricantes/Classes de tensão list (`80-cadastros.html` L384-390). */
function WordRowItem({ row, isOpen, onOpen }: WordRowItemProps) {
  const text = wordRegistryRowText(row);
  return (
    <li
      className="registry-row"
      tabIndex={0}
      role="button"
      aria-pressed={isOpen}
      aria-label={text.primary}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="rr-text">
        <span className="rr-primary">{text.primary}</span>
      </div>
      <svg className="ico rr-chevron" aria-hidden="true">
        <use href="/sprite.svg#i-chev-right" />
      </svg>
    </li>
  );
}

export interface WordRegistryTabProps {
  kind: Extract<RegistryKind, 'manufacturer' | 'voltage_class'>;
  listLabel: string;
  newRowButton: string;
  empty: string;
  note: string;
  copy: WordRegistryCopy;
}

/**
 * Fabricantes and Classes de tensão (Story 2.5): a thin, kind-parameterized wrapper around
 * `WordRegistryPanel` (Code Map) — the tab itself lists and edits rows directly, the same
 * list+panel shape as Instrumentos (Story 2.1). `RegistryPickerField` is the *field*-level
 * picker later surfaces use to pick-or-create a value; this tab is the registry it reads.
 */
export function WordRegistryTab({ kind, listLabel, newRowButton, empty, note, copy }: WordRegistryTabProps) {
  const session = useSession();
  const db = session.database;
  const [openId, setOpenId] = useState<string | null>(null);
  const source = kind === 'manufacturer' ? manufacturerRows : voltageClassRows;

  const rows = useLiveQuery(() => (db === null ? Promise.resolve(NO_ROWS) : source(db)), [db, source], NO_ROWS);
  const sorted = useMemo(() => sortWordRegistryRows(rows), [rows]);
  const openRow = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);

  return (
    <div className="registry-layout">
      <div className="registry-main">
        <div className="registry-toolbar">
          <Button onPress={() => setOpenId(newId())}>{newRowButton}</Button>
        </div>
        <p className="section-note">{note}</p>

        {sorted.length === 0 ? (
          <div className="home-empty">
            <Button onPress={() => setOpenId(newId())}>{empty}</Button>
          </div>
        ) : (
          <ul className="registry-list" aria-label={listLabel}>
            {sorted.map((row) => (
              <WordRowItem key={row.id} row={row} isOpen={row.id === openId} onOpen={() => setOpenId(row.id)} />
            ))}
          </ul>
        )}
      </div>

      {openId === null ? null : (
        <WordRegistryPanel key={openId} kind={kind} rowId={openId} row={openRow} onClose={() => setOpenId(null)} copy={copy} />
      )}
    </div>
  );
}
