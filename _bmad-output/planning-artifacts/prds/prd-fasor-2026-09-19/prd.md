---
title: Releng
status: final
created: 2026-09-19
updated: 2026-09-21
---

# PRD: Releng

*Working title — confirm. Internal project codename `fasor`, which is also the design partner's company name (Fasor Engenharia) and must never surface as the product name. The UI mockups still show the placeholder `PRODUTO`.*

## 0. Document Purpose

This PRD is the requirements contract for Releng's MVP. It is written for the builder, for the downstream BMad workflows (architecture, epics and stories), and for the design partner reviewing what will be built. It does not restate the upstream work: the **Product Brief** (`_bmad-output/planning-artifacts/briefs/brief-fasor-2026-09-18/`) carries the problem, market and strategic framing; the **UX spines** `DESIGN.md` and `EXPERIENCE.md` v0.6.0 (`_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/`) carry the visual language, interaction rules, screen inventory and 15 key-screen mockups; three **research reports** (market, domain, competitive, all 2026-09-18) carry the regulatory, competitive and domain evidence. Where this PRD and the UX spines disagree on interaction detail, the spines win; where this PRD and the brief disagree on scope, this PRD wins and says why.

Structure: vocabulary is fixed in §4 Glossary and used verbatim everywhere else; features are grouped in §5 with globally numbered FRs nested under them; journeys keep the UX spines' own IDs (`Flow 1`–`Flow 6`) rather than inventing UJ numbers, so every reference resolves in both documents. Inferences are tagged `[ASSUMPTION]` inline and indexed in §14. Technical *how* — storage engine, sync mechanism, AI provider, document renderer — is deliberately absent; it belongs to architecture, and the open items handed to it are listed in `addendum.md`.

## 1. Vision

An electrical maintenance engineer spends three days inside a medium-voltage substation with a clipboard, then spends the next week at a desk typing what the clipboard already says. One job at Fasor Engenharia produces a 124-page report with about 82 photographs and 94 per-equipment test sheets, assembled by hand from paper into Excel into Word. It takes about seven days, it is written up from notes on scrap paper around fifteen days after the work, and until it is delivered the job cannot be invoiced.

Releng is a browser-based, tablet-first field tool that collapses that second shift. The engineer composes the job in the office from reusable blocks, walks the substation filling equipment sheets on a tablet with no signal, and generates the company's own finished report — the real FO.SERV-03 layout, table of contents, photo record, action plan, signature block — as a DOCX and PDF pair on the way back. Seven days become one.

What makes it different is not that it digitizes the form. Three competitors already capture offline with photos, and two advertise reading instruments over Bluetooth, though one of those integrations is disputed and the other covers only low-voltage meters; sync reliability has become a qualifying threshold rather than a selling point. Releng's wager is on two things nobody else does: **the provider's own document, not a vendor template**, and **the least typing per sheet in the category**. Everything the engineer would otherwise type is captured by camera and inferred — nameplates, instrument displays, photo captions, equipment identity — and every inference arrives as an amber suggestion the engineer confirms. Nothing unconfirmed is ever written, counted, or printed. The product principle, stated by the user as a mandate on 2026-09-18: *type as little as possible; the app captures by camera and infers, the engineer confirms*.

## 2. Why Now

Three clocks are running at once, and they are why the MVP is being built for free and fast rather than carefully and later.

- **Regulatory.** Portaria MTE 737/2026 rewrites NR-10 with effect from **2027-06-01**. Two changes matter commercially: item **10.7.11** requires an inspection report carrying prevention measures with an action plan and a compliance schedule, and item **10.15.6** removes the 75 kW threshold so that **every MV substation owner** must keep a PIE (read from the primary text, but tagged unverified upstream — see §10). The addressable obligation widens, and the deliverable acquires a legally named shape — structured action plan with deadlines — that Releng builds natively and no MV competitor offers.
- **Competitive.** Mesh Labs launched a cabine primária app in September 2026 covering the same equipment types, with nameplate AI, offline capture and a consolidated DOCX and PDF report, at R$ 1,397/year, sold into an audience of 43,700 training-school subscribers. Two of Releng's claimed gaps have explicitly short windows: Mesh has announced a table of contents as its next step, and its calibration module ("Equipa") is on its public roadmap. Minipa Link is on iPad; Inspekio is pre-launch with a near-identical pitch.
- **The document itself is the moat, and it is shrinking.** Competitors impose their own template. Reproducing the service provider's layout, co-designed with the engineer who writes it, is the one edge that does not evaporate when a competitor ships one more feature — but only while the gap exists.

**The MVP is due 2026-10-03 — two weeks from this document's date** (confirmed 2026-09-19). That date does not fit the scope in §7.1, and saying so is this document's job: 75 functional requirements covering offline multi-device capture, five inference assists and the generation of a 124-page document is not a two-week build. §7.3 proposes what does fit and what it costs. The scope in §5 and §7.1 stands as the definition of the product; §7.3 is the order it arrives in. `[ASSUMPTION: this PRD is calibrated for launch-grade rigor on an internal-first MVP — a real client deliverable in a regulated domain, one design partner, a SaaS-ready data model; §14]`

## 3. Target User

### 3.1 Jobs To Be Done

- **Functional — capture once.** Record nameplate data, C/NC/NA checks, measured values and a conclusion for each piece of equipment, on site, once, without a second pass at a desk.
- **Functional — produce the deliverable.** Hand the client the company's own signed technical report, in its own layout, without reassembling it by hand from three tools.
- **Functional — work where there is no signal.** Substations are frequently in basements. Nothing may be lost, deferred, or blocked by the absence of connectivity.
- **Functional — keep the record defensible.** Every measurement traceable to the instrument that took it, every criterion traceable to its source, every finding traceable to its photograph — because the report becomes part of the client's PIE and may be read in an audit.
- **Contextual — one hand, gloves, glare, rain.** The capture surface is held in a cubicle, not sat in front of.
- **Emotional — stop feeling the work twice.** In the design partner's words, *"eu preencho duas vezes"*. The second shift is the part of the job that is resented.
- **Economic — invoice sooner.** *"o tempo pra mandar pro cliente, o tempo pra fazer o faturamento, isso me atrasa muito."* Delivery gates billing.
- **For the builder.** Prove that one report type done properly, on a data model already shaped for multiple tenants and multiple report types, is worth turning into a SaaS for other small MV maintenance firms.

### 3.2 Non-Users (v1)

- **Other service providers.** The MVP is provisioned for one company. Multi-tenancy exists in the data model; there is no signup, no billing, no onboarding surface.
- **The client who receives the report.** Porto Seguro reads a DOCX or PDF. They have no account, no portal, no acknowledgement flow.
- **Instrument manufacturers and their integrations.** No Bluetooth, no device pairing.
- **Anyone doing a report type other than the Laudo Técnico de Cabine Primária.** Painel elétrico and SPDA are a data-model slot, not a product.
- **Auditors and inspectors as direct users.** They read the generated document; they do not log in.

### 3.3 Key User Journeys

These mirror the UX spines' `Key Flows` exactly. The sources define no `UJ-N` identifiers, so the PRD adopts their IDs verbatim; `DESIGN.md` and `EXPERIENCE.md` v0.6.0 hold the full beat-by-beat narrative and the mockup paths. Summarized here at the altitude the FRs need.

- **Flow 1 — Compose the Porto Seguro job.** *Bruno, office, notebook, connected, the week before the shutdown.* He registers the new TTR instrument with its calibration certificate, duplicates the seeded "Cabine primária — padrão" template, and builds the location skeleton — Cubículo Enel, 1° Subsolo colunas 1–17, Oxigênio, Cobertura A, Cobertura B, Geradores — setting equipment quantities per column. He creates the laudo from that template inside the Porto Seguro project; the 94 equipment blocks are born in their columns with suggested TAGs already assigned. **Climax:** the tree reads like the walk he will do on Saturday, and nothing waits to be placed. The tablet downloads the laudo by itself over office Wi-Fi. **Failure:** template quantities that do not match reality break nothing — Flow 3 fixes it in the field.

- **Flow 2 — Fill the Enel cubicle under rain.** *Bruno, Saturday, tablet, no signal.* Home leads with a Continue card; one tap opens the first sheet. He fills the "Da cabine" environment block, taps "Marcar os restantes como Conforme" for the checklist, photographs the megôhmetro display four times with "Ler visor" and moves on while the readings queue. On the seccionadora he marks item 8 NC, picks the chip "oxidação", dictates an observation, photographs the contact twice. At the gate one bar of signal returns five readings as amber suggestions with the display crop beside each value, including a magnitude outlier flagged "1000× abaixo de 1 minuto. Conferir?". **Climax:** the conclusion suggests "Aprovado · Com restrições?", the conclusion paragraph is already composed from the sheet's own values, he taps twice and moves to the next sheet. **Budget case:** a fully conforme sheet costs **19 taps and 0 keystrokes**. **Failure:** browser closed mid-sheet → "Rascunho encontrado — Recuperar"; storage low → warned before capture is refused, photos already taken are safe.

- **Flow 2b — Nameplate by photo.** *Bruno, the Enel disconnector; the reading arrives at the gate.* An empty nameplate group is a full-width "Fotografar placa" tile with "Digitar" as a small link beneath. One shutter; the plate is saved as a sheet photo and queued. At the gate seven fields come back amber with the plate crop inline and each field's region outlined when focused; "Capacidade de interrupção" is flagged **Verificar** because the guess has no region grounding it; his own typed voltage class is never overwritten, and the differing suggestion appears beside it as "Sugerido: 15 kV — Substituir"; an unknown manufacturer asks "Criar Celtta?" inline. **Climax:** "Confirmar todos" takes the seven grounded fields in one tap; he edits the one flagged field after a glance at the crop — two keystrokes, the only typing on the plate. **Failure:** reading fails → "Não foi possível ler — Tentar novamente / Preencher manualmente", photo kept, nothing written.

- **Flow 3 — An extra disconnector.** *Bruno, Sunday, 1° Subsolo.* Column 9 has a seccionadora that was not on the single-line diagram. From the tree row he opens the field Block palette, whose first row is "Fotografar equipamento"; one shot of the panel front. The confirm reads "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?" — type from the panel, column from the label, TAG from type plus column. **Climax:** at export it prints inside "9.2 Seccionadoras dos Cubículos de MT do 1° Subsolo" in tree order, indistinguishable from the blocks composed in the office. **Failure:** no signal → the palette's type row creates the block from type plus column and the panel photo still becomes its plate; wrong type → one tap on the confirm's chip row.

- **Flow 4 — Photos on a second device.** *Eduardo, phone, same Saturday.* The laudo downloaded itself overnight on Wi-Fi. He shoots twelve photos in one burst — shutdown team, LOTO locks, temporary grounding — with no composer opening; each tile carries its date, time and coordinate stamp. In the van the vision pass returns a caption per photo and the gallery header reads "12 legendas sugeridas — Confirmar todas". **Climax:** he reads the twelve, fixes one, confirms the batch; when both devices sync the gallery interleaves by capture time so Bruno's point of attention can reference Eduardo's photo by number at export. *`[ASSUMPTION: roles are illustrative — on the September job the split was the reverse, and the office assembler and the field engineer are assumed to be the same people; either user may do either job; §14]`*

- **Flow 5 — Generate and send.** *Bruno, Monday morning, office, desktop.* The Export dialog lists the pre-issue checks: one blocking row ("Parecer não preenchido"), plus a sheet in progress, a not-tested breaker with its reason, an uncaptioned photo, twelve suggested captions, two sheets with unconfirmed readings, a calibration expiry, and each user's last send time. He fixes the sheet, confirms the captions and readings, writes the points of attention picking the wet-termination photo so it prints as "conforme Imagem 5", taps a priority which fills the deadline, and confirms the laudo-level parecer. **Climax:** he generates revision 1, reviews the DOCX in Word, finds two clumsy observations, **fixes them in the app rather than in Word**, regenerates as revision 2 and sends the PDF the same morning. **Failure:** generation fails → inline error, data untouched, no revision number consumed; editing after issue → "Alterações geram a revisão 3", earlier revisions stay downloadable.

