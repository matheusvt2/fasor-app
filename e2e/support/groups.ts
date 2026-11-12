/**
 * E6-Q7: the groups the e2e suite runs in. `scripts/e2e.ts` (behind `test:e2e`,
 * `test:e2e:full` and `test:e2e:matrix`) runs them as Playwright runs one after the other,
 * so no serial spec ever runs beside a parallel worker; all always run and the command fails
 * when any failed.
 *
 * The parallel group runs on `PARALLEL_WORKERS` workers, each on its own pair of
 * companies (`apps/api/src/db/e2e-worker-seed.ts`). The specs below share something no
 * per-worker pair can separate; each entry says why, and names its lane:
 * - `queue`: the specs that issue or preview a document (the one pg-boss queue and the one
 *   LibreOffice of the api, AD-15), wait on the one reading queue and worker, or hold the
 *   generate request at the network. They run after the parallel group on `QUEUE_WORKERS`
 *   workers, test by test; each worker keeps its own pair and its own copy of the small
 *   Porto Seguro fixture (`smallFixtureCopy`), and the queue orders the jobs while the UI work
 *   overlaps.
 * - `solo`: the specs that time a tap or a wait against a render, or measure the layout under
 *   a quiet CPU. They run last, on one worker, with nothing beside them.
 *
 * Chore T3 (2026-11-09, sprint-change-proposal-2026-11-04 § 4.4): the serial group, which ran
 * on one worker, became the two lanes. Measured on the wave 3 gate (main
 * ef099d41, `test:e2e:full`): the serial group ran 187 tests in 30.6 min on one worker, of
 * which only 5.9 min was generation job time; the 145 tests now in `queue` summed 24.9 min and
 * the 42 in `solo` 5.2 min. A longest-first schedule of `queue` on two workers gives 12.5 to
 * 16.2 min.
 */
/** The serial lanes: `queue` on `QUEUE_WORKERS` workers, then `solo` on one. */
export type SerialLane = 'queue' | 'solo';

