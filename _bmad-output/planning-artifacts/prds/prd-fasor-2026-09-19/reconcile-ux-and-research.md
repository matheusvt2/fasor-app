---
title: "Releng PRD — input reconciliation: UX spines and research"
status: working
created: 2026-09-19
scope: "Coverage check, not quality review. What the PRD and addendum dropped from extract-ux.md and extract-research.md."
---

# Input reconciliation — UX and research against the PRD

Sources checked in full: `.working/extract-ux.md` (519 lines), `.working/extract-research.md` (523 lines).
Targets: `prd.md` (1060 lines), `addendum.md` (163 lines).

Verdict vocabulary used below:
- **Covered** — reflected in an FR, an NFR, a Non-Goal, an Out-of-Scope row or an Open Question.
- **Declined well** — absent from the build, but named with a reason. This is a pass, not a gap.
- **Gap** — absent everywhere, or present with a different meaning than the source gives it.
- **Correctly nowhere** — belongs to the UX spines or to architecture; the PRD is right to be silent.

---

## 1. UX surfaces and screen/IA table — does every surface trace to an FR?

| Surface (UX §2) | FR trace | Verdict |
|---|---|---|
| Login | FR-6 | Covered, with one hole — see 1.1 |
| Home + Continue card | FR-21, FR-55 | Covered |
| Project | FR-15 | Covered |
| Laudo setup | FR-16, FR-71 | Covered |
| Laudo overview / tree | FR-17, FR-19, FR-20 | Covered |
| Template composer | FR-9, FR-10, FR-11, FR-12 | Covered |
| Templates | FR-9 | Covered |
| Block palette — field variant | FR-18 | Covered |
| Block palette — office variant (sections, 8 types, sub-block toggles from inside a sheet) | none directly; implied by FR-9/FR-11 | Thin, acceptable |
| Equipment sheet | FR-22 to FR-32 | Covered |
| Photo capture & gallery | FR-43 to FR-48 | Covered |
| Points of attention | FR-49 to FR-53 | Covered |
| Registries (Empresa, Clients, Instruments, Manufacturers, Voltage classes, Criteria) | FR-1 to FR-5 | Covered, except the Atividade/Local registries — see 1.2 |
| Export | FR-62, FR-72, FR-73, FR-74 | Covered |
| Sync status | FR-60 | Covered |
| **Account** | FR-8 only (photo location switch) | **Gap** — see 1.3 |

### 1.1 Login: session expiry while offline
UX: "session expired while offline → keep working, re-authenticate on next successful connection **before sync, without discarding the queue**." Cold open without session and offline → the Login form explains and does not spin.
PRD FR-6 says only "Sign-in requires connectivity; a session already established survives going offline for the whole job." It does not state what happens when the session expires mid-job, which is the data-loss-adjacent case. **Gap — belongs in FR-6 as a consequence.**
The UX's own open question (does a tap on a disabled offline "Entrar" attempt anyway) is UX-level: **correctly nowhere.**

### 1.2 Atividade / Local registries and caption grammar
UX §10 item 14 and UX Open Question 6: the context caption template is "Detalhe d⟨o/a⟩ ⟨atividade⟩ realizad⟨o/a⟩(s) n⟨o/a⟩ ⟨equipamento⟩ d⟨o/a⟩ ⟨local⟩", which **implies gender/number metadata fields on Atividade / Local / Equipamento registries**, plus seed lists (the current captions yield about 10 activities and 8 locations).
PRD FR-4 registers only manufacturers and voltage classes. FR-39 asserts the context caption is composed from equipment, location and activity; FR-46 offers "chips for recently used activities and locations" — implying a store that no FR creates. The seed lists are not in §13 Q7's "content Bruno has to supply".
**Gap — belongs in FR-4 (two more registries with grammar metadata) and in §13 Q7 (seed content).**

### 1.3 Account surface: PWA install, theme, storage-in-use
UX IA table for Account: name, professional registration, **theme (Sistema / Claro / Escuro)**, photo-location switch, **install on home screen**, sign out, **storage in use on this device**.
UX offline rules: "**PWA install is the mechanism for cold-open offline and durable storage**; the UX requires only the one-time install Banner ('Instale PRODUTO na tela inicial para usar sem conexão' with 'Instalar / Agora não', repeatable only from Account) and that the app keeps working uninstalled while online." UX §10 item 19 names "a PWA install surface and a storage-pressure model" as a capability a brief-level reading would miss, **because "never lose a photo" is the acceptance bar and iPadOS eviction is a named risk**.
PRD: zero occurrences of PWA, install-to-home-screen, or theme. FR-57 covers only the storage-low warning; the iPadOS eviction fact is pushed to architecture in an FR-57 `[NOTE FOR PM]` and in addendum §1.
This is the **user-facing half of the risk the addendum calls "the single largest technical unknown in the product"**: the mitigation Safari actually honours is installation to the home screen, and no requirement asks the product to prompt for it. SM-6 ("zero photos lost") is not achievable on iPadOS without it.
**Gap — the install prompt and its Account entry belong in an FR or in §9 as an NFR; the eviction mechanism correctly stays with architecture. Dark theme as a shipped requirement belongs in §9.**

