import {
  permissionForPath,
  permissionRefusalText,
  putRelatorioStatusOp,
  relatorioOpEnvelope,
  relatorioStatusPath,
  relatorioSetupPath,
  setupGapsNote,
  setupIncompleteReason,
  statusTable,
  type EntityState,
  type InstrumentRow,
  type RelatorioParecer,
  type RelatorioSnapshot,
  type PermissionNeed,
  type UserRow,
} from '@app/domain';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams, useParams } from 'react-router';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { relatorioRow } from '../../db/generate-store.ts';
import { instrumentRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { localUsers } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { useForgetArrivalState } from '../../state/arrival-state.ts';
import { useCanFn } from '../../state/permissions.tsx';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { Etapa1Capa } from './setup/etapa1-capa.tsx';
import { Etapa2Escopo } from './setup/etapa2-escopo.tsx';
import { Etapa3Responsavel } from './setup/etapa3-responsavel.tsx';
import { Etapa4Instrumentos } from './setup/etapa4-instrumentos.tsx';
import { Etapa5Local } from './setup/etapa5-local.tsx';
import { Etapa6Parecer } from './setup/etapa6-parecer.tsx';
import { RelatorioGate } from './relatorio-gate.tsx';
import './relatorio.css';
import { useRelatorioSnapshot } from '../../db/relatorio-snapshot.ts';

const NO_USERS: UserRow[] = [];
const NO_INSTRUMENTS: InstrumentRow[] = [];

/**
 * `/relatorio/:id/setup?etapa=n` (Story 4.2): the five Etapa bands the epics.md AC lists
 * (Capa, Objetivo e escopo, Responsável, Instrumentos, Local) plus Story 7.4's Etapa 6,
 * "Conclusão e parecer" -- not the mock's own six-band structure (Design Notes). Arriving
 * with `?volta=exportar` (the Export dialog's "Editar em Dados do relatório"), Etapa 6 offers
 * the way back to the dialog.
 */
export function SetupSurface() {
  const { id = '' } = useParams();
  // e20f (QA N4): behind `RelatorioGate`, as the Sumário and the ficha are, so a deep link on a device
  // that does not hold the relatório yet (a fresh sign-in) pulls it (AD-8) instead of saying it is not found.
  return (
    <main className="screen" data-route="/relatorio/:id/setup">
      <RelatorioGate id={id}>{(state) => <SetupLoaded key={id} relatorioId={id} state={state} />}</RelatorioGate>
    </main>
  );
}

function SetupLoaded({ relatorioId: id, state }: { relatorioId: string; state: EntityState }) {
  const db = useSession().database;
  const users = useLiveQuery(() => (db === null ? Promise.resolve(NO_USERS) : localUsers(db)), [db], NO_USERS);
  const instruments = useLiveQuery(() => (db === null ? Promise.resolve(NO_INSTRUMENTS) : instrumentRows(db)), [db], NO_INSTRUMENTS);
  const snapshot: RelatorioSnapshot = useRelatorioSnapshot(state, id);
  return <SetupContent relatorioId={id} snapshot={snapshot} users={users} instruments={instruments} />;
}

interface SetupContentProps {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  users: readonly UserRow[];
  instruments: readonly InstrumentRow[];
}

/** The instrument Cadastros registered for this page (E12-Q11), from the arrival's state. */
/**
 * Story 26.5: the setup fields each Etapa writes (the kernel says the key of each:
 * `SETUP_CREATE_FIELDS`, `SETUP_FILL_FIELDS` in `permissions/map.ts`). Read only to decide
 * whether a whole Etapa is out of the role's reach.
 */
const ETAPA_FIELDS: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, readonly string[]>> = {
  1: ['service_start', 'service_end', 'atividade', 'cover_photo_file_id', 'additional_info'],
  2: ['escopo', 'exclusions', 'local'],
  3: ['responsible_user_id', 'art_trt_number'],
  4: ['instrument_ids'],
  5: ['site_altitude_m', 'site_altitude_na', 'site_altitude_confirmed', 'next_intervention_date', 'next_intervention_justification'],
  6: ['parecer'],
};

/**
 * Story 26.5: an Etapa whose every field needs a key the role lacks shows read-only (its controls
 * disabled by the fieldset) under one line of the kernel's reason; any other Etapa renders as is.
 */
function SetupBand({
  fields,
  allowed,
  needOf,
  children,
}: {
  fields: readonly string[];
  allowed: (field: string) => boolean;
  needOf: (field: string) => PermissionNeed;
  children: ReactNode;
}) {
  if (fields.some(allowed)) return <>{children}</>;
  const need = needOf(fields[0] ?? '');
  return (
    <fieldset className="setup-locked" disabled>
      {need === 'none' ? null : <span className="btn-reason">{permissionRefusalText(need)}</span>}
      {children}
    </fieldset>
  );
}

function registeredInstrumentOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const raw = (state as Record<string, unknown>).registeredInstrumentId;
  return typeof raw === 'string' ? raw : null;
}

