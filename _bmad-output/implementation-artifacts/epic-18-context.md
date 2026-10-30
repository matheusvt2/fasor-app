# Epic 18 Context: usage events, the funnel dashboard and the first production read

<!-- Compiled 2026-10-30 from epics.md Epic 18 (planned 2026-10-29, PR #211), the batch specs spec-epic-18-o18a.md and
spec-epic-18-o18b.md, PRs #212 and #213, the deploy log .scratch-prodfix/deploy-3b45e83c.log and the Playwright MCP
session on the smoke company of 2026-10-30. Current facts only. Edit freely. -->

## Goal

Matheus, 2026-10-29: "pode fazer a observabilidade. quero ver todo o funil, verificar pontos de possível melhoria de
experiência". Epic 18 records how the app is used without touching the op log (AD-28): one strict event contract in
the kernel, a capped queue on the device shipped with the sync cycle, `POST /api/telemetry` writing one JSON line per
event to the CloudWatch Logs group `/fasor/production/ux-events` (90 days), a dashboard and nine saved Logs Insights
queries, a runbook and the op-log friction read. Analysis and options: `backlog-2026-10-29-home-nav-and-telemetry.md` § 2.

## Stories, batches and merges

| Batch | Stories | Dev model | PR | Squash on main | Notes |
|---|---|---|---|---|---|
| o18b | 18.3 Seeing the funnel: dashboard, saved queries, runbook, friction read | opus · medium | #212 | `62bdd76c` | Built against the vocabulary of the epic and the literal group name, so it ran in parallel with o18a; D1 to D6 accepted |
| o18a | 18.1 The device records usage events and ships them with the sync; 18.2 The api receives them and writes them to CloudWatch | opus · high, opus · medium | #213 | `3b45e83c` | Kernel `contract/telemetry.ts`, Dexie v7 `ux_events`, `track()`, flush and `sendBeacon`, `data-telemetry` controls, route with the stdout and CloudWatch sinks, `telemetry.tf`, the Conta sentence |

Integrated gate on main `3b45e83c` (2026-10-30 02:26Z): `pnpm verify` green, lint 28.4 s, static 37.7 s, test:api
278.4 s, test:unit 199.1 s, test:e2e 1346.0 s (319 of 319), total 1823.5 s (`.scratch-prodfix/verify-main.log`).

## Deploy (2026-10-30, Matheus: "pode deployar")

`infra/bin/deploy` from the clean main checkout at `3b45e83c` with the `fasor-admin` login
(`.scratch-prodfix/deploy-3b45e83c.log`): images built for linux/amd64 and pushed; the migrate task ran on the new api
image (Terraform `-target` apply: 2 added, 1 destroyed); the full apply created the log group
`/fasor/production/ux-events` (retention 90 days), the `app_ux_events` IAM policy, the dashboard `fasor-production-ux`
(nine widgets) and the nine query definitions `fasor-production-ux/<key>`, and rolled the services with
`TELEMETRY_SINK=cloudwatch` and `TELEMETRY_LOG_GROUP=/fasor/production/ux-events` (15 added, 3 changed, 4 destroyed);
health up; production smoke 8 of 8 in 54.9 s; test company cleaned (task `ac8a679d`). No contract change: devices on
contract 28 keep working, and a device starts recording on its next load of the new bundle.

## First production read (2026-10-30, 09:27 to 09:40 local)

One Playwright MCP session on the smoke company only (`prodpass.sh reset`, cookie login, service worker, caches and
IndexedDB wiped so the device started fresh on the new bundle, `getUserMedia` rejected so "Ler visor" and "Tirar foto"
fell back to the file chooser), then `prodpass.sh cleanup` and the cookie file emptied.

- **Pipeline:** the first `POST /api/telemetry` answered 204 with the first sync cycle after the recovery screen; the
  queue carried `app_version = 3b45e83c…`; after each "Sincronizar agora" the `ux_events` table was empty.
- **The group** held 131 events from 2 devices (the smoke runner's and the session's) when the read ended. Every
  event name except `retry`, `undo` and `error` appeared (nothing failed during the session, so those three stay
  covered by the tests alone); screens seen: `login`, `recovery`, `home`, `templates`, `cadastros`, `setup`,
  `sumario`, `ficha`, `gallery` (the section-7 page), `points`, `sync`, `account`, plus `export` for the dialog.
- **The nine saved queries** all ran to `Complete` in Logs Insights over the production group, so the syntax the
  Terraform carries is accepted as written: `sort kind, outcome` (readings), `sum(strcontains(name, …))` (dialogs),
  `pct(duration_ms, 50)` and `pct(duration_ms, 95)` (waits), `count_distinct(…) by bin(1d)` (sessions per day).
  Results at the end of the read: funnel `sumario` 7 views in 7 sessions, `home` 5 in 3, `ficha` 5 in 5; dialogs
  `export` 5 opened, 4 cancelled; disabled taps `export / sumario.generate` 1; readings `display ok` 1 (the fixture
  `display-isolacao.jpg` read as 147 GΩ, the value `displays.json` expects) and `plate ok` 1 (the smoke's); syncs
  `ran` 34 and more; sessions per day 8 from 2 devices; errors none.
- **The Conta sentence** "Uso do aplicativo" is live with the wording o18a shipped (still open for Bruno's wording).

### What the read taught (rows in `deferred-work.md` § Epic 18 batch o18a)

1. **`preview` and `generate` waits time the request, not the document.** The first preview took 26.8 s on the
   screen (the PDF opened in a new tab) and 176 ms in the `waits` view, since `sync.tsx` times the request that
   enqueues the job. The `waits` view is right for `reading` (12.4 s, the OCR sidecar included) and `sync`
   (p50 488 ms, p95 1119 ms) and wrong for those two kinds until a story times them until the document opens. The
   narrowing row carries the numbers; the runbook's `waits` paragraph says so.
2. **The extra target names stand.** `photos.add`, `export.retry` and `toast.undo` appear in the `actions` query
   by target as any other name; the question row is struck.
3. **A disabled tap on a control below the dialog's fold closed the dialog in the test.** The pointer landed on the
   scrim, not the button (the box was outside the viewport); with the button scrolled into view the dialog stayed open
   and the `disabled_tap` was recorded. A test-driving fact, not a product one: the recipe scrolls the control into
   view before a raw pointer event.

## Still open

- ~~**Retrospective of Epic 18:** not run yet; the epic's own acceptance (the funnel readable in production) is met.
  Run it once Bruno has used the new bundle for some days, so the behavior check reads real sessions, or earlier on
  Matheus's word.~~ *(2026-10-30, Matheus: "pode seguir": retrospective run headless the same day,
  `epic-18-retro-2026-10-30.md`, machine verdict accepted-with-open-items. Integrated review (Blind Hunter, Edge Case,
  Verification Gap) over `f90dec0c..3b45e83c`: 40 findings, routed to the fix batches E18-A1 (code and tests) and E18-A2
  (Terraform and a telemetry step in the smoke), the docs and ledger item E18-A3, the spec reconciliation E18-A4,
  Matheus's decisions E18-A5, the gate rule E18-A6 and the first digest E18-A7. `test:e2e:full` on main `677415a8`:
  537 of 542, 4 known skips, one red (`photo-numbers.spec.ts` 7.2-E2E-001, a focus race at `closeDialog`) green alone.
  Second production read at about 12:00: 143 events from 4 devices on `3b45e83c`, two of them real devices outside the
  test pass (12 events), 48 of 49 telemetry posts 204 and the one 401 the revoked pass session, `ux_event_sink_failed` 0.)*
- **First monthly friction digest:** one month after this deploy (`docs/observability.md` § The monthly digest, template
  `test-artifacts/friction-digest-template.md`); the Home navigation measure of the 2026-10-29 analysis
  (`home.shortcut_templates` and `home.shortcut_cadastros` per session) is now collected.
- **Data sufficiency review (2026-10-30, Matheus: "coloque o usuário logado no dash; reveja se esses dados bastam"):** `backlog-2026-10-30-ux-data-sufficiency.md`: the events say where and how often, not how long, in what order, on which device or for whom; a user view joins E18-A2, the rest is a Story 18.4 draft waiting for his decisions (ids or names; one batch or after the first digest).
- **Matheus and Bruno:** the Conta sentence wording (LGPD), the Home decision (Sally's A + B), the per-user telemetry
  limit row (ECH-4), the GitHub release for the production tag (only on Matheus's word).

## E18-A2 part 1: the users view (2026-10-30, Matheus: "eu ainda não estou vendo os usuários logados pelo dashboard")

PR #220 (main `08566478`): the tenth view and saved query `users` on `fasor-production-ux` (sessions, devices, events,
first and last activity by `user_id` and `company_id`, `earliest`/`latest` on `received_at`; `min`/`max` on that string
field return nothing, found by a read-only run against the production group), `sessions_per_day` with distinct users,
and the read-only `apps/api/src/db/users-read-cli.ts` that maps the ids to people (one SELECT over `user`, `company` and
`session`; name, e-mail, sign-ins; migrate-task command override) with its integration test. Gate: lint 0 errors,
static, test:api 738 of 738, test:unit 4707 of 4707. Applied the same day from the merged main with
`infra/bin/tf production apply` on Matheus's "autorizo o apply" (1 added, 2 changed, 0 destroyed); the dashboard holds
ten widgets and the query definition `fasor-production-ux/users` exists. First read of the new view, last 30 days: two
users, the smoke user (15 sessions, 3 devices, 196 events) and one user of another company (4 sessions, 3 devices,
439 events); ids only, as designed. The CLI reaches production with the next `infra/bin/deploy`, on Matheus's go; until
then the ids are read beside the company ids (the smoke company's is `var.smoke_company_id`). The rest of E18-A2 (the
smoke company filtered out of the views, `sessions_per_day` by the device day, the tooling test binding the queries to
the kernel, the telemetry step in the smoke) stays open.
