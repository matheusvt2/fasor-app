---
title: 'Story 8.1: A Suggestion is an entity nobody can write without a tap'
type: 'feature'
created: '2026-09-26'
status: 'done'
baseline_revision: '1582cddadfc18cac787efb0f86995fd2fb163151'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Batch S of the Epic 8 delivery: one story (8.1) plus the one contract change of the epic (coordinator decision "Contract"), so batches R and P add no op family.'
deferred:
  - summary: >-
      A pending suggestion whose target later gets an equal value by another path stays pending with no UI; auto-confirm runs only over pulled creates and is not retried on failure.
    evidence: |-
      apps/web/src/db/suggestion-store.ts autoConfirmPulled; engine.ts autoConfirm. Owner: batch P (Story 8.2).
    location: >-
      apps/web/src/db/suggestion-store.ts
    severity: medium
  - summary: >-
      A manufacturer typed over a guess is written without a registry row.
    evidence: |-
      suggestions.ts parseFieldInput default branch; the Criar path is Story 8.5/8.6. Owner: batch P.
    location: >-
      packages/domain/src/relatorio/suggestions.ts
    severity: medium
  - summary: >-
      Crop original possibly re-downloaded on every mount when the photo id holds another files blob.
    evidence: |-
      file-store.ts cropSourceBlob keeps bytes only when the id is free; settle by checking whether a photo thumb is ever stored under files.
    location: >-
      apps/web/src/db/file-store.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The suggestion row, its two op families and cell provenance exist in the kernel, but nothing on the device renders a pending suggestion, confirms or discards it, auto-confirms an equal one, or counts it; the create builder, the `hint` field and the device-side photo reading fields are missing, so batches R (reading job) and P (plate tile, Flow 2b) have nothing to build on.

**Approach:** Finish the kernel contract (builder, `hint`, contract 5, a pure `relatorio/suggestions.ts` module with every rule, op builder and text), wire the nameplate group of the sheet to the device's suggestion rows (Suggestion field states, replace line, crop, confirmed glyph, Confirmar / Confirmar todos / typing discards), auto-confirm equal suggestions after a pull, and feed the pending rows to `progress` and `syncCounts` as an explicit input (coordinator conflict 3).

## Boundaries & Constraints

