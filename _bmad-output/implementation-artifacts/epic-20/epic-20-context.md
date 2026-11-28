# Epic 20 Context: Conforme, and the field feedback of 2026-11-03

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. Compiled inline by the coordinator on 2026-11-03 from the investigation of main cf468e3d (three read-only passes: the product name, the five feedback items, the epics conventions). -->

## Goal

Name the product Conforme, and act on five field feedback items Matheus relayed on 2026-11-03. Two of them are on screen: a Home search, and relinking a point of attention. Three are about the document: the order of sections 8 and 9, tables that split across pages, and where photos sit in a ficha.

## Stories

- Story 20.1: The product is called Conforme: the one constant, the page title and the boot splash
- Story 20.2: Search Home by client and obra
- Story 20.3: Pontos de atenção after the ensaios: the tests section prints before the points section on every new relatório
- Story 20.4: Change the equipment or local of a point of attention
- Story 20.5: The nameplate and verification tables never start on one page and end on the next
- Story 20.6: Each equipment on its own page with all its photos at its end
- Story 20.7: The server decides which status moves a relatório may make
- Story 20.8: The server checks who and when an op says
- Story 20.9: Every op value has a size and a type the server enforces
- Story 20.10: Every op lands on a row that exists in the relatório it names
- Story 20.11: Signing out leaves nothing of the user on the device
- Story 20.12: Paid readings, audits and image decoding have a ceiling
- Story 20.13: The edges: auth endpoints, cross-site writes, telemetry, removed files, HSTS and the login copy

Waves: one wave A in two stacks. The web lane is 20.1, then 20.2, then 20.4; those stories share `copy/pt-br.ts` and the e2e shell specs. The document lane is 20.3, then 20.5, then 20.6; those stories share `docx.ts`, `sections/section-9.ts`, `print/section-9.ts` and the layout golden.

*(2026-11-03, Matheus: the security pass (`test-artifacts/manual/security-pass-2026-11-03.md`) joins as wave B. It starts after wave A merges and passes its wave gate, in two stacks:*
- *The server lane is 20.7, then 20.8, then 20.9, then 20.10. These stories share `apps/api/src/sync/apply.ts` `validate`, `packages/domain/src/contract/errors.ts` and `e2e/security-ops.spec.ts`.*
- *The edge lane is 20.11, then 20.12, then 20.13. These stories share `copy/pt-br.ts`, `http/app.ts` and the auth specs. 20.12 and 20.13 start after 20.7 merges.*

*20.7 bumps the contract to 29 once, for every new code of the wave. A second hands-on security pass on the integrated main precedes the deploy.)*

## Security wave (B): requirements and constraints

- **The kernel holds every rule. The server calls it in `validate` (`sync/apply.ts` lines 150 to 194) and in the apply transaction under the company's advisory lock.**
  - The status validator reads AD-22's table (`status/table.ts`). The forward moves come from `statusTable`, and the backward moves are `manualMove`.
  - The attribution table, the value schemas per path family and field, and the target check are all kernel exports. A guard test enumerates every family.
- **What the server checks against:** the status, rows and jobs the server holds when the op applies, never the device's view.
  - A stale device's refused op lands in its rejected list with a kernel sentence. The rest of its batch applies.
  - A put on a tombstoned row still applies (LWW).
  - The merge redirect (`mergedInto`) runs before the target check.
- **What stays allowed:** edits to an Emitido relatório, because the issued revision is frozen and the next generate builds N+1. Past instants also stay allowed, because a tablet works offline for days.
- **New codes, in contract 29, append-only in `contract/errors.ts`:**
  - op refusals: `op_status_transition`, `op_attribution`, `op_value_invalid`, `op_target_missing`;
  - errors: `quota_exceeded`, `forbidden_origin`.
- **Sign-out (20.11):**
  - First `Dexie.delete` of `releng-{user_id}`, then the user's cached files, then `clearLastSession()`. The flush comes before all of this, as the Export dialog does.
  - An online boot with a 401 goes to `/login` and does not open the database.
  - An offline boot keeps the re-auth banner (AD-9 otherwise unchanged).
  - The storage identifiers of Story 20.1 stay as they are.
- **No paid key in any test:** `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake`. Quotas are env variables with the defaults written in Story 20.12, and the CloudWatch metric goes through Terraform in `infra/`.
- **Regression specs:** `test-results/adhoc-sec/` (gitignored: `attack.mjs`, `online.mjs`, `inject.mjs`, `render.mjs`) holds the reproductions. They become `e2e/security-ops.spec.ts` (20.7 to 20.10, 20.13) and `e2e/security-device.spec.ts` (20.11), both `@p0`. The Secure cookie needs `localhost`, which the e2e base URL already is.
- **Durability:** 20.7 and 20.10 change the commit path, so their durability specs also run on the matrix projects (story gate, E10-A1 as amended by E11-A1).

