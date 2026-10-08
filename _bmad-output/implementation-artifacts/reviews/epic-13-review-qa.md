# Epic 13 integrated review and human-style QA

Date: 2026-10-07 (evening run, host time 23:16 onward).
Reviewer: integrated review and QA agent, worktree `fasor-app-e13qa` (tag `e13qa`, port base 7), detached at
origin/main `62c024c` (PRs #103, #104, #105, #106, #107; 13.9 deferred).
Scope: `git diff b1c2c6b..62c024c -- apps packages scripts e2e` (149 files, +11 057 / -464), the five PR bodies,
`epic-13-context.md` and the Epic 13 story sections of `epics.md`.
Method: staged gate (`test-results/qa-e13/run.sh`, one stage at a time under `lockf /tmp/fasor-verify.lock`,
podman), targeted code review of the cross-story seams, and a Playwright MCP browser pass against the worktree's
Vite dev server (`http://localhost:7073`) at 390, 768 and 1280 px, signed in as a QA user seeded into its own
company (`qa13@example.com`, company `01a11947-6c3a-718f-b63f-46ea21525daa`). The browser's camera was a stub:
`getUserMedia` answered with a 1920x1080 canvas stream; capabilities (torch, zoom 1 to 3, single-shot focus) were
offered only when the pass asked for them; `ImageCapture` was either Chromium's real one (whose `takePhoto()` on a
canvas track rejects with `UnknownError: setPhotoOptions failed`) or removed (the iPadOS Safari path). Providers
were `fake`. Screenshots are under `test-results/qa-e13/shots/` (gitignored).

## 1. Gate

Every stage ran alone through the `tools` container under the host lock (`pnpm verify` is OOM-killed on this
VM). Logs: `test-results/qa-e13/*.log`, stage times in `test-results/qa-e13/summary.txt`.

| Stage | Result | Counts | Time | Notes |
|---|---|---|---|---|
| lint | 0 | - | 12 s | |
| static (typecheck) | 0 | - | 20 s | |
| test:api, run 1 | 1 | 8 files, 3 tests failed of 549 | 316 s | Self-inflicted: the QA user was seeded with `seed-users --sample-relatorio`, which puts the fixed-id Porto Seguro small fixture into a non-test company; `removePortoSeguroSmall` then refuses (`the small fixture is held by 01a11947-…`). Rows removed, see F-14. Not a product failure. |
| test:api, run 2 | 0 | 75 files, 549 passed | 172 s | after removing the fixture rows from the QA company |
| test:unit | 1 | 265 of 267 files, 3053 of 3055 tests | 86 s | `theme.test.tsx` (known host failure) and `export-dialog.test.tsx` "drains the outbox first" (load-sensitive) |
| test:unit, isolated | 0 | export-dialog alone 45/45 twice; export-dialog + theme 50/50 | 10 s each | a first two-file run failed export-dialog again while the e2e build started beside it: load, not order |
| test:e2e:full | 1 | 412 tests: 404 passed, 4 failed, 4 skipped, 0 flaky (parallel 302/307, serial 102/105) | 2078 s | see failure table below |
| test:e2e:matrix | 1 | 93 tests: 77 passed, 5 failed, 11 skipped | 359 s | see failure table below |

Every Epic 13 test passed in both suites: 30 in `test:e2e:full` (23 desktop-chrome, 7 durability-desktop-chrome)
and 18 in the matrix (7 desktop, 7 Android emulation, 4 WebKit; 3 WebKit legs skipped by their `not-covered-here`
annotation, as the PRs narrowed).

Failures, each run alone afterwards (and, where it still failed, on the pre-epic base `b1c2c6b` in this worktree):

| Test | Suite | Alone on 62c024c | On base b1c2c6b | Verdict |
|---|---|---|---|---|
| home 1.6-E2E-001 | full, parallel | passed (1/1) | - | load flake (a 40 s expectation inside a 30 s test timeout) |
| photo-numbers 7.3-E2E-001 | full, serial | failed (toast) | failed (toast) | pre-existing toast race, see check (a) and F-04 |
| photo-numbers 7.2-E2E-001 | passed in full | failed (toast) | passed | made deterministic on main by Epic 13, see check (a) and F-04 |
| review-layout-copy-3 F-11 (1280) | full, serial | passed (1/1) | - | load flake |
| ficha.durability E5-A2-E2E-002 (390) | full and matrix | desktop failed, Android passed | - | known host failure |
| ficha.durability E5-A2-E2E-003 | matrix | failed (desktop) | - | known host failure |
| durability 4.5-E2E-004 (Android) | matrix | failed | failed | pre-existing, not Epic 13 |
| ficha.durability F-11 (WebKit) | matrix | failed | failed | pre-existing, not Epic 13 |

