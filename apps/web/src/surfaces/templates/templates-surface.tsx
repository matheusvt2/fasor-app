import {
  activeTemplates,
  archivedHeading,
  archivedTemplates,
  duplicateTemplate,
  emptyTemplate,
  SEED_VERSION,
  sortTemplates,
  standardTemplate,
  templatesHeading,
  templateSummaryText,
  templateUseCount,
  toIso,
  type RelatorioRow,
  type RelatorioSummary,
  type TemplateRow,
} from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ConfirmDialog, OverflowMenu, TextButton } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { relatorioRows, templateRows } from '../../db/home-store.ts';
import { companyDownloaded, companySummaries } from '../../db/sync-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { createTemplateOp, putTemplateOp, removeTemplateOp } from './template-ops.ts';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from './use-reorder.ts';
import './templates.css';

const NO_SUMMARIES: RelatorioSummary[] = [];
const NO_RELATORIOS: RelatorioRow[] = [];
const noBusy = () => undefined;

/** The two lists a template row can be in. */
type Group = 'active' | 'archived';
const groupOf = (row: TemplateRow): Group => (row.archived_at === null ? 'active' : 'archived');

/** A row's primary control: its "Abrir template" button, or on an archived row its first control. */
const primaryOf = (li: HTMLElement | null): HTMLElement | null =>
  li === null ? null : (li.querySelector<HTMLElement>('button.rr-text') ?? li.querySelector<HTMLElement>('button'));
/** A row's last action: "Arquivar" on an active row, "Restaurar" on an archived one. */
const lastActionOf = (li: HTMLElement | null): HTMLElement | null =>
  li === null ? null : ([...li.querySelectorAll<HTMLElement>('.rr-actions button')].at(-1) ?? null);

/**
 * Templates (`41-templates.html`, Stories 3.2 and 3.3): "Templates (n)" with "Novo
 * template", the active templates by name with their summary line, "Duplicar", "Arquivar"
 * and an Overflow that offers "Remover" only while no relatório was created from the
 * template; then "Arquivados (n)" with "Restaurar". With no template at all, the empty
 * state (UX-DR70) offers the standard FO.SERV-03 template (Story 3.2).
 *
 * Every action is one batch of `template/{id}` ops on this device (AD-1); the kernel builds
 * the rows (`duplicateTemplate`, `emptyTemplate`, `standardTemplate`), orders and counts
 * them, and says which template is still referenced (`templateUseCount`).
 */
