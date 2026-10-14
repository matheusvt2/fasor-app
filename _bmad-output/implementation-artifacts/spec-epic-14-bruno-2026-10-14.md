---
title: "Epic 14: Bruno's answers of 2026-10-14 (site NC in the parecer, CTA sheet adjustments)"
type: 'feature'
created: '2026-10-14'
status: 'ready-for-dev'
baseline_revision: '93496eb9'
review_loop_iteration: 0
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md'
warnings: ['batched']
# batched: two small dated criteria blocks of one day (Stories 14.3 and 14.5), one kernel, one PR (coordinator's cut).
---

<intent-contract>

## Intent

**Problem:** Bruno's answers of 2026-10-14 (`epics.md` "Acceptance Criteria added 2026-10-14" under Stories 14.3 and 14.5; the three `source-deltas.md` rows of that date) reverse two choices: an NC site item now counts as an NC, and the CTA sheet of seed v5 changes before v5 is ever deployed.

**Approach:** kernel first (AD-1/AD-13). Site NCs join `Progress.nc_open`, the F-24 finder and the parecer suggestion and summary. Seed v5 is edited in place, once (source-deltas 2026-10-14): E2 loses N-T, E1 gains a test-current value, a test not run prints nothing. No new op family, no new path, no contract or seed version bump (contract stays 19).

## Boundaries & Constraints

**Always:** every count, verdict and composed text in `packages/domain`; authored pt-BR marked `// authored:` (open for Bruno). Only *live* locals count (`siteLocals`: a removed local, or a relatório on v1 to v3, adds nothing). Keep the QA fix's pre-issue row (`siteNcWithoutPoint`) unchanged. The parecer `basis` and the conclusion `basis` of a relatório with no site NC stay byte-identical (add a key only when non-empty, as `conclusion.ts:280` does).

