import {
  dateRangeText,
  fichasCountText,
  progress,
  progressCounterState,
  projectRelatoriosHeading,
  projectRelatoriosMeta,
  relatoriosOfProject as orderRelatorios,
  relatorioSubText,
  relatorioTitle,
  type BlockRow,
  type ClientRow,
  type RelatorioRow,
  type TemplateRow,
} from '@app/domain';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button, StatusPill } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { blockRowsOf, clientRows, projectRow, relatoriosOfProject, templateRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import { NewRelatorioDialog } from './new-relatorio-dialog.tsx';
import '../relatorio/relatorio.css';

const NO_CLIENTS: ClientRow[] = [];
const NO_BLOCKS: Record<string, BlockRow[]> = {};

/**
 * `/project/:id` (`30-project.html`, Story 4.1): the obra's head (crumbs, site, "Novo
 * relatório a partir de template"), its meta, and its relatórios newest first as
 * `.relatorio-row` links into the Sumário. Every line, count, order and counter is the
 * kernel's (AD-2); the surface places them.
 */
export function ProjectSurface() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const db = session.database;
  const headingId = useId();
  const t = copy.project;

  const project = useLiveQuery(() => (db === null ? undefined : projectRow(db, id)), [db, id]);
  const clients = useLiveQuery(() => (db === null ? Promise.resolve(NO_CLIENTS) : clientRows(db)), [db], NO_CLIENTS);
  // Undefined until read: the dialog preselects the template from this list, so it waits for it.
  const templates: TemplateRow[] | undefined = useLiveQuery(() => (db === null ? undefined : templateRows(db)), [db]);
  const relatorios: RelatorioRow[] | undefined = useLiveQuery(() => (db === null ? undefined : relatoriosOfProject(db, id)), [db, id]);
  // The sheets of every relatório of the obra, for the "n de N fichas" counters.
  const blocksByRelatorio = useLiveQuery(
    async () => {
      if (db === null) return NO_BLOCKS;
      const rows = await relatoriosOfProject(db, id);
      const out: Record<string, BlockRow[]> = {};
      for (const row of rows) out[row.id] = (await blockRowsOf(db, row.id)).filter((block) => block.removed_at === null);
      return out;
    },
    [db, id],
    NO_BLOCKS,
  );

  const client = useMemo(() => (project === null || project === undefined ? null : (clients.find((row) => row.id === project.client_id) ?? null)), [clients, project]);
  const ordered = useMemo(() => (relatorios === undefined ? [] : orderRelatorios(relatorios, id)), [relatorios, id]);
  const templateName = (row: RelatorioRow) => templates?.find((template) => template.id === row.template_id)?.name ?? null;

  // Home's "Novo relatório" dialog hands over a project it just created with `openNew`. The
  // hand-over is consumed once per history entry and then cleared from it, so a later
  // live-query emission, Cancelar, Back or a reload never opens the dialog again; and only
  // once the templates are read, so the dialog preselects the template.
  const [dialogOpen, setDialogOpen] = useState(false);
  const openNew = (location.state as { openNew?: boolean } | null)?.openNew === true;
  const consumedEntry = useRef<string | null>(null);
  useEffect(() => {
    if (!openNew || !project || templates === undefined || consumedEntry.current === location.key) return;
    consumedEntry.current = location.key;
    setDialogOpen(true);
    void navigate(location.pathname, { replace: true, state: null });
  }, [openNew, project, templates, location.key, location.pathname, navigate]);

  if (project === undefined || relatorios === undefined || templates === undefined) {
    return (
      <main className="screen" data-route="/project/:id">
        <div className="content">
          <p className="section-note" role="status">
            {copy.common.loading}
          </p>
        </div>
      </main>
    );
  }
  if (project === null) {
    return (
      <main className="screen" data-route="/project/:id">
        <div className="content">
          <p className="section-note">{t.notFound}</p>
          <Link to="/">{t.backHome}</Link>
        </div>
      </main>
    );
  }

  const site = project.site ?? project.name;
  const newButton = (
    <Button onPress={() => setDialogOpen(true)}>
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-plus" />
      </svg>
      {t.newRelatorio}
    </Button>
  );

  return (
    <main className="screen" data-route="/project/:id">
      <div className="content">
        <div className="project-head">
          <div>
            <p className="crumbs">
              <Link to="/">{t.crumbsHome}</Link>
              <svg className="ico ico-sm" aria-hidden="true">
                <use href="/sprite.svg#i-chev-right" />
              </svg>
              <span>{client?.name ?? ''}</span>
              <svg className="ico ico-sm" aria-hidden="true">
                <use href="/sprite.svg#i-chev-right" />
              </svg>
              <span>{site}</span>
            </p>
            <h2>{site}</h2>
          </div>
          {newButton}
        </div>

        <dl className="project-meta">
          <div>
            <dt>{t.clientLabel}</dt>
            <dd>{client?.name ?? ''}</dd>
          </div>
          <div>
            <dt>{t.siteLabel}</dt>
            <dd>{site}</dd>
          </div>
          <div>
            <dt>{t.relatoriosLabel}</dt>
            <dd>{projectRelatoriosMeta(ordered)}</dd>
          </div>
        </dl>

        <section className="section" aria-labelledby={headingId}>
          <div className="section-head">
            <h2 id={headingId}>{projectRelatoriosHeading(ordered.length)}</h2>
          </div>
          {ordered.length === 0 ? (
            <div className="home-empty">
              <p className="section-note">{t.empty}</p>
              {newButton}
            </div>
          ) : (
            <>
              <div className="relatorio-list-head" aria-hidden="true">
                <span>{t.columns.relatorio}</span>
                <span>{t.columns.status}</span>
                <span>{t.columns.dates}</span>
                <span>{t.columns.template}</span>
                <span>{t.columns.progress}</span>
                <span />
              </div>
              <ul className="relatorio-list" aria-label={t.listLabel}>
                {ordered.map((row) => {
                  const counts = progress({ blocks: blocksByRelatorio[row.id] ?? [], suggestions: [] });
                  return (
                    <li key={row.id} data-relatorio={row.id}>
                      <Link className="relatorio-row" to={`/relatorio/${row.id}`}>
                        <span className="lr-main">
                          <span className="lr-title">{relatorioTitle(project)}</span>
                          <span className="lr-sub">{relatorioSubText(row, templateName(row))}</span>
                        </span>
                        <span className="lr-state">
                          <StatusPill status={row.status} />
                        </span>
                        <span className="lr-dates">{dateRangeText(row.setup.service_start, row.setup.service_end)}</span>
                        <span className="lr-template lr-meta">{templateName(row) ?? ''}</span>
                        <span className="progress-counter" data-state={progressCounterState(counts)}>
                          <span className="dot" aria-hidden="true" />
                          {fichasCountText(counts)}
                        </span>
                        <span className="lr-chev">
                          <svg className="ico" aria-hidden="true">
                            <use href="/sprite.svg#i-chev-right" />
                          </svg>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {dialogOpen ? (
        <NewRelatorioDialog project={project} client={client} relatorios={ordered} templates={templates} onClose={() => setDialogOpen(false)} />
      ) : null}
    </main>
  );
}
