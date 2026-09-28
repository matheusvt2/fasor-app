import { createRequire } from 'node:module';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  equipmentRowSchema,
  errorResponseSchema,
  generateResponseSchema,
  generationJobRowSchema,
  makeOp,
  preIssueBlockedDetailsSchema,
  previewResponseSchema,
  relatorioRowSchema,
  revisionRowSchema,
  SERVER_DEVICE_ID,
  syncPushResponseSchema,
  toIso,
  type GenerationJobRow,
  type Op,
  type RelatorioParecer,
} from '@app/domain';
import { BLOCK_CHAVE_ID, EQUIPMENT_CHAVE_ID, EQUIPMENT_DISJUNTOR_ID, EQUIPMENT_TRANSFORMADOR_ID } from '@app/domain/fixtures/porto-seguro/small';
import { and, eq } from 'drizzle-orm';
import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
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
import { applyOps } from '../sync/apply.ts';

/*
 * Stories 7.4 and 7.5 over the compose api (LibreOffice included), on the small Porto
 * Seguro fixture seeded onto Empresa A with no parecer: a bundle of the old contract is
 * refused a pull (426); the issue is refused with `409 pre_issue_blocked` while the parecer
 * is missing, and creates no job; a preview queues, renders and serves `preview.pdf` without
 * any status, revision or `last_nameplate`, even while an issue job runs; the parecer put
 * pushed through the sync route releases the issue, whose DOCX prints section 10 and whose
 * commit projects `last_nameplate`; R7's expiry decides which jobs still count as running.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;
type Company = (typeof TEST_SEED.companies)[number];

function call(path: string, init: RequestInit = {}, version = CONTRACT_VERSION): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(version), ...(init.headers as Record<string, string> | undefined) },
  });
}

const cookies = new Map<string, string>();

async function cookieOf(company: Company): Promise<string> {
  const known = cookies.get(company.email);
  if (known !== undefined) return known;
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: company.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  cookies.set(company.email, cookie);
  return cookie;
}

async function authed(company: Company, path: string, init: RequestInit = {}, version = CONTRACT_VERSION): Promise<Response> {
  return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie: await cookieOf(company) } }, version);
}

const post = (company: Company, path: string, body: unknown) =>
  authed(company, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const BARRIER = { last_op_id: null, file_ids_expected: [] };

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

async function jobRow(id: string): Promise<GenerationJobRow | null> {
  const [record] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.entity, 'generation_job'), eq(entities.id, id)));
  return record === undefined ? null : generationJobRowSchema.parse(record.row);
}

async function waitForJob(id: string, timeoutMs = 150_000): Promise<GenerationJobRow> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await jobRow(id);
    if (job !== null && (job.status === 'done' || job.status === 'failed')) return job;
    if (Date.now() > deadline) throw new Error(`job ${id} did not finish within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

/** A server op on the relatório stream, as the generate route writes its own. */
function serverOp(kind: Op['kind'], path: string, value: unknown): Op {
  return {
    op_id: newId(),
    kind,
    scope: 'relatorio',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: RELATORIO_ID,
    path,
    value: value as Op['value'],
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: 'system:generate',
    device_id: SERVER_DEVICE_ID,
    client_ts: toIso(now()),
  };
}

/** A job row nobody enqueued, as a worker that died would leave it. */
async function fakeJob(kind: 'issue' | 'preview', fields: { status: 'queued' | 'running'; created_at: string; started_at: string | null }): Promise<string> {
  const id = newId();
  const result = await applyOps(
    db,
    asCompanyId(companyA.companyId),
    [serverOp('create', `generation_job/${id}`, { id, relatorio_id: RELATORIO_ID, kind, error: null, result_file_id: null, result: null, ...fields })],
    { now, origin: 'server' },
  );
  expect(result.rejected).toEqual([]);
  return id;
}

async function endJob(id: string): Promise<void> {
  const result = await applyOps(db, asCompanyId(companyA.companyId), [serverOp('put', `generation_job/${id}/status`, 'failed')], { now, origin: 'server' });
  expect(result.rejected).toEqual([]);
}

const minutesAgo = (n: number) => toIso(new Date(now().getTime() - n * 60_000));

const PARECER: RelatorioParecer = { verdict: 'apto', text: 'Resumo do parecer confirmado.', text_status: 'confirmed', text_basis: 'b' };

/** One put of the device, pushed through the sync route. */
async function pushPut(path: string, value: unknown): Promise<Op> {
  const put = makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: companyA.companyId,
      project_id: null,
      relatorio_id: RELATORIO_ID,
      path,
      value: value as Op['value'],
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
      device_id: 'tablet-preview-a',
    },
    { newId, now: now() },
  );
  const pushed = await post(companyA, '/api/sync/ops', { ops: [put] });
  expect(syncPushResponseSchema.parse(await pushed.json()).rejected).toEqual([]);
  return put;
}