### 1.4 Smaller surface-level drops
- **Section stepper** (Placa · Verificações · Ensaios · Conclusão with missing counts; "Concluir ficha" jumps to the first missing field) — UX-level detail, but the rule **"Concluir ficha requires Progress = Completa" and "Não ensaiada counts as complete and is not listed as não concluída at export"** is a requirement. FR-31 and FR-73 imply the second half; neither states the first. Minor gap in FR-32/FR-73.
- **Continue card target** ("the last sheet edited on this device, else the first incomplete sheet in tree order") — a defined behaviour, not styling. Minor gap in FR-21.
- **"Instrumentos stays the default Registries tab"**, mock inventory, prototype paths — **correctly nowhere.**

---

## 2. Interaction rules that are requirements, not styling

| Rule (UX §3, §5, §7) | PRD | Verdict |
|---|---|---|
| Autosave on every field change, no Save button, "Concluir ficha" marks state only | FR-1, FR-32 | Covered |
| Visually hidden debounced "Salvo" status, never per keystroke | absent | Minor gap (§9 accessibility) |
| Reorder three ways: hold 300 ms + drag · Overflow "Subir/Descer" · Alt+↑/↓; new position announced | FR-19 | **Covered well** |
| No swipe gesture except system back (gloves, glare) | FR-19, §9 | **Covered well** |
| Enter moves down a measurement column, Tab moves right, `inputmode="decimal"` | FR-27 | Covered |
| Enter on a focused suggestion confirms it and moves down | absent | Minor gap (FR-41) |
| **Clearing is a real control, never a re-tap**: "Limpar" in the row Overflow plus Delete/Backspace; re-tapping a selected segment does nothing, so a glove double-tap cannot un-mark a row | absent | **Gap** — a field-safety rule with a stated glove rationale; belongs in FR-25 |
| Dictation control hidden, not disabled, where the engine is unavailable | FR-40 | **Covered well** |
| Buttons disabled until valid with the reason as adjacent label text, never a tooltip; bulk actions disabled with their reason | FR-26, §9 | Covered |
| Destructive actions always route through a Confirm dialog, initial focus on Cancelar, red outline never red fill | FR-19 (confirmation named), rest absent | Partly covered; the rest is UX-level |
| Undo toast persistent ≥ 20 s, then "Restaurar ficha removida" until export (soft delete / tombstone, UX §10 item 8) | FR-19 | Covered |
| **Banner priority stack as a product rule**: one slot per surface, fixed priority conflict › draft found › suggestions ready › laudo exported › offline, the rest fold into a "+2" chip. UX §10 item 18 calls it a rule that "constrains every future notification feature" | absent (PRD uses the word "banner" twice, as isolated cases) | **Gap** — belongs in §9 as a cross-cutting NFR |
| Sync badge announces state transitions only, never counts | absent | Minor gap; partly implied by FR-60 |
| Progress counter: unconfirmed suggestions count as empty | FR-17, FR-41 | Covered |
| Banned list (carousels, infinite scroll, auto-decisions, pre-marked C, AI writes without a tap, modal choice before the camera, modal stacks > 1, color-only state, tooltip-only explanation, clear-by-re-tap, repeated explanatory lines) | most covered across FR-25, FR-41, FR-43, §6, §9, §12 | Covered except clear-by-re-tap (above) and hint-text discipline (UX-level) |
| Chip row of the 5 most recent values replaces a Combobox on field surfaces (manufacturer, activity, location) | FR-25 and FR-53 cover per-item and finding chips only | Gap — the general field-surface rule is a keystroke-budget mechanism, belongs in §9 or FR-23 |
| Sticky action bar above the keyboard, unsticks below 480px, focus never hidden | absent | **Correctly nowhere** (UX/mockup geometry) |
| Token values, type ramp, contrast ratios, shape radii, palette hexes | absent | **Correctly nowhere** |
| WCAG 2.2 AA floor; 48/56px targets; keyboard reorder; SR announcements; 40% disabled-opacity residual risk | §9 | Covered — note the PRD says **WCAG 2.1 AA** while both UX spines say **2.2 AA**. One-word discrepancy worth fixing (2.2 adds 2.4.11, 2.4.13 and 2.5.7, all of which §9 and FR-19 already rely on). |

---

## 3. The AI / assist contract (UX §4), rule by rule

