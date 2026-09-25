import { formatDateTime, formatShortDateTime } from '../format/datetime.ts';
import { cabineOf } from '../relatorio/cabine.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { locationPathText } from '../relatorio/location-path.ts';
import { screenLabel } from '../relatorio/screen-label.ts';
import { checklistResultOf } from '../relatorio/sheet-progress.ts';
import { locationTree } from '../relatorio/tree.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { plural } from '../text/plural.ts';
import type { CaptionWord } from './caption.ts';
import { photosPendingText, photosUncaptionedText, photoUploadState } from './text.ts';

/*
 * Stories 6.3 and 6.4: every stamp, count and sentence the gallery, the viewer and the
 * import sheet show (AGENTS.md "Derived text goes in packages/domain"). Display time zone
 * America/Sao_Paulo; coordinates with four decimals, the pt-BR comma and the Unicode minus.
 */

const SEP = ' · ';

/** The tile's stamp: "06/09 14:32" (the pin glyph is the UI's, drawn when coords exist). */
export function photoStampShort(capturedAt: string): string {
  return formatShortDateTime(capturedAt);
}

function coordinate(value: number): string {
  const text = Math.abs(value).toFixed(4).replace('.', ',');
  return value < 0 && Number(text.replace(',', '.')) !== 0 ? `−${text}` : text;
}

/** "−23,5505, −46,6333". */
export function photoCoordsText(coords: { lat: number; lng: number }): string {
  return `${coordinate(coords.lat)}, ${coordinate(coords.lng)}`;
}

/** The viewer's stamp: "06/09/2026 14:32 · −23,5505, −46,6333"; the time alone without coords. */
export function photoStampFull(photo: { captured_at: string; coords: { lat: number; lng: number } | null }): string {
  const time = formatDateTime(photo.captured_at);
  return photo.coords === null ? time : `${time}${SEP}${photoCoordsText(photo.coords)}`;
}

export interface PhotoItemLine {
  /** "Item 8 · Contatos · NC", or "Item 8 · Contatos" while the item is unanswered. */
  text: string;
  /** "Item 8 · Contatos": the part before the result. */
  head: string;
  result: 'C' | 'NC' | 'NA' | null;
  nc: boolean;
}

/** The checklist item a photo was taken on, as the viewer and section 7 name it; null off an item. */
export function photoItemLine(photo: { block_id: string | null; item_key: string | null }, snapshot: Pick<RelatorioSnapshot, 'blocks'>): PhotoItemLine | null {
  if (photo.block_id === null || photo.item_key === null) return null;
  const block = snapshot.blocks.find((row) => row.id === photo.block_id);
  if (block === undefined) return null;
  let checklist: readonly { key: string; label: string }[] | null;
  try {
    checklist = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).checklist;
  } catch {
    return null;
  }
  const index = checklist?.findIndex((item) => item.key === photo.item_key) ?? -1;
  if (checklist === null || index < 0) return null;
  const head = `Item ${index + 1}${SEP}${screenLabel(checklist[index]!.label)}`;
  const result = checklistResultOf(block, photo.item_key);
  return { head, result, nc: result === 'NC', text: result === null ? head : `${head}${SEP}${result}` };
}

/** The cabine a photo's sheet sits in, or null (a photo with no sheet, or a sheet off the tree). */
export function photoCabineId(photo: { block_id: string | null }, snapshot: Pick<RelatorioSnapshot, 'blocks' | 'locations'>): string | null {
  if (photo.block_id === null) return null;
  const block = snapshot.blocks.find((row) => row.id === photo.block_id);
  if (block === undefined) return null;
  return cabineOf(snapshot.locations, block.location_id)?.id ?? null;
}

/** The id of the "Todas" filter chip. */
export const GALLERY_ALL = 'all';

export interface GalleryFilterOption {
  id: string;
  label: string;
}

/** The cabine Filter chips: "Todas" first, then each cabine holding a photo's sheet, in tree order. */
export function galleryCabineOptions(
  snapshot: Pick<RelatorioSnapshot, 'blocks' | 'locations' | 'equipment'>,
  photos: readonly { block_id: string | null }[],
): GalleryFilterOption[] {
  const holding = new Set(photos.map((photo) => photoCabineId(photo, snapshot)).filter((id): id is string => id !== null));
  const options: GalleryFilterOption[] = [{ id: GALLERY_ALL, label: 'Todas' }];
  for (const root of locationTree(snapshot)) {
    if (root.kind === 'cabine' && holding.has(root.id)) options.push({ id: root.id, label: root.name });
  }
  return options;
}

