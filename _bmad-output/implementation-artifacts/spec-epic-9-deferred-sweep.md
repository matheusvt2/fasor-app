---
title: 'Epic 9 carry-over C2: deferred-work sweep of earlier epics'
type: 'chore'
created: '2026-09-28'
status: 'in-review'
baseline_revision: '2abf8db19201f12c644b89ce4b2f707dff33b163'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Batch C2 of Epic 9: thirty small, independent hygiene fixes from the (a) triage list of epic-9-context.md, each a few lines plus its test, batched to pay one review and one gate.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** `deferred-work.md` carries about fifty open entries from Epics 1 to 8 that an agent can close (epic-9-context.md, "Triage of the other open deferred-work.md entries", lists (a) and (b)). Each was re-checked in code on 2026-09-28; the ones that still hold are listed below as items A1-A14 (api, server, fixture, docs) and B1-B16 (web, kernel, service worker).

**Approach:** Fix each item in the smallest change that closes it, with a test that fails without the fix. Items are independent: one item's failure never blocks another. An item that turns out to be a product choice or more than about a day is left unfixed and reported with a one-line reason (the orchestrator re-owns it in the ledger). The orchestrator, not the implementer, edits `deferred-work.md`.

## Boundaries & Constraints

**Always:** Docker only (`docker compose --profile tools run --rm tools pnpm ...`); narrowest suite per item (`pnpm test:unit <path>`, `pnpm --filter @app/api exec vitest run <file>` with `docker compose up -d postgres minio` first, one Playwright spec with `--grep`). Ownership rules of AGENTS.md: derived text in `packages/domain`, static copy in `apps/web/src/copy/pt-br.ts` (new copy marked `// authored:`), web renders from IndexedDB and writes ops only. Code and comments in English, no emoji. `tokens.css`/`components.css` byte-identical.

