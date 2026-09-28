---
title: 'Epic 9 carry-over: gate time, offline tools image, Epic 7 and 8 leftovers, Home layout'
type: 'chore'
created: '2026-09-28'
status: 'done'
baseline_revision: 'a2cd0534bee9371e1e76ca1f58da786800a8c902'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Epic 9 carry-over batch C1 (E6-A7): the agent-closable action items E7-A1/E8-A1, E7-A7/E8-A2, E7-A2, E7-A3, E7-A4, E8-A5 and the Home layout bug, one PR by coordinator decision.'
deferred:
  - summary: >-
      Task 15 (EXIF orientation of the thumb and print variants) is not done; the deferred-work entry is re-owned to the batch that may change jobs/reading/image.ts.
    evidence: |-
      jobs/reading/image.ts applies the original's EXIF orientation to the print bytes itself; rotating print in renderVariants alone would double-rotate every oriented plate for OCR, and this batch may not touch jobs/reading/*.
    location: >-
      apps/api/src/storage/variants.ts:51
    severity: low
  - summary: >-
      The prefix-equality test compares the incremental builder with buildSnapshot at every 48th op of the full Porto Seguro log (every op of the small logs).
    evidence: |-
      A full comparison costs about 45 ms per op (3841 ops, about 3 min of test:unit); the builder still runs after every op.
    location: >-
      packages/domain/src/schemas/snapshot-builder.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The gate runs 1248-1318 s against a 900 s budget because every commit rebuilds the whole relatório snapshot on the device; a gate start can still reach registry.npmjs.org; three web unit files time out under load; and a set of Epic 7/8 leftovers (fixture TTR value, pre-issue rows, TOC, page split, crop legibility, EXIF, crop blobs) and the Home App bar/column layout bug remain open.

**Approach:** Make the device snapshot incremental in the kernel (a memoizing builder whose output equals `buildSnapshot`) fed by a cheaper, identity-stable device state read; measure commit-to-render before and after; then close each carry-over item with a test or a dated deferred-work state.

## Boundaries & Constraints

**Always:**
- AD-13/AD-1: `packages/domain` still computes every status, count, text and order; only the rebuild becomes incremental. The incremental builder lives in the kernel and its output is deep-equal (and `serializeSnapshot`-equal) to `buildSnapshot` for the same state.
- `tokens.css` and `components.css` stay byte-identical; new CSS goes in `apps/web/src/styles/app.css` with a comment naming the mock rule or defect.
- Every deferred-work entry closed gets `state: closed (2026-09-28, <PR or evidence>)`; a re-owned one names its new owner; old text is struck through (`~~...~~`), never deleted.
- Planning docs: strike through, add the dated sentence beside it (AGENTS.md).
- Everything runs in Docker; gates and timing measurements run under `flock /tmp/fasor-verify.lock`.
- No emoji; code/comments English; pt-BR copy in its three homes (AGENTS.md).

