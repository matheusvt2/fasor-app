import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  generateResponseSchema,
  generationJobRowSchema,
  objectKey,
  PHOTO_UNAVAILABLE_TEXT,
  photoToken,
  revisionRowSchema,
  toIso,
  type Op,
} from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { extractStructure, readZipEntries } from './docx-structure.test-support.ts';
import { samplePdf } from './sample-pdf.test-support.ts';

/*
 * 7.2/7.3-INT: a generate job through the api (its worker, its LibreOffice) over the small
 * Porto Seguro fixture with one uploaded photo, a point citing it, a two-page PDF
 * certificate on one instrument and an unreadable one on another, both checked at setup. The revision commits;
 * its DOCX holds "Imagem 1:" in section 7, the resolved "Imagem 1" in section 8, the two
 * rasterized certificate pages in section 11 and the placeholder for the unreadable one.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;
/** The small fixture's megôhmetro (2E) and micro-ohmímetro (3M). */
const [MEGOHMETRO_ID, MICROHMETRO_ID] = portoSeguroSmall.log
  .filter((op) => op.kind === 'create' && op.path.startsWith('registry/instrument/'))
  .map((op) => (op.value as { id: string }).id);

const PHOTO_ID = newId();
const GOOD_CERT_ID = newId();
const BAD_CERT_ID = newId();
const extraOpIds: string[] = [];

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
    device_id: 'tablet-int-7-3',
    client_ts: toIso(now()),
  };
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function fileBase(id: string, bytes: Buffer, mime: string) {
  return { id, company_id: companyA.companyId, sha256: sha(bytes), mime, size: bytes.byteLength, uploaded_at: toIso(now()), removed_at: null };
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string> | undefined) },
  });
}

async function signIn(): Promise<string> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function readAll(body: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

async function removeExtras(): Promise<void> {
  if (extraOpIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, extraOpIds));
  await db.delete(entities).where(and(eq(entities.company_id, companyId), inArray(entities.id, [PHOTO_ID, GOOD_CERT_ID, BAD_CERT_ID])));
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { parecer: TEST_PARECER });

  const photo = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer();
  const goodPdf = samplePdf(2);
  const badPdf = Buffer.from('%PDF-1.4 this is not a readable PDF');
  await putObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'photo', PHOTO_ID, 'print', RELATORIO_ID), photo, 'image/jpeg');
  await putObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', GOOD_CERT_ID), goodPdf, 'application/pdf');
  await putObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', BAD_CERT_ID), badPdf, 'application/pdf');

  const result = await applyOps(
    db,
    companyId,
    [
      op({
        kind: 'create',
        scope: 'relatorio',
        path: `file/${PHOTO_ID}`,
        value: {
          ...fileBase(PHOTO_ID, photo, 'image/jpeg'),
          relatorio_id: RELATORIO_ID,
          kind: 'photo',
          variants: {
            thumb: objectKey(companyA.companyId, 'photo', PHOTO_ID, 'thumb', RELATORIO_ID),
            print: objectKey(companyA.companyId, 'photo', PHOTO_ID, 'print', RELATORIO_ID),
          },
          captured_at: '2026-09-06T17:32:00.000Z',
          tz_offset: -180,
          coords: { lat: -23.55052, lng: -46.63331, accuracy_m: 5, source: 'geolocation' },
          local_seq: 1,
          block_id: null,
          item_key: null,
          caption: 'Vista geral da cabine',
          reading_kind: null,
          reading_target: null,
          reading_status: 'none',
        },
      }),
    ],
    { now, origin: 'server' },
  );
  expect(result.rejected).toEqual([]);
  const pointId = newId();
  const more = await applyOps(
    db,
    companyId,
    [
      op({
        kind: 'create',
        scope: 'relatorio',
        path: `point/${pointId}`,
        value: {
          id: pointId,
          relatorio_id: RELATORIO_ID,
          text: `Trocar o isolador trincado, conforme ${photoToken(PHOTO_ID)}.`,
          equipment_id: null,
          origin: 'manual',
          order_key: 'a0',
          removed_at: null,
          action: 'Substituir na próxima parada.',
          priority: null,
          deadline: null,
          owner: null,
        },
      }),
      op({ kind: 'create', scope: 'company', path: `file/${GOOD_CERT_ID}`, value: { ...fileBase(GOOD_CERT_ID, goodPdf, 'application/pdf'), relatorio_id: null, kind: 'certificate', variants: null } }),
      op({ kind: 'create', scope: 'company', path: `file/${BAD_CERT_ID}`, value: { ...fileBase(BAD_CERT_ID, badPdf, 'application/pdf'), relatorio_id: null, kind: 'certificate', variants: null } }),
      op({ kind: 'put', scope: 'company', path: `registry/instrument/${MEGOHMETRO_ID}/certificate_file_id`, value: GOOD_CERT_ID }),
      op({ kind: 'put', scope: 'company', path: `registry/instrument/${MICROHMETRO_ID}/certificate_file_id`, value: BAD_CERT_ID }),
      // Checked at setup: the small fixture's sheets keep their tests switched off (`sub_blocks: {}`), so they name none.
      op({ kind: 'put', scope: 'relatorio', path: 'relatorio/setup/instrument_ids', value: [MEGOHMETRO_ID!, MICROHMETRO_ID!] }),
    ],
    { now, origin: 'server' },
  );
  expect(more.rejected).toEqual([]);
}, 60_000);

