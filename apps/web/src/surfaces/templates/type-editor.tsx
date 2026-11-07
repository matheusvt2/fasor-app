import {
  definitionContext,
  latestVersionRow,
  nextTypeVersion,
  publishBlockedText,
  publishedText,
  publishVersionLabel,
  retireTypeBody,
  retireTypeTitle,
  toIso,
  typeEditorMetaText,
  typeEditorTabs,
  typeNameOf,
  typeStatusOf,
  typeStatusText,
  typeVersionRow,
  validateTypeDraft,
  type CompanyTypeDefinition,
  type CompanyTypeDraft,
  type EquipmentTypeRow,
  type OpDraft,
  type TypeEditorPart,
} from '@app/domain';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, ConfirmDialog, LoadingNote, Tabs, TextButton } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { useLiveQuery } from '../../db/live.ts';
import { equipmentTypeRows } from '../../db/type-store.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { CriteriaPanel, IdentityPanel, NameplatePanel, ChecklistPanel, PreviewPanel, TestsPanel, type DraftEdit } from './type-editor-parts.tsx';
import { createVersionOp, putTypeDraftOp, putTypeStampOp } from './type-ops.ts';
import './type-editor.css';

/**
 * Story 14.7 (`43-tipo-equipamento.html`; EXPERIENCE.md § IA › Tipo de equipamento): the editor of
 * one company equipment type, reached only from Templates. The head names the type with its
 * Status pill and says which draft is open; six Tabs edit the draft (Identificação, Placa,
 * Verificações, Ensaios, Critérios) and preview the sheet; the Sticky action bar holds
 * "Aposentar", "Voltar aos tipos" and "Publicar versão N", disabled with the kernel's first issue
 * as its reason while `validateTypeDraft` names any.
 *
 * Every change is one whole-draft `equipment_type/{id}/draft` put (the outbox coalesces them); the
 * edits are the kernel's (`types/draft-edit.ts`). A published type with no draft open edits a copy
 * of its latest version, which becomes the next version's draft on the first change. "Publicar" is
 * the one `equipment_type_version/{id}` create, numbered `nextTypeVersion` (a later push of the
 * same number is refused by the server and its device publishes again as the next).
 */
export function TypeEditorSurface() {
  const { id = '' } = useParams();
  const session = useSession();
  const db = session.database;
  const lists = useLiveQuery(() => (db === null ? undefined : equipmentTypeRows(db)), [db]);
  const ctx = useMemo(() => (lists === undefined ? null : definitionContext(lists.versions, lists.types)), [lists]);
  if (ctx === null) {
    return (
      <main className="screen" data-route="/templates/tipos/:id">
        <div className="tipo-content">
          <LoadingNote what={copy.typeEditor.title} />
        </div>
      </main>
    );
  }
  const type = ctx.types.get(id);
  if (type === undefined || type.removed_at !== null) {
    return (
      <main className="screen" data-route="/templates/tipos/:id">
        <div className="tipo-content">
          <p className="section-note">{copy.typeEditor.missing}</p>
        </div>
      </main>
    );
  }
  return <TypeEditor key={type.id} type={type} ctx={ctx} />;
}