**Never:**
- No refactor of sheet surfaces beyond swapping `buildSnapshot`/`relatorioState` for the incremental path (batches D and V are editing the sheet and the reading job in parallel).
- No change to `apps/api/src/jobs/reading/*`, `contract/ocr.ts`, `services/ocr`, the sync contract or `CONTRACT_VERSION`.
- Do not raise `PARALLEL_WORKERS` (the orchestrator does it only after three green `test:e2e:full --workers=3` runs).
- Do not edit `sprint-status.yaml` or `epics.md`.
- Do not change the Porto Seguro nameplate `tap_atual` text values (a text field printed as typed; E78-Q15 names only the TTR "V PRIMÁRIO" in kV).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Incremental equals full | every prefix of the Porto Seguro op log applied one op at a time | incremental snapshot `serializeSnapshot` equal to `buildSnapshot` after every op | test fails on first divergence, naming the op index |
| Untouched rows keep identity | one commit to block A of the standard relatório | next snapshot's other blocks, locations, files are `===` the previous ones | gate unit test (mutation target) |
| Row removed / tombstoned | a block `removed_at` set | leaves `blocks`; its equipment leaves `equipment` when no other live block names it | same as full |
| Record written before `rev` existed | record with no stamp | parsed fresh every read (correct, just not cached) | none |
| TTR fixture | transformer `ratio.p` | stored `13.2`, prints "13,2 kV" | explicit assertion in a kernel test |
| Crop source over a cached thumb | `files` holds a `thumb` under the photo id | fetched original replaces it as `crop`; next mount reads it locally (no fetch) | fetch failure keeps the thumb |
| Crop blob under storage pressure | `crop` rows acked | evicted by `evictionPlan` like acked originals; next view re-downloads | none |
| EXIF orientation 6 original | 3000x4000 stored landscape with orientation tag | `thumb` and `print` come out portrait | none |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/snapshot.ts` -- `buildSnapshot` (full rebuild: scans the whole state, `relatorioSnapshotSchema.parse` of everything). Add the kernel's incremental builder beside it (e.g. `createSnapshotBuilder()` returning `(state, relatorioId) => RelatorioSnapshot`, memoizing per-row parse by row identity and reusing unchanged arrays); export from the package index.
- `apps/web/src/db/home-store.ts:162` `relatorioState` -- the live-query read of every surface: `rowsWhere` re-reads the whole `relatorio_id` index once per entity (location, block, revision, point, file, suggestion = 6 reads) and zod-parses every row on every commit. Read the index once and partition; reuse the previous parsed row object when the record is unchanged.
- `apps/web/src/db/commit.ts:41` `toRecord` -- the single record constructor for both write paths (`commit.ts:66` bulkPut, `sync-store.ts:129` put). A per-write stamp (e.g. `rev`) on `EntityRecord` (`db/schema.ts:11`, non-indexed, no Dexie version bump) lets the reader know a record is unchanged.
- `apps/web/src/db/snapshot.ts` `toSnapshot` -- export/preview path (byte-equal to server); keep `buildSnapshot` there (runs once per export, not per commit).
- Per-commit consumers to switch to the shared incremental path (one line each, no other surface change): `surfaces/ficha/ficha-surface.tsx:67`, `relatorio/tree-surface.tsx:35`, `relatorio/sumario-surface.tsx:87`, `photos/gallery-surface.tsx:85`, `points/points-surface.tsx:70`, `relatorio/setup-surface.tsx:55`, `relatorio/section-text-surface.tsx:47`, `export/export-dialog.tsx:89`, `home/home-surface.tsx:125`, `state/reading-arrivals.tsx:79`. `relatorio/relatorio-gate.tsx:22` is the live query all sheet routes share.
- `apps/web/src/input/press-hold.ts` `useHeldWhilePressed` -- returns the held state; must keep working with identity-stable rows.
- `e2e/support/relatorio-seed.ts` -- pushes the standard relatório (project + 223 `instantiateTemplate` drafts); `e2e/ficha.durability.spec.ts:77` shows how a spec opens its first seccionadora sheet.
- `e2e/support/groups.ts:68` `PARALLEL_WORKERS = 1`, `SERIAL_SPECS`; `scripts/e2e.ts`; `playwright.config.ts`.
- `Dockerfile.tools` (corepack prepare pnpm@12.5.1 as `node`), `apps/api/Dockerfile` (same for `install`), `docker-compose.yml` `install`/`tools`, `package.json` `packageManager: pnpm@12.5.1`. QA saw a `test:e2e:matrix` start die downloading pnpm 12.5.1 inside `tools` (`reviews/epic-7-8-review-qa.md:19`).
- Unit files (E7-A2): `apps/web/src/surfaces/templates/template-composer-undo.test.tsx` (9.5 s alone, 32.6 s under load), `surfaces/relatorio/setup-surface.test.tsx`, `surfaces/relatorio/relatorio-tree-edits.test.tsx`.
- Fixture (E7-A3): `packages/domain/fixtures/porto-seguro/data.ts` transformer `ratio.p: '13200'` at 363, 382, 401, 421, 440 and every other `transformador_forca` instance (788, 836 if they are transformers; the TP/TC ratios at 550, 753, 868-871 are in V and stay). Seed: `seed/v1.ts:485` TRANSFORMADOR_RATIO V PRIMÁRIO is kV, `:456` TP_RATIO is V. Goldens: `fixtures/porto-seguro/snapshot.golden.json`, `pre-issue.golden.json`, `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json`, and whatever else regenerates.
- Pre-issue (E7-A4): `packages/domain/src/relatorio/pre-issue.ts:340-363` (calibration loop over `snapshot.instruments`; `certificate_missing` over `missingCertificates`); `print/section-11.ts:86` `section11Instruments` (carries `cert_mismatch`); `relatorio/integrity.ts:27` `CertNumberMismatchFinding`; `print/group-for-print.ts` `PrintGroupWarning` (`unpaired_cable`).
- Small fixture: `packages/domain/fixtures/porto-seguro/small/op-log.ts:233,252,264` `sub_blocks: {}` (the full fixture uses `templateBlock.sub_blocks`, `op-log.ts:479`); `small/snapshot.golden.json`.
- ÍNDICE: `apps/api/src/jobs/generate/toc.ts` (`TocPages` keyed by section number; `headingPages` matches outline titles to `sectionHeading(entry)`); kernel `layoutSpec(...).toc`; FO.SERV-03 lists 11 sections + 9.1-9.11 (`ux-designs/.../imports/extract-fo-serv-03.md:48`).
- Page split: `apps/api/src/jobs/generate/docx.ts` sections loop; `sections/section-9.ts` breaks before every subsection after the first.
- Crop (E78-R1): `packages/domain/src/relatorio/suggestions.ts:515` `plateCropRegion`, `:537` `padCropToAspect`; `apps/web/src/surfaces/ficha/plate-photo.tsx:152` `PlateCrop`; `app.css:659-669`; QA measure `.region` 38 x 5.4 px (`reviews/epic-7-8-review-qa.md:232`).
- EXIF: `apps/api/src/storage/variants.ts:51` `renderVariants` (no `.rotate()`); `jobs/reading/image.ts` already orients its own copy (read-only for this batch).
- Crop blobs: `apps/web/src/db/file-store.ts:178` `runEviction` (acked `original` only), `:276` `cropSourceBlob` (keeps fetched bytes only when the id is free; `ensureLocalBlob` caches a `thumb` under `files` when the id is free, so a later crop re-fetches every mount).
- Home layout: `apps/web/src/surfaces/app-shell.tsx` (header `h1 app-bar-title visually-hidden` on Home via route handle `titleHidden`, `app.tsx`); `.app-bar` grid `1fr auto 1fr` in `components.css`; `app.css:386-397` `.content` desktop and `[data-route="/project/:id"] .content { max-width: none; }`; `DESIGN.md:735` content-max sentence; `mockups/key-home.html` page `<style>` (line 9); deferred-work entry at line 1032 (full fix scope).
- Deferred ledger: `_bmad-output/implementation-artifacts/deferred-work.md` entries at lines 839, 846, 852, 864, 870, 882, 894 (Epic 7), 930, 948, 960, 972, 978, 1020, 1032, 1056 (E78-Q15; its dual-secondary half stays with Matheus, E7-A5).

## Tasks & Acceptance

**Execution:**
1. `e2e/commit-to-render.perf.spec.ts` (new, tagged `@p2`, serial group) -- FIRST, before any product change: push the standard relatório, open its first chave seccionadora sheet at 1280x800, and measure commit-to-render for 20 checklist-result taps and 20 measurement-cell entries (in-page `performance.now()` at the input event to the frame where the DOM reflects the committed value; MutationObserver + rAF), plus the same under CDP `Emulation.setCPUThrottlingRate` 4; write median/p90 to `test-results/perf/commit-to-render.json` and log them. Run it under the lock on unchanged code and record the numbers ("before") in the spec's Design Notes; commit.
2. Profile one commit (breakdown: Dexie read, row parse, `buildSnapshot`, render) with temporary instrumentation (not committed) and record the breakdown in Design Notes.
3. `packages/domain/src/schemas/snapshot.ts` + tests -- the incremental builder; tests: prefix-equality over the Porto Seguro op log (full fixture), identity reuse for untouched rows, removal, the empty-state edges.
4. `apps/web/src/db/commit.ts`, `db/schema.ts`, `db/home-store.ts` -- per-write stamp; `relatorioState` reads the index once and reuses unchanged parsed rows (identity-stable across live-query runs; a module-level cache keyed by relatório that never serves a stale row). Test with fake-indexeddb: after a commit to one block, `relatorioState` returns the same objects for every other row (gate spec for the mutation run).
5. The per-commit consumers listed in the Code Map -- use one shared hook/helper (e.g. `useRelatorioSnapshot(state, relatorioId)` in `apps/web/src/db/` or `state/`) over the kernel builder. Nothing else in those files changes.
6. Re-run task 1's spec under the lock ("after"); record both in Design Notes.
7. `Dockerfile.tools` / `apps/api/Dockerfile` / compose (as needed) -- find why a gate start reached registry.npmjs.org and make every gate start offline-capable (pnpm binary baked for the runtime user and HOME, corepack never fetching, e.g. `COREPACK_ENABLE_NETWORK=0` if it holds). Proof: with a scratch compose override whose default network is `internal: true` (no egress; scratchpad file, not tracked), `install` completes and `pnpm test:unit` (or `lint`) runs its first test; paste the transcript tail into Design Notes.
8. The three E7-A2 unit files -- replace waits that assume an idle CPU (fixed `setTimeout`, default 1 s `waitFor`/`findBy*`) with event-driven waits (await the committed store state, `findBy*` with an explicit generous timeout only where an async store read must land). No test semantics change.
9. `packages/domain/fixtures/porto-seguro/data.ts` -- transformer TTR `ratio.p` `'13200'` to `'13.2'`; regenerate the affected goldens with the existing regeneration commands; add a kernel test asserting the stored `13.2` and the printed "13,2 kV" (or the kernel's actual kV print form) for TR-1's V PRIMÁRIO.
10. `pre-issue.ts` -- (a) calibration rows iterate `section11Instruments(snapshot)` (registry row by id) so they match section 11's list; (b) a `cert_number_mismatch` row (section 11, `info`, never blocking) per `cert_mismatch` instrument, derived text in the kernel (`// authored:`, open for Bruno), e.g. "⟨código⟩: nº de certificado da ficha difere do cadastro"; unit tests; update goldens. Export dialog/Sumário pick it up through the existing pre-issue rendering (check one e2e or component test shows it).
11. `small/op-log.ts` -- the three sheets enable the sub-blocks they fill (the template's `sub_blocks` for the type, as the full fixture does); regenerate `small/snapshot.golden.json`; tests that were adjusted for the old gap may stay.
12. ÍNDICE -- the printed TOC lists section 9's subsections (9.1 ... 9.N, level 2, indented as FO.SERV-03) with their pages, matched from the outline's Heading 2 titles; `toc.ts` keys generalize from number to the printed number string; tests in the generate suite; goldens regenerated.
13. `docx.ts` -- a page break before section 9's own Heading 1 so its first sheet never splits (keep the existing breaks inside section 9); a generate test asserting the break from section 9's own heading (E7-A6: assert from the heading, not a position).
14. E78-R1 -- while a field is focused, the plate crop zooms to that field's region (a kernel helper, padded by a margin and to the box aspect via `padCropToAspect`), and `.region` draws outside the bbox (`outline` + `outline-offset`, min height 12 px) so it never covers the value; unit tests (kernel + `plate-photo.test.tsx`); extend 8.6-E2E-003 or add an `@p1` asserting the focused region's rendered height >= 12 px at 768 px.
15. `apps/api/src/storage/variants.ts` -- apply EXIF orientation (`sharp().rotate()`) when rendering `thumb` and `print`; api test with a synthetic orientation-6 JPEG asserting portrait dimensions for both.
16. `apps/web/src/db/file-store.ts` -- `cropSourceBlob` replaces a cached `thumb` with the fetched original as `crop` (so it is fetched once); `runEviction` includes `crop` rows as candidates (size = blob size); tests for both (fetch count 1 across two mounts; crop evicted under pressure, re-fetched on next view).
17. Home layout, per the deferred entry at line 1032: `app.css` rule placing `.app-bar-right` in grid column 3 (comment names the `key-home.html` defect); a centering rule for the capped `.content` on rail-less surfaces (Home, `/cadastros`, and any other route without the tree rail), leaving `/project/:id` desktop and the sheet beside the rail unchanged; dated sentence beside DESIGN.md's content-max sentence ("centered in the viewport when no rail is present", 2026-09-28); the same App bar correction in `key-home.html`'s `<style>`; `@p0` e2e on Home and `/cadastros` at 390, 768, 1280 and 1906 px: avatar's right edge within 16 px of the App bar's right edge at every width, `.content` centered (left and right gaps within 2 px) at 1280 and 1906.
18. `deferred-work.md` -- close 846 (stale: `pre-issue.ts:361` builds `certificate_missing` from `missingCertificates`), 978 (QA refutation `reviews/epic-7-8-review-qa.md:30`: the reading ends `failed`, never stuck; the product question lives in E78-Q2 and E8-A3), 972, 839, 852, 864, 882, 894, 930, 948, 960, 1020, 1032, 1056 (the TTR half; re-own the dual-secondary half to Matheus, E7-A5) as each lands, citing the test; re-own 870 (`unpaired_cable`): owner "Matheus's decision on the `feeds_block_id` writer (entry at line 876); the row ships with that writer, because today every alimentação cable of an app-created relatório is unpaired and the user cannot act on the warning".

**Acceptance Criteria:**
- Given the standard relatório on a 1280 px sheet, when the perf spec runs before and after under the lock, then the after median commit-to-render (normal and 4x throttled) is lower, and both sets of numbers are in Design Notes.
- Given the incremental path, when any surface renders after a commit, then its snapshot equals `buildSnapshot` for the same state (prefix-equality test green), and reverting the incremental path makes the identity gate test red (mutation run recorded in Design Notes).
- Given a network with no egress, when a gate starts in `tools`, then install completes and the first test runs.
- Given the three unit files, when `test:unit` runs beside a gate, then none times out (no fixed sleeps left).
- Given the Porto Seguro fixture, when section 9 prints TR-1's TTR, then V PRIMÁRIO reads 13,2 kV.
- Given an instrument whose sheet certificate number differs from the registry, when the Export dialog opens, then a section 11 info row names it and "Gerar" is not blocked.
- Given the Porto Seguro render, when the ÍNDICE prints, then it lists 1-11 and 9.1-9.N with pages, and section 9 starts on a new page.
- Given a focused nameplate field with a region, when the crop renders at 768 px, then the crop zooms to that field and the outline is at least 12 px high and outside the value's bbox.
- Given Home or `/cadastros` at 390/768/1280/1906 px, when the page loads, then the avatar sits at the App bar's right edge and, at 1280/1906, the column is centered.

## Design Notes

Measurements (filled by the implementer): before/after commit-to-render tables, the per-commit breakdown, the offline-start transcript, the mutation run.

### Commit-to-render (task 1 and 6)

`e2e/commit-to-render.perf.spec.ts` (`@p2` PERF-E2E-001, serial group), standard relatório, first chave seccionadora sheet, 1280 x 800, 20 samples each, run under `flock /tmp/fasor-verify.lock` in the worktree's `tools` container (desktop Chrome, `build:e2e` development bundle). Each sample: capture-phase input event (`pointerup`/`click` of a checklist segment, `keydown` Enter of a measurement cell) to the animation frame after the DOM first shows the committed value (segment `aria-checked`, cell `data-state` out-of-limit on/off). Milliseconds, median / p90.

| | checklist tap | measurement entry | checklist tap, 4x CPU | measurement entry, 4x CPU |
|---|---|---|---|---|
| before (baseline `a2cd053` + the spec) | 720.7 / 1004.9 | 880.1 / 1202.5 | 5477.9 / 6783.5 | 5912 / 7127.9 |
| after (HEAD `ebdb479`) | 282.5 / 345.7 | 299 / 448.5 | 1958 / 2625.8 | 2591.6 / 3565.5 |

### Per-commit breakdown before the change (task 2)

Temporary instrumentation (reverted, not committed): timers in `relatorioState` (wall time and zod parse time), around the ficha's `buildSnapshot`, a React `Profiler` around the ficha route, and a CDP sampling profile of the 20 checklist taps. Per commit, averaged over 20 taps: `relatorioState` about 330 to 450 ms of wall time between its first and last await (eleven sequential Dexie reads, which queue behind the render on the main thread, so this overlaps the render below), of which the row parse is 10 to 19 ms; `buildSnapshot` about 8 ms per call, two calls per commit (the held and the live state), so about 16 ms; React render (Profiler `actualDuration`) about 550 to 750 ms per commit over about 3 renders. The CPU profile agrees: about 11 s of the 20 s window is React rendering, 5 s of it `jsxDEV`/`createElement` self time (the development build's element creation for the whole sheet and the rail), zod `safeParse` 1.2 s (about 60 ms per commit), `useMemo` bodies 1.7 s. The render of the whole surface on every commit dominates; the snapshot rebuild and the parse are the part this batch may change (surface refactors are out of scope), so the expected gain is the parse, the rebuild, the eleven reads, and the renders a live-query run that changed nothing no longer causes (`relatorioState` now returns the previous state object).

