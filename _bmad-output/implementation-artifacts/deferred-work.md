# Deferred work ledger

Every deferred item from the eight Epic 1 story specs (`spec-1-1` through `spec-1-8`), rebuilt
2026-09-22 per Epic 1 retrospective action item A10
(`_bmad-output/implementation-artifacts/epic-1-retro-2026-09-22.md`, finding F-DEBT-1). Every
item from every source spec is represented; a cross-spec duplicate gets one entry under each
spec it originated from, each cross-referencing its sibling rather than repeating the full
evidence twice. Every "closed" or
"partially closed" state below was verified against the current code and git history as part of
this rebuild, not copied from the retrospective's estimate (dates below are 2026-09-22 unless a
commit's own date differs). Also carries forward the deferred items from PR #9's own remediation
spec (`spec-epic-1-fix-identity-and-kernel.md`, action items A2/A4/A7/A8), merged in when
`origin/main` was merged into this ledger's own PR.

Fields: `source_spec` (one or two spec files), `summary`, `evidence`, `class` (`bug`, `debt`,
`test-gap`, `docs`, `post-mvp`), `state` (`open`, `closed (commit <short-sha> "<subject>")`, or
`partially closed: ...`).

Since 2026-11-24 the closed rows live in `_bmad-output/implementation-artifacts/deferred-work-archive.md`, moved there verbatim under the same section headings after the audit of that day; a section whose rows are all closed keeps its heading and one placeholder line here.
From now on a row moves to the archive when it closes: strike its state through, add the closed state beside it, then move the whole row under the same heading in the archive.

---

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Define retention/compaction for `remote_ops`.
  evidence: No retention or compaction policy exists for the `remote_ops` Dexie store in `apps/web/src/db/`.
  class: debt
  state: ~~open~~ re-owned (owner: Matheus, via `bmad-correct-course`; 2026-09-30, Epic 11 batch C: Epic 11 has no sync retention story, so no batch can own it; a correct-course pass decides whether to add one (R10-12 also expected that story to split `engine.ts` and `apply.ts`) or to date it post-MVP)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-ui-hygiene.md`
  summary: Esc on the draft toast leaves focus on body; on a cold load with the api down the badge reads "Sincronizado" for about 2 s until the first cycle ends.
  evidence: Independent review of PR #12. The toast has no opener to return focus to; the first-cycle window needs a "not yet confirmed" badge input the kernel does not have. Both low; revisit with the Epic 5 sheet toasts and the badge.
  class: bug
  state: ~~open~~ partially closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B4: Esc on a toast returns focus to the element focused before, else `main`; `toast.test.tsx`). The "Sincronizado" before the first cycle stays open, re-owned to Matheus (UX): what the badge says before the server has answered once is a new badge state, a product choice

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Scope the shell pin per user, or hold while any user on the device has a backlog.
  evidence: The pin is one sentinel per origin while the outbox is per user (releng-{user_id}). User B signing in with an empty outbox posts hold:false and promotes the waiting worker, releasing user A's pin. PR #8's promotion already behaved this way. Severity medium.
  class: bug
  state: ~~open~~ open, re-owned 2026-09-28 by batch C2 (owner: Matheus with the architect, AD-8): a per-user pin with promotion refused while another user holds was built and withdrawn, because a user who never signs in again would keep every other user of the device on the old shell forever; the choice between that and the current device-wide pin (or an expiring hold) is a product decision

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: `sync_state.files_pending` is written by the upload phase and read by no surface.
  evidence: Internal review pass 2026-09-22. A grep over `apps/web/src` finds only the engine writing it; the badge that consumes it belongs to a later epic, so a failed or pending upload is invisible to the user today. Severity medium.
  class: debt
  state: ~~open~~ partially closed (2026-09-25, Story 6.2: a pending or failed photo upload is now visible on its own tile, "Aguardando envio" / "Erro — Tentar novamente" from the kernel's `photoUploadState`; `files_pending` itself is still read by no surface, and the gallery header count `photosPendingText` is Story 6.3's) -- progress 2026-09-25, Stories 6.3-6.5: the gallery header counts the pending, failed and uncaptioned photos (`galleryCounterText`) and Sumário row 7 names the unsent ones (`photos_pending_upload`); `files_pending` is still read by no surface, so non-photo files (logos, certificates) stay visible only on their own tiles

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: Several `isoRows` entries in `packages/domain/fixtures/porto-seguro/data.ts` use the raw string `'2T'` for a `1 MINUTO` insulation capture cell (4 occurrences: `SUBSOLO_TRANSFORMERS` TR-1/2/4, both `COBERTURA_A`/`COBERTURA_B` TR-COB blocks), while the generator always tags that cell with unit `GΩ`, producing a composite that reads as neither a clean number nor a clear overflow marker.
  evidence: Blind Hunter review pass, 2026-09-23. Likely a field abbreviation for "> 2 TΩ" (an instrument overflow reading common on megohmmeters), but the correct value/unit representation is a domain judgment call, not a safely guessable code fix. Severity medium.
  class: debt
  state: ~~open (Matheus/Bruno review requested, alongside the not-tested-designation item above)~~ open, re-owned 2026-09-28 by batch C2 (owner: Matheus with Bruno, E7-A5): what "2T" means (an overflow "> 2 TΩ" or a value) is a domain decision, and `data.ts` is being edited by batch C1 | 2026-11-24 audit: meaning answered (Bruno rev08: "> 2 TΩ" is the instrument limit, `docs/context/epic-23/respostas-bruno-rev08-2026-11-08.md`, gitignored); left: the fixture still stores the raw "2T" (`packages/domain/fixtures/porto-seguro/data.ts:362,381,420,835`), owner: agent

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: The `unchanged` short-circuit follows AD-15's family set, so a registry edit (client name or CNPJ, Empresa lines) or a `user` edit (the responsible's registration) after a revision does not count as an edit: a second "Gerar relatório" answers the old revision although the printed document control would differ.
  evidence: `apps/api/src/http/generate.ts` `editedAfter` over `editedSince` (`packages/domain/src/status/edited-since.ts`, families `relatorio/setup, location, block, sheet, file (photo), point, equipment`). A design decision for the architect (AD-15): widen the set, or let the dialog offer a forced regeneration.
  class: debt
  state: ~~open~~ open, re-owned 2026-09-28 by batch C2 (owner: Matheus with the architect): widening `EDITED_SINCE_FAMILIES` also moves the Emitido to Em revisão transition (AD-22), so it is an AD-15 decision, not a local fix

- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-6-5-gallery-import-and-captions.md`
  summary: Story 6.5 open question, conservative choice taken: a composer opened on a caption that is not what its prefilled rows compose (a hand-edited caption, or a sheet shot captioned on the ensaios step, whose activity the row does not store) opens in "Editar texto" with the stored text.
  evidence: `apps/web/src/surfaces/photos/caption-composer.tsx` `ComposerBody`; the photo row stores no step or test key, so `contextCaptionParts` cannot rebuild a test activity.
  class: deferred
  state: open (owner: none; revisit with Bruno)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-7-3-photo-record-points-certificates.md`
  summary: Open questions for Bruno, conservative choice taken. (1) Stored `origin: not_tested` points print as their own bullets and are not merged like derived groups. (2) A point's Ação recomendada prints after its text in the same bullet. (3) A photo the server does not hold keeps its number in section 7 and prints "(foto não disponível no servidor)" in place of the image. (4) A sheet's copied `cert_number` with an empty registry value is not a mismatch. Authored printed strings awaiting his review: `PHOTO_UNAVAILABLE_TEXT`, `REMOVED_PHOTO_REF_TEXT` ("imagem removida"), the derived-group sentence (one and many), the certificate placeholder "Certificado não anexado: ⟨código⟩ — ⟨nome⟩ (nº ⟨certificado⟩)", `certificatesCountText` and the two gallery lines ("Números da revisão N", "Números provisórios — serão definidos na revisão N+1").
  evidence: The spec's Design Notes ("For Bruno" and "Open questions").
  class: design
  state: open (owner: Bruno, with the Epic 7 review); 2026-11-10 (evening): question (1) and the derived-group sentence are superseded by fix batch e24h (no automatic points), since only stored points print, each as its own bullet. Questions (2) to (4) and the other strings stay open

- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-section-9-equipment-sheets.md`
  summary: Narrowing, Story 7.1. No surface writes `block/{id}/feeds_block_id`, so every alimentação cable of a relatório created in the app prints unpaired, last in its transformer group; only the Porto Seguro fixture pairs its five 1° Subsolo cables.
  evidence: `groupForPrint` pairs by `feeds_block_id` only (never by name); the op path exists (`ops/path.ts`), no web writer.
  class: deferred
  state: open (owner: none; open question for Matheus: a pairing control on the cable sheet, or pairing at instantiation)

- source_spec: spec-epic-7-8-fix-qa.md
  summary: E78-Q12. "82 aguardando envio" (pre-issue row, gallery header, tiles) reads as if this device will send the photos; on an office device that never held them the server simply lacks them. The gallery's static note "Os números são provisórios até a exportação" sits beside "Números da revisão 1".
  evidence: `reviews/epic-7-8-review-qa.md` E78-Q12; tracked under E7-A3 (2026-09-28).
  class: question
  state: open (owner: Matheus with Bruno for wording (E7-A5); then the next batch touching the gallery or pre-issue)

- source_spec: spec-9-1-read-the-instrument-display-with-ler-visor.md
  summary: Story 9.1 narrowing: pending thermo-hygrometer suggestions count in Sync status ("Leituras") but not in the pre-issue section 9 row or the Sumário, which read sheet suggestions only.
  evidence: `livePendingSuggestions(blocks, pending, locations)` keeps env rows only when `locations` is given; `db/suggestion-store.ts` `readingCountRows` passes them, `relatorio/pre-issue.ts` does not.
  class: question
  state: ~~open (owner: Epic 9 integrated review)~~ ~~open (owner: Story 10.4 (batch S); 2026-09-29, E9-A5)~~ open (owner: Matheus, product question; 2026-09-29, Story 10.4: not small. The section 9 row "N fichas com sugestões" counts sheets, and a thermo-hygrometer suggestion sits on a cabine, not a sheet, so counting it there needs a new row or wording, a product decision; Sync status keeps counting it under "Leituras")

- source_spec: spec-9-3-9-5-captions-and-nc-drafts.md
  summary: Stories 9.3/9.5 open questions (conservative reading kept): the tile keeps the mock's "Confirmar" while the composer and the NC draft say "Usar" (the story); "Confirmar todas" confirms every suggestion of the relatório, not only the filtered cabine; `captions_suggested` is an `info` row (a warning, never blocking) beside the unchanged `photos_uncaptioned`, and the Export dialog counts it among its "N avisos" (not an explicit kind), while the Sumário row 7 names it.
  evidence: `spec-9-3-9-5-captions-and-nc-drafts.md` Open questions; `packages/domain/src/relatorio/pre-issue.ts` `EXPLICIT_KINDS`.
  class: question
  state: open (owner: Matheus with Bruno for wording)

