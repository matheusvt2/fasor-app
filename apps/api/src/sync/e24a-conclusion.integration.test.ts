import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  conclusionPairWrites,
  conclusionTextOnConclude,
  effectiveConclusionPair,
  EMPTY_DEFINITION_CONTEXT,
  getDefinition,
  instantiateTemplate,
  makeOp,
  printedConclusionPair,
  sheetChecklistPath,
  sheetConclusionPath,
  sheetObservationsPath,
  sheetTestCellPath,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type BlockRow,
  type JsonValue,
  type Op,
  type OpDraft,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';

/*
 * 24.3-API-001 (batch e24a, Story 24.3, seed v14): "Concluir ficha" on a sheet a reading out of its
 * criterion makes Reprovado, as the device builds it (`conclusionPairWrites` and
 * `conclusionTextOnConclude` on the fresh block): one batch with the result put, the stored restriction
 * removed (a put of null), the composed text and `concluded_by`. The server applies it op by op with no
 * rule of its own (the pair is derived on read): the row holds Reprovado and no restriction, and every
 * reader derives Reprovado with no restriction. The same sheet on v13 concludes as before: its batch puts
 * no restriction and the stored Com restrições stays.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-e24a-conclusion';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const written = { opIds: new Set<string>(), entityIds: new Set<string>() };
let cookie = '';

async function signIn(): Promise<string> {
  const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', origin: apiUrl },
    body: JSON.stringify({ email: company.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const call = () =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), cookie, ...(init.headers as Record<string, string> | undefined) },
    });
  const first = await call();
  if (first.status !== 401) return first;
  cookie = await signIn();
  return call();
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
  await sql.end();
});

/** Pushes drafts as one batch from the test device; every op and created row is removed after the file. */
async function push(drafts: readonly OpDraft[]): Promise<Op[]> {
  const batchId = newId();
  const at = now();
  const batch = drafts.map((draft) => makeOp({ ...draft, batch_id: drafts.length > 1 ? batchId : null, device_id: DEVICE }, { newId, now: at }));
  for (const op of batch) {
    written.opIds.add(op.op_id);
    if (op.kind === 'create') written.entityIds.add((op.value as { id: string }).id);
  }
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);
  return batch;
}

/** A put as the device writes it, `prevOpId` the op it last saw on the path (AD-3), so the merge reads it as sequential. */
function draft(relatorioId: string, path: string, value: JsonValue, prevOpId: string | null = null): OpDraft {
  return { kind: 'put', scope: 'relatorio', company_id: company.companyId, project_id: null, relatorio_id: relatorioId, path, value, prev_op_id: prevOpId, batch_id: null, meta: null, actor_id: company.userId };
}

async function blockRow(blockId: string): Promise<BlockRow> {
  const [record] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.id, blockId)));
  return record!.row as BlockRow;
}

/**
 * A relatório of the standard template on `seedVersion`, created through the sync route, its first
 * cable filled: every row Conforme, every phase's insulation at 300 MΩ (criterion > 400 MΩ), an
 * observation, and Com restrições tapped before the reading went out.
 */
async function cableOutOfCriterion(seedVersion: string): Promise<{ relatorioId: string; blockId: string }> {
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: company.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: `Obra ${seedVersion}`, site: `Obra ${seedVersion}`, removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: company.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId(), seedVersion }),
    { id: projectId },
    { service_start: '2026-11-11', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId, actorId: company.userId, companyId: company.companyId },
  );
  await push([project, ...drafts]);
  const cable = drafts.find((one) => one.kind === 'create' && one.path.startsWith('block/') && (one.value as { block_type: string }).block_type === 'cabos_entrada')!.value as { id: string };
  const definition = getDefinition(seedVersion, 'cabine_primaria', 'cabos_entrada');
  await push([
    ...definition.checklist!.map((item) => draft(relatorioId, sheetChecklistPath(cable.id, item.key, 'result'), 'C')),
    ...[0, 1, 2, 3].map((row) => draft(relatorioId, sheetTestCellPath(cable.id, 'isolacao', row, 1), { raw: '300', unit: 'MΩ', state: 'measured' })),
    draft(relatorioId, sheetObservationsPath(cable.id), 'Isolação abaixo do aceitável nas quatro fases.'),
    draft(relatorioId, sheetConclusionPath(cable.id, 'restriction'), 'com_restricoes'),
  ]);
  return { relatorioId, blockId: cable.id };
}

