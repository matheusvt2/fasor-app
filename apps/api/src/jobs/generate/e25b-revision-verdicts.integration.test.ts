import {
  blockFieldPath,
  buildSnapshot,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  generateResponseSchema,
  generationJobRowSchema,
  makeOp,
  parecerVerdictLabel,
  previewResponseSchema,
  printedVerdicts,
  replay,
  revisionRowSchema,
  sheetConclusionPath,
  toIso,
  type GenerationJobRow,
  type JsonValue,
  type Op,
  type PrintedVerdicts,
  type RelatorioSnapshot,
  type RevisionRow,
} from '@app/domain';
import { layoutLockFixture, type LayoutLockFixture } from '@app/domain/fixtures/layout-lock';
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
import { extractStructure } from './docx-structure.test-support.ts';

/*
 * 25.4-API-001 and 25.4-INT (Story 25.4, contract 48): the revision keeps the verdicts its document
 * printed. The layout-lock relatórios of v13 and v14 (`@app/domain/fixtures/layout-lock`, synthetic) are
 * applied onto Empresa A and issued through the api's route and its real worker (LibreOffice included):
 * the revision create pulled from the relatório stream carries `printed_parecer` and
 * `printed_conclusions`, equal to what the downloaded DOCX prints (each CONCLUSÃO table's boxes in
 * sheet order, section 10's verdict) and to the kernel's `printedVerdicts` over the same ops; the stored
 * parecer and every block's stored pair are what they were before. On v14 the parecer is stored Apto and
 * the breaker stored Aprovado · Sem restrições while its reading is out: the revision records Não apto
 * and Reprovado alone (the v14 breaker has no restriction). With the section-10 block removed the next
 * revision records `printed_parecer: null`; a preview writes no revision; a version-47 pull answers 426
 * on every stream; company B is refused A's revision files and A's relatório stream as before.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const JOB_TIMEOUT = 170_000;
const DEVICE = 'tablet-e25b-verdicts';
const actor = { companyId: companyA.companyId, actorId: companyA.userId, deviceId: DEVICE };
const v13 = layoutLockFixture('v13', actor);
const v14 = layoutLockFixture('v14', actor);
const fixtures: readonly LayoutLockFixture[] = [v13, v14];

type Company = (typeof TEST_SEED.companies)[number];

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string> | undefined) },
  });
}

const cookies = new Map<string, string>();

async function signIn(email: string): Promise<string> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function authed(company: Company, path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    let cookie = cookies.get(company.email);
    if (cookie === undefined || fresh) {
      cookie = await signIn(company.email);
      cookies.set(company.email, cookie);
    }
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } });
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

// --- the fixtures and the ops this file writes over them ---------------------------------------------

async function removeFixtures(): Promise<void> {
  const relatorios = fixtures.map((f) => f.relatorioId);
  const projects = fixtures.map((f) => f.projectId);
  const opIds = fixtures.flatMap((f) => f.log.map((op) => op.op_id));
  const companyRows = fixtures.flatMap((f) => f.companyEntityIds);
  await db.transaction(async (tx) => {
    await tx.delete(ops).where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, opIds), inArray(ops.relatorio_id, relatorios), inArray(ops.project_id, projects))));
    await tx
      .delete(entities)
      .where(
        and(
          eq(entities.company_id, companyA.companyId),
          or(inArray(entities.relatorio_id, relatorios), inArray(entities.project_id, projects), inArray(entities.id, [...projects, ...companyRows])),
        ),
      );
  });
}

/** Every op written beside a fixture's log (the technician's choices, the section removed), by relatório. */
const extraOps = new Map<string, Op[]>();

/** A relatório-scoped put on `fixture`'s relatório, as a device of Empresa A writes it, applied at once. */
async function put(fixture: LayoutLockFixture, path: string, value: JsonValue): Promise<void> {
  const op = makeOp(
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
    { newId, now: now() },
  );
  const result = await applyOps(db, asCompanyId(companyA.companyId), [op], { now, origin: 'server' });
  expect(result.rejected).toEqual([]);
  extraOps.set(fixture.relatorioId, [...(extraOps.get(fixture.relatorioId) ?? []), op]);
}

