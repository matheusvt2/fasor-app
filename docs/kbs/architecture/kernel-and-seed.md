---
type: Architecture Rule
title: Kernel single-home functions, field kinds, contract, seed and status table
description: AD-2, AD-11, AD-13, AD-21, AD-22. Open before writing any status, count, text, ordering, number parsing or seed-data change.
tags: [architecture, kernel, seed, contract, ad-2, ad-11, ad-13, ad-21, ad-22]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-2, ARCHITECTURE-SPINE.md#ad-11, ARCHITECTURE-SPINE.md#ad-13, ARCHITECTURE-SPINE.md#ad-21, ARCHITECTURE-SPINE.md#ad-22]
---
# Kernel, contract, seed

**AD-2, exists once in `packages/domain`**: `applyOp`, `mergePolicy`, `integrity`, `preIssue` (its rows are also the Sumário row statuses), `progress`, `sheetState`, `syncCounts`, `editedSince`, `instantiateTemplate`, `suggestConclusionPair`, `composeConclusion`, `suggestParecer`, `composeParecer`, `suggestTag`, `suggestNameplateCopy`, `compareSuggestion`, `parse`, `format`, `deadlineFromPriority`, `contextCaption`, `section11Instruments`, `calibrationCheck`, `groupForPrint`, `numberPhotos`, `extractPhotoRefs`, `resolveSection8`, `derivedPoints`, `statusTable`. If a task needs a status, count, text, order or verdict, extend this set. One integration test asserts the Sumário rows (Dexie) and the pre-issue list (Postgres) are identical for the Porto Seguro fixture.

**AD-11 field kinds**: every nameplate, SE and measurement field has `kind` in text, number, date, select, manufacturer, voltage_class. A number is `{raw: "3300", unit, state: measured|not_measured|empty}`, `raw` a decimal string with `.`; dates are ISO `YYYY-MM-DD` or `YYYY-MM`. pt-BR parsing (comma decimal, point thousands, `147G`) lives only in `domain/src/parse`; output formatting only in `domain/src/format`. No floats in storage. Derived cells (VAL CALCULADO) are never typed.

**AD-13 contract**: the client talks to the server only through routes typed in `packages/domain/src/contract` (zod request/response, `CONTRACT_VERSION` header): sync ops and pulls, file PUT/GET, generate, preview, reread, revisions download, auth, health. Error envelope `{code, message, details?}`; routes and families are append-only.

**AD-21 seed**: `BlockConfig = {block_type, subtype?, role?, sub_blocks, na_defaults}` is the only thing copied into a Block row, with a `seed_version`. Field definitions, checklists, table grammars, criteria, not-tested reasons and section boilerplate resolve through `getDefinition(seed_version, report_type, block_type)`; `packages/domain/src/seed` (v1, v2, v3...) is append-only so every shipped version still resolves. A criterion needs operator, value, unit, type and source. Source of truth for the seed is the decoded FO.SERV-03, not the UX counts.

**AD-22 status table**: `packages/domain/src/status` holds `(state, event) -> state`; every transition is a client op on `relatorio/status`, the server never writes it. Rascunho -setup_complete-> Em campo -generate-> Em revisão -issue-> Emitido; an edit in the `editedSince` family set moves Emitido back to Em revisão.
