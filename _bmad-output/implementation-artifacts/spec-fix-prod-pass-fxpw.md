---
title: 'Fix batch fxpw: the ten web and kernel gaps of the production pass (G1 to G5, G7 to G11)'
type: 'bugfix'
created: '2026-10-29'
status: 'ready-for-dev'
baseline_revision: '316285ab'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/prod-pass-fix-context.md'
warnings: ['batched', 'oversized'] # coordinator's cut (prod-pass-fix-context.md): the ten web and kernel gaps of the 2026-10-28 production pass, one batch beside the OCR batch fxg6
deferred: []
---

<intent-contract>

## Intent

**Problem:** The production pass of v0.4.0 (`_bmad-output/test-artifacts/manual/prod-pass-2026-10-28.md` § Gaps; ledger rows in `deferred-work.md` § "Deferred from: production pass, epic by epic (2026-10-28)") left ten web and kernel gaps: G8 (P2) a long learned NC phrase chip widens the sheet at 390 px; G1 a console error on the first load of an empty device; G2 the template composer's "Seções" palette adds a section the template already holds; G3 the import toast says "legenda aplicada" with no caption; G4 the cabine's "Tensão secundária" refuses `380/220`; G5 "fichas concluídas" carries two numbers (Sumário header vs parecer); G7 no TAG re-suggestion seen after "Mover para…"; G9 no merge row seen in Sync status; G10 a pending plate suggestion stays on an oil field the oil rule excuses; G11 "Cancelar" on the capture sheet keeps the photos with no way back.

**Approach:** Apply the coordinator's decisions of `prod-pass-fix-context.md` item by item, kernel first, each with a test red before its fix. The investigation (Code Map) found that G7 and G9 are not product defects (the pass's own scripts): they ship the pinning tests the coordinator named, green on the unfixed code, and no product change. G1's cause is the sync engine starting on a cached pointer's database before the server confirms which user the cookie belongs to.

## Boundaries & Constraints

**Always:** every predicate, count, derived text and composed sentence in `packages/domain` (`apps/web` renders and writes ops only); new pt-BR sentences in their AGENTS.md home marked `// authored (fix batch fxpw, open for Bruno)`; mock-verbatim strings (G2) are not authored; strings the specs assert stay byte-identical unless the item changes them on purpose, and then every spec asserting the old literal is updated in the same change (grep `e2e/` and the unit tests); code and comments English, no emoji; each test red before its fix, run in the tools container (`podman compose --profile tools run --rm --user root tools pnpm exec vitest run ...`); the Porto Seguro goldens byte-identical (G4 prints what the fixture already stores).

