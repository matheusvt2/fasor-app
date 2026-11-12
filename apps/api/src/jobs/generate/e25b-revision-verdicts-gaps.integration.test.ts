import {
  buildSnapshot,
  cellAddressesOf,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  findDefinition,
  generateResponseSchema,
  generationJobRowSchema,
  makeOp,
  parecerVerdictLabel,
  printedVerdicts,
  relatorioSetupPath,
  replay,
  revisionRowSchema,
  SERVER_DEVICE_ID,
  sheetTestCellPath,
  toIso,
  type BlockRow,
  type GenerationJobRow,
  type JsonValue,
  type Op,
  type PrintedVerdicts,
  type RelatorioSnapshot,
  type RevisionRow,
} from '@app/domain';
import { layoutLockFixture } from '@app/domain/fixtures/layout-lock';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
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
 * 25.4-API-003 and 25.4-API-004 (fix batch e25r: the test gaps T1 and T3 the wave 1 review found in
 * batch e25b, Story 25.4, contract 48; tests only, no behaviour change). A sibling of
 * `e25b-revision-verdicts.integration.test.ts`, because T1 needs a relatório with no revision yet. The
 * v14 layout-lock relatório (synthetic) is applied onto Empresa A and issued through the api's route
 * and its real worker (LibreOffice included).
 * - T1: a revision create without the two printed keys, as a job before 48 wrote it, applied as the
 *   server writes it and pulled through the relatório stream at the current contract, carries neither
 *   key (nothing defaulted); revision 2, issued through the route, carries both; revision 1 is unchanged.
 * - T3: after that issue, a reading that flips a ficha and a stored parecer are applied; revision 2's
 *   two keys, pulled again, are unchanged and still what its DOCX prints.
 * Every value is invented.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const JOB_TIMEOUT = 170_000;
const DEVICE = 'tablet-e25b-gaps';
const fixture = layoutLockFixture('v14', { companyId: companyA.companyId, actorId: companyA.userId, deviceId: DEVICE });

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

// --- the fixture and the ops this file writes over it ----------------------------------------------

/** Every op written beside the fixture's log, in order. */
const extraOps: Op[] = [];

async function removeFixture(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(ops)
      .where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, [...fixture.log, ...extraOps].map((op) => op.op_id)), eq(ops.relatorio_id, fixture.relatorioId), eq(ops.project_id, fixture.projectId))));
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

/** A relatório-scoped put of Empresa A's device, chained on the op it replaces, applied at once and kept for the local snapshot. */
async function put(path: string, value: JsonValue, prevOpId: string | null = null): Promise<void> {
  const op = makeOp(
    { kind: 'put', scope: 'relatorio', company_id: companyA.companyId, project_id: null, relatorio_id: fixture.relatorioId, path, value, prev_op_id: prevOpId, batch_id: null, meta: null, actor_id: companyA.userId, device_id: DEVICE },
    { newId, now: now() },
  );
  extraOps.push(op);
  await serverApply([op]);
}

/** The relatório as the kernel reads the same ops on this side. */
const localSnapshot = (): RelatorioSnapshot => buildSnapshot(replay([...fixture.log, ...extraOps]), fixture.relatorioId);

// --- the job, the revision -------------------------------------------------------------------------

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

async function revisionRows(): Promise<RevisionRow[]> {
  const rows = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, fixture.relatorioId)));
  return rows.map((record) => revisionRowSchema.parse(record.row));
}

/** The raw stored row of revision `number`, unparsed (a parse could only add nothing, but the bytes are what is checked). */
async function storedRevision(number: number): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, fixture.relatorioId)));
  const found = rows.map((record) => record.row as Record<string, unknown>).filter((row) => row.number === number);
  expect(found).toHaveLength(1);
  return found[0]!;
}

