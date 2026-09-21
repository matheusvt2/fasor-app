# Rubric Review, pass 2 — ARCHITECTURE-SPINE.md (fasor)

Reviewed: `ARCHITECTURE-SPINE.md` (draft, 2026-09-21, 26 ADs + Source deltas) against the seven-item rubric and against the 23 findings of `reviews/review-rubric.md`. Cross-checked with `.memlog.md`; user decisions recorded there (fast path, spine-only deliverable, TS monolith + OcrProvider with the Python sidecar for FR-36, `relatorio` vocabulary, scheme not exposed in Export) are taken as given.

**Verdict.** The rewrite closes 22 of the 23 first-pass findings (M8 is closed on the spine side only). The op log, sync, file, status, TOC and origin gaps are now rule-shaped and testable. The rewrite introduced one critical gap of its own: it declares `applyOp` the only materializer and the pull "ops by seq", then names seven server-owned fields and rows (reading status, upload ack and variants, `last_nameplate`, generation job, revision, `last_push_at`, company summary) that have no op family and no stated place in the pull payload, which breaks the byte-equal replay test as written. Three high inconsistencies follow from the same rewrite: relatório and project creation have no op family or route, `photo` and `file` are two entities with one ER box and no create op for non-photo files, and `role` has two homes (block row and `BlockConfig`). All are small edits. After them the spine is safe to hand to independent builders.

## Closure of first-pass findings

| # | First-pass finding | Status | Where / residue |
| --- | --- | --- | --- |
| C1 | Op log under-specified (create/remove, pull payload, LWW clock, cursor) | **Closed** | AD-3: `kind: create|put|remove`, `seq` per company, LWW by `seq`, `since={seq}`, `prev_op_id`, replay test. AD-24: pull = ops by `seq` through `applyOp`, outbox rebase. Residue: server-owned fields outside the op log (new C1 below). |
| C2 | AD-16 contradicts FR-72 | **Closed** | AD-16: `groupForPrint(snapshot, scheme)`, `relatorio/export/scheme` op, snapshot captures it, `agrupar_por_tipo` only inside `por_local_e_tipo`; Source deltas record the PRD wording as stale. Consistent with AD-3 path list and AD-15. |
| H1 | Company-scoped writes have no home | **Closed** | AD-3 `scope: company|relatorio`, families `registry/{kind}/{id}`, `template/{id}`, `user/{id}`; ER `COMPANY ||--o{ OP`, `RELATORIO |o--o{ OP`. Residue: `project` and `relatorio` creation still absent (new H1). |
| H2 | File contract covers photos only | **Closed** | AD-7 `file {kind: photo|certificate|logo|cover_background|watermark|cover_photo|preview}`, `PUT /api/files/{id}`, keys per kind, accepted types. Residue: no create op for non-photo kinds, `photo` vs `file` unreconciled (new H2). |
| H3 | Status table content deferred | **Closed** | AD-22 provisional table `[ASSUMPTION]`; Deferred bullet now says "content, PM edits it". Residue: who emits the automatic Emitido → Em revisão op (new M4). |
| H4 | LibreOffice in slice; TOC stability | **Closed** | AD-15: conversion runs in the slice, placeholder-width pass 1, pass-2 assertion + third pass, concurrency 1, `-env:UserInstallation`. |
| H5 | Push batch and rejected-op semantics | **Closed** | AD-24: `{ops}` ≤ 500 in order, `{applied, rejected, seq}`, per-op atomicity, `outbox.status = dead`, "Reenviar", retry table, shape-only rejection. |
| H6 | Web bundle origin | **Closed** | AD-9: same origin, `/api/*`, `SameSite=Lax; Secure`, no CORS. Vite proxy for local dev not stated (harmless). |
| M1 | Op granularity, autosave, FR-61 | **Closed** | AD-1 commit rule, `drafts` table, "outbox is not a draft"; AD-3 outbox coalescing. |
| M2 | Reading job retry and idempotency | **Closed** | AD-14: singleton `(photo_id, reading_kind)`, deletes own pending suggestions, 3 attempts, `reading_status`, `POST /api/photos/{id}/reread`, per-run log fields. |
| M3 | Photo coordinates | **Closed** | AD-17 `coords {lat, lng, accuracy_m, source}`, 5 s timeout, EXIF on device, 4 decimals. |
| M4 | Stored-original size cap | **Closed** | AD-7: JPEG, long edge ≤ 2560 px, q 0.85 `[ASSUMPTION]`; Deferred keeps only the tuning. |
| M5 | Certificate pages, SVG logos, brand watermark | **Closed** | AD-7 and AD-15: LibreOffice 150 dpi rasterization, `sharp` for SVG, brand watermark on the same anchored-image mechanism. |
| M6 | Client versioning | **Closed** | Conventions › Versioning: Dexie append-only + `upgrade()` + test, `CONTRACT_VERSION`, `426 contract_outdated`, SW activation gate. |
| M7 | Unpinned versions | **Closed** | Stack: sdk 0.127, vision 6.0, Vitest 5.0, Playwright 1.63, TypeScript 6.0 chosen (7 under Deferred). Residue: other load-bearing libraries still unnamed (new M7). |
| M8 | AD-15 vs memlog constraint | **Partial** | AD-15 now states the FR-62 reading. `.memlog.md` line 9 still says "never DOCX->PDF conversion"; correct that line (new L4). |
| M9 | No causality on the op | **Closed** | AD-3 `prev_op_id`, MVP ignores, deferred merge dispatches on it and on `parsePath(path).family`. |
| M10 | Wishes without a check; FR-54 scenarios | **Closed** | AD-2 identity test + review rule; AD-10 compile-time arg + two-company test; Testing row names the three FR-54 scenarios. |
| L1 | Diagram/text mismatches | **Closed** | AD-5 lists Templates; ER OP edges; `photo.block_id/item_key` in AD-17 and ER; flow diagram `idb <--> sync`. |
| L2 | Rationale prose | **Closed** (new nits) | Safari 7-day and civil-prescription sentences gone. New small remnants listed under L4. |
| L3 | EXPERIENCE.md install surfaces | **Closed** | Source deltas, third bullet. |
| L4 | Small silences (format home, upload concurrency, reset, migrations, prompt version) | **Closed** | AD-2 `format`, AD-7 two in flight, AD-9 seed CLI, Conventions `release_command`, AD-12/AD-14 `prompt_version`. |
| L5 | Playwright WebKit | **Closed** | Testing row: WebKit project for `src/db` and `src/sync`. |