**Never:** touch seeds v1 to v4 or their hash pins; change E4 (`cta_ajustes_controlador`, 14 rows: pending Bruno's list, unless the coordinator sends it); the painel type-group title; "cabine incompleta"; site photos of a removed local; edit `epics.md`, `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Id | Scenario | Expected | Edge |
|---|---|---|---|
| N1 | v4+ local, 2 site items NC, 1 sheet item NC | `progress(snapshot).nc_open` = 3; Sumário "3 NC abertos" | Home and obra cards pass blocks only and show no NC count: unchanged |
| N2 | the local of N1 removed | its site items count nowhere (`nc_open` = 1, no parecer restriction) | restored: they count again |
| N3 | "NC abertos" tapped, first NC in tree order is a local's site item | section 9 opens, the local's `.s9-verif` button takes the focus | sheet NC first in order: as today (its row) |
| N4 | site NC, every sheet Aprovado · Sem restrições | `suggestParecer` = `apto_com_restricoes`; hint adds the site NC count | no sheet at all, site NC present: still `apto_com_restricoes` |
| N5 | composeParecer with site NC | a sentence naming each site item as `item {number} ({label lowercased})` with its locals count; a Critérios item per site item; basis changes | no site NC: text, Critérios and basis as today |
| C1 | CTA v5, polos 4 / neutro | E2 rows: A-T, B-T, C-T, A-B, B-C, C-A, Linha-carga; no N-T on the sheet, in the print, in the DOCX | |
| C2 | E1 test current 100 typed | written on `sheet/{b}/test/cta_resistencia_contato/value/corrente_ensaio` (field content); sheet shows it; E1's printed table carries "CORRENTE DE ENSAIO: 100 A" | E1 switched off: value not missing, nothing prints |
| C3 | E5 método "Não realizado" | E5 prints nothing (no title, method or criterion line); E6 keeps its title "E6 · …" | switched-off test: prints nothing, as today |
| C4 | an out-of-criterion E1 or E2 cell | printed cell is the plain value, no mark, no extra cell; the composed conclusion names that test's worst out reading | pin today's behaviour if it already holds |

</intent-contract>

## Readers of `nc_open` (checked 2026-10-14)

- `packages/domain/src/relatorio/progress.ts` `progress()`: CHANGED. When the snapshot carries `relatorio` and `locations`, `nc_open` adds `siteNcCount(snapshot)` (new, `site-checklist.ts`: NC site items over `siteLocals`). `blocksProgress`, `locationProgress`, `locationProgressIndex` stay sheets-only (the local's counter is sheets-only; nothing renders their `nc_open`).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:154,422` (header "N NC abertos"): no code change beyond N3; it already passes the full snapshot.
- `packages/domain/src/relatorio/count-target.ts` (F-24 finder): CHANGED, so a tap reaches the item the count now counts (N3). Tree order: a local's site row comes before its equipment (`.s9-verif` sits in the local's header row).
- `packages/domain/src/home/cards.ts:223`, `apps/web/src/surfaces/project/project-surface.tsx:168`: UNCHANGED, they read only the sheet counters.
- `pre-issue.ts`, export dialog, `resume.ts`, `tree-surface.tsx`: UNCHANGED, they read sheet counts only.
- `apps/api`: no NC count in pull totals or elsewhere (grep `nc_open|ncCount|'NC'` empty): UNCHANGED.

## Code Map

- `packages/domain/src/relatorio/site-checklist.ts` -- `siteResultOf`, `siteLocals`, `siteNcWithoutPoint` (pattern for a new `siteNcCount` and `siteNcItems`).
- `packages/domain/src/relatorio/progress.ts:46-68`, `count-target.ts`, `tree.ts:160-190,450-462` (`TreeSiteNode`).
- `packages/domain/src/relatorio/parecer.ts:84-247` (`restricted`, `suggestParecer`, `parecerHintText`, `composeParecer`).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:349-362` (`openCount`), `relatorio-tree.tsx:300-327,762` (focus, `.s9-verif`).
- `packages/domain/src/seed/v5.ts:155-210` (E1, E2), `print/section-9.ts:697-727` (`measurementTestPart`), `relatorio/conclusion.ts:196-270`.
- Tests pinning v5 content: `seed/seed.test.ts` (v5 block), `relatorio/measurement-evaluation.test.ts`, `print/measurement-print.test.ts:391`, `ops/measurement-table.test.ts`, `status/edited-since.test.ts`, `relatorio/measurement-test-support.ts`, `apps/web/src/surfaces/ficha/measurement-test-section.test.tsx`, `apps/api/src/jobs/generate/docx-cta.test.ts`, `apps/api/src/sync/sync-cta.integration.test.ts`, `e2e/cta.spec.ts`, `e2e/cta.durability.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `site-checklist.ts` -- add `siteNcCount(snapshot)` and `siteNcItems(snapshot)` (per seed site item in list order: `{ number, label, locals: string[] }`, live locals only, tree order) -- N1, N2, N5.
- [ ] `progress.ts` -- `progress()` accepts an optional `relatorio`/`locations` and adds `siteNcCount`; update its doc comments -- N1.
- [ ] `tree.ts` + `count-target.ts` -- `TreeSiteNode` gains `nc: number`; replace `firstCountedBlock` by a finder returning `{ kind: 'block'; blockId } | { kind: 'site'; locationId } | null` (keep the name or rename, update callers and `count-target.test.ts`); `nc_open` visits a local's site node before its equipment -- N3.
- [ ] `sumario-surface.tsx`, `relatorio-tree.tsx` -- a site target expands section 9 and focuses `li[data-location-id=X] > .s9-loc-row .s9-verif` (reuse the F-24 token) -- N3.
- [ ] `parecer.ts` -- `suggestParecer`: any site NC gives `apto_com_restricoes`, before the no-sheet return; `parecerHintText` adds `// authored:` "N NC nas verificações do local" (`plural`); `composeParecer` adds after the sheet NC sentence `// authored:` "Verificações do local não conformes: item 3 (label) em 1 local." (`plural(n,'local','locais')`, `listPtBr`) and Critérios items "verificações do local, item 3 NC (1)"; basis gains `site` only when non-empty -- N4, N5.
- [ ] `seed/v5.ts` -- drop E2's `n_t` row (and its open-question comment); E1 gains `values: [{ key: 'corrente_ensaio', label: 'Corrente de ensaio', kind: 'number', unit: 'A' }]` (required, as E6's `temperatura_ambiente`; `// authored:` label) -- C1, C2.
- [ ] `print/section-9.ts` -- `measurementTestPart` returns null when `test.skipped` too; update the narrowing comment -- C3.
- [ ] Tests: unit for every matrix row (boundaries: 0 site NC, 1, a removed local, v3 relatório); `measurement-print.test.ts:391` rewritten to assert E5 absent; C4 pinned in `measurement-print.test.ts` and `conclusion.test.ts`; `docx-cta.test.ts` and the api CTA sync test follow the seed; one api integration test that `corrente_ensaio` is accepted through `POST /api/sync/ops` and an unknown value key is still refused.
- [ ] e2e, `@p0`, asserting committed state: in `e2e/verificacoes-local.spec.ts`, answer a site item NC → Sumário "1 NC aberto", the tap focuses the local's `.s9-verif`, the parecer step suggests "Apto com restrições" with the item in the composed text; remove the local → "0 NC abertos". In `e2e/cta.spec.ts`, with 4 polos E2 shows no N-T row, E1's test current typed survives a reload and sits in the outbox on its path. Existing specs that assert E2's rows, CTA completeness or "NC abertos" are updated, never loosened.

