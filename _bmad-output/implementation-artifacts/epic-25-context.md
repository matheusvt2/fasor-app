# Epic 25 Context: Bruno's 33 improvements

<!-- Compiled by John (bmad-agent-pm) on 2026-11-11 from the correct-course run (sprint-change-proposal-2026-11-11.md), Matheus's decisions of 2026-11-11 and a read of the product code of main 76c74711. Edit freely. -->

## Goal

Bruno's document of 2026-11-11 (M01 to M33) and his answers to the Epic 24 questions become five things.

On every seed, first and alone (wave 1, its own deploy):
- what is typed is saved when the technician leaves the sheet: the conclusion text, the manufacturer, the readings;
- a sheet edit is sent by itself, not after the photo uploads and not only when the Sync screen is opened;
- each issued revision keeps the parecer and the pairs it printed.

On seed v15, for new relatórios only:
- a sheet with no measurement does not accept Aprovado; the conclusion text names a Reprovado by hand and the tests left unmeasured; a rise of exactly 50 % is "com restrição"; a reading cell or a row can be N/A; a point names every reading out of its criterion;
- a measurement test may take rows the technician adds; the thermography asks "Realizada" or "Não realizada", with points by type; the ground grid takes more points; the No-break de comando is tested; the TC asks about its secondary; "A SECO";
- every measured table prints its criterion and its result on each row; the corrected columns say "(corrigido)"; the variation note is short; the fixed texts, the cover and the ratio headers are corrected.

On every seed, on screen only:
- a stale conclusion text blocks issuing;
- the test's voltage in the instrument header can be changed on the sheet;
- three more warnings before generating; Etapa 4 marks the instruments the sheets use; Cadastros warns on a shared certificate;
- the test base is applied as an update;
- the Conferência por IA says when it is out of date, and three checks are fixed rules.

Every relatório on v1 to v14 keeps its verdicts and prints byte-identical.

**Sources, gitignored, pt-BR:**
- `docs/context/epic-25/melhorias-identificadas-bruno-2026-11-11.txt`: M01 to M33;
- `docs/context/epic-24/respostas-bruno-2026-11-11.md`: his answers;
- `docs/context/epic-25/levantamento-m01-m18-2026-11-11.md`, `levantamento-m19-m33-2026-11-11.md`: each item against main, with paths (lines of `7b68f225`; read the file again on your base).

Cite Bruno by item or by answer number. Never copy his sentences into a tracked file, a PR body or a commit message. Never name a client or a site. Labels, options, item wordings and corrected fixed texts that become product content are written in the stories.

## Stories

The text of each, with its DoR, ACs and DoD, is in `epics.md` § Epic 25. The overridden records are the `source-deltas.md` rows of 2026-11-11.