**Gate verdict: not green.** The only failure attributable to the epic is photo-numbers 7.2-E2E-001 (`@p0`), which
now fails 2 of 2 when run alone on main and passes on the base; 7.3-E2E-001 fails on both. Every other red test is a
known host failure, a load flake that passes alone, or fails identically on the pre-epic base.

## 2. Findings

| Id | Severity | Story / AC | Evidence | Proposed fix | Owner |
|---|---|---|---|---|---|
| F-01 | High | 13.1 AC2 (fallback), seam 13.1 x 13.7 | `apps/web/src/surfaces/ficha/camera-view.tsx:511-529` (`takePhotoOrGrab` awaits `takePhoto()`, then `grabFrame(video)`), `camera-view.tsx:308` and `nameplate-section.tsx:206`; shot `01-single-shot-fallback-lost-1280.png`. On the "Fotografar placa" tile only, the camera view is replaced within 50 ms of the shutter (the `<video>` the shot holds is detached, `readyState` 0, `srcObject` null; a new one is mounted). When `takePhoto()` rejects (Chromium on a canvas track: `UnknownError: setPhotoOptions failed`) or exceeds `TAKE_PHOTO_TIMEOUT_MS`, the fallback waits 3 s on the detached element, rejects `no video frame`, and the shot is lost with "Não foi possível salvar a foto. Tente de novo." Reproduced 4 of 4 on two block types. "Ler visor" (thermo-hygrometer and readings) with the same failing `takePhoto` saves fine: its view is not replaced. Not caught because the unit tests (`camera-view.test.tsx:336-375`) run the fallback in an isolated harness, and Chromium's fake device answers `takePhoto()`. | Take the fallback frame synchronously at the tap (start `createImageBitmap(video)` before awaiting `takePhoto`, close it when the photo wins), or grab from the track, and keep the plate tile's camera owner mounted until its grab settles. Add an e2e on the plate tile with `ImageCapture.takePhoto` stubbed to reject and to hang. | fix batch |
| F-02 | Medium | 13.2 AC1 (48 px controls reachable) | `apps/web/src/styles/app.css:637` (`.cam-context { white-space: nowrap }` below 768 px) and `app.css:648`; shot `06-camera-controls-390.png`. At 390 px with a long context ("Contexto: Detalhe do transformador de força TR-1") `.cam-top` is 541 px wide in a 390 px view: the torch toggle sits at x = 493, off screen, and a scroll of the row can push "Fechar a câmera" off the left edge (shot `07-quota-refused-camera-390.png`). Fine at 768 and 1280. | Let the chip shrink and ellipsize (`min-width: 0; overflow: hidden; text-overflow: ellipsis`) and keep the torch `flex: none`, with a comment marking the declarations authored; add a 390 px assertion to 13.2-E2E-001. | fix batch |
| F-03 | Medium | test gate (photo-numbers 7.2/7.3), seam 13.5 x Export | `apps/web/src/state/toast.tsx:39-78` (one toast slot; a later toast replaces the earlier), `e2e/photo-numbers.spec.ts:78`. The caption reading of the "Geral" photo lands while the revision renders, and "1 leitura pronta para confirmar" replaces "Revisão 1 pronta — DOCX e PDF". 7.2-E2E-001 (`@p0`) passes on the base and fails 2/2 alone on main; 7.3-E2E-001 fails on both. | Test: wait on the dialog heading "Revisão N pronta" (which the product shows anyway) instead of the toast, or hold the caption reading. Product: see F-04. | fix batch |
| F-04 | Low | 13.5 x 4.8 (product side of F-03) | same as F-03. In real use, issuing right after adding a photo can replace the revision-ready toast with a reading-arrival toast; the dialog heading still says "Revisão 1 pronta", so the outcome is not lost. | Decide a toast priority (a job outcome is not replaced within its display time) or a short queue. | Matheus (decision), then fix batch |
| F-05 | Low | 13.3 AC1 (crop view) | `apps/web/src/surfaces/photos/photo-viewer.tsx:270-290`; shot `02-viewer-from-crop-both-reasons-1280.png`. Opened from a plate crop, the bar says "Foto inteira na tela" while only the crop is shown, and the two reasons run together without a separator ("Foto inteira na tela Ampliação máxima"); "Reduzir" and "Ajustar à tela" cannot show the whole photo from there (only "Anterior/Próxima" and back do). | At the fit of a crop view, an authored reason such as "Recorte na tela", and a separator or one reason at a time; optionally let "Ajustar à tela" leave the crop for the whole photo. | Matheus (wording), fix batch |
| F-06 | Low | 13.5 AC1, a11y | `apps/web/src/surfaces/ficha/reading-line.tsx:82` and `:86`. The wait text sits in a `role="status"` region and changes every second ("Lendo… 12 s", "13 s", ...), so a screen reader announces each tick. | Keep the ticking age outside the live region and announce only the 10 s ("Cancelar" available) and 120 s (still reading) transitions. | fix batch |
| F-07 | Low | 13.5 AC1 | MCP pass, PR-ENEL plate. After "Cancelar" the photo stays and the line goes, but the row keeps "Os campos continuam digitáveis; o que você digitar não é sobrescrito pela leitura." and there is no way to ask the reading again short of removing the photo. | Hide that note once cancelled; decide whether a cancelled reading offers "Ler de novo" (open question Q-3). | Matheus, then fix batch |
| F-08 | Low | 13.5 AC1 | shot `04-still-reading-390.png`. One thermo-hygrometer photo shows two identical wait lines, two "Cancelar" and two still-reading notes (Temperatura and Umidade). | One line per photo (at the section's "Ler visor" row) rather than per field. | fix batch |
| F-09 | Low | 13.6 AC1 | `packages/domain/src/photos/text.ts:74-75`. After a quota refusal the forced banner reads "Pouco espaço neste aparelho (10240 MB). Sincronize para liberar." on a device whose estimate is 10 GB free: the figure contradicts the message (real on Safari, whose per-origin quota refuses well before the disk is full). The camera's status line also still says "1 foto nesta rajada · salva neste aparelho" for the refused, memory-held shot (shot 07). | When the banner is forced by a refusal, drop the figure (authored "Este aparelho recusou guardar a foto. Sincronize para liberar espaço."); have the burst line not say "salva" for a held shot. | fix batch |
| F-10 | Low | 13.8 AC1 (finding names its row) | `packages/domain/src/audit/input.ts:122`; shot `05-audit-findings-dialog-1280.png`. A row whose first printed cell is the placeholder "-" is named "Cabos de entrada CE-ENEL · -". | Treat placeholder dashes as empty and fall back to "linha N". | fix batch |
| F-11 | Low | 13.8 "Ver" | `apps/web/src/surfaces/relatorio/generate-action.tsx:68`. The comment says "Voltar" reopens the dialog (`?exportar=1`); the browser back does, the app bar's "Voltar" on the sheet goes to the Sumário without the dialog. | Make the app bar's back follow history when the sheet was opened from the dialog, or correct the comment. | fix batch |
| F-12 | Low | 13.4 AC3, a11y | `apps/web/src/copy/ui.ts:188`. The "Hoje" chip's accessible name is "Hoje" alone; with both service dates empty two identical "Hoje" buttons are announced. | Label template "Hoje em {campo}" in `ui.ts`, `aria-label` on the chip. | fix batch |
| F-13 | Low | AD-13 ownership | `apps/web/src/surfaces/relatorio/panel-capture.tsx:94`. `panelAwaitingRows` chooses which kernel text a row shows (`proposal?.text ?? line?.text ?? reason?.text`) in the web layer. | Move the choice into a kernel function (`panelAwaitingRowText`). | fix batch |
| F-14 | Low | tooling (not an Epic 13 change) | `scripts/seed-users.ts --sample-relatorio`, `apps/api/src/db/test-fixtures.ts:39-49`. Seeding a demo company with the sample relatório in the compose database plants the fixed-id fixture, after which `test:api` fails in 8 files until the rows are removed by hand. | Mint fresh ids for `--sample-relatorio`, or have the CLI refuse when it would collide with the test fixture; mention it in the README. | Matheus |

No emoji was found in the epic's diff, and no user-facing string outside the three copy homes (the only inline
pt-BR literal in the scan is a test label). Derived text, counts and the audit labels live in `packages/domain`; the
web writes ops only (the reading cancel writes a `local_prefs` row plus `discardSuggestionOp` ops). `CONTRACT_VERSION`
15 is covered by the api integration test through the sync route (green in `test:api`).