/** The relatório as the kernel reads the same ops on this side: the fixture's log and the puts above. */
function localSnapshot(fixture: LayoutLockFixture): RelatorioSnapshot {
  return buildSnapshot(replay([...fixture.log, ...(extraOps.get(fixture.relatorioId) ?? [])]), fixture.relatorioId);
}

// --- the stored choices, the job, the revision -------------------------------------------------------

interface StoredChoices {
  parecer: unknown;
  pairs: Record<string, [unknown, unknown]>;
}

/** The relatório's stored parecer and every block's stored pair, as the server's rows hold them. */
async function storedChoices(fixture: LayoutLockFixture): Promise<StoredChoices> {
  const [relatorio] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, fixture.relatorioId)));
  const blocks = await db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, fixture.relatorioId)));
  const pairs: Record<string, [unknown, unknown]> = {};
  for (const block of blocks) {
    const conclusion = (block.row as { sheet?: { conclusion?: { result?: { value: unknown }; restriction?: { value: unknown } } } }).sheet?.conclusion;
    pairs[block.id] = [conclusion?.result?.value ?? null, conclusion?.restriction?.value ?? null];
  }
  expect(blocks.length).toBeGreaterThan(0);
  return { parecer: (relatorio!.row as { setup: { parecer: unknown } }).setup.parecer, pairs };
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

async function revisionRows(fixture: LayoutLockFixture): Promise<RevisionRow[]> {
  const rows = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, fixture.relatorioId)));
  return rows.map((record) => revisionRowSchema.parse(record.row));
}

/** Every op of the relatório stream, page by page. */
async function pullRelatorio(fixture: LayoutLockFixture): Promise<Op[]> {
  const all: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await authed(companyA, `/api/sync/relatorios/${fixture.relatorioId}?since=${since}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = (await res.json()) as { ops: Op[]; seq: number };
    all.push(...page.ops);
    const last = page.ops.at(-1)?.seq;
    if (last === undefined || last >= page.seq) return all;
    since = last;
  }
}

/** The revision create of `number` as the relatório stream carries it: its op value, unparsed. */
async function pulledRevision(fixture: LayoutLockFixture, number: number): Promise<Record<string, unknown>> {
  const created = (await pullRelatorio(fixture)).filter((op) => op.kind === 'create' && op.path.startsWith('revision/') && (op.value as { number?: unknown }).number === number);
  expect(created).toHaveLength(1);
  return created[0]!.value as Record<string, unknown>;
}

/** "Gerar relatório" through the route; waits for the revision `number` the job commits. */
async function issue(fixture: LayoutLockFixture, number: number): Promise<RevisionRow> {
  const res = await authed(companyA, `/api/relatorios/${fixture.relatorioId}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
  });
  expect(res.status, await res.clone().text()).toBe(202);
  const answer = generateResponseSchema.parse(await res.json());
  expect(answer).toMatchObject({ outcome: 'queued', revision_number: number });
  const job = await waitForJob((answer as { job_id: string }).job_id);
  expect(job.status, job.error ?? '').toBe('done');
  const revision = (await revisionRows(fixture)).find((row) => row.number === number);
  expect(revision, `revision ${number}`).toBeDefined();
  return revision!;
}

async function docxOf(revision: RevisionRow): Promise<ReturnType<typeof extractStructure>> {
  const res = await authed(companyA, `/api/revisions/${revision.id}/docx`);
  expect(res.status).toBe(200);
  return extractStructure(Buffer.from(await res.arrayBuffer()));
}

const VERDICT_TITLES = ['Apto', 'Apto com restrições', 'Não apto', '[Parecer]'];

/** Section 10's Parecer box (a one-cell table whose first line is a verdict word): that word, or null when none prints. */
function printedParecerTitle(structure: ReturnType<typeof extractStructure>): string | null {
  const boxes = structure.tables.filter((table) => table.length === 1 && table[0]!.length === 1 && VERDICT_TITLES.includes(table[0]![0]!.split('\n')[0]!));
  expect(boxes.length).toBeLessThanOrEqual(1);
  return boxes[0]?.[0]![0]!.split('\n')[0] ?? null;
}

