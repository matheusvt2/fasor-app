---
name: review-adversary
target: ../ARCHITECTURE-SPINE.md
lens: adversarial (pairs of one-level-down units that obey every AD and still build incompatibly)
sources-read: ARCHITECTURE-SPINE.md (full); prd.md §4, §5.3–5.10, §7.3; EXPERIENCE.md Block Model, Smart Input, Capture-to-Document, Offline & Sync, Handed to architecture
date: '2026-09-21'
---

# Adversarial review — fasor architecture spine

**Verdict.** The spine fixes the right things (one kernel, ops as the unit of change, one renderer over a snapshot, ownership by relatório) but leaves the *shapes* those things travel in as examples and prose, so the four load-bearing seams — the op grammar, the sync push/pull/reject cycle, the photo read path, and the export barrier — can each be built two consistent ways by two teams that both pass an AD audit. Four holes are critical, four high, two medium. All ten close with tightened rules; none needs a paradigm change.

Method: for each pair, Unit A and Unit B are epics or surfaces one level below the spine. "Both comply" cites the ADs each reading satisfies. "What breaks" is the observable failure. The proposed AD is written to slot into the spine as-is.

---

## Critical

### C1 — The op path grammar is illustrated, not defined; `apply` has no home

**Pair:** the equipment sheet epic (FR-22–32) vs the sync engine epic (FR-54–61); the same fault recurs in "cabine data block vs tree" and "field block add vs TAG suggestion".

**Unit A builds (sheet):** ops on `sheet/{blockId}/nameplate/{fieldKey}`, `sheet/{blockId}/checklist/{itemKey}/result`, `sheet/{blockId}/checklist/{itemKey}/observation`, `sheet/{blockId}/conclusion/result`, `sheet/{blockId}/conclusion/restriction`, `sheet/{blockId}/not_tested/reason`. "Marcar os restantes como Conforme" emits 11 ops; the undo toast emits 11 inverse ops. A local reducer in `apps/web/src/db` turns each op into a Dexie row update.

**Unit B builds (sync engine + `apps/api/src/sync`):** a server materializer that switches on the string prefix (`sheet/`, `relatorio/`) and stores anything it does not recognise as an opaque `(entity_id, path, value)` triple in a `sheet_values` table. Block creation is not a "sub-block field", so it is sent as `{entity: "block", entity_id, path: "", value: {...row}}`; location creation as `{entity: "location", path: "create", value}`; photo linking as `{entity: "photo", path: "block_id", value}`. Bulk actions are one op with `path: "checklist/*"` and `value: "C"` because "a change is what the user did".

**Why both comply.** AD-3 gives three example paths and says `path` "addresses one sub-block field"; it says nothing about creation, structure, photos, points, suggestions or registries, all of which are "mutable entities" bound by the same AD. AD-2 lists the merge policy in the kernel but not the reducer that applies an op, so two reducers (Dexie, Drizzle) are permitted by the letter.

