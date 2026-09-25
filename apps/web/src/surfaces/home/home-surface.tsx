import {
  buildSnapshot,
  homeCards,
  isProjectStreamId,
  resumeTarget,
  statusBoardCounts,
  type BlockRow,
  type ClientRow,
  type HomeCard,
  type ProjectRow,
  type RelatorioRow,
  type RelatorioStatus,
  type ResumeTarget,
  type TemplateRow,
} from '@app/domain';
import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { blockRows, clientRows, projectRows, relatorioRows, relatorioState, templateRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { readLastSheet } from '../../db/prefs.ts';
import { outboxRows, syncStateRows } from '../../db/sync-store.ts';
import type { OutboxRow, SyncStateRow } from '../../db/schema.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { NewProjectDialog } from './new-project-dialog.tsx';
import { RelatorioCard } from './relatorio-card.tsx';
import { ShortcutRow } from './shortcut-row.tsx';
import { StatusBoard } from './status-board.tsx';
import './home.css';

/**
 * Home (`20-home.html`, `key-home.html`) — the status board, the relatório cards and
 * the two shortcuts. AD-1: it renders only what `useLiveQuery` reads from this device
 * and what the kernel computed from it; AD-2: not one count, order or line of text is
 * derived here.
 */

const NO_RELATORIOS: RelatorioRow[] = [];
const NO_PROJECTS: ProjectRow[] = [];
const NO_CLIENTS: ClientRow[] = [];
const NO_TEMPLATES: TemplateRow[] = [];
const NO_OUTBOX: OutboxRow[] = [];
const NO_STATES: SyncStateRow[] = [];
const NO_BLOCKS: BlockRow[] = [];

/** The key of the cold-open offline toast: once for this page session, not once per visit. */
const OFFLINE_TOAST_KEY = 'offline-cold-open';

export function HomeSurface() {
  const session = useSession();
  const sync = useSync();
  const { showOnce, showToast } = useToast();
  const navigate = useNavigate();
  const db = session.database;
  const [creating, setCreating] = useState(false);

  const statusHeadingId = useId();
  const listHeadingId = useId();
  const shortcutsHeadingId = useId();

  const [filter, setFilter] = useState<RelatorioStatus | null>(null);

  const relatorios = useLiveQuery(
    () => (db === null ? Promise.resolve(NO_RELATORIOS) : relatorioRows(db)),
    [db],
    NO_RELATORIOS,
  );
  const projects = useLiveQuery(() => (db === null ? Promise.resolve(NO_PROJECTS) : projectRows(db)), [db], NO_PROJECTS);
  const clients = useLiveQuery(() => (db === null ? Promise.resolve(NO_CLIENTS) : clientRows(db)), [db], NO_CLIENTS);
  const templates = useLiveQuery(
    () => (db === null ? Promise.resolve(NO_TEMPLATES) : templateRows(db)),
    [db],
    NO_TEMPLATES,
  );
  const outbox = useLiveQuery(() => (db === null ? Promise.resolve(NO_OUTBOX) : outboxRows(db)), [db], NO_OUTBOX);
  // Story 12.2: the blocks this device holds, for the on-device cards' `.progress-counter`.
  // Undefined until read, so no card counts "0 de 0" for a frame.
  const blocks = useLiveQuery(() => (db === null ? Promise.resolve(NO_BLOCKS) : blockRows(db)), [db], null) ?? undefined;

  const states = useLiveQuery(() => (db === null ? Promise.resolve(NO_STATES) : syncStateRows(db)), [db], NO_STATES);
  const syncStates = useMemo(
    // A project stream (`project:{id}`, Epic 4 retro item 17) is no relatório's.
    () => states.filter((row) => !isProjectStreamId(row.id)).map((row) => ({ id: row.id, complete: row.complete, last_sync_at: row.last_sync_at })),
    [states],
  );

  const base = useMemo(
    () => ({
      relatorios,
      summary: sync.summaryRelatorios,
      projects,
      clients,
      templates,
      syncStates,
      outbox,
      blocks,
      online: sync.online,
      reachable: sync.unreachable === null,
      now: now(),
    }),
    [relatorios, sync.summaryRelatorios, projects, clients, templates, syncStates, outbox, blocks, sync.online, sync.unreachable],
  );

  // The board counts every relatório the device knows of, whatever the tile filter says;
  // the list below is the same call with the filter, because AD-2 puts the ordering and
  // the filtering in the kernel and not in this component.
  const allCards = useMemo(() => homeCards({ ...base, filter: null }), [base]);
  const counts = useMemo(() => statusBoardCounts(allCards), [allCards]);
  const cards = useMemo(() => homeCards({ ...base, filter }), [base, filter]);

  // Story 12.2: where the current card's "Continuar" goes, from its snapshot and this
  // device's last sheet (`last_sheet:{id}`); the kernel picks the sheet and writes the text.
  const currentId = allCards.find((card) => card.isCurrent)?.id ?? null;
  const resume = useLiveQuery(
    async (): Promise<ResumeTarget | null> => {
      if (db === null || currentId === null) return null;
      const [state, lastSheet] = await Promise.all([relatorioState(db, currentId), readLastSheet(db, currentId)]);
      return state === null ? null : resumeTarget(buildSnapshot(state, currentId), lastSheet);
    },
    [db, currentId],
    null,
  );

  // Cold open with a session and no connection: the one sentence EXPERIENCE.md asks for,
  // once for this page session — not again after navigating away and back.
  useEffect(() => {
    if (!sync.online) showOnce(OFFLINE_TOAST_KEY, copy.home.offlineToast);
  }, [sync.online, showOnce]);

  function openCard(card: HomeCard) {
    if (card.device.kind === 'absent-offline') {
      // EXPERIENCE.md › Relatório not on device, offline: the same sentence, and nothing
      // else — on every tap. `showOnce` is for the cold-open sentence, which must not
      // repeat; a tap that answered once and then went silent would look broken.
      showToast(card.device.text);
      return;
    }
    if (card.device.kind === 'absent-online') {
      // AD-8 "pulled on open": the Sumário shows the pull while the stream comes down.
      void sync.syncRelatorio(card.id);
    }
    void navigate(`/relatorio/${card.id}`);
  }

  /** "Continuar": the resumed sheet (the sheet writes the pointer itself on mount), else the Sumário. */
  function continueCard(card: HomeCard, target: ResumeTarget | null) {
    if (target === null) {
      openCard(card);
      return;
    }
    void navigate(`/relatorio/${card.id}/ficha/${target.blockId}`);
  }

  return (
    <main className="screen home-screen">
      <div className="content">
        <section className="section" aria-labelledby={statusHeadingId}>
          <h2 id={statusHeadingId} className="visually-hidden">
            {copy.home.statusHeading}
          </h2>
          <StatusBoard
            counts={counts}
            filter={filter}
            onFilter={(status) => setFilter((current) => (current === status ? null : status))}
          />
        </section>

        <section className="section" aria-labelledby={listHeadingId}>
          <div className="home-head">
            <h2 id={listHeadingId}>{copy.home.relatoriosHeading}</h2>
            <Button onPress={() => setCreating(true)}>{copy.home.newRelatorio}</Button>
          </div>

          {cards.length === 0 ? (
            // A pressed tile can read zero, so an empty list is not always an empty
            // device: say which of the two it is instead of leaving a blank area.
            <div className="home-empty">
              <p className="section-note">{allCards.length === 0 ? copy.home.empty : copy.home.noneForFilter}</p>
            </div>
          ) : (
            <div className="relatorio-cards">
              {cards.map((card) => (
                <RelatorioCard
                  key={card.id}
                  card={card}
                  onPress={openCard}
                  resume={card.id === currentId ? resume : null}
                  onContinue={continueCard}
                />
              ))}
            </div>
          )}
        </section>

        <section className="section" aria-labelledby={shortcutsHeadingId}>
          <h2 id={shortcutsHeadingId} className="visually-hidden">
            {copy.home.shortcutsHeading}
          </h2>
          <ShortcutRow templateCount={templates.length} />
        </section>
      </div>

      {creating ? <NewProjectDialog clients={clients} projects={projects} onClose={() => setCreating(false)} /> : null}
    </main>
  );
}
