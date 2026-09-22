import type { OpDraft, RegistryKind, WordRow } from '@app/domain';
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

export interface WordRegistryCopy {
  newRow: string;
  close: string;
  panelClose: string;
  nameLabel: string;
  genderLabel: string;
  genderMasculine: string;
  genderFeminine: string;
  genderUnset: string;
  numberLabel: string;
  numberSingular: string;
  numberPlural: string;
  numberUnset: string;
  remove: string;
  removeConfirmTitle: (name: string) => string;
  removeConfirmBody: string;
  removed: (name: string) => string;
  undo: string;
  cancel: string;
}

export interface WordRegistryPanelProps {
  kind: Extract<RegistryKind, 'manufacturer' | 'voltage_class'>;
  /** The id this panel edits: minted locally for "Novo …" before it exists. */
  rowId: string;
  /** The live row, or null while it has not been created yet (no field committed). */
  row: WordRow | null;
  onClose: () => void;
  copy: WordRegistryCopy;
}

function defaultRow(kind: WordRegistryPanelProps['kind'], id: string): WordRow {
  return { id, kind, name: '', gender: null, number: null, removed_at: null } as WordRow;
}

/**
 * Fabricantes and Classes de tensão share this panel (Code Map): both kinds carry the
 * identical `{name, gender, number}` shape (AD-19), so one component parameterized by
 * `kind` and its own copy serves both tabs, mirroring `InstrumentPanel`'s persistent-panel,
 * no-Save-button, create-on-first-field pattern (Story 2.1).
 */
export function WordRegistryPanel({ kind, rowId, row, onClose, copy }: WordRegistryPanelProps) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const created = useRef(row !== null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const titleId = useId();

  async function commitField(field: string, value: unknown): Promise<void> {
    if (db === null || user === null) return;
    const base: Omit<OpDraft, 'kind' | 'path' | 'value'> = {
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
      const op: OpDraft = { ...base, kind: 'create', path: `registry/${kind}/${rowId}`, value: next as never };
      await commitBatch(db, [op], { newId, now });
      return;
    }
    const op: OpDraft = { ...base, kind: 'put', path: `registry/${kind}/${rowId}/${field}`, value: value as never };
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
    const name = row.name;
    showToast(copy.removed(name), { action: { label: copy.undo, onPress: () => void undoBatch(db, batch_id, { newId, now }) } });
    onClose();
  }

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
    <aside className="registry-panel" aria-labelledby={titleId}>
      <div className="panel-head">
        <div className="grow">
          <h2 className="panel-title" id={titleId}>
            {row === null ? copy.newRow : row.name}
          </h2>
        </div>
        <button type="button" className="icon-btn" aria-label={copy.close} onClick={onClose}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-close" />
          </svg>
        </button>
      </div>
      <div className="panel-body">
        <div className="field-grid">
          <NameField label={copy.nameLabel} value={row?.name ?? ''} onCommit={(v) => commitField('name', v)} />
          <div className="field">
            <span className="field-label">{copy.genderLabel}</span>
            <SegmentedControl<'' | Exclude<Gender, null>>
              value={row?.gender ?? ''}
              onChange={(v) => void commitField('gender', v === '' ? null : v)}
              options={genderOptions}
              aria-label={copy.genderLabel}
            />
          </div>
          <div className="field">
            <span className="field-label">{copy.numberLabel}</span>
            <SegmentedControl<'' | Exclude<Numeral, null>>
              value={row?.number ?? ''}
              onChange={(v) => void commitField('number', v === '' ? null : v)}
              options={numberOptions}
              aria-label={copy.numberLabel}
            />
          </div>
        </div>
      </div>

      <div className="sticky-action-bar">
        <div className="bar-buttons">
          {row === null ? null : (
            <TextButton tone="red" onPress={() => setConfirmingRemove(true)}>
              {copy.remove}
            </TextButton>
          )}
          <Button variant="secondary" onPress={onClose}>
            {copy.panelClose}
          </Button>
        </div>
      </div>

      {row === null ? null : (
        <ConfirmDialog
          isOpen={confirmingRemove}
          onOpenChange={setConfirmingRemove}
          title={copy.removeConfirmTitle(row.name)}
          description={copy.removeConfirmBody}
          confirmLabel={copy.remove}
          cancelLabel={copy.cancel}
          isDestructive
          onConfirm={() => void remove()}
        />
      )}
    </aside>
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
