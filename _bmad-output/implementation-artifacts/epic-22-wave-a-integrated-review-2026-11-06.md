# Epic 22 wave A: integrated review (2026-11-06)

Reviewer: integrated reviewer subagent. Main at `b883c587` (PR #266 e22p, Stories 22.1 to 22.3; PR #267 e22c, Stories 22.4 to 22.6, contract 31), base `34ce1561`. Two passes per `epic-batch-orchestrator.md` § 9 P-1: the code read (pass 2) ran first and needed no stack. The behavior pass (pass 1) started after the coordinator's `gate.done` marker appeared. Review stack `fasor-e22q`, port base 62, images tagged from `app-api-e22p` and `app-tools-e22p` (no rebuild). `LLM_PROVIDER` and `OCR_PROVIDER` were `fake`. The pass browsed as `dev@local.dev` (Empresa Local Dev, seeded with `--standard-template --sample-relatorio`) on a new 94-block relatório made from the standard template (seed v11). The stack was stopped with `podman compose -p fasor-e22q stop` (no `-v`).

## Summary verdict

**Accepted with open items. No blocker found.**

- Every AC a human can walk behaved as written at 390, 768 and 1280 px:
  - the floor and the disabled segments;
  - "Concluir ficha" writing the floor;
  - the adjusted note;
  - the derived entries, their suppression and their return;
  - "Possível duplicado" and "Origem resolvida";
  - the derived verdict, with the third bullet dropped under Não apto;
  - "Anexar arquivo" on the plate, "Ler visor" and the palette.
- The generated PDF has none of the four internal lines. It prints the unit once and turns "na", "N.A." and "n/a" into one "N/A", while "-" prints as typed. Every ficha stays on its page with its CONCLUSÃO, with the photo block after it, and repeated captions get " (2)" and " (3)".
- Layout protection held. The photo grouping, order, numbering and sizes, and the sheet and section structure, are unchanged beyond the asked delta (two per row, plate first, the photo block after CONCLUSÃO, page 59 of the preview). Nothing in either pass qualifies as a layout blocker.
- The kernel runs without a throw on the Porto Seguro snapshot rewritten to seed v5 (stored config and v5 default config) and to v11. The floor, derived points, parecer, pre-issue and `layoutSpec` all give the same results on v1, v5 and v11.
- 7 should-fix and 9 notes, listed below. The should-fix items that matter most for Bruno's real v5 relatório are:
  - **S1:** a confirmed conclusion text goes stale and disappears from print when the floor tightens.
  - **S2:** old manual NC points print twice in section 8, with no pre-issue warning.
  - **S3:** a stale Etapa 6 note still says the parecer is the engineer's choice and that issuing is blocked without one.

## Pass 1: behavior (browser)

Evidence files are in the ignored `.playwright-mcp/e22q/` of the worktree: screenshots 01 to 08, preview PDFs `preview1.pdf` and `preview2.pdf`, their text in `p1.txt` and `p2.txt`, and renders `tr1-058.png` and `tr1-059.png`. The relatório is `01a1b35e-65ce-7082-a83b-8336a95d1853` on the `fasor-e22q` volume.

| AC | Viewport | Result | Evidence |
|---|---|---|---|
| 22.1 AC1: plate file on a transformador, fake suggestions, accepted fill the nameplate | 1280 | Pass. "Anexar arquivo" beside "Fotografar placa"; 11 suggestions arrived, "Confirmar todos" filled the fields | TR-1 nameplate values in IndexedDB; PDF p.58 |
| 22.1 AC1 (repeat) | 768 | Pass (para-raio plate, suggestions confirmed) | PR-ENEL, PDF p.10 "Imagem 1: placa de identificação." |
| 22.1 AC2: display file on an insulation "Ler visor", cell suggestion | 1280 | Pass. The cell showed "Sugerido" and "Confirmar todos (1)", confirmed as 1,45 GΩ; the photo prints in the sheet's photo block | PDF p.59 "Imagem 3: Detalhe dos ensaios de resistência de isolação…" |
| 22.1 AC3: HEIC, oversized, non-image | n/a | Partly walked. The picker's `accept` is `image/*,.heic,.heif` with `multiple=false`. HEIC and oversized were not walked (no HEIC fixture; PR narrowing: no size message exists) | input attribute read in the browser |
| 22.1 AC4: retake of a plate that read nothing cancels the older reading | n/a | Not walked: the fake provider has no "read nothing" plate on demand. Covered by 22.1-E2E-005 | n/a |
| 22.1 AC5: reachable, 44 px, named, no new look | 390 / 768 / 1280 | Pass. Every "Anexar arquivo" is 48 px tall, `.btn .btn-text` with `i-image`, no horizontal scroll at 390 | `07-plate-attach-390.png` |
| 22.1: palette "Anexar arquivo" (Story DoR "panel capture") | 768 | Pass. The palette closed and "Fotografar equipamento" opened on the file, proposing "Criar SEC-C09 · Chave seccionadora · Coluna 9?". Cancelled without creating | `08-panel-attach-768.png` |
| 22.2 AC1: no attribution, no "CRITÉRIO:", no criteria line, no photo item line; ACEITÁVEL kept | PDF | Pass. TR-1, TR-2 and PR-ENEL print none of the four; the ACEITÁVEL cell prints ">400 MΩ" and "±0,5 %". The screen still shows "Preenchido por …", "Concluída por …" and "Critérios usados" | `p1.txt` lines 2500 to 2680; ficha screen |
| 22.2 AC2: CTA prints no "ACEITÁVEL: … · fonte" row | n/a | Not walked (no CTA in the standard template). Covered by `docx-cta.test.ts` | n/a |
| 22.2 AC3: "na", "N.A.", "n/a" print "N/A"; "-" prints "-" | PDF | Pass for "na" (Nº SÉRIE), "N.A." (TIPO) and "-" (IDENTIFICAÇÃO). "n/a" was not typed: FABRICAÇÃO is a registry combobox | `p1.txt` TR-1 DADOS DO EQUIPAMENTO |
| 22.2 AC4: one unit, header only | PDF | Pass. "VALORES (GΩ)" over 1,45 · 0,3 · 2,1 on TR-1; "VALORES (MΩ)" over 300 · 5.000 on PR-ENEL. The mixed-unit table was not walked | PDF p.10 and p.58 |
| 22.3 AC1: ficha whole with CONCLUSÃO, photos may follow | PDF | Pass. TR-1 prints whole on p.58 with OBSERVAÇÕES, CONCLUSÃO and its text; its photo block is on p.59 | `tr1-058.png`, `tr1-059.png` |
| 22.3 AC2: a ficha taller than a page breaks between parts | n/a | Not walked (no two-page ficha in the walk). Covered by the PR's LibreOffice proof (`page-placement.integration.test.ts`, 6 of 6 in the api container) | n/a |
| 22.3 AC3: no word breaks inside itself (TIPO "TRANSFORMADOR TRIFÁSICO") | PDF | Pass. "TRANSFORMADOR TRIFÁSICO" sits on one line. A 32-character "ELETROMECÂNICO-AUTOTRANSFORMADOR" wraps at its hyphen, not mid-word. Label columns ("TENSÃO NOMINAL AT", "DATA FABRICAÇÃO") wrap between words, as the PR's narrowing says | `p2.txt`, `tr1-058.png` |
| 22.3 AC4: three equal captions read N, N+1 "(2)", N+2 "(3)", numbers unchanged | PDF | Pass. "Imagem 4: Detalhe do transformador de força TR-1 do 1° Subsolo.", "Imagem 5: … (2).", "Imagem 6: … (3)." | `tr1-059.png` |
| 22.3: layout protection (grouping, order, numbering, sizes) | PDF | Pass. Plate first, then the others; two per row, half width; the block follows CONCLUSÃO; numbering is continuous from section 7. No change beyond the ordinal | `tr1-059.png` |
| 22.4 AC1: all C, readings within, "Concluir" with no pair concludes Aprovado · Sem restrições | 768 | Pass (PR-ENEL: stored `aprovado` / `sem_restricoes`, text confirmed) | IndexedDB read after "Concluir e avançar" |
| 22.4 AC2: NC row: Sem restrições disabled with reason; Aprovado · Com at least; Reprovado choosable | 768 | Pass (TR-2). Segments: Aprovado checked, Reprovado enabled, Sem restrições disabled. Reason: "A ficha exige no mínimo Aprovado · Com restrições: item não conforme." | browser read of `.conclusion-control` |
| 22.4 AC3: 300 MΩ against >400 MΩ: Reprovado effective, Aprovado disabled, section 9 prints Reprovado | 1280 | Pass. TR-1 with 0,3 GΩ: Aprovado and Sem restrições disabled; "Concluir e avançar" stored `reprovado` / `com_restricoes`; PDF prints the X under REPROVADO and COM RESTRIÇÕES | `01-floor-1280.png`; PDF p.58 |
| 22.4 AC4: concluded Aprovado · Sem, then a reading corrected out: Reprovado everywhere, adjusted note | 768 | Pass, with S1. PR-ENEL showed "Conclusão ajustada pela ficha · Confirmar", the Sumário reads Não apto, and the preview prints Reprovado · Com. The confirmed text went stale, and Confirmar wrote only the pair: the text stays stale, so the PDF prints the CONCLUSÃO marks with no paragraph. The sheet, though concluded, now reads "faltam as observações" | `02-adjusted-768.png`; PDF p.10 |
| 22.4 AC5: v5 relatório | kernel | Pass in the tools container. The Porto Seguro snapshot as stored (v1), rewritten to v5 (stored config and v5 defaults) and to v11 gives the same counts everywhere, with no throw: 18 Reprovado · Com, 73 Aprovado · Sem, 3 not tested, 18 `reading` entries, Não apto, and pre-issue without `parecer_missing` | scratch script (removed after the run) |
| 22.5 AC1: entries after manual points, in tree order, counted as automatic | 390 / 768 | Pass. "Pontos de atenção (0 + 4 automáticos)": PR-ENEL (Cubículo Enel), then the 1° Subsolo local NC (at the local, before its equipment), then TR-1 and TR-2; Sumário row "2 pontos + 3 automáticos" later | Pontos screen text |
| 22.5 AC2: "Editar" on an NC entry, action and deadline, point replaces it; removing brings it back | 390 / 768 | Pass. Stored point: `origin: nc`, `item_key: limpeza`, action and `deadline 2026-12-15`. The entry left the list; after "Remover ponto" the TR-2 entry was back | IndexedDB point row; Pontos screen |
| 22.5 AC3: NC set back to C: entry gone, its point flagged "Origem resolvida" | 768 | Pass. A point made with "Criar ponto de atenção" on the TR-2 row (a dialog) read "Origem resolvida" after the row went to C. See S4: that point starts with no text, and N3: the C row kept its NC phrase | `04-nc-create-dialog-768.png`; Pontos screen |
| 22.5 AC4: manual point plus NC entry of the same owner: both "Possível duplicado" | 390 | Pass, with N4. A manual point on "1° Subsolo · Verificações do local" and the local's NC entry both show the flag | `03-pontos-390.png` |
| 22.5: section 8 print | PDF | Pass. Manual points first, then "Ensaio fora do critério: PR-ENEL · Cubículo Enel. …", "Item não conforme: 1° Subsolo · Verificações do local. Item 3 (…): …" and the TR-1 entry, each with its action-plan row ("—" for the empty cells) | `p1.txt` lines 4600 to 4633 |
| 22.6 AC1: one sheet Reprovado: Não apto, looser disabled with reason, summary names it, no third bullet | 390 / PDF | Pass. Etapa 6: Apto and Apto com restrições disabled; "O relatório exige no mínimo Não apto: 2 fichas reprovadas (PR-ENEL e TR-1)." Section 10 prints "Não apto" and the composed summary; "Apesar dos resultados…" is absent; "nos itens 8 e 9" matches the printed positions. See N1 for the triple listing | `05-etapa6-390.png`; PDF p.109 |
| 22.6 AC2: one sheet Com, none Reprovado: Apto com restrições, Apto disabled, Não apto choosable, third bullet prints | n/a | Not walked: both reprovados in the walk had a stored Reprovado, which stays stricter. Covered by `parecer-export.spec.ts` and the section 10 tests | n/a |
| 22.6 AC3: earlier typed summary prints after the composed one as "Observações do responsável" | n/a | Not walkable on a new relatório (no way to type a summary any more). Covered by `docx-section-10.test.ts` | n/a |
| 22.6 AC4: template's own Conclusão text resolves the positions | n/a | Not walked. Covered by the section 10 kernel tests | n/a |
| 22.6: Export dialog not blocked | 1280 (dialog) | Pass. "Nada impede gerar"; "Gerar relatório" enabled; no parecer row | `06-export-1280.png` |
| Console | all | 1 error only: the pre-login 401 on `/api/account`, which is expected | browser console |

## Pass 2: code read (verification-gap and edge-case lenses)

**Scope.**

- The union of both PRs' "Patched, not re-reviewed" lists.
- Every change in `34ce1561..b883c587` to:
  - `relatorio/conclusion.ts`, `relatorio/parecer.ts` and `points/derived.ts`;
  - `print/section-9.ts`, `print/caption-ordinal.ts`, `print/section-8.ts` and `print/section-10.ts`;
  - the api section 9 and 10 renderers;
  - `contract/version.ts`;
  - `apps/web/src/surfaces/ficha/attach-file.tsx` and `panel-capture.tsx`.
- The readers those files feed: `sheet-progress.ts`, `pre-issue.ts`, `sumario.ts`, `points/summary.ts`, `points/checks.ts`, `conclusao-section.tsx`, `use-ficha-actions.ts`, `etapa6-parecer.tsx`, `points-surface.tsx`, `checklist-section.tsx` and `verificacoes-surface.tsx`.

**Checked and found sound:**

- **The two PRs together in `print/section-9.ts`.** e22p's removals and keep flags are intact around e22c's `conclusionParts` change (`print/section-9.ts:904`). `keptTogether` (line 634) leaves the photo block free.
- **Contract 31 and `MIN_CONTRACT_VERSION` 31.** The `pointRowSchema` enum takes `nc`, `reading` and `reprovado`. `item_key` and `test_key` are optional, so old rows parse to the same bytes. Both are immutable through `ops/path.ts` POINT_FIELDS, capped `short` in `value-limits.ts`, and refused as put paths; a version-30 pull gets 426 (`points.integration.test.ts` 22.5-API-001).
- **Derived suppression.** `pointSource` and `entrySource` agree on the owner key: equipment, else local.
- **A Não ensaiado sheet.** It ignores its stored pair (`conclusion.ts:179`) and yields only its not-tested entry.
- **A sheet with no stored pair.** It gets the floor in every reader.
- **The v5 seed.** No reader crashes on a v5 or v1 BlockConfig: `enabledSubBlocksOf` falls back on a config it cannot parse, and `evaluateSheetMeasurements` returns `NONE` without `measurement_tests`. This was confirmed by running the readers over the Porto Seguro snapshot at v1, v5 and v11.
- **The api section 10 renderer.** It keeps the box unsplit with the own-text paragraph (`sections/section-10.ts`).
- **`attachPicked`.** It always calls `onAbandon` on an empty pick, an import that stored nothing or a throw.
- **"Anexar arquivo" on the plate.** It is gated on AI features like the plate tile (`nameplate-section.tsx:384`).

**Second pass: 16 findings (0 blocker, 7 should-fix, 9 notes).**

### Should-fix

**S1. A floor that tightens a concluded sheet makes its confirmed conclusion text stale. Section 9 then prints the X marks with no paragraph, and "Confirmar" on the adjusted note does not fix the text.**

- Where: `packages/domain/src/relatorio/conclusion.ts:392` and `:414` (the basis and the recommendation now come from the effective pair, where they used to come from the stored pair), `print/section-9.ts:907` (a stale text does not print) and `apps/web/src/surfaces/ficha/conclusao-section.tsx:267` (`confirmAdjusted` writes only `result` and `restriction`).
- Scenario, walked on PR-ENEL: a sheet concluded Aprovado · Sem restrições before Story 22.4, and an insulation reading out of criterion, or an observation typed. After the deploy:
  - the composed text gains "Recomenda-se a correção…", the basis changes and the state reads `stale`;
  - "Confirmar" leaves the text stale;
  - the PDF prints REPROVADO · COM RESTRIÇÕES with no conclusion paragraph and, with no observation, no OBSERVAÇÕES table under "(VER OBSERVAÇÕES)";
  - the concluded sheet now reads "faltam as observações";
  - pre-issue shows "Texto de conclusão desatualizado".
- On Bruno's v5 relatório this reaches every concluded sheet whose stored pair is looser than its floor (the production count found one concluded TR-1).
- Suggested direction: either the adjusted "Confirmar" also replaces a `confirmed` (never an `edited`) text with the composed one in the same batch, or the note names both actions. Run the read-only production count of concluded sheets whose stored pair is looser than the floor before the wave A deploy.

**S2. Pre-22.5 manual points written from an NC row print twice in section 8. Nothing before issuing warns about it.**

- Where: `packages/domain/src/points/derived.ts:285` (`possibleDuplicatePoints` feeds only the Pontos screen) and `relatorio/pre-issue.ts:456` (the old site NC row is retired and nothing replaces it).
- Scenario: Bruno's relatório has a manual point "Item 8: contatos oxidados [[foto]]" on DJ-01, written from its NC row before contract 31. After the deploy, section 8 prints both that point and "Item não conforme: DJ-01 · … Item 8 (contatos): …", with two action-plan rows. The only signal is the amber "Possível duplicado" on the Pontos screen. The Sumário, the export dialog and the issue confirmation say nothing.
- Suggested direction: a `pending` pre-issue row "Pontos possivelmente duplicados: …" from `possibleDuplicatePoints`, so the Export dialog names them.

**S3. The Etapa 6 note contradicts Story 22.6.**

- Where: `apps/web/src/copy/pt-br.ts:1554`, `parecerNote`.
- Seen at 1280 and 390 on a new relatório: "O app conta fichas, restrições e não ensaiados e sugere; o parecer é escolha sua. Sem parecer, a emissão fica bloqueada em Gerar relatório."
- The verdict is now derived, only a stricter one can be chosen, and nothing blocks issuing. The note needs a new authored string (open for Bruno).

**S4. "Criar ponto de atenção" on an NC row writes a point with an empty text. That point replaces a derived entry that described the NC.**

- Where: `apps/web/src/surfaces/ficha/checklist-section.tsx` `pointSeed` (`withPhotoTokens(null, photoIds)`) and the same in `local/verificacoes-surface.tsx`.
- Scenario, walked on TR-2 with no photo: the dialog opens with an empty text, the engineer types only the action and taps Concluir. The card shows no text.
- Section 8 then prints a bullet with only the action, where the suppressed entry read "Item 1 (limpeza): acúmulo de poeira e sujeira".
- "Editar" on the same entry in the Pontos screen seeds the entry's text (`derivedPointSeed`), so the two paths to the same point disagree.
- The PR's fix of the "glued text" bug went to the other extreme. Seed with `derivedPointSeed(entry).text` (the entry text already carries the row's photo tokens) and let the engineer edit it.

