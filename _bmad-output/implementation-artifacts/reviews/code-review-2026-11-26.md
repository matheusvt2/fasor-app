# Code review 2026-11-26: smells, duplication and security

Asked by Matheus on 2026-11-26. Six independent reads of `main` at `baa388c9`: four for code smells and
duplicated code (one per area), two for security (server application; client, edge, infrastructure and
supply chain). Then a cross-reference of the findings, and the security fixes of branch
`security-pass-2026-11-26`.

Limits of this review: it was done by reading. The duplicate detector (jscpd) could not be run, so
duplication is found, not measured. No unused-export analysis was done. Each area lists what it did not read.

## 1. Summary

- No critical or high security finding. Tenant isolation, role checks and the auth flows hold on every
  route read, and the fixes of the 2026-11-03 pass (S1 to S8) still hold, with one bypass (A3).
- The security gaps are cost and resource abuse by a signed-in user, mostly in the Epic 31 voice code
  (not deployed yet), and one infrastructure gap (B1).
- The code is healthy in every area: no `as any`, no stray `fetch` or `process.env`, boundaries respected.
  The debt has one shape everywhere: a feature is copied from its sibling and then adapted
  (section 3, X1).

## 2. Findings by area

Only the findings with the highest maintenance cost are listed. `D` = duplication, `S` = smell.

### 2.1 `packages/domain/src`

| # | Kind | Where | What | Fix |
|---|---|---|---|---|
| D-1 | D | `audio/write.ts:61`, `audio/rewrite.ts:69`, `audio/context.ts:117`, `audio/target.ts:21,54` | Parallel switches over `AudioTarget`; write and rewrite resolve the same field twice | One `audioField(snapshot, target)` in `audio/field.ts` returning `{ text, replace, restore }` |
| D-2 | S | `relatorio/pre-issue.ts:396-719` | `preIssue` is one function of 324 lines, about 30 checks | Split per printed row in the same file |
| D-3 | S | `relatorio/reading-evaluation.ts:659-916` | `evaluateTable`: 258 lines, 8 parameters | Extract `ratioContext`, `judgeCapture`, `rowCondicao`, `carryUnits` |
| D-4 | D | `measurement-evaluation.ts:810` and `restriction.ts:46` (`pctText`); `reading/display.ts:186` and `reading-cells.ts:510` (`unitsOf`); `VERDICT_RANK` at `measurement-evaluation.ts:1665` (1/2/3) and `reading-run.ts:127` (0/1/2) | Small helpers repeated between the two evaluation engines, with drift | A leaf `relatorio/reading-text.ts` |
| D-5 | D | `String(n).replace('.', ',')` in 12 places (`seed/criteria.ts:149-158`, `types/draft-edit.ts:382,813`, `checks/value-remarks.ts:17`, `relatorio/sumario.ts:151`, `print/section-9.ts:574`, `files/tile.ts:35` and others); `valueText` with a NBSP at `print/history-note.ts:152` and a plain space at `audit/rules.ts:65` | Number and unit formatting scattered | `formatNumberPtBr` and `withUnitText` beside `formatDecimalGroupedPtBr` |
| D-6 | D | Accent stripping in six files (`types/draft-edit.ts:35`, `relatorio/tag.ts:102`, `text/normalize-name.ts:11`, `parse/utterance.ts:39`, `relatorio/section-variables.ts:102`, `audio/guard.ts:121`); `present`/`blank`/`textOf` in 14 | Micro-helpers per file with different contracts | `stripAccents`, `isBlank`, `presentText` in `text/` |
| D-7 | S | `ops/apply.ts:257,832,909,996`, `status/edited-since.ts:57,167`, `permissions/map.ts:129`, `print/sm-c1.ts:13-21` | Sheet path families listed in several places; `sm-c1.ts` omits `sheet/test/row` and `sheet/test/row/cell`, so the SM-C1 metric may skip added-row cells (not confirmed) | Export `isSheetFamily` from `ops/path.ts`; confirm the metric first |
| D-8 | S | `ops/apply.ts:637-655` | `MANUFACTURER_CHECK_FROM = 13` compares a seed version number, against AD-21 (`seed/definitions.ts:217-225`) | A seed-derived predicate; high risk (replay) |
| D-9 | S | `relatorio` imports `print` 14 times, `print` imports `relatorio` 53 times; `seed` imports `relatorio` | Two-way imports | Move `print/reading-slots.ts`, `print/visit-date.ts` to `relatorio/` |
| D-10 | S | `contract/version.ts` | 1127 of 1192 lines are a changelog in comments | Move the history to a document |

