---
title: 'e24f: the Epic 23 retrospective''s review fixes (R-1, R-3, R-4, R-5, R-7, R-8, R-9) and the tests red under load (E23-A4; contract 42)'
type: 'bugfix'
created: '2026-11-10'
status: 'done'
baseline_revision: '1528183f3abfc76b842dcf3fc79bce86142db1ae'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-retro-2026-11-10.md'
warnings: ['batched', 'multiple-goals']
batched_reason: 'The Epic 23 retrospective''s seven review findings (E23-A1) and its test-hardening list (E23-A4) run as one fix batch, as Matheus approved on 2026-11-10 (epic-24-context.md § Fix batch e24f): one spec, one gate, one PR.'
deferred:
  - summary: >-
      send() (photo uploads, thumbnail and file downloads) has no time bound, so an upload or thumbnail answer that never comes can still hold the single-flight sync cycle.
    evidence: |-
      Pre-existing; whether it caused 4.8-E2E-005 is unproven. Settled by a trace of a held cycle in an upload or thumbnail phase. Ledger row in deferred-work.md, e24f section.
    location: >-
      apps/web/src/sync/client.ts send
    severity: medium (unverified)
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

### 2026-11-10 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter and Intent Alignment (token economy; the integrated epic review covers them).

- verdicts: 9 findings — high 0, medium 4, low 3, false 0, maybe-false 2
- findings:
  - `[maybe-false]` `[defer]` ECH: `send()` (uploads, thumbnails) has no bound, so an upload or thumbnail answer that never comes can still hold the single-flight cycle — pre-existing, and whether it is the 4.8-E2E-005 cause is unproven; if true, medium (unverified). Ledger row added in the e24f section.
  - `[medium]` `[patch]` ECH: the 60 s timer covered the whole request (upload and answer), so a push near 4 MB on an uplink under about 70 KB/s aborted every time — the timer now bounds only the wait for the response headers, extended by the body's bytes at a floor uplink rate; the answer's body is not bounded.
  - `[medium]` `[patch]` ECH: a large pull page on a slow link was cut at 60 s total and re-requested forever — same patch (the body download is no longer bounded).
  - `[medium]` `[patch]` ECH: a v11+ ratio table waiting for its vector group (`groupMissing`) withholds the floor while the paragraph still says "dentro dos critérios" beside a judged capture — the same condition joins the "a conferir" branch (R-1c), basis unchanged.
  - `[low]` `[reject]` ECH claim: the rewritten R-4 and the R-8 tests are not red on the baseline — true and stated in the Auto Run Result: both items are test-only by the retrospective's disposition, so no red run can exist; nothing to fix.
  - `[low]` `[reject]` ECH claim: the R-9 matrix row says the toast counts the copied fields, the product says "Copiado de ⟨TAG⟩" — the row misdescribed the existing toast (R-9 changes no behaviour); the test asserts the product; listed in the PR.
  - `[maybe-false]` `[reject]` ECH claim: R-7 accepts `pending` or `sent` after the reload — a row left `sent` passes; the test then removes the stubs and asserts the op on the server and the row acked, so a stuck `sent` would still fail there; if true it would be low.
  - `[medium]` `[patch]` VG other: R8LAY-E2E-008 now repeats its press until the dialog opens, so a press lost on a Home that looks ready no longer fails any test, and no ledger row says so — ledger row added; the Epic 21 row no longer reads as closed by a fix.
  - `[low]` `[patch]` VG other: `e24f-INT R-8` read state set by the file's first test and failed run alone — made independent.

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

## Auto Run Result

Status: done (verification below; review not run)

- **Kernel (contract 42, MIN 42).**
  - R-1a: `measurement-evaluation.ts` gives every cell the test-level `unjudged` rule counts the helper `UNJUDGED_DEVIATION_HELPER` (verdict null, not `toCheck`). R-1a and R-1b: `conclusion.ts` takes the "valores medidos com leitura a conferir" text when a live measurement test is `unjudged`, or, beside a judged capture, a seeded test with no criterion holds a measured capture; an out clause still wins; the basis is unchanged (pinned on the baseline: `8e3e4180`, `ab0f8a70`).
  - R-3: `setDraftTestRecommendation` also deletes `index_recommendation`.
  - R-5: `assertCellGeometry` takes a clear on an off-plate row whatever it holds; with no filled cell `writeSheet` returns the block unchanged (a true no-op); a value stays refused. A `remove` on a cell path is refused by the op schema before the fold, so its fold branch is pinned by a kernel test only.
