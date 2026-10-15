---
title: 'Story 14.10 lane A: gate preflight, cross-batch merge rule, generation time, coluna in the group titles'
type: 'feature'
created: '2026-10-15'
status: 'done'
baseline_revision: 'f7d88b5d7ed5c20af56b5b6a0688a37ae66812a6'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Story 14.10 lane A (co15a): parts 1, 2, 4 and 8 of one carry-over story, cut by surface (tooling, render pipeline, section 9 titles); part 6 is deferred to Matheus, lane B (co15b) holds parts 3, 5, 7, 9, 11.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** (1) A crash-looping compose container (the root-owned `apps/web/node_modules/.vite-temp` of 2026-10-15, co14b: 6137 restarts) loads the VM until every gate stage times out, and nothing tells the operator why. (2) Two batch PRs of one wave each green alone turned 14.2-E2E-002 red together. (4) Production took 88 s to preview and 64 s to generate a 76-sheet relatório with 2 filled sheets, with no record of where the time goes. (8) Under a painel with *Agrupar por tipo* on, a type-group title names the painel and the local but not the coluna (Bruno, 2026-10-15, question 5).

**Approach:** (1) A preflight probe that reads the container engine before any gate stage runs and fails fast naming the looping container, plus a `web` service that never writes into the shared volume's `.vite-temp`. (2) A playbook rule, already written (see Tasks). (4) Per-stage timing in the generate job, a local measurement of the production shape, skipping work that prints nothing, and an api-suite timing assertion against a target taken from the measurement. (8) `groupForPrint` splits each painel run by coluna and titles each type group "⟨grupo⟩ da ⟨Coluna N⟩ do ⟨painel⟩ — ⟨local⟩".

## Boundaries & Constraints

**Always:**
- Everything runs in containers (`podman compose`, tools with `--user root`); never pnpm or node on the host.
- Titles and every derived text are composed once in `packages/domain`; the api renderer only prints `PrintSubsection.title`.
- Part 8 wording is marked `// authored:` with "open for Bruno" (Story 14.10 part 8, `source-deltas.md` row of 2026-10-15 question 5).
- A local with no painel, a relatório on v1 to v3 without painéis, and the Porto Seguro golden documents stay byte for byte unchanged (`apps/api/src/jobs/generate/golden/`).
- The preflight degrades to a one-line note and continues when no engine socket is reachable (another machine, a host without the mount); it fails only on evidence of a loop.
- Document tests assert from their own section heading (E7-A6).

**Never:**
- Part 6 (production smoke), `infra/`, Terraform, the AWS CLI, `infra/bin/deploy`.
- Lane B files: `packages/domain/src/audit/`, `packages/domain/src/sync/counts.ts`, the Sync status, the ficha plate section, `apps/web/src/input/focus-restore.ts`, `etapa5-local.tsx`, `suggestion-field.tsx`. New `pt-br.ts` keys (none expected) go in their own block.
- Engine writes from the probe (only GET requests), and no `pkill` by pattern.
- Loosening the golden comparisons or regenerating the goldens to make part 4 pass.
- A timing target picked without the measurement.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Healthy stack | all project containers running or exited 0, restart counts stable | probe passes, adds under 15 s (two samples 10 s apart, or less) | none |
| Restarting container | a container with `State.Restarting` true or status `restarting` | exit non-zero within 15 s: `preflight: <name> is restarting (restarts: N); last log: <first line>` | no stage runs |
| Growing restart count | count of a container higher at the second sample | same message and exit as above | no stage runs |
| No engine socket | socket path absent or unreadable | one line `preflight: no container engine socket, skipped`, continue | exit 0 |
| Engine error | socket present, request fails or times out (5 s) | one line naming the error, continue | exit 0 |
| Probe already ran | `GATE_PREFLIGHT_DONE=1` in env (set by `verify.ts` for its children) | no second probe | none |
| One coluna in a painel, flag on | painel "Painel 1" with "Coluna 1" holding a seccionadora | "Seccionadoras dos Cubículos de MT da Coluna 1 do Painel 1 — Cabine primária" | none |
| Same type in two colunas | seccionadoras in Coluna 1 and Coluna 2 of one painel | two groups, coluna order, each its own title | none |
| Coluna name without "Coluna" | coluna named "Entrada" | "… da Coluna Entrada do …" (open question 2) | none |
| Flag off, or no painel | any | titles unchanged from today | none |

</intent-contract>

## Code Map

