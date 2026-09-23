import { parseVoltageClassKv, wordRegistryRowText, type OpDraft, type WordRow } from '@app/domain';
import { useId, useRef, useState } from 'react';
import { Button, ConfirmDialog, SegmentedControl, TextButton, type SegmentedOption } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';

type Gender = WordRow['gender'];
type Numeral = WordRow['number'];

/** The chrome both kinds share: title, close, remove with its Confirm dialog and undo toast. */
interface WordRegistryBaseCopy {
  newRow: string;
  close: string;
  panelClose: string;
  remove: string;
  removeConfirmTitle: (name: string) => string;
  removeConfirmBody: string;
  removed: (name: string) => string;
  undo: string;
  cancel: string;
}

/** Fabricantes: a name plus the gender and number that drive caption agreement (AD-19). */
export interface ManufacturerPanelCopy extends WordRegistryBaseCopy {
  nameLabel: string;
  genderLabel: string;
  genderMasculine: string;
  genderFeminine: string;
  genderUnset: string;
  numberLabel: string;
  numberSingular: string;
  numberPlural: string;
  numberUnset: string;
}

/** Classes de tensão: one value in kV (Story 2.5 AC1), no grammar fields (Epic 2 retro D-6). */
export interface VoltageClassPanelCopy extends WordRegistryBaseCopy {
  valueLabel: string;
  valueUnit: string;
  valueUnitName: string;
  valueInvalid: string;
}

export type WordRegistryKindCopy =
  | { kind: 'manufacturer'; copy: ManufacturerPanelCopy }
  | { kind: 'voltage_class'; copy: VoltageClassPanelCopy };

export type WordRegistryPanelProps = WordRegistryKindCopy & {
  /** The id this panel edits: minted locally for "Novo …" before it exists. */
  rowId: string;
  /** The live row, or null while it has not been created yet (no field committed). */
  row: WordRow | null;
  onClose: () => void;
};

function defaultRow(kind: WordRegistryKindCopy['kind'], id: string): WordRow {
  return { id, kind, name: '', gender: null, number: null, removed_at: null } as WordRow;
}

/**
 * Fabricantes and Classes de tensão share this panel (Code Map): both kinds carry the
 * `{name, gender, number}` row (AD-19) and follow `InstrumentPanel`'s persistent-panel,
 * no-Save-button, create-on-first-field pattern (Story 2.1). The fields differ: a
 * manufacturer is a name with its gender and number; a voltage class is a value in kV
 * kept in `name`, whose grammar fields stay unset (Story 2.5 AC1, Epic 2 retro D-6).
 */
export function WordRegistryPanel(props: WordRegistryPanelProps) {
  const { kind, rowId, row, onClose } = props;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const created = useRef(row !== null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const titleId = useId();
  const base = props.copy;
  const shownName = row === null ? '' : wordRegistryRowText(row).primary;

  async function commitField(field: 'name' | 'gender' | 'number', value: string | null): Promise<void> {
    if (db === null || user === null) return;
    // Nothing to say when the value is the one the row already holds (Epic 2 retro D-8).
    if (row !== null && row[field] === value) return;
    const opBase: Omit<OpDraft, 'kind' | 'path' | 'value'> = {
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.id,
    };
    if (!created.current) {
      created.current = true;
      const next = { ...defaultRow(kind, rowId), [field]: value };
      const op: OpDraft = { ...opBase, kind: 'create', path: `registry/${kind}/${rowId}`, value: next as never };
      await commitBatch(db, [op], { newId, now });
      return;
    }
    const op: OpDraft = { ...opBase, kind: 'put', path: `registry/${kind}/${rowId}/${field}`, value: value as never };
    await commitBatch(db, [op], { newId, now });
  }

  async function remove(): Promise<void> {
    if (db === null || user === null || row === null) return;
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
          path: `registry/${kind}/${rowId}/removed_at`,
          value: null,
        },
      ],
      { newId, now },
    );
    showToast(base.removed(shownName), {
      action: { label: base.undo, onPress: () => void undoBatch(db, batch_id, { newId, now }) },
    });
    onClose();
  }

  return (
    <aside className="registry-panel" aria-labelledby={titleId}>
      <div className="panel-head">
        <div className="grow">
          <h2 className="panel-title" id={titleId}>
            {row === null ? base.newRow : shownName}
          </h2>
        </div>
        <button type="button" className="icon-btn" aria-label={base.close} onClick={onClose}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-close" />
          </svg>
        </button>
      </div>
      <div className="panel-body">
        <div className="field-grid">
          {props.kind === 'manufacturer' ? (
            <ManufacturerFields copy={props.copy} row={row} onCommit={commitField} />
          ) : (
            <KvField
              label={props.copy.valueLabel}
              unit={props.copy.valueUnit}
              unitName={props.copy.valueUnitName}
              invalidText={props.copy.valueInvalid}
              value={row === null ? '' : (parseVoltageClassKv(row.name) ?? row.name)}
              onCommit={(v) => commitField('name', v)}
            />
          )}
        </div>
      </div>

      <div className="sticky-action-bar">
        <div className="bar-buttons">
          {row === null ? null : (
            <TextButton tone="red" onPress={() => setConfirmingRemove(true)}>
              {base.remove}
            </TextButton>
          )}
          <Button variant="secondary" onPress={onClose}>
            {base.panelClose}
          </Button>
        </div>
      </div>

      {row === null ? null : (
        <ConfirmDialog
          isOpen={confirmingRemove}
          onOpenChange={setConfirmingRemove}
          title={base.removeConfirmTitle(shownName)}
          description={base.removeConfirmBody}
          confirmLabel={base.remove}
          cancelLabel={base.cancel}
          isDestructive
          onConfirm={() => void remove()}
        />
      )}
    </aside>
  );
}

