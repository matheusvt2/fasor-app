import { SEED_VERSION, SYSTEM_IDENTITY_ACTOR, templateSeedUpgrade, toIso, type TemplateRow } from '@app/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { now } from '../clock.ts';
import { newId } from '../ids.ts';
import { log, logError, type LogFields } from '../log.ts';
import { applyServerBatch, ServerBatchRejectedError, type Tx } from '../sync/apply.ts';
import { serverOp } from '../sync/server-op.ts';
import type { Db } from './client.ts';
import { asCompanyId, type CompanyId } from './repositories/company-id.ts';
import { entities } from './schema.ts';

/*
 * Story 14.3 (how templates reach a new seed version, AD-21): the server's data step that
 * moves every live template row to the current `SEED_VERSION`, so a relatório created after
 * it is born on that version (and, from v4, carries the site checklist of each local). It
 * runs wherever migrations are applied at start (`main.ts`, `migrate-cli.ts`), after them.
 *
 * Only `seed_version` moves, through the server-only path `template/{id}/seed_version`: the
 * template's `version`, `blocks` and `skeleton` stay as they are, and no relatório already
 * made is touched (a relatório keeps the version it was created with, AR-20). Whether a row
 * moves is the kernel's answer (`templateSeedUpgrade`): one on an earlier shipped version
 * whose blocks and skeleton validate on the current one. A row that would not validate there
 * is left where it is and logged; so is one the server refuses.
 *
 * Each template is one server batch (`system:identity`, device `server`) in one transaction
 * under its company's lock, with the row read again there: a device edit, a removal or
 * another instance's move that landed after the scan is never overwritten. Idempotent: a
 * second run finds nothing to move and writes no op.
 */

/** Thrown inside the batch's lock when the row no longer needs this move: rolls back, then skipped. */
class MoveNoLongerNeeded extends Error {}

/** Where this step writes what it did; the api's structured log by default. */
export interface TemplateSeedUpgradeDeps {
  info?: (msg: string, fields?: LogFields) => void;
  error?: (msg: string, fields?: LogFields) => void;
}

/** The version a stored template row should move to (`templateSeedUpgrade`), or null; a row that is no object, or carries no `seed_version` string, has none. */
function targetOf(row: unknown): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const { seed_version, blocks, skeleton } = row as Partial<Pick<TemplateRow, 'seed_version' | 'blocks' | 'skeleton'>>;
  if (typeof seed_version !== 'string') return null;
  return templateSeedUpgrade({ seed_version, blocks: blocks as TemplateRow['blocks'], skeleton: skeleton as TemplateRow['skeleton'] });
}

function seedVersionOf(row: unknown): unknown {
  return typeof row === 'object' && row !== null ? (row as { seed_version?: unknown }).seed_version : undefined;
}

async function moveOne(db: Db, companyId: CompanyId, id: string, target: string): Promise<boolean> {
  const op = serverOp({
    opId: newId(),
    companyId,
    actorId: SYSTEM_IDENTITY_ACTOR,
    clientTs: toIso(now()),
    kind: 'put',
    path: `template/${id}/seed_version`,
    value: target,
    scope: 'company',
    batchId: newId(),
  });
  try {
    await applyServerBatch(db, companyId, [op], {
      now,
      before: async (tx: Tx) => {
        const [current] = await tx
          .select({ row: entities.row, removed_at: entities.removed_at })
          .from(entities)
          .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'template'), eq(entities.id, id)));
        if (current === undefined || current.removed_at !== null || targetOf(current.row) !== target) throw new MoveNoLongerNeeded();
      },
    });
    return true;
  } catch (error) {
    if (error instanceof MoveNoLongerNeeded) return false;
    throw error;
  }
}

/**
 * Moves every live template of every company to `SEED_VERSION` (see the note above) and
 * answers how many it moved. A template that fails the current version's row check, or sits
 * on a version this bundle does not ship, is skipped and logged; a second run moves none.
 */
export async function upgradeTemplateSeeds(db: Db, deps: TemplateSeedUpgradeDeps = {}): Promise<number> {
  const info = deps.info ?? log;
  const error = deps.error ?? logError;
  const rows = await db
    .select({ company_id: entities.company_id, id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.entity, 'template'), isNull(entities.removed_at)))
    .orderBy(entities.company_id, entities.id);
  let moved = 0;
  for (const row of rows) {
    const from = seedVersionOf(row.row);
    if (from === SEED_VERSION) continue;
    const target = targetOf(row.row);
    if (target === null) {
      error('template seed upgrade skipped: the row does not validate on the current seed version', { company_id: row.company_id, template_id: row.id, seed_version: from ?? null, target: SEED_VERSION });
      continue;
    }
    try {
      if (await moveOne(db, asCompanyId(row.company_id), row.id, target)) {
        moved += 1;
        info('template seed upgraded', { company_id: row.company_id, template_id: row.id, from: from ?? null, to: target });
      }
    } catch (failure) {
      // A refusal no retry fixes (the fold or the row schema said no): this template stays, the rest still move.
      if (!(failure instanceof ServerBatchRejectedError)) throw failure;
      error('template seed upgrade skipped: the server refused the move', { company_id: row.company_id, template_id: row.id, seed_version: from ?? null, target, code: failure.rejected[0]?.code ?? 'op_invalid' });
    }
  }
  return moved;
}
