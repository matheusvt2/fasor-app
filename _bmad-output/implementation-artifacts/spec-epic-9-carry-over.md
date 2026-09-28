---
title: 'Epic 9 carry-over: gate time, offline tools image, Epic 7 and 8 leftovers, Home layout'
type: 'chore'
created: '2026-09-28'
status: 'in-progress'
baseline_revision: 'a2cd0534bee9371e1e76ca1f58da786800a8c902'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Epic 9 carry-over batch C1 (E6-A7): the agent-closable action items E7-A1/E8-A1, E7-A7/E8-A2, E7-A2, E7-A3, E7-A4, E8-A5 and the Home layout bug, one PR by coordinator decision.'
deferred: []
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

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green (narrow with a path while iterating)
- `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --grep "commit-to-render" --project desktop-chrome` -- numbers written to `test-results/perf/commit-to-render.json`
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --grep "<new or touched spec ids>" --project desktop-chrome` -- green
- The orchestrator runs `pnpm verify` twice and `test:e2e:full` under the lock after the review.