/** Every op of the relatório stream at the current contract, page by page. */
async function pullRelatorio(): Promise<Op[]> {
  const all: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await authed(`/api/sync/relatorios/${fixture.relatorioId}?since=${since}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = (await res.json()) as { ops: Op[]; seq: number };
    all.push(...page.ops);
    const last = page.ops.at(-1)?.seq;
    if (last === undefined || last >= page.seq) return all;
    since = last;
  }
}

/** The revision create of `number` as the relatório stream carries it: its op value, unparsed. */
async function pulledRevision(number: number): Promise<Record<string, unknown>> {
  const created = (await pullRelatorio()).filter((op) => op.kind === 'create' && op.path.startsWith('revision/') && (op.value as { number?: unknown }).number === number);
  expect(created).toHaveLength(1);
  return created[0]!.value as Record<string, unknown>;
}

/** "Gerar relatório" through the route; waits for the revision `number` the job commits. */
async function issue(number: number): Promise<RevisionRow> {
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
  const revision = (await revisionRows()).find((row) => row.number === number);
  expect(revision, `revision ${number}`).toBeDefined();
  return revision!;
}

async function docxOf(revision: RevisionRow): Promise<ReturnType<typeof extractStructure>> {
  const res = await authed(`/api/revisions/${revision.id}/docx`);
  expect(res.status).toBe(200);
  return extractStructure(Buffer.from(await res.arrayBuffer()));
}

// --- what a DOCX prints (as `e25b-revision-verdicts.integration.test.ts` reads it) ------------------

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

/** The DOCX prints exactly what the revision recorded: each CONCLUSÃO table in sheet order (`order`, the layout's), and section 10's verdict. */
function expectDocxPrints(structure: ReturnType<typeof extractStructure>, recorded: PrintedVerdicts, order: readonly string[]): void {
  expect(Object.keys(recorded.printed_conclusions).sort()).toEqual([...order].sort());
  expect(conclusionBoxes(structure)).toEqual(order.map((blockId) => BOXES(recorded.printed_conclusions[blockId]!)));
  expect(printedParecerTitle(structure)).toBe(recorded.printed_parecer === null ? null : parecerVerdictLabel(recorded.printed_parecer));
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await removeFixture();
  await serverApply(fixture.log);
}, 60_000);

afterAll(async () => {
  await removeFixture();
  await sql.end();
});

// ===================================================================================================

describe('25.4-API-003 25.4-API-004 the printed verdicts of a revision: never defaulted, never rewritten', () => {
  let second: RevisionRow;
  let secondPulled: Record<string, unknown>;
  /** The print order of the fichas with a CONCLUSÃO row when revision 2 was issued (the layout's, which the record's keys do not keep). */
  let order: string[] = [];

  it(
    '25.4-API-003 (T1) a revision create written before contract 48 pulls with neither printed key; revision 2 issued through the route carries both; revision 1 is unchanged',
    async () => {
      // Revision 1 as a generate job before Story 25.4 wrote it: no `printed_parecer`, no `printed_conclusions`.
      const [head] = await db.select({ seq: ops.seq }).from(ops).where(eq(ops.company_id, companyA.companyId)).orderBy(desc(ops.seq)).limit(1);
      const revisionId = newId();
      const at = now();
      const old = makeOp(
        {
          kind: 'create',
          scope: 'relatorio',
          company_id: companyA.companyId,
          project_id: null,
          relatorio_id: fixture.relatorioId,
          path: `revision/${revisionId}`,
          value: { id: revisionId, relatorio_id: fixture.relatorioId, number: 1, snapshot_seq: head?.seq ?? 0, created_by: companyA.userId, docx_file_id: newId(), pdf_file_id: newId(), created_at: toIso(at) },
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: 'system:generate',
          device_id: SERVER_DEVICE_ID,
        },
        { newId, now: at },
      );
      extraOps.push(old);
      await serverApply([old]);
      const firstPulled = await pulledRevision(1);
      expect(Object.hasOwn(firstPulled, 'printed_parecer')).toBe(false);
      expect(Object.hasOwn(firstPulled, 'printed_conclusions')).toBe(false);
      const firstStored = await storedRevision(1);
      expect(Object.hasOwn(firstStored, 'printed_parecer')).toBe(false);
      expect(Object.hasOwn(firstStored, 'printed_conclusions')).toBe(false);

      // An edit after revision 1 (the cover's activity), so the route issues revision 2: an unedited relatório answers `unchanged`.
      await put(relatorioSetupPath('atividade'), 'Manutenção preventiva sintética, segunda emissão');
      const expected = printedVerdicts(localSnapshot());
      order = Object.keys(expected.printed_conclusions);
      second = await issue(2);
      secondPulled = await pulledRevision(2);
      const recorded = recordedOf(secondPulled);
      expect(recorded).toEqual(expected);
      expect(second.printed_parecer).toBe(expected.printed_parecer);
      expectDocxPrints(await docxOf(second), recorded, order);
      // Revision 1 is as it was written, on the stream and on the row.
      expect(await pulledRevision(1)).toEqual(firstPulled);
      expect(await storedRevision(1)).toEqual(firstStored);
    },
    200_000,
  );

  it(
    '25.4-API-004 (T3) after the issue, a reading that flips a ficha and a stored parecer are applied: revision 2\'s two keys, pulled again, are unchanged and still what its DOCX prints',
    async () => {
      expect(secondPulled, 'revision 2 of the test before').toBeDefined();
      const recorded = recordedOf(secondPulled);
      const storedBefore = await storedRevision(2);
      // A ficha revision 2 recorded Aprovado (the fixture concludes the TP, the TC and the first incoming cable so): one
      // insulation reading far below any criterion makes it Reprovado.
      const snapshot = localSnapshot();
      const insulationOf = (block: BlockRow) => {
        const definition = findDefinition(block.seed_version, block.block_type);
        return definition === null ? [] : cellAddressesOf(definition, 'isolacao');
      };
      const target = snapshot.blocks.find((block) => block.removed_at === null && recorded.printed_conclusions[block.id]?.result === 'aprovado' && insulationOf(block).length > 0);
      expect(target, 'a ficha recorded Aprovado, with insulation readings').toBeDefined();
      const at = insulationOf(target!)[0]!;
      const standing = target!.sheet.test.isolacao?.cells[String(at.row)]?.[String(at.col)]?.op_id ?? null;
      await put(sheetTestCellPath(target!.id, 'isolacao', at.row, at.col), { raw: '0.01', unit: 'MΩ', state: 'measured' }, standing);
      await put(relatorioSetupPath('parecer'), { verdict: 'apto_com_restricoes', text: null, text_status: null, text_basis: null });
      // What would print now is no longer what revision 2 recorded.
      const now = printedVerdicts(localSnapshot());
      expect(now.printed_conclusions[target!.id]?.result).toBe('reprovado');
      expect(now.printed_conclusions[target!.id]).not.toEqual(recorded.printed_conclusions[target!.id]);
      // The record is as written, on the stream and on the row, and still what revision 2's DOCX prints.
      expect(await pulledRevision(2)).toEqual(secondPulled);
      expect(await storedRevision(2)).toEqual(storedBefore);
      expectDocxPrints(await docxOf(second), recorded, order);
    },
    200_000,
  );
});
