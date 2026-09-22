import { z } from 'zod';
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
  type BlockRow,
  type Entity,
  type EntityRow,
  type EntityRowOf,
  type ProjectRow,
  type RegistryRow,
  type RelatorioRow,
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
  const instrumentIds = new Set<string>();
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
  });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonical(v);
    }
    return out;
  }
  return value;
}

/** Canonical JSON: object keys sorted recursively, arrays in snapshot order, no whitespace. */
export function serializeSnapshot(snapshot: RelatorioSnapshot): string {
  return JSON.stringify(canonical(snapshot));
}
