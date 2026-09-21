# Review — MVP-scope lens: is the drawn UX the simplest way to ship?

**Date:** 2026-09-19 · **Reviewer:** Sally (UX) · **Spines:** v0.6.0 · **Against:** `docs/context/FO.SERV-03 Laudo Técnico de Cabine Primária.docx`, PRD §7.3 (two-week slice, 2026-10-03), and the reference tool videos in `docs/media/`.

This lens is not covered by the four existing reviews. `review-rubric.md` asks whether the spine pair is internally sound, `review-accessibility.md` and `review-adversarial-usability.md` ask whether the design serves the engineer, `review-architecture.md` asks whether an architect can build it. None of them asks the question the builder has to answer on 3 October: **is the drawn UX the smallest thing that proves the product?**

## Method

- Parsed the reference report structurally (720 paragraphs, 50 tables, 184 embedded images) rather than reading the prose, to measure what actually varies between reports.
- Counted the drawn surface: 17 IA surfaces, 66 component patterns, 6.296 lines of prototype, 6.056 lines of static mocks.
- Extracted 68 frames at 1 fps from the two reference-tool videos Bruno forwarded, and read the two voice notes.
- Cross-read PRD §7.1 (full scope), §7.2 (out) and §7.3 (the slice), so nothing here re-litigates a cut already made.

## Verdict

**The UX is right and the scope is not yet sliced to match it.** The design is unusually well-reasoned — the capture-order / print-order split alone is worth the whole exercise — but the mock set draws the product of §7.1 while the build has to deliver §7.3, and nothing on the mocks says which is which. That gap costs the first days of a two-week build.

Three things need a decision before code starts. One is a correctness gap against the reference report that would fail the only acceptance test that matters (**S1**). One is a surface that is in the slice and buys nothing for the first job (**S3**). One is bookkeeping that is nearly free and saves the builder from guessing (**S2**).

Everything else below is smaller.

## Status (2026-09-19, decided with Matheus)

| # | Decision | State |
| --- | --- | --- |
| S1 | Apply | **Done.** Spine rule written, two prototype tables relabelled, Flow 2 step 7 corrected, post-MVP question opened. |
| S2 | Apply — **mark, never remove**: the mocks must stay the complete product and *show* what enters the MVP | **Done.** 66 elements marked, toggle in the prototype bar, legend on the index, MOCK-GUIDE section. |
| S3 | **Rejected — the Template composer stays in the MVP.** | Recorded below; no change made. |
| S4 | Reformulate (explained in conversation) | No spine change; the recommendation stands as written for when FR-36 returns. |
| S5 | Devil's advocate — **original proposal defeated**, replaced by a better one | **Done.** The duplication was real but the cut was wrong: the answer was to delete the *hero*, not the card's button. **Continue card removed as a component**; the relatório *Em campo* on this device sorts first and carries `is-current`. 66 components → 65. |
| S6 | Devil's advocate — **original proposal defeated**, replaced by a better one | **Done.** Cutting "Ordem de campo" was wrong: it is the renderer's base case and the safety net for an assumption the spine flags as unconfirmed. Kept as code, **removed as a user-facing choice**; the "Opções" disclosure is gone. |
| S7, S8 | Apply | **Done.** Position box on the Block card; summary promoted to the Relatório overview header and the open question closed as yes. |

## What the 125 pages actually contain

Measured, not estimated. The 184 embedded images resolve exactly: 82 in section 7, 95 in section 9, 6 in section 11, 1 signature.

| Part | Pages (approx.) | What varies between reports |
| --- | --- | --- |
| 1 Objetivo, 2 Definições, 3 Limite de escopo, 4 Requisitos, 5 Recomendações, 6 Verificações e ensaios | ~6 | The client name in §1 and the exclusions list in §3. Nothing else. |
| 7 Registro fotográfico | ~41 | 82 photos in a 2-up grid, each with one caption following a single grammar: "Detalhe d{o/a} {atividade} realizad{o/a} n{o/a} {equipamento} d{o/a} {local}". About 10 activities, 8 locations. |
| 8 Pontos de atenção | 1 | Five free-text bullets. |
| 9 Relatórios dos ensaios | ~60 | 94 sheets from 8 models — **pasted as images of spreadsheet printouts**, in 11 subsections. |
| 10 Conclusão | 1 | Three boilerplate bullets, the signature block, the ART line. |
| 11 Certificados | ~6 | Six instrument calibration certificates, as images. |

