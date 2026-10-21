import { ncPhraseRegistryGroups, type NcPhraseRegistryRow, type NcPhraseRow } from '@app/domain';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { LoadingNote } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ncPhraseRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import { FrasesNcPanel } from './frases-nc-panel.tsx';

/*
 * Story 14.12: Cadastros › Frases de NC, the office's review of the NC phrases the company
 * learned from observations typed on sheets (the server creates them, `nc_phrase` registry
 * rows). The Fabricantes list and panel classes (`80-cadastros.html` L384-390), grouped by
 * equipment type with the item as each row's secondary line; the order and the texts are the
 * kernel's (`ncPhraseRegistryGroups`). No "Novo": a phrase is learned, never created here.
 */

const NO_ROWS: NcPhraseRow[] = [];

function PhraseRowItem({ entry, isOpen, onOpen }: { entry: NcPhraseRegistryRow; isOpen: boolean; onOpen: () => void }) {
  return (
    <li
      className="registry-row"
      tabIndex={0}
      role="button"
      aria-pressed={isOpen}
      aria-label={`${entry.text.primary}, ${entry.text.secondary}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="rr-text">
        <span className="rr-primary">{entry.text.primary}</span>
        <span className="rr-secondary">{entry.text.secondary}</span>
      </div>
      <svg className="ico rr-chevron" aria-hidden="true">
        <use href="/sprite.svg#i-chev-right" />
      </svg>
    </li>
  );
}

function PhraseGroup({ label, children }: { label: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className="section" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{label}</h2>
      </div>
      <ul className="registry-list" aria-labelledby={headingId}>
        {children}
      </ul>
    </section>
  );
}

export function FrasesNcTab() {
  const t = copy.registries.frasesNc;
  const session = useSession();
  const db = session.database;
  const [openId, setOpenId] = useState<string | null>(null);
  // Undefined until the device store answers: "Carregando cadastro…", never the empty state's flash.
  const loaded = useLiveQuery(() => (db === null ? Promise.resolve(NO_ROWS) : ncPhraseRows(db)), [db]);
  const rows = loaded ?? NO_ROWS;
  const groups = useMemo(() => ncPhraseRegistryGroups(rows), [rows]);
  const openEntry = useMemo(() => groups.flatMap((group) => group.rows).find((entry) => entry.row.id === openId) ?? null, [groups, openId]);

  // A row that was open and is gone (removed here or on another device) closes its panel.
  useEffect(() => {
    if (openEntry === null && openId !== null && loaded !== undefined) setOpenId(null);
  }, [openEntry, openId, loaded]);

  return (
    <div className="registry-layout">
      <div className="registry-main">
        <p className="section-note">{t.note}</p>
        {db !== null && loaded === undefined ? (
          <LoadingNote what={copy.loadingWhat.registry} />
        ) : groups.length === 0 ? (
          <div className="home-empty">
            <p className="section-note">{t.emptyText}</p>
          </div>
        ) : (
          <div role="group" aria-label={t.listLabel}>
            {groups.map((group) => (
              <PhraseGroup key={group.label} label={group.label}>
                {group.rows.map((entry) => (
                  <PhraseRowItem key={entry.row.id} entry={entry} isOpen={entry.row.id === openId} onOpen={() => setOpenId(entry.row.id)} />
                ))}
              </PhraseGroup>
            ))}
          </div>
        )}
      </div>

      {openEntry === null ? null : <FrasesNcPanel key={openEntry.row.id} entry={openEntry} onClose={() => setOpenId(null)} />}
    </div>
  );
}
