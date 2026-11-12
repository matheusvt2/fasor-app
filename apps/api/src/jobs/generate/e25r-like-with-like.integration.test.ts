import {
  buildSnapshot,
  cabineOf,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  equipmentRowSchema,
  errorResponseSchema,
  generateResponseSchema,
  generationJobRowSchema,
  getDefinition,
  locationEnvPath,
  makeOp,
  MIN_CONTRACT_VERSION,
  readingSlotsOf,
  relatorioSetupPath,
  replay,
  revisionRowSchema,
  section9Layout,
  SERVER_DEVICE_ID,
  sheetNameplatePath,
  sheetObservationsPath,
  sheetTestCellPath,
  syncPushResponseSchema,
  type EquipmentRow,
  type GenerationJobRow,
  type JsonValue,
  type LastResults,
  type Op,
  type RelatorioSnapshot,
  type RevisionRow,
} from '@app/domain';
import { layoutLockFixture } from '@app/domain/fixtures/layout-lock';
import { and, eq, inArray, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../auth/auth.ts';
import { parseTrustedOrigins } from '../../auth/trusted-origins.ts';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, ops } from '../../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../../db/seed.ts';
import { newId } from '../../ids.ts';
import { applyOps } from '../../sync/apply.ts';
import { paragraphText, readZipEntries } from './docx-structure.test-support.ts';
import { staleTextReplacements } from './stale-texts.test-support.ts';

/*
 * e25r-R1-API (fix batch e25r, R-1 and E24-A1 of the Epic 24 retrospective, contract 49): seed v14's
 * "like with like" rule survives the issue, through the api's route and its real worker (LibreOffice
 * included). The v14 layout-lock relatório (`@app/domain/fixtures/layout-lock`, synthetic) is applied
 * onto Empresa A with its transformer on its second visit in the R-1 state: the previous visit A (the
 * fixture's `last_results`, written before 49, no `plate_measured`) typed TEMPERATURA DO ÓLEO, its
 * plate kept as the issue job writes it (`last_nameplate`); this visit's oil is not typed, the
 * cabine's ambient is (25 °C), and every insulation and winding reading equals A's. Revision 1 and
 * revision 2 (nothing edited) print no history note line under the transformer's tables, the two
 * revisions print the transformer's tables alike, and the equipment's `last_results.prior` carries
 * `plate_measured` (on 132ad4a1 revision 2 printed the drop and the variation again). The contrast:
 * an entry without the field and the plate of another visit (the production leftovers, D5) prints
 * the note line, so the test can see it. Then contract 49: a version-48 pull answers 426 on every
 * stream, a version-48 push is still applied. The transformer is found by its own title bar, never
 * by a position. Every value is invented.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const JOB_TIMEOUT = 170_000;
const DEVICE = 'tablet-e25r-like-with-like';
const fixture = layoutLockFixture('v14', { companyId: companyA.companyId, actorId: companyA.userId, deviceId: DEVICE });

const OIL = 'temperatura_oleo_c';
const TITLE = 'RELATÓRIOS DOS ENSAIOS';
const NOTE = 'Em relação à manutenção anterior';
/** Another visit of the obra, whose plate is on the row in the contrast case. */
const ELSEWHERE = '019a6400-0e25-7000-8000-0000000000aa';

// --- the R-1 state, from the fixture as built ------------------------------------------------------

const base = buildSnapshot(replay(fixture.log), fixture.relatorioId);
const transformer = base.blocks.find((block) => block.block_type === 'transformador_forca' && block.removed_at === null && block.equipment_id !== null)!;
const equipmentId = transformer.equipment_id!;
/** A: the previous visit as the fixture stores it (a `last_results` put of the issue job, written before contract 49). */
const previous: LastResults = base.equipment.find((row) => row.id === equipmentId)!.last_results!;
const cabine = cabineOf(base.locations, transformer.location_id)!;