**S5. The derived verdict of a relatório where nothing is judged reads "Apto".**

- Where: `packages/domain/src/relatorio/parecer.ts:158` (`derivedParecer` returns `apto` by default).
- Seen on a new relatório with 94 empty sheets: Sumário row "Conclusão e parecer: Apto", and the Etapa 6 box prints "Apto". Issuing is no longer blocked, so a revision can be issued with "Apto" over 94 empty sheets. The issue confirmation does ask about the empty sheets.
- With every sheet empty or open, a verdict of "Apto" says more than the fichas do. Suggested direction: an "Apto" verdict needs at least one judged sheet and no open one, else a pre-issue row. This is a rule question for Bruno and Matheus (see Q6).

**S6. Disabled conclusion and parecer segments look exactly like enabled unselected ones.**

- Where: `apps/web/src/surfaces/ficha/conclusao-section.tsx` (the `disabled` attribute on `.seg`) and `relatorio/setup/etapa6-parecer.tsx`. No `.seg:disabled` rule exists in `tokens.css`, `components.css` or `app.css`.
- Seen in `01-floor-1280.png` and `02-adjusted-768.png`: "Aprovado" and "Sem restrições" are drawn white and full-contrast while disabled. Only the reason line says why a tap does nothing.
- DESIGN.md or the mock should say how a disabled segment looks. This needs an `app.css` rule mirroring a mock rule, never an invented one.

