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
- **Insulation rows.** The options are 0,5, 1, 2,5, 5 and 10 kV, low-voltage rows default to 1 kV, and the criterion stays > 400 MΩ.
- **Accuracy classes.**
  - TC: 0,3, 0,6, 1,2, 3, 5P and 10P; the protection classes are judged at ± 3 %.
  - TP: 0,3, 0,6 and 1,2.
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
