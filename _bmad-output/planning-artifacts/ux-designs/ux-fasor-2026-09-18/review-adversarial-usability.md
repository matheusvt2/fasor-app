# Review — Adversarial lens · usabilidade em campo e "digitar o menos possível"

> **Nota de 2026-09-19.** Depois desta revisão o produto trocou "laudo" por "relatório" (decisão registrada no `.memlog.md` e no addendum do brief). Os mocks citados abaixo mudaram de nome: `key-laudo-overview.html` → `key-relatorio-overview.html`, `key-laudo-setup.html` → `key-relatorio-setup.html`. O texto desta revisão é mantido como estava na data.

- **Scope:** EXPERIENCE.md v0.4.0, DESIGN.md v0.4.0, mocks key-equipment-sheet / key-sheet-states / key-photos / key-laudo-overview / key-home / key-export / key-sync-status; context .memlog.md (entries 49–50) and imports/extract-fo-serv-03.md §6.
- **Stance (user mandate, memlog 49):** the engineer must type as little as possible; phone/tablet usability is key; OCR and LLM image understanding are to be pushed to the centre of the flow, not kept "last in the queue".
- **Baseline counted from the design as drawn (seccionadora SEC-C05, phone 390):** nameplate 9 fields ≈ 80–90 keystrokes + 15 taps when typed; checklist 14 taps minimum over ~2.5 screens of scroll; 9 readings ≈ 35 keystrokes + 9 unit checks; conclusion 2 taps; one photo ≈ 6 taps; conclude + next 2 taps. Per job (94 sheets, extraction §3): ≈ 1.100 checklist taps, ≈ 1.100 typed readings, ≈ 800 nameplate fields, 82 captions.
- **Shape:** lens = adversarial; no severity, no ranking; grouped by screen; each finding = location · trigger · guard (the simpler/smarter alternative) · consequence.
- **Count:** 31 findings.

---

## A. Equipment sheet — `mockups/key-equipment-sheet.html` · EXPERIENCE § Component Patterns › Sheet

### A1 — Nameplate is typed by default; the camera path is offline-dead where the plate is
- **location:** EXPERIENCE § Nameplate extraction ("Requires a connection"); Flow 2b steps 1–2; mock frame 1 "Dados de placa"
- **trigger_condition:** The design's own Foundation assumes zero signal in the substation, so "Ler placa da foto" never returns a suggestion while the engineer is in front of the plate; Flow 2b has him type anyway. Copy-from-previous-visit by TAG is only an [ASSUMPTION].
- **guard_snippet:** Make the camera the *primary* affordance of an empty nameplate group (a full-width "Fotografar placa" tile; "Digitar" secondary). Two-stage reading: on-device OCR (browser/WebGPU text recognition) gives an immediate amber first pass in the cubicle; the cloud LLM pass only refines when signal returns. Promote "Copiar da última visita (TAG)" and "Igual à SEC-C04?" (same type/model in this laudo) to first-class one-tap actions above the fields.
- **potential_consequence:** ≈ 800 nameplate fields per job stay hand-typed on a phone keyboard in the dark; the AI feature exists on paper and is used on Monday by someone who is no longer in front of the equipment.

### A2 — Every measurement is typed digit by digit while holding test leads
- **location:** EXPERIENCE § Measurement field / Measurement table; mock frames 1–2 "Ensaio de isolação", "Resistência ôhmica de contato"
- **trigger_condition:** ≈ 1.100 readings per job entered on a decimal keypad; no camera or voice path for instrument displays although the megôhmetro/microhmímetro/TTR all have a digital display.
- **guard_snippet:** "Ler visor" button per test table (and a camera glyph inside each Measurement field): photo of the display → value + unit suggested in amber with the display crop kept beside the field as evidence; one tap confirms and Enter moves down. Add dictation ("Fase A, cento e quarenta e sete giga") as the second hands-busy path. Both reuse the "Sugerido / Confirmar" pattern already specified.
- **potential_consequence:** The most error-prone, highest-volume typing in the whole job is untouched by the mandate; transcription errors (330 ↔ 3300, wrong unit) remain exactly as on paper.

