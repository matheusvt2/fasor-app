import {
  CONTRACT_VERSION_HEADER,
  duplicateSeededType,
  equipmentTypePath,
  errorResponseSchema,
  FAMILIES,
  FAMILY_PERMISSION_NEEDS,
  generateResponseSchema,
  newEquipmentTypeRow,
  PERMISSION_KEYS,
  PERMISSION_ROUTES,
  permissionForRoute,
  registryPath,
  relatorioRemovedAtPath,
  relatorioSetupPath,
  rolePath,
  roleFieldPath,
  SEED_VERSION,
  sheetObservationsPath,
  standardTemplate,
  SYSTEM_ROLE_ROW_IDS,
  templateFieldPath,
  templatePath,
  userRolePath,
  userStatusPath,
  type Op,
  type PermissionKey,
  type SystemRoleId,
  type UserStatus,
} from '@app/domain';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { roleOp } from '../db/roles.ts';
import { entities } from '../db/schema.ts';
import { seedUser, TEST_SEED } from '../db/seed.ts';
import { dropCompany } from '../db/test-cleanup.ts';
import { TEST_PARECER } from '../db/test-fixtures.ts';
import { newId } from '../ids.ts';
import { applyServerBatch } from './apply.ts';
import { apiUrl, routeHarness, type Company } from './rules.test-support.ts';

/**
 * Story 26.4 (AD-29): the server refuses what the role does not allow, against the compose api
 * with real sessions of users of one throwaway company, one per seeded role:
 * - the one-batch scenario (an Engenheiro de Campo's reading applied, a template and a registry
 *   edit refused `op_forbidden`, each alone), a client write of the role families refused
 *   `op_server_only`, the tenant refusal unchanged, 426 for a version-54 pull;
 * - 26.4-API-001: for each key, a role lacking only that key is refused one action of it, and a
 *   role holding it is not;
 * - 26.4-API-002: the routes (Gestor generate 403 and no job, Responsável Técnico generates and
 *   issues, Consulta downloads the issued PDF and is refused a reading);
 * - 26.4-API-003, last: a paused or removed user with a valid cookie gets 401, nothing applied,
 *   and cannot sign in.
 */

