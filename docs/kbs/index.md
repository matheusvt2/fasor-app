---
type: Knowledge Base Index
title: Conforme (fasor) agent knowledge base
description: Entry point. Read this first, then open only the one or two concept files your task needs.
tags: [kb, okf, index]
timestamp: 2026-11-28T00:00:00Z
---
# Conforme (fasor) knowledge base

Format: Google Open Knowledge Format v0.1 (OKF). One concept per file, YAML front matter with `type`, Markdown links between concepts, an `index.md` per directory. Paths starting with `/` are relative to this directory (`docs/kbs`). Canonical documents stay where they are; every concept names them in `sources:` and in its body.

Conforme (codename fasor, earlier working name Releng) is a tablet-first, offline-first web app that captures medium-voltage substation test sheets and generates the FO.SERV-03 relatório as DOCX and PDF. It is in production: v0.17.0 (commit `c06428e0`, 2026-11-28), Epics 1 to 32 delivered. The repository is public (see [rules](/project/rules.md)).

## How to read this KB (token budget)

1. Read this file and the `index.md` of the one directory that matches your task. Each index line is a routing hint: do not open a file whose line does not match.
2. Open the concept file. Each is short and ends with the canonical source paths.
3. Open a canonical source only for the exact section you need. Never read the big files whole; use the table below.

| Canonical file | Size | How to read it |
| --- | --- | --- |
| `_bmad-output/planning-artifacts/epics.md` | 189 KB | The preface (requirements inventory, model and effort guide, definitions of ready and done), the epic list, the epics in work (31, 32) and the backlog. For a story, `grep -n '### Story 31.4' ` here first, then Read with offset and limit. Never whole. |
| `_bmad-output/planning-artifacts/epics-archive.md` | 1.26 MB | Epics 1 to 30 with every story, same headings. A story of Epics 1 to 30 is not in `epics.md`: `grep -n '### Story 5.3:' ` here, then Read with offset and limit. Never whole. |
| `.../architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` | 165 KB | Read the AD you need via `/architecture/decisions.md`, then grep `### AD-n`. |
| `_bmad-output/specs/spec-fasor/SPEC.md` | 40 KB | Capabilities CAP-1 to CAP-28 at lines 28-141; grep `CAP-n` or `FR-n`. |
| `_bmad-output/specs/spec-fasor/source-deltas.md` | 194 KB | Overrides older documents. Its "Index by topic" at the top groups the rows; then grep the topic or the date. Never whole. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | 89 KB | Status of every epic and story, and the open and in-progress action items; the only place statuses live. Grep the key; never whole. |
| `_bmad-output/implementation-artifacts/sprint-status-archive.yaml` | 187 KB | Done action items (cut out of the file above on 2026-11-24) and the full original comments of shortened status lines. History only; the BMAD scripts do not read it. |
| `_bmad-output/implementation-artifacts/deferred-work.md` | 178 KB | The ledger of open, partially closed and in-progress carry-over rows, one section per story or batch. Grep the story, batch or topic; never whole. Closed rows are in `deferred-work-archive.md` (577 KB) under the same headings. |
| `_bmad-output/implementation-artifacts/epic-NN/` | one folder per epic, `epic-01` to `epic-31` | The built records of one epic: `epic-N-context.md`, `spec-*.md` per story or batch, `epic-N-retro-*.md`. `ls` the folder, open one file. A new story's spec is written at the folder's root and moves into its epic's folder when the epic closes. |
| `_bmad-output/implementation-artifacts/general/` | 30 files | Records of no single epic (review-fix batches, production-pass fixes, test-speed chores, backlogs). `ls`, then open one. |
| `AGENTS.md` | 19 KB | Already in your context. Do not re-read. |

Sizes measured with `wc -c` on 2026-11-28.

## Directories

- [project/](/project/index.md) what the product is, hard rules, vocabulary, what ships when.
- [architecture/](/architecture/index.md) the 30 decisions (AD-1 to AD-30) grouped by topic, the layer rules, the kernel and the seed versions.
- [code/](/code/index.md) where things live in the monorepo.
- [workflow/](/workflow/index.md) running the stack, the merge gate, e2e tests, story delivery, editing planning documents.
- [planning/](/planning/index.md) epics and stories map, where each planning artifact is.
- [ux/](/ux/index.md) mockups, CSS translation rules, where pt-BR copy goes.

Maintaining the KB: [maintaining](/workflow/maintaining-the-kb.md). Change history: [log](/log.md) holds the entries from 2026-11-01; older ones are in [log-archive](/log-archive.md).
