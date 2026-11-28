---
type: Directory Index
title: Architecture
description: Routing table for the 30 architecture decisions (AD-1 to AD-30), grouped by topic, and for the kernel and seed files.
tags: [architecture, index]
timestamp: 2026-11-28T00:00:00Z
---
# Architecture

- [layers](/architecture/layers.md) the four packages, allowed dependency arrows, what each layer may and may not compute. Open before adding any import or function.
- [ops-and-local-first](/architecture/ops-and-local-first.md) AD-1, AD-3, AD-4, AD-20: UI reads IndexedDB, every write is an op, applyOp, ids, soft delete. Open for any write path or new entity.
- [sync](/architecture/sync.md) AD-8, AD-9, AD-10, AD-24: sync cycle, rejection, rebase, offline shell, session, tenant scoping. Open for sync, auth or multi-tenant work.
- [kernel-and-seed](/architecture/kernel-and-seed.md) short entry: what the kernel is and which of the nine files below holds what. Open when unsure which one to read.
- [kernel-rules](/architecture/kernel-rules.md) AD-2, AD-11, AD-13, AD-22: the functions that exist once in the domain package, field kinds and number states, the typed contract and its version, the status table. Open before any status, count, text, parsing or route work.
- [seed-versions](/architecture/seed-versions.md) AD-21: the seed rule, a table of v1 to v19 with the file that describes each, and what v4 to v10 added. Open before any seed-data change.
- [seed-v11-v12](/architecture/seed-v11-v12.md) vector groups and the ratio factor, TC and TP accuracy classes, the row test voltage, Inspeção de QGBT.
- [criteria-and-judgments](/architecture/criteria-and-judgments.md) seed v13: criteria tables, the manufacturer value, temperature correction, restrictions and prerequisites, applicability, tap rows, test help. Open before changing how a reading is judged.
- [conclusion-points-parecer](/architecture/conclusion-points-parecer.md) the conclusion floor and effective pair, no automatic points of attention, the parecer, the conclusion paragraph. Open before touching a conclusion, a point or the parecer.
- [seed-v14](/architecture/seed-v14.md) the seed-level `rules` flags, the layout lock, the v14 conclusion and section 10, the v14 lists, No-break de comando, the visit date and history note in print.
- [sheet-helpers](/architecture/sheet-helpers.md) every seed: `suggestTag` and the reuse key, the NC phrase and the point question on leaving NC, a TAG rename, like with like in the history rules.
- [seed-v15-v19](/architecture/seed-v15-v19.md) what v15, v16, v17, v18 and v19 added, their contract numbers and the deploy that froze each. Open for the current seed.
- [company-types](/architecture/company-types.md) learned NC phrases and manufacturers, company equipment types and their versions, "nominal ± %". Open for the type editor or Cadastros.
- [measurement-table](/architecture/measurement-table.md) Story 14.5, seed v5: the measurement-table grammar, the library type Chave de transferência automática, its keys, the `sheet/test/value` family, what is not built. Open for the CTA sheet or another type on that grammar.
- [data-model](/architecture/data-model.md) AD-5, AD-6, AD-18, AD-19, AD-25: ownership, location tree, sheet state, registry references, equipment scope.
- [files-and-photos](/architecture/files-and-photos.md) AD-7, AD-17: file entity, upload durability, variants, photo time, coordinates and numbering.
- [suggestions-and-reading](/architecture/suggestions-and-reading.md) AD-12, AD-14, AD-30: Suggestion lifecycle, reading pipeline, OCR and LLM providers, voice input.
- [rendering](/architecture/rendering.md) AD-15, AD-16, AD-26: snapshot, generate job, revisions, print order, section 8 tokens.
- [ui-system](/architecture/ui-system.md) AD-23: mockup CSS as design system, React Aria.
- [usage-events](/architecture/usage-events.md) AD-28, Epic 18: the usage-event contract, the device queue `ux_events`, `POST /api/telemetry`, its sink and the ux-events log group. Open for anything that records how the app is used.
- [roles-and-permissions](/architecture/roles-and-permissions.md) AD-29, Epic 26: the twelve keys, the seeded roles, `can`, the map from ops and routes to keys, `op_forbidden`, `403 forbidden`, `401 user_inactive`. Open for anything that asks what a user may do.
- [infra-aws](/architecture/infra-aws.md) AD-27: containers, AWS services, Terraform, cost ceiling.
- [decisions](/architecture/decisions.md) AD number to file lookup, one line each. Open when a task names an AD-n.

Canonical: `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` (165 KB). Read one AD with `grep -n '### AD-7'` and a limited Read.
