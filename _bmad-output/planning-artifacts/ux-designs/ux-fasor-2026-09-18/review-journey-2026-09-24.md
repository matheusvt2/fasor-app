# Journey review: the field engineer fills a relatório (2026-09-24)

Reviewers: Amelia (senior engineer) and Sally (UX designer), at Matheus's request. Scope: everything merged on `main` at commit `253215e` (Epics 1 to 5), measured as a field engineer would use it, against the interaction budget of `EXPERIENCE.md` § Interaction budget and the paper FO.SERV-03 the product replaces. Evidence: the screenshots in `_bmad-output/implementation-artifacts/reviews/journey-review-2026-09-24/` (prefix `J` for the journeys, `A` for the aesthetics pass, `M` for the prototype mocks at the same widths) and the reproducible scripts under § Method.

Companion outputs of the same review:

- `DESIGN.md` v0.9 direction (§ v0.9 of that file), `mockups/tokens-v09.css`, `mockups/components-v09.css`, `mockups/key-equipment-sheet-v09.html`, `mockups/key-relatorio-overview-v09.html`.
- Sprint change proposal `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-24.md` and the six stories of Epic 12 in `epics.md`.
- Open decisions for Matheus, § Open for Matheus below.

## 1. Summary

The whole journey exists end to end and every field autosaves; nothing typed today was lost. Against paper the app already wins on the second sheet of a type (copy chips, bulk C, generated conclusion) and at the office (no retyping, no photo numbering). It loses in four places that the numbers below make visible: taps that silently do nothing, navigation that forces the engineer back instead of forward, work repeated from sheet to sheet (instrument, cabine block, NC observation), and the visual skin, which reads as a desktop form and breaks two rules of its own spine.

| Journey | Measured today (tablet 768 px) | Spine target | Paper |
|---|---|---|---|
| J0 Resume the sheet where I stopped | 2 taps (card, then the row marked "você parou aqui"); Home "Continuar" disabled | 1 tap (Flow 2 step 1) | open the clipboard |
| J5 Create a relatório from nothing to the first sheet | 12 taps, 56 keystrokes, 2 dialogs, 1 forced "Voltar"; plus a detour of about 22 taps to register an instrument that setup Etapa 4 demands without a shortcut | none | one A4 header |
| J1 Chave seccionadora, nameplate typed | 24 taps, 87 keystrokes, 1 lost tap | 20 taps, 15 keystrokes with signal; about 36 keystrokes offline | about 41 handwritten cells, then the same 41 typed in Excel |
| J1 Cabos de entrada, first sheet of the cabine | 13 taps, 35 keystrokes (7 taps and 15 keystrokes are the cabine block) | | |
| J3 Second seccionadora, "Igual à" + "Repetir" | 9 taps, 36 keystrokes, 2 lost taps; 4 of the 9 taps pick the same instrument twice | 5 taps, about 36 keystrokes offline | 41 cells again |
| J2 One NC | +2 taps (NC, chip) and the observation written twice: item and sheet (about 45 keystrokes) | 1 chip | one line |
| J4 Não ensaiado | 3 taps, reason preselected | none | a line in section 8 |
| J6 Generate the DOCX | 3 taps, about 15 s | none | a day in the office |

Keystroke counts include the digits of readings and the letters of names. Tap counts exclude scrolling. "Lost tap" means a tap the app acknowledged with nothing: no state change, no toast.

## 2. Findings

Severity: P0 causes rework or data errors in the field; P1 costs taps or forces a detour on every sheet; P2 polish. Each finding names its evidence, the spine sentence it measures against, and the proposed change with its story in Epic 12.

### P0