- source_spec: `_bmad-output/implementation-artifacts/spec-10-1-merge-by-rule.md`
  summary: The per-batch savepoint of ledger 1161 opens one Postgres subtransaction per multi-op client batch; a push holding more than 64 of them overflows the subxact cache (the `pg_subtrans` slowdown `applyOps` documents). Also unverified: `batches()` and `applyOps` move a batch's later ops to its first op's position, which reorders an interleaved same-path op, if outbox coalescing can produce one.
  evidence: Porto Seguro replay 24.4 s before, 24.9 s after (its log holds no multi-op batch); a 500-op offline-day push was not measured. A dry-run of the batch in memory before a savepoint-free apply would avoid it. Edge Case Hunter and Verification Gap review of Story 10.1. Severity medium (unverified).
  class: debt
  state: ~~open (owner: Epic 11, sync performance and retention)~~ re-owned (owner: Matheus, via `bmad-correct-course`; 2026-09-30, Epic 11 batch C: Epic 11 has no sync performance or retention story, so no batch can own it; a correct-course pass decides whether to add one (R10-12 also expected that story to split `engine.ts` and `apply.ts`) or to date it post-MVP)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-field-defects.md`
  summary: F-06 (review 2026-09-30): bulk actions and copies on a 94-block relatório take 2 to 8 s to show any feedback ("Marcar os restantes como Conforme" 7.9 s, "Repetir da ficha anterior" 2.6 s, "Igual à" 2.3 s, an instrument tick in Etapa 4 2.0 s). The cost is the commit path and the live queries (K-1, K-2, W-1, W-3, W-5, W-6, W-8, batch rfp); optimistic sheet state would break AD-13, so batch rff does not change it.
  evidence: `reviews/full-review-2026-09-30/2-ux-review.md` F-06 and section 2's timings; `reviews/full-review-2026-09-30/1-code-quality.md` K-1, K-2, W-1 to W-8.
  class: debt
  state: open (owner: wave-2 QA: re-measure the four taps on a 94-block relatório with `commit-to-render.perf.spec.ts` after rfp merges; reopen as a bug if any still takes over 1 s)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-field-defects.md`
  summary: F-12, badge half (review 2026-09-30): after a 401 the Sync badge still reads "Sincronização: sem conexão" beside the "Sua sessão expirou" banner. A session state on the badge is a new product state no mock draws, and the badge's state is `state/sync.tsx` and `sync/policy.ts` (batch rfp). Batch rff fixed the Export dialog half (the session words and "Entrar de novo").
  evidence: `reviews/full-review-2026-09-30/2-ux-review.md` F-12 (`01d-home-session-expired-1280.png`); `apps/web/src/state/sync.tsx`, `apps/web/src/sync/policy.ts`.
  class: question
  state: open (owner: Matheus for the badge's words; then batch rfp or wave 2)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-field-defects.md`
  summary: K-13 (review 2026-09-30): three readers of `block.not_tested` against the seed's reasons, each with its own "Outro"/typed-text rule: `relatorio/tree.ts` `notTestedReasonText`, `relatorio/parecer.ts` `notTestedReason` (prints in the golden), `points/derived.ts` `reasonOf`. One `notTestedReasonOf(block)` in `relatorio/not-tested.ts` is the fix; two of the three files are batch rfp's and one prints in the golden, so wave 1 leaves it.
  evidence: `reviews/full-review-2026-09-30/1-code-quality.md` K-13.
  class: debt
  state: open (owner: wave 2, batch rfr)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-kernel-device-perf.md`
  summary: Review fixes rfp (2026-09-30) left four parts outside its files. (1) The `getDefinition` try/catch wrappers outside its files still need moving to the new `findDefinition`/`findSeed` (K-20). (2) `checks/calibration.ts parseCalendarDate` and `format/datetime.ts splitDate` are still duplicates (K-20). (3) `relatorio/section-variables.ts section3Text` is still a dead export (K-19). (4) Home still reads the outbox itself instead of receiving the SyncProvider's rows (W-1).
  evidence: `reviews/full-review-2026-09-30/1-code-quality.md` K-19, K-20, W-1; the spec's Boundaries name the files involved, which belong to `rff`.
  class: debt
  state: open (owner: batch `rfr`, wave 2)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-6-structure-readings-on-bedrock.md`
  summary: Run `bedrock-eval` on real Porto Seguro nameplate photos (a git-ignored folder under `docs/media/` with `<name>.expected.json` files), pick the cheapest candidate within 1-2 accuracy points of Claude Haiku 4.5 as `bedrock_model_id`, then narrow `infra/bootstrap/iam.tf` to the chosen models (and the escalation model). Until then the default stays Haiku 4.5 and IAM keeps all five models (source-deltas 2026-10-05, Story 11.6).
  evidence: `apps/api/src/scripts/bedrock-eval.ts` (header: `--dir`, the expected-values format, the credential flow); `infra/bootstrap/iam.tf` statement `InvokeStory116Models`; `infra/production/variables.tf` `bedrock_model_id`.
  class: post-mvp
  state: open (owner: Matheus, once real nameplate photos and their expected values are in `docs/media/`)

## Deferred from: code review of spec-11-6-structure-readings-on-bedrock (2026-10-06)

All rows closed; see deferred-work-archive.md

## Deferred from: MVP hands-on review fix batch (2026-10-06), split into three PRs

- source_spec: `_bmad-output/implementation-artifacts/spec-11-11-sheet-photo-strip-and-direct-picker.md`
  summary: The "Fotos da ficha" strip retry pill (`onRetry` -> `retryUpload`) has no e2e of its own; the pill is proven on the checklist row only.
  evidence: review VG5, 2026-10-06; one-line wiring on the shared PhotoRow.
  class: test
  state: ~~open (owner: epic QA)~~ re-owned (2026-10-14, E14-A2): owner the next story touching the "Fotos da ficha" strip, which adds the e2e; the Epic 11 QA ran without it.

- source_spec: `_bmad-output/implementation-artifacts/spec-11-11-sheet-photo-strip-and-direct-picker.md`
  summary: The "Fotos da ficha" strip draws caption, stamp and pill only; the mock (`60-ficha.html` 781) also prints the checklist row line ("Item 8 · Contatos · NC") and "Enviada" on an uploaded photo, and no test opens the strip on a not-tested (read-only) sheet.
  evidence: review BH5/BH6, 2026-10-06; the story's AC names badge, pill and caption.
  class: debt
  state: ~~open (owner: epic QA)~~ re-owned (2026-10-14, E14-A2): owner the next story touching the "Fotos da ficha" strip; the Epic 11 QA ran without it.

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-layout-copy-3.md`
  summary: Sumário row 11 reads "3 instrumentos · nenhum certificado anexado · Nenhum instrumento em Dados do relatório" when the sheets copied instruments but setup ticked none; the two parts are both true (sheets vs setup) but read as a contradiction (review 2026-10-07, BH2).
  evidence: `packages/domain/src/relatorio/sumario.test.ts` Porto Seguro case; the setup row wording comes from Story 7.5 and predates batch 3. A reword such as "nenhum marcado em Dados do relatório" would settle it; copy decision for Bruno.
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-plate-reading.md`
  summary: Independent review r8read-rules-3 (PR #115): the OCR/structuring contract still documents a `date` value as `YYYY-MM[-DD]` (`structuringValueSchemaFor('date')`) while the reading accepts a bare plate year ("2012") before that check and the Bedrock prompt (`bedrock-structuring-2`) asks for `YYYY` when only a year is printed. A consumer validating against `structuringValueSchemaFor` would drop every bare-year plate date again.
  evidence: `packages/domain/src/contract/ocr.ts:131` and `:163`, the committed `services/ocr/contract/ocr-contract.schema.json:276`; `packages/domain/src/reading/value.ts` `normalizeReadingValue` (bare year returned first). The batch spec forbade editing `contract/ocr.ts`.
  class: debt
  state: open (owner: the next change to `contract/ocr.ts`: add `YYYY` to the date shape and re-export the schema)

- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.3's touch spec (`e2e/photo-zoom.durability.spec.ts`) is skipped on `durability-webkit`: Playwright's WebKit build cannot store a photo Blob in IndexedDB ("UnknownError: Error preparing Blob/File data to be stored in object store"), so no photo exists there to zoom. The WebKit leg of the 13.3 DoD is a manual iPad pass (Epic 13 batch C, 2026-10-07).
  evidence: `test.skip` on `browserName === 'webkit'` at the top of the spec; it runs green on desktop Chrome and Android Chrome emulation.
  class: debt
  state: ~~open (owner: epic QA, manual iPad pass)~~ re-owned (2026-10-14, E13-A4): owner Matheus's device run, `test-artifacts/manual/offline-proof-script.md` steps 11 and 13 (E13-A3); the Epic 13 QA ran without the iPad pass.
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 (WAIT-3): the palette lists every live panel photo awaiting its dialog on that location, including one shot on another device whose dialog is still open there, so two devices could confirm the same photo and create the block twice (review 2026-10-07).
  evidence: `packages/domain/src/relatorio/panel.ts` `panelPhotosAwaiting` filters by kind, target and liveness only. Limiting it to this device's or author's photos is a product rule.
  class: question
  state: ~~open (owner: Matheus)~~ decided (2026-10-14, E13-A4, recording Matheus's answer of 2026-10-07 under Story 13.5 in `epics.md`): the palette lists the awaiting photos of every device. The two-device double-confirm risk this entry names stays open, routed: owner the next story touching `panelPhotosAwaiting` or the panel confirm, which adds a 10.3-style duplicate check at confirm (a second confirm of one photo is refused or merged), else Matheus accepts the risk with a dated line.
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 review (known open, unverified): the Sumário's `?panel=` effect drops the parameter if the photo is not yet in `snapshot.files` on its first run, so "Ver" would open the Sumário without the dialog; 13.5-E2E-005 passes, the tree mounting with the snapshot loaded.
  evidence: `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `PANEL_PARAM` effect. A slow-snapshot test would settle it.
  class: debt
  state: ~~open (owner: epic QA)~~ re-owned (2026-10-14, E13-A4): owner the next story touching the Sumário's `?panel=` effect, which adds the slow-snapshot test; the Epic 13 QA did not settle it.
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 review (known open): the panel dialog's elapsed wait text ("Lendo… N s" after 10 s) and the cancel sweep's order before auto-confirm (a cancelled reading equal to a typed value must be discarded, not auto-confirmed) have no test.
  evidence: `panel-capture.tsx` `panelWaitText`; `apps/web/src/sync/engine.ts` post-pull sweep; neither is referenced by a test.
  class: debt
  state: ~~open (owner: Epic 13 fix batch)~~ re-owned (2026-10-14, E13-A4): owner the next story touching `panel-capture.tsx` or the post-pull sweep in `sync/engine.ts`; the Epic 13 fix batch merged without it, it is not among the items of the carry-over batches co14a/co14b (E14-A7), and on 2026-10-14 `panelWaitText` is still referenced by no test.
- source_spec: `epic-13-retro-2026-10-08.md` (E13-A1 wave gate)
  summary: Building the api/tools image from scratch in a new compose project on this macOS podman host fails: the LibreOffice step downloads the arm64 packages while dpkg reports an amd64 system ("package architecture (arm64) does not match system (amd64)"). Existing images run fine, so new worktrees reuse them with `podman tag`. Likely a `TARGETARCH` versus the base image platform mismatch in the Dockerfile's LibreOffice case.
  evidence: `test-results/wave-e13/attempt1/verify-plain.log` (E13-A1 worktree) around line 675; the `RUN arch="${TARGETARCH:-$(dpkg --print-architecture)}"` step.
  class: defect
  state: open (owner: the next carry-over batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md` (independent review of PR #116, r8gate-rules-2)
  summary: `playwright/no-wait-for-timeout` warns on e2e/** since PR #116, with an allow-list of the files whose fixed waits are the gesture or schedule under test (`e2e/support/taps.ts`, `e2e/lost-taps.durability.spec.ts`). The other 24 `waitForTimeout` calls warn on every lint run until each is shrunk, sized from an app constant or allowed (review TST-7).
  evidence: `eslint.config.js` (the e2e block and its allow-list); `pnpm lint` reports 24 warnings, 0 errors.
  class: debt
  state: open (owner: the next carry-over batch, with TST-7)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-photo-failures.md`
  summary: Review 2026-10-08 DG-2, narrowed (known open): the r8cap batch adds "Manter o digitado" on each replace line and discards a replace suggestion when a different value is typed; the group action "Manter os digitados" and the tree's "Concluída · N sugestões" (a concluded ficha with pending suggestions reads as concluded while the Sumário does not count it) are not built. An identical retype still writes nothing (no discard).
  evidence: `review-field-ux-and-code-2026-10-08.md` DG-2; `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` (r8lay's file); `packages/domain/src/relatorio/progress.ts:41-51`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-photo-failures.md`
  summary: Review 2026-10-08 DB-4, narrowed (known open): the camera now says "Salvando a foto…" / "Salvando as fotos…" and disables the shutter and "Concluir" until it closes, but still closes only once each shot is stored, which waits for the GPS fix (up to 5 s, `FIX_WAIT_MS`). Closing before the fix needs a later coords op on the photo (a contract change); measure the close on a real tablet first.
  evidence: `review-field-ux-and-code-2026-10-08.md` DB-4; `apps/web/src/files/geolocation.ts:10, 93-100`; `apps/web/src/surfaces/ficha/use-photo-capture.ts` `shoot`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-photo-failures.md` (r8cap batch review, E10/E11)
  summary: Review 2026-10-08 CAPT-V1, known open: a reread that reads nothing after an earlier run's suggestions were discarded ("Cancelar", then "Ler de novo") reads `done`, not `empty`, so the plate row or the display cell shows no line. `plateReadingView` and `targetLine` decide `empty` from any suggestion row citing the photo; telling the latest run apart needs the photo's newest `reading_run_id` on the device (a contract addition).
  evidence: `packages/domain/src/relatorio/plate-suggestions.ts` `plateReadingView`; `packages/domain/src/relatorio/measurement-suggestions.ts` `targetLine`; `apps/api/src/jobs/reading/job.ts:241-262` (each run writes its rows with its own `reading_run_id`).
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md`
  summary: Review 2026-10-08 AIB-1, the parecer part (known open): the r8conc batch adds the `conclusion_stale` pre-issue row for the sheets' conclusion texts only; a confirmed or edited parecer text whose basis no longer matches section 10's values has no `parecer_stale` row, so the Sumário and the Export dialog do not say it.
  evidence: `review-field-ux-and-code-2026-10-08.md` AIB-1; `packages/domain/src/relatorio/pre-issue.ts` (`conclusion_stale` beside `conclusion_unconfirmed`); `packages/domain/src/relatorio/parecer.ts`. The batch's Never list excludes `parecer_stale`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md`
  summary: Open question: the review's 14.3 lists "+ D-7 observation" in the conclude batch, while the source-deltas row of 2026-10-08 lists only `text`, `text_status` and `text_basis`. The conservative reading ships: "Concluir ficha" never writes the D-7 sheet observation suggestion (`suggestedSheetObservation`); only the text's own "Confirmar" (and the observation's) writes it. Consequence (independent review of PR #121, 2026-10-09, r8conc-decision-1): on a Sem restrições sheet with NC observations, the old route (confirming the text later, which wrote the observation with it) is gone once "Concluir ficha" confirms the text, so the suggestion stays unwritten unless its own "Confirmar" is tapped, and no pre-issue row names it (the observation is required only with Com restrições).
  evidence: `review-field-ux-and-code-2026-10-08.md` 14.3; `source-deltas.md` row "Story 5.8: the composed conclusion text …"; `apps/web/src/surfaces/ficha/use-ficha-actions.ts` `conclude`; `apps/web/src/surfaces/ficha/conclusao-section.tsx` `confirmText`.
  class: debt
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md`
  summary: Open question (AIB-1): a stale edited conclusion text is named in the new `conclusion_stale` row ("Texto de conclusão desatualizado: <TAG>") but still prints in section 9 (`print/section-9.ts` prints an edited text always, drops a stale confirmed one). Whether a stale edited text should print, or block, is a product decision; AIB-16's single print rule stays out of this round.
  evidence: `packages/domain/src/print/section-9.ts` `conclusionParts`; `packages/domain/src/relatorio/pre-issue.ts` `staleConclusionNames`.
  class: debt
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md`
  summary: Wording review (Decision 1 of 2026-10-08: "Concluir ficha" confirms the composed text): the conclusion text helper still reads "… Impresso na linha Conclusão da seção 9 depois de confirmar." (mock copy) although "Concluir ficha" now confirms the text; Bruno may prefer "confirmado ao concluir a ficha", as the instrument picker says. The new kernel copy `conclusionStaleText` ("Texto de conclusão desatualizado: …", authored) is in the same review.
  evidence: `apps/web/src/copy/pt-br.ts` `ficha.conclusao.textHelper`; `packages/domain/src/relatorio/pre-issue.ts` `conclusionStaleText`.
  class: docs
  state: open (owner: Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (r8conc batch review, edge-case EC-1)
  summary: Known open: the conclude, the ficha's conclusion text field and Story 5.8's "Confirmar" compose with the TAG of the project's equipment row, removed rows included (`useProjectEquipment`, `rows.equipment`), while section 9 and the pre-issue rows read only the snapshot's live equipment rows. A live block whose equipment row was removed (a merge state) would get a text that reads stale at once in section 9 and the `conclusion_stale` row. Pre-existing divergence, not introduced by the fold.
  evidence: `apps/web/src/surfaces/ficha/use-ficha-actions.ts` `conclude`; `apps/web/src/surfaces/relatorio/relatorio-editor.ts:70-80`; `packages/domain/src/schemas/snapshot.ts` `buildSnapshot` (live equipment only). Settle by choosing one TAG source for the ficha, section 9 and pre-issue.
  class: bug
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (r8conc batch review, edge-case EC-7)
  summary: Open question: the new `conclusion_stale` row is summarized in the Export dialog ("N avisos — estão nas linhas do sumário", "Ver no sumário" leads to row 9, which names the TAGs), like its twin `conclusion_unconfirmed`; it is not in `EXPLICIT_KINDS`, so the dialog itself does not name the TAGs. A stale confirmed text is dropped from section 9 while the sheet still shows it, which fits the `EXPLICIT_KINDS` rationale ("the document then prints … the sheet did not name"); listing it by name is a one-word change once decided.
  evidence: `packages/domain/src/relatorio/pre-issue.ts` `EXPLICIT_KINDS`, `exportPrecheck`; `apps/web/src/surfaces/export/export-dialog.tsx:419-458`.
  class: debt
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Open question (review 2026-10-08 DE-6, DC-4): at 390 px the undo toast wraps to 4 lines ("Foto 28 removida do relatório · Desfazer · Fechar") and the arrival toast to 3-4; the report proposes one-line undo copy ("Foto 28 removida · Desfazer") and a 1-2 line cap. Copy from the mocks was kept; the batch only added the bottom room and the focused-field rule.
  evidence: `review-field-ux-and-code-2026-10-08.md` DE-6, DC-4; `apps/web/src/components/toast.tsx`.
  class: debt
  state: open (owner: coordinator, wording by Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Open question (review of PR #119, r8emit-rules-2): "Ver" on a reading-arrival toast opens the first sheet in tree order with a pending suggestion (Story 8.2 AC, epics.md:2019; FR-42), so when an earlier sheet holds older pending suggestions it opens that one, not the sheet the toast announced. The review loop had changed it to the announced rows first; reverted to the AC. Should "Ver" open the announced sheet first?
  evidence: `apps/web/src/state/reading-arrivals.tsx` `arrivalTarget`; epics.md:2019, :82; EXPERIENCE.md:379.
  class: debt
  state: open (owner: coordinator, decision by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DC-1): the transformer TTR at tablet widths stays a table (UX-DR40 "real table at every width", UX-DR74 "tables in full in landscape"); in a 657 px box (768 portrait with the strip, 1024 with the 320 px rail) its eight columns at their whole-word minimum (about 825 px, measured 2026-10-09 once the unit and the "Não medido" trigger wrap under the input: TAP 44, V 114 + 114, Calculado 113, captures 3 x 120, Condição 80) do not fit, so the table scrolls inside its own `.mt-scroll` box, the title row and the page still; from 1280 (864 px) it fits. Cards up to 1279 px, or an auto-collapsing rail while a sheet is filled (DC-8), are the alternatives the report proposes.
  evidence: `apps/web/src/surfaces/ficha/ficha.css` (block "Review fixes 2026-10-08 (batch r8lay)"); `ensaios-section.tsx` `.mt-scroll`; report DC-1, DC-8; spec Design Notes.
  class: debt
  state: open (owner: coordinator, decision by Matheus and Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DA-6): the phone Sumário tree rows keep the drag handle and the Position box on every row (about 100 px left for TAG, type and state); the batch only keeps words whole. Hiding the handle or the Position box below 768 px (reorder from the menu or a "Reordenar" mode) is a product change.
  evidence: `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `SumarioEquipment`; `relatorio.css` (block r8lay DA-6); report DA-6.
  class: debt
  state: open (owner: coordinator, decision by Matheus and Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DB-2): a unit change on an open sheet still rewrites the value at once with no "Desfazer", and on a concluded sheet the batch only turns the first tap into "edit the cell" (the kernel's `unitTapNeedsEdit`); the report also proposes the unit as a choice with Desfazer once a value exists, or a confirmation on a concluded sheet.
  evidence: `apps/web/src/surfaces/ficha/measurement-field.tsx` `tapUnit`; `packages/domain/src/relatorio/reading-run.ts` `unitTapNeedsEdit`; report DB-2.
  class: debt
  state: open (owner: coordinator, decision by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DH-1): the Combobox popover with 'Criar "…"' still opens over the next field (Nome in the instrument panel), so a tap meant for Nome lands on "Criar"; moving the popover off the next field is a design question. The leave-commit now saves the name either way.
  evidence: `apps/web/src/components/combobox.tsx` (Popover placement); `registry-picker-field.tsx` `commitLeft`; report DH-1.
  class: debt
  state: open (owner: coordinator, decision by Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Review 2026-10-08 DA-1, narrowed: the Form and Confirm dialogs now stay inside the scrim's padding and scroll inside themselves (`app.css` block r8lay, the `export.css` precedent), but DESIGN.md › Form dialog and UX-DR60 (epics.md:272) ask for a full-screen Form dialog on phone; still not full-screen.
  evidence: `apps/web/src/styles/app.css` (block "Review fixes 2026-10-08 (batch r8lay)"); DESIGN.md › Form dialog; epics.md:272.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Known open (review 2026-10-08 DH-1): an unreadable voltage class ("abc") typed and left in Classe de tensão creates nothing and stays as typed text, unsaved and unmarked (today's behaviour; `parseVoltageClassKv` returns null).
  evidence: `apps/web/src/surfaces/ficha/ficha-fields.tsx` `WordField` `onCreate`; `apps/web/src/components/registry-picker-field.tsx` `commitLeft`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Follow-up review recommended (spec `followup_review_recommended: true`, independent review r8lay-rules-3): check on real Android Chrome and iPadOS WebKit tablets (Inter at the value size) that the ratio tables' wrap and the 1280 fit hold, that `.mt-scroll`'s cue and the scroll to Condição show, and that the held-Enter swallow of the plate Enter run works with soft keyboards (which may not mark `repeat`). Never run in this batch (desktop Chrome only).
  evidence: `ficha.css` r8lay TTR block; `ficha-fields.tsx` `focusNextMissingField`; R8LAY-E2E-001/009.
  class: debt
  state: ~~open (owner: coordinator, at the integrated QA pass)~~ re-owned (2026-10-14, E14-A2): owner Matheus's device run with the Epic 13 steps of `test-artifacts/manual/offline-proof-script.md` (E13-A3); no integrated QA pass ran it on a real tablet.
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (r8conc second gate, 2026-10-09)
  summary: Process pitfall: the compose `api` service runs `tsx watch src/main.ts`, which does not reload a change under `packages/domain` (reached through the workspace link), so an e2e run after a kernel edit meets a server that still folds with the previous kernel; the web bundle is rebuilt by `scripts/e2e.ts` and is current. The r8conc gate met it: R8CONC-E2E-004 failed with the server cell merged `latest_text` while the device folded a `contradiction`. A batch that edits the fold (`ops/apply.ts`, `merge/`) restarts the api (`podman compose restart api`) before its e2e run; a gate step or a watch on `packages/domain` would settle it.
  evidence: `docker-compose.yml` api `command: pnpm --filter @app/api dev`; `apps/api/package.json` `"dev": "tsx watch src/main.ts"`; `/tmp/gate2-r8conc-e2e.log` (R8CONC-E2E-004 `expectConverged` diff).
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md` (closing PR of the round, review of PR #124)
  summary: Wording review of the pt-BR copy the round's PRs marked `// authored:` (no mock shows it). #118: `copy.account.screenHeading` "Tela", `keepScreenOnLabel` "Manter a tela ligada", the kernel's `keepScreenOnSubText()` ("Enquanto uma ficha, a câmera ou uma leitura estiver aberta. Depois de 10 minutos sem toque a tela volta a apagar sozinha."), `cameraSavingText` ("Salvando a foto…", "Salvando as fotos…"), `copy.readingWait.empty` "Nada foi lido nesta foto", `ui.suggestionField.keepTyped` "Manter o digitado". #119: `copy.export.deadOpsPreviewReason`, `copy.audit.deadOpsReason`, `precheckCountMetaText(1)`, `outrasCondicoesLabel(1)` and the DF-6 parts ("o CNPJ do contratante em branco", "o CNPJ da contratada em branco", "os CNPJs do contratante e da contratada em branco", "o logo da empresa não cadastrado"). #120: `oilNaChipText` ("Marcar N itens de óleo como NA"), `oilItemsNaText` ("N itens de óleo marcados NA") and the chip's place under TIPO DE ISOLAÇÃO. #121: `conclusionStaleText` (its own row above) and the Conflict view's `CONCLUSION_WORDS` ("Confirmado", "Editado"). #122 added none.
  evidence: the "New pt-BR copy" sections of the PR bodies of #118, #119, #120 and #121; `apps/web/src/copy/pt-br.ts`, `apps/web/src/copy/ui.ts` and the kernel modules named.
  class: docs
  state: open (owner: Bruno)

## Deferred from: Story 14.2, Local › Painel › Coluna (2026-10-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: O4. Announcement and toast wording for the three levels is authored: noun-led sentences with agreement ("Local Geradores movido para a posição 4 de 6", "Painel 2 adicionado", "Coluna 5 movida"), a local whose name leads with "Cabine" read by its name alone in the feminine ("Cabine de transformação adicionada", "Cabine primária atualizada"), and "⟨local⟩ atualizado" after "Função e nome". The mock's toasts carry hints and bare names. Also authored and to review: the dialog's "Escolha a função", "Informe a função", the list names "Equipamentos direto em ⟨local⟩" and "Painéis de ⟨local⟩", and the pre-issue row "Local ⟨nome⟩ sem equipamento".
  evidence: `packages/domain/src/templates/text.ts` `itemPhrase`, `said`, `localUpdatedText`; `apps/web/src/copy/pt-br.ts` `localDialog`, `sumario.tree`; `packages/domain/src/relatorio/pre-issue.ts` `cabineSemEquipamentoText`.
  class: docs
  state: open (owner: Bruno's copy review)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (a). The painel refusal can be bypassed by op order, and the reducer never checks what a painel hangs under. `applyOp` refuses a block create or a `block/{id}/location_id` put naming a painel only when the painel row is already in state (a location not in state is not checked, for replay safety), so a block op applied before its painel's create is accepted and the block stays on the painel; the tree draws it under the painel and `templateFromRelatorio` and `instantiateTemplate` skip it. And a `location/{id}` create of kind `painel` is stored whatever its `parent_id` names: the row schema asks only for a non-null parent, so a painel under a coluna or under another painel is accepted by both layers (no client writes one; the kernel tree draws it under that parent). Decide whether the server refuses a block op whose location it does not hold, and whether the fold checks the parent's kind once the parent is in state.
  evidence: `packages/domain/src/ops/apply.ts` (`carriedLocationId`, `targetsOf`, the `LocationKindError` checks; no parent-kind check in the location create); `packages/domain/src/schemas/entities.ts` `locationRowSchema`; `packages/domain/src/ops/apply.test.ts` "a location not in state is not checked, as before"; spec triage log, the `ops/apply.ts` finding (marked real on 2026-10-13).
  class: question
  state: open (owner: Matheus; the architect for the fold rule)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (d). The Porto Seguro fixture's op log maps every skeleton node that is not a cabine to `kind: 'coluna'` (`locationRow`), which is right only while the standard template holds no painel: a painel added to that template would be written as a coluna, silently, and the goldens would be regenerated from a wrong tree. Make the mapping exhaustive over the three kinds (or throw on a painel) before the standard template ever gains one.
  evidence: `packages/domain/fixtures/porto-seguro/op-log.ts:260-264` (`locationRow`, "The standard template holds cabines and colunas only").
  class: debt
  state: open (owner: whoever first changes the standard template's skeleton; Story 14.5 if it does)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (e). Below 768 px the relatório tree's location rows hide the drag handle and the Position box (`display: none`), so a local, a painel or a coluna reorders there by the Overflow's "Subir" and "Descer" or by Alt+arrows only; EXPERIENCE.md says "drag, Position box, Overflow menu, or Alt+arrows" at every level and names no breakpoint. Decide whether phones keep the two ways (the row has no room for both controls beside the name and the counter), or the row is redrawn to carry them.
  evidence: `apps/web/src/styles/app.css:263-265` (the three location rows, under the phone media query); `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `reorderControls`; the ledger entry above on where EXPERIENCE.md won over the mock ("hidden below 768 px").
  class: question
  state: open (owner: Matheus's decision)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Second pass 2026-10-13 (g). The ancestor-liveness rule lives in the snapshot; readers of raw rows do not apply it. A sheet another device left live under a removed location (created there or moved in before it pulled the removal) is hidden from every snapshot reader but is still counted or held by: the api's pull summary totals, the Home card's on-device counter, the obra's "n de N fichas", the TAG checks (its TAG stays taken, or reads as a duplicate with no visible holder, and its equipment is never freed) and the panel reading's target check. Nothing is wrong while every sheet under a removed location carries its own tombstone, which is what a removal writes; the gap is only the concurrent case. Either filter those readers by `hiddenLocationIds`, or surface the hidden sheet as a decision (see (h)).
  evidence: `apps/api/src/sync/pull.ts` `relatorioTotals` (SQL by the row's own `removed_at`); `packages/domain/src/home/cards.ts:223`; `apps/web/src/surfaces/project/project-surface.tsx:56`; `packages/domain/src/relatorio/tag.ts:71` and `tree.ts` (`equipmentSharedElsewhere`, the duplicate set); `apps/api/src/jobs/reading/kinds/panel.ts:26`. Edge Case Hunter finding 7 and Verification Gap finding 2 of the second pass. *(2026-10-14, Epic 14 QA Q-10, source `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`: three more raw-row readers see such a sheet in the concurrent case: the Conflict view's decisions (`packages/domain/src/merge/conflicts.ts:367`, `:376`, fed by `apps/web/src/db/decision-store.ts:96-118`), Sync status "Leituras" (`apps/web/src/db/suggestion-store.ts:245`) and "Repetir da ficha anterior" (`apps/web/src/surfaces/ficha/checklist-section.tsx:136`); the same fix applies: read them through the snapshot or `hiddenLocationIds`.)*
  class: debt
  state: open (owner: the architect; Story 14.3 touches the same counters for the site checklist)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Second pass 2026-10-13 (i). The cut of "Restaurar ficha removida" compares a row's `removed_at` (the removing device's clock, `client_ts`) with the newest revision's `created_at` (the server's clock). A removal made offline before an emission and synced after it, or made on a device whose clock runs slow, falls before the cut although the issued document still holds the rows, and is never offered. The rule is the sheets' own since Epic 4 (retro item 29); location removal makes a miss cost a whole painel or local.
  evidence: `packages/domain/src/relatorio/sumario.ts` (`removed_at > since` for blocks and for locations); `apps/web/src/surfaces/relatorio/sumario-surface.tsx` (`latestRevision(revisions)?.created_at`). Edge Case Hunter finding 2 of the second pass. A cut by log position (the remove op's `seq` against the revision's snapshot `seq`) would not depend on clocks.
  class: debt
  state: open (owner: the architect)

## Deferred from: Stories 14.3 and 14.4, Verificações do local (2026-10-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: O2. A C or NC against NA contradiction on a site item (two devices, concurrent) keeps the `seq`-later value and marks the cell `conflict`, as a sheet cell does, but it is not a decision in the Conflict view and no banner counts it: the mark is invisible on "Verificações do local". Decide whether site cells enter the Conflict view (block-scoped today) or are resolved on the surface itself.
  evidence: `packages/domain/src/merge/policy.ts` (the `location/checklist` branches); `packages/domain/src/merge/conflicts.ts` (block-scoped decisions, not extended); `packages/domain/src/ops/site-checklist.test.ts`; spec matrix row "Two devices, same item" and O2.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: O5. Authored pt-BR copy for Bruno to review before the first real job (none blocks a merge): the NC phrases of the 19 site items and of NO-BREAK DE COMANDO (`docs/nc-chip-phrases.md`); the pre-issue row "Verificações do local sem resposta: ⟨local⟩ (N itens) e …"; the issued banner "Relatório emitido (revisão N). Editar estas verificações reabre o relatório como Em revisão e gera a revisão N+1."; the Rascunho status-step sentences "… preencher uma ficha ou as verificações do local …"; the singular of the missing sentence "1 item sem resposta — é o item N, ⟨item⟩"; the point title "⟨local⟩ · Verificações do local"; the merge-info line "Verificações do local · Item N" with the local's name; the site photo caption "Verificação de ⟨item⟩ d⟨o/a⟩ ⟨local⟩"; the painel type-group title "⟨grupo⟩ d⟨o⟩ ⟨painel⟩ — ⟨local⟩"; and on the web the not-found sentence "Verificações do local não encontradas neste relatório." and the entry's accessible name "Verificações do local · N de 19 — ⟨local⟩" (the tree) and "Verificações do local — ⟨local⟩" (the rail).
  evidence: `packages/domain/src/seed/v4.ts`; `packages/domain/src/relatorio/site-checklist.ts`; `packages/domain/src/relatorio/sumario.ts` `statusStepText`; `packages/domain/src/merge/info.ts`; `packages/domain/src/photos/caption.ts` `siteCaption`; `packages/domain/src/print/group-for-print.ts`; `apps/web/src/copy/pt-br.ts` `local`; spec O5.
  class: question
  state: open (owner: Bruno) | 2026-11-24 audit: NC phrases accepted 2026-10-15 (sprint-status.yaml:1399, E14-A10); the other `// authored:` strings wait for the tablet session (E14-A10, E17-A3 both open); owner: Bruno

## Deferred from: review of batch e14b, Stories 14.3 and 14.4 (2026-10-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: 2026-10-13, review of batch e14b. "Legendar" on a site photo is opened by no test: the caption of a site item's photo is covered in the kernel and at capture, but no unit or Playwright test opens the caption editor on one.
  evidence: `apps/web/src/surfaces/local/` (the site rows' photo list); `e2e/` (no spec presses "Legendar" on a site photo).
  class: debt
  state: ~~open (owner: the epic QA)~~ re-owned (2026-10-14, E14-A2): owner the next story touching the site rows' photo list (`apps/web/src/surfaces/local/`), which adds the test; the Epic 14 QA did not open "Legendar" on a site photo.

## Deferred from: Story 14.5, the measurement table and the Chave de transferência automática (2026-10-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: N6, narrowed. Only E1 (the instruments registered for resistência de contato) and E2 and E3 (those for isolação) offer the instrument picker and print an instrument line. E4 (ajustes do controlador), E5 (transferência) and E6 (termografia) offer none and print none, and an instrument put on them is refused. Why: an instrument in the registry is flagged for the seeded test kinds only, and the spec forbids a new registry field in this story. Left out: naming the timer or analyser of E5 and the thermal camera of E6 on the relatório. Lifted by a registry flag for those uses and `instrument_of` gaining the values.
  evidence: spec Design Notes, Narrowings, and Never list ("No new instrument-registry field"); `packages/domain/src/seed/measurement.ts` `instrumentOfSchema`; `packages/domain/src/seed/v5.ts` (`instrument_of` on E1 to E3 only); `packages/domain/src/print/section-9.ts` `measurementTestPart`.
  class: question
  state: open (owner: Matheus for the registry field; Bruno says which instruments the relatório must name, after the first real job with a CTA)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: § 8.5 item 1, as it reaches the CTA. With tensão = MT the E2 criterion of a CTA is the firm's own seeded insulation criterion (the `isolacao` entry of `SEEDED_CRITERIA`, "> 400 MΩ", source "aceitável na ficha"), read from there and never repeated in the type, so one relatório judges all its MV equipment by one criterion. `sprint-change-proposal-2026-10-08.md` § 8.5 item 1 records that this value is well below the NETA figure for the 15 kV class and that the matter concerns every MV sheet, not only the CTA; it changes nothing now. If the firm's criterion changes, the CTA in MT follows it with no change to the type. With tensão = BT the criterion is the type's own (`>= 100 MΩ` at 1.000 Vcc).
  evidence: `packages/domain/src/seed/v5.ts` `E2_ISOLAMENTO_PRINCIPAL.criteria` (`seeded: 'isolacao'`, `when` tensão mt); `packages/domain/src/seed/criteria.ts`; spec I/O matrix row "Absolute"; `sprint-change-proposal-2026-10-08.md` § 8.4 (E2 row) and § 8.5 items 1 and 2.
  class: question
  state: open (owner: Bruno; recorded, to adjust after first use)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R1, review finding left open. A CTA's configuration and its test switches are written as one whole `block/{id}/config` put, so two devices editing the same sheet offline (one sets polos, the other switches E6 off) end with the last writer's whole config and the other choice silently reverted. The eight types never wrote config from the sheet, so the last-writer rule was not reachable there.
  evidence: `apps/web/src/surfaces/ficha/configuracao-section.tsx` (`blockConfigWithOption`), `measurement-test-section.tsx` (`blockConfigWithSubBlock`); `packages/domain/src/ops/path.ts` `BLOCK_FIELDS` (`config`). Edge Case Hunter, review of 2026-10-13. *(2026-10-14, Epic 14 QA fix batch, recommendation R-1, source `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`: the cheap signal is built: a reported concurrent `block/{id}/config` pair now names the keys whose values differ with the kernel's labels, "CTA-C01: configuração de Ana mantida (a mais recente prevalece); diferem: polos, E6" (`packages/domain/src/merge/info.ts` `configDifferences`, `info.test.ts`). The whole-config last-writer rule itself is unchanged: the per-key family stays the architect's, a contract bump to 20 before Wave 3.)*
  class: bug
  state: open (owner: the architect with Story 14.6: per-key config paths are a new op family and a contract bump, outside this story's numbers)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R2, open question from the review. `block/{id}/config` is structure for the status flow (`countsAsFieldContent` answers false), as `epic-14-context.md` settles for what shapes the sheet before the visit. On a CTA the Configuração section and the test switches can also be changed on a concluded sheet of an Emitido relatório: tensão changes the E2 criterion and polos the required rows, the verdicts move, ~~and the relatório stays Emitido (the change still counts for `editedSince`, so the next generate is a new revision). Built as the context says.~~ *(2026-10-14, Epic 14 QA Q-15, source `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`: that reading was wrong.)* and the kernel reopens the relatório as Em revisão: a config change on an Emitido relatório is an edit, and the status step moves Emitido to Em revisão on any edit (`packages/domain/src/relatorio/status-advance.ts:30`), pinned for `block/{id}/config` by `status-advance.test.ts:43-62`; only a Rascunho relatório stays where it is, since config is structure. The 14.5 "As built" line in `epics.md` says the same wrong thing and is left to the coordinator (this batch does not edit `epics.md`).
  evidence: `packages/domain/src/status/edited-since.ts` `countsAsFieldContent`; `apps/web/src/surfaces/ficha/configuracao-section.tsx` (read-only only when the sheet is marked not tested). Edge Case Hunter, review of 2026-10-13. `packages/domain/src/relatorio/status-advance.ts:30`; `status-advance.test.ts:43-62` (2026-10-14).
  class: question
  state: open (owner: Matheus: ~~either a CTA config change after emission reopens the relatório as Em revisão, or Configuração is read-only once the sheet is concluded~~ (2026-10-14) the first is what the kernel does today: is it wanted, or should Configuração be read-only once the sheet is concluded?)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R3, review finding rejected as unreachable from the product, recorded. The fold accepts a measurement cell whose unit is foreign to its row (a `min` on a row in `s`), a number on a choice cell or an option key outside the list; the evaluation then gives the cell no verdict. The sheet writes only the row's own unit and its listed options, so only a hand-written op reaches it.
  evidence: `packages/domain/src/ops/apply.ts` `assertMeasurementCell`; `packages/domain/src/relatorio/measurement-evaluation.ts` (`scaleToUnit` null). Edge Case Hunter, review of 2026-10-13.
  class: bug
  state: open (owner: Story 14.6, when company types make cell kinds data: a fold refusal with its sync-route test)

## Deferred from: Epic 14 QA fix batch (2026-10-14)

All rows closed; see deferred-work-archive.md

## Deferred from: production deploy v0.2.0 (2026-10-14)

All rows closed; see deferred-work-archive.md

## Deferred from: Story 14.10 lane B (2026-10-15)

All rows closed; see deferred-work-archive.md

## Deferred from: Story 14.10 lane A, carry-over 2 (2026-10-15)

All rows closed; see deferred-work-archive.md

## Deferred from: Stories 14.9 and 14.11, batch c17 (2026-10-20)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-9-14-11-qgbt-oil-dry.md`
  summary: The SELV/PELV mark of a Quadro elétrico is a plate field ("Circuito SELV/PELV", select SIM/NÃO, optional), not a `block/{id}/config` option as `epics.md` proposed; SIM picks `>= 0,25 MΩ` whatever the voltage. Conservative reading of Matheus's open question; a config option would be structure, not field content.
  evidence: `packages/domain/src/seed/v6.ts` `quadroNameplate`; `relatorio/reading-evaluation.ts` `bandCriterion`.
  class: question
  state: ~~open (owner: Matheus, listed in the PR)~~ decided 2026-10-21 (Bruno via Matheus, answer 1): the yes/no plate field is kept; SELV and PELV mean a circuit voltage up to 120 V d.c. or 50 V a.c., per NBR 5410. Its help text and a non-blocking notice when it reads SIM above 50 V are Story 14.14 (backlog)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-9-14-11-qgbt-oil-dry.md`
  summary: 2026-10-20, coordinator: PR #148's review patched 8 findings in one loop with no second review over the patches (listed in its PR body under "patched, not re-reviewed"); the batch recommends a follow-up review. Also `apps/web/src/components/quantity-stepper.tsx` keeps the deferred `select()` with no cancel on blur that PR #149 fixed in the Position box.
  evidence: PR #148 and #149 bodies.
  class: verification-gap
  state: open (owner: the Epic 14 integrated review, with the quantity stepper in the next carry-over batch) | 2026-11-24 audit: the review half is moot (oil and board code rewritten in Epics 22 to 28); left: the stepper's blur does not call `cancelFocusSelect` (`apps/web/src/components/quantity-stepper.tsx:286-289`), owner: agent

## Deferred from: Story 14.12, learned company options (2026-10-21)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-12-learned-options.md`
  summary: A partial text may be learned. The observation field commits after 500 ms of idle typing and a push runs every 60 s (or on "Sincronizar agora"), so a push can carry a half-typed observation ("Fuga no buj") and the server learns that piece; the settled text learns too on the next push. The office removes the stray phrase in Cadastros › Frases de NC; a removed phrase is never learned again.
  evidence: `apps/web/src/surfaces/ficha/ficha-fields.tsx` `useTypedText` (idle commit); `packages/domain/src/registry/nc-phrase-row.ts` `learnedOptionCandidates` (reads the end-of-push row).
  class: debt
  state: open (owner: Bruno's first real job with the feature; a fix would learn only from a sheet left or concluded)

## Deferred from: UX pass fixes (2026-10-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-ux-pass-fixes-2026-10-22.md`
  summary: F28 of the 2026-10-22 hands-on pass: an insulation reading's unit defaults by block type (Disjuntor, TC and Transformador in GΩ; cables and para-raio in MΩ, as FO.SERV-03 prints them, F41 reclassified form-faithful), so moving from a GΩ sheet to a MΩ one can type a value 1000x off with nothing said. A one-line hint when the default differs from the previous sheet's unit, or a sanity hint for an absurd value, is a content decision for Bruno (also whether cables should ever default to GΩ).
  evidence: `_bmad-output/test-artifacts/manual/ux-pass-2026-10-22.md` F28 and F41; `rev1.pdf` p.17 vs p.8 (gitignored evidence).
  class: decision
  state: open (owner: Bruno, relayed by Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-ux-pass-fixes-2026-10-22.md`
  summary: The P2/P3 findings of the 2026-10-22 hands-on pass (F1–F3, F5, F7–F15, F18–F27, F30–F39, F44–F50) are recorded only in `_bmad-output/test-artifacts/manual/ux-pass-2026-10-22.md`; they need triage into stories or a later fix batch.
  evidence: review finding 8; the report is the backlog source until then.
  class: backlog
  state: ~~open (owner: Matheus)~~ open since 2026-10-22 (owner: Matheus, the triage into stories or the next epic's carry-over batch; dated 2026-11-03, E15-A1: untriaged as a list since the pass, while Epics 16 to 19 took single findings from Bruno's feedback)

## Deferred from: Stories 15.3 and 15.6, seed v9 and the ratio with √3 (2026-10-22)

All rows closed; see deferred-work-archive.md

## Deferred from: Stories 15.4 and 15.5 (2026-10-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-15-4-15-5-voltar-coluna-add.md`
  summary: No back target leads to `/relatorio/:id/arvore` any more (Story 15.4), but its phone presentation (the rail drawn full width) still renders when the address is typed or deep-linked. Remove the phone presentation, or the route below 768 px, if it is not wanted.
  evidence: `apps/web/src/app.tsx` keeps the route for the rail and deep links; `relatorio.css` keeps the `/relatorio/:id/arvore` phone rules.
  class: backlog
  state: ~~open (owner: a later story)~~ open (owner: Matheus decides whether the phone presentation stays; if it goes, the next epic's carry-over batch removes it (playbook § 6, E6-A7); re-owned 2026-11-03, E15-A1: the route still renders, `apps/web/src/app.tsx:158`)

## Deferred from: fix batch fx15q, Epic 15 follow-up (2026-10-23)

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-epic-15-decisions.md`
  summary: With only automatic points the Sumário's row 8 reads "N automáticos" (Matheus, 2026-10-23), but the Points surface heading still reads "Pontos de atenção (0 + N automáticos)"; the same wording rule belongs there.
  evidence: PR #174 open question; `apps/web/src/surfaces/points/points-surface.tsx` heading, kernel text in `points/summary.ts`.
  class: bug
  state: ~~open (owner: the next fix batch)~~ open (owner: the next epic's carry-over batch, playbook § 6, E6-A7; re-owned 2026-11-03, E15-A1: fx15q, fx17r and the 2026-10-29 fix batches did not take it, and `pointsHeadingText` (`packages/domain/src/points/summary.ts:147-151`) still answers "(0 + N automáticos)" with no live point); ~~assigned 2026-11-10 to Epic 24, Story 24.7~~ superseded 2026-11-10 (evening) by fix batch e24h (no automatic points): the heading and the Sumário's row 8 count stored points only, so neither has an "automáticos" part; e24h closes it

## Deferred from: Epic 16 integrated QA browser pass (2026-10-26)

Source: `_bmad-output/test-artifacts/manual/qa-e16-2026-10-26.md` (verdict pass; no P1, no P2; the three P3 gaps below). The tablet soft keyboard limit of Story 16.4 is not listed here: it is a product decision recorded under the story in `epics.md` (candidate Story 16.5).

- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: With "Câmera do aparelho" on, two quick "Ler visor" taps (the second before the first photo's row landed in the snapshot) compute the same start cell, so both display photos would target row 0; the viewfinder burst counts its shots locally and never does.
  evidence: `read-display.tsx` `target()` recomputes `displayBurstStart` from the snapshot at every press; the picker path has no per-session counter. Unverified whether a user can tap again before the commit lands (camera app round trip plus encode, 1-3 s). The sequential two-tap e2e (17.2-E2E-001) is green.
  class: known-open
  state: ~~open (owner: a timed two-tap run on a tablet at the Epic 17 QA; a guard would advance `start.current` locally after each pick)~~ re-owned (2026-10-28, E17-A6: the Epic 17 QA ran on a desktop browser; owner Bruno's tablet session, E17-A3, a timed two-tap run; the guard is the same)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: The viewer fetches the server's original of every uploaded photo it lands on when this device holds no original (so "Salvar no aparelho" shares inside the press's activation on iPadOS), so paging through evicted photos on mobile data downloads every original even when the action is never pressed.
  evidence: `photo-viewer.tsx` `useSaveFile` runs `photoSaveFile` on landing; the viewer already fetches the `print` variant for its picture, so the original is a second, larger download per photo.
  class: question
  state: open (owner: Matheus; keep the prefetch, fetch on the press (a share after the await may fall back to a download on iPadOS), or serve the picture and the save from one fetched original)

## Deferred from: Epic 17 integrated QA browser pass (2026-10-28)

Source: `_bmad-output/test-artifacts/manual/qa-e17-2026-10-28.md` (verdict pass; no P1, no P2; the two P3 gaps below). The items the report lists as known open (Sumário row 7 count, gallery order, "VASAMENTO" spelling, the altitude hint on a denied geolocation permission) are Matheus's decisions recorded under the stories in `epics.md`, not rows here.

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 17 retrospective, integrated code review (2026-10-28)

Source: `_bmad-output/implementation-artifacts/epic-17-retro-2026-10-28.md` § Diff-scope review (three lenses over `9f0df21b..3beacd40`; 18 reported, 13 confirmed). The four fix-now findings (R4, R5, R11, R18) go to fix batch fx17r (E17-A1) with QA G1 and G2 above and carry no row; the three folded into Matheus's decisions (R7, R8, R9, R12) are dated questions under their stories (E17-A2). The rows below are the deferred confirmed findings and the one e17a spec item that had no row.

- source_spec: `_bmad-output/implementation-artifacts/spec-17-1-17-4-section-7-by-hand-display-shots-numbered.md`
  summary: The viewer's remove confirm on a local's site-item photo ("…e das verificações do local…") is verified only by the kernel test (`photoRemoveDescription` M12), never through the viewer (e17a VGR-1).
  evidence: e2e covers the sheet and Geral sentences through the viewer; the local sentence depends on the tile carrying `location_id`. One viewer-remove step in `verificacoes-local.spec.ts` 14.3-E2E-001 at its next change.
  class: test-gap
  state: open (owner: the next batch that changes `verificacoes-local.spec.ts`)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: A camera-app HEIC whose `heicToJpeg` rejects (decoder chunk unavailable offline, decode error) is lost with the failure toast; the `capture` input keeps no copy in the device's camera roll (retro R3).
  evidence: `camera-single-shot.tsx:125-141`. iOS answers a file input with JPEG by default, so the case needs a device set to keep HEIC. Cheapest guard: an authored toast that says to take the photo again; a fuller one keeps the raw file in the outbox for a later conversion.
  class: bug
  state: open (owner: Bruno's tablet session confirms the HEIC device case (E17-A3), then the next camera batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: `useCameraApp` is called by `useCamera`, which every opener instantiates, so a ficha holds one `local_prefs` live query per opener and each answers `cameraAppDefault(points)` until its query lands; a tap in the first instants after mount can take the camera app for a user who switched it off (retro R6).
  evidence: `use-camera-app.ts:31-34`, `camera-session.tsx:75`. One session-level read (a provider beside the theme, or a field on `useSession()`) removes both the subscriptions and the window.
  class: improvement
  state: open (owner: the next camera batch; measure the window on a tablet first)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: `photoFileName` names the saved JPEG by the stamp to the second, so two photos of one second saved to the device share a name and the OS suffixes or asks (retro R10).
  evidence: `packages/domain/src/photos/save.ts:39-45`. A disambiguator (the photo's document number when numbered, else a sequence) in `PhotoSaveRow`.
  class: improvement
  state: open (owner: the next batch touching `photos/save.ts`)

## Deferred from: production pass, epic by epic (2026-10-28)

Source: `_bmad-output/test-artifacts/manual/prod-pass-2026-10-28.md` (v0.4.0 on `app.fasorengenharia.com.br`, the smoke test company, three successive Playwright MCP passes: 17 epics, 186 checks held, 38 not checkable from a desktop browser, 11 gaps). G6 is the one feature that does not work in production and is Matheus's decision; G8 goes to the next fix batch; the P3 rows wait for the next batch touching their surface.

All rows closed; see deferred-work-archive.md

## Deferred from: fix batch fxpw review (2026-10-29)

Source: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxpw.md` § Review Triage Log (Edge Case Hunter and Verification Gap Reviewer). Both pre-existing; neither changed by the batch.

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxpw.md`
  summary: An offline boot with one user's cached pointer and another user's session cookie settles as unreachable on the pointer's database, and once online the sync engine pushes and pulls with that cookie into it (the G1 mix by the offline path).
  evidence: `apps/web/src/state/session.tsx` boot effect, `'unreachable'` branch (unchanged by fxpw); needs a cookie changed outside the app's sign-in, as the production pass's persistent MCP profile had (ECH-3).
  class: bug
  state: open (owner: the next session or sync batch; re-read the session on the first `online` event before the engine's first push) | 2026-11-24 audit: push half now refused `op_attribution` (Story 20.8, `packages/domain/src/contract/errors.ts:43`); left: the pull half, `apps/web/src/state/session.tsx:306-315` does no re-read on `online` for the unreachable boot, owner: agent
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxpw.md`
  summary: The Sumário header leaves out a concluded sheet held by a pending suggestion on this device, while the Etapa 6 parecer hint and summary count it as concluded (G5 aligned the not-tested reading only).
  evidence: `packages/domain/src/relatorio/progress.ts` `over()` (Story 8.1 held rule) against `parecer.ts` `parecerCounts` (snapshot only, no device suggestion rows) (ECH-11, VGR).
  class: question
  state: open (owner: Matheus: whether the parecer counts a held sheet as concluded, or the header counts it)

## Deferred from: fix batch fxg6 review (2026-10-29)

Source: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxg6.md` § Review Triage Log (Verification Gap Reviewer, VG-4). The fix lies in `apps/api` and `packages/domain`, which the batch could not touch.

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxg6.md`
  summary: The kernel and api display tests still replay tokens the sidecar produced on `PP-OCRv5_server_det`, and `services/ocr/tests/test_display.py` checks only that each expected number appears, so the confidences and row placement the mobile detector now produces (what `displayValues` uses for the unit token and the 0.5 trust threshold) are not checked at the kernel's level.
  evidence: `packages/domain/src/reading/display.test.ts` "recorded sidecar reads" and the `apps/api` job-display fixtures (`fixtures/README.md`) predate the swap; the mobile read of `display-tres-valores` spells the units `GO`/`GO`/`GO` where the recording has `GO`/`GD`/`GD` (all three map to GΩ, `display.ts:28`).
  class: test-gap
  state: open (owner: the next batch touching display reading; re-record the fixtures from the mobile sidecar and let the existing kernel and job tests judge them)

## Deferred from: fix batch fxrm (2026-10-29)

Source: `_bmad-output/implementation-artifacts/spec-fix-prod-remove-test-data-fxrm.md` (Never: no `apps/web` behavior change).

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-remove-test-data-fxrm.md`
  summary: There is no "Remover relatório" or "Remover projeto" in the UI; test or mistaken relatórios and obras can only be removed by the server's one-shot cleanup (`apps/api/src/db/tombstone-cli.ts`). The op family `relatorio/removed_at` (contract 28) now exists, and `project/{id}/removed_at` already did, so a surface needs no new contract.
  evidence: fix batch fxrm, Intent "The app has no Remover for a relatório or a project"; runbook `infra/README.md` "Remove test data from a company".
  class: question
  state: open (owner: Bruno and Matheus: whether the product offers the removal, to whom, for which statuses, and with what undo)

## Deferred from: the production re-check and Matheus's asks of 2026-10-29

Source: `_bmad-output/test-artifacts/manual/prod-pass-2026-10-28.md` § "Re-check after the fix deploy (2026-10-29)" and `_bmad-output/implementation-artifacts/backlog-2026-10-29-home-nav-and-telemetry.md`.

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 18 batch o18a (Stories 18.1 and 18.2, 2026-10-29)

Source: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`.

All rows closed; see deferred-work-archive.md

## Deferred from: Story 19.2 review (2026-10-30)

All rows closed; see deferred-work-archive.md

## Deferred from: the Epic 19 deploy (2026-10-30)

All rows closed; see deferred-work-archive.md

## Deferred from: the deploy of 2026-11-03 (54b11947)

All rows closed; see deferred-work-archive.md

## Deferred from: batch e18fa (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-e18fa-code-fix-batch.md`
  summary: A 401 on `POST /api/telemetry` still deletes the batch (only 429 was named for keeping), so a session that expires with a full queue loses it.
  evidence: `telemetry/flush.ts` `drain`: kept on a 5xx, a network failure, a timeout and a 429; deleted on every other 4xx, 401 included (Q1 of Story 18.1). The retro's production read saw one 401 batch dropped after `prodpass.sh cleanup`. Open question of the PR.
  class: risk
  state: open (owner: Matheus decides; Story 18.4 if kept) *(2026-11-03, batch s184: no decision yet, so Story 18.4 left the 401 rule as it was; the runbook says a 401 drops the batch.)*

  state: ~~open (owner: the next infra batch, E18-A2 or E15-A10)~~ done (2026-11-03, batch e18fb: step 6 presses the preview through `previewRequest` (`e2e/production/preview-tab.ts`), which retries once, and only when the tab closed before the preview request was seen: it records the dialog's failure line and the page's console errors to `test-results/production-smoke/preview-retry.json` and the log, closes the dialog, reloads the Sumário and presses once more; a second close fails the step with the first error, any other error at once; the eight steps and every assertion unchanged. Unit test with fakes `scripts/preview-tab.test.ts`. The suite's own re-run by the deploy stays open question Q-1)

## Deferred from: the Epic 18 retrospective and the ledger hygiene of Epics 15 to 17 (2026-11-03, batch e18fd)

Source: `epic-15-retro-2026-10-26.md` (E15-A1: R15-13, R15-14), `epic-16-retro-2026-10-26.md` (E16-A5: R16-14, R16-17, R16-18), `epic-17-retro-2026-10-28.md` (E17-A6: F13, F15) and `epic-18-retro-2026-10-30.md` (E18-A3: P7, A3, R-A2, R-A5, R-A6, R-A12, R-A13, R-E4, the `test:e2e:full` red of Behavior verification). Rows that already existed were re-owned or closed in place with a dated note above. Owner "the next epic's carry-over batch" is the first batch of the next epic, which takes the agent-closable ledger rows of earlier epics (`epic-batch-orchestrator.md` § 6, E6-A7); the coordinator reads these rows when it cuts that batch. Epic 16's third spec `deferred:` item (a tablet's soft numeric keypad cannot type N.A, `spec-16-4-na-in-number-fields.md`) has no row on purpose: it was a product decision recorded under Story 16.4 in `epics.md`, answered by Bruno on 2026-10-27 and built as Story 17.3 (E16-A1 closed). Epic 17's remaining owners are scheduled items (Bruno's tablet session E17-A3, the next batch touching a named file); no Epic 17 row is owned by a finished event after the R1 re-owning above.

- source_spec: `_bmad-output/implementation-artifacts/spec-15-2-tree-levels.md`
  summary: A collapsed local, painel or coluna shows no NC indicator, so a band closed in the Sumário tree hides that a sheet under it holds an open NC (PR #167 "Known open"; the as-built line under Story 15.2 says "(known open)").
  evidence: PR #167 body § Known open ("The mocks draw none on bands; the header's 'NC abertos' tap opens the path to the sheet"); `epics.md:4016`; `epic-15-retro-2026-10-26.md` R15-13. The bands draw `ncBadge` for the site card and for sheets only (`apps/web/src/surfaces/relatorio/relatorio-tree-rail.tsx:80,121`).
  class: known-open
  state: open (owner: Matheus, with Bruno at his tablet session (E17-A3): whether a collapsed band needs an indicator the mocks do not draw; if yes, the next epic's carry-over batch, the count derived in the kernel's tree, AD-1)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: One unknown event refuses the whole telemetry batch with `400 telemetry_invalid` and the device deletes it, so a bundle and an api that disagree on a closed list (the minutes of a deploy) lose that device's batch (retro R-A2, confirmed by design).
  evidence: `apps/api/src/http/telemetry.ts:61-63`, `apps/web/src/telemetry/flush.ts:64-65` (line numbers of `3b45e83c`); `epic-18-retro-2026-10-30.md` R-A2. The rule that keeps the window short (names, kinds and targets are appended, never removed or renamed within a release) belongs in `docs/observability.md` § Adding an event name, the E18-A3 docs part owned by this wave's observability lane.
  class: risk
  state: open (owner: the first monthly digest, E18-A7: count the api's `telemetry_invalid` answers in `/fasor/production/api` over the month; a per-event parse (keep the valid events, drop the unknown) is cut as a story only if the count is not zero outside deploy minutes)

## Deferred from: the integrated review of Epics 15 and 16 (2026-11-03, E15-A5 and E16-A6)

Source: `_bmad-output/test-artifacts/review-e15-e16-integrated-2026-11-03.md` (main `0fede8ac`).

- **E16-R2, a cabine environment display shot prints nowhere yet holds a photo number.** A temperature or humidity "Ler visor" shot on a local (`apps/web/src/surfaces/ficha/read-display.tsx:733`, `displayEnvTarget`) has no block and no item; Story 16.3 took display shots out of section 7 for sheets only and Story 17.4 kept this one unprinted and numbered last (`packages/domain/src/print/photo-order.ts:83-86`, `:112-113`; pinned by `section-9.test.ts:1169`). The evidence of AMBIENTE DE ENSAIO leaves the document and the gallery shows a "Foto N" no "Imagem N" carries. Options: print it under the cabine's characteristics or environment part, or leave it out of the numbering and say so in the gallery.
  state: open (owner: Matheus, with Bruno; then the next epic's carry-over batch)

## Deferred from: batch e18fb (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-e18fb-observability-and-tooling.md`
  summary: The ten views' new text (the smoke filter, `sessions_per_day` by `substr(ts, 0, 10)`, the group from its resource) and the app role without `logs:DescribeLogStreams` reach production only with the next `infra/bin/tf production apply` or deploy; the new query syntax has run offline only (`infra/bin/check`), not in Logs Insights.
  evidence: batch e18fb is offline by rule (no apply). The `users` view's `fields ... as ... | stats ... by` shape and `filter` chains already ran to `Complete` in production (2026-10-30), and `substr` is a documented Logs Insights string function, so the risk is low; the first read after the apply should open `sessions_per_day` and one filtered view and check they run to `Complete` and that the `smoke` row is gone from them.
  class: risk
  state: open (owner: the coordinator, at the deploy that carries the batch, on Matheus's word)
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fb-observability-and-tooling.md`
  summary: A `--resume` of a deploy cut after its tag record (during the smoke) reads `previous_tag` equal to the tag, so a red smoke on that resume says "no earlier tag was recorded to roll back to; fix forward" instead of naming the tag before the deploy.
  evidence: `infra/bin/deploy` reads `previous_tag` from the image-tag parameter right before `put-parameter`; a first run that recorded the tag and then died leaves the parameter at the new tag. Review finding ECH-5 of batch e18fb. To decide: persist the pre-deploy tag (a file under `test-results/` or an SSM tag) or let `--resume` take `--previous-tag`.
  class: risk
  state: open (owner: the next infra batch)

## Deferred from: the Epic 19 retrospective (2026-11-03, E19-A3)

- source_spec: `_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md`
  summary: R-4: Home reads "no summary entry" as "created on this device", so a relatório removed on the server sorts right after the current card as the newest until its stream pulls and tombstones the local row.
  evidence: The summary leaves removed entities out (`isNull(entities.removed_at)`, `apps/api/src/sync/pull.ts:163`); `homeCards` sorts an undefined `updated_seq` first after the current card (Matheus's "A", `packages/domain/src/home/cards.ts` sort). Plausible, not exercised (retro adversarial 3a). Fix: mark the unsynced bucket with a positive signal, a pending `relatorio` create op in `outboxByRelatorio`, not with a missing sequence; a kernel test with a local row absent from the summary and no create op.
  class: risk
  state: open (owner: the next Home story or fix batch, after Matheus's E19-A1 decision on the order key)
- source_spec: `_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md`
  summary: R-6: two kernel functions take a `filter` whose `null` means opposite things: every card in `homeCards`, the active statuses only in `homeList`; and `homeList` assumes its input is the unfiltered set (`cards.length === 0` decides `none`).
  evidence: `packages/domain/src/home/cards.ts` (`homeCards` returns `input.filter === null ? cards : ...`; `homeList` filters `HOME_ACTIVE_STATUSES` when `options.filter === null`); production passes `filter: null` to `homeCards` only (`apps/web/src/surfaces/home/home-surface.tsx`, `allCards`). Confirmed (retro adversarial 6). Fix: drop `filter` from `HomeCardsInput` (its tests move to `homeList`), or rename `homeList`'s option to `tile`, and document the input contract on `homeList`.
  class: debt
  state: open (owner: the next batch that touches `cards.ts`; Story 18.4 may take it if it edits `homeList`)
- source_spec: `_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md`
  summary: R-10: the page size has no optimistic state, and a failed write is swallowed after the usage event was already counted.
  evidence: `selectedId` comes from IndexedDB through the live query only (`home-surface.tsx`, `pageSize` and the `FilterChipGroup`); `choosePageSize` does `void writeHomePageSize(db, size).catch(() => undefined)`. A quick 20 then 10, or an arrow held on a loaded tablet, can leave the focused chip and the stored size out of step; a rejected write leaves the chip unchanged with no word to the user. Plausible, not exercised (retro adversarial 4 and 10). Fix: a local pending size shown until the live query agrees, and a failed write surfaced (a toast) instead of swallowed; a component test with a write that hangs and one that rejects.
  class: risk
  state: open (owner: the next Home story or fix batch)
- source_spec: `_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md`
  summary: R-13 (UX question): the page-size chips sit only below the list. After 50 or 100 they are at the end of a long list; a larger size inserts cards above the focused chip; when a sync drops the selection to 10 or fewer the chip group unmounts while it holds focus; and the stored size makes every later visit open long, against the epic's goal of a short Home.
  evidence: `home-surface.tsx` renders the note row with the chips after `.relatorio-cards` and only when `list.note !== null`; the mocks draw the note under the cards (`20-home.html`, `key-home.html`), so this is not a defect of the as-built. Plausible, not exercised (retro adversarial 12, edge case 5 and 6). To decide: also place the chips by the "Relatórios" heading, reset a large stored size on the next visit, and where focus goes when the group unmounts.
  class: question
  state: open (owner: Matheus and Sally, the decision; then the next Home story)

## Deferred from: batch s184 (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: "Cancels by preceding screen" is not an aggregated view: the dialog events carry no `from`, so the `paths` view lists the per-session sequence and the reader finds the screen before a cancel in the `screen_view` rows around it.
  evidence: Spec Design Notes, view `paths`; `infra/production/observability.tf` `paths`; `_bmad-output/test-artifacts/friction-digest-template.md` "Five questions" item 3.
  class: question
  state: open (owner: the first digest says whether the reading by hand suffices; else a story adds `from` to `dialog_open` and `dialog_cancel`)
- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: On a sign-out and another user's sign-in in the same tab, the events tracked while no database was configured (the first user's last `screen_view`, written when the login opens) take the new user's session id, so the `paths` view can show the first user's last screen at the start of the second user's session (review ECH-9, second half; the rotated `session_start` now takes the earliest held `ts`).
  evidence: `apps/web/src/telemetry/track.ts` `configureTelemetry` (held events re-stamped, batch e18fa R-A15 design); `apps/web/src/telemetry/views.ts` (the view left on the route to the login).
  class: risk
  state: open (owner: the next telemetry story; options: drop held events older than the sign-in, or keep them under the old id)

## Deferred from: Epic 20 batch e20s (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-e20s-server-rules.md`
  summary: One "Desfazer" is now refused: undoing "Voltar para Em campo" from an Em revisão whose content changed since its latest revision (or that has no revision yet) puts Em revisão back with no generate queued after the back move and no unchanged revision, so `statusMoveVerdict` reads it as a forward move without its precondition (`op_status_transition`). The device shows the sentence, stays Em campo, and the next generate moves it to Em revisão as usual. Every other undo of a status move applies.
  evidence: `packages/domain/src/status/table.ts` `statusMoveVerdict`; `apps/api/src/sync/status-transition.integration.test.ts` (the undo of the back move on an unchanged revision applies).
  class: risk
  state: open (owner: Matheus; if the undo must apply, the kernel can accept a move back to the status the op named by `prev_op_id` replaced, which needs that op's previous value in the log)

## Deferred from: batch e20w (2026-11-03)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 20 batch e20e (2026-11-04)

- source_spec: `_bmad-output/implementation-artifacts/spec-e20e-device-quotas-edges.md`
  summary: The matrix projects (`durability-android-chrome`, `durability-webkit`) run only `*durability.spec.ts` files (`playwright.config.ts` `testMatch`), so `security-device.spec.ts` and `auth.spec.ts` run on `desktop-chrome` only; the boot and sign-in paths reach WebKit through `durability.spec.ts`.
  evidence: `playwright.config.ts` projects.
  class: note
  state: open (owner: Matheus; renaming the spec to `security-device.durability.spec.ts` would put it on the matrix)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20g-no-blank-page.md`
  summary: No automated check sends a request through each production Caddy site block to a live upstream and asserts the edge headers (no `Via`, no `Server`, HSTS); `infra/bin/check` validates the file and the fallback block's status codes only.
  evidence: e20g review VGR-1. The proof of the `-Via` change is manual (domain and CloudFront fallback blocks through a throwaway `caddy:2.11.4-alpine`); the IP block needs its ACME certificate.
  class: risk
  state: open (owner: Matheus; a stub upstream on `127.0.0.1:3000` in `infra/bin/check` closes it)

## Deferred from: the Epic 20 retrospective (2026-11-04, E20-A3)

- source_spec: `_bmad-output/implementation-artifacts/epic-20-retro-2026-11-04.md`
  summary: Every file GET runs a second query (`relatorioRemoved`) after `findFileRow` since e20f (QA N2), so a gallery or thumbnail grid doubles its database round trips (R-5).
  evidence: `apps/api/src/http/files.ts` line 343.
  class: debt
  state: open (owner: the next batch touching `files.ts`; join the relatório's `removed_at` into `findFileRow`'s lookup)

## Deferred from: E20-A1 retrospective fix batch (2026-11-04)

- source_spec: `_bmad-output/implementation-artifacts/spec-e20a1-retro-fixes.md`
  summary: The preview and audit "never arrived" expiries moved to the monotonic clock (`use-preview.ts`, `use-audit.ts`) have no test harness, so a regression back to the corrected `now()` would pass every test.
  evidence: review pass 1, triage #10 (VG-3); a search for `usePreview`, `useAudit` and "never arrived" in `apps/web/src/**/*.test.*` and `e2e/` finds no test.
- source_spec: `_bmad-output/implementation-artifacts/spec-e20a1-retro-fixes.md`
  summary: The relatório budget's stored side now reads and re-serializes every live client row of the relatório once per push that grows it, where before it was one SQL `sum(octet_length)`; the cost on the push path is unmeasured.
  evidence: review pass 1, triage #17 (BH-5), maybe-false, medium if real; settle it by timing a growing push on a Porto Seguro-sized relatório (and a 4 MiB one) against the old SQL sum, then keep, or move to a per-relatório byte counter.
- source_spec: `_bmad-output/implementation-artifacts/spec-e20a1-retro-fixes.md`
  summary: `POST /api/photos/{id}/reread` (`apps/api/src/http/reading.ts`) and `sendRetargetedReading` (`apps/api/src/sync/routes.ts`) check only the photo's own tombstone, not `fileWithdrawn`, so a photo of a removed relatório can still spend a paid reading.
  evidence: review pass 1, triage #18 (VG-6); `reading.ts:54-57` repeats the old inline check; no test rereads a photo of a removed relatório.

## Deferred from: Epic 21 batch e21r (2026-11-05)

- source_spec: `_bmad-output/implementation-artifacts/spec-e21r-ratio-vector-group.md`
  summary: The drawn-diagram path of Story 21.2 is exercised end to end on the device with the reading job's suggestion seeded as the job writes it (`e2e/plate.spec.ts` 21.2-E2E-001), and through the real job only in `apps/api` (`job.integration.test.ts`, the committed plate's own fixture): an imported photo is re-encoded by the device, so the fake providers replay the transformer's default plate (printed Dyn1) and never the drawn one.
  evidence: `providers/fake.ts` chooses a default fixture by reading kind, block type and table only; making the drawn plate a default would change every transformer plate test.
- source_spec: `_bmad-output/implementation-artifacts/spec-e21r-ratio-vector-group.md` (review, before the deploy with the eval run)
  summary: A drawn-only vector diagram whose terminal labels the OCR did not return is dropped as uncited, so no group is suggested.
  evidence: `providers/bedrock.ts` `withoutUncitedValues` and `structuringValueSchema` (`min(1)`) drop a value citing no token; changing that touches `contract/ocr.ts` and the OCR sidecar gate. The paid eval run shows how often the real plates hit it.
  state: ~~open (2026-11-05: the synthetic drawn plate's labels were returned by Textract and cited in all runs; how often real plates hit it needs the real-set run, owner: Matheus)~~ open (2026-11-06, batch e21a): on the real set 1 of 6, a blurred and rotated photo, got no suggestion, its cause not recorded; none of the six is a drawn-only plate (the one diagram read prints "Dyn I"). Since e21a, facts whose labels the OCR did not return are ignored and the model's own group entry is kept as a diagram read (R-1), and every transformer reading logs `reading vector diagram` with the fold's outcome (`uncited` for this case, R-3), so the next production reading says how often it happens. Owner: E21-A2.

## Deferred from: Epic 21 fix batch e21f (2026-11-05)

- source_spec: `_bmad-output/implementation-artifacts/spec-e21f-diagram-vector-group.md`
  summary: A group the model composes itself, citing words that print no group, with no `vector_diagram` facts, keeps the e21r handling (a diagram read, `verify`); only facts that compose replace it.
  evidence: spec Design Notes (conservative, listed in the PR); `providers/vector-diagram.ts` `withVectorDiagram` changes nothing without composable facts.

## Deferred from: Epic 21 batch e21p (2026-11-05)

- source_spec: `_bmad-output/implementation-artifacts/spec-e21p-section-7-photo-order.md`
  summary: "Subir" on a photo (or block, or point) directly below a run of equal order keys, which two devices can mint apart, lands after the run again, so nothing moves, while the gallery's announcement says it moved (it reads `moveLandingIndex`).
  evidence: review pass 1 (edge-case hunter); `orderKeyForMove` in `packages/domain/src/ops/order-key.ts` is pre-existing and shared by blocks, points and now photos. Owner: a later fix batch; settle it with a kernel test of an equal-key run above the moved row.

## Deferred from: the Epic 21 retrospective (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (R-5, owner: E21-A2)
  summary: The plate escalation model (`us.amazon.nova-pro-v1:0`, the `bedrock_escalation_model_id` default) gets the `bedrock-structuring-4` tool schema with the required, nullable `vector_diagram` object and was never measured on it; a refusal is caught and only logged (`kinds/plate.ts:116-123`).
  evidence: every escalation test stubs Converse; the e21f integration test turns escalation off; the evals of 2026-11-05 and 2026-11-06 ran Haiku 4.5 only.
  state: partly addressed (2026-11-07, coordinator, the paid eval before the deploy of `ae3d37e0`, prompt `bedrock-structuring-5`): Nova Pro was measured on both sets with the `vector_diagram` schema; no refusal and no failed call (synthetic 32 of 33, real 5 of 6, the same as Haiku). On the real plate tf3 (blurred, rotated; expected Dyn1), where Haiku returns no group, Nova Pro returns "Dd0 (diagram)", a wrong group composed from diagram facts. An escalated reading kept for its larger number of suggested values could carry that group as a suggestion. Open, owner E21-A2: drop a diagram-composed group from the escalation model, or revise its prompt and measure again.
- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (R-6, owner: E21-A2, a measured prompt revision)
  summary: Prompt and schema wording: `hv_neutral` names only the star centre (a zigzag HV neutral, ZNy5 or ZNy11, may compose as Zy5 or Zy11); the system rule "give one value for each field you can read" contradicts "leave the group out and fill vector_diagram"; the tool description omits `vector_diagram`; `vector_diagram.ocr_token_ids` has no `minItems: 1`.
  evidence: `providers/vector-diagram.ts:53,62`; `providers/bedrock.ts:174,269`. Each fix is a prompt change, so a new prompt version and a paid eval.
- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (R-7, owner: E21-A2)
  summary: "Printed wins" in the fold depends on OCR fidelity: a printed code the OCR garbles is replaced by the composed diagram code, and nothing checks that the composed value's citations print no group (a value citing a printed code's word would reach the device `suggested`, with no diagram note).
  evidence: `providers/vector-diagram.ts:91-104,125,130`; on the real set of 2026-11-06 one of five Dyn1 reads came back as a diagram read, cause not recorded.
  state: partly addressed (2026-11-06, batch e21a): the diagram-read real plate prints "Dyn I" (a garbled print, not a drawing-only plate); `parseVectorGroup` now reads a single trailing I or l as clock 1, so a model entry citing those words is printed and wins over the facts (stored `verify` by the digit rule, with its box). The second half (a composed value citing a printed code's word) stays open, owner E21-A2.
- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (R-8, owner: a later reading batch)
  summary: Two group entries in one structuring answer fail the whole plate reading (the unique-key refine, unchanged by e21f); a nested `vector_diagram` answered as a JSON string is ignored; `make-plate-fixtures.ts` hard-codes the Yyn0 facts for any drawn plate and uses `value: null` to mean "omit".
  evidence: `contract/ocr.ts:167-173`; `providers/vector-diagram.ts:118`; `apps/api/src/scripts/make-plate-fixtures.ts:217,287,293`.
  state: open; assigned 2026-11-10 to Epic 24, Story 24.13 (the third part only, the plate script, and only if the new plates need it); *(2026-11-11, batch e24s: not needed: the No-break plate is drawn with no vector group and every value it carries is given, so `make-plate-fixtures.ts` only learned the type (`PlateSpec.blockType`) and its plate; the Yyn0 facts and the `value: null` convention stay as they are, the row stays open for a later reading batch)* | 2026-11-24 audit: The JSON-string half is fixed by e28v/e28v2 (`47ab52b1`, `326ffd4d`; `apps/api/src/jobs/reading/providers/bedrock.ts:330-400`). Left: the unique-key refine still fails the reading (`packages/domain/src/contract/ocr.ts:170`), and `make-plate-fixtures.ts` hard-codes Yyn0 facts; owner: agent

## Deferred from: e22c (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/spec-e22c-parecer-follows-fichas.md`
  summary: A stricter parecer verdict, once tapped, stays stored after the fichas clear (the stored LWW object has no "follow the derived verdict" state), so the effective verdict can stay stricter than the fichas with no way back but tapping the derived one, which also stores it.
  evidence: `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx` verdict tap; `relatorio/parecer.ts` `effectiveParecer`; review finding EC8.
  class: decision
  state: open (owner: Bruno, relayed by Matheus); 2026-11-11, batch e25b (Story 25.4): checked, not closed. Story 25.4 keeps the printed verdicts on the revision (`printed_parecer`, `printed_conclusions`) and never writes `setup.parecer`, so a stricter tapped verdict still holds after the fichas clear, as this row says; the story names this row out of scope. Still open (owner: Bruno, relayed by Matheus)

## Deferred from: Epic 22 batch e22p (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.1, narrowing)
  summary: The DoR's "the oversized file shows the import's size message": no client size message exists on the import path; a large file is re-encoded to the 2560 px original cap like any import (`22.1-E2E-004` asserts the cap). A non-image is not offered (`PHOTO_ACCEPT`) and, forced, is skipped with the import's toast.
  evidence: `apps/web/src/files/photo-import.ts`, `photo-encode.ts` `ORIGINAL_MAX_PX`.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.1, test narrowing)
  summary: `22.1-E2E-003` (HEIC) answers the `heic-to` chunk with a stand-in that decodes through the browser: no HEVC HEIC encoder exists in the stack (sharp's libheif writes AVIF only) and the repo carries no HEIC fixture, so the third-party decoder itself is not exercised end to end. The route matches `/assets/heic-to*.js`; a renamed chunk fails the test loudly. Owner: a later test batch, with a real HEIC fixture from a phone (no client material).
  evidence: `e2e/attach-file.spec.ts`; `podman compose exec api node -e` with `sharp().heif({ compression: 'hevc' })` answers "Unsupported compression".
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.1)
  summary: "Anexar arquivo" carries no `data-telemetry` name: a new usage event name is a contract change (`contract/telemetry.ts`), which this batch may not make. Owner: the next batch that bumps the contract, if Matheus wants the attach counted apart from the shot.
  evidence: `packages/domain/src/contract/telemetry.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.3, narrowing of the DoR, decided in the spec)
  summary: Keep-together is per joint, not "every row and paragraph keep-with-next from the title bar to CONCLUSÃO": every table keeps its rows, and only the joints named in the spec keep with the next part, so a ficha taller than a page breaks between two parts (a chain over the whole ficha would break inside a table). The nameplate and VERIFICAÇÕES GERAIS keep with the next part only as the plate before a Não ensaiado band or as the part right before CONCLUSÃO.
  evidence: `packages/domain/src/print/section-9.ts` `keptTogether`; `page-placement.integration.test.ts` 22.3 cases.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.3)
  summary: Label columns keep their weights (coordinator constraint), so a long bold label can still wrap inside itself by the kernel's estimate: "IDENTIFICAÇÃO" in DADOS DO EQUIPAMENTO measures about 9,5 em against its 9,4 em share. Whether it breaks on the real PDF is not checked here. Owner: Matheus or Bruno, if a printed label is seen broken.
  evidence: `print-fit.test.ts` measures value columns only; `wordsWiderThanColumns` reports the label.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.2)
  summary: The spec names `_bmad-output/planning-artifacts/source-deltas.md`; the file is `_bmad-output/specs/spec-fasor/source-deltas.md`, where the 2026-11-06 FR-68 row was already written by the planning PR: it was marked built rather than duplicated, and the AD-18 attribution row amended beside it.
  evidence: `source-deltas.md` rows FR-68 (2026-11-06) and FR-32/AD-18.

## e22r

Deferred from: Epic 22 batch e22r (2026-11-06), Stories 22.10 and 22.12, contract 32.

- source_spec: `_bmad-output/implementation-artifacts/spec-e22r-readings-over-range-previous.md` (open questions, conservative readings taken, for Matheus and Bruno)
  summary: (1) a limit below a `>` criterion is out (it cannot prove the criterion); (2) MANUT. ANTERIOR is the table's last column, not inside the VALORES group; (3) measurement tests carry their number cells only; (4) the instrument range is per test type in the registry (AR-18's pattern), read live at entry and stored by value. The authored wordings: the two refusals, the no-limit text, "> limite", "Limite de medição (…)" and its helper "Gravado na ficha quando o visor mostra OL (ex.: 2 e TΩ)".
  evidence: `packages/domain/src/relatorio/over-range.ts`, `apps/web/src/copy/pt-br.ts` (`rangeLabel`, `rangeHelper`), `apps/web/src/copy/ui.ts` (`overRange`).
- source_spec: `_bmad-output/implementation-artifacts/spec-e22r-readings-over-range-previous.md` (Code Map, value-limits bullet)
  summary: The spec says a malformed over-range cell value is refused "(op_invalid)"; the check lives in `ops/value-limits.ts` as the spec places it, whose refusals answer `op_value_invalid` (Story 20.9), so that is the code a push gets.
  evidence: `apps/api/src/sync/apply.ts` (`opValueIssue` -> `op_value_invalid`), `apps/api/src/http/generate.integration.test.ts` 22.10 case.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22r-readings-over-range-previous.md` (Story 22.10)
  summary: A display-reading suggestion typed over (`read-display.tsx` `SuggestedCell`, `parseReadingPtBr`) still refuses ">"/"OL": only the Measurement field and the dictated cell take a limit. A plate or display reading never proposes one (the spec's Never). The instrument limit's unit is kept as typed in Cadastros: "TΩ" or "µΩ" works, a bare "T" finds no unit and "OL" then says there is no limit.
  evidence: `apps/web/src/surfaces/ficha/read-display.tsx` line 210; `relatorio/instrument-pick.ts` `instrumentRangeOf`.
  state: the unit half resolved (2026-11-07, fix batch e22g, review S1): `normalizeOhmUnit` reads "T", "TOhm", "uΩ", "μΩ" and the spelled prefixes as the Ω table's keys, on read and on Cadastros' commit; a unit it cannot read makes "OL" say so, and Cadastros shows a helper. The display-reading half stays as written.

## Deferred from: Epic 22 batch e22s (2026-11-06)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 22 fix batch e22f (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/spec-e22f-wave-a-fixes.md` (integrated review of wave A, N5)
  summary: The palette's "Fotografar equipamento" result dialog offers only "Fotografar de novo": an office user who attached a file there has no "Anexar arquivo" to redo it. Outside Story 22.1's opener list. Owner: the next batch touching `panel-capture.tsx`.
  evidence: `apps/web/src/surfaces/relatorio/panel-capture.tsx` result dialog; `epic-22-wave-a-integrated-review-2026-11-06.md` N5.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22f-wave-a-fixes.md` (integrated review of wave A, N6)
  summary: The file input's `cancel` event needs Chromium 113, Safari 16.4 or Firefox 91; where it never fires, a cancelled palette pick keeps `shotRef` set until the next open and the focus is not returned. Nothing visible stays open. Low risk; owner: the next batch touching `attach-file.tsx`, with a focus-return fallback on the window's next `focus`.
  evidence: `apps/web/src/surfaces/ficha/attach-file.tsx:93`; review N6.

## Deferred from: Epic 22 fix batch e22g (2026-11-07)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 22 fix batch e22h (2026-11-07)

All rows closed; see deferred-work-archive.md

## Deferred from: the production check of Bruno's relatório after the deploy of `ae3d37e0` (2026-11-07)

Seen by the coordinator in the preview PDF of a real relatório on seed v5 (revisão 3, signed in with Bruno's account on Matheus's word, read only, no revision generated). The client text is not copied here.

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 23 fix batch e23f (2026-11-08)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 23 batch e23a (2026-11-08)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23a-criteria-tables.md` (Design Notes, authored texts)
  summary: The authored pt-BR texts of the batch, listed for Bruno: the two fallback helpers ("Sem a tensão nominal na placa, vale {crit}. Informe-a para julgar pela {Tabela 100.x}." and "Sem o tipo de isolação na placa, vale {crit}. Informe-o para julgar pela Tabela 100.5."), the row helper ("Tabela 100.5 (ANSI/NETA MTS-2023), seco, 13,8 kV: ≥ 25.000 MΩ"), "por linha" / "POR LINHA", the four manufacturer notes, the source line "Fabricante — digitado nesta ficha, vale para todas as linhas deste ensaio.", the two refusals, the print suffix " (fabricante)", the entry's accessible name "Valor do fabricante, {ensaio}", the company-type validation sentences of a criterion table, and IP "N/A". The note text is the base's (decision F).
  evidence: `packages/domain/src/relatorio/reading-evaluation.ts` (batch e23a block), `print/section-9.ts` `ACCEPTABLE_PER_ROW`, `types/validate.ts`, `apps/web/src/copy/pt-br.ts` `copy.ficha.ensaios.manufacturer*`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 23 batch e23b (2026-11-08)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 23 fix batch e23g (2026-11-09)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 23 batch e23v (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23v-three-levels.md` (Design Notes, "Rules as read")
  summary: The narrowings of the batch, as the spec reads the base: correction only on TR-OL-02, TR-SE-02, DJ-02 and SC-02 (DJ and SC by the solid factor, at the ambient); a transformer whose TIPO DE ISOLAÇÃO is empty is not corrected; a reading above the instrument's limit is never corrected and prints "-" at 20 °C; CB-02's history (its only term, "queda acentuada", is open item B-1) and DJ-02/SC-02's "fases com diferença > 50 %" (no number in the rule) are not built; TR-OL-02's history serves TR-SE-02; the cable and arrester comparison is below 50 % of the largest other row (FASE RESERVA included); a failed prerequisite is the test's `reading` entry, never a new derived kind; a test with a `reading` entry derives no `restricao` entry; the TEMPERATURA cell and the "20 °C" column also print on the disjuntor's and the seccionadora's tables. Two readings of the implementation: a temperature outside -10 °C to 110 °C still prints in TEMPERATURA (with its source) while the "20 °C" column prints "-"; the corrected value is rounded to three significant figures, and that rounded value is what is judged and shown.
  evidence: `packages/domain/src/seed/v13.ts` (the e23v section), `relatorio/temperature-correction.ts`, `relatorio/restriction.ts`, `points/derived.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus) | 2026-11-24 audit: Most confirmed 2026-11-09 (`respostas-bruno-rev08-2026-11-08.md` § 6 items 3-5; B-1 for vague terms). The "reading entry derives no restricao entry" part is moot after e24h. Left: a number for CB-02's "queda acentuada" and DJ-02/SC-02's phase difference (question 8 of `textos-para-bruno.md`, never sent); owner: Bruno via Matheus
- source_spec: `_bmad-output/implementation-artifacts/spec-e23v-three-levels.md` (Boundaries, authored strings listed for Bruno)
  summary: The authored pt-BR texts of the batch: the temperature line's sources ("do óleo, na placa", "do enrolamento, na placa", "do ambiente de ensaio, no local"), its requests ("Informe a temperatura do óleo na placa ou a do ambiente de ensaio no local: sem ela, …", "Informe o tipo de isolação na placa: sem ele, …") and its out-of-table note; the column header "Corrigido a 20 °C", the card lead "A 20 °C:", the print header "20 °C" and the TEMPERATURA cell ("40 °C (ÓLEO)", "(ENROLAMENTO)", "(AMBIENTE)"); the out helper "Abaixo do aceitável a 20 °C: {valor} ({critério})" and " a 20 °C" after a judged value; the three restriction reasons and helper details ("queda de mais de 50 % desde a manutenção anterior", "abaixo de 50 % da maior leitura", "mais de 50 % acima do menor polo", each with the row and value compared), the closing sentence (`60-ficha.html`'s, verbatim); the prerequisite clause "pré-requisito não atendido ({campo}: {valor})"; the floor words "pré-requisito do ensaio não atendido" and "leitura com restrição"; the conclusion clauses "com restrição no {ensaio} ({linhas})" and "{pré-requisito} no {ensaio}"; the point's text "{Ensaio}: valor dentro do critério, com restrição ({motivos})", its chip "Com restrição" and its section 8 head "Ensaio com restrição"; the type editor's four validation sentences.
  evidence: `packages/domain/src/relatorio/temperature-correction.ts`, `relatorio/restriction.ts`, `relatorio/conclusion.ts`, `relatorio/reading-run.ts`, `points/derived.ts`, `print/section-8.ts`, `types/validate.ts`, `apps/web/src/copy/pt-br.ts` `restrictedLead`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 23 batch e23h (2026-11-09)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 23 fix batch e23w (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23w-wave2-fixes.md` (authored strings, listed for Bruno)
  summary: The authored pt-BR texts of the batch: the parecer group "por pré-requisito do ensaio não atendido" (the floor's existing word); the contact rise's reason "alta de {N} % sobre {valor} da manutenção anterior, rev. {n} de {dd/mm/aaaa}, acima do limite de {pct} %" (the rise rounded up to one decimal), in the point and the conclusion clause, and its helper "Acima do aceitável: {motivo}".
  evidence: `packages/domain/src/relatorio/parecer.ts` `REPROVADO_REASONS`; `relatorio/restriction.ts` `applyHistoryRise`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 23 batch e23t (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23t-transformer-tests.md` (Design Notes, "Readings listed for Bruno")
  summary: the narrowings and authored wordings of the batch for Bruno: deviation over the lowest phase; a dry winding has no out band but an open circuit; the IP classes on both media; no IP history; the DAR captured, unjudged, on both media; the sampling reason a closed choice (free text in Observações); silicone applies the sampling; an empty TIPO DE SECCIONADORA applies the fuse test; no factory comparison for the winding; the criteria texts ("desvio entre fases ≤ 2 % (com restrição até 5 %)", "… (com restrição acima)", "desvio entre fusíveis ≤ 15 %", "registro da coleta (a análise é do laboratório)", "IP ≥ 1,0"), the helpers and reasons (`measurement-evaluation.ts`, `reading-evaluation.ts` `judgeIndexCells`, `temperature-correction.ts` winding texts) and the off note of the three tests.
  evidence: every `// authored (Story 23.1x, listed for Bruno)` in `packages/domain/src/seed/v13.ts`, `relatorio/measurement-evaluation.ts`, `relatorio/reading-evaluation.ts`, `relatorio/temperature-correction.ts`, `relatorio/conclusion.ts`.
  class: decision
  state: open (owner: Bruno, with the PR's list) | 2026-11-24 audit: Oil names and the IP help were answered 2026-11-11 (items 7, 8) and built (Story 25.23 `index_help`, seed v18 oil names). Left: deviation over the lowest phase, silicone sampling, empty TIPO DE SECCIONADORA, and the criteria wordings (question 10 of `textos-para-bruno.md`, not sent); owner: Bruno via Matheus

## Deferred from: Epic 23 batch e23e (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23e-tc-thermo-ground.md` (Design Notes, "Readings taken" and "Narrowings")
  summary: the readings and authored wordings of the batch for Bruno: polarity and FUNÇÃO DO TC required; thermography NA until "Equipamento em carga" is Sim (its rows and ΔT optional); the arrester with MCOV empty takes the instrument's voltage; the TC's and TP's secondaries at 1 kV apply to no row; the Malha's continuity rows optional and the Malha last under "Outros equipamentos"; thermal photos are sheet photos in the sheet's photo block. Authored texts: the faturamento notice, the ratio print note, the polarity helper (the frame's) and point ("polaridade invertida em Fase R"), the conclusion clause, the thermography's off note, row header, points, criteria wordings, band classes and actions, NA reasons ("Informe se o equipamento está em carga", "Equipamento fora de carga") and applied sentence ("Aplicado mesmo assim: …"), "Foto térmica", the caption's "ensaios de termografia", the Malha's label, test labels, row headers, points, criteria wordings, the out helper and the default's note ("Sem VALOR DE PROJETO na placa, vale ≤ 5 Ω."), its nouns and TAG prefix MA. Added by the review loop: the floor reason and the parecer's `choice` group for a sheet failed by polarity alone ("polaridade invertida", "Polaridade invertida em N fichas", its Critérios item).
  evidence: every `// authored (Story 23.13`, `23.18`, `23.20` or `23.21, listed for Bruno)` in `packages/domain/src/seed/v13.ts`, `relatorio/reading-evaluation.ts`, `relatorio/measurement-evaluation.ts`, `relatorio/applicability.ts`, `relatorio/conclusion.ts`, `points/derived.ts`, `photos/caption.ts`, `templates/text.ts`, `types/duplicate.ts`, `apps/web/src/copy/pt-br.ts`.
  class: decision
  state: open (owner: Bruno, with the PR's list) | 2026-11-24 audit: Thermography and the Malha were reworked from his 2026-11-11 answers 4 and 6 (Stories 25.15, 25.16; 28.4). Left: polarity and FUNÇÃO DO TC required, the arrester with no MCOV, TC/TP secondaries at 1 kV, and the authored texts (question 11 of `textos-para-bruno.md`, not sent); owner: Bruno via Matheus
- source_spec: `_bmad-output/implementation-artifacts/spec-e23e-tc-thermo-ground.md` (review pass of 2026-11-09, rejected finding)
  summary: the v13 TC's EXATIDÃO offers 5P20 and 10P20 only (Story 23.18), so a plate read 5P10, 5P30 or 10P10 lands on 5P20 or 10P20: judged the same (± 1 %, ± 3 %), but the stored and printed accuracy limit factor differs from the plate. Question for Bruno: should the select offer the other factors?
  evidence: `packages/domain/src/relatorio/accuracy-class.ts` `accuracyClassOption`; `packages/domain/src/seed/v13.ts` (the TC's classes).
  class: decision
  state: open (owner: Bruno)

## Deferred from: Epic 23 batch e23x (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23x-base-texts.md` (authored strings, listed for Bruno)
  summary: the authored pt-BR texts of the batch: the action "Importar base de ensaios", "Importar"; the preview lines "Cria {n} tipos da empresa, com os textos de {m} ensaios: …", "Ficam como rascunho, com avisos para publicar: …", "Já importado: …", "Todos os tipos desta base já foram importados. Nada será gravado.", "Sem ensaio no app: …", "Texto acima de 1000 caracteres, deixado de fora: …"; the toast "{n} tipos importados da base de ensaios"; the invalid-file lines; the copy names "⟨tipo⟩ (⟨ID⟩)"; the criterion's level words "Aprovado:", "Com restrições:", "Reprovado:".
  evidence: every `// authored (Story 23.12, listed for Bruno)` in `packages/domain/src/types/test-base-import.ts` and `apps/web/src/copy/pt-br.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 23 fix batch e23z (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23z-final-fixes.md` (authored strings, listed for Bruno)
  summary: the batch's authored pt-BR texts:
  - "Apagar leitura" and "Leitura apagada";
  - "Desfazer a aplicação", "Aplicação desfeita — não se aplica" and "Não conta como faltando e não sai no relatório.";
  - "O campo {label} não pode ser removido: a relação de transformação calcula por ele. Remova antes o ensaio.";
  - the editor's "Grupo na impressão", which shows the base type's group words;
  - how several recommendations are joined in a hand-chosen Reprovado's point.
  evidence: every `authored (e23z, listed for Bruno)` in `apps/web/src/copy/pt-br.ts`, `packages/domain/src/types/draft-edit.ts`, `packages/domain/src/print/group-for-print.ts`, `packages/domain/src/points/derived.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus) | 2026-11-24 audit: One string corrected by Bruno on 2026-11-11 ("é calculada a partir dele", `packages/domain/src/types/draft-edit.ts:128,256`). Others ("Apagar leitura", "Aplicação desfeita — não se aplica", `apps/web/src/copy/pt-br.ts:1771,1798`) never sent; owner: Bruno via Matheus

## Deferred from: Epic 23 fix batch e23p (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23p-pass-fixes.md` (authored strings, listed for Bruno)
  summary: the batch's authored pt-BR texts:
  - the previous line with its corrected value, "Anterior: {medido}, {corrigido} a {ref} °C (rev. {n}, {dd/mm/aaaa})";
  - the history comparison in the derived point, "(de {antes} para {agora}, a {ref} °C)";
  - the dry field's reason, "Não se aplica: {campo} é {valor}.";
  - the crossing toast's second part, "{m} campo(s) de unidade a seco apagado(s)", joined with " e ";
  - the Malha's criterion with a design value, "≤ {valor} Ω, valor de projeto".
  evidence: every `authored (e23p, listed for Bruno)` in `packages/domain/src/print/last-results.ts`, `relatorio/restriction.ts`, `relatorio/measurement-evaluation.ts`, `relatorio/oil-rule.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: the Epic 23 retrospective (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/epic-23-retro-2026-11-10.md` (R-9, the deferred half)
  summary: Two low items. A dry-only value hidden on an oil transformer stays in the store and is written to `last_nameplate` with no filter, so a later "Copiar da última visita" carries CLASSE TÉRMICA along, still hidden; nothing prints or judges by it. The off-plate clear swallows a commit error with no message.
  evidence: `packages/domain/src/print/last-nameplate.ts:38-41`; `apps/web/src/surfaces/ficha/ensaios-section.tsx` (`OffPlateClearButton`, `.catch(() => undefined)`).
  class: note
  state: open (owner: the next batch touching the nameplate copy or the TTR's off-plate rows)

## Deferred from: Epic 24 fix batch e24h (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md` (Design Notes, D5 a)
  summary: An NC row (of a ficha or a local) with no point of attention is named nowhere before issue now: the Q-4 pre-issue row retired with Story 22.5, when the row was a point by itself. Should the pre-issue list name such a row again? Not built.
  evidence: `packages/domain/src/relatorio/site-checklist.ts` (the struck 22.5 note); `packages/domain/src/relatorio/pre-issue.ts`.
  class: decision
  state: open (owner: Matheus)

## Deferred from: the e24h hands-on pass (2026-11-10)

- source_spec: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md` (H3)
  summary: Once a point was created from an NC item, the item shows "Ponto de atenção N" and "Criar ponto de atenção" stays, so a second identical point can be saved with no warning. On the "Não ensaiado" band the button disappears and nothing on the ficha says a point exists.
  evidence: the pass's screenshots `66-wip-second-point-same-item-dialog.png` and `17-wip-A8-band-after-point.png` (gitignored).
  class: note
  state: open (owner: Epic 24, Story 24.7, batch e24b, if it touches the two create paths; else the wave 1 fix batch)
- source_spec: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md` (H5)
  summary: The Sumário's points line undercounts "sem ação": a point created from the "Não ensaiado" band is counted as "1 não ensaiada" and left out of "sem ação" though it has no action.
  evidence: `packages/domain/src/points/summary.ts`; the pass's screenshot `59-new-A9-sumario.png` (gitignored).
  class: note
  state: open (owner: the next batch touching `points/summary.ts`)
- source_spec: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md` (H8)
  summary: A ficha stored Aprovado · Com restrições whose stored reading is judged out of its criterion shows Reprovado · Com restrições with "Conclusão ajustada pela ficha" and "Confirmar". On a transformer it is an over-range reading ("> 10 GΩ") judged below a minimum of 25 000 MΩ. Older than e24h: a revision of 2026-11-09 already listed the reading.
  evidence: the pass's screenshots `27-B7-ficha-before.png` and `28-B7-para-raio-before.png` (gitignored); Story 23.4's instrument-limit rule.
  class: decision
  state: open (owner: Bruno, with the next list of questions: is an over-range reading below the table's minimum a failure?)

## Deferred from: Epic 24 fix batch e24f (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (R-4, the narrowing as built)
  summary: A company copy of cabos de saída carries no role (the block config schema refuses one on a company type and no screen writes one), so it prints in the seccionadoras subsection, unpaired, and no copy feeds a transformer: W3-3's "cables before their transformer" holds for the seeded cables only. The e23z test now asserts this. Whether a copy should carry a role is Epic 24's question (E23-A8).
  evidence: `packages/domain/src/print/group-for-print.ts` (`cabos_saida` without `alimentacao`); `packages/domain/src/relatorio/e23z-final-fixes.test.ts` (W3-3).
  class: narrowing
  state: open (owner: Matheus, Epic 24 planning)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (authored strings listed for Bruno)
  summary: Two authored pt-BR sentences: the helper of a measured cell the deviation between phases could not judge, "Conferir: leitura sem comparação com as outras fases, sem critério aplicado"; and, reused on two new paths, the paragraph's existing "valores medidos com leitura a conferir".
  evidence: `packages/domain/src/relatorio/measurement-evaluation.ts` `UNJUDGED_DEVIATION_HELPER`; `packages/domain/src/relatorio/conclusion.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 24 batch e24b (2026-11-11)

- source_spec: `spec-e24b-screen-lane.md` (Design Notes D4; review ECH-8, ECH-11)
  summary: A reuse key names a place (type, local code, order): a sheet moved to another local and then saved with "Salvar como template", a palette breaker that sits before the original in its coluna, or a keyed sibling removed before the template is saved makes the next relatório miss (or swap) that equipment, which starts with no previous visit.
  evidence: `packages/domain/src/relatorio/instantiate.ts` (the run), `relatorio/tag.ts` `reuseKeyFor`; Story 24.21 states the template-side limits.
  class: design
  state: open (owner: Matheus, with the next decision on equipment identity)
- source_spec: `spec-e24b-screen-lane.md` (review ECH-14)
  summary: `moveTagQuestion`, `renameToText`, `MoveTagSuggestion` and the Move dialog's rename branch are dead now that `moveTagSuggestion()` is always null.
  evidence: `packages/domain/src/relatorio/move.ts`; `apps/web/src/surfaces/relatorio/move-block-dialog.tsx`.
  class: debt
  state: open (owner: the next carry-over batch)
- source_spec: `spec-e24b-screen-lane.md` (Part A report)
  summary: The "Fotografar equipamento" detect frame of `40-relatorio-overview.html` (:662) still reads "tipo + coluna · nenhuma SEC-C09 no relatório"; the build now reads "tipo · próximo número livre" for every type (Story 24.8).
  evidence: `mockups/prototype/screens/40-relatorio-overview.html`; `packages/domain/src/relatorio/panel.ts` `panelProvenance`.
  class: note
  state: open (owner: the coordinator, with the next mock pass)

## Deferred from: Epic 24 batch e24a (2026-11-11)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 24 batch e24c (2026-11-11)

- source_spec: `spec-e24c-company-types.md` (authored strings, listed for Bruno)
  summary: the batch's authored pt-BR texts: the rule word "nominal ± %" and the line of rules with it after "entre"; the inputs "Valor nominal" and "Tolerância (%)"; the issues "informe a tolerância (%).", "a tolerância (%) precisa ser maior que zero.", "só a regra "nominal ± %" tem tolerância.", "informe o valor nominal." and "a regra "nominal ± %" julga uma leitura, não o desvio da relação de transformação; escolha outra regra."; the palette mark "Tipo da empresa · …"; the hidden line "Oculto nas paletas: a cópia … está publicada." (several: "as cópias … e … estão publicadas."); the new `libraryNote`; Story 24.20's issue ("… a relação de transformação é calculada pelo grupo de ligação do campo … da placa, que não está mais na placa como a lista dos grupos. Remova este ensaio, ou comece de novo com "Duplicar".", summary "… sem o campo …") and its refusal toast ("O campo … não pode mudar de tipo nem de opções: …").
  evidence: every `// authored (e24c, listed for Bruno)` in `packages/domain/src` and `apps/web/src/copy/pt-br.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 24 batch e24p (2026-11-11)

- source_spec: `spec-e24p-print.md` (authored strings, listed for Bruno)
  summary: the batch's authored pt-BR text: the note line's opening and form "Em relação à manutenção anterior: ⟨onde⟩, ⟨motivo⟩; ⟨onde⟩, ⟨motivo⟩." (Story 24.16). The header's second line is a date; the editor's helpers "Da recomendação do ensaio · editável" and "Das recomendações dos ensaios · editável" are the frame's.
  evidence: every `// authored (e24p, listed for Bruno)` in `packages/domain/src`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 24 batch e24s (2026-11-11)

- source_spec: `spec-e24s-seed-v14-sheets.md` (authored strings, listed for Bruno)
  summary: The batch's authored pt-BR texts: the TP's FUSÍVEIS hint; the transformer's three new items' NC phrases; the QGBT inspection's two hints and the function test's four phrases; the No-break's name, print title, eighteen plate labels, six items, two hints and nineteen NC phrases, and its nouns; "Descreva o motivo", "Ditar o motivo", the printed form "MOTIVO: OUTRO, <texto>"; "Dados da malha"; the toast for cleared dry items (the reason line of an oil field on a non-oil unit reuses e23p's form).
  evidence: every `// authored (e24s, listed for Bruno)` in `packages/domain/src` and `apps/web/src/copy/pt-br.ts`; `docs/nc-chip-phrases.md`.
  class: decision
  state: open (owner: Bruno, through Matheus, with B-7)

## Deferred from: Epic 24 fix batch e24x, the integrated review's fixes, part 1 (2026-11-11)

- source_spec: `spec-e24x-review-fixes.md` (integrated review B2, ledger only)
  summary: remove a sheet, add the same type from the palette, restore the removed sheet: two live equipment on one `reuse_key`; the next relatório binds the oldest, and nothing reports the other.
  evidence: `apps/web/src/surfaces/relatorio/tree-actions.ts:792`; `packages/domain/src/relatorio/tag.ts:211` (`reuseKeyFor`).
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24x-review-fixes.md` (B4, stopped by its Boundaries)
  summary: binding an obra's equipment to a template block of another type of the same family (the library breaker and its published copy) is one line in `instantiateTemplate` (`free`), but the previous visit refuses it: `previousResultsFor` returns no previous visit when the equipment's last entry (`last_results.block_type`) is of another type than the sheet's ("the equipment changed type"), so the copy's sheet would show no "Anterior", print no MANUT. ANTERIOR and judge no history rule, the opposite of the I/O row. Reading across a family there needs the company's type definitions in `previousResultsFor` and so in `visitContextOf`, which 6 of its 14 callers (the ficha's live queries, the conclusion writes, `sheetProgress`, the merge view) do not hold today, and its memo keys on the block type alone. Also, a copy's TAG prefix is `TAG_PREFIX` while the library row's key used `LEGACY_TAG_PREFIX`, so a seccionadora copy (SC) never finds a library seccionadora's key (SEC), and a copy whose prefix was edited finds none. Nothing was changed for B4.
  evidence: `packages/domain/src/relatorio/instantiate.ts` (`free`, the reuse run); `packages/domain/src/print/reading-slots.ts` `previousResultsFor`; `packages/domain/src/relatorio/visit-context.ts` `visitContextOf`; `packages/domain/src/types/duplicate.ts` `seededTagPrefix`.
  class: decision
  state: open (owner: Matheus: thread the definitions through the visit context for a family-aware previous visit, or keep the binding to one type)
- source_spec: `spec-e24x-review-fixes.md` (D4, ledger only; e24p Design Notes D4)
  summary: a top entry from before Story 24.15 (no `service_date`; service 2026-11-03, issued 2026-11-10) is dated by its issue day, so a re-test with service 2026-11-08 issued after the deploy compares as older than it and is filed as its prior: the earlier visit stays on top and the re-test's sheets read nothing newer.
  evidence: `packages/domain/src/print/visit-date.ts` `visitDateOf`, `compareVisits`; `packages/domain/src/print/last-results.ts` `lastResults` (the `order` line).
  class: decision
  state: open (owner: Matheus)

## Deferred from: Epic 24 fix batch e24y (2026-11-11)

- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N7; F7)
  summary: a conclusion and section 10 name only the first pole out by its criterion; a rise on another pole appears only in the note line.
  evidence: `packages/domain/src/relatorio/conclusion.ts` (`worstReadings`); `packages/domain/src/relatorio/parecer.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N7; F12 and F13)
  summary: two wordings for Bruno: a restriction the technician chose over a clean sheet composes "dentro dos critérios ... Recomenda-se a correção dos pontos indicados" with no point indicated; an NC clause reads "apresentou baterias (item 4, NC)" before its observation.
  evidence: `packages/domain/src/relatorio/conclusion.ts` (`composeConclusion`, `ncClauseText`).
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `spec-e24y-pass-fixes.md` (P5, Design Notes N4)
  summary: like with like is judged on the current reading only: a reading corrected from the cabine's ambient (the plate's TEMPERATURA DO ÓLEO, or DO ENROLAMENTO, not typed) is not compared with the previous visit on v14. The stored previous reading keeps no record of where its temperature came from (a new synced field would be a fold change), so a previous visit corrected from its own ambient is still compared with a current one corrected from the plate. v13 keeps comparing as before.
  evidence: `packages/domain/src/relatorio/reading-evaluation.ts` (`unlike`), `packages/domain/src/relatorio/measurement-evaluation.ts` `applyHistory`; `packages/domain/src/schemas/entities.ts` `lastResultReadingSchema`.
  class: decision
  state: open (owner: Matheus: whether v13 should also take it, and whether the stored reading should keep its temperature's source) | 2026-11-24 audit: Source half done by e25r (`plate_measured` with `last_results`, contract 49, PR #330); v13 half open in E24-A5; owner: Matheus
- source_spec: `spec-e24y-pass-fixes.md` (P3, Design Notes N3)
  summary: the plate's TAG field renames the equipment on every seed (a person's commit, never on reading): an older seed's relatório whose stored plate TAG differs from its equipment's moves only when someone commits the field or renames. A plate reading that suggests a TAG and is confirmed through "Substituir" or "Confirmar todos" writes the cell alone, not the rename.
  evidence: `apps/web/src/surfaces/ficha/nameplate-section.tsx` (`commitPlateTag`); `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx`.
  class: decision
  state: open (owner: Matheus: whether a confirmed TAG suggestion should rename too)
- source_spec: `spec-e24y-pass-fixes.md` (review Y1, P5)
  summary: when a v14 reading is held back from the previous-visit comparison (the previous visit typed TEMPERATURA DO ÓLEO, or DO ENROLAMENTO, and this one has not), its cell says nothing about it: no existing sentence fits (the missing-temperature line asks for a temperature the ambient already stands in for). A proposal for Bruno: "Sem comparar com a manutenção anterior: ela foi corrigida pela temperatura da placa; informe a temperatura do óleo."
  evidence: `packages/domain/src/relatorio/reading-evaluation.ts` (`unlike`), `packages/domain/src/relatorio/measurement-evaluation.ts` `applyHistory`; `relatorio/temperature-correction.ts` `missingNote`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `spec-e24y-pass-fixes.md` (review Y6, P2 and P3)
  summary: another open relatório of the same obra bound to the renamed equipment keeps its confirmed conclusion (now stale, so it prints no paragraph until confirmed again) and its stored plate TAG cell with the old TAG: a rename writes only the relatório it is made in.
  evidence: `packages/domain/src/relatorio/tag-rename.ts` (`relatorioId` filter).
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24y-pass-fixes.md` (review, test gaps)
  summary: no print test holds a side-by-side pair with an ACEITÁVEL column (the per-row criteria), and no end-to-end test covers a rename racing an edit of the same sheet on another device, or the "Manter as duas" and Sumário rename paths (unit-tested only).
  evidence: `packages/domain/src/print/e24y-paired-tables.test.ts`; `e2e/e24y-tag-rename.spec.ts`.
  class: gap
  state: open (owner: the next batch touching the rename or the pair's print; low)
- source_spec: `spec-e24y-pass-fixes.md` (P8b, P3)
  summary: (1) the preview pill reads "Marcar como Reprovado?" for Bruno's Reprovado alone; the pairs with a restriction keep "Aprovado · Sem restrições?" and the others, ~~because "Marcar como Reprovado · Com restrições?" takes two lines at 390 px.~~ *(2026-11-11, orchestrator: that measurement counted the text's line tops and proved unreliable; the narrowing stands as the conservative change, Bruno's own pill only.)* (2) The stepper's jump moves the focus to its section a moment after the tap: typing into the plate's TAG field right after tapping "Placa" can leave the field and commit, and rename, a half-typed TAG (every field commits on leaving; the TAG field's commit is a rename, undoable).
  evidence: `packages/domain/src/relatorio/conclusion.ts` `conclusionSuggestionText`; `e2e/e24y-screen-fixes.spec.ts` (E2E-005); `apps/web/src/surfaces/ficha/use-ficha-steps.ts`.
  class: decision
  state: open (owner: Matheus: the other pills' wording with Bruno; whether the stepper's focus jump should skip a focused field)

## Deferred from: Epic 24 fix batch e24z, the integrated gate's reds (2026-11-11)

What the integrated gate on main `7773aafa` found (2026-11-11): lint, static and test:api (995) green; the matrix 152 passed, 0 failed; `test:e2e:full` 707 of 716 with 5 failed; test:unit 6592 of 6593. A rerun of the reds alone left three red every time; two passed and the unit test passed three times. Fix batch e24z (`e24z-gate-reds`) rewrote the three stale specs, moved one spec to the `solo` lane and fixed the unit test; no product code changed.

- source_spec: fix batch e24z (12.3-E2E-001)
  summary: after a TAG typed in the plate's TAG field renames the equipment (e24y P3), the field still carries the app's helper "Sugestão do app. Troque pela TAG da placa, do diagrama unifilar ou a usada no local.": with no plate cell stored (review Y2) the field shows the equipment's TAG through the prefill rule, and the helper follows the prefill, not who typed the TAG. The test no longer asserts the helper either way.
  evidence: `apps/web/src/surfaces/ficha/nameplate-section.tsx` (`prefilled`, `helper`); `packages/domain/src/relatorio/nameplate-copy.ts` `nameplateTagPrefill`; `e2e/sheet-knows-12-3-12-4.spec.ts` 12.3-E2E-001.
  class: decision
  state: open (owner: Matheus: whether the helper goes once the technician typed the TAG, and what tells the field so without a stored cell)
- source_spec: fix batch e24z (the oil-field family)
  summary: since e24s an oil field of a non-oil unit is drawn read-only without `data-field-key`, so `missingMarker(page, 'vol_oleo')` toHaveCount(0) on a dry or non-oil unit passes whatever the field shows (`dry-transformer.durability.spec.ts` R8DRY-E2E-001 to -003, `oil-dry.spec.ts` and `seed-v7.spec.ts` beside their read-only checks). Not red, but empty where no read-only check stands beside it.
  evidence: `apps/web/src/surfaces/ficha/ficha-fields.tsx` `ReadOnlyField`; the specs named.
  class: gap
  state: open (owner: the next batch touching those specs; low)

## Epic 24 integrated gate (2026-11-11)

- **The api process exits when its database restarts, and stays down in compose.** Seen in gate run 1 on `76c74711`: under a load of 32 the stack's Postgres restarted (its health-check exec was cut, "untracked child process terminated by signal 13"), a pool connection raised `PostgresError: the database system is not yet accepting connections` as an uncaught exception, and the node process exited; the container stayed up and unhealthy. In production the service restarts the task, so the effect is a short outage, not a stuck api. Open: catch the connection error and retry, or give the compose service a restart policy. Candidate for Epic 25. *(2026-11-25, Story 30.5, batch e30d, PR #390: the exit did not reproduce: a clean restart of the stack's Postgres, a SIGKILL restart under ten health requests a second and a SIGKILL restart during an e2e run on two workers each left the api answering 503 for under a second, pg-boss logging its errors, then 200 again; and the recorded restart happened twice on its own during the batch (Postgres's "untracked child process … terminated by signal 13", then "reinitializing", at load 9 to 15), and the api survived both. The other half is confirmed: when the api's node process dies, `tsx watch` (the compose `dev` command) keeps the container up, the health check takes 150 s to call it unhealthy and compose never restarts it. Open: that half, for a decision (a restart that follows the health check, or a dev command that exits with its child).)*
- **The final hands-on pass of 2026-11-11** (`_bmad-output/test-artifacts/manual/behaviour-pass-e24-2026-11-11.md`, findings G1 to G14), open rows: G1, a deadline typed by hand in the point editor leaves a draft behind and "Rascunho encontrado" shows on the next load (sent to batch e25a; whether it is older than Epic 24 is being checked); G4, the "Não ensaiado" band shows no link to its point once it exists; ~~G5, a sheet whose plate TAG was typed before fix batch e24y keeps a plate TAG different from the equipment's~~ closed (2026-11-24, Matheus "ok" to open-work-audit-2026-11-24.md section 7: kept as built: Legacy and cosmetic); G6, a line break between "75" and "°C" in a note line; ~~G7, the v14 Malha's helper still says "na placa"~~ closed (2026-11-24, batch e30b, Story 30.3 (c), PR #386: on seed v19 the helper names the block the field is in, "Sem VALOR DE PROJETO em Dados da malha, vale ≤ 5 Ω.", flag `helper_names_plate_block`; v13 to v18 keep "na placa"; the note is screen only, it is not printed); ~~G8, the Malha's conclusion ends ", sem itens verificados registrados" though the sheet has no checklist~~ closed (2026-11-24, batch e30b, Story 30.3 (b), PR #386: on seed v19 a type with no checklist concludes "{verbo} {leituras}.", flag `conclusion_no_checklist_clause`; v13 to v18 print the clause as before); G9, the QGBT header says "Leituras prontas" with no reading; G10, a comparison held back for a missing temperature says nothing on screen; G11, the rename toast wraps into four lines at 390 px; G12, "(critério: …, aceitável na ficha)" reads as if the rejected value were acceptable (for Bruno); G13 and G14 are older than Epic 24 (the obra's count of relatórios on the device; "Criar" offered beside an exact client name). | 2026-11-24 audit: G6 closed (resolved: On seed v18 the note is `print/history-note.ts` (Story 28.8, `9b7659e0`) with `NBSP` at :128 and :159; v14 to v17 are frozen byte-identical by design)

## Deferred from: Epic 25 batch e25b (2026-11-11)

All rows closed; see deferred-work-archive.md

## Deferred from: the Epic 24 retrospective (2026-11-11)

- source_spec: `_bmad-output/implementation-artifacts/epic-24-retro-2026-11-11.md` (R-2, owner: E24-A5)
  summary: Review patch X3 of fix batch e24x pairs a stored point with its test on every seed, with no seed flag, so the "Origem resolvida" flag of a v1 to v13 point can change (a point of a restricted reading whose test now fails; a point of a failed reading whose test is now only restricted). Screen only; no verdict and no print reads it. The patch inverted the v13 assertion. It was not in the list put to Matheus with X7.
  evidence: `packages/domain/src/points/derived.ts:474-487`; `apps/web/src/surfaces/points/points-surface.tsx:197`; `packages/domain/src/relatorio/e23w-wave2-fixes.test.ts:178-188`; commit `8ea60738`.
  class: decision
  state: open (owner: Matheus: it stands, or it goes behind a v14 flag)
- source_spec: `_bmad-output/implementation-artifacts/epic-24-retro-2026-11-11.md` (R-4)
  summary: In the instrument panel a leave can clear the manufacturer right after "Criar": a registered maker is stored, a new name is typed and created, the field is left, focused again and left before the row re-reads; the held null is released and `manufacturer: null` is written after the new name. The sheet's field has a guard against this and the panel has none. Read in the code, not reproduced; it rests on React Aria reporting null on blur. This also denies, for the sheet, the lead fix batch e24z left on R8CAP-E2E-010: there the picker cannot clear a stored manufacturer, so that red is still unexplained.
  evidence: `apps/web/src/surfaces/registries/instrument-panel.tsx:316-319`; `apps/web/src/components/registry-picker-field.tsx:97-99,128-146`; `apps/web/src/surfaces/ficha/ficha-fields.tsx:793`; `apps/web/src/components/registry-picker-field.test.tsx:260-279` (no leave between the create and the option's arrival).
  class: gap
  state: open (owner: the next batch touching the registry picker or the instrument panel; low)

## Deferred from: Epic 25 batch e25a (2026-11-11)

- source_spec: `spec-e25a-saving-and-sync.md` (Design Notes D5, fix batch e24x B1)
  summary: a hung push still holds its cycle up to about 18 min (three attempts at 360 s): this batch bounds the file transfers, not the push; edits wait behind it, now with the `late` badge and line after one minute.
  evidence: `apps/web/src/sync/client.ts` `requestHeadersTimeoutMs`; `apps/web/src/sync/engine.ts` `withRetry`.
  class: note
  state: open (owner: the next batch touching sync; low)

## Deferred from: Epic 25 fix batch e25r (2026-11-11)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 25 fix batch e25x, the wave 1 review fixes (2026-11-12)

- source_spec: `spec-e25x-wave1-web-fixes.md` (A6 of the wave 1 integrated review, not fixed)
  summary: the late alert ("Envio atrasado") shows during slow photo uploads that work as designed: an edit waits one upload attempt before the push between files, and a `sent` row in flight for more than 60 s counts as late. Story 25.3 allows it.
  evidence: `apps/web/src/state/late-ops.ts`; `apps/web/src/sync/engine.ts` `pushBetweenFiles`.
  class: question
  state: open (owner: a question for the field engineer after field use: does the alert show while photos upload, and does it worry the technician?)
- source_spec: `spec-e25x-wave1-web-fixes.md` (Design Notes Q1)
  summary: "Fechar" on a draft offered at launch keeps its row (retro U7), so it is offered at every launch until "Recuperar"; a saved conclusion text does not drop its offered draft (it commits on every 500 ms pause, which is no answer to an offer). This batch drops only a reading's draft answered by a saved value, and a draft offered on return and closed with its field on screen.
  evidence: `apps/web/src/state/drafts.tsx` (`persistOne` `committed`/`answersOffer`, the toast's `onDismiss`).
  class: decision
  state: open (owner: Matheus: should "Fechar" drop a launch draft, and should a saved text drop its offered draft?)
- source_spec: `spec-e25x-wave1-web-fixes.md` (A3 and A4, scope)
  summary: the drop of an older draft row after a saved value is wired in the number input and the generated text only. The other draft sources (`ficha-fields.tsx` text fields, `state/draft-autosave.ts`, the fixtures surface) were not read for the same hazard; the point editor has its own rule (G1).
  evidence: `grep -rln useDraftSource apps/web/src`.
  class: gap
  state: open (owner: the next batch touching drafts; low)
- source_spec: `spec-e25x-wave1-web-fixes.md` (A8, scope)
  summary: `send` (file transfers) now reads a refused answer's body within a bound; `request` (the JSON routes: push, pulls, generate) still reads its answer body with no bound, as e24f left it ("the answer's download is not cut").
  evidence: `apps/web/src/sync/client.ts` `request`.
  class: note
  state: open (owner: the next batch touching sync, with fix batch e24x B1; low)

## Deferred from: Epic 25 batch e25c, the review of PR #332 (2026-11-12)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 25 batch e25p, the review of PR #333 (2026-11-12)

- source_spec: Story 25.23 (review of PR #333, finding 2; not fixed)
  summary: `planTestBaseUpdate` does not check that the file is newer than the revision the types hold, so an older revision applied after a newer one restores its older texts, shown only in the "Substitui N textos" count.
  evidence: `packages/domain/src/types/test-base-update.ts` `planTestBaseUpdate` (about line 233).
  class: gap
  state: open (owner: the next batch touching the test base update; low)
- source_spec: Story 25.23 (seen while fixing finding 1 of the review of PR #333; not fixed)
  summary: the update's draft for a copy of an older seed (v12) that gains current-seed tests fails the strict definition schema (`applies_when` and `winding_correction` name nameplate fields the old copy lacks), so that draft cannot be published as is.
  evidence: `packages/domain/src/types/test-base-update.ts` `addSeedTests`; reproduce with `companyTypeDefinitionSchema.safeParse` on the TR-OL draft of the AC2 case in `test-base-update.test.ts`.
  class: bug
  state: open (owner: Matheus to decide; medium)

## Deferred from: Epic 25 batch e25s, Stories 25.18 and 25.19 (2026-11-15)

- source_spec: Story 25.18 (DoD "the tap budgets checked on the TC")
  summary: The tap budget's journeys (`e2e/tap-budget.spec.ts`, J1 and J3) run on the seccionadora, so the TC's new item changes neither of them; 25.18-E2E-001 checks the TC's own count instead (NC, one chip, one "Marcar os restantes como Conforme" for the six others). No v16 run of `budgetRun` was added by this batch, to leave the spec to the wave's other lane.
  evidence: `e2e/seed-v16-lists.spec.ts`; `e2e/tap-budget.spec.ts` (`budgetRun`, v12, v14 and v15 runs).
  class: gap
  state: open (owner: the coordinator, at the wave gate; low)

## Deferred from: Epic 25 batch e25s, Story 25.14 (2026-11-15)

- source_spec: Story 25.14 (out of scope: the previous visit of an added row)
  summary: A row the technician adds is the sheet's, not the equipment's (the coordinator's reading). It has no previous visit: the issue keeps none of its readings in `last_results` (`readingSlotsOf` keys only the definition's rows), its MANUT. ANTERIOR prints "-", no history rule judges it, and the next visit starts without it. Whether a later visit should offer the rows the last one added (by name, from the issued revision) is open.
  evidence: `packages/domain/src/print/reading-slots.ts` `readingAddressKey` (an added row keys by its id); `packages/domain/src/relatorio/measurement-evaluation.ts` `applyHistory` (skips added rows); 25.14-UNIT "no previous visit is read for an added row".
  class: decision
  state: open (owner: Matheus)
- source_spec: Story 25.14 (AC "a row added on one device and removed on another while a third fills its cells")
  summary: Built as the merge rules give a removed block's cells: the removal stands and the readings written after it stay under the row's tombstone ("Desfazer" or a later restore brings them back); nothing throws on any device. A removed block also raises a removal decision in the conflict view ("Manter" or "Remover"); a removed row raises none, so the third device's readings leave the sheet without a word to it.
  evidence: `packages/domain/src/ops/apply.ts` `assertAddedRow` and `writeSheet` (the tombstone); 25.14-UNIT "two devices"; `packages/domain/src/merge/conflicts.ts` (a removed row's cells are not decided).
  class: decision
  state: open (owner: Matheus; a row-level removal decision would be a new decision kind and contract)
- source_spec: Story 25.14 (authored strings, listed for Bruno)
  summary: The batch's authored pt-BR texts, composed by the kernel from the key's words (`relatorio/added-rows.ts`) after the frames of `60-ficha.html` #/ficha/MA-02 and #/ficha/NB-02: "Ponto sem nome" ("{Stem} sem nome"), "Nome do ponto" ("Nome da bateria"), "Remover ponto {nome}", "Ponto removido: {nome}" ("Bateria removida: {nome}"), "Ponto acrescentado: dê um nome a ele", "Bateria acrescentada: {nome}", "{n} baterias acrescentadas: {nomes}", "Adicionar as {n} baterias que faltam" ("Adicionar a bateria que falta"), "A placa diz {n} baterias.", "Máximo de {n} pontos nesta tabela."; and the screen's fixed helper "Outra linha desta tabela já tem este nome." (`apps/web/src/copy/pt-br.ts`). Where the NB-02 frame says "Ponto removido: Bateria 1" and "Nome do ponto" on a battery, the kernel agrees the words with the stem ("Bateria removida", "Nome da bateria"), as the frame's own "Bateria acrescentada" does.
  evidence: `packages/domain/src/relatorio/added-rows.ts` (`// authored (e25s, Story 25.14, listed for Bruno)`); `apps/web/src/copy/pt-br.ts` `ficha.measurement.addedRowNameTaken`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 25 batch e25s, Story 25.15 (2026-11-15)

- source_spec: Story 25.15 (what the story did not settle)
  summary: Two readings of the agent's, open to Matheus. (1) Under "Outro" the paragraph's clause says the typed text in the reason's place, as typed and without its final period ("Termografia não realizada (Termovisor em calibração)."), while the printed line keeps Story 24.14's "MOTIVO: OUTRO, ⟨texto⟩"; "Outro" with no text reads "(outro)". (2) The line prints as a plain paragraph: the frame's bold "TERMOGRAFIA:" would need a run style the section-9 paragraph part does not have. Also: a v16 thermography's points are new row keys, so a next visit after a v15 relatório prints "-" in MANUT. ANTERIOR for them.
  evidence: `packages/domain/src/relatorio/e25s-thermography.test.ts`; `key-print-section-9-v15.html` (`p.pp-line` with `<b>`).
  class: decision
  state: open (owner: Matheus)

## Deferred from: Epic 25 batch e25s, the review of PR #334 (2026-11-15)

- source_spec: Story 25.14 (review of PR #334; not fixed)
  summary: Undoing the removal of an added row fails with the generic write-error toast when the table is back at its maximum (another row was added after the removal): the fold refuses the restore (`removed_at` back to null over a full table), and the device's commit path applies the inverse op straight through `applyOp`, so the refusal surfaces as a write error instead of a reason such as "Máximo de 30 pontos nesta tabela.".
  evidence: `packages/domain/src/ops/apply.ts` `assertAddedRow` (the `value === null` restore over `liveAddedRows(rows) >= max`, about line 633); `apps/web/src/db/commit.ts` `applyOne` (calls `applyOp` directly, about line 82).
  class: gap
  state: open (owner: the next batch touching added rows; low)

## Deferred from: Epic 27 batch e27a, slice 2 (Story 27.1, 2026-11-21)

All rows closed; see deferred-work-archive.md

## Deferred from: Epic 26 batch e26d, Stories 26.9, 26.11 and 26.6 web (2026-11-22)

- source_spec: Story 26.6 web half (frames 13 and 14)
  summary: The set-password page does not say the invitee's name, e-mail or the link's expiry ("Olá, Fernanda", the read-only e-mail, "vale até 23/11 10:30"): the link route gives no lookup of the token, so the page cannot know them. A used link is known only when "Salvar senha" is pressed. A read-only `GET` that names the user and the expiry of a token would let the page show them.
  evidence: `apps/web/src/surfaces/login/set-password-surface.tsx`.
  class: gap
  state: open (owner: Matheus, a small api route if wanted)
- source_spec: spec-e26s-pass-fixes.md (hands-on pass of Epic 26, 2026-11-22, F2-6)
  summary: The "último acesso" line of the Usuários rows is computed from `session` rows (`max(session.createdAt)` in `listUsers`), so it is empty for a user with no live session and disappears at sign-out. Keeping the last sign-in past sign-out, a pause and a reactivation needs data that survives them: no column or op holds it today, so a new `user` column (migration) or a server-only op and its kernel field would be needed. Not built in e26s (report-first rule: no migration, no op).
  evidence: `apps/api/src/admin/users.ts` `listUsers`; `packages/domain/src/permissions/user-list.ts` `userLastAccessText`.
  class: gap
  state: open (owner: next UX pass, Matheus decides the column or the op)
- source_spec: spec-e26s-pass-fixes.md (hands-on pass of Epic 26, 2026-11-22)
  summary: Frame 92's row lines are not drawn: "convite enviado em ..., vale até ..." (invited), "pausado em ... por ..." (paused) and "removido em ... por ..." (removed). The rows show the role and the last access only. The dates and the actor need data the kernel row does not hold (when and by whom a status was set; the invitation's expiry is in a `verification` row).
  evidence: `mockups/prototype/screens/92-usuarios.html`; `packages/domain/src/permissions/user-list.ts` `userRowDetailText`.
  class: gap
  state: open (owner: next UX pass)
- source_spec: spec-e27c-layout.md (Story 27.14, the Home half; coordinator's decision of 2026-11-22)
  summary: A Home card for a relatório not on the device shows no date, and two such cards of the same client and obra cannot be told apart (F21). The card comes from the company pull summary, which carries no service date. It needs `service_start` and `service_end` in `relatorioSummarySchema` (`packages/domain/src/contract/sync.ts`) and in the summary `apps/api/src/sync/pull.ts` builds, one contract number (Story 10.4's optional `progress` in the same summary took contract 11), then the line composed in `packages/domain/src/home/cards.ts` with its "27.14-UNIT" test and the Home case of `e2e/templates-home-cards.spec.ts`.
  evidence: `packages/domain/src/home/cards.ts` `fromSummary` (service dates null); `apps/api/src/sync/pull.ts` summary mapping.
  class: gap
  state: open (owner: a later batch with a contract number; Matheus decides when) | 2026-11-24 (Epic 30, Story 30.1): left for a later batch: it needs a contract number (`relatorioSummarySchema`), and Story 30.1 changes no contract
- source_spec: spec-e27c-layout.md (wave 1's known-open tables, measured by batch e27c)
  summary: Two readings tables still do not fit their box, and the stacked corrected-column rule of Story 27.7 does not make them fit: an oil transformer's (seed v16) at 1280 px is 1448 px wide in an 864 px box, 1362 px with the corrected column stacked; the disjuntor's at 768 px with the tree opened by hand is 505 to 593 px in a 400 px box (the stacked rule already applies there), so it scrolls inside its own `.mt-scroll` box. Both need a design decision (another phone-like layout of the table below a width, fewer columns, or the tree closed), not a CSS copy.
  evidence: `apps/web/src/styles/app.css` (the e23v and Story 27.7 rules); `e2e/corrected-column-fit.spec.ts`.
  class: design
  state: open (owner: Matheus, a design decision)

## Deferred from: Epic 27 batch e27d and the browser pass (2026-11-22)

- source_spec: spec-e27d-review-fixes.md (X3 b, wave 3 review of Epic 27, 2026-11-22)
  summary: Cadastros › Clientes: when the repeated-name warning holds a new client, the other fields typed meanwhile wait for "Criar mesmo assim" or a new name (W2, X3 a). If the panel is closed while the name is held, those waiting fields are dropped with no word. The panel has no leave or discard confirmation to reuse, so no one-line fix exists.
  evidence: `apps/web/src/surfaces/registries/client-panel.tsx`; `apps/web/src/surfaces/registries/client-panel.test.tsx`.
  class: gap
  state: open (owner: next UX pass; Matheus decides whether the panel gets a leave confirmation)
- source_spec: spec-e27d-review-fixes.md (X3, Story 2.1's pattern)
  summary: A new client whose first filled field is not the name (a CNPJ, a contact) is still created on that field with an empty name, as before Epic 27. Only the name field never creates a nameless client (X3 a). The test "with no repeated name the first field still creates the client" pins the Story 2.1 behaviour.
  evidence: `apps/web/src/surfaces/registries/client-panel.tsx`; `apps/web/src/surfaces/registries/client-panel.test.tsx`.
  class: gap
  state: open (owner: Matheus decides whether a client may exist without a name)
- source_spec: browser pass of Epic 27 on 886af55e (2026-11-22)
  summary: Section 10 of the printed relatório reads "N ficha apresentou restrições (TAG)" for a ficha still open that holds one NC item, next to "ainda não concluídas". Story 27.3 split the wording of the open ficha only for a failed reading (`parecer_open_apart`, `OPEN_OUT_SINGULAR`), so an open ficha with an NC item is still counted among the fichas with restrictions. Authored sentence, open for Bruno.
  evidence: `packages/domain/src/relatorio/parecer.ts` (the `pending` clause and the `withRestriction` sentence of the summary); found in the 2026-11-22 browser pass.
  class: gap
  state: open (owner: Matheus decides with Bruno whether an open ficha with an NC item reads as restrictions or as open)

## Deferred from: Epics 28 and 29, the wave gates and the hands-on pass (2026-11-23 and 2026-11-24)

- source_spec: hands-on pass of 2026-11-23 (N1), `_bmad-output/test-artifacts/manual/hands-on-pass-2026-11-23.md`
  summary: The Gerar dialog has no "Cancelar" button.
  evidence: `apps/web/src/surfaces/export/export-dialog.tsx`.
  class: gap
  state: open (owner: Matheus decides whether the dialog gets one)
- source_spec: fix batch e28w (#377, S2 and N2), `_bmad-output/planning-artifacts/epics.md` Story 29.2
  summary: A Sumário that was the tab's first page keeps no view on a back: the router keeps it under its shared "default" key, so a back to it cannot restore the expanded sections and the scroll.
  evidence: `apps/web/src/state/history-return.ts` (`UNKEYED`); the e28w note under Story 29.2 in `epics.md`.
  class: gap
  state: open (owner: a later fix batch; low)
- source_spec: paid plate evaluation of 2026-11-24
  summary: `apps/api/src/scripts/eval-samples.ts` has no v18 sample. The v18 probe plates of the evaluation are untracked (`test-results/eval-e28-v18/`), so the next paid run cannot repeat the v18 check from the repository.
  evidence: `apps/api/src/scripts/eval-samples.ts`; `apps/api/src/scripts/bedrock-eval.ts`.
  class: test-gap
  state: open (owner: the next change of the plate prompt or the evaluation set; needs a non-client plate)
- source_spec: paid plate evaluation of 2026-11-24
  summary: A permanent error from the default reading model never tries the escalation model. The escalation is decided by `shouldEscalate` on a first reading that came back (more than half of its fields on verify, or empty); when the default model fails outright, as Haiku did before #375 and #376, the run fails and the second model is not tried.
  evidence: `apps/api/src/jobs/reading/kinds/plate.ts`; `apps/api/src/jobs/reading/providers/index.ts`; `apps/api/src/jobs/reading/job.integration.test.ts` ("a plate more than half verify is read once more on the escalation model").
  class: gap
  state: open (owner: Matheus decides whether a permanent default-model error should try the escalation model; the cost is a second paid call)
- source_spec: paid plate evaluation of 2026-11-24
  summary: The escalation model `us.amazon.nova-pro-v1:0` was last evaluated in the round before #375 and #376 (synthetic 96.9 % (94 of 97), real plates 5 of 6, dry plate 1 of 2) and not repeated after them.
  evidence: `_bmad-output/implementation-artifacts/epic-28-context.md` "Delivery record, 2026-11-24".
  class: test-gap
  state: open (owner: the next paid evaluation, on Matheus's word for the spend)
- source_spec: hands-on pass of 2026-11-23, "Not checked in the pass"
  summary: Not checked: a sheet with no TAG; a read-only role on "Itens adicionais"; a v17 relatório; revisions issued on different days; the hashed icon sprite (#369) in a real browser; change password offline; a real Android or iPad device.
  evidence: `_bmad-output/test-artifacts/manual/hands-on-pass-2026-11-23.md`.
  class: test-gap
  state: open (owner: the next manual pass; the real Android or iPad device first)

## Deferred from: Story 30.5, batch e30d, the unstable tests (2026-11-25)

- source_spec: `_bmad-output/planning-artifacts/epics.md` Story 30.5 item 11 (14.5-E2E-001)
  summary: After "Revisão 1 pronta", the Export dialog lays out again and its "DOCX — abrir no Word" row moves 48 px up 40 to 270 ms later (6 of 10 diagnosed runs), so a press that meets the move lands beside the button and fetches nothing; the arriving element that shifts the centred dialog was not named. A person tapping as the revision lands can miss the same way.
  evidence: `apps/web/src/surfaces/export/export-dialog.tsx` (the ready phase); the batch's diagnosed run (`.scratch-e30d/logs/r13-cta-diag.log` in its worktree, not tracked) and the pfinal red (no `GET /api/revisions/…/docx`).
  class: bug
  state: open (owner: Matheus decides the fix: draw the ready body once all it shows is on the device, as Home's `settled` does, or keep the dialog's top fixed in that phase; the next batch touching the Export dialog builds it)
- source_spec: `_bmad-output/planning-artifacts/epics.md` Story 30.5 item 2 (1.6-E2E-001), closed there as "cause not found"
  summary: Red 1 of 20 at the gate's load: after the tap on the Emitido card, "Baixando o relatório…" stayed 27.6 s until the 30 s test timeout, while passing runs take 2.4 to 4.9 s in all; a stalled Sumário pull, not the test's budget. The static hunt's lead (the held stream unrouted while its handler sleeps) was refuted 3 of 3. Not reproduced on six workers (0 of 12).
  evidence: `e2e/home.spec.ts` 1.6-E2E-001; `apps/web/src/surfaces/relatorio/relatorio-gate.tsx` (the pull on open); `apps/web/src/sync/engine.ts` `syncRelatorio`; the batch's pfinal run (`timings-parallel.json`, one 27.6 s wait).
  class: test-gap
  state: open (owner: the next e2e flake pass; record the device's sync state and the engine's cycle at the red to find the stall)
- source_spec: `_bmad-output/planning-artifacts/epics.md` Story 30.5 item 9 (24.10-E2E-005), closed there as "cause not found"
  summary: Red 1 of 20 in the solo lane: after the "13,8 kV" pick on TENSÃO DE PLACA, its list "Sugestões Tensão de placa" was open again (or still) 2 s later, so the page stayed `aria-hidden` and the next tap ("Corrente nominal") hit the grid. Why the list was open was not found; a person would meet the same blocked tap.
  evidence: `e2e/journeys-12-3-12-4.spec.ts` `pickWord`; `apps/web/src/components/registry-picker-field.tsx`; `apps/web/src/components/combobox.tsx`; the batch's pfinal run (the page snapshot holds the open list).
  class: bug
  state: open (owner: the next batch touching the registry picker; with the R8CAP-E2E-010 history)

## Deferred from: Stories 31.5 and 31.6, batch e31c (2026-11-26)

- source_spec: `_bmad-output/planning-artifacts/epics.md` Story 31.4 outcome line (the open risk e31b named)
  summary: Online, the batch caption's "Adicionar N fotos" writes the typed caption on every photo of the batch (`assignPhotoBatch`), compared only against the caption the photos were saved with. When the first photo's audio was transcribed before the tap, its caption already holds the audio's text and the put overwrites it; the audio row still names the photo, so the mark reads "Áudio, editado". The fix reads each photo's current caption in the commit and skips a photo whose caption no longer equals the saved one; it lives in `surfaces/photos/photo-ops.ts` and `capture-sheet.tsx`, outside this batch's files.
  evidence: `apps/web/src/surfaces/photos/photo-ops.ts` `assignPhotoBatch`; `apps/web/src/surfaces/photos/capture-sheet.tsx` (the batch caption's audio on the first photo, Story 31.3).
  class: bug
  state: ~~open (owner: batch e31d, Story 31.7, which touches the photo caption surfaces; one e2e: record on the batch caption online, wait for the text, tap "Adicionar N fotos", the first photo keeps the audio's text)~~ closed (2026-11-26, batch e31d, Story 31.7: `assignPhotoBatch` reads each photo's caption in the commit and puts the typed caption, and asks the vision caption, only where it still equals the saved one; `photo-ops.test.ts` 31.7-UNIT-007, `e2e/audio-remaining-fields.spec.ts` 31.7-E2E-003)
