import { defaultEmpresaRow, registryFieldPath, registryPath, toIso, type EmpresaRow, type OpDraft, type UploadFileKind } from '@app/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { UploadTile, type PickedFile } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { commitFilePick, useAttachedFile } from '../../db/file-commit.ts';
import { previewBlob } from '../../db/file-store.ts';
import { empresaRow } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { BrandPreview } from './brand-preview.tsx';
import { CnpjField } from './cnpj-field.tsx';
import { sameFieldValue } from './field-value.ts';

/*
 * Empresa (`key-registries.html` frame 0, `80-cadastros.html` Empresa panel): the
 * company's document identity, edited once and reused by every relatório. Every field
 * autosaves on its own `registry/empresa/{id}/{field}` op and there is no Save button
 * (AC 2.3-1); the brand preview beside it re-renders from the same live row (AC 2.3-2).
 *
 * The company brand is drawn here and nowhere else: the app bar keeps the `PRODUTO`
 * wordmark on every surface (NFR-15, AC 2.3-4).
 */

type EmpresaTextField = 'name' | 'cnpj' | 'phone' | 'email' | 'address' | 'form_title' | 'form_code' | 'form_revision';

export function EmpresaTab() {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const t = copy.registries.empresa;
  const empresa = useLiveQuery(() => (db === null ? Promise.resolve(null) : empresaRow(db)), [db], null) ?? null;

  // The id of the row this tab edits: the stored one, or the one the first committed
  // field will create (AD-3, the same rule the Instrumentos panel follows).
  const [mintedId] = useState(() => newId());
  const empresaId = empresa?.id ?? mintedId;
  const created = useRef(false);
  if (empresa !== null) created.current = true;
  // What the form and the preview show: the stored row, or the row the first commit will
  // create, so the kernel's form defaults read in the fields from the first visit
  // (AC 2.3-1, Epic 2 retro D-5) instead of only in the preview.
  const shown: EmpresaRow = empresa ?? defaultEmpresaRow(empresaId);

  const opBase = (): Omit<OpDraft, 'kind' | 'path' | 'value'> | null =>
    user === null
      ? null
      : {
          scope: 'company',
          company_id: user.companyId,
          project_id: null,
          relatorio_id: null,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: user.id,
        };

  /** One op per field, committed as it is typed. The first one creates the row. */
  async function commitField(field: EmpresaTextField, value: string): Promise<void> {
    const base = opBase();
    if (db === null || base === null) return;
    const next = value.trim() === '' ? null : value;
    // Nothing to say when the value is the one shown already, a kernel default included
    // (Epic 2 retro D-5, D-8): leaving an untouched field never writes.
    if (sameFieldValue(shown[field], field === 'name' ? value : next)) return;
    if (!created.current) {
      created.current = true;
      const row: EmpresaRow = { ...defaultEmpresaRow(empresaId), [field]: field === 'name' ? value : next };
      await commitBatch(db, [{ ...base, kind: 'create', path: registryPath('empresa', empresaId), value: row as never }], {
        newId,
        now,
      });
      return;
    }
    await commitBatch(
      db,
      [
        {
          ...base,
          kind: 'put',
          path: registryFieldPath('empresa', empresaId, field),
          // `name` is a plain string in the schema, never null.
          value: (field === 'name' ? value : next) as never,
        },
      ],
      { newId, now },
    );
  }

  /** A picked logo or cover background: one file batch with the row it belongs to. */
  async function attach(kind: UploadFileKind, field: 'logo_file_id' | 'cover_background_file_id', picked: PickedFile): Promise<void> {
    const base = opBase();
    if (db === null || base === null || user === null) return;
    const fileId = newId();
    const ownerOps: OpDraft[] = created.current
      ? [{ ...base, kind: 'put', path: registryFieldPath('empresa', empresaId, field), value: fileId as never }]
      : [
          {
            ...base,
            kind: 'create',
            path: registryPath('empresa', empresaId),
            value: { ...defaultEmpresaRow(empresaId), [field]: fileId } as never,
          },
        ];
    created.current = true;
    await commitFilePick(
      db,
      { companyId: user.companyId, actorId: user.id, fileId, kind, picked, ownerOps },
      { newId, now },
    );
  }

  const logo = useAttachedFile(db, empresa?.logo_file_id ?? null);
  const cover = useAttachedFile(db, empresa?.cover_background_file_id ?? null);
  const logoSrc = useAssetUrl(db, empresa?.logo_file_id ?? null);
  const coverSrc = useAssetUrl(db, empresa?.cover_background_file_id ?? null);

  const imagesLabelId = useId();

  return (
    <div className="registry-main">
      <p className="section-note">{t.note}</p>

      <div className="empresa-layout">
        <div className="empresa-form">
          <section aria-labelledby={`${imagesLabelId}-id`}>
            <h2 className="group-title" id={`${imagesLabelId}-id`}>
              {t.groupIdentity}
            </h2>
            <div className="field-grid">
              <EmpresaField
                className="span-2"
                label={t.nameLabel}
                helper={t.nameHelper}
                value={shown.name ?? ''}
                onCommit={(v) => commitField('name', v)}
              />
              <CnpjField value={shown.cnpj ?? ''} label={t.cnpjLabel} invalidText={copy.registries.cnpjInvalid} onCommit={(v) => commitField('cnpj', v ?? '')} />
              <EmpresaField label={t.phoneLabel} tabular value={shown.phone ?? ''} onCommit={(v) => commitField('phone', v)} />
              <EmpresaField
                className="span-2"
                label={t.emailLabel}
                type="email"
                value={shown.email ?? ''}
                onCommit={(v) => commitField('email', v)}
              />
              <EmpresaField
                className="span-2"
                label={t.addressLabel}
                helper={t.addressHelper}
                value={shown.address ?? ''}
                onCommit={(v) => commitField('address', v)}
              />
            </div>
          </section>

          <section aria-labelledby={imagesLabelId}>
            <h2 className="group-title" id={imagesLabelId}>
              {t.groupBrand}
            </h2>
            <div className="brand-tiles">
              <UploadTile
                kind="logo"
                layout="tile"
                label={t.logoLabel}
                helper={t.logoHelper}
                placeholder={t.logoPlaceholder}
                file={logo}
                previewSrc={logoSrc}
                onPick={(picked) => attach('logo', 'logo_file_id', picked)}
              />
              <UploadTile
                kind="cover_background"
                layout="tile"
                label={t.coverLabel}
                helper={t.coverHelper}
                placeholder={t.coverPlaceholder}
                file={cover}
                previewSrc={coverSrc}
                onPick={(picked) => attach('cover_background', 'cover_background_file_id', picked)}
              />
            </div>
            <span className="helper">{t.imagesHelper}</span>
          </section>

          <section aria-labelledby={`${imagesLabelId}-form`}>
            <h2 className="group-title" id={`${imagesLabelId}-form`}>
              {t.groupForm}
            </h2>
            <div className="field-grid">
              <EmpresaField
                className="span-2"
                label={t.formTitleLabel}
                helper={t.formTitleHelper}
                value={shown.form_title ?? ''}
                onCommit={(v) => commitField('form_title', v)}
              />
              <EmpresaField
                label={t.formCodeLabel}
                tabular
                value={shown.form_code ?? ''}
                onCommit={(v) => commitField('form_code', v)}
              />
              <EmpresaField
                label={t.formRevisionLabel}
                helper={t.formRevisionHelper}
                tabular
                value={shown.form_revision ?? ''}
                onCommit={(v) => commitField('form_revision', v)}
              />
            </div>
          </section>

          <p className="helper">{t.autosaveNote}</p>
        </div>

        <aside className="registry-panel brand-panel" aria-label={t.previewTitle}>
          <div className="panel-body">
            <div>
              <h2 className="panel-title">{t.previewTitle}</h2>
              <p className="panel-meta">{t.previewMeta}</p>
            </div>
            <BrandPreview empresa={shown} logoSrc={logoSrc} coverSrc={coverSrc} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * The object URL of a brand asset. The bytes come from this device when it picked them
 * (the original, which is all it has before the upload lands) and from
 * `GET /api/files/{id}/thumb` otherwise — asked for here, by a surface, and never by a
 * sync cycle (AC 2.2-3).
 */
function useAssetUrl(db: AppDatabase | null, fileId: string | null): string | null {
  const { fetchFile } = useSync();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (db === null || fileId === null) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    void previewBlob(db, fileId, { fetchFile, nowIso: toIso(now()) }).then((blob) => {
      if (cancelled || blob === null) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created !== null) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [db, fileId, fetchFile]);
  return url;
}

interface EmpresaFieldProps {
  label: string;
  helper?: string;
  value: string;
  onCommit: (value: string) => void | Promise<void>;
  type?: 'text' | 'email';
  tabular?: boolean;
  className?: string;
}

/**
 * One autosaving field of the tab. Same shape as the Instrumentos panel's: the local
 * text is optimistic while typing and the committed row catches up to it.
 */
function EmpresaField({ label, helper, value, onCommit, type = 'text', tabular, className }: EmpresaFieldProps) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const committer = useFieldCommit<string>({ commit: onCommit });
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  // A value another device wrote (or this tab's own first pull) replaces the box only
  // when it is not the one already on screen: typing is never overwritten mid-word.
  if (value !== committed.current) {
    committed.current = value;
    if (value !== text) setText(value);
  }
  // `<div>` with an explicit `for`, not a wrapping `<label>`: a wrapping label folds its
  // helper text into the field's accessible name, which is what forced Story 2.1's copy
  // to avoid repeating another label as a substring. The helper is a description here.
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={tabular ? 'input tabular' : 'input'}
        type={type}
        value={text}
        aria-describedby={helper === undefined ? undefined : helperId}
        onChange={(event) => {
          setText(event.target.value);
          committer.change(event.target.value);
        }}
        onBlur={() => committer.blur()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') committer.enter();
        }}
      />
      {helper === undefined ? null : (
        <span className="helper" id={helperId}>
          {helper}
        </span>
      )}
    </div>
  );
}
