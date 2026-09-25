import {
  artOrTrtLabel,
  artTrtEchoText,
  buildSnapshot,
  calibrationCheck,
  compareInstrumentRows,
  councilLabel,
  dateRangeText,
  defaultExclusions,
  instrumentDetailSeparator,
  instrumentExpiredNoteText,
  instrumentRegistryRowText,
  isInstrumentReferenced,
  projectLabel,
  putRelatorioStatusOp,
  registrationNumberLabel,
  relatorioOpEnvelope,
  setupIncompleteReason,
  siteAltitudeText,
  statusTable,
  withoutExclusion,
  type BlockRow,
  type InstrumentRow,
  type RelatorioSnapshot,
  type UserRow,
} from '@app/domain';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router';
import { Button, Checkbox, Combobox, DateField, OverflowMenu, TextButton, UploadTile } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { commitFilePick, useAttachedFile } from '../../db/file-commit.ts';
import { relatorioRow } from '../../db/generate-store.ts';
import { blockRowsOf, relatorioState } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { instrumentRows } from '../../db/home-store.ts';
import { localUsers } from '../../db/sync-store.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { useUndoableEdits, type UndoableEdits } from '../../state/use-undoable-edits.ts';
import { focusWhenRendered } from './relatorio-focus.ts';
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
          path: `relatorio/setup/${field}`,
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
  const period = useServicePeriod(setup.service_start, setup.service_end, onCommitFields);
  const datesEcho = dateRangeText(period.start, period.end);

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
            <div className="input">{snapshot.project === null ? '' : projectLabel(snapshot.project)}</div>
          </div>
          <div className="dates-3 span-2">
            {/* Wrapped like the end field's own div (not a bare grid child): the end
                cell is taller because of its "Na capa" echo, and an unwrapped start
                field would stretch to match under the grid's default `align-items:
                stretch`, drifting its absolutely-positioned calendar glyph low. */}
            <div>
              <DateField label={t.startLabel} value={period.start} onChange={period.onStartChange} onBlur={period.blur} />
            </div>
            <div>
              <DateField label={t.endLabel} value={period.end} onChange={period.onEndChange} onBlur={period.blur} />
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
  onWriteExclusions,
  undoable,
  bandRef,
}: {
  snapshot: RelatorioSnapshot;
  onCommit: (field: string, value: unknown) => Promise<void>;
  /** Writes the whole list now, as its own batch; resolves to the batch id. */
  onWriteExclusions: (value: string[]) => Promise<string | null>;
  undoable: UndoableEdits['undoable'];
  bandRef: (el: HTMLElement | null) => void;
}) {
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const today = useMemo(() => now().toISOString().slice(0, 10), []);
  const seedExclusions = useMemo(() => defaultExclusions(snapshot.relatorio.seed_version, today), [snapshot.relatorio.seed_version, today]);
  const [exclusions, setExclusions] = useState<string[]>(() => setup.exclusions ?? seedExclusions);
  // Resync when another device (or an undo) changes `setup.exclusions` while this page stays
  // open, mirroring `useTextField`'s committed-ref pattern below -- by content, not by
  // reference: `relatorioState`'s live query rebuilds a fresh array on every refresh (an
  // unrelated field's commit, a sync pull), so comparing `!==` on the array itself would
  // treat every such refresh as an external change and reset an in-progress edit.
  const committedExclusions = useRef(exclusionsKey(setup.exclusions));
  const nextKey = exclusionsKey(setup.exclusions);
  if (nextKey !== committedExclusions.current) {
    committedExclusions.current = nextKey;
    setExclusions(setup.exclusions ?? seedExclusions);
  }
  const exclusionsCommitter = useFieldCommit<string[]>({ commit: (value) => onCommit('exclusions', value) });

  // No "Escopo" field (Epic 4 QA Q3): in seed v1 `{escopo}` prints only on the cover, and
  // resolves from Etapa 1's "Informações adicionais"; `setup.escopo` would print nowhere.
  const local = useTextField(setup.local ?? '', (v) => onCommit('local', v === '' ? null : v));
  const localId = useId();

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

  // Epic 4 retro item 24: "Remover" of an exclusion's overflow menu writes the list without
  // it at once (what was typed is flushed first, so the undo puts exactly that back), with
  // "Desfazer" in the toast. The focus goes to the row now at its place, else the one before,
  // else "Adicionar exclusão"; after "Desfazer", to the restored row's menu.
  const listRef = useRef<HTMLUListElement>(null);
  const addButton = (): HTMLElement | null => listRef.current?.parentElement?.querySelector<HTMLElement>(':scope > .row > .btn') ?? null;
  const triggerAt = (index: number): HTMLElement | null =>
    listRef.current?.querySelectorAll<HTMLElement>(':scope > li .overflow-trigger')[index] ?? null;

  async function onRemoveExclusion(index: number): Promise<void> {
    exclusionsCommitter.flush();
    const before = exclusions.length;
    const next = withoutExclusion(exclusions, index);
    setExclusions(next);
    const batchId = await onWriteExclusions(next).catch(() => null);
    if (batchId === null) {
      // Nothing was written: the store still holds the row, so the view shows it again
      // (a later autosave of the list must not drop it silently).
      setExclusions(exclusions);
      return;
    }
    focusWhenRendered(() => {
      if ((listRef.current?.children.length ?? 0) >= before) return null;
      return triggerAt(index) ?? triggerAt(index - 1) ?? addButton();
    });
    undoable(t.exclusionRemoved(index + 1), batchId, {
      label: t.undo,
      onUndo: () => focusWhenRendered(() => ((listRef.current?.children.length ?? 0) >= before ? triggerAt(index) : null)),
    });
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
        </div>
        <ul className="exclusion-list" aria-label={t.exclusionsLabel} ref={listRef}>
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
              <OverflowMenu
                name={t.exclusionFieldLabel(i + 1)}
                label={t.exclusionMenuLabel(i + 1)}
                items={[]}
                destructiveItems={[{ id: 'remove', label: t.removeExclusion, onAction: () => void onRemoveExclusion(i) }]}
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
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const selected = users.find((row) => row.id === setup.responsible_user_id) ?? null;
  const selectedName = selected?.name ?? null;
  // Empty, never the session user's name, while `responsible_user_id` is still null: a
  // screen must not look filled while it is not (review finding 3). The account's default
  // responsável is written in the creation batch instead (`instantiateTemplate`'s
  // `responsible_user_id`, Epic 4 QA Q2), so a new relatório arrives here already filled.
  const [text, setText] = useState(() => selectedName ?? '');
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
                <span className="field-label">{selected.council === null ? t.registrationNumberFallbackLabel : registrationNumberLabel(selected.council)}</span>
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
              {selected.title === null ? null : (
                <div className="field span-2">
                  <span className="helper">{t.councilHelper(selected.title)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// --- Etapa 4 — Instrumentos e certificados -------------------------------------------------

function Etapa4Instrumentos({
  relatorioId,
  snapshot,
  instruments,
  blocks,
  onCommit,
  bandRef,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  instruments: readonly InstrumentRow[];
  blocks: readonly BlockRow[];
  onCommit: (field: string, value: unknown) => Promise<void>;
  bandRef: (el: HTMLElement | null) => void;
}) {
  const t = copy.setup;
  const navigate = useNavigate();
  const registerReasonId = useId();
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
        <p className="section-note">{rows.length === 0 ? t.noInstruments : t.instrumentsNote}</p>
        <ul className="instrument-list instrument-picker">
          {rows.map(({ instrument, status }) => {
            const text = instrumentRegistryRowText(instrument, status);
            const isSelected = setup.instrument_ids.includes(instrument.id);
            const refusedId = refusedNote === instrument.id ? `instrument-note-${instrument.id}` : undefined;
            const expiredNote = instrumentExpiredNoteText(text);
            const expiredId = expiredNote === null ? undefined : `instrument-expired-${instrument.id}`;
            const describedBy = [expiredId, refusedId].filter((id): id is string => id !== undefined).join(' ') || undefined;
            return (
              <li key={instrument.id}>
                <Checkbox isSelected={isSelected} onChange={(checked) => onToggle(instrument.id, checked)} aria-describedby={describedBy}>
                  <span className="ip-code">{text.code}</span>
                  <span className="ip-text">
                    <span className="ip-name">{text.primaryRest}</span>
                    <span className="ip-detail">
                      {text.secondaryLead}
                      {instrumentDetailSeparator(text)}
                      {text.validity === null ? null : text.validity.expired ? <span className="ip-expired">{text.validity.text}</span> : text.validity.text}
                    </span>
                  </span>
                </Checkbox>
                {expiredId === undefined ? null : (
                  <p className="ip-expired" id={expiredId} role="status">
                    {expiredNote}
                  </p>
                )}
                {refusedId === undefined ? null : (
                  <p className="ip-expired" id={refusedId} role="status">
                    {t.instrumentReferenced}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {/* Story 12.2 (J-11): `50-relatorio-setup.html` Etapa 4's row. It opens the new
            instrument's panel in Cadastros › Instrumentos, whose "Fechar" comes back here. */}
        <div className="row">
          <TextButton
            aria-describedby={registerReasonId}
            onPress={() =>
              void navigate('/cadastros', {
                state: { tab: 'instrumentos', newInstrument: true, returnTo: `/relatorio/${relatorioId}/setup?etapa=4` },
              })
            }
          >
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-plus" />
            </svg>
            {t.registerInstrument}
          </TextButton>
          <span className="btn-reason" id={registerReasonId}>
            {t.registerInstrumentReason}
          </span>
        </div>
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
  const nextInterventionDate = useDateField(setup.next_intervention_date, (v) => onCommit('next_intervention_date', v));

  // The altitude is always a plain typeable numeric field: geolocation, when it succeeds
  // with a real reading, only pre-fills it once (never overwriting a value the user already
  // typed); a denial, an unavailable API, or a reading with no altitude (`coords.altitude ===
  // null`, common on non-GPS devices) all leave the field exactly as typeable and empty.
  const [altitudeText, setAltitudeText] = useState<string>(() => (setup.site_altitude_m === null ? '' : String(setup.site_altitude_m)));
  const altitudeUserEdited = useRef(setup.site_altitude_m !== null);
  // The geolocation reading, once one exists: only then is the field a Suggestion (the
  // amber `data-state="suggested"` and the "Sugerido" pill, Epic 4 QA Q8), and only while
  // it still shows that reading.
  const [reading, setReading] = useState<string | null>(null);
  const altitudeInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (setup.site_altitude_m !== null || setup.site_altitude_confirmed) return;
    const geolocation = (globalThis.navigator as Navigator | undefined)?.geolocation;
    if (geolocation === undefined) return;
    geolocation.getCurrentPosition(
      (position) => {
        if (altitudeUserEdited.current || position.coords.altitude === null) return;
        const text = String(Math.round(position.coords.altitude));
        setReading(text);
        setAltitudeText(text);
      },
      () => undefined,
    );
    // Asked once per relatório, on mount only.
  }, []);

  const parsedAltitude = altitudeText.trim() === '' ? null : Number(altitudeText);
  const shownAltitude = parsedAltitude !== null && Number.isFinite(parsedAltitude) ? parsedAltitude : null;
  const confirmedText = setup.site_altitude_m === null ? '' : siteAltitudeText(setup.site_altitude_m);
  const suggested = !setup.site_altitude_confirmed && reading !== null && altitudeText === reading;

  async function onConfirmAltitude(): Promise<void> {
    if (shownAltitude === null) return;
    // Confirmed, the value is the user's: "Alterar" later reopens it plain, never "Sugerido" again.
    setReading(null);
    // One batch, two puts (the matrix's "in one batch").
    await onCommitFields([
      ['site_altitude_m', Math.round(shownAltitude)],
      ['site_altitude_confirmed', true],
    ]);
  }

  /** "Alterar": the confirmed altitude opens again as a typed field, its value kept, the focus in it (Q8). */
  async function onChangeAltitude(): Promise<void> {
    altitudeUserEdited.current = true;
    setAltitudeText(setup.site_altitude_m === null ? '' : String(setup.site_altitude_m));
    await onCommit('site_altitude_confirmed', false);
    focusWhenRendered(() => altitudeInput.current);
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
          <div className="field suggestion-field altitude-field span-2" data-state={suggested ? 'suggested' : undefined}>
            {setup.site_altitude_confirmed ? (
              <span className="field-label">{t.altitudeLabel}</span>
            ) : (
              <label className="field-label" htmlFor={altitudeId}>
                {t.altitudeLabel}
              </label>
            )}
            {setup.site_altitude_confirmed ? (
              <span className="row">
                <span className="helper helper-ok">{t.altitudeConfirmed(confirmedText)}</span>
                <TextButton aria-label={t.altitudeChangeLabel} onPress={() => void onChangeAltitude()}>
                  {t.altitudeChange}
                </TextButton>
              </span>
            ) : (
              <>
                <div className="measurement-field">
                  <input
                    id={altitudeId}
                    ref={altitudeInput}
                    type="number"
                    className="mf-value"
                    value={altitudeText}
                    onChange={(event) => {
                      altitudeUserEdited.current = true;
                      setAltitudeText(event.target.value);
                    }}
                  />
                  <span className="mf-unit" aria-label={t.altitudeUnit}>
                    m
                  </span>
                  {shownAltitude === null ? null : (
                    <Button variant="secondary" onPress={() => void onConfirmAltitude()}>
                      {t.altitudeConfirm}
                    </Button>
                  )}
                </div>
                {suggested ? <span className="suggested-pill">{t.altitudeSuggestedPill}</span> : null}
              </>
            )}
          </div>
          <DateField label={t.nextInterventionDateLabel} value={nextInterventionDate.date} onChange={nextInterventionDate.change} onBlur={nextInterventionDate.blur} />
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

/** A content key for `setup.exclusions` (null vs. an array, and the array's own values), so a resync compares what changed, not which object it lives in. */
function exclusionsKey(value: readonly string[] | null): string {
  return value === null ? '\u0000' : JSON.stringify(value);
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

/**
 * A locally-echoed, debounced `DateField` (the same `useTextField` shape, for a single
 * ISO date): the segment buffer React Aria types into lives in local state, resynced from
 * the committed value only when it actually changed (a real external write, not this
 * field's own round trip through Dexie's live query), so a live-query re-render mid-typing
 * never resets the segments a keystroke is still building (review finding 1).
 */
function useDateField(value: string | null, commit: (value: string | null) => void | Promise<void>) {
  const [date, setDate] = useState(value);
  const committed = useRef(value);
  const committer = useFieldCommit<string | null>({ commit });
  if (value !== committed.current) {
    committed.current = value;
    if (value !== date) setDate(value);
  }
  return {
    date,
    change: (next: string | null) => {
      setDate(next);
      committer.change(next);
    },
    // Focus leaving the field settles the pending commit now, matching `useTextField`'s own
    // blur wiring: without it, a debounced date typed right before the user navigates away
    // (e.g. "Concluir dados do relatório" then "Voltar") can still be mid-idle-wait when the
    // page unmounts, and `useFieldCommit`'s own unmount cleanup drops a pending commit rather
    // than writing behind the user's back -- losing the very last thing typed.
    blur: () => committer.blur(),
  };
}

/**
 * Etapa 1's two dates, local-echoed like `useDateField`, with "end follows start" (ported
 * from `new-relatorio-dialog.tsx`) and one debounced batch of both fields when it does.
 */
function useServicePeriod(serviceStart: string | null, serviceEnd: string | null, onCommitFields: (fields: ReadonlyArray<readonly [string, unknown]>) => Promise<void>) {
  const [start, setStart] = useState(serviceStart);
  const [end, setEnd] = useState(serviceEnd);
  const committedStart = useRef(serviceStart);
  const committedEnd = useRef(serviceEnd);
  if (serviceStart !== committedStart.current) {
    committedStart.current = serviceStart;
    if (serviceStart !== start) setStart(serviceStart);
  }
  if (serviceEnd !== committedEnd.current) {
    committedEnd.current = serviceEnd;
    if (serviceEnd !== end) setEnd(serviceEnd);
  }
  const committer = useFieldCommit<ReadonlyArray<readonly [string, unknown]>>({ commit: onCommitFields });

  return {
    start,
    end,
    onStartChange: (next: string | null) => {
      const followsEnd = end === null || end === start;
      const nextEnd = followsEnd ? next : end;
      setStart(next);
      if (followsEnd) setEnd(nextEnd);
      committer.change(followsEnd ? [['service_start', next], ['service_end', nextEnd]] : [['service_start', next]]);
    },
    onEndChange: (next: string | null) => {
      setEnd(next);
      committer.change([['service_end', next]]);
    },
    // See `useDateField`'s own comment: flush a pending debounced commit when focus leaves
    // either date, so navigating away right after typing never drops the last one typed.
    blur: () => committer.blur(),
  };
}