/** The visually hidden status after a filter: "Mostrando 4 fotos do Cubículo Enel", "Mostrando 20 fotos". */
export function galleryFilterText(n: number, cabine: Pick<CaptionWord, 'name' | 'gender' | 'number'> | null): string {
  const count = `Mostrando ${plural(n, 'foto', 'fotos')}`;
  if (cabine === null) return count;
  const article = `${cabine.gender === 'f' ? 'a' : 'o'}${cabine.number === 'plural' ? 's' : ''}`;
  return `${count} d${article} ${cabine.name}`;
}

/** The gallery's heading: "Registro fotográfico (20)". */
export function galleryHeadingText(n: number): string {
  return `Registro fotográfico (${n})`;
}

/** The gallery header's counter: "3 fotos aguardando envio · 1 com erro · 1 sem legenda"; null when all are zero. */
export function galleryCounterText(counts: { pending: number; error: number; uncaptioned: number }): string | null {
  const parts: string[] = [];
  if (counts.pending > 0) parts.push(photosPendingText(counts.pending));
  if (counts.error > 0) parts.push(`${counts.error} com erro`);
  if (counts.uncaptioned > 0) parts.push(photosUncaptionedText(counts.uncaptioned));
  return parts.length === 0 ? null : parts.join(SEP);
}

/** A caption that says nothing: null or blank. */
export function isUncaptioned(caption: string | null): boolean {
  return caption === null || caption.trim() === '';
}

/** The viewer's count: "4 de 20 · nº provisório". */
export function viewerCountText(position: number, total: number): string {
  return `${position} de ${total}${SEP}nº provisório`;
}

/** A gallery tile's accessible name: "Foto 4, abrir". */
export function photoTileLabel(n: number): string {
  return `Foto ${n}, abrir`;
}

/** The viewer's accessible name: "Foto 4 de 20". */
export function viewerLabel(position: number, total: number): string {
  return `Foto ${position} de ${total}`;
}

/** The toast after "Remover": "Foto 4 removida do relatório". */
export function photoRemovedText(n: number): string {
  return `Foto ${n} removida do relatório`;
}

/** E6-Q3: the Caption composer's photo line (`71-legenda.html` `.capture-meta`): "Nº provisório 4 · 06/09 08:31". */
export function captionPhotoMetaText(n: number | null, capturedAt: string): string {
  const stamp = photoStampShort(capturedAt);
  return n === null ? stamp : `Nº provisório ${n}${SEP}${stamp}`;
}

/** E6-Q3: the composer's photo preview name: "Foto 4", "Foto" before it has a number. */
export function captionPhotoLabel(n: number | null): string {
  return n === null ? 'Foto' : `Foto ${n}`;
}

/** The toast after "Salvar legenda": "Legenda da foto 4 salva". */
export function captionSavedText(n: number | null): string {
  return n === null ? 'Legenda salva' : `Legenda da foto ${n} salva`;
}

// --- Story 6.4: the import ----------------------------------------------------------------

/** The batch's primary: "Adicionar 3 fotos". */
export function addPhotosButtonText(n: number): string {
  return `Adicionar ${plural(n, 'foto', 'fotos')}`;
}

/** After "De qual equipamento?": "— vale para as 3 fotos". */
export function batchScopeText(n: number): string {
  return n === 1 ? '— vale para a foto' : `— vale para as ${n} fotos`;
}

/** The batch caption field's label: "Legenda das 3 fotos". */
export function batchCaptionLabel(n: number): string {
  return n === 1 ? 'Legenda da foto' : `Legenda das ${n} fotos`;
}

/** The batch's toast: "3 fotos adicionadas — legenda aplicada". */
export function photosAddedText(n: number): string {
  return n === 1 ? '1 foto adicionada — legenda aplicada' : `${n} fotos adicionadas — legenda aplicada`;
}

/** The note beside the batch caption: "Fica igual para as 3 fotos; dá para mudar uma a uma depois em Legendar." */
export function batchCaptionNote(n: number): string {
  return n === 1
    ? 'Digite para trocar. Dá para mudar depois em Legendar.'
    : `Digite para trocar. Fica igual para as ${n} fotos; dá para mudar uma a uma depois em Legendar.`;
}

/** The toast when files were left out: "1 arquivo não é uma foto e ficou de fora". */
export function skippedFilesText(n: number): string {
  return n === 1 ? '1 arquivo não pôde ser lido como foto e ficou de fora' : `${n} arquivos não puderam ser lidos como foto e ficaram de fora`;
}

export interface PhotoEquipmentOption {
  blockId: string;
  /** "SEC-C05 · Chave seccionadora · 1° Subsolo › Coluna 5". */
  text: string;
}

/** "De qual equipamento?": every equipment sheet in tree order, named by TAG, type and place. */
export function photoEquipmentOptions(snapshot: Pick<RelatorioSnapshot, 'blocks' | 'locations' | 'equipment'>): PhotoEquipmentOption[] {
  return sheetOrder(snapshot).map((node) => ({
    blockId: node.blockId,
    text: [node.tag, node.typeLabel, locationPathText(snapshot.locations, node.locationId)].filter((part) => part !== '').join(SEP),
  }));
}

