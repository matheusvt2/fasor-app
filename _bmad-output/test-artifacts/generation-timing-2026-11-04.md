# Generation timing: from the press to the document (2026-11-04)

This is the spike of `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-04.md` § 4.2, ordered by Matheus on 2026-11-04 ("Faça a medicao"). It only measures; no product code changed.

## Source

All figures come from the compose api's log (`podman logs --since 8h fasor-api-1`, 72 884 lines). The window ran from 10:28 to 17:25 UTC on 2026-11-04, and covers one full `test:e2e:full` on `10e87157` and several story gates. Three line types were read:

| Line | What it gives |
| --- | --- |
| `generate timing` | The job's own stages, `stages_ms` per job (Story 14.10 part 4) |
| `http_request` | The server's arrival time of each `POST /api/relatorios/:id/generate` and each `GET /api/sync/relatorios/:id` |
| `ux_event` `name: "wait"`, `kind: "generate"`, `outcome: "ok"` | The device's own measure from the press to the ready revision, `duration_ms` (Story 18.4) |

Every process ran on one host, so the device and the server share a clock.

**Matching.** Each device wait was matched to the POST, the job and the pulls of the same `relatorio_id` inside its window. 110 of the 123 ok waits matched end to end; the other 13 had no POST or no job line inside the window.

## Result

**Press to ready, as the device measures it** (110 generations):

| Phase | Median | Mean | p10 | p90 |
| --- | --- | --- | --- | --- |
| A. Press to `POST /generate` (the outbox flush) | 60 ms | 122 ms | 41 ms | 168 ms |
| B. POST to job start (queue pickup) | 1024 ms | 1005 ms | 167 ms | 1841 ms |
| C. Job run | 1316 ms | 2491 ms | 1044 ms | 6685 ms |
| D. Job end to the device's first pull | 991 ms | 1151 ms | 251 ms | 2342 ms |
| E. Job end to ready on the device | 1142 ms | 1293 ms | 374 ms | 2459 ms |
| **Total, press to ready** | **3389 ms** | **4911 ms** | 3297 ms | **9460 ms** |

**Inside the job** (`generate timing`, 125 e2e issues). The median total is 1324 ms and the p90 is 6967 ms. The two LibreOffice conversions take most of it:
- `convert_1` (median 618 ms) is 45 % of all job time;
- `convert_2` (median 490 ms) is 36.5 %;
- the two DOCX builds are 7.6 % and 6.4 %;
- everything else is under 2 %.

The 33 `test:api` issues show the same shape: median 1346 ms, p90 2719 ms. The 13 e2e previews have a median of 1781 ms and a p90 of 24 892 ms, because a preview's second conversion is heavier.

## What this corrects

The proposal said a generating test spends "about 9.5 s" between the press and the toast. That figure came from the steps over 7 s in `timings-*.json`, which is the slow tail. The 9.5 s is the **p90**. The **median is 3.4 s**.

So the generations in the serial group cost about 3.4 s × 50 ≈ 3 min of its 22 min. The rest is the UI work of each test and its setup (sign-in, pushed drafts, sync).

## Where the 3.4 s goes, and what each part would cost to cut

| Part | Typical time | Cause | Lever | Cost |
| --- | --- | --- | --- | --- |
| Queue pickup | ~1.0 s (0 to 2 s) | pg-boss 12.33.2 polls every 2 s by default (`attorney.js` `applyPollingInterval`; the minimum is 0.5 s). The generate worker sets no interval (`apps/api/src/jobs/generate/worker.ts:108`) | `pollingIntervalSeconds: 0.5` on the generate worker, or pg-boss's NOTIFY mode, which would make pickup close to immediate | One small Postgres query every 0.5 s per api instance instead of every 2 s. Negligible against the USD 100 ceiling |
| Device learning the job ended | ~1.1 s (0.4 to 2.5 s) | `use-generate.ts` polls `syncRelatorio` every `DEFAULT_TIMING.pollMs` = 3000 ms while working; `GenerateWatcher` also polls every 3000 ms | `pollMs` of 1000 | Up to two more relatório pulls per generation, only while one is awaited |
| Conversions | ~1.1 s of the 1.3 s job | Two soffice runs per job (AD-15, one at a time); the profile is warm (A-17) but the process is spawned each time | A persistent soffice process (unoserver or similar) | It saves at most part of the ~0.5 s per conversion. A resident soffice costs a few hundred MB on the AWS task, and it changes the api image and the AD-15 reading. **Not worth it** |
| The flush before the request | ~0.06 s | `retryMs` (2 s) applies only when ops are still pending at the press; they rarely are | None | None |
| Slow tail (p90 9.5 s) | Job p90 6.7 s | CPU contention on the shared VM during the parallel gate; soffice slows sharply | None in code | It is the machine's load, not the app |

## Recommendation

1. **Do not pursue a persistent soffice.** It saves a few hundred ms per conversion, for memory and image cost and a change to how AD-15 is read.
2. **One small product story is worth proposing**, because it helps every field user and the suite alike:
   - pickup of 0.5 s on the generate queue, or NOTIFY;
   - a device poll of 1 s while a generation is awaited.

   Expected gain: from about 3.4 s to about 1.7 s median, press to ready, on this host. Production timings are not measured here. CloudWatch holds the `generate timing` lines, and the aws MCP was unavailable in this session.

   For the suite this is about 1.5 min of the serial group's 22. It is a product decision because it changes server polling and device request rates, so it goes to `epics.md` only with Matheus's word.
3. **For the test-suite question, generation is not a lever.** After the waits fixed on 2026-11-04 (`8dda538c`, `aa5bfff2`, PR #246), the serial group's time is the volume of document and timed-tap tests, each doing real UI work. Shortening the suite further means running fewer end-to-end tests. That is a risk-based review of which `@p0` and `@p1` tests a wave needs, and it is Matheus's call against the `AGENTS.md` rule "Nothing ships untested".

## How to repeat this measure

1. Save the api log: `podman logs --since <window> fasor-api-1 > api.log`.
2. Keep the `ux_event` lines with `name: "wait"`, `kind: "generate"` and `outcome: "ok"` (the device's press-to-ready).
3. For each one, match the `POST /api/relatorios/:id/generate` `http_request` line, the `generate timing` line and the first `GET /api/sync/relatorios/:id` after the job, all by `relatorio_id` inside the wait's window. The job's start is the `generate timing` line's `ts` minus its `total_ms`.

Production can be measured the same way from CloudWatch: the api log group holds the same three line types (Story 18.2).