**Never:** no `apps/api` route change, no seed, op family or `CONTRACT_VERSION` change (if a fix cannot land without one, stop and report it as an open question); `tokens.css`, `components.css`, the mocks, `docx.ts`, `layout.ts` and the goldens untouched; never touch `sprint-status.yaml`, `epics.md`, `source-deltas.md`, `services/ocr`, `infra/`; never copy from `docs/context/`; the implementer never runs Playwright (the orchestrator does); do not remove the G1 log line as "the fix"; no change to "Duplicar" on a section (Story 3.4 AC, UX-DR28: an explicit duplicate stays possible); the sheet-mode cancel toast (`photosKeptOnSheetText`, Story 11.11) keeps today's behavior (no undo there).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| G3 caption | import answered with a caption (typed, or the sheet's context caption) | "1 foto adicionada — legenda aplicada" / "N fotos adicionadas — legenda aplicada" (byte-identical) | none |
| G3 no caption | answer caption null or blank (`isUncaptioned`), e.g. Geral with an empty field | "1 foto adicionada — sem legenda" / "N fotos adicionadas — sem legenda"; the skipped tail ". N arquivo(s) …" unchanged | none |
| G4 pair | `secondary_kv` typed `380/220`, `380 / 220`, `13,8/7,97` | stored `{ raw: '380/220' | '13.8/7.97', unit: 'V', state: 'measured' }`; shows "380/220", "13,8/7,97"; echo "= 380/220 V" | none |
| G4 refused | `secondary_kv` typed `380/`, `/220`, `-380/220`, `380/220/127`, `abc` | "Número não reconhecido", nothing stored | as today |
| G4 other fields | `primary_kv` `13,8`; `primary_kv` `380/220`; `secondary_kv` `380` | 13.8 stored; pair refused there; `380` accepted | as today |
| G5 header | 96 sheets: 1 concluída, 1 não ensaiada, 94 open | header "1 de 96 fichas concluídas", "1 não ensaiada"; parecer hint "1 de 96 fichas concluídas, …, 1 não ensaiada"; Home card / Project row / tree counters / section 9 row / pre-issue row "2 de 96" (handled) | none |
| G10 excused | pending `vol_oleo` suggestion (any trust) on a transformer, TP or TC set EPÓXI or Á SECO | no suggestion row on Vol. óleo, not in the banner count, the sheet not held by it (Sumário rule); the row's status stays `pending` | none |
| G10 back | the same unit set ÓLEO (or nothing typed and no dry subtype) | the row is back, counted, holding the sheet | none |
| G2 held | palette tap on a section the template holds | no write; toast "{N Título} já está no template"; the row shows `.pi-meta` "No template" | none |
| G2 absent | palette tap on a section the template lacks | appended (or placed under "Adicionar abaixo") as today | none |
| G11 undo | gallery import, "Cancelar" or Esc on "De qual equipamento?" | toast "N foto(s) ficou/ficaram como Geral, sem legenda" with "Desfazer"; Desfazer writes `file/{id}/removed_at` for every photo of the batch in ONE batch, no confirm; gallery back to its count | a refused write toasts `writeErrorText` |
| G1 stale pointer | pointer names user X, cookie is user Y, server reachable | the engine starts only after the boot read settles, on Y's database; no console error; X's store untouched | offline / 5xx / 401 boot read settles too (engine starts as today) |

</intent-contract>

## Code Map

**G8 (P2) chip overflow**
- `apps/web/src/surfaces/ficha/checklist-section.tsx` L476-484 -- the NC chips (`div.chip-row` labelled `copy.ficha.checklist.chipsLabel(n)`, pt-br.ts L1317) inside `.row-expand`; the site checklist (`apps/web/src/surfaces/local/`) renders the same row.
- `apps/web/src/styles/components.css` L595-597 -- `.chip { white-space: nowrap; flex: none }` (untouched). DESIGN.md › Chip (L812) says the row wraps and never scrolls; it says nothing on long chip text, so the coordinator's rule applies.
- `apps/web/src/styles/app.css` -- add, with a comment naming G8, DESIGN.md › Chip and that the other chip rows keep the mock's `nowrap`: `.checklist-row .row-expand > .chip-row > .chip { max-width: 100%; min-width: 0; white-space: normal; overflow-wrap: anywhere; text-align: left; padding-block: var(--sp-2); }`.
- `e2e/learned-options.spec.ts` (helpers `chips(page, n)` L78, the learned-phrase path of 14.12-E2E-001 L101) -- new `@p1` test: a learned phrase of 66 characters (e.g. "Temperatura elevada do transformador de força indicada no display.") offered as a chip on a later sheet at 390 px: `document.documentElement.scrollWidth <= clientWidth`, the chip's box inside the row's box, the chip's text whole (`toHaveText`).

