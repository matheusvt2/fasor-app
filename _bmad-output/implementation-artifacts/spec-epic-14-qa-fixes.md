---
title: 'Epic 14 QA fixes: nine-type specs, removed-local seams, site NC before issue, CTA zero readings, seed upgrade on push'
type: 'bugfix'
created: '2026-10-14'
status: 'in-progress'
baseline_revision: 'd9028aca45306c2369d6957ae8a1fed4af5daa64'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-qa-2026-10-13.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: ['batched']
# batched: the Epic 14 integrated QA leaves one fix batch (playbook section 6); its findings share the kernel's removal, site-checklist and measurement modules.
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 14 wave gate is red on nine stale eight-type expectations (Q-1), and the integrated QA
(`epic-14-qa-2026-10-13.md`, read whole: each finding has its scenario and `path:line`) found seams between
14.2 (location removal), 14.3 (site checklist), 14.5 (CTA) and the boot-only template seed upgrade.

**Approach:** One fix per finding, each with a test that fails without it; kernel first (AD-1/AD-13), then
the web and api wiring, then the specs. No new op family; contract stays 19 (`CONTRACT_VERSION`), seeds
v1 to v5 frozen. Ledger entries for what the coordinator kept out.

## Boundaries & Constraints

**Always:** every status, count, verdict, plural and composed text in `packages/domain`; `apps/web` renders and
writes ops only. Authored pt-BR copy marked `// authored:` (open for Bruno) and listed in the final report.
Planning documents append-only (strike `~~…~~` and date). English code and comments. Porto Seguro goldens
(seed v1) unchanged. Each new kernel refusal gets an api integration test through `POST /api/sync/ops`.

**Never:** a contract bump (if one proves truly needed, stop and say why: it would be 20); a new op family; the
per-key `block/{id}/config` family; any change to "NC abertos" (`Progress.nc_open`) or the parecer suggestion
(Q-4); loosening a Q-1 assertion to a count range or `.first()`; editing `epics.md` or `sprint-status.yaml`;
touching a merged seed version.

## I/O & Edge-Case Matrix

| Id | Scenario | Expected | Edge |
|---|---|---|---|
| Q-1 | palettes and "Outro…" chips on seed v5 | specs assert the eight by name where they need only the FO.SERV-03 types; a whole-palette assertion derives its list from `paletteItems`/`paletteTypeGroups`/`equipmentTypesOf` (`@app/domain`) | 9.2-E2E-003's 390 px chip fit re-asserted with nine |
| Q-2 | site point H (removed local) + A, B; Alt+ArrowDown on A | A moves to 2 de 2, op written, "movido: 2 de 2"; saved toast counts 2 | the move key and `pointPlace` read the same live set as the list |
| Q-3 | E1 Lado Normal: 0, 40, 41 µΩ typed | 0 refused at input: field invalid with a kernel message, nothing committed (see Design Notes) | a stored 0 or negative (older op): no verdict, helper "conferir", no conclusion suggestion while it stands |
| Q-4 | v4+ local, NC site item(s), fewer live points with its `location_id` than NC items | one pending pre-issue row naming those locals | a removed local raises none; v1-v3 none |
| Q-5 | v4+ local with no equipment | Verificações surface shows the "Do local" block (SE, AMBIENTE) above the items; edits write `location/{id}/se/*`, `env/*` | sheet-bound parts left out (see tasks); Emitido reopens as today |
| Q-6 | remove a local with site answers, site photos or site points, no sheet | Confirm dialog first; sentence and restore entry count them | an empty local still leaves at once |
| Q-7 | push a template create/duplicate on v3 or v4 after boot | same transaction appends the server `template/{id}/seed_version` move; pull carries it | removed or invalid row not moved; restore (`removed_at` null) of an old template moved too |
| (h) | live sheet under a hidden location, removal older than the newest revision | its own restore entry; restoring puts back only its removed ancestors | sheets tombstoned by the removal stay removed |
| R1 | concurrent `block/{id}/config` puts | merge line names the keys that differ | identical configs: line as today |
| Q-11 | `file/{id}/block_id` put of "not-a-uuid" | `op_invalid`, never 500 | |

</intent-contract>

## Code Map

