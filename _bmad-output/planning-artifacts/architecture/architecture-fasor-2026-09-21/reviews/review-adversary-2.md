---
name: review-adversary-2
target: ../ARCHITECTURE-SPINE.md (26 ADs, rewritten after review-adversary.md)
lens: adversarial, second pass (pairs of one-level-down units that obey every AD to the letter and still build incompatibly)
sources-read: ARCHITECTURE-SPINE.md (full); .memlog.md (full, for the user's recorded decisions); reviews/review-adversary.md (full); prd.md FR-29..35, FR-41/42, FR-51/52, FR-58..60, FR-73/74; addendum.md §9; EXPERIENCE.md Block Model, Smart Input, Offline & Sync, Handed to architecture, Flow 3
date: '2026-09-21'
---

# Adversarial review, pass 2 — fasor architecture spine

**Verdict.** All ten holes of the first pass are closed; the rewrite fixed them by naming shapes (`OpPath`, `RelatorioSnapshot`, `BlockConfig`, `file`) and that is the right fix. The new material has one structural crack and seven seams. The crack: AD-24 says a pull is "ops by `seq` applied through `applyOp`", but six pieces of state the device must show are written by the server outside the op log (`file.uploaded_at` and variants, `photo.reading_status`, `generation_job`, `revision`, `equipment.last_nameplate`, `last_push_at`) and none has an op family, a cursor or a place in the byte-equal replay test — so the pull has two channels and only one of them is specified. Two of the seams are in the same family: the `file` row has no create op at all (a certificate upload can never pass `409 file_row_missing`), and `meta.source_suggestion_id` lives on the op, not in the materialized state the snapshot is built from. None of the eight needs a paradigm change; every one closes with a tightened AD written below. Nothing here re-opens a decision the memlog records as the user's (LWW by `seq`, TS monolith with `OcrProvider`, web-only, vocabulary, hidden section-9 scheme).

Method as in pass 1: Unit A and Unit B are epics or surfaces one level below the spine; "both comply" cites the ADs each reading satisfies; "what breaks" is observable; each proposed AD is written to slot in as-is.

---

## Part 1 — Does the rewrite close the first-pass holes?

| Hole | Closed by | Verdict | Residual (pointer) |
| --- | --- | --- | --- |
| C1 op grammar / `apply` home | AD-3: `OpPath` discriminated union, exhaustive family list, `parsePath`/`formatPath`, `applyOp` as the only materializer, no wildcards, `batch_id`, replay test | **Closed** | Value schema per family still unstated for `nameplate/{fieldKey}`, `not_tested`, `conclusion/text` (N6, N8) |
| C2 sync order / 4xx forever | AD-24: push → upload → pull, per-op atomicity, reject only for shape or tenant, `dead` status with "Reenviar", retry table, `409 file_row_missing`, no unique index on TAG | **Closed** | "Rebased" is one word; coalescing across a batch and `dead` ops in the generate barrier are unspecified (N3) |
| C3 Equipment in no cursor / copy needs network | AD-25: Equipment rides the relatório cursor, fan-out by project, `last_nameplate` projection read from Dexie | **Closed** | Envelope says `scope: relatorio` for a project-owned row; fan-out mechanics collide with dedup-by-id (N4); `last_nameplate` has no transport (N1) |
| C4 photo read route / thumbnail owner / original evicted | AD-7: `file` entity with kinds, three variants, `GET /api/files/{id}/{variant}`, `acked` not deleted, crop from local original | **Closed** | Who creates the `file` row, and is `photo.id` the `file.id` (N2); which variant OCR and the LLM receive (N7) |
| H1 pre-issue vs generate state / TOC / PDF deferral | AD-15: kernel `RelatorioSnapshot`, `409 not_caught_up` barrier, LibreOffice in the slice, revision row with `snapshot_last_op_id` | **Closed** | "exists op with `seq > snapshot_last_op_id`" compares an integer with a uuid, and the device has no `seq` for its own ops; `generation_job` and `revision` rows have no transport (N1) |
| H2 definition vs config / seed pinning | AD-21: `BlockConfig` only thing copied, append-only seed, `getDefinition(seed_version, …)`, `seed_version` per block | **Closed** | Values in a sub-block later disabled per sheet; progress/pre-issue/badge disagree on them (N8) |
| H3 cabine data / first sheet / cable pairing | AD-6: `se`/`env`/`agrupar_por_tipo` on the cabine node, `firstInTree` computed, `feeds_block_id` | **Closed** | none |
| H4 section-8 tokens / derived untested | AD-26: `[[foto:id]]` tokens, `extractPhotoRefs`, `derivedPoints`, `origin: not_tested` | **Closed** | `block/{id}/not_tested` value shape and reason list (N8, Source deltas) |
| M1 suggestion lifecycle as ops | AD-12: job emits `suggestion/{id}` create as `system:reading`, confirm/discard batches, `mode: replace`, pending is stored | **Closed** | `meta.source_suggestion_id` is on the op, not in state; equal-value auto-confirm has no emitter (N5) |
| M2 instrument header by value | AD-19: value copied at selection, cert file by `instrument_id`, `calibrationCheck` against the service period end | **Closed** | none |

---

## Part 2 — New holes

### N1 (critical) — The pull has two channels and only one has a cursor, an op family, or a place in the replay test

**Pair:** the sync server (`apps/api/src/sync`) vs the Dexie layer and every surface that shows server-produced state: the Suggestion field ("Foto guardada — leitura quando houver sinal" needs `reading_status`), the gallery (server `thumb` replaces the device's on pull), the Export dialog ("Gerando…", the Revisões list, "edited since Rev. N"), the sheet ("Copiar da última visita" reads `last_nameplate`), the pre-issue list ("Último envio de Eduardo").

**Unit A builds (server pull):** AD-24 says "a pull returns ops by `seq`". The six server-written things are columns, not ops, because no op family exists for them (AD-3's list has `photo/{id}/{caption|block_id|item_key|removed_at}`, nothing for `reading_status`; nothing at all for `file`, `generation_job`, `revision`, `equipment/{id}/last_nameplate`). So the response is `{ops, files, jobs, revisions, equipment, last_push_at, seq}` and `since` applies to `ops` only. The other arrays are either sent whole every 60 s (500 file rows per relatório per minute, on a timer, on a tablet) or filtered by `updated_at > last_sync_at` — a wall-clock cursor beside the `seq` cursor, with the clock-skew failure the spine spent AD-3 avoiding.

**Unit B builds (Dexie layer):** AD-3 says `applyOp` is the only materializer and AD-1 says every write to the store goes through it. There is no code path that writes `reading_status` into a photo row or `uploaded_at` into a file row from a non-op payload; Unit B either adds one (a second materializer, forbidden) or invents server-emitted ops on paths outside the union (`parsePath` fails on the device). Either way the AD-3 replay test — "the same op log replayed through both layers yields byte-equal snapshots" — cannot include `file.variants`, `reading_status` or `last_nameplate`, and `RelatorioSnapshot` explicitly includes "files with variants". The server's `toSnapshot()` has variants; the device's has none; the byte-equal assertion in AD-15 is false by construction, so the test is written to exclude exactly the fields where the two sides can diverge.

**Why both comply.** AD-14 says `reading_status` is "set by the server and pulled like any field" without saying through what; AD-7 says "the relatório pull carries file rows"; AD-15 says the `generation_job` row "is pulled with the relatório"; AD-25 says `last_nameplate` is "server-maintained"; AD-24 says the pull is ops by `seq`. Each sentence is true in isolation and together they describe two transports.

**What breaks.** A photo's reading finishes; nothing on the device changes until the file array happens to be re-sent; "3 leituras prontas" fires late or never (FR-42). The Export dialog cannot show "Gerando…" without polling a route the contract does not have. The Revisões list (FR-74) and "edited since Rev. N" have no data on the device. The AD-15 predicate `seq > snapshot_last_op_id` is unevaluable on the device (it holds op ids, not `seq`) and ill-typed on the server. And the one test that guarantees the kernel promise silently excludes server state.

**Proposed: AD-24 tightened — one stream; server state is written by system ops in server-only families.**

- **Binds:** `packages/domain/ops/path.ts`, `apps/api/src/sync`, files route, reading job, generate job, `apps/web/src/db`, `RelatorioSnapshot`, the replay test.
- **Prevents:** a second materializer; a wall-clock cursor beside `seq`; a replay test that excludes the fields that can diverge.
- **Rule:** every piece of server-produced state is an op in the same log, emitted with `actor_id = system:{files|reading|generate|sync}` and `device_id = server`, and pulled by `seq` like any other. New families, marked *server-only* in the union: `file/{id}` (create; also client-emitted, see N2), `file/{id}/{uploaded_at|variants}`, `photo/{id}/reading_status`, `equipment/{id}/last_nameplate`, `generation_job/{id}` (create), `generation_job/{id}/{status|error|result_file_id}`, `revision/{id}` (create, value = the revision row including `snapshot_seq`). A client push containing a server-only family is rejected `403 op_server_only`. The pull response is `{ops, seq, last_push_at: [{user_id, device_id, at}]}` and nothing else; `last_push_at` and the company-pull per-relatório summary are response metadata written to `sync_state`, never to an entity. `RelatorioSnapshot` is therefore a pure function of the op log and the replay test asserts byte equality with no exclusions. The revision row stores `snapshot_seq` (integer) and the push response carries `seq` per applied op so the device can evaluate "edited since Rev. N" as `exists local op with seq > snapshot_seq or pending`. The `Emitido —any op→ Em revisão` transition (AD-22) is emitted by the device that emits the triggering op, in the same batch, from `statusTable`; "any op on sheet/tree/setup" means any client-emitted family except `relatorio/status`, `suggestion/*`, `user/*`, `registry/*`, `template/*`.

---

### N2 (critical) — Nobody creates the `file` row: certificates can never pass `409 file_row_missing`, and `photo` vs `file` identity is unstated

**Pair:** the Registries surface (certificate upload, company scope) and the photo capture path (relatório scope) vs the files route and the reading job.

**Unit A builds (files route):** `PUT /api/files/{id}` for an id with no `file` row returns `409 file_row_missing` (AD-24: "file arrived before its create op"). For a certificate there is no create op: AD-3's families have `registry/{kind}/{id}/{field}` — a field on the instrument (`certificate_file_id = uuid`), not a `file` row with `sha256, mime, size`. So every certificate `PUT` is 409 forever, retried forever (it is the one retryable 4xx), and section 11 prints without certificates. Unit A's fix: create the `file` row on `PUT` from the multipart metadata — a server-side row born outside `applyOp` (violates AD-3) that the device never receives, so the device's `toSnapshot()` lacks the file and the pre-issue check "certificate missing" fires on the device and not on the server (the AD-2 failure).

**Unit B builds (photo capture):** AD-7 says "the Blob is written to IndexedDB in the same transaction as the row" — which row? There is a `photo` row (AD-14, AD-17: `captured_at`, `coords`, `reading_kind`, `block_id`) and a `file` row (AD-7: `sha256`, `mime`, `size`, `kind`). Unit B reads the object key `…/relatorio/{rid}/photo/{id}` and `suggestion.source.photo_id` and decides `photo.id === file.id`: one uuid, two rows, the `file` row created by `applyOp` as a side effect of `photo/{id}` create. Unit C (gallery + brand upload) decides `photo.file_id` because a logo has no `photo` row. Neither schema in the spine lists `file_id` on `photo`, nor forbids it.

**Why both comply.** AD-7 defines the entity and the route; AD-24 defines the 409; AD-3 lists no `file` family; AD-4 says the server never mints an id for a client-created row; nothing says which op creates a `file` row or how a photo relates to its file.

**What breaks.** Certificates (FR-70) and brand files (FR-1) never upload, or upload into rows the device cannot see. The `409 file_row_missing` path — the only mechanism that guarantees "the row that gives the file meaning" precedes the bytes — is undefined for four of the seven file kinds. Two units pick opposite identity rules for `photo` and `file`, and `GET /api/files/{id}/thumb` works for one of them.

**Proposed: AD-7 tightened — `file/{id}` is an op family; `photo.file_id` references it; server-made files are system ops.**

- **Binds:** `packages/domain/ops/path.ts`, `packages/domain/schemas/file`, `apps/web/src/files`, files route, generate job, Registries and brand surfaces, `RelatorioSnapshot`.
- **Prevents:** a file row born outside the log; two identity rules for photo and file; a 409 that can never clear.
- **Rule:** `file/{id}` (create) is a client-emitted family whose value is the `file` row without `uploaded_at`/`variants`; `scope: company` for `certificate|logo|cover_background|watermark|cover_photo`, `scope: relatorio` for `photo`. The device emits it in the same batch as the row that links it — `photo/{id}` create carries `file_id`; `registry/instrument/{id}/certificate_file_id` and `registry/empresa/{id}/{logo|…}_file_id` carry the id — and the uploader will not `PUT` a file whose create op is still pending. `photo` and `file` are two rows with two ids; `photo.file_id` is required; `suggestion.source.photo_id` stays a photo id and the crop is read through `photo.file_id`. `PUT /api/files/{id}` requires an applied `file/{id}` create; on receipt the server emits `file/{id}/uploaded_at` and `file/{id}/variants = {thumb, print}` as `system:files` ops (N1). Files the server makes (`preview`, revision `docx`/`pdf`, rasterized certificate pages if stored) are created by `system:generate` emitting `file/{id}` with a server-minted id — the one exception to AD-4, stated: the server mints ids only for rows the server creates. "Replaced per relatório" for previews means `generation_job.result_file_id` moves to the new file; keys stay immutable and the old preview is orphaned until the deferred purge; `GET /api/relatorios/{id}/preview.pdf` serves the `result_file_id` of the latest `generation_job` with `kind = preview, status = done`.

---

### N3 (high) — "Rebased" is one word: coalescing crosses a confirm batch, `dead` ops leak into the barrier, and an old client cannot apply a pull from a new server

Three concrete single-device sequences, each inside the slice.

**(a) Coalescing destroys provenance.** AD-3: "The outbox coalesces consecutive `put` ops on one path from the same device before push." Device: the engineer taps "Confirmar" on the suggested `TENSÃO DE PLACA` → batch B1 = {`suggestion/S/status = confirmed`, `sheet/b/nameplate/tensao = "15"` with `meta.source_suggestion_id = S`}; two seconds later, still offline, he corrects it to `"15.5"` → op X on the same path, no meta. Consecutive puts, same path, same device → coalesced. Unit A keeps the last op (X, no meta): the server receives a confirmed suggestion S and a value op that never cites it; SM-C1 ("confirmed values later edited", AD-18) can never fire because on the server the confirm value op never existed; the batch B1 arrives with one member. Unit B keeps the first op's `meta` on the last op's value: the server holds `"15.5"` with provenance S = the crop of a `15` — the renderer's glyph and the deferred Conflict view show evidence for a value the engineer typed against it. Both comply with AD-3.

**(b) A `dead` op is local truth and server absence.** AD-24: a rejected op "moves to `outbox.status = dead` … keeps its local value". So the materialized Dexie state holds V on path P; the server never will. Pre-issue on the device (AD-2, over the device snapshot) says the sheet is complete. Generate: the device sends `last_op_id` — Unit A sends the newest *applied* local op id (the dead op, if it was the newest) → `409 not_caught_up` forever, the Export dialog spins on "Enviando…" with nothing to send; Unit B sends the newest *acked* op → the barrier passes and the document lacks V while the dialog said clean — the exact H1 failure, back through a different door.

**(c) Contract skew on pull.** AD-13: "A server older than the client's minimum contract answers `426 contract_outdated`; the client flushes the outbox, then reloads to the new shell." Read literally, the client flushes to the server that just refused it. The real deploy case is the opposite: server newer, tablet on yesterday's bundle; its pull returns ops in a family added today; `parsePath` fails on the device. Unit A advances the cursor past the unknown op (lost locally forever; state diverges); Unit B refuses to advance (sync stalls, and AD-8's "new shell activates on next launch only when the outbox is empty" cannot help because nothing tells the user to relaunch).

**Why all comply.** AD-3 mandates coalescing without a boundary; AD-24 says what `dead` keeps but not what it means to the barrier or the snapshot; AD-13's 426 sentence has the direction of skew inverted and no rule for unknown families in a pull.

**Proposed: AD-24 tightened — rebase, coalescing and skew, spelled out.**

- **Binds:** `apps/web/src/sync` (push, pull, rebase), `apps/web/src/db`, `POST /api/sync/ops`, `POST /api/relatorios/{id}/generate`, the AD-3 replay test.
- **Prevents:** provenance lost or forged by coalescing; a `dead` op counted as caught up or blocking forever; a pull silently dropping ops.
- **Rule:** *Coalescing* merges only ops with no `meta` and no `batch_id`, and never across an op that has either; the merged op keeps the last `op_id`, `value`, `client_ts` and the first `prev_op_id`. *Rebase* means: after a pull, for every path with a pending outbox op, the device re-applies the pending op on top of the pulled value (state-level; `prev_op_id` untouched — the deferred merge will rewrite it). *Dead* ops are excluded from the materialized state: `applyOp` is re-run over the log minus dead ops for the affected entity (the outbox keeps the dead op and its value for "Reenviar"); `preIssue` lists "N alterações rejeitadas — Reenviar" as a row; `generate` sends `last_op_id` = newest acked op and the dialog is blocked while any op is pending or dead. *Push* is accepted from any client whose `CONTRACT_VERSION` ≥ the server's minimum (families are append-only); only *pull* answers `426` to an outdated client; on `426` the client keeps pushing, stops pulling that relatório without advancing its cursor, and shows the "Atualizar" banner; a pull never advances the cursor past an op the device cannot parse. *Stale outbox* (the office desktop edited Friday, the tablet pushes Thursday's op Saturday): LWW by `seq` stands (user decision); the push response adds `superseded: [{op_id, over_op_id}]` when an applied op's `prev_op_id` is not the server's current op on that path, and Sync status lists it as information ("Período do serviço: sua edição de quinta substituiu a de sexta") — the data the deferred merge needs, with no policy change.

---

### N4 (high) — Equipment ops are `scope: relatorio` with someone else's `relatorio_id`, and "fan into the cursor" collides with dedup-by-id and with relatórios created later

**Pair:** the sync server (op storage and the relatório stream) vs the Dexie layer and `suggestTag`.

**Unit A builds (server):** one `ops` table keyed `(company_id, relatorio_id, seq)`; the relatório stream is `WHERE relatorio_id = $id AND seq > $since`. AD-25's "fans them into the cursor of every relatório of that project" is implemented at apply time: insert a copy of the equipment op per relatório of the project. AD-4 ("every op deduplicated by id") makes the second copy a no-op, so fan-out silently stops at one — or Unit A uses a junction `(op_id, relatorio_id)` written at apply time, which works for today's relatórios and not for the relatório Bruno creates in the same project next month: its stream starts at `since = 0` and returns only ops junctioned to it — none of the project's 94 Equipment rows. `suggestTag` then proposes `SEC-C05` for a TAG that exists; AD-24 makes the collision an `integrity` warning after the fact.

**Unit B builds (device):** AD-3's envelope says `scope: relatorio`, `relatorio_id?`; the Dexie layer routes an incoming op to the relatório named in `op.relatorio_id` before calling `applyOp`, because that is what the field is for. An equipment op created from relatório A arrives in B's stream carrying `relatorio_id = A`; A is Emitido and not on the device (AD-8) → "op for a relatório not on this device" → skipped. B's Equipment table stays partial; "Copiar da última visita" never appears (its source row never arrived).

**Why both comply.** AD-25 puts the project id in `meta` (a free-form bag, per AD-3) and keeps `scope: relatorio`; AD-3 defines scope as `company|relatorio` with no third value; AD-4 dedups by op id; nothing says whether the stream is a stored fan-out or a query, nor that `applyOp` must ignore `relatorio_id` for the equipment family.

**What breaks.** TAG uniqueness — the reason Equipment exists as an entity — is checked against a partial view on any relatório created after its project's equipment, or on any device that lacks the originating relatório; FR-34's copy is dead on the same devices.

**Proposed: AD-25 tightened — a third scope, a query-defined stream, one Equipment table.**

- **Binds:** `packages/domain/ops` (envelope), `apps/api/src/sync` (stream query), `apps/web/src/db` (routing), `equipment` schema, `suggestTag`, `integrity`.
- **Prevents:** fan-out by copy; routing by origin relatório; a later relatório missing its project's equipment.
- **Rule:** the envelope's `scope` is `company | project | relatorio`, with `project_id` required when `scope = project` and `relatorio_id` required when `scope = relatorio`; `equipment/*` (including the server-only `last_nameplate`) is `scope = project`; `meta.project_id` is removed. The op is stored once. The relatório stream is defined as a query, never a stored fan-out: ops with `relatorio_id = $id` ∪ ops with `scope = project and project_id = relatorio.project_id`, ordered by `seq`, `seq > since`; a relatório created later therefore receives the project's whole equipment history from `since = 0`. On the device, `applyOp` keys `equipment` by `id` in one company-wide table indexed by `project_id`; the Dexie layer routes by `scope`, never by `relatorio_id`; `sync_state.cursor_seq` per relatório is the highest `seq` seen in that stream. `suggestTag` and `integrity` read `equipment where project_id = relatorio.project_id and removed_at is null`. A company-scope op never references a relatório-scope row (checked by a kernel test over the schemas); relatório-scope rows reference company-scope rows by id (Client, Instrument, file) and the cycle order "pull company → pull each relatório" guarantees the referent is present.

---

### N5 (high) — Provenance is on the op, not in the state: the snapshot's "confirmed suggestions only" has nothing to join on, and the equal-value auto-confirm has no emitter

**Pair:** the Dexie `applyOp` caller vs the Postgres one; the Suggestion field ("crop shrinks to a glyph") vs `toSnapshot()`; the reading job vs the device on `mode: replace`.

**Unit A builds (Dexie):** a sheet value is `{block_id, path, value}`; `applyOp` writes `value` and discards the envelope. `meta.source_suggestion_id` is gone at apply time. The glyph (FR-41: "on confirmation the crop shrinks to a glyph and stays reachable until export") needs to know that *this* value came from suggestion S; Unit A looks it up by "a confirmed suggestion whose `target_path` is this path" — which is wrong the moment the value is edited (S stays `confirmed`, the value is now the engineer's).

**Unit B builds (Postgres):** keeps the ops table and joins `meta.source_suggestion_id` at snapshot time; its `RelatorioSnapshot` carries provenance per value, the device's does not; byte-equal fails, or the field is excluded from the schema and "confirmed suggestions only" in the snapshot is dead weight because nothing in the snapshot points at them.

**Unit C (auto-confirm):** AD-12: "when the values are equal it is confirmed automatically with its provenance attached." The reading job cannot do it: at job time the target may hold a value only in the tablet's outbox (typed offline before the reading ran — the FR-42 common case). The device can, on applying the `suggestion/{id}` create, but nothing says it emits the confirm batch, with which `actor_id`, or how "equal" is decided for `{raw, unit}` vs a typed `"15"`. Unit C leaves S pending; the badge shows "1 sugestão por confirmar" on a field whose value already matches; "Confirmar todos" flips it, but the pre-issue row nags until then.

**Why both comply.** AD-12 says the crop "is found through `meta.source_suggestion_id`" — an op field — and AD-15 puts "confirmed suggestions only" in a materialized snapshot; nothing says provenance is materialized. AD-12's auto-confirm names no actor.

**What breaks.** The glyph — the affordance that lets Monday's reviewer re-check Saturday's read — attaches to the wrong value or to none; SM-C1 cannot be computed on the device; the snapshot includes suggestions it cannot use; the FR-36 display-check semantics (typed value vs OCR: match attaches silently, mismatch "Conferir") have no home when they arrive, because the same comparison is undefined today for nameplates.

**Proposed: AD-12 tightened — provenance is a column written by `applyOp`; the device is the comparator.**

- **Binds:** `applyOp`, sheet value schema, `RelatorioSnapshot`, Suggestion field, reading job, sync engine (pull hook).
- **Prevents:** provenance living only in the log; two snapshots; an auto-confirm nobody emits.
- **Rule:** every sheet value cell is `{value, source_suggestion_id: uuid | null, op_id}`; `applyOp` sets `source_suggestion_id` from `meta.source_suggestion_id` and sets it to `null` on any later `put` without it. The glyph is "cell with `source_suggestion_id ≠ null`", and the crop is the suggestion row it names. `RelatorioSnapshot` carries the cells with their `source_suggestion_id` and includes exactly the suggestions referenced by a current cell — "confirmed suggestions only" is replaced by that definition, so a confirmed-then-replaced suggestion is out. SM-C1 is server-side instrumentation over the ops table, not a kernel function. *Comparison happens where both values are known — the device:* on applying a `suggestion/{id}` create whose target cell is non-empty, the device runs kernel `compareSuggestion(cell.value, suggestion.value, fieldDef)` (normalized: `parse` both, compare `raw` and `unit`); equal → it emits the confirm batch with `actor_id` = the current user and `meta.auto = true`; different → the suggestion stays pending with `mode = replace`. The reading job never sets `status` other than `pending`.

---

### N6 (high) — Nameplate values have no shape: typed, suggested, copied and `VAL CALCULADO` disagree, and `last_nameplate` cannot survive a seed version

**Pair:** the sheet epic vs the reading job vs the `last_nameplate` projection vs the kernel (`composeConclusion`, `derivedPoints`, `VAL CALCULADO`, FR-35 cross-check, the digit-coverage rule).

**Unit A builds (sheet):** AD-11 binds "measurement tables, criteria comparison, derived cells" — nameplate fields are not measurements, so `sheet/{b}/nameplate/{fieldKey}` values are strings: `"15"`, `"15 kV"`, `"Celtta"`, `"12/2019"`, whatever the engineer typed; the unit is in the label.

**Unit B builds (reading job):** the addendum says "each numeric field carries its unit", so the suggestion `value` for `TENSÃO DE PLACA` is the AD-11 shape `{raw: "15", unit: "kV", state: "measured"}`; the confirm op writes it verbatim (AD-12: `{target_path} = value`). One path, two value shapes depending on who wrote it; `format` prints `[object Object]` for one and the raw string for the other.

**Unit C builds (kernel):** `VAL CALCULADO` "is computed from the nameplate" (addendum §9.3) — the TP's `TENSÃO NOMINAL AT/BT` must be numbers; with Unit A's strings the kernel calls `parse` at read time on stored data, which AD-11 forbids ("parsing only at the input boundary"). FR-35's cross-check needs to know *which* field is the manufacturer and which the voltage class; FR-37's digit-coverage applies to "a numeric value" — Unit C applies it to `CORRENTE NOMINAL` and not to `Nº SÉRIE`, which is the field where a misread digit is invisible and costly.

**Unit D builds (`last_nameplate`):** `values` is copied from the revision snapshot as `Record<fieldKey, unknown>`; Rev. 1 was generated at seed v1 (TC: 12 fields); the seed is corrected per addendum §9's discrepancy (TC: 14, keys renamed); "Copiar da última visita" writes plain-value ops for keys the new block's definition does not have (`400`? no — the path family is valid, the `fieldKey` is free) → orphan values on the sheet, invisible, until the renderer prints by definition and drops them.

**Why all comply.** AD-3 gives the path and no value schema; AD-11 scopes its shape to measurements; AD-21 enumerates block types and sub-block keys but not field kinds; AD-25's `values` is untyped; AD-12 says "numeric value" without naming which fields are numeric.

**What breaks.** The nameplate — the one assist in the slice, the copied block that the interaction budget counts on — has three writers and no common type; the conclusion text ("Celtta, 15 kV, 630 A") and `VAL CALCULADO` read whichever shape they get; a serial number misread by one digit passes as `suggested`.

**Proposed: AD-11 extended — field kinds in the seed; one value shape per kind; coverage over every digit.**

- **Binds:** `packages/domain/seed` (field definitions), `sheet/{b}/nameplate/{fieldKey}` and `location/{c}/se/*` value schemas, reading job, `last_nameplate`, "Copiar da última visita", "Igual à ⟨TAG⟩?", FR-35, FR-37.
- **Prevents:** one path with two shapes; parse at read time; coverage skipping the field that matters most; a copy across seed versions writing orphan keys.
- **Rule:** every nameplate and SE field definition carries `kind ∈ {text, number, date, select, manufacturer, voltage_class}`, `unit?` (for `number`) and `options?` (for `select`). Value shape by kind: `number` → the AD-11 shape (unit fixed by the definition; `raw` decimal string); `date` → ISO `YYYY-MM-DD` or `YYYY-MM` (month precision allowed, printed by `format`); `text|manufacturer|voltage_class|select` → string. The zod schema for the path family validates the value against the definition resolved by `(seed_version, block_type, fieldKey)`, on both sides. The reading job produces the value already in that shape (it runs `parse` with the field kind); FR-35 dispatches on `manufacturer` and `voltage_class` kinds. *Digit coverage* (AD-12) applies to every field whose value contains a digit, in every kind: `digits(value) === digits(concat(cited tokens in reading order))`, where `digits()` strips everything but `0-9` — no more, no fewer, same order. `last_nameplate.values` is `{seed_version, block_type, fields: Record<fieldKey, value>}`; copy actions (`última visita`, `Igual à`) intersect keys with the target block's definition at the target's `seed_version` and skip the rest, reporting "N campos copiados"; `suggestNameplateCopy` (same type and manufacturer in this relatório) is a kernel function added to the AD-2 list.

---

### N7 (medium-high) — `OcrProvider` contract: which image, whose coordinate space, and what "tokens" the run log stores

**Pair:** `apps/api/jobs/reading` (the TS job, both providers) vs `services/ocr` (the sidecar, later) vs the Suggestion field (crop from the device's local original).

**Unit A builds (TS job, google-vision):** sends the `print` variant (≤ 2000 px, cheaper, already oriented) to Vision and the same bytes to Claude; Vision returns pixel boxes over `print`; the job normalizes by `print`'s width/height. Correct — because `print` and the original share the aspect ratio and orientation (AD-7 bakes EXIF at capture). Token ids are the array index. The run log's "tokens" is the LLM usage count (it sits beside USD); the OCR token list is not stored, so `suggestion.source.ocr_token_ids` point at nothing after the job ends and a `reread` renumbers them.

**Unit B builds (sidecar, when FR-36 arrives):** OpenCV deskews and crops glare before PaddleOCR; boxes come back in the *deskewed* frame; the contract in `packages/domain/contract/ocr` says `{tokens: [{id, text, bbox}]}` and nothing about the frame; the job normalizes over the input's width/height; every display crop is rotated off its digits by the deskew angle — on the assist whose whole value is a legible crop. Unit B also splits "147" and "GΩ" into two tokens or one, at its discretion; the digit-coverage rule (N6) depends on which.

**Unit C builds (Suggestion field):** renders `bbox` over the device's local original (2560 px) — fine if `bbox` is normalized over an image with the same aspect; wrong if the sidecar ever returns boxes over a cropped region.

**Why both comply.** AD-14 gives the signature and says "the job converts boxes to normalized `bbox`"; AD-12 says "normalized over the oriented original"; nothing says which variant is sent, that providers must return boxes in input space, that the OCR result is stored, or what the run log's "tokens" are.

**Proposed: AD-14 tightened — the OCR contract in four sentences.**

- **Binds:** `packages/domain/contract/ocr`, both `OcrProvider` implementations, the LLM call, `reading_run` log row, `suggestion.source`.
- **Prevents:** boxes in a preprocessed frame; unstored token lists; two meanings of "tokens"; the LLM and OCR seeing different pixels.
- **Rule:** the job sends the `print` variant to the OCR provider and the same bytes to the LLM; `bbox` is normalized over that image, which by AD-7 has the aspect and orientation of the original, so the device's crop over its local original is exact. `OcrProvider.read(image) → {image: {width, height}, tokens: [{id, text, bbox}]}` where `bbox` is in the pixel space of the bytes it received; any preprocessing (deskew, glare removal, crop) is internal to the provider, which maps boxes back before returning; a provider that cannot map back returns `preprocessing_applied: false` and skips the step. `id` is `t{index}` within one result; the full OCR result is stored on the `reading_run` row (`ocr_result` JSON, normalized boxes) so `ocr_token_ids` resolve after the job and a `reread` creates a new run; the run row's `llm_usage: {input_tokens, output_tokens, usd}` is a separate column and the word "tokens" in AD-14's log sentence means these. Token granularity: one token per whitespace-separated word as the provider segments it; the digit-coverage rule (N6) concatenates cited tokens and compares digit strings, so segmentation does not matter.

---

### N8 (medium) — Sheet state has no precedence, disabled sub-blocks keep their values, attribution fields are not in the family list, and `conclusion/text` is stored two ways

**Pair:** the sheet epic vs the kernel (`sheetState`, `progress`, `preIssue`, `composeConclusion`) vs the sync status counts vs the renderer.

**Unit A builds (sheet):** "Concluir ficha" emits `block/{b}/concluded_by`; "Marcar não ensaiado" emits `block/{b}/not_tested = {reason, text?}`; a sheet can have both (concluded Saturday, marked untested Sunday on client request). The sheet header prints "filled by / when" from `last_modified_by`, which Unit A emits as `block/{b}/last_modified_by` on every field commit — a path not in AD-3's union → `400 op_path_unknown` → every sheet has a dead op (N3b). The Block palette opened inside a sheet toggles "Resistência de contato" off after three cells and a pending display suggestion exist on it; `block/{b}/config` is put. FR-30's text "recomposes silently while unconfirmed": Unit A emits `conclusion/text` with `text_status = unconfirmed` at every recomposition — one op per field change per sheet, and each one is "any op on sheet" for AD-22's Emitido → Em revisão.

**Unit B builds (kernel + counts):** `sheetState` returns Concluída because `concluded_by` is set (Não ensaiada tested second, or first — unspecified); `progress` counts only enabled sub-blocks; `preIssue` ignores the disabled table's pending suggestion; AD-24's badge count ("sugestões por confirmar = suggestions with `status = pending`") includes it — the badge says 1, the pre-issue list says 0, on the same device (the AD-2 failure, from the count the spine put outside the kernel). `composeConclusion` includes or excludes the disabled table's 330 MΩ at its discretion, so `text_basis` differs between the two implementations and "Sugerido: texto atualizado — Substituir" fires or not. Unit B reads AD-12's "only the confirmed value is stored" and stores `conclusion/text` only at confirm; an unconfirmed text is derived, `text_status = unconfirmed` is the absence of a row.

**Why both comply.** AD-18 lists four attribution fields; AD-3's block family carries only `concluded_by`; AD-2 lists `sheetState` with four names and no precedence; AD-21 says disabled sub-blocks are "omitted" by the renderer and nothing about their stored values elsewhere; AD-24 puts the badge counts in `apps/web/src/state` as raw table queries; AD-12's sentence about `conclusion/text` reads both ways.

**Proposed: AD-18 and AD-21 tightened — precedence, derived attribution, disabled values, one text rule.**

- **Binds:** `sheetState`, `progress`, `preIssue`, `composeConclusion`, `apps/web/src/state` counts, `block` family value schemas, renderer, AD-22 trigger set.
- **Prevents:** two attribution transports; a state with two answers; counts computed in two places; a text stored on every keystroke.
- **Rule:** `block/{b}/not_tested` value is `{reason: seed key, text?: string, at, by} | null`, reasons from the seed (`not_tested_reason` list, PRD FR-31's set); `block/{b}/concluded_by` value is `{actor_id, at} | null`. `sheetState` precedence: `not_tested ≠ null` → Não ensaiada; else `concluded_by ≠ null` → Concluída (kept through later edits; `integrity` flags "concluída com pendências" when `progress` is incomplete); else any non-empty enabled cell → Em preenchimento; else Vazia. `created_by` is the create op's `actor_id`; `first_edited_at` and `last_modified_by` are *derived* by the kernel from ops under `sheet/{b}/*`, `block/{b}/not_tested` and `photo/*` with `block_id = b` (`actor_id`, `client_ts`) and are never emitted. Values in a sub-block with `enabled = false` are retained in state, ignored by `progress`, `preIssue`, `composeConclusion` (so `text_basis` excludes them), `integrity` and the renderer, and their pending suggestions are excluded from every count; re-enabling brings them back. Every Sync status and Sumário count is a kernel function over the snapshot (`syncCounts(snapshot, outbox)` joins AD-2's list); `apps/web/src/state` renders, never counts. `conclusion/text` is stored only by "Confirmar" or "Editar" (`text_status ∈ {confirmed, edited}`, `text_basis` = hash of the inputs at that moment); the unconfirmed text is derived on read and is not an op; the renderer prints the text only when `text_status ≠ null` and `text_basis` equals the current hash or `text_status = edited`.

---

## Source deltas — what a builder can still read two ways

- **Não ensaiado reason list.** EXPERIENCE.md shows four chips including "Acesso"; PRD FR-31 says Acesso "is dropped" and then tags "these four reasons" as an assumption. The spine is silent. Say: the seed list is FR-31's attested set (Impossibilidade de desligamento, Solicitação do cliente, Outro) with the operational justification text per reason; EXPERIENCE's fourth chip is stale.
- **Nameplate field counts.** PRD FR-22 and the EXPERIENCE Block Model table carry the UX counts (para-raio 6, seccionadora 9, disjuntor 12, TC 12); addendum §9 decodes 5/10/13/14 and AD-21 says the decoded document wins. Add it to Source deltas explicitly so nobody seeds from FR-22.
- **"Copiar da última visita" scope.** PRD FR-34 says "a previous Laudo of the same site"; AD-25 resolves it as the project's Equipment row by `equipment_id`, which also covers a renamed TAG. State that FR-34's "TAG exists" means "Equipment row exists with `last_nameplate ≠ null`", not a TAG string match.
- **EXPERIENCE "Igual à ⟨TAG⟩?"** requires "same type *and model*" (Smart Input) while the Block Model says "same type". N6 names the kernel function; the spine should pick (N6 proposes type + manufacturer).
- **AD-13's 426 sentence** has the skew direction inverted (N3c); the Source deltas should not be needed once the AD is fixed, but a builder reading today's text will implement flush-to-a-refusing-server.

---

## Cross-cutting note

Pass 1 found that the spine named *where* things live without fixing the *shape* they travel in. Pass 2 finds the same pattern one level down: the rewrite fixed the shapes of what the *client* writes and left the *server's* writes (files, readings, jobs, revisions, projections, provenance) as prose — "server-maintained", "pulled like any field", "found through `meta`". N1, N2, N4 and N5 are one decision stated four ways: **everything in state is an op in one log with one cursor, including what the server produces, and `applyOp` materializes all of it — provenance included.** Adopt N1 first; N2, N4 and N5 then become families and columns in the same table, and the AD-3/AD-15 byte-equal test becomes literally true instead of true-by-exclusion. N3 is the sync engine's spec sheet and should be written before the engine; N6, N7 and N8 are value-schema work that belongs in the kernel's first week.
