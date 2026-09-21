---
title: "Extract: brief + addendum + WhatsApp media import — for PRD prd-fasor-2026-09-19"
created: 2026-09-19
sources:
  - _bmad-output/planning-artifacts/briefs/brief-fasor-2026-09-18/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-fasor-2026-09-18/addendum.md
  - _bmad-output/planning-artifacts/briefs/brief-fasor-2026-09-18/imports/extract-media-whatsapp-2026-09-18.md
note: "Dense faithful extract. Portuguese quotes kept verbatim with translation. Confidence tags from the addendum preserved: [V] verified, [NV] not verified, [C] contested/disputed, [Inf] inference."
---

# 1. Product identity

- **Product name:** **Releng** — from *relatório de engenharia* ("engineering report"). Chosen 2026-09-18 after "Voltlog" proved taken.
- **Internal project codename:** `fasor` — kept *only* as the internal codename because it is the design partner's company name. **Not to be confused with the design partner, Fasor Engenharia.**
- **One-line definition (brief, Executive Summary, verbatim):** "Releng is a web-based, tablet-first field tool that lets electrical maintenance engineers capture inspections, test results and photos on site and turn them into the company's finished technical report (*laudo*), with no paper or re-typing."
- **Product principle (stated in bold in the brief, twice):** **"type as little as possible; the app captures by camera and infers, the engineer confirms."** Restated in the Solution section as: "**Type as little as possible: the app captures by camera and infers; the engineer confirms.**"
- **Underlying user mandate (UX session, afternoon of 2026-09-18), verbatim Portuguese:** *"Como é algo a ser usado no campo, quanto mais inteligente for, melhor. Quero que o usuário digite o menos possível — aqui a usabilidade do usuário é chave! O uso de OCRs e de identificação de imagem inteligente por LLM deve ser incentivado e usado para melhorar a usabilidade do usuário — esse é nosso mandate."* ("Since this is to be used in the field, the smarter it is, the better. I want the user to type as little as possible — user usability is key here! The use of OCR and intelligent LLM image recognition should be encouraged and used to improve user usability — that is our mandate.") Recorded in `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/.memlog.md`.
- **MVP surface area:** one report — the **Laudo Técnico de Cabine Primária**, the preventive maintenance report for a medium-voltage (MV) primary substation (*cabine primária*), modeled on Fasor Engenharia's real template **FO.SERV-03** (Rev. 00).
- **Strategic framing:** "one feature done well, on a data model ready to become a SaaS for other small engineering firms." MVP built at no cost to test the idea quickly.
- **Positioning line (honest positioning, verbatim):** **"your report, in your layout, ready to sign"**.
- **Design-partner bar, verbatim Portuguese:** *"a gente quer fazer um negócio mais top"* ("we want to build something better").

# 2. Problem — pain points with evidence