- `e2e/ai-features-off.spec.ts:116`, `e2e/panel-capture.spec.ts:87`, `e2e/tree.spec.ts:205,331`, `e2e/panel-capture-pipeline.spec.ts:67` -- Q-1.
- `apps/web/src/surfaces/points/points-surface.tsx:98-108`, `point-writes.ts:214-217`, `packages/domain/src/points/checks.ts:84-86`, `packages/domain/src/schemas/snapshot.ts:87-91` (`pointsOfLiveLocals`) -- Q-2.
- `packages/domain/src/relatorio/measurement-evaluation.ts:403-440` (`columnLowest`, `applyRelative`), `conclusion.ts:78-90,220-240`, `packages/domain/src/parse/pt-br-number.ts:97`, `apps/web/src/surfaces/ficha/measurement-field.tsx:118-130,336-350` -- Q-3, Q-14.
- `packages/domain/src/relatorio/pre-issue.ts:450-456`, `site-checklist.ts:283` -- Q-4.
- `apps/web/src/surfaces/local/verificacoes-surface.tsx`, `apps/web/src/surfaces/ficha/cabine-block.tsx` -- Q-5.
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx:366-380`, `packages/domain/src/relatorio/removal.ts:34,92,187,266-302` -- Q-6, Q-13.
- `apps/api/src/db/template-seed-upgrade.ts`, `apps/api/src/sync/apply.ts` (`applyServerBatch`, the push transaction) -- Q-7.
- `packages/domain/src/relatorio/sumario.ts:591-620` (`restorableEntries`), `relatorio/location-live.ts:61`, `removal.ts:147` (`removedAncestorIds`) -- (h).
- `packages/domain/src/merge/info.ts:35-47,329` -- R1.
- `packages/domain/src/ops/apply.ts:62-69,80,115` -- Q-11. `templates/compose.ts:375-383` -- Q-12. `apps/web/src/copy/pt-br.ts:595,1147` -- Q-17.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- ledger (Story 14.2 (g) and (h) at ~1812-1822, 14.3/14.4 open failures ~1966, 14.5 R1 and R2 ~2107-2116).

## Tasks & Acceptance

**Execution:**
- Q-1 -- Fix the nine tests (`ai-features-off` 11.8-E2E-001, `panel-capture` 9.2-E2E-001/-002/-003/-005/-006, `tree` 4.5-E2E-001/-002, `panel-capture-pipeline` 9.2-E2E-004) as the matrix says. 4.5-E2E-001's TAG list and the order of `openPalette` come from `paletteItems(seed, location, equipment)` or from the eight plus the library group's heading and rows; 4.5-E2E-002's count and 11.8-E2E-001's from `equipmentTypesOf(SEED_VERSION)`; the "Outro…" chips (pipeline) by name from the kernel's list for the relatório's seed.
- Q-2 -- Kernel: one function that answers the live points the list draws (the `pointsOfLiveLocals` rule over raw point and location rows, e.g. `livePointsOfLocals(points, locations)`), used by `pointMoveOrderKey` and by `pointPlace`'s count, and by the snapshot itself so the rule lives once. Web: `move` and `pointPlace` pass the location rows. Kernel test plus a `@p1` step in `e2e/points.spec.ts` (a site point on a removed local, Alt+ArrowDown on the first manual point: outbox holds the `order_key` put, announcement "1"→"2 de 2").
- Q-3 -- Kernel: a number cell a `relative_to_lowest` criterion covers is positive-only (exposed on the evaluated cell); `parseReadingPtBr` (or a kernel wrapper the field calls) answers invalid for a value at or below zero there, with its own kernel-composed message beside the generic one; a stored non-positive cell gets verdict null and a "conferir" helper; `suggestConclusionPair` answers null and the suggested text never says "dentro dos critérios" while such a cell stands. Web: `measurement-field.tsx` typed and dictated paths use it. Kernel tests (0, 40, 41; 0, 0, 900; negative) and a step in `e2e/cta.spec.ts` (type 0: invalid message, outbox unchanged).
- Q-14 -- `applyRelative`'s helper never reads within the limit for an out cell: show one decimal when integer rounding would equal or cross the limit (150,4 against 100: "50,4 % acima…"). Kernel test.
- Q-4 -- Kernel: `siteNcWithoutPoint(snapshot)` and its text, worded like `siteUnansweredText` (authored: "Verificações do local com NC sem ponto de atenção: Sala dos trafos e Geradores"); one `pending` `section_9` row (kind `site_checklist_nc_without_point`), after the unanswered row. Kernel test; one assertion in `e2e/verificacoes-local.spec.ts` where it already answers NC (row present, then gone after "Criar ponto de atenção").
- Q-5 -- Render `CabineBlock` on the Verificações surface above the items (expanded, editable, as on a local's first sheet; the same `cabineSeOp`/`cabineEnvOp`). Leave out what needs a sheet (the "Observações rápidas" chips that write `sheet/{id}/observations`, and the display-read photo if its target needs a block; say which in the report). Translate any `.frame-*` rule it first renders there. Web unit test plus a `@p0` step in `e2e/verificacoes-local.spec.ts` on a local with no equipment: fill one SE and one AMBIENTE field, assert the ops in the outbox, reload, values back; 390 px fit.
- Q-6 -- Kernel: `LocationRemovalCounts` gains the local's answered site items, site photos (`file` with `location_id`) and site points (live points with its `location_id`); `countParts` composes them (authored); a kernel `locationRemovalAsks(counts)` answers whether to confirm (sheets or any of these). Web: `requestRemoveLocation` reads it and passes files and points to the plan. Kernel tests; a `@p1` step in `e2e/local-painel-coluna.spec.ts` (local with answers only: Confirm shown, sentence and restore entry name the counts).
- Q-13 -- `locationRestorePlan` (and the block restore if it shares the hole): when a live sibling holds the restored row's `order_key`, the plan adds an `order_key` put that places it right after that sibling. Kernel test.
- Q-7 -- `apps/api/src/sync/apply.ts`: after a pushed batch is folded and before commit, for each template id it created, restored (`removed_at` null) or otherwise brought to an older `seed_version`, run the per-template step of `upgradeTemplateSeeds` (extract it from `template-seed-upgrade.ts`; same `templateSeedUpgrade` answer, server op `system:identity`, own batch id) in the same transaction. Boot pass kept. Api integration test through `POST /api/sync/ops`: create on v3, then a duplicate on v4; both rows on `SEED_VERSION` with `version` kept, the pull returns the move; an invalid row is left and logged.
- (h) -- `restorableEntries`: every live block whose location is in `hiddenLocationIds` is its own entry whatever `since` (detail authored, naming the location path it brings back); restoring it puts `removed_at = null` on `removedAncestorIds` of its location only. Kernel test in `removal-readers.test.ts` style (two devices' logs, an emission between) and a `@p1` e2e in `e2e/local-painel-coluna.spec.ts` seeding the stranded sheet through the sync route as a second device.
- R1 -- `merge/info.ts`: a reported concurrent `block/{id}/config` pair names the keys whose values differ, with kernel labels (configuration option labels, test names), e.g. authored "CTA-C01: configuração de Ana mantida (a mais recente prevalece); diferem: polos, E6". Kernel test.
- Q-11 -- `carriedBlockId` validates a uuid as `carriedLocationId` does; api integration test (`op_invalid`).
- Q-12 -- `enabledSubBlocks` reads the locked keys at the block's own seed version. Kernel test pinning the lookup.
- Q-17 -- the Adicionar local description takes the mock 42 sentence ("… o agrupamento por tipo e as Verificações do local …") on a seed with site items and today's on v1-v3; the "Do local" note says where SE and AMBIENTE print on the seed in hand (check `print/section-9.ts`); both kernel functions by seed version, authored where reworded.
- Ledger (`deferred-work.md`, new section "Deferred from: Epic 14 QA fix batch (2026-10-14)" plus strikes): Q-15 strike and reword 14.5 R2 (the kernel reopens an Emitido relatório as Em revisão on a config change, `status-advance.ts:30`, pinned by `status-advance.test.ts:43-62`; question to Matheus: wanted, or Configuração read-only once concluded); R1 entry gains the dated note that the merge line now names the keys, per-key family still the architect's (contract 20); (h) closed by this batch; Q-8 (owner Matheus, joins (h)); Q-9 (owner Matheus); Q-10 added to (g); Q-4 counter and parecer (owners Matheus and Bruno); Q-16 (owner: the next print story); Q-18 added to the open-failures entry (owner: next carry-over); the `_tmp_13_*` files (pnpm 12.5.1's link probe in the `install` container, outside this repository; owner: tooling). Each entry `source_spec` this file.

**Acceptance Criteria:**
- Given the nine Q-1 tests, when run on `desktop-chrome`, then all pass, and a tenth library type in a later seed changes no literal in them.
- Given every fix above, when its fix is reverted in the working tree, then the test named for it fails (record the mutation run for Q-2, Q-3 and Q-7).
- Given the story gate (lint, static, test:unit, test:api, touched specs on `desktop-chrome` and `durability-desktop-chrome`), when run, then it is green apart from the known reds named in the launch prompt.

## Design Notes

Q-3 choice: refused at input. `relative_to_lowest` judges a reading by its percentage above the lowest positive
reading of its column; a zero or negative contact resistance has no percentage and no physical meaning, so the
criterion cannot judge it, and a verdict invented for it would put a false excess in the conclusion text. The
field refuses it with an authored message (e.g. "Informe um valor maior que zero: o critério compara com o menor
do lado"); a non-positive value already stored is shown as "conferir" and withholds the suggestion.

Q-4 rule: a point carries `location_id` only when created from a site item, but not the item, so "an NC item with
no point" is read as more NC site items than live points with that `location_id`. An item link would be a new
field (contract bump): not built.

## Verification

Commands from the worktree root (podman; never on the host): `podman compose --profile tools run --rm --user root tools pnpm test:unit -- <path>`; after a kernel edit `podman compose restart api`; every Playwright, full unit or api run under `lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'`, started with `nohup` into `.scratch-e14fix/<name>.log`, polled. Targeted e2e: `pnpm exec tsx scripts/e2e.ts e2e/<spec>.ts --project desktop-chrome --grep <id>`.
