import {
  buildSnapshot,
  dateRangeText,
  defaultSectionText,
  isSectionBlockType,
  relatorioSectionNumber,
  resolveSectionText,
  sectionRowTitle,
  type RelatorioSnapshot,
} from '@app/domain';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { relatorioState } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { localUsers } from '../../db/sync-store.ts';
import { useSession } from '../../state/session.tsx';
import './relatorio.css';

/**
 * `/relatorio/:id/secao/:blockId` (Story 4.7, batch C): the section's text as the
 * document will print it, the relatório's values in place of the variables, read-only.
 * Story 4.7 replaces this with the editor and keeps the route.
 *
 * Tracked stub, owner batch C (`deferred-work.md`).
 */
export function SectionTextSurface() {
  const { id = '', blockId = '' } = useParams();
  const db = useSession().database;
  const state = useLiveQuery(() => (db === null ? undefined : relatorioState(db, id)), [db, id]);
  const users = useLiveQuery(() => (db === null ? Promise.resolve([]) : localUsers(db)), [db], []);
  const snapshot: RelatorioSnapshot | null = useMemo(() => (state === undefined || state === null ? null : buildSnapshot(state, id)), [state, id]);
  const block = snapshot?.blocks.find((row) => row.id === blockId) ?? null;
  const t = copy.sectionText;

  const text = useMemo(() => {
    if (snapshot === null || block === null) return null;
    const number = relatorioSectionNumber(block.block_type);
    const own = (block.config as { section_text?: unknown } | null)?.section_text;
    const seeded = isSectionBlockType(block.block_type) ? defaultSectionText(snapshot.relatorio.seed_version, block.block_type, now()) : null;
    const source = typeof own === 'string' ? own : seeded;
    if (source === null || number === null) return null;
    const responsible = users.find((user) => user.id === snapshot.relatorio.setup.responsible_user_id)?.name;
    return resolveSectionText(source, {
      cliente: snapshot.client?.name,
      obra: snapshot.project?.site ?? snapshot.project?.name,
      datas: dateRangeText(snapshot.relatorio.setup.service_start, snapshot.relatorio.setup.service_end) || undefined,
      empresa_executora: snapshot.empresa?.name,
      responsavel: responsible,
    }).resolved;
  }, [snapshot, block, users]);

  return (
    <main className="screen" data-route="/relatorio/:id/secao/:blockId">
      <div className="content">
        {state === undefined ? (
          <p className="section-note" role="status">
            {copy.common.loading}
          </p>
        ) : block === null ? (
          <>
            <p className="section-note">{t.notFound}</p>
            <Link to={`/relatorio/${id}`}>{t.backToSumario}</Link>
          </>
        ) : (
          <>
            <h2 className="section-text-title">
              {relatorioSectionNumber(block.block_type) ?? ''} {sectionRowTitle(block.block_type)}
            </h2>
            {text === null ? (
              <p className="section-note">{t.noText}</p>
            ) : (
              <div className="section-text" data-testid="section-text">
                {text.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            )}
            <Link to={`/relatorio/${id}`}>{t.backToSumario}</Link>
          </>
        )}
      </div>
    </main>
  );
}
