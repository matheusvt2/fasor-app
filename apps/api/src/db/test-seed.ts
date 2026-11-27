/**
 * The two companies every automated suite seeds itself with (TC-9). Two companies with
 * one user each is what the cross-tenant test needs, so `--test` provisions both in one
 * call. Kept in its own module, free of drizzle and better-auth, so the Playwright
 * fixtures can import the constants without pulling the server in.
 *
 * The company ids are uuidv7-shaped (version nibble 7): an op's `company_id` is a
 * `uuidV7Schema` (AD-4), so the sync tests can push ops of these companies.
 */
/**
 * The v4-shaped ids the two test companies carried before Story 1.5. A Postgres volume
 * seeded then still holds them with the seeded e-mails attached, which would make
 * `seedUser` refuse the e-mail; `seedTestCompanies` removes these companies first.
 */
export const LEGACY_TEST_COMPANY_IDS = [
  '0a000000-0000-4000-8000-00000000000a',
  '0b000000-0000-4000-8000-00000000000b',
] as const;

/** One seeded test company with its one user. */
export interface TestSeedCompany {
  readonly companyId: string;
  readonly companyName: string;
  readonly email: string;
  readonly name: string;
  readonly council: 'crea' | 'crt';
  readonly registrationNumber: string;
  /** Fixed uuidv7 (AD-4), so every suite and the device database name `releng-{user_id}` agree. */
  readonly userId: string;
  /** Seeded with the "Cabine primária — padrão" template, as `--standard-template` does. */
  readonly standardTemplate: boolean;
}

export interface TestSeed {
  readonly password: string;
  readonly companies: readonly [TestSeedCompany, TestSeedCompany];
}

/** The fixed pair: what every run outside the api suite's parallel lane sees. */
export const BASE_TEST_SEED: TestSeed = {
  password: 'senha-de-teste-123456',
  companies: [
    {
      companyId: '0a000000-0000-7000-8000-00000000000a',
      companyName: 'Empresa A de Teste',
      email: 'a@teste.local',
      name: 'Ana Alves',
      council: 'crea',
      registrationNumber: 'SP 1000000001',
      userId: '0a000000-0000-7000-8000-0000000000a1',
      standardTemplate: true,
    },
    {
      companyId: '0b000000-0000-7000-8000-00000000000b',
      companyName: 'Empresa B de Teste',
      email: 'b@teste.local',
      name: 'Bento Braga',
      council: 'crt',
      registrationNumber: 'SP 2000000002',
      userId: '0b000000-0000-7000-8000-0000000000b1',
      /** No template: the Templates surface's empty state is exercised on this company. */
      standardTemplate: false,
    },
  ],
};

/** The highest pair the id scheme holds: two hex digits. */
const MAX_PAIR = 0xff;

/**
 * Chore T4 (2026-11-26): the test pair of one api suite worker. Pair 1 (and no pair at all)
 * is `BASE_TEST_SEED`, so a one-file run, the serial lanes and every caller outside Vitest
 * see the fixed companies they always saw. Pair `p` from 2 on is the same shape (names,
 * councils, registrations, template flags, password) with its own ids and e-mails, so two
 * workers never share a company, a user or a session: re-seeding a user revokes that user's
 * sessions (`seedUser`), which on one shared pair signed out every other file's cookies.
 *
 *   company A_p  0a000000-00pp-7000-8000-00000000000a   user A_p  0a000000-00pp-7000-8000-0000000000a1
 *   company B_p  0b000000-00pp-7000-8000-00000000000b   user B_p  0b000000-00pp-7000-8000-0000000000b1
 *
 * where `pp` is `p` in two hex digits. The ids stay uuidv7-shaped (AD-4) and never meet the
 * fixed pair (`0000` there), the legacy v4 ids, the e2e workers' (`e2e00000`) or a minted id.
 */
export function testSeedPair(pair: number): TestSeed {
  if (!Number.isInteger(pair) || pair < 1 || pair > MAX_PAIR) {
    throw new Error(`test seed pair must be an integer from 1 to ${MAX_PAIR}, got ${pair}`);
  }
  if (pair === 1) return BASE_TEST_SEED;
  const pp = pair.toString(16).padStart(2, '0');
  const [a, b] = BASE_TEST_SEED.companies;
  return {
    password: BASE_TEST_SEED.password,
    companies: [
      { ...a, companyId: `0a000000-00${pp}-7000-8000-00000000000a`, userId: `0a000000-00${pp}-7000-8000-0000000000a1`, email: `a-w${pair}@teste.local` },
      { ...b, companyId: `0b000000-00${pp}-7000-8000-00000000000b`, userId: `0b000000-00${pp}-7000-8000-0000000000b1`, email: `b-w${pair}@teste.local` },
    ],
  };
}

/**
 * The environment variable naming the pair, set only by the api suite's setup file
 * (`apps/api/src/test-setup/test-pair.ts`, from Vitest's `VITEST_POOL_ID`). A process the
 * suite spawns inherits it (the seed CLI test), so the child seeds the same pair.
 */
export const TEST_PAIR_ENV = 'API_TEST_PAIR';

/** The pair this process uses: `API_TEST_PAIR` when set, otherwise 1 (the fixed pair). */
export function currentTestPair(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env[TEST_PAIR_ENV];
  if (raw === undefined || raw === '') return 1;
  const pair = Number(raw);
  if (!Number.isInteger(pair)) throw new Error(`${TEST_PAIR_ENV} must be an integer, got "${raw}"`);
  return pair;
}

export const TEST_SEED: TestSeed = testSeedPair(currentTestPair());
