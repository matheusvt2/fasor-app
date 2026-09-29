import { fileFieldPath, suggestionStatusPath } from '../ops/path.ts';
import type { OpDraft } from '../ops/op.ts';
import { panelSuggestionValueSchema, type PanelSuggestionValue } from '../reading/panel.ts';
import { plateReadingTarget } from '../reading/target.ts';
import { EQUIPMENT_BLOCK_TYPES, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, JsonValue, LocationRow, SuggestionRow } from '../schemas/entities.ts';
import { locationPathText } from './location-path.ts';
import { relatorioOpEnvelope, type Author } from './ops.ts';
import { discardSuggestionOp, PLATE_CAPTION } from './suggestions.ts';
import { locationCode, suggestTag, TAG_PREFIX, type TagEquipment } from './tag.ts';
import { blockTypeLabel } from './tree.ts';

/*
 * Story 9.2 (FR-38): "Fotografar equipamento" on the device, every derived value once. The
 * panel photo's one pending suggestion (`reading/panel.ts`, on `file/{photo}/block_id`) or
 * the type the engineer taps becomes one proposal: the type, where the block goes (the
 * palette's cabine's coluna the label names, else the palette's own location, flagged
 * Verificar), the TAG `suggestTag` gives there, and the line "Criar SEC-C09-2 · Chave
 * seccionadora · Coluna 9?". One tap commits equipment + block and re-targets the same photo
 * to the new block's plate (`panelRetargetOps`); nothing is written before it.
 */

const SEP = ' · ';

/** The panel suggestion of a photo: its row and its parsed value. */
export interface PanelSuggestion {
  row: SuggestionRow;
  value: PanelSuggestionValue;
}

/** The newest pending suggestion on `file/{photoId}/block_id` whose value parses, or null. */
export function panelSuggestionOf(pending: readonly SuggestionRow[], photoId: string): PanelSuggestion | null {
  const path = fileFieldPath(photoId, 'block_id');
  let best: PanelSuggestion | null = null;
  for (const row of pending) {
    if (row.status !== 'pending' || row.target_path !== path) continue;
    const value = panelSuggestionValueSchema.safeParse(row.value);
    if (!value.success) continue;
    if (best === null || row.id > best.row.id) best = { row, value: value.data };
  }
  return best;
}

/** Where the proposal puts the block, and whether it is the coluna the label named. */
export interface PanelLocation {
  location: LocationRow;
  matched: boolean;
}

const live = (location: LocationRow) => location.removed_at === null;

/**
 * The palette location's cabine (itself, or its parent) and its live coluna whose code is
 * `C` plus the column's two digits ("C09" is "Coluna 9"); else the palette location itself,
 * `matched: false` (no coluna is ever created). Null when the palette location is gone.
 */
export function panelLocation(locations: readonly LocationRow[], paletteLocationId: string, column: number | null): PanelLocation | null {
  const palette = locations.find((location) => location.id === paletteLocationId && live(location));
  if (palette === undefined) return null;
  if (column === null) return { location: palette, matched: false };
  const cabine = palette.kind === 'cabine' ? palette : locations.find((location) => location.id === palette.parent_id && live(location));
  if (cabine !== undefined) {
    const code = `C${String(column).padStart(2, '0')}`;
    const coluna = locations.find(
      (location) => live(location) && location.kind === 'coluna' && location.parent_id === cabine.id && locationCode({ kind: location.kind, name: location.name }) === code,
    );
    if (coluna !== undefined) return { location: coluna, matched: true };
  }
  return { location: palette, matched: false };
}

/** One chip of the type row. */
export interface PanelTypeChip {
  type: EquipmentBlockType;
  label: string;
}

/**
 * The type chips of the result dialog: collapsed, the read type and the next three in seed
 * order (wrapping), then "Outro…" (`other`); expanded, or with no type read, all eight.
 */
export function panelTypeChips(seedVersion: string, first: EquipmentBlockType | null, expanded: boolean): { chips: PanelTypeChip[]; other: boolean } {
  const chip = (type: EquipmentBlockType): PanelTypeChip => ({ type, label: blockTypeLabel(seedVersion, type) });
  if (first === null || expanded) return { chips: EQUIPMENT_BLOCK_TYPES.map(chip), other: false };
  const at = EQUIPMENT_BLOCK_TYPES.indexOf(first);
  const types = [0, 1, 2, 3].map((offset) => EQUIPMENT_BLOCK_TYPES[(at + offset) % EQUIPMENT_BLOCK_TYPES.length]!);
  return { chips: types.map(chip), other: true };
}

/** "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?" */
export function panelCreateText(tag: string, typeLabel: string, locationName: string): string {
  return `Criar ${tag}${SEP}${typeLabel}${SEP}${locationName}?`;
}

export interface PanelProposalInput {
  seedVersion: string;
  /** The relatório's locations (removed ones may be among them; they are never chosen). */
  locations: readonly LocationRow[];
  /** The project's equipment, removed rows included. */
  equipment: readonly TagEquipment[];
  paletteLocationId: string;
  suggestion: PanelSuggestion | null;
  /** The chip the engineer tapped, or null while none was. */
  pickedType: EquipmentBlockType | null;
}

