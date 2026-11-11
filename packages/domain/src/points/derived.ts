import { photoToken } from './refs.ts';
import { livePhotos } from '../photos/order.ts';
import { conclusionFloor, effectiveConclusionPair, restrictedItems, restrictedPointItems } from '../relatorio/conclusion.ts';
import { locationPathText } from '../relatorio/location-path.ts';
import { restrictedMeasurements, worstMeasurements, type MeasurementTestEvaluation } from '../relatorio/measurement-evaluation.ts';
import type { TestEvaluation } from '../relatorio/reading-cells.ts';
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
import { blockDefinitionIn, getSeed, seedRule, siteItems, snapshotDefinitionContext, type DefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { recommendationCount, recommendationsText, recommendedPointText, testIndexRecommendationOf, testRecommendationOf } from '../seed/test-help.ts';
import { livePoints } from './checks.ts';
import { TEXT_CAPS } from '../ops/value-limits.ts';

/*
 * Fix batch e24h (Matheus, 2026-11-10, on Bruno's report of points created with no tap): a point of
 * attention exists only when the technician creates it. The entries below are the ficha findings a
 * point can be written from (an NC row of a sheet or a local, a test out of criterion or failing its
 * prerequisite, a restricted test, a Reprovado chosen by hand, a sheet marked Não ensaiado); they are
 * never listed, counted or printed. Two readers keep them, and neither may move: the parecer's floor
 * (`hasPointSource`, so no verdict changes) and "Origem resolvida" (`resolvedOriginPoints`, a stored
 * point whose finding no longer stands). How automatic points should work is planned later (Epic 24).
 *
 * History of the findings, each once a listed entry (struck by e24h):
 * - Story 6.6 (FR-31, E3-A9 bullet 4): a sheet marked Não ensaiado, with its reason and the
 *   justification the seed prints for it (the typed text for "Outro").
 * - Story 22.5 (Bruno, 2026-11-06, item 26): `nc`, one per checklist row answered NC of a sheet or of a
 *   local's "Verificações do local", with the row's observation and photo tokens; `reading`, one per test
 *   with a reading out of criterion, naming its worst row; `reprovado`, a sheet whose effective result is
 *   Reprovado for a reason the floor does not cover (the engineer chose Reprovado).
 * - Story 23.11 (batch e23h), fix batch e23z: a `reading` (and a `reprovado`) text starts with its test's
 *   recommendation (`recommendedPointText`); a failed polarization index with its `index_recommendation`.
 * - Batch e23v (Story 23.6, seed v13; contract 36): `restricao`, one per test with a reading restricted by
 *   its test's rule and no `reading` finding of its own; a failed prerequisite is its test's `reading`.
 * A stored point names its finding by `origin` with its `item_key` or `test_key`, keyed by the equipment (or
 * the local, for a site NC): `pointSource` and `entrySource` pair them. Every sheet is judged under its
 * `VisitContext` (`visitContextOf`), as the sheet and the conclusion judge it.
 */

type DerivedPointKind = 'not_tested' | 'nc' | 'reading' | 'reprovado' | 'restricao';

interface DerivedPoint {
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
  /**
   * Batch e24p (Story 24.17): the finding alone, before any recommendation: `text` is
   * `recommendedPointText(recommendations, finding)`, so on every kind but `reading` and
   * `reprovado` (which carry no recommendation) it equals `text`.
   */
  finding: string;
  /** Batch e24p (Story 24.17): the recommendations `text` starts with, as Story 23.11 picks them (blank ones and repeats kept, the join drops them). */
  recommendations: readonly (string | null)[];
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

const base = { reason_key: '', reason_label: '', justification: null, item_key: null, test_key: null, location_id: null, recommendations: [] } as const;

/**
 * Batch e24p (Story 24.17): an entry's three texts from its finding and recommendations: `text` is
 * Story 23.11's form (`recommendedPointText`), byte-equal to what it was; `finding` the finding alone.
 */
function texts(finding: string, recommendations: readonly (string | null)[] = []): Pick<DerivedPoint, 'text' | 'finding' | 'recommendations'> {
  return { text: recommendedPointText(recommendations, finding), finding, recommendations };
}

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
        ...texts(ncText(index + 1, item.label, observation, rowPhotoIds(photos, { blockId: block.id }, item.key))),
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
    // Batch e23t (Story 23.16): an IP out of its class fails the test too, named after its out reading.
    const test = evaluations.find((one) => one.testKey === testKey);
    const index = (test?.indexOut ?? []).map((one) => `${one.valueText} em ${one.where} (critério: ${one.criterionText})`);
    // Batch e23e (Story 23.18): a failed choice (a polarity INVERTIDA) fails the test too; authored (Story 23.18, listed for Bruno): "polaridade invertida em Fase R".
    const choice = (test?.choiceOut ?? []).map((one) => `${one.text} em ${one.where}`);
    if (reading === undefined && prerequisite === null && index.length === 0 && choice.length === 0) continue;
    withEntry.add(testKey);
    // authored (Story 22.5, open for Bruno): a reading entry's text, the ratio as its deviation.
    const value = reading === undefined ? null : reading.testKey === 'relacao_transformacao' ? `desvio de ${reading.valueText}` : reading.valueText;
    // Fix batch e23w (B-6): a pole out by its rise since the previous visit names the rise.
    const outText = reading === undefined ? null : `${value} em ${reading.where} (${reading.rise ?? `critério: ${reading.criterionText}`})`;
    // Fix batch e23z (W3-7): the test's recommendation for a failed reading, prerequisite or choice; for a failed IP its
    // `index_recommendation` (the base's IP row), else the same recommendation; each once.
    const recommendation = testRecommendationOf({ tests: definition.tests }, testKey);
    const recommendations = [
      reading !== undefined || prerequisite !== null || choice.length > 0 ? recommendation : null,
      index.length > 0 ? (testIndexRecommendationOf({ tests: definition.tests }, testKey) ?? recommendation) : null,
    ];
    out.push({
      ...base,
      ...common,
      kind: 'reading',
      key: `reading:${block.id}:${testKey}`,
      test_key: testKey,
      // authored (Story 23.6, listed for Bruno): a failed prerequisite before the out reading, "; " between them.
      // authored (Story 23.11, open for Bruno): the test's recommendation first, when it has one (`recommendedPointText`);
      // a `reading` entry is a failed test (an out reading, a failed prerequisite, or both), never a `restricao` one.
      ...texts(`${titles.get(testKey) ?? testKey}: ${[prerequisite, outText, ...index, ...choice].filter((part): part is string => part !== null).join('; ')}`, recommendations),
    });
  }
  // Batch e23t (Story 23.15): the measurement tests judged under the same visit context.
  const measurements = sheetMeasurements(block, definition, visit);
  for (const reading of worstMeasurements(measurements)) {
    out.push({
      ...base,
      ...common,
      kind: 'reading',
      key: `reading:${block.id}:${reading.testKey}`,
      test_key: reading.testKey,
      // authored (Story 23.11, open for Bruno): as above, in the measurement grammar.
      ...texts(`${reading.label}: ${reading.valueText} em ${reading.where} (critério: ${reading.criterionText})`, [
        testRecommendationOf({ tests: [], measurement_tests: definition.measurement_tests }, reading.testKey),
      ]),
    });
  }
  // Fix batch e23w (W2-3): a test's restriction stands while it has a restricted reading or a rule still flags one now out
  // (`restrictionStands`); the entries are unchanged, only `resolvedOriginPoints` reads this.
  if (standing !== undefined && block.equipment_id !== null) {
    for (const test of evaluations) {
      if (test.restrictionStands === true || restrictedItems(test).length > 0) standing.add(`restricao:${block.equipment_id}:${test.testKey}`);
    }
    // Fix batch e23z (W3-1): the same for the measurement tests, a restricted cell standing beside an out one too.
    for (const test of restrictedMeasurements(measurements)) standing.add(`restricao:${block.equipment_id}:${test.testKey}`);
    for (const test of liveMeasurements(measurements)) if (test.restrictionStands === true) standing.add(`restricao:${block.equipment_id}:${test.testKey}`);
  }
  // Batch e23v (Story 23.6, seed v13): one entry per test with a restricted reading and no `reading` entry.
  for (const test of evaluations) {
    if (withEntry.has(test.testKey)) continue;
    // Fix batch e23p (P3): the point names the history rule's two corrected values.
    const items = restrictedPointItems(test);
    if (items.length === 0) continue;
    out.push({
      ...base,
      ...common,
      kind: 'restricao',
      key: `restricao:${block.id}:${test.testKey}`,
      test_key: test.testKey,
      // authored (Story 23.6, listed for Bruno): a restricted test's entry, its rows with their reasons.
      ...texts(`${test.title}: valor dentro do critério, com restrição (${items.join('; ')})`),
    });
  }
  // Batch e23t (Stories 23.15 and 23.19): one entry per measurement test with a restricted cell and no out cell.
  for (const test of restrictedMeasurements(measurements)) {
    if (test.hasOut) continue;
    out.push({
      ...base,
      ...common,
      kind: 'restricao',
      key: `restricao:${block.id}:${test.testKey}`,
      test_key: test.testKey,
      // authored (Story 23.6's wording, batch e23t): a restricted test's entry, its cells with their reasons.
      ...texts(`${test.label}: valor dentro do critério, com restrição (${test.pointItems.join('; ')})`),
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
      // Fix batch e23z (item 2, Bruno 2026-11-09; authored (e23z, listed for Bruno)): the in-force tests' recommendations
      // first (`reprovadoRecommendations`), as a `reading` entry starts with its test's.
      ...texts(observation === '' ? 'Concluído como Reprovado na ficha' : observation, reprovadoRecommendations(definition, evaluations, measurements)),
    });
  }
  return out;
}

