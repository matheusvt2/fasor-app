---
title: 'e27a fixes: the wave 1 review findings (Stories 27.1 to 27.6)'
type: 'bugfix'
created: '2026-11-22'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-27/epic-27-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-27/spec-e27a-grave-fixes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-27/spec-e27a-slice2-company-and-limits.md'
warnings: ['batched']
batched_why: 'The wave 1 review findings R1 to R9 of Epic 27, fixed in one batch and one PR (token economy of 2026-11-12).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The wave 1 review of PR #345 (Stories 27.1 to 27.7, on main) found that the screen promises a printed text it does not show (R1). It found device paths that still queue an impossible humidity (R2), a comment that is not true (R3), a name-based match that confuses fichas (R4), a restore path that may revive a second `empresa` (R5), criterion sentences that are not true (R6), two rules left in `apps/web` (R7), and a loosened test (R8). It also asks for one record (R9).

**Approach:** Verify each finding in the code before fixing it. If a finding turns out wrong, skip it and say why in the report. Fix in the kernel first, so `apps/web` only renders what the kernel returns.

## Boundaries & Constraints

**Always:**
- Each finding is verified first. If the verification refutes it, skip the fix and record the evidence.
- No golden document, layout lock or `pdf-text.json` changes; if one turns red, stop and report. Seeds v1 to v16 and their hashes stay untouched.
- No contract bump, unless a fix changes what the server accepts. R5 might: if it does, stop and report before bumping.
- Derived text and rules live in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts`. Every new pt-BR sentence carries `// authored (Story 27.x, listed for Bruno)`.
- Grep `e2e/` and the unit and web tests for every string you change, update the hits, and list the grep and its hits in your report.

**Never:**
- Edit Epic 26's files: `ops/path.ts`, `contract/errors.ts`, `http/session.ts`, `auth/auth.ts`, `permissions/` (except `permissions/map.test.ts` for R8), `apps/web/src/app.tsx`, the admin and user screens.
- Edit `epics.md`, `sprint-status.yaml` or `docs/kbs/`.
- Build Story 27.5 AC2 (the reorder), which waits for Matheus.

## Findings

- **R1 (27.3, should-fix).**
  - The problem: `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx:71` calls `composeParecer(snapshot)`, which always splits open fichas. The print (`parecerTextForPrint`, `{ print: true }`) splits only under the seed rule `parecer_open_apart`, which no seed sets. The field's helper and the "Como imprime na seção 10" box promise the printed text.
  - The fix: every on-screen text that says it is what prints is composed exactly as the print composes it for that relatório's seed. That covers the summary field, its Critérios line if it claims to print, and the box. The split stays in the reason line, the replaced-choice line and Sumário row 10.
  - Test: on a v16 relatório with one open ficha out of criterion, the Etapa 6 summary text equals the printed section 10 text (kernel or web test). Update `e2e/parecer-open-ficha.spec.ts` if it asserts the split in the summary field.
- **R2 (27.2, should-fix).** Humidity outside 0 to 100 is still queued by three device paths:
  - `confirmSuggestionOps` (`packages/domain/src/relatorio/suggestion-ops.ts:34`), on "Confirmar" of the thermo-hygrometer suggestion;
  - typing a correction of the suggestion (`read-display.tsx`, where `parseFieldInput` has no range check);
  - "Copiar do anterior" (`apps/web/src/surfaces/ficha/cabine-block.tsx:180`).

  The fix: one kernel check, the same rule the typed field uses (`numberRangeOf` and `outsideRange` in `ops/value-limits.ts`, the `numberRangeRefusal` message), called by all three paths, so no op with a refused value is written on any of them.
  - The suggestion cannot be confirmed while its value is refused, and it says why with the existing refusal message ("Fora da faixa: 0 a 100 %").
  - The copy skips a refused value and says so.
  - A suggestion never ends "confirmed" with no value.

  Tests: kernel tests for all three paths, plus one e2e added to `e2e/value-limits.spec.ts`.
