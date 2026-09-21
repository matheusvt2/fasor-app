# Reconciliation: ARCHITECTURE-SPINE against the PRD

Reviewed 2026-09-21. Sources: `ARCHITECTURE-SPINE.md` (draft), `prd.md` (final, 2026-09-21), `addendum.md` §1 "Handed to architecture". Only what does not match is listed; what already lands is not restated. No stack changes are proposed.

**Verdict.** The spine covers the shape of the PRD well, but it contradicts the PRD in three places (section-9 scheme as a server flag, the Laudo/relatório vocabulary, manufacturer references by value), silently drops eight of the twenty-three items the addendum handed to architecture, and leaves a handful of testable FR consequences with no architectural home (draft recovery under an op log, device-computed suggestions, non-photo file uploads, offline crops).

## 1. Addendum §1: item-by-item disposition

| Handed item | Spine disposition |
| --- | --- |
| Offline vehicle and sync trigger | Decided (AD-8) |
| Local storage engine | Decided (AD-1: Dexie) |
| Autosave debounce interval | **Silently missing** (see M-1) |
| iPadOS Safari eviction as explicit risk | Decided (AD-8 five-day banner, flush-at-first-signal); the failure branch is not recorded (see M-2) |
| Storage-low threshold and detection | Deferred explicitly |
| Maximum offline age before upload | Decided (AD-8, 5 days `[ASSUMPTION]`) |
| How many active laudos one device holds | **Silently missing** (see M-3) |
| Photo compression, max resolution, originals retained | Retention decided (AD-7); compression deferred explicitly |
| Conflict detection mechanism, where unresolved versions live | **Silently missing** (see M-4) |
| Upload concurrency and resumable upload | Resumable decided (AD-7); concurrency silently missing (see M-5) |
| Registry dedupe across devices | Decided (AD-19), but contradicts FR-4's wording (see C-3) |
| Offline download of other devices' photos | Decided (AD-8, thumbnails `[ASSUMPTION]`) |
| LLM vision and OCR provider; OCR grounding check | Decided (AD-14, AD-12) |
| Cost per reading | Measured (per-reading USD log) but no number (see M-6) |
| Dictation engine | Deferred explicitly |
| Geolocation to altitude | Deferred explicitly |
| Photo-stamp coordinate source and precision | **Silently missing** (see M-7) |
| Server vs client generation; TOC and page engine; PDF renderer | Decided (AD-15) |
| Watermark and logo rendering in DOCX and PDF | **Silently missing** for the company's own watermark, logo and cover background; only the RASCUNHO preview watermark is mentioned (see M-8) |
| Template engine for conclusion text and parecer summary | Decided (AD-2 kernel templates) |
| Export time tolerance | Deferred explicitly |
| Template snapshot vs versioned reference | Decided (AD-5 snapshot at creation) |
| UI system with tokens unchanged | Decided (AD-23) |
| Bundle Inter or accept fallback | **Silently missing** (see M-9) |
| Session lifetime, offline re-auth, provisioning, seeding | Decided (AD-9) |
| Password reset | **Silently missing** (see M-10) |
| Retention and purge | Deferred explicitly |
| Timezone and locale | Decided (AD-17) |

## 2. Missing

Each entry: PRD reference, what is absent, what the spine should say.

**M-1. Autosave debounce interval (addendum §1; FR-32).** AD-1 says every user write becomes an op "before anything else happens", which read literally makes every keystroke an op. The debounce that the addendum handed over is not stated, and it is coupled to M-11 below. The spine should say: a text field commits one op on blur or after N ms of inactivity (name N, tag it `[ASSUMPTION]`); tri-state, select and numeric-cell commits are immediate.

**M-2. Q0 failure branch (PRD §13 Q0, §7.3 "Q0 does not go away"; addendum §1).** The PRD says that if photo-safe offline capture cannot be proven on iPadOS Safari "either the platform commitment or the zero-loss guarantee has to change". The spine schedules the manual check in the Testing row but records no consequence of a failed check. The spine should say which of the two moves when the check fails (for example: the slice ships desktop-and-Android only, FR-56 unchanged), so the first-two-days test has a decision attached.

**M-3. Active laudos per device (addendum §1; §9 Capacity).** AD-8 pulls every Rascunho and Em campo relatório of the company to every device with no cap. The spine should state that explicitly as the decision ("all open relatórios of the company, no cap, sized for N") or bound it, because the capacity NFR is sized for one job, not for every open job.

