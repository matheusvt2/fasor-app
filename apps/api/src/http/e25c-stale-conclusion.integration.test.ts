import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BLOCK_CHAVE_ID } from '@app/domain/fixtures/porto-seguro/small';
import {
  blockDefinitionIn,
  blockFieldPath,
  composeConclusion,
  conclusionTextForPrint,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  enabledSubBlocksOf,
  errorResponseSchema,
  generateResponseSchema,
  isEquipmentBlock,
  makeOp,
  preIssueBlockedDetailsSchema,
  toIso,
  sheetConclusionPath,
  sheetState,
  snapshotDefinitionContext,
  syncPushResponseSchema,
  visitContextOf,
  type JsonValue,
  type OpDraft,
  type RelatorioSnapshot,
} from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID, TEST_PARECER } from '../db/test-fixtures.ts';
import { newId } from '../ids.ts';
import type { GeneratePayload } from '../jobs/generate/job.ts';
import { createS3 } from '../storage/s3.ts';
import { toSnapshot } from '../sync/snapshot.ts';
import { createApp } from './app.ts';

/*
 * 25.7-API-001 (batch e25c, Story 25.7; M20, every seed): a device that still shows the old Export dialog asks
 * the server to issue a relatório one of whose concluded sheets holds a stale conclusion text, and the server
 * refuses it as it refuses a missing parecer (`409 pre_issue_blocked`, the row's kind in `details`). The stale
 * text reaches the server through the sync route; "Substituir" (the text composed now, with its basis) is pushed
 * the same way, and the next press is queued. The app runs in process with a recording queue, so no job is
 * rendered; the session cookie comes from the compose api (sessions live in Postgres).
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});
const staticDir = mkdtempSync(join(tmpdir(), 'e25c-stale-'));
const up = async () => undefined;
const sent: GeneratePayload[] = [];
const app = createApp({
  originGuard: 'off',
  probes: { db: up, queue: up, storage: up, libreoffice: up },
  auth,
  db,
  s3,
  bucket: config.S3_BUCKET,
  staticDir,
  enqueueGenerate: async (payload) => void sent.push(payload),
});

let cookie = '';

async function signIn(): Promise<string> {
  const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin: apiUrl, 'content-type': 'application/json' },
    body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

const headers = () => ({ cookie, 'content-type': 'application/json', [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) });

async function generate(): Promise<Response> {
  return await app.request(`/api/relatorios/${SMALL_FIXTURE_RELATORIO_ID}/generate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
  });
}

/** Puts on the sheet (`[path, value, meta]`), one batch, pushed through the sync route as a device pushes them. */
async function push(puts: readonly [string, JsonValue, OpDraft['meta']?][]): Promise<void> {
  const batch = newId();
  const ops = puts.map(([path, value, meta]) =>
    makeOp(
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: companyA.companyId,
        project_id: null,
        relatorio_id: SMALL_FIXTURE_RELATORIO_ID,
        path,
        value,
        prev_op_id: null,
        batch_id: batch,
        meta: meta ?? null,
        actor_id: companyA.userId,
        device_id: 'tablet-e25c-stale',
      },
      { newId, now: now() },
    ),
  );
  const pushed = await app.request('/api/sync/ops', { method: 'POST', headers: headers(), body: JSON.stringify({ ops }) });
  expect(pushed.status, await pushed.clone().text()).toBe(200);
  expect(syncPushResponseSchema.parse(await pushed.json()).rejected).toEqual([]);
}

const snapshot = (): Promise<RelatorioSnapshot> => toSnapshot(db, asCompanyId(companyA.companyId), SMALL_FIXTURE_RELATORIO_ID);

/** The fixture's chave seccionadora: whether its conclusion text prints, and the text its values compose now. */
function seccionadora(state: RelatorioSnapshot): { printed: boolean; text: string; basis: string } {
  const block = state.blocks.find((row) => row.id === BLOCK_CHAVE_ID)!;
  expect(isEquipmentBlock(block) && sheetState(block) === 'concluida' && enabledSubBlocksOf(block).has('conclusion')).toBe(true);
  const definition = blockDefinitionIn(snapshotDefinitionContext(state), block)!;
  const visit = visitContextOf(state, block);
  const tag = state.equipment.find((row) => row.id === block.equipment_id)?.tag ?? '';
  const composed = composeConclusion(block, definition, tag, visit);
  return { printed: conclusionTextForPrint(block, definition, visit) !== null, text: composed.text, basis: composed.basis };
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { parecer: TEST_PARECER });
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  await removePortoSeguroSmall(db);
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('25.7-API-001 the server refuses to issue while a concluded sheet holds a stale conclusion text', () => {
  it('a stale text pushed through the sync route: 409 pre_issue_blocked naming conclusion_stale, no job; "Substituir" pushed the same way, and the next press is queued', async () => {
    // The chave seccionadora concluded (Reprovado · Com restrições, a complete pair on its seed), with the text a
    // device confirmed before a value changed: its words and basis are no longer the ones composed now.
    await push([
      [sheetConclusionPath(BLOCK_CHAVE_ID, 'result'), 'reprovado'],
      [sheetConclusionPath(BLOCK_CHAVE_ID, 'restriction'), 'com_restricoes'],
      [sheetConclusionPath(BLOCK_CHAVE_ID, 'text'), 'Texto composto antes da mudança dos valores.', { composed: true }],
      [sheetConclusionPath(BLOCK_CHAVE_ID, 'text_status'), 'confirmed'],
      [sheetConclusionPath(BLOCK_CHAVE_ID, 'text_basis'), 'deadbeef'],
      [blockFieldPath(BLOCK_CHAVE_ID, 'concluded_by'), { actor_id: companyA.userId, at: toIso(now()) }],
    ]);
    expect(seccionadora(await snapshot()).printed).toBe(true);
    const refused = await generate();
    expect(refused.status, await refused.clone().text()).toBe(409);
    const error = errorResponseSchema.parse(await refused.json());
    expect(error.code).toBe('pre_issue_blocked');
    expect(preIssueBlockedDetailsSchema.parse(error.details).rows).toEqual(['conclusion_stale']);
    expect(sent).toHaveLength(0);

    // "Substituir": the text composed now, confirmed, with its basis.
    const fresh = seccionadora(await snapshot());
    await push([
      [sheetConclusionPath(BLOCK_CHAVE_ID, 'text'), fresh.text, { composed: true }],
      [sheetConclusionPath(BLOCK_CHAVE_ID, 'text_status'), 'confirmed'],
      [sheetConclusionPath(BLOCK_CHAVE_ID, 'text_basis'), fresh.basis],
    ]);
    const queued = await generate();
    expect(queued.status, await queued.clone().text()).toBe(202);
    expect(generateResponseSchema.parse(await queued.json())).toMatchObject({ outcome: 'queued' });
    expect(sent).toHaveLength(1);
  }, 60_000);
});
