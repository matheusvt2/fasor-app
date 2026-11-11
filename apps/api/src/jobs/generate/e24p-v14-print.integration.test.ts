import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { buildSnapshot, CONTRACT_VERSION, CONTRACT_VERSION_HEADER, generationJobRowSchema, layoutSpec, previewResponseSchema, replay, type GenerationJobRow, type Op } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockFixture, layoutLockSnapshot } from '@app/domain/fixtures/layout-lock';
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
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 24.15-INT print and 24.16-INT (batch e24p, seed v14): the layout-lock relatório built on v14, a
 * second visit whose equipment carry a previous visit (the seccionadora's contact risen, the
 * transformer's insulation dropped, the disjuntor's as it was), prints:
 * - 24.15: every MANUT. ANTERIOR header with the previous visit's date on its second line: the
 *   service date the issue kept (the seccionadora's 30/10/2025), a month-only one as mm/aaaa (the
 *   transformer's 10/2025), and the issue date of an entry from before the story (the disjuntor's
 *   05/11/2025); the history texts name the same date;
 * - 24.16: one note line under the contact table and one under the insulation table, naming each
 *   flagged row, its reason and its values; none under the disjuntor's.
 * The v13 relatório keeps the header alone and prints no note line (its golden, `docx-layout-lock.test.ts`).
 * The DOCX half reads the layout's document; the PDF half previews the relatório through the api (its
 * worker, its LibreOffice), reads the PDF's text and writes the PDF to `test-results/e24p-pdf/`.
 * Every value is invented.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const PDF_DIR = resolve(__dirname, '../../../../../test-results/e24p-pdf');

/** The service date each previous visit keeps, by block type (none: an entry from before Story 24.15). */
const SERVICE_DATES: Readonly<Record<string, string>> = { chave_seccionadora: '2025-10-30', transformador_forca: '2025-10' };

const base = layoutLockFixture('v14', { companyId: companyA.companyId, actorId: companyA.userId, deviceId: 'tablet-e24p-print' });
/** The fixture with its previous visits dated (the `last_results` puts the issue job would have written after the story). */
const fixture = {
  ...base,
  log: base.log.map((op): Op => {
    if (!op.path.endsWith('/last_results')) return op;
    const value = op.value as { block_type: string };
    const date = SERVICE_DATES[value.block_type];
    return date === undefined ? op : { ...op, value: { ...(op.value as object), service_date: date } as Op['value'] };
  }),
};