**G1 console error on an empty device**
- Cause (investigation, not provable from production data): the boot effect `apps/web/src/state/session.tsx` L145-153 attaches the cached pointer's database and sets `signed-in` before `readSession`; `SyncProvider` (`apps/web/src/state/sync.tsx` L259-292) starts the engine on that database; when the server answers another user (a profile whose pointer was left by another account, as the pass's persistent MCP profile was), `attachDatabase` (L117-131) closes it mid-pull and `queuePulledPairs` (`apps/web/src/sync/engine.ts` L349-364) logs `merge pairs of a pull failed`. Latent harm: until the close, that engine pushes X's outbox and applies Y's company pages into X's store under Y's cookie. A fresh store cannot reach the throw (`downloaded_at` null takes the early return).
- `apps/web/src/state/session.tsx` -- add `settled: boolean` to `SessionState` (L42-62): false at start; true once the boot read has settled in every branch (confirmed user attached, `'unreachable'`, `null` with or without a cached pointer) and after a successful form sign-in (L240-270); sign-out leaves it true. Doc comment: the sync engine runs only on a database the server has answered for (G1).
- `apps/web/src/state/sync.tsx` L259 -- the engine effect returns early while `db === null || !session.settled`; deps `[db, session.settled]`.
- Tests: `apps/web/src/state/session.test.tsx` (`readSession` mock L22-28, `Probe` L52) -- pointer X and a deferred `readSession` answering Y: `settled` false while X's database is attached; after the answer, the database is `databaseName(Y)` (`apps/web/src/db/schema.ts` L306), `recoveryNeeded` true, `settled` true; offline (`readSession` rejects) settles with X's database. `apps/web/src/state/sync.test.tsx` (session mock L25, engine mock L43) -- the engine is not created while `settled` is false and starts once true; give the existing mock `settled: true`; update every other test mock of `useSession` that renders `SyncProvider` the same way.
- `e2e/durability.spec.ts` 1.8-E2E-004 L235 -- add a `page.on('console')` collector of `error` messages (ignore `Failed to load resource`) and assert none from the recovery screen through "Baixar do servidor". New `@p1` 1.8-E2E-006 beside it: sign in as `seed.companies[1]` and let Home download; restore company 0's session cookie (saved earlier with `context.cookies()`), delete company 0's device database from the neutral document (`goToNeutralDocument`, `deleteDeviceDatabase`), keep company 1's pointer; `goto('/')`: company 0's recovery screen, zero console errors, company 1's outbox and entity count unchanged.

**G2 sections palette**
- Mock: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/42-template-composer.html` L186-194 -- every section the template holds keeps its row with `<span class="pi-meta">No template</span>` and a tap toasts "1 Objetivo já está no template" (no add). That is the mock's state for a held section; the coordinator's rule says follow it.
- `packages/domain/src/templates/compose.ts` L461 (`addSection`) -- add `heldSectionTypes(blocks: readonly TemplateBlock[]): ReadonlySet<SectionBlockType>` (the section types among the live composition blocks; read `sectionSlots`); export through the package index as its neighbours are. Test in `compose.test.ts`.
- `apps/web/src/surfaces/templates/block-palette.tsx` L21-42, L107-125 -- new prop `heldSections: ReadonlySet<SectionBlockType>`; a held row renders `<span className="pi-meta">{copy.composer.sectionHeldMeta}</span>` under the name and its press calls `onSectionHeld(type)` instead of `onAddSection`; accessible name stays "1 Objetivo …" (specs locate by substring).
- `apps/web/src/surfaces/templates/template-composer.tsx` L351-361 (`onAddSection`), L506 (palette props) -- pass `heldSections` from the rendered composition; a held tap shows `copy.composer.sectionHeldToast(sectionName(type))`; inside `edit`, a section held on the fresh state returns null (no write).
- `apps/web/src/copy/pt-br.ts` `composer` (~L396-401) -- `sectionHeldMeta: 'No template'` and `sectionHeldToast: (name: string) => \`${name} já está no template\``, comment: verbatim from `42-template-composer.html` L186 (G2).
- `apps/web/src/surfaces/templates/template-composer-palette.test.tsx` -- a held section shows "No template", a tap writes nothing and toasts; an absent one adds.
- `e2e/templates.spec.ts` 3.4-E2E-003 L464-506 -- the tap on "5 Recomendações gerais (NR-10)" now asserts the toast "5 Recomendações gerais (NR-10) já está no template", the tags unchanged and the row's "No template"; drop the trailing `'5'` from the later tag arrays (L465, L472, L476, L491, L506). P020-E2E-001 L397 (empty template) is unchanged and keeps the "lands at the end" proof.

