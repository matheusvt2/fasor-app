---
title: 'Stories 9.3 and 9.5: Vision captions confirmed in batch, NC observation drafts'
type: 'feature'
created: '2026-09-28'
status: 'in-progress'
baseline_revision: '2abf8db19201f12c644b89ce4b2f707dff33b163'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Batch K of Epic 9: Stories 9.3 and 9.5 are the two prose reading kinds; they share one output shape ({text} | null, Conflict 8), one provider slot, one kernel build and the same Suggestion block pattern on the device.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Photos with no sheet context stay "Sem legenda" until someone types a caption, and an NC row's observation is typed from scratch although its photo shows the defect. The reading job (Story 9.1 handler registry) knows only `plate` and `display`; `caption` and `nc_obs` fail as "not read yet".

**Approach:** Add a prose provider slot (`{text} | null`, no OCR call) and two handlers (`kinds/caption.ts`, `kinds/nc-obs.ts`) that re-check their target at run time and emit at most one `suggested` Suggestion (full-image bbox, empty token ids). The device sets `reading_kind: caption` on every photo created with no block, no caption and no people mark, and `nc_obs` on photos taken from an NC row; a new client file field `people_in_photo` (contract 7) keeps a photo from captioning. The gallery shows suggested captions on tiles (Confirmar), in the composer ("Usar") and as a one-batch "Confirmar todas"; the checklist shows the draft above the Observation field ("Usar"; typing discards it).

## Boundaries & Constraints

**Always:**
- Nothing unconfirmed is written, counted as done or printed. Prose is never guessed: `trust` is always `suggested`, never `verify`; no text means no row. A filled field is never overwritten; typing discards that field's suggestion only. The job never proposes which rows are NC (no row for any item but the photo's own target).
- A photo marked `people_in_photo` is never sent to the prose provider: the handler re-checks the mark, the caption and `block_id` in `prepare` and ends `done` with no provider call (Conflict 7). `nc_obs` re-checks that the row is still `NC` with an empty observation (Conflict 10).
- Kernel owns every rule, count and text (AD-1/AD-13): which photo gets `caption`, which suggestion a tile/composer/row shows, stale predicates, counts, labels, pre-issue row. `apps/web` renders and writes ops only. Fixed copy in `copy/pt-br.ts` (`// authored:` where no mock has it).
- Mock classes: gallery `70-fotos.html` lines 25-39, 80-82, 126-146 (`.banner.sug-banner[data-variant=info]`, `.banner-text`, `.banner-actions`, `.fotos-confirm-all`, `.photo-text .suggestion-field > .suggestion-block > .sv + .confirm-btn`, `.suggested-pill`); composer `71-legenda.html` 13-23, 76-84 (`.vision-line`, `.sv-kicker` "Sugerida pela foto"); NC draft pattern `72-pontos.html` 154-160 (`.sv-kicker` "Rascunho pela foto"). grep, never read a mock whole. Page-local rules go into the surface CSS (`photos.css`, the ficha CSS); `.frame-phone` rules become `@media (max-width: 767.98px)` with a comment naming the mock rule. `i-sparkles` is copied into `apps/web/public/sprite.svg` from `prototype/shell-head.html:29`.
- Plate and display behavior unchanged: their job, provider and e2e tests pass unmodified except for the `ReadingProviders` shape (a new `prose` member).
- Everything in Docker; providers stay `fake`.

