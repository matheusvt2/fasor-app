import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, generationJobRowSchema, layoutSpec, previewResponseSchema, type GenerationJobRow, type Op } from '@app/domain';
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
import { extractStructure, readZipEntries } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 24.4-INT (batch e24a, Stories 24.3 and 24.4, seed v14): the layout-lock relatório built on v14 (the
 * same answers as the locked v13 one, `@app/domain/fixtures/layout-lock`) prints the v14 rules:
 * - section 10's Parecer box is Não apto and its summary names each reprovada ficha with its findings,
 *   in the words of its conclusion in section 9; the third fixed bullet is absent; the template's own
 *   "nos itens **8 e 9**" is replaced across its runs (no bold "8 e 9" run left);
 * - section 9's CONCLUSÃO row of a Reprovado ficha has both restriction boxes empty, a restriction
 *   stored before the rule ignored on read; the NC observation typed in two lines prints on one line.
 * The DOCX half reads the layout's document; the PDF half previews the relatório through the api (its
 * worker, its LibreOffice) and reads the PDF's text, and writes the PDF to `test-results/e24a-pdf/`.
 * The v13 relatório's DOCX keeps what its golden pins (`docx-layout-lock.test.ts`).
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const PDF_DIR = resolve(__dirname, '../../../../../test-results/e24a-pdf');

const fixture = layoutLockFixture('v14', { companyId: companyA.companyId, actorId: companyA.userId, deviceId: 'tablet-e24a-print' });

/** The v14 summary's Reprovado sentence for the relatório's six reprovadas, as `composeParecer` names them. */
const REPROVADO_V14 =
  '6 fichas foram reprovadas: PR-SINTETICA, por resistência de isolação mínima de 2.500 MΩ em Fase A–Massa (critério: ≥ 5.000 MΩ, ANSI/NETA MTS-2023, Tabela 100.1) e pré-requisito não atendido (Desligador íntegro: NÃO) no ensaio de isolação; PR-SINTETICA-2; SEC-SINTETICA, por resistência de contato máxima de 46 µΩ em T5-T6–Fase C (alta de 100 % sobre 23 µΩ da manutenção anterior, rev. 1 de 05/11/2025, acima do limite de 50 %); DJ-SINTETICA, por resistência de isolação mínima de 1 GΩ em T1–T2 (critério: ≥ 5.000 MΩ, ANSI/NETA MTS-2023, Tabela 100.1); TR-1, por desvio de relação de transformação de 99,94 % em H1-H3 / X0-X3 (critério: ±0,5 %, aceitável na ficha); RT-SINTETICA, por tensões medidas fora do critério em Tensão de saída (110 Vcc; critério: entre 118 e 132 Vcc, Manual do fabricante).';
const REPROVADO_V13 =
  '6 fichas foram reprovadas: 1 por relação de transformação insatisfatória (TR-1), 4 por leituras fora do critério de aceitação (PR-SINTETICA, SEC-SINTETICA, DJ-SINTETICA e RT-SINTETICA) e 1 por pré-requisito do ensaio não atendido (PR-SINTETICA-2).';

