# Epic 16 Context: Bruno's second production feedback (WhatsApp of 2026-10-23)

<!-- Compiled 2026-10-23 from epics.md Epic 16, Bruno's WhatsApp messages of 2026-10-23 (three items, one desktop
screenshot of the preview beside the DOCX in Word), the production request log of 2026-10-22/23, source-deltas.md rows
of 2026-10-23, spine AD-1/11/15/17/26. Current decisions only. Edit freely. -->

## Goal

Three items Bruno sent after using v0.3.0 and v0.3.1 on a desktop, landed as four stories: the header logo whole in the DOCX and the
PDF (16.1), the Export dialog saying that the listed revisions predate the edits so nobody sends yesterday's revision
for today's preview (16.2), the "Ler visor" display shots out of the REGISTRO FOTOGRÁFICO and the numbering (16.3), and
"N.A" accepted in a nameplate or cabine number field as the AD-11 `not_applicable` state (16.4, contract 26).

The DOCX item was investigated as a possible rendering fault and is not one: the production log shows no
`POST .../generate` on 2026-10-23 for Bruno's relatório; the file he opened was the revision of 2026-10-22 15:12 BRT,
downloaded from the "Revisões" list after six previews (`epics.md` Epic 16 preamble).

## Stories, waves and lanes

| Wave | Batch | Story | Dev model | Seed / contract | Base |
|---|---|---|---|---|---|
| A | e16a | 16.1 The header logo fits its cell | sonnet · low | none | main (01d37c76 or later); deployed alone as v0.3.2 |
| A | e16b | 16.2 A revision older than the edits says so | sonnet · medium | none | main |
| A | e16b | 16.3 Display shots print only under their test | opus · medium | none | same branch as 16.2 |
| B | e16c | 16.4 "N.A" in a nameplate or cabine number field | opus · high | **contract 26, minimum 26** (no seed) | main, after wave A's gate |

Two batch stacks at a time (E11-A1 load rule): e16a and e16b run in parallel as two worktrees; e16a merges first and
ships as v0.3.2 (Bruno waits on the logo); e16c starts after wave A's gate. Numbers are fixed here: no other batch
takes contract 26.

Defaults taken on 2026-10-23 (Matheus) while Bruno's two questions are out; an answer that differs becomes a dated line
under its story before the batch merges:

- 16.3: display shots leave section 7 and the "Imagem N" numbering, print after their test in section 9 with the
  caption sentence alone, carry no badge on screen and are not offered by the point editor's picker.
- 16.4: nameplate and cabine number fields only; typings `N.A`, `NA`, `N/A`, `N.A.` in any case; shown and printed
  "N.A"; stored `{ raw: '', unit: null, state: 'not_applicable' }`.
- 16.2: the mock's banner sentence with number and date live; "gerado" unless that revision had been marked as sent;
  row tag " — anterior às alterações".

## Cross-story table (one assertion per shared item)

| Shared item | Stories | Assertion |
|---|---|---|
| `print/revisions.ts` (`revisionRowSegments`, new banner sentence) | 16.2 | the only place the sentence and the tag are composed; `export-dialog.tsx` renders strings it receives |
| `photos/numbering.ts` `numberPhotos` | 16.3 | one filter (`reading_kind !== 'display'`) feeds section 7, section 8 refs, section 9, the audit input and every web badge; no second numbering anywhere in `apps/*` |
| `print/section-9.ts` `sheetPhotos`, `photoLine` | 16.3, 16.4 | 16.3 changes the display shot's line only; 16.4 changes `storedValueText` only; the Porto Seguro goldens (v1, no logo, no display shot, no N.A) unchanged by both |
| `schemas/entities.ts` `numberValueSchema`; `contract/version.ts` | 16.4 | one enum value, one contract entry (26/26); `contract/ocr.ts` keeps its own three-state schema so `schema:ocr` output is unchanged (the kernel drift test stays green) |
| `relatorio/ficha.ts` `numberFieldValue`, `fieldValueText`; `components/number-input.tsx` | 16.4 | the parse answers the N.A variant beside `null`/`'invalid'`/measured; `NumberField` and the cabine fields commit it; measurement cells never see it |
| `apps/api/src/jobs/generate/docx.ts` header constants | 16.1 | `LOGO_MAX_WIDTH_PX` derives from `CONTENT_WIDTH_TWIPS / 2 - CELL_MARGINS_TWIPS`; the logo cell equals the drawing plus margins; `docx.test.ts` A11 reads `wp:extent` against `w:tcW` |
| `e2e/export.spec.ts` E4-E2E-001 | 16.2 | extended, not duplicated: banner and tag after the edit, gone after revision 2 |

Undo pairs: 16.4 adds no op kind (an N.A commit is the existing nameplate/cabine put); 16.1, 16.2 and 16.3 add no op.

## Gate

