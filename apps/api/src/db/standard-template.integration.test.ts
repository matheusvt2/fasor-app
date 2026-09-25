import { instantiateTemplate, SEED_VERSION, STANDARD_TEMPLATE_NAME, standardTemplate, templateRowSchema, templateTotals } from '@app/domain';
import { and, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { applyOps } from '../sync/apply.ts';
import { pullCompany } from '../sync/pull.ts';
import { createDb } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { entities, ops } from './schema.ts';
import { dropCompany } from './test-cleanup.ts';
import { resetTestCompanyData, seedStandardTemplate, seedTestCompanies, seedUser, TEST_SEED } from './seed.ts';

/**
 * Story 3.2: provisioning seeds the "Cabine primária — padrão" template through the op
 * log. One server `template/{id}` create whose row is exactly the kernel's
 * `standardTemplate`, idempotent per company, and never a row in another company.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

afterAll(async () => {
  await sql.end();
});

async function templates(companyId: string) {
  return db
    .select({ id: entities.id, row: entities.row, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'template')));
}

async function templateOps(companyId: string) {
  return db
    .select({ path: ops.path, kind: ops.kind, actor_id: ops.actor_id, device_id: ops.device_id, batch_id: ops.batch_id })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), like(ops.path, 'template/%')))
    .orderBy(ops.seq);
}

/** Server ops (`system:identity`) from bare drafts, applied as the seed applies its own. */
async function applyServer(companyId: string, drafts: readonly Record<string, unknown>[]) {
  const envelope = {
    scope: 'company',
    company_id: companyId,
    project_id: null,
    relatorio_id: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: 'system:identity',
    device_id: 'server',
  };
  const result = await applyOps(
    db,
    asCompanyId(companyId),
    drafts.map((draft) => ({ ...envelope, op_id: newId(), client_ts: new Date().toISOString(), ...draft })),
    { now: () => new Date(), origin: 'server' },
  );
  expect(result.rejected).toEqual([]);
}

/** A company holding the standard template as seed v1 made it (a database seeded before v2), and one relatório made from it. */
async function companyWithV1Template(label: string) {
  const companyId = newId();
  await seedUser(db, auth, {
    companyId,
    companyName: `Empresa ${label}`,
    email: `template-${label}-${companyId}@teste.local`,
    password: TEST_SEED.password,
    name: `Tita ${label}`,
    council: 'crea',
    registrationNumber: 'SP 9',
  });
  const templateId = newId();
  const v1 = standardTemplate({ id: templateId, seedVersion: 'v1' });
  await applyServer(companyId, [{ kind: 'create', path: `template/${templateId}`, value: v1 }]);
  const projectId = newId();
  const { relatorioId, drafts } = instantiateTemplate(
    v1,
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: 'system:identity', companyId },
  );
  const relatorioCreate = drafts.find((draft) => draft.path === `relatorio/${relatorioId}`)!;
  await applyServer(companyId, [
    { kind: 'create', path: `project/${projectId}`, value: { id: projectId, client_id: null, name: 'Obra', site: 'Obra', removed_at: null } },
    { ...relatorioCreate },
  ]);
  return { companyId, templateId, relatorioId };
}

async function relatorioSeedVersion(companyId: string, relatorioId: string) {
  const [row] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
  return (row?.row as { seed_version?: string } | undefined)?.seed_version;
}

async function templateCreates(companyId: string) {
  return db
    .select({ path: ops.path, kind: ops.kind, actor_id: ops.actor_id, device_id: ops.device_id })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), like(ops.path, 'template/%')));
}

describe('seedStandardTemplate', () => {
  it('seeds one template equal to standardTemplate, and a second run adds nothing', async () => {
    const companyId = newId();
    try {
      await seedUser(db, auth, {
        companyId,
        companyName: 'Empresa do Template',
        email: `template-${companyId}@teste.local`,
        password: TEST_SEED.password,
        name: 'Tita Template',
        council: 'crea',
        registrationNumber: 'SP 7',
      });
      const id = await seedStandardTemplate(db, asCompanyId(companyId));
      expect(id).not.toBeNull();
      expect(await seedStandardTemplate(db, asCompanyId(companyId))).toBeNull();

      const rows = await templates(companyId);
      expect(rows).toHaveLength(1);
      const row = templateRowSchema.parse(rows[0]!.row);
      expect(row).toEqual(standardTemplate({ id: id! }));
      expect(row).toMatchObject({ name: STANDARD_TEMPLATE_NAME, seed_version: SEED_VERSION, removed_at: null });
      expect(templateTotals(row)).toMatchObject({ chave_seccionadora: 25, disjuntor_mt: 21 });

      expect(await templateCreates(companyId)).toEqual([
        { path: `template/${id}`, kind: 'create', actor_id: 'system:identity', device_id: 'server' },
      ]);
      // The company stream a device pulls carries it.
      const page = await pullCompany(db, asCompanyId(companyId), 0);
      expect(page.ops.filter((op) => op.path === `template/${id}`)).toHaveLength(1);
    } finally {
      await dropCompany(db, companyId);
    }
  }, 30_000);

  it('seeds again once the only template of that name was removed', async () => {
    const companyId = newId();
    try {
      await seedUser(db, auth, {
        companyId,
        companyName: 'Empresa Removida',
        email: `template-removido-${companyId}@teste.local`,
        password: TEST_SEED.password,
        name: 'Remo Removido',
        council: 'crt',
        registrationNumber: 'SP 8',
      });
      const first = await seedStandardTemplate(db, asCompanyId(companyId));
      const removal = await applyOps(
        db,
        asCompanyId(companyId),
        [
          {
            op_id: newId(),
            kind: 'remove',
            scope: 'company',
            company_id: companyId,
            project_id: null,
            relatorio_id: null,
            prev_op_id: null,
            batch_id: null,
            meta: null,
            actor_id: 'system:identity',
            device_id: 'server',
            client_ts: new Date().toISOString(),
            path: `template/${first}/removed_at`,
            value: null,
          },
        ],
        { now: () => new Date(), origin: 'server' },
      );
      expect(removal.rejected).toEqual([]);
      const second = await seedStandardTemplate(db, asCompanyId(companyId));
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
      expect((await templates(companyId)).filter((t) => t.removed_at === null)).toHaveLength(1);
    } finally {
      await dropCompany(db, companyId);
    }
  }, 30_000);
});

