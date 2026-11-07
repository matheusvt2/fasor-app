# Epic 22 Context: Bruno's review of a concluded relatório

<!-- Compiled inline by the coordinator on 2026-11-06 from the read-only verification of main 5584a6e3 (four parallel passes: equipment and checklists, tests, print, parecer) and a production read-only count. Edit freely. -->

## Goal

Bruno reviewed the PDF of a relatório he concluded on 2026-11-04 and sent two lists. Matheus added one item of his own: attach a photo from the computer to an AI reading. The epic has four aims:

- clean the printed sheet;
- make the ficha conclusion, the points of attention and the relatório's verdict follow from what the sheets hold;
- fix the transformer, TP and test content in a new seed v12;
- show the previous visit's values, and let the office create its own equipment types.

## Stories

- Wave A
  - 22.1: Attach a photo from the computer to a reading.
  - 22.2: The printed ficha without internal lines, one N/A and the unit once.
  - 22.3: A ficha never splits from its conclusion, columns fit their words, and repeated captions differ.
  - 22.4: The ficha's conclusion follows Bruno's rules (contract 31).
  - 22.5: Every NC and every reprovação is a point of attention by itself.
  - 22.6: The CONCLUSÃO of the relatório is derived from the fichas.
- Wave B
  - 22.7: Seed v12: oil transformers, the deslocamento angular, the TP's checklist and the defect reason (contract 32).
  - 22.8: The test voltage per row of the insulation table (seed v12).
  - 22.9: The TC and TP ratio criterion follows the accuracy class (seed v12).
  - 22.10: A reading above the instrument's limit (contract 32).
  - 22.11: A short QGBT inspection sheet (seed v12).
  - 22.12: The previous visit's value beside each reading (contract 32).
- Wave C: Stories 14.6, 14.7 and 14.8, out of the backlog.

The text of each, with its DoR, ACs and DoD, is in `epics.md` § Epic 22 (14.6 to 14.8 under Epic 14). The overridden records are the eight `source-deltas.md` rows of 2026-11-06.

## Decisions (Matheus, 2026-11-06)

- **The author.** "Tudo do Bruno".
- **Item 25, the print lines.** "Remover as quatro".
- **Item 26, the parecer.** "Seguir o Bruno inteiro". This amends NFR-10, FR-29, FR-71, `EXPERIENCE.md` and the SPEC non-goal "A decision-maker".
- **Scope.** All four large items:
  - "Ensaio: tensão e classe";
  - "Cadastro e padrões": the E14-A12 gate is lifted;
  - "Manutenção anterior": the SPEC non-goal "A comparison tool" is lifted;
  - "Ficha simples de QGBT".
- **Old seeds.** "Só relatórios novos". Seed v12 applies to new relatórios. Kernel and print rules reach every relatório, Bruno's v5 one included.
- **Method.** "pode criar o epic 22 pelo metodo normal".

## Facts the batches share

- **Bruno's relatório is on seed v5.** On 2026-11-06 a production read-only count (migrate task override, counts only) found the only TR-1 sheet concluded on 2026-11-04 in a v5 relatório, still Em revisão. Every kernel or print story must be checked against a v5 relatório as well as v11 and v12.
- **Current versions.** Seed v11 (`seed/definitions.ts` line 53). Contract 30, minimum 30 (`contract/version.ts` lines 291 and 462).
- **Conclusion and parecer.**
  - The ficha conclusion lives in `relatorio/conclusion.ts`: `suggestConclusionPair`, `restrictionWarning` and `observationRequired`.
  - The parecer lives in `relatorio/parecer.ts`: `suggestParecer`, `composeParecer`, `parecerTextForPrint` and `parecerWithText`.
  - Derived points live in `points/derived.ts`. They are never stored, and a live point of a matching origin suppresses one.
  - The point origins are `manual` and `not_tested` (`schemas/entities.ts` line 607).
- **The print lines to drop.** All are in `print/section-9.ts`:
  - the attribution: lines 209 to 211 and 329 to 341, `attributionOf`;
  - "CRITÉRIO:": lines 205 to 206 and 657;
  - the measurement "ACEITÁVEL: … · fonte" row: line 741;
  - the criteria line: line 795;
  - the photo item line: lines 826 to 847, `withItemLine`.
