import { toIso } from '@app/domain';
import { useEffect, useState, type CSSProperties } from 'react';
import { now } from '../clock.ts';
import { ui } from '../copy/ui.ts';
import { cropSourceBlob } from '../db/file-store.ts';
import type { AppDatabase } from '../db/schema.ts';
import { useSession } from '../state/session.tsx';
import { useSyncActions } from '../state/sync-actions.ts';

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
  /** Story 9.1: what the picture is of, for its names ("Ver recorte do visor"); default `plate`. Story 9.2: `panel` ("Ver recorte da etiqueta"). */
  source?: 'plate' | 'display' | 'panel';
  /**
   * Story 10.2: drawn inside another control (a Conflict view option, `role="radio"`), so it
   * is a picture (`span[role=img]`, `86-sync-conflito.html`), never a nested button.
   */
  presentational?: boolean;
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
export function useCropSource(photoId: string): Blob | null {
  const db = useSession().database;
  const { fetchFile } = useSyncActions();
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

/*
 * W-11 (full review 2026-09-30): one object URL per source picture, shared by every
 * `CropThumb` of that photo on screen (a plate has up to nine fields), so the full-size
 * original is decoded once, not once per field. Counted by mount; the last unmount revokes it.
 */
interface SharedSource {
  mounts: number;
  url: string | null;
  listeners: Set<() => void>;
}

const sharedSources = new Map<string, SharedSource>();

function acquireSource(key: string, load: () => Promise<Blob | null>): SharedSource {
  let entry = sharedSources.get(key);
  if (entry === undefined) {
    const created: SharedSource = { mounts: 0, url: null, listeners: new Set() };
    sharedSources.set(key, created);
    void load()
      .then((blob) => {
        // Every thumb of the photo unmounted meanwhile: nothing to hand the picture to.
        if (sharedSources.get(key) !== created || blob === null || typeof URL.createObjectURL !== 'function') return;
        created.url = URL.createObjectURL(blob);
        for (const listener of created.listeners) listener();
      })
      .catch(() => undefined);
    entry = created;
  }
  entry.mounts += 1;
  return entry;
}

function releaseSource(key: string, entry: SharedSource): void {
  entry.mounts -= 1;
  if (entry.mounts > 0) return;
  if (sharedSources.get(key) === entry) sharedSources.delete(key);
  if (entry.url !== null) URL.revokeObjectURL(entry.url);
}

/** The shared object URL of the picture a crop is drawn from, null meanwhile or when there is none. */
function useSharedCropUrl(photoId: string): string | null {
  const db = useSession().database;
  const { fetchFile } = useSyncActions();
  const key = db === null ? null : `${db.name}:${photoId}`;
  const [held, setHeld] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (db === null || key === null) return;
    const entry = acquireSource(key, () => sourceOf(db, photoId, fetchFile));
    const update = () => setHeld({ key, url: entry.url });
    entry.listeners.add(update);
    update();
    return () => {
      entry.listeners.delete(update);
      releaseSource(key, entry);
    };
  }, [db, key, photoId, fetchFile]);
  return held !== null && held.key === key ? held.url : null;
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
export function CropThumb({ photoId, bbox, label, onPress, source = 'plate', presentational = false }: CropThumbProps) {
  const t = ui.suggestionField;
  const src = useSharedCropUrl(photoId);
  const [size, setSize] = useState<{ src: string; width: number; height: number } | null>(null);
  const loaded = size !== null && size.src === src;
  const alt = source === 'display' ? t.cropDisplayAlt : source === 'panel' ? t.cropPanelAlt : t.cropAlt;
  const name = source === 'display' ? t.cropDisplayLabel(label) : source === 'panel' ? t.cropPanelLabel : t.cropLabel(label);
  if (presentational) {
    return (
      <span className="crop-thumb" role="img" aria-label={alt} data-photo-id={photoId}>
        {loaded ? null : <i className="thumb-fake" aria-hidden="true" />}
        {src === null ? null : (
          <span className="crop-picture" hidden={!loaded} aria-hidden="true">
            <img
              src={src}
              alt=""
              style={loaded ? regionStyle(bbox, size) : undefined}
              onLoad={(event) => setSize({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
          </span>
        )}
      </span>
    );
  }
  return (
    <button type="button" className="crop-thumb" aria-label={name} onClick={onPress} data-photo-id={photoId}>
      {loaded ? null : <i className="thumb-fake" role="img" aria-label={alt} />}
      {src === null ? null : (
        <span className="crop-picture" hidden={!loaded}>
          <img
            src={src}
            alt={alt}
            style={loaded ? regionStyle(bbox, size) : undefined}
            onLoad={(event) => setSize({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        </span>
      )}
    </button>
  );
}
