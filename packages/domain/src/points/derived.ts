import { photoToken } from './refs.ts';
import { livePhotos } from '../photos/order.ts';
import { conclusionFloor, effectiveConclusionPair } from '../relatorio/conclusion.ts';
import { locationPathText } from '../relatorio/location-path.ts';
import { evaluateSheetMeasurements, worstMeasurements } from '../relatorio/measurement-evaluation.ts';
import { evaluateSheetReadings, worstReadings } from '../relatorio/readings.ts';
import { checklistResultOf } from '../relatorio/sheet-progress.ts';
import { enabledSubBlocksOf, isCellFilled } from '../relatorio/sheet-state.ts';
import { siteLocals, siteObservationOf, sitePointTitle, siteResultOf } from '../relatorio/site-checklist.ts';
import { locationTree, treeNodes, type TreeEquipmentNode } from '../relatorio/tree.ts';
import type { BlockRow, PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition, getSeed, siteItems } from '../seed/definitions.ts';

/*
 * Story 6.6 (FR-31, E3-A9 bullet 4): every equipment sheet marked Não ensaiado lists
 * itself in section 8, after the manual points, in tree order (the section 9 order of
 * `sheetOrder`), with its reason and the justification the seed prints for it (the typed
 * text for "Outro"). The entry is derived, never stored: clearing the mark takes it away,
 * and a live point with `origin: 'not_tested'` for the same equipment (written from that
 * sheet) replaces it. A block with no equipment is never suppressed.
 *
 * Story 22.5 (Bruno, 2026-11-06, item 26): three more kinds, derived the same way and in the
 * same tree order (a local's NC entries at the local, before its equipment):
 * - `nc`: one entry per checklist row answered NC, of a sheet or of a local's "Verificações do
 *   local", with the row's observation (the learned or seeded NC phrase, Story 14.12) and its
 *   photos as section 8's `[[foto]]` tokens ("conforme Imagem N");
 * - `reading`: one entry per test with a reading out of criterion, naming its worst row;
 * - `reprovado`: a sheet whose effective result is Reprovado (Story 22.4) for a reason the two
 *   above and the Não ensaiado entry do not cover (the engineer chose Reprovado).
 * A live point written from the same source replaces the entry (`origin` `nc` with its
 * `item_key`, `reading` with its `test_key`, `reprovado`), keyed by the equipment (or the
 * local, for a site NC); removing that point brings the entry back. A sheet with no equipment
 * is never suppressed. An old manual point does not suppress (`possibleDuplicatePoints`).
 */

export type DerivedPointKind = 'not_tested' | 'nc' | 'reading' | 'reprovado';

export interface DerivedPoint {
  /** Story 22.5: which source derives the entry. */
  kind: DerivedPointKind;
  /** Story 22.5: unique among the entries of a relatório (the card's key). */
  key: string;
  /** The sheet the entry comes from; null for a local's NC site item. */
  block_id: string | null;
  /** Story 22.5: the local of an NC site item's entry; null otherwise. */
  location_id: string | null;
  equipment_id: string | null;
  /** The TAG, else the type's name (the local's name for a site item): what "Abrir ficha ⟨TAG⟩" names. */
  name: string;
  /** "DJ-C14 · 1° Subsolo › Coluna 14": the TAG (else the type's name) and where it sits; a local's "1° Subsolo · Verificações do local". */
  title: string;
  /** The seed `not_tested_reasons` key; '' on the other kinds. */
  reason_key: string;
  /** The seed's label of the reason ("Impossibilidade de desligamento", "Outro"); '' on the other kinds. */
  reason_label: string;
  /** What section 8 prints for it: the seed's justification, or the typed text of "Outro"; null when there is none. */
  justification: string | null;
  /** Story 22.5: the entry's composed text (photo tokens included); on a Não ensaiado entry its band text. */
  text: string;
  /** Story 22.5: the checklist item of an `nc` entry; null otherwise. */
  item_key: string | null;
  /** Story 22.5: the test of a `reading` entry; null otherwise. */
  test_key: string | null;
}

