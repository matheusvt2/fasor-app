---
status: ready-for-dev
dev_model: opus
dev_effort: high
warnings: ['batched']
---

# Spec e31b: the audio recorder, live quality and the text in the field (Stories 31.3, 31.4)

Batched: 31.4's arrival, mark and play render on the same fields, in the same components, as 31.3's button and
status line (one screen's work), so one build and one PR. Contract 62 stays (no op family added). No seed, no print
change, goldens byte-equal. Context: `_bmad-output/implementation-artifacts/epic-31-context.md`; stories 31.3 and 31.4
at `epics.md` `### Story 31.3` (about line 13699) and 31.4; AD-30 in the architecture spine; the mock is
`mockups/components.css` section "Audio button" (line 251 on) and `prototype/screens/62-audio-estados.html` (never read
it whole: grep, then ranges). Wording below that is not in a mock is the coordinator's, to be marked
`// authored (Story 31.x, listed for Bruno)`.

## What already exists (e31a, merged: grep, do not rebuild)

- Kernel `packages/domain/src/audio/`: `audioTargetPath`, `audioPermissionPath`, `audioBlockId`, `audioWritingLevel`,
  `pendingAudios`, `failedAudios`, `audioStatusLabel`, `pendingAudiosText`, `AUDIO_QUALITY_THRESHOLDS`,
  `audioQualityVerdict`, `audioQualityOf(measures)` (measures to the stored `quality`), `audioQualityNote`
  ("Confira o texto"), `writtenTextGuard`, `appendAudioText`, `audioProseWrite`. Schemas in
  `schemas/entities.ts`: `audioFileRowSchema`, `audioTargetSchema` (item, sheet_field, test_value, photo_caption,
  point, setup, section, table), `AudioQuality`. A device create of an audio is the `file/{id}` create op
  (`filePath`) in relatorio scope, `kind: 'audio'`, `audio_status: 'queued'`, `audio_target`, `quality`,
  `transcript_heard/written/transcription_run_id: null`, plus the common file fields (see `photoCreateDraft` in
  `apps/web/src/db/file-commit.ts` for the shape).
- Api: job `apps/api/src/jobs/transcription/`, fake STT/writing fixtures (default heard text "equipamento verificado sem
  anomalias aparentes"; polish writing returns "Equipamento verificado, sem anomalias aparentes."), the system ops that
  set the audio `transcribing`/`done` and put the text on the target with `meta.source_audio_id`. `STT_PROVIDER` fake by default.
- Device pieces to reuse: `commitFileBatch` (`apps/web/src/db/commit.ts`, ops plus Blob in one transaction), `pendingUploads`
  and `orderUploads` (`packages/domain/src/photos/upload-order.ts`), `localFileRow`/`readLocalBlob`/`ensureLocalBlob`
  (`db/file-store.ts`), `useLiveQuery` (`db/live.ts`), the toast (`state/toast.tsx`) and `state/reading-arrivals.tsx` as the
  model for a once-per-sync arrival toast, `state/permissions.tsx`, `state/ai-features.tsx`, `state/sync.tsx` (online).

## Current dictation (to replace)

`apps/web/src/speech/` = `engine.ts`, `webspeech-engine.ts`, `fake-engine.ts`, `dictation.tsx` (`SpeechEngineProvider`,
`DictationButton`, `useProseDictation`, `DictatedSuggestion`) plus tests; `app.tsx` mounts the provider. Seven button
positions (grep `DictationButton` in `apps/web/src`): `surfaces/ficha/checklist-section.tsx` (NC item observation, with
`DictationRow`), `conclusao-section.tsx` (ficha Observações, section head), `measurement-test-section.tsx` (test reason),
`ensaios-section.tsx` (measurement table), `surfaces/photos/caption-composer.tsx` (one photo's caption),
`surfaces/photos/capture-sheet.tsx` (batch caption), `surfaces/points/point-editor.tsx` (point text);
`surfaces/ficha/sheet-observation-dictation.tsx` holds the "pending dictated text" provider. Strings: `copy/ui.ts` `dictation`
block, `copy/pt-br.ts` keys `dictate`, `dictateText`, `dictateObservation`, `dictateReason`, `dictateObservations`,
`dictatedNote`. E2E: `e2e/dictation.spec.ts` (466 lines) and `e2e/support/speech.ts`; `e2e/ai-features-off.spec.ts` mentions dictation.

## I/O matrix

| Input | Result |
| --- | --- |
| Tap the audio button, mic allowed | recording; button `aria-pressed`, "Gravando", elapsed `m:ss`, level meter, screen wake lock, any other recording stops first |
| Second tap | stop; measures computed once over the samples; `audioQualityOf(measures)`; if verdict reasons include `too_short` or `no_speech`: nothing saved, field status `empty` "Não ouvi nada, grave de novo"; else commit |
| Commit | ONE `commitFileBatch`: the `file/{id}` audio create op (relatorio scope, `audio_target`, `quality`, status `queued`) and the Blob (webm/opus or mp4/aac as MediaRecorder gives, mono) in the same transaction |
| Mic refused (NotAllowedError, NotFoundError) | button stays; a tap shows the explanation how to allow the microphone (live region); nothing recorded |
| Browser cannot record (no MediaRecorder or no getUserMedia) | no button element |
| Live: level low, clipped, noise close to voice, for longer than the kernel's window | one warning line ("Fale mais perto do aparelho", "Muito alto, afaste um pouco", "Muito ruído em volta"), said once per warning by the live region, meter `data-tone="warn"` |
| 2:50 elapsed | `data-phase="countdown"` and the remaining seconds said; at 3:00 the recording stops itself and saves as a tap would |
| Tab closed or app killed while recording | no row, no blob, no op exists (the commit happens only at stop), so nothing half-queued; chunks live in memory only |
| Audio row for a field, status `queued`, not uploaded, offline | status line step `saved`: "Áudio guardado, aguardando sinal" |
| `queued`, online | step `sending`: "Enviando" |
| `transcribing` | step `transcribing`: "Transcrevendo" (the field stays typeable throughout; no overlay, no lock) |
| `done` for the field | the text is already in the field by the server's put; below the field the `.audio-mark`: tag "Áudio", play, `Ver texto como falado` toggle (shows `transcript_heard`); `quality.verdict === 'poor'` adds the `.audio-note` "Áudio com ruído, confira o texto" (the kernel's `audioQualityNote` text for the note, copy the mock's sentence if different and say so) |
| User edits the field after arrival | mark reads "Áudio, editado" (`data-state="edited"`), play and heard text stay |
| `failed` / `dismissed` | e31c owns their lines; this batch renders nothing for `failed` and for `dismissed` renders nothing (do not invent) |
| Play, local copy present | plays from the Blob (object URL, revoked on stop/unmount), button toggles play/pause semantics via label |
| Play, blob evicted, online | `ensureLocalBlob` fetches from the server and plays |
| Play, blob evicted, offline | control `aria-disabled="true"` with the reason "Precisa de conexão para ouvir" |
| Sync pull brings N audios to `done` | toast "N áudios transcritos" once per sync (plural by kernel), action "Ver" opens the first (navigates to its field's surface and focuses it); audios the device held `done` at first look never toast (the `reading-arrivals` rule) |

## Kernel additions (small, pure, in `packages/domain/src/audio/`; unit tests "31.3-UNIT" / "31.4-UNIT", red first)

The thresholds and words live in the kernel; `apps/web` feeds numbers. Add, in new file `recording.ts` (exported by `index.ts`):

1. `AUDIO_RECORDING_LIMITS = { max_ms: 180000, countdown_from_ms: 170000, warning_hold_ms: 1500 }` (coordinator's first values).
2. `audioLiveWarning(window: { level; clipped_share; noise_ratio; low_level_ms; clipping_ms; noisy_ms })`: pure rule over the
   running measures, answering `null | 'low_level' | 'clipping' | 'noisy'` plus its sentence (`audioLiveWarningText`), using
   `AUDIO_QUALITY_THRESHOLDS` and `warning_hold_ms`; priority clipping, low_level, noisy. The web side only accumulates how
   long each condition has held and calls it.
3. `audioElapsedText(ms)` ("0:12", "2:50") and `audioCountdownText(ms)` (seconds left, from the countdown).
4. `audioFieldStatus(audio, { online, uploaded })`: for `queued` returns step `saved` (offline or not yet uploaded and offline) or
   `sending`; for `transcribing` returns step `transcribing`; `done`, `failed`, `dismissed` return null. Each carries its
   sentence ("Áudio guardado, aguardando sinal", "Enviando", "Transcrevendo"). Plus `audioEmptyText` ("Não ouvi nada, grave de novo").
5. `audioMarkOf(audio, currentFieldText)`: `{ tag: 'Áudio' | 'Áudio, editado', edited, poor, note }`; edited when the field's current
   text no longer contains the audio's written text (or heard text when written is null), compared trimmed.
6. `sameAudioTarget(a, b)` and `audioForTarget(files, target)`: the newest non-removed `done`-or-pending audio rows of one target (a
   field can hold several audios; the status line shows the newest pending, the mark the newest done).
7. `orderUploads` (`photos/upload-order.ts`): an `audio` kind ranks 0, with the files that wait for a reading, before other photos
   (by id order inside the rank: uuid v7 is time-ordered); extend its test.
8. Mic-refusal and wake-lock-free copy is web copy, not kernel.

## Web code map

- `apps/web/src/speech/recorder.ts`: pure + browser parts. `measureFrames(frames)` (pure): input is per-frame RMS, peak and
  clipped counts for a fixed frame length; output `AudioQualityMeasures` (`level` RMS of the voiced frames, `clipped_share`,
  `noise_ratio` = RMS of the quietest 20 percent of frames over the voice RMS, `duration_ms`, `speech_ms` = voiced frames time;
  voiced = frame RMS above max(0.015, 2 x noise floor)). `createRecorder(deps)` wraps `getUserMedia` (mono, echoCancellation and
  noiseSuppression off so the measures are honest), `MediaRecorder` (prefer `audio/webm;codecs=opus`, else `audio/mp4`), and an
  `AnalyserNode` or worklet sampled on `requestAnimationFrame`/timer outside React state (the meter updates a ref and a throttled
  state of 8 Hz; typing is never blocked). Deps injected (`getUserMedia`, `MediaRecorder`, `AudioContext`, clock) so unit tests
  use fake buffers: fixed sample buffers for good, quiet, clipped, noisy, silent; the limit and the countdown with a fake clock.
- `apps/web/src/speech/audio-session.tsx` (replaces `dictation.tsx`'s provider): `AudioRecorderProvider` (one recording
  app-wide; starting one stops the other; going offline does NOT stop it; unmount of the owner button stops and discards only if
  nothing was committed) and hooks `useAudioButton(target, { label })` returning `{ available, phase, elapsed, level, warning,
  toggle, refused }`, `useFieldAudio(target)` (live rows of the field: `status` line, `mark`, `transcriptHeard`, `play`),
  both exported for e31c and e31d to reuse. Wake lock: `navigator.wakeLock.request('screen')` when present, released at stop, never required.
- `apps/web/src/speech/audio-field.tsx`: components `AudioButton` (the `.audio-tools > .audio-rec > .audio-btn` markup of the mock;
  label "Gravar áudio: <field>" while idle and "Parar a gravação: <field>" while recording; `aria-pressed`), `AudioStatusLine`
  (`.audio-status data-step`), `AudioWarning` (`.audio-warning role="status"`), `AudioMark` (`.audio-mark`, `.audio-tag`, `.audio-play`,
  `.audio-dur`, `.audio-heard-toggle` with `aria-expanded`/`aria-controls`, `.audio-note`, `.audio-heard`), and one composite
  `AudioField({ target, label, text })` the surfaces drop under/beside a prose field. Do not render any `.ai-*` class or `.audio-failed`,
  `.audio-pending`, `.audio-src` (other batches).
- `apps/web/src/db/audio-commit.ts`: `commitAudioCapture(db, input, deps)` building the create draft (shape of `photoCreateDraft`:
  `mime` the recorder's, `size`, `sha256` of the bytes via the existing hashing helper, `audio_status: 'queued'`, `audio_target`,
  `quality`) and calling `commitFileBatch`; `useAudioRows(db, relatorioId)` live query over `entities` `file` rows parsed with
  `audioFileRowSchema`. Permission: the button shows only when the role may write the field (`audioPermissionPath` with the
  existing permission hook); a role without it gets the control disabled with its reason as the other controls do.
- Surfaces: replace each `DictationButton` and its "pending text then Usar" flow by `AudioField` on the six prose positions;
  delete `useProseDictation`, `DictatedSuggestion`, `SheetObservationDictationProvider`'s pending text and the `ui.dictation` strings;
  the audio's text now lands in the field through the server's put, so the surface needs no code to write it. Targets: NC item ->
  `{type:'item', block_id, item_key}`; Observações -> `{type:'sheet_field', field:'observations'}`; test reason -> `{type:'test_value',
  test_key, value_key}`; one photo caption -> `{type:'photo_caption', file_id}`; BATCH caption in `capture-sheet.tsx` is a caption for
  photos not yet committed: target the first photo's file id only if the batch has committed photos at that moment, else show the
  button disabled with the reason "Salve as fotos para gravar a legenda" (coordinator's reading, open to Matheus; say so in the PR);
  point text -> `{type:'point', point_id, field:'text'}`. A point or photo not yet saved has no id: same disabled rule.
- Measurement table (`ensaios-section.tsx`): story 31.5 (e31c) owns the table's audio. Smallest change that keeps `static` and existing
  specs green: remove the table's `DictationButton` (no button on tables in this batch), keep `DictatedMeasurementField` and
  `useTableDictation` compiling untouched; state it in the PR.
- Removals: `speech/webspeech-engine.ts`, `fake-engine.ts`, `engine.ts` (+ their tests), `VITE_SPEECH_ENGINE` in `docker-compose.yml`
  (line ~149), `.env.example`, `apps/api/Dockerfile.prod` (line 38: keep `VITE_APP_VERSION`), `apps/web/package.json` `build:e2e`,
  `scripts/speech-default.test.ts` (delete or replace by a test that the string `VITE_SPEECH_ENGINE` appears nowhere under tracked
  source), `e2e/support/speech.ts`. Strings "Ditado", "Ditar…", "Ouvindo…", "Usar" (dictation's) removed from every surface this
  batch touches; `grep -rn 'Dit[ae]\|Ouvindo' apps/web/src` must be empty except tests asserting absence. The stale
  `.dictation*` rules stay in `components.css` (copied unchanged).
- `app.tsx`: mount `AudioRecorderProvider` where `SpeechEngineProvider` was; mount the arrival toaster (`audio-arrivals.tsx`, modelled on
  `reading-arrivals.tsx`) beside the other watchers.
- Styles: copy mockups `tokens.css` and `components.css` unchanged into `apps/web/src/styles` (they differ only by the audio/ai
  sections); add `i-stop`, `i-play`, `i-alert` symbols (from `mockups/prototype/shell-head.html` lines 59-61, `<symbol>` verbatim) to
  `styles/sprite.svg` and their ids to `styles/sprite.test.ts`; any `.frame-*` rule of the new section gets its `app.css` translation per AGENTS.md "Mock container
  selectors" (the section is plain classes, so probably only layout of `.audio-tools` beside the field label per surface, in the surface's css).
- Strings: kernel for derived text (above); `copy/ui.ts` `audio` block for component chrome ("Gravar áudio: …", "Parar a gravação: …",
  "Gravando", the refusal explanation "O microfone está bloqueado. Permita o microfone nas configurações do navegador e toque de
  novo.", "Precisa de conexão para ouvir", "Ver texto como falado", "Ouvir o áudio", "Texto como falado", the arrival toast action "Ver"),
  `pt-br.ts` for per-surface labels of the field ("observação do item N", "observações", "motivo", "legenda", "texto do ponto"). Each
  authored sentence marked `// authored (Story 31.x, listed for Bruno)`; list them all in the PR body.
- Usage events (AD-28): record, transcript arrived, play: only if an events helper exists with closed values (grep `ux-events-store`);
  closed values only, never audio or text; if adding needs a new contract value, skip and list it as a narrowing.

## Acceptance criteria

1. Given a prose position of the six and a role that may fill it, when it renders with or without signal, then the 48 px round audio
   button shows with the label naming the field; given no `MediaRecorder`, then no button element.
2. Given the mic refused at the first tap, then the button stays, the explanation is announced and shown, and nothing is stored (no row, no blob, no outbox op).
3. Given a recording, then the button is pressed ("Gravando", elapsed, meter moving with the voice), another recording stops first, and
   a second tap ends it.
4. Given quiet, clipped or noisy input held longer than `warning_hold_ms`, then one warning sentence shows and is said once.
5. Given 2:50, then the countdown shows; given 3:00 then the recording ends itself and saves.
6. Given a stop with speech, then ONE transaction holds the audio create op (with `audio_target` and the kernel's `quality`) and the blob, the
   field shows "Áudio guardado, aguardando sinal" offline or "Enviando" online; given `too_short` or `no_speech`, then nothing is stored
   and the field says "Não ouvi nada, grave de novo".
7. Given the upload queue, then audios sort with the reading-waiting files before other photos (kernel test).
8. Given a closed tab or killed app mid-recording, then on reopen no audio row, blob or op exists.
9. Given the server writes the transcript (sync pull), then the field shows the text with the mark "Áudio", play and "Ver texto como
   falado" (opens the heard text); a poor recording adds the note; the toast "N áudios transcritos" appears once per sync and "Ver"
   opens the first.
10. Given text typed while the audio was pending, then the transcript is after it and the typed text is untouched (the server's put, asserted on the screen's value).
11. Given a photo whose caption is still the automatic one, then the written text replaces it.
12. Given the user edits the text of an audio, then the mark reads "Áudio, editado" and play and "Ver texto como falado" still work.
13. Given an evicted blob, then play streams from the server online and is disabled with "Precisa de conexão para ouvir" offline.
14. Given the surfaces of this batch, then no "Ditado", "Ditar", "Ouvindo…" or dictation "Usar" remains, and axe is clean on the
    touched surfaces' new elements (`@axe-core` helper the repo's specs use).
15. Given the code base, then `webspeech-engine.ts`, `fake-engine.ts`, `engine.ts` and `VITE_SPEECH_ENGINE` are gone from source, compose,
    `.env.example`, `Dockerfile.prod`, `build:e2e` and `e2e/support/speech.ts`.

## Tests (red first where it is logic)

- Kernel: "31.3-UNIT-001..n" (limits, live warning boundaries at zero, equal-to-threshold and one over, texts, status steps, mark, sameAudioTarget, orderUploads).
- Web: "31.3-WEB-001..n": `measureFrames` on fixed buffers (good, quiet, clipped, noisy, silent, short); recorder with fake deps (start, stop,
  refuse, limit and countdown with fake clock, other recording stops first, no row when stop yields too_short); `AudioField` states and
  announcements; `commitAudioCapture` writes op + blob in one transaction (fake-indexeddb) and a failing blob put leaves no op;
  "31.4-WEB-001..n": mark states, heard toggle, play disabled offline, arrival toast once per sync, typed-text-kept display, edited mark.
- E2E (`desktop-chrome` and `durability-desktop-chrome`, new `e2e/audio-recording.spec.ts`; helper `e2e/support/audio.ts`): the seam is a
  `getUserMedia` override installed by `context.addInitScript`: it returns a `MediaStream` from a Web Audio graph (oscillator through a gain,
  plus a noise source through a second gain) and exposes `window.__voice.set({ level, noise })`, so the whole real pipeline (MediaRecorder,
  analyser, measures) runs with no microphone; a second mode rejects `NotAllowedError`. Specs: "31.3-E2E-001" `@p0`
  record offline with the seam on an NC observation: assert IndexedDB holds the `file` entity (kind audio, status queued, target equals the item, quality
  verdict good), the Blob (size > 0, mime audio/*), the outbox create op, and the status line "Áudio guardado, aguardando sinal"; "-002" `@p0` mic
  refused: explanation shown, no op, no blob; "-003" `@p1` quiet then loud input shows each warning; "-004" `@p1` recording of silence saves
  nothing and says "Não ouvi nada, grave de novo"; "31.4-E2E-001" `@p0` record offline, go online, sync, the text
  "Equipamento verificado, sem anomalias aparentes." is in the NC observation with the mark "Áudio" and heard text
  "equipamento verificado sem anomalias aparentes" (fake STT default, no server seeding); "-002" `@p1` caption replaced (photo with its automatic caption);
  "-003" `@p1` typed text kept and transcript added after it; "-004" `@p1` a recorded audio on the ficha Observações and on the point text lands the same way;
  an axe check on the audio states. Timing-sensitive waits use `expect.poll`, never fixed sleeps; a spec that times a tap against a render goes in `SERIAL_SPECS`
  (`scripts/e2e.test.ts` fails otherwise). `e2e/dictation.spec.ts` is deleted, each of its criteria mapped in the PR to the spec that replaced it or
  to "removed with the engine"; `e2e/ai-features-off.spec.ts` dictation lines rewritten (with AI features off the audio button... reading `AI_FEATURES`: the
  job does not run, so the button hides when the session says AI features are off, same rule as the reading buttons: confirm with
  `state/ai-features.tsx` and say what was chosen). Grep `e2e/` and `apps/web/src` for each string and behaviour changed (`Ditar`, `Ouvindo`, `dictation`,
  `__fakeSpeech`, `speak(`) and list the grep and hits in the PR.
- The recorder touches no op fold, commit path or ficha live query beyond adding a new `commitAudioCapture` caller of `commitFileBatch` (unchanged); no matrix run.

## Real-browser pass

At 390, 768 and 1280 px plus one dialog (the batch caption sheet or point editor), at most six screenshots under
`_bmad-output/test-artifacts/manual/e31b/`, compared with `62-audio-estados.html` (recording, warning, status line, mark, edited, poor note). Fix what differs;
amend the mock or `EXPERIENCE.md` with a dated line if the build departs.

## Wiring owners

Table audio and review, failed/dismissed lines, pending hold on ficha/emission/Sync status: e31c (Stories 31.5, 31.6), each with a `deferred-work.md`
row. AI control and the fields without a mic: e31d. Nothing in this batch is left for a later one except those.