const h = routeHarness('tablet-roles-server');
const config = loadConfig();
const auth = createAuth({ db: h.db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const companyId = newId();

type Person = 'admin' | Exclude<SystemRoleId, 'admin'> | 'matriz' | 'pausa';
const people = {} as Record<Person, Company>;

async function seedPerson(person: Person, name: string, role: SystemRoleId): Promise<void> {
  const email = `${person}-${companyId}@teste.local`;
  const result = await seedUser(h.db, auth, { companyId, companyName: 'Empresa dos papéis', email, password: TEST_SEED.password, name, council: 'crea', registrationNumber: 'SP 26', role });
  people[person] = { companyId, email, userId: result.userId } as unknown as Company;
}

/** One server batch of the role families (`system:admin`), as the Admin routes will write them. */
async function serverWrite(writes: { kind: Op['kind']; path: string; value: unknown }[]): Promise<void> {
  await applyServerBatch(h.db, asCompanyId(companyId), writes.map((write) => roleOp(asCompanyId(companyId), write)), { now });
}

let relatorio = { relatorioId: '', blockId: '' };

beforeAll(async () => {
  await h.setup();
  await seedPerson('admin', 'Ana Admin', 'admin');
  await seedPerson('engenheiro_de_campo', 'Carla Campos', 'engenheiro_de_campo');
  await seedPerson('gestor_do_projeto', 'Gustavo Gomes', 'gestor_do_projeto');
  await seedPerson('responsavel_tecnico', 'Renata Rocha', 'responsavel_tecnico');
  await seedPerson('consulta', 'Otávio Osório', 'consulta');
  await seedPerson('matriz', 'Mateus Matriz', 'admin');
  await seedPerson('pausa', 'Paula Pausa', 'admin');
  const seeded = await h.seedRelatorio(people.admin);
  relatorio = { relatorioId: seeded.relatorioId, blockId: seeded.blocks[0]!.id };
}, 120_000);

afterAll(async () => {
  await dropCompany(h.db, companyId);
  await h.cleanup();
});

/** A sheet reading of the seeded relatório: the sheet's observations. */
const reading = (person: Person, text: string): Op =>
  h.clientOp(people[person], { kind: 'put', path: sheetObservationsPath(relatorio.blockId), relatorio_id: relatorio.relatorioId, value: text });

const codeOf = async (res: Response) => errorResponseSchema.parse(await res.json()).code;

describe('26.4 the push asks the role for the key of each op', () => {
  it('an Engenheiro de Campo pushes a reading, a template edit and a registry edit in one push: the reading applies, the two others are refused op_forbidden, each alone', async () => {
    const sheet = reading('engenheiro_de_campo', 'Leitura do campo');
    const template = h.clientOp(people.engenheiro_de_campo, { kind: 'put', scope: 'company', path: templateFieldPath(newId(), 'name'), value: 'Outro nome' });
    const registry = h.clientOp(people.engenheiro_de_campo, { kind: 'put', scope: 'company', path: `registry/client/${newId()}/name`, value: 'Outro cliente' });
    const result = await h.push(people.engenheiro_de_campo, [sheet, template, registry]);
    expect(result.applied.map((a) => a.op_id)).toEqual([sheet.op_id]);
    expect(result.rejected).toEqual([
      { op_id: template.op_id, code: 'op_forbidden' },
      { op_id: registry.op_id, code: 'op_forbidden' },
    ]);
    expect(await h.logged(template.op_id)).toBe(false);
    expect(await h.logged(registry.op_id)).toBe(false);
  });

  it('a client write of role/*, user/{id}/role_id or user/{id}/status is op_server_only, the Admin\'s included', async () => {
    const admin = people.admin;
    const company = { kind: 'put' as const, scope: 'company' as const };
    const customId = newId();
    const batch = [
      h.clientOp(admin, { ...company, kind: 'create', path: rolePath(customId), value: { id: customId, name: 'Papel', permissions: [] } }),
      h.clientOp(admin, { ...company, path: roleFieldPath(SYSTEM_ROLE_ROW_IDS.consulta, 'permissions'), value: ['relatorio.view'] }),
      h.clientOp(admin, { ...company, path: userRolePath(people.consulta.userId), value: SYSTEM_ROLE_ROW_IDS.admin }),
      h.clientOp(admin, { ...company, path: userStatusPath(people.consulta.userId), value: 'paused' }),
      h.clientOp(admin, { ...company, path: `user/${admin.userId}/role_id`, value: SYSTEM_ROLE_ROW_IDS.admin }),
    ];
    const result = await h.push(admin, batch);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual(batch.map((op) => ({ op_id: op.op_id, code: 'op_server_only' })));
  });

  it('an Admin of this company acting on company B: the tenant refusals of today are unchanged', async () => {
    const foreign = h.clientOp(people.admin, { kind: 'put', scope: 'company', path: `project/${newId()}/name`, value: 'Obra de B' });
    const result = await h.push(people.admin, [{ ...foreign, company_id: TEST_SEED.companies[1].companyId }]);
    expect(result.rejected).toEqual([{ op_id: foreign.op_id, code: 'op_tenant_mismatch' }]);
    const read = await h.authed(people.admin, `/api/sync/relatorios/${newId()}?since=0`);
    expect([200, 404]).toContain(read.status);
  });

  it('a version-54 bundle pulling from this server gets 426 contract_outdated', async () => {
    const res = await h.authed(people.admin, '/api/sync/company?since=0', { headers: { [CONTRACT_VERSION_HEADER]: '54' } });
    expect(res.status).toBe(426);
    expect(await codeOf(res)).toBe('contract_outdated');
  });
});

describe('26.4-API-001 each key, a role lacking only it and a role holding it', () => {
  const ALL: readonly PermissionKey[] = PERMISSION_KEYS;
  const holderId = newId();
  const lackingIds = new Map<PermissionKey, string>(PERMISSION_KEYS.map((key) => [key, newId()]));

  beforeAll(async () => {
    await serverWrite([
      { kind: 'create', path: rolePath(holderId), value: { id: holderId, name: 'Todas as chaves', permissions: [...ALL] } },
      ...PERMISSION_KEYS.map((key) => ({ kind: 'create' as const, path: rolePath(lackingIds.get(key)!), value: { id: lackingIds.get(key)!, name: `Sem ${key}`, permissions: ALL.filter((k) => k !== key) } })),
    ]);
  });

  async function asRole(roleId: string): Promise<void> {
    await serverWrite([{ kind: 'put', path: userRolePath(people.matriz.userId), value: roleId }]);
  }

  /** One action of the key: 'refused' when the server refused it for the role, 'accepted' when it passed the permission. */
  type Outcome = 'refused' | 'accepted';
  const pushed = async (op: Op): Promise<Outcome> => {
    const result = await h.push(people.matriz, [op]);
    if (result.rejected.some((r) => r.code === 'op_forbidden')) return 'refused';
    expect(result.applied.map((a) => a.op_id), JSON.stringify(result.rejected)).toEqual([op.op_id]);
    return 'accepted';
  };
  const routed = async (path: string, init: RequestInit = {}): Promise<Outcome> => {
    const res = await h.authed(people.matriz, path, init);
    if (res.status === 403) {
      expect(await codeOf(res)).toBe('forbidden');
      return 'refused';
    }
    return 'accepted';
  };
  const matriz = () => people.matriz;

  const ACTIONS: Partial<Record<PermissionKey, () => Promise<Outcome>>> = {
    'relatorio.view': () => routed(`/api/files/${newId()}/print`),
    'relatorio.create': () => {
      const id = newId();
      return pushed(h.clientOp(matriz(), { kind: 'create', scope: 'company', path: `project/${id}`, value: { id, client_id: null, name: 'Obra da matriz', site: null, removed_at: null } }));
    },
    'relatorio.delete': () => pushed(h.clientOp(matriz(), { kind: 'put', path: relatorioRemovedAtPath(), relatorio_id: relatorio.relatorioId, value: null })),
    'relatorio.fill': () => pushed(reading('matriz', 'Leitura da matriz')),
    'relatorio.issue': () => routed(`/api/relatorios/${relatorio.relatorioId}/generate`, { method: 'POST', body: JSON.stringify({}) }),
    'export.download': () => routed(`/api/revisions/${newId()}/pdf`),
    'template.edit': () => {
      const id = newId();
      return pushed(h.clientOp(matriz(), { kind: 'create', scope: 'company', path: templatePath(id), value: standardTemplate({ id }) as never }));
    },
    'equipment_type.edit': () => {
      const row = newEquipmentTypeRow(newId(), duplicateSeededType(SEED_VERSION, 'chave_seccionadora'));
      return pushed(h.clientOp(matriz(), { kind: 'create', scope: 'company', path: equipmentTypePath(row.id), value: row }));
    },
    'registry.edit': () => {
      const id = newId();
      return pushed(h.clientOp(matriz(), { kind: 'create', scope: 'company', path: registryPath('client', id), value: { id, kind: 'client', name: `Cliente ${id}`, cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null } }));
    },
  };

  for (const key of PERMISSION_KEYS) {
    if (ACTIONS[key] === undefined) continue;
    it(`${key}: refused for the role lacking only it, accepted for the role holding it`, async () => {
      await asRole(lackingIds.get(key)!);
      expect(await ACTIONS[key]!()).toBe('refused');
      await asRole(holderId);
      expect(await ACTIONS[key]!()).toBe('accepted');
    }, 60_000);
  }

  it('suggestion.review, users.manage and roles.manage open no client op and no route yet: no client action reaches them', async () => {
    const keyed = (key: PermissionKey) =>
      FAMILIES.filter((def) => def.serverOnly !== true && FAMILY_PERMISSION_NEEDS[def.family] === key).length + PERMISSION_ROUTES.filter((route) => permissionForRoute(route) === key).length;
    expect(keyed('suggestion.review')).toBe(0);
    expect(keyed('users.manage')).toBe(0);
    expect(keyed('roles.manage')).toBe(0);
    // A role holding users.manage still cannot write a role through the push (the Admin routes will, Story 26.8).
    await asRole(holderId);
    const op = h.clientOp(matriz(), { kind: 'put', scope: 'company', path: userRolePath(people.consulta.userId), value: SYSTEM_ROLE_ROW_IDS.admin });
    expect((await h.push(matriz(), [op])).rejected).toEqual([{ op_id: op.op_id, code: 'op_server_only' }]);
  });

  it('a user whose role row the company does not hold holds no key (fail closed)', async () => {
    await asRole(newId());
    expect(await ACTIONS['relatorio.fill']!()).toBe('refused');
    expect(await ACTIONS['relatorio.view']!()).toBe('refused');
    // Open to every active user: the pull and the account read.
    expect((await h.authed(people.matriz, '/api/sync/company?since=0')).status).toBe(200);
    expect((await h.authed(people.matriz, '/api/account')).status).toBe(200);
  });
});

describe('26.4-API-002 the routes', () => {
  const jobsOf = async () =>
    (await h.db.select({ id: entities.id }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, relatorio.relatorioId)))).length;

  it('a Gestor do Projeto calls generate: 403 forbidden and no job is queued; his move to Emitido is refused op_forbidden', async () => {
    const before = await jobsOf();
    const res = await h.authed(people.gestor_do_projeto, `/api/relatorios/${relatorio.relatorioId}/generate`, { method: 'POST', body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }) });
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('forbidden');
    expect(await jobsOf()).toBe(before);
    const preview = await h.authed(people.gestor_do_projeto, `/api/relatorios/${relatorio.relatorioId}/preview`, { method: 'POST', body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }) });
    expect(preview.status).toBe(403);
    const status = h.statusOp(people.gestor_do_projeto, relatorio.relatorioId, 'emitido', null);
    expect((await h.push(people.gestor_do_projeto, [status])).rejected).toEqual([{ op_id: status.op_id, code: 'op_forbidden' }]);
  });

  it(
    'a Responsável Técnico generates and issues as every user does today; a Consulta user downloads the issued PDF and his reading is refused',
    async () => {
      const parecer = h.clientOp(people.responsavel_tecnico, { kind: 'put', path: relatorioSetupPath('parecer'), relatorio_id: relatorio.relatorioId, value: TEST_PARECER });
      expect((await h.push(people.responsavel_tecnico, [parecer])).rejected).toEqual([]);
      const res = await h.authed(people.responsavel_tecnico, `/api/relatorios/${relatorio.relatorioId}/generate`, { method: 'POST', body: JSON.stringify({ last_op_id: parecer.op_id, file_ids_expected: [] }) });
      expect(res.status, await res.clone().text()).toBe(202);
      expect(generateResponseSchema.parse(await res.json()).outcome).toBe('queued');

      const deadline = Date.now() + 170_000;
      let revisionId: string | null = null;
      while (revisionId === null) {
        const pulled = await h.authed(people.responsavel_tecnico, `/api/sync/relatorios/${relatorio.relatorioId}?since=0`);
        const page = (await pulled.json()) as { ops: Op[] };
        const failed = page.ops.find((op) => op.path.startsWith('generation_job/') && op.path.endsWith('/status') && op.value === 'failed');
        if (failed !== undefined) throw new Error(`the generate job failed: ${JSON.stringify(page.ops.filter((op) => op.path.endsWith('/error')).map((op) => op.value))}`);
        const revision = page.ops.find((op) => op.kind === 'create' && op.path.startsWith('revision/'));
        if (revision !== undefined) revisionId = (revision.value as { id: string }).id;
        else if (Date.now() > deadline) throw new Error('no revision within the deadline');
        else await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      const download = await h.authed(people.consulta, `/api/revisions/${revisionId}/pdf`);
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toContain('pdf');
      expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(1000);
      const docx = await h.authed(people.consulta, `/api/revisions/${revisionId}/docx`);
      expect(docx.status).toBe(200);
      await docx.arrayBuffer();
      // The Engenheiro de Campo does not hold export.download.
      expect((await h.authed(people.engenheiro_de_campo, `/api/revisions/${revisionId}/pdf`)).status).toBe(403);

      const sheet = reading('consulta', 'Leitura da consulta');
      expect((await h.push(people.consulta, [sheet])).rejected).toEqual([{ op_id: sheet.op_id, code: 'op_forbidden' }]);
    },
    200_000,
  );

  it('an upload needs relatorio.fill and a file read relatorio.view', async () => {
    const upload = await h.authed(people.consulta, `/api/files/${newId()}`, { method: 'PUT', body: 'x', headers: { 'content-type': 'image/jpeg' } });
    expect(upload.status).toBe(403);
    expect(await codeOf(upload)).toBe('forbidden');
    const read = await h.authed(people.consulta, `/api/files/${newId()}/print`);
    expect(read.status).toBe(404);
  });
});