export function TemplatesSurface() {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const navigate = useNavigate();
  const headingId = useId();
  const archivedHeadingId = useId();
  const [creating, setCreating] = useState(false);
  const [newing, setNewing] = useState(false);
  const [removing, setRemoving] = useState<TemplateRow | null>(null);
  // A second press landing before the re-render that disables a button must not write a
  // second template.
  const inFlight = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  // The list's edit queue and toasts (Epic 4 retro item 5). Leaving the list takes its toast
  // away: its "Desfazer" would otherwise act from another screen (the composer), on a
  // template that screen is not about; a later write retires a live "Desfazer".
  const edits = useUndoableEdits();
  const showToast = edits.notify;

  /*
   * Every action that moves or removes a row names where the focus goes, since the element
   * that held it (the row's button, or the Overflow the Confirm dialog returns to) is gone
   * once the row re-renders: the same row in its new group after Arquivar and Restaurar, the
   * next row (else the previous, else the group's heading) after a removal, and the row
   * itself after "Desfazer".
   */
  const rowIn = (group: Group, id: string): HTMLElement | null =>
    mainRef.current?.querySelector<HTMLElement>(`ul[data-group="${group}"] > li[data-template-id="${id}"]`) ?? null;
  const focusLater = (target: () => HTMLElement | null) => restoreFocus(target, { frames: LIST_FOCUS_WATCH_FRAMES, once: true });

  // `undefined` until the first read lands, so the empty state never flashes (and never
  // offers its action) over a device that does hold templates.
  const rows: TemplateRow[] | undefined = useLiveQuery(() => (db === null ? undefined : templateRows(db)), [db]);
  const active = useMemo(() => (rows === undefined ? undefined : activeTemplates(rows)), [rows]);
  const archived = useMemo(() => (rows === undefined ? [] : archivedTemplates(rows)), [rows]);
  const summaries = useLiveQuery(() => (db === null ? NO_SUMMARIES : companySummaries(db)), [db]) ?? NO_SUMMARIES;
  // A relatório created on this device and not yet synced already references its template (Story 4.1).
  const localRelatorios = useLiveQuery(() => (db === null ? NO_RELATORIOS : relatorioRows(db)), [db]) ?? NO_RELATORIOS;
  // A fresh device of a company that already holds templates shows none until its first
  // company pull completes; creating the standard one then would push a duplicate.
  const downloaded = useLiveQuery(() => (db === null ? false : companyDownloaded(db)), [db]) ?? false;
  const disabledReason = creating ? copy.templates.creating : !downloaded ? copy.templates.awaitingDownload : undefined;

  /** Commits one batch; a refused write says why and returns null. */
  async function commit(drafts: Parameters<typeof commitBatch>[1]): Promise<string | null> {
    if (db === null) return null;
    // A refused write is toasted by the queue; here it only means nothing was written.
    return edits.write(async () => (await commitBatch(db, drafts, { newId, now })).batch_id).catch(() => null);
  }

  async function once(setBusy: (busy: boolean) => void, run: () => Promise<void>): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await run();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function createStandard(): void {
    if (user === null || !downloaded) return;
    void once(setCreating, async () => {
      await commit([createTemplateOp(user, standardTemplate({ id: newId() }))]);
    });
  }

  function createEmpty(): void {
    if (user === null) return;
    void once(setNewing, async () => {
      const row = emptyTemplate(newId(), SEED_VERSION);
      if ((await commit([createTemplateOp(user, row)])) !== null) navigate(`/templates/${row.id}`);
    });
  }

  function duplicate(row: TemplateRow): void {
    if (user === null) return;
    // The same in-flight guard as the creates: two quick taps make one copy.
    void once(noBusy, async () => {
      const copyRow = duplicateTemplate(row, newId(), sortTemplates(rows ?? []).map((r) => r.name));
      if ((await commit([createTemplateOp(user, copyRow)])) !== null) showToast(copy.templates.duplicated(copyRow.name));
    });
  }

  /** "Desfazer" of a batch, in the edit queue; a refused undo says why instead of failing silently. */
  function undoable(text: string, batchId: string, focus: () => HTMLElement | null): void {
    edits.undoable(text, batchId, { label: copy.templates.undo, onUndo: () => focusLater(focus) });
  }

  async function setArchived(row: TemplateRow, archive: boolean): Promise<void> {
    if (user === null || db === null) return;
    const batchId = await commit([putTemplateOp(user, row.id, 'archived_at', archive ? toIso(now()) : null)]);
    if (batchId === null) return;
    focusLater(() => lastActionOf(rowIn(archive ? 'archived' : 'active', row.id)));
    if (archive) {
      undoable(copy.templates.archived, batchId, () => primaryOf(rowIn('active', row.id)));
    } else {
      showToast(copy.templates.restored);
    }
  }

  async function remove(row: TemplateRow): Promise<void> {
    if (user === null || db === null) return;
    // Where the focus goes once the row is gone, from the group as it is drawn now.
    const group = groupOf(row);
    const siblings = (group === 'active' ? active : archived) ?? [];
    const at = siblings.findIndex((r) => r.id === row.id);
    const neighbours = [siblings[at + 1], siblings[at - 1]].flatMap((r) => (r === undefined ? [] : [r.id]));
    const headingOf = (g: Group) => document.getElementById(g === 'active' ? headingId : archivedHeadingId);
    // Checked again at the moment of the write: the company summary may have moved since
    // the menu was drawn, and a referenced template is only ever archived (FR-9).
    if (!(await companyDownloaded(db))) {
      showToast(copy.templates.awaitingDownload);
      return;
    }
    if (templateUseCount(row.id, await companySummaries(db), await relatorioRows(db)) > 0) {
      showToast(copy.templates.removeReferenced);
      return;
    }
    const batchId = await commit([removeTemplateOp(user, row.id)]);
    if (batchId === null) return;
    focusLater(() => {
      if (rowIn(group, row.id) !== null) return null;
      for (const id of neighbours) {
        const target = primaryOf(rowIn(group, id));
        if (target !== null) return target;
      }
      // The archived group leaves with its last row: the list's own heading then.
      return headingOf(group) ?? headingOf('active');
    });
    undoable(copy.templates.removed(row.name), batchId, () => primaryOf(rowIn(group, row.id)));
  }

  const empty = active !== undefined && active.length === 0 && archived.length === 0;

  return (
    <main className="screen" data-route="/templates" ref={mainRef}>
      <div className="tpl-content">
        {active === undefined ? (
          <p className="section-note" role="status">
            {copy.common.loading}
          </p>
        ) : (
          <>
            <section className="section" aria-labelledby={headingId}>
              <div className="section-head">
                {/* The surface title is the App bar's <h1>; the section keeps its own heading. */}
                {/* tabIndex -1: the focus lands here when a removal empties the list. */}
                <h2 id={headingId} tabIndex={-1}>
                  {templatesHeading(active.length)}
                </h2>
                <Button
                  isDisabled={newing}
                  disabledReason={newing ? copy.templates.creating : undefined}
                  onPress={createEmpty}
                >
                  <svg className="ico" aria-hidden="true">
                    <use href="/sprite.svg#i-plus" />
                  </svg>
                  {copy.templates.newTemplate}
                </Button>
              </div>
              <p className="section-note">{copy.templates.note}</p>

              {empty ? (
                <div className="home-empty">
                  <p className="section-note">{copy.templates.empty}</p>
                  <Button isDisabled={disabledReason !== undefined} disabledReason={disabledReason} onPress={createStandard}>
                    {copy.templates.createStandard}
                  </Button>
                </div>
              ) : active.length > 0 ? (
                <ul className="registry-list" aria-label={copy.templates.listLabel} data-group="active">
                  {active.map((row) => (
                    <TemplateListRow
                      key={row.id}
                      row={row}
                      useCount={templateUseCount(row.id, summaries, localRelatorios)}
                      removable={downloaded}
                      onOpen={() => navigate(`/templates/${row.id}`)}
                      onRemove={() => setRemoving(row)}
                      actions={
                        <>
                          <TextButton onPress={() => duplicate(row)}>
                            <svg className="ico" aria-hidden="true">
                              <use href="/sprite.svg#i-copy" />
                            </svg>
                            {copy.templates.duplicate}
                          </TextButton>
                          <TextButton onPress={() => void setArchived(row, true)}>
                            <svg className="ico" aria-hidden="true">
                              <use href="/sprite.svg#i-archive" />
                            </svg>
                            {copy.templates.archive}
                          </TextButton>
                        </>
                      }
                    />
                  ))}
                </ul>
              ) : null}
            </section>

            {archived.length > 0 ? (
              <section className="section tpl-group" aria-labelledby={archivedHeadingId}>
                <div className="section-head">
                  <h2 id={archivedHeadingId} tabIndex={-1}>
                    {archivedHeading(archived.length)}
                  </h2>
                </div>
                <p className="section-note">{copy.templates.archivedNote}</p>
                <ul className="registry-list" aria-label={copy.templates.archivedListLabel} data-group="archived">
                  {archived.map((row) => (
                    <TemplateListRow
                      key={row.id}
                      row={row}
                      archived
                      useCount={templateUseCount(row.id, summaries, localRelatorios)}
                      removable={downloaded}
                      onRemove={() => setRemoving(row)}
                      actions={<TextButton onPress={() => void setArchived(row, false)}>{copy.templates.restore}</TextButton>}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>

      {removing === null ? null : (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          title={copy.templates.removeConfirmTitle(removing.name)}
          description={copy.templates.removeConfirmBody}
          confirmLabel={copy.templates.remove}
          cancelLabel={copy.templates.cancel}
          isDestructive
          onConfirm={() => void remove(removing)}
        />
      )}
    </main>
  );
}

interface TemplateListRowProps {
  row: TemplateRow;
  archived?: boolean;
  useCount: number;
  /**
   * False before the first company download: until then the company summary is empty
   * here, so a template relatórios were created from would look unreferenced.
   */
  removable: boolean;
  /** Omitted on an archived row: restore it to edit it (the mock's archived row). */
  onOpen?: () => void;
  onRemove: () => void;
  actions: React.ReactNode;
}

/**
 * `.registry-row.tpl-row`: the icon, the name and summary line (a button that opens the
 * composer), the Overflow and the row actions. The Overflow carries "Remover" alone and
 * only while no relatório was created from the template (FR-9) and the company summary
 * that says so has been downloaded; with nothing to offer it is not drawn at all.
 */
function TemplateListRow({ row, archived = false, useCount, removable, onOpen, onRemove, actions }: TemplateListRowProps) {
  const text = (
    <>
      <span className="rr-primary">{row.name}</span>
      <span className="rr-secondary">{templateSummaryText(row, useCount)}</span>
    </>
  );
  return (
    <li className={archived ? 'registry-row tpl-row is-archived' : 'registry-row tpl-row'} data-template-id={row.id}>
      <svg className="ico ink-secondary" aria-hidden="true">
        <use href="/sprite.svg#i-template" />
      </svg>
      {onOpen === undefined ? (
        <div className="rr-text">{text}</div>
      ) : (
        <button type="button" className="rr-text" aria-label={copy.templates.openRow(row.name)} onClick={onOpen}>
          {text}
        </button>
      )}
      {removable && useCount === 0 ? (
        <OverflowMenu name={row.name} items={[]} destructiveItems={[{ id: 'remove', label: copy.templates.remove, onAction: onRemove }]} />
      ) : null}
      <div className="rr-actions">{actions}</div>
    </li>
  );
}
