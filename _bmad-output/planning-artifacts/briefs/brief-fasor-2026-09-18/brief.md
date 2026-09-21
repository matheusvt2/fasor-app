---
title: "Product Brief: Releng"
status: draft
created: 2026-09-18
updated: 2026-09-18
---

# Product Brief: Releng

> Releng (*relatório de engenharia*, "engineering report"). Internal project codename: `fasor`, not to be confused with the design partner, Fasor Engenharia.

## Executive Summary

Releng is a web-based, tablet-first field tool that lets electrical maintenance engineers capture inspections, test results and photos on site and turn them into the company's finished technical report (*relatório*), with no paper or re-typing. Its product principle: **type as little as possible; the app captures by camera and infers, the engineer confirms.** The MVP covers one report: the **Relatório Técnico de Cabine Primária** (renamed from *Laudo Técnico* on 2026-09-19 — see the addendum), the preventive maintenance report for a medium-voltage (MV) primary substation (*cabine primária*), modeled on Fasor Engenharia's real template FO.SERV-03.

Today that report is written three times: by hand on pre-printed A4 sheets, then in Excel and Word. One job yields a ~119-page document with ~76 photos and 94 per-equipment test sheets. A large report takes **7 days on average**, delaying delivery to the client and billing; the goal is **one day**.

