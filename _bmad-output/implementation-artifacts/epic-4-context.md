# Epic 4 Context: Projects, relatório setup, the Sumário and the tree

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic turns a seeded Template (Epic 3) into a live relatório an engineer can walk through. A user opens a Project for a client and site, creates a relatório so every equipment block exists in its column with a suggested TAG before the field visit, fills the office-side setup page, and then sees the relatório as its own table of contents (the Sumário) in FO.SERV-03 order, each row showing exactly what is missing. Section 9 of that Sumário opens into the location tree the engineer actually walks, and blocks can be added, removed, restored, duplicated and reordered to match reality. The epic closes by proving the one renderer end to end — LibreOffice in the container producing a numbered DOCX skeleton with a working two-pass table of contents — before sheets, photos and points of attention (later epics) add their content.

## Stories

- Story 4.1: Create a project and a relatório whose blocks are born in place
- Story 4.2: Fill the relatório setup page
- Story 4.3: See the relatório as its own table of contents (the Sumário)
- Story 4.4: Walk the location tree
- Story 4.5: Add, remove, restore, duplicate and reorder equipment blocks
- Story 4.6: Status transitions and the "relatório emitido" warning
- Story 4.7: Edit a section's text inside one relatório
- Story 4.8: Generate the document skeleton as a numbered DOCX revision

## Requirements & Constraints

- Site is collapsed into Project (one client + one site); Equipment and TAG uniqueness hang off Project, not Site or relatório.
- Relatório creation is one client batch: the `relatorio` create plus every `location`, `equipment` and `block` create produced by `instantiateTemplate`; the server never copies anything, so a Template edit can never touch an existing relatório.
- TAG uniqueness is a kernel `integrity` check against project-scope equipment with `removed_at is null`, never a database constraint; a client-side duplicate is refused inline, a same-batch or cross-device duplicate arrives later as an `integrity` finding, never a server rejection.
- Location depth is not enforced in code; the UI renders two levels (Cabine › Coluna/Cubículo) but a block may attach to any node. The Cabine node alone owns SE characteristics, test environment and "Agrupar por tipo"; sheets only read them.
- Block ordering has exactly four input paths (press-and-hold drag, Overflow Subir/Descer, Alt+Up/Down, and a typed Position box) that all emit the same fractional-index `order_key` op; there is no swipe gesture anywhere in this epic.
- Removal is a tombstone (`removed_at`), never a hard delete; "Restaurar" clears it and stays reachable from a Sumário/tree Overflow until export.
- The Sumário's per-row status and the Export dialog's pre-issue list are one kernel function (`preIssue`) rendered in two places — never two implementations that could disagree.
- The relatório status table lives in exactly one place in the kernel; both the offline device and the server compute from it, and the server never writes `relatorio/status` itself.
- Out of scope for this epic's slice, deferred by the delivery slice: moving a block between locations (FR-20), saving a relatório as a Template (FR-14), and a rich text editor for section text (plain text with variable chips only).
- The document skeleton this epic produces prints sections 1–6 and 10 with resolved text; sections 7, 8, 9 and 11 print only their heading with "(sem conteúdo nesta revisão)" until Epics 6 and 7 land.

## Technical Decisions

