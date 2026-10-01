---
type: KB Guide
title: Maintaining this knowledge base
description: Rules for adding or changing concepts so the KB stays small, true and cheap to read.
tags: [kb, workflow]
timestamp: 2026-09-30T00:00:00Z
---
# Maintaining the KB

- The KB is a map, not a copy. A concept holds the rule and the pointer; the canonical document holds the detail. If you paste more than a short rule, link instead.
- One concept per file, target under 60 lines. Front matter: `type` (required), `title`, `description` (one line that says when to open the file), `tags`, `timestamp`, `sources` (repo paths, custom field).
- Every concept is listed in its directory `index.md` with a one-line routing hint. A file not in an index is invisible to agents.
- Links are bundle-root paths such as `/architecture/sync.md`. Link to statuses, never copy them: story and epic status lives only in `sprint-status.yaml`.
- Policy applies here too: public repository, no client material from `docs/context/` or `docs/media/`, no competitor names from `docs/concorrentes/`, no emoji, English text with pt-BR domain words.
- When a planning document changes, update the concept that summarizes it in the same change and add a line to [log](/log.md). Planning documents follow the strike-through rule in [editing-docs](/workflow/editing-docs.md).
- Facts about files can rot: a concept that names a path is checked with `ls` before you rely on it.
