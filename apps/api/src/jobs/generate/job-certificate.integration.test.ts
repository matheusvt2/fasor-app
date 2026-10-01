import { createHash } from 'node:crypto';
import { generationJobRowSchema, objectKey, SERVER_DEVICE_ID, toIso, type LayoutSectionCertificates, type Op } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../../auth/auth.ts';
import { parseTrustedOrigins } from '../../auth/trusted-origins.ts';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, ops } from '../../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../../db/seed.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID, TEST_PARECER } from '../../db/test-fixtures.ts';
import { newId } from '../../ids.ts';
import { createS3, getObject, putObject } from '../../storage/s3.ts';
import { applyOps } from '../../sync/apply.ts';
import { certificatePagesKey, decodePages, s3PagesCache } from './certificate-cache.ts';
import { GENERATE_ACTOR, runGenerateJob } from './job.ts';
import { RasterizeTimeoutError, rasterizePdfPages } from './pdf-raster.ts';
import { samplePdf } from './sample-pdf.test-support.ts';
import { loadCertificatePages, type StoredOriginal } from './sections/section-11.ts';

/*
 * Matheus, 2026-09-30: section 11's certificates.
 * - Pages not produced in time fail the issue job like a photo read (A-4): `render_failed`,
 *   no revision number consumed, no DOCX/PDF file row, the certificate named in the log.
 * - An absent certificate or a permanently unreadable one prints the placeholder.
 * - A PDF's pages are cached by sha256 under the company's key: a hit runs no rasterizer,
 *   a corrupt entry is rebuilt, and another company's identical certificate misses.
 * Runs in the tools container against the compose Postgres and MinIO; the failing job
 * fails while the images load, before LibreOffice would be needed.
 */

const [companyA, companyB] = TEST_SEED.companies;
const companyId = asCompanyId(companyA.companyId);
const otherCompanyId = asCompanyId(companyB.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;
const [MEGOHMETRO_ID] = portoSeguroSmall.log
  .filter((op) => op.kind === 'create' && op.path.startsWith('registry/instrument/'))
  .map((op) => (op.value as { id: string }).id);

const CERT_ID = newId();
const extraOpIds: string[] = [];
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
/** A two-page PDF no earlier run has cached: the trailing comment makes its sha256 unique. */
const uniquePdf = () => Buffer.concat([samplePdf(2), Buffer.from(`% ${newId()}\n`, 'latin1')]);

const section = (ids: (string | null)[]): LayoutSectionCertificates => ({
  number: 11,
  title: 'CERTIFICADOS',
  kind: 'certificates',
  certificates: ids.map((id, i) => ({ instrumentId: `instrument-${i}`, certificateFileId: id, placeholder: `Certificado não anexado: ${i}` })),
});

function op(input: Pick<Op, 'kind' | 'scope' | 'path' | 'value'>): Op {
  const id = newId();
  extraOpIds.push(id);
  return {
    op_id: id,
    kind: input.kind,
    scope: input.scope,
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: input.scope === 'relatorio' ? RELATORIO_ID : null,
    path: input.path,
    value: input.value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
    device_id: 'tablet-int-cert',
    client_ts: toIso(now()),
  };
}

async function rowsOf(entity: 'revision' | 'file' | 'generation_job') {
  return db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.relatorio_id, RELATORIO_ID)));
}

async function createJob(): Promise<string> {
  const jobId = newId();
  const stamp = toIso(now());
  const created = await applyOps(
    db,
    companyId,
    [
      {
        op_id: newId(),
        kind: 'create',
        scope: 'relatorio',
        company_id: companyA.companyId,
        project_id: null,
        relatorio_id: RELATORIO_ID,
        path: `generation_job/${jobId}`,
        value: { id: jobId, relatorio_id: RELATORIO_ID, kind: 'issue', status: 'queued', error: null, result_file_id: null, result: null, created_at: stamp },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: GENERATE_ACTOR,
        device_id: SERVER_DEVICE_ID,
        client_ts: stamp,
      },
    ],
    { now, origin: 'server' },
  );
  expect(created.rejected).toEqual([]);
  return jobId;
}

