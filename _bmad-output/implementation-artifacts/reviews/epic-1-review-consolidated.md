# Epic 1 review: consolidated input for the retrospective

Date: 2026-09-22. Scope: `main` at `00de851`, Stories 1.1-1.8, PRs #1-#8.

Sources, each run independently and without seeing the others:

- [epic-1-review-fable.md](epic-1-review-fable.md): code review, model fable.
- [epic-1-review-opus.md](epic-1-review-opus.md): code review, model opus.
- [epic-1-review-sonnet.md](epic-1-review-sonnet.md): code review, model sonnet.
- [epic-1-qa-playwright.md](epic-1-qa-playwright.md): hands-on QA in a real browser through Playwright, model opus, on an isolated stack. It ran 34 checks: 23 pass, 7 partial, 3 fail, 1 not testable. Its 53 screenshots are in `qa-epic-1/`.

The code reviewers read the code and ran lint, static and the unit tests. The QA agent used the product at 390, 768 and 1280 px, in both themes, offline and with services stopped. Where a code reviewer's claim was reproduced in the browser, it is marked **confirmed in browser**.

## Verdict

All four accept the epic as a solid foundation.

- The kernel is the real single source of truth: one reducer on both sides and a byte-equal replay golden.
- Sync semantics are strict and tested against a live Postgres.
- Architecture boundaries are enforced by lint.
- axe-core found zero WCAG AA violations on every surface, in both themes.

Before Epic 2 starts, the reviews converge on five blockers:

1. The identity seam.
2. The volatile service-worker hold, **confirmed in browser**.
3. The pending iPad proof.
4. `device_id` in committed ops.
5. A small UI hygiene pass.

## What went well (consensus of three or four sources)

1. **One log, one reducer.** `applyOp` is shared by Dexie and Drizzle. A three-way replay golden holds on the kernel, Dexie and Postgres. Rebase, dead-op exclusion and "Reenviar" all go through one `materializeEntity`. (fable, opus, sonnet)
2. **Strict per-op push validation.** Push checks shape, origin (`op_server_only`, `device_id = server`, `system:*`), actor, tenant and tenant-scoped dedupe. An advisory lock keeps `seq` monotonic. Two-company isolation also holds in the browser: company B sees nothing of A, a foreign relatório gets 404, and an op with A's `company_id` gets `op_tenant_mismatch`. (all four)
3. **Mechanical boundaries.** Lint enforces import direction, where `fetch` may appear and where Dexie may appear. Tests also guard byte-identical mock CSS, migration drift, determinism and the codename. (fable, opus, sonnet)
4. **Honest durability work.** The shell precache is all-or-nothing. The FR-54 scenarios are genuine on Chromium. Limitations are annotated, not hidden. Drafts are never applied silently. The manual script refuses to claim a result. In the browser, the offline cold open, draft recovery, the 5-day banner, eviction recovery and the re-auth banner all work. (all four)
5. **Fast gate, traceable process.** `pnpm verify` runs in about 4 minutes, and every PR carries its output. Every spec keeps a triage log with a reason for each rejection. Code comments cite the AD they satisfy. (fable, opus, sonnet)
6. **The independent review paid for itself.** Every UI or security story had at least one medium or high finding that the internal 4-layer review missed or patched wrongly, and all were fixed with tests before merge. Examples: Combobox `aria-disabled`, 5xx shown as "Senha incorreta", the Host-header trust, cross-tenant dedupe, the Tema keyboard, the SW hold, the dead-end eviction screen. (fable, opus, sonnet)

## What went badly

### Found by several sources