The 2026-10-08 story gate per PR: `lint`, `static`, `test:unit`, `test:api` and the Playwright specs the story touched
(`pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome`), plus the touched
durability specs on the matrix projects for e16c (it changes a value shape the ficha's live query folds). The full
`@p0`, `test:e2e:full` and the matrix once per wave on the integrated main, by the coordinator. Tools run only in the
`tools` container through `podman compose`; worktree stacks remap ports through `compose.local.yml` (orchestrator § 1).

## Wave gates (coordinator)

- **Batch e16a (Story 16.1), 2026-10-23, main `8124f2a4`** (PR #179): story gate lint 0 errors (25 pre-existing e2e warnings), static green, api 682/683 (14.10-INT timing red under load, green alone), unit 4433/4435 (two template-composer 15 s timeouts under load, green alone), `docx.test.ts` 24/24; no Playwright spec touched. Deployed to production as **v0.3.2** (`8124f2a4`) the same day, smoke 8 of 8; tag and GitHub release v0.3.2. The wave A full gate (`@p0`, `test:e2e:full`, matrix) runs after e16b merges.
- **Batch e16b (Stories 16.2 and 16.3), 2026-10-26, main `bc9e31df`** (PR #181): story gate lint 0 errors (25 pre-existing e2e warnings), static green, api 683/683, unit 4464/4464, touched specs 80/80 (export, display-shots, seed-v7, photo-numbers, points, photos, review-field-defects 1 and 2, verificacoes-local, read-display; 16.3-E2E-001 red once because the batch api container had not reloaded the kernel, green after a restart on the same commit), lock wait 0 s, about 15 min. The first launch of the batch died on a network error before writing anything; the relaunch built the two stories in two parallel implementation lanes inside one worktree (no shared files). `docx.ts`, `layout.ts` and the Porto Seguro goldens untouched; `docx.test.ts` gained a non-null assertion that `pnpm static` on `7eeae579` needed.
- **Wave A gate, 2026-10-26, main `bc9e31df`** (after PRs #179 and #181), lock wait 0 s: `pnpm verify` green in 2100 s (lint, static, api 683/683, unit 4464/4464, `@p0` 308/308: 228 parallel in 11.7 min and 80 serial in 14.5 min); `test:e2e:full` 520 passed, 0 failed, 4 skipped in 2620 s (367 parallel, 153 serial); `test:e2e:matrix` 106 passed, 0 failed, 11 skipped in 569 s. No red, no flake, no fix batch. Wave B (e16c, Story 16.4) started the same day.
- **Batch e16c (Story 16.4), 2026-10-26, main `5cece708`** (PR #183, head 8bbec450 merged main 9230bc8f): story gate lint 0 errors, static green, api 684/684, unit 4490/4491 then 4491/4491 on the re-run (`template-composer-local` timeout under load), 13 touched specs 115/115 on desktop-chrome and durability-desktop-chrome (780 s, lock wait 0 s), 5 durability specs on the three matrix projects 59 passed and 1 skipped (388 s). Contract 26, minimum 26. `docx.ts`, `layout.ts`, the goldens and the exported OCR schema untouched.
- **Wave B gate, 2026-10-26, main `5cece708`** (after PRs #182 and #183), lock wait 0 s: `pnpm verify` stopped at `test:unit` (4 `template-composer*` timeouts of 5 to 17 s under load, host load average 9 to 10); `test:e2e:full` 520 passed, 1 failed, 4 skipped in 5494 s (the red is `merge.spec.ts` 10.1-E2E-001 in its setup step `pushDrafts (224 ops)`, an api request timeout of 15 s); `test:e2e:matrix` 106 passed, 0 failed, 11 skipped in 431 s. Follow-up on the same commit behind the lock: the full `test:unit` **4491/4491** green once (206 s) and 4490/4491 on a second run (the known "Adicionar painel" 1 s `findByRole`); the `@p0` stage alone **309/309** (228 parallel, 81 serial, 1339 s), `merge.spec.ts` included. No defect, no fix batch.
- **Production deploy v0.3.3, 2026-10-26, `5cece708`**: `infra/bin/deploy` in 563 s (build for linux/amd64, push, migrate, roll, health all up, tag record), production smoke 8 of 8 (sign in, edit and sync, sheet photo, plate reading, preview, revision, DOCX and PDF download) in 54 s, test company cleaned. Tag `v0.3.3` pushed; the GitHub release is Matheus's (the agent is not allowed to create a public release); notes drafted in the session. Open for Matheus before the next story: N.A on a tablet soft keyboard (the decimal keypad has no letters; a text keypad or an "N.A" control, candidate Story 16.5), the section 8 "imagem removida" reference to a display shot, and the 16.4 narrowings listed under the story.

## Out of scope

Free text in number fields (refused: the ratio, the voltage classes, the criterion bands, the OCR confirmations and the
cabine lines read numbers); the `unchanged` short-circuit ignoring registry and user edits (`deferred-work.md` row of
Story 4.8, unchanged); any seed change (v10 stays Story 15.7, waiting for Bruno's TC list); the Epic 15 retrospective
(runs before wave B).