Also: 13 `as unknown as` casts for row-to-`JsonValue` and draft entries; `(block.config as { section_text?: unknown })` in five files; `print/section-9.ts` holds 27 of about 340 non-null `!`.

### 2.2 `apps/web/src`

| # | Kind | Where | What | Fix |
|---|---|---|---|---|
| W-1 | D | `surfaces/export/use-audit.ts:92-190`, `use-preview.ts:111-200`, `use-generate.ts:326-342` | The "drain, ask, poll" loop of a server job three times; `MAX_ROUNDS = 10` three times | `askBehindBarrier`, `pollUntilSettled`, `classifyJobError` in `surfaces/export/server-job.ts` |
| W-2 | D | `registries/client-panel.tsx:224`, `instrument-panel.tsx:479`, `word-registry-panel.tsx:248`, `empresa-tab.tsx:272`, `templates/type-editor-parts.tsx:119` | The committed text input five times, with three different rules for a remote edit; the client and word fields ignore remote edits | One `components/committed-text-field.tsx` on `useTextField` |
| W-3 | S | `surfaces/points/point-editor.tsx:152-842` | One component of 690 lines, 10 `useState`, 21 `useRef` | Extract `usePointDeadline`, `usePointPriorityWrites`, `usePointLink` |
| W-4 | D | `api/admin-roles-client.ts:23`, `api/admin-users-client.ts:35` | Same client, two result shapes; only one maps a 429 | `api/json-call.ts` |
| W-5 | D | 33 `where('entity').equals(...)` and 28 `safeParse(record.row)`; `pendingRows` verbatim at `state/reading-arrivals.tsx:53` and `db/suggestion-store.ts:52` | Dexie row readers repeated | Export `liveRows`/`rowsWhere` from a `db/rows.ts` |
| W-6 | D | `ficha/conclusao-section.tsx:107`, `setup/etapa6-parecer.tsx:101`, `components/tri-state-control.tsx:50` | Roving segmented control three times | `input/use-roving-segments.ts` |
| W-7 | S | About 185 `.catch(() => ...)` | A refused write and a broken write look the same; nothing is recorded | `ignoreRefusal(promise, tag)` that reports the unexpected |
| W-8 | D | `sha256Hex` (`components/upload-tile.tsx:53`, `files/photo-encode.ts:53`), `EXIF_HEAD_BYTES`, `CAPTION_CAP`, the timers adapter (5 files), race-with-timeout (3 forms), `focusLost` | Small copies | Import the exported one |
| W-9 | S | `api/auth-client.ts:71,244` | The only client that sends no `CONTRACT_VERSION_HEADER` | Comment it or fold it into W-4 |

### 2.3 `apps/api/src`

