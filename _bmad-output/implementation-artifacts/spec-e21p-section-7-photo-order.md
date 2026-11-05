---
title: 'e21p: move a photo up or down in the REGISTRO FOTOGRAFICO (Story 21.3)'
type: 'feature'
created: '2026-11-05'
status: 'in-progress'
baseline_revision: 'f149fedd7534a7d53812bcedaa4d316a451b936c'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-21-context.md'
warnings: ['batched']
batched_reason: 'Batch e21p carries Story 21.3 alone (epic-21-context.md batch plan); the batched warning marks the epic delivery, run in parallel with e21r (21.1, 21.2), which owns the bump to contract 30.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Section 7 (REGISTRO FOTOGRÁFICO) prints the "Geral" photos in capture order `(captured_at, local_seq, id)` and nothing can move one, so Bruno cannot tell the work in the order it was done; WhatsApp imports without EXIF land at their file date and mix the story up (Story 21.3, `epics.md` § Epic 21).

**Approach:** A photo row gains an optional fractional `order_key`, written by one `file/{id}/order_key` put per move (AD-3). The kernel gives every Geral photo an effective key (its `order_key`, else a key encoding its capture order), sorts section 7 by it, and the one numbering sequence follows. The gallery's Geral tiles gain an Overflow with "Subir" and "Descer".

## Boundaries & Constraints