| Pain point | Evidence / quote |
| --- | --- |
| **Double entry.** One printed sheet per piece of equipment (e.g. "10 breakers, 10 disconnectors"), filled in by hand, then re-typed into Excel and Word. The report is effectively written three times: by hand on pre-printed A4 sheets, then in Excel, then in Word. | Bruno, verbatim: *"eu preencho duas vezes"* ("I fill it in twice"). |
| **Slow delivery, slow cash.** The September 2026 job ran over a 4–5 day holiday and the report was still unfinished afterwards. A large report takes **7 days on average**. | Bruno, verbatim: *"o tempo pra mandar pro cliente, o tempo pra fazer o faturamento, isso me atrasa muito."* ("the time to send it to the client, the time to invoice, that delays me a lot"). |
| **Lost context.** Work is split across people (Bruno, Eduardo) and written up **~15 days later** from scrap notes. | Verbatim: *"no papel de pão"* ("on bread wrapping paper" — i.e. scrap paper). |
| **Awkward tools.** Laptops are a burden in the substation; engineers already carry tablets. | Stated in brief (no quote). |
| **Rigid output.** Test tables go into Word as Excel images (EMF), so photos can't sit next to their equipment. | Confirmed by rendering the FO.SERV-03 sheets on 2026-09-18: per-equipment test sheets are "currently pasted into Word as EMF images from Excel". |
| **Scale of one job** (the pain's magnitude) | One job yields a **~119-page** document with **~76 photos** and **94 per-equipment test sheets**. Example job: Porto Seguro, executed **6–8 September 2026**. |
| **Offline pain (market-wide)** | Market research flags **photo loss and unstable sync** as the top complaint about generic Brazilian field apps. |

**Evidence strength, as the brief itself states it (verbatim):** "one engineer at one company, with no independent user voice in market research. Real for the design partner, unvalidated beyond it."

**Regulatory timing that makes the problem urgent:** the revised NR-10 (Brazil's electrical-safety regulation; **Portaria MTE 737/2026**, in force **1 June 2027**) extends the obligation to keep electrical installation records (**PIE**) to **every MV substation owner**.

**Competitive timing:** "The niche is also filling up: Mesh Labs launched a cabine primária app in September 2026, with Minipa Link and Inspekio circling, and engineer-developers already sell report generators to their peers inside WhatsApp groups."

# 3. Users and stakeholders

**Named people**

- **Matheus Torres** — the builder. Building the MVP **at no cost** to test the idea quickly. Proposed OCR of handwritten A4 sheets (rejected by Bruno). Addressed as "Piru" in Bruno's voice notes (apparent nickname for the recipient).
- **Bruno Matsui** — **Fasor Engenharia**; **design partner and first user**; field engineer; the person who writes the report today; the one who forwarded the peer-built reference tool on 2026-09-18; the acceptance judge for the generated report; member of the engineers' WhatsApp groups that are the first candidate sales channel. Speaker identity in the audio is an **[ASSUMPTION]** (Bruno addressing Matheus) — no explicit identification in the audio.
- **Eduardo** — Fasor Engenharia field engineer; work is split across Bruno and Eduardo, which is part of the lost-context problem.
- **Mohamed Salim** — "Eng. Eletricista Mohamed Salim, CREA 23.623/D-DF", **RAAD Engenharia**, responsible party shown in the reference tool's example cover (date 05/09/2026, revisão 00); probably the developer's own company. Third-party data — keep out of public material.

**Organizations**

- **Fasor Engenharia** — the design partner firm; owner of template FO.SERV-03; does MV preventive maintenance. Performs grounding and 50/51 relay tests (so dedicated sheets for both are the first post-MVP additions).
- **Porto Seguro** — example end client of the FO.SERV-03 sample job (6–8 September 2026).
- **RAAD Engenharia** — branding on the reference tool's example cover.
- **Mega Instalações Elétricas Ltda** (Brasília-DF) — client in the reference tool's example output PDF; contracting party is a concessionária/SPE; responsible party is a **técnico em eletrotécnica with CRT and TRT** (not CREA/ART). Third-party data — do not propagate.
- **Peer engineer-developer** — unnamed; belongs to the same engineers' WhatsApp groups as Bruno; sells "Estudo de Carga e Demanda"; ~6 group members already paying users.

**User segments (brief, "Who This Serves")**

- **Primary: field engineers at Fasor Engenharia** (Bruno Matsui, Eduardo and team), "who want to leave the site with complete data and deliver without a second shift at the desk."
- **Secondary: whoever assembles and reviews the report in the office** — **[ASSUMPTION: the same engineers]**.
- **End reader: the client** (e.g. Porto Seguro), "who needs a clear, complete, signed report that feeds their PIE."
- **Future (SaaS): small and mid-size engineering firms doing MV preventive maintenance** — "the segment market research recommends first."

**Roles in the domain model (addendum, domain research):** qualified professional in charge (**PLH**) vs. **authorized executors** (NR-10 10.12.9) [NV]. Professional-registration field must accept **CRT/TRT (technicians)** as well as **CREA/ART (engineers)** — it "cannot assume CREA". Whether a technician with TRT may sign is **contested (CFT × CONFEA)** [C].

# 4. The solution flow (end to end, in order)

1. **Set up before the visit (office).** The office creates the **project (client)** and the **report**, and adds **equipment blocks** (cables, disconnector, MV breaker, voltage/current transformers (VT/CT), transformer) **with quantities**, each block carrying its **checklist and required tests**. Mental model discussed: drag-and-drop blocks, "like draw.io". Quantities set upfront **or** units added in the field. Office pre-fills; the field engineer completes.
2. **Fill in on site, on a tablet, typing as little as possible.** For each piece of equipment: **nameplate data**, **checks (C/NC/NA)**, **test values**, and a **conclusion**. **Picking a registered instrument code fills in its serial number and calibration certificate.** Missing equipment can be added in the field.
3. **Photos as first-class data:** captioned, and shown **both** in the photo record **and** next to their equipment (gallery + thumbnails beside each test table).
4. **Findings become an action plan.** Each **point of attention** (issue found on site) **references its photos** and carries a **corrective action, deadline, priority and owner**, "as NR-10 item 10.7.11 asks."
5. **Generate the report** in the **FO.SERV-03 layout**, with an **automatic table of contents**, as an **editable .docx** the engineer can adjust before signing.

**Cross-cutting behaviors in the flow**

- **AI assists are suggestions, never writes.** "Every AI result is a suggestion the engineer confirms; nothing is written unconfirmed."
- **All AI processing runs in the backend (it is a SaaS).** Offline, the photo is kept and queued, and the reading runs at the first connection, "with the suggestions shown for confirmation beside the source photo."
- **Works without signal.** "Substations are often in basements with no connectivity; the app saves locally and syncs later, never losing site data."
- **Web first.** "The MVP runs in the tablet's or phone's browser, on any platform (Android, iPad, Windows), without app store publishing."

**Suggestion-state mechanics already specified in UX (EXPERIENCE.md › Component Patterns › Nameplate extraction; State Patterns; Flow 2b) and now the pattern for every assist:**

- The photo is saved as a normal photo of the sheet and queued like any other; the reading requires a connection and, offline, runs on the next connection — on-screen text verbatim: *"Sem conexão — a leitura fica disponível quando houver sinal"* ("No connection — the reading will be available when there is signal") — with suggestions appearing on the next open of the sheet.
- Results are **suggestions** (**amber fill**, label **"Sugerido"**) confirmed **per field** or with **"Confirmar todos"**.
- **Nothing is written unconfirmed.** **Low-confidence fields are left blank, never guessed.**
- **A field the engineer already filled is never overwritten**; a differing suggestion offers **"Substituir"**.
- **Typing into a suggested field discards that suggestion.**
- **States:** extracting / offline / failed (**"Tentar novamente / Preencher manualmente"**, photo kept) / suggestions pending — **pending suggestions are not counted as filled by the Progress counter and are never printed**.

# 5. Capability inventory

Legend: **[MVP]** in MVP scope · **[MVP-model-only]** "structures ready" in the data model with no UI · **[POST]** deferred, stated as right-after-MVP or first addition after MVP · **[OUT]** explicitly out of scope · **[VISION]** future SaaS vision · **[REF]** observed in the reference tool / competitors, flagged as a pattern to match or beat but not stated as MVP scope.

**Setup, hierarchy and registries**

- Project (client) → N reports hierarchy. **[MVP]** ("Project → report hierarchy"; "Hierarchy: Project/client → N reports → report type")
- Create a report from a report type. **[MVP]** (one type only: cabine primária)
- Equipment blocks added to a report, each carrying predefined checks and tests; drag-and-drop mental model. **[MVP]**
- Quantities per equipment block set upfront. **[MVP]**
- Add units / missing equipment in the field. **[MVP]**
- Office pre-fill before the visit; field engineer completes. **[MVP]**
- Registry: **test instruments**, selected by code, auto-filling serial number and calibration certificate. **[MVP]**
- Registry: **manufacturers**. **[MVP]**
- Registry: **voltage classes** (15 / 17.5 / 23 kV…). **[MVP]**
- Client block fields: client, city/site, execution dates, additional info, responsible person. **[MVP]** (part of FO.SERV-03 anatomy)
- Multiple report types and companies (tenants) in the data model. **[MVP-model-only]** — no UI
- Acceptance criteria as data with their source (norm, edition, table, limit, unit), not hard-coded. **[MVP-model-only]** — no UI for criteria editing
- Stable equipment identity (**TAG**) across visits, for later history-based criteria. **[MVP-model-only]**
- NR-10 text chosen by the job's execution date (before or after 1 June 2027). **[MVP-model-only]**
- Onboarding other companies. **[OUT of MVP UI]** (structure only)
- Per-utility registry (grounding limit, shutdown notice, seals). **[VISION/later]**
- Editable acceptance criteria per company and per utility. **[VISION]**

**Field capture**

- Per-equipment sheet capture: nameplate data, checks, test values, conclusion. **[MVP]**
- Equipment data fields: TAG, manufacturer, serial no., manufacture date, rated voltage/current, extinction medium (SF6/oil), drive type. **[MVP]**
- General checks: numbered items with **C / NC / NA** columns plus an observations column, ~5–15 per type (15 on the MV breaker sheet). **[MVP]**
- Insulation test capture: instrument, serial, certificate, test voltage, acceptance value printed on the sheet, phases A/B/C × ground, readings at 30 s / 1 min / 10 min, absorption and polarization indices. **[MVP]**
- Contact resistance test capture: µΩ, T1-T2… **[MVP]**
- Transformation ratio test capture: TTR, theoretical vs. measured. **[MVP]**
- Test environment capture: temperature, humidity. **[MVP]**
- Per-sheet conclusion: Approved / Rejected, with/without restrictions, plus observations. **[MVP]**
- Grounding as checklist items only (e.g. "Aterramento", "Aterramento cordoalhas") — no dedicated sheet. **[MVP as checklist]**
- 50/51 relay setting recorded on the breaker sheet ("AJ. RELÉ 50/51" field + a "relé de acionamento" check item) — no dedicated relay sheet. **[MVP as field]**
- Progress counter per sheet (pending suggestions excluded from "filled"). **[MVP]** (from UX state patterns)
- Extended insulation fields: applied kV, value corrected to 20 °C (Tab. 100.14), PI/DAR per phase/pole. **[REF/domain — §2.10, not stated as MVP]**
- Extended contact-resistance fields: per pole with test current in A; fuses (difference ≤15%); TTR on all taps (≤0.5%); vacuum bottle; trip-free/anti-pump; timings in ms. **[REF/domain — §2.10]**
- As-found / as-left capture: breaker operation counter before and after; relay settings found and left; as-found tests before cleaning (§2.5, §4). **[REF/domain, not stated as MVP]**
- Next recommended intervention stored as declared data with its justification. **[REF/domain]**

**AI and camera assists (the mandate; in MVP, in the core flow, in this build order)**

- **(a) Nameplate from a photo** (LLM vision) into the nameplate fields. **[MVP — stays even if timeline tightens]**
- **(b) Instrument display OCR by camera** — megôhmetro / microhmímetro / TTR readout into the measurement cell, with the source photo shown beside the value. **[MVP — stays even if timeline tightens]**
- **(c) Photo auto-caption** — LLM vision proposes activity, equipment and location for the caption Comboboxes. **[MVP — second to be cut if timeline tightens]**
- **(d) Equipment type and TAG suggestion** from a photo of the cubicle label (extends the existing type+column TAG suggestion). **[MVP — first to be cut if timeline tightens]**
- Suggestion UX: amber fill, "Sugerido" label, per-field confirm, "Confirmar todos", "Substituir" on conflict, typing discards, low-confidence left blank, never printed while pending. **[MVP]**
- Offline AI queueing: photo kept, reading deferred to first connection, suggestion shown beside source photo. **[MVP]**
- Failure handling: "Tentar novamente / Preencher manualmente", photo kept. **[MVP]**
- **Non-AI smart defaults:** copy from the last sheet, the same column, or the previous visit (by TAG). **[MVP]**
- **Bulk actions across sheets.** **[MVP]**
- On-device OCR for displays (offline) vs. server-side LLM vision. **[OPEN — architecture]**
- OCR of handwritten A4 sheets. **[OUT]** — proposed by Matheus, Bruno prefers dropping paper entirely.

**Photos**

- Photo object = image + caption; reused in the gallery and as thumbnails next to each test table. **[MVP]**
- Photos with captions. **[MVP]**
- Photo record section, 2-column grid, "Imagem NN: Detalhe…" numbering; ~76 photos per job. **[MVP]**
- Points of attention reference photos by number. **[MVP]**
- Photos stamped with date, time and GPS coordinates. **[REF — pattern to match/beat; not stated as MVP]**
- Mini status table per photo (item, value, unit, status, remarks). **[REF]**

**Findings / action plan**

- **Points of attention** with corrective action, deadline, priority and owner; referencing their photos. **[MVP]** — justified by NR-10 item 10.7.11
- Priority scale P0 (immediate) → P4 (final) with deadline and recommended action. **[REF — reference-tool pattern]**
- Risk matrix (category, risk, consequence). **[REF]**
- Highlighted boxes for preliminary and final opinion (*parecer*) and for necessary conditions. **[REF]**
- NR-10 / NBR 5410 adequacy table (topic, requirement, reference, action). **[REF]**

**Report generation and output**

- **.docx report generation in the FO.SERV-03 layout.** **[MVP]**
- **Automatic table of contents.** **[MVP]**
- Editable output the engineer adjusts before signing. **[MVP]**
- Report sections reproduced: Objective; Definitions; Scope limits and exclusions; Requirements (ART, EPC/EPI, test instruments, tools); Safety recommendations (NR-10 10.5.1 de-energization sequence); Checks and tests per equipment type; Photo record; Points of attention and suggested corrective actions; Test reports (11 subsections by location/equipment group, 94 sheets); Conclusion + engineer signature (name, CREA) tied to the ART; Instrument calibration certificates pasted as images. **[MVP — the FO.SERV-03 anatomy]**
- Header/footer: document code + revision, company data, pagination. **[MVP]**
- **PDF export** (including a sealed, PIE-ready version). **[OUT of MVP — "right after the MVP"]**
- Sealed PIE-ready PDF with version, hash and 10-year retention, ICP-Brasil-ready. **[VISION]**
- Numbered editable sections with boilerplate, rich text, add-below / move up / move down / delete (the "template composer" already in the UX design). **[REF — pattern to match]**
- Narrative paragraphs generated from the numbers, editable, with the formula shown for audit. **[REF]**
- Per-company branding: logo, cover background, watermark, header and footer on every page. **[REF]**
- "Document control" table: document, revision, date, client and provider (with CNPJ), responsible person, ART/TRT, service period. **[REF]**
- Professional-registration field accepting CRT/TRT as well as CREA/ART. **[REF — explicit warning not to assume CREA]**
- Local project file portability ("save project" / "save HTML", no cloud). **[REF, Inf — not proposed for Releng]**

**Offline and sync**

- **Offline capture with later sync, with no data or photo loss.** **[MVP]**
- Local save, later sync, never losing site data. **[MVP]**
- Autosave with "Draft found → Recover". **[REF — GroundPRO UX reference]**
- Photo-safe offline capture must be proven by architecture **before anything else is built on it**. **[MVP risk gate]**

**Instruments and calibration**

- Instruments selected by code, auto-filling serial and calibration certificate. **[MVP]**
- Instrument calibration recorded in the system (stated as a gap no MV competitor covers). **[MVP]**
- Instrument record fields: certificate, date, lab, RBC optional, owner-defined interval. **[Domain — §; expiry alert, no blocking, V]**
- **Expiry alert, no blocking.** **[V — domain rule]**
- Calibration certificates pasted as images in an annex. **[MVP — as in FO.SERV-03]**
- Bluetooth instrument integration. **[OUT]**

**Admin / platform / commercial**

- Web app, responsive for tablet and phone; runs in the browser on Android, iPad and Windows; no app store publishing. **[MVP]**
- Multi-tenant structure in the data model. **[MVP-model-only]**
- Billing, subscriptions, public signup. **[OUT]**
- Digital signature and ART integration. **[OUT]**
- Real-time multi-user editing of the same report. **[OUT]**
- Comparison with the previous report. **[OUT of MVP]** / **[VISION]**
- Equipment history across visits. **[VISION]**
- Native mobile apps. **[OUT]**
- Public, per-company pricing. **[VISION]**
- Catalog of report types (panels, SPDA, grounding, possibly load and demand studies). **[VISION]**

**Additional candidate report blocks (domain research, not MVP)**

- Thermography before de-energization; oil lab annex (NBR 10576 table [C]; DGA not obtained); general functional test; surge arresters; cable terminations (muflas). **[Candidate blocks, not MVP]**
- Dedicated grounding test sheet: fall-of-potential with curve, soil condition, limit with its source (CPFL 10/25 Ω) and continuity (SPDA) [NV]. **[POST — first addition after MVP]**
- Dedicated relay 50/51 test sheet (NR-10 10.12.7, NBR 14039 8.2.2.4, public tenders) [V]: pickup/dropout, 2 curve points, manufacturer tolerance, breaker trip by each relay. **[POST — first addition after MVP]**

# 6. Domain vocabulary

| Term (Portuguese original) | English / definition | Relationships and cardinality |
| --- | --- | --- |
| **Laudo** (*laudo técnico*) | Technical report; the finished, signed engineering document delivered to the client. | The unit of delivery. One job → one laudo. Feeds the client's PIE. |
| **Releng** (*relatório de engenharia*) | The product name; "engineering report". | — |
| **Cabine primária** | Medium-voltage (MV) primary substation. | The MVP's single subject. One report covers one cabine primária. |
| **Laudo Técnico de Cabine Primária** | "Technical report on a primary substation" — the preventive maintenance report for an MV primary substation. | The MVP's one report type. |
| **FO.SERV-03** | Fasor Engenharia's real report template, Rev. 00, for the Laudo Técnico de Cabine Primária. Source file: `docs/context/FO.SERV-03 Laudo Técnico de Cabine Primária.docx`; example job Porto Seguro, 6–8 Sep 2026; TOC runs to about p. 119. | The layout Releng's .docx generation must reproduce. Contains 11 sections; ~76 photos; 94 test sheets; test reports in 11 subsections by location/equipment group. |
| **MT / AT / MV** | Medium voltage. NR-10 labels it "AT" in the pre-2027 text and "MV" from 1 June 2027. | Label choice depends on the job's execution date. |
| **C / NC / NA** (*conforme / não conforme / não se aplica*) | Conforming / non-conforming / not applicable — the three-state result of a checklist item. | Columns on a general-checks table, plus an observations column. ~5–15 check items per equipment type; **15 on the MV breaker sheet**. |
| **TAG** | Stable equipment identity/label, carried across visits. | One TAG per piece of equipment, stable across visits; needed for history-based criteria (winding ≤2% vs. previous, PI vs. history) and for previous-visit smart defaults. Suggested by AI from a photo of the cubicle label. |
| **PIE** (*Prontuário de Instalações Elétricas*) | The electrical installations records / dossier that an installation's owner must keep under NR-10. | The client's artifact; the laudo feeds it. Before 1 Jun 2027: required for >75 kW (NR-10 10.2.4 b, g). After: every MV substation owner (10.15.6) [NV]. |
| **Ponto de atenção** | Point of attention — an issue found on site. | Each one references its photos (by number) and carries corrective action, deadline, priority and owner. Many per report. Report section 8: "Points of attention and suggested corrective actions". |
| **Plano de ação** | Action plan — the collection of points of attention with their corrective actions. | Required in spirit by NR-10 item 10.7.11 (inspection report with an action plan and schedule). |
| **Megôhmetro** | Megohmmeter — insulation resistance test instrument. | One of the three instruments whose display is OCR'd by camera. Feeds the insulation test. |
| **Microhmímetro** | Micro-ohmmeter — contact resistance test instrument. | One of the three OCR'd instruments. Feeds the contact resistance test (µΩ). |
| **TTR** (*relação de transformação*) | Transformer Turns Ratio tester / the transformation-ratio test itself. | One of the three OCR'd instruments. Theoretical vs. measured; on all taps, tolerance ≤0.5% [V]. |
| **VT / CT** (*TP / TC* — transformador de potencial / transformador de corrente) | Voltage transformer / current transformer. | One of the 6 equipment sheet types. |
| **Seccionadora** | Disconnector / disconnect switch. | One of the 6 equipment sheet types. |
| **Disjuntor MT** | MV circuit breaker. | One of the 6 equipment sheet types; carries the "AJ. RELÉ 50/51" field, a "relé de acionamento" check item, and 15 check items. |
| **Cabos de entrada / de saída (alimentadores)** | Incoming/substation cables and feeder cables. | Two of the 6 equipment sheet types. |
| **Transformador** | Transformer. | One of the 6 equipment sheet types. |
| **Six sheet types (full list)** | incoming/substation cables, disconnector (seccionadora), MV circuit breaker, VT/CT (TP/TC), transformer, feeder cables. | The MVP's equipment sheet types — the same 6 Mesh Labs covers. |
| **Ficha de ensaio (per-equipment test sheet)** | The per-equipment data sheet: equipment data, general checks, tests, environment, conclusion. | Currently pasted into Word as **EMF images from Excel**. 94 sheets in the example job. |
| **Aterramento** | Grounding / earthing. | In the MVP it exists only as checklist items ("Aterramento", "Aterramento cordoalhas"); no dedicated grounding test sheet. A dedicated sheet is the first post-MVP addition. |
| **Cordoalha** | Grounding braid/strand cable. | Appears as the check item "Aterramento cordoalhas". |
| **Relé 50/51** | ANSI 50/51 overcurrent relay (instantaneous / time overcurrent). | MVP: setting recorded as the "AJ. RELÉ 50/51" field on the breaker sheet. Dedicated test sheet is a first post-MVP addition; basis NR-10 10.12.7, NBR 14039 8.2.2.4, public tenders [V]. |
| **Resistência de contato** | Contact resistance. | Measured in **µΩ**, T1-T2…; per pole with test current in A. FO.SERV-03 prints the acceptance value "<250" µΩ. |
| **Resistência de isolamento** | Insulation resistance. | Measured in **MΩ**; phases A/B/C × ground; readings at **30 s / 1 min / 10 min**; applied test voltage in kV; value corrected to 20 °C (Tab. 100.14 [V]). FO.SERV-03 prints ">400" MΩ. |
| **IAB / índice de absorção (DAR)** and **IP / índice de polarização (PI)** | Dielectric Absorption Ratio and Polarization Index, derived from the timed insulation readings. | Derived per phase/pole; PI is also compared against history. |
| **Meio de extinção** | Arc extinction medium (SF6 / oil). | Nameplate field on the equipment data block. |
| **Tipo de acionamento** | Drive / operating mechanism type. | Nameplate field on the equipment data block. |
| **Placa (nameplate)** | The equipment's nameplate. | Photographed; LLM vision extracts its fields as suggestions. |
| **Classe de tensão** | Voltage class (15 / 17.5 / 23 kV…). | A registry / pick list. |
| **NR-10** | Brazil's electrical-safety regulatory norm. | Cited in FO.SERV-03 (PIE; 10.5.1). Revised by Portaria MTE 737/2026, in force 1 June 2027. |
| **Portaria MTE 737/2026** | The ministerial order revising NR-10; in force **1 June 2027**. | Extends the PIE obligation to every MV substation owner. |
| **NR-10 10.5.1** | Pre-2027 de-energization sequence, 6 steps; "AT" label. | Section 5 of FO.SERV-03 ("Safety recommendations"). Replaced from 1 Jun 2027 by **10.13.1** (7 steps, adds arc flash and area delimitation; "MV" label) [V/NV]. |
| **NR-10 10.7.11** | Requires an inspection report with an action plan and schedule. | The justification for points of attention with deadlines; an allowed sales angle. |
| **NR-10 10.2.4 b, g** | Pre-2027 basis for PIE at installations above 75 kW. | — |
| **NR-10 10.15.6** | Post-2027 basis extending PIE to every MV substation owner [NV]. | — |
| **NR-10 10.12.7** | Basis for relay testing [V]. | — |
| **NR-10 10.12.9** | Roles: qualified professional in charge (**PLH**) vs. authorized executors [NV]. | — |
| **PLH** (*profissional legalmente habilitado*) | Qualified professional legally in charge. | vs. authorized executors. |
| **ART** (*Anotação de Responsabilidade Técnica*) | Technical responsibility registration filed by the engineer. | Number and type (multiple/monthly, or tied to the work order); issued under **CREA**. Section 4 "Requirements" of FO.SERV-03; signature in section 10 is tied to the ART. Integration is out of MVP scope. |
| **CREA** | Regional engineering council; the engineer's registration number. | Printed with the signature. |
| **TRT** (*Termo de Responsabilidade Técnica*) | The technician's equivalent of the ART. | Issued under **CRT**. Whether a TRT holder may sign is contested (CFT × CONFEA) [C]. |
| **CRT** | Regional technicians' council; the technician's registration. | The registration field must accept CRT/TRT as well as CREA/ART. |
| **CNPJ** | Brazilian company tax ID. | Appears in the "document control" table for both contracting and contracted companies. |
| **EPC / EPI** | Collective / personal protective equipment. | Listed in section 4 "Requirements" of FO.SERV-03. |
| **NBR 5419** | Brazilian standard on lightning protection. | One of only two norm families cited in FO.SERV-03 (with NR-10). |
| **NBR 14039** | Brazilian standard for MV installations (1.0 kV to 36.2 kV). | **Not cited** in FO.SERV-03. 8.2.2.4 is a basis for relay testing. Never claim it "requires annual maintenance". |
| **NBR 10576** | Standard with the insulating-oil table. | Oil lab annex is a candidate block; the table is [C]; DGA not obtained. |
| **NETA MTS-2019 / MTS-2023** | US (InterNational Electrical Testing Association) maintenance testing specifications. | MTS-2019 asks 5,000 MΩ at 2.5 kV DC for 15 kV insulation [V, edition-dependent]. MTS-2023 must be re-checked before encoding criteria. |
| **Tab. 100.14** | The temperature-correction table used to correct insulation values to 20 °C [V]. | — |
| **CPFL** | Brazilian distribution utility. | Releases energization at >30 MΩ [NV]; grounding limit 10/25 Ω [NV]. |
| **SPDA** (*Sistema de Proteção contra Descargas Atmosféricas*) | Lightning protection system. | A future report type; out of MVP. GroundPRO's territory. |
| **DGA** | Dissolved gas analysis (transformer oil). | Not obtained; oil analysis results are external lab results attached later and excluded from the 1-day target. |
| **Memória de massa** | Energy-analyzer mass-memory log file (TXT/CSV). | Input to the reference tool's load study, not to Releng's MVP. |
| **PRODIST Módulo 8** | ANEEL distribution-procedures module defining voltage bands (Adequada / Precária / Crítica). | Used by the reference tool, not by the Releng MVP. |
| **Estudo de Carga e Demanda** | Load and demand study — the reference tool's report type (low-voltage). | A candidate future Releng report type **[OPEN QUESTION: does Fasor do these?]**. |
| **Parecer** | Technical opinion (preliminary and final), shown in a highlighted box. | Reference-tool pattern. |
| **Mufla** | Cable termination. | Candidate future block. |
| **RBC** (*Rede Brasileira de Calibração*) | Brazilian Calibration Network — traceable calibration accreditation. | Optional field on the instrument record. |
| **LGPD** | Brazil's data protection law. | Governs sending client photos to an LLM provider: consent and data-processing terms needed. |
| **ICP-Brasil** | Brazilian public-key infrastructure for digital signatures. | Sealed PIE-ready PDF should be ICP-Brasil-ready (vision). |
| **Laudo de Continuidade** | Continuity report (SPDA/grounding) — GroundPRO's product. | Competitor scope. |
| **Carimbo (photo stamp)** | Date/time/GPS overlay stamped on a photo. | Reference-tool pattern. |
| **Fasor** | The internal project codename; also the design partner's company name (Fasor Engenharia). | Codename only — never the product name. |

# 7. Constraints

**Technical / platform**

- **Web first:** the MVP runs in the tablet's or phone's browser, on **any platform (Android, iPad, Windows)**, **without app store publishing**. No native mobile apps.
- **Tablet-first, responsive for tablet and phone.** Laptops are a burden in the substation; engineers already carry tablets. (UX reference point: GroundPRO is "Web ≥768 px".)
- **Offline is mandatory:** substations are often in basements with no connectivity; the app saves locally and syncs later and must never lose site data.
- **Browser storage limits** are the hard constraint: "Browsers limit local storage (iPad Safari especially), and the report holds ~76 photos. **Architecture must prove photo-safe offline capture before anything else is built on it.**"
- **All AI processing runs in the backend (it is a SaaS).** AI capture needs connectivity, which substations lack; the design keeps the photo and defers the reading.
- **Open for architecture:** provider and cost per call; on-device OCR for displays (offline) vs. server-side LLM vision; retention of photos sent to the provider.
- **Correctness constraint on AI:** "A misread digit on a measurement is worse than a blank, so confirmation is cheap and the source photo sits beside the value."
- Data model must be multi-tenant and multi-report-type ready, with acceptance criteria stored as citable data (source, edition, table, comparison type, limit, unit), not hard-coded.
- Output format for MVP is **.docx** (editable). PDF comes right after.

**Regulatory**

- **NR-10** revised by **Portaria MTE 737/2026**, in force **1 June 2027**: extends the PIE obligation to every MV substation owner.
- **NR-10 text must be chosen by the job's execution date** (before or after 1 June 2027): old 10.5.1 (6-step de-energization, "AT") vs. new 10.13.1 (7 steps, adds arc flash and area delimitation, "MV") [V/NV]. FO.SERV-03 cites the text that is replaced on 1 June 2027.
- **PIE scope:** before 1 Jun 2027 >75 kW (10.2.4 b, g); after, every MV substation owner (10.15.6) [NV]. Even before 1 Jun 2027, installations above 75 kW already require documented inspections, grounding measurements and action plans.
- **NR-10 10.7.11** requires an inspection report with an action plan and schedule — the basis for points of attention with deadlines.
- **No norm defines the report format.** Most acceptance criteria are relative or come from foreign references. **Neither NR-10 nor NBR 14039 fixes "annual" periodicity** [V].
- **Utilities do not require periodic reports** [V]; **insurers' requirement is market hearsay only** [NV].
- **Allowed sales claims (R11):** the 2027 PIE expansion; NR-10 10.7.11; traceable criteria; tender compliance. **Forbidden claims:** "required by insurers"; "NBR 14039 requires annual maintenance". Neither holds.
- **Retention:** keep ≥10 years (Civil Code art. 205) [Inf].
- **Norms to re-check before encoding criteria:** NETA MTS-2023, NBR 10576:2017, NBR 14039 revision; **NR-10 again by 1 December 2026**.
- **LGPD:** client photos sent to an LLM provider need the client's consent and data-processing terms.
- **Privacy:** the peer tool's sample report contains real third-party names, CNPJs and registrations — keep the media extract out of public material.

**Commercial / cost**

- MVP is built **at no cost** by Matheus Torres, but is meant to become a SaaS; **IP, equity and roles between Matheus and Bruno are undefined**.
- No audience of its own; no marketing channel. Nearest working channel: peer word-of-mouth inside engineers' WhatsApp groups (Bruno belongs to them).
- The team **chose not to subscribe to Mesh Labs** to keep the product independent, so competitive evidence is public only.
- AI cost per call is an open architecture item.
- Price references: Mesh **R$ 1,397/year** (≈ R$ 116/month, 8-tool suite, 50% off for Mesh students, price "rises with each tool", terms allow capping reports per plan); Minipa Link **R$ 0 / 60 / 120 / 180 per month** (watermark removed from R$ 120); Tecniko from **R$ 59.90/month**; Field Control **R$ 525/month for 4 licenses** [V] (Capterra says R$ 295/user [C]); Online OS **R$ 899.99/month**; SafetyCulture **US$ 24–29 per seat/month**; Word/Excel templates **R$ 49.90** one-off (pack of 6 including substation maintenance). No public price: GroundPRO, OMICRON, Megger, Doble, Produttivo, Checklist Fácil. Research suggests **R$ 100–300/month per company** for a SaaS [Inf, low confidence].

**Timeline**

- **No MVP deadline set.** "No target date or next scheduled cabine primária job yet."
- NR-10 revision in force 1 June 2027 sets the regulatory window.
- Competitive window is now: Mesh Labs launched September 2026 (terms 30 Aug, app v1.0.0 9 Sep, launch event 8–10 Sep); Minipa Link launched July 2026 (iOS 7 Sep 2026); Inspekio pre-launch.
- **Build order constraint:** report generation still ships first; AI capture assists follow in order (a)→(d). **Cut order if the timeline tightens: (d) first, then (c); (a) and (b) stay.**
- **Revalidation dates:** 1 Oct 2026 (GroundPRO checklists); 1 Nov 2026 (Mesh terms and Bluetooth); 1 Dec 2026 (Mesh, Minipa Link and GroundPRO prices and features; also re-check NR-10); 1 Mar 2027 (Mesh traction).

# 8. Success criteria and metrics

Verbatim from the brief's Success Criteria table:

| Signal | Target |
| --- | --- |
| Time from end of field work to report ready for signature | **≤ 1 working day**, down from ~7 days today for a large report (baseline to be timed on the next job without Releng). Excludes external lab results (e.g. oil analysis), attached later |
| Field data re-typed after the visit | Zero |
| Keystrokes per equipment sheet | **≤ 20**, measured on the next real job. Baseline: an estimated ~60–120 typed characters per sheet today (from the FO.SERV-03 extraction), to be measured |
| Time per equipment sheet in the field | Baseline to be timed on the next job; target set after the baseline |
| Generated report accepted by Bruno | Only minor edits, no restructuring |
| Real use | Used on Fasor's next real cabine primária job |
| SaaS signal (after MVP) | Bruno keeps using it unprompted; 5–10 other MV service firms interviewed |

**Other quantified facts that frame the targets**

- Current large-report turnaround: **7 days on average**; goal **one day**.
- One job produces a **~119-page** document, **~76 photos**, **94 per-equipment test sheets**, **11 test-report subsections** by location/equipment group.
- Photo record layout: **2-column grid**, captions "Imagem NN: Detalhe…".
- Check items per equipment type: **~5–15**, **15 on the MV breaker sheet** (confirmed by rendering the sheets on 2026-09-18).
- Writing-up lag today: **~15 days** after the work.
- Example job duration: **6–8 September 2026** (3 days on site); the September 2026 job ran over a **4–5 day holiday** and was still unfinished.
- Differentiation metric: **≤ 20 keystrokes per equipment sheet** — "the least typing per sheet in the category".
- Competitive/peer traction reference: **~6 users** of the peer tool from one WhatsApp group, won by **one testimonial**.
- Competitive evidence tally: **5 verified, 23 unverified, 2 disputed, 2 refuted**.

# 9. Competitive positioning

**Stated differentiation (the edge): "proximity to a real user, speed, and the least typing per sheet in the category."** Honest positioning line: **"your report, in your layout, ready to sign"**.

Four claimed edges:

1. **The least typing per sheet.** Mesh Labs reads nameplates by AI; Releng extends camera capture to instrument displays, captions and equipment identity, and measures it: **≤ 20 keystrokes per equipment sheet**.
2. **The provider's own layout, not a vendor template.** Mesh Labs generates a consolidated report (PDF and DOCX, with logos) but on its own fixed template. Releng reproduces the service provider's report, starting with FO.SERV-03, co-designed with the engineer who writes it.
3. **Gaps no MV competitor covers today** (per public evidence): **instrument calibration recorded in the system**, **C/NC/NA checks for the whole substation**, and **points of attention with deadlines**.
4. **Any device.** Web-based; runs on Android tablets and iPads alike; **Mesh Labs is Android-only**.

**Declared table stakes, not edges:** offline capture, AI nameplate reading, brand-agnostic instrument entry, and the output itself. "Brand-agnostic instruments are not a differentiator on their own: Mesh Labs, Minipa Link and GroundPRO all accept manual entry from any brand."

**Competitors**

- **Mesh Labs (Megabras / Mesh Engenharia).** Launched September 2026 (terms 30 Aug; app v1.0.0 on 9 Sep; launch event 8–10 Sep). Same 6 equipment types as the Releng MVP; offline capture; AI nameplate reading (**Gemini with OpenAI fallback**, needs internet); photos per equipment; instrument and serial recorded per measurement. **Consolidated report per activity** (many pieces of equipment in one document): identification, equipment and nameplates, sheets per equipment and test, occurrences, photo record, analysis, conclusion and recommendations; cover with provider's and client's logos, color, header and footer; **exports PDF and DOCX** plus a ZIP with ART and certificate; revisions are frozen; pre-issue checklist includes the ART; the report module sits behind a `reports_enabled` flag. **Gaps seen in code** (absence in minified code does not prove absence): fixed Mesh template (no provider-specific layout), table of contents pending, no C/NC/NA, no NR-10 content, no action plan with deadlines, no thermography, calibration "not recorded in the system" (attachment only), **Android only**, no tablet/iPad mention [V]. **Price:** R$ 1,397/year for an 8-tool suite (≈ R$ 116/month); 50% off for Mesh students; price "rises with each tool"; terms allow capping reports per plan; revalidate 1 Dec 2026. **Channel:** its training school (43.7k YouTube subscribers, though videos don't mention the app); also sells engineering services ("1,392 substations maintained"), so it competes with the providers it wants as customers [Inf]. 2–10 employees.
- **Minipa Link** (instrument maker). Launched July 2026; iOS 7 Sep 2026. Substations page, iPad app, **R$ 60/120/180 per month** (watermark removed from R$ 120). Promises **"final report ready the same day"**. PDF only, block editor, **no ART, calibration or MV sheets**. Near-zero traction.
- **GroundPRO (Elétrica Academy).** SPDA and grounding "Laudo de Continuidade"; offline; **calibration certificate** and an **adequacy schedule (immediate / 30 / 90 / 180 days, with owner)**; **Word and PDF**; no logo. "Checklists Online" announced; revalidate 1 Oct 2026. Also a **UX reference**: web app that works on a phone (the field engineer already pays for it); dashboard of tool cards and a "Nova análise" type picker; start modal (new / open from cloud / import / example); multi-step form (Info / Zones / Analyses / Report / Manual) with client, ART, address, lat/long; autosave with "Draft found → Recover"; project/client selector.
- **Inspekio.** Pre-launch; **pitch almost identical to Releng** ("truly offline", report "without Word").
- **Generic Brazilian field apps.** Market research flags **photo loss and unstable sync** as the top complaint (the offline pain point).
- **Status quo.** A pack of **6 Word/Excel templates** including substation maintenance for **R$ 49.90**.
- **Incumbents.** OMICRON PTM (only DGA import from other brands); Megger PowerDB (Windows tablet, form editor, calibration, TOC); Doble; BlueLogg (Megabras only).
- **New competitive category discovered in the media import: "the dev from the group".** Engineer-developers selling report tools **inside engineers' WhatsApp groups**, ~6 clients from a single group, social proof by peer testimonial. Low barrier to entry; adoption by peer trust.

**Capability matrix (verbatim from the addendum)**

| Capability | Mesh | Minipa Link | GroundPRO (SPDA) | Generic apps | Megger PowerDB | Reference tool* |
| --- | --- | --- | --- | --- | --- | --- |
| Tablet / iPad | No (Android only) | iPad | Web ≥768 px | Yes | Windows tablet | Not seen (desktop use) |
| Consolidated report | Yes, per activity | Per project / work order | Yes | Per work order | Yes | Yes |
| Own layout | Mesh template + logo | Block editor | Fixed template | Logo and colors | Form editor | Logo, cover, watermark, editable sections |
| Table of contents | Pending | — | — | — | Yes | Not seen |
| DOCX | Yes | PDF only | Yes | — | — | Not seen (PDF; HTML project file) |
| Calibration recorded | No (attachment) | — | Yes | — | Yes | No (image annex only) |
| C/NC/NA | — | Checklists | Per point | Checklists | — | Status per photo |
| Action with deadline | No | — | Yes | — | No | Yes (P0–P4 + deadline) |
| AI nameplate | Yes | — | — | — | — | Not seen |
| Bluetooth | Megabras [C] | Minipa | — | — | Megger | Not seen (log-file import) |

\* In the reference-tool column, "Not seen" means not observed in two silent screen recordings, not verified absent.

**The product reference (not a competitor): "Estudo de Carga e Demanda"**

Classified by the user on 2026-09-18 as a **reference for the project**, not a competitor. Source: two Bruno voice notes + two silent 33 s screen recordings forwarded 2026-09-18, analyzed in `imports/extract-media-whatsapp-2026-09-18.md`. Name, price, developer and hosting unknown [NV].

- **What it is:** a web tool for **load and demand studies on low-voltage installations**. Imports energy-analyzer logs (*memórias de massa*), maps their columns, classifies voltage against **PRODIST Module 8** bands (Adequada / Precária / Crítica), draws current/voltage/power charts with min/mean/max tables, and analyzes breaker loading (nominal current, safety reserve, considered capacity, % loading, remaining load) with an **explicit formula line** (e.g. "Capacidade considerada: 600 A × (1 − 20%) = 480 A. Carregamento: 70,72 ÷ 480 = 14,73%. Saldo: 409,28 A"). A second module covers **EV-charging load ("Recarga Veicular")**. Example branding: RAAD Engenharia. Example output: a **~79-page PDF** for an electrical contractor in Brasília, signed by a **technician (CRT/TRT)** rather than an engineer (CREA/ART).
- **UI observed:** top bar with two modules and buttons **Logo · Fundo capa · Marca d'água · Salvar projeto · Salvar HTML**; cover editor; numbered section editor with boilerplate text, a full rich-text bar and **+ Adicionar abaixo · Subir · Descer · Excluir**; mass-memory identification step; period detection (21/08/2026 13:29:29 → 28/08/2026 15:19:29, 7.08 days, "the complete memory is used automatically"); magnitude/phase/PRODIST-band selection with "Padrão automático V F-N + I", "Detectar tensões PRODIST", 220/380 V reference, column-mapping table; chart step with PRODIST band tables, 1,023-record current chart and statistics; breaker analysis card with three phase gauges (R/S/T), KPI cards, the formula line, and an **auto-generated technical paragraph** ("Observação técnica / preenchimento manual") with an index field and "+ Adicionar segundo disjuntor opcional".
- **Generated report structure observed:** p.1 "DIRETRIZ TÉCNICA CENTRAL" box, responsible-technician block, **"CONTROLE DO DOCUMENTO"** table; then 2 Objetivo · 3 Resumo executivo e parecer preliminar (red box **"PARECER PRELIMINAR — AUMENTO DE CARGA NÃO LIBERADO"**) · 4 Escopo · 5 Referências normativas (NR-10, NBR 5410, NBR 14039, PRODIST, NBR 17019) · 6 Metodologia · 7 Diagnóstico (yellow box "CONDIÇÃO NECESSÁRIA") · 8 monitoramento · 9 Análise individual das proteções (9.1–9.4, each with a number-derived paragraph and an "As Built" caveat) · 11 Adequação à NR-10 e NBR 5410 (**Tema / Requisito / Referência / Ação** table) · 12 Estudos complementares · 13 **Plano de ação recomendado** (**Prioridade P0 Imediato … P4 Final / Prazo / Ação recomendada**) · 14 Condições para aumento de carga · 15 Conclusão geral (summary table per point; **risk matrix** Categoria / Risco / Consequência potencial — térmico, limite a montante, proteção, curto-circuito, desequilíbrio, regulatório, operacional, contratual, segurança; 15.6 pontos identificados; 15.7 recomendações consolidadas) · final *parecer* box + signature. Annexes: per-point measurement tables, **RBC traceable calibration certificates pasted as images**, per-point charts, per-point technical note, and a **photo record where each photo carries a stamp "Câmera | 21/08/2026, 13:12:23 | GPS: −15.79…, −47.88…" plus a mini status table (Item / Valor / Un. / Status / Obs.)**. Client visual identity on every page: logo, header/footer with address, services and slogan, decorative frame, pagination.
- **Why it is a reference, not a rival:** different report type (load study, not MV substation maintenance); desktop use with a mouse; fed by files, not by field capture. **No sign of tablet support, offline mode, per-equipment sheets, C/NC/NA checks, registered instruments or equipment history.** Same job, though (data → branded technical report) and the same buyers, so **its output is the benchmark for Releng's**.
- **Commercial observation:** sold by an engineer-developer in Bruno's own WhatsApp groups; about six group members already use it; one posted that it works, which drew the rest. Bruno's read: it "makes the field process and the work after it much easier" [NV, transcription uncertain] but **"we want to build something better"**.
- **Verbatim audio 1 (25.7 s, `WhatsApp Ptt 2026-09-18 at 17.14.53.ogg`):** *"Fala Piru, tudo bem? Boa tarde. Olha aí, esse aí é um cara que tem um grupo aqui de engenheiros e tal, e esse cara tá desenvolvendo um softwarezinho desse aí que [igualzinho ao que] a gente falou, e tá vendendo pra galera dos grupos aqui. Olha aí como é que é mais ou menos, aqui ele passa bem rápido a estrutura, né? Vou te mandar o que gera depois aqui, ele mandou também o relatório pronto, como é que fica. Dá uma olhada aí, basicamente isso aí. Só que a gente quer fazer um negócio mais top, né?"* ("Hey Piru, all good? Good afternoon. Look, this guy runs an engineers' group here, and he's developing a little piece of software just like the one we talked about, and he's selling it to the people in the groups. Look roughly how it is — he runs through the structure quickly here. I'll send you what it generates afterwards; he also sent the finished report, how it turns out. Take a look, basically that's it. Except we want to build something better, right?") Uncertain segment: automatic recognition gave "que golzinho a gente falou"; most likely reading "igualzinho ao que a gente falou".
- **Verbatim audio 2 (17.1 s, `WhatsApp Ptt 2026-09-18 at 17.15.42.ogg`):** *"Aí, pelo que eu vi, já tem uma meia dúzia de gente que veio do grupo que já tava fazendo com ele, usando esse software dele, né? Tanto que esse daí é um cara que mandou também falando que funciona, não sei o quê, e a galera já fica interessada, né? Porque, cara, isso [facilita] muito o processo em campo e também o pós, né?"* ("From what I saw, there's already about half a dozen people from the group already working with him, using his software. In fact one guy posted saying it works and so on, and everyone gets interested. Because, man, this makes the field process and the after-work much easier, right?") Uncertain segment: recognition gave "fragiliza muito o processo em campo e também oposa"; by context the likely reading is **"facilita"** … **"o pós"** (the office work after the visit). Recorded as uncertain.
- **Media provenance:** `docs/media/` — 2 PTT audios (.ogg) and 2 videos (.mp4), all 2026-09-18, 17:14–17:15. Transcribed with faster-whisper (model `medium`, pt-BR, CPU); frames extracted every 3 s with ffmpeg; frames read visually. Both videos are **silent screen recordings** (measured level −91 dB). Raw transcripts in `docs/media/transcricoes/`; contact sheets and crops in `docs/concorrentes/frames-reference-tool/`.

# 10. Explicit non-goals / out of scope / deferred

**Out (explicitly), verbatim from the brief's Scope › Out:**

- Other report types (electrical panel, SPDA lightning protection).
- Scanning handwritten paper sheets (the goal is to drop paper entirely).
- Bluetooth instrument integration.
- Digital signature and ART (technical responsibility registration) integration.
- Comparison with the previous report.
- Real-time multi-user editing of the same report.
- Billing, subscriptions, public signup.
- PDF export (right after the MVP), including a sealed, PIE-ready version.
- Dedicated grounding and 50/51 relay test sheets: Fasor performs both, so they are the first additions after the MVP.
- Native mobile apps.

**Also explicitly deferred or structure-only:**

- **No UI** for new report types, criteria editing or onboarding other companies — these exist in the data model only ("structures ready"): multiple report types and companies (tenants); acceptance criteria as data with their source; stable equipment identity (TAG) across visits; NR-10 text chosen by execution date.
- **OCR of handwritten A4 sheets** — proposed by Matheus, **out of MVP**; Bruno prefers dropping paper entirely.
- **AI capture assist cut order if the timeline tightens:** cut (d) equipment-type and TAG suggestion first, then (c) photo auto-caption. (a) nameplate and (b) instrument display OCR stay. **Report generation still ships first.**
- **No Mesh Labs benchmark** before freezing scope: the team declined competitive research recommendation R1 (subscribe to Mesh Labs and reproduce a real Fasor report on it) to keep the product independent.
- **Not an internal-only tool:** the team rejected market research recommendation R1 (build an internal tool for Fasor first, with no SaaS structure) in favour of an MVP of a SaaS.
- **Per-utility registry** (grounding limit, shutdown notice, seals): later.
- **Forbidden marketing claims:** "required by insurers"; "NBR 14039 requires annual maintenance".
- **Vision items, not MVP:** catalog of report types (panels, SPDA, grounding, possibly load and demand studies); equipment history across visits with comparison against the previous report; sealed PIE-ready PDF with version, hash and 10-year retention; editable acceptance criteria per company and per utility; public per-company pricing.

# 11. Open questions and stated assumptions

**Pending inputs (brief)**

- **MVP deadline.** No target date and no next scheduled cabine primária job yet.
- **Reference tool details.** Name, price, developer and licensing of the "Estudo de Carga e Demanda" software Bruno forwarded on 2026-09-18 — and whether **Fasor also performs load and demand studies**, which would make them a candidate report type. (The media extract adds: ask Bruno for the software name, price, who the developer is, and a link; not confirmed whether it is hosted web or local HTML.)
- **Name availability.** "Releng" chosen 2026-09-18 after "Voltlog" proved taken. **Releng's domains, INPI registration and app-store names are not yet checked**; "releng" is also software jargon for *release engineering*, which may crowd search results.

**Open questions embedded elsewhere**

- **Ownership and partnership:** IP, equity and roles between Matheus and Bruno are undefined.
- **Architecture-open AI items:** provider and cost per call; on-device OCR for displays (offline) vs. server-side LLM vision; retention of photos sent to the provider; client consent wording and data-processing terms (LGPD).
- **Acceptance criteria:** FO.SERV-03's fixed **400 MΩ** insulation limit has no known source; references vary widely (NETA MTS-2019 asks 5,000 MΩ at 2.5 kV DC [V, edition-dependent]; CPFL releases energization at >30 MΩ [NV]). Hard-coding one company's limits would break the SaaS story.
- **Norms to re-check before encoding criteria:** NETA MTS-2023, NBR 10576:2017, NBR 14039 revision, NR-10 again by 1 December 2026.
- **Signing rights:** whether a technician with TRT may sign is contested (CFT × CONFEA) [C].
- **Pricing:** R$ 100–300/month per company suggested [Inf, low confidence].

**Stated assumptions**

- **[ASSUMPTION: the same engineers]** assemble and review the report in the office (the secondary user).
- **[ASSUMPTION]** the voice-note speaker is Bruno Matsui addressing Matheus; there is no explicit identification in the audio. "Piru" appears to be the recipient's nickname.
- **[Inf]** "save project" and "save HTML" buttons suggest a single local project file, no cloud (reference tool).
- **[Inf]** Mesh Labs sells engineering services too, so it competes with the providers it wants as customers.
- **[Inf]** Retention ≥10 years per Civil Code art. 205.
- Names dropped/rejected: **Voltlog** (free at INPI, but voltlog.com, .com.br — an EV-charging product registered August 2026 — .app and .io are taken, plus two same-niche apps: VoltLog by Nexten, Malaysia, electrical testing and commissioning with reports; and "VoltLog App", a field notebook for electricians on the Brazilian App Store). Quick-checked free alternatives at the time: **Voltlaudo, Laudovolt, Subelog**. Rejected: **Religa, Laudo Pronto, Isola** (first round, not liked); **Laudex, Neutro** (second round).

# 12. Qualitative: tone, feel and ways of working a requirements list would drop

- **The principle is emotional as much as functional.** "Type as little as possible" is not a nice-to-have; it is the product's identity. Every design decision is measured against keystrokes in a basement with no signal, gloves and a tablet.
- **Confirmation is the trust contract.** The AI never writes. Suggestions are visually distinct (amber, labelled "Sugerido"), always reversible, never printed while unconfirmed, and never overwrite the engineer's own typing. "A misread digit on a measurement is worse than a blank." The source photo sits beside the value so the engineer can check without leaving the field.
- **Silence rather than a guess.** Low-confidence fields are left blank, never guessed.
- **Honest positioning, explicitly chosen.** The brief calls its own positioning "honest" and repeatedly refuses over-claiming — forbidden sales claims are listed by name, competitor gaps are hedged ("absence in minified code does not prove absence"), and the evidence tally (5 verified vs. 23 unverified) is printed rather than hidden.
- **The design partner's bar is aspirational, not minimal.** Bruno has already seen what a solo developer ships (editable sections, generated text, charts, own branding, PDF) and treats that as the **floor**: *"a gente quer fazer um negócio mais top"*.
- **The output must look like the provider's own document, not a vendor's.** Logo, cover, watermark, header/footer, document-control table — brand identity on every page. "Your report, in your layout, ready to sign."
- **Written-up-later is the enemy.** The goal is to "leave the site with complete data" and "deliver without a second shift at the desk" — the emotional pain is the evening and weekend work, not the typing itself.
- **Paper is to be dropped entirely, not digitized.** Bruno explicitly refused the OCR-the-paper-sheet path. This is a stance, not a scoping detail.
- **Peer trust is the go-to-market instinct.** Adoption in this market happens by one engineer posting in a WhatsApp group that something works. The product must be demo-able and shareable inside a group chat.
- **Auditability as a feel.** The reference tool shows formulas explicitly ("600 A × (1 − 20%) = 480 A"); generated narrative is editable; criteria carry their source. Engineers sign their name to this document — nothing may be opaque.
- **The report reads as a legal artifact.** Highlighted *parecer* boxes, document-control tables, risk matrices, signature tied to ART/CREA. Tone is formal, numbered, defensible.
- **Ways of working:** decisions are dated and logged (2026-09-18 morning vs. afternoon reversals are recorded); research recommendations that were declined are recorded as "Divergences from the research" rather than quietly dropped; every claim carries a confidence tag ([V]/[NV]/[C]/[Inf]); competitive claims carry revalidation dates.
- **Privacy discipline.** The media extract contains real third-party CNPJs, names and professional registrations and is explicitly marked as not to be propagated to public material.

# 13. Risks and evidence weaknesses the brief admits

- **Evidence strength (stated verbatim in the Problem section):** "one engineer at one company, with no independent user voice in market research. Real for the design partner, unvalidated beyond it."
- **Single design partner.** "One company's template shapes everything, risking a Fasor-only tool."
- **Ownership and partnership undefined.** The MVP is free but meant to become a SaaS; IP, equity and roles between Matheus and Bruno are undefined.
- **Offline in a browser.** Browsers limit local storage (iPad Safari especially) and the report holds ~76 photos. "Architecture must prove photo-safe offline capture before anything else is built on it."
- **Competitive window, no hands-on benchmark.** Mesh Labs is moving now; Minipa Link has an instrument maker's scale; GroundPRO announced checklists. Barrier to entry is low — a solo engineer-developer sells a report generator to peers with no marketing beyond a group testimonial. The team chose not to subscribe to Mesh Labs, "so competitive evidence is public only; recheck it on the addendum's revalidation dates."
- **Competitive evidence quality:** "mostly vendor pages and public JS code, and no product was tested with a login. Tally: **5 verified, 23 unverified, 2 disputed, 2 refuted**." Competitor gaps seen in minified code do not prove absence.
- **Reference-tool evidence is indirect:** 34 s of fast screen scrolling, no audio; product name, price, licensing and sales model do not appear; not confirmed whether it is hosted web or local HTML. Transcription of both voice notes contains uncertain segments.
- **AI capture risks.** Needs connectivity, which substations often lack (mitigated: keep the photo, defer the reading). Cost per call and provider choice are architecture's call. A misread digit is worse than a blank (mitigated: confirmation plus source photo). Client photos sent to an LLM provider need consent and data-processing terms (LGPD).
- **Channel risk.** Mesh Labs and Elétrica Academy (GroundPRO) sell through their own training schools with student discounts; **Releng has no audience of its own**. The nearest working channel observed is peer word-of-mouth in engineers' WhatsApp groups, where one testimonial won about six users for the reference tool; Bruno belongs to those groups, so they are the first channel to test.
- **NR-10 angle risk.** Sell on the 2027 PIE expansion, item 10.7.11 and traceable acceptance criteria. Never claim "required by insurers" or "NBR 14039 requires annual maintenance" — neither holds. FO.SERV-03 cites the NR-10 text replaced on 1 June 2027; later reports need the new text.
- **Acceptance-criteria risk.** FO.SERV-03's fixed 400 MΩ insulation limit has no known source and references vary widely; hard-coding one company's limits would break the SaaS story.
- **Differentiation to protect (media extract):** field capture on tablet, offline, per-equipment sheets with minimum typing, and AI capture — none of which appear in the reference tool. But the **output** (branded PDF/DOCX, generated text, action plan) must at minimum reach the level already seen, "or Bruno's 'mais top' does not hold up."
- **Naming risk.** Releng's domains, INPI registration and app-store names unchecked; "releng" collides with the software term *release engineering*.
- **Divergences from research (accepted risks, recorded explicitly):**
  - **SaaS-ready MVP vs. market research R1** (build an internal tool first, no SaaS structure) — team chose an MVP of a SaaS.
  - **No Mesh Labs benchmark vs. competitive research R1** (subscribe and reproduce a real Fasor report before freezing scope) — declined to keep the product independent.
  - **AI-assisted capture as the mandate vs. market research R5 and competitive research R5** (manual entry first; advised against AI nameplate reading). The team first pulled AI nameplate reading into the MVP as parity with Mesh Labs, last in the queue (morning of 2026-09-18); in the afternoon the user reversed that, making AI-assisted capture the product's mandate and part of the core flow, because the tool lives in the field and usability there means typing as little as possible. Report generation still ships first; the R5 rationale (cost, connectivity, misreads) "is answered by design (suggestions only, confirmation cheap, photo kept and deferred offline) and by the risks listed in the brief."
