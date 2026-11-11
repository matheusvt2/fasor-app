import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  defaultBlockConfig,
  EMPTY_DEFINITION_CONTEXT,
  generationJobRowSchema,
  getDefinition,
  instantiateTemplate,
  layoutSpec,
  makeOp,
  previewResponseSchema,
  READING_FIT_WIDTH_EM,
  readingSlotsOf,
  section9Layout,
  SECTION_BLOCK_TYPES,
  SERVER_DEVICE_ID,
  sheetNameplatePath,
  sheetTestCellPath,
  sheetTestPath,
  type GenerationJobRow,
  type JsonValue,
  type Op,
  type OpDraft,
  type PrintTable,
  type TemplateRow,
  wordsWiderThanColumns,
} from '@app/domain';
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
import { toSnapshot } from '../../sync/snapshot.ts';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * Fix batch e23p (P2, the behaviour pass's F3): the v13 transformer's insulation table broke
 * "SECUNDÁRIO" and "22,6" across lines in the PDF in all three of its shapes. One synthetic v13
 * relatório on Empresa A (fixed ids of the `019a6200-..e3-` range, no other test uses it; every value
 * invented) holds four oil transformers at 35 °C of oil, readings of 8, 9 and 0,6 GΩ (22,6, 25,5 and
 * 1,7 at 20 °C), one per shape of the spec's matrix:
 * - a: the manufacturer's value (one criterion), ten columns;
 * - b: TENSÃO NOMINAL AT and BT on the plate (ACEITÁVEL per row), eleven columns;
 * - c: as b, plus a previous v13 visit with corrected readings (MANUT. ANTERIOR), twelve columns;
 * - d: as a, plus the previous visit, eleven columns.
 * It is previewed through the api (its worker, its LibreOffice), and the PDF's text items are grouped
 * into lines: every word of each insulation table appears whole the expected number of times, and no
 * line holds a strict fragment of one. With `E23P_PDF_OUT=<path>` the PDF is also written there.
 *
 * Fix batch e24f (R-8): a fifth transformer with every column the table captures filled with long values
 * (1 MINUTO and its 20 °C value, ABSORÇÃO, POLARIZAÇÃO, TENSÃO), its plate's voltages (ACEITÁVEL) and a
 * previous visit (MANUT. ANTERIOR): the kernel's table has no word wider than its column, each long value prints
 * whole in the PDF, and the DOCX holds the same words.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const hex = (n: number) => n.toString(16).padStart(12, '0');
const entityId = (n: number) => `019a6200-00e3-7000-8000-${hex(n)}`;
const opId = (n: number) => `019a6200-01e3-7000-8000-${hex(n)}`;
const DEVICE = 'tablet-e23p-insulation';
const measured = (raw: string, unit: string | null): JsonValue => ({ raw, unit, state: 'measured' });
const SHAPES = ['a', 'b', 'c', 'd'] as const;
type Shape = (typeof SHAPES)[number];
/** Fix batch e24f (R-8): the fifth sheet, after the four shapes, with every column filled with long values. */
const FULL = SHAPES.length;
const SHEETS = SHAPES.length + 1;
/**
 * Its readings per column the table captures (1 MINUTO in GΩ; ABSORÇÃO and POLARIZAÇÃO typed; TENSÃO in kV). 30 SEGUNDOS and
 * ESTAB./10MIN are print columns that print "-" (source-deltas), so they are left empty.
 */
const FULL_ROW: readonly (readonly [number, JsonValue])[] = [
  [1, measured('1987.65', 'GΩ')],
  [3, measured('1.234', null)],
  [4, measured('10.123', null)],
  [5, measured('10', 'kV')],
];


interface Fixture {
  relatorioId: string;
  projectId: string;
  log: Op[];
  /** Fix batch e24f (R-8): the fifth sheet's block. */
  fullBlockId: string;
}

/** The op log: the project, the instantiated template (four transformers in one cabine), each sheet's writes, the previous visits. */
function fixture(): Fixture {
  let ids = 10;
  const newId = () => entityId(ids++);
  let count = 0;
  const base = Date.parse('2026-11-10T09:00:00.000Z');
  const opOf = (draft: OpDraft, deviceId: string = DEVICE): Op => makeOp({ ...draft, device_id: deviceId }, { newId: () => opId(++count), now: new Date(base + count * 1000) });
  const projectId = entityId(4);
  const ref = 'cabine-e23p';
  const template: TemplateRow = {
    id: entityId(3),
    name: 'Isolação v13',
    version: 1,
    seed_version: 'v13',
    blocks: [
      ...SECTION_BLOCK_TYPES.map((type) => ({ ...defaultBlockConfig('v13', type), quantity: 1, skeleton_location_ref: null, section_text: null })),
      { ...defaultBlockConfig('v13', 'transformador_forca'), quantity: SHEETS, skeleton_location_ref: ref, section_text: null },
    ],
    skeleton: [{ ref, kind: 'cabine', parent_ref: null, name: 'Subestação Sintética', agrupar_por_tipo: false }],
    archived_at: null,
    removed_at: null,
  };
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra sintética e23p', site: 'Rua Sintética, 23', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    template,
    { id: projectId },
    { service_start: '2026-11-09', service_end: '2026-11-10', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId, actorId: companyA.userId, companyId: companyA.companyId },
  );
  const log = [project, ...drafts].map((draft) => opOf(draft));
  const sheets = drafts
    .filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/'))
    .map((draft) => draft.value as { id: string; block_type: string; equipment_id: string | null })
    .filter((block) => block.block_type === 'transformador_forca' && block.equipment_id !== null);
  if (sheets.length !== SHEETS) throw new Error(`expected ${SHEETS} transformer sheets, got ${sheets.length}`);
  const definition = getDefinition('v13', 'cabine_primaria', 'transformador_forca');
  const put = (path: string, value: JsonValue): Op =>
    opOf({ kind: 'put', scope: 'relatorio', company_id: companyA.companyId, project_id: null, relatorio_id: relatorioId, path, value, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId });
  const previousVisit = (block: { equipment_id: string | null }, raw: string, corrected: string): Op => {
    const readings = Object.fromEntries(
      readingSlotsOf(definition)
        .filter((slot) => slot.testKey === 'isolacao')
        .map((slot) => [slot.key, { raw, unit: 'GΩ', state: 'measured', corrected: { raw: corrected, unit: 'GΩ' } }]),
    );
    return opOf(
      {
        kind: 'put',
        scope: 'project',
        company_id: companyA.companyId,
        project_id: projectId,
        relatorio_id: null,
        path: `equipment/${block.equipment_id}/last_results`,
        value: { relatorio_id: entityId(900), revision_number: 1, issued_at: '2026-01-15T12:00:00.000Z', seed_version: 'v13', block_type: 'transformador_forca', readings, prior: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: 'system:generate',
      },
      SERVER_DEVICE_ID,
    );
  };
  sheets.forEach((block, n) => {
    log.push(put(sheetNameplatePath(block.id, 'tipo_de_isolacao'), 'ÓLEO ISOLANTE'));
    log.push(put(sheetNameplatePath(block.id, 'temperatura_oleo_c'), measured('35', '°C')));
    if (n === FULL) {
      log.push(put(sheetNameplatePath(block.id, 'tensao_nominal_at'), measured('13.8', 'kV')));
      log.push(put(sheetNameplatePath(block.id, 'tensao_nominal_bt'), measured('380', 'V')));
      for (const row of [0, 1, 2]) for (const [col, value] of FULL_ROW) log.push(put(sheetTestCellPath(block.id, 'isolacao', row, col), value));
      log.push(previousVisit(block, '1876.54', '5432.1'));
      return;
    }
    const shape: Shape = SHAPES[n]!;
    if (shape === 'b' || shape === 'c') {
      log.push(put(sheetNameplatePath(block.id, 'tensao_nominal_at'), measured('13.8', 'kV')));
      log.push(put(sheetNameplatePath(block.id, 'tensao_nominal_bt'), measured('380', 'V')));
    } else {
      // The manufacturer's value: one criterion for the whole table.
      log.push(put(sheetTestPath(block.id, 'isolacao', 'criterion_override'), { raw: '1000', unit: 'MΩ' }));
    }
    for (const [row, raw] of [[0, '8'], [1, '9'], [2, '0.6']] as const) log.push(put(sheetTestCellPath(block.id, 'isolacao', row, 1), measured(raw, 'GΩ')));
    // A previous v13 visit with corrected readings, as the issue job writes it.
    if (shape === 'c' || shape === 'd') log.push(previousVisit(block, '12', '30'));
  });
  return { relatorioId, projectId, log, fullBlockId: sheets[FULL]!.id };
}

const built = fixture();

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

/** One printed line: its page and the text of its items, joined with a space where a gap parts them. */
interface Line {
  page: number;
  text: string;
}

/**
 * The PDF's lines, in reading order: the text items of a page grouped by baseline (within 0,5 pt),
 * each line's items in x order, joined directly when adjacent and with a space across a gap.
 */
async function pdfLines(pdf: Buffer): Promise<Line[]> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const lines: Line[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const items = content.items.flatMap((item) => ('str' in item && item.str !== '' ? [{ x: item.transform[4] as number, y: item.transform[5] as number, width: item.width, text: item.str }] : []));
      const rows: { y: number; items: typeof items }[] = [];
      for (const item of items) {
        const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 0.5);
        if (row === undefined) rows.push({ y: item.y, items: [item] });
        else row.items.push(item);
      }
      rows.sort((a, b) => b.y - a.y);
      for (const row of rows) {
        row.items.sort((a, b) => a.x - b.x);
        let text = '';
        let end: number | null = null;
        for (const item of row.items) {
          text += end !== null && item.x - end > 0.5 ? ` ${item.text}` : item.text;
          end = item.x + item.width;
        }
        lines.push({ page: n, text: text.normalize('NFC').replace(/\s+/g, ' ').trim() });
      }
    }
    return lines;
  } finally {
    await task.destroy();
  }
}

