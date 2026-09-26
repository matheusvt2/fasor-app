/**
 * The companies the Playwright suite runs on (E6-Q7): every worker gets its own pair, A_i
 * and B_i, each with one user, so parallel workers never share a company, a user, a
 * session or a device database (`releng-{user_id}`). The shape is `TEST_SEED`'s (same
 * names, councils, registrations and template flags); only the ids and the e-mails are
 * derived from the worker's `parallelIndex`. `TEST_SEED` itself stays the api suite's.
 *
 * Kept free of drizzle and better-auth, like `test-seed.ts`, so the Playwright fixtures
 * import it without pulling the server in.
 *
 * Ids are deterministic and uuidv7-shaped (version nibble 7, variant 8): an op's
 * `company_id` and every actor id are `uuidV7Schema` (AD-4). They start with `e2e00000`,
 * a prefix no `TEST_SEED`, legacy or minted id carries (a minted uuidv7 starts with the
 * current time in ms), and the worker index sits in the last 12 hex digits:
 *
 *   company A_i  e2e00000-000a-7000-8000-{i}     user A_i  e2e00000-00a1-7000-8000-{i}
 *   company B_i  e2e00000-000b-7000-8000-{i}     user B_i  e2e00000-00b1-7000-8000-{i}
 */

export type SeedCouncil = 'crea' | 'crt';

/** One seeded company with its one user, as `TEST_SEED.companies[n]` has it. */
export interface SeedAccount {
  readonly companyId: string;
  readonly companyName: string;
  readonly email: string;
  readonly name: string;
  readonly council: SeedCouncil;
  readonly registrationNumber: string;
  readonly userId: string;
  /** Seeded with the "Cabine primária — padrão" template (A); B starts without one. */
  readonly standardTemplate: boolean;
}

/** One worker's pair: `companies[0]` is its Empresa A, `companies[1]` its Empresa B. */
export interface WorkerSeed {
  readonly index: number;
  readonly password: string;
  readonly companies: readonly [SeedAccount, SeedAccount];
}

/** The password of every e2e worker user (the same value `TEST_SEED` uses). */
export const E2E_WORKER_PASSWORD = 'senha-de-teste-123456';

/** The highest worker index the id scheme holds (12 hex digits are far more than needed). */
const MAX_INDEX = 0xffff;

const COMPANY_ID = /^e2e00000-000([ab])-7000-8000-([0-9a-f]{12})$/;
const USER_ID = /^e2e00000-00([ab])1-7000-8000-([0-9a-f]{12})$/;

function suffix(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
    throw new Error(`e2e worker index must be an integer from 0 to ${MAX_INDEX}, got ${index}`);
  }
  return index.toString(16).padStart(12, '0');
}

/** The pair of worker `index` (Playwright's `parallelIndex`). Deterministic: same index, same ids. */
export function workerSeed(index: number): WorkerSeed {
  const tail = suffix(index);
  return {
    index,
    password: E2E_WORKER_PASSWORD,
    companies: [
      {
        companyId: `e2e00000-000a-7000-8000-${tail}`,
        companyName: 'Empresa A de Teste',
        email: `e2e-w${index}-a@teste.local`,
        name: 'Ana Alves',
        council: 'crea',
        registrationNumber: 'SP 1000000001',
        userId: `e2e00000-00a1-7000-8000-${tail}`,
        standardTemplate: true,
      },
      {
        companyId: `e2e00000-000b-7000-8000-${tail}`,
        companyName: 'Empresa B de Teste',
        email: `e2e-w${index}-b@teste.local`,
        name: 'Bento Braga',
        council: 'crt',
        registrationNumber: 'SP 2000000002',
        userId: `e2e00000-00b1-7000-8000-${tail}`,
        standardTemplate: false,
      },
    ],
  };
}

/** The worker index a company id of this scheme belongs to, or null for any other company. */
export function workerIndexOfCompany(companyId: string): number | null {
  const match = COMPANY_ID.exec(companyId);
  return match === null ? null : Number.parseInt(match[2]!, 16);
}

/** The worker index a user id of this scheme belongs to, or null for any other user. */
export function workerIndexOfUser(userId: string): number | null {
  const match = USER_ID.exec(userId);
  return match === null ? null : Number.parseInt(match[2]!, 16);
}

/** True for a company of an e2e worker pair: the only companies besides `TEST_SEED` a test reset may empty. */
export function isE2eWorkerCompany(companyId: string): boolean {
  return workerIndexOfCompany(companyId) !== null;
}

/** The SQL `LIKE` patterns of the scheme's company and user ids, for the leak check. */
export const E2E_WORKER_COMPANY_LIKE = 'e2e00000-000_-7000-8000-%';
export const E2E_WORKER_USER_LIKE = 'e2e00000-00_1-7000-8000-%';
