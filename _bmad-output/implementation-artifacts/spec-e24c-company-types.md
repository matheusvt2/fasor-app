---
title: 'e24c, company types: a "nominal ± %" criterion, a copy hides its original, a type that cannot compute its ratio is not published (Stories 24.18 to 24.20)'
type: 'feature'
created: '2026-11-11'
status: 'in-review'
baseline_revision: '1c63235e9113855c30afaf228708177566c218ed'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'The company-types half of the planned batch e24p, started early at Matheus request: three stories on the company type editor, the palettes and the publish rule, no seed change, one contract bump, one review, one gate, one PR.'
deferred:
  - summary: >-
      In the template composer a library type hidden by a published copy loses its only "Editar padrões" entry while a template still places it.
    evidence: |-
      onEditDefaults is offered only on a palette row of a placed seeded type; review VG-other and ECH-1; ledger row in the e24c section (owner Matheus).
    location: >-
      apps/web/src/surfaces/templates/block-palette.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Bruno (questions 30 and 32) and the e23z ledger ask three things of company types. The office cannot write "220 V ± 5 %" (24.18). A published copy of a library type sits at the end of "Outros equipamentos" while its original stays offered, so the technician may pick the library sheet by mistake (24.19). A draft whose ratio table reads the vector group can publish with that plate field missing or altered, and its ratio never computes (24.20; ledger rows "a company draft can publish while a ratio table reads by vector group with no plate field left" and e23z's narrowing "Item 4: only removing the field is refused").

**Approach:** Build each story as `_bmad-output/planning-artifacts/epics.md` writes it (24.18 :8874-8945, 24.19 :8947-9015, 24.20 :9017-9075; read each whole, ACs and DoD; the dated notes win over the sentence they amend). The kernel decides every rule, list and text; the web renders and writes the existing draft and version ops. One contract bump covers the new operator and field in a company definition.

## Boundaries & Constraints

**Always:**
- Red first: each AC gets a test that fails on the baseline before the code. Test ids as the DoD names them (`24.18-UNIT`, `24.18-API-001`, `24.18-E2E-001 @p0`, `24.19-UNIT`, `24.19-E2E-001 @p0`, `24.19-E2E-002`, `24.20-UNIT`, `24.20-API-001`, `24.20-E2E-001 @p0`). A new `@p0` e2e asserts committed state (IndexedDB store or outbox), not only the screen.
- AD-1/AD-13: the rule words, the criterion text, the bounds, the palette groups, the hidden-type line, the panel proposal, the publish issue and the refusal sentence are kernel functions in `packages/domain`. Static words in `apps/web/src/copy/pt-br.ts`. Every pt-BR sentence authored here is marked `// authored (e24c, listed for Bruno)` and listed below under "Authored sentences".
- No seed data change. Nothing an existing relatório prints may change: the layout-lock goldens (v5, v11, v12) and the Porto Seguro golden stay byte-identical; fixtures change by additions only. Check: `git diff 1c63235e --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` lists no M or D.
- Every seeded type and every company version published before this batch evaluates and prints as today.
- Every container run: `podman compose run --rm --user root tools ...` from the worktree (project `fasor-e24c`, `.env` present). Every `test:unit`, `test:api` or Playwright run under the host lock, started with nohup, logged under `.scratch-e24c/`, polled in bounded calls of at most 55 s: `(nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c 'podman compose run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/x.spec.ts --project desktop-chrome --project durability-desktop-chrome' > .scratch-e24c/x.log 2>&1; echo EXIT=$? >> .scratch-e24c/x.log) &`. `podman compose restart api` after any change under `packages/domain` or `apps/api`, before `test:api` or an e2e. Before bringing the stack up, `podman ps --format '{{.Names}}'`: never be the third running compose project. Narrow runs while iterating (`pnpm exec vitest run --project @app/web <file>`, one spec with `--grep`). Never touch the main checkout.
- English code and comments; no emoji; no story ids in code comments beyond the repo's existing "Story 24.N" doc-comment habit.

**Never:**
- No edit of the seed (`seed/v*.ts`, `seed/seed.test.ts`), `relatorio/conclusion.ts`, `relatorio/parecer.ts`, `print/section-9.ts`, `print/section-10.ts`, `epics.md` or `epic-24-context.md` (batch e24a and the coordinator own them). `contract/version.ts` only appends this batch's paragraphs and numbers.
- No rule on a seeded type; no nominal read from a plate field; no new screen; no new component kit; no change to how an existing sheet or template of a hidden original works.
- The 24.20 rule never goes into `companyTypeDefinitionSchema` (see Design Notes D3).

## I/O & Edge-Case Matrix

| Story | Input / State | Expected |
|---|---|---|
| 24.18 | draft row in V, rule `nominal_pct`, value 220, tolerance 5 | valid; preview and sheet helper and ACEITÁVEL read `220 V ±5 %`; publishes |
| 24.18 | readings 209, 231, 208,9, 231,1 V | within, within, out, out; an out reading floors the ficha as any out reading does on its seed |
| 24.18 | tolerance 0, empty, negative, NaN; value missing | one issue on the row naming the field, Critérios tab; strict schema refuses |
| 24.18 | row used by the ratio test's deviation | `nominal_pct` not offered, `±` offered; strict schema refuses `nominal_pct` there |
| 24.18 | row switched nominal_pct to between | `tolerance_pct` dropped, `value_max` unset (the row asks for the maximum) |
| 24.18 | row switched to nominal_pct | `value` kept as nominal, `value_max` dropped, tolerance unset (issue asks for it) |
| 24.18 | reading above the instrument's limit on a nominal row | judged as `between` judges it today (no verdict) |
| 24.18 | nominal 13,8 tol 5 | bounds exact to 12 significant digits (13,11 and 14,49), no float noise at the ends |
| 24.19 | one published copy of transformador_forca (base_block_type) | both palettes: the copy where the transformer stood, marked "Tipo da empresa"; the transformer not offered; v13 and v14 alike |
| 24.19 | two copies (or a copy of a copy) | both in the original's place, label order |
| 24.19 | copy retired, removed, or never published (draft only) | original offered, copy not |
| 24.19 | copy of a library type (CTA) | stands in the CTA's place under "Outros equipamentos" |
| 24.19 | copy whose base type the relatório's seed does not ship | stays at the end of "Outros equipamentos" as today |
| 24.19 | "Fotografar equipamento" reads a hidden type | one copy: proposal is the copy at its latest version; several: no proposal, every chip shown, hidden original replaced by its copies in the chips |
| 24.19 | relatório holding a sheet of the original; template placing it | open, duplicate, print, new relatório: as today |
| 24.20 | draft, ratio table `ratio_factor: 'vector_group'`, plate lacks a valid `ligacao_secundaria` (missing, kind changed, options changed) | one issue on the ratio test (Ensaios tab), counted in the publish bar; "Publicar" disabled |
| 24.20 | the same draft pushed as a version create | server refuses (push route), as a strict-schema refusal is refused |
| 24.20 | editor: change kind or remove/alter an option of the valid field while a ratio table reads it | refused with a toast; draft unchanged; label and unit changes still allowed |
| 24.20 | ratio by `sqrt3`, or no ratio test | no issue |
| 24.20 | base import plan of a transformer copy; a version already published broken and its sheet | passes as today; the sheet works; the version still syncs to a fresh device |

</intent-contract>

## Code Map

**24.18, the criterion** (paths under `packages/domain/src/` unless named):
- `types/definition.ts` -- `COMPANY_CRITERION_OPERATORS` :52 (insert `'nominal_pct'` after `'between'`; order is the editor's and the rules line's), `companyCriterionSchema` :77-94 (new optional `tolerance_pct: z.number()`; superRefine: `nominal_pct` needs a finite `tolerance_pct > 0` at path `tolerance_pct`, no `value_max`; any other operator carries no `tolerance_pct`), `criterionRulesFor` :203-210 (`nominal_pct` offered when no use is `deviation`), `checkCompanyDefinition` :244-247 (refuse `nominal_pct` on a deviation row, like `±`).
- `seed/criteria.ts` -- `criterionSeedSchema` (optional `tolerance_pct`), `formatCriterionValue` :122 (nominal text: value then unit then `±` glued to the tolerance then ` %`, e.g. `220 V ±5 %`, decimals with a comma; no unit: `220 ±5 %`), new exported `nominalBounds(value, tolerancePct)` (min/max, each `Number(x.toPrecision(12))`, ordered so a negative nominal works), `compareCriterion` :144 (a `nominal_pct` case over `nominalBounds`, same as `between`).
- `types/block-definition.ts` `criteriaOf` :38-50 -- the reader's shape of a `nominal_pct` row is `operator: 'between'`, `value`/`value_max` = the bounds, `text` = its `formatCriterionValue`. Every reader (`measurement-evaluation.ts` `limitOf` :424/`withinLimit` :444, `reading-evaluation.ts` `outHelperText` :498, `manufacturerApplies` :213, `over-range.ts`, `reading-run.ts`, the print) then judges and writes it exactly as a `between` row. Check `limitOf` keeps `text` (it calls `formatCriterionValue(seeded)`, which returns `text`).
- `types/draft-edit.ts` -- `CRITERION_RULE_WORDS` :636 (`nominal_pct: 'nominal ± %'`), `updateDraftCriterion` :668 (patch `tolerance_pct`; rule change as in the matrix), the Critérios preview helpers if they format rows.
- `types/validate.ts` `sentenceOf` criteria case :228-249 -- sentences for `tolerance_pct` (missing/zero/negative; on another rule) and for `value` on a nominal row; `nominal_pct` on a deviation row.
- `types/duplicate.ts` :68 -- copies of seeded criteria keep their operators (no change expected; verify).
- Web: `apps/web/src/surfaces/templates/type-editor-parts.tsx` `CriteriaPanel` :799-908 (a nominal row shows two inputs "Valor nominal" and "Tolerância (%)" inside `.tipo-nominal`, the mock's class, mirrored in `apps/web/src/styles/app.css` from `43-tipo-equipamento.html` :50-54 with the route selector dropped and `.frame-phone` translated per AGENTS.md; issues at `value` and `tolerance_pct` inline), the preview at :656; `apps/web/src/copy/pt-br.ts` `typeEditor` :676 (`criteriaRules` gains "nominal ± %" after "entre"), new labels near :682.
- Contract: `contract/version.ts` -- paragraph and `CONTRACT_VERSION` :501 = 44, `MIN_CONTRACT_VERSION` :793 = 44 (43's paragraphs :490, :787 are the model). The number is re-taken at the merge with main before the PR (orchestrator; batch e24a may take 44 first). Tests: `contract/contract.test.ts`, `apps/api/src/sync/sync.integration.test.ts` "1.5-API-005 contract skew" (precedent `git show 1c63235e -- apps/api/src/sync/sync.integration.test.ts`).

**24.19, the hidden original:**
- `relatorio/tree.ts` `paletteTypeGroups` :792-799 -- new kernel `hidingCopies(ctx, seedVersion): Map<BlockTypeKey, BlockTypeKey[]>` (seeded type the seed version ships to its copies: company types `offeredTypes` returns whose latest definition's `base_block_type` is that type, label order as `offeredTypes`). Groups: each seeded or library type replaced in place by its copies when it has any; the copies left out of the tail of the library group; the rest as today. Keep the change small (batch e24s adds a type as data here).
- `relatorio/tree.ts` `PaletteItem`/`paletteItems` :801-836 -- `library` stays the group flag; add `company: boolean`; `summary` computed for a company type in either group (`libraryTypeSummaryText`).
- `seed/definitions.ts` `offeredTypes` :431 -- unchanged.
- `relatorio/panel.ts` `panelTypeChips` :185, `panelProposal` :226 -- take the definition context: a read type hidden by one copy proposes the copy (`typeVersion` latest, its label by `blockTypeLabelIn`, its TAG by `suggestTag(type, equipment, definition)`, trust and `suggestionStatus` as for the read type); hidden by several: no proposal, chips all shown with the hidden type replaced by its copies; `PanelProposal` and `PanelTypeChip` carry `typeVersion?`.
- `types/list.ts` `libraryTypeListRows` :123 -- takes the context; a row whose type is hidden gets `hiddenText` (kernel, authored), else null.
- Web: `apps/web/src/surfaces/relatorio/block-palette-field.tsx` :124-235 (the "Tipo da empresa" mark: `copy.ficha.companyPill`-style word from `pt-br.ts` before the meta of a company row), `apps/web/src/surfaces/templates/block-palette.tsx` :160-171 (meta for a company row in either group, same mark), `apps/web/src/surfaces/relatorio/panel-capture.tsx` :99, :106-112 (`PanelConfirm.typeVersion`), :275-277 and its caller `relatorio-tree.tsx` :410 (`createBlock` already takes `typeVersion`), `apps/web/src/surfaces/templates/type-list.tsx` :81, :240-259 (a second `rr-secondary` line for `hiddenText`; `copy.types.libraryNote` replaced with a dated comment keeping the old text struck in the comment).
- E2e: `e2e/support/palette.ts` and every spec asserting the palette's list read it from the kernel (E14-A3; `grep -rln "palette" e2e/`).

**24.20, the publish rule:**
- `relatorio/vector-group.ts` `VECTOR_GROUP_FIELD` :280, `isVectorGroupField` :290, `isVectorGroupOptions` :297.
- New kernel `vectorGroupPublishIssue(definition)` (in `types/validate.ts` or a sibling): a test table with `ratio_factor: 'vector_group'` and no nameplate field `ligacao_secundaria` of kind `select` with exactly the codes. Returns the test index and the field label (its own; else the label of `ligacao_secundaria` in the base type's definition at `SEED_VERSION`; else the key).
- `types/validate.ts` `validateTypeDraft` :282 -- appends that issue (path `['tests', t]`, part `ensaios`) whether the strict parse passed or not; `publishBlockedText` counts it.
- `types/draft-edit.ts` `updateDraftField` :104 and new `updateDraftFieldRefusal(draft, index, patch)` beside `removeDraftEntryRefusal` :206: refuse a kind change, or options that are no longer exactly the codes, on the valid field while a ratio table reads it; `updateDraftField` ignores a refused kind/options patch (label and unit still apply).
- Web: `type-editor-parts.tsx` `NameplatePanel` :436-460 (check the refusal before `edit`, `showToast(reason)` as the removal does; the `SelectField` and `ChipList` show the unchanged draft after a refusal).
- Server: `apps/api/src/sync/rules.ts` `checkClientOp` :94 -- a client `equipment_type_version` create whose definition has the issue is refused with the same code a strict-schema refusal of a publish gets today (find it in `apps/api/src/sync/apply.ts`).
- `types/test-base-import.ts` `planTestBaseImport` -- unchanged; a test proves a transformer copy passes.

## Tasks & Acceptance

**Execution:**
1. 24.18 kernel, red then green: `types/definition.test.ts` or `types/company-types.test.ts` (`24.18-UNIT`: refusal matrix, `criterionRulesFor`, draft edits), `seed/criteria.test.ts` (text, `nominalBounds`, `compareCriterion` at each bound, one step inside and outside, Ω scaling, the 13,8 case), `relatorio/measurement-evaluation.test.ts` and `reading-evaluation.test.ts` (a company sheet with the rule: within/out, the helper text, a reading above the instrument's limit), `types/validate.test.ts` (sentences).
2. 24.18 web: `type-editor-parts.tsx`, `app.css`, `pt-br.ts`; web unit test of the Critérios row (pick the rule, type 220 and 5, preview text; switch to entre).
3. 24.18 contract and api: `contract/version.ts`, `contract.test.ts`, the skew test; `apps/api/src/sync/*.integration.test.ts` `24.18-API-001` (a version with the rule published through the sync route; a malformed one refused).
4. 24.19 kernel: `relatorio/tree.test.ts` or `types/company-types.test.ts` (`24.19-UNIT`: no copy, one, two, retired, draft never published, copy of a copy, copy of a library type, base not shipped), `relatorio/panel.test.ts` (one copy, two copies), `types/list.test.ts` (hidden line).
5. 24.19 web: both palettes, `panel-capture.tsx`, `type-list.tsx`, `pt-br.ts`; web unit tests of both palettes and the type list's line.
6. 24.20 kernel: `24.20-UNIT` over the three causes and the two clean cases, the refusal of kind and options (label and unit pass), `planTestBaseImport` unchanged; `24.20-API-001` the publish refused through the sync route; web unit of the toast refusal.
7. E2e: new `e2e/nominal-tolerance.spec.ts` (`24.18-E2E-001 @p0`: editor, publish, a sheet of the type in a relatório with one reading inside and one outside, the helper, concluding, the generated PDF's text holds `220 V ±5 %` under ACEITÁVEL; at 390 px the editor's Critérios tab does not scroll sideways); new `e2e/copied-type-hides-original.spec.ts` (`24.19-E2E-001 @p0`: duplicate the transformer, publish, the field palette shows the copy in the transformer's place and not the transformer, add the copy and assert the outbox/store block type, retire, the palette again; `24.19-E2E-002`: the composer's palette, and a relatório that already held the original opens and duplicates it); `e2e/type-editor.spec.ts` gains `24.20-E2E-001 @p0` (the refusal toast, a draft seeded broken shows the issue and disabled "Publicar", removing the ratio test publishes). Put a new spec in a lane of `e2e/support/groups.ts` only if it shares the document queue (the PDF one does: queue lane).
8. Records: `_bmad-output/specs/spec-fasor/source-deltas.md` row :184 "(planned, Stories 24.18 and 24.19)" struck and replaced with the built record, dated 2026-11-11; `deferred-work.md` a section "Deferred from: Epic 24 batch e24c (2026-11-11)" plus the e23z rows closed (the "can publish with no plate field" row and the narrowing's "Item 4" line) and row 3418's "this story" note, in the file's style (strike, dated state); `docs/kbs/log.md` a line; the KB concepts that describe company types or the palette (`grep -rln "paletteTypeGroups\|company type\|libraryNote" docs/kbs`). Do not edit `sprint-status.yaml` (the orchestrator does).

**Acceptance Criteria:** the ACs of Stories 24.18, 24.19 and 24.20 in `epics.md`, each as written, with the matrix above as their edge cases. In addition:
- Given the baseline's goldens and fixtures, when the batch is done, then `git diff 1c63235e --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows no M or D.
- Given a fresh device syncing a company that holds a version published broken before this batch (fixture by direct op log, not through the push route), when it pulls, then the version row materializes and its sheet opens (the D3 guard; a kernel test over `materializeEntity` is enough).

## Design Notes

- **D1, the operator.** Stored as `operator: 'nominal_pct'` with `value` (the nominal, the row's unit) and `tolerance_pct` (percent, above zero); `type` stays `criterionTypeOf`'s default (`deviation_between`, as `between`). The reader's shape (`asBlockDefinition`) is a `between` with the computed bounds and a `text`, so it is "judged by the code that judges between, over those two bounds" with no reader touched. `compareCriterion` and `formatCriterionValue` also accept the stored shape, for the editor's preview and any direct caller.
- **D2, the printed form.** How a tolerance prints is Bruno's open item B-9. Until he answers it follows what the product prints today for the ratio deviation, `±0,5 %` (sign glued to the number, a space before `%`): `220 V ±5 %`. The story and the mock wrote `220 V ± 5 %`; this is the launch prompt's rule, listed in the PR.
- **D3, where the 24.20 rule lives.** A fresh device folds every pulled `equipment_type_version` create through `applyOp`, whose `assertVersionCreate` runs the strict schema, and "a pulled op the fold refuses still throws" (`ops/materialize.ts`). A version already published in the broken state (possible before e23z, row 3441) would then stop a fresh device's sync. So the rule is a publish rule outside the strict schema: the editor's `validateTypeDraft` shows it and the server's push route refuses the create (`checkClientOp`); an older build cannot publish it either, since the contract bump refuses that build. This narrows the story's "the strict schema refuses the same draft on the server" to "the server refuses the publish", with the same effect for every new publish.
- **D4, the mark and the hidden line.** The palette row of a company type reads "Tipo da empresa · " before its meta (the mock's `pi-meta` of `40-relatorio-overview.html` `#lo-type-tr`), wherever it stands. The type list's hidden library type gets a second `rr-secondary` line (existing component, no new style), text below.
- **D5, readings kept as written.** Coordinator's readings built as written: the nominal is typed in the criterion, both ends within (24.18); the original is hidden in the composer's palette too, and the copy takes the original's place (24.19).

## Authored sentences

Every one marked `// authored (e24c, listed for Bruno)` in place, final wording recorded here by the implementer:
- Rule word `nominal ± %`; labels `Valor nominal`, `Tolerância (%)`; the rules line with `nominal ± %` after `entre`.
- Issues: a nominal row with no tolerance or one at zero or below; a tolerance on another rule; a nominal row with no nominal; `nominal ± %` on the ratio deviation.
- The hidden line, one copy and several (for example `Oculto nas paletas: a cópia Transformador de força (cópia) está publicada.`).
- `libraryNote`, new text.
- The 24.20 issue (names the field's label, the two ways out: remove the ratio test, or start again with "Duplicar") and its publish-bar summary; the 24.20 refusal toast.

Final wording, as built (2026-11-11, implementer):
- Rule word `nominal ± %`; the criterion text `220 V ±5 %` (B-9); inputs `Valor nominal`, `Tolerância (%)` (accessible names `Valor nominal de {critério}`, `Tolerância (%) de {critério}`); the rules line `Regras: maior que · menor que · maior ou igual a · menor ou igual a · entre · nominal ± % · ± · aprovado ou reprovado.`
- Issues: `{critério}: informe a tolerância (%).` (summary `{critério} sem tolerância`); `{critério}: a tolerância (%) precisa ser maior que zero.` (`{critério} com tolerância zero ou negativa`); `{critério}: só a regra "nominal ± %" tem tolerância.` (`{critério} com tolerância`); `{critério}: informe o valor nominal.` (`{critério} sem valor nominal`); `{critério}: a regra "nominal ± %" julga uma leitura, não o desvio da relação de transformação; escolha outra regra.` (`{critério} com regra nominal ± %`).
- The palette mark `Tipo da empresa · {meta}`; the hidden line `Oculto nas paletas: a cópia {nome} está publicada.` and `Oculto nas paletas: as cópias {A}, {B} e {C} estão publicadas.`
- `libraryNote`: `Para renomear um tipo da biblioteca, duplique: a cópia leva o nome novo. Enquanto a cópia estiver publicada, o tipo da biblioteca sai das paletas.`
- The 24.20 issue `{ensaio}: a relação de transformação é calculada pelo grupo de ligação do campo {rótulo} da placa, que não está mais na placa como a lista dos grupos. Remova este ensaio, ou comece de novo com "Duplicar".`, summary `Ensaios › {ensaio} sem o campo {rótulo}`; the refusal toast `O campo {rótulo} não pode mudar de tipo nem de opções: a relação de transformação calcula por ele. Remova antes o ensaio.`

## Verification

**Commands (inside the tools container, under the host lock for unit, api and e2e):**
- `pnpm lint` and `pnpm static` -- clean.
- `pnpm test:unit` and `pnpm test:api` -- green.
- `pnpm exec tsx scripts/e2e.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` -- green: the three new or changed specs plus every spec that drives the type editor, Tipos de equipamento, the palettes, a company-type sheet or its print, and every spec asserting the palette's list (`grep -rln` over `e2e/`).
- `git diff 1c63235e --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` -- no M or D.

## Review Triage Log

### 2026-11-11 — Review pass

Layers run: Edge Case Hunter and Verification Gap Reviewer. Skipped: Blind Hunter and Intent Alignment (token economy; the integrated epic review covers them). The diff reviewed is the merged branch against `origin/main` `dee6d567` (code only).

- verdicts: 9 findings — high 0, medium 3, low 5, false 1, maybe-false 0 (VG-other and ECH-1 share one root cause)
- findings:
  - `[medium]` `[patch]` VG-1 "Fotografar equipamento" with a published copy was covered at kernel level only; dropping `typeVersion` on confirm or `definitions` in `relatorio-tree.tsx` would pass every test — added `@p1 24.19-E2E-003` to `e2e/panel-capture.spec.ts` (copy chip pressed, no transformer chip, the "Criar TR-NN · copy" line, the outbox block create `type:<id>` with `config.type_version` 1); green under the lock.
  - `[low]` `[patch]` VG-2 `panelProvenance`'s "Tipo" rule (`proposal.trust !== null`) untested for a copy — the one-copy case of `copied-type-hides.test.ts` now asserts "frente do painel".
  - `[low]` `[patch]` VG-3 the Ensaios tab's `.cell-crit` of a nominal row untested — a `TestsPanel` case in `company-types-e24c.test.tsx` asserts "220 V ±5 %".
  - `[medium]` `[defer]` VG-other in the template composer a hidden library type leaves the palette and with it the only "Editar padrões" entry of a template that places it; quantities stay editable through the skeleton grid — a product choice tied to the coordinator's reading on the composer's palette; ledger row in the e24c section, owner Matheus.
  - `[low]` `[reject]` ECH-2 a tolerance of 100 % or more, or a nominal of 0, gives a range crossing or touching zero — the story asks only "a tolerance above zero"; an office typing 150 % is not everyday use, and a guard adds a rule nobody decided.
  - `[low]` `[reject]` ECH-3 a nominal so large that `value × (1 + t/100)` overflows to Infinity — a voltage or resistance near 1e308 is not reachable in practice; adding a finite check is a guard for an undemonstrated state.
  - `[low]` `[reject]` ECH-4 the Placa refusal is checked against the render-time draft, so two edits inside one render could drop a change without a toast — the same pattern as the e23z removal refusal (`rowMenu`), a single human tap per render; moving a toast into a state updater would be a side effect inside it.
  - `[false]` ECH-5 the "Tipo da empresa" rule lives in the web — the kernel decides which row is a company type (`PaletteItem.company`, `isCompanyBlockType`); the web only places the static word from `pt-br.ts`, the AGENTS.md home of static copy.
  - `[medium]` `[defer]` ECH-1 the same composer "Editar padrões" loss, filed by the edge-case layer — grouped with VG-other, same ledger row.
