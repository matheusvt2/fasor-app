---
type: Directory Index
title: Architecture
description: Routing table for the 27 architecture decisions (AD-1 to AD-27), grouped by topic.
tags: [architecture, index]
timestamp: 2026-09-30T00:00:00Z
---
# Architecture

- [layers](/architecture/layers.md) the four packages, allowed dependency arrows, what each layer may and may not compute. Open before adding any import or function.
- [ops-and-local-first](/architecture/ops-and-local-first.md) AD-1, AD-3, AD-4, AD-20: UI reads IndexedDB, every write is an op, applyOp, ids, soft delete. Open for any write path or new entity.
- [sync](/architecture/sync.md) AD-8, AD-9, AD-10, AD-24: sync cycle, rejection, rebase, offline shell, session, tenant scoping. Open for sync, auth or multi-tenant work.
- [kernel-and-seed](/architecture/kernel-and-seed.md) AD-2, AD-11, AD-13, AD-21, AD-22: what must live once in the domain package, field kinds, contract, seed versions, status table.
- [data-model](/architecture/data-model.md) AD-5, AD-6, AD-18, AD-19, AD-25: ownership, location tree, sheet state, registry references, equipment scope.
- [files-and-photos](/architecture/files-and-photos.md) AD-7, AD-17: file entity, upload durability, variants, photo time, coordinates and numbering.
- [suggestions-and-reading](/architecture/suggestions-and-reading.md) AD-12, AD-14: Suggestion lifecycle, reading pipeline, OCR and LLM providers.
- [rendering](/architecture/rendering.md) AD-15, AD-16, AD-26: snapshot, generate job, revisions, print order, section 8 tokens.
- [ui-system](/architecture/ui-system.md) AD-23: mockup CSS as design system, React Aria.
- [infra-aws](/architecture/infra-aws.md) AD-27: containers, AWS services, Terraform, cost ceiling.
- [decisions](/architecture/decisions.md) AD number to file lookup, one line each. Open when a task names an AD-n.

Canonical: `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` (69 KB). Read one AD with `grep -n '### AD-7'` and a limited Read.