| # | Problem | Sources | Evidence |
|---|---|---|---|
| B1 | **The PRD Q0 manual proof on iPad and Android never ran, yet `epic-1: done` is recorded.** The epic itself says this proof gates Epics 5 and 6, the slice platform line and the 500 MB threshold. It is also the only coverage for Safari's offline reopen, the Secure cookie over HTTPS and the Tema keyboard on iPadOS. | all four | `test-artifacts/manual/offline-proof-script.md:3` (PENDING) |
| B2 | **Identity and kernel disagree on id shape.** Identity user ids are text slugs (`seed-user-<slug>`), but the kernel `user` entity, `responsible_user_id` and `user/{id}/{field}` all expect uuidv7. No user row ever reaches a device. The seed CLI accepts a v4 company id (its own example is v4), while `opSchema` requires v7, so a company provisioned as documented can never sync. In the browser: Sync status lists `seed-user-a-teste-local`, and the eviction screen says "0 pessoas da equipe". | opus (users), fable (companies), sonnet (op family with no writer), QA **confirmed in browser** | `db/seed.ts:38-40`, `entities.ts:141-147,184`, `company-id.ts:16-21`, `seed-users.ts:21`, `op.ts:30`, QA D-6 |
| B3 | **The SW hold-shell flag lives only in worker memory.** When the browser stops an idle worker, the next launch is served network-first, so a new build activates while ops are still pending. That is the version flip AD-8 forbids and that the PR #8 review patch was meant to stop. | opus (code); QA **reproduced it** (D-1, High) | `public/sw.js:37,119`; QA D-1 steps |
| B4 | **The registration save bypasses the op log.** It is a `PUT /api/account/registration`, which AD-1 does not list as an allowed named action. So editing the professional registration offline is impossible, in an offline-first epic. | sonnet, fable, opus | `api/auth-client.ts:139-157`, `registration-dialog.tsx:64` |
| B5 | **Pre-1.2 surfaces still hand-roll markup** next to the shared components. `RegistrationDialog` has a second radiogroup with no arrow keys, the same bug class as the PR #7 high finding (QA D-10: two Tab stops). `SignOutDialog` is a second confirm dialog. Login uses raw buttons. The shared `ConfirmDialog` documents `aria-modal` but never sets it. Seven of the 13 shared components have no production caller. | fable, opus, sonnet, QA | `registration-dialog.tsx:103-118`, `sign-out-dialog.tsx:34-62`, `confirm-dialog.tsx:20-49`, `login-surface.tsx:102-127` |
| B6 | **Toggle, Checkbox and grouped FilterChip never show their on state.** This has been open since 1.2 and has no owner. The fix pattern is proven on `SegmentedControl`. Epic 2 forms and the Epic 3/5 checklists are the first consumers. | fable, opus, sonnet | `toggle.tsx:11-25`, `checkbox.tsx:8-17` |
| B7 | **The gate is not deterministic and narrower than the test design.** Opus saw 2 of 3 `test:unit` runs fail on the 5 s default timeout, in different files. `test:unit` writes to Postgres through the seed CLI. All 21 e2e tests are `@p0`, so the filter selects nothing. `pnpm audit`, coverage floors and the three-browser matrix are not in `verify`. The main checkout's `tools` image lacks WebKit. There are two reset mechanisms. | opus, fable, sonnet | `scripts/tooling.test.ts:91`, `package.json:9-21`, `scripts/test-reset.ts:11` vs `db/seed.ts:172` |
| B8 | **Debt bookkeeping is off.** `deferred-work.md` has 2 entries; the specs carry 34 to 36 `deferred` items, and about a third are already closed without being marked. `AGENTS.md` "Running and verifying" is still a TODO that names a `pnpm test` script that does not exist. Seven of 8 specs carry the `oversized` warning. | fable, opus, sonnet | `AGENTS.md:30-38`, spec frontmatter |
| B9 | **Small AD-2 leaks.** The status words are defined twice, in the kernel and in `copy/ui.ts`, with different keys. There is a shadow `RelatorioStatus` type. Plurals and counts are built in `apps/web`. The auto-pull status rule sits in `sync/engine.ts:214`. `applyOps` and `toSnapshot` take a plain `string` instead of the branded `CompanyId`. | fable, opus | `copy/ui.ts:26-31`, `status/table.ts:16-21`, `status-pill.tsx:3`, `sync/apply.ts:174` |

### Found only in the browser (none of the three code reviews saw these)

