---
title: 'Review fixes: field defects from the hands-on review'
type: 'bugfix'
created: '2026-09-30'
status: 'in-review'
baseline_revision: 'b2caf768182089d5e7b03b914ce735a93c32d980'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-fixes-2026-09-30-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/full-review-2026-09-30/2-ux-review.md'
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/full-review-2026-09-30/1-code-quality.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Batch rff of the 2026-09-30 review fixes: the coordinator cut the review findings by owned files into one PR per batch (token economy).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The hands-on review of 2026-09-30 found field defects on the ficha, Sumário, setup, photos, points, export, login and registries surfaces (F-01..F-26 minus F-04), plus kernel date/format bugs and surface robustness gaps (K-3, K-4, K-5, K-12, W-9, W-12, W-13, W-14, W-23), the 429 sign-in text and the caption composer opening in "Editar texto". Two are high: a value typed over a plate suggestion is lost on Tab (F-01) and undo toasts render out of the viewport (F-02).

**Approach:** Fix each finding in the files batch `rff` owns, each with a test that fails before the fix (unit for kernel and component logic, Playwright for behaviour a human sees). Findings whose fix sits in another batch's files, contradicts a story AC, or needs a product decision are explained, deferred with a `deferred-work.md` entry, or listed as open questions (table below).

## Boundaries & Constraints

**Always:**
- Test first: write the test, see it fail on the current code, then fix. New `@p0` specs assert the committed state (outbox via `e2e/support/outbox.ts` `readStore`, or the store), not only the screen.
- Mechanism fixes F-01 (commit on blur) and F-02 (toast placement) ship a mutation run: revert the fix in the working tree, show the gate spec red, restore; record the result in the spec's Auto Run Result.
- `tokens.css` and `components.css` stay byte-identical; CSS fixes go in `apps/web/src/styles/app.css` (with a comment naming the mock rule mirrored) or the surface's own CSS file.
- Status, count, plural and derived text live in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts` (new authored sentences marked `// authored:`); chrome in `copy/ui.ts`. No emoji. Code and comments in English.
- Layout fixes are asserted at 390 and 1280 px in an e2e (bounding boxes inside the viewport / panel).
- Run tools only in Docker: `docker compose --profile tools run --rm tools pnpm ...`.

**Never:**
- Edit files owned by other wave-1 batches: `apps/web/src/db/**`, `apps/web/src/state/**`, `apps/web/src/sync/**`, `apps/web/src/surfaces/sync/**`, `packages/domain/src/{ops,points,print,schemas,merge}/**`, `packages/domain/src/relatorio/{tree.ts,sheet-progress.ts,sumario.ts,pre-issue.ts}`, `apps/api/**`, `infra/`, `docker-compose.yml`, `services/ocr/`, `scripts/`, `e2e/support/**` (adding a new helper file under `e2e/` beside a spec is fine; do not refactor shared helpers).
- Change `CONTRACT_VERSION`, any op path, the goldens, or the generated document.
- Touch F-04, F-16, F-19 behaviour, session lifetime, or any application password.
- Add optimistic sheet state that bypasses IndexedDB (AD-13).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| F-01 Tab off a suggestion | "TAP atual" = "5 · Verificar", type 3, Tab | outbox gets `put sheet/{b}/nameplate/tap_atual = "3"` plus the discard; reload shows 3, no "Verificar" pill | invalid typed value keeps the field editable with the invalid helper, nothing written |
| F-01 Confirmar pressed | type 3, then tap the field's own "Confirmar" | exactly one write (no double commit) | - |
| F-01 typed before suggestion lands | plain field has uncommitted typed text when the suggestion arrives | the typed text is committed (flush on unmount), never silently replaced | - |
| K-3 evening | now = 22:30 America/Sao_Paulo, certificate valid until today, no service end | `valid` (not `expired`) | - |
| K-4 month end | 2026-01-31 + 1 month | 2026-02-28 (clamped) | leap year 2028-01-31 + 1 = 2028-02-29 |
| K-5 other year | last sync 30/09/2025, now 30/09/2026 | stamp carries the date, not only the time | - |
| 429 sign-in | POST sign-in answers 429 | authored rate-limit sentence, not "Senha incorreta" | 401/400 keep the wrong-password text |
| F-22 nonsense year | plate date typed 20/02/0001 | refused with the invalid-date helper, nothing written | years 1900..current+1 accepted |
| Caption opens | stored caption composed at capture with an activity the device no longer prefills | composer opens on the chip rows with the matching chips selected, "Editar texto" off | a hand-typed caption the rows cannot compose still opens as free text |

