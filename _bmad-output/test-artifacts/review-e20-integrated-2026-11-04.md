# Epic 20 integrated review: wave gate, security re-pass, browser pass (2026-11-04)

Second QA agent, on main `76cbdb79` (merge of PR #240), in the worktree `.claude/worktrees/agent-ac2ed76528e315f89` (stack `fasor-e20q`, port base 55). This pass tested and reported only. It changed no tracked file and made no commit.

## 1. Wave gate

All three stages ran in one sequence under the host lock. The lock was taken 5 s after the request. Load lines are from `scratchpad/gate/load.txt`.

| Stage | Window | Result | Load (1/5/15 min) and other containers |
|---|---|---|---|
| `pnpm verify` | 04:09:07 to 04:41:04, 1917 s | rc 0: api 809/3 skip, unit 5020, `@p0` 339/339 (recorded by the first agent) | {2.66 2.92 3.42} to {2.96 3.24 3.81}; nothing else running |
| `test:e2e:full` | 04:41:10 to 05:25:20, 2649 s | rc 0. **563 tests: 559 passed, 0 failed, 4 skipped, 0 flaky.** The parallel group was 397 tests (393 passed, 4 skipped) in 1140.9 s. The serial group was 166 tests, all passed, in 1498.4 s. | {3.29 3.31 3.83} to {5.74 5.39 5.16}; the `fasor-e20f` stack (minio, postgres, api, a tools run) came up during this stage |
| `test:e2e:matrix` | 05:25:31 to 05:38:22, 771 s | rc 0. **138 tests: 124 passed, 0 failed, 14 skipped, 0 flaky.** The parallel group was 96 tests (83 passed, 13 skipped) in 303.0 s. The serial group was 42 tests (41 passed, 1 skipped) in 455.9 s. | {5.31 5.31 5.14} to {11.51 8.54 6.82}; `fasor-e20f` still up |

The skips are all by design:

- **full:** `p-screens.capture.spec.ts` runs only with `CAPTURE_P=1`. Three touch-only tests are skipped on `durability-desktop-chrome`: 4.3-E2E-003, 4.5-E2E-004 and 4.7-E2E-003.
- **matrix:** the same three touch tests are skipped on `durability-desktop-chrome` and on `durability-webkit`. Eight more are skipped on `durability-webkit`: the camera-app tests 17.2-E2E-001, 17.7-E2E-001 and 17.7-E2E-002; 1.8-E2E-006; 12.1-E2E-007; and the photo-zoom tests 13.3-E2E-001 to 003.

No test failed, so the flake rule did not apply. Summaries are in `scratchpad/gate/artifacts-full/e2e-report/summary.json` and `artifacts-matrix/`.

**Verdict: the wave gate is green on `76cbdb79`.** The deploy checklist still asks for `test:e2e:full` again on the post-fix (e20f) main.

## 2. Security re-pass, S1 to S8

Probes: `test-results/adhoc-sec/probe-e20.ts` (sections s1, s3 to s8) and a new `probe-e20b.ts` (b1 to b6, the bypass attempts). Results are in `probe-e20-*.json` and `probe-e20b-*.json` beside them. The browser scripts were `attack.mjs`, `inject.mjs` and `expired.mjs`.

Writes went to the e2e test companies, which every e2e run resets: worker-0 Empresa A (`e2e-w0-a`, `e2e-w0-a2`) and B, as the probe is written, plus `a@teste.local` for `attack.mjs` and `inject.mjs`. The browser pass used Empresa Local Dev (`dev@local.dev`), which I seeded into this stack.

Two probe fixes were needed. `sharp` is now resolved through `apps/api`. Two forged ops that `makeOp` refuses locally are now built by hand.

| # | Status | Evidence (live, this stack) |
|---|---|---|
| S1 status from the client | **Closed** | Refused `op_status_transition`: Rascunho to Emitido; to Em revisão with no issue job; creates born `emitido`, `em_revisao` or `em_campo`; an em_revisao-then-emitido chain in one batch; an undo whose `prev_op_id` is a refused op; a `prev_op_id` from another relatório. A put on the whole `relatorio/{id}` path and a `create` on `relatorio/status` are refused `op_invalid`. Create plus em_campo plus em_revisao plus emitido in one batch applies only up to em_campo. A generate with nothing filled answers 409 `pre_issue_blocked` and unlocks nothing. A second create of R1 naming R2's obra is a no-op. The legitimate paths apply: Rascunho to Em campo, a backward move, removal and restore of a non-Emitido relatório. In the UI: generate, then "Marcar como enviado", then Emitido. The `statusSeen` prev-op trust is the known static item; it was not re-probed. |
| S2 signed-out device | **Closed for sign-out; partly open for an expired session** | After "Sair" the `releng-*` database is gone and `/api/account` answers 401. Restoring the pointer lands on `/login` online and offline (`attack.mjs` and the MCP pass). `inject.mjs` now cannot reach Home, so the write reproduction fails. With unsent changes, the confirm says "2 alterações ainda não foram enviadas. Sair apaga-as deste aparelho." "Cancelar" keeps the database and the session. Expired session online: boot goes to `/login`, the same user signs in, and the unsent edit reached the server (`additional_info = EXPIRED-OUTBOX-E20`). **Residual, known item, reproduced live (`expired.mjs`):** after a session expires, a later user's "Sair" deletes only their own database. Anyone who restores the first user's pointer offline opens that user's Home with "Novo relatório" enabled. |
| S3 attribution | **Closed, with the known residuals** | Refused `op_attribution`: `concluded_by` naming a colleague; a 2020 instant; `client_ts` 2099 or now + 11 min (now + 9 min applies); `not_tested.by` a colleague; `meta.restore.removed_by` a colleague; a photo `captured_at` 2099; a project create `removed_at` 2099. A block create carrying `concluded_by` or `not_tested.by` of a colleague is refused. A `created_by` of a colleague is rewritten to the session user. **Known items reproduced live:** a colleague's conclusion put back with another instant after a reopen applies; `client_ts` now - 60 min on a fresh relatório is refused (the clock-skew item). |
| S4 value size and type | **Partly closed** | 5 MB push: 413. 20 001 characters: `op_value_invalid` (20 000 applies). Observations as an object, and altitude -99999: `op_value_invalid`. A nameplate cell holding an array: `op_invalid`. **Known aggregate-cap item, reproduced live:** two pushes of 90 points × 20 000 characters applied, and the next preview failed `libreoffice_timeout` after 124 s, the same outcome as S4. Also applied: `instrument_ids` with 60 000 uuids (2.3 MB) and `exclusions` with 300 000 two-character strings. **New:** a deeply nested value answers 500 (N1). |
| S5 targets | **Partly closed** | Refused `op_target_missing`: misfiled under R2; a ghost block; another company's relatório; an unknown relatório id; an equipment put filed under another obra. Refused `op_value_invalid`: an unknown or foreign `responsible_user_id` (a colleague applies); a point, block or file naming R2's or Empresa B's equipment, local or block, on create and on put. **Known `REFERENCE_FIELDS` gaps, reproduced live, all applied:** `location/parent_id` (R2's local, and an unknown id); `block/feeds_block_id` (R2's block); `setup/cover_photo_file_id` (unknown); `project/client_id` (unknown); `instrument_ids` (unknown ids). |
| S6 paid work and decoding | **Closed** (quota numbers await Matheus) | Race with 10 queued plate photos and 5 readings left: exactly 5 `reading_started`, 5 `quota_exceeded`, count stopped at 400. Reread at the ceiling: 429 `quota_exceeded`. Audit at the ceiling: 429. Three concurrent audits with 1 left: one 202 and two 409 `audit_running`, count 30. A 400 MP PNG bomb is refused 413 in 11 ms while health stays at 10 ms; a 110 MP PNG is stored in 460 ms. The UI shows "Limite diário de leituras atingido…" on the sheet and keeps the photo (screenshot s04). The reread of a done photo was not reached: the probe photos had no reading target. The cost of the reading quota is a known item. |
| S7 auth endpoints | **Closed** | `update-user` (also with a trailing slash, a double slash, `..`, a query, `%75` and upper-case `API`), `list-sessions`, `revoke-other-sessions`, `change-password`, `sign-up`, GET `sign-in` and POST `get-session` all answer 404. The name is unchanged. |
| S8 edges | **Closed, with one residual (N2)** | Push refused 403 `forbidden_origin`: `text/plain`; no Origin; foreign; `null`; `Sec-Fetch-Site: same-site`; `api:3000.evil.example`; `multipart`; Referer only. Preview, audit, telemetry, upload, reread and sign-out with a foreign Origin: 403. Telemetry: 429 after 1 801 events from rotating device ids; a 300 KB body gets 413. A removed photo answers 404 (original and thumb) and 200 again after restore. Health over four calls: 15, 19, 7, 8 ms (cached). The 5 MB push through local Caddy answers 413, not 502. HSTS: the infra `Caddyfile` run in a throwaway `caddy:2.11.4` container with `APP_DOMAIN=localhost` sends `Strict-Transport-Security: max-age=31536000` and strips the backend's `Server`; production was not checked. Login copy: an unknown e-mail and a wrong password both show "E-mail ou senha incorretos." **Residual:** a photo of a *removed relatório* is still served (N2). |

## 3. New findings, by severity

No High or Medium findings. All of these are Low or Info.

### N1 (Low): a deeply nested op value crashes the push with a 500 instead of refusing it

- **Reproduction:** `probe-e20b.ts b3`. A push of one `block/{id}/config` put whose value is nested 20 000 levels deep (340 KB) answers `500 internal_error` in 29 ms. The api log shows `unhandled route error … RangeError: Maximum call stack size exceeded` on `/api/sync/ops`.
- **Impact:** the api stays up (health 200), so this is not a crash. But the whole push fails as a server error instead of a per-op refusal. A device holding such an op would retry it forever, and every such request writes an error log line.
- **Where:** the value walk `stringsIssue` (`packages/domain/src/ops/value-limits.ts:178`) is recursive with no depth bound. It is called from `validate` at `apps/api/src/sync/apply.ts:216`. The zod parse before it may also recurse.
- **Fix:** bound the depth in `opValueIssue`/`stringsIssue` (say 32 levels; no real value is deeper than about 4) and return a value issue (`op_value_invalid`, alone). Also catch a `RangeError` per op in `validate` as `op_invalid`.

### N2 (Low): the photos of a removed relatório are still served

- **Reproduction:** `probe-e20.ts s8`, "a live photo of a removed relatório". Upload a photo and confirm `/api/files/{id}/original` answers 200. Push `relatorio/removed_at` (remove). The same GET still answers 200.
- **Where:** `apps/api/src/http/files.ts:341` checks only the file's own `removed_at` and its lookup.
- **Impact:** Story 20.13 says a tombstoned file answers 404. The relatório's tombstone does not reach its files, so anyone with the id keeps the photo after the relatório is gone.
- **Fix:** answer 404 when the file's relatório row is tombstoned too, keeping the revision DOCX/PDF exception. Add a case to `edges.integration.test.ts`.

### N3 (Low): sign-out leaves `relatorio-altitude-asked:{relatório id}` in localStorage

- **Reproduction:** open a relatório's setup, then press Sair and confirm. `Object.keys(localStorage)` still lists `relatorio-altitude-asked:01a1a5bf-0337-…`. This was seen both in `attack.mjs` and in the MCP pass.
- **Impact:** the next person on the device learns which relatório ids the previous user opened and the altitude the device read there. AC 20.11 says "nothing of the user on the device".
- **Where:** the key prefix is at `apps/web/src/surfaces/relatorio/setup/altitude-reading.ts:15`; `doSignOut` (`apps/web/src/state/session.tsx:389-411`) clears only the pointer.
- **Fix:** remove every `relatorio-altitude-asked:` key in `doSignOut`, or move that memo into the user's Dexie `local_prefs`. Add an assertion to `security-device.spec.ts` that `localStorage` holds no user-specific key after "Sair".

### N4 (Low; the behavior predates Epic 20, but 20.11 now hits it after every re-sign-in)

**What:** a deep link to Dados do relatório shows "Relatório não encontrado." for an Em revisão or Emitido relatório.

- **Reproduction:**
  1. Sign out, which now wipes the database.
  2. Sign in as `dev@local.dev`.
  3. Open `/relatorio/{id}/setup?etapa=1` of an Emitido or an Em revisão relatório.
  4. After 12 s it still says "Relatório não encontrado." Opening the Sumário pulls it, and after that setup works.
- **Where:** `apps/web/src/surfaces/relatorio/setup-surface.tsx:65` (also `section-text-surface.tsx`) does not use `RelatorioGate`, so it never makes the AD-8 "pulled on open" pull. The ficha, local, photos, points and Sumário surfaces do use it.
- **Fix:** wrap the setup and section-text surfaces in `RelatorioGate`.

### N5 (Info): the offline login sentence is no longer true after a sign-out

- **What:** offline, Login says "os relatórios já baixados neste aparelho continuam disponíveis após o login" (`apps/web/src/copy/pt-br.ts:30`). After Story 20.11 a sign-out deletes them. The sentence holds only for an expired session.
- **Fix:** Matheus to word it, for example "…os relatórios ainda neste aparelho…", or show it only when a database is present.

### N6 (Info): the trusted-origin wildcard is loose

- **What:** with the dev list (`http://localhost:*`), these Origins pass the push:
  - `http://localhost:3000@evil.example`;
  - `http://api:3000/` (trailing slash);
  - `HTTP://API:3000` (upper case).
- **Why only Info:** browsers never send these, and production builds an exact list (`infra/production/ecs.tf:40`).
- **Where:** `isTrustedOrigin` (`apps/api/src/auth/trusted-origins.ts`) turns `*` into `[^/]*`, which also matches `@` and `.`.
- **Fix:** parse the Origin with `new URL`, refuse any userinfo, path or trailing data, and let `*` match port digits only.

### N7 (Info): a telemetry event dated 2099 is accepted

- **What:** a telemetry event with `ts: 2099-…` answers 204.
- **Where:** `packages/domain/src/contract/telemetry.ts:197`.
- **Fix:** apply the same 10-minute future skew, or stamp the received time server-side.

Not counted as findings:

- The search's "Nenhum relatório encontrado…" appears twice in `innerText`. It is a visually hidden `role=status` plus the visible note, which is correct.
- The sample relatório keeps the old order (8 points, 9 tests) because it is a fixture-derived relatório, as AC 20.3-3 wants for relatórios created earlier.

## 4. Acceptance criteria checked (MCP browser pass as `dev@local.dev`, plus probes)

Widths covered: 390, 768 and 1280. One dialog was used at each width:

- 390: the sign-out confirm (s03);
- 768: Gerar relatório (s01);
- 1280: Novo relatório, twelve times.

There was no horizontal scroll at 390 or 768.

- **20.1:**
  - The tab title, wordmark, "Conta · Conforme", "Sincronização · Conforme" and the served splash "Carregando Conforme…" are all correct.
  - `git grep` finds no `'PRODUTO'` literal in `apps`, `packages` or `e2e`.
  - The DOCX `dc:creator` and `cp:lastModifiedBy` are "Conforme" on both revisions, and the DOCX body has no PRODUTO.
  - The storage ids are unchanged (`releng-*`, `releng.*`).
- **20.2:**
  - "porto" finds four relatórios: "Pôrto", "PORTO" and "Porto␣␣Velho" (accent, case and spacing all ignored).
  - A query covers Emitido. "testes" finds the Emitido card, which the default list hides.
  - The "Mostrando 10 de 13 relatórios" note shows on the results.
  - Em campo tile plus "porto" shows the no-match note. Releasing the tile keeps the query. The Rascunho tile narrows to its matches.
  - "xyzzy" shows the no-match sentence, and the board counts are unchanged.
  - The field has the label "Buscar relatório", a clear button and placeholder "Cliente ou obra". It is reached by Tab, focus stays in it while typing, Escape clears it, and the count is announced through `role=status`.
  - Checked at 390, 768 and 1280 (s02).
- **20.3:**
  - A new relatório's Sumário lists "Relatórios dos ensaios" before "Pontos de atenção".
  - In its PDF, the table of contents and headings read "8 RELATÓRIOS DOS ENSAIOS" (p. 8) then "9 PONTOS DE ATENÇÃO…" (p. 108), and section 9 starts a page.
  - The Points copy says "seção 9" on the new relatório and "seção 8" on the old one, and the Export dialog says "Seção 8 impressa no agrupamento".
  - The pre-existing (fixture) relatório keeps 8 points before 9 tests.
- **20.4:**
  - The picker is labelled "Equipamento ou local", is a listbox with groups and "Geral" first, and marks the current link as selected. Keyboard choice works and focus returns to the trigger.
  - Relinks checked: Geral to TR-TEST, TR-TEST to DJ-TEST (survived a reload), DJ-TEST to Geral, then back to TR-TEST.
  - On a current-seed relatório, a local option "Cubículo Enel · Verificações do local" links, and the PDF action table prints that Local/TAG.
  - On the old-seed sample no local option shows, by the kernel's design (site locals only).
- **20.5:**
  - No page of either PDF (12 and 108 pages) starts with a continued checklist or nameplate row.
  - The DOCX carries keep-next, cantSplit and tblHeader markup.
- **20.6:**
  - Each ficha starts its own page, with no extra break after the section heading.
  - On TR-TEST, the photos print after CONCLUSÃO in the order plate (Imagem 2), NC with "Item 1 · Limpeza · NC" (3), then the others (4, 5).
  - On the Não ensaiada DJ-TEST, the photo prints after the reason band.
  - A local's VERIFICAÇÕES DO LOCAL block sits on its own page.
- **20.7 to 20.10:** see the table in section 2. In the UI, the forward path generate, then "Marcar como enviado", then Emitido applied with no refusal.
- **20.9 UI:** "Informações adicionais" takes 20 000 of 20 500 pasted characters (`maxlength=20000`) and shows "20.000 de 20.000 caracteres".
- **20.11:** sign-out wipe; the confirm and "Cancelar"; restore online and offline; expired session online goes to `/login` and the outbox is sent after the same user signs in.
- **20.12:** the quota sentence on a sheet; the race; audits; the pixel bomb.
- **20.13:** see S7 and S8; the login copy.

Two documents were generated, each as DOCX and PDF, at `scratchpad/e20qa-docs/`:

- `rev1.*`: the sample relatório, rev. 1, marked Emitido, 12 pages;
- `new1.*`: a new current-seed relatório, 108 pages.

Screenshots (4) are in `.playwright-mcp/e20qa/` of the main checkout: `s01-export-dialog-768`, `s02-home-search-emitido-390`, `s03-signout-pending-390`, `s04-quota-sentence-768`.

**Not checked:**

- **Story 20.5 AC 3:** a checklist longer than a full page splitting at a row with its header repeated. No seed type is that long.
- **Story 20.7, UI side:** the refusal sentence shown through the device's rejected list, and the two-device status race. The probes and `status-transition.integration.test.ts` cover the server side.
- **The `statusSeen` prev-op exploit:** a known static item, not re-probed.
- **Story 20.12 reread:** the reread of a done photo spending nothing. The probe photos failed with no reading target, and real readings need Bedrock.
- **Production:** HSTS and the absent `Server` header on the real domain, and `terraform plan` for the CloudWatch metric (AWS session expired).
- **The clock-skew loss in the UI:** a device clock 15 minutes ahead. Only the server half was reproduced (the -60 min and +11 min refusals).
- **iPad/WebKit by hand:** the matrix covered it automatically.

Test data left behind:

- **Empresa Local Dev:**
  - twelve QA relatórios (clients "Pôrto Energia S.A." and others);
  - the sample relatório at Emitido rev. 1, with photos and one point;
  - "Kappa Varejo" at Em revisão rev. 1;
  - a 20 000-character `additional_info` on "Pôrto Energia".
- **The worker-0 e2e companies:** the probe relatórios. The next e2e run resets them.

The stack was stopped with `podman compose stop`, without `-v`.
