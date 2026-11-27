import { audioCountdownText, audioElapsedText, audioLiveWarningText, quotaExceededText, type AiCompareBlock, type AiComparison, type AudioTarget } from '@app/domain';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { ui } from '../copy/ui.ts';
import { spriteHref } from '../styles/sprite.ts';
import {
  isQuotaExceeded,
  useAiWriteControl,
  useAudioButton,
  useAudioRecording,
  useFieldAudio,
  useHeldAudioControls,
  type AiWriteControlState,
  type AudioButtonState,
  type HeldAudioState,
} from './audio-session.tsx';

/*
 * Stories 31.3 and 31.4 (AD-30; `components.css` "Audio button", `62-audio-estados.html`): the
 * pieces a prose field draws for its audio, with the mock's class names. `AudioButton` is the
 * 48 px round toggle (`.audio-rec > .audio-btn` with "Gravando", the time and the five-bar meter
 * while it records); `AudioStatusLine` the field's status line; `AudioWarning` the live warning;
 * `AudioMark` the mark of a text that came from an audio ("Áudio", play, "Ver texto como falado",
 * the note of a poor recording). `AudioField` composes them under a field; a surface whose button
 * sits on its own row (the NC row's `.row-wrap`, the batch caption, a section head) draws
 * `AudioButton` there and `AudioFieldLines` under the field. The field itself stays typeable
 * throughout: no overlay, no lock. Story 31.6: `AudioFailedLine` is the failed state after three
 * attempts (`.audio-failed`: "Não foi possível transcrever", play, "Tentar de novo" with signal,
 * "Dispensar"), and a dismissed audio keeps a mark of its own (`.audio-mark[data-state=dismissed]`).
 * Story 31.9: the AI control (`.ai-write` beside the Audio button in `.audio-tools`, the mock's (f))
 * and its line above the tools (`.ai-done` with "Desfazer", `.ai-error`), on every field that holds text.
 * Story 31.10 (2026-11-27) replaces the button on its own row and `AudioFieldLines`: every prose field draws
 * `AudioField` right after its input: the field bar (`.field-tray`, the mock's (h)), with the audio control
 * at its start and the AI control at its end, the AI's proposal compared before anything is written, and
 * a refusal's reason (`.ai-reason`). Only the Measurement table keeps the round `AudioButton`.
 */

function Icon({ id, className = 'ico' }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={spriteHref(id)} />
    </svg>
  );
}

/**
 * The 48 px round Audio button (`.audio-rec`); nothing when the browser cannot record or the server would not
 * transcribe. Story 31.10: only the Measurement table's action row draws it; a prose field draws the field bar.
 */
export function AudioButton({
  target,
  label,
  disabledReason = null,
  wrap,
}: {
  target: AudioTarget | null;
  label: string;
  disabledReason?: string | null;
  /** The class of a `div` around the button, drawn only with it. */
  wrap?: string;
}) {
  const state = useAudioButton(target, { label, disabledReason });
  const reasonId = useId();
  if (!state.available) return null;
  const recording = state.phase === 'recording' || state.phase === 'countdown';
  const countdown = state.phase === 'countdown';
  const disabled = state.disabledReason !== null;
  const body = (
    <>
      <span className="audio-rec" data-phase={countdown ? 'countdown' : undefined}>
        <button
          type="button"
          className="audio-btn"
          aria-pressed={recording}
          aria-label={state.label}
          aria-disabled={disabled || undefined}
          aria-describedby={disabled ? reasonId : undefined}
          aria-busy={state.phase === 'starting' || undefined}
          onClick={state.toggle}
        >
          <Icon id="i-mic" className="ico ico-mic" />
          <Icon id="i-stop" className="ico ico-stop" />
        </button>
        <span className="audio-live" aria-hidden="true">
          <span className="audio-rec-word">{countdown ? ui.audio.countdown : ui.audio.recording}</span>
          <span className="audio-time">{countdown ? audioCountdownText(state.elapsedMs) : audioElapsedText(state.elapsedMs)}</span>
          <span className="audio-meter" data-level={state.level} data-tone={state.warning === null ? undefined : 'warn'}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </span>
      {disabled ? (
        <span className="btn-reason" id={reasonId}>
          {state.disabledReason}
        </span>
      ) : null}
    </>
  );
  return wrap === undefined ? body : <div className={wrap}>{body}</div>;
}

/**
 * Story 31.10 (`components.css` "Field bar", `62-audio-estados.html` (h)): the bar's audio control, Text-button-shaped
 * at the bar's start: the mic glyph and "Gravar áudio"; recording, the stop glyph on a `primary` round and "Parar",
 * then "Gravando", the time and the meter (the countdown as the round button). Its name is the round button's.
 */