describe('seedStandardTemplate on a database seeded before the current seed version (E12-Q4)', () => {
  it('moves an unedited v1 template to SEED_VERSION in one server batch, version kept at 1; its relatório keeps v1; a second run adds no op', async () => {
    const { companyId, templateId, relatorioId } = await companyWithV1Template('v1');
    try {
      const before = (await templateOps(companyId)).length;
      expect(await seedStandardTemplate(db, asCompanyId(companyId))).toBeNull();

      const rows = (await templates(companyId)).filter((t) => t.removed_at === null);
      expect(rows).toHaveLength(1);
      const row = templateRowSchema.parse(rows[0]!.row);
      expect(row).toEqual(standardTemplate({ id: templateId }));
      expect(row).toMatchObject({ seed_version: SEED_VERSION, version: 1 });

      const added = (await templateOps(companyId)).slice(before);
      expect(added.map((op) => op.path)).toEqual([
        `template/${templateId}/seed_version`,
        `template/${templateId}/blocks`,
        `template/${templateId}/skeleton`,
        `template/${templateId}/version`,
      ]);
      expect(new Set(added.map((op) => op.batch_id)).size).toBe(1);
      expect(added[0]!.batch_id).not.toBeNull();
      expect(added.every((op) => op.kind === 'put' && op.actor_id === 'system:identity' && op.device_id === 'server')).toBe(true);

      // AR-20: the relatório made from v1 keeps it.
      expect(await relatorioSeedVersion(companyId, relatorioId)).toBe('v1');

      const settled = (await templateOps(companyId)).length;
      expect(await seedStandardTemplate(db, asCompanyId(companyId))).toBeNull();
      expect(await templateOps(companyId)).toHaveLength(settled);
    } finally {
      await dropCompany(db, companyId);
    }
  }, 60_000);

  it('leaves an edited v1 template (version above 1) at v1, with no op', async () => {
    const { companyId, templateId } = await companyWithV1Template('editado');
    try {
      const v1 = standardTemplate({ id: templateId, seedVersion: 'v1' });
      // A content edit (D-4) bumps the version to 2.
      await applyServer(companyId, [{ kind: 'put', path: `template/${templateId}/blocks`, value: v1.blocks.slice(0, -1) }]);
      const before = (await templateOps(companyId)).length;
      expect(await seedStandardTemplate(db, asCompanyId(companyId))).toBeNull();
      expect(await templateOps(companyId)).toHaveLength(before);
      const row = templateRowSchema.parse((await templates(companyId))[0]!.row);
      expect(row).toMatchObject({ seed_version: 'v1', version: 2 });
    } finally {
      await dropCompany(db, companyId);
    }
  }, 60_000);

  it('refuses the seed_version path from a device: it is a server-only family', async () => {
    const { companyId, templateId } = await companyWithV1Template('cliente');
    const actorId = newId();
    try {
      const result = await applyOps(
        db,
        asCompanyId(companyId),
        [
          {
            op_id: newId(),
            kind: 'put',
            scope: 'company',
            company_id: companyId,
            project_id: null,
            relatorio_id: null,
            prev_op_id: null,
            batch_id: null,
            meta: null,
            actor_id: actorId,
            device_id: 'tablet-x',
            client_ts: new Date().toISOString(),
            path: `template/${templateId}/seed_version`,
            value: SEED_VERSION,
          },
        ],
        { now: () => new Date(), origin: 'client', actorId },
      );
      expect(result.rejected.map((r) => r.code)).toEqual(['op_server_only']);
    } finally {
      await dropCompany(db, companyId);
    }
  }, 60_000);
});

describe('seedTestCompanies and the standard template', () => {
  it('gives Empresa A the template once and leaves Empresa B without one, with no cross-company row', async () => {
    const [a, b] = TEST_SEED.companies;
    // A Playwright run leaves Empresa B holding the template its empty state created.
    await resetTestCompanyData(db, [b.companyId]);
    await seedTestCompanies(db, auth);
    await seedTestCompanies(db, auth);

    const aRows = (await templates(a.companyId)).filter((t) => t.removed_at === null);
    expect(aRows.map((t) => (t.row as { name: string }).name)).toEqual([STANDARD_TEMPLATE_NAME]);
    expect(await templates(b.companyId)).toEqual([]);
    expect(await templateCreates(b.companyId)).toEqual([]);

    // The template row lives only under Empresa A's company id, and B's stream never shows it.
    const everywhere = await db
      .select({ company_id: entities.company_id })
      .from(entities)
      .where(and(eq(entities.entity, 'template'), eq(entities.id, aRows[0]!.id)));
    expect(everywhere).toEqual([{ company_id: a.companyId }]);
    const bPage = await pullCompany(db, asCompanyId(b.companyId), 0);
    expect(bPage.ops.filter((op) => op.path.startsWith('template/'))).toEqual([]);
  }, 30_000);
});