**Fully carried:** backend-only processing · generated conclusion text and parecer summary are not AI calls and are excluded from the queue · offline queue semantics with "Foto guardada", the readiness toast, readings first in upload order, the later-opened-sheet banner and the Sync status counts · Suggestion rendering with source crop and per-field regions · "Confirmar todos" skipping "Verificar" · nothing unconfirmed written, counted or printed · typing discards that field's suggestion only · a filled field is never overwritten · crop reachable until export · SR announcement · OCR text-layer grounding (FR-37) · magnitude outliers at ≥ 100× as an amber hint, never a block (FR-28) · registry cross-check (FR-35) · copies and defaults are plain values with an undo toast, not suggestions (FR-34, FR-24) · no verdict auto-decided, Reprovado never suggested, Não apto never suggested · checklist never pre-marked C · out-of-limit amber, never red · vision proposing NC rows excluded from the MVP · context captions plain, vision captions suggestions, uncaptionable photos stay "Sem legenda" · dictation contract including hidden-not-disabled · volume drivers.

That is a strong carry. Three things did not survive intact.

### 3.1 NC observation drafting from the row's photo — dropped
UX §4 field-group table, "NC observation": "when the NC row has a photo, **LLM vision drafts one sentence on sync** ('Contatos fixos com sinais de aquecimento') as a suggestion"; confirmation is "'Usar' inserts the draft; typing keeps the engineer's text". UX queue order lists it as **assist #4 of 5**.
PRD §5.5 declares "**Four** assists" — nameplate, display, caption, identity — and FR-25 gives the NC row only chips and dictation. The only NC-and-vision statement in the PRD is FR-41's exclusion of **vision proposing NC rows**, which is a different capability (inferring the *state* of a row versus drafting the *text* of a row the engineer already marked NC).
**Gap, and the one place the PRD states the assist contract differently from the spine.** It changes scope (a fifth assist), the cost model in §11 (one more vision call per NC row), and the cut order in §7.2. Belongs in an FR, or in §7.2 as an explicit deferral naming it distinctly from the FR-41 exclusion.

### 3.2 Environment assists — partly dropped
UX §4 "Environment" row: "**Ler visor** on the thermo-hygrometer" and "**humidity above the threshold auto-offers the rain/humidity quick chip** (threshold is an open question)".
PRD FR-24 carries only "Copiar da cabine anterior" and the prefilled altitude. The thermo-hygrometer camera path and the humidity-triggered chip are absent, and the **humidity threshold open question** is absent from §13.
**Gap — small, but it is a named open question the UX moved forward for a decision.**

### 3.3 Build queue order for the assists
UX gives an explicit build queue (nameplate → display OCR → auto-captions → NC observation drafting → equipment identity) that deliberately inverts the brief. The PRD gives a **cut** order in §7.2 (cut FR-38 first, then FR-39) over a four-item list. Not a contradiction, but the sequencing decision the UX made under the 2026-09-18 mandate is not recorded.
**Minor gap — belongs in §7.2 beside the cut order.**

### 3.4 "Verificar" is settled in the PRD, pending in the UX
The UX lists "'Verificar' rendering as a second level of trust rather than a second color — **confirm with Bruno**" among design decisions pending. The PRD adopts Verificar in the glossary, FR-33 and FR-41 with no assumption tag and no §13 entry.
**Minor gap — an unflagged assumption on a load-bearing element of the AI contract.**

---

## 4. UX open questions — did §13 pick up the PRD-level ones?

### 4.1 The seven moved to the spines' Open Questions
| # | Item | PRD |
|---|---|---|
| 1 | Location depth (1 or 3 levels needed) | §13 Q13 + §12 assumption — **Covered** |
| 2 | Status (state, event) table | §13 Q2 — **Covered** |
| 3 | Sheet attribution semantics | §13 Q3 — **Covered** |
| 4 | Project vs Client vs Site | §13 Q4 — **Covered** |
| 5 | What "Salvar como template" carries | §13 Q5 — **Covered** |
| 6 | **Atividade / Local registries with gender/number metadata and their seed lists** + offline registry dedupe | Only the dedupe half is carried (FR-4 note, addendum §1). **Gap** — see 1.2 |
| 7 | Inter bundled vs fallback offline | addendum §1 — **Covered, right place** |

### 4.2 The five "not applied"
All five are artefacts of the UX review process except one, and that one is carried: the **40% disabled-opacity residual risk (2.04:1 fill)** is reproduced verbatim in §9 including the mitigation and the fact that it was kept against the accessibility review's recommendation. **Correctly handled.**

### 4.3 DESIGN.md open questions (visual)
Amber semantics across all "proposed" uses · dashed-border legibility under sunlight · 48px crop on a 390px phone · semantic inks to 7:1 · priority pill tones · dark scrim value → **correctly nowhere** (UX-level).
Glove sizing / one-handed use → §13 Q11 and §9. **Covered.** Inter, UI system → addendum §1. **Covered.**
Two are product-level and were dropped:
- **Whether the client's logo prints on the cover beside the company logo.** Not in FO.SERV-03; the reference tool prints only the provider's brand; the nearest competitor prints both. FR-1 and FR-63 are silent. **Gap — a document-content decision; belongs in §13 or as a line in FR-63.**
- **Watermark content** (razão social vs "Cópia controlada" vs an image). FR-1 says "optional watermark" without saying what it can contain; the addendum carries only the render question (DOCX as well as PDF). **Minor gap.**

