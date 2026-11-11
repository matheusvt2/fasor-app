---
title: 'e24x: the Epic 24 integrated review''s fixes, part 1 (A1-A5, B1, B3, B4, C1-C4, decision 17, test gaps; B2 ledger only)'
type: 'bugfix'
created: '2026-11-11'
status: 'in-progress'
baseline_revision: 'e5fdde82ecd5edf367349664d9202efd902f46c5'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'The first part of the Epic 24 integrated review (three read-only reviewers on main b07d3397) and Matheus''s decision 17 of 2026-11-11 run as one fix batch, as the coordinator planned (epic-24-context.md § Fix batch after the integrated review): one spec, one gate, one PR, modelled on fix batch e24f.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The integrated review of Epic 24 found three medium defects (A1: a typed NC observation can be removed silently when its row leaves NC; B1: a large push on a slow uplink is aborted on every attempt; C1: a reading above the instrument's limit on a range criterion gets no verdict, so the ficha floors Aprovado · Sem restrições and the paragraph says "dentro dos critérios") and ten low ones. Matheus's decision 17 (2026-11-11) adds: a typed observation is always edited, and a library type hidden by a published copy keeps an "Editar padrões" entry in the composer while a template places it.

**Approach:** Red first, item by item: each fix gets a test that fails on the baseline `e5fdde82` and passes after. Kernel fixes where the rule lives (AD-1/AD-13); web renders. No fold change is expected, so no contract number; take one only if a fix proves to need one (Boundaries).

## Boundaries & Constraints

**Always:**
- Verify each finding against the code before changing it. One that does not reproduce: say so in the Auto Run Result with what was checked, and change no code for it.
- Everything on main binds: e24h (a point exists only when a person creates it; an observation never sets the floor), e24f, e24b, e24a (v14 `rules` flags read by `seedRule`, never a version comparison), e24c, e24p. Read the Design Notes of the spec that owns the code (`spec-e24b-screen-lane.md` for A1/A2/A5/B4, `spec-e24f-retro-fixes.md` for B1/A3, `spec-e24c-company-types.md` for C1/C3/decision 17, `spec-e24a-conclusion-rules.md` for A4) before changing it.
- Every pt-BR sentence authored here is marked `// authored (e24x, listed for Bruno)` and listed in the Auto Run Result. Derived text in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts`. English code and docs; no emoji; kernel rule comments may say "Fix batch e24x (A1):" as the repository already does.
- Each changed or rewritten test gets one line of reason in the Auto Run Result ("Changed tests").
- Keep each change small: batch e24s edits the seed, `schemas/block-config.ts`, `relatorio/tree.ts`, `relatorio/tag.ts`, the palettes, `print/section-9.ts`, `relatorio/measurement-evaluation.ts`, `contract/version.ts` in parallel.
- Commands: `podman compose --profile tools run --rm --user root tools pnpm ...` in this worktree (compose project `fasor-e24x`, port base 46, from `.env`); every unit, api or Playwright run under `nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'`, logged in `.scratch-e24x/`, polled with bounded loops of at most 55 s; wrap long runs in `caffeinate -i`. `podman compose restart api` after any change under `packages/domain` or `apps/api`, before `test:api` or an e2e. Narrowest suite while iterating (`pnpm exec vitest run --project @app/web <file>`, `pnpm exec vitest run <kernel file>`, one spec with `--grep`). Spec paths go before `--project` with `scripts/e2e.ts`.

**Never:**
- Never touch the main checkout (`/Users/matheusvilella/Documents/estudos/fasor-app`) or another compose project; never `docker`; never `down -v`; never build an image; providers stay `fake`.
- Never edit `epics.md`, `source-deltas.md`, `epic-24-context.md`, the sprint change proposal or `sprint-status.yaml`.
- Goldens: the layout-lock goldens (v5, v11, v12, v13) and the Porto Seguro goldens stay byte-identical; fixtures change by additions only (`git diff e5fdde82 --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures`). If a fix (C1, C2, A3 could) moves a golden, drop that fix, write the diff it would cause in the Auto Run Result, and leave it for Matheus.
- No fold change unless unavoidable; if one is (a new refusal inside `applyOp`, a new field on a synced row), stop and report rather than take a contract number: the orchestrator takes it at merge time.
- B4: if binding across types needs the equipment row to change its `type`, or breaks a reader of `equipment.type` (previous visit, last results, TAG suggestion, move, print grouping), stop B4, write why, and add a ledger row for Matheus.
- Out of scope: B2 (ledger row only), anything not named here. A new defect found is reported, not fixed.

