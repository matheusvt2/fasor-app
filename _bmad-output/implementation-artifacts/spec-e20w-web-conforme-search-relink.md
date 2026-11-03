---
title: 'Batch e20w: Stories 20.1, 20.2 and 20.4 (Conforme, Home search by client and obra, relink a point)'
type: 'feature'
created: '2026-11-03'
status: 'in-review'
baseline_revision: '76af18eff41394de3fbdfcd269a088eb2bc2dc77'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_because: 'The three stories share apps/web/src/copy/pt-br.ts, the Home and Points surfaces and the e2e shell specs; 20.1 is mechanical, 20.2 and 20.4 are kernel plus one surface each.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The product still says "PRODUTO" everywhere; Home cannot find a relatório by client or obra (past the 100th it is unreachable); a point of attention's equipment or local is fixed forever when its editor first opens.

**Approach:** 20.1 sets the one constant to `Conforme` and moves the three literals that bypass it onto it. 20.2 adds per-card search keys and a `query` option to the kernel's `homeList`, and a React Aria SearchField in the Home "Relatórios" head. 20.4 adds a kernel list of link options and a link write (two puts, one batch), and a grouped picker in the point editor.

Story texts (the build contract): `_bmad-output/planning-artifacts/epics.md` lines 4864-4923 and 4952-4979, including each DoR. Coordinator readings are decided: 20.2, a query with no tile pressed covers every status, Emitido included.

## Boundaries & Constraints

**Always:**
- AD-1/AD-2/AD-13: every match, selection, order, count, option list, option text and sentence lives in `packages/domain`. `apps/web` holds only the query string, the pressed tile and the picked link before it is written.
- New pt-BR strings go in the three homes of AGENTS.md: derived text in the kernel, static surface copy in `copy/pt-br.ts`, and authored copy marked `// authored:`.
- Screens use existing mock and `components.css` class names. `tokens.css` and `components.css` stay byte-identical. `.frame-*` translations go in `app.css`.
- Mock edits touch only the named lines, each with a dated comment (`2026-11-03, Story 20.x`). MOCK-GUIDE, EXPERIENCE.md, DESIGN.md, AGENTS.md, README.md and the KB get dated amendments: strike the old text (`~~…~~`), add the new text beside it, never delete.
- No emoji. Code, comments and docs are in English.

**Never:**
- Do not touch `packages/domain/src/contract/*`, `apps/api/src/sync/apply.ts` or `e2e/security-ops.spec.ts`. Batch e20s owns them. Do not bump the contract or the seed. If you find a bump necessary, stop and report.
- Do not rename storage identifiers: `releng-{user_id}` (Dexie), the `releng.*` localStorage keys, `releng-shell-*`/`releng-hold` (sw.js), the better-auth cookie prefix `releng`, `fasor-*` AWS names, the domain and `relatorio-rev-{n}` file names.
- Do not rewrite historical specs or reviews. Do not edit `epics.md`, `sprint-status.yaml` or `glossary.md`; the glossary is already amended.
- Do not store the search query. Do not let the picker rename a TAG. Do not make derived Não ensaiado entries editable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Search, no tile | query "porto", cards of every status | every card whose client, obra name or obra site contains "porto" (accent, case and spacing free), Emitido included, in `homeCards` order, cut at the page size with the "Mostrando n de N" note when N > 10 |
| Search + tile | Em campo pressed, query typed | only the Em campo matches; releasing the tile keeps the query and widens it to every status |
| No match | query "zzz" | `empty = { kind: 'none-for-query', text: 'Nenhum relatório encontrado para zzz.' }`, no card; board counts unchanged |
| Blank query | '' or only spaces | exactly the Story 19.2 list (active statuses, or the pressed tile) |
| Current card | the current card does not match | it is absent; when it matches it stays first |
| Relink Geral to equipment | Geral point, pick "TR-01 · …" | one batch: put `equipment_id = <equipment id>` and put `location_id = null` |
| Relink to local | pick a local | one batch: `equipment_id = null` and `location_id = <local id>` |
| Clear | pick "Geral" | one batch: both fields null |
| Same pick | pick the current link | nothing written |
| Unstored new point | pick before any text | the pick is held, like a pending priority, and goes into the create row; it is also kept in the draft |
| Stale link | the point names a removed equipment or local | selected key is `geral`, matching `pointTitle`'s fallback |

