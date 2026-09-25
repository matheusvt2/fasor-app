---
title: 'Story 6.6: points of attention that print as section 8, with untested equipment listing itself'
type: 'feature'
created: '2026-09-25'
status: 'in-progress'
baseline_revision: '324d8c31ed87d03266220c4cd9b72dc6d1b10154'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Batch P3 of Epic 6 carries Story 6.6 plus the kernel half of E3-A9 section 8 bullet 4 (derivedPoints and its grouping rule): one kernel family and one surface, batched for token economy.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Section 8 (points of attention) has a `point` entity and op families but no surface, no action field, no photo references, no recurring-finding chips, and untested equipment is never listed by itself. The Sumário row 8 still says "disponível em uma próxima etapa".

**Approach:** Extend the point row (`action` plus no-UI `priority`, `deadline`, `owner`), add kernel functions for photo tokens, provisional numbers, derived untested entries, section 8 order and the row 8 summary, publish seed v3 with recurring findings, and build the Points surface (`/relatorio/:id/pontos`) plus the point editor opened from an NC row and from an untested sheet.

## Boundaries & Constraints

**Always:**
- Story 6.6 in `_bmad-output/planning-artifacts/epics.md` (line ~1736) is the contract; `source-deltas.md` row 29 wins over mocks: priority, deadline, owner and the action-plan table have NO UI (no priority picker, no Prazo/Responsável fields, no "Ver tabela do plano de ação").
- Kernel owns every count, plural, status word and derived text (AD-1/AD-13); `apps/web` renders from IndexedDB and writes ops through the existing commit path only; `applyOp` stays the only reducer.
- Screens use the mock's class names from `prototype/screens/72-pontos.html` (`poa-list`, `point-of-attention-card`, `is-auto`, `is-editing`, `drag-handle`, `poa-body`, `poa-order`, `poa-title`, `poa-fields`, `poa-photos`, `poa-photos-meta`, `not-tested-band`, `not-tested-chip`, `chip-row`, `chip`, `observation-field`, `poa-edit-actions`, `btn-reason`, `sticky-action-bar`). Grep the mock, never read it whole. New `.frame-*` rules get their `app.css` translation (AGENTS.md "Mock container selectors").
- pt-BR copy: story AC wording first ("Criar", "Criar ponto de atenção", "Nenhum ponto de atenção.", "Ação recomendada"), then the mock verbatim; anything else `// authored:` in `apps/web/src/copy/pt-br.ts`.
- New op field paths bump `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` to 4 (same pattern as PR #39, comment in `contract/version.ts`) and get an api integration test through the sync route.
- Seed v3 is a new file beside `seed/v2.ts`, derived from v2; v1 and v2 stay byte-identical; `SEED_VERSION` becomes `'v3'`.
- Tap budget (`e2e/tap-budget.spec.ts`) and lost-tap race specs stay green.
- Playwright `@p0` specs drive the main ACs as a human (clicks, typing, keyboard, reload); secondary ACs `@p1` or unit tests.

**Never:**
- Do not touch the gallery surface, the photo import, caption composer, or Sumário row 7 (batch P2 owns them). Do not edit `sprint-status.yaml` or `epics.md`.
- No vision draft ("Rascunho pela foto", FR-75), no Dictation button (Epic 9), no "Duplicar" / "Adicionar abaixo" menu items, no section 8 DOCX rendering (Epic 7).
- Never store a derived entry; never write a literal photo number into text.
- No emoji; no Tailwind; no new component kit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tokens | text `"Ver [[foto:A]] e [[foto:B]] e [[foto:A]]"` | `extractPhotoRefs` -> `['A','B']` (first-seen order, unique) | malformed `[[foto:]]` / non-uuid is plain text |
| Tombstoned ref | point text cites photo whose file row has `removed_at` or is absent | `preIssue` row `{row:'section_8', severity:'pending', kind:'point_photo_removed'}` | one row per point |
| Untested block, no point | live equipment block with `sheet.not_tested` set | `derivedPoints` yields one entry after manual points, tree order, with reason label and justification (`text` for `outro`) | never stored |
| Suppressed | same block, and a live point `origin:'not_tested'` with same `equipment_id` | no derived entry for that block | block with null equipment_id is never suppressed |
| Re-tested | block `not_tested` cleared | derived entry disappears | - |
| Summary | 2 manual (1 without action), 3 derived | row 8 meta `"5 pontos · 1 sem ação · 3 não ensaiadas"` | 0 entries -> `"Nenhum ponto de atenção"`-style kernel text; singular "1 ponto", "1 não ensaiada" |
| Porto Seguro fixture | 4 manual + 3 stored `not_tested` points | `derivedPoints` = [] ; `sectionEightEntries` = 7 in stored order | - |
| Reorder | Alt+ArrowUp on card 2 | one `point/{id}/order_key` op, announcement, card is 1st, focus stays on it | first card: no-op |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts:426` -- `pointRowSchema`; add `action: nullableString.default(null)`, `priority: z.enum(['P0','P1','P2','P3','P4']).nullable().default(null)`, `deadline` (nullable date schema already used in file, default null), `owner: nullableString.default(null)`. Defaults keep old rows and the fixture parsing.
- `packages/domain/src/ops/path.ts:64,461` -- `POINT_FIELDS` derives from `entityKeys('point')` (check it picks new keys); `pointPath`, `pointFieldPath` exist.
- `packages/domain/src/contract/version.ts` -- bump to 4 with dated comment.
- `packages/domain/src/seed/{schema.ts,v2.ts,definitions.ts}` -- `reportSeedSchema` gains `recurring_findings: z.array({label,text}).default([])`; `definitions.ts` `SEED_VERSIONS` appends `v3`; `seed.test.ts` pins v1/v2 unchanged and v3 = v2 + findings.
- `packages/domain/src/relatorio/pre-issue.ts` -- `PreIssueKind` gains `points_sem_acao`, `point_photo_removed`; push rows for `row:'section_8'`.
- `packages/domain/src/relatorio/sumario.ts:53,150` -- `section_8` kind `pending-epic` -> `generated`; `metaOfSection` for `section_8` returns `pointsSummaryText`.
- `packages/domain/src/relatorio/progress.ts` -- `naoEnsaiadasText` exists (reuse its plural if it fits).
- `packages/domain/src/photos/caption.ts:25` -- `CAPTION_EQUIPMENT_WORDS` (equipment nouns for titles if useful).
- `packages/domain/src/ops/order-key.ts` -- `sortByOrderKey`, `orderKeyForMove`, `orderKeyAfter`, `initialOrderKey`.
- `packages/domain/fixtures/porto-seguro/op-log.ts:534` -- stored section 8 points incl. three `origin:'not_tested'` ones; must keep parsing.
- `apps/web/src/surfaces/templates/section-text-editor.ts` -- contenteditable with atomic `var-chip` nodes (render, serialize, insert at caret, delete chip as a unit): generalize or add a sibling for `photo-ref` chips.
- `apps/web/src/surfaces/templates/use-reorder.ts` + `reorder-controls.tsx` + `section-list.tsx` -- drag, Alt+Arrow, Subir/Descer and announce pattern to reuse.
- `apps/web/src/surfaces/ficha/checklist-section.tsx:31-40,315` -- NC row reserved slot next to `RowPhotoAction`; add "Criar ponto de atenção".
- `apps/web/src/surfaces/ficha/not-tested-band.tsx` -- untested sheet panel; add "Criar ponto de atenção" (origin `not_tested`).
- `apps/web/src/db/photo-store.ts` -- `PhotoTile`, `photoTilesOfBlock`; add a relatório-wide reader for the picker (do not change gallery code).
- `apps/web/src/components/photo-row.tsx` -- shared thumb/tile rendering.
- `apps/web/src/db/commit.ts:98,144` -- `commitOps`/`commitBatch`; `apps/web/src/db/drafts.ts` for unsaved editor text if its target type fits.
- `apps/web/src/app.tsx:133-165` -- add `/relatorio/:id/pontos` (back to Sumário). `apps/web/src/surfaces/relatorio/sumario-surface.tsx:180` -- `openable` adds `rowKey === 'section_8'`, open navigates to it. Leave section_7 untouched.
- `apps/web/src/components/gallery.test.tsx` -- register any new shared component.
- `apps/api` -- op application is generic; add `*.integration.test.ts` pushing `point` create + `point/{id}/action` through the sync route and pulling it back.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/entities.ts`, `ops/path.ts`, `contract/version.ts` -- point fields and contract 4 -- AC1 data model.
- `packages/domain/src/points/` (new: `refs.ts`, `derived.ts`, `summary.ts`, `index` exports via `src/index.ts`) --
  `PHOTO_TOKEN_RE`; `photoToken(id): string` (`[[foto:<id>]]`); `extractPhotoRefs(text): string[]`; `pointTextTokens(text): ({kind:'text',text}|{kind:'photo',id})[]`;
  `derivedPoints(snapshot): DerivedPoint[]` with `DerivedPoint = {block_id, equipment_id, title, reason_key, reason_label, justification: string|null}` (tree order = the section 9 order the kernel already uses for sheets; reason label/justification via `getSeed(block.seed_version...)`);
  `groupDerivedPoints(entries): {reason_key, justification, block_ids[]}[]` (the E3-A9 data-level merge rule: consecutive entries with the same reason and justification form one group; prose composition stays for Epic 7);
  `sectionEightEntries(snapshot)` (live points by `order_key`, then derived);
  `pointTitle(point, snapshot)` (linked equipment "TAG · cabine" style, else authored "Geral");
  `pointsSummary(snapshot)` -> `{total, semAcao, naoEnsaiadas}` and `pointsSummaryText` ("5 pontos · 1 sem ação · 3 não ensaiadas", parts omitted when 0, empty -> "Nenhum ponto de atenção"); `semAcao` = live `origin:'manual'` points with blank action; `naoEnsaiadas` = derived + live `origin:'not_tested'` points;
  `pointOrderText(i, n)` ("1 de 4"), `notTestedPointText(block, snapshot)` (prefill text for a point from an untested sheet = justification or typed text).
- `packages/domain/src/photos/numbering.ts` -- `numberPhotos(files): Map<string, number>` over live photo rows ordered `(captured_at, local_seq, id)`; plus `photoRefLabel(n)` "Imagem N" (mock). Cross-batch: P2 may add the same; keep one at merge.
- `packages/domain/src/seed/v3.ts` + schema/definitions -- recurring findings, labels/texts: "Ausência de placas de sinalização de segurança" -> mock 72-pontos line 207 text; "Diagrama unifilar desatualizado" -> line 208 text; "Chuva e umidade elevada" -> line 206; "Ensaios pendentes" -> line 209. `recurringFindings(seedVersion)` returns that version's list, else the current `SEED_VERSION`'s.
- `packages/domain/src/relatorio/{pre-issue,sumario}.ts` -- rows and row 8 meta; tests.
- Kernel unit tests for every row of the I/O matrix, incl. the Porto Seguro fixture snapshot.
- `apps/web/src/surfaces/points/` (new) -- `points-surface.tsx` (list, empty state "Nenhum ponto de atenção." + "Criar" in the sticky bar, heading "Pontos de atenção" with kernel counts, section-note verbatim minus the priority/table/draft sentences, derived `is-auto` cards with "Não ensaiado" band and "Abrir ficha ⟨TAG⟩" to `/relatorio/:id/ficha/:blockId`), `point-editor.tsx` (text contenteditable with photo-ref chips showing "Imagem N" from `numberPhotos`, "Textos rápidos" chip row inserting plain text at the caret, "Ação recomendada" field, "Fotos referenciadas" button opening a photo picker dialog of the relatório's live photos (tiles with number) that inserts a token at the caret, "Concluir" commits one batch: create op on first save, field ops for changed fields after; "Remover ponto" tombstones via ConfirmDialog), reorder (drag handle, Overflow "Subir · Descer" and "Remover", Alt+↑/↓, announce, focus follows card). Editing a manual card opens it inline as `is-editing`.
- `apps/web/src/surfaces/ficha/checklist-section.tsx`, `not-tested-band.tsx` -- "Criar ponto de atenção" opens the same editor in a Modal: from NC row prefilled with `equipment_id` of the block and a token per photo of the item; from untested sheet with `origin:'not_tested'`, `equipment_id` and `notTestedPointText`. On save, close and return focus to the invoking row/button.
- `apps/web/src/app.tsx`, `sumario-surface.tsx`, `copy/pt-br.ts` -- route and row 8 opening.
- `apps/api/src/...integration.test.ts` -- sync push/pull of the new point fields (E5-A6).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the E3-A9 bullet 4 entry (line ~695): append to its state that `derivedPoints`/`groupDerivedPoints` landed in Story 6.6 and the printed sentence stays open for Epic 7; add an entry for anything this story stubs, naming its owner.
- `e2e/points.spec.ts` -- `@p0`: create from Sumário row 8 empty state (type, chip, action, photo token via picker, reload keeps it, chip shows "Imagem N"), create from an NC row (photo linked, focus returns to row), untested sheet lists itself and a point created from it suppresses it, reorder by Alt+↑ and Overflow "Subir", row 8 meta text. `@p1`: remove + tombstoned-photo pre-issue, drag reorder.

**Acceptance Criteria:**
- Given a relatório with no points and no untested sheet, when the user opens Sumário row 8, then the Points surface shows "Nenhum ponto de atenção." and "Criar"; tapping "Criar" opens a card with text, "Textos rápidos", "Ação recomendada" and the equipment line, and "Concluir" stores one `point` create op.
- Given an NC row with a photo, when the user taps "Criar ponto de atenção" and saves, then the point carries the block's `equipment_id` and a `[[foto:<id>]]` token shown as an "Imagem N" chip, and focus returns to the NC row.
- Given the text field, when the user picks a photo in the picker or taps a recurring chip, then a token chip or the chip's plain text is inserted at the caret, and the stored text contains the token, never a number.
- Given three cards, when the user presses Alt+ArrowUp on the second or picks Overflow "Subir", then one `order_key` op is emitted, the move is announced, and the order survives reload.
- Given a sheet marked Não ensaiado, when the Points surface renders, then a read-only `is-auto` card appears after manual points with the reason and justification; after "Criar ponto de atenção" from that sheet is saved, the auto card is gone and the new point is in the list.
- Given 2 manual points (one with blank action) and 3 untested sheets, then Sumário row 8 reads "5 pontos · 1 sem ação · 3 não ensaiadas".
- Given `pnpm verify`, then it is green with tap-budget and lost-tap specs unchanged.

## Spec Change Log

## Review Triage Log

## Design Notes

- Open questions (conservative choice taken, listed in the PR): card title (mock's free "Título" is not in the story's entity; title = linked equipment else "Geral"); whether stored `not_tested` points count as "sem ação" (no: only manual points); the prose of a merged bullet 4 (kernel groups, Epic 7 writes the sentence); chips for relatórios on v1/v2 fall back to the current seed.
- Narrowings: explicit "Concluir" save instead of per-keystroke autosave (unsaved text kept in drafts if the store fits, else noted); no Duplicar/Adicionar abaixo; no priority/deadline/owner UI.
- The `photo-ref` chip mirrors `var-chip`: `<span class="var-chip photo-ref" contenteditable="false" data-photo="<id>">Imagem 12</span>`; serialize back to `[[foto:<id>]]`.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/points.spec.ts --project=desktop-chrome` -- green
- `docker compose --profile tools run --rm tools pnpm verify > /tmp/verify-s6p3.log 2>&1` -- exit 0 (orchestrator runs this once at the end)