### 4.4 EXPERIENCE.md — assumptions to validate with Bruno
Covered: field ergonomics (Q11) · photo order and timezone (§14) · the four Não ensaiado reasons, subtypes, quick chips, per-item NC chips (Q7) · dictation offline pack (Q8) · server-side generation (§14) · other devices' photos full size vs thumbnails (addendum) · P0–P4 scale (Q9) · council choice (FR-6) · Empresa field list (FR-1) · document control rows (FR-64) · photo stamp defaults and LGPD (FR-8, FR-47, Q12) · Rich text editor confined to the composer (FR-12).
Dropped:
- **Section 9 "Por local e tipo": where para-raios and cabos de entrada/saída print inside a cabine with *Agrupar por tipo* on — no example exists in the source document.** See 4.6 below; this is the most consequential of the dropped open questions.
- **Humidity threshold** (an engineering value) — see 3.2.
- **Whether "Ordem de campo" counts as "no restructuring" for Bruno** — bears directly on SM-4's acceptance test. Minor gap.
- **Certificate file types and size**; **whether councils other than CREA/CRT are needed** — minor, architecture and registry detail respectively.
- **Confirming one conclusion-text template's wording per block type against Bruno's past conclusions.** UX §10 item 12 says there are "eight to nine template variants to author". §13 Q7 lists the chips, subtypes and reasons as content Bruno must supply but omits the conclusion templates, which are the largest content dependency of the three. **Gap — belongs in Q7.**

### 4.5 EXPERIENCE.md — "design decisions pending (PRD-level)"
| Item | PRD |
|---|---|
| **Risk matrix** (categoria, risco, consequência potencial) **and NR-10 / NBR 5410 adequacy table** (tópico, requisito, referência, ação) as optional section blocks — **explicitly flagged "a PRD decision"** by name, in both the open-questions list and the `reconcile-media-reference-tool.md` rejected list | **Absent everywhere.** Not an FR, not a Non-Goal, not an Out-of-Scope row, not a §13 question. The string "5410" does not appear in the PRD or the addendum. **Gap — the single clearest one, because the UX named the PRD as the decider** |
| "Estudo de carga e demanda" and "Recarga veicular" as future report types | §13 Q15 covers the load study; **"Recarga veicular" is dropped**. Minor |
| Vision proposing NC rows | §7.2 + FR-41 — **Covered** |
| LGPD consent for sending client photos to an AI provider | §11 + §13 Q12 — **Covered well** |
| "Verificar" as a second level of trust — confirm with Bruno | see 3.4 — Minor gap |
| Who is the office reviewer | §13 Q14 — **Covered** |
| Checklist items and criteria editable per company | §13 Q6 + §7.1 — **Covered** |
| NR-10 text by execution date: data only | §7.1, §10, FR-66 note — **Covered** |
| Who signs; signature image and ART integration out of MVP | §6, §7.2 — **Covered** |
| Whether to ship a "Ver um exemplo" prefilled laudo for onboarding | Absent. Minor gap; a one-line Non-Goal would close it |
| Multiple report types | §6, §7.1, FR-15 — **Covered** |
| **Which norm item backs each acceptance criterion** (the source field exists; the content is an engineering decision) | §13 Q17 covers re-verifying editions and §10 covers the rule, but nobody is named as owing the mapping. Minor gap in Q7 |
| What Bruno preferred in the older GroundPRO | **Correctly nowhere** |
| A laudo-level always-visible summary in the Laudo overview header | Absent; FR-17 gives per-laudo progress only. Minor gap |
| **Same-day on-site summary for the client and invoice-readiness signals** — the UX notes it "because unrecorded elsewhere" | §3.1 acknowledges the billing pain; no Non-Goal and no §7.2 row. **Gap — small, but the UX explicitly handed it over for safekeeping** |
| Not adopted, not decided: TAP Nº ↔ TAP ATUAL consistency check | Absent. Minor gap |
| Client acknowledgement / acceptance signature | §6 Non-Goals — **Declined well** |
| **A 9th block type for Relé de proteção** | §7.2 "first addition after the MVP", with the FO.SERV-03 contradiction spelled out — **Declined well** |
| Seed lists for Atividade / Local chips | see 1.2 — **Gap** |

### 4.6 Section 9 grouping is specified as complete but is not
UX: with *Agrupar por tipo* on, groups print in the fixed order Seccionadoras › Disjuntores › TP+TC pairs › Transformadores e cabos de alimentação — **and the UX flags as an open assumption "where para-raios and cabos de entrada/saída print inside a grouped cabine (no example in the current document)".**
PRD FR-68 reproduces the four-group order and adds "empty groups are skipped", presenting it as settled. The reference job has **5 para-raios and 4 cabos de entrada**, and the seed template sets the flag **on** for 1° Subsolo and Geradores.
**Gap — FR-68 cannot be implemented for those two equipment types, and the question the UX raised was not carried into §13.**

