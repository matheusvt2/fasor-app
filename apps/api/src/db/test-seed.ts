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

export const TEST_SEED = {
  password: 'senha-de-teste-123456',
  companies: [
    {
      companyId: '0a000000-0000-7000-8000-00000000000a',
      companyName: 'Empresa A de Teste',
      email: 'a@teste.local',
      name: 'Ana Alves',
      council: 'crea',
      registrationNumber: 'SP 1000000001',
      /** Deterministic: `seed-user-` plus the slug of the e-mail (see `seed.ts`). */
      userId: 'seed-user-a-teste-local',
    },
    {
      companyId: '0b000000-0000-7000-8000-00000000000b',
      companyName: 'Empresa B de Teste',
      email: 'b@teste.local',
      name: 'Bento Braga',
      council: 'crt',
      registrationNumber: 'SP 2000000002',
      userId: 'seed-user-b-teste-local',
    },
  ],
} as const;