/** A relatório-scope put from the fixture's own device, chained on the cell it replaces (`prev_op_id`), so it folds as an edit, never as a concurrent write. */
function relatorioPut(path: string, value: JsonValue, prevOpId: string | null = null): Op {
  return makeOp(
    { kind: 'put', scope: 'relatorio', company_id: companyA.companyId, project_id: null, relatorio_id: fixture.relatorioId, path, value, prev_op_id: prevOpId, batch_id: null, meta: null, actor_id: companyA.userId, device_id: DEVICE },
    { newId, now: now() },
  );
}

/** An equipment put of the obra as the issue job writes one (`system:generate`, the server's device). */
function generatePut(field: 'last_nameplate' | 'last_results', value: unknown): Op {
  return makeOp(
    {
      kind: 'put',
      scope: 'project',
      company_id: companyA.companyId,
      project_id: fixture.projectId,
      relatorio_id: null,
      path: `equipment/${equipmentId}/${field}`,
      value: value as JsonValue,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: 'system:generate',
      device_id: SERVER_DEVICE_ID,
    },
    { newId, now: now() },
  );
}

/** A plate of the transformer as the issue of `visit` left it: TIPO DE ISOLAÇÃO and TEMPERATURA DO ÓLEO at 40 °C. */
const plateOf = (visit: Pick<LastResults, 'relatorio_id' | 'revision_number'>) => ({
  relatorio_id: visit.relatorio_id,
  revision_number: visit.revision_number,
  issued_at: previous.issued_at,
  seed_version: 'v14',
  block_type: 'transformador_forca',
  fields: { tipo_de_isolacao: 'ÓLEO ISOLANTE', [OIL]: { raw: '40', unit: '°C', state: 'measured' } },
});

/** This visit's insulation and winding readings typed again with A's values (the transformer's own sheet held A's thirds). */
const readingPuts: Op[] = readingSlotsOf(getDefinition('v14', 'cabine_primaria', 'transformador_forca'), transformer)
  .filter((slot) => (slot.testKey === 'isolacao' || slot.testKey === 'resistencia_enrolamento') && previous.readings[slot.key] !== undefined)
  .map((slot) => {
    const reading = previous.readings[slot.key]!;
    const standing = transformer.sheet.test[slot.testKey]?.cells[String(slot.row)]?.[String(slot.col)]?.op_id ?? null;
    return relatorioPut(sheetTestCellPath(transformer.id, slot.testKey, slot.row, slot.col), { raw: reading.raw, unit: reading.unit, state: 'measured' }, standing);
  });

/** The fixture without its transformer's oil temperature (never typed on this visit), then the R-1 state. */
const log: Op[] = [
  ...fixture.log.filter((op) => op.path !== sheetNameplatePath(transformer.id, OIL)),
  relatorioPut(locationEnvPath(cabine.id, 'temperature_c'), { raw: '25', unit: '°C', state: 'measured' }),
  ...readingPuts,
  generatePut('last_nameplate', plateOf(previous)),
];

/** Every op this file writes beside `log` (the activity edits, the contrast's puts, the version-48 push). */
const extraOps: Op[] = [];

/**
 * An edit away from the transformer (the relatório's activity on the cover), so the route issues a new revision: a
 * relatório nothing was edited in since its latest revision answers `unchanged`, and the job's own projections are no
 * edit (`status/edited-since.ts`). The transformer's sheet and its equipment row stay as they were.
 */
async function editActivity(text: string): Promise<void> {
  const op = relatorioPut(relatorioSetupPath('atividade'), text);
  extraOps.push(op);
  await serverApply([op]);
}

/** The relatório as the kernel reads the same ops on this side. */
const localSnapshot = (): RelatorioSnapshot => buildSnapshot(replay([...log, ...extraOps]), fixture.relatorioId);

// --- the api -------------------------------------------------------------------------------------

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string> | undefined) },
  });
}

let cookie: string | null = null;

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

