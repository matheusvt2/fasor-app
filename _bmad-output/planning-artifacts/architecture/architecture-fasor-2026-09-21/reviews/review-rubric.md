# Rubric Review — ARCHITECTURE-SPINE.md (fasor)

Reviewed: `ARCHITECTURE-SPINE.md` (draft, 2026-09-21) against the seven-item rubric. Read in full; cross-checked against `.memlog.md`, PRD §5.8–5.10, §7.3, §9, §12, §13, addendum §1 (handoffs) and §9, `EXPERIENCE.md` (Offline & Sync, Registries, State Patterns, Smart Input › Photos), and the UX `review-architecture.md`.

**Verdict.** The spine is a convergent build substrate on the big axes — paradigm, ownership map, operation as the unit of change, Suggestion as an entity, one renderer over a frozen snapshot, one home for seed data and the status table — and would stop most of the divergences the UX review predicted. It is not yet safe to hand to independent story builders in the slice, for four reasons: the op log (AD-3/AD-13) is under-specified exactly where the sync, registry and sheet stories meet (how rows are created, what a pull returns, which clock decides last-writer-wins, what a rejected op does); AD-16 contradicts FR-72, which is in the slice; two things the slice needs are filed under Deferred or left implicit (the status table content, LibreOffice as the pagination oracle for the in-slice TOC); and the file contract covers photos only while the slice also uploads certificates, logos and cover images.

## Checklist verdicts

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Fixes the real divergence points, misses none | **Partial** | Fixed: read path (AD-1), rule ownership (AD-2), unit of change (AD-3), ids (AD-4), entity ownership incl. Template snapshot and Cabine attributes (AD-5), tree (AD-6), photo durability (AD-7), Suggestion (AD-12), renderer (AD-15), print order (AD-16), photo numbering (AD-17), attribution (AD-18), registry refs (AD-19), tombstones (AD-20), seed (AD-21), status home (AD-22), UI system (AD-23). Still open, each hit by two builders in the slice: row creation and removal as ops; pull payload (ops or materialized rows); LWW clock; push batch and rejected-op semantics; company-scoped writes (registries, Empresa, Templates, Account); non-photo files; where the web bundle is served (cookie/CSRF); reading-job retry and idempotency; op granularity vs autosave and FR-61. See C1, H1, H2, H5, H6, M1, M2. |
| 2 | Every Rule enforceable and actually preventive | **Partial** | Enforceable: AD-1 (lint: no `fetch` outside `src/sync`), AD-4, AD-7, AD-9, AD-10 (typed required arg), AD-11 (zod), AD-12 (server-side digit coverage), AD-13 (eslint), AD-15 (named test), AD-17, AD-20, AD-21 (seed test), AD-22, AD-23. Wishes: AD-2 "neither app may reimplement or shadow" has no check (M10); AD-3 "last-writer-wins per path" names no clock, so it cannot be checked and does not prevent the divergence it names (C1); AD-16 "base case reachable through a server flag" prevents the wrong thing (C2). |
| 3 | Nothing Deferred lets two units diverge | **Fail on two items** | "Status table content" is deferred while FR-21 (Home grouping, Continue card) and FR-62/FR-72 (Export) are both in the slice; Home and Export builders need the same answer to "what does an export do to Em campo" on day one (H3). "Photo compression for upload" is fine to defer, but it hides the stored-original size cap, which the capture builder and the storage-pressure builder both need under the Safari quota (M4). The multi-device deferral is safe only if the op carries causality now (M9). Everything else under Deferred is genuinely post-slice or a business/legal input. |
| 4 | Named tech pinned with versions | **Partial** | 17 of 20 rows pinned and verified in the memlog. Unpinned: `@anthropic-ai/sdk` latest, `@google-cloud/vision` latest, Vitest, Playwright. TypeScript is "7.0, or 6.0 if a tool lags" — an either-or two packages could resolve differently (M7). |
| 5 | Every structural dimension decided, deferred or open | **Partial** | Decided: data ownership (AD-5), state mutation (AD-3, gaps in C1), boundaries (AD-13), API contract (AD-13, gaps H2/H5), auth/session (AD-9, gap H6), multi-tenancy (AD-10), offline/sync (AD-1/3/8), file storage (AD-7, photos only: H2), background jobs (AD-14/15, gap M2), document generation (AD-15/16/17, gaps H4/M5), AI pipeline (AD-14), deployment and environments (Structural Seed paragraph, gap H6/M6), infra (Stack), operations (logs, `/health`, backups, secrets: present but thin), testing (Conventions, gap M10), error handling (Conventions: wire shape and retry classes; client side of a rejected op silent: H5), i18n/time (AD-17, pt-BR labels; output formatting home silent: L4). No dimension is entirely silent; the functionally silent spots are non-photo files, the web origin, rejected-op handling and Dexie/SW/contract versioning. |
| 6 | Terse and convergent | **Pass with nits** | No placeholder or template comment remains (`companions: []` and `status: draft` are legitimate). Rationale that belongs in the memlog: the Safari 7-day explanation inside AD-8's Rule, the civil-prescription sentence under Deferred, "the pipeline is a single choke point so a consent gate is one check" (L2). Otherwise the ADs are rule-shaped. |
| 7 | Internal consistency | **Partial** | AD-16 vs FR-72 and vs its own Capability map row "Export dialog" (C2). AD-3 op shape has `company_id` but no `relatorio_id`, while the ER diagram hangs OP off RELATORIO and `GET /sync/company` implies company-scoped changes (H1). AD-15 vs the memlog's inherited constraint "never DOCX->PDF conversion" (M8). AD-5 text omits Templates from Company's holdings while the ER has `COMPANY ||--o{ TEMPLATE` (L1). Memlog route `PUT /photos/{id}` vs spine `PUT /files/photos/{id}` (L1). Flow diagram has `idb --> sync` but no pull arrow back (L1). AD-8 rules out the install prompt that EXPERIENCE.md (a listed source) still carries in Account and the "App not installed" banner (L3). |