## I/O & Edge-Case Matrix

| Id | Input / State | Expected |
|---|---|---|
| A1 | NC row, observation typed "Trinca no isolador" and synced (the server learned it as a phrase); then a seed chip tapped (text "Trinca no isolador, <seed phrase>"); row set to C, and separately to N.A. | observation kept; the row shows "Observação mantida: o texto foi editado." with "Apagar observação"; no observation op in the batch |
| A1 | NC row, observation typed equal to a phrase learned from another sheet, or equal to another sheet's observation (a recent); row set to C | kept with the warning |
| A1 | NC row, observation written while the tablet clock runs ahead (its op id earlier than the learned row's) | kept with the warning (no op-id cut is used any more) |
| A1 | NC row, one or two seed chips tapped, nothing typed (a final period aside); row set to C or N.A., on the device that tapped and on another device after sync, online or offline | observation removed in the same batch, no warning (Story 24.6 AC 1 and 2 unchanged) |
| A1 | NC row, a learned or recent chip tapped, nothing typed; row set to C | kept with the warning (decision 17: a text equal to one typed on another sheet is edited); listed for Matheus |
| A1 | a local's site row (Verificações do local), same cases | same answers (seed phrases of the site item) |
| A2 | chip tapped, C tapped before the observation write is stored (`typed.text !== stored`) | kept with the warning (text non-blank); the pending commit lands; nothing removed. A blank pending text: nothing asked |
| A5 | the warning showing; leave the ficha and come back, or reload | the warning still shows until the row's observation or result changes |
| B1 | push body 300 KB on a 2 KB/s uplink | the headers bound covers it (no abort before about 150 s plus the server's time) |
| B1 | body-less request whose answer never comes | `network` after `SYNC_REQUEST_TIMEOUT_MS` (60 s), as today |
| C1 | company `between` (or "nominal ± %") criterion 220 V ±5 % (209-231), capture "> 250" V; 100 µΩ ±20 % with "> 200 µΩ"; limit exactly at the upper end "> 231" | verdict `out`; the floor fails the ficha as any out reading; the paragraph names it as out |
| C1 | same criterion, capture "> 220" (limit inside the range) | no verdict; the floor withholds (null) and the paragraph says "valores medidos com leitura a conferir", never "dentro dos critérios" |
| A3 | v11+ ratio table waiting for its vector group, holding no measured capture, beside a judged capture elsewhere | paragraph "valores medidos dentro dos critérios de aceitação" (not "a conferir"); the floor unchanged |
| A4 | v14 NC observation "Observado:\n- trinca" | the clause reads "Observado: - trinca" (a space after a line ending in ":"), never ":;" |
| B3 | an `equipment` create or `reuse_key` put over 1000 characters | refused by the push route (`op_invalid` or the value-limit refusal the route already gives a long `tag`); the longest legitimate key (prefix + local code + suffix, at their caps) passes |
| B4 | obra with an equipment of the library breaker (from an earlier relatório); the template's breaker replaced by its published company copy; "Novo relatório" | the copy's block binds that equipment (by key, then TAG), no new equipment row; its previous visit shows for the tests the copy shares; values of tests the copy lacks do not show |
| B4 | equipment of copy A of a base, template now places copy B of the same base | binds; a type of another family never binds |
| C2 | 100 µΩ ±20 % (80-120), readings 20 µΩ and 125 µΩ | worst reading named is 20 µΩ (60 below the lower end vs 5 above the upper) |
| C3 | company type with no summary and no version text, composer palette and field palette | composer row meta "Tipo da empresa" alone; field row "Tipo da empresa · TAG", never a doubled " ·  · " |
| C4 | 24.9-E2E-004 at 768 px | the unit column's edges align as at 1280 px, and the table's scroll width equals its client width |
| D17 | composer, a published copy hides the Transformador de força while the template places transformers | the composer palette still offers "Editar padrões" for the hidden original (Design Notes N4); no stepper adds more of it |
| gaps | the point question open, its asked points removed on another device | the question closes and the chosen result is written alone (web test) |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/ficha.ts:218-238` `ncObservationOnLeave` (A1, A2: the rule); `insertPhrase` `:244`.
- `packages/domain/src/registry/nc-phrase-row.ts:74-84` `learnedBefore` (dropped by A1 with its test `relatorio/observation-on-leave.test.ts:10-30`); `typedPieces` `:124`.
- `apps/web/src/surfaces/ficha/checklist-section.tsx` -- `sheetRowTarget` `:331-363` (`leaveChips`), `write` `:463-482` (pending branch), `kept` state `:441-443` (A5), the point-question effect `:515-520` (test gap).
- `apps/web/src/surfaces/local/verificacoes-surface.tsx:137` -- the site row's chips (A1 for a local).
- Tests: `apps/web/src/surfaces/ficha/checklist-row.test.tsx`, `apps/web/src/surfaces/local/verificacoes-surface.test.tsx:320-355`, `e2e/nc-phrase-follows-item.spec.ts`.
- `apps/web/src/sync/client.ts:118-135` (B1 constants and comment), `:214-220`; `apps/web/src/sync/client.test.ts:167-192` (the "8,5 min" title); `apps/web/src/sync/engine.ts:299-305` (`withRetry` of the push).
- `packages/domain/src/relatorio/over-range.ts:56-73` `OverRangeCriterion`, `overRangeVerdict` (C1); callers `relatorio/reading-evaluation.ts:813-815`, `relatorio/measurement-evaluation.ts:479-485` (`overRangeAnswer`); `types/block-definition.ts:45-58` (nominal ± % reads as `between`); `relatorio/conclusion.ts:224-237` `computeFloor` (Story 14.9 / e21g unjudged), `:738-760` paragraph (A3 at `:751`, R-1 branches); `types/nominal-tolerance.test.ts:204`.
- `packages/domain/src/relatorio/conclusion.ts:520-534` `ncObservationOnOneLine` (A4).
- `packages/domain/src/ops/value-limits.ts:160` `equipment` row fields (B3), `TEXT_CAPS` `:25`; `relatorio/tag.ts:187-213` `equipmentMatchKey`, `reuseKeyFor`; where value limits are checked (`grep -rn valueLimit\|checkValueLimits packages/domain/src apps/api/src`).
- `packages/domain/src/relatorio/instantiate.ts:331-372` (B4: `free`, `match`); `relatorio/tree.ts:794-804` `hidingCopies` (how a copy names its base: the latest published definition's `base_block_type`); readers of `equipment.type`: `grep -rn "\.type ===\|equipment.type\|row.type" packages/domain/src apps/web/src apps/api/src`; `print/reading-slots.ts` `previousResultsFor`, `print/last-results.ts`.
- `packages/domain/src/relatorio/reading-run.ts:170-215` (C2 score).
- `apps/web/src/surfaces/templates/block-palette.tsx:88-95` `paletteMeta`, `:164-182` the rows, `PaletteEquipmentRow` `:237-266`; `apps/web/src/surfaces/relatorio/block-palette-field.tsx:226-230` `paletteItemMeta`; `apps/web/src/copy/pt-br.ts:1064-1066` (`libraryMeta`, `companyMeta`) (C3, D17).
- `packages/domain/src/types/list.ts:118-130` -- the existing "Oculto nas paletas: a cópia … está publicada." text (D17).
- `e2e/pass-screen-fixes.spec.ts:243-281` (C4).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- new section at the end; rows to close: e24b "recents" (`:3666-3670`), e24c "Editar padrões" (`:3738-3742`), any row a fix closes; B2's new row.
- `docs/kbs/log.md` and the KB concepts the change affects (grep `docs/kbs` for `ncObservationOnLeave`, `requestHeadersTimeoutMs`, `overRange`, `reuse_key`).

## Tasks & Acceptance

**Execution (each red first on the baseline, the red run logged in `.scratch-e24x/`):**
- A1/A2 -- `relatorio/ficha.ts` `ncObservationOnLeave`: judged against the item's seed phrases only (Design Notes N1); a text still being saved is `keep` when non-blank (A2; the kernel takes both texts). Drop `learnedBefore`, `leaveChips` and their test; `checklist-section.tsx` and `verificacoes-surface.tsx` pass the seed phrases. Kernel unit tests for every A1/A2 row; a web test of the pending branch (`checklist-row.test.tsx`); extend `e2e/nc-phrase-follows-item.spec.ts` with one `@p0` case of the first A1 row asserting the outbox (no observation op) and the warning.
- A5 -- the kept warning survives leaving the ficha and a reload: a `sessionStorage` record keyed by relatório, block (or location) and item holding `{observation, result}`, read on mount, dropped when either changes or "Apagar observação" runs; every access in try/catch. Web test (unmount and remount) and the e2e above extended with a reload.
- B1 -- `SYNC_REQUEST_FLOOR_UPLINK_BYTES_PER_S` = 1024 (Design Notes N2); correct the comment and the test title ("about 69 min" for `SYNC_PUSH_MAX_BYTES`, computed, not guessed); a test of the 300 KB case and of the body-less 60 s.
- C1 -- `overRangeVerdict` takes `value_max`; for `between`: `out` when the scaled limit is at or above `value_max`, null otherwise; both callers pass `value_max`; `overRangeAnswer`'s excess measures from the upper end. The floor (`computeFloor`) withholds and the paragraph says "a conferir" for an over-range capture left with no verdict (as R-1 does). `nominal-tolerance.test.ts:204` asserts `out`; tests for the four C1 rows.
- A3 -- `conclusion.ts:751`: the groupMissing clause also requires a measured capture in that table. Floor untouched.
- A4 -- `ncObservationOnOneLine`: a line ending in ":" joins the next with a space.
- B3 -- `value-limits.ts`: `equipment` row `reuse_key: medium` (and `equipment/field` if it can write `reuse_key`); a kernel test of the bound and an api integration test through the push route; a test that a key built from the longest legal prefix and local code passes.
- B4 -- `instantiate.ts`: `free` accepts a row of the same family (Design Notes N3), key first then TAG as today; a kernel test per B4 row and a two-device-safe api test if the route builds the run (check `apps/api` callers of `instantiateRelatorio`); an e2e only if an existing 24.21 spec can take one case (`e2e/equipment-history.spec.ts`).
- C2 -- `reading-run.ts`: for a `between` criterion (own or the test's) the score is the distance outside the nearer end, scaled by that end; inside the range it ranks below any outside reading. Kernel test.
- C3 -- a kernel function composes the palette meta (`Tipo da empresa` alone with no parts; an empty summary counts as none), both palettes call it; the two web copy functions go or become wrappers. Web tests on both palettes.
- C4 -- `e2e/pass-screen-fixes.spec.ts` 24.9-E2E-004 repeats its edge check at 768 px and asserts no sideways scroll.
- D17 -- the composer palette per Design Notes N4; web test in `apps/web/src/surfaces/templates/` and one `@p1` case in `e2e/copied-type-hides-original.spec.ts`.
- Test gap -- a web test of the effect that closes the point question when its asked points vanish.
- Records -- `deferred-work.md` (this batch's section, closed rows struck through with the dated text, B2's row: owner Matheus, scenario "remove a sheet, add the same type from the palette, restore the removed sheet: two live equipment on one `reuse_key`; the next relatório binds the oldest", evidence `apps/web/src/surfaces/relatorio/tree-actions.ts:792`, `relatorio/tag.ts:211`), `docs/kbs/log.md`, the KB concepts touched.

**Acceptance Criteria:**
- Given the baseline `e5fdde82`, when each new test of A1, A2, A3, A4, A5, B1, B3, B4, C1, C2, C3, D17 runs, then it fails; after the fix it passes (record the red runs per item). C4 and the test gap are test-only and may pass on the baseline; say so.
- Given every layout-lock and Porto Seguro golden, when `test:api` and `test:unit` run, then all stay byte-identical (`git diff e5fdde82 --stat -- apps/api/src/jobs/generate/golden packages/domain/fixtures` empty or additions only).
- Given the story gate (lint, static, test:unit, test:api, and the touched or surface-driving specs on `desktop-chrome` and `durability-desktop-chrome`), when it runs under the lock, then it is green; the durability specs that drive the checklist rows or the sync client also run on the matrix projects, targeted.

## Additions of 2026-11-11 (coordinator): D1 to D5, from the review of batch e24p at `e5fdde82`

Same rules as the items above (verify first, red first, no golden may move; if one would, stop that item and write the diff here). D1 is the most important fix of the batch. The ids D1 to D5 are the coordinator's; the Design Notes above are N1 to N4.

| Id | Input / State | Expected |
|---|---|---|
| D1 (high) | a failed test's place (Story 24.17, `apps/web/src/surfaces/ficha/point-place.tsx:33-52`); tap "Criar ponto de atenção"; type one word in Texto or Ação and pause past the 500 ms autosave, or tap a priority | the autosave creates the point (`point-editor.tsx:275-308` `persist`; `point-writes.ts:118-121`, `:166-173`) and the dialog stays open; "Concluir" closes it and the focus lands on the "Ponto de atenção N" span; nothing typed is lost |
| D1 | the not-tested band (`not-tested-band.tsx:63-72`), same steps | if it has the same defect (the action unmounts once `hasNotTestedPoint` turns true), same fix and same expectation, focus as its `focusAfterSave` says |
| D2 (medium) | v14, the joined recommendations of a sheet point's action longer than `TEXT_CAPS.medium` (1 000), or one recommendation of exactly 1 000 characters that gains its final period (`points/derived.ts:439`, `seed/test-help.ts:146`) | the action is empty and the recommendations start the text (Story 23.11's form) if that text fits the point text's own cap; if not, the point starts with the finding alone; "Concluir" never stores a create the server refuses (`op_value_invalid`) |
| D3 (medium) | equipment with visit B (service 2026-09-30) issued, then visit A (service 2026-03-14) issued late; or A still open | A's sheets, preview and document read no visit later than A's own service date as previous: `previousResultsFor` (`print/reading-slots.ts:102-108`) takes the reading relatório's visit date; when the top entry is later, it reads the top's `prior` if older, else nothing; the screen helper, the judgement (drops, rises, note line) and the print (`print/section-9.ts:1134`) agree. Listed for Matheus: e24p's ledger row called this his decision; the coordinator took it as a defect (a signed document naming a later visit as the previous one) |
| D5 (low) | a live `restricao` point of a test exists; a reading of that test then goes out (the finding becomes `reading`) (`points/derived.ts:434`) | the place shows that point ("Ponto de atenção N"), not "Criar ponto de atenção": a live point of the same test with origin `reading` or `restricao` is that test's point (one action per test, Story 24.17) |
| D4 (ledger only) | top entry from before Story 24.15 (service 2026-11-03, issued 2026-11-10, no `service_date`); a re-test with service 2026-11-08 issued after the deploy | no code: a `deferred-work.md` row (owner Matheus): it compares as older than the entry's issue day and is filed as its prior (`print/visit-date.ts:36-45`, `print/last-results.ts:155-158`; e24p Design Notes D4) |

**Tasks:**
- D1 -- `point-place.tsx` (and `not-tested-band.tsx` if it has the defect): keep `CreatePointAction` mounted while its dialog is open (for example it hides only its button once the point exists), then the span; the focus after "Concluir" as `focusAfterSave` says. Tests: an e2e step in the Story 24.17 spec (grep `24.17-E2E` in `e2e/`) that types, waits past the autosave, expects the dialog still open, taps "Concluir" and expects the focus on the span, asserting the stored point; the `point-place` unit test rewritten over a live snapshot (the point appears while the dialog is open) instead of a static one; the same for the band if fixed.
- D2 -- `points/derived.ts` `sheetPointFindings`: the cap rule above, read from `TEXT_CAPS` (no new number); kernel tests at 999, 1 000, 1 001 characters and the one-recommendation-of-1 000 case. Correct e24p's ledger row ("the create is refused until the technician shortens it") with a dated strike-through.
- D3 -- `print/reading-slots.ts` `previousResultsFor` takes the relatório's own visit date (`print/visit-date.ts`), and every caller passes it (screen, judgement, print); kernel tests (B then A issued; A open; A's date unknown: as today); the e2e 24.15-E2E-002 extended to read A's document (or a new `@p1` case beside it). If a golden would move, stop D3 and write the diff here.
- D5 -- `points/derived.ts:434`: the position lookup counts a live point of the test with origin `reading` or `restricao`; kernel test red first.
- D4 -- ledger row only.
- Acceptance: the red runs of D1 (unit over a live snapshot, and the e2e step), D2, D3, D5 on the baseline code; green after; the e2e specs of Stories 24.15 and 24.17 join the touched specs.

## Spec Change Log

## Review Triage Log

## Design Notes

**N1. A1: the seed's phrases alone are automatic.** A text alone cannot tell a tapped learned or recent chip from the same words typed, and decision 17 says a text equal to one typed on another sheet is edited. So `ncObservationOnLeave` judges against the item's seed phrases (`item.nc_phrases` of the row's definition; a site item's own), joined as `insertPhrase` joins them, a final period aside. It reads only stored text, so two devices and an offline device answer the same, with no op-id or clock cut and no fold change. Cost, listed for Matheus: a tapped learned or recent chip, untouched, is now kept with the warning (one tap "Apagar observação" removes it, with "Desfazer"), where Story 24.6 cleared it; a seed phrase typed letter by letter still reads as automatic (indistinguishable without a stored provenance, which would be a contract). A2: a text still being saved (`typed.text !== stored`) is `keep` when non-blank: its own commit lands after any clear, so clearing it is never safe.

**N2. B1: a floor of 1 KB/s.** One constant, no change to `withRetry`. 300 KB at 2 KB/s needs about 150 s; the bound becomes 60 + 300 = 360 s. A hung push of 4 MiB holds its cycle up to about 69 min (was 572 s), a body-less request still 60 s. A doubling per attempt was not taken: it only lasts the three attempts of one cycle.

**N3. B4: one family.** The family of a type is its seeded base: a seeded type is its own base; a company type's base is its latest published definition's `base_block_type` (as `hidingCopies` reads it), followed while it names a company type. `free(row)` accepts a row whose type's family equals the block's. The equipment row keeps its `type` (nothing rewrites it). Before building, list every reader of `equipment.type` and say in the Auto Run Result what each does with a block whose type differs from its equipment's; previous-visit values read by test key show where the new type has the test and simply do not show elsewhere. If any reader breaks, stop B4 (Boundaries).

**N4. Decision 17: the composer's way back.** In the composer palette, a seeded type that `hidingCopies` hides and that the template places (`placedTypes`) is drawn right after its copies as a `PaletteEquipmentRow` with the "Editar padrões" button, its meta the type list's existing kernel line ("Oculto nas paletas: a cópia … está publicada."), and its stepper disabled with that line as its reason (`disabledReasonId` pointing at the meta). It offers nothing new to place, so Story 24.19 holds; it leaves once the template no longer places it or the copy is retired. The kernel answers which hidden types to draw (a small function beside `hidingCopies`, or an option of `paletteTypeGroups` used by the composer only).

## Verification

**Commands (in `fasor-e24x`, under the host lock, logs in `.scratch-e24x/`):**
- `pnpm lint`, `pnpm static` -- exit 0.
- `pnpm test:unit` -- all pass.
- `pnpm test:api` -- all pass (api restarted first).
- `pnpm exec tsx scripts/e2e.ts e2e/nc-phrase-follows-item.spec.ts e2e/sync.spec.ts e2e/nominal-tolerance.spec.ts e2e/pass-screen-fixes.spec.ts e2e/equipment-history.spec.ts e2e/copied-type-hides-original.spec.ts e2e/company-type-sheet.spec.ts e2e/tag-suggestion.spec.ts <every other spec touched or driving the checklist rows of a ficha and a local, a measurement and a readings table with a range criterion, both palettes, the composer> --project desktop-chrome --project durability-desktop-chrome` -- all pass.
- The durability specs driving the checklist rows or the sync client, targeted, on `pnpm test:e2e:matrix` -- all pass.

## Auto Run Result

*(2026-11-11, implementation subagent, branch `e24x-review-fixes`; no fold change, no contract, no golden or fixture touched.)*

**Built, item by item:**
- **A1/A2** -- `relatorio/ficha.ts` `ncObservationOnLeave(from, to, stored, seedPhrases, typed = stored)`: `clear` only for a stored observation made of the item's seed phrases alone (N1); a pending text (`typed !== stored`) is `keep` when non-blank, null when blank. `learnedBefore` (`registry/nc-phrase-row.ts`), the target's `leaveChips` and the e24b test of `learnedBefore` are gone; `ChecklistRowTarget.seedPhrases` is passed by `sheetRowTarget` (`item.nc_phrases`) and the site row (`row.nc_phrases`).
- **A5** -- `checklist-section.tsx`: the kept record lives in `sessionStorage` under `ficha:kept:{relatorio}:{block or local}:{item}` (`KEPT_KEY_PREFIX`, `state/user-storage.ts`, cleared by `clearUserStorage` at sign-out), read on mount, dropped once the row no longer matches it after the warning showed (or at mount when it no longer matches), and by "Apagar observação"; every access in try/catch.
- **B1** -- `SYNC_REQUEST_FLOOR_UPLINK_BYTES_PER_S` = 1024; 300 KB gets 360 s, 4 MiB 4 156 s (about 69 min), a body-less request 60 s; comment and test title corrected.
- **C1** -- `overRangeVerdict` reads `value_max`: a `between` limit at or above the upper end is `out`, else null; `overRangeAnswer` measures an out range limit from the upper end. A null over-range capture withholds the floor and reads "a conferir": on a reading table through `conclusion.ts` `overRangeUnjudged` (tests with a criterion), on a measurement test through its `unjudged` flag (the cells an absolute or max-field criterion could not judge). The out clause reads "acima de 200 MΩ (limite do instrumento)", the wording a `>` limit already had.
- **A3** -- `composeConclusion`: the group's "a conferir" clause needs a measured capture in the waiting table; the floor is untouched (still null, by the floor's own e21g D6 rule).
- **A4** -- `ncObservationOnOneLine`: a line ending in ":" joins the next with a space.
- **B3** -- `ops/value-limits.ts`: the `equipment` row's `reuse_key` is medium (1 000). `equipment/field` cannot write the key (`EQUIPMENT_FIELDS` is `tag` and `removed_at`), so it is unchanged. The longest key the reuse builds (`ABCDEF-` + a 200-character local + `-10`, 210 characters) passes in the kernel and through the push route.
- **B4 -- stopped (Boundaries), nothing changed.** Readers of `equipment.type`: only `instantiateTemplate`'s `free` reads it. But the previous visit refuses a cross-type binding by another field: `print/reading-slots.ts` `previousResultsFor` returns null when `last_results.block_type` differs from the sheet's block type ("the equipment changed type"), so a copy's sheet bound to the library breaker's equipment would show no "Anterior", print no MANUT. ANTERIOR and judge no history rule, against the I/O row. Making it family-aware needs the company's definitions in `previousResultsFor` and `visitContextOf` (14 callers, 6 of which hold no definition context: `use-ficha-data.ts`, `use-ficha-actions.ts`, `conclusao-section.tsx` twice, `sheet-progress.ts`, `merge/conflicts.ts`; the memo keys on the block type alone). Also a copy's prefix is `TAG_PREFIX` (SC) where a library row's key used `LEGACY_TAG_PREFIX` (SEC), so a seccionadora copy never finds the library key, and an edited prefix finds none. The other readers named in the spec do not read `equipment.type`: the TAG suggestion counts TAGs, the move reads the block, the print groups by `block.block_type`. Ledger row added for Matheus.
- **C2** -- `reading-run.ts` `rangeOf`, `rangeScore`: outside a range, the distance from the nearer end relative to it (above zero); inside, at most zero, nearer an end ranks worse; for a test's or a row's own criterion.
- **C3** -- `types/palette-meta.ts` `paletteMetaText(company, parts)`; both palettes call it; `copy.sumario.palette.libraryMeta` and `companyMeta` removed (struck through in `pt-br.ts`).
- **D17** -- `types/palette-meta.ts` `composerHiddenTypes(ctx, seed, placed)`; `block-palette.tsx` draws each right after its last copy as a `PaletteEquipmentRow` (`data-hidden-type`), meta the type list's line with an id, "Editar padrões", the node's count, the stepper disabled with the meta as its reason.
- **C4** -- 24.9-E2E-004 repeats the edge checks at 768 px and asserts the table's scroll width equals its client width and the page has no sideways scroll (test-only).
- **Test gap** -- `checklist-row.test.tsx`: the asked point removed meanwhile closes the question and writes the result alone (test-only; passes on the baseline too).

**Red runs on the baseline** (`.scratch-e24x/red-unit.log`, tests written first, run before any source change: 10 files, 20 failed, 158 passed): A1 (`checklist-row.test.tsx` "a typed text the server learned…" and "an observation equal to another sheet's": the batch held the observation clear), A2 (the kernel's two pending cases; the web case "a chip tapped and C tapped before the observation is stored"), A3, A4, A5 ("remounted with the same result and observation"), B1 (both cases), B3 (kernel), C1 (the three new cases and the amended 24.18 case at `nominal-tolerance.test.ts:204`), C2 (both), C3 (the field and the composer cases; `palette-meta.test.ts` failed to load), D17 (web). Tests that pass on the baseline by design: A5's three drop cases, the A1 seed-chip case, the A2 blank case, the test gap, C4. The B3 api case and the e2e cases were written before the fix but run only after it (the host lock's queue); their rows' reds are the kernel and web ones above.

**Changed tests (one line each):**
- `relatorio/observation-on-leave.test.ts` -- rewritten: the `learnedBefore` test goes with the function (A1); it now holds the A1/A2 kernel matrix.
- `types/nominal-tolerance.test.ts` 24.18 "judges a reading above the instrument's limit as the range row does" -- now also asserts `out` (C1, as the spec asks).
- `checklist-row.test.tsx` -- the hand-built target gains `seedPhrases` (the new required field), the harness's rerender takes the points, and `afterEach` clears `sessionStorage` (A5 records).
- `company-types-e24c.test.tsx` 24.19 composer case -- counts the rows that are not the hidden original (`:not([data-hidden-type])`): with decision 17 the standard template's transformers bring the hidden row back; `freshDb` takes a definition.
- `client.test.ts` "a push at SYNC_PUSH_MAX_BYTES gets about 8,5 min" -- retitled and recomputed for the 1 KB/s floor (B1).

**Authored pt-BR sentences:** none. "Tipo da empresa" is the mock's (`40-relatorio-overview.html`), now held by the kernel (`COMPANY_TYPE_PALETTE_MARK`); the hidden row reuses e24c's `hiddenTypeText`.

**Green runs** (under the host lock, `fasor-e24x`, api restarted first; logs in `.scratch-e24x/`):
- `green-unit-1.log`: the touched kernel and web files, 16 files, 303 of 305 (two test assertions corrected: the out clause's wording and React Aria's `aria-disabled` stepper); `pnpm static` clean.
- `green-unit-2.log`: 18 touched or neighbouring files (the e24b NC-phrase and point-question tests, the site checklist, both palettes, the composer palette), 326 of 326; `pnpm lint` 0 errors (26 warnings, none in a touched file).
- `green-api-1.log`: `value-limits.integration.test.ts` and `equipment-reuse-key.integration.test.ts`, 13 of 13.
- `green-e2e-1.log`: `scripts/e2e.ts` over nc-phrase-follows-item, sync, nominal-tolerance, pass-screen-fixes, equipment-history, copied-type-hides-original, company-type-sheet, tag-suggestion, learned-options, verificacoes-local, point-question and templates, on `desktop-chrome` and `durability-desktop-chrome`: 57 of 57 (parallel 32, queue 25), e24x-E2E-001, e24x-E2E-002 and the extended 24.9-E2E-004 among them.
- Not run here (the orchestrator's gate): the full `test:unit` and `test:api`, and the matrix projects for the durability specs of the checklist rows and the sync client.
- Goldens and fixtures: `git diff e5fdde82 --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` is empty.

**Listed for Matheus:** A1's cost (a learned or recent chip tapped untouched is now kept with the warning; a seed phrase typed letter by letter still clears), B1's longer hold of a hung push, B4 stopped, B2's row: all in `deferred-work.md` § e24x.