**S7. The parecer readers recompute every sheet's reading evaluation several times per render, with no memo.**

- Where: `relatorio/parecer.ts` (`derivedParecer`, `parecerReasonText`, `parecerCounts` and `composeParecer` each call `effectiveConclusionPair`, `outReading`, `failedRatioRowsOf` and `pointsSummary`, and so `derivedPoints`) and `relatorio/sheet-progress.ts` (`conclusaoMissing` now calls `effectiveConclusionPair`).
- Measured in the tools container on the 94-sheet Porto Seguro snapshot: one `derivedParecer` plus one `composeParecer` cost about 30 ms at v1 and v5, and about 87 ms at v11 (Node, Apple silicon).
- Etapa 6 runs four of these per snapshot change, and Sumário row 10 runs another. A field tablet is several times slower, and a client-side freeze on a tablet is already open (freeze report 2026-10-24).
- Suggested direction: a per-block-object WeakMap memo of `conclusionFloor` (the `sheetState` pattern, K-16), and one `parecerCounts` passed to the reason line.

### Notes

**N1. The composed summary lists a Reprovado sheet three times.**

- Where: `parecer.ts:234` (`withRestriction` includes Reprovado sheets, since their floor is Com restrições), `:307` and `:323`.
- PDF p.109: "2 fichas foram reprovadas (PR-ENEL e TR-1). 3 fichas apresentaram restrições (PR-ENEL, TR-1 e TR-2). … Leituras fora do critério de aceitação em 2 fichas (PR-ENEL e TR-1)."
- The Critérios line repeats them the same way. The wording is authored and open for Bruno.

