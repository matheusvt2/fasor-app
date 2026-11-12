import {
  companyTypeListRows,
  companyTypesHeading,
  duplicateCompanyType,
  duplicateSeededType,
  latestVersionRow,
  libraryTypeListRows,
  libraryTypesHeading,
  newEquipmentTypeRow,
  parseTestBaseText,
  planTestBaseImport,
  planTestBaseUpdate,
  PRODUTO,
  retireTypeBody,
  retireTypeTitle,
  SEED_VERSION,
  testBaseImportedText,
  testBaseImportPreviewText,
  testBaseInvalidText,
  testBaseUpdateDraft,
  testBaseUpdatedText,
  testBaseUpdatePreview,
  toIso,
  typeDuplicatedText,
  typeVersionRow,
  type EquipmentBlockType,
  type EquipmentTypeRow,
  type OpDraft,
  type TestBaseFile,
  type TestBaseImportPlan,
  type TestBaseUpdatePlan,
  type TypeDuplicate,
} from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from 'react-aria-components';
import { ConfirmDialog, SegmentedControl, TextButton } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { useDefinitionContext } from '../../state/definition-context.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import type { UndoableEdits } from '../../state/use-undoable-edits.ts';
import { newId } from '../../ids.ts';
import { createTypeOp, createVersionOp, putTypeDraftOp, putTypeStampOp } from './type-ops.ts';

export interface TypeListSectionProps {
  /** Commits one batch through the list's edit queue; null when nothing was written. */
  commit: (drafts: OpDraft[]) => Promise<string | null>;
  edits: UndoableEdits;
}

const icon = (name: string) => (
  <svg className="ico" aria-hidden="true">
    <use href={`/sprite.svg#${name}`} />
  </svg>
);

/**
 * Story 14.7 (`41-templates.html` § Tipos de equipamento): the company's equipment types, then
 * the library's (the seeded types of the current seed version, read-only, "Duplicar" only). This is
 * the only way into the type editor (UX-DR70: no field surface links to it). Every action is one
 * company-scope op on this device; the kernel builds the rows (`duplicateSeededType`,
 * `duplicateCompanyType`, `newEquipmentTypeRow`) and every word with a count or a name.
 */
