---
id: SPEC-fasor
companions:
  - glossary.md
  - delivery-slice.md
  - source-deltas.md
  - ../../planning-artifacts/prds/prd-fasor-2026-09-19/prd.md
  - ../../planning-artifacts/prds/prd-fasor-2026-09-19/addendum.md
  - ../../planning-artifacts/ux-designs/ux-fasor-2026-09-18/EXPERIENCE.md
  - ../../planning-artifacts/ux-designs/ux-fasor-2026-09-18/DESIGN.md
  - ../../planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/briefs/brief-fasor-2026-09-18/brief.md
  - ../../planning-artifacts/briefs/brief-fasor-2026-09-18/addendum.md
  - ../../planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-mvp-scope.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Releng (codename fasor) — field-to-report tool for the FO.SERV-03 relatório

**Reading order when companions disagree:** `source-deltas.md` wins; then `ARCHITECTURE-SPINE.md` on architecture; then `EXPERIENCE.md` and `DESIGN.md` on interaction and visuals; then `prd.md` on scope. FR-N references resolve in `prd.md`; AD-N in the spine; seed content in `addendum.md` §9. Vocabulary is `glossary.md`: the deliverable is a **relatório**, the product name is the placeholder **PRODUTO**, the codename never surfaces.

## Why

A pain and a mandate. An electrical maintenance engineer at Fasor Engenharia spends three days inside a medium-voltage substation with a clipboard and the next week retyping it: one job is a 124-page report with 94 per-equipment test sheets pasted into Word as pictures and 82 hand-numbered photos, written up about fifteen days after the work, and the client cannot be invoiced until it ships. Releng is a browser-based, tablet-first tool that captures each sheet once, on site, with no signal, and generates the company's own FO.SERV-03 document as DOCX and PDF on the way back. The mandate is dated: NR-10 as rewritten by Portaria MTE 737/2026 takes effect 2027-06-01 and names a report with an action plan and compliance schedule, which no medium-voltage competitor structures; Mesh Labs launched a competing app in September 2026 and has announced the table of contents Releng already produces. The user's product principle of 2026-09-18: *type as little as possible; the app captures by camera and infers, the engineer confirms.* The MVP is due 2026-10-03 as the slice in `delivery-slice.md`.

## Capabilities

- **CAP-1** Company document identity (FR-1)
  - **intent:** An office user records the company's brand, contact lines and form identity (title, code, revision) once, so every generated page carries them.
  - **success:** A generated document's header, footer and cover are composed from Registries › Empresa with nothing asked at export; a missing logo or razão social appears as a pre-issue warning and the document still generates.

- **CAP-2** Clients, projects and relatórios (FR-2, FR-15, FR-16)
  - **intent:** A user registers clients and sites, opens a Project per client and site, and creates many relatórios inside it from a Template, with the single report type "Cabine primária" preselected.
  - **success:** Creating a relatório from the seeded Template produces every Equipment block in its column with a suggested TAG and nothing left to place; the cover's client and site fields fill from the registry; CNPJ is optional and prints in the document control table when present.

- **CAP-3** Instrument registry with calibration (FR-3, FR-70)
  - **intent:** A user registers test instruments with code, identity, calibration record and certificate file, and selects one by code on any measurement table.
  - **success:** Selecting code "2E" fills the table's instrument header (manufacturer, type, serial, certificate under `RBC:`, test parameter) as values copied at selection; an expired calibration is amber in the picker and in the pre-issue list and never blocks capture, conclusion or generation; the certificate prints full-page in section 11 for every instrument any sheet used or setup checked.

- **CAP-4** Value registries with inline creation (FR-4)
  - **intent:** Manufacturers and voltage classes are pick-lists, creatable inline from the field that needs them, offline.
  - **success:** Creating "Celtta" from a nameplate field with no connectivity makes it available immediately on that device; the server merges "Schneider" and "SCHNEIDER" by normalized name and every sheet keeps its spelling by value.

