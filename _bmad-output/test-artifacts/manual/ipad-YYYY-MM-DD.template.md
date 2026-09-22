# Offline proof — result TEMPLATE (do not fill in this file)

**This is a template.** Copy it to `ipad-YYYY-MM-DD.md` — the date the run started, the
filename TC-12 fixes — before filling anything in. **One file per run, covering both
devices**: there is a step table for the iPad and one for the Android tablet below, so
the run stays one document.

**Status of this template: PENDING — no run has been executed.**

Script: `offline-proof-script.md`. Executor: Matheus.

---

## Run

| Field | Value |
| --- | --- |
| **Status** | `PENDING` / `PARTIAL` (steps 1-4, 6-8 filed, step 5 still waiting) / `COMPLETE` |
| Date started | |
| Date completed | |
| Executor | |
| Origin used (`https://…`) | |
| Bundle / commit under test | |
| Build command used | `build:e2e` (carries `/__fixture/field`) / `build` |
| Capture surface used in steps 3-4 | `/__fixture/field` / a real sheet (Epic 5 on) |
| Root CA installed and trusted | iPad: yes / no · Android: yes / no |

## Devices

| Field | iPad | Android tablet |
| --- | --- | --- |
| Model | | |
| OS version | | |
| Browser and version | | |

## Steps — iPad (iPadOS Safari)

`Outcome`: pass / fail / not run yet. Fill the date of the sitting each step was run in,
so a PARTIAL run says plainly what has and has not happened.

| # | Step | Date run | Outcome | Notes |
| --- | --- | --- | --- | --- |
| 1 | Sign in on the device, reach Home | | | |
| 2 | Shell worker installed and active | | | |
| 3 | Offline: commit values, leave one uncommitted, offline badge and toast | | | |
| 4 | Close the browser completely, reopen offline: shell loads, Home draws, committed values present, draft offered and never applied by itself | | | |
| 5 | After the eviction window (≥ 7 days unused): data present, or the one-time recovery screen and a successful re-download | | | |
| 6 | Storage figures read | | | |
| 7 | Camera opens from a page and the photo reaches it | | | |
| 8 | Result filed and linked from the pull request | | | |

## Steps — Android tablet (Chrome)

| # | Step | Date run | Outcome | Notes |
| --- | --- | --- | --- | --- |
| 1 | Sign in on the device, reach Home | | | |
| 2 | Shell worker installed and active | | | |
| 3 | Offline: commit values, leave one uncommitted, offline badge and toast | | | |
| 4 | Close the browser completely, reopen offline: shell loads, Home draws, committed values present, draft offered and never applied by itself | | | |
| 5 | After the eviction window (≥ 7 days unused): data present, or the one-time recovery screen and a successful re-download | | | |
| 6 | Storage figures read | | | |
| 7 | Camera opens from a page and the photo reaches it | | | |
| 8 | Result filed and linked from the pull request | | | |

### Values from step 3, and what was still there in step 4

| Device | Field | Typed | Committed? | Present after reopen | Offered as a draft |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### Anything lost

Describe exactly what was not there after step 4 or step 5, or write "nothing was lost".
If step 5 has not run yet, say so here too.

## Storage readings (step 6)

| Reading | iPad | Android |
| --- | --- | --- |
| Conta › Armazenamento › "Em uso" (as shown) | | |
| `navigator.storage.estimate().usage` (bytes) | | |
| `navigator.storage.estimate().quota` (bytes) | | |
| Free (quota − usage, bytes) | | |

**Storage-low threshold.** AD-8's 500 MB is provisional and marked `[ASSUMPTION]`; the
numbers above are what set it. Proposed threshold after this run, with the reasoning:

> …

## Screenshots

Put the files beside this one and list them here.

| Device | Step | File | What it shows |
| --- | --- | --- | --- |
| | | | |

## Platform-line decision

Only decidable on a COMPLETE run. Tick exactly one, and say which step decided it.

- [ ] **All three browsers** — iPadOS Safari, Android Chrome, desktop Chrome/Edge. Steps
      4, 5 and 7 passed on the iPad.
- [ ] **Android Chrome and desktop only**, FR-56 (zero photo loss) unchanged. iPadOS
      Safari failed step ____ ; what happened:

> …

- [ ] **Not decidable yet** — the run is PARTIAL; step 5 has not been executed.

Follow-up raised through `bmad-correct-course` (yes / no, and where):

> …