- **Red on the baseline (kernel code of `1528183f`, `.scratch-e24f/red-kernel.log`, `red-r1.log`):** R-1a (3 cases), R-1b (1 case), R-3, R-5 (the new two-device case and the changed e23z item 3 case) failed; after the fix all pass (`green-kernel.log`). R-4 cannot be red: it is test-only and asserts what the product already does. R-8 is test-only too (no print change), so it passes on the baseline as on the fix.
- **Authored for Bruno:** "Conferir: leitura sem comparação com as outras fases, sem critério aplicado" (the helper); the existing "valores medidos com leitura a conferir" reused on two new paths.
- **Changed tests (one line each):**
  - `e23z-final-fixes.test.ts` W3-3: the hand-written role and `feeds_block_id` dropped; asserts the cable copy with the seccionadoras, unpaired, the transformer copy alone (R-4).
  - `e23z-final-fixes.test.ts` item 3: a null put on a row never stored, and on the emptied row, is now an accepted no-op, not a refusal (R-5).
  - `nameplate-applicability.integration.test.ts` e23z-INT item 3: the clear on the emptied row is applied with the row unchanged, a value refused (R-5).
  - `contract.test.ts`, `sync.integration.test.ts` 1.5-API-005: 42 and MIN 42, a version-41 pull answered 426.
  - `v13-insulation-print.integration.test.ts`: the template has a fifth sheet, so the PDF reads five tables; the four shapes' checks are unchanged (R-8).
  - `relatorio-tree-edges.test.tsx` "Desfazer after a move": "Desfazer" is waited for (`findByRole`) instead of read at once; the undo toast renders after the announcement.
  - `setup-surface.test.tsx` exclusion edit: the new text is pasted in one input event instead of typed key by key (cause below).
  - `home-surface.test.tsx` 12.2 "Continuar" (two tests) and `reading-arrivals.test.tsx` caption toast: the waits after a chain of live queries take a 10 s budget instead of the 1 s default (no product timer in the chain).
  - `review-layout-interaction-2026-10-08.spec.ts` R8LAY-E2E-008: the press waits for the Home to settle (status board shown, network idle).
  - `review-photo-failures.spec.ts` R8CAP-E2E-010: the tray is read once the sheet reloaded by `syncNowAndReturn` is drawn, and the two "Criar" presses go through `createManufacturer` (retried while the list re-mounts).
