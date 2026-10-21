import { registryFieldPath, type NcPhraseRegistryRow, type OpDraft } from '@app/domain';
import { useId, useState } from 'react';
import { Button, ConfirmDialog, TextButton } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';

/*
 * Story 14.12: the panel of one learned NC phrase in Cadastros › Frases de NC, the Fabricantes
 * panel's chrome (`word-registry-panel.tsx`: persistent panel, no Save button, Remover with its
 * Confirm and undo toast). Its one field renames the phrase (`registry/nc_phrase/{id}/name`); the
 * type and item are fixed. A rename or a remove changes what later sheets offer, never a stored
 * observation nor a document.
 */

export function FrasesNcPanel({ entry, onClose }: { entry: NcPhraseRegistryRow; onClose: () => void }) {
  const t = copy.registries.frasesNc.panel;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const titleId = useId();
  const row = entry.row;

  function opOf(kind: 'put' | 'remove', field: 'name' | 'removed_at', value: string | null): OpDraft | null {
    if (user === null) return null;
    return {
      kind,
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.id,
      path: registryFieldPath('nc_phrase', row.id, field),
      value: value as never,
    };
  }

  async function rename(value: string): Promise<void> {
    const name = value.trim();
    // A blank phrase offers nothing: it is not written. Nor is the name the row already holds.
    if (db === null || name === '' || name === row.name) return;
    const op = opOf('put', 'name', name);
    if (op !== null) await commitBatch(db, [op], { newId, now });
  }

  async function remove(): Promise<void> {
    const op = opOf('remove', 'removed_at', null);
    if (db === null || op === null) return;
    const { batch_id } = await commitBatch(db, [op], { newId, now });
    showToast(t.removed, { action: { label: t.undo, onPress: () => void undoBatch(db, batch_id, { newId, now }) } });
    onClose();
  }

  return (
    <aside className="registry-panel" aria-labelledby={titleId}>
      <div className="panel-head">
        <div className="grow">
          <h2 className="panel-title" id={titleId}>
            {entry.text.primary}
          </h2>
          <p className="panel-meta">{t.context(entry.group, entry.text.secondary)}</p>
        </div>
        <button type="button" className="icon-btn" aria-label={t.close} onClick={onClose}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-close" />
          </svg>
        </button>
      </div>
      <div className="panel-body">
        <div className="field-grid">
          <PhraseField label={t.nameLabel} value={row.name} onCommit={rename} />
        </div>
      </div>

      <div className="sticky-action-bar">
        <div className="bar-buttons">
          <TextButton tone="red" onPress={() => setConfirmingRemove(true)}>
            {t.remove}
          </TextButton>
          <Button variant="secondary" onPress={onClose}>
            {t.panelClose}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title={t.removeConfirmTitle}
        description={t.removeConfirmBody}
        confirmLabel={t.remove}
        cancelLabel={t.cancel}
        isDestructive
        onConfirm={() => void remove()}
      />
    </aside>
  );
}

function PhraseField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => Promise<void> }) {
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
