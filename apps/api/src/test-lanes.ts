/**
 * Chore T4 (2026-11-26, sprint-change-proposal-2026-11-04.md § 4.5): the lanes of the api suite
 * (`pnpm test:api`). `apps/api/vitest.config.ts` turns them into four Vitest projects, and
 * `scripts/api-suite.ts` runs them in two phases:
 *
 * 1. At the same time:
 *    - `api` (parallel): every test file not listed below, on `PARALLEL_WORKERS` workers. Each
 *      worker seeds its own pair of test companies (`testSeedPair(slot + 1)`, `db/test-seed.ts`,
 *      `test-setup/test-pair.ts`), and every other id a file writes is minted per run, so files
 *      running at once share no row.
 *    - beside it, each in a Vitest run of its own, on one worker and one file at a time:
 *      `api-serial` on the fixed pair (pair 1) and `api-print` on `PRINT_PAIR`, pairs no parallel
 *      worker uses. `api-serial` holds the files that share something a second file of theirs would
 *      race on (the small Porto Seguro fixture's fixed ids; the api's one document queue, AD-15,
 *      which orders the conversions of both runs); `api-print` the print locks and the LibreOffice
 *      print checks, whose layout-lock fixtures carry fixed op ids of their own. `pnpm test:api`
 *      always runs `api-print`; `pnpm test:api:batch` runs it only when the batch changed a path of
 *      `PRINT_TRIGGERS` (or when it cannot tell).
 * 2. `api-solo`: the files that must have nothing beside them (a timing budget, a boot upgrade over
 *    every company, the legacy companies every seed removes), one at a time.
 *
 * Paths are relative to `apps/api`. `scripts/api-suite.test.ts` fails when a listed file is
 * missing, a file sits in two lanes, or a test file that reaches a shared resource (a preview or
 * generate route, a fixed-id fixture, a golden, a boot upgrade) is left in the parallel lane.
 */

export interface LaneEntry {
  readonly file: string;
  readonly why: string;
}

/**
 * The parallel lane's worker count. Measured 2026-11-26 on the 8-vCPU podman VM (M2 Pro, 6 performance
 * cores): the lane alone took 185 s on three workers and 174 s on six, where every file ran twice as slow;
 * four leaves room for the queue run beside it and for lint and static in `verify`'s first phase
 * (spec-t4-api-suite-speed.md).
 */
export const PARALLEL_WORKERS = 4;

const DOC_QUEUE = "waits on the api's one document queue (AD-15: one LibreOffice conversion at a time), which a second file would queue behind";
const FIXED_FIXTURE = 'seeds the small Porto Seguro fixture under its fixed ids (`seedPortoSeguroSmall` without `copy`), which one company at a time can hold';
const FIXED_FIXTURE_OPS =
  'applies the Porto Seguro fixtures under their fixed op ids and first deletes those op ids in every company, which would remove the small fixture another `api-serial` file holds';

export const SERIAL_FILES: readonly LaneEntry[] = [
  { file: 'src/http/e25c-stale-conclusion.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/http/e31c-audio-hold.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/http/generate-lock.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/http/generate.enqueue.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/http/generate.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/http/preview.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/http/request-log.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/jobs/generate/job-fault.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/jobs/generate/job-photo-read.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/jobs/generate/job.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/jobs/generate/rich-text.integration.test.ts', why: `${DOC_QUEUE}; ${FIXED_FIXTURE}` },
  { file: 'src/jobs/generate/job-certificate.integration.test.ts', why: FIXED_FIXTURE },
  { file: 'src/jobs/generate/worker.integration.test.ts', why: FIXED_FIXTURE },
  { file: 'src/jobs/audit/worker.integration.test.ts', why: FIXED_FIXTURE },
  { file: 'src/db/test-fixtures.integration.test.ts', why: `${FIXED_FIXTURE}; it also removes the fixture from every test company that holds it` },
  { file: 'src/db/seed-cli.integration.test.ts', why: `runs \`seed-users.ts --sample-relatorio\` and \`--test\` (the fixed pair) as child processes; ${FIXED_FIXTURE}` },
  { file: 'src/sync/porto-seguro.integration.test.ts', why: FIXED_FIXTURE_OPS },
  { file: 'src/sync/roles.integration.test.ts', why: DOC_QUEUE },
  { file: 'src/sync/e26r-issued.integration.test.ts', why: DOC_QUEUE },
  { file: 'src/sync/sync.integration.test.ts', why: DOC_QUEUE },
];

const PRINT_LOCK = 'prints the frozen layout-lock relatórios (fixed op ids) through the api and compares them with their goldens';
const PRINT_CHECK = "prints a layout-lock relatório (fixed op ids) through the api's LibreOffice and reads the PDF";
const IN_PROCESS_PRINT = 'renders a PDF with LibreOffice in the test process (skipped where soffice is absent, as in the tools container)';

export const PRINT_FILES: readonly LaneEntry[] = [
  { file: 'src/jobs/generate/layout-lock.integration.test.ts', why: PRINT_LOCK },
  { file: 'src/jobs/generate/docx-layout-lock.test.ts', why: 'renders the DOCX of every frozen layout-lock relatório and compares it with its golden' },
  { file: 'src/jobs/generate/e24a-v14-print.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e24p-v14-print.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e24s-v14-print.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e24y-paired-tables.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e25b-revision-verdicts.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e25b-revision-verdicts-gaps.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e25p-criterion-per-row.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e25r-like-with-like.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e28b-v18-print.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e28c-v18-print.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/v13-insulation-print.integration.test.ts', why: PRINT_CHECK },
  { file: 'src/jobs/generate/e28r-first-issue-deadline.integration.test.ts', why: IN_PROCESS_PRINT },
  { file: 'src/jobs/generate/page-placement.integration.test.ts', why: IN_PROCESS_PRINT },
  { file: 'src/jobs/generate/cover-line-breaks.integration.test.ts', why: IN_PROCESS_PRINT },
];

const BOOT_UPGRADE =
  "runs a boot upgrade over every company, writing ops into companies other files are counting (measured 2026-11-26: tombstone's op count went 5 over when it ran beside it on six workers)";

export const SOLO_FILES: readonly LaneEntry[] = [
  { file: 'src/jobs/generate/generation-time.integration.test.ts', why: `times a preview and an issue against their budgets, so nothing may share the CPU or the document queue; ${FIXED_FIXTURE}` },
  { file: 'src/db/seed.integration.test.ts', why: 'plants the legacy v4 test companies (`LEGACY_TEST_COMPANY_IDS`), which every `seedTestCompanies` in any other file removes mid-test' },
  { file: 'src/db/roles.integration.test.ts', why: `${BOOT_UPGRADE} (\`upgradeRolesAndUsers\` gives every company its five roles, and its second run must write nothing)` },
  { file: 'src/db/template-seed-upgrade.integration.test.ts', why: `${BOOT_UPGRADE} (\`upgradeTemplateSeeds\` moves every company's templates)` },
];

/**
 * The test pair of the `api-print` run (`API_TEST_PAIR`, set by `scripts/api-suite.ts`): the last
 * pair the scheme holds, above every parallel worker's (`slot + 1`), so the print files sign in and
 * re-seed beside the serial run's fixed pair without revoking its sessions.
 */
export const PRINT_PAIR = 255;

/** The setup file that gives each parallel worker its own test pair. */
export const PARALLEL_SETUP_FILE = 'src/test-setup/test-pair.ts';
