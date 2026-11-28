# Epic 31 context: the relatório filled by voice

Compiled 2026-11-26 by John (PM), before any worktree. The stories, the decisions and the rules every story keeps are in `_bmad-output/planning-artifacts/epics.md`, "Epic 31" (read that section with offset and limit; never the whole file). The architecture is `### AD-30` in the spine (grep it, read only that block). The source is `planning-artifacts/sprint-change-proposals/sprint-change-proposal-2026-11-26.md`. This file adds only what the batches share.

## Goal

A user taps a mic on a text field, speaks and moves on, with or without signal. The audio is kept, uploaded, transcribed and written by a model in the backend, and the text arrives in the field marked "Áudio". A spoken measurement reading waits for review. An AI control rewrites a field on the user's tap. No seed, no print change: every golden stays byte-equal.

## Decisions (Matheus, 2026-11-26)

The seventeen decisions are listed at the top of Epic 31 in `epics.md`. Two more, about the build:

- "faça otimizado, com um teste completo no final somente e economizando tokens": **one full gate for the whole epic, at the end**, on the integrated main. No full gate per wave. One review at the end.
- No field test first; build, use, improve.

## Batch plan

At most two batch stacks up at a time. The main checkout's stack is stopped while batches run (`podman compose stop`, never `-v`).

| Order | Tag | Stories | Port base | Base | Contract | Dev model · Effort |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | e31u | the mocks, `EXPERIENCE.md`, `DESIGN.md` (documents only, no stack) | none | main | none | opus · medium |
| 1 | e31a | 31.1, then 31.2 | 30 | main | main's plus one (62) | opus · high |
| 2 | e31b | 31.3, then 31.4 | 30 | main with e31a and e31u merged | none | opus · high |
| 3 | e31c | 31.5, then 31.6 | 30 | main with e31b merged | none expected | opus · medium |
| 4 | e31d | 31.7, then 31.9 | 30 | main with e31c merged | main's plus one only if 31.9 needs it | opus · medium |
| 4 | e31e | 31.8 | 31 | main with e31a merged | none | opus · medium |

- e31u and e31a run side by side: they share no file but `docs/kbs/log.md` (append only).
- This regroups the story table of `epics.md` (31.4 rides with 31.3): fewer batches, the recorder and the field's arrival are one screen's work.
- e31d and e31e run side by side; e31e touches `infra/` and the `transcribe` adapter only.
- Images: each batch tags its own `app-api-e31x` and `app-tools-e31x` from the shared images and never builds from scratch.

## Facts the batches share

- **Contract.** 61 today. e31a takes main's plus one and appends its paragraph to `packages/domain/src/contract/version.ts`.
- **Names are AD-30's:** file kind `audio`; `audio_target`, `audio_status` (`queued`, `transcribing`, `done`, `failed`, `dismissed`), `quality`, `transcript_heard`, `transcript_written`, `transcription_run_id`; `meta.source_audio_id`, `meta.ai_written`; Suggestion `source: {audio_id}`; actor `system:transcription`; job `transcription`; `STT_PROVIDER` (`fake` | `transcribe`); `SpeechProvider`, `WritingProvider`; kernel folder `packages/domain/src/audio/` with `pendingAudios`, `failedAudios`, `audioQualityVerdict`, `writtenTextGuard`, the writing level of a target; routes `POST /api/audios/{id}/retranscribe` and `POST /api/relatorios/{id}/write`. A batch that must rename one says so in its PR and amends AD-30 with a dated line.
- **One owner per shared item:** the `file` union, the Suggestion source, `packages/domain/src/audio/`, the contract number: e31a (31.1). The `transcription` job, its fixtures, the system ops: e31a (31.2). `apps/web/src/speech/`, the removal of `webspeech-engine.ts`, `fake-engine.ts` and `VITE_SPEECH_ENGINE` (source, compose file, `apps/api/Dockerfile.prod`, `e2e/support/speech.ts`): e31b (31.3). The field status line, the mark, play: e31b (31.4). The measurement table's audio button and review: e31c (31.5). Sheet state, pre-issue, Sync status counts: e31c (31.6). `infra/` and the `transcribe` adapter: e31e. The write route and the AI control: e31d (31.9).
- **Reused from Story 9.4:** `packages/domain/src/parse/utterance.ts` (`dictatedText`, `parseTableUtterance`, `tableDictationLabel`) and the seven button positions (grep `DictationButton` under `apps/web/src/surfaces`). Names with "dictat" are renamed to "audio" where a batch touches them.
- **Fakes.** `STT_PROVIDER` and `LLM_PROVIDER` default to `fake`; fixtures under `apps/api/src/jobs/transcription/fixtures`. Playwright drives the recorder through a test seam (no real microphone), and the e2e bundle keeps working with `AI_FEATURES` as the existing reading specs set it.
- **Strings.** Every authored pt-BR sentence marked `// authored (Story 31.x, listed for Bruno)` and listed in the PR. The word is "Áudio"; no "Ditado", "Ditar" or "Ouvindo…" survives the batch that owns the surface.
- **Mocks.** e31u adds the audio button, the recording state, the status line, the mark, the AI control and their CSS to the mock's `components.css`; the batch that first renders a rule copies `components.css` unchanged into `apps/web/src/styles` and writes its `.frame-*` translations in `app.css`.

## Gates

- **Each batch:** `lint`, `static`, `test:unit`, `test:api` and the Playwright specs it wrote or touched (`pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome`), inside the `tools` container, under the host lock (`lockf -t 20000 /tmp/fasor-verify.lock`), the summary pasted in its PR. Touched durability specs also on the matrix projects when the batch changes the op fold, the commit path or a live query on the ficha. No review loop inside a batch.
- **Once, at the end of the epic, by the coordinator, with the machine idle:** `podman compose restart api web`, then `pnpm test:e2e:full` and the matrix; one review; one fix batch if needed.
- **Deploy only on Matheus's word.** The feature works in production only with Story 31.8 applied on his AWS login.
- **After each merge:** remove the batch's containers, image tags and network (`podman`); only main's stay.

## Open items

- The coordinator's readings written in each story are open to Matheus; none blocks a batch.
- For Bruno: the on-screen strings, the trade's vocabulary for Story 31.8, the tablet's model and browser.
