# QA D-1 re-run, prod profile (2026-09-22)

Setup: `docker compose --profile prod up -d api-prod` on http://localhost:12001, Chromium (Playwright MCP, fresh context), user a@teste.local. Pushes blocked by aborting POST /api/* (auth and account excluded); one pending op seeded into the device outbox. Build A = `build:e2e` (index-YyQQjqnb.js, shell 2ac46b047af9), build B = `build` (index-CTbt6NIo.js, shell 4aa10bcfd073). A first run with the builds in the opposite order gave the same result (`d1-reopen-pending.png`).

| Step | Observed | Expected | Result |
|------|----------|----------|--------|
| Signed in on A, op pending | "1 pendente"; pin `{"shell":"releng-shell-2ac46b047af9"}` | pin names A | pass |
| B deployed, `registration.update()` | B waiting; caches A, hold, B | B waits | pass |
| CDP `ServiceWorker.stopAllWorkers`, reload | index-YyQQjqnb.js (A), "1 pendente" | old shell | pass |
| Close the app tab, reopen | B active (nothing waiting), index-YyQQjqnb.js (A) served, caches A, hold, B | old shell with ops pending (D-1) | pass (`d1-run2-reopen-pending.png`) |
| Pushes unblocked, outbox drains | "Sincronizado", pin removed, open tab stays on A | hold released | pass |
| Close, reopen | index-CTbt6NIo.js (B), only cache B left | new shell on next launch | pass (`d1-run2-next-launch-after-drain.png`) |