### A3 — Unit slot is an extra tap per reading and the historic error source
- **location:** EXPERIENCE § Measurement field ("changing scale is the way to enter large values"); DESIGN › Measurement field (unit control); extraction §6.5 ("2T" typed into a GΩ column)
- **trigger_condition:** A 48px mini-combobox inside each field; the engineer must notice that Fase C is in MΩ while A/B are in GΩ (the mock shows exactly this mix).
- **guard_snippet:** Auto-scale: accept suffix typing "147G", "3.7T", "330M" (a suffix row above the keypad), default the unit to the previous reading in the same table, and read the unit off the display in A2. Show a soft warning when one row's magnitude differs from the others ("Fase C está 1000× abaixo de A e B").
- **potential_consequence:** Wrong-unit readings print into the laudo with a correct-looking value; the app reproduces the defect it was meant to fix.

### A4 — Checklist: 14–15 taps and 2+ screens of scroll to say "everything is fine"
- **location:** EXPERIENCE § Checklist row / Tri-state control; mock frame 2 (phone: control drops below the name → ~100px per row)
- **trigger_condition:** No bulk action; the overwhelmingly common case (all C, a few NA by subtype) costs the same as the rare case. Across the job ≈ 1.100 taps on 56px segments at the screen edge.
- **guard_snippet:** "Marcar os restantes como Conforme" at the head of the checklist and in the sticky bar while the checklist is on screen; the engineer then only touches NC/NA rows. Add "Repetir da ficha anterior do mesmo tipo" (copies C/NC/NA pattern, not observations). Longer term: a vision pass over the sheet's photos proposes NC candidates as amber suggestions.
- **potential_consequence:** The checklist becomes the dominant tap cost of the job; engineers develop the "tap C down the column without looking" habit the tri-state was designed to prevent.