- **Flow 6 — Conflict, storage and calibration.** *Bruno and Eduardo, mid-job, both devices offline.* The same seccionadora was edited on both. On sync the sheet merges **by sub-block**: item 10 becomes NC with Eduardo's photo because NC beats C, and his filled cells fill Bruno's empty ones — all listed as information, nothing asked. One cell is a true contradiction: 3,300 MΩ with a display crop against 330 MΩ typed. The Conflict view shows that **single cell** as one row with two options and nothing else. **Climax:** he picks his, keeps a block Eduardo removed, clears a storage warning on the van hotspot, and continues past an expired-calibration warning that does not block him. Nothing was lost; nothing was decided for him.

## 4. Glossary

Downstream workflows and readers use these terms exactly. FRs, flows and metrics use them verbatim; synonyms are a discipline violation. Portuguese terms are the domain's own and are kept in Portuguese, as they appear in the UI and the generated document.

**Product and structure**

- **Releng** — the product. Browser-based, tablet-first. Codename `fasor` is internal only.
- **Project** — one client and site. Owns many Laudos. Container only; carries no report data.
- **Laudo** — one visit's technical report: an instance of a Template inside a Project. Owns filled data, Photos, Points of attention and Export revisions. The unit of delivery and the unit of billing.
- **Template** — a reusable ordered composition of Blocks with quantities, sub-block defaults and the **location skeleton**. Not tied to a Project. Editing a Template never touches Laudos already created from it; a Laudo remembers which Template it came from.
- **Block** — a coarse unit of the Laudo: either a **Section block** (one FO.SERV-03 section, mostly fixed text with variables) or an **Equipment block** (one equipment sheet, one equipment, one TAG). Addable, removable, reorderable. The organizing metaphor is the user's own: *"como se fosse um draw.io com objetos prontos"*.
- **Sub-block** — a fine unit inside an Equipment block: one test, one checklist item, a nameplate group, an observation box. A sub-block switched off is omitted from print, never printed empty.
- **Location** — `Cabine › Coluna/Cubículo`. The **Cabine** owns its substation characteristics, its test environment and the *Agrupar por tipo* flag, edited in exactly one place: the "Da cabine" block on the cabine's first sheet.
- **Ficha (equipment sheet, test sheet)** — the printed and on-screen form for one equipment: nameplate, checklist, tests, observations, conclusion. 94 in the reference job.
- **Equipment block type** — one of the **8** MVP types: Cabos de entrada · Para-raio · Chave seccionadora · Disjuntor MT · TP (transformador de potencial) · TC (transformador de corrente) · Cabos de saída/alimentação · Transformador de força. *The brief counts 6 because it groups cables together and TP with TC.*
- **TAG** — the equipment's stable identity, mandatory at block creation, suggested from type plus column ("SEC-C05"), unique within a client site, stable across visits. Renaming keeps identity.

**Capture**

- **C / NC / NA** — *conforme / não conforme / não se aplica*. The tri-state result of one checklist item, plus a free-text observation column. 5 to 15 items per equipment type.
- **Measurement table** — a test's value grid. Four shapes: single-table insulation (phases × massa, columns 30 SEGUNDOS / 1 MINUTO / ESTAB./10MIN, plus ABSORÇÃO and POLARIZAÇÃO); open/closed-contact insulation (T1/T2, T3/T4, T5/T6 against phases A/B/C); contact resistance (T1-T2, T3-T4, T5-T6 in µΩ); transformation ratio (theoretical against measured, per phase or per TAP).
- **Acceptance criterion** — *operator + value + unit + source*, e.g. `> 400 MΩ`, `< 250 µΩ`, `± 0,5 %`. Belongs to the test sub-block type, never to the instrument, never hard-coded. Seeded from the FO.SERV-03 sheets with source "aceitável na ficha".
- **Instrument** — a registered test instrument: code (e.g. "2E"), manufacturer, type, serial, calibration certificate number, calibration date, validity, certificate file, default test voltage or current. Selecting the code fills the whole instrument header on a sheet.
- **Suggestion** — a value Releng proposes and the engineer has not confirmed. Rendered amber with a "Sugerido" pill and, for camera-derived values, the source crop beside it. Never written, never counted as filled, never printed until confirmed.
- **Verificar** — a second level of trust below Suggestion: an ungrounded or cross-check-failed guess, shown with its best guess on a dashed amber border, skipped by "Confirmar todos", confirmable only by a tap on that field.
- **Copy / default** — a value taken from the engineer's own earlier entry (previous visit, previous cabine, previous row's unit). Written as a **plain value with an undo toast**, not as a Suggestion, because its source is the engineer.
- **Photo** — image plus caption plus capture stamp (date, time, coordinates). Appears in the chronological gallery and beside the equipment or checklist row it belongs to.
- **Ponto de atenção** (*point of attention*, used interchangeably in this document) — a finding: text, linked Photos, equipment or TAG, corrective action, priority P0–P4, deadline, owner. Prints as a section 8 bullet and as a row of the action-plan table.
- **Parecer** — the laudo-level technical opinion, with its generated summary paragraph. Blocking at export.
- **Não ensaiado** (*not tested*, used interchangeably in this document; feminine *Não ensaiada* when it qualifies a ficha) — an equipment state: present, not tested, with a reason. Prints its nameplate and reason band, no tables, and is listed automatically in section 8.

**Domain and regulation**

- **Cabine primária** — medium-voltage primary substation. The MVP's single subject.
- **FO.SERV-03** — Fasor Engenharia's real report form, Revisão 00: the layout the generated document reproduces. 11 numbered sections; the reference instance runs 124 pages.
- **Ensaio de isolação** — insulation resistance test, in MΩ or GΩ, by **megôhmetro**.
- **Ensaio de resistência de contato** — contact resistance test, in µΩ, by **microhmímetro**.
- **Ensaio de relação de transformação** — transformer turns ratio test, by **TTR**; theoretical against measured, verdict word `SATISFATÓRIO`.
- **NR-10** — Brazil's electrical safety regulation. Two texts fall inside the product's window: the 2004/2019 text until **2027-05-31**, and the text of Portaria MTE 737/2026 from **2027-06-01**.
- **NR-10 10.7.11** — from 2027-06-01, requires a report with prevention measures, an action plan and a compliance schedule. The legal basis for Pontos de atenção. Superseded item today: 10.2.4 g.
- **NR-10 10.5.1 / 10.13.1** — the de-energization sequence: 6 steps in the current text, 7 from 2027-06-01 (adding arc-flash protection and area delimitation). FO.SERV-03 section 5 quotes 10.5.1 and goes stale on 2027-06-01.
- **PIE** — *Prontuário de Instalações Elétricas*, the installation records the owner must keep. The Laudo is a piece of it. From 2027-06-01 required of every MV substation owner, not only above 75 kW.
- **PLH** — *profissional legalmente habilitado*, the professional legally in charge, distinct from the authorized executor who performs the tests.
- **ART / TRT** — the technical responsibility registration, filed under **CREA** (engineer) or **CRT** (technician). The Laudo's validity is bound to it: *"Este laudo tem validade apenas acompanhada da ART_…"*. Whether a TRT holder may sign a cabine laudo is disputed between CONFEA and CFT; **Releng records the council and number and does not arbitrate**.
- **Export revision** — the numbered output of one generation: a DOCX and a PDF of identical content, produced together. Distinct from the **form revision** ("Revisão 00"), which identifies FO.SERV-03 itself.

## 5. Features

FRs are numbered globally so downstream artifacts keep stable references even if features are reorganized. Interaction detail — exact copy, control sizes, colors, mockup frames — lives in the UX spines and is not duplicated here; where a behavior is load-bearing for a requirement it is stated as a consequence.

### 5.1 Company identity and registries

**Description:** Everything reused across laudos lives in Registries and is set once. The **Empresa** tab is the document's identity — the brand and form code that print on every page — and is configured once per company, weeks before any laudo, never asked for again at export. Instruments are the registry that does the most work per tap: selecting a code fills an entire instrument header on a sheet, which today is retyped on 85 or more sheets per job. Acceptance criteria are data, not code, and each carries its source, so the same engine can later serve another company with different criteria. Realizes Flow 1, Flow 5.

**Functional Requirements:**

#### FR-1: Company profile and document identity

An office user can record the company's razão social, CNPJ, address lines, telephone, e-mail, logo, optional cover background, optional watermark, and the form code and form revision, and see a live preview of the cover, header and footer as they type.

**Consequences (testable):**
- The generated document's header, footer and cover are composed from these values; no laudo and no export dialog asks for any of them.
- Razão social and logo are **warned about, never required**: the pre-issue check names whichever is missing and generation proceeds (FR-73). A document generated without a logo prints the header with the razão social alone.
- Each field autosaves on change; there is no Save button.

#### FR-2: Client and site registry

A user can register clients with an optional CNPJ, their sites and a contact, and select one when creating a Laudo.

**Consequences (testable):**
- Selecting a client on Laudo setup fills the cover's client and site fields.
- CNPJ is optional on the client but prints in the document control table when present.

#### FR-3: Instrument registry with calibration record

A user can register a test instrument with a short code, name, manufacturer, type or model, serial number, calibration certificate number, calibration date, the calibrating laboratory, whether that laboratory is RBC-accredited, the calibration interval the company itself sets, the resulting validity date, an attached certificate file, and a default test voltage or current per test type.

**Consequences (testable):**
- Selecting the instrument code on a Measurement table fills manufacturer, type, serial, certificate number and the default test parameter into that table's instrument header.
- The registry stores no acceptance values; acceptance belongs to the test sub-block (FR-5).
- Validity is derived from the calibration date plus **the company's own interval**. There is no regulatory validity period for a calibration certificate, and RBC accreditation is optional because no source requires it.
- The certificate number prints on the sheet's instrument header under the label `RBC:`, as the source form does.
- An instrument whose validity date has passed is listed first in the registry and shown in the Instrument picker with an amber "Calibração vencida" note.
- **An expired calibration never blocks capture, conclusion or export.** It appears in the pre-issue list (FR-73) as information.
- The attached certificate file is printed in generated section 11 (FR-70).

#### FR-4: Manufacturer and voltage-class registries

A user can register manufacturers by name and voltage classes by value, and pick them anywhere those fields appear; a manufacturer absent from the registry can be created inline from the field that needs it.

**Consequences (testable):**
- Inline creation works offline and the new entry is available on that device immediately.
- A nameplate suggestion naming an unknown manufacturer offers "Criar ⟨nome⟩?" inline rather than failing (FR-35).
- `[NOTE FOR PM]` Cross-device registry deduplication ("Schneider" and "SCHNEIDER" must resolve to one entry with every sheet still pointing at it) is handed to architecture.

#### FR-5: Acceptance criteria as sourced data

Acceptance criteria are stored against the test sub-block type as operator, value, unit, criterion type, and a source carrying its edition, seeded from the FO.SERV-03 sheets, and are read-only in the MVP.

**Consequences (testable):**
- A criterion compares in the direction its operator states: `> 400 MΩ` fails below, `< 250 µΩ` fails above. A criterion without an operator is rejected at seed time.
- Every criterion carries a source with its **edition** — norm or manufacturer, edition or year, table or item. A criterion whose source has no edition is rejected at seed time, because §10 requires it. The seeded ones declare their source honestly as "aceitável na ficha", with no edition, which is itself the disclosure.
- Every criterion carries a **type**: absolute minimum, absolute maximum, deviation between poles or phases, deviation against a calculated or nameplate value, or pass/fail. The MVP seeds only absolute and deviation-against-calculated types; deviation against a previous visit needs history and is out of scope (§7.2). Storing the type now is what stops the shape having to change later.
- The criterion and its source print beside the value in the generated document (FR-68).
- No criterion value appears in application code or in a form layout.
- **Out of scope:** no editing surface. `[ASSUMPTION: Fasor will not need to change a criterion before the first real job; §13 Q6]`

#### FR-6: Named users and professional registration

A user signs in with e-mail and password; their account holds their name, their council choice (CREA or CRT), registration number and title.

