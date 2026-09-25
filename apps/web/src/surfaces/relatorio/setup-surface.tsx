import {
  buildSnapshot,
  putRelatorioStatusOp,
  relatorioOpEnvelope,
  relatorioSetupPath,
  setupIncompleteReason,
  statusTable,
  type BlockRow,
  type InstrumentRow,
  type RelatorioSnapshot,
  type UserRow,
} from '@app/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams, useParams } from 'react-router';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { relatorioRow } from '../../db/generate-store.ts';
import { blockRowsOf, instrumentRows, relatorioState } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { localUsers } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { useForgetArrivalState } from '../../state/arrival-state.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { Etapa1Capa } from './setup/etapa1-capa.tsx';
import { Etapa2Escopo } from './setup/etapa2-escopo.tsx';
import { Etapa3Responsavel } from './setup/etapa3-responsavel.tsx';
import { Etapa4Instrumentos } from './setup/etapa4-instrumentos.tsx';
import { Etapa5Local } from './setup/etapa5-local.tsx';
import './relatorio.css';

const NO_USERS: UserRow[] = [];
const NO_INSTRUMENTS: InstrumentRow[] = [];
const NO_BLOCKS: BlockRow[] = [];

/**
 * `/relatorio/:id/setup?etapa=n` (Story 4.2): the five Etapa bands the epics.md AC lists
 * (Capa, Objetivo e escopo, Responsável, Instrumentos, Local) plus the "Conclusão e
 * parecer" placeholder -- not the mock's own six-band structure (Design Notes).
 */
export function SetupSurface() {
  const { id = '' } = useParams();
  const db = useSession().database;
  const state = useLiveQuery(() => (db === null ? undefined : relatorioState(db, id)), [db, id]);
  const users = useLiveQuery(() => (db === null ? Promise.resolve(NO_USERS) : localUsers(db)), [db], NO_USERS);
  const instruments = useLiveQuery(() => (db === null ? Promise.resolve(NO_INSTRUMENTS) : instrumentRows(db)), [db], NO_INSTRUMENTS);
  const blocks = useLiveQuery(() => (db === null ? Promise.resolve(NO_BLOCKS) : blockRowsOf(db, id)), [db, id], NO_BLOCKS);
  const snapshot: RelatorioSnapshot | null = useMemo(() => (state === undefined || state === null ? null : buildSnapshot(state, id)), [state, id]);

  return (
    <main className="screen" data-route="/relatorio/:id/setup">
      {state === undefined ? (
        <div className="setup-content">
          <p className="section-note" role="status">
            {copy.common.loading}
          </p>
        </div>
      ) : snapshot === null ? (
        <div className="setup-content">
          <p className="section-note">{copy.setup.notFound}</p>
          <Link to="/">{copy.common.back}</Link>
        </div>
      ) : (
        <SetupContent key={id} relatorioId={id} snapshot={snapshot} users={users} instruments={instruments} blocks={blocks} />
      )}
    </main>
  );
}

interface SetupContentProps {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  users: readonly UserRow[];
  instruments: readonly InstrumentRow[];
  blocks: readonly BlockRow[];
}

/** The instrument Cadastros registered for this page (E12-Q11), from the arrival's state. */
function registeredInstrumentOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const raw = (state as Record<string, unknown>).registeredInstrumentId;
  return typeof raw === 'string' ? raw : null;
}