function BarAudioButton({ state }: { state: AudioButtonState }) {
  const reasonId = useId();
  const recording = state.phase === 'recording' || state.phase === 'countdown';
  const countdown = state.phase === 'countdown';
  const disabled = state.disabledReason !== null;
  return (
    <>
      <span className="audio-rec" data-phase={countdown ? 'countdown' : undefined}>
        <button
          type="button"
          className="audio-btn"
          aria-pressed={recording}
          aria-label={state.label}
          aria-disabled={disabled || undefined}
          aria-describedby={disabled ? reasonId : undefined}
          aria-busy={state.phase === 'starting' || undefined}
          onClick={state.toggle}
        >
          <span className="audio-glyph">
            <Icon id="i-mic" className="ico ico-mic" />
            <Icon id="i-stop" className="ico ico-stop" />
          </span>
          <span className="audio-word">{ui.audio.barRecord}</span>
          <span className="audio-stop-word">{ui.audio.barStop}</span>
        </button>
        <span className="audio-live" aria-hidden="true">
          <span className="audio-rec-word">{countdown ? ui.audio.countdown : ui.audio.recording}</span>
          <span className="audio-time">{countdown ? audioCountdownText(state.elapsedMs) : audioElapsedText(state.elapsedMs)}</span>
          <span className="audio-meter" data-level={state.level} data-tone={state.warning === null ? undefined : 'warn'}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </span>
      {disabled ? (
        <span className="btn-reason" id={reasonId}>
          {state.disabledReason}
        </span>
      ) : null}
    </>
  );
}

/**
 * Story 31.9: the AI control's button (`.ai-write > .ai-btn`, 48 px, the sparkles glyph and its label); nothing when
 * not shown. Story 31.10: in the field bar its disabled reason is the bar's own line (`.field-bar > .btn-reason`),
 * under the row, so the two controls keep their row.
 */
export function AiWriteButton({ state, label }: { state: AiWriteControlState; label: string }) {
  const reasonId = useId();
  if (!state.shown) return null;
  const disabled = state.disabledReason !== null;
  return (
    <>
      <span className="ai-write">
        <button
          type="button"
          className="ai-btn"
          aria-label={state.retry ? ui.aiWrite.retryName(label) : ui.aiWrite.name(label)}
          aria-busy={state.busy || undefined}
          aria-disabled={disabled || undefined}
          aria-describedby={disabled ? reasonId : undefined}
          onClick={state.tap}
        >
          <Icon id="i-sparkles" />
          {/* Story 31.10: "Tentar de novo" after a refusal a new tap can help. */}
          <span className="ai-word">{state.retry ? ui.aiWrite.retry : ui.aiWrite.label}</span>
          <span className="ai-busy-word">{ui.aiWrite.busy}</span>
        </button>
      </span>
      {disabled ? (
        <span className="btn-reason" id={reasonId}>
          {state.disabledReason}
        </span>
      ) : null}
    </>
  );
}

/**
 * Story 31.9: the AI control's line above the bar: "Texto melhorado por IA" with "Desfazer". Story 31.10: or the
 * refusal, one line in two parts (`.ai-reason`: what happened to the text, then why), the kernel's sentences.
 */
export function AiWriteLine({ state, label }: { state: AiWriteControlState; label: string }) {
  if (state.done) {
    return (
      <p className="ai-done" role="status">
        <Icon id="i-sparkles" />
        {ui.aiWrite.done}
        <button type="button" className="btn btn-text" aria-label={ui.aiWrite.undoName(label)} onClick={state.undo}>
          {ui.aiWrite.undo}
        </button>
      </p>
    );
  }
  if (state.refusal !== null) {
    return (
      <p className="ai-reason" role="status">
        <span className="ai-reason-what">{state.refusal.what}</span> <span className="ai-reason-why">{state.refusal.why}</span>
      </p>
    );
  }
  return null;
}

/** Story 31.10: one side's blocks: paragraphs as `p`, list items gathered in their `ul` or `ol`, changed runs in `mark.ai-changed`. */
function CompareBlocks({ blocks }: { blocks: readonly AiCompareBlock[] }) {
  const groups: { kind: AiCompareBlock['kind']; items: AiCompareBlock[] }[] = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    if (block.kind !== 'paragraph' && last !== undefined && last.kind === block.kind) last.items.push(block);
    else groups.push({ kind: block.kind, items: [block] });
  }
  const runs = (block: AiCompareBlock) =>
    block.segments.map((segment, at) =>
      segment.changed ? (
        <mark key={at} className="ai-changed">
          {segment.text}
        </mark>
      ) : (
        <Fragment key={at}>{segment.text}</Fragment>
      ),
    );
  return (
    <div className="ai-side-text">
      {groups.map((group, at) => {
        if (group.kind === 'paragraph') return <p key={at}>{runs(group.items[0]!)}</p>;
        const items = group.items.map((item, index) => <li key={index}>{runs(item)}</li>);
        return group.kind === 'numbered' ? <ol key={at}>{items}</ol> : <ul key={at}>{items}</ul>;
      })}
    </div>
  );
}