**Acceptance Criteria:**
- Given a live local with a site item NC, when the Sumário renders, then "NC abertos" counts it and tapping it focuses that local's site row.
- Given that local, when Etapa 6 opens, then the suggestion is "Apto com restrições" and the composed summary names the item; given the local removed, then neither the count nor the parecer carries it.
- Given a CTA on seed v5, when it renders and prints, then E2 has no N-T row, E1 records and prints its test current, E5 "Não realizado" prints nothing, and an out value prints plainly while the composed conclusion names it.

## Open questions (keep, list in PR)

- Test current required (as E6's ambient temperature) rather than optional; its label "Corrente de ensaio" is authored.
- The site NC wording in the hint, the summary and the Critérios line is authored; site NC with no sheet suggests "Apto com restrições".
- The conclusion names the worst out reading per test (the FR-30 template of the eight), not every out cell.

## Verification

Story gate (playbook § 2, 2026-10-08): `lint`, `static`, `test:unit`, `test:api`, then `scripts/e2e.ts` on `cta.spec.ts`, `cta.durability.spec.ts`, `plate-every-type.spec.ts`, `verificacoes-local.spec.ts`, `verificacoes-local.durability.spec.ts`, `parecer-export.spec.ts`, `review-field-defects.spec.ts` on `desktop-chrome` and `durability-desktop-chrome`; the two durability specs on the matrix projects.

## Spec Change Log

## Review Triage Log

### 2026-10-14 — Review pass (Edge Case Hunter, Verification Gap; Blind Hunter and Intent Alignment skipped: token economy, the integrated epic review covers them)

- Patched (one loop): ECH-1 hint with no sheet drops "0 de 0 fichas concluídas"; ECH-2 a site focus request with no drawn local falls back to section 9; VG-1 the confirmed parecer text with the site sentence asserted in the outbox, and the hint after removal; VG-2 E2's rows read from the kernel, N-T asserted absent; VG-3 an E2 `n_t` cell refused through `POST /api/sync/ops`; VG-4 full composed text with sheet and site NC; VG-5 E1 switched off with a typed current; VG-6 an out E2 cell prints plainly; VG-7 `suggestParecer` after a restore and on v3.
- Known open: VG-8 (no e2e where a sheet NC earlier in tree order wins over a site NC, no second-tap e2e on a site target; the kernel order is unit-tested). ECH-3 (a development store holding a v5 CTA sheet from before the edit keeps `n_t` cells and loses its concluded state to the new required value; accepted by the 2026-10-14 source-deltas row, v5 never left development).
