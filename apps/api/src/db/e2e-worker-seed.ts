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
 *                                                colleague e2e00000-00a2-7000-8000-{i}
 *   company B_i  e2e00000-000b-7000-8000-{i}     user B_i  e2e00000-00b1-7000-8000-{i}
 *
 * Story 10.1 (epic-10 Conflict 13): company A also holds a second user, the colleague
 * Eduardo Esteves (`SeedAccount.colleague`), so a two-device merge names another author of
 * the same company. It belongs to the same pair, so the leak check treats it like A_i.
 *
 * Story 26.3 (AD-29): one user per seeded role other than Admin, in Empresa B, for the specs of
 * Stories 26.4 and 26.5 and every later one (`workerRoleUser`, seeded on demand by
 * `seedRoleUser` in `seed.ts`, never by the global setup). Every other worker user is Admin.
 *
 *   engenheiro_de_campo  e2e00000-00b2-7000-8000-{i}  e2e-w{i}-campo@teste.local     Carla Campos
 *   gestor_do_projeto    e2e00000-00b3-7000-8000-{i}  e2e-w{i}-gestor@teste.local    Gustavo Gomes
 *   responsavel_tecnico  e2e00000-00b4-7000-8000-{i}  e2e-w{i}-rt@teste.local        Renata Rocha
 *   consulta             e2e00000-00b5-7000-8000-{i}  e2e-w{i}-consulta@teste.local  Otávio Osório
 *
 * Narrowed from the epic context ("seeded once at global setup, inside the pair"): defined in
 * the pair, seeded on demand, in Empresa B, because Empresa A is never reset and 1.8-E2E-004/007
 * count its people ("2 pessoas da equipe"); a reset of Empresa B empties their rows, so a spec
 * seeds the one it needs right before it signs in.
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
  /** Story 10.1: a second user of the same company (company A only), for two-device specs. */
  readonly colleague?: SeedAccount;
  /** Story 26.3: the seeded role the user gets; absent means Admin. */
  readonly role?: WorkerRole;
}

/** Story 26.3: the seeded roles a worker has one user of, besides its Admin users (the kernel's `SystemRoleId` minus `admin`). */
export const WORKER_ROLES = ['engenheiro_de_campo', 'gestor_do_projeto', 'responsavel_tecnico', 'consulta'] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

/** A worker's role user: a seeded account of Empresa B with its role and the worker password. */
export interface WorkerRoleUser extends SeedAccount {
  readonly role: WorkerRole;
  readonly password: string;
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
const USER_ID = /^e2e00000-00(?:a1|a2|b[1-5])-7000-8000-([0-9a-f]{12})$/;

/** Story 26.3: each role user's id digit (`00b{n}`), e-mail word and name. */
const ROLE_USERS: Readonly<Record<WorkerRole, { digit: string; word: string; name: string }>> = {
  engenheiro_de_campo: { digit: '2', word: 'campo', name: 'Carla Campos' },
  gestor_do_projeto: { digit: '3', word: 'gestor', name: 'Gustavo Gomes' },
  responsavel_tecnico: { digit: '4', word: 'rt', name: 'Renata Rocha' },
  consulta: { digit: '5', word: 'consulta', name: 'Otávio Osório' },
};

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
        colleague: {
          companyId: `e2e00000-000a-7000-8000-${tail}`,
          companyName: 'Empresa A de Teste',
          email: `e2e-w${index}-a2@teste.local`,
          name: 'Eduardo Esteves',
          council: 'crea',
          registrationNumber: 'SP 1000000003',
          userId: `e2e00000-00a2-7000-8000-${tail}`,
          standardTemplate: false,
        },
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

/** Story 26.3: the user of one seeded role in worker `index`'s Empresa B (deterministic: same index, same ids). */
export function workerRoleUser(index: number, role: WorkerRole): WorkerRoleUser {
  const tail = suffix(index);
  const user = ROLE_USERS[role];
  return {
    companyId: `e2e00000-000b-7000-8000-${tail}`,
    companyName: 'Empresa B de Teste',
    email: `e2e-w${index}-${user.word}@teste.local`,
    name: user.name,
    council: 'crea',
    registrationNumber: `SP 300000000${user.digit}`,
    userId: `e2e00000-00b${user.digit}-7000-8000-${tail}`,
    standardTemplate: false,
    role,
    password: E2E_WORKER_PASSWORD,
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
  return match === null ? null : Number.parseInt(match[1]!, 16);
}

/** True for a company of an e2e worker pair: the only companies besides `TEST_SEED` a test reset may empty. */
export function isE2eWorkerCompany(companyId: string): boolean {
  return workerIndexOfCompany(companyId) !== null;
}

/** The SQL `LIKE` patterns of the scheme's company and user ids, for the leak check. */
export const E2E_WORKER_COMPANY_LIKE = 'e2e00000-000_-7000-8000-%';
export const E2E_WORKER_USER_LIKE = 'e2e00000-00__-7000-8000-%';

/** The Postgres regexp of the scheme's user ids (A_i, the colleague of A_i, B_i, B_i's role users), for the leak check. */
export const E2E_WORKER_USER_REGEXP = '(e2e00000-00(?:a1|a2|b[1-5])-7000-8000-[0-9a-f]{12})';
