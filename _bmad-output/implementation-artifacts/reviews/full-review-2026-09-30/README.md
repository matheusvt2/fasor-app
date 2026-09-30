# Full project review 2026-09-30

Requested by Matheus on 2026-09-30, after Epic 11 closed (`main` at `be25ae7`, audit committed at `6b21909`). Four fronts ran in parallel as separate agents, each with its own seeded user on the shared local stack; the security front worked in an isolated worktree and compose project. Coordinated by Amelia (dev agent). Nothing here is merged: the only code changes live on the branch `fix/security-review-2026-09-30`.

| Front | Model | Report | Evidence |
|---|---|---|---|
| 1. Code quality, logic, Big-O, duplication | Fable 5.1 | `1-code-quality.md` | `test-results/full-review-2026-09-30/` (kernel timing script and output, jscpd JSON) |
| 2. User experience, hands-on as a field engineer | Fable 5.1 | `2-ux-review.md` | `ux/` (125 screenshots at 1280, 768, 390 and dark) |
| 3. Security, evaluated and mitigated | Opus 5.5 | `3-security-review.md` | branch `fix/security-review-2026-09-30` in `.claude/worktrees/agent-a70fa0b406dbc6240`, five commits, probe table in the report |
| 4. Product demo video with subtitles | Fable 5.1 | `4-video.md` | `docs/media/demo-produto-2026-09-30.{mp4,srt,markers.json,record.py}` (gitignored) |
| Input | five agents, earlier the same day | `../audit-2026-09-30-stories-vs-code.md` | every done story's acceptance criteria matched to code and tests |

## Counts

| Front | High | Medium | Low | Total | Notes |
|---|---|---|---|---|---|
| 1. Code quality | 5 | 33 | 46 | 84 | source duplication 855 lines in 79 clone pairs (0.2 to 3.4 % per package); seven super-linear paths |
| 2. UX | 2 | 12 | 12 | 26 | 77 features exercised, 59 pass, 18 fail; zero console errors, zero failed app requests in 621 API calls |
| 3. Security | 2 | 7 | 12 | 21 | 11 mitigated on the branch, 10 left as recommendations; tenant isolation held on every probe |
| 4. Video | 0 | 0 | 3 | 3 | 6 min 11 s, 26 scenes, 53 subtitles; 3 low product quirks found while scripting |
| Audit (input) | 1 | 4 | 14 | 19 | one behaviour defect (4.7); the rest tests, docs and decisions |

## Findings that more than one front reached

These are the ones to schedule first, because independent methods agree on them.

1. **"Restaurar texto do template" restores the seed text, not the template's.** Audit gap 4.7; confirmed in code by front 1 (`packages/domain/src/relatorio/instantiate.ts:105`, `section-variables.ts:95-96`, `apps/web/src/surfaces/relatorio/section-text-surface.tsx:97-112`); reproduced live by front 2 (F-03, "Desfazer" brings the customised text back, which proves the restore wrote `null`); the video deliberately does not show the action.
2. **The OCR sidecar has no inference timeout, no concurrency cap and no memory limit.** Front 1 (O-1 to O-3, high: one slow image stalls the reading queue under the single lock while the api aborts at 60 s and retries) and front 3 (availability finding, mitigated on the branch: admission slots answering 503, `asyncio.wait_for` answering 504, pixel cap in code, pinned PP-OCRv5 checksums).
3. **Production-facing hardening from the audit's E11-A5 row.** Front 1 (infra sweep: placeholder `SESSION_SECRET` accepted with `NODE_ENV=production`, Vite published on all interfaces, untagged `minio/minio`, floating `caddy:2-alpine`) and front 3 (mitigated: body limits with 413, rate limits with 429, security headers, CSP, HSTS, the production app refusing the public dev secret, Vite bound to loopback in compose because `host: true` must stay inside the container).
4. **A real person's e-mail committed as a Terraform default** (`infra/bootstrap/variables.tf:10`, `infra/production/variables.tf:94,106`). Front 1 (I-1, medium: public repo, and the operator gets no budget alert) and front 3 (recommendation: required variables, untracked tfvars, `*.tfvars` in `.gitignore`).
5. **Two definitions of a concluded ficha reach the screen.** Front 2 (F-04: Sumário header "1 de 3" against the parecer band "0 de 3") and the open ledger item E78-R2 in `deferred-work.md` (`progress.ts:142` vs `parecer.ts:148`), still waiting for the one definition Matheus picks.
6. **The expired session reads as a network failure.** Audit ("export 401"), front 1 (confirmed) and front 2 (F-08 and the Sync badge saying "sem conexão" after a 401). Front 3 adds that a 429 from the new rate limit will read as "wrong e-mail or password" until the pt-BR text exists (L10).
7. **Geolocation is asked on every mount of setup Etapa 5.** Audit 4.2, front 1 (confirmed) and front 2 (four `getCurrentPosition` calls per mount and again on every return).

