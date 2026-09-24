---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/prd.md
  - _bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/EXPERIENCE.md
  - _bmad-output/specs/spec-fasor/SPEC.md
  - _bmad-output/specs/spec-fasor/source-deltas.md
  - _bmad-output/specs/spec-fasor/delivery-slice.md
  - _bmad-output/specs/spec-fasor/glossary.md
---

# fasor - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for fasor (product working title Releng; UI placeholder PRODUTO), decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Reading order when sources disagree (per SPEC.md): `source-deltas.md` wins; then the architecture spine on architecture; then `EXPERIENCE.md` and `DESIGN.md` on interaction and visuals; then `prd.md` on scope. The deliverable is a **relatório** (the PRD says "Laudo"; the requirement text below uses relatório). Scope rule: the MVP covers what FO.SERV-03 covers. The two-week slice (due 2026-10-03) in `delivery-slice.md` orders delivery; it does not shrink the product.

## Requirements Inventory

### Functional Requirements

**5.1 Company identity and registries**

- FR-1: An office user can record the company profile and document identity (razão social, CNPJ, address lines, telephone, e-mail, logo, optional cover background, form title, form code, form revision) with a live Brand preview of cover, header and footer; every field autosaves; razão social and logo are warned about at pre-issue, never required; the generated header, footer and cover are composed from these values and nothing is asked at export. Company watermark is out of the MVP (RASCUNHO preview watermark stays).
- FR-2: A user can register clients (optional CNPJ), their sites and a contact, and select one when creating a relatório; selecting a client fills the cover's client and site fields; CNPJ prints in the document control table when present.
- FR-3: A user can register a test instrument (short code, name, manufacturer, type or model, serial, calibration certificate number, calibration date, laboratory, RBC-accredited flag, company-set calibration interval, derived validity date, attached certificate file, default test voltage or current per test type). Selecting the code on a Measurement table copies the whole instrument header at that moment (AD-19); the registry stores no acceptance values; an expired instrument sorts first and shows "Calibração vencida" in the picker; expired calibration never blocks capture, conclusion or export; the certificate prints in section 11.
- FR-4: A user can register manufacturers and voltage classes and pick them anywhere those fields appear; a manufacturer absent from the registry is creatable inline from the field, offline, available immediately on that device; server-side deduplication by normalized name ("Schneider"/"SCHNEIDER") without touching sheets (values stored by value, AD-19).
- FR-5: Acceptance criteria are stored against the test sub-block type as operator, value, unit, criterion type and source with edition, seeded from FO.SERV-03 with source "aceitável na ficha", read-only in the MVP; comparison follows the operator direction; a seed criterion without operator, type or source is rejected at seed time; the criterion and its source print beside the value; no criterion value lives in application code or layout.
- FR-6: A user signs in with e-mail and password; the account holds name, council (CREA or CRT), registration number and title; the council switches printed labels (CREA/ART vs CRT/TRT) and the printed title; the account prefills the responsável of every new relatório (only the ART/TRT number is typed per job); users are provisioned by a seed CLI, no roles, everyone sees everything; sign-in needs connectivity and the session survives offline for the whole job.
- FR-7: Every Equipment block carries a TAG, mandatory at creation, suggested from type plus column ("SEC-C05", "SEC-C05-2"), unique within the Project (Site collapsed into Project, AD-5), preserved through renaming; a duplicate typed on the device is refused inline naming where the existing one lives; the same TAG created on two devices offline surfaces as a structure conflict on sync (post-slice).
- FR-8: A user can turn the photo location stamp on or off in Account (default on); with it on, photos carry coordinates that print beneath them in section 7; with it off, date and time only; OS permission denial is shown in Account, never fails capture. (Post-slice.)

**5.2 Templates and the block model**

- FR-9: An office user can create, duplicate and archive Templates and compose one from Section blocks and Equipment blocks in explicit order; the seeded "Cabine primária — padrão" reproduces FO.SERV-03 before any user action; duplicating copies structure and defaults, not data; archiving removes from the picker without affecting relatórios.
- FR-10: Within a Template a user defines cabines and, inside each, columns or cubicles, and sets the quantity of each Equipment block type per column (Quantity stepper); instantiation creates every block inside its column with a suggested TAG; each cabine carries an *Agrupar por tipo* flag set in the Template and overridable on the relatório.
- FR-11: A user can switch sub-blocks on or off per block type in a Template and set a subtype whose effect is to pre-mark specific checklist items NA (manual seccionadora → Motor, Fusíveis NA; dry-type TP/TC/transformer → the oil rows NA); subtype values come from the reference nameplate fields (TIPO DE SE, MEIO DE EXTINÇÃO, TIPO DE ISOLAÇÃO, ACIONAMENTO; EPÓXI/EPOXI normalized); items are never removed by a subtype; a switched-off sub-block is omitted from print, never printed empty. The optional "IA e IP lidos do visor" column pair is a template toggle, off for Fasor.
- FR-12: An office user can edit a Section block's fixed text in a rich text editor within the Template composer using named variables (post-slice). In the slice, boilerplate is seeded as fixed text; inside one relatório the Section text surface edits plain text with variable chips, "Restaurar texto do template" with undo, and the edit never flows back to the template.
- FR-13: Editing a Template never alters a relatório already created from it; a relatório records its template and seed version; block order inside a relatório is per relatório.
- FR-14: A user can save an existing relatório's structure as a new Template carrying locations, cabine flags and per-block sub-block and subtype overrides; TAGs are regenerated; filled data, photos and points are not carried. (Post-slice.)

**5.3 Projects, relatórios and the tree**

- FR-15: A user can create a Project (one client and site) and many relatórios inside it; "Novo relatório" (Form dialog) shows the report type with the single option "Cabine primária" preselected, a template Combobox (last used in the project), start and end dates; "Criar relatório" opens Relatório setup.
- FR-16: An office user records, in one scrolling page of numbered bands ("Etapa n"), the cover data, section 1 variables, section 3 exclusions, cover photo, responsável with council and ART/TRT number, instruments used (checkbox list), certificates to attach, site altitude (asked once, prefilled from geolocation, confirmed), the next recommended intervention (date plus justification, never defaulted to a year) and the "Conclusão e parecer" band; client, site and responsável prefill; substation characteristics and environment are not here (they belong to each cabine); "Concluir dados do relatório" marks setup complete.
- FR-17: A user navigates a relatório two ways: the **Sumário** (relatório overview) lists Capa e dados, Controle do documento and sections 1 to 11 in FO.SERV-03 order, each row showing its status from the same kernel pre-issue check the Export uses, each row an editable object (Overflow: Adicionar abaixo · Subir · Descer · Duplicar · Remover; the section number is the Position box; cover and document control fixed at top), section 9 expanding into the unnumbered location tree, header counts (fichas concluídas de N · NC abertos · não ensaiadas · sugestões por confirmar) each navigable, "Pré-visualizar" and "Gerar relatório" at the foot, expansion following status (Em campo opens section 9 at the last sheet worked); the **rail** inside a sheet (tablet/desktop) lists cabines and fichas only; on phone the tree is its own surface. Every block is born in a location; each Equipment row shows Vazia, Em preenchimento, Concluída or Não ensaiada with reason; blocks with unconfirmed Suggestions are not counted as filled.
- FR-18: A field user can add an Equipment block from a tree row or from the sheet they are on; the field Block palette offers "Fotografar equipamento" first, then the 8 types with suggested TAG, no Section blocks and no sub-block toggles; the office palette offers sections, the 8 types (asking TAG and location, prefilled) and, inside a sheet, that block's sub-block toggles; a field-added block prints in tree order in its section 9 group; adding works offline.
- FR-19: A user can remove a block (Confirm dialog naming the TAG when it holds data, then a persistent undo toast), restore a removed block ("Restaurar ficha removida" in the Sumário header Overflow, until export), duplicate a block (structure only, asks a new TAG), and reorder four ways: press-and-hold drag, Overflow "Subir · Descer", keyboard Alt+↑/↓, and a typed Position box (clamped to range); every move is announced and undoable; no swipe gesture performs any action.
- FR-20: A user can move an Equipment block to another location ("Mover para…") carrying its data, with an offer to re-suggest its TAG for the new column. (Post-slice.)
- FR-21: A relatório carries a status Rascunho › Em campo › Em revisão › Emitido per the AD-22 table (setup_complete → Em campo; generate → Em revisão, allowed and warned while Em campo; issue → Emitido; an edit after Emitido → Em revisão; manual backward moves through Confirm dialog); every transition is a client op; Home shows a Status board with counts per status and the relatório Em campo on this device sorts first with the `is-current` state and "Continuar: ⟨TAG⟩ · n de N" (no separate Continue card); editing after Emitido shows a banner naming the issue date and revision and warning that changes produce the next revision.

**5.4 Equipment sheet capture**

- FR-22: The MVP provides eight Equipment block types (cabos_entrada, para_raio, chave_seccionadora, disjuntor_mt, tp, tc, cabos_saida, transformador_forca) each with its nameplate field list, checklist list and tests with measurement-table shapes, resolved from versioned seed data (`addendum.md` §9, decoded counts win: para-raio 5, seccionadora 10, disjuntor 13, TC 14 nameplate fields; five checklist lists of 5/5/14/15/15 items; four table grammars); Transformador de força carries a conclusion block; the two checklist column orders normalize to one; adding a block materializes all three at once; every relatório records its seed version and a later seed never rewrites it.
- FR-23: A user can fill a nameplate by camera (FR-33), by copy (FR-34) or by typing; an empty group shows the "Fotografar placa" tile as primary with copy chips above and "Digitar" as a text link beneath; each numeric field carries its unit; field kinds are text, number, date, select, manufacturer, voltage_class (AD-11).
- FR-24: A user records once per cabine the substation type (SIMPLIFICADA - POSTE · ALVENARIA - CONVENCIONAL · BLINDADA), primary and secondary voltage, installed power, and the test environment (altitude, temperature, humidity) in the "Da cabine" block on that cabine's first sheet (computed, AD-6); every other sheet and the cabine tree row show them read-only; they print once per cabine; "Copiar da cabine anterior" fills temperature and humidity as plain values with undo; altitude is prefilled from setup and not re-asked; the thermo-hygrometer pair accepts "Ler visor" (post-slice).
- FR-25: A user sets each checklist item to C, NC or NA (Tri-state radiogroup, clearing via "Limpar" or Delete, re-tap never un-marks) and attaches an observation to any row via Overflow; the observation is required and expands inline on NC with per-item chips (pre-seeded standard non-conformity phrases plus the five most recent typed values), the Dictation button (hidden without an engine), "Adicionar foto" and "Criar ponto de atenção"; items are never pre-marked C; only subtype NA defaults are pre-set; the legend shows once per session then behind a "?".
- FR-26: A user can "Marcar os restantes como Conforme" (only unset rows; NC and NA defaults untouched) and "Repetir da ficha anterior do mesmo tipo" (tri-state pattern only, never observations or photos); both undoable by a toast naming the count, both disabled with the stated reason when they do not apply; the first action is mirrored in the Sticky action bar while the checklist is on screen.
- FR-27: A user enters Measurement table values by typing (primary path), by camera reading (FR-36, post-slice) or by dictation (FR-40, post-slice); each table carries the instrument header from the selected code and the criterion with its source behind a chevron; a value outside its criterion is amber, never red, with a one-tap "Marcar Com restrições" suggestion; Enter moves down the column and continues into the next table on the sheet as one run, Shift+Enter back, Tab right, `inputmode="decimal"`; a typed unit suffix is parsed ("147G"), otherwise the unit defaults from the previous row and a tap cycles MΩ → GΩ → TΩ; each cell has an explicit not-measured state printing "-"; pt-BR parsing (comma decimal, point thousands: "3.300" = 3300) with the parsed value echoed under the field before comparison; insulation is captured at 1 minuto only (label "1 minuto"; "Valor" on contact tables) and 30 s, 10 min, absorção and polarização print "-"; VAL CALCULADO and CONDIÇÕES (SATISFATÓRIO) are computed, never typed; the app never converts a failing value into a verdict.
- FR-28: When a value in a Measurement table differs from its peers by two orders of magnitude or more, an amber helper names the comparison ("Fase C 1000× abaixo de A e B. Conferir?"); a hint on a neutral field, never a block or a correction.
- FR-29: A user sets the sheet conclusion as two radiogroups (Aprovado/Reprovado, Sem/Com restrições); the app suggests the pair from the sheet (all C/NA and within criterion → "Aprovado · Sem restrições?"; any NC or out-of-criterion → "Aprovado · Com restrições?"); Reprovado is never suggested; one tap applies both; the suggestion disappears once any segment is set; Com restrições makes the sheet Observation required; "Concluir ficha" requires Progress = Completa and jumps to the first missing field otherwise.
- FR-30: Once a pair is set, the app composes a conclusion paragraph on the device from a fixed template per block type (kernel `composeConclusion`, not an AI call, offline) with a Criteria line listing every value and criterion used; it recomposes silently while unconfirmed; "Confirmar" writes it (`text_status = confirmed`, `text_basis` hash); "Editar" stops recomposition; after confirmation a later change offers "Sugerido: texto atualizado — Substituir" and never overwrites; unconfirmed text neither blocks concluding nor prints.
- FR-31: A user marks an equipment Não ensaiado with a reason from the seed list (Impossibilidade de desligamento · Solicitação do cliente · Outro with text, each with its justification wording; default = last used in this relatório); fields become read-only (photos and observation stay editable), reversible; the sheet prints nameplate and reason band only; every Não ensaiada equipment is listed automatically in section 8 after the manual points (derived at render, AD-26); counts as complete in progress.
- FR-32: Every Equipment block records created-by, first-edited, last-modified-by and concluded-by (materialized by `applyOp`, AD-18); the header shows attribution and the document prints concluded-by falling back to last-modified-by; every field change is saved locally as an op without a Save action (commit on blur, Enter or 500 ms idle); "Concluir ficha" changes state only; reopening after a crash or closed tab offers "Rascunho encontrado — Recuperar".

**5.5 Camera-first capture assists**

- FR-33: A user can photograph a nameplate (single shot from the tile) and receive one Suggestion per nameplate field; the photo is saved as a sheet photo captioned "placa de identificação" and appears in the gallery; the plate crop shows inline above the group (≤ 160 px, zoomable) with each field's region outlined while focused; "Confirmar todos" confirms grounded fields in one tap and reports the count; an ungrounded field is flagged Verificar with its best guess and skipped by "Confirmar todos". (In the slice.)
- FR-34: Where another sheet can supply a nameplate, a one-tap copy appears above the empty group: "Copiar da última visita (⟨TAG⟩)" when the Equipment row has `last_nameplate ≠ null` (server projection written at revision issue, AD-25; the one cross-visit read; copies only keys present at the target seed version and reports "N campos copiados"), and "Igual à ⟨TAG⟩?" when another sheet of the same type and manufacturer in this relatório has a plate; copies write plain values with an undo toast.
- FR-35: A suggested nameplate value is cross-checked against registries in the reading job: an unknown voltage class is flagged Verificar; an unknown manufacturer offers "Criar ⟨nome⟩?" inline, working offline. (Ships with FR-33.)
- FR-36: A user can photograph an instrument display from any Measurement table ("Ler visor", single or burst row by row) and receive value and unit as Suggestions in the next empty cells in reading order (a stored 30 s/1 min/10 min display fills three cells, a single-value display one); the crop appears beside each value and stays reachable until export; the unit is read from the display or defaulted; with signal it fills instantly; without signal the engineer types and the queued reading only checks the typed value (match → crop attaches silently; mismatch → amber "Visor: … · digitado … — Conferir"), never overwriting. Routed to the Python OCR sidecar (`services/ocr`). (Post-slice, first in the wait order.)
- FR-37: A camera-derived value is accepted as a Suggestion only when its digits are covered by cited OCR tokens (`digits(value) === digits(concat(cited tokens))`, checked server-side, AD-11/AD-12); otherwise it is flagged Verificar. (Ships with FR-33.)
- FR-38: A field user can photograph an equipment panel and receive type, column and TAG as one confirmation ("Criar SEC-C09-2 · Chave seccionadora · Coluna 9?") that creates the block; a wrong type is corrected on a chip row; the same photo becomes the nameplate source; offline the block is created from the type list and the photo still becomes its plate. (Post-slice.)
- FR-39: A photo from a sheet gets a plain editable context caption (equipment and location from the sheet, activity from the section on screen; "Detalhe d⟨o/a⟩ ⟨atividade⟩ realizad⟨o/a⟩(s) n⟨o/a⟩ ⟨equipamento⟩ d⟨o/a⟩ ⟨local⟩" with gender/number from registry metadata, kernel `contextCaption`); a photo without context gets an LLM vision caption on sync as a Suggestion (post-slice), batch-confirmable from the gallery header and listed at pre-issue; an uncaptionable photo stays "Sem legenda", never guessed; a photo with people is never sent for vision captioning.
- FR-40: A user can dictate into a caption (first), an observation or a Measurement table using the device speech engine; a table utterance is parsed to row, value and unit; the result is always a Suggestion; the control is hidden, not disabled, where no engine exists; dictation is online-only. (Post-slice; slice ships no engine.)
- FR-41: Every assisted value obeys one contract (AD-12): a Suggestion is an entity with `status pending|confirmed|discarded`, `trust suggested|verify`, `mode fill|replace`, source photo, bbox and OCR token ids; nothing unconfirmed is written, counted by progress or printed; typing into a suggested field discards that field's suggestion only; a filled field is never overwritten (a differing suggestion shows "Sugerido: … — Substituir"; an equal one auto-confirms with `meta.auto`); confirmed cells keep `source_suggestion_id` and their crop shrinks to a 24 px glyph reachable until export; suggestions are announced to screen readers with value and confirm action; no verdict is ever auto-decided; known-shape fields show their best guess flagged Verificar, free prose is never guessed; vision proposing NC rows is out.
- FR-42: A photo taken for an assist while offline is kept and queued (`reading_kind`, `reading_target`, `reading_status` on the photo row); the cell or tile shows "Foto guardada — leitura quando houver sinal" and stays typeable; reading photos upload before other photos; the reading runs at first connectivity while the tab is open and a toast "N leituras prontas para confirmar — Ver" opens the first sheet with pending suggestions; a sheet opened later shows the info banner "Sugestões prontas"; a failed reading shows "Não foi possível ler — Tentar novamente / Preencher manualmente" with the photo kept; the sync status counts readings queued and suggestions awaiting confirmation; sized for about 94 plates, 1,100 display shots and 82 captions per job.
- FR-75: When a checklist row is NC and carries a photo, vision drafts one sentence as a Suggestion on that row's observation ("Usar" inserts; typing keeps the engineer's text); arrives via the reading queue; last in the assist queue. (Post-slice.)

**5.6 Photos**

- FR-43: A user opens the device camera directly from the Camera capture button in the Sticky action bar of any surface (`capture` attribute, no chooser) and shoots a burst until "Concluir fotos"; no caption composer opens; "Adicionar fotos" is a visible secondary button on every sheet and in the gallery (file picker, multiple; drag-and-drop on a computer with "Solte para adicionar"); a gallery batch asks once "De qual equipamento?" (tree plus "Geral") and fills a batch caption field the engineer keeps, types over or dictates, then "Adicionar N fotos"; camera permission denied shows the reason and OS path inline, never a silent no-op.
- FR-44: A photo is a `file` row of kind photo with image, caption, `captured_at`, `tz_offset`, `local_seq`, optional coords, `block_id?`, `item_key?`, upload and reading state; a photo attached from an NC row keeps that link and prints its item reference; the same photo object is reachable from the gallery and from its equipment.
- FR-45: A user sees all photos in one chronological gallery (sort key `(captured_at, device_id, local_seq)`, EXIF time when present else device clock, America/Sao_Paulo), filters by cabine (Filter chips, "Todas" default), and opens a Photo viewer (fit-to-width, "Anterior / Próxima" buttons, caption edit, "Remover" recoverable); tiles show upload state, caption state and location state as words; gallery order becomes section 7 order.
- FR-46: A user opens the Caption composer only from "Legendar" (Atividade · Equipamento · Local rows as chip rows of recent values plus "Outro…" on field surfaces, Comboboxes on desktop; preview; "Editar texto" for free text; a vision caption as a Suggestion with "Usar").
- FR-47: Each photo carries a visible capture stamp (date, time; coordinates when the account switch is on and the OS granted it, 4 decimals, never a placeholder) on the tile, in the viewer and beneath the photo in section 7; the OS location prompt appears at first capture after sign-in.
- FR-48: Photos are numbered automatically at generation (`numberPhotos`) in gallery order, frozen with the revision, shown as provisional before export and again after any post-export change; a point of attention references a photo by token `[[foto:<photo_id>]]` resolved to "Imagem NN" at generation.

**5.7 Points of attention**

- FR-49: A user records a finding with text (photo tokens picked from the gallery), the equipment or TAG and a recommended corrective action, from an expanded NC row (pre-linked photo and equipment, focus returns to the row) or from the Points surface (row 8); cards reorder by drag, Overflow and Alt+↑/↓ and the order is section 8 order; priority, deadline and owner are data-model fields with no surface in the MVP.
- FR-50: Priority suggests the deadline (P0 today, P1 30 d, P2 90 d, P3 180 d, P4 = next recommended intervention) as a Suggestion never overwriting a typed date (kernel `deadlineFromPriority` exists). **Post-MVP.**
- FR-51: Every equipment marked Não ensaiado appears in section 8 automatically after the manual points, in tree order, with its reason and justification, derived by `derivedPoints` and never stored; a point created from an untested sheet (`origin: not_tested`) suppresses the derived entry.
- FR-52: Section 8 prints a numbered action-plan table beneath the bullets. **Post-MVP.** In the MVP section 8 prints bullets in the source's prose form followed by the derived untested entries.
- FR-53: A user inserts a recurring finding from a chip (missing safety plaques, outdated single-line diagram, etc.) as editable plain text.

**5.8 Offline capture, sync and multi-device merge**