**Never:** Touch the entries or files owned by parallel batches: C1 (`apps/web/src/db/snapshot.ts` incremental snapshot, `packages/domain/fixtures/porto-seguro/data.ts`, `relatorio/pre-issue.ts` calibration/certificate/`unpaired_cable`/`cert_number_mismatch` rows, `jobs/generate/toc.ts`, the section 9 page break in `docx.ts`'s sections loop, `db/file-store.ts` crop eviction and re-download, `plate-photo.tsx`'s `PlateCrop`, Home layout in `app.css`); K (`apps/api/src/jobs/reading/kinds/*` handlers, `surfaces/photos/gallery-surface.tsx`, `caption-composer.tsx`); P (`surfaces/relatorio/block-palette-field.tsx`). No `CONTRACT_VERSION` bump, no new op family, no Dexie schema version bump, no edit of `sprint-status.yaml`, `epics.md` or `deferred-work.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A12 EXIF photo | JPEG original with EXIF orientation 6 | `thumb` and `print` are upright (width/height swapped vs raw pixels), no EXIF; the reading image equals the `print` bytes, not rotated a second time | sharp failure: unchanged (logged, file stays without variants) |
| B2 overlapping commits | two `commitBatch` puts on one path started together | the second op's `prev_op_id` is the first op's `op_id` | none |
| B6 two users | user A holds (backlog), user B signs in with empty outbox | A's pin stays; the waiting worker is not activated while A holds | unreadable sentinel: served as unheld (as today) |
| B14 missing file | 409 `not_caught_up` naming a file with no pending upload here | no further retries; failed state names the count | op still missing: retries as today |
| B15 remove sheet | project has a relatório this device never pulled | block tombstoned, equipment left live | none |

</intent-contract>

## Code Map

- `apps/api/src/http/preview.integration.test.ts:291`, `generate.integration.test.ts:591` -- existing cross-tenant asserts; POST `/api/relatorios/:id/preview` by company B has none (A1).
- `apps/api/src/db/seed.ts:106` `projectUser`, `:237` `seedStandardTemplate`, `:329` `revokeSessions` -- A2, A6, A9; `sync/apply.ts:470` `applyOps`, `applyServerBatch` with `deps.before(tx)` run under `lockCompany` (the pattern `http/files.ts:177` `emitServerOp` uses with a sentinel error).
- `apps/api/src/http/app.ts:113` `http_request` log with `relatorio_id` from `c.get('relatorioId')`, set in `sync/routes.ts:117` and `http/generate.ts:278,324`; `log.ts` -- A3.
- `apps/api/src/db/migrate.ts` (`migrate`, `migrationsFolder`); `auth.integration.test.ts:167` only counts applied rows -- A4.
- `scripts/seed-users.ts` (flags, USAGE), `apps/api/src/db/test-fixtures.ts:52` `seedPortoSeguroSmall`, `db/seed-cli.integration.test.ts` -- A5.
- `apps/api/src/sync/apply.ts:218` `mergeTarget` loads every live registry row -- A7.
- `packages/domain/src/ops/apply.ts:252` `createRow`, `:339` create path; `sync/apply.ts:402` `isPermanentRefusal` -- A8.
- `packages/domain/fixtures/porto-seguro/op-log.ts:298` `dataQueue`, `:453` per-block zip; `data.ts:41` `Instance` (read only) -- A10.
- `apps/api/src/jobs/generate/docx.ts:208-218` header with logo -- A11.
- `apps/api/src/storage/variants.ts` `render`, `renderVariants`; `jobs/reading/image.ts` `readingImage`, `exifOrientation`; `jobs/reading/job.ts:181-182` -- A12.
- `apps/api/src/jobs/reading/worker.ts:73` `ensureReadingQueue`, `:143` `failDeadReading` -- A13.
- `_bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/.working/extract-raw-sources.md:308` -- A14.
- `apps/web/src/state/session.tsx:59,307` `dismissReAuth` (no caller), `state/sync.tsx:205-211` pause/resume effect -- B1.
- `apps/web/src/db/commit.ts:98` `commitOps`, `:122` `lastAppliedOpId`, `:152` `buildBatch`; `byClientTsThenOpId` also in `db/sync-store.ts:34`, `db/generate-store.ts:88` -- B2.
- `apps/web/src/components/chip.tsx:77` `FilterChipGroup`; keyboard contract to mirror: `components/segmented-control.tsx:30-39,61` -- B3.
- `apps/web/src/components/toast.tsx:40` Escape handler -- B4.
- `apps/web/src/surfaces/registries/registries-surface.tsx`, `instrumentos-tab.tsx`, `instrument-row.tsx`, `fabricantes-tab.tsx`, `classes-tensao-tab.tsx`, `registry-tab-placeholder.tsx` (no tests) -- B5.
- `apps/web/public/sw.js` (sentinel `HOLD_CACHE`/`HOLD_KEY`, `cacheHolding`, `activate-shell`), `apps/web/src/sw/register.ts:80` `currentShellEntry`, `:95` `holdShell`, `vite.config.ts` `shellPrecache()` digest; tests `sw/sw-lifecycle.test.ts`, `sw/register.test.ts`, `e2e/shell.spec.ts` -- B6, B7.
- `apps/web/src/db/home-store.ts:33` `rows` drops unparsable rows; `surfaces/templates/templates-surface.tsx:94-127` empty state -- B8.
- `apps/web/src/db/sync-store.ts:182` `companyDownloaded` -- B9.
- `packages/domain/src/home/cards.ts:266` `templatesSubline(count)` and its caller -- B10.
- `packages/domain/src/templates/compose.ts:329-373` section functions by index; callers in `surfaces/templates/` -- B11.
- `apps/web/src/components/quantity-stepper.tsx:55-104` in-flight guard -- B12.
- `surfaces/templates/section-text-dialog.tsx:72`, `surfaces/relatorio/section-text-surface.tsx:191` lowercase `SECTION_VARIABLE_LABELS` in web -- B13.
- `apps/web/src/surfaces/export/use-generate.ts:80,314` blind retry; `notCaughtUpDetailsSchema` in the contract -- B14.
- `apps/web/src/surfaces/relatorio/tree-actions.ts:285-305,465` `removeBlock`/`removeSheetOps`; company summaries carry `project_id` (`contract/sync.ts:49`), `db/sync-store.ts` `companySummaries` -- B15.
- `apps/web/src/surfaces/ficha/plate-photo.tsx:107` `FailedReading` (`asking` in component state); `db/prefs.ts` -- B16.

## Tasks & Acceptance

**Execution (Part A, api/server/fixture/docs):**
- A1 `apps/api/src/http/preview.integration.test.ts` -- assert company B's POST preview answers 404 -- closes the cross-tenant sweep (ledger line 51); every other route already has one.
- A2 `apps/api/src/db/seed.ts` -- `revokeSessions` also deletes that user's rows whose `company_id` is null; integration test inserts such a row and re-seeds.
- A3 an api integration test -- spy `console.log`, call `GET /api/sync/relatorios/{id}` and a generate route, assert the `http_request` line carries that `relatorio_id`.
- A4 `apps/api/src/db/migrate.integration.test.ts` (new) -- `migrate()` on a scratch database created and dropped by the test: every journal entry applied, a second run applies nothing and does not throw.
- A5 `scripts/seed-users.ts` -- `--sample-relatorio` seeds the small Porto Seguro fixture onto the named company through `seedPortoSeguroSmall` (fixed ids: documented as one company at a time); USAGE and the header comment updated; CLI integration test.
- A6 `apps/api/src/db/seed.ts` `projectUser` -- decide create vs name-put again under the company lock (the `before` hook of `applyServerBatch`, a sentinel error that recomputes once); test: two concurrent `seedUser` on a fresh company log exactly one `user/{id}` create.
- A7 `apps/api/src/sync/apply.ts` `mergeTarget` -- filter by `row->>'kind'` in SQL; keep the JS check; existing merge tests stay green plus one same-name-other-kind no-merge test if absent.
- A8 `packages/domain/src/ops/apply.ts` -- a create whose `value.id` differs from the path id is a permanent refusal (an error `isPermanentRefusal` recognizes, e.g. a ZodError-shaped refusal or `SeedPathError`); kernel test plus a server-emitter test via `applyServerBatch` or `applyOps`.
- A9 `apps/api/src/db/seed.ts` `seedStandardTemplate` -- no second template when the seeded one was renamed (a live template with non-null `seed_version` counts as seeded), and the existence check repeated under the company lock; tests for rename and for two concurrent runs.
- A10 `packages/domain/fixtures/porto-seguro/op-log.ts` -- per instance, assert its data fits its block type (nameplate keys exist in the type's definition; `contact`/`rc` only on types with those tests; `ratio` only on ratio types; `isoRows` length within the table's rows); throw with the instance index and type. Unit test with a misfit instance through the exported check.
- A11 `apps/api/src/jobs/generate/docx.ts` -- with a logo, the header is a two-cell borderless table (logo left, title and form lines right); without a logo the header is unchanged (goldens unchanged). Test on the DOCX XML; render one PDF page with a logo and look at it; report as an open question for Bruno (R-009).
- A12 `apps/api/src/storage/variants.ts`, `jobs/reading/image.ts`, `jobs/reading/job.ts` -- variants auto-orient (`.rotate()` before resize); the job stops re-orienting (the print is upright), so a plate is rotated once. Tests on an EXIF-6 fixture: variants upright; `readingImage` of that print is not rotated again.
- A13 `apps/api/src/jobs/reading/worker.ts` `ensureReadingQueue` -- after giving the queue its dead letter, set it on the queue's live jobs that lack one (`pgboss.job`, states created/retry/active); integration test: job sent before, dead letter present after.
- A14 `extract-raw-sources.md:308` -- strike the "all C/NC/NA cells are blank" sentence (`~~...~~`) and add the dated correction beside it citing `packages/domain/fixtures/porto-seguro/data.ts` header.

**Execution (Part B, web/kernel/service worker):**
- B1 `apps/web/src/state/session.tsx` -- remove the unused `dismissReAuth` (and from test mocks), so nothing can clear `reAuthRequired` but a new sign-in and the engine never resumes on a dismissal.
- B2 `apps/web/src/db/commit.ts` -- build and apply a batch inside one Dexie rw transaction over every table `buildBatch` reads (entities, outbox, remote_ops, local_prefs), so overlapping commits chain; one shared `byClientTsThenOpId`. Test with two concurrent commits on one path.
- B3 `apps/web/src/components/chip.tsx` -- grouped FilterChipGroup: arrows (and Home/End) move focus and selection together, wrapping, as SegmentedControl; test with keyboard.
- B4 `apps/web/src/components/toast.tsx` -- Esc on the toast returns focus to the element focused before focus entered the toast, else `main`; test.
- B5 `apps/web/src/surfaces/registries/registries-surface.test.tsx`, `instrumentos-tab.test.tsx` (new) -- tab switching and each tab's list/empty state/add entry; the instrument row's code, due-date state and panel opening.
- B6 `apps/web/public/sw.js`, `src/sw/register.ts` -- the pin is per user (`hold-shell` carries the user id; the sentinel keeps one entry per holding user; `hold: false` clears only that user); `activate-shell` is refused while another user holds; lifecycle tests for two users.
- B7 `vite.config.ts`, `index.html`, `public/sw.js`, `src/sw/register.ts` -- the shell version digests every emitted file's bytes (index.html included) and is stamped into index.html (a meta); the page names its build by that version, and the worker pins `releng-shell-<version>`, so a markup-only deploy is a new shell and `import.meta.url` no longer names the build (closes ledger 321 and 327). Old `{entry}` sentinels still read. Tests: plugin digest changes when only index.html changes; lifecycle pin by version.
- B8 `apps/web/src/db/home-store.ts`, `templates-surface.tsx` -- a live template record that fails the schema is logged (`console.warn`) and still counts for the empty state, so "Criar template padrão" is not offered; test.
- B9 `packages/domain` -- the rule "the company stream has been pulled to the end once" as a kernel function over the sync row; `companyDownloaded` reads through it; kernel test.
- B10 `packages/domain/src/home/cards.ts` and caller -- the Home Templates count excludes archived templates, the same count as "Templates (n)"; test.
- B11 `packages/domain/src/templates/compose.ts` and composer callers -- section actions take the section captured at press time and resolve its current index at write time (a pull that reordered sections acts on the same section; one that removed it does nothing); kernel tests.
- B12 `apps/web/src/components/quantity-stepper.tsx` -- when the last in-flight write settles and the value changed since the write started (a pulled value), show it; test with a mocked commit.
- B13 `packages/domain` + both surfaces -- the chip's label text comes from a kernel function (`sectionVariableChipLabel`), no lowercasing in web.
- B14 `use-generate.ts` + export dialog -- a `not_caught_up` whose `missing_op` is null and whose `missing_files` hold no pending upload of this device fails at once, and the failed state adds the kernel line "1 arquivo ainda não chegou ao servidor" / "N arquivos ainda não chegaram ao servidor" (authored); unit test.
- B15 `packages/domain` + `tree-actions.ts` -- the equipment is freed only when no other live block references it AND every other relatório of the project listed in the company summaries is on this device; kernel test of the rule.
- B16 `apps/web/src/surfaces/ficha/plate-photo.tsx`, `db/prefs.ts` -- the "Tentar novamente" press records the photo's current `reading_status_op_id` in `local_prefs`; after a reload the button stays disabled with its asked reason while that op id is current; test.

**Acceptance Criteria:**
- Given each item above, when its new test runs without the item's change, then it fails; with the change, it passes (the implementer reports one line per item: test name and result, or "not done: reason").
- Given the whole batch, when `pnpm verify` and `pnpm test:e2e:full` run under the host lock, then both are green.
- Given B6/B7 (shell mechanism), when the fix is reverted in the working tree, then its lifecycle test goes red (mutation run reported).

## Design Notes

A12 order: sharp's `.rotate()` with no argument applies EXIF orientation and drops the tag; put it before `.resize` so `fit: inside` sees upright dimensions. Photos uploaded before the fix keep sideways variants on dev volumes only (no production data).

B7 sketch: the digest input is the sorted list of `path + sha256(bytes)` of every emitted file with index.html's version placeholder in place; the placeholder is then replaced in index.html and in `sw.js`. The worker's cache name already carries `SHELL_VERSION`, so pinning a version is `caches.has(SHELL_PREFIX + version)`; a version with no cache yet stays network-first, as an entry with no cache does today.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit <path>` -- per web/kernel item.
- `docker compose --profile tools run --rm tools pnpm --filter @app/api exec vitest run <file>` -- per api item (Postgres and MinIO up).
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- once per part.
- `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify` -- expected green (orchestrator).