- **CAP-5** Acceptance criteria as sourced data (FR-5)
  - **intent:** Every test carries its acceptance criterion as operator, value, unit, type and source with edition, seeded from FO.SERV-03 and read-only in the MVP.
  - **success:** `> 400 MΩ` fails below and `< 250 µΩ` fails above; the criterion and its source print beside the value; a kernel test rejects a seed criterion missing operator, type or source (edition nullable, "aceitável na ficha" allowed); no criterion value exists in application code or layout.

- **CAP-6** Named users with professional registration (FR-6)
  - **intent:** A user signs in with e-mail and password; the account holds name, council (CREA or CRT), registration number and title.
  - **success:** The council choice switches printed labels between CREA/ART and CRT/TRT and the printed title; a new relatório's responsável prefills from the account so only the ART or TRT number is typed; a session survives going offline for the whole job; users are provisioned by a seed CLI, with no signup and no roles.

- **CAP-7** Stable equipment identity (FR-7)
  - **intent:** Every Equipment block carries a TAG suggested from type plus column, unique within the Project, preserved through renaming.
  - **success:** The first Chave seccionadora in Coluna 5 suggests SEC-C05 and the second SEC-C05-2; a duplicate typed on the device is refused inline naming where the existing one lives; renaming keeps the equipment's links and its last issued nameplate.

- **CAP-8** Templates with the location skeleton (FR-9, FR-10, FR-11, FR-13; FR-12 and FR-14 post-slice)
  - **intent:** An office user creates, duplicates, archives and composes Templates from Section and Equipment blocks, defines cabines and columns with per-column quantities per block type, switches sub-blocks on or off and sets subtypes that pre-mark checklist items NA; editing a Template never touches existing relatórios.
  - **success:** "Cabine primária — padrão" exists before any user action; 1 seccionadora, 1 disjuntor, 1 TP and 1 TC on a column repeated across 17 columns yields the correct per-type totals with each block in its column; the manual subtype pre-marks Motor and Fusíveis NA while both rows stay on the sheet and editable; a dry-type subtype pre-marks the oil rows NA; changing a Template after a relatório exists leaves that relatório untouched and the relatório records which Template and seed version it came from.

- **CAP-9** Relatório setup and status (FR-16, FR-21)
  - **intent:** An office user records cover data, section 1 variables, section 3 exclusions, cover photo, responsável with ART or TRT, instruments and certificates, site altitude and the next recommended intervention with its justification, in one setup page; the relatório carries a status Rascunho › Em campo › Em revisão › Emitido.
  - **success:** Client, site and responsável prefill; altitude is asked once, prefilled from geolocation and confirmed; Home groups relatórios by status with counts and the relatório Em campo on this device sorts first; editing after Emitido shows a banner naming the issue date and revision and warns that the next generation is a new revision; the next intervention is never defaulted to a year.

- **CAP-10** Sumário and tree (FR-17; EXPERIENCE › Information Architecture)
  - **intent:** A user navigates a relatório two ways: the Sumário, the document's own table of contents in FO.SERV-03 order where each row shows what is missing and is an editable object, and inside section 9 the location tree Cabine › Coluna › Equipamento ordered as the substation is walked.
  - **success:** Sumário rows and the Export pre-issue list come from one kernel function and never disagree; every block is born in a location; each Equipment row shows one of Vazia, Em preenchimento, Concluída, Não ensaiada with its reason; blocks with unconfirmed Suggestions are not counted as filled; the header shows fichas concluídas de N, NC abertos, não ensaiadas and sugestões por confirmar, each navigable; on tablet and desktop the tree is a left rail inside a sheet, on phone its own surface.

- **CAP-11** Blocks added, removed, restored, reordered and moved (FR-18, FR-19, FR-20)
  - **intent:** A user adds an Equipment block in the field (camera first, then the eight types, no Section blocks), removes and restores a block, reorders by press-and-hold drag, overflow menu, keyboard or a typed position, and moves a block to another location with its data.
  - **success:** A block added in the field prints in tree order inside its section 9 group, indistinguishable from one composed in the office; removing a block with data asks confirmation naming the TAG then offers a persistent undo, and the block is recoverable until export; typing a position number moves the block and announces the new position; adding works with no connectivity; no swipe gesture performs any action.