describe('26.4-API-003 a user who is not active', () => {
  const call = (path: string, init: RequestInit & { cookie?: string } = {}) =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: apiUrl, [CONTRACT_VERSION_HEADER]: '55', ...(init.cookie === undefined ? {} : { cookie: init.cookie }), ...(init.headers as Record<string, string> | undefined) },
    });
  const signIn = (email: string) => call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password: TEST_SEED.password }) });

  for (const status of ['paused', 'removed'] as const satisfies readonly UserStatus[]) {
    it(`a ${status} user with a valid cookie pushes: 401 user_inactive and nothing applied; every read is 401; sign-in is refused`, async () => {
      await serverWrite([{ kind: 'put', path: userStatusPath(people.pausa.userId), value: 'active' }]);
      const first = await signIn(people.pausa.email);
      expect(first.status, await first.clone().text()).toBe(200);
      const cookie = first.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
      expect((await call('/api/account', { cookie })).status).toBe(200);

      await serverWrite([{ kind: 'put', path: userStatusPath(people.pausa.userId), value: status }]);
      const op = reading('pausa', `Leitura de ${status}`);
      h.track([op]);
      const push = await call('/api/sync/ops', { method: 'POST', cookie, body: JSON.stringify({ ops: [op] }) });
      expect(push.status).toBe(401);
      expect(await codeOf(push)).toBe('user_inactive');
      expect(await h.logged(op.op_id)).toBe(false);
      for (const path of ['/api/sync/company?since=0', '/api/account', `/api/sync/relatorios/${relatorio.relatorioId}?since=0`]) {
        const res = await call(path, { cookie });
        expect(res.status, path).toBe(401);
        expect(await codeOf(res), path).toBe('user_inactive');
      }
      const again = await signIn(people.pausa.email);
      expect(again.status).toBe(401);
      expect(((await again.json()) as { code?: string }).code).toBe('user_inactive');
    });
  }

  it('reactivated, the same cookie works again and the push applies', async () => {
    const first = await signIn(people.consulta.email);
    const cookie = first.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    await serverWrite([{ kind: 'put', path: userStatusPath(people.consulta.userId), value: 'paused' }]);
    expect((await call('/api/account', { cookie })).status).toBe(401);
    await serverWrite([{ kind: 'put', path: userStatusPath(people.consulta.userId), value: 'active' }]);
    expect((await call('/api/account', { cookie })).status).toBe(200);
  });
});