## 3. AC coverage matrix

| AC | Covered by spec | MCP pass (this review) | Not covered / why |
|---|---|---|---|
| 13.1 AC1 getUserMedia 3840x2160, settings logged, bitmap size asserted | 13.1-E2E-001, `camera-view.test.tsx` | constraints recorded exactly (`facingMode: environment`, ideal 3840x2160, `zoom: true`); `camera track settings` logged once per session | real sensor sizes: E1-A1 device script (Matheus) |
| 13.1 AC2 single shot by `takePhoto`, frame-grab fallback, picker fallbacks unchanged | unit tests only for the fallback | fallback works for "Ler visor"; **fails on the plate tile (F-01)**; no-ImageCapture (Safari) path saves | e2e never makes `takePhoto` fail; real iPad pass (Matheus) |
| 13.1 AC3 encode cap re-measured | none | - | narrowed in PR #106: fake providers give no accuracy signal; 2560 px / 0.85 kept; needs the dated line under 13.1 |
| 13.2 AC1 torch, zoom, tap-to-focus when offered, hidden otherwise, torch resets | 13.2-E2E-001, 13.2-E2E-002 | stubbed capabilities: torch toggles (`torch: true` applied), zoom 1,0x to 1,2x, tap focus with ring and `pointsOfInterest`; reopen resets torch and zoom; nothing renders without capabilities; **torch off screen at 390 px (F-02)** | real Android torch pass (Matheus) |
| 13.2 AC2 iPadOS / fake camera: no unsupported control | 13.2-E2E-002, camera specs | yes | real iPad (Matheus) |
| 13.3 AC1 pinch, double-tap, buttons, native max, pan, crop zoom kept, Escape | 13.3-E2E-001/002 | buttons in/out/fit, double-click toggle, Ctrl+wheel, drag pan, Escape closes, Anterior returns to fit, crop view lands on the crop; F-05 wording | real touch pinch: matrix Android emulation only |
| 13.3 AC2 390 px, 48 px hit areas | 13.3-E2E-003 | every viewer control 48x48 at 390, controls wrap to a second row, no side scroll | WebKit leg skipped (Blob in IndexedDB), manual iPad pass (Matheus) |
| 13.4 AC1 autocapitalize/autocorrect/spellcheck off | 13.4-E2E-001 | off on Nº série, TAG, Tipo, Identificação, TAP atual and the date input | - |
| 13.4 AC2 enterkeyhint next/done; focus change commits | 13.4-E2E-004/005 (Android, WebKit) | `next` on the run, `done` on "Fase reserva" | real iOS decimal pad (Matheus) |
| 13.4 AC3 month-year, year, "Hoje" | 13.4-E2E-001/002 | "08/2024" and "2019" stored and shown after reload; "13/2024" refused with the helper; "Hoje" fills an emptied "Fim da parada" | "Hoje" only on service dates (narrowing, Q-2) |
| 13.4 AC4 "Salvo às HH:MM" / "neste aparelho" | 13.4-E2E-003 | "Salvo às 23:33" after a field op; "Salvo neste aparelho às 23:34" offline; height held by a non-breaking space | - |
| 13.4 DoD tap budget unchanged | tap-budget specs (green) | - | - |
| 13.5 AC1 age from 10 s, "Cancelar" keeps the photo | 13.5-E2E-001 | "Lendo… 16 s" + "Cancelar" (48 px) at 390; cancel keeps the photo; F-06, F-07, F-08 | - |
| 13.5 AC2 past 120 s, still-reading note, slow polling | 13.5-E2E-004 | note shown at 2 min 11 s | - |
| 13.5 AC3 failed display reading: "Tentar novamente" / "Digitar" | 13.5-E2E-002 | not reproduced (needs a failing fixture) | covered by spec |
| 13.5 AC4 panel dialog left by navigation, palette resume, toast "Ver" | 13.5-E2E-003/005 | left by back, palette lists "Fotos de equipamento à espera" with the proposal, tap reopens the result dialog | toast "Ver" (`?panel=`) by spec only |
| 13.6 AC1 evict, retry, refuse before next shot with banner and camera message | 13.6-E2E-002/003 | offline with every `files` put refused: shutter disabled, `.cam-hint` reason, refusal toast, storage banner, reopen retries first and stays shut, opens once writes succeed; F-09 | - |
| 13.6 AC2 durability after tab kill | 13.6-E2E-001 (matrix, Chromium and Android) | - | WebKit leg annotated not-covered (ephemeral IndexedDB) |
| 13.7 AC1 tile on every type with a plate | 13.7-E2E-001 (parametrized over 8 types) | tile on Para-raio, Chave, Transformador, TP, TC (and Disjuntor when not read-only); none and no "Dados de placa" on both cable types | cables carry no plate by seed (Q-4) |
| 13.7 AC2 one fake fixture per type | `providers/fake.test.ts`, `job.integration.test.ts` | Para-raio plate read to 5 suggestions ("Quelvar", "PR-2207-114", ...) | - |
| 13.7 AC3 tap budgets unchanged | tap-budget specs | - | - |
| 13.8 AC1 one optional tap, findings with "Ver", nothing written, absent with AI off | 13.8-E2E-001/002, api tests | one POST per tap, "Conferindo…", 4 findings with "Ver" in the dialog and the Sumário; "Ver" opens the sheet, marks the Sumário row (`is-highlighted`), opens the gallery; with `features.ai: false` no block, no button, no Sumário block, no plate tile | F-10, F-11 |
| 13.8 AC2 four finding kinds, no rewrite | prompt unit test | the fake shows one per kind | real-model behaviour: post-deploy |
| 13.8 AC3 fake fixture | yes | yes | - |
| 13.8 AC4 tokens and USD per run | api tests | `audit run` log line with tokens and `usd` seen in the api log | - |

