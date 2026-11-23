# Epic 28 context: Bruno's answers of 2026-11-22

Compiled 2026-11-22 by John (PM), before any worktree. The stories, the decisions and the rules every story keeps are in `_bmad-output/planning-artifacts/epics.md`, "Epic 28" (read that section with offset and limit; never the whole file). Bruno's words and the coordinator's mapping are in `docs/context/epic-25/respostas-bruno-2026-11-22.md` (gitignored, absent on other machines); cite him by question (B-n), never by his sentences beyond the product copy the stories carry. This file adds only what the batches share.

## Goal

Close what Epic 25 left waiting for Bruno, on seed v18: the oil's names, the variation note by his numbers, points that start with a priority and count their deadline from the issue date, the note on the instrument's limit, the rows that take the header's voltage, Etapa 6's additional items, and the fixed texts he corrected. Earlier relatórios print byte-identical.

## Decisions (Matheus, 2026-11-22)

- "Pode fazer o épico 28": built after the joint deploy of Epics 26 and 27, not part of it. Seed v17 freezes there; sheet, plate and fixed-text changes go to v18.
- The No-break's tests (Story 25.17) are dropped from Epic 25. They will be built with a future "painéis" (panels) module, a new module at another time. The No-break de comando keeps its inspection items as today.
- The per-row printed result words stay as v15 to v17 print them.
- The owner's token-economy rule of 2026-11-12 and Epic 26's practice: one batch and one PR per wave (two only where kernel and screen work do not touch), one full gate, one review and one deploy at the end of the epic.

## Batch plan

At most two batch stacks up at a time. The main checkout's stack is stopped while batches run (`podman compose stop`, never `-v`).

| Wave | Tag | Stories | Port base | Base | Contract |
| --- | --- | --- | --- | --- | --- |
| 0 | coordinator (frames, no stack) | 28.1 | none | main | none |
| 1 | e28a | 28.2, 28.3, 28.4, in this order | 30 | main after the joint deploy of Epics 26 and 27 | main's number plus one, at least 58 |
| 2 | e28b | 28.5, 28.6, 28.7, 28.8, in this order | 30 | main after e28a is merged | none expected |
| 2 | e28c | 28.9, 28.10 | 31 | main after e28a is merged | main's number plus one at its merge |

- e28a may start Stories 28.2 and 28.4 before the frames are approved; the screen part of 28.3 and every wave 2 story wait for Story 28.1's approval.
- e28b and e28c run side by side. The PR that merges second merges main first, re-pins `V18_HASH` on the merged main and names the merge commit in its body.
- Images: each batch tags its own `app-api-e28x` and `app-tools-e28x` from the shared images and never builds from scratch.

## Facts the batches share

- **Seeds.** `SEED_VERSION = 'v17'` today (`packages/domain/src/seed/definitions.ts:69`); `seed/v17.ts` derives from v16 by fenced sections; `V17_HASH` (`seed/seed.test.ts:2660`) is pinned as shipped by Story 28.2. v1 to v17 are frozen after the joint deploy; no batch edits them. New behaviour lives in v18's fenced sections (`// --- Story 28.N: … ---`) or a flag of its `rules` object read by `seedRule`, each with a `withoutE28<N>` strip helper so the stripped v18 is v17.
- **Contract.** 57 today (`contract/version.ts:682`, `MIN` at `:1091`). Closed lists that need a number to grow: `ITEM_KEYS`, `SUB_BLOCK_KEYS`, `EQUIPMENT_BLOCK_TYPES` (`schemas/block-config.ts`), `NOT_TESTED_REASON_KEYS` (`schemas/entities.ts:550`), `RELATORIO_SETUP_KEYS` (`schemas/entities.ts:1017`). Each batch appends its paragraph to `contract/version.ts`.
- **Goldens.** `apps/api/src/jobs/generate/golden/`: `layout-lock-v5`, `-v11` to `-v17`, the `-epic25` twins, `porto-seguro-skeleton.json`. Regeneration needs `GOLDEN_UPDATE=1`, and never for an older seed. A batch that turns one red stops and reports.
- **One assertion per shared item:**
  - the v18 seed and its flags: opened once in 28.2; each later story adds its own fence and flag;
  - the oil option's readers (`relatorio/oil-rule.ts`, `relatorio/temperature-correction.ts`, `relatorio/nameplate-copy.ts`, `relatorio/dry-insulation.ts`, `reading/build.ts`): changed and tested in 28.3 only;
  - the not-tested reason "Equipamento da concessionária": added in 28.4, read by 28.5 (no point) and by section 9 (its justification); 28.5 does not add it;
  - the history comparison (`print/history-note.ts`): 28.8 only; the over-range note (28.7) is its own line and only reads `relatorio/over-range.ts`;
  - the row voltage (`relatorio/row-voltage.ts`): 28.6 only;
  - point priorities and deadlines (`points/priority.ts`, `points/derived.ts`, `print/section-8.ts`, the overdue row of `relatorio/pre-issue.ts`): 28.5 only;
  - section 10 (`print/section-10.ts`) and the setup schema: 28.9 only; sections 1 and 2 and the applied band (`relatorio/applicability.ts`): 28.10 only.