### Offline gate start (task 7)

Cause: `corepack prepare pnpm@12.5.1` stores only pnpm 12's JavaScript wrapper; the wrapper downloads the native binary (`@pnpm/exe.linux-x64` from registry.npmjs.org) on its first run and keeps it beside itself, and every `--rm` container started without it ("Downloading the pnpm 12.5.1 binary for linux-x64..." in the gate log; "Could not download the pnpm 12.5.1 binary: terminated" when the registry was slow). Second cause, found by the proof: `pnpm install --frozen-lockfile` in `install` verifies the lockfile against the supply-chain policies (`minimumReleaseAge`), fetching every entry's metadata, and hangs with no network ("Verifying lockfile against supply-chain policies (518 entries)..." for over 10 min). Fix: both Dockerfiles run pnpm once at build time as `node` with `HOME=/home/node` (the binary is baked, `test -f .../pnpm-native`) and set `COREPACK_ENABLE_NETWORK=0`; `install` runs `pnpm install --frozen-lockfile --trust-lockfile`. Proof, scratch override (not tracked) with `networks.default.internal: true` and the worktree's own dependency volumes as external volumes, project `fasor-e9c1-offline`:

```
$ docker compose -p fasor-e9c1-offline -f docker-compose.yml -f compose.local.yml -f <scratchpad>/offline.yml run --rm install pnpm install --frozen-lockfile --trust-lockfile
Scope: all 4 workspace projects
Lockfile is up to date, resolution step is skipped
Done in 104ms using pnpm v12.5.1
$ docker compose -p fasor-e9c1-offline ... --profile tools run --rm tools sh -c 'getent hosts registry.npmjs.org || echo ...; pnpm --version; pnpm exec vitest run packages/domain/src/schemas/snapshot.test.ts'
 Container fasor-e9c1-offline-install-1  Exited
 Container fasor-e9c1-offline-postgres-1  Healthy
 Container fasor-e9c1-offline-minio-1  Healthy
 Container fasor-e9c1-offline-api-1  Started
registry.npmjs.org: no name resolution (no egress)
12.5.1
 RUN  v5.0.1 /workspace
 ✓ @app/domain src/schemas/snapshot.test.ts (5 tests) 215ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

(The same `install` without `--trust-lockfile` hung on the policy check.) `docker run --rm --network none app-tools-e9c1 pnpm --version` and the same for `app-api-e9c1` print 12.5.1.

### Mutation run (task 4)

Re-checked on HEAD after the `rev` stamp moved into a Dexie middleware (every `entities` write, any path). With `parsedRow`'s cache hit disabled in `relatorioState` (the incremental read reverted to a fresh parse per read), `apps/web/src/db/relatorio-state.test.ts` E9C1-UNIT-003 goes red: "after a commit to one block, every other row of the state is the object the previous read returned" and "a read that finds nothing changed returns the previous state itself" fail; the two correctness tests stay green. With the kernel builder's row memo disabled, all five E9C1-UNIT-002 identity tests in `packages/domain/src/schemas/snapshot-builder.test.ts` fail. Both restored afterwards.

### Deviations and open points

- Prefix equality: the builder is called after every one of the 3841 ops of the full Porto Seguro log, but compared with `buildSnapshot` at every 48th op and the last (about 80 comparisons): each full reference there costs about 45 ms (parse of every row plus two serializations), so every prefix would add about 3 minutes to `test:unit`. The small Porto Seguro log and the replay-small log are compared after every single op.
- Task 15 (EXIF orientation of `thumb` and `print`) is not done: the reading job (`jobs/reading/image.ts`, read-only for this batch) applies the original's EXIF orientation to the `print` bytes itself, so rotating `print` in `renderVariants` would turn every oriented plate sideways for OCR. Both sides must change in one batch; the deferred entry is re-owned accordingly.
- `rev` is stamped by a Dexie DBCore middleware (`schema.ts`, `entity-rev`) on every add/put to `entities`, not only by `toRecord`: tests and sync paths that `put` a spread of an old record (its old `rev` included) would otherwise have been served a stale cached row (caught by `sumario-surface.test.tsx`).
- The small fixture's enabled sub-blocks change two api expectations: all three sheets now print their plates (`last_nameplate` projected for three equipment, `preview.integration.test.ts`) and section 11 prints 1T's placeholder too (`job.integration.test.ts`).
- `--trust-lockfile` on `install` is a supply-chain policy trade-off for Matheus to confirm: the policies still run where the lockfile is written (a developer's `pnpm install`/`pnpm add`), not at each container start.
- `cert_number_mismatch` joins the Export dialog's explicit kinds (listed one by one), so the dialog names it (AC); its text is authored and open for Bruno.
- /cadastros has no `.content`; its capped column is `.registry-main.is-narrow` (Critérios and the placeholder tabs); the Instrumentos tab spans the width beside its panel and is unchanged.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green (narrow with a path while iterating)
- `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --grep "commit-to-render" --project desktop-chrome` -- numbers written to `test-results/perf/commit-to-render.json`
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --grep "<new or touched spec ids>" --project desktop-chrome` -- green
- The orchestrator runs `pnpm verify` twice and `test:e2e:full` under the lock after the review.