- **R3 (27.2, minor).** The contract 56 comment in `packages/domain/src/contract/version.ts` says the server refuses zero resistance and wrong CNPJ check digits; only humidity is refused on the server. Read Story 27.2's acceptance criteria in `epics.md` (grep `### Story 27.2`, read with offset/limit). If they ask for a server refusal of either, report it as a gap and add no server rule. In every case, make the comment true.
- **R4 (27.3, minor).** `reasonParts` in `packages/domain/src/relatorio/parecer.ts` separates open fichas from reprovadas by name. Match by block id, as `composeParecer` does. Test: two untagged fichas of one type (named by the type label), one concluded Reprovado and one open with a reading out of criterion; both appear in the reason line and in the replaced-choice line.
- **R5 (27.1, minor).** `holdsOtherEmpresa` (`apps/api/src/sync/rules.ts`) checks only a create. First verify whether a client op can restore a removed registry row (a put that clears `removed_at` on `registry/empresa/{id}`, or any other path).
  - If it can: refuse that restore while another live `empresa` exists, with an api integration test. If this changes what the server accepts in a way that needs a contract bump, stop and report before bumping.
  - If it cannot: add a test that proves it and change nothing else.
- **R6 (27.6, minor).** In `packages/domain/src/seed/criteria-view.ts`, the "Vale ..." sentences for contact resistance and insulation ignore the manufacturer's value (`criterion_override`, `relatorio/reading-evaluation.ts:143` and `rowCriterion`), and "nos cabos" is typed by hand.
  - Make the sentences true: where it applies, say that the manufacturer's value on the plate comes first.
  - Read the scope (which equipment) from the seed where the seed has it.
  - Update `criterios-tab.test.tsx`, `e27a-criteria-view.test.ts` and `e2e/criterios-tab.spec.ts` where the words change.
- **R7 (rules, minor).** Two rules move to the kernel, and `apps/web` renders what the kernel returns:
  - `missing.length === 4` in `apps/web/src/surfaces/points/points-surface.tsx`;
  - `outOfRange` via `Number.isFinite` in `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx`.
- **R8 (test, minor).** In `packages/domain/src/permissions/map.test.ts` (26.2-UNIT-009), the earlier edit loosened the assertion to `>= 56` under a title that says "refuses 54". Assert the exact current and minimum contract (56), assert that 55 is refused, and make the title say so.
- **R9 (27.2, record only).** AC2 asks the "Antes de emitir" temperature row to name the ficha; `temperatureRowText` names the local, because the temperature is stored per cabine. Change no code; this is a narrowing for the PR body.

</intent-contract>

## Verification

Run everything from this worktree, compose project `fasor-e27a`. Write the code first.

1. Before `podman compose up -d postgres minio api`, run `podman ps`. Bring the stack up only if at most one other batch stack (`fasor-e2*`) is running. Otherwise wait, polling every 60 s or more.
2. Run every test command as `nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c 'podman compose --profile tools run --rm --user root tools pnpm ...' > .scratch-e27a/<name>.log 2>&1`. Poll in bounded loops of at most 55 s and read only the tail.
3. Run `podman compose restart api` after any change under `packages/domain` or `apps/api`.
4. With `scripts/e2e.ts`, spec paths go before `--project`.
5. While iterating, run the narrowest suite: the touched unit files, `pnpm static`, `pnpm lint`, and the touched specs alone. The orchestrator runs the final gate.

## Auto Run Result

Status: in-review (PR open, not merged by the batch).

- Implementation: subagent bmad-dev-opus-high a3635349a5ab81505, returned complete; R1 to R8 confirmed and fixed, R9 recorded.
- Gate on 604e3cb1 (main 1c69862c merged; lock wait 0 s; load 2.50 at start, 7.38 at end): lint 0, static 0, test:api 1124 passed and 6 skipped, test:unit 7457 of 7457, 7 specs 11 of 11.
- Open: R5 changes what the server accepts with no contract bump (56 unreleased), a decision for the coordinator.
