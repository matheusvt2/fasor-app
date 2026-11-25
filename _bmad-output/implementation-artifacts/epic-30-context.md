# Epic 30 context: the open-work audit of 2026-11-24

Compiled 2026-11-24 by John (PM), before any worktree. The stories, the decisions and the rules every story keeps are in `_bmad-output/planning-artifacts/epics.md`, "Epic 30" (read that section with offset and limit; never the whole file). The source is `implementation-artifacts/open-work-audit-2026-11-24.md`; the ledger rows are cited by the audit's ids. This file adds only what the batches share.

## Goal

Build what the audit found real and Matheus scheduled: the app fixes of its section 2, the infra and tooling fixes, seed v19 for Bruno's answered forms and the Malha's two sentences, a notice when a local a device answered was removed elsewhere (Q-8), and the causes of the unstable tests. Earlier relatórios print byte-identical.

## Decisions (Matheus, 2026-11-24)

- Point 3: "faça as correcoes revisitando o codigo, testando a falha, corrigindo e testando o sucesso". Every fix is red first, then green.
- Point 5: "tem que ser uma notificacao" (Story 30.4).
- Point 6: "procure" (Story 30.5).
- Point 7: "ok" (seed v19, Story 30.3).
- "faça em paraledo o que der": two batches side by side in wave 1; wave 2 as the load rules allow.
- Points 1, 2, 4 and 8 are outside this epic.

## Batch plan

At most two batch stacks up at a time. The main checkout's stack is stopped while batches run (`podman compose stop`, never `-v`).

