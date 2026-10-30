# Are the usage events enough to find UX friction? (2026-10-30)

Matheus, 2026-10-30, during the Story 19.2 build: "legal colocar no dash de acompanhamento o usuário logado. Reveja também se esses dados são suficientes pra você achar problemas de UX e sugerir melhorias." This note answers both: what the Epic 18 events and the nine views can and cannot tell a UX reader, and the smallest additions that close the gaps. Decisions are Matheus's (§ 4).

## 1. What the data answers today

One strict event (`packages/domain/src/contract/telemetry.ts`): `name` (12 kinds), `screen` (19), `target` (a control name), `kind`, `outcome`, `duration_ms`, `relatorio_id`, `block_id`, `session_id`, `device_id`, `app_version`, `ts`, plus `received_at`, `user_id` and `company_id` stamped by the api. Nine views (`infra/production/observability.tf`, read in `docs/observability.md`).

| Question a UX reader asks | Answered today | How |
|---|---|---|
| Where do people go, and where do they stop? | yes, per screen | `funnel` (views and sessions per screen) |
| What do they press, retry, undo? | yes, per control | `actions` by screen and target |
| What do they open and give up on? | yes, for six dialogs | `dialogs` opens against cancels |
| Where do they press something that does nothing? | yes | `disabled_taps` |
| How long do they wait? | reading and sync yes; preview and generate only the request | `waits` p50 and p95 (ledger row for the document wait) |
| Which readings fail? | yes | `readings` by kind and outcome |
| Does the sync work in the field? | yes | `syncs` by result |
| How many sessions and devices a day? | yes | `sessions_per_day` |
| Which errors reach the user? | kernel codes yes; validation refusals typed in a field no | `errors` by screen and kind |
| How long did a sheet take, what was re-edited, what was typed after a failed reading? | yes, from the op log | the friction read CLI (`apps/api/src/db/friction-read-cli.ts`) |

## 2. What it cannot answer, and the smallest addition that would

| Gap | Why it matters for UX | Smallest addition (kernel first, Epic 18's rule) |
|---|---|---|
| **Who.** `user_id` is an opaque uuid; no view groups by user and nothing maps ids to people. | With three engineers, a friction pattern is often one person's habit or one device's problem; today the reader cannot tell them apart. | A tenth view "Sessions and events by user" (`stats count_distinct(session_id), count(*), max(received_at) by user_id, company_id`) and a read-only CLI that prints `id · name · email` per company for the digest (runbook line). Stamping the display name into the event is possible on the api side, but it puts an employee's name in a 90-day log and changes the Conta sentence: Matheus decides (§ 4). |
| **How long each step takes.** `screen_view` has no duration; nothing says how long a ficha, the Sumário or the Home stayed open. | Time on screen is the first friction signal (a ficha opened for 3 s and left; a Home scanned for 40 s before a tap). | `screen_view` gains `duration_ms` written when the screen is left (route change or tab hidden), and `from` (the previous screen, closed list). Views: time per screen p50 and p95; "Home to first navigation" (Sally's measure, today only derivable by hand). |
| **Paths.** Which sequence led to a cancel, an error or a disabled tap. | A cancel after Home → Sumário → export is a different problem from one after ficha → export. | With `from` on `screen_view` and a saved query per session (`sort session_id, ts`), plus "cancels by preceding screen" and "A → B → A loops within 10 s". |
| **Hesitation.** Time from a screen opening to its first action. | Long gaps before the first tap mark screens people do not understand. | Derivable once durations and paths exist; one saved query. |
| **Device and context.** No viewport, platform or online state on the events. | Phone at 390 px and desktop at 1280 px are different products; offline friction looks like slowness. | `session_start` gains closed fields `viewport` (`phone`, `tablet`, `desktop`), `standalone` (installed or browser) and `online`; views by viewport. |
| **Which tile, which size.** All tiles share `home.status_chip`, the chips `home.page_size` (Story 19.2 review BH-4). | The Home decision needs the Emitido presses and the sizes picked. | Targets per tile and per size appended to `UX_ACTION_TARGETS` (ledger row of the 19.2 review). |
| **Validation refusals.** "Número não reconhecido" and the like are not kernel error codes. | Typed-value friction (the production pass found one, G4) never reaches the `errors` view. | An `input_refused` event with the field's `data-telemetry` as target and the refusal code as `kind` (closed list). |
| **The document wait.** `preview` and `generate` time the request. | The 27 s the engineer waits is the number that matters. | Ledger row (Epic 18 o18a); time until the PDF or DOCX opens. |
| **Scroll depth on Home.** Not an event. | Sally's measure; with Stories 19.1 and 19.2 the Home is short again. | Wait: not worth an event unless the digest shows Home friction. |

What stays out on purpose: free text of any kind (typed values, captions, TAGs, names), per-keystroke events, mouse movement, screen recordings. AD-28 and the LGPD stance hold.

## 3. Verdict

The data finds **where** friction is (screen, control, dialog, failed reading, disabled tap, error code) and **how often**; it does not yet find **how long** a step takes, **in what sequence**, **on which device**, or **for whom**. Those four are the difference between "the export dialog is cancelled a lot" and "on the phone, after opening the Sumário from Home, Bruno opens the export dialog and leaves it in two seconds". The additions in § 2 are small (three fields, two events, a handful of targets, a CLI, about six saved queries) and all kernel-first.

## 4. Decisions for Matheus

1. **The user on the dashboard:** ids with a mapping CLI (recommended; the Conta sentence stands), or the display name stamped by the api (the Conta sentence and the LGPD stance change; Bruno should know).
2. **Story 18.4 "The events say how long, in what order, on what and for whom"** with the § 2 additions, built as one batch (kernel, device, Terraform views, runbook and digest template), or only the user view now (inside the E18-A2 observability batch) and the rest after the first digest shows what is missing.
3. The validation-refusal event (`input_refused`): in 18.4, or wait.

## 5. Where this lands

- The user view (ids) joins the E18-A2 observability batch (Terraform and the smoke step) whatever the answer to § 4.2; the mapping CLI with it.
- The rest becomes Story 18.4 in `epics.md` on Matheus's go, with the digest template gaining the five questions a month of data must answer: time per screen, Home to first navigation, cancels by preceding screen, sessions by user and viewport, the document wait.
