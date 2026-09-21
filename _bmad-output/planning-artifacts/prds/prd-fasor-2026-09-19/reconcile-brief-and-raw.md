---
title: "Reconciliation — PRD + addendum against extract-brief and extract-raw-sources"
created: 2026-09-19
purpose: "Coverage check, not quality review. What the two source extracts contain that the PRD and addendum do not reflect anywhere."
inputs:
  - prd.md
  - addendum.md
  - .working/extract-brief.md
  - .working/extract-raw-sources.md
---

# Reconciliation: what the PRD dropped from its sources

Method: every `[MVP]` line of the brief's capability inventory (extract-brief §5) walked item by item; every `R-T1`–`R-T18` (extract-raw §4) traced to a landing place; FO.SERV-03 structure (extract-raw §1–§2) checked against the generation FRs (FR-62 to FR-70); the brief's §12 qualitative section walked bullet by bullet; confidence tags and numbers compared.

Verdict column: **PRD** = belongs in prd.md · **ADD** = belongs in addendum.md · **NONE** = correctly left out.

---

## A. Capability inventory — `[MVP]` items with no FR

Walked in the brief's own order. Only misses and partial misses are listed; everything not listed here landed cleanly.

### A1. "Photo object … reused in the gallery **and as thumbnails next to each test table**" — the document half is missing. **PRD**

The brief marks this `[MVP]`. extract-raw R-T6 states it as a requirement to **change** the output format, not reproduce it, with the partner's own words (00:27:24):

> "Nessa estrutura não cabe uma foto aqui dentro. … **Isso eu acho ruim.** … eu queria ter a foto aqui embaixo, uma coisa para o cara saber."
> Matheus: "É só colocar adicionar foto…" Bruno: "**Adicionar foto e legenda, beleza.**"

Where it lands in the PRD: FR-44 says "The same photo is reachable from the gallery and from the equipment it belongs to" — that is the **app** surface. §5.6's description asserts "shows it in both places". But **FR-68**, which enumerates exactly what a section-9 sheet prints (title, attribution, conclusion pair, conclusion text, criteria line, sub-blocks, values with units), **does not list photos**. FR-67 prints photos in section 7 only.

So the single structural improvement the design partner asked for by name is stated in a feature description and in no requirement. Note that FR-68's headline rationale — "this is the change that lets a photo sit beside its equipment" — is the justification for native tables, which makes the omission a self-contradiction rather than a scoping choice.

### A2. Nameplate field lists, checklist item lists and measurement-table headers — counts only, no content. **ADD**

Brief `[MVP]`: "Equipment data fields: TAG, manufacturer, serial no., manufacture date, rated voltage/current, extinction medium (SF6/oil), drive type." extract-raw §2.4–§2.12 gives every list verbatim.

The PRD gives **counts** (FR-22: "9 nameplate fields", "14 items", "15 items") and names four fields in passing (AJ. RELÉ 50/51, Relação, Exatidão, plus the measurement shapes in the glossary). Nowhere in the PRD or addendum is there:

- the seccionadora nameplate list: `IDENTIFICAÇÃO`, `FABRICAÇÃO`, `Nº SÉRIE`, `TAG`, `TIPO`, `MEIO DE EXTINÇÃO`, `TENSÃO DE PLACA`, `CORRENTE NOMINAL`, `ACIONAMENTO`, `DATA DE FABRICAÇÃO`;
- the disjuntor list adding `VOL. ÓLEO`, `CAPACIDADE INTERRUPTOR`, `TENSÃO NOMINAL`, `AJ. BOBINA`, `AJ. RELÉ 50/51`;
- the TP/TC/transformador list: `TIPO DE ISOLAÇÃO`, `POTÊNCIA NOMINAL`, `TAP ATUAL`, `TENSÃO NOMINAL AT`, `TENSÃO NOMINAL BT`, `LIGAÇÃO SECUNDÁRIA`, plus `RELAÇÃO` and `EXATIDÃO` on TC;
- the 14 seccionadora checklist items, the 15 disjuntor items, the shared 15-item TP/TC/transformador list, the 5-item cabos list (`LIMPEZA`, `MUFLA`, `CONEXÕES`, `ATERRAMENTO CORDOALHAS`, `FIXAÇÃO`) and the 5-item para-raio list;
- the insulation table's real column grammar — `PONTO DE ENSAIO/CONEXÃO` split into `LINHA | TERRA | GUARD`, then `VALORES (MΩ)/(GΩ)` split into `30 SEGUNDOS | 1 MINUTO | ESTAB./10MIN`, then `QUALIDADE ISOLAÇÃO` split into `ABSORÇÃO | POLARIZAÇÃO`. The PRD's glossary reduces this to "phases × massa", which loses the three-point connection triple that each row actually records;
- `CARACTERÍSTICAS DA SE` → `TIPO DE SE` is a **select-one of three**: `SIMPLIFICADA - POSTE | ALVENARIA - CONVENCIONAL | BLINDADA`. FR-24 says "the substation type" with no pick list.