### A5 — NC observation is mandatory free text typed in the dark
- **location:** EXPERIENCE § Observation field ("Obrigatória em item não conforme"); mock frame 1, item 8 expansion
- **trigger_condition:** Only three generic chips exist ("Chuva e umidade elevada", "Plaquetas", "Diagrama unifilar"); the required NC text has to be typed on a phone keyboard.
- **guard_snippet:** Dictation button on every Observation field. Chips per checklist item (item 8 Contatos → "sinais de aquecimento", "oxidação", "desgaste"). When a photo is attached to the NC row, LLM vision drafts the sentence as an amber suggestion (the mock's own placeholder "contatos fixos com sinais de aquecimento" is what vision would return).
- **potential_consequence:** Observations degrade to "ver foto" or are postponed to the office, where the context is gone — the memory-fade pain the brief opens with.

### A6 — Sheet is 5–7 phone screens long; the next required field is never under the thumb
- **location:** DESIGN § Layout ("single-column at every width"); mock frame 2
- **trigger_condition:** Nameplate (9–12 fields) + legend + 14–15 rows + 2–3 stacked-card tables + observations + conclusion + photos. "3 obrigatórios faltando" tells the count but not where.
- **guard_snippet:** Section stepper in the sticky bar ("Placa 2 · Verif. 0 · Ensaios 1 · Conclusão 1") that scrolls to the section; collapse sections once complete; "Concluir ficha" with missing items jumps to the first one.
- **potential_consequence:** Two-handed scroll-and-hunt on every sheet; abandoned "Concluir" taps; sheets left "Em preenchimento" until the office.

### A7 — Repeated hint text competes with the data on all 94 sheets
- **location:** mock frame 1 (legend line, "aceitável na ficha", "Recomendada para não conforme", instrument serial/RBC lines, "Obrigatório" hint); EXPERIENCE § Voice and Tone
- **trigger_condition:** Every sheet carries the same 6–8 explanatory lines; in a dark cubicle they are noise between the row and its control.
- **guard_snippet:** Show the legend once per session (or on the first sheet) and behind a tap-to-reveal afterwards; move criterion source and instrument details behind the picker's chevron; keep only the missing-count and the amber helper.
- **potential_consequence:** Lower scan speed and more mis-taps on the wrong row; the "sheet, not a chat" tone becomes a wall of meta.

### A8 — Instrument details repeated under every picker
- **location:** EXPERIENCE § Instrument picker; DESIGN › Instrument picker (second line: manufacturer · type · serial · RBC)
- **trigger_condition:** "Megôhmetro digital DMG10Ki Instrum · série IN919021-25945 · RBC 37428/26 · válida até 28/08/2027" is rendered 2–3× per sheet, 94×; the field engineer needs the code only.
- **guard_snippet:** Code + short name in the field; details only in Registries and in the print; the amber "vencida" line stays.
- **potential_consequence:** Visual load on the most-used surface; the picker looks like a form field the engineer must check rather than a memory.

### A9 — Conclusion asks the engineer to reason what the app already knows
- **location:** EXPERIENCE § Conclusion control; mock frame 1 "Conclusão"
- **trigger_condition:** Two radiogroups, empty by default, on every sheet; the app has all NC rows and all out-of-limit values but proposes nothing.
- **guard_snippet:** Amber suggestion under the control, one tap to apply: all C + all values within limit → "Aprovado · Sem restrições?"; any NC or out-of-limit → "Aprovado · Com restrições?"; Reprovado never suggested. This keeps "suggestions are never writes".
- **potential_consequence:** 2 taps × 94 sheets plus a mental check that the app is better at; inconsistencies between NC rows and "Sem restrições" persist despite the warning.

### A10 — Photo from a sheet is a six-tap detour
- **location:** EXPERIENCE § Photo capture sheet / Caption composer; mock key-photos frames 2–3
- **trigger_condition:** Adicionar foto → bottom sheet → Tirar foto → shutter → Caption composer → Atividade combobox → Salvar legenda. 82 photos per job.
- **guard_snippet:** Camera glyph in the sticky bar opens the device camera directly (capture attribute); on return the caption is generated silently from context (sheet → equipment + local; section on screen → atividade: an NC row → "verificação de ⟨item⟩", a test table → that test) and shown as a thumbnail with the caption beneath; "Legendar" only on tap. "Escolher da galeria" via long-press or a secondary link.
- **potential_consequence:** Photos get taken with the phone's native camera instead and attached later without captions — the pre-issue list fills with "sem legenda".

### A11 — Environment values typed per cabine
- **location:** EXPERIENCE § Block Model › Location; key-sheet-states frame (c) "Ambiente de ensaio"
- **trigger_condition:** Temperature, humidity and altitude are typed on the first sheet of each cabine; altitude never changes on a site; temperature/humidity are read off a thermo-hygrometer display.
- **guard_snippet:** Altitude prefilled from device geolocation at laudo setup ("<1000 m" default confirmed once per site); temperature/humidity: "Copiar da cabine anterior" chip + "Ler visor" OCR of the thermo-hygrometer; when humidity > threshold, auto-offer the rain/humidity quick observation (the visit-level climate flag already listed in Open Questions).
- **potential_consequence:** Small but repeated typing on the one sheet that already carries the most extra fields (SE characteristics + environment + 5 items + 12 readings).

### A12 — Gloves + precision: comboboxes that must be typed into
- **location:** EXPERIENCE § Combobox ("Type to filter"); nameplate Fabricante, Caption Atividade, Not-tested reason
- **trigger_condition:** Filtering needs the keyboard; with gloves and glare the engineer scrolls a 56px list instead. The unit control is a 48px mini-combobox inside a 56px field.
- **guard_snippet:** For short registries (manufacturers used on this site, activities, reasons) render a chip row of the 5 most recent + "Outro…" that opens the combobox; the unit becomes a toggle cycling MΩ → GΩ → TΩ on tap.
- **potential_consequence:** Every combobox becomes a two-hand interaction; the field flow drops to tablet-on-a-table.

## B. Sheet states — `mockups/key-sheet-states.html` · EXPERIENCE § State Patterns

### B1 — Reviewing 9–12 suggestions blind, one modal away from the photo
- **location:** frame (b); EXPERIENCE § Nameplate extraction ("Confirmar per field")
- **trigger_condition:** The suggestion is shown without the plate; checking a value means "Ver a foto" → Photo viewer → back, per doubt. "Confirmar todos" therefore gets tapped without checking.
- **guard_snippet:** Show the plate photo (zoomable crop) inline above the suggested group; per-field provenance (highlight the region the value came from on tap); "Confirmar todos" primary. Low-confidence fields: show the best guess flagged "Verificar" instead of blank — an editable guess costs one glance, a blank costs typing.
- **potential_consequence:** Either rubber-stamped hallucinations or a slow field-by-field modal loop; both defeat the point.

### B2 — Reading arrives Monday; verification moves from the cubicle to a desk
- **location:** frame (b′); State Patterns › Nameplate extraction offline; Flow 2b step 4
- **trigger_condition:** With no on-device pass, the person who confirms is not the person who saw the plate.
- **guard_snippet:** On-device OCR first (A1); failing that, trigger the queued reading the moment *any* signal appears (van, gate) and notify with a Toast while still on site.
- **potential_consequence:** Wrong plate values confirmed by someone who cannot check them; the "confirm" step becomes theatre.

### B3 — Banner stacking on one sheet
- **location:** frame (d) (warning Banner + persistent Toast); § Banner (warning, conflict, info, offline)
- **trigger_condition:** "Laudo emitido", "Sugestões da placa prontas", "Sem conexão", "Rascunho encontrado", conflict can coexist on one sheet.
- **guard_snippet:** One banner slot per sheet with a fixed priority (conflict › draft › suggestions › exported › offline); the others collapse into the Sync badge or a "+2" chip.
- **potential_consequence:** The top third of a phone sheet is occupied by messages before the first field.

### B4 — "Não ensaiado" still asks for a reason from a Combobox + text
- **location:** § Not-tested chip; frame (a)
- **trigger_condition:** Four reasons + free text; the common case on this job (TIE breaker, no shutdown) repeats.
- **guard_snippet:** Reason as 4 chips with "Outro" only opening text; default = the last reason used in this laudo.
- **potential_consequence:** Minor, but it is one more modal in the exception path.

## C. Laudo overview — `mockups/key-laudo-overview.html` · EXPERIENCE § Block Model, § Laudo tree

### C1 — The draw.io block model leaks into the field palette
- **location:** frames 2–3 (phone bottom sheet lists "Seções: 1 Objetivo · 2 Definições … + / 8 Pontos de atenção / 11 Certificados")
- **trigger_condition:** A field user in a cubicle is offered text-section blocks, "Já no laudo" rows and sub-block toggles; the Block palette is the same on desktop and phone.
- **guard_snippet:** Field palette = the 8 equipment types only, with the camera-first "Fotografar equipamento" entry (C3); sections and sub-block toggles live in the Template composer / desktop only.
- **potential_consequence:** Wrong taps on section blocks, a scroll past 9 useless rows before the equipment, and a mental model ("composição") that the field does not need.

### C2 — No "continue where I left off"
- **location:** § Laudo card ("Tap opens Laudo overview"); key-home frames; phone tree frame
- **trigger_condition:** From Home to the next sheet = card → tree → expand cabine → expand column → row (4–5 taps); the sheet's "Próxima ficha" helps only once inside.
- **guard_snippet:** Laudo card primary tap = "Continuar: SEC-C06 · 42 de 94" (last edited or first incomplete); the tree via a secondary "Ver árvore". The App bar back from a sheet returns to the tree scrolled to that row.
- **potential_consequence:** Every re-open after a lock screen costs a navigation; on a 4-day shutdown that is dozens of times a day.

### C3 — Adding an unplanned equipment is type → TAG dialog → location → sheet
- **location:** § Block palette (asks TAG and location); Flow 3
- **trigger_condition:** Four decisions for one extra seccionadora; identification of the column is typed or picked.
- **guard_snippet:** "Fotografar equipamento": one photo of the panel front → vision proposes type (seccionadora/disjuntor/TP/TC), column from the panel label, TAG suggestion, and the same photo is queued as the nameplate source; a single "Criar SEC-C09 em Coluna 9?" confirm. Fallback = today's dialog.
- **potential_consequence:** Field additions happen "later, in the office" from memory — exactly the sheet-that-does-not-exist defect (§6.5).

### C4 — "Sem local", provisional TAGs and 300 ms drag on a Saturday
- **location:** frame 1 ("Sem local · 2 blocos aguardando local"); § Laudo tree; Open Questions ("templates hold a location skeleton")
- **trigger_condition:** Staging group, provisional "SEC-?" TAGs, "Mover para…" menus and press-and-hold drag are office mechanics that appear on the field tree in the mock's own Saturday state.
- **guard_snippet:** Resolve the open question in favour of location skeletons in templates so "Sem local" is rare; in the field, opening a "Sem local" block from a column context auto-places it there (undoable).
- **potential_consequence:** Blocks placed wrongly or never; the pre-issue list catches it only at export.

### C5 — Cabine data editable in two places with explanatory prose in both
- **location:** frame 1 (cabine column) and key-sheet-states (c) ("Editar aqui altera a cabine — todas as fichas … passam a mostrar o mesmo valor")
- **trigger_condition:** Same fields, two surfaces, a two-line sentence to explain the coupling on every first sheet.
- **guard_snippet:** One editing place (the first sheet, where the engineer is) with a one-word label "Da cabine"; the tree row shows the values read-only.
- **potential_consequence:** Doubt about which copy wins; more hint text on the busiest sheet.

## D. Photos — `mockups/key-photos.html` · EXPERIENCE § Photos & findings

### D1 — No automatic caption anywhere; "sem legenda" is a to-do for a human
- **location:** frame 1 ("12 · Sem legenda · Adicionar legenda"); export pre-issue list; Flow 4 step 3 ("Caption composer each time")
- **trigger_condition:** 82 captions per job built from three comboboxes; a photo taken from the gallery (Eduardo's path) has no context at all.
- **guard_snippet:** LLM vision caption for every uncaptioned photo when it syncs (activity + equipment recognised; location from the sheet/filter/nearest timestamp), shown amber; a batch "12 legendas sugeridas — Confirmar todas" on the gallery and in the pre-issue list.
- **potential_consequence:** Captions are the single largest text task after observations and stay fully manual.

### D2 — A modal choice before every capture; one photo per trip
- **location:** frame 2 (Photo capture sheet: Tirar foto / Escolher da galeria / Cancelar)
- **trigger_condition:** Two options + cancel before the camera each time; after the shot the app leaves the camera.
- **guard_snippet:** Direct camera on phone; "burst" mode that stays in the camera until "Concluir fotos", each shot getting the same context caption; gallery import as a secondary action.
- **potential_consequence:** Engineers use the native camera and import later (Flow 4 already shows this), losing the per-sheet linkage.

## E. Home — `mockups/key-home.html`

### E1 — Home is an office dashboard shown in the field
- **location:** frames 1–3 (status board, 4 cards, shortcuts)
- **trigger_condition:** Inside the substation the only need is "resume"; the status board and Templates/Cadastros shortcuts are office tools.
- **guard_snippet:** When a laudo is *Em campo* on this device, Home leads with a single hero "Continuar · Porto Seguro · SEC-C06 · 42 de 94"; the board and shortcuts follow below.
- **potential_consequence:** One more scroll-and-find per re-open; see C2.

## F. Export — `mockups/key-export.html`

### F1 — Section 9 order choice on every export
- **location:** § Export dialog ("Seção 9" radio group); memlog decision
- **trigger_condition:** A one-person company with one standard is asked the same question each revision; the default is already fixed by the seed template.
- **guard_snippet:** Hide under "Opções" with the last choice remembered per laudo; show it only when it differs from the template default.
- **potential_consequence:** Minor but symptomatic: an office decision surfaced as a field-style form.

## G. Sync status & Conflict view — `mockups/key-sync-status.html` · EXPERIENCE § Offline & Sync

### G1 — Whole-sheet conflict resolution for a two-person team
- **location:** § Conflict view ("nothing is merged field by field"); frame 2 (item 10 NC + photo vs C)
- **trigger_condition:** "Manter a minha" discards Eduardo's NC, observation and photo link; "Manter a dele" discards Bruno's other edits. Both outcomes lose real field data; the view needs a landscape tablet to read.
- **guard_snippet:** For the MVP merge at sub-block level with stated rules (filled beats empty; NC beats C; a photo link is never dropped; latest wins for text) and *list* the result as information; open the Conflict view only for a true contradiction (two different readings in one cell), with a per-cell pick. Revisit "never auto-merge field values" against the mandate.
- **potential_consequence:** Data loss chosen by a human under time pressure, or conflicts left pending until export.

### G2 — Five sections of prose on a status screen
- **location:** frame 1 ("O servidor não sabe o que ainda está em outro aparelho…", "Fichas primeiro, fotos depois…")
- **trigger_condition:** Explanations repeated on every visit; the engineer wants "is everything up?".
- **guard_snippet:** Headline state + counts; explanations behind a single "Como funciona" link.
- **potential_consequence:** The surface reads like documentation; the three conflicts that need action are below the fold.

## H. General — AI in the flow and its failure modes

### H1 — "AI last in the queue" contradicts the mandate; AI is one button
- **location:** EXPERIENCE § Inspiration ("It stays last in the implementation queue"); § Nameplate extraction (the only AI component); memlog 49
- **trigger_condition:** The mandate inverts the brief but the spine still treats extraction as a bolt-on, online-only, single-surface feature.
- **guard_snippet:** Add a "Smart input" section to EXPERIENCE listing every field group with its non-typing path (camera OCR / vision / copy-from / default / chip / dictation) and one shared suggestion pattern (amber, provenance, confirm, offline queue). Reorder the queue: (1) camera-first nameplate with on-device OCR, (2) display OCR for readings, (3) auto-captions, (4) NC drafting from photo, (5) equipment/column detection. Update the brief accordingly (memlog 49 item 5).
- **potential_consequence:** The product ships as a faithful digital form: less paper, same typing — and the mandate's differentiator is missing from the first release.

### H2 — Wrong-digit and wrong-unit OCR are invisible after confirmation
- **location:** § Measurement field (out-of-limit compares against >400 MΩ only); § Nameplate extraction
- **trigger_condition:** 330 → 3300 MΩ or 147 GΩ → 147 MΩ passes the limit check and looks plausible; once confirmed the source is gone.
- **guard_snippet:** Keep the display crop beside any OCR'd value until export (tap to see); flag magnitude outliers within a table ("difere 10× das outras fases"); cross-check nameplate suggestions against registries (voltage class must exist; unknown manufacturer asks "Criar Celtta?"); accept only values whose text literally appears in the OCR layer (no LLM-only numbers); print nothing unconfirmed (already specified — keep).
- **potential_consequence:** An AI transcription error prints in a signed laudo with no trail to the evidence.

### H3 — Hallucinated plate fields
- **location:** § Nameplate extraction ("Low-confidence fields are left blank, never guessed")
- **trigger_condition:** An LLM will map a stamped lot number to "Data de fabricação" or invent "Meio de extinção: Ar" from the equipment type; "low confidence" is not a property the UX can rely on.
- **guard_snippet:** Field-level provenance (region highlight) is mandatory for a suggestion to be shown; fields with no grounded region show "Verificar" with the guess, never a neutral suggestion; confirmation of a field with no provenance requires a tap on the field itself, not "Confirmar todos".
- **potential_consequence:** Plausible, wrong nameplate data propagates by TAG to the next visit ("copied from the previous laudo").

### H4 — Offline unavailability is treated as a state, not a design constraint
- **location:** State Patterns › Nameplate extraction offline; Foundation ("zero signal inside the substation")
- **trigger_condition:** Every AI path specified needs the server; the field is defined as offline.
- **guard_snippet:** Split AI into an on-device tier (OCR of plates and displays, unit reading, simple type classification) that works in the cubicle and a cloud tier (LLM captions, NC drafting, refinements) that runs on sync; the UX shows the same amber pattern for both, with "Leitura local" / "Leitura completa quando houver sinal" labels.
- **potential_consequence:** The smart features are unavailable precisely where typing is hardest.

### H5 — No voice anywhere
- **location:** general (EXPERIENCE has no dictation primitive)
- **trigger_condition:** Hands hold leads, torch and phone; gloves; every text field is keyboard-only.
- **guard_snippet:** Dictation as a standard affordance on Observation, Point of attention text, and Measurement tables ("Fase A, 147 giga") — always as an amber suggestion, with the device's native speech API and graceful absence offline.
- **potential_consequence:** Text stays postponed to the office; the "digitar o menos possível" mandate is unmet on the free-text half of the job.

### H6 — Progress counter counts fields, not effort
- **location:** § Progress counter; Laudo card "42 de 94 fichas"
- **trigger_condition:** The design measures completeness but never the interaction cost; nothing in the spine sets a budget per sheet.
- **guard_snippet:** Add a measurable target to EXPERIENCE (e.g. ≤ 20 taps and ≤ 15 keystrokes for an all-conforme seccionadora with plate copied) and validate the mocks against it; treat any field that cannot be filled by tap/photo/copy as an exception to justify.
- **potential_consequence:** Without a budget every reviewer, including this one, argues from taste; the mandate has no acceptance test.