---

## 5. Research implications 1–25 (extract-research §7): adopted, declined, or silent?

| # | Implication | PRD position | Verdict |
|---|---|---|---|
| 1 | Normative-reference entity resolving NR-10 by execution date; section 5 cannot be static; regression test across 2027-06-01 | §7.1 data-model-only, FR-66 `[NOTE FOR PM]`, §13 Q10, §10 | **Declined well** (the dated regression test itself is unmentioned — minor) |
| 2 | Action plan as structured data with the 10.7.11 fields | FR-49 to FR-52 | **Adopted** |
| 3 | Mandatory grounding block with curve points, soil condition and limit source | §7.2 with reason + §13 Q10 flagged as expiring | **Declined well** — the best-handled deferral in the document |
| 4 | Criterion as citable data: **reference (source + edition + table/item), criterion *type* (absolute · deviation between poles · vs previous test · vs plate or calculated · pass/fail · manufacturer), limit, unit**; versioned catalogue; no criterion without a declared edition | FR-5 stores **operator + value + unit + source** only | **Gap** — see 5.1 |
| 5 | Stable TAG with history per visit; show previous value, delta, previous date | FR-7 + §6 + §7.2 | **Declined well** |
| 6 | Mandatory measurement context (test voltage, current, duration, temperature, **insulation type**, humidity, soil condition); compute and store the 20 °C-corrected value, keep raw and corrected | §7.2 defers temperature correction and names the missing insulation-type field | **Declined well** |
| 7 | Instrument registry with calibration, **laboratory**, optional RBC, **owner-defined interval**; each measurement references its instrument; alert never block; do not require RBC | FR-3, FR-27, §10 | **Adopted**; the laboratory name and the owner's interval policy are not fields. Minor |
| 8 | PLH and authorized executor as distinct roles; record who executed each test | §7.2 with reason, FR-32 | **Declined well** |
| 9 | ART before start; ART ↔ OS link; monthly activity report for the ART múltipla; **attach the ART PDF to the laudo package** | FR-16 records the number; §6 declines ART filing. The **ART PDF attachment** and the ART ↔ OS link are silent | **Gap (partial)** — see 5.2 |
| 10 | **PDF traceable with version and hash, prepared for ICP-Brasil signing** even if the signature is out of scope; **retention ≥ 10 years for the laudo and the raw data**; frozen numbered revisions | Frozen revisions FR-62/FR-74 **Adopted**; §6 declines the *signature*; §10 states ten years as an **inference** but no requirement exists; addendum §1 hands retention to architecture without the floor | **Gap** — see 5.3 |
| 11 | FO.SERV-03 fidelity with sumário; PDF and editable DOCX | FR-62 to FR-70 | **Adopted** |
| 12 | Minimum sheets incl. relay and grounding; blocks for para-raios, **muflas/terminações, barramentos, painéis, sinalização**, thermography, oil | FR-22 (8 types incl. para-raio); §7.2 rows for relay, grounding, thermography, oil, functional test, surge-arrester and cable-termination blocks | **Declined well**, except **barramentos, painéis and sinalização**, which appear nowhere — while addendum §5 claims gap 3 as "C/NC/NA across the whole substation including equipment outside the competitor's six types". Minor gap |
| 13 | "Awaiting laboratory result" state; attach later; re-issue as a new revision | SM-1 exclusion, §7.2, addendum §6 | **Declined well** |
| 14 | Thermography block, narratively before de-energization | §7.2, addendum §6 | **Declined well** |
| 15 | Functional / commissioning closing test | §7.2 | **Declined well** |
| 16 | Configurable concessionaire registry | §7.2, addendum §6 | **Declined well** |
| 17 | **Never encode "anual"; the carrier is a "próxima intervenção recomendada" field with a date and the PLH's justification, feeding the 10.7.11 schedule; periodicity configurable per contract** | §10 adopts the finding as evidence; addendum §6 restates the rule verbatim — **and FR-50 sets P4 "Próxima manutenção" to 365 days, with Flow 5 calling it "the next annual visit". The field the research names does not exist** | **Gap and contradiction** — see 5.4 |
| 18 | As-found / as-left as two values of one measurement; de-energization and re-energization checklists versioned by the applicable NR-10; **PT / AR attachable with traceability** (date, shift, people, authorizations, impeding conditions) | As-found/as-left §7.2 **Declined well**; versioned checklists partly via FR-66 + Q10; **PT / AR is silent everywhere** | **Gap (partial)** — see 5.5 |
| 19 | Offline-first, zero photo loss, idempotent sync, per-item visible state, explicit acceptance tests, photo cap above the competitor's 300 | FR-54 to FR-57, SM-6, §9 | **Adopted in full**, including the 300 benchmark and the three named acceptance tests |
| 20 | Pre-issue list that warns and does not block, incl. **missing ART**, tests not performed, expired calibration, missing required photo, **criterion without a source** | FR-73 covers eight rows; **missing ART/TRT and criterion-without-source are not among them**, nor are the UX's "points of attention without action" and "missing document-control values" | **Gap (partial)** — see 5.6 |
| 21 | Tablet/iPad primary; confirm responsive web suffices; office does the final assembly | §12, §6 | **Adopted** |
| 22 | Keep nameplate AI and Bluetooth out of the MVP | Bluetooth declined (§6); nameplate AI **reversed** by the 2026-09-18 mandate, with the reversal recorded in addendum §2 | **Declined well** — a model example of an explicit, sourced reversal |
| 23 | Treat as an internal tool first; instrument the product to measure hours per laudo from v1 | SM-8 | **Adopted** |
| 24 | **Res. CONFEA 345/1990 nomenclature**: "laudo" only where a habilitated professional gives conclusions; the raw field document is a "relatório de inspeção/ensaio"; reflect this in generated titles and in the UI | Silent. "345" appears nowhere; §10 never cites the resolution; the glossary defines "Laudo" as the object from Rascunho onward | **Gap** — see 5.7 |
| 25 | Sales arguments that hold and the three that do not | §6 final Non-Goal names all three by name | **Adopted in full** |

