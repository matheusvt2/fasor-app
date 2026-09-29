---
title: 'Epic 10 carry-over: ledger ownership, suggestions split, speech default none'
type: 'chore'
created: '2026-09-29'
status: 'done'
baseline_revision: '256f358c2202f6ddcf061b126501bec658cd69df'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context: []
warnings: ['batched', 'oversized']
# batched: E9-A5, E9-A7, E9-A9 and ledger 1155 are small agent-closable Epic 9 retro items, batched in one PR to save tokens.
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 9 retrospective left four agent-closable items: ledger entries still owned by a finished review or retro (E9-A5, R9-15), no e2e for a `verify` display fill under a dictated cell (ledger 1155), two kernel god files (`relatorio/suggestions.ts` 905 lines, `relatorio/readings.ts` 653 lines; E9-A7, R9-10), and a default build whose Dictation sends audio to the browser vendor with no consent (E9-A9, R9-14).

**Approach:** Edit the ledger states in place (strike the old owner, write the new one dated 2026-09-29); add one `@p0` e2e to `e2e/dictation.spec.ts`; split the two kernel files into concern modules behind the same file names as re-export barrels; flip the speech engine default to `none` in compose, `.env.example` and the code fallback, with tests proving it.

## Boundaries & Constraints

**Always:**
- Ledger edits follow AGENTS.md: strike the old state text through (`~~open (owner: ...)~~`) and write the new state beside it with the date 2026-09-29 and `E9-A5`; never delete an entry.
- The split is a pure move: no behavior change, no renamed export, no edited test file. `relatorio/suggestions.ts` and `relatorio/readings.ts` stay as barrels, so every importer (`packages/domain/src/index.ts:59,63`, `relatorio/*.ts`, `print/section-9.ts`, `parse/utterance.ts`, `templates/text.ts`, `photos/captions.ts`) and every test keeps its import path.
- The runtime export set of `@app/domain` and of both barrels is identical before and after (compare `Object.keys(await import(...)).sort()` from a throwaway script in `.scratch-e10c/`, run in the tools container, never committed); a helper the split must share between new modules and that was not exported before is NOT re-exported by the barrel (barrel uses explicit `export { ... } from` lists or `export *` only from modules without such helpers).
- No file under `packages/domain/src/relatorio/` over 500 lines after the change (test files included in the count check only as a report; the target is source files). No import cycle between the new modules.
- The e2e keeps the `fake` engine through `build:e2e` (`apps/web/package.json:8`); dictation e2e assert committed state (outbox/store) as well as the screen.
- Everything runs in Docker (`docker compose --profile tools run --rm tools ...`); never pnpm on the host.

**Never:**
- Do not touch the ops fold (`packages/domain/src/ops/apply.ts`), sync code (`apps/web/src/sync/`, `apps/api/src/sync/`) or the e2e seed (`apps/api/src/db/e2e-worker-seed.ts`, `seed.ts`): batch M owns them.
- Do not edit `sprint-status.yaml` or `epics.md`. Do not change `PARALLEL_WORKERS`. No new op family, no contract bump.
- Do not fix ledger 1065, 1077 or 1095 (judged not small, see Design Notes); do not add consent text (the default `none` is the chosen E9-A9 branch).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default build | `VITE_SPEECH_ENGINE` unset or `''` | `speechEngineName()` is `none`; no Dictation button renders anywhere | unknown name still reads `none` |
| e2e build | `VITE_SPEECH_ENGINE=fake` | fake engine; dictation specs unchanged and green | - |
| Opt-in | `VITE_SPEECH_ENGINE=webspeech` | Web Speech engine as today | - |
| 1155 verify fill under dictation | contato fechado: Fase A display fill `trust: 'verify'`, Fase B `suggested`, Fase C `verify`; Fase A dictated | "Confirmar todos (1)"; toast "1 campo confirmado — 1 campo pede verificação" (Fase C only); outbox batch holds Fase B only; Fase A cell stays empty | without the `exclude` in the toast count the toast says "2 campos pedem verificação" (mutation run) |

