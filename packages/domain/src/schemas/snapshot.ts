import { z } from 'zod';
import { canonicalJson } from '../text/hash.ts';
import { entityKey, splitEntityKey, type EntityState } from '../ops/apply.ts';
import {
  blockRowSchema,
  equipmentRowSchema,
  locationRowSchema,
  otherFileRowSchema,
  photoFileRowSchema,
  pointRowSchema,
  projectRowSchema,
  registryRowSchemas,
  relatorioRowSchema,
  rowRemovedAt,
  suggestionRowSchema,
  userRowSchema,
  type BlockRow,
  type Entity,
  type EntityRow,
  type EntityRowOf,
  type ProjectRow,
  type RegistryRow,
  type RelatorioRow,
  type UserRow,
} from './entities.ts';

/*
 * AD-15: the frozen, kernel-typed view the renderer and the checks read.
 * Tombstones are excluded; `company_id` is stripped from files (AD-10);
 * suggestions are exactly those a current cell references.
 */

export const snapshotFileSchema = z.discriminatedUnion('kind', [
  photoFileRowSchema.omit({ company_id: true }),
  otherFileRowSchema.omit({ company_id: true }),
]);

export const relatorioSnapshotSchema = z.object({
  relatorio: relatorioRowSchema,
  project: projectRowSchema.nullable(),
  empresa: registryRowSchemas.empresa.nullable(),
  client: registryRowSchemas.client.nullable(),
  instruments: z.array(registryRowSchemas.instrument),
  equipment: z.array(equipmentRowSchema),
  locations: z.array(locationRowSchema),
  blocks: z.array(blockRowSchema),
  files: z.array(snapshotFileSchema),
  points: z.array(pointRowSchema),
  suggestions: z.array(suggestionRowSchema),
  /** Story 4.8: the `user` row `setup.responsible_user_id` names, for the cover, the document control and section text; null when unset or not in the state. */
  responsible: userRowSchema.nullable(),
  /**
   * Story 7.1: the `user` rows any block names as its concluder (`concluded_by.actor_id`) or
   * its last editor (`last_modified_by`), sorted by id, for the section 9 attribution line.
   * An actor with no row in the state (a system actor, a user this device never pulled) is
   * left out. Defaulted, so a snapshot serialized before the field existed still parses.
   */
  actors: z.array(userRowSchema).default([]),
});

export type RelatorioSnapshot = z.infer<typeof relatorioSnapshotSchema>;