const logLines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((args) => JSON.parse(String(args[0])) as Record<string, unknown>);

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { parecer: TEST_PARECER });
  const certificate = uniquePdf();
  await putObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', CERT_ID), certificate, 'application/pdf');
  const result = await applyOps(
    db,
    companyId,
    [
      op({
        kind: 'create',
        scope: 'company',
        path: `file/${CERT_ID}`,
        value: {
          id: CERT_ID,
          company_id: companyA.companyId,
          relatorio_id: null,
          kind: 'certificate',
          sha256: sha(certificate),
          mime: 'application/pdf',
          size: certificate.byteLength,
          uploaded_at: toIso(now()),
          removed_at: null,
          variants: null,
        },
      }),
      op({ kind: 'put', scope: 'company', path: `registry/instrument/${MEGOHMETRO_ID}/certificate_file_id`, value: CERT_ID }),
      op({ kind: 'put', scope: 'relatorio', path: 'relatorio/setup/instrument_ids', value: [MEGOHMETRO_ID!] }),
    ],
    { now, origin: 'server' },
  );
  expect(result.rejected).toEqual([]);
}, 60_000);

afterAll(async () => {
  if (extraOpIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, extraOpIds));
  await db.delete(entities).where(and(eq(entities.company_id, companyId), inArray(entities.id, [CERT_ID])));
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('certificate pages not produced in time fail the issue job', () => {
  it('a rasterizer timeout ends the job failed/render_failed, with no revision, no document file, and the certificate in the log', async () => {
    const errors = vi.spyOn(console, 'error');
    try {
      const jobId = await createJob();
      const rasterize = vi.fn(async () => {
        throw new RasterizeTimeoutError('pdftoppm killed after 30000 ms');
      });
      const outcome = await runGenerateJob({ db, s3, bucket: config.S3_BUCKET, now, newId, rasterize }, {
        job_id: jobId,
        company_id: companyA.companyId,
        relatorio_id: RELATORIO_ID,
        actor_id: companyA.userId,
        kind: 'issue',
      });
      expect(outcome).toBe('failed');
      expect(rasterize).toHaveBeenCalledTimes(1);
      const job = generationJobRowSchema.parse((await rowsOf('generation_job')).find((j) => j.id === jobId)?.row);
      expect(job).toMatchObject({ status: 'failed', error: 'render_failed', result: null });
      expect(await rowsOf('revision')).toEqual([]);
      expect((await rowsOf('file')).filter((f) => ['docx', 'pdf'].includes((f.row as { kind: string }).kind))).toEqual([]);
      const lines = logLines(errors);
      expect(lines.filter((line) => line.msg === 'generate certificate unreadable')).toEqual([]);
      expect(lines.find((line) => line.msg === 'generate certificate pages not produced')).toMatchObject({ job_id: jobId, file_id: CERT_ID, instrument_id: MEGOHMETRO_ID });
      const failure = lines.find((line) => line.msg === 'generate failed');
      expect(failure).toMatchObject({ job_id: jobId, error: 'render_failed' });
      expect(String(failure!.detail)).toContain(CERT_ID);
    } finally {
      errors.mockRestore();
    }
  });
});

describe('an absent or permanently unreadable certificate prints the placeholder', () => {
  it('leaves both out without throwing, and caches nothing for the unreadable one', async () => {
    const broken = Buffer.from(`%PDF-1.4 not a readable PDF ${newId()}`, 'latin1');
    const stored = new Map<string, StoredOriginal>([['broken', { bytes: broken, mime: 'application/pdf' }]]);
    const pages = await loadCertificatePages(section(['absent', 'broken']), async (id) => stored.get(id), {
      jobId: 'job-placeholder',
      cache: s3PagesCache(s3, config.S3_BUCKET, companyId),
    });
    expect(pages.size).toBe(0);
    expect(await getObject(s3, config.S3_BUCKET, certificatePagesKey(companyId, sha(broken)))).toBeNull();
  });
});

describe('the page cache, by company and sha256', () => {
  it('rasterizes once: a later load reads the stored pages and runs no rasterizer', async () => {
    const pdf = uniquePdf();
    const read = async () => ({ bytes: pdf, mime: 'application/pdf' });
    const cache = s3PagesCache(s3, config.S3_BUCKET, companyId);
    const miss = vi.fn(rasterizePdfPages);
    const first = await loadCertificatePages(section(['c']), read, { jobId: 'job-miss', cache, rasterize: miss });
    expect(miss).toHaveBeenCalledTimes(1);
    expect(first.get('c')).toHaveLength(2);
    expect(await getObject(s3, config.S3_BUCKET, certificatePagesKey(companyId, sha(pdf)))).not.toBeNull();

    const hit = vi.fn(rasterizePdfPages);
    const second = await loadCertificatePages(section(['c']), read, { jobId: 'job-hit', cache, rasterize: hit });
    expect(hit).not.toHaveBeenCalled();
    expect(second.get('c')!.map((p) => sha(p))).toEqual(first.get('c')!.map((p) => sha(p)));
  });

  it('ignores a corrupt entry, rasterizes again and rewrites it', async () => {
    const pdf = uniquePdf();
    const key = certificatePagesKey(companyId, sha(pdf));
    await putObject(s3, config.S3_BUCKET, key, Buffer.from('not a cache entry'), 'application/octet-stream');
    const rasterize = vi.fn(rasterizePdfPages);
    const pages = await loadCertificatePages(section(['c']), async () => ({ bytes: pdf, mime: 'application/pdf' }), {
      jobId: 'job-corrupt',
      cache: s3PagesCache(s3, config.S3_BUCKET, companyId),
      rasterize,
    });
    expect(rasterize).toHaveBeenCalledTimes(1);
    expect(pages.get('c')).toHaveLength(2);
    const rewritten = await getObject(s3, config.S3_BUCKET, key);
    const chunks: Buffer[] = [];
    for await (const chunk of rewritten!.body) chunks.push(chunk as Buffer);
    expect(await decodePages(Buffer.concat(chunks))).toHaveLength(2);
  });

  it('keeps companies apart: the same certificate cached by one company is a miss for another', async () => {
    const pdf = uniquePdf();
    const read = async () => ({ bytes: pdf, mime: 'application/pdf' });
    await loadCertificatePages(section(['c']), read, { jobId: 'job-a', cache: s3PagesCache(s3, config.S3_BUCKET, companyId) });
    const keyA = certificatePagesKey(companyId, sha(pdf));
    const keyB = certificatePagesKey(otherCompanyId, sha(pdf));
    expect(keyA.startsWith(`company/${companyA.companyId}/`)).toBe(true);
    expect(keyB.startsWith(`company/${companyB.companyId}/`)).toBe(true);
    expect(await getObject(s3, config.S3_BUCKET, keyB)).toBeNull();

    const rasterize = vi.fn(rasterizePdfPages);
    await loadCertificatePages(section(['c']), read, { jobId: 'job-b', cache: s3PagesCache(s3, config.S3_BUCKET, otherCompanyId), rasterize });
    expect(rasterize).toHaveBeenCalledTimes(1);
    expect(await getObject(s3, config.S3_BUCKET, keyB)).not.toBeNull();
  });

  it('builds the key only from a sha256, never from a path', () => {
    expect(() => certificatePagesKey(companyId, '../other-company/x')).toThrow();
    expect(() => certificatePagesKey(companyId, 'A'.repeat(64))).toThrow();
  });
});