- `scripts/verify.ts` -- the gate runner (`PHASES`, `runPhases`, `main`); run the preflight before the first phase and pass `GATE_PREFLIGHT_DONE=1` to stages.
- `scripts/e2e.ts` -- every `test:e2e*` entry; run the preflight before the bundle build unless `GATE_PREFLIGHT_DONE=1`.
- `scripts/verify.test.ts`, `scripts/e2e.test.ts` -- tooling unit tests (vitest project `tooling`, `scripts/**/*.test.ts`).
- `package.json` -- `lint`, `static`, `test:unit`, `test:api` scripts: a single stage run alone runs the preflight first (e.g. `tsx scripts/preflight.ts && eslint .`).
- `docker-compose.yml:227` `tools` service -- gains the engine socket mount and `COMPOSE_PROJECT_NAME`; `:138` `web` service -- Vite's config loader must not write `node_modules/.vite-temp` (Vite ~8.3: `--configLoader runner`; verify the flag exists in the installed Vite) or another settled way.
- On this host the VM socket is `/run/podman/podman.sock`, symlinked at `/var/run/docker.sock` (Docker Engine API compatible, rootful). Compose labels: `com.docker.compose.project`, `com.docker.compose.service`.
- `packages/domain/src/print/group-for-print.ts:126` `painelTypeGroupTitle`, `:145` `PainelRun`, `:166` `fieldOrder`, `:244` `byType` (its `painelTitle` parameter), `:308` `byTypeRuns` -- part 8 lives here. `ofCabine` gives the painel's contraction; `relatorio/tree.ts:286` `saysColuna` (private) decides whether a name already says "Coluna" (export or share it).
- `packages/domain/src/print/group-for-print.test.ts`, `section-9.test.ts` -- kernel tests on titles; `apps/api/src/jobs/generate/docx.test.ts`, `docx-site-checklist.test.ts` assert painel type-group titles (E14-A3: run them).
- `e2e/local-painel-coluna.spec.ts` -- 14.2-E2E-001 (`:180`) generates a painel relatório (flag off) and reads the DOCX structure from section 9's own heading (`:323-363`); add the part 8 e2e beside it.
- `apps/api/src/jobs/generate/job.ts:182` `renderDocument` (up to three DOCX + LibreOffice passes for TOC page numbers), `:209` `runGenerateJob` (snapshot freeze, file rows, photo loads `loadPhotoImages`, certificates, watermark, render, uploads, commit); `docx.ts` `buildDocx`; `libreoffice.ts` `convert`; `pdf-outline.ts` `readOutline`; `pdf-raster.ts` certificate pages; `packages/domain/src/print/layout.ts` the layout.
- `apps/api/src/jobs/generate/job.integration.test.ts`, `worker.integration.test.ts` -- existing seeding and job-run patterns for the timing test.
- `_bmad-output/implementation-artifacts/epic-batch-orchestrator.md` -- note of 2026-10-15 (line ~156) on the `.vite-temp` crash loop gets the dated "cannot recur" line.
- `docs/kbs/workflow/merge-gate.md`, `docs/kbs/workflow/running-the-stack.md`, `docs/kbs/log.md` -- dated notes (DoD).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- add or close entries per part (DoD).

## Tasks & Acceptance

