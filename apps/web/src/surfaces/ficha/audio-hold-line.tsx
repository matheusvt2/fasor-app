import { audioPlaceText, audioSheetStep, heldAudios, heldAudiosText, type HeldAudio, type RelatorioSnapshot, type SheetStep } from '@app/domain';
import { focusAudioField } from '../../state/audio-arrivals.tsx';
import { spriteHref } from '../../styles/sprite.ts';

/*
 * Story 31.6 (AD-30, decision 6; `62-audio-estados.html` (g) "Ficha com áudio pendente"): the ficha's line
 * while an audio of it is on its way or failed (`.audio-pending`): the kernel's sentence ("1 áudio
 * aguardando transcrição") and one text button per audio, named by its place, that opens its step and
 * focuses its field. The ficha cannot be concluded meanwhile (`use-ficha-actions.ts`).
 */

/** Opens the step of a held audio's field and focuses that field (its status or failed line carries the audio's id). */
export function openHeldAudio(audio: Pick<HeldAudio, 'id' | 'target'>, goTo: (step: SheetStep, missing: boolean) => void): void {
  const step = audioSheetStep(audio.target);
  if (step !== null) goTo(step, false);
  focusAudioField(audio.id);
}

export function AudioHoldLine({ snapshot, blockId, goTo }: { snapshot: RelatorioSnapshot; blockId: string; goTo: (step: SheetStep, missing: boolean) => void }) {
  const held = heldAudios(snapshot.files, { blockId });
  const text = heldAudiosText(held);
  if (text === null) return null;
  return (
    <p className="audio-pending" data-testid="ficha-audio-hold">
      <svg className="ico" aria-hidden="true">
        <use href={spriteHref('i-mic')} />
      </svg>
      {text}
      {held.map((audio) => (
        <button key={audio.id} type="button" className="btn btn-text" onClick={() => openHeldAudio(audio, goTo)}>
          {audioPlaceText(snapshot, audio.target)}
        </button>
      ))}
    </p>
  );
}
