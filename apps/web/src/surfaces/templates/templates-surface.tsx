import {
  activeTemplates,
  archivedHeading,
  archivedTemplates,
  duplicateTemplate,
  emptyTemplate,
  SEED_VERSION,
  standardTemplate,
  templatesHeading,
  templateSummaryText,
  templateUseCount,
  toIso,
  type RelatorioSummary,
  type TemplateRow,
} from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ConfirmDialog, OverflowMenu, TextButton } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { templateRows } from '../../db/home-store.ts';
import { companyDownloaded, companySummaries } from '../../db/sync-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { createTemplateOp, putTemplateOp, removeTemplateOp, writeErrorText } from './template-ops.ts';
import './templates.css';

const NO_SUMMARIES: RelatorioSummary[] = [];

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
  const { showToast } = useToast();
  const navigate = useNavigate();
  const headingId = useId();
  const archivedHeadingId = useId();
  const [creating, setCreating] = useState(false);
  const [newing, setNewing] = useState(false);
  const [removing, setRemoving] = useState<TemplateRow | null>(null);
  // A second press landing before the re-render that disables a button must not write a
  // second template.
  const inFlight = useRef(false);

  // `undefined` until the first read lands, so the empty state never flashes (and never
  // offers its action) over a device that does hold templates.
  const rows: TemplateRow[] | undefined = useLiveQuery(() => (db === null ? undefined : templateRows(db)), [db]);
  const active = useMemo(() => (rows === undefined ? undefined : activeTemplates(rows)), [rows]);
  const archived = useMemo(() => (rows === undefined ? [] : archivedTemplates(rows)), [rows]);
  const summaries = useLiveQuery(() => (db === null ? NO_SUMMARIES : companySummaries(db)), [db]) ?? NO_SUMMARIES;
  // A fresh device of a company that already holds templates shows none until its first
  // company pull completes; creating the standard one then would push a duplicate.
  const downloaded = useLiveQuery(() => (db === null ? false : companyDownloaded(db)), [db]) ?? false;
  const disabledReason = creating ? copy.templates.creating : !downloaded ? copy.templates.awaitingDownload : undefined;

  /** Commits one batch; a refused write says why and returns null. */
  async function commit(drafts: Parameters<typeof commitBatch>[1]): Promise<string | null> {
    if (db === null) return null;
    try {
      const { batch_id } = await commitBatch(db, drafts, { newId, now });
      return batch_id;
    } catch (error) {
      showToast(writeErrorText(error));
      return null;
    }
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

  async function duplicate(row: TemplateRow): Promise<void> {
    if (user === null) return;
    const copyRow = duplicateTemplate(row, newId());
    if ((await commit([createTemplateOp(user, copyRow)])) !== null) showToast(copy.templates.duplicated(copyRow.name));
  }

  async function setArchived(row: TemplateRow, archive: boolean): Promise<void> {
    if (user === null || db === null) return;
    const batchId = await commit([putTemplateOp(user, row.id, 'archived_at', archive ? toIso(now()) : null)]);
    if (batchId === null) return;
    if (archive) {
      showToast(copy.templates.archived, {
        action: { label: copy.templates.undo, onPress: () => void undoBatch(db, batchId, { newId, now }) },
      });
    } else {
      showToast(copy.templates.restored);
    }
  }

  async function remove(row: TemplateRow): Promise<void> {
    if (user === null || db === null) return;
    const batchId = await commit([removeTemplateOp(user, row.id)]);
    if (batchId === null) return;
    showToast(copy.templates.removed(row.name), {
      action: { label: copy.templates.undo, onPress: () => void undoBatch(db, batchId, { newId, now }) },
    });
  }

  const empty = active !== undefined && active.length === 0 && archived.length === 0;

  return (
    <main className="screen" data-route="/templates">
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
                <h2 id={headingId}>{templatesHeading(active.length)}</h2>
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
                <ul className="registry-list" aria-label={copy.templates.listLabel}>
                  {active.map((row) => (
                    <TemplateListRow
                      key={row.id}
                      row={row}
                      useCount={templateUseCount(row.id, summaries)}
                      onOpen={() => navigate(`/templates/${row.id}`)}
                      onRemove={() => setRemoving(row)}
                      actions={
                        <>
                          <TextButton onPress={() => void duplicate(row)}>
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
                  <h2 id={archivedHeadingId}>{archivedHeading(archived.length)}</h2>
                </div>
                <p className="section-note">{copy.templates.archivedNote}</p>
                <ul className="registry-list" aria-label={copy.templates.archivedListLabel}>
                  {archived.map((row) => (
                    <TemplateListRow
                      key={row.id}
                      row={row}
                      archived
                      useCount={templateUseCount(row.id, summaries)}
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
  /** Omitted on an archived row: restore it to edit it (the mock's archived row). */
  onOpen?: () => void;
  onRemove: () => void;
  actions: React.ReactNode;
}

/**
 * `.registry-row.tpl-row`: the icon, the name and summary line (a button that opens the
 * composer), the Overflow and the row actions. The Overflow carries "Remover" alone and
 * only while no relatório was created from the template (FR-9); with nothing to offer it
 * is not drawn at all.
 */
function TemplateListRow({ row, archived = false, useCount, onOpen, onRemove, actions }: TemplateListRowProps) {
  const text = (
    <>
      <span className="rr-primary">{row.name}</span>
      <span className="rr-secondary">{templateSummaryText(row, useCount)}</span>
    </>
  );
  return (
    <li className={archived ? 'registry-row tpl-row is-archived' : 'registry-row tpl-row'}>
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
      {useCount === 0 ? (
        <OverflowMenu name={row.name} items={[]} destructiveItems={[{ id: 'remove', label: copy.templates.remove, onAction: onRemove }]} />
      ) : null}
      <div className="rr-actions">{actions}</div>
    </li>
  );
}