**M-4. Conflict detection mechanism and where unresolved versions live (addendum §1; FR-59; §7.3 wait 3).** AD-3 claims the multi-device merge is "a policy swap over the same ops", but the op shape `{op_id, company_id, entity, entity_id, path, value, actor_id, device_id, client_ts}` carries no base reference. Without a `base_op_id` (or per-path version) the deferred merge cannot tell a true contradiction (both devices wrote the cell from the same base) from a sequential correction (Bruno overwrote Eduardo's value after seeing it), which is exactly the single-cell conflict FR-59 defines. The ER diagram also has no home for an unresolved version. The spine should add the base reference to the op shape now, since ops written in the slice will be replayed by the later merge, and name where a conflict row lives (a `CONFLICT` entity or a `suggestion`-like row with two values), even if its UI waits.

**M-5. Upload concurrency (addendum §1; FR-56).** AD-7 fixes upload order but not how many uploads run at once. The spine should say (one at a time, or N in flight, tagged `[ASSUMPTION]`), because it interacts with the "one failed photo never blocks the queue" rule and with mobile-radio behavior.

**M-6. Cost per reading (addendum §1; PRD §11 Cost: "the unit economics need a number before the first real job").** The spine logs tokens and USD per reading but gives no estimate for the 94 plates, 1,100 display shots and 82 captions per job. The spine should carry an order-of-magnitude estimate per reading kind for the default model, tagged `[ASSUMPTION]`, or list it under Deferred with the date it is needed by.

**M-7. Photo coordinates: source and precision (addendum §1; FR-8, FR-44, FR-47, §11 Privacy).** The photo row in AD-7 and AD-17 carries `captured_at` and `tz_offset` but no coordinate fields; nothing says whether coordinates come from the Geolocation API at capture, from EXIF GPS on gallery-picked images, or both, nor at what precision they are stored and printed. FR-47 is in the slice and the stamp prints in section 7. The spine should add `{lat, lon, accuracy_m, source}` to the photo schema, say the source, and say the printed precision.

**M-8. Company watermark, logo and cover background in DOCX and PDF (addendum §1; FR-1, FR-63).** AD-15 only mentions the RASCUNHO preview watermark. FR-1 registers an optional company watermark, an optional cover background and a logo that must render in the header of every page in both files. The spine should say how each is placed (header image for the logo, page background or behind-text anchored image for the watermark and cover background) and that the preview watermark stacks with, and does not replace, the company one.

**M-9. Inter typeface offline (addendum §1; AD-8 cold-open offline).** Not addressed. If Inter is loaded from Google Fonts, a cold offline open falls back silently and DESIGN.md's sizes shift. The spine should say: bundled and precached by the service worker, or fallback stack accepted, and which.

**M-10. Password reset (addendum §1; FR-6).** AD-9 covers provisioning by seed CLI and no signup; reset is not mentioned. The spine should say whether reset is a CLI operation in the MVP or a better-auth flow that needs outbound e-mail (which would be the only e-mail dependency in the system).

**M-11. Draft recovery under an op log (FR-32 "Rascunho encontrado — Recuperar", FR-61 "recover unsaved screen state", FR-54 acceptance test "closing the app mid-sheet").** AD-1 binds FR-61 but the rule leaves nothing to recover: if every write is an op, there is no unsaved state. The spine should define what a draft is (the text inside the M-1 debounce window plus uncommitted surface state), where it lives (a per-user `draft` table in Dexie keyed by surface and entity), and that FR-61's offer is a read of that table on launch, never an automatic apply.

**M-12. Device-computed suggestions have no home (FR-29, FR-30, FR-50, FR-71, FR-73).** AD-12 binds only the camera assists and gives the Suggestion `created_by_job`. The PRD also treats as Suggestions: the conclusion pair (FR-29), the conclusion text with its "Editar stops recomposition / Substituir after confirmation" state (FR-30), the deadline written from a priority (FR-50), and the parecer verdict and summary (FR-71). FR-73 needs "conclusion text never confirmed" as a persisted fact. The spine should say whether these are Suggestion rows minted on the device (then `created_by_job` becomes `source_kind: job | kernel`) or derived on read with only the confirmed value and a `confirmed_at` stored, and which of them sync.

**M-13. Upload routes for non-photo files (FR-1 logo, cover background, watermark; FR-3 certificate file; FR-16 cover photo).** The contract in AD-13 has exactly one file route, `PUT /files/photos/{id}`. Certificates, logo, cover background and watermark have no route and no storage path, although the deployment diagram lists "certificates" in object storage and FR-70 prints them. The spine should add a generic `PUT /files/{kind}/{id}` (or per-kind routes) with the same idempotency and sha256 contract, and the storage key layout for company-level assets.

**M-14. Certificate rasterization (FR-70 "full-page image of the attached certificate file").** Calibration certificates arrive as PDFs. The renderer builds a DOCX with the `docx` library, which embeds images, not PDFs. The spine should say where the certificate is rasterized (in the generate job, via the LibreOffice already in the image or via `sharp` when the upload is an image), at what resolution, and that the accepted upload types are PDF, PNG and JPEG.

**M-15. Where para-raios and cabos print in a type-grouped cabine (FR-68, PRD Q18).** The kernel `groupForPrint` (AD-16) must place them somewhere; the PRD says the source has no example. The spine neither decides nor lists it under Deferred. Decide it (tagged `[ASSUMPTION]`) or add it to Deferred with the note that the seed template groups by type in exactly the two cabines that hold them.

**M-16. Seed reconciliation before writing (addendum §9 preamble; FR-11 note; §7.3 "the seed data is the hidden cost").** AD-21 types the seed but does not say that the source of truth is the decoded document (`.working/extract-raw-sources.md` §2) rather than the UX-spine counts, that the two checklist column orders are normalized to one, or that `EPÓXI`/`EPOXI` is normalized. It also tests only operator and source on a criterion; FR-5 also requires a `type` and a `source.edition` (nullable, with "aceitável na ficha" as the honest disclosure). The spine should name the seed's source of truth and extend the kernel seed test to the criterion type and edition fields.

## 3. Contradictions

**C-1. Section-9 ordering scheme: user option in the PRD, server flag in the spine (AD-16 vs FR-68, FR-72, §7.3).** FR-68: "grouped and ordered by a scheme chosen at export ... the alternative is field order. The choice is remembered per Laudo." FR-72: "A user can choose the section 9 ordering scheme before generating." §7.3 slice: "both ordering schemes". AD-16 says the base case "stays reachable through a server flag, not a UI option". This is a direct reversal of a PRD decision that is inside the approved slice. The spine should make the scheme a per-relatório field set from the Export dialog (`relatorio/export/scheme`, default `por_local_e_tipo`) and keep `groupForPrint(snapshot, scheme)` in the kernel. Note also that there are two distinct knobs the spine currently blurs: the per-cabine `agrupar_por_tipo` flag (FR-10, AD-5, correctly owned by the cabine) and the per-laudo export scheme (FR-72).

**C-2. Vocabulary: "Laudo" in the PRD, "relatório" in the spine (PRD §4 Glossary: "synonyms are a discipline violation").** The PRD's fixed term for the unit of delivery is **Laudo**; the spine names the entity, the op paths, the routes and the Dexie tables `relatorio` (`GET /sync/relatorios/{id}`, `relatorio/status`, `RELATORIO` in the ER diagram) and lists `relatorio` as a "domain word". The PRD uses "relatório" only as the generic Portuguese noun in prose. Since these identifiers become code, table names and API paths, the rename is cheap now and expensive after the first migration. The spine should use `laudo` throughout, or record explicitly why it departs from the glossary.

**C-3. Manufacturer and voltage class by value vs "every sheet still pointing at it" (AD-19 vs FR-4 note and addendum §1).** The handed requirement is that "Schneider" and "SCHNEIDER" converge to one entry "with every sheet still pointing at it". AD-19 stores the value on the sheet and deduplicates only the suggestion list, so after a merge the sheets still carry both spellings and the generated document prints both. AD-19 meets "one entry" and not "every sheet pointing at it". Either accept the divergence and say so (and then say whether the renderer normalizes case on print), or store a `manufacturer_id` alongside the display value and let the server's dedupe rewrite ids in a materialization step, which is the case AD-19 was avoiding. The spine must pick one and state the printed consequence.

**C-4. Slice sequencing: "PDF waits" (§7.3 wait 2) buys nothing under AD-15.** AD-15 produces the table of contents in two passes by reading heading page numbers from the PDF outline of a LibreOffice conversion. The DOCX-only slice therefore still ships LibreOffice and still runs the conversion to get FR-65's page numbers. This is not a wrong decision, but the spine should say it out loud: the slice includes the conversion as an internal step, and exposing the PDF is a route, not a renderer. Otherwise a builder may implement a DOCX-only TOC with Word field updates (which Word prompts for on open) to honor the cut.

## 4. Quiet requirements dropped

Constraints, tones and testable consequences in the PRD that need an architectural home and currently have none.

**Q-1. Palm rejection and accidental-touch tolerance (PRD §9 Field ergonomics: "belong to architecture").** AD-23 mentions "press handling for touch and stylus" from React Aria and nothing else. The PRD hands this to architecture by name. The spine should add one rule: `touch-action` and pointer-type handling policy (stylus-precision hit-testing on the measurement grid, no hover-dependent affordance, press-and-hold instead of swipe), and where it lives (a shared input layer in `apps/web`, not per component).

**Q-2. The three FR-54 acceptance tests are not in the Testing convention.** FR-54 names them: closing the app mid-sheet, losing the network mid-upload, filling the device's storage. The spine's Testing row lists kernel unit tests, a renderer snapshot, an outbox replay and Playwright e2e, but not these three, which are the tests that prove the product's precondition. Add them by name, with the storage-full one flagged as the one that needs a real device.

**Q-3. Crops must survive local purge of the original (FR-33, FR-36, FR-41 "stays reachable until export"; FR-59 shows the crop in the conflict row).** AD-7 deletes the local original once the server acknowledges the upload, and AD-8 serves the gallery from a 512 px thumbnail. The Suggestion carries a `bbox` against the original, so the crop beside a suggested value is unavailable offline after the upload. The spine should say either that the reading job emits a crop image per Suggestion (stored beside the photo and pulled with the relatório), or that the client keeps the original until every Suggestion sourced from it is resolved and the export is done.

**Q-4. Ops before files in the sync order (FR-35, FR-4 "creation works offline").** AD-7 orders photos among themselves; nothing orders ops against photo uploads. A manufacturer created inline while offline is an op; if the plate photo uploads first, the server's registry cross-check (FR-35, run in the reading job) flags a manufacturer that already exists on the device as Verificar. The spine should state that a sync cycle pushes the outbox before it starts uploads.

**Q-5. Reading target context travels with the photo (FR-36 "the next empty cells in reading order", FR-33 one Suggestion per nameplate field, FR-24 thermo-hygrometer).** AD-14 says the job writes Suggestions with `target_path`, but only the device knows which block, table, row and field list the shot was taken for, and `PUT /files/photos/{id}` carries only `sha256` and `reading_kind`. The spine should say that the photo row (or the upload) carries the target context (block id, table key, starting cell, and for plates the block type whose field list the model is asked to fill), assigned on the device at capture.

**Q-6. What the device pulls for project-level entities (FR-7 duplicate TAG refused inline offline; FR-34 "Copiar da última visita" reads the previous Laudo of the same site).** AD-8 pulls open relatórios, registries and thumbnails. Equipment is project-owned (AD-5) and the previous visit's nameplates live in an Emitido relatório that is not pulled. Both FR-7's offline duplicate check and FR-34's copy need data outside the pull set. The spine should say that the pull includes the project's Equipment rows and the last Emitido relatório's nameplate values for the same project, or that FR-34 is an online-only office affordance.

**Q-7. Photo link at sub-block granularity (FR-44 "attached from an NC checklist row keeps that link and prints its item reference beneath it"; FR-67).** The ER diagram links PHOTO to BLOCK optionally. The printed item reference needs the checklist item key. The spine should make the photo link a path (`sheet/{blockId}/checklist/{itemKey}`), consistent with AD-3's addressing, not a block id.

**Q-8. Per-user last send time (FR-60, FR-73 "each user's last send time").** Both surfaces list, per user, when that user last pushed. Nothing in the sync contract records or serves it. The spine should say the server stores `last_push_at` per `(user_id, device_id)` on `POST /sync/ops` and serves it in the relatório pull.

**Q-9. SM-8 and SM-C1 instrumentation from v1 (PRD §8: "instrument the product to measure it from v1").** Time per sheet in the field and "how often a confirmed value is later edited" are named as v1 measurements. AD-18's timestamps give `created_by`/`concluded_by` times, but `created` is the office instantiation, not the first field touch, so time per sheet is not derivable. The spine should add `first_edited_at` on the Equipment block (or state that the op log's first op per block is the source) and note that SM-C1 is derivable from the Suggestion table joined with later ops on the same path.

