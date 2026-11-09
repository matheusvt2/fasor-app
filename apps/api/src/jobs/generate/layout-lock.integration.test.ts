import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, generationJobRowSchema, previewResponseSchema, type GenerationJobRow, type Op } from '@app/domain';
import { LAYOUT_LOCK_VERSIONS, layoutLockFixture, type LayoutLockFixture } from '@app/domain/fixtures/layout-lock';
import { and, eq, inArray, or } from 'drizzle-orm';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../auth/auth.ts';
import { parseTrustedOrigins } from '../../auth/trusted-origins.ts';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, ops } from '../../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../../db/seed.ts';
import { applyOps } from '../../sync/apply.ts';

/*
 * Story 23.2, the Epic 23 layout lock, PDF half (23.2-INT-LOCK): the synthetic v5, v11 and v12
 * relatórios of `@app/domain/fixtures/layout-lock` are applied onto Empresa A, previewed through the
 * api (its worker, its LibreOffice), and the text of every page of each PDF is pinned in
 * `golden/layout-lock-{version}/pdf-text.json`. Dates are masked (the preview is dated the day it
 * renders). Every later Epic 23 PR keeps these byte-equal; a drift is a defect against the
 * protection, never a golden update. Taken on main a3b0ec0e with `GOLDEN_UPDATE=1`. The DOCX half is
 * `docx-layout-lock.test.ts`.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const GOLDEN_DIR = resolve(__dirname, 'golden');

const fixtures: LayoutLockFixture[] = LAYOUT_LOCK_VERSIONS.map((version) =>
  layoutLockFixture(version, { companyId: companyA.companyId, actorId: companyA.userId, deviceId: 'tablet-layout-lock' }),
);

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string> | undefined) },
  });
}

let cookie = '';

async function jobRow(id: string): Promise<GenerationJobRow | null> {
  const [record] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.entity, 'generation_job'), eq(entities.id, id)));
  return record === undefined ? null : generationJobRowSchema.parse(record.row);
}

async function waitForJob(id: string, timeoutMs = 170_000): Promise<GenerationJobRow> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await jobRow(id);
    if (job !== null && (job.status === 'done' || job.status === 'failed')) return job;
    if (Date.now() > deadline) throw new Error(`job ${id} did not finish within ${timeoutMs} ms`);
    await new Promise((done) => setTimeout(done, 1500));
  }
}

// pdfjs falls back to an in-process "fake worker" in Node, loaded from this path (as `pdf-outline.ts`).
GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

/** The text of every page, items joined by a space, whitespace collapsed, dates masked. */
async function pageTexts(pdf: Buffer): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      pages.push(text.replace(/\s+/g, ' ').replace(/\d{2}\/\d{2}\/\d{4}/g, 'DD/MM/AAAA').trim());
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

async function removeFixtures(): Promise<void> {
  const relatorios = fixtures.map((f) => f.relatorioId);
  const projects = fixtures.map((f) => f.projectId);
  const opIds = fixtures.flatMap((f) => f.log.map((op) => op.op_id));
  await db.transaction(async (tx) => {
    await tx.delete(ops).where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, opIds), inArray(ops.relatorio_id, relatorios), inArray(ops.project_id, projects))));
    await tx
      .delete(entities)
      .where(and(eq(entities.company_id, companyA.companyId), or(inArray(entities.relatorio_id, relatorios), inArray(entities.project_id, projects), inArray(entities.id, projects))));
  });
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await removeFixtures();
  for (const fixture of fixtures) {
    const result = await applyOps(db, asCompanyId(companyA.companyId), fixture.log.map((op): Op => ({ ...op })), { now, origin: 'server' });
    expect(result.rejected, fixture.version).toEqual([]);
  }
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}, 60_000);

afterAll(async () => {
  await removeFixtures();
  await sql.end();
});

describe('23.2-INT-LOCK the PDF text of the locked seed versions is byte-equal to its golden', () => {
  it.each(fixtures.map((fixture) => [fixture.version, fixture] as const))(
    '%s: the preview PDF of the synthetic relatório prints its golden text, page by page',
    async (version, fixture) => {
      const res = await call(`/api/relatorios/${fixture.relatorioId}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
      });
      expect(res.status, await res.clone().text()).toBe(202);
      const answer = previewResponseSchema.parse(await res.json());
      const job = await waitForJob(answer.job_id);
      expect(job.status, job.error ?? '').toBe('done');
      const pdf = await call(`/api/relatorios/${fixture.relatorioId}/preview.pdf?v=${job.result_file_id}`, { headers: { cookie } });
      expect(pdf.status).toBe(200);
      const pages = await pageTexts(Buffer.from(await pdf.arrayBuffer()));
      const file = resolve(GOLDEN_DIR, `layout-lock-${version}`, 'pdf-text.json');
      const text = `${JSON.stringify(pages, null, 2)}\n`;
      if (process.env.GOLDEN_UPDATE === '1') {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      } else if (!existsSync(file)) {
        throw new Error(`${file} is missing; the layout lock is taken once, deliberately, with GOLDEN_UPDATE=1`);
      }
      const golden = readFileSync(file, 'utf8');
      expect(pages, `${version} PDF text`).toEqual(JSON.parse(golden));
      expect(text === golden, `${version} PDF text bytes`).toBe(true);
    },
    200_000,
  );
});