FR-22 is the largest single FR in the document and is not buildable from the PRD. This is seed content and probably belongs in the addendum or a referenced seed-data file rather than the PRD body, but today it is in neither.

### A3. Acceptance criterion record drops **edition** and **table**. **PRD**

Brief `[MVP-model-only]`: "Acceptance criteria as data with their source (**norm, edition, table**, limit, unit)"; constraints §7 repeats "source, edition, table, comparison type, limit, unit". FR-5 stores "operator, value, unit and source" with source as a single string. Yet PRD §10 states, as a firm rule, "**No criterion may be encoded without its edition declared**" and Q17 lists four editions to re-verify. The field that would carry the edition does not exist in FR-5.

### A4. Instrument record drops lab, RBC accreditation and owner-defined interval; and `RBC` is the printed label. **PRD**

Brief: "Instrument record fields: certificate, date, **lab**, **RBC optional**, **owner-defined interval**." FR-3 records code, name, manufacturer, type/model, serial, certificate number, calibration date, validity date, file and default test parameter. The three dropped fields matter because PRD §10 rests calibration policy on "INMETRO is explicit that the interval is set by the instrument's owner" — an owner-set interval with no field to hold it.

Separately, extract-raw §2.3 shows the printed sheet label is literally `RBC:` (and `INSTRUM./FABRIC.` merges instrument name and manufacturer into one printed cell). FR-3 and FR-68 use "certificate number", so the generator has no mapping to the printed label.

### A5. Grounding as checklist items today — never stated. **PRD**

Brief `[MVP as checklist]`: "Grounding as checklist items only (e.g. 'Aterramento', 'Aterramento cordoalhas') — no dedicated sheet." extract-raw confirms `ATERRAMENTO` on the para-raio, seccionadora and TP/TC/transformador lists and `ATERRAMENTO CORDOALHAS` on the cabos list.

The PRD's §7.2 row and Q10 present grounding as simply absent from the MVP. It is not absent: it is covered as C/NC/NA items, and only the *measurement sheet* is deferred. Stating this makes Q10 a narrower question than the PRD currently makes it look.

### A6. Relay 50/51 `[MVP as field]` — half carried. **ADD**

FR-22 carries the `AJ. RELÉ 50/51` nameplate field. The brief also names the paired checklist item; extract-raw §2.7 shows it as disjuntor item 14, `RELÉ DE ACIONAMENTO SECUNDÁRIO OU PRIM.`. Only relevant once A2 is fixed.

### A7. "Next recommended intervention" with the professional's justification. **NONE / ADD**

Tagged `[REF/domain]`, not `[MVP]`, so correctly out of the FRs. Carried in addendum §6 ("Periodicity is nobody's constant"), which says it "then feeds the 10.7.11 schedule" — a forward commitment with no §7.2 row. Fine as is; noted only so it is not rediscovered.

### A8. Everything else in the inventory landed

Project→N reports (FR-15), report type (FR-15), blocks with their checks and tests (FR-22), quantities upfront (FR-10), field additions (FR-18), office pre-fill (FR-16), instrument by code (FR-3), manufacturer and voltage-class registries (FR-4), client block fields (FR-2/FR-16/FR-63), multi-tenant and multi-type model (§7.1), TAG (FR-7), NR-10 by execution date (§7.1), per-sheet capture (FR-22 to FR-32), C/NC/NA (FR-25), all three test captures (FR-27, glossary), test environment (FR-24), per-sheet conclusion (FR-29), progress counter excluding suggestions (FR-17), the four assists in build/cut order (FR-33/36/39/38, §7.2), suggestion UX (FR-41), offline queue (FR-42), failure handling (FR-42), smart defaults (FR-34, FR-24), bulk actions (FR-26), photo object and gallery (FR-44/45), photo record layout (FR-67), points of attention by number (FR-48/49), P0–P4 (FR-50), DOCX in FO.SERV-03 layout (FR-62), TOC (FR-65), the 11 sections (FR-63 to FR-70), header/footer (FR-63), branding (FR-1), document control (FR-64 — but see D3), CRT/TRT (FR-6), offline and sync (FR-54 to FR-61), draft recovery (FR-61), the storage risk gate (addendum §1), calibration recorded and never blocking (FR-3), certificates annex (FR-70), web-only platform (§12), and every `[OUT]` and `[VISION]` line (§6, §7.2).

