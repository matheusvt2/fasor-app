import {
  DEFAULT_HOME_PAGE_SIZE,
  HOME_PAGE_SIZES,
  homeCards,
  homeList,
  isHomePageSize,
  isProjectStreamId,
  resumeTarget,
  statusBoardCounts,
  type BlockRow,
  type ClientRow,
  type HomeCard,
  type LocationRow,
  type ProjectRow,
  type RelatorioRow,
  type RelatorioStatus,
  type ResumeTarget,
  type SuggestionRow,
  type TemplateRow,
  pendingSuggestions,
  suggestionRowsOf,
} from '@app/domain';
import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, FilterChipGroup, LoadingNote } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { blockRows, clientRows, locationRowsOnDevice, projectRows, relatorioRows, relatorioState, suggestionRows, templateRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { readHomePageSize, readLastSheet, writeHomePageSize } from '../../db/prefs.ts';
import { localFileRows, outboxRows, syncStateRows } from '../../db/sync-store.ts';
import type { OutboxRow, SyncStateRow } from '../../db/schema.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { NewProjectDialog } from './new-project-dialog.tsx';
import { RelatorioCard } from './relatorio-card.tsx';
import { ShortcutRow } from './shortcut-row.tsx';
import { StatusBoard } from './status-board.tsx';
import './home.css';
import { relatorioSnapshotOf } from '../../db/relatorio-snapshot.ts';

/**
 * Home (`20-home.html`, `key-home.html`) — the status board, the two shortcuts and the
 * relatório cards (in that order since Story 19.1). AD-1: it renders only what `useLiveQuery` reads from this device
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
const NO_SUGGESTIONS: SuggestionRow[] = [];
const NO_LOCATIONS: LocationRow[] = [];
const NO_FILES: Awaited<ReturnType<typeof localFileRows>> = [];

/** Story 19.2: the page-size chips, 10 · 20 · 50 · 100, the size itself as the chip id and word. */
const PAGE_SIZE_OPTIONS = HOME_PAGE_SIZES.map((size) => ({ id: String(size), label: String(size) }));

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
  // Story 19.2: the list's page size, this device's preference (`local_prefs.home_page_size`).
  // Undefined until read, so a device with 50 stored never draws a frame of 10 cards.
  const pageSize = useLiveQuery(() => (db === null ? Promise.resolve(DEFAULT_HOME_PAGE_SIZE) : readHomePageSize(db)), [db]);

  // Undefined until the device store answers: the list says "Carregando relatórios…" rather
  // than flashing the empty state (Matheus, 2026-09-30).
  const loadedRelatorios = useLiveQuery(() => (db === null ? Promise.resolve(NO_RELATORIOS) : relatorioRows(db)), [db]);
  const relatorios = loadedRelatorios ?? NO_RELATORIOS;
  // Story 19.2: the list also waits for the stored page size, so its first frame is already cut right.
  const relatoriosPending = db !== null && (loadedRelatorios === undefined || pageSize === undefined);
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
  // Story 14.10 part 10: the suggestion rows, so a sheet holding a pending one is not counted
  // as concluded, the Sumário's rule. Undefined until read: the counter counts the sheets alone.
  const suggestions = useLiveQuery(() => (db === null ? Promise.resolve(NO_SUGGESTIONS) : suggestionRows(db)), [db], null) ?? undefined;
  // The location rows, removed ones included: a sheet on a hidden location is out of the counter,
  // as it is out of the Sumário. Undefined until read.
  const locations = useLiveQuery(() => (db === null ? Promise.resolve(NO_LOCATIONS) : locationRowsOnDevice(db)), [db], null) ?? undefined;
  // Story 10.4 (ledger 166): the file rows, so a downloading card counts its sheets ("Baixando… 12 de 30 fichas").
  const files = useLiveQuery(() => (db === null ? Promise.resolve(NO_FILES) : localFileRows(db)), [db], null) ?? undefined;

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
      suggestions,
      locations,
      files,
      online: sync.online,
      reachable: sync.unreachable === null,
      serverAnswers: sync.serverAnswers === true,
      now: now(),
    }),
    [relatorios, sync.summaryRelatorios, projects, clients, templates, syncStates, outbox, blocks, suggestions, locations, files, sync.online, sync.unreachable, sync.serverAnswers],
  );

  // The board counts every relatório the device knows of, whatever the tile filter says;
  // the list below is the kernel's selection and page of the same ordered cards (Story 19.2:
  // the active statuses with no tile pressed, cut at the page size), because AD-2 puts the
  // ordering, the filtering and the cut in the kernel and not in this component.
  const allCards = useMemo(() => homeCards({ ...base, filter: null }), [base]);
  const counts = useMemo(() => statusBoardCounts(allCards), [allCards]);
  const list = useMemo(() => homeList(allCards, { filter, pageSize: pageSize ?? DEFAULT_HOME_PAGE_SIZE }), [allCards, filter, pageSize]);

  function choosePageSize(id: string) {
    const size = Number(id);
    if (db === null || !isHomePageSize(size)) return;
    void writeHomePageSize(db, size).catch(() => undefined);
  }

  // Story 12.2: where the current card's "Continuar" goes, from its snapshot and this
  // device's last sheet (`last_sheet:{id}`); the kernel picks the sheet and writes the text.
  const currentId = allCards.find((card) => card.isCurrent)?.id ?? null;
  const resume = useLiveQuery(
    async (): Promise<ResumeTarget | null> => {
      if (db === null || currentId === null) return null;
      const [state, lastSheet] = await Promise.all([relatorioState(db, currentId), readLastSheet(db, currentId)]);
      // Story 8.1: the count agrees with the Sumário's, over the device's pending suggestion rows.
      return state === null ? null : resumeTarget(relatorioSnapshotOf(state, currentId), lastSheet, pendingSuggestions(suggestionRowsOf(state, currentId)));
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
          {/* No zero counts while the device store has not answered: the list below says it is loading. */}
          {relatoriosPending ? null : (
            <StatusBoard
              counts={counts}
              filter={filter}
              onFilter={(status) => setFilter((current) => (current === status ? null : status))}
            />
          )}
        </section>

        {/* Story 19.1 (2026-10-30, Matheus: "Fazer: B"): the shortcuts sit between the Status board and the list, so
            Templates and Cadastros are one tap from the top whatever the list length (EXPERIENCE.md § Home). */}
        <section className="section" aria-labelledby={shortcutsHeadingId}>
          <h2 id={shortcutsHeadingId} className="visually-hidden">
            {copy.home.shortcutsHeading}
          </h2>
          <ShortcutRow templates={templates} />
        </section>

        <section className="section" aria-labelledby={listHeadingId}>
          <div className="home-head">
            <h2 id={listHeadingId}>{copy.home.relatoriosHeading}</h2>
            <Button onPress={() => setCreating(true)} data-telemetry="home.new_relatorio">
              {copy.home.newRelatorio}
            </Button>
          </div>

          {relatoriosPending ? (
            <LoadingNote what={copy.loadingWhat.relatorios} />
          ) : list.empty !== null ? (
            // A pressed tile can read zero, and a device can hold emitted relatórios only, so
            // an empty list is not always an empty device: say which case it is (the kernel's).
            <div className="home-empty">
              <p className="section-note">
                {list.empty === 'none' ? copy.home.empty : list.empty === 'none-for-filter' ? copy.home.noneForFilter : list.empty.text}
              </p>
            </div>
          ) : (
            <>
              <div className="relatorio-cards">
                {list.cards.map((card) => (
                  <RelatorioCard
                    key={card.id}
                    card={card}
                    onPress={openCard}
                    resume={card.id === currentId ? resume : null}
                    onContinue={continueCard}
                  />
                ))}
              </div>
              {list.note === null ? null : (
                <div className="home-list-note">
                  <p className="section-note">{list.note}</p>
                  <FilterChipGroup
                    options={PAGE_SIZE_OPTIONS}
                    selectedId={String(pageSize ?? DEFAULT_HOME_PAGE_SIZE)}
                    onChange={choosePageSize}
                    aria-label={copy.home.pageSizeLabel}
                    telemetry="home.page_size"
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {creating ? <NewProjectDialog clients={clients} projects={projects} onClose={() => setCreating(false)} /> : null}
    </main>
  );
}
