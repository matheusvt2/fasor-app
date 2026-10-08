import { createHash } from 'node:crypto';
import type { Op } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { and, eq, inArray, or } from 'drizzle-orm';
import { now } from '../clock.ts';
import { applyOps } from '../sync/apply.ts';
import type { Db } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { entities, ops } from './schema.ts';

/*
 * Review F-14 (Epic 13 QA): the developer's sample relatório (`scripts/seed-users.ts
 * --sample-relatorio`). It is the small Porto Seguro fixture's op log, but under ids derived
 * per company, never the fixture's own fixed ids: the automated suites (`test:api`, the e2e
 * global setup) seed and reclaim those, and a sample planted under them made
 * `removePortoSeguroSmall` refuse and `test:api` fail. A derived id keeps the original
 * UUIDv7's first 12 hex digits (its timestamp) and version nibble; the rest comes from a hash
 * of the company id and the original id, with valid variant bits. So the ids are
 * deterministic: a re-run for the same company finds and replaces its own copy, and two
 * companies never share one. The ops keep the fixture's `client_ts`, which orders them.
 */

/** Every id the small fixture mints (`fixedId`, `fixedOpId`): the `019966c1` prefix. */
const FIXTURE_ID = /019966c1-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;

/** The sample's id for the fixture's `originalId` in `companyId`. */
export function sampleId(companyId: string, originalId: string): string {
  const hash = createHash('sha256').update(`${companyId}:${originalId}`).digest('hex');
  const variant = ((Number.parseInt(hash[3]!, 16) & 0x3) | 0x8).toString(16);
  return `${originalId.slice(0, 8)}-${originalId.slice(9, 13)}-7${hash.slice(0, 3)}-${variant}${hash.slice(4, 7)}-${hash.slice(7, 19)}`;
}

/** The fixture's string with every fixture id replaced: its company by `companyId`, its user kept, the rest derived. */
function remapText(text: string, companyId: string): string {
  return text.replace(FIXTURE_ID, (id) => {
    if (id === portoSeguroSmall.companyId) return companyId;
    if (id === portoSeguroSmall.userId) return id;
    return sampleId(companyId, id);
  });
}

function remapValue(value: unknown, companyId: string): unknown {
  if (typeof value === 'string') return remapText(value, companyId);
  if (Array.isArray(value)) return value.map((item) => remapValue(item, companyId));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [remapText(key, companyId), remapValue(item, companyId)]));
  }
  return value;
}

/** The sample's relatório and project ids in `companyId`. */
export function sampleRelatorioIds(companyId: string): { relatorioId: string; projectId: string } {
  return { relatorioId: sampleId(companyId, portoSeguroSmall.relatorioId), projectId: sampleId(companyId, portoSeguroSmall.projectId) };
}

/** The fixture's log as the sample of `companyId`: every id derived, the company in the envelope and in a `file` create's value. */
export function sampleRelatorioLog(companyId: string, options: { responsibleUserId?: string } = {}): Op[] {
  const { relatorioId } = sampleRelatorioIds(companyId);
  return portoSeguroSmall.log.map((op) => {
    let value = remapValue(op.value, companyId);
    const path = remapText(op.path, companyId);
    if (op.kind === 'create' && path === `relatorio/${relatorioId}` && options.responsibleUserId !== undefined) {
      const row = value as { setup: Record<string, unknown> };
      value = { ...row, setup: { ...row.setup, responsible_user_id: options.responsibleUserId } };
    }
    return {
      ...op,
      op_id: remapText(op.op_id, companyId),
      company_id: companyId,
      project_id: typeof op.project_id === 'string' ? remapText(op.project_id, companyId) : op.project_id,
      relatorio_id: typeof op.relatorio_id === 'string' ? remapText(op.relatorio_id, companyId) : op.relatorio_id,
      path,
      value: value as Op['value'],
      seq: undefined,
    } as Op;
  });
}

/**
 * Seeds the sample relatório onto `companyId` through the op log, replacing that company's own
 * earlier copy (its rows and every op of its relatório and project, the server's generate ops
 * included), in that company only. Returns the relatório's id. Throws when any op is rejected.
 */
export async function seedSampleRelatorio(db: Db, companyId: string, options: { responsibleUserId?: string } = {}): Promise<string> {
  const log = sampleRelatorioLog(companyId, options);
  const { relatorioId, projectId } = sampleRelatorioIds(companyId);
  const opIds = log.map((op) => op.op_id);
  const entityIds = [...new Set(log.filter((op) => op.kind === 'create').map((op) => (op.value as { id: string }).id))];
  await db.transaction(async (tx) => {
    await tx
      .delete(ops)
      .where(and(eq(ops.company_id, companyId), or(inArray(ops.op_id, opIds), eq(ops.relatorio_id, relatorioId), eq(ops.project_id, projectId))));
    await tx
      .delete(entities)
      .where(and(eq(entities.company_id, companyId), or(inArray(entities.id, entityIds), eq(entities.relatorio_id, relatorioId), eq(entities.project_id, projectId))));
  });
  const result = await applyOps(db, asCompanyId(companyId), log, { now, origin: 'server' });
  if (result.rejected.length > 0) throw new Error(`sample relatório rejected: ${JSON.stringify(result.rejected)}`);
  return relatorioId;
}
