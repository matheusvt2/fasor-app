# Validation Report — fasor

- **DESIGN.md:** `DESIGN.md`
- **EXPERIENCE.md:** `EXPERIENCE.md`
- **Run at:** 2026-09-18T14:15:11-03:00

## Overall verdict
Mechanically this pair is clean: every `{path.to.token}` reference in both files resolves (52 unique), all 27 light colors have a `-dark` pair with hex, the 14 contrast ratios claimed in DESIGN.md recompute exactly, 30/30 component names match between DESIGN.md § Components and EXPERIENCE.md § Component Patterns, all seven `sources` resolve, and every inline import link exists. Downstream consumers can source-extract without guesswork on the visual identity, the block model, or the capture-to-document transformation. Two high-impact gaps remain, both in the field-offline promise: the brief's MVP step "nameplate data read by AI from a photo, then confirmed" has no flow, component or state, and the spine never says how a laudo becomes available on a device before the engineer enters a no-signal substation, nor what happens when it is not. Both spines still carry `status: draft`; no key-screen mocks exist, so the two behavior-heavy surfaces (Equipment sheet, Laudo overview) will be built from tables alone.

The two extra lenses moved the picture from "clean, two gaps" to "clean palette, under-specified behavior and data model". Accessibility found nothing wrong with a single hex value — every claimed ratio recomputes — but found the product's acceptance bar broken where it matters: the photo pending-upload state was color-only at 2.6:1, the tri-state "retap to clear" contradicted the promised radio semantics and was a glove hazard, reorder had no non-drag path, a dozen tap targets had no size, and the decimal-dot rule could turn 3.700 MΩ into 3,7 MΩ. Architecture found four critical holes the rubric could not see from the spines alone: the conflict unit covered sheet bodies but not laudo structure, PDF provenance was undefined against an editable DOCX, section 9 regrouping was not derivable from the tree, and offline durability in a browser was under-specified for "never lose a photo". Neither lens asked for a palette change; both asked for sentences the spines did not yet have.

The reviews ran against v0.1.0. An update pass has since produced v0.2.0, and every finding below carries its status against the current spines: of 76 findings, 64 are resolved in v0.2.0, 7 were moved to the spines' Open Questions (location depth, status-pill transition table, sheet attribution, Project/Client/Site, "Salvar como template", Atividade/Local registries, Inter bundling), and 5 were not applied (key-screen mocks, sheet-PNG index, disabled-button opacity, DESIGN.md's ninth section, the mixed Open Questions list). Both spines remain `status: draft` until the mocks exist.

## Category verdicts
- Flow coverage — adequate
- Token completeness — adequate
- Component coverage — adequate
- State coverage — adequate
- Visual reference coverage — adequate
- Bloat & overspecification — adequate
- Inheritance discipline — adequate
- Shape fit — strong

## Findings by severity