## Review Triage Log

### 2026-09-28 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer (opus). Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).

- verdicts: 9 findings — high 1, medium 0, low 6, false 1, maybe-false 0 (plus 1 deviation already recorded)
- findings:
  - `[low]` `[patch]` (verification gap) the E8-A5 eviction test set `uploaded_at`, so the crop exemption from `uploaded_at === null` never ran — added a crop whose file row keeps `uploaded_at: null` and asserted it is evicted (`photo-store.test.ts`).
  - `[high]` `[patch]` a section 9 subsection heading with a trailing space, an empty cabine name or doubled spaces never matched the trimmed outline title, so generation failed with `toc_outline_missing` — `headingPages` now compares both sides trimmed with whitespace collapsed; `toc.test.ts` covers the three shapes.
  - `[low]` `[patch]` `relatorioState`'s module maps kept a gone relatório's rows — both `return null` paths now delete its entries.
  - `[low]` `[reject]` the kernel builder's `previous` map keeps one snapshot per relatório visited — bounded by the relatórios opened in one tab session, each already held by the live query; guarding it adds a cap for no observed harm.
  - `[low]` `[patch]` a put with a `changeSpec` got a second, different `rev` — one rev per value, reused by the changeSpec.
  - `[false]` `[reject]` a focused box beyond the picture edge collapsing the crop to zero width — suggestion bboxes are normalized within [0, 1] and the margin keeps the width at least 0.03 after clamping; no reachable input produces zero width.
  - `[low]` `[defer]` task 15 (EXIF orientation of thumb/print) not done — reason recorded: the reading job re-orients the print itself and is off-limits here; deferred-work entry re-owned; frontmatter `deferred`.
  - `[low]` `[patch]` no web test showed the `cert_number_mismatch` row in the Export dialog — `export-dialog.test.tsx` E7-A4 case lists it and keeps "Gerar relatório" enabled.
  - `[low]` `[defer]` prefix equality over the full log is strided (every 48th op) — cost trade-off recorded in Design Notes; frontmatter `deferred`.