## Open readings of wave B (coordinator's, to be corrected by Matheus)

- **20.7:** no roles; every member keeps every move.
- **20.8:** a clock skew of 10 minutes into the future; nothing earlier than the relatório's creation.
- **20.9:** caps of 200, 1 000 and 20 000 characters; altitude from -500 to 9 000 m; a sync body of 4 MB.
- **20.10:** a relatório with an issued revision cannot be removed until it is moved back to Em revisão.
- **20.11:** sign-out deletes the device data after a flush and a confirm; an online boot with a 401 goes to `/login`.
- **20.12:** 400 readings and 30 audits per company per day; 120 megapixels.
- **20.13:** the per-e-mail sign-in limit is kept, and the lockout is an accepted risk.

## Requirements & Constraints

- The name lives in `packages/domain/src/product.ts` (`PRODUTO`, value `Conforme`). These strings bypass the constant today and must follow it:
  - `apps/web/index.html` lines 6 and 44;
  - `copy/pt-br.ts` line 1604.

  These identifiers are not the product name and stay as they are:
  - `releng-{user_id}` (Dexie, `db/schema.ts` line 321);
  - the `releng.*` localStorage keys (`db/prefs.ts`, `state/last-session.ts`);
  - the service-worker caches `releng-shell-*` and `releng-hold` (`public/sw.js`);
  - the better-auth cookie prefix `releng` (`apps/api/src/auth/auth.ts` line 49);
  - every `fasor-*` AWS name, and the domain.
- Tests that assert the literal `'PRODUTO'` and change with Story 20.1:
  - unit: `domain.test.ts:6`, `app-shell.test.tsx:111-117`, `login-surface.test.tsx:152`, `shell-version.test.ts:63`, `docx.test.ts:407,425`;
  - e2e: `shell.spec.ts:5`, `auth.spec.ts:52,86,100`, `ui-hygiene.spec.ts:192,194`, `durability.spec.ts:159`, `cadastros.spec.ts:733`, plus the title in `loading-states.spec.ts`.

  `boot-splash.test.ts` already checks `index.html` against the constant. The goldens do not carry the name.
- The kernel computes every selection, match, order, number and text. The web renders what the kernel returns and keeps only screen state (the query, the pressed tile, the picked link before save).
- Home search:
  - In the kernel: a normalized key per `HomeCard` (client and obra through `normalizeRegistryName`), a `query` option on `homeList` applied after the tile filter and before the page cut, and a no-match text in the kernel.
  - The telemetry target `home.search` records use, never text (AD-28).
- Point relink:
  - `writePoint` puts `equipment_id` and `location_id` as one batch.
  - `PointField` (`relatorio/ops.ts` line 46) gains `location_id`. The op path (`ops/path.ts` lines 70 to 77) already allows both, so there is no contract bump.
  - The picker is built on `photoEquipmentGroups` (`photos/gallery.ts` lines 309 to 345).
- Section order: `instantiateTemplate` (`relatorio/instantiate.ts` line 229) gives new relatórios ENSAIOS at 8 and PONTOS at 9.
  - The fallback `seedSectionNumbers` (`relatorio/sumario.ts` lines 198 to 202) and every existing relatório keep their order.
  - Printed numbers are positions (`print/layout.ts` line 222).
  - The points section needs its own page break (`docx.ts` line 343 breaks only before the sheets section).
- Tables: `sections/section-9.ts` `drawRow` (lines 112 to 129) sets `cantSplit` on every row and `keepNext` only on header, band and group rows. The fallback wrapper is section 10's one-row `cantSplit` table (`sections/section-10.ts` lines 18 to 40). Prove the result on the PDF, not only on the XML (`docx.ts` lines 340 to 342).
- Photos: `print/section-9.ts` `sheetOf` (lines 830 to 865) and the Não ensaiada branch (line 846) print one photo part, last, after CONCLUSÃO; `localPartsOf` (lines 432 to 440) does the same for a local.
  - The numbering order of `documentPhotoOrder` (`print/photo-order.ts` lines 78 to 116) is unchanged.
  - A page break precedes each equipment's first heading, never doubled after the section heading.
- PDF page proof: `e2e/support/pdf-text.ts` has no page numbers today. Story 20.5 adds a per-page read, and Story 20.6 uses it.
- No seed bump and no contract bump are planned. Everything runs in containers through compose. The story gate is lint, static, test:unit, test:api and the touched Playwright specs.