interface ManufacturerFieldsProps {
  copy: ManufacturerPanelCopy;
  row: WordRow | null;
  onCommit: (field: 'name' | 'gender' | 'number', value: string | null) => Promise<void>;
}

function ManufacturerFields({ copy, row, onCommit }: ManufacturerFieldsProps) {
  const genderOptions: ReadonlyArray<SegmentedOption<'' | Exclude<Gender, null>>> = [
    { value: '', label: copy.genderUnset },
    { value: 'm', label: copy.genderMasculine },
    { value: 'f', label: copy.genderFeminine },
  ];
  const numberOptions: ReadonlyArray<SegmentedOption<'' | Exclude<Numeral, null>>> = [
    { value: '', label: copy.numberUnset },
    { value: 'singular', label: copy.numberSingular },
    { value: 'plural', label: copy.numberPlural },
  ];
  return (
    <>
      <NameField label={copy.nameLabel} value={row?.name ?? ''} onCommit={(v) => onCommit('name', v)} />
      <div className="field">
        <span className="field-label">{copy.genderLabel}</span>
        <SegmentedControl<'' | Exclude<Gender, null>>
          value={row?.gender ?? ''}
          onChange={(v) => void onCommit('gender', v === '' ? null : v)}
          options={genderOptions}
          aria-label={copy.genderLabel}
        />
      </div>
      <div className="field">
        <span className="field-label">{copy.numberLabel}</span>
        <SegmentedControl<'' | Exclude<Numeral, null>>
          value={row?.number ?? ''}
          onChange={(v) => void onCommit('number', v === '' ? null : v)}
          options={numberOptions}
          aria-label={copy.numberLabel}
        />
      </div>
    </>
  );
}

interface NameFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void | Promise<void>;
}

function NameField({ label, value, onCommit }: NameFieldProps) {
  const [text, setText] = useState(value);
  const committer = useFieldCommit<string>({ commit: onCommit });
  return (
    <label className="field span-2">
      <span className="field-label">{label}</span>
      <input
        className="input"
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

interface KvFieldProps {
  label: string;
  unit: string;
  unitName: string;
  invalidText: string;
  value: string;
  onCommit: (value: string) => void | Promise<void>;
}

/**
 * The voltage class value, drawn as the mock's `.measurement-field` with its "kV" unit
 * (`80-cadastros.html` L337). Only a number is committed (`parseVoltageClassKv`); any
 * other text is refused inline on blur and never saved, the same rule as the Clientes
 * CNPJ field.
 */
function KvField({ label, unit, unitName, invalidText, value, onCommit }: KvFieldProps) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const committer = useFieldCommit<string>({ commit: onCommit });
  const inputId = useId();
  const errorId = `${inputId}-error`;
  return (
    <div className="field span-2">
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="measurement-field">
        <input
          id={inputId}
          className="mf-value"
          inputMode="decimal"
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => {
            const raw = event.target.value;
            setText(raw);
            setInvalid(false);
            const kv = parseVoltageClassKv(raw);
            if (kv !== null) committer.change(kv);
          }}
          onBlur={() => {
            setInvalid(text.trim() !== '' && parseVoltageClassKv(text) === null);
            committer.blur();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') committer.enter();
          }}
        />
        <span className="mf-unit" aria-label={unitName}>
          {unit}
        </span>
      </div>
      {invalid ? (
        <span className="helper" id={errorId} role="alert">
          {invalidText}
        </span>
      ) : null}
    </div>
  );
}
