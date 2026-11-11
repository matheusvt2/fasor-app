---
title: 'e24b, the screen lane: the conclusion preview, the NC phrase, the point question, the TAG rule, a renamed TAG keeps its history, small screen fixes (Stories 24.5 to 24.9, 24.21)'
type: 'feature'
created: '2026-11-10'
status: 'ready-for-dev'
baseline_revision: '1528183f3abfc76b842dcf3fc79bce86142db1ae'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Wave 1 screen lane of Epic 24 as the coordinator cut it: six stories on the ficha, the Pontos screen, the TAG and the reuse of equipment, every seed, one contract bump (24.21), one review, one gate, one PR.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Bruno's answers of 2026-11-10 (questions 24, 27, 28, 29) and the hands-on pass ask for six screen-level changes on every seed: the suggested conclusion reads as if concluded (24.5); an NC phrase stays behind when the row goes back to C/NA (24.6); a point created from a row stays when its cause is gone, with no question (24.7); the suggested TAG is named after the local (24.8); a renamed TAG loses the equipment's history at the next relatório (24.21); seven small rough edges (24.9).

**Approach:** Build each story as `epics.md` § Epic 24 writes it (24.5 :7819-7876, 24.6 :7877-7953, 24.7 :7954-8045, 24.8 :8046-8129, 24.9 :8130-8218, 24.21 :9073-9198; read each one whole, with its dated notes; a dated note wins over the sentence it amends). The kernel decides every list, text, count and verdict; the web renders from IndexedDB and writes existing ops. 24.8 and 24.21 are built once, in 24.21's form (one match function, a stored write-once `reuse_key`). One contract bump for 24.21's row field.

## Boundaries & Constraints

