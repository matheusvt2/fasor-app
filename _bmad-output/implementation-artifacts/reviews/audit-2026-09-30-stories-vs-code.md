# Audit 2026-09-30: every done story against the code

Read-only audit of `main` at `be25ae7` (after Epic 11 closed), run by five parallel agents at Matheus's request ("revise o código e não só o que está descrito"). For every story marked `done` in `sprint-status.yaml`, each acceptance criterion in `epics.md` (with its dated notes; `source-deltas.md` wins) was matched to implementing code and to a test. A gap needs file:line evidence. A fifth agent triaged the 40 open `action_items` and the open `deferred-work.md` entries. This file is input for the full code review; nothing here has been fixed yet.

## Summary

| Epics | Stories with no gap | Gaps | Highest severity |
|---|---|---|---|
| 1-3 | 11 of 21 | 9 | high: manual tablet proof never run; R-009 not recorded (both human) |
| 4-6, 12 | 21 of 29 | 8 | medium: 4.7 restore; 4.8 Bruno's reading |
| 7-9 | 16 of 16 | 2 | low: tests only (8.4) |
| 10-11 | 9 of 12 | 5 | medium: 11.4 contradicts its AC |

No story marked `done` is missing its implementation. One behaviour defect (4.7). Story 11.6 is blocked: only stubs exist (`apps/api/src/jobs/reading/providers/unimplemented.ts`), no Bedrock SDK, `config.ts:37` still accepts `anthropic`, `MIN_CONTRACT_VERSION` 13 (`packages/domain/src/contract/version.ts:141`).

## Gaps that need code or tests

| Story / item | Gap | Evidence | Severity |
|---|---|---|---|
| 4.7 AC 1 | "Restaurar texto do template" restores the seed text, not the template's text: `instantiate` copies the template `section_text`, the restore writes `null` and the surface falls back to `defaultSectionText(seedVersion)`; a text customised in the template (Story 3.6) is lost. The write also puts the whole `config`, not `config.text` | `packages/domain/src/relatorio/instantiate.ts:105`, `section-variables.ts:95-96`, `apps/web/src/surfaces/relatorio/section-text-surface.tsx:97-98,112` | medium (defect) |
| 4.2 AC 2 | Geolocation is asked on every mount while the altitude is empty and unconfirmed, not once per relatório; no persisted marker | `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx:40-54` | low |
| 1.4 AC 5-6 | Dexie byte-equality runs only on `replay-small`; no Dexie `toSnapshot` vs `snapshot.golden.json` for Porto Seguro | `apps/web/src/db/commit.test.ts:80`, `porto-seguro-fixture.test.ts:37-55` | medium (test) |
| 10.2 AC 1 | The 48 px reading crop in each option has no test; every conflict e2e uses `source_suggestion_id: null` | `apps/web/src/surfaces/sync/conflict-dialog.tsx:212-214`, `e2e/conflicts.spec.ts:283,669` | medium (test) |
| 10.1 AC 1 | No two-device test for photos and captions ordered by capture time, points or setup edits | `e2e/merge.spec.ts:160`, `merge/info.test.ts:167` | low (test) |
| 2.2 AC 4 | `cover_background` variants untested | `apps/api/src/http/files.integration.test.ts:431-495` | low (test) |
| 2.6 AC 1 | No "330 MΩ fails >400 MΩ" case; operator/type/source rejection not field by field; `edition: null` not asserted | `packages/domain/src/seed/criteria.test.ts:14-17` | low (test) |
| 2.6 AC 3 | No sweep test for criterion values outside the seed module (manual grep clean today) | - | low (test) |
| 5.1 AC 2 | "Próxima coluna" label untested in UI | `apps/web/src/surfaces/ficha/use-ficha-actions.ts:166`, `ficha.test.ts:85-89` | low (test) |
| 6.4 AC 1 | Real HEIC to JPEG conversion never exercised (fake `convertHeic`) | `apps/web/src/.../photo-import.ts:97`, `photo-import.test.ts:132` | low (test) |
| 8.4 AC 2, 4 | Structured log fields and the `outcome` default `ok` untested | `apps/api/src/jobs/reading/job.ts:148-154`, `providers/fake.ts:43` | low (test) |
| 12.5 AC 2 | Dark theme compared at one point only, not at 390/1024/1280 | `e2e/v09-visual.spec.ts:132-136` | low (test) |
| export 401 | A 401 shows the network-failure text instead of "session expired" | `deferred-work.md:1233`, `export-dialog.test.tsx:1111` | low |
| E11-A5 / A12 | Hardening before the URL reaches the design partner: rate limit on `/api/auth/*` and push, Caddy security headers, push body limit, refuse the default `SESSION_SECRET` outside dev, Vite on 127.0.0.1 | `config.ts:24` (only `min(32)`), `vite.config.ts:104,112` (`host: true`) | L |
| E11-A3 | Visible gate lock script (owner, age; refuse a holder stuck over 60 min) | none in `scripts/` | S |
| E11-A10 | `infra/bin/check`: Caddy by IP without SNI, ASCII-only Terraform descriptions | - | M |
| E12-A4 | Seed_version guard on template puts | none in `apps/api/src/sync/apply.ts` | M (needs a decision) |
| deferred:1005 | Fake provider default fixture per kind still failing path | `job.integration.test.ts:283` | S/M |
| deferred:1221 | 1.8-E2E-001 first-run flake (warm-up or `retries: 1`) | `playwright.config.ts` | S |

