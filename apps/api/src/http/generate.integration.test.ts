import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  DOCX_MIME,
  errorResponseSchema,
  generateResponseSchema,
  generationResultSchema,
  makeOp,
  notCaughtUpDetailsSchema,
  objectKey,
  revisionRowSchema,
  SERVER_DEVICE_ID,
  syncPushResponseSchema,
  toIso,
  type Op,
  type RevisionRow,
} from '@app/domain';
import { BLOCK_CHAVE_ID, EQUIPMENT_CHAVE_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_PROJECT_ID, SMALL_FIXTURE_RELATORIO_ID } from '../db/test-fixtures.ts';
import { newId } from '../ids.ts';
import { extractStructure } from '../jobs/generate/docx-structure.ts';
import { readOutline } from '../jobs/generate/pdf-outline.ts';
import { createS3, getObject } from '../storage/s3.ts';
import { applyOps } from '../sync/apply.ts';

/*
 * 4.8-INT-002: the generate route and the worker over the compose api, LibreOffice
 * included, on the small Porto Seguro fixture seeded onto Empresa A. Every step of the AC:
 * the 409 barrier, the 202 and the pulled revision, the DOCX download whose ÍNDICE pages
 * equal the PDF outline, the `unchanged` short-circuit, the second number after an edit,
 * and the cross-tenant 404.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;

type Company = (typeof TEST_SEED.companies)[number];

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string> | undefined) },
  });
}

const cookies = new Map<string, string>();

async function signIn(email: string): Promise<string> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function authed(company: Company, path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    let cookie = cookies.get(company.email);
    if (cookie === undefined || fresh) {
      cookie = await signIn(company.email);
      cookies.set(company.email, cookie);
    }
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } });
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

function generate(company: Company, body: unknown): Promise<Response> {
  return authed(company, `/api/relatorios/${RELATORIO_ID}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Every op of the relatório stream, page by page. */
async function pullRelatorio(): Promise<Op[]> {
  const all: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await authed(companyA, `/api/sync/relatorios/${RELATORIO_ID}?since=${since}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = (await res.json()) as { ops: Op[]; seq: number };
    all.push(...page.ops);
    const last = page.ops.at(-1)?.seq;
    if (last === undefined || last >= page.seq) return all;
    since = last;
  }
}

interface Finished {
  revision: RevisionRow;
  result: ReturnType<typeof generationResultSchema.parse>;
  pulled: Op[];
}

/** Polls the pulled stream until the revision with `number` and the job's result exist, or the job failed. */
async function waitForRevision(jobId: string, number: number, timeoutMs = 150_000): Promise<Finished> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pulled = await pullRelatorio();
    const failed = pulled.find((op) => op.path === `generation_job/${jobId}/status` && op.value === 'failed');
    if (failed !== undefined) {
      const error = pulled.find((op) => op.path === `generation_job/${jobId}/error`)?.value;
      throw new Error(`generate job ${jobId} failed: ${String(error)}`);
    }
    const revisionOp = pulled.find((op) => op.kind === 'create' && op.path.startsWith('revision/') && (op.value as { number: number }).number === number);
    const resultOp = pulled.find((op) => op.path === `generation_job/${jobId}/result`);
    if (revisionOp !== undefined && resultOp !== undefined) {
      return { revision: revisionRowSchema.parse(revisionOp.value), result: generationResultSchema.parse(resultOp.value), pulled };
    }
    if (Date.now() > deadline) throw new Error(`revision ${number} did not arrive within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  // The fixture remapped onto Empresa A, its responsible pointed at Empresa A's own user (a real `user` row).
  await seedPortoSeguroSmall(db, companyA.companyId, { responsibleUserId: companyA.userId });
}, 60_000);

