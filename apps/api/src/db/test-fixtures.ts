import type { Op, RelatorioParecer } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { and, eq, inArray, or } from 'drizzle-orm';
import { now } from '../clock.ts';
import { applyOps } from '../sync/apply.ts';
import type { Db } from './client.ts';
import { isE2eWorkerCompany } from './e2e-worker-seed.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { entities, ops } from './schema.ts';
import { TEST_SEED } from './test-seed.ts';

/*
 * Test support (Story 4.8): the small Porto Seguro fixture seeded onto a company as the
 * server would apply it, for the generate suites and the Export e2e, and for a developer
 * through `scripts/seed-users.ts --sample-relatorio`. The fixture's op
 * ids are fixed, so an earlier run's rows are reclaimed first; the same removal cleans up
 * afterwards, including the server's own generate ops of that relatório.
 */

export const SMALL_FIXTURE_RELATORIO_ID = portoSeguroSmall.relatorioId;
export const SMALL_FIXTURE_PROJECT_ID = portoSeguroSmall.projectId;

const fixtureEntityIds = [...new Set(portoSeguroSmall.log.filter((op) => op.kind === 'create').map((op) => (op.value as { id: string }).id))];
const fixtureOpIds = portoSeguroSmall.log.map((op) => op.op_id);

export interface RemoveSmallFixtureOptions {
  /** The one company besides the test and e2e companies the fixture may be removed from (the company `seedPortoSeguroSmall` seeds). */
  allowCompanyId?: string;
}

/**
 * Removes the fixture's rows and every op of its relatório and project, in one transaction
 * (E-4, review 2026-09-30). The companies that hold any of them are read first; when one is
 * neither a `TEST_SEED` company, nor an e2e worker's, nor `allowCompanyId`, nothing is
 * deleted and it throws: a sample relatório seeded on a real company (`seed-users.ts
 * --sample-relatorio`) is never wiped by a test run. The deletes are scoped to the companies
 * that were read.
 */
export async function removePortoSeguroSmall(db: Db, options: RemoveSmallFixtureOptions = {}): Promise<void> {
  const opRows = or(inArray(ops.op_id, fixtureOpIds), eq(ops.relatorio_id, SMALL_FIXTURE_RELATORIO_ID), eq(ops.project_id, SMALL_FIXTURE_PROJECT_ID));
  const entityRows = or(eq(entities.relatorio_id, SMALL_FIXTURE_RELATORIO_ID), eq(entities.project_id, SMALL_FIXTURE_PROJECT_ID), inArray(entities.id, fixtureEntityIds));
  const testIds: readonly string[] = TEST_SEED.companies.map((c) => c.companyId);
  await db.transaction(async (tx) => {
    const holders = new Set<string>();
    for (const row of await tx.selectDistinct({ company_id: ops.company_id }).from(ops).where(opRows)) holders.add(row.company_id);
    for (const row of await tx.selectDistinct({ company_id: entities.company_id }).from(entities).where(entityRows)) holders.add(row.company_id);
    const foreign = [...holders].filter((id) => !testIds.includes(id) && !isE2eWorkerCompany(id) && id !== options.allowCompanyId);
    if (foreign.length > 0) {
      throw new Error(`the small fixture is held by ${foreign.join(', ')}, not a test company; removePortoSeguroSmall deletes nothing there`);
    }
    if (holders.size === 0) return;
    const companies = [...holders];
    await tx.delete(ops).where(and(inArray(ops.company_id, companies), opRows));
    await tx.delete(entities).where(and(inArray(entities.company_id, companies), entityRows));
  });
}

export interface SeedSmallFixtureOptions {
  /** Points the relatório's responsible at a real `user` row of the company (the fixture's own user has none). */
  responsibleUserId?: string;
  /**
   * Story 7.5: born with this parecer, so an issue is not refused with `pre_issue_blocked`
   * (the fixture's log carries none, and "Parecer não preenchido" is the one blocking row).
   */
  parecer?: RelatorioParecer;
}

/** A parecer the issue tests seed the fixture with. */
export const TEST_PARECER: RelatorioParecer = { verdict: 'apto', text: null, text_status: null, text_basis: null };

/** Reclaims and applies the fixture onto `companyId`; throws when any op is rejected. */
export async function seedPortoSeguroSmall(db: Db, companyId: string, options: SeedSmallFixtureOptions = {}): Promise<void> {
  await removePortoSeguroSmall(db, { allowCompanyId: companyId });
  const remapped: Op[] = portoSeguroSmall.log.map((op) => {
    let value = op.value;
    if (op.kind === 'create' && op.path === `relatorio/${SMALL_FIXTURE_RELATORIO_ID}`) {
      const row = op.value as { setup: Record<string, unknown> };
      value = {
        ...row,
        setup: {
          ...row.setup,
          ...(options.responsibleUserId === undefined ? {} : { responsible_user_id: options.responsibleUserId }),
          ...(options.parecer === undefined ? {} : { parecer: options.parecer }),
        },
      };
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