/** The words of each insulation table, in shape order: from its VALORES header line up to the next table's start. */
function insulationTables(lines: readonly Line[]): string[][] {
  const tables: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.text.includes('VALORES (GΩ)')) {
      current = [];
      tables.push(current);
    } else if (current !== null && /INSTRUM\.\/FABRIC\.|CONCLUSÃO|DADOS DO EQUIPAMENTO|RELAÇÃO DE TRANSFORMAÇÃO|RESISTÊNCIA/.test(line.text)) {
      current = null;
    }
    if (current !== null) current.push(...line.text.split(' ').filter((word) => word !== ''));
  }
  return tables;
}

/** The words each table must hold whole, and how many times. */
const COMMON: Readonly<Record<string, number>> = {
  SECUNDÁRIO: 3,
  PRIMÁRIO: 3,
  MASSA: 3,
  '22,6': 1,
  '25,5': 1,
  '1,7': 1,
  SEGUNDOS: 1,
  MINUTO: 1,
  'ESTAB./10MIN': 1,
  ABSORÇÃO: 1,
  POLARIZAÇÃO: 1,
  TENSÃO: 1,
};
const EXPECTED: Readonly<Record<Shape, Readonly<Record<string, number>>>> = {
  a: COMMON,
  b: { ...COMMON, ACEITÁVEL: 1 },
  c: { ...COMMON, ACEITÁVEL: 1, ANTERIOR: 1 },
  d: { ...COMMON, ANTERIOR: 1 },
};