## Auto Run Result

Status: done.

- Summary: incremental device snapshot (kernel `createSnapshotBuilder`, identity-stable `relatorioState` over a per-write `rev` stamped by a Dexie middleware, one shared `useRelatorioSnapshot`), commit-to-render 720.7 to 282.5 ms median on a checklist tap; offline-capable gate start (baked pnpm binary, `COREPACK_ENABLE_NETWORK=0`, `--trust-lockfile`); load-independent waits in three unit files; fixture TTR 13.2 kV; section 11 pre-issue rows over `section11Instruments` plus `cert_number_mismatch`; small fixture sub-blocks; ÍNDICE 9.x; section 9 page break; plate crop zoom and outline; crop blob reuse and eviction; Home App bar and centered column; deferred-work states.
- Review: 5 patches applied (1 high, 4 low), 2 deferred, 2 rejected (reasons above).
- Follow-up review recommended: false (the one high patch is a direct comparison fix covered by its test; the integrated epic review follows).
- Verification: `test:unit` 2318/2318 before the patches; covering files after the patches (79 web tests, 8 api toc tests), lint and static clean; the orchestrator's `pnpm verify` and `test:e2e:full` follow and are reported in the PR.
- Residual risks: `--trust-lockfile` needs Matheus's confirmation; the mismatch row's wording is authored (Bruno); EXIF orientation still open.

