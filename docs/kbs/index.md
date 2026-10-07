---
type: Knowledge Base Index
title: Releng (fasor) agent knowledge base
description: Entry point. Read this first, then open only the one or two concept files your task needs.
tags: [kb, okf, index]
timestamp: 2026-09-30T00:00:00Z
---
# Releng (fasor) knowledge base

Format: Google Open Knowledge Format v0.1 (OKF). One concept per file, YAML front matter with `type`, Markdown links between concepts, an `index.md` per directory. Paths starting with `/` are relative to this directory (`docs/kbs`). Canonical documents stay where they are; every concept names them in `sources:` and in its body.

Releng is a tablet-first, offline-first web app that captures medium-voltage substation test sheets and generates the FO.SERV-03 relatório as DOCX and PDF. The repository is public (see [rules](/project/rules.md)).

## How to read this KB (token budget)

1. Read this file and the `index.md` of the one directory that matches your task. Each index line is a routing hint: do not open a file whose line does not match.
2. Open the concept file. Each is short and ends with the canonical source paths.
3. Open a canonical source only for the exact section you need. Never read the big files whole; use the table below.

| Canonical file | Size | How to read it |
| --- | --- | --- |
| `_bmad-output/planning-artifacts/epics.md` | 308 KB | `grep -n '### Story 5.3' ` then Read with offset and limit. Never whole. |
| `.../architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` | 69 KB | Read the AD you need via `/architecture/decisions.md`, then grep `### AD-n`. |
| `_bmad-output/specs/spec-fasor/SPEC.md` | 33 KB | Capabilities CAP-1 to CAP-26 at lines 28-134; grep `CAP-n` or `FR-n`. |
| `_bmad-output/specs/spec-fasor/source-deltas.md` | 23 KB | Overrides older documents; grep the topic. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | small | Status of every epic and story; the only place statuses live. |
| `_bmad-output/implementation-artifacts/spec-*.md` | per story | The built record of one story; open by story number. |
| `AGENTS.md` | 10 KB | Already in your context. Do not re-read. |

## Directories

- [project/](/project/index.md) what the product is, hard rules, vocabulary, what ships when.
- [architecture/](/architecture/index.md) the 27 decisions (AD-1 to AD-27) grouped by topic, and the layer rules.
- [code/](/code/index.md) where things live in the monorepo.
- [workflow/](/workflow/index.md) running the stack, the merge gate, e2e tests, story delivery, editing planning documents.
- [planning/](/planning/index.md) epics and stories map, where each planning artifact is.
- [ux/](/ux/index.md) mockups, CSS translation rules, where pt-BR copy goes.

Maintaining the KB: [maintaining](/workflow/maintaining-the-kb.md). Change history: [log](/log.md).