| # | Defect | Severity | QA ref |
|---|---|---|---|
| U1 | The Home Status board overflows sideways by 120 px at 390 px width and at 200 % zoom. The four tiles stay in one row, while the mock draws 2x2. This fails WCAG 1.4.10 reflow. | High on phone | D-2 |
| U2 | Both dialogs (Registro profissional, Sair) render in Times New Roman with unstyled native inputs, because React Aria portals the overlay outside the element that carries the font and field styles. | Medium | D-4 |
| U3 | The `online` event does not start a sync cycle; pending ops wait for the next 60 s tick (42-46 s measured). The likely cause is a race with `onlineRef` in `state/sync.tsx` (hypothesis, not verified). | Medium | D-3 |
| U4 | Login messages mislead. With the database down, it says "Sem conexão" while the device is online. An empty form or a malformed e-mail gets "Senha incorreta". | Medium | D-5 |
| U5 | The badge reads "Sincronizado" while the api is down or the session has expired. | Low | D-9 |
| U6 | The PRODUTO wordmark and the avatar render as default browser links: blue or visited purple, underlined. | Low | D-7 |
| U7 | The draft toast has no dismiss control, and an info banner duplicates it. The AC says dismissing must keep the draft, which cannot be exercised. | Low | D-8 |
| U8 | Account and Sync have no back chevron. `<title>` is "PRODUTO" on every route (WCAG 2.4.2). `favicon.ico` returns 404. The phone badge says "OK". "Sair mesmo assim" appears when nothing is pending. | Low | UX section |

The code reviewers missed a phone overflow, unstyled dialogs and a broken `online` trigger, all visible in the first minutes of real use. Human-style browser testing is not optional (see memory rule `human-style-e2e-testing`).

### Setup friction a new developer hits (QA)

1. `README.md` still describes a "Protótipo" and says "laudos". Nothing explains how to start the stack, seed a user or run `verify`.
2. Caddy answers "Not found" until `apps/web/dist` is built by hand, yet `docs/tablet-https-setup.md` says it "should load".
3. The prod-profile doc tells you to run `pnpm` on the host, against the Docker-only policy.
4. The desktop browser shows a certificate error at the Caddy origin and the SW does not register. The doc only covers installing the CA on tablets.
5. `seed-users.ts` makes the operator invent a company UUID, and its usage text lives only in the script header.
6. No relatório can be created from the UI, so demos and QA need hand-crafted ops. A seed flag for sample relatórios would help.

## Findings unique to one code reviewer (worth a decision)

- **opus:** a 401 at boot clears the `releng.last-session` pointer, so the next offline cold open lands on Login and local work cannot be reached. That is a second, inconsistent 401 path.
- **opus:** the default `SESSION_SECRET` is tracked in `docker-compose.yml` and also used by `api-prod`. It must be refused outside dev.
- **fable:** better-auth rate limiting is off because `NODE_ENV` is unset. The Vite dev port 5173 is published on all interfaces. There are no security headers and no body limit on `/api/sync/ops`. None of this matters on the office LAN; all of it is mandatory before any wider exposure.
- **fable:** `409 file_row_missing` is not retryable in `classifyFailure` yet. Epic 6 needs it.
- **sonnet:** Story 1.7's CI acceptance criterion was never struck through to match the no-CI decision.

## Process lessons (for the retrospective discussion)

1. **Patches written by the subagent that wrote the bug were wrong twice:** the 5xx boundary in 1.3 and the keyup commit in 1.6. In 4 of 5 independent catches, the internal review had fixed a related issue in the same area and missed a sibling. Proposal: the independent review must re-examine the patch itself, not only the original diff.
2. **Library semantics were assumed, not probed.** React Aria props, the portal context and the SW lifecycle were taken on faith. Proposal: every UI or SW story gets a hands-on browser pass, as in the QA run, before merge.
3. **Model and effort fit.**
   - fable/high fit 1.4 and 1.5 well.
   - opus/high fit 1.8.
   - Too low, per two reviewers:
     - sonnet/high on 1.2, where React Aria DOM shapes were the hard part;
     - opus/medium on 1.3 and 1.6, which carried security and keyboard a11y weight;
     - sonnet/medium on 1.7, which shipped a static server with a traversal guard untested in its first pass.
   - Proposal: opus/high as the floor for component-library, a11y-keyboard and security-adjacent stories.