**Consequences (testable):**
- The council choice changes the printed labels between CREA/ART and CRT/TRT and the printed professional title.
- The signed-in user's registration prefills the responsável of every new Laudo; only the ART or TRT number is typed per job.
- Users are provisioned outside the app. There are no roles: every user of the company sees every Project and Laudo.
- Sign-in requires connectivity; a session already established survives going offline for the whole job.

#### FR-7: Equipment identity (TAG)

Every Equipment block carries a TAG, mandatory at creation, suggested automatically from type plus column, unique within a client site, and preserved through renaming.

**Consequences (testable):**
- Creating a block in Coluna 5 of type Chave seccionadora suggests "SEC-C05"; a second one suggests "SEC-C05-2".
- A duplicate TAG typed on the same device is refused inline, naming where the existing one lives.
- Renaming a TAG does not create a new equipment identity; its history and links follow it.
- Two devices creating the same TAG while offline surface as a structure conflict on sync (FR-59), not a silent overwrite.

#### FR-8: Photo location switch

A user can turn the photo location stamp on or off in their account; it defaults on.

**Consequences (testable):**
- With it on, every photo captured carries coordinates that print beneath it in generated section 7.
- With it off, photos still carry date and time.
- Denial of the device location permission is shown in Account rather than failing capture.

### 5.2 Templates and the block model

**Description:** A Template is how the office turns knowledge of a site into a laudo that is already built. It carries not only which blocks exist but **where they are** — the location skeleton of cabines and columns with quantities per column — so that when a Laudo is created, all 94 equipment blocks are born in their place with their TAGs already suggested, and the field engineer never places anything. This is the difference between a form and a composed document. Realizes Flow 1.

**Functional Requirements:**

#### FR-9: Template composition

An office user can create, duplicate and archive Templates, and compose one from Section blocks and Equipment blocks in an explicit order.

**Consequences (testable):**
- A seeded Template "Cabine primária — padrão" reproducing FO.SERV-03 exists before any user action.
- Duplicating a Template copies structure and defaults, not laudo data.
- Archiving removes a Template from the creation picker without affecting Laudos created from it.

#### FR-10: Location skeleton with quantities per column

Within a Template a user can define cabines and, inside each, columns or cubicles, and set the quantity of each Equipment block type **per column**.

**Consequences (testable):**
- Setting 1 seccionadora, 1 disjuntor, 1 TP and 1 TC on a column and repeating it across 17 columns produces the correct per-type totals for the laudo.
- Each generated block is created inside its column with a TAG suggested from type plus that column.
- A cabine carries its own *Agrupar por tipo* flag, set in the Template and overridable on the Laudo.

#### FR-11: Sub-block defaults and subtypes

A user can switch sub-blocks on or off per block type in a Template, and set a subtype whose effect is to pre-mark specific checklist items NA.

**Consequences (testable):**
- The manual subtype of Chave seccionadora pre-marks "Motor" and "Fusíveis" as NA; both rows remain on the sheet and remain editable.
- The subtype list is **derived from the reference report's own nameplate fields**, not invented: `TIPO DE SE` takes SIMPLIFICADA - POSTE, ALVENARIA - CONVENCIONAL or BLINDADA; `MEIO DE EXTINÇÃO` takes AR or SF6; `TIPO DE ISOLAÇÃO` takes EPÓXI or Á SECO; `ACIONAMENTO` takes MANUAL/PUNHO. The one that does the most work is insulation medium: a dry-type transformer, TP or TC marks the eight oil-related rows of its shared 15-item checklist NA, which is what the engineers do by hand today.
- `[NOTE FOR PM]` The source spells the same value both `EPÓXI` and `EPOXI`. Normalise at seed time.
- **Checklist items are never removed by a subtype** — only pre-marked.
- A sub-block switched off is omitted from the generated document entirely, never printed empty.

#### FR-12: Section block boilerplate with variables

An office user can edit a Section block's fixed text in a rich text editor within the Template composer, using named variables for the parts that change per job.

**Consequences (testable):**
- Section 1 Objetivo resolves variables for the executing company, the client and the scope description at generation.
- The rich text editor exists only in the Template composer; no field surface offers it.

#### FR-13: Template independence from Laudos

Editing a Template never alters a Laudo already created from it.

**Consequences (testable):**
- Changing a Template's checklist defaults after a Laudo exists leaves that Laudo's sheets untouched.
- A Laudo records which Template it came from.
- Block order inside a Laudo is per Laudo; the Template sets only the initial order.

#### FR-14: Save a Laudo as a Template

A user can save an existing Laudo's structure as a new Template.

**Consequences (testable):**
- Locations are carried; filled data, photos and points of attention are not.
- `[ASSUMPTION: TAGs, cabine flags and per-sheet sub-block overrides are carried; §13 Q5]`

### 5.3 Projects, laudos and the laudo tree

**Description:** A Project is a client and site; a Laudo is one visit. The Laudo tree is the spine of the whole product — it is what the engineer navigates in the field, it is ordered the way the substation is walked, and it is deliberately **not** the order the document prints in. Realizes Flow 1, Flow 3.

**Functional Requirements:**

#### FR-15: Project and laudo hierarchy

A user can create a Project for a client and site and create many Laudos inside it.

**Consequences (testable):**
- Creating a new Laudo offers the report type with the single MVP option "Cabine primária" preselected; the slot exists without a picker to build.
- `[ASSUMPTION: Project, Client and Site are three names for two concepts; which one TAG uniqueness and copy-on-create hang from is unresolved; §13 Q4]`

#### FR-16: Laudo setup

An office user can record, in one scrolling page of numbered bands, the laudo's cover data, section 1 variables, section 3 exclusions, cover photo, responsável with council and ART or TRT number, instruments used, certificates to attach, and the conclusion and parecer.

**Consequences (testable):**
- Client, site and responsável prefill from the registries and the user's account; only the ART or TRT number is typed.
- Site altitude is asked once per laudo, prefilled from the device's geolocation and confirmed.
- The laudo records a **next recommended intervention** as a date with the responsible professional's justification. It feeds the action plan's P4 deadline (FR-50) and the compliance schedule NR-10 item 10.7.11 asks for. It is never defaulted to a year.
- **Substation characteristics and test environment are not on this surface** — they belong to each Cabine (FR-24).

#### FR-17: The laudo tree

A user can see and navigate the whole Laudo as `Cabine › Coluna/Cubículo › Equipamento` plus its Section blocks, with each block's state visible.

**Consequences (testable):**
- Every block is born in a location; there is no unplaced group.
- On tablet and desktop the tree persists as a left rail inside a Laudo; on phone it is its own surface.
- Each Equipment block shows one of four states: Vazia, Em preenchimento, Concluída, Não ensaiada with its reason.
- Progress is visible per laudo and per sheet; **blocks with unconfirmed Suggestions are not counted as filled**.

#### FR-18: Add a block in the field

A field user can add an Equipment block from inside a Laudo, from a tree row or from the sheet they are on.

**Consequences (testable):**
- The field Block palette offers "Fotografar equipamento" first, then the 8 equipment types, and offers no Section blocks and no sub-block toggles.
- A block added in the field is indistinguishable at export from one composed in the office, and prints in tree order within its section-9 group.
- Adding a block works with no connectivity; only the photo-derived identity suggestion (FR-38) waits for signal.

#### FR-19: Remove, restore and reorder blocks

A user can remove a block, restore a removed block, and reorder blocks three ways: press and hold then drag, an overflow menu, or keyboard.

**Consequences (testable):**
- Removing a block that holds data raises a confirmation naming the TAG, then a persistent undo toast.
- A removed block is recoverable from the Laudo overview until the Laudo is exported.
- Every reorder announces the new position for screen readers.
- **No swipe gesture is used for any action** (gloves, glare), except system back.

#### FR-20: Move a block between locations

A user can move an Equipment block to another location, carrying its data.

**Consequences (testable):**
- Moving a block offers to re-suggest its TAG for the new column.
- The block's photos, checks, measurements and observations move with it.

#### FR-21: Laudo status

A Laudo carries a status: Rascunho, Em campo, Em revisão, Emitido.

**Consequences (testable):**
- Home groups Laudos by status with counts and leads with a Continue card for a Laudo that is Em campo on this device.
- Editing a Laudo after it reaches Emitido shows a banner naming the issue date and revision, and warns that changes produce the next revision.
- `[ASSUMPTION: the full state transition table — export while Em campo, re-export after Emitido, manual move back to Rascunho — is not written; §13 Q2]`

### 5.4 Equipment sheet capture

**Description:** The sheet is where the seven days are won or lost. One sheet is nameplate, checklist, tests, observations and a conclusion, and there are 94 of them in a job. Every design choice here serves one number: taps and keystrokes per sheet. The engineer works with one hand, in gloves, in a basement, in the rain, with no signal — so the camera and a copy come before the keyboard, the keyboard is reached by a text link, and nothing waits for the network. Realizes Flow 2, Flow 2b.

**Functional Requirements:**

#### FR-22: The eight equipment block types

The MVP provides eight Equipment block types, each carrying its own nameplate field list, checklist item list and set of tests with their measurement-table shapes.

**Consequences (testable):**
- Cabos de entrada: no nameplate, 5 checklist items, insulation Fase A/B/C/Reserva against Massa.
- Para-raio: 6 nameplate fields, 5 items, insulation A/B/C/Reserva.
- Chave seccionadora: 9 nameplate fields, 14 items, insulation open-contact T1/T2, T3/T4, T5/T6 plus closed-contact A/B/C, and contact resistance T1-T2, T3-T4, T5-T6.
- Disjuntor MT: 12 nameplate fields including AJ. RELÉ 50/51, 15 items, the same tests as the seccionadora.
- TP: 12 fields, 15 items, insulation R/S/T and transformation ratio H1-H2 / X1-X2 across three phases.
- TC: 12 fields including Relação and Exatidão, 15 items, insulation R/S/T and ratio P1-P2 / S1-S2.
- Cabos de saída / alimentação: no nameplate, 5 items, insulation A/B/C/Reserva.
- Transformador de força: 12 fields, 15 items, insulation across three Primário/Secundário/Massa combinations, ratio per TAP, **and a conclusion block** — absent from all eight transformer sheets in the source document and restored here.
- Adding a block of a type materializes all three at once; the engineer types only what is specific to the unit.
- The verbatim field names, checklist item texts and measurement-table column grammar for all eight types are the seed data specification in `addendum.md` §9. **This FR is not buildable from the counts above alone.**

#### FR-23: Nameplate capture

A user can fill an Equipment block's nameplate fields, by camera (FR-33), by copy (FR-34), or by typing.

**Consequences (testable):**
- An empty nameplate group presents the camera action as its primary affordance and typing as a text link beneath it.
- Field lists differ per type per FR-22 and each numeric field carries its unit.

#### FR-24: Cabine characteristics and test environment

A user can record, once per cabine, the substation type, primary and secondary voltage, installed power, and the test environment of altitude, temperature and relative humidity.

**Consequences (testable):**
- These are edited in exactly one place: the "Da cabine" block on that cabine's first sheet. Every other sheet of the cabine shows them read-only under the same label, and the cabine's tree row shows them read-only.
- They print once per cabine, on its first sheet.
- "Copiar da cabine anterior" fills temperature and humidity in one tap when a previous cabine in the laudo has them, as a plain value with an undo toast.
- Temperature and humidity can also be read from a photo of the thermo-hygrometer display under FR-36, which is why this block is treated as a measurement surface and not a plain form.
- Altitude is prefilled from the laudo setup and not re-asked.

#### FR-25: Checklist capture

A user can set each checklist item to C, NC or NA and attach an observation to any item.

**Consequences (testable):**
- An observation is available on every row through the overflow menu and is required on NC.
- Items are never pre-marked C silently; only a subtype's NA defaults are pre-set (FR-11).
- Per-item chips offer the three or four phrases most used for that item, inserting plain text.
- `[NOTE FOR PM]` **The chip phrases cannot be derived from the reference report.** Every C/NC/NA cell and every observation cell in all 94 sheets of the delivered instance is blank — the document was handed over unfinished. The only written observations that exist anywhere in the form are the five section 8 bullets. Ship the chips empty and let them fill from use: the chip row already shows the five most recent values for that item (§5.5), so after one real job it seeds itself. This removes the dependency on content nobody has yet.

