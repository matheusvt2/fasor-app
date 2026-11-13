import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import {
  blockConfigWithSubBlock,
  blockDefinitionIn,
  blockFieldPath,
  blockReadings,
  buildSnapshot,
  choiceValue,
  companyBlockType,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  definitionContext,
  evaluateSheetMeasurements,
  generationJobRowSchema,
  initialOrderKey,
  layoutSpec,
  locationEnvPath,
  makeOp,
  newEquipmentBlock,
  notApplicableReadingValue,
  previewResponseSchema,
  replay,
  section9Layout,
  sheetNameplatePath,
  sheetTestCellPath,
  sheetTestValuePath,
  snapshotDefinitionContext,
  visitContextOf,
  type CompanyTypeDefinition,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type GenerationJobRow,
  type JsonValue,
  type LastResults,
  type Op,
  type OpDraft,
  type PrintSheet,
  type PrintTable,
  type RelatorioSnapshot,
} from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockFixture } from '@app/domain/fixtures/layout-lock';
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
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.20-INT (batch e25p, Story 25.20, seed v15 `criterion_result_per_row` and `corrected_headers_corrigido`): a v15
 * relatório holding every measurement test of the seed (the layout lock's synthetic v15 relatório, one sheet of every
 * type v15 offers, each switchable test switched on and every typed cell filled by rule) and one company table ruled
 * "220 V ± 5 %", with the cabine's ambient so the paired insulation tables print their "20 °C (corrigido)" values.
 * First visit, then the same relatório with a previous visit on every equipment (its readings 10 % lower): each time
 * the DOCX's tables are the kernel's, and the preview PDF (the api's worker, its LibreOffice) prints every token of the
 * touched tables whole on one line: each word, each number, each value with its unit. The PDFs and a crop of each
 * touched table shape go to `test-results/e25p-pdf/`. Every value is invented.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const OUT_DIR = resolve(__dirname, '../../../../../test-results/e25p-pdf');
const VERSION = 'v15';
const NBSP = '\u00a0';

const actor = { companyId: companyA.companyId, actorId: companyA.userId, deviceId: 'tablet-e25p-2520' };
/** This test's own ids and op ids: `019a6100-2520-7000-8000-NNNNNNNNNNNN`, `019a6100-2521-7000-8000-NNNNNNNNNNNN`. */
const ownId = (n: number) => `019a6100-2520-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCount = 0;
const opOf = (draft: OpDraft): Op => makeOp({ ...draft, device_id: actor.deviceId }, { newId: () => `019a6100-2521-7000-8000-${(++opCount).toString(16).padStart(12, '0')}`, now: new Date(Date.parse('2026-11-12T10:00:00.000Z') + opCount * 1000) });
const num = (raw: string, unit: string | null): JsonValue => ({ raw, unit, state: 'measured' });

/** A company type of one table: an input and an output voltage ruled "220 V ± 5 %" (Story 24.18's nominal row). */
const COMPANY: CompanyTypeDefinition = {
  label: 'Quadro de alimentação sintético',
  tag_prefix: 'QA',
  noun: { singular: 'quadro', plural: 'quadros', gender: 'm' },
  nameplate: [
    { key: 'fabricante', label: 'FABRICANTE', kind: 'manufacturer' },
    { key: 'modelo', label: 'MODELO', kind: 'text' },
  ],
  checklist: [
    { key: 'limpeza_e_fixacao', label: 'Limpeza e fixação do gabinete', nc_phrases: ['Gabinete sujo', 'Fixação solta', 'Corrosão aparente'] },
    { key: 'bornes', label: 'Bornes e conexões', nc_phrases: ['Bornes oxidados', 'Conexão frouxa', 'Isolação danificada'] },
  ],
  tests: [],
  measurement_tests: [
    {
      key: 'tensoes_medidas',
      label: 'Tensão de alimentação',
      row_header: 'Medição',
      columns: [{ key: 'valor', label: 'Tensão', kind: 'number', unit: 'V' }],
      rows: [
        { key: 'entrada', label: 'Entrada' },
        { key: 'saida', label: 'Saída' },
      ],
      criteria: [{ type: 'absolute', seeded: 'tensao_nominal', rows: ['entrada', 'saida'], source: { name: 'Manual do fabricante', edition: 'rev. 1' } }],
    },
  ],
  criteria: [{ key: 'tensao_nominal', label: 'Tensão nominal', operator: 'nominal_pct', value: 220, tolerance_pct: 5, unit: 'V', type: 'deviation_between', source: { name: 'Manual do fabricante', edition: 'rev. 1' } }],
} as CompanyTypeDefinition;

/** The by-rule value of a typed cell no case below names: a choice its first passing option, a number a modest one. */
function cellValue(testKey: string, row: number, col: number, cell: { kind: string; units: readonly string[]; unit: string | null; options: readonly { key: string }[] }): JsonValue | null {
  const unit = cell.units[0] ?? cell.unit;
  switch (testKey) {
    case 'termografia': {
      // Within on both columns, restricted between similares, restricted over the ambient, then a point not measured.
      if (row === 3) return { raw: '', unit, state: 'not_measured' };
      const values = [
        ['1', '4'],
        ['4', '8'],
        ['2', '25'],
      ];
      return num(values[row]![col]!, unit);
    }
    case 'resistencia_enrolamento':
      // AT on the tap in service 3 % over its lowest phase; BT within; the optional taps left empty.
      if (row === 0) return num(['1.2', '1.212', '1.236'][col]!, 'Ω');
      if (row === 3) return num(['3.1', '3.11', '3.12'][col]!, 'mΩ');
      return null;
    case 'resistencia_fusiveis':
      return num(['10', '10.5', '11'][row]!, unit);
    case 'continuidade_malha':
      return row === 3 ? { raw: '', unit, state: 'not_measured' } : row === 4 ? (notApplicableReadingValue(unit) as JsonValue) : num(['0.1', '0.2', '0.3'][row]!, unit);
    case 'resistencia_malha':
      return num('4.2', unit);
    case 'cta_resistencia_contato':
      return num(String(40 + row * 2 + col), unit);
    case 'cta_transferencia':
      return num(col === 0 ? '9' : '8', unit);
    case 'cta_termografia':
      return cell.kind === 'choice' ? choiceValue('normal') : num(String([30, 1, 6][col]), unit);
    case 'tensoes_medidas':
      return num(row === 0 ? '221' : '232', 'V');
    default:
      // The CTA's settings: "Deixado" as "Projeto"; the insulation tests well above their limits.
      if (cell.kind === 'choice') return choiceValue(cell.options[0]!.key);
      return num(testKey.startsWith('cta_isolamento') ? '500' : '10', unit);
  }
}

interface Built {
  relatorioId: string;
  projectId: string;
  first: Op[];
  previous: Op[];
  companyIds: string[];
}

/** The first visit's op log, and the ops that turn it into a second visit (a previous visit on every equipment). */
function build(): Built {
  const base = layoutLockFixture(VERSION, actor);
  const log: Op[] = [...base.log];
  const relatorioId = base.relatorioId;
  const put = (path: string, value: JsonValue, scope: 'relatorio' | 'project' = 'relatorio'): void => {
    log.push(
      opOf({
        kind: 'put',
        scope,
        company_id: actor.companyId,
        project_id: scope === 'project' ? base.projectId : null,
        relatorio_id: scope === 'relatorio' ? relatorioId : null,
        path,
        value,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: actor.actorId,
      }),
    );
  };
  const create = (scope: 'company' | 'project' | 'relatorio', path: string, value: unknown): Op =>
    opOf({
      kind: 'create',
      scope,
      company_id: actor.companyId,
      project_id: scope === 'project' ? base.projectId : null,
      relatorio_id: scope === 'relatorio' ? relatorioId : null,
      path,
      value: value as JsonValue,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: actor.actorId,
    });

  // The company type, published, and one sheet of it in the cabine.
  const typeId = ownId(700);
  const versionId = ownId(701);
  const typeRow: EquipmentTypeRow = { id: typeId, derived_from: { seed_version: VERSION, block_type: 'quadro_eletrico' }, draft: null, retired_at: null, removed_at: null, latest_version: 0 };
  const versionRow: EquipmentTypeVersionRow = { id: versionId, type_id: typeId, version: 1, definition: COMPANY, published_by: actor.actorId, published_at: '2026-11-01T12:00:00.000Z' };
  const ctx = definitionContext([versionRow], [{ ...typeRow, latest_version: 1 }]);
  log.unshift(create('company', `equipment_type/${typeId}`, typeRow), create('company', `equipment_type_version/${versionId}`, versionRow));
  const before = buildSnapshot(replay(log), relatorioId);
  const cabine = before.locations.find((row) => row.kind === 'cabine')!;
  const { equipment, block } = newEquipmentBlock({
    blockId: ownId(10),
    equipmentId: ownId(11),
    relatorioId,
    projectId: base.projectId,
    locationId: cabine.id,
    type: companyBlockType(typeId),
    tag: 'QA-01',
    seedVersion: VERSION,
    orderKey: initialOrderKey(997),
    typeVersion: { version: 1, id: versionId },
    definitions: ctx,
  });
  log.push(create('project', `equipment/${equipment.id}`, equipment), create('relatorio', `block/${block.id}`, block));

  // The cabine's ambient (the "20 °C (corrigido)" columns hold values) and the oil transformer's plate.
  put(locationEnvPath(cabine.id, 'temperature_c'), num('30', '°C'));
  const sheets = buildSnapshot(replay(log), relatorioId).blocks.filter((row) => row.equipment_id !== null && row.removed_at === null);
  const transformer = sheets.find((row) => row.block_type === 'transformador_forca')!;
  put(sheetNameplatePath(transformer.id, 'tipo_de_isolacao'), 'ÓLEO ISOLANTE');
  put(sheetNameplatePath(transformer.id, 'material_enrolamento'), 'Cu');
  put(sheetNameplatePath(transformer.id, 'temperatura_oleo_c'), num('40', '°C'));
  // The seccionadora with fuses, so its fuse resistance applies (Story 23.9's `applies_when`).
  put(sheetNameplatePath(sheets.find((row) => row.block_type === 'chave_seccionadora')!.id, 'tipo_seccionadora'), 'SOB CARGA COM FUSÍVEIS');

  // Every switchable measurement test on, the thermography's load answered, then every typed cell by rule.
  for (const sheet of sheets) {
    const state = buildSnapshot(replay(log), relatorioId);
    const row = state.blocks.find((one) => one.id === sheet.id)!;
    const definition = blockDefinitionIn(snapshotDefinitionContext(state), row)!;
    let config: unknown = row.config;
    for (const test of definition.measurement_tests ?? []) if (test.switchable !== undefined) config = blockConfigWithSubBlock(config, test.key, true);
    if (JSON.stringify(config) !== JSON.stringify(row.config)) put(blockFieldPath(row.id, 'config'), config as JsonValue);
    for (const test of definition.measurement_tests ?? []) {
      for (const value of test.values ?? []) if (value.key === 'em_carga') put(sheetTestValuePath(row.id, test.key, value.key), choiceValue('sim'));
    }
    const now = buildSnapshot(replay(log), relatorioId).blocks.find((one) => one.id === sheet.id)!;
    for (const test of evaluateSheetMeasurements(now, definition)) {
      for (const shown of test.rows) {
        for (const cell of shown.cells) {
          if (cell.fixed !== null) continue;
          const value = cellValue(test.testKey, shown.row, cell.address.col, cell);
          if (value !== null) put(sheetTestCellPath(row.id, test.testKey, shown.row, cell.address.col), value);
        }
      }
    }
  }

  // The second visit: every equipment's readings of a relatório issued a year before, 10 % lower.
  const first = buildSnapshot(replay(log), relatorioId);
  const ctxNow = snapshotDefinitionContext(first);
  const scaled = (raw: string) => String(Math.round(Number(raw) * 0.9 * 1000) / 1000);
  const previous: Op[] = [];
  for (const row of first.blocks) {
    if (row.equipment_id === null || row.removed_at !== null) continue;
    const definition = blockDefinitionIn(ctxNow, row);
    if (definition === null) continue;
    const readings = blockReadings(row, definition, visitContextOf(first, row));
    if (Object.keys(readings).length === 0) continue;
    const entry: LastResults = {
      relatorio_id: ownId(800),
      revision_number: 1,
      issued_at: '2025-11-06T12:00:00.000Z',
      seed_version: VERSION,
      block_type: row.block_type,
      readings: Object.fromEntries(
        Object.entries(readings).map(([key, reading]) => [key, reading.corrected === undefined ? { ...reading, raw: scaled(reading.raw) } : { ...reading, raw: scaled(reading.raw), corrected: { ...reading.corrected, raw: scaled(reading.corrected.raw) } }]),
      ),
      prior: null,
    };
    previous.push(
      makeOp(
        { kind: 'put', scope: 'project', company_id: actor.companyId, project_id: base.projectId, relatorio_id: null, path: `equipment/${row.equipment_id}/last_results`, value: entry as unknown as JsonValue, prev_op_id: null, batch_id: null, meta: null, actor_id: 'system:generate', device_id: 'server' },
        { newId: () => `019a6100-2521-7000-8000-${(++opCount).toString(16).padStart(12, '0')}`, now: new Date(Date.parse('2026-11-12T11:00:00.000Z') + opCount * 1000) },
      ),
    );
  }
  return { relatorioId, projectId: base.projectId, first: log, previous, companyIds: [typeId, versionId] };
}

const BUILT = build();

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, { ...init, redirect: 'manual', headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string> | undefined) } });
}

let cookie = '';

async function waitForJob(id: string, timeoutMs = 170_000): Promise<GenerationJobRow> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [record] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.entity, 'generation_job'), eq(entities.id, id)));
    const job = record === undefined ? null : generationJobRowSchema.parse(record.row);
    if (job !== null && (job.status === 'done' || job.status === 'failed')) return job;
    if (Date.now() > deadline) throw new Error(`job ${id} did not finish within ${timeoutMs} ms`);
    await new Promise((done) => setTimeout(done, 1500));
  }
}

async function previewPdf(): Promise<Buffer> {
  const res = await call(`/api/relatorios/${BUILT.relatorioId}/preview`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }) });
  expect(res.status, await res.clone().text()).toBe(202);
  const job = await waitForJob(previewResponseSchema.parse(await res.json()).job_id);
  expect(job.status, job.error ?? '').toBe('done');
  const download = await call(`/api/relatorios/${BUILT.relatorioId}/preview.pdf?v=${job.result_file_id}`, { headers: { cookie } });
  expect(download.status).toBe(200);
  return Buffer.from(await download.arrayBuffer());
}

async function removeFixture(): Promise<void> {
  const opIds = [...BUILT.first, ...BUILT.previous].map((op) => op.op_id);
  await db.transaction(async (tx) => {
    await tx.delete(ops).where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, opIds), eq(ops.relatorio_id, BUILT.relatorioId), eq(ops.project_id, BUILT.projectId))));
    await tx
      .delete(entities)
      .where(and(eq(entities.company_id, companyA.companyId), or(eq(entities.relatorio_id, BUILT.relatorioId), eq(entities.project_id, BUILT.projectId), inArray(entities.id, [BUILT.projectId, ...BUILT.companyIds]))));
  });
}

GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

/** One text item of the PDF: its text (NFKC, the no-break space read as a space), its page and its place in points from the page's top. */
interface Item {
  text: string;
  page: number;
  x: number;
  width: number;
  top: number;
}

async function pdfItems(pdf: Buffer): Promise<Item[]> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const items: Item[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const height = page.getViewport({ scale: 1 }).height;
      for (const item of (await page.getTextContent()).items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        items.push({ text: item.str.replaceAll(NBSP, ' ').trim().normalize('NFKC'), page: n - 1, x: item.transform[4] as number, width: item.width, top: height - (item.transform[5] as number) });
      }
    }
    return items;
  } finally {
    await task.destroy();
  }
}

/** The text a token is searched as in the PDF: NFKC, the no-break space read as a space. */
const pdfForm = (text: string) => text.replaceAll(NBSP, ' ').normalize('NFKC');

/**
 * The tokens of a touched table a reader must see whole: each cell's text split at its plain spaces and line breaks
 * only, a value joined to its unit by a no-break space one token ("1,236 Ω"); one-character tokens left out.
 */
function tokensOf(table: PrintTable): Set<string> {
  const out = new Set<string>();
  for (const row of table.rows) for (const cell of row.cells) for (const token of cell.text.split(/[^\S\u00a0]+/u)) if ([...token].length > 1) out.add(pdfForm(token));
  return out;
}

/**
 * Every token of the table printed whole on one line, read in the table's own region of the PDF (`items`, in drawing
 * order): the items joined by spaces, each character keeping the line (top) of its item; a token found nowhere, or
 * found with its characters on two lines, is broken. The items of one cell's lines are drawn one after another, so a
 * value cut by its column leaves its two pieces next to each other on two lines.
 */
function brokenTokens(items: readonly Item[], tokens: ReadonlySet<string>): string[] {
  let text = '';
  const tops: number[] = [];
  let last: Item | null = null;
  for (const item of items) {
    // Two runs of one word on one line (a glyph from another face) touch: joined with no space.
    const touching = last !== null && Math.abs(last.top - item.top) <= 1 && Math.abs(last.x + last.width - item.x) < 0.5;
    if (text !== '' && !touching) {
      text += ' ';
      tops.push(item.top);
    }
    text += item.text;
    for (let i = 0; i < item.text.length; i++) tops.push(item.top);
    last = item;
  }
  const broken: string[] = [];
  for (const token of tokens) {
    let found = false;
    for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + 1)) {
      const before = at === 0 ? ' ' : text[at - 1]!;
      const after = text[at + token.length] ?? ' ';
      if (!/[\s(]/u.test(before) || !/[\s),.;]/u.test(after)) continue;
      const lines = tops.slice(at, at + token.length);
      if (Math.max(...lines) - Math.min(...lines) > 1) broken.push(`"${token}" on two lines`);
      else found = true;
    }
    if (!found) broken.push(`"${token}" not whole anywhere`);
  }
  return [...new Set(broken)];
}

/** The parts of the touched tables: every measurement table of section 9 and every table that prints a corrected column. */
function touched(snapshot: RelatorioSnapshot): { sheet: PrintSheet; table: PrintTable; next: string | null }[] {
  const out: { sheet: PrintSheet; table: PrintTable; next: string | null }[] = [];
  for (const sheet of section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((sub) => sub.sheets)) {
    sheet.parts.forEach((part, i) => {
      if (part.kind !== 'table') return;
      const texts = part.table.rows.flatMap((row) => row.cells.map((cell) => pdfForm(cell.text)));
      if (!texts.includes('CRITÉRIO') && !texts.some((text) => text.includes('(corrigido)'))) return;
      const after = sheet.parts[i + 1];
      const next = after === undefined ? null : after.kind === 'table' ? pdfForm(after.table.rows[0]!.cells[0]!.text) : after.kind === 'paragraph' ? pdfForm(after.text) : null;
      out.push({ sheet, table: part.table, next });
    });
  }
  return out;
}

/** The PDF's items grouped into lines (page, top), each line's text its items left to right. */
function linesOf(items: readonly Item[]): { page: number; top: number; text: string }[] {
  const lines: { page: number; top: number; items: Item[] }[] = [];
  for (const item of items) {
    const line = lines.find((one) => one.page === item.page && Math.abs(one.top - item.top) <= 1);
    if (line === undefined) lines.push({ page: item.page, top: item.top, items: [item] });
    else line.items.push(item);
  }
  return lines
    .map((line) => ({ page: line.page, top: line.top, text: line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ') }))
    .sort((a, b) => a.page - b.page || a.top - b.top);
}

/** Where a touched table prints: its page, from its title's line to the next part's (or the page's foot); null when not found. */
interface Region {
  page: number;
  from: number;
  to: number;
}

function regionOf(lines: ReturnType<typeof linesOf>, sheet: PrintSheet, table: PrintTable, next: string | null): Region | null {
  const start = lines.findIndex((line) => line.text.startsWith(pdfForm(sheet.title)));
  const title = pdfForm(table.rows[0]!.cells[0]!.text);
  const head = lines.findIndex((line, i) => i > start && line.text.startsWith(title));
  if (start === -1 || head === -1) return null;
  const top = lines[head]!;
  // The next part's first line: its title, or the first line of a paragraph that wraps (the history note).
  const end = next === null ? undefined : lines.find((line, i) => i > head && line.page === top.page && (line.text.startsWith(next) || (line.text.length >= 12 && next.startsWith(line.text))));
  return { page: top.page, from: top.top - 2, to: end === undefined ? Number.POSITIVE_INFINITY : end.top - 2 };
}

/** A crop of a region at 150 dpi (its page alone, by `pdftoppm`), down to the page's foot when the region runs to it. */
async function cropOf(pdf: Buffer, region: Region): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), 'e25p-crop-'));
  try {
    writeFileSync(join(dir, 'in.pdf'), pdf);
    execFileSync('pdftoppm', ['-f', String(region.page + 1), '-l', String(region.page + 1), '-r', '150', '-png', '-singlefile', join(dir, 'in.pdf'), join(dir, 'page')]);
    const image = readFileSync(join(dir, 'page.png'));
    const meta = await sharp(image).metadata();
    const scale = 150 / 72;
    const y = Math.max(0, Math.floor((region.from - 12) * scale));
    const bottom = Number.isFinite(region.to) ? Math.ceil((region.to + 4) * scale) : Math.min(meta.height!, y + Math.ceil(330 * scale));
    return await sharp(image).extract({ left: 0, top: y, width: meta.width!, height: Math.min(meta.height!, bottom) - y }).png({ palette: true }).toBuffer();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const slug = (text: string) => pdfForm(text).normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await removeFixture();
  const result = await applyOps(db, asCompanyId(companyA.companyId), BUILT.first.map((op): Op => ({ ...op })), { now, origin: 'server' });
  expect(result.rejected).toEqual([]);
  const res = await call('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }) });
  expect(res.status, await res.text()).toBe(200);
  cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}, 120_000);

afterAll(async () => {
  await removeFixture();
  await sql.end();
});

/** The relatório as the server holds it, the DOCX's tables, and the kernel's section 9 tables of the touched kind. */
async function printed(log: readonly Op[]) {
  const snapshot = buildSnapshot(replay([...log]), BUILT.relatorioId);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  const docx = extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
  return { snapshot, layout, tables: docx.tables, touched: touched(snapshot) };
}

describe('25.20-INT a v15 relatório with every measurement test of the seed and one company table, on a first and on a second visit', () => {
  it('the DOCX prints the kernel\'s tables (CRITÉRIO, RESULTADO, "(corrigido)"), and the PDF prints every token of the touched tables whole on one line', async () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const report: Record<string, unknown> = {};
    for (const visit of ['first', 'second'] as const) {
      if (visit === 'second') {
        const result = await applyOps(db, asCompanyId(companyA.companyId), BUILT.previous.map((op): Op => ({ ...op })), { now, origin: 'server' });
        expect(result.rejected).toEqual([]);
      }
      const { layout, tables, touched: parts } = await printed(visit === 'first' ? BUILT.first : [...BUILT.first, ...BUILT.previous]);
      // Every measurement test of the seed that reads a measurement prints the two columns: the thermography of each type,
      // the winding, the fuses, the Malha's two, the CTA's six, and the company table.
      const titles = parts.map(({ table }) => pdfForm(table.rows[0]!.cells[0]!.text));
      for (const title of ['TERMOGRAFIA', 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS', 'RESISTÊNCIA DOS FUSÍVEIS HH', 'E1 · RESISTÊNCIA DE ATERRAMENTO DA MALHA', 'E2 · CONTINUIDADE E EQUIPOTENCIALIZAÇÃO', 'E1 · RESISTÊNCIA DE CONTATO', 'E2 · ISOLAMENTO PRINCIPAL', 'E3 · ISOLAMENTO DO CONTROLE', 'E4 · AJUSTES DO CONTROLADOR', 'E5 · TRANSFERÊNCIA', 'E6 · TERMOGRAFIA SOB CARGA', 'E1 · TENSÃO DE ALIMENTAÇÃO']) {
        expect(titles, `${visit}: ${title}`).toContain(title);
      }
      // The DOCX's tables are the kernel's, row for row.
      const kernel = parts.map(({ table }) => table.rows.map((row) => row.cells.map((cell) => cell.text)));
      const docxRows = tables.map((table) => JSON.stringify(table));
      for (const one of kernel) expect(docxRows, `${visit}: ${one[0]![0]}`).toContain(JSON.stringify(one));
      // The winding row 3 % over its lowest phase, the thermography's worse of two, the company row out of "220 V ± 5 %".
      const rowOf = (title: string, label: string) => kernel.find((table) => pdfForm(table[0]![0]!) === title)!.find((row) => pdfForm(row[0]!) === label)!.map(pdfForm);
      expect(rowOf('RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS', 'AT, TAP ATUAL').slice(-2)).toEqual(['desvio entre fases ≤ 2 % (com restrição até 5 %)', 'COM RESTRIÇÃO']);
      expect(rowOf('TERMOGRAFIA', 'TERMINAÇÕES').slice(-2)).toEqual(['ΔT entre similares ≤ 3 °C (com restrição até 15 °C)\nΔT sobre o ambiente ≤ 10 °C (com restrição até 40 °C)', 'COM RESTRIÇÃO']);
      expect(rowOf('TERMOGRAFIA', 'BUCHAS').slice(-1)).toEqual(['-']);
      expect(rowOf('E1 · TENSÃO DE ALIMENTAÇÃO', 'SAÍDA').slice(-2)).toEqual(['220 V ± 5 %', 'INSATISFATÓRIO']);
      expect(rowOf('E2 · CONTINUIDADE E EQUIPOTENCIALIZAÇÃO', 'PARA-RAIOS').slice(-1)).toEqual(['-']);
      expect(rowOf('E2 · CONTINUIDADE E EQUIPOTENCIALIZAÇÃO', 'BLINDAGENS').slice(-1)).toEqual(['-']);
      const flat = kernel.flat(2).map(pdfForm);
      expect(flat).toContain('20 °C (corrigido)');
      expect(flat).toContain('75 °C (corrigido)');
      expect(JSON.stringify(layout).toLocaleLowerCase('pt-BR')).not.toContain('tipo da empresa');
      if (visit === 'second') expect(flat.some((text) => text.startsWith('MANUT. ANTERIOR'))).toBe(true);

      // The PDF: every token of each touched table whole on one line, read in that table's own region.
      const pdf = await previewPdf();
      writeFileSync(resolve(OUT_DIR, `e25p-${visit}-visit.pdf`), pdf);
      const items = await pdfItems(pdf);
      const lines = linesOf(items);
      const broken: string[] = [];
      const seen = new Set<string>();
      for (const { sheet, table, next } of parts) {
        const name = `${sheet.title} :: ${pdfForm(table.rows[0]!.cells[0]!.text)}`;
        const region = regionOf(lines, sheet, table, next);
        if (region === null) {
          broken.push(`${name}: not found in the PDF`);
          continue;
        }
        const inside = items.filter((item) => item.page === region.page && item.top >= region.from && item.top < region.to);
        broken.push(...brokenTokens(inside, tokensOf(table)).map((one) => `${name}: ${one}`));
        // A crop of each touched table shape, once per title and column count.
        const shape = `${slug(table.rows[0]!.cells[0]!.text)}-${table.columns.length}`;
        if (seen.has(shape)) continue;
        seen.add(shape);
        writeFileSync(resolve(OUT_DIR, `e25p-${visit}-${slug(sheet.title)}-${shape}.png`), await cropOf(pdf, region));
      }
      report[visit] = { tables: parts.length, broken, sizes: parts.map(({ sheet, table }) => `${sheet.title} :: ${pdfForm(table.rows[0]!.cells[0]!.text)} :: ${table.columns.length} cols, ${(table.textHalfPoints ?? 18) / 2} pt`) };
      writeFileSync(resolve(OUT_DIR, 'e25p-tables.json'), `${JSON.stringify(report, null, 2)}\n`);
      expect(broken, `${visit} visit`).toEqual([]);
    }
  }, 500_000);
});
