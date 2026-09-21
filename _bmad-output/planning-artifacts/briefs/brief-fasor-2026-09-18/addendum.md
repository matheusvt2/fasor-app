---
title: "Addendum: Product Brief Releng"
created: 2026-09-18
updated: 2026-09-18
---

# Addendum: Product Brief Releng

Detail captured during discovery that belongs downstream (PRD, architecture, UX) rather than in the brief itself, including detail cut from the brief during the 2026-09-18 length pass.

**Confidence tags** (used in the research-derived sections): [V] verified; [NV] not verified (usually a primary source without independent check); [C] contested or disputed; [Inf] inference. A qualifier inside the brackets, such as "edition-dependent" or "low confidence", narrows the tag.

## Current report anatomy (FO.SERV-03)

- **Report:** FO.SERV-03, Fasor Engenharia — a technical report on a primary substation. Received titled "Laudo Técnico de Cabine Primária", Rev. 00; **renamed "Relatório Técnico de Cabine Primária", Revisão 01 (decision 2026-09-19).**
  - *Why:* the received file calls itself a **relatório** eight times in its own body — §1 Objetivo ("O presente relatório tem por objetivo apresentar"), §4 Requisitos twice ("deve ser elaborado relatório técnico…", "comparar os resultados de relatórios anteriores"), §4 documentação ("Folha de registro do relatório da manutenção anterior"), §5 ("Conforme determinação da NR-10, este relatório deve fazer parte do prontuário da instalação (PIE)"), the §9 title ("RELATÓRIOS DOS ENSAIOS") and §10 twice — and says "laudo" only twice, both in fixed chrome: the page header (the form title) and the ART validity line. NR-10 names the required document a *relatório* in both the current 10.2.4 g and the 10.7.11 in force from 2027-06-01. *Laudo* in the CONFEA sense (Res. 345/1990) is the **perito's** piece, and NBR 14039 7.1.5 asks for one at *verificação final* — a different moment from preventive maintenance; the same split shows in practice, where EDP, Cemig and CPFL require laudos at connection, not a periodic maintenance report.
  - *Scope:* product vocabulary, UI, routes, spines and the generated document all say **relatório**. The form code FO.SERV-03 is unchanged. The received file keeps its own filename wherever it is cited as a source, and the market-research folders keep their names.
- **Source:** `docs/context/FO.SERV-03 Laudo Técnico de Cabine Primária.docx`, an example job for Porto Seguro executed 6–8 September 2026. Its table of contents runs to about p. 119.

The report is made of these parts:

- **Header/footer:** document code + revision, company data, pagination.
- **Client block:** client, city/site, execution dates, additional info, responsible person.
- **Sections:**
  1. Objective
  2. Definitions (contact resistance, transformation ratio, insulation, grounding)
  3. Scope limits and exclusions
  4. Requirements (ART, the engineer's technical responsibility record; EPC/EPI, collective/personal protective equipment; test instruments; tools)
  5. Safety recommendations (NR-10 10.5.1 de-energization sequence)
  6. Checks and tests per equipment type
  7. Photo record (~76 photos, 2-column grid, "Imagem NN: Detalhe…")
  8. Points of attention and suggested corrective actions
  9. Test reports (11 subsections by location/equipment group, 94 sheets)
  10. Conclusion + engineer signature (name, CREA engineering-council registration) tied to the ART
  11. Instrument calibration certificates (pasted as images)
- **Per-equipment test sheet** (currently pasted into Word as EMF images from Excel):
  - Equipment data: TAG, manufacturer, serial no., manufacture date, rated voltage/current, extinction medium (SF6/oil), drive type.
  - General checks: numbered items with C / NC / NA columns (conforme / não conforme / não se aplica: conforming / nonconforming / not applicable) plus an observations column, ~5–15 per type (15 on the MV breaker sheet). Confirmed by rendering the sheets on 2026-09-18.
  - Grounding appears only as a checklist item (e.g. "Aterramento", "Aterramento cordoalhas"); there is no dedicated grounding test sheet. The MV breaker sheet has an "AJ. RELÉ 50/51" field (relay setting) and a "relé de acionamento" check item; there is no dedicated relay test sheet.
  - Insulation test: instrument, serial, certificate, test voltage, acceptance value printed on the sheet (">400" MΩ; contact resistance "<250" µΩ), phases A/B/C × ground, readings at 30 s / 1 min / 10 min, absorption and polarization indices.
  - Contact resistance test: µΩ, T1-T2…
  - Transformation ratio test: TTR, theoretical vs. measured.
  - Test environment: temperature, humidity.
  - Conclusion: Approved / Rejected, with/without restrictions, plus observations.
- **Sheet types:** incoming/substation cables, disconnector (seccionadora), MV circuit breaker, VT/CT (TP/TC), transformer, feeder cables.
- **Norms cited in the document:** NR-10 (PIE, the electrical installations dossier; 10.5.1) and NBR 5419 only. NBR 14039 is not cited.

## Domain rules for the report model

Source: domain research, 2026-09-18 (`_bmad-output/planning-artifacts/research/domain-manutencao-preventiva-e-laudo-de-cabine-2026-09-18/research.md`). Section references (§) point to that document.

- **No norm defines the report format.** Most acceptance criteria are relative or come from foreign references.
- **Acceptance criteria vary widely.** Insulation for 15 kV: NETA MTS-2019 asks for 5,000 MΩ at 2.5 kV DC [V, edition-dependent]; CPFL releases energization at >30 MΩ [NV]. No source was found for the 400 MΩ value in FO.SERV-03. Store criteria as citable data: source, edition, table, comparison type, limit, unit.
- **Fields per sheet (§2.10):**
  - Insulation resistance per phase/pole: applied kV, 30 s / 1 min / 10 min, temperature, value corrected to 20 °C (Tab. 100.14 [V]); PI/DAR.
  - Contact resistance per pole (µΩ, test current in A); fuses (difference ≤15%); TTR on all taps (≤0.5%) [V]; vacuum bottle; trip-free/anti-pump; timings (ms).
- **As-found / as-left:** breaker operation counter before and after; relay settings found and left; as-found tests before cleaning (§2.5, §4).
- **Relay 50/51 sheet** (NR-10 10.12.7, NBR 14039 8.2.2.4, public tenders) [V]: pickup/dropout, 2 curve points, manufacturer tolerance, breaker trip by each relay.
- **Grounding sheet:** fall-of-potential with curve, soil condition, limit with its source (CPFL 10/25 Ω) and continuity (SPDA) [NV].
- **Other candidate blocks:** thermography before de-energization, oil lab annex (NBR 10576 table [C]; DGA not obtained), general functional test, surge arresters, cable terminations (muflas).
- **Historical criteria:** several limits compare against the previous test (winding ≤2% [NV], PI vs. history), so equipment needs a stable identity (TAG) across visits.
- **Instruments:** certificate, date, lab, RBC optional, owner-defined interval. Expiry alert, no blocking [V].
- **ART:** number and type (multiple/monthly or tied to the work order); CREA or CRT. Whether a technician with TRT may sign is contested (CFT × CONFEA) [C].
- **NR-10 by execution date:** the old text (10.5.1, 6-step de-energization; "AT" label) is replaced from 1 June 2027 by 10.13.1 (7 steps, adds arc flash and area delimitation; "MV" label) [V/NV]. Before that date, the PIE covers >75 kW (10.2.4 b, g); after it, every MV substation owner (10.15.6) [NV].
  - Even before the revised text takes effect (1 June 2027), installations above 75 kW already require documented inspections, grounding measurements and action plans.
- **Roles:** qualified professional in charge (PLH) vs. authorized executors (NR-10 10.12.9) [NV].
- **Periodicity:** neither NR-10 nor NBR 14039 fixes "annual" [V]. Store the next recommended intervention as declared data with its justification.
- **Who asks for the report:** utilities do not require periodic reports [V]; insurers' requirement is market hearsay only [NV]. The report feeds the client's PIE.
- **Retention:** keep ≥10 years (Civil Code art. 205) [Inf]; PIE-ready output would be a sealed PDF with hash and version, ICP-Brasil-ready.
- **Norms to re-check before encoding criteria:** NETA MTS-2023, NBR 10576:2017, NBR 14039 revision; NR-10 again by 1 December 2026.
- **Per-utility registry** (grounding limit, shutdown notice, seals): later.
- **Allowed / forbidden sales claims (R11):**
  - Use: the 2027 PIE expansion; NR-10 10.7.11, which requires an inspection report with an action plan and schedule (the sales angle next to the 2027 PIE expansion); traceable criteria; tender compliance.
  - Do not claim "required by insurers" or "NBR 14039 requires annual maintenance".

## UX references

Source: screenshots in `docs/context/`.

- **GroundPRO (Elétrica Academy):**
  - Web app that works on a phone; the field engineer already pays for it.
  - Dashboard of tool cards and a "Nova análise" type picker.
  - Start modal: new / open from cloud / import / example.
  - Multi-step form (Info / Zones / Analyses / Report / Manual) with client, ART, address, lat/long.
  - Autosave with "Draft found → Recover"; project/client selector.
- **Peer-built load-study tool** (2026-09-18): section editor with boilerplate and move/delete controls, generated narrative, photo stamps and report tables; see "Product reference: peer-built load-study tool" below.
- **Megabras / Mesh "Teste rápido":** pick an equipment type (autotransformer, disconnector, conductor, breaker, CT, VT, transformer), add units, fill nameplate data with a required-field counter; a "Use AI to extract data from photo" button.

## Product reference: peer-built load-study tool

Classified by the user on 2026-09-18 as a **reference for the project**, not a competitor: it shows the editor and output quality Releng must at least match. Source: two voice notes from Bruno and two silent screen recordings (33 s each) forwarded on 2026-09-18, analyzed in `imports/extract-media-whatsapp-2026-09-18.md` with frame captures. Product name, price, developer and hosting are unknown; none appears in the media [NV]. Speaker identity is an assumption (Bruno addressing Matheus).

- **Why it is a reference, not a rival:** different report type (load study, not MV substation maintenance); desktop use with a mouse; fed by files, not by field capture. No sign of tablet support, offline mode, per-equipment sheets, C/NC/NA checks, registered instruments or equipment history. Same job, though (data → branded technical report) and same buyers, so its output is the benchmark for Releng's.
- **What it is:** a web tool called "Estudo de Carga e Demanda" (load and demand study) for low-voltage installations. It imports energy-analyzer logs (*memórias de massa*), maps their columns, classifies voltage against PRODIST Module 8 bands, draws current/voltage/power charts with min/mean/max tables, and analyzes breaker loading (nominal current, safety reserve, considered capacity, % loading, remaining load) with an explicit formula line. A second module covers EV-charging load. Example branding: RAAD Engenharia; example output: a ~79-page PDF for an electrical contractor in Brasília, signed by a technician (CRT/TRT) rather than an engineer (CREA/ART).
- **Who sells it and how:** an engineer-developer who belongs to the same engineers' WhatsApp groups as Bruno. About six group members already use it; one posted that it works, which drew interest from the rest. Bruno's read: it "makes the field process and the work after it much easier" [NV, transcription uncertain] but "we want to build something better".
- **Patterns worth matching or beating** (candidates for PRD and UX, not the brief):
  - numbered sections with boilerplate text, rich-text editing, and add-below / move up / move down / delete controls (matches the template composer already in the UX design);
  - narrative paragraphs generated from the numbers (per-breaker conclusion), editable, with the formula shown for audit;
  - per-company branding: logo, cover background, watermark, header and footer on every page;
  - "document control" table: document, revision, date, client and provider (with CNPJ, the company tax ID), responsible person, ART/TRT, service period;
  - highlighted boxes for the preliminary and final opinion (*parecer*) and for necessary conditions;
  - action plan table with priority P0 (immediate) to P4 (final), deadline and recommended action;
  - NR-10/NBR 5410 adequacy table (topic, requirement, reference, action);
  - risk matrix (category, risk, consequence);
  - photos stamped with date, time and GPS coordinates, each with a mini status table (item, value, unit, status, remarks);
  - calibration certificates pasted as images in an annex;
  - a professional-registration field that accepts CRT/TRT (technicians) as well as CREA/ART (engineers);
  - "save project" and "save HTML" buttons suggest a single local project file, no cloud [Inf].
- **Privacy:** the sample report contains real third-party names, CNPJs and registrations; keep the extract out of public material.

## Competitive landscape

Source: competitive research, 2026-09-18 (`_bmad-output/planning-artifacts/research/competitive-laudos-cabine-primaria-2026-09-18/research.md`). The peer-built tool in the matrix is a product reference, not a competitor (see "Product reference" above). Evidence is weak overall: mostly vendor pages and public JS code, and no product was tested with a login. Tally: 5 verified, 23 unverified, 2 disputed, 2 refuted.

### Mesh Labs (Megabras / Mesh Engenharia)

- Launched September 2026 (terms 30 Aug, app v1.0.0 9 Sep, launch event 8–10 Sep).
- Same 6 equipment types as the Releng MVP; offline capture; AI nameplate reading (Gemini with OpenAI fallback, needs internet); photos per equipment; instrument and serial recorded per measurement.
- **Consolidated report per activity** (many pieces of equipment in one document): identification, equipment and nameplates, sheets per equipment and test, occurrences, photo record, analysis, conclusion and recommendations. Cover with the service provider's and client's logos, color, header and footer. **Exports PDF and DOCX**, plus a ZIP with ART and certificate; revisions are frozen; pre-issue checklist includes the ART. The report module sits behind a `reports_enabled` flag.
- **Gaps seen in code** (absence in minified code does not prove absence): fixed Mesh template (no provider-specific layout), table of contents pending, no C/NC/NA, no NR-10 content, no action plan with deadlines, no thermography, calibration "not recorded in the system" (attachment only). **Android only**, no tablet/iPad mention [V].
- **Price:** R$ 1,397/year for an 8-tool suite (≈ R$ 116/month); 50% off for Mesh students; price "rises with each tool"; terms allow capping reports per plan. Revalidate 1 December 2026.
- **Channel:** sells through its training school (43.7k YouTube subscribers, though videos don't mention the app). Also sells engineering services ("1,392 substations maintained"), so it competes with the providers it wants as customers [Inf]. 2–10 employees.

### Other players

- **Minipa Link** (instrument maker; launched July 2026, iOS 7 Sep 2026): Substations page, iPad app, R$ 60/120/180 per month (watermark removed from R$ 120). Promises "final report ready the same day". PDF only, block editor, no ART, calibration or MV sheets. Near-zero traction.
- **GroundPRO** (Elétrica Academy): SPDA and grounding "Laudo de Continuidade", offline, with calibration certificate and an adequacy schedule (immediate / 30 / 90 / 180 days, with owner), Word and PDF, no logo. "Checklists Online" announced; revalidate 1 October 2026.
- **Inspekio:** pre-launch, pitch almost identical to Releng ("truly offline", report "without Word").
- **Generic field apps:** market research flags photo loss and unstable sync as the top complaint about generic Brazilian field apps (the offline pain point).
- **Status quo:** pack of 6 Word/Excel templates including substation maintenance for R$ 49.90.
- **Incumbents:** OMICRON PTM (only DGA import from other brands), Megger PowerDB (Windows tablet, form editor, calibration, TOC), Doble. BlueLogg (Megabras only).

### Capability matrix

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

**Brand-agnostic instruments** are not a differentiator on their own: Mesh Labs, Minipa Link and GroundPRO all accept manual entry from any brand.

### Price references

Mesh R$ 1,397/year · Minipa Link R$ 0/60/120/180 per month · Tecniko from R$ 59.90/month · Field Control R$ 525/month for 4 licenses [V] (Capterra says R$ 295/user [C]) · Online OS R$ 899.99/month · SafetyCulture US$ 24–29 per seat/month · Word/Excel templates R$ 49.90 one-off. No public price: GroundPRO, OMICRON, Megger, Doble, Produttivo, Checklist Fácil. Research suggests R$ 100–300/month per company for a SaaS [Inf, low confidence].

### Revalidation dates

- 1 October 2026: GroundPRO checklists.
- 1 November 2026: Mesh terms and Bluetooth.
- 1 December 2026: Mesh, Minipa Link and GroundPRO prices and features.
- 1 March 2027: Mesh traction.

## Discovery meeting ideas

Not yet scoped, except where an item is marked in or out of the MVP.

- **Equipment blocks:** build the report from equipment "blocks" (drag-and-drop mental model, like draw.io), each carrying its predefined checks and tests; set quantities upfront or add units in the field.
- **Office pre-fill:** the office pre-fills the report before the visit; the field engineer completes it.
- **Registries/pick lists:** voltage classes (15 / 17.5 / 23 kV…), manufacturers, test instruments selected by code (auto-fills serial, certificate).
- **Photo object:** image + caption, reused in the gallery and as thumbnails next to each test table; points of attention reference photos by number.
- **Hierarchy:** Project/client → N reports → report type (future types: electrical panel, SPDA lightning protection system).
- **Nameplate extraction from photo (OCR/AI):** **in MVP scope** (decided 2026-09-18), with the engineer confirming the extracted fields. Since the afternoon mandate of 2026-09-18 it is the first of four AI capture assists in the core flow (see AI-assisted capture below and Divergences from the research).
- **OCR of handwritten A4 sheets:** proposed by Matheus; Bruno prefers dropping paper entirely. **Out of MVP.**

## AI-assisted capture (mandate of 2026-09-18)

Source: user mandate given during the UX session of 2026-09-18 (afternoon), recorded in `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/.memlog.md`. Verbatim (Portuguese): *"Como é algo a ser usado no campo, quanto mais inteligente for, melhor. Quero que o usuário digite o menos possível — aqui a usabilidade do usuário é chave! O uso de OCRs e de identificação de imagem inteligente por LLM deve ser incentivado e usado para melhorar a usabilidade do usuário — esse é nosso mandate."*

What UX had already specified before the mandate (EXPERIENCE.md › Component Patterns › Nameplate extraction; State Patterns; Flow 2b), now the pattern for every assist:

- The photo is saved as a normal photo of the sheet and queued like any other; the reading requires a connection and, offline, runs on the next connection ("Sem conexão — a leitura fica disponível quando houver sinal"), with suggestions appearing on the next open of the sheet.
- Results are **suggestions** (amber fill, label "Sugerido") confirmed per field or with "Confirmar todos"; nothing is written unconfirmed; low-confidence fields are left blank, never guessed; a field the engineer already filled is never overwritten (a differing suggestion offers "Substituir"); typing into a suggested field discards that suggestion.
- States: extracting / offline / failed ("Tentar novamente / Preencher manualmente", photo kept) / suggestions pending (not counted as filled by the Progress counter, never printed).

Assists to carry into the PRD, in build order: (a) nameplate from a photo (LLM vision); (b) instrument display OCR (megôhmetro / microhmímetro / TTR readout into the measurement cell, source photo shown beside the value); (c) photo auto-caption (activity / equipment / location proposed for the caption Comboboxes); (d) equipment-type and TAG suggestion from a photo of the cubicle label (extends the existing type+column TAG suggestion). Non-AI assists on the same principle: smart defaults (copy from the last sheet, the same column, the previous visit by TAG) and bulk actions. Cut order if the timeline tightens: (d), then (c); (a) and (b) stay.

Open for architecture: provider and cost per call; on-device OCR for displays (offline) versus server-side LLM vision; retention of photos sent to the provider; client consent wording and data-processing terms (LGPD).

## Divergences from the research

- **SaaS-ready MVP (vs. market research R1):** market research recommendation R1 was to build an internal tool for Fasor first, with no SaaS structure. The team chose an **MVP of a SaaS** instead: one report type delivered well, with the data model ready for multiple report types and tenants but no UI for either.
- **No Mesh Labs benchmark before freezing scope (vs. competitive research R1):** competitive research recommendation R1 was to subscribe to Mesh Labs and reproduce a real Fasor report on it before freezing scope. The team declined, to keep the product independent.
- **AI-assisted capture as the product's mandate (vs. market research R5 and competitive research R5):** market research recommendation R5 was manual entry first, and competitive research R5 also advised against AI nameplate reading. The team first pulled AI nameplate reading into the MVP as parity with Mesh Labs, last in the queue (morning of 2026-09-18). In the afternoon of 2026-09-18 the user reversed that stance: AI-assisted capture (nameplate, instrument display, auto-caption, equipment/TAG suggestion) is now the product's mandate and part of the core flow, because the tool lives in the field and usability there means typing as little as possible. Report generation still ships first; the rationale of both R5s (cost, connectivity, misreads) is answered by design (suggestions only, confirmation cheap, photo kept and deferred offline) and by the risks listed in the brief.

## Product names considered

- **Chosen:** Releng (*relatório de engenharia*), on 2026-09-18. Availability not yet checked.
- **Dropped after check:** Voltlog (*volt* + *log*). Free at INPI, but voltlog.com, .com.br (EV-charging product, registered August 2026), .app and .io are taken, and two same-niche apps exist: VoltLog by Nexten (Malaysia, electrical testing and commissioning with reports) and "VoltLog App" (field notebook for electricians, Brazilian App Store). Quick-checked free alternatives at the time: Voltlaudo, Laudovolt, Subelog.
- **Rejected:** Religa, Laudo Pronto, Isola (first round, not liked); Laudex, Neutro (second round).
- **Codename:** "fasor" is kept only as the internal project codename, because it is the design partner's company name.