async function docxOfLog(log: readonly Op[], relatorioId: string): Promise<Buffer> {
  const layout = layoutSpec(buildSnapshot(replay(log), relatorioId), { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return buildDocx(layout, { tocPages: placeholderPages(layout) });
}

async function docxOf(version: string): Promise<Buffer> {
  const layout = layoutSpec(layoutLockSnapshot(version), { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return buildDocx(layout, { tocPages: placeholderPages(layout) });
}

/** The reading table whose header row holds `header` (a cell text). */
function tableWith(tables: string[][][], header: string): string[][] {
  const table = tables.find((rows) => rows.some((row) => row.includes(header)));
  if (table === undefined) throw new Error(`no table with "${header}"`);
  return table;
}

const RISE_NOTE =
  'Em relação à manutenção anterior: T1-T2–Fase A, alta de 100 % sobre 20 µΩ da manutenção anterior, rev. 1 de 30/10/2025, acima do limite de 50 %; T3-T4–Fase B, alta de 100 % sobre 21,5 µΩ da manutenção anterior, rev. 1 de 30/10/2025, acima do limite de 50 %; T5-T6–Fase C, alta de 100 % sobre 23 µΩ da manutenção anterior, rev. 1 de 30/10/2025, acima do limite de 50 %.';
const DROP_NOTE =
  'Em relação à manutenção anterior: Primário/Massa, queda de mais de 50 % desde a manutenção anterior (de 30.000 GΩ para 10.000 GΩ, a 20 °C); Primário/Secundário, queda de mais de 50 % desde a manutenção anterior (de 31.200 GΩ para 10.400 GΩ, a 20 °C); Secundário, queda de mais de 50 % desde a manutenção anterior (de 32.400 GΩ para 10.800 GΩ, a 20 °C).';

describe('24.15-INT, 24.16-INT the DOCX of a v14 second visit', () => {
  it('every MANUT. ANTERIOR header carries the visit\'s date (a day, a month, an issue date); the note lines under the contact and the insulation tables', async () => {
    const { tables, paragraphs } = extractStructure(await docxOfLog(fixture.log, fixture.relatorioId));
    // The seccionadora's contact table (its insulation pair carries the same dated header on its second row).
    const contact = tables.find((rows) => rows[0]?.includes('VALORES (µΩ)') && rows[0]?.at(-1) === 'MANUT. ANTERIOR\n30/10/2025');
    expect(contact?.[0]).toEqual(['LINHA', 'TERRA', 'GUARD', 'VALORES (µΩ)', 'MANUT. ANTERIOR\n30/10/2025']);
    expect(tableWith(tables, 'MANUT. ANTERIOR\n10/2025').length).toBeGreaterThan(0);
    expect(tableWith(tables, 'MANUT. ANTERIOR\n05/11/2025').length).toBeGreaterThan(0);
    // No header is left undated on v14.
    expect(tables.some((rows) => rows.some((row) => row.includes('MANUT. ANTERIOR')))).toBe(false);
    expect(paragraphs).toContain(RISE_NOTE);
    expect(paragraphs).toContain(DROP_NOTE);
    expect(paragraphs.filter((text) => text.startsWith('Em relação à manutenção anterior:'))).toHaveLength(2);
    // The conclusion of the seccionadora (when printed) and the parecer name the same dated rise.
    expect(paragraphs.join('\n')).toContain('alta de 100 % sobre 23 µΩ da manutenção anterior, rev. 1 de 30/10/2025, acima do limite de 50 %');
  }, 120_000);

  it('the v14 twin with no service date kept prints the issue date in the header; v13 prints the header alone and no note line', async () => {
    const twin = extractStructure(await docxOf('v14'));
    expect(tableWith(twin.tables, 'MANUT. ANTERIOR\n05/11/2025').some((row) => row.includes('MANUT. ANTERIOR\n05/11/2025'))).toBe(true);
    expect(twin.paragraphs.filter((text) => text.startsWith('Em relação à manutenção anterior:'))).toHaveLength(2);
    const old = extractStructure(await docxOf('v13'));
    expect(old.tables.some((rows) => rows.some((row) => row.some((cell) => cell.startsWith('MANUT. ANTERIOR\n'))))).toBe(false);
    expect(old.tables.some((rows) => rows.some((row) => row.includes('MANUT. ANTERIOR')))).toBe(true);
    expect(old.paragraphs.some((text) => text.startsWith('Em relação à manutenção anterior'))).toBe(false);
  }, 120_000);
});

// --- the PDF, previewed through the api ------------------------------------------------------------

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

/** The text of the whole PDF, items joined by a space, whitespace collapsed, a word cut after its hyphen or dash at a line end joined again. */
async function pdfText(pdf: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return pages
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/(\S)([-–]) (\S)/g, '$1$2$3')
      .trim()
      // LibreOffice's PDF text carries the Greek mu where the document has the micro sign: both sides are compared in NFKC.
      .normalize('NFKC');
  } finally {
    await task.destroy();
  }
}

async function removeFixture(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(ops)
      .where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, fixture.log.map((op) => op.op_id)), eq(ops.relatorio_id, fixture.relatorioId), eq(ops.project_id, fixture.projectId))));
    await tx
      .delete(entities)
      .where(
        and(
          eq(entities.company_id, companyA.companyId),
          or(eq(entities.relatorio_id, fixture.relatorioId), eq(entities.project_id, fixture.projectId), inArray(entities.id, [fixture.projectId, ...fixture.companyEntityIds])),
        ),
      );
  });
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await removeFixture();
  const result = await applyOps(db, asCompanyId(companyA.companyId), fixture.log.map((op): Op => ({ ...op })), { now, origin: 'server' });
  expect(result.rejected).toEqual([]);
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
  await removeFixture();
  await sql.end();
});

describe('24.15-INT, 24.16-INT the PDF of a v14 second visit', () => {
  it('prints the dated headers and the two note lines; the PDF is kept in test-results/e24p-pdf', async () => {
    const res = await call(`/api/relatorios/${fixture.relatorioId}/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
    });
    expect(res.status, await res.clone().text()).toBe(202);
    const answer = previewResponseSchema.parse(await res.json());
    const job = await waitForJob(answer.job_id);
    expect(job.status, job.error ?? '').toBe('done');
    const download = await call(`/api/relatorios/${fixture.relatorioId}/preview.pdf?v=${job.result_file_id}`, { headers: { cookie } });
    expect(download.status).toBe(200);
    const pdf = Buffer.from(await download.arrayBuffer());
    mkdirSync(PDF_DIR, { recursive: true });
    writeFileSync(resolve(PDF_DIR, 'e24p-v14-relatorio.pdf'), pdf);
    writeFileSync(resolve(PDF_DIR, 'e24p-v14-relatorio.docx'), await docxOfLog(fixture.log, fixture.relatorioId));
    const text = await pdfText(pdf);
    const nfkc = (expected: string) => expected.normalize('NFKC');
    expect(text).toContain(nfkc('VALORES (µΩ) MANUT. ANTERIOR 30/10/2025'));
    expect(text).toContain('MANUT. ANTERIOR 10/2025');
    expect(text).toContain('MANUT. ANTERIOR 05/11/2025');
    expect(text).toContain(nfkc(RISE_NOTE));
    expect(text).toContain(nfkc(DROP_NOTE));
  }, 200_000);
});
