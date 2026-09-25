# Epic 6 Context: Photos and points of attention

<!-- Generated from planning artifacts and a code-seam scan on 2026-09-25. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make photos and findings as cheap to capture on site as a reading. The engineer shoots bursts from the sheet, an NC row or the gallery with no caption composer, and every photo is saved on the device at once with a context caption, a date, time and coordinate stamp, a place in the chronological gallery and a provisional number. No photo is ever lost: it stays local until the server holds it, retries on its own tile, and low storage raises a warning before capture can fail. Photos from someone else's phone, or taken after the visit, come in by import with one "De qual equipamento?" tap. Findings are written from an NC row or the Points surface with photo tokens and recurring-finding chips, and every untested equipment lists itself in section 8. Epic 7 prints sections 7 and 8 from what this epic stores.

## Stories

- Story 6.1: Shoot photos in a burst from any surface, captioned from where I stand
- Story 6.2: No photo is ever lost
- Story 6.3: See every photo in one chronological gallery with its stamp and provisional number
- Story 6.4: Add photos after the visit or from someone else's phone
- Story 6.5: Change a caption from chips or free text
- Story 6.6: Record findings that print as section 8, with untested equipment listing itself

## Requirements & Constraints

- The slice covers photo capture, import, stamps, numbering and context captions, with no vision captions. Points of attention print as section 8 bullets with photo references plus the derived untested entries. Priority, deadline, owner and the action-plan table (P0 to P4) are data-model fields with no UI, dated post-MVP (NR-10 10.7.11 before 2027-06-01). The mock's priority controls are not built.
- Caption dictation is in MVP scope, but the slice ships no speech engine: the Dictation control stays absent (not disabled) until Epic 9. The photo-location switch (FR-8) is post-slice; `photo_location_enabled` defaults to true.
- Nothing captured is locked to the field. "Adicionar fotos" is a visible button on every sheet and in the gallery, with drag-and-drop on a computer. Only one device fills a relatório; a second person's photos enter by import.
- A caption or observation is never guessed by a model. Context captions are composed locally from data, and the composer never opens by itself.
- Coordinates print (4 decimals, omitted when absent). Photos with people still print in section 7. No LGPD consent gate exists in the MVP.
- Durability: a never-acked original is never evicted. Show the storage banner under 500 MB free; capture is still attempted. `PUT /api/files/{id}` is idempotent on `sha256`. Playwright covers "network dropped mid-upload".
- Seed additions (the recurring-finding chips for 6.6, and seeding the caption Atividade/Local lists if they change) follow AR-20. Add a new seed version beside `packages/domain/src/seed/v2.ts` and never edit v1 in place. Today `quick_notes` holds only one conclusion sentence, and no findings list exists.
- Open ledger items (`deferred-work.md`) that this epic lands or must decide: the photo-upload half of FR-54 scenario 2 (Story 6.2); `files_pending` is read by no surface, so pending and failed uploads are invisible; a permanent upload failure lives only in memory (the `permanentlyFailed` Set in `apps/web/src/sync/engine.ts`) and is re-queued on reload; concurrent PUTs can emit two `uploaded_at` ops. Also, `expectedFileIds` in `packages/domain/src/print/revisions.ts` blocks "Gerar" with `409 not_caught_up` while any photo row is un-uploaded. Decide before 6.2 merges whether it lists only locally pending files or names the waited-for files.

## Technical Decisions

