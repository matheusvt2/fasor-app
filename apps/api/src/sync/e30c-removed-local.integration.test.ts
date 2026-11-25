import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  entityKey,
  errorResponseSchema,
  locationChecklistPath,
  locationFieldPath,
  materializeEntity,
  MIN_CONTRACT_VERSION,
  SEED_VERSION,
  siteItems,
  targetsOf,
  type LocationRow,
  type Op,
} from '@app/domain';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { entities } from '../db/schema.ts';
import { seedUser, TEST_SEED } from '../db/seed.ts';
import { dropCompany } from '../db/test-cleanup.ts';
import { newId } from '../ids.ts';
import { routeHarness, type Company } from './rules.test-support.ts';

/*
 * 30.4-API-001 (batch e30c, Epic 30 wave 2, Story 30.4, contract 61; Q-8): a local removed on one tablet while another
 * answered its "Verificações do local" without having seen the removal, through the sync route, against the compose api
 * with real sessions of one throwaway company. Ana (Admin, tablet A) removes the local; Bruno (Engenheiro de Campo,
 * tablet B) answers it. In both orders of arrival the server marks the local (`removal_conflict`), keeps every answer,
 * and a pull of the relatório folds on the device to the server's row; "Restaurar local" (the restore) and "Deixar
 * removido" (a put of the removal's own time) clear the mark; a client on contract 60 is refused its stream with 426.
 * Every value is invented.
 */

