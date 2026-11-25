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

- e30a and e30b run side by side. They share only `deferred-work.md` (different rows) and `docs/kbs/log.md` (append only); the PR that merges second merges main first.
- Story 30.2 rides in e30a, not in a batch of its own: the two-stack limit, one batch per wave, and no file shared with 30.1.
- e30c starts once wave 1 is merged and its full gate is green. e30d starts when e30c's batch gate has finished and no other stack is up: it measures under a load it makes itself.
- Images: each batch tags its own `app-api-e30x` and `app-tools-e30x` from the shared images and never builds from scratch.

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
