# Epic 9: integrated review and human-style QA

Date: 2026-09-29. Base: `origin/main` at `04fd9e4` (epic diff `a2cd053..04fd9e4`, PRs #56-#61). Worktree compose project `fasor-e9qa` (port base 47), `fake` LLM/OCR providers, `VITE_SPEECH_ENGINE=fake` (the `build:e2e` bundle). Every gate ran under `flock /tmp/fasor-verify.lock`, one at a time. No product code was changed.

Method: gates on clean main, then two read-only review subagents over the diff (adversarial and edge cases; intent alignment and ownership), then a human-style Playwright pass. The Playwright MCP server failed to connect, so the pass used a throwaway spec suite (untracked `qa-e9/`, 15 tests) run in the `tools` container: taps, keyboard typing, `context.setOffline`, reload and "Sincronizar agora", at 390, 768, 1280 and 1906 px, light and dark. Every high or medium claim below was checked in the code or in the browser before it was recorded.

## Gate results

| Stage | Time | Result | Failures and flakes (evidence) |
|---|---|---|---|
| verify: lint | 36.2 s | pass | |
| verify: static | 55.6 s | pass | |
| verify: test:api | 301.5 s | pass | |
| verify: test:unit | 192.9 s | pass | 226 files, 2500 tests (web and tooling); 46 files, 299 tests (kernel) |
| verify: test:e2e (`@p0`) | 1111.0 s | **fail** | 146 tests: 145 passed, 1 failed. `export.spec.ts:272` E4-E2E-001 (Escape left "Gerar relatório" open). Re-run alone with `--repeat-each=3`: 3/3 passed in 1.3 min, so it is a **load flake**. |
| verify total | 1605.5 s (26.8 min) | fail | This is over the 15-minute budget in AGENTS.md (E9-Q6). |
| test:e2e:full | 2109 s wall (parallel 1293 s, serial 810 s) | **fail** | 260 tests: 253 passed, 3 failed, 4 skipped. `dictation.spec.ts:241` 9.4-E2E-007 also failed 1 of 3 runs alone, so it is a **test race** (E9-Q5). `journey-taps.spec.ts:144` 12.1-E2E-009 failed on "humanTap: the target's centre hits div.nameplate-grid" and passed 3/3 alone: **load flake**. `suggestions.spec.ts:136` 8.1-E2E-002 found 8 `suggestion/` outbox ops where 7 were expected and passed 3/3 alone: a **load flake** whose extra op is unexplained (E9-Q13). |
| test:e2e:matrix | 764 s wall (e2e 493.5 s) | pass | 66 tests: 58 passed, 8 skipped, 0 flaky |
| sidecar: `docker compose --profile ocr build ocr` + `pytest` | 377 s (pytest 245.6 s) | pass | 26 passed, 1 warning. Plate OCR matched 43/43. |
| Human-style QA suite (`qa-e9/`) | about 4.4 min per full run | pass | 15/15 in the last run. The first run's 8 failures came from the script itself (short sync waits, a collapsed tree), not the product. |

## Findings

| ID | Severity | Finding | Evidence | Proposed fix | Owner |
|---|---|---|---|---|---|
| E9-Q1 | medium | "Confirmar todos" writes a display value the screen does not show. A dictated reading and a display suggestion sit on the same empty cell. The cell shows the dictated 150 GΩ as Sugerido, but "Confirmar todos (1)" writes the display's 147 GΩ with its `source_suggestion_id`. This settles known-open (d) as a defect. | Screenshot `e9-94-probe1-dictated-vs-display.png`. `ensaios-section.tsx:217` draws the dictated reading over the display fill. `measurementConfirmAllCandidates` (`packages/domain/src/relatorio/suggestions.ts:720`) still counts the hidden fill. | Pass the dictated cell address to the kernel, so confirm-all excludes a cell that shows a dictated reading. Show the display value as the "Visor … Conferir" line under it. Add an e2e test. | fix batch |
| E9-Q2 | medium | A client `file/{id}/reading_kind` put always resets `reading_status` to `queued`, and the push route then sends the job. This happens even while the photo is `running` and even when the put names the same kind. It bypasses the reread route's 409 (E78-Q5), and any of the five kinds is accepted. This settles known-open (b) as a defect. The scope stays inside the caller's own company, since every lookup is scoped by company. | The reset is in `packages/domain/src/ops/apply.ts:300-304`. `clientReadingPutIsValid` in `apps/api/src/sync/apply.ts:97-100` checks only membership and object shape. The send is `apps/api/src/sync/routes.ts:139-149` → `sendRetargetedReading`. pg-boss `stately` allows one job active plus one queued, so a second provider run is paid. | In the kernel's validation, refuse or no-op a `reading_kind` put while the photo is `running`, or when the kind is unchanged and the reading has not failed. Limit the client re-target to what 9.2 needs (`panel` → `plate`). Add an api integration test through the sync route. | fix batch |
| E9-Q3 | medium | Undo right after a photo-backed create (9.2) removes the block, but `invertBatch` puts the photo back to `reading_kind: panel`, and the kernel re-queues it. After a sync the panel job runs again, a paid reading. A second panel suggestion is left pending with no UI to resolve it, and no dialog reopens. This settles known-open (c) as a defect; the undo path was untested. | QA probe 2, screenshot `e9-92-undo-gallery.png`: the photo is tile 1, "sem legenda", with no block. Reviewer trace: the inverse ops run in reverse and restore `reading_kind`, and `applyOp` queues on any `reading_kind` put. | The inverse of the re-target should not queue a new reading. Restore `reading_status` with the kind, or have undo discard the panel suggestion and leave the photo as a plain photo. Add the undo e2e test. | fix batch |
| E9-Q4 | medium | At 390 px a suggested measurement cell ("Sugerido" plus "Confirmar") is wider than its table. `div.ficha-mt` has scrollWidth 418 and clientWidth 358. Once the cell has focus, the table block scrolls sideways and cuts off the title and "Ler visor". The page itself does not overflow, so 9.1-E2E-002 (page overflow, queued cell only) does not catch it. The Guard column also breaks "Massa" as "Mass a" at 390; that part is older than this epic. | Screenshot `e9-94-enter-dictated-cell-390.png`. The queued cell fits (`e9-91-queued-390.png`). Dictated and display readings both render through `ReadingCell` (`read-display.tsx:261`). | Fit the suggested cell at 390 px as `60-ficha.html` does (compact confirm, or confirm on a second line). Assert `.ficha-mt` scrollWidth <= clientWidth at 390 px for a suggested cell and for a "Conferir" cell. | fix batch |
| E9-Q5 | medium | 9.4-E2E-007 is flaky: it failed in e2e:full and in 1 of 3 runs alone. It reloads right after "Usar", before the observation's IndexedDB write has landed, and the value comes back empty. The same kind of millisecond window is known-open (h). | `e2e/dictation.spec.ts:256-260`. "Usar" → `typed.set` → `committer.immediate` (`ficha-fields.tsx:99-102`) is an async Dexie write. | Poll `storedBlock(...)` for the value before `page.reload()`, as the 4.8-E2E-001 fix does. | fix batch |
| E9-Q6 | medium | `pnpm verify` took 26.8 min, against the 15-minute merge-gate budget in AGENTS.md. The e2e stage alone took 18.5 min (parallel group 13.7 min at `PARALLEL_WORKERS=1`). | The verify summary in the gate table above. | Decide whether to change the budget, raise the worker count after a validation, or move more `@p0` tests to `@p1`. | Matheus |
| E9-Q7 | low | A failed frame grab in the middle of a "Ler visor" burst lowers the visible count but still moves on to the next row. The row whose grab failed gets no photo in that burst. This settles known-open (e) as a defect. | `apps/web/src/surfaces/ficha/camera-view.tsx:185-188` lowers `burst` but not `taken.current`, and the next shot uses `shotTarget(taken.current)` (line 111). | On failure, also lower `taken.current`, so the next shot retries the same row. | fix batch |
| E9-Q8 | low | Enter on a dictated suggested cell does not confirm it; the cell stays Sugerido. Enter does confirm a display suggestion. | QA pass, `e9-94-enter-dictated-cell-390.png` | Make Enter confirm in the dictated `ReadingCell` path too. | fix batch |
| E9-Q9 | low | The dictated table state is not cleared when its cell is filled some other way ("Confirmar todos", a pull). If the cell is emptied later, the old dictated suggestion comes back. | `apps/web/src/surfaces/ficha/sheet-observation-dictation.tsx:51` | Clear `dictated` when its cell stops being empty. | fix batch |
| E9-Q10 | low | Ownership (AD-1) and panel dialog. The web decides "waiting" from `reading_status` and filters pending panel suggestions itself. Online, a panel reading that fails or finds nothing shows no waiting line and no reason, only "Toque no tipo". `measurement-field.tsx:266` joins a value and its unit in the web, although the kernel has `suggestionValueText`. `gallery-surface.tsx:278` holds the rule for which tiles offer "Pessoas na foto". | `panel-capture.tsx:148,187`; `measurement-field.tsx:266`; `gallery-surface.tsx:278` | Move these three derivations into `packages/domain`. Show the failure reason in the panel dialog. | fix batch |
| E9-Q11 | low | `.listening-word` is `aria-live`, but its text never changes (CSS only shows and hides it), so "Ouvindo…" is never announced. `aria-pressed` does carry the state. | `apps/web/src/speech/dictation.tsx:142` | Render the word only while listening, or announce it through `api.announce`. | fix batch |
| E9-Q12 | low | `panel.typeGroup` in `copy/pt-br.ts` is never used. The mock's toast "Tipo trocado … TAG passa a …" is not built. The chip row is a valid `role="group"` where the mock says `radiogroup`. | Review (b) | Remove the dead string or build the toast. | fix batch |
| E9-Q13 | low | Three tests fail under load and pass alone: E4-E2E-001 (Escape), 12.1-E2E-009 (tap covered by `nameplate-grid` during layout), 8.1-E2E-002 (8 suggestion ops against 7, 3/3 alone). The extra op in 8.1-E2E-002 has no explanation yet. It could be a real duplicate confirm or discard written under a slow render. | Gate table | Log the outbox rows when 8.1-E2E-002 fails, and check whether the Verificar field's typed-discard fires under load. Wait for layout before the 12.1 tap and for focus before the Escape. | fix batch |
| E9-Q14 | low (older than Epic 9) | The Novo relatório dialog shows "Continuar: falta o cliente" twice: the Local field's reason and the button's reason. At 1906 px the button's reason sits to the right of the buttons. | Screenshot `e9-home-1906-dark-dialog.png`; `apps/web/src/surfaces/home/new-project-dialog.tsx:195,202` | Keep one reason line. | fix batch |
| E9-Q15 | question | An NC photo marked "Pessoas na foto" is still sent to the vision provider for its `nc_obs` draft: `ncObsSkipReason` ignores `people_in_photo`. NFR-11 names only captioning. | `packages/domain/src/reading/prose.ts:113` | Decide whether the people mark blocks every prose kind. | Matheus |
| E9-Q16 | question | Known-open (a) is an accepted narrowing and reproduces. A photo in an import batch left open while online reaches the caption provider before the mark lands. The device then discards that suggestion, and nothing is shown. NFR-11 says "never sent". | QA probe 3: `reading_status` done, suggestion created and discarded. `capture-sheet.tsx:243` commits the batch with the caption queued; `deferred-work.md:1128` | This must close before a cloud LLM is wired (Epic 11). Confirm that it stays deferred until then. | Matheus |
| E9-Q17 | question | Known-open (f) is copy only and documented (`deferred-work.md:1140`). The gallery tile says "Confirmar" and the composer says "Usar". | `e9-93-gallery-768.png` | Choose one word. | Matheus |
| E9-Q18 | question | The `webspeech` engine sends audio to the browser vendor, with no consent text, and it is the compose default. The megôhmetro range source (E8-A3) is still open. Display values beyond the start row's group walk the following capture cells, across rows and into the next table (`display.ts:271`), which matches "next cells in reading order". Print-only 30 s and 10 min values are dropped. | Story 9.1 and 9.4 narrowings | Confirm each of these points or change it. | Matheus |

Known-open verdicts:

| Known-open | Verdict |
|---|---|
| (a) The people mark lands after an import-batch photo already reached the provider | Accepted narrowing (to Epic 11), reproduced. See E9-Q16. |
| (b) Any reading kind on a company's own photos | Defect, E9-Q2. |
| (c) Undo after a photo-backed create | Defect, E9-Q3. |
| (d) A dictated reading and a display suggestion on the same empty cell | Defect, E9-Q1. There is no silent overwrite of a confirmed dictated value: once it is confirmed, the display becomes the "Visor … Conferir" line, and confirm-all skips it. |
| (e) A failed frame grab in the middle of a burst | Defect, low, E9-Q7. |
| (f) Tile "Confirmar" against composer "Usar" | Copy question, E9-Q17. |
| (g) The preview press retries a 409 | Not a defect. `use-preview.ts:83-93` stops after `MAX_ROUNDS` (10), `busy` blocks a second press, and a 409 enqueues nothing. It does keep polling for about 20 s after unmount (harmless). |
| (h) A reload within milliseconds of "Voltar" loses the last setup field | Not reproduced on the setup page; `use-field-commit.ts` did not change. The same kind of millisecond window after an immediate commit shows in the test race E9-Q5. |

Review (b) claimed that "Ler visor · 3" exists only in CSS `::after`. In the browser, the opener's visible text and its accessible name both read "Ler visor · 3", so that claim was not reproduced.

## AC coverage

| Story / AC | Method | Result |
|---|---|---|
| 9.1 "Ler visor" on every Measurement table and on the thermo-hygrometer pair; camera; `reading_kind: display` + target | Browser: 3 openers plus the thermo pair; outbox rows checked | PASS |
| 9.1 burst shows "Ler visor · 3" until "Concluir" | Browser, offline burst of 3 at 390 px | PASS |
| 9.1 offline "Foto guardada — leitura quando houver sinal", and the cell stays typeable | Browser at 390, 768 and 1280 px, typed by keyboard (`e9-91-queued-390.png`) | PASS |
| 9.1 display path fills in reading order, unit from the display or the previous row, crop, digit coverage | Browser, real job under `fake`: single-value rows, thermo 23,4 °C (Verificar) and 58 %. Three stored values: kernel `display.test.ts`, `job-display.integration`, sidecar `test_display.py` | PARTIAL in the browser (the `fake` fixtures cannot produce a three-value display); unit-covered |
| 9.1 typed value: equal auto-confirms with the crop, different shows "Visor: 147 GΩ · digitado 150 GΩ — Conferir", one-tap pick, never overwritten | Browser at 1280 (`e9-91-conferir-1280.png`) | PASS |
| 9.1 SM-3: at most 20 taps and 15 keystrokes with signal | `tap-budget-signal.spec.ts` in the browser run | PASS (20 taps, 9 keystrokes) |
| 9.2 "Fotografar equipamento" tile; online `panel` job; "Criar SEC-C09 · Chave seccionadora · Coluna 9?"; chip correction; one batch; photo becomes the plate, `plate` queued | Browser at 390, real job, chips by keyboard (`e9-92-panel-390.png`) | PASS |
| 9.2 offline: created from the type list, type + column → TAG, photo becomes the plate | Browser at 768 through the app camera, chips reached by Tab | PASS (DJ-C01) |
| 9.2 undo after a photo-backed create | Browser probe | FAIL, E9-Q3 |
| 9.3 caption kind only with no `block_id` and an empty caption; nothing returned means "Sem legenda" | Browser plus `job-prose.integration` | PASS |
| 9.3 "Pessoas na foto" on the tile and in the import batch, never sent | Browser | PARTIAL: the chips work; a photo marked late in an open online batch is still sent (E9-Q16, accepted narrowing) |
| 9.3 tile `meta` amber "Sugerido"; composer "Usar"; "N legendas sugeridas — Confirmar todas" as one batch; `preIssue` count | Browser at 768 (`e9-93-gallery-768.png`); Sumário row 7 "3 legendas sugeridas"; the Export dialog rolls info rows into "16 avisos" (`e9-93-export-dialog-no-captions-row.png`) | PASS |
| 9.4 mic 48 px, round, outlined, "Ouvindo…"; result as a Suggestion; batch caption and composer first | Browser at 390 (`e9-94-listening-390.png`), every mic measured 48x48 | PASS (screen-reader announcement: E9-Q11) |
| 9.4 table utterance parsed by the kernel ("Fase B, 200 mega" → 200 MΩ); unparsed speech goes to Observações | Browser plus `utterance.test.ts` | PASS (interaction with a display suggestion: E9-Q1; Enter: E9-Q8) |
| 9.4 no engine or offline: mic hidden, chips and keyboard stay | Browser offline plus `disableSpeech` | PASS |
| 9.5 NC row photo gets `nc_obs` + `{block_id, item_key}`; one sentence above Observation with "Usar"; typing discards it; never proposes NC rows | Browser at 390, real job (`e9-95-nc-draft-390.png`) | PASS |
| Home layout fix: Home and /cadastros at 390, 768, 1280 and 1906 px, light and dark, one dialog | Browser (`e9-home-1906-dark-dialog.png`, `e9-cadastros-390-dark.png`) | PASS: no overflow, avatar 8 px from the right edge, column and dialog centered from 1280 px (older duplicate reason text: E9-Q14) |
| Incremental snapshot: typing into a sheet updates the stepper and the Sumário without a reload | Browser | PASS: the stepper goes from 9 to 8 missing, the header counter follows, and the Sumário row goes from "Vazia" to "Em preenchimento" |

## What went well

- The per-kind handler registry (`apps/api/src/jobs/reading/kinds/`) let three batches add five reading kinds without touching each other's code. Plate behavior was kept, and the contract went from 6 to 8 with dated notes.
- The confirm contract held on every surface tested. Prose arrives only as `suggested`, no verdict and no NC row is ever proposed, and a typed value is never overwritten silently.
- Derived copy ("N legendas sugeridas", "Visor … digitado … Conferir", "Criar SEC-C09 · …", the utterance parse) lives in the kernel. There is no emoji, no "laudo" and no user-visible codename.
- Each pipeline story has an `@p1` e2e from the UI through the real job under `fake`, and the SM-3 walk met its budget (20 taps, 9 keystrokes).
- The sidecar gate and the matrix were fully green. The narrowings were dated in `epics.md`, which made the review's defect/narrowing split quick.

## What went badly

- The merge gate now takes 26.8 min, almost twice the 15-minute budget, and the full suite takes 35 min. Four tests fail under load (three load flakes and one test race). Every one of them passed alone, which says the gate is load-sensitive, not that the product broke.
- Cross-story interactions went untested: dictation and display on the same cell (E9-Q1), undo of the 9.2 create (E9-Q3), and a client re-target racing a running job (E9-Q2). Each story was green alone; the defects sit where two stories meet.
- The 390 px checks tested page overflow, but not the table's own scroll container with a suggested cell in it (E9-Q4).
- Several product questions are still open for Matheus at the end of the epic: the vendor speech consent, the range source (E8-A3), and the people mark for NC drafts.

## Screenshots

In `_bmad-output/implementation-artifacts/reviews/epic-9-qa/`: `e9-91-queued-390.png`, `e9-91-conferir-1280.png`, `e9-92-panel-390.png`, `e9-92-undo-gallery.png`, `e9-93-gallery-768.png`, `e9-93-export-dialog-no-captions-row.png`, `e9-94-listening-390.png`, `e9-94-probe1-dictated-vs-display.png`, `e9-94-enter-dictated-cell-390.png`, `e9-95-nc-draft-390.png`, `e9-home-1906-dark-dialog.png`, `e9-cadastros-390-dark.png`.
