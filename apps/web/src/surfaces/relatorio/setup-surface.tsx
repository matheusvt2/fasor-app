import {
  artOrTrtLabel,
  artTrtEchoText,
  buildSnapshot,
  calibrationCheck,
  compareInstrumentRows,
  councilLabel,
  dateRangeText,
  defaultExclusions,
  instrumentRegistryRowText,
  isInstrumentReferenced,
  registrationNumberLabel,
  setupIncompleteReason,
  statusTable,
  type BlockRow,
  type InstrumentRow,
  type RelatorioSnapshot,
  type UserRow,
} from '@app/domain';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useParams } from 'react-router';
import { Button, Checkbox, Combobox, DateField, UploadTile } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { commitFilePick, useAttachedFile } from '../../db/file-commit.ts';
import { blockRowsOf, relatorioState } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { instrumentRows } from '../../db/home-store.ts';
import { localUsers } from '../../db/sync-store.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
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

function SetupContent({ relatorioId, snapshot, users, instruments, blocks }: SetupContentProps) {
  const db = useSession().database;
  const user = useSession().user;
  const [search] = useSearchParams();
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

  /** One or more `relatorio/setup/{field}` puts, all in the same batch. */
  async function commitFields(fields: ReadonlyArray<readonly [string, unknown]>): Promise<void> {
    if (db === null || author === null) return;
    await commitBatch(
      db,
      fields.map(([field, value]) => ({
        scope: 'relatorio' as const,
        company_id: author.companyId,
        project_id: null,
        relatorio_id: relatorioId,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: author.id,
        kind: 'put' as const,
        path: `relatorio/setup/${field}`,
        value: value as never,
      })),
      { newId, now },
    );
  }

  async function commitField(field: string, value: unknown): Promise<void> {
    await commitFields([[field, value]]);
  }

  const gapReason = setupIncompleteReason(snapshot, responsible);
  const canComplete = relatorio.status === 'rascunho';

  async function onComplete(): Promise<void> {
    if (gapReason !== null || db === null || author === null) return;
    const next = statusTable('rascunho', 'setup_complete');
    if (next === null) return;
    await commitBatch(
      db,
      [
        {
          scope: 'relatorio',
          company_id: author.companyId,
          project_id: null,
          relatorio_id: relatorioId,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: author.id,
          kind: 'put',
          path: 'relatorio/status',
          value: next,
        },
      ],
      { newId, now },
    );
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
      <Etapa2Escopo snapshot={snapshot} onCommit={commitField} bandRef={(el) => (bandRefs.current[2] = el)} />
      <Etapa3Responsavel snapshot={snapshot} users={users} onCommit={commitField} bandRef={(el) => (bandRefs.current[3] = el)} />
      <Etapa4Instrumentos snapshot={snapshot} instruments={instruments} blocks={blocks} onCommit={commitField} bandRef={(el) => (bandRefs.current[4] = el)} />
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

// --- Etapa 1 — Capa ----------------------------------------------------------------------

function Etapa1Capa({
  relatorioId,
  snapshot,
  onCommit,
  onCommitFields,
  bandRef,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  onCommit: (field: string, value: unknown) => Promise<void>;
  onCommitFields: (fields: ReadonlyArray<readonly [string, unknown]>) => Promise<void>;
  bandRef: (el: HTMLElement | null) => void;
}) {
  const db = useSession().database;
  const user = useSession().user;
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;

  const additionalInfo = useTextField(setup.additional_info ?? '', (v) => onCommit('additional_info', v === '' ? null : v));
  const cover = useAttachedFile(db, setup.cover_photo_file_id);
  const additionalInfoId = useId();
  const datesEcho = dateRangeText(setup.service_start, setup.service_end);

  /** End follows the start only while it was still empty or equal to the previous start (new-relatorio-dialog's own rule). */
  function onStartChange(value: string | null): void {
    const followsEnd = setup.service_end === null || setup.service_end === setup.service_start;
    if (followsEnd) void onCommitFields([['service_start', value], ['service_end', value]]);
    else void onCommit('service_start', value);
  }

  async function attachCover(picked: { file: File; sha256: string }): Promise<void> {
    if (db === null || user === null) return;
    const fileId = newId();
    await commitFilePick(
      db,
      {
        companyId: user.companyId,
        actorId: user.id,
        fileId,
        kind: 'cover_photo',
        picked,
        ownerOps: [
          {
            scope: 'relatorio',
            company_id: user.companyId,
            project_id: null,
            relatorio_id: relatorioId,
            prev_op_id: null,
            batch_id: null,
            meta: null,
            actor_id: user.id,
            kind: 'put',
            path: 'relatorio/setup/cover_photo_file_id',
            value: fileId as never,
          },
        ],
      },
      { newId, now },
    );
  }

  return (
    <section className="section-band" aria-labelledby="setup-e1" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          1
        </span>
        <h2 className="band-title" id="setup-e1" tabIndex={-1}>
          {t.etapa1Title}
        </h2>
        <span className="band-note">{t.etapa1Note}</span>
      </div>
      <div className="band-body">
        <div className="form-grid">
          <div className="field">
            <span className="field-label">{t.clientLabel}</span>
            <div className="input">{snapshot.client?.name ?? ''}</div>
          </div>
          <div className="field">
            <span className="field-label">{t.obraLabel}</span>
            <div className="input">{snapshot.project?.site ?? snapshot.project?.name ?? ''}</div>
          </div>
          <div className="dates-3 span-2">
            <DateField label={t.startLabel} value={setup.service_start} onChange={onStartChange} />
            <div>
              <DateField label={t.endLabel} value={setup.service_end} onChange={(value) => void onCommit('service_end', value)} />
              {datesEcho === '' ? null : <span className="echo">{t.datesEcho(datesEcho)}</span>}
            </div>
          </div>
          <div className="field span-2">
            <label className="field-label" htmlFor={additionalInfoId}>
              {t.additionalInfoLabel}
            </label>
            <input
              id={additionalInfoId}
              className="input"
              value={additionalInfo.text}
              onChange={(event) => additionalInfo.change(event.target.value)}
              onBlur={additionalInfo.blur}
            />
          </div>
          <UploadTile
            className="span-2"
            kind="cover_photo"
            layout="tile"
            label={t.coverPhotoLabel}
            file={cover}
            onPick={(picked) => attachCover(picked)}
          />
        </div>
      </div>
    </section>
  );
}

// --- Etapa 2 — Objetivo e escopo ----------------------------------------------------------

function Etapa2Escopo({
  snapshot,
  onCommit,
  bandRef,
}: {
  snapshot: RelatorioSnapshot;
  onCommit: (field: string, value: unknown) => Promise<void>;
  bandRef: (el: HTMLElement | null) => void;
}) {
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const today = useMemo(() => now().toISOString().slice(0, 10), []);
  const seedExclusions = useMemo(() => defaultExclusions(snapshot.relatorio.seed_version, today), [snapshot.relatorio.seed_version, today]);
  const [exclusions, setExclusions] = useState<string[]>(() => setup.exclusions ?? seedExclusions);
  // Resync when another device (or an undo) changes `setup.exclusions` while this page stays
  // open, mirroring `useTextField`'s committed-ref pattern below.
  const committedExclusions = useRef(setup.exclusions);
  if (setup.exclusions !== committedExclusions.current) {
    committedExclusions.current = setup.exclusions;
    setExclusions(setup.exclusions ?? seedExclusions);
  }
  const exclusionsCommitter = useFieldCommit<string[]>({ commit: (value) => onCommit('exclusions', value) });

  const local = useTextField(setup.local ?? '', (v) => onCommit('local', v === '' ? null : v));
  const escopo = useTextField(setup.escopo ?? '', (v) => onCommit('escopo', v === '' ? null : v));
  const localId = useId();
  const escopoId = useId();

  function onExclusionChange(index: number, value: string): void {
    const next = exclusions.slice();
    next[index] = value;
    setExclusions(next);
    exclusionsCommitter.change(next);
  }

  function onAddExclusion(): void {
    const next = [...exclusions, ''];
    setExclusions(next);
    exclusionsCommitter.change(next);
  }

  return (
    <section className="section-band" aria-labelledby="setup-e2" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          2
        </span>
        <h2 className="band-title" id="setup-e2" tabIndex={-1}>
          {t.etapa2Title}
        </h2>
        <span className="band-note">{t.etapa2Note}</span>
      </div>
      <div className="band-body">
        <div className="form-grid">
          <div className="field">
            <span className="field-label">{t.empresaExecutoraLabel}</span>
            <div className="input">{snapshot.empresa?.name ?? ''}</div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={localId}>
              {t.localLabel}
            </label>
            <input id={localId} className="input" value={local.text} onChange={(event) => local.change(event.target.value)} onBlur={local.blur} />
          </div>
          <div className="field span-2">
            <label className="field-label" htmlFor={escopoId}>
              {t.escopoLabel}
            </label>
            <textarea id={escopoId} className="observation-field" value={escopo.text} onChange={(event) => escopo.change(event.target.value)} onBlur={escopo.blur} />
          </div>
        </div>
        <ul className="exclusion-list" aria-label={t.exclusionsLabel}>
          {exclusions.map((text, i) => (
            <li key={i}>
              <span className="exclusion-num" aria-hidden="true">
                {i + 1}.
              </span>
              <input
                className="input grow"
                aria-label={t.exclusionFieldLabel(i + 1)}
                value={text}
                onChange={(event) => onExclusionChange(i, event.target.value)}
                onBlur={() => exclusionsCommitter.blur()}
              />
            </li>
          ))}
        </ul>
        <div className="row">
          <Button variant="secondary" onPress={onAddExclusion}>
            {t.addExclusion}
          </Button>
        </div>
      </div>
    </section>
  );
}

// --- Etapa 3 — Responsável ------------------------------------------------------------------

function Etapa3Responsavel({
  snapshot,
  users,
  onCommit,
  bandRef,
}: {
  snapshot: RelatorioSnapshot;
  users: readonly UserRow[];
  onCommit: (field: string, value: unknown) => Promise<void>;
  bandRef: (el: HTMLElement | null) => void;
}) {
  const session = useSession();
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const selected = users.find((row) => row.id === setup.responsible_user_id) ?? null;
  const selectedName = selected?.name ?? null;
  const [text, setText] = useState(() => selectedName ?? users.find((row) => row.id === session.user?.id)?.name ?? '');
  // Resync `text` to `selected?.name` whenever `selected` changes (another device picks or
  // clears the responsible, or `users` finishes loading after this page's first paint), while
  // still letting the user free-type to search: mirrors `useTextField`'s committed-ref pattern.
  const committedName = useRef<string | null>(null);
  if (selectedName !== committedName.current) {
    committedName.current = selectedName;
    if (selectedName !== null && selectedName !== text) setText(selectedName);
  }

  const options = users.map((row) => ({ id: row.id, label: row.name }));
  const label = selected?.council === null || selected?.council === undefined ? null : artOrTrtLabel(selected.council);
  const artTrtNumber = useTextField(setup.art_trt_number ?? '', (v) => onCommit('art_trt_number', v === '' ? null : v));
  const artTrtId = useId();

  return (
    <section className="section-band" aria-labelledby="setup-e3" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          3
        </span>
        <h2 className="band-title" id="setup-e3" tabIndex={-1}>
          {t.etapa3Title}
        </h2>
        <span className="band-note">{t.etapa3Note}</span>
      </div>
      <div className="band-body">
        <div className="form-grid">
          <Combobox
            label={t.responsibleLabel}
            options={options}
            selectedKey={setup.responsible_user_id}
            inputValue={text}
            onInputChange={setText}
            onSelectionChange={(key) => {
              const picked = users.find((row) => row.id === key);
              setText(picked?.name ?? text);
              void onCommit('responsible_user_id', key);
            }}
          />
          {selected === null ? null : (
            <>
              <div className="field">
                <span className="field-label">{t.councilLabel}</span>
                <div className="input">{selected.council === null ? '' : councilLabel(selected.council)}</div>
              </div>
              <div className="field">
                <span className="field-label">{selected.council === null ? '' : registrationNumberLabel(selected.council)}</span>
                <div className="input tabular">{selected.registration_number ?? ''}</div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={artTrtId}>
                  {label ?? t.artTrtFallbackLabel}
                </label>
                <input
                  id={artTrtId}
                  className="input tabular"
                  value={artTrtNumber.text}
                  onChange={(event) => artTrtNumber.change(event.target.value)}
                  onBlur={artTrtNumber.blur}
                />
                {(() => {
                  const echo = artTrtEchoText(label, artTrtNumber.text);
                  return echo === null ? null : <span className="echo">{echo}</span>;
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// --- Etapa 4 — Instrumentos e certificados -------------------------------------------------

function Etapa4Instrumentos({
  snapshot,
  instruments,
  blocks,
  onCommit,
  bandRef,
}: {
  snapshot: RelatorioSnapshot;
  instruments: readonly InstrumentRow[];
  blocks: readonly BlockRow[];
  onCommit: (field: string, value: unknown) => Promise<void>;
  bandRef: (el: HTMLElement | null) => void;
}) {
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const [refusedNote, setRefusedNote] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      instruments
        .map((instrument) => ({ instrument, status: calibrationCheck(instrument, setup.service_end, now()) }))
        .sort(compareInstrumentRows),
    [instruments, setup.service_end],
  );

  function onToggle(id: string, isSelected: boolean): void {
    if (!isSelected && isInstrumentReferenced(id, blocks)) {
      setRefusedNote(id);
      return;
    }
    setRefusedNote(null);
    const next = isSelected ? [...setup.instrument_ids, id] : setup.instrument_ids.filter((existing) => existing !== id);
    void onCommit('instrument_ids', next);
  }

  return (
    <section className="section-band" aria-labelledby="setup-e4" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          4
        </span>
        <h2 className="band-title" id="setup-e4" tabIndex={-1}>
          {t.etapa4Title}
        </h2>
        <span className="band-note">{t.etapa4Note}</span>
      </div>
      <div className="band-body">
        <p className="section-note">{t.instrumentsNote}</p>
        <ul className="instrument-list instrument-picker">
          {rows.map(({ instrument, status }) => {
            const text = instrumentRegistryRowText(instrument, status);
            const isSelected = setup.instrument_ids.includes(instrument.id);
            const noteId = refusedNote === instrument.id ? `instrument-note-${instrument.id}` : undefined;
            return (
              <li key={instrument.id}>
                <Checkbox isSelected={isSelected} onChange={(checked) => onToggle(instrument.id, checked)} aria-describedby={noteId}>
                  <span className="ip-code">{text.code}</span>
                  <span className="ip-text">
                    <span className="ip-name">{text.primaryRest}</span>
                    <span className="ip-detail">
                      {text.secondaryLead}
                      {text.validity === null ? null : ` · ${text.validity.text}`}
                    </span>
                  </span>
                </Checkbox>
                {noteId === undefined ? null : (
                  <p className="ip-expired" id={noteId} role="status">
                    {t.instrumentReferenced}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// --- Etapa 5 — Local -------------------------------------------------------------------------

function Etapa5Local({
  snapshot,
  onCommit,
  onCommitFields,
  bandRef,
}: {
  snapshot: RelatorioSnapshot;
  onCommit: (field: string, value: unknown) => Promise<void>;
  onCommitFields: (fields: ReadonlyArray<readonly [string, unknown]>) => Promise<void>;
  bandRef: (el: HTMLElement | null) => void;
}) {
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const justification = useTextField(setup.next_intervention_justification ?? '', (v) => onCommit('next_intervention_justification', v === '' ? null : v));
  const justificationId = useId();
  const altitudeId = useId();

  // The altitude is always a plain typeable numeric field: geolocation, when it succeeds
  // with a real reading, only pre-fills it once (never overwriting a value the user already
  // typed); a denial, an unavailable API, or a reading with no altitude (`coords.altitude ===
  // null`, common on non-GPS devices) all leave the field exactly as typeable and empty.
  const [altitudeText, setAltitudeText] = useState<string>(() => (setup.site_altitude_m === null ? '' : String(setup.site_altitude_m)));
  const altitudeUserEdited = useRef(setup.site_altitude_m !== null);

  useEffect(() => {
    if (setup.site_altitude_m !== null || setup.site_altitude_confirmed) return;
    const geolocation = (globalThis.navigator as Navigator | undefined)?.geolocation;
    if (geolocation === undefined) return;
    geolocation.getCurrentPosition(
      (position) => {
        if (altitudeUserEdited.current || position.coords.altitude === null) return;
        setAltitudeText(String(Math.round(position.coords.altitude)));
      },
      () => undefined,
    );
    // Asked once per relatório, on mount only.
  }, []);

  const parsedAltitude = altitudeText.trim() === '' ? null : Number(altitudeText);
  const shownAltitude = parsedAltitude !== null && Number.isFinite(parsedAltitude) ? parsedAltitude : null;
  const confirmedText = setup.site_altitude_m === null ? '' : setup.site_altitude_m < 1000 ? t.altitudeUnder1000 : `${setup.site_altitude_m} m`;

  async function onConfirmAltitude(): Promise<void> {
    if (shownAltitude === null) return;
    // One batch, two puts (the matrix's "in one batch").
    await onCommitFields([
      ['site_altitude_m', Math.round(shownAltitude)],
      ['site_altitude_confirmed', true],
    ]);
  }

  return (
    <section className="section-band" aria-labelledby="setup-e5" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          5
        </span>
        <h2 className="band-title" id="setup-e5" tabIndex={-1}>
          {t.etapa5Title}
        </h2>
        <span className="band-note">{t.etapa5Note}</span>
      </div>
      <div className="band-body">
        <div className="form-grid">
          <div className="field suggestion-field altitude-field span-2" data-state={setup.site_altitude_confirmed ? undefined : 'suggested'}>
            <label className="field-label" htmlFor={altitudeId}>
              {t.altitudeLabel}
            </label>
            {setup.site_altitude_confirmed ? (
              <span className="helper helper-ok">{t.altitudeConfirmed(confirmedText)}</span>
            ) : (
              <>
                <div className="measurement-field">
                  <input
                    id={altitudeId}
                    type="number"
                    className="mf-value"
                    value={altitudeText}
                    onChange={(event) => {
                      altitudeUserEdited.current = true;
                      setAltitudeText(event.target.value);
                    }}
                  />
                  <span className="mf-unit" aria-label="metros">
                    m
                  </span>
                  {shownAltitude === null ? null : (
                    <Button variant="secondary" onPress={() => void onConfirmAltitude()}>
                      {t.altitudeConfirm}
                    </Button>
                  )}
                </div>
                <span className="suggested-pill">{t.altitudeSuggestedPill}</span>
              </>
            )}
          </div>
          <DateField
            label={t.nextInterventionDateLabel}
            value={setup.next_intervention_date}
            onChange={(value) => void onCommit('next_intervention_date', value)}
          />
          <div className="field">
            <label className="field-label" htmlFor={justificationId}>
              {t.nextInterventionJustificationLabel}
            </label>
            <input
              id={justificationId}
              className="input"
              value={justification.text}
              onChange={(event) => justification.change(event.target.value)}
              onBlur={justification.blur}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// --- shared field helper -----------------------------------------------------------------

/** A locally-echoed, debounced text field committing through `useFieldCommit` (empresa-tab's pattern). */
function useTextField(value: string, commit: (value: string) => void | Promise<void>) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const committer = useFieldCommit<string>({ commit });
  if (value !== committed.current) {
    committed.current = value;
    if (value !== text) setText(value);
  }
  return {
    text,
    change: (next: string) => {
      setText(next);
      committer.change(next);
    },
    blur: () => committer.blur(),
  };
}
