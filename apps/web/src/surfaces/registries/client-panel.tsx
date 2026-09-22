import { formatCnpj, isValidCnpjFormat, type ClientRow, type OpDraft } from '@app/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, ConfirmDialog, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';

export interface ClientPanelProps {
  /** The id this panel edits: minted locally for "Novo cliente" before it exists. */
  clientId: string;
  /** The live row, or null while it has not been created yet (no field committed). */
  client: ClientRow | null;
  /** Story 2.4 AC1: whether a live Project still points at this client. */
  referenced: boolean;
  onClose: () => void;
}

type Site = ClientRow['sites'][number];

function defaultRow(id: string): ClientRow {
  return {
    id,
    kind: 'client',
    name: '',
    cnpj: null,
    contact_name: null,
    contact_phone: null,
    sites: [],
    removed_at: null,
  };
}

/**
 * The Clientes edit panel, mirroring `InstrumentPanel`'s persistent-side-panel, no-Save-button
 * shape (Story 2.1's pattern this batch reuses verbatim): every field autosaves on its own op,
 * the first field of a new client carries a `create` op, every field after that is a
 * `registry/client/{id}/{field}` put.
 */
export function ClientPanel({ clientId, client, referenced, onClose }: ClientPanelProps) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const created = useRef(client !== null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const t = copy.registries.clientes;
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
      const row = { ...defaultRow(clientId), [field]: value };
      const op: OpDraft = { ...base, kind: 'create', path: `registry/client/${clientId}`, value: row as never };
      await commitBatch(db, [op], { newId, now });
      return;
    }
    const op: OpDraft = { ...base, kind: 'put', path: `registry/client/${clientId}/${field}`, value: value as never };
    await commitBatch(db, [op], { newId, now });
  }

  async function archiveOrRemove(): Promise<void> {
    if (db === null || user === null || client === null) return;
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
          path: `registry/client/${clientId}/removed_at`,
          value: null,
        },
      ],
      { newId, now },
    );
    const name = client.name;
    showToast(referenced ? t.archived(name) : t.removed(name), {
      action: { label: t.undo, onPress: () => void undoBatch(db, batch_id, { newId, now }) },
    });
    onClose();
  }

  return (
    <aside className="registry-panel" aria-labelledby={titleId}>
      <div className="panel-head">
        <div className="grow">
          <h2 className="panel-title" id={titleId}>
            {client === null ? t.newClient : client.name}
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
          <TextField className="span-2" label={t.nameLabel} value={client?.name ?? ''} onCommit={(v) => commitField('name', v)} />
          <CnpjField value={client?.cnpj ?? ''} label={t.cnpjLabel} invalidText={t.cnpjInvalid} onCommit={(v) => commitField('cnpj', v)} />
          <TextField
            label={t.contactNameLabel}
            value={client?.contact_name ?? ''}
            onCommit={(v) => commitField('contact_name', v)}
          />
          <TextField
            label={t.contactPhoneLabel}
            value={client?.contact_phone ?? ''}
            onCommit={(v) => commitField('contact_phone', v)}
          />
          <SitesField
            sites={client?.sites ?? []}
            label={t.sitesLabel}
            addLabel={t.addSite}
            removeLabel={t.removeSite}
            onCommit={(v) => commitField('sites', v)}
          />
        </div>
      </div>

      <div className="sticky-action-bar">
        {client === null ? null : referenced ? <span className="btn-reason">{t.archiveOnlyReason(client.name)}</span> : null}
        <div className="bar-buttons">
          {client === null ? null : referenced ? (
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

      {client === null ? null : (
        <ConfirmDialog
          isOpen={confirmingRemove}
          onOpenChange={setConfirmingRemove}
          title={t.removeConfirmTitle(client.name)}
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
  className?: string;
}

function TextField({ label, value, onCommit, className }: TextFieldProps) {
  const [text, setText] = useState(value);
  const committer = useFieldCommit<string>({ commit: onCommit });
  return (
    <label className={['field', className].filter(Boolean).join(' ')}>
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

interface CnpjFieldProps {
  value: string;
  label: string;
  invalidText: string;
  onCommit: (value: string | null) => void | Promise<void>;
}

/**
 * Story 2.4 AC1's "optional CNPJ (14 digits when present)" (I/O matrix): a non-14-digit
 * input never commits; blank commits `null`. A valid value canonicalizes to the standard
 * punctuated form (`00.000.000/0001-00`) at commit time, so two differently-punctuated
 * entries of the same CNPJ never coexist. The inline error is validated and announced only
 * on blur, not on every keystroke — a screen reader would otherwise re-announce it while
 * the user is still mid-typing a valid CNPJ.
 */
function CnpjField({ value, label, invalidText, onCommit }: CnpjFieldProps) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const committer = useFieldCommit<string | null>({ commit: onCommit });
  const helperId = useId();
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        value={text}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? helperId : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          setInvalid(false);
          if (raw.trim() === '') {
            committer.change(null);
            return;
          }
          if (isValidCnpjFormat(raw)) committer.change(formatCnpj(raw));
        }}
        onBlur={() => {
          setInvalid(text.trim() !== '' && !isValidCnpjFormat(text));
          committer.blur();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') committer.enter();
        }}
      />
      {invalid ? (
        <span className="helper" id={helperId} role="alert">
          {invalidText}
        </span>
      ) : null}
    </label>
  );
}

interface SitesFieldProps {
  sites: readonly Site[];
  label: string;
  addLabel: string;
  removeLabel: (index: number) => string;
  onCommit: (value: Site[]) => void | Promise<void>;
}

/** Story 2.4: the client's one-or-more sites (add/remove address rows, Code Map). */
function SitesField({ sites, label, addLabel, removeLabel, onCommit }: SitesFieldProps) {
  const [rows, setRows] = useState<Site[]>([...sites]);
  const committer = useFieldCommit<Site[]>({ commit: onCommit });
  const containerRef = useRef<HTMLDivElement>(null);
  // Independent review, PR #14 finding 3: removing a site row (especially the only one) left
  // the removed button's focus falling back to <body>. Set on removal, consumed by the effect
  // below once the DOM reflects the shorter `rows` array, moving focus to the remove button now
  // at the same index (clamped) or, once the list is empty, to the "Adicionar" button.
  const pendingFocusIndex = useRef<number | null>(null);

  useEffect(() => {
    if (pendingFocusIndex.current === null) return;
    const index = pendingFocusIndex.current;
    pendingFocusIndex.current = null;
    const container = containerRef.current;
    if (container === null) return;
    const removeButtons = container.querySelectorAll<HTMLButtonElement>('.site-row .icon-btn');
    if (removeButtons.length > 0) {
      removeButtons[Math.min(index, removeButtons.length - 1)]?.focus();
    } else {
      container.querySelector<HTMLButtonElement>('.btn-text')?.focus();
    }
  }, [rows]);

  function typed(next: Site[]): void {
    setRows(next);
    committer.change(next);
  }

  function discrete(next: Site[]): void {
    setRows(next);
    committer.immediate(next);
  }

  function removeSite(index: number, id: string): void {
    discrete(rows.filter((row) => row.id !== id));
    pendingFocusIndex.current = index;
  }

  return (
    <div className="field span-2" ref={containerRef}>
      <span className="field-label">{label}</span>
      <div className="site-list">
        {rows.map((site, index) => (
          <div className="site-row" key={site.id}>
            <label className="field">
              <span className="field-label visually-hidden">{`${label} ${index + 1}`}</span>
              <input
                className="input"
                value={site.address}
                onChange={(event) =>
                  typed(rows.map((row) => (row.id === site.id ? { ...row, address: event.target.value } : row)))
                }
                onBlur={() => committer.blur()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') committer.enter();
                }}
              />
            </label>
            <button
              type="button"
              className="icon-btn"
              aria-label={removeLabel(index + 1)}
              onClick={() => removeSite(index, site.id)}
            >
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-close" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <TextButton onPress={() => discrete([...rows, { id: newId(), address: '' }])}>{addLabel}</TextButton>
    </div>
  );
}
