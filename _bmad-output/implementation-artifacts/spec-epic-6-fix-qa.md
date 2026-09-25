---
title: 'Epic 6 fixes: integrated review findings (E6-Q1..Q14 except Q7, Q9)'
type: 'bugfix'
created: '2026-09-25'
status: 'in-progress'
baseline_revision: 'b7ac7b512d5252985bc16af2568b3c4ace22a8bf'
review_loop_iteration: 0
followup_review_recommended: false
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

## Verification

Run inside the `tools` container of this worktree's compose project (`.env` is set); redirect output to a log and read the tail.

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: exit 0
- `docker compose --profile tools run --rm tools pnpm test:e2e:full` -- expected: exit 0

## Spec Change Log

## Review Triage Log