const SEP = ' · ';

type TreeSnapshot = Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>;
type DerivedSnapshot = TreeSnapshot & Pick<RelatorioSnapshot, 'points' | 'relatorio' | 'files'>;

/** The seed's label and justification of a sheet's Não ensaiado reason; null when it was tested. */
function reasonOf(block: Pick<BlockRow, 'not_tested' | 'seed_version'>): { key: string; label: string; justification: string | null } | null {
  const mark = block.not_tested;
  if (mark === null) return null;
  const typed = mark.text !== null && mark.text.trim() !== '' ? mark.text.trim() : null;
  let seeded: { label: string; justification: string | null } | undefined;
  try {
    seeded = getSeed(block.seed_version, 'cabine_primaria').not_tested_reasons.find((reason) => reason.key === mark.reason);
  } catch {
    seeded = undefined;
  }
  return { key: mark.reason, label: seeded?.label ?? mark.reason, justification: seeded?.justification ?? typed };
}

/** The title of an equipment row as section 8 names it: "⟨TAG⟩ · ⟨path⟩", the TAG alone without a place. */
export function equipmentPointTitle(node: Pick<TreeEquipmentNode, 'name' | 'locationId'>, snapshot: Pick<RelatorioSnapshot, 'locations'>): string {
  const path = locationPathText(snapshot.locations, node.locationId);
  return path === '' ? node.name : `${node.name}${SEP}${path}`;
}

/** "Item 3 (mufla): oxidação nos terminais", the NC row as its entry names it; the label alone with "não conforme" when it holds no observation. */
function ncText(n: number, label: string, observation: string | null, photoIds: readonly string[]): string {
  const item = `Item ${n} (${label.toLocaleLowerCase('pt-BR')})`;
  // authored (Story 22.5, open for Bruno): an NC entry's text.
  const body = observation === null || observation === '' ? `${item} não conforme` : `${item}: ${observation}`;
  return [body, ...photoIds.map((id) => photoToken(id))].join(' ');
}

/** The photos of one checklist row, in section 7's order: its sheet's (or local's) photos tagged with its item key. */
function rowPhotoIds(photos: ReturnType<typeof livePhotos>, owner: { blockId: string } | { locationId: string }, itemKey: string): string[] {
  return photos
    .filter((photo) => photo.item_key === itemKey && ('blockId' in owner ? photo.block_id === owner.blockId : photo.block_id === null && (photo.location_id ?? null) === owner.locationId))
    .map((photo) => photo.id);
}

const base = { reason_key: '', reason_label: '', justification: null, item_key: null, test_key: null, location_id: null } as const;

