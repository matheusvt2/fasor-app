# Backlog analysis, 2026-10-29: Home navigation at scale and interaction telemetry on AWS

Matheus asked for both on 2026-10-29, after the production pass fix batches merged (PRs #204, #205) and v0.4.0+fixes (`94ca957a`) deployed:

> "quando tivermos vários relatórios, a rolagem para templates e cadastros vai ser impactada, atritando com a experiência do usuário, chame a Sally para discutir isso"

> "temos que registrar todo tipo de interação que o usuário estiver fazendo com a ferramenta, para conseguir ver pontos de atrito e melhoria do workflow. Como poderíamos fazer isso usando o ambiente AWS? coloque junto da análise da Amelia"

Neither is a story yet. Section 1 is Sally's (UX) reading with options; section 2 is Amelia's (dev) technical analysis with a recommendation; section 3 lists the decisions Matheus and Bruno own. Rows pointing here go into `deferred-work.md` ("Deferred from: Matheus's asks of 2026-10-29") once fix batch fxrm, which edits that file, has merged.

## 1. Home navigation with many relatórios (Sally)

### What the design says today

- `20-home.html` and EXPERIENCE.md order the Home as: status chips ("Relatórios por status": Rascunho, Em campo, Em revisão, Emitido, each a filter button), then the "Relatórios" card list (one `.relatorio-card` per relatório, about 150 to 180 px tall at tablet width, with "Continuar" and "Ver sumário"), then "Atalhos": the two shortcut cards Templates and Cadastros (DESIGN.md § Components "Shortcut card": 2-up grid of 56 px cards, name plus a `meta` sub-line). The Home renders no rail (`data-rail="false"`); the header carries the wordmark, the Sync badge and "Conta".
- Production on 2026-10-29 (smoke company, 2 relatórios) already puts the shortcuts below the fold at 390 px; every relatório adds one card above them.

### Who is hurt, and when

- Bruno at the office (notebook or tablet, before a job): composes templates and keeps Cadastros (clientes, instrumentos, fabricantes, frases de NC). These are the two destinations under the list, and the office work is exactly when the list is longest (every emitted relatório of the year stays on Home).
- The field engineer rarely opens Templates or Cadastros on site; for them the list itself is the destination, and the "Continuar" card does its job.
- So the friction grows with the yearly volume of relatórios (Bruno's answer on volume decides the urgency: ten a year is a nuisance, fifty is a blocker) and lands on the office persona.

### Options

| Option | Change | Keeps the mocks? | Trade-off |
| --- | --- | --- | --- |
| A. The chips already filter: make Home short by default | Home shows the active relatórios (Rascunho, Em campo, Em revisão) and folds Emitido behind its chip, "Emitido, N relatórios" (a tap expands them in place or opens the filtered list). An emitted relatório is read, not worked, so it leaves the working list. | Yes: chips and cards unchanged, one folded state added | Hides the emitted ones one tap away; the "Continuar" card never hides. Does not help while many relatórios are active at once. |
| B. Shortcuts above the list or in the header | Move "Atalhos" above "Relatórios" (two 56 px cards cost one row), or turn them into two icon buttons in the header beside Conta (Templates, Cadastros), reachable from every screen. | Partly: the shortcut card stays; its position changes (EXPERIENCE.md and the mock get a dated note) | The header is already busy on phone (wordmark, Sync badge, Conta); a header entry changes the shell for every surface. Above-the-list cards push the first relatório down by about 72 px. |
| C. Sticky bottom bar on phone and tablet | A persistent bottom bar: Início, Templates, Cadastros, Conta. | No: a new shell element, not in DESIGN.md | Classic and discoverable, but steals 56 px of a sheet-heavy app and competes with the sheet's own Sticky action bar. |
| D. Search and sort over the list | A search field and a sort control once the list passes about eight cards; the shortcuts stay where they are. | Yes, additive | Solves finding a relatório, not reaching Templates and Cadastros. Useful on its own later. |

### Sally's recommendation

A plus B (the "above the list" variant, not the header): Home opens on the active work, Emitido folds behind its chip with a count, and the two shortcut cards sit right under the status chips, so Templates and Cadastros are one tap from the top on every device, whatever the list length. Record the change as a dated amendment to EXPERIENCE.md § Home and to `20-home.html` (MOCK-GUIDE), keep D as the next step when the active list itself gets long, and do not add a bottom bar (C) to a product whose main screen is a sheet.

Measure before and after with section 2: taps on Templates and Cadastros per session, scroll depth before that tap, time from Home load to the first navigation.

### Questions for Bruno

- How many relatórios are active at the same time, and how many a year? Does an emitted relatório ever get reopened from Home, or only from its documents?
- Do you compose templates and keep Cadastros on the notebook or on the tablet?

## 2. Recording every interaction to find friction, on AWS (Amelia)

### What exists

- The op log already records every data edit with actor, device and timestamp (`ops`: `actor_id`, `device_id`, `client_ts`, `path`), so "how long a sheet took", "what was re-edited", "which fields are typed after a failed reading" are answerable today with read-only SQL on the production database (through a one-shot ECS task, as the smoke-seed and tombstone CLIs run). It records nothing about navigation, cancels, retries, taps on disabled controls, waits, dialogs opened and abandoned, or failed syncs: the friction signals.
- CloudWatch Logs holds the api, ocr, caddy, migrate and smoke groups (request level, 14 days). Nothing from the web app reaches AWS today except through the api's requests.

### Constraints that shape the design

- Offline-first: a tablet in a substation has no signal for hours. Events must queue on the device and ship later, so any client SDK that posts live and drops offline events (CloudWatch RUM's web client, most analytics SDKs) loses exactly the field sessions we want.
- AD-1 to AD-3: `apps/web` writes only ops into the outbox. Telemetry is not part of the relatório record and must never enter the op log (it would land in every device's history and in the documents' provenance). It needs its own local store and its own endpoint, recorded as an architecture amendment (an AD note: "a second local write, events, outside the op log").
- LGPD: these are employees' interactions. Record opaque ids (user, device, company, relatório, block), screen and control names, durations and outcomes; never a typed value, a caption, a TAG or a photo. Keep 90 days. Say so in Conta and in the terms.
- Cost ceiling USD 100 per month, today at 83.27 (`infra/README.md`). Volume is small: ten users, a few hundred events a day each, about 300 bytes an event, under 50 MB a month.

### Options on AWS

| Option | How | Cost at our volume | Verdict |
| --- | --- | --- | --- |
| 1. CloudWatch Logs group written by the api | The device queues events in IndexedDB and flushes them with the sync cycle (or `sendBeacon` on `visibilitychange`) to `POST /api/telemetry`; the api validates them (kernel zod schema) and writes one JSON line per event to a dedicated log group `/fasor/production/ux-events` (Terraform, 90 days retention). Analysis with CloudWatch Logs Insights (funnels per screen, cancel rates, time between events, p50/p95 waits), queries kept in the repo. | Ingestion USD 0.50 per GB: cents a month. Logs Insights USD 0.005 per GB scanned: cents. A dashboard beyond the three free ones is USD 3. | **Recommended.** Fits the offline queue, the budget and the policy (one more log group in `infra/`); no new service, no SDK, no cookie. |
| 2. Same client queue, S3 plus Athena | The api (or a Firehose subscription on the log group) lands JSON lines in S3 under `ux-events/dt=YYYY-MM-DD/`; Athena queries them with SQL; QuickSight is out (USD 24 per author). | S3 under USD 0.10; Athena USD 5 per TB scanned: cents. Firehose has a minimum around USD 0.03 per GB plus a per-record floor. | Good second step when Logs Insights queries get repetitive or history must exceed 90 days. Not first. |
| 3. CloudWatch RUM | The managed web client: page views, web vitals, JS errors, custom events; an identity pool and a cookie. | USD 1 per 100 000 events: under USD 1. | Rejected as the primary channel: no offline buffering across page unloads, a third-party-looking cookie to explain, and it does not see our domain events. Could be added later for web vitals alone. |
| 4. Amazon Pinpoint | Mobile analytics and campaigns. | - | No: AWS announced its end of support for 2026-10-30. |
| 5. Postgres table `ux_events` | The api inserts into the production database; SQL analysis. | Storage only. | Simplest to query, but grows the record's database with analytics, needs a purge job, and mixes two retention regimes. Acceptable only as a stopgap. |
| 6. Self-hosted PostHog or Matomo | Another container or instance. | A second `t3a` instance breaks the ceiling. | No. |

### Recommended design (option 1)

- Kernel (`packages/domain`): the event contract. One zod schema `UxEvent {ts, session_id, device_id, user_id, company_id, app_version, screen, name, target?, outcome?, duration_ms?, relatorio_id?, block_id?}` and a closed taxonomy of names: `screen_view`, `action` (a tap on a named control), `dialog_open`, `dialog_cancel`, `disabled_tap`, `wait` (with `duration_ms`: a reading, a sync, a generation), `retry`, `undo`, `sync_result`, `reading_result`, `error` (code only). No free text anywhere; the schema refuses unknown names.
- Web: an `events` table in IndexedDB beside the outbox (cap 5 000 rows, oldest dropped), one `track()` helper called from the shell router (screen views), React Aria `onPress` wrappers for named controls, the capture sheet, the reading cells and the sync engine (results and waits). Flush: with every sync cycle while online, and `navigator.sendBeacon` on `visibilitychange: hidden`; batches of up to 200; a 2xx deletes the batch, anything else keeps it. Never blocks a user action; never throws into the UI.
- Api: `POST /api/telemetry` behind the session, validates against the kernel schema, stamps `received_at` and the server's `user_id` and `company_id` (never trusts the body's), writes JSON lines to the `ux-events` log group through the existing logger with a dedicated stream, or `PutLogEvents` directly. A 429 per device above 1 000 events per minute.
- Infra (Terraform only): the log group with 90 days retention, the api task's `logs:PutLogEvents` on that group, a `queries/` folder with the saved Logs Insights queries (funnel per screen, cancel rate per dialog, p95 wait per kind, disabled taps per control, events per session), and a cost row (about USD 0.10 a month).
- Reading the data: a monthly "friction digest" in `_bmad-output/test-artifacts/` produced by running the saved queries (the coordinator, read-only CLI), listing the top cancels, retries, disabled taps and waits, each with the screen and control; Sally reads it against EXPERIENCE.md.
- Today, before any code: run a read-only query on the op log for the first friction read (time between the first and last op of each sheet, fields edited more than once, "Digitar" after a failed reading) and attach it to the digest's first issue.

### Stories this would become (for `epics.md`, after Matheus's go)

1. Kernel event contract and web queue with flush on sync and `sendBeacon` (e2e: events queue offline and ship on "Sincronizar agora"; no event carries text).
2. Api endpoint and the Terraform log group, with the LGPD note in Conta and the terms.
3. Query pack and the first monthly friction digest; the Home measures of section 1.

## 3. Decisions owned by Matheus and Bruno

- Section 1: option A plus B as Sally recommends, or another mix; Bruno's volume answers.
- Section 2: approve the architecture amendment (a telemetry store outside the op log) and the LGPD wording; approve the three stories for a coming epic.
- Also on 2026-10-29 (separate batch `fxrm`): the 2026-10-15 test data in Bruno's company is removed by a server CLI, because the app has no "Remover" for a relatório or an obra; whether users should get one is a product question for Bruno.
