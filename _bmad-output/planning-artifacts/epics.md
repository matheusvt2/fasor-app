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
- FR-40: ~~A user can dictate into a caption (first), an observation or a Measurement table using the device speech engine; a table utterance is parsed to row, value and unit; the result is always a Suggestion; the control is hidden, not disabled, where no engine exists; dictation is online-only. (Post-slice; slice ships no engine.)~~ *(2026-11-26, Matheus, Epic 31: a user records an audio on a prose field or a Measurement table with one gesture, with or without signal; the backend transcribes it and a model writes the text; prose is written into the field marked "Áudio", a table reading is a Suggestion to confirm; the browser speech engine is removed. FR-76 to FR-79.)*
- FR-41: Every assisted value obeys one contract (AD-12): a Suggestion is an entity with `status pending|confirmed|discarded`, `trust suggested|verify`, `mode fill|replace`, source photo, bbox and OCR token ids; nothing unconfirmed is written, counted by progress or printed; typing into a suggested field discards that field's suggestion only; a filled field is never overwritten (a differing suggestion shows "Sugerido: … — Substituir"; an equal one auto-confirms with `meta.auto`); confirmed cells keep `source_suggestion_id` and their crop shrinks to a 24 px glyph reachable until export; suggestions are announced to screen readers with value and confirm action; no verdict is ever auto-decided; known-shape fields show their best guess flagged Verificar, free prose is never guessed; vision proposing NC rows is out. *(2026-11-26, Matheus, Epic 31: one exception. A prose text transcribed from the user's own audio is written into its field without a confirmation, marked "Áudio" with the audio and the text as heard kept; a spoken reading keeps this contract.)*
- FR-42: A photo taken for an assist while offline is kept and queued (`reading_kind`, `reading_target`, `reading_status` on the photo row); the cell or tile shows "Foto guardada — leitura quando houver sinal" and stays typeable; reading photos upload before other photos; the reading runs at first connectivity while the tab is open and a toast "N leituras prontas para confirmar — Ver" opens the first sheet with pending suggestions; a sheet opened later shows the info banner "Sugestões prontas"; a failed reading shows "Não foi possível ler — Tentar novamente / Preencher manualmente" with the photo kept; the sync status counts readings queued and suggestions awaiting confirmation; sized for about 94 plates, 1,100 display shots and 82 captions per job. *(2026-11-26, Matheus, Epic 31: the same queue holds an audio recorded on a field, online or offline: "Áudio guardado, aguardando sinal"; audios upload with the reading photos.)*
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
- NFR-12 **AI cost and control.** All AI runs in the backend through one pg-boss queue; the LLM never emits coordinates; readings are logged with tokens and USD; the backend never uses a personal Claude subscription; `LLM_PROVIDER` and `OCR_PROVIDER` default to `fake` fixture providers locally; ~~conclusion text, parecer summary and context captions are computed on the device, never by a model.~~ *(2026-11-26, Matheus, Epic 31: they are computed on the device as the starting point; a model rewrites one only when the user asks, by recording an audio into the field or tapping the AI control, and never decides a result.)*
- NFR-13 **Multi-tenancy in the data model.** Every table carries `company_id`; every repository function takes it as a required argument; one test seeds two companies and asserts no cross-read; row-level security deferred until the second company; report type is a seed key with `cabine_primaria` as the only value.
- NFR-14 **Regulatory accuracy.** No criterion is encoded without operator, type and a declared source (edition nullable); no periodicity is ever encoded as annual; the NR-10 text is keyed by `effective_from`; forbidden marketing claims: required by insurers; NBR 14039 requires annual maintenance; NR-10 10.15.4 d covers insulation testing.
- NFR-15 **Product naming.** The user-visible product name comes from one config constant (PRODUTO) *(2026-11-03, Matheus: its value is Conforme, Story 20.1; the constant keeps its identifier)*; the codename `fasor` and the design partner's brand never appear in a user-visible string, document or file name; the Fasor Engenharia brand appears only inside the generated document; no emoji anywhere in UI, documents or mocks.
- NFR-16 **Design fidelity.** DESIGN.md tokens map onto the implementation without changing hex values or sizes; `tokens.css` and `components.css` are the styling layer; both light and dark themes obey the same contrast rules; theme attribute set on the root element so aliased component tokens re-resolve.
- NFR-17 **Testing floor.** Kernel Vitest tests (seed validation, schema-reference test, op replay byte-equality, Sumário/pre-issue identity on Dexie vs Postgres, cross-tenant test); renderer snapshot test on the Porto Seguro data set plus the draft-equals-issued test; Playwright on desktop Chrome, Android Chrome emulation and WebKit for `src/db` and `src/sync` with the three FR-54 scenarios by name; iPadOS Safari eviction and camera checked manually on a device in the first two days.
- NFR-18 **Delivery and environments.** **MVP scope: 100% local in Docker; AWS only after the MVP (Matheus, 2026-09-21).** Containers everywhere: local development always via docker-compose (web, api, Postgres 18, MinIO, OCR sidecar profile), nothing runs natively; AWS as the one cloud (ECS Fargate behind an ALB, ECR, RDS for PostgreSQL 18, S3 with versioning, Secrets Manager, CloudWatch Logs, Bedrock, Textract; region `sa-east-1`); infrastructure as ~~AWS CDK~~ Terraform *(2026-09-29, Matheus)* in `infra/`; one image built per commit in CI and promoted staging → production unchanged; config only through environment variables validated by zod at boot and Secrets Manager; structured JSON logs with `company_id`, `relatorio_id`, `job_id`; `GET /api/health`; migrations forward-only as a one-shot ECS task before the service rolls.

### Additional Requirements