</intent-contract>

## Code Map

**20.1 Conforme**
- `packages/domain/src/product.ts:2`: the value becomes `'Conforme'`. `domain.test.ts:6` asserts it.
- `apps/web/index.html:6,44`: the title becomes `Conforme` and the splash becomes `Carregando Conforme…`, as literals. `sw/boot-splash.test.ts` already compares them with the constant.
- `apps/web/src/copy/pt-br.ts:1604`: `empresa.note` becomes `(produto: string) => …` and its caller in `surfaces/registries/empresa-tab.tsx` passes `PRODUTO`. This is the same shape as `copy.recovery.body(PRODUTO)`.
- Tests that hold the literal now import `PRODUTO` or assert `'Conforme'`:
  - `sw/shell-version.test.ts:63`
  - `surfaces/app-shell.test.tsx:111-117`
  - `surfaces/login/login-surface.test.tsx:152`
  - `apps/api/src/jobs/generate/docx.test.ts:407,425`
  - `e2e/shell.spec.ts:5`
  - `e2e/auth.spec.ts:52,86,100`
  - `e2e/ui-hygiene.spec.ts:192,194`
  - `e2e/durability.spec.ts:159`
  - `e2e/cadastros.spec.ts:645,699,730,733`: the titles and comments too
  - `e2e/loading-states.spec.ts:29`: the test title
- Naming lines in the docs:
  - `AGENTS.md:16`
  - `README.md:5`
  - `ux-…/DESIGN.md:3,664,889`
  - `ux-…/EXPERIENCE.md:21`
  - `mockups/MOCK-GUIDE.md` gets one dated line: the mocks keep "PRODUTO" as drawings
  - `docs/kbs/project/rules.md:13`, `docs/kbs/project/overview.md:11`, `docs/kbs/ux/copy-homes.md:15`, `docs/kbs/code/domain-package.md:19`, plus a `docs/kbs/log.md` entry
- `source-deltas.md:139` already holds the row. Change "(planned, Story 20.1)" to built with a dated note.

**20.2 Home search**
- `packages/domain/src/home/cards.ts`:
  - `HomeCard` (43-63) gains `searchKeys: string[]`: `normalizeRegistryName` (`text/normalize-name.ts`) of the client name, the project's `name` and `site`. With no project row the key is the setup `local`. Empty strings are dropped.
  - Fill it in `homeCards` (260-300).
  - `homeList` (394-417) takes `{ filter, pageSize, query? }`:
    - The tile filter applies with a query as without one.
    - With a non-blank query and no tile, the base is every status.
    - The match is `normalizeRegistryName(query)` as a substring of any key.
  - `HomeListEmpty` gains `{ kind: 'none-for-query'; text }`, with an exported `noSearchMatchText(query)` that returns "Nenhum relatório encontrado para ⟨query trimmed⟩." (authored).
  - `HomeList` gains `announcement: string`, the polite status text.
    - Without a query it is `note ?? ''`, so the current behavior is kept.
    - With a query it is the no-match text, or `note`, or an authored count: `plural(total, 'relatório encontrado', 'relatórios encontrados')`. Check the `plural` signature in `text/plural.ts`.
  - Export through the domain index, as the other home exports are.
- Tests: `packages/domain/src/home/cards.test.ts` (or the existing home test file), red first:
  - the keys;
  - accents, case and spacing;
  - the tile narrowing and its release;
  - the page cut and the note on results;
  - the current card absent or first;
  - the no-match text;
  - a blank query.
- `apps/web/src/surfaces/home/home-surface.tsx`:
  - Hold `const [query, setQuery] = useState('')`.
  - Pass `query` to `homeList`.
  - Put a React Aria `SearchField` in `.home-head` beside "Novo relatório": a `.field` with a visually hidden `Label` "Buscar relatório", an `.input` wrapper holding `<svg class="ico"><use href="#i-search"/></svg>` and an `Input` with the placeholder "Cliente ou obra", and the field's clear `Button` ("Limpar busca", authored).
  - Check that the sprite holds `i-search`. If it does not, add the symbol to the sprite the app uses.
  - Escape clears the field, and focus stays in the field as the list updates.
  - The `role="status"` paragraph renders `list.announcement`.
  - Render `none-for-query` in `.home-empty`, as the other empties are.