export const SERIAL_SPECS: readonly { file: string; lane: SerialLane; why: string }[] = [
  // Batch e23t (2026-11-09, Stories 23.15 to 23.17 and 23.19): each issues a revision to read its DOCX tables.
  { file: 'winding-resistance.spec.ts', lane: 'queue', why: 'Story 23.15: issues a revision through the shared queue and LibreOffice to read the winding table of the DOCX' },
  { file: 'polarization-index.spec.ts', lane: 'queue', why: 'Story 23.16: issues a revision through the shared queue and LibreOffice to read the IP column of the DOCX' },
  { file: 'oil-liquid-sampling.spec.ts', lane: 'queue', why: 'Story 23.17: issues a revision through the shared queue and LibreOffice to read the liquid fields and the absent sampling of the DOCX' },
  { file: 'header-test-voltage.spec.ts', lane: 'queue', why: 'Story 25.11: issues a revision through the shared queue and LibreOffice to read the TENSÃO ENSAIO of the DOCX' },
  { file: 'warnings-before-generating.spec.ts', lane: 'queue', why: 'Story 25.12: issues a revision through the shared queue and LibreOffice to check the sheets of a removed local are absent from the DOCX' },
  { file: 'fuse-resistance.spec.ts', lane: 'queue', why: 'Story 23.19: issues a revision through the shared queue and LibreOffice to check the not-applicable fuse test is absent from the DOCX' },
  // Batch e23e (2026-11-09, Stories 23.13, 23.18, 23.20 and 23.21): each issues a revision to read its DOCX.
  { file: 'voltage-defaults.spec.ts', lane: 'queue', why: 'Story 23.13: issues a revision through the shared queue and LibreOffice to read the TENSÃO column of the DOCX' },
  { file: 'tc-polarity.spec.ts', lane: 'queue', why: 'Story 23.18: issues revisions through the shared queue and LibreOffice to read POLARIDADE, CONDIÇÕES and the note of the DOCX' },
  { file: 'thermography.spec.ts', lane: 'queue', why: 'Story 23.20: issues a revision through the shared queue and LibreOffice to read the thermography tables and the thermal photo line of the DOCX' },
  { file: 'ground-grid.spec.ts', lane: 'queue', why: 'Story 23.21: issues a revision through the shared queue and LibreOffice to read where the Malha de aterramento prints in the DOCX' },
  // Fix batch e23z (W3-3): e23z-E2E-004 issues a revision to read where the imported copies print in section 9.
  { file: 'test-base-import.spec.ts', lane: 'queue', why: 'Fix batch e23z (W3-3): issues a revision through the shared queue and LibreOffice to read the section 9 groups the imported copies print in' },
  {
    file: 'document-pages.spec.ts',
    lane: 'queue',
    why: 'Stories 20.3, 20.5 and 20.6: issues a revision through the shared queue and LibreOffice to read where each ficha, table and photo lands on the PDF pages',
  },
  {
    file: 'export.spec.ts',
    lane: 'queue',
    why:
      'generates documents through the one pg-boss queue and the one LibreOffice of the api, and loads its worker\'s own copy of the small Porto Seguro fixture (ids derived from the company since chore T3, 2026-11-09)',
  },
  {
    file: 'parecer-export.spec.ts',
    lane: 'queue',
    why: 'issues and previews documents through the shared queue and LibreOffice, and loads its worker\'s copy of the Porto Seguro fixture',
  },
  {
    file: 'export-visual.spec.ts',
    lane: 'queue',
    why: 'loads its worker\'s copy of the Porto Seguro fixture and generates a revision through the shared queue and LibreOffice',
  },
  {
    file: 'rich-text-print.spec.ts',
    lane: 'queue',
    why: 'Story 11.4: issues a revision of a relatório made from a formatted template through the shared queue and LibreOffice',
  },
  {
    file: 'photo-numbers.spec.ts',
    lane: 'queue',
    why: 'loads its worker\'s copy of the Porto Seguro fixture and generates revisions through the shared queue and LibreOffice, whose certificate rasterization shares the one soffice chain',
  },
  // Matheus, 2026-09-30 (Epic 11 fix batch): the waiting labels.
  {
    file: 'loading-states.spec.ts',
    lane: 'queue',
    why: 'presses "Gerar relatório" and holds its generate request at the network (answered 503 there, so no job runs), which the generate guard counts as a document spec',
  },
  // Review fixes 2026-10-06, batch 2: F-03 and F-05 issue revisions, F-05 on the fixture.
  {
    file: 'review-field-defects-2.spec.ts',
    lane: 'queue',
    why: 'issues revisions through the shared queue and LibreOffice (F-03, F-05) and loads its worker\'s copy of the Porto Seguro fixture (F-05)',
  },
  // Chore T2 (2026-11-04, sprint-change-proposal-2026-11-04 § 4.1): review-layout-copy-3 left this list.
  // It measures boxes at fixed viewports and times no tap, and its 16 tests ran green 5 of 5
  // (`--repeat-each 5`, 80 runs) in the parallel group on two workers under the host lock.
  // Review fixes 2026-10-08, batch r8lay: tables, dialogs, bars and tree rows measured against the renders.
  {
    file: 'review-layout-interaction-2026-10-08.spec.ts',
    lane: 'solo',
    why: 'measures the layout of what the page renders (table inputs and scrollers, dialogs, the Sticky action bar, tree rows, hit points under inputs) at fixed viewports, so it must not share the CPU with other workers. Chore T2 (2026-11-04) tried it in the parallel group on two workers with `--repeat-each 5`: R8LAY-E2E-008 failed once (repeat 4 of 5, the "Novo relatório" dialog not open 5 s after its click), the other 74 runs green, so it stays',
  },
  // Status flow 2026-10-10: SF-E2E-002 generates a revision on the fixture.
  {
    file: 'status-flow-2026-10-10.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice and loads its worker\'s copy of the Porto Seguro fixture',
  },
  // Story 22.5: 22.5-E2E-001 generates the DOCX its derived section 8 entries are read from.
  // Fix batch e24h: ~~the derived entries~~ the stored points only, and no automatic entry, are read from it.
  {
    file: 'points-derived.spec.ts',
    lane: 'queue',
    why: 'Story 22.5 (fix batch e24h): generates a revision through the shared queue and LibreOffice to read section 8 of the DOCX, stored points only',
  },
  // Fix batch e24h, H9 (2026-11-10): e24h-H9-E2E-001 previews the draft PDF to read a ficha's conclusion marks.
  {
    file: 'observation-free.spec.ts',
    lane: 'queue',
    why: 'Fix batch e24h (H9): previews the draft PDF through the shared queue and LibreOffice to read a ficha\'s CONCLUSÃO marks',
  },
  // Batch e24c (Story 24.18): 24.18-E2E-001 previews the draft PDF to read a "nominal ± %" criterion.
  {
    file: 'nominal-tolerance.spec.ts',
    lane: 'queue',
    why: 'Story 24.18 (batch e24c): previews the draft PDF through the shared queue and LibreOffice to read the criterion "220 V ±5 %"',
  },
  // Fix batch e24h (2026-11-10): e24h-E2E-001 previews the draft PDF twice to read section 8.
  {
    file: 'points-on-click.spec.ts',
    lane: 'queue',
    why: 'Fix batch e24h: previews the draft PDF through the shared queue and LibreOffice to read section 8 before and after a point is created',
  },
  // Stories 11.9/11.10: 11.10-E2E-001 generates the DOCX its action-plan table is read from.
  {
    file: 'action-plan.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read section 8\'s action-plan table from the DOCX',
  },
  // Story 14.2: 14.2-E2E-001 generates the DOCX its painel band is read from.
  {
    file: 'local-painel-coluna.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read the painel band and the order of section 9 from the DOCX',
  },
  // Stories 14.3/14.4: 14.3-E2E-001 and 14.3-E2E-002 generate the DOCX the site table is read from.
  {
    file: 'verificacoes-local.spec.ts',
    lane: 'queue',
    why: 'generates revisions through the shared queue and LibreOffice to read VERIFICAÇÕES DO LOCAL, the site photo and the site point from the DOCX',
  },
  // Story 14.5: 14.5-E2E-001 generates the DOCX its "Outros equipamentos" group and CTA tables are read from.
  {
    file: 'cta.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read the Chave de transferência automática under "Outros equipamentos" in section 9 of the DOCX',
  },
  // Story 14.8: 14.8-E2E-001 generates the DOCX its company type is read from under "Outros equipamentos".
  {
    file: 'company-type.durability.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read a company equipment type under "Outros equipamentos" in section 9 of the DOCX',
  },
  // Story 14.9: 14.9-E2E-001 generates the DOCX its "Outros equipamentos" group and QGBT tables are read from.
  {
    file: 'qgbt.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read the Quadro elétrico (QGBT/QD) under "Outros equipamentos" in section 9 of the DOCX',
  },
  // Stories 15.3 and 15.6: 15.3-E2E-002 generates the DOCX its two new site items are read from.
  {
    file: 'seed-v9.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read the two seed v9 site items in VERIFICAÇÕES DO LOCAL of the DOCX',
  },
  // Story 15.7: 15.7-E2E-002 generates the DOCX the TC's seven seed v10 items are read from.
  {
    file: 'seed-v10.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read the TC\'s seven seed v10 items in VERIFICAÇÕES GERAIS of the DOCX',
  },
  // Story 21.1: 21.1-E2E-002 generates revision 1 of a v10 relatório before its vector group is edited.
  {
    file: 'seed-v11.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice before a v10 transformer\'s vector group is edited, to read the Export dialog\'s banner',
  },
  // Stories 22.7 to 22.9: 22.8/22.9-E2E-002 generates the DOCX the TENSÃO column, the class criterion and the defect justification are read from.
  {
    file: 'seed-v12.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read the seed v12 TENSÃO (kV) column, ACEITÁVEL by accuracy class and the defect reason in the DOCX',
  },
  // Story 24.2: 24.2-E2E-001 generates the DOCX of a v14 relatório and of a v13 one beside it.
  {
    file: 'seed-v14.spec.ts',
    lane: 'queue',
    why: 'generates two revisions through the shared queue and LibreOffice, a v14 relatório\'s and a v13 one\'s, to read their filled sheets in the DOCX',
  },
  // Story 25.5 (batch e25c): 25.5-E2E-001 generates the DOCX of a new v15 relatório and of a v14 one beside it.
  {
    file: 'seed-v15.spec.ts',
    lane: 'queue',
    why: 'generates two revisions through the shared queue and LibreOffice, a v15 relatório\'s and a v14 one\'s, to read their filled sheets in the DOCX',
  },
  // Stories 24.3 and 24.4 (batch e24a): every test issues a revision (and one previews a draft) to read the CONCLUSÃO boxes and section 10.
  {
    file: 'conclusion-v14.spec.ts',
    lane: 'queue',
    why: 'issues revisions (and previews a draft) through the shared queue and LibreOffice to read the CONCLUSÃO boxes and the Parecer box of the DOCX',
  },
  {
    file: 'parecer-names-finding.spec.ts',
    lane: 'queue',
    why: 'issues revisions through the shared queue and LibreOffice to read section 10\'s summary, its bullets and section 9\'s conclusion in the DOCX',
  },
  // Batch e24s (Stories 24.10 to 24.12): each issues a revision to read its v14 sheets in the DOCX.
  {
    file: 'seed-v14-tp-tc.spec.ts',
    lane: 'queue',
    why: 'issues a revision through the shared queue and LibreOffice to read the v14 TP\'s seven rows and the v14 TC\'s six in the DOCX',
  },
  {
    file: 'seed-v14-transformer.spec.ts',
    lane: 'queue',
    why: 'issues a revision through the shared queue and LibreOffice to read a v14 oil and a dry transformer\'s 17 rows in the DOCX',
  },
  {
    file: 'no-break.spec.ts',
    lane: 'queue',
    why: 'reads a plate on the one reading queue and worker and issues a revision through the shared queue and LibreOffice to read the No-break de comando in the DOCX',
  },
  {
    file: 'seed-v14-sheet-fixes.spec.ts',
    lane: 'queue',
    why: 'issues revisions through the shared queue and LibreOffice to read the oil sampling\'s reason line and the v14 Malha de aterramento in the DOCX',
  },
  {
    file: 'seed-v14-qgbt-inspecao.spec.ts',
    lane: 'queue',
    why: 'issues a revision through the shared queue and LibreOffice to read the v14 Inspeção de QGBT\'s twelve rows and its thermography in the DOCX',
  },
  // Story 22.11: 22.11-E2E-001 generates the DOCX the Inspeção de QGBT is read from.
  {
    file: 'qgbt-inspecao.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read the Inspeção de QGBT under "Outros equipamentos" in section 9 of the DOCX',
  },
  // Test-speed batch (2026-09-27): the specs that time a tap against a render (`humanTap`,
  // `touchPressAcross`, `tapCounter` in `taps.ts`). They measure the device, and the device
  // is the one thing the per-worker pairs cannot separate: beside two other browsers the
  // CPU they share delays a commit's render past the windows these tests hold a finger for
  // (12.1-E2E-007 lost its tap in 1 of 5 repeats on both 2 and 3 workers). Alone on one
  // worker they measure the app, not the machine's load.
  ...['lost-taps.durability.spec.ts', 'journeys-12-3-12-4.spec.ts', 'journey-taps.spec.ts', 'journey-forward.spec.ts', 'tap-budget.spec.ts', 'ficha.durability.spec.ts', 'commit-to-render.perf.spec.ts', 'keyboard-salvo.durability.spec.ts'].map((file) => ({
    file,
    lane: 'solo' as const,
    why: 'times a tap against a render with the finger held for fixed windows, so it must not share the CPU with other workers',
  })),
  // Story 9.1: "Ler visor" through the real reading job.
  {
    file: 'read-display-pipeline.spec.ts',
    lane: 'queue',
    why: 'uploads display photos that the api reads on its one reading queue and worker, waiting for each job to land on the device',
  },
  // Stories 9.3 and 9.5: the vision caption and the NC draft through the real reading job.
  {
    file: 'prose-reading-pipeline.spec.ts',
    lane: 'queue',
    why: 'uploads photos that the api reads on its one reading queue and worker, waiting for each job to land on the device',
  },
  // Story 9.2: "Fotografar equipamento" through the real reading job.
  {
    file: 'panel-capture-pipeline.spec.ts',
    lane: 'queue',
    why: 'uploads a panel photo the api reads on its one reading queue and worker, then waits for the plate reading its re-target queued',
  },
  // Story 13.8: the emission audit; 13.8-E2E-002 issues a revision with findings present.
  {
    file: 'emission-audit.spec.ts',
    lane: 'queue',
    why: 'issues a revision through the shared queue and LibreOffice (13.8-E2E-002) and waits on the audit job of the one api worker',
  },
  // Story 13.7: "Fotografar placa" on every block type through the real reading job.
  {
    file: 'plate-every-type.spec.ts',
    lane: 'queue',
    why: 'uploads one plate photo per block type that the api reads on its one reading queue and worker, waiting for each job to land on the device',
  },
  {
    file: 'tap-budget-signal.spec.ts',
    lane: 'solo',
    why: 'times every tap of the SM-3 walk against a render and waits on nine readings of the one reading queue and worker',
  },
  // Story 14.10 lane B (14.10-E2E-003): the focus is sampled in the page every 50 ms for a fixed 6 s and the test
  // asserts more than 50 samples. Fix batch e24z: in the parallel group of the e24 integrated gate (7773aafa) the
  // page's timers, starved by the renders beside it, took 17 samples in those 6 s; alone it passes.
  {
    file: 'plate-shot-fallback.spec.ts',
    lane: 'solo',
    why: 'samples the focus every 50 ms for a fixed window while the plate row renders, and counts the samples, so it must not share the CPU with other workers',
  },
  // Story 16.3: display shots out of section 7 and the numbering, checked in a generated DOCX.
  {
    file: 'display-shots.spec.ts',
    lane: 'queue',
    why: 'loads its worker\'s copy of the Porto Seguro fixture and generates a revision through the shared queue and LibreOffice, uploading a display shot the one reading queue and worker read',
  },
  // Story 16.4: "N.A" in a nameplate and a cabine number field, read back from a preview PDF.
  {
    file: 'na-number-field.spec.ts',
    lane: 'queue',
    why: 'loads its worker\'s copy of the Porto Seguro fixture and renders a preview PDF through the shared queue and LibreOffice',
  },
  // Story 17.1: section 7 holds the "Geral" photos only, read back from the issued DOCX and PDF.
  {
    file: 'section-7-by-hand.spec.ts',
    lane: 'queue',
    why: 'loads its worker\'s copy of the Porto Seguro fixture and generates a revision (DOCX and PDF) through the shared queue and LibreOffice',
  },
  // Story 21.3: photos moved with "Subir" and "Descer", read back from the issued DOCX and PDF.
  {
    file: 'photo-order.spec.ts',
    lane: 'queue',
    why: 'loads its worker\'s copy of the Porto Seguro fixture and generates revisions (DOCX and PDF) through the shared queue and LibreOffice',
  },
  // Story 18.4: 18.4-E2E-002 and -003 time a preview and a generation from the press to the document.
  {
    file: 'usage-events-documents.spec.ts',
    lane: 'solo',
    why: 'previews and issues its worker\'s copy of the Porto Seguro fixture through the shared queue and LibreOffice, and compares the timed waits with the measured tap-to-document intervals, which must not share the CPU with other workers',
  },
  // Stories 20.7 to 20.10 (contract 29): the forged pushes of the security pass, then a preview.
  {
    file: 'security-ops.spec.ts',
    lane: 'queue',
    why: 'renders a preview PDF through the shared queue and LibreOffice after the forged pushes, to prove none of them made the relatório ungeneratable',
  },
  // Story 20.4: 20.4-E2E-005 generates the revision whose section 8 is read for the relinked points.
  {
    file: 'point-relink-print.spec.ts',
    lane: 'queue',
    why: 'generates a revision through the shared queue and LibreOffice to read section 8\'s Local/TAG of three relinked points from the DOCX and the PDF',
  },
  // Story 22.10: 22.10-E2E-001 generates the DOCX its over-range readings are read from.
  {
    file: 'over-range.spec.ts',
    lane: 'queue',
    why: 'Story 22.10: generates a revision through the shared queue and LibreOffice to read the over-range readings ("> 2 TΩ") of section 9 from the DOCX',
  },
  // Batch e23a (Stories 23.2 to 23.4): each spec issues a revision to read section 9's ACEITÁVEL, the per-row column and the note from the DOCX.
  {
    file: 'criteria-tables.spec.ts',
    lane: 'queue',
    why: 'Stories 23.2 and 23.4: generates a revision through the shared queue and LibreOffice to read the per-row ACEITÁVEL, POLARIZAÇÃO N/A and the instrument-limit note of section 9 from the DOCX',
  },
  {
    file: 'manufacturer-value.spec.ts',
    lane: 'queue',
    why: 'Story 23.3: generates a revision through the shared queue and LibreOffice to read the manufacturer value\'s ACEITÁVEL ("<80 µΩ (fabricante)") from the DOCX',
  },
  // Story 22.12: 22.12-E2E-001 issues relatório A and then B of the same obra.
  {
    file: 'previous-visit.spec.ts',
    lane: 'queue',
    why: 'Story 22.12: issues two revisions through the shared queue and LibreOffice (relatório A, whose issue writes last_results, then B of the same obra) to read MANUT. ANTERIOR from the DOCX',
  },
  // Batch e23b: 23.8-E2E-001 and 23.9-E2E-001 read the DOCX of the revisions they issue.
  {
    file: 'ttr-per-tap.spec.ts',
    lane: 'queue',
    why: 'Story 23.8: issues a revision through the shared queue and LibreOffice to read the TTR per tap of section 9 (the plate rows and the one off the plate) from the downloaded DOCX',
  },
  {
    file: 'test-applicability.durability.spec.ts',
    lane: 'queue',
    why: 'Story 23.9: issues two revisions through the shared queue and LibreOffice, one with the test NA by the plate and one with it applied by hand, to read section 9 from the downloaded DOCX',
  },
  // Batch e23v: 23.5-E2E-001 and 23.6-E2E-003 read the DOCX of the revisions they issue.
  {
    file: 'temperature-correction.spec.ts',
    lane: 'queue',
    why: 'Story 23.5: issues a revision through the shared queue and LibreOffice to read TEMPERATURA and the 20 °C column of section 9 from the downloaded DOCX',
  },
  {
    file: 'previous-visit-judges.spec.ts',
    lane: 'queue',
    why: 'Story 23.6: issues two revisions through the shared queue and LibreOffice (relatório A, whose issue writes the corrected last_results, then B of the same obra) to read the 20 °C column, MANUT. ANTERIOR and section 8 from the DOCX',
  },
  // Batch e23h: 23.11-E2E-001 reads the recommendation from section 8 of the DOCX it issues.
  {
    file: 'test-recommendation.spec.ts',
    lane: 'queue',
    why: 'Story 23.11: issues a revision through the shared queue and LibreOffice to read the out reading\'s point, its recommendation first, from section 8 of the downloaded DOCX',
  },
  // Fix batch e23w: B-4 and B-6 read section 9 and section 8 from the DOCX they issue.
  {
    file: 'tp-insulation-table.spec.ts',
    lane: 'queue',
    why: 'Fix batch e23w (B-4): issues a revision through the shared queue and LibreOffice to read the TP\'s Table 100.5 minimum in ACEITÁVEL from the downloaded DOCX',
  },
  {
    file: 'contact-rise.spec.ts',
    lane: 'queue',
    why: 'Fix batch e23w (B-6): issues two revisions through the shared queue and LibreOffice (relatório A, whose issue writes last_results, then B of the same obra) to read the CONCLUSÃO Reprovado and the rise point from the DOCX',
  },
  // Batch e24b (Stories 24.8 and 24.21): each issues revisions to read the TAGs and MANUT. ANTERIOR of the DOCX.
  {
    file: 'tag-suggestion.spec.ts',
    lane: 'queue',
    why: 'Story 24.8: issues revisions through the shared queue and LibreOffice to read the suggested and typed TAGs and MANUT. ANTERIOR of an obra with the old TAGs from the DOCX',
  },
  {
    file: 'equipment-history.spec.ts',
    lane: 'queue',
    why: 'Story 24.21: issues two revisions through the shared queue and LibreOffice (relatório A with a renamed TAG, whose issue writes last_results, then B of the same obra) to read MANUT. ANTERIOR on the renamed sheet from the DOCX',
  },
  // Batch e24b, Part B (Stories 24.5, 24.6, 24.7, 24.9): each renders a draft PDF or issues a revision through the shared queue and LibreOffice.
  {
    file: 'conclusion-preview.spec.ts',
    lane: 'queue',
    why: 'Story 24.5: renders the draft PDF ("Pré-visualizar") through the shared queue and LibreOffice to read that a preview pair prints no conclusion mark',
  },
  {
    file: 'nc-phrase-follows-item.spec.ts',
    lane: 'queue',
    why: 'Story 24.6: renders the draft PDF through the shared queue and LibreOffice to read the removed phrase and the kept text in section 9',
  },
  {
    file: 'point-question.spec.ts',
    lane: 'queue',
    why: 'Story 24.7: issues a revision through the shared queue and LibreOffice to read section 8 of the DOCX after both answers',
  },
  {
    file: 'pass-screen-fixes.spec.ts',
    lane: 'queue',
    why: 'Story 24.9: issues revisions through the shared queue and LibreOffice (a second visit for the contact rise; the grouping by type from the DOCX)',
  },
  // Batch e24p (Stories 24.15 and 24.16): each issues two or more revisions of one obra to read MANUT. ANTERIOR's date and the note lines of the DOCX.
  {
    file: 'previous-visit-date.spec.ts',
    lane: 'queue',
    why: 'Story 24.15: issues revisions of one obra through the shared queue and LibreOffice (the visit kept by its service date, an older visit issued late) to read the dated MANUT. ANTERIOR of the DOCX',
  },
  {
    file: 'previous-visit-note.spec.ts',
    lane: 'queue',
    why: 'Story 24.16: issues two revisions of one obra through the shared queue and LibreOffice (relatório A, whose issue writes last_results, then B) to read the note lines under the tables of the DOCX',
  },
  // Batch e24p (Story 24.17): 24.17-E2E-001 issues a revision to read section 8 of the DOCX.
  {
    file: 'recommendation-action.spec.ts',
    lane: 'queue',
    why: 'Story 24.17: issues a revision through the shared queue and LibreOffice to read the point written from a test in section 8 of the DOCX (its bullet and its action-plan row)',
  },
  // Fix batch e24y (P2, P3): e24y-E2E-001 issues a revision to read the renamed sheet's conclusion in section 9 of the DOCX.
  {
    file: 'e24y-tag-rename.spec.ts',
    lane: 'queue',
    why: 'Fix batch e24y: issues a revision through the shared queue and LibreOffice to read that a sheet renamed after its conclusion prints the paragraph naming the new TAG',
  },
  // Batch e25b (Story 25.4): 25.4-E2E-001 issues two revisions to read their verdicts in the DOCX and on the stored revision rows.
  {
    file: 'revision-verdicts.spec.ts',
    lane: 'queue',
    why: 'Story 25.4: issues two revisions through the shared queue and LibreOffice to read the verdicts each DOCX printed beside the ones its revision row stores',
  },
  // Batch e25a (Story 25.3): 25.3-E2E-001 times the push of an edit against its commit (within 5 s), 25.3-E2E-002 the
  // order of an edit's push against slowed uploads, and 25.3-E2E-003 jumps the page's clock against a held push.
  {
    file: 'sync-by-itself.spec.ts',
    lane: 'solo',
    why: 'Story 25.3: times an edit\'s push against its commit and against slowed photo uploads, and jumps the page\'s clock a minute against a held push, so it must not share the CPU with other workers',
  },
];

