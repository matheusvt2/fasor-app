import {
  calibrationValidUntil,
  formatCalendarDate,
  instrumentManufacturerRecents,
  toIso,
  wordRowByName,
  type InstrumentRow,
  type OpDraft,
  type WordRow,
} from '@app/domain';
import { useId, useRef, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  RegistryPickerField,
  TextButton,
  Toggle,
  UploadTile,
  type PickedFile,
} from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { commitFilePick, useAttachedFile } from '../../db/file-commit.ts';
import { ensureLocalBlob } from '../../db/file-store.ts';
import { instrumentRows, manufacturerRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { sameFieldValue } from './field-value.ts';

const NO_WORDS: WordRow[] = [];
const NO_INSTRUMENTS: InstrumentRow[] = [];

export interface InstrumentPanelProps {
  /** The id this panel edits: minted locally for "Novo instrumento" before it exists. */
  instrumentId: string;
  /** The live row, or null while it has not been created yet (no field committed). */
  instrument: InstrumentRow | null;
  /** AC4: whether a live block's sheet still points at this instrument. */
  referenced: boolean;
  onClose: () => void;
}

type TestDefaultField = 'test_isolacao' | 'test_resistencia_contato' | 'test_relacao_transformacao';

function defaultRow(id: string): InstrumentRow {
  return {
    id,
    kind: 'instrument',
    code: '',
    name: '',
    manufacturer: null,
    model: null,
    serial: null,
    cert_number: null,
    laboratory: null,
    calibrated_at: null,
    calibration_interval_months: null,
    rbc_accredited: null,
    test_isolacao: null,
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
  };
}

/**
 * The Instrumentos edit panel (`80-cadastros.html` L271-350): a persistent side panel
 * (full-width under the list on tablet through `.registry-layout{flex-direction:column}`,
 * full-screen on phone through `app.css`, AC 2.1), never a `FormDialog` (Design Notes). Every field autosaves on its own op (AC2, no Save
 * button); the very first field of a new instrument carries a `create` op with the rest
 * of the row defaulted (AD-3, the Code Map's call-site model), every field after that —
 * on this or any existing instrument — is a `registry/instrument/{id}/{field}` put.
 */
export function InstrumentPanel({ instrumentId, instrument, referenced, onClose }: InstrumentPanelProps) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const created = useRef(instrument !== null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const t = copy.registries.instrumentos;
  const titleId = useId();
  const certificate = useAttachedFile(db, instrument?.certificate_file_id ?? null);
  const { fetchFile } = useSync();

  const manufacturers = useLiveQuery(() => (db === null ? Promise.resolve(NO_WORDS) : manufacturerRows(db)), [db], NO_WORDS);
  const instruments = useLiveQuery(
    () => (db === null ? Promise.resolve(NO_INSTRUMENTS) : instrumentRows(db)),
    [db],
    NO_INSTRUMENTS,
  );

  function opBase(): Omit<OpDraft, 'kind' | 'path' | 'value'> | null {
    if (user === null) return null;
    return {
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.id,
    };
  }

  /**
   * One op per field. `before` rides in the same batch ahead of it: the manufacturer a
   * "Criar “…”" creates lands with the instrument field that names it (Story 2.5 AC3).
   */
  async function commitField(field: string, value: unknown, before: readonly OpDraft[] = []): Promise<void> {
    const base = opBase();
    if (db === null || base === null) return;
    // Nothing to say when the value is the one the row already holds (Epic 2 retro D-8).
    if (instrument !== null && before.length === 0 && sameFieldValue((instrument as Record<string, unknown>)[field], value)) return;
    if (!created.current) {
      created.current = true;
      const row = { ...defaultRow(instrumentId), [field]: value };
      const op: OpDraft = { ...base, kind: 'create', path: `registry/instrument/${instrumentId}`, value: row as never };
      await commitBatch(db, [...before, op], { newId, now });
      return;
    }
    const op: OpDraft = { ...base, kind: 'put', path: `registry/instrument/${instrumentId}/${field}`, value: value as never };
    await commitBatch(db, [...before, op], { newId, now });
  }

  /** "Criar “Celtta”": a new Fabricantes entry, offline, taken by this field at once. */
  async function createManufacturer(name: string): Promise<void> {
    const base = opBase();
    if (base === null || name === '') return;
    const id = newId();
    const row = { id, kind: 'manufacturer', name, gender: null, number: null, removed_at: null };
    await commitField('manufacturer', name, [{ ...base, kind: 'create', path: `registry/manufacturer/${id}`, value: row as never }]);
  }

  /**
   * AC 2.2-3: the certificate opens from the row, from this device's own copy when it
   * holds one, otherwise fetched from the server on demand and kept here (Epic 2 retro
   * D-3). The tab is opened inside the tap, before any await, so no popup blocker eats it.
   */
  async function openCertificate(): Promise<void> {
    const fileId = instrument?.certificate_file_id ?? null;
    if (db === null || fileId === null) return;
    const opened = window.open('', '_blank');
    const blob = await ensureLocalBlob(db, fileId, 'original', { fetchFile, nowIso: toIso(now()) });
    if (blob === null) {
      opened?.close();
      showToast(t.certificateUnavailable);
      return;
    }
    const url = URL.createObjectURL(blob);
    if (opened === null) window.open(url, '_blank');
    else opened.location.href = url;
    // The new tab has loaded the bytes by then; the URL only has to outlive that.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function archiveOrRemove(): Promise<void> {
    if (db === null || user === null || instrument === null) return;
    const { batch_id } = await commitBatch(
      db,
      [
        {
          kind: 'remove',
          scope: 'company',
          company_id: user.companyId,
          project_id: null,
          relatorio_id: null,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: user.id,
          path: `registry/instrument/${instrumentId}/removed_at`,
          value: null,
        },
      ],
      { newId, now },
    );
    const code = instrument.code;
    showToast(referenced ? t.archived(code) : t.removed(code), {
      action: { label: t.undo, onPress: () => void undoBatch(db, batch_id, { newId, now }) },
    });
    onClose();
  }

  /**
   * Story 2.2: the certificate is one file batch — the `file/{id}` create, the
   * `certificate_file_id` put and the Blob together (AR-6). An instrument that does not
   * exist yet is created first by the same rule every other field follows.
   */
  async function attachCertificate(picked: PickedFile): Promise<void> {
    if (db === null || user === null) return;
    if (!created.current) {
      created.current = true;
      await commitBatch(
        db,
        [
          {
            kind: 'create',
            scope: 'company',
            company_id: user.companyId,
            project_id: null,
            relatorio_id: null,
            prev_op_id: null,
            batch_id: null,
            meta: null,
            actor_id: user.id,
            path: `registry/instrument/${instrumentId}`,
            value: defaultRow(instrumentId) as never,
          },
        ],
        { newId, now },
      );
    }
    const fileId = newId();
    await commitFilePick(
      db,
      {
        companyId: user.companyId,
        actorId: user.id,
        fileId,
        kind: 'certificate',
        picked,
        ownerOps: [
          {
            kind: 'put',
            scope: 'company',
            company_id: user.companyId,
            project_id: null,
            relatorio_id: null,
            prev_op_id: null,
            batch_id: null,
            meta: null,
            actor_id: user.id,
            path: `registry/instrument/${instrumentId}/certificate_file_id`,
            value: fileId as never,
          },
        ],
      },
      { newId, now },
    );
  }

  const validUntil = instrument === null ? null : calibrationValidUntil(instrument.calibrated_at, instrument.calibration_interval_months);

  return (
    <aside className="registry-panel" aria-labelledby={titleId}>
      <div className="panel-head">
        <div className="grow">
          <h2 className="panel-title" id={titleId}>
            {instrument === null ? t.newInstrument : `${instrument.code} — ${instrument.name}`}
          </h2>
        </div>
        <button type="button" className="icon-btn" aria-label={t.close} onClick={onClose}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-close" />
          </svg>
        </button>
      </div>
      <div className="panel-body">
        <div className="field-grid">
          {/* Editable after creation too (Epic 2 retro D-8): a typo in the code must be
              fixable. Sheets keep the instrument by id, so a renamed code never orphans one. */}
          <TextField label={t.codeLabel} value={instrument?.code ?? ''} onCommit={(v) => commitField('code', v)} />
          <div className="field span-2">
            <RegistryPickerField
              label={t.manufacturerLabel}
              options={manufacturers.map((row) => ({ id: row.id, label: row.name }))}
              recentIds={instrumentManufacturerRecents(instrument?.manufacturer ?? null, instruments, manufacturers)}
              value={wordRowByName(instrument?.manufacturer ?? null, manufacturers)?.id ?? null}
              initialText={instrument?.manufacturer ?? ''}
              onChange={(id) => {
                const chosen = manufacturers.find((row) => row.id === id);
                void commitField('manufacturer', chosen === undefined ? null : chosen.name);
              }}
              onCreate={(text) => void createManufacturer(text)}
            />
          </div>
          <TextField
            className="span-2"
            label={t.nameLabel}
            value={instrument?.name ?? ''}
            onCommit={(v) => commitField('name', v)}
          />
          <TextField label={t.modelLabel} value={instrument?.model ?? ''} onCommit={(v) => commitField('model', v)} />
          <TextField label={t.serialLabel} value={instrument?.serial ?? ''} onCommit={(v) => commitField('serial', v)} />
          <TextField
            label={t.certNumberLabel}
            value={instrument?.cert_number ?? ''}
            onCommit={(v) => commitField('cert_number', v)}
          />
          <div className="field">
            <span className="field-label">{t.rbcAccreditedLabel}</span>
            <Toggle
              isSelected={instrument?.rbc_accredited ?? false}
              onChange={(value) => void commitField('rbc_accredited', value)}
              aria-label={t.rbcAccreditedLabel}
            />
          </div>
          <TextField
            label={t.calibratedAtLabel}
            type="date"
            value={instrument?.calibrated_at ?? ''}
            onCommit={(v) => commitField('calibrated_at', v === '' ? null : v)}
          />
          <NumberField
            label={t.calibrationIntervalLabel}
            helper={t.calibrationIntervalHelper}
            value={instrument?.calibration_interval_months ?? null}
            onCommit={(v) => commitField('calibration_interval_months', v)}
          />
          <div className="field">
            <span className="field-label">{t.validityLabel}</span>
            <div className="input tabular" aria-readonly="true">
              {formatCalendarDate(validUntil)}
            </div>
            <span className="helper">{t.validityHelper}</span>
          </div>
          <TextField
            className="span-2"
            label={t.laboratoryLabel}
            value={instrument?.laboratory ?? ''}
            onCommit={(v) => commitField('laboratory', v)}
          />
          <UploadTile
            className="span-2"
            kind="certificate"
            label={t.certificateLabel}
            helper={t.certificateHelper}
            file={certificate}
            onPick={(picked) => attachCertificate(picked)}
            onOpen={() => void openCertificate()}
          />
          <TestDefaultField
            label={t.testDefaultLabel(t.testIsolacao)}
            helper={t.testDefaultHelper}
            value={instrument?.test_isolacao ?? null}
            onCommit={(v) => commitField('test_isolacao' satisfies TestDefaultField, v)}
          />
          <TestDefaultField
            label={t.testDefaultLabel(t.testResistenciaContato)}
            helper={t.testDefaultHelper}
            value={instrument?.test_resistencia_contato ?? null}
            onCommit={(v) => commitField('test_resistencia_contato' satisfies TestDefaultField, v)}
          />
          <TestDefaultField
            label={t.testDefaultLabel(t.testRelacaoTransformacao)}
            helper={t.testDefaultHelper}
            value={instrument?.test_relacao_transformacao ?? null}
            onCommit={(v) => commitField('test_relacao_transformacao' satisfies TestDefaultField, v)}
          />
        </div>
      </div>

      <div className="sticky-action-bar">
        {instrument === null ? null : referenced ? (
          <span className="btn-reason">{t.archiveOnlyReason(instrument.code)}</span>
        ) : null}
        <div className="bar-buttons">
          {instrument === null ? null : referenced ? (
            <TextButton tone="red" onPress={() => void archiveOrRemove()}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-archive" />
              </svg>
              {t.archive}
            </TextButton>
          ) : (
            <TextButton tone="red" onPress={() => setConfirmingRemove(true)}>
              {t.remove}
            </TextButton>
          )}
          <Button variant="secondary" onPress={onClose}>
            {t.panelClose}
          </Button>
        </div>
      </div>

      {instrument === null ? null : (
        <ConfirmDialog
          isOpen={confirmingRemove}
          onOpenChange={setConfirmingRemove}
          title={t.removeConfirmTitle(instrument.code)}
          description={t.removeConfirmBody}
          confirmLabel={t.remove}
          cancelLabel={t.cancel}
          isDestructive
          onConfirm={() => void archiveOrRemove()}
        />
      )}
    </aside>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void | Promise<void>;
  type?: 'text' | 'date';
  className?: string;
}

function TextField({ label, value, onCommit, type = 'text', className }: TextFieldProps) {
  // No external sync needed beyond the initial value: the panel remounts (`key={openId}`)
  // whenever the open instrument changes, and the one field a person is editing already
  // holds its own optimistic text — the live row catches up to the same value, never past it.
  const [text, setText] = useState(value);
  const committer = useFieldCommit<string>({ commit: onCommit });
  return (
    <label className={['field', className].filter(Boolean).join(' ')}>
      <span className="field-label">{label}</span>
      <input
        className="input"
        type={type}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          committer.change(event.target.value);
        }}
        onBlur={() => committer.blur()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') committer.enter();
        }}
      />
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  helper?: string;
  value: number | null;
  onCommit: (value: number | null) => void | Promise<void>;
}

