import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, generationJobRowSchema, locationEnvPath, makeOp, previewResponseSchema, type GenerationJobRow, type Op } from '@app/domain';
import { layoutLockFixture, type LayoutLockFixture } from '@app/domain/fixtures/layout-lock';
import { and, eq, inArray, or } from 'drizzle-orm';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
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
import { applyOps } from '../../sync/apply.ts';

/*
 * Fix batch e24y (P1, the hands-on pass of 2026-11-11): the layout-lock relatório on v13 and on v14, a
 * second visit whose Disjuntor MT and seccionadora carry the previous visit's insulation values, the
 * cabine's ambient at 25 °C so the "20 °C" column holds values, previewed through the api (its worker,
 * its LibreOffice). The PDF's text items of each paired insulation table are read one by one, each a
 * line of a cell: on v14 every "GUARD", "FASE A/B/C" and "20 °C" is one item, and no value parts from
 * its unit; v13 prints what its golden holds (recorded, not asserted beyond its shape). The PDFs, the
 * items and a crop of each pair go to `test-results/e24y-pdf/`. Every value is invented.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const OUT_DIR = resolve(__dirname, '../../../../../test-results/e24y-pdf');

/** The fixture of `version` with its cabine's ambient at 25 °C (the one op the field would write). */
function fixtureOf(version: string): LayoutLockFixture {
  const base = layoutLockFixture(version, { companyId: companyA.companyId, actorId: companyA.userId, deviceId: `tablet-e24y-${version}` });
  const cabine = base.log.find((op) => op.kind === 'create' && op.path.startsWith('location/') && (op.value as { kind?: string }).kind === 'cabine')!;
  const cabineId = cabine.path.split('/')[1]!;
  const ambient = makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: companyA.companyId,
      project_id: null,
      relatorio_id: base.relatorioId,
      path: locationEnvPath(cabineId, 'temperature_c'),
      value: { raw: '25', unit: '°C', state: 'measured' },
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
      device_id: `tablet-e24y-${version}`,
    },
    { newId: () => `019a6100-24f9-7${version === 'v13' ? '013' : '014'}-8000-000000000001`, now: new Date('2026-11-08T12:00:00.000Z') },
  );
  return { ...base, log: [...base.log, ambient] };
}

const FIXTURES: Readonly<Record<string, LayoutLockFixture>> = { v13: fixtureOf('v13'), v14: fixtureOf('v14') };

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

GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

/** One text item of the PDF: its text (NFKC, the no-break space read as a space), its page and its place in points from the page's top. */
interface Item {
  text: string;
  page: number;
  x: number;
  top: number;
}

async function pdfItems(pdf: Buffer): Promise<{ items: Item[]; heights: number[] }> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const items: Item[] = [];
    const heights: number[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const height = page.getViewport({ scale: 1 }).height;
      heights.push(height);
      for (const item of (await page.getTextContent()).items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        items.push({ text: item.str.replace(/\u00a0/gu, ' ').trim().normalize('NFKC'), page: n - 1, x: item.transform[4] as number, top: height - (item.transform[5] as number) });
      }
    }
    return { items, heights };
  } finally {
    await task.destroy();
  }
}

/** The items of the pair titled `title` ("DISJUNTOR CONTATO ABERTO"): from its title down to the pair's last row. */
function pairItems(items: readonly Item[], title: string): Item[] {
  const at = items.findIndex((item) => item.text.includes(title));
  if (at === -1) throw new Error(`no "${title}" in the PDF`);
  const head = items[at]!;
  // The pair holds its title band, its header and three rows: every item of its page within 110 pt under the title.
  return items.filter((item) => item.page === head.page && item.top >= head.top - 2 && item.top <= head.top + 110);
}

async function previewPdf(version: string): Promise<Buffer> {
  const fixture = FIXTURES[version]!;
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
  return Buffer.from(await download.arrayBuffer());
}