**J-01 The first tap after a field commit or a section collapse is lost.** Reproduced four times in one session: "Marcar os restantes como Conforme" twice (CE-ENEL after Enter in Tensão primária; SEC-ENEL after typing the date of fabrication), "Repetir da ficha anterior do mesmo tipo" once (SEC-ENEL-2 right after Enter in Nº série), the instrument picker once (SEC-ENEL-2 right after the stepper re-expanded the checklist). The same tap a second later works. No toast, no counter change, no announcement. Script: type into any sheet field, press Enter, tap a bulk action within about 300 ms. Spine: "every structural edit gives a toast with Desfazer" (EXPERIENCE.md § Interaction Primitives); a tap with no feedback breaks the autosave contract. Likely cause: the blur commit rebuilds the snapshot ([ficha-surface.tsx:97](../../../../apps/web/src/surfaces/ficha/ficha-surface.tsx#L97)) and the pressed element re-renders between pointer down and pointer up, so React Aria's press is cancelled. Story 12.1.

**J-02 "Igual à ⟨TAG⟩?" copies the per-unit fields.** After the copy, SEC-ENEL-2 holds Nº série 123456 and TAG "SEC-ENEL" of the other switch (screenshot J3-03). Both print. Epic 5 review OQ-5 left this open; the data decides it: IDENTIFICAÇÃO, Nº SÉRIE and TAG are never copied. Story 12.3.

**J-03 The cabine fields do not count as required.** CE-ENEL opens "11 obrigatórios faltando" with Tipo de SE, tensions, power, temperature and humidity empty ([sheet-progress.ts:82-85](../../../../packages/domain/src/relatorio/sheet-progress.ts#L82-L85)); the cabine can be concluded blank and prints blank. The mock marks "Potência instalada" as "Obrigatória na cabine" (`prototype/screens/60-ficha.html`). Story 12.3.

**J-04 The completed section collapses under the finger.** On SEC-ENEL-2 the checklist collapsed the instant the NC chip filled the observation, hiding the row being edited (J2-01b). EXPERIENCE.md § Section stepper says "completed sections collapse"; the conversation retracts the timing: a section collapses when the engineer leaves it, never while focus is inside it, and never while it holds an amber reading (Epic 5 OQ-4). Story 12.1.

### P1

**J-05 Resume is not one tap.** Home "Continuar" is disabled with "Disponível em uma próxima etapa" ([relatorio-card.tsx:48-59](../../../../apps/web/src/surfaces/home/relatorio-card.tsx#L48-L59)) and the card has no "n de N fichas" counter (J0-03 against M-home-tablet). Story 12.2.

**J-06 Three dead ends in the forward path.** "Concluir dados do relatório" saves, shows "Dados salvos" and stays (J5-08); "Voltar" from a sheet lands on `/arvore`, a page reading "Abra uma ficha na árvore." (J0-01), so the Sumário is two taps away; the section text surface offers only "Voltar ao sumário". Story 12.2.

**J-07 The instrument is picked per test, per sheet.** Two pickers on a seccionadora, one on every other type, 94 sheets on the reference job; the spine's "last used first in the list" still costs two taps each. The conversation's decision: the kernel suggests the last instrument used for that test kind in this relatório, shown amber "Sugerido" in the test header, confirmed by "Concluir ficha" unless the engineer changed it. J3 drops from 9 to 5 taps. Story 12.3.

**J-08 The cabine block repeats on every sheet.** "Características da SE" and "Ambiente de ensaio" render read-only at the top of all nine sheets of Cubículo Enel, pushing "Dados de placa" a full screen down (J1-04, A-ficha-SEC-ENEL-768). The mock's SEC-C05 starts at "Dados de placa" (M-ficha-SEC-C05-tablet). Decision: one line "Cubículo Enel · Alvenaria · 13,8 kV · 25 °C · 65 %" with "Editar", editable from any sheet of the cabine, expanded only on the first sheet or when something is missing. Story 12.3.

**J-09 The empty nameplate hides its fields behind "Digitar".** One extra tap per new equipment and no preview of what is asked (J1-06b); the mock shows the fields with the copy chips above. Focus after "Outro…" on Fabricação and Tensão de placa lands outside the new combobox, so each costs a second tap. The nameplate TAG field is typed although the block's TAG is the sheet title. Story 12.4.

**J-10 The NC observation is written twice.** The item observation ("conexão frouxa", one chip) and then "Observações da ficha", required "com restrições" (J2-03). Decision: the sheet observation is born suggested from the NC items ("Item 7: conexão frouxa") and confirmed with the conclusion text. Story 12.4.

**J-11 Setup demands an instrument and offers no way to register one.** Etapa 4 renders an empty list; "Concluir dados do relatório: falta um instrumento" (J5-05). The detour is Voltar, Voltar, Cadastros, Instrumentos, a 12-field form, then back. Story 12.2 adds "Cadastrar instrumento" in the band, as the sheet already does.

**J-12 Dates default to nothing.** "Início da parada" opens empty and "Criar relatório" waits for eight digits (J5-03). In the field the default is today. Story 12.2.

### P2

**J-13 Labels in caps.** The screen prints the seed labels verbatim ("TENSÃO PRIMÁRIA"); DESIGN.md § Typography says "No ALL-CAPS labels" and the mock shows "Tensão primária". The document keeps the caps. Story 12.5.

**J-14 Three progress indicators in one header.** "11 obrigatórios faltando", the sync badge "2 pendentes" and the stepper counts say overlapping things (J1-00). v0.9 keeps one sentence in the header and the counts in the stepper. Story 12.5.

**J-15 The sticky bar keeps a disabled bulk action.** After the checklist is complete the bar still shows "Marcar os restantes como Conforme" with "Todos os itens já estão marcados" (J1-03). The mirror should leave the bar with the checklist. Story 12.1.

**J-16 "Não ensaiado" preselects a reason.** "Impossibilidade de desligamento" is checked before any tap (J4-02); one wrong tap on the primary records it. Epic 5 OQ-6; see Open for Matheus.

**J-17 App bar title.** The Sumário's app bar reads "Sumário"; the mock shows the relatório name (M-relatorio-tablet). Noted in the Epic 4 QA, still open. Story 12.5.

**J-18 Sumário at 390 px.** The number column and the "sempre no início" cell squeeze the row text into a narrow column (A-sumario-390). Story 12.5.

**J-19 The relatório went Em campo to Emitido in one generate.** The export dialog reported "Emitido" after the first revision (J6-03); the AD-22 table says generate moves to Em revisão and issue to Emitido. Reported for Epic 7, not a journey finding.

## 3. Layout and aesthetics

### App against the current mocks (app ≠ mock, to fix)

- Labels in caps (J-13); the mock is sentence case.
- Cabine block on every sheet (J-08); the mock shows it on the cabine's first sheet only.
- Home card without "n de N fichas" and with a disabled "Continuar" (J-05).
- Sumário app bar title (J-17).
- Sticky bar: the camera slot is empty (waits for Epic 6) and the bar unsticks below 600 px of height (Epic 5 QA); the mock keeps it docked.
- Stepper: the app shows "Placa ✓" on a sheet with no nameplate at all; the mock omits the step when the sub-block is off.

### Mock against the field (mock to change, DESIGN.md v0.9)

What stays, because it is safety and not style: ink on surfaces at 7:1 or better, amber only for suggestion, red only for what the engineer marked, 48 px and 56 px targets, both themes, no meaning by color alone, no emoji, PRODUTO as the only brand.

What changes, in words (tokens and rules in `DESIGN.md` § v0.9):

- **Fields.** The closed box becomes a filled field: `surface-sunken` background, no side borders, a 2 px bottom rule in `border-strong` that turns 3 px `focus` with the `focus-fill` background on focus. Same 56 px height, same value alignment, 12 px shorter per field with its label. A seccionadora nameplate fits in one screen more than today.
- **Typography.** Title 24/600, heading 18/600, label 14/500 sentence case (the 14 px floor stays), value 22/600 tabular, meta 14/400. Letter spacing on the title tightens to -0.01em.
- **Surfaces.** `surface-base` to `#F7F8FA`, cards with one hairline and 12 px radius, no double borders; the sheet header loses its 2 px bottom rule and gains a 1 px hairline.
- **Tri-state.** One 56 px segmented control with the chosen segment filled solid (`conforme`, `nao-conforme`, `nao-aplica`) and its letter in `primary-foreground`; unselected segments stay outlined. Contrast of white on the three solids: 6.6:1, 6.6:1, 6.0:1.
- **Stepper.** Names on one row, a 3 px progress rule under each name in `conforme` when complete, `fora-do-limite` while missing, the count only where something is missing.
- **Sheet header.** One sentence: "Placa e verificações prontas · faltam 9 leituras" (kernel text), the TAG as the title, the path as meta.
- **Primary button.** 10 px radius, a 4 % vertical gradient on `primary`; contrast unchanged.
- **Sumário rows.** Row number in a 32 px circle of `surface-sunken`, the status sentence in meta, chevron and overflow in one trailing cluster; section 9 rows indent 24 px with a 2 px rule in `primary` for the open cabine.
- **Home.** The four tiles become one segmented filter row; the current card gets the 2 px `primary` edge and the "Continuar: SEC-C05 · 42 de 94" button already in the mock.

Before and after: `mockups/key-equipment-sheet.html` and `mockups/key-relatorio-overview.html` against `mockups/key-equipment-sheet-v09.html` and `mockups/key-relatorio-overview-v09.html`.

## 4. Decisions of the conversation

| # | Decision | Owner |
|---|---|---|
| D-1 | Lost taps are the first story and ship alone; J1 and J3 are re-measured after it | Amelia, Story 12.1 |
| D-2 | A completed section collapses when the engineer leaves it, never while focus is inside it or an amber reading is in it (retracts the EXPERIENCE.md timing) | Sally, Story 12.1 |
| D-3 | Copy never carries IDENTIFICAÇÃO, Nº SÉRIE or TAG; the seed marks them `per_unit` | Amelia, Story 12.3 |
| D-4 | The instrument is suggested per test kind from the last one used in the relatório and confirmed by "Concluir ficha"; nothing is written without that tap | Sally and Amelia, Story 12.3 |
| D-5 | The cabine block is one line with "Editar" on every sheet, expanded on the first sheet or when incomplete; editable from any sheet; its fields count in `cabineProgress` and surface on the cabine row of the Sumário | Sally and Amelia, Story 12.3 |
| D-6 | Nameplate fields are visible from the start with the copy chips above; "Digitar" goes; the TAG field is prefilled from the block; "Outro…" focuses the combobox it opens | Sally, Story 12.4 |
| D-7 | The sheet observation is suggested from the NC items and confirmed with the conclusion text | Amelia, Story 12.4 |
| D-8 | Home "Continuar" opens the last sheet or the first empty one; "Concluir dados do relatório" goes to the Sumário; "Voltar" from a sheet goes to the Sumário with section 9 open on the row (phone keeps the tree); dates default to today; setup Etapa 4 offers "Cadastrar instrumento" | Amelia, Story 12.2 |
| D-9 | Labels are sentence case on screen and caps in the document (same string, `text-transform` in the renderer) | Sally, Story 12.5 |
| D-10 | DESIGN.md v0.9 and the v0.9 mocks land first; the app applies them in one CSS-and-components story with the real-browser pass at 390, 768, 1024 and 1280 in both themes | Sally, Story 12.5 |
| D-11 | The tap-budget test 5.1-E2E-001 is written for real, counting taps and keystrokes on J1 and J3 | Amelia, Story 12.6 |

## 5. Open for Matheus

1. **"Não ensaiado" reason preselection (J-16, OQ-6).** Sally: no preselection, primary disabled until a reason is tapped. Amelia: keep the last reason used in the relatório preselected, first seed reason never. Decide before Story 12.4.
2. **Sheet observation in the document (J-10).** With D-7 the printed "OBSERVAÇÕES" repeats the NC items; Bruno may prefer only the free text. Decide the print rule with him before Epic 7.1.
3. **The nameplate TAG field (J-09).** Prefilled from the block TAG and editable, or removed from the screen and printed from the block. Either is one line in the seed.
4. **Status on generate (J-19).** Confirm AD-22 (Em revisão on generate) or accept the current jump to Emitido.
5. **Epic order.** Epic 12 is written to run before Epic 6; the photos epic builds on the sticky bar and the sheet header that 12.5 restyles.

## 6. Method

Stack: `docker compose up -d`, `seed-users.ts --test`, company A, Chrome 768x1024 through the Playwright MCP, light theme unless stated. Relatório: "Condomínio Teste · Torre Norte" from the "Cabine primária — padrão" template (94 blocks). One instrument MG-01 registered first.

Paper baseline per seccionadora, from `addendum.md` §9: 10 nameplate fields, 14 checklist marks, 9 readings, 2 conclusion marks, instrument code, serial and certificate per test (2 tests), about 41 cells; the office then types the same cells into the Excel form and numbers the photos by hand (EXPERIENCE.md § Inspiration & Anti-patterns).

Reproducible steps per journey (taps in brackets):

- J5: Home "Novo relatório" [1]; Cliente typed, "Criar" [2]; Local typed, "Criar" [3]; "Continuar" [4]; day segment [5], eight digits; "Criar relatório" [6]; ART field [7], 13 characters; instrument checkbox [8]; "Concluir dados do relatório" [9]; "Voltar" [10]; cabine row [11]; equipment row [12].
- J1 SEC-ENEL: rail open and row (navigation, not counted); "Digitar" [1]; Identificação typed; Fabricação "Outro…" [2], combobox [3], "Criar" [4]; Nº série [5]; TAG [6]; Tipo [7]; Meio de extinção select [8, 9]; Tensão "Outro…" [10], combobox [11], "Criar" [12]; Corrente [13]; Acionamento [14, 15]; date day segment [16]; "Marcar os restantes" [17, lost] [18]; picker 1 [19, 20]; picker 2 [21, 22]; first cell [23], nine values with Enter; "Confirmar" [24]; "Concluir ficha" [25]. Reported as 24 plus 1 lost.
- J3 SEC-ENEL-2: "Igual à SEC-ENEL?" [1]; "Repetir" [2, lost] [3]; picker 1 [4, lost] [5, 6]; picker 2 [7, 8]; first cell [9], nine values; "Confirmar" [10]; "Concluir ficha" [11]. Reported as 9 plus 2 lost.
- J0: Home card title [1]; row "você parou aqui" [2].
- J4: sheet menu [1]; "Marcar não ensaiado" [2]; primary [3].
- J6: "Gerar relatório" [1]; dialog "Gerar relatório" [2]; "DOCX — abrir no Word" [3].

Screens captured for the aesthetics pass: Home, Sumário and the SEC-ENEL sheet at 390x844, 768x1024, 1024x768 and 1280x800, light and dark (`A-*`); the prototype at tablet, phone and desktop for the sheet, the Sumário, Home and setup (`M-*`).

## Answers from Matheus (2026-09-24, later the same day)

- Não ensaiado: three standard reasons plus a fourth free text. Recorded in Story 12.4 and `source-deltas.md` (third reason "Equipamento inacessível", nothing preselected).
- Epic 12 runs before Epic 6: confirmed.
- The nameplate TAG field, the printed observation and the status on generate: later, not blocking Epic 12. Story 12.3 keeps the proposed prefilled, editable TAG.