## Open readings (coordinator's, to be corrected by Matheus)

- 20.2: with no tile pressed and a query typed, the search covers every status, Emitido included.
- 20.6: the photo block sits after CONCLUSÃO, which reads his "após os dados do ensaio … entre um equipamento e outro". A local's block also starts on a new page.

## Technical Decisions

- Mocks are the source of class names. A mock that changes gets a dated comment, and EXPERIENCE.md and MOCK-GUIDE get a dated note. `tokens.css` and `components.css` stay byte-identical, so their "PRODUTO (fasor)" header comments stay too.
- The layout golden `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json` is rewritten with `GOLDEN_UPDATE=1`, and every diff is explained in the PR. The kernel goldens under `packages/domain/fixtures/porto-seguro/` pin data, not layout, and should not move.

## Batch plan (2026-11-03, Matheus: "agrupe as histórias … menos PRs … gastar menos tokens, entregar mais rápido, sem perder a qualidade")

There are four batches, so four PRs for thirteen stories. They run in two lanes, so at most two batch stacks are up at a time (load rules of 2026-10-08). Each batch runs `bmad-build-auto` in its own worktree, following `epic-batch-orchestrator.md`. The wave lettering above becomes:
- wave 1: e20s and e20w;
- wave 2: e20d and e20e.

The server lane goes first because it closes the two High findings soonest and shares no file with the web lane.

| Wave | Tag | Port base | Branch | Stories | Dev model | Base |
|---|---|---|---|---|---|---|
| 1 | e20s | 51 | `e20s-server-rules` | 20.7, 20.8, 20.9, 20.10 | opus · max | main `266f12bf` or later |
| 1 | e20w | 52 | `e20w-web-conforme-search-relink` | 20.1, 20.2, 20.4 | opus · high | main |
| 2 | e20d | 53 | `e20d-document-order-tables-photos` | 20.3, 20.5, 20.6 | opus · high | main after e20s merges |
| 2 | e20e | 54 | `e20e-device-quotas-edges` | 20.11, 20.12, 20.13 | opus · high | main after e20s and e20w merge |

**Coordinator decisions.**
- **Contract and versions:**
  - e20s owns contract 29 and adds all six codes, including `quota_exceeded` and `forbidden_origin` for e20e.
  - No other batch bumps the contract.
  - No seed bump is planned.
- **Shared files between concurrent batches.**
  - Wave 1:
    - `contract/errors.ts` is e20s's alone.
    - Each batch appends to `deferred-work.md` under its own heading.
    - e20w does not touch `sync/apply.ts`, and e20s does not touch `copy/pt-br.ts`.
  - Wave 2:
    - e20d owns `docx.ts`, `sections/section-9.ts`, `print/*` and the layout golden.
    - e20e owns `state/session.tsx`, `http/app.ts`, `http/files.ts`, `http/telemetry.ts`, `http/reading.ts`, `http/audit.ts`, `storage/variants.ts` and `infra/caddy/Caddyfile`.
- **Readings.** The coordinator's readings in each DoR are taken as written. Matheus said go without correcting them on 2026-11-03.
- **Facts the batches share:**
  - The security reproductions are in the main checkout at `/Users/matheusvilella/Documents/estudos/fasor-app/test-results/adhoc-sec/`. They are gitignored, so they are absent from the worktrees. Read them there.
  - The session cookie is `Secure`, so a Playwright test must reach the app on `localhost`.
  - Ops are pushed to `POST /api/sync/ops` as `{ops}` (at most 500). Pulls need `x-contract-version`.
  - The test company is Empresa A, `a@teste.local`.
- **Gates.**
  - Each batch runs the story gate: lint, static, test:unit, test:api and its touched specs. Its touched durability specs also run on the matrix projects when it changes the commit path; e20s and e20e do.
  - Before the second PR of a wave merges, the cross-batch merge rule (§ 6) applies.
  - After wave 2 comes one integrated gate on main: `test:e2e:full` and the matrix, with the load line.
  - After that comes one integrated review, then the second hands-on security pass, then one fix batch if needed.
  - The deploy happens only on Matheus's word.

## Wave gate, integrated review and deploy gate (2026-11-04)

