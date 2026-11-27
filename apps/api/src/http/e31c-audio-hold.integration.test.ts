import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BLOCK_CHAVE_ID } from '@app/domain/fixtures/porto-seguro/small';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  fileFieldPath,
  generateResponseSchema,
  makeOp,
  preIssueBlockedDetailsSchema,
  syncPushResponseSchema,
  type JsonValue,
  type OpInput,
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
import { transcriptionServerOp } from '../jobs/transcription/status.ts';
import { createS3 } from '../storage/s3.ts';
import { applyServerBatch } from '../sync/apply.ts';
import { createApp } from './app.ts';

/*
 * 31.6-API-001 (batch e31c, Story 31.6; AD-30, AD-15): the server refuses to issue a relatório that holds an audio
 * still on its way (`audios_pending`) or one whose transcription failed (`audios_failed`, the coordinator's reading,
 * open to Matheus), as the device's Export dialog does: `409 pre_issue_blocked` naming the kind, no job. The audio
 * reaches the server through the sync route as a device records it; the job's `failed` is a `system:transcription`
 * op; the device's "Dispensar" pushed the same way frees the issue, which is then queued. The app runs in process
 * with a recording queue; the session cookie comes from the compose api.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const staticDir = mkdtempSync(join(tmpdir(), 'e31c-hold-'));
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
const GOOD = { level: 0.2, clipped_share: 0, noise_ratio: 0.1, duration_ms: 4000, speech_ms: 3000, verdict: 'good', reasons: [] };

const headers = () => ({ cookie, 'content-type': 'application/json', [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) });

async function generate(): Promise<Response> {
  return await app.request(`/api/relatorios/${SMALL_FIXTURE_RELATORIO_ID}/generate`, { method: 'POST', headers: headers(), body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }) });
}

/** One op pushed through the sync route as the device pushes it. */
async function push(input: Pick<OpInput, 'kind' | 'path' | 'value'>): Promise<void> {
  const op = makeOp(
    {
      ...input,
      scope: 'relatorio',
      company_id: companyA.companyId,
      project_id: null,
      relatorio_id: SMALL_FIXTURE_RELATORIO_ID,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
      device_id: 'tablet-e31c-hold',
    },
    { newId, now: now() },
  );
  const pushed = await app.request('/api/sync/ops', { method: 'POST', headers: headers(), body: JSON.stringify({ ops: [op] }) });
  expect(pushed.status, await pushed.clone().text()).toBe(200);
  expect(syncPushResponseSchema.parse(await pushed.json()).rejected).toEqual([]);
}

async function blockedKinds(): Promise<string[]> {
  const refused = await generate();
  expect(refused.status, await refused.clone().text()).toBe(409);
  const error = errorResponseSchema.parse(await refused.json());
  expect(error.code).toBe('pre_issue_blocked');
  return preIssueBlockedDetailsSchema.parse(error.details).rows;
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { parecer: TEST_PARECER });
  const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin: apiUrl, 'content-type': 'application/json' },
    body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}, 60_000);

afterAll(async () => {
  await removePortoSeguroSmall(db);
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('31.6-API-001 a pending or failed audio blocks the issue on the server', () => {
  it('queued: 409 audios_pending; failed: 409 audios_failed; dismissed by the device: the issue is queued', async () => {
    const id = newId();
    await push({
      kind: 'create',
      path: `file/${id}`,
      value: {
        id,
        company_id: companyA.companyId,
        relatorio_id: SMALL_FIXTURE_RELATORIO_ID,
        kind: 'audio',
        sha256: 'c'.repeat(64),
        mime: 'audio/webm',
        size: 10,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        audio_target: { type: 'sheet_field', block_id: BLOCK_CHAVE_ID, field: 'observations' },
        audio_status: 'queued',
        quality: GOOD,
        transcript_heard: null,
        transcript_written: null,
        transcription_run_id: null,
      } as unknown as JsonValue,
    });
    expect(await blockedKinds()).toEqual(['audios_pending']);
    expect(sent).toHaveLength(0);

    // The job's third failure, as the job writes it.
    await applyServerBatch(
      db,
      asCompanyId(companyA.companyId),
      [transcriptionServerOp({ companyId: companyA.companyId, relatorioId: SMALL_FIXTURE_RELATORIO_ID, kind: 'put', path: fileFieldPath(id, 'audio_status'), value: 'failed', batchId: null, now, newId })],
      { now },
    );
    expect(await blockedKinds()).toEqual(['audios_failed']);
    expect(sent).toHaveLength(0);

    // "Dispensar": the device's one status write. The audio stays stored and holds nothing.
    await push({ kind: 'put', path: fileFieldPath(id, 'audio_status'), value: 'dismissed' });
    const queued = await generate();
    expect(queued.status, await queued.clone().text()).toBe(202);
    expect(generateResponseSchema.parse(await queued.json())).toMatchObject({ outcome: 'queued' });
    expect(sent).toHaveLength(1);
    const [stored] = await sql<{ row: { audio_status: string; removed_at: string | null } }[]>`select row from entities where entity = 'file' and id = ${id}`;
    expect(stored!.row).toMatchObject({ audio_status: 'dismissed', removed_at: null });
  }, 60_000);
});