---

## B. R-T1 – R-T18, one by one

| Item | Lands | Note |
|---|---|---|
| R-T1 laptop out of the field | §12, §1, addendum §7/§8 | Carried, and C7 (present vs. target state) is recorded. |
| R-T2 no paper at all | §6 non-goal, addendum §2 | Carried, with the builder-origin caveat. |
| R-T3 block materialises the whole sheet | FR-22 final consequence | Carried. |
| R-T4 instrument code fills the whole header | FR-3 | Carried, **with a deliberate divergence**: R-T4's auto-filled set includes `ACEITÁVEL` (the criterion); FR-3 explicitly excludes it and routes it to FR-5. The PRD states the split. Correct. |
| R-T5 pick-lists, not a spec database | FR-4, §6, addendum §2 | Carried. |
| R-T6 photos inside the equipment sheet | **partial** | See A1. App side yes, document side no. |
| R-T7 photo gallery, process-ordered | FR-45, FR-67 | Carried as capture-chronological; extract-raw §1.10 shows the real order is process order per location, which capture time reproduces. Fine. |
| R-T8 add an item on the spot | FR-18 | Carried, with the quote in addendum §7. |
| R-T9 two authoring modes | FR-9/FR-16/FR-18, addendum §8 C4 | Carried. |
| R-T10 Project → N reports | FR-15 | Carried; the "Ambev" example survives as a quote. |
| R-T11 multiple report types | §7.1, §6, addendum §7 | Carried, including "Não … vai ter que ter tipo" as a verbal tic (addendum §8). |
| R-T12 nameplate photo → auto-fill | FR-33 | Carried — **except the second half**, see B-note below. |
| R-T13 structured in, structured out | SM-1, addendum §7 | Carried. |
| R-T14 output must be Word | FR-62 | Carried. |
| R-T15 approve/reject **and why** | **partial** | FR-29 sets the pair; FR-30 generates text. Nothing makes the reason obligatory on Reprovado or Com restrições, and the sheet's printed wording is `COM RESTRIÇÕES (ver observações)` — an explicit pointer from the conclusion to the sheet-level `OBSERVAÇÕES` block. The PRD has no FR for the sheet-level observations box at all (it appears only as a glossary sub-block example and a §7.1 list item), so the pointer has no target. **PRD.** |
| R-T16 points of attention reference a photo number, entered live | FR-48, FR-49 | Carried. |
| R-T17 competitive/time pressure | §2 | Carried. Matheus's same-day prototype commitment is correctly dropped. |
| R-T18 cloud save and draft recovery | FR-55, FR-61 | Carried. |

**B-note — R-T12's second half is missing. PRD.** extract-raw R-T12 records, from the competitor demo: "automatic capture of humidity/ambient readings from a photo of the instrument display ('ele bateu pra pegar a umidade e tal, olha lá, ele já preencheu automático') — **which maps to the `AMBIENTE DE ENSAIO` block (temperatura, umidade relativa)**."

In the PRD, FR-36 scopes camera display reading to "any Measurement table". The `AMBIENTE DE ENSAIO` block is not a Measurement table — it is FR-24, whose only assist is "Copiar da cabine anterior" plus typing. So the one block where the source explicitly observed a camera assist working is the one block left to the keyboard. Given the PRD's own mandate, this is a coverage hole rather than a deliberate cut, and nothing in the PRD says it was considered.

---

## C. FO.SERV-03 structural facts the generation FRs would need and do not state

Beyond A2 (field and item lists), from extract-raw §1 and §2:

**C1. Cover table rows are not named. PRD.** FR-63 says "The cover carries the client data table"; FR-16 says "cover data". The real rows (extract-raw §1.2) are `Cliente:`, `Cidade/local:`, `Data da execução do serviço:`, `Informações adicionais:`, `Responsável:` in a 4-column label/value grid. The brief lists the same set as an `[MVP]` capability ("client, city/site, execution dates, additional info, responsible person"). Note also that `Responsável` on the cover (Rafael Lamonde) is the signing engineer of record, distinct from whoever filled the sheets — which is exactly the attribution question Q3 raises, unconnected to it today.

