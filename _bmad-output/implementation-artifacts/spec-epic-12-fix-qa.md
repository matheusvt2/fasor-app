---
title: 'Epic 12 fixes: integrated review findings (E12-Q1..Q14 except Q5)'
type: 'bugfix'
created: '2026-09-25'
status: 'done'
baseline_revision: 'c0ce7b0dc303550c4565d49da66bb5a8814c4854'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-12-review-qa.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
# batched: thirteen review findings on the same sheet, setup and shell surfaces fixed in one PR (shared surface, token economy).
deferred:
  - summary: >-
      The focus move to "Local (obra)" after a client "Criar" runs after an awaited IndexedDB commit, outside the user gesture, so a tablet may keep its soft keyboard shut.
    evidence: |-
      apps/web/src/surfaces/home/new-project-dialog.tsx createClient focuses in requestAnimationFrame after await commitBatch; the E12-Q7 rationale (no keyboard for a focus outside a gesture) applies. Chrome desktop focuses and types fine. Settle on the target tablet.
    location: >-
      apps/web/src/surfaces/home/new-project-dialog.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The Epic 12 integrated review (`reviews/epic-12-review-qa.md`, findings table) found one high defect (a voltage class typed with its unit is created then erased), forward navigation that keeps the old scroll and drops focus on `<body>`, a flaky `@p0` journey spec, seed-v1 templates that never reach v2 on existing databases, a gate that stays green without the 12.1 press hold, and eight small UX, copy and visual defects.

**Approach:** Fix each finding as its row proposes, read with the coordinator's decisions below, with one shared mechanism where the finding spans surfaces (Q2), kernel-owned wording (Q8, Q9, Q10), and a test per finding at the outermost surface it names.

Coordinator decisions (binding, 2026-09-25):
- **Q1 (high):** "Outro…" → type "15 kV" → "Criar “15 kV”" keeps "15" as the stored value through any later blur; find why the second write (`null`) happens and stop it; e2e of the exact reproduction.
- **Q2:** after every forward navigation (next sheet, Home "Continuar", "Concluir dados do relatório", "Voltar" to the Sumário, "Cadastrar instrumento", "Próxima seção") the new page starts at its top or at its target row, focus on the page heading or the target, as the existing focus helpers do. One shared mechanism, not per surface.
- **Q3:** `e2e/journey-forward.spec.ts` waits on committed state (new route and target text), never on a non-empty title; passes `--repeat-each 5`.
- **Q4:** `seedStandardTemplate` upgrades a company's seeded "Cabine primária — padrão" template to the current `SEED_VERSION` when it was never edited (`version` still the seeded `1`); an edited template keeps its seed version (AR-20); relatórios already created keep their `seed_version`. api integration test.
- **Q6:** the gate fails if `useHeldWhilePressed` is removed: a `@p0` spec reproducing the Android click delay on desktop (e.g. click dispatched 150 ms after pointerup), plus a deterministic test for the stale "Próxima ficha" label.
- **Q7:** "Outro…" focuses the combobox inside the press handler (same user gesture), not in later animation frames.
- **Q10:** when the first sheet's missing Placa fields are cabine fields, the kernel sentence names them "campos da cabine" (wording in `packages/domain`).
- **Q11:** after "Criar" of a client, focus moves to "Local (obra)"; an instrument registered from setup Etapa 4 comes back checked in the relatório.
- **Q8, Q9, Q12, Q13, Q14:** as the rows propose.

## Boundaries & Constraints

**Always:** AD-1/AD-13 ownership (derived text, counts, plurals in `packages/domain`; web renders and writes ops through the existing edit queue); pt-BR strings in their AGENTS.md home; `tokens.css`/`components.css` byte-identical (any CSS fix goes in `apps/web/src/styles/app.css` with a comment naming the mock rule); React Aria for behavior; 48/56 px targets kept; every changed behavior covered by a test (`@p0` Playwright for the main path of Q1, Q2, Q6; `@p1` or unit for the rest).

