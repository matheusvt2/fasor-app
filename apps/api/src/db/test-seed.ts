/**
 * The two companies every automated suite seeds itself with (TC-9). Two companies with
 * one user each is what the cross-tenant test needs, so `--test` provisions both in one
 * call. Kept in its own module, free of drizzle and better-auth, so the Playwright
 * fixtures can import the constants without pulling the server in.
 */
export const TEST_SEED = {
  password: 'senha-de-teste-123456',
  companies: [
    {
      companyId: 'test-company-a',
      companyName: 'Empresa A de Teste',
      email: 'a@teste.local',
      name: 'Ana Alves',
      council: 'crea',
      registrationNumber: 'SP 1000000001',
      /** Deterministic: `seed-user-` plus the slug of the e-mail (see `seed.ts`). */
      userId: 'seed-user-a-teste-local',
    },
    {
      companyId: 'test-company-b',
      companyName: 'Empresa B de Teste',
      email: 'b@teste.local',
      name: 'Bento Braga',
      council: 'crt',
      registrationNumber: 'SP 2000000002',
      userId: 'seed-user-b-teste-local',
    },
  ],
} as const;