## Findings

### Critical

**C1 — The op log is under-specified where the slice's stories meet.** Anchor: AD-3, AD-13, ER diagram.
Four questions a sync builder, a sheet builder and a registry builder will each answer differently:
1. *Creation and removal.* The op is `{path, value}` over one sub-block field. Nothing says how a Block, Location, Photo row, Point of attention or Suggestion confirmation *creates* a row, how a reorder (AD-16 `order_key`) or a move (FR-20, later) is expressed, or whether AD-20's `removed_at` is a `put`. AD-7 requires the photo row and its Blob in one transaction, which only works if creation is itself an op.
2. *What the pull returns.* "Serves changes by a per-relatório cursor" can mean ops (client replays through the kernel) or materialized rows (client overwrites Dexie). The two designs have different local-state models, different outbox rebase rules and different tests.
3. *Which clock decides LWW.* `client_ts` is a device clock; `op_id` (UUIDv7) embeds another device clock; server arrival order is a third. Office setup edits on Sunday versus a tablet's Saturday ops arriving Monday give different results under each. The rule cannot be reviewed as written.
4. *Cursor key.* `since=` is unnamed: server sequence, server timestamp or op_id.
Fix, in AD-3: `op.kind ∈ {create, put, remove}`; `create` carries the full row as `value` with `path = ""`; `remove` sets `removed_at`; reorder is a `put` on `order_key`. Ops carry `relatorio_id` (nullable for company scope, see H1). Server assigns a monotonic `seq` per company on apply; `GET /sync/...?since={seq}` returns ops in `seq` order; the client applies them through the same `domain/merge.apply(state, op)` it used optimistically, then re-applies its still-pending outbox ops on top (rebase). LWW is by server `seq` (arrival order); `client_ts` is display and audit only. State this in the Rule and add the outbox replay test's assertion: "replay of the same ops in seq order on client and server yields byte-equal materialized state".

