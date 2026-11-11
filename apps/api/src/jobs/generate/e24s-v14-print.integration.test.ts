import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  buildSnapshot,
  choiceValue,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  generationJobRowSchema,
  layoutSpec,
  locationAgruparPath,
  makeOp,
  previewResponseSchema,
  replay,
  sheetTestCellPath,
  sheetTestValuePath,
  type GenerationJobRow,
  type JsonValue,
  type LayoutSectionSheets,
  type Op,
} from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockFixture } from '@app/domain/fixtures/layout-lock';
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
 * Batch e24s (Stories 24.10 to 24.14, seed v14): the layout-lock relatório built on v14 (one sheet of every type v14
 * offers, filled by rule, `@app/domain/fixtures/layout-lock`), previewed through the api (its worker, its LibreOffice),
 * its PDF's text read with pdfjs and the PDF written to `test-results/e24s-pdf/`. Before the preview this test adds what
 * the fixture does not hold: the cabine grouped by type (so "Outros equipamentos" is its own group, the Malha last) and
 * the transformer's oil sampling "Não coletado" with the reason "Outro" and its text. Each assertion reads the slice of
 * the text from its sheet's title to the next sheet's title (the titles the kernel lays out for the same ops):
 * - 24.10: the TP prints FUSÍVEIS as its item 3; the TC its six rows, no FUSÍVEIS;
 * - 24.11: the transformer's item 5 VENTILAÇÃO FORÇADA and items 15 to 17;
 * - 24.12: the Inspeção de QGBT's items 11 and 12;
 * - 24.13: the No-break de comando under "Outros equipamentos", before the Malha, with its plate labels and six items;
 * - 24.14: the oil sampling's line "MOTIVO: OUTRO, <texto>".
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const PDF_DIR = resolve(__dirname, '../../../../../test-results/e24s-pdf');
const DEVICE = 'tablet-e24s-print';

const fixture = layoutLockFixture('v14', { companyId: companyA.companyId, actorId: companyA.userId, deviceId: DEVICE });
const REASON_TEXT = 'Tampa do registro de coleta travada';

/** What this test adds to the fixture, as one device would write it after the fixture's last op. */
function extraOps(): Op[] {
  const snapshot = buildSnapshot(replay(fixture.log), fixture.relatorioId);
  const transformer = snapshot.blocks.find((block) => block.block_type === 'transformador_forca' && block.removed_at === null)!;
  const cabine = snapshot.locations.find((location) => location.kind === 'cabine')!;
  const last = Date.parse(fixture.log.at(-1)!.client_ts);
  let n = 0;
  const put = (path: string, value: JsonValue): Op =>
    makeOp(
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: companyA.companyId,
        project_id: null,
        relatorio_id: fixture.relatorioId,
        path,
        value,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: companyA.userId,
        device_id: DEVICE,
      },
      { newId: () => `019a6100-01ee-7000-8000-${(++n).toString(16).padStart(12, '0')}`, now: new Date(last + n * 1000) },
    );
  return [
    put(locationAgruparPath(cabine.id), true),
    put(sheetTestCellPath(transformer.id, 'coleta_oleo', 0, 0), choiceValue('nao_coletado')),
    put(sheetTestValuePath(transformer.id, 'coleta_oleo', 'motivo'), choiceValue('outro')),
    put(sheetTestValuePath(transformer.id, 'coleta_oleo', 'motivo_texto'), REASON_TEXT),
  ];
}
const extra = extraOps();
const log: Op[] = [...fixture.log, ...extra];

/** The kernel's section 9 for the same ops: every sheet's title with its type, and every subsection heading, in print order. */
function printed() {
  const snapshot = buildSnapshot(replay(log), fixture.relatorioId);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  const section = layout.sections.find((one): one is LayoutSectionSheets => one.kind === 'sheets')!;
  const typeOf = new Map(snapshot.blocks.map((block) => [block.id, block.block_type]));
  const sheets = section.subsections.flatMap((subsection) => subsection.sheets.map((sheet) => ({ title: sheet.title, type: typeOf.get(sheet.blockId)!, heading: subsection.heading })));
  return { sheets };
}

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

/** The text of the whole PDF, items joined by a space, whitespace collapsed, a word cut after its hyphen at a line end joined again. */
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
      .trim();
  } finally {
    await task.destroy();
  }
}