/** The group a Playwright run is in: set by `scripts/e2e.ts`; absent for a bare `playwright test`. */
export type E2eGroup = 'parallel' | SerialLane;

/** The groups in the order `scripts/e2e.ts` runs them. */
export const E2E_GROUPS: readonly E2eGroup[] = ['parallel', 'queue', 'solo'];

/**
 * The default worker count of the parallel group; `--workers=N` on the command line overrides it.
 *
 * One, not three (2026-09-26, validation rule (d) of `spec-e2e-parallel-workers.md`): three
 * `test:e2e:full` runs on one worker all passed, and one of three runs on three workers
 * failed 12.3-E2E-004 (a tap's effect late under load) with the same 195 tests executed.
 * The api's `POST /api/sync/ops` slows sharply when pushes of several workers overlap, so
 * a test that passes serially can fail in parallel; the gate stays on one worker until
 * that is fixed. `--workers=3` runs the isolated per-worker pairs in parallel on demand.
 *
 * Still one (2026-09-26, `spec-epic-8-carry-over.md`): a push is now one transaction and no
 * overlapping push took over 3 s, but each of three `test:e2e:full` runs on three workers
 * still failed one test the three serial runs passed (12.3-E2E-004 twice, a reading's
 * commit late on the device; 6.2-E2E-001 once, a retried upload past 60 s); both pass alone.
 *
 * Still one (2026-09-27, `spec-test-speed.md`): 6.2-E2E-001's retry no longer gives up
 * waiting for the cycle in flight (`SyncEngine.retryUpload`), `humanTap` waits for its target
 * to be tappable by time as well as by frames, a PUT and its retry emit a file's server ops
 * once (6.2-E2E-003), and every spec that times a tap against a render runs in the serial
 * group. The first `pnpm verify` on three workers still failed 12.4-E2E-001 in the parallel
 * group (a Confirmar not applied within 5 s, load 12-14 from unlocked work elsewhere) and
 * 12.1-E2E-007 alone in the serial group, so the gate stays on one worker. `--workers=3`
 * runs the parallel group on three pairs on demand. On 2026-10-08, on the 11.4 GB / 6 CPU VM with nothing
 * else running, `pnpm test:e2e --workers=2` passed 229 of 229 twice on main a8b9b0e (612 s and 723 s,
 * against 1081 s on one worker), so the default is two.
 */