#### FR-26: Bulk checklist actions

A user can mark all remaining unset checklist items as C in one action, and can repeat the C/NC/NA pattern of the last concluded sheet of the same type in this Laudo.

**Consequences (testable):**
- "Marcar os restantes como Conforme" sets only unset rows; NC rows and NA defaults are untouched.
- "Repetir da ficha anterior do mesmo tipo" copies only the tri-state pattern — never observations, never photos.
- Both are undoable through a toast naming the count.
- Both are disabled with the reason stated beside them when they do not apply.

#### FR-27: Measurement capture

A user can enter values into a Measurement table by reading the instrument display with the camera (FR-36), by dictation (FR-40), or by typing.

**Consequences (testable):**
- Each table carries an instrument header filled from the selected instrument code (FR-3) and the acceptance criterion with its source (FR-5).
- A value outside its criterion is highlighted amber, never red; red is reserved for what the engineer marked NC or Reprovado.
- Enter moves down a measurement column; Tab moves right; numeric fields present a decimal keypad.
- A typed unit suffix is parsed ("147G" is 147 GΩ); otherwise the unit defaults from the previous row of the same table; a tap cycles the unit.
- A cell has an explicit **not measured** state distinct from empty, printing as `-`. The insulation table's 30 s, 10 min, absorção and polarização columns are routinely not measured in practice, and without this state every sheet would report as incomplete.
- **Derived cells are computed, never typed:** absorção is the 1-minute reading over the 30-second reading, polarização is the 10-minute over the 1-minute, and the ratio test's calculated value comes from the nameplate. They recompute when their inputs change and print with the values they came from.
- **Numeric input is parsed in pt-BR and the parse is echoed back before comparison** — comma as decimal separator, point as thousands separator. `3.300` is three thousand three hundred, not 3.3. This is a safety requirement, not a locale detail: it is the same order-of-magnitude error FR-28 exists to catch.
- **The app never converts a failing value into a verdict.** It compares, highlights, and leaves the conclusion to the engineer. The ratio test's `SATISFATÓRIO` word is printed from the comparison as a statement about one measurement, not as the sheet's conclusion, which stays FR-29.

#### FR-28: Magnitude outlier hint

When a value inside one Measurement table differs from its peers by two orders of magnitude or more, the app shows an amber helper line asking the engineer to check it.

**Consequences (testable):**
- The hint names the comparison ("Fase C 1000× abaixo de A e B. Conferir?").
- It is a hint on a neutral field, **never a block** and never an automatic correction.
- This exists because the source document records contact-resistance values above their printed criterion with no NC recorded — the manual process misses them.

#### FR-29: Sheet conclusion

A user can set an Equipment block's conclusion as two independent pairs: Aprovado or Reprovado, and Sem restrições or Com restrições.

**Consequences (testable):**
- The app suggests the pair from the sheet's own content: all rows C or NA and all readings within criterion suggests "Aprovado · Sem restrições?"; any NC row or out-of-criterion reading suggests "Aprovado · Com restrições?".
- **Reprovado is never suggested.** The suggestion row disappears once any segment is set manually.
- Nothing is set until tapped; one tap applies both pairs.

#### FR-30: Generated conclusion text

Once a conclusion pair is set, the app composes a conclusion paragraph **on the device** from that sheet's own values, and lists beneath it every value and criterion the text used.

**Consequences (testable):**
- The paragraph is built by a fixed template per block type from nameplate identity, out-of-criterion readings with their criteria, NC items with their observations, and the matching recommendation.
- **This is not an AI call.** It works with no connectivity and is excluded from the reading queue.
- The criteria line beneath it lists each value and criterion used, for audit.
- The text recomposes silently while unconfirmed; "Editar" stops recomposition; after confirmation a later change offers "Sugerido: texto atualizado — Substituir" and never overwrites.
- An unconfirmed text does not block concluding the sheet and does not print; the conclusion row then prints the result pair alone.

#### FR-31: Não ensaiado

A user can mark an equipment as not tested with a reason chosen from a short list or typed.

**Consequences (testable):**
- The reason list is **taken from the reference report's own section 8**, which records the two that actually occurred: **Impossibilidade de desligamento** ("impossibilidade de realizar a desenergização completa da edificação") and **Solicitação do cliente** ("conforme solicitação do cliente", "conforme orientação do cliente"), plus **Outro** with free text. "Acesso" is dropped — it was inferred, not attested. The default is the last reason used in this Laudo.
- The reason prints in the sheet's reason band and again in section 8, in the form the source document uses: the reason with the operational justification behind it, not a bare label.
- A Não ensaiada sheet prints its nameplate and a reason band, with no measurement tables.
- Every Não ensaiada equipment is listed automatically in generated section 8 after the manually written points (FR-69).
- `[ASSUMPTION: these four reasons are the right four; §13 Q7]`

#### FR-32: Sheet attribution and autosave

Every Equipment block records who filled it and when, and every field change is saved locally without a Save action.

**Consequences (testable):**
- The sheet header shows the attribution; it prints on the sheet.
- "Concluir ficha" changes state only; it does not save, because saving already happened.
- Reopening the app after a crash or a closed tab offers "Rascunho encontrado — Recuperar".
- `[ASSUMPTION: attribution is currently last-writer; whether first-filled-by, last-modified-by or concluded-by should print is undecided, and a one-tap fix by a second user would re-attribute the sheet in the printed document; §13 Q3]`

### 5.5 Camera-first capture assists

**Description:** This is the product's stated mandate and its measured differentiator: *the app captures by camera and infers; the engineer confirms*. Five assists cover what the engineer would otherwise type — the nameplate, the instrument display, the photo caption, the identity of an unplanned equipment, and the observation on a row already marked NC — and all five obey one contract. Everything runs in the backend, which means everything must survive having no signal at the moment of capture: the photo is kept and queued, the reading runs at the first bar, and the suggestion appears beside the photo it came from while the engineer is still standing in front of the equipment. Realizes Flow 2, Flow 2b, Flow 3, Flow 4.

**Functional Requirements:**

#### FR-33: Nameplate from a photo

A user can photograph an equipment nameplate and receive one Suggestion per nameplate field.

**Consequences (testable):**
- One shutter; the photo is saved as a sheet photo captioned "placa de identificação" and appears in the gallery.
- The plate crop is shown inline above the nameplate group, and each field's region on the crop is outlined while that field is focused.
- Suggested fields are amber with a "Sugerido" pill; "Confirmar todos" confirms the grounded ones in one tap and reports its count.
- A field whose value cannot be grounded on the crop is flagged Verificar, shown with its best guess rather than blank, and skipped by "Confirmar todos".

#### FR-34: Copy a nameplate

Where another sheet can supply a nameplate, the app offers a one-tap copy above the empty group.

**Consequences (testable):**
- "Copiar da última visita (⟨TAG⟩)" appears when that TAG exists in a previous Laudo of the same site. **This is the one cross-visit read the MVP performs** — a nameplate copy, not a history surface and not a comparison — and its scope depends on which entity TAG uniqueness hangs from (§13 Q4).
- "Igual à ⟨TAG⟩?" appears when another sheet of the same type in this Laudo already has a plate.
- A copy writes **plain values with an undo toast**, not Suggestions, because the source is the engineer's own entry.

#### FR-35: Registry cross-check on nameplate values

A suggested nameplate value is checked against the registries before it is offered.

**Consequences (testable):**
- A suggested voltage class that does not exist in the registry is flagged Verificar rather than offered for bulk confirmation.
- A suggested manufacturer absent from the registry offers "Criar ⟨nome⟩?" inline, and the creation works offline.

#### FR-36: Instrument display by camera

A user can photograph an instrument display from any Measurement table and receive the value and unit as a Suggestion in the next empty cells in reading order.

**Consequences (testable):**
- A display showing stored 30 s, 1 min and 10 min results fills the three cells of that row from one photo; a single-value display fills one cell.
- Burst mode fills the table row by row, one shot per row, until the engineer ends the burst.
- The source crop appears beside each suggested value and remains reachable behind the value until export.
- The unit is read from the display; where absent it defaults from the previous row.

#### FR-37: Wrong-digit protection

A camera-derived numeric reading is accepted as a Suggestion only when its digits are present in the OCR text layer of the crop.

**Consequences (testable):**
- A number produced by vision alone, absent from the OCR text layer, is flagged Verificar rather than offered as a confirmable Suggestion.
- This rule exists because a misread digit in a signed technical report is worse than an empty cell.

#### FR-38: Equipment identity from a photo

A field user can photograph an equipment panel and receive its type, column and TAG as a single confirmation that creates the block.

**Consequences (testable):**
- The confirmation states all three ("Criar SEC-C09-2 · Chave seccionadora · Coluna 9?") and one tap creates the block.
- A wrong type is corrected by one tap on a chip row inside the confirmation.
- The same photo becomes the new block's nameplate source.
- Offline, the block is created from the type list with type plus column giving the TAG, and the photo still becomes its plate.

#### FR-39: Photo auto-caption

Photos receive a caption without the engineer opening a composer.

**Consequences (testable):**
- A photo taken from a sheet gets its caption from context — equipment and location from the sheet, activity from the section on screen — written as a **plain editable caption**, not a Suggestion, because the context is the engineer's own position.
- A photo taken from the gallery or without context gets an LLM vision caption on sync, offered as a **Suggestion**.
- The gallery header offers a batch confirmation naming the count; the same batch appears in the pre-issue list.
- A photo that vision cannot caption stays "Sem legenda", is listed at export, and is **never guessed into a caption**.

#### FR-40: Dictation

A user can dictate into an observation field or a Measurement table using the device's speech engine.

**Consequences (testable):**
- On a Measurement table the utterance is parsed into row, value and unit ("Fase A, 147 giga" becomes Fase A: 147 GΩ); unparsed speech lands in the observation as text.
- The result is always a Suggestion, never written until confirmed.
- The control is **hidden, not disabled**, where the engine is unavailable; chips and keyboard remain.
- `[ASSUMPTION: the field tablets carry an offline pt-BR speech pack; without it the microphone is hidden in the cubicle; §13 Q8]`

#### FR-41: The provenance-and-confirm contract

Every assisted value obeys one shared contract.

**Consequences (testable):**
- **Nothing unconfirmed is written, counted by the progress indicator, or printed.**
- Typing into a suggested field discards that field's suggestion, that field only.
- A field the engineer already filled is **never overwritten**; a differing suggestion appears beside the value with a replace action.
- Camera-derived Suggestions carry their source crop; on confirmation the crop shrinks to a glyph and stays reachable until export.
- Suggestions are announced to screen readers as suggestions with their value and a confirm action.
- **No verdict is ever auto-decided.** Reprovado is never suggested at sheet level; Não apto is never suggested at laudo level.
- **Where a low-confidence value is shown rather than left blank, and where it is not:** a *field with a known shape* — a nameplate field, a measurement cell — shows its best guess flagged Verificar, because an editable guess costs a glance and a blank costs typing. *Free prose* — a photo caption, an observation — is never guessed, because a plausible wrong sentence in a signed report is not visibly wrong. This narrows the brief's blanket "silence over a guess" to prose only; see `addendum.md` §2.
- Vision proposing NC checklist rows from a sheet's photos is **not in the MVP**.

#### FR-42: Offline assist queue

A photo taken for an assist while offline is kept and queued; the reading runs at the first connectivity and the suggestion is surfaced where the photo was taken.

**Consequences (testable):**
- The queued state is shown under the plate tile, the measurement cell or the photo tile, and the cell stays typeable meanwhile.
- Photos taken for a reading upload **before** other photos.
- On the first signal, a toast names how many readings are ready and opens the first sheet with pending suggestions — so the engineer who took the photo can still check it on site.
- A sheet opened later with suggestions still pending shows an informational banner.
- A failed reading shows a retry and a type-manually action; the photo is kept and nothing is written.
- The sync status surface counts readings queued and suggestions awaiting confirmation.
- Volume to size for: about 94 plates, about 1,100 display shots and about 82 captions per job.