**C2 — AD-16 contradicts FR-72 and the slice.** Anchor: AD-16 Rule, Capability map row "Generation", PRD FR-68/FR-72, §7.3 ("both ordering schemes" is bolded in the ships list).
AD-16 says the base case (walk the tree, one subsection per cabine) "stays reachable through a server flag, not a UI option". FR-72, in the slice, is a user-chosen scheme at export ("Por local e tipo" preselected, the alternative is field order, remembered per relatório). The Export builder will follow the PRD and add the option; the renderer builder will follow AD-16 and read a server flag; the per-cabine `agrupar_por_tipo` (AD-5) is a third switch with no stated relation to either.
Fix: `groupForPrint(snapshot, scheme)` with `scheme ∈ {por_local_e_tipo, ordem_de_campo}`; `scheme` is a field of the generate request typed in `domain/contract`, stored on the relatório by an op on `relatorio/export/scheme` (so it is remembered), and captured in the frozen snapshot. Per-cabine `agrupar_por_tipo` applies only inside `por_local_e_tipo`. Delete the "server flag" sentence.

### High

**H1 — Company-scoped writes have no home.** Anchor: AD-3, AD-13 `GET /sync/company?since=`, ER `RELATORIO ||--o{ OP`.
Registries (FR-1..FR-7, in slice), Empresa brand fields, Templates and the Account profile are written from the client, offline for Manufacturers and Voltage classes (FR-4). The op carries `company_id` but no `relatorio_id`; the ER makes OP a child of RELATORIO; `GET /sync/company` implies company-level change feed. A registry builder will write REST CRUD; a sync builder will expect ops. AD-19's server-side dedupe of registry rows also needs to know whether it rewrites ops or rows.
Fix: ops have `scope: company | relatorio` (`relatorio_id` nullable); registry, Template and Empresa writes are company-scoped ops; `GET /sync/company` serves company-scoped ops by `seq`; Template composition (office, online) may still be ops so FR-14 later is free. Update the ER: `COMPANY ||--o{ OP`, `RELATORIO |o--o{ OP`.

**H2 — The file contract covers photos only.** Anchor: AD-7, AD-13 routes, flow diagram (`s3: photos, certificates, revisions`).
In the slice the client uploads: instrument certificate files (FR-3, PDF or image, "queued for upload like a photo" per EXPERIENCE), company logo (PNG/SVG), cover background, watermark image, and the cover photo (FR-63). Only `PUT /files/photos/{id}` exists. Two builders will invent two upload paths with different durability.
Fix: generalize AD-7 to a `file {id, company_id, relatorio_id?, kind: photo|certificate|logo|cover_background|watermark|cover_photo, sha256, mime, size}` row with the same Blob-in-IndexedDB-until-ACK contract, one route `PUT /files/{id}`, object key `company/{cid}/{kind}/{id}` (photos keep their relatório path), accepted types per kind (`photo: jpeg|png|heic→jpeg`, `certificate: pdf|jpeg|png`, `logo: png|svg`). Photos keep their reading-first upload priority.

**H3 — Status table content is deferred but the slice builds on it.** Anchor: AD-22, Deferred "Status table content", PRD Q2, §7.3 (FR-21 and FR-62 ship).
Home (grouping, Continue card, "relatório exported then edited" banner) and Export (revision N+1 after edit, export while Em campo) are separate stories that both consume the table on day one. Deferring the content to the PM breaks the spine's own fast-path rule: undecided inferences are tagged `[ASSUMPTION]`, not left blank.
Fix: put a provisional table in AD-22 tagged `[ASSUMPTION]`: `Rascunho --setup_complete--> Em campo`; `Em campo --generate--> Em revisão` (export while Em campo allowed, warned); `Em revisão --issue--> Emitido`; `Emitido --any op on sheet/tree/setup--> Em revisão` (automatic, banner "changes produce revision N+1"); manual backward moves allowed from any state with the confirm dialog, and a subsequent edit does not re-advance automatically. The PM edits the table, not its existence.

**H4 — LibreOffice is in the slice as the pagination oracle, and the two-pass TOC has an unstated stability condition.** Anchor: AD-15, PRD §7.3 wait 2 (PDF ships after DOCX), FR-65 (TOC with page numbers, in slice).
AD-15 reads heading page numbers "from the PDF outline". §7.3 defers the PDF file. A slice builder can reasonably drop LibreOffice from the image and then have no page numbers for FR-65. Separately, pass 1 without a TOC (or with a shorter one) paginates differently from pass 2, so the numbers read in pass 1 are off by the TOC's page count.
Fix: state in AD-15 that the DOCX→PDF conversion runs in the slice regardless of whether the PDF is delivered, because it is the only pagination oracle; pass 1 renders the TOC with its final entry list and placeholder numbers of the same width so pagination is identical; the job asserts pass-2 heading pages equal pass-1 and runs a third pass if not. Add "generate job concurrency 1 per instance; soffice runs with a per-job `-env:UserInstallation` profile" so parallel jobs do not deadlock on the profile lock.