async function docxOf(version: string): Promise<Buffer> {
  const layout = layoutSpec(layoutLockSnapshot(version), { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return buildDocx(layout, { tocPages: placeholderPages(layout) });
}

/** The CONCLUSÃO table of the sheet whose paragraph starts with `subject`: its boxes row and its paragraph. */
function conclusionOf(tables: string[][][], subject: string): string[][] {
  const table = tables.find((rows) => rows[0]?.[0] === 'CONCLUSÃO' && (rows[2]?.[0] ?? '').startsWith(subject));
  if (table === undefined) throw new Error(`no CONCLUSÃO table for "${subject}"`);
  return table;
}

const BOLD_8_E_9 = /<w:r>(?:(?!<\/w:r>)[\s\S])*<w:b\/>(?:(?!<\/w:r>)[\s\S])*<w:t(?:\s[^>]*)?>8 e 9<\/w:t>/;

describe('24.4-INT the DOCX of a v14 relatório', () => {
  it('section 10: Não apto, the summary names each reprovada with its findings, the third bullet absent, no bold "8 e 9" run', async () => {
    const docx = await docxOf('v14');
    const structure = extractStructure(docx);
    const body = structure.paragraphs.join('\n');
    expect(body).toContain('Não apto');
    expect(body).toContain(REPROVADO_V14);
    expect(body).not.toContain(REPROVADO_V13);
    expect(body).not.toContain('Apesar dos resultados dos testes serem positivos');
    expect(structure.paragraphs.some((paragraph) => paragraph.includes('encontram-se nos itens 8 e 9 deste relatório;'))).toBe(true);
    const xml = readZipEntries(docx).get('word/document.xml')!.toString('utf8');
    expect(BOLD_8_E_9.test(xml)).toBe(false);
  }, 120_000);

  it('section 9: the breaker Reprovado (its stored Com restrições ignored) and the arrester reproved by the technician print X on REPROVADO only; the TC chosen Com restrições prints APROVADO and COM; the NC in two lines on one line', async () => {
    const { tables } = extractStructure(await docxOf('v14'));
    const boxes = (aprovado: string, reprovado: string, sem: string, com: string) => ['APROVADO', aprovado, 'REPROVADO', reprovado, 'SEM RESTRIÇÕES', sem, 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', com];
    expect(conclusionOf(tables, 'O disjuntor DJ-SINTETICA')[1]).toEqual(boxes('', 'X', '', ''));
    expect(conclusionOf(tables, 'O para-raio PR-SINTETICA-2')[1]).toEqual(boxes('', 'X', '', ''));
    expect(conclusionOf(tables, 'O TC TC-SINTETICA')[1]).toEqual(boxes('X', '', '', 'X'));
    const cable = conclusionOf(tables, 'Os cabos de entrada CE-SINTETICA')[2]![0]!;
    expect(cable).toContain('sinais de aquecimento na mufla; Verificar na próxima visita (item 2, NC)');
    expect(cable).not.toContain('\n');
  }, 120_000);

  it('v13 beside it: the sentence by reason, the breaker\'s COM marked, the bold "8 e 9" run and the NC observation\'s line break as before', async () => {
    const docx = await docxOf('v13');
    const structure = extractStructure(docx);
    expect(structure.paragraphs.join('\n')).toContain(REPROVADO_V13);
    expect(conclusionOf(structure.tables, 'O disjuntor DJ-SINTETICA')[1]).toEqual(['APROVADO', '', 'REPROVADO', 'X', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']);
    expect(conclusionOf(structure.tables, 'Os cabos de entrada CE-SINTETICA')[2]![0]).toContain('sinais de aquecimento na mufla\nVerificar na próxima visita (item 2, NC)');
    expect(BOLD_8_E_9.test(readZipEntries(docx).get('word/document.xml')!.toString('utf8'))).toBe(true);
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

describe('24.4-INT the PDF of a v14 relatório (24.3: the Reprovado ficha\'s boxes; 24.4: section 10 names the finding)', () => {
  it('the breaker\'s CONCLUSÃO row has both restriction boxes empty, and the Parecer names it with its finding; the PDF is kept in test-results/e24a-pdf', async () => {
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
    writeFileSync(resolve(PDF_DIR, 'e24a-v14-relatorio.pdf'), pdf);
    writeFileSync(resolve(PDF_DIR, 'e24a-v14-relatorio.docx'), await docxOf('v14'));
    const text = await pdfText(pdf);
    expect(text).toContain('CONCLUSÃO APROVADO REPROVADO X SEM RESTRIÇÕES COM RESTRIÇÕES (VER OBSERVAÇÕES) O disjuntor DJ-SINTETICA');
    expect(text).not.toContain('COM RESTRIÇÕES (VER OBSERVAÇÕES) X O disjuntor DJ-SINTETICA');
    expect(text).toContain('CONCLUSÃO APROVADO REPROVADO X SEM RESTRIÇÕES COM RESTRIÇÕES (VER OBSERVAÇÕES) O para-raio PR-SINTETICA-2');
    expect(text).toContain('Não apto');
    expect(text).toContain('6 fichas foram reprovadas: PR-SINTETICA, por resistência de isolação mínima de 2.500 MΩ');
    expect(text).toContain('DJ-SINTETICA, por resistência de isolação mínima de 1 GΩ em T1–T2 (critério: ≥ 5.000 MΩ');
    expect(text).not.toContain('Apesar dos resultados dos testes serem positivos');
  }, 200_000);
});