**N2. An open (unconcluded) sheet prints its floor marks in the draft and in an issued revision.**

- Where: `print/section-9.ts:904`.
- PDF p.60: TR-2, never concluded, prints APROVADO X · COM RESTRIÇÕES X with no OBSERVAÇÕES.
- This is the PR's open question 1. It is listed here because issuing is no longer blocked by the parecer.

**N3. Setting an NC row back to C keeps its NC phrase as the row's observation. The sheet then stays Com restrições by the "observation" source, with no visible link to the old NC.**

- Where: `conclusion.ts:94` (`anyObservation`).
- Walked on TR-2: after the row went to C, the parecer still listed "3 fichas apresentaram restrições (… TR-2)".
- This is the PR's open question 3, now shown live. It may surprise Bruno more than the PR's wording suggests.

**N4. "Possível duplicado" pairs any manual point of an equipment or local with every NC entry of the same owner.**

- Where: `derived.ts:285`.
- Walked: a fresh manual point written after the story ("Vara de manobra sem laudo") was flagged too. The flag is not limited to points written before contract 31, as the story's AC frames it. This is open question 4 of PR #267.

**N5. A "Ler visor" or plate opener that is then abandoned leaves no residue, but the result dialog of the palette flow offers only "Fotografar de novo".**

- Where: `relatorio/panel-capture.tsx`.
- An office user who attached a file has no "Anexar arquivo" to redo it in the "Fotografar equipamento" dialog. This is outside the story's opener list, so it is a note.