- FR-54: Every capture action works with no connectivity in an ordinary browser tab (no install, no Background Sync, no `persist()`): sheets, checklists, measurements, photos, observations, points, adding and removing blocks, inline registry entries; each measurement and photo is durable in IndexedDB at capture before any network call; opening a relatório on the device needs no network; nothing shows a spinner for an absent network; the signed-in session continues offline and resumes sending automatically; acceptance tests cover the tab closed mid-sheet, the network dropped mid-upload and the quota exhausted; the offline proof runs on desktop Chrome or Firefox first, then iPadOS Safari (failure branch: Android Chrome and desktop only).
- FR-55: Every relatório in Rascunho or Em campo, the company scope (registries, templates, projects, users) and thumb variants are pulled automatically to a signed-in device whenever the tab is open and online (on launch, on `online`, every 60 s); Em revisão and Emitido relatórios are pulled on open; the Relatório card shows "No aparelho · atualizado hh:mm", "Baixando… n de m" or "Não está neste aparelho — conecte para baixar" (grayed; tap explains in a toast); a relatório opens as soon as its data is present, photos after.
- FR-56: No captured photo is lost under any sequence of app closure, network failure or storage pressure: the local original is kept until the server ACKs (then marked acked, evicted only under pressure oldest-acked first or when the relatório leaves Rascunho/Em campo); a failed upload errors on its own tile ("Erro — Tentar novamente", the pill retries) without blocking others; `PUT /api/files/{id}` is idempotent by id and sha256; reading photos upload first, then photos by capture time, then other kinds, two in flight; design capacity 500 photos per relatório.
- FR-57: The app warns before storage runs out (banner "Pouco espaço neste aparelho (n MB). Sincronize para liberar." when `storage.estimate()` reports under 500 MB free, provisional) and never silently refuses a capture; on refusal the photo is uploaded immediately when online, else kept in memory for one retry with an error toast; captured photos stay safe; the outbox or file queue older than 5 days raises a warning banner; an evicted origin shows a one-time screen naming what the server holds and re-pulls.
- FR-58: When two devices edited the same sheet offline, the sheet merges by sub-block without asking (NC beats C keeping that device's photo and observation; filled beats empty; photos and captions never conflict; latest text wins with the other version readable for the session); every merge is listed as information in Sync status. **Post-slice** (the op envelope with `prev_op_id` and the `superseded` signal are the contract from day one).
- FR-59: Only a true contradiction (two different filled values in one cell, or deletion vs edit of a block, or a duplicate TAG from two devices) is put to the user, as a Conflict view showing only the contradicting cells with both options and provenance (crop beside an OCR value) and "Aplicar"; the rest of the sheet is already merged; a block added elsewhere appears as information. **Post-slice.**
- FR-60: A user sees from any surface what was sent, what is waiting, what failed and what merged: the Sync badge (ok · pending · offline · error · conflict, always with a word; announces transitions only) opens Sync status with headline counts (sheets and photos pending, readings queued, suggestions awaiting confirmation) and rows for uploads, downloads, last sync, per-user last send, errors, rejected ops ("N alterações rejeitadas — Reenviar"), merges and conflicts, explanations behind "Como funciona". In the slice the badge and counts ship; the full surface waits.
- FR-61: Uncommitted field text and unsaved dialog state are persisted to a per-user `drafts` table on `visibilitychange`/`pagehide` and offered on reopen as a persistent toast "Rascunho encontrado — Recuperar", never applied silently.

**5.9 Report generation**

- FR-62: A user generates the relatório as a DOCX and a PDF of identical content as one numbered revision, server-side (`POST /api/relatorios/{id}/generate` with `{last_op_id, file_ids_expected}`; the Export dialog flushes the outbox first, `409 not_caught_up` until applied); the job freezes a `RelatorioSnapshot`, builds the DOCX with the `docx` library and converts its own DOCX to PDF with LibreOffice headless in the same job; the PDF is stored from day one (download waits for slice item 2); no upload-a-revised-DOCX path; a generate with `editedSince = false` returns the last revision; any edit after a generation makes the next one revision N+1; a failed generation leaves data untouched and consumes no revision number; the dialog shows "Gerando revisão n… pode fechar", a toast when ready, and needs connectivity.
- FR-63: Every page carries the company header (logo, two-line form title, form code and form revision) and footer (company identification lines, "Página X de Y" via PAGE/NUMPAGES fields); the document opens with the FO.SERV-03 cover (client data table: Cliente, Cidade/local, Data da execução do serviço, Informações adicionais, Responsável with council title; cover photo); A4 portrait with the source margins.
- FR-64: One page after the cover carries the composed document control table (Documento · Revisão do documento · Data de emissão · Contratante with CNPJ · Contratada with CNPJ · Responsável técnico with council and number · ART/TRT · Período do serviço); the only place the export revision prints; missing values print "—".
- FR-65: The document carries a static table of contents generated in two passes (placeholder numbers, heading pages read from the PDF outline, second pass writes them, third pass if they moved) listing every present section and subsection with matching page numbers; removed sections do not appear.
- FR-66: Sections with fixed text print from the Template (seed boilerplate keyed by `(section, effective_from)`, MVP seeds the current NR-10 10.5.1 text) with variables resolved: section 1 Objetivo (executing company, client, scope), section 3 exclusions from setup, sections 2, 4, 5 and 6 boilerplate including section 6's full catalogue with Relé de Proteção and Cubículos/QGBT.
- FR-67: Section 7 prints photos in capture-chronological order, two per row, each with its number, caption ("Imagem NN: Detalhe …") and stamp; a photo linked to a checklist row prints its item reference ("Item 8 · Contatos · NC"); numbering frozen with the revision; the renderer embeds the `print` variant (≤ 2000 px), never the original.
- FR-68: Section 9 prints equipment sheets as native tables, not images, grouped by `groupForPrint(snapshot, scheme)` with `scheme` stored per relatório (default `por_local_e_tipo`; `ordem_de_campo` as the base case, not exposed in the UI): cabines in tree order; flag off → one subsection per cabine in tree order; flag on → Seccionadoras › Disjuntores › TP's e TC's (per-column pairs) › Transformadores e Cabos de Alimentação (paired by `feeds_block_id`; unpaired cable at the end with an integrity warning), empty groups skipped, para-raios and cabos inside the Seccionadoras group (assumption); subsection title pattern "⟨Tipo plural⟩ dos Cubículos de MT d⟨o/os⟩ ⟨cabine⟩"; each sheet prints title (type + role + TAG), attribution, the cabine block on the first sheet of each cabine, the full five-column insulation grid with "-" in uncaptured columns, each value with its unit (header without unit when mixed), the criterion and source, photos linked to the equipment beside its tables, the conclusion pair and confirmed text with its Criteria line; sub-blocks off are omitted; Não ensaiada sheets print nameplate and reason band only; unconfirmed Suggestions never print.
- FR-69: Section 8 prints the points of attention as bullets with resolved "conforme Imagem NN" references followed by the derived untested entries (no table in the MVP); section 10 opens with the Parecer box (verdict word as title, confirmed summary), then the fixed bullets, the validity line echoing the ART or TRT by council, and the signature block (name, title by council, registration); no signature image.
- FR-70: Section 11 prints the calibration certificates of the union of instruments referenced by any sheet and those checked at setup, each as full-page images (certificate PDFs rasterized page by page at 150 dpi; `cert_number` mismatch flagged by integrity).
- FR-72: The section 9 ordering scheme is a typed field in the kernel and contract (`relatorio/export/scheme`) and is not exposed in the Export dialog; the dialog states "Seção 9 impressa no agrupamento do FO.SERV-03".
- FR-74: A user sees and downloads every past revision (number, date, who, both files as `file` rows of kind docx and pdf) in the Export dialog's "Revisões" list; a revision's content is frozen including photo numbering; `GET /api/revisions/{id}/{docx|pdf}`.

**5.10 Pre-issue checks and the parecer**

- FR-71: An office user sets the relatório-level verdict (Apto · Apto com restrições · Não apto, segmented radiogroup, nothing preselected) in the "Conclusão e parecer" band and confirms a summary composed on the device from the relatório's counts (`composeParecer`) with its Criteria line; the app suggests the verdict from the sheets (`suggestParecer`) and never suggests Não apto; the Parecer box takes its tone only once the verdict is set.
- FR-73: Before generating, every outstanding condition is computed by one kernel function (`preIssue`) rendered on the Sumário rows and summarized in the Export dialog ("N avisos — estão nas linhas do sumário" with "Ver no sumário", plus the one blocking row): sheets not concluded (Não ensaiada counts as concluded), sheets not tested with reasons, concluded sheets whose generated text was never confirmed, photos without captions, suggested captions awaiting batch confirmation, sheets with unconfirmed readings, a missing ART or TRT, instruments with expired or expiring (30 days after the service period end) calibration, missing brand data ("Logo da empresa não cadastrado — Cadastrar"), blank contratante CNPJ, points without action, rejected changes, tombstoned photo tokens, duplicate TAGs, and each user's last send; each row offers its resolving action; only "Parecer não preenchido" blocks "Gerar relatório" (reason beside the button, "Editar em Dados do relatório"); a read-only Document control summary sits under the list. "Pré-visualizar" runs the identical job with a RASCUNHO watermark, no revision number, no status change, served at `GET /api/relatorios/{id}/preview.pdf`, opened in a new tab.

### NonFunctional Requirements

- NFR-1 **Offline as a correctness property.** Every capture path in PRD §5.4 to §5.7 works with no connectivity inside an ordinary browser tab; a feature that cannot work offline queues (FR-42) or is an office surface by design; the UI reads only from IndexedDB (AD-1) and never awaits the network to render or persist.
- NFR-2 **Data durability.** Each measurement and photo is durable locally at the moment of capture, before any network interaction; sync is idempotent and resumable; the outbox survives Dexie upgrades (tested); a 401 during sync keeps the outbox intact.
- NFR-3 **Field ergonomics.** Helmet, insulating gloves, lit work area, touch stylus preferred: glove-sized targets (48 px hit area minimum, 56 px for field controls) that reward stylus precision; no hover-only affordance, no swipe action except system back; one shared input layer sets `touch-action`, pointer-type handling and press-and-hold.
- NFR-4 **Accessibility.** WCAG 2.2 AA across all surfaces; ink on surfaces ≥ 7:1, semantic letters on their fills ≥ 4.5:1; every state distinguishable without color alone; suggestions and confirmations announced to screen readers; all reordering reachable by keyboard and by Overflow menu; dialogs are `role="dialog"` with `aria-modal`, focus trap, Esc/back, focus return; helpers and errors associated by `aria-describedby`; live regions announce transitions, not counts; `prefers-reduced-motion` honored; text enlarges 200% without loss; one accepted residual: disabled controls at 40% opacity (2.04:1) with a mandatory adjacent reason text and `aria-disabled`, never `isDisabled`.
- NFR-5 **Localization.** Interface copy, generated document and stored labels are pt-BR (`lang="pt-BR"`), labels verbatim from FO.SERV-03; numeric input accepts the decimal comma and is echoed before comparison; dates dd/mm; display and document in America/Sao_Paulo; wire and storage timestamps UTC ISO 8601; `packages/domain/format` is the only formatter.
- NFR-6 **Traceability.** Every measurement resolves to the instrument header copied at selection; every criterion to its source; every finding to its photographs; every sheet to who created, modified and concluded it and when; every generated file to its revision and `snapshot_seq`; every reading to its `reading_run` with tokens, model, prompt version, usage and cost.
- NFR-7 **Performance.** Opening a sheet, marking a checklist and capturing a photo are immediate and never wait on the network; generation is asynchronous with progress; export time tolerance is measured on the Porto Seguro data set (no stated number).
- NFR-8 **Capacity.** One job of 94 equipment sheets, about 82 photographs (design capacity 500 per relatório), about 1,100 queued display readings, on a tablet, offline, for three days; sync push batches of ≤ 500 ops.
- NFR-9 **Platform.** Responsive web application only, tablet-first, phone-capable, desktop for office work; runs on Android Chrome, iPadOS Safari and desktop Chrome or Edge; no native build, no store, no home-screen install prompt, no manifest install; a service worker precaches the app shell only.
- NFR-10 **Safety and professional responsibility.** The app calculates, compares, highlights and suggests; it never sets a verdict; Reprovado and Não apto are never suggested; exactly one blocking pre-issue row; an expired calibration warns and never stops work; counter-metrics bend design (never remove a confirmation to save a tap, never reduce what is captured, suggestion acceptance rate is not a target).
- NFR-11 **Privacy (POC).** Photographs go to the reading provider with no consent gate; a photo with people is never sent for vision captioning and still prints; coordinates print; storage and data model never preclude purging originals, crops, suggestions and readings per photo or per relatório; the AWS account carries the AI services opt-out policy; the LGPD basis is written when the product leaves the POC.
- NFR-12 **AI cost and control.** All AI runs in the backend through one pg-boss queue; the LLM never emits coordinates; readings are logged with tokens and USD; the backend never uses a personal Claude subscription; `LLM_PROVIDER` and `OCR_PROVIDER` default to `fake` fixture providers locally; conclusion text, parecer summary and context captions are computed on the device, never by a model.
- NFR-13 **Multi-tenancy in the data model.** Every table carries `company_id`; every repository function takes it as a required argument; one test seeds two companies and asserts no cross-read; row-level security deferred until the second company; report type is a seed key with `cabine_primaria` as the only value.
- NFR-14 **Regulatory accuracy.** No criterion is encoded without operator, type and a declared source (edition nullable); no periodicity is ever encoded as annual; the NR-10 text is keyed by `effective_from`; forbidden marketing claims: required by insurers; NBR 14039 requires annual maintenance; NR-10 10.15.4 d covers insulation testing.
- NFR-15 **Product naming.** The user-visible product name comes from one config constant (PRODUTO); the codename `fasor` and the design partner's brand never appear in a user-visible string, document or file name; the Fasor Engenharia brand appears only inside the generated document; no emoji anywhere in UI, documents or mocks.
- NFR-16 **Design fidelity.** DESIGN.md tokens map onto the implementation without changing hex values or sizes; `tokens.css` and `components.css` are the styling layer; both light and dark themes obey the same contrast rules; theme attribute set on the root element so aliased component tokens re-resolve.
- NFR-17 **Testing floor.** Kernel Vitest tests (seed validation, schema-reference test, op replay byte-equality, Sumário/pre-issue identity on Dexie vs Postgres, cross-tenant test); renderer snapshot test on the Porto Seguro data set plus the draft-equals-issued test; Playwright on desktop Chrome, Android Chrome emulation and WebKit for `src/db` and `src/sync` with the three FR-54 scenarios by name; iPadOS Safari eviction and camera checked manually on a device in the first two days.
- NFR-18 **Delivery and environments.** **MVP scope: 100% local in Docker; AWS only after the MVP (Matheus, 2026-09-21).** Containers everywhere: local development always via docker-compose (web, api, Postgres 18, MinIO, OCR sidecar profile), nothing runs natively; AWS as the one cloud (ECS Fargate behind an ALB, ECR, RDS for PostgreSQL 18, S3 with versioning, Secrets Manager, CloudWatch Logs, Bedrock, Textract; region `sa-east-1`); infrastructure as AWS CDK in `infra/`; one image built per commit in CI and promoted staging → production unchanged; config only through environment variables validated by zod at boot and Secrets Manager; structured JSON logs with `company_id`, `relatorio_id`, `job_id`; `GET /api/health`; migrations forward-only as a one-shot ECS task before the service rolls.

### Additional Requirements

**Starter template and repository shape (Epic 1 / Story 1 input).** The architecture names no third-party starter template. The repository is a pnpm 12 workspace monorepo with the structural seed: `packages/domain` (pure TypeScript kernel, zod only), `apps/web` (React 19 + Vite 8 + React Router 8 library mode + react-aria-components + Dexie 4), `apps/api` (Hono 4 + @hono/node-server, Drizzle 0.45 + postgres.js, pg-boss 12, better-auth 1.7, docx 9.7, sharp, LibreOffice 26.2 in the image), `services/ocr` (post-slice, Python 3.13 + FastAPI + PaddleOCR), `infra/` (AWS CDK TypeScript), `docker-compose.yml`, `scripts/seed-users.ts`. Node 24 LTS, TypeScript 6.0, typescript-eslint 8.70, Vitest 5, Playwright 1.63. Package boundaries and `eslint no-restricted-imports` enforce dependency direction (`web → domain`, `api → domain`, `api → ocr` via contract; nothing else).

- AR-1 **Local-first client (AD-1).** Every screen renders from IndexedDB via `useLiveQuery`; every committed write becomes an op in the outbox applied locally through `applyOp` first; only `src/sync`, `src/files` and `src/api` may call the network (lint rule forbids `fetch` elsewhere); `src/api` exposes exactly `generate`, `preview`, `reread`, `signIn`, `signOut`.
- AR-2 **Shared pure domain kernel (AD-2).** The listed kernel functions (`applyOp`, `mergePolicy`, `integrity`, `preIssue`, `progress`, `sheetState`, `syncCounts`, `editedSince`, `instantiateTemplate`, `suggestConclusionPair`, `composeConclusion`, `suggestParecer`, `composeParecer`, `suggestTag`, `suggestNameplateCopy`, `compareSuggestion`, `parse`, `format`, `deadlineFromPriority`, `contextCaption`, `section11Instruments`, `calibrationCheck`, `groupForPrint`, `numberPhotos`, `extractPhotoRefs`, `resolveSection8`, `derivedPoints`, `statusTable`) exist once in `packages/domain`; neither app contains a function that derives a status, count, text, order or verdict; one integration test asserts identical kernel output on Dexie and Postgres for the Porto Seguro fixture.
- AR-3 **Operation log and `OpPath` families (AD-3).** Op envelope `{op_id uuidv7, kind create|put|remove, scope, company_id, project_id?, relatorio_id?, path, value, prev_op_id?, batch_id?, meta?, actor_id, device_id, client_ts, seq?}`; `OpPath` as a zod discriminated union with the enumerated client families and server-only families (`system:{files|reading|generate|sync}` actor, `403 op_server_only` on client push); bulk actions as N ops sharing a `batch_id`, undo as inverse ops; reorder as `put` on `order_key` (fractional-indexing); outbox coalescing rule; server-assigned monotonic `seq` per company; last-writer-wins by `seq`; replay test yields byte-equal snapshots on both layers.
- AR-4 **Client-generated UUIDv7 ids (AD-4)** for every entity, file, suggestion and op; the server mints ids only for rows it creates; deduplication by id everywhere.
- AR-5 **Ownership map and entity model (AD-5, AD-6).** Company owns users, Templates, Projects, registries; Project owns Equipment `{id, project_id, tag, type, last_nameplate?, removed_at?}` (uniqueness of `(project_id, tag)` is a kernel integrity check, not a DB constraint); Relatório owns its Location tree, blocks, sheet values, photos, points, suggestions, generation jobs, revisions and `export.scheme`; Location is a tree node `{kind cabine|coluna, se?, env?, agrupar_por_tipo?}` with `se/env/flag` valid only on cabine; `block.feeds_block_id?` links feeder cables; relatório creation is one client batch produced by `instantiateTemplate`; a company- or project-scope row never references a relatório-scope row (schema test).
- AR-6 **File entity and durability (AD-7).** `file` discriminated union on kind `{photo, certificate, logo, cover_background, watermark, cover_photo, preview, docx, pdf}`; accepted types per kind; 25 MB limit (`413 file_too_large`); owners point at files; `file/{id}` create op and the Blob write in one IndexedDB transaction; camera output re-encoded on device to JPEG ≤ 2560 px q0.85 with EXIF orientation applied and EXIF time/GPS parsed; server makes `thumb` (≤ 512 px) and `print` (≤ 2000 px) with sharp and emits `uploaded_at`/`variants` system ops; immutable object keys `company/{cid}/...`, bucket versioning on, no delete in the MVP; sync prefetches `thumb` only; `GET /api/files/{id}/{original|thumb|print}`.
- AR-7 **Offline vehicle and Safari envelope (AD-8).** Service worker precaches the shell (`/`, hashed assets, self-hosted Inter, SVG icon sprite); sync engine runs only while the tab is open; per-stream `sync_state` rows feed the card states; automatic pull scope as in FR-55; 5-day unsynced banner; eviction recovery screen; storage warning at 500 MB free (provisional); the service worker activates a new shell only when the outbox is empty.
- AR-8 **Session, origin and per-user store (AD-9).** The api image serves the built web app on the same origin, API under `/api/*`, no CORS; better-auth e-mail + password at `/api/auth/*`, httpOnly `SameSite=Lax; Secure` cookie, 30-day sliding; Dexie database `releng-{user_id}`, never dropped on sign-out; 401 raises the re-auth banner with the outbox intact; seed CLI for provisioning and password reset; Vite proxy in local dev.
- AR-9 **Tenant scoping (AD-10)** as in NFR-13; kernel schemas carry `company_id` only on `op` and `file`, `toSnapshot()` strips it.
- AR-10 **Field kinds and value shapes (AD-11).** Field definitions carry `kind`, `unit?`, `options?`; `number` values are `{raw: decimal string, unit, state measured|not_measured|empty}`; dates ISO; path value schemas validated on both sides against `(seed_version, block_type, fieldKey)`; parsing only in `packages/domain/parse` at the input boundary; per-sheet `criterion_override = {operator, value, unit, source}`; digit coverage rule for every field whose value contains a digit.
- AR-11 **Suggestion entity and provenance (AD-12)** as in FR-41: server emits `suggestion/{id}` creates with `status = pending` only; confirm and discard as batches; device-side `compareSuggestion` on non-empty targets; `RelatorioSnapshot` includes only suggestions referenced by a current cell; device-computed suggestions are derived on read, never rows; SM-C1 is server-side instrumentation over the ops table.
- AR-12 **API contract and skew (AD-13).** Routes typed in `packages/domain/contract` with `CONTRACT_VERSION` header: `POST /api/sync/ops`, `GET /api/sync/company?since`, `GET /api/sync/relatorios/{id}?since`, `PUT /api/files/{id}`, `GET /api/files/{id}/{variant}`, `POST /api/relatorios/{id}/generate`, `POST /api/relatorios/{id}/preview`, `POST /api/photos/{id}/reread`, `GET /api/revisions/{id}/{docx|pdf}`, `GET /api/relatorios/{id}/preview.pdf`, `/api/auth/*`, `GET /api/health`; error envelope `{code, message, details?}` with enumerated codes; append-only families and routes; `426 contract_outdated` only on pull with a full-screen "Atualizar" state; `services/ocr` validates against the JSON Schema exported from `contract/ocr`.
- AR-13 **Reading pipeline (AD-14).** Photo rows carry `reading_kind`, `reading_target`, `reading_status`; file receipt with a `reading_kind` enqueues one pg-boss `reading` job with singleton key `(photo_id, reading_kind)`; two steps behind `OcrProvider.read(image) → {image, tokens[{id, text, bbox}], preprocessing_applied}` and the LLM structuring step (Claude on Amazon Bedrock via `@anthropic-ai/bedrock-sdk`, model `anthropic.claude-opus-5`, `anthropic.claude-sonnet-5` as cost fallback; `@anthropic-ai/sdk` with a Console key as the same-interface fallback for the POC) with structured output, citing `ocr_token_ids` per value, never emitting coordinates; `OcrProvider` implementations `fake`, `textract` (slice: nameplates) and `ocr-svc` (FR-36); providers selected by `LLM_PROVIDER` and `OCR_PROVIDER`; `fake` replays fixtures from `apps/api/src/jobs/reading/fixtures`; the job deletes its previous pending suggestions before emitting new ones; `reading_run` row per run; three attempts with backoff then `failed`; `reread` creates a new run; cost envelope logged in USD.
- AR-14 **One renderer over a frozen snapshot (AD-15).** `RelatorioSnapshot` zod schema; `toSnapshot()` in `apps/web/src/db` and `apps/api/src/sync` byte-equal; generate barrier and flush; `generation_job` with `kind issue|preview`; DOCX from a layout spec via the `docx` library; LibreOffice headless conversion with per-job `-env:UserInstallation`, concurrency 1 per instance; two-pass static TOC; revision op emitted in the transaction that stores both files; `editedSince(snapshot_seq)` family set; preview as a `file` row of kind preview referenced by `relatorio/preview_file_id`; brand images as header/behind-text anchored images; FR-1 preview is a CSS approximation.
- AR-15 **Capture order ≠ print order (AD-16).** Tree `order_key` per relatório; the renderer never reorders the tree; `scheme` stored per relatório and captured in the snapshot.
- AR-16 **Time, coordinates and numbering (AD-17)** as in FR-45, FR-47, FR-48; Geolocation API at capture with a 5 s timeout when the switch is on; coords never rewritten by the server.
- AR-17 **Sheet state precedence and attribution (AD-18).** `block/{b}/not_tested = {reason, text?, at, by} | null`; `block/{b}/concluded_by = {actor_id, at} | null`; precedence Não ensaiada › Concluída (kept through edits, integrity flags "concluída com pendências") › Em preenchimento › Vazia; values in disabled sub-blocks retained but ignored by progress, pre-issue, conclusion text, integrity, sync counts and renderer.
- AR-18 **Registry references (AD-19).** Clients and Instruments by id (instrument header copied at selection with `instrument_id`, `code`, `manufacturer`, `model`, `serial`, `cert_number`, `calibrated_at`, `valid_until`, `test_parameter`); Manufacturer, Voltage class, Atividade and Local by value with `{name, gender, number}` registry metadata; `calibrationCheck` with 30-day "expiring" window after the service period end.
- AR-19 **Soft delete with tombstones (AD-20)** for blocks, locations, equipment, files, points; purge deferred server policy.
- AR-20 **Versioned seed data and `BlockConfig` (AD-21).** `BlockConfig = {block_type, subtype?, role?: entrada|saida|alimentacao, sub_blocks: Record<key, {enabled, options?}>, na_defaults: ItemKey[]}`; Template block = `BlockConfig + {quantity, skeleton_location_ref}`; Block row stores one `BlockConfig` and a `seed_version`; definitions resolve through `getDefinition(seed_version, report_type, block_type)`; `packages/domain/seed` append-only by version; the seed's source of truth is the decoded FO.SERV-03 (`addendum.md` §9 and `.working/extract-raw-sources.md`), including field lists with kinds and units, five checklist lists, four table grammars, criteria (`> 400 MΩ`, `< 250 µΩ`, `± 0,5 %` with source "aceitável na ficha"), the `not_tested_reason` list with justification text, section boilerplate keyed by `(section, effective_from)` (sections 1, 2, 3, 4, 5, 6, 10 with section 2's seven definitions, section 4's five requirement blocks, section 5's six-step 10.5.1 sequence and nine-item re-energization checklist, section 6's eight-type catalogue, section 10's three fixed bullets), the seeded Template "Cabine primária — padrão" with its location skeleton (Cubículo Enel, 1° Subsolo colunas 1–17, Oxigênio, Cobertura A, Cobertura B, Geradores; *Agrupar por tipo* on for 1° Subsolo and Geradores, off for the rest), per-item NC chip phrases, Atividade and Local chip seed lists, and the subtype option lists. **This is a day of careful transcription that nothing else can start without.**
- AR-21 **Status table (AD-22)** in `packages/domain/status`; every transition a client op on `relatorio/status`; the server never writes it.
- AR-22 **UI system (AD-23).** `tokens.css` and `components.css` copied into `apps/web/src/styles`; React Aria Components unstyled with render-prop `className` mapping onto `.is-*` and `[data-state]`, one mapping helper per component; `aria-disabled` plus `aria-describedby` reason; one shared input layer in `src/input`; Inter self-hosted and precached; no Tailwind, no themed component kit; one folder per EXPERIENCE.md surface in `src/surfaces`.
- AR-23 **Sync order, rebase and rejection (AD-24).** Cycle push ops → upload files → pull company → pull each relatório; `POST /api/sync/ops` answers `{applied, rejected, superseded}` with per-op atomicity; the server rejects only for shape, server-only family or tenant, never for a domain rule (integrity reports those); dead ops excluded from materialized state, kept for "Reenviar", listed by pre-issue; retry table (network and 5xx with backoff and jitter; 4xx never except 401 and `409 file_row_missing`); relatório stream = ops with `relatorio_id` ∪ project-scope ops, ordered by `seq`; rebase re-applies pending outbox ops on top of pulled values; `last_push_at` per `(user_id, device_id)` in the pull summary; `syncCounts(snapshot, outbox)` feeds Sync status and Sumário counts.
- AR-24 **Equipment as project scope and `last_nameplate` projection (AD-25)** as in FR-7 and FR-34.
- AR-25 **Section 8 contract (AD-26)** as in FR-48, FR-49, FR-51.
- AR-26 **Containers and AWS (AD-27)** as in NFR-18; every external call goes through an adapter (`src/storage`, `OcrProvider`, the LLM client) so switching a service changes `infra/` only.
- AR-27 **Device-local never-synced state** (last sheet on this device, theme override, dismissed banners, registry tab, gallery filter) in a `local_prefs` table; banner priority conflict › re-auth › draft found › suggestions ready › relatório exported › offline › unsynced > 5 days, with `426` as a full-screen state; the banner slot and Sync badge rendered once in `apps/web/src/state` from kernel results.
- AR-28 **Instrumentation.** Jobs record duration; `reading_run` records usage and USD; SM-8 (time per sheet) instrumented from v1 via the sheet attribution timestamps; SM-C1 (confirmed values later edited) computed server-side over the ops table.
- AR-29 **Deferred by architecture (not in the MVP build):** multi-device merge policy content and the Conflict view; row-level security; purge and retention; storage-low threshold tuning; photo re-encode tuning; export time tolerance; dictation engine; geolocation-to-altitude; LGPD consent gate as one check in the reading job; "Salvar como template" carry list; rich text editor; cost fallback model; OCR sidecar; TypeScript 7; LibreOffice 26.8 by 2026-11-30.

### UX Design Requirements

**Implementation reference (decided by Matheus, 2026-09-21).** When a story builds or changes a screen, the developer's reference is what the UX stage produced, above all the mockups: the navigable prototype `mockups/prototype/` (screens `10-login` · `20-home` · `30-project` · `40-relatorio-overview` · `41-templates` · `42-template-composer` · `45-secao` · `50-relatorio-setup` · `60-ficha` · `70-fotos` · `71-legenda` · `72-pontos` · `73-exportar` · `80-cadastros` · `85-sync` · `86-sync-conflito` · `90-account`, v0.8), the key-screen files `mockups/key-*.html` with their alternate-state frames, `mockups/tokens.css` and `mockups/components.css` (the styling layer per AD-23), and `mockups/MOCK-GUIDE.md` for the frame and class conventions. `DESIGN.md` and `EXPERIENCE.md` govern behavior and win over a mock on conflict; the mock is the rendering to match. Every UI story below must cite the mockup file(s) it implements.

- UX-DR0: Every UI story names its mockup screen(s) under `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/` and its acceptance includes a visual match against those frames (light and dark, tablet 768 primary, phone 390, desktop 1280 where the mock has the frame) using the mock's class names from `components.css`, not a re-styled equivalent.

**Design tokens and theming (DESIGN.md)**

- UX-DR1: Implement the light and dark color token sets exactly as DESIGN.md frontmatter (surface-base/raised/sunken, ink-primary/secondary, border-strong/hairline, primary, focus and focus-fill, conforme/nao-conforme/nao-aplica with fills, aprovado/reprovado, fora-do-limite with fill, nao-ensaiado with fill, five sync states, toast-action, scrim) with every light token having a `-dark` pair; theme follows `prefers-color-scheme` with a manual override Sistema · Claro · Escuro in Account persisted per device; the theme attribute is set on the root element.
- UX-DR2: Implement the typography ramp (Inter self-hosted with Roboto/Segoe UI/system-ui fallback; display 28/600, title 22/600, heading 18/600, body 16/400, field-input 18/400, value 20/600 with `tabular-nums`, label 14/500, meta 14/400; nothing below 14 px; sentence-case labels that wrap, never ALL-CAPS that truncate; units in a separate slot beside the number).
- UX-DR3: Implement the spacing scale (4/8/12/16/24/32/48), `touch-min` 48 px, `touch-field` 56 px, gutters 16/24/32, `content-max` 880 px, breakpoints 768/1280, `rail-width` 320 px, thumbs 64/96 px, radii 4/8/12/full; depth by borders not shadows (shadow only on dialogs and the Photo capture sheet over the scrim).
- UX-DR4: Every tappable element has a hit area ≥ 48×48 px regardless of glyph size (drag handles, overflow triggers, chevrons, Sync badge, unit control, chips, text buttons, toast actions, crop thumbnails); field controls ≥ 56 px; decorative marks carry no hit area.
- UX-DR5: Focus treatment: inputs change their whole background to `focus-fill` with a 3 px `focus` border; non-inputs take a 3 px ring with 2 px offset around the full hit area; the focused element is never hidden under the Sticky action bar or keyboard.
- UX-DR6: No emoji anywhere; icons come from one SVG sprite; PRODUTO wordmark as plain text; no product logo; no client or partner branding in the app chrome.

**Shell and feedback components (six groups, same names and order as DESIGN.md/EXPERIENCE.md)**

- UX-DR7: App bar (56 px; back or wordmark; surface title; Sync badge; avatar initial; inside a sheet the title is the TAG).
- UX-DR8: Sync badge (pill with dot plus word for ok/pending/offline/error/conflict; compact variant on the Relatório card; announces transitions only; tap opens Sync status).
- UX-DR9: Status pill (Rascunho ink-secondary · Em campo primary · Em revisão fora-do-limite · Emitido conforme).
- UX-DR10: Toast (bottom-center, inverted surface, one line plus optional action in `toast-action`; one at a time, 6 s, persistent when it carries an action; undo toasts ≥ 20 s or until next navigation; `role="status"`).
- UX-DR11: Banner (one slot per surface with the fixed priority and a "+2" chip; warning, conflict and info variants; `role="alert"` for conflict; dismissible per session).
- UX-DR12: Conflict view (post-slice; only contradicting cells, two option rows each with crop, "Aplicar"; structure variant with Manter · Remover / Renomear uma · Manter as duas).
- UX-DR13: Sync status row and surface (headline state plus counts, rows for uploads, downloads, per-user last send, errors, merges, contradictions; progress line; "Como funciona" link; not `aria-live`). Slice: badge and counts only.

**Actions and inputs**

