import {
  companyTypeListRows,
  companyTypesHeading,
  duplicateCompanyType,
  duplicateSeededType,
  latestVersionRow,
  libraryTypeListRows,
  libraryTypesHeading,
  newEquipmentTypeRow,
  PRODUTO,
  retireTypeBody,
  retireTypeTitle,
  SEED_VERSION,
  toIso,
  typeDuplicatedText,
  type EquipmentBlockType,
  type EquipmentTypeRow,
  type OpDraft,
  type TypeDuplicate,
} from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog, TextButton } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { useDefinitionContext } from '../../state/definition-context.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import type { UndoableEdits } from '../../state/use-undoable-edits.ts';
import { newId } from '../../ids.ts';
import { createTypeOp, putTypeStampOp } from './type-ops.ts';

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

  const types = useMemo(() => [...ctx.types.values()], [ctx]);
  const company = useMemo(() => companyTypeListRows(types, ctx), [types, ctx]);
  const library = useMemo(() => libraryTypeListRows(SEED_VERSION), []);
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
      </div>
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