/** Fix batch e23z: the measurement tests that count (switched on, run, not NA by the plate), as `liveTests` reads them. */
function liveMeasurements(measurements: readonly MeasurementTestEvaluation[]): MeasurementTestEvaluation[] {
  return measurements.filter((test) => test.enabled && !test.skipped && test.applicability.state !== 'na');
}

/**
 * Fix batch e23z (item 2, Bruno's answer of 2026-11-09 to Story 23.11): what a Reprovado chosen by hand starts with.
 * The restricted tests' recommendations when any in-force test is restricted (the sheet's identifiable reason), else
 * every in-force test's, in definition order (the seeded grammars, then the measurement tests); `recommendedPointText`
 * keeps each once. None on a sheet whose tests carry none (every seeded type), so its text is byte-equal to before.
 */
function reprovadoRecommendations(definition: BlockDefinition, evaluations: readonly TestEvaluation[], measurements: readonly MeasurementTestEvaluation[]): (string | null)[] {
  const live = liveMeasurements(measurements);
  const restrictedTables = new Set(restrictedMeasurements(measurements).map((test) => test.testKey as string));
  const restricted = new Set([...evaluations.filter((test) => restrictedItems(test).length > 0).map((test) => test.testKey as string), ...restrictedTables]);
  const inForce = [...evaluations.map((test) => test.testKey as string), ...live.map((test) => test.testKey as string)];
  const picked = restricted.size > 0 ? inForce.filter((key) => restricted.has(key)) : inForce;
  const order = [...definition.tests.map((test) => test.key as string), ...(definition.measurement_tests ?? []).map((test) => test.key as string)];
  return order.filter((key) => picked.includes(key)).map((key) => testRecommendationOf({ tests: definition.tests, measurement_tests: definition.measurement_tests }, key));
}