#### FR-75: NC observation draft from the row's photo

When a checklist row is marked NC and carries a photo, vision drafts one sentence describing what the photo shows, offered as a Suggestion on that row's observation field.

**Consequences (testable):**
- The draft arrives on sync like any other queued reading (FR-42) and obeys the confirm contract (FR-41).
- An explicit action inserts the draft; typing keeps the engineer's own text and discards the draft.
- **This is not the same capability as vision proposing which rows are NC**, which FR-41 excludes: here the engineer has already judged the row, and the assist only writes down what they are looking at.
- Last in the assist queue, and the first to be cut under §7.2's cut order.

### 5.6 Photos

**Description:** Photographs are not an attachment in this document — they are roughly 76 of its 124 pages, they carry the evidence behind every finding, and today they cannot sit beside the equipment they show because the test sheets are pasted into Word as pictures. Releng makes a photo a first-class object with a caption and a stamp, shows it in both places, and numbers it automatically, because the real report already broke its own numbering: 82 captions run 01 to 76 with two numbers repeated four times each. Realizes Flow 2, Flow 4.

**Functional Requirements:**

#### FR-43: Direct camera capture in bursts

A user can open the device camera directly from the sticky action bar of any surface and shoot a burst until they end it.

**Consequences (testable):**
- No caption composer opens during a burst.
- Choosing from the device gallery is available as a text link, not as the primary action.

#### FR-44: Photo object

A photo carries its image, a caption, a capture timestamp, optional coordinates, and its links to the sheet, checklist row or point of attention it belongs to.

**Consequences (testable):**
- A photo attached from an NC checklist row keeps that link and prints its item reference beneath it.
- The same photo is reachable from the gallery and from the equipment it belongs to.

#### FR-45: Gallery

A user can see all a Laudo's photos in one chronological gallery, filter by location, and open a viewer.

**Consequences (testable):**
- The gallery order is capture time across devices; it becomes the order of generated section 7.
- Tiles show upload state, caption state and location state distinctly.
- `[ASSUMPTION: timezone America/Sao_Paulo; capture time from EXIF where present, device time otherwise; §14]`

#### FR-46: Caption composer

A user can open a composer for one photo to edit its caption, with chips for recently used activities and locations.

**Consequences (testable):**
- The composer is reached from an explicit action, never opened automatically.

#### FR-47: Photo stamp

Each photo carries a visible capture stamp of date and time, with coordinates when location is enabled.

**Consequences (testable):**
- The stamp appears on the tile, in the viewer, and beneath the photo in the generated document.

#### FR-48: Automatic photo numbering

Photos are numbered automatically at generation in section 7 and referenced by that number from points of attention.

**Consequences (testable):**
- Numbers follow the chronological gallery order and are frozen with the export revision.
- Before export, and again after any change following an export, numbers are shown as provisional.
- A point of attention referencing a photo resolves to that photo's number at generation, so the printed text reads "conforme Imagem 5".

### 5.7 Points of attention and the action plan

**Description:** This is the feature with a legal name. From 2027-06-01, NR-10 item 10.7.11 requires a report carrying prevention measures with an action plan and a compliance schedule; today item 10.2.4 g asks for the same thing inside the PIE. Structuring findings as data rather than prose is what turns a section-8 bullet list into a schedule a client can be held to — and, on the evidence available, **no MV competitor offers it on the cabine**. Realizes Flow 2, Flow 2b, Flow 5.

**Functional Requirements:**

#### FR-49: Point of attention

A user can record a finding with its text, linked photos, the equipment or TAG it concerns, a recommended corrective action, a priority, a deadline and an owner.

**Consequences (testable):**
- A point is creatable in the field from an expanded NC checklist row, pre-linked to that row's photo and equipment.
- A point is creatable in the office from the points-of-attention surface.
- Photos are picked from the Laudo's gallery and print as resolved numbers (FR-48).

#### FR-50: Priority suggests the deadline

Choosing a priority writes the deadline as a Suggestion counted from the day the point was created.

**Consequences (testable):**
- P0 Imediata is that day; P1 Curto prazo is 30 days; P2 Médio prazo is 90 days; P3 Longo prazo is 180 days; P4 Próxima manutenção resolves to **the laudo's recorded next recommended intervention** (FR-16), not to a hard-coded year. No norm fixes a maintenance interval and the product must not imply one.
- A date the engineer typed is never overwritten by a later priority change; the differing suggestion appears beside it with a replace action.
- `[ASSUMPTION: the five-level scale, its names and its day counts come from the peer-built reference tool, not from Fasor's practice; §13 Q9]`

#### FR-51: Automatic points for untested equipment

Every equipment marked Não ensaiado appears in the action plan automatically.

**Consequences (testable):**
- Automatic entries print after the manually written points and carry the recorded reason.
- The engineer does not have to remember to write them. The source document's section 8 contains exactly these — untested disconnectors and a TIE breaker — written by hand.

#### FR-52: The printed action-plan table

Generated section 8 prints the findings as bullets and, beneath them, a table of the same rows.

**Consequences (testable):**
- The table's columns are number, ponto de atenção, local or TAG, prioridade, prazo, ação recomendada, responsável, imagens.
- The bullets keep the prose form the source document uses; the table is the schedule 10.7.11 asks for.

#### FR-53: Quick chips for recurring findings

A user can insert a recurring finding from a chip rather than typing it.

**Consequences (testable):**
- Chips cover the findings that repeat across jobs, such as missing safety plaques and an outdated single-line diagram.
- A chip inserts editable plain text.

### 5.8 Offline capture, sync and multi-device merge

**Description:** Substations are in basements. This is not a resilience feature, it is the precondition for the product existing — and the research is blunt about its market position: photo loss and unstable sync are the top complaints against three independent field-app vendors, and every MV competitor already ships offline capture. **Getting this right does not win the sale; getting it wrong eliminates the product.** The hard part is not one device offline but two, because the September job was worked by two people, and a merge that asks the engineer to arbitrate 94 sheets is a failure. Realizes Flow 2, Flow 4, Flow 6.

**Functional Requirements:**

#### FR-54: Offline capture

Every capture action works with no connectivity: sheets, checklists, measurements, photos, observations, points of attention, adding and removing blocks, and creating registry entries inline.

**Consequences (testable):**
- Each measurement and each photo is written to local storage immediately on capture.
- Opening a Laudo already on the device requires no network.
- Nothing shows a spinner waiting for a network that is absent.
- The product is a **responsive web application only** (confirmed 2026-09-21): it runs in the browser tab on every device, with no home-screen install, no app-like shell and no store presence. Offline capture must therefore work inside an ordinary browser tab, which is exactly what §13 Q0 has to prove on iPadOS Safari.
- **Offline means cache locally, then resume** (confirmed 2026-09-21): everything captured without signal is kept in the browser's local cache, the signed-in session carries on offline, and when connectivity returns the same session resumes and sends what was cached, with no new sign-in and no action from the user.
- Acceptance tests must cover: closing the app mid-sheet, losing the network mid-upload, and filling the device's storage.

#### FR-55: Automatic download to the field device

A Laudo is downloaded to a signed-in device without the user asking.

**Consequences (testable):**
- A Laudo created in the office arrives on the tablet over Wi-Fi before the job, and Home shows it as on the device with its freshness.
- A Laudo not on this device is shown as unavailable rather than opening empty.

#### FR-56: Zero photo loss

No captured photo is lost under any sequence of app closure, network failure or storage pressure.

**Consequences (testable):**
- A photo that fails to upload shows an error state on its own tile and retries; other photos continue unaffected.
- Upload is resumable and idempotent; a retried upload never duplicates a photo.
- Photos queued for a reading upload first (FR-42).
- A per-laudo photo capacity is supported above the nearest competitor's limit of 300.

#### FR-57: Storage pressure

The app warns before device storage runs out and never silently refuses a capture.

**Consequences (testable):**
- The warning names the remaining space and appears **before** capture is refused.
- Photos already captured remain safe when the warning appears.
- `[NOTE FOR PM]` The threshold and its detection mechanism are architecture's call. The related and much larger risk, iPadOS Safari storage eviction, is §13 Q0 and gates FR-54 and FR-56, not this FR.

#### FR-58: Merge by sub-block

When two devices edited the same sheet offline, the sheet merges at sub-block level without asking the user.

**Consequences (testable):**
- A checklist row NC on one device and C on the other resolves to **NC**, keeping the NC device's photo and observation.
- Cells one device filled and the other left empty are filled.
- Photos and captions never conflict: both devices' additions are kept and ordered by capture time.
- Every merge is **listed as information** on the sync status surface, naming the sheet and what merged.

#### FR-59: True conflicts

Only a genuine contradiction is put to the user, and only the contradicting part.

**Consequences (testable):**
- A conflict is a single cell or a single structural decision with two values, shown as one row with both options and their provenance — a camera-derived value shows its crop beside it.
- The rest of the sheet is already merged and is not shown in the conflict view.
- A block removed on one device and edited on the other offers keep or remove.
- A block added on the other device appears in the tree and is listed as information, not as a conflict.

#### FR-60: Sync status

A user can see, from any surface, what has been sent, what is waiting, what failed and what merged.

**Consequences (testable):**
- The badge shows the state; tapping it opens counts of sheets and photos pending, readings queued and suggestions awaiting confirmation.
- Rows list uploads pending, downloads in progress, last sync, each user's last send, errors, merges and conflicts.
- Explanations sit behind one link rather than on the surface.

#### FR-61: Draft recovery

Reopening the app after an interrupted session offers to recover unsaved screen state.

**Consequences (testable):**
- Recovery is offered explicitly, never applied silently.

### 5.9 Report generation

**Description:** This is the deliverable, and on the competitive evidence it is the only durable differentiator: competitors impose their own template, and the nearest one's table of contents is still pending. The generated document is not an export of the app's structure — the app is ordered by **where the engineer walks** and the document by **how FO.SERV-03 reads**, and generation is the transformation between them. It ships as DOCX and PDF together, one revision, both rendered from app data, because the market edits the final report in Word and a closed PDF alone would be rejected. Realizes Flow 5.

**Functional Requirements:**

#### FR-62: Generate a revision as DOCX and PDF

A user can generate the Laudo, producing a DOCX and a PDF of identical content as one numbered revision.

**Consequences (testable):**
- Both files render from application data. **The PDF is never a conversion of an edited DOCX.**
- There is no upload-a-revised-DOCX path in the MVP: corrections are made in the app and regenerated.
- Any edit after a generation makes the next generation revision N+1; every past revision stays listed and downloadable.
- A failed generation leaves data untouched and consumes no revision number.
- Generation may require connectivity. `[ASSUMPTION: server-side generation; §14]`

#### FR-63: Page furniture and cover

Every page carries the company header and footer; the document opens with the FO.SERV-03 cover.

**Consequences (testable):**
- The header carries the company logo, the two-line report title and the form code with the form revision.
- The footer carries the company identification lines and "Página X de Y".
- The cover carries the client data table and the cover photograph.
- A4 portrait with the source document's margins.

#### FR-64: Document control page

One page after the cover carries the document control table, composed and never typed. **This page does not exist in FO.SERV-03**, which carries revision control only in its page header; it is adopted from the peer-built reference tool because a laudo that goes into a PIE needs its own identity block.

**Consequences (testable):**
- Its rows are documento, revisão do documento, data de emissão, contratante with CNPJ, contratada with CNPJ, responsável técnico with council and number, ART or TRT, and the service period.
- **This is the only place the export revision prints**, and it is distinct from the form revision in the header.

#### FR-65: Automatic table of contents

The document carries a table of contents generated from its actual sections with their page numbers.

**Consequences (testable):**
- Every section and subsection present in the Laudo appears; sections whose blocks were removed do not.
- Page numbers reflect the generated document.

#### FR-66: Section blocks with resolved variables

Sections whose content is fixed text print from the Template with their variables resolved.

