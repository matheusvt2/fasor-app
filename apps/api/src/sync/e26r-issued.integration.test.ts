import { blockFieldPath, errorResponseSchema, fileFieldPath, locationFieldPath, pointFieldPath, relatorioSetupPath, sheetObservationsPath, type Op, type SystemRoleId } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { seedUser, TEST_SEED } from '../db/seed.ts';
import { dropCompany } from '../db/test-cleanup.ts';
import { newId } from '../ids.ts';
import { routeHarness, type Company, type SeededRelatorio } from './rules.test-support.ts';

/*
 * e26r (2026-11-22, Matheus "sim nos dois", AD-29), through the compose api with real sessions of
 * one throwaway company, one user per seeded role:
 * - e26r-API-004: leaving Emitido needs `relatorio.issue`. On a relatório the server holds as
 *   Emitido, every op family that reopens it (`reopenNeed`: the status move, a sheet value, a
 *   photo, a photo's field, a point's field, the parecer, a local's and a block's field) is refused
 *   `op_forbidden` for the Engenheiro de Campo and the Gestor do Projeto, never logged, and the
 *   relatório stays Emitido; the Responsável Técnico reopens it with an edit, and the Admin moves it
 *   back. The verdict reads the server's status, not the op's claim.
 * - e26r-API-005: downloading an issued DOCX or PDF needs `export.download` and generating needs
 *   `relatorio.issue`, for each of the five roles.
 */

