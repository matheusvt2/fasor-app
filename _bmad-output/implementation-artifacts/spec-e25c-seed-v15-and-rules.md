---
title: 'Batch e25c: seed v15 opens and the first rules (Stories 25.5 to 25.13)'
type: feature
created: '2026-11-12'
status: ready
dev_model: opus
dev_effort: high (25.5, 25.6, 25.7, 25.9, 25.10), medium (25.8, 25.11, 25.12, 25.13)
warnings: ['batched']
---

Batched: one wave, one PR (Matheus, 2026-11-12, AGENTS.md "Decisions of record"). The playbook's e25c and e25d
(`epic-25-context.md` Batch plan) are merged into this one batch; stories that do not touch each other run in parallel.

## Source of truth

The ACs, DoR, DoD and coordinator readings of each story are `_bmad-output/planning-artifacts/epics.md` under
`### Story 25.N` (read only your story; grep by heading). Context: `epic-25-context.md` ("Facts the batches share" and
"Coordinator's readings"). Rows of `source-deltas.md` dated 2026-11-11 override older documents. Frames: the mocks of Part
B under `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/` (grep the story number or the
class names; never read a mock whole).

## Lanes and order

| Round | Lane 1 (kernel, v15) | Lane 2 (screen, every seed) |
| --- | --- | --- |
| 1 | 25.5 seed v15 + v14 lock 2 + contract | 25.11 header voltage |
| 2 | 25.6 no measurement | 25.12 three warnings |
| 3 | 25.7 stale text blocks, text names | 25.13 instruments from sheets |
| 4 | 25.8 rise of exactly 50 %; 25.9 N/A cell (together) | |
| 5 | 25.10 point names every reading | |

All stories work in ONE worktree and ONE branch (`e25c-seed-v15-and-rules`). Two stories run at once, so:

- Touch only your story's files. A red test in a file outside your scope may be the other lane mid-edit: rerun it
  narrowly before treating it as yours.
- Commit only your own paths: `git add <paths>` then `git commit -m ... -- <paths>`; on an `index.lock` error wait and
  retry. Never `git add -A`, never stash, reset, rebase or checkout. Never push.
- Do NOT edit `docs/kbs/log.md`, `docs/kbs/architecture/kernel-and-seed.md`, `source-deltas.md`, `epics.md`,
  `sprint-status.yaml`: the orchestrator writes them once. Report in your final message (under 300 words) the lines
  they need, the authored pt-BR sentences, narrowings, open questions and every cross-story contract.
- `seed/v15.ts`, `seed/seed.test.ts`, `seed/schema.ts`, `contract/version.ts`, `apps/web/src/copy/pt-br.ts`,
  `relatorio/pre-issue.ts`: shared. Add your own fenced section (v15) or keys, with its own strip helper in
  `seed.test.ts` (`withoutE25c<N>` as `withoutE24a` does), re-pin `V15_HASH` last. Edit with narrow replacements, never
  rewrite a whole shared file.

## Constraints (all stories)

- Seed v14 and every older layout stay byte-equal; the layout-lock goldens (v5, v11 to v14, Porto Seguro) must never be
  regenerated or change. v15 is for new relatórios only: a verdict, seed content or printed page changes through a flag
  of the v15 `rules` read by `seedRule(seedVersion, flag)`, never through a version number. A test that asserts a v14
  verdict or page is pinned to v14 by an addition.
- Contract: only 25.5 bumps it (main's number plus one, `MIN_CONTRACT_VERSION` too unless it shows why not), with an api
  integration test through the sync route. No other story bumps it. If one cannot avoid it, stop and report.
- AD-13: every status, count, verdict, plural and text is computed in `packages/domain`; `apps/web` renders from
  IndexedDB and writes ops only. New pt-BR copy in its three homes (AGENTS.md "Where a new user-facing string goes").
  Screens use the mock's class names; `.frame-*` translations go in `app.css`.
- Public repository: no client material, nothing from `docs/context/`, no text of Bruno's (cite by item or answer
  number). Fixtures are synthetic. No emoji. Code, comments, docs in English.
- A closed list that a test asserts (seed version, counts, section literals): grep `e2e/` and the web tests for the
  literals you change, replace them with kernel values, run every hit beside your specs, and report the grep and its
  hits (E24-A3 item 3).
- A kernel refusal of a write ships with an api integration test through the sync route.
- Tests: a `@p0` Playwright spec per story as its DoD names, asserting committed state (outbox or store), not only the
  screen. Reading the DOCX is by section heading, never by position. Never put full test output in your context:
  redirect to `.scratch-e25c/<name>.log` and read the tail.
- Running tests: everything in Docker. Stack of this worktree is project `fasor-e25c` (port base 53), already up
  (`api`). Tools: `podman compose --profile tools run --rm --user root tools pnpm <script>`. Narrow runs while
  iterating (`pnpm test:unit -- <path>`, one Playwright spec via `pnpm exec tsx scripts/e2e.ts <spec> --project
  desktop-chrome --project durability-desktop-chrome`). EVERY Playwright run: `lockf -t 20000 /tmp/fasor-verify.lock sh
  -c '...'`, started with `nohup` in the background and its log polled with short calls. After a change under
  `packages/domain` or `apps/api`, `podman compose restart api` before `test:api` and e2e. Never `down -v`.
- Do not run the full `pnpm verify`, `test:e2e:full` or the matrix: the orchestrator runs the batch gate; a story that
  changes the op fold, the commit path or a live ficha query (25.9) also runs its touched durability specs on the matrix
  projects.
- No internal review loop. Report known gaps instead.

## Story notes and decisions the stories leave to the batch

- **25.5.** v15 = v14 content, same flags, `SEED_VERSION = 'v15'`. `V14_HASH` must equal the hash v14 shipped with
  (`git show 2009fa30:packages/domain/src/seed/seed.test.ts`, then compare with main; if main's differs because later
  fixes touched v14, stop and report). The first v14 lock golden exists (PR #325): keep byte-equal; add a second v14
  fixture with its own golden for the cases of the story's list that exist on v14 today (cases for stories not built
  yet are still pinned on v14 as they print now; skip a case only if v14 cannot express it, and say which). Generate the
  new golden once, from code that changes no rule (this story), before 25.6 starts. Bump the contract and
  `MIN_CONTRACT_VERSION` (426 test). Every spec asserting the seed version or list is updated by grep.
- **25.6 to 25.10** each add a named v15 `rules` flag (or a v15 definition key where the story says so) and a strip
  helper. 25.8 and 25.9 run together: they touch different files (`restriction.ts`; `reading-cells.ts`, the cell menu) and
  each owns its own flag.
- **25.9** gates the menu entry by the v15 flag and the fold's acceptance of `not_applicable` per cell by seed without a
  contract bump (state the mechanism in the report). The helper under a reading above the limit is on every seed.
- **25.10** covers its two later criteria (the conclusion and section 10 name every reading, on v15): it touches
  `conclusion.ts`, so it runs after 25.7.
- **Open questions** stay open (B-6, B-8, M-2): build the proposed sentence or keep today's behaviour, list it.
- Every story: authored sentences listed in the report; web tests as its DoD names; the integrated gate is the
  orchestrator's.