**Never:**
- No change to `contract/ocr.ts` or the OCR schema (the prose contract is a new `contract/prose.ts`), so no sidecar gate. No `reading_kind`/`reading_target` client writes (batch P). No dictation (batch V). No face detection. No "Verificar" caption (the mock's photo 5 is not built). No Sync status change for caption suggestions. No edit of `sprint-status.yaml` or `epics.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Caption, happy | photo `reading_kind: caption`, no block, empty caption, no mark; prose `{text:'Vista geral da cabine primária'}` | one pending suggestion `file/{id}/caption` = text, `suggested`, `fill`, bbox `[0,0,1,1]`, `ocr_token_ids: []`; `reading_status: done`; run row carries model/prompt_version/usage | - |
| Caption, cannot caption | prose `null` or blank text | `done`, no suggestion (photo stays "Sem legenda") | - |
| Caption, changed before run | at run time `people_in_photo` true, or caption non-blank, or `block_id` set | `done`, no suggestion, prose provider never called, previous pending of the photo discarded | - |
| NC draft, happy | photo `nc_obs`, target `{block_id, block_type, item_key}`; row `NC`, observation empty | one suggestion `sheet/{b}/checklist/{item}/observation` = the sentence (trimmed, whitespace collapsed) | - |
| NC draft, drift | row `C`/`NA`/cleared, or observation non-blank at run time | `done`, no suggestion, no provider call | - |
| Bad target | nc_obs target unparseable, block gone/other relatório/type, item not on the block | permanent failure `failed` | as plate |
| Provider error | fixture `outcome: error`/`timeout` | transient, retried, `failed` on the last attempt | as plate |
| Device create | gallery camera "Geral" or gallery import (no block, empty caption, no mark) | create carries `reading_kind: caption`, `reading_target: null`, `reading_status: queued` | - |
| Device create, NC row | "Adicionar foto" / "Adicionar fotos" of an NC checklist row | `reading_kind: nc_obs`, target `{block_id, block_type, item_key}`, `queued` | - |
| Stale on device | pending caption suggestion whose photo got a caption/block/mark/removal; pending NC draft whose row is not NC or observation filled | never shown or counted; the post-pull sweep discards it (not on an `emitido` relatório) | - |

</intent-contract>

## Code Map

- `apps/api/src/jobs/reading/kinds/{types,index,shared,display,plate}.ts` -- Story 9.1 handler contract; add one line per kind in `READING_KIND_HANDLERS`. `job.ts:188-209` always builds providers and loads `print` before `run`; commit batch 211-235; run row 125-146 reads `facts.structuring` for model/prompt_version/usage.
- `apps/api/src/jobs/reading/providers/{index,fake,unimplemented}.ts` -- `ReadingProviders {ocr, structuring, ocr_name}`, factory by `LLM_PROVIDER`; `fakeReadingFixtureSchema` (`outcome`, `ocr`, `structuring`); `resolveFakeFixture`/`defaultFixtureFor` by `(reading_kind, block_type?, table_key?)`; `failFor`.
- `apps/api/src/jobs/reading/fixtures/` + `README.md` + `images/` (64x48 single-colour PNGs made with sharp); `providers/fake.test.ts:42-51` fails when a fixture names no committed image.
- `apps/api/src/http/files.ts:335-338` -- receipt already enqueues every queued kind; `http/reading.ts:60-74` reread any handled kind. `apps/api/src/sync/apply.ts:77-85` -- client photo create `reading_status` rule (target may be null).
- `apps/api/src/jobs/reading/job.integration.test.ts` -- cases to mirror for the new kinds.
- `packages/domain/src/contract/ocr.ts:108-195` -- `OcrImage`, `structuringResultSchema` usage shape (reuse by import; do not edit this file). `contract/version.ts:32,51` -- `CONTRACT_VERSION = 6`, `MIN_CONTRACT_VERSION = 6` with dated notes.
- `packages/domain/src/schemas/entities.ts:403-424` photo row; `:475-493` suggestion row (`ocr_token_ids` already allows empty). `ops/path.ts:48,113,238,460` -- `FILE_FIELDS`, `fileFieldPath`; `ops/apply.ts:292-296` file/field put; `sheetChecklistPath`.
- `packages/domain/src/reading/{build,display,target}.ts` -- the plate/display builds and target schemas to mirror (`normalizeBox`, `DISPLAY_PROMPT_VERSION`).
- `packages/domain/src/relatorio/suggestions.ts` -- `suggestionRowsOf` L37, `pendingSuggestions` L52, `suggestionTarget` L90 (file paths return null: caption suggestions stay out of progress and Sync counts), `livePendingSuggestions` L107 (checklist drafts are `sheet/*`: they hold a block as "not concluded", hence the stale sweep), `confirmSuggestionOps` L337, `discardSuggestionOp` L351.
- `packages/domain/src/relatorio/pre-issue.ts:45-66,115-138,240-250` -- kinds, context `pendingSuggestions`, section 7 photo rows. `photos/gallery.ts:114-120,153,283-292` -- `galleryCounterText`, `photoTileLabel`, `galleryCounts`; `photos/text.ts:27`.
- `apps/web/src/db/file-commit.ts:65-139` -- `PhotoCaptureInput.reading`, `photoCreateDraft` (one place every photo create passes). `files/photo-import.ts:84-120` -- `ImportTarget` has no `reading`. `surfaces/ficha/use-ficha-photos.ts:63-99` -- `photoTarget`, `checklistPhotos.target/addPhotos`. `surfaces/ficha/use-photo-capture.ts:27` `CaptureTarget.reading`.
- `apps/web/src/db/suggestion-store.ts:45-99` -- post-pull sweep `autoConfirmPending`/`sweepOne` (add the stale-prose discard here).
- `apps/web/src/surfaces/photos/gallery-surface.tsx` (tiles 165-185, counter 106, composer 226-240), `components/photo-row.tsx` (`PhotoRow` props), `surfaces/photos/caption-composer.tsx` (props 55-66), `surfaces/photos/photo-ops.ts:34-51` (`assignPhotoBatch`, `setPhotoCaption`), `surfaces/photos/capture-sheet.tsx:206,246,282-300,373-480` (`GERAL`, `finish`, `EquipmentStep` caption field 455-475).
- `apps/web/src/surfaces/ficha/checklist-section.tsx:212-371` -- `ChecklistRow`, Observation `textarea` 316-330, `useTypedText`, chips `insert`. `components/suggestion-field.tsx` (`valueClassName`, `confirmLabel`), `components/chip.tsx` (`isSelected`/`onSelectedChange` = `aria-pressed`).
- `apps/web/src/surfaces/export/use-pre-issue.ts:38` -- passes `pendingSuggestions`.
- E2E: `e2e/read-display-pipeline.spec.ts` (camera fallback by rejecting `getUserMedia`, file chooser, "Sincronizar agora", `readStore`), `e2e/photos.spec.ts`, `e2e/support/{push-server-ops.ts:93 pushSuggestion,photos.ts,outbox.ts,groups.ts SERIAL_SPECS}`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/contract/prose.ts` (+ index export) -- `proseOutputSchema = z.object({text: z.string()}).strict().nullable()`, `ProseKind = 'caption' | 'nc_obs'`, `ProseInput {image: OcrImage, kind, context: {block_type: string|null, item_label: string|null}}`, `proseResultSchema {output, model, prompt_version, usage}` (usage as structuring's), `ProseProvider.describe(input)`.
- `packages/domain/src/reading/prose.ts` (+ `target.ts`, index, tests) -- `ncObsReadingTargetSchema {block_id, block_type, item_key}`; `proseText(output) → string | null` (trim, collapse whitespace, null when blank); `buildProseSuggestion({relatorioId, photoId, runId, targetPath, output, promptVersion, newId}) → {rows, dropped}` (full-image bbox, `[]` tokens, `suggested`, `fill`, `hint: null`; blank → dropped `no_text`); `captionReadingOf({block_id, caption, people_in_photo}) → {kind:'caption', target:null} | null`; `ncObsReadingOf(block, itemKey) → {kind:'nc_obs', target}`; `captionSkipReason(photo)`, `ncObsSkipReason(block, itemKey)` (null when it should run).
- `packages/domain/src/schemas/entities.ts`, `ops/path.ts` -- photo row `people_in_photo: z.boolean().default(false)`; `FILE_FIELDS` gains `people_in_photo`. `contract/version.ts` -- `CONTRACT_VERSION = 7`, `MIN_CONTRACT_VERSION = 7`, dated notes (2026-09-28, Story 9.3: the `file/{id}/people_in_photo` put family; a v6 bundle cannot parse it).
- `packages/domain/src/relatorio/suggestions.ts` or `photos/captions.ts` (+ tests) -- `captionSuggestions(photos, pending) → Map<photoId, SuggestionRow>` (newest pending per `file/{id}/caption` of a live photo with no block, blank caption, no mark); `captionConfirmAllOps(author, rows)`; `ncDraftFor(block, itemKey, pending) → SuggestionRow | null` (row `NC`, observation blank); `staleProseSuggestions(state/rows) → SuggestionRow[]` (the complement of both, plus removed photo/block); texts `legendasSugeridasText(n)` ("1 legenda sugerida" / "12 legendas sugeridas"), `legendasConfirmadasText(n)`, `photoTileLabel(n, {suggested})` ("Foto 1, legenda sugerida, abrir"), usar announcements.
- `packages/domain/src/photos/gallery.ts` -- `galleryCounts`/`galleryCounterText` take a `suggested` count: "N legendas sugeridas" part, and `uncaptioned` excludes photos with a shown caption suggestion.
- `packages/domain/src/relatorio/pre-issue.ts` (+ test) -- kind `captions_suggested`, section 7, severity `info`, text `legendasSugeridasText(n)`, count from `captionSuggestions(livePhotos, context.pendingSuggestions)`; `photos_uncaptioned` unchanged. Update any exhaustive switch over `PreIssueKind` in `apps/web`.
- `apps/api/src/jobs/reading/kinds/types.ts`, `job.ts` -- small extension: `PreparedReading.skip?: string` (the job then commits discard-previous + `done` with no provider build, no image load, and logs the reason); `ReadingKindRunResult.model?: {model, prompt_version, usage} | null`, written to the run row when `structuring` is null. Say so in the PR.
- `apps/api/src/jobs/reading/providers/{index,fake,unimplemented}.ts` -- `ReadingProviders.prose` by `LLM_PROVIDER` (`fake` replays fixture `prose` with `failFor`; `anthropic`/`bedrock` unimplemented); fixture schema gains `prose: proseOutputSchema.optional()` (absent = null).
- `apps/api/src/jobs/reading/kinds/caption.ts`, `kinds/nc-obs.ts`, `kinds/index.ts` -- per the matrix; `fakeDefaults: [{sha256}]` (caption) and `[{sha256}]` (nc_obs); `prompt_version` from the provider.
- `apps/api/src/jobs/reading/fixtures/` -- `images/caption-default.png`, `images/nc-obs-default.png`, `images/caption-none.png` (sharp, distinct colours) and their fixtures (`prose` text, `prose: null`); README table rows. Default texts (authored, pt-BR): caption "Vista geral da cabine primária"; nc_obs "Oxidação aparente na estrutura do equipamento.".
- `apps/api` tests -- `job.integration.test.ts` new cases for every matrix row of both kinds (prose provider spy proves "never called" on skips); `fake.test.ts` new fixtures and fallback; sync-route integration test: a `file/{id}/people_in_photo` put and a photo create carrying the field are accepted and pulled; a v6 pull answers 426.
- `apps/web/src/db/file-commit.ts` -- `PhotoCaptureInput.peopleInPhoto?`; `photoCreateDraft` writes `people_in_photo` and, when `reading` is absent, applies `captionReadingOf` (so every gallery/import/rescue path gets it). `files/photo-import.ts` -- `ImportTarget.reading?` passed through. `surfaces/ficha/use-ficha-photos.ts` -- the NC row's `target`/`addPhotos` carry `ncObsReadingOf(block, itemKey)` (rows show them only when NC).
- `apps/web/src/db/suggestion-store.ts` -- the sweep discards `staleProseSuggestions` (not on `emitido`), same error handling as auto-confirm.
- `apps/web/src/components/photo-row.tsx`, `surfaces/photos/gallery-surface.tsx`, `photo-ops.ts`, `photos.css` -- tile: suggested caption as the mock's suggestion block with "Confirmar" (writes `confirmSuggestionOps`), tile label with "legenda sugerida"; "Pessoas na foto" `Chip` (`aria-pressed`) on tiles with no `block_id` or already marked: pressing on commits the put and discards the photo's pending caption suggestion in one batch; banner "N legendas sugeridas" + "Confirmar todas" (one batch for every shown suggestion, toast `legendasConfirmadasText`); counter with the suggested part; any caption save through the composer discards the photo's pending caption suggestion in the same batch.
- `apps/web/src/surfaces/photos/caption-composer.tsx` -- optional `suggestion {text, onUse}`: `.vision-line` block above the rows with `i-sparkles`, kicker "Sugerida pela foto", button "Usar" (confirms, closes, toast `captionSavedText`).
- `apps/web/src/surfaces/photos/capture-sheet.tsx` -- `EquipmentStep` gains the "Pessoas na foto" chip under the caption field; `finish`/`assignPhotoBatch` put `people_in_photo: true` on every photo of the batch when pressed.
- `apps/web/src/surfaces/ficha/checklist-section.tsx` (+ ficha CSS) -- above the Observation field of an NC row (not read-only): `.field.suggestion-field.nc-draft[data-state=suggested]` > `.suggestion-block` (`i-sparkles`, `.sv` > `.sv-kicker` "Rascunho pela foto" + text, `.confirm-btn` "Usar") + `.suggested-pill`; "Usar" commits `confirmSuggestionOps` (observation with `source_suggestion_id`); the first keystroke or chip insert commits `discardSuggestionOp` and the typed text stays.
- `apps/web/src/copy/pt-br.ts` -- "Pessoas na foto", "Confirmar todas", "Sugerida pela foto", "Rascunho pela foto", "Usar", "Legenda sugerida" (`// authored:` where no mock has it).
- E2E -- `e2e/captions.spec.ts` (`@p0`, suggestions seeded with `pushSuggestion`): tile block + pill + Confirmar (outbox caption put with `source_suggestion_id` + status put, one batch); "Confirmar todas" (every put shares one `batch_id`, banner gone, counter updated); composer "Usar"; typed caption discards; people chip on tile (put + discard, one batch) and in the import batch (put on each photo); a gallery "Geral" shot's create carries `reading_kind: caption`; 390 px no horizontal overflow on the gallery with the banner; Export/Sumário row 7 lists "N legendas sugeridas". `e2e/nc-draft.spec.ts` (`@p0`): seeded draft above the field on an NC row, "Usar" writes the observation, typing discards and keeps the text, a C row shows no draft; an NC row shot's create carries `nc_obs` + target. `e2e/prose-reading-pipeline.spec.ts` (`@p1`, no server-op seeding, E8-A6): gallery shot through the camera fallback → "Sincronizar agora" → suggested caption arrives → Confirmar; NC row → "Adicionar foto" → sync → draft arrives → "Usar". Pipeline spec goes in `SERIAL_SPECS` like `read-display-pipeline.spec.ts`. Update existing specs broken by gallery shots now reading as `caption` (assert state, not timing).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the narrowings below.

**Acceptance Criteria:**
- Given a gallery shot or import with no equipment, no caption and no mark, when it uploads under `fake`, then the tile shows the suggested caption on the amber block with "Sugerido" and nothing is written until Confirmar, "Usar" or "Confirmar todas".
- Given 2 or more pending caption suggestions, when "Confirmar todas" is pressed, then every shown suggestion is confirmed in one outbox batch, each caption equals its suggestion, and the banner leaves.
- Given pending caption suggestions, then the Export dialog / Sumário section 7 lists "N legendas sugeridas" as a warning and "Gerar" stays enabled.
- Given a photo marked "Pessoas na foto" (tile or import batch), then its create/put carries `people_in_photo: true`, no caption suggestion is shown for it, and a job run for it calls no provider.
- Given an NC row with a photo taken from it, when the draft arrives, then it shows above the Observation field with "Usar"; "Usar" writes the observation with `source_suggestion_id`; typing instead keeps the typed text and discards the draft.
- Given the prose output shape, no row ever carries `trust: verify`, and no suggestion targets any checklist item but the photo's own.

## Design Notes

Run-time skip keeps the job's single batch: `prepare` returns `{fixture, skip: 'people_in_photo' | 'captioned' | 'has_block' | 'not_nc' | 'observation_filled', run}`; the job, seeing `skip`, commits the discards of the photo's previous pending plus `done` (so a stale earlier caption leaves) and writes an `ok` run row with `ocr_provider` as today.

Why the sweep: a pending `nc_obs` suggestion is a `sheet/*` row, and `progress` holds any block with a pending suggestion as not concluded. The sweep (post-pull) discards drafts the engineer already overtook (observation typed offline before the draft arrived), so a draft never keeps a sheet open beyond the empty required observation.

Narrowings (deferred-work, owner in brackets): an import batch's photos are committed as "Geral" at pick time (E6-Q8), so a people mark or equipment chosen in a batch left open while online may reach the server after the job read the photo; the run-time re-check and the stale sweep drop the suggestion, but the image went to the provider (`fake` now; must close before a cloud LLM) [Epic 11]; unmarking "Pessoas na foto" does not request a caption (no client reread of `caption`) [Epic 9 integrated review]; caption suggestions are not in Sync status "Leituras" counts [same]; the tile chip shows only on tiles with no equipment or already marked [same].

Open questions (conservative reading kept): the tile keeps the mock's "Confirmar" while composer and NC draft say "Usar" (story); "Confirmar todas" confirms every suggestion of the relatório, not only the filtered cabine; `captions_suggested` is `info` (a warning, never blocking), beside the unchanged `photos_uncaptioned`.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/reading packages/domain/src/relatorio packages/domain/src/photos` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green, plate/display cases unmodified
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --project desktop-chrome e2e/captions.spec.ts e2e/nc-draft.spec.ts e2e/prose-reading-pipeline.spec.ts e2e/photos.spec.ts e2e/read-display-pipeline.spec.ts` (stack up) -- green
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- green