**Consequences (testable):**
- Section 1 Objetivo resolves executing company, client and scope.
- Section 3 Limite de escopo prints the exclusions recorded at laudo setup.
- Sections 2, 4, 5 and 6 print their boilerplate.
- Section 6 prints the source form's catalogue of applicable checks, which declares procedures for **Relé de Proteção** and for **Cubículos, QGBT's e Quadros de Distribuição** — two types the MVP has no sheets for, exactly as the source document does. Reproducing the form faithfully reproduces this. It is intended, and it is the clearest argument for adding the relay sheet (§7.2).
- `[NOTE FOR PM]` Section 5 currently quotes NR-10 item 10.5.1 and its six-step de-energization sequence. That text is superseded on 2027-06-01 by item 10.13.1 with seven steps and different terminology. The MVP prints the current text; see §13 Q10.

#### FR-67: Section 7, the photo record

Photos print in capture-chronological order, two per row, each with an automatic number, its caption and its stamp.

**Consequences (testable):**
- The caption format matches the source document: "Imagem NN: Detalhe ⟨descrição⟩."
- A photo linked to a checklist row prints its item reference beneath it.
- Numbering is frozen with the revision.

#### FR-68: Section 9, the test reports as native tables

Equipment sheets print as real tables, grouped and ordered by a scheme chosen at export.

**Consequences (testable):**
- **Sheets print as native document tables, not as images** — this is the change that lets a photo sit beside its equipment and lets the document be edited in Word.
- The default scheme is "Por local e tipo", reproducing FO.SERV-03; the alternative is field order. The choice is remembered per Laudo.
- `[ASSUMPTION: where para-raios and cabos print inside a cabine grouped by type is undefined — the source document has no example, and the seed template switches grouping on for two cabines holding 5 para-raios and 4 cabos; §13 Q18]`
- With *Agrupar por tipo* off, one subsection per cabine holds its sheets in tree order. With it on, sheets group by type in the fixed order Seccionadoras, Disjuntores, TP and TC as per-column pairs, then Transformadores with their feeder cables; empty groups are skipped.
- Each value prints with its own unit; a column mixing units prints the header without a unit.
- **Photos linked to an equipment print inside that equipment's sheet**, with their captions, beside the tables they belong to. This is the one structural change to FO.SERV-03 the design partner asked for by name: today the sheets are pasted-in pictures with no room for a photo, which he calls *"ruim"*.
- Each sheet prints its title as type plus role plus TAG, its attribution, its conclusion pair, and its confirmed conclusion text with the criteria line.
- Sub-blocks switched off are omitted; Não ensaiada sheets print nameplate and reason band only.
- **Unconfirmed Suggestions never print.**

#### FR-69: Section 8 and section 10

Section 8 prints the points of attention and the action-plan table; section 10 prints the parecer, the fixed conclusion bullets, the ART or TRT validity line and the signature block.

**Consequences (testable):**
- Section 10 opens with the parecer box carrying the engineer's verdict and confirmed summary.
- The validity line echoes the ART or TRT number by council.
- The signature block prints the responsável's name, title and registration. **The signature image itself is out of the MVP.**

#### FR-70: Section 11, certificates

The document ends with the calibration certificates of the instruments the Laudo used.

**Consequences (testable):**
- The set is the union of instruments referenced by any sheet and those checked at laudo setup.
- Each prints as a full-page image of the attached certificate file.

### 5.10 Pre-issue checks and the parecer

**Description:** The generated document is a signed legal artifact, and the failure mode that matters is not a crash — it is issuing a report with a blank checklist column, as the real source document did across all 94 sheets. The pre-issue list is the answer, and its discipline is deliberate: **it warns, it does not block**, because the engineer is the professional in charge and the market's own products behave this way. One item blocks, because a laudo with no opinion is not a laudo. Realizes Flow 5.

**Functional Requirements:**

#### FR-71: Laudo-level parecer

An office user can set the Laudo's overall verdict and confirm a summary paragraph composed from the Laudo's own counts.

**Consequences (testable):**
- The app suggests the verdict from the sheets ("Apto com restrições?") and never suggests Não apto.
- The summary is composed on the device from counts of equipment, tested, approved with restrictions, points of attention and their priorities, and carries its criteria line.
- The engineer confirms; the app never sets it.

#### FR-72: Export options

A user can choose the section 9 ordering scheme before generating.

**Consequences (testable):**
- The option is collapsed by default, with the FO.SERV-03 scheme preselected; the dialog does not ask.

#### FR-73: The pre-issue list

Before generating, the user sees every outstanding condition in one list.

**Consequences (testable):**
- The list covers at minimum: sheets not concluded, sheets not tested with their reasons, **sheets concluded whose generated conclusion text was never confirmed and will therefore not print**, photos without captions, suggested captions awaiting batch confirmation, sheets with unconfirmed readings, a missing ART or TRT number, instruments with expired or expiring calibration, missing company brand data, and each user's last send time.
- Each row states what it is and offers the action that resolves it.
- **Only one row blocks generation: an unset parecer**, and the disabled action states that reason.
- Everything else warns. An untested equipment, an expired calibration and an uncaptioned photo all generate successfully and print their consequence.

#### FR-74: Revision history

A user can see and download every past revision of a Laudo.

**Consequences (testable):**
- Each revision lists its number, its date and both files.
- A revision's content is frozen, including photo numbering.

## 6. Non-Goals (Explicit)

Releng v1 is one report type done properly. It is not:

- **A multi-report platform.** Painel elétrico, SPDA and any load or demand study are a slot in the data model and nothing more. There is no type picker to build.
- **A SaaS product.** No signup, no billing, no subscriptions, no tenant onboarding surface, no pricing. Multi-tenancy exists in the data model so the MVP does not have to be rewritten to become one.
- **A paper digitizer.** Scanning or OCRing the filled A4 sheets is explicitly rejected. The design partner's position is unambiguous: *"A ideia era não fazer no papel. Eu já queria fazer direto na ferramenta."* The A4 intake path was the builder's proposal and is not a user requirement.
- **An equipment specification database.** Releng will not look up nameplate specifications by serial number from external sources. The partner corrected this explicitly: what is needed is pick-lists of standard values plus the manufacturer.
- **An instrument integration.** No Bluetooth, no pairing, no device SDK. Two competitors advertise it — one integration is disputed, the other covers only low-voltage meters — and neither decides the quality of the document.
- **A signing tool.** No digital signature, no ICP-Brasil integration, no ART filing. The document is printed ready to sign.
- **A collaboration tool.** No real-time co-editing of a sheet, no roles, no per-laudo sharing, no reviewer surface, no client portal, no client acknowledgement.
- **A comparison tool.** No comparison against the previous report and no equipment history screen — although the stable TAG (FR-7) is in place so history becomes possible without a migration.
- **A decision-maker.** Releng calculates, compares, highlights and suggests. It never concludes. No verdict is ever auto-set, no failing value ever becomes a Reprovado, and no AI output is ever written unconfirmed.
- **A native application.** No app stores, no platform-specific builds.
- **A marketing position built on claims that do not hold.** Two claims are forbidden by name: that this is *required by insurers*, and that *NBR 14039 requires annual maintenance*. Neither survives verification. A third, that NR-10 item 10.15.4 d covers transformer and breaker insulation testing, was refuted outright — it concerns tools and PPE.

## 7. MVP Scope

### 7.1 In Scope

- One report type: the Laudo Técnico de Cabine Primária in the FO.SERV-03 layout.
- Eight equipment block types with their nameplate fields, checklists, tests and measurement-table shapes (FR-22).
- Templates and the block model: composition, the location skeleton with quantities per column, sub-block defaults and subtypes, boilerplate with variables, template independence from laudos, and saving a laudo as a template (FR-9 to FR-14).
- Project and Laudo hierarchy, the laudo tree, field block addition and removal (FR-15 to FR-21).
- Full sheet capture: nameplate, cabine environment, checklist with bulk actions, measurements with criteria, observations, conclusion with generated text, não ensaiado (FR-22 to FR-32).
- Five camera-first assists — nameplate, instrument display, auto-caption, equipment identity, NC observation draft — plus dictation, all under one provenance-and-confirm contract, all queued offline (FR-33 to FR-42, FR-75).
- A cross-visit nameplate copy by TAG, the single history read the MVP performs (FR-34).
- Photos as first-class objects with captions, stamps, automatic numbering and a chronological gallery (FR-43 to FR-48).
- Points of attention with photos, corrective actions, priorities, suggested deadlines and owners, printed as bullets plus an action-plan table (FR-49 to FR-53).
- Offline-first capture, automatic download, zero photo loss, sub-block merge, single-cell conflicts, sync status (FR-54 to FR-61).
- Generation as DOCX and PDF together, one numbered revision, with automatic table of contents, native test tables, both section 9 ordering schemes, and revision history (FR-62 to FR-70, FR-74).
- Pre-issue checks that warn rather than block, with one blocking item (FR-71 to FR-73).
- Registries: company identity, clients, instruments with calibration, manufacturers, voltage classes, sourced acceptance criteria, stable equipment identity, and the photo location switch (FR-1 to FR-5, FR-7, FR-8).
- Named users with council and registration (FR-6).

**In the data model, with no user interface, by decision:** multiple report types, multiple companies as tenants, acceptance criteria editing, checklist item editing per company, NR-10 text selected by execution date, equipment history across visits.

### 7.2 Out of Scope for MVP

**The rule that decides this table** (confirmed 2026-09-19): *the MVP covers what the reference report covers.* If FO.SERV-03 contains it, it is in; if FO.SERV-03 does not, it is out, however good the argument for it. This replaces the earlier timing-based justification and is a stronger basis, because it is the same rule that makes the generated document acceptable to the person who signs it.

| Deferred | Reason |
| --- | --- |
| Dedicated grounding measurement sheet | **Decided by the scope rule.** FO.SERV-03 carries grounding only as checklist items — `ATERRAMENTO` on the para-raio, seccionadora and TP/TC/transformer sheets, `ATERRAMENTO CORDOALHAS` on the cable sheets — plus a definition of *Resistência Ôhmica de Aterramento* in section 2 that no sheet ever records a value for. The MVP reproduces exactly that: the checklist items ship, the measurement sheet does not. Note the consequence: NR-10 item 10.15.3 requires documented grounding measurements of every organization from 2027-06-01, so this becomes the first post-MVP addition with a deadline, not merely a backlog item (§13 Q10). |
| Dedicated 50/51 relay test sheet | **Decided by the same rule.** FO.SERV-03 section 3 puts the relay in scope and section 6 gives its procedure, yet none of the 94 sheets is a relay sheet — so the MVP carries the relay exactly as the form does: the `AJ. RELÉ 50/51` field on the breaker sheet, the `RELÉ DE ACIONAMENTO SECUNDÁRIO OU PRIM.` checklist item, and the section 6 procedure text. No relay sheet. This and the grounding case are the same defect in the source form, and they are the clearest candidates for the first post-MVP release. |
| Thermography, oil laboratory results, functional commissioning test, surge-arrester and cable-termination blocks | Raised by domain research, absent from FO.SERV-03, not requested by the design partner. |
| As-found and as-left capture as distinct values of one measurement | Raised by domain research; not in the source form. Revisit when history across visits is built. |
| Concessionaire registry (grounding limit, shutdown notice, seals, energization limit) | Real variation between utilities, but the MVP serves one company on jobs it already knows. |
| Temperature correction of insulation values to 20 °C | Needs an insulation-type field and a cited correction table; the source form does not compute it. |
| Scanning handwritten A4 sheets | See §6. Rejected on principle, not deferred. |
| Bluetooth instrument integration | See §6. |
| Digital signature and ART integration | See §6. The document prints ready to sign. |
| Comparison with the previous report; equipment history screen | Data model ready (FR-7); no surface. |
| Real-time multi-user editing of one sheet | Sub-block merge (FR-58) covers the actual working pattern. |
| Billing, subscriptions, public signup, tenant onboarding | See §6. |
| Native mobile apps | See §12. |
| Vision proposing NC checklist rows from a sheet's photos | Deliberately excluded from the AI contract (FR-41). Revisit after the first real job. Distinct from FR-75, which drafts text for a row the engineer already marked. |
| **Risk matrix** (categoria, risco, consequência) and an **NR-10 / NBR 5410 adequacy table** (tópico, requisito, referência, ação) as optional section blocks | The UX spines flag this as a PRD decision by name. **Declined for the MVP:** neither exists in FO.SERV-03; both come from the peer-built load-study tool, which is a different report type. The action plan (§5.7) already carries priority and deadline, which is what NR-10 item 10.7.11 actually asks for. Revisit if the design partner asks for them on a real job. |
| PT and AR (permissão de trabalho, análise de risco) attachment with traceability | Required by the 2027 NR-10 text for non-routine work. Not in FO.SERV-03; no partner request. |
| Roles separating the PLH in charge from authorized executors | Every user sees everything in the MVP; sheets record who filled them (FR-32). Becomes relevant when NR-10 item 10.12.9 takes effect. |