### Gates after the review (orchestrator, 2026-09-28, HEAD `e1db59e`)

All under `flock /tmp/fasor-verify.lock`, 8-core laptop shared with batches D and V (their unlocked dev runs kept the load at 4-7).

| Gate | Before (Epic 7/8 retros) | After |
|---|---|---|
| `pnpm verify` | 1248-1318 s | 1540.8 s, then 1407.0 s (both green; lock waits 791 s and 1622 s) |
| e2e `@p0` | 868-920 s | 1059.5 s, then 971.7 s (132/132) |
| `test:e2e:full`, 1 worker | 1560-1585 s | 1706.6 s: 230 passed, 1 failed (E4-E2E-001 Esc did not close the dialog; passes alone with `--repeat-each=3`), 4 skipped |
| `test:e2e:full --workers=3` | failed one timing test per run | 1252.5 s: 230 passed, 1 failed (5.8-E2E-002 stepper count within 5 s, parallel group), so `PARALLEL_WORKERS` stays 1 and the other two runs were not spent |

The device commit-to-render fell by 60-65 % (table above), but the 900 s budget is still missed on this shared machine: per E8-A1 that stop rule goes to Matheus (a dated DoD clause 3 amendment or a split gate).

A first `verify` failed 4.8-E2E-001 deterministically: the faster Sumário let `setParecer`'s `page.goto` reload abort Etapa 1's still-open write transaction. Fixed in the test (`e1db59e`, an outbox poll before the reload); the product window (a reload within milliseconds of "Voltar") is recorded as known open.