- **Review fixes (2026-11-10):** the request bound covers only the wait for the headers (plus the body's upload at 8 KB/s), never the answer's download; R-1 also reads "a conferir" beside a judged reading when a v11+ ratio table waits for its vector group (the floor's e21g D6 case); `e24f-INT R-8` previews on its own (a shared once-per-file preview); two ledger rows (the R8LAY lost press, `send()` unbounded).
- **New tests:** `conclusion-unjudged.test.ts` (R-1), `draft-edit.test.ts` e24f-UNIT R-3, `e23z-final-fixes.test.ts` e24f-UNIT R-5, `nameplate-applicability.integration.test.ts` e24f-INT R-5 (two devices through the push route), `v13-insulation-print.integration.test.ts` e24f-INT R-8, `e2e/sync.spec.ts` e24f-E2E-001 `@p1` (R-7), `e2e/v13-nameplate.spec.ts` e24f-E2E-002 `@p1` (R-9), `client.test.ts` e24f-UNIT (the request timeout).
- **Load-red tests, cause and fix (E23-A4):**
  - 4.8-E2E-005 and 21.1-E2E-002 (D5): the Export dialog's revision poll (3 s interval, re-armed with the working phase; the retry resets the phase and the flush rounds) never stops or backs off, but it calls `syncRelatorio`, which answers `busy` with no request while a sync cycle runs. A cycle awaits its push and pulls with no timeout, so one answer that never comes (a dropped connection, the dev proxy under load) holds the cycle, and the poll, until a reload: "no request for 150 s" with the job done. Product fix: `apps/web/src/sync/client.ts` ends a JSON request whose answer's headers never come as a network failure (the existing retry policy then applies) after `requestHeadersTimeoutMs`: `SYNC_REQUEST_TIMEOUT_MS` (60 s) plus the body at `SYNC_REQUEST_FLOOR_UPLINK_BYTES_PER_S` (8 KB/s; a 4 MiB push about 8,5 min); the answer's download is never cut, and `send()` stays unbounded (ledger row). Not reproduced here (no trace of the original runs is kept); this is the one code path that fits the record.
  - R8CAP-E2E-010: reproduced twice: FABRICAÇÃO's list re-mounts between the "Criar" option's resolution and the press, so the press finds a detached node; the press is retried with the name typed again. Also, the tray was read within the 5 s default from the navigation `syncNowAndReturn` makes; now after the sheet's title is drawn. Whether a tap on a tablet can be lost the same way is reported in `deferred-work.md`.
  - R8LAY-E2E-008: a press on a Home still mounting (session read, shell swap, launch cycle) can be lost; the press waits for the status board and is repeated only while the dialog is closed (`networkidle` never came: a request is always in flight).
  - `setup-surface.test.tsx`: typed key by key on a loaded host, a pause past the 500 ms idle commits a prefix, and its live-query echo resets the keys typed after it. That is a product race (reported in `deferred-work.md`, not fixed: outside R-1, R-3, R-5); the test pastes the edit whole.
  - `reading-arrivals.test.tsx`, `home-surface.test.tsx`: `waitFor`/`findBy` 1 s default over a render that follows several live queries and the kernel's walk; no product timer; the test's budget (10 s, under the 15 s test timeout).
  - `relatorio-tree-edges.test.tsx`: "Desfazer" read before its toast rendered.
- **Verification (worktree stack `fasor-e24f`, host lock, logs in `.scratch-e24f/`):**
  - lint 0 errors (26 old warnings); static 0 (after two test-typing fixes).
  - Gate 1 (lock wait from 22:43, load 5.56 at the start, 6.71 at the end; the coordinator's matrix and e24b's runs before it): test:api 960 of 961, the one red the new R-8 case (it expected 30 SEGUNDOS and ESTAB./10MIN values, which the table prints as "-"; fixed to the captured columns); every layout-lock and Porto Seguro golden test green, nothing regenerated. test:unit 6159 of 6160: one red, `relatorio-tree-edges.test.tsx` "Desfazer of a Restaurar" (a 1 s `waitFor` after a restore, the same load class, not one of the eight; green in the three file runs below). e2e (14 specs, desktop-chrome and durability-desktop-chrome) 89 of 91: e24f-E2E-001 read the row `sent` (a push that left and failed), now asserted `pending` or `sent`; R8LAY-E2E-008 never reached `networkidle`, the wait replaced by a press repeated only while the dialog is closed.
  - Gate 2 (load 4.36 to 3.15): the two api files 8 of 8 (R-8 and R-5 green); the five hardened or touched web files three runs, 118 of 118 each; `e2e/sync.spec.ts` and the layout spec 19 of 19; the six cases (4.8-E2E-005, 21.1-E2E-002, R8CAP-E2E-010, R8LAY-E2E-008, e24f-E2E-001, e24f-E2E-002) 6 of 6 (`scripts/e2e.ts` dropped `--repeat-each`, so runs 2 and 3 were separate runs).
  - Gate 3 (load 9.76 to 5.90): runs 2 and 3 of the six cases, 5 of 6 each: R8CAP-E2E-010 failed both times on its first "Criar" option, "element was detached from the DOM" (the field's list re-mounted between resolution and press; the step before the e24f change). Fixed by `createManufacturer`, which retries the typed name and the press until it lands.
  - Gate 4 (load 7.72 to 5.74): R8CAP-E2E-010 three runs, 3 of 3. So each of the six cases passed three runs (4.8-E2E-005, 21.1-E2E-002, R8LAY-E2E-008, e24f-E2E-001, e24f-E2E-002 in gates 2 and 3; R8CAP-E2E-010 in gate 4). Lint 0 and static 0 again after the last edit.
  - Matrix: no durability spec drives the off-plate clear (only `ttr-per-tap.spec.ts`, not a durability spec), so no targeted matrix run applies to R-5.
- **Not done here (spec):** `epics.md`, `source-deltas.md`, `epic-24-context.md`, `sprint-status.yaml` untouched; no seed change; no golden regenerated. The coordinator moves Epic 24's reserved contracts up by one (e24a 43 ...).
- **Final story gate (orchestrator, on the merged head `bfd53e1a`, main `ea40d4e9` merged in, docs only):** lock wait 0 s, load `{ 2.60 4.19 5.35 }` to `{ 5.54 5.73 5.66 }`; lint 0 (20 s), static 0 (35 s), test:api 961 passed, 6 skipped (454 s), test:unit 6162 of 6162 (290 s), 18 specs on desktop-chrome and durability-desktop-chrome 108 of 108 (parallel 70, queue 21, solo 17; 457 s). The six hardened or new e2e cases on the final code: the gate run plus two separate runs, 6 of 6 each (load up to 10.98). No golden changed.
- **Review:** Edge Case Hunter and Verification Gap (Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them). 9 findings: 5 patched in one loop (the headers-only request bound, two findings of one root cause; R-1's vector-group case; the R8LAY ledger row; R-8's test run alone), 1 deferred (`send()` unbounded, ledger row), 3 rejected (R-4/R-8 not red by nature; the R-9 toast row misdescribed the product; R-7's `pending|sent` then asserted acked on the server).
- **Follow-up review recommended: true.** Two medium entries were patched without a re-read: the headers-only bound in `apps/web/src/sync/client.ts` (`requestHeadersTimeoutMs`) and R-1's vector-group branch in `conclusion.ts`. The integrated review's second pass should read both first.