- UX-DR14: Button primary/secondary/destructive (48 px, `heading` weight; destructive is outline red, never a red fill; disabled at 40% opacity with the reason text beside it linked by `aria-describedby`, stays focusable, never a tooltip).
- UX-DR15: Text button (label-only, 12 px padding, ≥ 48 px hit area; never the only path to a destructive action).
- UX-DR16: Sticky action bar (Section stepper row above a button row; Camera capture button left, primary "Próxima ficha"/"Concluir ficha"/"Próxima coluna", secondary bulk action while the checklist is in view; sits above the keyboard; unsticks below 480 px viewport height; docks to the content column on desktop).
- UX-DR17: Camera capture button (56 px primary square, `capture` attribute, burst count badge until "Concluir fotos"; "Adicionar fotos" as a secondary outline button beside it; drop-target outline "Solte para adicionar" on a computer; tile variant "Fotografar placa"/"Fotografar equipamento" ≥ 96 px dashed with copy chips above and "Digitar" beneath; permission-denied reason and OS path beneath).
- UX-DR18: Dictation button (48 px round outline mic; "Ouvindo…" word while listening; hidden, not disabled, when no engine; post-slice engine).
- UX-DR19: Combobox (56 px; type to filter; "Criar “⟨texto⟩”" as the last option creating a registry entry inline offline; on field surfaces reached from a chip row's "Outro…", full-screen on phone; arrows and Enter).
- UX-DR20: Toggle (52×32 track; state word beside it; `role="switch"`; row label toggles; "Sempre" for locked sub-blocks).
- UX-DR21: Checkbox (28 px box in a 56 px row; instruments used at setup; unchecking a referenced instrument shows a note and keeps it in section 11).
- UX-DR22: Segmented control (neutral radiogroup: Tema; Conselho CREA · CRT relabeling the two number fields and printed title, prefilled from the profile, never clearing a typed number).
- UX-DR23: Tabs (Registries: Empresa · Clientes · Instrumentos · Fabricantes · Classes de tensão · Critérios de aceitação; wraps on narrow widths, never scrolls sideways; Instrumentos is the default tab; selected tab remembered per session; deep links from "Criar" and Account).
- UX-DR24: Chip (≥ 48 px outline pill; wrapping row with 8 px gaps, never scrolling sideways; text chips insert at the caret without duplicating; value chips take the pressed look, row of the 5 most recent values plus "Outro…"; per-item NC chips; Not-tested reason chips; "Copiar da cabine anterior").
- UX-DR25: Filter chip (`aria-pressed`, exactly one selected, "Todas" first, re-tap does nothing; gallery by cabine; Home Status board tiles share the rule).

**Relatório structure**

- UX-DR26: Relatório card (`is-current` variant with primary border, first in the list, "Continuar: ⟨TAG⟩ · n de N" plus "Ver sumário"; four lines: client · site, dates · template, Status pill + progress + compact Sync badge, device availability; grayed "Não está neste aparelho" when offline and not downloaded).
- UX-DR27: Relatório row (Project list; six desktop columns under a decorative header, stacks to the card layout on tablet portrait and phone; newest first; no sorting).
- UX-DR28: Block card (drag handle 48 px with `aria-label` "Reordenar ⟨TAG⟩", Position box beside it, name, sub-block count, TAG in `value`, Not-tested chip, Overflow "Adicionar abaixo · Subir · Descer · Duplicar · Remover" plus "Mover para…" and "Marcar não ensaiado" on equipment blocks; press-and-hold 300 ms drag; Alt+↑/↓; every move announced).
- UX-DR29: Block palette (right drawer on tablet/desktop, bottom sheet on phone; field variant with "Fotografar equipamento" tile then 8 rows with suggested TAG; office variant with "Seções" and "Equipamentos" groups, Quantity stepper per column in the Template composer, sub-block toggles when opened inside a sheet).
- UX-DR30: Quantity stepper (48 px −/+ with typeable count in `value`, "—" at zero, press-and-hold repeats, announces "Seccionadoras, 25").
- UX-DR31: Relatório tree in two presentations: Sumário (64 px rows per FO.SERV-03 part with the number as the Position box, title, status meta line with the blocking status in red, Overflow, fixed cover and document control rows with meta notes, section 9 expanding into the unnumbered location tree with the one-line note, footer "Pré-visualizar" and "Gerar relatório", expansion by status) and Rail (location tree only, `aria-current` on the current sheet); both with 24 px indent, 56 px rows, chevron with 48×56 px hit area, Left/Right expand and collapse, cabine rows with read-only meta "SE · 13,8 kV · 19 °C · 67 %" and Overflow ("Abrir primeira ficha", "Agrupar por tipo"), equipment state glyph plus word (✓ Concluída, ● Em preenchimento, ○ Vazia, ⊘ Não ensaiada; glyphs `aria-hidden`); back from a sheet lands on its row.
- UX-DR32: Overflow menu (⋯ trigger 48 px with `aria-label`; one level; arrows, Esc returns focus; destructive item last in red).

**Sheet**

- UX-DR33: Sheet header (type + TAG as a 48 px text button to rename, location line, attribution line, Progress counter; no hint sentences on the sheet).
- UX-DR34: Progress counter (amber "n obrigatórios faltando" / green "Completa"; unconfirmed suggestions count as empty; never blocks navigation; "Completa" announced once).
- UX-DR35: Section stepper (four buttons Placa · Verif. · Ensaios · Conclusão with missing counts, current marked; tapping scrolls and expands; completed sections collapse to their title once left; not a wizard).
- UX-DR36: Bulk action bar (two text buttons with reasons when disabled; mirrored in the Sticky action bar).
- UX-DR37: Tri-state control (three 56 px segments C · NC · NA as a radiogroup with full-word names, letters in `heading` weight, inner ring on selection, arrow keys, Delete clears, re-tap never un-marks; long labels as helper text under the row on phone).
- UX-DR38: Checklist row (56 px; number + wrapping item text; control right-aligned, drops below on phone; Overflow with observation and "Limpar"; NC expansion with chips, Dictation button, required Observation with reason line, "Adicionar foto" and "Criar ponto de atenção" inline; legend once per session then "?").
- UX-DR39: Measurement field (56 px, `value` right-aligned, unit suffix slot as a tap-cycle toggle ≥ 48×56 px with a divider, M · G · T chip row above the keypad on phone, parsed echo line "= 3.700 MΩ", Suggestion rendering with 48 px crop then 24 px glyph, out-of-limit amber fill and helper with "Marcar Com restrições", outlier helper on a neutral field, "—" placeholder; `inputmode="decimal"`; announces value, unit and limit state).
- UX-DR40: Measurement table (real table with header cells at every width; nothing clipped, horizontal scroll as a last resort; caption with criterion value and a chevron revealing its source; action row with Read display and Dictation buttons; calculated cells read-only in ink-secondary with a "calc." mark announcing "calculado"; 200 px value cells at tablet/desktop; TTR wide variant with fixed column widths; one- and two-column tables stay tables on phone, only TTR stacks into cards with row + column accessible names; tests stack, never side by side; one continuous Enter run per sheet).
- UX-DR41: Read display button ("Ler visor", burst count, per-cell "Foto guardada — leitura quando houver sinal" with photo glyph; post-slice).
- UX-DR42: Instrument picker (Combobox showing code + short name, chevron revealing manufacturer · type · serial · RBC · validade; amber "Calibração vencida em dd/mm/aaaa" always visible; remembers last used per test type within the relatório; empty state "Nenhum instrumento cadastrado" + "Cadastrar instrumento").
- UX-DR43: Conclusion control (two stacked 56 px radiogroups with fills and inner ring; suggestion line as a full-width tappable amber row that disappears once set; "Limpar" via Delete or sheet Overflow; inline warning "Há itens não conformes" on Sem restrições with NC rows; `aria-invalid` when counted missing).
- UX-DR44: Observation field (96 px multiline; required states with red border and reason line as `aria-describedby`; "Observações rápidas" chips and Dictation button above; vision draft as a Suggestion block with "Usar").
- UX-DR45: Suggestion field (amber fill, "Sugerido" pill, "Verificar" on a dashed border, 48 px crop opening the Photo viewer on the region, "Confirmar" per field, "Confirmar todos" counting and skipping Verificar, "Sugerido: … — Substituir" meta line beside a filled value; nameplate group states empty/pending/ready with the inline plate crop ≤ 160 px and focused-field region outline; "Lendo…" line; announces "Sugerido, ⟨valor⟩, confirmar"; crop alt "Recorte do visor"/"Recorte da placa"; crop thumbnail hit area ≥ 48 px).
- UX-DR46: Generated text field ("Texto da conclusão" and the parecer summary; amber until confirmed; actions "Confirmar", "Editar", "Substituir", Dictation; confirmed state neutral keeping the Criteria line; "Sugerido: texto atualizado — Substituir" after value changes; announced with its text).
- UX-DR47: Criteria line (meta line with "·" separators, numbers in `label` weight tabular, wraps, `aria-describedby` of its field, printed under the Conclusão row).
- UX-DR48: Not-tested chip and band (violet; reason chip row with the last used preselected; band at the top of the sheet with "Desfazer"; fields become Read-only fields with `aria-readonly` while photos and observation stay editable).
- UX-DR49: Read-only field (surface-base, hairline border, no chevron, grayed tri-state, hidden Overflow; used on Não ensaiado sheets and for cabine data on non-first sheets).

**Photos and findings**

- UX-DR50: Photo tile (96 px grid / 64 px inline, number badge, stamp line, caption two lines with ellipsis, upload pill under the tile "Aguardando envio" amber / "Erro — Tentar novamente" red outline as the retry button; provisional then final number; `aria-describedby`).
- UX-DR51: Photo viewer (full-screen dark, fit-to-width, back and number, "Anterior / Próxima" buttons, full stamp, checklist status line, "Editar legenda", "Remover" through Confirm; modal with Esc/back and focus return).
- UX-DR52: Photo stamp (tile meta line "dd/mm hh:mm" plus 16 px pin glyph with "GPS" accessible text; viewer full stamp with coordinates; time only when denied; printed under every section 7 photo).
- UX-DR53: Photo capture sheet (bottom sheet with "Escolher arquivos" and, when the camera is denied, "Tirar foto" with reason; batch step "De qual equipamento?" with the tree plus "Geral", batch caption field with Dictation, "Adicionar N fotos").
- UX-DR54: Caption composer (Atividade · Equipamento · Local rows; preview; "Editar texto"; vision caption as a Suggestion with "Usar"; gallery header "12 legendas sugeridas — Confirmar todas" post-slice).
- UX-DR55: Point of attention card (drag handle, Overflow, title, body, referenced Photo tiles, Ação recomendada; Prioridade, Prazo and Responsável fields, Priority pill and Priority picker are **post-MVP** with FR-50/FR-52 and are not built in the MVP surface).

**Office surfaces**

- UX-DR56: Registry row (56 px; primary and meta text; expired instruments sort first with "Vencida" in amber; certificate file attached from the row and queued like a photo; delete only when unreferenced, else "Arquivar").
- UX-DR57: Data table read-only (Critérios de aceitação: test sub-block type · criterion in `value` · source · used by; no row actions).
- UX-DR58: Export dialog (title; "N avisos — estão nas linhas do sumário" with "Ver no sumário"; blocking row "Parecer não preenchido" in red with "Editar em Dados do relatório"; "Pré-visualizar" secondary with "Gerando rascunho…" opening in a new tab; "Gerar relatório" primary with disabled reason; one meta line stating the section 9 grouping; "Gerando revisão n… pode fechar"; result rows "DOCX — abrir no Word" · "PDF — enviar ao cliente" with download and share; "Revisões" list; Document control summary with "Editar em Dados do relatório"; generation failed inline with "Tentar novamente"; offline message).
- UX-DR59: Confirm dialog (one sentence, action verb on the button, initial focus on "Cancelar", Esc/back cancels; used for block removal, backward status moves, discarding conflict versions, sign out with pending sync, photo removal).
- UX-DR60: Form dialog ("Novo relatório": report type radio with the single option preselected, template Combobox defaulting to the last used in the project, two date fields with end defaulting to start, "Criar relatório" disabled with reason until template and start date exist; ≤ 640 px, full-screen on phone; draft kept on close).
- UX-DR61: Login form (≤ 400 px, PRODUTO in `display`, two 56 px inputs, one primary button; inline `role="alert"` error; offline: "Sem conexão — entre quando houver sinal…" with "Entrar" disabled and the reason "Entrar precisa de conexão"; sign out with pending sync warns).
- UX-DR62: Section band (Relatório setup "Etapa n — ⟨nome⟩" bands with 32 px number badge, optional note, 24 px body padding; `aria-labelledby` fieldsets; autosave per field; "Concluir dados do relatório" only marks setup complete; Responsável band with the Conselho control; last band "Conclusão e parecer").
- UX-DR63: Status board (four tiles with live counts including zero, `aria-pressed` filter of the list below, re-tap clears; 2 columns on phone).
- UX-DR64: Shortcut card (Home 2-up: Templates and Registries with live sub-lines; never a badge).
- UX-DR65: Settings row (Account: name; "Registro profissional" with "Editar" opening a Form dialog with Conselho, number and title defaulted by council; Tema segmented control; "Localização nas fotos" Toggle row with "Permissão negada no aparelho" sub-line, post-slice; "Ver status de sincronização"; storage in use in `value`; "Sair" destructive button with the pending-sync Confirm; **no "Instalar" row** per the web-only decision).
- UX-DR66: Brand preview (Registries › Empresa card "Pré-visualização do documento" with three miniature pages re-rendering on every field change from the current values; logo and cover background upload tiles opening the file picker and queued like a photo; placeholders "Logo"/"Fundo"; `aria-hidden` as a whole; no watermark toggle in the MVP).
- UX-DR67: Document control table (two-column key/value, 200 px key column, stacks on phone, `dl` semantics; rows Documento · Revisão do documento · Data de emissão · Contratante · Contratada · Responsável técnico · ART/TRT · Período do serviço; "—" for missing).
- UX-DR68: Parecer box (segmented triple Apto · Apto com restrições · Não apto with amber suggestion line beneath; Generated text field for the summary; box neutral while empty and toned by the verdict once set; never colored by a suggestion; printed in section 10).
- UX-DR69: Section text surface (Sumário rows 2, 4, 5, 6: plain text with variable chips "Inserir dado do relatório", autosave, "Restaurar texto do template" with undo; rows 1 and 3 open Relatório setup › Etapa 2; rich text editor post-slice and Template composer only).
- UX-DR70: Template composer and Templates list (composition of section and equipment blocks, location skeleton with cabines and columns, per-column Quantity steppers headed by the column, sub-block defaults and subtype selects, palette and composition side by side on desktop; list with duplicate and archive; empty state "Nenhum template. Crie um a partir do relatório padrão FO.SERV-03.").

**State patterns**

- UX-DR71: Implement every State Patterns row applicable to the slice: cold open without session (online and offline), cold open with session offline (toast once per session), relatório not on device, downloading, empty states for Home, Project, Instrument picker, Relatório overview, gallery and Points, draft found, focus, out of limit, required missing, not tested, offline write, photo pending and rejected, working (export, uploads, relatório loading skeleton "Carregando 94 fichas…"), reading in progress, photo queued for reading, reading arrived, reading failed, suggestions pending, several conditions at once, sync error, storage low, calibration expired, relatório exported then edited, camera or file permission denied, dictation unavailable, generation failed, parecer missing, location denied, brand not set, session expired while offline. Post-slice: sync merge and the two conflict states. Removed: "App not installed".

**Interaction primitives, accessibility and responsive**

- UX-DR72: Autosave on every field change with a visually hidden "Salvo" status announced at most every few seconds; no Save button on sheets; Enter down / Tab right on measurement grids; next and previous sheet follow tree order with "Próxima coluna"; undo via persistent toast then "Restaurar ficha removida"; banned patterns (carousels, infinite scroll, auto-verdicts, pre-marked Conforme, unconfirmed AI writes, a modal choice before the camera, modal stacks > 1, color-only state, tooltip-only explanations, clearing by re-tap, repeated explanatory lines).
- UX-DR73: Accessibility floor per NFR-4 including the screen-reader announcements listed in EXPERIENCE.md (Tri-state "Item 8, Contatos, Conforme, 1 de 3"; Measurement field value, unit word and limit state; `<time>` elements; out-of-limit helper once on blur via `role="status"`; Section stepper buttons named step + count; Camera "Tirar foto" and Dictation "Ditar observação" names).
- UX-DR74: Responsive behavior: phone single column with the tree as a surface, TTR tables as cards, palette as a bottom sheet, full-width Sticky action bar; tablet with a persistent 320 px rail (collapsing to a 48 px labeled strip in portrait, "Árvore do relatório" vertical label), palette as a right drawer, tables in full in landscape; desktop as tablet landscape plus keyboard shortcuts, Template composer side by side; office surfaces still usable on tablet and field surfaces with a mouse.
- UX-DR75: Voice and tone: microcopy exactly as the EXPERIENCE.md Do/Don't table (e.g. "Sem conexão. Tudo fica salvo neste aparelho.", "Foto guardada — leitura quando houver sinal", "3 leituras prontas para confirmar", "Calibração do 2E vencida em 28/08/2027. Pode continuar."); placeholders show real examples ("Ex: 13,8 kV"); pt-BR numbers and dd/mm dates; the words relatório, ficha, bloco, cabine, coluna, cubículo used exactly.
- UX-DR76: Key flows as acceptance narratives: Flow 1 (compose the Porto Seguro job), Flow 2 (fill a sheet offline, 19 taps and 0 keystrokes on a fully conforme sheet with copied plate, about 36 keystrokes for typed readings offline), Flow 2b (nameplate by photo), Flow 3 (extra disconnector via the type list in the slice), Flow 4 (photos on a second device via import in the MVP), Flow 5 (generate, preview, fix in the app, regenerate), Flow 6 (storage and calibration warnings in the slice; conflicts post-slice).

### FR Coverage Map

FR-1: Epic 2 - Company profile, document identity and brand preview
FR-2: Epic 2 - Client and site registry
FR-3: Epic 2 - Instrument registry with calibration record and certificate
FR-4: Epic 2 - Manufacturer and voltage-class registries with inline creation
FR-5: Epic 2 - Sourced acceptance criteria, read-only
FR-6: Epic 1 - Named users, sign-in, professional registration, session survives offline
FR-7: Epic 4 - Equipment identity (TAG) suggested, unique per project, kept through renaming
FR-8: Epic 6 (post-slice, storied in Epic 11) - Photo location switch
FR-9: Epic 3 - Template create, duplicate, archive, compose
FR-10: Epic 3 - Location skeleton with quantities per column
FR-11: Epic 3 - Sub-block defaults and subtypes
FR-12: Epic 3 (plain-text boilerplate with variables in the Template composer), Epic 4 (Section text surface inside a relatório) and Epic 11 (rich text editor) - Section boilerplate with variables
FR-13: Epic 3 - Template independence from relatórios
FR-14: Epic 11 - Save a relatório as a Template
FR-15: Epic 4 - Project and relatório hierarchy, "Novo relatório" dialog
FR-16: Epic 4 - Relatório setup page in numbered bands
FR-17: Epic 4 - The Sumário and the location tree with block states
FR-18: Epic 4 - Add a block in the field and in the office
FR-19: Epic 4 - Remove, restore, duplicate and reorder blocks (drag, menu, keyboard, Position box)
FR-20: Epic 11 - Move a block between locations
FR-21: Epic 1 (status table, Home status board) and Epic 4 (transitions on setup and edit) - Relatório status
FR-22: Epic 3 - The eight equipment block types from versioned seed data
FR-23: Epic 5 - Nameplate capture by copy or typing (camera path in Epic 8)
FR-24: Epic 5 - Cabine characteristics and test environment ("Da cabine" block)
FR-25: Epic 5 - Checklist capture with observations and chips
FR-26: Epic 5 - Bulk checklist actions
FR-27: Epic 5 - Measurement capture, parsing, units, criteria, derived cells
FR-28: Epic 5 - Magnitude outlier hint
FR-29: Epic 5 - Sheet conclusion with suggested pair
FR-30: Epic 5 - Device-composed conclusion text with criteria line
FR-31: Epic 5 - Não ensaiado with reason
FR-32: Epic 5 - Sheet attribution and autosave
FR-33: Epic 8 - Nameplate from a photo
FR-34: Epic 5 - Copy a nameplate ("Igual à"; "Copiar da última visita" once Epic 7 emits `last_nameplate`)
FR-35: Epic 8 - Registry cross-check on nameplate values
FR-36: Epic 9 - Instrument display by camera ("Ler visor") with the OCR sidecar
FR-37: Epic 8 - Wrong-digit protection (digit coverage)
FR-38: Epic 9 - Equipment identity from a photo
FR-39: Epic 6 (context captions) and Epic 9 (vision captions) - Photo auto-caption
FR-40: Epic 9 - Dictation
FR-41: Epic 8 - The provenance-and-confirm contract (Suggestion entity)
FR-42: Epic 8 - Offline assist queue
FR-43: Epic 6 - Direct camera capture in bursts, "Adicionar fotos" and import
FR-44: Epic 6 - Photo object and links
FR-45: Epic 6 - Chronological gallery and viewer
FR-46: Epic 6 - Caption composer
FR-47: Epic 6 - Photo stamp
FR-48: Epic 6 (provisional numbers, tokens) and Epic 7 (frozen numbering at generation) - Automatic photo numbering
FR-49: Epic 6 - Point of attention
FR-50: Epic 11 (post-MVP) - Priority suggests the deadline
FR-51: Epic 6 (derived points) and Epic 7 (printed in section 8) - Automatic points for untested equipment
FR-52: Epic 11 (post-MVP) - Printed action-plan table
FR-53: Epic 6 - Quick chips for recurring findings
FR-54: Epic 1 - Offline capture in an ordinary browser tab, durable locally, offline proof
FR-55: Epic 1 - Automatic download to the device and availability states
FR-56: Epic 6 - Zero photo loss, resumable idempotent upload
FR-57: Epic 6 - Storage pressure warning
FR-58: Epic 10 - Merge by sub-block
FR-59: Epic 10 - True conflicts and the Conflict view
FR-60: Epic 1 (badge and counts) and Epic 10 (full surface) - Sync status
FR-61: Epic 1 - Draft recovery
FR-62: Epic 7 (generate DOCX and store PDF) and Epic 11 (PDF download) - Generate a revision
FR-63: Epic 7 - Page furniture and cover
FR-64: Epic 7 - Document control page
FR-65: Epic 7 - Automatic table of contents
FR-66: Epic 7 - Section blocks with resolved variables
FR-67: Epic 7 - Section 7, the photo record
FR-68: Epic 7 - Section 9, native test tables grouped as FO.SERV-03
FR-69: Epic 7 - Section 8 bullets and section 10 parecer, bullets, validity line, signature block
FR-70: Epic 7 - Section 11, certificates
FR-71: Epic 7 - Relatório-level parecer with composed summary
FR-72: Epic 7 - Section 9 scheme as a typed field, not exposed
FR-73: Epic 7 - The pre-issue list on the Sumário rows and in the Export dialog; preview
FR-74: Epic 7 - Revision history
FR-75: Epic 9 - NC observation draft from the row's photo

## Model and effort guide

Every story below carries a line `**Dev model:** ⟨fable|opus|sonnet⟩ · **Effort:** ⟨low|medium|high|max⟩ · ⟨why⟩`. It is the cost and quality recommendation for implementing that story with Claude Code and is read by `bmad-build` through the override in `_bmad/custom/bmad-build.user.toml`:

- The **implementation subagent** (step 3) is launched with the story's model and effort automatically.
- The **planning and review orchestration** (steps 2 and 4) run in the interactive session, whose model only Matheus can change with `/model`. If the session's model is below the story's `Dev model`, `bmad-build` halts and names the model to switch to before continuing; if it is above, it proceeds and only mentions the cheaper option.
- **Review layers** (step 4) run on the story's `Dev model`; the investigation and epic-context subagents run on `sonnet`.
- The subagent definitions are `.claude/agents/bmad-dev-⟨model⟩-⟨effort⟩.md` (seven combinations in use); the override is `_bmad/custom/bmad-build.toml` (committed, applies to everyone on the project).

Rule of thumb used: `fable` for kernel invariants and the renderer, where a wrong decision propagates (op log, sync, instantiation, parsing, suggestions, generation, merge); `opus` for cross-layer features with real design room; `sonnet` for well-specified UI, CRUD, adapters and data transcription. Effort follows the size of the decision space, not the size of the diff.

*2026-09-24, Matheus: fable is no longer used for new work because Opus 5.5 performs better. Every story not yet built that named fable now names opus at the same effort; the stories already built on fable (1.4, 1.5, 4.1) keep their line as the record of the model they ran on.*

| Model | Stories |
| --- | --- |
| fable | 1.4, 1.5, 4.1, ~~4.8, 5.5, 5.8, 7.1, 7.5, 8.1, 8.4, 10.1~~ |
| opus (from fable, 2026-09-24) | 4.8, 5.5, 5.8, 7.1, 7.5, 8.1, 8.4, 10.1 |
| opus | 1.3, 1.6, 1.8, 2.2, 3.1, 3.2, 3.4, 4.3, 4.4, 4.5, 5.6, 6.1, 6.2, 6.6, 7.2, 7.3, 7.4, 8.2, 8.3, 8.5, 8.6, 9.1, 9.2, 10.2, 10.3, 11.6, 11.8 |
| sonnet | 1.1, 1.2, 1.7, 2.1, 2.3, 2.4, 2.5, 2.6, 3.3, 3.5, 3.6, 3.7, 4.2, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.7, 5.9, 6.3, 6.4, 6.5, 9.3, 9.4, 9.5, 10.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 11.9, 11.10 |

## Definition of Ready and Definition of Done

Added 2026-09-21 (sprint planning). AGENTS.md requires every story to carry acceptance criteria, a definition of ready and a definition of done written in this file. The acceptance criteria are per story; the two definitions below apply to every story in this document unless a story states an addition under its own heading. They restate the decisions of record in AGENTS.md and the merge gate of `_bmad-output/test-artifacts/test-design/fasor-handoff.md`; when those documents change, this section changes with them.

### Definition of Ready (every story)

A story may enter `bmad-build` only when all of the following hold:

1. Its `**Dev model:** … · **Effort:** …` line is present and names one of the seven `.claude/agents/bmad-dev-*.md` combinations.
2. Its acceptance criteria are written as Given/When/Then and each criterion cites the FR, AR, NFR or UX-DR it satisfies.
3. Every earlier story it builds on is merged to `main` (stories inside an epic are ordered; Epic 3's seed stories may run in parallel with Epic 1 from day one, per the Epic 3 decision).
4. For a story with a user interface: the mockup file(s) under `mockups/` it must match are named in the story or its epic preamble, and the mockup exists.
5. `source-deltas.md` has been checked for rows that override any sentence the story relies on; the story text does not contradict a row.
6. For a story reading seed content: the corresponding part of `addendum.md` §9 (or the decoded FO.SERV-03 extraction) is available on the developer's machine.
7. The story depends on no cloud account or paid API key (Epic 11 stories excepted, after the MVP).

### Definition of Done (every story)

A story is done when all of the following hold and the pull request is merged:

1. Every acceptance criterion is exercised by an automated test: kernel and api behavior by Vitest, and any feature with a front end by a Playwright test that walks the whole feature as a human would, not a sample. The one exception is a criterion that needs a physical device (the iPad and Android checks of Stories 1.7 and 1.8, repeated at the close of Epics 5, 6 and 8 per TC-12): it is run by hand and its evidence (date, device, OS version, outcome) is recorded in `_bmad-output/test-artifacts/manual/` and linked from the PR.
2. Every new API route is exercised by a cross-tenant test: a request from company A can never read or write company B's data. (2026-09-22, Epic 1 retrospective A10.)
3. `pnpm verify` is green (lint, unit, api, Playwright `@p0`, under 15 minutes) with every P0 test passing, its output is pasted in the PR, and any deviation from the playwright-utils conventions is listed in the PR (handoff, Implementation gate). The epic-level gate (P1 coverage at or above 95 %, manual evidence where required) is checked by the epic retrospective, not by each story.
4. The whole stack still starts with `docker compose up`; nothing was installed or run natively.
5. Ownership rules hold: statuses, counts, texts, orders and verdicts are computed in `packages/domain` only; `apps/web` renders from IndexedDB and writes only ops; `apps/api` applies ops and renders documents; `applyOp` is the only reducer.
6. UI stories match their mockup frames in light and dark at the breakpoints the mock has, use the mock's class names, and take strings from the pt-BR copy module; no emoji, no Fasor branding, product name from the `PRODUTO` constant.
7. Code, comments, commit messages and new documents are English, with the domain words and pt-BR UI copy as the only exceptions; routes and identifiers say `relatorio`, never `laudo`.
8. No client material from `docs/context/`, `docs/media/` or third-party names from `docs/concorrentes/` entered a tracked file, except inside the Porto Seguro fixture and its golden documents (waiver of 2026-09-21).
9. One branch and one PR for the story, self-approved and merged by the author; `sprint-status.yaml` moves the story to `done`.
10. Anything left incomplete or risky is written in the PR and, if it changes scope, raised through `bmad-correct-course` rather than absorbed silently.

## Epic List

### Epic 1: Sign in and work on the device (offline-first foundation)
A company user signs in once, opens PRODUTO on any device, and every relatório in progress is already on the device and keeps working with no signal; whatever is captured lands locally first and reaches the server by itself. This epic stands up the monorepo, docker-compose, the pure kernel with the operation log, the Dexie store, the sync engine, the app shell with Home and Account, and the local HTTPS access for tablets, and runs the offline proof (PRD Q0) before anything is built on top. The whole MVP runs in Docker on a local machine; AWS is a post-MVP story in Epic 11.
**FRs covered:** FR-6, FR-21 (status table and Home status board), FR-54, FR-55, FR-61
**Also covers:** NFR-1, NFR-2, NFR-9, NFR-13, NFR-17, NFR-18; AR-1 to AR-4, AR-7, AR-8, AR-9, AR-12, AR-21, AR-22, AR-23, AR-26 (local docker-compose part only), AR-27
**Decisions (party review 2026-09-21):** stories stay small (about half a day each); **the whole MVP runs 100% locally in Docker; AWS comes only after the MVP (Matheus, 2026-09-21)**, so this epic exposes the docker-compose stack to tablets on the local network over HTTPS (a reverse proxy container with a locally trusted certificate) and the offline proof runs on a real iPad against that origin; the offline proof is a story with acceptance criteria (tab closed mid-sheet, network dropped mid-upload, quota exhausted, iPad in hand), not a spike.

### Epic 2: Registries and company identity
An office user sets, once, everything reused across relatórios: the company's document identity with a live brand preview, clients, instruments with their calibration record and certificate, manufacturers and voltage classes (creatable inline, offline), the read-only sourced acceptance criteria, and their own professional registration.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5
**Also covers:** AR-6 (brand and certificate files), AR-18; UX-DR23, UX-DR56, UX-DR57, UX-DR65, UX-DR66

### Epic 3: Seed data and Templates
An office user opens the seeded "Cabine primária — padrão" template that reproduces FO.SERV-03, duplicates it, builds the location skeleton with quantities per column, sets sub-block defaults and subtypes, and edits section text in a relatório. The versioned seed (eight block types, five checklists, four table grammars, criteria, boilerplate, chip phrases) is the first story and the hidden cost of the whole product.
**FRs covered:** FR-9, FR-10, FR-11, FR-13, FR-22, FR-12 (plain-text boilerplate in the composer; the per-relatório Section text surface is Epic 4; rich text editor post-slice), FR-14 (post-slice)
**Also covers:** AR-5 (Template rows), AR-20; UX-DR29, UX-DR30, UX-DR69, UX-DR70
**Decisions (party review 2026-09-21):** the seed data story is pure data with kernel tests and no UI dependency; it is parallelizable from day 1 alongside Epic 1 and must not wait for Epic 2.

### Epic 4: Projects, relatório setup, the Sumário and the tree
A user creates the Porto Seguro project and a relatório from the template: all 94 equipment blocks are born in their columns with suggested TAGs; the setup page records cover data, responsável, instruments and altitude; the Sumário shows the document in FO.SERV-03 order with what is missing per row; section 9 opens into the location tree; blocks are added in the field, removed, restored, duplicated and reordered four ways.
**FRs covered:** FR-7, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20 (post-slice); FR-12 (Section text surface inside a relatório); FR-62 to FR-66 as a thin skeleton (see below)
**Also covers:** AR-5, AR-14 (job, snapshot, LibreOffice, two-pass TOC), AR-15, AR-17 (sheet state), AR-19 (tombstones), AR-24, AR-26 (full api image); UX-DR26 to UX-DR28, UX-DR31, UX-DR32, UX-DR60, UX-DR62, UX-DR63, UX-DR64
**Decisions (party review 2026-09-21):** this epic closes with a thin "DOCX skeleton" story: the one generate job of AD-15 renders cover, document control page, automatic table of contents and the section-text blocks with no equipment sheets, converts its own DOCX to PDF with LibreOffice in the api image, and the full api image (LibreOffice, fonts, sharp) lands here in docker-compose. It proves LibreOffice in the container and the two-pass TOC while changing AD-15 still costs a day; Epic 7 then only adds sections 7 to 11 to the same renderer.

### Epic 5: Fill the equipment sheet offline
A field engineer fills a sheet with taps: cabine data once per cabine, nameplate by copy or typing, checklist with bulk actions and per-item chips, measurements typed in one continuous run against sourced criteria with pt-BR parsing and outlier hints, a suggested conclusion with device-composed text and its criteria line, Não ensaiado with a reason, attribution and autosave. Nineteen taps and zero keystrokes on a fully conforme sheet with a copied plate.
**FRs covered:** FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-31, FR-32, FR-34
**Also covers:** AR-10, AR-17, AR-18; UX-DR33 to UX-DR40, UX-DR42 to UX-DR49
**Decisions (party review 2026-09-21):** the Suggestion field and Generated text field components (UX-DR45, UX-DR46) are built here for the derived conclusion pair and conclusion text, citing `mockups/key-sheet-states.html` as a whole; Epic 8 wires the Suggestion entity and the reading pipeline into the existing component, it does not create it.

### Epic 6: Photos and points of attention
A user shoots bursts from any surface with no composer, imports photos during or after the visit with one "De qual equipamento?" tap, and every photo carries a context caption, a date, time and coordinate stamp, a place in the chronological gallery and a provisional number; no photo is ever lost and storage pressure is warned before capture is refused. Findings are recorded from an NC row or the points surface with photo tokens and chips; untested equipment lists itself.
**FRs covered:** FR-43, FR-44, FR-45, FR-46, FR-47, FR-48, FR-49, FR-51, FR-53, FR-56, FR-57, FR-8 (post-slice)
**Also covers:** AR-6, AR-16, AR-25; UX-DR17, UX-DR50 to UX-DR55

### Epic 7: Generate the FO.SERV-03 relatório
An office user sets the parecer, sees every outstanding condition on the Sumário rows and in the Export dialog (one blocking row), previews the document with a RASCUNHO watermark, and generates a numbered revision as DOCX and PDF from application data: cover, document control page, table of contents, section blocks with variables, the photo record, the points of attention, native test tables grouped as FO.SERV-03, parecer and signature block, certificates. The loop closes: this is the test the slice must pass on 2026-10-03.
**FRs covered:** FR-62, FR-63, FR-64, FR-65, FR-66, FR-67, FR-68, FR-69, FR-70, FR-71, FR-72, FR-73, FR-74
**Also covers:** AR-14, AR-15, AR-24 (`last_nameplate` projection at issue), AR-28; UX-DR58, UX-DR67, UX-DR68; NFR-6, NFR-7
**Decisions (party review 2026-09-21):** extends the renderer born in Epic 4's skeleton story; the original epic order 1 to 8 stands (no swap of Epics 6 and 7); Epics 9 to 11 keep the post-slice mark because the PRD cut order still applies if the estimate proves wrong.

### Epic 8: Nameplate from a photo (the reading pipeline)
A field engineer photographs a nameplate, the photo is kept and queued offline, the backend reads it through a real OCR layer and Claude, and every field comes back as an amber Suggestion with its crop, grounded by digit coverage and cross-checked against the registries; "Confirmar todos" takes the grounded fields in one tap and nothing unconfirmed is ever written, counted or printed. Builds the provenance-and-confirm contract and the queue once, so every later assist is an addition.
**FRs covered:** FR-33, FR-35, FR-37, FR-41, FR-42
**Also covers:** AR-11, AR-13 (`fake` providers and the local OCR); NFR-11, NFR-12; UX-DR41 (queued-cell line), UX-DR45
**Decisions (Matheus, 2026-09-21):** the MVP is tested entirely off-cloud. This epic builds the whole pipeline (queue, job, `OcrProvider` and LLM interfaces, digit coverage, cross-check, Suggestion ops, the UI) against `LLM_PROVIDER=fake` replaying fixtures and an OCR that runs locally in Docker (the `services/ocr` PaddleOCR sidecar, pulled forward from Epic 9 as the local `OcrProvider`, or `fake`); the real Claude call (Console key, later Bedrock) and Amazon Textract are stories of Epic 11. No personal Claude subscription is ever used by the backend (AD-14).

### Epic 9: More assists: display reading, equipment identity, vision captions, dictation, NC drafts (post-slice)
The engineer reads instrument displays by camera (with the Python OCR sidecar) so a sheet costs at most 20 taps and 15 keystrokes with signal, creates a block by photographing the panel, gets vision captions for context-less photos, dictates captions, observations and readings, and receives a one-sentence NC observation draft. Ships in the wait order of `delivery-slice.md`.
**FRs covered:** FR-36, FR-38, FR-39 (vision captions), FR-40, FR-75
**Also covers:** AR-13 (`ocr-svc` provider for seven-segment displays); UX-DR18, UX-DR41, UX-DR54 (vision caption batch)
**Note:** the `services/ocr` sidecar container is first stood up in Epic 8 as the local OCR; here it gains the display-reading model path.

### Epic 10: Two devices on one relatório: merge, conflicts and full sync status (post-slice)
Two engineers work the same relatório on two devices: sheets merge by sub-block without asking, only a true contradiction is put to the user as a single-cell choice, duplicate TAGs and removed-versus-edited blocks are resolved in place, and the full Sync status surface lists what was sent, what waits, what failed and what merged.
**FRs covered:** FR-58, FR-59, FR-60 (full surface)
**Also covers:** AR-3 (`prev_op_id` dispatch), AR-23 (`superseded`); UX-DR12, UX-DR13

### Epic 11: Completions after the slice and the dated post-MVP items
The remaining product scope the slice deferred: the PDF download beside the DOCX, moving a block between locations, saving a relatório as a template, the rich text editor in the Template composer, the photo location switch, and, dated for NR-10 10.7.11 before 2027-06-01, the priority-driven deadline and the printed action-plan table on points of attention.
**FRs covered:** FR-8, FR-12 (rich text editor), FR-14, FR-20, FR-62 (PDF download), FR-50 (post-MVP), FR-52 (post-MVP)
**Also covers:** UX-DR55 (priority pill and picker), UX-DR65 (location switch), AR-26 (AWS: ECS Fargate, RDS, S3, Secrets Manager, CloudWatch, Bedrock, Textract via CDK in `infra/`, CI image promotion), AR-29
**Decisions (Matheus, 2026-09-21):** the MVP runs 100% locally in Docker; the AWS deployment, the real Claude structuring call (`LLM_PROVIDER=anthropic` with a Console key, then `bedrock`) and Amazon Textract as an `OcrProvider` are stories of this epic, after the MVP, and no earlier epic depends on a cloud account or on paid API credits.

## Epic 1: Sign in and work on the device (offline-first foundation)

A company user signs in once, opens PRODUTO on any device, and every relatório in progress is already on the device and keeps working with no signal; whatever is captured lands locally first and reaches the server by itself. Stories stay small; the whole MVP runs 100% locally in Docker (AWS only after the MVP), so this epic exposes the local stack to tablets over HTTPS and the offline proof runs on a real iPad against that origin. Mockups: `prototype/screens/10-login.html`, `20-home.html`, `90-account.html`, `85-sync.html` (badge and counts only), `key-login.html`, `key-home.html`, `key-account.html`.

### Story 1.1: Run the whole stack with one command

**Dev model:** sonnet · **Effort:** medium · scaffolding and config; well-specified, low ambiguity

As a developer on the fasor team,
I want the monorepo, the local containers and the quality tooling in place,
So that every environment is identical and the first feature story starts on the architecture's shape, not around it.

**Acceptance Criteria:**

**Given** a clean checkout with Docker and pnpm 12 installed
**When** the developer runs `docker compose up`
**Then** the web dev server (Vite 8), the api (Hono 4 on Node 24), PostgreSQL 18 and MinIO start, the api serves `GET /api/health` with ~~`{ok: true}`~~ `{status, db, queue, storage, libreoffice}` (2026-09-21, test design TC-6), and the web app is reachable through the Vite proxy on the same origin paths (AR-8, AR-26)
**And** no service is expected to run natively on the developer machine (NFR-18; enables FR-54)

**Given** the workspace `packages/domain`, `apps/web`, `apps/api` (plus empty `services/ocr` and `infra/` folders with a README each)
**When** `pnpm lint` and `pnpm test` run
**Then** `eslint no-restricted-imports` fails any import of `apps/*` from `packages/domain` and any import of `apps/api` from `apps/web` (AR-12), a lint rule fails any `fetch` outside `apps/web/src/sync`, `src/files` and `src/api` (AR-1), and Vitest 5 and Playwright 1.63 run an example test each ~~in CI~~ through `pnpm verify` (2026-09-21: no CI in the MVP; `pnpm verify` run locally is the merge gate, AGENTS.md)

**Given** the api boots
**When** an environment variable required by the zod config schema is missing or malformed
**Then** the process exits with the variable named, and configuration enters only through environment variables (NFR-18)

**Given** the repository conventions
**When** code is written
**Then** identifiers follow the naming table (TS camelCase, DB snake_case via Drizzle, files kebab-case, block type keys `cabos_entrada, para_raio, chave_seccionadora, disjuntor_mt, tp, tc, cabos_saida, transformador_forca`) and the user-visible product name comes from one constant reading `PRODUTO` (NFR-15)
**And** the `tokens.css` and `components.css` from the mockups are copied into `apps/web/src/styles` unchanged, Inter is self-hosted, and React Aria Components is the only behavior library (AR-22)

**Given** the quality gate *(added 2026-09-21, system-level test design; see `_bmad-output/test-artifacts/test-design/fasor-handoff.md`)*
**When** the developer runs `pnpm verify`
**Then** it runs lint and the static tests, every Vitest unit and integration test, the api tests except `@slow`, and Playwright `@p0` on the desktop Chrome project in under 15 minutes, and AGENTS.md names it as the condition for merging a story PR with its output pasted in the PR (R-011)
**And** a docker-compose-only script resets one company's ops, files, jobs and revisions between test suites and refuses to run outside docker-compose (TC-9)

### Story 1.2: Build the shared components from the mockups' CSS

**Dev model:** sonnet · **Effort:** high · large but mechanical: components from an existing CSS with React Aria; many files, few decisions

As a developer on the team,
I want the design tokens, typography, hit areas, focus treatment and the shared components (buttons, text button, status pill, overflow menu, confirm dialog, chip rows) built once from the mockups' CSS with React Aria behavior,
So that every surface from Epic 2 on is assembled from the same parts and matches its mockup frame by frame.

**Acceptance Criteria:**

**Given** `tokens.css` and `components.css` in `apps/web/src/styles` (Story 1.1) and DESIGN.md
**When** the shared components are built in `apps/web/src/components` with React Aria Components and one `className` render-prop mapping helper per component onto the `.is-*` and `[data-state]` selectors
**Then** the light and dark token sets resolve with the theme attribute on the root element and every aliased component token re-resolves under `data-theme="dark"` (a test renders the Suggestion amber in both themes and asserts contrast ≥ 4.5:1), the typography ramp is applied by class (`display`, `title`, `heading`, `body`, `field-input`, `value` with `tabular-nums`, `label`, `meta`; nothing below 14 px), units render in a separate slot beside numbers, and no emoji or product logo exists anywhere (UX-DR1, UX-DR2, UX-DR6, AR-22)

**Given** Button (primary, secondary, destructive), Text button, Status pill, Overflow menu, Confirm dialog, Chip and Filter chip, Toggle, Checkbox, Segmented control, Tabs and Combobox shells
**When** they render
**Then** every tappable element has a hit area ≥ 48×48 px regardless of glyph size and field controls ≥ 56 px, disabled controls use `aria-disabled` at 40% opacity with a mandatory adjacent reason linked by `aria-describedby` and stay focusable, destructive is an outline red never a fill, the Overflow menu is one level with arrows and Esc returning focus and the destructive item last, the Confirm dialog states one sentence with the verb on the button and initial focus on "Cancelar", the Status pill inks are Rascunho `ink-secondary` · Em campo `primary` · Em revisão `fora-do-limite` · Emitido `conforme`, and chip rows wrap with 8 px gaps and never scroll sideways (UX-DR3, UX-DR4, UX-DR9, UX-DR14, UX-DR15, UX-DR32, UX-DR59)

**Given** focus and input handling
**When** a control is focused by keyboard or stylus
**Then** inputs take the `focus-fill` background with a 3 px `focus` border, non-inputs a 3 px ring with 2 px offset around the full hit area, the focused element is never hidden under a sticky bar or the keyboard, and one shared input layer in `src/input` sets `touch-action`, pointer-type handling and press-and-hold with no hover-only affordance and no swipe (UX-DR5, NFR-3)

**Given** the accessibility floor
**When** any component is audited
**Then** `lang="pt-BR"` is set, dialogs and overlays are `role="dialog"` with `aria-modal`, labeled and described, focus trapped and returned, Esc and system back close them; live regions announce transitions not counts; state glyphs are `aria-hidden` with the word as the accessible text; `prefers-reduced-motion` disables animations; text enlarges 200% without loss; an axe run on the component gallery reports no WCAG 2.2 AA violation (UX-DR73, NFR-4)

**Given** the mockup reference rule and the microcopy table
**When** a UI story is implemented
**Then** it cites its mockup file(s) under `mockups/`, uses the mock's class names rather than a re-styled equivalent, matches the frames in light and dark at tablet 768, phone 390 and desktop 1280 where the mock has them, and its strings come from a single pt-BR copy module following EXPERIENCE.md's Voice and Tone table with real-example placeholders ("Ex: 13,8 kV") and dd/mm dates (UX-DR0, UX-DR75; NFR-5; enables every UI FR)

### Story 1.3: Sign in and hold a session that survives offline

**Dev model:** opus · **Effort:** medium · auth, tenant scoping and the per-user store touch security and data isolation

As a company user,
I want to sign in with my e-mail and password and stay signed in on my device,
So that I can open PRODUTO in a basement with no signal and keep working under my own name.

**Acceptance Criteria:**

**Given** a `company` and `user` table (Drizzle) with `company_id` on every table and a repository layer whose every function takes `company_id` as a required typed argument (AR-9)
**When** an operator runs `scripts/seed-users.ts` with a company name and a user's e-mail, password, name, council (CREA or CRT), registration number and title
**Then** the user exists and can sign in; there is no signup route and no outbound e-mail (FR-6)

**Given** the Login surface as in `10-login.html` (PRODUTO in `display`, two 56 px inputs, one primary button, no imagery)
**When** the user submits valid credentials online
**Then** better-auth sets an httpOnly `SameSite=Lax; Secure` cookie with a 30-day sliding session at `/api/auth/*`, the Dexie database `releng-{user_id}` is opened, and the app lands on Home
**And** invalid credentials show an inline `role="alert"` error under the field

**Given** the device is offline with no session
**When** the Login surface opens
**Then** it shows "Sem conexão — entre quando houver sinal; os relatórios já baixados neste aparelho continuam disponíveis após o login", "Entrar" is `aria-disabled` with the reason "Entrar precisa de conexão" beside it, and nothing spins (UX-DR61)

**Given** a signed-in user goes offline and reopens the tab days later
**When** the app boots
**Then** the session continues from the cookie and the local database without a new sign-in (FR-6), and a later `401` during any network call raises the re-auth banner while keeping local data intact (AR-8)

**Given** Account as in `90-account.html`
**When** the user opens "Registro profissional" and taps "Editar"
**Then** a Form dialog with the Conselho segmented control (CREA · CRT), the number and the title (defaulted by council, editable) saves to the user's account, and the row reads "CREA ⟨número⟩ · Eng. Eletricista" or the CRT equivalent (UX-DR22, UX-DR65)
**And** "Sair" is a destructive button that signs out without dropping the local database

**Given** two companies seeded
**When** a user of one company calls any API route
**Then** no row of the other company is ever returned (one automated test, NFR-13)

**Given** the seed CLI *(added 2026-09-21, system-level test design; see `_bmad-output/test-artifacts/test-design/fasor-handoff.md`)*
**When** `scripts/seed-users.ts` runs with the test flag
**Then** it provisions two companies with one user each in one call, so the cross-tenant test and the API suites seed themselves without manual steps (TC-9, B-6)

### Story 1.4: Every change is an operation applied locally first

**Dev model:** fable · **Effort:** high · the operation log and applyOp are the architecture's core invariant; every later story depends on getting it right

As a field user,
I want every value I commit to be saved on my device the instant I leave the field,
So that nothing I capture depends on a network that is not there.

**Acceptance Criteria:**

**Given** `packages/domain/ops` with the `Op` zod schema `{op_id uuidv7, kind create|put|remove, scope company|project|relatorio, company_id, project_id?, relatorio_id?, path, value, prev_op_id?, batch_id?, meta?, actor_id, device_id, client_ts, seq?}` and `OpPath` as a zod discriminated union of the client and server-only families (AR-3)
**When** `parsePath` receives a path
**Then** it returns the family and typed segments for every family in AD-3, rejects an unknown family, rejects a `{field}` that is not a key of the target entity's schema, and `formatPath(parsePath(p)) === p` for every fixture

**Given** `applyOp(state, op)` in `packages/domain/ops/apply.ts`
**When** a `create`, `put` or `remove` op is applied
**Then** a second `create` on the same id is a no-op, `remove` sets `removed_at`, a `put` of `removed_at = null` restores, and derived columns (`first_edited_at`, `last_modified_by`, `last_modified_at`, `source_suggestion_id` from `meta`) are materialized by `applyOp` only (AR-3, AR-17)

**Given** the Dexie 4 store `releng-{user_id}` with tables `entities`, `outbox`, `drafts`, `files`, `sync_state`, `local_prefs`, versioned append-only with a mandatory `upgrade()`
**When** a screen commits a field (on blur, Enter, or 500 ms idle, whichever first; tri-state, chips, pickers and cells immediately)
**Then** one op is written to `outbox` and applied through `applyOp` in the same transaction before anything else, every screen reads only through `useLiveQuery`, and no component awaits an HTTP call to render or persist (FR-32, FR-54, AR-1)
**And** consecutive `put` ops on one path from the same device coalesce only when neither carries `meta` or `batch_id`, keeping the last `op_id`, `value`, `client_ts` and the first `prev_op_id`

**Given** a bulk action of N changes
**When** it is committed
**Then** N ops share one `batch_id` and undo is N inverse ops in a new batch; no wildcard paths exist

**Given** the same op log
**When** it is replayed in `seq` order through the Dexie layer and through a Drizzle materializer against Postgres
**Then** the two `toSnapshot()` results are byte-equal (the AD-3 replay test), and an "outbox survives upgrade" test passes across two Dexie versions

**Given** determinism for tests *(added 2026-09-21, system-level test design; see `_bmad-output/test-artifacts/test-design/fasor-handoff.md`)*
**When** a kernel function reads the current time (`calibrationCheck`, the 5-day unsynced check, `deadlineFromPriority`, `captured_at` fallback) or mints an id
**Then** it takes `now: Date` as an explicit argument, or calls one injectable `newId()`, and `apps/web` and `apps/api` each pass them from one clock and id module; a kernel test calls every time-reading function with two fixed dates and gets the expected different results (TC-1, TC-2, R-014)
**And** the replay byte-equality test runs on the Porto Seguro fixture (Story 3.7) with fixed ids and timestamps and on the small fixture

### Story 1.5: What I did on the tablet reaches the office by itself

**Dev model:** fable · **Effort:** high · sync push, pull, rebase and rejection semantics; subtle concurrency and idempotency

As a company user,
I want my device to send what I captured and receive what others changed whenever the tab is open and online,
So that the office and the field see the same relatório without anyone pressing a button.

**Acceptance Criteria:**

**Given** the `ops` table on Postgres with a monotonic `seq` per company assigned at apply, and the minimal `relatorio` row `{id, company_id, project_id, status, title, template_id, seed_version}` needed to scope a stream
**When** the device calls `POST /api/sync/ops` with `{ops: Op[]}` (≤ 500, array order = apply order, `CONTRACT_VERSION` header)
**Then** the server answers `{applied: [{op_id, seq}], rejected: [{op_id, code}], superseded: [{op_id, over_op_id}]}` with per-op atomicity, rejects only for shape (`400 op_invalid`, `op_path_unknown`), server-only family (`403 op_server_only`) or tenant (`403`), and never for a domain rule (AR-23)
**And** a rejected op moves to `outbox.status = dead` with its code, is excluded from the materialized state by re-running `applyOp` over the log minus dead ops for that entity, and keeps its value for "Reenviar"

**Given** `GET /api/sync/company?since={seq}` and `GET /api/sync/relatorios/{id}?since={seq}`
**When** the device pulls
**Then** the company stream returns `scope = company` ops and the relatório stream returns ops with `relatorio_id = id` ∪ project-scope ops of that relatório's project, ordered by `seq`, as `{ops, seq, summary?}` and nothing else; pulled ops are applied through `applyOp`, routed by `scope`, deduplicated by `op_id` across streams, and after a pull every pending outbox op is re-applied on top of the pulled value (rebase)
**And** the pull never advances the cursor past an op the device cannot parse; a `426 contract_outdated` on pull stops pulling, keeps pushing, and shows the full-screen "Atualizar" state (AR-12)

**Given** the sync engine in `apps/web/src/sync`
**When** the tab launches, the `online` event fires, or 60 s pass
**Then** one cycle runs push ops → pull company → pull each relatório (file upload is added in Epic 6), with network and 5xx errors retried with backoff and jitter, 4xx never retried except `401` (re-auth banner, outbox intact), and one `sync_state` row per stream holding `{cursor_seq, complete, last_sync_at, last_push_at[]}` (FR-54, FR-55, FR-60, AR-7)
**And** the server stores `last_push_at` per `(user_id, device_id)` and returns it in the pull `summary`, never as an entity

**Given** the error envelope `{code, message, details?}` with codes enumerated in `packages/domain/contract`
**When** any route fails
**Then** the client receives that shape and the typed route definitions in the contract are the only way `apps/web` calls `apps/api`

**Given** the Sync status surface *(added 2026-09-21, system-level test design; see `_bmad-output/test-artifacts/test-design/fasor-handoff.md`)*
**When** the user taps "Sincronizar agora" (a primary Button at the top of Sync status; decision C-4, 2026-09-21)
**Then** one full sync cycle runs immediately with the same code path as the timer, the badge reflects the result, and tapping while a cycle runs is a no-op with the reason beside the button; tests use this action instead of waiting for the 60 s tick (TC-4)
**And** `packages/domain/contract` ships one valid and one invalid example per route (op batches, pull responses, error envelopes) reused as test fixtures (ADR readiness 1.4)

### Story 1.6: Home and Account show what is on this device

**Dev model:** opus · **Effort:** medium · Home, Account, status table and badge wiring across kernel and UI

As a company user,
I want Home to show my relatórios by status and tell me which are on this device,
So that opening the app in the field is one tap and I never open an empty relatório by mistake.

**Acceptance Criteria:**

**Given** `packages/domain/status` holding the AD-22 `(state, event) → state` table and `statusTable` as the only emitter of `relatorio/status` ops
**When** Home renders as in `20-home.html` and `key-home.html`
**Then** the App bar shows the PRODUTO wordmark, the surface title, the Sync badge and the avatar initial; the Status board shows four tiles (Rascunho · Em campo · Em revisão · Emitido) with live counts including zero, each tile filtering the list with `aria-pressed` and a second tap clearing; and the Shortcut cards open Templates and Registries with live sub-lines (UX-DR7, UX-DR63, UX-DR64)

**Given** relatório rows exist for the company
**When** the list renders
**Then** each Relatório card shows client · site, dates · template, Status pill + progress + compact Sync badge, and device availability "No aparelho · atualizado hh:mm", "Baixando… n de m" or "Não está neste aparelho — conecte para baixar" (grayed; tap explains in a toast and does nothing else); the relatório Em campo on this device sorts first with the `is-current` state and "Continuar" plus "Ver sumário" (FR-21, FR-55, UX-DR26)
**And** with no relatórios the empty state reads "Nenhum relatório ainda." with "Novo relatório"

**Given** every relatório in Rascunho or Em campo and the company scope
**When** the device is online with the tab open
**Then** they are pulled automatically with no cap and Home reflects freshness from `sync_state`; Em revisão and Emitido relatórios are pulled on open (FR-55, AR-7)

**Given** the Sync badge and the banner slot rendered once in `apps/web/src/state` from `syncCounts(snapshot, outbox)`
**When** the queue changes
**Then** the badge shows ok · pending · offline · error · conflict always with a word, announces state transitions only, and tapping it opens a Sync status surface whose headline shows counts of items pending and last sync (rows beyond the headline arrive in Epic 10); the banner slot obeys the priority conflict › re-auth › draft found › suggestions ready › relatório exported › offline › unsynced > 5 days; the Toast component shows one at a time, 6 s, persistent with an action, `role="status"` (UX-DR8, UX-DR10, UX-DR11, AR-27)

**Given** Account as in `90-account.html`
**When** it renders
**Then** it lists name, Registro profissional (Story 1.3), Tema as a segmented control (Sistema · Claro · Escuro applying at once and persisting in `local_prefs`, theme attribute on the root element), "Ver status de sincronização", storage in use on this device in `value`, and "Sair"; there is no "Instalar" row (UX-DR1, UX-DR65)

**Given** the device is offline at cold open with a session
**When** Home renders
**Then** the relatórios on this device render, the badge reads "Sem conexão", and the toast "Sem conexão. Tudo fica salvo neste aparelho." appears once per session (UX-DR71)

### Story 1.7: Reach the local stack from a tablet over HTTPS

**Dev model:** sonnet · **Effort:** medium · docker-compose, Caddy and mkcert plumbing

As a field user testing on an iPad or an Android tablet,
I want the app reachable at an HTTPS address on the office Wi-Fi from the developer's docker-compose stack,
So that the offline proof and every later field test run on a real device without any cloud account.

**Acceptance Criteria:**

**Given** `docker-compose.yml` gains a reverse proxy service (Caddy) in front of the api, terminating TLS with a certificate issued by a local CA (mkcert) for the machine's LAN hostname and IP
**When** the developer runs `docker compose up` and installs the local CA root on the iPad and the Android tablet once (documented step in `docs/`)
**Then** `https://⟨host⟩.local` serves the built web app and `/api/*` from the api container on the same origin, the browser treats it as a secure context (service worker, camera and Geolocation APIs available), and no CORS is involved (AR-8, AR-26)

**Given** the api image built from `apps/api/Dockerfile` (node:24) and the web bundle built by Vite
**When** the `prod` profile of docker-compose runs
**Then** the api container serves the static bundle and `/api/*` exactly as the future cloud image will, Postgres 18 and MinIO run beside it, Drizzle migrations run forward-only as a one-shot container before the api starts, and structured JSON logs with `company_id` and `relatorio_id` go to stdout (NFR-18)

**Given** the local HTTPS origin is up
**When** a seeded user opens it on an iPad and on an Android phone
**Then** they can sign in, see Home, and the app serves its shell with `lang="pt-BR"`, both themes and the self-hosted Inter (FR-54 proof precondition, NFR-9)

~~**Given** CI on the main branch
**When** a commit lands
**Then** the api image is built once and tagged with the commit (kept in the local registry or the CI cache; no push to a cloud registry until Epic 11), lint and tests gate the build~~ (2026-09-21: no CI in the MVP; `pnpm verify` run locally is the merge gate, AGENTS.md)

### Story 1.8: Nothing captured is lost when the tab closes, the network drops or storage is scarce

**Dev model:** opus · **Effort:** high · service worker, drafts, eviction recovery and the three durability scenarios in Playwright

As a field engineer,
I want the app to keep working in an ordinary browser tab with no signal and to recover what I was typing if the tab died,
So that a three-day job in a basement never loses a value.

**Acceptance Criteria:**

**Given** `public/sw.js` precaching the app shell (`/`, hashed assets, Inter files, the SVG sprite) and nothing else
**When** a signed-in user cold-opens the tab offline
**Then** the shell loads from the cache, Home renders from IndexedDB, no manifest install prompt, Background Sync API or `persist()` is used, and a new shell activates only on the next launch when the outbox is empty (AR-7, NFR-9)

**Given** uncommitted field text or an unsaved dialog state
**When** `visibilitychange` or `pagehide` fires
**Then** it is persisted to the per-user `drafts` table keyed by surface and entity, and on reopen the persistent toast "Rascunho encontrado — Recuperar" offers it and never applies it silently; dismissing keeps the draft (FR-61)

**Given** the outbox holds items older than 5 days, or the origin's storage was evicted while the session cookie survived
**When** the app boots
**Then** the warning banner "Alterações sem envio há 5 dias" appears in the first case, and in the second a one-time screen names what the server holds and re-pulls (AR-7)

**Given** Playwright projects for desktop Chrome, Android Chrome emulation and WebKit over `src/db` and `src/sync`
**When** the three FR-54 scenarios run by name: the tab closed mid-sheet, the network dropped mid-push, the quota exhausted through a mocked `storage.estimate`
**Then** every committed op is present after reopen, the push resumes without duplicates, and the app shows an error toast rather than silently refusing a write (NFR-17)

**Given** the local HTTPS address from Story 1.7 on an iPad running Safari and on an Android tablet running Chrome
**When** a tester follows the written manual script (sign in, go offline, commit values, close Safari, wait, reopen; leave the tab unused for the eviction window; open the camera from a page)
**Then** the results are recorded in ~~`docs/`~~ `_bmad-output/test-artifacts/manual/` as the PRD Q0 proof with the date, device and iPadOS version (path changed 2026-09-21, test design TC-12), and the same script is repeated by Matheus at the close of every epic that touches capture or sync (Epics 5, 6 and 8; decision 7 of 2026-09-21), and the outcome selects the platform line for the slice (all three browsers, or Android Chrome and desktop only with FR-56 unchanged)

## Epic 2: Registries and company identity

An office user sets, once, everything reused across relatórios: the company's document identity with a live brand preview, clients, instruments with their calibration record and certificate, manufacturers and voltage classes (creatable inline, offline), the read-only sourced acceptance criteria. Mockups: `prototype/screens/80-cadastros.html`, `key-registries.html` (Empresa tab with the Brand preview; Instruments with an expired row first; inline "Criar" of a manufacturer offline; read-only Critérios de aceitação).

### Story 2.1: Register a test instrument with its calibration record

**Dev model:** sonnet · **Effort:** medium · registry CRUD with autosave ops and a derived date

As an office user,
I want to register each test instrument once with its code, identity and calibration record,
So that selecting a code on a sheet fills the whole instrument header that today is retyped on 85 sheets per job.

**Acceptance Criteria:**

**Given** the Registries surface as in `80-cadastros.html` with Tabs Empresa · Clientes · Instrumentos · Fabricantes · Classes de tensão · Critérios de aceitação (wrapping on narrow widths, never scrolling sideways, Instrumentos selected by default, selection remembered per session)
**When** the user opens Instrumentos
**Then** each Registry row shows "⟨code⟩ — ⟨name⟩ ⟨model⟩" in `body` and serial · RBC · validade in `meta`, expired instruments sort first prefixed "Vencida" in amber, and the empty state offers "Cadastrar instrumento" (UX-DR23, UX-DR56)

**Given** the instrument form (Form dialog on desktop, full-screen on phone)
**When** the user fills code (e.g. "2E"), name, manufacturer, type or model, serial number, calibration certificate number, calibration date, calibrating laboratory, an RBC-accredited toggle, the company's own calibration interval in months, and a default test voltage or current per test type (isolação, resistência de contato, relação de transformação)
**Then** the validity date is derived as calibration date plus the interval and shown read-only; RBC accreditation is optional; each field autosaves as a `registry/instrument/{id}` op with no Save button; the registry stores no acceptance values (FR-3)

**Given** an instrument whose validity date has passed
**When** it is listed or later picked
**Then** it is never blocked: the row shows "Vencida em dd/mm/aaaa" and the kernel `calibrationCheck(instrument, service_period_end)` returns `expired`, `expiring` (within 30 days after the period end) or `valid` for the Instrument picker and the pre-issue list to consume (AR-18)

**Given** an instrument referenced by a sheet (none exist yet; the rule is enforced by the kernel `integrity` check on `instrument_id` references)
**When** the user tries to delete it
**Then** only "Arquivar" is offered; an unreferenced instrument can be removed with a Confirm dialog and an undo toast

**Given** the device is offline
**When** an instrument is created or edited
**Then** the op sits in the outbox, the row appears immediately, and it is pushed on the next cycle (FR-54)

### Story 2.2: Attach a certificate file that reaches the server by itself

**Dev model:** opus · **Effort:** medium · file entity, idempotent upload route, uploader ordering and storage adapter

As an office user,
I want to attach the calibration certificate PDF or image to an instrument, even offline,
So that section 11 of every relatório can print it without anyone hunting for the file later.

**Acceptance Criteria:**

**Given** the `file` entity in `packages/domain/schemas/file` as a zod discriminated union on `kind` with the common fields `{id, company_id, relatorio_id?, sha256, mime, size, uploaded_at?, variants?, removed_at?}`, the `certificate` kind accepting pdf, jpeg or png, and the `files` Dexie table holding the Blob
**When** the user taps the certificate tile on an instrument row and picks a file
**Then** a `file/{id}` create op (`scope: company`) and the `registry/instrument/{id}/certificate_file_id` op are emitted in one batch, the Blob is written to IndexedDB in the same transaction, and the row shows the file name at once (AR-6)
**And** a file over 25 MB is refused before upload with an inline reason

**Given** the storage adapter in `apps/api/src/storage` (MinIO in docker-compose for the whole MVP; the same S3 API serves AWS later) with immutable keys `company/{cid}/{kind}/{id}` and no delete
**When** the uploader in `apps/web/src/sync` runs after the push step of a cycle
**Then** it `PUT`s `/api/files/{id}` with the bytes and `sha256`, never before the file's create op is acked, two uploads in flight, one failed file never blocking the queue; the server answers `409 file_row_missing` (retryable) when the row is not applied, stores the object, and emits `file/{id}/uploaded_at` as a `system:files` op (FR-56 for company files, AR-23)
**And** a retried upload of the same id and sha256 is idempotent and never duplicates the object

**Given** `GET /api/files/{id}/{original|thumb|print}`
**When** the office opens the certificate from the row on another device on the local network
**Then** the original is fetched on demand and cached locally; the sync engine never prefetches certificate originals

**Given** a `logo` kind (png or svg) and a `cover_background` kind (jpeg or png)
**When** either is uploaded through the same tile mechanism
**Then** the server makes `thumb` and `print` variants with sharp (SVG rasterized) and emits `file/{id}/variants`; the same upload path serves every later kind (FR-1, FR-3)

### Story 2.3: Set the company's document identity once, with a live brand preview

**Dev model:** sonnet · **Effort:** medium · form with autosave and a CSS brand preview

As an office user,
I want to record the company's brand, contact lines and form identity once and see how the cover, header and footer will print,
So that no relatório and no export ever asks for them again.

**Acceptance Criteria:**

**Given** the Empresa tab as in `key-registries.html` (first tab, office surface, one row per company)
**When** the user fills razão social, CNPJ, address lines, telephone, e-mail, form title (default "Relatório Técnico de Cabine Primária"), form code (default "FO.SERV-03") and form revision (default "Revisão 01"), and uploads a logo and an optional cover background through the upload tiles
**Then** each field autosaves as a `registry/empresa/{id}/{field}` op with no Save button, the uploads follow Story 2.2, and there is no watermark toggle and no client-logo field (FR-1, source-deltas)

**Given** the Brand preview card "Pré-visualização do documento"
**When** any field changes
**Then** three miniature pages re-render from the current values as a CSS approximation (cover with the logo slot and cover background box, one header strip with logo, two-line form title and code plus revision, one footer strip with the company lines and "Página X de Y"), showing `border-hairline` placeholder boxes reading "Logo" or "Fundo" when absent; the card is `aria-hidden` as a whole and never a rendered PDF (UX-DR66, AR-14)

**Given** razão social or logo is missing
**When** the user leaves the tab
**Then** nothing is required and nothing blocks; the kernel `preIssue` gains the rows "Razão social não cadastrada" and "Logo da empresa não cadastrado — Cadastrar" as warnings for Epic 7 to render (FR-1, FR-73)

**Given** the app chrome
**When** the company profile holds a logo
**Then** the App bar, Login and every surface keep the PRODUTO wordmark; the brand is drawn inside the app only in this tab's preview (NFR-15)

### Story 2.4: Register clients and their sites

**Dev model:** sonnet · **Effort:** low · simple registry CRUD

As an office user,
I want to register a client with its optional CNPJ, its sites and a contact,
So that creating a relatório fills the cover and the document control table from the registry.

**Acceptance Criteria:**

**Given** the Clientes tab
**When** the user adds a client with name, CNPJ (optional, validated as 14 digits when present), one or more sites each with an address, and a contact name and phone
**Then** the rows autosave as `registry/client/{id}` ops, the list shows name and CNPJ in `meta`, and a client referenced by a Project offers only "Arquivar" (FR-2)

~~**Given** the client Combobox used later by "Novo relatório" and Relatório setup~~
~~**When** the user types a name that does not exist~~
~~**Then** the last option reads "Criar “⟨texto⟩”" and creates the client inline, offline, from the cached registry (UX-DR19)~~

2026-09-22, decided by Matheus (Epic 2 retro D-2, action E2-A2): the AC above has no screen to close on in Epic 2, because the client Combobox belongs to "Novo relatório" and Relatório setup. It moves to Story 4.1, where that Combobox is built, and closes there with an e2e test through the mounted screen. Story 2.4 keeps the shared `RegistryPickerField`/`Combobox` behavior it already ships.

**Given** a client with a CNPJ
**When** the kernel composes the document control table (Epic 7)
**Then** the CNPJ is available as `contratante.cnpj`; without it the row prints "—" and the pre-issue list warns "CNPJ do contratante em branco" (FR-2, FR-64)

### Story 2.5: Pick manufacturers and voltage classes, or create one from the field that needs it

**Dev model:** sonnet · **Effort:** medium · chip rows, inline create offline and a normalized-name merge on the server

As a user in the office or in the field,
I want manufacturers and voltage classes as pick-lists I can extend on the spot,
So that a nameplate never waits for the office to register "Celtta".

**Acceptance Criteria:**

**Given** the Fabricantes and Classes de tensão tabs
**When** the user adds a manufacturer (name, gender and number metadata for caption agreement) or a voltage class (value in kV, e.g. "15", "17,5", "23")
**Then** the rows autosave as `registry/manufacturer/{id}` and `registry/voltage_class/{id}` ops and appear in every picker on that device immediately (FR-4)

**Given** a field surface (tablet or phone) with a manufacturer or voltage class field
**When** the field is focused
**Then** it shows a wrapping Chip row of the 5 most recent values used in this relatório ending in "Outro…", and "Outro…" opens the full-screen Combobox with the whole registry; on desktop the Combobox appears directly (UX-DR19, UX-DR24)

**Given** the Combobox with a typed name absent from the registry
**When** the user taps "Criar “Celtta”" while offline
**Then** the entry is created as an op in the outbox, the field takes the value, and the entry is available on this device at once (FR-4)

**Given** two devices created "Schneider" and "SCHNEIDER" offline
**When** both ops reach the server
**Then** the server merges them into one entry by normalized name (case and accent folded, trimmed) without touching any sheet, because manufacturer and voltage class are stored on sheets by value (AR-18); one test covers the merge

### Story 2.6: See the acceptance criteria as sourced data

**Dev model:** sonnet · **Effort:** medium · criterion schema, comparison with unit scaling, seed tests and a read-only table

As an office user,
I want to see every acceptance criterion with its operator, value, unit, type and source,
So that I know what the sheet will compare against and where that number came from.

**Acceptance Criteria:**

**Given** the criterion zod schema in `packages/domain/seed` as `{operator, value, unit, type: absolute_min|absolute_max|deviation_between|deviation_vs_calculated|pass_fail, source: {name, edition?}}` and the kernel `compareCriterion(value, criterion)`
**When** the seed tests run
**Then** a criterion without operator, type or source is rejected at seed time, an edition of null is allowed, and the three seeded criteria exist: `> 400 MΩ` for isolação, `< 250 µΩ` for resistência de contato and `± 0,5 %` for relação de transformação, all with source `{name: "aceitável na ficha", edition: null}` (FR-5)
**And** `compareCriterion` fails 330 MΩ against `> 400 MΩ`, fails 251 µΩ against `< 250 µΩ`, passes a 0,4 % deviation against `± 0,5 %`, and handles unit scaling (147 GΩ against `> 400 MΩ` passes)

**Given** the Critérios de aceitação tab as in `key-registries.html`
**When** it renders
**Then** it is a read-only Data table with header cells and rows of test sub-block type · criterion in `value` · source in `ink-secondary` · used by, with no row actions and no editing surface (UX-DR57)

**Given** the application code and the document layout
**When** they are searched for a criterion value
**Then** no criterion number exists outside the seed module (FR-5, NFR-14)

## Epic 3: Seed data and Templates

An office user opens the seeded "Cabine primária — padrão" template that reproduces FO.SERV-03, duplicates it, builds the location skeleton with quantities per column, sets sub-block defaults and subtypes, and edits the plain-text boilerplate with variables. The versioned seed is the first story, pure data with kernel tests, parallelizable from day 1. Mockups: `prototype/screens/41-templates.html`, `42-template-composer.html`, `key-templates.html`, `key-template-composer.html`.

### Story 3.1: Seed the eight equipment block types from the decoded FO.SERV-03

**Dev model:** opus · **Effort:** high · careful transcription of the decoded FO.SERV-03 into typed seed data; correctness over creativity

As a field engineer,
I want every equipment sheet to carry exactly the nameplate fields, checklist items and test tables of the real FO.SERV-03,
So that the generated document is the one I sign today and I type only what is specific to the unit.

**Acceptance Criteria:**

**Given** `packages/domain/seed/v1.ts` exporting definitions resolved through `getDefinition(seed_version, report_type, block_type)` with `report_type = "cabine_primaria"` as the only value
**When** the kernel seed tests run against the decoded sheet lists of `addendum.md` §9
**Then** the eight block types resolve to the verbatim nameplate field lists with the decoded counts (cabos_entrada 0, para_raio 5, chave_seccionadora 10, disjuntor_mt 13, tp 12, tc 14, cabos_saida 0, transformador_forca 12), every field carrying `kind ∈ {text, number, date, select, manufacturer, voltage_class}`, `unit?` and `options?` (AR-10, FR-22)
**And** the five checklist lists resolve verbatim (cabos 5, para_raio 5, chave_seccionadora 14, disjuntor_mt 15, tp/tc/transformador_forca the shared 15) with one normalized column order `ÍTEM | C | NC | NA | OBSERVAÇÕES`

**Given** the four table grammars
**When** a block type is resolved
**Then** its tests carry the exact row sets and columns: single-table insulation (rows per type as in §9.3, capture column `1 minuto`, print grid `30 SEGUNDOS | 1 MINUTO | ESTAB./10MIN | ABSORÇÃO | POLARIZAÇÃO`), open and closed contact (`T1/T2, T3/T4, T5/T6` and `FASE A/B/C`, column `Valor`), contact resistance (`T1-T2, T3-T4, T5-T6`, µΩ), and the three ratio variants (TP `H1-H2 / X1-X2`, TC `P1-P2 / S1-S2`, transformer per TAP with three connections), each test bound to its criterion from Story 2.6 (FR-27)
**And** Transformador de força carries the conclusion block absent from the source

**Given** the subtype definitions
**When** a block type is resolved
**Then** `TIPO DE SE` offers SIMPLIFICADA - POSTE · ALVENARIA - CONVENCIONAL · BLINDADA, `MEIO DE EXTINÇÃO` AR · SF6, `TIPO DE ISOLAÇÃO` EPÓXI · Á SECO (EPOXI normalized to EPÓXI), `ACIONAMENTO` MANUAL/PUNHO; the manual seccionadora subtype yields `na_defaults = [MOTOR, FUSÍVEIS]` and the dry-type tp, tc and transformer subtype yields the eight oil-related item keys (FR-11)

**Given** the remaining seed content
**When** it is resolved
**Then** the `not_tested_reason` list is Impossibilidade de desligamento · Solicitação do cliente · Outro, each with its justification wording from section 8 of the source (FR-31); per-item NC chip phrases exist for every checklist item (three or four standard non-conformity phrases; they are domain knowledge, not derivable from the reference report, so the story delivers the full list as a reviewable document in `docs/` for Bruno before the seed is frozen, and the seed test only checks presence and count); the Atividade and Local chip seed lists hold the about 10 activities and 8 locations of the source captions; the sheet-level "Observações rápidas" chips include the standard rain/humidity note

**Given** `packages/domain/seed` is append-only by version
**When** a definition changes
**Then** it is added as a new version and every previous version still resolves (AR-20)

**Given** the R-009 seed gate *(added 2026-09-21, system-level test design; see `_bmad-output/test-artifacts/test-design/fasor-handoff.md`)*
**When** the seed tests pass
**Then** Matheus reviews the resolved definitions against the decoded FO.SERV-03 in `docs/context/` (labels, counts, criteria and sources) and records the review with the date in this story before Story 4.1 starts; Bruno's review happens on the first generated DOCX in Story 4.8 (decision 4 of 2026-09-21)

*2026-09-23, Matheus (Epic 3 retro E3-A1): the R-009 review is deferred; Epic 4 starts without it. The review is recorded here before Epic 5 starts, and it decides D-2 (`{obra}` split and article), D-3 (NA defaults and subtypes) and D-6 (roles). Any correction ships as seed v2 (append-only, AR-20), so relatórios created on v1 keep resolving.*

### Story 3.2: Seed the section boilerplate and the "Cabine primária — padrão" template

**Dev model:** opus · **Effort:** medium · boilerplate with variables, BlockConfig schema and the seeded template skeleton

As an office user,
I want the standard template with the FO.SERV-03 sections and the Porto Seguro-shaped location skeleton to exist before I do anything,
So that my first relatório is composed from the company's own form, not from a blank page.

**Acceptance Criteria:**

**Given** section boilerplate keyed by `(section, effective_from)` in the seed
**When** the kernel resolves the current text
**Then** sections 1, 2, 3, 4, 5, 6 and 10 carry the verbatim FO.SERV-03 text with named variables (`{empresa_executora}`, `{cliente}`, `{obra}`, `{escopo}`, `{datas}`, `{responsavel}`): section 2's seven definitions, section 4's five requirement blocks, section 5's quoted NR-10 10.5.1 six-step sequence and nine-item re-energization checklist, section 6's eight-type catalogue including Relé de Proteção and Cubículos/QGBT, section 10's three fixed bullets, and the cover's `DADOS DO CLIENTE` rows (FR-66, AR-20)
**And** the MVP seeds only the current NR-10 text; the slot for `effective_from = 2027-06-01` exists empty

**Given** the `BlockConfig` zod schema `{block_type, subtype?, role?: entrada|saida|alimentacao, sub_blocks: Record<SubBlockKey, {enabled, options?}>, na_defaults: ItemKey[]}` and the Template row schema (`template/{id}` with blocks as `BlockConfig + {quantity, skeleton_location_ref}` and a location skeleton)
**When** a company is seeded (Story 1.3's CLI)
**Then** the Template "Cabine primária — padrão" exists with the section blocks in order, the skeleton Cubículo Enel · 1° Subsolo (Coluna 1 to Coluna 17) · Oxigênio · Cobertura A · Cobertura B · Geradores, per-column quantities matching the reference job (25 seccionadoras, 21 disjuntores, 11 TP, 11 TC, 8 transformadores, 4 cabos de entrada, 9 cabos de saída, 5 para-raios), `agrupar_por_tipo` on for 1° Subsolo and Geradores and off for the others, the manual subtype on seccionadoras, and the "IA e IP lidos do visor" sub-block off (FR-9, FR-10, FR-11)
**And** the template records `seed_version = 1`

**Given** the Templates list is empty for a company seeded without the flag
**When** it renders
**Then** the empty state reads "Nenhum template. Crie um a partir do relatório padrão FO.SERV-03." with an action that seeds the standard template (UX-DR70)

### Story 3.3: List, duplicate and archive templates

**Dev model:** sonnet · **Effort:** low · list, duplicate, archive

As an office user,
I want to duplicate the standard template for a client and archive the ones I no longer use,
So that each site keeps its own composition without me rebuilding it.

**Acceptance Criteria:**

**Given** the Templates surface as in `41-templates.html` and `key-templates.html`, reached from the Home shortcut
**When** it renders
**Then** it lists templates with name, block count, seed version and an archived group below, and offers "Novo template" (an empty composition) and per-row "Duplicar" and "Arquivar" (FR-9)

**Given** a template
**When** the user duplicates it
**Then** a new `template/{id}` create op carries the structure, skeleton, quantities and `BlockConfig` defaults with a new name "⟨nome⟩ — cópia", and no relatório data is involved

**Given** a template referenced by existing relatórios
**When** the user archives it
**Then** it leaves the creation picker, relatórios created from it are untouched, and "Restaurar" brings it back; a template never referenced can be removed with a Confirm dialog and undo (FR-9, FR-13)

### Story 3.4: Compose a template with its location skeleton and quantities per column

**Dev model:** opus · **Effort:** medium · composer with skeleton editing, quantities per column and reorder paths

As an office user,
I want to build the cabines and columns of a site and set how many of each equipment type sit in each column,
So that every relatório created from the template is born with all its blocks in place.

**Acceptance Criteria:**

**Given** the Template composer as in `42-template-composer.html` and `key-template-composer.html` (palette and composition side by side on desktop, right drawer on tablet)
**When** the user adds a cabine, then columns inside it, renames or reorders them (drag, Overflow "Subir · Descer", Alt+↑/↓, Position box)
**Then** the skeleton is written as template ops, every move is announced ("Coluna 5 movida para a posição 3 de 17"), and a cabine may hold blocks directly with no column (AR-5, FR-10)

**Given** the office Block palette headed by the current column ("Coluna 5") with the groups "Seções" and "Equipamentos"
**When** the user sets quantities with the Quantity stepper (−/+ 48 px, typeable, "—" at zero, press-and-hold repeats, announces "Seccionadoras, 25")
**Then** each equipment row of the composition shows its quantity per column and the composer header shows the per-type totals; 1 seccionadora, 1 disjuntor, 1 TP and 1 TC on a column repeated across 17 columns totals 17 of each (FR-10, UX-DR29, UX-DR30)

**Given** section blocks in the composition
**When** the user reorders or removes one
**Then** Block cards show the FO.SERV-03 section number, the Overflow offers "Adicionar abaixo · Subir · Descer · Duplicar · Remover", and removal routes through the Confirm dialog and undo toast (UX-DR28)

**Given** a cabine row
**When** the user toggles *Agrupar por tipo*
**Then** the flag is stored on the skeleton cabine and becomes the default for relatórios created from it (FR-10)

**Given** a template edit of any kind
**When** the ops are inspected
**Then** only `template/{id}/*` ops were emitted; no `relatorio`, `location` or `block` op exists, which is what keeps existing relatórios untouched (FR-13)

### Story 3.5: Set sub-block defaults and subtypes per block type

**Dev model:** sonnet · **Effort:** medium · toggles, subtype selects and NA defaults

As an office user,
I want to switch tests and groups on or off per block type and pick a subtype that pre-marks the items that never apply,
So that the field engineer sees only what this site's equipment needs and touches only NC and NA rows.

**Acceptance Criteria:**

**Given** an equipment block in the composition
**When** the user opens it
**Then** its sub-blocks (nameplate group, each test, observations, the optional "IA e IP lidos do visor" columns) show Toggle rows with the state word; checklist and conclusion show "Sempre" and are not controls (FR-11, UX-DR20)

**Given** the subtype selects of the block type (from Story 3.1)
**When** the user picks "manual" on Chave seccionadora, or "Á SECO" on TP, TC or Transformador de força
**Then** the `BlockConfig.na_defaults` is set to the seed's list for that subtype, the composer shows "2 itens marcados NA por padrão" or "8 itens marcados NA por padrão", and no item is removed from the list (FR-11)

**Given** a sub-block switched off
**When** the definition is consumed by the renderer later
**Then** it is omitted, never printed empty; a kernel test asserts `enabled = false` sub-blocks are excluded from `progress` and `groupForPrint` inputs (FR-11, AR-17)

### Story 3.6: Edit the section boilerplate as plain text with variables

**Dev model:** sonnet · **Effort:** medium · plain-text editor with variable chips and a resolver

As an office user,
I want to adjust a section's fixed text in the template and drop in variables for what changes per job,
So that the objective and scope read the way the company writes them.

**Acceptance Criteria:**

**Given** a section block opened in the Template composer
**When** the user edits its text
**Then** it is a plain-text editor with autosave, a wrapping Chip row "Inserir dado do relatório" (cliente · obra · datas · empresa executora · responsável) inserting a variable chip that cannot be edited character by character, only removed, and "Restaurar texto padrão" with undo; there is no toolbar (the rich text editor is Epic 11) (FR-12, UX-DR69)

**Given** section 1 Objetivo with its variables
**When** the kernel `resolveSectionText(text, relatorioInputs)` runs in a test
**Then** every variable resolves to its value and an unresolved variable prints its label in brackets and is reported by `integrity`

**Given** the text was edited in the template
**When** a relatório already exists from that template
**Then** its section text is unchanged (FR-13)

### Story 3.7: Build the Porto Seguro fixture relatório

**Dev model:** sonnet · **Effort:** high · large data transcription into an op-log fixture; needs patience, not architecture

As a builder,
I want the September 2026 Porto Seguro job re-entered as a fixture relatório on the seeded template,
So that the renderer snapshot tests, the Sumário and pre-issue identity test and the 2026-10-03 acceptance run against the document Bruno actually signed.

**Acceptance Criteria:**

**Given** the seed of Stories 3.1 and 3.2 and the decoded sheets in `.working/extract-raw-sources.md` §2
**When** the fixture is authored as an op log under `packages/domain/fixtures/porto-seguro/` (a script generating `project`, `relatorio`, `location`, `equipment`, `block` and `sheet/*` ops from a typed data file)
**Then** it holds the six cabines with their columns, the 94 equipment blocks with their TAGs, the reference nameplates, the C/NC/NA patterns and the measured values of the delivered document (including the five contact-resistance readings above `< 250 µΩ` and the untested disconnectors and TIE breaker with their section 8 reasons), the cover data ~~with placeholder people and CNPJs~~ with the real client, site, people and CNPJs of the delivered document (waiver R-023 signed by Matheus on 2026-09-21; AGENTS.md updated), and the instruments 2E, 3M and 1T with their certificate numbers
**And** the fixture is parallelizable with Epic 1 and loads into both the Dexie store and Postgres through `applyOp` for every test that names "the Porto Seguro fixture" (FR-22, FR-68, NFR-17)

**Given** no photographs are available for the fixture
**When** tests need section 7
**Then** a small set of placeholder photos with captions and stamps from the delivered caption list is included, numbered 01 to 76 to reproduce the source's numbering defect for the renderer to correct

**Given** determinism and scale *(added 2026-09-21, system-level test design; see `_bmad-output/test-artifacts/test-design/fasor-handoff.md`)*
**When** the fixture generator runs
**Then** every op carries a fixed id and timestamp from the typed data file so the replay and golden tests are byte-stable (TC-2), and a second, small fixture relatório (one cabine, three blocks) exists under the same folder for every generation test that does not need the full document (TC-8)

## Epic 4: Projects, relatório setup, the Sumário and the tree

A user creates the Porto Seguro project and a relatório from the template: all 94 equipment blocks are born in their columns with suggested TAGs; the setup page records cover data, responsável, instruments and altitude; the Sumário shows the document in FO.SERV-03 order with what is missing per row; section 9 opens into the location tree; blocks are added, removed, restored, duplicated and reordered four ways; and the epic closes with the thin DOCX skeleton that proves the one renderer, LibreOffice in the container and the two-pass table of contents. Mockups: `prototype/screens/30-project.html`, `50-relatorio-setup.html`, `40-relatorio-overview.html`, `45-secao.html`, `key-project.html`, `key-relatorio-setup.html`, `key-relatorio-overview.html`.

### Story 4.1: Create a project and a relatório whose blocks are born in place

**Dev model:** fable · **Effort:** high · instantiateTemplate, the equipment table, TAG suggestion and the creation batch shape the whole data model

*2026-09-23, Matheus (Epic 3 retro D-4): `template.version` is no longer immutable. Every template edit increments it, and `instantiateTemplate` records the template's current version in `relatorio.template_version`. D-2 (`{obra}`) stays on seed v1 until the R-009 review (see Story 3.1).*

As an office user,
I want to open a project for a client and site and create a relatório from a template,
So that every equipment block exists in its column with its TAG before anyone walks the substation.

**Acceptance Criteria:**

**Given** the Project surface as in `30-project.html` and `key-project.html`
**When** the user creates a Project from Home ("Novo relatório" › client) with a client from the registry and a site
**Then** a `project/{id}` create op (`scope: company`) is emitted, the surface lists the project's relatórios as Relatório rows (newest first, six desktop columns, stacking on phone), and the empty state reads "Nenhum relatório nesta obra." with "Novo relatório a partir de template" (FR-15, UX-DR27)

**Given** the "Novo relatório" Form dialog
**When** it opens
**Then** the report type radio shows the single option "Cabine primária" preselected, the template Combobox defaults to the last used in this project, the two date fields default end to start, and "Criar relatório" stays `aria-disabled` with the reason beside it until template and start date exist (FR-15, UX-DR60)

**Given** the client Combobox of "Novo relatório" and of Relatório setup (moved here from Story 2.4 on 2026-09-22, decided by Matheus, Epic 2 retro D-2)
**When** the user types a name that does not exist
**Then** the last option reads "Criar “⟨texto⟩”" and creates the client inline, offline, from the cached registry, and an e2e test drives it through the mounted dialog (UX-DR19)

**Given** the kernel `instantiateTemplate(template, project, inputs)` and the `equipment` table `{id, project_id, tag, type, last_nameplate?, removed_at?}` (scope project)
**When** the user taps "Criar relatório"
**Then** one client batch is emitted: the `relatorio/{id}` create (with `template_id`, `template_version`, `seed_version`, status Rascunho), the `location/{id}` creates for every cabine and column of the skeleton with `order_key`, `se`, `env` and `agrupar_por_tipo` on cabine nodes, one `equipment/{id}` create per block, and one `block/{id}` create per block carrying its copied `BlockConfig`, `location_id`, `order_key` and `equipment_id`; the server never copies anything (AR-5)
**And** for the seeded template the batch yields 94 equipment blocks with the reference distribution, each in its column

**Given** the kernel `suggestTag(type, location, existingEquipment)`
**When** blocks are instantiated or later added
**Then** the first Chave seccionadora in Coluna 5 gets "SEC-C05", the second "SEC-C05-2", a Disjuntor "DJ-C05", a TP "TP-C05", a TC "TC-C05", a transformer "TR-⟨n⟩", cables "CE-"/"CS-" prefixes, and a block directly under a cabine uses the cabine's short name; uniqueness is checked against `equipment where project_id = … and removed_at is null` (FR-7, AR-24)

**Given** the sync engine from Story 1.5
**When** the relatório stream is pulled on another device
**Then** it receives the relatório's ops and the project-scope `equipment` ops, so a relatório created later still sees the project's whole equipment history (AR-23)

### Story 4.2: Fill the relatório setup page

**Dev model:** sonnet · **Effort:** medium · setup bands with autosave, prefill and one status transition

As an office user,
I want one scrolling page of numbered bands for the cover data, responsável, instruments and site altitude,
So that the office part of the relatório is done before the field day and nothing on it is typed twice.

**Acceptance Criteria:**

**Given** Relatório setup as in `50-relatorio-setup.html` and `key-relatorio-setup.html`, opened after creation and from the Sumário's first row
**When** it renders
**Then** it shows Section bands "Etapa 1 — Capa" (client and site prefilled from the project, dates, additional info, cover photo upload as a `cover_photo` file), "Etapa 2 — Objetivo e escopo" (section 1 variables and the section 3 exclusions as a plain list of fields), "Etapa 3 — Responsável" (name and council prefilled from the account's Registro profissional with the Conselho segmented control relabeling the two number fields, only the ART or TRT number typed), "Etapa 4 — Instrumentos e certificados" (Checkbox rows of registered instruments, expired ones selectable with their amber line), "Etapa 5 — Local" (altitude, next recommended intervention as a date plus justification, never defaulted) and the band "Conclusão e parecer" as a placeholder that Epic 7 fills (FR-16, UX-DR21, UX-DR22, UX-DR62)
**And** every field autosaves as a `relatorio/setup/{field}` op; the Sticky action bar carries "Concluir dados do relatório"

**Given** the device grants geolocation
**When** the altitude field first renders empty
**Then** it is prefilled from the Geolocation API as a rounded value or "< 1000 m" with a "Confirmar" tap, asked once per relatório and never re-asked on the sheets (FR-16)

**Given** the kernel `integrity` reports setup complete (client, dates, responsável number, at least one instrument)
**When** the user taps "Concluir dados do relatório"
**Then** `statusTable(Rascunho, setup_complete)` yields Em campo and a `relatorio/status` op is emitted; otherwise the button states what is missing beside it (FR-21, AR-21)

**Given** an instrument unchecked while a sheet references it (checked by `integrity`)
**When** the user unchecks it
**Then** an inline note says it stays in section 11 because a sheet uses it (UX-DR21)

### Story 4.3: See the relatório as its own table of contents (the Sumário)

**Dev model:** opus · **Effort:** high · the Sumário and the first preIssue rows; one kernel function rendered in two places

As a user,
I want the relatório overview to be the document's own table of contents, each row showing what is missing,
So that I see the report the way the client will read it and know exactly what is left.

**Acceptance Criteria:**

**Given** the Sumário as in `40-relatorio-overview.html`
**When** a relatório opens
**Then** it lists one 64 px row per part in FO.SERV-03 order: Capa e dados do relatório · Controle do documento · 1 Objetivo · 2 Definições · 3 Limite de escopo · 4 Requisitos básicos · 5 Recomendações (NR-10) · 6 Verificações e ensaios · 7 Registro fotográfico · 8 Pontos de atenção · 9 Relatórios dos ensaios · 10 Conclusão e parecer · 11 Certificados, then "Pré-visualizar" (secondary, enabled in Epic 7) and "Gerar relatório" (primary) at the foot (FR-17, UX-DR31)

**Given** the kernel `preIssue(snapshot)` returning typed rows (this story seeds it with: setup fields missing, sheets not concluded "n de N", cabines without equipment; later epics append rows) and `progress(snapshot)`
**When** rows render
**Then** each row's `meta` line comes from `preIssue` (for example "42 de 94", "sempre no início", "montado sozinho"), a blocking status is set in `nao-conforme` with the title's weight, and the header shows fichas concluídas de N · NC abertos · não ensaiadas · sugestões por confirmar, ~~each count opening its list~~ each count opening section 9 *(2026-09-24, narrowed in PR #25: the per-count lists arrive with the epics that produce them)* (AR-2, FR-17)

**Given** the relatório status
**When** the Sumário opens
**Then** Em campo opens section 9 expanded and scrolled to the last sheet worked on this device (`local_prefs`); Rascunho, Em revisão and Emitido open collapsed with the rows carrying pendências leading

**Given** section rows 1 to 11
**When** the user uses the row's Overflow (Adicionar abaixo · Subir · Descer · Duplicar · Remover) or types another number in the Position box that is the row number
**Then** section blocks reorder as `block/{id}/order_key` ops, numbering redraws, every change is announced and undoable, and the cover and document control rows are fixed with `meta` notes and no controls (FR-19, UX-DR31)
**And** "Restaurar ficha removida" lives in the header Overflow
*2026-09-24, narrowed in PR #25: the generated rows 7 and 9 offer only Subir · Descer, because the renderer produces their content and adding, duplicating or removing them has no meaning; "Restaurar ficha removida" opens a dialog from the header Overflow.*

**Given** rows 1 and 3
**When** tapped
**Then** they open Relatório setup at Etapa 2; rows 2, 4, 5 and 6 open the section's resolved text read-only (the editable Section text surface replaces it in a later story of this epic); rows 7, 8, 10 and 11 open their surfaces when their epics land, meanwhile showing the row status only

### Story 4.4: Walk the location tree

**Dev model:** opus · **Effort:** medium · tree component in two presentations with sheetState and cabine rows

As a field engineer,
I want section 9 to open into the cabines, columns and equipment in the order I walk the substation, with each sheet's state visible,
So that I fill one column's four pieces of equipment in one pass at the panel.

**Acceptance Criteria:**

**Given** the Relatório tree component in its two presentations (Sumário expansion; the rail inside a sheet, mounted by Epic 5)
**When** section 9 expands
**Then** rows are indented 24 px per level, 56 px tall, Cabine › Coluna/Cubículo › Equipamento, unnumbered, with the one-line note "organizados por local aqui; no documento, agrupados como no FO.SERV-03"; chevrons have a 48×56 px hit area separate from the row body and Left/Right arrows expand and collapse (FR-17, UX-DR31)

**Given** the kernel `sheetState(block, cells)` with the AD-18 precedence
**When** equipment rows render
**Then** each shows a state glyph plus word: ✓ Concluída, ● Em preenchimento, ○ Vazia, ⊘ Não ensaiada with its reason, glyphs `aria-hidden`, and blocks with unconfirmed Suggestions are not counted as filled (FR-17, AR-17)

**Given** a cabine row
**When** it renders
**Then** its `meta` shows the cabine data read-only ("SE · 13,8 kV · 19 °C · 67 %" or "—" when empty) and its Overflow offers "Abrir primeira ficha" (the block `firstInTree(cabineId)`) and the *Agrupar por tipo* toggle writing `location/{id}/agrupar_por_tipo` (FR-24, AR-5)

**Given** a cabine or column
**When** the user adds, renames or reorders one from the tree (office rule, field exception)
**Then** `location/{id}` ops are emitted, moves are announced, and every block keeps its `location_id`

**Given** phone width
**When** the tree is opened
**Then** it is its own surface; on tablet and desktop inside a sheet it is the 320 px rail listing cabines and fichas only, collapsing to a 48 px strip with the vertical label "Árvore do relatório" in portrait (UX-DR74)

### Story 4.5: Add, remove, restore, duplicate and reorder equipment blocks

**Dev model:** opus · **Effort:** medium · block add, remove, restore, duplicate and four reorder paths with integrity checks

As a field engineer,
I want to add the disconnector that was not on the drawing, remove a block that does not exist, and put blocks in the order I walk,
So that the tree matches the substation and the document still prints as FO.SERV-03.

**Acceptance Criteria:**

**Given** the field Block palette (bottom sheet on phone, right drawer on tablet) opened from a tree row or "+ Adicionar bloco"
**When** it renders
**Then** it lists the 8 equipment types, each showing its suggested TAG in `meta` for the current column ("SEC-C09"), with no Section blocks and no sub-block toggles; the "Fotografar equipamento" row arrives in Epic 9 (FR-18, UX-DR29)
**And** one tap creates `equipment/{id}` and `block/{id}` in one batch, offline, with the relatório's `seed_version`, and the block prints later in tree order inside its section 9 group

**Given** the office Block palette (desktop Sumário)
**When** an equipment type is chosen
**Then** it asks TAG and location prefilled with the suggestion and the current location; inside a sheet (office) it lists the block's sub-blocks with on/off toggles writing `block/{id}/config` (FR-18)

**Given** a TAG typed that already exists in the project
**When** the user leaves the field
**Then** it is refused inline "TAG já existe nesta obra — SEC-C05 em 1° Subsolo › Coluna 5", the kernel `integrity` reports duplicates that arrive by sync as "TAG SEC-C05 duplicada — Renomear" (never a server rejection), and renaming a TAG keeps `equipment_id` (FR-7, AR-23)

**Given** a block holding data
**When** the user chooses "Remover"
**Then** a Confirm dialog names the TAG ("Remover ficha SEC-C05?"), the `remove` op sets `removed_at`, a persistent toast "Ficha removida — Desfazer" stays until dismissed or next navigation, and "Restaurar ficha removida" lists tombstoned blocks until export (FR-19, AR-19)

**Given** a block
**When** the user drags it (press and hold 300 ms), uses Overflow "Subir · Descer", presses Alt+↑/↓, or types a number in the Position box
**Then** a `block/{id}/order_key` op (fractional-indexing) is emitted, out-of-range numbers clamp, and "SEC-C09 movido para a posição 3 de 5 — Desfazer" is announced and offered (FR-19); no swipe performs any action
**And** "Duplicar" copies the `BlockConfig` (not data) and asks a new TAG; "Mover para…" is not shown until Epic 11 (hidden, never disabled)

*2026-09-24, narrowed in PR #26 (Stories 4.4 and 4.5): the office palette's sub-block toggles "inside a sheet" move to Epic 5, which builds the sheet; phone rows indent 16 px per level, following the mock's `.frame-phone` rule; the Confirm title is "Remover ficha ⟨TAG⟩?" as this AC says (EXPERIENCE.md Flow 3 adds "e seus dados"); "Agrupar por tipo" is a checkbox item in the cabine Overflow; the standalone tree route `/relatorio/:id/arvore` is reachable by address only until Epic 5 mounts the rail in a sheet; the portrait rail opens inline, not as an overlay; the field palette creates on one tap, and "Adicionar bloco em ⟨cabine⟩" targets the current coluna, without the mock's "Trocar". Opening a sheet from the tree is a stub until Story 5.1.*

### Story 4.6: Status transitions and the "relatório emitido" warning

**Dev model:** sonnet · **Effort:** medium · status transitions and a banner

As an office user,
I want the relatório's status to move forward on its own and to be warned when I edit an issued document,
So that Home always tells the truth about where each job stands.

**Acceptance Criteria:**

**Given** the AD-22 table in `packages/domain/status`
**When** any client op in the `editedSince` family set (`relatorio/setup`, `location`, `block`, `sheet`, photo `file`, `point`, `equipment`) is emitted on a relatório in Emitido
**Then** the emitting device appends `relatorio/status = Em revisão` to the same batch, computed by `statusTable`, and a later edit does not re-advance (FR-21, AR-21)

**Given** a relatório in Emitido or Em revisão after an issue
**When** the Sumário opens
**Then** the warning banner reads "Relatório emitido em dd/mm (revisão n). Alterações geram a revisão n+1." (UX-DR11)

**Given** the Status pill on the Relatório card
**When** the user chooses a backward move ("Voltar para Rascunho")
**Then** a Confirm dialog states the consequence and the transition is emitted as a client op; the server never writes `relatorio/status`

### Story 4.7: Edit a section's text inside one relatório

**Dev model:** sonnet · **Effort:** low · plain-text section editor per relatório

As an office user,
I want to adjust the fixed text of a section for this job without touching the template,
So that the objective for Porto Seguro does not change the next client's report.

**Acceptance Criteria:**

**Given** the Section text surface as in `45-secao.html`, opened from Sumário rows 2, 4, 5 and 6
**When** it renders
**Then** it shows the section's text (template default until edited) as plain text with variable chips "Inserir dado do relatório", autosaving to `block/{id}/config.text` ops of that section block, and "Restaurar texto do template" with undo (FR-12)

**Given** the template's boilerplate changes later
**When** the relatório's section is read
**Then** it keeps its own text, edited or not (FR-13)

### Story 4.8: Generate the document skeleton as a numbered DOCX revision

**Dev model:** ~~fable~~ opus *(2026-09-24, Matheus: fable replaced by opus, Opus 5.5 performs better)* · **Effort:** high · the one renderer: generate job, frozen snapshot, LibreOffice, two-pass TOC and revision transaction

As an office user,
I want to generate the relatório as a DOCX with its cover, document control page, table of contents and section texts,
So that the one renderer, LibreOffice in the container and the page-numbered contents are proven before the sheets and photos are added to it.

**Acceptance Criteria:**

**Given** the api image now carries LibreOffice 26.2 (TDF .deb) with fonts and sharp's binaries, pg-boss 12 runs in-process (`WORKER=1`) in docker-compose, and `RelatorioSnapshot` is a kernel zod schema with `toSnapshot()` in `apps/web/src/db` and `apps/api/src/sync` asserted byte-equal by the replay test (AR-14, AR-26)
**When** the user taps "Gerar relatório" on the Sumário
**Then** the Export dialog first drives the sync engine to flush ("Enviando…"), blocks while any op is pending or dead, then calls `POST /api/relatorios/{id}/generate` with `{last_op_id, file_ids_expected}`; the server answers `409 not_caught_up` until every listed op is applied and every file stored, else enqueues a `generate` job and emits `generation_job/{id}` create (`kind: issue`) (FR-62)
**And** the dialog shows "Gerando revisão n… pode fechar" with the buttons disabled and the reason, a toast when ready, and generation needs a connection and says so if offline (UX-DR58)

**Given** the generate job
**When** it runs
**Then** it freezes the snapshot at `snapshot_seq`, builds the DOCX with the `docx` library from a layout spec: A4 portrait with the source margins, header with logo, two-line form title and code plus form revision, footer with the company lines and "Página X de Y" (PAGE/NUMPAGES), the FO.SERV-03 cover with the `DADOS DO CLIENTE` table and cover photo (`print` variant), the document control page (Documento · Revisão do documento "Rev. n" · Data de emissão · Contratante with CNPJ · Contratada with CNPJ · Responsável técnico with council and number · ART/TRT · Período do serviço, "—" for missing), the static table of contents, and sections 1 to 6 and 10's fixed text with variables resolved and section 3's exclusions; sections 7, 8, 9 and 11 print their headings with "(sem conteúdo nesta revisão)" until Epics 6 and 7 fill them (FR-63, FR-64, FR-65, FR-66)
**And** it converts its own DOCX to PDF with LibreOffice headless (per-job `-env:UserInstallation`, concurrency 1), stores both as `file` rows (`kind: docx|pdf`) and emits `revision/{id}` `{number, snapshot_seq, created_by, docx_file_id, pdf_file_id}` in the transaction that stores both files, so a failed job allocates no revision number and leaves data untouched

**Given** the table of contents
**When** the job renders it
**Then** pass 1 writes the entry list with fixed-width placeholder numbers, the heading pages are read from the PDF outline, pass 2 writes them, and a third pass runs if pass-2 pages differ; a test on the seeded template asserts the printed page numbers match the headings (FR-65)

**Given** a revision exists
**When** the Export dialog renders
**Then** it lists the result row "DOCX — abrir no Word" (`GET /api/revisions/{id}/docx`; the PDF row is Epic 11), a "Revisões" list with number · date · who, and a second "Gerar relatório" with `editedSince(snapshot_seq) = false` returns the last revision instead of a new one (FR-74, FR-62)
**And** `statusTable(Em campo, generate)` yields Em revisão with a warning, and `issue` yields Emitido, emitted by the dialog as client ops (FR-21)

**Given** the renderer snapshot test
**When** the seeded template's skeleton is generated for the Porto Seguro fixture (Story 3.7)
**Then** the DOCX structure (headings, tables, header and footer text) matches the stored snapshot and the job records its duration in the structured log (NFR-17, AR-28)

**Given** testability of the generate job *(added 2026-09-21, system-level test design; see `_bmad-output/test-artifacts/test-design/fasor-handoff.md`)*
**When** the api image runs in docker-compose with `GENERATE_FAULT=libreoffice_timeout` (a flag read only when `NODE_ENV !== 'production'`)
**Then** the job fails at the conversion step, emits `generation_job/{id}/error`, allocates no revision and stores no file, and the next generate without the flag succeeds (TC-3, R-005)
**And** the job records the TOC pass count and whether pass-2 pages equalled pass-1 in the `generation_job` result so a test can assert it; the layout spec confines generation dates to named fields (revision line, Data de emissão) so the golden comparison can mask them (TC-7)
**And** Bruno reads the first generated skeleton DOCX and his remarks are recorded in this story (R-009, decision 4 of 2026-09-21)

*2026-09-24, PR #24: the skeleton DOCX and PDF of the Porto Seguro fixture for Bruno's reading are `_bmad-output/implementation-artifacts/reviews/qa-epic-4-D/porto-seguro-skeleton-rev1.docx` and `.pdf`. His remarks are pending (Matheus to collect). The "with a warning" on `generate` from Em campo is Story 4.6's banner.*

## Epic 5: Fill the equipment sheet offline

A field engineer fills a sheet with taps: cabine data once per cabine, nameplate by copy or typing, checklist with bulk actions and per-item chips, measurements typed in one continuous run against sourced criteria with pt-BR parsing and outlier hints, a suggested conclusion with device-composed text and its criteria line, Não ensaiado with a reason, attribution and autosave. The Suggestion field and Generated text field components are built here for the derived conclusion; Epic 8 wires the reading pipeline into them. Mockups: `prototype/screens/60-ficha.html`, `key-equipment-sheet.html` (tablet, phone, dark), `key-sheet-states.html` (Not tested, Suggestions pending, Draft found, Confirm dialog + Undo toast).

### Story 5.1: Open a sheet and move through its four steps

**Dev model:** sonnet · **Effort:** medium · sheet shell, stepper, sticky bar and concluded_by

As a field engineer,
I want to open an equipment sheet from the tree with its header, step counts and a sticky bar that always reaches my thumb,
So that I know where I am, what is missing and how to get to the next sheet without scrolling.

**Acceptance Criteria:**

**Given** the Equipment sheet route as in `60-ficha.html` and `key-equipment-sheet.html`, reached from a tree row, "Continuar" on Home or "Próxima ficha"
**When** it renders
**Then** the App bar title is the TAG; the Sheet header shows type + TAG (the TAG as a 48 px text button that renames keeping `equipment_id`), Cabine › Coluna, the attribution line once saved, and the Progress counter; the tree rail from Story 4.4 mounts at the left on tablet and desktop; and the sheet is single-column at every width with no hint sentence repeated from sheet to sheet (FR-17, FR-32, UX-DR33, UX-DR34)

**Given** the Sticky action bar
**When** the sheet renders on phone or tablet
**Then** the Section stepper row (Placa · Verif. · Ensaios · Conclusão with missing counts, current step marked, tapping scrolls and expands, completed steps collapse to their title once left) sits above the button row with the Camera capture button slot at the left (empty until Epic 6; nothing disabled is shown), the primary "Próxima ficha" / "Concluir ficha" / "Próxima coluna" on the last sheet of a column, and the bar sits above the keyboard and unsticks below a 480 px viewport (UX-DR16, UX-DR35)

**Given** the kernel `progress(snapshot, blockId)` counting unset checklist rows, required measurements, the conclusion and required observations, with unconfirmed suggestions counting as empty
**When** the user taps "Concluir ficha"
**Then** with Progress = Completa it emits `block/{id}/concluded_by = {actor_id, at}` and moves to the next sheet in tree order; otherwise it jumps to the first missing field of the first incomplete step and concludes nothing (FR-29, FR-32, AR-17)
**And** the sheet header shows "Preenchido por ⟨nome⟩ · dd/mm hh:mm" from `last_modified_by` and, once concluded, the concluded-by line

**Given** every field on the sheet
**When** a value is committed
**Then** it is a `sheet/{blockId}/...` op per Story 1.4 with no Save button, a visually hidden "Salvo" status is announced at most every few seconds, and reopening after a closed tab offers "Rascunho encontrado — Recuperar" for uncommitted text (FR-32, FR-61)

### Story 5.2: Record the cabine's characteristics and test environment once

**Dev model:** sonnet · **Effort:** medium · cabine block edited in one place, read-only elsewhere, copy chip

As a field engineer,
I want to enter the substation type, voltages, power, temperature and humidity once per cabine on its first sheet,
So that every other sheet of the cabine shows them and the document prints them once.

**Acceptance Criteria:**

**Given** the block computed by `firstInTree(cabineId)`
**When** its sheet opens
**Then** it shows the "Da cabine" block above the nameplate with `TIPO DE SE` as a select (SIMPLIFICADA - POSTE · ALVENARIA - CONVENCIONAL · BLINDADA), `TENSÃO PRIMÁRIA`, `TENSÃO SECUNDÁRIA`, `POTÊNCIA INSTALADA`, and `AMBIENTE DE ENSAIO` with `ALTITUDE` read-only from setup, `TEMPERATURA` and `UMIDADE RELATIVA DO AR`; edits emit `location/{id}/se/{field}` and `location/{id}/env/{field}` ops on the cabine, never on the sheet (FR-24, AR-5)

**Given** any other sheet of the same cabine, and the cabine's tree row
**When** they render
**Then** the same values appear as Read-only fields under the same label (UX-DR49)

**Given** a previous cabine in the relatório (previous root node by `order_key`) with temperature and humidity
**When** the user taps the chip "Copiar da cabine anterior"
**Then** both values are written as plain ops with the toast "Copiado de ⟨cabine⟩ — Desfazer" (FR-24)

**Given** humidity above the configured threshold
**When** the value is committed
**Then** the sheet-level "Observações rápidas" chip row surfaces the standard rain/humidity note first

### Story 5.3: Fill the nameplate by copy or by typing

**Dev model:** sonnet · **Effort:** medium · nameplate fields by kind and two copy chips

As a field engineer,
I want an empty nameplate to offer a one-tap copy before a keyboard, and typing only as a fallback,
So that the plate costs me a glance, not twelve fields.

**Acceptance Criteria:**

**Given** an Equipment block whose nameplate group is empty
**When** the sheet renders
**Then** the group shows the copy chips when they apply and "Digitar" as a text link that reveals the fields; the full-width dashed tile "Fotografar placa" is added above them by Epic 8 and is not shown before (hidden, never a placeholder), so the mock's tile appears exactly when it works (FR-23, UX-DR17)

**Given** the field definitions of the block type at its `seed_version`
**When** the fields are shown
**Then** each renders by kind: text, number with its unit in the suffix slot and `inputmode="decimal"`, date, select with the seed options, manufacturer and voltage class as the chip row plus "Outro…" of Story 2.5; values are stored per AR-10 (`{raw, unit, state}` for numbers) as `sheet/{blockId}/nameplate/{fieldKey}` ops (FR-23, AR-10)

**Given** another block of the same type and manufacturer in this relatório has a filled plate (kernel `suggestNameplateCopy`)
**When** the empty group renders
**Then** the chip "Igual à ⟨TAG⟩?" copies every field as plain ops with the toast "Copiado de ⟨TAG⟩ — Desfazer" (FR-34)

**Given** the block's Equipment row has `last_nameplate ≠ null` (written by Epic 7 at issue)
**When** the empty group renders
**Then** the chip "Copiar da última visita (⟨TAG⟩)" copies only the keys present in the target block's definition at its `seed_version`, reports "N campos copiados", and never fetches (FR-34, AR-24)

### Story 5.4: Mark the checklist with taps, not typing

**Dev model:** sonnet · **Effort:** medium · tri-state rows, NC expansion, bulk actions with undo

As a field engineer,
I want to set C, NC or NA per item, mark all the rest as Conforme in one tap, and pick an NC observation from chips,
So that on a conforme sheet I touch only the rows that are not.

**Acceptance Criteria:**

**Given** the checklist of the block type with the subtype's `na_defaults` pre-marked NA and nothing pre-marked C
**When** rows render
**Then** each 56 px Checklist row shows number + wrapping item text, the Tri-state control (three 56 px segments, `radiogroup` with full-word names, letters in `heading` weight, arrow keys move, Delete/Backspace and Overflow "Limpar" clear, re-tapping a selected segment does nothing) and an Overflow with the optional observation; the legend heads the first checklist of the session only, then a "?" text button reveals it (FR-25, UX-DR37, UX-DR38)
**And** each result is a `sheet/{blockId}/checklist/{itemKey}/result` op committed immediately

**Given** a row set to NC
**When** it expands
**Then** it shows the item's pre-seeded chips plus the five most recent values typed for that item in this relatório (text chips inserting at the caret without duplicating), the Dictation button hidden (no engine), the Observation field with the red required border and "Obrigatória em item não conforme" as `aria-describedby`, and the row slot for the two secondary buttons "Adicionar foto" and "Criar ponto de atenção", which Epic 6 adds; until then the row shows no button (hidden, never disabled) (FR-25, UX-DR44)

**Given** the Bulk action bar at the head of the list, mirrored as the Sticky action bar's secondary while the checklist is on screen
**When** the user taps "Marcar os restantes como Conforme"
**Then** every unset row becomes C in one batch (NC rows and NA defaults untouched), the persistent toast "11 itens marcados Conforme — Desfazer" appears, and rows set this way look exactly like tapped rows (FR-26, UX-DR36)

**Given** a concluded sheet of the same type exists in this relatório
**When** the user taps "Repetir da ficha anterior do mesmo tipo"
**Then** only the tri-state pattern is copied (never observations or photos) with the same undo; both bulk actions are `aria-disabled` with the reason beside them when nothing applies ("Todos os itens já estão marcados"; "Nenhuma ficha deste tipo concluída") (FR-26)

### Story 5.5: Type a reading with its unit and see it judged against the criterion

**Dev model:** ~~fable~~ opus *(2026-09-24, Matheus: fable replaced by opus, Opus 5.5 performs better)* · **Effort:** high · pt-BR parsing and criterion comparison are safety-critical; a wrong parse is a wrong signed value

As a field engineer,
I want to type each reading with its unit, see it parsed the Brazilian way, and be told when it is outside the criterion or wildly off its neighbours,
So that I judge the equipment on the spot and never sign a misread digit.

**Acceptance Criteria:**

**Given** a Measurement table of the block type (real table with header cells at every width; `1 minuto` as the single value column on plain insulation, `Valor` on contact tables; only TTR tables stack into cards on phone; tests stack, never side by side; nothing clipped)
**When** it renders
**Then** the caption shows the criterion value (">400 MΩ") with a 48 px chevron revealing its source ("aceitável na ficha"), the Instrument picker sits in the header, the action row holds the Read display and Dictation buttons hidden until their epics, and calculated cells render read-only in `ink-secondary` with a "calc." mark announcing "calculado" (FR-27, UX-DR40)

**Given** `packages/domain/parse` and `format`
**When** the user types into a Measurement field (`inputmode="decimal"`)
**Then** the comma is the decimal separator, a dot followed by exactly three digits and no comma is a thousands separator ("3.300" → 3300), any other dot is a decimal ("3.7" → 3,7), a unit suffix sets the unit slot ("147G" → 147 GΩ, "330M", "3.7T"), otherwise the unit defaults from the previous row of the same table, and the `meta` echo line shows "= 3.300 MΩ" while typing before any comparison (FR-27, AR-10)
**And** the unit slot is a ≥ 48×56 px tap-cycle toggle MΩ → GΩ → TΩ with an M · G · T chip row above the keypad on phone; the spoken unit name is the slot's label

**Given** a value committed
**When** `compareCriterion` fails it
**Then** the field takes the amber fill and border with the helper "Abaixo do aceitável (>400 MΩ)" and a text button "Marcar Com restrições" that only sets the Conclusion control if tapped; red is never used (FR-27, UX-DR39)

**Given** a value at least 100× apart from the other rows of the same table (kernel outlier check)
**When** it is committed
**Then** a neutral field shows the helper "Fase C 1000× abaixo de A e B. Conferir?" in `fora-do-limite`, announced once on blur via `role="status"`, never a block (FR-28)

### Story 5.6: Type all of a sheet's readings in one continuous run

**Dev model:** opus · **Effort:** medium · continuous keyboard run across tables, not-measured state, calculated cells

As a field engineer,
I want Enter to carry me down every table of the sheet, a way to say a cell was not measured, and the calculated cells to fill themselves,
So that the nine readings of a seccionadora are one pass with no tap on the screen.

**Acceptance Criteria:**

**Given** the keyboard
**When** the user presses Enter on a cell
**Then** focus moves down the column and, after the last row, to the first empty cell of the next table on the sheet; Shift+Enter goes back; Tab moves right; Enter on the last cell of the last table focuses "Próxima ficha" (FR-27, UX-DR72)

**Given** a cell
**When** the user chooses "Não medido" from its Overflow
**Then** the cell stores `state: not_measured` and prints "-", distinct from empty which prints "—" (FR-27)

**Given** a ratio test
**When** the nameplate voltages or currents and the measured values exist
**Then** `VAL CALCULADO` is computed by the kernel from the nameplate (Vp/Vs, Ip/Is, per TAP for the transformer), `CONDIÇÕES` prints "SATISFATÓRIO" when |medido − calculado| / calculado is within the criterion, recomputes live, and neither is ever typed (FR-27)

### Story 5.7: Pick the instrument by its code

**Dev model:** sonnet · **Effort:** low · instrument picker with copied header

As a field engineer,
I want to select "2E" and have the whole instrument header filled on the table,
So that the data typed 94 times today costs one tap per test.

**Acceptance Criteria:**

**Given** the Instrument picker
**When** the user picks a code ("2E")
**Then** one `sheet/{blockId}/test/{testKey}/instrument` op stores the copied header `{instrument_id, code, manufacturer, model, serial, cert_number, calibrated_at, valid_until, test_parameter}`, the field shows "2E — Megôhmetro" with details behind a chevron, an expired instrument shows "Calibração vencida em dd/mm/aaaa" and is never blocked, and the last code used per test type is remembered within the relatório (FR-3, AR-18, UX-DR42)

**Given** no instrument is registered
**When** the picker opens
**Then** it shows "Nenhum instrumento cadastrado" with "Cadastrar instrumento", which opens Registries and works offline (UX-DR42)

### Story 5.8: Conclude the sheet with one tap and a text the app wrote from its own values

**Dev model:** ~~fable~~ opus *(2026-09-24, Matheus: fable replaced by opus, Opus 5.5 performs better)* · **Effort:** high · suggested pair, device-composed conclusion text with basis hash and the shared Suggestion field

As a field engineer,
I want the app to suggest Aprovado or Com restrições from what the sheet already says and to draft the conclusion paragraph with its basis listed,
So that concluding costs two taps and the paragraph is auditable.

**Acceptance Criteria:**

**Given** the Conclusion control (two stacked 56 px `radiogroup`s Aprovado | Reprovado and Sem restrições | Com restrições with full-word names, inner ring and ✓ on selection, Delete clears)
**When** no segment is set
**Then** the kernel `suggestConclusionPair(sheet)` renders the amber suggestion row: all rows C or NA and all readings within criterion → "Aprovado · Sem restrições?", any NC row or out-of-criterion reading → "Aprovado · Com restrições?"; Reprovado is never suggested; one tap on the row emits both `sheet/{blockId}/conclusion/result` and `/restriction` ops; the row disappears once any segment is set (FR-29, UX-DR43)
**And** the Suggestion field visual (amber fill, "Sugerido" pill, "Confirmar" action) is built here as the shared component with an empty crop slot for Epic 8

**Given** Com restrições is set
**When** the sheet Observation field is empty
**Then** it shows the required border and "Obrigatória com restrições"; Sem restrições with any NC row shows the inline warning "Há itens não conformes" and is allowed (FR-29, UX-DR44)

**Given** the pair is set and the kernel `composeConclusion(sheet, definition)` with one fixed template per block type
**When** the Conclusão step renders
**Then** the Generated text field "Texto da conclusão" shows the paragraph composed on the device from nameplate identity, out-of-criterion readings with their criteria, NC items with their observations and the matching recommendation (for a seccionadora: "A seccionadora SEC-C05 (Celtta, 15 kV, 630 A) apresentou resistência de isolação mínima de 330 MΩ … Recomenda-se …"), with the Criteria line beneath ("R_iso A–B 330 MΩ · critério ≥ 400 MΩ · item 8 NC") as its `aria-describedby`; no network call happens (FR-30, UX-DR46, UX-DR47)

**Given** the text is unconfirmed
**When** sheet values change
**Then** it recomposes silently; "Confirmar" emits `conclusion/text`, `text_status = confirmed` and `text_basis` (hash of the inputs); "Editar" opens typing and stops recomposition (`text_status = edited`); after confirmation a later change shows "Sugerido: texto atualizado — Substituir" beneath and never overwrites (FR-30, AR-11)
**And** an unconfirmed text does not block "Concluir ficha" and the kernel marks it "not printable" for the renderer

### Story 5.9: Mark an equipment as not tested

**Dev model:** sonnet · **Effort:** medium · not-tested state with precedence and read-only fields

As a field engineer,
I want to mark a piece of equipment as present but not tested, with the reason,
So that it prints its nameplate and reason and lists itself in section 8 without me remembering to write it.

**Acceptance Criteria:**

**Given** the sheet action "Não foi ensaiado" and the Block card Overflow "Marcar não ensaiado"
**When** the user taps it
**Then** a chip row shows the seed reasons Impossibilidade de desligamento · Solicitação do cliente · Outro (text field), the last reason used in this relatório preselected, and the choice emits `block/{id}/not_tested = {reason, text?, at, by}` (FR-31, AR-17)

**Given** a Não ensaiada sheet
**When** it renders
**Then** the Not-tested band at the top shows the reason in `body` with "Desfazer" (no dialog while offline and unsynced, Confirm dialog after sync), the nameplate, checklist and tests become Read-only fields with `aria-readonly` while photos and the observation stay editable, the tree row and Block card show the Not-tested chip, and `sheetState` returns Não ensaiada with precedence over every other state (FR-31, UX-DR48, UX-DR49)

**Given** `progress` and `preIssue`
**When** a sheet is Não ensaiada
**Then** it counts as complete and is listed in the Sumário's "não ensaiadas" count, never as "não concluída" (FR-31, FR-73)

## Epic 6: Photos and points of attention

A user shoots bursts from any surface with no composer, imports photos during or after the visit with one "De qual equipamento?" tap, and every photo carries a context caption, a date, time and coordinate stamp, a place in the chronological gallery and a provisional number; no photo is ever lost and storage pressure is warned before capture is refused. Findings are recorded from an NC row or the points surface with photo tokens and chips; untested equipment lists itself. Mockups: `prototype/screens/70-fotos.html`, `71-legenda.html`, `72-pontos.html`, `key-photos.html`, `key-points-of-attention.html` (priority controls in the mock are post-MVP and not built here).

### Story 6.1: Shoot photos in a burst from any surface, captioned from where I stand

**Dev model:** opus · **Effort:** medium · camera capture, on-device re-encode, EXIF, geolocation and context captions

As a field engineer,
I want the camera to open directly from the sticky bar or an NC row and keep shooting until I say stop,
So that every photo is saved on the spot with a caption I did not have to type.

**Acceptance Criteria:**

**Given** the Camera capture button (56 px, `aria-label` "Tirar foto") in the sheet's Sticky action bar, the NC row's "Adicionar foto" and the gallery header
**When** the user taps it
**Then** the device camera opens directly (`capture` attribute, no chooser), stays open after each shot until "Concluir fotos" with a count badge on the button, and no caption composer opens; the nameplate tile uses the single-shot variant (FR-43, UX-DR17)
**And** camera permission denied shows the reason and the OS path under the button with "Adicionar fotos" still available, never a silent no-op

**Given** each shot
**When** it is taken
**Then** the image is re-encoded on the device to JPEG, long edge ≤ 2560 px, quality 0.85, EXIF orientation applied, EXIF time parsed; a `file/{id}` create op of kind `photo` (`scope: relatorio`) with `{captured_at, tz_offset, local_seq (per-device counter), coords?, block_id?, item_key?, caption, reading_status: none}` is emitted in one batch with the Blob written to IndexedDB in the same transaction; the device makes its own `thumb` at capture (FR-44, AR-6, AR-16)
**And** when the account's `photo_location_enabled` is on (default true) the Geolocation API is queried at capture with a 5 s timeout and `coords = {lat, lng, accuracy_m, source: geolocation}`; denial leaves coords absent and marks the account row for Epic 11's switch surface; the OS prompt appears at the first capture after sign-in

**Given** the kernel `contextCaption(photo, snapshot, registryMeta)`
**When** a photo is taken from a sheet
**Then** its caption is written as a plain editable value: equipment and location from the sheet, activity from the section on screen (an NC row → "verificação de ⟨item⟩", a test table → that test), composed as "Detalhe d⟨o/a⟩ ⟨atividade⟩ realizad⟨o/a⟩(s) n⟨o/a⟩ ⟨equipamento⟩ d⟨o/a⟩ ⟨local⟩" with gender and number from registry metadata (FR-39)
**And** a photo from an NC row keeps `item_key` and shows as a Photo tile row under the row's buttons with its caption in `meta` (FR-44)

### Story 6.2: No photo is ever lost

**Dev model:** opus · **Effort:** high · photo durability: upload order, retry, eviction policy and storage pressure

As a field engineer,
I want every photo kept on the device until the server has it, uploaded by itself and retried on its own tile,
So that three days in a basement never cost a single image.

**Acceptance Criteria:**

**Given** the uploader from Story 2.2 extended for photos
**When** a sync cycle runs
**Then** files upload in the order: files with a pending reading first (Epic 8), then photos by `captured_at`, then other kinds, two in flight; the server makes `thumb` (≤ 512 px) and `print` (≤ 2000 px, JPEG q85) with sharp, stores the object at `company/{cid}/relatorio/{rid}/photo/{id}` and emits `file/{id}/uploaded_at` and `file/{id}/variants` as `system:files` ops; the device replaces its thumb with the server's on pull (FR-56, AR-6)

**Given** a photo whose upload was rejected or failed
**When** its tile renders
**Then** the pill under the tile reads "Erro — Tentar novamente" (red outline, ≥ 48 px, the pill is the retry button) while pending photos read "Aguardando envio" (amber); the gallery header counts "3 fotos aguardando envio"; other photos keep uploading (FR-56, UX-DR50)

**Given** the server acknowledged a photo
**When** local storage is under pressure
**Then** the local original is marked `acked`, evicted oldest-acked first only under pressure, and wholesale when the relatório leaves Rascunho or Em campo on this device; a never-acked original is never evicted (AR-6)

**Given** `navigator.storage.estimate()` reports under 500 MB free (provisional)
**When** any surface renders
**Then** the global banner "Pouco espaço neste aparelho (⟨n⟩ MB). Sincronize para liberar." appears, capture is still attempted, and on a browser refusal the photo is uploaded immediately when online, else kept in memory for one retry with the error toast; captured photos remain safe (FR-57, AR-7)

**Given** the Playwright scenario "network dropped mid-upload"
**When** it runs with photos in the queue
**Then** the upload resumes on reconnection, `PUT /api/files/{id}` with the same `sha256` is idempotent, and no photo is duplicated or lost (FR-56, NFR-17)

### Story 6.3: See every photo in one chronological gallery with its stamp and provisional number

**Dev model:** sonnet · **Effort:** medium · gallery, viewer, stamp and provisional numbering

As a user,
I want the relatório's photos in capture order with their stamp, caption and upload state, filterable by cabine, openable in a viewer,
So that the gallery is section 7 before it is printed.

**Acceptance Criteria:**

**Given** the gallery as in `70-fotos.html` and `key-photos.html`, opened from Sumário row 7
**When** it renders
**Then** tiles (96 px) are sorted by `(captured_at, device_id, local_seq)`, each with the number badge (provisional until export, computed by the kernel `numberPhotos(snapshot)`), the Photo stamp line "dd/mm hh:mm" with a 16 px pin glyph whose accessible text is "GPS" when coords exist, the caption in `meta` (two lines, ellipsis) and the upload pill; Filter chips by cabine with "Todas" first and exactly one pressed announce "Mostrando 4 fotos do Cubículo Enel"; the empty state reads "Nenhuma foto. Tire fotos a partir da ficha do equipamento para já sair com legenda." (FR-45, FR-47, FR-48, UX-DR25, UX-DR52)

**Given** a tile
**When** tapped
**Then** the Photo viewer opens full-screen on the dark surface with back and number, "Anterior / Próxima" buttons walking the gallery in order, the full stamp "dd/mm/aaaa hh:mm · −23,5505, −46,6333" in `body`, the linked checklist status line ("Item 8 · Contatos · NC") when the photo belongs to a row, "Editar legenda" and "Remover" (Confirm dialog; the photo is tombstoned and recoverable like a block); Esc/back closes and focus returns to the tile (FR-45, UX-DR51)

**Given** the same photo object
**When** its caption is edited from the sheet or from the gallery
**Then** one `file/{id}/caption` op updates both places (FR-44)

**Given** the Sumário row 7
**When** it renders
**Then** its status reads from `preIssue`: "82 fotos · 1 sem legenda" and "3 aguardando envio"

### Story 6.4: Add photos after the visit or from someone else's phone

**Dev model:** sonnet · **Effort:** medium · import path with batch caption

As an office user,
I want a visible "Adicionar fotos" button on every sheet and in the gallery, with drag-and-drop on a computer,
So that Eduardo's twelve photos and my late shots slot into section 7 by their capture time with a caption decided at upload.

**Acceptance Criteria:**

**Given** the secondary outline button "Adicionar fotos" beside the Camera capture button on every sheet and in the gallery header
**When** the user taps it (or drops files on a sheet or the gallery on a computer, which shows the dashed `primary` outline and "Solte para adicionar")
**Then** the Photo capture sheet opens with "Escolher arquivos" (multiple; the OS gallery on phone and tablet), each file is saved locally at once as a photo `file` with EXIF time and GPS kept when present (`coords.source: exif`) and HEIC converted to JPEG on the device, and the batch enters the same upload queue (FR-43, UX-DR53)

**Given** files added from a sheet
**When** they are saved
**Then** they take that sheet's context caption and `block_id` (FR-39)

**Given** a batch added from the gallery
**When** the capture sheet continues
**Then** one step "De qual equipamento?" shows the Relatório tree as a picker plus "Geral"; the tap fills a caption field for the whole batch with that equipment's context caption, which the user keeps or types over (the Dictation button appears here in Epic 9), "Geral" leaves it empty, and "Adicionar N fotos" commits; the batch reorders itself into the gallery by capture time and provisional numbers redraw (FR-43, FR-48)

### Story 6.5: Change a caption from chips or free text

**Dev model:** sonnet · **Effort:** low · caption composer

As a user,
I want to open a composer only when I choose to change a caption, with the activity, equipment and location as chips,
So that fixing one caption costs a tap, not a sentence.

**Acceptance Criteria:**

**Given** "Legendar" on a Photo tile, in the viewer or on a gallery batch
**When** the Caption composer as in `71-legenda.html` opens
**Then** it shows three rows Atividade · Equipamento · Local as wrapping Chip rows of recent values plus "Outro…" on field surfaces (Comboboxes on desktop), Equipamento and Local prefilled from the photo's sheet and Atividade from its section, a preview block rebuilding the sentence with agreement from registry metadata, and "Editar texto" switching to free text that stops regenerating; the composer never opens automatically (FR-46, UX-DR54)

**Given** the Atividade and Local seed lists
**When** the chip rows render
**Then** they offer the five most recent values used in this relatório followed by the seed values, ending in "Outro…"

### Story 6.6: Record findings that print as section 8, with untested equipment listing itself

**Dev model:** opus · **Effort:** medium · points with photo tokens, derived untested entries and reorder

As a field engineer,
I want to create a point of attention from an NC row with its photo already linked, or from the points surface, and insert recurring findings from chips,
So that section 8 is written on site and never forgets an untested equipment.

**Acceptance Criteria:**

**Given** the Points surface as in `72-pontos.html` (Sumário row 8) and the `point` entity `{id, relatorio_id, text, equipment_id?, action, order_key, origin?, priority?, deadline?, owner?, removed_at?}` where priority, deadline and owner have no surface in the MVP
**When** the user taps "Criar" or the NC row's inline "Criar ponto de atenção"
**Then** a Point of attention card opens with text, Ação recomendada and the equipment or TAG (pre-linked with the row's photo and equipment from an NC row; focus returns to the row on save), and the empty state reads "Nenhum ponto de atenção." with "Criar" (FR-49, UX-DR55)

**Given** the text field
**When** the user picks a photo from the gallery picker
**Then** a token `[[foto:<photo_id>]]` is inserted and rendered as a chip showing the photo's provisional number; free text can never embed a literal number; the kernel `extractPhotoRefs(text)` returns the ids and `preIssue` flags a token whose photo is tombstoned (FR-48, AR-25)

**Given** the quick chip row on the text field
**When** a chip is tapped ("Ausência de placas de sinalização de segurança", "Diagrama unifilar desatualizado", and the other recurring findings seeded)
**Then** it inserts editable plain text at the caret (FR-53)

**Given** cards in the list
**When** the user reorders them by drag, Overflow "Subir · Descer" or Alt+↑/↓
**Then** `point/{id}/order_key` ops are emitted, the move is announced, and the order is section 8 order (FR-49)

**Given** the kernel `derivedPoints(snapshot)`
**When** the Points surface or `preIssue` runs
**Then** every block in `not_tested` state appears after the manual points in tree order as a read-only derived entry with its reason and justification text, never stored; a point created from an untested sheet with `origin: not_tested` suppresses the derived entry (FR-51, AR-25)
**And** the Sumário row 8 reads "5 pontos · 1 sem ação · 3 não ensaiadas"

## Epic 7: Generate the FO.SERV-03 relatório

An office user sets the parecer, sees every outstanding condition on the Sumário rows and in the Export dialog (one blocking row), previews the document with a RASCUNHO watermark, and generates a numbered revision as DOCX and PDF from application data, extending the renderer born in Story 4.8 with sections 7 to 11. The loop closes. Mockups: `prototype/screens/73-exportar.html`, `key-export.html`, `50-relatorio-setup.html` and `key-relatorio-setup.html` (the "Conclusão e parecer" band).

### Story 7.1: Print the equipment sheets as native tables grouped as FO.SERV-03

**Dev model:** ~~fable~~ opus *(2026-09-24, Matheus: fable replaced by opus, Opus 5.5 performs better)* · **Effort:** max · section 9 rendering: grouping scheme, pairing, five-column grid, units, conclusion text rules; the moat of the product

As a field engineer,
I want my 94 sheets to print as real tables in the order the form reads, with the criterion beside each value,
So that the client gets the company's own section 9 and I can still edit it in Word.

**Acceptance Criteria:**

**Given** the kernel `groupForPrint(snapshot, scheme)` with `scheme` stored per relatório by `relatorio/export/scheme` (default `por_local_e_tipo`, `ordem_de_campo` as the base case) and captured in the snapshot
**When** the generate job renders section 9
**Then** cabines print in tree order; a cabine with `agrupar_por_tipo` off is one subsection titled with its name holding its sheets in tree order; a cabine with it on yields subsections in the fixed order Seccionadoras › Disjuntores › TP's e TC's (per-column pairs) › Transformadores e Cabos de Alimentação (paired by `feeds_block_id`, an unpaired cable at the end with an `integrity` warning), empty groups skipped, para-raios and cabos inside the Seccionadoras group; titles follow "⟨Tipo plural⟩ dos Cubículos de MT d⟨o/os⟩ ⟨cabine⟩" and "Transformadores e Cabos de Alimentação d⟨o⟩ ⟨cabine⟩"; the renderer never reorders the tree (FR-68, FR-72, AR-15)
**And** a kernel test proves `ordem_de_campo` yields one subsection per cabine in tree order and that `por_local_e_tipo` is built on it

**Given** one equipment block
**When** its sheet prints
**Then** the title is type + role + TAG, the attribution line prints concluded-by with its time falling back to last-modified-by, the first sheet of each cabine (whichever `groupForPrint` emits first) carries the `CARACTERÍSTICAS DA SE` and `AMBIENTE DE ENSAIO` block, the nameplate prints its fields with units, the checklist prints in the normalized column order, each test prints its instrument header (copied values, certificate under `RBC:`), the criterion with its source, the full five-column insulation grid with the captured `1 MINUTO` and "-" elsewhere, each value with its own unit (a mixed column prints "VALORES" without a unit), `VAL CALCULADO` and `SATISFATÓRIO` from the kernel, the Conclusão row with the result pair and, only when `text_status = edited` or `text_basis` equals the current hash, the conclusion text with its Criteria line beneath (FR-68, AR-11)
**And** sub-blocks with `enabled = false` are omitted, a Não ensaiada sheet prints nameplate and reason band only, unconfirmed Suggestions never print, and the four uncaptured grid columns are not sub-blocks

**Given** the renderer snapshot test on the Porto Seguro fixture (Story 3.7)
**When** it runs
**Then** section 9's structure matches the stored snapshot and the Sumário row 9 status comes from the same `preIssue` (NFR-17)

### Story 7.2: Print the photo record and the photos beside their equipment

**Dev model:** opus · **Effort:** medium · section 7 numbering and photos inside sheets

As a field engineer,
I want section 7 numbered automatically in capture order and each equipment's photos inside its own sheet,
So that "conforme Imagem 5" is always right and the evidence sits next to the test it supports.

**Acceptance Criteria:**

**Given** the kernel `numberPhotos(snapshot)` over the sort key `(captured_at, device_id, local_seq)`
**When** the generate job renders section 7
**Then** photos print two per row in that order with "Imagem NN: ⟨caption⟩." beneath, the stamp line "dd/mm/aaaa hh:mm · lat, lng" (coordinates at 4 decimals only when present), a checklist-linked photo adding "Item 8 · Contatos · NC", the `print` variant embedded and never the original; numbers are frozen with the revision (FR-48, FR-67, AR-16)

**Given** photos linked to an equipment block
**When** its sheet prints in section 9
**Then** they print inside that sheet beside the tables they belong to with their captions and numbers (FR-68)

**Given** a revision was issued and a photo was added afterwards
**When** the gallery renders
**Then** numbers show as provisional again and the Sumário banner from Story 4.6 names the next revision (FR-48)

### Story 7.3: Print the points of attention and the certificates

**Dev model:** opus · **Effort:** medium · section 8 token resolution and section 11 certificate rasterization

As a field engineer,
I want section 8 to print my findings as bullets with resolved photo numbers followed by the untested equipment, and section 11 to carry the certificates of every instrument I used,
So that the report is complete without me assembling anything.

**Acceptance Criteria:**

**Given** the kernel `resolveSection8(snapshot, numbering)` and `derivedPoints`
**When** the generate job renders section 8
**Then** manual points print as bullets in the source's prose form with each `[[foto:id]]` token replaced by "Imagem NN" in order of first appearance, then the derived Não ensaiado entries in tree order with the reason and its justification wording; no table prints in the MVP (FR-51, FR-69, AR-25)

**Given** the kernel `section11Instruments(snapshot)` as the union of instruments referenced by any sheet's copied header and those checked at setup
**When** the generate job renders section 11
**Then** each instrument's certificate file prints as full-page images (PDF certificates rasterized page by page with LibreOffice at 150 dpi; images with sharp), a `cert_number` mismatch between the sheet's copied header and the registry is flagged by `integrity`, and a missing certificate file prints a placeholder line and warns at pre-issue (FR-70, AR-18)

### Story 7.4: Set the parecer and print section 10 with the signature block

**Dev model:** opus · **Effort:** medium · parecer suggestion, composed summary and section 10

As an office user,
I want to choose the relatório's verdict, confirm a summary composed from its own counts, and see section 10 print the parecer, the fixed bullets, the validity line and the signature block,
So that the document carries my opinion in my words and nothing the app decided for me.

**Acceptance Criteria:**

**Given** the "Conclusão e parecer" band of Relatório setup (Sumário row 10) with a segmented triple Apto · Apto com restrições · Não apto (`radiogroup`, nothing preselected)
**When** it renders
**Then** the kernel `suggestParecer(snapshot)` shows the amber suggestion line beneath: every sheet Aprovado sem restrições → "Apto?", any Com restrições, NC or Não ensaiado → "Apto com restrições?", Não apto never suggested; one tap emits `relatorio/setup/parecer` and reveals the Generated text field with `composeParecer(snapshot)` (counts of fichas concluídas, com restrições, NC by item, não ensaiadas with reasons, pontos de atenção) and its Criteria line; "Confirmar", "Editar" and "Substituir" behave as in Story 5.8; the Parecer box takes its verdict tone only once set (FR-71, UX-DR68)

**Given** the generate job
**When** it renders section 10
**Then** it opens with the Parecer box (verdict word as title, confirmed summary), then the three fixed bullets, the validity line "Este relatório tem validade apenas acompanhada da ART ⟨n⟩" or "… da TRT ⟨n⟩" by council, and the signature block with name, title by council ("Eng. Eletricista" / "Técnico(a) em Eletrotécnica") and registration; no signature image (FR-69)

### Story 7.5: See what is outstanding, preview as RASCUNHO, and issue the revision

**Dev model:** ~~fable~~ opus *(2026-09-24, Matheus: fable replaced by opus, Opus 5.5 performs better)* · **Effort:** high · complete preIssue, the identity test, preview job and last_nameplate projection

As an office user,
I want every outstanding condition on the Sumário rows and summarized in the Export dialog, a preview I can read as the client will, and one button that issues the revision,
So that the only thing that can stop me is a missing parecer.

**Acceptance Criteria:**

**Given** the kernel `preIssue(snapshot)` completed with every row: sheets not concluded, sheets not tested with reasons, concluded sheets whose text was never confirmed, photos without captions, sheets with unconfirmed readings, missing ART or TRT number, instruments expired or expiring, missing razão social or logo, blank contratante CNPJ, points without action, tombstoned photo tokens, duplicate TAGs, rejected changes ("N alterações rejeitadas — Reenviar"), unresolved section variables, and each user's last send time; exactly one row is `blocking: true` ("Parecer não preenchido")
**When** the Sumário and the Export dialog render
**Then** the Sumário rows show their rows' text, the Export dialog as in `73-exportar.html` shows "N avisos — estão nas linhas do sumário" with "Ver no sumário" (returns highlighting those rows) plus the one blocking row in red with "Editar em Dados do relatório" (opens the band and returns), "Gerar relatório" is `aria-disabled` with that reason while it blocks, and every other condition generates and prints its consequence (FR-73, UX-DR58)
**And** the AD-2 test computes the Sumário rows on a Dexie store and the pre-issue list on Postgres for the Porto Seguro fixture (Story 3.7) and asserts identical output

**Given** the Export dialog
**When** it renders
**Then** it states "Seção 9 impressa no agrupamento do FO.SERV-03" as a fact with no option, shows the read-only Document control summary (`dl` semantics, UX-DR67) with "Editar em Dados do relatório", the result row "DOCX — abrir no Word" (the row "PDF — enviar ao cliente" is added by Epic 11 and not shown before), a share button on mobile, and the "Revisões" list with number · date · who and both download glyphs; generation failed shows an inline error with "Tentar novamente" and nothing changed (FR-72, FR-74, FR-62)

**Given** "Pré-visualizar"
**When** tapped online
**Then** `POST /api/relatorios/{id}/preview` runs the identical job with `kind: preview`, a RASCUNHO watermark as a behind-text anchored image on every page and no revision number, stores a `file` of kind `preview` referenced by `relatorio/preview_file_id` (system op), serves it at `GET /api/relatorios/{id}/preview.pdf` in a new tab, changes no status, and the button reads "Gerando rascunho…" meanwhile; one test asserts preview and issued output differ only by the watermark and the revision line (FR-73, AR-14)

**Given** a revision is stored
**When** the job commits
**Then** it also emits `equipment/{id}/last_nameplate = {relatorio_id, revision_number, issued_at, seed_version, block_type, fields}` as a `system:generate` op for every equipment block with a nameplate, so "Copiar da última visita" works on the next relatório of the project (FR-34, AR-24)
**And** the Export dialog emits `relatorio/status = Emitido` on issue; SM-C1 instrumentation counts confirmed cells later edited over the ops table (AR-28)

## Epic 8: Nameplate from a photo (the reading pipeline)

A field engineer photographs a nameplate, the photo is kept and queued offline, the backend reads it through a real OCR layer and an LLM structuring step, and every field comes back as an amber Suggestion with its crop, grounded by digit coverage and cross-checked against the registries. The whole pipeline runs off-cloud in the MVP: `LLM_PROVIDER=fake` replaying fixtures and the `services/ocr` PaddleOCR sidecar in docker-compose as the local `OcrProvider`; the real Claude call and Textract are Epic 11 stories. Mockups: `key-sheet-states.html` (Suggestions pending, Photo queued for reading, Reading failed), `key-equipment-sheet.html` (nameplate group states), `85-sync.html` (readings queued and suggestions awaiting confirmation counts).

### Story 8.1: A Suggestion is an entity nobody can write without a tap

**Dev model:** ~~fable~~ opus *(2026-09-24, Matheus: fable replaced by opus, Opus 5.5 performs better)* · **Effort:** high · the Suggestion entity and confirm contract; nothing unconfirmed may leak

As a field engineer,
I want every value the app proposes to sit beside my field in amber until I confirm it, and never to be written, counted or printed before that,
So that a signed report never carries a value I did not check.

**Acceptance Criteria:**

**Given** the `suggestion` entity `{id, relatorio_id, target_path, value, trust: suggested|verify, mode: fill|replace, source: {photo_id, bbox, ocr_token_ids, reading_run_id}, status: pending|confirmed|discarded, prompt_version}` in the kernel, the `suggestion/{id}` server-only create family and the `suggestion/{id}/status` client family
**When** a sheet cell is stored
**Then** it is `{value, source_suggestion_id, op_id}`, `applyOp` sets `source_suggestion_id` from `meta.source_suggestion_id` and clears it on any later `put` without it; `RelatorioSnapshot` includes exactly the suggestions referenced by current cells; `progress`, `preIssue`, `syncCounts` and the renderer ignore anything with `status ≠ confirmed` (FR-41, AR-11)

**Given** the Suggestion field component from Story 5.8, now wired to suggestion rows
**When** a pending suggestion targets a field
**Then** the field takes the amber fill and "Sugerido" pill, or a dashed border and "Verificar" pill when `trust = verify`; the 48 px source crop (rendered from the local original when present, else `GET …/original` cached as a `crop` blob) sits beside the value and opens the Photo viewer zoomed on `bbox`; "Confirmar" emits one batch of `suggestion/{id}/status = confirmed` and `{target_path} = value` with `meta.source_suggestion_id`; typing into the field emits the value op plus `status = discarded` for that field only; "Confirmar todos" confirms every `suggested` field of the group in one batch, skips every `verify` one and reports "Confirmar 7"; after confirmation the crop shrinks to a 24 px glyph with a ≥ 48 px hit area reachable until export (FR-41, UX-DR45)
**And** the field announces "Sugerido, ⟨valor⟩, confirmar" and the crop's alt is "Recorte da placa"

**Given** a target cell already holding a value when a `suggestion/{id}` create arrives
**When** the device applies it
**Then** it runs `compareSuggestion(cell.value, suggestion.value, fieldDef)`: equal → it emits the confirm batch as the current user with `meta.auto = true`; different → the suggestion stays pending with `mode = replace` and the field shows the `meta` line "Sugerido: 15 kV — Substituir"; the engineer's value is never overwritten (FR-41, AR-11)

**Given** the Sumário header and `syncCounts`
**When** pending suggestions exist
**Then** "sugestões por confirmar" counts them and blocks with pending suggestions are not counted as filled (FR-17, FR-42)

### Story 8.2: Photograph the plate and keep the photo until there is signal

**Dev model:** opus · **Effort:** medium · plate capture, queued states, upload priority and arrival toasts

As a field engineer,
I want one shutter on the nameplate tile to save the plate as a sheet photo and queue it for reading, whether or not I have signal,
So that I keep walking and the reading catches up with me at the gate.

**Acceptance Criteria:**

**Given** the "Fotografar placa" tile from Story 5.3
**When** the user takes the single shot
**Then** the photo is saved by Story 6.1's path with caption "placa de identificação", `block_id`, `reading_kind: plate`, `reading_target: {block_id, block_type}` and `reading_status: queued`, appears in the gallery, and the nameplate group shows the plate photo as a Photo tile with "Foto guardada — leitura quando houver sinal" beneath while offline or "Lendo…" while the job runs; the fields stay typeable via "Digitar" and typing into one excludes it from the incoming suggestions (FR-33, FR-42, AR-13)

**Given** the uploader
**When** the queue holds a photo with a pending reading
**Then** it uploads before every other photo (FR-42, AR-6)

**Given** `suggestion/{id}` creates arrive on pull
**When** the tab is open
**Then** the toast "3 leituras prontas para confirmar — Ver" opens the first sheet with pending suggestions; a sheet opened later with pending suggestions shows the info banner "Sugestões prontas"; the Sync badge tap shows "leituras na fila" and "sugestões por confirmar" counts from `syncCounts` (FR-42, FR-60)

**Given** a photo whose `reading_status` became `failed`
**When** the nameplate group renders
**Then** it shows "Não foi possível ler — Tentar novamente / Preencher manualmente"; "Tentar novamente" calls `POST /api/photos/{id}/reread`; the photo is kept and nothing was written (FR-42)

### Story 8.3: Run a local OCR service in Docker behind the OcrProvider contract

**Dev model:** opus · **Effort:** medium · Python OCR sidecar in Docker behind a JSON-Schema contract

As a builder,
I want the OCR layer as a stateless Python service in docker-compose speaking the contract the reading job will consume,
So that nameplates are read for real with no cloud account and the same contract later admits Textract.

**Acceptance Criteria:**

**Given** `packages/domain/contract/ocr` declaring `OcrProvider.read(image) → {image: {width, height}, tokens: [{id: "t{index}", text, bbox}], preprocessing_applied}` and the LLM structuring interface (input: image bytes, OCR tokens, field definitions; output: values in their kind's shape each citing `ocr_token_ids`), with the JSON Schema exported for the sidecar
**When** `services/ocr` (Python 3.13, FastAPI, PaddleOCR PP-OCRv5 detection + PARSeq recognition, OpenCV preprocessing, pydantic models generated from that schema) runs as the `ocr` service in docker-compose
**Then** `POST /read` returns tokens with boxes in the pixel space of the bytes it received (internal deskew or crop mapped back, or `preprocessing_applied: false`), one token per word, and the sidecar holds no state (FR-33, FR-37, AR-13, NFR-18)

**Given** the `ocr` service image (python:3.13, uv, FastAPI, PaddleOCR, PaddlePaddle CPU, opencv-python, onnxruntime)
**When** it is built ~~in CI~~ by `docker compose build ocr` (2026-09-21: no CI in the MVP; the build runs locally as part of `pnpm verify` for stories touching `services/ocr`)
**Then** it starts under the `ocr` profile of docker-compose, answers `GET /health`, and a fixture plate photo returns tokens whose text and boxes match the stored expectation within tolerance (NFR-17, NFR-18)

### Story 8.4: Run the reading job end to end with fixture-driven structuring

**Dev model:** ~~fable~~ opus *(2026-09-24, Matheus: fable replaced by opus, Opus 5.5 performs better)* · **Effort:** high · reading job orchestration, providers, idempotent suggestion emission and reading_run

As a builder,
I want the reading job to run in docker-compose with the local OCR and a fake structuring step, logging every run,
So that the whole assist is testable with no cloud account and swapping in a paid model later is a config change.

**Acceptance Criteria:**

**Given** file receipt of a photo with `reading_kind`
**When** the api stores it
**Then** it enqueues one pg-boss `reading` job with singleton key `(photo_id, reading_kind)` and emits `file/{id}/reading_status = running` as `system:reading`; the job sends the `print` variant to the `OcrProvider` and the same bytes to the structuring step, normalizes boxes over that image, deletes its own previous pending suggestions for the target, and emits `suggestion/{id}` creates with `status = pending`; three attempts with backoff then `failed` (FR-33, FR-42, AR-13)
**And** `OCR_PROVIDER ∈ {fake, ocr-svc}` and `LLM_PROVIDER ∈ {fake}` are selected by environment, `fake` replays fixtures from `apps/api/src/jobs/reading/fixtures` keyed by photo sha256, and the docker-compose default is `fake` for both so tests run with no model

**Given** every run
**When** it finishes
**Then** a `reading_run {id, photo_id, reading_kind, ocr_provider, ocr_result, model, prompt_version, llm_usage: {input_tokens, output_tokens, usd}, duration_ms}` row exists so `ocr_token_ids` resolve after the job; `reread` creates a new run; the structured log carries `company_id`, `relatorio_id`, `job_id` (AR-13, AR-28)

**Given** the `anthropic` and `bedrock` provider slots
**When** the code is inspected
**Then** they exist as the same interface behind the config switch but are not implemented in this epic, and no code path reads a personal subscription credential (NFR-12)

**Given** the `fake` providers *(added 2026-09-21, system-level test design; see `_bmad-output/test-artifacts/test-design/fasor-handoff.md`)*
**When** a fixture file declares `outcome: ok | error | timeout` for a photo sha256
**Then** the job behaves accordingly: `error` and `timeout` exhaust the three attempts and end in `failed` with `reading_status = failed`, `ok` replays the stored tokens and structured values; the outcome field defaults to `ok` (TC-3, R-007)

### Story 8.5: Accept a digit only when the OCR saw it, and check names against the registries

**Dev model:** opus · **Effort:** medium · digit coverage and registry cross-check on the server

As a field engineer,
I want a number the model guessed but the OCR did not see to be flagged instead of offered, and an unknown manufacturer or voltage class to ask me instead of failing,
So that a misread digit never reaches a signed report.

**Acceptance Criteria:**

**Given** the reading job's output for a field whose value contains a digit
**When** `digits(value) !== digits(concat(cited tokens in reading order))`
**Then** the suggestion is emitted with `trust = verify`, never `suggested`; the check runs server-side and is never taken from the model; a kernel test covers a value with an extra digit, a missing digit and an exact match (FR-37, AR-10)

**Given** a field of kind `voltage_class` or `manufacturer`
**When** the job produces a value
**Then** a voltage class absent from the company registry yields `trust = verify`; a manufacturer absent from the registry yields a `suggested` value plus a `create_registry_entry` hint so the field renders "Criar Celtta?" inline, which creates the manufacturer as an op offline and confirms the field in one batch (FR-35, FR-4)

**Given** a `verify` field
**When** the group renders
**Then** it shows its best guess on the dashed border, is skipped by "Confirmar todos", and confirms only by its own tap (FR-33, FR-41)

### Story 8.6: Confirm the plate in one tap with the crop in view

**Dev model:** opus · **Effort:** medium · plate crop UI, field region outlines and the Flow 2b walk

As a field engineer,
I want the plate crop above the fields with each field's region outlined as I move through them, and one button that takes every grounded field,
So that the plate costs one shutter and one tap, and two keystrokes for the field the app was not sure about.

**Acceptance Criteria:**

**Given** suggestions arrived for a nameplate group
**When** the sheet renders
**Then** the plate crop shows inline above the fields (full width, ≤ 160 px, zoomable), each field's `bbox` is outlined on the crop while that field is focused, every field is a Suggestion field per Story 8.1, and "Confirmar todos" closes the group reporting its count while `verify` fields stay open (FR-33, UX-DR45)

**Given** the Flow 2b narrative
**When** it is walked on the fixture plate (seven grounded fields, one `verify`, one unknown manufacturer, one field the engineer typed first)
**Then** "Confirmar todos" confirms the seven, the typed field shows "Sugerido: 15 kV — Substituir" and keeps its value, "Criar Celtta?" creates the manufacturer offline, the `verify` field is edited with two keystrokes, and the ops emitted match the batches of Story 8.1 (Flow 2b, UX-DR76)

**Given** `preIssue`
**When** sheets hold pending suggestions
**Then** the Sumário row 9 and the Export dialog count "3 fichas com sugestões por confirmar" as a warning that never blocks (FR-73)

## Epic 9: More assists: display reading, equipment identity, vision captions, dictation, NC drafts (post-slice)

The engineer reads instrument displays by camera so a sheet costs at most 20 taps and 15 keystrokes with signal, creates a block by photographing the panel, gets vision captions for context-less photos, dictates captions, observations and readings, and receives a one-sentence NC observation draft. Each story adds one `reading_kind` or one input path to the pipeline of Epic 8. Mockups: `key-equipment-sheet.html` ("Ler visor"), `key-sheet-states.html`, `key-photos.html` (vision caption batch), `key-relatorio-overview.html` (field palette with "Fotografar equipamento").

### Story 9.1: Read the instrument display with "Ler visor"

**Dev model:** opus · **Effort:** high · seven-segment display path, burst, typed-value check

As a field engineer,
I want to photograph the megôhmetro display and have the value and unit land in the next empty cells as suggestions, and when I typed first, have the photo check my value,
So that with signal the readings cost no keystrokes and without signal they still cost me nothing extra.

**Acceptance Criteria:**

**Given** the Read display button on every Measurement table and beside the thermo-hygrometer pair of "Da cabine"
**When** the user taps "Ler visor"
**Then** the camera opens; each shot is saved as a photo with `reading_kind: display` and `reading_target: {block_id, table_key, start_cell}`; burst stays open one shot per row until "Concluir" showing "Ler visor · 3"; offline each target cell shows "Foto guardada — leitura quando houver sinal" and stays typeable (FR-36, UX-DR41)

**Given** `services/ocr` gains the seven-segment display path (spike on real DMG10Ki display photos recorded in `docs/` first)
**When** the reading job runs with `reading_kind: display` routed to `ocr-svc`
**Then** a display showing stored 30 s, 1 min and 10 min results fills the three cells of the row and a single-value display fills one, in reading order from `start_cell`, the unit read from the display or defaulted from the previous row, each a Suggestion with its crop, digit coverage applied (FR-36, FR-37)

**Given** the target cell already holds a typed value when the reading arrives
**When** `compareSuggestion` runs
**Then** a match attaches the crop silently (auto-confirm) and a mismatch shows "Visor: 147 GΩ · digitado 14,7 GΩ — Conferir" with a one-tap pick, never overwriting (FR-36, source-deltas)

**Given** the Flow 2 budget
**When** a fully conforme seccionadora with a copied plate is filled with signal on the fixture
**Then** it costs at most 20 taps and 15 keystrokes, measured by the Playwright walk (SM-3)

### Story 9.2: Create a block by photographing the equipment

**Dev model:** opus · **Effort:** medium · panel photo to block creation with fallback

As a field engineer,
I want to photograph a panel front and get its type, column and TAG as one confirmation that creates the block,
So that an equipment missing from the drawing costs one shot and one tap.

**Acceptance Criteria:**

**Given** the field Block palette gains the first row "Fotografar equipamento" (full-width tile)
**When** the user takes the shot online
**Then** a photo with `reading_kind: panel` runs the job, and the confirmation reads "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?" with a chip row to correct the type; one tap creates `equipment` and `block` in one batch and the same photo becomes the block's plate with `reading_kind: plate` queued (FR-38)

**Given** no connectivity
**When** the tile is used
**Then** the block is created from the type list with type plus column giving the TAG and the photo still becomes its plate (FR-38)

### Story 9.3: Caption context-less photos by vision, confirmed in batch

**Dev model:** sonnet · **Effort:** medium · caption reading kind, batch confirm and the manual people mark

As a user,
I want photos without a sheet context to receive a suggested caption on sync that I confirm one by one or all at once,
So that Eduardo's twelve gate photos are captioned in the van, not on Monday.

**Acceptance Criteria:**

**Given** a photo with no `block_id` and an empty caption
**When** it uploads
**Then** it is queued with `reading_kind: caption`; the job returns one caption as a Suggestion targeting `file/{id}/caption` or nothing when it cannot caption (the photo stays "Sem legenda", never guessed); a photo marked "Pessoas na foto" (a chip on the tile and in the import batch, set by the user; no face detection) is never sent for captioning and prints with its context or typed caption (FR-39, NFR-11)

**Given** pending caption suggestions
**When** the gallery renders
**Then** tiles show the suggested caption in `meta` on the amber fill with the "Sugerido" pill, the composer shows it as a Suggestion with "Usar", the header offers "12 legendas sugeridas — Confirmar todas" (one batch), and `preIssue` lists the same count (FR-39, FR-73, UX-DR54)

### Story 9.4: Dictate a caption, an observation or a reading

**Dev model:** sonnet · **Effort:** medium · speech engine behind an interface, parsed table utterances

As a field engineer,
I want to speak a caption or an observation, or say "Fase A, 147 giga", and see it as a suggestion,
So that the free text I cannot pick from a chip still costs no typing.

**Acceptance Criteria:**

**Given** a speech engine is available online (Web Speech API in pt-BR, or a backend transcription behind the same interface, chosen by config)
**When** the Dictation button shows (caption field of the import batch and the Caption composer first; then Observation fields and Measurement tables)
**Then** it is a 48 px round outline mic, "Ouvindo…" appears beside it while listening, the result is a Suggestion field, a table utterance is parsed by the kernel into row, value and unit and unparsed speech lands in the observation as a suggestion (FR-40, UX-DR18)

**Given** no engine, or the device is offline
**When** the surface renders
**Then** the button is hidden, not disabled, and chips and keyboard remain (FR-40)

### Story 9.5: Draft the NC observation from the row's photo

**Dev model:** sonnet · **Effort:** medium · one more reading kind on the existing pipeline

As a field engineer,
I want a one-sentence description of what my NC photo shows, offered as a suggestion on that row's observation,
So that writing down what I am already looking at costs one tap.

**Acceptance Criteria:**

**Given** a checklist row marked NC that carries a photo
**When** the photo uploads
**Then** it is queued with `reading_kind: nc_obs` and `reading_target: {block_id, item_key}`; the job returns one sentence as a Suggestion above the Observation field with "Usar"; typing keeps the engineer's text and discards the draft; the job never proposes which rows are NC (FR-75, FR-41)

## Epic 10: Two devices on one relatório: merge, conflicts and full sync status (post-slice)

Two engineers work the same relatório on two devices: sheets merge by sub-block without asking, only a true contradiction is put to the user as a single-cell choice, duplicate TAGs and removed-versus-edited blocks are resolved in place, and the full Sync status surface lists what was sent, what waits, what failed and what merged. Mockups: `prototype/screens/85-sync.html`, `86-sync-conflito.html`, `key-sync-status.html` (with the Conflict view).

### Story 10.1: Merge the same sheet from two devices by rule

**Dev model:** ~~fable~~ opus *(2026-09-24, Matheus: fable replaced by opus, Opus 5.5 performs better)* · **Effort:** high · merge policy by sub-block over prev_op_id; the hardest correctness surface post-slice

As a field engineer,
I want a sheet both of us touched to merge itself by sub-block, with every merge listed as information,
So that splitting a job across two tablets never asks me to arbitrate 94 sheets.

**Acceptance Criteria:**

**Given** `packages/domain/merge` implementing `mergePolicy` dispatched on `parsePath(path).family` and `prev_op_id`, and the server's `superseded` signal
**When** two devices push ops on the same sheet
**Then** a checklist result NC on one and C on the other resolves to NC keeping the NC device's photo link and observation; a filled cell beats an empty one; photos and captions are all kept and ordered by capture time; free text takes the latest edit with the other version kept readable for the session; additions, moves, reorders, captions, points and setup edits merge with additions from both kept (FR-58)
**And** every merge is emitted as a `merge_info` entry read by `syncCounts` and shown as a Sync status row "SEC-C12: item 10 NC de Eduardo (com foto) mesclado"

### Story 10.2: Decide a true cell contradiction, and nothing else

**Dev model:** opus · **Effort:** medium · conflict state, banner and the per-cell Conflict view

As a field engineer,
I want to be asked only when both of us filled the same cell with different values, with both values and their evidence side by side,
So that a decision costs one tap on one row.

**Acceptance Criteria:**

**Given** two different filled values on one cell (two readings, two conclusions, C vs NA)
**When** the pull applies them
**Then** the cell enters `conflict` state, the sheet Banner (conflict variant, `role="alert"`) reads "SEC-C12: 1 célula em contradição — Ver", and the Conflict view lists only the contradicting cells, one 56 px row each with two option rows showing value, author, time and the 48 px crop when the value came from a reading; "Aplicar" writes the picks as ops; the rest of the sheet is already merged and is not shown; Esc/back returns without deciding (FR-59, UX-DR12)

### Story 10.3: Resolve a removed-versus-edited block and a duplicate TAG

**Dev model:** opus · **Effort:** medium · structure conflicts and duplicate TAG resolution

As a user,
I want the two structural cases that cannot merge by rule put to me with the two blocks side by side,
So that nothing is silently lost or duplicated.

**Acceptance Criteria:**

**Given** a block removed on one device and edited on the other
**When** the pull applies both
**Then** the Sumário Banner offers "SEC-C12: removido por Eduardo, alterado por você — Manter / Remover" and the Conflict view shows one block card per side (FR-59)

**Given** the same TAG created on two devices
**When** `integrity` detects it after the pull
**Then** the row reads "SEC-C09 foi criada em dois aparelhos — Renomear uma / Manter as duas" and "Manter as duas" suffixes the later one with "-2"; a block added elsewhere appears in the tree and is listed as information only (FR-7, FR-59)

### Story 10.4: See everything the sync did or is waiting to do

**Dev model:** sonnet · **Effort:** medium · full sync status surface from syncCounts

As a user,
I want the full Sync status surface with every pending upload, download, error, merge and contradiction, and each colleague's last send,
So that I can judge on Monday whether a colleague's work may still be on their tablet.

**Acceptance Criteria:**

**Given** the Sync status surface as in `85-sync.html` and `key-sync-status.html`
**When** it opens from the badge
**Then** the headline shows the state word and counts ("3 fichas e 12 fotos aguardando · 2 leituras na fila"), and rows list uploads pending (sheets, photos, photos queued for reading with "Leitura na fila"), downloads in progress with a progress line, last sync, per-user "Último envio de Eduardo: 06/09 18:10", errors with "Tentar novamente", rejected ops with "Reenviar", merged changes for the session, and contradictions opening the Conflict view; explanations sit behind "Como funciona"; the surface is not `aria-live` (FR-60, UX-DR13)

## Epic 11: Completions after the slice and the dated post-MVP items

The remaining product scope the slice deferred, the cloud and paid-provider work that the local-only MVP excluded, and, dated for NR-10 10.7.11 before 2027-06-01, the structured action plan. Mockups: `key-export.html` (PDF row), `key-relatorio-overview.html` ("Mover para…"), `key-template-composer.html` (Rich text editor), `key-account.html` ("Localização nas fotos"), `key-points-of-attention.html` (Priority pill and picker).

### Story 11.1: Download the PDF beside the DOCX

**Dev model:** sonnet · **Effort:** low · serve a stored file

As an office user,
I want the PDF row of the Export dialog and the revision list to download the file the job already stored,
So that I send the client the closed document the same morning.

**Acceptance Criteria:**

**Given** revisions already hold `pdf_file_id`
**When** the user taps "PDF — enviar ao cliente" or the PDF glyph of a past revision
**Then** `GET /api/revisions/{id}/pdf` serves it, a share sheet is offered on mobile, and the draft-equals-issued test covers the PDF too (FR-62, FR-74)

### Story 11.2: Move a block to another location

**Dev model:** sonnet · **Effort:** medium · move block op with TAG re-suggestion

As a user,
I want to move an equipment block to another column carrying its data, with its TAG re-suggested,
So that a block placed in the wrong column is fixed without retyping.

**Acceptance Criteria:**

**Given** "Mover para…" on a Block card, a tree row and the Sumário expansion
**When** the user picks a location
**Then** `block/{id}/location_id` is emitted, the block's photos, checks, measurements and observations move with it, "Sugerir TAG para Coluna 9?" offers the re-suggestion, and the move is announced and undoable (FR-20)

### Story 11.3: Save a relatório as a template

**Dev model:** sonnet · **Effort:** medium · template from relatório structure

As an office user,
I want to turn a finished relatório's structure into a template,
So that the next visit to the same site starts from what was actually there.

**Acceptance Criteria:**

**Given** "Salvar como template" in the Sumário header Overflow
**When** the user names the template
**Then** a `template/{id}` create carries the locations, each cabine's `agrupar_por_tipo`, each block's `BlockConfig` with sub-block and subtype overrides and its quantity per column; TAGs are regenerated at instantiation; filled data, photos and points are not carried (FR-14)

### Story 11.4: Edit section boilerplate in a rich text editor

**Dev model:** sonnet · **Effort:** medium · rich text editor limited to renderer-shared formatting

As an office user,
I want bold, italics, lists and variables in the Template composer's section editor,
So that the boilerplate prints with the formatting the company form uses.

**Acceptance Criteria:**

**Given** the Rich text editor in the Template composer only (toolbar Negrito · Itálico · Lista · Numeração · Variável as 48 px buttons with words, Ctrl+B / Ctrl+I)
**When** the user formats text
**Then** formatting is limited to what the DOCX and PDF renderers share, pasted text is stripped to plain text plus lists, variable chips behave as in Story 3.6, and the renderer prints the formatting; the per-relatório Section text surface stays plain text (FR-12, UX-DR69)

### Story 11.5: Turn the photo location stamp on or off

**Dev model:** sonnet · **Effort:** low · account toggle

As a user,
I want a switch in Account for the coordinates on my photos, with the OS denial shown there,
So that I control what prints under my photos.

**Acceptance Criteria:**

**Given** Account's Toggle row "Localização nas fotos" (default on) writing `user/{id}/photo_location_enabled`
**When** it is off
**Then** photos carry date and time only; when the OS denied location the sub-line reads "Permissão negada no aparelho" with the OS path and the switch stays on so it works once granted; capture is never blocked (FR-8, UX-DR65)

### Story 11.6: Structure readings with Claude through a paid API key

**Dev model:** opus · **Effort:** medium · real LLM provider with structured output and cost logging

As a builder,
I want the `anthropic` provider (Console key) and then `bedrock` implemented behind the existing structuring interface,
So that the pipeline proven on fixtures reads real plates with one config change.

**Acceptance Criteria:**

**Given** `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` from the environment (never a subscription credential)
**When** the reading job runs
**Then** it calls Claude with structured output given the image, the OCR tokens and the field definitions, requiring cited `ocr_token_ids` per value, never accepting coordinates from the model, logging tokens and USD per run; `LLM_PROVIDER=bedrock` uses `@anthropic-ai/bedrock-sdk` with `anthropic.claude-opus-5` and `anthropic.claude-sonnet-5` as the cost fallback by config; prompts carry a `prompt_version` (FR-33, FR-36, FR-39, AR-13, NFR-12)

### Story 11.7: Use Amazon Textract as the cloud OCR

**Dev model:** sonnet · **Effort:** medium · Textract adapter behind the existing contract

As a builder,
I want `OCR_PROVIDER=textract` behind the `OcrProvider` contract,
So that nameplates and printed text can use a managed OCR once the AWS account exists.

**Acceptance Criteria:**

**Given** `@aws-sdk/client-textract` `DetectDocumentText`
**When** the provider runs
**Then** WORD blocks map to tokens with normalized boxes in the original image space, `preprocessing_applied: false`, the per-`reading_kind` routing picks it for plates and `ocr-svc` for displays, and the AWS account carries the AI services opt-out policy (FR-33, AR-13, NFR-11)

### Story 11.8: Deploy the same images to AWS

**Dev model:** opus · **Effort:** medium · CDK stack for ECS, RDS, S3 and CI promotion

As a builder,
I want the docker-compose images to run on AWS managed container services from infrastructure code,
So that the design partner uses the product outside the office network without any change to the application.

**Acceptance Criteria:**

**Given** `infra/` as AWS CDK in TypeScript
**When** `cdk deploy` runs for `staging` and later `production` in `sa-east-1`
**Then** it creates a VPC, ECS Fargate behind an ALB with HTTPS for the api image (with in-process worker) and a second service for `services/ocr`, RDS for PostgreSQL 18, S3 with versioning, Secrets Manager, CloudWatch Logs, IAM for Bedrock and Textract; CI pushes each commit's images to ECR and promotes staging → production unchanged; migrations run as a one-shot ECS task before the service rolls; switching any service changes `infra/` only (AR-26, NFR-18; no FR: delivery of the same product outside the office network)

### Story 11.9: Let the priority suggest the deadline on a point of attention (post-MVP, before 2027-06-01)

**Dev model:** sonnet · **Effort:** medium · priority picker and deadline suggestion

As an office user,
I want to pick a priority P0 to P4 on a finding and see the deadline suggested from it,
So that the report carries the compliance schedule NR-10 10.7.11 will require.

**Acceptance Criteria:**

**Given** the Priority picker (five rows "P0 · Imediata" to "P4 · Próxima manutenção") and the kernel `deadlineFromPriority(priority, createdAt, relatorio.next_intervention)`
**When** a level is chosen
**Then** the Prazo field shows the date as a Suggestion (P0 that day, P1 +30, P2 +90, P3 +180, P4 the relatório's next recommended intervention, never a hard-coded year), a typed date is never overwritten and a differing suggestion offers "Substituir"; the Priority pill is text first, tone second; Responsável is free text (FR-50, UX-DR55)

### Story 11.10: Print the action-plan table in section 8 (post-MVP, before 2027-06-01)

**Dev model:** sonnet · **Effort:** medium · action-plan table in the renderer

As an office user,
I want section 8 to print a numbered table of the findings with local, priority, deadline, action, owner and images beneath the bullets,
So that the client receives the schedule the new NR-10 names.

**Acceptance Criteria:**

**Given** points with priority, deadline and owner
**When** the generate job renders section 8
**Then** beneath the bullets a table prints with columns Nº · Ponto de atenção · Local/TAG · Prioridade · Prazo · Ação recomendada · Responsável · Imagens, manual then derived rows numbered continuously, "—" where a value is missing, images as the same resolved numbers; `preIssue` counts "pontos sem prazo" as information (FR-52, AR-25)