**G3 import toast**
- `packages/domain/src/photos/gallery.ts` L277-280, L380-389 -- add `photosAddedUncaptionedText(n)` ("1 foto adicionada — sem legenda" / "N fotos adicionadas — sem legenda", authored); `photosImportedText(added, skipped, caption: string | null)` picks by `isUncaptioned(caption)` (L178). `photosAddedText` stays byte-identical. Tests `gallery.test.ts` L175, L235-244.
- `apps/web/src/surfaces/photos/capture-sheet.tsx` L98 (`usePhotoImport`: `target.caption`), L351 (`finish`: `answer.caption`) -- pass the caption state.
- Literals: every `legenda aplicada` assertion in `e2e/` (gallery.spec.ts L238, L303, L320, L388, L432, L602; sheet-photos.spec.ts L76, L384; dictation.spec.ts L101, L216; review-toasts-2026-10-08.spec.ts L372) is read against its import's caption; those whose caption is empty move to "sem legenda". A new clause in `gallery.spec.ts` (the Geral import with an empty caption) asserts "1 foto adicionada — sem legenda".

**G4 Tensão secundária**
- `packages/domain/src/parse/pt-br-number.ts` -- add `parseVoltagePairPtBr(input: string): string | null` (two non-negative pt-BR numbers around one `/`, spaces allowed; each side through `parseDecimalPtBr`; the dot-decimal sides joined by `/`); `formatDecimalGroupedPtBr` formats each side of a stored dot-decimal pair (`"13.8/7.97"` -> `"13,8/7,97"`; `"380/220"` unchanged; any other text unchanged as today). Tests `pt-br-number.test.ts`.
- `packages/domain/src/relatorio/ficha.ts` L267-275 -- `numberFieldValue(typed, unit, options?: { pair?: boolean })`: with `pair`, a typed pair is `{ raw, unit, state: 'measured' }`.
- `packages/domain/src/relatorio/cabine.ts` -- `acceptsVoltagePair(group: 'se' | 'env', key: string): boolean` (true for `se`/`secondary_kv` only; doc: G4, the FO.SERV-03 practice "380/220 V", the fixture `fixtures/porto-seguro/small/op-log.ts` L219). `cabineLineText` (L126) already prints through `lineMeasure` -> "380/220 V". Tests `cabine.test.ts` (line text with the pair).
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` L215-252 (`FieldProps`), L325-343 (`NumberField` `parseNumber`) -- new prop `acceptsPair?: boolean` passed to `numberFieldValue`.
- `apps/web/src/surfaces/ficha/cabine-block.tsx` L130-148 (`fieldOf`) -- `acceptsPair={acceptsVoltagePair(group, field.key)}`.
- Section 9 print reads `formatDecimalGroupedPtBr` (`packages/domain/src/print/section-9.ts` L521): the golden's "380/220" is unchanged; run the golden tests.
- `e2e/sheet-knows-12-3-12-4.spec.ts` 12.3-E2E-003 L347-356 -- type `380/220` for "Tensão secundária"; assert no "Número não reconhecido", the outbox's last `location/{id}/se/secondary_kv` value `{ raw: '380/220', unit: 'V', state: 'measured' }`, and after `page.goto(firstUrl)` the field reads `380/220`.

**G5 one count for "fichas concluídas"**
- `packages/domain/src/relatorio/progress.ts` L16-60, L186-195, L210-250 -- `Progress` gains `sheets_handled` (concluded + not tested, not held: today's number); `sheets_concluded` becomes concluded only (`sheetState === 'concluida'`, not held), as `parecerCounts` (parecer.ts L188-194). `progressCounterText`, `progressCounterState`, `fichasCountText`, `relatorioCounter` read `sheets_handled` (remaining work: Home card, Project row, tree counters, section 9 row, resume line, pre-issue row stay byte-identical); `fichasConcluidasText` reads `sheets_concluded`. `locationProgressIndex` sums both. Update the file's header comment ("Não ensaiada counts as concluded" now names the handled count).
- Readers to switch to `sheets_handled`: `pre-issue.ts` L382-383, `sumario.ts` L221, `resume.ts` L31, `tree.ts` L319, L333, L560-562, `home/cards.ts` L249 (through `relatorioCounter`), `apps/web/src/surfaces/project/project-surface.tsx` L175 (through `relatorioCounter`). Header only: `apps/web/src/surfaces/relatorio/sumario-surface.tsx` L439.
- `packages/domain/src/relatorio/count-target.ts` L36 -- `'concluded'` counts `state === 'concluida'` only.
- Tests: `progress.test.ts`, `count-target.test.ts`, and one unit test (in `parecer.test.ts` or `progress.test.ts`) building one snapshot with 1 concluded, 1 not tested, 1 open: `fichasConcluidasText(progress(s))` = "1 de 3 fichas concluídas", `parecerHintText(...)` contains "1 de 3 fichas concluídas" and "1 não ensaiada", `composeParecer(s).text` states 1 concluded and 1 not tested; `relatorioCounter` reads "2 de 3 fichas".
- `e2e/ficha.spec.ts` E5-Q18e L1500 -- after marking the Para-raio not tested: header `0 de N fichas concluídas` (N read from the header before), "1 não ensaiada"; then `/relatorio/{id}/setup?etapa=6`: the hint contains `0 de N fichas concluídas` and "1 não ensaiada"; tap "Apto com restrições", the summary's `.generated-text` states the not-tested sheet (words from `composeParecer`). `e2e/concluded-count.spec.ts` (no not-tested sheet) stays as is: run it.

**G7 TAG re-suggestion (no product defect)**
- `apps/web/src/surfaces/relatorio/move-block-dialog.tsx` L36-37, L64-72 -- the question and the unchecked "Renomear para SEC-C09" render inside the dialog once a target is picked; the pass clicked "Mover" without reading the dialog and then looked for a button after the move. `moveTagSuggestion` (`packages/domain/src/relatorio/move.ts` L57-70) gives SEC-C09 for SEC-C01 to Coluna 9 (SEC = `chave_seccionadora`, Coluna 9 empty in the standard template).
- `packages/domain/src/relatorio/move.test.ts` (L50 SEC-C05 -> Coluna 9) -- add SEC-C01 (Coluna 1) -> Coluna 9 = SEC-C09 (green on the current code: the pin).
- Evidence run: `e2e/move-block.spec.ts` 11.2-E2E-001 (L123, Sumário path: question, checkbox, rename) and 11.2-E2E-002 (L179, "Desfazer" reverts TAG and location).

**G9 merge rows (no product defect)**
- The pass's device 1 clicked `getByRole('radio', { name: 'Conforme' }).nth(1)` without `exact`, which matched item 1's "Não conforme": the two devices wrote different items, sequentially, so no merge happened; its later reads were full reloads, which clear the engine's merges by design (Story 10.1 AC "a reload clears it", engine.ts L89-94). The code path lists the real pair: server `superseded` -> `queueMergePairs` (engine.ts ~L298-315) -> `resolveMerges` -> `resolveMergePairs` (`apps/web/src/db/sync-store.ts` L381) -> `mergeInfoOf` (`nc_over_c` keep, `merge/policy.ts` ~L176-208); rows render with no hiding condition (`apps/web/src/surfaces/sync/sync-sections.tsx` ~L290).
- `apps/web/src/sync/engine.test.ts` (`harness` ~L237, `FakeServer`, the injected superseded pair ~L962 on a nameplate) -- add the checklist case: this device's C on `sheet/{b}/checklist/{item}/result` superseded by another device's NC; after the cycle `status().merges` holds one entry with rule `nc_over_c` and `mergeInfoText` reads "… item N NC de … mesclado" (green on the current code: the pin).
- Evidence run: `e2e/merge.spec.ts` 10.1-E2E-001 (L134, the row "SEC-C12: item 10 NC de Eduardo (com foto) mesclado" on both tablets).

**G10 suggestion on an excused field**
- `packages/domain/src/relatorio/dry-insulation.ts` L101-106 -- `isNameplateFieldExcused(block, fieldKey)` (fx17r) is the one predicate.
- `packages/domain/src/relatorio/suggestion-group.ts` L35-45 `nameplateSuggestions` -- skip a field `isNameplateFieldExcused(block, field.key)` (the rows, `suggestionGroupCounts` -> the banner "Sugestões prontas — N campos para confirmar", `confirmAllCandidates`); widen the block `Pick` to what the predicate needs.
- `packages/domain/src/relatorio/suggestion-rows.ts` L89-102 `livePendingSuggestions` -- drop a pending `sheet/{b}/nameplate/{key}` row whose live block excuses `key` (the Sumário's held rule, `suggestions_pending`, pre-issue, `ficha.ts` L47, the device store's count `apps/web/src/db/suggestion-store.ts` L245); widen `blocks` to full rows (every caller passes `BlockRow`). Watch import cycles (`dry-insulation.ts` must not import `suggestion-rows.ts`).
- Tests `suggestions.test.ts` / `oil-rule.test.ts` builders: excused hidden and not counted; ÓLEO back; status untouched (no discard op).
- `e2e/oil-dry.spec.ts` (helpers `field` L47) with `pushSuggestion` (as `e2e/suggestions.spec.ts` L42-60 `suggest`) -- new `@p0` test: a pending `verify` Vol. óleo suggestion on a transformer: shown with the banner; pick Á SECO -> no `.suggestion-field` under `[data-field-key="vol_oleo"]`, no banner (or its count one lower); pick ÓLEO -> back; the suggestion row's stored status stays `pending`.

**G11 undo on the cancel toast**
- `apps/web/src/surfaces/photos/photo-ops.ts` L134-137 (`removePhoto`) -- add `removePhotos(db, author, relatorioId, fileIds)`: the same `file/{id}/removed_at` put per photo, ONE `commitBatch`; `removePhoto` delegates. No new op.
- `apps/web/src/surfaces/photos/capture-sheet.tsx` L324-355 (`finish`, gallery mode, `target === null` with a session) -- the toast `photosKeptGeneralText` gains `action: { label: copy.viewer.undo, onPress: removePhotos(...) }` (as `gallery-surface.tsx` L211-224 does for one photo; failures through `toastPhotoWriteFailure`/`writeErrorText`). The no-session branch and the sheet mode stay without action.
- Tests: `apps/web/src/surfaces/photos/photo-ops.test.ts` -- `removePhotos` writes N `removed_at` puts with one `batch_id`.
- `e2e/gallery.spec.ts` 6.4-E2E-008 L611 -- after the cancel assertions: the toast's "Desfazer" -> `galleryItems` 0 (the count before the import), outbox holds one `removed_at` put per photo with one `batch_id`. Every other spec asserting `ficou como Geral|ficaram como Geral` (photo-numbers.spec.ts L66, sheet-photos.spec.ts L199, L409, gallery.spec.ts L621, L642) is read for a later toast it awaits (an action toast never expires: `apps/web/src/state/toast.tsx` L25-33) and run.

**Ledger and log**
- `_bmad-output/implementation-artifacts/deferred-work.md` L2454-2502 (the ten rows after G6) -- strike each `state:` text with `~~…~~` and write `done (2026-10-29, fix batch fxpw: <evidence>)` beside it; never delete. `docs/kbs/log.md` -- one dated line.

## Tasks & Acceptance

**Execution (child 1, kernel; child 2, web and e2e; each test red before its fix unless marked pin):**
- child 1: `packages/domain/src/photos/gallery.ts` + test (G3); `parse/pt-br-number.ts`, `relatorio/ficha.ts`, `relatorio/cabine.ts` + tests (G4); `relatorio/progress.ts`, `count-target.ts`, the readers listed + tests, the one-snapshot agreement test (G5); `suggestion-group.ts`, `suggestion-rows.ts` + tests (G10); `templates/compose.ts` `heldSectionTypes` + test (G2 kernel); `move.test.ts` SEC-C01 pin (G7).
- child 2: `session.tsx`, `sync.tsx` + tests (G1); `block-palette.tsx`, `template-composer.tsx`, `pt-br.ts`, palette test (G2); `capture-sheet.tsx` callers (G3); `ficha-fields.tsx`, `cabine-block.tsx` (G4); `app.css` (G8); `engine.test.ts` pin (G9); `photo-ops.ts`, `capture-sheet.tsx`, test (G11); the e2e edits listed in the Code Map (G1, G2, G3 literals, G4, G5, G8, G10, G11), run by the orchestrator; the ledger rows and the KB line.

**Acceptance Criteria:**
- Given a 66-character learned NC phrase, when its sheet opens at 390 px, then the page does not scroll sideways and the chip wraps inside the row; the status, "Hoje" and recent chip rows keep `nowrap`.
- Given a signed-in profile whose cached pointer names another user, when the app boots online, then no sync cycle runs before the server answers, the engine runs on the confirmed user's database, the console shows no error and the other user's store is unchanged; given an offline boot, then the engine starts on the cached database as today.
- Given a template holding "1 Objetivo", when "1 Objetivo" is tapped in "Seções", then nothing is written and the toast reads "1 Objetivo já está no template"; given a template without section 8, when "8 Pontos de atenção" is tapped, then it is added as today.
- Given a gallery import answered "Geral" with an empty caption, when it lands, then the toast reads "1 foto adicionada — sem legenda"; with a caption, "… — legenda aplicada" as today.
- Given Características da SE, when `380/220` is typed in "Tensão secundária", then it is stored as `{ raw: '380/220', unit: 'V' }`, reads back "380/220", the cabine line reads "380/220 V" and section 9 prints as the golden does; `13,8` on "Tensão primária" and `380` alone are unchanged.
- Given 1 concluded, 1 not tested and 94 open sheets, when the Sumário header and the Etapa 6 hint and summary render, then each states 1 concluded and 1 not tested; the Home card and the tree read "2 de 96".
- Given SEC-C01 moved to an empty Coluna 9 from the Sumário, when the target is picked, then the dialog asks "Sugerir TAG para Coluna 9?" with "Renomear para SEC-C09" unchecked (pinned, unchanged code).
- Given this device's C and another device's NC on one checklist item, when the cycle pulls, then Sync status lists one "… NC de … mesclado" row (pinned, unchanged code).
- Given a pending Vol. óleo suggestion, when the unit is set EPÓXI or Á SECO, then the row and its banner count go, the sheet is not held, and ÓLEO brings them back with the suggestion still pending.
- Given a gallery import cancelled on "De qual equipamento?", when "Desfazer" is pressed on the toast, then every photo of the batch is removed in one batch and the gallery count is back where it was.

## Spec Change Log

## Review Triage Log

## Design Notes

G5 split, so no reader changes by accident: `sheets_handled` is today's `sheets_concluded` value under a new name for the readers that measure remaining work; `sheets_concluded` takes the parecer's meaning, read only by the header and its count target. G7 and G9 change no product code: the coordinator's context asked to "find why and fix"; the why is the pass's scripts, so the named tests pin the behavior and the PR lists both for a production re-check with exact locators. G4's pair formatting lives in `formatDecimalGroupedPtBr` so the field, the echo, the cabine line and section 9 agree; integer sides below 1000 (the golden's "380/220") print unchanged.

## Verification

**Commands (tools container, `podman compose --profile tools run --rm --user root tools ...`; the implementer runs unit tests only):**
- `pnpm exec vitest run <the touched test files>` -- green; each new case shown red on the unfixed source first (pins G7, G9 green on both).
- `pnpm lint`, `pnpm static` -- green.
- `grep -rn "legenda aplicada\|ficou como Geral\|ficaram como Geral\|fichas concluídas" e2e` -- every hit read against this change.