/** An authenticated call of Empresa A that signs in again once on a 401. */
async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    if (cookie === null || fresh) cookie = await signIn();
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } });
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

async function jobRow(id: string): Promise<GenerationJobRow | null> {
  const [record] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'generation_job'), eq(entities.id, id)));
  return record === undefined ? null : generationJobRowSchema.parse(record.row);
}

async function waitForJob(id: string): Promise<GenerationJobRow> {
  const deadline = Date.now() + JOB_TIMEOUT;
  for (;;) {
    const job = await jobRow(id);
    if (job !== null && (job.status === 'done' || job.status === 'failed')) return job;
    if (Date.now() > deadline) throw new Error(`job ${id} did not finish within ${JOB_TIMEOUT} ms`);
    await new Promise((done) => setTimeout(done, 1500));
  }
}

/** "Gerar relatório" through the route; waits for the revision `number` the job commits. */
async function issue(number: number): Promise<RevisionRow> {
  // Story 25.7: a stale conclusion text blocks the issue; the v14 fixture holds one, replaced as "Substituir" does.
  const replacements = staleTextReplacements(localSnapshot()).map(([path, value, prevOpId]) => relatorioPut(path, value, prevOpId));
  if (replacements.length > 0) {
    extraOps.push(...replacements);
    await serverApply(replacements);
  }
  const res = await authed(`/api/relatorios/${fixture.relatorioId}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
  });
  expect(res.status, await res.clone().text()).toBe(202);
  const answer = generateResponseSchema.parse(await res.json());
  expect(answer).toMatchObject({ outcome: 'queued', revision_number: number });
  const job = await waitForJob((answer as { job_id: string }).job_id);
  expect(job.status, job.error ?? '').toBe('done');
  const rows = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, fixture.relatorioId)));
  const revision = rows.map((record) => revisionRowSchema.parse(record.row)).find((row) => row.number === number);
  expect(revision, `revision ${number}`).toBeDefined();
  return revision!;
}

/** The equipment row of the transformer as the server holds it. */
async function storedEquipment(): Promise<EquipmentRow> {
  const [record] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'equipment'), eq(entities.id, equipmentId)));
  expect(record).toBeDefined();
  return equipmentRowSchema.parse(record!.row);
}

/** The transformer's `last_results` puts as the obra's stream carries them at the current contract, oldest first. */
async function pulledLastResults(): Promise<Record<string, unknown>[]> {
  const all: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await authed(`/api/sync/projects/${fixture.projectId}?since=${since}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = (await res.json()) as { ops: Op[]; seq: number };
    all.push(...page.ops);
    const last = page.ops.at(-1)?.seq;
    if (last === undefined || last >= page.seq) break;
    since = last;
  }
  return all.filter((op) => op.path === `equipment/${equipmentId}/last_results`).map((op) => op.value as Record<string, unknown>);
}

// --- the DOCX, read by its own title bars ----------------------------------------------------------

type BodyPart = { kind: 'paragraph'; text: string; heading: boolean } | { kind: 'table'; rows: string[][] };

const BODY_PART = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
const PARAGRAPH = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
const ROW = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
const CELL = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;

/** The body of a DOCX in document order: each top-level paragraph (a heading or not) and each table as its cells' text. */
function bodyParts(docx: Buffer): BodyPart[] {
  const xml = readZipEntries(docx).get('word/document.xml')?.toString('utf8');
  if (xml === undefined) throw new Error('word/document.xml missing');
  return [...xml.matchAll(BODY_PART)].map((match): BodyPart => {
    const whole = match[0];
    if (whole.startsWith('<w:tbl>')) {
      return { kind: 'table', rows: [...whole.matchAll(ROW)].map((row) => [...row[1]!.matchAll(CELL)].map((cell) => [...cell[1]!.matchAll(PARAGRAPH)].map((p) => paragraphText(p[0])).join('\n'))) };
    }
    return { kind: 'paragraph', text: paragraphText(whole), heading: /<w:pStyle\s+w:val="Heading\d"/.test(whole) };
  });
}

