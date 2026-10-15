---
title: 'Story 14.10 parts 10 and 11: one concluded-sheet rule on Home and Sumário; suggestion tray with real buttons'
type: 'feature'
created: '2026-10-15'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context: []
warnings: ['batched', 'multiple-goals']
batched_reason: 'Story 14.10 parts 10 and 11 run as one batch (co16b): two small decisions of Matheus of 2026-10-15, both on the ficha/Home read side, sharing the plate typed-then-read e2e setup.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** (10) The Home card counts a sheet holding a pending suggestion as concluded ("2 de 12 fichas") while the Sumário does not ("0 de 12 fichas concluídas"); the obra (Project) rows do the same as the Home card. (11) A reading that differs from a typed nameplate value shows "Substituir" and "Manter o digitado" as text buttons on a `meta` line that Bruno does not read as clickable.

**Approach:** (10) One kernel rule, the Sumário's `held` rule of `progress()`: every surface that shows a relatório's concluded count passes the device's pending suggestion rows through the same kernel entry; `apps/web` derives nothing. (11) The nameplate `ReplaceLine` becomes option A of `mockups/key-suggestion-options.html`: an amber tray joined under the field, "Sugerido: ⟨valor⟩" and two Secondary buttons, 48 px, stacked on phone.

## Boundaries & Constraints

