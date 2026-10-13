import { toIso } from '../clock.ts';
import { applyOp, splitEntityKey, targetsOf, type EntityKey, type EntityState } from '../ops/apply.ts';
import { makeOp, opSchema, type Op } from '../ops/op.ts';
import { blockFieldPath, equipmentFieldPath, locationFieldPath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import type { BlockRow, EntityRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { addCabine, addColuna, addPainel, setQuantity } from '../templates/compose.ts';
import { emptyTemplate } from '../templates/list.ts';
import { idSequence, T0, TEST_COMPANY, TEST_DEVICE, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import type { LocationRemovalPlan, LocationRestorePlan, RemovalVisibility } from './removal.ts';

/*
 * 14.2-UNIT, second pass: the relatório the removal tests share, born from a template
 * through `instantiateTemplate` and folded by `replay`, and the hand-built batches of a
 * removal and a restore (the surface's ops, written here as the spec orders them). Not part
 * of the public kernel surface.
 *
 *   Subestação (local, Função primária)        TR-1, TR-2 directly on it
 *     Coluna 9 (a coluna directly under the local, the shape before the painel level): one disjuntor
 *     Painel 1    Coluna 1: two seccionadoras    Coluna 2: one disjuntor, one TP
 *     Painel 2    Coluna 1: one seccionadora
 *   Geradores (local)                          one cable set directly on it
 */

export interface RemovalFixture {
  relatorioId: string;
  /** The log that creates the relatório, `seq` 1 to n. */
  ops: Op[];
  state: Map<EntityKey, EntityRow>;
}

export function removalFixture(): RemovalFixture {
  let skeleton = addCabine([], 'se', 'Subestação', 'primaria');
  skeleton = addColuna(skeleton, 'se', 'leg', 'Coluna 9');
  skeleton = addPainel(skeleton, 'se', 'p1', 'Painel 1');
  skeleton = addColuna(skeleton, 'p1', 'p1c1', 'Coluna 1');
  skeleton = addColuna(skeleton, 'p1', 'p1c2', 'Coluna 2');
  skeleton = addPainel(skeleton, 'se', 'p2', 'Painel 2');
  skeleton = addColuna(skeleton, 'p2', 'p2c1', 'Coluna 1');
  skeleton = addCabine(skeleton, 'ger', 'Geradores');
  let template = { ...emptyTemplate('019966b0-0150-7000-8000-000000000001', 'v3'), skeleton };
  const place = (ref: string, type: Parameters<typeof setQuantity>[2], n: number) => {
    template = { ...template, blocks: setQuantity(template, ref, type, n) };
  };
  place('se', 'transformador_forca', 2);
  place('leg', 'disjuntor_mt', 1);
  place('p1c1', 'chave_seccionadora', 2);
  place('p1c2', 'disjuntor_mt', 1);
  place('p1c2', 'tp', 1);
  place('p2c1', 'chave_seccionadora', 1);
  place('ger', 'cabos_entrada', 1);
  const { relatorioId, drafts } = instantiateTemplate(
    template,
    { id: TEST_PROJECT },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0151-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const newId = idSequence('019966b0-0152-7000-8000-');
  const ops = drafts.map((draft, i) => ({ ...makeOp({ ...draft, device_id: TEST_DEVICE }, { newId, now: T0 }), seq: i + 1 }));
  return { relatorioId, ops, state: new Map(replay(ops)) };
}

/** Folds `ops` into `state` in place, the way `replay` does (a changed row is a new object). */
export function fold(state: Map<EntityKey, EntityRow>, ops: readonly Op[]): void {
  for (const op of ops) {
    const touched = new Map<EntityKey, EntityRow>();
    for (const ref of targetsOf(op)) {
      const row = state.get(ref.key);
      if (row) touched.set(ref.key, row);
    }
    const next = applyOp(touched, op);
    for (const [key, row] of next) if (row !== touched.get(key)) state.set(key, row);
  }
}

/** Every location, block and equipment row of the state, removed ones included, as a device hands them to the plans. */
export function rowsIn(state: EntityState): { locations: LocationRow[]; blocks: BlockRow[]; equipment: EquipmentRow[] } {
  const locations: LocationRow[] = [];
  const blocks: BlockRow[] = [];
  const equipment: EquipmentRow[] = [];
  for (const [key, row] of state) {
    const entity = splitEntityKey(key).entity;
    if (entity === 'location') locations.push(row as LocationRow);
    else if (entity === 'block') blocks.push(row as BlockRow);
    else if (entity === 'equipment') equipment.push(row as EquipmentRow);
  }
  return { locations, blocks, equipment };
}

/** The id of the location named `name` under the location named `parentName` (null: a root). */
export function locationId(state: EntityState, name: string, parentName: string | null = null): string {
  const { locations } = rowsIn(state);
  const parent = parentName === null ? null : locations.find((row) => row.name === parentName);
  const found = locations.filter((row) => row.name === name && (parentName === null ? row.parent_id === null : row.parent_id === parent?.id));
  if (found.length !== 1) throw new Error(`${found.length} locations named "${name}" under "${parentName ?? 'the root'}"`);
  return found[0]!.id;
}

/** The id of the block whose equipment carries `tag`. */
export function blockIdOf(state: EntityState, tag: string): string {
  const { blocks, equipment } = rowsIn(state);
  const row = equipment.filter((e) => e.tag === tag);
  if (row.length !== 1) throw new Error(`${row.length} equipment rows tagged "${tag}"`);
  const found = blocks.filter((block) => block.equipment_id === row[0]!.id);
  if (found.length !== 1) throw new Error(`${found.length} blocks hold "${tag}"`);
  return found[0]!.id;
}

/** The TAGs of `blockIds`, in that order ("" for a block with no equipment row in the state). */
export function tagsOf(state: EntityState, blockIds: readonly string[]): string[] {
  const { blocks, equipment } = rowsIn(state);
  return blockIds.map((id) => equipment.find((row) => row.id === blocks.find((block) => block.id === id)?.equipment_id)?.tag ?? '');
}

/** Every relatório of the obra is on this device, pulled to the end: an equipment no other live block holds is freed. */
export const ALL_HERE: RemovalVisibility = { companyDownloaded: true, summaries: [], heldRelatorioIds: [], downloadedStreamIds: [] };

const opIds = idSequence('019966b0-0153-7000-8000-');

/** One batch: every op carries the same `batch_id` and the same `client_ts`, as `buildBatch` stamps it. */
function batch(relatorioId: string, at: Date, drafts: readonly { kind: 'remove' | 'put'; path: string; scope: 'relatorio' | 'project' }[], device: string): Op[] {
  const batch_id = opIds();
  return drafts.map((draft) =>
    opSchema.parse({
      op_id: opIds(),
      kind: draft.kind,
      scope: draft.scope,
      company_id: TEST_COMPANY,
      project_id: draft.scope === 'project' ? TEST_PROJECT : null,
      relatorio_id: draft.scope === 'relatorio' ? relatorioId : null,
      path: draft.path,
      value: null,
      prev_op_id: null,
      batch_id,
      meta: null,
      actor_id: TEST_USER,
      device_id: device,
      client_ts: toIso(at),
    }),
  );
}

/** A removal's batch from its plan, in the spec's order: the location removes (target first), the block removes, the equipment removes. */
export function removalOps(relatorioId: string, plan: Pick<LocationRemovalPlan, 'locationIds' | 'blockIds' | 'equipmentIds'>, at: Date, device: string = TEST_DEVICE): Op[] {
  return batch(
    relatorioId,
    at,
    [
      ...plan.locationIds.map((id) => ({ kind: 'remove' as const, scope: 'relatorio' as const, path: locationFieldPath(id, 'removed_at') })),
      ...plan.blockIds.map((id) => ({ kind: 'remove' as const, scope: 'relatorio' as const, path: blockFieldPath(id, 'removed_at') })),
      ...plan.equipmentIds.map((id) => ({ kind: 'remove' as const, scope: 'project' as const, path: equipmentFieldPath(id, 'removed_at') })),
    ],
    device,
  );
}

/** A restore's batch from its plan: `removed_at` puts of null on the locations, the blocks and the equipment. */
export function restoreOps(relatorioId: string, plan: Pick<LocationRestorePlan, 'locationIds' | 'blockIds' | 'equipmentIds'>, at: Date, device: string = TEST_DEVICE): Op[] {
  return batch(
    relatorioId,
    at,
    [
      ...plan.locationIds.map((id) => ({ kind: 'put' as const, scope: 'relatorio' as const, path: locationFieldPath(id, 'removed_at') })),
      ...plan.blockIds.map((id) => ({ kind: 'put' as const, scope: 'relatorio' as const, path: blockFieldPath(id, 'removed_at') })),
      ...plan.equipmentIds.map((id) => ({ kind: 'put' as const, scope: 'project' as const, path: equipmentFieldPath(id, 'removed_at') })),
    ],
    device,
  );
}