**What breaks.** The merge policy in `packages/domain/merge` ("NC beats C", "filled beats empty") has to know that a path *is* a checklist result or a measurement cell; with two ad-hoc string encodings it cannot dispatch, so the deferred multi-device merge — the thing AD-3 exists to keep as "a policy swap" — becomes the rewrite it forbids. Two reducers produce two materialisations of the same log (the client's undo of a bulk action leaves 11 rows C on the server that received one wildcard op). Ops for entities the server does not know are stored opaquely and never surface in the pull, so the tree on a second device is empty while the sheets are full.

**Proposed: AD-3 tightened — Op grammar is a kernel type; `applyOp` is the only reducer.**

- **Binds:** `packages/domain/ops`, every emitter in `apps/web`, `apps/api/src/sync`, the merge policy, the deferred Conflict view.
- **Prevents:** two string encodings of the same change; two materialisers of the same log; a merge policy that cannot tell what a path means; bulk actions that are one op on one side and N on the other.
- **Rule:** `packages/domain/ops/path.ts` exports `OpPath` as a zod discriminated union of *families*, each with typed segments and a value schema; `parsePath`/`formatPath` are the only way to read or write one. The family list is exhaustive for the slice: `relatorio/setup/{field}`, `relatorio/status`; `location/{id}` (create), `location/{id}/{name|parent_id|order_key|removed_at}`, `location/{id}/se/{field}`, `location/{id}/env/{field}`, `location/{id}/agrupar_por_tipo`; `block/{id}` (create), `block/{id}/{location_id|order_key|removed_at|config|state|not_tested|concluded_by}`; `sheet/{blockId}/nameplate/{fieldKey}`, `sheet/{blockId}/checklist/{itemKey}/{result|observation}`, `sheet/{blockId}/test/{testKey}/{enabled|instrument|test_voltage}`, `sheet/{blockId}/test/{testKey}/cell/{row}/{col}`, `sheet/{blockId}/conclusion/{result|restriction|text|text_status}`; `equipment/{id}` (create), `equipment/{id}/tag`; `photo/{id}` (create), `photo/{id}/{caption|block_id|checklist_item_key|removed_at}`; `point/{id}` (create), `point/{id}/{field}`; `suggestion/{id}` (create), `suggestion/{id}/status`; `registry/{kind}/{id}` (create), `registry/{kind}/{id}/{field}`. A *create* is an op whose path is the entity root and whose value is the full row schema; a second create on the same id is a no-op. There are no wildcard paths: a bulk action is N ops sharing one `batch_id` in the op envelope, and undo is N inverse ops with a new batch. `applyOp(state, op): state` lives in `packages/domain/ops/apply.ts` and is the *only* materialiser, called by the Dexie layer and by the Drizzle layer; the merge policy dispatches on `parsePath(op.path).family`. A path outside the union fails zod at emit time on the device and returns `400 op_path_unknown` on the server. The outbox replay test replays a fixture log through both layers and asserts equal snapshots (see C5).

---

### C2 — Push, pull, and rejection have no ordering rule, and a 4xx is forever

**Pair:** the equipment sheet epic vs the sync engine epic; "field block add" vs "TAG suggestion" (the TAG uniqueness rule is where the 4xx bites first).

**Unit A builds (sync engine):** on `online`, run pull first ("get the office's changes before sending mine"), apply the pulled rows straight into Dexie tables, then push the outbox. Any 4xx moves on: "4xx never retried" (Consistency Conventions), so the op is deleted from the outbox and the engine logs it. The uploader, per AD-7, sends photos "with a pending reading first" — so a plate photo's `PUT` goes out before the ops that created its photo row and its block.

**Unit B builds (sheet + field add):** every keystroke is an op applied locally through `useLiveQuery`; the engineer creates block `SEC-C05` in the field; the server has a unique index on `(project_id, tag)` (AD-5 says "unique") and the office created `SEC-C05` in the same project yesterday from the template. The server returns `409 tag_taken`.

**Why both comply.** AD-1 says apply locally first and never await HTTP. AD-3 says the server "applies them idempotently … materializes state, and serves changes by a per-relatório cursor" — it does not say whether the pull carries ops or rows, nor that a pull must not clobber a pending local op. The conventions say 4xx is never retried; nothing says what happens to the *local state* the rejected op already produced. AD-7 orders photo uploads among photos, not relative to ops.

**What breaks.** (1) Pull-before-push overwrites the row the engineer is editing with the server's older value until the push lands and the next pull returns it — the field visibly flickers back, and on a flaky link stays back. (2) The 409 on the TAG deletes the op: the block exists on the tablet forever and never on the server; the document generated Monday lacks a sheet the engineer filled on Saturday, and no surface says so. (3) The plate `PUT` arrives before the photo row op; the reading job finds no `block_id` and no `reading_kind` on a row that does not exist, and either fails (kept in the queue with no retry, since the file is stored) or is never enqueued; FR-42's "the reading runs at the first bar" silently does not. Every one of these is a single-device failure, inside the slice.

**Proposed: AD-24 (new) — Sync order and rejection semantics.**

- **Binds:** `apps/web/src/sync` (engine and uploader), `apps/api/src/sync`, `apps/api` files route, every op emitter; FR-54, FR-56, FR-42, FR-60.
- **Prevents:** a pull clobbering unsent work; an op rejected for a business reason leaving device and server divergent forever; a photo file arriving before the row that gives it meaning; a photo stuck behind a non-retryable 4xx.
- **Rule:** Order is *push ops → upload photos → pull*, and a pull is applied through `applyOp` (C1) and never overwrites a path that has a pending outbox op; the outbox is rebased on top of the pulled state. Ops that create or link a photo are pushed before that photo's file; `PUT /files/photos/{id}` for an unknown row returns `409 photo_row_missing`, which the uploader treats as retryable — the only 4xx that is; the retry table is `{4xx: never, except 409 photo_row_missing and 401 (re-auth banner, outbox intact)}`. The server rejects an op only for shape (`400`) or tenant (`403`); it *never* rejects an op for a domain rule — duplicate TAG, unknown location, edit on a tombstoned block are applied and reported by a kernel `integrity(snapshot)` check that feeds the pre-issue list and the sync status surface ("TAG SEC-C05 duplicada — Renomear"). There is no unique index on `(project_id, tag)`; uniqueness is a kernel check on both sides. A rejected op is moved to a `dead_ops` store with the error code and the local state is re-derived from the remaining log; it is counted on the sync badge and never silently dropped.

---

### C3 — Equipment lives in neither sync cursor, and "Copiar da última visita" reads a relatório the device does not have

**Pair:** field block add (FR-18) and TAG suggestion vs the sync engine; equipment sheet capture (FR-34) vs AD-1/AD-8.

**Unit A builds (sync engine):** two cursors exactly as AD-13 lists them — `GET /sync/relatorios/{id}?since=` returns the relatório's own rows (AD-5: tree, blocks, sheet data, photos, points, suggestions), and `GET /sync/company?since=` returns "the registries" (AD-5: users, Empresa, Clients, Instruments, Manufacturers, Voltage classes, Criteria). Equipment is Project-owned, so it is in neither; the engine pulls relatórios in Rascunho/Em campo only (AD-8).

**Unit B builds (sheet + field add):** a block references `equipment_id`; "Copiar da última visita (SEC-ENT)" looks up the previous relatório of the same project by `equipment_id` (AD-5 says exactly this) — that relatório is Emitido, so per AD-8 it is not on the device; Unit B fetches it with an HTTP call, or adds `GET /relatorios/{id}` to the contract, or gives up offline. TAG suggestion `suggestTag(type, column, existingTags)` needs every Equipment of the project to avoid collisions; Unit B reads `existingTags` from the blocks in this relatório only.

**Why both comply.** AD-5 places Equipment under Project; AD-13's route list has no Project cursor and its exhaustiveness is enforced by `no-restricted-imports`. AD-8 names what is pulled. AD-5 names the copy source. Each unit builds the half it owns.

**What breaks.** A block created in the office references an Equipment row the tablet never receives; the tree renders `equipment_id` with no TAG, "Copiar" never appears, and a field-added block invents a TAG that collides with an equipment the tablet cannot see (C2 makes that collision silent). "Copiar da última visita" is the one cross-visit read the MVP performs (FR-34) and it cannot obey AD-1 without a contract route, so Unit B either breaks AD-1 or ships the feature dead.

**Proposed: AD-25 (new) — Equipment rides the relatório cursor; the copy source is a server projection.**

- **Binds:** `packages/domain/contract`, both sync layers, block creation, TAG suggestion, FR-7, FR-18, FR-34, FR-38.
- **Prevents:** a Project-owned row with no sync path; a cross-visit read that needs a network; two devices suggesting the same TAG from partial views.
- **Rule:** `GET /sync/relatorios/{id}?since=` includes every Equipment row of the relatório's Project (not only those referenced), so `suggestTag` and the uniqueness check see the whole site. Equipment ops (`equipment/{id}`, `equipment/{id}/tag`) go through `POST /sync/ops` with `project_id` in the envelope; the server fans them into the cursor of every relatório of that project. Each Equipment row carries a server-maintained projection `last_nameplate: {relatorio_id, revision_number, issued_at, values} | null`, rebuilt when a revision is stored (AD-15) from that revision's snapshot — the only content of an Emitido relatório that ever reaches a device automatically. "Copiar da última visita" reads `equipment.last_nameplate` from Dexie and writes plain-value ops; it never fetches. Equipment is soft-deleted (AD-20) and never removed while any block references it.

---

### C4 — There is no way to read a photo, no owner of the thumbnail, and the original is deleted before the crop that needs it arrives

**Pair:** the photo gallery / uploader (FR-43–48) vs the generation job (FR-67, FR-68); the reading job (AD-14) vs the Suggestion field (AD-12, FR-33, FR-41).

**Unit A builds (photo store + gallery):** at capture, the original `Blob` and a ≤512 px canvas thumbnail go into IndexedDB in one transaction; the gallery renders the thumbnail; after `PUT /files/photos/{id}` is acknowledged, the original is deleted locally (AD-7 says exactly this). Other devices' thumbnails "are pulled automatically" (AD-8), so Unit A embeds them base64 in the relatório pull, since AD-13 lists no `GET` route for files. The `PUT` body is the original; the thumbnail is never uploaded, because the server has `sharp` and can make its own.

**Unit B builds (reading job + Suggestion field):** the job runs OCR on the original in object storage and writes `source: {photo_id, bbox, ocr_token_ids}` with `bbox` in original pixel coordinates (the OCR's coordinate space). The Suggestion field renders the crop by drawing `bbox` onto… the only image the device still has: the 512 px thumbnail — the original was deleted at ack, and every suggestion arrives *after* ack by construction. Unit B therefore adds `GET /files/photos/{id}` to fetch the original for the crop and for "tap to zoom the region".

**Unit C builds (generate job):** embeds photos in the DOCX from object storage — the original, since that is the only server-side variant AD-7 names.

**Why both comply.** AD-7 says "client-side thumbnail serves the gallery", "originals stored server-side", "deleted locally only after ack". AD-13's route list is exhaustive and has no file `GET`. AD-8 says thumbnails are pulled and other devices' originals are fetched on demand — through no named route. AD-12 leaves `bbox`'s coordinate space and image variant unstated. Sharp is in the stack with no stated job.

**What breaks.** A 12-field nameplate on a 4000 px photo, cropped from a 512 px thumbnail, is an unreadable smudge — the crop is the *entire* trust mechanism of FR-33/FR-41 ("the crop beside each value keeps the check possible on Monday"), so the one assist in the slice ships without its evidence. Two units each invent a file read route, one as base64-in-pull (bloating a cursor that must be cheap on a timer) and one as `GET`. The DOCX with about 82 originals at 3–5 MB each is a 300 MB document that Word will not open on the client's machine; FO.SERV-03 today is 124 pages. AD-7 and AD-8 also contradict each other on whether a device keeps its own originals ("deleted after ack" vs "originals of *other* devices' photos fetched on demand").

**Proposed: AD-7 tightened and AD-26 (new) — Photo variants, the read route, and the crop contract.**

- **Binds:** photo store, uploader, `packages/domain/contract`, `apps/api` files route and `sharp`, reading job, Suggestion field, generate job; FR-33, FR-41, FR-42, FR-45, FR-56, FR-67, FR-68.
- **Prevents:** two file read paths; a crop drawn on the wrong image; a document that embeds originals; a device throwing away the only evidence a suggestion has.
- **Rule:** Three variants, one owner each: `original` (immutable, object storage, uploaded by `PUT /files/photos/{id}`); `thumb` (≤512 px) and `print` (≤2000 px long edge, JPEG q85, EXIF orientation baked in) generated by the server with `sharp` on receipt. The device makes its own `thumb` at capture for offline use and replaces it with the server's on pull, so every device shows the same gallery. Contract adds `GET /files/photos/{id}/{original|thumb|print}` (session cookie, `company_id` checked); the relatório pull carries photo *rows* only, never bytes; the sync engine prefetches `thumb` for pulled photos and nothing else. `Suggestion.source.bbox` is normalised `[x0, y0, x1, y1]` in `[0, 1]` over the *oriented* original; the reading job converts OCR pixel boxes before writing; the Suggestion field renders the crop from the local original when present, else from `GET …/original` (on demand, cached in IndexedDB as a `crop` blob, never re-fetched). The local original is *not* deleted at ack: it is marked `acked` and becomes the first candidate for eviction under storage pressure (AD-8 threshold), evicted oldest-acked-first while the thumb stays; a relatório leaving Em campo/Rascunho on this device evicts all its acked originals. The renderer embeds `print`, never `original`; section 11 certificates follow the same route family (`GET /files/certificates/{id}`).

---

## High

### H1 — Pre-issue runs on device state, generation runs on server state, and nothing forces them to be the same state

**Pair:** pre-issue checks (FR-73, `packages/domain/checks`) vs export (FR-62, AD-15); the revision list (FR-74) vs post-export edits (FR-21, FR-48).

**Unit A builds (Export dialog + Sumário):** `preIssue(localState)` over Dexie — outbox ops included, unsent photos included — shows "0 pendências"; "Gerar" calls `POST /relatorios/{id}/generate` when `navigator.onLine`. The banner "edited since Rev. 2" compares `relatorio.updated_at` with `revision.created_at`. Provisional photo numbers are computed over all local photos.

**Unit B builds (generate job):** freezes a snapshot from Postgres; numbers the photos the server has; the sync timer fired 40 s ago and the last 12 ops and 3 photos are still on the tablet. Unit B also keys `RelatorioSnapshot` as a Drizzle join shape, while Unit A hands the kernel its Dexie rows; `groupForPrint(snapshot)`, `preIssue(snapshot)` and `numberPhotos(snapshot)` are typed against whichever adapter each side wrote first. Separately, the slice ships DOCX-only (§7.3 wait 2) and Unit B reads AD-15 literally: no PDF, so no "PDF outline" to read heading pages from, so the TOC is a Word `TOC` field that updates on open — which is not "static", differs between Word and LibreOffice, and breaks the draft-equals-issued test.

**Why both comply.** AD-2 puts the checks in the kernel — it does not name their input type. AD-15 says the snapshot is "a JSON snapshot" — shape unstated. AD-1 forbids awaiting HTTP to render or save, so Unit A does not wait for a flush before generate. AD-15's revision stores "both files" and the TOC algorithm depends on the PDF, while §7.3 defers the PDF; the spine never reconciles the two.

**What breaks.** The generated document lacks the last sheet and three photos while the dialog said clean; photo numbers in the document differ from the provisional numbers the engineer just read in the gallery; the "edited since revision" banner fires on a timestamp that the sync itself bumps. The kernel's single-implementation promise (AD-2) is kept in name only when its inputs are two shapes. The TOC either needs LibreOffice in the slice (then the PDF costs nothing and the deferral is fictional) or is not static.

**Proposed: AD-15 tightened — `RelatorioSnapshot` is a kernel type; generate is barrier-gated; LibreOffice runs in the slice.**

- **Binds:** `packages/domain/schemas/snapshot`, both `toSnapshot()` adapters, every kernel function that takes "the relatório", `POST /relatorios/{id}/generate`, the Export dialog, the revision row, FR-48, FR-62, FR-65, FR-73, FR-74.
- **Prevents:** the pre-issue list and the document disagreeing about what exists; two kernel input shapes; a TOC that depends on which application opens the file; "edited since" measured by wall clock.
- **Rule:** `RelatorioSnapshot` is a zod schema in the kernel (relatório, tree, blocks with `seed_version`, sheet values, photos with variants, points, confirmed suggestions only, tombstones excluded, plus the referenced registry rows and the Empresa). `toSnapshot()` exists twice — `apps/web/src/db` from Dexie, `apps/api/src/sync` from Postgres — and the outbox replay test asserts both produce byte-equal snapshots from the same op log. `preIssue`, `progress`, `groupForPrint`, `numberPhotos`, `composeConclusion`, `composeParecer` take only a `RelatorioSnapshot`. `POST /relatorios/{id}/generate` carries `{last_op_id, photo_ids_expected: uuid[]}`; the server answers `409 not_caught_up` with what is missing until every listed op is applied and every listed photo stored; the Export dialog's "Gerar" first drives the sync engine to flush (an "Enviando 12 alterações e 3 fotos…" state owned by the sync engine, which AD-1 permits) and only then calls generate. A revision row stores `snapshot_last_op_id`; "edited since Rev. N" is `exists op with op_id > snapshot_last_op_id`; a generate with no newer op returns Rev. N again and allocates nothing. LibreOffice headless runs inside the generate job in the slice for the two-pass TOC; the PDF is produced and stored from day one and the §7.3 deferral is re-read as "the PDF download is not surfaced in the Export surface until wait-list item 2".

---

### H2 — Template composer and relatório creation disagree on what a block "definition" is, and the seed version is pinned nowhere that survives a deploy

**Pair:** template composer (FR-9–11, FR-13) vs relatório creation (AD-5) vs the sheet and the renderer.

**Unit A builds (template composer):** a Template row is `{blocks: [{block_type, subtype, quantity, location_ref, sub_block_defaults}]}` where `sub_block_defaults` is whatever the composer UI's toggles produce — `{isolacao: true, contato: false, ia_ip_columns: true, na_items: ["item_3"]}` — and the field list, checklist and table grammar are looked up from `packages/domain/seed` by `(report_type, block_type)` at render time, because AD-21 puts them there.

**Unit B builds (relatório creation + sheet):** AD-5 says creation "copies the Template's block definitions and skeleton into its own rows", so each Block row gets a copy of the *definition* (field list, checklist items, table grammar) as JSON, and the sheet renders from the row. The Block palette opened inside a sheet edits that JSON.

**Unit C builds (renderer):** reads the kernel seed at its own `seed_version` (the one in the deployed image) for every block, ignoring what the row says.

**Why both comply.** AD-21 keeps definitions in the kernel "with a seed_version"; AD-5 says the relatório copies "block definitions"; neither says which of definition vs configuration is copied, nor what shape a sub-block default has, nor that the kernel keeps *past* seed versions.

**What breaks.** Three shapes of "what this block contains" — template config, block-row copy, kernel seed — and the document prints from the third. Fix a typo in checklist item 8 in seed v2, deploy, and every open relatório's sheets change on the tablet while the server has already generated Rev. 1 from v1; the draft-equals-issued test cannot catch it because both sides moved. "Duplicar copies a block's structure" and "Block palette from inside the sheet" each mutate a different one of the three.

**Proposed: AD-21 tightened — `BlockConfig` is the only thing copied; seed versions are append-only and pinned per block.**

- **Binds:** `packages/domain/seed`, `packages/domain/schemas/block`, Template rows, Block rows, the Block palette (both entry points), "Duplicar", the renderer, `RelatorioSnapshot`; FR-9, FR-11, FR-13, FR-22.
- **Prevents:** field lists living in a row and in the kernel; a seed change rewriting open relatórios; the renderer using a different seed than the sheet.
- **Rule:** `BlockConfig = {block_type, subtype?, role?, sub_blocks: Record<SubBlockKey, {enabled: boolean, options?: Record<string, boolean | string>}>, na_defaults: ItemKey[]}` is a kernel zod schema; a Template block is `BlockConfig + {quantity, skeleton_location_ref}`; a Block row stores one `BlockConfig` (copied at creation, editable per sheet through `block/{id}/config`) and a `seed_version`. Definitions (field lists, checklist texts, table grammars, criteria, boilerplate) are *never* copied into any row; they are resolved by `getDefinition(seed_version, report_type, block_type)`. `packages/domain/seed` is append-only by version (`seed/v1.ts`, `seed/v2.ts`, `seed/index.ts` exporting all), so every bundle can resolve every version it ever shipped; a Template records the `seed_version` it was composed against and passes it to the relatório, whose blocks inherit it; a block added in the field takes the relatório's version. The snapshot carries `seed_version` per block and the renderer resolves by it. The sub-block keys and option names (`isolacao.options.ia_ip_from_display`) are enumerated in the kernel, not free strings.

---

### H3 — The tree schema lacks what its two consumers store on it: cabine data has no column, "first sheet" has two meanings, and cable–transformer pairs have no key

**Pair:** the "Da cabine" block (FR-24) vs the tree (FR-17); the block model vs renderer section 9 (FR-68).

**Unit A builds (sheet, "Da cabine" block):** the block sits on the cabine's first sheet, so the ops are `sheet/{firstBlockId}/cabine/temperature` — it is a field group on a sheet and AD-3's examples put sheet fields under `sheet/{blockId}`. "First sheet" is the first block of the cabine in tree order at the time of writing. "Copiar da cabine anterior" reads the previous sheet that has these values.

**Unit B builds (tree + renderer):** AD-5 says Cabine owns them, AD-6 gives the location row `{id, relatorio_id, parent_id, name, kind, order_key}` — no such columns — so Unit B adds `location.meta jsonb` and reads `location/{id}/meta/*`. The renderer prints them "once per cabine, on its first sheet" — the first sheet in *print* order, which under "Por local e tipo" is the first seccionadora, not the cabos de entrada the engineer typed them on. For the transformer group, `groupForPrint` must print "Cabos de alimentação TRn + Transformador TRn" as pairs; it matches on the `role` string ("alimentação TR1") against the transformer's TAG suffix.

**Why both comply.** AD-3's grammar is by example; AD-5 names the owner but AD-6's schema has no home for the owned data; AD-16 says capture order is not print order without saying which one "first sheet" refers to; the block model (EXPERIENCE) gives cables a `role` but the spine's schema gives Block no role and no pairing link.

**What breaks.** Two paths for one datum: the tree row shows `location.meta` (empty) while the sheet shows `sheet/…/cabine/*` (filled); the renderer, which reads from the location, prints blanks in "Características da SE" on every cabine. Reordering the tree moves the "first sheet" and the data silently changes sheets. The transformer pairing is name-matching over free text, which fails on "TR-1" vs "TR1" and prints the cable in the wrong group with no error, in the section the design partner asked for by name.

**Proposed: AD-6 tightened — Location carries the cabine data; Block carries role and pairing; "first" is computed, never stored.**

- **Binds:** `packages/domain/schemas/location` and `block`, op families `location/{id}/se/*`, `location/{id}/env/*`, `block/{id}/{role|feeds_block_id}`, the "Da cabine" block, the tree row, `groupForPrint`; FR-10, FR-17, FR-24, FR-68.
- **Prevents:** cabine data stored on a sheet; two definitions of "first sheet"; section-9 pairing by string matching.
- **Rule:** `location` gains `se: {type, primary_kv, secondary_kv, installed_kva}`, `env: {altitude_m, temperature_c, humidity_pct}` and `agrupar_por_tipo`, valid only where `kind = cabine` (zod refinement), written only through `location/{cabineId}/se/*` and `location/{cabineId}/env/*`; the family `sheet/*/cabine/*` does not exist. The "Da cabine" block is a *view* rendered on whichever block is first in tree order under that cabine (`firstInTree(cabineId)`), and printed on whichever block `groupForPrint` emits first for that cabine — both computed at render time, neither stored. "Cabine anterior" is the previous root node in `order_key` order. `block` gains `role: 'entrada' | 'saida' | 'alimentacao' | null` and `feeds_block_id: uuid | null` (a cabos-de-saída block pointing at its transformador-de-força block, set when the block is created or from the tree); `groupForPrint` pairs by `feeds_block_id` only and prints an unpaired cable at the end of the transformer group with the integrity check (C2) naming it.

---

### H4 — Section 8 has no data contract: photo references and automatic untested entries are each buildable two ways

**Pair:** the points of attention surface (FR-49–53) vs renderer section 8 (FR-52, FR-69, FR-51).

**Unit A builds (Points surface):** a point is `{text, photo_ids[], equipment_id, action, priority, deadline, owner}`; the engineer writes "conforme Imagem 5" in the prose because that is what the source document says and the field is free text. Marking a sheet Não ensaiado creates a Point row automatically (`origin: auto`) so it shows in the points list and the count.

**Unit B builds (renderer):** appends "(Imagens 5, 7)" after the text from `photo_ids`, resolving numbers from the frozen numbering; derives the untested entries from blocks in `not_tested` state at render time, after the manual points, because FR-51 says "automatically" and EXPERIENCE says they appear in the table "only when the engineer turned it into a point".

**Why both comply.** The spine has `POINT_OF_ATTENTION }o--o{ PHOTO : references` and nothing on how a reference sits in text; EXPERIENCE's "photo token" rule (free text cannot embed a literal number) is not lifted into any AD. FR-51 says "appears automatically" without saying stored or derived; AD-3 binds points as mutable entities, AD-20 tombstones them.

**What breaks.** "conforme Imagem 5" printed literally next to a resolved "(Imagens 6, 7)" — the stale-number defect the product was built to remove, in the section with the legal name. The untested disconnector prints twice in section 8 (once as Unit A's stored row, once as Unit B's derived one) and its stored row survives after the engineer un-marks the sheet.

**Proposed: AD-27 (new) — Section 8 contract: inline photo tokens and derived untested entries.**

- **Binds:** `packages/domain/schemas/point`, `packages/domain/templates/section8`, Points surface, the NC-row "Criar ponto" action, the Não ensaiado action, renderer section 8, pre-issue; FR-48, FR-49, FR-51, FR-52.
- **Prevents:** a literal photo number in prose; a photo reference held in two places; untested equipment stored as a point and also derived.
- **Rule:** `point.text` is plain text whose only markup is the token `[[foto:<photo_id>]]`; `point.photo_ids` does not exist — references are derived by kernel `extractPhotoRefs(text)`; the composer inserts tokens from the gallery picker and renders them as chips; the pre-issue list flags a token whose photo is tombstoned or unlinked. At render, `resolveSection8(snapshot, numbering)` replaces each token with "Imagem NN" and fills the table's `Imagens` column with the same numbers in order of first appearance. Untested entries are *derived* by `derivedPoints(snapshot)` from blocks in `not_tested` state, printed after the manual points in tree order with the reason text, and never stored. A point created from an untested sheet carries `equipment_id` and `origin: 'not_tested'`, which suppresses the derived entry for that equipment; the table lists manual points then derived ones, numbered continuously.

---

## Medium

### M1 — Suggestion status is not an op, the reading job bypasses the log, and "pending" is inferred two ways

**Pair:** the reading job (AD-14) vs the Suggestion field (AD-12); the sync status counts (FR-60) vs the pre-issue list (FR-73).

**Unit A builds (reading job):** inserts Suggestion rows directly into Postgres (AD-14: "the job writes Suggestions"); the relatório pull has a second query for them. Server-side "suggestions awaiting confirmation" (for FR-73's row and the future FR-60 count) = suggestions with no op on `target_path` newer than `created_at`.

**Unit B builds (Suggestion field):** "Confirmar" emits one op on `target_path` (AD-12: "a normal op") and sets `status = confirmed` on the local row only, since AD-12 says "marks" but not "emits"; typing sets `status = discarded` locally. Neither status ever reaches the server.

**Why both comply.** AD-12 describes the confirm as "a normal op on target_path" and the status change as "marks", and never says the status is itself an op. AD-14 says the job writes rows; the conventions say "all mutation through ops" but the job is not a client.

**What breaks.** A value the engineer *typed* after discarding a suggestion is indistinguishable, on the server, from a confirmed suggestion — the value op looks the same — so the server counts it as confirmed and the crop stays attached to a number the engineer chose against it; provenance, the only reason Suggestions are entities, is wrong in the document's audit trail. A second device (later) never learns a suggestion was discarded and shows it pending. Two definitions of "pending" give the pre-issue list and the sync badge different counts.

**Proposed: AD-12 tightened — the Suggestion lifecycle is ops, including the job's writes.**

- **Binds:** reading job, Suggestion field, `packages/domain/ops`, both sync layers, pre-issue, sync status; FR-41, FR-42, FR-60, FR-73.
- **Prevents:** a job-written row outside the log; a confirm indistinguishable from a typed value; pending inferred from the target.
- **Rule:** the reading job emits ops (`suggestion/{id}` create) with `actor_id = 'system:reading'`, `device_id = 'server'`, so the pull is one stream; "Confirmar" is two ops in one `batch_id` — `suggestion/{id}/status = confirmed` and `{target_path} = value` with `meta.source_suggestion_id`; typing emits the value op plus `suggestion/{id}/status = discarded` in the same batch; "Confirmar todos" is one batch. Pending is the stored `status`, never inferred; a confirmed value's provenance is the suggestion row found by `meta.source_suggestion_id`, which the renderer and the "crop shrinks to a glyph" affordance use. A suggestion whose `target_path` already holds a non-empty value at creation is created with `status = pending` and `mode = 'replace'` so FR-41's "differing suggestion beside the value" is data, not a UI guess.

---

### M2 — Instrument headers by id print whatever the registry says at generation, not at the test

**Pair:** registries (FR-3) vs sheet capture (FR-27) and the renderer.

**Unit A builds (sheet):** the instrument picker writes `sheet/{b}/test/{t}/instrument = instrument_id` (AD-19: by id); the header shows values resolved live from the registry.

**Unit B builds (generate job):** the snapshot includes "the registries it references" (AD-15) — as they are at generation time. The registry admin updated instrument "2E" with its new certificate on the Friday after the job; Rev. 1 prints the new certificate number and calibration date against readings taken under the old one, and section 11 attaches the new certificate. The pre-issue "expiring calibration" check compares to today.

**Why both comply.** AD-19 says by id "their identity prints and audits"; AD-15 freezes at generation; nothing says which point in time an instrument's calibration data is bound to.

**What breaks.** A signed technical document attests readings against a certificate that did not exist when they were taken; Rev. 2 generated later prints a different certificate for the same readings with no edit in between, which the draft-equals-issued discipline cannot catch because both are "correct" for their snapshot.

**Proposed: AD-19 tightened — the instrument header is captured by value at selection; the id serves section 11 and audit.**

- **Binds:** instrument picker, `sheet/{b}/test/{t}/instrument` value schema, renderer sections 9 and 11, pre-issue calibration check; FR-3, FR-27, FR-70, FR-73.
- **Prevents:** a calibration record changing under a signed reading; a check against the wrong date.
- **Rule:** selecting an instrument writes one op whose value is `{instrument_id, code, manufacturer, model, serial, cert_number, calibrated_at, valid_until, test_voltage}` copied at that moment; the sheet and the renderer print the copied values; section 11 resolves the certificate *file* by `instrument_id` from the snapshot's registry but prints the copied `cert_number` beneath it and flags a mismatch in the integrity check. The pre-issue calibration check compares `valid_until` with the relatório's service period end (setup), not with the generation date; "expiring" is `valid_until` within 30 days after that end.

---

## Cross-cutting note

Seven of the ten holes share one root: the spine names *where* a thing lives (kernel, relatório, location) without fixing the *shape* it travels in (op path, snapshot, BlockConfig, file variant). C1, H1 and H2 each add one kernel zod type — `OpPath`, `RelatorioSnapshot`, `BlockConfig` — and most of the rest follow from those three plus the read route in C4. Recommended order of adoption: C1 (grammar + reducer) → H1 (snapshot) → C2 (sync order) → C4 (files) → the rest, because each later rule is phrased in terms of the earlier types.