- **CAP-12** Eight equipment block types from versioned seed data (FR-22; `addendum.md` §9)
  - **intent:** Adding a block of a type materializes its nameplate fields, checklist items and tests with their table shapes from seed data decoded from FO.SERV-03, so the engineer types only what is specific to the unit.
  - **success:** The eight types resolve to the field lists, five checklist lists and four table grammars of `addendum.md` §9, with the decoded counts (para-raio 5, seccionadora 10, disjuntor 13, TC 14) winning over FR-22; Transformador de força carries the conclusion block absent from the source; the two checklist column orders and EPÓXI/EPOXI normalize to one; every relatório records its seed version and a later seed never rewrites it.

- **CAP-13** Nameplate and cabine data capture (FR-23, FR-24, FR-34)
  - **intent:** A user fills a nameplate by camera, by copy or by typing, and records substation characteristics and test environment once per cabine.
  - **success:** An empty nameplate group shows the camera tile as primary and "Digitar" as a link beneath; "Igual à ⟨TAG⟩?" (another sheet of the same type and manufacturer in this relatório) and "Copiar da última visita (⟨TAG⟩)" (the equipment's last issued nameplate) write plain values with an undo toast, never Suggestions; substation type, voltages, installed power, altitude, temperature and humidity are edited only in the "Da cabine" block of the cabine's first sheet, shown read-only on every other sheet and on the tree row, and print once per cabine; "Copiar da cabine anterior" fills temperature and humidity in one tap.

- **CAP-14** Checklist capture with bulk actions (FR-25, FR-26)
  - **intent:** A user sets each item C, NC or NA with an observation, required on NC; marks all remaining unset items C in one action; repeats the pattern of the last concluded sheet of the same type.
  - **success:** No item is pre-marked C silently, only a subtype's NA defaults; "Marcar os restantes como Conforme" touches only unset rows; "Repetir da ficha anterior do mesmo tipo" copies the tri-state pattern and never observations or photos; both are undoable by a toast naming the count and disabled with the reason stated when they do not apply; per-item chips insert plain text, ship pre-seeded with standard phrases describing that item's typical non-conformity, and add the five most recent typed values.

- **CAP-15** Measurement capture with criteria (FR-27, FR-28; `source-deltas.md` on insulation)
  - **intent:** A user enters values by typing, the primary path, or by camera reading or dictation, against the instrument header and the sourced criterion; the app compares, highlights and never issues a verdict.
  - **success:** pt-BR input is parsed and echoed back before comparison ("3.300" is three thousand three hundred); a typed unit suffix is parsed ("147G" is 147 GΩ), otherwise the unit defaults from the previous row and a tap cycles it; Enter moves down a column and Tab right on a decimal keypad; a value outside its criterion is amber, never red; a value two orders of magnitude off its peers gets an amber helper line naming the comparison and never a block; each cell has an explicit not-measured state printing "-"; insulation is captured at 1 minuto only and the 30 s, 10 min, absorção and polarização columns print "-"; the ratio test's VAL CALCULADO is computed from the nameplate and never typed; SATISFATÓRIO prints per measurement, not as the sheet's conclusion.

- **CAP-16** Sheet conclusion with generated text (FR-29, FR-30)
  - **intent:** A user sets Aprovado or Reprovado and Sem or Com restrições; the app suggests the pair from the sheet's own content and composes on the device a conclusion paragraph that lists the values and criteria it used.
  - **success:** All rows C or NA and all readings within criterion suggest "Aprovado · Sem restrições?", any NC row or out-of-criterion reading suggests "Aprovado · Com restrições?", and Reprovado is never suggested; one tap applies both pairs; the paragraph is built by a fixed template per block type with no connectivity and no model call, recomposes silently while unconfirmed, and after confirmation offers "Sugerido: texto atualizado — Substituir" and never overwrites; an unconfirmed text neither blocks concluding the sheet nor prints.

- **CAP-17** Não ensaiado (FR-31, FR-51)
  - **intent:** A user marks an equipment as not tested with a reason: Impossibilidade de desligamento, Solicitação do cliente, or Outro with text, defaulting to the last reason used in this relatório.
  - **success:** The sheet prints its nameplate and a reason band carrying the reason with its operational justification and no measurement tables; every Não ensaiada equipment appears in generated section 8 after the manual points with its reason, derived at render and never stored as a point.

- **CAP-18** Attribution, autosave and draft recovery (FR-32, FR-61)
  - **intent:** Every field change is saved locally without a Save action; each sheet records who created, edited and concluded it and when; an interrupted session offers recovery.
  - **success:** "Concluir ficha" changes state only; reopening after a closed tab or crash offers "Rascunho encontrado — Recuperar" and never applies it silently; the sheet header and the printed sheet show attribution (concluded by, falling back to last modified by) with its time.

- **CAP-19** Camera-first assists under one provenance-and-confirm contract (FR-33, FR-35 to FR-42, FR-75; slice ships FR-33 with FR-35, FR-37, FR-41, FR-42)
  - **intent:** A user photographs a nameplate, an instrument display, an equipment panel or a checklist row's evidence and receives Suggestions read in the backend: one per nameplate field, values with units into the next empty cells, type plus column plus TAG that creates the block, a caption, a one-sentence NC observation draft; and dictates into captions, observations and measurement tables.
  - **success:** Nothing unconfirmed is written, counted or printed; typing into a suggested field discards that suggestion only; a filled field is never overwritten and a differing suggestion appears beside it with a replace action; camera-derived suggestions show their source crop, shrinking to a glyph reachable until export; a numeric value is confirmable only when its digits are covered by the OCR text layer, otherwise it is flagged Verificar, shown with its best guess and skipped by "Confirmar todos"; a suggested voltage class absent from the registry is Verificar and an unknown manufacturer offers "Criar ⟨nome⟩?"; free prose is never guessed and an uncaptionable photo stays "Sem legenda"; offline, the photo is kept and queued, the cell stays typeable, reading photos upload first, the reading runs at the first connectivity and a toast names how many are ready; a failed reading offers retry or type manually with nothing written; a display reading that arrives after the value was typed only checks it; Reprovado and Não apto are never suggested; the dictation control is hidden, not disabled, where no engine exists; suggestions are announced to screen readers with their value and a confirm action.

- **CAP-20** Photos as first-class objects (FR-43 to FR-48)
  - **intent:** A user captures bursts directly from any surface, imports photos from the device or a computer, and every photo carries a caption from context, a date, time and coordinate stamp, a place in one chronological gallery and an automatic number.
  - **success:** No composer opens during a burst; a photo taken from a sheet gets an editable context caption (equipment and location from the sheet, activity from the section); an imported batch asks "De qual equipamento?" once and its context caption can be kept, typed over or dictated; "Adicionar fotos" is a visible button on every sheet and in the gallery with drag-and-drop on a computer; the stamp shows on the tile, in the viewer and beneath the photo in section 7, with coordinates only when the account switch is on; the gallery is chronological across devices and filterable by location; numbers are assigned at generation in gallery order, frozen with the revision and shown as provisional before; a photo from an NC row prints its item reference; a photo with people is never sent for vision captioning and prints with its context or typed caption; the same photo is reachable from the gallery and from its equipment.

- **CAP-21** Points of attention (FR-49, FR-51, FR-53; FR-50 and FR-52 post-MVP)
  - **intent:** A user records a finding with text, linked photos, equipment or TAG and a recommended corrective action, from an expanded NC row in the field or from the points surface in the office, with chips for recurring findings; section 8 prints them as the source report does.
  - **success:** A photo picked from the gallery prints as "conforme Imagem NN" resolved at generation; section 8 prints the points as bullets in the source's prose form, followed by the derived untested-equipment entries with their reasons; a chip inserts editable plain text; priority, deadline and owner exist as data-model fields with no surface and no table in the MVP (decided 2026-09-21 against FO.SERV-03 §8, which carries none).

- **CAP-22** Offline-first capture with automatic sync (FR-54 to FR-57, FR-60)
  - **intent:** Every capture action works with no connectivity in an ordinary browser tab; a relatório downloads itself to a signed-in device; everything cached resumes and sends when connectivity returns with no action from the user.
  - **success:** Each measurement and photo is durable locally at capture before any network call; a relatório on the device opens with no network and nothing shows a spinner for an absent network; a relatório created in the office is on the tablet with its freshness shown and one not on the device is shown as unavailable rather than empty; upload is resumable and idempotent so a retry never duplicates; a failed upload errors on its own tile and retries without blocking others; storage low is warned before capture is refused, naming the remaining space, with captured photos safe; the sync badge opens counts of sheets and photos pending, readings queued, suggestions awaiting confirmation, last sync, each user's last send, errors and merges; acceptance tests cover the tab closed mid-sheet, the network dropped mid-upload and the quota exhausted.

- **CAP-23** Multi-device merge and true conflicts (FR-58, FR-59; post-slice)
  - **intent:** When two devices edited the same sheet offline, the sheet merges by sub-block without asking; only a genuine contradiction is put to the user, and only the contradicting part.
  - **success:** A row NC on one device and C on the other resolves to NC keeping that device's photo and observation; cells one device filled and the other left empty are filled; photos and captions never conflict; every merge is listed as information naming the sheet; a conflict is one cell or one structural decision shown as one row with both options and their provenance, crop included; a block removed on one device and edited on the other offers keep or remove; a block added elsewhere appears in the tree as information.

- **CAP-24** Generation as a numbered revision in the FO.SERV-03 layout (FR-62 to FR-70, FR-74)
  - **intent:** A user generates the relatório as a DOCX and a PDF of identical content, one numbered revision, from application data: cover, document control page, automatic table of contents, section blocks with resolved variables, section 7 photo record, section 8 action plan, section 9 sheets as native tables grouped "Por local e tipo", section 10 parecer, fixed bullets, ART or TRT line and signature block, section 11 certificates; and previews the same document with a RASCUNHO watermark.
  - **success:** A4 portrait with the source margins; header with logo, two-line form title and code plus form revision, footer with company lines and "Página X de Y"; the document control page is the only place the export revision prints; the table of contents lists every present section with page numbers that match; sheets print as tables, not images, grouped per cabine in tree order or by type in the fixed order Seccionadoras, Disjuntores, TP and TC as per-column pairs, then Transformadores with their feeder cables, with the field-order base case always available in the kernel; each sheet prints title as type plus role plus TAG, attribution, conclusion pair, confirmed text with its criteria line, and its photos beside its tables; sub-blocks switched off are omitted; unconfirmed Suggestions never print; section 6 prints the form's full catalogue including Relé de Proteção; section 5 prints the current NR-10 10.5.1 text; the PDF is converted in the same job from the job's own DOCX; a failed generation leaves data untouched and consumes no revision number; every past revision stays listed and downloadable with frozen photo numbering; a preview differs from an issue only by the watermark and the revision line.

- **CAP-25** Parecer and the pre-issue list (FR-71 to FR-73)
  - **intent:** An office user sets the relatório-level verdict, confirms a summary composed on the device from the relatório's counts, and sees every outstanding condition in one list before generating; only an unset parecer blocks.
  - **success:** The verdict is suggested from the sheets and Não apto is never suggested; the summary carries its criteria line and the engineer confirms it; the list covers at minimum sheets not concluded, sheets not tested with reasons, concluded sheets whose text was never confirmed, uncaptioned photos, suggested captions pending, unconfirmed readings, a missing ART or TRT, expired or expiring calibration, missing brand data, rejected changes and each user's last send; each row offers its resolving action; exactly one row blocks and the disabled action states that reason; an untested equipment, an expired calibration and an uncaptioned photo all generate and print their consequence.

## Constraints

- **Web only.** A responsive web application in an ordinary browser tab on Android Chrome, iPadOS Safari and desktop Chrome or Edge; no home-screen install prompt, no native build, no store. Offline must therefore work without installation; the offline proof runs on desktop Chrome or Firefox first, then iPadOS Safari (`delivery-slice.md`).
- **Offline is a correctness property.** Every capture path works with no connectivity; each measurement and photo is durable locally at capture; the signed-in session continues offline and resumes without a new sign-in; a feature that cannot work offline either queues or is an office surface by design.
- **Provenance-and-confirm.** Nothing unconfirmed is written, counted or printed; no verdict is ever auto-decided; a known-shape field shows its best guess flagged Verificar; free prose is never guessed.
- **AI reading runs in the backend through one queue.** The language model never emits coordinates; grounding comes from a real OCR layer and a numeric suggestion is confirmable only when its digits are covered by cited OCR tokens; every reading logs tokens and cost; the backend never uses a personal Claude subscription; a fake fixture provider is the local default.
- **Scope rule.** The MVP covers what FO.SERV-03 covers; what the reference report lacks stays out however good the argument.
- **Deadline.** Due 2026-10-03 as the slice in `delivery-slice.md`; generation ships regardless; assists retreat in the order FR-75, FR-38, FR-39, FR-36, with the nameplate (FR-33) last.
- **One device fills a relatório at a time in the MVP.** A second person's photos enter by import; multi-device merge is post-slice.
- **Nothing captured is locked to the field.** Every sheet, reading, photo, caption and point stays editable after the visit from any computer.
- **Capture order is not print order.** The tree is ordered by the walk, the document by FO.SERV-03; the renderer never reorders the tree.
- **One renderer.** DOCX and PDF render from application data in one job; the PDF is never a conversion of a DOCX that left the system; there is no upload-a-revised-DOCX path.
- **Criteria are sourced data, never code.** A criterion without operator, type or declared source is rejected at seed time; criteria and checklist items have no editing surface in the MVP (confirmed 2026-09-21); any future criterion cites a verified edition (NETA MTS-2023, NBR 10576:2017, IEC 62271-1:2017+AMD1:2021, NBR 14039:2005 until its 2026 revision publishes); no periodicity is ever encoded as annual.
- **Exactly one blocking pre-issue row**, the unset parecer. Everything else warns.
- **Counter-metrics bend design.** Never remove a confirmation to save a tap; never reduce what is captured to speed the report; suggestion acceptance rate is not a target.
- **pt-BR everywhere.** UI copy, generated document and stored labels verbatim from FO.SERV-03; numeric input parsed pt-BR and echoed before comparison; display and document in America/Sao_Paulo.
- **Field ergonomics.** Helmet, insulating gloves, lit work area, touch stylus preferred; glove-sized targets that reward stylus precision; no hover-only or swipe action; WCAG 2.2 AA; one accepted residual: disabled controls at 2.04:1 with a mandatory adjacent reason text.
- **Insulation at 1 minuto only**, not planned to grow; the other four columns print "-"; the app computes no absorption or polarization index.
- **Design system.** `DESIGN.md` tokens map onto the implementation without changing hex values or sizes; the mockups' `tokens.css` and `components.css` are the styling layer; no emoji in UI, documents or mocks.
- **Architecture.** AD-1 to AD-27 of `ARCHITECTURE-SPINE.md` bind implementation: local-first operation log with a shared pure kernel, UUIDv7 ids, one server-side renderer over a frozen snapshot, TypeScript monorepo with an OcrProvider contract, containers everywhere, AWS as the one cloud.
- **Forbidden claims** in any product or marketing text: that this is required by insurers; that NBR 14039 requires annual maintenance; that NR-10 10.15.4 d covers insulation testing.
- **Privacy.** Coordinates print: they identify the site, not a person. A photo with people is never sent for vision captioning and still prints in section 7. The POC sends every other photograph to the reading provider with no consent gate (decided 2026-09-21); the design must keep the possibility of removing sensitive data later, so storage and data model never preclude purging originals, crops, suggestions and readings per photo or per relatório; the AWS account carries the AI services opt-out policy so Textract retains nothing for service improvement. The LGPD basis is written when the product leaves the POC.

## Non-goals

- A multi-report platform: painel elétrico, SPDA, load studies are a data-model slot with no type picker.
- A SaaS product: no signup, billing, subscriptions, tenant onboarding or pricing; multi-tenancy exists only in the data model.
- A paper digitizer: scanning or OCR of filled A4 sheets is rejected on principle.
- An equipment specification database looked up by serial number.
- An instrument integration: no Bluetooth, pairing or device SDK.
- A signing tool: no digital signature, ICP-Brasil or ART filing; the document prints ready to sign.
- A collaboration tool: no real-time co-editing, roles, sharing, reviewer surface, client portal or acknowledgement.
- A comparison tool: no comparison with the previous report and no equipment history screen.
- A decision-maker: no verdict auto-set, no failing value turned into Reprovado, no AI output written unconfirmed, no vision proposing which checklist rows are NC.
- A native application.
- A priority scale, suggested deadlines, owners and an action-plan table on points of attention: data-model fields only, dated post-MVP for NR-10 10.7.11.
- A company watermark on the generated document and a client logo on the cover: FO.SERV-03 has neither. The RASCUNHO preview watermark stays.
- Dedicated grounding measurement, 50/51 relay, thermography, oil, commissioning, surge-arrester or cable-termination sheets; as-found and as-left values; temperature correction to 20 °C; a concessionaire registry; risk matrix and NR-10/NBR 5410 adequacy table; PT and AR attachments; separate PLH and executor roles; criteria or checklist editing surfaces; NR-10 text selected by execution date. Dated post-MVP items are in `delivery-slice.md`.

## Success signal

On 2026-10-03 the loop closes: a relatório composed from the seeded Template, filled with the Porto Seguro job's data, generates a DOCX that Bruno recognizes as his FO.SERV-03 and accepts with minor edits and no restructuring (SM-4). On Fasor's next real cabine primária job the report is ready for signature within one working day of leaving the site (SM-1), no field value is retyped at a desk (SM-2), no photo is lost (SM-6), and a fully conforme sheet with a copyable nameplate costs at most 20 taps and 15 keystrokes with signal (SM-3). Full metric list and counter-metrics: `prd.md` §8.

## Assumptions

- Site is collapsed into Project; TAG uniqueness and copy-on-create hang from Project (AD-5, PRD Q4).
- Location is a tree node with depth not enforced in code; the UI renders two levels and a block may attach to any node (AD-6, PRD Q13).
- The printed sheet attribution is concluded-by with its time, falling back to last-modified-by (AD-18); adopted 2026-09-21.
- "Salvar como template" carries locations, each cabine's Agrupar por tipo flag and each block's sub-block and subtype overrides; TAGs are regenerated, not carried (post-slice).
- Dictation is online-only in the MVP: no field platform offers offline pt-BR recognition as of 2026-09-21 (Apple announced it for iPadOS 27; Chrome on Android is server-based). The control is hidden offline.
- Offline Login keeps "Entrar" disabled with the reason "Entrar precisa de conexão".
- The relatório status transition table is the AD-22 table, adopted for the MVP on 2026-09-21 absent meeting evidence; Matheus may amend it.
- In a cabine with Agrupar por tipo on, para-raios and cabos print inside the Seccionadoras group in tree order (AD-6). The reference job never hits this: its para-raios and cabos sit only in cabines the seed leaves ungrouped.
- Generation is server-side and needs connectivity; a preview is the same job with a RASCUNHO watermark.
- Photo order uses EXIF capture time when present and the device clock otherwise, sorted by capture time, device and local sequence.
- The initial NC chip phrases per item are authored from domain knowledge at seed time and reviewed by Bruno before the first real job.
- Keeping a photo with people out of the caption reading (on-device face detection or a manual mark at capture) is architecture's call; the reading job never receives such a photo for captioning.
- Dictation into captions, observations and measurement tables is product scope; all of it is post-slice, caption dictation first once an engine exists.
- "Igual à ⟨TAG⟩?" offers a copy from blocks of the same type and manufacturer in this relatório (AD-25).
- Roles are illustrative: the office assembler and the field engineer are the same people, and either may do either job.
- Releng is a working title; domain, INPI and store availability were never checked.

## Open Questions

- Does "Sugerido" versus "Verificar" read as two trust levels under a helmet visor? Confirm on the first real-size mock.
