import type { EntityRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';
import { pullRelatorio } from './pull.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * Review 2026-09-30, behaviour pins for two query rewrites, on throwaway companies:
 * A-2, the relatório stream read as two index-ordered streams: every page holds the same
 * ops in the same order with the same head as the `OR` of the two filters gave (the
 * relatório's ops united with its project's project-scope ops, an op in both once);
 * A-22, `toSnapshot` reading only the project's own rows: a sibling relatório of the same
 * project, with rows of its own, changes nothing in the snapshot.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const companies: string[] = [];

afterAll(async () => {
  for (const company of companies) {
    await db.delete(ops).where(eq(ops.company_id, company));
    await db.delete(entities).where(eq(entities.company_id, company));
  }
  await sql.end();
});

describe('A-2 the relatório stream, page by page', () => {
  it('pages the union of the relatório and project streams exactly as the OR did', async () => {
    const company = newId();
    companies.push(company);
    const [relatorio, sibling, project, otherProject] = [newId(), newId(), newId(), newId()];
    await db.insert(entities).values({ company_id: company, entity: 'relatorio', id: relatorio, relatorio_id: relatorio, project_id: project, row: { id: relatorio, project_id: project } as unknown as EntityRow, updated_seq: 1 });
    const at = new Date().toISOString();
    type Kind = 'own' | 'project' | 'sibling' | 'company' | 'other-project' | 'both';
    const kinds: Kind[] = [];
    for (let n = 0; n < 40; n += 1) kinds.push((['own', 'sibling', 'project', 'company', 'own', 'other-project', 'project', 'both'] as const)[n % 8]!);
    const inserted: { seq: number; op_id: string; kind: Kind }[] = [];
    for (const kind of kinds) {
      const op_id = newId();
      const [row] = await db
        .insert(ops)
        .values({
          op_id,
          company_id: company,
          scope: kind === 'project' || kind === 'other-project' || kind === 'both' ? 'project' : kind === 'company' ? 'company' : 'relatorio',
          project_id: kind === 'project' || kind === 'both' ? project : kind === 'other-project' ? otherProject : null,
          relatorio_id: kind === 'own' || kind === 'both' ? relatorio : kind === 'sibling' ? sibling : null,
          kind: 'put',
          path: `probe/${op_id}`,
          value: kind,
          actor_id: 'probe',
          device_id: 'probe',
          client_ts: at,
          received_at: at,
        })
        .returning({ seq: ops.seq });
      inserted.push({ seq: row!.seq, op_id, kind });
    }
    const stream = inserted.filter((op) => op.kind === 'own' || op.kind === 'project' || op.kind === 'both');
    const head = Math.max(...stream.map((op) => op.seq));

    const pulled: string[] = [];
    let since = 0;
    for (let pages = 0; pages < 20; pages += 1) {
      const page = (await pullRelatorio(db, asCompanyId(company), relatorio, since, 4))!;
      expect(page.head).toBe(head);
      expect(page.ops.map((op) => op.seq)).toEqual(stream.filter((op) => op.seq > since).slice(0, 4).map((op) => op.seq));
      pulled.push(...page.ops.map((op) => op.op_id));
      const last = page.ops.at(-1)?.seq;
      if (last === undefined || last >= page.head) break;
      since = last;
    }
    expect(pulled).toEqual(stream.map((op) => op.op_id));
  });
});

describe('A-22 toSnapshot reads the project rows, not the sibling relatórios', () => {
  it('a sibling relatório of the same project, with rows of its own, leaves the snapshot as it was', async () => {
    const company = asCompanyId(newId());
    companies.push(company);
    const remapped = portoSeguroSmall.log.map((op) => {
      const value =
        op.kind === 'create' && op.value !== null && typeof op.value === 'object' && !Array.isArray(op.value) && 'company_id' in op.value
          ? { ...(op.value as Record<string, unknown>), company_id: company }
          : op.value;
      return { ...op, op_id: newId(), company_id: company, value, seq: undefined };
    });
    // The fixture's ids are its own; on a throwaway company only its op ids must be fresh.
    const result = await applyOps(db, company, remapped, { now, origin: 'server' });
    expect(result.rejected).toEqual([]);
    const before = await toSnapshot(db, company, portoSeguroSmall.relatorioId);

    const sibling = newId();
    const project = portoSeguroSmall.projectId;
    const rows: (typeof entities.$inferInsert)[] = [
      { company_id: company, entity: 'relatorio', id: sibling, relatorio_id: sibling, project_id: project, row: { ...(before.relatorio as object), id: sibling } as EntityRow, updated_seq: 1 },
      ...Array.from({ length: 30 }, () => {
        const id = newId();
        return { company_id: company, entity: 'block', id, relatorio_id: sibling, project_id: project, row: { id, relatorio_id: sibling, project_id: project } as unknown as EntityRow, updated_seq: 1 };
      }),
    ];
    await db.insert(entities).values(rows);
    const after = await toSnapshot(db, company, portoSeguroSmall.relatorioId);
    expect(after).toEqual(before);
    expect(after.equipment.length).toBeGreaterThan(0);
  });
});
