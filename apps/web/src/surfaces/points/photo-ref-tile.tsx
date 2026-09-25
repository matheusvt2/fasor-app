import { Button as AriaButton } from 'react-aria-components';
import { useObjectUrl } from '../../components/photo-row.tsx';

/*
 * Story 6.6 (`72-pontos.html` `.poa-photos`, `.poa-photo-picker`): one referenced photo as
 * an inline Photo tile with its provisional number in `.number-badge`. As a button it either
 * picks the photo (the picker) or removes the reference (the editor); read-only on a card.
 */
export interface PhotoRefTileProps {
  thumb: Blob | null;
  /** The provisional number; null for a photo that is no longer live. */
  number: number | null;
  /** The tile's accessible name ("Imagem 13, remover referência"). */
  label: string;
  onPress?: () => void;
}

export function PhotoRefTile({ thumb, number, label, onPress }: PhotoRefTileProps) {
  const src = useObjectUrl(thumb);
  const inner = (
    <span className="thumb">
      {src === null ? <span className="thumb-fake" aria-hidden="true" /> : <img className="thumb-img" src={src} alt="" />}
      {number === null ? null : (
        <span className="number-badge" aria-hidden="true">
          {number}
        </span>
      )}
    </span>
  );
  if (onPress === undefined) {
    return (
      <span className="photo-tile is-inline" role="img" aria-label={label}>
        {inner}
      </span>
    );
  }
  return (
    <AriaButton className="photo-tile is-inline" aria-label={label} onPress={onPress}>
      {inner}
    </AriaButton>
  );
}
