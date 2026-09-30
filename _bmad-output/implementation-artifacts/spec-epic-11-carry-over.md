---
title: 'Epic 11 carry-over (batch C): an import batch queues its caption readings only once answered'
type: 'bugfix'
created: '2026-09-30'
status: 'done'
baseline_revision: 'd7beb605ccc7cc22c1537c05cac945e78e799650'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context: []
warnings: ['batched']
batched_reason: 'Batch C carries the Epic 11 carry-over ledger entries; only ledger 1131 needs code, the others are re-owned in deferred-work.md by the orchestrator.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ledger `deferred-work.md` entry "Stories 9.3/9.5 narrowing: an import batch's photos are committed as Geral at pick time" (line ~1131): a gallery import batch commits each photo's `file/{id}` create at pick time (E6-Q8) with `reading_kind: 'caption'`, `reading_status: 'queued'` (the photo has no sheet, caption or people mark yet). While the "De qual equipamento?" sheet stays open online, the bytes upload and the server sends the whole image to the prose provider before the batch's "Pessoas na foto" mark, caption or equipment arrives. The run-time re-check (`captionSkipReason`) only helps when the mark lands first. This must close before a cloud LLM is wired (Story 11.6).

**Approach:** A gallery batch creates its photos with no reading (`reading_status: 'none'`). When the batch is answered ("Adicionar N fotos") or closed ("Cancelar", Esc, scrim: kept as "Geral"), every photo whose final state still has no sheet, no caption and no people mark gets a `file/{id}/reading_kind = 'caption'` put, in the same batch as the answer's other puts, which queues the caption reading (`readingKindPutStatus`). The server accepts a client `caption` put only on a photo with no reading and no context, so a marked photo can never be queued by a client.

## Boundaries & Constraints

**Always:**
- The kernel owns the rules: `captionReadingOf` / `captionSkipReason` (`packages/domain/src/reading/prose.ts`) decide which photo gets the put; `clientReadingKindPutAllowed` (`packages/domain/src/reading/retarget.ts`) decides which client put the server accepts.
- A client `reading_kind = 'caption'` put is allowed only when the stored photo row is `kind: 'photo'`, `reading_kind` null, `reading_status: 'none'`, and `captionSkipReason(row) === null` (no `block_id`, blank caption, `people_in_photo` not true). Anything else stays `op_invalid` (E9-Q2 refusal, `assertClientReadingKindPut` in `apps/api/src/sync/apply.ts`). The panel->plate re-target and the null put keep working unchanged.
- The `reading_kind` put comes after the batch's `block_id` / `caption` / `people_in_photo` puts of the same photo in the batch.
- The existing send paths do the rest: `apps/api/src/sync/routes.ts` sends a reading after an applied client `reading_kind` put when the photo is uploaded and queued; `apps/api/src/http/files.ts` sends it on upload of a queued photo. No new send path.
- `CONTRACT_VERSION` 13 -> 14 with a dated note in `packages/domain/src/contract/version.ts` (a version-13 server refuses the new put, so a new client must not talk to it). `MIN_CONTRACT_VERSION` stays 13: a version-13 bundle parses the put and its `applyOp` derives the same `queued` status; say so in the note.
- Camera shots and sheet imports (`mode.kind === 'sheet'`) keep asking for the caption at create exactly as today; only the gallery batch (`startBatch`) changes.