</intent-contract>

## Code Map

- `_bmad-output/implementation-artifacts/deferred-work.md` -- the ledger. State lines to edit: 1029 (E78-R2, summary 1026), 1065, 1071, 1077, 1095, 1101, 1113, 1125, 1137, 1149, 1155, 1161; plus the Epic-10-routed entries by summary line 106 (state 109), 160 (163), 166 (169), 310 (313), 334 (337), 370 (373). Line numbers are for origin/main at 256f358; re-grep the summary if they moved.
- `_bmad-output/implementation-artifacts/epic-9-retro-2026-09-29.md:53,98` -- E9-A5 text; `reviews/epic-9-review-qa.md` -- known-open (g) refutes 1125; `spec-epic-9-fix-qa.md` -- E9-Q2 (fixes 1113), E9-Q1 (1155 context).
- `e2e/dictation.spec.ts:356-416` -- `GOHM`, `reading()`, 9.4-E2E-011 (the pattern to copy: `openChaveSheet`, `pushSuggestion(..., { targetPath, value, trust, actorId })` from `e2e/support/push-server-ops.ts:93`, `syncNowAndReturn`, `speak`, `table(page,'contato_fechado')`, `readStore` of `outbox`).
- `apps/web/src/surfaces/ficha/read-display.tsx:202-219` -- `confirmAll`: `skipped = measurementTableVerifyCount(..., exclude)`, toast `confirmedAllToastText(done, skipped)` (`suggestions.ts:436`). The toast is announced through `said(...)`; find how 9.1 e2e read it (`e2e/read-display.spec.ts`, grep `pede verificação`).
- `packages/domain/src/relatorio/suggestions.ts` -- sections: rows/targets/compare/view `:34-230`; the group (nameplate, registry, counts, glyph) `:231-328`; ops `:329-354`; editable guess `:355-413`; texts `:414-486`; plate photo and crop geometry `:487-618`; arrivals and counts texts `:619-647`; Story 9.1 measurement, confirm-all, verify count `:648-760`; env `:761-782`; mismatch `:783-811`; burst and queued `:812-905`. Imports `readings.ts` (`evaluateSheetReadings`, `CellAddress`, `TestKey`).
- `packages/domain/src/relatorio/readings.ts` -- sections: types `:24-110`; text helpers `:111-150`; units `:151-189`; stored cells `:190-216`; ratio inputs `:217-247`; evaluation `:248-527`; continuous run `:528-589`; conclusion's worst `:590-653`.
- `packages/domain/src/relatorio/{suggestions,suggestions-plate,suggestions-display,readings}.test.ts` -- must stay byte-identical and green.
- `apps/web/src/speech/engine.ts:8,30-33` -- `speechEngineName` fallback (`''`/unset -> `webspeech`) and doc comment.
- `apps/web/src/speech/engine.test.ts:12-19` -- asserts unset -> `webspeech`; update to `none` (the only test edit outside the new ones).
- `apps/web/src/speech/dictation.tsx:32-40` -- module-level `buildEngine ??= createSpeechEngine(speechEngineName())`; `SpeechEngineProvider` without `engine` uses it.
- `apps/web/src/speech/dictation.test.tsx:44` -- existing `none` render pattern (`renderButtons`).
- `docker-compose.yml:112-113`, `.env.example:17-20` -- defaults and their comments.

## Tasks & Acceptance