**N6. An older browser may never fire the file input's `cancel` event.**

- Where: `attach-file.tsx:93`.
- The input's `cancel` event needs Chromium 113, Safari 16.4 or Firefox 91. Where it never fires, a cancelled palette pick keeps `shotRef` set until the next open, and the focus is not returned.
- Nothing visible stays open, since the dialog renders only with a stored row. This is low risk.

**N7. `section-10.ts:97` replaces only a "nos itens 8 e 9" that sits whole inside one rich run.**

- A template's own text that styles part of the phrase (for example bold "8 e 9") keeps the literal numbers.

**N8. The Pontos intro note still says only "Equipamentos marcados como Não ensaiado entram sozinhos ao final".**

- Where: `copy/pt-br.ts:1095`.
- NC rows, out readings and Reprovado sheets now enter on their own as well.

**N9. The floor's reason does not pre-fill the suggested observation.**

- The story DoR says "The floor's reason pre-fills the suggested observation (`suggestedSheetObservation`), as today". The PR narrowed this to unchanged.
- Combined with S1 and with an out reading now requiring an observation, the engineer types it by hand on every Reprovado sheet. A dated line in `epics.md` should record the narrowing, as the PR body proposes.

## Open questions for Bruno or Matheus

1. **S1:** should the adjusted note's "Confirmar" also replace a confirmed (never an edited) conclusion text?
   - Before the wave A deploy, run the read-only production count: concluded sheets of the v5 relatório whose stored pair is looser than the floor, and whose text is confirmed.