**Always:**
- AD-1/AD-13: the counter text and state come from `packages/domain`; the web only reads Dexie rows and passes them.
- One rule: the Home card, the Project rows and the Sumário compute `sheets_concluded` through `progress`/`over` with `held` from `pendingSuggestions(rows)` filtered by `livePendingSuggestions` (exactly what the Sumário does at `sumario-surface.tsx:155-156`).
- `tokens.css` and `components.css` stay byte-identical; the tray rules go in `apps/web/src/styles/app.css` with a comment naming `mockups/key-suggestion-options.html` (option A), declarations copied verbatim; `.frame-tablet X` translates to `@media (min-width: 768px) and (max-width: 1279.98px)` per AGENTS.md. At 1280 px (no desktop frame in the mock) the tablet rule also applies (authored, mirroring `.frame-desktop .sticky-action-bar .bar-buttons .btn { flex: 0 0 auto; min-width: 200px }`), so the same media query is widened to `(min-width: 768px)`; say so in the comment.
- Class names from the mock: `suggestion-tray`, `suggestion-tray-text`, `suggestion-tray-actions`; buttons `btn btn-secondary`. The tray hangs off the field: `margin-top: calc(-1 * var(--field-gap))`.
- Accessible names carry the field name, verbatim from the mock: "Substituir ⟨rótulo⟩ por ⟨valor sugerido⟩" and "Manter o digitado em ⟨rótulo⟩, ⟨valor digitado⟩"; the tray is `role="group"` with `aria-label` "⟨rótulo⟩: a leitura difere do digitado". These are component chrome: functions in `apps/web/src/copy/ui.ts` `suggestionField` (the label is `screenLabel(field.label)`, the values the kernel's `suggestionValueText(field, …)`).
- Behaviour unchanged: "Substituir" calls `model.confirm(suggestion, field)`, "Manter o digitado" calls `model.keepTyped(suggestion)`; the DG-2 `NameplateField` press/blur guard (`nameplate-suggestions.tsx` ~470-500) keeps working because the buttons stay inside the field wrapper; the `data-suggestion-id` stays on the tray root; focus restoration that targeted the old `.suggestion-alt` button (`apps/web/src/state/reading-arrivals*`) still finds the first button.

**Never:**
- No contract bump, no new op, no server change. No edit of `infra/`, `infra/bin/deploy`, `e2e/production/`, seed scripts (batch co16a).
- Do not change `MismatchLine` (visor, `read-display.tsx`), the generated text field (`generated-text-field.tsx`) or the Prazo suggestion (`suggestion-field.tsx`): they keep their `.suggestion-alt` `meta` line (listed as an open question in the PR).
- Do not change `progress()`'s fallback when `pending` is undefined (the api's `preIssue(snapshot)` in `apps/api/src/http/generate.ts:312` reads it); only callers change.
- No `.frame-*` mock-only selectors in app code; no edit of `components.css`/`tokens.css`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Held sheet | 12 sheets, 2 concluded, one of them holds a pending suggestion | Home card "1 de 12 fichas", Project row "1 de 12 fichas", Sumário "1 de 12 fichas concluídas" | - |
| Não ensaiada held | a `nao_ensaiada` sheet with a pending suggestion | not concluded on every surface (same `over` rule) | - |
| Suggestion on removed block | pending row targets a removed block | ignored (`livePendingSuggestions`), sheet counts normally | - |
| Confirmed/discarded rows | rows with status `confirmed`/`discarded` | no effect | - |
| Other relatório's rows | suggestion of relatório B | never holds a sheet of A | - |
| Rows not read yet | Home without suggestion rows (`undefined`) | counter as today (no held), never "0 de 0" for a frame | - |
| Complete state | all sheets concluded, one held | `data-state="pending"` | - |
| Tray, phone 390 | typed "SU-TYPED-1", reading "240815-07" | tray under the input, buttons stacked (second below first), each >= 48 px tall | - |
| Tray, 768 / 1280 | same | buttons side by side, `min-width: 200px`, inside the field's box | - |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/progress.ts` -- `over` (held rule), `progress(snapshot, pending?)`, `scoped`, `fichasCountText`, `progressCounterState`. Add here one exported kernel entry for list counters, e.g. `relatorioCounter(blocks: readonly BlockRow[], suggestionRows: readonly SuggestionRow[] | undefined): { text: string; state: 'complete' | 'pending' }` = `progress({ blocks, suggestions: [] }, rows === undefined ? undefined : pendingSuggestions(rows))` mapped to `fichasCountText`/`progressCounterState`; doc comment: "the Sumário's rule (Story 8.1 `held`), Story 14.10 part 10". Export it from `packages/domain/src/index.ts` beside `progress`.
- `packages/domain/src/relatorio/suggestion-rows.ts` -- `pendingSuggestions`, `livePendingSuggestions`, `blocksWithPendingSuggestions` (reuse; do not duplicate).
- `packages/domain/src/home/cards.ts:64-96,214-227` -- `HomeCardsInput`; `counterOf` calls `progress({ blocks, suggestions: [] })`. Add `suggestions?: readonly SuggestionRow[]` (every suggestion row the device holds), bucket by `relatorio_id`, and call the new kernel entry.
- `packages/domain/src/home/cards.test.ts` -- existing card tests (extend).
- `packages/domain/src/relatorio/progress.test.ts` -- existing progress tests (extend).
- `apps/web/src/db/home-store.ts:105` -- `blockRows`; add `suggestionRows(db)` (all `suggestion` entities that parse, via the file's `rows<T>` helper) and `suggestionRowsOfRelatorio(db, id)` (via `rowsWhere`), or one of them if one suffices.
- `apps/web/src/surfaces/home/home-surface.tsx:80-115` -- live queries feeding `base`; add the suggestion rows (undefined until read, like `blocks`).
- `apps/web/src/surfaces/project/project-surface.tsx:51-62,168-184` -- `blocksByRelatorio` live query and the row counter computed in the web with `progress(... suggestions: [])`: read the suggestion rows per relatório in the same live query and render the kernel entry's `text`/`state` (removes the web-side `progress` call).
- Other readers checked: `sumario-surface.tsx:155-156` and `export-dialog.tsx:198`, `use-pre-issue.ts:39`, `tree-surface.tsx:41` (total only), `resume.ts:31`, `tree.ts:450,530` already pass `pending`; the pull summary `progress` (`apps/api/src/sync/pull.ts:177`) is download totals (sheets/photos), not a concluded count; api `generate.ts:312` uses the snapshot fallback (out of scope, see Never). List them in the PR body.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:443-456` -- `ReplaceLine`: rebuild as the tray. Rendered as `after` from `nameplate-section.tsx:365`, placed inside the field's `.field` div after the input (`ficha-fields.tsx` `{after}`).
- `apps/web/src/copy/ui.ts:107-120` -- `suggestionField` (add the three label functions; `replace`/`keepTyped` words stay).
- `apps/web/src/styles/app.css` -- tray rules (mock lines 44-54 of `key-suggestion-options.html`, option A only).
- `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/key-suggestion-options.html` -- the mock (grep `suggestion-tray`; read lines 44-54 and 133 only). DESIGN.md Suggestion field already carries the dated strike (done by the orchestrator).
- Unit tests that query the old line: `apps/web/src/state/reading-arrivals.test.tsx:303-316`, `apps/web/src/surfaces/ficha/nameplate-field.test.tsx:21-26`, `nameplate-dry-insulation.test.tsx:203-206` -- update locators/markup if they render `ReplaceLine` or assert its class.
- E2e that locate the nameplate replace line by `.suggestion-alt`: `e2e/plate.spec.ts:213-228`, `e2e/review-photo-failures.spec.ts:284-364`, `e2e/suggestions.spec.ts:249-270` -- switch to `.suggestion-tray` (only for nameplate fields; `review-concluir-text`, `action-plan`, `verificacoes-local` keep `.suggestion-alt`). Pattern for the typed-then-read setup: `review-photo-failures.spec.ts` R8CAP-E2E-006 (`openTransformerSheet`, `shootPlate`, offline typing, `pushPlateSuggestions`, `pushReadingStatus`, `syncNowAndReturn`, `readStore` outbox). Home counter specs: `e2e/home.spec.ts` (grep `progress-counter`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/progress.ts` + `index.ts` -- add the list-counter kernel entry -- one rule for every list counter.
- `packages/domain/src/home/cards.ts` -- `suggestions?` input, `counterOf` through the entry.
- `packages/domain/src/relatorio/progress.test.ts`, `packages/domain/src/home/cards.test.ts` -- boundary tests: the I/O rows above (held concluded, held não ensaiada, removed block, confirmed/discarded, other relatório, undefined rows, complete vs held), plus one test asserting the Home card text equals `fichasCountText(progress(snapshot, pendingSuggestions(rows)))` for the same fixture (agreement with the Sumário).
- `apps/web/src/db/home-store.ts`, `home-surface.tsx`, `project-surface.tsx` -- read suggestion rows, pass them, render the kernel entry.
- `apps/web/src/copy/ui.ts`, `nameplate-suggestions.tsx`, `apps/web/src/styles/app.css` -- the tray.
- Unit tests above -- keep green; add one RTL test of `ReplaceLine`: two buttons with the field-named accessible names, group label, each calls its handler.
- `e2e/suggestion-tray.spec.ts` (new, `@p0`, tests named `14.10-E2E-0xx`) -- typed-then-read at 390, 768 and 1280 px (`page.setViewportSize`): both controls are `button`s by role with the field-named names; their bounding boxes lie inside the field wrapper's box and start below the input's bottom (within 2 px, no gap); each >= 48 px tall; at 390 the second button's top >= the first's bottom (stacked); at 768/1280 same top (side by side). Then "Substituir" on one field and "Manter o digitado" on another: outbox holds the confirm pair (`sheet/{block}/nameplate/{key}` = suggested value with the suggestion's status `confirmed`, as 8.1-E2E-004 asserts) and `suggestion/{id}/status` = `discarded` with the typed value untouched; reload; inputs show the stored values and no `.suggestion-tray` is left.
- `e2e/` (home spec or a new `e2e/concluded-count.spec.ts`, `@p0`) -- a relatório with one concluded sheet holding a pending suggestion (pushed server-side as the reading helpers do): Home card, Project row and Sumário header show the same concluded number (the held sheet not counted); confirming/discarding the suggestion makes all three count it. If the spec times taps against a render, add it to `SERIAL_SPECS`; otherwise not.
- Updated e2e locators in `plate.spec.ts`, `review-photo-failures.spec.ts`, `suggestions.spec.ts`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close the 2026-10-14 "Home card and the Sumário disagree" entry (strike `state: open...`, add `closed (2026-10-15, spec-14-10-carry-over-2-d.md: ...)`).
- `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/EXPERIENCE.md:312` -- dated parenthetical after "a differing suggestion appears beside the value with "Substituir"": on a nameplate field it is the tray of DESIGN.md with "Substituir" and "Manter o digitado" (strike-through rule; do not rewrite).
- `_bmad-output/planning-artifacts/epics.md` (Story 14.10 only) -- dated lines: under "Part 10 ... (listed, not built)" that Matheus decided on 2026-10-15 the more restrictive count and it is built in this batch; under DoR item 4 / part 11 that Matheus picked option A (Sally) on 2026-10-15.
- `docs/kbs/log.md` -- one dated line.

**Acceptance Criteria:**
- Given a relatório on the device whose one concluded sheet holds a pending suggestion, when the Home, the Project (obra) page and the Sumário render, then all three show the same concluded count, which excludes that sheet.
- Given the typed-then-read case at 390, 768 and 1280 px, when the sheet renders, then "Substituir" and "Manter o digitado" are Secondary buttons inside an amber tray directly under the field's value, 48 px tall, stacked at 390, and their accessible names name the field.
- Given that tray, when "Substituir" is tapped on one field and "Manter o digitado" on another and the page reloads, then the first field holds the suggested value (suggestion confirmed), the second keeps the typed value (suggestion discarded), and no tray remains.

## Spec Change Log

## Review Triage Log

## Verification

**Commands (all inside the tools container: `podman compose --profile tools run --rm --user root tools <cmd>`; full suites and every Playwright run only under `lockf -t 30000 /tmp/fasor-verify.lock`, see the playbook):**
- `pnpm test:unit -- packages/domain/src/relatorio/progress.test.ts packages/domain/src/home/cards.test.ts apps/web/src/surfaces/ficha` -- green while iterating.
- `pnpm lint`, `pnpm static` -- green.
- `pnpm exec tsx scripts/e2e.ts e2e/suggestion-tray.spec.ts <count spec> e2e/plate.spec.ts e2e/review-photo-failures.spec.ts e2e/suggestions.spec.ts e2e/home.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green (the orchestrator runs this under the lock).
