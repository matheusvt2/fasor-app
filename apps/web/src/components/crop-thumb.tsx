import { toIso } from '@app/domain';
import { useEffect, useState, type CSSProperties } from 'react';
import { now } from '../clock.ts';
import { ui } from '../copy/ui.ts';
import { cropSourceBlob } from '../db/file-store.ts';
import type { AppDatabase } from '../db/schema.ts';
import { useSession } from '../state/session.tsx';
import { useSync } from '../state/sync.tsx';
import { useObjectUrl } from './photo-row.tsx';

/** A normalized region of a picture: `[x0, y0, x1, y1]`, each 0 to 1 (AD-12 `source.bbox`). */
export type Bbox = readonly [number, number, number, number];

export interface CropThumbProps {
  /** The source photo's id. */
  photoId: string;
  bbox: Bbox;
  /** The field's label, for the button's name ("Ver recorte da placa — Fabricante"). */
  label: string;
  /** Opens the Photo viewer on the region; absent, the tap does nothing. */
  onPress?: () => void;
}

/*
 * One fetch per photo at a time: a plate's nine fields ask for the same picture at once,
 * and the first answer is kept (`cropSourceBlob`), so the rest are served from the store.
 */
const inFlight = new Map<string, Promise<Blob | null>>();

function sourceOf(db: AppDatabase, photoId: string, fetchFile: Parameters<typeof cropSourceBlob>[2]['fetchFile']): Promise<Blob | null> {
  const key = `${db.name}:${photoId}`;
  const running = inFlight.get(key);
  if (running !== undefined) return running;
  const next = cropSourceBlob(db, photoId, { fetchFile, nowIso: toIso(now()) }).finally(() => inFlight.delete(key));
  inFlight.set(key, next);
  return next;
}

/** The picture a crop is drawn from, null meanwhile or when there is none. */
function useCropSource(photoId: string): Blob | null {
  const db = useSession().database;
  const { fetchFile } = useSync();
  const [picture, setPicture] = useState<{ id: string; blob: Blob } | null>(null);
  useEffect(() => {
    if (db === null) return;
    let live = true;
    void sourceOf(db, photoId, fetchFile)
      .then((blob) => {
        if (live && blob !== null) setPicture({ id: photoId, blob });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [db, fetchFile, photoId]);
  return picture !== null && picture.id === photoId ? picture.blob : null;
}

/**
 * Where the picture sits in the square thumbnail so the region fills it: a square around
 * the region's centre, as wide as its longer side (in pixels), keeping the picture's aspect.
 */
function regionStyle(bbox: Bbox, size: { width: number; height: number }): CSSProperties {
  const [x0, y0, x1, y1] = bbox;
  const cx = ((x0 + x1) / 2) * size.width;
  const cy = ((y0 + y1) / 2) * size.height;
  const side = Math.max((x1 - x0) * size.width, (y1 - y0) * size.height, 1);
  return {
    width: `${(size.width / side) * 100}%`,
    height: `${(size.height / side) * 100}%`,
    left: `${(-(cx - side / 2) / side) * 100}%`,
    top: `${(-(cy - side / 2) / side) * 100}%`,
  };
}

/**
 * Story 8.1 (EXPERIENCE.md › Suggestion field, `components.css` `.crop-thumb`): the source
 * crop of a suggested value, the region of the plate photo its value was read from. The
 * picture is this device's original, else the server's original kept as a `crop` blob; the
 * mock's `.thumb-fake` stands in meanwhile. 48 px beside a suggestion, a 24 px glyph (the
 * hit area stays 48 px) once confirmed; the tap opens the Photo viewer on the region.
 */
export function CropThumb({ photoId, bbox, label, onPress }: CropThumbProps) {
  const src = useObjectUrl(useCropSource(photoId));
  const [size, setSize] = useState<{ src: string; width: number; height: number } | null>(null);
  const loaded = size !== null && size.src === src;
  return (
    <button type="button" className="crop-thumb" aria-label={ui.suggestionField.cropLabel(label)} onClick={onPress} data-photo-id={photoId}>
      {loaded ? null : <i className="thumb-fake" role="img" aria-label={ui.suggestionField.cropAlt} />}
      {src === null ? null : (
        <span className="crop-picture" hidden={!loaded}>
          <img
            src={src}
            alt={ui.suggestionField.cropAlt}
            style={loaded ? regionStyle(bbox, size) : undefined}
            onLoad={(event) => setSize({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        </span>
      )}
    </button>
  );
}