| Wave | Tag | Stories | Port base | Base | Contract | Dev model · Effort |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | e30a | 30.1, then 30.2 | 30 | main `29072a91` or later | none | opus · high (30.1), sonnet · high (30.2) |
| 1 | e30b | 30.3 | 31 | main `29072a91` or later | 60 (main's plus one) | fable · high |
| 2 | e30c | 30.4 | 30 | main after wave 1 is merged | main's plus one at its merge (61 if e30b took 60) | opus · high |
| 2 | e30d | 30.5 | 31 | main after wave 1 is merged; merges main again before its PR | none expected | opus · high |
| 3 | e30g | 30.6 | 30 | main `ace4bfd0` (Stories 30.1 to 30.5 merged) | none (usage-event fields, apart from the sync contract) | opus · high |

- e30a and e30b run side by side. They share only `deferred-work.md` (different rows) and `docs/kbs/log.md` (append only); the PR that merges second merges main first.
- Story 30.2 rides in e30a, not in a batch of its own: the two-stack limit, one batch per wave, and no file shared with 30.1.
- e30c starts once wave 1 is merged and its full gate is green. e30d starts when e30c's batch gate has finished and no other stack is up: it measures under a load it makes itself.
- Images: each batch tags its own `app-api-e30x` and `app-tools-e30x` from the shared images and never builds from scratch.
- *(2026-11-25, coordinator: Story 30.6 added on Matheus's word "é o tablet do Bruno, pode registrar o tipo do aparelho", after the production read of the usage events showed Bruno's tablet at phone width in 106 of 159 sessions. One batch, e30g, alone on the host, port base 30. It touches the usage-event contract (`contract/telemetry.ts`), `apps/web/src/telemetry/context.ts`, one view of `infra/production/observability.tf` and the audit's answer 4; no seed, golden, op or contract number.)*

## Facts the batches share

- **Seeds.** `SEED_VERSION = 'v18'` (`packages/domain/src/seed/definitions.ts:70`); v18 shipped at `de79700b`, and main's product code equals it. Only Story 30.3 opens v19; its deltas live in `seed/v19.ts` fences with `withoutE30b<x>` strip helpers and rule flags read by `seedRule`. No other story touches a seed.
- **Contract.** 59 today (`contract/version.ts:703`, MIN at `:1125`). A new seed needs a number (`version.ts:1113`), so e30b takes 60. e30c's location mark takes the next. Each batch appends its paragraph to `contract/version.ts`.
- **Goldens.** `apps/api/src/jobs/generate/golden/`: `layout-lock-v5`, `-v11` to `-v17`, the `-epic25` twins, `porto-seguro-skeleton.json`. Story 30.3 adds `layout-lock-v18` (and its `-epic25` twin) from the deployed code. Regeneration needs `GOLDEN_UPDATE=1`, never for an older seed. A batch that turns one red stops and reports.
- **One owner per shared item:** the generate hook (`use-generate.ts`), the setup field hooks and the Sumário tree: 30.1 only; `infra/`, `infra/bin/deploy`, `scripts/preflight.ts`, the reading job's usage: 30.2 only; `seed/`, `relatorio/conclusion.ts`, `formatCriterionValue`, `maxFieldDefaultText`: 30.3 only; the location removal mark, `merge/`, `restorableEntries`, Sync status's Decisões: 30.4 only. 30.5 may touch any test, and product code only for a race it proves.
- **Strings.** Every authored pt-BR sentence marked `// authored (Story 30.x, listed for Bruno)` and listed in the PR.

## Gates

The rules of `AGENTS.md` as they stand since 2026-11-12, with the Epic 26 practice:

- **Each batch:** `lint`, `static`, `test:unit`, `test:api` and the Playwright specs it wrote or touched (`pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome`), inside the `tools` container, under the host lock (`lockf -t 20000 /tmp/fasor-verify.lock`), the summary pasted in its PR. When it changes the op fold, the commit path or a live query on the ficha (Story 30.4), its touched durability specs also run on the matrix projects. Every fixed item's red and green runs are in the PR. No review loop inside the batch.
- **Once per wave, on the integrated main, by the coordinator:** `podman compose restart api web`, then `pnpm test:e2e:full` and the matrix; one review; one fix batch if needed. Only with the machine idle.
- **Deploy only on Matheus's word.** Seed v19 freezes at the first deploy that ships it; the Terraform validation of Story 30.2 is applied there, on his AWS login (`infra/bin/deploy`, which takes the lock itself).
- **After each merge:** remove the batch's containers, image tags and network (`podman`); only main's stay.

## Open items

- The coordinator's readings written in each story are open to Matheus; none blocks a batch.
- Story 30.4's pt-BR copy is approved by Matheus in its PR.
- Story 30.1 item K and Story 30.5 may close rows as "does not reproduce" or "cause not found", with their evidence.

## Story 30.5: the unstable tests (batch e30d, 2026-11-25)

Branch `e30d-unstable-tests` from main `5c2b3ed3`, PR #390. Stack `fasor-e30d`, port base 31, no other batch stack up. The static hunt the batch started from: `_bmad-output/test-artifacts/unstable-tests-static-hunt-2026-11-24.md`. "The gate's load" is the e2e runner's own: the parallel group on two workers, the `queue` lane on two, the `solo` lane on one, under the host lock (load 4 to 8). Counts are read from each run's per-test outcomes. The proof run "pfinal" ran every e2e item with `--repeat-each 20` in one invocation: 300 tests in 2328 s (parallel 836 s, queue 809 s, solo 676 s), load 5.1 at its end, nothing else on the host. A load beyond any gate (an e2e run beside `test:unit`, load 10 to 16) was used only to reproduce the unit timeouts.

| # | Test | Reproduced? How | Cause (file and line) | Fixed where | 20-run result |
| --- | --- | --- | --- | --- | --- |
| 1 | `12.1-E2E-012` | Yes: 3 of 3 red with the page's animation frames slowed to 150 ms (`toBeFocused` "inactive" at the line the gate recorded) | The stepper's land (`use-ficha-steps.ts` `goTo`, the `afterFrames(land)` three frames after the tap) took the focus from "Marcar os restantes como Conforme", which the test had just focused | Product (`use-ficha-steps.ts`: the land runs only while nothing was pressed or typed since the tap and the focus is still where the jump left it); the test's focus retry loop and two-frame wait removed | 20 of 20 (pfinal, parallel group, 2 workers) |
| 2 | `1.6-E2E-001` | Yes: 1 of 20 at the gate's load (pfinal), "Baixando o relatório…" still shown when the 30 s test timeout fired; 0 of 12 on six workers, 0 of 6 on two | Not found. The red run spent 27.6 s in one wait for the Sumário list while the passing runs took 2.4 to 4.9 s in all, so it is a stalled pull, not the test's budget. The hunt's lead (the held stream unrouted while its handler sleeps) was refuted: 3 of 3 drew the Sumário 47 to 66 ms after the unroute | Not fixed; the test left as it is; open `deferred-work.md` row (Story 30.5 section) | 19 of 20 (cause not found) |
| 3 | `R8LAY-E2E-008` | Yes, as a person presses: a finger down 120 ms on "Novo relatório" as soon as it was enabled on a Home just opened: 2 of 4 lost at normal speed, 4 of 4 with the CPU slowed fourfold (landed on a shortcut card) | Home drew "Novo relatório" before the Status board (and the shortcut row, when the role was read later) arrived above it (`home-surface.tsx`: the board on `relatoriosPending`, the shortcut row on the role read, the two-tree button on `canCreate`) | Product (`home-surface.tsx` `settled`: board, shortcuts, search and button drawn in one commit once both reads are in); the test's repeated press removed | 20 of 20 (pfinal, solo lane) |
| 4 | `11.11-E2E-001` | Yes: 1 of 10 at the gate's load, the same red as the record ("1 legenda sugerida" over "2 fotos adicionadas") | A reading arrival called `showToast(…, { arrival: true })` over the plain toast answering the press; nothing queued it (`state/toast.tsx` `showToast`, the final `slot.display`) | Product (`toast.tsx`: an arrival waits behind any toast on screen but another arrival or a status toast) | 20 of 20 (p04) |
| 5 | `6.2-E2E-001` | No: 0 of 30 at the gate's load (10 with a diagnostic, 20 plain). The diagnostic saw the hunt's NC drafts arrive during the press and the press still land: the sheet's press hold (`input/press-hold.ts`, Story 12.1) kept the row still until the click | Not found (the hunt's lead is held by the existing press hold) | Not fixed; left as it is | 20 of 20 (p05) |
| 6 | `R8CAP-E2E-010` | No at the gate's load: 20 of 20 with its retry removed (p05). Under a load the batch made beyond any gate (CPU slowed fourfold, load 10 to 16) the "Criar" press ran past its own 5 s action timeout, not the recorded detach | Not found | Not fixed; the test left as it is, its retry kept | 20 of 20 without the retry (p05) |
| 7 | `25.2-E2E-002` | Yes, the recorded "5" for "548" family: with frames at 100 ms and keys 150 ms apart, a reading typed right after the stepper tap was saved as "54" (2 of 2) | The same land as item 1 took the focus from the cell mid-typing; the blur committed the digits typed so far | Product (item 1's fix); the deterministic `page.goBack()` reds were adapted earlier | 20 of 20 (pfinal) |
| 8 | api `e24y-paired-tables` | No: in the batch's `test:api` beside lint and static the two previews took 6.1 s and 4.5 s, each alone in the generate queue | Not found (the hunt's lead, jobs left ahead in the queue, not seen: the queue held only its own job) | Not fixed; left as it is | 20 of 20 (`vitest --repeats 19`, alone, 292 s) |
| 9 | `24.10-E2E-005` | Yes: 1 of 20 in the solo lane (pfinal), the same red as the record (the tap after a pick found the page `aria-hidden`) | Not found. After the "13,8 kV" pick on TENSÃO DE PLACA its list "Sugestões Tensão de placa" was open again (or still) 2 s later, so the page stayed `aria-hidden` (`components/registry-picker-field.tsx`, `components/combobox.tsx`); why the list was open was not pinned down | Not fixed; left as it is; open `deferred-work.md` row (Story 30.5 section) | 19 of 20 (cause not found) |
| 10 | `e20f-DUR-001` | Yes, through item 3's mechanism (the same "Novo relatório" press on a Home just loaded, `createProjectFromHome`) | Item 3 | Product (item 3's fix) | 20 of 20 on `durability-desktop-chrome` and 20 of 20 on `durability-webkit` (with e20f-DUR-002 likewise) |
| 11 | `14.5-E2E-001` | Yes: 1 of 20 in the queue lane (pfinal), the same red as the record (the download did not start within 30 s) | Found in part: after the "Revisão 1 pronta" toast the Export dialog lays out again, and its "DOCX — abrir no Word" row moves 48 px up 40 to 270 ms later (seen in 6 of 10 diagnosed runs, all green: the press landed before or after the move). A press that meets the move lands beside the button and nothing is fetched (the red run made no `GET /api/revisions/…/docx`). Which element arrives and shifts the centred dialog (`surfaces/export/export-dialog.tsx`, the ready phase) was not pinned down | Not fixed: the fix is the dialog's layout in its ready phase (drawn once all it shows is on the device, as Home's `settled`), left for a decision; the test left as it is | 19 of 20 (pfinal), 10 of 10 (diagnosed run) |
| 12 | `21.1-E2E-002` | Fixed in batch e30f (PR #388); counted here | e30f's cause (`export-dialog.tsx` layout effect) | Product (e30f) | 20 of 20 (pfinal, queue lane) |
| 13 | relatório tree unit tests | Yes, under a load the batch made: `test:unit` beside an e2e run (load 10 to 16): `relatorio-tree.test.tsx` Q7 red at 1940 ms, the tree files 4 to 7 times slower | Q7 awaited the move's announcement within 500 ms of wall clock (`relatorio-tree.test.tsx:345`); the rest is CPU: no race in test or product | Test (Q7 holds the settle fallback back instead of timing the render); the others not changed | Not counted 20 times: a `vitest --repeats` run gives the 20 repeats one 15 s budget (so it can not count), and 20 whole `test:unit` runs were out of reach; `test:unit` green 1 of 1 alone, 8020 of 8020 |
| 14 | template-composer unit tests | Yes, same load: `template-composer-defaults.test.tsx` "Dados da malha" timed out at 60 s, 2.6 s alone (24 times slower) | CPU only: no race in test or product | Not changed (cause: the shared CPU; the rule is no unit stage beside other work) | Not counted 20 times: a `vitest --repeats` run gives the 20 repeats one 15 s budget (so it can not count), and 20 whole `test:unit` runs were out of reach; `test:unit` green 1 of 1 alone, 8020 of 8020 |
| 15 | `1.8-E2E-006`, `6.2-E2E-003` (by-hand "Sincronizar agora") | No: 20 of 20 each as they are ("Sincronizar agora" runs `runFreshCycle`, so a tap on a button read ready too early is never lost) | Not found | Not changed | 20 of 20 each on `durability-desktop-chrome` (6.2-E2E-003 also 20 of 20 on `durability-webkit`, where it ends early by design; 1.8-E2E-006 skips there) |
| 16 | the api exiting when Postgres restarts | No: a clean restart, a SIGKILL restart under 10 health requests a second, and a SIGKILL restart during an e2e run on two workers: the api answered 503 for under a second, logged pg-boss errors and recovered. The recorded restart itself happened twice on its own during the batch (09:05 and 10:56, at load 9 to 15: "untracked child process … terminated by signal 13", "all server processes terminated; reinitializing", as in the Epic 24 record) and the api survived both. Confirmed the other half: when the api's node process dies, `tsx watch` keeps the container up, the health check takes 150 s to call it unhealthy and compose never restarts it | Exit: not found. Staying down: `docker-compose.yml` api `command: pnpm --filter @app/api dev` (`tsx watch`) | Not fixed (no exit seen; the stays-down half left in the ledger) | not applicable |


**Gate of the batch:** lint 0 errors (30 warnings, as before) and static clean on the final head (79 s together); `test:unit` alone 8020 of 8020 (562 s, load 11 to 12); `test:api` not required (no `apps/api` or `packages/domain` change), run once beside lint and static: 1224 passed, 1 red (`sync.integration.test.ts` "Edit in Emitido", a 15 s timeout), that file alone 53 of 53. E2E: the full `@p0` (`pnpm test:e2e`) 544 of 549 in 6076 s, 5 reds all in the `queue` lane (14.5-E2E-001, 23.21-E2E-001, 25.13-E2E-001, 24.18-E2E-001, e24h-H9-E2E-001), during which LibreOffice failed three renders (`render_failed`) and the stack's Postgres reinitialized after "untracked child process … terminated by signal 13" (load 7 to 9); the five alone 5 of 5 (queue lane, 101 s). The touched specs and the grep hits of the toast and Home changes (ficha, home, typed-values-kept, photos, sheet-photos, review-toasts-2026-10-08, points, ui-hygiene, plate, reading-wait, audit-fixes-30-1, review-layout-interaction-2026-10-08 on desktop-chrome and durability-desktop-chrome) 138 of 138 (540 s). No matrix run: no change to the op fold, the commit path, the sync engine or a live query on the ficha. Nothing else on the host; each run waited for the lock behind the batch's own runs.
