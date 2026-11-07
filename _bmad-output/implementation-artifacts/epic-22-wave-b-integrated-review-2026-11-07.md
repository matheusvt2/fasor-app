# Epic 22 wave B: integrated review (2026-11-07)

Reviewer: integrated reviewer subagent. Main at `538062a4`, base `423207c5`. Wave B is two PRs:

- PR #269, e22s: Stories 22.7, 22.8, 22.9 and 22.11 (seed v12, contract 32);
- PR #268, e22r: Stories 22.10 and 22.12 (contract 32).

The review ran in two passes, per `epic-batch-orchestrator.md` § 9 P-1:

- **Pass 2, the code read**, ran first and needed no stack.
- **Pass 1, the behavior pass**, started after the coordinator's `gate.done` marker. The integrated gate on `538062a4` ended at 05:51 with these results:
  - lint, static and api: 0;
  - unit: rc 1, from three web tests that timed out under load (15 to 22 s): `relatorio-tree-edges`, `relatorio-tree-painel` and `setup-surface`. None is wave B code;
  - `test:e2e:full`: 605 of 609 passed, 4 skipped, 0 failed. R8LAY-E2E-001 passed in this run;
  - matrix: 0.

**Review stack.**

- Compose project `fasor-e22q`, port base 62.
- Images `localhost/app-api-e22q` and `localhost/app-tools-e22q`, with no rebuild.
- `LLM_PROVIDER` and `OCR_PROVIDER` were `fake`.
- Browsed as `a@teste.local` (Empresa A), reseeded with `seed-users --test`. The standard template moved to v12.
- The stack was stopped with `podman compose -p fasor-e22q stop` (no `-v`), and the Playwright MCP browser was closed.

Evidence is in the ignored `.playwright-mcp/e22w/` of the review worktree:

- screenshots 01 to 08;
- `r1-rev1.pdf` (revision 1 of relatório R1) and `r2-preview.pdf` (the draft of relatório R2 on the same obra), with their text in `r1.txt` and `r2.txt`;
- renders `r1-p-058.png`, `r2-p-019.png` and `r2-p-058.png`;
- the kernel scripts `compare.ts` and `fit.ts`.

## Summary verdict

**Not accepted as is: 1 blocker, 6 should-fix, 9 notes.**

- **Every AC a human can walk behaved as written**, at 1280, 768 and 390 px and in three dialogs (Não ensaiado, the field palette and the Export dialog).
- **Old seeds are unaffected.** The Porto Seguro snapshot was checked as stored (v1) and rewritten to v5 and to v11. For each, the kernel gives byte-identical results at the base `423207c5` and at main `538062a4`:
  - `layoutSpec`, the whole document model;
  - every effective conclusion pair;
  - `derivedParecer` and `composeParecer`;
  - `derivedPoints` and `preIssue`.

  A v12 rewrite runs without a throw. Bruno's v5 relatório gains nothing until another relatório of its obra is issued (then it gets MANUT. ANTERIOR, a rule meant for all) and until someone types an over-range value.
- **Contract 32 and `MIN_CONTRACT_VERSION` 32 are one bump.** `contract/version.ts:306-342` and `:524-546` keep the e22r paragraphs (22.10, 22.12) and the e22s paragraph (22.7 to 22.9, 22.11) under both constants.
- **The blocker (B1) is a print layout regression of the protected document.** The TENSÃO column of every v12 insulation table, and the MANUT. ANTERIOR column on any seed, push those tables past the page width. Words then break inside themselves ("SECUNDÁ/RIO", "TENSÃ/O", "POLARIZAÇ/ÃO", "ANTERIO/R"), which Story 22.3 AC3 forbids and which Bruno asked to fix in wave A. Seen on the real PDFs, not inferred.
- **R8LAY-E2E-001:** a hypothesis and a fix are below. No gate was run for it.

## Pass 1: behavior (browser)