## Findings that need a look from the coordinator's own check

- **F-01 (UX, high): a value typed over a "Verificar" plate suggestion is lost on Tab or tap elsewhere.** The observation is empirical with screenshots and a reload. The proposed cause in `2-ux-review.md` (no blur commit) does not match the code: `SuggestionFill` commits on blur at `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:321-326` unless the blur lands on the field's own "Confirmar" button. So the loss happens downstream, in `model.type` refusing or in the component's `text` state being reset by a snapshot re-render before the write lands (the report's own "silently replaced by 5" on TR-6 points that way). The fix batch needs a failing test first; the defect stands, the cause is open.
- **F-02 (UX, high): undo toasts are anchored to the page, not the viewport.** Confirmed in code: `.toast` is `position: absolute` in `apps/web/src/styles/components.css:129-138` and `apps/web/src/styles/app.css` carries no `position: fixed` translation for it, so it follows the mock's in-frame assumption. One rule in `app.css` per the "Mock container selectors" convention in `AGENTS.md`.

## Top findings per front

Front 1, code quality (details and file:line in the report; top-10 action table at its end):

- K-1 (high): every op re-parses its whole target row through zod in `applyOp` (`packages/domain/src/ops/apply.ts:439`): 823 of 844 ms of the Porto Seguro fold, paid on the web pull and the api push alike.
- K-2 (high): `sheetProgress` builds the whole location tree per block (`sheet-progress.ts:128`, `tree.ts:321`): 666 ms for 94 sheets against 16 ms with blocks alone; the ficha builds three trees on every snapshot change.
- W-1/W-3 (high): the device outbox is never pruned and is read whole on every write; `lastAppliedOpId` scans every op of the entity per commit; an unreachable coalesce branch.
- A-4/A-6/A-5 (high): a numbered revision is issued with placeholder text when a photo read fails transiently; no S3 request timeouts; no total rasterization budget for certificates.
- E-1 (high): `scripts/verify.ts:99` spawns stages detached with no signal handler, so a Ctrl-C leaves vitest, playwright and vite orphans holding the lock and the ports (the retro's E11-A3 "stuck holder" has a cause here).
- Duplication: source-only 855 lines; the real cost is the ten e2e helpers copied into 4 to 24 spec files each; seven surface rules in `apps/web` re-derive what the kernel should own (W-15 to W-21).

Front 2, UX (26 findings, 125 screenshots; tap and timing tables in the report):

- Response times (medians of 3 on a shared machine): login 724 ms; Sumário 146 ms with 3 blocks and 1965 ms with 94; ficha 622 ms; a reading judged in 60 ms and in the outbox in 266 ms; "Sincronizar agora" 1.4 s; generate 0.6 s on an unchanged relatório; plate photo to suggestions 12.1 s; the bulk "Marcar os restantes" 7.9 s on the 94-block relatório with no feedback meanwhile.
- Taps: creating a relatório from Home takes 5; journey J1 (typed plate) 21 taps and 61 keys against the 21 and 83 baseline; J3 (readings with "Ler visor") 13 taps and 31 keys against the budget of 7 and 47 typed.
- Layout: no horizontal overflow on any surface at 1280, 768 or 390; the rail rows overlap at 1280 and 768; the instrument editor is clipped at 1280 and 390; the rich text toolbar clips "Numeração" and "Variável" at 390.
- Other mediums: "Novo relatório" never offers the client's registered site; "Igual à SEC-C05?" leaves Fabricação and Tensão de placa empty; photos added from a sheet give no feedback; a photo token glued to the text ("Imagem 1Emoldurar") reaches the PDF; the Home count tiles and "0 NC abertos" buttons do nothing visible.
- Epic 10 passed whole: merge info, contradiction, the crop in the option, resolution and undo.

Front 3, security (21 findings; the branch is not pushed, has no PR and is not merged):

- H1 (mitigated): no request body limit before sign-in; a 20 MB body was read and parsed by `/api/auth/sign-in/email`. Now 16 MiB on JSON routes and 64 KiB on `/api/auth/*`, answering 413.
- H2 (mitigated): sharp 0.34.5 carried two high advisories reachable by any signed-in upload; bumped to 0.35.5, and `pnpm audit --prod` is clean apart from the known dev-only esbuild chain.
- M1 (mitigated): no per-account limit on password guesses and no limit at all outside production; now 10 sign-ins per 5 min per address and per e-mail and 120 pushes per minute per user, on by default only in production, `RATE_LIMIT` overrides.
- M2 (mitigated): no security headers, CSP or HSTS anywhere; set on the api, with a CSP that allows only the page's inline theme script; a headless run rendered four screens under it with only zod's harmless eval probe reported.
- M3 (decision): after sign-out a shared tablet keeps the previous user's relatórios, photos and pending changes unencrypted, by design (AD-9).
- What held: tenant isolation on every route, per-op tenant check on push, derived object keys, no path traversal, sign-up disabled, origin check, cookie flags, no CORS, no user enumeration by timing, uploads served as attachments with nosniff, EXIF stripped before any document, no DOCX injection, LibreOffice sandboxed per conversion, no SSRF or command injection, no secrets in logs.

Front 4, video (`docs/media/demo-produto-2026-09-30.mp4`, 1280x800, 6 min 11 s, 9.7 MB):

- Same model as the 2026-09-28 take: cursor, click ring and subtitle bar injected into the page, pt-BR narration, one scene per story group; plus a sidecar SRT with 53 cues and a markers file.
- New since the old video: the offline session, setup with an instrument registered from Etapa 4, "Fotografar equipamento", "Mover para…", "Marcar não ensaiado", the caption edit, priority suggesting the deadline, the two-device merge and contradiction, "Salvar como template", the rich text editor, the PDF beside the DOCX with the section 8 action-plan table, and the location stamp switch.
- Not shown: 11.6, 11.7 and the AWS half of 11.8 (cloud), 9.3, 9.4 and 9.5 (dictation off, reading jobs cut for length), 4.7 (defect), and the stories with no single-device desktop surface (list in the note).
- Tooling fact: the Playwright-bundled ffmpeg has no mp4 muxer or libx264; the conversion used the static imageio-ffmpeg 7.0.2 binary in the uv cache.

## Decisions for Matheus

Merged from the four reports and the audit; each report has the options.

1. Security branch: open the PR for `fix/security-review-2026-09-30` after the gate listed in `3-security-review.md` (verify with `RATE_LIMIT` unset, the OCR image rebuild proving the pinned checksums, a browser pass under the new `Permissions-Policy`), then the Terraform applies and a deploy. Local note: `api-prod` (`--profile prod`) now needs its own `SESSION_SECRET` in `.env`.
2. Rotate the production admin password (E11-A4) and adopt the SSM-based seed task.
3. What a signed-out shared tablet keeps (M3), the session lifetime (30 days sliding today), the rate-limit sizes against real field use, the pt-BR text for 429, data retention and per-company quotas, IMDS exposure under host networking.
4. The one definition of a concluded ficha (E78-R2, F-04).
5. Story 11.4: keep the per-relatório rich editor as built, or return to the plain-text AC.
6. The gate time (E11-A1): verify at 1933 to 2342 s against the 900 s budget.
7. R-009, E12-A4 and the product questions the audit lists for the session with Bruno.

## Suggested fix batches

1. **Field defects (Epic 12 style, one PR):** F-01 typed value lost (test first), F-02 toast to the viewport, F-03 restore to the template's text (K-14), F-04 one concluded definition once decided, the 401 and 429 wording, geolocation once per relatório, bulk action feedback, site offered in "Novo relatório", "Igual à" copying every field.
2. **Kernel and device performance:** K-1 boundary parse, K-2 memoized tree, W-1/W-3 outbox pruning and Dexie indexes; re-time `commit-to-render.perf.spec.ts` and the 94-block Sumário (1965 ms today).
3. **Api and jobs robustness:** A-4 no revision on a failed photo read, A-6 S3 timeouts, A-5 rasterization budget, A-1/A-2 registry map and `UNION ALL` pull.
4. **Tooling:** E-1 signal handling in `verify.ts` (also E11-A3), the e2e helper extraction (duplication groups 1 to 4), the audit's test-only gaps.
5. **Infra hygiene:** e-mail defaults out of Terraform, `*.tfvars` ignored, pinned image tags, restart policies, `prevent_destroy` on RDS, circuit breaker on the ECS services, checksums on the LibreOffice and mkcert downloads.