const h = routeHarness('tablet-e26r-issued');
const config = loadConfig();
const auth = createAuth({ db: h.db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const companyId = newId();
const ROLES: readonly SystemRoleId[] = ['admin', 'engenheiro_de_campo', 'gestor_do_projeto', 'responsavel_tecnico', 'consulta'];
const people = {} as Record<SystemRoleId, Company>;

beforeAll(async () => {
  await h.setup();
  for (const role of ROLES) {
    const email = `${role}-${companyId}@teste.local`;
    const result = await seedUser(h.db, auth, { companyId, companyName: 'Empresa da emissão', email, password: TEST_SEED.password, name: `Pessoa ${role}`, council: 'crea', registrationNumber: 'SP 26', role });
    people[role] = { companyId, email, userId: result.userId } as unknown as Company;
  }
}, 120_000);

afterAll(async () => {
  await dropCompany(h.db, companyId);
  await h.cleanup();
});

const statusOf = async (relatorioId: string) => (await h.rowOf<{ status: string }>(people.admin, 'relatorio', relatorioId))?.status;
const latest = async (relatorioId: string) => (await h.latestStatusOp(people.admin, relatorioId))?.op_id ?? null;

/** A relatório of the Admin moved to Emitido through the paths the web takes: Em campo, a generate, Em revisão, revision 1, sent. */
async function issued(): Promise<SeededRelatorio> {
  const seeded = await h.seedRelatorio(people.admin);
  const field = h.statusOp(people.admin, seeded.relatorioId, 'em_campo', null);
  expect((await h.push(people.admin, [field])).rejected).toEqual([]);
  await h.queueIssueJob(people.admin, seeded.relatorioId);
  const review = h.statusOp(people.admin, seeded.relatorioId, 'em_revisao', field.op_id);
  expect((await h.push(people.admin, [review])).rejected).toEqual([]);
  await h.cutRevision(people.admin, seeded.relatorioId);
  const sent = h.statusOp(people.admin, seeded.relatorioId, 'emitido', review.op_id);
  expect((await h.push(people.admin, [sent])).rejected).toEqual([]);
  expect(await statusOf(seeded.relatorioId)).toBe('emitido');
  return seeded;
}

/** One op of every family that would reopen the relatório, as `person` writes it. */
async function reopening(person: Company, seeded: SeededRelatorio): Promise<Array<[string, Op]>> {
  const relatorio_id = seeded.relatorioId;
  const block = seeded.blocks[0]!;
  const photo = newId();
  return [
    ['relatorio/status', h.statusOp(person, relatorio_id, 'em_revisao', await latest(relatorio_id))],
    ['sheet', h.clientOp(person, { kind: 'put', path: sheetObservationsPath(block.id), relatorio_id, value: 'Leitura depois da emissão' })],
    [
      'file',
      h.clientOp(person, {
        kind: 'create',
        path: `file/${photo}`,
        relatorio_id,
        value: {
          id: photo,
          company_id: companyId,
          relatorio_id,
          kind: 'photo',
          sha256: 'ab'.repeat(32),
          mime: 'image/jpeg',
          size: 10,
          uploaded_at: null,
          variants: null,
          removed_at: null,
          captured_at: new Date().toISOString(),
          tz_offset: -180,
          coords: null,
          local_seq: 1,
          block_id: null,
          item_key: null,
          caption: null,
          reading_kind: null,
          reading_target: null,
          reading_status: 'none',
          people_in_photo: false,
        },
      }),
    ],
    ['file/field', h.clientOp(person, { kind: 'put', path: fileFieldPath(newId(), 'caption'), relatorio_id, value: 'Legenda' })],
    ['point/field', h.clientOp(person, { kind: 'put', path: pointFieldPath(newId(), 'text'), relatorio_id, value: 'Ponto depois da emissão' })],
    ['relatorio/setup', h.clientOp(person, { kind: 'put', path: relatorioSetupPath('parecer'), relatorio_id, value: 'Outro parecer' })],
    ['location/field', h.clientOp(person, { kind: 'put', path: locationFieldPath(seeded.locationId, 'name'), relatorio_id, value: 'Outra cabine' })],
    ['block/field', h.clientOp(person, { kind: 'put', path: blockFieldPath(block.id, 'not_tested'), relatorio_id, value: null })],
  ];
}

describe('e26r-API-004 leaving Emitido needs relatorio.issue', () => {
  it('the Engenheiro de Campo and the Gestor do Projeto: every family that would reopen is refused op_forbidden, alone, never logged; the relatório stays Emitido', async () => {
    const seeded = await issued();
    for (const role of ['engenheiro_de_campo', 'gestor_do_projeto'] as const) {
      for (const [family, op] of await reopening(people[role], seeded)) {
        const result = await h.push(people[role], [op]);
        expect(result.rejected, `${role} ${family}`).toEqual([{ op_id: op.op_id, code: 'op_forbidden' }]);
        expect(await h.logged(op.op_id), `${role} ${family}`).toBe(false);
      }
      // One push of the web's own shape: the edit and the reopen it appends, in one batch.
      const batchId = newId();
      const edit = h.clientOp(people[role], { kind: 'put', path: sheetObservationsPath(seeded.blocks[0]!.id), relatorio_id: seeded.relatorioId, value: 'Com o reabrir', batch_id: batchId });
      const reopen = h.statusOp(people[role], seeded.relatorioId, 'em_revisao', await latest(seeded.relatorioId), { batch_id: batchId });
      const result = await h.push(people[role], [edit, reopen]);
      expect(result.applied).toEqual([]);
      expect(result.rejected.map((row) => row.code)).toEqual(['op_forbidden', 'op_forbidden']);
      expect(await statusOf(seeded.relatorioId)).toBe('emitido');
    }
  });

  it('the Responsável Técnico reopens it with an edit; the Admin moves it back; on Em revisão the Engenheiro de Campo fills again', async () => {
    const seeded = await issued();
    const batchId = newId();
    const edit = h.clientOp(people.responsavel_tecnico, { kind: 'put', path: sheetObservationsPath(seeded.blocks[0]!.id), relatorio_id: seeded.relatorioId, value: 'Revisão do RT', batch_id: batchId });
    const reopen = h.statusOp(people.responsavel_tecnico, seeded.relatorioId, 'em_revisao', await latest(seeded.relatorioId), { batch_id: batchId });
    expect((await h.push(people.responsavel_tecnico, [edit, reopen])).rejected).toEqual([]);
    expect(await statusOf(seeded.relatorioId)).toBe('em_revisao');
    // Back on Em revisão the field engineer writes as before.
    const reading = h.clientOp(people.engenheiro_de_campo, { kind: 'put', path: sheetObservationsPath(seeded.blocks[0]!.id), relatorio_id: seeded.relatorioId, value: 'Campo na revisão' });
    expect((await h.push(people.engenheiro_de_campo, [reading])).rejected).toEqual([]);

    const again = await issued();
    const back = h.statusOp(people.admin, again.relatorioId, 'em_revisao', await latest(again.relatorioId));
    expect((await h.push(people.admin, [back])).rejected).toEqual([]);
    expect(await statusOf(again.relatorioId)).toBe('em_revisao');
  });

  it('the op\'s claim gains nothing: a status op naming a non-Emitido status it saw is judged by the server\'s Emitido', async () => {
    const seeded = await issued();
    const field = await h.latestStatusOp(people.admin, seeded.relatorioId);
    // A forged "seen": no prev op at all (as if the device had never seen Emitido).
    const forged = h.statusOp(people.engenheiro_de_campo, seeded.relatorioId, 'em_revisao', null);
    expect((await h.push(people.engenheiro_de_campo, [forged])).rejected).toEqual([{ op_id: forged.op_id, code: 'op_forbidden' }]);
    expect(await h.latestStatusOp(people.admin, seeded.relatorioId)).toEqual(field);
    expect(await statusOf(seeded.relatorioId)).toBe('emitido');
  });
});

describe('e26r-API-005 download needs export.download, generate needs relatorio.issue, for each role', () => {
  const codeOf = async (res: Response) => errorResponseSchema.parse(await res.json()).code;

  it('a revision\'s DOCX and PDF: 403 forbidden without the key (Engenheiro de Campo), past the gate with it (404 for an unknown revision)', async () => {
    const unknown = newId();
    for (const role of ROLES) {
      for (const format of ['pdf', 'docx']) {
        const res = await h.authed(people[role], `/api/revisions/${unknown}/${format}`);
        if (role === 'engenheiro_de_campo') {
          expect(res.status, `${role} ${format}`).toBe(403);
          expect(await codeOf(res)).toBe('forbidden');
        } else {
          expect(res.status, `${role} ${format}`).toBe(404);
          await res.arrayBuffer();
        }
      }
    }
  });

  it('generate: 403 forbidden for the Engenheiro de Campo, the Gestor do Projeto and the Consulta; the Admin and the Responsável Técnico pass the gate (404 for an unknown relatório)', async () => {
    const unknown = newId();
    for (const role of ROLES) {
      const res = await h.authed(people[role], `/api/relatorios/${unknown}/generate`, { method: 'POST', body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }) });
      if (role === 'admin' || role === 'responsavel_tecnico') expect(res.status, role).toBe(404);
      else {
        expect(res.status, role).toBe(403);
        expect(await codeOf(res)).toBe('forbidden');
      }
    }
  });
});