## 4. Specific checks carried from the batches

**(a) photo-numbers 7.2-E2E-001: is the reading-ready toast overlapping the revision toast a product defect or
test-only?** Both. The toast is a single slot (`apps/web/src/state/toast.tsx:39-78`): the caption reading of the
"Geral" photo the test adds arrives while the revision renders, and "1 leitura pronta para confirmar" replaces
"Revisão 1 pronta — DOCX e PDF" (`Received: "1 leitura pronta para confirmarVerFechar"`). On main 62c024c, 7.2 and
7.3 both fail alone (0 of 2); on the base b1c2c6b, 7.2 passes and 7.3 fails, so the race predates Epic 13 and the
epic makes it deterministic for 7.2. The likely contributor is 13.5's fast poll for running readings (5 s for 120 s),
which brings the arrival forward into the generate wait (not bisected). For the user the outcome is not lost (the
dialog heading reads "Revisão 1 pronta"), so the product side is Low (F-04); the gate side is Medium (F-03).

**(b) Unhandled timer error from `apps/web/src/components/number-input.test.tsx:21`.** Not reproduced in this run
(number-input 5 of 5 passed, no unhandled error in the `test:unit` log). The cause is in the test, not the product:
the harness's `commit` schedules `setTimeout(() => setRaw(...), delay)` and never clears it, so a timer can fire
after the test's teardown and call `setState` on an unmounted tree or a torn-down jsdom. Fix: clear the harness's
timers on unmount, or have the tests that pass a `delay` await it before ending. Owner: fix batch (test-only).

