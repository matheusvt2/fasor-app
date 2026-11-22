---
title: 'e27b: form words on seed v17, wording and user errors (Stories 27.8 to 27.10)'
type: 'feature'
created: '2026-11-22'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high (27.8); medium (27.9, 27.10)'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-27-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Epic 27 wave 2 is one batch and one PR (token economy of 2026-11-12); 27.9 reads the seed 27.8 opens, 27.10 shares pre-issue and the Sumario with them.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The manual pass of 2026-11-21 found the form's words misspelt on screen and in the PDF ("ÍTEM", "TP's e TC's", "Para-raio", "1° Subsolo", "realizada" for a compound activity; F30, F35), sentences that do not agree or use internal words (F29, F31 to F34, F36 to F40), and five user slips the app lets through (F23 to F26, F28).

**Approach:** Story 27.8 opens seed v17 equal to v16, locks the v16 layout, then puts the words into v17's own definitions and rule flags (plus "TPs e TCs" in code for every new revision). Story 27.9 fixes the derived and static sentences, holding every printed form of v16 and older. Story 27.10 adds the warnings and guards on the screens and one pre-issue kind.

The stories, word for word, are `_bmad-output/planning-artifacts/epics.md` lines 11969-12133 (read with offset/limit only; the epic's rules are lines 11629-11637). Findings: `_bmad-output/test-artifacts/manual/ux-pass-2026-11-21.md` (grep the F number). This spec adds the batch's readings; where it is silent the story text rules.

## Boundaries & Constraints

**Always:**
- Seeds v1 to v16 are frozen: `seed/v1.ts` and every `seed/vN.ts` for N <= 16 keep producing the same bytes (`V1_HASH`..`V16_HASH` in `seed/seed.test.ts` unchanged). New words live in `seed/v17.ts` (fenced sections, the `seed/v16.ts` pattern: one `story27_N(seed)` per story, its undo `withoutE27b<N>` in `seed.test.ts` so `withoutE27b(v17)` equals v16). A new optional schema field is allowed only if absent on v1..v16 (their stringify and hash unchanged).
- A change to a printed page or to what a sheet asks is reached through a v17 key or a `seedRulesSchema` flag read by `seedRule` (`seed/definitions.ts:218`), never a version-number comparison (AD-21).
- The printed layout of every relatório on v16 or older stays byte-identical, except the one named line: the group title "TPs e TCs dos Cubículos de MT" (Story 27.8). Bruno approved the layout: on v17 only the words 27.8 names and the section 10 sentence of Story 27.3 (`parecer_open_apart`) change.
- Only 27.8 adds or changes a golden, a layout lock, a `pdf-text.json`, `porto-seguro-skeleton.json`, `fixtures/porto-seguro/*.golden.json`. If work for 27.9 or 27.10 turns any of them red, do NOT regenerate: hold that change (see Design Notes, "print held") and report it.
- Strings: derived pt-BR in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts`; component chrome in `apps/web/src/copy/ui.ts`. `apps/web` never decides a plural, status word or rule. Every authored pt-BR sentence carries `// authored (Story 27.x, listed for Bruno)` and goes in your report with its old form.
- Before changing a user-visible sentence, `grep -rn` its old words over `e2e/`, `apps/*/src/**/*.test.*`, `packages/domain/**/*.test.ts` and update what asserts them in the same story; list each updated test and why in your report. A spec reads a closed list (seed version, labels) from the kernel, never a literal.
- Epic 26 code stays intact: the permission checks in `apps/web/src/surfaces/relatorio/sumario-surface.tsx` (`useCan`, `useCanFn`, `permissionForPath`, around lines 270-285), `apps/web/src/state/permissions.tsx`. Never edit `ops/path.ts`, `contract/errors.ts`, `http/session.ts`, `auth/auth.ts`, `permissions/`, `apps/web/src/app.tsx`, the Login screen.
- No emoji. Code and comments English; UI copy pt-BR.

**Never:**
- Edit `epics.md`, `sprint-status.yaml` or `docs/kbs/` (the coordinator's records PR does; list the KB/log lines the stories ask for in your report instead).
- Rename a stored template, a stored location, a stored caption or any stored text. No relatório migrates its seed.
- Any other word or layout change; the contact headers "Linha / Terra / Guard"; F22, F27, F41.
- Run the full `@p0`, `test:e2e:full` or the matrix.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| v17 opening | `seed.test.ts` at the opening commit | `V16_HASH` as shipped (`a1fad5c2...`), `SEED_VERSION` 'v17', keys v1..v17, v17 stringifies equal to v16 | - |
| v17 print | v17 relatório, Para-raios ficha with a retightening photo | "ITEM", "Para-raios", "1º Subsolo" (U+00BA), "Detalhe da limpeza e reaperto realizados no para-raios" | - |
| v16 print | v16 relatório, new revision | "ÍTEM", "Para-raio", "1° Subsolo", caption "realizada no para-raio"; title "TPs e TCs dos Cubículos de MT" | - |
| old goldens | v5..v16 lock goldens, Porto Seguro skeleton | diff vs main is the group title line only | other diff = defect, stop |
| old client | contract 56 client syncs | 426 with the update notice | existing path |
| parecer v17 | v17 relatório with an open ficha holding a reading out | section 10 names it apart from the reprovadas (Story 27.3 sentence) | v16: unchanged |
| quick phrases | two phrases tapped in a row | "…ausentes, luvas com furos" | first phrase keeps its case |
| point text | point from an NC row with 1 / 2 photos | ends ", conforme Imagem 1" / ", conforme Imagens 1 e 2" | no photo: no suffix |
| Home search | filter "Em revisão", search matching only an Emitido | message names the filter and "1 relatório" in another status (kernel plural) | 0 elsewhere: today's message |
| Home search 2 | search by template name or by the card's date text | matching cards show | - |
| repeated client | Cadastros has "Cliente Local"; type "cliente  local" | the Novo relatório dialog's warning, before save; creation still allowed | - |
| empty section text | section text emptied | Sumário row "texto vazio"; "Antes de emitir" and Gerar dialog list it; "Gerar relatório" enabled | - |
| empty exclusion | an empty exclusion row, "Concluir dados do relatório" | stored exclusions hold no empty row | whitespace-only counts as empty |
| unanswered items | 3 unanswered, "Concluir verificações" | message beside the button "3 itens…" (kernel plural), first item focused | 1 item: singular |
| nothing removed | Sumário overflow menu | "Restaurar ficha removida" disabled with its reason | something removed: enabled as today |

</intent-contract>

## Code Map

Story 27.8 (seed v17):
- `packages/domain/src/seed/v16.ts` -- the pattern for `v17.ts` (header comment, fenced sections, `structuredClone(v16)`).
- `packages/domain/src/seed/definitions.ts:49,68,135,218` -- import, `SEED_VERSION`, `SEED_VERSIONS` bundle, `seedRule`.
- `packages/domain/src/seed/schema.ts:973` (`seedWordSchema`), `:1046-1091` (`seedRulesSchema`; `parecer_open_apart` at :1089, set by no seed yet).
- `packages/domain/src/seed/seed.test.ts:2413-2620` -- hash pins and the e25s opening tests (`E25S_STRIPS`, "e25s-UNIT-V16"); add "27.8-UNIT".
- `packages/domain/src/seed/v1.ts:514` (label 'Para-raio'), `:630` (`word('limpeza e reaperto','f','singular')`), `:655` (`checklist_columns` 'ÍTEM') -- read only; v17 overrides in its clone.
- `packages/domain/src/seed/template.ts:202` -- standard template local '1° Subsolo'; `standardTemplate` at :270.
- `packages/domain/src/photos/caption.ts:28` (`CAPTION_EQUIPMENT_WORDS.para_raio`), `:225-235` (`composeCaption`, article and participle share one agreement today).
- `packages/domain/src/print/group-for-print.ts:123` -- "TP's e TC's dos Cubículos de MT".
- `packages/domain/src/print/section-9.ts:442,472` -- checklist header from the seed's columns.
- `packages/domain/src/contract/version.ts:673,1075` -- `CONTRACT_VERSION`/`MIN_CONTRACT_VERSION` 56 on main; this batch takes 57 for both, dated reason in the comment list.
- `packages/domain/fixtures/layout-lock/op-log.ts:60-91` -- `LAYOUT_LOCK_VERSIONS`, `LAYOUT_LOCK_EPIC25_VERSIONS`; header comment gets a dated 27.8 paragraph.
- `apps/api/src/jobs/generate/docx-layout-lock.test.ts:136`, `layout-lock.integration.test.ts:160`, `docx.test.ts:70`, `apps/api/src/sync/porto-seguro.integration.test.ts:84` -- regenerate with `GOLDEN_UPDATE=1`.
- `apps/api/src/jobs/generate/golden/` -- `layout-lock-v5`..`v15`, `-v14-epic25`, `-v15-epic25`, `porto-seguro-skeleton.json`.
- Precedent commit `8745bc4e` (`git show --stat 8745bc4e`): every file the v15->v16 opening touched (template upgrade test, sync creation test, contract test, tests pinned to the previous version, e2e `seed-v15.spec.ts`).
- `apps/web/src/copy/pt-br.ts:549` -- screen name `para_raio: 'Para-raio'` (every seed).
- `_bmad-output/specs/spec-fasor/source-deltas.md` -- one dated row for decision 2.

Story 27.9: the story's "Today" list (epics.md 12031-12038) gives every file:line; also `docs/nc-chip-phrases.md`.
Story 27.10: the story's "Today" list (epics.md 12092-12098); `packages/domain/src/relatorio/pre-issue.ts:360-570` (rows), `:660` (`EXPLICIT_KINDS`, owned by 27.4: append only), `packages/domain/src/relatorio/sumario.ts:186` (`textEdited`), `packages/domain/src/text/normalize-name.ts:9`, `apps/web/src/surfaces/home/new-project-dialog.tsx:102`.

## Tasks & Acceptance

**Execution (in this order; one commit per step, message `e27b: ... (Story 27.N)`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`):**

Story 27.8
1. Opening commit: `seed/v17.ts` = v16 (no story section yet), `SEED_VERSION` 'v17', `SEED_VERSIONS` v1..v17, `V17_HASH` pinned, "27.8-UNIT" opening pins; contract 57/57 with dated reason; template upgrade v16->v17; sync creation born on v17 and a 56 client refused 426; tests reading the current seed name v17, tests asserting v16 behaviour pinned to v16 (find by grep, as `8745bc4e` did); `LAYOUT_LOCK_VERSIONS` and `LAYOUT_LOCK_EPIC25_VERSIONS` gain 'v16'; goldens `layout-lock-v16` and `layout-lock-v16-epic25` taken with `GOLDEN_UPDATE=1` on this commit (no rule changed, so they are main's output); every other golden byte-equal. e2e: grep `e2e/` for 'v16' literals and seed-version counts (E15-A3) and read them from the kernel.
2. "TPs e TCs": `group-for-print.ts:123` -> "TPs e TCs dos Cubículos de MT" for every relatório; regenerate v5..v16 lock goldens and Porto Seguro goldens; check with `git diff --stat` and `git diff` that each golden's diff is that title alone (paste the per-file diff summary in your report). Update `group-for-print.test.ts`, `section-9.test.ts`, `e23z-final-fixes.test.ts`, `docx.test.ts`, `e2e/test-base-import.spec.ts` assertions.
3. Words on v17 (`story27_8(seed)` in `v17.ts`): `checklist_columns[0]` 'ITEM'; `blocks.para_raio.label` 'Para-raios'; the atividade "limpeza e reaperto" so the caption reads "Detalhe da limpeza e reaperto realizados" (article from the first noun, f singular; participle m plural: an optional seed-word field absent on v1..v16, read by `composeCaption`); one new rule flag (Story 27.8) that makes the caption equipment word of `para_raio` "para-raios" (m singular) on v17; `parecer_open_apart: true`. Standard template local '1º Subsolo' (U+00BA) for templates built after this story; stored templates untouched (coordinator's reading). Screen name `pt-br.ts:549` 'Para-raios'. Grep and update every test asserting the old screen name or the standard template's '1° Subsolo' when that test builds from the standard template (a test on the Porto Seguro fixture or a stored template keeps '1°').
4. Goldens of v17: `LAYOUT_LOCK_VERSIONS`/`EPIC25` gain 'v17'; `layout-lock-v17` (and `-v17-epic25`) pin "ITEM" and "Para-raios"; a v17 unit/integration test pins the caption and '1º Subsolo'; a print test for `parecer_open_apart` on v17 (Story 27.3's sentence) beside a v16 one unchanged. "27.8-UNIT-LOCK", "27.8-INT-LOCK" names. `withoutE27b(v17)` equals v16.
5. `e2e/seed-v17.spec.ts` "27.8-E2E-001 @p0" (in `SERIAL_SPECS` lane `queue`, since it generates a PDF; `scripts/e2e.test.ts` stays green): a new relatório is on v17 (seed version from the kernel), a Para-raios ficha with a retightening photo, the PDF's text carries the four words; a v16 relatório beside it (seeded through the api test fixtures, as `e2e/seed-v15.spec.ts` does for its older version) keeps its words. Assert the committed state (store/outbox) as well as the screen.
6. `source-deltas.md` dated row (decision 2, 2026-11-21); dated reason in `contract/version.ts`.

Story 27.9 (each item of epics.md 12041-12048)
7. Kernel: agreement fixes ("Soma-se" is static copy; "NC aberta/abertas"; "Todas"; "Ainda não enviado ao cliente"); `insertPhrase` lower-cases a phrase joined after a comma; point text ends ", conforme Imagem 1" / ", conforme Imagens 1 e 2" (for new point texts; stored texts are not rewritten); applicability reason in sentence case; "Semente v16" leaves the template line (counts stay); "preenchido automaticamente"; NC photo caption "Não conformidade em {item}…"; Home search empty message names the filter and the count elsewhere (kernel plural), and the search matches the template name and the card's date text. "27.9-UNIT" tests old and new.
8. Static copy (`pt-br.ts`): "Soma-se", "Início/Fim da execução", "Obra" for the place label, "Revisão do formulário" / "Rev. N", "Dados do relatório" for setup, the "flag" sentence reworded, "Altitude do local", "Único tipo disponível nesta versão" removed. Web tests updated.
9. `e2e/wording-pass.spec.ts` "27.9-E2E-001" (`@p1`): the screens where each sentence shows. `docs/nc-chip-phrases.md` if a listed join changes.

Story 27.10 (epics.md 12101-12106)
10. Kernel: pre-issue kind for an empty section text (row of its section, severity `pending`, never `blocking`), appended to the kinds list and to `EXPLICIT_KINDS`; Sumário meta "texto vazio" in place of "texto editado" for an empty edited text; exclusion drop helper used when "Concluir dados do relatório" writes; unanswered-items message text with kernel plural. "27.10-UNIT".
11. Web: Cadastros › Clientes warns with the Novo relatório dialog's rule and words (reuse its component or copy key, `normalizeRegistryName`) before create; setup-surface drops empty exclusions on conclude; verificacoes-surface shows the message beside "Concluir verificações" plus today's scroll and focus; Sumário overflow "Restaurar ficha removida" disabled with its reason when the restore list is empty (React Aria disabled item with a description; keep Epic 26's permission gating as it is).
12. `e2e/user-errors.spec.ts` "27.10-E2E-001 @p0": the five slips as a user makes them, asserting the stored state (exclusions in IndexedDB, no client created before confirm).
13. `EXPERIENCE.md` dated strike-through amendment for each screen that departs from its mock (the message beside "Concluir verificações", the disabled restore item, the Cadastros warning), if the mock shows otherwise.

**Acceptance Criteria:** the story ACs of epics.md (27.8: 11995-12013; 27.9: 12053-12075; 27.10: 12110-12128), plus:
- Given the batch head, when the v5..v16 layout-lock goldens and the Porto Seguro goldens are diffed against `origin/main`, then the only changed line in each is the "TPs e TCs dos Cubículos de MT" title, and after steps 7-12 nothing in any golden changes.
- Given `podman compose --profile tools run --rm --user root tools pnpm lint && ... static`, then both are clean.

## Design Notes

- **Print held (27.9, 27.10).** For each 27.9 sentence, find whether it reaches the document (section 7 captions, section 8 point texts, section 9 sheet texts, the revision note). If it does: gate the printed half behind a new `seedRulesSchema` flag (one per story, "Story 27.9 (F..)") set on v17 in `story27_9(seed)`; the screen half applies on every seed. Then run the layout-lock unit and integration tests and the Porto Seguro tests. If the v17 golden (or any golden) goes red because of it, do not regenerate: remove the flag from v17 (the code path stays, flag off, printed form held on every seed) and report the sentence as "printed half held, open to the coordinator". 27.10 changes no printed page.
- **The caption participle.** composeCaption's article and participle today share the word's agreement; "limpeza e reaperto" needs article "da" (limpeza, f singular) and participle "realizados" (the compound, m plural). Keep the change additive and optional so v1..v16 parse to the same bytes.
- **Contract.** Main is 56; the batch takes 57 (both numbers), bumped once. The orchestrator re-checks `origin/main` before the gate and renumbers if Epic 26 took 57.

## Verification

Run inside the tools container of this worktree's stack (`fasor-e27b`, already up; never start, stop or rebuild the stack yourself, never `-v`), each command under the host lock, output to a log in `.scratch-e27b/`, reading only its tail:
`lockf -t 20000 /tmp/fasor-verify.lock podman compose --profile tools run --rm --user root tools pnpm <cmd> > .scratch-e27b/<name>.log 2>&1; tail -30 .scratch-e27b/<name>.log`

**Commands:**
- `pnpm lint`, `pnpm static` -- clean.
- `pnpm test:unit -- <paths>` while iterating; `pnpm test:unit` once at the end of each story -- green.
- `pnpm test:api -- <paths>` for the layout-lock, docx, porto-seguro, sync, template-upgrade tests (`GOLDEN_UPDATE=1` only where step 1, 2 or 4 says) -- green.
- `pnpm exec tsx scripts/e2e.ts e2e/<spec>.spec.ts --project desktop-chrome --project durability-desktop-chrome` for each spec written or touched -- green.
- Restart the api (`podman compose restart api`) after any change under `packages/domain` or `apps/api` before `test:api` or an e2e: it serves stale domain code otherwise.

## Auto Run Result

Status: in-review (PR open, not merged; no review loop inside the batch, the 2026-11-12 rule).

- Implementers, all on opus: 27.8 `bmad-dev-opus-high` (a16176c2..ded10deb), returned; 27.9 `bmad-dev-opus-medium` (0dce4dc8..ec1461f8), returned, but the e2e run it started in the background died with it; the orchestrator re-ran it (4 reds, fixed in 09294c0b); 27.10 `bmad-dev-opus-medium` (d6c56c61..c59fb070), returned.
- Orchestrator cuts and waits: about 1 h waiting for a stack slot (fasor-e26d and fasor-e26e up), while 27.8 was written with `--no-deps` unit runs only; idle from 05:00 to 09:40 after the 27.9 implementer handed back with its e2e run dead (the coordinator's nudge resumed the batch; handoff file `.scratch-e27b/HANDOFF.md`).
- Goldens: the v16 lock goldens were generated with `GOLDEN_UPDATE=1` on the opening commit a16176c2 (checked out detached) and committed as a0ae3dbe; the v17 goldens and the Porto Seguro skeleton on 0242be9c. v5 to v15 goldens are byte-equal to main; the skeleton differs by the two "TPs e TCs" titles only; v17 differs from v16 by ITEM, PARA-RAIOS and the section 10 sentence only.
- Main merged twice (1e65ff27, 8a214062); contract 57 against main's 56.
- Gate on the final head: see the PR body.
