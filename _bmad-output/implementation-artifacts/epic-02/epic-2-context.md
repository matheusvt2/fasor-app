# Epic 2 Context: Registries and company identity

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

An office user sets up, once, everything reused across every future relatório: the company's document identity (with a live brand preview of the cover, header and footer), clients and their sites, test instruments with their calibration record and certificate, manufacturers and voltage classes creatable inline from the field while offline, and a read-only view of the sourced acceptance criteria sheets compare against. This eliminates retyping the same instrument header, letterhead and client data on every one of the 85+ sheets in a job, and it seeds the reference data Epics 4-8 depend on (instrument selection on sheets, client/site on the cover, manufacturer/voltage-class pickers, criteria comparison).

## Stories

- Story 2.1: Register a test instrument with its calibration record
- Story 2.2: Attach a certificate file that reaches the server by itself
- Story 2.3: Set the company's document identity once, with a live brand preview
- Story 2.4: Register clients and their sites
- Story 2.5: Pick manufacturers and voltage classes, or create one from the field that needs it
- Story 2.6: See the acceptance criteria as sourced data

## Requirements & Constraints

- Company profile fields: razão social, CNPJ, address lines, telephone, e-mail, logo, optional cover background, form title (default "Relatório Técnico de Cabine Primária"), form code ("FO.SERV-03"), form revision ("Revisão 01"). All autosave; nothing is required to leave the tab. No watermark toggle and no client-logo field (explicitly cut). Company brand renders inside the app only in the Empresa preview; app chrome elsewhere always keeps the product wordmark.
- Clients: name, optional CNPJ (14 digits when present), one or more sites (address), contact name/phone. A client referenced by a Project can only be archived, never deleted.
- Instruments: code (e.g. "2E"), name, manufacturer, type/model, serial, certificate number, calibration date, laboratory, optional RBC-accredited flag, company calibration interval (months), default test voltage/current per test type. Validity date is derived (calibration date + interval), read-only. Registry stores no acceptance values. Unreferenced instruments can be deleted (with undo); referenced ones offer only "Arquivar."
- Expired calibration never blocks anything: expired instruments sort first, labeled "Vencida em dd/mm/aaaa" (amber); kernel `calibrationCheck` returns `expired`/`expiring` (within 30 days after the service period end)/`valid` for pickers and pre-issue warnings only.
- Manufacturers and voltage classes are pick-lists extensible inline from any surface while offline, carrying `{name, gender, number}` metadata for caption grammar. Stored by value (not id) on sheets/captions, so a later server-side merge of near-duplicates (e.g. "Schneider"/"SCHNEIDER", normalized) never touches existing sheets.
- Acceptance criteria: read-only `{operator, value, unit, type, source: {name, edition?}}`, seeded from FO.SERV-03 ("aceitável na ficha"). No criterion number may exist outside the seed module — comparison always goes through kernel `compareCriterion`, including unit scaling (e.g. GΩ vs MΩ).
- Files: certificate accepts pdf/jpeg/png; logo accepts png/svg; cover_background accepts jpeg/png; 25 MB limit, refused inline before upload.
- All registry writes are per-field autosave ops (no Save button): offline-first, outbox-queued, pushed next sync cycle, visible immediately on the creating device.
- Everything here is company-scoped (not relatório-scoped): shared across every project/relatório once created, and across devices once synced.

## Technical Decisions

- Registry references (AD-19): Clients and Instruments referenced **by id**; selecting an instrument copies its whole header at that moment (`{instrument_id, code, manufacturer, model, serial, cert_number, calibrated_at, valid_until, test_parameter}`) so later registry edits never retroactively change a signed reading. Manufacturer/Voltage class stored **by value** with `{name, gender, number}` metadata, exactly so a later normalized-name merge needs no reference rewriting.
- Files follow the shared `file` entity contract (AD-7): zod discriminated union on `kind` (`certificate`, `logo`, `cover_background`); a `file/{id}` create op (`scope: company`) plus the owner's `_file_id` op are emitted together, Blob written to IndexedDB in the same transaction. `PUT /api/files/{id}` is idempotent (id+sha256), requires the create op already applied (`409 file_row_missing`, retryable); server then makes `thumb`/`print` variants with sharp and emits `file/{id}/variants`. Object keys immutable (`company/{cid}/{kind}/{id}`), no delete in MVP. `GET /api/files/{id}/{original|thumb|print}` is the only read route; sync never prefetches certificate originals. Storage adapter is MinIO in docker-compose for the whole MVP (same S3 API carries to AWS post-MVP).
- Brand preview is a CSS approximation only (three miniature pages, `aria-hidden`), never a rendered PDF — the real cover/header/footer render later, in Epic 4/7's server-side `docx` + LibreOffice renderer, which this epic does not touch.
- Missing razão social/logo never blocks; feeds kernel `preIssue` as warning rows for Epic 7's Sumário/Export dialog.
- Tenant scoping (AD-10): every registry table carries `company_id`, resolved server-side per request; no query compiles without it.

## UX & Interaction Patterns

- Registries surface: Tabs Empresa · Clientes · Instrumentos · Fabricantes · Classes de tensão · Critérios de aceitação, wrapping (never scrolling) on narrow widths; Instrumentos is default; selection remembered per session; other surfaces deep-link into a tab.
- Registry row (56 px): primary `⟨code⟩ — ⟨name⟩ ⟨model⟩`, meta with serial · RBC · validade. Expired instruments sort first in amber. Certificate attachable directly from the row (queued like a photo). Delete only when unreferenced, else "Arquivar."
- Forms open as a Form dialog on desktop, full-screen on phone.
- Manufacturer/voltage-class field: on tablet/phone shows a wrapping Chip row of the 5 most recent values ending in "Outro…" (opens a full-screen Combobox over the whole registry); desktop shows the Combobox directly. A typed name absent from the registry surfaces "Criar “⟨texto⟩”" for inline offline creation. Same pattern for the client Combobox in "Novo relatório."
- Critérios de aceitação: read-only Data table, no row actions — columns test sub-block type · criterion (`value` style) · source (`ink-secondary`) · used by.
- Brand preview card shows cover (logo slot, cover-background box), header strip (logo, two-line title, code+revision), footer strip (company lines, "Página X de Y"); missing assets show `border-hairline` placeholders "Logo"/"Fundo".
- "Registro profissional" (Conselho, número, título) is edited from Account's Settings row, not the Registries tabs, despite being part of this epic's goal statement.
- Mockups of record: `prototype/screens/80-cadastros.html`, `key-registries.html`; mockups win on conflict with prose.

## Cross-Story Dependencies

- Story 2.2's file/upload mechanism is shared plumbing: Story 2.1 (certificate tile) and Story 2.3 (logo/cover-background tiles) both build on it.
- Downstream: Epic 4/5 consume Instrument, Client, Manufacturer and Voltage-class registries (instrument selection copies the header per AD-19; client fills the cover). Epic 7 reads the Empresa profile, certificate files and acceptance criteria at render time, and surfaces this epic's pre-issue warnings. Epic 8's reading pipeline cross-checks `manufacturer`/`voltage_class` suggestions against these registries.
