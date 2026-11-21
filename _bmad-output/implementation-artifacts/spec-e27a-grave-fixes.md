---
title: 'e27a slice 1: the grave findings of the 2026-11-21 pass (Stories 27.3 to 27.7)'
type: 'bugfix'
created: '2026-11-21'
status: 'in-progress'
baseline_revision: 'e7cd4259f86ee6caacea578eb697b08b988a0dd7'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-27-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_why: 'Epic 27 wave 1 is one batch and one PR (token economy of 2026-11-12); slice 1 holds Stories 27.3 to 27.7, slice 2 (27.1, 27.2) follows on the same branch after e26a reaches main.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The 2026-11-21 manual pass (`_bmad-output/test-artifacts/manual/ux-pass-2026-11-21.md`) found that an open ficha with a reading out of criterion is named "reprovada" in the parecer (F7), points of attention save with no action, deadline, priority or owner and the Gerar dialog folds that into a misleading count (F8, F12), the template shows FO.SERV-03 numbers instead of the numbers the relatório will carry (F9), Cadastros › Critérios hides the Tabela 100.1 the fichas judge by (F10), and the "Corrigido a 20 °C" column is cut at 1024x768 with the tree open (F13).

**Approach:** Kernel first (`packages/domain` composes every count, text, number and criterion row), then thin screen wiring, then one CSS rule. Stories in order 27.3, 27.4, 27.5, 27.6, 27.7; each reads its story in `_bmad-output/planning-artifacts/epics.md` under "## Epic 27" (grep `### Story 27.N`, read with offset/limit, never the whole file).

## Boundaries & Constraints

**Always:**
- The printed bytes of every existing seed (v1 to v16) stay identical: no golden, layout lock or `pdf-text.json` changes. If one turns red, STOP and report; never regenerate.
- 27.3's new section 10 sentence reaches the print only through a new seed rule flag `parecer_open_apart` (added to `seedRulesSchema`, set by no seed in this run; Story 27.8 sets it on v17). The screen shows the split on every seed.
- Derived text in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts`; chrome in `copy/ui.ts`. Every new pt-BR sentence carries `// authored (Story 27.x, listed for Bruno)`.
- Nothing blocks saving or issuing (27.4). Old data is never rewritten.
- Code, comments, commits English; UI pt-BR; no emoji anywhere.
- E2E: new `@p0` specs assert committed state (outbox or store) as well as the screen (E12-A6); find by grep every spec and unit test that asserts a string, count or number you change and update it (E24-A3 P-3); list the grep and its hits in your report.