- Ownership (AD-5): Company owns Templates/Projects/registries; Project owns Equipment (one company-wide table by `project_id`, referenced by `equipment_id` so a TAG rename keeps identity); Relatório owns its Location tree, blocks, sheet values, photos, points, suggestions, generation jobs and revisions.
- `template.version` is **no longer immutable** (2026-09-23, Epic 3 retro D-4, overriding the earlier spine text): every template edit increments it, and `instantiateTemplate` records the template's current version into `relatorio.template_version`. Decide with Winston/Matheus how the append-only seed (`seed_version`) and this new mutable `template_version` interact in `instantiateTemplate`.
- D-2 (the `{obra}` site-phrase/article problem in seed section 1 text) stays on **seed v1** until the R-009 review; that review itself is deferred past Epic 4 and must be recorded (with its date) under Story 3.1 before Epic 5 starts. Any correction ships as an append-only seed v2, so relatórios already created on v1 keep resolving against v1.
- Equipment is project-scope but reaches every relatório stream of that project through the sync query (ops with `relatorio_id = $id` ∪ ops with `scope = project and project_id = relatorio.project_id`), so a relatório created later still sees the project's whole equipment history — no separate fan-out to build.
- `suggestTag(type, location, existingEquipment)` and the block palette's suggested TAG use the same deterministic naming scheme (type+column prefixes, "-2" suffix on collision, cabine short name when attached directly to a cabine).
- The location tree is one component in two presentations: full-screen on phone, and a 320 px rail (collapsing to a 48 px vertical-label strip) inside a sheet surface once Epic 5 mounts sheets — build the component to serve both from the start.
- Sheet/block completion state (`sheetState`) follows the AD-18 precedence (`not_tested` > `concluded_by` > any non-empty enabled cell > empty); this epic's tree rows must render that precedence exactly, including that unconfirmed Suggestions never count as filled.
- The generate job (Story 4.8) is the one renderer: it freezes a kernel-typed `RelatorioSnapshot`, builds the DOCX with the `docx` library, converts its own output to PDF with LibreOffice headless in the same job, and only then writes both `file` rows and the `revision` op in one transaction — a failed job allocates no revision number. The table of contents is produced in two (occasionally three) passes so printed page numbers match the PDF outline.
- `editedSince(snapshot_seq)` — true when any op in the family set `{relatorio/setup, location, block, sheet, file (photo), point, equipment}` has a later `seq` — drives both the "Em campo → Em revisão" status transition on edit-after-issue and the "second Gerar relatório returns the last revision" short-circuit.
- Ownership/rendering split (AD-1 to AD-3, AD-13): `packages/domain` computes every status, count, order and text once; `apps/web` renders kernel output from IndexedDB and only ever writes ops into the outbox; `applyOp` is the only reducer on both device and server.
- UI is built from the mockups' CSS classes with React Aria for behavior (no Tailwind, no themed component kit); any new `.frame-*` mock rule this epic introduces (Sumário rows, tree rows, palette drawer/sheet) gets its `app.css` translation in the same change per the project's container-selector convention.

## UX & Interaction Patterns

- Sumário: one 64 px row per FO.SERV-03 part, capa/document-control rows fixed at the top with no controls, "Pré-visualizar" and "Gerar relatório" at the foot; header shows fichas concluídas/N, NC abertos, não ensaiadas, sugestões por confirmar, each count opening its list. Em campo opens section 9 expanded to the last-worked sheet on this device; other statuses open collapsed with pendências leading.
- Every editable Sumário/tree/block row shares the same reorder affordances: an Overflow menu (Adicionar abaixo · Subir · Descer · Duplicar · Remover) plus a typed Position box that is the row/section number itself; every move is announced and undoable via a persistent toast.
- Destructive actions (remove, undo, restore) must move focus deliberately rather than letting it fall to `<body>` — this is an open action item from the Epic 3 retro (E3-A8) that this epic's stories (4.3, 4.5) must honor from the start, with an e2e assertion on the focused element for every archive/remove/undo.
- Block palette is bottom-sheet on phone, right-drawer on tablet/desktop; the field variant lists only the 8 equipment types (each with its suggested TAG in `meta`, no sub-block toggles); the office variant additionally asks TAG/location and shows sub-block toggles.
- Confirm dialogs name the concrete TAG in their text (e.g. "Remover ficha SEC-C05?"), never a generic "this item".

## Cross-Story Dependencies

- Story 4.1 is the foundation: its `equipment`/`block`/`location` shapes and `instantiateTemplate` batch are consumed by every later story in the epic (setup in 4.2, Sumário rows in 4.3, tree rows in 4.4, add/remove/reorder in 4.5, the snapshot in 4.8).
- Story 4.3 (Sumário) and Story 4.4 (tree) share one `preIssue`/`sheetState`-driven rendering; the tree is expanded inline as Sumário section 9 in 4.3 and later reused as the in-sheet rail once Epic 5 mounts sheets.
- Story 4.6's status table depends on Story 4.2 (`setup_complete` event) and is itself a dependency of Story 4.8 (`generate`/`issue` events and the Em revisão warning banner).
- Story 4.8's renderer snapshot test replays the Porto Seguro fixture built in Epic 3 (Story 3.7); it also depends on the deferred R-009 review only insofar as seed text content is concerned (not on this epic's schedule, but the review must land, dated, under Story 3.1 before Epic 5 starts).
- Carried over from the Epic 3 retrospective as items this epic must not ignore: E3-A3, validating `sheet/*`/`block/*` op path segments against `getDefinition` in `applyOp`, is due before Epic 4 (and Epic 5) write sheet/block config values; E3-A5, the architecture decisions D-4 (`template.version`, now resolved above), D-5 (a kernel-defined row offset for the two contact-insulation tables, needed before Epic 5's renderer, not blocking Epic 4) and D-7 (template `blocks`/`skeleton` array edits are last-writer-wins, accepted as-is for the office-only MVP); and G-1, a gate-stability flake where the Templates list can render empty for up to 30 s after sign-in under load — watch for the same class of flake in this epic's own `@p0` e2e suite (Sumário/tree first paint after sign-in).