</intent-contract>

## Code Map

Paths relative to the repo root. Evidence per finding is in `2-ux-review.md` / `1-code-quality.md`; anchors below were verified 2026-09-30.

- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:293-326` -- `SuggestionFill.commit`; onBlur guard at :323-324 returns when `relatedTarget` is the field's own `.confirm-btn`. Tab from the input lands on that button (`components/suggestion-field.tsx:117-135` puts it after the input), so nothing is committed and tabbing off the button has no handler. F-01 cause 1.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx:226-227` -- swaps the plain `SheetField` for `<SuggestionFill key=...>` when a suggestion lands on an empty field; the plain field's 500 ms `useFieldCommit` debounce (`ficha-fields.tsx:30`) may not have fired. F-01 cause 2. Also :93-94 plate row from `platePhotoOf(suggestions.tiles)` (F-13) and :114-123 "Igual à" copy (F-07).
- `apps/web/src/components/registry-picker-field.tsx:69-71` -- `inputValue` initialised once, never resynced when `value` changes (copy, undo, pull): F-07. Date fields resync at `ficha-fields.tsx:266-271` (pattern to reuse).
- `apps/web/src/state/toast.tsx:109` (read only) mounts `components/toast.tsx:58` `div.toast` once in `surfaces/app-shell.tsx:169`; `components.css:129-138` is `position:absolute`. Sticky bars: `ficha.css:78`, `photos.css:43`, phone stack at `app.css:125`. F-02.
- `packages/domain/src/relatorio/section-variables.ts:95-96` -- restore writes `section_text: null`; `apps/web/src/surfaces/relatorio/section-text-surface.tsx:71` already finds the template by `snapshot.relatorio.template_id`, fallback at :97-99, restore at :135-143; template block text at `block-config.ts:179`. F-03/K-14.
- `apps/web/src/surfaces/home/new-project-dialog.tsx:52, 110-131` -- Local list from `projectsOfClient` only; client `sites: {id,address}[]` (`packages/domain/src/schemas/entities.ts:147`, read only). F-05.
- `apps/web/src/surfaces/registries/registries.css:100-106, 196-206, 215-245`; `app.css:278`; `components/upload-tile.tsx:168-190`; `surfaces/registries/instrument-panel.tsx:333`. F-08, F-21 (cover tile in `relatorio/setup/etapa1-capa.tsx:107`, override in `relatorio.css`).
- `apps/web/src/surfaces/points/point-editor.tsx:466-469, 494-496`; `point-text-editor.ts:47-53` (`insertPhotoChip`), `:83-95` (`quickTextAt`, the spacing rule to reuse). F-09.
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx:715-724`; `components.css:374-379` (`.tree-body`, `.tree-state`). F-10.
- `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx:40-54`. F-11/W-14. A per-relatório "asked" marker: surface-local helper (localStorage wrapped in try/catch, or `db.local_prefs` read/put from the surface if lint allows; do not edit `db/prefs.ts`).
- `apps/web/src/surfaces/export/use-preview.ts:128-131`, `use-generate.ts:345-347`, `export-dialog.tsx:95-113` (`runFile`), `revision-file.ts:30-34` (`SyncRequestError{kind:'http',status}` from `sync/client.ts:118-134`, read only); `copy/pt-br.ts:169` `sessionExpired`; `api/auth-client.ts:31` `publishReAuth`. F-12 (dialog part), W-23.
- `apps/web/src/surfaces/ficha/ficha-dialogs.tsx:49`, `capture-sheet.tsx:335-339`, `usePhotoImport` :57-91 (toast `photosImportedText`). F-13.
- `apps/web/src/components/input/rich-text-field.tsx:87`; `components.css:944-945` (`.rich-text`, `.rt-toolbar` has `flex-wrap` but shrinks); `templates.css:108`. F-14.
- `apps/web/src/surfaces/export/export-dialog.tsx:374-395` -- document control `dl`. F-15.
- `apps/web/src/surfaces/ficha/read-display.tsx:227-237` `QueuedBanner`; online from `useSession().online` or `useSync().online` (read only). F-17.
- `packages/domain/src/registry/instrument-row.ts:48` (`primaryRest` with leading "— "); `surfaces/relatorio/setup/etapa4-instrumentos.tsx:83-85`; phone rule `app.css:236`. F-20.
- `apps/web/src/components/date-field.tsx:39`; `surfaces/ficha/ficha-fields.tsx:313-335` (`DatePickerField`); plate date kinds `packages/domain/src/seed/v1.ts:32,45-46`; `format/datetime.ts:124` `parseCalendarDate`. F-22.
- `apps/web/src/surfaces/login/login-surface.tsx:51, 66-68`; `app-shell.tsx:129`; `api/auth-client.ts:121` (`isClientRejection` maps 429 to `credentialsRejected`); `copy/pt-br.ts:19`. F-23, 429.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:268-271, 301-303` -- counts call `openSection9`. F-24.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:194-199` -- toast on batch resolve before redraw. F-25.
- `packages/domain/src/relatorio/ficha.ts:170-187` `recentChecklistObservations` includes the current block's own observation; `surfaces/ficha/checklist-section.tsx:219, 366`. F-26.
- `packages/domain/src/checks/calibration.ts:40-42, 53, 91`; `format/datetime.ts:207` `calendarDateOfInstant`, `:115` clamp pattern. K-3, K-4.
- `packages/domain/src/home/cards.ts:159`. K-5.
- `packages/domain/src/format/datetime.ts:96-100, 156-167, 175-186`. K-12.
- `apps/web/src/surfaces/photos/gallery-surface.tsx:142, 147-150, 192-202, 207`; `surfaces/ficha/use-ficha-photos.ts:112`; `writeErrorText` (kernel). W-9.
- `apps/web/src/surfaces/relatorio/setup/etapa2-escopo.tsx:31, 58, 74-81, 123`. W-12.
- `apps/web/src/surfaces/ficha/camera-view.tsx:224-241`. W-13.
- `apps/web/src/surfaces/photos/caption-composer.tsx:121-124`; `packages/domain/src/photos/caption.ts:202` `composeCaption`. Caption composer.
- Tests nearby: `e2e/plate-reading.spec.ts` (fixture `services/ocr/tests/fixtures/plate-transformador.jpg`, `importPlate`), `e2e/suggestions.spec.ts:186` (Enter variant), `e2e/support/reading-ops.ts` (`openTransformerSheet`, `pushPlateSuggestions`), `e2e/support/outbox.ts` (`readStore`), `e2e/journeys-12-3-12-4.spec.ts`, `e2e/cadastros.spec.ts`, `e2e/points.spec.ts`, `e2e/tree.spec.ts`, `e2e/templates.spec.ts`, `e2e/read-display.spec.ts`, `e2e/relatorio.spec.ts`; unit tests beside each file.

## Tasks & Acceptance

**Execution (each: failing test first, then the fix):**
- F-01 `nameplate-suggestions.tsx` -- commit when focus leaves the suggestion root for anything but a press on its own Confirmar (e.g. skip only while a pointer press on `.confirm-btn` is in progress, or commit on the root's blur when focus leaves root); `ficha-fields.tsx`/`nameplate-section.tsx` -- flush a plain field's pending text on unmount so a landing suggestion never swallows it. Test: new `@p0` e2e (fake OCR, plate fixture, type over the "Verificar" TAP atual, Tab, reload; assert outbox op and field) plus a tap-elsewhere variant; mutation run.
- F-02 `app.css` -- `.toast { position: fixed; ... }` mirroring `components.css:129` with `bottom` kept above the sticky action bar (and at phone width). Test: `@p0` e2e on a long ficha: scroll to the checklist, bulk action, toast "Desfazer" inside the viewport and above the sticky bar, at 1280 and 390; mutation run.
- F-03/K-14 `section-variables.ts` + `section-text-surface.tsx` -- restore writes the relatório's template block text for that section (template row found by `template_id`, block by `block_type`), falling back to null/seed when the template or its text is absent. Unit test in `section-variables.test.ts`; e2e restore after a customised template text.
- F-05 `new-project-dialog.tsx` -- Local list offers the client's registered sites (dedupe against existing projects by name); picking a site with no project creates the project with that site. Unit + e2e.
- F-07 `registry-picker-field.tsx` -- resync `inputValue` when `value` changes while not focused/editing. Unit test; e2e "Igual à" copies Fabricação and Tensão de placa (assert store and field).
- F-08 `registries.css` (and `app.css:278` phone rule) -- `minmax(0,1fr)`, `min-width:0` on grid fields, `flex-wrap` on the file row. e2e bounding boxes at 1280 and 390.
- F-09 `point-editor.tsx`/`point-text-editor.ts` -- the chip lands with spacing (reuse the `quickTextAt` lead/tail rule) and, when the caret was never placed by the user, at the end of the text (autofocus puts the caret at the end). Unit + e2e (stored text has a space on both sides of the token).
- F-10 `app.css` -- mirror `.tree-body`/`.tree-state` so the label wraps inside its column (`overflow-wrap:anywhere`, state `flex:none`). e2e at 1280 and 768: label and state boxes do not intersect.
- F-11/W-14 `etapa5-local.tsx` -- ask at most once per relatório (persisted marker set on the first answer, granted or denied) and a cancelled guard. Unit test counting `getCurrentPosition` calls across remounts.
- F-12/W-23 `use-preview.ts`, `use-generate.ts`, `export-dialog.tsx`, `revision-file.ts` -- a 401 calls `publishReAuth()` and shows `sessionExpired` text with "Entrar de novo" instead of the generic failure. Unit tests (update `export-dialog.test.tsx:1105-1111`).
- F-13 `nameplate-section.tsx` (+ plate tile) -- after the shutter, the tile shows the photo's pending/reading state at once, before the committed row arrives (local transient state keyed to the capture, cleared when the committed tile appears); the sheet import toast is visible (F-02). e2e.
- F-14 `app.css` -- `.rich-text .rt-toolbar { flex: none; }` (mirror). e2e at 390: all five toolbar buttons visible and clickable.
- F-15 `export-dialog.tsx` + `copy/pt-br.ts` -- when the company is not registered, a note under Controle do documento: `// authored:` "Cadastre a empresa em Cadastros › Empresa". Unit.
- F-17 `read-display.tsx` -- online shows "Lendo…" (State Patterns), offline keeps "Foto guardada — leitura quando houver sinal". Unit.
- F-20 `registry/instrument-row.ts` + `etapa4-instrumentos.tsx` -- no dangling "— " when the code sits in its own column (expose the name part without the separator). Unit.
- F-21 `relatorio.css` -- the setup cover tile caption is not truncated at 1280 (wider tile or wrapping name). e2e box/ellipsis check.
- F-22 `date-field.tsx` + `ficha-fields.tsx` -- plate date fields refuse a year below 1900 (invalid helper, nothing written). Unit.
- F-23 `login-surface.tsx` -- e-mail prefilled from the signed-in (expired) user or last session. Unit.
- F-24 `sumario-surface.tsx` -- tapping a count scrolls section 9 into view and moves focus to the first tree row carrying that state (NC aberto, não ensaiada, sugestão por confirmar, concluída), expanding as needed. Unit + e2e.
- F-25 `nameplate-suggestions.tsx` -- the confirmation toast fires once the field is drawn as confirmed (or together with it), never while the pill still shows. Unit or known-open if it needs the commit path.
- F-26 `relatorio/ficha.ts` + `checklist-section.tsx` -- recent observation chips exclude the current block's own observation. Kernel unit.
- K-3, K-4 `checks/calibration.ts` -- São Paulo calendar day as "now"; clamp month-end. Unit.
- K-5 `home/cards.ts` -- same-day by full date. Unit.
- K-12 `format/datetime.ts` -- one range implementation with a `style` parameter behind both exported names (outputs unchanged, goldens byte-identical); move the misplaced JSDoc. Unit.
- W-9 `gallery-surface.tsx`, `use-ficha-photos.ts` -- every photo write has a `.catch` that shows `writeErrorText`. Unit.
- W-12 `etapa2-escopo.tsx` -- stable local ids as keys. Unit (remove row keeps the neighbour's focus/text).
- W-13 `camera-view.tsx` -- `finally` resets `finishing` and stops the stream. Unit.
- 429 `api/auth-client.ts` + `copy/pt-br.ts` + `login-surface.tsx` -- 429 maps to a new `// authored:` "Muitas tentativas. Tente novamente em alguns minutos." Unit.
- Caption `photos/caption.ts` + `caption-composer.tsx` -- a kernel function that recovers the chip parts composing a stored caption from the prefill and the sources (e.g. any activity word with the prefilled equipment/local); the composer opens on the rows with those parts when found, "Editar texto" otherwise. Kernel unit + component unit.
- `deferred-work.md` -- entries for F-06, F-09 renderer "conforme", F-12 badge, K-13, W-22 (see Design Notes).

**Acceptance Criteria:**
- Given a transformer ficha with the fake plate read, when the user types 3 over "TAP atual · Verificar" and leaves with Tab or a tap on another field, then the outbox holds the `nameplate/tap_atual` put of "3" and after a reload the field shows 3 without the pill.
- Given a sheet scrolled 1900 px down, when a bulk action or any undoable edit shows its toast, then the toast and its "Desfazer" are fully inside the viewport above the sticky action bar at 1280 and 390 px.
- Given a template whose section text was customised, when the user restores the section in a relatório made from it, then the customised text (not the seed) is shown and stored.
- Given a registered client with a site, when the user opens "Novo relatório" and picks the client, then the site is offered in "Local (obra)" without typing.
- Given SEC-A with Fabricação and Tensão de placa set, when the user applies "Igual à SEC-A?" on SEC-B, then both fields show and store the copied values.
- Given the instrument editor, the rich text toolbar, the tree rail and the setup cover tile at 390/768/1280 px, when rendered, then no control or label is clipped or overlapped (asserted by boxes).
- Given a 401 during preview, generate or a revision download, when it fails, then the dialog says the session expired and offers "Entrar de novo", and a 429 on sign-in shows the rate-limit sentence.
- Given every other item in the task list, when its test runs, then it fails on the pre-fix code and passes after.
- `pnpm verify` is green; targeted specs touched run green.

## Design Notes

Not fixed here, with the reason (each goes in the PR body; deferred ones get a `deferred-work.md` entry naming the owner):
- F-04: out of scope (coordinator, waiting for Matheus).
- F-06 (bulk feedback 2-8 s on 94 blocks): the cost is the commit path and live queries (K-1, K-2, W-1, W-3, W-5, W-6, W-8, owned by `rfp`); optimistic sheet state would break AD-13. Deferred: re-measure after `rfp` merges (owner: wave-2 QA).
- F-09 renderer printing "conforme Imagem N": `print/section-8.ts` is `rfp`'s and the goldens must stay byte-identical in wave 1; whether the renderer adds "conforme" or the engineer types it is an open question. Deferred to wave 2 (`rfr`).
- F-12 badge "sem conexão" after a 401: `state/sync.tsx` and `sync/policy.ts` are `rfp`'s and a session badge state is a new product state absent from the mocks: open question, deferred.
- F-16: Story 5.1 AC says "Concluir ficha" moves to the next sheet; changing it contradicts the AC: open question.
- F-18: the pill seen is the next sheet's own suggestion (a consequence of F-16), not a stale pill: explained.
- F-19: no document says what the second same-account option is called, and the code is in `merge/` + `surfaces/sync/` (`rfp`): open question.
- K-13: the three readers live in `tree.ts`, `points/derived.ts` (owned by `rfp`) and `parecer.ts` (prints in the golden): deferred to wave 2 (`rfr`).
- W-22: aborting the prefetch needs a `signal` parameter in `sync/client.ts` (`rfp`): deferred.
- F-24 narrowing: "tap through to its list" is read as focusing the first matching row of the tree; a filtered list view is not built.
- F-03 narrowing: restore uses the template's current text (the template row on the device), not the text at `template_version`.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green
- `docker compose up -d` once (api, web, postgres, minio; this worktree's `.env` isolates the project), then `docker compose --profile tools run --rm tools pnpm test:e2e:full e2e/<spec>.spec.ts` (`scripts/e2e.ts` passes the arguments to Playwright) -- each touched or new spec green; wrap any multi-worker run in `flock /tmp/fasor-verify.lock`
- `docker compose --profile tools run --rm tools pnpm verify` (orchestrator runs it under the host lock) -- green
