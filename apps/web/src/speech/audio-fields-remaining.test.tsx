import type { AudioFileRow, AudioTarget } from '@app/domain';
import { audioRichFieldText, audioQualityOf } from '@app/domain';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../state/toast.tsx';
import { GeneratedTextField } from '../components/generated-text-field.tsx';
import { copy } from '../copy/pt-br.ts';
import { AudioField } from './audio-field.tsx';
import { AudioRecorderCore, type AudioCommit } from './audio-session.tsx';
// The draft store is not under test here: the generated field reads it, so it is stood in for.
vi.mock('../state/drafts.tsx', () => ({ useDraftSource: () => () => Promise.resolve() }));
import { fakeRecorderWorld, syllables, tone } from './recorder-fakes.ts';

/*
 * 31.7-WEB: the mic on the fields that lacked it. Each field's target and the words its button names
 * ("Gravar áudio: ..."), a recording on it committing the right target in one commit, the conclusion
 * text's field keeping its own "Editar" and showing the mark once an audio's text is in it, and a
 * section text's mark comparing the audio's words with the plain lines of the rich text.
 */

const REL = '019966b0-0000-7000-8000-000000000701';
const BLOCK = '019966b0-0000-7000-8000-000000000702';
const AUTHOR = { companyId: '019966b0-0000-7000-8000-000000000703', actorId: '019966b0-0000-7000-8000-000000000704' };
const speech = syllables(tone(0.3, 0.002), tone(0, 0.002));

const FIELDS: { name: string; target: AudioTarget; label: string }[] = [
  { name: 'the Não ensaiado justification', target: { type: 'sheet_field', block_id: BLOCK, field: 'not_tested_text' }, label: copy.ficha.utilityJustification.audioField },
  { name: 'the conclusion text', target: { type: 'sheet_field', block_id: BLOCK, field: 'conclusion_text' }, label: copy.ficha.conclusao.audioTextField },
  { name: 'a section text', target: { type: 'section', block_id: BLOCK }, label: copy.sectionText.audioField },
  { name: 'the capa additional information', target: { type: 'setup', field: 'additional_info' }, label: copy.setup.audioAdditionalInfo },
  { name: 'the next intervention justification', target: { type: 'setup', field: 'next_intervention_justification' }, label: copy.setup.audioJustification },
  { name: 'the parecer summary', target: { type: 'setup', field: 'parecer_text' }, label: copy.setup.audioParecer },
];

const done = (target: AudioTarget, written: string): AudioFileRow => ({
  id: '019966b0-0000-7000-8000-000000000799',
  company_id: AUTHOR.companyId,
  relatorio_id: REL,
  kind: 'audio',
  sha256: 'ab'.repeat(32),
  mime: 'audio/webm',
  size: 10,
  uploaded_at: null,
  variants: null,
  removed_at: null,
  audio_target: target,
  audio_status: 'done',
  quality: audioQualityOf({ level: 0.2, clipped_share: 0, noise_ratio: 0.05, duration_ms: 9200, speech_ms: 6000 }),
  transcript_heard: 'texto como falado',
  transcript_written: written,
  transcription_run_id: null,
});

function Harness({ world, commit, children, audio }: { world: ReturnType<typeof fakeRecorderWorld>; commit: AudioCommit; children: React.ReactNode; audio?: { rows: AudioFileRow[]; local: Set<string> } }) {
  return (
    <AudioRecorderCore deps={world.deps} online relatorioId={REL} author={AUTHOR} commit={commit} wakeLock={() => Promise.resolve(null)} {...(audio === undefined ? {} : { audio })}>
      {children}
    </AudioRecorderCore>
  );
}

describe('31.7-WEB-001 the Audio button on each remaining prose field', () => {
  for (const field of FIELDS) {
    it(`${field.name}: "Gravar áudio: ${field.label}" records and commits its target`, async () => {
      const world = fakeRecorderWorld();
      world.setSource(speech);
      const commit = vi.fn<AudioCommit>(() => Promise.resolve());
      render(
        <Harness world={world} commit={commit}>
          <AudioField target={field.target} label={field.label} text="" />
        </Harness>,
      );
      await userEvent.click(screen.getByRole('button', { name: `Gravar áudio: ${field.label}` }));
      act(() => world.advance(4000));
      await userEvent.click(screen.getByRole('button', { name: `Parar a gravação: ${field.label}` }));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit.mock.calls[0]![0]).toMatchObject({ relatorioId: REL, target: field.target });
    });
  }

  it('the audio fields name no "Ditado" and carry no emoji', () => {
    for (const field of FIELDS) expect(field.label).toMatch(/^[a-zà-ú ]+$/);
  });
});

describe('31.7-WEB-002 the conclusion text and the marks', () => {
  const target: AudioTarget = { type: 'sheet_field', block_id: BLOCK, field: 'conclusion_text' };

  it('the generated text field keeps "Editar" and the mark appears under it once the audio words are in the text', () => {
    const world = fakeRecorderWorld();
    const text = 'Texto composto.\n\nFrase falada.';
    render(
      <ToastProvider>
      <Harness world={world} commit={vi.fn()} audio={{ rows: [done(target, 'Frase falada.')], local: new Set() }}>
        <div className="ficha-conc-text">
          <GeneratedTextField
            label="Texto da conclusão"
            text={text}
            criteriaItems={[]}
            state="edited"
            onConfirm={() => undefined}
            onReplace={() => undefined}
            onEdit={() => undefined}
            draft={{ surface: 'test', entityId: BLOCK, field: 'conclusion-text' }}
          />
          <AudioField target={target} label="texto da conclusão" text={text} />
        </div>
      </Harness>
      </ToastProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Texto da conclusão' })).toHaveValue(text);
    const mark = document.querySelector('.audio-mark')!;
    expect(mark.querySelector('.audio-tag')).toHaveTextContent('Áudio');
    expect(mark).not.toHaveAttribute('data-state', 'edited');
  });

  it('a section text mark reads the rich text as plain lines: the audio paragraph is found, an edit away from it is "editado"', () => {
    const sectionTarget: AudioTarget = { type: 'section', block_id: BLOCK };
    const stored = 'Texto **negrito**.\n- um\n\nFrase falada.';
    const view = (value: string) => (
      <Harness world={fakeRecorderWorld()} commit={vi.fn()} audio={{ rows: [done(sectionTarget, 'Frase falada.')], local: new Set() }}>
        <AudioField target={sectionTarget} label="texto da seção" text={audioRichFieldText(value)} />
      </Harness>
    );
    const { rerender } = render(view(stored));
    expect(document.querySelector('.audio-mark .audio-tag')).toHaveTextContent('Áudio');
    expect(document.querySelector('.audio-mark')).not.toHaveAttribute('data-state', 'edited');
    rerender(view('Texto **negrito**.'));
    expect(document.querySelector('.audio-mark .audio-tag')).toHaveTextContent('Áudio, editado');
  });
});