**Never:**
- No new op family, no row-shape change, no change to the caption job's run-time re-check.
- Do not queue a caption on a photo that the answer gave a sheet, a caption or the people mark.
- No UI copy change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Batch open | 2 files picked, sheet still open | 2 creates with `reading_kind: null`, `reading_status: 'none'`; no `reading_kind` put in the outbox | none |
| Answer Geral, nothing else | "Geral", no caption, no mark, "Adicionar 2 fotos" | one batch of 2 `file/{id}/reading_kind = 'caption'` puts | none |
| Answer with people mark | "Pessoas na foto" pressed | 2 `people_in_photo` puts, no `reading_kind` put | none |
| Answer with caption or equipment | batch caption typed, or a sheet chosen | `caption`/`block_id` puts, no `reading_kind` put | none |
| Cancel / Esc / scrim | batch kept as "Geral" | one batch of `reading_kind = 'caption'` puts, then the existing "kept as Geral" toast | write error -> existing `writeErrorText` toast |
| Answer before the saves land | "Adicionar" pressed while `ids` is null | puts committed once the saves land (existing `settled` path) | none |
| Server: allowed put | photo row none/no context, client put `caption` | applied, row `reading_status: 'queued'`; when uploaded, the caption reading is sent once | none |
| Server: refused put | photo with `block_id`, a caption, `people_in_photo: true`, a reading already (`panel`, `caption` done/queued), a logo file, or no row | `op_invalid`, row unchanged, nothing sent | permanent refusal |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/photos/capture-sheet.tsx:246-323` -- `startBatch` imports with `GERAL` via `usePhotoImport` (`:54-90`, `ImportTarget`); `finish` returns early on `target === null` (cancel) and otherwise calls `assignPhotoBatch`. The batch create must skip the caption reading; `finish` must commit the caption puts on both branches.
- `apps/web/src/surfaces/photos/photo-ops.ts:29` `put(...)` field union; `:102-118` `assignPhotoBatch` builds the answer batch (skips an empty batch).
- `apps/web/src/db/file-commit.ts:75-150` -- `PhotoCaptureInput.reading`, `photoCreateDraft` picks `input.reading ?? captionReadingOf(...)`. Needs a way for the batch import to say "no reading at create" (e.g. an explicit `reading: null` / a `deferCaption` flag threaded from `ImportTarget` through the import hook).
- Find the import hook that `usePhotoImport` uses to build `PhotoCaptureInput` (grep `usePhotoImport`) and thread the flag.
- `packages/domain/src/reading/prose.ts:62-90` -- `CaptionCandidate`, `captionReadingOf`, `captionSkipReason`.
- `packages/domain/src/reading/retarget.ts` + `retarget.test.ts` -- `clientReadingKindPutAllowed(photo, value)`; widen its photo parameter type to the fields it reads.
- `apps/api/src/sync/apply.ts:98-123` -- `clientReadingPutIsValid` (shape: accept `'caption'` too) and `assertClientReadingKindPut` (the row cast must include `reading_status`, `block_id`, `caption`, `people_in_photo`).
- `apps/api/src/sync/panel-retarget.integration.test.ts:290-310` -- asserts `put('reading_kind','caption')` on a panel photo is `op_invalid`; still true under the new rule (row check), keep it.
- `apps/api/src/sync/people-in-photo.integration.test.ts` -- pattern for a photo create + push + upload + reading send through the sync route (`calls: ReadingPayload[]`).
- `packages/domain/src/contract/version.ts:70-129` -- notes and constants.
- `e2e/captions.spec.ts` -- 9.3-E2E-001 asserts the batch creates carry `reading_kind: 'caption'` (must change); 9.3-E2E-003 the people-marked batch. Helpers `outbox`, `devicePhotos`, `pickFiles`, `holdPhotoBytes`.
- `e2e/prose-reading-pipeline.spec.ts` -- `@p1` real job path (gallery shot); check it does not rely on batch creates.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/reading/retarget.ts` -- allow the client `caption` put per the rule above -- the server's refusal stays in the kernel.
- `packages/domain/src/reading/retarget.test.ts` -- unit cases: every allowed/refused row of the matrix.
- `packages/domain/src/contract/version.ts` -- bump to 14 with the dated note (ledger 1131, batch C); MIN stays 13 with its note.
- `apps/api/src/sync/apply.ts` -- accept `'caption'` in `clientReadingPutIsValid`; pass the needed row fields to the kernel check; update the E9-Q2 comments.
- `apps/api/src/sync/<new or existing>.integration.test.ts` -- through the sync route: a batch-style photo (create with `reading_status: 'none'`, uploaded) then a `caption` put is applied, row queued, and exactly one caption `ReadingPayload` is sent; the refused rows of the matrix are `op_invalid` with nothing sent; the put pushed before the upload queues and the upload sends it.
- `apps/web/src/db/file-commit.ts`, the import hook, `capture-sheet.tsx`, `photo-ops.ts` -- batch creates with no reading; `assignPhotoBatch` (or a sibling) appends the `reading_kind = 'caption'` put for each photo whose answered state passes `captionReadingOf`; cancel commits that batch too.
- `apps/web` unit tests next to the changed modules where they exist (e.g. `photo-ops` / `file-commit` tests) for the batch composition.
- `e2e/captions.spec.ts` -- update 9.3-E2E-001 (creates carry no reading while the sheet is open; after "Cancelar" one batch of `caption` puts, one per photo) and extend 9.3-E2E-003 (the people-marked batch has no `reading_kind` put in the outbox); add a `@p0` case for "Geral" + "Adicionar" asserting the put batch and that no put exists before the answer. Assert the outbox (committed state), not only the screen.

**Acceptance Criteria:**
- Given a gallery import batch left open online, when its photos upload, then no caption reading is sent for them (their rows say `reading_status: 'none'`).
- Given the batch answered with "Pessoas na foto", a caption or an equipment, when it syncs, then no caption reading is ever queued or sent for those photos.
- Given the batch answered as plain "Geral" (or closed), when it syncs, then each photo is queued for a caption reading once and the existing tile suggestion flow works as before.
- Given a client that pushes a `caption` put on a photo with context or with a reading already, then the push answers `op_invalid` and nothing is sent.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/reading` -- green.
- `docker compose --profile tools run --rm tools pnpm test:api -- <the touched integration test files>` -- green (needs `docker compose up -d postgres minio` first).
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- green.
- `docker compose --profile tools run --rm tools pnpm test:e2e -- e2e/captions.spec.ts` (check `package.json` / `scripts/e2e.ts` for how a single spec is passed) -- green.
- Never run `pnpm verify`, `test:e2e:full` or `test:e2e:matrix`: the orchestrator runs the gate under the host lock.