function byOrderKeyThenId(a: { id: string; order_key?: string }, b: { id: string; order_key?: string }): number {
  const ka = a.order_key ?? '';
  const kb = b.order_key ?? '';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function live<T extends EntityRow>(rows: T[]): T[] {
  return rows.filter((row) => rowRemovedAt(row) === null).sort(byOrderKeyThenId);
}

function cellsOf(block: BlockRow): { value: unknown; source_suggestion_id: string | null }[] {
  const s = block.sheet;
  const cells = [...Object.values(s.nameplate)];
  for (const item of Object.values(s.checklist)) for (const c of [item.result, item.observation]) if (c) cells.push(c);
  for (const test of Object.values(s.test)) {
    for (const c of [test.instrument, test.criterion_override]) if (c) cells.push(c);
    for (const row of Object.values(test.cells)) cells.push(...Object.values(row));
  }
  cells.push(...Object.values(s.conclusion));
  if (s.observations) cells.push(s.observations);
  return cells;
}

/**
 * Story 7.1: the `user` rows the blocks name as their concluder or their last editor, sorted
 * by id; an actor with no row in the state is left out. Both snapshot builders read this one.
 */
function actorRows(blocks: readonly BlockRow[], state: EntityState): UserRow[] {
  const actorIds = new Set<string>();
  for (const block of blocks) {
    if (block.concluded_by !== null) actorIds.add(block.concluded_by.actor_id);
    if (block.last_modified_by !== null) actorIds.add(block.last_modified_by);
  }
  return [...actorIds]
    .map((id) => state.get(entityKey('user', id)) as UserRow | undefined)
    .filter((row): row is UserRow => row !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Builds the snapshot of one relatorio from a state map holding at least: the
 * relatorio row, its project, the rows with that `relatorio_id`, the project's
 * equipment and the company registry rows. Extra rows are ignored.
 */
export function buildSnapshot(state: EntityState, relatorioId: string): RelatorioSnapshot {
  const relatorio = state.get(entityKey('relatorio', relatorioId)) as RelatorioRow | undefined;
  if (!relatorio) throw new Error(`relatorio ${relatorioId} not in state`);
  const project = (state.get(entityKey('project', relatorio.project_id)) as ProjectRow | undefined) ?? null;

  const rowsOf = <E extends Entity>(entity: E, keep: (row: EntityRowOf<E>) => boolean): EntityRowOf<E>[] => {
    const out: EntityRowOf<E>[] = [];
    for (const [key, row] of state) {
      if (splitEntityKey(key).entity !== entity) continue;
      if (keep(row as EntityRowOf<E>)) out.push(row as EntityRowOf<E>);
    }
    return out;
  };
  const inRelatorio = (row: { relatorio_id?: string | null }) => row.relatorio_id === relatorioId;

  const locations = live(rowsOf('location', inRelatorio));
  const blocks = live(rowsOf('block', inRelatorio));
  const files = live(rowsOf('file', inRelatorio)).map((file) => {
    const stripped: Partial<typeof file> = { ...file };
    delete stripped.company_id;
    return stripped;
  });
  const points = live(rowsOf('point', inRelatorio));

  const equipmentIds = new Set(blocks.map((b) => b.equipment_id).filter((id): id is string => id !== null));
  const equipment = live(rowsOf('equipment', (row) => equipmentIds.has(row.id)));

  const suggestionIds = new Set<string>();
  // Story 7.3: section 11 prints the instruments checked at setup as well as those the sheets copied.
  const instrumentIds = new Set<string>(relatorio.setup.instrument_ids);
  for (const block of blocks) {
    for (const cell of cellsOf(block)) if (cell.source_suggestion_id) suggestionIds.add(cell.source_suggestion_id);
    for (const test of Object.values(block.sheet.test)) {
      const picked = test.instrument?.value as { instrument_id?: unknown } | null | undefined;
      if (picked && typeof picked === 'object' && typeof picked.instrument_id === 'string') {
        instrumentIds.add(picked.instrument_id);
      }
    }
  }
  const suggestions = rowsOf('suggestion', (row) => suggestionIds.has(row.id)).sort(byOrderKeyThenId);

  const registry = rowsOf('registry', () => true);
  const pick = <K extends RegistryRow['kind']>(kind: K) =>
    live(registry.filter((r): r is Extract<RegistryRow, { kind: K }> => r.kind === kind));
  const empresa = pick('empresa')[0] ?? null;
  const client = pick('client').find((c) => c.id === project?.client_id) ?? null;
  const instruments = pick('instrument').filter((i) => instrumentIds.has(i.id));

  const responsibleId = relatorio.setup.responsible_user_id;
  const responsible = responsibleId === null ? null : ((state.get(entityKey('user', responsibleId)) as UserRow | undefined) ?? null);

  const actors = actorRows(blocks, state);

  return relatorioSnapshotSchema.parse({
    relatorio,
    project,
    empresa,
    client,
    instruments,
    equipment,
    locations,
    blocks,
    files,
    points,
    suggestions,
    responsible,
    actors,
  });
}

/** The suggestion and instrument ids one block's cells reference (the two sets `buildSnapshot` collects). */
interface BlockRefs {
  suggestionIds: string[];
  instrumentIds: string[];
}

function blockRefs(block: BlockRow): BlockRefs {
  const suggestionIds: string[] = [];
  const instrumentIds: string[] = [];
  for (const cell of cellsOf(block)) if (cell.source_suggestion_id) suggestionIds.push(cell.source_suggestion_id);
  for (const test of Object.values(block.sheet.test)) {
    const picked = test.instrument?.value as { instrument_id?: unknown } | null | undefined;
    if (picked && typeof picked === 'object' && typeof picked.instrument_id === 'string') instrumentIds.push(picked.instrument_id);
  }
  return { suggestionIds, instrumentIds };
}

/** Builds one relatorio's snapshot from a state; see `createSnapshotBuilder`. */
export type SnapshotBuilder = (state: EntityState, relatorioId: string) => RelatorioSnapshot;

type Parser = { parse: (value: unknown) => unknown };

/**
 * E7-A1/E8-A1 (AD-13, AD-15): the incremental form of `buildSnapshot`, for callers that
 * rebuild the same relatorio's snapshot after every commit (the device's surfaces). Its
 * output is deep-equal, and `serializeSnapshot`-equal, to `buildSnapshot(state, relatorioId)`
 * for every state; only the work is shared across calls:
 *
 * - every row is parsed through its snapshot schema once per row object: rows are immutable
 *   (`applyOp` returns a new object for a row it changes), so a row object seen before
 *   yields the same parsed object again (a `WeakMap`, so dropped rows are collected);
 * - an array whose elements are all the ones the previous call for that relatorio returned,
 *   in the same order, is that previous array; a snapshot whose fields are all the previous
 *   ones is the previous snapshot. A commit to one block therefore leaves every other
 *   block, the locations, the files and so on `===` to what the last call returned.
 *
 * The state is still scanned once per call (one pass, partitioned by entity), and every
 * order and filter is `buildSnapshot`'s own, so nothing here decides a status, count or order.
 */
export function createSnapshotBuilder(): SnapshotBuilder {
  const parsedBy = new Map<string, WeakMap<object, unknown>>();
  const refsOf = new WeakMap<BlockRow, BlockRefs>();
  const previous = new Map<string, RelatorioSnapshot>();

  const parsed = <T>(role: string, schema: Parser, row: object, prepare: (row: object) => unknown = (r) => r): T => {
    let memo = parsedBy.get(role);
    if (memo === undefined) {
      memo = new WeakMap();
      parsedBy.set(role, memo);
    }
    if (memo.has(row)) return memo.get(row) as T;
    const out = schema.parse(prepare(row));
    memo.set(row, out);
    return out as T;
  };
  const refs = (block: BlockRow): BlockRefs => {
    let out = refsOf.get(block);
    if (out === undefined) {
      out = blockRefs(block);
      refsOf.set(block, out);
    }
    return out;
  };
  /** `next`, or the previous array when it holds exactly the same elements in the same order. */
  const same = <T>(next: T[], prev: T[] | undefined): T[] =>
    prev !== undefined && prev.length === next.length && next.every((item, i) => item === prev[i]) ? prev : next;
  const stripCompany = (row: object): unknown => {
    const stripped: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    delete stripped.company_id;
    return stripped;
  };

  return (state, relatorioId) => {
    const relatorioRaw = state.get(entityKey('relatorio', relatorioId)) as RelatorioRow | undefined;
    if (!relatorioRaw) throw new Error(`relatorio ${relatorioId} not in state`);
    const projectRaw = (state.get(entityKey('project', relatorioRaw.project_id)) as ProjectRow | undefined) ?? null;

    // One pass over the state, partitioned as `buildSnapshot`'s per-entity scans read it.
    const locationRows: EntityRowOf<'location'>[] = [];
    const blockRows: BlockRow[] = [];
    const fileRows: EntityRowOf<'file'>[] = [];
    const pointRows: EntityRowOf<'point'>[] = [];
    const equipmentRows: EntityRowOf<'equipment'>[] = [];
    const suggestionRows: EntityRowOf<'suggestion'>[] = [];
    const registryRows: RegistryRow[] = [];
    for (const [key, row] of state) {
      const entity = splitEntityKey(key).entity;
      const inRelatorio = (row as { relatorio_id?: string | null }).relatorio_id === relatorioId;
      if (entity === 'location') {
        if (inRelatorio) locationRows.push(row as EntityRowOf<'location'>);
      } else if (entity === 'block') {
        if (inRelatorio) blockRows.push(row as BlockRow);
      } else if (entity === 'file') {
        if (inRelatorio) fileRows.push(row as EntityRowOf<'file'>);
      } else if (entity === 'point') {
        if (inRelatorio) pointRows.push(row as EntityRowOf<'point'>);
      } else if (entity === 'equipment') equipmentRows.push(row as EntityRowOf<'equipment'>);
      else if (entity === 'suggestion') suggestionRows.push(row as EntityRowOf<'suggestion'>);
      else if (entity === 'registry') registryRows.push(row as RegistryRow);
    }

    const liveBlocks = live(blockRows);
    const equipmentIds = new Set(liveBlocks.map((b) => b.equipment_id).filter((id): id is string => id !== null));
    const suggestionIds = new Set<string>();
    const instrumentIds = new Set<string>(relatorioRaw.setup.instrument_ids);
    for (const block of liveBlocks) {
      const r = refs(block);
      for (const id of r.suggestionIds) suggestionIds.add(id);
      for (const id of r.instrumentIds) instrumentIds.add(id);
    }

    const liveRegistry = (kind: RegistryRow['kind']) => live(registryRows.filter((r) => r.kind === kind));
    const empresaRaw = liveRegistry('empresa')[0] ?? null;
    const clientRaw = liveRegistry('client').find((c) => c.id === projectRaw?.client_id) ?? null;
    const instrumentRaws = liveRegistry('instrument').filter((i) => instrumentIds.has(i.id));
    const responsibleId = relatorioRaw.setup.responsible_user_id;
    const responsibleRaw = responsibleId === null ? null : ((state.get(entityKey('user', responsibleId)) as UserRow | undefined) ?? null);
    const actorRaws = actorRows(liveBlocks, state);

    const prev = previous.get(relatorioId);
    const next: RelatorioSnapshot = {
      relatorio: parsed('relatorio', relatorioRowSchema, relatorioRaw),
      project: projectRaw === null ? null : parsed('project', projectRowSchema, projectRaw),
      empresa: empresaRaw === null ? null : parsed('empresa', registryRowSchemas.empresa, empresaRaw),
      client: clientRaw === null ? null : parsed('client', registryRowSchemas.client, clientRaw),
      instruments: same(
        instrumentRaws.map((row) => parsed('instrument', registryRowSchemas.instrument, row)),
        prev?.instruments,
      ),
      equipment: same(
        live(equipmentRows.filter((row) => equipmentIds.has(row.id))).map((row) => parsed('equipment', equipmentRowSchema, row)),
        prev?.equipment,
      ),
      locations: same(
        live(locationRows).map((row) => parsed('location', locationRowSchema, row)),
        prev?.locations,
      ),
      blocks: same(
        liveBlocks.map((row) => parsed('block', blockRowSchema, row)),
        prev?.blocks,
      ),
      files: same(
        live(fileRows).map((row) => parsed('file', snapshotFileSchema, row, stripCompany)),
        prev?.files,
      ),
      points: same(
        live(pointRows).map((row) => parsed('point', pointRowSchema, row)),
        prev?.points,
      ),
      suggestions: same(
        suggestionRows
          .filter((row) => suggestionIds.has(row.id))
          .sort(byOrderKeyThenId)
          .map((row) => parsed('suggestion', suggestionRowSchema, row)),
        prev?.suggestions,
      ),
      responsible: responsibleRaw === null ? null : parsed('user', userRowSchema, responsibleRaw),
      actors: same(
        actorRaws.map((row) => parsed('user', userRowSchema, row)),
        prev?.actors,
      ),
    };
    if (prev !== undefined && (Object.keys(next) as (keyof RelatorioSnapshot)[]).every((key) => next[key] === prev[key])) return prev;
    previous.set(relatorioId, next);
    return next;
  };
}

/** Canonical JSON: object keys sorted recursively, arrays in snapshot order, no whitespace (`canonicalJson`). */
export function serializeSnapshot(snapshot: RelatorioSnapshot): string {
  return canonicalJson(snapshot);
}
