import {
  checkFileCandidate,
  fileKindAccept,
  fileTileLine,
  NO_FILE_TEXT,
  type UploadFileKind,
} from '@app/domain';
import { useId, useRef, useState } from 'react';
import { ui } from '../copy/ui.ts';

/*
 * AD-7: the one tile every kind of upload is picked through -- the instrument
 * certificate (`key-registries.html` L154-172, `.input.file-input`) and the Empresa logo
 * and cover background (`80-cadastros.html` L135-145, `.brand-tile`). A candidate the
 * kernel refuses never reaches an op or a Blob: the reason is rendered inline and the
 * input is reset, exactly as `checkFileCandidate` words it.
 */

/** What the tile hands back once the bytes have been read and hashed. */
export interface PickedFile {
  file: File;
  /** Lowercase hex, the value `PUT /api/files/{id}` checks the body against. */
  sha256: string;
}

/** The attached file as the kernel knows it, or null when the tile is empty. */
export interface AttachedFile {
  name: string | null;
  mime: string;
  size: number;
  uploaded_at: string | null;
}

export interface UploadTileProps {
  kind: UploadFileKind;
  label: string;
  /** The always-on helper under the control (the kind's formats). */
  helper?: string;
  file: AttachedFile | null;
  onPick: (picked: PickedFile) => void | Promise<void>;
  /** `input` is the field-row look; `tile` is the Empresa brand tile with a thumbnail. */
  layout?: 'input' | 'tile';
  /** Object URL of the attached image, for the `tile` layout's thumbnail. */
  previewSrc?: string | null;
  /** Placeholder word inside an empty `tile` thumbnail ("Logo", "Fundo"). */
  placeholder?: string;
  className?: string;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function UploadTile({
  kind,
  label,
  helper,
  file,
  onPick,
  layout = 'input',
  previewSrc = null,
  placeholder,
  className,
}: UploadTileProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseId = useId();
  const refusalId = `${baseId}-refusal`;
  const helperId = `${baseId}-helper`;

  async function handleChange(picked: File | undefined): Promise<void> {
    if (inputRef.current !== null) inputRef.current.value = '';
    if (picked === undefined) return;
    const verdict = checkFileCandidate({ kind, mime: picked.type, size: picked.size });
    if (!verdict.ok) {
      setRefusal(verdict.text);
      return;
    }
    setRefusal(null);
    setBusy(true);
    try {
      await onPick({ file: picked, sha256: await sha256Hex(picked) });
    } catch (error) {
      // The commit is a Dexie write of the whole file: a refused quota is the one that
      // really happens. Saying so beside the tile is the only way the person learns the
      // file was not attached -- there is no other signal that the pick did nothing.
      console.error('attaching the file failed', error);
      setRefusal(ui.uploadTile.commitFailed);
    } finally {
      setBusy(false);
    }
  }

  /** The accepted formats and, when there is one, the reason the last pick was refused. */
  const describedBy =
    [helper === undefined ? null : helperId, refusal === null ? null : refusalId].filter(Boolean).join(' ') || undefined;

  const line = file === null ? NO_FILE_TEXT : fileTileLine(file);
  const action = file === null ? ui.uploadTile.choose : ui.uploadTile.replace;

  const hiddenInput = (
    <input
      ref={inputRef}
      className="visually-hidden"
      type="file"
      accept={fileKindAccept(kind)}
      // Out of the accessibility tree entirely: it is a mechanism, not a control. The
      // visible button is the tile's one control and its one tab stop -- the input is
      // opened only by that button's `click()`, so an element-by-element screen-reader
      // pass hears each tile once instead of twice. The formats and the refusal are
      // described on that button, which is what a screen-reader user lands on.
      aria-hidden="true"
      tabIndex={-1}
      data-testid={`upload-input-${kind}`}
      onChange={(event) => void handleChange(event.target.files?.[0])}
    />
  );

  const refusalLine =
    refusal === null ? null : (
      <span className="helper" id={refusalId} role="alert">
        {refusal}
      </span>
    );

  const helperLine =
    helper === undefined ? null : (
      <span className="helper" id={helperId}>
        {helper}
      </span>
    );

  if (layout === 'tile') {
    return (
      <div className={['brand-tile', kind === 'logo' ? 'is-logo' : '', className].filter(Boolean).join(' ')}>
        <span className="thumb" role="img" aria-label={file === null ? `${label}: ${NO_FILE_TEXT}` : `${label}: ${line}`}>
          {previewSrc === null ? (
            <span className="thumb-empty">{placeholder ?? label}</span>
          ) : (
            <img className="thumb-image" src={previewSrc} alt="" />
          )}
        </span>
        <span className="tile-name">{`${label} · ${line}`}</span>
        <button
          type="button"
          className="btn btn-text"
          aria-describedby={describedBy}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-image" />
          </svg>
          {`${action} ${label.toLocaleLowerCase('pt-BR')}`}
        </button>
        {helperLine}
        {refusalLine}
        {hiddenInput}
      </div>
    );
  }

  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <span className="field-label">{label}</span>
      <div className="input file-input">
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-image" />
        </svg>
        <span className={file === null ? 'file-name placeholder' : 'file-name'}>{line}</span>
        <button
          type="button"
          className="btn btn-text"
          // Two tiles can share a surface, so the word alone is not a name.
          aria-label={`${action} — ${label}`}
          aria-describedby={describedBy}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {action}
        </button>
      </div>
      {helperLine}
      {refusalLine}
      {hiddenInput}
    </div>
  );
}