### 5.1 FR-5's criterion shape is narrower than both the research and §10 require
The research calls the criterion entity "the pillar of the data model" and specifies four attributes plus an **edition** and a **criterion type**. FR-5 stores operator + value + unit + source, and asserts "A criterion compares in the direction its operator states" — a shape that can express only absolute pass/fail. Roughly half the domain's real criteria are relative (winding resistance within 2% of the previous visit, PI against history, deviation between adjacent poles > 50%, fuse spread ≤ 15%, ratio ± 0,5% against the calculated value); addendum §6 acknowledges this for the future but no FR reserves room for it.
Separately, §10 states the rule "**No criterion may be encoded without its edition declared**" — and FR-5 has no edition field, only a free-text source string whose seeded value is "aceitável na ficha".
**Gap — the PRD adopted the principle and quietly narrowed the data model. Belongs in FR-5 (an edition field, and a criterion-type discriminator even if the MVP implements only the absolute case).**

### 5.2 The ART PDF is never attached to the package
Two independent public tenders and the leading competitor's export (a ZIP carrying the ART and certificate originals) converge on the ART travelling with the laudo. The PRD prints an ART/TRT **number** and a validity echo line, and §11 Certificados attaches only instrument calibration certificates. Nothing declines the ART attachment.
**Gap — belongs either in FR-70 (widen the attachment set) or in §7.2 as a declined row.**

### 5.3 ICP-Brasil readiness and the retention floor
Two distinct things are collapsed in the PRD. §6 declines **digital signature as a feature** — correct and well argued. The research's point is different: the output must be **"PDF íntegro e rastreável, com versão e hash, preparado para assinatura ICP-Brasil"**, because the laudo becomes part of a client's PIE and NR-01 item 1.6.2 asks for ICP-Brasil on NR documents. That is a format constraint that is cheap now and expensive to retrofit, and the PRD neither adopts nor declines it.
Likewise **retention ≥ 10 years for the laudo and the raw data**: §10 reports the ten-year civil prescription as an inferred floor, and the addendum hands "retention and purge of removed-block data and past revisions" to architecture — **without the floor**, so architecture could legitimately choose a shorter one.
**Gap — the format constraint belongs in FR-62 or §9 Traceability; the ten-year floor belongs in §9 and in the addendum's architecture item.**

### 5.4 "Annual" is encoded in exactly the place the research forbids
Research #17 and addendum §6 both say, in the imperative: *"Never encode 'anual' anywhere. The field that carries this is 'next recommended intervention' with a date and the professional's justification, which then feeds the 10.7.11 schedule."*
FR-50 sets **P4 "Próxima manutenção" = 365 days**, and Flow 5 in §3.3 describes P4 as filling "the next annual visit". No FR anywhere creates a "próxima intervenção recomendada" field. §13 Q9 asks whether the P0–P4 scale is right but frames it as inherited from the reference tool, not as colliding with a regulatory finding the PRD itself adopted in §10.
The consequence is not cosmetic: the 10.7.11 compliance schedule — the product's named legal differentiator — has no field for the professional's own recommended interval and justification, while it does have a hard-coded 365-day default the research says has no normative basis.
**Gap and internal contradiction — the missing field belongs in FR-49/FR-16; the collision belongs in §13 Q9.**

### 5.5 PT / AR (permissão de trabalho, análise de risco)
The new NR-10 makes the work permit a per-shift record "arquivada de forma a permitir sua rastreabilidade", with the people involved, the authorizations, the date and the impeding conditions; the research's field-flow table lists it as a mandatory record of the same job the laudo documents. The PRD has no FR, no Non-Goal, no Out-of-Scope row and no Open Question for it.
**Gap — most likely a §7.2 row, not a feature; but silence is the failure mode here.**