/** Story 31.10: the comparison (`.ai-compare`): "Seu texto" and "Texto proposto pela IA" side by side (stacked on the phone, the user's first). */
function AiCompare({ comparison }: { comparison: AiComparison }) {
  return (
    <div className="ai-compare">
      <section className="ai-side" aria-label={ui.aiWrite.mine}>
        <p className="ai-side-title">{ui.aiWrite.mine}</p>
        <CompareBlocks blocks={comparison.mine} />
      </section>
      <section className="ai-side" data-side="ai" aria-label={ui.aiWrite.proposed}>
        <p className="ai-side-title">{ui.aiWrite.proposed}</p>
        <CompareBlocks blocks={comparison.proposed} />
      </section>
    </div>
  );
}

/** The live warning under the field while a condition holds (`.audio-warning`, a polite status). */
export function AudioWarning({ target }: { target: AudioTarget | null }) {
  const { warning, refused, failed, unsaved } = useAudioRecording(target);
  return (
    <>
      {warning === null ? null : (
        <p className="audio-warning" role="status">
          <Icon id="i-alert" />
          {audioLiveWarningText(warning)}
        </p>
      )}
      {/* The microphone refused (or failed): the button stays and this says how to allow it (announced by the provider). e31f: or the recording could not be kept. */}
      {refused || failed || unsaved ? <p className="camera-denied audio-refused">{refused ? ui.audio.refused : failed ? ui.audio.failed : ui.audio.saveFailed}</p> : null}
    </>
  );
}

/** The field's status line (`.audio-status`): saved, sending, transcribing, or nothing heard. */
export function AudioStatusLine({ target, text }: { target: AudioTarget | null; text: string | null | undefined }) {
  const { status, statusAudioId } = useFieldAudio(target, text);
  if (status === null) return null;
  return (
    <p className="audio-status" data-step={status.step} data-audio-id={statusAudioId ?? undefined}>
      <Icon id="i-mic" />
      {status.text}
    </p>
  );
}

/** The mark of a field whose text came from an audio (`.audio-mark`). */
export function AudioMark({ target, text, label }: { target: AudioTarget | null; text: string | null | undefined; label: string }) {
  const audio = useFieldAudio(target, text);
  const heardId = useId();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  // EXPERIENCE.md › Text from audio: "Texto do áudio chegou: ⟨campo⟩" when an audio seen on its way here lands.
  const waited = useRef<string | null>(null);
  const pendingId = audio.status !== null && audio.status.step !== 'empty' ? 'pending' : null;
  const doneId = audio.done?.row.id ?? null;
  const announce = audio.announce;
  const seenDone = useRef<string | null>(doneId);
  useEffect(() => {
    if (pendingId !== null) waited.current = 'pending';
    if (doneId !== null && doneId !== seenDone.current) {
      if (waited.current !== null) announce(ui.audio.arrived(label));
      waited.current = null;
    }
    seenDone.current = doneId;
  }, [pendingId, doneId, announce, label]);
  if (audio.dismissed !== null) return <DismissedMark held={audio.dismissed} />;
  if (audio.done === null) return null;
  const { mark, duration } = audio.done;
  const playLabel = audio.playing ? ui.audio.pause(duration) : ui.audio.play(duration);
  const disabled = audio.playDisabledReason !== null;
  return (
    <div className="audio-mark" data-audio-id={audio.done.row.id} data-quality={mark.poor ? 'poor' : undefined} data-state={mark.edited ? 'edited' : undefined}>
      <span className="audio-tag">
        <Icon id="i-mic" />
        {mark.tag}
      </span>
      <button
        type="button"
        className="audio-play"
        aria-label={playLabel}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        onClick={audio.play}
      >
        <Icon id="i-play" />
        <span className="audio-dur">{duration}</span>
      </button>
      <button type="button" className="btn btn-text audio-heard-toggle" aria-expanded={open} aria-controls={heardId} onClick={() => setOpen((was) => !was)}>
        {ui.audio.heardToggle}
      </button>
      {disabled ? (
        <span className="btn-reason" id={reasonId}>
          {audio.playDisabledReason}
        </span>
      ) : null}
      {mark.note === null ? null : (
        <p className="audio-note">
          <Icon id="i-alert" />
          {mark.note}
        </p>
      )}
      <p className="audio-heard" id={heardId} hidden={!open}>
        <span className="audio-heard-label">{ui.audio.heardLabel}</span>
        {audio.transcriptHeard ?? ''}
      </p>
    </div>
  );
}