**Execution:**
- `_bmad-output/implementation-artifacts/deferred-work.md` -- E9-A5 state edits (strike old, new text dated 2026-09-29, E9-A5):
  - 1113: closed, fixed by E9-Q2 in PR #62 (`clientReadingPutIsValid` narrowed). Confirm in `apps/api/src/sync/apply.ts` before writing; if not narrowed, say what E9-Q2 did instead.
  - 1125: closed, refuted by the Epic 9 QA, known-open (g) of `reviews/epic-9-review-qa.md`.
  - 1071, 1137, and 109, 163, 169, 313: `open (owner: Story 10.4 (batch S))`.
  - 1161, 337, 373: `open (owner: Story 10.1 (batch M))` (1161: per-batch atomic apply; the merge fold and "Aplicar" depend on batch semantics).
  - 1065, 1077, 1095: `open (owner: Epic 11)` with the one-line reason from Design Notes.
  - 1101: `open (owner: E9-A1, the gate budget decision (Matheus))`.
  - 1149: closed, narrowing accepted by the Epic 9 retrospective (E9-A5).
  - 1155: closed by this batch, naming the new e2e id.
  - 1029 (E78-R2): `open (owner: Matheus decides the one definition of a concluded ficha (`progress.ts:142` vs `parecer.ts:148`); then the next batch touching the Sumário header or the parecer band)`.
- `e2e/dictation.spec.ts` -- add `@p0 9.4-E2E-013` per the matrix row "1155" at 390 px (reuse the 011 helpers; no new support file unless unavoidable). Assert the button count, the toast text, the outbox batch (Fase B cell + its suggestion status only; nothing for Fase A or Fase C), Fase A stored cell null. Mutation run: pass `[]` instead of `exclude` to `measurementTableVerifyCount` in `read-display.tsx:212`, show 013 red, restore; record the result in the Auto Run Result.
- `packages/domain/src/relatorio/` -- split `suggestions.ts` into concern modules (suggested: `suggestion-rows.ts`, `suggestion-group.ts` (nameplate, registry, counts, editable guess), `suggestion-ops.ts` (ops and texts), `plate-suggestions.ts` (plate photo, crop geometry, arrivals texts), `measurement-suggestions.ts` (9.1 measurement, confirm-all, verify count, mismatch, burst, queued), `env-suggestions.ts`); names may differ if a cleaner cut appears, each under 500 lines, one concern each. `suggestions.ts` becomes a barrel with the same export set and a header comment naming the modules.
- `packages/domain/src/relatorio/` -- split `readings.ts` the same way (suggested: `reading-cells.ts` types, text helpers, units, stored cells, ratio inputs; `reading-evaluation.ts` evaluation and lookups; `reading-run.ts` continuous run and worst readings); `readings.ts` becomes a barrel.
- `apps/web/src/speech/engine.ts` -- unset/`''` reads `none`; update the doc comment (webspeech is opt-in, sends audio to the browser vendor; E9-A9).
- `apps/web/src/speech/engine.test.ts` -- unset and `''` expect `none`.
- `apps/web/src/speech/dictation.test.tsx` -- new test: with `VITE_SPEECH_ENGINE` unset (`vi.stubEnv` plus `vi.resetModules` and a dynamic import, so the module-level build engine is fresh), a `SpeechEngineProvider` with no `engine` prop, online, renders no Dictation button.
- `scripts/` tooling test (new, e.g. `scripts/speech-default.test.ts`) -- reads `docker-compose.yml` and `.env.example` and asserts the `VITE_SPEECH_ENGINE` default is `none` in both, so a default install sends no audio.
- `docker-compose.yml:113` -> `${VITE_SPEECH_ENGINE:-none}`; `.env.example:20` -> `VITE_SPEECH_ENGINE=none`; both comments say `webspeech` is opt-in until Matheus approves vendor audio (Q18).

**Acceptance Criteria:**
- Given the ledger after this batch, when grepping open states, then no open entry is owned by "Epic 9 integrated review", "Epic 9 retrospective" or "Epic 9 carry-over batch", and every edited state keeps its struck-through old text.
- Given the kernel after the split, when counting lines, then no source file in `packages/domain/src/relatorio/` exceeds 500 lines, the four test files are unchanged (`git diff --stat` shows none), and `test:unit` and `static` are green.
- Given the export comparison script, when run before and after, then the runtime export lists of `@app/domain`, `relatorio/suggestions.ts` and `relatorio/readings.ts` are identical.
- Given a default build (no `VITE_SPEECH_ENGINE`), when a Dictation surface renders online, then no Dictation button exists (unit test) and the compose and `.env.example` defaults are `none` (tooling test).
- Given the e2e bundle, when `pnpm test:e2e` runs, then 9.4-E2E-001..013 dictation `@p0` tests pass with `fake`.