/** Every finding, in tree order (fix batch e24h: no longer filtered by the stored points, nothing lists them). Fix batch e23w (W2-3): `standing` collects the restricted tests' sources that stand. */
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
          ...texts(ncText(item.number, item.label, siteObservationOf(local, item.key), rowPhotoIds(photos, { locationId: local.id }, item.key))),
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
        ...texts(reasonText({ reason_key: reason.key, reason_label: reason.label, justification: reason.justification })),
      });
      continue;
    }
    out.push(...sheetEntries(block, blockDefinitionIn(ctx, block), node, title, photos, ctx, visitContextOf(snapshot, block), standing));
  }
  return out;
}

/** The finding a live point of a derived origin was written from, null for a manual one or one with no owner. */
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

/**
 * Fix batch e24x (D5): one point per test (Story 24.17). A `reading` and a `restricao` source of the
 * same equipment and test are that test's one point for "Criar ponto de atenção": a point written while
 * the test was restricted names the place once a reading goes out, and the other way round.
 */
function testSource(source: string | null): string | null {
  return source === null ? null : source.replace(/^(reading|restricao):/, 'test:');
}

/** A finding as a point names it; null when no point can name it (a sheet with no equipment). */
function entrySource(entry: DerivedPoint): string | null {
  const owner = entry.equipment_id ?? entry.location_id;
  if (owner === null) return null;
  if (entry.kind === 'not_tested') return entry.equipment_id === null ? null : `not_tested:${entry.equipment_id}`;
  if (entry.kind === 'nc') return `nc:${owner}:${entry.item_key}`;
  if (entry.kind === 'reading') return entry.equipment_id === null ? null : `reading:${entry.equipment_id}:${entry.test_key}`;
  if (entry.kind === 'restricao') return entry.equipment_id === null ? null : `restricao:${entry.equipment_id}:${entry.test_key}`;
  return entry.equipment_id === null ? null : `reprovado:${entry.equipment_id}`;
}

