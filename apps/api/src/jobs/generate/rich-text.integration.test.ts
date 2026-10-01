import { createRequire } from 'node:module';
import {
  ACTION_PLAN_COLUMNS,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  generateResponseSchema,
  generationJobRowSchema,
  objectKey,
  revisionRowSchema,
  toIso,
  type Op,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
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
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID, TEST_PARECER } from '../../db/test-fixtures.ts';
import { newId } from '../../ids.ts';
import { createS3, getObject } from '../../storage/s3.ts';
import { applyOps } from '../../sync/apply.ts';
import { readZipEntries } from './docx-structure.test-support.ts';

/*
 * 11.4-PRINT-BOTH (renderer half, Story 11.4, FR-12): a generate job through the api (its
 * worker, its LibreOffice) over the small Porto Seguro fixture carrying one section block,
 * section 1, whose own text is formatted: bold (a variable inside it), italic, a bullet list
 * and a numbered list. The stored DOCX has the bold and italic runs, the bullets and a
 * decimal list; the stored PDF holds the words and draws the bold and italic ones in bold
 * and italic fonts. Everything is found from section 1's heading, never by position (E7-A6).
 * The block is the relatório's own (its `config.section_text`), the text the Section text
 * surface edits; the PDF saved through the Export dialog is `e2e/export.spec.ts`'s.
 *
 * 11.10-PDF (E11-Q3, E11-Q4): the same revision carries one point of attention with a
 * priority, a deadline, an owner and an action; the stored PDF prints the action-plan table
 * under section 8's heading with every header word whole (never "Responsá" / "vel") and the
 * row's values.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;
const BLOCK_ID = newId();
const SECTION_8_BLOCK_ID = newId();
const POINT_ID = newId();
const SECTION_TEXT = 'Serviços para **{cliente}**:\n- **Termografia** dos painéis\n- Inspeção *visual*\n1. Limpeza\n2. Reaperto *quando aplicável*';
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
    device_id: 'tablet-int-11-4',
    client_ts: toIso(now()),
  };
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

// pdfjs falls back to an in-process "fake worker" in Node, loaded from this path (as `pdf-outline.ts`).
GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

/** Every text item of the PDF in order, with the name of the font it is drawn in. */
async function pdfItems(pdf: Buffer): Promise<{ str: string; font: string }[]> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const out: { str: string; font: string }[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      // The operator list loads the page's fonts into `commonObjs`, where their names are.
      await page.getOperatorList();
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        let font = '';
        try {
          font = (page.commonObjs.get(item.fontName) as { name?: string } | undefined)?.name ?? '';
        } catch {
          font = '';
        }
        out.push({ str: item.str, font });
      }
    }
    return out;
  } finally {
    await task.destroy();
  }
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { parecer: TEST_PARECER });
  const result = await applyOps(
    db,
    companyId,
    [
      op({
        kind: 'create',
        scope: 'relatorio',
        path: `block/${BLOCK_ID}`,
        value: {
          id: BLOCK_ID,
          relatorio_id: RELATORIO_ID,
          location_id: null,
          equipment_id: null,
          block_type: 'section_1',
          config: { block_type: 'section_1', sub_blocks: {}, na_defaults: [], section_text: SECTION_TEXT },
          seed_version: 'v1',
          order_key: 'a0',
          feeds_block_id: null,
          not_tested: null,
          concluded_by: null,
          sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
          created_by: null,
          first_edited_at: null,
          last_modified_by: null,
          last_modified_at: null,
          removed_at: null,
        },
      }),
      // Section 8 prints only where the relatório has its block.
      op({
        kind: 'create',
        scope: 'relatorio',
        path: `block/${SECTION_8_BLOCK_ID}`,
        value: {
          id: SECTION_8_BLOCK_ID,
          relatorio_id: RELATORIO_ID,
          location_id: null,
          equipment_id: null,
          block_type: 'section_8',
          config: { block_type: 'section_8', sub_blocks: {}, na_defaults: [], section_text: null },
          seed_version: 'v1',
          order_key: 'z0',
          feeds_block_id: null,
          not_tested: null,
          concluded_by: null,
          sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
          created_by: null,
          first_edited_at: null,
          last_modified_by: null,
          last_modified_at: null,
          removed_at: null,
        },
      }),
      op({
        kind: 'create',
        scope: 'relatorio',
        path: `point/${POINT_ID}`,
        value: {
          id: POINT_ID,
          relatorio_id: RELATORIO_ID,
          text: 'Isolador trincado na entrada.',
          equipment_id: null,
          origin: 'manual',
          order_key: 'zz',
          removed_at: null,
          action: 'Trocar isolador',
          priority: 'P1',
          deadline: '2026-10-30',
          owner: 'Cliente QA',
        },
      }),
    ],
    { now, origin: 'server' },
  );
  expect(result.rejected).toEqual([]);
}, 60_000);