Status legend: **Resolved in v0.2.0** · **Open Question** (moved to the spines' Open Questions) · **Not applied**

### Critical (6) — resolved 6 · open question 0 · not applied 0

**[Accessibility]** — F-01 Photo pending-upload state is color-only and fails 3:1 in both themes (§ DESIGN.md § Components › Photo tile; EXPERIENCE.md § Component Patterns › Photo tile; § State Patterns › Photo pending upload; Flow 6 failure)  
The dot has no word, no glyph, and computes 2.62:1 (light) / 1.62:1 (dark) against the number badge — it disappears under sun, is indistinguishable for a deuteranope, and is silent to a screen reader. This is the one state the spine calls the acceptance bar ("never lose a photo"), yet it is the one state that breaks the "never color-only" rule. Flow 6 reuses the same amber dot for a rejected upload.  
Fix: Render pending as a small pill with icon + word ("↑ Aguardando" / "Erro — Tentar novamente"), `fora-do-limite-fill` + `fora-do-limite` ink (5.82:1) for pending and `nao-conforme` outline for error; `aria-describedby` from the tile; state the pending count in the gallery header ("3 fotos aguardando envio").  
Status: **Resolved in v0.2.0** — Photo tile renders word pills for pending and error (the error pill is the retry button), tokens added, gallery header count, `aria-describedby`; no dot remains.

**[Accessibility]** — F-02 Tri-state "retap to clear" contradicts radio semantics and is a glove hazard (§ EXPERIENCE.md § Component Patterns › Tri-state control; § Accessibility Floor; § Interaction Primitives)  
A native or ARIA radio cannot be unchecked by re-activating it, so keyboard and screen-reader users have no way to clear, while touch users clear by an undiscoverable gesture. In the field, a leather-glove double-registration on a 56px segment silently un-marks a row the engineer believes is marked; nothing is announced and the only trace is the Progress counter changing.  
Fix: Keep `role="radiogroup"` per row with three radios named by the full words; expose "clear" as a real control — "Limpar" in the row's overflow menu and Delete/Backspace on the focused group — and drop retap-to-clear. Apply the same rule to the two Conclusion pairs.  
Status: **Resolved in v0.2.0** — Tri-state and Conclusion control are radiogroups with full-word names; "Limpar" via Overflow menu and Delete/Backspace; retap does nothing; "clearing a selection by re-tapping it" is on the banned list.

**[Architecture]** — Conflict unit is the sheet body only; laudo structure has no rule (§ EXPERIENCE.md § Offline & Sync "Conflict rule"; § Block Model rules; Flow 3 failure; Flow 6)  
Two offline devices can add/remove/move/reorder blocks, edit setup, captions, points of attention, or delete a sheet the other is editing, and "Manter a minha / dele" does not cover any of it.  
Fix: Define per entity: sheet body = person-resolved; structure = mergeable (add-only set + fractional order index, last-writer-wins on setup), delete-vs-edit = keep both and surface; state which fields are inside the sheet document.  
Status: **Resolved in v0.2.0** — "Conflict model, per entity" bullet defines sheet body vs. structure, the two surfaced cases (deletion vs. edit, duplicate TAG), and what the sheet document contains; the Conflict view handles both.

**[Architecture]** — PDF provenance is undefined (§ EXPERIENCE.md Flow 5; § Export dialog; brief § Solution 5)  
The brief sells an editable DOCX, but Flow 5 generates the PDF from app data after Bruno "changes nothing structural" in Word. Any Word edit is silently absent from the client-facing PDF, or the architecture needs DOCX re-upload and a DOCX→PDF converter.  
Fix: Decide: PDF = render of app data (edits must be made in the app) or PDF = conversion of the uploaded, edited DOCX; the answer changes the export pipeline and the revision model.  
Status: **Resolved in v0.2.0** — Decided (memlog): both formats render app data as one revision; Word is for reading and printing; edits go back into the app; the divergence from the brief is recorded in Open Questions.

**[Architecture]** — Section 9 regrouping is not derivable (§ EXPERIENCE.md § Capture-to-Document, table row 9)  
The Template has no locations, yet the rule "is a property of the Template"; the real document uses two schemes (small cabines: one subsection in sheet order; large cabines: one subsection per type group, TP+TC and Cabos+Trafo paired) plus a subsection-title pattern, none of which is stated.  
Fix: Specify per cabine a flag "agrupar por tipo" with fixed group order, ordering = tree order, and the title pattern; or accept one subsection per cabine and confirm with Bruno.  
Status: **Resolved in v0.2.0** — "Section 9 default scheme" paragraph: per-cabine *Agrupar por tipo* flag, fixed group order, pairing, title pattern, plus the export-time choice (memlog); the para-raio placement inside grouped cabines is an Open Question.

**[Architecture]** — Offline durability in a browser is under-specified for "never lose a photo" (§ EXPERIENCE.md § Responsive & Platform; § Offline & Sync; State Patterns "Cold open, session, offline")  
Cold-open offline needs a service worker/PWA shell (not listed); iPadOS Safari evicts script-writable storage after 7 days without use unless installed to Home Screen; "background sync" only runs while the tab is foregrounded on iOS.  
Fix: Add an "Instalar na tela inicial" step/surface, accept "sync runs while the app is open", and state a maximum offline age before photos must be uploaded.  
Status: **Resolved in v0.2.0** — "App not installed" state with the install Banner and Account entry; background sync scoped to "while the app is open"; eviction and maximum offline age named as architecture risks and listed under Open Questions.

### High (14) — resolved 14 · open question 0 · not applied 0

**[Flow coverage]** — Nameplate-by-AI has no flow, component or state (§ EXPERIENCE.md § Key Flows; § Component Patterns; § State Patterns)  
The brief's MVP flow step 2 includes "nameplate data (read by AI from a photo, then confirmed)" and Scope lists it as in-MVP ("last in the MVP queue"). EXPERIENCE.md mentions it only as a one-line "Deferred" note in § Inspiration & Anti-patterns: no Key Flow step, no Component Pattern for the confirm-one-by-one review, no state for extraction running / needs connection / failed / low-confidence field, and no DESIGN.md visual for a suggested-vs-confirmed field. In a zero-signal field context the "needs connection" question alone is a design decision a story-dev cannot make.  
Fix: Add a Component Pattern "Nameplate extraction" (button in the nameplate sub-block; requires connection, says so when offline; returns proposed values rendered as suggestions in `{colors.fora-do-limite-fill}` until each is confirmed; nothing is written until confirmed), a State Patterns row (extracting / offline / failed), a DESIGN.md visual for the suggested field, and one step in Flow 2 (or a Flow 2b) exercising it.  
Status: **Resolved in v0.2.0** — Nameplate extraction component in both tables, four State Patterns rows, `components.nameplate-extraction` tokens, Flow 2b (memlog decision).

**[State coverage]** — No rule for laudo availability on the device before going offline (§ EXPERIENCE.md § Offline & Sync; § State Patterns; § Sync status surface; Flow 4 step 1)  
Offline & Sync specifies writes, and State Patterns covers "Cold open, session, offline → cached laudos render", but nothing says when a laudo (and its registries, templates, photos) is downloaded, whether the engineer can see that it is complete on this device, or what a tap on a non-cached laudo does with no signal. Entering a basement with a laudo that is not on the tablet is the product's failure mode, and architecture needs the rule to design storage.  
Fix: Add an Offline & Sync bullet stating the download rule and an "available on this device" indicator, a State Patterns row "Laudo not on device, offline", and a Sync status section listing downloads as well as uploads.  
Status: **Resolved in v0.2.0** — "Automatic availability" bullet (Rascunho/Em campo laudos download by themselves), Laudo card line "No aparelho · atualizado 21:40", State rows "Laudo not on device, offline" and "Laudo downloading", Sync status lists downloads (memlog decision).

**[Accessibility]** — F-03 Reordering has no single-pointer, non-drag alternative (SC 2.5.7) (§ EXPERIENCE.md § Interaction Primitives; § Component Patterns › Block card, Laudo tree, Point of attention card)  
Alt+↑/↓ is desktop-only by the spine's own wording; a tablet user with a screen reader, a tremor, or a stylus cannot reorder blocks, tree rows or points of attention, and Point of attention cards have no alternative at all.  
Fix: Add "Mover para cima · Mover para baixo · Mover para…" to every reorderable item's overflow menu, make Alt+↑/↓ work wherever a keyboard is attached, announce the result via a polite live region, document the drag handle's `aria-label`.  
Status: **Resolved in v0.2.0** — "Reorder three ways, always" primitive; Overflow menu carries the Mover items for Block card, tree rows and Point of attention cards; moves announced; handle `aria-label` in DESIGN.md.

**[Accessibility]** — F-04 Decimal-dot conversion can silently mis-scale a reading (§ EXPERIENCE.md § Component Patterns › Measurement field; § Voice and Tone)  
In pt-BR the dot is the thousands separator. An engineer typing "3.700" (as the paper sheet shows 3.700 MΩ) gets 3,700 → 3,7 MΩ, which the app then flags amber against >400 MΩ and suggests Com restrições — a 1000× error dressed as a helpful hint.  
Fix: Use `inputmode="decimal"` text input, accept both separators but treat a dot followed by exactly three digits and no comma as a thousands separator, echo the parsed value in pt-BR beside the field before blur-comparison, and make the unit slot the place to change scale.  
Status: **Resolved in v0.2.0** — Measurement field row states the parsing rule, the echo line ("= 3.700 MΩ") and scale-by-unit; DESIGN.md adds the echo line.

**[Accessibility]** — F-05 Toast action color undefined for dark theme, fails at 1.93:1 (§ DESIGN.md § Components › Toast; `components.toast`)  
In the dark theme the toast inverts to a light `#F3F4F6` background, and `primary-dark #86B6E8` on it is 1.93:1. The persistent "Rascunho encontrado — Recuperar" and "Ficha removida — Desfazer" actions become unreadable.  
Fix: Add `toast.action` = the opposite theme's primary and state the rule.  
Status: **Resolved in v0.2.0** — `colors.toast-action` / `toast-action-dark` tokens, `components.toast.action`, and the rule in § Colors › Toast action.

**[Accessibility]** — F-06 Interactive elements with no size, or a stated size below the tokens (§ DESIGN.md § Components; EXPERIENCE.md § Component Patterns)  
Block card drag handle and overflow — no size, no `min-height` token; Block palette "small '+'"; tree chevrons; Sync badge as a tap target; App bar back and avatar; the unit control inside the 56px field; Checklist row overflow; quick chips; text buttons; Toast action; "Tap TAG to edit"; the rail toggle.  
Fix: Add `min-height` to `block-card` and make its handle and overflow 48×48; make the whole palette row the target; give tree chevrons a 48×56 hit area; give every text button a 48px hit area; size the unit control ≥ 48×56 with a 2px divider; chips 48px tall. Add one sentence to § Layout: any element with a tap behaviour has a ≥ 48px hit area.  
Status: **Resolved in v0.2.0** — "Hit areas" paragraph in § Layout & Spacing lists every case; tokens `block-card.min-height/handle-hit-area`, `overflow-menu.trigger-hit-area`, `laudo-tree.chevron-hit-area`, `measurement-field.unit-control-*`, `chip.min-height`.

**[Accessibility]** — F-07 Dialog and overlay semantics not specified beyond "Esc closes" (§ EXPERIENCE.md § Component Patterns › Confirm dialog, Export dialog, Photo capture sheet, Block palette; § Accessibility Floor)  
No focus trap, initial focus, focus return, `role="dialog"`/`aria-modal`, `aria-labelledby` or `aria-describedby`. Confirm dialogs' default focus matters: with gloves, a mis-tap on "Remover ficha" as the initially focused button destroys data.  
Fix: One paragraph in § Accessibility Floor: all overlays are `role="dialog" aria-modal="true"`, labelled by title, initial focus on the least destructive control, focus trapped, Esc/system back closes, focus returns, background inert.  
Status: **Resolved in v0.2.0** — "Dialogs and overlays" bullet in § Accessibility Floor; Confirm dialog initial focus on "Cancelar" in both spines.

**[Architecture]** — Template instantiation produces unplaced blocks with no state or surface (§ EXPERIENCE.md § Block Model "quantities"; § Block palette; Flow 1 steps 3–5)  
"25 seccionadoras" from a template have neither TAG nor location; the model says equipment hangs off a location and TAG is mandatory at creation.  
Fix: Add a "Sem local" staging bucket in the tree, or make templates carry a location skeleton; state that TAG is optional until placement.  
Status: **Resolved in v0.2.0** — "Sem local" staging group with provisional TAGs ("SEC-?") finalized on placement; Flow 1 steps 5–6 exercise it.

**[Architecture]** — Sub-block ownership and print effect are ambiguous (§ EXPERIENCE.md § Block Model sub-block row; "Print spec for section 9"; Flow 1 step 3)  
Three mechanisms overlap (template toggle, in-sheet toggle, subtype NA pre-mark) and the print spec says checklist lists are fixed verbatim; toggling "Motor" off either changes the corporate layout or is just an NA.  
Fix: Template holds defaults, Laudo snapshots them at creation, per-sheet toggles override; a toggled-off checklist item prints as NA; a toggled-off test sub-block is omitted (pick one); say where subtype is set.  
Status: **Resolved in v0.2.0** — Sub-block row: Template defaults, per-sheet override, toggled-off test sub-blocks omitted from print, checklist items never removed (NA pre-mark stays editable); subtype set in the Template composer (Flow 1 step 4).

**[Architecture]** — TAG identity scope is undefined (§ EXPERIENCE.md § Registries "Equipment identity"; § Sheet header; § Block palette)  
Copy-on-create by TAG needs a site-scoped Equipment entity; uniqueness per site collides on "COLUNA 2" and on two offline devices adding "SEC-09"; editing a TAG is a rename or a re-link.  
Fix: TAG unique per (site, cabine), enforced softly; Equipment is an entity under Site; TAG edit = rename; duplicates across devices resolved by the server flagging, not merging.  
Status: **Resolved in v0.2.0** — Unique within a client site with inline refusal, rename keeps identity, cross-device duplicates surfaced as a structure conflict; the Site/Project ambiguity is an Open Question.

**[Architecture]** — SE characteristics and environment: owner and print position contradict each other (§ EXPERIENCE.md § Laudo setup; § Block Model Location row; § Capture-to-Document row 9; Flow 2 step 2)  
Only 4 of 6 cabines in the real laudo carry the SE + environment block; values are entered from inside a sheet but belong to the cabine, crossing the conflict unit.  
Fix: SE type/voltages/power and environment are Cabine attributes edited in the tree, printed only on the first sheet of the cabine; confirm whether environment is per cabine or per visit.  
Status: **Resolved in v0.2.0** — The Cabine owns both; edited from the cabine row or the SE block on any sheet (the edit lands on the cabine); printed once per cabine on its first sheet; Laudo setup no longer holds them.

**[Architecture]** — Export revision semantics are incomplete (§ EXPERIENCE.md § Export dialog; § Capture-to-Document row 7; State Patterns "Laudo exported, then edited"; Flow 5)  
DOCX then PDF of identical content would be revisions 1 and 2; the app does not say what photo numbers it shows after a post-export edit; no surface lists past revisions; the revision number is not printed anywhere.  
Fix: Revision = content snapshot, formats are renderings, new revision only when content changed; numbers provisional again on any change; add a "Revisões" list; decide whether the revision prints on the cover.  
Status: **Resolved in v0.2.0** — "Export revisions" paragraph and the Revisões list in the Export dialog; provisional numbering after edits; printing the revision number is an Open Question.

**[Architecture]** — Acceptance criteria hang off the Instrument (§ EXPERIENCE.md § Registries Instruments; § Block Model)  
Contradicts the brief's "criteria as data with their source" and the SaaS story; a criterion is a property of test type/equipment/norm, not of the meter.  
Fix: Criterion entity (operator, value, unit, source) referenced by the test sub-block definition in the Template; the instrument only supplies voltage/current defaults; per-sheet override keeps its source.  
Status: **Resolved in v0.2.0** — Criteria belong to the test sub-block type with a source; an Acceptance criteria registry (read-only in the MVP); the Instrument supplies only voltage/current.

**[Architecture]** — Server cannot know another device's unsynced state; offline availability unspecified (§ EXPERIENCE.md § Offline & Sync; Flow 4 step 1)  
"Waiting for Eduardo's sync" is only knowable from Eduardo's last heartbeat; nothing says which laudos, and whose photos, a device holds offline.  
Fix: Downgrade to "Eduardo: última sincronização 14:20"; add an explicit availability rule (laudos opened while online, photos of other devices as thumbnails only).  
Status: **Resolved in v0.2.0** — "Último envio de Eduardo" is the signal in Sync status and the pre-issue list; automatic availability rule for Rascunho/Em campo laudos; thumbnails-vs-full-size is an Open Question.

### Medium (33) — resolved 25 · open question 6 · not applied 2

**[Flow coverage]** — Surface closure claim wrong for Registries and Account; certificate upload unspecified (§ EXPERIENCE.md § Information Architecture; § Registries; Flows 1–6)  
§ Information Architecture "Surface closure" claims every surface has a flow that lands there, but no flow lands on Registries or Account. Registries is where the calibration certificate file is uploaded — the input for section 11 of the output — and no flow, Component Pattern or state describes that upload (file types, size, offline behavior).  
Fix: Add a short office flow or a Registries step inside Flow 1; specify certificate upload behavior in the Registry row pattern; correct the surface-closure sentence.  
Status: **Resolved in v0.2.0** — Flow 1 step 2 registers instrument 1T and attaches its certificate; Registry row specifies the file picker + queued upload; surface-closure sentence corrected and Account declared a settings surface without a flow; file types/size parked as an Open Question.

**[Token completeness]** — Self-imposed 7:1 target missed by the selected tri-state segment (§ DESIGN.md § Do's and Don'ts row 1; § Components › Tri-state control; EXPERIENCE.md § Accessibility Floor)  
The spine's own rule is "load-bearing text ≥ 7:1", but the selected tri-state segment renders the state's ink on its own fill, and those pairs compute to 5.6:1 (conforme), 5.4:1 (não conforme), 4.9:1 (não se aplica), 5.8:1 (fora-do-limite on its fill). The C/NC/NA letter on the selected segment is the most load-bearing text in the product; a dev following the tokens ships AA-only there under sunlight.  
Fix: Either darken the light fills until ink-on-fill ≥ 7:1, or state in § Colors that selected segments draw the letter in `ink-primary` and use the state ink only for the ring/glyph.  
Status: **Resolved in v0.2.0** — § Colors now scopes the 7:1 bar to ink on surfaces and states the ≥ 4.5:1 figures for letters on fills, with the letter set in `heading` weight carrying the state; darkening the inks stays listed in DESIGN.md Open Questions.

**[Component coverage]** — Conflict resolver, quantity stepper and photo full view have no component row (§ EXPERIENCE.md § State Patterns › Sync conflict; Flow 4 failure; Flow 6; Block palette; Photo tile)  
Three behaviors used by flows have no row in either table: the conflict resolver (Banner "Manter a minha · Manter a dele · Ver as duas" plus the side-by-side read-only view) while DESIGN.md's Banner is amber-only; the quantity stepper in the Template composer; the photo full view ("Tap opens full view with caption edit and Remover").  
Fix: Add Banner variants (warning / conflict / info) to `components.banner` and the DESIGN row; add rows "Conflict view", "Quantity stepper", "Photo viewer" to both tables.  
Status: **Resolved in v0.2.0** — Banner has three variants; Conflict view, Quantity stepper and Photo viewer rows exist in both tables with tokens.

**[State coverage]** — Camera / file permission denied is not a state (§ EXPERIENCE.md § State Patterns › Permission denied; § Component Patterns › Photo capture sheet)  
The "Permission denied" row covers project sharing only. The Photo capture sheet depends on `getUserMedia`; iPadOS Safari and Android Chrome both surface a denial that leaves "Tirar foto" dead.  
Fix: Add a row: denied → inline message in the capture sheet with "Escolher da galeria" as the fallback and the OS path to re-enable; never silently no-op.  
Status: **Resolved in v0.2.0** — State row "Camera / file permission denied" and the Photo capture sheet rule in both spines.

**[State coverage]** — No in-progress states for export, initial load and photo upload runs (§ EXPERIENCE.md § State Patterns; § Component Patterns › Export dialog)  
Export generation on the server for a 119-page DOCX/PDF, initial data load of a 94-sheet laudo, and the photo upload run in Sync status have no visible progress treatment.  
Fix: One row "Working" (export generating / photos uploading / laudo loading) with copy, what stays interactive, and cancel rules.  
Status: **Resolved in v0.2.0** — "Working" row covers all three with copy and interactivity; Export dialog runs asynchronously ("Gerando revisão 2… pode fechar").

**[Visual reference coverage]** — No visual reference for the behavior-heavy surfaces (§ DESIGN.md § Components › Checklist row / Measurement table; EXPERIENCE.md § IA; frontmatter status)  
No visual reference exists for the surfaces whose layout drives behavior — Equipment sheet (tri-state rows that expand on NC, measurement table with unit slot and calculated cells, sticky bar), Laudo overview (tree + block cards + palette), Export dialog. The Finalize step "Key-screen mocks rendered" has not run; story-dev will build the product's core screen from two tables.  
Fix: Render key-screen HTML mocks for Equipment sheet (tablet portrait and phone) and Laudo overview into `.working/`, promote to `mockups/`, link at § Components and § IA.  
Status: **Not applied** — No `mockups/` exists; rendering mocks is a Finalize step, not a text edit. DESIGN.md Open Questions records it and both spines stay `status: draft`.

**[Inheritance discipline]** — Spines say "product name undecided" while the sources say Releng (§ DESIGN.md frontmatter description; § Brand & Style; EXPERIENCE.md intro; § Open Questions)  
Both spines state "Product name undecided", but the brief's title is "Product Brief: Releng", the addendum records "Chosen: Releng, on 2026-09-18. Availability not yet checked", and the memlog's own second entry says "Produto: Releng (codinome fasor)". The later decision to show the literal PRODUTO placeholder is sound, but the wording contradicts its sources rather than recording a divergence; an architect reading the brief will name the system Releng.  
Fix: Replace "undecided" with "Chosen as Releng in the brief (availability unchecked); the UI shows the placeholder PRODUTO until the name is confirmed (memlog decision)".  
Status: **Resolved in v0.2.0** — Both spines now carry the exact wording in frontmatter, § Brand & Style, the EXPERIENCE.md intro and Open Questions.

**[Accessibility]** — F-08 Interactive cards use the hairline as their only boundary (§ DESIGN.md § Colors; § Components › Laudo card, Photo tile)  
Hairline is 1.58:1 on white, 1.43:1 in dark. WCAG 1.4.11 exempts boundaries not needed to identify the component, so this is a consistency finding rather than a failure — but under sun a Laudo card edge vanishes and adjacent cards merge.  
Fix: Either promote Laudo card to `border-strong` or state that the card's affordance is its title + chevron and hairline is decorative; give Photo tile `border-strong`.  
Status: **Resolved in v0.2.0** — Laudo card hairline declared decorative with title + trailing chevron as the affordance; Photo tile uses `border-strong`.

**[Accessibility]** — F-09 Selected tree row is indicated by fill alone (§ DESIGN.md § Components › Laudo tree; `laudo-tree.selected-background`)  
Focus-fill is 1.24:1 against white; under sun the current sheet is not findable in the rail.  
Fix: Add a 4px `primary` left rule and 600 weight to the selected row, `aria-current="page"`, and keep keyboard focus distinct from selection.  
Status: **Resolved in v0.2.0** — `laudo-tree.selected-rule` token; row spec has the 4px rule, 600 weight, `aria-current`, and a distinct focus ring.

**[Accessibility]** — F-10 Conclusion control has no selected state for "Sem restrições" and no inner ring (§ DESIGN.md § Components › Conclusion control; `conclusion-control` tokens)  
A selected neutral segment on white may be indistinguishable from an unselected one; the "Obrigatório" hint and required-missing reason have no ARIA association.  
Fix: Reuse `nao-aplica-fill` + `nao-aplica` ink for Sem restrições and copy the tri-state rule verbatim (fill + ink + 2px inner ring + ✓ glyph); `aria-describedby` and `aria-invalid` on both radiogroups.  
Status: **Resolved in v0.2.0** — `sem-restricoes-selected/-foreground` tokens; selected = fill + ink + ring + ✓; ARIA association in the EXPERIENCE.md row.

**[Accessibility]** — F-11 Disabled buttons at 40% opacity vanish in sunlight (§ DESIGN.md § Components › Button; EXPERIENCE.md § Component Patterns › Button)  
The computed disabled primary button is a 2.04:1 pale block with 1.36:1 text — WCAG-exempt, but in the field the engineer cannot see that "Concluir ficha" exists, let alone why it is off, unless the reason text survives (its colour is unspecified).  
Fix: Disabled = `surface-raised` fill, 2px `border-strong` outline, `ink-secondary` label, `aria-disabled="true"` (focusable) and the reason in `ink-secondary` linked by `aria-describedby`. Never reduce opacity on a control that must be found outdoors.  
Status: **Not applied** — The 40% opacity treatment is kept; mitigated by making the reason text mandatory in `ink-secondary` (8.8:1), linked via `aria-describedby`, with the button staying focusable.

**[Accessibility]** — F-12 Checklist row focus model is contradictory and yields 60+ tab stops per sheet (§ EXPERIENCE.md § Component Patterns › Checklist row)  
"Row is a single focus stop, the segments are the tab stops inside" — a 15-item sheet would need 4 Tabs per row plus overflow.  
Fix: The row is not focusable; each row contributes one tab stop (the radiogroup) plus one for its overflow button; NC-expanded Observation and "Adicionar foto" follow in DOM order; use the group's accessible name so the announcement in § Accessibility Floor actually results.  
Status: **Resolved in v0.2.0** — Checklist row states exactly this model.

**[Accessibility]** — F-13 Self-imposed 7:1 target missed by the most load-bearing text (§ DESIGN.md § Do's; EXPERIENCE.md § Accessibility Floor)  
The C / NC / NA letters on their fills are 5.62 / 5.37 / 4.91:1 and the out-of-limit helper on its fill is 5.82:1 — the exact text the engineer reads under glare. The tri-state letters' typography is absent.  
Fix: Either soften the claim to "≥ 4.5:1 everywhere, ≥ 7:1 for ink on surfaces" or darken the three inks and lighten the fills; specify the tri-state letters' typography (`heading` 18px/600).  
Status: **Resolved in v0.2.0** — Claim scoped to ink on surfaces in § Colors, § Do's and § Accessibility Floor; `tri-state-control.letter-typography` = `heading`; darkening the inks parked in DESIGN.md Open Questions.

**[Accessibility]** — F-14 Live-region strategy will chatter or stay silent at the wrong moments (§ EXPERIENCE.md § Accessibility Floor; § Interaction Primitives; § Component Patterns › Sheet header, Progress counter, Measurement field)  
A polite badge that counts down during a photo upload, plus a header timestamp rewritten on every keystroke burst, will interrupt a screen-reader user on every field, while nothing ever says "salvo".  
Fix: Announce badge state transitions only; keep Sheet header and Progress counter out of live regions; a debounced hidden "Salvo" status; announce the out-of-limit helper once on blur; Toasts `role="status"`, conflict/sync-error Banner `role="alert"`.  
Status: **Resolved in v0.2.0** — "Live regions announce transitions, not counts" bullet; hidden "Salvo" in Interaction Primitives; roles on Toast and Banner rows.

**[Accessibility]** — F-15 Focus style is only defined for inputs (§ EXPERIENCE.md § State Patterns › Focus; DESIGN.md § Colors › Focus)  
Buttons, tree rows, Laudo cards, Photo tiles, chips, the Sync badge and dialog options have no focus indicator specified; browser defaults on a custom UI system are often clipped or removed. Nothing keeps the focused field out from under the Sticky action bar or the keypad (SC 2.4.11).  
Fix: Global rule: non-input focus = 3px `focus` ring with 2px offset on the full hit area; pair with scroll padding = Sticky action bar height + keyboard inset.  
Status: **Resolved in v0.2.0** — Rule in § Colors and the Focus state row, including the scroll-padding clause.

**[Accessibility]** — F-16 Sticky action bar reach and keypad interaction under-specified for one hand (§ EXPERIENCE.md § Component Patterns › Sticky action bar; DESIGN.md § Components)  
Right-aligned favours a right-hand grip; a left-handed engineer, or one holding a probe in the right hand, reaches across a 10" tablet. Nothing says whether the bar sits above the on-screen keypad or is covered by it.  
Fix: On tablet portrait, buttons fill the width or honour a handedness preference; the bar sits above the virtual keyboard; Enter on the last cell of a table focuses "Próxima ficha".  
Status: **Resolved in v0.2.0** — Buttons fill the width in tablet portrait, the bar sits above the keyboard, Enter on the last cell focuses "Próxima ficha".

**[Accessibility]** — F-17 Measurement table has no accessible-structure spec; phone cards lose the header relationship (§ EXPERIENCE.md § Component Patterns › Measurement table; § Responsive)  
Enter-moves-down-the-column no longer holds when Fase A's three readings sit in one card; calculated cells have a visual "calc" mark only.  
Fix: Real `<table>` with header cells at tablet/desktop; on phone each input named row + column; Enter moves to the same column of the next card; calculated cells read-only and announced "calculado"; acceptance value and source in the caption.  
Status: **Resolved in v0.2.0** — Measurement table row and DESIGN.md spec carry the table, caption, per-field names, Enter rule and "calc." mark with announcement.

**[Accessibility]** — F-18 Expired calibration in Registry rows conveyed by sort position and amber date only (§ DESIGN.md § Components › Registry row; EXPERIENCE.md › Registry row)  
An amber date with no word is color-only for the state that decides whether section 11 is valid.  
Fix: Prefix the word "Vencida" (or a chip "Calibração vencida") before the date.  
Status: **Resolved in v0.2.0** — Both rows prefix "Vencida" before the date.

**[Accessibility]** — F-19 Error association never made explicit (§ EXPERIENCE.md § Component Patterns › Observation field, Login form, Measurement field; § State Patterns › Required missing)  
Helper, reason and error lines are adjacent to their controls but never associated, so assistive tech reads them as loose text.  
Fix: One rule in § Accessibility Floor: every helper, reason or error line is `aria-describedby` from its control; required-missing sets `aria-invalid="true"`; Login error additionally `role="alert"`.  
Status: **Resolved in v0.2.0** — "Errors and helpers are associated" bullet; Required missing row and Login form row updated.

**[Accessibility]** — F-20 Undo window and toast timing tight for gloves and screen readers (§ EXPERIENCE.md § Interaction Primitives; › Toast)  
Ten seconds to find and hit a small text action, one-handed, after an accidental removal is short; a screen-reader user may not reach the toast in time.  
Fix: Undo toasts persistent until dismissed or next navigation (min 20 s); "Restaurar ficha removida" in Laudo overview overflow until export.  
Status: **Resolved in v0.2.0** — Undo toasts persist ≥ 20 s until dismissed/navigation; "Restaurar ficha removida" exists in the Laudo overview menu.

**[Architecture]** — Tree "Order = capture order" is ambiguous (§ EXPERIENCE.md § Laudo tree)  
Read as "sorted by fill time" the order changes under the user; read as "planned route" it is a stored per-laudo order, and the Template's "ordered composition" then has no location to order within.  
Fix: Say "order is manual, per laudo, initially template order"; use a merge-friendly order key.  
Status: **Resolved in v0.2.0** — "Order is manual and per laudo" in the Laudo tree row and Block Model rules; merge by position in the conflict model.

**[Architecture]** — Location depth fixed at Cabine › Coluna but the data needs 1 or 3 levels (§ EXPERIENCE.md § Block Model Location; Flow 2; extraction § 2)  
Enel has equipment directly under the cabine; 1° Subsolo has two panels (PTMT, IM) each with a "COLUNA 2".  
Fix: Make Coluna optional and let the column name carry the panel, or allow a nested location.  
Status: **Open Question** — Listed verbatim in EXPERIENCE.md Open Questions; the model still reads Cabine › Coluna/Cubículo.

**[Architecture]** — Status pill transitions are events without a full table (§ EXPERIENCE.md § Status pill; State Patterns)  
PDF-first export, DOCX re-export after Emitido, a manual move back to Rascunho followed by a sheet touch, are all undefined.  
Fix: Provide (state, event) → state, marking automatic transitions and whether they override manual backwards moves.  
Status: **Open Question** — The Status pill row points to the Open Question; only the forward path and "backwards via Confirm dialog" are written.

**[Architecture]** — Sheet state vs Progress counter is inconsistent (§ EXPERIENCE.md § Conclusion control; State Patterns "Not tested"; Flow 5 step 1)  
The generator and the pre-issue list need one rule for "concluded".  
Fix: Concluída requires Progress = Completa; Não ensaiada is complete and not listed as "não concluída".  
Status: **Resolved in v0.2.0** — Both rules stated; Flow 5 lists the not-tested breaker separately from the unfinished TP.

**[Architecture]** — "Preenchido por" is overwritten on every autosave (§ EXPERIENCE.md § Sheet header; § Interaction Primitives)  
A one-tap fix by Eduardo re-attributes Bruno's sheet on the printed document.  
Fix: Store first-filled-by, last-modified-by and concluded-by; print concluded-by.  
Status: **Open Question** — Sheet header row and Open Questions record the question; the overwrite rule is unchanged.

**[Architecture]** — Inline registry creation offline has no dedupe rule; Atividade and Local registries missing (§ EXPERIENCE.md § Registries; § Combobox; § Caption composer)  
Two devices creating "Schneider"/"SCHNEIDER" need server-side merge and client-side reference rewriting; the caption grammar needs gender/number fields on registries that are not listed.  
Fix: Store Manufacturer, Voltage class, Atividade and Local by value on the sheet (registry = suggestion list, client UUID, server dedupe); reference by id only Instruments and Clients; add Atividade/Local registries with gender/number.  
Status: **Open Question** — The observable rule (one entry, every sheet still pointing at it) is stated and the mechanism handed to architecture; Atividade/Local seed lists and their registry rows remain in Open Questions.

**[Architecture]** — Point-of-attention photo references under "Editar texto" go stale (§ EXPERIENCE.md § Capture-to-Document row 8; § Point of attention card)  
A literal "Imagem 5" typed in free text goes stale when numbering changes between revisions.  
Fix: References are tokens resolved at generation; free text cannot embed numbers.  
Status: **Resolved in v0.2.0** — Photo references are tokens picked from the gallery; free text never embeds a literal number.

**[Architecture]** — "Removed block data recoverable until export" has no UI and no conflict rule (§ EXPERIENCE.md § Block Model rules; § Interaction Primitives Undo)  
After the 10 s toast nothing can recover it; purge "at export" is either rev-1 or every export; delete on device A vs edit on device B is unspecified.  
Fix: Soft-delete with tombstone, purge policy = architecture; delete-vs-edit surfaces as a conflict.  
Status: **Resolved in v0.2.0** — "Restaurar ficha removida" in the Laudo overview menu; deletion-vs-edit is a surfaced structure conflict; purge/retention handed to architecture.

**[Architecture]** — Photo chronological order across devices undefined (§ EXPERIENCE.md § Capture-to-Document row 7; Flow 4 step 4)  
Gallery picks carry EXIF time, not attach time; two devices need a deterministic tiebreak so re-exports never renumber.  
Fix: Sort key = (capture time: EXIF if present else device time, device id, local sequence), in America/Sao_Paulo.  
Status: **Resolved in v0.2.0** — Sort key stated in row 7; timezone assumption parked as an Open Question.

**[Architecture]** — Export is shown as a synchronous download (§ EXPERIENCE.md § Export dialog)  
120 pages + 80 photos + PDF layout will take tens of seconds to minutes; the dialog needs a progress/async pattern and a place for the finished file.  
Fix: Add "Gerando… pode fechar" + notification/toast, and the Revisões list.  
Status: **Resolved in v0.2.0** — Asynchronous generation with "Gerando revisão 2… pode fechar", Toast when ready, Revisões list.

**[Architecture]** — Project vs Client vs Site overlap (§ EXPERIENCE.md § IA Project; § Registries Clients)  
Three entities for two concepts; TAG scope and copy-on-create depend on which one is stable.  
Fix: Project ≡ Site of a Client, or drop Project.  
Status: **Open Question** — Listed in Open Questions with the TAG-scope dependency; the IA still has all three names.

**[Architecture]** — Two users on one device and user provisioning (§ EXPERIENCE.md § Login form; § Foundation Identity)  
Local queue and cached laudos must be namespaced per user; no surface creates users or resets passwords.  
Fix: State one-user-per-device-session with per-user local store; users seeded by the developer for the MVP.  
Status: **Resolved in v0.2.0** — Foundation states one user per device session and out-of-app provisioning; seeded users / password reset are an Open Question for architecture.

**[Architecture]** — "Salvar como template" from a laudo is undefined (§ EXPERIENCE.md § IA Template composer)  
Whether locations, TAGs and sub-block overrides are carried decides whether templates can hold a location skeleton.  
Fix: Define what is copied.  
Status: **Open Question** — Listed in Open Questions with the link to the "Sem local" mechanism.

### Low (23) — resolved 19 · open question 1 · not applied 3

**[Flow coverage]** — Field path "NC › Criar ponto de atenção" never exercised (§ EXPERIENCE.md § IA › Points of attention; Point of attention card; Flow 5)  
The field path "Checklist row NC › Criar ponto de atenção" is never exercised; Flow 5 creates points of attention in the office only.  
Fix: One step in Flow 2 after the NC observation, or drop the NC-row entry from IA if office-only is intended.  
Status: **Resolved in v0.2.0** — Flow 2b step 3 creates the point from the NC row's Overflow menu.

**[Token completeness]** — Breakpoints, rail width and inline thumbnail have no tokens (§ EXPERIENCE.md § Responsive & Platform; DESIGN.md § Layout & Spacing; § Components › Photo tile)  
Breakpoint values (768 / 1280) and the tablet rail width (320px) live only in EXPERIENCE.md; DESIGN.md names gutters without the breakpoints. The 64px inline photo thumbnail has no token beside `thumb-size: 96px`.  
Fix: Add `breakpoint-tablet`, `breakpoint-desktop`, `rail-width`, `thumb-inline` under `spacing` and cite them from both files.  
Status: **Resolved in v0.2.0** — All four tokens exist under `spacing` and are cited from § Layout & Spacing, § Responsive & Platform and the Photo tile row.

**[Component coverage]** — Avatar, overflow menu, quick chips and Sync status rows named but unspecified (§ DESIGN.md § Components › App bar, Block card, Observation field; EXPERIENCE.md § IA › Sync status)  
"avatar initial" (App bar), "overflow menu" (Block card), "Observações rápidas" chips (Observation field) and the "Sync status" list rows are named but unspecified.  
Fix: One line each in the parent row (size, tokens, keyboard) or a shared "Chip" and "Menu" row.  
Status: **Resolved in v0.2.0** — Overflow menu and Chip are full rows; the avatar has a 48px hit area; Sync status content is enumerated in IA and Offline & Sync.

**[State coverage]** — Cold open offline without session, empty Project, empty Instrument picker undefined (§ EXPERIENCE.md § State Patterns; § Component Patterns › Login form)  
"Cold open, no session, offline" is undefined; Login form says session persists but not what the form does with no network. Project with no laudos and an empty Instruments registry have no empty state.  
Fix: Three short rows.  
Status: **Resolved in v0.2.0** — All three rows added; the Login form row states the offline copy.

**[Visual reference coverage]** — 90 of 94 sheet PNGs referenced only as a folder (§ imports/extract-fo-serv-03.md § 2; DESIGN.md § Brand & Style)  
The extract's inventory lists sheets by subsection, not by image number, so a consumer cannot find "the TP sheet" without opening files.  
Fix: A 12-line index in `imports/extract-fo-serv-03.md` mapping image ranges to models (or the four named examples extended to one per model).  
Status: **Not applied** — The extract is unchanged since before the reviews and still names only four example PNGs; the update pass edited the spines only.

**[Visual reference coverage]** — WhatsApp reference screenshots absent from sources and imports (§ DESIGN.md / EXPERIENCE.md frontmatter `sources`)  
The 11 reference screenshots in `docs/context/WhatsApp Image 2026-09-18 *.jpeg` are the raw source behind `docs/concorrentes/extract-fotos-whatsapp.md` and the memlog lists them as confirmed sources, but neither `sources` nor `imports/` holds them.  
Fix: Add the glob to `sources` in both files (or copy into `imports/fotos-whatsapp/`).  
Status: **Resolved in v0.2.0** — The glob is the eighth `sources` entry in both spines.

**[Bloat & overspecification]** — Open Questions mixes UX questions with non-UX ones (§ EXPERIENCE.md § Open Questions)  
§ Open Questions (24 bullets) mixes UX questions with non-UX ones ("Who signs", "Which norm item backs each acceptance criterion", partnership-adjacent items) and restates DESIGN.md's assumptions.  
Fix: Keep UX-owned questions; move the rest to the memlog or the brief's Open Questions with a pointer.  
Status: **Not applied** — The list grew to 31 bullets in v0.2.0 because the update pass used it as the single parking place for every deferred decision; the non-UX items ("Who signs", norm items, billing signals) are still there.

**[Bloat & overspecification]** — Narrative in Flow 4 preamble and Inspiration bullets (§ EXPERIENCE.md § Key Flows › Flow 4; § Inspiration & Anti-patterns)  
Flow 4's unnumbered preamble and the Inspiration bullets carry narrative ("Bruno said the older GroundPRO version was nicer…") that EXPERIENCE.md prose should not; the fact is already an Open Question.  
Fix: Trim to the decision.  
Status: **Resolved in v0.2.0** — Flow 4 preamble is one sentence stating the rule (either split must work); the GroundPRO remark is reduced to a pointer to the Open Question.

**[Inheritance discipline]** — Inline "(memlog)" citations point to a file not in sources (§ DESIGN.md § Brand & Style and passim)  
DESIGN.md cites memlog decisions inline in several places; the memlog is not in `sources`. Harmless for humans, but a consumer resolving citations finds no target.  
Fix: Cite `.memlog.md` once in § Brand & Style or drop the inline "(memlog)" tags.  
Status: **Resolved in v0.2.0** — § Brand & Style and the EXPERIENCE.md intro name `.memlog.md` once as the decision log cited as "memlog".

**[Shape fit]** — DESIGN.md carries a ninth section "Open Questions" (§ DESIGN.md after § Do's and Don'ts)  
The spec's body is the eight sections only and neither example has it. Order is not broken, but a spec-driven parser drops it.  
Fix: Keep `[ASSUMPTION]` tags inline in the relevant sections and move the list to EXPERIENCE.md § Open Questions (which already mirrors two of them) or the memlog.  
Status: **Not applied** — § Open Questions is still the ninth section of DESIGN.md (now eight bullets); the update pass added to it rather than moving it.

**[Accessibility]** — F-21 State glyphs will be read literally by screen readers (§ DESIGN.md § Components › Laudo tree; Progress counter; Sync badge)  
"●" reads as "círculo preto".  
Fix: Glyphs and dots `aria-hidden="true"`; the word is the accessible text.  
Status: **Resolved in v0.2.0** — Stated in the Laudo tree and Sync badge rows and in § Accessibility Floor.

**[Accessibility]** — F-22 Unit and date accessible names unspecified (§ DESIGN.md § Typography; EXPERIENCE.md § Accessibility Floor)  
"MΩ" may be read as "M ómega"; "07/09 14:32" as "sete barra nove".  
Fix: Unit slot `aria-label` with the spoken unit; dates in `<time datetime>` with the year present.  
Status: **Resolved in v0.2.0** — Spoken units and `<time>` elements in § Accessibility Floor.

**[Accessibility]** — F-23 Abbreviations C / NC / NA have no visible expansion on tablet/desktop (§ DESIGN.md § Components › Tri-state control)  
AAA in WCAG, but a new hire or the office reviewer benefits.  
Fix: A one-line legend at the top of each checklist and full-word `aria-label` on each segment.  
Status: **Resolved in v0.2.0** — Legend "C Conforme · NC Não conforme · NA Não se aplica" heads each checklist in both spines.

**[Accessibility]** — F-24 Reduced motion covers drag and toasts only (§ EXPERIENCE.md § Accessibility Floor)  
Bottom-sheet/drawer slides, row expand on NC and the amber state transition on blur are still animated under `prefers-reduced-motion`.  
Fix: Extend the rule to those cases: instant.  
Status: **Resolved in v0.2.0** — Reduce-motion bullet lists drawer/bottom-sheet slides, NC row expansion and the out-of-limit color transition.

**[Accessibility]** — F-25 Theme switch is buried for the dim-cubicle case (§ EXPERIENCE.md § IA › Account)  
A light screen at full brightness in a dark cubicle is itself glare.  
Fix: Honour `prefers-color-scheme` on first run and expose the toggle one tap from any sheet.  
Status: **Resolved in v0.2.0** — Theme follows the system preference (memlog decision) with the manual override in Account, one tap from the App bar avatar.

**[Accessibility]** — F-26 Sync badge "compact" variant on Laudo card undefined (§ DESIGN.md § Components › Laudo card)  
If compact drops the word, it becomes color-only.  
Fix: Define compact = same dot + word in `meta`, or icon-only with `aria-label` and a visible word.  
Status: **Resolved in v0.2.0** — Compact = same dot + word in `meta`; never dot-only.

**[Accessibility]** — F-27 Reflow at 400% / 320 CSS px leaves little content height (§ EXPERIENCE.md § Accessibility Floor)  
App bar (56) + sticky bar (~72) + keypad can leave little content height (SC 1.4.10).  
Fix: Un-stick the action bar when viewport height < 480 CSS px.  
Status: **Resolved in v0.2.0** — Stated in § Layout & Spacing and § Accessibility Floor.

**[Architecture]** — Not-tested sheets: what prints and where (§ EXPERIENCE.md § Capture-to-Document rows 8–9)  
Print nameplate and checklist or only the reason band? Position among manual points in section 8?  
Fix: Print nameplate + reason band, no tables; list after manual points.  
Status: **Resolved in v0.2.0** — Row 8 states both.

**[Architecture]** — Section 11 sources: setup list vs instruments referenced by sheets (§ EXPERIENCE.md § IA Laudo setup; § Capture-to-Document row 11)  
"Instruments checked as used" in Laudo setup vs "every instrument referenced by any sheet".  
Fix: Union, with the setup list only pre-selecting the picker.  
Status: **Resolved in v0.2.0** — Row 11 states the union and the pre-selection.

**[Architecture]** — Storage-low detection and "photo kept in memory for one retry" (§ EXPERIENCE.md State Patterns "Storage low")  
Safari quota estimates are coarse; an in-memory photo dies with the tab.  
Fix: Keep the UX, let architecture pick the signal; on refusal try an immediate upload if online.  
Status: **Resolved in v0.2.0** — Threshold and mechanism marked architecture's call; immediate upload when online on refusal.

**[Architecture]** — Photo link target: sheet vs checklist row (§ EXPERIENCE.md § Checklist row; § Point of attention)  
The photo affordance on a row and the pre-link from a point of attention imply two different targets.  
Fix: Photo has laudo + optional sheet + optional row.  
Status: **Resolved in v0.2.0** — Stated in the Photo tile row.

**[Architecture]** — "Duplicar" a block with data and a TAG (§ EXPERIENCE.md § Block card)  
Duplicating a filled block with its TAG would create a second identity with copied data.  
Fix: Duplicate structure only, TAG blank.  
Status: **Resolved in v0.2.0** — Block Model rules: structure only, asks for a new TAG.

**[Architecture]** — Inter must be bundled for offline use (§ DESIGN.md § Typography)  
A font loaded from the network is absent on a cold offline open.  
Fix: Self-host or accept the fallback stack offline.  
Status: **Open Question** — DESIGN.md Open Questions leaves the choice (bundle vs. fallback) to architecture.

## Mechanical notes

- Token references: 141 brace references in DESIGN.md and 7 in EXPERIENCE.md all resolve; `{components.sync-badge}` and `{components.banner}` are object references and resolve.
- Non-brace token mentions: DESIGN.md's slash form (`rounded/sm`) is normalized to `{rounded.sm}` in v0.2.0; EXPERIENCE.md still uses backtick names (`label`, `ok`/`pending`/`offline`/`error`/`conflict`) that a brace-only resolver will not check.
- Colors: 27 light + 27 `-dark`, all 6-digit hex, no orphan dark tokens; v0.2.0 adds `toast-action`/`toast-action-dark`. `typography.value.note` is the only non-spec typography key (allowed). `letterSpacing` is now quoted.
- Component parity: DESIGN.md § Components and EXPERIENCE.md § Component Patterns keep the same names and order (36 rows each in v0.2.0); frontmatter keys map 1:1.
- Name consistency: the feminine/masculine agreement ("Não ensaiada" in tree rows, "Não ensaiado" on the chip) is now stated once in § Block Model so devs do not "fix" it. Laudo statuses identical across IA, Status pill and flows.
- Cross-references: all inline paths (`imports/…`, `.working/extract-research.md`, `reconcile-*.md`, four named PNGs) exist; section citations into the extracts match existing headings.
- Frontmatter: both files `version: 0.2.0`, `status: draft`, `updated: 2026-09-18`, identical eight-entry `sources` lists (the WhatsApp glob added); `design: ./DESIGN.md` resolves. Mermaid: none.
- Severity tally across the three reviews: critical 6 · high 14 · medium 33 · low 23 (76). Status in v0.2.0: 64 resolved · 7 open questions · 5 not applied.

## Reviewer files
- `review-rubric.md`
- `review-accessibility.md`
- `review-architecture.md`