- **Layout.**
  - Keep-whole is `keepWhole` in `print/section-9.ts` at lines 380, 403 and 439. The renderer sets keep-with-next in `apps/api/.../sections/section-9.ts` at lines 128 and 173.
  - The fitted columns are `fittedColumns`, lines 590 to 614. The skeleton pins the weights in `page-layout.test-support.ts` line 54.
- **Captions.** `photos/caption.ts` `contextCaption`, lines 317 to 324. Print adds "Imagem N: …." in `print/section-9.ts` lines 815 to 819.
- **Oil.** `relatorio/oil-rule.ts`, `relatorio/dry-insulation.ts` and `seed/legacy-options.ts`.
- **Insulation voltage.** `relatorio/instrument-pick.ts` lines 55 to 60 and `relatorio/test-voltage.ts`. Criteria are in `seed/criteria.ts` (insulation lines 44 to 53, ratio lines 64 to 73). `criterion_override` is in `reading-evaluation.ts` lines 97 to 113.
- **Reading cells.** `relatorio/reading-cells.ts` (states at lines 38 and 306 to 316) and `parse/pt-br-number.ts` (refusals at lines 130 to 146, N/A at 178 to 207).
- **Photo openers.**
  - `surfaces/ficha/camera-single-shot.tsx` (`useCameraPicker`);
  - `surfaces/ficha/photo-openers.tsx` (`useDirectPicker`);
  - `surfaces/ficha/nameplate-section.tsx` (`plateTarget` at line 211);
  - `surfaces/ficha/read-display.tsx` (display targets at lines 303, 614 and 739);
  - `surfaces/relatorio/panel-capture.tsx`.
  - Reading kinds are `plate`, `display`, `caption`, `panel` and `nc_obs`.
- **Plate structuring.** `apps/api/src/jobs/reading/providers/bedrock.ts` (field hints at line 181, select rule at lines 188 to 193). The P-2 rule of Epic 21 applies: the model reports what it perceives and the kernel composes.
- **Last nameplate (AD-25).** `print/last-nameplate.ts` and `relatorio/nameplate-copy.ts`.
- **Test data.** The test company is Empresa A, `a@teste.local`. `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake`, and no paid key appears in a test.

## Coordinator's readings (open to Matheus or Bruno)

