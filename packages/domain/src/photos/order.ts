import { moveLandingIndex, orderKeyForMove } from '../ops/order-key.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 6.3 (AD-13, AD-17): the one capture order of the photos of a relatório. Photos sort by `(captured_at, local_seq, id)`: AD-17's device component
 * collapses because the photo row carries no `device_id` and only one device fills a
 * relatório (source-deltas row 14), so the UUIDv7 `id` is the final deterministic
 * tie-breaker. The numbers themselves are `numberPhotos` (`numbering.ts`, Story 6.6): since
 * Story 17.1 they follow the document order (`print/photo-order.ts`), which reads this order
 * inside each of its groups.
 */

/** The fields the order reads; a snapshot file and a device tile both carry them. */
export interface OrderablePhoto {
  id: string;
  captured_at: string;
  local_seq: number;
}

/** The snapshot's photo rows, typed. */
export type SnapshotPhoto = Extract<RelatorioSnapshot['files'][number], { kind: 'photo' }>;

function instant(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** Capture order: the instant, then the per-device counter, then the id. */
export function comparePhotos(a: OrderablePhoto, b: OrderablePhoto): number {
  const ta = instant(a.captured_at);
  const tb = instant(b.captured_at);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.local_seq !== b.local_seq) return a.local_seq - b.local_seq;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The live photos of a snapshot, in capture order. */
export function livePhotos(snapshot: Pick<RelatorioSnapshot, 'files'>): SnapshotPhoto[] {
  return snapshot.files.filter((file): file is SnapshotPhoto => file.kind === 'photo' && file.removed_at === null).sort(comparePhotos);
}

/**
 * Story 11.11 (AD-1): the live photos of one sheet, in capture order: the nameplate photo,
 * the bursts and the imports whose `block_id` is this block, every checklist item's included.
 * The "Fotos da ficha" strip draws exactly this list; its numbers are `numberPhotos` over
 * the whole relatório.
 */
export function photosOfBlock(snapshot: Pick<RelatorioSnapshot, 'files'>, blockId: string): SnapshotPhoto[] {
  return livePhotos(snapshot).filter((photo) => photo.block_id === blockId);
}

/** The fields the "Geral" predicate reads; a snapshot photo and a device tile both carry them. */
export interface GeralCandidate {
  block_id: string | null;
  item_key: string | null;
  /** Absent and null both mean no local (contract 18). */
  location_id?: string | null;
  reading_kind: string | null;
}

/**
 * Story 17.1 (Bruno, 2026-10-27): a "Geral" photo, one added to the REGISTRO FOTOGRÁFICO by
 * hand: no sheet, no checklist or site item, no local, and no reading that names a place. The
 * vision-caption request (`reading_kind: 'caption'`) counts as Geral: Story 9.3's
 * `captionReadingOf` gives it to exactly the photos with no sheet, no caption and no "Pessoas
 * na foto" mark, so it is what a context-less gallery photo carries. 'plate', 'display',
 * 'panel' and 'nc_obs' are never Geral. The one predicate: section 7 prints exactly these
 * photos, and the screens that say where a photo prints read it too. Every other photo prints
 * only under its sheet or its local in section 9.
 */
export function isGeralPhoto(photo: GeralCandidate): boolean {
  return (
    photo.block_id === null &&
    photo.item_key === null &&
    (photo.location_id ?? null) === null &&
    (photo.reading_kind === null || photo.reading_kind === 'caption')
  );
}

/*
 * Story 21.3 (Bruno, 2026-11-05; AD-1, AD-3, AD-13): section 7 in the order of the work. A
 * "Geral" photo may carry an `order_key` (contract 30), written by one `file/{id}/order_key`
 * put per "Subir" or "Descer"; a photo never moved carries none. Every Geral photo gets an
 * effective key, `section7Key`: its `order_key`, else `captureOrderKey`, a key in the same
 * `0-9a-z` space that encodes its capture order. Keyed and unkeyed photos then sort together
 * with no write on the unkeyed ones, and a relatório where no photo was ever moved keeps
 * exactly its capture order. Ties (two devices minting one key) sort by id, as
 * `sortByOrderKey` does.
 */

/** The fields section 7's order reads: the capture order's, and the key a move wrote. */
export interface Section7Orderable extends OrderablePhoto {
  /** Absent and null both mean never moved (contract 30). */
  order_key?: string | null;
}

/** The capture keys' first character: a key moved to first place sorts below it. */
const CAPTURE_PREFIX = 't';
const INSTANT_DIGITS = 9;
const SEQ_DIGITS = 8;
/** 36^9 - 1, `zzzzzzzzz`: the unparsable instant's digits; a parsable one is clamped below it. */
const INSTANT_CEILING = 36 ** INSTANT_DIGITS - 1;
const SEQ_CEILING = 36 ** SEQ_DIGITS - 1;

function base36(n: number, digits: number): string {
  return n.toString(36).padStart(digits, '0');
}

/**
 * The key encoding a photo's capture order: `t`, 9 base36 digits of its instant in ms (clamped
 * to 0 and to just below `zzzzzzzzz`; an unparsable instant is `zzzzzzzzz`, last, where
 * `comparePhotos` puts it), then 8 base36 digits of its `local_seq` (clamped). Among photos
 * with no `order_key`, string order of these keys, then the id, equals `comparePhotos` (for
 * instants from 1970 to the year 5188).
 */
export function captureOrderKey(photo: Pick<OrderablePhoto, 'captured_at' | 'local_seq'>): string {
  const time = Date.parse(photo.captured_at);
  const ms = Number.isNaN(time) ? INSTANT_CEILING : Math.min(INSTANT_CEILING - 1, Math.max(0, Math.floor(time)));
  const seq = Math.min(SEQ_CEILING, Math.max(0, Math.floor(photo.local_seq)));
  return `${CAPTURE_PREFIX}${base36(ms, INSTANT_DIGITS)}${base36(seq, SEQ_DIGITS)}`;
}

/** A photo's effective section 7 key: the key a move wrote, else its capture key. */
export function section7Key(photo: Section7Orderable): string {
  return photo.order_key ?? captureOrderKey(photo);
}

/** Section 7's order: the effective key, then the id (`sortByOrderKey`'s tie rule). */
export function compareSection7(a: Section7Orderable, b: Section7Orderable): number {
  const ka = section7Key(a);
  const kb = section7Key(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Story 17.1, Story 21.3: the live "Geral" photos of a snapshot in section 7's order
 * (`compareSection7`; capture order when no photo was moved). Section 7 prints them in this
 * order and the one numbering sequence opens with them (`print/photo-order.ts`).
 */
export function geralPhotos(snapshot: Pick<RelatorioSnapshot, 'files'>): SnapshotPhoto[] {
  return livePhotos(snapshot).filter(isGeralPhoto).sort(compareSection7);
}

/**
 * The lowest capture key prefix strictly above `key`: `t` + (the 9 base36 digits after its
 * `t`, padded with `0`, plus one), or `t` for a key below `t`; null when none fits (a key from
 * `tzzzzzzzzz` up, or one above every `t` key). Every photo captured in a later millisecond
 * than the one `key` encodes has a capture key at or above it, so a photo moved to last place
 * with this as its upper bound stays below every later capture.
 */
function captureCeilingAbove(key: string): string | null {
  if (key < CAPTURE_PREFIX) return CAPTURE_PREFIX;
  if (!key.startsWith(CAPTURE_PREFIX)) return null;
  const ms = parseInt(key.slice(1, 1 + INSTANT_DIGITS).padEnd(INSTANT_DIGITS, '0'), 36);
  if (Number.isNaN(ms) || ms + 1 > INSTANT_CEILING) return null;
  return `${CAPTURE_PREFIX}${base36(ms + 1, INSTANT_DIGITS)}`;
}

/** The sentinel row's id: above every UUID, never a photo's. */
const NEXT_CAPTURE_ID = '￿';

/**
 * The `order_key` a "Geral" photo takes when moved to `toIndex` (0-based) among `geral`
 * (`geralPhotos`, section 7's order, the photo included); null when it lands where it is. One
 * put, no sibling rewritten (AD-3): `orderKeyForMove` over the effective keys, so the photo
 * lands exactly between the two it was put between, after a whole run of equal keys. A landing
 * at the end is bounded above by the capture key ceiling just above the new last neighbour
 * (`captureCeilingAbove`), so a photo captured afterwards still lands last.
 */
export function geralPhotoMoveKey(geral: readonly Section7Orderable[], id: string, toIndex: number): string | null {
  const rows = geral.map((photo) => ({ id: photo.id, order_key: section7Key(photo) }));
  if (!rows.some((row) => row.id === id)) throw new RangeError(`photo ${id} is not a Geral photo of section 7`);
  const to = moveLandingIndex(rows.length, toIndex);
  const others = rows.filter((row) => row.id !== id);
  const top = others[others.length - 1];
  const ceiling = top === undefined ? null : captureCeilingAbove(top.order_key);
  // A sentinel above every other key stands for "the next capture": `orderKeyForMove` reads it
  // as the upper neighbour of a landing at the end (or after a run of equal keys reaching the
  // end). It is never a landing slot: `to` stays among the real photos.
  const siblings = ceiling === null ? rows : [...rows, { id: NEXT_CAPTURE_ID, order_key: ceiling }];
  return orderKeyForMove(siblings, id, to);
}

/** Where a "Geral" photo stands in section 7 and which way it can move. */
export interface GeralMoveOptions {
  /** 1-based place in section 7's order. */
  position: number;
  total: number;
  /** "Subir" moves it one place up: false on the first. */
  canMoveUp: boolean;
  /** "Descer" moves it one place down: false on the last. */
  canMoveDown: boolean;
}

/** The move verdicts of photo `id` among `geral` (`geralPhotos`); null for a photo not among them (a sheet's, an item's, a local's). */
export function geralMoveOptions(geral: readonly Pick<OrderablePhoto, 'id'>[], id: string): GeralMoveOptions | null {
  const at = geral.findIndex((photo) => photo.id === id);
  if (at === -1) return null;
  return { position: at + 1, total: geral.length, canMoveUp: at > 0, canMoveDown: at < geral.length - 1 };
}

/**
 * The gallery's tile order: capture order (`comparePhotos`), with the slots the "Geral" tiles
 * hold refilled by those tiles in section 7's order (`compareSection7`). A photo of a sheet,
 * an item or a local keeps its capture-order slot; with no photo moved this is capture order.
 */
export function galleryTileOrder<T extends Section7Orderable & GeralCandidate>(tiles: readonly T[]): T[] {
  const ordered = [...tiles].sort(comparePhotos);
  const geral = ordered.filter(isGeralPhoto).sort(compareSection7);
  let next = 0;
  return ordered.map((tile) => (isGeralPhoto(tile) ? geral[next++]! : tile));
}

/**
 * The announcement of a move: "Foto movida: 2 de 5 na seção 3". Mirrors `pointMovedText`:
 * `section7Ref` is how the relatório names section 7 (`sectionRefText`), and `section7Prints`
 * false says the photos do not print.
 */
export function photoMovedText(position: number, total: number, section7Prints: boolean, section7Ref: string): string {
  // authored: Story 21.3, no mock draws the move; the announcement says where the photo landed.
  if (section7Prints) return `Foto movida: ${position} de ${total} na ${section7Ref}`;
  // authored: Story 21.3, a relatório without section 7 (p020 P-1b's absent wording).
  return `Foto movida: ${position} de ${total} · não sai no documento: o relatório não tem a ${section7Ref}`;
}
