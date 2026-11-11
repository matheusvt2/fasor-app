---
title: 'e24f: the Epic 23 retrospective''s review fixes (R-1, R-3, R-4, R-5, R-7, R-8, R-9) and the tests red under load (E23-A4; contract 42)'
type: 'bugfix'
created: '2026-11-10'
status: 'in-progress'
baseline_revision: '1528183f3abfc76b842dcf3fc79bce86142db1ae'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-retro-2026-11-10.md'
warnings: ['batched', 'multiple-goals']
batched_reason: 'The Epic 23 retrospective''s seven review findings (E23-A1) and its test-hardening list (E23-A4) run as one fix batch, as Matheus approved on 2026-11-10 (epic-24-context.md § Fix batch e24f): one spec, one gate, one PR.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 23 retrospective (`epic-23-retro-2026-11-10.md` § Diff-scope review) found seven defects and test gaps (R-1, R-3, R-4, R-5, R-7, R-8, R-9) and eight tests that went red under load in two or more gates (E23-A4). The main one, R-1, is a wrong sentence in a document the engineer signs: the conclusion paragraph says "valores medidos dentro dos critérios de aceitação" while a measured reading was judged by no criterion.

**Approach:** Red first, item by item: each item gets a test that fails on `1528183f` before its fix. Kernel fixes for R-1, R-3 and R-5 (R-5 widens what the fold accepts, so contract 42 with MIN 42); tests only for R-4, R-7, R-8, R-9; for each load-red test, find the cause, then fix the product (if a wait can stall) or the test's wait (if only a starved browser), never a longer timeout over a real wait.

## Boundaries & Constraints

**Always:**
- What changed just before (fix batch e24h, contract 41): a point of attention exists only when a person creates it; an observation never sets the conclusion floor. Write every test to that; undo nothing of it.
- AD-1/AD-13: every text, verdict, helper and count is the kernel's (`packages/domain`); `apps/web` renders. Every pt-BR sentence authored here is marked `// authored (e24f, listed for Bruno)` and listed in the PR.
- English code and docs; no emoji; no batch tags or story ids as inline comments in new code beyond the repository's existing "Fix batch e24f (R-n):" convention for kernel rule comments.
- Each changed or rewritten test gets one line of reason in this spec's Auto Run Result ("Changed tests").
- `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`. The repository is public: nothing from `docs/context/`.
- Commands: `podman compose --profile tools run --rm --user root tools pnpm ...` in this worktree (compose project `fasor-e24f`, from `.env`); every unit, api or Playwright run under `nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'`, logged in `.scratch-e24f/`, polled with bounded loops of at most 55 s. `podman compose restart api` after any change under `packages/domain` or `apps/api`, before `test:api` or an e2e. Narrowest suite while iterating (`pnpm exec vitest run --project @app/web <file>`, `pnpm exec vitest run <kernel file>`, one spec with `--grep`). Spec paths go before `--project` with `scripts/e2e.ts`.

**Never:**
- Never touch the main checkout (`/Users/matheusvilella/Documents/estudos/fasor-app`) or its stack `fasor`; never `docker`; never `down -v`; never build an image.
- Never edit `epics.md`, `source-deltas.md`, `epic-24-context.md`, the sprint change proposal or `sprint-status.yaml`.
- Never change behaviour outside R-1, R-3 and R-5. No seed change: `V13_HASH` and every `V*_HASH` stay.
- Goldens: the layout-lock goldens (v5, v11, v12) and the Porto Seguro goldens (`apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json`, `packages/domain/fixtures/porto-seguro/*.golden.json`) stay byte-identical. Only if R-1 changes a sentence in a layout-lock golden: regenerate that golden alone with `GOLDEN_UPDATE=1` and keep the before and after text for the PR. If a Porto Seguro golden would change, do NOT regenerate: drop the part of R-1 that moves it and report.
- Out of scope: Epic 24's stories, the pass findings F6 and F9 to F20, the deferred half of R-9 (stays in the ledger), anything not named here. A new defect found is reported in the Auto Run Result, not fixed.
- Never cure a load-red test by raising a timeout over a real wait.

## I/O & Edge-Case Matrix