2. **S2:** a pre-issue row for "Possível duplicado" pairs, or is the Pontos screen flag enough?
3. **S4:** should "Criar ponto de atenção" on an NC row start with the derived entry's text, as "Editar" on the Pontos screen does?
4. **S3:** the new Etapa 6 note text (authored, for Bruno).
5. **N1:** in the summary, should a Reprovado sheet also count among "apresentaram restrições" and "leituras fora do critério", or only once?
6. **S5 and N2:** what should the verdict and the printed marks be while sheets are open or empty?
   - "Apto" over an empty relatório, and floor marks on an unconcluded sheet, now reach an issued revision (PR #267 open question 1).
7. **N3:** should a row set back from NC to C clear the NC phrase it wrote into its observation, or keep the sheet Com restrições as now?

## What this review did not cover

- **Not walked in the browser:**
  - HEIC and oversized files (22.1 AC3);
  - the retake of a plate that read nothing (22.1 AC4);
  - the CTA "ACEITÁVEL" row (22.2 AC2);
  - a ficha taller than a page (22.3 AC2);
  - Apto com restrições (22.6 AC2);
  - an earlier typed parecer (22.6 AC3);
  - a template's own Conclusão text (22.6 AC4).

  The table names the gate test or kernel test that covers each one.
- **Bruno's real v5 relatório was not opened.** Production is out of scope. The epic context schedules that check after the wave A deploy.