- `copy/pt-br.ts`: add `home.searchLabel`, `home.searchPlaceholder` and `home.searchClear`.
- `surfaces/home/home.css`: the field layout, full width below 768 px.
- `home-surface.test.tsx`: the three states (results, no match, cleared).
- Telemetry `home.search`: deferred. The target list `UX_ACTION_TARGETS` is in `packages/domain/src/contract/telemetry.ts`, which e20s owns in wave 1, and `rendered-targets.test.tsx` and `targets.test.ts` refuse names outside it. Add no `data-telemetry` on the field. Write a `deferred-work.md` entry owned by e20e (wave 2, after e20s merges): add `home.search` to the list, wire the field's use event (records use, never text, AD-28), and extend the guard.
- Mocks:
  - `prototype/screens/20-home.html:41-44` draws the field in `.home-head`, from the Cadastros toolbar pattern at `80-cadastros.html:192-197`.
  - `key-home.html` gets the same in the `.home-head` of each frame.
  - Both get a dated comment, and MOCK-GUIDE a dated line.
- `EXPERIENCE.md:44`: a dated amendment. Strike "a search and other sort keys wait for Bruno's volume answers" and replace it with the search rule.
- `deferred-work.md:2596`: close the entry "past the 100th", following the file's own closing convention.

**20.4 Point relink**
- `packages/domain/src/relatorio/ops.ts:46`: `PointField` gains `'location_id'`. `ops/path.ts:70-77` already allows the field, so the contract does not change.
- New kernel module `packages/domain/src/points/link.ts`, exported. It is built on `photoEquipmentOptions` and `photoEquipmentGroups` (`photos/gallery.ts:309-363`, sheet order and option text) and on `siteLocals` (`relatorio/site-checklist.ts:39`):
  - `pointLinkGroups(snapshot): PointLinkGroup[]`, with `{ id; label: string | null; options: PointLinkOption[] }` and `PointLinkOption = { key; equipmentId: string | null; locationId: string | null; text }`. The groups are, in order:
    - First, a group with label null holding the one option `geral`, whose text is `POINT_TITLE_GENERAL`.
    - Then, for each site local L in `siteLocals` order, a group labelled with L's name. It holds the local option `local:{id}`, with text `sitePointTitle(L.name)`, then the equipment of the sheets under L (`cabineOf`) in sheet order, as `equipment:{equipmentId}` with the photo option text (TAG · type · place).
    - Then the equipment under no site local, grouped by `photoEquipmentGroups` group labels.
  - A sheet with no equipment id is skipped, and an equipment id appears once.
  - `pointLinkKey(point, snapshot)` returns the option the point names, or `geral` when nothing live matches. This agrees with `pointTitle` (`points/summary.ts:62`).
  - `pointLinkValues(option)` returns `{ equipment_id, location_id }`.
  - Check how `TreeEquipmentNode` and `BlockRow` carry the equipment id.
- Tests: `points/link.test.ts`, plus `pointTitle` after a relink in `points.test.ts`.
- `apps/web/src/surfaces/points/point-writes.ts`:
  - Add `writePointLink(...)`, following `writePriorityPick`. It returns the batch id for undo.
  - On a stored point that differs on either field it writes both puts in one `commitBatch`.
  - On an unstored point it returns pending, and the editor holds the link so that `newRow`/`writePoint` create the row with it.
  - `PointDraftValue` (line 93, already extends `NewPointLink`) carries the picked link, and `pointDraftValue` and `point-draft-recovery.ts` restore it and write it.
  - Tests in `point-writes.test.ts` and `point-draft-recovery.test.tsx`: the three kinds, one batch, the same pick, pending, the draft.
