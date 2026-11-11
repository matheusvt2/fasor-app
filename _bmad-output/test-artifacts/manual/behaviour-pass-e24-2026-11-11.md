# Epic 24 hands-on behaviour passes (2026-11-11)

Two passes through the browser on the local stack, as `dev@local.dev` and `campo@local.dev` of the local dev company, with the `fake` providers. Nothing was fixed during a pass. Evidence (screenshots, PDFs, DOCX) is in the gitignored `.playwright-mcp/e24-pass/` and `.playwright-mcp/e24-pass2/` of the main checkout and is not tracked: some files show texts of a private test base.

- **Part 1, the early pass**, on main `716e26b8`, before the fix batches. Its findings F1 to F17 went to fix batch e24y (#319), to the ledger, or to Epic 25.
- **Part 2, the final pass**, on main `ee0859cc`, after fix batches e24x (#317), e24y (#319) and e24z (#322). It found no High defect and nothing that should stop a deploy; its three Medium findings are G1 (a deadline typed by hand in the point editor leaves a draft behind, so "Rascunho encontrado" shows on the next load; sent to batch e25a of Epic 25), G2 (a TAG rename is not carried to the conclusion text of the same equipment in another open relatório of the obra; ledger row of e24y, and Story 25.7 will block issuing with a stale text) and G3 (an NC row offers a second point; Matheus decided an item may carry several).

What became of the early pass's findings:

| Finding | Went to |
| --- | --- |
| D1 (the point editor closes itself) | fixed in e24x; re-checked in part 2 |
| F1, F16 (the breaker's paired insulation tables break words and numbers) | fixed in e24y on seed v14, flag `paired_tables_fit_whole`; v13 keeps its print |
| F2 (after a TAG rename the print drops the conclusion text) | fixed in e24y |
| F3 (the plate's TAG field does not rename) | fixed in e24y, every seed |
| F6, F10, F11, F17 | fixed in e24y |
| F8 (a winding phase with a deviation gets no variation line) | fixed in e24y |
| F9 (false drops until the oil temperature is typed) | fixed in e24y on seed v14, flag `history_needs_like_with_like` |
| F14 (a hidden original proposed from a photo) | not a defect: only one of the copies carries a base |
| F4 (an NC row offers a second point) | Matheus, 2026-11-11: an NC item may carry several points; nothing changes |
| F7, F12 | Epic 25, Stories 25.10 and 25.7 |
| F5, F13, F15 | ledger |

---

# Epic 24 final hands-on pass (2026-11-11)

- Build: product code of `ee0859cc` (main checkout at `ef7894d4`, docs-only merges after it), with fix batches e24x, e24y and e24z.
- Who: QA agent, through the browser (Playwright MCP), in its own tab, closed at the end.
- Personas: `campo@local.dev` (field) for items 1 to 3 and the screen parts of 5 to 10; `dev@local.dev` (office) for generating, the type list, the composer, the type editor, the v13 relatório and R4.
- Widths: 1280 px for everything; items 1 and 3 again at 768 and 390 px.
- Providers: `fake`. Dictation engine off, so no mic button (not reported).
- Stack: web `http://localhost:5173`, api `http://localhost:3000`, health all "up" at start and end. Nothing started, stopped or restarted. No tracked file touched (`sprint-status.yaml` was already modified at start).
- Evidence: `.playwright-mcp/e24-pass2/`

## Results

| # | Item | Result |
|---|---|---|
| 1 | Point editor stays open | Pass with notes (G1, G3, G4) |
| 2 | NC observation | Pass |
| 3 | Rename and the plate's TAG | Pass with notes (G2, G5) |
| 4 | Print of a second visit | Pass with notes (G6; no preview DOCX route) |
| 5 | Comparison with the previous visit | Pass with notes (G10) |
| 6 | Bruno's words and forms | Pass with notes (G7, G8, G12) |
| 7 | Over-limit on a range | Pass |
| 8 | Small screen fixes | Pass with notes (G9) |
| 9 | Regression sweep | Pass |
| 10 | Widths | Pass with notes (G11) |

### What was seen, item by item

1. **Point editor.** I ran it on three routes at 1280 px in a new relatório R3 (third visit, v14):
   - a contact test with one out reading (310 µΩ) and one rise over 50 % (70 against 42 µΩ);
   - the "Não ensaiado" band of TC-01;
   - an NC item of the No-break.

   Each time I typed in "Texto", waited 3.5 s, typed in "Ação recomendada", waited 3.5 s, tapped a priority, waited 2.5 s, typed a deadline and tapped "Concluir". The editor stayed open through every step and the stored point kept text, action, priority and deadline.
   - One place per test: the contact test offered one "Criar ponto de atenção", then showed "Ponto de atenção 1" and no second offer. TP-01, with two failing tests, offered one per test.
   - Pontos did not flag the standing point while either reading stood. After both readings were corrected it showed "Item alterado" with "Remover ponto".
2. **NC observation.**
   - Chip, then Conforme: the text left with no question.
   - Own sentence, then a chip, then Conforme: the text stayed with "Observação mantida: o texto foi editado." and "Apagar observação". The warning was still there after leaving the sheet and after a reload.
   - Item with a point, then Conforme: "Remover o ponto de atenção deste item?" with "Manter ponto" / "Remover ponto".
3. **Rename and plate TAG.**
   - Concluded No-break with a confirmed, unedited text, pencil rename NB-01 to NB-07: the text took NB-07 and stayed "Confirmado · impresso…". The preview PDF prints the conclusion with NB-07.
   - Concluded seccionadora with an edited text, pencil rename SC-01 to SC-09: the text stayed as written and "Sugerido: texto atualizado — Substituir" is offered. The Sumário says "Texto de conclusão desatualizado: SC-09". The print keeps the edited text.
   - Plate TAG field, QM8 to QM9: title, tree and page title changed. "Desfazer" brought QM8 back everywhere and the plate field read QM8. The print title was checked with a second plate rename in R4 ("DISJUNTOR MT QM5", plate cell QM5), then typed back to QM8.
   - "Copiar da última visita" copied 14 fields and left the TAG at QM8.
   - An existing TAG is refused with "TAG já existe nesta obra — TR-01" and the old value returns. Lower case of an existing TAG is refused too. A blank gives "Informe a TAG".
4. **Print of a second visit.** I regenerated R2's preview (19 pages), and read R3's preview and issued revision 1 (19 pages) and R4's preview (18 pages).
   - Disjuntor MT paired insulation table: "GUARD", "FASE A/B/C" and every "20 °C" value print whole ("6,93", "13,9", "16,4"), and the previous cells read "12 GΩ" on one line.
   - Seccionadora paired table with previous values (R4): the same, with values such as "11,25" whole.
   - The previous column header reads "MANUT. ANTERIOR" with the visit's date under it.
   - Note lines read sensibly, for example the one under the contact table naming the pole, the rise and the limit.
   - DOCX: `GET /api/relatorios/<id>/preview.docx` answers 404 "No such route.". The export dialog gives DOCX and PDF only for an issued revision. I generated revision 1 of R3 and read its DOCX with pandoc: the breaker's paired table, the contact table, the transformer tables, "TERMOGRAFIA" and the Malha's "E1 ·" carry the same cells as the PDF. The issued PDF differs from the preview only by "Rev. 1".
5. **Comparison (transformer).**
   - TR-01 in R3 after "Copiar da última visita", oil temperature empty, readings equal to the last visit's (insulation and all twelve winding cells): no "caiu mais de 50 %" and no "Variou mais de 2 %".
   - After typing the oil temperature: equal readings still clean. 20 GΩ to 8 GΩ gave "Com restrição: caiu mais de 50 % desde a manutenção anterior (80 GΩ a 20 °C, rev. 1, 10/05/2026)…", the preview became "Aprovado · Com restrições?", and the print's note line names it.
   - Neither visit with an oil temperature: TR-02 as a dry unit, readings typed in R3, R3 issued, then R4. 10 GΩ to 4 GΩ was flagged and printed in the note once R4's ambient temperature was in. See G10 for the moment before that.
6. **Words.** All found:
   - "Polaridade invertida: a ficha fica como Reprovado." (TP);
   - the pill "Marcar como Reprovado?";
   - "Item alterado" (Pontos and the NC dialog);
   - "lista de tipos" in the type list, the type editor, "Adicionar bloco" and the composer, with no "paleta" on those screens;
   - "Oculto na lista de tipos: a cópia … está publicada.";
   - "…a relação de transformação é calculada a partir dele. Remova antes o ensaio." (draft unchanged);
   - "Na ordem da placa, separados por ponto e vírgula (;)";
   - "220 V ± 5 %" on the company type's sheet and in its Critérios tab;
   - the QGBT thermography titled "Termografia" on the sheet and "TERMOGRAFIA" in PDF and DOCX, while the Malha keeps "E1 ·" and "E2 ·";
   - the QGBT conclusion with thermography off: "A inspeção do QGBT QGBT-01 apresentou todos os itens verificados conformes.";
   - the band "Aplicado por você. Equipamento fora de carga.", unchanged.
7. **Over-limit.** On the "220 V ± 5 %" row:
   - "> 250" gave "Fora do aceitável (220 V ± 5 %)", "Marcar como Reprovado?" and the Reprovado floor.
   - "> 225" gave no verdict and no suggested conclusion. After my own choice the paragraph read "apresentou valores medidos com leitura a conferir", and it prints so.
8. **Small screen fixes.**
   - "Adicionar bloco": after choosing the last type, the TAG field and "Confirmar" were inside the viewport.
   - P4 pill at 390 px: label on one line, hint on a second, nothing cut.
   - v14 Malha: "Faltam 2 campos de dados da malha, 1 leitura e a conclusão", stepper "Dados da malha · Ensaios · Conclusão · Foto", no "Verificações prontas".
   - Composer: each hidden library type the template places has its row in the list, and "Editar padrões de …" opens its dialog.
9. **Regression.**
   - No-break: plate photo gave 15 suggestions, "Confirmar todos", three battery fields typed, six items, conclusion, print.
   - Malha at 12 Ω against 10 Ω: "A ficha exige no mínimo Reprovado: medição fora do critério.", "Aprovado" disabled, no restriction group, "Conclusão ajustada pela ficha · Confirmar".
   - Before that, my own "Aprovado" + "Com restrições" over a clean sheet was accepted.
   - Points only on a tap: every point in R3 and R4 came from a tap.
   - v13 relatório: opens with the v13 shape (Malha "Dados de placa" with "Fotografar placa", TP with 7 items, transformer with 14). Its new preview has 16 pages and its text is identical to `.playwright-mcp/e24-pass/old-v13-preview.pdf`.
10. **Widths.** At 768 and 390 px there was no sideways scroll on the sheet, the point editor, the rename dialog or the toasts. The full point flow kept everything at both widths. The rename flow passed at both: text follows, "Desfazer", duplicate refused.

## Findings

### High

None.

### Medium

**G1. A hand-typed deadline leaves a draft behind, and "Rascunho encontrado" shows on the next load.**
- Did: in the point editor, typed the "Prazo" by hand and tapped "Concluir". Happened on all three routes and all three widths.
- Saw: the point is stored with the deadline, but a draft of it stays in the device store. On the next app load, on any screen, a toast says "Rascunho encontrado · Recuperar · Fechar".
  - "Recuperar" changes nothing visible and clears the draft.
  - "Fechar" hides it until the next load.
  - A point removed in between is not brought back.
- Controls: a point with text and a priority tap and no typed deadline leaves no draft. A plain point from Pontos › Criar leaves none.
- Expected: no draft after "Concluir".
- Evidence: `06-rascunho-encontrado-on-reload-1280.png`, `04-rascunho-encontrado-after-recuperar-1280.png`.

**G2. A rename does not carry the conclusion text in other open relatórios of the same obra.**
- Did: renamed NB-01 to NB-07 inside R3. R2, in the field on the same obra, held the same No-break concluded with a confirmed, unedited text.
- Saw: in R2 the sheet keeps the old text with "Substituir". The Sumário says "Texto de conclusão desatualizado: NB-07". R2's preview prints the conclusion boxes with no text. "Gerar" lists it only among the Sumário warnings.
- Expected: the text follows the rename there too, as it does inside the relatório where the rename is made.
- Note: the plate field now renames with one keystroke, so this is easier to reach than before.
- Evidence: `18-r2-nb07-stale-text-1280.png`, `r2-preview.pdf` page 17.

**G3. An NC row still offers a second point (earlier F4).**
- Did: created a point from an NC item in R3 and again in R4.
- Saw: the row shows "Criar ponto de atenção" and "Ponto de atenção N" side by side. A second tap opens "Novo ponto" with the same text. I pressed Escape; nothing was stored.
- Expected: one point per item, as on a test.
- Evidence: `51-nc-row-second-point-offer-1280.png`.

### Low

- **G4.** After its point exists, the "Não ensaiado" band shows neither the create button nor a link to the point. Test and NC rows show "Ponto de atenção N". `50-r3-tc01-not-tested-band-1280.png`.
- **G5.** A sheet whose plate TAG was typed before this build keeps it. R2's seccionadora shows and prints title "SC-09" with plate cell "Q1". Production sheets where a technician followed the old helper will look the same. `17-r2-sc09-old-plate-tag-1280.png`, `r2-preview.pdf` page 6.
- **G6.** In the note line under the winding table, a line break falls between "75" and "°C". Table cells are fine. `r2-preview-p-12.png`.
- **G7.** The v14 Malha helper still says "Sem VALOR DE PROJETO na placa, vale ≤ 5 Ω." although the block is now "Dados da malha". `20-r3-malha-v14-empty-1280.png`.
- **G8.** The Malha has no checklist, yet its conclusion ends ", sem itens verificados registrados" on screen and in print. `21-r3-malha-conclusao-ajustada-1280.png`.
- **G9.** The QGBT header says "Leituras prontas" while the thermography does not apply and the sheet has no reading.
- **G10.** While the current visit has no temperature (oil or ambient), the comparison is held and nothing says so. A 60 % drop showed no flag until the ambient temperature was typed. `42-r4-tr02-drop-no-oil-temp-1280.png` shows the flagged state after.
- **G11.** At 390 px the toast "TAG alterada para QM7" wraps into four short lines. `39-rename-toast-390.png`.
- **G12.** The conclusion and section 5 read "(critério: >400 MΩ, aceitável na ficha)" right after a rejected value. The last words name the criterion's source but read as if the value were acceptable. `r3-preview-2.pdf` page 19.
- **G13.** Not Epic 24. The obra page listed "Relatórios desta obra (2)" for the office and "(1)" for the field while the obra held three; those not on the device are left out.
- **G14.** Not Epic 24. In "Novo relatório", typing an existing client's exact name still offers "Criar “Cliente Local”" beside it.

## Earlier findings, re-checked

- D1 (editor closes by itself): fixed on the test, "Não ensaiado" and NC routes, at 1280, 768 and 390 px.
- F1 (breaker table breaks words and numbers): fixed, also for the seccionadora with previous values.
- F2 (stale conclusion after rename): fixed inside the relatório; changed across relatórios (G2, now warned on the Sumário).
- F3 (plate TAG field does not rename): fixed; old sheets keep their old plate value (G5).
- F4 (NC row offers a second point): still there (G3).
- F5 (print letterhead and "Revisão 00" against the screen's company and "Revisão 01"): still there, not Epic 24.
- F6 (TAG box opens under the drawer): fixed.
- F7, F8, F13, F14, F15: not re-checked.
- F9 (false drop before the oil temperature): fixed.
- F10 (Malha header "campos da placa", "Verificações prontas"): fixed.
- F11 (P4 pill at 390 px): fixed.
- F12 ("Recomenda-se a correção dos pontos indicados" with no point): still there.
- F16 (number split from its unit in a cell): fixed in cells; one note line still splits (G6).
- F17 (type name touching the "+"): fixed.
- QGBT ", sem valores medidos registrados" with thermography off: fixed.
- "E1 · Termografia" on the inspection: fixed on screen, PDF and DOCX.
- Malha stepper "Placa": fixed.

## Console and network

- Console: no error. One warning repeats: Chrome's "Geolocation permission has been blocked".
- Network: 1,487 API requests, all 200, 202 or 204. Nothing repeating in error.

## Not checked

- An oil transformer with no oil temperature in both visits: I used a dry one, which has none by nature.
- DOCX of a preview: the route does not exist. Only R3's issued DOCX was read. The seccionadora with previous values was checked in PDF only.
- The NC and "Não ensaiado" point routes at 768 and 390 px: the test route was used there.
- Items 2 and 4 to 9 at 768 and 390 px, apart from the P4 pill.
- "Agrupar por tipo" on; marking a revision "enviado ao cliente"; Story 24.20's disabled "Publicar"; "Fotografar equipamento".
- A real tablet and real providers.

## Ids and what was left behind

- **R3** `01a1ccb6-18ea-7691-a078-07d183a2e2d1`: created by the field persona, v14. Revision 1 generated 11/11/2026 19:59 (`01a1ccd6-3f7c-77a4-b700-0d7d911573d6`), "Em revisão", not marked sent. It now says "há alterações desde a revisão 1" because of the QM8 rename round trip. It holds four points, TC-01 not tested, a thermography applied by hand on TP-01, an added sheet E24S-02, a TRT number and two instruments.
- **R4** `01a1ccd7-35c2-72a1-9672-08eca14de9b5`: created by the office persona, v14, Em campo. It holds readings on SC-09 and TR-02, one NC item on the No-break and four points.
- **Renames on "Obra E24 pass"**: SC-01 is now SC-09 and NB-01 is now NB-07, in R2, R3 and R4. QM8 was renamed and restored and ends as QM8.
- **R2** `01a1cae0-680e-716c-871d-61a90100c9b7`: its Sumário now says "Textos de conclusão desatualizados: TR-01 e NB-07". NB-07 comes from the rename. TR-01 went stale after R3 was issued; I did not confirm why. Its preview was regenerated.
- **v13 relatório** `01a1c559-f13c-77b2-b35f-5f91567a6e73`: one new preview, nothing else.
- **Registry**: manufacturer "Morvatec" created from the fake plate; possibly a learned NC phrase from my typed observation.
- **Browser**: left signed in as `dev@local.dev`. The field persona's device store was cleared at sign-out. The earlier pass's tab was left open as found.
- **Evidence folder**: screenshots `00` to `51`, the PDFs and their text, `r3-rev1.docx`, `network-all.txt` and `plate.jpg`. `r2-preview.docx` is not a document: it is the 47-byte "No such route." answer.

---

# Part 1: the early pass

## Epic 24 hands-on pass (early, before fix batch e24x)

- Date: 2026-11-11
- Build: main `716e26b8` (e24h, e24f, e24b, e24a, e24c, e24p, e24s merged; e24x not in this stack)
- Who: QA agent, through the browser (Playwright MCP), signed in as `dev@local.dev` (office, "Empresa Local Dev"). The field persona `campo@local.dev` was not used (see "Not checked").
- Widths: 1280 px for everything; 768 px and 390 px for the No-break sheet, the point editor and the oil sampling "Outro" field.
- Providers: `fake` (every plate photo returns the synthetic plate of its type). `VITE_SPEECH_ENGINE` is `none` on this stack.
- Stack: web `http://localhost:5173`, api `http://localhost:3000`, health all "up". Nothing was started, stopped or restarted. No tracked file was touched.
- Evidence folder: `.playwright-mcp/e24-pass/`

## Results

| # | Item | Result |
|---|---|---|
| 1 | Story 24.13, No-break de comando | Pass |
| 2 | Stories 24.15 to 24.17, print and points, D1 | Pass with notes (D1 confirmed; F4, F7, F8) |
| 3 | Batch e24a (24.3, 24.4) | Pass |
| 4 | Stories 24.10 to 24.12 and 24.14 | Pass with notes (dictation button not checkable; F10) |
| 5 | Batch e24b (24.5 to 24.8, 24.21) | Pass with notes (F2, F3, F6) |
| 6 | Batch e24c (24.18 to 24.20) | Pass with notes (two parts not reachable, F14) |
| 7 | Points on click (e24h) | Pass |
| 8 | An older relatório (v13) | Pass |
| 9 | Widths 768 and 390 | Pass with notes (F11) |
| 10 | The PDFs | Fail (F1; also F2, F5) |

### What was seen, item by item

1. **No-break.** "Adicionar bloco" offers "No-break de comando · 6 itens · NB-02" under "Outros equipamentos" (NB-01 came from the template). The sheet shows 18 plate fields in the story's order, the battery ones labelled "Baterias: ..." on screen and "BATERIAS: ..." in print; the header says "Faltam 17 campos da placa" (POTÊNCIA ATIVA is optional). "Fotografar placa" returned 15 suggestions; "Confirmar todos" filled them; three battery fields (fabricante, modelo, data) stayed for typing. Six items with the two hints. The stepper has Placa, Verificações, Conclusão, Foto and no Ensaios step. Progress read "Placa pronta · faltam 6 verificações e a conclusão", then "Placa e verificações prontas · falta a conclusão". With item 4 NC the preview was "Aprovado · Com restrições?" and the text named the item with no word on measured values. The PDF prints "NO-BREAK DE COMANDO NB-01" with its plate table, six rows, OBSERVAÇÕES and CONCLUSÃO.
2. **Print and points on R2.** Every table with a previous value prints "MANUT. ANTERIOR 10/05/2026" (the service date, not the issue date 11/11/2026); the screen helper reads "Anterior: 40 µΩ (rev. 1, 10/05/2026)". One note line prints after the contact table ("Em relação à manutenção anterior: T1-T2–Fase A, alta de 52,5 % ..."), one after the transformer's insulation table and one after the winding table. An out-of-criterion test offers "Criar ponto de atenção"; before the tap the device store held no point. The recommendation of a company type's test filled "Ação recomendada" (E24S-01). D1 is confirmed, see "Known items".
3. **e24a.** A contact reading of 310 µΩ against <250 µΩ gave "Reprovado?" only, "Aprovado" disabled, no restriction group, the line "A ficha exige no mínimo Reprovado: leitura fora do critério." and OBSERVAÇÕES "Obrigatória em ficha reprovada". The reading's helper offers no "Marcar Com restrições". On MA-01 the technician's own "Aprovado" plus "Com restrições" was accepted over a clean floor; after the resistance went to 12 Ω (project 10 Ω) the sheet showed "Conclusão ajustada pela ficha · Confirmar", and Confirmar left Reprovado with no restriction. Section 10 of R2 reads "Não apto" and names QM8 (test, value, pole, criterion) and MA-01; the third fixed bullet is absent. An NC observation typed in two lines prints as one clause joined by "; ".
4. **v14 sheets.** TP: 7 items, hint "Íntegros e com especificação correta" under Fusíveis. TC: 6 items, no Fusíveis. Transformer with no insulation type: 17 items asked. Dry: the eight oil items read N.A. (TANQUE E ALETAS among them), the three dry items are asked, the oil sampling reads "Não se aplica: TIPO DE ISOLAÇÃO não é ÓLEO ISOLANTE.", and the oil-only plate fields are read-only with "Não se aplica: TIPO DE ISOLAÇÃO é Á SECO.". Answering the three dry items and switching to ÓLEO ISOLANTE cleared them with the toast "3 itens de unidade a seco apagados · Desfazer". Inspeção de QGBT: 12 items, "Reaperto geral" and "Teste de funcionamento" with hints, thermography optional (concluded without it, no table printed). Oil sampling "Outro": "Descreva o motivo" appears, counts as missing while empty, leaves when the reason changes, and prints "MOTIVO: OUTRO, ...". Malha: block titled "Dados da malha", no "Fotografar placa".
5. **e24b.** The suggested pair reads "Prévia da conclusão", pill "Prévia", line "Prévia: só vale depois de Confirmar ou de Concluir ficha."; the row's Confirmar stores it and the row leaves. A chip tap fills the observation; on a hand-edited observation a second chip is appended, nothing is replaced. NC to Conforme with an edited observation keeps it with "Observação mantida: o texto foi editado." and "Apagar observação" (then "Observação apagada · Desfazer"). NC to Conforme with a point asks "Remover o ponto de atenção deste item?" with "Manter ponto" / "Remover ponto", the row already Conforme behind it. New TAGs are two digits (SC-01, DJ-01, NB-01, TR-03 next). After "Renomear TAG" DJ-01 to QM8 in R2 the sheet kept every "Anterior" value and the rise rule.
6. **e24c.** A measurement row of a company type took "nominal ± %" (220 and 5), the criteria row previews "220 V ±5 %", the type published. On the sheet the test reads "220 V ±5 %"; 215 V raised nothing, 240 V read "Fora do aceitável (220 V ±5 %)" and floored Reprovado. Published copies hide their library originals in the template composer and in the relatório's "Adicionar bloco"; the type list says "Oculto nas paletas: a cópia ... está publicada.". On a copy of the transformer, removing DESLOCAMENTO ANGULAR, changing its kind or removing an option is refused with a clear toast and the draft is unchanged.
7. **Points on click.** R1 ended with one point and R2 with two, each created by a tap. An NC row, a Reprovado sheet, a restricted reading and a failed test created nothing by themselves (Pontos screen, Sumário, device store and section 8 checked).
8. **Older relatório.** `01a1c559-f13c-77b2-b35f-5f91567a6e73`, seed **v13**, read from `seed_version` of its row in the device store (created 2026-11-10 from "E23 pass"). TP and TC ask 7 items with Fusíveis and no hint, the transformer 14 with "Ventiladores", the Malha says "Dados de placa" with "Fotografar placa", "Adicionar bloco" offers no No-break and shows "Inspeção de QGBT · 10 itens". The stored conclusion texts read as written. The preview PDF generated (16 pages): header "MANUT. ANTERIOR" with no date, no note line.
9. **Widths.** No sideways scroll at 768 or 390 on the No-break sheet, the point editor or the "Descreva o motivo" field; the point editor's "Concluir" is reachable.
10. **PDFs.** R1 issued (18 pages) and R2 preview (18 pages) read. Sections 8 and 10 are right. Section 9 has F1.

## Findings

### High

**F1. Print: the breaker's insulation table breaks numbers and a header word when it carries a previous visit.**
- Did: R2 (second visit), sheet QM8 (Disjuntor MT), insulation values typed with the temperature set; preview PDF.
- Saw: in "DISJUNTOR CONTATO ABERTO / FECHADO" the header "GUARD" prints as "GUAR" over "D", and every value of the "20 °C" column is cut in two lines: "6,9 / 3", "13, / 9", "16, / 4", "11, / 3", "10, / 1", "12, / 6". "FASE A", "FASE B" and "FASE C" also wrap.
- Expected: every word and number whole, as Story 24.15 asks for the transformer's table.
- Note: I could not find a v13 relatório with a breaker holding previous insulation values, so I cannot say whether v13 prints the same; "FASE C" alone already wraps on a first visit and on v13.
- Evidence: `r2-preview.pdf` page 7; `r1-rev1.pdf` page 7 for the first-visit shape.

### Medium

**F2. After a TAG rename, the sheet's confirmed conclusion goes stale and the print drops it, with no warning.**
- Did: concluded DJ-01 in R2 with its text confirmed, then renamed the TAG to QM8, then generated the preview.
- Saw: the PDF printed the CONCLUSÃO boxes for QM8 and no conclusion text. The sheet still showed the old text ("O disjuntor DJ-01 ...") with "Sugerido: texto atualizado — Substituir"; the tree said "Concluída", the header "Ficha completa", and the Sumário listed nothing about it. After "Substituir" and "Confirmar" the text printed again.
- Expected: the text follows the rename, or the Sumário says a confirmed text needs a new look before printing.
- Evidence: `r2-preview-first.pdf` page 8, `25-r2-qm8-conclusao-after-rename-1280.png`, `r2-preview.pdf` page 8.

**F3. The helper that asks for the plate's TAG sits on a field that does not rename the equipment.**
- Did: on SC-01 and DJ-01 in R2, typed a new TAG ("Q1", "QM8") over the prefilled value of the plate's "TAG" field, whose helper reads "Sugestão do app. Troque pela TAG da placa, do diagrama unifilar ou a usada no local."
- Saw: the plate field kept the typed value; the sheet title, the tree, the page title and the print title stayed "SC-01" / "DJ-01". Only the pencil beside the title ("Renomear TAG") renames the equipment. That dialog and the TAG box of "Adicionar bloco" carry no helper.
- Expected: following the helper renames the equipment (Story 24.8: "types QM8 over it, then the equipment is QM8").
- Evidence: `21-r2-tag-rename-1280.png`; `r2-preview.pdf` page 7 shows the plate cell TAG beside the title.

**F4. An NC row keeps offering "Criar ponto de atenção" after its point exists.**
- Did: created a point from item 4 of NB-01 (R1), then looked at the row.
- Saw: the row shows the button and "Ponto de atenção 1" side by side; a second tap opens "Novo ponto" again with the same text. (Escape stored nothing; I did not save a second one.) On a test, the place shows only "Ponto de atenção N" and offers no second.
- Expected: one point per finding on both places.
- Evidence: `05-nc-row-after-point-1280.png`.

**F5. Screen and print disagree on the company's identity (seen before Epic 24, not caused by it).**
- Did: generated R1 and R2.
- Saw: "Gerar relatório" and Cadastros › Empresa show "Empresa Local Dev Engenharia Ltda", its CNPJ, its address and "FO.SERV-03 · Revisão 01". The PDFs print another company's name, CNPJ, address and logo, and "Revisão 00". The server's company payload holds only the "Empresa Local Dev" row. The PDFs of the 2026-11-10 pass (`.playwright-mcp/e24h-pass/`) print the same, so this is older than Epic 24.
- Expected: the print uses what the screen shows.
- Evidence: `r1-rev1.pdf` pages 1 and 2.

### Low

- **F6.** In "Adicionar bloco" the box with TAG, Local and "Confirmar" opens under the visible part of the drawer for the last types of the list (No-break de comando, the company copies). The tap seems to do nothing until the drawer is scrolled. `28-palette-expanded-1280.png`.
- **F7.** With an out-of-criterion pole and a rise on another pole of the same contact test, the sheet's conclusion and section 10 name only the first ("máxima de 310 µΩ"); the 52,5 % rise on pole A appears only in the note line under the table.
- **F8.** A winding phase that both deviates between phases and varied more than 2 % since the previous visit shows only the deviation; no note line prints for it. With the three phases varied and no deviation, the line prints. `24-r2-tr01-winding-variation-1280.png`.
- **F9.** "Copiar da última visita" does not copy TEMPERATURA DO ÓLEO (reasonable), but until it is typed the same readings as last visit are flagged "caiu mais de 50 %" and "Variou mais de 2 %", because the two visits are corrected from different temperatures. The flags leave once the oil temperature is typed.
- **F10.** v14 Malha: the header says "faltam 2 campos da placa" and "Verificações prontas" on a sheet with no plate and no checklist (same family as the known "Placa" stepper). `15-malha-v14-1280.png`.
- **F11.** Point editor at 390 px: the "P4 · Próxima manutenção" pill wraps into three lines and its hint is squeezed. `35-point-editor-390-bottom.png`.
- **F12.** A restriction chosen by the technician over a clean sheet composes "... dentro dos critérios de aceitação ... Recomenda-se a correção dos pontos indicados ..." with no point indicated.
- **F13.** Before an NC item has an observation the conclusion reads "apresentou baterias (item 4, NC)".
- **F14.** "Fotografar equipamento" proposed "Chave seccionadora (SC)" while three published copies of the seccionadora exist; Story 24.19 says no type is proposed when two copies hide the original. Unsure whether copies in another print group count. `37-fotografar-equipamento-1280.png`.
- **F15.** "Gerar relatório" shows "Último envio de Matheus Torres: 09/11 03:10" minutes after this device pushed; the server's summary holds two devices for the user and the older one is shown. Not Epic 24.
- **F16.** Winding table, MANUT. ANTERIOR cell: a line break falls between a number and its unit ("1,21" / "mΩ"). `r2-preview.pdf` page 12.
- **F17.** "Adicionar bloco" at 1280 px: "Chave de transferência automática" runs up to the "+" with no gap.

## Known items, confirmed

- **D1, confirmed on the test route, denied on the NC-item route.** Editor opened by "Criar ponto de atenção" on the contact test (R2, DJ-01): I typed "Medir de novo" in "Ação recomendada" and waited. The editor closed by itself about 1,2 s after the last key (2,2 s after the first), before any priority could be tapped. Kept: the point (origin `reading`, test key), its text and the typed action. Not kept: priority and deadline, since the editor was gone; they need Pontos › Editar. On E24S-01 a tap on "P2" with nothing typed closed the editor in about 0,1 s; text, action, P2 and the deadline were kept. The same editor opened from an NC row (R1, NB-01) stayed open through typing in both fields, a 3 s wait and two priority taps, and kept everything on "Concluir". `19-r2-d1-after-typing-1280.png`.
- Inspeção de QGBT conclusion ends ", sem valores medidos registrados" with the thermography off (screen and `r1-rev1.pdf` page 16).
- The inspection's thermography is headed "E1 · Termografia" on the sheet too.
- v14 Malha stepper says "Placa".
- Not crossed: the cleared hand-typed observation, the 1.000-character action, the late-issued older visit. A 240 V reading on the "nominal ± %" row did get its verdict.

## Console and network

- Console: no error. One warning repeats (5 times): Chrome's "Geolocation permission has been blocked".
- Network: 1.625 requests 200, none repeating in error. Two `POST /api/sync/ops` aborted by my own page changes; two 502 on `/api/account` and `/api/sync/company`, once.

## Not checked

- The field persona `campo@local.dev`: the whole pass ran as `dev@local.dev`, for time.
- The dictation button on "Descreva o motivo": no mic renders anywhere on this stack (`VITE_SPEECH_ENGINE=none`), the sheet's OBSERVAÇÕES included.
- The DOCX files: only PDFs were read.
- "Agrupar por tipo" on: the No-break's place under "Outros equipamentos" before the Malha (the local had it off, so the print followed the tree).
- The plate's own TAG at "Fotografar equipamento": the fake reading returns no TAG.
- Print of the "nominal ± %" row and the edge readings 209 / 231 / 208,9 / 231,1 V.
- Story 24.20's disabled "Publicar" and the server's refusal: they need a draft broken by an older build.
- Retiring a copy to bring the library type back (would change the dev company's palettes).
- "Outro" on a v13 oil sampling (would write to the old relatório); a third relatório after the rename; the local's "Verificações do local" rows; thermography under load; the Disjuntor MT in oil; Story 24.9.
- R1 was generated (revision 1, "Em revisão") but not marked "enviado ao cliente".

## Ids and URLs

- Template "E24 pass": `01a1caca-1764-707d-bbd5-068e42668a64`, `http://localhost:5173/templates/01a1caca-1764-707d-bbd5-068e42668a64` (a copy of "E23 pass" plus a second transformer, Inspeção de QGBT and No-break; the library types were only reachable this way, since published copies hide them in the composer).
- Obra "Obra E24 pass" (Cliente Local): `01a1cacc-3914-77e6-a61e-1c708f79b5b9`.
- R1 (v14, service 10/05/2026, revision 1 generated 11/11/2026): `01a1cacc-9e6a-777b-ad4a-12513d2b83c7`, `http://localhost:5173/relatorio/01a1cacc-9e6a-777b-ad4a-12513d2b83c7`; revision `01a1cadc-98d4-77f6-b2eb-3a02fc847b43`.
- R2 (v14, service 11/11/2026, Em campo): `01a1cae0-680e-716c-871d-61a90100c9b7`, `http://localhost:5173/relatorio/01a1cae0-680e-716c-871d-61a90100c9b7`.
- Older relatório used for item 8 (v13): `01a1c559-f13c-77b2-b35f-5f91567a6e73`. Only a preview was generated on it.

## Left behind in "Empresa Local Dev"

- The template, the obra and the two relatórios above. In R2: DJ-01 renamed QM8, SC-01's plate TAG is "Q1", a sheet E24S-01 was added.
- Company type "E24 pass seccionadora", published version 1 (`01a1caec-5882-75a0-9559-a84d387cd389`), a copy of "Chave seccionadora (cópia)"; it shows in the palettes.
- Draft type "Transformador de força (TR-OL) (cópia)" (`01a1caf0-3b99-776c-a215-ab6be501570a`), not published.
- Manufacturers "Voltrix" and "Tensilda", created from the fake plates; a few learned NC phrases.
- In the evidence folder, besides screenshots and PDFs: working files `snap-*.yml`, `network-all.txt`, `*-flat.txt`, `*.txt` extractions and `plate.jpg`. I tried to delete the working files; the repository's destructive-command hook blocked it and I did not override it.