/** Every CONCLUSÃO table's boxes row, in document order. */
const conclusionBoxes = (structure: ReturnType<typeof extractStructure>): string[][] => structure.tables.filter((rows) => rows[0]?.[0] === 'CONCLUSÃO').map((rows) => rows[1]!);

const BOXES = (pair: { result: string | null; restriction: string | null }): string[] => [
  'APROVADO',
  pair.result === 'aprovado' ? 'X' : '',
  'REPROVADO',
  pair.result === 'reprovado' ? 'X' : '',
  'SEM RESTRIÇÕES',
  pair.restriction === 'sem_restricoes' ? 'X' : '',
  'COM RESTRIÇÕES (VER OBSERVAÇÕES)',
  pair.restriction === 'com_restricoes' ? 'X' : '',
];

/** The two keys of a pulled revision create, as `PrintedVerdicts`. */
function recordedOf(value: Record<string, unknown>): PrintedVerdicts {
  expect(value).toHaveProperty('printed_parecer');
  expect(value).toHaveProperty('printed_conclusions');
  return { printed_parecer: value.printed_parecer as PrintedVerdicts['printed_parecer'], printed_conclusions: value.printed_conclusions as PrintedVerdicts['printed_conclusions'] };
}

/** The DOCX prints exactly what the revision recorded: each CONCLUSÃO table in sheet order, and section 10's verdict. */
function expectDocxPrints(structure: ReturnType<typeof extractStructure>, recorded: PrintedVerdicts, order: readonly string[]): void {
  expect(Object.keys(recorded.printed_conclusions).sort()).toEqual([...order].sort());
  expect(conclusionBoxes(structure)).toEqual(order.map((blockId) => BOXES(recorded.printed_conclusions[blockId]!)));
  expect(printedParecerTitle(structure)).toBe(recorded.printed_parecer === null ? null : parecerVerdictLabel(recorded.printed_parecer));
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await removeFixtures();
  for (const fixture of fixtures) {
    const result = await applyOps(db, asCompanyId(companyA.companyId), fixture.log.map((op): Op => ({ ...op })), { now, origin: 'server' });
    expect(result.rejected, fixture.version).toEqual([]);
  }
}, 60_000);

afterAll(async () => {
  await removeFixtures();
  await sql.end();
});