**Never:**
- Edit `apps/api/src/sync/rules.ts`, `packages/domain/src/contract/version.ts`, seeds `packages/domain/src/seed/v1.ts`..`v16.ts` or their pinned hashes, `epics.md`, `sprint-status.yaml`, `docs/kbs/`, `apps/web/src/surfaces/relatorio/sumario-surface.tsx`, `ops/path.ts`, `contract/errors.ts`, `apps/web/src/app.tsx`.
- No contract bump in this slice. No new op kind.
- Do not change `lastSendText` (the Sync status surface uses it; `e2e/sync.spec.ts`, `e2e/sync-status.spec.ts` assert it).
- Do not reorder relatório sections at creation (instantiate's order stays).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 27.3 open out only | 1 open tested ficha DJ-01 whose floor result is Reprovado; none concluded | `derivedParecer` = nao_apto; screen text: "...: 1 ainda não concluída. 1 ficha em aberto com leitura fora do critério: DJ-01."; no "reprovada" word; Critérios item "em aberto com leitura fora do critério (DJ-01)" | none |
| 27.3 both | DJ-01 concluded Reprovado + DJ-02 open with floor Reprovado | reprovada sentence names DJ-01 only; open sentence names DJ-02 (plural form "2 fichas em aberto com leitura fora do critério: A e B.") | none |
| 27.3 replaced | stored verdict Apto, derived nao_apto | Etapa 6 hint line and Sumário row 10 meta: "O parecer escolhido (Apto) foi substituído por Não apto: 1 ficha em aberto com leitura fora do critério (DJ-01)." | stored not looser → existing reason line unchanged |
| 27.3 print v16 | same states, flag off | `parecerTextForPrint` byte-identical to today | — |
| 27.3 print flag on | vi.mock `seedRule` returns true for `parecer_open_apart` | print text equals the screen text | — |
| 27.4 bare point | one point, no action/deadline/priority/owner | dialog explicit rows: "1 ponto sem ação", "1 ponto sem prazo", "1 ponto sem prioridade", "1 ponto sem responsável"; "Gerar relatório" enabled; card and editor: "Falta: ação, prazo, prioridade, responsável" in amber | — |
| 27.4 count | 6 listed rows + 7 others | "e mais 7 avisos nas linhas do sumário; nenhum impede gerar."; 1 other: "e mais 1 aviso na linha do sumário; não impede gerar."; 0 listed non-blocking rows: no "e mais " lead | 0 others: no line |
| 27.4 not-tested point | origin `not_tested`, no action | "Falta:" never names "ação" (not asked, as `pointsWithoutAction`) | — |
| 27.4 last send | any other device push | dialog line "Último envio de {nome} (qualquer relatório): dd/mm hh:mm" | — |
| 27.5 standard | standard template | each composer row's number = position of that section in `instantiate`'s sorted section list (7 and 9 counted) | duplicates keep template order |
| 27.6 tab | Cadastros › Critérios | seeded rows + every row of Tabela 100.1 and 100.5, each table with its "Vale quando..." line | — |
| 27.7 1024 tree open | ficha with corrected column, 1024x768, rail auto/open | corrected column hidden, `.corrected-stacked` shown, table width <= container | 1280: column shown |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/parecer.ts` -- `countedSheets` :85, `reprovado` :118, `derivedParecer` :178 (unchanged), `parecerReasonText` :212, `parecerCounts` :256, `composeParecer` :363, `parecerTextForPrint` :530 (the only print caller, via `print/section-10.ts:147`).
- `packages/domain/src/relatorio/conclusion.ts` -- `conclusionFloor` :175 (`?.pair.result`), `effectiveConclusionPair` :356 (the floor that makes an open ficha "reprovado").
- `packages/domain/src/relatorio/sheet-state.ts:128` -- `sheetState(block, ctx)`; `'concluida'` marks concluded.
- `packages/domain/src/seed/schema.ts:1046` -- `seedRulesSchema` (strict, `z.literal(true).optional()` flags); `seed/definitions.ts:218` `seedRule`. Toggle pattern for tests: `packages/domain/src/print/criterion-per-row.test.ts:21` (vi.mock of `seedRule`).
- `packages/domain/src/relatorio/sumario.ts:270-275` -- row 10 meta = `parecerVerdictLabel(effectiveParecer)`; append the replaced line here (kernel), so `sumario-surface.tsx` is not touched.
- `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx:68,163` -- reason hint line under the segments; composed text and criteria at :172.
- `packages/domain/src/relatorio/pre-issue.ts` -- `PreIssueKind` :59, points rows :403-419, last-send rows :594, `EXPLICIT_KINDS` :621, `precheckCountMetaText` :655, `exportPrecheck` :669.
- `packages/domain/src/points/checks.ts` (`pointsWithoutAction`, `pointsSemAcaoText`), `points/priority.ts:133` (`pointsSemPrazo`); point fields `action`, `deadline`, `priority`, `owner`, `origin` (`schemas/entities.ts:748`).
- `apps/web/src/surfaces/export/export-dialog.tsx:517-545` -- explicit rows and the count line (`countText` + `.pc-meta` `countMetaText`).
- `apps/web/src/surfaces/points/points-surface.tsx:349-375` -- card `dl.poa-fields` with `t.none` dashes; amber helper pattern `<span className="helper" data-tone="amber">` at :321. `points/point-editor.tsx` -- typed `action`/`owner` state (:164,:183), live `priority`/`deadline` (:316-317).
- `packages/domain/src/templates/compose.ts:713-723` -- `ComposerSection.number = sectionNumber(...)`; `relatorio/instantiate.ts:80` `creationPosition`, :300-309 the creation sort (template sections + generated 7 and 9, stable sort by `creationPosition`).
- `apps/web/src/surfaces/templates/section-list.tsx:38,104` -- `copy.composer.sectionsNote`, `.block-tag` number. `apps/web/src/copy/pt-br.ts:419` `sectionsNote`, :625 `nameHelper`, :631 `printTitleHelper`.
- `packages/domain/src/seed/criteria-tables.ts:75,95` -- `NETA_100_1`, `NETA_100_5`; used by `seed/v13.ts:35-41` (equipment per table). `relatorio/reading-evaluation.ts:351` `voltsText` (private), `minimumText`, `rowCriterion` :371 (fallback helper wording). `apps/web/src/surfaces/registries/criterios-tab.tsx` -- the tab.
- `apps/web/src/styles/app.css:1264-1271` -- e23v `.corrected-stacked` rule; `apps/web/src/surfaces/ficha/ficha.css:68-81` -- rail rules (`data-rail` auto/open/closed on `.ficha-body`, `ficha-surface.tsx:184`).
- `e2e/temperature-correction.spec.ts:27-125` -- setup recipe for a ficha with the corrected column (v14 oil transformer, plate, cabine ambient, a typed AT reading).
- `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/EXPERIENCE.md:312` (Measurement table), :350 (Data table Critérios) -- dated amendments go here.
- `e2e/support/groups.ts:29` `SERIAL_SPECS` -- a new spec that issues a document or times a tap goes there.

## Tasks & Acceptance

**Execution:**

*Story 27.3 (kernel, then web)*
- `packages/domain/src/seed/schema.ts` -- add `parecer_open_apart: z.literal(true).optional()` with a doc line (Story 27.3: section 10 names open fichas with a reading out apart from reprovadas; set on v17 by Story 27.8). No seed sets it.
- `packages/domain/src/relatorio/parecer.ts` -- define an "open out" ficha: tested, `sheetState !== 'concluida'`, and `conclusionFloor(...)?.pair.result === 'reprovado'`. (An open ficha whose Reprovado is only stored, with no floor, stays among the reprovadas: open question.) Add `openOut: string[]` to `ParecerCounts` and keep `reprovado` as today (the floor rule is unchanged). `composeParecer(snapshot, options?: { print?: boolean })`: when `!print || seedRule(seed, 'parecer_open_apart')`, the reprovada sentence/findings, `byReason` and the Critérios "reprovadas" item use the concluded reprovadas only, and an open sentence follows it: "1 ficha em aberto com leitura fora do critério: DJ-01." / "N fichas em aberto com leitura fora do critério: A e B." plus Critérios item "em aberto com leitura fora do critério (A, B)"; with the split off the text, items and basis are byte-identical to today. Add `openOut` to the basis only when the split is on and it is non-empty. `parecerTextForPrint` passes `{ print: true }`. `parecerReasonText` (screen only) splits its Não apto parts the same way. New `parecerReplacedText(snapshot): string | null`: non-null when a stored verdict exists and is looser than `derivedParecer`: "O parecer escolhido ({stored}) foi substituído por {derived}: {parts}." with the parts of `parecerReasonText`. Export it from the domain index.
- `packages/domain/src/relatorio/sumario.ts` -- row 10 meta: `join([verdictLabel, parecerReplacedText])` when replaced.
- `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx` -- the hint under the segments shows `parecerReplacedText ?? parecerReasonText` (one line).
- `packages/domain/src/relatorio/e27a-parecer-open.test.ts` (new, "27.3-UNIT") -- counts and texts over open-out, concluded reprovada, concluded aprovada; singular and plural; replaced line; flag off: `parecerTextForPrint` equals the pre-change composition (assert against the old sentence literally for a v16 snapshot); flag on via `vi.mock` of `seedRule`: print equals screen. Update existing unit tests whose expectations change on screen (e.g. `sumario.test.ts:322`).
- `e2e/parecer-open-ficha.spec.ts` (new, "27.3-E2E-001 @p0") -- v16 relatório; with nothing judged tap Apto in Etapa 6 (outbox holds `setup.parecer.verdict` apto); type an out-of-criterion reading on DJ (e.g. contact resistance above 250 µΩ) without concluding; Etapa 6 hint and Sumário row 10 `.sum-status` show the kernel's replaced line; the composed summary shows the open sentence and no "reprovada". Expected strings computed by the kernel over the device's rows (the `temperature-correction.spec.ts` pattern).

*Story 27.4 (kernel, then web)*
- `packages/domain/src/points/checks.ts` -- `pointsSemPrioridade`, `pointsSemResponsavel` (live points, null/blank), texts "1 ponto sem prioridade"/"N pontos sem prioridade", "1 ponto sem responsável"/"N pontos sem responsável"; `pointMissingFields(point)` returning the ordered subset of `['acao','prazo','prioridade','responsavel']` (no `acao` for origin `not_tested`) and `pointMissingText(fields)` → "Falta: ação, prazo, prioridade, responsável" or null.
- `packages/domain/src/relatorio/pre-issue.ts` -- kinds `points_sem_prioridade`, `points_sem_responsavel` (severity `info`, row `section_8`); add `points_sem_acao`, `points_sem_prazo` and the two new kinds to `EXPLICIT_KINDS`. `ExportPrecheck.countText`: "e mais N avisos" when the dialog lists any row above it (blocking or explicit), else "N avisos"; `precheckCountMetaText(n)`: " nas linhas do sumário; nenhum impede gerar." / " na linha do sumário; não impede gerar." / ''. Last-send rows use a new `lastSendAnyText(name, at)` = "Último envio de {name} (qualquer relatório): dd/mm hh:mm" (the device holds `last_push_at` per user and device, never per relatório; the PR says so).
- `apps/web/src/surfaces/points/points-surface.tsx` -- when `pointMissingText` is non-null, the card shows it as `<p className="helper" data-tone="amber" data-missing="">` and the `dl` drops the rows of the missing fields (no dashes for them). `apps/web/src/surfaces/points/point-editor.tsx` -- the same amber line, from the typed action/owner and the live priority/deadline, updating as each is filled.
- `packages/domain/src/relatorio/e27a-points-missing.test.ts` (new, "27.4-UNIT") -- kinds, `EXPLICIT_KINDS`, count sentence at 0/1/many with and without listed rows, "Falta:" for each subset, last-send wording. Update `pre-issue-export.test.ts:413-414`, `export-dialog.test.tsx:1164` and every other hit.
- `e2e/point-missing-fields.spec.ts` (new, "27.4-E2E-001 @p0") -- a point saved bare: card line, Gerar dialog rows and count, button enabled; fill action, deadline, priority, owner one at a time (waiting past autosave, outbox values asserted), the line losing a word each time, the dialog row disappearing. Update the regexes in `e2e/review-concluir-text.spec.ts:53`, `e2e/review-layout-copy-3.spec.ts:390`, `e2e/status-flow-2026-10-10.spec.ts:283` and any other hit.

*Story 27.5*
- `packages/domain/src/relatorio/creation-order.ts` (new, no imports from templates) -- `creationSectionNumbers(types: readonly string[]): { numbers: number[]; generated: Record<'section_7'|'section_9', number> }`: the 1-based position each template section and each generated section takes after `instantiate`'s stable sort by `creationPosition`. `instantiate.ts` uses the same function (or its sort key) so the two cannot drift.
- `packages/domain/src/templates/compose.ts` -- `ComposerSection.number` from it; `ComposerView` gains `generatedNumbers` (section 7's and 9's).
- `apps/web/src/copy/pt-br.ts` -- `sectionsNote` becomes `(photos: number, tests: number) => ...` naming the two generated sections by those numbers; `nameHelper` and `printTitleHelper` name the section by its title ('seção "Relatórios dos ensaios"'), no fixed 9. `section-list.tsx` passes the numbers (prop from the view).
- `packages/domain/src/templates/e27a-section-numbers.test.ts` ("27.5-UNIT") -- composer numbers equal `instantiate`'s section positions over the standard template, a template missing section 2, and one with a duplicated section.
- `e2e/template-section-numbers.spec.ts` ("27.5-E2E-001 @p1") -- the standard template's `.block-tag` numbers, then a relatório created from it: each section's Sumário number equals the template's.

*Story 27.6*
- `packages/domain/src/seed/criteria-view.ts` (new) -- `criteriaTablesView()`: for `NETA_100_1` and `NETA_100_5`, the table name and edition, the equipment it judges (labels derived from the latest seed's definitions whose tests carry that `criterion_table`), the "when it applies" sentence, and rows `{ ratedText ("até 250 V", "até 34,5 kV", "acima de 34,5 kV"), testVoltageText, minimumText (via `minimumText`, "≥ 5.000 MΩ"; 100.5 oil and dry) }`; `seededCriterionAppliesText(criterion)` for the seeded rows (insulation: when the plate gives no rated voltage, or on a seed before the tables; the others: every ficha with that test). Export from the domain index.
- `apps/web/src/surfaces/registries/criterios-tab.tsx` -- a "Vale quando" line per seeded row and one `data-table` per criteria table with its heading and applies line; column headers in `copy.registries.criterios`.
- Web test of the tab over the kernel rows; `e2e/criterios-tab.spec.ts` ("27.6-E2E-001 @p1") -- the tab lists every row; a v16 disjuntor with tensão nominal 15 kV shows on its insulation row a criterion text the tab lists.
- `EXPERIENCE.md:350` -- dated amendment (the tab also lists the ANSI/NETA tables with when each applies).

*Story 27.7*
- `apps/web/src/styles/app.css` -- after the e23v rule: `@media (min-width: 1024px) and (max-width: 1279.98px)`, under `.ficha-body:is([data-rail="auto"],[data-rail="open"])`, the same two declarations as the 767.98 rule; comment naming the e23v rule it extends. Measure 768-1023 with `data-rail="open"`; if the table overflows there, extend the same rule to that range and say so.
- `e2e/corrected-column-fit.spec.ts` ("27.7-E2E-001 @p0", solo lane in `SERIAL_SPECS` if it times nothing; otherwise parallel) -- the temperature-correction setup without the DOCX; at 1024x768 rail open: column hidden, stacked line visible with the kernel's corrected text, `table.scrollWidth <= container.clientWidth`; at 1280x800 the column shows; at 768x1024 (rail open and collapsed) no overflow.
- `EXPERIENCE.md:312` -- dated amendment.

**Acceptance Criteria:**
- Given a v16 relatório in any 27.3 state, when it prints, then `parecerTextForPrint` and the layout-lock goldens are unchanged (`pnpm test:unit` and `test:api` green with no golden touched).
- Given the whole slice, when `lint`, `static`, `test:unit`, `test:api` and every new or touched spec run, then all are green except the known host reds (`theme.test.tsx`; `ficha.durability` E5-A2-E2E-002/003 at 390 px), reported as pre-existing.

## Design Notes

- "Open out" uses the floor, not the stored pair, because the floor is what makes an open ficha Reprovado today (`effectiveConclusionPair`); the minimum Não apto stays since `derivedParecer` still reads `reprovado`.
- 27.5: `instantiate` ignores the template's order across section types (it sorts by `creationPosition`), so after a reorder the composer numbers show where each section will land, not the list order. Narrowing of AC2, reported in the PR.

## Verification

**Commands** (this worktree, project `fasor-e27a`; every run under the host lock, logged in `.scratch-e27a/`, started with nohup and polled in bounded loops of at most 55 s; never `flock`, never `docker`):
- `nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c 'podman compose --profile tools run --rm --user root tools pnpm test:unit -- <paths>' > .scratch-e27a/unit-x.log 2>&1; echo EXIT=$? >> .scratch-e27a/unit-x.log` -- narrow while iterating.
- `podman compose restart api` after any change under `packages/domain` or `apps/api`, before `test:api` or a spec.
- `... tools pnpm exec tsx scripts/e2e.ts e2e/<spec>.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- spec paths before `--project`.
- Final (orchestrator): `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api`, then every new and touched spec.