| Story | Title | Dev model · Effort | Applies to | Depends on |
| --- | --- | --- | --- | --- |
| 25.1 | The Epic 25 frames in the mocks | opus · medium | n/a | the planning PR merged |
| 25.2 | What is typed is saved | opus · high | every seed | 25.1 Part A, for the read-only look only |
| 25.3 | A sheet edit is sent by itself | opus · high | every seed | 25.1 Part A, for the alert only |
| 25.4 | The revision keeps the verdicts it printed | opus · high | every seed | none |
| 25.5 | Seed v15 opens and the v14 layout is locked | opus · high | v15 | the Epic 24 deploy; fix batch e24y merged |
| 25.6 | A sheet with no measurement does not accept Aprovado | opus · high | v15 | 25.1 Part B, 25.5 |
| 25.7 | A stale conclusion text blocks issuing; the text names a Reprovado by hand and the tests left unmeasured | opus · high | the block on every seed; the text on v15 | 25.1 Part B, 25.5 |
| 25.8 | A contact rise of exactly 50 % is "com restrição" | opus · medium | v15 | 25.5 |
| 25.9 | N/A on a reading cell and on a row; the helper of a limit inside a range | opus · high | the cell on v15; the helper on every seed | 25.1 Part B, 25.5, 25.6 |
| 25.10 | A point created from a test names every reading out of its criterion | opus · high | v15, new points | 25.1 Part B, 25.5 |
| 25.11 | The test's voltage in the instrument header can be changed on the sheet | opus · medium | every seed | 25.1 Part B |
| 25.12 | Three warnings before generating | opus · medium | every seed | 25.1 Part B |
| 25.13 | The instruments of a relatório follow its sheets | opus · medium | every seed | 25.1 Part B, 25.12 (the same file) |
| 25.14 | A row the technician adds in the field | opus · max | v15 | 25.1 Part B, wave 2 merged |
| 25.15 | The thermography: "Não realizada", points by type | opus · high | v15 | 25.14 |
| 25.16 | The ground grid takes continuity points beyond the five | opus · medium | v15 | 25.14 |
| 25.17 | The No-break de comando is tested | opus · high | v15 | 25.14; B-1 and B-2 answered |
| 25.18 | The TC asks about its secondary; the oil transformer's hints | opus · medium | v15 | wave 2 merged |
| 25.19 | One name for the insulating medium, and "A SECO" | opus · high | v15 | wave 2 merged; B-4 for the oil half |
| 25.20 | The criterion and the result print on each row; "(corrigido)" | opus · max | v15 | the printed frame of 25.1; wave 3 merged |
| 25.21 | The variation note names only what matters | opus · high | v15 | 25.20; B-7 answered |
| 25.22 | The fixed texts, the cover and the headers | opus · high | v15; the names on every seed | 25.1 Part B, wave 3 merged |
| 25.23 | The test base is updated without importing it again | opus · high | company types | 25.1 Part B, wave 3 merged; the new revision's file for its production run |
| 25.24 | The Conferência por IA: out of date, and three fixed rules | opus · high | every seed | 25.1 Part B, wave 4 merged |

## Decisions (Matheus, 2026-11-11, "ok")

