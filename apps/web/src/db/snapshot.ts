import {
  buildSnapshot,
  entityKey,
  type EntityKey,
  type EntityRow,
  type RelatorioRow,
  type RelatorioSnapshot,
} from '@app/domain';
import type { AppDatabase, EntityRecord } from './schema.ts';

/** AD-15: the device-side `toSnapshot()`, byte-equal to the server's for one log. */
export async function toSnapshot(db: AppDatabase, relatorioId: string): Promise<RelatorioSnapshot> {
  return db.transaction('r', db.entities, async () => {
    const relatorio = await db.entities.get(['relatorio', relatorioId]);
    if (!relatorio) throw new Error(`relatorio ${relatorioId} is not on this device`);
    const row = relatorio.row as RelatorioRow;
    const projectId = row.project_id;
    const [scoped, project, equipment, registry, users] = await Promise.all([
      db.entities.where('relatorio_id').equals(relatorioId).toArray(),
      db.entities.get(['project', projectId]),
      db.entities.where('project_id').equals(projectId).toArray(),
      db.entities.where('entity').equals('registry').toArray(),
      // Stories 4.8 and 7.1: the company's `user` rows, as the server's `toSnapshot` reads
      // them: the responsible (cover, document control) and the sheets' actors (the section 9
      // attribution line). `buildSnapshot` keeps only the rows it names.
      db.entities.where('entity').equals('user').toArray(),
    ]);
    const state = new Map<EntityKey, EntityRow>();
    const add = (record: EntityRecord | undefined) => {
      if (record) state.set(entityKey(record.entity, record.id), record.row);
    };
    add(relatorio);
    add(project);
    for (const list of [scoped, equipment, registry, users]) list.forEach(add);
    return buildSnapshot(state, relatorioId);
  });
}
