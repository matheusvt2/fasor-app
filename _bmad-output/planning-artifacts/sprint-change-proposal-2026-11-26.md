# Sprint change proposal: fill the relatório by voice, Epic 31 (2026-11-26)

Prepared in the correct-course workflow on 2026-11-26, in batch mode. Bruno asked, through Matheus, how the relatório could be filled by voice. The direction is to make the user's work easier everywhere, because speaking is easier than typing, and to keep the audio when the device is offline so it is processed once there is signal. Matheus decided the main points the same day, in conversation. This proposal records them and turns them into Epic 31. Status: **approved by Matheus on 2026-11-26; Epic 31 is written in `epics.md`.**

## 1. Issue summary

### What exists today

- Story 9.4 (PR #58) built a Dictation button and wired it into seven places. In production none of them shows: the build carries `VITE_SPEECH_ENGINE=none` (`apps/api/Dockerfile.prod`).
- The engine behind it is the browser's Web Speech API. It works only with signal, sends the audio to the browser vendor, keeps no audio and gives no measure of quality.
- Every result is a Suggestion the user accepts with "Usar".
- Story 13.9 ("Dictation on, behind one line of consent") was deferred on 2026-10-21 (Bruno, answer 11) and sits in the backlog with its Definition of Ready open.
- `SPEC.md` and `source-deltas.md` row 37 say dictation is online-only and hidden offline.

### Where the user types text

| Where | Field | Mic today |
| --- | --- | --- |
| Ficha | NC item observation | wired, hidden |
| Ficha | Observações of the conclusion | wired, hidden |
| Ficha | Measurement table readings | wired, hidden |
| Ficha | Reason on a measurement test | wired, hidden |
| Photos | Caption, one photo and a batch | wired, hidden |
| Points | Point text | wired, hidden |
| Ficha | "Não ensaiado" reason and note | none |
| Ficha | Texto da conclusão; parecer summary | none |
| Relatório | Section texts (long, rich text) | none |
| Setup | Capa, escopo, additional items, local names, TAGs | none |
| Ficha | Nameplate, header parameters, manufacturer | none (the plate photo covers them) |
| Registries, templates, users, login | office work | not a candidate |

### Matheus's decisions (2026-11-26)

1. **One engine, ours.** The device records, the audio goes up through the file queue, a backend job transcribes it. The browser engine is removed.
2. **No seams.** One gesture: tap the mic, speak, tap again. The user chooses nothing. It works the same with and without signal; without signal the audio is kept on the device and processed when signal returns. The user is only told the processing status.
3. **Prose goes straight into the field.** No "Usar" tap. The field carries the mark "Áudio" and a play button.
4. **Measurement readings are the exception.** A spoken reading is shown on screen for review before it counts. The table keeps accepting a reading from an image ("Ler visor") as today.
5. **The word is "Áudio"**, never "Ditado".
6. **A pending audio holds the ficha.** A ficha with an audio not yet transcribed stays pending, and so does emission.
7. **The audio is kept.** Audio and its quality measures are stored for later analysis and never deleted.
8. **Audio quality is measured on the device, by fixed rules,** while the user speaks: low level, clipping, background noise against the voice, too short or no speech. A warning shows live; a poor recording leaves a "confira o texto" note on the field.
9. **No field test first.** Build, use, improve.
10. **Cost accepted.** Amazon Transcribe, a few cents per relatório; the exact price is confirmed in the story that turns it on.
11. **A line about stored voice** on the Conta screen (accepted with "o resto tá ok").

### Approval and additions (2026-11-26, later)

Matheus approved the proposal and the six points of section 6 ("aprovado, os 6 pontos ok, pode seguir"), and added:

12. **The photo caption stays automatic,** written from the photo's content, and the user may record an audio to overwrite it.
13. **A model reviews every text that comes from audio,** to polish it and improve the writing. The text is not always wanted word for word. The prompt carries the field's context, most of all for a conclusion of the relatório.
14. **A standard AI control** (the sparkles icon, `i-sparkles`, already in the sprite) that writes content from the audio or from the text already in the field.

~~How 13 and 14 are built (the coordinator's rethink, section 4.7) waits for his word.~~ *(2026-11-26, later still: Matheus accepted section 4.7 with two answers.)*

15. **The composed conclusion text and parecer summary are rewritten by a model only when the user asks** ("sim, somente se o usuario pedir"): by recording an audio into the field or tapping the AI control.
16. **The AI control needs signal.** Without it the control is there, disabled, and tells the user the reason is the connection. Only audio has an offline queue. This replaces "it is hidden" in section 4.7.

Epic 31, Stories 31.1 to 31.9, was written in `epics.md` the same day, with the `source-deltas.md` rows, the `SPEC.md` lines and the `sprint-status.yaml` keys. AD-30 and the mocks come before wave 1.

## 2. Impact analysis

### Epic impact

- **New Epic 31.** No open epic changes.
- **Epic 9, Story 9.4 (done):** its engine and its "always a Suggestion" rule are replaced for prose. The kernel parser (`parse/utterance.ts`) and the seven button positions are reused.
- **Backlog, Story 13.9:** superseded. Its consent question was about audio going to the browser vendor; that no longer happens.

### Artifact conflicts

| Document | What it says | What changes |
| --- | --- | --- |
| `SPEC.md` assumptions | Dictation is online-only; the control is hidden offline | Audio is recorded offline and transcribed later |
| `source-deltas.md` rows 17, 37, 40, 113 | Online-only; 13.9 deferred | New row: this proposal overrides them |
| `epics.md` FR-40 | Device speech engine; result always a Suggestion; hidden offline | Rewritten (struck through, new text beside it) |
| `epics.md` FR-41 | Nothing unconfirmed is written | Exception: transcribed prose is written, marked "Áudio". Readings keep the contract |
| `epics.md` FR-42 | Offline queue for assist photos | Extended to audio |
| `EXPERIENCE.md` Dictation button, Observation field, Suggestion field, State Patterns | "Ouvindo…", result is a suggestion | New states and words (section 4.5) |
| `DESIGN.md`, mockups | Dictation button | Recording state, level meter, "Áudio" mark, play button |
| Architecture spine | AD-7 file kinds; AD-12 Suggestion source is a photo; AD-14 reading pipeline | New AD-30 |

### Technical impact

- **Kernel and contract:** a new file kind `audio` with its target field, transcription status, transcript and quality measures; a Suggestion may name an audio as its source; the rule "this ficha has a pending audio" lives in `packages/domain` (AD-13). Contract version goes from 61 to 62.
- **Web:** `apps/web/src/speech/` is rewritten around a recorder (MediaRecorder, Web Audio for the measures). The format differs by browser (WebM/Opus on Chrome, MP4/AAC on Safari); the server accepts both. Audio rides the existing file upload queue, ahead of ordinary photos.
- **API:** a `transcription` pg-boss job, one per audio, three attempts. Provider behind `STT_PROVIDER` (`fake` by default, `transcribe` in production), under the same `AI_FEATURES` switch. Each run is recorded with provider, duration and cost, like `reading_run`.
- **Infra:** Amazon Transcribe permissions, a custom vocabulary for the trade's words, and the cost row, all in Terraform. Transcribe reads the audio from S3, where the file already is.
- **Tests:** the `fake` web engine goes; Playwright drives the recorder through a test seam and the `fake` provider replays fixed transcripts.
- **Storage:** speech at Opus bitrates is about 0.2 MB per minute; kept forever, it stays far below the photo volume.

## 3. Recommended approach

Direct adjustment: one new epic, built on what Story 9.4 and the photo reading pipeline already give. No rollback, no scope cut.

- **Effort:** eight stories in three waves.
- **Risk:** medium. Substation noise and the trade's vocabulary will hurt transcription; the quality measures, the kept audio and the "Áudio" mark are the answer, and decision 9 accepts tuning in use. A wrong digit in a reading is the serious case, and decision 4 keeps the review for it.
- **Not in this epic:** speaking a whole ficha in one recording and letting a model spread it over the fields ~~; a model pass that rewrites the transcript. Both can come later, on the stored audio.~~ *(2026-11-26, later, decision 13: the model pass is in the epic, section 4.7.)* It can come later, on the stored audio.

## 4. Detailed change proposals

### 4.1 Stories (new, `epics.md` § Epic 31)

The full text of each story (acceptance criteria, definition of ready, definition of done) is written by John in `epics.md` after this proposal is approved.

**Epic 31: The relatório filled by voice: one tap to speak, the audio kept, the text arrives by itself.**

| Story | What it delivers | Dev model · Effort |
| --- | --- | --- |
| 31.1 Audio is a file with a target, a status and its measures | Kernel and contract 62: file kind `audio`, target field, status, transcript, quality measures; Suggestion source may be an audio; the status words and the "pending audio" rule in the kernel | opus · high |
| 31.2 The server transcribes an audio and fills its field | The `transcription` job, `STT_PROVIDER` with the `fake` provider, the run record; prose written as an op marked audio, a reading emitted as a pending Suggestion | opus · high |
| 31.3 One tap records, measures and keeps the audio | Mock first; the recorder replaces the browser engine; live level and noise measures with the warning; audio saved on the device and queued; the mic shows with or without signal | opus · high |
| 31.4 The text lands in the field, marked "Áudio" | The six prose fields already wired; status line per field; play button; "confira o texto" on a poor recording; the Conta line about stored voice | sonnet · high |
| 31.5 A spoken reading waits for review | Measurement table: the reading shows as a Suggestion to confirm; "Ler visor" unchanged | opus · medium |
| 31.6 A pending audio holds the ficha and the emission | Ficha and pre-issue counts; Sync status counts audios waiting and failed; the failed state and its way out | opus · medium |
| 31.7 The mic on the fields that lack it | "Não ensaiado" reason, Texto da conclusão and parecer, section texts, setup texts | sonnet · medium |
| 31.8 Amazon Transcribe in production | Terraform (permissions, custom vocabulary), cost row against the USD 100 ceiling with the confirmed price, the flag turned on, a first check in production | opus · medium |

**Waves.** Wave 1: 31.1, 31.2, 31.3. Wave 2: 31.4, 31.5, 31.6. Wave 3: 31.7, 31.8. The feature is usable in production only after 31.8.

### 4.2 `source-deltas.md`

One new row: rows 17, 37 and 40 (online-only, hidden offline, caption first) and row 113 (13.9 deferred) are overridden by this proposal; audio is recorded with or without signal and transcribed by the backend; Story 13.9 is superseded by Epic 31.

### 4.3 PRD and SPEC

- `SPEC.md`: the two dictation lines in the assumptions are struck through, the new text beside them; a new capability line for voice input.
- `epics.md`: FR-40 rewritten; FR-41 gains the prose exception; FR-42 extended to audio; UX-DR18 rewritten. `prd.md` is not edited; `source-deltas.md` carries the override.

### 4.4 Architecture

New **AD-30, voice input**: the audio file and its fields; the transcription job and provider interface; prose written by a system op marked with its audio, readings as Suggestions; the kernel owns status words and the pending rule; audio is never purged. Winston writes it before Wave 1 starts.

### 4.5 UX

`EXPERIENCE.md` and the mockups gain, under Sally:

- The audio button and its recording state with the level meter and the live warning.
- The field states, in the user's words (strings to be reviewed by Bruno): "Gravando", "Áudio guardado, aguardando sinal", "Transcrevendo", the "Áudio" mark with play, "Áudio com ruído, confira o texto", "Não foi possível transcrever".
- The measurement table's review of a spoken reading.
- The pending-audio line on the ficha, the pre-issue list and Sync status.

### 4.6 Knowledge base

`docs/kbs`: `architecture/suggestions-and-reading.md`, `architecture/files-and-photos.md`, `code/web-app.md`, `planning/epics-map.md` and `log.md`, in the change that alters each source.

### 4.7 The model's part (decisions 13 and 14, proposed 2026-11-26)

**Two levels of writing, chosen by the field, never by the user.**

| Level | Fields | What the model does |
| --- | --- | --- |
| Polish | Photo caption, NC observation, test reason, "Não ensaiado" reason, point text | Punctuation, agreement, the trade's words spelled right, filler words removed. Same content, same length |
| Report writing | Ficha Observações, Texto da conclusão, parecer summary, section texts | Rewrites what was said as report prose, with the field's context in the prompt |

**Context in the prompt.** Every call names the field, the equipment type and its TAG. A checklist observation adds the item's text and its answer. A ficha conclusion adds the result the engineer picked, the NC items and the readings outside their criterion. The parecer adds the relatório's counts and restrictions.

**What the model may never do.**

- Decide or change a result (Conforme, Com restrições, Reprovado). That stays the engineer's.
- Add a fact that was not said or is not in the context.
- Change a number, a unit or a TAG. A fixed check compares them with the transcript and the context; if one differs, the field receives the transcript as heard.
- Touch a measurement reading. Those keep the review of decision 4.

**It runs by itself after the transcription,** in the same job, so the user still does one gesture. The text as heard and the audio are both kept; the field's "Áudio" mark opens them.

**The AI control (sparkles).** One button, on every prose field that holds text, typed or from audio. One tap rewrites the text in the field at the report-writing level, with the same context and the same limits. The new text replaces the old one with "Desfazer" beside it. It needs signal; ~~without signal it is hidden.~~ *(decision 16: without signal it is shown disabled with its reason.)*

**What this overrides.** NFR-12 says the conclusion text, the parecer summary and the context captions are computed on the device, never by a model. With decisions 13 and 14 the composed text stays as the starting point and a model may rewrite it when the user speaks or taps the AI control. A `source-deltas.md` row records it.

**Stories.** 31.2 gains the writing step (the existing `ProseProvider` on Bedrock, `LLM_PROVIDER=fake` by default) and the number check in the kernel. A new **Story 31.9, "The AI control rewrites the text in the field"** (opus · medium), joins Wave 3. Story 31.7 carries the conclusion and parecer context.

**Cost.** One short model call per audio or per tap, on the model the captions already use: a fraction of a cent each.

## 5. Implementation handoff

Scope: **major** (new capability, new architecture decision, a changed contract rule).

1. John: Epic 31 and its stories in `epics.md`, the `source-deltas.md` row, the FR edits.
2. Winston: AD-30.
3. Sally: the mock and `EXPERIENCE.md` changes, before Story 31.3.
4. Amelia: the stories, by wave, one batch and one PR per wave where kernel and screen work do not collide.

Success: on Bruno's tablet, with no signal, a user taps the mic on an NC observation, speaks and moves on; when signal returns the text is in the field marked "Áudio", the ficha stops being pending, and the audio can be played back.

## 6. Open items

### For Matheus

1. **Text already in the field.** Proposed: the transcript is added after the existing text and never replaces what was typed. The one exception is a photo caption still holding the automatic context caption, which the transcript replaces.
2. **Speech in a measurement table that is not a reading.** Story 9.4 sent it to the ficha's Observações as a suggestion. Proposed: it goes to Observações as "Áudio" text, and the table says so.
3. **Failed transcription.** Proposed: after three attempts the field shows "Não foi possível transcrever" with "Tentar de novo" and "Dispensar"; a dispensed audio stops holding the ficha and stays stored.
4. **Longest recording.** Proposed: three minutes, with a visible countdown in the last seconds.
5. **Texto da conclusão.** That text is composed on the device from the ficha's values (NFR-12). Proposed: audio there works as "Editar", adding to the composed text, never replacing the composition rule.
6. **Wording of the Conta line** about stored voice.

### For Bruno (through Matheus)

1. The words on screen (section 4.5).
2. A list of the trade's words and instrument names for the custom vocabulary.
3. The tablet's model and browser, to check the recording format.

## Checklist record

- [x] 1 Trigger and context: a new request from the stakeholder, not a defect; evidence is section 1.
- [x] 2 Epic impact: one new epic; 9.4 reused; 13.9 superseded.
- [x] 3 Artifact conflicts: SPEC, source-deltas, FR-40 to FR-42, EXPERIENCE, DESIGN, mocks, spine (section 2).
- [x] 4 Path forward: direct adjustment (section 3).
- [x] 5 Proposal components: sections 1 to 5.
- [x] 6 Final review and handoff: approved by Matheus on 2026-11-26 with the six points of section 6; the items for Bruno stay open.