- File entity (AD-7). `photoFileRowSchema` already exists in `packages/domain/src/schemas/entities.ts` (`captured_at, tz_offset, coords{lat,lng,accuracy_m,source}, local_seq, block_id, item_key, caption, reading_*`). Mutable client fields are `FILE_FIELDS` (`caption, block_id, item_key, removed_at`) in `packages/domain/src/ops/path.ts`; server fields `uploaded_at, variants` are `system:files` ops. `file/{id}` create uses `scope: relatorio` and goes in one batch with the Blob in the same Dexie transaction.
- On-device original: JPEG, long edge at most 2560 px, q0.85, EXIF orientation applied, EXIF time and GPS parsed on the device, HEIC converted on the device. The device makes its own thumb and swaps in the server's on pull. Sync prefetches `thumb` only; originals load on demand.
- Reuse the write path. `commitFilePick` in `apps/web/src/db/file-commit.ts` is the only builder of a file create op, but it is company-scoped for brand files and certificates, so widen it (or add a sibling in the same module) for relatório-scoped photos with owner-less batches. Blob helpers are in `apps/web/src/db/file-store.ts` (`putLocalBlob`, `markBlobAcked`, `pendingUploads`, `pendingUploadCount`, `ensureLocalBlob`, `previewBlob`). `UploadFileKind`, `checkFileCandidate` and `objectKey` are in `packages/domain/src/files/candidate.ts`; tile text is in `files/tile.ts`.
- Uploader (Story 2.2): `uploadPhase` and `uploadOne` in `apps/web/src/sync/engine.ts` (2 in flight), with failures classified by `classifyUploadFailure` in `sync/policy.ts`. `pendingUploads` scans unacked originals and does not order them. Story 6.2 adds the order (pending reading, then photos by `captured_at`, then others) and a persistent dead state.
- Server: `createFileRoutes` in `apps/api/src/http/files.ts` (idempotent PUT, `409 file_row_missing`, emits `uploaded_at`/`variants`), with variants from `renderVariants` in `apps/api/src/storage/variants.ts`. Note that `THUMB_MAX_PX = 480` and `PRINT_MAX_PX = 1600` there, while the spine and Story 6.2 say at most 512 and at most 2000. Reconcile in 6.2. Object key: `company/{cid}/relatorio/{rid}/photo/{id}`.
- Ordering and numbering (AD-17): sort key `(captured_at, device_id, local_seq)`; `local_seq` is a per-device counter (`apps/web/src/db/device-id.ts` holds the device id). `numberPhotos(snapshot)` is provisional until generation freezes it with the revision. Display uses America/Sao_Paulo; the wire is UTC.
- New kernel functions (none exist yet), all in `packages/domain`: `contextCaption(photo, snapshot, registryMeta)` with gender and number agreement from the seed `atividades`/`locais` word lists (`seed/v1.ts` near line 621) and registry words (`registry/word-row.ts`); `numberPhotos`; `extractPhotoRefs(text)` for `[[foto:<id>]]` tokens; `derivedPoints(snapshot)` (never stored; suppressed by a point with `origin: not_tested`); the section 7/8 counts and texts for the Sumário and `preIssue` (`relatorio/pre-issue.ts` reserves the photo and point families; `relatorio/sumario.ts` has `section_7: 'generated'`, `section_8: 'pending-epic'`). Photo counts and plurals already exist in `sync/counts.ts` and `device/storage.ts`, and the storage verdict in `checks/storage.ts` (`storageLow`, `STORAGE_LOW_FREE_BYTES`).
- Point entity: `pointRowSchema` (`text, equipment_id, origin, order_key, removed_at`) and the `point`/`point/field` op families exist. Story 6.6 must add `action` and the no-UI `priority?, deadline?, owner?`, then extend the schema and `POINT_FIELDS`. Reorder uses `ops/order-key.ts`.
- Removal is a tombstone (AD-20); "Restaurar" clears it, and counters and the renderer ignore it. A token pointing at a tombstoned photo is flagged by `preIssue`.
- Ownership: `apps/web` renders from IndexedDB and writes ops only. Status words, counts and captions come from the kernel, and pt-BR strings follow the three homes in AGENTS.md.

## UX & Interaction Patterns

- Mocks: `prototype/screens/70-fotos.html`, `71-legenda.html`, `72-pontos.html`, `key-photos.html`, `key-points-of-attention.html`. Grep class names; never read a mock whole. New `.frame-*` rules get their `app.css` translation in the same change.
- Camera capture button: 56 px, `aria-label` "Tirar foto", in the empty left slot of `apps/web/src/surfaces/ficha/sticky-action-bar.tsx` (`.has-camera`). It uses the `capture` attribute with no chooser and stays open until "Concluir fotos" with a count badge. The nameplate tile is single-shot. A denied camera permission shows the reason and the OS path, never a silent no-op.
- NC row: the "Adicionar foto" / "Criar ponto de atenção" slot is reserved in `apps/web/src/surfaces/ficha/checklist-section.tsx` (comment near line 31). Photo tile rows go under the row's buttons with the caption in `meta`, and focus returns to the row after saving a point.
- Upload pill: "Aguardando envio" (amber), and "Erro — Tentar novamente" (red outline, at least 48 px, the pill is the retry). The header counts "3 fotos aguardando envio". The global banner reads "Pouco espaço neste aparelho (⟨n⟩ MB). Sincronize para liberar."
- Gallery: 96 px tiles with a number badge, the "dd/mm hh:mm" stamp with a pin glyph (accessible text "GPS"), cabine Filter chips with "Todas" first, and the viewer on the dark surface with "Anterior / Próxima". "Remover" uses a Confirm dialog, and Esc returns focus to the tile.
- Import: "Escolher arquivos" (multiple) and a drop zone ("Solte para adicionar"). A gallery batch shows one "De qual equipamento?" tree picker plus "Geral", then "Adicionar N fotos".
- Caption composer: Atividade · Equipamento · Local chip rows (five recents, then the seed values, then "Outro…"), Comboboxes on desktop, a live preview, and "Editar texto" to switch to free text that stops regenerating.
- Existing shared pieces: `UploadTile` (`apps/web/src/components/upload-tile.tsx`), `StatusTile`, `FilterChipGroup`/`Chip`, `ConfirmDialog`, `OverflowMenu`, `StatusPill`. Register new shared components in `apps/web/src/components/gallery.test.tsx` (the component axe gallery). New routes go beside `/relatorio/:id/...` in `apps/web/src/app.tsx`, reached from Sumário rows 7 and 8.

