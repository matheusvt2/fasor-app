import { sortWordRegistryRows, wordRegistryRowText, type WordRow } from '@app/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/index.ts';
import { newId } from '../../ids.ts';
import { manufacturerRows, voltageClassRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import { WordRegistryPanel, type WordRegistryKindCopy } from './word-registry-panel.tsx';

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

export type WordRegistryTabProps = WordRegistryKindCopy & {
  listLabel: string;
  newRowButton: string;
  empty: string;
  /** The empty state's sentence, above its one action. */
  emptyText: string;
  note: string;
};

/**
 * Fabricantes and Classes de tensão (Story 2.5): a thin, kind-parameterized wrapper around
 * `WordRegistryPanel` (Code Map) — the tab itself lists and edits rows directly, the same
 * list+panel shape as Instrumentos (Story 2.1). `RegistryPickerField` is the *field*-level
 * picker later surfaces use to pick-or-create a value; this tab is the registry it reads.
 */
export function WordRegistryTab(props: WordRegistryTabProps) {
  const { kind, listLabel, newRowButton, empty, emptyText, note } = props;
  const session = useSession();
  const db = session.database;
  const [openId, setOpenId] = useState<string | null>(null);
  const source = kind === 'manufacturer' ? manufacturerRows : voltageClassRows;

  const rows = useLiveQuery(() => (db === null ? Promise.resolve(NO_ROWS) : source(db)), [db, source], NO_ROWS);
  const sorted = useMemo(() => sortWordRegistryRows(rows), [rows]);
  const openRow = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);

  // A row that was open and is gone (removed here, or merged away by the server into
  // another entry of the same name, Epic 2 retro D-1) closes its panel instead of
  // turning into a blank "Novo …" form.
  const seenOpen = useRef<string | null>(null);
  useEffect(() => {
    if (openRow !== null) seenOpen.current = openRow.id;
    else if (openId !== null && seenOpen.current === openId) setOpenId(null);
  }, [openRow, openId]);

  return (
    <div className="registry-layout">
      <div className="registry-main">
        {sorted.length === 0 ? null : (
          <div className="registry-toolbar">
            <Button onPress={() => setOpenId(newId())}>{newRowButton}</Button>
          </div>
        )}
        <p className="section-note">{note}</p>

        {sorted.length === 0 ? (
          // One action only on an empty registry (Epic 2 retro D-8): the empty state's.
          <div className="home-empty">
            <p className="section-note">{emptyText}</p>
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
        <WordRegistryPanel
          key={openId}
          {...(props.kind === 'manufacturer'
            ? { kind: 'manufacturer' as const, copy: props.copy }
            : { kind: 'voltage_class' as const, copy: props.copy })}
          rowId={openId}
          row={openRow}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
