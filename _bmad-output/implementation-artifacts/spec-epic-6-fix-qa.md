---
title: 'Epic 6 fixes: integrated review findings (E6-Q1..Q14 except Q7, Q9)'
type: 'bugfix'
created: '2026-09-25'
status: 'done'
baseline_revision: 'b7ac7b512d5252985bc16af2568b3c4ace22a8bf'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-6-review-qa.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
# batched: twelve review findings and one carry-over point on the same photo, point and sheet surfaces, fixed in one PR (shared surface, token economy).
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 6 integrated review (`reviews/epic-6-review-qa.md`, findings table; read the full row of each ID) found a `@p1` tap regression at 768 px, typed point text lost on Esc, a caption composer unusable on a phone, a flat 95-row equipment picker, context captions that cannot tell two seccionadoras apart, two `@p0` specs that fail alone, and seven smaller defects. A stale conclusion "Confirmar" also writes nothing and says nothing (carry-over F, open question 5).

**Approach:** Fix each finding as its row proposes, read with the coordinator decisions below; derived text in `packages/domain`; one test per finding at the outermost surface it names.

Coordinator decisions (binding, 2026-09-25):
- **Q1:** make 12.1-E2E-009 and 12.3-E2E-004 green at 768 (touch emulation, as the specs run). Find why a mouse passes and the spec fails (what #41 `de0520d` changed around the rail, `.ficha-body`, the sticky bar camera/"Adicionar fotos" slots, and what #42/#43 changed after) and fix the product layout, not the tap helper.
- **Q2:** the point editor autosaves per field like every other surface (debounced commit through `useFieldCommit`, flush on blur/close), FR-61 drafts included (`useDraftSource`); no text is lost on Esc, Cancelar, a closed dialog or a reload mid-edit.
- **Q3:** composer on a 390 px phone: the photo preview (`.capture-preview` with `.number-badge`, `.capture-meta`, compact on phone) on top, and a `sticky-action-bar` holding "Salvar legenda" always in view (`71-legenda.html` lines 60-75, 166-170).
- **Q4:** "De qual equipamento?" as in `70-fotos.html` 404-425: a short list of the current equipment (the `last_sheet:{relatorio_id}` pref) and its nearby equipment (same column, then same cabine) first, then "Outro equipamento" opening the full list grouped by cabine › column in tree order, then "Geral (sem equipamento)" reachable without scrolling past the whole list. With no current sheet, the full grouped list shows directly. Ordering and grouping computed in the kernel.
- **Q5:** the context caption carries the TAG and the column as the mock draws them: "Detalhe da limpeza e reaperto realizada na chave seccionadora SEC-C01 da Coluna 1 do 1° Subsolo"; a block directly in the cabine: "...na chave seccionadora SEC-ENEL do Cubículo Enel". No trailing period change; wording stays in `packages/domain/src/photos/caption.ts`; the composer's Equipamento/Local prefill follows the same parts. Porto Seguro golden only if the fixture changes (it should not).
- **Q6:** find the real race behind 6.1-E2E-002 (focus back on the NC row's "Adicionar foto" after "Concluir fotos") and 5.8-E2E-002 (focus on "Observações da ficha"); fix the app (e.g. restore focus after the tile rows commit, via the `focus-restore.ts` watch-frames helper), not only the test. Each passes `--repeat-each 5` alone.
- **Q8:** a gallery import commits every picked image at once (as "Geral", caption null) before "De qual equipamento?"; "Adicionar N fotos" writes `block_id` and `caption` puts on those rows in one batch; "Cancelar" at that step leaves them saved as "Geral" and says so in the toast.
- **Q10:** the tile button gets `aria-describedby` naming its stamp, caption and upload pill ids.
- **Q11:** the Remover confirm names the point(s) that cite the photo (kernel text); an NC row that already has a live point shows "Ponto de atenção n" (kernel text, the point's section-8 position) beside its actions; "Criar ponto de atenção" stays available.
- **Q12:** kernel `galleryCounts(tiles)` → `{pending, error, uncaptioned}` used by the gallery header, and one kernel sentence for "added, skipped" replacing the web-joined ". ".
- **Q13:** "ou arraste para cá" hidden below `breakpoint-tablet` (768 px) and on `(pointer: coarse)`.
- **Q14:** after a photo commit (capture or import) while online, the sync engine runs a cycle (coalesced with any running one).
- **Carry-over:** a stale conclusion "Confirmar" (basis moved) writes nothing and announces "O texto mudou; confira e confirme de novo" through the sheet's polite live region/toast (authored copy, `// authored:` in `copy/pt-br.ts`, listed for Bruno).

## Boundaries & Constraints

**Always:** AD-1/AD-13 ownership (counts, orders, derived texts in `packages/domain`); pt-BR strings in their AGENTS.md home; `tokens.css`/`components.css` byte-identical, CSS fixes in `app.css` or the surface css with a comment naming the mock rule, `.frame-*` translated per AGENTS.md; React Aria behavior; 48/56 px targets; tap budget (`e2e/tap-budget.spec.ts`) and lost-tap specs green; every changed behavior tested (`@p0` Playwright for Q2, Q3, Q4, Q8 main paths; `@p1` or unit for the rest).

**Never:** Edit `epics.md` or `sprint-status.yaml`; touch E6-Q9 (open for Matheus) or E6-Q7 (phase 2); change a test's assertion to hide a product defect; add an op family (the existing `point`/`file` field puts suffice); edit seed v1/v2/v3 in place; decide an open product question (keep current behavior, list it).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| Q2 new point, Esc | NC row "Criar ponto de atenção", type text, Esc | point created with the text (create op on first non-empty commit), reopening shows it | empty text and action: no point created |
| Q2 reload mid-edit | text typed, reload before debounce | "Rascunho encontrado — Recuperar" offers it; Recuperar commits it | — |
| Q2 edit existing | change action, Tab away | one `point/{id}/action` put | point removed elsewhere: toast `t.gone`, nothing written |
| Q5 column | SEC-C01 at "1° Subsolo › Coluna 1" | "Detalhe da chave seccionadora SEC-C01 da Coluna 1 do 1° Subsolo" | blank TAG: TAG left out |
| Q8 cancel | 3 images picked, Cancelar at the step | 3 photo rows exist as "Geral", toast says so | non-images skipped as today |
| Q8 add | pick SEC-C01, "Adicionar 3 fotos" | one batch of `block_id` + `caption` puts | — |
| Carry-over | basis changed between render and Confirmar | nothing written; message announced; recomposed text shown | — |

</intent-contract>

## Code Map

- `e2e/journeys-12-3-12-4.spec.ts:47` `createWord`, `e2e/journey-taps.spec.ts:171`, `e2e/support/taps.ts` `humanTap` -- Q1 failing taps ("target's centre hits button.rail-toggle")
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:~500` `.rail-collapsed`/`.rail-toggle`; `components.css:366`; `app.css` (#41 added 54 lines); `sticky-action-bar.tsx` -- Q1 layout suspects
- `apps/web/src/surfaces/points/point-editor.tsx` (`save()`, `PointEditorDialog`), `points-surface.tsx`, `create-point-action.tsx`; `apps/web/src/state/drafts.tsx` `useDraftSource`; `surfaces/ficha/ficha-fields.tsx:60-110` (reference autosave + draft pattern); `input/use-section-text-area.ts` -- Q2
- `apps/web/src/surfaces/photos/caption-composer.tsx`, `photos.css`, `photo-caption-dialog.tsx` -- Q3
- `apps/web/src/surfaces/photos/capture-sheet.tsx` `SheetBody`/`EquipmentStep`/`usePhotoImport`; `packages/domain/src/photos/gallery.ts:192` `photoEquipmentOptions`; `apps/web/src/db/prefs.ts:128` + `db/schema.ts:125` `LAST_SHEET_PREF`; `packages/domain/src/relatorio/tree.ts` (tree order) -- Q4, Q8
- `packages/domain/src/photos/caption.ts` `contextCaptionParts`, `localOf`, `composeCaption`, `equipmentChipOptions`; `relatorio/cabine.ts` `cabineOf`; tests `caption.test.ts`, `caption-compose.test.ts` -- Q5
- `e2e/photos.spec.ts:96`, `e2e/ficha.spec.ts:818`; `surfaces/ficha/camera-view.tsx` `end()`/`returnFocus()`; `focus-restore.ts` -- Q6
- `apps/web/src/components/photo-row.tsx:116` -- Q10
- `surfaces/photos/photo-viewer.tsx` Remover confirm; `surfaces/ficha/checklist-section.tsx` NC slot; `packages/domain/src/points/refs.ts`, `points/summary.ts` -- Q11
- `surfaces/photos/gallery-surface.tsx:102-106`; `capture-sheet.tsx:69`; `packages/domain/src/photos/text.ts` -- Q12
- gallery sticky bar in `gallery-surface.tsx` + `photos.css` -- Q13
- `apps/web/src/sync/engine.ts` (`runCycle` mutex, online at ~116), `state/sync.tsx` `syncNow`; `db/file-commit.ts` `commitPhotoCapture` -- Q14
- `surfaces/ficha/conclusao-section.tsx:227-242` `confirmText`, `packages/domain/src/relatorio/conclusion.ts:334` -- carry-over
- `_bmad-output/implementation-artifacts/deferred-work.md` entries at ~700 (point drafts), ~755 (composer preview), ~779 (gallery batch commit) -- close or update

## Tasks & Acceptance

**Execution:**
- Q1: reproduce with `--grep "12.3-E2E-004|12.1-E2E-009"` on `desktop-chrome` at 768; fix the layout cause in the app; both green, then `--repeat-each 3`.
- Q2: `point-editor.tsx` -- per-field autosave + `useDraftSource` (surface `point`, entity the point id, generated up front for a new point); "Concluir" flushes and closes; Esc/Cancelar flush; update `points-surface.tsx`/`create-point-action.tsx` callers and their toasts/focus; e2e `@p0` Esc keeps text, reload offers the draft.
- Q3: `caption-composer.tsx`/`photos.css` -- preview on top, sticky bar with "Salvar legenda"; e2e `@p0` at 390 "Salvar legenda" in viewport without scroll after a chip tap.
- Q4: kernel `photoEquipmentGroups(snapshot, currentBlockId)` (likely list + cabine › column groups) with unit tests; `EquipmentStep` renders it; e2e `@p0` at 390 "Geral" visible without scroll and current sheet first.
- Q5: `caption.ts` TAG + column in the parts; unit tests incl. Porto Seguro-like shapes; update e2e expectations that quote old captions (text change is the fix, not an assertion weakening).
- Q6: find and fix the race; `--repeat-each 5` each alone, green.
- Q8: `capture-sheet.tsx` commit on pick, puts on "Adicionar N fotos"; e2e `@p0` rows exist before the step, Cancelar keeps them.
- Q10, Q11, Q12, Q13, Q14, carry-over: as decided above, each with a unit or `@p1` e2e.
- `deferred-work.md` -- close/update the resolved entries (strike-through + dated state).

**Acceptance Criteria:**
- Given the full gate, when `pnpm verify` and `pnpm test:e2e:full` run, then both exit 0.
- Given a point being typed in the dialog, when the user presses Esc, then the text is stored and reopening shows it.
- Given a 390 px phone and a photo's composer, when a chip is tapped, then the preview text and "Salvar legenda" are both in view.
- Given a gallery batch, when files are picked, then their rows exist before "De qual equipamento?" is answered.
- Given photos of SEC-ENEL and SEC-ENEL-2, when captioned from context, then the two captions differ by TAG.

## Design Notes

Q2: a new point is created only when text or action first becomes non-empty (create op with the generated id), later changes are `putPointOp` field puts; the Dialog closing (Esc, scrim, Cancelar, Concluir) flushes the pending commit first. Keep "Concluir" (mock "Concluir edição") as the close-and-toast action; "Cancelar" becomes close (autosave cannot discard) — keep its label only if the mock has it, otherwise drop it (list in Narrowings).

## Narrowings and open questions

The implementer lists here every narrowing taken and every product question left at current behavior (the coordinator records them in `epics.md`). Open for Bruno from the start: the Q11 row text "Ponto de atenção n"; the carry-over sentence "O texto mudou; confira e confirme de novo".

Implementation notes (2026-09-25):

- **Q1 cause.** Not the rail and not the tap helper: on the sheet, the first field commit (Identificação) draws the header's "Preenchido por …" line. At 768 px the page is scrolled by then (the nameplate starts below the fold), so the line grows the header above the viewport while the "Fabricação" Combobox list is open; Chrome's scroll anchoring moves the page 24 px, and React Aria closes a non-modal popover on any scroll of its trigger's ancestors, so the "Criar …" option detached and `humanTap` measured a 0x0 box at (0,0), where `button.rail-toggle` sits. #41 put more work on the sheet's commit-to-render path (photo tiles, word rows), so that line now lands after the list opens instead of before. Fix: `ficha-header.tsx` keeps the attribution line's height from the first render (an `aria-hidden` no-break space until someone fills the sheet). A mouse pass did not reproduce because it did not scroll first.
- **Q6 causes.** 6.1-E2E-002: the camera returned the focus once, 3 frames after close; the tiles' live query can re-render the row later and drop it. `camera-view.tsx` now watches the opener with `restoreFocus` (`if-lost`, `LIST_FOCUS_WATCH_FRAMES`). 5.8-E2E-002: "Concluir ficha" decides on fresh rows but the sheet can still be drawn from older ones, so the land hit the step or an answered marker; `goTo` now follows the first missing marker as the sheet catches up, until the person presses a key or a pointer. Both 5/5 alone with `--repeat-each 5`.
- **Q2 narrowings.** "Cancelar" is gone from the editor (the mock has none; autosave has nothing to discard); the photo picker keeps its own "Cancelar". A seeded new point (NC row photo tokens, the untested sheet's sentence) that the person never touched is created only by "Concluir"; Esc or the scrim on it writes nothing. Esc and the scrim show the same "Ponto de atenção salvo · n de N" toast as "Concluir" when something was stored. A point draft is recoverable where the sheet or the Points surface is open (`usePointDraftRecovery`); the draft carries the point's link (equipment, origin), since the editor is closed after a reload.
- **Q3 narrowing.** Below 768 px the photo is a 96 px thumb beside the composed caption, the two pinned under the heading; the batch composer of "De qual equipamento?" has no photo, so no preview.
- **Q4 narrowings.** The short list holds at most 5 rows (`PHOTO_EQUIPMENT_NEARBY_MAX`: the current sheet, its location's sheets, then its cabine's). "Outro equipamento" (the mock's "Outro equipamento — abrir a árvore" shortened) opens the grouped list in place, in a box that scrolls by itself, instead of leaving for the tree; "Geral" stays last as in the mock and stays on screen.
- **Q5 narrowings.** The coluna's agreement comes from the registry, the seed `locais`, then a kernel head-noun table (`LOCATION_HEAD_NOUNS`: "Coluna 1" is feminine), else masculine singular; only the location holding the block and its cabine are named (an intermediate level is left out). A composer recent such as "chave seccionadora SEC-C01" agrees with its equipment word by prefix. The Porto Seguro fixture and golden are unchanged (captions there are stored data).
- **Q8 narrowings.** Esc and the scrim at "De qual equipamento?" act as "Cancelar". A batch answered while its files are still being saved gets its puts (or the "Geral" toast) as soon as the save ends. Toast authored for Bruno: "3 fotos ficaram como Geral, sem legenda".
- **Q11 narrowings.** A point stores no checklist item (no op family added), so an NC row counts as "its" points the live manual points of the sheet's equipment that cite one of the item's photos. ~~or, for an item with no photo, those that cite no photo.~~ (2026-09-25, review: that marked a point of one photo-less NC item on every other photo-less NC item of the sheet.) An NC item with no photo shows no "Ponto de atenção n" mark, even when a point was written from it. Authored for Bruno: "Ponto de atenção 1" / "Pontos de atenção 1 e 3" beside the row's actions, and the Remover confirm's "Ela é citada no ponto de atenção 2, que passa a mostrar Foto removida."
- **Q13** hides the line on both conditions (below 768 px or `pointer: coarse`).
- **Q14 narrowing.** Only photo commits (capture and import) nudge the engine; caption and removal puts wait for the next trigger. Because a photo now goes out at once while online, 6.1-E2E-002 holds the photo PUTs while it reads the "Aguardando envio" pills (as `gallery.spec.ts` already did).
- **Carry-over.** Announced through the sheet's polite live region (`ficha-announcer`), not a toast.
- **Left at current behavior:** E6-Q7 and E6-Q9 untouched; Bruno's other caption questions (trailing period, "limpeza e reaperto" agreement) unchanged.

## Verification

Run inside the `tools` container of this worktree's compose project (`.env` is set); redirect output to a log and read the tail.

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: exit 0
- `docker compose --profile tools run --rm tools pnpm test:e2e:full` -- expected: exit 0

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass

Layers: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment skipped (token economy; the integrated Epic 6 review covers them).

- verdicts: 15 findings — high 0, medium 7, low 6, false 0, maybe-false 2
- findings:
  - `[medium]` `[patch]` point-editor `finish` closes after a refused (quiet) autosave, losing the text — persist now toasts `writeErrorText` once; close keeps the editor open with the text when a flushed write was refused.
  - `[medium]` `[patch]` same root as above: the removed `save()` kept the editor open on refusal — covered by the same fix.
  - `[low]` `[reject]` text typed after Esc while `finish` awaits the last write is dropped — a window of milliseconds; not met in everyday use and the fix adds guards.
  - `[maybe-false]` `[reject]` a recovered stored-point draft may overwrite newer text — "Recuperar" is an explicit choice with the same semantics as every FR-61 source; if true only low.
  - `[low]` `[patch]` a rejected batch save was toasted as unreadable files — now toasts `writeErrorText` and closes.
  - `[low]` `[reject]` gallery route left before the batch save resolves gives no toast — the photos are saved as "Geral" (no loss); rare.
  - `[medium]` `[patch]` "Outro equipamento" unmounts on press and drops keyboard focus to the body — the focus moves to the first grouped row.
  - `[low]` `[reject]` the 180-frame focus watch after the camera pulls focus back if the person taps blank space within 3 s — mild and rare; `once` would undo the Q6 fix.
  - `[medium]` `[patch]` `ncRowPointPositions` marked a photo-less NC row with another photo-less row's point — now matches only through the item's photos (narrowing recorded).
  - `[low]` `[patch]` `readLastSheet` rejection would throw in `useLiveQuery` — `.catch(() => null)`.
  - `[maybe-false]` `[patch]` conclusion `moved` flag never reset on a build re-run — reset at the top of the build (trivial, no new surface).
  - `[medium]` `[patch]` Q14 call sites untested (tests press "Sincronizar agora") — added 6.2-E2E-005 `@p1`: shot and import upload on their own within 10 s.
  - `[medium]` `[patch]` Q1 header fix guarded only by timing-dependent `@p1` journeys — added `ficha-header.test.tsx`.
  - `[medium]` `[patch]` stored-point autosave/draft on the Points surface untested — added 6.6-E2E-012 `@p1`.
  - `[low]` `[patch]` Esc at "De qual equipamento?" untested — added 6.4-E2E-010 `@p1`; and the wrong comment in `point-draft-recovery.ts` corrected.

## Auto Run Result

Status: done

- **Summary:** E6-Q1 to Q14 (except Q7, Q9) and the carry-over stale "Confirmar" announcement fixed as the coordinator decisions say; causes and narrowings in the section above.
- **Files:** kernel `photos/caption.ts` (TAG and coluna in the context caption), `photos/gallery.ts` (`photoEquipmentGroups`, `galleryCounts`, `photosImportedText`, `photosKeptGeneralText`, composer preview texts), `points/checks.ts` (`pointsCitingPhoto`, `photoCitedByText`, `ncRowPointPositions`, `ncRowPointsText`); web `points/point-editor.tsx` + `point-writes.ts` + `point-draft-recovery.ts` (autosave, FR-61), `photos/capture-sheet.tsx` (commit on pick, grouped picker), `photos/caption-composer.tsx` + `photos.css` (preview, sticky bar), `ficha/ficha-header.tsx` (Q1), `ficha/camera-view.tsx` and `ficha-surface.tsx` `goTo` (Q6), `components/photo-row.tsx` (Q10), `photo-viewer.tsx`/`checklist-section.tsx` (Q11), `gallery-surface.tsx` (Q12, Q13), `sync/engine.ts` `nudge` + `state/sync.tsx` `requestSyncCycle` (Q14), `ficha/conclusao-section.tsx` (carry-over); e2e `points`, `gallery`, `photos`, `durability` specs; `deferred-work.md`.
- **Review:** 15 findings; 11 patched (7 medium, 4 low incl. one maybe-false), 4 rejected (reasons in the triage log), 0 deferred.
- **Follow-up review recommended:** true. Patched mediums: 7. Unverified risk: the point editor's close path after a refused write and the gallery batch committed on pick were only exercised by e2e on desktop Chrome, with no human browser pass; the integrated QA should drive both at 390 px.
- **Verification:** `pnpm verify` EXIT 0 in 1056 s (lint, static, unit 1138 + 849 + 20, api 151, e2e 111 passed). `pnpm test:e2e:full` result in the PR body.
- **Residual risks:** the Q1 fix reserves an empty header line on never-filled sheets; Q14 sends photos at once while online, so specs that read pending pills hold the PUTs.