Matheus Torres is building the MVP at no cost to test the idea quickly, with Bruno Matsui (Fasor Engenharia) as design partner and first user: one feature done well, on a data model ready to become a SaaS for other small engineering firms. Timing matters: the revised NR-10 (Brazil's electrical-safety regulation; Portaria MTE 737/2026, in force 1 June 2027) extends the obligation to keep electrical installation records (PIE) to every MV substation owner. The niche is also filling up: Mesh Labs launched a cabine primária app in September 2026, with Minipa Link and Inspekio circling, and engineer-developers already sell report generators to their peers inside WhatsApp groups.

## The Problem

- **Double entry.** One printed sheet per piece of equipment (e.g. "10 breakers, 10 disconnectors"), filled in by hand, then re-typed into Excel and Word. In Bruno's words: *"eu preencho duas vezes"* ("I fill it in twice").
- **Slow delivery, slow cash.** The September 2026 job ran over a 4–5 day holiday, and the report was still unfinished afterwards: *"o tempo pra mandar pro cliente, o tempo pra fazer o faturamento, isso me atrasa muito."* ("the time to send it to the client, the time to invoice, that delays me a lot").
- **Lost context.** Work is split across people (Bruno, Eduardo) and written up ~15 days later from scrap notes (*"no papel de pão"*).
- **Awkward tools.** Laptops are a burden in the substation; engineers already carry tablets.
- **Rigid output.** Test tables go into Word as Excel images, so photos can't sit next to their equipment.

**Evidence strength:** one engineer at one company, with no independent user voice in market research. Real for the design partner, unvalidated beyond it.

## The Solution

One end-to-end flow:

1. **Set up before the visit.** The office creates the project (client) and report and adds equipment blocks (cables, disconnector, MV breaker, voltage/current transformers (VT/CT), transformer) with quantities, each with its checklist and required tests.
2. **Fill in on site, on a tablet, typing as little as possible.** For each piece of equipment: nameplate data, checks (C/NC/NA: conforming, non-conforming, not applicable), test values and a conclusion. Picking a registered instrument code fills in its serial number and calibration certificate. Missing equipment can be added in the field.
3. **Photos as first-class data:** captioned, and shown both in the photo record and next to their equipment.
4. **Findings become an action plan.** Each point of attention (issue found on site) references its photos and carries a corrective action, deadline, priority and owner, as NR-10 item 10.7.11 asks.
5. **Generate the report** in the FO.SERV-03 layout, with an automatic table of contents, as an editable .docx the engineer can adjust before signing.

**Type as little as possible: the app captures by camera and infers; the engineer confirms.** The MVP's capture assists (user mandate, 2026-09-18):

- **Nameplate from a photo** (LLM vision) into the nameplate fields.
- **Instrument display by camera:** OCR of the megôhmetro / microhmímetro / TTR display into the measurement cell.
- **Photo auto-caption:** LLM vision proposes activity, equipment and location.
- **Equipment type and TAG suggestion** from a photo of the cubicle label.
- **Smart defaults** (copy from the last sheet, the same column or the previous visit) and **bulk actions** across sheets.

Every AI result is a suggestion the engineer confirms; nothing is written unconfirmed. All AI processing runs in the backend (it is a SaaS); offline, the photo is kept and queued, and the reading runs at the first connection, with the suggestions shown for confirmation beside the source photo.

**Works without signal.** Substations are often in basements with no connectivity; the app saves locally and syncs later, never losing site data.

**Web first.** The MVP runs in the tablet's or phone's browser, on any platform (Android, iPad, Windows), without app store publishing.

## What Makes This Different

Honest positioning: **"your report, in your layout, ready to sign"**. The edge is proximity to a real user, speed, and the least typing per sheet in the category.

- **The least typing per sheet.** Mesh Labs reads nameplates by AI; Releng extends camera capture to instrument displays, captions and equipment identity, and measures it: **≤ 20 keystrokes per equipment sheet** (Success Criteria).
- **The provider's own layout, not a vendor template.** Mesh Labs already generates a consolidated report (PDF and DOCX, with logos), but on its own fixed template. Releng reproduces the service provider's report, starting with FO.SERV-03, co-designed with the engineer who writes it.
- **Gaps no MV competitor covers today** (per public evidence): instrument calibration recorded in the system, C/NC/NA checks for the whole substation, and points of attention with deadlines.
- **Any device.** Web-based, Releng runs on Android tablets and iPads alike; Mesh Labs is Android-only.

**Table stakes, not edges:** Mesh Labs already has offline capture, AI nameplate reading, the same 6 equipment types and a consolidated report, for R$ 1,397/year, sold through its large-audience training school; Minipa Link (instrument maker) promises a "same-day final report" on iPad. Offline capture, nameplate reading and brand-agnostic instrument entry are table stakes. So is the output. Bruno's reference for it is a peer-built load-study tool he forwarded on 2026-09-18: a PDF with the provider's logo, editable sections, generated narrative and a prioritized action plan (see the addendum's product reference). That is the bar he measures against: *"a gente quer fazer um negócio mais top"* ("we want to build something better").

## Who This Serves

- **Primary: field engineers at Fasor Engenharia** (Bruno Matsui, Eduardo and team), who want to leave the site with complete data and deliver without a second shift at the desk.
- **Secondary: whoever assembles and reviews the report in the office** [ASSUMPTION: the same engineers].
- **End reader: the client** (e.g. Porto Seguro), who needs a clear, complete, signed report that feeds their PIE.
- **Future (SaaS): small and mid-size engineering firms doing MV preventive maintenance**, the segment market research recommends first.

## Success Criteria

| Signal | Target |
| --- | --- |
| Time from end of field work to report ready for signature | **≤ 1 working day**, down from ~7 days today for a large report (baseline to be timed on the next job without Releng). Excludes external lab results (e.g. oil analysis), attached later |
| Field data re-typed after the visit | Zero |
| Keystrokes per equipment sheet | **≤ 20**, measured on the next real job. Baseline: an estimated ~60–120 typed characters per sheet today (from the FO.SERV-03 extraction), to be measured |
| Time per equipment sheet in the field | Baseline to be timed on the next job; target set after the baseline |
| Generated report accepted by Bruno | Only minor edits, no restructuring |
| Real use | Used on Fasor's next real cabine primária job |
| SaaS signal (after MVP) | Bruno keeps using it unprompted; 5–10 other MV service firms interviewed |

## Scope

**In (MVP):**

- One report type: cabine primária, exactly as FO.SERV-03 is today: its 6 equipment sheet types, with grounding covered as checklist items and the 50/51 relay setting recorded on the breaker sheet.
- Project → report hierarchy.
- Registries: instruments, manufacturers, voltage classes.
- Photos with captions.
- Action plan: points of attention with corrective action, deadline, priority and owner.
- .docx report generation with automatic table of contents.
- Web app, responsive for tablet and phone.
- Offline capture with later sync, with no data or photo loss.
- **"Structures ready"** in the data model only, with no UI yet for new report types, criteria editing or onboarding other companies:
  - multiple report types and companies (tenants);
  - acceptance criteria as data with their source (norm, edition, table, limit, unit), not hard-coded;
  - a stable equipment identity (TAG) across visits, for later history-based criteria;
  - NR-10 text chosen by the job's execution date (before or after 1 June 2027).
- **AI capture assists, in the core flow,** in this order: (a) nameplate from a photo, (b) instrument display OCR, (c) photo auto-caption, (d) equipment-type and TAG suggestion. Report generation still ships first, but AI capture is no longer the first cut: if the timeline tightens, the first cut is (d), then (c).

**Out (explicitly):**

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

## Open Questions and Risks

- **Ownership and partnership.** The MVP is free but meant to become a SaaS; IP, equity and roles between Matheus and Bruno are undefined.
- **Single design partner.** One company's template shapes everything, risking a Fasor-only tool.
- **Offline in a browser.** Browsers limit local storage (iPad Safari especially), and the report holds ~76 photos. Architecture must prove photo-safe offline capture before anything else is built on it.
- **Competitive window, no hands-on benchmark.** Mesh Labs is moving now, Minipa Link has an instrument maker's scale, and GroundPRO announced checklists. The barrier to entry is low too: a solo engineer-developer sells a report generator to peers with no marketing beyond a group testimonial. The team chose not to subscribe to Mesh Labs, to keep the product independent, so competitive evidence is public only; recheck it on the addendum's revalidation dates.
- **AI capture.** It needs connectivity, which substations often lack: the design keeps the photo and defers the reading. Cost per call and provider choice are architecture's call. A misread digit on a measurement is worse than a blank, so confirmation is cheap and the source photo sits beside the value. Client photos sent to an LLM provider need the client's consent and data-processing terms (LGPD, Brazil's data protection law).
- **Channel.** Mesh Labs and Elétrica Academy (GroundPRO) sell through their own training schools, with student discounts; Releng has no audience of its own. The nearest working channel seen is peer word-of-mouth inside engineers' WhatsApp groups, where one testimonial won about six users for the reference tool; Bruno belongs to those groups, so they are the first channel to test.
- **NR-10 angle.** Sell on the 2027 PIE expansion, item 10.7.11 and traceable acceptance criteria. Never claim "required by insurers" or "NBR 14039 requires annual maintenance"; neither holds. FO.SERV-03 cites the NR-10 text replaced on 1 June 2027; later reports need the new text.
- **Acceptance criteria.** FO.SERV-03's fixed 400 MΩ insulation limit has no known source, and references vary widely (see addendum); hard-coding one company's limits would break the SaaS story.

## Pending Inputs

- **MVP deadline.** No target date or next scheduled cabine primária job yet.
- **Reference tool details.** Name, price, developer and licensing of the "Estudo de Carga e Demanda" software Bruno forwarded on 2026-09-18, and whether Fasor also performs load and demand studies, which would make them a candidate report type.
- **Name availability.** "Releng" chosen on 2026-09-18 after "Voltlog" proved taken. Releng's domains, INPI registration and app-store names are not yet checked; "releng" is also software jargon for *release engineering*, which may crowd search results.

## Vision

If the MVP proves the one-day report, Releng becomes a SaaS for small Brazilian engineering firms, with a catalog of report types (panels, SPDA, grounding and, possibly, load and demand studies) on the same block model, plus:

- equipment history across visits, with comparison against the previous report;
- sealed, PIE-ready PDF reports with version, hash and 10-year retention;
- editable acceptance criteria per company and per utility;
- public, per-company pricing.