1. The Epic 24 deploy is not held for any of this.
2. Epic 25 starts with saving and sync (M02, M03, M17 and the stored half of M01), alone, with its own deploy.
3. A row the technician adds in the field is built once, as a shared capability, before the three stories that use it.
4. The No-break's tests enter seed v15. Matheus aligns with Bruno that this changed since 2026-11-10.
5. Criterion and result per row in print, with "20 °C (corrigido)" and "75 °C (corrigido)": seed v15 only.
6. A sheet with no measurement does not accept Aprovado and suggests "Marcar não ensaiado".
7. A stale conclusion text blocks issuing, and the suggested text names a Reprovado chosen by hand and the tests left unmeasured.
8. Instruments: warn before generating when the calibration date, the validity or the certificate is missing, without blocking; tick the instruments from the sheets; warn on registry rows that share a model or a certificate.
9. Oil names (M29, with M11's "A SECO"): Bruno is asked first.
10. The Conferência por IA is the last wave.
11. Fixed texts, the cover and the headers: seed v15, together.

Not in scope: M04, M08, M15, M28 (done), and what fix batch e24y is doing (M33's sentences, the QGBT thermography's title, the tolerance written "220 V ± 5 %" and "≥").

*(2026-11-11, later.)* Matheus also decided the ten questions M-1 to M-10 of the proposal ("pode mergear e seguir"): the list, the waves and the batches are approved; an NC item may carry several points; Story 25.4 keeps the printed verdicts on the revision; no "Salvo às hh:mm" per field; N/A per cell on v15 only; **the conclusion and section 10 name every reading out of criterion on v15 (it joins Story 25.10)**; **a restriction chosen by hand over a clean sheet prints no recommendation that points at nothing (it joins Story 25.7)**; the AI check runs only on a tap; a stale text blocks on every seed; two deploys. The table is in `sprint-change-proposal-2026-11-11.md` § "The ten questions, decided".

## Facts the batches share

Verified on 2026-11-11 on main `76c74711`. Paths are under `packages/domain/src/` unless they name another package. Line numbers move: read each file again on your base.

- **Current versions.**
  - `SEED_VERSION = 'v14'` (`seed/definitions.ts:66`). Seed v14 is on main, not deployed; `V14_HASH` is re-pinned until the Epic 24 deploy (`seed/seed.test.ts:2200`). Production runs seed v13 on `1528183f`.
  - `CONTRACT_VERSION = 47` and `MIN_CONTRACT_VERSION = 47` (`contract/version.ts`). The next free number is 48 unless fix batch e24y takes it.
  - `LAYOUT_LOCK_VERSIONS` is v5, v11, v12, v13 (`packages/domain/fixtures/layout-lock/op-log.ts:69`). There is no v14 golden yet.
- **Fix batch e24y** (`spec-e24y-pass-fixes.md` once it merges) comes before every Epic 25 batch. As planned on 2026-11-11 it adds v14 flags for print (the paired insulation tables fitted whole, a value kept with its unit), makes a confirmed conclusion text follow a TAG rename, and changes the sentences Bruno corrected, the QGBT thermography's title and the tolerance's written form. Read its spec on your base for what it built. It does not change "Aplicado por você. Equipamento fora de carga." (question B-3).
- **The seed v15 gate.**
  - A verdict, seed content or a printed page changes on v15 only, through a definition key of the v15 seed or a flag of its `rules` object, read by `seedRule(seedVersion, flag)` (`seed/definitions.ts:214`, `seed/schema.ts` `seedRulesSchema`). Never through a version number.
  - Story 25.5 opens `seed/v15.ts` equal to v14. Each later batch adds its own fenced section and its strip helper in `seed.test.ts`, as `withoutE24a`, `withoutE24p` and `withoutE24s` do for v14, and re-pins `V15_HASH`. The PR that merges second re-pins it on the merged main.
  - A company type is not tied to a seed. Its sheets follow the flags of the relatório they sit in.
  - A test that asserts a v14 verdict or page is pinned to v14 by an addition (`seedVersion: 'v14'`).
- **Saving** (wave 1).
  - `apps/web/src/input/use-field-commit.ts`: the hook's last effect disposes the pending value on unmount.
  - `apps/web/src/state/drafts.tsx`: drafts are saved on `visibilitychange` and `pagehide` only.
  - `apps/web/src/components/generated-text-field.tsx`: the conclusion text; `onChange` starts no idle commit; before "Editar" a bordered `div role="textbox"`.
  - `apps/web/src/components/registry-picker-field.tsx` (`commitLeft`) and `apps/web/src/surfaces/ficha/ficha-fields.tsx` (the picker's `onChange` guard): the manufacturer.
  - `apps/web/src/components/number-input.tsx`: readings commit on blur or Enter, never on idle, by design; `flushOnUnmount` exists and only `nameplate-section.tsx` sets it.
- **Sync** (wave 1).
  - `apps/web/src/sync/engine.ts`: `SYNC_INTERVAL_MS`, `nudge`, the single-flight cycle (push, uploads, pulls).
  - `apps/web/src/state/sync.tsx` `requestSyncCycle`: called after a photo or a reading only.
  - `apps/web/src/sync/client.ts`: `requestHeadersTimeoutMs` bounds JSON requests; `send` (files) is unbounded.
  - `apps/web/src/db/commit.ts` `commitBatch`: the one place a commit passes.
  - `packages/domain/src/sync/counts.ts` `syncBadgeState`: the badge's states.
- **Verdicts.** `relatorio/conclusion.ts` (`computeFloor`, `effectiveConclusionPair`, `printedConclusionPair`, `composeConclusion`, `conclusionTextState`), `relatorio/parecer.ts` (`effectiveParecer`: a stored verdict stricter than the derived one holds as the engineer's choice). The revision row: `schemas/entities.ts` `revisionRowSchema`; the issue job: `apps/api/src/jobs/generate/job.ts` `commitRevision`.
- **Before generating.** `relatorio/pre-issue.ts`: one `blocking` row today (`parecer_missing`); `conclusion_stale` is `pending`; the section 11 rows skip an instrument with no calibration date. The server refuses on any blocking row (`apps/api/src/http/generate.ts`).
- **Reading cells.** `relatorio/reading-cells.ts` `ReadingState` has no N/A; the stored cell's schema accepts `not_applicable`. A "Não medido" is filled (`relatorio/sheet-progress.ts`).
- **The previous visit.** `relatorio/restriction.ts` `applyHistoryRise` (a rise above `history_rise_out_pct`); `print/history-note.ts`; a `last_results` reading keeps no verdict (`schemas/entities.ts` `lastResultReadingSchema`).
- **Points.** `points/derived.ts` `sheetPointFindings` (one entry per test, the worst reading named); `points/priority.ts` (the deadline counts from the point's creation date).
- **The instrument header.** `relatorio/instrument-pick.ts` `instrumentHeaderOf` copies the registry's default as `test_parameter`; the header is one stored value of the test (`ops/path.ts` `TEST_FIELDS`). Per-row voltage: `relatorio/row-voltage.ts`. Section 11's union: `print/section-11.ts` `section11Instruments`.
- **Measurement tests.** `seed/measurement.ts` (the grammar; `choice_pass`; seeded operators are limits only). A cell is addressed by the row's index in the definition (`ops/path.ts` `sheet/test/cell`; `ops/apply.ts` `assertMeasurementCell`). `types/draft-edit.ts` `addDraftMeasurementRow` is the office's row adder.
- **Seed content the stories change.**
  - Thermography: `seed/v13.ts` `TERMOGRAFIA` (four rows, `em_carga`, `applies_when`).
  - Ground grid: `seed/v13.ts` `CONTINUIDADE_MALHA` (five optional rows, "≤ 0,5 Ω entre pontos").
  - No-break: `seed/v14.ts` `NO_BREAK_COMANDO` (`tests: []`, eighteen plate fields).
  - TC: `seed/v10.ts`, `seed/v14.ts` `withE24sTpTc` (six items on v14).
  - Insulation options: `seed/v12.ts`, `seed/v13.ts` (`OLEO_ISOLANTE`, NATUREZA DO LÍQUIDO), `seed/v1.ts` (the subtype "Á SECO"); readers `relatorio/oil-rule.ts`, `relatorio/temperature-correction.ts`, `relatorio/nameplate-copy.ts`, `relatorio/dry-insulation.ts`, `reading/build.ts`.
  - Fixed texts and cover: `seed/sections-v1.ts` (every seed uses it); `relatorio/section-variables.ts` (`{obra}`, `section3Blocks`); `print/section-10.ts` `validityLine`; ratio headers in `seed/v1.ts` (`connection_columns`).
  - Closed lists that need a contract to grow: `SUB_BLOCK_KEYS`, `ITEM_KEYS`, `EQUIPMENT_BLOCK_TYPES` (`schemas/block-config.ts`).
- **Print.** `print/section-9.ts`: `measurementTestPart` (values only), `CONTENT_WIDTH_EM` 58, `READING_FIT_WIDTH_EM` 60, the fit down to 5 pt. Headers: `relatorio/temperature-correction.ts` `CORRECTED_PRINT_HEADER`, `WINDING_PRINT_HEADER`. Goldens: `apps/api/src/jobs/generate/golden/`. Regeneration needs `GOLDEN_UPDATE=1`, and never for an older seed.
- **The test base.** `types/test-base-import.ts` (`planTestBaseImport` skips a held type; `testBaseRecommendationOf`).
- **The Conferência por IA.** `apps/web/src/surfaces/export/use-audit.ts`, `apps/api/src/jobs/audit/` (prompt `audit-1`, four kinds), `packages/domain/src/audit/`, `schemas/entities.ts` `auditRunRowSchema`. The sheet's own checks: the cell's `outlier` in `relatorio/reading-evaluation.ts`, `rowVoltageNotice` in `relatorio/row-voltage.ts`.
- **Names on screen.** `apps/web/src/copy/pt-br.ts` `composer.equipmentNames` ("TP — proteção", "TC — proteção").
- **Test data.** The test company is Empresa A, `a@teste.local`. `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake`. Fixtures are synthetic. Nothing of Bruno's base or of a client's relatório enters a tracked file.

## Coordinator's readings (open to Matheus)

Each is written under its story in `epics.md`.

- **25.1.** The frames of the stories still open (25.17, 25.19, 25.21) are drawn with the coordinator's reading and marked so.
- **25.3.** The alert is one line and one badge state. A push between two files is enough.
- **25.4.** The printed verdicts are kept on the revision, beside the technician's choice, and not written over it (M-3).
- **25.6.** The sheet is not turned Reprovado by itself. A pass or fail answer is not a reading.
- **25.7.** The block applies to every seed (M-9).
- **25.9.** The N/A cell is offered on v15 only (M-5).
- **25.12.** The three rows are `pending`.
- **25.13.** The mark from the sheets is derived, not a stored tick. A shared model is a lighter line than a shared certificate.
- **25.14.** An added row is the sheet's, not the equipment's: no previous visit. The maximum is 30 rows per test.
- **25.15.** One required choice replaces "Equipamento em carga". "Fora de carga" becomes a reason.
- **25.17.** The four tests and their shape, until B-1 and B-2 are answered.
- **25.20.** "On each row" is two columns. The pass or fail tests print them too unless the frame shows them as noise.
- **25.21.** Relevant, short and "many" as written, until B-7 is answered.
- **25.22.** The TP and the TC are named plainly. The earth-resistance paragraph is removed as asked (B-12).
- **25.23.** The update never publishes. A type from before the story gets no text replaced by itself.
- **25.24.** The check is marked out of date and never runs by itself (M-8).

## Open items

- **Bruno, B-1 to B-17** (`sprint-change-proposal-2026-11-11.md` § 6), in one message through Matheus. Four hold a story: B-1 and B-2 (25.17), B-4 (the oil half of 25.19), B-7 (25.21). The others do not block.
- **Matheus, M-1 to M-10** (the same section). M-1 is the approval of the story list, the waves and the batches. Each of the others has a default, taken unless he says otherwise before its batch starts.
- **Authored sentences.** Every story lists its authored pt-BR sentences in its PR. They go to Bruno with the message of its deploy.
- **The new revision of the test base** has not arrived (Story 25.23).
- **Paid checks** on Matheus's AWS login before the last deploy: the plate eval if Story 25.19 changes the options the prompt reads; the prompt `audit-2` of Story 25.24.
- **Later, not planned:** how automatic points should work; the previous visit of an added row; counting a deadline from the issue date; a "Salvo às hh:mm" per field.

## Batch plan

There are at most two batch stacks up at a time (the 2026-10-08 load rules). Each batch runs `bmad-build-auto` in its own worktree, following `epic-batch-orchestrator.md`. The coordinator hands out a free port base before each launch.

| Wave | Tag | Stories | Dev model · Effort | Contract | Base |
| --- | --- | --- | --- | --- | --- |
| 0 | coordinator | 25.1 | opus · medium (`bmad-ux`) | none | main after the planning PR |
| 1 | e25a | 25.2, 25.3 | opus · high, high | none | main after Part A is approved and fix batch e24y has merged |
| 1 | e25b | 25.4 | opus · high | main's number plus one at its merge | the same, beside e25a |
| 2 | e25c | 25.5, 25.6, 25.7, 25.8, 25.9, 25.10 | opus · high, high, high, medium, high, high | main's number plus one | main after the Epic 24 deploy and Part B's approval |
| 2 | e25d | 25.11, 25.12, 25.13 | opus · medium, medium, medium | none expected | main after Part B's approval, beside e25c |
| 3 | e25r | 25.14, 25.15, 25.16, 25.17 | opus · max, high, medium, high | main's number plus one | main after wave 2's gate and fix batch |
| 3 | e25s | 25.18, 25.19 | opus · medium, high | main's number plus one | the same, beside e25r |
| 4 | e25p | 25.20, 25.21, 25.22 | opus · max, high, high | main's number plus one | main after wave 3's gate and fix batch |
| 4 | e25t | 25.23 | opus · high | main's number plus one, if the index's text needs a key | the same, beside e25p |
| 5 | e25q | 25.24 | opus · high | main's number plus one | main after wave 4's gate and fix batch |

### Merge order

1. The planning PR. Then Story 25.1's Part A, and Part B behind it.
2. e25a and e25b, in the order their PRs open. The second merges main first.
3. Wave 1's gate, its two-pass review, its fix batch, its hands-on pass, and its deploy on Matheus's word. It comes after the Epic 24 deploy.
4. e25c and e25d side by side. e25c merges first if both are ready: it owns `seed/v15.ts` and `relatorio/pre-issue.ts` is touched by both.
5. Wave 2's gate, review and fix batch.
6. e25r and e25s side by side. The second re-pins `V15_HASH` on the merged main.
7. Wave 3's gate, review and fix batch.
8. e25p and e25t side by side. Then wave 4's gate, review and fix batch.
9. e25q. Then wave 5's gate, review and fix batch.
10. The paid checks, the hands-on pass, then the deploy on Matheus's word. Seed v15 freezes there.

### Coordinator decisions

- **A story whose Definition of Ready is still open is skipped, not guessed.** If B-1 and B-2 are open when e25r starts, the batch builds 25.14 to 25.16 and 25.17 moves to the next wave's lane. The same holds for 25.21 in e25p, and for the oil half of 25.19 in e25s.
- **Contracts.** Numbers are not reserved. A batch that needs one takes main's number plus one when it merges main before its PR. `MIN_CONTRACT_VERSION` follows each bump unless a PR shows a reason not to. Each bump has an api integration test through the sync route.
- **Shared files and expected conflicts.**
  - `seed/v15.ts`, `seed/seed.test.ts`, `seed/schema.ts`: e25c, then e25r and e25s side by side, then e25p.
  - `relatorio/pre-issue.ts`: e25c (the block) and e25d (the warnings), side by side; then e25q reads it.
  - `relatorio/conclusion.ts`: e25c (25.6, 25.7), then e25r (the thermography's clause).
  - `print/section-9.ts`: e25c (the N/A cell), e25r (the added rows, the "Não realizada" line, the No-break's tests), e25p (the two columns, the headers).
  - `apps/web/src/surfaces/ficha/measurement-field.tsx` and `measurement-test-section.tsx`: e25a (the commit on unmount), e25c (the N/A cell, the helper), e25r (the added rows).
  - `apps/web/src/sync/engine.ts`, `client.ts`: e25a only.
  - `schemas/entities.ts`: e25b (the revision), e25q (the audit run).
  - `schemas/block-config.ts`: e25r (the test keys), e25s (the item key).
  - `points/derived.ts`: e25c only.
  - `contract/version.ts`: each batch appends its paragraph.
  - `deferred-work.md`: each batch writes under its own heading.
  - `apps/web/src/copy/pt-br.ts`: different keys per batch.
- **The tap budgets** get their v15 run in e25c, and are checked again in e25r (the thermography's required answer) and in e25s (the TC's seventh item).
- **Bruno's relatórios in production.** After each deploy, a read-only preview checks that a relatório of an older seed prints as before.

## Gates

- **Each batch** runs the story gate: lint, static, test:unit, test:api and its touched specs.
  - Touched specs include every spec that asserts seed counts, the item, sub-block or type lists, the conclusion row, the rows before generating, a pending op or the outbox, section 8, section 9's tables, section 10 or the names "TP — proteção" and "TC — proteção" (`grep -rln` over `e2e/`).
  - A batch that changes the op fold, the commit path or a live query on the ficha also runs its touched durability specs on the matrix projects. That is e25a, e25c (the N/A cell) and e25r.
- **After each wave:** `podman compose restart api web`, then one integrated gate on main (`pnpm test:e2e`, `test:e2e:full` and the matrix), then the two-pass integrated review, then one fix batch if needed.
- **Before each deploy:** the hands-on pass in the browser on the integrated main, its report tracked under `_bmad-output/test-artifacts/manual/`; the "before the deploy" rows of `deferred-work.md`. Before the last one, also the paid checks.
- **Deploys.** Wave 1 alone. Then one after the last wave, where seed v15 freezes. Each on Matheus's word.
