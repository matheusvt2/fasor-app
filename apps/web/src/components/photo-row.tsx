import { uploadPillText, type PhotoUploadState } from '@app/domain';
import { useEffect, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';

/*
 * Stories 6.1 and 6.2 (UX-DR50; `key-photos.html` `.photo-row`, `70-fotos.html`
 * `.upload-pill`): one photo as a tile row -- the thumb, the caption in `.photo-meta`, and
 * the upload pill under it. "Aguardando envio" is the amber pill; "Erro — Tentar novamente"
 * is the red-outline pill that is itself the retry button (at least 48 px, `components.css`
 * `.upload-pill[data-state="error"]`). A photo the server holds shows no pill. The tile
 * opens nothing yet: the viewer is Story 6.3's.
 */

/** An object URL for a Blob, revoked when the Blob changes or the caller unmounts. */
function useObjectUrl(blob: Blob | null): string | null {
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
}

export function UploadPill({ state, onRetry }: UploadPillProps) {
  const text = uploadPillText(state);
  if (text === null) return null;
  const glyph = (
    <svg className="ico ico-sm" aria-hidden="true">
      <use href="/sprite.svg#i-up" />
    </svg>
  );
  if (state === 'error') {
    return (
      <AriaButton className="upload-pill" data-state="error" onPress={onRetry}>
        {glyph}
        {text}
      </AriaButton>
    );
  }
  return (
    <span className="upload-pill" data-state="pending">
      {glyph}
      {text}
    </span>
  );
}

export interface PhotoRowProps {
  /** The tile's accessible name ("Foto 1"). */
  label: string;
  caption: string | null;
  thumb: Blob | null;
  state: PhotoUploadState;
  onRetry?: () => void;
}

export function PhotoRow({ label, caption, thumb, state, onRetry }: PhotoRowProps) {
  const src = useObjectUrl(thumb);
  return (
    <div className="photo-row">
      <span className="photo-tile">
        <span className="thumb">{src === null ? <span className="thumb-fake" role="img" aria-label={label} /> : <img className="thumb-img" src={src} alt={label} />}</span>
      </span>
      <div className="photo-text">
        {caption === null ? null : <p className="photo-meta">{caption}</p>}
        <UploadPill state={state} {...(onRetry === undefined ? {} : { onRetry })} />
      </div>
    </div>
  );
}
