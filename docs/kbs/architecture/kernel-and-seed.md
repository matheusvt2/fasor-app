---
type: Architecture Rule
title: Kernel, contract and seed (entry)
description: AD-2, AD-11, AD-13, AD-21, AD-22. What the domain kernel is and which file holds each part of it. Open first, then one of the linked files.
tags: [architecture, kernel, seed, contract, ad-2, ad-11, ad-13, ad-21, ad-22]
timestamp: 2026-11-28T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-2, ARCHITECTURE-SPINE.md#ad-11, ARCHITECTURE-SPINE.md#ad-13, ARCHITECTURE-SPINE.md#ad-21, ARCHITECTURE-SPINE.md#ad-22]
---
# Kernel, contract, seed

The kernel is `packages/domain`: pure TypeScript that imports only zod. It computes every status, count, text, order and verdict once; `apps/web` and `apps/api` render its results and never derive their own ([layers](/architecture/layers.md)). It also holds the typed contract between client and server and the seed data, versioned and frozen once shipped.

This file was split on 2026-11-28. Open the one file that matches the task:

- [kernel-rules](/architecture/kernel-rules.md) AD-2, AD-11, AD-13, AD-22: the functions that exist once, field kinds and number states, the contract and its version, the status table.
- [seed-versions](/architecture/seed-versions.md) AD-21: the seed rule, a table of v1 to v19, and what v4 to v10 added.
- [seed-v11-v12](/architecture/seed-v11-v12.md) vector groups, accuracy classes, the row test voltage, Inspeção de QGBT.
- [criteria-and-judgments](/architecture/criteria-and-judgments.md) seed v13: criteria tables, the manufacturer value, temperature correction, restrictions, applicability, tap rows, test help.
- [conclusion-points-parecer](/architecture/conclusion-points-parecer.md) the conclusion floor, no automatic points, the parecer, the conclusion paragraph.
- [seed-v14](/architecture/seed-v14.md) the `rules` flags, the v14 conclusion and section 10, the v14 lists, No-break de comando, the visit date and history note.
- [sheet-helpers](/architecture/sheet-helpers.md) every seed: the TAG and reuse key, the NC phrase, the point question, a rename, like with like.
- [seed-v15-v19](/architecture/seed-v15-v19.md) what v15 to v19 added and the deploy that froze each.
- [company-types](/architecture/company-types.md) learned options, company equipment types and versions, "nominal ± %".

Related: [measurement-table](/architecture/measurement-table.md) (seed v5 grammar), [rendering](/architecture/rendering.md) (print functions), [suggestions-and-reading](/architecture/suggestions-and-reading.md) and [files-and-photos](/architecture/files-and-photos.md) (readings, audio and AI answers), [domain-package](/code/domain-package.md) (folders).

## Canonical sources

- `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`: `grep -n '### AD-2 '`, `AD-11`, `AD-13`, `AD-21`, `AD-22`.
- `packages/domain/src/` (`index.ts` exports everything).
