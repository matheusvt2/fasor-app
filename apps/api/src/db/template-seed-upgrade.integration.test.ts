import { emptyTemplate, instantiateTemplate, SEED_VERSION, standardTemplate, templateRowSchema, type TemplateRow } from '@app/domain';
import { and, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import type { LogFields } from '../log.ts';
import { applyOps } from '../sync/apply.ts';
import { createDb } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { entities, ops } from './schema.ts';
import { seedUser, TEST_SEED } from './seed.ts';
import { upgradeTemplateSeeds } from './template-seed-upgrade.ts';
import { dropCompany } from './test-cleanup.ts';

/**
 * Story 14.3, matrix "Templates": the server's data step moves every live template to the
 * current seed version by the server-only `template/{id}/seed_version` path, one batch per
 * template, leaving `version`, `blocks` and `skeleton` and every relatório as they are; a
 * second run writes no op; a row that fails the current version's check is skipped and logged.
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

async function company(label: string): Promise<string> {
  const companyId = newId();
  await seedUser(db, auth, {
    companyId,
    companyName: `Empresa ${label}`,
    email: `seed-upgrade-${label}-${companyId}@teste.local`,
    password: TEST_SEED.password,
    name: `Tita ${label}`,
    council: 'crea',
    registrationNumber: 'SP 9',
  });
  return companyId;
}

/** Server ops (`system:identity`) from bare drafts, applied as the seed applies its own. */
async function applyServer(companyId: string, drafts: readonly Record<string, unknown>[]) {
  const envelope = { scope: 'company', company_id: companyId, project_id: null, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, actor_id: 'system:identity', device_id: 'server' };
  const result = await applyOps(
    db,
    asCompanyId(companyId),
    drafts.map((draft) => ({ ...envelope, op_id: newId(), client_ts: new Date().toISOString(), ...draft })),
    { now: () => new Date(), origin: 'server' },
  );
  expect(result.rejected).toEqual([]);
}

const createTemplate = (companyId: string, row: TemplateRow) => applyServer(companyId, [{ kind: 'create', path: `template/${row.id}`, value: row }]);

async function templateRow(companyId: string, id: string) {
  const [row] = await db
    .select({ row: entities.row, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'template'), eq(entities.id, id)));
  return row!;
}

async function templateOps(companyId: string) {
  return db
    .select({ path: ops.path, kind: ops.kind, value: ops.value, actor_id: ops.actor_id, device_id: ops.device_id, batch_id: ops.batch_id })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), like(ops.path, 'template/%')))
    .orderBy(ops.seq);
}

async function relatorioRow(companyId: string, relatorioId: string) {
  const [row] = await db
    .select({ row: entities.row, updated_seq: entities.updated_seq })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
  return row!;
}

/** What the step logged about the templates of `companyIds`, by level. */
function recorder(companyIds: readonly string[]) {
  const lines: { level: 'info' | 'error'; msg: string; fields: LogFields }[] = [];
  const record = (level: 'info' | 'error') => (msg: string, fields: LogFields = {}) => {
    if (typeof fields.company_id === 'string' && companyIds.includes(fields.company_id)) lines.push({ level, msg, fields });
  };
  return { lines, deps: { info: record('info'), error: record('error') } };
}

