# Epic 6 coordinator notes: delivery shape, what went well, what went badly

Written by the coordinator session on 2026-09-26 as evidence for the Epic 6 retrospective. Matheus asked for the Epic 2/3 token-economy strategy (the weekly limit was almost reached) and for every carry-over from earlier epics to be addressed in this epic.

## Delivery shape

Stories batched by shared surface and data dependency, one shared orchestrator instruction file (`epic6-orchestrator.md`, derived from Epic 12's), the epic context compiled once by an opus subagent (96k) and committed with two coordinator decisions (`f19df65`), a carry-over batch F first, two review layers per batch with one fix loop, no per-batch independent review or MCP pass, one integrated review + QA on clean main, one fix batch (two PRs), a targeted re-check via SendMessage. Waves: F and P1 in parallel; P2 and P3 in parallel; QA; Q; re-check. Every agent on opus.

| Batch | Scope | PR | Tokens | Duration | Verify | Notes |
|---|---|---|---|---|---|---|
| F | carry-over E3-A4, E3-A9, E4-A7, E5-A2, E5-A4, E5-A5, E12-R2 | #40 | 232k | 176 min | green in 17m09s (over the 15 min budget) | web unit 133.6 s -> ~116-119 s (shared machine); E5-A2 sheet specs @p1 in the matrix only; E3-A9 bullet 4 to 6.6/Epic 7 |

F open questions: criterion_override shape {raw, unit}; a stale Confirmar writes nothing and announces nothing; an edited conclusion text is not guarded. Known open: concurrent pull can move focus to the wrong row after a removal; TAG renamed between screen and confirm saves text with the old TAG.
F contracts: `packages/domain/src/ops/path.ts` (all path builders incl. filePath, fileFieldPath, pointPath, pointFieldPath), `effectiveCriterion`, `conclusionPairComplete`, `conclusionBasisMatches`, `apps/web/src/input/focus-restore.ts`, `relatorio/project.ts`, `apps/web/src/test-axe.ts`.
| P1 | 6.1 + 6.2 | #41 | 256k (incl. merge round) | 228 min | green after merging F (5.8-E2E-002 load flake, passes alone) | review 16 findings: 11 patched, 1 deferred, 4 rejected |

P1 narrowings: gallery-header camera and "3 fotos aguardando envio" -> 6.3; "Adicionar fotos" beside a denied camera -> 6.4; nameplate single-shot tile -> Epic 8; Export warning row for unsent photos -> Epic 7; geolocation denial device-local pref (Epic 11). Open: equipment caption words as a kernel table not seed v3; captions without trailing period; storage-low banner ranks after re-auth; 500 MB threshold provisional. Known open: retry pill and storage banner only @p1; photo durability spec skips WebKit (Blobs in IndexedDB refused).
P1 contracts: photo = `file/{id}` full `photoFileRowSchema` row (scope relatorio), edits `file/{id}/caption|block_id|item_key|removed_at`, no device_id (6.3 picks the tie-breaker); kernel `packages/domain/src/photos/` contextCaption, parseExif, capturedAtFrom, orderUploads, evictionPlan, photosPendingText, photoUploadState, uploadPillText, storageLowBannerText, objectKey; web commitPhotoCapture, Dexie v5 `thumbs` (readThumb, putServerThumb, setUploadError, clearUploadError, runEviction), useBlockPhotoTiles, readPhotoSeq, writePhotoSeqAtLeast, shared `PhotoRow`.
| P3 | 6.6 | #42 | 241k | 142 min | green on the second run (setup-surface.test.tsx waited on a live query); e2e 16.4 min with two batches running | contract 4, seed v3 |

P3 narrowings: a point is saved by "Concluir", no autosave, unsaved text not kept (check against FR-32/FR-61 in QA); no Duplicar/Adicionar abaixo; no priority/deadline/owner UI or action-plan table; photo picker local to Points. Open: card title = linked equipment else "Geral"; "sem ação" counts manual points only; printed sentence of merged bullet 4 left to Epic 7; v1/v2 relatórios take chips from the current seed. Known open: point removal/undo only @p1; null equipment_id on an untested block unverified.
P3 contracts: CONTRACT_VERSION 4; point row + action (+ priority, deadline, owner no UI); relatorio/ops.ts createPointOp, putPointOp, removePointOp; points/ extractPhotoRefs, photoToken, pointTextTokens, derivedPoints, groupDerivedPoints, notTestedPointText, sectionEightEntries, pointsSummary(Text), pointTitle; photos/numbering.ts numberPhotos, photoRefLabel; seed v3 recurringFindings; pre-issue points_sem_acao, point_photo_removed; Sumário row 8 -> /relatorio/:id/pontos.

User concern 2026-09-25: verify takes 17-19 min, e2e full 20-30 min. Cause: workers 1 (specs share companies A/B; 17 files reset B 64 times; company-wide counts), flake reruns, parallel batches contending. Safe plan (user asked to verify interactions first): per-worker company pairs, export specs in a serial project, a leak check, 3x serial vs 3x parallel validation before switching the gate, start at 3 workers. Owner: Epic 6 fix batch. Meanwhile one verify at a time.
| P2 | 6.3 + 6.4 + 6.5 | #43 | 272k | 237 min | green on the second run (6.1-E2E-002 focus under load, passes alone) | no contract bump; one numberPhotos kept |

P2 narrowings: composer is a modal not a route; recents device-only (local_prefs caption_recents:{id}); Equipamento choice changes the caption text only; gallery camera shot is "Geral"; removed photo returns only via Desfazer; no day headers; HEIC only mocked. Open: numbering tie-breaker (captured_at, local_seq, id); "sem legenda" pending vs "aguardando envio" info; composer opens in "Editar texto" when the stored caption differs. Known open: Sumário "aguardando envio" also counts photos shown "com erro"; no test on which picture the viewer shows; HEIC Exif fallback synthetic only.
| QA | integrated review + gate + browser pass | review on main | 298k | 65 min | verify 20m37s EXIT 1 (lint 39 s, static 70 s, unit 170 s, api 160 s, e2e 798 s; 5.8-E2E-002 and 6.1-E2E-002 each 1/2 alone); e2e:full 1098 s EXIT 1 (12.1-E2E-009, 12.3-E2E-004 fail 2/2: E6-Q1); matrix 478 s EXIT 0 | 0 high, 6 medium, 8 low |

Coordinator decisions for the fix batch: E6-Q2 point editor autosaves per field (FR-61, EXPERIENCE autosave); E6-Q5 captions carry TAG and column as the mock draws them (period stays open for Bruno); E6-Q8 gallery import commits on pick (6.4 AC1); E6-Q4 "De qual equipamento?" grouped by cabine with the current/nearby equipment first as in the mock; E6-Q9 kept as "Geral" (open for Matheus); stale "Confirmar" announces "O texto mudou; confira e confirme de novo" (authored); the fix batch runs test:e2e:full too (QA open question 7). Parallel e2e as phase 2 with the safeguards the user asked for.
| Q | fixes E6-Q1..Q6, Q8, Q10..Q14, stale Confirmar (#44); parallel e2e infra (#45) | #44, #45 | 312k | 474 min (6 full-suite validation runs) | #44 verify 1056 s + e2e:full 1152 s green; #45 verify 1157 s green | 3+3: serial 1272/1255/1281 s all green; 3 workers 791/796/812 s, run 1 failed 12.3-E2E-004 -> gate stays at 1 worker |

Q narrowings: point editor has no "Cancelar"; short equipment list up to 5 rows + "Outro equipamento"; NC-row point mark only through the item's photos; only photo commits trigger a sync. For Bruno: "Ponto de atenção n", the Remover line, "N fotos ficaram como Geral, sem legenda", "O texto mudou; confira e confirme de novo". Probable parallel cause: POST /api/sync/ops ~17 s median under overlap vs 1.2 s alone -> deferred to Epic 7 carry-over. Open: document the new e2e runner in AGENTS.md.
| re-check | 11 items + 4 specs x3 | report on main | (cached) | ~20 min | all pass; 12/12 | new lows E6-R1, E6-R2 deferred |

## What went well

- W-1 Carry-over first and in parallel: E3-A4, E4-A7, E5-A4, E5-A5 and E12-R2 closed in one batch (#40) while P1 built photos; E3-A9 and E5-A2 advanced. Few conflicts because the launch prompts fenced the files each batch owned.
- W-2 Cross-batch contracts in PR bodies and resume messages worked: P1 switched to F's path builders after merging main; P2 kept a single `numberPhotos` after P3 merged first.
- W-3 The integrated pass caught what batches missed: a 768 px overlay regression that blocked two tap journeys (E6-Q1, reached main because @p1 journeys are outside `verify`), a point editor that lost text (E6-Q2, against FR-61), identical printed captions (E6-Q5), a real focus race (E6-Q6).
- W-4 The parallel-e2e safeguards Matheus asked for did their job: per-worker companies, a serial export group, a leak check and a 3+3 comparison. One parallel-only failure kept the gate at 1 worker instead of shipping a flaky gate; the root cause candidate (sync push 1.2 s alone vs ~17 s median under overlap) is recorded.
- W-5 Orchestrator cost stayed at 232-312k per batch; QA 298k with a cached re-check.

## What went badly

- B-1 The gate is slow and got slower: `verify` 17-21 min (e2e 12-13 min serial), `test:e2e:full` 18-21 min; batches needed 2 runs each; the fix batch spent 474 min, most of it on six full-suite validation runs. Matheus flagged it ("mais de 30 min não é razoável").
- B-2 Two batches running `verify` at once on 8 cores / 15 GB pushed e2e past 16 min and produced load flakes; the "at most two concurrent verifies" rule is too loose for this machine.
- B-3 A stacked PR (#45 based on #44's branch) merged into that branch instead of main; the coordinator re-landed it as #46. Stacked PRs need `--base main` after the first merges.
- B-4 A regression in a @p1 journey (E6-Q1) reached main because each batch ran only `verify` (@p0); `test:e2e:full` ran only at the integrated pass.
- B-5 The QA agent again could not write outside its worktree; the coordinator copied its report and screenshots (by prompt design this time).
- B-6 Product and wording questions keep accumulating for Matheus and Bruno: manual points naming an equipment (E6-Q9), caption wording and period, row 8 counts, four authored texts, the `criterion_override` shape, gallery import semantics.
- B-7 Photo durability on WebKit is untested (its contexts refuse Blobs in IndexedDB) and the physical tablet check (camera, soft keyboard after programmatic focus) is still Matheus's manual step.
