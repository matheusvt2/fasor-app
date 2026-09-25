import { makeOp, SERVER_DEVICE_ID, toIso, type EquipmentRow, type OpInput, type RevisionRow } from '@app/domain';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';
import { asCompanyId } from '../../apps/api/src/db/repositories/company-id.ts';
import { applyOps } from '../../apps/api/src/sync/apply.ts';
import { newId } from '../../apps/api/src/ids.ts';

/*
 * The `revision` family (`packages/domain/src/ops/path.ts`) is `serverOnly`: a device
 * push through `/api/sync/ops` (`apps/api/src/sync/routes.ts`, always `origin: 'client'`)
 * refuses it with `op_server_only`, the same guard that keeps `file/server` and
 * `suggestion` off a client's own wire. Story 4.6's own E2E fixture (a relatório already
 * Emitido, with a `revision` row) can only be built the way the server itself would
 * write one -- `applyOps(..., {origin: 'server'})` against the compose Postgres directly,
 * the same connection `reset-empresa-b.ts` already opens for the company reset.
 */

/** One `revision` row, created as the server would (AD-24), pulled by the device on its next sync. */
export async function pushRevision(companyId: string, relatorioId: string, revision: { number: number; createdBy: string; createdAt: Date }): Promise<void> {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    const row: RevisionRow = {
      id: newId(),
      relatorio_id: relatorioId,
      number: revision.number,
      snapshot_seq: 0,
      created_by: revision.createdBy,
      docx_file_id: newId(),
      pdf_file_id: newId(),
      created_at: toIso(revision.createdAt),
    };
    const input: OpInput = {
      kind: 'create',
      scope: 'relatorio',
      company_id: companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: `revision/${row.id}`,
      value: row as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: revision.createdBy,
      device_id: SERVER_DEVICE_ID,
    };
    const op = makeOp(input, { newId, now: revision.createdAt });
    const result = await applyOps(db, asCompanyId(companyId), [op], { origin: 'server', now: () => revision.createdAt });
    if (result.rejected.length > 0) throw new Error(`revision op rejected: ${JSON.stringify(result.rejected)}`);
  } finally {
    await sql.end();
  }
}

/**
 * Story 12.6: an equipment's `last_nameplate` (AD-25, the plate of its last issued
 * relatório), written as the server writes it on issue -- the family is `serverOnly` like
 * `revision` -- so "Copiar da última visita" is offered once the device pulls it.
 */
export async function pushLastNameplate(companyId: string, projectId: string, equipmentId: string, lastNameplate: NonNullable<EquipmentRow['last_nameplate']>, actorId: string): Promise<void> {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    const at = new Date();
    const input: OpInput = {
      kind: 'put',
      scope: 'project',
      company_id: companyId,
      project_id: projectId,
      relatorio_id: null,
      path: `equipment/${equipmentId}/last_nameplate`,
      value: lastNameplate as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: actorId,
      device_id: SERVER_DEVICE_ID,
    };
    const op = makeOp(input, { newId, now: at });
    const result = await applyOps(db, asCompanyId(companyId), [op], { origin: 'server', now: () => at });
    if (result.rejected.length > 0) throw new Error(`last_nameplate op rejected: ${JSON.stringify(result.rejected)}`);
  } finally {
    await sql.end();
  }
}
