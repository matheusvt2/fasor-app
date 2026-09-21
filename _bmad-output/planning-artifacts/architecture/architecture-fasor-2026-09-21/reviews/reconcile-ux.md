# Reconcile: UX spines → Architecture spine (fasor)

Reviewed on 2026-09-21. Sources: `ARCHITECTURE-SPINE.md` (draft, 23 ADs) against `EXPERIENCE.md` v0.8.0 (Foundation, Block Model, Smart Input, Capture-to-Document, Registries, Component and State Patterns, Interaction Primitives, Offline & Sync, Handed to architecture, Open Questions › Inputs for architecture), `review-architecture.md` (2026-09-18) and `DESIGN.md` v0.8.0 (frontmatter, Typography, Components). The mockup CSS the spine adopts in AD-23 (`mockups/tokens.css`, `mockups/components.css`) was checked for the facts AD-23 relies on.

What matches is not restated. Each item names the UX location, the spine location (or its absence) and what is missing. Severity: high = a builder will invent it or ship without it; medium = the rule exists in the UX but has no data or contract home; low = a detail that will drift.

**Verdict.** The spine lands every structural decision the UX handed over (ownership, tree, paths, ids, photo durability, renderer, revisions, criteria, attribution, tombstones, seed) and defers multi-device merge legitimately under the one-device decision. What did not land is the client's operational state: draft recovery and autosave granularity, per-relatório download state, the Sync status counts and per-user last send, job status for readings and generation, and the preview file itself. One decision contradicts the UX outright (no home-screen install versus the UX's install banner and Account row), and one AD-12 rule contradicts the "never overwrite, offer Substituir" behavior.

## Missing

### M1 (high) — Draft recovery and autosave semantics have no home

