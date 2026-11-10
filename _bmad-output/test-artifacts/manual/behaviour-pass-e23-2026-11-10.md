# Epic 23 hands-on behaviour pass (2026-11-10)

Run by a QA agent through the browser on the local stack, product code of `47be2638`, as `dev@local.dev`, at 1280 px, with the `fake` providers. Nothing was fixed during the pass. Evidence (screenshots, preview PDFs) is in the gitignored `.playwright-mcp/e23-pass/` of the main checkout and is not tracked: some files hold text of Bruno's base.

Two relatórios on seed v13 were used: R1, issued (the previous visit), and R2, a second visit on the same TAGs. The template was built for the pass with a seccionadora, a disjuntor MT, a TP, a TC, a transformer and a Malha de aterramento.

## Results

| # | Item | Result |
| --- | --- | --- |
| 1 | Transformer insulation in print with the "20 °C" column | Fail: words and numbers break |
| 2 | Same table with MANUT. ANTERIOR and per-row ACEITÁVEL | Fail: readable at 6,5 pt, a word still breaks |
| 3 | TP insulation judged by the table | Pass |
| 4 | Contact resistance against the previous visit | Pass (a rise above 50 % reproves; exactly 50 % does not) |
| 5 | Thermography | Pass, with notes |
| 6 | Malha de aterramento | Pass, with notes |
| 7 | Base import, "Como ensaiar" (also offline), recommendation, print group | Pass, with notes |
| 8 | Winding resistance, TTR per tap, oil sampling, polarity, NA by the nameplate | Pass, with notes |

## Findings

### High

- **F1. Local data only.** The dev company's two older templates do not open: they were moved to v13 by an intermediate build and their transformer block still carries the sub-block `ia_ip_display`. A read-only count in production on 2026-11-10 found 11 templates on v13 in 2 companies, none with that sub-block, and no such transformer block. The screen says "Nenhum template" where it could say templates exist but cannot be read.
- **F2. "Copiar da última visita" copies the oil and winding temperatures.** They are measured on the day and drive the temperature correction, so the second visit's readings are corrected and judged with the first visit's temperature, with no notice.
- **F3. The v13 transformer insulation table breaks words and numbers in print.** With one criterion (9 columns plus "20 °C") it prints at 8 pt, "SECUNDÁRIO" breaks in three cells and a corrected value breaks ("22," over "6"). With per-row ACEITÁVEL (10 columns) it prints at 7 pt, and with MANUT. ANTERIOR (11 columns) at 6,5 pt; "SECUNDÁRIO" breaks in both. The "30 SEGUNDOS" and "ESTAB./10MIN" columns are wide and hold "-", while the connection columns and "20 °C" are too narrow.

### Medium

- **F4.** The previous-visit comparison judges the values corrected to 20 °C and shows the measured ones: the helper says the reading fell more than 50 % (naming the corrected previous value) beside "Anterior: 12 GΩ" and a reading of 10 GΩ. In print the row shows 10, 20 and 12 GΩ while the conclusion says "queda de mais de 50 %"; the derived point gives no values.
- **F5.** On an oil transformer TEMPERATURA DO ENROLAMENTO and CLASSE TÉRMICA (dry-only) take a value on screen and print "-".
- **F6.** Section 9 prints values only, with no criterion and no verdict per row, for winding resistance, thermography and both ground grid tests. The contact table prints "ACEITÁVEL <250 µΩ" over a 61 µΩ row reproved by the 50 % rise.
- **F7.** With a design value, the ground grid criterion reads "≤ valor de projeto (sem ele, ≤ 5 Ω)" in the test header, the suggested conclusion, the derived point and the PDF; only the row helper states the number.
- **F8.** Question for Bruno: is a rise of exactly 50 % already Reprovado? The app reproves only above 50 %.

### Low

- **F9.** TAPS takes only ";" between values; the separator is named only in the error.
- **F10.** The oil sampling reason "Outro" has no text field.
- **F11.** Thermography: not applicable until answered, so a sheet concludes with no thermography and no notice; the override text repeats itself; the same four points on every type ("Contatos" on a transformer); nothing near "Foto térmica" shows the photo was attached.
- **F12.** With two out thermography readings the conclusion and the point name one; the restricted wording repeats the column name.
- **F13.** The print header "20 °C" does not say it is the corrected value; "FASE C" wraps on the breaker's paired insulation tables.
- **F14.** Import: rows with no test in the app are listed by ID only; imported copies sit under "Outros equipamentos" in "Adicionar bloco" though they print in their base group; transformer copies suggest "TR-PRIMARIA" where the library type suggests "TR-10".
- **F15.** The recommendation goes into the point's text while "Ação recomendada" stays "—"; the long row splits across two pages.
- **F16.** TP: the fallback sentence sits inside the collapsed "Fonte do critério"; no hint with the insulation type set and the AT empty; TP and TC offer "ÓLEO MINERAL" where the transformer offers "ÓLEO ISOLANTE"; readings in GΩ, the criterion in MΩ.
- **F17.** Winding resistance shows both criteria in one line before the insulation type is chosen; the restricted and out helpers are built differently.
- **F18.** The ground grid sheet has "Dados de placa" and "Fotografar placa".
- **F19.** "Critérios usados" for the contact rise reads "61 µΩ · critério <250 µΩ", which looks like a pass.
- **F20.** "Agrupar por tipo" is off on a new template's local and is switched only from the tree menu inside a sheet; with it off nothing prints under "Outros equipamentos".

## Not checked

The DOCX; the type editor's "Como ensaiar" fields; tablet and phone widths; the real camera; thermography rows on all eight types; the IP judgement, the HH fuses, the TC function and S classes; "Marcar como enviado ao cliente"; the 6 pt step of the per-row table.

## What follows (Matheus, 2026-11-10)

- Fix batch e23p before the release v0.8.0: F2, F3, F4 (screen and the point's text), F5 and F7.
- F4's print half, F6 and the low findings go to Epic 24 or to the next list of questions for Bruno.
- F1 needs no production change.

### Outcome (2026-11-10, coordinator)

- Fix batch e23p (PR #301, merged as `9add87b5`) fixed F2, F3, F4 (the screen and the point's text), F5 and F7. Its record is `_bmad-output/implementation-artifacts/spec-e23p-pass-fixes.md`.
- The PDF crops of the four insulation table shapes after the fix are in `_bmad-output/implementation-artifacts/e23p-pdf-crops/`.
- Matheus accepted the type sizes of the fixed table on 2026-11-10: 7,5 pt with one criterion, 7 pt with ACEITÁVEL per row, 7 pt with one criterion and MANUT. ANTERIOR, and 6 pt with ACEITÁVEL per row and MANUT. ANTERIOR, every word whole.
- F8 is a question for Bruno. F6, F4's print half and F9 to F20 stay for Epic 24 or for the next list of questions for Bruno.
