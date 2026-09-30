---
type: Code Map
title: apps/web/src folders
description: Where web screens, components, local DB, sync and copy live.
tags: [code, web, react]
timestamp: 2026-09-30T00:00:00Z
sources: [apps/web/src]
---
# apps/web/src

- `surfaces/` one folder per screen area: `home`, `login`, `account`, `project`, `relatorio`, `ficha`, `photos`, `points`, `registries`, `templates`, `export`, `sync`; plus `app-shell.tsx`, `contract-outdated-surface.tsx`, `eviction-recovery-surface.tsx`.
- `components/` shared components built from the mock CSS (button, combobox, tri-state-control, suggestion-field, gallery, sync-badge, dialogs, tabs, toast...). Exported through `components/index.ts`.
- `db/` Dexie layer: `schema.ts`, `commit.ts` (write ops), `live.ts`, stores per area, `snapshot.ts`, `drafts.ts`, `file-store.ts`.
- `sync/` engine, client, policy, online. `files/` photo capture, encode, import, geolocation, rescue. `sw/` service worker. `api/` the only typed HTTP calls. `speech/` dictation. `input/` shared touch and pointer layer. `state/` derived state that only renders kernel results. `device/`.
- `copy/pt-br.ts` static surface copy; `copy/ui.ts` component chrome. `styles/` holds `tokens.css`, `components.css` (byte-identical to the mocks) and `app.css` (translations).

Screens are built from the mockups: [mockups-and-css](/ux/mockups-and-css.md). Rules: [ui-system](/architecture/ui-system.md), [ops-and-local-first](/architecture/ops-and-local-first.md).