## Checklist verdicts (fresh)

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Real divergence points fixed, none missed | **Partial** | The first-pass list of 14 is fixed. New ones a pair of builders hits on day one: server-owned state in the pull (C1); relatório/project creation (H1); `photo` vs `file` and non-photo file rows (H2); `role` home (H3); "edited since Rev. N" predicate (M1); the AD-1 fetch lint vs generate/preview/reread/auth calls (M2). |
| 2 | Every Rule enforceable and preventive | **Pass with exceptions** | AD-3's "the family list is exhaustive" is not enforceable while six families end in an open `{field}` (M8). AD-3's replay test cannot pass while server-only columns exist outside the log (C1). Everything else names a schema, a test, a lint rule or a route. |
| 3 | Nothing under Deferred lets two units diverge | **Pass with one conflict** | Every bullet is post-slice or a business input. "Purge and retention" is fine, but AD-15's "preview replaced, 24 h retention" assumes a delete the adapter does not have (M3). Storage-low threshold has no provisional number, but only `src/state` consumes it (L5). |
| 4 | Tech pinned | **Partial** | Every named row is pinned. Unnamed but load-bearing: typescript-eslint (the stated reason for TS 6.0), UUIDv7 generator, EXIF parser, HEIC decode path, S3 client, Postgres driver, fractional-index (M7). |
| 5 | Every structural dimension decided/deferred/open | **Pass with nits** | All dimensions present. Nits: sign-in route outside the contract list (M2); no upload size limit; re-auth and 426 states absent from the banner priority (L5). |
| 6 | Terse, no placeholders or rationale prose | **Pass with nits** | No placeholders. Rationale remnants: AD-14 "vision models hallucinate boxes", AD-15 "because it is the pagination oracle", AD-8 "nothing else can be done about a loss", Deferred OCR spike sentence (L4). |
| 7 | Internal consistency | **Partial** | AD-3 vs AD-7/AD-14/AD-15/AD-24/AD-25 on server-owned fields (C1); AD-3 vs AD-5/AD-13 on relatório and project creation (H1); AD-3 `photo/*` vs AD-7 `file` vs ER `FILE` (H2); AD-6 `block.role` vs AD-21 `BlockConfig.role?` (H3); AD-15 vs AD-22 "edited since" (M1); AD-1 lint vs AD-13 routes (M2); AD-15 preview replacement vs Seed/Environments immutable keys (M3); AD-14 OcrProvider "owned by apps/api" vs "typed in packages/domain/contract/ocr" (M9). AD-16 vs Source deltas: consistent. AD-24 routes vs AD-13 list: consistent (all seven referenced routes and the three error codes appear in AD-13). AD-14 vs Stack/Seed: consistent (google-vision in slice, sidecar post-slice in Stack, Seed and flow diagram). |