/** Story 7.4: the parecer is an ordinary setup put, pushed through the sync route; null clears it. */
const pushParecer = (value: RelatorioParecer | null): Promise<Op> => pushPut('relatorio/setup/parecer', value);

// pdfjs falls back to an in-process "fake worker" in Node, loaded from this path (as `pdf-outline.ts`).
GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

/** The text of every page, one string per page, and whether page 1 paints an image. */
async function readPdf(pdf: Buffer): Promise<{ pages: string[]; firstPageHasImage: boolean }> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    const ops = await (await doc.getPage(1)).getOperatorList();
    const images = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);
    return { pages, firstPageHasImage: ops.fnArray.some((fn) => images.has(fn)) };
  } finally {
    await task.destroy();
  }
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { responsibleUserId: companyA.userId });
}, 60_000);

afterAll(async () => {
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('7.4/7.5-INT parecer, preview and the blocked issue', () => {
  it('answers a pull from a version-4 bundle with 426 contract_outdated (it cannot parse the parecer)', async () => {
    const res = await authed(companyA, `/api/sync/relatorios/${RELATORIO_ID}?since=0`, {}, 4);
    expect(res.status).toBe(426);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('contract_outdated');
  });

  it('refuses the issue with 409 pre_issue_blocked while no parecer is set, and creates no job', async () => {
    await pushParecer(null);
    const jobsBefore = (await db.select({ id: entities.id }).from(entities).where(and(eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, RELATORIO_ID)))).length;
    const res = await post(companyA, `/api/relatorios/${RELATORIO_ID}/generate`, BARRIER);
    expect(res.status).toBe(409);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.code).toBe('pre_issue_blocked');
    expect(preIssueBlockedDetailsSchema.parse(body.details)).toEqual({ rows: ['parecer_missing'] });
    const jobs = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, RELATORIO_ID)));
    expect(jobs).toHaveLength(jobsBefore);
  });

  it("answers another company's preview press with 404 and queues no job", async () => {
    const jobsBefore = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, RELATORIO_ID)));
    const res = await post(companyB, `/api/relatorios/${RELATORIO_ID}/preview`, BARRIER);
    expect(res.status, await res.clone().text()).toBe(404);
    const jobs = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, RELATORIO_ID)));
    expect(jobs).toHaveLength(jobsBefore.length);
  });

  it(
    'queues a preview even while an issue job runs; it renders the RASCUNHO PDF, served at preview.pdf, and changes nothing else',
    async () => {
      const [before] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.entity, 'relatorio'), eq(entities.id, RELATORIO_ID)));
      const statusBefore = relatorioRowSchema.parse(before!.row).status;
      const issue = await fakeJob('issue', { status: 'running', created_at: minutesAgo(1), started_at: minutesAgo(1) });
      const res = await post(companyA, `/api/relatorios/${RELATORIO_ID}/preview`, BARRIER);
      expect(res.status, await res.clone().text()).toBe(202);
      const answer = previewResponseSchema.parse(await res.json());
      expect(answer.outcome).toBe('queued');
      // A second press while it runs answers the same job.
      const again = previewResponseSchema.parse(await (await post(companyA, `/api/relatorios/${RELATORIO_ID}/preview`, BARRIER)).json());
      expect(again).toEqual({ outcome: 'running', job_id: answer.job_id });

      const job = await waitForJob(answer.job_id);
      expect(job).toMatchObject({ kind: 'preview', status: 'done', error: null });
      expect(job.started_at).not.toBeNull();
      expect(job.result_file_id).not.toBeNull();
      await endJob(issue);

      const pulled = await pullRelatorio();
      const file = pulled.find((op) => op.kind === 'create' && op.path === `file/${job.result_file_id}`)?.value as { kind: string; mime: string } | undefined;
      expect(file).toMatchObject({ kind: 'preview', mime: 'application/pdf' });
      expect(pulled.find((op) => op.path === 'relatorio/preview_file_id')?.value).toBe(job.result_file_id);
      expect(pulled.some((op) => op.path.startsWith('revision/'))).toBe(false);
      expect(pulled.some((op) => op.path === 'relatorio/status' && op.actor_id === 'system:generate')).toBe(false);
      const [relatorio] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.entity, 'relatorio'), eq(entities.id, RELATORIO_ID)));
      expect(relatorioRowSchema.parse(relatorio!.row)).toMatchObject({ preview_file_id: job.result_file_id, status: statusBefore });
      const equipment = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.entity, 'equipment'), eq(entities.project_id, SMALL_FIXTURE_PROJECT_ID)));
      expect(equipment.every((r) => equipmentRowSchema.parse(r.row).last_nameplate === null)).toBe(true);

      const pdf = await authed(companyA, `/api/relatorios/${RELATORIO_ID}/preview.pdf?v=${job.result_file_id}`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
      const bytes = Buffer.from(await pdf.arrayBuffer());
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
      // The draft: the document control prints "—" for the revision, never "Rev. 1", and
      // page 1 carries the RASCUNHO watermark image.
      const read = await readPdf(bytes);
      const text = read.pages.join('\n');
      expect(text).toMatch(/Revisão do documento\s*—/);
      expect(text).not.toContain('Rev. 1');
      expect(read.firstPageHasImage).toBe(true);
      expect((await authed(companyB, `/api/relatorios/${RELATORIO_ID}/preview.pdf`)).status).toBe(404);
    },
    180_000,
  );

  it('R7: a queued job counts until its queue retention, a running one only until started_at plus the expiry', async () => {
    // Queued 30 minutes ago: still waiting for a worker (retention one hour). The press answers it.
    const queued = await fakeJob('issue', { status: 'queued', created_at: minutesAgo(30), started_at: null });
    const put = await pushParecer(PARECER);
    const running = generateResponseSchema.parse(await (await post(companyA, `/api/relatorios/${RELATORIO_ID}/generate`, { last_op_id: put.op_id, file_ids_expected: [] })).json());
    expect(running).toMatchObject({ outcome: 'running', job_id: queued });
    await endJob(queued);
  });

  it(
    'issues once the parecer is set, ignoring a preview job and a running job past its expiry; section 10 prints and last_nameplate is projected',
    async () => {
      // The parecer this test needs, set here whatever ran before it.
      await pushParecer(PARECER);
      // The fixture's sheets carry `sub_blocks: {}` (no nameplate switched on): the chave's
      // plate is switched on here, so only it prints and only it is projected.
      await pushPut(`block/${BLOCK_CHAVE_ID}/config`, { block_type: 'chave_seccionadora', subtype: 'manual', sub_blocks: { nameplate: { enabled: true } }, na_defaults: ['motor', 'fusiveis'] });
      await fakeJob('preview', { status: 'queued', created_at: minutesAgo(1), started_at: null });
      await fakeJob('issue', { status: 'running', created_at: minutesAgo(2), started_at: minutesAgo(20) });
      const res = await post(companyA, `/api/relatorios/${RELATORIO_ID}/generate`, BARRIER);
      expect(res.status, await res.clone().text()).toBe(202);
      const answer = generateResponseSchema.parse(await res.json());
      if (answer.outcome !== 'queued') throw new Error(`expected queued, got ${answer.outcome}`);
      const job = await waitForJob(answer.job_id);
      expect(job.status, job.error ?? '').toBe('done');

      const pulled = await pullRelatorio();
      const revision = revisionRowSchema.parse(pulled.find((op) => op.kind === 'create' && op.path.startsWith('revision/'))!.value);
      const docx = await authed(companyA, `/api/revisions/${revision.id}/docx`);
      const structure = extractStructure(Buffer.from(await docx.arrayBuffer()));
      expect(structure.tables).toContainEqual([['Apto\nResumo do parecer confirmado.']]);
      expect(structure.paragraphs.some((p) => p.startsWith('Este relatório tem validade apenas acompanhada da'))).toBe(true);
      expect(structure.paragraphs).toContain(companyA.name);

      // AD-25: every equipment whose plate the revision printed carries its projection now.
      const equipment = (await db.select({ row: entities.row }).from(entities).where(and(eq(entities.entity, 'equipment'), eq(entities.project_id, SMALL_FIXTURE_PROJECT_ID)))).map((r) =>
        equipmentRowSchema.parse(r.row),
      );
      const projected = equipment.filter((row) => row.last_nameplate !== null);
      // E7-A4: the small fixture's three sheets enable their template's sub-blocks, nameplate included, so all three plates print.
      expect(projected.map((row) => row.id).sort()).toEqual([EQUIPMENT_CHAVE_ID, EQUIPMENT_DISJUNTOR_ID, EQUIPMENT_TRANSFORMADOR_ID].sort());
      for (const row of projected) {
        expect(row.last_nameplate).toMatchObject({ relatorio_id: RELATORIO_ID, revision_number: revision.number });
        expect(Object.keys(row.last_nameplate!.fields).length).toBeGreaterThan(0);
      }
    },
    180_000,
  );
});