## Spec Change Log

## Review Triage Log

### 2026-09-29 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer ran; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none (Edge Case Hunter returned an empty list; Verification Gap found no gaps: the moved code lines match the baseline as multisets both ways, barrels keep shared helpers out, no import cycle, the new tests go red on the old default and without the `exclude`).

## Design Notes

- Why 1065, 1077, 1095 go to Epic 11: 1065 needs provenance on `location/{id}/env/*` values, a row shape change with a contract bump that Epic 10's batches already hold; 1077 needs a failed-display state, a kernel line, a reread wiring with `local_prefs` persistence (as B16 did for the plate) and a failing-fake e2e, a feature not a fix; 1095 needs a product choice (offer the dialog again or sweep the orphan photo) that is Matheus's, then a recovery path.
- Barrels over rewriting importers: keeping `suggestions.ts`/`readings.ts` as re-export files leaves every import path and all tests untouched, which is the "tests unchanged" proof.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit > .scratch-e10c/unit.log 2>&1; tail -30 .scratch-e10c/unit.log` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm static > .scratch-e10c/static.log 2>&1` and `pnpm lint` the same way -- expected: green.
- `docker compose --profile tools run --rm tools pnpm test:e2e -- --grep "9.4-E2E" > .scratch-e10c/e2e.log 2>&1` (check `scripts/e2e.ts` for how a grep passes through) -- expected: dictation `@p0` tests green, 013 included.
- `wc -l packages/domain/src/relatorio/*.ts | sort -n | tail` -- expected: no non-test file over 500.
- Do not run the full `pnpm verify`; the orchestrator runs it.

## Auto Run Result

- `@p0` 9.4-E2E-013 added to `e2e/dictation.spec.ts`; `tsx scripts/e2e.ts --grep "@p0 9.4-E2E" --project desktop-chrome`: 6 passed, 0 failed (013 included).
- Mutation run: `measurementTableVerifyCount(fresh, pending, testKey, tableKey, [])` in `read-display.tsx:212` made 013 red (expected "1 campo confirmado — 1 campo pede verificação", received "1 campo confirmado — 2 campos pedem verificação"); restored, file unchanged.
- Export comparison (`.scratch-e10c/exports.ts`, tools container): `@app/domain` 955, `suggestions.ts` 56, `readings.ts` 13 runtime exports, identical before and after.
- Speech default mutation: with the `webspeech` fallback restored in `engine.ts`, the new `dictation.test.tsx` case fails (a stubbed `SpeechRecognition` makes the old default render the button); restored.
- `pnpm static`, `pnpm lint`: green. `pnpm test:unit`: 228 files, 2516 tests passed.

### Finalize (orchestrator)

- Summary: E9-A5 ledger ownership (18 state lines; 1113, 1125, 1149, 1155 closed; the rest re-owned to Story 10.1 (batch M), Story 10.4 (batch S), Epic 11 with reasons, E9-A1 and Matheus); ledger 1155 e2e `@p0` 9.4-E2E-013; E9-A7 split of `suggestions.ts` into `suggestion-rows.ts`, `suggestion-group.ts`, `suggestion-ops.ts`, `plate-suggestions.ts`, `measurement-suggestions.ts`, `env-suggestions.ts` and of `readings.ts` into `reading-cells.ts`, `reading-evaluation.ts`, `reading-run.ts`, both old files kept as explicit re-export barrels; E9-A9 speech default `none` (compose, `.env.example`, `engine.ts`) with a unit and a tooling test.
- Review: 0 patches, 0 deferred, 0 rejected.
- Follow-up review recommended: false (nothing patched).
- Residual risk: a default dev stack now shows no Dictation button; set `VITE_SPEECH_ENGINE=webspeech` to try Web Speech.
