import { SERVER_DEVICE_ID, type Op } from '@app/domain';

/*
 * The one builder of a server op's envelope (review 2026-09-30, A-28): device `server`, a
 * `system:*` actor, no `prev_op_id`. Every server emitter (the generate route and job, the
 * file routes, the reading status writes, provisioning) builds its ops here, so the envelope
 * cannot drift between them.
 */

export interface ServerOpInput {
  opId: string;
  companyId: string;
  /** A `system:*` actor (`system:generate`, `system:files`, `system:reading`, `system:identity`). */
  actorId: string;
  /** The op's `client_ts`, a canonical ISO string. */
  clientTs: string;
  kind: Op['kind'];
  path: string;
  value: unknown;
  /** Defaults to `relatorio` when `relatorioId` is set, `company` otherwise. */
  scope?: Op['scope'];
  projectId?: string | null;
  relatorioId?: string | null;
  batchId?: string | null;
  meta?: Op['meta'];
}

export function serverOp(input: ServerOpInput): Op {
  const relatorioId = input.relatorioId ?? null;
  return {
    op_id: input.opId,
    kind: input.kind,
    scope: input.scope ?? (relatorioId === null ? 'company' : 'relatorio'),
    company_id: input.companyId,
    project_id: input.projectId ?? null,
    relatorio_id: relatorioId,
    path: input.path,
    value: input.value as Op['value'],
    prev_op_id: null,
    batch_id: input.batchId ?? null,
    meta: input.meta ?? null,
    actor_id: input.actorId,
    device_id: SERVER_DEVICE_ID,
    client_ts: input.clientTs,
  };
}