export const PARALLEL_WORKERS = 2;

/**
 * The worker count of the `queue` lane (chore T3, 2026-11-09): two, whatever `--workers`
 * says. AD-15 keeps the generations at one at a time; the second worker overlaps the UI work
 * (sign-in, pushed drafts, sync, the screens) that is about 72 % of a document test.
 */
export const QUEUE_WORKERS = 2;

/** The fewest worker pairs the global setup seeds, whatever the worker count. */
export const MIN_WORKER_PAIRS = 3;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches the path of each spec in `files` (by file name, under `e2e/`). */
function specPattern(files: readonly string[]): RegExp {
  return new RegExp(`(^|[\\\\/])(${files.map(escape).join('|')})$`);
}

/** Matches the path of every spec not in `files`. */
function notSpecPattern(files: readonly string[]): RegExp {
  return new RegExp(`^(?!.*[\\\\/](${files.map(escape).join('|')})$)`);
}

const serialFiles = SERIAL_SPECS.map((spec) => spec.file);
const laneFiles = (lane: SerialLane) => SERIAL_SPECS.filter((spec) => spec.lane === lane).map((spec) => spec.file);

/** Matches the path of every serial spec, whatever its lane (by file name, under `e2e/`). */
export const SERIAL_SPEC_PATTERN = specPattern(serialFiles);

