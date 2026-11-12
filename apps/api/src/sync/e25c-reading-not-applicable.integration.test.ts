import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  EMPTY_DEFINITION_CONTEXT,
  evaluatedCells,
  evaluateSheetReadings,
  getDefinition,
  instantiateTemplate,
  makeOp,
  notApplicableReadingValue,
  sheetTestCellPath,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type BlockRow,
  type Op,
  type OpDraft,
} from '@app/domain';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { newId } from '../ids.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * 25.9-API-001 (batch e25c, Story 25.9, seed v15 `reading_not_applicable`; no contract bump): "Não se aplica" on a
 * reading cell through the sync route. On a v15 relatório the TP's third insulation phase and its whole ratio row
 * are pushed `not_applicable` (the cell's menu and the row's action), applied with no rejection, pulled back as
 * pushed, and the server's snapshot reads them as the device does: N/A, filled, never judged, VAL CALCULADO and
 * CONDIÇÕES not computed. The same put on a v14 relatório is applied exactly as the fold always applied it (a test
 * cell takes any value, K-10) and reads as before (`invalid`, never N/A): what the fold accepts does not change.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-e25c-reading-na';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

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

async function pushOps(batch: Op[]): Promise<void> {
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  const pushed = syncPushResponseSchema.parse(await res.json());
  expect(pushed.rejected).toEqual([]);
  expect(pushed.applied).toHaveLength(batch.length);
}

/** A relatório on `seedVersion` created from the standard template through the sync route; its TP's block id. */
async function createRelatorio(seedVersion: string): Promise<{ relatorioId: string; tpId: string }> {
  const projectId = newId();
  const projectDraft: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: company.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: `Obra N/A ${seedVersion}`, site: 'Obra sintética', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: company.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId(), seedVersion }),
    { id: projectId },
    { service_start: '2026-11-12', service_end: '2026-11-12', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId, actorId: company.userId, companyId: company.companyId },
  );
  const batchId = newId();
  const at = now();
  const batch: Op[] = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: at }));
  for (const op of batch) {
    written.opIds.add(op.op_id);
    written.entityIds.add((op.value as { id: string }).id);
  }
  await pushOps(batch);
  const tp = drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('block/') && (draft.value as { block_type?: string }).block_type === 'tp')!;
  return { relatorioId, tpId: (tp.value as { id: string }).id };
}

/** The puts of the TP: its third insulation phase, and every typed cell of its third ratio row, "Não se aplica". */
function notApplicablePuts(relatorioId: string, tpId: string): Op[] {
  const batchId = newId();
  const at = now();
  const puts: [string, number, number, string | null][] = [
    ['isolacao', 2, 1, 'GΩ'],
    ['relacao_transformacao', 2, 0, 'V'],
    ['relacao_transformacao', 2, 1, 'V'],
    ['relacao_transformacao', 2, 3, null],
  ];
  const batch = puts.map(([testKey, row, col, unit]) =>
    makeOp(
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: relatorioId,
        path: sheetTestCellPath(tpId, testKey, row, col),
        value: notApplicableReadingValue(unit),
        prev_op_id: null,
        batch_id: batchId,
        meta: null,
        actor_id: company.userId,
        device_id: DEVICE,
      },
      { newId, now: at },
    ),
  );
  for (const op of batch) written.opIds.add(op.op_id);
  return batch;
}

/** The TP as the server's snapshot holds it, with its evaluation. */
async function serverTp(relatorioId: string, tpId: string) {
  const snapshot = await toSnapshot(db, asCompanyId(company.companyId), relatorioId);
  const block = snapshot.blocks.find((row) => row.id === tpId) as BlockRow;
  const evaluations = evaluateSheetReadings(block, getDefinition(block.seed_version, 'cabine_primaria', block.block_type));
  return { block, evaluations };
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

describe('25.9-API-001 "Não se aplica" on a reading cell through the sync route', () => {
  it(
    'v15: the cell and the whole ratio row are applied, pulled back as pushed, and the server reads them N/A, filled and never judged',
    async () => {
      const { relatorioId, tpId } = await createRelatorio('v15');
      const batch = notApplicablePuts(relatorioId, tpId);
      await pushOps(batch);

      const pull = await authed(`/api/sync/relatorios/${relatorioId}?since=0`);
      expect(pull.status, await pull.clone().text()).toBe(200);
      const pulled = syncPullResponseSchema.parse(await pull.json()).ops as Op[];
      for (const op of batch) expect(pulled.find((one) => one.op_id === op.op_id)?.value, op.path).toEqual(op.value);

      const { block, evaluations } = await serverTp(relatorioId, tpId);
      expect(block.seed_version).toBe('v15');
      expect(block.sheet.test.isolacao?.cells['2']?.['1']?.value).toEqual(notApplicableReadingValue('GΩ'));
      const phase = evaluatedCells(evaluations).find((one) => one.address.testKey === 'isolacao' && one.address.row === 2)!;
      expect(phase).toMatchObject({ state: 'not_applicable', displayText: 'N/A', missing: false, verdict: null });
      const row = evaluations.find((test) => test.testKey === 'relacao_transformacao')!.tables[0]!.rows[2]!;
      expect(row.cells.map((one) => one.state)).toEqual(['not_applicable', 'not_applicable', 'not_applicable']);
      expect(row).toMatchObject({ notApplicable: true, calculated: null, condicao: null });
    },
    120_000,
  );

  it(
    'v14: the same puts are applied as the fold always applied them, and read as before (invalid, never N/A)',
    async () => {
      const { relatorioId, tpId } = await createRelatorio('v14');
      const batch = notApplicablePuts(relatorioId, tpId);
      await pushOps(batch);
      const { block, evaluations } = await serverTp(relatorioId, tpId);
      expect(block.seed_version).toBe('v14');
      expect(block.sheet.test.isolacao?.cells['2']?.['1']?.value).toEqual(notApplicableReadingValue('GΩ'));
      const phase = evaluatedCells(evaluations).find((one) => one.address.testKey === 'isolacao' && one.address.row === 2)!;
      expect(phase.state).toBe('invalid');
      expect(phase.displayText).not.toBe('N/A');
      const row = evaluations.find((test) => test.testKey === 'relacao_transformacao')!.tables[0]!.rows[2]!;
      expect(row.notApplicable).toBeUndefined();
      expect(row.cells.every((one) => one.state === 'invalid')).toBe(true);
    },
    120_000,
  );
});