/** The derived entries of one tested equipment sheet, in order: its NC rows, its out tests, then its Reprovado. */
function sheetEntries(block: BlockRow, node: TreeEquipmentNode, title: string, photos: ReturnType<typeof livePhotos>): DerivedPoint[] {
  const definition = findDefinition(block.seed_version, block.block_type);
  if (definition === null) return [];
  const out: DerivedPoint[] = [];
  const common = { block_id: block.id, equipment_id: block.equipment_id, name: node.name, title };
  if (definition.checklist !== null && enabledSubBlocksOf(block).has('checklist')) {
    definition.checklist.forEach((item, index) => {
      if (checklistResultOf(block, item.key) !== 'NC') return;
      const cell = block.sheet.checklist[item.key]?.observation;
      const observation = isCellFilled(cell) && typeof cell!.value === 'string' ? cell!.value.trim() : null;
      out.push({
        ...base,
        ...common,
        kind: 'nc',
        key: `nc:${block.id}:${item.key}`,
        item_key: item.key,
        text: ncText(index + 1, item.label, observation, rowPhotoIds(photos, { blockId: block.id }, item.key)),
      });
    });
  }
  const evaluations = evaluateSheetReadings(block, definition);
  const titles = new Map(evaluations.map((test) => [test.testKey as string, test.title]));
  const readings = worstReadings(evaluations).filter((reading) => reading.verdict === 'out');
  for (const reading of readings) {
    // authored (Story 22.5, open for Bruno): a reading entry's text, the ratio as its deviation.
    const value = reading.testKey === 'relacao_transformacao' ? `desvio de ${reading.valueText}` : reading.valueText;
    out.push({
      ...base,
      ...common,
      kind: 'reading',
      key: `reading:${block.id}:${reading.testKey}`,
      test_key: reading.testKey,
      text: `${titles.get(reading.testKey) ?? reading.testKey}: ${value} em ${reading.where} (critério: ${reading.criterionText})`,
    });
  }
  for (const reading of worstMeasurements(evaluateSheetMeasurements(block, definition))) {
    out.push({
      ...base,
      ...common,
      kind: 'reading',
      key: `reading:${block.id}:${reading.testKey}`,
      test_key: reading.testKey,
      text: `${reading.label}: ${reading.valueText} em ${reading.where} (critério: ${reading.criterionText})`,
    });
  }
  // A Reprovado the floor does not explain: the engineer's own choice.
  if (effectiveConclusionPair(block).result === 'reprovado' && conclusionFloor(block)?.pair.result !== 'reprovado') {
    const observation = isCellFilled(block.sheet.observations) && typeof block.sheet.observations!.value === 'string' ? block.sheet.observations!.value.trim() : '';
    out.push({
      ...base,
      ...common,
      kind: 'reprovado',
      key: `reprovado:${block.id}`,
      // authored (Story 22.5, open for Bruno): a Reprovado entry with no sheet observation.
      text: observation === '' ? 'Concluído como Reprovado na ficha' : observation,
    });
  }
  return out;
}

/** Every entry before suppression, in tree order. */
function allDerivedPoints(snapshot: DerivedSnapshot): DerivedPoint[] {
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  const locals = new Map(siteLocals(snapshot).map((location) => [location.id, location]));
  const items = locals.size === 0 ? [] : siteItems(snapshot.relatorio.seed_version);
  const photos = livePhotos(snapshot);
  const out: DerivedPoint[] = [];
  for (const node of treeNodes(locationTree(snapshot))) {
    if (node.kind !== 'equipment') {
      const local = locals.get(node.id);
      if (local === undefined) continue;
      for (const item of items) {
        if (siteResultOf(local, item.key) !== 'NC') continue;
        out.push({
          ...base,
          kind: 'nc',
          key: `nc:${local.id}:${item.key}`,
          block_id: null,
          location_id: local.id,
          equipment_id: null,
          name: local.name.trim(),
          title: sitePointTitle(local.name),
          item_key: item.key,
          text: ncText(item.number, item.label, siteObservationOf(local, item.key), rowPhotoIds(photos, { locationId: local.id }, item.key)),
        });
      }
      continue;
    }
    const block = blocks.get(node.blockId);
    if (block === undefined || block.removed_at !== null) continue;
    const title = equipmentPointTitle(node, snapshot);
    const reason = reasonOf(block);
    if (reason !== null) {
      out.push({
        ...base,
        kind: 'not_tested',
        key: `not_tested:${block.id}`,
        block_id: block.id,
        equipment_id: block.equipment_id,
        name: node.name,
        title,
        reason_key: reason.key,
        reason_label: reason.label,
        justification: reason.justification,
        text: derivedPointReasonText({ reason_key: reason.key, reason_label: reason.label, justification: reason.justification }),
      });
      continue;
    }
    out.push(...sheetEntries(block, node, title, photos));
  }
  return out;
}