### 5.6 Three pre-issue rows dropped
FR-73's list says "at minimum", so this is an omission rather than a contradiction. Still, **missing ART/TRT number** is the leading competitor's first pre-issue row, and the PRD prints "Este laudo tem validade apenas acompanhada da ART_…" — a laudo generated with an empty ART number prints a validity clause pointing at nothing. **Criterion without a source** is the row that protects FR-5's whole premise.
**Gap — belongs in FR-73's enumerated list.**

### 5.7 Laudo versus relatório de inspeção
Res. CONFEA 345/1990 (read from a mirror, *não verificado*, so the PRD is right not to state it as firm law) distinguishes laudo from vistoria and perícia, and the research asks the product to reflect this "nos títulos gerados e na UI". The PRD calls the object a Laudo from the Rascunho state onward, including while it is still raw field capture, and §10 never mentions the resolution.
The cost of adopting is a sentence; the cost of ignoring is a naming question raised in an audit of a document whose §10 is otherwise scrupulous about regulatory language.
**Gap — belongs in §10 as a qualified note, or in §13 as a question. Given the source's own low confidence, declining it with that reason is also an acceptable outcome; silence is not.**

---

## 6. Regulatory confidence — does §10 preserve the research's qualifiers?

**Preserved correctly:**
- Effective date, 10.7.11 text and the seven steps of 10.13.1 as **verified** — matches D[3][4][5].
- Pre-2027 text from a mirror, **medium-high** — matches the research's "*não verificado, confiança média-alta*".
- ABNT texts read from unofficial copies, stated as a risk for a document that goes to audit — matches.
- NETA MTS-2019 vs 2023, NBR 10576 2006 vs 2017, IEC 62271-1, the announced NBR 14039 revision — all carried as **unverified**, with "no criterion may be encoded without its edition declared".
- The unsourced `> 400 MΩ` — carried in §10, the glossary, FR-5 and addendum §4, each time as unsourced.
- PRODIST / REN 1.000/2021 as **an unresearched gap**, with "there may be a utility-side requirement nobody has looked for" — exactly the research's framing, including the instruction not to invent a requirement from it.
- CONFEA × CFT as **disputed**, with the product taking no position.
- INMETRO on calibration as **verified**; no RBC required.
- Retention: "no normative retention period exists… ten years, which is the **inferred** floor".
- The three forbidden marketing claims in §6, each at the right strength: insurers (unproven market claim), NBR 14039 annual (false), 10.15.4 d (**refuted outright**).
- §11's evidence paragraph reproduces the competitive scoreboard exactly — 5 verified, 23 unverified, 2 disputed, 2 refuted, no product ever used with a login — and tells the reader to read every market claim at that strength.

That is a careful §10. Two places overstate.

### 6.1 NBR 14039 7.1.5 is tiered as "Firm, verified" on an unofficial copy
§10 lists under **Firm, verified**: "No norm defines the format of a preventive maintenance laudo. NBR 14039 requires an explicit laudo only at final verification of a new or altered installation."
The research reads NBR 14039 **"em cópia licenciada não oficial D[7]"**. The adjacent claim (8.2.1 periodicity) *was* independently verified by a technical commentary D[8]; **7.1.5 was not**. The PRD's own "Uncertain" block then says "ABNT texts were read from unofficial copies", which contradicts the tier it just assigned.
**Gap — move the 7.1.5 claim to "Uncertain", or annotate it, and keep the 8.2.1 claim where it is.**

### 6.2 "Two competitors read instruments over Bluetooth" is stated as settled
§1 Vision and §2 Why Now both state it flatly, and §6 uses it to justify declining Bluetooth ("Two competitors have it and it does not decide the quality of the document").
The research says: Mesh's Megabras integration is **EM DISPUTA** — the privacy policy restricts Bluetooth to the megôhmetro, the announced "14 models at launch" is unconfirmed, and the Megabras site does not mention Mesh; Minipa's Bluetooth covers **multimeters, clamps and thermometers**, which are not MV test instruments at all.
The conclusion (decline Bluetooth) survives either way, so the decision is safe — but the premise is laundered from disputed to settled in three places, and it is one of the two facts §2 uses to argue that sync reliability has become table stakes.
**Gap — one qualifying clause in §2 and §6 fixes it.**

### 6.3 Adequately hedged, no action
- Mesh's report sections, the pending sumário and the "does not record calibration" declaration are all **medium-confidence readings of public minified code** ("ausência em código minificado não prova ausência no produto"). §2 and the addendum state them plainly, but §11's blanket instruction to read every market claim at the stated strength covers them. Acceptable.
- §5.7's "on the evidence available, no MV competitor offers it on the cabine" mirrors the research's own "conclusão baseada em ausência". Correctly hedged.
- NBR 5419 and the contested Bombeiros/IT 41 claim are absent from §10. SPDA and AVCB are not load-bearing for this MVP and the research marks both as low confidence. **Correctly left out.**
- The R$ 100–300/month anchor is used in SM-8 and §11 with the research's "low confidence, do not plan against it" attached. Correct.
- CAC and churn benchmarks appear only in addendum §5 with "the research itself says not to plan with them". Correct.