**Starter template and repository shape (Epic 1 / Story 1 input).** The architecture names no third-party starter template. The repository is a pnpm 12 workspace monorepo with the structural seed: `packages/domain` (pure TypeScript kernel, zod only), `apps/web` (React 19 + Vite 8 + React Router 8 library mode + react-aria-components + Dexie 4), `apps/api` (Hono 4 + @hono/node-server, Drizzle 0.45 + postgres.js, pg-boss 12, better-auth 1.7, docx 9.7, sharp, LibreOffice 26.2 in the image), `services/ocr` (post-slice, Python 3.13 + FastAPI + PaddleOCR), `infra/` (~~AWS CDK TypeScript~~ Terraform *(2026-09-29, Matheus)*), `docker-compose.yml`, `scripts/seed-users.ts`. Node 24 LTS, TypeScript 6.0, typescript-eslint 8.70, Vitest 5, Playwright 1.63. Package boundaries and `eslint no-restricted-imports` enforce dependency direction (`web → domain`, `api → domain`, `api → ocr` via contract; nothing else).

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
- UX-DR18: ~~Dictation button (48 px round outline mic; "Ouvindo…" word while listening; hidden, not disabled, when no engine; post-slice engine).~~ *(2026-11-26, Epic 31: Audio button, 48 px round outline mic, shown with or without signal; "Gravando" with the elapsed time and a level meter while recording; absent only where the browser cannot record.)*
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
- UX-DR40: Measurement table (real table with header cells at every width; nothing clipped, horizontal scroll as a last resort; caption with criterion value and a chevron revealing its source; action row with Read display and Dictation buttons; calculated cells read-only in ink-secondary with a "calc." mark announcing "calculado"; 200 px value cells at tablet/desktop; ~~TTR wide variant with fixed column widths~~ *(2026-10-09, PR #122: each table in its own scrolling box; ratio tables sized by content from 768 px; `DESIGN.md` › Measurement table)*; one- and two-column tables stay tables on phone, only TTR stacks into cards with row + column accessible names; tests stack, never side by side; one continuous Enter run per sheet).
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
- **Review layers** (step 4) run on the story's `Dev model`; the investigation and epic-context subagents run on ~~`sonnet`~~ `opus` *(2026-09-24)*.
- The subagent definitions are `.claude/agents/bmad-dev-⟨model⟩-⟨effort⟩.md` (seven combinations in use); the override is `_bmad/custom/bmad-build.toml` (committed, applies to everyone on the project).

Rule of thumb used: `fable` for kernel invariants and the renderer, where a wrong decision propagates (op log, sync, instantiation, parsing, suggestions, generation, merge); `opus` for cross-layer features with real design room; `sonnet` for well-specified UI, CRUD, adapters and data transcription. Effort follows the size of the decision space, not the size of the diff.

*2026-09-24, Matheus: fable is no longer used for new work because Opus 5.5 performs better. Every story not yet built that named fable now names opus at the same effort; the stories already built on fable (1.4, 1.5, 4.1) keep their line as the record of the model they ran on.*

*2026-09-24, Matheus: the effort floor is medium; low is too weak for this product. Every story not yet built that said low now says medium (the `bmad-dev-opus-low` agent was removed), and the effort review raised 6.1, 7.2, 7.3, 7.4, 8.5, 9.4, 10.2, 10.3 and 11.8 from medium to high: photo capture, the printed sections of the signed document, digit acceptance, spoken readings, sync conflicts and the cloud deploy are where a wrong decision reaches the client. Built stories keep their line as the record.*

*2026-09-24, Matheus: sonnet is no longer used for new work either; every model choice is opus. Every story not yet built that named sonnet now names opus at the same effort (a new `bmad-dev-opus-low` covers the former sonnet·low stories); the stories already built on sonnet in Epics 1 to 5 keep their line as the record. Investigation and epic-context subagents also run on opus.*

| Model | Stories |
| --- | --- |
| fable | 1.4, 1.5, 4.1, ~~4.8, 5.5, 5.8, 7.1, 7.5, 8.1, 8.4, 10.1~~ |
| opus (from fable, 2026-09-24) | 4.8, 5.5, 5.8, 7.1, 7.5, 8.1, 8.4, 10.1 |
| opus | 1.3, 1.6, 1.8, 2.2, 3.1, 3.2, 3.4, 4.3, 4.4, 4.5, 5.6, 6.1, 6.2, 6.6, 7.2, 7.3, 7.4, 8.2, 8.3, 8.5, 8.6, 9.1, 9.2, 10.2, 10.3, 11.6, 11.8 |
| sonnet | 1.1, 1.2, 1.7, 2.1, 2.3, 2.4, 2.5, 2.6, 3.3, 3.5, 3.6, 3.7, 4.2, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.7, 5.9, ~~6.3, 6.4, 6.5, 9.3, 9.4, 9.5, 10.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 11.9, 11.10~~ |
| opus (from sonnet, 2026-09-24) | 6.3, 6.4, 6.5, 9.3, 9.4, 9.5, 10.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 11.9, 11.10 |

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
**Also covers:** UX-DR55 (priority pill and picker), UX-DR65 (location switch), AR-26 (AWS: ~~ECS Fargate~~ ECS on one EC2 instance *(2026-09-30, coordinator, PR #74)*, RDS, S3, ~~Secrets Manager~~ SSM Parameter Store *(2026-09-30, Matheus)*, CloudWatch, Bedrock, Textract via ~~CDK~~ Terraform *(2026-09-29, Matheus)* in `infra/`, ~~CI image promotion~~ the `infra/bin/deploy` script *(2026-09-30, Matheus: no CI, no staging)*), AR-29
**Decisions (Matheus, 2026-09-21):** the MVP runs 100% locally in Docker; the AWS deployment, the real Claude structuring call (`LLM_PROVIDER=anthropic` with a Console key, then `bedrock`) and Amazon Textract as an `OcrProvider` are stories of this epic, after the MVP, and no earlier epic depends on a cloud account or on paid API credits.
**Order and gates (Matheus with John and Amelia, 2026-09-30):** Bedrock is blocked by the account's new-account quotas (AWS support case open), so the deploy comes first and the LLM last. Entry gate G0: the Epic 10 retrospective closed (done 2026-09-29), the AWS bootstrap PR merged with a green `pnpm verify`, the USD 100 budget active (done). Wave 1: Story 11.8 (deploy), with the Epic 10 carry-over batch and Story 11.1 in parallel. Wave 2: Story 11.7 and the product stories 11.2, 11.3, 11.4, 11.5, 11.9, 11.10, each deployed to the account after its merge with the deploy script. Last: Story 11.6, behind its own Definition of Ready gate; if that gate is still closed when every other story is done, the epic closes with 11.6 blocked and the retrospective records it.

### Epic 12: Field journey and visual refresh (journey review 2026-09-24)
A field engineer resumes the sheet where they stopped in one tap, never has to tap twice for a tap the app swallowed, moves forward from setup to the first sheet to the last without "Voltar", repeats nothing from sheet to sheet that the app already knows (instrument, cabine data, NC observation, per-unit plate fields), and sees a sheet that reads as a modern field tool while keeping every sunlight and glove rule. Source: `ux-fasor-2026-09-18/review-journey-2026-09-24.md` (findings J-01 to J-19, decisions D-1 to D-11), `DESIGN.md` § v0.9 direction, `source-deltas.md` rows of 2026-09-24. Runs before Epic 6: the photos epic builds on the sticky bar and sheet header that Story 12.5 restyles. Mockups: `key-equipment-sheet-v09.html`, `key-relatorio-overview-v09.html`, `key-home.html`.
**FRs covered:** FR-16, FR-17, FR-21, FR-24, FR-25, FR-28, FR-32, FR-34 (revisited); NFR-15
**Also covers:** UX-DR33 to UX-DR40, UX-DR45, UX-DR46 (revisited); AR-10, AR-17, AR-20 (`per_unit` in the seed)
**Decisions (journey review 2026-09-24, Amelia and Sally with Matheus):** the lost-tap fix ships alone and first (D-1); the visual refresh lands in the mocks before the app (D-10); the tap budget becomes a real test (D-11). Matheus confirmed on 2026-09-24 that Epic 12 runs before Epic 6 and decided the Não ensaiado reasons (three standard plus free text, Story 12.4); the nameplate TAG field, the printed observation and the status on generate stay for later.

### Epic 13: The photo is the instrument: capture hardening, honest waiting and the emission audit (field UX analysis 2026-10-06)
A field engineer points the camera at a plate, a display or a panel and the shot is worth reading: full sensor resolution, a torch for dark cubicle interiors, zoom and tap-to-focus, and pinch-zoom to read his own photo when the OCR says "Verificar". The keyboard stops fighting serials and dates and the sheet says "Salvo"; a reading in flight shows its age and can be cancelled or retried anywhere; a shot refused by quota still survives the tab; the plate tile reaches every block type; dictation turns on behind one line of consent; and before "Emitir" an optional AI pass lists the contradictions rules cannot see — pointing, never writing. Source: `ux-fasor-2026-09-18/review-field-ux-2026-10-06.md` (findings CAP-1 to AI-3, the Field Control / Produttivo synthesis).
**FRs covered:** FR-33, FR-36, FR-38, FR-39, FR-43, FR-56 (revisited: capture quality, waiting states, durability); FR-40 (dictation turned on); the emission audit carries no FR yet (SPEC.md gains its capability line with Story 13.8)
**Scope boundary (2026-10-06):** everything the 2026-10-06 MVP hands-on review owns stays out — F-01 (Story 11.11, PR #98), the field-defects batch 2 (F-02 to F-28 rows named in `spec-review-fixes-field-defects-2.md`, in progress) and the layout-and-copy third batch (F-06, F-07, F-10, F-11, F-15 to F-19, F-22 to F-26, F-29). Stories 13.4 and 13.8 build on batch results (F-02, F-03), never replace them.
**Decisions:** three waves — the camera funnel first (13.1 to 13.3), then trust and ergonomics (13.4 to 13.6), then the gated assists (13.7 to 13.9, each behind its own Definition of Ready). Considered from the competitor synthesis and not taken now: QR asset lookup, photo markup, gallery lock (recorded in the source review § 3).
**Status (2026-10-21, Bruno via Matheus, answer 11):** Story 13.9 (dictation) is deferred to the "Backlog: deferred stories" section at the end of this file; the epic closes with 13.1 to 13.8.

### Epic 14: Locals, the site checklist and office-created equipment types (Bruno, 2026-10-08)
An office user composes a masonry room as a local holding its equipment directly, with no coluna; every local carries the Verificações do local, 19 site items answered C · NC · NA whoever provides them and printed once with the local; and when a job holds equipment the base lacks — the no-break de comando first, the chave ASCO next — the office creates its type by copying an existing one, publishes it, and field users fill it like any seeded type. Source: `sprint-change-proposal-2026-10-08.md` (Bruno's voice notes of 2026-10-08, the competitor and norm research, the architecture impact); `source-deltas.md` rows of 2026-10-08.
**FRs covered:** FR-10, FR-17, FR-18, FR-22, FR-24, FR-25, FR-49, FR-68 (revisited); new capabilities CAP-27 (site checklist per location) and CAP-28 (office-created equipment types) in `SPEC.md`, added 2026-10-08
**Also covers:** AR-20 (seed v4 and the AD-21 amendment); UX-DR29, UX-DR30, UX-DR36, UX-DR37, UX-DR38, UX-DR70
**Decisions (Matheus, 2026-10-08):** batch correct-course; the scope rule, the criteria-editing non-goal, `source-deltas.md` row "Q6 and the FR-5 assumption" and CAP-12's fixed eight are revoked as recorded there; Epic 14 starts now, with the Epic 13 carry-over (E13-A2, A4, A6) in the next carry-over batch in parallel. Waves: 14.1 (mocks) alone; then 14.2 to 14.4; then ~~14.5 to 14.7~~, after `bmad-architecture` settles the AD-21 amendment. The chave ASCO of 2026-10-10 is recorded outside the sheets: the app cannot serve it by then. *(2026-10-09, John (PM) with Matheus: re-sliced. Library types ship before company types: the new Story 14.5 adds the measurement table and ships "Fonte auxiliar da proteção" and "Chave de transferência automática" as seed types, with AD-21 unchanged; the former 14.5, 14.6 and 14.7 became 14.6, 14.7 and 14.8 (wave 3); wave 3 starts only after two or three real jobs have used the library types, with the count of new-type and adjustment requests recorded; the editor frames moved from Story 14.1 to Story 14.7. Waves: 0 = 14.1; 1 = 14.2 to 14.4; 2 = 14.5; 3 = 14.6 to 14.8. `sprint-change-proposal-2026-10-08.md` § 9.)*
### Epic 15: Bruno's first production feedback (document of 2026-10-22)
Bruno, after his first days on v0.2.4 from a phone, sees the relatório tree read its levels at a glance (bands per local and painel, the level word, the NC and the type on each equipment row), a transformer list that asks about the oil level once and a TC sheet that asks for no power, a local's checklist that also covers paint and the condition of grades and doors, "Voltar" from a sheet returning to the Sumário row at every width, a coluna in the composer that offers "Adicionar equipamento" on a phone, and a transformer ratio calculated as U1·√3/U2. Source: his "Melhorias produto.docx" of 2026-10-22, seven items with screenshots; the site checklist he asked for already exists (Story 14.3).
**FRs covered:** FR-10, FR-17, FR-18, FR-22, FR-24, FR-25, FR-68 (revisited); CAP-8, CAP-27 (revisited)
**Also covers:** AR-20 (seed v9); UX-DR29, UX-DR70; the 2026-10-22 hands-on findings F10, F19, F34, F37, F50
**Decisions (Matheus, 2026-10-22):** proceed on defaults while Bruno's seven questions are out; seed v9 and contract 25 for 15.3 and 15.6 in one batch; waves A (e15a 15.4 + 15.5, e15b 15.3 + 15.6, in parallel) and B (15.1 mocks, then 15.2). Context: `implementation-artifacts/epic-15/epic-15-context.md`. *(2026-10-22, Bruno's answers, same day: 1 to 4 confirm the defaults; 5 and 6 turn equipment rows and the Verificações do local into cards (15.1 redrawn, 15.2); 7 adds Story 15.7, the TC's own checklist, waiting for Bruno's list.)*


## Epic 1: Sign in and work on the device (offline-first foundation)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 1\."`.)*

## Epic 2: Registries and company identity

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 2\."`.)*

## Epic 3: Seed data and Templates

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 3\."`.)*

## Epic 4: Projects, relatório setup, the Sumário and the tree

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 4\."`.)*

## Epic 5: Fill the equipment sheet offline

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 5\."`.)*

## Epic 6: Photos and points of attention

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 6\."`.)*

## Epic 7: Generate the FO.SERV-03 relatório

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 7\."`.)*

## Epic 8: Nameplate from a photo (the reading pipeline)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 8\."`.)*

## Epic 9: More assists: display reading, equipment identity, vision captions, dictation, NC drafts (post-slice)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 9\."`.)*

## Epic 10: Two devices on one relatório: merge, conflicts and full sync status (post-slice)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 10\."`.)*

## Epic 11: Completions after the slice and the dated post-MVP items

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 11\."`.)*

## Epic 12: Field journey and visual refresh (journey review 2026-09-24)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 12\."`.)*

## Epic 13: The photo is the instrument: capture hardening, honest waiting and the emission audit (field UX analysis 2026-10-06)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 13\."`.)*

## Epic 14: Locals, the site checklist and office-created equipment types (Bruno, 2026-10-08)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 14\."`.)*

## Epic 15: Bruno's first production feedback (document of 2026-10-22)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 15\."`.)*

## Epic 16: Bruno's second production feedback (WhatsApp of 2026-10-23)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 16\."`.)*

## Epic 17: Bruno's answers and third production feedback (WhatsApp of 2026-10-27)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 17\."`.)*

## Epic 18: Observing how the app is used (usage events, the funnel, friction)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 18\."`.)*

## Epic 19: Home at scale (shortcuts first; the active list; Emitido behind its tile)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 19\."`.)*

## Epic 20: Conforme, and the field feedback of 2026-11-03

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 20\."`.)*

## Epic 21: The ratio follows the vector group, and the REGISTRO FOTOGRÁFICO in the order of the work (Bruno's WhatsApp of 2026-11-05)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 21\."`.)*

## Epic 22: Bruno's review of a concluded relatório: a PDF without internal lines, a parecer that follows the fichas, seed v12, the previous visit and the office's own types (Bruno, 2026-11-06)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 22\."`.)*

## Epic 23: Bruno's test base as the product's criteria: tables as data, three levels, tests chosen by the nameplate, field help, new tests and the ground grid (seed v13; Bruno and Matheus, 2026-11-08)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 23\."`.)*

## Epic 24: Bruno's answers on the product: a conclusion by his rules, the TAG, the checklists, the previous visit in print and company types (seed v14; Bruno and Matheus, 2026-11-10)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 24\."`.)*

## Epic 25: Bruno's 33 improvements: nothing typed is lost, a ficha that agrees with itself, rows added in the field, the No-break's tests and a print that shows the criterion (seed v15; Bruno and Matheus, 2026-11-11)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 25\."`.)*

## Epic 26: Users, roles and permissions: the Admin manages who enters, each role sees only its modules, and the server refuses the rest (Matheus, 2026-11-21)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 26\."`.)*

## Epic 27: The manual pass of 2026-11-21: the document carries what the screen shows, the impossible is refused, the words are right and the screens fit (seed v17; Matheus, 2026-11-21)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 27\."`.)*

## Epic 28: Bruno's answers of 2026-11-22: the oil's names, a variation note by his numbers, points that start with a priority, the instrument's limit in print, the header's voltage for every row and the items he typed by hand (seed v18; Bruno and Matheus, 2026-11-22)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 28\."`.)*

## Epic 29: Bruno's feedback of 2026-11-23: a signed-in user changes the password, and closing a dialog or going back returns to the screen before (Bruno via Matheus, 2026-11-23)

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 29\."`.)*

## Epic 30: The open-work audit of 2026-11-24: fixes, seed v19, a notice for a removed local, and the unstable tests

*(2026-11-28, Matheus, repository clean-up: this closed epic and its stories moved, text unchanged, to `epics-archive.md` beside this file; find a story there with `grep -n "### Story 30\."`.)*

## Epic 31: The relatório filled by voice: one tap to speak, the audio kept, the text arrives by itself, and an AI control that rewrites a field (Bruno via Matheus, 2026-11-26)

Source: `_bmad-output/planning-artifacts/sprint-change-proposals/sprint-change-proposal-2026-11-26.md` (approved by Matheus on 2026-11-26: "aprovado, os 6 pontos ok, pode seguir"). Read on main `24acd349` (2026-11-26): contract 61, seed v19 frozen, production `b209c0ea` (tag `v0.15.0`). No client and no site is named.

*(2026-11-27, delivery record: built 2026-11-26/27 in PRs #395 (plan and AD-30), #396 (context), #397 (mocks, e31u), #398 (e31a, Stories 31.1 and 31.2, contract 62), #399 (e31e, Story 31.8), #400 (e31b, 31.3 and 31.4), #401 (e31c, 31.5 and 31.6), #403 (e31d, 31.7 and 31.9) and #405 (e31f, the single review-fix batch, 15 items); #402 is a print fix under Story 23.8, extended in #405 to the winding-resistance optional rows of Story 23.15. One integrated read-only code review on `1fde02b3..baa388c9` found 2 blockers (the fake speech provider reachable in production; an audio that could hold the issue forever) and 9 more findings, all taken into #405; one item is only partly fixed (a device put still in the outbox that lands after the transcription job's commit erases the audio's text; row in `deferred-work.md`). Gates: first full gate on `baa388c9` had lint, static, unit and api (1264) green and `test:e2e:full` 818 passed, 7 failed, 4 skipped, all seven one test-only cause (a `getByLabel` that also matched the new mic button), fixed in #405; final gate on `8aefd758`: lint and static clean, unit 8223 of 8223, api 1275 passed 10 skipped, `test:e2e:full` 827 passed 1 failed 4 skipped, `test:e2e:matrix` 162 passed 1 failed 17 skipped; the two reds (`files.spec.ts` 2.2-E2E-002, a 15 s timeout on a 26 MB upload; `company-type.durability.spec.ts` 14.8-E2E-001 on durability-android-chrome, a 30 s download timeout) passed alone twice each (8 of 8 and 2 of 2) while another session's stacks shared the machine: recorded as load-induced, open items to watch, not fixed. Matheus's further decisions of 2026-11-26/27: a tap marked Atual or Extremo with no value is not printed; the winding rows "AT, primeiro tap" and "AT, último tap" are left out when empty; "Dispensar" for any audio that is not done; a failed audio holds the ficha and the issue; Transcribe on in production with this deploy; the mic on the three escopo texts and on the "Marcar não ensaiado" dialog is for a later delivery; the AI control keeps formatting on section texts (#405; inline marks may be lost). Deployed 2026-11-27 as `8aefd758` (production smoke 8 of 8, tag and release v0.16.0, contract 62 minimum 62, no seed change, seed v19 stays current, `stt_provider = "transcribe"` in the operator's tfvars, vocabulary `fasor-production-trade-words` READY); the first smoke attempt did not run because another session held the host lock, and `infra/bin/deploy --resume` ran it. The security pass #404 (merged to main at `ed9dcece` after the tested commit) is not in this deploy and its Terraform is not applied. Still open: the two load-induced reds, inline marks lost on an AI rewrite, the open strings and the trade vocabulary list for Bruno, a real-voice check of Transcribe in production (the smoke sends no audio), the security pass awaiting its own deploy, the retrospective.)*

A field user taps the mic on a text field, speaks and moves on. The audio is kept on the device, goes up when there is signal, is transcribed and written by a model in the backend, and the text arrives in the field marked "Áudio". A spoken measurement reading waits for review. An AI control rewrites the text already in a field when the user asks.

**FRs covered:** FR-40 (rewritten below), FR-41 (the prose exception), FR-42 (extended to audio), new FR-76 to FR-79. **Supersedes** Story 13.9 (Backlog) and the engine of Story 9.4; overrides `SPEC.md` "Dictation is online-only", `source-deltas.md` rows on dictation, and NFR-12's "never by a model" for the conclusion text, the parecer summary and the caption, each recorded in `source-deltas.md`.

- FR-76: A user records an audio on a prose field with one gesture (tap, speak, tap), with or without signal; the audio is saved on the device and queued; the field shows its processing status; the transcript, written by a model at the field's level (polish or report writing), is put in the field marked "Áudio" with a play control and the text as heard; nothing is chosen by the user.
- FR-77: While recording, the device measures the audio by fixed rules (level, clipping, background noise against the voice, length, speech present) and warns live; the measures are stored with the audio; a poor recording leaves "confira o texto" on the field.
- FR-78: A ficha with an audio not yet transcribed is pending and a relatório holding one cannot be issued; a transcription that failed can be retried or dismissed; audio and measures are never deleted.
- FR-79: An AI control (sparkles) on every prose field that holds text rewrites it as report prose on the user's tap, with "Desfazer"; without signal it is shown disabled with the reason; a model never decides a result, adds a fact or changes a number, a unit or a TAG.

**Matheus's decisions (2026-11-26):**
1. One engine, ours: record on the device, upload through the file queue, transcribe in a backend job. The browser's Web Speech engine is removed.
2. No seams: one gesture, no choice, the same with and without signal. The user is only told the processing status.
3. Prose is written straight into the field, marked "Áudio" with a play control. No "Usar".
4. A measurement reading is the exception: shown for review before it counts (the Suggestion contract, AD-12). "Ler visor" by image stays as it is.
5. The word on screen is "Áudio", never "Ditado".
6. A pending audio holds the ficha and the emission.
7. Audio and its quality measures are kept, never deleted, for later analysis.
8. Audio quality is measured on the device by fixed rules, live, with a warning and a "confira o texto" note.
9. No field test first: build, use, improve.
10. Cost accepted (Amazon Transcribe; the price is confirmed in Story 31.8).
11. A line about stored voice on the Conta screen.
12. The photo caption stays automatic, from the photo's content; an audio overwrites it.
13. A model writes every text that comes from audio; the prompt carries the field's context, most of all for a conclusion.
14. A standard AI control, the sparkles icon (`i-sparkles`, already in the sprite), writes from the audio or from the text in the field.
15. The composed conclusion text and parecer summary are rewritten by a model only when the user asks, by speaking into the field or tapping the AI control ("sim, somente se o usuario pedir").
16. The AI control needs signal: without it the control is there, disabled, and says the reason is the connection. Only audio has an offline queue.
17. The six points of the proposal's section 6: text in a field is added to, never replaced (the automatic caption excepted); speech in a measurement table that is not a reading goes to the ficha's Observações as "Áudio" text and the table says so; after three failed attempts the field offers "Tentar de novo" and "Dispensar", and a dismissed audio stops holding the ficha and stays stored; a recording lasts at most three minutes, with a countdown in the last seconds; on "Texto da conclusão" audio adds to the composed text.

**Not in this epic:** speaking a whole ficha in one recording for a model to spread over its fields; audio on nameplate, header and registry fields; a queue for the AI control without signal.

**The two writing levels** (the kernel names the level of each field; the user never picks):

| Level | Fields | What the model does |
| --- | --- | --- |
| Polish | Photo caption, NC item observation, measurement-test reason, "Não ensaiado" reason and note, point text, setup texts | Punctuation, agreement, the trade's words spelled right, filler words removed; same content |
| Report writing | Ficha Observações, Texto da conclusão, parecer summary, relatório section texts; every tap on the AI control | Rewrites as report prose with the field's context |

**Stories, waves and batches:**

| Story | Title | Lane | Wave · batch | Contract | Dev model · Effort |
| --- | --- | --- | --- | --- | --- |
| 31.1 | Audio is a file with a target, a status and its measures | kernel | 1 · e31a | main's plus one (62) | opus · high |
| 31.2 | The server transcribes an audio, writes the text and fills its field | api, kernel | 1 · e31a | with 31.1 | opus · high |
| 31.3 | One tap records, measures and keeps the audio | web | 1 · e31b | no | opus · high |
| 31.4 | The text lands in the field, marked "Áudio" | web | 2 · e31c | no | sonnet · high |
| 31.5 | A spoken reading waits for review | web, kernel | 2 · e31c | no | opus · medium |
| 31.6 | A pending audio holds the ficha and the emission | kernel, web, api | 2 · e31c | none expected | opus · medium |
| 31.7 | The mic on the fields that lack it | web, kernel | 3 · e31d | no | sonnet · medium |
| 31.8 | Amazon Transcribe in production | infra, api | 3 · e31e | no | opus · medium |
| 31.9 | The AI control rewrites the text in the field | kernel, api, web | 3 · e31d | main's plus one if it adds an op or a route shape | opus · medium |

**Definition of Ready of the epic (before wave 1 starts):**
- AD-30 "Voice input" written in the architecture spine (Winston): the audio file and its fields, the transcription job and its provider interface, how prose is written and marked, the reading as a Suggestion, the writing step and its guard, retention.
- The mock and `EXPERIENCE.md` amendments (Sally): the audio button and its recording state with the level meter and the live warning, the field's status line, the "Áudio" mark with play and "texto como falado", the reading's review, the pending-audio lines, the AI control with "Desfazer" and its disabled state. `DESIGN.md` gains the tokens they need.

**Rules every story keeps:**
- **Ownership (AD-1 to AD-3, AD-13).** `packages/domain` owns every status word, count, level, guard and pending rule; `apps/web` renders from IndexedDB and writes ops only; `apps/api` applies ops and runs the jobs.
- **No cloud to build or test.** `STT_PROVIDER` and `LLM_PROVIDER` default to `fake`; the fake providers replay fixtures. Only Story 31.8 touches AWS, through Terraform.
- **No seed and no print change.** A text from audio prints as any typed text; no mark is printed. Every golden stays byte-equal.
- **Permissions (AD-29).** The mic and the AI control follow the field's own write permission; no new key. A control the role lacks is disabled with its one line of reason.
- **Strings.** Derived text (status words, counts) in `packages/domain`; surface copy in `apps/web/src/copy/pt-br.ts`; chrome in `ui.ts`. Every sentence authored is marked `// authored (Story 31.x, listed for Bruno)` and listed in the PR. The strings in these stories are the coordinator's wording, open to Bruno.
- **Screens from the mocks,** checked at 390, 768 and 1280 px and in a dialog; a mock departed from is amended in the same PR.
- **Usage events (AD-28)** for record, transcript arrived, play, retry, dismiss, AI control tap and undo, with closed values only: never audio, transcript or text.
- **Not guessed.** A choice a story must still make is written as "Coordinator's reading, open to Matheus".

**Waves and gates:** wave 1 runs e31a (31.1 then 31.2) and e31b (31.3) side by side; e31b works against the contract of 31.1 and merges main after e31a. Wave 2 is one batch, e31c. Wave 3 runs e31d (31.7 then 31.9) and e31e (31.8) side by side. Gates as decided on 2026-11-12: each batch runs `lint`, `static`, `test:unit`, `test:api` and its touched specs under the host lock; one full gate and one review per wave on the integrated main. Deploy only on Matheus's word; the feature is usable in production only after Story 31.8.

**Definition of Done of the epic:**
- Every story merged with its batch gate in its PR; each wave's full gate green and its review accepted.
- `source-deltas.md` rows marked built; AD-30 amended where the build narrowed it; `docs/kbs/` and `log.md` updated.
- `apps/web/src/speech/webspeech-engine.ts`, `VITE_SPEECH_ENGINE` and every "Ditado"/"Ditar" string gone.
- The strings listed for Bruno in one file under `docs/context/epic-31/`.

### Story 31.1: Audio is a file with a target, a status and its measures

**Dev model:** opus · **Effort:** high · kernel and contract only: the file kind, its schema, the Suggestion source, the status words, the writing level of each field and the pending rule; contract main's plus one (62); batch e31a

As the builder of everything voice does,
I want the audio, where it goes and how it is doing to be one record the kernel understands,
So that the device and the server tell the same story about every recording.

**Definition of Ready:** AD-30 written. Coordinator's reading, open to Matheus: the field names below.

**Acceptance Criteria:**

**Given** the file schema
**When** a file of kind `audio` is created by a device op
**Then** it carries `audio_target` (the address of one field: block and item, sheet field, photo caption, point, section or setup field, or a measurement table), `audio_status` (`queued`, `transcribing`, `done`, `failed`, `dismissed`), `quality` (level, clipped share, noise against voice, duration, speech time, and the verdict `good` or `poor`), and later `transcript_heard`, `transcript_written` and the run that produced them; a file of another kind refuses these fields

**Given** a Suggestion
**When** its source is an audio
**Then** `source` names the audio file in place of a photo, with no bbox and no OCR tokens, and every existing Suggestion still parses

**Given** a field address
**When** the kernel is asked its writing level
**Then** it answers `polish` or `report` by the table of this epic, and `reading` for a measurement table

**Given** a ficha or a relatório
**When** the kernel counts its audios
**Then** `pendingAudios` counts those `queued` or `transcribing`, `failedAudios` those `failed`, a `dismissed` or `done` one counts in neither, and the status words and count sentences ("1 áudio aguardando transcrição", plural by the kernel) come from the kernel

**Given** the quality measures of a recording
**When** the kernel judges them
**Then** `audioQualityVerdict` answers `poor` with its reasons (`low_level`, `clipping`, `noisy`, `too_short`, `no_speech`) by fixed thresholds kept in one place, and `good` otherwise

**Given** a written text and the text as heard plus the prompt's context
**When** the kernel runs `writtenTextGuard`
**Then** it fails when the written text holds a number, a unit or a TAG that neither source holds, or drops one the heard text held

**Definition of Done:** kernel tests "31.1-UNIT-…" for each criterion, red first; the contract test at the new number; an op from a bundle before this story still folds; `docs/kbs/architecture/files-and-photos.md` and `suggestions-and-reading.md`.

*(Outcome, 2026-11-26, batch e31a: built, contract 62 and MIN 62. Narrowings, open to Matheus: the target union adds `test_value` (the measurement-test reason) beside the listed shapes, and `setup` names `additional_info`, `next_intervention_justification` and `parecer_text`; the quality thresholds are the coordinator's first values in `AUDIO_QUALITY_THRESHOLDS`; the audio row carries an optional server-written `not_a_reading`; the cell does not carry the audio, the put's `meta.source_audio_id` and the audio row's target do.)*

*(2026-11-26, review-fix batch e31f, items 5 and 6, no contract change: `writtenTextGuard` reads the heard numbers in order with their units, so two values swapped between phases, or two units swapped between numbers, are refused (`reordered`; a unit said once after two numbers covers both); a sign is part of a number ("-12", "±5"; "menos cinco" is "-5"), so a sign added or dropped is a changed number; and a result word the heard text does not carry (aprovado, reprovado, conforme, não conforme, apto, inapto and their inflections, `GUARD_RESULT_WORDS`; "não" before one is a different word) is refused, the context naming the picked result being no licence. The existing fallbacks apply (the text as heard; no rewrite). Coordinator's reading, open to Matheus: "mais ou menos cinco" reads as "about five", no sign, so a model writing "±5" from it falls back to the text as heard.)*

### Story 31.2: The server transcribes an audio, writes the text and fills its field

**Dev model:** opus · **Effort:** high · api: the `transcription` job, the speech provider interface with its `fake`, the writing step on the existing prose provider, the guard, the system ops; batch e31a

As a field user,
I want the server to turn my audio into good text in the right field without me doing anything,
So that speaking is all it costs me.

**Definition of Ready:** Story 31.1; AD-30. Coordinator's reading, open to Matheus: the prompts are versioned like the reading prompts and live beside them.

**Acceptance Criteria:**

**Given** an audio file is received (WebM/Opus or MP4/AAC)
**When** the upload completes
**Then** one pg-boss `transcription` job is queued, singleton per audio, three attempts; the audio goes `transcribing` by a `system:transcription` op; the job is not started while `AI_FEATURES` is off

**Given** `STT_PROVIDER=fake` (the default) and `LLM_PROVIDER=fake`
**When** the job runs
**Then** the transcript and the written text come from fixtures, with no cloud call

**Given** a transcript for a `polish` or `report` field
**When** the writing step runs
**Then** the prose provider receives the text as heard, the level and the field's context (field, equipment type and TAG; for a checklist observation the item and its answer; for a ficha conclusion the picked result, the NC items and the readings outside their criterion; for the parecer the relatório's counts and restrictions), and returns one text

**Given** the written text
**When** `writtenTextGuard` fails, or the writing call fails for good
**Then** the field receives the text as heard, and the run row says so

**Given** a prose target
**When** the job ends well
**Then** one batch of system ops sets the audio `done` with both transcripts and writes the field: added after the text already there, replacing only a photo caption that was still the automatic one; the cell names the audio as its source

**Given** a measurement-table target
**When** the transcript parses as a reading (`parseTableUtterance`)
**Then** a pending Suggestion is created for the cell, sourced by the audio, and nothing is written to the cell; when it does not parse, the text goes to the ficha's Observações as audio text and the audio records `not_a_reading`

**Given** three failed attempts
**When** the last one fails
**Then** the audio is `failed`; `POST /api/audios/{id}/retranscribe` queues it again; a dismiss is a device op

**Given** any run
**When** it ends
**Then** a run row stores provider, model, prompt version, audio seconds, tokens, USD and duration

**Definition of Done:** api integration tests "31.2-API-…" (each criterion, both formats, tenant scoping, a role without the field's permission refused); fixtures under `apps/api/src/jobs/transcription/fixtures`; the model never receives another company's data; `GET /api/health` unchanged; `docs/kbs/code/api-app.md`.

*(Outcome, 2026-11-26, batch e31a: built. The writing step is a new `WritingProvider` on the Bedrock Converse layer (AD-30), not the image-bound prose provider; three attempts are pg-boss `retryLimit: 2`; a `failed` audio only is queued again (`409 invalid_request` otherwise); the field permission is checked at the push (the audio's create needs the field's key) and again by the job on the creator's role; the not-a-reading text goes through the `report` writing step for OBSERVAÇÕES; no daily quota on transcriptions.)*

*(2026-11-26, review-fix batch e31f, items 2, 3 and 8, no contract change. Item 3: the job rebuilds the field's write inside its batch's transaction, under the company lock, from a fresh read (`applyServerBatch`'s new `compose`), so a text typed while "Transcrevendo" is kept and a parecer verdict, a Não ensaiado reason or a section's config changed meanwhile is never reverted; the reverse order (the device's put still in its outbox landing after the job's) is not fixed and is a row of `deferred-work.md`. Item 8: an audio whose quality says it lasts more than the 3-minute cap plus 10 s (`audioTooLong`, `AUDIO_SERVER_MARGIN_MS`) is never sent to speech, and one the provider reports past it is never written; both fail with a `too_long` reason on the run row. The text as heard is stored as soon as it is heard, so an attempt after a transient failure of the writing step reuses it and pays for speech once. Item 2: "Tentar de novo" also queues a `queued` audio whose bytes the server holds (left with AI features off, or a send lost; `isRetryableAudioStatus`), and the route has a per-user limit (10 a minute, `AUDIO_RETRANSCRIBE_RATE_LIMIT`, `429`); a device dismiss needs the key of the audio's own field and is refused on an audio already `done` (`op_invalid`), accepted from every status that holds.)*

### Story 31.3: One tap records, measures and keeps the audio

**Dev model:** opus · **Effort:** high · web: the recorder that replaces the browser engine, the live measures, the local save and the queue; mock first; batch e31b

As a field user with gloves on,
I want to tap, speak and tap again, and know at once if the recording is poor,
So that I never record a whole observation into noise.

**Definition of Ready:** the mock of the audio button and its recording state; Story 31.1's schema.

**Acceptance Criteria:**

**Given** a prose field or a measurement table the role may fill
**When** the surface renders, with or without signal
**Then** the audio button shows (48 px, mic glyph, its label naming the field, "Gravar áudio …"); it is absent only when the browser cannot record

**Given** the first tap ever
**When** the browser asks for the microphone and the user refuses
**Then** the button stays, and a tap explains how to allow the microphone; nothing is recorded

**Given** a tap on the button
**When** recording starts
**Then** the button is pressed with "Gravando" and the elapsed time, a level meter moves with the voice, the screen stays awake, any other recording stops first, and a second tap ends it

**Given** a recording in progress
**When** the level is too low, the signal clips or the noise is close to the voice for longer than the kernel's threshold
**Then** one line warns live ("Fale mais perto do aparelho", "Muito alto, afaste um pouco", "Muito ruído em volta"), said once by the live region

**Given** two minutes and fifty seconds of recording
**When** the time runs
**Then** a countdown shows and the recording ends itself at three minutes

**Given** the recording ends
**When** it holds speech
**Then** the audio is saved in IndexedDB with its measures and verdict, the `file` create op with `audio_target` goes to the outbox in the same commit, and the field shows "Áudio guardado, aguardando sinal" offline or "Enviando" online; a recording that is `too_short` or `no_speech` is not saved and the field says "Não ouvi nada, grave de novo"

**Given** the upload queue
**When** it orders files
**Then** audios go with the files that wait for a reading, before other photos

**Given** the tab is closed or the app is killed during a recording
**When** the app opens again
**Then** no half file is left queued

**Given** the code base
**When** this story merges
**Then** `webspeech-engine.ts`, the `fake` speech engine and `VITE_SPEECH_ENGINE` are gone from the source, the compose file and the production Dockerfile

**Definition of Done:** web tests "31.3-WEB-…" (the recorder behind a seam, the measures on fixed sample buffers, the warnings, the limit); E2E "31.3-E2E-001" (`@p0`, record offline through the test seam, the file and its op are stored and the status line shows) and "-002" (microphone refused); the measures run in an audio worklet or analyser without blocking typing; checked at 390, 768 and 1280 px; `docs/kbs/code/web-app.md`.

*(Outcome, 2026-11-26, batch e31b: built with 31.4. The kernel owns the limits, live warnings and status steps (`audio/recording.ts`); the seam is a `getUserMedia` override with a Web Audio stream (`e2e/support/audio.ts`). Narrowings, open to Matheus: no button on the measurement table until Story 31.5 (e31c); the batch caption and an unsaved point or photo show the button disabled; a local's checklist rows have no mic (no audio target names them); the button hides when AI features are off; usage events skipped (need new contract values).)*

*(2026-11-26, review-fix batch e31f, items 7 and 9: a button that goes away mid-recording ("Concluir" on the point editor, a step change, leaving the ficha, a layout swap) stops and saves the recording to its target as a tap would, no longer throwing it away; only the provider going away (sign-out) keeps nothing. No case is left where the target cannot exist on the device: a button is enabled only on a saved row, and a target removed later is the server's (the job fails it, and the audio can be dismissed). A stop that throws, a commit that fails or no user signed in shows the error line "Não foi possível guardar o áudio. Grave de novo." under the field and says it, instead of losing the recording without a word; the recorder releases the microphone when it fails at stop.)*

### Story 31.4: The text lands in the field, marked "Áudio"

**Dev model:** sonnet · **Effort:** high · web: the status line, the arrival, the mark, play and the text as heard on the six prose fields already wired; the Conta line; batch e31c

As a field user,
I want to see what is happening to my audio and find the text in its place,
So that I trust it without checking each step.

**Definition of Ready:** Stories 31.1 to 31.3 merged; the mock of the field states. Coordinator's reading, open to Matheus: the Conta sentence, "Os áudios gravados ficam guardados com o relatório."

**Acceptance Criteria:**

**Given** the NC item observation, the ficha Observações, the measurement-test reason, the photo caption (one photo and a batch) and the point text
**When** an audio targets one of them
**Then** the field shows one status line from the kernel's words, in order: "Áudio guardado, aguardando sinal", "Enviando", "Transcrevendo"; the field stays typeable throughout

**Given** the transcription's ops arrive by sync
**When** the field is on screen or opened later
**Then** the text is in the field with the mark "Áudio", a play control and "Ver texto como falado"; a poor recording adds "Áudio com ruído, confira o texto"; a toast says "N áudios transcritos" once per sync, with "Ver" opening the first

**Given** text typed while the audio was pending
**When** the transcript arrives
**Then** it is added after the typed text, which is untouched

**Given** a photo whose caption is still the automatic one
**When** its audio is transcribed
**Then** the caption is replaced by the written text

**Given** the user edits a text that came from audio
**When** he saves
**Then** the text is his, the mark stays as "Áudio, editado", and the audio and the text as heard stay reachable

**Given** the local copy of an audio was evicted
**When** the user taps play
**Then** it plays from the server with signal, and without signal the control is disabled with "Precisa de conexão para ouvir"

**Given** every surface of this story
**When** it renders
**Then** no "Ditado", "Ditar" or "Ouvindo…" remains, no "Usar" stands between a transcript and a prose field, and the Conta screen carries the line about stored voice

**Definition of Done:** web tests "31.4-WEB-…"; E2E "31.4-E2E-001" (`@p0`, record offline, go online, the text arrives marked on an NC observation), "-002" (caption replaced), "-003" (typed text kept); axe clean; the announcements said by a live region; strings listed for Bruno.

*(Outcome, 2026-11-26, batch e31b: built. `failed` and `dismissed` audios draw nothing (Story 31.6); open risk: online, the batch caption's "Adicionar N fotos" can overwrite the first photo's audio caption if the transcript lands first.)*

*(2026-11-26, review-fix batch e31f, item 10: which audio rows count as transcribed for the arrival toast, and whether its text went into a field, are the kernel's (`isTranscribedAudio`, `audioTextInField`); `state/audio-arrivals.tsx` filters nothing of its own. Item 3 (text typed while the audio was pending) is recorded under Story 31.2.)*

### Story 31.5: A spoken reading waits for review

**Dev model:** opus · **Effort:** medium · web and kernel: the measurement table's audio button and the Suggestion sourced by an audio; batch e31c

As a field user,
I want a reading I spoke to show beside its cell for me to confirm,
So that a wrong digit never enters the relatório by itself.

**Definition of Ready:** Stories 31.1 to 31.3; the mock of the reading's review.

**Acceptance Criteria:**

**Given** a measurement table
**When** the user records "Fase A, 147 giga"
**Then** the table shows its status line, and on arrival the cell shows a pending Suggestion with value and unit, "Confirmar" and "Descartar", and a play control; nothing counts, compares or prints until confirmed (AD-12)

**Given** a cell that already holds a value
**When** a differing spoken reading arrives
**Then** it shows as "Sugerido: … Substituir", and an equal one confirms itself, as for "Ler visor"

**Given** speech that is not a reading
**When** it arrives
**Then** the table says "Não reconheci uma leitura. O texto foi para Observações.", and the text is in the ficha's Observações marked "Áudio"

**Given** the table's "Ler visor" button and typing
**When** this story merges
**Then** both work as before, and "Confirmar todos" treats an audio Suggestion as it treats a display one

**Definition of Done:** kernel tests for the parser on written-out numbers a transcriber returns ("cento e quarenta e sete giga"); E2E "31.5-E2E-001" (`@p0`, spoken reading confirmed) and "-002" (not a reading); the durability specs it touches on the matrix projects.

*(Outcome, 2026-11-26, batch e31c: built with 31.6, no contract change. The table's Audio button sits between "Ler visor" and "Confirmar todos", named "Gravar áudio: leituras de ⟨tabela⟩"; its status line, failed line and live warning go under the title row. A spoken reading is drawn by the display reading's own Suggestion field (play `.audio-src` in place of the crop, "Descartar" under it); an equal typed value confirms it by the existing sweep; a filled cell reads "Sugerido: 147 GΩ", play, "Substituir". The held dictated reading of Story 9.4 (`useTableDictation`, `DictatedMeasurementField`) is deleted. Coordinator's readings, open to Matheus: the "Não reconheci uma leitura" line stays on the table while its newest transcribed speech is that one (a newer reading takes it away); "Substituir" is the only action beside a filled cell, as the mock draws it. No durability spec touched, so no matrix run.)*

### Story 31.6: A pending audio holds the ficha and the emission

**Dev model:** opus · **Effort:** medium · kernel (sheet state and pre-issue), web (ficha, Sumário, Export dialog, Sync status), api (the pre-issue check); batch e31c

As the engineer who signs the relatório,
I want nothing issued while a spoken text is still on its way,
So that the document never goes out with a hole I do not know of.

**Definition of Ready:** Story 31.1's counts. Coordinator's reading, open to Matheus: a `failed` audio also holds the ficha until retried or dismissed.

**Acceptance Criteria:**

**Given** a ficha with an audio `queued`, `transcribing` or `failed`
**When** the kernel computes its state
**Then** the ficha cannot be concluded, its pending summary names the audios, and the row links to the field

**Given** a relatório with such an audio anywhere (a ficha, a photo, a point, a section, the setup)
**When** the user opens the Export dialog or the server checks before issuing
**Then** emission is blocked with the reason from the kernel ("2 áudios aguardando transcrição"), each listed with its place; a preview with the RASCUNHO watermark is still allowed

**Given** an audio that failed three times
**When** its field renders
**Then** it shows "Não foi possível transcrever" with play, "Tentar de novo" (needs signal, disabled without it with the reason) and "Dispensar"; a dismissed audio stops holding the ficha, stays stored, and stays reachable from the field

**Given** the Sync status screen
**When** audios wait
**Then** it counts those to upload, those transcribing and those failed, with the kernel's sentences

**Definition of Done:** kernel tests "31.6-UNIT-…", red first; api integration for the blocked issue; E2E "31.6-E2E-001" (`@p0`, a pending audio blocks concluding and issuing, then frees both on arrival) and "-002" (failed, dismissed); the sheets of seeds v1 to v19 without audio compute as before.

*(Outcome, 2026-11-26, batch e31c: built, no contract change. Kernel `audio/hold.ts` (`heldAudios`, `heldAudiosText`, `audioPlaceText`, `audioSheetStep`, `audioSyncCounts`, `audioSyncLines`); `preIssue` gains two blocking rows on row 9, `audios_pending` and `audios_failed`, each listing its audios with their places, so the server's generate refuses them with `409 pre_issue_blocked` as the dialog does. Coordinator's readings, open to Matheus: a failed audio holds as the DoR says; the ficha keeps offering "Concluir ficha" and the tap refuses with the kernel's sentence and opens the first audio's field (no stepper count); the ficha's line is `.audio-pending` under the sheet header; a dismissed audio keeps its mark only until a newer audio's text lands in the field; Sync status counts "aguardando envio" (not uploaded), "aguardando transcrição" (uploaded and queued, or transcribing) and "não transcritos" over every relatório on the device. Usage events still skipped (they need new contract values, as in 31.3).)*

*(2026-11-26, Matheus confirmed the Definition of Ready's reading: a failed audio holds the ficha and the emission until "Tentar de novo" or "Dispensar"; the reading is no longer open.)*

*(2026-11-26, review-fix batch e31f, item 2, decided by Matheus the same day ("Dispensar na lista de pendências"): in the Export dialog's audio rows and on the ficha's hold line, every audio that holds (queued, transcribing, failed, its field removed or not) offers "Dispensar", and "Tentar de novo" where it applies (a failed audio, or a queued one the server holds), by the kernel's `heldAudioActions` (`HeldAudioButtons`, each named with the audio's place); both follow the field's write permission and "Tentar de novo" needs signal. The audio stays stored. The server takes the dismiss from every status that holds, with the field's key (recorded under Story 31.2). Strings for Bruno: "Tentar de novo: ⟨lugar⟩" and "Dispensar: ⟨lugar⟩" (the buttons' accessible names). Mock `62-audio-estados.html` (g) amended.)*

### Story 31.7: The mic on the fields that lack it

**Dev model:** sonnet · **Effort:** medium · web and kernel: the audio button and the arrival on the remaining prose fields, each with its level and context; batch e31d

As a field or office user,
I want to speak wherever I would type a sentence,
So that voice is the same everywhere.

**Definition of Ready:** wave 2 merged. Coordinator's reading, open to Matheus: the setup fields that get the mic are the capa text, the escopo texts and the additional items; names, TAGs, CNPJ and other short identifiers do not.

**Acceptance Criteria:**

**Given** the "Não ensaiado" reason and note, the relatório section texts, the setup texts above, "Texto da conclusão" and the parecer summary
**When** each renders for a role that may fill it
**Then** it has the audio button, the status line, the mark, play and the text as heard, as in Story 31.4

**Given** a section text (rich text)
**When** a transcript arrives
**Then** it is added as a new paragraph at the end, and the existing formatting is untouched

**Given** "Texto da conclusão" or the parecer summary holding the composed text
**When** the user records an audio there
**Then** the written text is added after the composed text at the report level, with the conclusion's or the parecer's context in the prompt; the field becomes the user's edited text, as "Editar" does today; the picked result is never changed

**Given** the composed text and no audio and no tap on the AI control
**When** the ficha is filled
**Then** the text is composed on the device as before, with no model call

**Definition of Done:** web tests per field; E2E "31.7-E2E-001" (`@p0`, audio on the conclusion text adds to the composed text) and "-002" (section text paragraph); goldens byte-equal.

*(Outcome, 2026-11-26, batch e31d: built, no contract change. The mic, status line, mark and play sit on: the utility's "Não ensaiado" justification (the stored mark's note; the dialog that picks the reason has no stored field yet, so no mic there), "Texto da conclusão" (an audio adds to the composed text and the field becomes the edited text), the section text surface (a new paragraph; the area redraws when the stored text moves while nobody types in it), the capa's "Informações adicionais", the next intervention's justification and the parecer summary (once a verdict is tapped). Kernel: `audioRichFieldText`; the Não ensaiado write adds to the utility's shown default when no note is stored. Narrowing, open to Matheus: the escopo `local` and exclusions and the additional items are not in the closed `audio_target` union, so they have no mic; a new target value would need a contract number. The deferred-work row of e31c is closed: `assignPhotoBatch` skips the caption of a photo whose caption moved since it was saved.)*

*(2026-11-26, review-fix batch e31f, item 15, test only: the full e2e gate on main `baa388c9` had 7 reds of one cause, the new Audio button's name ("Gravar áudio: informações adicionais", "Gravar áudio: justificativa da próxima intervenção") also matching `getByLabel('Informações adicionais')` and `getByLabel('Justificativa')`. Those locators are `getByRole('textbox', { name: … })` now in `altitude-na`, `relatorio` (two), `export` (two), `review-field-defects-2` and `status-flow-2026-10-10`; no other `getByLabel` of a spec or a support helper names text inside a mic or AI control label. The button's label is unchanged. Item 13 (the mic on the escopo texts and the "Marcar não ensaiado" dialog) is a row of `deferred-work.md`, for a later delivery.)*

### Story 31.8: Amazon Transcribe in production

**Dev model:** opus · **Effort:** medium · infra (Terraform) and api (the `transcribe` provider); the only story that touches AWS; batch e31e

As Matheus,
I want the real transcriber on, costed and under the budget alert,
So that voice works on Bruno's tablet without a surprise on the bill.

**Definition of Ready:** the price read on the AWS pricing page for the region used and written in the story's PR; Bruno's list of trade words (a first list authored from the seed's own vocabulary if his has not come). Coordinator's reading, open to Matheus: batch transcription (not streaming), pt-BR, the job reading the audio from the bucket.

**Acceptance Criteria:**

**Given** `STT_PROVIDER=transcribe`
**When** the job runs
**Then** it starts an Amazon Transcribe job on the stored audio in pt-BR with the custom vocabulary, waits for it within the job's own timeout, reads the transcript and per-word confidence, and classifies errors as transient or permanent like the Bedrock adapter; credentials come from the task role only

**Given** `infra/`
**When** `infra/bin/check` runs
**Then** the Transcribe permissions (least privilege, this bucket only), the custom vocabulary, the `STT_PROVIDER` setting and the cost row are Terraform; nothing is made in the console

**Given** the cost table of `infra/README.md`
**When** this story lands
**Then** it carries Transcribe and the writing calls at a stated monthly volume, and the total stays under USD 100 with the AWS Budget alert unchanged

**Given** the deploy that ships it, on Matheus's word
**When** the smoke run ends
**Then** one audio recorded in the smoke company is transcribed and written in production, and its run row shows seconds and USD

**Definition of Done:** unit tests of the adapter against recorded responses; no test calls AWS; `docs/kbs/architecture/infra-aws.md`; the deploy record.

*(2026-11-26, batch e31e: built as far as the code and the Terraform; not applied, no deploy. The `transcribe` adapter (`speech-transcribe.ts`), `transcribe.tf`, `stt_provider` (default `fake`), the cost row (USD 0.006 a minute, confirmed 2026-11-26 from the AWS Price List API, publication 2026-11-21; 600 min = USD 3.60, total 92.74) and the budget deny extension are in. Open for Matheus: apply `stt_provider = "transcribe"`, and the AC of the smoke run (one audio transcribed in the smoke company) waits for his deploy. Bruno's trade-word list replaces the first list authored from the seed.)*

*(2026-11-26, review-fix batch e31f, item 1: a production process with AI features on refuses to boot while `STT_PROVIDER` is `fake` (`config.ts`, as `EMAIL_PROVIDER=fake` is refused), so no audio is answered with the fixture's canned text. No `terraform.tfvars` changed: before the next deploy with `ai_features = "on"` the operator sets `stt_provider = "transcribe"` (or the api will not boot).)*

### Story 31.9: The AI control rewrites the text in the field

**Dev model:** opus · **Effort:** medium · kernel (the request and its guard), api (one route on the prose provider), web (the control, "Desfazer", the disabled state); batch e31d

As a user who typed or spoke something rough,
I want one tap to turn it into report writing,
So that the relatório reads well without me rewriting it.

**Definition of Ready:** the mock of the AI control; wave 2 merged. Coordinator's reading, open to Matheus: the control shows on every prose field of Stories 31.4 and 31.7 that holds text; its label is "Melhorar o texto com IA".

**Acceptance Criteria:**

**Given** a prose field holding text, with signal and a role that may fill it
**When** it renders
**Then** the AI control shows beside it (the `i-sparkles` glyph, 48 px, labelled); on an empty field it is absent

**Given** a tap on the control
**When** the request runs
**Then** the server writes the field's text at the report level with the field's context, runs `writtenTextGuard`, and answers the new text; the control shows "Escrevendo" meanwhile and the field stays as it was

**Given** the answer
**When** it passes the guard
**Then** the new text replaces the old one by an ordinary op, the field shows "Texto melhorado por IA" with "Desfazer", and "Desfazer" puts the former text back by another op

**Given** the guard fails or the call fails
**When** the answer comes
**Then** the field is unchanged and one line says "Não foi possível melhorar o texto"

**Given** no signal
**When** the field renders
**Then** the control is there, disabled, with "Precisa de conexão" as its reason; nothing is queued

**Given** "Texto da conclusão" or the parecer summary
**When** the user taps the control
**Then** the composed text is rewritten with the conclusion's or the parecer's context and becomes the user's edited text; the result is never changed; without a tap or an audio the text stays composed on the device

**Given** any call
**When** it ends
**Then** a run row stores model, prompt version, tokens and USD, and the route is rate-limited per user

**Definition of Done:** kernel, api and web tests; E2E "31.9-E2E-001" (`@p0`, rewrite and undo on an NC observation), "-002" (offline, disabled with its reason), "-003" (the conclusion text); a role without the field's permission gets 403; strings listed for Bruno.

*(Outcome, 2026-11-26, batch e31d: built, no contract change (the route and its body are additive; `meta.ai_written` rides the loose op meta). Kernel `audio/rewrite.ts`: `aiRewriteSource`, `aiRewriteVerdict` (`writtenTextGuard` with the field's text as the source), `aiRewriteWrite` (replaces, never adds), `aiRewriteRestore`. Route `POST /api/relatorios/{id}/write` (`apps/api/src/http/ai-write.ts`) with AD-15's barrier (`last_op_id`), the field's own key (`permissionForPath`, as the retranscribe route), 20 taps a minute per user, prompt version `transcription-write-field-1`, a `transcription_runs` row with `kind = 'ai_write'` (migration 0009: `kind`, `user_id`, `target`; `audio_id` and `speech_provider` nullable). E2E numbering: "-003" is the guard's refusal and "-004" the conclusion text. Narrowings, open to Matheus: no control on the batch caption (its text is not stored before "Adicionar N fotos") nor on a point not saved yet; a section text is rewritten as plain paragraphs (its formatting comes back with "Desfazer"); the sheet OBSERVAÇÕES shows no control while it only shows its suggestion; no usage event (none of Stories 31.3 to 31.7 added one).)*

*(2026-11-26, review-fix batch e31f, items 4 and 12, no contract change. Item 4: "Desfazer" puts back only the former text (`aiRewriteFormer`, taken before the write) onto the field as it is at the tap (`aiRewriteRestore` on a fresh snapshot), never a whole former object, so a parecer verdict, a Não ensaiado reason or a section's config changed after the write stays. Item 12, decided by Matheus the same day: ~~a section text is rewritten as plain paragraphs (its formatting comes back with "Desfazer")~~ a section text keeps its formatting: the server rewrites it block by block (one writing call per paragraph or list item, the usage summed on one run row), the answer holds one line per block, and the write gives each block back its kind (a list item is never written back as a paragraph) and keeps bold and italic on the words the model left verbatim (`remarkRuns`); an answer with another block count is no write. The guards run per block. Coordinator's reading, open to Matheus: a mark on words the model changed is lost (the block structure is always kept).)*

### Story 31.10: The audio and AI controls sit in the field's own bar, the AI proposes before it writes, and a refusal says why

**Dev model:** opus · **Effort:** medium · mock and DESIGN.md (the field bar), kernel (the word diff, the refusal text), api (the guard's kinds on the answer), web (the bar, the comparison, the reasons); one batch

*(Added 2026-11-27, Matheus, after using v0.16.1 in production. Three findings on the Conclusão of a ficha: the two controls sit under "Critérios usados" and the "Confirmado" line, far from the text they act on; "Não foi possível melhorar o texto" gives no reason (the production log shows the guard refused the model's text twice on a conclusion text full of readings, and accepted an observation with none); "Desfazer" alone does not let the user compare the two texts. A UX review drew three placements; Matheus chose the bar inside the field ("Opcao A ficou a melhor") and approved the comparison and the reasons. He also decided the AI control stays on "Texto da conclusão".)*

As a user who speaks or improves a text,
I want the two controls on the field itself, to see the AI's text beside mine before it replaces anything, and to be told why when it cannot,
So that I know which text I am changing, choose the better one, and am never left with a failure I cannot read.

**Definition of Ready:** Matheus's choice of 2026-11-27 (above). Part A of this story draws the mock before any screen work: `mockups/components.css` gains the field bar, `prototype/screens/62-audio-estados.html` shows it at rest, recording, comparing and refused, and `DESIGN.md` rows "Audio button" and "AI control" are amended with the old text struck through. No new token and no new color. Every new string is authored and listed for Bruno.

**Acceptance Criteria:**

*The bar*

**Given** a prose field that has the Audio button today (an NC observation, the conclusion observations, a measurement test's reason, a photo caption, a point text, "Texto da conclusão", the parecer, a section text, a setup text, the "Não ensaiado" reason band)
**When** it renders
**Then** the field's box holds the text and, under a hairline, one bar: at its start a Text-button-shaped "Gravar áudio" (the `i-mic` glyph 24 px and the word, 48 px tall, `aria-label` "Gravar áudio: ⟨campo⟩" as today), at its end "Melhorar o texto com IA" in the same shape; no control stays at a section head or under the lines below the field

**Given** such a field with lines under it ("Critérios usados", the confirmed helper, a suggestion's actions)
**When** it renders
**Then** those lines follow the box, in the order they have today, with no control between them

**Given** a recording on that field
**When** it runs
**Then** the first control reads "Parar" with the stop glyph on a `primary` round, followed by "Gravando", the elapsed time and the level meter (the countdown and the live warning as today), and the AI control is disabled until the recording ends

**Given** an empty field, no signal, or a browser that cannot record
**When** the bar renders
**Then** the rules of Stories 31.3 and 31.9 hold unchanged: the AI control is absent on an empty field and disabled with "Precisa de conexão" offline; with no way to record the audio control is absent, and a bar with no control is not drawn

**Given** a Measurement table
**When** it renders
**Then** its action row keeps the round Audio button beside "Ler visor"; this story does not touch it

**Given** a width of 390 px
**When** the bar renders
**Then** the two controls wrap onto two lines inside the box, each 48 px tall, and nothing is clipped

*The comparison*

**Given** a tap on "Melhorar o texto com IA" and an answer that passes the guard
**When** it arrives
**Then** nothing is written: the box shows "Seu texto" and "Texto proposto pela IA" side by side (stacked on the phone, the user's first), the words the proposal changed marked in it by weight and an underline (never by color alone), and the bar holds "Manter o meu texto" and the primary "Usar o texto da IA"

**Given** the comparison is open
**When** the user taps "Usar o texto da IA"
**Then** the text replaces the old one by the ordinary op of Story 31.9 (with `meta.ai_written`), the line "Texto melhorado por IA" and "Desfazer" show as today, and the tap works without signal

**Given** the comparison is open
**When** the user taps "Manter o meu texto", or leaves the screen
**Then** the proposal is dropped, no op is written and the field is as it was

**Given** the comparison is open
**When** the field's text changes (typed here, or arrived from another device)
**Then** the proposal is dropped and one line says the text changed while the AI wrote

**Given** a section text
**When** the comparison shows
**Then** each side keeps its paragraphs, lists and headings, as the block-by-block rewrite of batch e31f gives them

*The reasons*

**Given** an answer that is not a new text
**When** it arrives
**Then** the field is unchanged and one line inside the box, above the bar, says which case it was, in two parts (what happened to the text, then why): the guard refused a number, a unit or a TAG; the guard refused an added result word; the provider failed; the company's daily limit is reached; the per-user rate limit is reached; the server has not applied every op yet; the text changed meanwhile. The AI control then reads "Tentar de novo" where a new tap can help, and is disabled with the reason where it cannot (the daily limit)

**Given** a guard refusal
**When** the server answers
**Then** the answer carries the kinds the guard named (`number`, `unit`, `tag`, `result`) as an optional field beside `reason: 'guard'`; no value of the text travels in it, the run row keeps the full reason as today, and a device on the older build still reads the answer

**Given** "Texto da conclusão" or the parecer summary
**When** the guard refuses
**Then** the AI control stays on the field (Matheus, 2026-11-27) and the line says why

**Definition of Done:** the mock and `DESIGN.md` amended first, `components.css` copied byte-identical and its `.frame-*` rules translated in `app.css`; kernel tests for the word diff (numbers, units and TAGs never marked as changed, since the guard keeps them) and for each refusal text; api tests for the optional kinds; web tests for the bar on every field named above; E2E "31.10-E2E-001" (`@p0`: the bar on an NC observation, propose, compare, use, undo), "-002" (keep mine: no op written), "-003" (a guard refusal on the conclusion text names the reason), "-004" (the daily limit disables the control with its reason), "-005" (390, 768 and 1280 px, recording state included); the specs of Stories 31.3, 31.4, 31.7 and 31.9 that locate the old controls updated; no contract bump unless the build finds one is needed, then it is reported before the merge; the strings listed for Bruno.

**Coordinator's readings, open to Matheus:** a proposal is kept in memory only, so a reload drops it and the call is still counted in the daily usage; a single-line field (a photo caption) gets the same bar under its input; "Desfazer" stays after "Usar o texto da IA" as it is today; the three escopo texts and the "Marcar não ensaiado" dialog, which have no Audio button yet, stay out (their deferred row is unchanged).

*(Outcome, 2026-11-27, batch e31h, branch `e31h-field-bar`: built, no contract number (the two answer fields are optional and additive). Part A first: `components.css` "Field bar" (`.field-tray`, `.field-bar`, `.audio-glyph`, `.audio-word`, `.audio-stop-word`, `.ai-compare`, `.ai-side*`, `.ai-changed`, `.ai-reason*`; two `.frame-phone` rules, translated in `app.css`), `62-audio-estados.html` group (h) at rest, recording, comparing, refused and at the daily limit, `DESIGN.md` rows "Audio button" and "AI control" amended (old text struck, dated), `MOCK-GUIDE.md` § 2026-11-27. Kernel: `audio/proposal.ts` (`aiRewriteDiff`, a word diff that never marks a number, a unit after a number or a TAG, by `guardedWordFlags` in `guard.ts`; `aiRewriteRefusalText`, the two-part line of each case and whether "Tentar de novo" applies), `aiRewriteComparison` in `rewrite.ts` (a section text keeps its blocks and kinds on both sides). Api: `ai-write.ts` makes the run row's id first and answers it as `run_id`, and `guard_kinds` (the distinct kinds of the guard's reasons, never a value) on a guard refusal. Web: `AudioField` is the field bar, drawn as the input's next sibling on every field the story names (`GeneratedTextField` takes it as `tray`, so "Critérios usados" and the helpers follow it); the answer is a proposal in memory; "Usar o texto da IA" writes it by the op of Story 31.9 with `meta.ai_run_id`; "Manter o meu texto" or a text change drops it and, online, posts `{run_id, outcome: 'refused', action}` to `POST /api/relatorios/{id}/write-outcome` (Epic 32's route, fire and forget). Readings, open to Matheus: the input stays visible and typeable above the comparison, so "Seu texto" repeats it beside the proposal; while the field records, the AI control is disabled with "Disponível quando a gravação terminar"; a control's disabled reason is the bar's own line under its row; the "text changed" line opens with "A proposta da IA foi descartada." instead of "O texto foi mantido como estava."; the daily limit's line replaces `quotaExceededText('ai_write')` on this control (Matheus's sentence of the proposal); the batch caption and a point not saved yet keep the bar with the audio control only; a guard refusal from an older server (no kinds) or an empty answer reads "A IA não devolveu um texto que pudesse ser usado." The strings are appended to the Epic 31 row for Bruno in `deferred-work.md`. Tests written, not run in the batch (Matheus, 2026-11-27: the gate runs once on the integrated branch): `proposal.test.ts`, `ai-write.test.tsx`, `audio-field.test.tsx`, `audio-fields-remaining.test.tsx`, `client.test.ts`, `ai-write.integration.test.ts`, E2E `ai-field-bar.spec.ts` ("31.10-E2E-001" `@p0` to "-005"), `ai-write.spec.ts` and `audio-recording.spec.ts` updated.)*

## Epic 32: Every AI answer and what the user did with it is recorded, so the AI's quality can be judged (Matheus, 2026-11-27)

*(Asked by Matheus on 2026-11-27, after the first day of voice and AI writing in production: "Precisamos registrar os textos, as correcoes e salvar tudo em uma tabela para que seja avaliado depois e criado uma rubrica para testar a qualidade da IA. Isso deve ser feito com TUDO que usar IA, inclusive extracao de campos de imagens." Not built. What exists today: `reading_runs` and `transcription_runs` keep the model, the prompt version, the cost and the outcome of each call, and `reading_runs` keeps the OCR result; neither keeps the text the model wrote beside what the user finally kept, and a correction lives only as an ordinary op in the log, not tied to the answer it corrects.)*

**Goal:** one table that holds, for every answer an AI gave, what went in, what came out and what the user did with it (kept, changed to what, thrown away), across every AI use of the product; then a rubric and a way to read the table against it.

**Scope:** every call through `LLM_PROVIDER`, `OCR_PROVIDER` and `STT_PROVIDER`: the plate reading (each field read from a nameplate photo), "Ler visor" (each reading from a display photo), the transcription of an audio (the text as heard, the text as written, each spoken reading), the AI control of Stories 31.9 and 31.10 (the proposal), and "Conferência por IA" (each finding). A new AI use added later is in scope by rule (Story 32.1's guard test).

**Constraints:** the records hold client text, so they live only in the product's database, per company, never in a tracked file, a log line or a usage event; the public repository gets the rubric and the tools, never a record. Storage is PostgreSQL rows, with no new AWS service, so the monthly ceiling is not touched. No user-visible change in this epic.

### Story 32.1: One record per AI answer, and the user's correction joined to it

**Dev model:** opus · **Effort:** high · kernel (what an answer is, how a later op settles it), api (the table, the writes at each provider call, the settle on the op path), no web change expected; one batch

As the person responsible for the product's quality,
I want every AI answer stored beside what the user finally kept,
So that I can measure, later, how often the AI was right and where it was wrong.

**Definition of Ready:** Matheus's request of 2026-11-27 (above). Open to Matheus before the build: (1) how long the records are kept (proposed: forever, as the audio is); (2) whether a record keeps the full input text (proposed: yes for text; for a photo or an audio only its file id, since the file itself is already kept); (3) what counts as the user's answer to a "Conferência por IA" finding (proposed: whether the field the finding names changed before the next emission, since a finding has no confirm action today).

*(2026-11-27, Matheus's answers, built to: (1) the records are kept forever, with no purge, as the audio is; (2) a record keeps the full input text, and for a photo or an audio only the file id; (3) a "Conferência por IA" finding counts as acted on when the field it names changed before the next emission, otherwise it closes as unanswered.)*

**Acceptance Criteria:**

**Given** any AI use in scope
**When** the provider answers
**Then** one row per answered item is written in the same transaction as the run row: the company, the relatório, the kind of use, the run it came from, the target (the field, the cell, the photo, the audio, by id and path), the input (the source text, or the file id), the answer as the model gave it, and, where the product changed it before showing it (a guard's fallback, a normalization), the text shown and why

**Given** a plate or display reading
**When** it is recorded
**Then** each field read is its own row (the field's key, the value read, the confidence when the provider gives one), and so is a field the model was asked for and left empty

**Given** an answer the user confirms as it is (a Suggestion confirmed, "Usar o texto da IA", a text from audio left untouched)
**When** the op that settles it is applied on the server
**Then** the row gets the outcome "kept", the final value, who and when

**Given** an answer the user changes (a Suggestion edited before confirming, a text from audio or from the AI control edited afterwards)
**When** the op is applied
**Then** the row gets the outcome "changed" and the value the user wrote; later edits of the same field update the final value until the relatório's revision is emitted, when the row is closed

**Given** an answer the user refuses ("Descartar", "Manter o meu texto", "Desfazer", "Dispensar")
**When** it is applied or, for a proposal that writes no op, reported by the device
**Then** the row gets the outcome "refused" with which action it was

**Given** an answer nobody settled
**When** the revision is emitted
**Then** the row is closed as "unanswered"

**Given** a device that was offline
**When** its ops arrive later
**Then** the rows are settled then, with the op's own time; nothing on the device changes and no status or count on any screen is derived from this table (AD-1 to AD-3 unchanged)

**Given** the guard of an audio or of the AI control refuses the model's text
**When** it is recorded
**Then** the row keeps the model's text, the guard's reasons and what the user was given instead

**Given** a new call site of a provider added in a later story
**When** `test:unit` runs
**Then** a guard test fails unless that call site writes its rows (it lists the provider seams and the recorder calls)

**Definition of Done:** one migration; kernel tests for the settle rule on every outcome; api integration tests for each AI use in scope (rows written, rows settled, the offline order); the smallest e2e that proves one full path end to end (a plate field read, edited, confirmed, and its row); the `fake` providers write the same rows; no contract bump unless the device must report a refused proposal, then it is additive and reported before the merge; `docs/kbs` updated.

*(2026-11-27, built as batch e32a on branch `e32a-ai-records`, with Story 32.2; the gate is run once by the coordinator on the integrated branch. One table, `ai_answers` (migration `0011_ai_answers`), one row per answered item of every AI use (`plate`, `display`, `caption`, `nc_obs`, `panel`, `audio_text`, `audio_reading`, `ai_write`, `audit_finding`), written by the kernel's builders (`packages/domain/src/ai-answers/build.ts`) through `recordAiAnswers` in the transaction of the run row: the reading job's batch, the transcription job's batch (inside its `compose`), the AI control's run row (now one transaction with its record) and the audit's done batch. The kernel's `settleAiAnswers` settles the open records of the relatórios each push or server batch touches, in its transaction, under a savepoint whose fault is logged and never refuses an op; the emission of a revision closes them. A Suggestion settles by its confirm, its discard (`changed` when the user typed a value over it), its undo or a newer reading (`unanswered` / `superseded`); "Usar o texto da IA" is matched by `meta.ai_run_id`, else by the latest open proposal of the field; "Desfazer" is a user put that brings the field back to the user's text. The device's report of a proposal it did not write is the additive route `POST /api/relatorios/{id}/write-outcome` (`packages/domain/src/contract/ai-answers.ts`), with no contract version change. Readings of the build, open to Matheus: a value the model answered that the product dropped, a guard's refusal of the AI control and an audio with nothing heard are written already settled `refused` with the action `withheld` (the product's refusal, counted apart from the user's); a call that failed answered nothing and has no record; a text from audio left untouched is `kept` / `untouched` at the emission; "Dispensar" acts on an audio before any answer exists, so it settles nothing; the fields left empty are recorded for the plate only (the display reading asks the OCR for no list of fields); a section's AI control refusal keeps only the last block's text as the model's answer (the route keeps no joined text before the guard). The guard test is `scripts/ai-answers-guard.test.ts` (in `test:unit`).)*

### Story 32.2: A rubric for the AI's quality and a tool that reads the records against it

**Dev model:** opus · **Effort:** medium · one document, one read-only CLI, no screen

As the person responsible for the product's quality,
I want a written rubric and one command that scores the recorded answers against it,
So that the quality of each AI use is a number I can follow from one version of a prompt or model to the next.

**Definition of Ready:** Story 32.1 in production for long enough to hold real answers (Matheus says when). Open to Matheus: whether the scoring is counts only, or also a model judging the texts (a judge costs money per run and needs his word each time, as the plate eval does).

*(2026-11-27, Matheus's answer: counts only. A model judging the texts is left for later, as the work of an ML engineer ("vamos julgar a posteriori, vai ser trabalho de um MLE"); the rubric says so and names the columns that work will read. He said to build everything, so this story is built now, before Story 32.1 has held real answers; its first report run with him stays owed and is not part of batch e32a.)*

**Acceptance Criteria:**

**Given** the rubric document
**When** it is read
**Then** it defines, for each AI use, what "right" means and how it is measured: for a field read from a photo, exact match with the final value, then kinds of error (a wrong digit, a wrong unit, a field left empty, a field invented); for a spoken reading, the same; for a text from audio or from the AI control, kept, changed (by how much: the share of words changed) or refused, and the guard's refusals by kind; for a finding, acted on or not. It holds no client text

**Given** the CLI, run as the read-only task the production reads already use
**When** it runs for a period
**Then** it prints, per AI use, per model and per prompt version: how many answers, the share kept, changed, refused and unanswered, the rubric's error kinds, and the cost per kept answer; counts and shares only, never a text

**Given** the same command with a company's own operator asking for examples
**When** it runs
**Then** it writes the worst cases of one AI use to a local file outside the repository, for a person to read; that mode is refused without an explicit flag and is never the default

**Definition of Done:** the rubric in `docs/`, the CLI with its tests on the `fake` rows, `infra/README.md` says how to run it in production, the first report run with Matheus and its counts recorded in the records PR.

*(2026-11-27, built as batch e32a with Story 32.1: the rubric `docs/ai-quality-rubric.md`, the kernel's measures and report (`packages/domain/src/ai-answers/rubric.ts`), the read-only CLI `apps/api/src/db/ai-answers-read-cli.ts` with its tests on `fake` rows (`ai-answers-read.integration.test.ts`), and the runbook entry "Read the AI answer records" in `infra/README.md`. The examples mode is refused without `--examples`, `--company` and an `--out` outside the repository, never writes over a file, and is not run on the production migrate task (its disk is thrown away; the README says so). Still owed: the first report run with Matheus and its counts in the records PR.)*

## Backlog: deferred stories

Stories moved out of their epic with a dated decision, so the epic can close. Each keeps its text, number and Definition of Ready where it was written; this list is where they wait. A story leaves this list when a dated line schedules it into an epic.

- ~~*(2026-10-21, Bruno via Matheus, answer 11; closes E13-A9)* Story 13.9: Dictation on, behind one line of consent. Text under Epic 13. Definition of Ready still open: Matheus decides the consent wording and confirms `webspeech` as the shipped default engine.~~ *(2026-11-26, Matheus: superseded by Epic 31. The browser engine is removed, so its consent question no longer exists; the story leaves this list unbuilt.)*

*(2026-11-04, built as batch e20e with 20.11 to 20.13, PR #240 merged as `76cbdb79`. Narrowings: the telemetry per-user limit is 2000/min (authored); telemetry and body-less requests are exempt from the JSON rule; the per-e-mail sign-in lockout stays as an accepted risk in `deferred-work.md`; Caddy did turn the early 413 into a 502, fixed in the api, and the Caddyfile adds HSTS and drops `Server`. Integrated review of `76cbdb79` (`_bmad-output/test-artifacts/review-e20-integrated-2026-11-04.md`) and fix batch e20f, PR #241 merged as `df65be05`: files of a removed relatório answer 404; a telemetry event dated more than 10 min ahead is bounded.)*