4. **Stories run in parallel with 1.2** (1.3, 1.4, 1.7) shipped their own markup, which no later story ported. Cross-story contracts (user ids, device ids, reset scripts, dialogs) were never reconciled.
5. **PR #1 had no independent review.**
6. **Deferrals are recorded carefully and never closed.** Several ACs were written against artifacts of later epics, which forced deferrals by construction.
7. **The epic was marked `done` with its own DoD item (the device proof) pending.**

## Consolidated action items (prioritized)

| # | Action | Owner | Found by |
|---|---|---|---|
| A1 | Run the manual iPad and Android offline proof over the 1.7 origin. File `ipad-YYYY-MM-DD.md`, set the platform line and the storage threshold. Until then record epic 1 as "done pending Q0". | Matheus (manual) | all four |
| A2 | Decide the identity model: uuidv7 user and company ids, validated in the seed CLI with a v7 example, and a `user/{id}` create projected into the company stream. Convert the registration save to a `user/{id}/{field}` op and route account reads through the contract. | Architecture, then first story | opus, fable, sonnet, QA |
| A3 | Persist the SW hold flag (a Cache Storage sentinel or IndexedDB) and test the worker-restart lifecycle. Re-run QA D-1. | Architecture + follow-up story | opus, QA |
| A4 | Add the minted `device_id` to `CommitDeps` / `commitBatch` and drop the user-id fallback in the fixture. | Next story (before any Epic 2 op emitter) | fable, opus, sonnet |
| A5 | UI hygiene story before Epic 2 UI. Items: Home 2x2 grid on phone and 200 % zoom (U1); dialog portal styles (U2); `online` event triggers a cycle (U3); login messages (U4); port Login, RegistrationDialog and SignOutDialog onto the shared components; `ConfirmDialog` `aria-modal`; Toggle, Checkbox and FilterChipGroup on-state; wordmark link styles; draft toast dismiss; back chevron; per-route `<title>`; favicon. Each fix gets a browser check. | Next story (opus/high) | QA, all three reviewers |
| A6 | Stabilize and widen the gate: raise `testTimeout` for the jsdom and tooling tests, move DB-touching tests out of `test:unit`, retag e2e by real priority, add the emoji and `laudo` scans and `pnpm audit` (or record why not), rebuild the `tools` image, keep one reset mechanism. | Process | opus, fable, sonnet |
| A7 | Move the status words, plurals, counts and auto-pull rule into the kernel. Brand `applyOps` and `toSnapshot` with `CompanyId`. Write down where a new string goes. | Architecture | fable, opus |
| A8 | Make the boot-time 401 keep the `last-session` pointer, matching the in-session 401 path. | Next story | opus |
| A9 | Docs: `README.md`, `AGENTS.md` "Running and verifying", the prod-profile doc Docker-only, the dist build before Caddy, the desktop CA, seed usage, a sample-relatório seed flag. Strike 1.7's CI AC through. | Process (bmad-project-context) | QA, all three reviewers |
| A10 | Ledger: merge every spec `deferred` item into `deferred-work.md` with a class, close the resolved ones, make "every new route gets a cross-tenant case" a DoD line. Record coalescing option (b) as the decision and close it. | Process | fable, opus, sonnet |
| A11 | Pipeline: an independent review on every PR, re-examining its own patch; a mandatory hands-on browser pass for UI and SW stories; opus/high as the floor for a11y, component and security-adjacent stories; recalibrate spec size. | Process (`bmad-build.toml`, model guide) | all four |
| A12 | Before any exposure beyond the office LAN (Epic 11 checklist): rate limiting, security headers, Vite bound to 127.0.0.1, a push body limit, and refuse the default `SESSION_SECRET` outside dev. | Architecture | fable, opus |