afterAll(async () => {
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('4.8-INT-002 POST /api/relatorios/:id/generate and GET /api/revisions/:id/docx', () => {
  let firstRevision: RevisionRow;
  let photoFileId: string;

  it('answers 409 not_caught_up naming the missing op and files, and creates no job', async () => {
    const res = await generate(companyA, { last_op_id: newId(), file_ids_expected: [newId()] });
    expect(res.status).toBe(409);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.code).toBe('not_caught_up');
    const details = notCaughtUpDetailsSchema.parse(body.details);
    expect(details.missing_op).toBe(true);
    expect(details.missing_files).toHaveLength(1);
    const jobs = await db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, RELATORIO_ID)));
    expect(jobs).toEqual([]);
    const pulled = await pullRelatorio();
    expect(pulled.some((op) => op.path.startsWith('generation_job/'))).toBe(false);
  });

  it('answers 409 naming a file row that exists but was never uploaded, until the server stores it', async () => {
    // A photo the device says it holds, pushed as the user would: a `file` create whose row is not uploaded yet.
    const bytes = Buffer.from('not really a jpeg');
    photoFileId = newId();
    const create = makeOp(
      {
        kind: 'create',
        scope: 'relatorio',
        company_id: companyA.companyId,
        project_id: null,
        relatorio_id: RELATORIO_ID,
        path: `file/${photoFileId}`,
        value: {
          id: photoFileId,
          company_id: companyA.companyId,
          relatorio_id: RELATORIO_ID,
          kind: 'photo',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          mime: 'image/jpeg',
          size: bytes.byteLength,
          uploaded_at: null,
          variants: null,
          removed_at: null,
          captured_at: '2026-09-06T12:00:00.000Z',
          tz_offset: -180,
          coords: null,
          local_seq: 1,
          block_id: BLOCK_CHAVE_ID,
          item_key: null,
          caption: null,
          reading_kind: null,
          reading_target: null,
          reading_status: 'none',
        },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: companyA.userId,
        device_id: 'tablet-generate-a',
      },
      { newId, now: now() },
    );
    const pushed = await authed(companyA, '/api/sync/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: [create] }),
    });
    expect(syncPushResponseSchema.parse(await pushed.json()).rejected).toEqual([]);

    const res = await generate(companyA, { last_op_id: create.op_id, file_ids_expected: [photoFileId] });
    expect(res.status).toBe(409);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.code).toBe('not_caught_up');
    expect(notCaughtUpDetailsSchema.parse(body.details)).toEqual({ missing_op: false, missing_files: [photoFileId] });

    // The server stores the bytes and says so, as `files.ts` does after a PUT.
    const stored = await applyOps(
      db,
      asCompanyId(companyA.companyId),
      [
        {
          op_id: newId(),
          company_id: companyA.companyId,
          scope: 'relatorio',
          project_id: null,
          relatorio_id: RELATORIO_ID,
          kind: 'put',
          path: `file/${photoFileId}/uploaded_at`,
          value: toIso(now()),
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: 'system:files',
          device_id: SERVER_DEVICE_ID,
          client_ts: toIso(now()),
        },
      ],
      { now, origin: 'server' },
    );
    expect(stored.rejected).toEqual([]);
    // The 202 test below sends this same file id and is no longer refused for it.
  });

  it('answers 400 invalid_request for a body that is not the contract, 404 for an unknown relatório', async () => {
    const bad = await generate(companyA, { last_op_id: 'x' });
    expect(bad.status).toBe(400);
    expect(errorResponseSchema.parse(await bad.json()).code).toBe('invalid_request');
    const unknown = await authed(companyA, `/api/relatorios/${newId()}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
    });
    expect(unknown.status).toBe(404);
  });

  it(
    'accepts the generate (202 queued), the worker renders both files, and the revision reaches the pull with a converged TOC',
    async () => {
      const lastOp = portoSeguroSmall.log.at(-1)!.op_id;
      // The stored photo of the test above is expected and no longer blocks the barrier.
      const res = await generate(companyA, { last_op_id: lastOp, file_ids_expected: [photoFileId] });
      expect(res.status, await res.clone().text()).toBe(202);
      const answer = generateResponseSchema.parse(await res.json());
      if (answer.outcome !== 'queued') throw new Error(`expected queued, got ${answer.outcome}`);
      expect(answer.revision_number).toBe(1);

      // While it runs (or is queued), a second press answers `running` with the same number.
      const again = generateResponseSchema.parse(await (await generate(companyA, { last_op_id: lastOp, file_ids_expected: [] })).json());
      expect(['running', 'unchanged']).toContain(again.outcome);

      const finished = await waitForRevision(answer.job_id, 1);
      firstRevision = finished.revision;
      expect(firstRevision).toMatchObject({ number: 1, relatorio_id: RELATORIO_ID, created_by: companyA.userId });
      expect(firstRevision.snapshot_seq).toBeGreaterThan(0);
      expect([2, 3]).toContain(finished.result.toc_passes);
      expect(finished.result.toc_converged).toBe(true);
      expect(finished.result.pages).toBeGreaterThan(0);
      expect(finished.result.duration_ms).toBeGreaterThan(0);

      const fileCreates = finished.pulled.filter((op) => op.kind === 'create' && op.path.startsWith('file/')).map((op) => op.value as { id: string; kind: string; uploaded_at: string | null; mime: string });
      const docx = fileCreates.find((f) => f.id === firstRevision.docx_file_id);
      const pdf = fileCreates.find((f) => f.id === firstRevision.pdf_file_id);
      expect(docx).toMatchObject({ kind: 'docx', mime: DOCX_MIME });
      expect(docx?.uploaded_at).not.toBeNull();
      expect(pdf).toMatchObject({ kind: 'pdf', mime: 'application/pdf' });
      expect(pdf?.uploaded_at).not.toBeNull();
      const statusOps = finished.pulled.filter((op) => op.path === `generation_job/${answer.job_id}/status`).map((op) => op.value);
      expect(statusOps).toEqual(['running', 'done']);
      for (const op of finished.pulled.filter((o) => o.path.startsWith('generation_job/') || o.path.startsWith('revision/'))) {
        expect(op.actor_id).toBe('system:generate');
        expect(op.device_id).toBe('server');
      }
    },
    180_000,
  );

  it('serves the DOCX with the download headers, and its ÍNDICE pages equal the PDF outline', async () => {
    const res = await authed(companyA, `/api/revisions/${firstRevision.id}/docx`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(DOCX_MIME);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="relatorio-rev-1.docx"');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const docx = Buffer.from(await res.arrayBuffer());
    const structure = extractStructure(docx);
    expect(structure.headings).toHaveLength(11);
    expect(structure.tables[1]![1]).toEqual(['Revisão do documento', 'Rev. 1']);
    expect(structure.tables[1]![5]![1]).toBe(`${companyA.name} · CREA ${companyA.registrationNumber}`);
    const printed = new Map(
      structure.paragraphs
        .filter((p) => /^\d+ .*\t\d+$/.test(p))
        .map((p) => {
          const [text, page] = p.split('\t');
          return [text!, Number(page)];
        }),
    );
    expect(printed.size).toBe(11);

    const stored = await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'pdf', firstRevision.pdf_file_id));
    expect(stored).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stored!.body) chunks.push(chunk as Buffer);
    const outline = await readOutline(Buffer.concat(chunks));
    expect(outline.headings).toHaveLength(11);
    for (const heading of outline.headings) expect(printed.get(heading.title), heading.title).toBe(heading.page);
  }, 60_000);

  it('answers unchanged with the last revision when nothing was edited since its snapshot', async () => {
    const res = await generate(companyA, { last_op_id: null, file_ids_expected: [] });
    expect(res.status).toBe(200);
    expect(generateResponseSchema.parse(await res.json())).toEqual({ outcome: 'unchanged', revision_id: firstRevision.id, revision_number: 1 });
  });

  it(
    'allocates number 2 after an edit, and never 1 again',
    async () => {
      const edit = makeOp(
        {
          kind: 'put',
          scope: 'relatorio',
          company_id: companyA.companyId,
          project_id: null,
          relatorio_id: RELATORIO_ID,
          path: 'relatorio/setup/local',
          value: 'Torre editada',
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: companyA.userId,
          device_id: 'tablet-generate-a',
        },
        { newId, now: now() },
      );
      const pushed = await authed(companyA, '/api/sync/ops', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ops: [edit] }),
      });
      expect(syncPushResponseSchema.parse(await pushed.json()).rejected).toEqual([]);

      const res = await generate(companyA, { last_op_id: edit.op_id, file_ids_expected: [] });
      expect(res.status, await res.clone().text()).toBe(202);
      const answer = generateResponseSchema.parse(await res.json());
      if (answer.outcome !== 'queued') throw new Error(`expected queued, got ${answer.outcome}`);
      expect(answer.revision_number).toBe(2);
      const finished = await waitForRevision(answer.job_id, 2);
      expect(finished.revision.number).toBe(2);
      expect(finished.revision.snapshot_seq).toBeGreaterThan(firstRevision.snapshot_seq);
    },
    180_000,
  );

  it(
    'counts a project-scope edit (an equipment TAG) as an edit too: number 3',
    async () => {
      const tag = makeOp(
        {
          kind: 'put',
          scope: 'project',
          company_id: companyA.companyId,
          project_id: SMALL_FIXTURE_PROJECT_ID,
          relatorio_id: null,
          path: `equipment/${EQUIPMENT_CHAVE_ID}/tag`,
          value: 'SEC-RENOMEADA',
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: companyA.userId,
          device_id: 'tablet-generate-a',
        },
        { newId, now: now() },
      );
      const pushed = await authed(companyA, '/api/sync/ops', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ops: [tag] }),
      });
      expect(syncPushResponseSchema.parse(await pushed.json()).rejected).toEqual([]);

      const res = await generate(companyA, { last_op_id: tag.op_id, file_ids_expected: [] });
      expect(res.status, await res.clone().text()).toBe(202);
      const answer = generateResponseSchema.parse(await res.json());
      if (answer.outcome !== 'queued') throw new Error(`expected queued, got ${answer.outcome}`);
      expect(answer.revision_number).toBe(3);
      // Waited for, so the suite ends with no job running against rows the cleanup removes.
      expect((await waitForRevision(answer.job_id, 3)).revision.number).toBe(3);
    },
    180_000,
  );

  it('answers 404 to another company and 401 without a session', async () => {
    const other = await authed(companyB, `/api/revisions/${firstRevision.id}/docx`);
    expect(other.status).toBe(404);
    expect(errorResponseSchema.parse(await other.json()).code).toBe('not_found');
    const otherGenerate = await authed(companyB, `/api/relatorios/${RELATORIO_ID}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
    });
    expect(otherGenerate.status).toBe(404);
    expect((await call(`/api/revisions/${firstRevision.id}/docx`)).status).toBe(401);
    expect((await call(`/api/revisions/not-a-uuid/docx`, { headers: { cookie: cookies.get(companyA.email) ?? '' } })).status).toBe(404);
  });
});