| # | Kind | Where | What | Fix |
|---|---|---|---|---|
| A-1 | D | `jobs/generate/worker.ts:58`, `jobs/audit/worker.ts:38`, `jobs/reading/worker.ts:37,140`, `jobs/transcription/worker.ts:31,78` | Queue worker plumbing four times, with drift: transcription logs an invalid payload but never fails its audio, and has no dead-letter backfill | `defineQueue` in `jobs/queue.ts` |
| A-2 | D | `jobs/reading/job.ts` and `jobs/transcription/job.ts`; `jobs/reading/status.ts` and `jobs/transcription/status.ts`; `http/ai-write.ts:101-157` | Reading and transcription attempts are twins; ai-write repeats the writing step and the run row | `jobs/attempt.ts`, one `fileStatusWriter`, `jobs/transcription/run-row.ts` |
| A-3 | D | `http/generate.ts:218`, `http/audit.ts:94`, `http/ai-write.ts:77`; `fail()` in six files; `bodyOf`/`invalid`/`answer` verbatim in `http/admin-users.ts:38` and `http/admin-roles.ts:33` | Route preamble and response helpers per file | `http/respond.ts`, `http/barrier.ts` |
| A-4 | S | `invalid_request` with 409 (`ai-write.ts:99`, `audios.ts:56`) and with 400 elsewhere; `relatorio_not_found` (`sync/routes.ts:102`) and `not_found` (`generate.ts:70`) | Inconsistent error shapes | One table of route errors (the web reads the codes) |
| A-5 | S | `sync/apply.ts` (1099 lines) | Client-op predicates at `:113-166,218-281` live in the api while their siblings are in the kernel; `:654-672` builds a server op by hand; five queries per op under the lock | Move the predicates to the kernel; split the file; high risk |
| A-6 | S | `jobs/generate/job.ts:465` (`firstIssuedAtOf` mirrors the kernel's `firstIssueOf`); `admin/users.ts:239,124`; "absent status reads active" in `admin/users.ts:99`, `auth/auth.ts:71`, `http/session.ts:77` | Ownership leaks (AD-1) | Kernel helpers `userStatusOf`, `orderUsers` |
| A-7 | S | `generation_job/…` and `file/${id}` paths built by hand in six files | Beside the kernel's path builders | `formatPath` |
| A-8 | S | `http/app.ts:186-201` and `config.ts:125,159-167`; `LimitRule` and `RateLimitRule` | Defaults written twice | One `limits.ts` |
| A-9 | S | `ai/errors.ts:45` | `BilledCallError` names itself `PermanentReadingError`, with no comment saying it is deliberate | Comment or rename |

### 2.4 Tooling, tests and infrastructure

| # | Kind | Where | What | Fix |
|---|---|---|---|---|
| T-1 | D | `openSheet` in 29 specs; `setUp` in 22; `issue` in 11; `toast` in 90, `outbox` in 68, `stepper` in 50 | 222 specs each carry the same dozen helpers | `openSheet`, `seedStandardRelatorio`, `issueRevision`, `support/locators.ts`: about 2,000 lines less |
| T-2 | S | `JOB_TIMEOUT = 150_000` in 46 specs plus 41 bare; `timeout: 30_000` 983 times | Timeouts as literals | Export from `e2e/support/sync.ts` |
| T-3 | S | 33 `waitForTimeout` in 22 specs (about 50 s) | Fixed sleeps; the lint rule is only `warn` | `page.clock` or one `expectStays()` |
| T-4 | S | `infra/bin/deploy` (556 lines) | Parsing, build, ECS polling, telemetry and smoke in one script; nine dry-run seams in the production path | Split into sourced files |
| T-5 | D | `infra/caddy/Caddyfile:27-33,43-49,63-68` | Header block three times | A Caddy snippet |
| T-6 | S | Caddy, Terraform, pnpm and Playwright versions in several files | No test binds them | One test in the style of `scripts/security-pins.test.ts` |
| T-7 | S | `scripts/build-tagged-image.sh`; `infra/production/budget.tf:2,8` | Dead script; comment says 100 % where the threshold is 90 | Delete; correct |

## 3. Cross-reference

What shows up in more than one area, and so should be fixed once.

- **X1. Sibling features are copied on both sides of the wire.** Generate, preview and audit are copied in
  the api (A-3) and in the web (W-1). Admin users and roles are copied in the api (A-3) and in the web (W-4).
  Audio write and rewrite are copied in the kernel (D-1) and again in the api (A-2). Fix each as one vertical
  slice (kernel, api, web), not area by area.
- **X2. Two security findings are duplication drift.** Transcription was copied from reading without its
  guards: reading has a daily quota and a dead-letter backfill, transcription has neither (A-1, security A1).
  The transcription job writes text through server ops, which skip the value caps client ops meet
  (security A3). A shared attempt and queue framework (A-1, A-2) would have carried the guards along.
- **X3. Decimal comma.** 12 places in the kernel (D-5) and one in the web
  (`surfaces/templates/type-editor-parts.tsx:811`). One kernel formatter.
- **X4. Two e-mail rules.** The login checks a regex (`apps/web/src/surfaces/login/email-check.ts:4`); the
  user dialog and the api check the kernel's schema (`packages/domain/src/contract/admin-users.ts:52`, private
  there); the api lower-cases and trims in two places (`admin/users.ts:304`, `http/rate-limit.ts:120`).
  Export one `emailSchema` and one `normalizeEmail` from the kernel.