async function removeFixture(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(ops)
      .where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, log.map((op) => op.op_id)), eq(ops.relatorio_id, fixture.relatorioId), eq(ops.project_id, fixture.projectId))));
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
  const result = await applyOps(db, asCompanyId(companyA.companyId), log.map((op): Op => ({ ...op })), { now, origin: 'server' });
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

describe('e24s-INT the PDF of a v14 relatório prints the batch\'s sheets (Stories 24.10 to 24.14)', () => {
  it('the TP and TC lists, the transformer\'s items, the inspection\'s items, the No-break before the Malha and the oil sampling\'s "Outro" text; the PDF is kept in test-results/e24s-pdf', async () => {
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
    writeFileSync(resolve(PDF_DIR, 'e24s-v14-relatorio.pdf'), pdf);
    const text = await pdfText(pdf);

    // Each sheet's slice of the text: from its title (its last occurrence before the next sheet's, past the ÍNDICE) to the next title.
    const { sheets } = printed();
    const starts: number[] = [];
    let from = 0;
    for (const sheet of sheets) {
      const at = text.indexOf(sheet.title, from);
      expect(at, `the title "${sheet.title}" in the PDF`).toBeGreaterThan(-1);
      starts.push(at);
      from = at + sheet.title.length;
    }
    const slice = (type: string) => {
      const n = sheets.findIndex((sheet) => sheet.type === type);
      expect(n, type).toBeGreaterThan(-1);
      return text.slice(starts[n]!, starts[n + 1] ?? text.length);
    };

    // 24.10: the TP keeps FUSÍVEIS as its item 3; the TC asks six, no FUSÍVEIS.
    const tp = slice('tp');
    expect(tp).toContain('3. FUSÍVEIS');
    expect(tp).toContain('7. BUCHAS');
    const tc = slice('tc');
    expect(tc).toContain('3. ATERRAMENTO');
    expect(tc).toContain('6. BUCHAS');
    expect(tc).not.toContain('FUSÍVEIS');
    expect(tc).not.toContain('7. BUCHAS');

    // 24.11: item 5 VENTILAÇÃO FORÇADA, items 15 to 17 appended.
    const transformer = slice('transformador_forca');
    for (const row of ['5. VENTILAÇÃO FORÇADA', '15. TANQUE E ALETAS', '16. LIMPEZA DAS BOBINAS', '17. TRINCAS NA RESINA']) expect(transformer, row).toContain(row);
    expect(transformer).not.toContain('VENTILADORES');

    // 24.14: the oil sampling's line with the text as typed.
    expect(transformer).toContain(`MOTIVO: OUTRO, ${REASON_TEXT}`);

    // 24.12: items 11 and 12 of the Inspeção de QGBT.
    const inspection = slice('inspecao_qgbt');
    expect(inspection).toContain('11. REAPERTO GERAL');
    expect(inspection).toContain('12. TESTE DE FUNCIONAMENTO');

    // 24.13: under "Outros equipamentos", before the Malha, with its plate labels and six items.
    const noBreak = sheets.find((sheet) => sheet.type === 'no_break_comando')!;
    expect(noBreak.title.startsWith('NO-BREAK DE COMANDO')).toBe(true);
    expect(noBreak.heading).toContain('Outros equipamentos');
    const heading = text.lastIndexOf(noBreak.heading, starts[sheets.indexOf(noBreak)]!);
    expect(heading, 'the "Outros equipamentos" heading before the No-break').toBeGreaterThan(-1);
    expect(starts[sheets.indexOf(noBreak)]!).toBeLessThan(starts[sheets.findIndex((sheet) => sheet.type === 'malha_aterramento')]!);
    const nb = slice('no_break_comando');
    for (const label of ['MODELO', 'POTÊNCIA NOMINAL', 'AUTONOMIA NOMINAL', 'BATERIAS: QUANTIDADE', 'BATERIAS: CAPACIDADE']) expect(nb, label).toContain(label);
    for (const row of [
      '1. LIMPEZA, VENTILAÇÃO E VENTILADORES',
      '2. DISPLAY, ALARMES E LEDS',
      '3. REAPERTO DAS CONEXÕES',
      '4. BATERIAS',
      '5. ATERRAMENTO, BYPASS E IDENTIFICAÇÃO',
      '6. CARGAS ALIMENTADAS IDENTIFICADAS',
    ])
      expect(nb, row).toContain(row);
  }, 200_000);
});
