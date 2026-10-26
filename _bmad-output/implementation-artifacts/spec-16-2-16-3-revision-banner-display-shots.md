---
title: 'Stories 16.2 and 16.3: a revision older than the edits says so, display shots print only under their test'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
baseline_revision: '6666e5647605847d95bc35d637b20511e10fd07d'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-16-context.md']
warnings: ['batched']
batched_reason: 'Two stories of wave A of Epic 16 with no shared file, built on one branch in two parallel lanes with one gate and one PR (coordinator decision of 2026-10-23).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** (16.2) Bruno downloaded the revision of 2026-10-22 from the Export dialog's "Revisões" list after six previews of his corrections and took it for the corrected document: the dialog never says a listed revision predates the edits. (16.3) The "Ler visor" display shots (instrument screens a reading came from) print in section 7 REGISTRO FOTOGRÁFICO as "Imagem N" and take numbers, while FO.SERV-03's section 7 holds only site and work photos.

**Approach:** (16.2) The kernel composes the mock's banner sentence and a row tag; the Export dialog renders the mock's `<div class="banner" role="status">` under its title and the tag on every row while something was edited since the latest revision. (16.3) `numberPhotos` skips `reading_kind: 'display'`; every consumer of the numbers (section 7, section 8, section 9, audit input, web badges and picker) follows from that one filter, and section 9 prints a display shot after its test tables with the caption sentence alone.

## Boundaries & Constraints

**Always:** every sentence, tag, number and filter lives in `packages/domain` (AD-1/AD-13); `apps/web` renders strings it receives. pt-BR copy verbatim from the mock or marked `// authored:`. The Porto Seguro goldens stay byte-identical (the fixture has no display shot). Tests for every state named below.

**Never:** no new op, no contract or seed change, no second photo numbering in `apps/*`, no edit to `sprint-status.yaml` or `epics.md`, no emoji. Bruno's question 1 (do not print display shots at all) is not decided here: the default (print under the test, no number) stands.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| A1 edited, gerado | latest Rev. 2 created 2026-10-22, edited since, never marked sent | banner "Relatório gerado em 22/10 (revisão 2). Alterações desde então geram a revisão 3 — as anteriores continuam disponíveis abaixo."; each row "Rev. n — date — who — anterior às alterações" |
| A2 edited, emitido | Rev. 2 marked as sent (an `issue` op, `relatorio/status = emitido`, past its snapshot) then edited | the same sentence with "emitido" |
| A3 not edited | latest revision, nothing edited since | no banner, no tag; ready block as today |
| A4 no revision | no revision row | no banner; "Nenhuma revisão gerada ainda." |
| A5 working | phase `working` | no banner (rows keep their tag) |
| A6 N+1 arrives | generate N+1 after the edit | banner gone, no row tagged; the next edit brings it back naming N+1 |
| A7 read not landed | `editedSince` read for this snapshot not landed yet | no banner (no flash) |
| B1 numbering | photos p1, d1 (display), p2 in capture order | p1 = 1, p2 = 2, d1 absent |
| B2 section 7 | same | two photos, "Imagem 1", "Imagem 2" |
| B3 section 9 | sheet with d1 captioned "Leitura do megômetro" | after the test tables: "Leitura do megômetro." (no "Imagem") |
| B4 section 9 uncaptioned | d1 without caption | the full stamp (`photoStampFull`) alone |
| B5 remove/restore | d1 removed then restored | p1, p2 numbers unchanged |
| B6 screen | gallery, sheet strip, caption dialog, point editor | no badge, no "Imagem N" on d1; picker omits d1; caption saved on d1 toasts "Legenda salva" |

</intent-contract>

## Code Map

Part A (Story 16.2), lane A only:
- `packages/domain/src/print/revisions.ts` -- `revisionRowSegments` (line ~62) composes the row; add the banner sentence, the tag and the marked-sent rule here. `formatDayMonthOfInstant` (`format/datetime.ts` l.257) gives "dd/mm" as the Sumário banner uses (`relatorio/status-advance.ts` `issuedBannerText`, read-only reference).
- `packages/domain/src/print/revisions.test.ts` -- unit cases.
- `packages/domain/src/index.ts` re-exports `print/revisions.ts` and `photos/numbering.ts` with `export *`: no barrel edit needed by either lane.
- `apps/web/src/db/generate-store.ts` -- `editedSinceSnapshot` (l.72) shows how to read pulled ops past a snapshot (`[relatorio_id+seq]`), acked and unsent outbox rows; add `markedSentSince(db, relatorioId, snapshotSeq)` and a live hook beside `useEditedSince`/`useEditedSinceRead` (l.92/l.142). Test in `generate-store.test.ts`.
- `apps/web/src/surfaces/export/use-generate.ts` -- exposes `edited`, `revisions`; add `markedSent` and whether the edited read landed (`useEditedSinceRead`), or compute the banner text and `beforeEdits` there from kernel calls.
- `apps/web/src/surfaces/export/export-dialog.tsx` -- title `h2.dialog-title` (l.~433); "Revisões" rows (l.~571). Render the banner right under the title; append the tag to `.rev-text` after `segments.after`.
- `apps/web/src/surfaces/export/export-dialog.test.tsx` -- three states (edited gerado/emitido, not edited, no revision) and working.
- `e2e/export.spec.ts` -- E4-E2E-001 (l.331): after the setup edit (l.~352-364) assert banner (emitido: revision 1 was marked as sent at l.~347) and tag on the row; after revision 2 arrives (l.~380) assert no `.banner` in the dialog and no tag. Extend, never duplicate.
- `apps/web/src/copy/pt-br.ts` -- only if a static word is truly needed (prefer kernel text).
- Mock: `mockups/prototype/screens/73-exportar.html` l.66 `<div class="banner" role="status"><span class="banner-text">…</span></div>`; `.banner` is styled in `components.css`.

