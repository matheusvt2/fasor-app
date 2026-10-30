# Release notes v0.5.0 (tag at 29f030b2, 2026-10-30)

The tag `v0.5.0` was pushed on 2026-10-30 on Matheus's "pode fazer". The GitHub release page is published with `gh release create v0.5.0 --title "v0.5.0" --notes-file <this file from the rule below>`, by Matheus or by an agent session allowed to create a public surface. The notes are everything below the rule.

---

Epics 18 and 19 and the production pass fix batches of 2026-10-29. Contract 28 (the relatório tombstone op family). Deployed to production in three steps: `94ca957a` and `87ff8a9d` on 2026-10-29, `3b45e83c` and `29f030b2` on 2026-10-30, each with the production smoke 8 of 8. v0.4.0 (2026-10-28, Epic 17 and Story 15.7, contract 27, seed v10) was tagged without a release page; its changes are in the Epic 17 records (#187 to #201).

**Production pass of 2026-10-28 and its fix batches** (186 checks on v0.4.0; one P1: the display reading was dead in production because the OCR sidecar did not fit the instance's memory).

- Fix batch fxpw (#204): the ten web and kernel gaps of the pass (G1 to G5, G7 to G11), among them the "Sugerir TAG" question on a block move, one count word on the Status board and Desfazer on the cancel toast.
- Fix batch fxg6 (#205): the display reading runs on the mobile text detector, so the OCR sidecar fits the production instance; the first display reading in production followed.
- Fix batch fxrm (#208): the relatório tombstone op family (contract 28) and a one-shot CLI that removed the 2026-10-15 test data from production (ids only in its log).

**Epic 18: observing how the app is used** (AD-28: usage events outside the op log; no free text, closed vocabularies, kept 90 days).

- Story 18.1 (#213): the device records screens, taps, waits, dialog outcomes, reading results, sync results and errors as strict kernel events (`data-telemetry` on the controls), queues them in its own IndexedDB table and ships them with the sync cycle.
- Story 18.2 (#213): `POST /api/telemetry` with the strict schema, the per-device limiter and the stdout and CloudWatch sinks (log group `/fasor/production/ux-events`); Conta tells the user under "Uso do aplicativo" what is recorded and for how long.
- Story 18.3 (#212): the CloudWatch dashboard `fasor-production-ux` with nine views and the matching saved queries, the runbook `docs/observability.md`, the monthly friction digest template and the read-only op-log friction read CLI.
- Retrospective (#215): accepted-with-open-items; action items E18-A1 to E18-A7 (fix batches, the smoke company filtered out of the views, a telemetry step in the smoke, the first digest on 2026-11-30).

**Epic 19: Home at scale** (Matheus's decisions of 2026-10-30 over the Home analysis).

- Story 19.1 (#216): the Templates and Cadastros shortcuts move above the relatório list, one tap from the top at every width.
- Story 19.2 (#217): the list opens on the active relatórios (Rascunho, Em campo, Em revisão); the Emitido tile of the Status board is the way to the emitted ones; most recent first (the relatório's last change on the server; the current card first, then a relatório created on the device and not yet synced); a page of 10, 20, 50 or 100 chosen with Filter chips beside "Mostrando 10 de 37 relatórios", remembered on the device; "Nenhum relatório em andamento. N emitidos: toque em Emitido." when nothing is active.

**Gates.** Epic 18 integrated main: `pnpm verify` green, `test:e2e:full` 537 of 542 (one red green alone, four known skips). Story 19.2 on `29f030b2`: lint 0 errors, static, test:api 733 of 733, test:unit 4707 of 4707, touched Playwright specs 5 of 5; production smoke 8 of 8 in 51.6 s after the deploy.
