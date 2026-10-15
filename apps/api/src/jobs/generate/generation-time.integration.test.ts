import { createHash } from 'node:crypto';
import {
  BASE_EQUIPMENT_BLOCK_TYPES,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  generationJobRowSchema,
  newEquipmentBlock,
  objectKey,
  toIso,
  type GenerationResult,
  type Op,
} from '@app/domain';
import { BLOCK_CHAVE_ID, BLOCK_TRANSFORMADOR_ID, CABINE_ID } from '@app/domain/fixtures/porto-seguro/small';
import { and, eq, inArray } from 'drizzle-orm';
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
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_PROJECT_ID, SMALL_FIXTURE_RELATORIO_ID, TEST_PARECER } from '../../db/test-fixtures.ts';
import { serviceLog } from '../../../../../scripts/preflight.ts';
import { newId } from '../../ids.ts';
import { createS3, putObject } from '../../storage/s3.ts';
import { applyOps } from '../../sync/apply.ts';

/*
 * Story 14.10 part 4 (2026-10-15): the generation time of the production shape. Production
 * took 88 s to preview and 64 s to generate a relatório of 76 sheets of which 2 held values.
 * This seeds that shape on the small Porto Seguro fixture (its local keeps the filled chave
 * and disjuntor, its transformer removed, and one photo on the chave; 74 blank sheets of the
 * eight types follow in two more locals, a painel and 18 colunas), runs a preview and then
 * an issue through the api (its worker, its LibreOffice), and asserts each job's total
 * (`result.duration_ms`) under `TARGET_TOTAL_MS` and each stage it timed under `TARGET_MS`.
 * The stages are read from the job's `generate timing` log line in the api container, through
 * the engine socket the tools container mounts (`scripts/preflight.ts` `serviceLog`, GET
 * only), matched by the job id; with no socket the per-stage part is skipped with a one-line
 * note and the totals still assert. The stage times stay out of every synced row.
 */

/**
 * The ceilings, from the measurement written in `spec-14-10-carry-over-2-a.md` › Design
 * Notes (part 4 target): the slowest local time of each stage on the co15a stack after the
 * pass-1 watermark skip (three preview and issue runs), times 4 for a gate that runs this
 * beside `lint` and `static` (and, on this host, beside another lane's gate), with a 2 s
 * floor for the stages measured in milliseconds. A stage the job did not run (a third TOC
 * pass, the watermark of an issue) is not asserted.
 */
const CONVERT_MS = 30_000; // slowest 7.3 s (the preview's pass 2, its watermark on 86 pages)
const DOCX_MS = 5_000; // slowest 1.1 s
const OUTLINE_MS = 3_000; // slowest 0.65 s
const FLOOR_MS = 2_000; // freeze, layout, file rows, logo and cover, photos, certificates, watermark, upload: at most 0.23 s each
const TARGET_MS: Record<string, number> = {
  freeze: FLOOR_MS,
  layout: FLOOR_MS,
  file_rows: FLOOR_MS,
  logo_cover: FLOOR_MS,
  photos: FLOOR_MS,
  certificates: FLOOR_MS,
  watermark: FLOOR_MS,
  upload: FLOOR_MS,
  docx_1: DOCX_MS,
  docx_2: DOCX_MS,
  docx_3: DOCX_MS,
  convert_1: CONVERT_MS,
  convert_2: CONVERT_MS,
  convert_3: CONVERT_MS,
  outline_1: OUTLINE_MS,
  outline_2: OUTLINE_MS,
  outline_3: OUTLINE_MS,
};
/** The slowest total, 12.6 s (a preview), times 4. */
const TARGET_TOTAL_MS = 50_000;

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;
const PROJECT_ID = SMALL_FIXTURE_PROJECT_ID;
const PHOTO_ID = newId();
const extraOpIds: string[] = [];
const extraEntityIds: string[] = [PHOTO_ID];

/** The fixture's two filled sheets (chave, disjuntor) plus these blank ones: 76 live sheets. */
const BLANK_SHEETS = 74;

function op(input: Pick<Op, 'kind' | 'scope' | 'path' | 'value'>): Op {
  const id = newId();
  extraOpIds.push(id);
  return {
    op_id: id,
    kind: input.kind,
    scope: input.scope,
    company_id: companyA.companyId,
    project_id: input.scope === 'project' ? PROJECT_ID : null,
    relatorio_id: input.scope === 'relatorio' ? RELATORIO_ID : null,
    path: input.path,
    value: input.value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
    device_id: 'tablet-int-14-10',
    client_ts: toIso(now()),
  };
}

const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });

/** A local (root `cabine`) of the production shape: SE and environment filled, flag off. */
function local(id: string, name: string, orderKey: string) {
  return {
    id,
    relatorio_id: RELATORIO_ID,
    parent_id: null,
    kind: 'cabine',
    name,
    order_key: orderKey,
    removed_at: null,
    se: { type: 'ALVENARIA - CONVENCIONAL', primary_kv: measured('13.8', 'kV'), secondary_kv: measured('380/220', 'V'), installed_kva: measured('1500', 'kVA') },
    env: { altitude_m: measured('<1000', 'm'), temperature_c: measured('22', '°C'), humidity_pct: measured('60', '%') },
    agrupar_por_tipo: false,
  };
}

const under = (id: string, kind: 'painel' | 'coluna', name: string, parent: string, orderKey: string) => ({ id, relatorio_id: RELATORIO_ID, parent_id: parent, kind, name, order_key: orderKey, removed_at: null });

/** The shape's ops past the fixture: two locals, a painel, 18 colunas, 74 blank sheets, the transformer removed, the photo. */
async function productionShapeOps(): Promise<Op[]> {
  const out: Op[] = [];
  const location = (row: { id: string }) => {
    extraEntityIds.push(row.id);
    out.push(op({ kind: 'create', scope: 'relatorio', path: `location/${row.id}`, value: row }));
  };
  const painelId = newId();
  location(under(painelId, 'painel', 'Painel de média tensão', CABINE_ID, 'b0'));
  const localB = newId();
  const localC = newId();
  location(local(localB, 'Cabine de transformação', 'b1'));
  location(local(localC, 'Subestação de distribuição', 'b2'));
  // 18 colunas: 6 under the painel of the fixture's local, 6 under each other local.
  const colunas: string[] = [];
  for (const [parent, base] of [
    [painelId, 0],
    [localB, 6],
    [localC, 12],
  ] as const) {
    for (let n = 1; n <= 6; n++) {
      const id = newId();
      colunas.push(id);
      location(under(id, 'coluna', `Coluna ${base + n}`, parent, `a${n}`));
    }
  }
  for (let n = 0; n < BLANK_SHEETS; n++) {
    const type = BASE_EQUIPMENT_BLOCK_TYPES[n % BASE_EQUIPMENT_BLOCK_TYPES.length]!;
    const { block, equipment } = newEquipmentBlock({
      blockId: newId(),
      equipmentId: newId(),
      relatorioId: RELATORIO_ID,
      projectId: PROJECT_ID,
      locationId: colunas[n % colunas.length]!,
      type,
      tag: `EQ-${String(n + 1).padStart(3, '0')}`,
      // The fixture's relatório is on seed v1; its sheets follow it.
      seedVersion: 'v1',
      orderKey: `b${String(n).padStart(3, '0')}`,
    });
    extraEntityIds.push(block.id, equipment.id);
    out.push(op({ kind: 'create', scope: 'project', path: `equipment/${equipment.id}`, value: equipment }));
    out.push(op({ kind: 'create', scope: 'relatorio', path: `block/${block.id}`, value: block }));
  }
  // The fixture fills three sheets; production had two.
  out.push(op({ kind: 'put', scope: 'relatorio', path: `block/${BLOCK_TRANSFORMADOR_ID}/removed_at`, value: toIso(now()) }));

  const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 60, g: 110, b: 150 } } }).jpeg({ quality: 80 }).toBuffer();
  await putObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'photo', PHOTO_ID, 'print', RELATORIO_ID), photo, 'image/jpeg');
  out.push(
    op({
      kind: 'create',
      scope: 'relatorio',
      path: `file/${PHOTO_ID}`,
      value: {
        id: PHOTO_ID,
        company_id: companyA.companyId,
        relatorio_id: RELATORIO_ID,
        kind: 'photo',
        sha256: createHash('sha256').update(photo).digest('hex'),
        mime: 'image/jpeg',
        size: photo.byteLength,
        uploaded_at: toIso(now()),
        removed_at: null,
        variants: {
          thumb: objectKey(companyA.companyId, 'photo', PHOTO_ID, 'thumb', RELATORIO_ID),
          print: objectKey(companyA.companyId, 'photo', PHOTO_ID, 'print', RELATORIO_ID),
        },
        captured_at: '2026-10-10T13:05:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: BLOCK_CHAVE_ID,
        item_key: null,
        caption: 'Chave seccionadora',
        reading_kind: null,
        reading_target: null,
        reading_status: 'none',
      },
    }),
  );
  return out;
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

interface JobRun {
  jobId: string;
  result: GenerationResult;
}