- **Permissions (Epic 26).** No new route. Sheet, point and setup ops of the field need `relatorio.fill` (`packages/domain/src/permissions/map.ts`). The new key `additional_items` goes in `SETUP_FILL_FIELDS`; `permissions/map.test.ts` fails if a setup key is in neither list.
- **Strings.** Bruno's dictated sentences verbatim; every authored sentence marked `// authored (Story 28.x, listed for Bruno)` and listed in the PR; new NC phrases in `docs/nc-chip-phrases.md`.
- **The plate prompt.** `apps/api/src/jobs/reading/providers/bedrock.ts` lists options from the seed; `BEDROCK_STRUCTURING_PROMPT_VERSION` moves to `bedrock-structuring-10` in 28.3. The paid eval (`apps/api/src/scripts/bedrock-eval.ts`) runs on Matheus's AWS login and his word for the spend, before the deploy.

## Gates

- **Each batch:** `lint`, `static`, `test:unit`, `test:api` and only the specs it wrote or touched, under the host lock (`lockf /tmp/fasor-verify.lock`); the summary pasted in its PR. Touched specs include every spec that asserts seed counts, the transformer's, TP's or TC's plate, the item or reason lists, the thermography's reasons, section 8, section 9's insulation tables and notes, section 10, sections 1 and 2 or the applied band (`grep -rln` over `e2e/`). No review loop inside the batch.
- **Once, after wave 2 is merged:** `podman compose restart api web`, then `pnpm test:e2e:full` and the matrix on the integrated main, one review, one fix batch if needed, the hands-on pass of the epic's Definition of Done, the paid plate eval, then the deploy on Matheus's word. Seed v18 freezes there.

## Open items

- Questions Q-1 to Q-7 at the end of the Epic 28 section of `epics.md`. None blocks a batch: each story builds its written reading unless answered before it starts. ~~Q-1, Q-3, Q-4 and Q-5 go to Bruno with the post-deploy message;~~ *(2026-11-22: Bruno answered Q-1, Q-3, Q-4 and Q-5 the same day; the dated lines after the questions in `epics.md` win over the readings in Stories 28.3 and 28.4: EPÓXI leaves the transformer and a field CONSTRUÇÃO enters on the dry one; the two new items are asked on both kinds with their own words; the utility reason has his editable sentence; the battery date label names the exchange.)* ~~Q-2, Q-6 and Q-7 are Matheus's.~~ *(2026-11-23: Matheus answered them, "1. Como hoje 2. Ok 3. Ok": the dry unit keeps the NATUREZA DO LÍQUIDO row with "-"; the deadline is computed in print; a level change is judged by today's criterion. No question stays open.)*
- B-10 has no story: the hands-on pass reproduces the two sheets under a removed local; a screen that shows them as live becomes a fix batch.
- The frames of Story 28.1 need Matheus's approval before wave 2.
- The paid plate eval needs Matheus's word for the spend.
