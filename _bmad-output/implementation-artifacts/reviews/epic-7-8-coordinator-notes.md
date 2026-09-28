# Epics 7 and 8 coordinator notes: delivery shape, what went well, what went badly

Written by the coordinator session on 2026-09-28 as evidence for the Epic 7 and Epic 8 retrospectives. Matheus asked for Epic 8 in the Epic 5/6 token-economy shape with the earlier epics' carry-over settled first (2026-09-26), then for Epic 7 in parallel with it (skipped earlier), then for the rest of Epic 8 in parallel with a test-speed batch (2026-09-27).

## Delivery shape

Tracked orchestrator playbook `epic-batch-orchestrator.md` (folds E4-A8, E5-A6, E5-A7, E6-A2, E6-A7, E12-A5, E12-A6), a host lock `flock /tmp/fasor-verify.lock` keeping one gate at a time, epic contexts compiled once with coordinator decisions (`epic-7-context.md`, `epic-8-context.md`), a carry-over batch first, batches by surface and data dependency, one integrated review + QA for both epics, one fix batch, a re-check by the same QA agent. Every agent on opus.

| Batch | Scope | PR | Tokens | Duration | Notes |
|---|---|---|---|---|---|
| context 8, context 7 | epic contexts | on main | 125k each | 4-5 min | conflicts resolved as coordinator decisions |
| C | carry-over E6-A1/A3/A6/A7, E12-A7, E4-A9, TAG-rename e2e, test-reset | #48 | 318k | 368 min | push applied in one transaction (worst 32.9 s -> 2.9 s); 3 workers still flaky, gate kept at 1 |
| O | 8.3 OCR sidecar, contract, fixture plate | #47 | 233k | 222 min | PARSeq loses accents; PP-OCRv5 read 43/43 in a scratch run (open) |
| S | 8.1 suggestion entity | #49 | 353k | 308 min | its verify failed on web unit timeouts with four batches loading the machine; green alone |
| G1 | 7.1 section 9 | #50 | 376k (cut) | 327 min | cut by the weekly usage limit after its review loop; coordinator finished the merge and gate |
| G2 + G3 | 7.2-7.3 and 7.4-7.5 | #51 | 352k + 313k (both cut) | ~330 min each | cut by the weekly limit; coordinator merged G2 into G3, resolved renderer/layout/Sumário/contract conflicts (contract 6), and fixed tests that assumed their section alone |
| R | 8.4 + 8.5 reading job | #52 | 334k | 223 min | review 19 findings: 9 patched, 2 deferred, 8 rejected; one host `python3` edit (process slip) |
| P | 8.2 + 8.6 plate UI | #54 | 386k | 374 min | gate failed once on a load-flaky unit file and once on the upload race T fixed |
| T | test speed | #53 | 345k | 146 min (two API-timeout restarts) | verify 1499 s -> 1268 s; three races fixed; workers stay 1 |
| QA | integrated review + QA Epics 7+8 | report on main | 340k | 62 min | 0 high, 5 medium, 9 low, 4 info |
| Q | fixes E78-Q1..Q9, Q11, Q13, Q14 | #55 | 339k | 125 min | verify 1258 s, e2e:full 228/228; mutation runs for six fixes |
| re-check | 12 IDs | report on main | (cached) | ~25 min | all pass; new lows E78-R1, E78-R2 |
| 9.1 DoR | display spike base set, web references | none (git-ignored media) | 206k + 165k | 10 + 31 min | 19 legible crops, ground truth 15 of 19 |

## What went well

- W-1 Carry-over first and alone: the push slowdown (E6-A1) was fixed before Epic 8 built on the sync route; the sheet split (E6-A7) landed before the nameplate work.
- W-2 One integrated review for two epics found the cross-batch defects no batch saw (E78-Q1 Sumário vs Export, E78-Q2 the fake provider never matching an app-taken photo) with one QA agent instead of two.
- W-3 The fix batch proved six mechanism fixes with mutation runs; the re-check passed all twelve IDs.
- W-4 The host lock worked: no two gates overlapped by construction.

## What went badly

- B-1 The gate is the bottleneck. `verify` took 1248-1318 s against the 900 s budget (e2e @p0 alone 868-1072 s on one worker, about 7 s per test); `test:e2e:full` 1560-1585 s. With one gate at a time the queue itself cost 10-35 minutes per batch several times. Matheus: "os testes estão demorando muito e dando timeout ... se não vamos demorar muito tempo sem evoluir nada". Batch T cut about 4 minutes; three workers still fail one timing-sensitive test per run, so the gate stays at 1 worker.
- B-2 Long timeouts hid simple failures: a click on an aria-disabled "Gerar relatório" waited the full 360 s before failing (7.2-E2E-001), until T's 15 s action timeout.
- B-3 Load flakes: web unit files (template-composer-undo, setup-surface, relatorio-tree-edits) timed out whenever development ran beside a gate; S's and P's gates each failed once on them.
- B-4 The weekly usage limit cut three orchestrators (G1, G2, G3) after their review loops and before their gates; API timeouts cut T twice. The coordinator finished the three Epic 7 batches by hand (merge, conflicts, four gate runs for #51). One G3 test (7.5-E2E-002) could never have passed: its batch never reached a green gate.
- B-5 Parallel batches on one renderer (docx.ts, layout.ts) and one contract version produced mechanical conflicts plus tests that assumed their section was alone in the document (page-break counts, first "Imagem 1" line, tables after the cover); each surfaced only in a full gate.
- B-6 The remaining device-side cost: every commit rebuilds the whole relatório snapshot (T's measurement), recorded for the Epic 9 carry-over.
- B-7 Product questions keep piling up for Matheus: Rascunho may generate, Confirmar todos and the create-hint manufacturer, blank ART wording, parecer suggestion timing, dual secondary ratio, TAG in not-tested bullets, PARSeq vs PP-OCRv5, the 12.1 tap-guard timing, the megôhmetro range source for Story 9.1.
