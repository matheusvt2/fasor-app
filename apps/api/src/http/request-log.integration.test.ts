import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID } from '../db/test-fixtures.ts';
import { createS3 } from '../storage/s3.ts';
import { createApp } from './app.ts';

/*
 * The structured request log names the relatório a request was about: the relatório stream
 * route and the generate routes set `relatorioId`, and the `http_request` line carries it
 * next to the company. The app runs in process so its stdout can be read; the session
 * cookie comes from the compose api (sessions live in Postgres).
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
const staticDir = mkdtempSync(join(tmpdir(), 'request-log-'));
const up = async () => undefined;
const app = createApp({ probes: { db: up, queue: up, storage: up, libreoffice: up }, auth, db, s3, bucket: config.S3_BUCKET, staticDir });

let cookie = '';

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId);
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

/** The `http_request` lines logged while `run` answers. */
async function requestLines(run: () => Response | Promise<Response>): Promise<{ response: Response; lines: Record<string, unknown>[] }> {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    const response = await run();
    const lines = spy.mock.calls
      .map(([first]) => {
        try {
          return JSON.parse(String(first)) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((line): line is Record<string, unknown> => line !== null && line.msg === 'http_request');
    return { response, lines };
  } finally {
    spy.mockRestore();
  }
}

const headers = () => ({ cookie, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) });

describe('the http_request log line names the relatório', () => {
  it('carries the relatorio_id and company_id of a relatório stream pull', async () => {
    const path = `/api/sync/relatorios/${SMALL_FIXTURE_RELATORIO_ID}`;
    const { response, lines } = await requestLines(() => app.request(`${path}?since=0`, { headers: headers() }));
    expect(response.status).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ path, status: 200, relatorio_id: SMALL_FIXTURE_RELATORIO_ID, company_id: companyA.companyId });
  });

  it('carries the relatorio_id of a generate press, even one answered 400', async () => {
    const path = `/api/relatorios/${SMALL_FIXTURE_RELATORIO_ID}/generate`;
    const { response, lines } = await requestLines(() =>
      app.request(path, { method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: '{}' }),
    );
    expect(response.status).toBe(400);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ method: 'POST', path, status: 400, relatorio_id: SMALL_FIXTURE_RELATORIO_ID, company_id: companyA.companyId });
  });
});
