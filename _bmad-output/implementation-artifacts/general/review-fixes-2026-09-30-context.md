# Review fixes 2026-09-30: batch context

Matheus asked on 2026-09-30 to fix the findings of the full review (`reviews/full-review-2026-09-30/`, index in its `README.md`) following its recommendations. This file is the planning context every batch orchestrator loads in place of `epic-<N>-context.md`; the process is `epic-batch-orchestrator.md`. The finding IDs below are the reports' own: `K-`, `W-`, `A-`, `E-`, `O-`, `I-` in `1-code-quality.md`, `F-` in `2-ux-review.md`, `H`/`M`/`L` in `3-security-review.md`, and the story gaps in `reviews/audit-2026-09-30-stories-vs-code.md`. Each finding carries its file:line, evidence and proposed fix; read the finding, verify it against the code, then fix it with a test that fails before the fix.

## Coordinator decisions

- Out of scope, waiting for Matheus (do not change behaviour, do not decide): F-04 and E78-R2 (the one definition of a concluded ficha); Story 11.4 rich editor vs plain text; M3 (what a signed-out tablet keeps); session lifetime; retention and quotas; L2 IMDS under host networking; rotating the production password (a manual action); R-009 and E12-A4 (seed_version guard); every product question in the audit's "Decisions for Matheus".
- F-16 ("Concluir ficha" jumps to the next sheet without asking) and F-19 ("A minha" on both options for one account on two devices): fix only if `EXPERIENCE.md` or the story ACs already say what should happen; otherwise list as an open question.
- A finding whose fix would contradict a story AC or a dated note in `epics.md`/`source-deltas.md` is an open question, not a fix.
- 429 on sign-in: author the pt-BR sentence in `apps/web/src/copy/pt-br.ts` marked `// authored:`; Matheus may reword it later. It must not reuse the wrong-password text.
- Lows: fix them when they sit in files the batch already touches or cost minutes; otherwise list them as known open in the PR body. Every high and medium of the batch's list is fixed or explained.
- Every fix gets a test in the project's style. Mechanism fixes (focus, toast placement, outbox, commit path) ship a mutation run (revert, show red, restore).
- Performance fixes report before/after numbers with the same script: `test-results/full-review-2026-09-30/kernel-timing.ts` (tools container) for the kernel, `commit-to-render.perf.spec.ts` for the device.
- Goldens: a fix that changes a generated document (F-09 photo reference) regenerates the goldens with `scripts/regen-goldens.ts` and explains the diff in the PR body.
- Merges: the coordinator squash-merges each PR after its green gate, rebasing order by arrival; a batch that merges a changed main re-runs `pnpm verify`.

## Batches

| Tag | Wave | Port base | Branch | Owns (files) | Findings |
|---|---|---|---|---|---|
| sec | 1 | 62 | `fix/security-review-2026-09-30` (exists, 5 commits) | `infra/`, `docker-compose.yml`, every Dockerfile, `docker/`, `services/ocr/`, api security middleware and config | the security report's mitigations as committed; plus I-1 to I-10, O-4 to O-9, and the security lows that need no decision |
| rff | 1 | 63 | `fix/review-field-defects` | `apps/web/src/surfaces/**` (except `sync/`), `apps/web/src/components/**`, `apps/web/src/copy/**`, `apps/web/src/styles/app.css`, `packages/domain/src/{relatorio/section-variables.ts,checks/,format/,text/,home/}` | F-01 to F-26 except F-04 (F-16, F-19 per the rule above); K-3, K-4, K-5, K-12, K-13, K-14; W-9, W-12, W-13, W-14, W-22, W-23; the 429 text (L10); the caption composer opening in "Editar texto" (`caption-composer.tsx:123`, video note) |
| rfp | 1 | 64 | `fix/review-kernel-device-perf` | `packages/domain/src/{ops/,relatorio/tree.ts,relatorio/sheet-progress.ts,relatorio/sumario.ts,relatorio/pre-issue.ts,points/,print/,schemas/}`, `apps/web/src/db/**`, `apps/web/src/state/**`, `apps/web/src/sync/**`, `apps/web/src/surfaces/sync/**` | K-1, K-2, K-6 to K-11, K-15 to K-20; W-1 to W-8, W-10, W-11, W-24 to W-27; audit 1.4 (Dexie `toSnapshot` vs the Porto Seguro golden) |
| rfa | 1 | 65 | `fix/review-api-robustness` | `apps/api/src/**` except what `sec` touched (merge carefully: `http/app.ts`, `config.ts`, `auth/`), `scripts/test-reset.ts` | A-1 to A-28; E-3, E-4, E-11; audit 8.4 (reading job log fields), 2.2 (`cover_background` variants) |
| rft | 2 | 66 | `fix/review-tooling-tests` | `scripts/`, `e2e/support/**`, `playwright.config.ts`, every `e2e/*.spec.ts` for helper extraction only | E-1, E-2, E-5 to E-10; E11-A3 (visible gate lock script); duplication groups 1 to 4 (e2e helpers); audit test-only gaps 10.1, 10.2, 2.6, 5.1, 6.4, 12.5; deferred 1221 (1.8-E2E-001 first-run flake) |
| rfr | 2 | 67 | `fix/review-ownership-refactor` | `apps/web/src/surfaces/**`, `packages/domain/src/**` (new kernel functions) | W-15 to W-21 (surface rules into the kernel), W-28, A-28, duplication groups 5 to 15 of section 3 |

Wave 2 starts from `main` after every wave 1 PR merged.

## Cross-batch contracts

- `rfp` owns the commit path and the outbox (`apps/web/src/db/commit.ts`, `sync-store.ts`); `rff` does not edit them. F-01's cause may sit in `model.type` (`apps/web/src/surfaces/ficha/nameplate-suggestions.tsx`, blur already commits at `:321-326`) or in a snapshot re-render resetting the field's local state; if the fix needs a commit-path change, `rff` writes the failing test and hands the change to `rfp` through a `deferred-work.md` entry.
- `rfp` changes `applyOp`'s parse; the op contract (`CONTRACT_VERSION`) does not change, and the goldens must stay byte-identical.
- `sec` adds `RATE_LIMIT` (off outside production) and body limits of 16 MiB on JSON routes and 64 KiB on `/api/auth/*`; `rff`'s 429 text assumes the 429 status only.
- `rfa` does not change route shapes or status codes the web reads.