**Cut order.** The timeline has tightened — the date is 2026-10-03 — so this is no longer contingent. Report generation ships regardless. Among the assists the order of retreat is: NC observation draft (FR-75), then equipment identity from a photo (FR-38), then photo auto-caption (FR-39), then instrument display reading (FR-36). Nameplate capture (FR-33) is the last assist to go, because it saves the largest single block of typing per sheet. §7.3 applies this order to the two-week slice.

`[NOTE FOR PM]` The dedicated grounding sheet is the most load-bearing deferral in this table. It is deferred on a defensible reading — the MVP ships before 2027-06-01 and reproduces a form that has no such sheet — but the deferral has an expiry date, not merely a revisit date.

### 7.3 The two-week slice (approved 2026-09-21, due 2026-10-03)

**The arithmetic, stated plainly.** §7.1 is 75 functional requirements. Two weeks is not that. Nothing below reduces the product defined in §5 — it orders it, so that on 2026-10-03 something real exists rather than most of everything half-built. **Approved 2026-09-21 under one principle: the slice keeps everything necessary to produce the FO.SERV-03 report.** Anything the report does not need waits.

**The test the slice has to pass.** One thing makes the deadline worth hitting: the loop closes. A laudo can be composed, filled, and turned into a document Bruno reads and recognizes as his. A build that captures beautifully and cannot generate is worth nothing on 3 October; a build that generates a correct FO.SERV-03 from typed data is worth a great deal, because it proves the hard half and every assist after that is addition rather than repair.

**Ships by 2026-10-03**

- Registries and identity: FR-1 to FR-7, minus the photo location switch.
- Templates and the location skeleton: FR-9, FR-10, FR-11, FR-13. Section boilerplate is **seeded as fixed text**; the rich text editor (FR-12) waits.
- Projects, laudos, the tree, field add and remove: FR-15 to FR-19, FR-21.
- **The whole equipment sheet: FR-22 to FR-32.** This is the core and it is not cut anywhere.
- Photos with captions from context, stamps and automatic numbering: FR-43 to FR-48.
- Points of attention and the action plan: FR-49 to FR-53.
- Offline capture on one device, durable, with draft recovery: FR-54, FR-55, FR-56, FR-57, FR-61.
- **Generation as DOCX, with the table of contents, native test tables and both ordering schemes: FR-62 to FR-70, FR-74.**
- Parecer and the pre-issue list: FR-71 to FR-73.
- **One assist: the nameplate from a photo (FR-33), with the full confirm contract (FR-41) and the offline queue (FR-42) behind it.** It is the mandate's smallest honest expression, it saves the largest single block of typing per sheet, and building its contract and queue once is what makes every later assist cheap.

**Waits, in this order**

1. Instrument display reading, FR-36 — the second assist, and the largest remaining keystroke saving.
2. PDF alongside DOCX — the renderer, not the content. FR-62 ships DOCX-only in the slice.
3. Multi-device merge, conflicts and full sync status: FR-58, FR-59, FR-60. **Note what this costs:** the September job was worked by two people. One device for the first run is a real operational constraint, not a free cut.
4. Photo auto-caption by vision, FR-39; captions from sheet context still work, because they are computed locally.
5. Equipment identity from a photo, FR-38; the type list in the field palette still creates the block.
6. NC observation draft, FR-75, and dictation, FR-40.
7. Registry cross-check on nameplate values, FR-35, and wrong-digit protection, FR-37. **These two ship with FR-33 if anything does** — an unguarded nameplate read is exactly the misread-digit risk the product exists to avoid. Treat them as part of FR-33, not as separate work.
8. Move a block between locations, FR-20; save a laudo as a template, FR-14; the rich text editor, FR-12; the photo location switch, FR-8.

**What the deadline costs, honestly**

- **The success metrics cannot be validated on 2026-10-03.** SM-1, SM-3 and SM-4 are all measured on a real cabine primária job, and no job is scheduled. What 3 October can produce is a generated document from real Porto Seguro data re-entered by hand, which tests SM-4 and nothing else.
- **SM-3 will miss its target in the slice.** With only the nameplate assist, a sheet still costs the typed readings. The ≤ 20 taps and ≤ 15 keystrokes budget needs FR-36, which is first in the queue above.
- **Q0 does not go away.** Two weeks is not enough to also prove iPadOS Safari storage behavior, and single-device offline with about 82 photographs is precisely where it bites. Prove it in the first two days or accept that the slice may be desktop-and-Android only on 3 October.
- **The seed data is the hidden cost.** The eight block types in `addendum.md` §9 are content, not code: field lists, five checklist item lists, four table grammars, seeded criteria, and the section boilerplate. It is a day's careful transcription that nothing else can start without, and it is the most likely thing to be underestimated.

**The decision, taken 2026-09-21.** The slice keeps one assist and defers multi-device. The alternative is to keep two assists (nameplate and display reading, so SM-3 is testable) and defer something from the shipping list instead — realistically the action plan (FR-49 to FR-53) or the second section 9 ordering scheme. **Chosen: the slice as written.** Section 8 of FO.SERV-03 is part of the report, so the action plan stays by the slice's own principle; it is also the feature no competitor has and the one NR-10 names.

**NR-10 stays in the slice** (confirmed 2026-09-21): every NR-10 element the reference report carries ships — the PIE statement in section 2, the NR-10 procedure requirement in section 4, the quoted 10.5.1 de-energization sequence and re-energization checklist in section 5 — together with the action plan that item 10.7.11 names. Selecting the NR-10 text by execution date remains data-model only; the 2027-06-01 change is tracked in FR-66 and §13 Q10.

## 8. Success Metrics

**Primary**

- **SM-1: Time from end of field work to a report ready for signature — target ≤ 1 working day**, against about 7 days today for a large report. Measured on Fasor's next real cabine primária job. Excludes external laboratory results attached later. Validates FR-62, FR-65, FR-68, FR-73.
- **SM-2: Field data retyped after the visit — target zero.** No value that was captured on site is entered a second time at a desk. Validates FR-54, FR-58, FR-68.
- **SM-3: Effort per equipment sheet — target ≤ 20 taps and ≤ 15 keystrokes** on a fully conforme sheet whose nameplate can be copied. Measured on the next real job. Baseline: an estimated 60 to 120 typed characters per sheet today, **to be measured on the next job** rather than assumed. *This restates the brief's "≤ 20 keystrokes per sheet" in the form the UX work made measurable.* Validates FR-26, FR-33, FR-34, FR-36, FR-39.
- **SM-4: The generated report is accepted by the design partner with minor edits only, no restructuring.** Validates FR-62 to FR-70.

**Secondary**

- **SM-5: Used on Fasor's next real cabine primária job**, end to end, not as a parallel trial. Validates the product as a whole.
- **SM-6: Zero photos lost**, across the full job, under real conditions including offline capture, two devices and at least one storage warning. Validates FR-56.
- **SM-7: Corrections after the first generation are made in the app, not in Word.** Counted as the ratio of post-export edits made in Releng to edits made in the DOCX. Validates FR-62, FR-74.
- **SM-8: Time per equipment sheet in the field.** No target until a baseline is timed on the next job; instrument the product to measure it from v1, because hours per laudo is the only number that can later justify a SaaS price above the R$ 100–300/month band the category anchors at.
- **SM-9 (after the MVP): the partner keeps using it unprompted**, and 5 to 10 other MV service firms are interviewed.

**Counter-metrics (do not optimize)**

- **SM-C1: Suggestion acceptance rate must not be driven up.** A high confirm rate is only good if the suggestions are right. If confirmation becomes reflexive, the product has manufactured a signed document nobody checked. Counterbalances SM-3. Watch instead: how often a confirmed value is later edited.
- **SM-C2: Do not reduce taps by removing confirmations.** Every assist saving the engineer a keystroke costs a tap by design. Counterbalances SM-3.
- **SM-C3: Do not optimize time-to-report by reducing what is captured.** A one-day turnaround achieved by printing fewer checks, fewer photos or fewer criteria is a regression. Counterbalances SM-1.
- **SM-C4: Do not let the pre-issue list grow into a gate.** Every additional blocking condition trades the engineer's judgment for the app's. One blocking item is the budget. Counterbalances SM-4.

## 9. Cross-Cutting Non-Functional Requirements

- **Offline is a correctness property, not a degradation mode.** Every capture path in §5.4 to §5.7 works with no connectivity. A feature that cannot work offline must either queue (FR-42) or be an office surface by design.
- **Data durability.** Each measurement and photo is durable locally at the moment of capture, before any network interaction. Sync is idempotent and resumable.
- **Field ergonomics — confirmed 2026-09-19, not assumed.** The engineer works in **full protective equipment including a helmet and insulating gloves**, and **the work area is lit** — this is not a dark-basement problem. Two consequences follow. First, controls stay glove-sized and no action depends on hover or on a swipe, because the glove is always on. Second, **a touch stylus is the preferred input and the interface must be good with one**: targets sized for a gloved fingertip, but hit-testing, text fields and the measurement grid must also reward a stylus's precision rather than fighting it, and nothing may require a gesture a stylus cannot make. Palm rejection and accidental-touch tolerance follow from stylus use and belong to architecture. The earlier assumption that sunlight legibility was the binding constraint is withdrawn; the residual disabled-control contrast risk below is correspondingly smaller, though still real under a helmet visor.
- **Accessibility.** Targets WCAG 2.2 AA. Every state distinguishable without color alone; suggestions and their confirmations announced to screen readers; all reordering reachable by keyboard. One known residual: disabled controls are rendered at an opacity computed at 2.04:1, kept against the accessibility review's recommendation and mitigated only by a mandatory adjacent reason text — a live legibility risk in sunlight.
- **Localization.** Interface copy, generated document and stored domain vocabulary are pt-BR. Numeric input accepts the decimal comma.
- **Traceability.** Every measurement resolves to the instrument that produced it; every criterion to its source; every finding to its photographs; every sheet to who filled it and when; every generated file to its revision.
- **Performance.** Opening a sheet, marking a checklist and capturing a photo are immediate and never wait on the network. Generation time for a 124-page document with about 82 photographs has no stated tolerance. `[NOTE FOR PM]` Architecture needs a number.
- **Capacity.** Sized for one job of 94 equipment sheets, about 82 photographs and about 1,100 queued display readings, on a tablet, offline, for three days.

## 10. Compliance and Regulatory

The generated document becomes part of the client's PIE and may be read in an audit. That makes regulatory accuracy a product requirement, not a marketing matter. What follows is the evidence position as of 2026-09-19, with its confidence stated — the research is explicit that some of it rests on secondary sources.

**Firm, verified:**

- **Two NR-10 texts fall inside the product's window.** Portaria MTE 737/2026 takes effect **2027-06-01**. Nothing preserves reports written under the earlier text. The transition contains no grandfathering for PIEs or laudos.
- **Item 10.7.11** (from 2027-06-01) requires a report with prevention measures, an action plan and a compliance schedule, required of every organization, with no periodicity fixed. The current basis is item 10.2.4 g. This is the direct basis for §5.7.
- **Item 10.13.1** replaces item 10.5.1's six-step de-energization sequence with seven steps, adding arc-flash protection and area delimitation, and the voltage-class label changes from AT to MV for the 1 kV to 36.2 kV band. **FO.SERV-03 section 5 quotes the current text and goes stale on that date** (FR-66).
- **No norm defines the format of a preventive maintenance laudo.**
- **No norm fixes annual periodicity.** NBR 14039 item 8.2.1 requires the interval to suit the installation. Annual is market practice.
- **Calibration has no regulatory validity period.** INMETRO is explicit that the interval is set by the instrument's owner, and no source requires an RBC-accredited laboratory. This is why FR-3 alerts and never blocks.
- **No normative retention period exists.** Civil prescription reaches ten years, which is the inferred floor for keeping laudos and raw data.