## Documentation corrections (dated notes, no code)

- 3.2: AC says `seed_version = 1`; code and test use `'v3'` (`packages/domain/src/seed/template.test.ts:21`).
- 3.6 AC 2 and 2.1 AC 4: the checks live in `preIssue` (`section_variables`, `pre-issue.ts:239-248`) and `checks/references.ts`, not in the `integrity` kernel (`integrity.ts` has only `duplicate_tag`, `cert_number_mismatch`).
- 7.3: "no table prints in the MVP" superseded by Story 11.10's action-plan table (`print/section-8.test.ts:185`).
- 11.8: the PR #74 note says instance 00:00->04:40 and RDS 00:05->05:00; the code starts RDS at 04:40 and the instance at 05:00 (`infra/production/schedule.tf:19-26`), which is the correct order.
- source-deltas: the row naming Graviton `t4g.medium` needs a dated note: production is x86-64 `t3a.medium` (Matheus, 2026-09-30; `paddlepaddle` has no aarch64 wheel).
- 4.1 AC 3 (client Combobox with "Criar" only in "Novo relatório", read-only in setup Etapa 1) and 4.6 AC 3 (status step-back only from the Sumário Overflow, one step): narrowings asked by the Epic 4 retro, never written under the stories.
- 11.8 live evidence exists (sprint-status E11-A2: the 15:10 502 was the #79 api roll; budget action STANDBY; task role policies; live Textract through fasor-app, 42 tokens); `deferred-work.md:1227` should be closed. Not yet exercised: the budget action actually applying its deny.

## Ledger items resolved or obsolete (to close)

- Resolved: `deferred-work.md:1227` (11.8 smoke/role, E11-A2 done); `deferred-work.md:957` (reading kinds beyond `plate` exist in `apps/api/src/jobs/reading/kinds/`).
- Obsolete: E7-A1, E8-A1, E6-A2, E7-A2 (superseded by the split gate, AGENTS.md 2026-09-30, and E11-A3); E4-A5 (only item 25 left, duplicate of E7-A5); A12 (duplicate of E11-A5); E5-A2 (dev part done in PR #40, device part in E1-A1); `deferred-work.md:1083` (duplicate of E9-A6).
- Correction to the triage agent: E11-A6's "Graviton vs x86" is NOT answered by source-deltas' `t4g.medium`; Matheus chose x86 and production runs `t3a.medium`.

## Decisions for Matheus

1. 11.4: per-relatório section text stays in the rich editor (PR #79, `section-text-surface.tsx:186`) or returns to plain text as the AC says.
2. Gate time (Story 1.1 AC 5, E11-A1): verify takes 1933-2342 s against the 900 s budget. Move the full `@p0` e2e to once per wave, or set a dated budget with the measured number.
3. R-009 (3.1 AC 6, E3-A1): D-2, D-3, D-6 through a seed v2, or unfreeze v1 on purpose.
4. E11-A5 hardening before or after the URL goes to the design partner.
5. E12-A4: upgrade templates on api start and refuse puts older than the seed_version.
6. E3-A5: confirm D-5 (row offset in the kernel) and D-7 (array last-writer-wins) as built.
7. Product questions best taken in one session with Bruno (E5-A3, E6-A4, E7-A5, E8-A3, E9-A8, E10-A6, E11-A6, E12-A1; deferred 439, 445, 451, 788, 861, 1053, 1089, 1107, 1143, 1215, 1233): may a draft generate a document; the blank ART line (print `[ART]`, omit, or block issue); the Porto Seguro not-tested reason; rail-row Overflow ("Mover para…"); cable pairing on the ficha or at instantiation; per-item merge record; OCR engine (PARSeq or PP-OCRv5); panel reads via Textract or ocr-svc; agent-authored copy.
8. DoD wording (E8-A6 real-job e2e, E2-A4 `@p0` per story), E3-A6 (freeze the seed only with a human record), `pnpm audit` moderate advisory (accept or update the chain), narrowings with no owner (close as accepted or keep).

## Manual actions (Matheus)

- Run the iPad and Android proof script (Stories 1.7 AC 3, 1.8 AC 5; high): `_bmad-output/test-artifacts/manual/` holds only the script and a template. Include the Epic 6-12 device flows and the PDF/DOCX download and share on both tablets.
- Bruno reads the DOCX skeleton (4.8, R-009 record; E4-A6).
- Photograph the four instrument displays on the tablet (E8-A8), which unblocks E9-A6.
- Rotate the production password of bruno@fasorengenharia.com.br (E11-A4); its content surfaced in a chat.
- Follow the AWS support case on the Bedrock quotas (E11-A9, Story 11.6).
- Remove the 58 old worktrees under `.claude/worktrees` (the agents' guard blocks deletion).