## Cross-Story Dependencies

- 6.1 defines the photo write path and `contextCaption`, which every later story uses. 6.2 extends the Story 2.2 uploader and the server variants. 6.3 needs 6.1 (tiles) and 6.2 (pills). 6.4 reuses the 6.1 commit path and the 6.2 queue. 6.5 edits the `file/{id}/caption` op that 6.3's viewer also writes. 6.6 needs the gallery picker from 6.3.
- Epic 7 (7.2, 7.3) prints from `numberPhotos`, captions, `extractPhotoRefs` and `derivedPoints`. Epic 8 adds pending-reading files that the uploader puts first. Epic 9 adds the caption Dictation button. Epic 11 adds the location switch surface (FR-8).

## Carry-over from earlier epics (batch F)

- E3-A4: cut the unit suite's jsdom and axe cost and stabilize flaky 3.6-E2E-001 (`e2e/templates.spec.ts`, `apps/web/src/components/gallery.test.tsx`, `apps/web/src/surfaces/templates/section-text-editor.test.ts`).
- E3-A9 (deferred polish): `.toggle-sub` lines from kernel text (`apps/web/src/surfaces/templates/type-defaults-dialog.tsx`); one merged bullet 4 in section 8 for the renderer (`apps/api/src/jobs/generate/docx.ts`); synthetic names in the remaining test files (`home-surface.test.tsx`, `apps/web/src/surfaces/registries/client-panel.test.tsx`, `e2e/home.spec.ts` and others); a message on blank rename; a way to open "Editar texto" from the section card.
- E4-A7 with E5-A5: split `apps/web/src/surfaces/relatorio/setup-surface.tsx` into etapa files plus a field-hook module; extract the Sumário row actions (`sumario-surface.tsx`, `sumario-row.tsx`); unify the focus-restore helpers (`apps/web/src/surfaces/templates/use-reorder.ts` `restoreFocus`, `apps/web/src/surfaces/relatorio/relatorio-focus.ts`); move the project helpers out of `packages/domain/src/relatorio/sumario.ts`; add kernel path builders for every op family the web writes (`packages/domain/src/ops/path.ts`).
- E5-A2: add the sheet to the durability matrix (`e2e/durability.spec.ts`, `playwright.config.ts` durability projects): tri-state taps, the phone unit chip row, the sticky bar with the on-screen keyboard, Não ensaiado.
- E5-A4: apply `criterion_override` (`packages/domain/src/relatorio/readings.ts` near line 240); make sure a cleared result leaves no printable confirmed text (`packages/domain/src/relatorio/conclusion.ts` near line 263); guard the stale basis on confirm; finish the remaining E5-Q18 e2e (`e2e/ficha.spec.ts`).

## Coordinator decisions (2026-09-25, before the batches)

- Photo variants follow the architecture spine, not the current code: thumbnail 512 px, print copy 2000 px (`apps/api/src/storage/variants.ts` makes 480 and 1600 today). Story 6.2 changes the code and its tests.
- Photos never block "Gerar" (source-deltas: the only blocking pre-issue item is the parecer). The Export dialog first drains pending photo uploads with the existing "Enviando…" state; a photo that still cannot be sent becomes a pre-issue warning row naming how many photos are missing, and the generate job renders with the photos the server holds. `expectedFileIds` must not refuse the job for photos. Open for Matheus to reverse; `deferred-work.md` entry "Photos can block Gerar" closes with this.