- UX: Interaction Primitives › Autosave ("debounced — value is architecture's call; the UX only requires that leaving a field never loses it"; hidden "Salvo" announced at most every few seconds); State Patterns › Draft found ("Rascunho encontrado — Recuperar" when a local unsaved draft exists for this surface; "Recover merges; dismiss keeps the draft for later"); Form dialog "Draft kept on close"; Flow 2 failure (tab closed mid-sheet).
- Spine: AD-1 and AD-3 make every write an op applied locally before anything else; no debounce value, no rule for how a text field becomes ops (per debounce window, per blur), no outbox coalescing rule, no draft table in `src/db`.
- Gap: under AD-1 an "unsaved local draft" cannot exist unless something holds state outside the outbox. The spine must say one of two things: drafts do not exist because every debounced change is already an op (then the UX state pattern is retired and the Form dialog's "draft kept on close" becomes an unsaved-entity rule), or where drafts live (a Dexie table keyed by surface and entity, with the merge rule "Recuperar" applies). It must also state op granularity for text and whether consecutive ops on one path are collapsed in the outbox before push; with last-writer-wins per path collapsing is safe, and without it nine cells times 36 keystrokes times 94 sheets is the op-log volume.

### M2 (high) — Per-relatório device availability state

- UX: Relatório card lines "No aparelho · atualizado 21:40", "Baixando… 12 de 94 fichas · 8 de 31 fotos", "Não está neste aparelho — conecte para baixar"; Offline & Sync › Automatic availability (Rascunho and Em campo pulled automatically; Em revisão and Emitido "downloaded on open"); State Patterns › Relatório downloading ("opens as soon as its data is present, photos arrive after"); Flow 1 step 7, Flow 4 step 1.
- Spine: AD-8 states the pull policy (Rascunho/Em campo, registries, thumbnails) and the cursor per relatório (AD-3, AD-13).
- Gap: no local record per relatório of download state (cursor, completeness, thumbnails pending, `downloaded_at`); no on-open pull rule for Em revisão and Emitido; no way for the Home card to show "de 94 fichas" for a relatório not yet pulled (the company pull would need a per-relatório summary). The card's three states are rendered from nothing.

### M3 (high) — Sync status counts and per-user "Último envio"

- UX: IA › Sync status (headline "3 fichas e 12 fotos aguardando" / "2 leituras na fila"; rows for uploads, downloads with percentage, last sync, per-user last send, errors); Sync status row; Export dialog and Flow 5 step 1 ("Último envio de Eduardo: 06/09 18:10", repeated in the pre-issue list); Offline & Sync › Visible state ("the last send time is the honest signal").
- Spine: the outbox holds ops, the photo store holds blobs; ops carry `actor_id`, `device_id`, `client_ts`.
- Gap: no derivation is stated for the headline numbers (distinct entity ids in the outbox → fichas; photo rows without ack → fotos; photos with a `reading_kind` not yet acknowledged plus server jobs not finished → leituras na fila; pending suggestions → sugestões por confirmar). No server field or pulled value carries "last op received per actor per relatório", so the per-user last send that the UX shows on three surfaces has no source. "Last successful sync" per device is local and unnamed.

### M4 (high) — Job status for readings and generation

- UX: State Patterns › Reading in progress ("Lendo…" while online), Photo queued for reading, Reading failed ("Não foi possível ler — Tentar novamente / Preencher manualmente"), Working ("Gerando revisão 2… pode fechar", Toast when ready, "Sync badge shows it"), Generation failed (inline error, "Tentar novamente", no revision consumed); Flow 2b failure; Flow 5 failure.
- Spine: AD-14 "results reach the device through the normal relatório pull"; AD-15 `POST /relatorios/{id}/generate` enqueues a job; contract (AD-13) has no job status route and no pulled job entity.
- Gap: a failed reading writes no Suggestion rows, so the device cannot tell "queued" from "running" from "failed" from "no result yet", and "Tentar novamente" has no operation to call (re-enqueue by photo id?). For generation, the device learns of a new REVISION on the next timer pull at best and never learns of a failure. Needs a reading status on the photo (or a reading row) and a generation-job row in the pull, or a status route, plus the retry semantics.

### M5 (high) — Preview delivery

- UX: Export dialog ("Pré-visualizar" → "the draft opens in a new tab"); Capture-to-Document › Export revisions ("a draft is not a revision"); Flow 5 steps 5–6 (preview twice, no revision spent).
- Spine: AD-15 preview "stores no revision"; the contract serves files only through `GET /revisions/{id}/{docx|pdf}`.
- Gap: the draft PDF has no route, no storage key and no retention rule. The one test in AD-15 (draft equals issued except watermark and revision line) also needs the draft to be addressable.

### M6 (medium) — Files that are not photos

- UX: Registries › Instruments (certificate file "queued for upload exactly like a photo, so the row can be created offline"; PDF or image [ASSUMPTION]); Registries › Empresa (logo PNG or SVG, cover background image, watermark image; "queued for upload like a photo, so the tab works offline"); Relatório setup (cover photo); Capture-to-Document row 11 (certificates print); Handed to architecture ("how the watermark and the company logo (PNG/SVG) are rendered in the DOCX as well as the PDF"); review-architecture "Missing inputs" (accepted formats for certificate files and cover photo).
- Spine: AD-7 and the contract cover `PUT /files/photos/{id}` only; the deployment diagram lists "certificates" in object storage.
- Gap: no file entity or `kind`, no local blob durability rule for non-photo files, no accepted formats or size, no rule for placing an SVG logo in the DOCX (the `docx` library embeds raster images; the spine ships `sharp`, so the rasterization step only needs to be named), no statement on whether the company watermark prints in the DOCX or only in the PDF (UX Open Question).

### M7 (medium) — Photo coordinates, the location switch and the row link

- UX: Photo stamp ("recorded at capture, never edited": time, and coordinates when Account › "Localização nas fotos" is on and the OS granted it; four decimals; omitted when absent); Account › Settings row (switch default on; "Permissão negada no aparelho"); State Patterns › Location denied; Capture-to-Document row 7 (stamp printed under every photo; a photo linked to a checklist row adds "Item 8 · Contatos · NC"); Photo tile ("A photo belongs to the relatório, optionally to a sheet, optionally to a checklist row"); Handed to architecture (coordinate source: EXIF vs geolocation call).
- Spine: AD-17 gives the photo `captured_at` and `tz_offset`; the ER links PHOTO to BLOCK optionally.
- Gap: no latitude, longitude or accuracy on the photo, no source rule, no per-user switch field; no link from PHOTO to a checklist item key, which the printed status line needs.

### M8 (medium) — Device-originated suggestions and the stored generated text

- UX: Suggestion field lists dictation, conclusion-pair suggestion, priority → Prazo, thermo-hygrometer readings; Generated text field ("Texto da conclusão", parecer summary: "Confirmar / Editar / Substituir", recomposes while unconfirmed, after confirmation "Sugerido: texto atualizado — Substituir", never overwriting); Criteria line ("frozen with the confirmed text and printed under it"); Smart Input › Priority fills the deadline ("a date the engineer typed is never overwritten by a later priority change; a differing suggestion appears beside it").
- Spine: AD-12 models a suggestion as `{... source: {photo_id, bbox, ocr_token_ids} ..., created_by_job}`; the Deferred list says "the Suggestion entity already carries them" for dictation.
- Gap: (i) whether device-side suggestions are Suggestion rows (synced, with a device source) or ephemeral UI state — the schema as written has no device origin; (ii) where the confirmed conclusion text, its criteria line and the values it was composed from are stored on the Equipment block and on the relatório (they print, and "texto atualizado" needs the inputs to compare); (iii) whether the confirmed text is a sub-block path in AD-3's grammar.

### M9 (medium) — Per-sheet sub-block overrides, subtype, NA pre-mark and criterion override

- UX: Block Model › Sub-block ("the Template defines the defaults per block type/subtype; a Relatório may override per sheet"; toggled off is omitted from print, never printed empty; checklist items never removed; subtype NA defaults premark rows); Capture-to-Document › Capture shape vs print shape (the four Bloco C columns print "-" and are not sub-blocks; optional "IA e IP lidos do visor" pair); Registries › Acceptance criteria ("the sheet may override a criterion with its source noted"); Block palette (inside a sheet lists sub-blocks with on/off toggles).
- Spine: AD-5 copies the Template's block definitions into the relatório's own rows; AD-3's path examples cover checklist results and test cells; AD-21 seeds criteria.
- Gap: no path or field for the per-sheet enabled flag of a sub-block, for the subtype, or for a per-sheet criterion override with its source; the renderer rule "omitted, never printed empty" versus "grid columns print '-'" is not stated as a kernel or renderer rule.

### M10 (medium) — Kernel inventory is shorter than the UX rule set

- Spine: AD-2 says "Neither app may reimplement or shadow one" — that holds only for what is enumerated (merge policy, pre-issue checks, progress counting, conclusion and parecer templates, TAG suggestion, numeric parsing, section-9 grouping, photo ordering, status table; AD-11 adds criteria comparison, outlier check, VAL CALCULADO).
- UX rules with no kernel line: conclusion-pair suggestion from the sheet (Smart Input › Conclusion); parecer verdict suggestion from the sheets (Parecer box); sheet state derivation Vazia / Em preenchimento / Concluída / Não ensaiada and "Concluída requires Progress = Completa" (Conclusion control; State Patterns › Not tested counts as complete); context-caption grammar with gender and number agreement (Caption composer); priority → deadline table P0..P4 (Smart Input); section-11 union of referenced instruments and the setup list (Capture-to-Document row 11); "Copiar da última visita" lookup by `equipment_id` (AD-5 names the read, not the function); calibration-expired check; the Sumário row status strings ("82 fotos · 1 sem legenda") — if these are the "pre-issue checks", say so, since the UX requires one function for the Sumário rows and the Export.

### M11 (medium) — Atividade and Local registries

- UX: Caption composer (rows Atividade · Equipamento · Local; "gender/number agreement from registry metadata"); Smart Input › Reasons and pick-lists (chip rows for manufacturer, activity, location); Open Questions (seed lists of about 10 activities and 8 locations); review-architecture medium finding.
- Spine: AD-5 lists Empresa, Clients, Instruments, Manufacturers, Voltage classes, Criteria. No Atividade, no Local, no gender/number fields, and AD-19 does not say whether they are by value (they should be, by its own logic).

### M12 (low) — Small handed-over items still silent

- Registry pagination size (Handed to architecture; Interaction Primitives "page size is architecture's call").
- Storage refusal fallback ("when online, the photo is uploaded immediately instead of stored; otherwise it is kept for one retry [mechanism: architecture's call]") — Deferred covers the threshold, not the mechanism.
- What the user sees after Safari evicted the origin's storage (Handed to architecture) — AD-8 covers prevention only.
- Password reset (review "Missing inputs") — AD-9 covers provisioning only.
- Sign out with a non-empty outbox (Login form, Settings row) — AD-9 should say the `fasor-{user_id}` database is never dropped on sign-out.
- Device-local, never-synced state has no table in `src/db`: last sheet edited on this device (Relatório card "Continuar: SEC-C05"), theme override, per-session banner dismissals, selected Registries tab, gallery filter. The client's derived cross-cutting state (Banner priority conflict › draft found › suggestions ready › relatório exported › offline with the "+2" chip; Sync badge state; Sync status headline) has no module in the Structural Seed (`src/db`, `src/sync`, `src/styles`, `src/surfaces` only), so each surface will derive it on its own.

### M13 (low) — What AD-23 must honor from DESIGN.md, not yet stated

- Inter: DESIGN § Typography names Inter as the one family; `tokens.css` line 137 says the mocks "render with whatever is installed" and does not self-host it. A cold offline open (AD-8) needs the font files in the service-worker precache, or the fallback stack is the product's real typography (review-architecture low finding, unaddressed).
- Icon sprite: EXPERIENCE Foundation ("icons come from the SVG sprite"); no sprite file exists in `mockups/` and the precache list in AD-8 does not name it.
- State selectors: `components.css` expresses state as `.is-current`, `.is-disabled`, `.is-compact`, `[data-state=...]`, `[aria-pressed=...]`, `[aria-selected=...]`; React Aria Components expose state as `data-selected`, `data-pressed`, `data-disabled`, `data-focus-visible` and `className` render props. "React components use those class names" needs the mapping rule (render-prop class names or added selectors), or the "1:1 copy" claim drifts on day one.
- Disabled buttons: DESIGN and EXPERIENCE require a disabled button to stay focusable with its reason linked by `aria-describedby`; React Aria's `isDisabled` removes focusability. The spine should say `aria-disabled` plus reason, never `isDisabled`.
- Theme override: `tokens.css` already supports `[data-theme="light|dark"]` in addition to `prefers-color-scheme`; the Account setting only has to set it. No gap, recorded so nobody re-implements it.

## Contradictions

### C1 (high) — Home-screen install: the spine rules it out, the UX still ships it

- Spine: AD-8 "no manifest install prompt, no Background Sync API, no reliance on `persist()`"; memlog: "no PWA install (2026-09-21)" inherited from the PRD.
- UX: State Patterns › App not installed (one-time info Banner "Instale PRODUTO na tela inicial para usar sem conexão" with "Instalar / Agora não"; "can be repeated only from Account"); Account › Settings row "Instalar" (hidden once installed) and IA › Account "install on home screen (when not installed)"; Responsive & Platform ("installing to the home screen (PWA) is the mechanism for cold-open offline and durable storage — the UX only requires the one-time install Banner"); Banner info variant lists the install prompt; review-architecture critical finding proposed exactly this step.
- One side must yield. If the PRD decision stands, EXPERIENCE.md must drop the banner, the Settings row and the Banner priority entry, and the durable-storage mitigation becomes AD-8's 5-day warning banner — which in turn is not in the UX's Banner priority list (conflict › draft found › suggestions ready › relatório exported › offline) and needs a slot. If the assumption "asset caching is not installation" is wrong for the PRD, AD-8 changes. The spine does not name this as a UX change it forces.

### C2 (medium) — A reading that arrives for a field the engineer already filled

- UX: Suggestion field ("a field already filled by the engineer is never overwritten — a differing suggestion appears beside the value with 'Substituir'"); Smart Input › Measurement readings ("Ler visor" without signal "checks the typed value and never overwrites it: match → the crop attaches silently; mismatch → amber 'Visor: 147 GΩ · digitado 14,7 GΩ — Conferir'"); Flow 2b step 3 ("Classe de tensão keeps his 13,8 kV, with 'Sugerido: 15 kV — Substituir'"); Priority fills the deadline (same rule for dates).
- Spine: AD-12 "typing into the target discards that suggestion only" and nothing about the reverse order.
- Read literally, a suggestion for an already-filled path is discarded on arrival or never produced; the UX requires it to be kept beside the value, and requires an equal value to auto-resolve and attach its provenance (the crop) without a tap. AD-12 needs both rules: keep-as-Substituir when the target is filled and differs; auto-confirm with provenance when equal.

### C3 (medium) — Which photos a device holds

- UX: Offline & Sync › Automatic availability pulls Rascunho/Em campo "photos at thumbnail and full size [ASSUMPTION — Open Questions]"; Open Questions asks whether thumbnails only may be enough.
- Spine: AD-8 pulls thumbnails; originals of other devices' photos on demand `[ASSUMPTION]`.
- The spine answers the UX's open question in the opposite direction and does not say so. Under the one-device decision the only "other device" photos are imported ones, so the choice is sound; the UX text should be updated rather than left as a contradicting assumption. The on-open download of Em revisão and Emitido relatórios (UX) is not in AD-8 at all (see M2).

### C4 (low) — Section-9 rendering option "stored on the export revision"

- UX: Capture-to-Document ("the choice is a rendering option stored on the export revision") and DESIGN › Export dialog ("Revisões" rows show "number · date · who · section-9 choice") are residue of the option the UX itself removed on 2026-09-19.
- Spine: AD-16 keeps the base case behind a server flag, not per revision; the REVISION entity stores no rendering option.
- The spine is consistent with the 2026-09-19 decision; the two UX sentences are stale and a builder reading DESIGN.md will add a column that has no data. Also, the "who" in that row needs `created_by` on REVISION, which the spine does not name.

### C5 (low) — Dictation is deferred whole, while the UX places the button on MVP surfaces

- Spine: Deferred "Dictation engine (FR-40) ... post-slice".
- UX: Flow 2 step 5 counts a mic tap and a dictation confirm on the MVP path; the Observation field, Point of attention text, Measurement table and the Photo capture sheet carry the Dictation button; the Measurement row alone tags dictation "post-MVP — FR-40".
- Compatible only because the UX hides the button when no engine exists (State Patterns › Dictation unavailable). The spine should state that in the slice the button is always hidden, so the Flow 2 count is read as the offline figure without dictation.

## Review-architecture findings not closed

Critical and high findings, with what the spine does. Closed items are listed in one line each so the accounting is complete.

| Finding | Spine | Status |
| --- | --- | --- |
| Critical: conflict unit is the sheet body only; structure has no rule | AD-3 makes every mutation a sub-block-addressed op including setup; AD-16 fractional `order_key`; AD-20 tombstones; multi-device policy and Conflict view deferred under the one-device decision (2026-09-21) | Deferred with a contract. The path grammar shows sheet and setup paths only; block add/remove/move, location rename and reorder, point of attention, photo link and caption paths are implied by "...". Name them, or the deferred policy has half a vocabulary. |
| Critical: PDF provenance undefined | AD-15 one renderer, PDF from the generated DOCX, never from an edited one | Closed |
| Critical: section 9 regrouping not derivable | AD-5 Cabine owns `agrupar_por_tipo`; AD-16 `groupForPrint` over the base case behind a server flag | Closed |
| Critical: offline durability in a browser | AD-8 service-worker shell, sync while open, 5-day warning banner, no install by PRD decision | Partially closed. The install step the finding asked for is ruled out, but the UX still specifies it (C1); "what the user sees if the browser evicted storage" is unanswered (M12). |
| High: template instantiation leaves unplaced blocks | UX added the location skeleton; AD-5 copies skeleton and blocks at creation; AD-6 blocks attach to any node | Closed |
| High: sub-block ownership and print effect ambiguous | UX fixed the rule (Template defaults, per-sheet override, omitted from print, checklist items never removed) | Rule closed in the UX; the spine gives it no field or path and does not name the renderer rule (M9). |
| High: TAG identity scope undefined | AD-5 Equipment under Project, `(project_id, tag)` unique, rename keeps identity, copy by `equipment_id` | Closed (multi-device duplicate deferred with merge) |
| High: SE characteristics and environment owner | AD-5 Cabine root node owns them; sheets read | Closed |
| High: export revision semantics incomplete | AD-15 revision allocated with both files, preview stores none; AD-17 numbers frozen with the revision | Closed. The "Revisões" list arrives as REVISION rows in the relatório pull (implied, not stated); `created_by` on REVISION is missing (C4). |
| High: acceptance criteria hang off the Instrument | UX moved criteria to the test sub-block type; AD-21 seeds them with operator and source and rejects unsourced ones; AD-11 compares in the kernel | Closed, except the per-sheet override with its source has no path (M9). |
| High: server cannot know another device's unsynced state; offline availability unspecified | AD-8 states what is pulled | Availability closed; the downgraded "Último envio de Eduardo: 14:20" the finding proposed, and the UX adopted on three surfaces, has no source in the spine (M3). |

Medium and low findings the spine ignores (the rest are closed or deferred explicitly): inline registry creation needs Atividade and Local registries with gender and number (M11); export as an asynchronous job needs a completion and failure signal (M4); Inter must be bundled for offline use (M13). From the review's "Missing inputs for architecture": accepted formats for certificate files and cover photo (M6), expected and maximum relatório size and active relatórios per device (silent — AD-8 pulls every Rascunho and Em campo relatório with no sizing statement), password reset (M12). Every other input is answered or listed under Deferred.
