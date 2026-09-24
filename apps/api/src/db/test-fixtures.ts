import type { Op } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { eq, inArray, or } from 'drizzle-orm';
import { now } from '../clock.ts';
import { applyOps } from '../sync/apply.ts';
import type { Db } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { entities, ops } from './schema.ts';

/*
 * Test support only (Story 4.8): the small Porto Seguro fixture seeded onto a company as
 * the server would apply it, for the generate suites and the Export e2e. The fixture's op
 * ids are fixed, so an earlier run's rows are reclaimed first; the same removal cleans up
 * afterwards, including the server's own generate ops of that relatório.
 */

export const SMALL_FIXTURE_RELATORIO_ID = portoSeguroSmall.relatorioId;
export const SMALL_FIXTURE_PROJECT_ID = portoSeguroSmall.projectId;

const fixtureEntityIds = [...new Set(portoSeguroSmall.log.filter((op) => op.kind === 'create').map((op) => (op.value as { id: string }).id))];

/** Removes the fixture's rows and every op of its relatório and project, wherever they are. */
export async function removePortoSeguroSmall(db: Db): Promise<void> {
  await db
    .delete(ops)
    .where(
      or(
        inArray(ops.op_id, portoSeguroSmall.log.map((op) => op.op_id)),
        eq(ops.relatorio_id, SMALL_FIXTURE_RELATORIO_ID),
        eq(ops.project_id, SMALL_FIXTURE_PROJECT_ID),
      ),
    );
  await db
    .delete(entities)
    .where(or(eq(entities.relatorio_id, SMALL_FIXTURE_RELATORIO_ID), eq(entities.project_id, SMALL_FIXTURE_PROJECT_ID), inArray(entities.id, fixtureEntityIds)));
}

export interface SeedSmallFixtureOptions {
  /** Points the relatório's responsible at a real `user` row of the company (the fixture's own user has none). */
  responsibleUserId?: string;
}

/** Reclaims and applies the fixture onto `companyId`; throws when any op is rejected. */
export async function seedPortoSeguroSmall(db: Db, companyId: string, options: SeedSmallFixtureOptions = {}): Promise<void> {
  await removePortoSeguroSmall(db);
  const remapped: Op[] = portoSeguroSmall.log.map((op) => {
    let value = op.value;
    if (options.responsibleUserId !== undefined && op.kind === 'create' && op.path === `relatorio/${SMALL_FIXTURE_RELATORIO_ID}`) {
      const row = op.value as { setup: Record<string, unknown> };
      value = { ...row, setup: { ...row.setup, responsible_user_id: options.responsibleUserId } };
    }
    // A `file` create carries the company in its value (AD-10): it follows the envelope.
    if (op.kind === 'create' && value !== null && typeof value === 'object' && !Array.isArray(value) && 'company_id' in value) {
      value = { ...(value as Record<string, unknown>), company_id: companyId };
    }
    return { ...op, company_id: companyId, value, seq: undefined };
  });
  const result = await applyOps(db, asCompanyId(companyId), remapped, { now, origin: 'server' });
  if (result.rejected.length > 0) throw new Error(`small fixture rejected: ${JSON.stringify(result.rejected)}`);
}