**C2. Heading rendering. ADD.** Every numbered level-1 heading is a **single-cell shaded table** containing auto-numbered heading text; `9.1`–`9.11` are Word `Título 2` paragraphs. A renderer that emits plain headings does not reproduce the layout, and FR-65's TOC depends on the outline levels.

**C3. Footer is four centred lines with `Página <N> de <Total>` on the fourth. ADD.** FR-63 says "the company identification lines and 'Página X de Y'". The exact shape (four lines: razão social / address / phone+email / website + pagination) is what FR-1's preview must render.

**C4. Section 4's five named sub-blocks. ADD.** `Documentação`, `EPC's`, `EPI's`, `Equipamentos de Ensaio`, `Ferramentas e Materiais`, each a bold label over a fixed bullet list. FR-66 says "Sections 2, 4, 5 and 6 print their boilerplate" without the internal structure, so a Section block is modelled as one rich-text body when section 4 is five labelled lists. Same for section 2 (seven definition paragraphs, one of which cites **NBR 5419** for grounding tolerance) and section 5 (5 bullets, a quoted NR-10 clause with items a–f, 3 paragraphs, then a **9-item re-energization checklist**). The 9-item re-energization checklist in particular is content the PRD never mentions and that the 2027 text change does not remove.

**C5. Section 4 declares the equipment sheet to be an annex of the form. ADD.** "Formulário para registro dos ensaios e verificações dos equipamentos (**conforme Anexo deste documento**)." Section 9 is formally that annex. Harmless, but it is a cross-reference the boilerplate contains and the generator will print.