/** "Concluir ficha" as `use-ficha-actions.ts` builds it from the fresh block the server holds. */
async function conclude(relatorioId: string, blockId: string): Promise<Op[]> {
  const fresh = await blockRow(blockId);
  const definition = getDefinition(fresh.seed_version, 'cabine_primaria', fresh.block_type);
  const text = conclusionTextOnConclude(fresh, definition, 'CE-1')!;
  const pair = conclusionPairWrites(fresh, definition);
  // The device names the op it last saw on each conclusion path (`db/commit.ts`).
  const seen = (field: 'result' | 'restriction') => {
    const cell = fresh.sheet.conclusion[field];
    return cell === undefined ? null : (cell.merge?.head_op_id ?? cell.op_id);
  };
  return push([
    ...(pair.result === null ? [] : [draft(relatorioId, sheetConclusionPath(blockId, 'result'), pair.result, seen('result'))]),
    ...(pair.restriction === null ? [] : [draft(relatorioId, sheetConclusionPath(blockId, 'restriction'), pair.restriction, seen('restriction'))]),
    ...(pair.clearRestriction ? [draft(relatorioId, sheetConclusionPath(blockId, 'restriction'), null, seen('restriction'))] : []),
    { ...draft(relatorioId, sheetConclusionPath(blockId, 'text'), text.text), meta: { composed: true } },
    draft(relatorioId, sheetConclusionPath(blockId, 'text_status'), 'confirmed'),
    draft(relatorioId, sheetConclusionPath(blockId, 'text_basis'), text.basis),
    draft(relatorioId, `block/${blockId}/concluded_by`, { actor_id: company.userId, at: now().toISOString() }),
  ]);
}

describe('24.3-API-001 the conclude batch of a v14 sheet a reading out makes Reprovado, through the sync route', () => {
  it(
    'v14: one batch puts Reprovado and removes the stored restriction; the row holds no restriction and reads Reprovado alone; the pull carries both puts',
    async () => {
      const { relatorioId, blockId } = await cableOutOfCriterion('v14');
      const before = await blockRow(blockId);
      expect(before.seed_version).toBe('v14');
      expect(before.sheet.conclusion.restriction?.value).toBe('com_restricoes');
      const batch = await conclude(relatorioId, blockId);
      const conclusionOps = batch.filter((op) => op.path.startsWith(`sheet/${blockId}/conclusion/`)).map((op) => [op.path.split('/').at(-1), op.value]);
      expect(conclusionOps.slice(0, 2)).toEqual([
        ['result', 'reprovado'],
        ['restriction', null],
      ]);
      expect(new Set(batch.map((op) => op.batch_id)).size).toBe(1);

      const after = await blockRow(blockId);
      expect(after.sheet.conclusion.result?.value).toBe('reprovado');
      expect(after.sheet.conclusion.restriction?.value ?? null).toBeNull();
      expect(after.concluded_by).not.toBeNull();
      const definition = getDefinition('v14', 'cabine_primaria', 'cabos_entrada');
      expect(effectiveConclusionPair(after, definition)).toEqual({ result: 'reprovado', restriction: null });
      expect(printedConclusionPair(after, definition)).toEqual({ result: 'reprovado', restriction: null });

      const pulled = await authed(`/api/sync/relatorios/${relatorioId}?since=0`);
      expect(pulled.status, await pulled.clone().text()).toBe(200);
      const stream = syncPullResponseSchema.parse(await pulled.json()).ops as Op[];
      const restriction = stream.filter((op) => op.path === sheetConclusionPath(blockId, 'restriction'));
      expect(restriction.map((op) => op.value)).toEqual(['com_restricoes', null]);
      expect(stream.filter((op) => op.path === sheetConclusionPath(blockId, 'result')).map((op) => op.value)).toEqual(['reprovado']);
    },
    60_000,
  );

  it(
    'v13: the same sheet concludes as before: no restriction put, the stored Com restrições stays, Reprovado · Com restrições',
    async () => {
      const { relatorioId, blockId } = await cableOutOfCriterion('v13');
      const batch = await conclude(relatorioId, blockId);
      expect(batch.some((op) => op.path === sheetConclusionPath(blockId, 'restriction'))).toBe(false);
      const after = await blockRow(blockId);
      expect(after.sheet.conclusion.restriction?.value).toBe('com_restricoes');
      expect(effectiveConclusionPair(after, getDefinition('v13', 'cabine_primaria', 'cabos_entrada'))).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    },
    60_000,
  );
});