describe('upgradeTemplateSeeds (Story 14.3, matrix "Templates")', () => {
  it('moves every live template on v1 to v3 to the current version, seed_version alone; relatórios, removed and current templates stay; a broken row is skipped and logged; a second run writes no op', async () => {
    const companyId = await company('a');
    const otherCompanyId = await company('b');
    try {
      // Seeded and unedited (v1), seeded and edited (v2, version 2), a company's own (v3), an archived one (v3).
      const seeded = standardTemplate({ id: newId(), seedVersion: 'v1' });
      const edited = standardTemplate({ id: newId(), seedVersion: 'v2' });
      const own: TemplateRow = { ...emptyTemplate(newId(), 'v3'), name: 'Subestação do cliente', skeleton: [{ ref: 'local', kind: 'cabine', parent_ref: null, name: 'Cabine primária', agrupar_por_tipo: false }] };
      const archived: TemplateRow = { ...standardTemplate({ id: newId(), seedVersion: 'v3' }), name: 'Arquivado' };
      // Not moved: a removed one (v2), one already current, and one whose stored row fails the row check.
      const removed: TemplateRow = { ...standardTemplate({ id: newId(), seedVersion: 'v2' }), name: 'Removido' };
      const current: TemplateRow = { ...standardTemplate({ id: newId() }), name: 'Atual' };
      const broken: TemplateRow = { ...standardTemplate({ id: newId(), seedVersion: 'v3' }), name: 'Quebrado' };
      for (const row of [seeded, edited, own, archived, removed, current, broken]) await createTemplate(companyId, row);
      await applyServer(companyId, [
        // A content edit (D-4) bumps the version to 2.
        { kind: 'put', path: `template/${edited.id}/blocks`, value: edited.blocks.slice(0, -1) },
        { kind: 'put', path: `template/${archived.id}/archived_at`, value: '2026-09-20T12:00:00.000Z' },
        { kind: 'remove', path: `template/${removed.id}/removed_at`, value: null },
      ]);
      // A stored row no op could have written: a coluna whose parent is not in the skeleton.
      const brokenRow = { ...broken, skeleton: [...broken.skeleton, { ref: 'solta', kind: 'coluna', parent_ref: 'ausente', name: 'Coluna solta' }] };
      await db
        .update(entities)
        .set({ row: brokenRow as never })
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'template'), eq(entities.id, broken.id)));
      // Another company's template moves too.
      const elsewhere: TemplateRow = { ...standardTemplate({ id: newId(), seedVersion: 'v2' }), name: 'De outra empresa' };
      await createTemplate(otherCompanyId, elsewhere);

      // A relatório made from the v3 template before the step.
      const projectId = newId();
      const made = instantiateTemplate(
        archived,
        { id: projectId },
        { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
        { newId, actorId: 'system:identity', companyId },
      );
      await applyServer(companyId, [
        { kind: 'create', path: `project/${projectId}`, value: { id: projectId, client_id: null, name: 'Obra', site: 'Obra', removed_at: null } },
        { ...made.drafts.find((draft) => draft.path === `relatorio/${made.relatorioId}`)! },
      ]);

      const movedIds = [seeded.id, edited.id, own.id, archived.id];
      const before = new Map<string, unknown>();
      for (const id of [...movedIds, removed.id, current.id, broken.id]) before.set(id, (await templateRow(companyId, id)).row);
      const relatorioBefore = await relatorioRow(companyId, made.relatorioId);
      expect(relatorioBefore.row).toMatchObject({ seed_version: 'v3' });
      const opsBefore = await templateOps(companyId);
      const otherOpsBefore = await templateOps(otherCompanyId);

      const first = recorder([companyId, otherCompanyId]);
      // The database may hold other companies' templates from before v4: at least these five move.
      expect(await upgradeTemplateSeeds(db, first.deps)).toBeGreaterThanOrEqual(5);

      for (const id of movedIds) {
        const row = (await templateRow(companyId, id)).row as unknown as TemplateRow;
        // Only `seed_version` moved: `version`, `blocks`, `skeleton` and everything else are what they were.
        expect(row, id).toEqual({ ...(before.get(id) as object), seed_version: SEED_VERSION });
        expect(templateRowSchema.safeParse(row).success, id).toBe(true);
      }
      expect((await templateRow(companyId, seeded.id)).row).toMatchObject({ version: 1 });
      expect((await templateRow(companyId, edited.id)).row).toMatchObject({ version: 2 });
      expect((await templateRow(companyId, archived.id)).row).toMatchObject({ archived_at: '2026-09-20T12:00:00.000Z' });
      expect((await templateRow(otherCompanyId, elsewhere.id)).row).toMatchObject({ seed_version: SEED_VERSION, version: 1 });
      // Left where they were, byte for byte.
      for (const id of [removed.id, current.id, broken.id]) expect((await templateRow(companyId, id)).row, id).toEqual(before.get(id));
      expect((await templateRow(companyId, removed.id)).row).toMatchObject({ seed_version: 'v2' });
      expect((await templateRow(companyId, broken.id)).row).toMatchObject({ seed_version: 'v3' });

      // One server put per moved template, each its own batch, nothing else written.
      const added = (await templateOps(companyId)).slice(opsBefore.length);
      expect(added.map((op) => op.path).sort()).toEqual(movedIds.map((id) => `template/${id}/seed_version`).sort());
      expect(added.every((op) => op.kind === 'put' && op.value === SEED_VERSION && op.actor_id === 'system:identity' && op.device_id === 'server' && op.batch_id !== null)).toBe(true);
      expect(new Set(added.map((op) => op.batch_id)).size).toBe(movedIds.length);
      expect((await templateOps(otherCompanyId)).slice(otherOpsBefore.length).map((op) => op.path)).toEqual([`template/${elsewhere.id}/seed_version`]);

      // No relatório row changes (AR-20): the one made on v3 keeps its row and its seq.
      expect(await relatorioRow(companyId, made.relatorioId)).toEqual(relatorioBefore);

      // The moves and the skip are logged, the skip naming the template and both versions.
      expect(first.lines.filter((line) => line.level === 'info').map((line) => line.fields.template_id).sort()).toEqual([...movedIds, elsewhere.id].sort());
      expect(first.lines.filter((line) => line.level === 'info').every((line) => line.msg === 'template seed upgraded' && line.fields.to === SEED_VERSION)).toBe(true);
      expect(first.lines.filter((line) => line.level === 'error')).toEqual([
        {
          level: 'error',
          msg: 'template seed upgrade skipped: the row does not validate on the current seed version',
          fields: { company_id: companyId, template_id: broken.id, seed_version: 'v3', target: SEED_VERSION },
        },
      ]);

      // A relatório created from a moved template is born on the current version.
      const movedRow = templateRowSchema.parse((await templateRow(companyId, own.id)).row);
      const born = instantiateTemplate(
        movedRow,
        { id: projectId },
        { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
        { newId, actorId: 'system:identity', companyId },
      );
      expect(born.drafts.find((draft) => draft.path === `relatorio/${born.relatorioId}`)!.value).toMatchObject({ seed_version: SEED_VERSION });

      // Idempotent: a second run moves nothing anywhere and writes no op; the broken row is named again.
      const settled = (await templateOps(companyId)).length;
      const second = recorder([companyId, otherCompanyId]);
      expect(await upgradeTemplateSeeds(db, second.deps)).toBe(0);
      expect(await templateOps(companyId)).toHaveLength(settled);
      expect(await templateOps(otherCompanyId)).toHaveLength(otherOpsBefore.length + 1);
      expect(second.lines.map((line) => [line.level, line.fields.template_id])).toEqual([['error', broken.id]]);
    } finally {
      await dropCompany(db, companyId);
      await dropCompany(db, otherCompanyId);
    }
  }, 120_000);

  it('two runs at once move a template once: the row is read again under the company lock', async () => {
    const companyId = await company('c');
    try {
      const template = standardTemplate({ id: newId(), seedVersion: 'v3' });
      await createTemplate(companyId, template);
      const before = (await templateOps(companyId)).length;
      const counts = await Promise.all([1, 2, 3].map(() => upgradeTemplateSeeds(db, recorder([companyId]).deps)));
      expect(counts.reduce((sum, n) => sum + n, 0)).toBe(1);
      const added = (await templateOps(companyId)).slice(before);
      expect(added.map((op) => op.path)).toEqual([`template/${template.id}/seed_version`]);
      expect((await templateRow(companyId, template.id)).row).toEqual({ ...template, seed_version: SEED_VERSION });
    } finally {
      await dropCompany(db, companyId);
    }
  }, 60_000);
});