/** Section 9's sheet titles as the kernel lays them out, and the transformer's. */
function titlesOf(snapshot: RelatorioSnapshot): { all: Set<string>; transformer: string } {
  const sheets = (section9Layout(snapshot, 9, TITLE)?.subsections ?? []).flatMap((subsection) => subsection.sheets);
  const own = sheets.find((sheet) => sheet.blockId === transformer.id);
  expect(own, 'the transformer prints in section 9').toBeDefined();
  return { all: new Set(sheets.map((sheet) => sheet.title)), transformer: own!.title };
}

/** The transformer's part of the document: from its own title bar to the next sheet's title bar or heading. */
function transformerParts(docx: Buffer, snapshot: RelatorioSnapshot): BodyPart[] {
  const titles = titlesOf(snapshot);
  const parts = bodyParts(docx);
  const bars = parts.flatMap((part, i) => (part.kind === 'paragraph' && part.text === titles.transformer ? [i] : []));
  expect(bars, `the title bar "${titles.transformer}"`).toHaveLength(1);
  const rest = parts.slice(bars[0]! + 1);
  const end = rest.findIndex((part) => part.kind === 'paragraph' && (part.heading || titles.all.has(part.text)));
  return end === -1 ? rest : rest.slice(0, end);
}

const tablesOf = (parts: readonly BodyPart[]): string[][][] => parts.flatMap((part) => (part.kind === 'table' ? [part.rows] : []));
const notesOf = (parts: readonly BodyPart[]): string[] => parts.flatMap((part) => (part.kind === 'paragraph' && part.text.startsWith(NOTE) ? [part.text] : []));
/** The insulation and winding tables carry the previous visit (MANUT. ANTERIOR, dated on v14). */
const hasPreviousColumn = (tables: readonly string[][][]): boolean => tables.some((rows) => rows.some((row) => row.some((text) => text.startsWith('MANUT. ANTERIOR'))));

async function docxOf(revision: RevisionRow): Promise<Buffer> {
  const res = await authed(`/api/revisions/${revision.id}/docx`);
  expect(res.status).toBe(200);
  return Buffer.from(await res.arrayBuffer());
}

// --- setup -----------------------------------------------------------------------------------------

async function removeFixture(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(ops)
      .where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, [...log, ...extraOps].map((op) => op.op_id)), eq(ops.relatorio_id, fixture.relatorioId), eq(ops.project_id, fixture.projectId))));
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

async function serverApply(batch: readonly Op[]): Promise<void> {
  const result = await applyOps(db, asCompanyId(companyA.companyId), batch.map((op): Op => ({ ...op })), { now, origin: 'server' });
  expect(result.rejected).toEqual([]);
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await removeFixture();
  await serverApply(log);
}, 60_000);

afterAll(async () => {
  await removeFixture();
  await sql.end();
});

// ===================================================================================================