- **X5. Two "today".** `apps/web/src/surfaces/relatorio/setup/etapa2-escopo.tsx:38` takes the UTC date;
  `etapa1-capa.tsx:16`, `etapa5-local.tsx:14` and `new-relatorio-dialog.tsx:99` take the São Paulo date
  through the kernel. After 21:00 local the two differ by a day. What the value feeds
  (`defaultExclusions`) was not traced.
- **X6. Error codes.** The api answers the same failure with different codes and statuses (A-4); the web
  repeats the error ladder three times (W-1) and has two result shapes (W-4). One table in the contract
  would serve both.
- **X7. Ownership leaks in both apps.** The api derives (A-6, A-5); the web formats
  (`numberText`, `FULL_DATE` at `ficha-fields.tsx:512` and `point-editor.tsx:845`). Each has, or should have,
  a kernel helper.
- **X8. Row to `JsonValue` and op paths.** 13 casts in the kernel, 7 in the web
  (`relatorio-ops.ts:47,52,89`, `template-ops.ts:32`, `type-ops.ts:31,36,46`), hand-built paths in the api
  (A-7). One `toJsonValue` and the kernel's `formatPath` everywhere.
- **X9. Hashing.** `sha256` is written twice in the web (W-8) and five times in the api
  (`http/files.ts:101`, `jobs/generate/job.ts:162`, `jobs/generate/sections/section-11.ts:97`,
  `http/rate-limit.ts:120`, `db/sample-relatorio.ts:32`).
- **X10. Limits written in two places.** Api defaults twice (A-8); the OCR sidecar's 55 s must stay below
  the api's 60 s abort (`services/ocr/app/main.py:60`); the specs repeat the job timeout (T-2); the web
  repeats `MAX_ROUNDS` (W-1); the api env list is written in `docker-compose.yml` and in
  `infra/production/ecs.tf:42-70`.
- **X11. Errors that vanish.** About 185 silent catches in the web (W-7); 44 `String(error)` in api logs,
  which may carry query parameters into CloudWatch (security hardening, not confirmed).

Suggested order: X2 with security A1 and A3 before Epic 31 is deployed; then W-2 (it also fixes a visible
behaviour: remote edits ignored on two registry screens); then T-1 (cheapest large reduction); then X1 slice
by slice.

## 4. Security

Severity as the reviewers gave it. CONFIRMED means every step was read in the code; PLAUSIBLE names the
assumed step. Nothing was run against any host.

### 4.1 Fixed in branch `security-pass-2026-11-26`