R1 is relatório `01a1b538-e8d3-75f3-b7ac-51f3ed9d012e`. R2 is `01a1b545-0e35-71c9-929b-334ac1011e3a`, the same obra, created after R1's revision 1. Both are on the `fasor-e22q` volume.

| AC | Viewport | Result | Evidence |
|---|---|---|---|
| 22.7 AC1: TIPO DE ISOLAÇÃO options, TIPO DO ÓLEO A/B, "Deslocamento angular" on screen and DESLOCAMENTO ANGULAR in print | 1280 / PDF | Pass. EPÓXI, Á SECO, ÓLEO MINERAL; A, B; the screen label is "Deslocamento angular". The print label "DESLOCAMENTO ANGULAR" wraps between its words | TR-1 plate; `r1-p-058.png` |
| 22.7 AC2: ÓLEO MINERAL leaves the seven oil items answerable; EPÓXI shows them NA with no tap, and TIPO DO ÓLEO prints "-" | 1280 / PDF | Pass. TR-1 (ÓLEO MINERAL) has all 14 items open. TR-2 (EPÓXI) has items 2, 3, 4, 6, 7, 11 and 12 at NA, and prints "TIPO DO ÓLEO -" | `r1.txt` lines 2540 and 2594 |
| 22.7 AC3: the v12 TP has the TC's items and none of the transformer's | 1280 | Pass. Seven items, VASAMENTO the oil item; no VÁLVULA DE ALÍVIO, RELÉ DE GÁS or VENTILADORES | TP-ENEL |
| 22.7 AC4: Não ensaiado "Defeito no equipamento" counts Reprovado, and its point prints the justification | 1280 (dialog) / PDF | Pass, with N4. TR-3 makes the relatório Não apto. Section 9 prints "Equipamento não ensaiado: TR-3 … devido a defeito constatado no equipamento." | `03-nao-ensaiado-dialog-1280.png`; `r1.txt` 4701 |
| 22.7 AC5: the TRICAST oil plate | n/a | Not walked: it needs the fake fixture plate. Covered by `build-v12.test.ts` and `job.integration.test.ts` (plumbing tests); the paid eval is pending | n/a |
| 22.7 AC6, 22.8 AC3 and 22.9 "older seeds": v5 and v11 unchanged | kernel | Pass. Base and main give identical results at v1, v5 and v11 (see the summary) | `compare.ts` |
| 22.8 AC1: with a 10 kV megger, PRIMÁRIO rows start at 10 and SECUNDÁRIO/MASSA at 1 | 1280 | Pass. The selects read 10, 10 and 1 after MEG-01 was picked | browser read |
| 22.8 AC2: SECUNDÁRIO/MASSA at 10 kV on a 220 V winding shows the notice and does not block | 1280 | Pass. "Tensão de ensaio acima do suportado pelo enrolamento Secundário (220 V): use 0,5 ou 1 kV." The value saved | `01-tr1-isolacao-1280.png` |
| 22.8 AC3: each row prints its voltage in its own column | PDF | Pass for the content: "10 / 10 / 10" in R1 and "10 / 10 / 1" in R2. **Fails 22.3 AC3 (B1)**: the column breaks words | `r1-p-058.png`, `r2-p-058.png` |
| 22.8: below 768 px the select stands over the reading | 390 | Pass. Three stacked selects at 56 px; no page overflow. The table already scrolled inside its own scroller before (481 px of table in a 358 px scroller, the same width without the stacked selects) | `06-tr1-isolacao-390.png` |
| 22.9 AC1: TC at EXATIDÃO 1,2 and 0,84 % is SATISFATÓRIO, and ACEITÁVEL prints the class | 1280 / PDF | Pass. 20,168 against 20,00 reads Satisfatório; ACEITÁVEL prints "±1,2 %" (the PR's narrowing) | `r1.txt` 514-518 |
| 22.9 AC2: with no class, ± 0,5 % and the helper | 1280 | Pass. "Informe a EXATIDÃO na placa: sem a classe, a relação é julgada a ±0,5 %." on TP-ENEL | browser read |
| 22.9 AC3: the "0,6C25" plate | n/a | Not walked: fake fixture. Covered by the reading tests; the paid eval is pending | n/a |
| 22.10 AC1: "OL" with a 2 TΩ megger stores 2 TΩ, shows "> 2 TΩ", is within, prints "> 2 TΩ" | 1280 / PDF | Pass. The echo reads "= > 2 TΩ" and the cell "> 2" in TΩ, with no helper. Prints "> 2 TΩ" in R1, and in R2's MANUT. ANTERIOR. See S2 for the next row's unit | `01-tr1-isolacao-1280.png`; `r1.txt` 2572 |
| 22.10 AC2: contact "> limite" at 2.000 µΩ is out, and the floor is Reprovado | 1280 | Pass, typed as "> 2.000": the instrument's "OL" failed, see S1. Floor Reprovado · Com restrições, "Aprovado" and "Sem restrições" disabled; the derived point "> 2.000 µΩ em T1-T2–Fase A" is in section 9 | `02-sec-contact-ol-1280.png`; `r1.txt` 4703 |
| 22.10 AC3: a ratio cell refuses "OL" with the authored message | 1280 | Pass. The message shows, and the cell's Overflow holds only "Não medido" | browser read |
| 22.11 AC1: "Inspeção de QGBT" from a palette; four fields, the checklist and CONCLUSÃO; a photo attaches; the floor applies | 768 (dialog) | Pass. The palette's "Outros equipamentos" lists it after Quadro elétrico ("10 itens · QGBT-C17"). The sheet has Placa 4, Verificações 10 and Conclusão, with no Ensaios. One NC gives the floor Aprovado · Com restrições. The photo went in through "De qual equipamento?". Added in the local, since the standard template has no painel | `04-palette-768.png`, `05-which-equipment-768.png` |
| 22.11 AC2: print in the QGBT/QD group after the full sheet, with its checklist and photos; section 3 counts it | PDF | Pass for placement: "8.6 Outros equipamentos", QD-C17 then QGBT-C17, the checklist with the NC observation, then "Imagem 1: Detalhe do quadro geral de baixa tensão QGBT-C17 …". Section 3 counting is narrowed by the PR. See N3 for the sheet title | `r1.txt` 2897-2970 |
| 22.12 AC1: TR-1 of the next relatório shows the previous value, and the cell stays empty | 1280 | Pass, with S3 (the line's colour). "Anterior: > 2 TΩ (rev. 1, 07/11/2026)", "… 1,5 GΩ …" and "… 800 MΩ …"; the ratio captures show "Anterior: 108,7 …"; every input is empty | `08-r2-tr1-anterior-1280.png` |
| 22.12 AC2: MANUT. ANTERIOR on TR-1, none on a sheet with no previous visit | PDF | Pass for content. R2's TR-1 prints "> 2 TΩ · 1,5 GΩ · 800 MΩ" and "108,7 · 108,6 · 108,7". TR-2 has none. SEC-C01 prints the column on both tables, its isolation all "-" (the PR's per-sheet narrowing), and in the middle of the paired table (N6). **Fails 22.3 AC3 (B1)** | `r2-p-019.png`, `r2-p-058.png` |
| 22.12 AC3: `last_results` holds the issued values | DB | Pass. TR-1, SEC-C01 and TC-ENEL carry revision 1 with the expected keys (`isolacao|isolacao:PRIMÁRIO/MASSA/SECUNDÁRIO|1 MINUTO`, …). The cross-tenant and replay tests are the PR's | `entities` read |
| Console | all | No error after sign-in | browser console |

## Pass 2: code read (verification-gap and edge-case lenses)

**Scope.**

- **The union of both PRs' "Patched, not re-reviewed" lists:**
  - e22s:
    - the voltage cell's conflict label (`merge/conflicts.ts:306-315`);
    - the EXATIDÃO copy through `parseAccuracyClass` (`seed/select-option.ts:21-44`);
    - the ÓLEO MINERAL composition (`reading/build.ts:84-104`);
    - no write when the empty option is picked on a defaulted row (`ensaios-section.tsx`, `RowVoltageField`);
    - "-" printed for an untested row's voltage (`print/section-9.ts` `voltageText`);
    - the 390 px stacked select (walked in pass 1);
  - e22r:
    - the lone ">" dropped on blur (`measurement-field.tsx`, the `inputProps.onBlur` wrapper);
    - no column when no key matches (`print/section-9.ts` `previousReadingsOf`);
    - `number_value` refusing `over_range` (`ops/value-limits.ts:226-232`);
    - the dictated-cell and CTA-range tests.
- **Every code change in `423207c5..538062a4`** to:
  - print: `print/section-9.ts`, `print/last-results.ts`, `group-for-print.ts`;
  - kernel: `relatorio/over-range.ts`, `reading-evaluation.ts`, `reading-cells.ts`, `measurement-evaluation.ts`, `row-voltage.ts`, `accuracy-class.ts`, `conclusion.ts`, `instrument-pick.ts`, `reading/build.ts`;
  - seed: `seed/v12.ts`, `seed/schema.ts`;
  - contract and ops: `contract/version.ts`, `ops/path.ts`, `ops/value-limits.ts`, `ops/apply.ts`, `schemas/entities.ts`;
  - the generate job (`apps/api/src/jobs/generate/job.ts`) and the plate prompt (`bedrock.ts`);
  - web: `ensaios-section.tsx`, `measurement-field.tsx`, `number-input.tsx`, `instrument-panel.tsx`.
- **The readers those files feed:**
  - `reading-run.ts` (`worstReadings`);
  - `points/derived.ts`, `relatorio/parecer.ts`;
  - `sheet-state.ts` (`enabledCells`);
  - `toast.tsx` (`useFocusedClearOfStickyBar`, for R8LAY).

**Checked and found sound:**

- **Over-range against the floor, derived points and the parecer.** Every judged reader takes `isReadingValue`: the floor's `measured`, the composed paragraph, `worstReadings` and the measurement absolutes. The verdict follows the documented rule:
  - a `>` criterion is within only when the limit reaches it;
  - a `<` criterion is out;
  - `±` and the relative or equals criteria refuse the state at input, and read a stored one as `invalid`.

  An out over-range reading feeds the Reprovado floor, a derived "Ensaio fora do critério" entry ("> 2.000 µΩ") and the Não apto verdict. Outliers and the ratio's VAL CALCULADO ignore the state.
- **The previous-value lookup.**
  - Keys are `${testKey}|${table.key}:${seed connection cells}|${seed column label}`, so seed versions that keep a row's connection and column label match, and a renamed row does not.
  - `previousResultsFor` also requires the same `block_type`.
  - The prior chain keeps the visit before on a re-issue of the same relatório.
  - The generate job writes `last_results` in the revision's batch, from the frozen snapshot that printed, and the preview writes nothing.
  - The only known gap (re-issuing an older relatório after a newer one) is already in `deferred-work.md`.
- **The print delta for old seeds.** `printedVoltageOf` returns null for every v1 to v11 table. The `invalid` print now goes through `displayText`, which equals `raw` except for a refused limit. MANUT. ANTERIOR is added only when the equipment has a `last_results` from another relatório. The base-versus-main `layoutSpec` comparison at v1, v5 and v11 is byte-identical.
- **The patched items:**
  - the conflict label names "Linha · Tensão (kV)";
  - the composition keeps a valid model insulation and composes only from a kept A or B;
  - the empty option on a defaulted row writes nothing (but see N8);
  - the lone ">" is discarded only after "> limite" put it there; a typed ">" is refused as before.
- **Seed v12 is consistent.**
  - The TP's VASAMENTO `na_defaults` copies the v10 TC.
  - The inspection reuses the quadro's items, keys and hints.
  - `voltage_rows` match the row counts, guarded by a throw.

**Second pass: 13 findings (1 blocker, 6 should-fix, 6 notes).** Three further notes (N4, N7 and N9) come from pass 1.

### Blocker

**B1. The TENSÃO column of every v12 insulation table, and MANUT. ANTERIOR on any seed, break words inside themselves in the printed document (Story 22.3 AC3, the layout protection).**

- **Where:**
  - `packages/domain/src/print/section-9.ts:698-721` (`fittedColumns`): when the columns' longest words together pass `CONTENT_WIDTH_EM` (58 em), it returns `minimum`, and the renderer squeezes it to the page;
  - `:791-810` (`measurementTable`, one more column on v12);
  - `:838-852` (`withPreviousColumn`, one more column);
  - `:819` (`sideBySide`, which pairs the seccionadora and disjuntor tables, doubling both).
- **Seen, real PDFs:**
  - R1 rev. 1, TR-1 on v12, mixed units: "TENSÃ/O (kV)", "30 SEGUNDO/S", "1 MINUT/O", "ABSORÇÃ/O", "POLARIZAÇÃ/O", and "SECUNDÁRI/O" in the connection cells;
  - R2, with uniform GΩ and MANUT. ANTERIOR: "SECUNDÁ/RIO", "SEGUND/OS", "ABSORÇ/ÃO", "POLARIZAÇ/ÃO", "ANTERIO/R";
  - SEC-C01 paired, 12 columns: "GUAR/D", "ANTERIO/R".

  The same v11 TR-1 table printed every word whole in wave A (`agent-a77b397be223202ff/.playwright-mcp/e22q/tr1-058.png`).
- **The kernel's own measure agrees** (`fit.ts`, `wordsWiderThanColumns` over every type with every reading filled). On v12, the transformer, cabos de entrada and cabos de saída insulation tables have words wider than their columns. With a previous visit, every insulation table on v11 and v12 does, and so does a v12 TP, TC, para-raio or QGBT table.
- **Who it reaches:**
  - every new relatório: B1 is a regression of Bruno's own item, in the document he likes;
  - Bruno's v5 relatório, from the first relatório of its obra issued after the deploy (MANUT. ANTERIOR).
- **Why the gate missed it:** `print-fit.test.ts` "the fitted tables of every seed version" checks the pairs, the cabine tables and the instrument headers (`FITTED`), not the reading tables.
- **Suggested fix, a decision for Matheus or Bruno, as each option changes the form differently:**
  - (a) print the reading tables in a smaller font only when `sum(minimum) > CONTENT_WIDTH_EM`, as one renderer rule;
  - (b) abbreviate the new headers ("kV" under a PONTO DE ENSAIO group, "ANTERIOR" under a "MANUT." group header) and, on a sheet where no capture of a print column was taken, drop the always-"-" print columns (30 SEGUNDOS, ESTAB./10MIN, ABSORÇÃO, POLARIZAÇÃO). This touches KEEP_FORM;
  - (c) print MANUT. ANTERIOR as a second line in the value cell instead of a column.

  In every case, extend the 22.3 fit test to every reading table of every seed version, with and without a previous visit and with mixed units. A table with a word wider than its column then fails `test:unit`.

### Should-fix

**S1. "OL" says "Instrumento sem limite cadastrado" when the limit is registered in a unit spelled differently.**

- **Where:**
  - `apps/web/src/surfaces/registries/instrument-panel.tsx:409-420`: the range reuses `TestDefaultField`, two free-text inputs;
  - `packages/domain/src/relatorio/instrument-pick.ts:74-83`: no unit check;
  - `relatorio/over-range.ts:107-118` (`rangeInUnits`) and `seed/criteria.ts:77-97`: only the exact keys `µΩ` (U+00B5), `mΩ`, `Ω`, `kΩ`, `MΩ`, `GΩ` and `TΩ` scale;
  - `measurement-evaluation.ts` `overRangeRefusal`.
- **Repro, walked:** in Cadastros, MICRO-01 gets "Limite de medição (Resistência de contato)" set to "2.000" and "uΩ". On SEC-C01, with MICRO-01 picked on the contact test, typing "OL" answers "Instrumento sem limite cadastrado: digite > e o limite (ex.: > 2 µΩ)".

  Ω is not on a tablet or laptop keyboard. "T", "TOhm", "tΩ", "μΩ" (Greek mu), or a blank unit all do the same.
- **Suggested fix:** make the range unit a select of the test kind's units (insulation MΩ, GΩ, TΩ; contact µΩ, mΩ), or normalise it on commit. Give Cadastros a helper when the stored pair cannot be read, and give the cell a message that says the limit's unit is unreadable instead of "sem limite cadastrado".

**S2. An over-range limit's unit becomes the next row's unit, so a plain number typed after "OL" is stored 1000 times off.**

- **Where:** `packages/domain/src/relatorio/reading-evaluation.ts:318-326` (Story 5.5 AC2: an empty cell shows the previous row's unit). It now also follows a row in `over_range`.
- **Repro, walked:** on TR-1 insulation, type "OL" (2 TΩ) and Enter, then "1,5" and Enter. The second row is stored as 1,5 TΩ (unit slot "TΩ"), where the column's GΩ was meant. The e22r spec relies on it ("The slot follows the row above … TΩ here: the suffix sets GΩ").

  A limit's unit is the instrument's top of range, rarely the unit of the next real reading. Both values here are within > 400 MΩ, so nothing on screen flags the 1000x error, and it prints.
- **Suggested fix:** the unit carry-over skips an `over_range` row, taking the unit of the last measured row, else the column's.

**S3. The "Anterior: …" line is drawn in the out-of-limit colour.**

- **Where:** `apps/web/src/surfaces/ficha/measurement-field.tsx:105-113` (`PreviousLine` uses `.mf-helper[data-tone="outlier"]`). That class takes `--measurement-field-outlier-helper-color`, which is `--fora-do-limite`, #8A4B00 (`tokens.css:49` and `:266`).
- **Seen:** `08-r2-tr1-anterior-1280.png`. Every capture of a sheet with a previous visit carries a brown line that reads as a warning. The component's comment says "neutral (the outlier tone, never amber nor a live region)", but the outlier tone is the out-of-limit colour.
- **Suggested fix:** a neutral helper (`--ink-secondary`) through an `app.css` rule that mirrors a mock rule (DESIGN.md: no invented look). If no mock draws a neutral cell helper, this is a question for the UX docs.

**S4. Writes that store `over_range` outside test cells are not refused, as the PR body says they are.**

- **Where:** `packages/domain/src/ops/value-limits.ts:143` (`'sheet/nameplate'`: `shortStrings`) and `:177` (`'sheet/test/value'`: `shortStrings`). Only the cabine `se` and `env` paths use `number_value`, which now refuses the state (`:226-232`). `numberValueSchema` (`schemas/entities.ts:33-37`) accepts `over_range` everywhere.
- **Edge:** a nameplate number or a measurement test's value put with `state: 'over_range'` is accepted by the api. No UI writes one today; the parsers refuse it. The readers then disagree:
  - `isCellFilled` counts it;
  - `voltsOf`, `identityPart` and the bands ignore it;
  - `evaluateValues` shows it with `withUnit`.
- **Suggested fix:** a `number_value`-style check on the nameplate number fields and on `sheet/test/value`, or narrow the PR's sentence and the contract note to the cabine paths. Add an api test for each.

**S5. R8LAY-E2E-001 has a cause hypothesis and a two-sided fix (asked by the coordinator; no gate run).**

- **Facts:**
  - every red has the same value, `title row top` -33.03125 at 768x1024: one of two discrete layouts, not a drift;
  - red configurations: the head (1 of 3), a constant provider (1 of 3), one provider (1 of 3) and props (1 of 6). Main's web files: 0 of 11. e22r's field and number input with main's `ensaios-section.tsx`: 0 of 5;
  - at a 1-in-4 rate, 0 of 5 happens one time in four. So the experiments do not separate the provider from `measurement-field.tsx` and `number-input.tsx`. The only strong contrast is with main, and the context-identity fix (5f9ba15e) did not change the rate.
- **Hypothesis:** the test's 768 step reads the title after `last.blur(); last.focus()`. Two app mechanisms can move the page between those two states:
  - **The settle window.** `toast.tsx` `useFocusedClearOfStickyBar` (`LAYOUT_SETTLE_MS` 1500 at `:416`, `onLayout` at `:472-475`) re-clears the last key-moved focus on any `main` resize within 1.5 s. At 1280 the test's last Enter moves the focus (in the review's walk, to a button). The `setViewportSize(768)` that follows within 1.5 s resizes `main`, and `keepClearOfStickyBar` then scrolls the page for an element the test is not measuring.
  - **A helper line.** The test's ratio values are far out of criterion. A capture whose focus leaves shows its helper line (`!number.focused && helperText` in `measurement-field.tsx`), and a refocused one hides it. Whether the browser's focus reveal or the clearance runs before or after React removes the line decides a fixed offset.

  e22r adds per-render work to every MeasurementField and to the Ensaios step: a context read, two extra state hooks, the Overflow list, `instrumentRangeFor` per test and a JSON round trip. That shifts which side of those races the commit lands on, without being wrong itself.
- **Discriminating experiment** (one run with `--repeat-each 10`, under the lock): log `scrollY` and the active element at the 1280 Enter, after `setViewportSize`, after `blur()` and after `focus()`, plus the milliseconds since the last Enter. If a red shows a scroll at the resize, the settle window is the cause; if a red shows it between blur and focus, the helper line is.
- **Suggested fix:**
  - test: blur the TTR input and wait past the settle window (or use `page.clock`) before each `setViewportSize`, and assert the geometry after `expect.poll` sees two frames with no layout change;
  - app: `onLayout` ignores a change caused by a viewport resize (keep `innerWidth` and `innerHeight` from the key focus and skip when they differ). A rotation is not the hint growing under the field that the window exists for.

  Record the outcome as the `deferred-work.md` row for E21-A4 P-3 ("a test red under load in two gates").

**S6. `parseAccuracyClass` treats every select whose options are all bare numbers as an accuracy-class select.**

- **Where:** `packages/domain/src/seed/select-option.ts:21-24` (`isAccuracyClassOptions`) and `:41-44`.
- **Edge:** no shipped nameplate select today has only numeric options (checked over every `options:` of `seed/*.ts`). Wave C (Stories 14.6 to 14.8) lets the office define its own selects, for example "NÚMERO DE FASES" with options 1, 2 and 3. A copied or read "3F" or "2 polos" would then silently land on "3" or "2", through the class parser's leading-number rule.
- **Suggested fix:** key the rule on the field (`key === 'exatidao'`, as `reading/build.ts:137` already does, or a seed flag) rather than on the shape of the options. Should-fix before wave C.

### Notes

**N1. MANUT. ANTERIOR is decided per sheet, so a table with no previous value prints a column of "-".**

- **Where:** `print/section-9.ts` `previousReadingsOf`. This is the PR's narrowing.
- **Seen:** on R2, SEC-C01's insulation prints MANUT. ANTERIOR all "-", because only its contact test had a previous value.
- Combined with B1, this costs width for nothing. A per-table decision would print the column only where a row has a value.

**N2. "resistência de contato máxima de > 2.000 µΩ" reads awkwardly.**

- **Where:** `relatorio/conclusion.ts:336` (`TEST_WORDS.resistencia_contato.phrase`) followed by the over-range text.
- The same holds for "isolação mínima de > 2 TΩ". Authored wording, for Bruno: "acima de 2.000 µΩ (limite do instrumento)".

**N3. The Inspeção de QGBT prints the same title as a full Quadro elétrico.**

- **Where:** `seed/v12.ts` `inspecaoQgbt` (`print_title: quadro.print_title`), read at `print/section-9.ts:335`.
- **Seen:** "QGBT/QD's QD-C17" and "QGBT/QD's QGBT-C17" sit one after the other in 8.6, and only the TAG tells the inspection from the full sheet. Bruno may want "INSPEÇÃO DE QGBT".

**N4. Section 10 calls a defect reprovação "outro motivo".**

- **Where:** `relatorio/parecer.ts:272` (`REPROVADO_REASONS.other`).
- **Seen:** `r1.txt` 4732-4734: "1 não ensaiada (TR-3, por defeito no equipamento) … 1 por outro motivo (TR-3)". A `defect` reason could say "por defeito no equipamento". Authored, for Bruno.

**N5. The inspection's conclusion says "sem valores medidos registrados" for a type that has nothing to measure.**

- **Where:** `relatorio/conclusion.ts:444`.
- **Seen:** "A inspeção do QGBT QGBT-C17 (380 V, 800 A) apresentou acúmulo de poeira e sujeira (item 1, NC), sem valores medidos registrados." A definition with no tests should drop that clause.

**N6. On the paired seccionadora and disjuntor tables, MANUT. ANTERIOR prints in the middle and at the end.**

- **Where:** `print/section-9.ts:868-886` (each half gets its column before `sideBySide`).
- The PR tests it as intended ("both halves"). It is listed because the story says "after the values", and B1's width problem is worst there (12 columns).

**N7. Two insulation rows of the transformer have the same accessible name.**

- **Where:** `ensaios-section.tsx` `RowVoltageField`.
- Rows 1 and 2 both read "Primário, Tensão (kV)", the same pattern as the capture cells ("Primário, 1 minuto" twice), which is existing behaviour. A screen-reader user cannot tell PRIMÁRIO/MASSA from PRIMÁRIO/SECUNDÁRIO.

**N8. A defaulted row voltage cannot be pinned.**

- **Where:** `ensaios-section.tsx` `RowVoltageField`. The select shows the default, so picking the same value fires no change.
- A row on the instrument's default follows any later change of the instrument's TENSÃO ENSAIO, and its printed voltage moves with it. That is probably intended, but it is not stated anywhere for Bruno.

**N9. The revision 1 export is not blocked, while R2's is.**

- **Seen:** R2's Export dialog says "Preencha o parecer (linha 10 do sumário) para emitir a revisão 1" (e22f S5: no derived verdict without a concluded sheet). R1, with no concluded sheet but a Reprovado one, issued.
- This is consistent with e22f's narrowing ("a stricter derived verdict still stands"). It is listed so the coordinator can confirm it is the rule meant.

## Open questions for Bruno or Matheus

1. **B1:** which way out: a smaller font for wide reading tables, abbreviated headers with the empty print columns dropped, or MANUT. ANTERIOR as a second line in the value cell?
2. **S1:** a select for the range unit, or a free text normalised on commit?
3. **S3:** what colour, if any, does the "Anterior" line take (DESIGN.md has no neutral cell helper)?
4. **N2, N4 and N5:** the authored wordings for over-range in the conclusion, for a defect reprovação in section 10, and for an inspection with no tests.
5. **N3:** the inspection's printed title.

## What this review did not cover

- **Not walked in the browser:**
  - the fake oil and class plates (22.7 AC5, 22.9 AC3);
  - a painel (the standard template has none; the inspection was added in a local);
  - "Ler visor" with an over-range display;
  - the dictated over-range cell;
  - the re-issue chain.

  Each is covered by the tests the PRs name. The paid eval waits for Matheus's AWS login.
- **The v5 check was the kernel method of wave A** (the Porto Seguro snapshot rewritten), not a v5 relatório in the browser. Bruno's real relatório was not opened.
- **R8LAY-E2E-001 was not run.** A quick in-browser replay of its 1280-to-768 sequence on R2 (four tries, with and without a 2 s wait) did not reproduce the red.
