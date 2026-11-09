import { photoToken } from './refs.ts';
import { livePhotos } from '../photos/order.ts';
import { conclusionFloor, effectiveConclusionPair, restrictedItems } from '../relatorio/conclusion.ts';
import { locationPathText } from '../relatorio/location-path.ts';
import { worstMeasurements } from '../relatorio/measurement-evaluation.ts';
import { worstReadings } from '../relatorio/readings.ts';
import { failedPrerequisites } from '../relatorio/restriction.ts';
import { sheetMeasurements, sheetReadings } from '../relatorio/sheet-evaluation.ts';
import { checklistResultOf } from '../relatorio/sheet-progress.ts';
import { enabledSubBlocksOf, isCellFilled } from '../relatorio/sheet-state.ts';
import { siteLocals, siteObservationOf, sitePointTitle, siteResultOf } from '../relatorio/site-checklist.ts';
import { locationTree, treeNodes, type TreeEquipmentNode } from '../relatorio/tree.ts';
import { visitContextOf, type VisitContext } from '../relatorio/visit-context.ts';
import type { BlockRow, PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, getSeed, siteItems, snapshotDefinitionContext, type DefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { recommendedPointText, testRecommendationOf } from '../seed/test-help.ts';

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
 * Story 23.11 (batch e23h): a `reading` entry starts with its test's recommendation, when the
 * definition gives one (`recommendedPointText`); the `reprovado` and `nc` texts never do.
 * A live point written from the same source replaces the entry (`origin` `nc` with its
 * `item_key`, `reading` with its `test_key`, `reprovado`), keyed by the equipment (or the
 * local, for a site NC); removing that point brings the entry back. A sheet with no equipment
 * is never suppressed. An old manual point does not suppress (`possibleDuplicatePoints`).
 *
 * Batch e23v (Story 23.6, seed v13; contract 36): one more kind, `restricao`, one entry per test with
 * a reading restricted by its test's rule (`relatorio/restriction.ts`) and no `reading` entry of its
 * own, naming the restricted rows with their reasons; a point written from it carries `origin`
 * `restricao` with its `test_key` and replaces it. A test whose plate fails its prerequisite (the
 * arrester's disconnector) has it in its `reading` entry, one entry per test. Every sheet is judged
 * under its `VisitContext` (`visitContextOf`), as the sheet and the conclusion judge it.
 */

export type DerivedPointKind = 'not_tested' | 'nc' | 'reading' | 'reprovado' | 'restricao';

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
  /** Story 22.5: the test of a `reading` entry (batch e23v: or a `restricao` one); null otherwise. */
  test_key: string | null;
}

const SEP = ' · ';

type TreeSnapshot = Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>;
type DerivedSnapshot = TreeSnapshot & Pick<RelatorioSnapshot, 'points' | 'relatorio' | 'files' | 'equipment_types'>;

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

/** The derived entries of one tested equipment sheet, in order: its NC rows, its out tests, its restricted tests (batch e23v), then its Reprovado. */
function sheetEntries(
  block: BlockRow,
  definition: BlockDefinition | null,
  node: TreeEquipmentNode,
  title: string,
  photos: ReturnType<typeof livePhotos>,
  ctx: DefinitionContext,
  visit: VisitContext,
  standing?: Set<string>,
): DerivedPoint[] {
  if (definition === null) return [];
  const out: DerivedPoint[] = [];
  const common = { block_id: block.id, equipment_id: block.equipment_id, name: node.name, title };
  if (definition.checklist !== null && enabledSubBlocksOf(block).has('checklist')) {
    definition.checklist.forEach((item, index) => {
      if (checklistResultOf(block, item.key, ctx) !== 'NC') return;
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
  const evaluations = sheetReadings(block, definition, visit);
  const readings = worstReadings(evaluations).filter((reading) => reading.verdict === 'out');
  // Batch e23v (Story 23.6): a failed prerequisite is its test's `reading` entry, with the test's worst out reading when it has one.
  // Fix batch e23w (W2-2): read over every test that names one (`failedPrerequisites`), its sub-block off or NA by the plate too.
  const prerequisites = failedPrerequisites(block, definition);
  const failed = new Map(prerequisites.map((one) => [one.testKey as string, one.text] as const));
  const titles = new Map([...prerequisites.map((one) => [one.testKey as string, one.title] as const), ...evaluations.map((test) => [test.testKey as string, test.title] as const)]);
  // The tests with an entry, in the definition's order: an evaluated one, or one that fails its prerequisite while off or NA.
  const entryTests = definition.tests.filter((test) => failed.has(test.key) || evaluations.some((one) => one.testKey === test.key)).map((test) => test.key as string);
  const withEntry = new Set<string>();
  for (const testKey of entryTests) {
    const reading = readings.find((one) => one.testKey === testKey);
    const prerequisite = failed.get(testKey) ?? null;
    if (reading === undefined && prerequisite === null) continue;
    withEntry.add(testKey);
    // authored (Story 22.5, open for Bruno): a reading entry's text, the ratio as its deviation.
    const value = reading === undefined ? null : reading.testKey === 'relacao_transformacao' ? `desvio de ${reading.valueText}` : reading.valueText;
    // Fix batch e23w (B-6): a pole out by its rise since the previous visit names the rise.
    const outText = reading === undefined ? null : `${value} em ${reading.where} (${reading.rise ?? `critério: ${reading.criterionText}`})`;
    out.push({
      ...base,
      ...common,
      kind: 'reading',
      key: `reading:${block.id}:${testKey}`,
      test_key: testKey,
      // authored (Story 23.6, listed for Bruno): a failed prerequisite before the out reading, "; " between them.
      // authored (Story 23.11, open for Bruno): the test's recommendation first, when it has one (`recommendedPointText`);
      // a `reading` entry is a failed test (an out reading, a failed prerequisite, or both), never a `restricao` one.
      text: recommendedPointText(
        testRecommendationOf({ tests: definition.tests }, testKey),
        `${titles.get(testKey) ?? testKey}: ${[prerequisite, outText].filter((part): part is string => part !== null).join('; ')}`,
      ),
    });
  }
  for (const reading of worstMeasurements(sheetMeasurements(block, definition))) {
    out.push({
      ...base,
      ...common,
      kind: 'reading',
      key: `reading:${block.id}:${reading.testKey}`,
      test_key: reading.testKey,
      // authored (Story 23.11, open for Bruno): as above, in the measurement grammar.
      text: recommendedPointText(
        testRecommendationOf({ tests: [], measurement_tests: definition.measurement_tests }, reading.testKey),
        `${reading.label}: ${reading.valueText} em ${reading.where} (critério: ${reading.criterionText})`,
      ),
    });
  }
  // Fix batch e23w (W2-3): a test's restriction stands while it has a restricted reading or a rule still flags one now out
  // (`restrictionStands`); the entries are unchanged, only `resolvedOriginPoints` reads this.
  if (standing !== undefined && block.equipment_id !== null) {
    for (const test of evaluations) {
      if (test.restrictionStands === true || restrictedItems(test).length > 0) standing.add(`restricao:${block.equipment_id}:${test.testKey}`);
    }
  }
  // Batch e23v (Story 23.6, seed v13): one entry per test with a restricted reading and no `reading` entry.
  for (const test of evaluations) {
    if (withEntry.has(test.testKey)) continue;
    const items = restrictedItems(test);
    if (items.length === 0) continue;
    out.push({
      ...base,
      ...common,
      kind: 'restricao',
      key: `restricao:${block.id}:${test.testKey}`,
      test_key: test.testKey,
      // authored (Story 23.6, listed for Bruno): a restricted test's entry, its rows with their reasons.
      text: `${test.title}: valor dentro do critério, com restrição (${items.join('; ')})`,
    });
  }
  // A Reprovado the floor does not explain: the engineer's own choice.
  if (effectiveConclusionPair(block, definition, visit).result === 'reprovado' && conclusionFloor(block, definition, visit)?.pair.result !== 'reprovado') {
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

/** Every entry before suppression, in tree order. Fix batch e23w (W2-3): `standing` collects the restricted tests' sources that stand. */
function allDerivedPoints(snapshot: DerivedSnapshot, standing?: Set<string>): DerivedPoint[] {
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  const locals = new Map(siteLocals(snapshot).map((location) => [location.id, location]));
  const items = locals.size === 0 ? [] : siteItems(snapshot.relatorio.seed_version);
  const photos = livePhotos(snapshot);
  const ctx = snapshotDefinitionContext(snapshot);
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
    out.push(...sheetEntries(block, blockDefinitionIn(ctx, block), node, title, photos, ctx, visitContextOf(snapshot, block), standing));
  }
  return out;
}

/** The source a live point of a derived origin names: what it suppresses, null for a manual one or one with no owner. */
function pointSource(point: Pick<PointRow, 'origin' | 'equipment_id' | 'location_id' | 'item_key' | 'test_key'>): string | null {
  const owner = point.equipment_id ?? point.location_id ?? null;
  if (owner === null) return null;
  if (point.origin === 'not_tested') return point.equipment_id === null ? null : `not_tested:${point.equipment_id}`;
  // e22f N4: a point that names a checklist item replaces that item's NC entry whatever its
  // origin (an `nc` one, or a manual one carrying the item).
  if (point.origin === 'nc' || point.origin === 'manual') return point.item_key == null ? null : `nc:${owner}:${point.item_key}`;
  if (point.origin === 'reading') return point.equipment_id === null || point.test_key == null ? null : `reading:${point.equipment_id}:${point.test_key}`;
  if (point.origin === 'reprovado') return point.equipment_id === null ? null : `reprovado:${point.equipment_id}`;
  // Batch e23v (Story 23.6): a point written from a restricted test's entry.
  if (point.origin === 'restricao') return point.equipment_id === null || point.test_key == null ? null : `restricao:${point.equipment_id}:${point.test_key}`;
  return null;
}

/** An entry's source as a point names it; null when no point can replace it (a sheet with no equipment). */
function entrySource(entry: DerivedPoint): string | null {
  const owner = entry.equipment_id ?? entry.location_id;
  if (owner === null) return null;
  if (entry.kind === 'not_tested') return entry.equipment_id === null ? null : `not_tested:${entry.equipment_id}`;
  if (entry.kind === 'nc') return `nc:${owner}:${entry.item_key}`;
  if (entry.kind === 'reading') return entry.equipment_id === null ? null : `reading:${entry.equipment_id}:${entry.test_key}`;
  if (entry.kind === 'restricao') return entry.equipment_id === null ? null : `restricao:${entry.equipment_id}:${entry.test_key}`;
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
  // Fix batch e23w (W2-3): a `restricao` source stands while its test has a restricted reading or a rule flags one now out.
  const restricted = new Set<string>();
  const standing = new Set(allDerivedPoints(snapshot, restricted).flatMap((entry) => {
    const source = entrySource(entry);
    return source === null ? [] : [source];
  }));
  for (const source of restricted) standing.add(source);
  return new Set(
    snapshot.points
      .filter((point) => point.removed_at === null && (point.origin === 'nc' || point.origin === 'reading' || point.origin === 'reprovado' || point.origin === 'restricao'))
      .filter((point) => {
        const source = pointSource(point);
        return source !== null && !standing.has(source);
      })
      .map((point) => point.id),
  );
}

/**
 * e22f N4: a point row written before contract 31. From contract 31 on, `newPointRow` writes
 * `item_key` on every point (null when the point names no item), so a row without the key at all
 * was created by an older client: the only kind that can be an NC row's point with no source.
 */
export function predatesItemSource(point: Pick<PointRow, 'item_key'>): boolean {
  return !Object.prototype.hasOwnProperty.call(point, 'item_key');
}

/** The (manual point, NC entry) pairs of one owner: what "Possível duplicado" flags. */
function duplicatePairs(snapshot: DerivedSnapshot): { pointId: string; entryKey: string }[] {
  const entries = derivedPoints(snapshot).filter((entry) => entry.kind === 'nc');
  if (entries.length === 0) return [];
  const pairs: { pointId: string; entryKey: string }[] = [];
  for (const point of snapshot.points) {
    // e22f N4: only a manual point written before contract 31 (no `item_key` key): one written
    // since names its item when it comes from an NC row, so it never pairs by its owner alone.
    if (point.removed_at !== null || point.origin !== 'manual' || !predatesItemSource(point)) continue;
    const owner = point.equipment_id ?? point.location_id ?? null;
    if (owner === null) continue;
    for (const entry of entries) if ((entry.equipment_id ?? entry.location_id) === owner) pairs.push({ pointId: point.id, entryKey: entry.key });
  }
  return pairs;
}

/**
 * Story 22.5: a manual point written before this story from an NC row (`origin` `manual`, no
 * source) does not suppress the NC entry of the same equipment or local; both are flagged
 * "Possível duplicado" on the Pontos screen and the engineer removes one. The manual points'
 * ids and the derived entries' keys, each paired with at least one of the other. e22f N4: only
 * the manual points written before contract 31 (`predatesItemSource`) pair.
 */
export function possibleDuplicatePoints(snapshot: DerivedSnapshot): { pointIds: Set<string>; entryKeys: Set<string> } {
  const pairs = duplicatePairs(snapshot);
  return { pointIds: new Set(pairs.map((pair) => pair.pointId)), entryKeys: new Set(pairs.map((pair) => pair.entryKey)) };
}

/** e22f S2: how many (manual point, NC entry) pairs "Possível duplicado" flags; the pre-issue row's count. */
export function possibleDuplicatePairs(snapshot: DerivedSnapshot): number {
  return duplicatePairs(snapshot).length;
}

/** e22f S2: the pre-issue row: "1 par de pontos possivelmente duplicados", "3 pares de …". */
export function possibleDuplicatesText(pairs: number): string {
  // authored (e22f S2, open for Bruno).
  return `${pairs} ${pairs === 1 ? 'par de pontos possivelmente duplicados' : 'pares de pontos possivelmente duplicados'}`;
}

/**
 * e22f S4: the text "Criar ponto de atenção" on an NC row starts the point with: the row's
 * derived entry text ("Item 3 (mufla): oxidação nos terminais" and the row's photo tokens), as
 * "Editar" on that entry starts it (`derivedPointSeed`). `owner` is the sheet or the local. ''
 * when the row's seed item is unknown.
 */
export function ncRowPointText(snapshot: Pick<RelatorioSnapshot, 'files' | 'relatorio' | 'equipment_types'>, owner: { block: BlockRow } | { location: Parameters<typeof siteObservationOf>[0] & { id: string } }, itemKey: string): string {
  const photos = livePhotos(snapshot);
  if ('block' in owner) {
    const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), owner.block);
    const index = definition?.checklist?.findIndex((item) => item.key === itemKey) ?? -1;
    if (definition === null || index < 0) return '';
    const cell = owner.block.sheet.checklist[itemKey]?.observation;
    const observation = isCellFilled(cell) && typeof cell!.value === 'string' ? cell!.value.trim() : null;
    return ncText(index + 1, definition.checklist![index]!.label, observation, rowPhotoIds(photos, { blockId: owner.block.id }, itemKey));
  }
  const item = siteItems(snapshot.relatorio.seed_version).find((row) => row.key === itemKey);
  if (item === undefined) return '';
  return ncText(item.number, item.label, siteObservationOf(owner.location, itemKey), rowPhotoIds(photos, { locationId: owner.location.id }, itemKey));
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
// authored (Story 23.6, listed for Bruno): `restricao`.
const KIND_LABELS: Readonly<Record<DerivedPointKind, string>> = {
  not_tested: 'Não ensaiado',
  nc: 'Não conforme',
  reading: 'Fora do critério',
  reprovado: 'Reprovado',
  restricao: 'Com restrição',
};

/** Story 22.5: the chip of a derived card ("Não ensaiado", "Não conforme", "Fora do critério", "Reprovado"; batch e23v: "Com restrição"). */
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
