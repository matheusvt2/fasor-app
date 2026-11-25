import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, errorResponseSchema, MIN_CONTRACT_VERSION, relatorioSetupPath, SEED_VERSION, TEXT_CAPS, type Op, type RelatorioRow } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { seedUser, TEST_SEED } from '../db/seed.ts';
import { dropCompany } from '../db/test-cleanup.ts';
import { newId } from '../ids.ts';
import { routeHarness, type Company } from './rules.test-support.ts';

/*
 * 28.9-API-001 (batch e28c, Epic 28 wave 2, Story 28.9, contract 59; B-15): the relatório's additional items through the
 * sync route, against the compose api with real sessions of one throwaway company. An Engenheiro de Campo (who holds
 * `relatorio.fill`) writes two items on a v18 relatório and the server stores them in order; a Consulta (who does not)
 * is refused `op_forbidden` and nothing changes; an item past the long-text cap is refused `op_value_invalid`; a client
 * on contract 58 is refused the relatório's stream with 426, a current one reads the put. Every value is invented.
 */

const h = routeHarness('tablet-e28c-items');
const config = loadConfig();
const auth = createAuth({ db: h.db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const companyId = newId();
const ITEMS = [
  'O ensaio de isolação dos cabos de saída da Coluna 4 foi feito em conjunto, pelo barramento, com as duas chaves fechadas.',
  'Os ajustes dos relés seguem o estudo de seletividade fornecido pelo cliente, que não foi revisado nesta manutenção.',
];

const people = {} as Record<'admin' | 'campo' | 'consulta', Company>;
let relatorioId = '';

beforeAll(async () => {
  await h.setup();
  for (const [person, name, role] of [
    ['admin', 'Ana Admin', 'admin'],
    ['campo', 'Carla Campos', 'engenheiro_de_campo'],
    ['consulta', 'Otávio Osório', 'consulta'],
  ] as const) {
    const email = `${person}-${companyId}@teste.local`;
    const result = await seedUser(h.db, auth, { companyId, companyName: 'Empresa dos itens', email, password: TEST_SEED.password, name, council: 'crea', registrationNumber: 'SP 28', role });
    people[person] = { companyId, email, userId: result.userId } as unknown as Company;
  }
  // The office creates the relatório (relatorio.create); the field fills it.
  relatorioId = (await h.seedRelatorio(people.admin)).relatorioId;
}, 120_000);

afterAll(async () => {
  await dropCompany(h.db, companyId);
  await h.cleanup();
});

const itemsOp = (person: 'campo' | 'consulta', value: string[]): Op => h.clientOp(people[person], { kind: 'put', path: relatorioSetupPath('additional_items'), relatorio_id: relatorioId, value });
const stored = async () => (await h.rowOf<RelatorioRow>(people.campo, 'relatorio', relatorioId))?.setup.additional_items;

describe('28.9-API-001 the additional items through the sync route', () => {
  // Batch e30b (Story 30.3): the current seed is v19, which keeps v18's `additional_items`; the contract moved on to 60.
  it('a relatório born on the current seed (v19) holds none; the field writes two in order; a role without relatorio.fill is refused op_forbidden; past the cap op_value_invalid', async () => {
    expect(SEED_VERSION).toBe('v19');
    expect((await h.rowOf<RelatorioRow>(people.campo, 'relatorio', relatorioId))?.seed_version).toBe('v19');
    expect(await stored()).toEqual([]);

    const written = itemsOp('campo', ITEMS);
    const applied = await h.push(people.campo, [written]);
    expect(applied.rejected).toEqual([]);
    expect(await stored()).toEqual(ITEMS);

    const refused = itemsOp('consulta', [ITEMS[1]!]);
    expect((await h.push(people.consulta, [refused])).rejected).toEqual([{ op_id: refused.op_id, code: 'op_forbidden' }]);
    expect(await h.logged(refused.op_id)).toBe(false);
    expect(await stored()).toEqual(ITEMS);

    const long = itemsOp('campo', ['x'.repeat(TEXT_CAPS.long + 1)]);
    expect((await h.push(people.campo, [long])).rejected).toEqual([{ op_id: long.op_id, code: 'op_value_invalid' }]);
    expect(await stored()).toEqual(ITEMS);

    // The contract before cannot parse the path: its pull of the relatório is refused, a current one reads the put.
    expect(CONTRACT_VERSION).toBe(60);
    expect(MIN_CONTRACT_VERSION).toBe(60);
    const old = await h.authed(people.campo, `/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '58' } });
    expect(old.status).toBe(426);
    expect(errorResponseSchema.parse(await old.json()).code).toBe('contract_outdated');
    const current = await h.authed(people.campo, `/api/sync/relatorios/${relatorioId}?since=0`);
    expect(current.status).toBe(200);
    const page = (await current.json()) as { ops: Op[] };
    expect(page.ops.find((op) => op.op_id === written.op_id)?.value).toEqual(ITEMS);
  });
});
