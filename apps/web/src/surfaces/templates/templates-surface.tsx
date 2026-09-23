import { sortTemplates, standardTemplate, templatesHeading, writeErrorKind, type OpDraft, type TemplateRow } from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { templateRows } from '../../db/home-store.ts';
import { companyDownloaded } from '../../db/sync-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import './templates.css';

/**
 * Templates (`41-templates.html`), Story 3.2's minimal surface: the heading with its
 * count, the mock's note, and the live templates by name. With none, the empty state
 * (UX-DR70) offers the one action that seeds the standard FO.SERV-03 template from this
 * device -- one `template/{id}` create built by the kernel's `standardTemplate`, the same
 * row the provisioning CLI writes. Row actions, the secondary line and the archived group
 * are Story 3.3's.
 */
export function TemplatesSurface() {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const headingId = useId();
  const [creating, setCreating] = useState(false);
  // A second press landing before the re-render that disables the button must not write
  // a second template.
  const inFlight = useRef(false);

  // `undefined` until the first read lands, so the empty state never flashes (and never
  // offers its action) over a device that does hold templates.
  const rows: TemplateRow[] | undefined = useLiveQuery(() => (db === null ? undefined : templateRows(db)), [db]);
  const templates = useMemo(() => (rows === undefined ? undefined : sortTemplates(rows)), [rows]);
  // A fresh device of a company that already holds templates shows none until its first
  // company pull completes; creating the standard one then would push a duplicate.
  const downloaded = useLiveQuery(() => (db === null ? false : companyDownloaded(db)), [db]) ?? false;
  const disabledReason = creating ? copy.templates.creating : !downloaded ? copy.templates.awaitingDownload : undefined;

  async function createStandard(): Promise<void> {
    if (db === null || user === null || inFlight.current || !downloaded) return;
    inFlight.current = true;
    setCreating(true);
    const id = newId();
    const op: OpDraft = {
      kind: 'create',
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.id,
      path: `template/${id}`,
      value: standardTemplate({ id }) as never,
    };
    try {
      await commitBatch(db, [op], { newId, now });
    } catch (error) {
      const name = (error as { name?: unknown } | null)?.name;
      showToast(writeErrorKind(typeof name === 'string' ? name : null) === 'quota' ? copy.write.quotaError : copy.write.unknownError);
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  return (
    <main className="screen" data-route="/templates">
      <div className="tpl-content">
        {templates === undefined ? (
          <p className="section-note" role="status">
            {copy.common.loading}
          </p>
        ) : (
          <section className="section" aria-labelledby={headingId}>
            <div className="section-head">
              {/* The surface title is the App bar's <h1>; the section keeps its own heading. */}
              <h2 id={headingId}>{templatesHeading(templates.length)}</h2>
            </div>
            <p className="section-note">{copy.templates.note}</p>

            {templates.length === 0 ? (
              <div className="home-empty">
                <p className="section-note">{copy.templates.empty}</p>
                <Button
                  isDisabled={disabledReason !== undefined}
                  disabledReason={disabledReason}
                  onPress={() => void createStandard()}
                >
                  {copy.templates.createStandard}
                </Button>
              </div>
            ) : (
              <ul className="registry-list" aria-label={copy.templates.listLabel}>
                {templates.map((template) => (
                  <li key={template.id} className="registry-row tpl-row">
                    <svg className="ico ink-secondary" aria-hidden="true">
                      <use href="/sprite.svg#i-template" />
                    </svg>
                    <div className="rr-text">
                      <span className="rr-primary">{template.name}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