const h = routeHarness('tablet-e30c-office');
const config = loadConfig();
const auth = createAuth({ db: h.db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const companyId = newId();
const A_DEVICE = 'tablet-e30c-ana';
const B_DEVICE = 'tablet-e30c-bruno';
const KEYS = siteItems(SEED_VERSION).map((item) => item.key);

const people = {} as Record<'ana' | 'bruno', Company>;

type Cabine = Extract<LocationRow, { kind: 'cabine' }>;

beforeAll(async () => {
  await h.setup();
  for (const [person, name, role] of [
    ['ana', 'Ana Andrade', 'admin'],
    ['bruno', 'Bruno Barros', 'engenheiro_de_campo'],
  ] as const) {
    const email = `${person}-${companyId}@teste.local`;
    const result = await seedUser(h.db, auth, { companyId, companyName: 'Empresa do local removido', email, password: TEST_SEED.password, name, council: 'crea', registrationNumber: 'SP 30', role });
    people[person] = { companyId, email, userId: result.userId } as unknown as Company;
  }
}, 120_000);

afterAll(async () => {
  await dropCompany(h.db, companyId);
  await h.cleanup();
});

/**
 * Bruno, on tablet B, answers the first `n` site items of the local (C), stamped as a contract-61 commit stamps them on a
 * local his row held live (`seen_removed_at`, fix batch e30h); `old` sends them as a bundle before contract 61 did (no stamp).
 */
const answers = (relatorioId: string, locationId: string, n: number, old = false): Op[] =>
  KEYS.slice(0, n).map((key) =>
    h.clientOp(people.bruno, { kind: 'put', path: locationChecklistPath(locationId, key, 'result'), relatorio_id: relatorioId, value: 'C', device_id: B_DEVICE, meta: old ? null : { seen_removed_at: null } }),
  );

/** Ana, on tablet A, removes the local, stamped with what her row held of its site work (`seen`). */
const removal = (relatorioId: string, locationId: string, seen: string | null): Op =>
  h.clientOp(people.ana, { kind: 'remove', path: locationFieldPath(locationId, 'removed_at'), relatorio_id: relatorioId, value: null, device_id: A_DEVICE, meta: { seen_modified_at: seen } });

const serverLocal = async (locationId: string) => (await h.rowOf<Cabine>(people.ana, 'location', locationId))!;

/** The relatório's stream as `person` pulls it, folded into the local's row as a device does (`materializeEntity`). */
async function deviceLocal(person: 'ana' | 'bruno', relatorioId: string, locationId: string): Promise<Cabine | null> {
  const res = await h.authed(people[person], `/api/sync/relatorios/${relatorioId}?since=0`);
  expect(res.status).toBe(200);
  const page = (await res.json()) as { ops: Op[] };
  const key = entityKey('location', locationId);
  return materializeEntity({ entity: 'location', id: locationId }, page.ops.filter((op) => targetsOf(op).some((ref) => ref.key === key)), []) as Cabine | null;
}

describe('30.4-API-001 a local removed against site work, through the sync route', () => {
  it('removal first: Bruno\'s answers land on the removed local and mark it; nothing is deleted; both devices fold the server\'s row; "Restaurar local" clears the mark', async () => {
    const { relatorioId, locationId } = await h.seedRelatorio(people.ana);
    const remove = removal(relatorioId, locationId, null);
    expect((await h.push(people.ana, [remove])).rejected).toEqual([]);
    const written = answers(relatorioId, locationId, 3);
    expect((await h.push(people.bruno, written)).rejected).toEqual([]);

    const marked = await serverLocal(locationId);
    expect(marked.removed_at).toBe(remove.client_ts);
    expect(marked.removal_conflict).toEqual({ removed_by: people.ana.userId, removed_at: remove.client_ts, edited_by: people.bruno.userId, edited_at: written.at(-1)!.client_ts });
    expect(Object.keys(marked.checklist ?? {})).toHaveLength(3);
    for (const person of ['ana', 'bruno'] as const) expect(await deviceLocal(person, relatorioId, locationId)).toEqual(marked);

    const restore = h.clientOp(people.ana, { kind: 'put', path: locationFieldPath(locationId, 'removed_at'), relatorio_id: relatorioId, value: null, device_id: A_DEVICE });
    expect((await h.push(people.ana, [restore])).rejected).toEqual([]);
    const restored = await serverLocal(locationId);
    expect(restored.removed_at).toBeNull();
    expect(restored.removal_conflict).toBeUndefined();
    expect(Object.keys(restored.checklist ?? {})).toHaveLength(3);
    expect(await deviceLocal('bruno', relatorioId, locationId)).toEqual(restored);
  });

  it('work first: a removal that did not see Bruno\'s pushed answers marks the local; "Deixar removido" clears it and the local stays removed at the same time', async () => {
    const { relatorioId, locationId } = await h.seedRelatorio(people.ana);
    const written = answers(relatorioId, locationId, 2);
    expect((await h.push(people.bruno, written)).rejected).toEqual([]);
    const remove = removal(relatorioId, locationId, null);
    expect((await h.push(people.ana, [remove])).rejected).toEqual([]);

    const marked = await serverLocal(locationId);
    expect(marked.site_modified_by).toBe(people.bruno.userId);
    expect(marked.removal_conflict).toEqual({ removed_by: people.ana.userId, removed_at: remove.client_ts, edited_by: people.bruno.userId, edited_at: written.at(-1)!.client_ts });
    for (const person of ['ana', 'bruno'] as const) expect(await deviceLocal(person, relatorioId, locationId)).toEqual(marked);

    const leave = h.clientOp(people.bruno, {
      kind: 'put',
      path: locationFieldPath(locationId, 'removed_at'),
      relatorio_id: relatorioId,
      value: marked.removed_at,
      device_id: B_DEVICE,
      meta: { seen_modified_at: marked.site_modified_at ?? null },
    });
    expect((await h.push(people.bruno, [leave])).rejected).toEqual([]);
    const left = await serverLocal(locationId);
    expect(left.removed_at).toBe(remove.client_ts);
    expect(left.removal_conflict).toBeUndefined();
    expect(Object.keys(left.checklist ?? {})).toHaveLength(2);
    expect(await deviceLocal('ana', relatorioId, locationId)).toEqual(left);

    // A removal that saw the answers marks nothing.
    const other = await h.seedRelatorio(people.ana);
    const seenAnswers = answers(other.relatorioId, other.locationId, 1);
    expect((await h.push(people.bruno, seenAnswers)).rejected).toEqual([]);
    expect((await h.push(people.ana, [removal(other.relatorioId, other.locationId, seenAnswers[0]!.client_ts)])).rejected).toEqual([]);
    expect((await serverLocal(other.locationId)).removal_conflict).toBeUndefined();
  });

  it('e30h-API-001 answers written before contract 61 on a row the old reducer folded, then a removal after it: the server and both devices hold the same row and no mark', async () => {
    const { relatorioId, locationId } = await h.seedRelatorio(people.ana);
    const old = answers(relatorioId, locationId, 3, true);
    expect((await h.push(people.bruno, old)).rejected).toEqual([]);
    // The row as the reducer before contract 61 left it on the server: none of the derived columns.
    const folded = await serverLocal(locationId);
    const oldRow: Record<string, unknown> = { ...folded };
    for (const column of ['site_modified_by', 'site_modified_at', 'removed_by', 'removal_conflict']) delete oldRow[column];
    await h.db
      .update(entities)
      .set({ row: oldRow as never })
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'location'), eq(entities.id, locationId)));
    // Ana's device held that same row, so her commit stamps that it saw no site work.
    const remove = removal(relatorioId, locationId, null);
    expect((await h.push(people.ana, [remove])).rejected).toEqual([]);

    const server = await serverLocal(locationId);
    expect(server.removed_at).toBe(remove.client_ts);
    expect(server.removal_conflict).toBeUndefined();
    expect(Object.keys(server.checklist ?? {})).toHaveLength(3);
    for (const person of ['ana', 'bruno'] as const) expect(await deviceLocal(person, relatorioId, locationId)).toEqual(server);
  });

  it('a version-60 client (the contract before) is refused the relatório\'s stream with 426 contract_outdated; a current one reads it; its push is still accepted', async () => {
    expect(CONTRACT_VERSION).toBe(61);
    expect(MIN_CONTRACT_VERSION).toBe(61);
    const { relatorioId, locationId } = await h.seedRelatorio(people.ana);
    const old = await h.authed(people.bruno, `/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '60' } });
    expect(old.status).toBe(426);
    expect(errorResponseSchema.parse(await old.json()).code).toBe('contract_outdated');
    const current = await h.authed(people.bruno, `/api/sync/relatorios/${relatorioId}?since=0`);
    expect(current.status).toBe(200);
    // AD-13: an outdated client keeps pushing; its unstamped removal folds as before (no mark).
    const written = answers(relatorioId, locationId, 1);
    expect((await h.push(people.bruno, written)).rejected).toEqual([]);
    const unstamped = h.clientOp(people.ana, { kind: 'remove', path: locationFieldPath(locationId, 'removed_at'), relatorio_id: relatorioId, value: null, device_id: A_DEVICE });
    const res = await h.authed(people.ana, '/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: [unstamped] }), headers: { [CONTRACT_VERSION_HEADER]: '60' } });
    h.track([unstamped]);
    expect(res.status).toBe(200);
    const row = await serverLocal(locationId);
    expect(row.removed_at).toBe(unstamped.client_ts);
    expect(row.removal_conflict).toBeUndefined();
  });
});