function NumberField({ label, helper, value, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const committer = useFieldCommit<number | null>({ commit: onCommit });
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input tabular"
        type="number"
        min={1}
        step={1}
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          if (raw.trim() === '') {
            committer.change(null);
            return;
          }
          const parsed = Number(raw);
          if (Number.isInteger(parsed) && parsed > 0) committer.change(parsed);
        }}
        onBlur={() => {
          committer.blur();
          // A value that never became a valid positive integer (a decimal, zero, a
          // negative, stray text) was never queued for commit above; leaving it on
          // screen would show text that looks saved but is not (review finding: silent
          // drop). Revert the display to the last value this field actually committed.
          const parsed = Number(text);
          const isValid = text.trim() === '' || (Number.isInteger(parsed) && parsed > 0);
          if (!isValid) setText(value === null ? '' : String(value));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') committer.enter();
        }}
      />
      {
        // Helper text lives inside the same <label>, which folds it into the field's
        // accessible name (a <label> concatenates all its text) — worded so it never
        // repeats another field's label as a substring and creates a false getByLabel match.
        helper === undefined ? null : <span className="helper">{helper}</span>
      }
    </label>
  );
}

interface TestDefaultFieldProps {
  label: string;
  helper: string;
  value: { raw: string | null; unit: string | null } | null;
  onCommit: (value: { raw: string | null; unit: string | null } | null) => void | Promise<void>;
}

function TestDefaultField({ label, helper, value, onCommit }: TestDefaultFieldProps) {
  const [raw, setRaw] = useState(value?.raw ?? '');
  const [unit, setUnit] = useState(value?.unit ?? '');
  const committer = useFieldCommit<{ raw: string | null; unit: string | null } | null>({ commit: onCommit });

  function commitNext(nextRaw: string, nextUnit: string): void {
    const next = nextRaw === '' && nextUnit === '' ? null : { raw: nextRaw === '' ? null : nextRaw, unit: nextUnit === '' ? null : nextUnit };
    committer.change(next);
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="measurement-field">
        <input
          className="mf-value"
          aria-label={`${label} — ${copy.registries.instrumentos.valueLabel}`}
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            commitNext(event.target.value, unit);
          }}
          onBlur={() => committer.blur()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') committer.enter();
          }}
        />
        <input
          className="mf-unit"
          aria-label={`${label} — ${copy.registries.instrumentos.unitLabel}`}
          value={unit}
          onChange={(event) => {
            setUnit(event.target.value);
            commitNext(raw, event.target.value);
          }}
          onBlur={() => committer.blur()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') committer.enter();
          }}
        />
      </div>
      <span className="helper">{helper}</span>
    </div>
  );
}