function SetupContent({ relatorioId, snapshot, users, instruments }: SetupContentProps) {
  const db = useSession().database;
  const user = useSession().user;
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const t = copy.setup;
  const relatorio = snapshot.relatorio;
  const setup = relatorio.setup;

  const author = user === null ? null : { id: user.id, companyId: user.companyId };

  const bandRefs = useRef<Record<number, HTMLElement | null>>({});
  // Story 26.5: each setup field behind the key the kernel gives its op (`SETUP_CREATE_FIELDS`,
  // `SETUP_FILL_FIELDS`); a field the role may not write is never written from here.
  const canWrite = useCanFn();
  const needOf = (field: string): PermissionNeed => permissionForPath(relatorioSetupPath(field), { kind: 'put', value: null });
  const allowed = (field: string) => canWrite(needOf(field));
  useEffect(() => {
    const etapa = Number.parseInt(search.get('etapa') ?? '', 10);
    if (!Number.isInteger(etapa) || etapa < 1 || etapa > 6) return;
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
        const writable = fields.filter(([field]) => allowed(field));
        if (writable.length === 0) return null;
        const drafts = writable.map(([field, value]) => ({
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

  /**
   * Story 7.4 (Design Notes): the parecer is one LWW value, so every tap or text action
   * writes the whole object, built from the relatório row the store holds at the moment of
   * the write (never the render's). A refused write is toasted by the queue.
   */
  async function writeParecer(build: (current: RelatorioParecer | null) => RelatorioParecer | null, options: { toast?: string } = {}): Promise<void> {
    const batchId = await edits.write(async () => {
      if (db === null || author === null || !allowed('parecer')) return null;
      const current = (await relatorioRow(db, relatorioId))?.setup.parecer ?? null;
      const next = build(current);
      if (next === null) return null;
      const draft = { ...relatorioOpEnvelope(author, relatorioId), kind: 'put' as const, path: relatorioSetupPath('parecer'), value: next as never };
      return (await commitBatch(db, [draft], { newId, now })).batch_id;
    });
    if (batchId !== null && options.toast !== undefined) edits.notify(options.toast);
  }

  const backToExport = search.get('volta') === 'exportar' ? () => void navigate(`/relatorio/${relatorioId}?exportar=1`) : null;

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

  const gapReason = setupIncompleteReason(snapshot);
  // AD-22 (Epic 4 retro item 12): the kernel's table says whether this status completes setup.
  const completeTo = statusTable(relatorio.status, 'setup_complete');
  // Story 26.5: the status move it writes needs its key too (`permissionForPath`).
  const canComplete = completeTo !== null && canWrite(permissionForPath(relatorioStatusPath(), { kind: 'put', value: completeTo }));

  async function onComplete(): Promise<void> {
    if (gapReason !== null || db === null || author === null) return;
    // F-02: a field still holding typed text writes it first (its blur commit joins the page's
    // write queue ahead of the status put), so nothing typed is lost to the navigation.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
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
    // sheets. Status flow 2026-10-10: what is said there is the status change itself
    // ("Relatório em campo"), raised by the shell's `StatusToaster` from the commit above.
    void navigate(`/relatorio/${relatorioId}`, { state: { openSection9: true } });
  }

  return (
    <div className="setup-content">
      <h1 className="visually-hidden">{t.heading}</h1>

      <SetupBand fields={ETAPA_FIELDS[1]} allowed={allowed} needOf={needOf}>
        <Etapa1Capa
          relatorioId={relatorioId}
          snapshot={snapshot}
          onCommit={commitField}
          onCommitFields={commitFields}
          bandRef={(el) => (bandRefs.current[1] = el)}
        />
      </SetupBand>
      <SetupBand fields={ETAPA_FIELDS[2]} allowed={allowed} needOf={needOf}>
        <Etapa2Escopo
          snapshot={snapshot}
          onCommit={commitField}
          onWriteExclusions={(value) => writeFields([['exclusions', value]], true)}
          undoable={edits.undoable}
          bandRef={(el) => (bandRefs.current[2] = el)}
        />
      </SetupBand>
      <SetupBand fields={ETAPA_FIELDS[3]} allowed={allowed} needOf={needOf}>
        <Etapa3Responsavel snapshot={snapshot} users={users} onCommit={commitField} bandRef={(el) => (bandRefs.current[3] = el)} />
      </SetupBand>
      <SetupBand fields={ETAPA_FIELDS[4]} allowed={allowed} needOf={needOf}>
        <Etapa4Instrumentos
          relatorioId={relatorioId}
          snapshot={snapshot}
          instruments={instruments}
          onCommit={commitField}
          bandRef={(el) => (bandRefs.current[4] = el)}
        />
      </SetupBand>
      <SetupBand fields={ETAPA_FIELDS[5]} allowed={allowed} needOf={needOf}>
        <Etapa5Local snapshot={snapshot} onCommit={commitField} onCommitFields={commitFields} bandRef={(el) => (bandRefs.current[5] = el)} />
      </SetupBand>

      <SetupBand fields={ETAPA_FIELDS[6]} allowed={allowed} needOf={needOf}>
        <Etapa6Parecer
          relatorioId={relatorioId}
          snapshot={snapshot}
          onWriteParecer={writeParecer}
          onBackToExport={backToExport}
          bandRef={(el) => (bandRefs.current[6] = el)}
        />
      </SetupBand>

      <div className="sticky-action-bar">
        {canComplete ? (
          <Button variant="primary" isDisabled={gapReason !== null} disabledReason={gapReason ?? undefined} onPress={() => void onComplete()}>
            {t.complete}
          </Button>
        ) : (
          // Status flow 2026-10-10: a relatório that left Rascunho with gaps open still says them.
          <p className="section-note">{setupGapsNote(snapshot) ?? t.completeDone}</p>
        )}
      </div>
    </div>
  );
}