**Always:**
- AD-1/AD-13: every rule, status, count, comparison and derived text lives in `packages/domain`; `apps/web` renders from IndexedDB and writes ops only. Static copy in `apps/web/src/copy/pt-br.ts` or `copy/ui.ts` (AGENTS.md three homes).
- Nothing unconfirmed is written: a pending suggestion never produces a cell; the only writes are the batches below. The engineer's value is never overwritten except by an explicit tap on "Substituir".
- Confirmar = ONE batch: `suggestion/{id}/status = 'confirmed'` + `{target_path} = value` with `meta.source_suggestion_id = id`. Typing = ONE batch: the typed value op (no meta) + `suggestion/{id}/status = 'discarded'` for that field only. Confirmar todos = ONE batch of confirm pairs for every pending `trust = 'suggested'` suggestion of the group whose target cell is empty; skips every `verify` one and every replace one. Auto-confirm = the confirm batch with `meta.auto = true`, as the signed-in user.
- `RelatorioSnapshot` stays as is (only cell-referenced suggestions); pending counts take the device's suggestion rows as an explicit argument.
- Mock class names (`60-ficha.html` lines ~312-341, `components.css` lines 411-447): `.section.nameplate-extraction`, `.suggestion-group-head` (+ `.section-note`, `.btn.btn-secondary`), `.field.suggestion-field[data-state="suggested|verify|confirmed"]` (`.combobox` variant for select/manufacturer/voltage_class), `.input > .crop-thumb > .thumb-fake`, `.sv`, `.confirm-btn`, `.suggested-pill`, `.verify-pill`, `.suggestion-alt` + `.btn.btn-text` "Substituir". `tokens.css`/`components.css` untouched; any needed rule (e.g. an `<input class="sv">` reset) goes in `app.css` with a comment.
- The Story 5.8 users of `SuggestionField` (`conclusao-section.tsx`) keep working unchanged (the new props default to today's behavior).

**Never:**
- Do not edit `packages/domain/src/checks/pre-issue.ts` / `preIssue`, the renderer, the Export dialog or the setup surface (Epic 7 batches run in parallel).
- No plate tile, no reading job, no arrival toast/banner, no Sync status UI lines, no pre-issue row, no "Criar ⟨nome⟩?" UI (batches R and P); no production endpoint that writes a suggestion.
- Never infer `pending` from anything but the stored `status`; never suggest a verdict.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fill, suggested | pending, trust suggested, target cell empty | amber field, "Sugerido" pill, value, crop, "Confirmar" | - |
| Fill, verify | pending, trust verify, target empty | dashed border, "Verificar" pill with the guess (never blank), "Confirmar" | skipped by Confirmar todos |
| Replace | pending, target filled with a different value | normal field keeps the engineer's value; `.suggestion-alt` "Sugerido: 15 kV" + "Substituir" (= Confirmar batch) | never auto-written |
| Auto-confirm | a pulled `suggestion/{id}` create whose target cell is filled and `compareSuggestion` = equal | the device commits the confirm batch with `meta.auto = true`; cell gets `source_suggestion_id`; field shows the confirmed glyph | runs once: skipped when the local row is no longer pending or no user is signed in |
| Typing discards | engineer edits a suggested/verify field's guess and commits a valid value | typed value op + `status = discarded`; the other suggestions of the group untouched | an unparseable number/date shows the kind's invalid helper, nothing written |
| Confirmed | cell `source_suggestion_id != null`, relatório not Emitido | `data-state="confirmed"`: neutral style, 24 px crop glyph with ≥ 48 px hit area opening the viewer | any later put without meta nulls it (existing `applyOp`) and the glyph goes |
| Several pending on one target | two pending rows target one field | the newest (highest uuidv7 id) is shown; Confirmar/typing act on it only | - |
| Crop source | photo original local / not local / not uploaded | local original, else the original via `useSync().fetchFile(id, 'original')` cached as a `crop` blob when the id is free; else the `.thumb-fake` placeholder | a fetch failure keeps the placeholder, no error |
| Server guard | client push of `suggestion/{id}` create | rejected `op_server_only` | - |
| Server guard | client photo `file/{id}` create with `reading_status` not in `none|queued`, or `queued` without `reading_kind` | rejected `op_invalid` | - |

</intent-contract>

## Code Map

- `packages/domain/src/ops/path.ts:242-243,463` -- families `suggestion` (create, serverOnly) and `suggestion/status`; add `suggestionPath(id)` next to `suggestionStatusPath`.
- `packages/domain/src/schemas/entities.ts:449-464` -- `suggestionRowSchema`; add `hint`. `:388-408` photo row already has `reading_kind`, `reading_target`, `reading_status`.
- `packages/domain/src/ops/apply.ts:79` `cellOf` -- already sets/nulls `source_suggestion_id` from `meta`; `:222,:276` reduce `suggestion/status`. No change expected; add tests if missing.
- `packages/domain/src/ops/op.ts:20-24` -- `meta.source_suggestion_id`, `meta.auto`.
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION = 4`, `MIN_CONTRACT_VERSION = 4`.
- `packages/domain/src/relatorio/progress.ts` -- `over()`, `progress`, `cabineSheetsProgress`, `locationProgress`, `sugestoesText`.
- `packages/domain/src/sync/counts.ts` -- `syncCounts(outbox)`, `SyncCounts`.
- `packages/domain/src/relatorio/sheet-state.ts:32` `isCellFilled`; `seed/definitions.ts` `getDefinition(seed_version, 'cabine_primaria', block_type)`; `seed/schema.ts` `FieldDef` kinds.
- Parsers to reuse: `parse/pt-br-number.ts` (`parseDecimalPtBr`, `canonicalDecimal`, `formatDecimalGroupedPtBr`), `registry/word-row.ts` `parseVoltageClassKv`, `text/normalize-name.ts` `normalizeRegistryName`, `fieldValueText`, `numberFieldValue` (grep their files), `text/plural.ts` `plural`.
- `packages/domain/src/relatorio/ops.ts` -- `relatorioOpEnvelope`, `Author`; op builders go in the new module.
- `apps/api/src/sync/apply.ts:58-110` -- `validate`, `serverFileFieldsAreEmpty`; add the photo reading-fields rule for `origin: 'client'`.
- `apps/api/src/sync/sync.integration.test.ts` -- existing `op_server_only` push tests through the route: pattern for the new tests.
- `apps/web/src/db/file-commit.ts:89-140` -- `commitPhotoCapture`, `photoCreateDraft` hardcode `reading_kind: null, reading_status: 'none'`.
- `apps/web/src/db/sync-store.ts:74` `applyPulled`; `apps/web/src/sync/engine.ts:73` `SyncEngineDeps`, `:375` `pullStream`; `apps/web/src/state/sync.tsx:153` builds the engine; `apps/web/src/db/commit.ts:144` `commitBatch`.
- `apps/web/src/components/suggestion-field.tsx` -- Story 5.8 component (suggested only); copy in `copy/ui.ts` `ui.suggestionField`.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- renders `SheetField` per nameplate field; `ficha-fields.tsx` `SheetField` by kind, `useTypedText`; `ficha-ops.ts` `nameplateOp`; `use-ficha-data.ts` `api` (`edit`, `commit`, `author`, `undoable`, `announce`); `ficha-surface.tsx` passes `state` (the relatório `EntityState`, which holds suggestion rows).
- `apps/web/src/surfaces/photos/photo-viewer.tsx` -- `PhotoViewer` (tiles, numbers, photoId); `db/photo-store.ts` `useRelatorioPhotoTiles`; `db/file-store.ts:218` `ensureLocalBlob`, `readLocalBlob`, `putLocalBlob` (`FileBlobRow.variant` already allows `'crop'`).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:96,200` -- `progress(snapshot)` and the "sugestões por confirmar" button; `tree-surface.tsx:38`.
- `e2e/support/push-server-ops.ts` -- server-op seeding pattern (`applyOps(..., {origin: 'server'})`); `e2e/support/relatorio-seed.ts`, `e2e/support/sync.ts`, `e2e/support/merged-fixtures.ts`; e2e specs that already open a sheet: `e2e/ficha.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/ops/path.ts` -- add `suggestionPath(id)`; export it from the index.
- `packages/domain/src/schemas/entities.ts` -- `suggestionHintSchema = z.object({ create_registry_entry: z.object({ kind: z.literal('manufacturer'), name: z.string().min(1) }) })`; `hint: suggestionHintSchema.nullable().default(null)` on `suggestionRowSchema` (old rows parse).
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION = 5` with a dated note (suggestion `hint`, device photo creates carrying `reading_kind`/`reading_target`/`reading_status: queued`, the new client refusal); `MIN_CONTRACT_VERSION` stays 4 with a note (a v4 bundle strips `hint` and parses every op).
- `packages/domain/src/relatorio/suggestions.ts` (new, exported) -- pure functions: `suggestionRowsOf(state: EntityState, relatorioId): SuggestionRow[]`; `pendingSuggestions(rows): SuggestionRow[]`; `suggestionBlockId(s): string | null` (any `sheet/*` target); `pendingByNameplateField(rows, blockId): Map<fieldKey, SuggestionRow>` (newest per field); `suggestionFieldDef(block, s): FieldDef | null`; `compareSuggestion(cellValue, suggestionValue, fieldDef | null): 'equal' | 'different'` (text/select: trimmed, inner whitespace collapsed, exact; manufacturer: `normalizeRegistryName`; voltage_class: same kV number; number: same `canonicalDecimal(raw)`, unit and state; date: string equal; null def: JSON deep-equal); `suggestionView(cell, s, fieldDef): 'fill' | 'replace' | 'none'` (empty cell → fill; filled and different → replace; filled and equal → none); `confirmAllCandidates(block, pending)`; `confirmSuggestionOps(author, s, opts?: { auto?: boolean }): OpDraft[]`; `discardSuggestionOp(author, s): OpDraft`; `blocksWithPendingSuggestions(pending): Set<string>`; `showsConfirmedGlyph(cell, relatorioStatus): boolean` (source set and status not Emitido); `fieldInputText(field, value): string` and `parseFieldInput(field, text): { ok: true; value: JsonValue | null } | { ok: false }` for the six kinds (number → `{raw, unit: field.unit ?? null, state: 'measured'}`; date accepts `dd/mm/aaaa`, `mm/aaaa`, ISO; select matches an option ignoring case/accents; voltage_class via `parseVoltageClassKv`); texts `confirmarTodosText(n)` "Confirmar todos (7)", `confirmedAllToastText(confirmed, skipped)` "7 campos confirmados — 1 campo pede verificação" (verify clause omitted at 0, singular/plural), `confirmedFieldToastText(label, valueText)` "Fabricante: Schneider — confirmado", `suggestionGroupNoteText(n, verifyCount)` (from the mock's note, "da foto 3" dropped until P wires the plate photo number; marked in a comment), `suggestionAnnouncement(trust, valueText)` "Sugerido, 15 kV, confirmar" ("Verificar, …" for verify), `replaceLineText(valueText)` "Sugerido: 15 kV", `fichasComSugestoesText(n)` "3 fichas com sugestões por confirmar" (for P's pre-issue row). Unit tests cover every matrix row and every kind of compare/parse.
- `packages/domain/src/relatorio/progress.ts` -- optional `pending?: readonly SuggestionRow[]` on `progress`, `cabineSheetsProgress`, `locationProgress`: `suggestions_pending` = its length when given; a block in `blocksWithPendingSuggestions` is never counted in `sheets_concluded`. Tests.
- `packages/domain/src/sync/counts.ts` -- `syncCounts(outbox, reading?: { suggestions?: readonly Pick<SuggestionRow,'status'>[]; photos?: readonly { reading_status?: string | null }[] })` adds `suggestions_pending` and `readings_queued` (queued or running), 0 when omitted; update `SyncCounts` users/tests.
- `apps/api/src/sync/apply.ts` -- client photo create: `reading_status` must be `none` or `queued`, and `queued` requires a non-null `reading_kind` → else `op_invalid`.
- `apps/api/src/sync/suggestion.integration.test.ts` (new, through the sync route) -- client push of a `suggestion/{id}` create → `op_server_only`; a server-applied create then a client `suggestion/{id}/status = confirmed` push → accepted and the row reads confirmed; a client photo create with `reading_kind: 'plate'`, `reading_status: 'queued'` accepted; `reading_status: 'done'` → `op_invalid`.
- `apps/web/src/db/file-commit.ts` -- optional `reading?: { kind: 'plate' | 'display' | 'caption' | 'panel' | 'nc_obs'; target: JsonValue }` on the capture input → `reading_kind`, `reading_target`, `reading_status: 'queued'`; default unchanged. Unit test.
- `apps/web/src/db/suggestion-store.ts` (new) -- `autoConfirmPulled(db, pulled: readonly Op[], author: Author, deps: CommitDeps)`: for each pulled `suggestion/{id}` create, load the local suggestion row (skip unless `pending`) and its target block; when `suggestionView` is `none` (filled and equal), `commitBatch(confirmSuggestionOps(author, s, { auto: true }))`. Unit test with a fake-indexeddb database.
- `apps/web/src/sync/engine.ts` + `state/sync.tsx` -- `SyncEngineDeps.author?: () => Author | null` (the session user); after a successful `applyPulled` in `pullStream`, run `autoConfirmPulled` when an author exists and the ops are of its company; errors logged, never stop the pull. Engine test.
- `apps/web/src/components/suggestion-field.tsx` -- props `state?: 'suggested' | 'verify' | 'confirmed'` (default suggested), `crop?`, `value slot` (children), `announcement?` (the Confirmar button's accessible name), `combobox?`, `valueClassName`; renders the pill of its state; Story 5.8 call sites unchanged. `components/crop-thumb.tsx` (new): `button.crop-thumb` (aria-label "Ver recorte da placa — ⟨label⟩") holding an `img` alt "Recorte da placa" drawn from the region `bbox` of the source picture (local original, else `fetchFile(id, 'original')` stored as variant `crop` under the photo id only when the id is free, a new `file-store.ts` helper), `.thumb-fake` meanwhile; `onPress` opens the viewer. Component tests (states, pills, announcement, alt).
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` (new) + `nameplate-section.tsx` -- read `pendingByNameplateField(pendingSuggestions(suggestionRowsOf(state, relatorioId)), block.id)` (pass `state` down from `ficha-surface.tsx`); per field: `fill` → `SuggestionField` with the editable guess (`<input class="sv">` prefilled with `fieldInputText`; a committed change parses with `parseFieldInput` and writes `[nameplateOp(typed), discardSuggestionOp]` in one `api.edit` batch; `.measurement-field` + `.mf-unit` layout for number kinds per the mock), `.combobox` variant for select/manufacturer/voltage_class; `replace` → the normal `SheetField` plus `.suggestion-alt` line with "Substituir"; confirmed cell (`showsConfirmedGlyph`) → the normal `SheetField` inside `data-state="confirmed"` with the 24 px `CropThumb` glyph. Section gets `nameplate-extraction` and a `.suggestion-group-head` (note + `btn btn-secondary` "Confirmar todos (N)" with the `i-check-all` icon) while any fill suggestion is pending; the button is present only when N > 0. Confirm/Confirmar todos go through `api.edit`, show a toast (field or all), and `api.announce` the confirmation. The viewer opens from a crop: `PhotoViewer` gains an optional `zoom?: [x0, y0, x1, y1]` (normalized) that scales and centers the picture on the region and outlines it; the sheet opens it with the relatório photo tiles when the photo is on the device, else the crop does nothing.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx`, `tree-surface.tsx` -- pass `pendingSuggestions(suggestionRowsOf(state, relatorioId))` to `progress`; the header button "N sugestões por confirmar" opens the first sheet with a pending suggestion (fall back to section 9 when none).
- `apps/web/src/copy/ui.ts`, `copy/pt-br.ts` -- static words: "Verificar", "Substituir", crop label/alt, "Ver" etc.
- `e2e/support/push-server-ops.ts` -- `pushSuggestion(companyId, relatorioId, { targetPath, value, trust, photoId?, bbox?, actorId })` returning the id (status pending, mode fill, `reading_run_id`/`photo_id` minted when absent, `prompt_version: 'e2e-1'`).
- `e2e/suggestions.spec.ts` (new) -- `@p0`: (1) Confirmar one field → outbox holds the status + value pair in one `batch_id` with `meta.source_suggestion_id`, cell shows confirmed glyph, Sumário count drops; (2) Confirmar todos with one `verify` field → only suggested fields confirmed in one batch, the verify field still pending, toast text; (3) typing into one suggested field → value op + `discarded`, the others still pending; (4) a filled field receiving a different suggestion shows "Sugerido: … — Substituir", the value is unchanged until the tap, the tap writes the confirm batch; (5) a filled field receiving an equal suggestion is auto-confirmed after "Sincronizar agora" (`meta.auto = true` in the outbox, cell `source_suggestion_id`). `@p1`: Sumário "N sugestões por confirmar" and a block with pending suggestions not counted as concluded; the nameplate with suggestions fits 390 px without horizontal scroll; the crop opens the viewer when the photo is local.

**Acceptance Criteria:**
- Given a pending `suggested` suggestion on an empty nameplate field, when the sheet renders, then the field shows the amber fill, the "Sugerido" pill, the value, a 48 px crop with alt "Recorte da placa", and its Confirmar button is announced "Sugerido, ⟨valor⟩, confirmar".
- Given that field, when "Confirmar" is tapped, then one batch holds `suggestion/{id}/status = confirmed` and the nameplate put with `meta.source_suggestion_id`, the field turns `data-state="confirmed"` with a 24 px glyph (≥ 48 px hit area) that opens the viewer zoomed on `bbox`, and the committed outbox proves it.
- Given a group with 7 suggested and 1 verify pending suggestions on empty fields, when "Confirmar todos (7)" is tapped, then one batch confirms the 7, the verify field stays pending, and the toast reads "7 campos confirmados — 1 campo pede verificação".
- Given a pending suggestion, when the engineer types a different valid value and commits, then the value op and `status = discarded` for that suggestion only are written in one batch.
- Given a filled field, when a different suggestion arrives, then the value is untouched and the line "Sugerido: ⟨valor⟩ — Substituir" shows; "Substituir" writes the confirm batch; when an equal suggestion arrives, the device writes the confirm batch with `meta.auto = true` once.
- Given pending suggestions, when the Sumário renders, then "N sugestões por confirmar" counts the device's pending rows and a block holding any is not counted in "fichas concluídas"; `syncCounts` reports `suggestions_pending` and `readings_queued` from its explicit input.
- Given a client push, when it carries a `suggestion/{id}` create, then the sync route rejects it `op_server_only`; a `suggestion/{id}/status` put is accepted; a photo create with `reading_status` other than `none|queued` is `op_invalid`.

## Spec Change Log

## Review Triage Log

## Design Notes

- Cross-batch wiring owners: Sync status lines for `readings_queued`/`suggestions_pending` → batch P (Story 8.2); pre-issue "N fichas com sugestões por confirmar" (kernel text here) → batch P (Story 8.6), because `preIssue` is off-limits while Epic 7 runs; plate tile, plate crop above the group, "da foto N" in the group note, arrival toast/banner → batch P; "Criar ⟨nome⟩?" from `hint` → batch R (Story 8.5). Each gets a `deferred-work.md` entry.
- Open question (E12-A5): the story says the group button "reports 'Confirmar 7'"; the current mock (`60-ficha.html`) labels it "Confirmar todos (7)". The mock label is kept and the question listed in the PR.
- Open question: the story says a different suggestion "stays pending with `mode = replace`"; no client family writes `mode`, so the device derives the replace view from the filled cell (`suggestionView`) and leaves the stored `mode` as the server wrote it.
- "Reachable until export" read as: the glyph shows while the relatório status is not Emitido.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- kernel and web tests green.
- `docker compose --profile tools run --rm tools pnpm test:api` -- includes `suggestion.integration.test.ts`.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/suggestions.spec.ts` (through the repo's e2e runner if required; see AGENTS.md) -- green.
- `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify` -- green (run by the orchestrator).

### 2026-09-26 — Review pass
Layers: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 19 findings — high 0, medium 9, low 9, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` VG: tree cabine/coluna counters (`tree.ts` `locationTree`) and Home resume (`resume.ts`) ignore pending rows, disagreeing with the Sumário header — pass `pending` through and wire callers; tree test added.
  - `[medium]` `[patch]` VG: edit-then-Confirmar, blur and clear of a guess untested — `@p0` e2e case added for edit-then-Confirmar.
  - `[medium]` `[patch]` VG: confirmed glyph tap and zoomed viewer covered nowhere in `@p0` — glyph tap step added to a `@p0` test; the Sumário count navigation stays `@p1` (run at the retrospective).
  - `[medium]` `[patch]` VG other: auto-confirm writes the suggestion's value over the engineer's own normalized-equal value — the auto path now writes the existing cell value with the provenance meta.
  - `[maybe-false]` `[defer]` VG other: crop original re-downloaded on every mount when the id already holds a thumb blob — would be medium if photo thumbs land in `files`; settle by checking whether any path stores a photo thumb under `files` (tiles use `thumbs`).
  - `[low]` `[patch]` ECH: rAF refocus after Enter can land on the unmounting fill — query the plain field only.
  - `[medium]` `[patch]` ECH: `ConfirmedField` wrapper switch remounts `SheetField` mid-typing — one stable wrapper.
  - `[low]` `[patch]` ECH: `written` set before the edit resolves — set from the edit outcome.
  - `[medium]` `[defer]` ECH: a pending suggestion whose view later becomes `none` (a copy chip wrote an equal value) stays pending with no UI; auto-confirm only runs over pulled creates — owner batch P (typed-first exclusion, Story 8.2/8.6).
  - `[low]` `[defer]` ECH: an auto-confirm that throws is never retried (cursor passes the create) — same root as the row above.
  - `[medium]` `[patch]` ECH: pending rows on removed/absent blocks counted forever — count only rows of live snapshot blocks.
  - `[medium]` `[patch]` ECH: Sumário "sugestões" navigation derived from the unfiltered set — same kernel filter as the count.
  - `[medium]` `[patch]` ECH: other `progress`/`locationProgress` callers omit `pending` — grouped with the first VG row; Home/Project cards without the relatório state deferred to the integrated review.
  - `[low]` `[reject]` ECH: a non-normalized bbox draws off-image — the reading job (batch R) emits normalized boxes by contract; a guard adds branches for an input no emitter produces.
  - `[low]` `[reject]` ECH: `queued` with `reading_target: null` accepted — only `reading_kind` is required by the contract; batch P sends the target.
  - `[low]` `[reject]` ECH: a failed crop fetch retries only on remount — every sheet re-entry remounts.
  - `[low]` `[patch]` ECH: `removePhoto` rejection unhandled — `.catch` added.
  - `[low]` `[reject]` ECH: a double tap on Confirmar queues two idempotent batches — same values, no state harm; a guard adds in-flight state.
  - `[medium]` `[defer]` ECH: a manufacturer typed over a guess is written without a registry row — the "Criar ⟨nome⟩?" path is Story 8.5/8.6 (batches R/P).
