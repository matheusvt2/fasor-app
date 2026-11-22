# Epic 26 context: users, roles and permissions

Compiled 2026-11-21 by the coordinator, before any worktree. The stories, the decisions and the rules every story keeps are in `_bmad-output/planning-artifacts/epics.md`, "Epic 26" (read that section with offset and limit; never the whole file). This file adds only what the batches share.

## Goal

The Admin manages users; each role sees only its modules; the server refuses the rest. Five seeded roles, twelve permission keys, custom roles, passwords by e-mail. Nothing in a relatório, a seed or a printed page changes.

## Decisions (Matheus, 2026-11-21)

The seven decisions are in the epic's header. Added on approving the story list:
- One full gate for the whole epic, after the last wave is merged. No wave runs `pnpm test:e2e`, `test:e2e:full` or the matrix by itself.
- Batches run in parallel wherever their files do not touch; a dependent batch stacks on the branch it needs and does not wait for a merge.
- Story 26.7 (SES) is on hold until Matheus has talked to Bruno. Everything else is built with `EMAIL_PROVIDER=fake`.
- Every tablet updates the app at the deploy (one contract number). Accepted.

## Batch plan

At most two batch stacks up at a time. The main checkout's stack is stopped while batches run (`podman compose stop`, never `-v`).

| Wave | Tag | Stories | Port base | Base | Contract |
| --- | --- | --- | --- | --- | --- |
| 0 | e26f (frames, no stack) | 26.1 | none | main | none |
| 1 | e26a | 26.2, 26.3, 26.4, in this order | 26 | main | 55 (main's 54 plus one), minimum 55 |
| 1 | e26b | 26.5 | 27 | e26a's kernel slice (26.2), once the frames are approved | none |
| 2 | e26c | 26.6, 26.8 | 26 | e26a's branch or main once merged | none expected |
| 2 | e26d | 26.9, 26.11 | 27 | e26c's branch for the routes; e26b for the provider | none |
| 3 | e26e | 26.10 | 26 | main after wave 2's merges | none expected |
| hold | coordinator | 26.7 | none | waits for Matheus | none |

- e26a pushes its kernel slice (Story 26.2: the keys, the role entity, `can`, the path map, the contract number) first and reports the sha, so e26b can stack on it.
- Second PR of a pair: merges the first batch's branch (or main), runs both batches' touched specs on the result, names the merge commit in its body (cross-batch merge rule).

## Facts the batches share

- **Keys and seeded sets:** the two tables of the epic's header are the data of `packages/domain/src/permissions/`. System role identifiers: `admin`, `engenheiro_de_campo`, `gestor_do_projeto`, `responsavel_tecnico`, `consulta`.
- **Transport:** role rows, `user/role_id` and `user/status` are server-only ops with actor `system:admin`; devices get them by the company pull and render from IndexedDB.
- **Refusals:** ops answer the existing `op_forbidden`; routes answer `403` with the new `forbidden` code; an inactive user gets `401` with a code the device can read.
- **One assertion per shared item:**
  - the op family `role/*` and the user fields: kernel test in 26.2, the pull in 26.3, the refusal of a client write in 26.4;
  - `can` and `permissionForPath`: defined in 26.2, called by 26.4 (server) and 26.5 (web); neither reimplements it;
  - the e2e users of the other four roles: seeded once, in 26.3 (`e2e-worker-seed.ts`), inside each worker's pair; every later spec reuses them;
  - the fake e-mail store and its test helper: built once, in 26.6; 26.8, 26.9 and 26.11 reuse it;
  - `errorCodeSchema`: 26.4 adds `forbidden` and the inactive-user code; 26.8 adds the duplicate e-mail and last-Admin codes.
- **Expected shared files:** `ops/path.ts`, `contract/version.ts`, `contract/errors.ts` (e26a, then e26c appends); `apps/api/src/http/session.ts` (e26a); `apps/api/src/db/seed.ts`, `e2e-worker-seed.ts` (e26a); `apps/web/src/app.tsx` (e26b, then e26d adds `/usuarios`); `apps/web/src/copy/pt-br.ts` (different keys per batch); `apps/api/src/auth/auth.ts` (e26c).
- **Every existing test user stays Admin.** A batch that finds an existing test red because of a role stops and reports; it does not edit what the test asserts.

## Gates

- **Each batch:** `lint`, `static`, `test:unit`, `test:api` and only the specs it wrote or touched, under the host lock (`lockf /tmp/fasor-verify.lock`); the summary pasted in its PR. No review loop inside the batch.
- **Once, after wave 3 is merged:** `podman compose restart api web`, then `pnpm test:e2e:full` and the matrix on the integrated main, one review, one fix batch if needed, the hands-on pass as each of the five roles, then the deploy on Matheus's word.

## Open items

- Story 26.7: sender domain and address, DNS records, SES sandbox exit (Matheus, after Bruno).
- Whether the deploy waits for 26.7 (coordinator's reading: yes).
- The coordinator's readings under Stories 26.2, 26.4, 26.6 and 26.10.
- The frames of Story 26.1 need Matheus's approval before e26b and e26d start.

## Record of 2026-11-22

- **On main, not deployed:** every story but 26.7. PRs #341 (26.1), #342 (26.2 to 26.4), #346 (26.8 and the api half of 26.6), #348 (26.5), #353 (26.9, 26.11, the web half of 26.6), #352 (26.10 and the first company pull at sign-in).
- **The one full gate, on `8a214062`, in the main checkout's stack, under the host lock:** `lint` and `static` green; `test:unit` 489 files, 7604 passed; `test:api` 1138 passed, 6 skipped; `test:e2e:full` 769 of 773, 4 skipped, 0 failed, 0 flaky (parallel 1420 s, queue 2153 s, solo 623 s); `test:e2e:matrix` 158 of 174, 16 skipped, 0 failed. The first `test:unit` and `test:api` runs died at start with `EACCES` on two root-owned `node_modules/.vite-temp` folders (`apps/api`, `packages/domain`, dated 2026-11-12) in the main stack's volumes; a `chown` to uid 1000 inside the tools container fixed it and both were run again.
- **The one review, read-only, on `8a214062`:** no blocker. Should-fix: reactivation revives the kept sessions of a paused or removed user; a reactivated user may hold a removed role; production boots with `EMAIL_PROVIDER=fake`. Notes: a fill-only role can take a relatório out of Emitido; the first-pull engine drops merge notices on a re-sign-in; the 10 s cut can move a cursor back; stale comments.
- **Decisions, Matheus, 2026-11-22:** four old test lists may gain the story's entries ("sim"); pause and remove keep the user's sessions so the device shows the paused banner ("corrija"); leaving Emitido needs `relatorio.issue`, and a role with `export.download` gets a direct download on an issued relatório ("sim nos dois"); one deploy carries Epics 26 and 27 together ("tudo junto"); Epic 27 wave 2's own full gate folds into one shared final gate ("pode ficar so no teste final compartilhado").
- **Fix batch e26r** (branch `e26r-review-fixes`): the review's fixes and the two decisions above; reactivate ends the user's sessions; production refuses the fake mailer, and `EMAIL_PROVIDER` and `EMAIL_FROM` enter `infra/production/ecs.tf`.
- **Before the deploy:** e26r and Epic 27 wave 3 on main; one shared full gate and matrix and one hands-on pass as each of the five roles on that main (whoever merges last launches the gate); Story 26.7's DKIM records at the registrar, the SES identity verified, the sandbox exit; then the deploy on Matheus's word.