**Never:** Edit `epics.md` or `sprint-status.yaml`; touch E12-Q5 (closed on main); edit seed v1 in place or change a relatório's `seed_version`; rewrite unrelated tests to chase a load flake; build on `fix/e2e-gate-stability`; decide the open product questions listed below (keep current behavior).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| Q1 create with unit | "Outro…", type "15 kV", "Criar “15 kV”", then Tab away / reload | registry row "15"; `nameplate/tensao_de_placa` = "15" and no later `null` op; input shows the created row's label | text that is not a number: no create (unchanged) |
| Q1 create plain | type "15", Criar, blur | "15" kept (unchanged) | — |
| Q2 forward nav | any push to a different pathname | `scrollY` 0 (or the target row in view), focus on the App bar `<h1>` or the surface's own target | same-pathname search change and POP (browser back) untouched |
| Q4 unedited v1 | template `seed_version` v1, `version` 1 | after seeding: `seed_version` = `SEED_VERSION`, blocks/skeleton of `standardTemplate`, `version` 1; one op batch; re-run adds no op | apply rejection throws (as today) |
| Q4 edited v1 | `version` > 1 | untouched | — |
| Q4 relatório | relatório created from v1 | keeps `seed_version` v1 | — |
| Q10 first sheet | 0 nameplate missing, 6 cabine missing | "Faltam 6 campos da cabine …" | mixed: "faltam 2 campos da placa, 6 campos da cabine …" (placa part first) |

</intent-contract>

## Code Map

- `apps/web/src/components/registry-picker-field.tsx:46-61,93-97,115-118` -- Q7 focus effect (two rAFs); Q1 `setInputValue(text.trim())` after create. The Combobox host is always mounted (`hidden`), so the press handler can reveal it synchronously (`flushSync`) and focus the input.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx:283-315` `WordField` -- Q1: `created` ref cleared once `selected` resolves; the next blur with input "15 kV" matches no option → `onChange(null)` → `commit(null)`. Also read `apps/web/src/components/combobox.tsx` blur/selection behavior.
- `packages/domain/src/registry/word-row.ts` `parseVoltageClassKv`, `wordRegistryRowText` -- stored name vs shown label.
- `apps/web/src/surfaces/app-shell.tsx` `AppShell` (h1 `.app-bar-title` line ~137) -- Q2 home of the shared mechanism (`useLocation`, `useNavigationType`); child passive effects and `focusWhenRendered` (`surfaces/relatorio/relatorio-focus.ts`) run after a parent layout effect, so surface targets win.
- Q2 surfaces with a target: `surfaces/relatorio/setup-surface.tsx:106-116` (Etapa heading), `surfaces/relatorio/sumario-surface.tsx` (`arrivalOf`, `focusBlockId`, `headingRef`), `surfaces/relatorio/relatorio-tree.tsx:230-245` (row scroll + focus), `surfaces/registries/registries-surface.tsx:30-80` + `instrumentos-tab.tsx:23-40` (arrival panel: target = its first field "Código"), `surfaces/relatorio/section-text-surface.tsx:140-165`, `surfaces/ficha/ficha-surface.tsx:296-300` `goNext` (Ficha keyed by `blockId`, line 92).
- `e2e/journey-forward.spec.ts:83-90` `openRow`, `:180-196` -- Q3.
- `apps/api/src/db/seed.ts:222-255` `seedStandardTemplate`; `apps/api/src/db/standard-template.integration.test.ts` -- Q4. `packages/domain/src/seed/template.ts:200` `standardTemplate`, `seed/definitions.ts:28` `SEED_VERSION`, `ops/apply.ts:313-319` (`template/field` bumps `version` on name/blocks/skeleton; a `version` put sets it explicitly), `seed/template-rules.ts` `checkTemplateRow`.
- `apps/web/src/input/press-hold.ts` (`HOLD_CAP_MS`, `RELEASE_AFTER_UP_MS`, `useHeldWhilePressed`), `e2e/lost-taps.durability.spec.ts` (12.1-E2E-001..006, `humanTap`), `e2e/support/` -- Q6. `ficha-surface.tsx:302-340` `conclude('next')` -- stale label path.
- `apps/web/src/surfaces/ficha/ficha-header.tsx:61-62`, `packages/domain/src/relatorio/sheet-progress.ts:106-117,195-252` (`placaMissing`, `summaryMissingPart`, `sheetSummaryText`), `components.css:391-393` (`.n-missing`), mock `key-equipment-sheet-v09.html:52` (`faltam <span class="n-missing">9</span> leituras`) -- Q8, Q10.
- `packages/domain/src/relatorio/cabine.ts:107-129` `lineMeasure`, `cabineLineText` -- Q9.
- `apps/web/src/surfaces/home/new-project-dialog.tsx` (client "Criar", "Local (obra)"), `setup-surface.tsx` Etapa 4 instrument checklist + return from Cadastros -- Q11.
- `apps/web/src/surfaces/home/relatorio-card.tsx:26` -- Q12.
- `apps/web/src/surfaces/relatorio/not-tested-dialog.tsx` -- Q13.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:444` `.rail-collapsed`; `components.css:365`; `app.css` -- Q14.
- `e2e/tap-budget.spec.ts` (`TAP_BUDGET`) -- re-run; report J1 and J3.