**The whole variable content of a 125-page document is: eight cover fields, 94 sheets, 82 captions, five bullets and a verdict.** That is a very tractable generation problem, and it is the right thing to build first — which PRD §7.3 already says.

Two defects in the delivered instance are worth keeping in front of Bruno, because they are free wins the app makes structurally impossible:

- **Photo numbering is manual and wrong.** The last three photo tables repeat "Imagem 75" and "Imagem 76" — six photos share three numbers.
- **Section 9 is images.** Every test table is a picture of a spreadsheet, which is why photos cannot sit next to their equipment and why values are not searchable. Native tables fix the complaint the brief opens with.

## What the reference tool actually is

New evidence, from the 68 frames. Bruno's framing in the voice note: a developer in his engineers' WhatsApp group built it and is selling it to the group; *"já tem uma meia dúzia de gente que veio do grupo"* — about six paying users. (The second note's last clause transcribes as *"isso fragiliza muito o processo em campo"*, which is likely *"agiliza"*; do not lean on it either way without asking him.)

**The tool is "Estudo de Carga e Demanda" by RAAD Engenharia — a single-page, browser-only document composer.** Measured from the frames:

- **One page, no navigation.** The entire report is one scroll. No login, no home, no projects, no tree, no sheet screen, no offline, no sync, no backend. "Salvar projeto" and "Salvar HTML" write local files; XLSX is parsed in the browser with SheetJS.
- **The table of contents is the structure editor.** Each row of the SUMÁRIO carries four actions — open, up, down, delete — and numbering (11.1, 12, 12.1 … 14) is automatic. One control does what fasor splits across the Relatório tree, the Template composer and the export TOC.
- **Reorder by typed number, not by drag.** "Sequência editável: altere o número ou arraste cada memória."
- **A live summary card** at the top: "6 Memórias · 6.127 Registros · 43 Gráficos".
- **Data arrives as a file**, not from the field. There is no capture step at all. The engineer shows up with the meter's mass memory and maps its columns.
- **Generated narrative with its criterion printed under it** — already adopted as the Criteria line (D5).
- **The output** (second video) is a branded PDF for a *different* company, MEGA INSTALAÇÕES — so the tool is multi-tenant by logo swap. Its photo record is **one photo per page** with a burned-in date/GPS stamp and a near-empty per-photo table (`Item | Valor | Un. | Status | Obs.`).

**What this changes in the analysis.** It is not a competitor — it is a different report type, desktop, file-fed. But it is the closest available evidence about what a solo developer can ship into this exact market and get paid for, and the answer is: *a one-page document composer with a generator, and none of the hard parts.* No offline, no sync, no mobile, no AI, no tree.

That does **not** mean fasor should drop offline capture. Bruno's pain is the field, the paper and the re-typing; the reference tool would not touch any of it. But it sharpens where the risk lives: **what people pay for is the generated document.** The capture UI is how fasor earns the right to generate a better one.

Two things are worth borrowing (S7, S8 below) and one is worth deliberately not borrowing: the per-photo table is nearly empty in the real output, which confirms the spine's existing rejection of it. The 1-photo-per-page layout is also worse than FO.SERV-03's 2-up grid; keep the grid.

## Findings

### S1 — critical · The app has no input for four of the insulation test's five value columns

**Location:** `mockups/prototype/screens/60-ficha.html` (8 measurement tables, all `Linha | Terra | Guard | Valor`); `mockups/key-equipment-sheet.html` (3 tables, same); EXPERIENCE.md § Capture-to-Document › "Print spec for section 9".

**What the form has.** `imports/extract-fo-serv-03.md` Bloco C — *common to all eight models* — specifies a two-level header: `PONTO DE ENSAIO/CONEXÃO {LINHA, TERRA, GUARD}` · `VALORES {30 SEGUNDOS, 1 MINUTO, ESTAB./10MIN}` · `QUALIDADE ISOLAÇÃO {ABSORÇÃO, POLARIZAÇÃO}`. The open/closed-contact variant on the seccionadora and disjuntor sheets does use a single VALORES column — so those two mocks are correct — but the plain insulation test on **cabos, para-raio, TP, TC and transformador** carries the full 3+2 grid.

**What the app draws.** One column, labelled "Valor". Nothing anywhere in the mock set or the prototype contains "30 segundos", "Estab.", "Absorção" or "Polarização", and nothing recorded which of the three timed readings "Valor" was.

**Precise count** (an earlier draft of this review overstated it; corrected after mapping every table to its sheet variant). The prototype holds nine measurement tables. Seven are right: three contato aberto / fechado on the seccionadora, three on the disjuntor, and one resistência ôhmica de contato — all of which genuinely have a single VALORES column in the form. `key-equipment-sheet.html` is a seccionadora sheet, so its three tables are right too. **Two are wrong:** the plain *Ensaio de isolação* on the cabos sheet (`#ficha-tcb`) and on the TP sheet (`#ficha-ttp1`), which carry Bloco C. The para-raio, TC and transformador sheets are not drawn in the prototype and would have inherited the same shape.

**Why it is critical.** The slice's stated test is *"a document Bruno reads and recognizes as his"*, and SM-5 is *"accepted with only minor edits, no restructuring"*. A five-column table printed as a one-column table is restructuring, on the section that is 60 of the 125 pages. It is also an internal contradiction the spine already half-knows: Flow 2 step 7 narrates *"the 10-minute cell reads 3,7 MΩ"* against a UI that has no 10-minute cell.

**Fix for the slice (cheap and faithful).** Print the grid as the form has it, put the captured value in `1 MINUTO`, print "-" in the other four. This reproduces the delivered instance *exactly* — in FO.SERV-03 all five columns are "-" except 1 MINUTO. Relabel the app's column "1 minuto" so nobody has to guess. Cost: one label and a generator rule.

**Fix after the slice (a real win, worth naming to Bruno now).** Capture 30 s and 10 min as two more cells per row, and let the app compute the two indices it already has the inputs for — absorção = R₁ₘᵢₙ/R₃₀ₛ, polarização = R₁₀ₘᵢₙ/R₁ₘᵢₙ. Those columns have been printed empty on every sheet of every report because the arithmetic is manual. Making a dead part of Bruno's own form come alive costs two cells and a division, and it is the kind of thing that answers *"a gente quer fazer um negócio mais top"* better than another AI assist would.

### S2 — high · The mocks draw §7.1; the build needs §7.3, and nothing says which

**Location:** all 17 surfaces; `mockups/MOCK-GUIDE.md`; EXPERIENCE.md § Information Architecture.

PRD §7.3 defers eleven things that the mock set draws as if they ship. A builder opening the prototype on 3 October sees no difference between them and the rest:

| Drawn in the mocks | PRD §7.3 status |
| --- | --- |
| "Ler visor" / Read display button, on every measurement table | waits (FR-36, first in the queue back) |
| Dictation button — observations, ambiente, generated-text row | waits (FR-40) |
| Vision captions and "12 legendas sugeridas — Confirmar todas" | waits (FR-39); context captions still ship |
| "Fotografar equipamento" as the first row of the field palette | waits (FR-38); the type list still creates the block |
| NC observation draft from the row's photo | waits (FR-75) |
| Conflict view, `86-sync-conflito.html`, sub-block merge | waits (FR-58, FR-59) |
| Full Sync status surface, `85-sync.html` | waits (FR-60); draft recovery (FR-61) ships |
| PDF alongside DOCX, in the revisions list | waits; DOCX only |
| "Salvar como template" in the overview overflow | waits (FR-14) |
| "Mover para…" between locations | waits (FR-20) |
| Rich text editor in the composer; photo location switch in Account | waits (FR-12, FR-8) |

**Fix.** Mark it once, on the mocks themselves — a `data-slice="out"` attribute plus a muted visual state, and one column in `MOCK-GUIDE.md`. An hour of work that stops the build from either implementing eleven deferred things or stopping to cross-reference the PRD on each one. This is the single highest ratio of value to effort in this review.

### S3 — high · The Template composer is in the slice and buys nothing for the first job

**Location:** `mockups/key-template-composer.html`, `mockups/prototype/screens/42-template-composer.html` (420 lines, the most complex interaction in the product); PRD §7.3 ships FR-9, FR-10, FR-11, FR-13.

The composer is a form builder: a location skeleton of 6 cabines and 26 columns, per-column quantity steppers across 8 equipment types, sub-block on/off toggles, subtype defaults that pre-mark checklist rows, and per-type checklist previews. It is the hardest screen to build and the hardest to get right.

**It is not in the loop the slice exists to close.** The slice's own test is compose → fill → generate, and Bruno has exactly one template: FO.SERV-03 with the Porto Seguro skeleton. PRD §7.3 already concedes the seed data is *"a day's careful transcription"* and *"the most likely thing to be underestimated"* — so the skeleton is being authored as content regardless. Once it is seeded, the composer's job on 3 October is to let Bruno build a template he already has.

**What actually covers the gap.** FR-15 to FR-19 and FR-21 already ship, and they are the same capability one level down: add a cabine, add a coluna, add and remove blocks, reorder, all inside a relatório. If the next job is not Porto Seguro, Bruno instantiates the seeded template and edits the tree — which is the field-and-office path the product needs anyway. The composer becomes the second-customer feature it really is, alongside FR-14, which is already deferred.

**What the cut buys.** Enough, plausibly, to pull back one of: multi-device merge (the September job was worked by two people — PRD calls this deferral *"a real operational constraint, not a free cut"*), or the PDF renderer, or S1's extra two cells. My preference is multi-device, because two executors is the documented reality of the job and the workaround is operational.

**Decided 2026-09-19: rejected. The composer stays in the MVP.** Matheus's call, after the argument above was put. The recommendation is left standing as written so the trade is on the record and can be revisited if the two weeks run short — if something has to give in the first week, this is the first place to look, and FR-9 / FR-10 / FR-11 can be dropped without touching anything else in the slice.

**Risk that the decision accepts.** Cutting it would have meant that on 3 October there is no way to create a *new* template from scratch in the UI. If Bruno's next job has a materially different substation and he wants to save its shape for reuse, he cannot — until FR-14 or FR-9 lands. That is a real limitation and Bruno should be told it, not discover it.

### S4 — medium · Display OCR is dead exactly where the engineer stands

**Location:** EXPERIENCE.md § Smart Input › Measurement readings; Flow 2 steps 3 and 7; PRD FR-36 (first in the queue back).

This is already deferred, so it is not a slice finding — it is a warning about the shape it should come back in. `review-adversarial-usability.md` B2 flags that verification moves to a desk; the consequence runs deeper than verification.

The engineer is in a basement with no signal. He photographs the megôhmetro; the value arrives at the gate, or on Monday. So while he is standing at the equipment he **cannot see the reading**, cannot judge it against the 400 MΩ criterion, cannot conclude the sheet, and cannot decide to investigate, re-test or photograph more. Deferred readings recreate in miniature the exact pain the brief opens with — work written up later from notes.

The arithmetic also makes the headline metric unreachable without it: a seccionadora has nine measured values, and typing each with a unit suffix ("147G") is about four keystrokes, so ~36 keystrokes against a ≤ 15 budget. PRD §7.3 states SM-3 will miss in the slice; what is worth adding is that **the budget is a claim about connectivity, not about typing**, and it should be restated that way rather than quietly missed.

**When FR-36 returns, invert the default.** Typed value as the primary path, with the display photo captured anyway as the audit crop — not camera-first with the value deferred. Typing works in a basement; the camera is one tap but its answer is not. Bruno wears leather gloves, so keep the numeric keypad large and the unit a tap-cycle, which the spine already specifies.

**One question worth putting to Matheus, flagged because it contradicts a recorded decision.** The memlog fixes *all* AI processing in the backend. A seven-segment display is not an LLM problem — it is classical computer vision or a tiny on-device model, and it would make the single most valuable assist work in the cubicle where it is needed. Whether that exception is worth opening is Matheus's call, not a UX one; it is recorded here because the offline gap above is otherwise permanent.

### S5 — medium · Home offers the same action twice, 700 px apart

**Location:** `mockups/key-home.html`, `prototype/screens/20-home.html`.

The Continue card hero reads "Continuar: SEC-C05 · 42 de 94 · Ver árvore". The first Relatório card below repeats "Continuar: SEC-C05 · 42 de 94 · Ver árvore" verbatim. Same target, same label, same two links.

The hero was adopted as E1 in the adversarial review; the card's button predates it and was never removed.

**Devil's advocate, run 2026-09-19 at Matheus's request — and it defeated the proposal above.** Three arguments hold against removing the card's button. The two controls are not in the same context: the hero is "the relatório on this device", the card is "this relatório in the list", and stripping the button from the matching card alone makes the list inconsistent while stripping it from all of them costs a navigation to resume any other relatório. Repeating a primary action on a long page is reachability, not redundancy — on a phone the hero has scrolled away before the first card is visible. And the simplicity mandate is about taps, not pixels: removing the button removes no tap and may add one.

**What the exercise produced instead, and what was applied.** The problem is not the card's button — it is that the hero exists at all. The Relatório card already carries everything the hero carried: name, dates, status, progress, sync, "Continuar", "Ver árvore". So the **Continue card was deleted as a component**, and the relatório *Em campo* on this device sorts first in the list and carries a new `is-current` state (2px `primary` border, title in `primary`). E1 is still satisfied — open the app in the field and the resume button is on screen without scrolling — with one component instead of two, a consistent list, and no duplication. Component inventory 66 → 65; the `continue-card` token block and CSS are gone.

### S6 — medium · The second section 9 ordering scheme is free optionality

**Location:** EXPERIENCE.md § Capture-to-Document › "Section 9 default scheme"; `mockups/key-export.html` › Opções; PRD FR-70 (in the slice).

Two schemes ship: "Por local e tipo (padrão FO.SERV-03)" and "Ordem de campo". FO.SERV-03 has exactly one order, and the per-cabine *Agrupar por tipo* flag already reproduces it faithfully — including the fact that the real document mixes both patterns (9.1, 9.6–9.8 by location; 9.2–9.5, 9.9–9.11 by type). "Ordem de campo" is a preference nobody has asked for, and it is a second rendering path through the most correctness-sensitive part of the generator.

**Devil's advocate, run 2026-09-19 — and it defeated the proposal, on a technical point I had missed.** "Ordem de campo" is not a second code path. It is the *base case*: walk the tree, one subsection per cabine, sheets in tree order. "Por local e tipo" is built on top of it. Cutting it saves a radio button, not an algorithm — and it removes the safety net from exactly the place the risk is concentrated. The grouping rests on an assumption this spine flags as unconfirmed (where para-raios and cabos de entrada/saída print inside a grouped cabine). If that is wrong on the first real job, the base case still produces a usable document; without it there is no output at all until the grouping is fixed. The Open Question does not disappear either — it inverts: the real question was never whether "Ordem de campo" counts as restructuring, but whether "Por local e tipo" reproduces 9.1–9.11 correctly.

**What was applied instead.** Keep the renderer, cut the **user-facing choice**. Section 9 always prints in the FO.SERV-03 grouping and the Export surface states it as a fact in one line rather than offering it as an option; the collapsed "Opções" disclosure, its radio group and the per-revision storage of the choice are gone. The base case stays reachable behind the UI as the fallback. What is saved is a decision the user never needed to make; what is kept is the hedge.

### S7 — low · Borrow: reorder by typed position, not only by drag

**Location:** Relatório tree; Block card; Template composer.

The reference tool pairs a drag handle with an editable sequence number — "altere o número ou arraste". With 94 blocks on a tablet, dragging a block from position 80 to position 12 is a scroll-and-hold marathon; typing "12" is two keystrokes. The spine currently offers drag plus "Subir · Descer" in the overflow, which is fine for one-step moves and poor for long ones.

Low cost, and it removes a genuine field frustration. Worth folding into FR-19 rather than deferring with FR-20.

### S8 — low · Close an open question: yes to a relatório-level summary

**Location:** EXPERIENCE.md § Open Questions — *"A relatório-level always-visible summary in the Relatório overview header (fichas concluídas / NC / não ensaiadas) — not decided"*.

The reference tool answers it with a live card: "6 Memórias · 6.127 Registros · 43 Gráficos", always at the top. GroundPRO does the same with its result chips. Bruno has now seen both. The Relatório overview footer already computes most of it ("3 de 94 fichas concluídas · 1 não ensaiado · 12 legendas sugeridas"); promote it to the header where it is visible without scrolling 94 rows.

Decide it as yes and take it off the question list.

## What not to change

Stated explicitly, because a scope review that only subtracts is a bad review.

- **The capture-order / print-order split** (§ Capture-to-Document) is the best idea in the design. Filling by location means walking each column once instead of three times; printing by the FO.SERV-03 grouping means Bruno recognizes the document. Do not let a simplification collapse these into one order.
- **The per-cabine *Agrupar por tipo* flag** reproduces the real document's mixed grouping with one boolean. Exactly the right amount of mechanism.
- **Automatic photo numbering with tokens resolved at generation**, so section 8 references never go stale. It fixes a bug that is live in the delivered report.
- **"Marcar os restantes como Conforme"** — about 1.200 checklist rows across a job, collapsed to one tap per sheet, with NC and NA untouched and an undo.
- **Nameplate copy across sheets and visits** ("Igual à SEC-ENT?", "Copiar da última visita"). Pure local logic, no AI, and it is the largest typing saving in the product after the checklist.
- **One blocking item at export.** Everything else warns. Correct — a report that will not generate because a caption is missing is a report written in Word instead.
- **Restoring the transformer conclusion block**, absent from all eight transformer sheets in the delivered report.
- **Native test tables instead of pasted images.** This is the structural fix the whole product is for.

## Recommended slice delta

Against PRD §7.3, not against §7.1. Net effect: one screen and one rendering path out, one correctness fix and two small borrows in.

| Change | Direction | Rationale |
| --- | --- | --- |
| Isolation tables print the 3+2 grid; captured column labelled "1 minuto"; other four print "-" | **in** (S1) | Faithfulness on 60 of 125 pages; the only acceptance test that matters |
| Mark deferred affordances on the mocks (`data-slice="out"` + MOCK-GUIDE column) | **in** (S2) | Stops the build implementing eleven deferred things |
| ~~Template composer (FR-9, FR-10, FR-11)~~ | **stays in** — decided 2026-09-19 | Rejected; see S3. First place to look if the two weeks run short |
| Section 9 order **choice** (not the renderer) | **out** (S6, revised) | The base case stays as the safety net; only the option goes |
| Continue card component (the hero) | **out** (S5, revised) | The card already is the hero; 66 components → 65 |
| Reorder by typed position (fold into FR-19) | **in** (S7) | Two keystrokes instead of a drag across 94 rows |
| Relatório summary promoted to the overview header | **in** (S8) | Closes an open question the evidence already answers |
| Multi-device merge (FR-58, FR-59) | ~~candidate to pull back~~ | The composer cut would have paid for it; with S3 rejected there is nothing to pay with |
| 30 s and 10 min cells + computed absorção / polarização | **post-slice, name it now** | Revives a dead part of Bruno's own form for two cells and a division |

## Questions for Bruno

Revised 2026-09-21 after the decisions above. The old question 3 (templates) was dropped: it only mattered if the Template composer left the slice, and S3 was rejected. It is replaced by a question that tests S4. Written in Portuguese, for Bruno, ready to send; no UX vocabulary.

1. **Ensaio de isolação.** Hoje vocês medem só em 1 minuto, e o relatório sai com 30 segundos, 10 minutos, absorção e polarização em branco ("-"). Querem continuar assim, ou passar a medir também em 30 s e 10 min para o sistema calcular absorção e polarização sozinho? A segunda opção deixa cada ensaio mais longo em campo. (S1)
2. **Um tablet por relatório no primeiro trabalho.** Na primeira versão, só um aparelho preenche as fichas de um relatório; o Eduardo conseguiria mandar fotos, mas não preencher fichas ao mesmo tempo. Isso funciona para vocês, ou os dois precisam preencher fichas em paralelo desde o início? (multi-device deferral, PRD §7.3)
3. **O valor na hora do ensaio.** Quando você lê o megôhmetro e o valor sai baixo ou estranho, você decide ali mesmo, na frente do equipamento, se limpa e mede de novo? Ou só olha os valores depois? (S4: if he decides on the spot, the typed value must be the primary path and the display photo only the evidence)
4. **A ferramenta da RAAD.** O que chamou sua atenção nela: o relatório que ela gera, as seções numeradas que dá para editar, ou o fato de rodar em qualquer computador sem instalar nada? (decides how much of the office side should look like one scrolling document)

### Answers (Matheus, 2026-09-21)

| # | Answer | Applied |
| --- | --- | --- |
| 1 | "Deixe o sistema o mais simples possível pro usuário; a necessidade é reduzir retrabalho." | **1 minuto only, not planned to grow.** The four columns keep printing "-". The post-MVP question is closed. |
| 2 | "Não precisa ser em paralelo, e o app precisa aceitar pós-edição, colocar imagens após ou durante." | **One device per relatório** (multi-device merge stays deferred — no longer a gap). **Nothing is locked to the field**: every sheet, reading, photo, caption and point stays editable after the visit, from any computer. **"Adicionar fotos" promoted** from a hidden link to a visible button on every sheet and in the gallery, drag-and-drop on a computer, and a gallery batch asks **"De qual equipamento?"** once so imported photos get context captions without typing. A second person's photos come in by import. Flow 4 gets an MVP path. |
| 3 | "O engenheiro decide." | **S4 confirmed and written into the spine.** Typing is the primary path for readings; "Ler visor", when it returns, fills instantly with signal and, without signal, only **checks** the typed value against the queued photo, never overwrites it. Interaction budget restated as a connectivity claim (≤ 20 taps / ≤ 15 keystrokes with signal; ~36 keystrokes offline). Flow 2 steps 3, 7 and the count rewritten. |
| 4 | "Rodar em qualquer computador e como ela está estruturada pro usuário." | "Any computer" is already true and now stated in the Foundation (web page, nothing to install on the office side). **The structure answer is a proposal, not yet applied** — see the conversation of 2026-09-21: the Relatório overview becomes the report's own sumário, numbered in document order. |

### Structure and isolation — decided in the party review (2026-09-21), applied in v0.8.0

- **Structure:** the Relatório overview is now the **Sumário** — the report's own table of contents in FO.SERV-03 order, each row showing what is missing (one shared pre-issue check) and each row an editable object (Overflow menu; the section number is the Position box). Section 9 keeps the location tree, unnumbered. Behavior follows the relatório status. The footer buttons and the "Dados do relatório" link are gone.
- **Review:** "Pré-visualizar" runs the same generator with a RASCUNHO watermark and no revision number. "Revisar em sequência" is post-MVP, with Sally's dissent on record.
- **Rail inside a sheet:** cabines and fichas only.
- **Isolation, after research:** one grid per sheet, 1 minuto only, one continuous typing run across the sheet's tables. The app computes no index — Fasor's Instrum DMG10Ki already computes IP and IA — and an optional template toggle "IA e IP lidos do visor" stays off for Fasor. Bluetooth import is the long-term format, out of the MVP.

## Notes

- This review does not change the spines. Every finding is a proposal; nothing was applied.
- Frames: 68 extracted at 1 fps from `docs/media/`, contact sheets and full-resolution stills in the session scratchpad. The seven curated frames already in `docs/concorrentes/frames-reference-tool/` remain the canonical set; nothing in the dense pass contradicted them, and the new material is the interaction model (single page, TOC-as-structure, reorder by number, live summary card) rather than the output features already captured as D1–D8.
