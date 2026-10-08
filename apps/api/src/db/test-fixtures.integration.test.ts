import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createDb } from './client.ts';
import { company, entities, ops, verification } from './schema.ts';
import { dropCompany } from './test-cleanup.ts';
import { sampleRelatorioIds, seedSampleRelatorio } from './sample-relatorio.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID } from './test-fixtures.ts';

/*
 * Review 2026-09-30, E-4 and E-11: the test-support removals never reach a company they do
 * not own, and never leave half a removal behind.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const leftovers: string[] = [];

afterAll(async () => {
  for (const id of leftovers) {
    await db.delete(verification).where(eq(verification.companyId, id));
    await db.delete(ops).where(eq(ops.company_id, id));
    await db.delete(entities).where(eq(entities.company_id, id));
    await db.delete(company).where(eq(company.id, id));
  }
  await sql.end();
});

async function counts(companyId: string): Promise<{ ops: number; entities: number }> {
  const [opRows, entityRows] = await Promise.all([
    db.select({ seq: ops.seq }).from(ops).where(eq(ops.company_id, companyId)),
    db.select({ id: entities.id }).from(entities).where(eq(entities.company_id, companyId)),
  ]);
  return { ops: opRows.length, entities: entityRows.length };
}

describe('E-4 removePortoSeguroSmall', () => {
  it('refuses, deleting nothing, when the fixture lives in a company that is not a test company; removes it when that company is named', async () => {
    // A company provisioned with `seed-users.ts --sample-relatorio`: neither TEST_SEED nor an e2e pair.
    const foreign = newId();
    leftovers.push(foreign);
    await seedPortoSeguroSmall(db, foreign);
    const seeded = await counts(foreign);
    expect(seeded.ops).toBe(portoSeguroSmall.log.length);

    await expect(removePortoSeguroSmall(db)).rejects.toThrow(/not a test company/);
    expect(await counts(foreign)).toEqual(seeded);

    await removePortoSeguroSmall(db, { allowCompanyId: foreign });
    expect(await counts(foreign)).toEqual({ ops: 0, entities: 0 });
    const anywhere = await db.select({ id: entities.id }).from(entities).where(eq(entities.id, SMALL_FIXTURE_RELATORIO_ID));
    expect(anywhere).toEqual([]);
  });
});

describe('review F-14 the developer\'s sample relatório', () => {
  it('seeded on a non-test company under derived ids: removePortoSeguroSmall(db) does not throw and the sample\'s rows survive', async () => {
    const developer = newId();
    leftovers.push(developer);
    const relatorioId = await seedSampleRelatorio(db, developer);
    expect(relatorioId).toBe(sampleRelatorioIds(developer).relatorioId);
    expect(relatorioId).not.toBe(SMALL_FIXTURE_RELATORIO_ID);
    const seeded = await counts(developer);
    expect(seeded.ops).toBe(portoSeguroSmall.log.length);

    await expect(removePortoSeguroSmall(db)).resolves.toBeUndefined();
    expect(await counts(developer)).toEqual(seeded);
    const [relatorio] = await db.select({ company_id: entities.company_id }).from(entities).where(eq(entities.id, relatorioId));
    expect(relatorio?.company_id).toBe(developer);


    // A second company gets its own copy; a re-seed replaces only the company's own.
    const other = newId();
    leftovers.push(other);
    const otherId = await seedSampleRelatorio(db, other);
    expect(otherId).not.toBe(relatorioId);
    await seedSampleRelatorio(db, developer);
    expect(await counts(developer)).toEqual(seeded);
    expect((await counts(other)).ops).toBe(portoSeguroSmall.log.length);
  });
});

describe('E-11 dropCompany', () => {
  it('removes everything in one transaction: a delete that fails leaves the company whole', async () => {
    const id = newId();
    leftovers.push(id);
    const at = new Date().toISOString();
    await db.insert(company).values({ id, name: 'Empresa E-11' });
    await db.insert(ops).values({ op_id: newId(), company_id: id, scope: 'company', kind: 'put', path: 'probe/e-11', value: 1, actor_id: 'probe', device_id: 'probe', client_ts: at, received_at: at });
    await db.insert(entities).values({ company_id: id, entity: 'probe', id: newId(), row: {} as never, updated_seq: 1 });
    // A row `dropCompany` does not clear still names the company, so its last delete fails.
    await db.insert(verification).values({ id: newId(), companyId: id, identifier: 'probe', value: 'probe', expiresAt: new Date(Date.now() + 60_000) });

    await expect(dropCompany(db, id)).rejects.toThrow();
    expect(await counts(id)).toEqual({ ops: 1, entities: 1 });
    expect(await db.select({ id: company.id }).from(company).where(inArray(company.id, [id]))).toHaveLength(1);
  });
});