| Item | Input / State | Expected |
|---|---|---|
| R-1a | v13 seccionadora SOB CARGA COM FUSÍVEIS, `resistencia_fusiveis` A = 0, B = 10, C = 10 mΩ (`e23z-final-fixes.test.ts:182-188` row) | floor null (as today); `composeConclusion(...).text` holds "valores medidos com leitura a conferir", never "dentro dos critérios de aceitação"; cell A carries a non-null `helperText` (a "Conferir: ..." sentence) and verdict null; B and C unchanged |
| R-1a | a lone positive phase in a group; every cell while the medium is unknown (the test's `unjudged` set) | same text; each measured number cell left with no verdict and not `toCheck` carries the helper; the screen draws it (`measurement-test-section.tsx` renders `cell.helperText`) |
| R-1a | same sheets, every cell judged (A = 10) | text unchanged: "dentro dos critérios de aceitação"; no helper |
| R-1b | a seeded test with no criterion (Story 14.9: a QGBT with no TENSÃO NOMINAL) holding a measured capture, while another test's capture was judged within | text "valores medidos com leitura a conferir" (today: "dentro dos critérios"); with nothing judged the existing "sem comparação com o critério de aceitação" text stays |
| R-1 | the basis (`ComposedConclusion.basis`) | unchanged by this fix for every input (no new key): a text already confirmed keeps printing as confirmed; the composed text alone changes (Design Notes D1) |
| R-1 | out readings, restricted readings, `toCheck` cells | their existing branches win as today (an out clause before "a conferir") |
| R-3 | an imported company type whose insulation test carries `index_recommendation`; `setDraftTestRecommendation(draft, part, i, value)` with any value, blank included | the test's `index_recommendation` is deleted alongside the write; a test without one is unchanged otherwise |
| R-3 | a draft not edited | `index_recommendation` kept (import, duplicate untouched) |
| R-4 | the e23z W3-3 test's cable copy, with no hand-written `role`/`feeds_block_id` | it prints in the seccionadoras subsection, unpaired; the transformadores subsection holds the transformer copy alone; the narrowing is a `deferred-work.md` row |
| R-5 | device A clears an off-plate TTR row ("Apagar leitura", put null on each filled column) and syncs; device B clears the same row offline and syncs later | B's ops are accepted (not `op_invalid`), the block row on the server is unchanged by them (deep-equal before and after), B's outbox rows end `acked`, not dead |
| R-5 | a `remove` op on an off-plate row holding nothing | accepted, no-op |
| R-5 | a non-null put on an off-plate row | still refused (`op_invalid`) |
| R-5 | a version-41 pull | 426 `contract_outdated`; 42 answered; a version-41 push still accepted |
| R-7 | a pending op in the outbox; every pull answers 426; the push fails too (held or 5xx) | the "Atualização necessária" surface shows; "Atualizar" reloads the page; the outbox row survives the reload (still pending); once the stubs go, the op reaches the server and the row is acked |
| R-8 | the v13 insulation print test with one more sheet: every capture column filled (1 MINUTO, 10 MINUTOS or the table's other capture columns, ACEITÁVEL, MANUT. ANTERIOR where the table has it) and long values | the PDF holds each long value whole in its cell, no column overflows (`wordsWiderThanColumns` empty), the DOCX holds the same words |
| R-9 | two live v13 transformers in one relatório, the first with its plate and both day-measured fields filled; on the second, "Igual à ⟨TAG⟩?" accepted | every copyable field written to the second (outbox ops), no op on any `DAY_MEASURED_NAMEPLATE_KEYS` field the type has, the toast counts the copied fields only |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/conclusion.ts` -- `computeFloor` `:154-196` (the floor's withheld cases: `toCheck` `:181`, test `unjudged` `:184`, the Story 14.9 criterion-null capture `:190-193`); `composeConclusion` `:528-660`, the readings sentence `:563-574` (`judged`, `toCheck`, `unjudged` texts), the basis `:618-660` (do not add a key).
- `packages/domain/src/relatorio/measurement-evaluation.ts` -- `evaluate` `:1136-1252`; the test-level `unjudged` `:1208-1213` (live, a `phase_deviation` criterion, a measured number cell with verdict null and not `toCheck`); `markPositiveOnly` `:609-623` is the precedent for a "Conferir:" helper sentence on a cell; `EvaluatedMeasurementCell.helperText`/`toCheck` `:181-200`.
- `apps/web/src/surfaces/ficha/measurement-test-section.tsx` `:554`, `:612` -- already render `cell.helperText`; no web change expected for R-1.
- `packages/domain/src/relatorio/e23z-final-fixes.test.ts` -- W3-2 floor test `:182-188` (extend or add beside it in `conclusion.test.ts`); W3-3 test `:192-268` with the hand-written role `:231-232` (R-4).
- `packages/domain/src/print/group-for-print.ts` `:403-407` -- a `cabos_saida` (or a copy based on it) without role `alimentacao` goes to the seccionadoras.
- `packages/domain/src/types/draft-edit.ts` `setDraftTestRecommendation` `:538-545` (R-3); `types/test-base-import.ts:294` the only writer of `index_recommendation`; `seed/test-help.ts:108-115` its reader; `points/derived.ts:170-176`.
- `packages/domain/src/ops/apply.ts` `assertCellGeometry` `:579-610` (the `rows_from` branch `:592-600`); `packages/domain/src/relatorio/tap-rows.ts` `tapRowClearable*` `:233-256`.
- `packages/domain/src/ops/materialize.ts:32-46` -- a pulled op the client fold refuses throws (only a local `SeedPathError` is skipped): that is why R-5 needs contract 42 with MIN 42 (a version-41 bundle would fail to fold the newly accepted clears it pulls).
- `packages/domain/src/contract/version.ts` `:478`, `:755` and their comment blocks (copy 41's shape); `packages/domain/src/contract/contract.test.ts:105-115`; `apps/api/src/sync/sync.integration.test.ts` 1.5-API-005 (`:1116`) and its existing off-plate clear cases (grep `Apagar leitura`/`tapRowClearable`); `apps/api/src/sync/three-levels.integration.test.ts` (any `toBe(41)`). `grep -rn "toBe(41)\|'41'" packages apps e2e` for every other pin.
- `apps/web/src/surfaces/contract-outdated-surface.tsx`, `apps/web/src/app.tsx:58-62`, `apps/web/src/sw/use-shell-update.ts` -- R-7; `e2e/sync.spec.ts:130-183` (1.5-E2E-003) is the pattern.
- `apps/api/src/jobs/generate/v13-insulation-print.integration.test.ts` `:135` (the one column written), `:252-271` (the pins) -- R-8.
- `packages/domain/src/relatorio/nameplate-copy.ts:49-53` (`DAY_MEASURED_NAMEPLATE_KEYS`), `suggestNameplateCopy`; `e2e/v13-nameplate.spec.ts:320-360` (e23p-E2E-001, the "Copiar da última visita" pattern) -- R-9.
- Load-red tests (E23-A4): `e2e/seed-v11.spec.ts` 21.1-E2E-002; `e2e/review-photo-failures.spec.ts` R8CAP-E2E-010; `e2e/export.spec.ts:290-316` 4.8-E2E-005 (the job finished in 1.6 s, then no request from the device for 150 s: read the Export dialog's job poll and its retry path after "Tentar novamente"); `e2e/review-layout-interaction-2026-10-08.spec.ts` R8LAY-E2E-008; `apps/web/src/surfaces/relatorio/setup-surface.test.tsx` (the exclusion typing); `apps/web/src/state/reading-arrivals.test.tsx` (the caption toast); `apps/web/src/surfaces/home/home-surface.test.tsx` (12.2 "Continuar"); `apps/web/src/surfaces/relatorio/relatorio-tree-edges.test.tsx` ("Desfazer after a move focuses the row's Position box"). Evidence rows: `deferred-work.md:3011-3014`, `:3312-3318`, `:3526-3530`. `e2e/support/groups.ts` (`SERIAL_SPECS`) when a spec times a wait against a render.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- this batch's own section at the end; close the retrospective rows it fixes (strike through, dated text).
- `docs/kbs/log.md` (one line) and the KB concept for the conclusion/kernel (`docs/kbs/architecture/kernel-and-seed.md`: the contract line 41 -> 42, and R-1's paragraph rule).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/conclusion.test.ts` (or a module-named file beside it) -- red tests for R-1a and R-1b and the unchanged-basis row -- they fail on the baseline.
- `packages/domain/src/relatorio/measurement-evaluation.ts` -- every cell the test-level `unjudged` rule counts gets a "Conferir: ..." `helperText` (one authored sentence, verdict stays null, `toCheck` stays false so `unjudged` keeps reading it) -- R-1a's helper.
- `packages/domain/src/relatorio/conclusion.ts` -- the readings sentence takes the `toCheck` text when a live measurement test is `unjudged` (R-1a) or when a seeded test with no criterion holds a measured capture (R-1b, the floor's `:190-191` first clause, not the `groupMissing` one); no basis key added -- the paragraph says only what the floor says.
- `packages/domain/src/types/draft-edit.ts` + `draft-edit.test.ts` -- R-3: `setDraftTestRecommendation` also deletes `index_recommendation`; unit test red first. Plus a web test only if the editor surface needs one to prove the path (`apps/web/src/surfaces/templates/type-editor-test-texts.test.tsx`).
- `packages/domain/src/relatorio/e23z-final-fixes.test.ts` -- R-4: drop the hand-written role and `feeds_block_id`, assert the product's grouping (cable copy with the seccionadoras, transformadores alone); the test title says so.
- `packages/domain/src/ops/apply.ts` (+ `tap-rows.ts` if a helper is wanted) -- R-5: on a `rows_from` table, a clear (remove, or put of null) on a row off the plate is accepted whatever its cells hold; on a row with no filled cell it returns the state unchanged (a true no-op); a non-null put stays refused. Kernel unit tests (put null twice, remove, non-null refused) red first.
- `packages/domain/src/contract/version.ts`, `contract.test.ts`, `apps/api/src/sync/sync.integration.test.ts` (1.5-API-005 and a new two-device R-5 case through the push route), every other pin of 41 -- contract 42, MIN 42, comments in 41's shape.
- `e2e/sync.spec.ts` -- R-7: one Playwright case (tag `@p1`), the I/O row above, asserting the outbox store, not only the screen.
- `apps/api/src/jobs/generate/v13-insulation-print.integration.test.ts` -- R-8: the extra sheet and its pins (PDF and DOCX).
- `e2e/v13-nameplate.spec.ts` -- R-9: one `@p1` case, "Igual à" between two v13 transformers, asserting the outbox (no op on a day-measured key) and the toast.
- The eight load-red tests -- per test: reproduce or reason the failing state from its evidence, name the cause, fix (product if a wait can stall; else the test's wait on the right condition); record cause and fix in the Auto Run Result.
- `deferred-work.md`, `docs/kbs/log.md`, `docs/kbs/architecture/kernel-and-seed.md` -- as in the Code Map.

**Acceptance Criteria:**
- Given the baseline `1528183f`, when the new R-1, R-3, R-4 (rewritten), R-5 and R-8 tests run, then each fails; after the fix each passes (record the red run per item).
- Given any sheet on v1 to v12 with no unjudged reading, when its conclusion composes, then text and basis are byte-equal to the baseline; the layout-lock and Porto Seguro goldens stay byte-identical (else the Never rule applies).
- Given a hardened test, when it runs `--repeat-each 3` under the host lock, then 3 of 3 pass (unit tests: three repeated runs of the file), recorded.
- Given the story gate (lint, static, test:unit, test:api, the touched and surface-driving specs on `desktop-chrome` and `durability-desktop-chrome`), when it runs under the lock, then it is green; the durability specs touching the off-plate clear also run on `pnpm test:e2e:matrix` targeted (E10-A4, R-5 is a fold change).

## Spec Change Log

## Review Triage Log

## Design Notes

**D1. R-1 and the basis.** `printedConclusionText` prints a confirmed text while its basis matches; a basis change would make every v13 paragraph already confirmed with the wrong sentence read stale and stop printing (or print the composed one) with no word from the engineer. So the basis stays; only the composed text changes. A paragraph confirmed before the fix keeps its words (the engineer confirmed them); listed for Matheus as an open question in the PR.

**D2. R-1b scope.** The Story 14.9 criterion-null capture is the same wrong sentence on the seeded-reading path (the floor already withholds there, `:190-193`). It is in R-1 because R-1 is worded on the reading, not on one flag. Its cell keeps the existing test-level "critério não avaliado" note; no new helper. If R-1b alone moves a layout-lock golden, show the text before and after; if it moves a Porto Seguro golden, drop R-1b and report.

**D3. R-3 choice.** No frame in `43-tipo-equipamento.html` shows a second recommendation field for the polarization index, so the type editor does not show it. The smallest change: any write of a test's "Recomendação se reprovado" in the editor also clears `index_recommendation`, so no future created point (Story 24.17) starts from a text nobody can see. An untouched imported copy keeps it.

**D4. R-5 and the contract.** Accepting a clear the fold refused is a fold change: a version-41 bundle pulling B's newly accepted clear throws in `materializeEntity` (`ops/materialize.ts:42-44`). Contract 42 with MIN 42 (the coordinator moves Epic 24's reserved numbers up by one). The no-op on an empty row keeps every device's state equal.

**D5. 4.8-E2E-005.** First the cause: the job finished in 1.6 s and the device sent no request for 150 s after. If the dialog's poll can stop or wait past its schedule (a timer cleared on the retry, a backoff that grows, a poll gated on a state the retry never resets), that is a product defect: fix the poll and say so in the PR. If the poll was scheduled and only the starved browser did not run it, fix the test's wait.

## Verification

**Commands (in `fasor-e24f`, under the host lock, logs in `.scratch-e24f/`):**
- `pnpm lint`, `pnpm static` -- exit 0.
- `pnpm test:unit` -- all pass.
- `pnpm test:api` -- all pass (the api restarted first).
- `pnpm exec tsx scripts/e2e.ts e2e/sync.spec.ts e2e/v13-nameplate.spec.ts e2e/ttr-per-tap.spec.ts e2e/ficha.spec.ts e2e/test-recommendation.spec.ts e2e/test-help.durability.spec.ts e2e/export.spec.ts e2e/seed-v11.spec.ts e2e/review-photo-failures.spec.ts e2e/review-layout-interaction-2026-10-08.spec.ts <any other touched or surface-driving spec> --project desktop-chrome --project durability-desktop-chrome` -- all pass.
- Each hardened e2e with `--grep <id> --repeat-each 3`; each hardened unit file three times -- 3 of 3.