| Id | Severity | Finding | Change |
|---|---|---|---|
| A2 | Medium, CONFIRMED (disk impact PLAUSIBLE) | One user could push about 480 MiB a minute into the append-only op log: a put that replaces a value with one of the same size costs the relatório budget nothing | `pushRateLimit` also limits bytes per user: `PUSH_BYTES_RATE_LIMIT`, 128 MiB an hour, on with the rate limits. The number is a reading; confirm it against the largest real sync |
| A5 | Low, CONFIRMED | "Esqueci minha senha" could send one address 7,200 e-mails a day, each replacing the link just received | A second window per e-mail: `PASSWORD_RESET_EMAIL_HOURLY_LIMIT`, 6 an hour, on with the rate limits |
| B1 | Medium, PLAUSIBLE (the managed policy's content is not in the repo) | Every task runs in host network mode, so any container (ocr, Caddy, api) can act as the instance role, whose `AmazonSSMManagedInstanceCore` reads every SSM parameter: the database URL and the session secret | `aws_iam_role_policy.instance_no_secrets` in `infra/production/compute.tf`: an explicit deny. **Written, not applied**: it takes effect with a Terraform apply, on Matheus's word |
| B2 | Medium, CONFIRMED | The aws-cli and Terraform images, which receive the admin session, and the check-time Caddy image were pinned by tag only | Pinned by digest (the multi-arch index, checked against the registry) in `infra/bin/lib.sh`, `infra/bin/tf`, `infra/bin/check` |
| H1 | Hardening | `/api/*` answers carried no Content-Security-Policy | `API_CONTENT_SECURITY_POLICY` (`default-src 'none'; frame-ancestors 'none'`) on every `/api/*` answer |
| H2 | Hardening | The certificate's tab kept `opener` (`registries/instrument-panel.tsx:189`) | Reset, as the export preview does |
| B6 (part) | Low | `docs/kbs/log.md-e`, a `sed -i` backup, was tracked | Removed; `*.md-e` ignored |

Verified: `apps/api/src/http/security.test.ts` (27 tests, six new) and four neighbouring api test files
(70 tests in all), the web registries tests (74), eslint on the changed files, the api and web typechecks.
Not run: the integration tests, any Playwright spec, `terraform validate` and `plan`, the full gate.

### 4.2 Open: Epic 31 (not deployed), to close before its deploy

| Id | Severity | Finding | Proposed fix |
|---|---|---|---|
| A1 | Medium, CONFIRMED | Transcription and the AI control ("Melhorar o texto com IA") have no daily quota; `AiUsageKind` is `'reading' \| 'audit'` only (`db/repositories/ai-usage.ts:12`). An audio is accepted up to the generic 25 MB (`files/candidate.ts:95`), and the 180 s limit is the device's. The reviewer's estimate, not measured: hundreds of USD a day, against a ceiling of USD 100 a month | Kinds `transcription` and `ai_write` in `consumeDailyQuota` (a migration: `ai_usage_daily_kind_check` lists the kinds), consumed in `startTranscription` and before the provider call in `ai-write.ts`; a size cap per kind for audio; the sentence the device shows at the ceiling; the two ceilings are Matheus's numbers *(2026-11-27: PR #405 added the server's length cap of 3 min 10 s, speech paid once per audio and the per-user limits of "Tentar de novo" and of the AI control, but no daily ceiling. Batch e31g adds it: kinds `transcription` and `ai_write` in `ai_usage_daily` (migration 0010), spent in `startTranscription` and before the provider call in `ai-write.ts`, `429 quota_exceeded` and the kernel's sentence on the device. Decided by Matheus on 2026-11-27: the code ships with no effective ceiling (default 1 000 000 a day, `UNSET_DAILY_QUOTA`); the two numbers (`TRANSCRIPTION_DAILY_QUOTA`, `AI_WRITE_DAILY_QUOTA`) are his to set later, so until then the spend of audio is held only by the per-minute limits and the length cap.)* |
| A3 | Medium-low, CONFIRMED | The transcription job writes text through server ops, which skip the value caps (`opValueIssue` runs for client ops only, `sync/apply.ts:234,266`): long audios can pass `TEXT_CAPS.long` and bring back S4 | Cap the heard and the appended text to the field's cap in `jobs/transcription/job.ts` *(2026-11-27: not covered by PR #405. Batch e31g: the job checks each field put with `opValueIssue` under the lock and the text as heard against `TEXT_CAPS.long`; a text that does not fit is not written and the audio fails (`text_too_long`), nothing is cut.)* |

The review-fix batch `e31f-review-fixes`, in progress on 2026-11-26, already adds a per-user limit on
"Tentar de novo" and a server length cap (`audioTooLong`); it does not add the daily quota. These two rows
belong in that batch: they edit the same files.

### 4.3 Open: needs a decision or a client change first

| Id | Severity | Finding | Why not fixed here |
|---|---|---|---|
| A4 | Low-medium, CONFIRMED | `PUT /api/files/:id` has no rate or concurrency limit and buffers up to 25 MB per request; no storage total per company | The device treats any 4xx on an upload as permanent (`classifyUploadFailure`, `apps/web/src/sync/policy.ts:31-46`): a 429 would mark a photo as failed. The web must learn to wait on a 429 first, and be deployed before the limit |
| A6 | Low, CONFIRMED | An Admin learns whether an e-mail is registered in another company (`409 user_email_taken`, `admin/users.ts:330,471`) | Follows from globally unique e-mails; accept and record, or answer a generic refusal |
| B3 | Low, CONFIRMED | The api connects as the RDS master user (`infra/production/ssm.tf:15`, `rds.tf:59`) | A second role and a deploy; medium size |
| B4 | Low, PLAUSIBLE (needs a sibling host an attacker controls) | The session cookie has no `__Host-` prefix (`auth/auth.ts:167-169`) | Everyone signs in again once |
| B5 | Low, CONFIRMED | A production login e-mail and a note that its password once surfaced in a chat are in a tracked file of this public repository (`reviews/audit-2026-09-30-stories-vs-code.md:72`) | Confirm the password was rotated (E11-A4); redacting rewrites a record, and history keeps it |
| B6 (rest) | Low, CONFIRMED | A competitor's company name, CNPJ and address outside `docs/concorrentes/` (`research/competitive-laudos-cabine-primaria-2026-09-18/digests/mesh-r1-1.md:38`, `mesh-r2-1.md:36`), against the Policy | Planning documents are not rewritten silently; Matheus decides |
| B7 | Low | No CloudTrail trail, no MFA condition and no password policy in Terraform (`infra/bootstrap`) | Bootstrap apply; the first management trail is free |
| B8 | Low, CONFIRMED | The app role can overwrite file originals, and old versions expire in 30 days (`iam.tf:92-96`, `storage.tf:47-49`) | Raise `noncurrent_days`; a few cents a month |
| B9 | Low, CONFIRMED, probably by design | A paused or removed account keeps the company's data readable on the device (`state/session.tsx:52-59`) | A product decision |

Hardening with no known exploit, not done: `users.manage` alone can grant itself the Admin role
(`admin/users.ts:367-371`); password links are stored in clear (`admin/password-links.ts:42`); the Caddyfile's
fallback secret has a public default (`infra/caddy/Caddyfile:60`; production always sets it);
`cross-origin-opener-policy` (not added: the preview and certificate tabs are opened and written by the app,
and no browser test was run); the test seeds have no production refusal (`db/test-seed.ts:21`); minimum
password length 8.

### 4.4 The 2026-11-03 pass

S1, S3, S5, S7: hold. S2: the server half holds, the sign-out wipe is in place. S4: holds for client ops;
bypassed by server-written transcription text (A3). S6: holds for readings and audits; not extended to
Epic 31 (A1). S8: the origin guard, the telemetry limiter and HSTS hold.

## 5. Not read

Seed bodies v1 to v19, `schemas/*`, most of `measurement-evaluation.ts` and `section-9.ts`; the DOCX section
builders, the reading providers and the audit job; `sync/apply.ts` lines 300 to 1099 in full; most Playwright
specs (34 sampled, the rest by grep counts); about 1,000 tracked images under `_bmad-output/`; better-auth's
internals; `pnpm-lock.yaml` and `uv.lock` contents.
