import { audioCountdownText, audioElapsedText, audioLiveWarningText, type AudioTarget } from '@app/domain';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ui } from '../copy/ui.ts';
import { spriteHref } from '../styles/sprite.ts';
import { useAiWriteControl, useAudioButton, useAudioRecording, useFieldAudio, useHeldAudioControls, type AiWriteControlState, type HeldAudioState } from './audio-session.tsx';

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
 */

function Icon({ id, className = 'ico' }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={spriteHref(id)} />
    </svg>
  );
}

/** The 48 px Audio button (`.audio-rec`); nothing when the browser cannot record or the server would not transcribe. */
export function AudioButton({
  target,
  label,
  disabledReason = null,
  wrap,
  after,
}: {
  target: AudioTarget | null;
  label: string;
  disabledReason?: string | null;
  /** The class of a `div` around the button, drawn only with it (`audio-tools` under a field, `row-wrap` on a row). */
  wrap?: string;
  /** Story 31.9: what follows the button inside the wrap (the AI control); drawn even when the button is not. */
  after?: ReactNode;
}) {
  const state = useAudioButton(target, { label, disabledReason });
  const reasonId = useId();
  if (!state.available) {
    if (after === undefined || after === null || after === false) return null;
    return wrap === undefined ? <>{after}</> : <div className={wrap}>{after}</div>;
  }
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
      {after}
    </>
  );
  return wrap === undefined ? body : <div className={wrap}>{body}</div>;
}

/** Story 31.9: the AI control's button (`.ai-write > .ai-btn`, 48 px, the sparkles glyph and its label); nothing when not shown. */
export function AiWriteButton({ state, label }: { state: AiWriteControlState; label: string }) {
  const reasonId = useId();
  if (!state.shown) return null;
  const disabled = state.disabledReason !== null;
  return (
    <span className="ai-write">
      <button
        type="button"
        className="ai-btn"
        aria-label={ui.aiWrite.name(label)}
        aria-busy={state.busy || undefined}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        onClick={state.tap}
      >
        <Icon id="i-sparkles" />
        <span className="ai-word">{ui.aiWrite.label}</span>
        <span className="ai-busy-word">{ui.aiWrite.busy}</span>
      </button>
      {disabled ? (
        <span className="btn-reason" id={reasonId}>
          {state.disabledReason}
        </span>
      ) : null}
    </span>
  );
}

/** Story 31.9: the AI control's line above the tools: "Texto melhorado por IA" with "Desfazer", or the failure. */
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
  if (state.failed) {
    return (
      <p className="ai-error" role="status">
        {ui.aiWrite.failed}
      </p>
    );
  }
  return null;
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
      .catch(() => audio.announce(ui.audio.retryFailed))
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
 * Everything under a field but the Audio button: the status line, the mark, the failed line, the
 * live warning. Story 31.9: and the AI control, its line and its button in a `.audio-tools` row of
 * its own (the Audio button of these fields sits elsewhere: a row, a section head).
 */
export function AudioFieldLines({
  target,
  text,
  label,
  readOnly = false,
  aiText,
  ai: aiWanted = true,
}: {
  target: AudioTarget | null;
  text: string | null | undefined;
  label: string;
  readOnly?: boolean;
  /** Story 31.9: the text the field shows when it is not `text` (a suggested or composed text); absent, `text`. */
  aiText?: string | null;
  /**
   * Story 31.9: false where the field's text is not yet stored (the batch caption before "Adicionar N fotos", a point
   * not saved yet): the AI control rewrites what the server holds, so it is not drawn there.
   */
  ai?: boolean;
}) {
  const ai = useAiWriteControl(target, aiText === undefined ? text : aiText, { readOnly: readOnly || !aiWanted });
  return (
    <>
      <AudioStatusLine target={target} text={text} />
      <AudioMark target={target} text={text} label={label} />
      <AudioFailedLine target={target} readOnly={readOnly} />
      <AiWriteLine state={ai} label={label} />
      {ai.shown ? (
        <div className="audio-tools">
          <AiWriteButton state={ai} label={label} />
        </div>
      ) : null}
      <AudioWarning target={target} />
    </>
  );
}

/**
 * The audio of one prose field, as `62-audio-estados.html` draws it under the field: the status
 * line or the mark, then `.audio-tools` with the button (absent read-only), then the warning.
 */
export function AudioField({
  target,
  label,
  text,
  readOnly = false,
  disabledReason = null,
  aiText,
}: {
  target: AudioTarget | null;
  /** The field as the button names it ("observação do item 8"). */
  label: string;
  /** The field's current text (the mark reads "Áudio, editado" once it no longer holds the audio's). */
  text: string | null | undefined;
  readOnly?: boolean;
  disabledReason?: string | null;
  /** Story 31.9: the text the field shows when it is not `text` (the composed conclusion text, the composed parecer); absent, `text`. */
  aiText?: string | null;
}) {
  const ai = useAiWriteControl(target, aiText === undefined ? text : aiText, { readOnly, disabledReason });
  return (
    <>
      <AudioStatusLine target={target} text={text} />
      <AudioMark target={target} text={text} label={label} />
      <AudioFailedLine target={target} readOnly={readOnly} />
      <AiWriteLine state={ai} label={label} />
      {readOnly ? null : <AudioButton target={target} label={label} disabledReason={disabledReason} wrap="audio-tools" after={ai.shown ? <AiWriteButton state={ai} label={label} /> : null} />}
      <AudioWarning target={target} />
    </>
  );
}
