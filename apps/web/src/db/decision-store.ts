import {
  conflictOpIds,
  entityKey,
  holdsConflictMarks,
  integrityFindings,
  openDecisions,
  type BlockRow,
  type Decision,
  type EntityKey,
  type EquipmentRow,
  type LocationRow,
  type OpFacts,
  type RelatorioRow,
} from '@app/domain';
import { locationRows } from './home-store.ts';
import type { AppDatabase } from './schema.ts';

/*
 * Stories 10.2 and 10.3: the open decisions of every relatório this device holds, read from
 * IndexedDB for the badge count, the conflict Banners and the Sync status "Decisões" rows.
 * The kernel lists them (`openDecisions`); this module only gathers its inputs: the rows
 * that carry a mark or a duplicate TAG, and the facts of the ops they name from the log
 * (`remote_ops`, then the outbox for an op not pulled back yet).
 */

/** One held relatório's open decisions, with the rows their words and resolutions read. */
export interface HeldDecisions {
  relatorioId: string;
  projectId: string;
  decisions: Decision[];
  /** The relatório's blocks, removed ones included. */
  blocks: BlockRow[];
  locations: LocationRow[];
  /** The project's equipment, removed rows included. */
  equipment: EquipmentRow[];
}

const factsOf = (op: { actor_id: string; device_id: string; client_ts: string; seq?: number | null } | undefined): OpFacts | undefined =>
  op === undefined ? undefined : { actor_id: op.actor_id, device_id: op.device_id, client_ts: op.client_ts, ...(typeof op.seq === 'number' ? { seq: op.seq } : {}) };

/** The facts of each op id, from the pulled log first, then this device's outbox. */
async function opFacts(db: AppDatabase, ids: readonly string[]): Promise<Map<string, OpFacts>> {
  const out = new Map<string, OpFacts>();
  if (ids.length === 0) return out;
  const [remote, local] = await Promise.all([db.remote_ops.bulkGet([...ids]), db.outbox.bulkGet([...ids])]);
  ids.forEach((id, i) => {
    const facts = factsOf(remote[i] ?? (local[i]?.status === 'dead' ? undefined : local[i]));
    if (facts !== undefined) out.set(id, facts);
  });
  return out;
}

/** The create op of each entity key, from the pulled log first, then this device's outbox. */
async function createFacts(db: AppDatabase, keys: readonly EntityKey[]): Promise<Map<EntityKey, OpFacts>> {
  const out = new Map<EntityKey, OpFacts>();
  for (const key of keys) {
    const remote = (await db.remote_ops.where('targets').equals(key).toArray()).find((op) => op.kind === 'create');
    const local = remote === undefined ? (await db.outbox.where('targets').equals(key).toArray()).find((op) => op.kind === 'create' && op.status !== 'dead') : undefined;
    const facts = factsOf(remote ?? local);
    if (facts !== undefined) out.set(key, facts);
  }
  return out;
}

/**
 * The open decisions of every live relatório this device holds, in relatório order of the
 * store; only the relatórios with at least one decision are returned.
 */
export async function heldDecisions(db: AppDatabase): Promise<HeldDecisions[]> {
  const [blockRecords, equipmentRecords, relatorioRecords] = await Promise.all([
    db.entities.where('entity').equals('block').toArray(),
    db.entities.where('entity').equals('equipment').toArray(),
    db.entities.where('entity').equals('relatorio').toArray(),
  ]);
  const blocks = blockRecords.map((record) => record.row as BlockRow);
  const equipment = equipmentRecords.map((record) => record.row as EquipmentRow);
  const byProject = new Map<string, EquipmentRow[]>();
  for (const row of equipment) byProject.set(row.project_id, [...(byProject.get(row.project_id) ?? []), row]);
  const duplicated = new Set<string>();
  for (const [projectId, rows] of byProject) if (integrityFindings({ equipment: rows }).length > 0) duplicated.add(projectId);

  const out: HeldDecisions[] = [];
  for (const record of relatorioRecords) {
    const relatorio = record.row as RelatorioRow;
    if (relatorio.removed_at !== null) continue;
    const own = blocks.filter((block) => block.relatorio_id === relatorio.id);
    if (!own.some(holdsConflictMarks) && !duplicated.has(relatorio.project_id)) continue;
    const projectEquipment = byProject.get(relatorio.project_id) ?? [];
    const duplicates = integrityFindings({ equipment: projectEquipment }).flatMap((finding) => finding.equipment_ids);
    const [ops, creates, locations] = await Promise.all([
      opFacts(db, conflictOpIds(own)),
      createFacts(db, duplicates.map((id) => entityKey('equipment', id))),
      locationRows(db, relatorio.id),
    ]);
    const decisions = openDecisions({
      relatorioId: relatorio.id,
      blocks: own,
      locations,
      equipment: projectEquipment,
      opOf: (id) => ops.get(id),
      createOpOf: (key) => creates.get(key),
    });
    if (decisions.length > 0) out.push({ relatorioId: relatorio.id, projectId: relatorio.project_id, decisions, blocks: own, locations, equipment: projectEquipment });
  }
  return out;
}
