# Integrated review E15-A5 and E16-A6 (main 0fede8ac, 2026-11-03, read-only)

Method: Blind Hunter = bmad-review adversarial lens, one blind subagent per range; intent alignment by hand against
epics.md Stories 15.2-15.6 and 16.1-16.4 (bmad-review has no intent lens). Diffs: 6e5d8aee..be2f46fb (Epic 15),
be2f46fb..541ceb97 (Epic 16). Findings checked against main, deferred-work.md, the Epic 15/16 retros and later commits.

## Epic 15 (E15-A5)
- E15-R1 (ledger row): relatorio-tree-rail.tsx:67 site card aria-label = entryLabel(SITE_CHECKLIST_LABEL [· ncBadge], name)
  replaces the button content, so the "N de M" counter (site.railCounter) and state word are never announced; mock and
  Sumario carry the counter; both trees (also relatorio-tree-sumario.tsx:116) compose the "· ncBadge" in apps/web against
  Story 15.2's "every text composed in packages/domain". Fix: kernel site node exposes one accessibleName used by both.
- E15-R2 (ledger row): block-palette.tsx:88 target paragraph is aria-live mounted with the dialog (usually not announced);
  drawer named only "Blocos" (:265-272) since 15.5. Fix: aria-describedby={reasonId} on PaletteDrawer's DialogShell.
- E15-R3 (accepted): block-palette.tsx:181-195 useMoreBelowCue misses reflow without mutation (late font); cosmetic.
- Intent: nothing new beyond E15-R1; deviations already recorded (TC 13 fields, no dry chip, 62,90, BT fallback, NC sum,
  idempotent coluna button; R15-4, R15-12 closed by 17.5).

## Epic 16 (E16-A6)
- acceptsNotApplicable opt-in (PR #183): holds (guard refined by fx17r 2c0748a0; one guarded caller; readers state-first).
- Photo viewer (PR #181): moot since 17.4 (0bdd925a).
- E16-R1 (fix now): use-generate.ts:456-458 (reached from :288): banner and row tags are suppressed only while
  phase.kind === 'working'; an `unchanged` answer can set ready with a revision not pulled yet (readyHeld false; :453
  already guards sendable with it), so under "Revisao N pronta" the dialog says "(revisao N-1). Alteracoes desde entao
  geram a revisao N" and tags every row "anterior as alteracoes"; contradicts Story 16.2 AC 3. Unit test misses it
  (job and revision ops in one applyPulled). Fix: gate beforeEdits and beforeEditsBanner on readyHeld + a dialog test.
- E16-R2 (ledger row, product decision Matheus/Bruno): a cabine environment Ler visor display shot (location_id set, no
  block_id, no item_key; read-display.tsx:733 displayEnvTarget) prints nowhere since 16.3 yet holds a photo number
  (photo-order.ts:83-86, :112-113; pinned by section-9.test.ts:1169; 17.4 M5 kept it "not at all"): the AMBIENTE DE
  ENSAIO evidence photo vanishes from the document and the gallery shows a "Foto N" no "Imagem N" carries. Options:
  print it after the cabine's CARACTERISTICAS/AMBIENTE part, or exclude it from numbering and say so in the gallery.
- E16-R3 (accepted): e2e/seed-v7.spec.ts:285 clicks the first numbered tile, not the tracked shot; fails loudly only.
- Intent: 16.1 logo cap subtracts cell margins (docx.ts:69); 16.2 matches except E16-R1; 16.3 superseded by 17.4 except
  E16-R2; 16.4 state-first readers, contract 26 and 426 pinned (sync.integration.test.ts:1640), R16-3 closed by 17.3.

## Dropped
Range 15: 12 of 15 (3 already decided, 3 match mock/convention, 4 refuted by main, 1 unreachable, 1 merged into E15-R1).
Range 16: 13 of 16 (4 superseded by 17.4, 1 already in retro R16-14, 1 fixed by fx17r, 7 refuted or speculative).