**Execution:**
- `epic-batch-orchestrator.md` section 6, `docs/kbs/workflow/story-delivery.md` -- part 2, DONE by the orchestrator before the build (cross-batch merge rule citing #137, #133, 14.2-E2E-002, #138). Do not redo.
- `scripts/preflight.ts` (new) -- part 1: a pure decision function over a container list (`{name, state, restarting, restartCount}` samples) plus an engine client (Node `http.request` with `socketPath`, GET `/containers/json?all=1&filters=` by project label, GET `/containers/{id}/json`, GET `/containers/{id}/logs?stdout=1&stderr=1&since=<StartedAt>` decoding the 8-byte multiplexed frames); first sample, fail at once on a restarting one, else second sample after up to 10 s and compare counts; one message, exit 1. The tools one-off container itself is ignored. Socket path from `ENGINE_SOCKET` (default `/var/run/engine.sock`), project from `COMPOSE_PROJECT_NAME`.
- `scripts/preflight.test.ts` (new) -- the decision on fake lists: healthy, restarting, growing count, exited 0, tools container ignored, message format; the frame decoder.
- `scripts/verify.ts`, `scripts/e2e.ts`, `package.json` -- call the preflight as above; `verify.ts` sets `GATE_PREFLIGHT_DONE=1` for its stages.
- `docker-compose.yml` -- `tools`: mount `${ENGINE_SOCKET_HOST:-/var/run/docker.sock}:/var/run/engine.sock` and pass `COMPOSE_PROJECT_NAME`; comment that the probe only reads. `web`: the config-loader change so a root-owned `.vite-temp` cannot stop it. Prove it: create a root-owned `apps/web/node_modules/.vite-temp` in the co15a volume, start `web`, it serves `:5173` without restarts; stop `web` afterwards.
- `epic-batch-orchestrator.md` -- dated line under the 2026-10-15 note: the crash loop cannot recur (what changed) and the preflight names a looping container.
- `apps/api/src/jobs/generate/job.ts` (and the helpers it calls) -- part 4: per-stage timing (snapshot and layout, photo and certificate loads, each DOCX build, each LibreOffice conversion, outline reads, uploads, commit) logged as one structured line per job (`logInfo` or the existing logger) and returned or exposed so a test can read it; skip work that prints nothing for empty sheets (find it by measuring: e.g. photo or file loads for sheets with no photo, layout of rows that print nothing; keep the printed output identical).
- `apps/api/src/jobs/generate/generation-time.integration.test.ts` (new) -- seed the production shape locally (76 sheets across the eight types, 2 with values, one photo on a filled sheet), run preview and generate through the job, assert each measured stage and the total under the target written in this spec's Design Notes after measuring (fill the numbers in; if no target can be derived, say why there and leave it as an open question for Matheus with no assertion).
- `packages/domain/src/print/group-for-print.ts` -- part 8: a painel run becomes one run per coluna holding a sheet (tree order; a sheet under the painel outside any coluna, which no client writes, keeps the painel-only title); under the flag, after the `painel` heading, each coluna's type groups titled by a new exported `colunaTypeGroupTitle(words, colunaName, painelName, localName)`; `painelId` kept on each group. Flag off: unchanged (the coluna is not a subsection). Mark `// authored:` open for Bruno.
- `packages/domain/src/print/group-for-print.test.ts`, `section-9.test.ts` -- the matrix rows above, ÍNDICE titles and section 9 headings equal, a v1-v3 relatório and a no-painel local unchanged.
- `apps/api/src/jobs/generate/docx.test.ts`, `docx-site-checklist.test.ts` -- update the painel type-group title assertions to the new wording.
- `e2e/local-painel-coluna.spec.ts` -- new `@p0` test: a local with *Agrupar por tipo* on, a painel of two colunas holding seccionadoras in both, generate, read section 9 from its own heading: two titles with "da Coluna 1" and "da Coluna 2", the ÍNDICE lines equal the headings; assert the stored flag (store or outbox) as well as the document.
- `docs/kbs/workflow/merge-gate.md`, `running-the-stack.md`, `docs/kbs/log.md`, `deferred-work.md` -- dated notes; a `deferred-work.md` entry for part 6 (owner: Matheus's decision on the production test company).

**Acceptance Criteria:**
- Given a project container restarting in a loop, when `pnpm verify`, `pnpm test:unit` alone or `scripts/e2e.ts` starts in the tools container, then it exits non-zero within 15 s with one message naming the container, its restart count and the first line of its last log, before any stage output.
- Given a healthy co15a stack, when `pnpm verify`'s first phases run, then the preflight adds under 15 s and the stages run as before.
- Given a root-owned `apps/web/node_modules/.vite-temp` in the shared volume, when the `web` service starts, then Vite serves and the restart count stays 0.
- Given the probe disabled and a looping container left running (mutation run), when `pnpm test:unit` runs, then it is shown slower or timing out against its normal run; restored, it fails fast; both recorded in the PR body.
- Given the production shape generated locally, when the timing is on, then the PR body records each stage's time for preview and generate, before and after the skips, and the api timing test fails when a stage exceeds the target.
- Given the Porto Seguro fixture and the goldens, when the api suite runs, then the goldens still match.
- Given a local with the flag on and a painel holding sheets in its colunas, when the relatório is generated, then the ÍNDICE and section 9 carry one type group per coluna titled with the coluna, the painel and the local.

## Review Triage Log

*(2026-10-15, pass 1: Edge Case Hunter and Verification Gap Reviewer on opus; Blind Hunter and Intent Alignment skipped, token economy, the integrated epic review covers them.)* Verdicts: 9 patch, 5 defer, 0 false.

- patch: gate wiring checked only by source text -> exported preflight-then-run entry, tested with a failing fake preflight (verify, e2e).
- patch: `onTiming` throwing after commit, and a second `generate timing` line after `logTiming('done')` -> once-only flag, guarded hook.
- patch: preflight with zero project containers passes silently -> one-line note.
- patch: inspect 404 between list and inspect skips the whole probe -> allSettled, row dropped.
- patch: missing `StartedAt` reads the whole log -> `tail=20`.
- patch: non-numeric `PREFLIGHT_INTERVAL_MS` -> 10000.
- patch: no overall deadline, a loaded engine can take past 15 s -> overall 15 s deadline.
- patch: empty coluna name -> painel-only title.
- patch (doc): a host with no `/var/run/docker.sock` sets `ENGINE_SOCKET_HOST`.
- defer: `renderDocument` using `passLayout` not pinned by a test (needs a seam; costs speed only, output identical).
- defer: per-stage targets skipped without a socket (documented, tied to the socket-proxy open question).
- defer: two colunas of one painel with the same typed name print identical titles (default names are unique; open with Bruno with the wording).
- defer: non-coluna children between colunas of a painel (no client writes that shape).
- defer: compose mount on a host without the socket path (rootless podman refuses to start tools; Docker creates a directory, which the probe reads as no socket).

## Design Notes

Part 8 composition (proposed, open for Bruno): `${words} da ${coluna} ${ofCabine(painel)} — ${local}` where `coluna` is the coluna's trimmed name when `saysColuna(name)` is true, else `Coluna ${name}`. A coluna is feminine, so the contraction is always "da". Two colunas of one painel never share a group even with one type.

Part 4 target: to be filled by the implementer from the measurement: the measured local stage times, the multiplier chosen for load headroom (the gate runs beside other stages), and the resulting per-stage and total ceilings.

*(2026-10-15, implementer, measured on the co15a stack: `generation-time.integration.test.ts`, the production shape seeded on the small fixture: 76 live sheets of the eight types, 2 filled, one photo, 86 pages, two TOC passes in every run.)*

| Stage (ms) | Preview before | Preview after | Issue before | Issue after |
|---|---|---|---|---|
| freeze | 38-49 | 25-144 | 11-15 | 14-29 |
| layout | 67-79 | 42-130 | 31-40 | 41-122 |
| file_rows | 1-2 | 2-223 | 1-39 | 2-44 |
| photos | 20-25 | 11-132 | 8-24 | 22-28 |
| watermark | 31-43 | 33-116 | - | - |
| docx_1 / docx_2 | 721-859 / 651-1107 | 669-838 / 619-747 | 575-964 / 408-768 | 581-651 / 430-778 |
| convert_1 | 6275-6629 | 2787-2966 | 2135-3329 | 2334-4269 |
| convert_2 | 6066-6237 | 6048-7261 | 2324-2580 | 2553-3040 |
| outline_1 / outline_2 | 18-651 / 37-116 | 25-635 / 23-33 | 16-34 / 14-19 | 10-60 / 11-17 |
| upload | 93 | 45-65 | 60-69 | 51-88 |
| total (`duration_ms`) | 14745-15212 | 11149-12579 | 6010-7572 | 6258-8966 |

LibreOffice is the cost: four fifths of every job. No work on the empty sheets is large enough to matter (layout 40-130 ms, the DOCX build under 1.1 s, the one photo 30 ms; every empty sheet prints its page, so none can be skipped). The skip that measuring found: the preview's RASCUNHO image tripled a pass's conversion (6.3 s against 2.1 s), and TOC pass 1 is rendered only for its outline, its files thrown away, so pass 1 now leaves the image out (`passLayout` in `job.ts`; the image floats behind the text in the header and moves no line, and the convergence check would take a third pass if it ever did). Preview total 15.0 s to 11.8 s on average; issue unchanged; printed output identical (the kept pass renders the whole layout). Production took 88 s and 64 s on the same shape, 6 to 9 times the local times: a Fargate task's CPU, not a stage of its own.

Target: the slowest local time of each stage after the skip, times 4 for a gate that runs this beside `lint` and `static` and, on this host, beside another lane's gate (the 2026-09-27 measure saw the unit suite three times slower beside other stages), with a 2 s floor for the millisecond stages: each `convert_n` 30 s, each `docx_n` 5 s, each `outline_n` 3 s, freeze, layout, file rows, logo and cover, photos, certificates, watermark and upload 2 s each; total 50 s. The commit is logged but not targeted (it writes the result the totals are read from).

*(2026-10-15, coordinator: no synced schema changes in this batch, lane B owns contract 20.)* The stage times are not in the job's `result`: the job logs them in one `generate timing` line and hands them to an optional `onTiming` job dep. The test always asserts each job's total (`result.duration_ms`, an existing field) against 50 s, and reads the per-stage times from the api container's `generate timing` line matched by job id, through the engine socket the tools container mounts (`scripts/preflight.ts` `serviceLog`, GET only). With no socket reachable it skips the per-stage part with a one-line note.

Open questions (list in the PR body): (1) part 8 title wording and one group per coluna (Bruno); (2) a coluna whose name does not say "Coluna" (proposed "Coluna ⟨name⟩"); (3) the engine socket mount on the tools container gives it engine access on a local stack; Matheus may prefer a read-only socket proxy; (4) the part 4 target if it cannot be derived.

## Verification

**Commands (in the tools container, every Playwright run inside `lockf -t 30000 /tmp/fasor-verify.lock`):**
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `static` / `test:unit` / `test:api` -- green.
- `pnpm exec tsx scripts/e2e.ts e2e/local-painel-coluna.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green.
- `pnpm test:unit -- scripts/preflight.test.ts packages/domain/src/print` while iterating.