- **Cadastro.** "Cadastrar equipamentos e editar informações padrões" means company equipment types and their defaults (Stories 14.6 to 14.8), not a registry of equipment units.
- **Item 3.** The field is relabelled DESLOCAMENTO ANGULAR and its value stays the group code, because the clock alone does not give k.
- **TP checklist.** It is the TC's v10 list.
- **Oil.** An oil unit marks no item NA until Bruno names a dry-only one.
- **TIPO DO ÓLEO** is a select of A and B.
- **Insulation rows.** The options are 0,5, 1, 2,5, 5 and 10 kV, low-voltage rows default to 1 kV, and the criterion stays > 400 MΩ. *(2026-11-07, batch e22g, from Bruno's test base rev03 (2026-11-07), TR-OL-02 and TR-SE-02: the transformer's two high-voltage rows default by the plate's TENSÃO NOMINAL AT, 2,5 kV from 601 V to 5000 V and 5 kV above; with the rating empty, unreadable or at most 600 V they take the instrument's TENSÃO ENSAIO as before; SECUNDÁRIO/MASSA keeps 1 kV.)*
- **Accuracy classes.**
  - TC: 0,3, 0,6, 1,2, 3, 5P and 10P; ~~the protection classes are judged at ± 3 %~~ *(2026-11-07, batch e22g, from Bruno's test base rev03 (2026-11-07), TC-03: 5P at ± 1 % (IEC 61869-2, ratio error at rated current), 10P at ± 3 %, the class 3 kept)*.
  - TP: 0,3, 0,6 and 1,2. *(2026-11-07, batch e22g, from Bruno's test base rev03 (2026-11-07), TP-03: plus 3P at ± 3 % and 6P at ± 6 % (IEC 61869-3, "CONFERIR NA NORMA"); seed v12 changed in place, not yet deployed.)*
  - *(2026-11-07, batch e22g: the class reader takes the old NBR notation, "0,6C25", "10B100", "0,3P75", and the IEC one, "25VA 5P20", "12,5VA 0,3", "10P20", onto the select's options, keyed on the EXATIDÃO field, review S6.)*
- **Over-range.** "OL" takes the instrument registry's top of range. A ± criterion refuses the state.
- **Caption ordinal.** The suffix is " (2)", " (3)".
- **Conclusion floor.** Its sources are listed in Story 22.4. The effective pair is the stricter of the floor and the stored pair.
- **Old manual NC points** do not suppress the new derived entries; the Pontos screen flags "Possível duplicado".
- **Section 10.** An earlier typed summary prints as "Observações do responsável".
- **QGBT short sheet.** Four fields, the Quadro elétrico's visual items and no tests.
- **Previous values.** They are matched by equipment, test key and row key.
- **Authored wordings** are listed in each PR for Bruno.

## Batch plan

There are two lanes per wave, so at most two batch stacks are up at a time. Each batch runs `bmad-build-auto` in its own worktree, following `epic-batch-orchestrator.md`. Port bases continue after Epic 21's 55 and 56.

| Wave | Tag | Port base | Branch | Stories | Dev model | Base |
|---|---|---|---|---|---|---|
| A | e22p | 57 | `e22p-print-and-attach` | 22.1, 22.2, 22.3 | opus · medium to high | main after the planning PR |
| A | e22c | 58 | `e22c-parecer-follows-fichas` | 22.4, 22.5, 22.6 | opus · high | main after the planning PR |
| B | e22s | 59 | `e22s-seed-v12` | 22.7, 22.8, 22.9, 22.11 | opus · high | main after wave A's gate |
| B | e22r | 60 | `e22r-readings-over-range-previous` | 22.10, 22.12 | opus · high | main after wave A's gate |
| C | e22t | 61 | `e22t-company-types` | 14.6, 14.7, 14.8 | opus · max, high, high | main after wave B's gate, the architecture step and the editor frames |

**Why these groupings.**
- e22p's three stories share `print/section-9.ts` and its renderer, and 22.1 is small and web-only.
- e22c's three stories share the conclusion floor: 22.5 and 22.6 read 22.4's effective pair.
- e22s owns seed v12, and 22.8, 22.9 and 22.11 extend 22.7's `seed/v12.ts`.
- e22r's two stories are reading-cell and projection work with no seed change.

**Coordinator decisions.**
- **Contracts and seed.**
  - Contract 31: e22c bumps it, and e22p takes none.
  - Contract 32: e22s bumps it and owns seed v12 (derived from v11, `V11_HASH` pinned). e22r adds its notes under 32 and does not bump again. Whichever PR merges second merges main and keeps one bump.
  - Contract 33: e22t bumps it.
  - `MIN_CONTRACT_VERSION` follows each bump unless a PR shows a reason not to.
- **Shared files.**
  - `print/section-9.ts`: e22p owns it in wave A; e22c touches only the conclusion and points print. In wave B, e22s owns the insulation table's columns and e22r adds the over-range text and the MANUT. ANTERIOR column after it merges. e22r rebases on e22s for that file.
  - `relatorio/conclusion.ts` and `relatorio/parecer.ts`: e22c only.
  - `contract/version.ts`: each batch appends its paragraph; expect trivial conflicts.
  - `deferred-work.md`: each batch writes under its own heading.
  - `copy/pt-br.ts`: different keys per batch.
- **Goldens.** Only e22p (22.3's ordinal and keep-with-next) and e22s (seed v12 does not touch the v1 fixture, so none expected) may regenerate the Porto Seguro goldens. The regeneration is reviewed in the PR.
- **Paid eval.** e22s's prompt change (22.7) and 22.9's class reading run `bedrock-eval.ts` on Matheus's word before the wave B deploy.

## Gates

- **Each batch** runs the story gate: lint, static, test:unit, test:api and its touched specs.
  - Every spec that asserts seed counts, the conclusion row, section 8 or section 10 is touched (`grep -rln` over `e2e/`, rules E14-A3 and E15-A3).
  - A batch that changes the op fold or a live query on the ficha also runs its touched durability specs on the matrix projects.
- **Cross-batch merge rule.** It applies before the second PR of a wave merges (§ 6).
- **After each wave:** one integrated gate on main (`pnpm test:e2e`, `test:e2e:full`, the matrix), then the two-pass integrated review (§ 9), then one fix batch if needed.
- **Deploys.** Each wave deploys only on Matheus's word. Bruno's v5 relatório is checked in the browser after wave A's deploy (the floor, the derived points, the derived verdict).

## Wave gates

### Wave A (coordinator, 2026-11-06)

Matheus, 2026-11-06: "pode seguir ate o final, tem minha aprovacao".

**Merges.**
- PR #266 (e22p, 22.1 to 22.3) merged first as eb61c5b4. No contract or seed change.
- PR #267 (e22c, 22.4 to 22.6, contract 31, MIN 31) merged second as b883c587, after the cross-batch rule: main eb61c5b4 merged into the branch as 045a58ae. On that head, lint, static, test:unit (5292), test:api (883) and both batches' touched specs (39 specs, 279 of 279 on desktop-chrome and durability-desktop-chrome) passed, plus the touched durability specs on the matrix (41 passed, 1 skipped). The head 7f7c775d adds only the spec's run record.

**Integrated gate on b883c587.**
- Under the host lock, wait 0 s. Load 4.10 at the start and 5.65 at the end. Only the main stack was up; the integrated reviewer ran its code-read pass without a stack.
- lint 0 (17 s), static 0 (32 s), test:api 883 passed and 6 skipped (331 s), test:unit 5292 of 5292 (221 s).
- `test:e2e:full`: 595 of 602 passed, 4 skipped, 3 failed (2576 s). All three reds follow from 22.4's conclusion floor, not from load:
  - @p0 R8DRY-E2E-001 (`dry-transformer.durability.spec.ts`) and @p0 14.2-E2E-001 (`local-painel-coluna.spec.ts`): after "Confirmar todos" and the readings, the sheet says "Placa, verificações e leituras prontas · faltam as observações" where the spec expects "Ficha completa".
  - @p0 12.5-E2E-001 (`v09-visual.spec.ts`): an open sheet's summary reads "Verificações e conclusão prontas · …" where the spec expects "Verificações prontas" (the floor fills the conclusion of an open sheet, e22c open question 1).
  - None was in e22c's touched list: they assert the progress line, not the conclusion row.
- `test:e2e:matrix`: 137 of 156 passed, 16 skipped (the WebKit Blob skips), 3 failed: R8DRY-E2E-001 on all three projects (589 s).
- Verdict: red. The three specs go to the wave A fix batch, which decides for each whether the floor or the assertion is wrong (Story 22.4's first AC: every row C and readings within criterion conclude Aprovado · Sem restrições).

**Integrated review** (`epic-22-wave-a-integrated-review-2026-11-06.md`, two passes per § 9):
- Code read first, without a stack; the behavior pass started after the gate, on its own stack `fasor-e22q` (port base 62).
- Behavior pass: every walkable AC of 22.1 to 22.6 passed at 390, 768 and 1280 px, with three dialogs. The PDF drops the four lines, prints the unit once, normalizes N/A, keeps a ficha with its conclusion, prints the caption ordinals, the section 8 entries and the section 10 verdict. Photo grouping, order, numbering and sizes are unchanged beyond the ordinal.
- Old seeds: the readers gave identical results on the Porto Seguro snapshot as stored (v1), rewritten to v5 and to v11. A contract 30 client is refused with 426.
- Second pass: 7 should-fix (S1 to S7), 9 notes (N1 to N9), no blocker.

**Fix batch e22f** (branch `e22f-wave-a-fixes`, port base 63), launched 2026-11-06 with the three gate reds, S1 to S7, N1, N3, N4 and N8; N5 to N7 deferred; N2 by the coordinator's reading (an unconcluded sheet prints no floor marks; the conclusion step counts ready only from a stored pair). Coordinator readings on the review's open questions, open to Bruno: the adjust "Confirmar" replaces a conclusion text still unedited (S1); possible duplicates get a non-blocking pre-issue row (S2); a point created from an NC row starts with the entry's text (S4); a relatório with no judged sheet has no derived verdict and stays blocked (S5).
- PR #270 (e22f) merged as 06df24b4, on an unmoved main. Story gate on 7b968ac7: lint and static green, test:api 883, test:unit 5319 after one fix of its own test, touched specs 259 of 260 then the red fixed and green alone, `dry-transformer.durability.spec.ts` 15 of 15 on the matrix; the three integrated-gate reds green. Findings: the R8DRY and 14.2 reds were fixtures typing an out-of-criterion ratio (kernel right, fixtures moved within criterion); 12.5 and N2 fixed (the conclusion step and the printed marks count only a stored pair); S1 to S4, S6, S7 (37/28 ms to 13/7 ms), N1, N3, N4, N8 fixed; S5 narrowed (no Apto without a concluded sheet; a stricter derived verdict still stands); N5 to N7 deferred. Golden: 9 lines (8 sheets' marks back to their pre-wave state, the N1 summary). Open for Matheus: whether an open sheet's floor counts in the parecer before any sheet is concluded; N3 clears on NC to C only, not NC to NA. e22f must deploy with wave A (a contract 31 client without it flags false duplicates).
- Deploy: wave A deploys together with wave B after wave B's integrated gate (one `test:e2e:full` on the integrated main instead of two); the AWS session expired on 2026-11-07 and waits for Matheus's `aws login`.

### Wave B (coordinator, 2026-11-07)

**Merges.**
- PR #269 (e22s, 22.7, 22.8, 22.9 and 22.11; seed v12, contract 32, MIN 32) merged first as b811ace9, after the cross-batch rule against e22f's main.
- PR #272 (Bruno's test base in the KB, docs only) merged as bf50118d.
- PR #268 (e22r, 22.10 and 22.12; notes under contract 32) merged as 538062a4, after the cross-batch rule: one contract bump kept, the TENSÃO column before MANUT. ANTERIOR, both `deferred-work.md` headings kept.

**Integrated gate on 538062a4.**
- Under the host lock, 68 min, load 4.3 to 8.1.
- lint 0 (41 s), static 0 (34 s), test:api green (393 s).
- test:unit 5442 of 5445: three web tests timed out under load (`relatorio-tree-edges`, `relatorio-tree-painel`, `setup-surface`) and passed 79 of 79 alone under the lock.
- `test:e2e:full`: 605 of 609 passed, 4 skipped, 0 failed, 0 flaky.
- `test:e2e:matrix`: 143 of 159 passed, 16 skipped (the WebKit Blob skips), 0 failed.
- Verdict: green.

**Integrated review** (`epic-22-wave-b-integrated-review-2026-11-07.md`, two passes per § 9): not accepted.
- B1 (blocker): words break in the v12 insulation tables, whose TENSÃO and MANUT. ANTERIOR columns overflow the fitted widths.
- S1 to S6: range unit spellings; a unit carried past an over-range row; the "Anterior" line in the outlier colour; over-range not refused on the nameplate and `sheet/test/value` paths; the R8LAY-E2E-001 settle window; `parseAccuracyClass` keyed on the option shape.
- N1 to N9 notes.

**Fix batch e22g** (branch `e22g-wave-b-fixes`, port base 64), with B1, S1 to S6, N1 to N5, N7 and three corrections from Bruno's test base applied to v12 in place (TC 5P at ±1 %, TP 3P/6P, old and new class notations, the transformer HV insulation default by rating). N6, N8 and N9 accepted.
- PR #273 merged as 1742c21f, on an unmoved main. Story gate on 08637dc0: lint and static green, test:unit 5514 of 5515 (the red, `template-composer-local.test.tsx`, outside the diff, passed 17 of 17 alone), test:api 892 passed and 6 skipped (Porto Seguro goldens unchanged), touched specs 127 of 127, `over-range.durability` on the matrix 3 of 3, R8LAY-E2E-001 with `--repeat-each 10` 10 of 10. The head d63b60b7 adds only the spec record.
- Readings beyond the brief: the B1 trigger at 60 em (every v1 to v11 transformer table measures 59.8 em and printed whole on the wave A PDF); a side-by-side pair decides MANUT. ANTERIOR together; a rating of 600 V or less keeps the instrument's voltage and a rating-chosen voltage shows no notice; S5 fixed in the test only, the `preventScroll` UX question is a `deferred-work.md` row for Matheus; S3 takes `.helper`'s `--ink-secondary`.
- Open: N2, N4 and N5 have kernel tests only; no e2e judges 5P or picks 3P/6P.
- Deploy: waves A and B deploy together after `test:e2e:full` on the integrated main and the paid plate eval, both waiting on Matheus's `aws login`.

### Wave C (coordinator, 2026-11-07)

**Merges.**
- PR #274 (e22t, Stories 14.6 to 14.8, contract 33, MIN 33) merged as 1fdea0d7, after the cross-batch rule: main 8d8edd41 (e22g #273 and the wave B records #275) merged into the branch as fed1ff19. Conflicts in `relatorio/parecer.ts` (e22g's defect bucket and e22t's per-sheet definition both kept) and `docs/kbs/log.md`. Story gate on fed1ff19: lint and static green, test:api 905, test:unit 5600 of 5601 (`template-composer-local.test.tsx` red under load, green alone), 44 touched specs 263 passed and 3 skipped, both batches' touched durability specs on the matrix 54 passed and 6 skipped.

**Integrated gate on 1fdea0d7.** lint 0, static 0, test:unit 5601 of 5601, test:api 12 red, `test:e2e:full` 602 of 612 with 6 red, the matrix 143 of 162 with 3 red. Every red came from the main checkout's api container, up 5 hours on code from before #273 and #274 (`op_path_unknown` on company type ops, contract 33 refused): the route tests and the e2e hit the live `api:3000`. After `podman compose restart api`, test:api 905 passed and 6 skipped, the six red specs 19 of 19, `company-type.durability` on the matrix 3 of 3. The playbook now restarts the api and web before an integrated gate.

**Integrated review** (`epic-22-wave-c-integrated-review-2026-11-07.md`, two passes per § 9, stack `fasor-e22w`): not accepted.
- B1: web call sites handed a company block to kernel helpers without the definition context ("Marcar os restantes" disabled on 17 open items; plate and display suggestions, Repetir, the SELV notice and conflict values empty).
- B2: text typed in the type editor was lost on a tab change.
- S1: a copy of a seeded type dropped the plate-picked criteria (a Quadro elétrico copy judged at > 400 MΩ, the relatório Não apto). S2: a block named its version by number (the deferred medium, confirmed by reading). S3: test gaps that let B1 and B2 through. S4: the type list scrolled sideways at 390 px.
- N1 to N13.

**Fix batch e22h** (branch `e22h-wave-c-fixes`, port base 64): B1, B2, S1 to S4, N1 to N6, N11 to N13; N7, N10 and the composer test flake went to `deferred-work.md` (N10 is a decision for Bruno, "≥" or ">=" in printed bands). Coordinator decisions: a copy keeps its source's judging behaviour; a block names its version row by id (contract 33 amended in place, not deployed).
- PR #276 merged as 7ba788cf, on an unmoved main. Story gate on 0dcd6b47 with the api restarted inside the lock: lint and static green, test:api 908 passed and 6 skipped, test:unit 5649 of 5649, 52 touched specs 305 passed and 3 skipped, 9 durability specs on the matrix 62 passed and 6 skipped. Mutation runs: with the B2 fix reverted 14.7-E2E-004 went red; with S2 resolving by number alone the api test went red.
- Known open (low): a refused older publish, renumbered, can become the latest version; a renumbered publish sent before a pending manual republish needs a second Reenviar; no e2e on a company sheet for "Ler visor", the post-pull banner or the SELV notice.

**Pre-deploy gate on 7ba788cf** (api and web restarted first; lock wait 0 s, load 3.0 to 7.5, 61 min):
- lint 0 (25 s), static 0 (33 s), test:api 908 passed and 6 skipped (347 s), test:unit 5649 of 5649 (207 s).
- `test:e2e:full`: 614 of 618 passed, 4 skipped, 0 failed, 0 flaky (2445 s).
- `test:e2e:matrix`: 145 of 162 passed, 16 skipped, 1 failed: @p0 21.3-E2E-005 (`photo-order.durability.spec.ts`) on android, a one-shot read of the gallery order after a move. Alone under the lock on the same commit, 8 of 8 in four runs; ledger row for the next carry-over batch.
- Verdict: green, with the one load red explained.

### Deploy (coordinator, 2026-11-07)

Waves A, B and C went out together on Matheus's standing approval ("pode seguir ate o final").

**Paid plate eval first** (Matheus's AWS login, `fasor-admin`; prompt `bedrock-structuring-5`; Textract, Haiku 4.5 and Nova Pro):
- Synthetic set: 32 of 33 on both models. The seed v12 oil plate reads 7 of 7 on both (TIPO TRICAST, TIPO DO ÓLEO B, no TIPO DE ISOLAÇÃO). The vector group table is unchanged. The one miss is the seccionadora panel, 1 of 2 on both.
- Real set (six plates in the ignored `docs/media/real-plates-2026-11-06/`): 5 of 6 on both. Haiku matches the 2026-11-06 baseline exactly. Nova Pro reads "Dd0 (diagram)" on tf3, where Haiku gives no group: a wrong group on the escalation model, recorded on the R-5 row of `deferred-work.md` (owner E21-A2).
- Not measured: the class reading ("0,6C25" to EXATIDÃO 0,6) is in neither set.

**Deploy of `ae3d37e0`** (`infra/bin/deploy`, no lock): build, push, migrate, roll, stable, health `{status, db, queue, storage, libreoffice}` all up, tag recorded. Production smoke 8 of 8 (54.7 s); telemetry 6 `session_start` on `ae3d37e0`, 0 `ux_event_sink_failed`; test company cleaned up. A GitHub release waits for Matheus's word.

**Release and production check** (2026-11-07, Matheus's word): GitHub release v0.7.0 on `ae3d37e0`. Signed in as Bruno (he typed the password), the coordinator opened his revisão 3 relatório (seed v5) read only and previewed it (38 pages, no revision generated). The new rules show: parecer Não apto derived from the fichas, 9 derived points, 8 possible duplicate pairs, 6 outdated sheet conclusion texts. Before a revisão 4, Bruno has to remove the duplicates (his 2 manual points are repeated by derived ones) and refresh the outdated texts; the TR-1 oil/epoxy contradiction stays on seed v5 until he edits the field. Three print defects went to `deferred-work.md` (owner the first Epic 23 fix batch).

## Bruno's test base against Epic 22 (coordinator, 2026-11-07)

Bruno sent `docs/context/Fasor_Base_Ensaios_MT_rev03.xlsx` (gitignored; map in `docs/kbs/project/test-base.md`). The values stay in that file; rows are cited by ID. Read against main b811ace9 and PR #268.

**Agrees with what was built.**
- LEIA-ME rule 4 (every Reprovado in the ficha, the points and the conclusion) is Stories 22.4 to 22.6.
- Rule 2 (a reading over the limit approved) is Story 22.10, except the standard observation the base adds.
- The transformer ratio criterion (TR-OL-04, TR-SE-04) and the contact criterion (DJ-03, SC-03) match `seed/criteria.ts`.
- The low-voltage insulation row's 1 kV default (Story 22.8) matches TR-OL-02 and TR-SE-02. Pendência P02 leaves Fasor's 0,5 kV practice open.

**Differs from a coordinator's reading listed for Bruno; the base is taken as his answer.** The wave B fix batch takes these three *(2026-11-07, taken by batch e22g; see Coordinator's readings above)*:
- TC-03: the 5P class has its own tolerance in the base. Story 22.9 judges 5P and 10P alike (`relatorio/accuracy-class.ts` `PROTECTION_CLASSES`).
- TP-03: the TP's classes include 3P and 6P with their tolerances. Seed v12 `TP_CLASSES` offers only the three measurement classes.
- TR-OL-02 and TR-SE-02: the high-voltage insulation rows take a default by winding voltage. Seed v12 leaves them with no default (`default_kv: null`).

**Differs, and needs Matheus or Bruno (not in Epic 22).**
- Insulation minimums by voltage and medium, corrected to 20 °C (TR-OL-02, TR-SE-02, DJ-02, TC-02, TP-02 and others), where the product keeps the single FO.SERV-03 minimum. Pendência P01 asks the same for cables.
- The insulating liquid (TR-OL `tipo_oleo`) where seed v12 has TIPO DO ÓLEO A or B. Plates print the A or B class, so both may be needed.
- The previous visit's value as a restriction criterion (TR-OL-02, TR-OL-05). Story 22.12 only shows it.
- The manufacturer's value prevailing over a table (rule 1), and automatic temperature correction (rule 3).

**New scope for after wave C**, the carrier being company types 14.6 to 14.8:
- tests chosen from characteristics ("Aplica-se quando");
- the base's tests that are not in FO.SERV-03 (IP/DAR, winding resistance, tan δ, breaker timing, coil voltage, vacuum, SF6, VLF, thermography, ground grid, capacitors, switchgear);
- the procedure as field help;
- the recommendation as the derived point's default text.

Planned through bmad-correct-course on Matheus's word.