function TypeEditor({ type, ctx }: { type: EquipmentTypeRow; ctx: NonNullable<ReturnType<typeof definitionContext>> }) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const navigate = useNavigate();
  const edits = useUndoableEdits();
  const reasonId = useId();
  const [tab, setTab] = useState<TypeEditorPart | 'preview'>('identificacao');
  const [retiring, setRetiring] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const latest = latestVersionRow(ctx, type.id);
  // The draft as the device holds it, else the latest published definition (edited as the next draft).
  const stored: CompanyTypeDraft | null = type.draft ?? (latest === null ? null : (latest.definition as CompanyTypeDraft));

  // Edits made here and not yet read back from the device: the next edit builds on them, never on
  // a live row the commit has not reached yet. Once every write landed, the live row wins again
  // (it holds the last write, or another device's later one).
  const pending = useRef<CompanyTypeDraft | null>(null);
  const inFlight = useRef(0);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (inFlight.current === 0) pending.current = null;
  }, [type.draft]);
  const draft = pending.current ?? stored;
  const issues = useMemo(() => validateTypeDraft(draft), [draft]);
  const tabs = useMemo(() => typeEditorTabs(draft, issues), [draft, issues]);

  async function commit(drafts: OpDraft[]): Promise<string | null> {
    if (db === null) return null;
    return edits.write(async () => (await commitBatch(db, drafts, { newId, now })).batch_id).catch(() => null);
  }

  /** One change to the draft: the kernel's edit over the freshest draft, written whole. */
  const edit: DraftEdit = (change) => {
    if (user === null) return;
    const next = change(pending.current ?? stored);
    pending.current = next;
    rerender((n) => n + 1);
    inFlight.current += 1;
    void commit([putTypeDraftOp(user, type.id, next)]).finally(() => {
      inFlight.current -= 1;
    });
  };

  const name = typeNameOf(type, ctx);
  const status = typeStatusOf(type);
  const hasDraft = type.draft !== null || pending.current !== null;
  const blocked = !hasDraft ? copy.typeEditor.nothingToPublish : publishBlockedText(issues);

  async function publish(): Promise<void> {
    if (user === null || draft === null || blocked !== null || publishing) return;
    setPublishing(true);
    try {
      const version = typeVersionRow({ id: newId(), type, definition: draft as CompanyTypeDefinition, publishedBy: user.id, publishedAt: toIso(now()) });
      const batch = await commit([createVersionOp(user, version)]);
      if (batch === null) return;
      pending.current = null;
      edits.notify(publishedText(version.version));
    } finally {
      setPublishing(false);
    }
  }

  async function setRetired(on: boolean): Promise<void> {
    if (user === null) return;
    const batch = await commit([putTypeStampOp(user, type.id, 'retired_at', on ? toIso(now()) : null)]);
    if (batch === null) return;
    if (on) edits.undoable(copy.types.retired, batch, { label: copy.types.undo });
    else edits.notify(copy.types.reactivated);
  }

  const parts: Record<TypeEditorPart, React.ReactNode> = {
    identificacao: <IdentityPanel draft={draft} issues={issues} edit={edit} nextVersion={nextTypeVersion(type)} />,
    placa: <NameplatePanel draft={draft} issues={issues} edit={edit} />,
    verificacoes: <ChecklistPanel draft={draft} issues={issues} edit={edit} />,
    ensaios: <TestsPanel draft={draft} issues={issues} edit={edit} />,
    criterios: <CriteriaPanel draft={draft} issues={issues} edit={edit} />,
  };

  return (
    <main className="screen" data-route="/templates/tipos/:id" data-type-id={type.id}>
      <div className="tipo-head">
        <div className="tipo-title">
          <h2>{name}</h2>
          <span className="status-pill" data-status={status}>
            {typeStatusText(type)}
          </span>
        </div>
        <p className="tipo-meta">{typeEditorMetaText(pending.current === null ? type : { ...type, draft: pending.current }, ctx)}</p>
      </div>

      <div className="tipo-content">
        <Tabs
          aria-label={copy.typeEditor.tabsLabel}
          selectedId={tab}
          onSelectionChange={(next) => {
            // Fix batch e22h (B2): the field being typed in is left before its panel goes, so it
            // commits (its unmount flushes it too, `useCommittedText`).
            const active = document.activeElement;
            if (active instanceof HTMLElement && active.closest('.tipo-content [role="tabpanel"]') !== null) active.blur();
            setTab(next as TypeEditorPart | 'preview');
          }}
          items={[
            ...tabs.map((entry) => ({ id: entry.part, label: entry.label, panel: parts[entry.part] })),
            { id: 'preview', label: copy.typeEditor.preview, panel: <PreviewPanel draft={draft} /> },
          ]}
        />
      </div>

      <div className="sticky-action-bar">
        {blocked === null ? null : (
          <span className="btn-reason" id={reasonId}>
            {blocked}
          </span>
        )}
        <div className="bar-buttons">
          {status === 'aposentado' ? (
            <TextButton onPress={() => void setRetired(false)}>{copy.typeEditor.reactivate}</TextButton>
          ) : status === 'publicado' ? (
            <TextButton onPress={() => setRetiring(true)}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-archive" />
              </svg>
              {copy.typeEditor.retire}
            </TextButton>
          ) : null}
          <Button variant="secondary" onPress={() => void navigate('/templates')}>
            {copy.typeEditor.back}
          </Button>
          <Button variant="primary" isDisabled={blocked !== null || publishing} disabledReasonId={reasonId} onPress={() => void publish()}>
            {publishVersionLabel(type)}
          </Button>
        </div>
      </div>

      {retiring ? (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setRetiring(false);
          }}
          title={retireTypeTitle(name)}
          description={retireTypeBody(type)}
          confirmLabel={copy.types.retire}
          cancelLabel={copy.types.cancel}
          onConfirm={() => void setRetired(true)}
        />
      ) : null}
    </main>
  );
}