- **Wave gate on `76cbdb79`** (main after #237 to #240), run by the integrated QA agent under the host lock, `LOCKED_AFTER` 5 s:
  - `pnpm verify`: green, 1917 s. Load `{ 2.66 2.92 3.42 }` at the start and `{ 2.96 3.24 3.81 }` at the end; nothing else ran on the host. test:api 809 passed and 3 skipped, test:unit 5020, `@p0` 339 of 339.
  - `test:e2e:full`: 559 of 563, 4 skipped, 0 failed, 0 flaky, 2649 s. Load went from 3.29 to 5.74, because the e20f batch stack started mid-run.
  - `test:e2e:matrix`: 124 of 138, 14 skipped (touch-only or WebKit), 0 failed, 771 s, load up to 11.51.
- **Integrated review and second security pass:** `_bmad-output/test-artifacts/review-e20-integrated-2026-11-04.md`.
  - S1, S3, S6, S7 and S8 are closed.
  - S2, S4 and S5 were partly closed.
  - Four Medium static findings and six Low or Info items went to fix batch e20f, PR #241, merged as `df65be05`.
  - Left for Matheus: an expired session keeps its database (AD-9); a colleague's conclusion put back after a reopen; the cost of the 400-a-day reading quota against the USD 100 ceiling.
- **`test:e2e:full` on `df65be05`**, under the lock, `LOCKED_AFTER` 0 s. Load `{ 3.87 3.59 3.55 }` at the start and `{ 3.45 3.91 4.03 }` at the end; the main stack only.
  - Result: 564 of 569, 4 skipped, 1 failed.
  - The failure was `review-layout-copy-3.spec.ts` F-15 (`@p1`). It is explained: the test put certificate ids naming no file, which the e20f reference check refuses. It is fixed in PR #242 by creating the files.
- **Deploy gate on `0d0a2908`** (PR #242: the F-15 fix and `RELATORIO_MAX_BYTES` 4 MiB on Matheus's word), under the lock, `LOCKED_AFTER` 0 s. Load `{ 3.33 3.81 3.99 }` at the start and `{ 6.76 5.59 5.33 }` at the end; the main stack only.
  - lint 0, static 0.
  - test:api: 824 passed and 3 skipped.
  - test:unit: 5060.
  - `test:e2e:full`: 565 of 569, 4 skipped, 0 failed, 0 flaky, 2490 s.
  - The commit after it changes only this record.

## Batch e20h and its deploy gate (2026-11-04)

- PR #244 (`10e87157`): seed v1 to v5 gain VÁCUO/ÓLEO on the disjuntor and ÓLEO on the transformador de força (`seed/legacy-options.ts`); the empty REGISTRO FOTOGRÁFICO names the tests section; `enable_night_schedule` false. Story gate: lint, static, test:unit 5063 passed, test:api 826 passed and 4 skipped, touched e2e 11 of 11.
- Terraform applied from main `10e87157` at about 12:30 (America/Sao_Paulo): 0 added, 0 changed, 4 destroyed (the two night schedules, their role and policy); `scheduler list-schedules` lists none. Production runs 24 h.
- Deploy gate, `test:e2e:full` on `10e87157` under the host lock: parallel 403 tests, 399 passed, 4 skipped, 0 failed, 0 flaky (1037 s); serial 167 of 167 passed (1318 s); total 566 passed, 4 skipped, 0 failed, 2360 s wall. Deploy of the next main commit (this record on top of `10e87157`) follows.

## E20-A1 wave gate and deploy (2026-11-04)

- Wave gate on main `e0b47ad4` (PR #250, the E20-A1 fix batch), under the host lock, `LOCKED_AFTER` 0 s (the lock was free). Load `{ 3.27 2.55 2.15 }` at the start (21:19, America/Sao_Paulo); the end load was not taken (gap against § 8, E18-A3); the main stack only, no batch stack up.
  - `test:e2e:full`: parallel 423 tests, 419 passed, 4 skipped (926.7 s); serial 151 of 151 (1135.3 s); total 570 passed, 4 skipped, 0 failed, 0 flaky, 2068 s wall.
  - `test:e2e:matrix`: parallel 108 tests, 95 passed, 13 skipped (239.7 s); serial 42 tests, 41 passed, 1 skipped (234.8 s); total 136 passed, 14 skipped, 0 failed, 0 flaky, 478 s wall.
- Deploy of `e0b47ad4` with `infra/bin/deploy` (no lockf wrapper), on Matheus's word ("pode seguir e deploiar"): build, push, migrate and roll green; production smoke 8 of 8 (plate reading 12 fields, PDF preview 447 009 bytes, Revisão 1, DOCX 104 109 and PDF 380 699 bytes); telemetry 7 `session_start` with `app_version` e0b47ad4 since 01:02:45Z, 0 `ux_event_sink_failed`; test company cleaned up.
- "Before the deploy" ledger rows (E20-A4, P-3): the e20s over-cap count was the one open; it ran after the deploy (E20-A3, 0 values over cap, `deferred-work.md` e20s row).
- PR #251 marked `epic-20-retro-item-163-e20-a1-fix-batch` done.