**H5 — Push batch and rejected-op semantics are undefined.** Anchor: AD-13 `POST /sync/ops`, Conventions "4xx never retried by sync".
Nothing says whether a batch is atomic, whether ops apply in array order, or what the client does with an op the server rejects: drop it (silent data loss), keep it forever (queue never drains, 5-day banner fires), or revert the local value. The client sync builder and the server sync builder will pick differently.
Fix: request `{ops: Op[]}` (≤ 500, array order = apply order); response `{applied: op_id[], rejected: {op_id, code}[]}`; per-op atomicity, one rejected op never blocks the rest; a rejected op moves to `outbox.status = dead`, is listed in Sync status with its `code`, the local value is kept (the user's data is never silently reverted) and a "Reenviar" action re-queues it after the user edits. Response `code` strings are enumerated in `domain/contract`.

**H6 — Where the web bundle is served is undecided, which decides cookies, CSRF and CORS.** Anchor: AD-9 (httpOnly cookie), Structural Seed (one Docker image), flow diagram.
If `apps/web` is served from a different origin than `apps/api`, the cookie needs `SameSite=None`, CORS with credentials, and explicit CSRF protection on `POST /sync/ops` and `PUT /files/*`; if same-origin, none of that. An auth builder and a deploy builder will assume different answers.
Fix: state "the api image serves the built `apps/web` as static files on the same origin; API routes live under `/api/*`; cookies are `SameSite=Lax`, `Secure`; no CORS; the service worker precaches `/` and the hashed assets only". Local dev uses the Vite proxy to the same paths.

### Medium

**M1 — Op granularity, autosave debounce and FR-61 draft recovery.** Anchor: AD-1 ("every user write becomes an op before anything else"), Conventions, addendum §1 (debounce handed to architecture), FR-61.
Per-keystroke ops multiply the op log (1,100 readings) and make LWW by `seq` interleave partial values; per-blur ops leave in-flight text that FR-61's "Rascunho encontrado" must recover. Silent on both.
Fix: one op per field commit (blur, Enter, or 500 ms idle, whichever first); the outbox coalesces consecutive `put` ops on the same path from the same device before push; FR-61 reduces to "an uncommitted field value is persisted to a per-surface `drafts` store on `visibilitychange`/`pagehide` and offered on reopen; committed values need no recovery because the outbox is the draft".

**M2 — Reading job retry and idempotency.** Anchor: AD-14, FR-42 ("a failed reading shows a retry").
A pg-boss retry of a half-failed job would write a second set of Suggestions; the photo row has no `reading_status` for the queued/running/failed states the UX shows under the tile.
Fix: job singleton key `(photo_id, reading_kind)`; the job deletes its own previous `pending` suggestions before writing; 3 attempts with backoff, then `photo.reading_status = failed` (states `queued|running|done|failed`, set by the server, pulled like any row); "Tentar novamente" re-enqueues; the job records `model`, `prompt_version`, tokens, USD, duration.

**M3 — Photo coordinates: source, precision, EXIF location.** Anchor: AD-17, AD-7, FR-47 (in slice), addendum §1 ("photo-stamp coordinate source and precision").
The stamp prints coordinates; the spine names `captured_at` and `tz_offset` but no coordinate field, no source (Geolocation API at capture vs EXIF on import), no precision, and does not say which side parses EXIF.
Fix, in AD-17: `photo.coords {lat, lng, accuracy_m, source: geolocation|exif} | null`; captured on the device at capture with a 5 s timeout, EXIF used for imports; EXIF parsed on the device at capture/import, never rewritten by the server; printed at 4 decimals.

**M4 — Stored-original size cap is load-bearing under the Safari quota.** Anchor: AD-7 ("originals stay"), Deferred "Photo compression for upload", PRD §9 capacity (82 photos, three days), Q0.
Modern tablet cameras produce 3–8 MB JPEGs; 82 originals in IndexedDB is 250–650 MB against Safari's per-origin quota. "Originals stay" without a cap means the capture builder decides the cap ad hoc, and the storage-pressure builder cannot size the warning.
Fix: "the stored original is the camera output re-encoded on the device at capture to JPEG, long edge ≤ 2560 px, quality 0.85 `[ASSUMPTION]`; this is the original for AD-7 and for the reading job; no separate upload variant". Keep the Deferred bullet only for tuning the numbers.

**M5 — Certificate pages, SVG logos and the company watermark in the renderer.** Anchor: AD-15, FR-70 (certificates print as full-page images), Empresa brand fields, addendum §1 ("how watermark and logo render in DOCX as well as PDF").
A certificate may be a PDF; `docx` embeds PNG/JPEG only; the company watermark (text or image on every page) is distinct from the RASCUNHO preview watermark and is not mentioned.
Fix: in the generate job, PDF certificates are rasterized page by page with LibreOffice (`pdf→png`, 150 dpi) and SVG logos with `sharp`; both watermarks use the same mechanism (a header-anchored floating image or text behind content) so the draft-equals-issued test also covers the brand watermark.

**M6 — Client versioning: Dexie schema migrations, service-worker updates, contract compatibility.** Anchor: AD-8, AD-13, Structural Seed `public/sw.js`.
A precached bundle can be days older than the server; a Dexie version bump without an `upgrade()` drops the outbox; nothing says when a new deploy is picked up.
Fix: Dexie versions are append-only with `upgrade()` mandatory and an "outbox survives upgrade" test; `domain/contract` exports `CONTRACT_VERSION`, sent as a header, and the server answers `426` with a stable code when it is older than the minimum; the client then flushes the outbox first, then reloads to the new shell; the SW activates on the next launch only when the outbox is empty.

**M7 — Unpinned or either-or versions.** Anchor: Stack table.
`@anthropic-ai/sdk` and `@google-cloud/vision` are "latest"; Vitest and Playwright have no version; TypeScript is "7.0 or 6.0 if a tool lags", which two packages can resolve differently.
Fix: pin `@anthropic-ai/sdk`, `@google-cloud/vision`, Vitest and Playwright to the versions current on 2026-09-21 and record them in the memlog; choose TypeScript 7.0 for the whole workspace now, with the fallback to 6.0 recorded as a memlog decision only if it is actually needed.

**M8 — AD-15 versus the memlog's inherited constraint.** Anchor: AD-15, `.memlog.md` constraint "PDF and DOCX both rendered from app data, never DOCX->PDF conversion", PRD FR-62 ("never a conversion of an *edited* DOCX").
The spine satisfies the PRD literally (the converted DOCX never left the system) but contradicts its own memlog reading of the constraint, so a reader of the memlog will call AD-15 a violation.
Fix: correct the memlog constraint to the PRD's wording; add to AD-15 "this satisfies FR-62: the input to the conversion is the job's own DOCX, and there is no upload path".

**M9 — The op carries no causality, so the deferred merge is not a pure policy swap.** Anchor: AD-3 ("policy swap in `packages/domain/merge` over the same ops"), Deferred "Multi-device merge policy", addendum §1 (base revision vs version vectors).
"Filled beats empty", "NC beats C" and "cell contradiction → conflict" all need to know what each device saw on the path before writing. Without it, the deferred policy needs a new op field, which is the schema change the spine promises to avoid.
Fix: add `prev_op_id: uuidv7 | null` (the last op the device had applied on that path) to the op now, populated by the client, ignored by the MVP policy; state it in AD-3.

**M10 — Two rules are wishes without a check; the testing row misses the PRD's named acceptance scenarios.** Anchor: AD-2 Rule, AD-10, Conventions "Testing", FR-54 ("acceptance tests must cover: closing the app mid-sheet, losing the network mid-upload, filling the device's storage").
AD-2's "neither app may reimplement or shadow" has no mechanical check. AD-10 has no test. FR-54's three scenarios are absent from the testing row.
Fix: AD-2: one integration test computes the Sumário row status on the client store and the pre-issue list on the server for the Porto Seguro fixture and asserts they are the same kernel output; reviewers reject any function in `apps/*` that takes a sheet or relatório and returns a status, count, text or order. AD-10: a repository test that a query without `company_id` fails to compile, plus one cross-tenant read test with two seeded companies. Testing row: name the three FR-54 Playwright scenarios (tab closed mid-sheet, network dropped mid-upload, quota exhausted via a mocked `storage.estimate`).

### Low

**L1 — Diagram and text mismatches.** Anchor: AD-5, ER diagram, flow diagram, `.memlog.md`.
AD-5's Company line omits Templates (ER has them); the ER has no OP edge for company scope (see H1) and no PHOTO to checklist-item link (FR-44 links a photo to a row: add `photo.block_id?`, `photo.item_key?`); the flow diagram has `idb --> sync` but no arrow back for pulls; the memlog says `PUT /photos/{id}` where the spine says `PUT /files/photos/{id}`.
Fix: one editing pass.

**L2 — Rationale prose to move to the memlog.** Anchor: AD-8 Rule (last sentence, the Safari 7-day explanation), Deferred "Purge and retention" (civil-prescription sentence), Deferred "LGPD basis" ("the pipeline is a single choke point so a consent gate is one check").
Fix: keep the rule ("warn at 5 days") and the deferral; move the why to the memlog.

**L3 — A listed source still contradicts AD-8.** Anchor: AD-8; `EXPERIENCE.md` Account row ("install on home screen"), Settings row "Instalar", Banner "App not installed", Responsive & Platform ("installing to the home screen is the mechanism for cold-open offline").
The spine is right by the PRD's 2026-09-21 decision, but a UI builder reading EXPERIENCE.md will build the install surfaces.
Fix: add one line to AD-8, "the install prompt, Account › Instalar and the App-not-installed banner in EXPERIENCE.md are removed", and file the UX delta.

**L4 — Small silences a builder will fill alone.** Anchor: Conventions, AD-9, AD-14, Structural Seed.
pt-BR output formatting (decimal comma, thousands point in the document and UI) has no stated home; upload concurrency (UX said one at a time, addendum handed it over); password reset; migration timing; prompt versioning.
Fix: `packages/domain/format` is the only formatter for numbers, dates and units, used by UI and renderer; uploads run 2 at a time; password reset is the seed CLI in the MVP; migrations run in the Fly `release_command` and are forward-only; `prompt_version` is logged per reading (see M2).

**L5 — Playwright WebKit as a partial Safari proxy.** Anchor: Conventions "Testing".
iPadOS Safari is manual-only in the plan; Playwright's WebKit project exercises the same IndexedDB and storage-quota code paths on CI.
Fix: add a WebKit project for the `src/db` and `src/sync` e2e scenarios; keep the manual iPad check for eviction and camera.

## Divergence points two independent builders could still hit (item 1, consolidated)

1. How a row is born, removed or reordered through the op log (C1).
2. Whether a pull returns ops or rows, and how pending outbox ops are rebased (C1).
3. Which clock resolves last-writer-wins (C1).
4. Which section-9 scheme the Export dialog offers and where the renderer reads it (C2).
5. Whether registry, Empresa, Template and Account writes are ops or CRUD (H1).
6. How a certificate, logo or cover image is uploaded and made durable offline (H2).
7. What an export does to a relatório's status (H3).
8. Whether LibreOffice ships in the slice and how the TOC gets page numbers (H4).
9. What happens to an op the server rejects (H5).
10. Same-origin or cross-origin web bundle, and therefore cookie, CSRF and CORS behavior (H6).
11. Ops per keystroke or per field commit; what "draft" means in FR-61 (M1).
12. Whether a retried reading job duplicates Suggestions (M2).
13. Coordinate source and EXIF parsing side (M3); stored original size (M4).
14. Dexie migration and stale-bundle behavior (M6).

## What is right and should not be touched

AD-1, AD-4, AD-5's Template snapshot and Cabine ownership, AD-6, AD-7's Blob-before-upload contract, AD-11's decimal-string shape, AD-12 (including the server-side digit-coverage rule, which is the best single line in the document), AD-15's revision-in-transaction and draft-equals-issued test, AD-17, AD-19, AD-20, AD-21, AD-23. The Capability map is complete against FR-1..FR-75.