**(c) ficha.spec 5.6-E2E-001 outbox lag at normal load.** Measured once in the MCP browser on the Vite dev server,
load average 2.9, no gate running: nine readings typed with Enter on SEC-ENEL-2 of a 94-block relatório, the
ninth op reached the outbox **452 ms** after the last Enter (all nine landed, focus on the primary). Batch B reported
3.6 to 4.1 s on main under the batches' load (load 10 to 15). The spec itself passed 3 of 3 alone
(`--repeat-each=3`) and in the full run. The 5 s poll is adequate at normal load; the lag is load, not lost writes.

## 5. Open product questions

- **Q-1 (F-04):** should a job outcome toast ("Revisão N pronta", "Documento pronto") be protected from being
  replaced by a reading-arrival toast for its display time, or should toasts queue?
- **Q-2 (13.4 narrowing):** "Hoje" only on the service start and end dates; should "Próxima intervenção" get it too?
- **Q-3 (F-07):** after "Cancelar", should a cancelled reading offer "Ler de novo", or is removing the photo the only
  way back?
- **Q-4 (13.7 OQ-1):** the cable types carry no plate in the seed, so no tile; keep, or give cables a nameplate?
- **Q-5 (F-05):** the crop-opened viewer's wording at fit, and whether "Ajustar à tela" should leave the crop.
- **Q-6 (13.5 open question, carried):** should the palette's "Fotos de equipamento à espera" list only this
  device's or this author's photos?
- **Q-7 (13.8, carried):** the authored audit copy and the `.precheck` look of the findings rows are proposals; no
  per-relatório cap on audit taps exists (one at a time is enforced), which is well inside the USD 100 ceiling at
  roughly 12k input tokens per run, but say if a daily cap is wanted.
- **Device passes owed (E1-A1 script, Matheus):** 13.1 capture sizes per path on an Android tablet and an iPad,
  13.2 torch and zoom on Android in a dark cubicle, 13.3 pinch on an iPad, 13.4 iOS decimal pad commit by tap.