- `apps/web/src/surfaces/points/point-editor.tsx`:
  - Lines 148 and 531-534 (`.poa-equipment` plain text) become a React Aria `Select` labelled "Equipamento ou local", with a `ListBox` of `ListBoxSection`s from `pointLinkGroups`.
  - Follow the `SelectField` pattern in `surfaces/ficha/ficha-fields.tsx` and the `.combobox` classes in `components.css:280-293`.
  - The selected key is the current link, and focus returns to the trigger after a choice.
  - A pick writes through `writePointLink` and is registered with the editor's undo, like a priority pick.
  - The card title (`pointTitle`) updates live.
- `copy/pt-br.ts`: `points.linkLabel` "Equipamento ou local".
- Mock and docs:
  - `prototype/screens/72-pontos.html`: the edit-mode card (line 183 onward) draws the picker, with a dated comment.
  - MOCK-GUIDE gets a dated line.
  - The point card row of `EXPERIENCE.md` gets a dated amendment.
  - `source-deltas.md` gets a new row: a point's link is editable (Story 20.4, 2026-11-03).

**e2e support**
- `e2e/support/groups.ts` `SERIAL_SPECS`. The rule in `scripts/e2e.test.ts:488` puts every spec that calls generate in the serial group.
- `e2e/support/pdf-text.ts` `pdfTextItems`.
- `e2e/action-plan.spec.ts` shows a spec that generates and reads a document.

## Tasks & Acceptance

**Execution:**
1. 20.1: change the constant, `index.html`, the Empresa note, every test listed above and the doc lines. The final grep `grep -rn "'PRODUTO'\|>PRODUTO<\|\"PRODUTO\"" apps packages e2e scripts --exclude-dir=node_modules` returns nothing outside the mocks. The `tokens.css` and `components.css` header comments stay.
2. 20.2: write red kernel tests, then the kernel, then the surface, copy and CSS, then the component tests.
3. 20.2 e2e, `e2e/home.spec.ts`, tagged `@p0`, at 390 and 1280 px. The query matches more cards than the page size, with an emitted match among them. The note shows on the results. The Em campo tile narrows the results, and releasing it widens them again. The no-match note appears. The clear button and Escape both restore the Story 19.2 list. Focus stays in the field. Seed the relatórios through the existing helpers of `home.spec.ts`.
4. 20.4: write red kernel and write tests, then the kernel, `point-writes.ts`, the editor and the copy.
5. 20.4 e2e, `e2e/points.spec.ts`, tagged `@p0`. A Geral point is relinked to an equipment by touch at 390 px; the card names the TAG and place, and the outbox holds two puts (`point/{id}/equipment_id`, `point/{id}/location_id`) with one `batch_id`. An NC point is relinked to another equipment and then cleared to Geral by keyboard at 1280 px; its text and action are unchanged. A draft left open with a picked link survives a reload and keeps the link. After "Sincronizar agora", a second browser context shows the new title.
6. 20.4 print: add a new serial spec `e2e/point-relink-print.spec.ts`, tagged `@p1`, and register it in `SERIAL_SPECS` with its reason. It generates one document with three points (equipment, local, Geral) and asserts section 8's bullet titles in the PDF text, read from the section's own heading.
7. 20.4 local: extend `e2e/verificacoes-local.spec.ts`. A Geral point picks a local, and the card and Sumário row name "⟨local⟩ · Verificações do local".
8. Docs, mocks and `deferred-work.md` (a heading "Deferred from: batch e20w (2026-11-03)" holding the telemetry entry).