Part B (Story 16.3), lane B only:
- `packages/domain/src/photos/numbering.ts` -- `NumberableFile` gains `reading_kind?: string | null`; `numberPhotos` filters `reading_kind !== 'display'`. The ONE filter.
- `packages/domain/src/print/section-7.ts` -- `section7Photos` (l.55) iterates `livePhotos` and `numbers.get(photo.id)!`: keep only numbered photos.
- `packages/domain/src/print/section-9.ts` -- `PrintPhoto.number` (l.98) becomes `number | null`; `photoLine` (l.799) and `sheetPhotos` (l.807): a display shot prints in `other` with the caption sentence alone (same closing rule `CLOSED_CAPTION`) or, uncaptioned (`isUncaptioned`), `photoStampFull(photo)`. Do not touch `storedValueText` (Story 16.4, batch e16c).
- `packages/domain/src/print/section-8.ts` -- reads `numberPhotos`; no change expected beyond what follows (a token to a display shot resolves as an unnumbered photo, see Open questions).
- `packages/domain/src/audit/input.ts` -- `photoLine(fileId, number, …)` (l.171) gets `number | null`; a display shot's ref label is `captionPhotoLabel(null)` ("Foto", `photos/gallery.ts` l.227).
- `packages/domain/src/points/refs.ts` -- no number logic today; add its test case only if a helper is needed (kernel tests below cover the resolution through `resolvePhotoTokens`).
- Tests: `photos/order.test.ts` or a new `photos/numbering.test.ts`, `print/section-7.test.ts`, `print/section-9.test.ts`, `print/section-8.test.ts`, `points/points.test.ts`, `audit/audit.test.ts`.
- Web (number badge / picker / toast), each must pass `reading_kind` when it builds `NumberableFile`s by hand: `apps/web/src/surfaces/photos/gallery-surface.tsx` (l.122, l.234, l.381), `photos/photo-caption-dialog.tsx` (l.29), `ficha/sheet-photos-section.tsx` (l.32), `ficha/use-ficha-photos.ts` (l.123), `ficha/nameplate-suggestions.tsx` (l.126), `local/verificacoes-surface.tsx` (l.234), `points/point-editor.tsx` (l.131, picker l.~753), `points/points-surface.tsx` (l.80, 258, 323), `points/photo-ref-tile.tsx`; tile rows carry `reading_kind` (`db/photo-store.ts` l.33). Their existing tests beside them.
- `e2e/display-shots.spec.ts` (new) and `e2e/support/groups.ts` `SERIAL_SPECS` entry; `scripts/e2e.test.ts` stays green. Models: `e2e/read-display.spec.ts` (camera and "Ler visor" burst, `support/photos.ts`), `e2e/photo-numbers.spec.ts` (fixture, export, DOCX structure), `e2e/export-visual.spec.ts` (PDF text).

Shared (orchestrator, after the lanes): `_bmad-output/specs/spec-fasor/glossary.md`, `source-deltas.md` rows 123/124, `docs/kbs/log.md`, `docs/kbs/architecture/files-and-photos.md`, `docs/kbs/architecture/rendering.md`, `mockups/MOCK-GUIDE.md`.

## Tasks & Acceptance

**Execution, Part A: Story 16.2 (lane A):**
- `packages/domain/src/print/revisions.ts` -- add `revisionsBeforeEditsBanner(latest: Pick<RevisionRow,'number'|'created_at'> | null, state: { edited: boolean; markedSent: boolean }): string | null` (null with no revision or not edited; "Relatório {emitido|gerado} em dd/mm (revisão N). Alterações desde então geram a revisão N+1 — as anteriores continuam disponíveis abaixo."), `REVISION_BEFORE_EDITS_TAG = ' — anterior às alterações'` (`// authored:`), `revisionRowSegments(row, whoName, beforeEdits = false)` gaining `tag: string` ('' or the tag), and `markedSentSince(ops, snapshotSeq)`: true when any `put` on `relatorio/status` with value `emitido` is among the given ops (pulled with `seq > snapshotSeq`, or acked/unsent); "gerado" stands otherwise.
- `apps/web/src/db/generate-store.ts` -- read the relatório's status ops past the snapshot the way `editedSinceSnapshot` reads ops, call `markedSentSince`; live hook.
- `apps/web/src/surfaces/export/use-generate.ts` and `export-dialog.tsx` -- banner under the title in every phase but `working`, only once the edited read landed for the latest snapshot; tag on every row while the banner condition holds (edited since the latest revision), not hidden in `working`.
- Tests: `revisions.test.ts` (gerado, emitido, number, date, null cases, tag, `markedSentSince` with ops before/after the snapshot and unsent), `generate-store.test.ts` (marked-sent read), `export-dialog.test.tsx` (states A1-A5), `e2e/export.spec.ts` E4-E2E-001 extended and asserting the committed status op is unchanged by the banner (no write).