/** The source a live point of a derived origin names: what it suppresses, null for a manual one or one with no owner. */
function pointSource(point: Pick<PointRow, 'origin' | 'equipment_id' | 'location_id' | 'item_key' | 'test_key'>): string | null {
  const owner = point.equipment_id ?? point.location_id ?? null;
  if (owner === null) return null;
  if (point.origin === 'not_tested') return point.equipment_id === null ? null : `not_tested:${point.equipment_id}`;
  if (point.origin === 'nc') return point.item_key == null ? null : `nc:${owner}:${point.item_key}`;
  if (point.origin === 'reading') return point.equipment_id === null || point.test_key == null ? null : `reading:${point.equipment_id}:${point.test_key}`;
  if (point.origin === 'reprovado') return point.equipment_id === null ? null : `reprovado:${point.equipment_id}`;
  return null;
}

/** An entry's source as a point names it; null when no point can replace it (a sheet with no equipment). */
function entrySource(entry: DerivedPoint): string | null {
  const owner = entry.equipment_id ?? entry.location_id;
  if (owner === null) return null;
  if (entry.kind === 'not_tested') return entry.equipment_id === null ? null : `not_tested:${entry.equipment_id}`;
  if (entry.kind === 'nc') return `nc:${owner}:${entry.item_key}`;
  if (entry.kind === 'reading') return entry.equipment_id === null ? null : `reading:${entry.equipment_id}:${entry.test_key}`;
  return entry.equipment_id === null ? null : `reprovado:${entry.equipment_id}`;
}

/** The derived section 8 entries of a relatório, in tree order, after suppression. */
export function derivedPoints(snapshot: DerivedSnapshot): DerivedPoint[] {
  const suppressed = new Set(
    snapshot.points.filter((point) => point.removed_at === null).flatMap((point) => {
      const source = pointSource(point);
      return source === null ? [] : [source];
    }),
  );
  return allDerivedPoints(snapshot).filter((entry) => {
    const source = entrySource(entry);
    return source === null || !suppressed.has(source);
  });
}

/**
 * Story 22.5: the live points written from a derived source (`nc`, `reading`, `reprovado`)
 * whose source no longer stands (the NC row set back to C, the reading corrected): they stay as
 * manual-like points, flagged "Origem resolvida" on the Pontos screen.
 */
export function resolvedOriginPoints(snapshot: DerivedSnapshot): Set<string> {
  const standing = new Set(allDerivedPoints(snapshot).flatMap((entry) => {
    const source = entrySource(entry);
    return source === null ? [] : [source];
  }));
  return new Set(
    snapshot.points
      .filter((point) => point.removed_at === null && (point.origin === 'nc' || point.origin === 'reading' || point.origin === 'reprovado'))
      .filter((point) => {
        const source = pointSource(point);
        return source !== null && !standing.has(source);
      })
      .map((point) => point.id),
  );
}

/**
 * Story 22.5: a manual point written before this story from an NC row (`origin` `manual`, no
 * source) does not suppress the NC entry of the same equipment or local; both are flagged
 * "Possível duplicado" on the Pontos screen and the engineer removes one. The manual points'
 * ids and the derived entries' keys, each paired with at least one of the other.
 */
export function possibleDuplicatePoints(snapshot: DerivedSnapshot): { pointIds: Set<string>; entryKeys: Set<string> } {
  const entries = derivedPoints(snapshot).filter((entry) => entry.kind === 'nc');
  const pointIds = new Set<string>();
  const entryKeys = new Set<string>();
  for (const point of snapshot.points) {
    if (point.removed_at !== null || point.origin !== 'manual') continue;
    const owner = point.equipment_id ?? point.location_id ?? null;
    if (owner === null) continue;
    const twins = entries.filter((entry) => (entry.equipment_id ?? entry.location_id) === owner);
    if (twins.length === 0) continue;
    pointIds.add(point.id);
    for (const twin of twins) entryKeys.add(twin.key);
  }
  return { pointIds, entryKeys };
}

