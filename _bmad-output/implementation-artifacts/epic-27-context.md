# Epic 27 context: the fixes of the 2026-11-21 manual pass

Compiled 2026-11-21 by the coordinator, before any worktree. The stories, the decisions and the rules every story keeps are in `_bmad-output/planning-artifacts/epics.md`, "Epic 27" (read that section with offset and limit; never the whole file). The findings F1 to F41 are in `_bmad-output/test-artifacts/manual/ux-pass-2026-11-21.md`. This file adds only what the batches share.

## Goal

The document always carries what the screen shows, an impossible value never reaches the PDF, the wording is right, and the screens work on a tablet in landscape and on a phone.

## Decisions (Matheus, 2026-11-21)

The three decisions are in the epic's header. Added after the stories were written:
- "ok pode seguir": the build starts. The coordinator's reading under Story 27.3 stands: the new section 10 sentence prints on seed v17 only; prints of earlier seeds stay byte-identical.
- Production was counted, read-only, on 2026-11-21 (migrate task `538eed90` and one rerun): one live `empresa` row, no company with two, no registry row without an op. F1 happened on local data only. Story 27.1 stays as the guard; its investigation looks for a local script.

## Batch plan

Epic 26 is built at the same time by another session (batches e26a to e26f, contract 55, port bases 26 and 27). At most two batch stacks up across both epics; one gate at a time under `lockf /tmp/fasor-verify.lock`. The coordinator messages that session before each launch and each merge.

| Wave | Tag | Stories | Port base | Base | Contract |
| --- | --- | --- | --- | --- | --- |
| 1 | e27a, slice 1 | 27.3, 27.4, 27.5, 27.6, 27.7, in this order | 28 | main `fb1eca67` or later | none |
| 1 | e27a, slice 2 | 27.1, 27.2 | 28 | the same branch, after it has merged a main that holds e26a | main's number plus one, minimum 56 |
| 2 | e27b | 27.8, 27.9, 27.10 | 28 | main after wave 1; 27.10 after Story 26.5 is on main | main's number plus one (seed v17) |
| 3 | e27c | 27.11, 27.12, 27.13, 27.14 | 28 | main after wave 2; 27.11 after Story 26.5 is on main | none |

- One branch and one PR per wave. Slice 2 of e27a is the same orchestrator, resumed by the coordinator when e26a is on main; the PR opens after slice 1 and merges after slice 2.
- Images: `app-api-e27a` and `app-tools-e27a` are tagged from the shared images; a later batch tags its own the same way and never builds from scratch.

## Facts the batches share

- **Files Epic 26 also edits:** `apps/api/src/sync/rules.ts` and `packages/domain/src/contract/version.ts` (27.1, 27.2: only after e26a is on main); `apps/web/src/surfaces/relatorio/sumario-surface.tsx` (27.10, 27.11: only after Story 26.5); `apps/web/src/copy/pt-br.ts` and `apps/web/src/styles/app.css` (different keys and blocks; whoever merges second merges main first). Epic 27 never edits `ops/path.ts`, `contract/errors.ts`, `http/session.ts`, `auth/auth.ts`, `permissions/`, `apps/web/src/app.tsx` or the Login screen. F27 belongs to Story 26.5.
- **One assertion per shared item:**
  - the `empresa` selector: defined once in `packages/domain/src/registry/empresa.ts` (27.1) and called by the web store and by the snapshot; neither keeps its own pick;
  - pre-issue rows: 27.2 (temperature, ART), 27.4 (points, the count sentence) and 27.10 (empty section text) each add their own kinds to `packages/domain/src/relatorio/pre-issue.ts`; 27.4 owns `EXPLICIT_KINDS` and the count sentence, the others only append a kind;
  - the parecer text: 27.3 owns `composeParecer`; 27.8 only sets the seed rule that turns the v17 print on;
  - section numbers: 27.5 owns the template's number; 27.14 removes the second number of the row and reuses 27.5's;
  - printed words: only 27.8 changes a golden, a layout lock or `pdf-text.json`. A wave 1 or wave 3 story that turns a golden red stops and reports.
- **Refusals reuse what exists:** `refusedMeasurementKind` and the input refusals of `packages/domain/src/checks/input-refusal.ts`; the rejected-op flow for an op a device queued before the new ranges.
- **Seeds are frozen:** v1 to v16 share `packages/domain/src/seed/v1.ts` and their hashes are pinned; no batch edits them. New words live in v17's own definitions (27.8).

## Gates

- **Each batch:** `lint`, `static`, `test:unit`, `test:api` and only the specs it wrote or touched, under the host lock; the summary pasted in its PR. No review loop inside the batch.
- **Once per wave, on the integrated main:** `podman compose restart api web`, `pnpm test:e2e:full` and the matrix, one review, one fix batch if needed. The coordinator runs it when the other session's stacks allow, and repeats the manual pass points of the wave through the Playwright MCP.
- Deploy on Matheus's word.

## Open items

- Which local script wrote an `empresa` row into `entities` with no op (Story 27.1, first task).
- Bruno: the corrected form words, the contact table headers (F22), the Definições text (F41). Matheus sends it after the deploy.
- The coordinator's readings marked in Stories 27.3, 27.4, 27.9 and 27.14.