describe('e25r-R1-API-001 a v14 second visit issued twice keeps "like with like": no history note line, the same tables', () => {
  let first: string[][][] = [];

  it('the R-1 state as the server holds it: the oil not typed, the ambient at 25 °C, A\'s readings, A\'s plate on the row', async () => {
    const snapshot = localSnapshot();
    const block = snapshot.blocks.find((row) => row.id === transformer.id)!;
    expect(block.sheet.nameplate[OIL]).toBeUndefined();
    expect(readingPuts.length).toBeGreaterThan(3);
    const stored = await storedEquipment();
    expect(stored.last_results).toMatchObject({ relatorio_id: previous.relatorio_id, prior: null });
    expect(Object.hasOwn(stored.last_results!, 'plate_measured')).toBe(false);
    expect(stored.last_nameplate).toMatchObject({ relatorio_id: previous.relatorio_id, revision_number: previous.revision_number });
  });

  it(
    'revision 1: no note line under the transformer\'s tables; the equipment\'s last_results.prior carries plate_measured, on the server and in the obra\'s stream',
    async () => {
      const revision = await issue(1);
      const parts = transformerParts(await docxOf(revision), localSnapshot());
      first = tablesOf(parts);
      expect(hasPreviousColumn(first)).toBe(true);
      expect(notesOf(parts)).toEqual([]);
      const stored = await storedEquipment();
      expect(stored.last_results).toMatchObject({ relatorio_id: fixture.relatorioId, revision_number: 1, prior: { relatorio_id: previous.relatorio_id, plate_measured: [OIL] } });
      expect(stored.last_nameplate?.relatorio_id).toBe(fixture.relatorioId);
      const pulled = (await pulledLastResults()).at(-1);
      expect(pulled).toMatchObject({ revision_number: 1, prior: { plate_measured: [OIL] } });
    },
    200_000,
  );

  it(
    'revision 2, nothing edited on the transformer (R-1): still no note line, and the transformer\'s tables print as in revision 1; the prior keeps its field',
    async () => {
      expect(first.length, 'the tables of revision 1').toBeGreaterThan(0);
      await editActivity('Manutenção preventiva sintética, segunda emissão');
      const revision = await issue(2);
      const parts = transformerParts(await docxOf(revision), localSnapshot());
      expect(notesOf(parts)).toEqual([]);
      expect(tablesOf(parts)).toEqual(first);
      const stored = await storedEquipment();
      expect(stored.last_results).toMatchObject({ relatorio_id: fixture.relatorioId, revision_number: 2, prior: { relatorio_id: previous.relatorio_id, plate_measured: [OIL] } });
    },
    200_000,
  );

  it(
    'e25r-R1-API-002 the contrast (matrix row 8): A without the field on top and the plate of another visit on the row print the note line, as v13 compares',
    async () => {
      const contrast = [generatePut('last_results', previous), generatePut('last_nameplate', plateOf({ relatorio_id: ELSEWHERE, revision_number: 1 }))];
      extraOps.push(...contrast);
      await serverApply(contrast);
      await editActivity('Manutenção preventiva sintética, terceira emissão');
      const revision = await issue(3);
      const parts = transformerParts(await docxOf(revision), localSnapshot());
      const notes = notesOf(parts);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.join('\n')).toContain('queda de mais de 50 %');
    },
    200_000,
  );

  it('e25r-R1-API-003 contract 49: a version-48 pull answers 426 contract_outdated on the company, relatório and project streams; a current pull is answered; a version-48 push is applied', async () => {
    // Batch e25c (Story 25.5) moved the contract to 50: 48 stays refused, the current version is answered.
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(49);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(49);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${fixture.relatorioId}?since=0`, `/api/sync/projects/${fixture.projectId}?since=0`]) {
      const old = await authed(path, { headers: { [CONTRACT_VERSION_HEADER]: '48' } });
      expect(old.status, path).toBe(426);
      expect(errorResponseSchema.parse(await old.json()).code).toBe('contract_outdated');
      expect((await authed(path, { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) } })).status, path).toBe(200);
    }
    // An outdated device keeps pushing (AD-13): only its pull is refused.
    const op = relatorioPut(sheetObservationsPath(transformer.id), 'Observação sintética de um aparelho na versão 48.', localSnapshot().blocks.find((row) => row.id === transformer.id)!.sheet.observations?.op_id ?? null);
    extraOps.push(op);
    const res = await authed('/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json', [CONTRACT_VERSION_HEADER]: '48' }, body: JSON.stringify({ ops: [op] }) });
    expect(res.status, await res.clone().text()).toBe(200);
    const answer = syncPushResponseSchema.parse(await res.json());
    expect(answer.rejected).toEqual([]);
    expect(answer.applied.map((one) => one.op_id)).toEqual([op.op_id]);
  });
});
