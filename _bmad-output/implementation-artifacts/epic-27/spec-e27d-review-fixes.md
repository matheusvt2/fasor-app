---
title: 'e27d: the wave 3 review findings (Stories 27.11 to 27.13)'
type: 'fix'
created: '2026-11-22'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-27/epic-27-context.md'
warnings: ['batched']
batched_reason: 'The seven findings X1 to X7 of the wave 3 review of merge 64ddc634 (PR #362) are one fix batch and one PR, the last change before the production deploy; implemented by the orchestrator directly (small, apps/web plus one kernel and one print file).'
deferred: []
baseline_revision: '64ddc634'
---

## Intent

Fix the wave 3 review findings X1 to X7 with the smallest change each, after checking each one holds in the code. No contract number, no seed change, no migration, no golden or layout lock change.

## Findings, readings and code map

| Id | Holds | Fix | Files |
| --- | --- | --- | --- |
| X1 | yes: `leftEmpty` local state plus a refused conclude only; a remount, a sync arrival and an accepted conclude never showed the mark; Verificações do local gave no context | the mark is hidden only while the row became NC in this mounted row and its field was not left (`justMarked`, adjusted during render); every conclude attempt, accepted or refused, sets the context; Verificações do local provides it | `checklist-section.tsx`, `use-ficha-actions.ts`, `verificacoes-surface.tsx` |
| X2 | yes: the bar was drawn inside the `li` of the first unanswered item and moved down one row per answer | drawn once at the head of the checklist (under its heading, above the legend), in every state, same enabled and disabled rules; the focus rescue that followed a moving bar is gone with it | `checklist-section.tsx`, `sticky-action-bar.tsx` (comment), `EXPERIENCE.md`, `DESIGN.md` |
| X3 (a) | yes: clearing a held name and leaving the field committed `''`, which created the client nameless with the waiting fields | an empty name never creates the client; the waiting fields keep waiting | `client-panel.tsx` |
| X3 (b) | yes; the panel has no leave or discard confirmation | kept as it is, recorded as a narrowing | none |
| X4 | yes: the reason lines precede the button inside a 25dvh foot that scrolls | on the phone Sumário the button row is `position: sticky; bottom: 0` inside the foot, on the bar's own background, so only the lines above it scroll | `app.css` |
| X5 | yes: the phone menu item had no description and `status-flow` skipped the check | `OverflowMenuAction.description` in the item's description slot (`reason` wins); the item carries `statusStepText(flow)` when the foot button would | `overflow-menu.tsx`, `sumario-surface.tsx` |
| X6 | yes: "Distância aprox." lost its period; "…" stayed | `ABBREVIATION_AT_END` (aprox, etc, máx, mín, nº, ref, obs, cf, any case) keeps one period of the closing run; "…" joins `TRAILING_MARKS`; only under `wording_pass` (v17) | `packages/domain/src/points/derived.ts` |
| X7 | yes: the value printed as one run with the line feed inside `<w:t>`, which LibreOffice prints as a space (see the Auto Run Result) | each break a `<w:br/>` in the value's one paragraph (`lineRuns`, the e23f way); a value with no break is the one run it was | `apps/api/src/jobs/generate/docx.ts` |

## Acceptance criteria

- X1: Given an NC row just marked, when its field was never left, then no red mark; given a row that mounts NC and empty, then the mark at once; given a conclude attempt on the ficha or on Verificações do local, then every NC row still empty shows it (`checklist-row.test.tsx`, `verificacoes-surface.test.tsx`, `ficha-dialog-words.spec.ts` 27.13-E2E-002).
- X2: Given a checklist with its first item answered, when the first unanswered item is answered, then the bar stays at the head and no row's controls move (`fixed-bars.spec.ts` 27.11-E2E-001, `ficha.spec.ts` 12.1-E2E-012).
- X3: Given a held name and a waiting CNPJ, when the name is cleared and left, then nothing is created, and the next name creates the client with the CNPJ (`client-panel.test.tsx`).
- X4: Given a new relatório on the phone, when the foot names every blocker, then "Gerar relatório" is inside the foot and the viewport at 390x844 and 390x560 (`fixed-bars.spec.ts` 27.11-E2E-003).
- X5: Given Em revisão on the phone, then the menu item "Marcar como enviado ao cliente" is described by the step sentence (`status-flow-2026-10-10.spec.ts`, `overflow-menu.test.tsx`).
- X6: Given v17 and a text ending in one of the abbreviations or "…", then the clause follows the period or replaces the ellipsis; v16 unchanged (`e27b-wording-pass.test.ts`).
- X7: Given three lines in "Informações adicionais", then the DOCX holds two `<w:br/>` in one paragraph and the PDF prints three lines in order (`docx-line-breaks.test.ts`, `cover-line-breaks.integration.test.ts`, run in the api container).

## Narrowings

- X3 (b): closing the Clientes panel while a repeated name is held drops the fields that waited, with no word; the panel has no leave or discard confirmation to reuse.
- X3: a new client whose first field is not the name still creates the client on that field with an empty name, as before (Story 2.1's pattern, `client-panel.test.tsx` "with no repeated name the first field still creates the client").

## Added by the coordinator (2026-11-22, the shared final gate on 64ddc634)

- `test-applicability.durability.spec.ts` 23.9-E2E-001: the expectation takes Story 27.9's sentence-case label (the kernel test `27.9-UNIT applicability in sentence case (F37)` is the intended text).
- `ficha.spec.ts` 12.1-E2E-012: rewritten for X2; the keyboard press waits until the button holds the focus (red 1 of 3 without it, at the line main's run went red on; 6 of 6 with it).
- `ttr-per-tap.spec.ts` 23.8-E2E-001 (red alone on 64ddc634): `focusCell` brings the focused cell's row whole above the Sticky action bar (`ensaios-section.tsx`).

## Auto Run Result

- Implemented by the orchestrator directly; no implementation subagent, no review loop (token economy; the wave review covers it). No orchestrator cut; handoff file `.scratch-e27d/HANDOFF.md`.
- X7 before the fix (main's `docx.ts`, api container): the PDF read "Manutenção preventiva da cabine primária Ensaios elétricos nos" / "transformadores Termografia dos painéis", the breaks lost; green after.
- Mutation runs: X1 and X4 red with their fixes reverted (27.13-E2E-002 at the remount check; 27.11-E2E-003 button bottom 878.3 against foot bottom 845 at 390x844).
- Gate on the merge of main `9f2c1612` (`40a77335`): lint, static, test:api 1175 passed (7 skipped), test:unit 7751 passed, 35 specs 205 of 205, matrix 25 of 26 (1 skipped as on main); no lock wait, load 2.3 to 7.4. Details in the PR body.