## Findings

### Critical

**C1 — Server-owned state has no path through the op log, so "applyOp is the only materializer" and "a pull returns ops by seq" are contradicted by seven other rules.** Anchor: AD-3 (Rule, replay test), AD-24 ("A pull returns ops by seq, applied through applyOp"), AD-14 (`reading_status` "set by the server and pulled like any field"), AD-7 (`uploaded_at`, variants, "the relatório pull carries file rows"), AD-25 (`last_nameplate` "server-maintained", "includes every Equipment row"), AD-15 (`generation_job` "pulled with the relatório", revision row), AD-24 (`last_push_at` "serves it in the relatório pull"), AD-8 ("the company pull carries a per-relatório summary").
None of `photo.reading_status`, `file.uploaded_at`, file variants, `equipment.last_nameplate`, `generation_job`, `revision` or `last_push_at` has a family in the AD-3 list, and none is written by a client. A client sync builder reading AD-24 will expect only ops; a server builder reading AD-14/AD-15 will write columns directly and add rows to the pull response; the AD-3 replay test ("same op log through both layers yields byte-equal snapshots") fails the first time a reading completes, because the snapshot includes "files with variants". AD-12 already solved this pattern for suggestions (server-emitted ops with `actor_id = "system:reading"`, `device_id = "server"`); the rewrite did not extend it.
Fix, in AD-3 and AD-24: every server-owned change is an op emitted by the server with `actor_id: system:{reading|files|generate|sync}`, `device_id: "server"`, on families added to the list: `photo/{id}/reading_status`, `file/{id}/{uploaded_at|variants}`, `equipment/{id}/last_nameplate`, `generation_job/{id}` (create) and `generation_job/{id}/{status|error}`, `revision/{id}` (create). The wire `Op` gains a server-only `seq?`. Pull responses are `{ops: Op[], seq, summary?}` and nothing else; `summary` is the output of kernel `progress` per relatório (AD-2) and `last_push_at` is a field of it. Delete "pulled like any field", "carries file rows", "includes every Equipment row" and "pulled with the relatório" in favor of "arrives as ops". The replay test then holds as written.

### High