async function removeFixture(): Promise<void> {
  const opIds = built.log.map((op) => op.op_id);
  await db.transaction(async (tx) => {
    await tx.delete(ops).where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, opIds), eq(ops.relatorio_id, built.relatorioId), eq(ops.project_id, built.projectId))));
    await tx
      .delete(entities)
      .where(and(eq(entities.company_id, companyA.companyId), or(eq(entities.relatorio_id, built.relatorioId), eq(entities.project_id, built.projectId), eq(entities.id, built.projectId))));
  });
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await removeFixture();
  const result = await applyOps(db, asCompanyId(companyA.companyId), built.log.map((op): Op => ({ ...op })), { now, origin: 'server' });
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

/** Fix batch e24f (R-8): the PDF tables read by the first test, for the fifth sheet's checks. */
let pdfTables: string[][] | null = null;

describe('e23p-INT-P2 the v13 transformer\'s insulation table prints every word whole in the PDF, in its four shapes', () => {
  it(
    'previewed through LibreOffice, each table holds its words whole the expected number of times and no fragment of one',
    async () => {
      const res = await call(`/api/relatorios/${built.relatorioId}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
      });
      expect(res.status, await res.clone().text()).toBe(202);
      const answer = previewResponseSchema.parse(await res.json());
      const job = await waitForJob(answer.job_id);
      expect(job.status, job.error ?? '').toBe('done');
      const pdf = await call(`/api/relatorios/${built.relatorioId}/preview.pdf?v=${job.result_file_id}`, { headers: { cookie } });
      expect(pdf.status).toBe(200);
      const bytes = Buffer.from(await pdf.arrayBuffer());
      if (process.env.E23P_PDF_OUT !== undefined && process.env.E23P_PDF_OUT !== '') writeFileSync(process.env.E23P_PDF_OUT, bytes);
      const tables = insulationTables(await pdfLines(bytes));
      // Fix batch e24f (R-8): ~~four tables~~ the four shapes, then the fifth sheet (its own test below).
      expect(tables).toHaveLength(SHEETS);
      pdfTables = tables;
      SHAPES.forEach((shape, i) => {
        const words = tables[i]!;
        const expected = EXPECTED[shape];
        const counts = Object.fromEntries(Object.keys(expected).map((word) => [word, words.filter((one) => one === word).length]));
        expect(counts, `shape ${shape}: ${words.join(' ')}`).toEqual(expected);
        // No strict fragment of an expected word ("SECUNDÁRI", "22,") on any line of the table.
        const fragments = words.filter((one) => one.length >= 2 && Object.keys(expected).some((word) => word !== one && word.startsWith(one) && !(one in expected)));
        expect(fragments, `shape ${shape}`).toEqual([]);
      });
    },
    200_000,
  );

  it('e24f-INT R-8 every column filled with long values: no word wider than its column in the kernel\'s table, each value whole in the PDF, the same words in the DOCX', async () => {
    expect(pdfTables, 'the PDF test above ran first').not.toBeNull();
    const snapshot = await toSnapshot(db, asCompanyId(companyA.companyId), built.relatorioId);
    const sheet = section9Layout(snapshot, 9, 'RESULTADOS')!
      .subsections.flatMap((subsection) => subsection.sheets)
      .find((one) => one.blockId === built.fullBlockId)!;
    const table: PrintTable = sheet.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : [])).find((one) => one.rows.some((row) => row.cells.some((cell) => cell.text === 'ABSORÇÃO')))!;
    expect(table, 'the insulation table of the fifth sheet').toBeDefined();
    expect(wordsWiderThanColumns(table, READING_FIT_WIDTH_EM)).toEqual([]);
    // Every word holding a digit: the long values, their corrected, ACEITÁVEL and MANUT. ANTERIOR cells.
    const values = table.rows.flatMap((row) => row.cells.flatMap((cell) => cell.text.split(/\s+/).filter((word) => /\d/.test(word))));
    for (const long of ['1.987,65', '1,234', '10,123']) expect(values, long).toContain(long);
    const pdfWords = pdfTables![FULL]!;
    const countIn = (words: readonly string[], word: string) => words.filter((one) => one === word).length;
    for (const word of new Set(values)) expect(countIn(pdfWords, word), `PDF: ${word} in ${pdfWords.join(' ')}`).toBeGreaterThanOrEqual(countIn(values, word));
    // No strict fragment of a value on any PDF line of the table ("1.987,6", "1.98").
    expect(pdfWords.filter((one) => /\d/.test(one) && !values.includes(one) && values.some((word) => word.startsWith(one)))).toEqual([]);
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: '2026-11-10T12:00:00.000Z' });
    const docx = extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
    const docxWords = docx.tables.find((rows) => rows.some((cells) => cells.includes('ABSORÇÃO')) && rows.some((cells) => cells.some((cell) => cell.includes('1.987,65'))))?.flatMap((rows) => rows.flatMap((cell) => cell.split(/\s+/)));
    expect(docxWords, 'the DOCX holds the fifth sheet\'s table').toBeDefined();
    for (const word of new Set(values)) expect(countIn(docxWords!, word), `DOCX: ${word}`).toBeGreaterThanOrEqual(countIn(values, word));
  }, 60_000);
});

