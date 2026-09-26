import { uploadPillText, type PhotoUploadState } from '@app/domain';
import { useEffect, useId, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { ui } from '../copy/ui.ts';

/*
 * Stories 6.1 and 6.2 (UX-DR50; `key-photos.html` `.photo-row`, `70-fotos.html`
 * `.upload-pill`): one photo as a tile row -- the thumb, the caption in `.photo-meta`, and
 * the upload pill under it. "Aguardando envio" is the amber pill; "Erro — Tentar novamente"
 * is the red-outline pill that is itself the retry button (at least 48 px, `components.css`
 * `.upload-pill[data-state="error"]`). A photo the server holds shows no pill. Stories
 * 6.3/6.5 add the number badge, the Photo stamp line above the caption, the tile as the
 * viewer's opener ("Foto n, abrir") and "Legendar"; a sheet tile without them stays a picture.
 */

/** An object URL for a Blob, revoked when the Blob changes or the caller unmounts. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (blob === null || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export interface UploadPillProps {
  state: PhotoUploadState;
  /** The error pill's press: clears the error and runs "Sincronizar agora". */
  onRetry?: () => void;
  /** E6-Q10: the id the tile's `aria-describedby` names. */
  id?: string;
}

export function UploadPill({ state, onRetry, id }: UploadPillProps) {
  const text = uploadPillText(state);
  if (text === null) return null;
  const glyph = (
    <svg className="ico ico-sm" aria-hidden="true">
      <use href="/sprite.svg#i-up" />
    </svg>
  );
  if (state === 'error') {
    return (
      <AriaButton className="upload-pill" data-state="error" onPress={onRetry} {...(id === undefined ? {} : { id })}>
        {glyph}
        {text}
      </AriaButton>
    );
  }
  return (
    <span className="upload-pill" data-state="pending" id={id}>
      {glyph}
      {text}
    </span>
  );
}

export interface PhotoRowProps {
  /** The tile's accessible name ("Foto 1", or "Foto 1, abrir" when it opens the viewer). */
  label: string;
  caption: string | null;
  thumb: Blob | null;
  state: PhotoUploadState;
  onRetry?: () => void;
  /** Story 6.3: the provisional number, drawn as the tile's badge. */
  number?: number;
  /** Story 6.3: the Photo stamp line above the caption ("06/09 14:32", the pin when GPS). */
  stamp?: { text: string; gps: boolean };
  /** Story 6.3: the tile is a button that opens the Photo viewer. */
  onOpen?: () => void;
  /** Story 6.5: "Legendar" opens the Caption composer. */
  onCaption?: () => void;
}

/** DESIGN.md › Photo stamp: the time, and a pin glyph whose accessible text is "GPS". */
export function PhotoStamp({ text, gps, className = 'photo-stamp', id }: { text: string; gps: boolean; className?: string; id?: string }) {
  return (
    <span className={className} id={id}>
      {text}
      {gps ? (
        <>
          <svg className="ico pin" aria-hidden="true">
            <use href="/sprite.svg#i-pin" />
          </svg>
          <span className="visually-hidden">{ui.photoRow.gps}</span>
        </>
      ) : null}
    </span>
  );
}

export function PhotoRow({ label, caption, thumb, state, onRetry, number, stamp, onOpen, onCaption }: PhotoRowProps) {
  const src = useObjectUrl(thumb);
  // E6-Q10 (EXPERIENCE.md › Photo tile): the tile is described by its stamp, caption and pill.
  const stampId = useId();
  const captionId = useId();
  const pillId = useId();
  const described = [
    stamp === undefined ? null : stampId,
    caption === null ? null : captionId,
    uploadPillText(state) === null ? null : pillId,
  ].filter((id): id is string => id !== null);
  const picture = (
    <span className="thumb">
      {src === null ? (
        <span className="thumb-fake" role={onOpen === undefined ? 'img' : undefined} aria-label={onOpen === undefined ? label : undefined} />
      ) : (
        <img className="thumb-img" src={src} alt={onOpen === undefined ? label : ''} />
      )}
      {number === undefined ? null : (
        <span className="number-badge" aria-hidden="true">
          {number}
        </span>
      )}
    </span>
  );
  return (
    <div className="photo-row">
      {onOpen === undefined ? (
        <span className="photo-tile">{picture}</span>
      ) : (
        <AriaButton
          className="photo-tile"
          aria-label={label}
          aria-describedby={described.length === 0 ? undefined : described.join(' ')}
          onPress={onOpen}
          data-photo-number={number}
        >
          {picture}
        </AriaButton>
      )}
      <div className="photo-text">
        {stamp === undefined ? null : <PhotoStamp text={stamp.text} gps={stamp.gps} id={stampId} />}
        {caption === null ? null : (
          <p className="photo-meta" id={captionId}>
            {caption}
          </p>
        )}
        <UploadPill state={state} id={pillId} {...(onRetry === undefined ? {} : { onRetry })} />
        {onCaption === undefined ? null : (
          <AriaButton className="btn btn-text" onPress={onCaption}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-pencil" />
            </svg>
            {ui.photoRow.caption}
          </AriaButton>
        )}
      </div>
    </div>
  );
}