/** Story 31.6: play of an audio that failed or was dismissed (`.audio-play`), with its reason when it cannot play here. */
function HeldPlay({ held }: { held: HeldAudioState }) {
  const reasonId = useId();
  const disabled = held.playDisabledReason !== null;
  return (
    <>
      <button
        type="button"
        className="audio-play"
        aria-label={held.playing ? ui.audio.pause(held.duration) : ui.audio.play(held.duration)}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        onClick={held.play}
      >
        <Icon id="i-play" />
        <span className="audio-dur">{held.duration}</span>
      </button>
      {disabled ? (
        <span className="btn-reason" id={reasonId}>
          {held.playDisabledReason}
        </span>
      ) : null}
    </>
  );
}

/** Story 31.6 (`62-audio-estados.html` (d) "Dispensado"): a dismissed audio, still reachable from its field. */
function DismissedMark({ held }: { held: HeldAudioState }) {
  const heardId = useId();
  const [open, setOpen] = useState(false);
  const heard = held.row.transcript_heard;
  return (
    <div className="audio-mark" data-audio-id={held.row.id} data-state="dismissed">
      <span className="audio-tag">
        <Icon id="i-mic" />
        {ui.audio.dismissedTag}
      </span>
      <HeldPlay held={held} />
      {heard === null || heard.trim() === '' ? null : (
        <>
          <button type="button" className="btn btn-text audio-heard-toggle" aria-expanded={open} aria-controls={heardId} onClick={() => setOpen((was) => !was)}>
            {ui.audio.heardToggle}
          </button>
          <p className="audio-heard" id={heardId} hidden={!open}>
            <span className="audio-heard-label">{ui.audio.heardLabel}</span>
            {heard}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Story 31.6 (`62-audio-estados.html` (e)): an audio whose transcription failed three times. It holds
 * the ficha and the emission until "Tentar de novo" (signal needed; disabled with its reason without)
 * or "Dispensar" (the audio stays stored). Read-only, the word and play only.
 */
export function AudioFailedLine({ target, readOnly = false }: { target: AudioTarget | null; readOnly?: boolean }) {
  const audio = useFieldAudio(target, null);
  const reasonId = useId();
  const [busy, setBusy] = useState(false);
  if (audio.failed === null) return null;
  const failed = audio.failed;
  const retryReason = audio.online ? null : ui.audio.retryNeedsConnection;
  const retry = () => {
    if (retryReason !== null || busy) return;
    setBusy(true);
    audio
      .retranscribe(failed.row)
      .catch((error: unknown) => audio.announce(isQuotaExceeded(error) ? quotaExceededText('transcription') : ui.audio.retryFailed))
      .finally(() => setBusy(false));
  };
  const dismiss = () => {
    if (busy) return;
    void audio.dismiss(failed.row).then(() => audio.announce(ui.audio.dismissed));
  };
  return (
    <div className="audio-failed" role="group" aria-label={ui.audio.failedGroup} data-audio-id={failed.row.id}>
      <span className="audio-failed-word">
        <Icon id="i-alert" />
        {ui.audio.failedWord}
      </span>
      <HeldPlay held={failed} />
      {readOnly ? null : (
        <>
          <button
            type="button"
            className="btn btn-text"
            aria-disabled={retryReason !== null || busy || undefined}
            aria-describedby={retryReason === null ? undefined : reasonId}
            aria-busy={busy || undefined}
            onClick={retry}
          >
            {ui.audio.retry}
          </button>
          <button type="button" className="btn btn-text" onClick={dismiss}>
            {ui.audio.dismiss}
          </button>
          {retryReason === null ? null : (
            <span className="btn-reason" id={reasonId}>
              {retryReason}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * e31f (Matheus, 2026-11-26: "Dispensar na lista de pendências"): "Tentar de novo" (where it applies)
 * and "Dispensar" of one audio that holds, beside its place in a list (the ficha's hold line, the
 * Export dialog's rows). Each is named with the place, so two listed audios read apart; a disabled one
 * says why. Nothing when the audio offers neither (no provider, or the device does not hold the row).
 */
export function HeldAudioButtons({ audioId, place }: { audioId: string; place: string }) {
  const controls = useHeldAudioControls(audioId);
  const reasonId = useId();
  const { retry, dismiss } = controls;
  if (retry === null && dismiss === null) return null;
  const reasons = [...new Set([retry?.disabledReason ?? null, dismiss?.disabledReason ?? null].filter((reason): reason is string => reason !== null))];
  return (
    <span className="audio-held-actions" data-audio-actions={audioId}>
      {retry === null ? null : (
        <button
          type="button"
          className="btn btn-text"
          aria-label={ui.audio.retryNamed(place)}
          aria-disabled={retry.disabledReason !== null || retry.busy || undefined}
          aria-describedby={retry.disabledReason === null ? undefined : reasonId}
          aria-busy={retry.busy || undefined}
          onClick={retry.run}
        >
          {ui.audio.retry}
        </button>
      )}
      {dismiss === null ? null : (
        <button
          type="button"
          className="btn btn-text"
          aria-label={ui.audio.dismissNamed(place)}
          aria-disabled={dismiss.disabledReason !== null || undefined}
          aria-describedby={dismiss.disabledReason === null ? undefined : reasonId}
          onClick={dismiss.run}
        >
          {ui.audio.dismiss}
        </button>
      )}
      {reasons.length === 0 ? null : (
        <span className="btn-reason" id={reasonId}>
          {reasons.join(' ')}
        </span>
      )}
    </span>
  );
}


/**
 * Story 31.10 (Matheus, 2026-11-27, "Opcao A"; `components.css` "Field bar", `62-audio-estados.html` (h)): the audio
 * and AI controls of one prose field, drawn as the input's next sibling (`.field-tray`), so the field's box holds the
 * text and, under a hairline, one bar: "Gravar áudio" at its start (absent read-only or where the browser cannot
 * record), "Melhorar o texto com IA" at its end (absent on an empty field). Above the bar, in the box: the comparison
 * of a proposal, the field's audio status line, mark and failed line, the AI control's line ("Texto melhorado por IA",
 * or a refusal's reason) and the live warning. While a proposal is open the bar holds "Manter o meu texto" and the
 * primary "Usar o texto da IA" instead. A bar with no control is not drawn (the lines still are, without the box).
 * The field's own lines (count, helper, criteria, a suggestion's actions) follow it, drawn by the caller.
 */
export function AudioField({
  target,
  label,
  text,
  readOnly = false,
  disabledReason = null,
  aiText,
  ai: aiWanted = true,
}: {
  target: AudioTarget | null;
  /** The field as the controls name it ("observação do item 8"). */
  label: string;
  /** The field's current text (the mark reads "Áudio, editado" once it no longer holds the audio's). */
  text: string | null | undefined;
  readOnly?: boolean;
  /** Why both controls are disabled (a photo or a point not saved yet), or null. */
  disabledReason?: string | null;
  /** Story 31.9: the text the field shows when it is not `text` (the composed conclusion text, the composed parecer); absent, `text`. */
  aiText?: string | null;
  /**
   * Story 31.9: false where the field's text is not yet stored (the batch caption before "Adicionar N fotos", a point
   * not saved yet): the AI control rewrites what the server holds, so it is not drawn there.
   */
  ai?: boolean;
}) {
  const audio = useAudioButton(target, { label, disabledReason });
  const ai = useAiWriteControl(target, aiText === undefined ? text : aiText, { readOnly: readOnly || !aiWanted, disabledReason });
  const audioShown = !readOnly && audio.available;
  const lines = (
    <>
      <AudioStatusLine target={target} text={text} />
      <AudioMark target={target} text={text} label={label} />
      <AudioFailedLine target={target} readOnly={readOnly} />
      <AiWriteLine state={ai} label={label} />
      <AudioWarning target={target} />
    </>
  );
  if (!audioShown && !ai.shown) return lines;
  const comparison = ai.comparison;
  return (
    <div className="field-tray" data-state={comparison !== null ? 'comparing' : ai.refusal !== null ? 'refused' : undefined}>
      {comparison === null ? null : <AiCompare comparison={comparison} />}
      {lines}
      <div className="field-bar">
        {comparison !== null ? (
          <>
            <button type="button" className="btn btn-text" aria-label={ui.aiWrite.keepName(label)} onClick={ai.keep}>
              {ui.aiWrite.keep}
            </button>
            <button type="button" className="btn btn-primary" aria-label={ui.aiWrite.useName(label)} onClick={ai.use}>
              {ui.aiWrite.use}
            </button>
          </>
        ) : (
          <>
            {audioShown ? <BarAudioButton state={audio} /> : null}
            <AiWriteButton state={ai} label={label} />
          </>
        )}
      </div>
    </div>
  );
}