**Uncertain, and treated as such:**

- **Item 10.15.6's removal of the 75 kW PIE threshold** is tagged unverified upstream, although the research reads it from the primary text. **It is the single claim the commercial timing in §2 rests on** and should be confirmed directly before it is used in a sales conversation.
- **NBR 14039 item 7.1.5**, which requires an explicit laudo only at final verification of a new or altered installation, was read from an unofficial copy.
- The reading of the **pre-2027 NR-10 text** comes from a mirror, not the primary source — the government PDF now carries only the new text. Medium-high confidence.
- **ABNT texts were read from unofficial copies.** A wrong citation in a document that goes to audit is a real risk.
- **NETA MTS-2019 against MTS-2023, NBR 10576 2006 against 2017, IEC 62271-1 2007 against 2017, and NBR 14039's announced 2026 revision are all unverified.** No criterion may be encoded without its edition declared. The frequently quoted `> 400 MΩ` in the source sheets **has no traceable source**, which is precisely why FR-5 stores criteria as sourced data rather than constants.
- **PRODIST and ANEEL REN 1.000/2021 were not researched.** There may be a utility-side requirement nobody has looked for.
- **Whether a TRT holder may sign a cabine laudo is disputed** between CONFEA and CFT. Releng records the council and number and takes no position (FR-6).

**Product consequences already reflected in the FRs:** criteria as sourced data (FR-5); calibration recorded, alerted, never blocking (FR-3); action plan as structured data with deadlines (FR-49 to FR-52); council and registration accepting either CREA/ART or CRT/TRT (FR-6); stable equipment identity for history-relative criteria (FR-7); digital output in Portuguese with frozen numbered revisions (FR-62, FR-74).

**Not reflected, deliberately:** the NR-10 text is not yet selected by execution date (data model only); grounding measurement has no sheet; PLH and executor are not separate roles. Each is listed in §7.2 with its reason.

## 11. Constraints and Guardrails

**Safety and professional responsibility.** The engineer is the professional in charge and the product never displaces that. It calculates, compares, highlights and suggests; the verdict is always a human tap (FR-29, FR-41, FR-71). One blocking pre-issue item, and only one (FR-73). An expired calibration warns and does not stop the work (FR-3), because stopping an engineer in a basement is a worse failure than issuing a warned document.

**Privacy.** Photographs of a client's installation — nameplates, panels, and the shutdown team's people — are sent to a third-party AI provider in the backend. Under the LGPD this needs a consent basis, processing terms, and a decision on whether people must be excluded from vision captioning. **This is unresolved and is legal input, not a design choice** (§13 Q12). Photo coordinates identify client premises and print in the document; the location switch (FR-8) is the user-side control, but whether coordinates may print at all is part of the same question.

**Cost.** Every AI call is an operating cost on a product built at no cost to test an idea. One job is roughly 94 nameplate reads, 1,100 display reads and 82 captions. The controls already in the design are: backend-only processing with a single queue, readings prioritized in upload order, context captions computed locally rather than by vision, and conclusion text composed on the device from values already present rather than generated. `[NOTE FOR PM]` Provider choice and cost per reading are architecture's, but the unit economics need a number before the first real job.

**Commercial.** The MVP is built at no cost by the builder with the design partner as first user. IP, equity and roles between them are undefined and out of this document's scope, but they gate any SaaS decision.

**Evidence.** The problem is real for one engineer at one company. No independent user voice exists in any of the three research reports. Competitive intelligence rests on public evidence only — 5 claims verified against 23 unverified, 2 disputed and 2 refuted — and **no competitor product was ever used with a login**. Every market claim in this document should be read at that strength.

## 12. Platform and Information Architecture

**Platform.** A responsive web application, tablet-first, phone-capable, with the desktop used for office composition and review. It must run in Android Chrome, iPadOS Safari and desktop Chrome or Edge. No native builds, no app-store publishing — a deliberate choice so the partner's mixed fleet of Android tablets, iPads and Windows machines works on day one.

**Two contexts, one application.** *Office* composes templates, sets up laudos, reviews and exports. *Field* fills sheets, photographs, and adds or removes the occasional block. This is a matter of surface, not of device: composing is the office rule and the field exception.

**Surfaces.** Login · Home with the Continue card · Project · Laudo setup · Laudo overview with the tree · Template composer · Templates · Block palette in office and field variants · Equipment sheet · Photo capture and gallery · Points of attention · Registries · Export · Sync status · Account. Account carries the user's professional registration (FR-6), the photo location switch (FR-8), a light/dark/system theme override, and the storage in use on this device. Navigation is flat: no hamburger drawer, back available on every surface, Home two taps from anywhere, modals one level deep. The full surface table and the fifteen key-screen mockups are in the UX spines.

**The app order is not the document order.** The tree is by location so that one column's disconnector, breaker, VT and CT are filled in a single pass at the panel. The document is rebuilt at generation into the FO.SERV-03 reading order (FR-68). Keeping these two orders separate is a deliberate architectural commitment, not an implementation detail.

`[ASSUMPTION: location depth is fixed at Cabine › Coluna, but the real data needs one level in some cabines and three in others — the 1° Subsolo has two panels each containing a "Coluna 2". Either Coluna becomes optional and carries the panel in its name, or a third level is needed; §13 Q13]`

## 13. Open Questions

Ordered by how much they can change what gets built.

0. **Can photo-safe offline capture actually be built on iPadOS Safari?** This gates everything else. Safari evicts script-writable storage after seven days without use unless the app is installed to the home screen — **which the web-only decision of 2026-09-21 rules out as a mitigation** — does not honor `persist()`, and runs background sync only while the tab is foregrounded — against §12's requirement to run on iPadOS Safari, FR-56's guarantee of zero photo loss, and a three-day offline job carrying about 82 photographs. **Prove this before anything is built on top of it.** Without home-screen install, the realistic mitigation is a short offline window: upload every photo and sheet at the first connectivity and keep a job's unsynced data measured in days, not weeks. If it cannot be proven, either the platform commitment or the zero-loss guarantee has to change, and both are load-bearing.
1. ~~**When does the MVP need to exist?**~~ **Answered 2026-09-19: 2026-10-03, two weeks.** See §2 and §7.3. The slice in §7.3 was approved on 2026-09-21.
2. **Laudo status transitions.** The forward path is defined; exporting while Em campo, re-exporting after Emitido, and a manual move back to Rascunho followed by a sheet edit are not. Needed before FR-21 is built.
3. **Sheet attribution semantics.** Attribution is currently overwritten on every save. Whether to keep first-filled-by, last-modified-by and concluded-by, and which of them prints, is undecided — today a one-tap correction by a second user re-attributes the whole sheet in a signed document. Needed before FR-32 is built.
4. **Project, Client and Site.** Three names for two concepts. TAG uniqueness scope and copy-on-create both hang on which one is the stable entity. Needed before FR-7 and FR-15 are built.
5. **What "Salvar como template" carries.** Locations, yes. TAGs, cabine flags and per-sheet sub-block overrides, undecided. Affects FR-14 only.
6. **Will Fasor need to change an acceptance criterion or a checklist item before the first real job?** If yes, the data-model-only decision for criteria and checklist editing acquires a surface, and §7.1 changes.
7. ~~**Content Bruno has to supply.**~~ **Mostly answered 2026-09-19: derive from the reference report.** Subtypes come from its nameplate fields and the Não ensaiado reasons from its section 8, both now in FR-11 and FR-31. **One part could not be answered from it:** the NC chip phrases, because every observation cell in the delivered instance is blank. FR-25 now ships them empty and lets them self-seed from use. Confirm that is acceptable rather than waiting on authored content.
8. **Do the field tablets carry an offline pt-BR speech pack?** Without it the dictation control is hidden exactly where it is most useful. Affects FR-40.
9. **The P0–P4 priority scale, its names and its day counts** come from the peer-built reference tool, not from Fasor's practice. Confirm or replace. Affects FR-50.
10. ~~**Grounding measurement, and the 2027-06-01 deadline.**~~ **Answered 2026-09-19 by the scope rule in §7.2: the MVP covers what the reference report covers, so grounding ships as checklist items only.** The part that does not go away:  from 2027-06-01 NR-10 item 10.15.3 requires every organization to document its grounding measurements, and item 10.7.11 changes the legal basis the action plan cites. **Commit the grounding sheet to a dated post-MVP release rather than a backlog**, and note that the reference report itself is inconsistent here: its section 2 defines *Resistência Ôhmica de Aterramento* as something measured, and no sheet records it.
11. ~~**Field ergonomics have never been confirmed.**~~ **Answered 2026-09-19: full protective equipment including helmet, insulating gloves, lit work area, and a touch stylus as the preferred input.** Folded into §9. What remains open is narrower and now testable: whether the sheet layout and the measurement grid are actually good with a stylus, which the first mockup at real size answers.
12. **LGPD basis for sending client installation photographs to an AI provider.** Consent wording, where it lives, whether people must be excluded from vision captions, and whether coordinates may print. Legal input first, then one line of microcopy.
13. **Location depth.** Cabine › Coluna does not fit all the real data. See §12.
14. **Who reviews in the office?** No reviewer role and no review surface are specified, yet the workflow has a review step and a status named Em revisão.
15. ~~**Does Fasor perform load and demand studies?**~~ **Answered 2026-09-19: not a consideration — the focus is the reference report.** "Estudo de carga e demanda" is not a named future type anywhere in this PRD.
16. **Competitive benchmark not run.** Research recommended subscribing to Mesh Labs and reproducing a real Fasor report on it before freezing scope; the team declined, to keep the product independent. Recorded as a divergence, not an omission — but it means the gap analysis behind §2 was never tested against the product itself.
17. **Norm editions to re-verify before any criterion is encoded:** NETA MTS-2023, NBR 10576:2017, the announced NBR 14039 revision, and NR-10 itself — the last of these was given a revalidation date of **2026-12-01** by the upstream research, along with three competitive revalidation dates that the competitive claims in §2 silently depend on. They are listed in `addendum.md` §5.
18. **Where para-raios and cabos print in a type-grouped cabine.** The source document has no example, and the seed template groups by type in exactly the two cabines that hold them. Affects FR-68 only, but it affects every generated document.

## 14. Assumptions Index

Every `[ASSUMPTION]` in this document, surfaced for confirmation.

- **§2, §11 stakes** — calibrated as launch-grade rigor on an internal-first MVP: a real client deliverable in a regulated domain, one design partner, a SaaS-ready data model.
- **FR-5** — Fasor will not need to change an acceptance criterion before the first real job, so criteria stay read-only.
- **FR-14** — saving a Laudo as a Template carries TAGs, cabine flags and per-sheet sub-block overrides.
- **FR-15** — Project, Client and Site resolve to two concepts; the stable one is unnamed.
- **FR-21** — the laudo status transition table is incomplete.
- **FR-32** — attribution is last-writer; which attribution prints is undecided.
- **FR-40** — the field tablets have an offline pt-BR speech pack.
- **FR-45** — photo ordering uses EXIF capture time where present and device time otherwise, in America/Sao_Paulo.
- **FR-50** — the P0–P4 scale, its five names and its day counts are inherited from the reference tool.
- **FR-62** — generation runs server-side, so export needs connectivity.
- **§12** — location depth of exactly two levels fits the real data. It does not, in at least two known cabines.
- **FR-68** — where para-raios and cabos print inside a type-grouped cabine is undefined; the source document has no example.
- **Roles** — the office assembler and the field engineer are the same people. The September job split photographs and test reports between Bruno and Eduardo, in the reverse of the direction the journeys illustrate.