export function TypeListSection({ commit, edits }: TypeListSectionProps) {
  const session = useSession();
  const user = session.user;
  const navigate = useNavigate();
  const ctx = useDefinitionContext();
  const { showToast } = useToast();
  const headingId = useId();
  const companyId = useId();
  const libraryId = useId();
  const [retiring, setRetiring] = useState<EquipmentTypeRow | null>(null);
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importPlan, setImportPlan] = useState<{ file: TestBaseFile; plan: TestBaseImportPlan } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importTitleId = useId();
  const importBodyId = useId();
  // Story 25.23: "Atualizar base de ensaios", its file, its plan and the office's choice per edited text.
  const updateInput = useRef<HTMLInputElement>(null);
  const [updatePlan, setUpdatePlan] = useState<{ file: TestBaseFile; plan: TestBaseUpdatePlan } | null>(null);
  const [takeBase, setTakeBase] = useState<ReadonlySet<string>>(new Set());
  const updateTitleId = useId();
  const updateBodyId = useId();

  const types = useMemo(() => [...ctx.types.values()], [ctx]);
  const company = useMemo(() => companyTypeListRows(types, ctx), [types, ctx]);
  // Story 24.19: a library type a published copy hides in the palettes says so on a second line.
  const library = useMemo(() => libraryTypeListRows(SEED_VERSION, ctx), [ctx]);
  const byId = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);

  /** "Duplicar": the new type's create, then its editor. Two quick taps make one copy. */
  async function duplicate(make: () => TypeDuplicate): Promise<void> {
    if (user === null || inFlight.current) return;
    inFlight.current = true;
    try {
      const row = newEquipmentTypeRow(newId(), make());
      if ((await commit([createTypeOp(user, row)])) === null) return;
      // Said by the shell's toast, not the list's queue: the editor it opens keeps it on screen.
      showToast(typeDuplicatedText(row.draft?.label ?? ''));
      void navigate(`/templates/tipos/${row.id}`);
    } finally {
      inFlight.current = false;
    }
  }

  /**
   * Story 23.12 (M-1 (b)): "Importar base de ensaios". The file is read on this device and the
   * kernel plans the copies (`planTestBaseImport`); nothing is written before "Importar".
   */
  async function readBase(file: File, mode: 'import' | 'update' = 'import'): Promise<void> {
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError(testBaseInvalidText());
      return;
    }
    const parsed = parseTestBaseText(text);
    if (!parsed.ok) {
      setImportError(testBaseInvalidText(parsed.reason));
      return;
    }
    if (mode === 'update') {
      // Story 25.23: the same file format; every edited text starts on "Manter o da empresa".
      setTakeBase(new Set());
      setUpdatePlan({ file: parsed.file, plan: planTestBaseUpdate(parsed.file, ctx) });
      return;
    }
    setImportPlan({ file: parsed.file, plan: planTestBaseImport(parsed.file, ctx) });
  }

  /**
   * Story 25.23: "Atualizar", re-planned over the current types as the import is. Each held type
   * gets one `draft` put (with the base's text where the office chose it), each type the company
   * does not hold its create as a draft; nothing is published and no version is written.
   */
  async function updateBase(base: TestBaseFile, chosen: ReadonlySet<string>): Promise<void> {
    const plan = planTestBaseUpdate(base, ctx);
    if (user === null || inFlight.current) return;
    inFlight.current = true;
    try {
      const drafts: OpDraft[] = [];
      let updated = 0;
      for (const update of plan.updates) {
        const draft = testBaseUpdateDraft(update, chosen);
        if (draft === null) continue;
        drafts.push(putTypeDraftOp(user, update.typeId, draft));
        updated++;
      }
      for (const copy of plan.creates) drafts.push(createTypeOp(user, newEquipmentTypeRow(newId(), copy.duplicate)));
      if (drafts.length > 0 && (await commit(drafts)) === null) return;
      showToast(testBaseUpdatedText(updated, plan.creates.length));
    } finally {
      inFlight.current = false;
    }
  }

  /**
   * "Importar": re-planned over the current types (a pull or another tab may have landed while the
   * preview was open), then every copy's create and its version 1 when publishable, in one batch.
   */
  async function importBase(base: TestBaseFile): Promise<void> {
    const plan = planTestBaseImport(base, ctx);
    if (user === null || inFlight.current || plan.copies.length === 0) return;
    inFlight.current = true;
    try {
      const at = toIso(now());
      const drafts: OpDraft[] = [];
      for (const copy of plan.copies) {
        const row = newEquipmentTypeRow(newId(), copy.duplicate);
        drafts.push(createTypeOp(user, row));
        if (copy.publishable) drafts.push(createVersionOp(user, typeVersionRow({ id: newId(), type: row, definition: copy.duplicate.draft, publishedBy: user.id, publishedAt: at })));
      }
      if ((await commit(drafts)) === null) return;
      showToast(testBaseImportedText(plan.copies.length));
    } finally {
      inFlight.current = false;
    }
  }

  async function stamp(type: EquipmentTypeRow, field: 'retired_at' | 'removed_at', on: boolean, toast: string, undoable: boolean): Promise<void> {
    if (user === null) return;
    const batchId = await commit([putTypeStampOp(user, type.id, field, on ? toIso(now()) : null)]);
    if (batchId === null) return;
    if (undoable) edits.undoable(toast, batchId, { label: copy.types.undo });
    else edits.notify(toast);
  }

  return (
    <section className="section tpl-group" aria-labelledby={headingId} id="tpl-tipos">
      <div className="section-head">
        <h2 id={headingId}>{copy.types.heading}</h2>
        {/* Story 25.23 (`41-templates.html` `.e25-base-actions`): "Atualizar base de ensaios" beside the import. */}
        <div className="e25-base-actions">
          <TextButton onPress={() => fileInput.current?.click()}>
            {icon('i-book')}
            {copy.types.importBase}
          </TextButton>
          <TextButton aria-haspopup="dialog" onPress={() => updateInput.current?.click()}>
            {icon('i-cycle')}
            {copy.types.updateBase}
          </TextButton>
        </div>
        <input
          ref={updateInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label={copy.types.updateFileLabel}
          data-testid="test-base-update-file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file !== undefined) void readBase(file, 'update');
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label={copy.types.importFileLabel}
          data-testid="test-base-file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            // Cleared so the same file can be chosen again (a second import of the same base).
            event.currentTarget.value = '';
            if (file !== undefined) void readBase(file);
          }}
        />
      </div>
      {importError === null ? null : (
        <p className="section-note" role="alert">
          {importError}
        </p>
      )}
      <p className="section-note">{copy.types.note(PRODUTO)}</p>

      <p className="type-sub" id={companyId}>
        {companyTypesHeading(company.length)}
      </p>
      {company.length === 0 ? (
        <p className="section-note">{copy.types.empty}</p>
      ) : (
        <ul className="registry-list" aria-labelledby={companyId} data-group="company-types">
          {company.map((row) => {
            const type = byId.get(row.id)!;
            const open = () => void navigate(`/templates/tipos/${row.id}`);
            const latest = latestVersionRow(ctx, type.id);
            return (
              <li key={row.id} className={row.status === 'aposentado' ? 'registry-row tpl-row type-row is-archived' : 'registry-row tpl-row type-row'} data-type-id={row.id}>
                {icon('i-layers')}
                <button type="button" className="rr-text" aria-label={row.status === 'aposentado' ? copy.types.viewRow(row.name) : copy.types.editRow(row.name)} onClick={open}>
                  <span className="rr-primary">
                    {row.name}{' '}
                    <span className="status-pill" data-status={row.status}>
                      {row.statusText}
                    </span>
                  </span>
                  <span className="rr-secondary">{row.secondary}</span>
                </button>
                <div className="rr-actions">
                  {row.status === 'aposentado' ? (
                    <TextButton onPress={() => void stamp(type, 'retired_at', false, copy.types.reactivated, false)}>{copy.types.reactivate}</TextButton>
                  ) : (
                    <TextButton onPress={open}>
                      {icon('i-pencil')}
                      {copy.types.edit}
                    </TextButton>
                  )}
                  {latest === null ? null : (
                    <TextButton onPress={() => void duplicate(() => duplicateCompanyType(latest))}>
                      {icon('i-copy')}
                      {copy.types.duplicate}
                    </TextButton>
                  )}
                  {row.status === 'publicado' ? (
                    <TextButton onPress={() => setRetiring(type)}>
                      {icon('i-archive')}
                      {copy.types.retire}
                    </TextButton>
                  ) : null}
                  {row.discardable ? (
                    <TextButton onPress={() => void stamp(type, 'removed_at', true, copy.types.discarded, true)}>
                      {icon('i-trash')}
                      {copy.types.discard}
                    </TextButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="type-sub" id={libraryId}>
        {libraryTypesHeading(library.length)}
      </p>
      <ul className="registry-list" aria-labelledby={libraryId} data-group="library-types">
        {library.map((row) => (
          <li key={row.type} className="registry-row tpl-row type-row" data-block-type={row.type}>
            {icon('i-book')}
            <div className="rr-text rr-lib">
              <span className="rr-primary">{row.name}</span>
              <span className="rr-secondary">{row.secondary}</span>
              {row.hiddenText === null ? null : (
                <span className="rr-secondary" data-hidden-type="">
                  {row.hiddenText}
                </span>
              )}
            </div>
            <div className="rr-actions">
              <TextButton onPress={() => void duplicate(() => duplicateSeededType(SEED_VERSION, row.type as EquipmentBlockType))}>
                {icon('i-copy')}
                {copy.types.duplicate}
              </TextButton>
            </div>
          </li>
        ))}
      </ul>
      <p className="section-note type-lib-note">{copy.types.libraryNote}</p>

      {importPlan === null ? null : (
        <DialogShell
          className="confirm-dialog"
          isOpen
          onOpenChange={(open) => {
            if (!open) setImportPlan(null);
          }}
          aria-labelledby={importTitleId}
          aria-describedby={importBodyId}
        >
          {({ close }) => (
            <>
              <h2 className="dialog-title" id={importTitleId}>
                {copy.types.importBase}
              </h2>
              <div id={importBodyId}>
                {testBaseImportPreviewText(importPlan.plan)
                  .split('\n')
                  .map((line) => (
                    <p key={line} className="t-body">
                      {line}
                    </p>
                  ))}
              </div>
              <div className="dialog-actions">
                <Button className="btn btn-secondary" autoFocus onPress={close}>
                  {copy.types.cancel}
                </Button>
                {importPlan.plan.copies.length === 0 ? null : (
                  <Button
                    className="btn btn-primary"
                    onPress={() => {
                      void importBase(importPlan.file);
                      close();
                    }}
                  >
                    {copy.types.importConfirm}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogShell>
      )}

      {updatePlan === null ? null : (
        <TestBaseUpdateDialog
          plan={updatePlan.plan}
          titleId={updateTitleId}
          bodyId={updateBodyId}
          takeBase={takeBase}
          onChoose={(id, base) =>
            setTakeBase((current) => {
              const next = new Set(current);
              if (base) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          onClose={() => setUpdatePlan(null)}
          onConfirm={() => void updateBase(updatePlan.file, takeBase)}
        />
      )}

      {retiring === null ? null : (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setRetiring(null);
          }}
          title={retireTypeTitle(company.find((row) => row.id === retiring.id)?.name ?? '')}
          description={retireTypeBody(retiring)}
          confirmLabel={copy.types.retire}
          cancelLabel={copy.types.cancel}
          onConfirm={() => void stamp(retiring, 'retired_at', true, copy.types.retired, true)}
        />
      )}
    </section>
  );
}

/**
 * Story 25.23 (`41-templates.html` `#tpl-dlg-base-update`): the update's preview, a Confirm dialog
 * that scrolls inside. The kernel's lines (`testBaseUpdatePreview`), then each text the office
 * edited and the revision changed as one row with a Segmented choice ("Manter o da empresa" by
 * default), then the kernel's closing lines. "Atualizar" shows only when the plan could write.
 */
function TestBaseUpdateDialog({
  plan,
  titleId,
  bodyId,
  takeBase,
  onChoose,
  onClose,
  onConfirm,
}: {
  plan: TestBaseUpdatePlan;
  titleId: string;
  bodyId: string;
  takeBase: ReadonlySet<string>;
  onChoose: (id: string, base: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const preview = testBaseUpdatePreview(plan);
  const options = [
    { value: 'keep' as const, label: copy.types.keepCompanyText },
    { value: 'base' as const, label: copy.types.useBaseText },
  ];
  return (
    <DialogShell
      className="confirm-dialog"
      overlayClassName="tpl-dlg-base-update"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
    >
      {({ close }) => (
        <>
          <h2 className="dialog-title" id={titleId}>
            {copy.types.updateBase}
          </h2>
          <div id={bodyId}>
            {preview.lines.map((line) => (
              <p key={line} className="t-body">
                {line}
              </p>
            ))}
          </div>
          {preview.differingHeading === null ? null : (
            <>
              <p className="field-label">{preview.differingHeading}</p>
              <ul className="e25-diff-list" data-testid="test-base-differing">
                {preview.differing.map((diff) => (
                  <li key={diff.id} data-diff-id={diff.id}>
                    <span className="e25-diff-where">{diff.where}</span>
                    <SegmentedControl aria-label={diff.where} value={takeBase.has(diff.id) ? 'base' : 'keep'} options={options} onChange={(value) => onChoose(diff.id, value === 'base')} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {preview.after.map((line) => (
            <p key={line} className="t-body">
              {line}
            </p>
          ))}
          <div className="dialog-actions">
            <Button className="btn btn-secondary" autoFocus onPress={close}>
              {copy.types.cancel}
            </Button>
            {preview.writes ? (
              <Button
                className="btn btn-primary"
                onPress={() => {
                  onConfirm();
                  close();
                }}
              >
                {copy.types.updateConfirm}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </DialogShell>
  );
}