/** Batch e24p (Story 24.17): a finding of one sheet that "Criar ponto de atenção" on a test or on the Conclusão step starts a point from. */
export interface SheetPointFinding {
  /** The point's origin: a test that fails, a test with a restricted reading and no failure, a Reprovado the technician chose. */
  origin: 'reading' | 'restricao' | 'reprovado';
  /** The test the point names (`test_key`); null for a chosen Reprovado. */
  testKey: string | null;
  /**
   * Where the action sits: under its test when the test's section is drawn (its sub-block on, the
   * test evaluated or behind its "Não se aplica" band, or a measurement test); on the Conclusão step
   * for a chosen Reprovado and for a failed prerequisite whose test is switched off.
   */
  place: 'test' | 'conclusao';
  /** What the point's text starts with: the finding alone on seed v14, else Story 23.11's form (the recommendations first). */
  text: string;
  /** What its "Ação recomendada" starts with: on seed v14 the recommendations joined; '' otherwise or with none. */
  action: string;
  /** The helper under the action while it holds the recommendations ("Da recomendação do ensaio · editável"); null with none. */
  actionHelper: string | null;
  /** The section 8 positions of the live points written from this finding (its origin, test and equipment): with one, the action is not offered. */
  positions: number[];
}

/** `60-ficha.html` `#ficha-dlg-ponto-editor`: the helper under a seeded action, one recommendation and two or more. */
const ACTION_HELPER_ONE = 'Da recomendação do ensaio · editável';
const ACTION_HELPER_MANY = 'Das recomendações dos ensaios · editável';

/**
 * Batch e24p (Story 24.17, every seed): the findings of one sheet a point can be created from by a
 * tap, in the order the findings are computed (its failed tests in definition order, its measurement
 * tests, its restricted tests, then a chosen Reprovado): one per test, because one point stands for
 * one test, and none for an NC row (its own row offers it) or a sheet marked Não ensaiado (read-only;
 * its band offers it). Nothing is stored here: the tap opens the editor with `text` and `action`, and
 * the point is written when it closes. On seed v14 (`recommendation_as_action`) the text is the
 * finding alone and the action the test's recommendations (the index recommendation for a failed
 * polarization index; for a chosen Reprovado its tests', `reprovadoRecommendations`); on v1 to v13
 * the text is Story 23.11's (the recommendations first) and the action empty. A restricted test
 * starts with no recommendation on any seed. `positions` names the live points already written from
 * the finding (paired as "Origem resolvida" pairs them, `pointSource`).
 */