/** Matches the path of every spec that is not in a serial lane: the parallel group. */
export const NON_SERIAL_SPEC_PATTERN = notSpecPattern(serialFiles);

/** Matches the path of every spec of a lane. */
export const LANE_SPEC_PATTERN: Readonly<Record<SerialLane, RegExp>> = { queue: specPattern(laneFiles('queue')), solo: specPattern(laneFiles('solo')) };

/** Matches the path of every spec outside a lane: what that lane's run ignores. */
export const NOT_LANE_SPEC_PATTERN: Readonly<Record<SerialLane, RegExp>> = { queue: notSpecPattern(laneFiles('queue')), solo: notSpecPattern(laneFiles('solo')) };

export function readGroup(value: string | undefined): E2eGroup | undefined {
  if (value === undefined || value === '') return undefined;
  if ((E2E_GROUPS as readonly string[]).includes(value)) return value as E2eGroup;
  throw new Error(`E2E_GROUP must be one of the lanes ${E2E_GROUPS.map((group) => `"${group}"`).join(', ')}, got "${value}"`);
}

/** The most workers a run of `group` may have: the parallel group any, `queue` `QUEUE_WORKERS`, `solo` and a run without a group one. */
export function maxWorkers(group: E2eGroup | undefined): number {
  if (group === 'parallel') return Number.POSITIVE_INFINITY;
  return group === 'queue' ? QUEUE_WORKERS : 1;
}

/**
 * Refuses a run that would put a serial spec beside more workers than its lane allows: a
 * `queue` run on more than `QUEUE_WORKERS`, or a `solo` run or a bare `playwright test`
 * (which holds every spec) on more than one. The global setup calls it before anything is
 * seeded.
 */
export function assertWorkersAllowed(group: E2eGroup | undefined, workers: number): void {
  const most = maxWorkers(group);
  if (workers <= most) return;
  const where = group === undefined ? 'a run without E2E_GROUP' : `the ${group} lane`;
  const holds = group === undefined ? SERIAL_SPECS.map((spec) => spec.file) : laneFiles(group as SerialLane);
  throw new Error(
    `${where} holds the serial specs (${holds.join(', ')}) and must run on ${most === 1 ? 'one worker' : `at most ${most} workers`}, got ${workers}. ` +
      'The lane rule: the queue lane runs on at most QUEUE_WORKERS workers and the solo lane on one, with nothing beside it. ' +
      'Run the suite with pnpm test:e2e, test:e2e:full or test:e2e:matrix, which run the parallel group, then the queue lane, then the solo lane.',
  );
}