/** E6-Q4: how many rows the short list of "De qual equipamento?" offers before "Outro equipamento". */
export const PHOTO_EQUIPMENT_NEARBY_MAX = 5;

/** E6-Q4: one group of the full list: the sheets of one location, "1° Subsolo › Coluna 5". */
export interface PhotoEquipmentGroup {
  locationId: string;
  label: string;
  options: PhotoEquipmentOption[];
}

export interface PhotoEquipmentGroups {
  /**
   * The short list: the current sheet (this device's last one), then the sheets of its
   * location, then the rest of its cabine, in tree order, at most `PHOTO_EQUIPMENT_NEARBY_MAX`;
   * empty with no current sheet (the full list shows directly).
   */
  nearby: PhotoEquipmentOption[];
  /** Every sheet grouped by the location it hangs off (cabine › coluna), in tree order. */
  groups: PhotoEquipmentGroup[];
}

/**
 * E6-Q4 (`70-fotos.html` "De qual equipamento?"): the likely equipment first, the whole
 * relatório grouped as the tree draws it after "Outro equipamento". `currentBlockId` is the
 * `last_sheet:{relatorio_id}` pref; one that is not a live sheet counts as none.
 */
export function photoEquipmentGroups(snapshot: Pick<RelatorioSnapshot, 'blocks' | 'locations' | 'equipment'>, currentBlockId: string | null): PhotoEquipmentGroups {
  const order = sheetOrder(snapshot);
  const options = photoEquipmentOptions(snapshot);
  const optionOf = new Map(options.map((option) => [option.blockId, option]));
  const groups: PhotoEquipmentGroup[] = [];
  for (const node of order) {
    let group = groups.find((known) => known.locationId === node.locationId);
    if (group === undefined) {
      group = { locationId: node.locationId, label: locationPathText(snapshot.locations, node.locationId), options: [] };
      groups.push(group);
    }
    group.options.push(optionOf.get(node.blockId)!);
  }
  const current = currentBlockId === null ? undefined : order.find((node) => node.blockId === currentBlockId);
  if (current === undefined) return { nearby: [], groups };
  const cabineId = cabineOf(snapshot.locations, current.locationId)?.id ?? null;
  const sameCabine = (locationId: string) => cabineId !== null && cabineOf(snapshot.locations, locationId)?.id === cabineId;
  const ranked = [
    current,
    ...order.filter((node) => node !== current && node.locationId === current.locationId),
    ...order.filter((node) => node.locationId !== current.locationId && sameCabine(node.locationId)),
  ];
  return { nearby: ranked.slice(0, PHOTO_EQUIPMENT_NEARBY_MAX).map((node) => optionOf.get(node.blockId)!), groups };
}

/** E6-Q12: the gallery header's counts, from the tiles' upload state and caption. */
export function galleryCounts(tiles: readonly { uploaded_at: string | null; upload_error?: unknown; caption: string | null }[]): { pending: number; error: number; uncaptioned: number } {
  const counts = { pending: 0, error: 0, uncaptioned: 0 };
  for (const tile of tiles) {
    const state = photoUploadState({ uploaded_at: tile.uploaded_at, localError: tile.upload_error });
    if (state === 'pending') counts.pending += 1;
    else if (state === 'error') counts.error += 1;
    if (isUncaptioned(tile.caption)) counts.uncaptioned += 1;
  }
  return counts;
}

/**
 * E6-Q12: the one toast of an import: "3 fotos adicionadas — legenda aplicada", with the
 * files left out after it ("… 1 arquivo não pôde ser lido como foto e ficou de fora"), or
 * those alone; null when nothing was added or left out.
 */
export function photosImportedText(added: number, skipped: number): string | null {
  if (added > 0 && skipped > 0) return `${photosAddedText(added)}. ${skippedFilesText(skipped)}`;
  if (added > 0) return photosAddedText(added);
  if (skipped > 0) return skippedFilesText(skipped);
  return null;
}

/**
 * E6-Q8: "Cancelar" on "De qual equipamento?": the batch was saved when it was picked and
 * stays, as "Geral" with no caption. "3 fotos ficaram como Geral, sem legenda", the files
 * left out after it.
 */
export function photosKeptGeneralText(kept: number, skipped: number): string | null {
  // authored: no mock draws this toast (open for Bruno).
  const keptText = kept === 0 ? null : kept === 1 ? '1 foto ficou como Geral, sem legenda' : `${kept} fotos ficaram como Geral, sem legenda`;
  if (keptText !== null && skipped > 0) return `${keptText}. ${skippedFilesText(skipped)}`;
  return keptText ?? (skipped > 0 ? skippedFilesText(skipped) : null);
}