export interface DerivedPointGroup {
  /** Story 22.5: the kind of the group's entries. */
  kind: DerivedPointKind;
  reason_key: string;
  justification: string | null;
  block_ids: string[];
  /** Story 22.5: the group's entries by `DerivedPoint.key`, in order. */
  keys: string[];
}

/**
 * E3-A9 bullet 4, the data half: consecutive Não ensaiado entries with the same reason and
 * the same justification form one group, so section 8 prints one bullet for them; Story
 * 22.5: every other entry is a group of its own. Composing that bullet's sentence is the
 * renderer's (Epic 7).
 */
export function groupDerivedPoints(entries: readonly DerivedPoint[]): DerivedPointGroup[] {
  const groups: DerivedPointGroup[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (entry.kind === 'not_tested' && last !== undefined && last.kind === 'not_tested' && last.reason_key === entry.reason_key && last.justification === entry.justification) {
      if (entry.block_id !== null) last.block_ids.push(entry.block_id);
      last.keys.push(entry.key);
    } else {
      groups.push({
        kind: entry.kind,
        reason_key: entry.reason_key,
        justification: entry.justification,
        block_ids: entry.block_id === null ? [] : [entry.block_id],
        keys: [entry.key],
      });
    }
  }
  return groups;
}

/**
 * The `.not-tested-band` text of a derived card (`72-pontos.html`): "⟨reason⟩ — ⟨justification⟩",
 * the typed text alone for "Outro", the reason alone when nothing is printed for it.
 */
export function derivedPointReasonText(entry: Pick<DerivedPoint, 'reason_key' | 'reason_label' | 'justification'>): string {
  if (entry.justification === null) return entry.reason_label;
  if (entry.reason_key === 'outro') return entry.justification;
  return `${entry.reason_label} — ${entry.justification}`;
}

// authored (Story 22.5, open for Bruno): the chip of a derived card, and the head of its section 8 bullet.
const KIND_LABELS: Readonly<Record<DerivedPointKind, string>> = {
  not_tested: 'Não ensaiado',
  nc: 'Não conforme',
  reading: 'Fora do critério',
  reprovado: 'Reprovado',
};

/** Story 22.5: the chip of a derived card ("Não ensaiado", "Não conforme", "Fora do critério", "Reprovado"). */
export function derivedPointKindLabel(kind: DerivedPointKind): string {
  return KIND_LABELS[kind];
}

/** The text a point written from an untested sheet starts with: what section 8 would print for it; "" when nothing. */
export function notTestedPointText(block: Pick<BlockRow, 'not_tested' | 'seed_version'>): string {
  return reasonOf(block)?.justification ?? '';
}

/**
 * Story 22.5: a text followed by the token of every photo it does not cite yet (a photo taken
 * just before the tap is not in the snapshot the text was composed from); the tokens alone with
 * no text, what "Criar ponto de atenção" on an NC row starts the point with.
 */
export function withPhotoTokens(text: string | null, photoIds: readonly string[]): string {
  const base = text ?? '';
  const missing = photoIds.filter((id) => !base.includes(photoToken(id))).map((id) => photoToken(id));
  return [base, ...missing].filter((part) => part !== '').join(' ');
}

/**
 * Story 22.5: what a point written from a derived entry starts with ("Editar" on the entry):
 * its text, its origin and source, its equipment or local.
 */
export function derivedPointSeed(entry: DerivedPoint): {
  text: string;
  equipmentId: string | null;
  locationId: string | null;
  origin: PointRow['origin'];
  itemKey: string | null;
  testKey: string | null;
} {
  return {
    text: entry.kind === 'not_tested' ? (entry.justification ?? '') : entry.text,
    equipmentId: entry.equipment_id,
    locationId: entry.location_id,
    origin: entry.kind,
    itemKey: entry.item_key,
    testKey: entry.test_key,
  };
}