/** A crop of the page holding the pair, from its title to its last row, at 150 dpi (that page alone, by `pdftoppm`). */
async function cropOf(pdf: Buffer, pair: readonly Item[]): Promise<Buffer> {
  const page = pair[0]!.page + 1;
  const dir = mkdtempSync(join(tmpdir(), 'e24y-crop-'));
  try {
    writeFileSync(join(dir, 'in.pdf'), pdf);
    execFileSync('pdftoppm', ['-f', String(page), '-l', String(page), '-r', '150', '-png', '-singlefile', join(dir, 'in.pdf'), join(dir, 'page')]);
    const image = readFileSync(join(dir, 'page.png'));
    const meta = await sharp(image).metadata();
    const scale = 150 / 72;
    const top = Math.max(0, Math.floor((Math.min(...pair.map((item) => item.top)) - 14) * scale));
    const bottom = Math.min(meta.height!, Math.ceil((Math.max(...pair.map((item) => item.top)) + 10) * scale));
    return await sharp(image).extract({ left: 0, top, width: meta.width!, height: bottom - top }).png().toBuffer();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ALL = Object.values(FIXTURES);

async function removeFixtures(): Promise<void> {
  await db.transaction(async (tx) => {
    for (const fixture of ALL) {
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
    }
  });
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await removeFixtures();
  for (const fixture of ALL) {
    const result = await applyOps(db, asCompanyId(companyA.companyId), fixture.log.map((op): Op => ({ ...op })), { now, origin: 'server' });
    expect(result.rejected).toEqual([]);
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

const PAIRS = [
  { name: 'disjuntor', title: 'DISJUNTOR CONTATO ABERTO' },
  { name: 'seccionadora', title: 'SECCIONADORA CONTATO ABERTO' },
];

/**
 * What a v14 pair must hold: each word and each value with its unit on one line. pdfjs splits a line's text
 * at some spaces ("FASE" "A"), so the items are read with their place: two items of one cell on one line
 * share their top; a word or a value cut by the cell's width leaves a fragment on the next line.
 */
function brokenIn(pair: readonly Item[]): string[] {
  const broken: string[] = [];
  const texts = pair.map((item) => item.text);
  for (const fragment of ['GUAR', 'ANTERIO', 'MASS', 'D', 'R']) if (texts.includes(fragment)) broken.push(`a word cut: "${fragment}"`);
  pair.forEach((item, i) => {
    const next = pair[i + 1];
    if (next === undefined) return;
    const apart = Math.abs(next.top - item.top) > 1;
    const together = (item.text === '20' && next.text === '°C') || (item.text === 'FASE' && /^[ABC]$/u.test(next.text)) || (/\d$/u.test(item.text) && /^[GMkmµ]?Ω$/u.test(next.text));
    if (together && apart) broken.push(`"${item.text} ${next.text}" on two lines`);
    if (/^\d+[.,]\d{1,2}$/u.test(item.text) && /^\d$/u.test(next.text) && apart) broken.push(`a value cut: "${item.text}" / "${next.text}"`);
  });
  if (texts.filter((text) => text === 'GUARD').length !== 2) broken.push(`GUARD whole ${texts.filter((text) => text === 'GUARD').length} times, not 2`);
  return broken;
}

describe('e24y-P1-INT the paired insulation tables of a second visit in the PDF', () => {
  it('v13 and v14 previewed: v14 prints every GUARD, FASE A/B/C and 20 °C whole and each value with its unit; both recorded', async () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const record: Record<string, Record<string, { text: string; top: number }[]>> = {};
    const broken: Record<string, string[]> = {};
    for (const version of ['v13', 'v14']) {
      const pdf = await previewPdf(version);
      writeFileSync(resolve(OUT_DIR, `e24y-${version}-relatorio.pdf`), pdf);
      const { items } = await pdfItems(pdf);
      record[version] = {};
      for (const { name, title } of PAIRS) {
        const pair = pairItems(items, title);
        record[version]![name] = pair.map((item) => ({ text: item.text, top: Math.round(item.top * 10) / 10 }));
        broken[`${version}-${name}`] = brokenIn(pair);
        writeFileSync(resolve(OUT_DIR, `e24y-${version}-${name}-pair.png`), await cropOf(pdf, pair));
      }
    }
    writeFileSync(resolve(OUT_DIR, 'e24y-pair-items.json'), `${JSON.stringify(record, null, 2)}\n`);
    // v13 keeps its golden's shape (recorded above): its pair still cuts GUARD, and nothing is asserted on it beyond that.
    expect(broken['v13-disjuntor']).toContain('a word cut: "GUAR"');
    expect({ disjuntor: broken['v14-disjuntor'], seccionadora: broken['v14-seccionadora'] }).toEqual({ disjuntor: [], seccionadora: [] });
  }, 400_000);
});