**Always:**
- The order, the key minting, the "can move up/down" verdicts, the announcement text and the gallery tile order are kernel functions (`packages/domain`, AD-1/AD-13); `apps/web` writes the op only.
- A photo never moved (no key, or null) keeps exactly today's capture-order place among unkeyed photos: on a relatório with no key anywhere, section 7, `numberPhotos` and the gallery are byte-identical to main.
- A moved photo lands exactly between the two Geral photos it was put between. A photo captured after a move lands last, also after a photo moved to last place.
- Two devices: the field converges by the fold as any `file/field` put; two photos holding one key sort by id (`sortByOrderKey`'s rule). No conflict dialog.
- Contract: `CONTRACT_VERSION = 30` with a paragraph under 30 in `contract/version.ts`, and `MIN_CONTRACT_VERSION = 30` (see Design Notes). e21r owns the same bump: on merging main after e21r, keep one bump and both paragraphs.
- Story 20.9 caps: `order_key` is ruled `orderKey` (medium) in `VALUE_RULES['file/field']` and in the `file` row rule. Story 20.10 target rule: a put on a file that is not in the op's relatório is refused as today (`op_target_missing`); `order_key` names no row, so it needs no `REFERENCE_FIELDS` entry (the guard test must stay green).
- UI copy: "Subir"/"Descer" from the Sumário's keys (`copy.sumario.moveUp/moveDown`, `apps/web/src/copy/pt-br.ts` ~l.437) reused or mirrored under `copy.gallery`; derived announcement text in the kernel with an `// authored:` note.
- No emoji. English code and comments.

**Never:**
- No order inside a ficha (section 9, Story 20.6), no drag and drop, no new mock look (no new CSS beyond what fitting the existing `.overflow-trigger` at 390 px needs, written in `app.css` with a comment).
- No rewrite of a sibling's key on a move (one put per move). No change to how a photo is created (no key at create).
- Do not touch e21r's files: `seed/*`, `relatorio/reading-evaluation.ts`, `relatorio/reading-cells.ts`, `print/section-9.ts`, `apps/api/src/jobs/reading/**`, `scripts/make-plate-fixtures.ts`.
- No `sprint-status.yaml` or `epics.md` edit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| No key anywhere | 5 Geral photos, none keyed | section 7 and numbers equal capture order (today) | none |
| Move 4 up twice | photos 1..5, "Subir" on 4, then on 4 again | section 7 prints 1,4,2,3,5 as Imagem 1..5; section 9 numbers unchanged | none |
| Move to last, then capture | photo 2 moved to last; a new photo captured | new photo is last, moved photo second to last | none |
| Move to first | photo 5 "Subir" until first | key below every capture key; Subir disabled on it | none |
| Old-dated import | EXIF-less import keyed second; later an import with an older EXIF date | keyed photo stays second relative to its neighbours' keys; unkeyed import takes its capture-order place | none |
| Equal keys | two photos with one key (two devices) | sorted by id; a move next to the run lands after the whole run (`orderKeyForMove`) | no RangeError |
| Removed neighbour | a moved photo's neighbour removed | order of the rest unchanged, numbers close the gap | none |
| Non-Geral photo | photo on a sheet, item or local | no Overflow move items; a stale `order_key` on it is ignored in section 9 | none |
| Bad key value | push `file/{id}/order_key` with 1001 chars, a number, or a char outside `0-9a-z` | refused per op (`op_value_invalid` / `op_invalid` as the route answers today for schema failures); other ops of the batch apply | rejected entry in the push answer |
| Null key | put `order_key: null` | photo back at its capture-order place | none |
| Contract 29 client | pull with header 29 | `426 contract_outdated` | client shows "Atualizar" |

</intent-contract>

## Code Map

- `packages/domain/src/photos/order.ts` -- `comparePhotos`, `livePhotos`, `isGeralPhoto`, `geralPhotos` (capture order). Add the effective key, the section 7 sort, the move key, the move verdicts, and the gallery slot order here.
- `packages/domain/src/ops/order-key.ts` -- `orderKeyBetween`, `orderKeyForMove` (handles equal-key runs), `sortByOrderKey`, `moveLandingIndex`; reuse, do not fork. Keys are `0-9a-z`, plain string order; `digitAt` throws on other chars.
- `packages/domain/src/print/photo-order.ts` l.80-81 -- `documentPhotoOrder` takes `geral = live.filter(isGeralPhoto)`; switch to the section 7 order. `numberPhotos` (`photos/numbering.ts`) and every number reader follow.
- `packages/domain/src/print/section-7.ts` l.58 -- `section7Photos` reads `geralPhotos`; follows once `geralPhotos` sorts by section 7 order. Update the header comments that say "capture order".
- `packages/domain/src/schemas/entities.ts` l.533-571 -- `photoFileRowSchema`; add `order_key` optional, nullable, `0-9a-z` regex (absent and null mean none, like `location_id`).
- `packages/domain/src/ops/path.ts` l.56 -- `FILE_FIELDS`; append `'order_key'` and a contract-30 line in its doc comment. `fileFieldPath` types follow.
- `packages/domain/src/ops/value-limits.ts` l.150-151 -- `file` and `file/field` rules; add `order_key: orderKey`.
- `packages/domain/src/ops/targets.ts` -- `REFERENCE_FIELDS`; no change expected (order_key is not an id); `targets.test.ts` guard must stay green.
- `packages/domain/src/contract/version.ts` l.267, l.423 -- `CONTRACT_VERSION`, `MIN_CONTRACT_VERSION`, version notes.
- `packages/domain/src/points/checks.ts` l.98-120 -- `pointMoveOrderKey`, `pointMovedText`: the pattern for the photo move key and the announcement.
- `packages/domain/src/relatorio/section-position.ts` -- `sectionRefText(snapshot, 7)`, `sectionMention`.
- `apps/web/src/db/photo-store.ts` l.19-100 -- `PhotoTile` (add `order_key?`), `photoTiles` sorts by `comparePhotos`.
- `apps/web/src/surfaces/photos/photo-ops.ts` -- `put(...)` field union; add `movePhoto` (one `file/{id}/order_key` put, `commitBatch`).
- `apps/web/src/surfaces/photos/gallery-surface.tsx` -- tile list `shown`, `numbers`, `PhotoRow` props; add the Overflow on Geral tiles, the move handler, a `role="status"` announcer, focus back on the moved tile's trigger.
- `apps/web/src/components/photo-row.tsx` -- add an optional `menu?: ReactNode` slot rendered in `.photo-text` after "Legendar".
- `apps/web/src/components/overflow-menu.tsx` -- `OverflowMenuAction`; add optional `disabled` mapped to React Aria `disabledKeys` (no other behavior change). Existing callers keep hiding end items.
- `apps/web/src/surfaces/points/points-surface.tsx` l.102-113, 291-298 -- move handler and `useReorder` usage to mirror (focus restore, announcement).
- `apps/web/src/copy/pt-br.ts` -- `copy.gallery` block (~l.961): the Overflow keys. `copy.sumario.moveUp/moveDown` hold "Subir"/"Descer".
- `apps/api/src/sync/people-in-photo.integration.test.ts` -- model for the new api test through `/api/sync/ops` and the pull. Also `value-limits.integration.test.ts`, `targets.integration.test.ts` for 20.9/20.10 shapes.
- `e2e/section-7-by-hand.spec.ts` -- model: fixture reset (`resetEmpresaBWithFixture`), gallery camera, generate, DOCX `extractStructure`, PDF text; serial group.
- `e2e/merge.spec.ts`, `e2e/support/colleague.ts`, `e2e/support/sync.ts` (`syncNow`) -- two-device pattern.
- `e2e/support/groups.ts` -- `SERIAL_SPECS`; a spec that generates on the fixed-id fixture goes there.
- `docs/kbs/log.md` and the matching concept file under `docs/kbs/` (photos or contract) -- KB update.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/entities.ts` -- add `order_key: z.string().regex(/^[0-9a-z]+$/).nullable().optional()` to `photoFileRowSchema` with a contract-30 doc comment -- the field, guarded so no forged key can make `orderKeyBetween` throw on every device.
- `packages/domain/src/ops/path.ts` -- append `'order_key'` to `FILE_FIELDS` -- the op path.
- `packages/domain/src/ops/value-limits.ts` -- `order_key: orderKey` in `file` and `file/field` rules -- Story 20.9.
- `packages/domain/src/photos/order.ts` -- add and export: `captureOrderKey(photo)` (prefix `t` + 9 base36 digits of the clamped instant ms, `zzzzzzzzz` for an unparsable one, + 8 base36 digits of `local_seq`; equal order to `comparePhotos` on unkeyed photos), `section7Key(photo)` (`order_key ?? captureOrderKey`), `compareSection7(a, b)` (key, then id); make `geralPhotos` sort by it; add `geralPhotoMoveKey(geral, id, toIndex)` (null when it lands in place; uses `orderKeyForMove` over effective keys; when the landing is last, the upper bound is the capture key ceiling just above the lower neighbour: `t` + base36(ms(lower)+1), or `t` when lower < `t`, or null on overflow) and `geralMoveOptions(geral, id)` -> `{ position, total, canMoveUp, canMoveDown }` (or null for a non-Geral photo); and `galleryTileOrder(tiles)` -- capture order with the Geral tiles' slots refilled in section 7 order -- the kernel owns order, key and verdicts.
- `packages/domain/src/print/photo-order.ts` -- `geral` from the section 7 order -- numbering follows.
- `packages/domain/src/photos/gallery.ts` (or `order.ts`) -- `photoMovedText(position, total, section7Prints, section7Ref)` mirroring `pointMovedText`, `// authored:` -- the announcement.
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION = 30`, `MIN_CONTRACT_VERSION = 30`, a paragraph under 30 for 21.3 (the field, the path, why 29 must stop) -- contract.
- `packages/domain/src/**/*.test.ts` -- kernel tests: keyed/unkeyed mix, capture-key order equals `comparePhotos` (property over random photos), every matrix row above, `numberPhotos` after moves (section 9 numbers unchanged), path parse/format of `file/{id}/order_key`, value limits (cap, type, alphabet), the fold of two moves of the same photo on two devices converging (apply both orders), and `galleryTileOrder`.
- `apps/web/src/components/overflow-menu.tsx` -- optional `disabled` -> `disabledKeys`; unit test it.
- `apps/web/src/components/photo-row.tsx` -- optional `menu` slot.
- `apps/web/src/db/photo-store.ts` -- carry `order_key` on `PhotoTile`.
- `apps/web/src/surfaces/photos/photo-ops.ts` -- `movePhoto(db, author, relatorioId, fileId, key)`; one put.
- `apps/web/src/surfaces/photos/gallery-surface.tsx` -- tiles in `galleryTileOrder`; on a Geral tile an `OverflowMenu` named "Foto N" with Subir/Descer, disabled at the ends (from `geralMoveOptions` over the snapshot's `geralPhotos`); on press mint the key from the kernel over the snapshot, commit, announce in a `role="status"` (`data-testid="gallery-move-status"`), restore focus to that tile's trigger; refused writes go through `toastPhotoWriteFailure`.
- `apps/web/src/copy/pt-br.ts` -- gallery Overflow keys reusing the Sumário words.
- `apps/api/src/sync/photo-order.integration.test.ts` -- push a photo create then `file/{id}/order_key` put through `/api/sync/ops`; server row holds the key and pulls back identical; a second device's put of another key converges (last applied wins on both pulls); over-cap / non-string / bad-alphabet keys rejected per op while the rest of the batch applies; a put on a file of another relatório refused `op_target_missing`; a pull with header 29 answers 426.
- `e2e/photo-order.spec.ts` (@p0, serial group) -- at 390, 768 and 1280 px: five Geral photos captured in the gallery (fake camera) or imported; "Subir" twice on photo 4 through the Overflow; gallery numbers read 1,4,2,3,5 in tile order; the committed `order_key` is in IndexedDB; generate; DOCX section 7 (from its own heading) and PDF read "Imagem 1".."Imagem 5" in the moved order; a sheet photo's section 9 number unchanged; first tile's Subir and last tile's Descer are disabled; a sheet photo tile shows no move items; Overflow fits at 390 px (no horizontal overflow). Also: a section 8 point citing Imagem 3 prints "conforme Imagem 5" after that photo moves to place 5 (one width).
- `e2e/photo-order.durability.spec.ts` (@p0) -- an EXIF-less import (sorts last) moved to second: stays second after reload, after a sync to a second device (colleague context), and after a new capture (new one last); two devices move the same photo offline to different places, both "Sincronizar agora", both show the same order with no conflict dialog, asserted in both IndexedDBs.
- `e2e/support/groups.ts` -- add `photo-order.spec.ts` to `SERIAL_SPECS` if it generates on the fixed fixture.
- `docs/kbs/log.md` and the matching concept -- one line each.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- under a heading "Epic 21, batch e21p", only if something is deferred.

**Acceptance Criteria:**
- Given a relatório with five "Geral" photos in capture order 1 to 5, when photo 4 is moved up twice in the gallery, then section 7 prints and numbers them 1, 4, 2, 3, 5 ("Imagem 1" to "Imagem 5" in that order) in the DOCX and the PDF, and every section 9 number is unchanged.
- Given an EXIF-less import that sorts last, when it is moved to second place, then it stays second after a reload, after a sync to a second device, and after another photo is captured (the new one last).
- Given a section 8 point citing "conforme Imagem 3", when that photo moves to place 5, then the point prints "conforme Imagem 5".
- Given the first or the last Geral photo, when its Overflow opens, then Subir (first) or Descer (last) is disabled; a photo on a sheet, an item or a local shows neither.
- Given two devices moving the same photo offline to different places, when both sync, then both show the same order, with no conflict dialog.
- Given a contract-29 client, when it pulls, then it gets `426 contract_outdated`.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why an effective key.** Keys on blocks and points exist from create; photos have none, and a move must be one put. Encoding the capture order as a key in the same `0-9a-z` space lets keyed and unkeyed photos sort together with no write on the unkeyed ones, and makes the unkeyed-only order identical to `comparePhotos`. Example: unkeyed A `t0mh2k3a1b00000001`, B `t0mh2k9z0000000002`, C moved between them gets `orderKeyBetween(A, B)`, e.g. `t0mh2k5`. A move to last gets an upper bound of `t` + base36(ms(lower)+1), so any later capture still sorts after it.

**MIN_CONTRACT_VERSION = 30.** A version-29 bundle's `opSchema` refuses `file/{id}/order_key` (`FILE_FIELDS` enum), so a pulled page carrying one fails whole (`invalid_response`), the precedent of versions 20, 23 and 28; and its `photoFileRowSchema` would strip `order_key`, so its gallery and preview would number section 7 in capture order where the server's documents print the moved order. A relatório stream carries the put as soon as any device moves a photo.

**Open readings (listed in the PR, not decided here).** A new photo lands last when it is a capture (its time is the latest); an import keeps its capture-order place among unkeyed photos (EXIF time, else file date), as today. The gallery keeps capture order for sheet photos and refills only the Geral tiles' slots in section 7 order. A key survives a photo leaving section 7 (to a sheet) and is read again if it comes back.

## Verification

**Commands (inside the tools container, `podman compose --profile tools run --rm --user root tools ...`):**
- `pnpm test:unit -- packages/domain/src/photos packages/domain/src/ops packages/domain/src/print apps/web/src/components` -- green.
- `pnpm lint`, `pnpm static` -- clean.
- `pnpm test:api` (after `podman compose restart api`) -- green, including `photo-order.integration.test.ts`.
- Under `lockf -t 20000 /tmp/fasor-verify.lock`: `pnpm exec tsx scripts/e2e.ts e2e/photo-order.spec.ts e2e/photo-order.durability.spec.ts e2e/section-7-by-hand.spec.ts e2e/photo-numbers.spec.ts e2e/gallery.spec.ts --project desktop-chrome --project durability-desktop-chrome`, then the durability spec on `durability-android-chrome` and `durability-webkit`.