**Execution, Part B: Story 16.3 (lane B):**
- `photos/numbering.ts` -- the filter; then `section-7.ts`, `section-9.ts`, `audit/input.ts` follow; web call sites pass `reading_kind` and hide badge/number words on unnumbered tiles, the point editor's picker lists only numbered photos, toasts use `captionSavedText(null)` for a display shot (already the `?? null` path once the number is absent).
- Kernel tests: `numberPhotos` with a display shot among numbered photos (B1, B5), `section7Photos` (B2), `sheetPhotos` via `section9`'s public layout (B3, B4, and a sheet without display shots unchanged), section 8 / `resolvePhotoTokens` numbers unchanged around a display shot, audit input label.
- `e2e/display-shots.spec.ts` (`@p0`): on a measurement cell take a "Ler visor" burst (camera stubbed as `read-display.spec.ts` does), capture a site photo, assert the gallery and strip badges (site photo numbered, display shot without badge), assert the committed file row's `reading_kind: 'display'` in the store, generate the preview (or a revision) and assert from the PDF text (or DOCX structure, from section headings) that section 7 holds the expected count and section 9 prints the display shot's line without "Imagem"; add the spec to `SERIAL_SPECS` with its reason.

**Acceptance Criteria (from epics.md, Story 16.2):**
- Given a relatório with a latest revision and something edited since its snapshot (`editedOnDevice`), when the Export dialog opens in any phase but `working`, then the mock's banner stands under the title with the kernel's sentence ("gerado", or "emitido" when that revision had been marked as sent) and every "Revisões" row ends with " — anterior às alterações"; `apps/web` composes neither.
- Given nothing edited since the latest revision, when the dialog opens, then no banner and no tag; `nextEditNote` and "Marcar como enviado ao cliente" are as today.
- Given the banner shown, when "Gerar relatório" generates revision N+1 and it arrives, then the banner leaves and no row carries the tag; after the next edit the banner returns naming N+1.
- Given no revision yet, when the dialog opens, then nothing changes ("Nenhuma revisão gerada ainda.").

**Acceptance Criteria (from epics.md, Story 16.3):**
- Given photos of which some carry `reading_kind: 'display'`, when `numberPhotos` runs and the document prints, then display shots get no number, the others number 1, 2, 3… with no gap, section 7 lists only numbered photos, section 8's "conforme Imagem N" and the audit references resolve on the same numbers, and the Porto Seguro goldens still match.
- Given a sheet with a display shot, when its RELATÓRIO DOS ENSAIOS prints, then the shot prints after the test tables, its line the caption sentence alone ("⟨legenda⟩." or, uncaptioned, the full stamp), never "Imagem N:"; a sheet without display shots prints as today.
- Given the gallery, the sheet strip, the caption dialog and the point editor, when they show a display shot, then no number badge and no "Imagem N", the picker does not offer it, the other numbers match the document, and a caption saved on it toasts `captionSavedText(null)`.
- Given a display shot removed or restored, when the numbers recompute, then the numbered photos keep their numbers.

**Docs and records (orchestrator):** `glossary.md` gains "display shot"; `source-deltas.md` rows of 16.2 and 16.3 gain a dated "built" note; `docs/kbs/log.md` lines; the KB concepts `architecture/files-and-photos.md` and `architecture/rendering.md` updated where they describe numbering or section 7/9; `MOCK-GUIDE.md` notes the Export banner is built.

## Open questions (kept as the conservative reading, listed in the PR)

- A point of attention that referenced a display shot before this change resolves it as an unnumbered photo ("imagem removida" in section 8, the removed label on screen), the kernel's existing rule for a token without a number. Bruno to say whether such a reference should print otherwise.
- "emitido" is read from a `relatorio/status = emitido` op past the revision's snapshot; an `issue` later undone still reads "emitido" (narrowing).
- The audit's ref label for a display shot is the existing "Foto" (`captionPhotoLabel(null)`), no new copy.

## Verification

**Commands (tools container, `podman compose --profile tools run --rm --user root tools …`):**
- Lanes: `pnpm test:unit -- <own test paths>` -- green.
- Gate: `pnpm lint`, `pnpm static`, `pnpm test:api`, `pnpm test:unit`; then under `lockf /tmp/fasor-verify.lock`: `pnpm exec tsx scripts/e2e.ts e2e/export.spec.ts e2e/display-shots.spec.ts e2e/photo-numbers.spec.ts e2e/points.spec.ts e2e/photos.spec.ts e2e/review-field-defects.spec.ts e2e/review-field-defects-2.spec.ts e2e/verificacoes-local.spec.ts e2e/read-display.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green.

## Spec Change Log

## Review Triage Log