**Q-10. FR-1 live preview is not a second renderer (FR-1 "see a live preview of the cover, header and footer as they type" vs AD-15 "Prevents: a preview rendered by a second path").** The two are compatible only if the FR-1 preview is declared a CSS approximation of the page furniture, not a document render. The spine should say so in AD-15 to stop a builder either wiring the Registries page to the generate job or treating the CSS preview as the source of truth for header layout.

**Q-11. Codename hygiene (PRD §0: `fasor` "must never surface as the product name").** The spine names the Dexie database `fasor-{user_id}` and the repo `fasor/`. Both are internal, but the database name is visible in browser devtools and the product name is still `PRODUTO`. The spine should state where the user-visible product name comes from (a single config constant) and that no user-visible string, document header or file name carries the codename.

**Q-12. The NR-10 text-by-date slot is unnamed (§7.1 data-model-only, FR-66 note, Q10).** The spine's Deferred entry says "data-model slot only" without naming the slot. Name it: section boilerplate in the seed keyed by `(section, effective_from)`, with the renderer picking by the laudo's service date, and the MVP seeding only the current text.

**Q-13. Per-laudo photo capacity (FR-56 "above the nearest competitor's limit of 300").** No number in the spine. State the design target (for example 500 per relatório, tagged `[ASSUMPTION]`) so the Dexie photo store and the thumbnail budget are sized to it.