export function sheetPointFindings(snapshot: DerivedSnapshot, blockId: string): SheetPointFinding[] {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  if (block === undefined || block.removed_at !== null || block.not_tested !== null || block.equipment_id === null) return [];
  const node = treeNodes(locationTree(snapshot)).find((one): one is TreeEquipmentNode => one.kind === 'equipment' && one.blockId === blockId);
  if (node === undefined) return [];
  const ctx = snapshotDefinitionContext(snapshot);
  const definition = blockDefinitionIn(ctx, block);
  if (definition === null) return [];
  const entries = sheetEntries(block, definition, node, equipmentPointTitle(node, snapshot), livePhotos(snapshot), ctx, visitContextOf(snapshot, block));
  const asAction = seedRule(block.seed_version, 'recommendation_as_action');
  const enabled = enabledSubBlocksOf(block);
  const measured = new Set((definition.measurement_tests ?? []).map((test) => test.key as string));
  const live = livePoints(snapshot.points);
  return entries.flatMap((entry): SheetPointFinding[] => {
    if (entry.kind !== 'reading' && entry.kind !== 'restricao' && entry.kind !== 'reprovado') return [];
    const source = testSource(entrySource(entry));
    const positions = live.flatMap((point, i) => (source !== null && testSource(pointSource(point)) === source ? [i + 1] : []));
    const testKey = entry.kind === 'reprovado' ? null : entry.test_key;
    const place = testKey !== null && (measured.has(testKey) || enabled.has(testKey)) ? 'test' : 'conclusao';
    const count = recommendationCount(entry.recommendations);
    if (!asAction || count === 0) return [{ origin: entry.kind, testKey, place, text: entry.text, action: '', actionHelper: null, positions }];
    const action = recommendationsText(entry.recommendations);
    // Fix batch e24x (D2): past the action's cap the recommendations start the text instead (Story 23.11's form), or,
    // past the text's cap too, the finding stands alone; "Concluir" never stores a create the server refuses.
    if (action.length > TEXT_CAPS.medium) return [{ origin: entry.kind, testKey, place, text: entry.text.length <= TEXT_CAPS.long ? entry.text : entry.finding, action: '', actionHelper: null, positions }];
    return [{ origin: entry.kind, testKey, place, text: entry.finding, action, actionHelper: count === 1 ? ACTION_HELPER_ONE : ACTION_HELPER_MANY, positions }];
  });
}

/**
 * Fix batch e24h: whether the relatório holds any ficha finding a point can be written from, stored
 * point or not. Only the parecer's floor reads it (`derivedParecer`), so no verdict moves now that the
 * findings are no longer points: a finding raised the verdict to Apto com restrições through the
 * automatic entry before, and still does through this.
 */
export function hasPointSource(snapshot: DerivedSnapshot): boolean {
  return allDerivedPoints(snapshot).length > 0;
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

/**
 * e22f S4: the text "Criar ponto de atenção" on an NC row starts the point with: the row's
 * finding text ("Item 3 (mufla): oxidação nos terminais" and the row's photo tokens). `owner` is the
 * sheet or the local. '' when the row's seed item is unknown.
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

/** A Não ensaiado finding's text: "⟨reason⟩ — ⟨justification⟩", the typed text alone for "Outro", the reason alone when nothing is printed for it. */
function reasonText(entry: Pick<DerivedPoint, 'reason_key' | 'reason_label' | 'justification'>): string {
  if (entry.justification === null) return entry.reason_label;
  if (entry.reason_key === 'outro') return entry.justification;
  return `${entry.reason_label} — ${entry.justification}`;
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