function SetupContent({ relatorioId, snapshot, users, instruments, blocks }: SetupContentProps) {
  const db = useSession().database;
  const user = useSession().user;
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const t = copy.setup;
  const relatorio = snapshot.relatorio;
  const setup = relatorio.setup;
  const responsible = users.find((row) => row.id === setup.responsible_user_id) ?? null;

  const author = user === null ? null : { id: user.id, companyId: user.companyId };

  const bandRefs = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => {
    const etapa = Number.parseInt(search.get('etapa') ?? '', 10);
    if (!Number.isInteger(etapa) || etapa < 1 || etapa > 5) return;
    const band = bandRefs.current[etapa];
    if (band === null || band === undefined) return;
    band.scrollIntoView?.({ block: 'start' });
    const heading = band.querySelector<HTMLElement>('.band-title');
    heading?.focus();
    // Once per mount.
  }, []);

  // The page's edit queue and undo toast (Epic 4 retro items 5, 24): every setup write runs
  // in it, so an exclusion's "Desfazer" is retired by any later write of the page.
  const edits = useUndoableEdits();

  /**
   * One or more `relatorio/setup/{field}` puts, all in the same batch; resolves to the batch
   * id. A refused write is toasted by the field that asked for it (`useFieldCommit`), or by
   * the queue when `loud`.
   */
  async function writeFields(fields: ReadonlyArray<readonly [string, unknown]>, loud = false): Promise<string | null> {
    return edits.write(
      async () => {
        if (db === null || author === null) return null;
        const drafts = fields.map(([field, value]) => ({
          ...relatorioOpEnvelope(author, relatorioId),
          kind: 'put' as const,
          path: relatorioSetupPath(field),
          value: value as never,
        }));
        return (await commitBatch(db, drafts, { newId, now })).batch_id;
      },
      { quiet: !loud },
    );
  }

  async function commitFields(fields: ReadonlyArray<readonly [string, unknown]>): Promise<void> {
    await writeFields(fields);
  }

  async function commitField(field: string, value: unknown): Promise<void> {
    await commitFields([[field, value]]);
  }

  // E12-Q11: back from Cadastros' "Fechar" after "Cadastrar instrumento", the instrument just
  // registered there is checked here (one op), when it exists and is not listed yet. Read once
  // from the arrival, then forgotten, so a reload never checks it again.
  const location = useLocation();
  const [registeredId] = useState(() => registeredInstrumentOf(location.state));
  useForgetArrivalState();
  const registeredSpent = useRef(false);
  useEffect(() => {
    if (registeredId === null || registeredSpent.current) return;
    if (!instruments.some((row) => row.id === registeredId && row.removed_at === null)) return;
    registeredSpent.current = true;
    if (setup.instrument_ids.includes(registeredId)) return;
    void commitField('instrument_ids', [...setup.instrument_ids, registeredId]);
  });

  const gapReason = setupIncompleteReason(snapshot, responsible);
  // AD-22 (Epic 4 retro item 12): the kernel's table says whether this status completes setup.
  const canComplete = statusTable(relatorio.status, 'setup_complete') !== null;

  async function onComplete(): Promise<void> {
    if (gapReason !== null || db === null || author === null) return;
    const batchId = await edits
      .write(async () => {
        // The status as the store holds it at the moment of the write, never the render's.
        const current = await relatorioRow(db, relatorioId);
        const next = current === null ? null : statusTable(current.status, 'setup_complete');
        if (next === null) return null;
        return (await commitBatch(db, [putRelatorioStatusOp(author, relatorioId, next)], { newId, now })).batch_id;
      })
      .catch(() => null);
    if (batchId === null) return;
    // Story 12.2 (J-06): the path goes forward, to the Sumário with section 9 open on the
    // sheets. The shell's toast, not the page's: the page is leaving.
    void navigate(`/relatorio/${relatorioId}`, { state: { openSection9: true } });
    showToast(t.completeDone);
  }

  return (
    <div className="setup-content">
      <h1 className="visually-hidden">{t.heading}</h1>

      <Etapa1Capa
        relatorioId={relatorioId}
        snapshot={snapshot}
        onCommit={commitField}
        onCommitFields={commitFields}
        bandRef={(el) => (bandRefs.current[1] = el)}
      />
      <Etapa2Escopo
        snapshot={snapshot}
        onCommit={commitField}
        onWriteExclusions={(value) => writeFields([['exclusions', value]], true)}
        undoable={edits.undoable}
        bandRef={(el) => (bandRefs.current[2] = el)}
      />
      <Etapa3Responsavel snapshot={snapshot} users={users} onCommit={commitField} bandRef={(el) => (bandRefs.current[3] = el)} />
      <Etapa4Instrumentos
        relatorioId={relatorioId}
        snapshot={snapshot}
        instruments={instruments}
        blocks={blocks}
        onCommit={commitField}
        bandRef={(el) => (bandRefs.current[4] = el)}
      />
      <Etapa5Local snapshot={snapshot} onCommit={commitField} onCommitFields={commitFields} bandRef={(el) => (bandRefs.current[5] = el)} />

      <section className="section-band" aria-labelledby="setup-parecer-band">
        <div className="band-head">
          <h2 className="band-title" id="setup-parecer-band" tabIndex={-1}>
            {t.parecerTitle}
          </h2>
        </div>
        <div className="band-body">
          <p className="section-note">{t.parecerNote}</p>
        </div>
      </section>

      <div className="sticky-action-bar">
        {canComplete ? (
          <Button variant="primary" isDisabled={gapReason !== null} disabledReason={gapReason ?? undefined} onPress={() => void onComplete()}>
            {t.complete}
          </Button>
        ) : (
          <p className="section-note">{t.completeDone}</p>
        )}
      </div>
    </div>
  );
}
