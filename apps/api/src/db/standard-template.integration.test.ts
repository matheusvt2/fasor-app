import { STANDARD_TEMPLATE_NAME, standardTemplate, templateRowSchema, templateTotals } from '@app/domain';
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
      expect(row).toMatchObject({ name: STANDARD_TEMPLATE_NAME, seed_version: 'v1', removed_at: null });
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