afterAll(async () => {
  await removeExtras();
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('7.2/7.3-INT-001 a revision with a photo, a point citing it and two certificates', () => {
  it(
    'prints "Imagem 1:", the resolved point, the rasterized pages and the placeholder of the unreadable certificate, and still commits the revision',
    async () => {
      const cookie = await signIn();
      const res = await call(`/api/relatorios/${RELATORIO_ID}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
      });
      expect(res.status, await res.clone().text()).toBe(202);
      expect(generateResponseSchema.parse(await res.json())).toMatchObject({ outcome: 'queued', revision_number: 1 });

      const deadline = Date.now() + 170_000;
      let docxFileId: string;
      for (;;) {
        const [revision] = await db
          .select({ row: entities.row })
          .from(entities)
          .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, RELATORIO_ID)));
        if (revision !== undefined) {
          docxFileId = revisionRowSchema.parse(revision.row).docx_file_id;
          break;
        }
        const jobs = await db
          .select({ row: entities.row })
          .from(entities)
          .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, RELATORIO_ID)));
        const failed = jobs.map((j) => generationJobRowSchema.parse(j.row)).find((j) => j.status === 'failed');
        if (failed !== undefined) throw new Error(`the generate failed: ${failed.error}`);
        if (Date.now() > deadline) throw new Error('revision 1 did not arrive in time');
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // The headings of 7, 8 and 11 stayed in the PDF outline and the two-pass TOC converged.
      const [job] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, RELATORIO_ID)));
      expect(generationJobRowSchema.parse(job!.row)).toMatchObject({ status: 'done', error: null, result: { toc_converged: true } });

      const stored = await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'docx', docxFileId));
      expect(stored).not.toBeNull();
      const docx = await readAll(stored!.body);
      const structure = extractStructure(docx);
      // Section 7: the one photo, embedded, with its label, caption and stamp.
      const photoTable = structure.tables.find((table) => table[0]![0]!.includes('Imagem 1:'))!;
      expect(photoTable[0]![0]).toBe('\nImagem 1: Vista geral da cabine.\n06/09/2026 14:32 · −23,5505, −46,6333');
      expect(structure.paragraphs).not.toContain(PHOTO_UNAVAILABLE_TEXT);
      // Section 8: the token resolved to the frozen number, the action after it.
      expect(structure.paragraphs).toContain('Trocar o isolador trincado, conforme Imagem 1. Substituir na próxima parada.');
      // Section 11: two rasterized pages for 2E, the placeholder for 3M (its PDF cannot be read),
      // and (E7-A4: the small fixture's transformer test is enabled now) the placeholder for 1T, which has no certificate.
      expect(structure.paragraphs.filter((p) => p.startsWith('Certificado não anexado: '))).toEqual([
        'Certificado não anexado: 3M — Micro-Ohmmeter (nº 00001/26)',
        'Certificado não anexado: 1T — Transformer Ratiometer (nº 00002/26)',
      ]);
      const media = [...readZipEntries(docx).keys()].filter((name) => name.startsWith('word/media/') && !name.endsWith('/'));
      expect(media).toHaveLength(3);
      const document = readZipEntries(docx).get('word/document.xml')!.toString('utf8');
      // The second 2E page, plus section 9's three breaks on the small fixture (E7-A4: its own
      // heading; Story 7.1: a new page for each subsection after the first and each sheet
      // after its subsection's first).
      expect(document.match(/<w:pageBreakBefore\/>/g) ?? []).toHaveLength(1 + 3);
    },
    200_000,
  );
});