export interface PanelProposal {
  type: EquipmentBlockType;
  typeLabel: string;
  location: LocationRow;
  /** "1° Subsolo › Coluna 9". */
  locationPath: string;
  tag: string;
  /** The Suggestion field's state; null when the type was picked by hand (no suggestion to flag). */
  trust: 'suggested' | 'verify' | null;
  text: string;
  /** What the confirm writes on the suggestion: `confirmed` when the type and the location are the read ones; null with none. */
  suggestionStatus: 'confirmed' | 'discarded' | null;
  /** Whether the location is the coluna the label named. */
  matched: boolean;
}

/** The block one tap would create, or null while no type is known (no "Criar" line) or the palette location is gone. */
export function panelProposal(input: PanelProposalInput): PanelProposal | null {
  const suggested = input.suggestion?.value.block_type ?? null;
  const type = input.pickedType ?? suggested;
  if (type === null) return null;
  const where = panelLocation(input.locations, input.paletteLocationId, input.suggestion?.value.column ?? null);
  if (where === null) return null;
  const { location, matched } = where;
  const typeLabel = blockTypeLabel(input.seedVersion, type);
  const tag = suggestTag(type, { kind: location.kind, name: location.name }, input.equipment);
  const byHand = input.pickedType !== null && input.pickedType !== suggested;
  const trust = input.suggestion === null || byHand ? null : input.suggestion.row.trust === 'verify' || !matched ? 'verify' : 'suggested';
  const suggestionStatus = input.suggestion === null ? null : type === suggested && matched ? 'confirmed' : 'discarded';
  return {
    type,
    typeLabel,
    location,
    locationPath: locationPathText(input.locations, location.id),
    tag,
    trust,
    text: panelCreateText(tag, typeLabel, location.name),
    suggestionStatus,
    matched,
  };
}

/** One line of the `.prov-list`: where each part of the proposal came from. */
export interface PanelProvenanceItem {
  label: string;
  text: string;
}

/** The three `.prov-list` lines of a proposal: the type, the column and the TAG. */
export function panelProvenance(proposal: PanelProposal, suggestion: PanelSuggestion | null): PanelProvenanceItem[] {
  const read = suggestion?.value ?? null;
  const typeText = read !== null && read.block_type === proposal.type ? 'frente do painel' : 'escolhido por você';
  const label = read?.column_text ?? null;
  const columnText =
    label === null
      ? `não lida na foto${SEP}local onde a paleta abriu`
      : proposal.matched
        ? `etiqueta "${label}" na foto`
        : `etiqueta "${label}" na foto${SEP}coluna não encontrada, conferir`;
  let tagText: string;
  if (proposal.type === 'transformador_forca') tagText = `tipo${SEP}próximo número livre`;
  else {
    const base = `${TAG_PREFIX[proposal.type]}-${locationCode({ kind: proposal.location.kind, name: proposal.location.name })}`;
    tagText = proposal.tag === base ? `tipo + coluna${SEP}nenhuma ${base} no relatório` : `tipo + coluna${SEP}${base} já existe`;
  }
  return [
    { label: 'Tipo', text: typeText },
    { label: 'Coluna', text: columnText },
    { label: 'TAG', text: tagText },
  ];
}

/**
 * The confirm's re-target of the panel photo to the new block's plate, in the batch that
 * creates the block: its `block_id`, the plate caption, the plate reading target and,
 * last, `reading_kind = plate` (which queues the plate reading, `applyOp`).
 */
export function panelRetargetOps(author: Author, relatorioId: string, photoId: string, block: Pick<BlockRow, 'id' | 'block_type'>): OpDraft[] {
  const envelope = relatorioOpEnvelope(author, relatorioId);
  const put = (field: 'block_id' | 'caption' | 'reading_target' | 'reading_kind', value: JsonValue): OpDraft => ({
    ...envelope,
    kind: 'put',
    path: fileFieldPath(photoId, field),
    value,
  });
  return [
    put('block_id', block.id),
    put('caption', PLATE_CAPTION),
    put('reading_target', plateReadingTarget(block.id, block.block_type) as JsonValue),
    put('reading_kind', 'plate'),
  ];
}

/** The panel suggestion's status put of a confirm (`confirmed` or `discarded`, `panelProposal`). */
export function panelSuggestionStatusOp(author: Author, suggestion: Pick<SuggestionRow, 'id' | 'relatorio_id'>, status: 'confirmed' | 'discarded'): OpDraft {
  return { ...relatorioOpEnvelope(author, suggestion.relatorio_id), kind: 'put', path: suggestionStatusPath(suggestion.id), value: status };
}

/** "Cancelar" and "Fotografar de novo": the unconfirmed photo's tombstone and its pending suggestion discarded, one batch. */
export function panelCancelOps(author: Author, relatorioId: string, photoId: string, suggestion: Pick<SuggestionRow, 'id' | 'relatorio_id'> | null, at: string): OpDraft[] {
  return [
    { ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path: fileFieldPath(photoId, 'removed_at'), value: at },
    ...(suggestion === null ? [] : [discardSuggestionOp(author, suggestion)]),
  ];
}