## Tasks & Acceptance

**Execution:**
- `registry-picker-field.tsx`, `ficha-fields.tsx` -- Q1: after a create, the input shows the created row's label (the stored/parsed name, e.g. via `onCreate` returning it), and a blur while the created row is still arriving never commits `null`; confirm the root cause against the outbox order before fixing. Q7: the "Outro…" press handler reveals the Combobox synchronously and focuses the input in the same handler; scroll after, keeping the list-open fix the comment describes. Unit tests in `registry-picker-field.test.tsx`.
- `e2e/` (5.x/12.4 spec that owns the plate) -- Q1 `@p0`: SEC-ENEL, "Outro…" on Tensão de placa, type "15 kV", "Criar “15 kV”", Tab away, reload: field reads the value, header does not count it missing, no `tensao_de_placa null` op.
- `app-shell.tsx` (or a hook in `apps/web/src/state/` it calls) -- Q2: on a PUSH/REPLACE whose pathname differs from the previous one, `window.scrollTo(0, 0)` and focus the App bar `<h1>` (`tabIndex={-1}`, `preventScroll`); surfaces with a target keep landing theirs afterwards. Add the Cadastros arrival target (the new instrument panel's first field, scrolled into view). Remove per-surface duplicates only where they conflict.
- `e2e/journey-forward.spec.ts` (or a new `@p0` spec) -- Q2: at 768, after "Próxima ficha", Home "Continuar", "Concluir dados do relatório", "Voltar" from a sheet, "Cadastrar instrumento", "Próxima seção": `scrollY` is 0 or the target is in the viewport, and the focused element is the heading or the target (never `BODY`). Q3: `openRow` waits for `.app-bar-title` to equal the row's TAG taken from the row; J5 waits for the arrival panel before "Voltar"; the whole file passes `--repeat-each 5` on desktop-chrome.
- `apps/api/src/db/seed.ts`, `standard-template.integration.test.ts` -- Q4: upgrade path per the matrix, through `applyOps` as a server op batch (`system:identity`), `version` kept at 1; tests: v1 unedited → upgraded, edited → untouched, relatório seed_version kept, second run no op.
- `e2e/lost-taps.durability.spec.ts` -- Q6: a `@p0` spec on durability-desktop-chrome whose click lands 150 ms after pointerup (CDP or dispatched events) on a control that re-renders after a commit, failing when `useHeldWhilePressed` is a pass-through (prove by temporarily removing it; record the red run in the PR). A deterministic web Vitest (or `@p1` e2e) for the stale "Próxima ficha" label: fresh rows complete while the render shows "Próxima ficha" → one batch with the suggested instruments and `concluded_by`, then the next sheet (pins current behavior; open question 4 stays open).
- `sheet-progress.ts`, `ficha-header.tsx` -- Q8: kernel `sheetSummaryParts(p, shown)` returning `{text, kind: 'text' | 'missing'}[]` whose joined text equals `sheetSummaryText`; the numbers of missing parts are `missing`; the header wraps them in `.n-missing`. Q10: the Placa step carries its cabine share (e.g. `steps.placa.cabine`), and the sentence names "campo(s) da placa" and "campo(s) da cabine" separately. Unit tests for both.
- `cabine.ts` -- Q9: value and unit joined with U+00A0; unit test.
- `new-project-dialog.tsx`, `setup-surface.tsx`, registries arrival -- Q11: focus "Local (obra)" after the client "Criar"; the instrument saved from the Etapa 4 detour comes back checked (one relatório op, only if the instrument row exists and is not already listed). Tests.
- `relatorio-card.tsx` -- Q12: filter `!= null`; unit test.
- `not-tested-dialog.tsx` -- Q13: choosing "Outro" focuses "Descreva o motivo"; test.
- `app.css` -- Q14: the collapsed rail strip fills the column height at 768 in both themes; check at 768 in the Q2 or a visual spec.
- `e2e/tap-budget.spec.ts`, 12.1 race specs -- re-run; J1 and J3 counts go in the PR body.

**Acceptance Criteria:**
- Given SEC-ENEL at 768, when the engineer creates "15 kV" through "Outro…" and tabs away and reloads, then Tensão de placa holds "15" (shown with its unit) and the outbox holds no later null for it.
- Given any forward navigation named in Q2, when the new page renders, then it is scrolled to its top or its target row and the focus is on the page heading or the target.
- Given the gate, when `useHeldWhilePressed` returns its argument unchanged, then `pnpm verify` fails on the new Q6 `@p0` spec.
- Given a company whose standard template is v1 and unedited, when the seed runs, then the template is at `SEED_VERSION` and its relatórios keep theirs; an edited template stays.
- Given CE-ENEL with only cabine fields missing, when the sheet opens, then the header reads "Faltam 6 campos da cabine" with "6" in `.n-missing`.
- Given the whole batch, when `pnpm verify` runs, then it is green, and `journey-forward.spec.ts --repeat-each 5` passes.

## Narrowings

- **Q1, root cause and reading of "shown with its unit".** The sheet's picker listed voltage classes by their stored name ("15") while the input kept the typed "15 kV"; on the next blur React Aria's `commitValue` saw an input that matched no option text and cleared the selection, and `WordField` wrote `null`. The picker now lists a voltage class by its registry row text (`wordRegistryRowText`, "15 kV", as the v0.9 mock's chips draw it), `onCreate` returns the created row's label for the input, and a unit-folding match key (`parseVoltageClassKv`) keeps "15" and "15 kV" the same entry, so no "Criar" is offered for a class already there. The stored value stays "15".
- **Q4, a new server-only path.** `seed_version` is an immutable key for every entity, so no existing op could move it. The upgrade adds one appended, server-only family `template/{id}/seed_version` (`system:identity` only; a device op on it is refused `op_server_only`, tested). The batch is `seed_version`, `blocks`, `skeleton`, then `version` = 1. `IMMUTABLE_KEYS` and the relatório's `seed_version` are unchanged. The op-path contract grows from 39 to 40 families (`path.test.ts`).
- **Q11b, only the "Fechar" return checks the instrument.** The panel's "Fechar" navigates back with the new instrument's id and setup checks it (one `relatorio/setup/instrument_ids` op) once the row exists and is not listed. The App bar "Voltar" from Cadastros returns with no state and checks nothing. A panel closed with no field typed creates no row, so nothing is checked either.
- **Q6, the new `@p0` race runs on Chromium only.** The CDP touch it needs exists only there, so `12.1-E2E-007` is skipped on `durability-webkit`. It runs on `durability-desktop-chrome` (the gate) and `durability-android-chrome`. The red run with `useHeldWhilePressed` returning its argument failed on "the tap held across the commit" (toast not found). The stale-label test is `@p1 12.1-E2E-008` in `sheet-knows-12-3-12-4.spec.ts`.
- **Q2, the width checked.** The shared mechanism (`state/forward-arrival.ts`, called by `AppShell`) applies at every width, but the spec checks it at 768 only, as the review measured. The ficha rail's own scroll of its current row at 1024 px and up (`relatorio-tree.tsx`) was not re-measured.
- **Q14, where the CSS goes.** `ficha.css` keeps the strip sticky. `app.css` gives it a viewport-tall height, so it fills the column in view. Checked at 768 in `12.2-E2E-006`, in light and dark.

## Open questions (kept at current behavior)

- D-2 residue (a section left by a tap stays open), D-4 residue (a stale "Próxima ficha" label concludes), authored copy "campos da cabine" (Bruno), printed OBSERVAÇÕES (Bruno).

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass

Layers run: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment skipped (token economy; the integrated Epic 12 review covers them). Orchestrator fix before review: `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` raised to 3 for the new server-only `template/{id}/seed_version` family (the precedent of version 2: an old bundle cannot parse a family it does not know, so it must update).

- verdicts: 12 findings — high 0, medium 4, low 7, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` Edge: the upgrade's four puts go through `applyOps`, op by op; a refusal mid-way leaves `seed_version` moved and blocks old, and later runs skip it — moved to `applyServerBatch` (one transaction under the company lock).
  - `[medium]` `[patch]` Edge: `version === 1` read outside the lock; a device edit in between is overwritten and `version` reset to 1 — re-checked in `deps.before` under the lock.
  - `[low]` `[reject]` Edge: a stored `seed_version` newer than the server's would be downgraded — only reachable by running an older build against a newer database; the fix adds a version-order guard.
  - `[low]` `[patch]` Edge: the intermediate row (new `seed_version`, old blocks) could fail validation for a future seed — covered by the atomic batch (same root cause as the first row).
  - `[medium]` `[defer]` Edge: the client-"Criar" focus to "Local (obra)" runs in a frame after an awaited IndexedDB commit, outside the gesture, so a tablet may keep its keyboard shut — the fix restructures the create (pick before the await, undo on error); recorded as a device check like the original E12-Q7.
  - `[low]` `[patch]` Edge: an existing-client "Criar" returns without moving the focus to "Local (obra)" — focus added there too.
  - `[low]` `[patch]` Edge: `.rail-collapsed { height: 100dvh }` stretches a short sheet to the viewport plus the App bar — sized so it never makes the page taller.
  - `[low]` `[patch]` Edge: `taps.ts` never releases the CDP touch when `during()` throws — `touchEnd` moved into `finally`.
  - `[medium]` `[patch]` Verification: `useForwardArrival`'s POP and search-only exclusions are untested — Vitest added over a memory router.
  - `[low]` `[patch]` Verification: "Fechar" on an untouched arrival panel (no row, no check) is untested — assertion added to 12.2-E2E-003.
  - `[low]` `[patch]` Verification: the stale-"Próxima ficha" pin is `@p1` with an 80 ms timing, outside the gate — made order-deterministic and tagged `@p0` (the coordinator asked for a deterministic test).
  - `[false]` `[reject]` Verification (other): E12-Q12 is not a live defect — `card.counter?.text` with a null counter is already `undefined`, which the old filter dropped; the `!= null` change is harmless and kept. The trailing separator the QA pass heard was not reproduced in code.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/journey-forward.spec.ts --project desktop-chrome --repeat-each 5` -- green
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/tap-budget.spec.ts e2e/lost-taps.durability.spec.ts` -- green, J1/J3 counts logged
- `docker compose --profile tools run --rm tools pnpm verify` -- green

## Auto Run Result

- **Status:** done. Thirteen findings fixed (E12-Q1..Q14 except Q5), one review-fix loop.
- **Summary:** Q1 voltage class shown with its unit in the sheet picker, "15" and "15 kV" one entry, the created row's label kept in the input, so no later null; Q2 one shared `useForwardArrival` in the App shell (push to a new pathname: top of page, App bar `<h1>` focused; surfaces with a target win); Cadastros arrival lands on "Código"; Q3 journey-forward waits on committed state; Q4 unedited standard template moved to `SEED_VERSION` in one locked server batch through the new server-only family `template/{id}/seed_version` (contract version 3); Q6 `@p0 12.1-E2E-007` (touch held across a commit, red with the hold removed) and `@p0 12.1-E2E-008` (stale "Próxima ficha", order-deterministic); Q7/Q13 focus in the press handler; Q8/Q10 `sheetSummaryParts` with `.n-missing` and "campos da cabine"; Q9 U+00A0 between value and unit; Q11 focus to "Local (obra)", the Etapa 4 instrument comes back checked on "Fechar"; Q12 filter on `!= null` (no-op, see triage); Q14 strip height in `app.css`.
- **Review:** 12 findings; 9 patched (3 medium, 6 low), 1 deferred (medium, device check), 2 rejected (1 false, 1 unlikely low).
- **Follow-up review recommended:** true — two or more medium entries were patched; the unverified risk is the template upgrade's lock/rollback path (`UpgradeNoLongerNeeded`), which no test drives mid-batch.
- **Verification:** `pnpm verify` EXIT 0: unit 996 + 800 + 20, api 147 (25 files), e2e `@p0` 92 passed in 9.6 min. `journey-forward.spec.ts --repeat-each 5`: 30 passed. Tap budget: J1 9 taps / 36 keys, J3 7 / 47; J0 1 tap; J5 11 taps.
- **Residual risks:** a device on a contract-2 bundle stops pulling and shows "Atualizar" until it updates (by design, AD-13).