**C6. Section 6 will print a catalogue for two equipment types the MVP cannot produce sheets for. PRD.** extract-raw §1.9 and C9: FO.SERV-03's own section 6 declares applicable checks for `Relé de Proteção` and for `Cubículos, QGBT's e Quadros de Distribuição`, and section 3 puts the relay in scope. Neither has a sheet among the 94. The addendum records this as a *defect in the sample*. It is more than that: FR-66 prints section 6 boilerplate verbatim, so every generated Releng document will declare relay and QGBT checks it has no sheets for — reproducing the source's self-contradiction by design. Nothing in the PRD says whether that is intended.

Related: the PRD's "8 equipment block types" and FO.SERV-03 section 6's "8 named types" are **different lists of eight**. Section 6's eight are Cabos de Alimentação, Para-Raios, Chaves Seccionadoras, TP-and-TC (one entry), Disjuntor de MT, Relé de Proteção, Transformador de Força, Cubículos/QGBT. The PRD's glossary footnote explains the divergence from the brief's six but not from the source document's own eight.

**C7. `CARACTERÍSTICAS DA SE` is a sheet type, sometimes standalone. ADD.** It heads 9.1, 9.6, 9.7 and 9.8 — merged with `CABOS DE ENTRADA` on one sheet in 9.1, standalone in 9.6–9.8. FR-24 assumes it always prints on the cabine's first equipment sheet. Also: altitude prints as a **threshold expression**, `ALTITUDE: <1000 mts.`, not a number, while FR-16 prefills a geolocation-derived numeric altitude.

**C8. The routinely-unmeasured columns have no cell state. PRD.** extract-raw §2.9: "In this instance only the `1 MINUTO` column is filled; `30 SEGUNDOS`, `ESTAB./10MIN`, `ABSORÇÃO`, `POLARIZAÇÃO` are all `-`." FR-27 has typed, dictated, camera-derived and empty; it has no explicit **not-measured / `-`** value that prints as a dash. Without it, four of six insulation columns are permanently "empty" and FR-17's progress counter and FR-73's pre-issue list will treat every sheet as incomplete.

**C9. Instrument header print labels.** See A4.

**C10. Correctly captured.** Photo caption format and the 01–76 numbering collision (FR-48, addendum §3); the 11 subsection names and their 4–14 sheet counts (addendum §3, Flow 3 quotes one verbatim); the 2×2 conclusion grid (FR-29); the `SATISFATÓRIO` verdict word (glossary); the signature block and the `Este laudo tem validade apenas acompanhada da ART_…` line (FR-69, glossary); the six certificate pages (FR-70); the two C/NC/NA column orders, the missing transformer conclusion blocks, the inconsistent `TAG:` field, and the >250 µΩ values with no NC (addendum §3).

---

## D. Qualitative material the FR structure silently drops (brief §12)

Walked bullet by bullet. Ten of the twelve bullets survive somewhere. Three do not, and one is contradicted.

**D1. CONTRADICTED — "Silence rather than a guess. Low-confidence fields are left blank, never guessed." PRD + ADD.**

The brief states this twice: as an `[MVP]` capability ("low-confidence left blank, never guessed", §5) and as a stance in §12 under its own heading. The suggestion-mechanics section (§4) repeats it in bold: "**Low-confidence fields are left blank, never guessed.**"

The PRD replaces it. Glossary, *Verificar*: "an ungrounded or cross-check-failed guess, **shown with its best guess** on a dashed amber border". FR-33: "A field whose value cannot be grounded on the crop is flagged Verificar, **shown with its best guess rather than blank**". Flow 2b shows "Capacidade de interrupção" flagged Verificar with a guess present.

The new rule is defensible — a dashed border plus a mandatory tap is arguably safer than a blank, because a blank is silent. But:

- it is a **reversal of a stated stance**, and the addendum's §2 "Alternatives considered and rejected" does not record it;
- the PRD is **inconsistent with itself**: FR-39 keeps the old rule for captions ("A photo vision cannot caption stays 'Sem legenda' … and is **never guessed into a caption**"), so the product now guesses on nameplate fields and refuses to guess on captions, with no stated reason for the asymmetry;
- the brief's own §12 framing makes this a trust property, not a UI detail.

**D2. MISSING — the go-to-market instinct and its product consequence. ADD.**

Brief §12: "**Peer trust is the go-to-market instinct.** Adoption in this market happens by one engineer posting in a WhatsApp group that something works. **The product must be demo-able and shareable inside a group chat.**"

Supporting evidence in the sources, none of which appears in the PRD or addendum:

- the reference tool won "meia dúzia" (~6) users from a single group off **one** peer testimonial (extract-brief §9, voice note 2, extract-raw R-T17);
- "**the dev from the group**" is named in the brief as a **new competitive category discovered in the media import** — engineer-developers selling report tools inside WhatsApp groups, low barrier to entry, adoption by peer trust. The addendum's §5 competitor table has Mesh, Minipa, GroundPRO, Inspekio and the status quo, and omits this category entirely, although it is the one competitor already inside the design partner's own network;
- **channel risk**: "Mesh Labs and Elétrica Academy sell through their own training schools with student discounts; **Releng has no audience of its own**. The nearest working channel observed is peer word-of-mouth in engineers' WhatsApp groups … Bruno belongs to those groups, so they are the first channel to test."

The product consequence — demo-able and shareable in a group chat — is the only part of this that is a design constraint, and it is exactly the part that disappears when the material is reduced to FRs. Nothing in the PRD's §12 Platform, §8 Success Metrics or §6 Non-Goals reflects it.

**D3. MISSING — dated revalidation as a way of working. ADD.**

Brief §12, "Ways of working": "competitive claims carry **revalidation dates**". The dates are in extract-brief §7: **1 Oct 2026** (GroundPRO checklists), **1 Nov 2026** (Mesh terms and Bluetooth), **1 Dec 2026** (Mesh, Minipa Link and GroundPRO prices and features; **also re-check NR-10**), **1 Mar 2027** (Mesh traction).

Not one date appears in the PRD or the addendum. PRD §2 Why Now and addendum §5 state competitive facts — a price, a feature set, a roadmap item, a subscriber count — as current, with no expiry. Q17 lists norms to re-verify but gives no dates and drops "**NR-10 again by 1 December 2026**", which is the one date with a regulatory consequence.

This matters more than a process nicety: §2 argues the whole "why now" on the basis that two Mesh gaps have "explicitly short windows", and gives the reader no way to know when the claim itself went stale.

**D4. MISSING (minor) — the positioning line. NONE or ADD.**

"**Your report, in your layout, ready to sign**" is the brief's chosen honest positioning line, stated twice. The PRD carries the *substance* ("the provider's own document, not a vendor template", "the least typing per sheet in the category") but not the line. Arguably a brief-level artifact and fine to drop; noted so it is not lost if marketing copy is needed later.

**D5. CARRIED — the other eight.** The emotional principle (§1 vision); the confirmation trust contract (FR-41); the "mais top" bar as a floor, not a target (addendum §7, with that gloss written in); the provider's own document (§1, FR-1, FR-63); written-up-later as the enemy (§1, §3.1); paper dropped as a stance, not a scoping detail (§6, with the quote); auditability as a feel (FR-30's criteria line, FR-71, §9 Traceability); the report as a legal artifact (§10, FR-64, FR-69); honest positioning and the refusal to over-claim (§11 Evidence, §6's two forbidden claims). Privacy discipline about the source material (real third-party CNPJs, names and registrations) was **followed** — no third-party name from the media extract propagates into the PRD — although the rule itself is not recorded anywhere. That is the right outcome.

---

## E. Decisions, divergences and reversals

**E1. Carried correctly.** PDF pulled forward from "right after the MVP" into the MVP with digital signature left out (addendum §2). AI capture reversed from `[OUT]` to the mandate on the afternoon of 2026-09-18, with the R5 rationale answered by design (addendum §2, §7). SaaS-ready model over market R1's internal-tool recommendation (addendum §2). No Mesh benchmark, recorded as a divergence rather than an omission (addendum §2, Q16). Editable DOCX rejected as a round-trip format (addendum §2). Names dropped, with the `releng`/release-engineering search collision and the unchecked domain/INPI status (addendum §2).

**E2. Not carried — the positive build order. ADD.** The brief states both directions: "**Build order constraint:** report generation still ships first; AI capture assists follow **in order (a)→(d)**. Cut order if the timeline tightens: (d) first, then (c)." The PRD's §7.2 carries only the cut order. The build order is the more useful of the two when there is no deadline (Q1), because it is the one that applies regardless.

**E3. Not carried — the document-control page is an addition to FO.SERV-03, not part of it. PRD.** extract-raw §1.16 is explicit: "**There is no in-document revision-history table.** Revision control is expressed only in the page header: `Código: FO.SERV-03` and `Revisão 00`." The brief tags the document-control table `[REF]` — a **reference-tool** pattern (extract-brief §9: the peer tool's p.1 "CONTROLE DO DOCUMENTO" table).

FR-64 states it as fact: "One page after the cover carries the document control table." §0 says the PRD's contract is "the real FO.SERV-03 layout", and FR-64 is the only place the export revision prints. Adding the page is probably right, but it is an **unflagged deviation from the layout the PRD promises to reproduce**, and it will be the first thing the design partner notices at SM-4 acceptance.

**E4. Working title vs. chosen name.** The brief records "Releng" as **chosen** on 2026-09-18; the PRD's front matter says "Working title — confirm". Not a contradiction worth fixing, but worth knowing the source is more settled than the PRD.

---

## F. Numbers, quotes and evidence qualifiers

**F1. Two `[NV]` regulatory claims promoted to "Firm, verified". PRD.**

extract-brief tags NR-10 **10.15.6** — the removal of the 75 kW PIE threshold — as `[NV]` in two separate places (§6 glossary, §7 constraints), and **10.13.1** (the seven-step sequence) as `[V/NV]`. **10.12.9** (PLH vs. executors) is `[NV]`.

PRD §10 lists 10.15.6 and 10.13.1 under "**Firm, verified**", with no qualifier. §2 Why Now then builds the commercial case on 10.15.6: "**every MV substation owner** must keep a PIE. The addressable obligation widens."

The PRD's own §10 preamble promises "the evidence position as of 2026-09-19, **with its confidence stated**", and §10 elsewhere is scrupulous — it downgrades the pre-2027 text to "medium-high confidence" because it came from a mirror. So this is an inconsistency inside the PRD's own discipline, on the single claim the market timing rests on. (It is possible the research reports upgraded these tags after the brief; if so, the PRD should say so, because its nearest upstream source says `[NV]`.)

**F2. `[NV]` utility figures stated flat in the addendum. ADD.** addendum §6: "CPFL requires ≤ 10 Ω in wet soil and ≤ 25 Ω in dry" and "CPFL > 30 MΩ at 15 kV, > 50 MΩ at 25 and 34.5 kV". Both are `[NV]` in the brief. §10 of the PRD uses the `> 30 MΩ` figure again in the criteria argument. These are the numbers a future grounding sheet would encode, and the PRD's own rule is that no criterion may be encoded without its source and edition.

**F3. SM-3's baseline is more precise than its source. PRD.** Brief: "Baseline: **an estimated ~60–120 typed characters per sheet today** (from the FO.SERV-03 extraction), **to be measured**." PRD SM-3: "Baseline: **about 85 typed characters for the nameplate plus about 35 for the readings**, per sheet." The range became a decomposed point estimate at the top of the range, and "to be measured" was dropped. SM-3 is a target measured against this baseline, so the inflation is load-bearing.

**F4. Photo count is internally inconsistent. PRD.** PRD §1 Vision: "a 124-page report with **roughly 76 photographs**". The addendum's own sizing table says "**about 82** in section 7, plus cover and certificates", and §5.6 of the PRD says "82 captions run 01 to 76". **76 is the highest caption number, not the photo count** — it is the artefact of the numbering collision the product exists to fix. The 76 figure comes from the brief, which predates the raw-source page/photo recount; the PRD updated 119→124 pages but not 76→82 photographs. §9 Capacity and addendum §1 use "about 80", a third number.

**F5. Days on site. ADD (one line).** The addendum's sizing table says "Days on site: **3**, over a holiday weekend". extract-raw §5 records the partner describing "Saturday, Sunday, Monday, Tuesday, Wednesday" and "4 dias direto de parada", while the reference job's cover reads 6–8 September (3 days). Either two jobs are being conflated or the on-site stretch was longer than the executed-service dates. Minor, but "3 days" is quoted in §1 Vision as a hard fact.

**F6. Mesh's channel qualifier dropped. ADD.** PRD §2: "sold into an audience of **43,700 training-school subscribers**". The source adds: "43.7k YouTube subscribers, **though videos don't mention the app**". Dropping the qualifier makes the channel sound converted rather than merely adjacent.

**F7. Mesh's AI stack dropped. ADD.** extract-brief §9: Mesh's nameplate reading is "**Gemini with OpenAI fallback**, needs internet". addendum §1 hands "Provider for LLM vision and OCR, cost per reading" to architecture with no competitive datapoint attached. One line would inform that decision.

**F8. Quotes that would have earned their place in addendum §7.** All exist in extract-raw §3:

- "**Todos os nossos engenheiros lá tem tablet**" — the platform constraint is not an assumption; the fleet is stated. PRD §9/Q11 lists "the second device" among unconfirmed ergonomics, which is right, but the tablets themselves are confirmed.
- "**nem sempre dá tempo de eu ir lá, fazer o teste, voltar pro computador, preencher**" — why the laptop fails even when it is present. This is the tightest single statement of the capture-at-the-panel requirement and is stronger than the two "tirar o computador" quotes the addendum already carries.
- "**Nessa estrutura não cabe uma foto aqui dentro. … Isso eu acho ruim.**" — the evidence for A1, missing alongside the requirement it supports.
- "**esse eu não terminei, esse aqui eu tô revisando ele**" — the partner's own admission that the sample is a work in progress. The addendum lists seven "defects found in the delivered sample … which are evidence for requirements" without carrying the one quote that establishes those defects are incompleteness rather than practice.

**F9. Correctly qualified already.** The 5-verified / 23-unverified / 2-disputed / 2-refuted tally and "no competitor product was ever used with a login" (§11); "one engineer at one company, no independent user voice" (§11); the `> 400 MΩ` figure's untraceable source (§10, addendum §4); the P0–P4 scale's origin in the peer tool rather than Fasor's practice (FR-50, Q9); the CAC/churn benchmarks marked not to plan against (addendum §5); the R$ 100–300/month band marked low-confidence (addendum §5, SM-8); the empty video transcripts and the rule that no claim is sourced to them (addendum §8).

---

## G. Correctly left out — do not re-add

Recorded so a later pass does not treat these as omissions.

- **Reference-tool patterns tagged `[REF]` and dropped on purpose:** the risk matrix (Categoria / Risco / Consequência), the NR-10 + NBR 5410 adequacy table (Tema / Requisito / Referência / Ação), the mini status table per photo (Item / Valor / Un. / Status / Obs.), separate preliminary and final *parecer* boxes, and local project-file portability ("Salvar projeto" / "Salvar HTML", no cloud). All are load-study furniture; none fits a cabine laudo.
- **The reference tool's internals** — PRODIST Módulo 8 voltage bands, mass-memory ingestion and column mapping, breaker-loading gauges, the EV-charging module, the 79-page example PDF. The PRD correctly keeps only the two transferable ideas: the explicit formula line (→ FR-30's criteria line) and the branded page furniture (→ FR-1, FR-63).
- **R-T4's `ACEITÁVEL` in the instrument registry** — the verbal ask, consciously overridden by FR-3/FR-5 with the reason stated in the PRD. The right call: the criterion belongs to the test, not the instrument, and binding it to the instrument would break the multi-company story.
- **The A4-scan / OCR intake path** — builder's idea, not the partner's requirement; §6 says so and names it as such.
- **The equipment specification database by serial number** — same; §6 and addendum §2 both record the correction.
- **The virtual test laboratory** the partner admired ("os caras são top… criaram um laboratório virtual") — he explicitly framed it as the competitor's *school* product and pointed at the field app instead.
- **Automating the physical measurement work** — mutually agreed impossible in the call.
- **Third-party identities** from the media extract (Mohamed Salim, RAAD Engenharia, Mega Instalações Elétricas, and the signing engineer's CREA number) — the privacy instruction was followed.
- **Matheus's same-day prototype commitment**, the "Piru" nickname, the speaker-identity assumption, and the media provenance chain (faster-whisper, frame extraction) — working-note material with no downstream consumer.
- **`[REF]` competitor UX details** (GroundPRO's start modal, tool-card dashboard, `.grd` import; Mesh's per-type nameplate field counts of 78 on a TC and 69 on a TP) — the PRD takes the patterns it needs (draft recovery → FR-61, quantity steppers → FR-10) and leaves the rest.

---

## H. Summary of what should move

| # | Gap | Source | Destination |
|---|---|---|---|
| 1 | Photos print inside the section-9 equipment sheet | brief §5 `[MVP]`; raw R-T6 | PRD, FR-68 |
| 2 | Nameplate / checklist / measurement-table content, not counts | raw §2.4–§2.12 | Addendum (or a seed-data file the PRD cites) |
| 3 | "Never guessed" reversed into Verificar-with-a-guess, unrecorded and self-inconsistent | brief §4, §5, §12 | PRD (state the rule) + Addendum §2 (record the reversal) |
| 4 | `[NV]` promoted to "Firm, verified" on 10.15.6 and 10.13.1; `[NV]` CPFL figures stated flat | brief §6, §7 | PRD §10 + Addendum §6 |
| 5 | Revalidation dates, including "re-check NR-10 by 1 Dec 2026" | brief §7, §12 | Addendum §5, PRD Q17 |
| 6 | Peer/WhatsApp channel, "the dev from the group" category, and the demo-ability constraint | brief §9, §12, §13 | Addendum §5 |
| 7 | Document-control page is an addition to FO.SERV-03, not part of it; section 6 prints a catalogue for two sheet-less types | raw §1.16, §1.9, C9 | PRD FR-64, FR-66 |
| 8 | Camera capture of temperatura/umidade for `AMBIENTE DE ENSAIO` | raw R-T12 | PRD, FR-24 or FR-36 |
| 9 | Criterion record has no edition or table field, though §10 requires the edition | brief §5, §7 | PRD FR-5 |
| 10 | No "not measured / `-`" cell state for the routinely blank insulation columns | raw §2.9 | PRD FR-27 |
| 11 | Instrument record: lab, RBC accreditation, owner-defined interval; `RBC` is the printed label | brief §5; raw §2.3 | PRD FR-3 |
| 12 | Grounding is covered today as checklist items; only the measurement sheet is deferred | brief §5 `[MVP as checklist]` | PRD §7.2 / Q10 |
| 13 | Cover table row names; section 2/4/5 internal structure; shaded-table headings; `TIPO DE SE` pick list; altitude as `<1000 mts.` | raw §1.2, §1.5–§1.8, §2.4 | Addendum |
| 14 | Sheet-level `OBSERVAÇÕES` block has no FR, so `COM RESTRIÇÕES (ver observações)` has no target; reason not required on Reprovado | raw §2.0, §2.2, R-T15 | PRD FR-29 |
| 15 | SM-3 baseline inflated (60–120 "to be measured" → 85+35); §1's "roughly 76 photographs" should be ~82; three different photo counts in play | brief §8; raw §1.0 | PRD §8, §1 |
| 16 | Positive build order (a)→(d); four transcript quotes; Mesh's Gemini/OpenAI stack; Mesh channel qualifier | brief §7, §9; raw §3 | Addendum |