afterAll(async () => {
  if (extraOpIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, extraOpIds));
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('11.4-PRINT-BOTH a formatted section text in the issued DOCX and PDF', () => {
  it(
    'prints bold, italic, the bullets and the decimal list in the DOCX, and bold and italic fonts in the PDF; 11.10-PDF: the action-plan table with every header word whole',
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
      let revision: ReturnType<typeof revisionRowSchema.parse>;
      for (;;) {
        const [row] = await db
          .select({ row: entities.row })
          .from(entities)
          .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, RELATORIO_ID)));
        if (row !== undefined) {
          revision = revisionRowSchema.parse(row.row);
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

      // The DOCX: the paragraphs after the Heading 1 "1 OBJETIVO".
      const docxObject = await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'docx', revision.docx_file_id));
      const entries = readZipEntries(await readAll(docxObject!.body));
      const document = entries.get('word/document.xml')!.toString('utf8');
      const paragraphs = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
      const heading = paragraphs.findIndex((p) => p.includes('w:val="Heading1"') && p.includes('>1 OBJETIVO<'));
      expect(heading).toBeGreaterThanOrEqual(0);
      const [intro, bullet1, bullet2, numbered1, numbered2] = paragraphs.slice(heading + 1);
      const run = (paragraph: string, words: string) => [...paragraph.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map((m) => m[0]).find((r) => r.includes(`>${words}</w:t>`)) ?? '';
      expect(intro).toMatch(/<w:b\/>/);
      expect(run(bullet1!, 'Termografia')).toContain('<w:b/>');
      expect(run(bullet2!, 'visual')).toContain('<w:i/>');
      expect(run(numbered2!, 'quando aplicável')).toContain('<w:i/>');
      for (const bullet of [bullet1!, bullet2!, numbered1!, numbered2!]) expect(bullet).toMatch(/<w:numPr>/);
      const numId = (p: string) => /<w:numId w:val="(\d+)"\/>/.exec(p)?.[1];
      expect(numId(numbered1!)).toBe(numId(numbered2!));
      expect(numId(numbered1!)).not.toBe(numId(bullet1!));
      expect(entries.get('word/numbering.xml')!.toString('utf8')).toContain('w:val="decimal"');

      // The PDF: the words after section 1's heading, the bold and italic ones in their fonts.
      expect(revision.pdf_file_id).not.toBeNull();
      const pdfObject = await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'pdf', revision.pdf_file_id!));
      const items = await pdfItems(await readAll(pdfObject!.body));
      const at = items.map((item) => item.str.trim()).lastIndexOf('1 OBJETIVO');
      expect(at).toBeGreaterThanOrEqual(0);
      const body = items.slice(at + 1);
      const item = (words: string) => body.find((i) => i.str.includes(words));
      expect(item('Serviços para')).toBeDefined();
      expect(item('Termografia')?.font).toMatch(/Bold/i);
      expect(item('dos painéis')?.font).not.toMatch(/Bold/i);
      expect(item('visual')?.font).toMatch(/Italic|Oblique/i);
      expect(item('Limpeza')?.font).not.toMatch(/Bold|Italic|Oblique/i);
      expect(item('quando aplicável')?.font).toMatch(/Italic|Oblique/i);
      // The decimal list's numbers print.
      expect(body.some((i) => i.str.trim() === '1.')).toBe(true);
      expect(body.some((i) => i.str.trim() === '2.')).toBe(true);

      // 11.10-PDF: from section 8's heading ("⟨n⟩ PONTOS DE ATENÇÃO …", numbered in print
      // order; the last one, past the TOC) to the next section heading.
      const trimmed = items.map((i) => i.str.trim());
      const at8 = trimmed.findLastIndex((str) => /^\d+ PONTOS DE ATENÇÃO/.test(str));
      expect(at8).toBeGreaterThan(at);
      const end8 = trimmed.findIndex((str, i) => i > at8 && /^\d+ \p{Lu}/u.test(str));
      const section8 = trimmed.slice(at8 + 1, end8 === -1 ? undefined : end8);
      const start = section8.findIndex((str) => str.startsWith('N'));
      expect(start).toBeGreaterThanOrEqual(0);
      const table = section8.slice(start);
      expect(table.length).toBeGreaterThan(ACTION_PLAN_COLUMNS.length);
      // E11-Q4: every header word is drawn whole, in one text item (never "Responsá" / "vel").
      for (const word of ACTION_PLAN_COLUMNS.flatMap((title) => title.split(' '))) {
        expect({ word, whole: table.some((str) => str.split(/\s+/).includes(word)) }).toEqual({ word, whole: true });
      }
      // The row of the point: its priority, deadline, action and owner.
      for (const value of ['P1 · Curto', '30/10/2026', 'Trocar isolador', 'Cliente QA']) {
        expect({ value, printed: table.some((str) => str.includes(value)) }).toEqual({ value, printed: true });
      }
    },
    200_000,
  );
});