---

## 7. Things correctly left out — recorded so they are not re-litigated

- Every token value, hex, type ramp, radius, breakpoint and measured contrast ratio from DESIGN.md. These belong to the UX spines and the PRD says so in §0.
- Mock inventory, prototype screen list, mock-vs-spine drift, and the mock placeholder data (Rafael Lamonde, sample CNPJs, the fourth instrument "5A").
- The 76-finding validation tally and its three review lenses.
- Sticky-action-bar geometry, scroll-padding, focus-ring offsets, `prefers-reduced-motion` details.
- Architecture items: storage engine, autosave debounce, sync trigger, PWA vehicle, conflict detection mechanism, upload concurrency, AI provider and cost per reading, dictation engine, PDF renderer, ToC engine, session lifetime, registry dedupe, Inter bundling. All are in addendum §1, which is the right home.
- SPDA / NBR 5419 periodicity claims, DGA limits, the Bombeiros IT 41 claim, UK market analogues, CAC and churn benchmarks, competitor-by-competitor pricing detail — either out of scope or correctly confined to the addendum.
- "What Bruno preferred in the older GroundPRO", the unindexed 90 sheet PNGs, the offline-login tap question.

---

## 8. Ranked gap list

Most consequential first.

1. **Risk matrix and the NR-10 / NBR 5410 adequacy table.** UX EXPERIENCE.md open questions and `reconcile-media-reference-tool.md`, both flagging it "a PRD decision" by name. Absent from every part of the PRD. → **PRD** (§5.7 as optional section blocks, or §7.2 with a reason).
2. **"Próxima intervenção recomendada" missing while FR-50 hard-codes a 365-day "Próxima manutenção".** Research §7 #17 and addendum §6, both saying never to encode "anual". → **PRD** (FR-49/FR-16 for the field, §13 Q9 for the collision).
3. **No requirement for the PWA install prompt or its Account entry**, although the UX names installation as the mechanism for durable offline storage and the addendum calls iPadOS eviction the largest technical unknown. SM-6 depends on it. → **PRD** (FR or §9). The eviction mechanism itself correctly stays in the addendum.
4. **NC observation drafting from the row's photo is dropped from the assist contract.** UX §4 field-group table and build queue item 4 of 5; the PRD says "four assists" and carries only the unrelated exclusion of vision proposing NC rows. → **PRD** (an FR, or an explicit §7.2 deferral distinct from the FR-41 exclusion).
5. **FR-5's criterion shape cannot carry an edition or a relative criterion**, though research #4 specifies both and the PRD's own §10 forbids encoding any criterion without a declared edition. → **PRD** (FR-5), with the relative-criteria catalogue staying in addendum §6.
6. **Section 9's grouped print order is incomplete**: para-raios and cabos de entrada/saída have no defined position when *Agrupar por tipo* is on, which is on for two cabines in the seed template. The UX flags it as an open assumption; FR-68 presents the order as settled. → **PRD** (FR-68 and §13).
7. **Calculated measurement cells and pt-BR numeric parsing.** UX §10 items 15 and 16: absorção = R1min/R30s, polarização = R10min/R1min, valor calculado = Vp/Vs, condição = SATISFATÓRIO within tolerance, computed live and printed; and the thousands-separator rule with the echoed parse before comparison, which the UX calls "a safety feature, not a locale detail — without this the app reproduces the 1000× error it was built to prevent". The PRD has the columns in the glossary and one line in §9 Localization, but no FR makes the app compute or parse. → **PRD** (FR-27; the SATISFATÓRIO computation also needs squaring with "the app never converts a failing value into a verdict").
8. **Two regulatory claims stated above their evidence.** NBR 14039 item 7.1.5 sits under "Firm, verified" although the research read it only from an unofficial copy, while §10's own "Uncertain" block admits that; and "two competitors read instruments over Bluetooth" (§1, §2, §6) is presented as settled where the research marks Mesh's Megabras integration **EM DISPUTA** and Minipa's Bluetooth as covering only multimeters, clamps and thermometers. → **PRD** (§10 tiering, and one qualifying clause in §2 and §6).

Next in line, below the cap: Atividade/Local registries with gender/number metadata and their seed lists (UX OQ 6); the ICP-Brasil-ready output format and the ≥ 10-year retention floor (research #10); the banner priority stack as a cross-cutting rule (UX §10 item 18); the "clearing is never a re-tap" glove rule (UX §7); PT/AR attachment (research #18); the three dropped pre-issue rows including a missing ART (research #20, UX §10 item 20); Res. 345/1990 naming (research #24); session expiry while offline (UX §3); the eight to nine conclusion-text templates as content Bruno owes (UX §10 item 12); the client logo on the cover (DESIGN.md OQ); the same-day on-site summary and invoice-readiness signals (EXPERIENCE.md OQ); WCAG 2.1 in §9 against 2.2 in both spines.