**Always:**
- Red first: each AC below gets a test that fails on `1528183f` before the code (kernel unit first, then the web unit, then the story's e2e). Test ids as the stories' DoD names them (`24.5-UNIT`, `24.5-E2E-001 @p0`, ...). A new `@p0` e2e asserts the committed state (IndexedDB store or outbox), not only the screen.
- AD-1/AD-13: which half is a preview, which observation is automatic, which points a row asks about, the TAG and the reuse key, the counts and every derived text are kernel functions in `packages/domain`; `apps/web` never computes them. Static copy in `apps/web/src/copy/pt-br.ts`, component chrome in `copy/ui.ts`, derived text in the kernel (AGENTS.md "Where a new user-facing string goes"). Every pt-BR sentence authored here is marked `// authored (e24b, listed for Bruno)` and listed in the spec's "Authored sentences".
- Screens from the approved mocks with the mock's class names (`prototype/screens/60-ficha.html` rules :319-370 and :77-78, `61-verificacoes-local.html`, `72-pontos.html`, `41-templates.html`, `42-template-composer.html`; grep, never read whole). `tokens.css`/`components.css` unchanged; each mock rule mirrored in `apps/web/src/styles/app.css` with a comment naming it (AGENTS.md "Mock container selectors").
- Nothing an existing relatório prints changes: layout-lock goldens v5, v11, v12 and the Porto Seguro golden stay byte-identical; fixtures change by additions only; `V13_HASH` and every seed file unchanged.
- The binding rules of main after e24h: a point exists only when a person creates it; an observation never floors anything, on every seed (H9). Where a story sentence assumes an automatic point or an observation floor, the e24h rule wins (see D6).
- Every container run: `podman compose run --rm --user root tools ...` from the worktree (project `fasor-e24b`, `.env` present). Every `test:unit`, `test:api` or Playwright run under the host lock, started with nohup, logged under `.scratch-e24b/`, polled in bounded calls of at most 55 s: `(nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c 'podman compose run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/x.spec.ts --project desktop-chrome --project durability-desktop-chrome' > .scratch-e24b/x.log 2>&1; echo EXIT=$? >> .scratch-e24b/x.log) &`. `podman compose restart api` after any change under `packages/domain` or `apps/api`, before `test:api` or an e2e. Narrow runs while iterating (`pnpm exec vitest run --project @app/web <file>`, one spec with `--grep`).

**Never:**
- No seed change, no golden regeneration (a golden that moves is a defect: stop and report), no new op family beyond 24.21's create field, no put path for `reuse_key`.
- Never edit `epics.md`, `source-deltas.md` for the contract number, `epic-24-context.md`, the sprint change proposal. Never use docker, touch the main checkout or its stack, run `down -v`, or run Playwright outside the lock.
- No product decision beyond the stories and their "Coordinator's reading" (build those as written, list them in the PR).

## I/O & Edge-Case Matrix

| Story | Input / State | Expected |
|---|---|---|
| 24.5 | open ficha, floor A·Sem, nothing stored, any seed | row "Prévia da conclusão" + pill "Prévia" + "Confirmar"; both groups preview (no `aria-checked`, floor segment `.is-floor`); line "Prévia: só vale depois de Confirmar ou de Concluir ficha." described by both groups |
| 24.5 | result stored by a tap, restriction from floor | row gone; only the restriction group in preview; the line still describes it |
| 24.5 | "Confirmar" / "Concluir ficha" / Não ensaiado / no floor / `conclusionAdjusted` | no preview anywhere; stored pair written as today; section 9 prints no mark for a preview pair |
| 24.6 | NC row, observation = one chip, or two chips joined by `insertPhrase`, final period aside; → C or → NA | observation removed in the same batch; no warning |
| 24.6 | observation typed, or chip + typed words; → C or → NA | kept; line "Observação mantida: o texto foi editado." (`role="status"`) + "Apagar observação" (removes, toast "Desfazer" restores); same on a local's row |
| 24.6 | learned phrase "X" and recent "X." | chip offered once |
| 24.6 | "Limpar", C→NC, NC cleared, blank observation | as today, no warning |
| 24.7 | sheet/local NC row with live point(s) `origin: 'nc'`, same owner and `item_key` (created by the tap, or pre-e24h "Editar"); → C or → NA | ConfirmDialog "Remover o ponto de atenção deste item?", description names the point(s) by section 8 position (kernel), "Manter ponto" focused first, "Remover ponto" destructive; the row shows the new result behind it; Remover → result + point removals (+ 24.6's observation clear) in ONE batch; Manter/close → result (+ clear) only, point flagged "Origem resolvida" |
| 24.7 | NC row with no stored point, or a `manual` point of the same equipment | nothing asked |
| 24.7 | point in `resolvedOriginPoints` (any origin) on Pontos | card shows "Origem resolvida" + "Remover ponto" → existing removal confirmation → "Desfazer" restores |
| 24.8 | no breaker; add Disjuntor MT | "DJ-01", then "DJ-02"; helper "Sugestão do app. Troque pela TAG da placa, do diagrama unifilar ou a usada no local." |
| 24.8 | live "TR-1","TR-2" | "TR-03"; seccionadora "SC-01"; CTA on "Geradores" "CTA-01"; company copy prefix TR → next free "TR-NN" (shares the numbers); 100+ → three digits; removed rows never count |
| 24.8 | sheet moved | no rename offered (`moveTagSuggestion` null) |
| 24.21 | keyed obra (created after this batch), TAGs renamed "52-1", "TF-A"; second relatório | every placement binds its equipment (step 2), none created, TAGs stand, "Anterior"/"Copiar da última visita"/MANUT. ANTERIOR shown, a contact rise judged against the first visit |
| 24.21 | old obra (SEC-C05, DJ-C05, CE-ENEL, TR-1, no key, `last_results`) | binds by TAG (step 3), no op on those rows; DJ-C05 renamed before → that placement creates a new keyed row |
| 24.21 | template +1 breaker / block removed then re-added / moved to Coluna 6 / palette "QM8" + "Salvar como template" / two rows one key / keyed vs unkeyed same string / keyed renamed to another's legacy TAG | as 24.21's ACs: new key `DJ-C05-2` created; unbound then rebound; new equipment; both bind their own; smallest id; keyed wins; each binds its own |
| 24.21 | a put to `equipment/{id}/reuse_key`; rename, move, remove, restore | refused by path parse; key unchanged |
| 24.21 | layout-lock, Porto Seguro, replay fixtures, `e2e/support/relatorio-seed.ts` | built with the legacy rule: no `reuse_key` on any row, drafts byte-equal, goldens byte-equal |
| 24.21 | pull at the previous contract | 426 `contract_outdated`; current answered; old push accepted |
| 24.9 | each of F9, F11, F16, F17, F19, F20, F1, row 3022, row 1439, table alignment | as 24.9's ACs; the printed text of every value pinned unchanged |

</intent-contract>

## Code Map

- **24.5** `packages/domain/src/relatorio/conclusion.ts` -- `conclusionFloor` :134, `effectiveConclusionPair` :220, `chosenConclusionPair` :239, `printedConclusionPair` :255, `conclusionAdjusted` :264, `conclusionSuggestion` :316 (add `conclusionPreview(block, definition, visit): { result: boolean; restriction: boolean }`: a half is a preview when the sheet is tested, a floor exists and that half's cell is not filled; place it right after `conclusionSuggestion`, kept small: e24f and e24a edit this file). `apps/web/src/surfaces/ficha/conclusao-section.tsx` :215-217 (effective pair), :427-458 (SuggestionField + two `ConclusionPair`); `apps/web/src/components/suggestion-field.tsx` :92 (needs a pill-text prop; `ui.ts` :117-123); `copy.ficha.conclusao` (`pt-br.ts` ~:1681, `suggestionLabel`). The `ConclusionPair` component (grep in `surfaces/ficha/`) gets a preview value: no checked segment, the floor's segment `.is-floor`, `missing` still false.
- **24.6** `relatorio/ficha.ts` `clearsNcObservation` :223, `insertPhrase` :233, `recentChecklistObservations` :191; `registry/nc-phrase-row.ts` `ncChipPhrases` :39 (dedupe by `normalizeRegistryName` of the phrase without its final period), `typedPieces` :124 (the rule: no typed piece, offered phrases taken with and without a final period). Replace `clearsNcObservation` by `ncObservationOnLeave(from, to, observation, chips): 'clear' | 'keep' | null` (`keep` = the warning). `apps/web/src/surfaces/ficha/checklist-section.tsx` `ChecklistRow` :362, `choose` :437-442 (shared by `surfaces/local/verificacoes-surface.tsx` :45); the kept look `.e24-kept`, `.e24-kept-line` (`60-ficha.html` :365-368, item 2 of DJ-01 :799).
- **24.7** `points/checks.ts` `ncRowPointPositions` :186 (the owner + `item_key` match, `NcRowOwner`), `livePoints` :15; add `pointsAskedOnLeave(points, owner, itemKey, from, to): PointRow[]` and the description text (kernel; mock `60-ficha.html` :1525-1535: "O ponto de atenção 5 foi criado a partir deste item, que agora está Conforme. Se mantiver, ele fica com a marca “Origem resolvida”."; N.A. and plural forms authored). `relatorio/ops.ts` `removePointOp` :59. `points/derived.ts` `resolvedOriginPoints` :378 (read only). `apps/web/src/components/confirm-dialog.tsx` :34 (cancel focused first). `apps/web/src/surfaces/points/points-surface.tsx` :87, :197 (flag → `.poa-flag-row` with "Remover ponto", `72-pontos.html` `#pontos-7-t`, `#pontos-dlg-remove`). The row holds the chosen value as pending while the dialog is open and writes on the answer.
- **24.8 / 24.21** `relatorio/tag.ts` -- `TAG_PREFIX` :13 (SEC → SC), `suggestTag` :98. Keep today's rule frozen as `legacySuggestTag(type, location, existing, definition)` with a frozen `LEGACY_TAG_PREFIX` (SEC); new `suggestTag(type, existing, definition)` = `PREFIX-NN`, NN the smallest free from 1 among live TAGs matching `^PREFIX-0*(\d+)$` (normalized), padded to 2 (3 from 100). Add `equipmentMatchKey(row)` (`reuse_key` else `normalizeTag(tag)`). `schemas/entities.ts` `equipmentRowSchema` :381 -- `reuse_key: z.string().optional()` (never defaulted). `ops/path.ts` `EQUIPMENT_FIELDS` :49 unchanged (no put path). `relatorio/instantiate.ts` :300-355 -- the run of 24.21 (keys over this run's keys via `legacySuggestTag`; step 2 keyed rows by key, smallest id; step 3 unkeyed rows by normalized TAG, smallest id; step 4 create with key + new `suggestTag` over `taken`); `PriorEquipment` :82 gains `reuse_key`; `InstantiateInputs` gains `tagRule?: 'current' | 'legacy'` (legacy: created TAG by `legacySuggestTag`, no key written: byte-equal drafts). `relatorio/tree.ts` `duplicateTagSuggestion` :687, `paletteItems` :817, `newEquipmentBlock` :879 (optional `placement?: { location: TagLocation; equipment: readonly (TagEquipment & { reuse_key?: string })[] }`: with it, the key = `legacySuggestTag` free among the obra's live match keys; without it, no key). `relatorio/move.ts` `moveTagSuggestion` :59 → always null (doc why); `relatorio/panel.ts` :238. `merge/conflicts.ts` :535 (comment only). `contract/version.ts` (paragraphs at :470 and :748 style, `CONTRACT_VERSION` :478, `MIN_CONTRACT_VERSION` :755). Web: `surfaces/relatorio/tree-actions.ts` `createPair` :308-350 (pass `placement`), `block-palette-field.tsx` :277, `relatorio-tree.tsx` :455, `move-block-dialog.tsx` :44, `surfaces/project/new-relatorio-dialog.tsx` (passes `existingEquipment` with `reuse_key`), the TAG field helper `copy.ficha.nameplate` (`pt-br.ts` :1490 "Do bloco · editável"). Legacy-rule callers (by addition): `packages/domain/fixtures/layout-lock/op-log.ts`, `e2e/support/relatorio-seed.ts` :144, `apps/api/src/jobs/generate/page-layout.test-support.ts`, `apps/api/src/sync/rules.test-support.ts`, and every unit/api/e2e test that asserts a legacy TAG out of `instantiateTemplate` (pass `tagRule: 'legacy'` rather than rewriting the assertion; list them). Contract tests: `contract/contract.test.ts` :105-111, `apps/api/src/sync/sync.integration.test.ts` "1.5-API-005 contract skew" :1119 (precedent: `git show 1528183f -- apps/api/src/sync/sync.integration.test.ts`).
- **24.9** each item's file is named in the story's "Today" list (`relatorio/tap-rows.ts` :360, `photo-openers.tsx` :66-97, `applicability-band.tsx` :97 / `relatorio/applicability.ts` :192, `reading-evaluation.ts` :383-391 / `ensaios-section.tsx` :530-545, `measurement-evaluation.ts` :748-760 and :1245, `conclusion.ts` :610-611 / `readingClause` :447, `local-dialog.tsx` / `relatorio-tree-shared.tsx` :134, `db/home-store.ts` :47-66 / `templates-surface.tsx` :200, `pt-br.ts` :1798-1800, `e2e/support/merged-fixtures.ts` :49-61); the alignment rule `60-ficha.html` :77-78; the mock texts in MOCK-GUIDE § 2026-11-10 rows "TAPS helper" … "Templates that cannot be read". Lines are those of `dbcdb720`; grep the symbol.

## Tasks & Acceptance

The work is done in two parts, each by one implementation pass, in this order. Part A: 24.8 + 24.21. Part B: 24.5, 24.6, 24.7, 24.9 (24.6 before 24.7: same row component). Each part ends with lint, static, its unit tests and its e2e specs green under the lock, and a WIP commit.

**Execution (Part A):**
- `relatorio/tag.ts`, `tag.test.ts` -- legacy rule frozen (today's `tag.test.ts` cases run against `legacySuggestTag` unchanged), new `suggestTag`, `equipmentMatchKey`, `reuseKeyFor(type, location, equipment, definition)` -- 24.8 rule and 24.21 key.
- `schemas/entities.ts`, `ops/apply.ts` (check only: the create keeps the key, an old row parses to the same bytes) -- the optional field.
- `relatorio/instantiate.ts` + `instantiate.test.ts` (`24.8-UNIT`, `24.21-UNIT`) -- the run, `tagRule`, the three obras of 24.8 and every obra of 24.21's ACs, both tie-breaks, drafts byte-equal under `tagRule: 'legacy'`.
- `relatorio/tree.ts`, `move.ts`, `panel.ts` + tests -- new suggestion everywhere, `newEquipmentBlock` placement key, move offers no rename.
- `contract/version.ts` + `contract.test.ts` + `sync.integration.test.ts` -- `CONTRACT_VERSION` = the value on main + 1 (42 on `1528183f`; the orchestrator renumbers at PR time if e24a merged first), `MIN_CONTRACT_VERSION` the same, two paragraphs in the 41 style (24.21: a bundle on the previous contract strips `reuse_key` when it folds an equipment create, so its next relatório misses the equipment).
- `apps/api/src/sync/equipment-reuse-key.integration.test.ts` (new, `24.21-API-001`) -- a create with the key through the sync route read back by a second device, a put to `equipment/{id}/reuse_key` refused, cross-tenant refused.
- Web -- `tree-actions.ts`, `block-palette-field.tsx`, `relatorio-tree.tsx`, `move-block-dialog.tsx`, `new-relatorio-dialog.tsx`, the TAG helper copy; web unit tests that assert a suggested TAG follow the new rule.
- Fixtures/e2e -- legacy rule passed by the fixture builders above; `e2e/tag-suggestion.spec.ts` (`24.8-E2E-001 @p0`, `24.8-E2E-002 @p0`), `e2e/equipment-history.spec.ts` (`24.21-E2E-001 @p0`, `24.21-E2E-002`); update every spec that creates a relatório through the screen and asserts a suggested TAG (`grep -rln "SEC-\|DJ-C\|CE-ENEL\|TR-1\b\|CTA-\|renameTo\|Renomear para" e2e/`; 4.1-E2E-003 first); run the touched durability specs on the matrix.
- Row 2727 (`block-palette.tsx`): fixed only if Part A edits that file.

**Execution (Part B):**
- 24.5 -- `conclusionPreview` + `24.5-UNIT` (v5 and v13 fichas: stored, half-stored, floor-only, not tested, no floor); `conclusao-section.tsx`, `suggestion-field.tsx`, the `ConclusionPair` component, `pt-br.ts`/`ui.ts` copy; `app.css` mirror of `60-ficha.html` :319-354 (preview segments and line); web unit tests per state; `e2e/conclusion-preview.spec.ts` (`24.5-E2E-001 @p0` at 768 px with the preview PDF, `24.5-E2E-002` at 390/1280 + dark + half-stored + accessible description).
- 24.6 -- kernel rule + chips dedupe + `24.6-UNIT`; `ChecklistRow` (clear, kept warning, "Apagar observação" with "Desfazer"); `app.css` mirror of :365-368; web unit tests on a sheet and a local; `e2e/nc-phrase-follows-item.spec.ts` (`24.6-E2E-001 @p0` through the preview PDF's section 9, `24.6-E2E-002`); `ficha.durability.spec.ts` and `verificacoes-local.durability.spec.ts` on the matrix.
- 24.7 -- `pointsAskedOnLeave` + text + `24.7-UNIT`; `ChecklistRow` pending choice + ConfirmDialog; Pontos card action; web unit tests (three exits, the card action); `e2e/point-question.spec.ts` (`24.7-E2E-001 @p0` both answers through the DOCX section 8, `-002` resolved `reading` point removed and restored, `-003` the local's NC item: point created by the tap, then the question with both answers); touched durability specs on the matrix.
- 24.9 -- each item with its kernel test pinning the printed text beside the screen text (`24.9-UNIT`), web unit tests of the local dialog switch and the Templates notice, the three copy keys removed, `signIn` waits up to 15 s, the alignment rule in `app.css`; `e2e/pass-screen-fixes.spec.ts` (`24.9-E2E-001 @p0`, `-002`, `-003`, plus the alignment check comparing the units' right edges in one table).

**Acceptance Criteria:**
- Given each matrix row and each story AC in `epics.md`, when its test runs on `1528183f`, then it fails, and after the change it passes.
- Given the layout-lock (v5, v11, v12), Porto Seguro and replay fixtures, when built and compared, then every golden is byte-equal and no equipment row carries `reuse_key`.
- Given the story gate, when it runs, then lint, static, test:unit, test:api and every touched spec on `desktop-chrome` and `durability-desktop-chrome` are green, and the touched durability specs are green on the matrix projects.

## Design Notes

- **D1, one match (24.8 with 24.21).** Story 24.8's two-candidate match is not built: the batch builds 24.21's form directly (its dated note allows it). 24.8's AC "an obra with old TAGs" is 24.21's step 3; its AC "an obra created under the new rule" is step 2.
- **D2, the legacy rule's role.** `legacySuggestTag` is used for: the placement key (instantiate and palette), and fixtures/tests through `tagRule: 'legacy'`. Nothing on screen shows it.
- **D3, no rename on move.** The suggestion no longer depends on the local, so `moveTagSuggestion` returns null and the move dialog shows no rename checkbox; the key keeps the old local's code (a moved sheet's equipment keeps its key; a block moved in the template creates a new equipment, 24.21's stated limit).
- **D4, palette key order limit.** A palette breaker added at a coluna already holding one gets the key `DJ-C05-2`; a template saved from that relatório places the two breakers in their tree order, so if the added one sits before the original, their keys swap at the next relatório. Not fixed (the placement has no stable id); recorded as a known limit.
- **D5, row 3037 (a relinked point keeps its `item_key`).** Story 24.7 asks by owner + `item_key`, as the story defines; a point relinked to another equipment is asked about by its new owner's row of the same item. An immutable source (the block id at create) or a relink guard is a product decision: not built, the row stays open for Matheus.
- **D6, H9 over 24.6's fifth AC.** After e24h's H9 an observation floors nothing on any seed, so a kept observation on a v13 ficha no longer floors Com restrições; the test asserts "floors nothing" on v13.
- **D7, the contract number.** Main is at 41; e24a holds 42 if it merges first. The batch takes main + 1 at PR time and says so in the PR; it does not edit the planning files for the number.

## Verification

**Commands:**
- `podman compose run --rm --user root tools pnpm lint` and `pnpm static` -- clean.
- Under the lock: `pnpm test:unit`, `pnpm test:api` -- green.
- Under the lock: `pnpm exec tsx scripts/e2e.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` -- green; the touched durability specs again with the three matrix projects.

## Spec Change Log

## Review Triage Log

## Authored sentences

## Changed tests
