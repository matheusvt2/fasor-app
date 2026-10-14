import { SEED_VERSION, SYSTEM_IDENTITY_ACTOR, templateSeedUpgrade, toIso, type Op, type TemplateRow } from '@app/domain';
import { now } from '../clock.ts';
import { newId } from '../ids.ts';
import { serverOp } from './server-op.ts';

/*
 * Story 14.3, Epic 14 QA Q-7: the one per-template step of how a template reaches the current
 * seed version, shared by the boot pass (`upgradeTemplateSeeds`, every live template at api
 * start) and the push (`applyOps`: a template a device created, duplicated or restored on an
 * older version, after the boot). Whether a row moves is the kernel's answer
 * (`templateSeedUpgrade`); the move is one server op (`system:identity`, device `server`) on
 * the server-only path `template/{id}/seed_version`, in a batch of its own. A leaf: it imports
 * nothing from `apply.ts`, which reads it.
 */

/** The version a stored template row should move to (`templateSeedUpgrade`), or null; a row that is no object, or carries no `seed_version` string, has none. */
export function templateSeedTarget(row: unknown): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const { seed_version, blocks, skeleton } = row as Partial<Pick<TemplateRow, 'seed_version' | 'blocks' | 'skeleton'>>;
  if (typeof seed_version !== 'string') return null;
  return templateSeedUpgrade({ seed_version, blocks: blocks as TemplateRow['blocks'], skeleton: skeleton as TemplateRow['skeleton'] });
}

/** The `seed_version` a stored row carries, whatever its type. */
export function templateSeedVersionOf(row: unknown): unknown {
  return typeof row === 'object' && row !== null ? (row as { seed_version?: unknown }).seed_version : undefined;
}

/**
 * What the step decides for one stored template row: nothing (removed, already current, or
 * no template row), a move to `target`, or a skip of a live row on an older version that does
 * not validate on the current one (logged by the caller).
 */
export type TemplateSeedDecision = { kind: 'none' } | { kind: 'move'; from: unknown; target: string } | { kind: 'invalid'; from: unknown };

export function templateSeedDecision(row: unknown, removedAt: string | null): TemplateSeedDecision {
  if (row === undefined || row === null || removedAt !== null) return { kind: 'none' };
  const from = templateSeedVersionOf(row);
  if (from === SEED_VERSION) return { kind: 'none' };
  const target = templateSeedTarget(row);
  return target === null ? { kind: 'invalid', from } : { kind: 'move', from, target };
}

/** The server op that moves template `id` to `target`, in a batch of its own, stamped `at`. */
export function templateSeedMoveOp(companyId: string, id: string, target: string, at: Date = now()): Op {
  return serverOp({
    opId: newId(),
    companyId,
    actorId: SYSTEM_IDENTITY_ACTOR,
    clientTs: toIso(at),
    kind: 'put',
    path: `template/${id}/seed_version`,
    value: target,
    scope: 'company',
    batchId: newId(),
  });
}
