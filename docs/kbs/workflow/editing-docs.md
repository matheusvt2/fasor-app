---
type: Process
title: Editing planning documents
description: Which document wins on conflict and how to change a sentence without deleting it.
tags: [workflow, docs, planning]
timestamp: 2026-09-30T00:00:00Z
sources: [AGENTS.md]
---
# Editing planning documents

- Precedence when documents disagree: `source-deltas.md`, then the architecture spine, then `EXPERIENCE.md` and `DESIGN.md`, then `prd.md`.
- Never delete or silently rewrite a sentence: strike the old text (`~~old~~`), add the new text beside it with the date, keep the reading order above. Example in the spine AD-27: CDK struck, Terraform added on 2026-09-29.
- `prd.md` predates decisions: it says "Laudo", has wrong nameplate field counts, an export-time section-9 option and a Home "Continue" card. Each override is a row in `_bmad-output/specs/spec-fasor/source-deltas.md`; never build from a PRD sentence that file overrides.
- Current prototype screens: `40-relatorio-overview.html` and `73-exportar.html`; the `key-*` versions for overview and export are superseded (MOCK-GUIDE v0.8).
- All new documents are English; Portuguese only for domain words, pt-BR UI copy and existing Portuguese READMEs.
- Keep [the KB](/index.md) in sync when a summarized document changes.
