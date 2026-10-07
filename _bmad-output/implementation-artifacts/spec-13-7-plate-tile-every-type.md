---
title: 'Story 13.7: the plate tile on every block type'
type: 'feature'
created: '2026-10-07'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-context.md'
  - '{project-root}/apps/api/src/jobs/reading/fixtures/README.md'
warnings: ['batched', 'oversized']
# batched: Epic 13 batch D (tag e13d) carries Story 13.7 alone; the `batched` warning marks the playbook run (one batch, one PR).
deferred: []
---

<intent-contract>

## Intent

**Problem:** Under `LLM_PROVIDER=fake` / `OCR_PROVIDER=fake` only `transformador_forca` has a default plate fixture, so a plate photographed through the app on any other block type fails permanently at its first attempt ("no fixture for block type ..."; deferred-work E78-Q2, review finding AI-1). Matheus answered E8-A3 on 2026-10-07: all eight block types carry "Fotografar placa".

**Approach:** Give the plate reading kind one synthetic default fixture per block type that has a Placa step (a synthetic PNG plate drawn from that type's seed nameplate definition plus its replay JSON), registered in the plate kind's `fakeDefaults`; prove it with api tests per type and one parametrized `@p1` e2e over the eight types through the real job. The web tile gating is already type-agnostic (verified below) and stays as it is.

## Boundaries & Constraints

**Always:**
- Fixtures are SYNTHETIC: images drawn from an inline SVG with sharp, values invented from the field definitions of `packages/domain/src/seed/v1.ts` (addendum §9 shapes). Never material from `docs/context/` or `docs/media/`; manufacturer names are invented words, not real brands.
- Each fixture is named after the sha256 of its committed image in `apps/api/src/jobs/reading/fixtures/images/` (the existing `fake.test.ts` check enforces it).
- Images are 1200 x 900 PNG (the panel precedent: the print variant keeps that size, so the photo's own fixture also replays without scaling).
- Every structured value is valid for its field kind (select values from the field's options, numbers as `{raw, unit, state: 'measured'}` with the field's unit, dates `YYYY-MM`, voltage_class as the panel/chave precedent `"15 kV"` style) and cites OCR tokens holding all its digits, so trust comes out of the unchanged kernel rules (`buildReadingSuggestions`).
- Trust rules, the plate handler (`kinds/plate.ts` `prepare`/`run`), `buildReadingSuggestions` and the transformer fixture `a1eac910...json` stay unchanged.
- The tap-budget specs (`tap-budget.spec.ts`, `tap-budget-signal.spec.ts`, `journey-taps.spec.ts`) are not edited and their budgets do not change.
- English code, comments and docs; no emoji.

**Never:**
- No edit to `camera-view.tsx`, `use-photo-capture.ts`, `photo-encode.ts`, `capture-rescue.ts`, `ficha-fields.tsx`, `number-input.tsx`, `date-field.tsx` (other batches in flight). `plate-photo.tsx` and `nameplate-section.tsx` need no change; if one turns out necessary keep the `FailedReading` / `ReadingWaitLine` imports.
- No Placa step, nameplate fields or tile for `cabos_entrada` / `cabos_saida`: their seed nameplate is empty and addendum §9 line 190 says "none — the sheet opens at the checklist" (see Design Notes, open question OQ-1).
- No new op family, no contract change, no `CONTRACT_VERSION` bump, no domain change.
- No edit to `epics.md` or `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plate on a nameplate type | device re-encoded photo (no own fixture), target block of type T in {para_raio, chave_seccionadora, disjuntor_mt, tp, tc, transformador_forca} | `defaultFixtureFor({plate, T, null})` returns T's fixture; OCR boxes scaled to the image; job `done`; one pending suggestion per fixture value on `sheet/{block}/nameplate/{key}` | none |
| Committed image itself | photo bytes = the committed PNG of T | its own fixture replays unscaled (1200 x 900) | none |
| Cable type | plate job for a `cabos_entrada` block (not reachable from the UI) | no default fits: permanent failure "no fixture for block type cabos_entrada" at attempt 1 | `PermanentReadingError`, as today |
| Unknown voltage class | fixture voltage value absent from the company registry | that suggestion is `verify` (8.5 rule, unchanged) | none |

</intent-contract>

## Code Map

- `apps/api/src/jobs/reading/kinds/plate.ts:54` -- `fakeDefaults`: today one entry (`transformador_forca`, `a1eac910...`). Add one `{ block_type, sha256 }` per new type; update the E78-Q2 comment.
- `apps/api/src/jobs/reading/kinds/index.ts:30` -- `FAKE_FIXTURE_DEFAULTS` flattens every kind's `fakeDefaults`; read only.
- `apps/api/src/jobs/reading/providers/fake.ts` -- `DEFAULT_FIXTURE_BY_BLOCK_TYPE`, `defaultFixtureFor`, `resolveFakeFixture`, `scaleOcrRead`. Logic needs no change; update the header comment (lines 27-33: "a plate of any type but `transformador_forca`" becomes "a plate of a type with no nameplate", i.e. the cables).
- `apps/api/src/jobs/reading/fixtures/` -- the replay JSONs (`<sha256>.json`) and `images/`; shape per `README.md` "Format" and the panel fixture `36f3fca9...json` (1200 x 900, tokens `t0..`, confidence 0.99, `preprocessing_applied: false`).
- `apps/api/src/jobs/reading/fixtures/README.md` -- "A photo with no fixture of its own (E78-Q2)" bullets and the kind table: rewrite for six plate defaults; add a section per new synthetic plate (image, size, token count, the values table with expected trust) and how the images were made.
- `packages/domain/src/seed/v1.ts:51-108,501-581` -- nameplate `FieldDef`s per type (keys, kinds, units, select options). Read only.
- `packages/domain/src/reading/build.ts` -- `buildReadingSuggestions` (digit coverage, registries, boxes). Read only; it decides each value's trust.
- `apps/api/src/jobs/reading/providers/fake.test.ts:52,109-140` -- sha naming check; E78-Q2 fallback tests. Line ~134 test "any other block type ... fails" uses type `disjuntor` (not a real type) and stays valid; add per-type default assertions.
- `apps/api/src/jobs/reading/job.integration.test.ts:229-305` -- `beforeAll` copies only the transformer default into the scratch `fixturesDir`; the test at 275 uses `chave_seccionadora` as "a type with no default" and must move to `cabos_entrada` (or `cabos_saida`); the E78-Q2 test at 290 is the pattern for the new per-type test.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx:93,206` -- tile renders when `definition.nameplate.length > 0 && plate === null && !readOnly && aiFeatures`, with `plateReadingTarget(block.id, block.block_type)`: already every type with a nameplate. Read only.
- `e2e/plate-reading.spec.ts` -- the transformer pipeline pattern (`importPlate` through the file chooser with `getUserMedia` rejected, wait for suggestions without a manual sync, read `entities` from IndexedDB).
- `e2e/support/reading-ops.ts:232` -- `openTransformerSheet` (resets Empresa B with the standard template, opens Oxigênio's transformer through the tree). Generalize into an opener by cabine name and type label; keep `openTransformerSheet` as a thin wrapper so its callers do not change.
- `packages/domain/src/seed/template.ts:140-175` -- standard template: Oxigênio holds cabos_entrada, chave_seccionadora, para_raio, cabos_saida, transformador_forca; Cobertura A/B add disjuntor_mt; Geradores (`agrupar_por_tipo: true`) holds disjuntor_mt, tp, tc. Pick, per type, a cabine where the tree shows its row.
- `e2e/support/groups.ts:63-77` -- `SERIAL_SPECS`: reading-pipeline specs run serial; add the new spec with the same "why".

## Tasks & Acceptance

**Execution:**
- `apps/api/src/scripts/make-plate-fixtures.ts` (new) -- a one-off, re-runnable generator run in the tools container: for each of the five new types, one layout table (header with the type label, then one row per field: label token(s) and value token(s) at known x/y and font size) rendered to SVG then PNG with sharp at 1200 x 900, the token bboxes computed from the same layout (inside the image), the structuring values citing their value tokens, written as `fixtures/images/plate-<type>.png` and `fixtures/<sha256>.json`; prints the shas. Values cover every nameplate key of the type except `tag` and `vol_oleo`. -- reproducible fixtures, boxes not placed by hand.
- `apps/api/src/jobs/reading/fixtures/images/plate-{para-raio,chave-seccionadora,disjuntor-mt,tp,tc}.png` + five `<sha256>.json` -- generated, committed.
- `apps/api/src/jobs/reading/kinds/plate.ts` -- five new `fakeDefaults` entries with a comment naming each image. -- the fallback by block type.
- `apps/api/src/jobs/reading/providers/fake.ts` -- header comment only. -- docs follow behavior.
- `apps/api/src/jobs/reading/fixtures/README.md` -- per-type sections and table rows; how the generator is run. -- the fixture contract.
- `apps/api/src/jobs/reading/providers/fake.test.ts` -- assert `DEFAULT_FIXTURE_BY_BLOCK_TYPE` has exactly the six nameplate types (derived from the seed: every `EQUIPMENT_BLOCK_TYPES` member whose `getDefinition(...).nameplate` is non-empty) and no cable type; for each, the scaled replay keeps token texts and every box inside the image; each fixture's structured keys are nameplate keys of its type and each value's digits occur in its cited tokens.
- `apps/api/src/jobs/reading/job.integration.test.ts` -- copy every plate default into the scratch dir; move the "no default" test to a cable block; add a parametrized test over the five new types (re-encoded resized JPEG of the committed PNG, job `done`, one pending suggestion per fixture value, run row `ocr_provider: fake, model: fake`).
- `e2e/support/reading-ops.ts` -- `openSheetOfType(page, account, database, { cabine, typeLabel, width?, signIn? })`; `openTransformerSheet` delegates to it.
- `e2e/plate-every-type.spec.ts` (new) -- one `@p1` test parametrized over the eight `EQUIPMENT_BLOCK_TYPES` (`for` loop generating eight tests, title naming the type): for the six nameplate types, open the sheet through the tree, tap "Fotografar placa", import that type's synthetic PNG through the file chooser, then wait (no manual sync) for the first fixture field's `.suggestion-field` to show its value; assert from IndexedDB the photo's create op carries `reading_target.block_type` = the type, `reading_status` `done`, and the pending suggestion count from the photo equals that fixture's value count. For the two cable types assert the sheet has no `#ficha-nameplate` and no "Fotografar placa" button. -- E8-A6 pipeline proof per type.
- `e2e/support/groups.ts` -- add `plate-every-type.spec.ts` to `SERIAL_SPECS` (reading queue reason).

**Acceptance Criteria:**
- Given AI features on and a sheet of para_raio, chave_seccionadora, disjuntor_mt, tp, tc or transformador_forca, when its Placa step renders, then "Fotografar placa" shows, and the photo's `reading_target.block_type` is that type.
- Given the `fake` providers and a plate imported through the tile on any of those six types, when the real job runs, then the photo ends `done` and the sheet shows that type's suggestions without "Sincronizar agora", each on a nameplate key of that type.
- Given a cabos_entrada or cabos_saida sheet, when it renders, then no Placa step and no "Fotografar placa" appear (unchanged).
- Given the tap-budget specs, when they run, then they pass unedited.
- Given `pnpm test:api` (it holds `fake.test.ts` and `job.integration.test.ts`), when it runs, then the new fake and job tests pass and the existing transformer fixture tests pass unchanged.

## Design Notes

OQ-1 (open question, conservative reading kept): Matheus's E8-A3 answer says all eight types carry the tile, while the story asks for it "on every block type that has a plate" and the AC triggers "when a sheet's Placa step renders". The two cable types have no nameplate in the seed and no Placa step in FO.SERV-03 (addendum §9 line 190). This batch therefore enables the six plate types, covers all eight in the parametrized e2e (six read, two assert no Placa step), and lists OQ-1 in the PR body; giving cables a Placa step would be a seed change outside this story.

The web needs no change: the tile has no type gate (`nameplate-section.tsx:206`), and the job reads any type's nameplate definition (`kinds/plate.ts` `prepare`). AI-1's "only on the transformer" was the fixture failing at once on other types.

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx apps/api/src/scripts/make-plate-fixtures.ts` -- expected: five PNGs and five JSONs written, shas printed.
- `podman compose --profile tools run --rm --user root tools pnpm --filter @app/api exec vitest run src/jobs/reading` -- expected: green (fake.test.ts and job.integration.test.ts run in the api project, against the compose Postgres and MinIO; `podman compose up -d` first).
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/plate-every-type.spec.ts e2e/plate-reading.spec.ts --project desktop-chrome` -- expected: all pass.