/** Starts a job through its route and waits for its row to end; its id and result. */
async function runThroughApi(cookie: string, route: 'preview' | 'generate'): Promise<JobRun> {
  const res = await call(`/api/relatorios/${RELATORIO_ID}/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
  });
  expect(res.status, await res.clone().text()).toBe(202);
  const { job_id: jobId } = (await res.json()) as { job_id: string };
  const deadline = Date.now() + 280_000;
  for (;;) {
    const [record] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'generation_job'), eq(entities.id, jobId)));
    const job = record === undefined ? null : generationJobRowSchema.parse(record.row);
    if (job?.status === 'failed') throw new Error(`the ${route} job failed: ${job.error}`);
    if (job?.status === 'done' && job.result !== null) return { jobId, result: job.result };
    if (Date.now() > deadline) throw new Error(`the ${route} job did not end in time`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** The `stages_ms` of the job's `generate timing` line in the api's log since `sinceUnix`; null when no engine socket is reachable. */
async function stagesOf(jobId: string, sinceUnix: number): Promise<Record<string, number> | null> {
  const project = process.env.COMPOSE_PROJECT_NAME ?? '';
  if (project === '') return null;
  const text = await serviceLog(process.env.ENGINE_SOCKET ?? '/var/run/engine.sock', project, 'api', sinceUnix);
  if (text === null) return null;
  for (const line of text.split('\n')) {
    if (!line.includes('"generate timing"') || !line.includes(jobId)) continue;
    const parsed = JSON.parse(line.slice(line.indexOf('{'))) as { job_id?: string; stages_ms?: Record<string, number> };
    if (parsed.job_id === jobId && parsed.stages_ms !== undefined) return parsed.stages_ms;
  }
  throw new Error(`no "generate timing" line for job ${jobId} in the api log`);
}

/** One line per job, for the PR body and the measurement in the spec. */
function report(label: string, result: GenerationResult, stages: Record<string, number> | null): void {
  const parts = Object.entries(stages ?? {})
    .map(([stage, ms]) => `${stage}=${ms}`)
    .join(' ');
  console.log(`[generation-time] ${label}: total=${result.duration_ms} pages=${result.pages} passes=${result.toc_passes} ${parts}`);
}

function assertStages(stages: Record<string, number>, required: readonly string[]): void {
  for (const stage of required) expect(stages[stage], stage).toBeTypeOf('number');
  for (const [stage, ms] of Object.entries(stages)) {
    // The commit is logged but not targeted: it writes the result the totals are read from.
    if (stage === 'commit') continue;
    const target = TARGET_MS[stage];
    expect(target, `stage ${stage} has a target`).toBeTypeOf('number');
    expect(ms, `stage ${stage}: ${ms} ms against its ${target} ms target`).toBeLessThanOrEqual(target!);
  }
}

const EVERY_JOB = ['freeze', 'layout', 'file_rows', 'photos', 'certificates', 'docx_1', 'convert_1', 'outline_1', 'docx_2', 'convert_2', 'outline_2', 'upload'];

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { parecer: TEST_PARECER });
  const result = await applyOps(db, companyId, await productionShapeOps(), { now, origin: 'server' });
  expect(result.rejected).toEqual([]);
}, 120_000);

afterAll(async () => {
  if (extraOpIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, extraOpIds));
  await db.delete(entities).where(and(eq(entities.company_id, companyId), inArray(entities.id, extraEntityIds)));
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('14.10-INT generation time of the production shape (76 sheets, 2 filled, one photo)', () => {
  it(
    'a preview and then an issue each time every stage and the total under the target',
    async () => {
      const cookie = await signIn();
      const since = Math.floor(Date.now() / 1000) - 5;
      const preview = await runThroughApi(cookie, 'preview');
      const issue = await runThroughApi(cookie, 'generate');
      // Always: each job's total under its target.
      for (const run of [preview, issue]) {
        expect(run.result.duration_ms, `total: ${run.result.duration_ms} ms against ${TARGET_TOTAL_MS} ms`).toBeLessThanOrEqual(TARGET_TOTAL_MS);
      }
      const previewStages = await stagesOf(preview.jobId, since);
      const issueStages = await stagesOf(issue.jobId, since);
      report('preview', preview.result, previewStages);
      report('generate', issue.result, issueStages);
      if (previewStages === null || issueStages === null) {
        console.log('[generation-time] no container engine socket: the per-stage targets are skipped, the totals asserted');
        return;
      }
      assertStages(previewStages, [...EVERY_JOB, 'watermark']);
      assertStages(issueStages, EVERY_JOB);
    },
    600_000,
  );
});