**H1 — Relatório and Project creation have no op family and no route.** Anchor: AD-3 family list (`relatorio/setup/{field}`, `relatorio/status`, `relatorio/export/scheme` only), AD-5 ("At creation it copies the Template's `BlockConfig`s and skeleton into its own rows"), AD-13 route list (no `POST /api/relatorios`, no projects route), Capability map row "Projects, relatórios, tree (FR-15..FR-21)".
A relatório is born offline on a tablet (FR-15..FR-17 in slice) and a Project is born with it; the only write path is an op, and neither `relatorio/{id}` nor `project/{id}` exists. Who performs the Template copy (client or server) is also unstated, which decides whether a relatório created offline has sheets before first sync.
Fix, in AD-3: add `project/{id}` (create, `scope: company`), `project/{id}/{field}`, `relatorio/{id}` (create, `scope: company`, so the company pull's summary sees it). In AD-5: creation is one client batch, `relatorio/{id}` create plus the `location/{id}` and `block/{id}` creates produced by a kernel function `instantiateTemplate(template, seedVersion)`; the server never copies. Add `instantiateTemplate` to AD-2's list.

**H2 — `photo` and `file` are two entities with one ER box; non-photo files have no create op; file references from owning rows are unstated.** Anchor: AD-3 (`photo/{id}` create, `photo/{id}/{caption|block_id|item_key|removed_at}`, no `file/*`), AD-7 ("one entity `file {id, company_id, relatorio_id?, kind, sha256, mime, size, uploaded_at?}`"), AD-14 and AD-17 (photo row fields `reading_kind`, `reading_target`, `captured_at`, `tz_offset`, `coords`, `local_seq`), AD-24 (`409 file_row_missing`, "fotos aguardando = files without uploaded_at"), AD-19 ("section 11 resolves the certificate file by `instrument_id`"), ER (`FILE` only).
AD-24 requires a create op before bytes for every file, but the only create family is `photo/{id}`; the certificate, logo, cover-background, watermark and cover-photo stories have no op to emit and will invent one each. AD-7's `file` shape lacks every photo field the other ADs name, so the sheet builder will create a `photo` table and the files builder a `file` table. `instrument → certificate`, `empresa → logo|watermark|cover_background` and `relatorio → cover_photo` links appear on neither side.
Fix: in AD-7, `file` is a zod discriminated union on `kind`; the `photo` variant adds `{captured_at, tz_offset, coords?, local_seq, block_id?, item_key?, caption?, reading_kind?, reading_target?, reading_status}`. In AD-3, rename the family to `file/{id}` (create) and `file/{id}/{caption|block_id|item_key|removed_at}` (the four valid only on `kind = photo`, zod refinement); keep `POST /api/photos/{id}/reread` as the route name. References go from owner to file, never the reverse: `registry/instrument/{id}/certificate_file_id`, `registry/empresa/{id}/{logo_file_id|watermark_file_id|cover_background_file_id}`, `relatorio/setup/cover_photo_file_id`; state it in AD-7 and add `INSTRUMENT }o--o| FILE` to the ER.

**H3 — `role` has two homes.** Anchor: AD-6 ("`block` carries `role: entrada|saida|alimentacao|null`"), AD-3 (`block/{id}/role`), AD-21 (`BlockConfig = {block_type, subtype?, role?, ...}`, editable through `block/{id}/config`).
The Template composer writes `BlockConfig.role`; the tree builder writes `block/{id}/role`; `groupForPrint` reads one of them. Two switches for one fact.
Fix: keep `role` inside `BlockConfig` (it is template-authored and copied with the config) and delete `role` from the block row and from the `block/{id}/*` family; or the reverse. One sentence in AD-6 and AD-21, one token in AD-3.

### Medium

**M1 — "Edited since Rev. N" has two predicates and mixes `op_id` with `seq`.** Anchor: AD-15 ("edited since Rev. N is `exists op with seq > snapshot_last_op_id`"; "a generate with no op newer than the last revision's `snapshot_last_op_id` returns that revision"), AD-22 ("`Emitido —any op on sheet/tree/setup→ Em revisão`").
`snapshot_last_op_id` is a UUIDv7, `seq` an integer; the comparison is not typed. AD-15 counts any op, so a server-emitted suggestion op or a `relatorio/status` op after issue makes the next generate allocate Rev. N+1 with no user change, while AD-22 counts only sheet/tree/setup. Home banner and Export dialog will disagree.
Fix: revision stores `snapshot_seq`; the kernel exports one `editedSince(snapshot_seq)` = exists op with `seq > snapshot_seq` whose `parsePath(path).family ∈ {relatorio/setup, location, block, sheet, file(photo), point, equipment}`; AD-15, AD-22 and the Home banner all call it.

**M2 — AD-1's fetch lint has no room for the calls AD-13 lists, and sign-in is outside the contract.** Anchor: AD-1 ("The only modules that call the network are `src/sync` and `src/files`; a lint rule forbids `fetch` elsewhere"; "no component awaits an HTTP call to render or to save"), AD-13 route list (`POST .../generate`, `POST .../preview`, `POST /api/photos/{id}/reread`), AD-15 ("the Export dialog ... then calls generate"), AD-9 (better-auth sign-in).
The Export dialog, the reading tile's "Tentar novamente" and the sign-in screen each perform an HTTP action. The first builder to hit the lint either weakens the rule or hides `fetch` in a hook.
Fix: add `src/api` to AD-1 and the Seed as the third permitted fetch site, holding one typed function per contract route (`generate`, `preview`, `reread`, `signIn`, `signOut`); the Export dialog calls `src/api.generate` after `src/sync.flush()`. Rephrase the AD-1 sentence to "no component awaits an HTTP call to render or to persist a field". In AD-13, list `/api/auth/*` (better-auth handler) as a contract route family.

**M3 — Preview "replaced per relatório, 24 h retention" needs a delete the storage adapter does not have.** Anchor: AD-15, Seed (`src/storage/ # immutable keys, no delete in MVP`), Environments paragraph ("the adapter has no delete in the MVP"), Deferred "Purge and retention".
Fix: every preview is a new `file` row and key; the relatório holds `preview_file_id` (server-emitted op, see C1); old previews are orphans until the deferred purge. Delete "replaced" and "24 h retention" from AD-15.

**M4 — Who emits the automatic status transition is unstated.** Anchor: AD-22 ("every transition is an op on `relatorio/status`"; "`Emitido —any op on sheet/tree/setup→ Em revisão` (automatic)"), AD-24 ("the server ... never rejects for a domain rule").
The device can compute the transition from `statusTable` at commit; the server can compute it on apply. If both do, two `relatorio/status` ops; if neither, no transition.
Fix, in AD-22: the emitting device appends the `relatorio/status` op to the same batch as the triggering op, computed by `statusTable`; the server never writes `relatorio/status`. Also state that `setup_complete` is emitted by the Setup surface when kernel `integrity` reports setup complete.

**M5 — AD-18's `first_edited_at` and `last_modified_by` have no op path and no stated derivation.** Anchor: AD-18, AD-3 (`block/{id}/{...|concluded_by}` only).
Fix: state that `applyOp` materializes `created_by` from the create op, `first_edited_at` from the first `sheet/{blockId}/*` op and `last_modified_by`/`last_modified_at` from the latest one, using `actor_id` and `client_ts`; only `concluded_by` is a written path. That keeps the replay test deterministic.

**M6 — The company-pull "summary (status, counts)" is a second progress computation unless pinned to the kernel.** Anchor: AD-8, AD-2 ("Neither app may contain a function that takes a sheet or relatório and returns a status, count ...").
Fix: the summary is `progress(snapshot)` from `packages/domain` run on the server's materialized state, serialized as-is; the Home card renders it through the same component that renders the local `progress` result.

**M7 — Load-bearing libraries still unnamed.** Anchor: Stack table.
typescript-eslint (the reason TypeScript is 6.0), a UUIDv7 generator (Node 24 and browsers mint v4 only), the EXIF parser AD-17 relies on, the HEIC decode path AD-7 promises (`heic→jpeg` on Android Chrome needs a decoder), the S3 client for `src/storage`, the Postgres driver under Drizzle, the fractional-index implementation for `order_key`. Two builders pick two `uuid` libraries and two fractional-index encodings; the latter is a sort-order divergence.
Fix: add rows with versions verified on 2026-09-21 and record them in the memlog: `typescript-eslint`, `uuid` (v7), `exifr` or equivalent, `heic2any` or "HEIC import unsupported in the slice" `[ASSUMPTION]`, `@aws-sdk/client-s3`, `pg` or `postgres`, `fractional-indexing`.

**M8 — Six op families end in an open `{field}`, which makes "exhaustive" and `op_path_unknown` unenforceable.** Anchor: AD-3 (`relatorio/setup/{field}`, `location/{id}/se/{field}`, `location/{id}/env/{field}`, `point/{id}/{field}`, `registry/{kind}/{id}/{field}`, `template/{id}/{field}`, `user/{id}/{field}`), AD-24 (`op_path_unknown`).
Fix: one sentence in AD-3: "`{field}` is a key of the target entity's zod schema; `parsePath` resolves it against the schema and rejects unknown keys; `{kind}` is the enumerated registry kind list."

**M9 — OcrProvider contract: two owners and a contract the Python side cannot consume.** Anchor: AD-14 ("two interfaces owned by `apps/api/jobs/reading`" and "private HTTP contract typed in `packages/domain/contract/ocr`"), AD-13 ("`packages/domain` imports nothing app-specific (zod only)"), Deferred "OCR sidecar".
Fix: the `OcrProvider` TS interface and the sidecar wire schema live in `packages/domain/contract/ocr`; implementations live in `apps/api/jobs/reading`; the build exports the zod schema to JSON Schema and the sidecar validates with pydantic generated from it, so there is one contract. Three words in AD-14 and the Deferred bullet.

### Low

**L1 — Entity shapes omit `company_id` that AD-10 mandates.** Anchor: AD-6 `location {...}`, AD-12 `suggestion {...}`, AD-5 `equipment {...}`, AD-15 `revision`/`generation_job`, AD-10.
Fix: one sentence in AD-10: "the Drizzle layer adds `company_id` to every table; kernel entity schemas carry it only on `op` and `file`; `toSnapshot()` strips it".

**L2 — Small silences inside otherwise closed rules.** Anchor: AD-17 (`local_seq` in the sort key is not a declared photo field), AD-20 ("Restaurar" is a `put` of `removed_at = null`, say so), AD-3 (a coalesced op keeps the first op's `prev_op_id`), AD-25 (an Equipment op appears in several relatório cursors: the client deduplicates by `op_id` across pulls), AD-8 (`sync_state` is per relatório; the company scope needs its own row, id = `company`).
Fix: one clause each.

**L3 — Seed and Capability map gaps.** Anchor: Structural Seed, Capability map, flow diagram.
`groupForPrint`, `numberPhotos`, `resolveSection8`, `derivedPoints`, `section11Instruments`, `contextCaption`, `extractPhotoRefs` have no folder in `packages/domain` (add `print/`; add `extractPhotoRefs` to AD-2's list). AD-23 and AD-13 govern every surface and appear in no map row. "Generation" row lacks AD-7 (embeds `print`), AD-19 (sections 9 and 11) and AD-26 (section 8). "Equipment sheet capture" lacks AD-6 and AD-21. The flow diagram's IndexedDB box omits `local_prefs`. Object key for relatório-scoped non-photo files (`preview`, `cover_photo`) is not covered by either key pattern in AD-7.
Fix: one editing pass.

**L4 — Rationale prose remnants and the stale memlog constraint.** Anchor: AD-14 ("vision models hallucinate boxes"), AD-15 ("because it is the pagination oracle"), AD-8 ("nothing else can be done about a loss"), Deferred "OCR sidecar" ("after a spike ... decides whether PaddleOCR/PARSeq beats the cloud"), `.memlog.md` line 9 ("never DOCX->PDF conversion").
Fix: cut the four clauses (the memlog already holds the why); reword the memlog constraint to the PRD's "never a conversion of an edited DOCX".

**L5 — States and limits not in the lists that enumerate them.** Anchor: Conventions banner priority (no re-auth banner from AD-9, no 426 state from AD-13), AD-7 (no maximum upload size on `PUT /api/files/{id}`), Deferred "Storage-low threshold" (no provisional number).
Fix: add "re-auth" between "conflict" and "draft found" and treat 426 as a full-screen state; `PUT` rejects bodies over 25 MB `[ASSUMPTION]` with `413 file_too_large` (a 4xx, never retried); warn when `storage.estimate()` reports under 500 MB free `[ASSUMPTION]`.

## Divergence points two independent builders could still hit

1. Whether server-owned fields arrive as ops or as rows, and whether the replay test includes them (C1).
2. How a relatório or project is created offline and who copies the Template (H1).
3. Whether a certificate or brand image has a row before its bytes, and where its owner points at it (H2).
4. Where `role` is written and read (H3).
5. Which predicate decides "edited since Rev. N" (M1).
6. Where the generate, preview, reread and sign-in calls live under the fetch lint (M2).
7. Which library encodes `order_key` and which mints UUIDv7 (M7).

## What is right and should not be touched

AD-3's envelope, `seq` LWW and `prev_op_id`; AD-24 as a whole; AD-7's re-encode, Blob-first and eviction rules; AD-12 unchanged; AD-15's barrier (`409 not_caught_up`), two-pass TOC with the pass-2 assertion, revision-in-transaction; AD-16 as reconciled with the Source deltas; AD-21's `BlockConfig` and append-only seed; AD-22's provisional table; AD-25's fan-out and `last_nameplate` projection (once it rides the op log per C1); AD-26; the Source deltas section, which is exactly the artifact the first pass asked for.