**Acceptance Criteria:**
- Given any surface, when it renders, then the wordmark, the titles ("Conforme", "Conta · Conforme", "Sincronização · Conforme"), the splash, and the recovery, outdated, Conta and Empresa sentences say Conforme. A generated DOCX names Conforme as creator and last modified by. No storage identifier changed.
- Given a company with relatórios in every status, when the user types "porto" with no tile pressed, then every match shows, Emitido included, most recent first, cut at the page size with its note. Clearing the field returns the Story 19.2 list.
- Given the Em campo tile pressed and a query, when the list renders, then only the Em campo matches show. Releasing the tile keeps the query and widens it to every status.
- Given a query with no match, then "Nenhum relatório encontrado para ⟨query⟩." shows with no card, and the board counts are those of the whole company.
- Given the field at 390, 768 and 1280 px, then it is a labelled search field with a clear button. Escape clears it, focus stays in it, and the count is announced in a polite status.
- Given a Geral point, when "TR-01 · …" is picked, then the card and the printed bullet name it, and the change syncs as one batch.
- Given an NC point, when another equipment, a local or Geral is picked, then the link changes everywhere, the text, photos and action are unchanged, and an open draft keeps the pick across a reload.
- Given the picker, by touch and by keyboard, then it is a labelled listbox with groups, the current link is selected, and focus returns to it after a choice.

## Design Notes

The search matches each key separately, so a query never matches across the client/obra boundary. The order and the cut stay as `homeCards` gives them; the search adds only a predicate. Status board counts keep coming from `allCards` in the surface.

The link writes both fields every time, so a stale `location_id` never survives a pick of an equipment. `pointTitle` prefers `equipment_id`, but a printed or synced row stays unambiguous. The e20s stories 20.9 and 20.10 will validate these puts on the server. The values are ids of live rows or null, so they pass.

## Verification

Run every command inside the tools container:

```
podman compose --profile tools run --rm --user root tools <cmd>
```

Each Playwright run takes the host lock:

```
lockf -t 20000 /tmp/fasor-verify.lock
```

**Commands:**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` are expected green.
- The touched specs are expected green:

  ```
  pnpm exec tsx scripts/e2e.ts e2e/shell.spec.ts e2e/auth.spec.ts e2e/ui-hygiene.spec.ts e2e/durability.spec.ts e2e/cadastros.spec.ts e2e/loading-states.spec.ts e2e/home.spec.ts e2e/points.spec.ts e2e/verificacoes-local.spec.ts e2e/point-relink-print.spec.ts --project desktop-chrome --project durability-desktop-chrome
  ```

## Spec Change Log

## Review Triage Log

### 2026-11-03 — Review pass

Layers run: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment were skipped for token economy; the integrated epic review covers them.

- verdicts: 8 findings. high 0, medium 2, low 4, false 2, maybe-false 0.
- findings:
  - `[low]` `[reject]` A stale link (an equipment or local that has been removed) reads `geral`, so picking "Geral" is dropped and the stale id stays stored.
    - The point already prints and shows as Geral (`pointTitle`).
    - The harm appears only if the removed sheet is later restored. That is rare.
    - The fix would add a stale-state branch to the picker.
  - `[medium]` `[patch]` `pickLink` was not chained into `lastWrite.current`, and a refused pick never set `refused.current`.
    - As a result, `finish()` could close with `onDone(null)` after a pick created the point, or close after a refused pick.
    - Fix: chained it the way `persist` does.
  - `[low]` `[reject]` A pick on an untouched seeded new point creates the row.
    - The pick is the person's own change. The priority pick (`writePriorityPick` through `writeFields`) creates the row in the same case, so this is the existing pattern.
  - `[low]` `[reject]` Undoing a pick that created the point undoes the create.
    - The priority pick returns the create's batch for undo too (`noteFieldsWrite`).
    - This is consistent behavior of the editor, not a new defect.
  - `[false]` `[reject]` A rejected pick is said to revert silently.
    - Refuted: `edits.write` toasts a rejection (`writeErrorText`) and rethrows it (`state/use-undoable-edits.ts:17`).
  - `[low]` `[patch]` The no-match sentence echoed raw internal spacing.
    - Fix: whitespace runs are collapsed in `noSearchMatchText`, with a kernel test case.
  - `[medium]` `[patch]` (verification gap) No test covered the editor's normal create path with a pick (Criar, then pick, then type, then Concluir), nor a pick in the NC-row dialog.
    - Fix: added `@p0` tests in `e2e/points.spec.ts`.
  - `[false]` `[reject]` (verification gap, other) The relink is said never to be offered for undo.
    - Refuted: `pickLink` returns `result.batchId` from inside `edits.write`, which is what the queue offers as "Desfazer". The trailing `.then` only settles the outer promise.