describe('25.4-API-001 25.4-INT the revision keeps the verdicts its document printed', () => {
  let v14First: RevisionRow;
  let v14FirstPulled: Record<string, unknown>;

  it(
    'a preview of the v13 relatório stores no revision (its job done, no revision row, no revision create in the stream)',
    async () => {
      const res = await authed(companyA, `/api/relatorios/${v13.relatorioId}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
      });
      expect(res.status, await res.clone().text()).toBe(202);
      const job = await waitForJob(previewResponseSchema.parse(await res.json()).job_id);
      expect(job.status, job.error ?? '').toBe('done');
      expect(await revisionRows(v13)).toEqual([]);
      expect((await pullRelatorio(v13)).some((op) => op.path.startsWith('revision/'))).toBe(false);
    },
    200_000,
  );

  it(
    'v13: revision 1 records the parecer and each ficha\'s pair as its DOCX prints them, the kernel\'s printedVerdicts over the same ops; the stored choices unchanged',
    async () => {
      const before = await storedChoices(v13);
      const revision = await issue(v13, 1);
      const pulled = await pulledRevision(v13, 1);
      const recorded = recordedOf(pulled);
      const expected = printedVerdicts(localSnapshot(v13));
      expect(recorded).toEqual(expected);
      expect(revision.printed_parecer).toBe('nao_apto');
      expect(revision.printed_conclusions).toEqual(expected.printed_conclusions);
      expectDocxPrints(await docxOf(revision), recorded, Object.keys(expected.printed_conclusions));
      expect(await storedChoices(v13)).toEqual(before);
    },
    200_000,
  );

  it(
    'v14: the parecer stored Apto and the breaker stored Aprovado · Sem restrições with its reading out: revision 1 records nao_apto and the breaker {reprovado, null} as the DOCX prints them; setup.parecer and every stored pair unchanged',
    async () => {
      const snapshot = localSnapshot(v14);
      const disjuntor = snapshot.blocks.find((block) => block.block_type === 'disjuntor_mt' && block.removed_at === null)!;
      await put(v14, 'relatorio/setup/parecer', { verdict: 'apto', text: null, text_status: null, text_basis: null });
      await put(v14, sheetConclusionPath(disjuntor.id, 'result'), 'aprovado');
      await put(v14, sheetConclusionPath(disjuntor.id, 'restriction'), 'sem_restricoes');
      const before = await storedChoices(v14);
      expect((before.parecer as { verdict: string }).verdict).toBe('apto');
      expect(before.pairs[disjuntor.id]).toEqual(['aprovado', 'sem_restricoes']);

      v14First = await issue(v14, 1);
      v14FirstPulled = await pulledRevision(v14, 1);
      const recorded = recordedOf(v14FirstPulled);
      const expected = printedVerdicts(localSnapshot(v14));
      expect(recorded).toEqual(expected);
      expect(recorded.printed_parecer).toBe('nao_apto');
      expect(recorded.printed_conclusions[disjuntor.id]).toEqual({ result: 'reprovado', restriction: null });
      const structure = await docxOf(v14First);
      expectDocxPrints(structure, recorded, Object.keys(expected.printed_conclusions));
      expect(printedParecerTitle(structure)).toBe('Não apto');
      expect(await storedChoices(v14)).toEqual(before);
    },
    200_000,
  );

  it(
    'v14 with the section-10 block removed: revision 2 records printed_parecer null (the key present) and the pairs its DOCX prints; revision 1 unchanged',
    async () => {
      expect(v14First, 'the v14 revision 1 of the test before').toBeDefined();
      const section10 = localSnapshot(v14).blocks.find((block) => block.block_type === 'section_10' && block.removed_at === null)!;
      await put(v14, blockFieldPath(section10.id, 'removed_at'), toIso(now()));
      const before = await storedChoices(v14);
      const revision = await issue(v14, 2);
      const pulled = await pulledRevision(v14, 2);
      const recorded = recordedOf(pulled);
      expect(pulled.printed_parecer).toBeNull();
      expect(revision.printed_parecer).toBeNull();
      expect(Object.keys(recorded.printed_conclusions).length).toBeGreaterThan(0);
      const structure = await docxOf(revision);
      expectDocxPrints(structure, recorded, Object.keys(printedVerdicts(localSnapshot(v14)).printed_conclusions));
      expect(printedParecerTitle(structure)).toBeNull();
      expect(await storedChoices(v14)).toEqual(before);
      // Revision 1 is as it was written.
      expect(await pulledRevision(v14, 1)).toEqual(v14FirstPulled);
      expect((await revisionRows(v14)).find((row) => row.number === 1)).toEqual(v14First);
    },
    200_000,
  );

  it('25.4-API-002 a version-47 pull answers 426 contract_outdated on the company, relatório and project streams; the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBe(48);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${v14.relatorioId}?since=0`, `/api/sync/projects/${v14.projectId}?since=0`]) {
      const old = await authed(companyA, path, { headers: { [CONTRACT_VERSION_HEADER]: '47' } });
      expect(old.status, path).toBe(426);
      expect(errorResponseSchema.parse(await old.json()).code).toBe('contract_outdated');
      expect((await authed(companyA, path)).status, path).toBe(200);
    }
  });

  it('company B is refused A\'s revision files and A\'s relatório stream, as every revision read is', async () => {
    expect(v14First, 'the v14 revision 1 of the test before').toBeDefined();
    for (const format of ['docx', 'pdf']) {
      const other = await authed(companyB, `/api/revisions/${v14First.id}/${format}`);
      expect(other.status, format).toBe(404);
      expect(errorResponseSchema.parse(await other.json()).code).toBe('not_found');
    }
    const stream = await authed(companyB, `/api/sync/relatorios/${v14.relatorioId}?since=0`);
    expect(stream.status).toBe(404);
    expect(errorResponseSchema.parse(await stream.json()).code).toBe('relatorio_not_found');
    // A's own reads still answer.
    expect((await authed(companyA, `/api/revisions/${v14First.id}/pdf`)).status).toBe(200);
  });
});
