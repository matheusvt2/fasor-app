import { audioQualityOf, type AudioFileRow, type AudioStatus, type AudioTarget } from '@app/domain';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AiFeaturesContext } from '../state/ai-features.tsx';
import { axe } from '../test-axe.ts';
import { AudioButton, AudioField } from './audio-field.tsx';
import { AudioRecorderCore, type AudioCommit } from './audio-session.tsx';
import { fakeRecorderWorld, silence, syllables, tone, type FakeRecorderWorld } from './recorder-fakes.ts';

/*
 * 31.3-WEB / 31.4-WEB the audio of a prose field: the button (absent when the browser cannot
 * record or AI features are off, pressed while recording, "Gravando", the time, the meter), one
 * recording app-wide, the refusal, "Não ouvi nada", the commit at stop, the countdown; then the
 * field's status line and mark (heard text, play offline, edited, poor note).
 */

const REL = '019966b0-0000-7000-8000-000000000301';
const BLOCK = '019966b0-0000-7000-8000-000000000302';
const ITEM: AudioTarget = { type: 'item', block_id: BLOCK, item_key: 'contatos' };
const OBS: AudioTarget = { type: 'sheet_field', block_id: BLOCK, field: 'observations' };
const AUTHOR = { companyId: '019966b0-0000-7000-8000-000000000303', actorId: '019966b0-0000-7000-8000-000000000304' };
const speech = syllables(tone(0.3, 0.002), tone(0, 0.002));

function Harness({
  world,
  commit,
  children,
  audio,
  online = true,
  player,
  retranscribe,
  dismiss,
}: {
  world: FakeRecorderWorld | null;
  commit: AudioCommit;
  children: ReactNode;
  audio?: { rows: AudioFileRow[]; local: Set<string> };
  online?: boolean;
  player?: (row: AudioFileRow, onEnded: () => void) => Promise<(() => void) | null>;
  retranscribe?: (row: AudioFileRow) => Promise<void>;
  dismiss?: (row: AudioFileRow) => Promise<void>;
}) {
  return (
    <AudioRecorderCore
      deps={world?.deps ?? null}
      online={online}
      relatorioId={REL}
      author={AUTHOR}
      commit={commit}
      wakeLock={() => Promise.resolve(null)}
      {...(audio === undefined ? {} : { audio })}
      {...(player === undefined ? {} : { player })}
      {...(retranscribe === undefined ? {} : { retranscribe })}
      {...(dismiss === undefined ? {} : { dismiss })}
    >
      {children}
    </AudioRecorderCore>
  );
}

const announcer = () => screen.getByTestId('audio-announcer');
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('31.3-WEB-005 the Audio button', () => {
  it('draws the mock markup, named for its field, and nothing when the browser cannot record or AI features are off', () => {
    const { container, rerender } = render(<Harness world={fakeRecorderWorld()} commit={vi.fn()}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness>);
    const button = screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('.audio-tools > .audio-rec > .audio-btn')).toBe(button);
    expect(container.querySelectorAll('.audio-meter i')).toHaveLength(5);
    rerender(<Harness world={null} commit={vi.fn()}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness>);
    expect(container.querySelector('.audio-btn')).toBeNull();
    expect(container.querySelector('.audio-tools')).toBeNull();
    rerender(<AiFeaturesContext value={false}><Harness world={fakeRecorderWorld()} commit={vi.fn()}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness></AiFeaturesContext>);
    expect(container.querySelector('.audio-btn')).toBeNull();
  });

  it('records on a tap (pressed, "Gravando", the time and the meter), and a second tap saves it in one commit', async () => {
    const world = fakeRecorderWorld();
    world.setSource(speech);
    const commit = vi.fn<AudioCommit>(() => Promise.resolve());
    const { container } = render(<Harness world={world} commit={commit}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness>);
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' }));
    const pressed = screen.getByRole('button', { name: 'Parar a gravação: observação do item 8' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(announcer()).toHaveTextContent('Gravando áudio');
    act(() => world.advance(4000));
    expect(container.querySelector('.audio-rec-word')).toHaveTextContent('Gravando');
    expect(container.querySelector('.audio-time')).toHaveTextContent('0:03');
    expect(Number(container.querySelector('.audio-meter')!.getAttribute('data-level'))).toBeGreaterThan(0);
    await userEvent.click(pressed);
    await flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]![0]).toMatchObject({ relatorioId: REL, target: ITEM, mime: 'audio/webm', quality: { verdict: 'good' }, companyId: AUTHOR.companyId, actorId: AUTHOR.actorId });
    expect(announcer()).toHaveTextContent('Gravação terminada, 0:04');
    expect(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a recording of silence keeps nothing and the field says "Não ouvi nada, grave de novo"', async () => {
    const world = fakeRecorderWorld();
    world.setSource(silence);
    const commit = vi.fn<AudioCommit>(() => Promise.resolve());
    const { container } = render(<Harness world={world} commit={commit}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness>);
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' }));
    act(() => world.advance(3000));
    await userEvent.click(screen.getByRole('button', { name: 'Parar a gravação: observação do item 8' }));
    await flush();
    expect(commit).not.toHaveBeenCalled();
    expect(container.querySelector('.audio-status[data-step="empty"]')).toHaveTextContent('Não ouvi nada, grave de novo');
    expect(announcer()).toHaveTextContent('Não ouvi nada, grave de novo');
  });

  it('starting a second recording stops and saves the first', async () => {
    const world = fakeRecorderWorld();
    world.setSource(speech);
    const commit = vi.fn<AudioCommit>(() => Promise.resolve());
    render(
      <Harness world={world} commit={commit}>
        <AudioButton target={ITEM} label="observação do item 8" />
        <AudioButton target={OBS} label="observações" />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' }));
    act(() => world.advance(3000));
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observações' }));
    await flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]![0].target).toEqual(ITEM);
    expect(screen.getByRole('button', { name: 'Parar a gravação: observações' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a refused microphone keeps the button, shows and says how to allow it, and keeps nothing', async () => {
    const world = fakeRecorderWorld({ refuse: 'NotAllowedError' });
    const commit = vi.fn<AudioCommit>(() => Promise.resolve());
    const { container } = render(<Harness world={world} commit={commit}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness>);
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' }));
    await flush();
    const text = 'O microfone está bloqueado. Permita o microfone nas configurações do navegador e toque de novo.';
    expect(container.querySelector('.audio-refused')).toHaveTextContent(text);
    expect(announcer()).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' })).toHaveAttribute('aria-pressed', 'false');
    expect(commit).not.toHaveBeenCalled();
  });

  it('shows a live warning while it holds (amber meter), then the countdown at 2:50, and saves itself at 3:00', async () => {
    const world = fakeRecorderWorld();
    world.setSource(tone(0.01));
    const commit = vi.fn<AudioCommit>(() => Promise.resolve());
    const { container } = render(<Harness world={world} commit={commit}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness>);
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' }));
    act(() => world.advance(2500));
    expect(container.querySelector('.audio-warning[role="status"]')).toHaveTextContent('Fale mais perto do aparelho');
    expect(container.querySelector('.audio-meter')).toHaveAttribute('data-tone', 'warn');
    world.setSource(speech);
    act(() => world.advance(167_600));
    expect(container.querySelector('.audio-warning')).toBeNull();
    expect(container.querySelector('.audio-rec')).toHaveAttribute('data-phase', 'countdown');
    expect(container.querySelector('.audio-rec-word')).toHaveTextContent('Termina em');
    expect(container.querySelector('.audio-time')!.textContent).toMatch(/^0:(10|09)$/);
    expect(announcer()).toHaveTextContent('Faltam 10 segundos');
    act(() => world.advance(10_000));
    await flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a button that goes away mid-recording keeps nothing', async () => {
    const world = fakeRecorderWorld();
    world.setSource(speech);
    const commit = vi.fn<AudioCommit>(() => Promise.resolve());
    const { rerender } = render(<Harness world={world} commit={commit}><AudioButton target={ITEM} label="observação do item 8" /></Harness>);
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' }));
    act(() => world.advance(3000));
    rerender(<Harness world={world} commit={commit}>{null}</Harness>);
    await flush();
    expect(commit).not.toHaveBeenCalled();
    expect(world.tracks[0]!.stopped).toBe(true);
  });

  it('a disabled button says why and records nothing', async () => {
    const world = fakeRecorderWorld();
    render(<Harness world={world} commit={vi.fn()}><AudioButton target={null} label="legenda" disabledReason="Salve as fotos para gravar a legenda" /></Harness>);
    const button = screen.getByRole('button', { name: 'Gravar áudio: legenda' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Salve as fotos para gravar a legenda');
    await userEvent.click(button);
    expect(world.asked()).toBe(0);
  });
});

function audioRow(status: AudioStatus, extra: Partial<AudioFileRow> = {}): AudioFileRow {
  return {
    id: '019966b0-0000-7000-8000-0000000031a1',
    company_id: AUTHOR.companyId,
    relatorio_id: REL,
    kind: 'audio',
    sha256: 'ab'.repeat(32),
    mime: 'audio/webm',
    size: 10,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    audio_target: ITEM,
    audio_status: status,
    quality: audioQualityOf({ level: 0.2, clipped_share: 0, noise_ratio: 0.05, duration_ms: 9200, speech_ms: 6000 }),
    transcript_heard: status === 'done' ? 'equipamento verificado sem anomalias aparentes' : null,
    transcript_written: status === 'done' ? 'Equipamento verificado, sem anomalias aparentes.' : null,
    transcription_run_id: null,
    ...extra,
  };
}

describe('31.4-WEB-001 the field status line and mark', () => {
  const renderField = (rows: AudioFileRow[], text: string, options: { online?: boolean; local?: string[]; player?: (row: AudioFileRow, onEnded: () => void) => Promise<(() => void) | null> } = {}) =>
    render(
      <Harness world={fakeRecorderWorld()} commit={vi.fn()} audio={{ rows, local: new Set(options.local ?? []) }} online={options.online ?? true} {...(options.player === undefined ? {} : { player: options.player })}>
        <AudioField target={ITEM} label="observação do item 8" text={text} />
      </Harness>,
    );

  it('says where a queued audio is (saved offline, sending online) and transcribing, the field untouched', () => {
    const { container, unmount } = renderField([audioRow('queued')], 'Contatos escurecidos.', { online: false });
    expect(container.querySelector('.audio-status[data-step="saved"]')).toHaveTextContent('Áudio guardado, aguardando sinal');
    unmount();
    const online = renderField([audioRow('queued')], '');
    expect(online.container.querySelector('.audio-status[data-step="sending"]')).toHaveTextContent('Enviando');
    online.unmount();
    const transcribing = renderField([audioRow('transcribing')], '');
    expect(transcribing.container.querySelector('.audio-status[data-step="transcribing"]')).toHaveTextContent('Transcrevendo');
    expect(transcribing.container.querySelector('.audio-mark')).toBeNull();
  });


  it('marks a transcribed text "Áudio" with play and the heard text behind its disclosure', async () => {
    const { container } = renderField([audioRow('done')], 'Contatos escurecidos. Equipamento verificado, sem anomalias aparentes.');
    const mark = container.querySelector('.audio-mark')!;
    expect(mark).not.toHaveAttribute('data-state');
    expect(mark.querySelector('.audio-tag')).toHaveTextContent('Áudio');
    expect(screen.getByRole('button', { name: 'Ouvir o áudio, 0:09' })).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Ver texto como falado' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const heard = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(heard).not.toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(heard).toBeVisible();
    expect(heard).toHaveTextContent('Texto como faladoequipamento verificado sem anomalias aparentes');
    expect(mark.querySelector('.audio-note')).toBeNull();
  });

  it('reads "Áudio, editado" once the text is changed, with play and the heard text still there', () => {
    const { container } = renderField([audioRow('done')], 'Equipamento verificado, com anomalias.');
    expect(container.querySelector('.audio-mark')).toHaveAttribute('data-state', 'edited');
    expect(container.querySelector('.audio-tag')).toHaveTextContent('Áudio, editado');
    expect(screen.getByRole('button', { name: 'Ouvir o áudio, 0:09' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver texto como falado' })).toBeInTheDocument();
  });

  it('adds the note of a poor recording', () => {
    const poor = audioRow('done', { quality: audioQualityOf({ level: 0.2, clipped_share: 0, noise_ratio: 0.5, duration_ms: 9200, speech_ms: 6000 }) });
    const { container } = renderField([poor], 'Equipamento verificado, sem anomalias aparentes.');
    expect(container.querySelector('.audio-mark')).toHaveAttribute('data-quality', 'poor');
    expect(container.querySelector('.audio-note')).toHaveTextContent('Áudio com ruído, confira o texto');
  });

  it('disables play offline without the local copy, with its reason; plays the local copy or online', async () => {
    const player = vi.fn(() => Promise.resolve(() => undefined));
    const offline = renderField([audioRow('done')], 'Equipamento verificado, sem anomalias aparentes.', { online: false, player });
    const play = screen.getByRole('button', { name: 'Ouvir o áudio, 0:09' });
    expect(play).toHaveAttribute('aria-disabled', 'true');
    expect(play).toHaveAccessibleDescription('Precisa de conexão para ouvir');
    await userEvent.click(play);
    expect(player).not.toHaveBeenCalled();
    offline.unmount();
    renderField([audioRow('done')], 'Equipamento verificado, sem anomalias aparentes.', { online: false, local: [audioRow('done').id], player });
    const local = screen.getByRole('button', { name: 'Ouvir o áudio, 0:09' });
    expect(local).not.toHaveAttribute('aria-disabled');
    await userEvent.click(local);
    expect(player).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pausar o áudio, 0:09' })).toBeInTheDocument();
  });

  it('says "Texto do áudio chegou" when an audio seen on its way lands', () => {
    const view = renderField([audioRow('transcribing')], '');
    view.rerender(
      <Harness world={fakeRecorderWorld()} commit={vi.fn()} audio={{ rows: [audioRow('done')], local: new Set() }}>
        <AudioField target={ITEM} label="observação do item 8" text="Equipamento verificado, sem anomalias aparentes." />
      </Harness>,
    );
    expect(announcer()).toHaveTextContent('Texto do áudio chegou: observação do item 8');
  });
});

describe('31.4-WEB-003 axe on the audio states', () => {
  it('the button idle and recording, the warning, the refusal, the status line and every mark have no violations', async () => {
    const world = fakeRecorderWorld();
    world.setSource(tone(0.01));
    const recording = render(<Harness world={world} commit={vi.fn()}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness>);
    expect(await axe(recording.container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' }));
    act(() => world.advance(2500));
    expect(recording.container.querySelector('.audio-warning')).not.toBeNull();
    expect(await axe(recording.container)).toHaveNoViolations();
    recording.unmount();

    const refused = render(<Harness world={fakeRecorderWorld({ refuse: 'NotAllowedError' })} commit={vi.fn()}><AudioField target={ITEM} label="observação do item 8" text="" /></Harness>);
    await userEvent.click(screen.getByRole('button', { name: 'Gravar áudio: observação do item 8' }));
    await flush();
    expect(await axe(refused.container)).toHaveNoViolations();
    refused.unmount();

    const poor = audioRow('done', { quality: audioQualityOf({ level: 0.2, clipped_share: 0, noise_ratio: 0.5, duration_ms: 9200, speech_ms: 6000 }) });
    const marks = render(
      <Harness world={fakeRecorderWorld()} commit={vi.fn()} audio={{ rows: [poor, audioRow('queued', { id: '019966b0-0000-7000-8000-0000000031a9' })], local: new Set() }} online={false}>
        <AudioField target={ITEM} label="observação do item 8" text="editado" />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ver texto como falado' }));
    expect(marks.container.querySelector('.audio-status')).not.toBeNull();
    expect(marks.container.querySelector('.audio-mark[data-state="edited"][data-quality="poor"]')).not.toBeNull();
    expect(await axe(marks.container)).toHaveNoViolations();
  });
});

describe('31.6-WEB-001 the failed state and the dismissed mark', () => {
  const failed = audioRow('failed', { transcript_heard: null });
  const renderFailed = (options: { online?: boolean; rows?: AudioFileRow[]; readOnly?: boolean } = {}) => {
    const retranscribe = vi.fn(() => Promise.resolve());
    const dismiss = vi.fn(() => Promise.resolve());
    const view = render(
      <Harness world={fakeRecorderWorld()} commit={vi.fn()} audio={{ rows: options.rows ?? [failed], local: new Set() }} online={options.online ?? true} retranscribe={retranscribe} dismiss={dismiss}>
        <AudioField target={ITEM} label="observação do item 8" text="" readOnly={options.readOnly ?? false} />
      </Harness>,
    );
    return { ...view, retranscribe, dismiss };
  };

  it('says "Não foi possível transcrever" with play, "Tentar de novo" and "Dispensar"; a tap retries', async () => {
    const { container, retranscribe } = renderFailed();
    const group = screen.getByRole('group', { name: 'Áudio não transcrito' });
    expect(group).toHaveClass('audio-failed');
    expect(container.querySelector('.audio-failed-word')).toHaveTextContent('Não foi possível transcrever');
    expect(screen.getByRole('button', { name: 'Ouvir o áudio, 0:09' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(retranscribe).toHaveBeenCalledWith(failed);
  });

  it('without signal "Tentar de novo" is disabled with its reason and sends nothing; "Dispensar" still works and is said', async () => {
    const { retranscribe, dismiss } = renderFailed({ online: false });
    const retry = screen.getByRole('button', { name: 'Tentar de novo' });
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveAccessibleDescription('Tentar de novo precisa de conexão');
    await userEvent.click(retry);
    expect(retranscribe).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(dismiss).toHaveBeenCalledWith(failed);
    await flush();
    expect(announcer()).toHaveTextContent('Áudio dispensado');
  });

  it('a read-only field shows the word and play, no action', () => {
    renderFailed({ readOnly: true });
    expect(screen.getByRole('group', { name: 'Áudio não transcrito' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dispensar' })).toBeNull();
  });

  it('a dismissed audio keeps its mark "Áudio dispensado" with play and the heard text, until a newer text lands', async () => {
    const dismissed = audioRow('dismissed', { transcript_heard: 'contato fixo oxidado' });
    const view = renderFailed({ rows: [dismissed] });
    expect(view.container.querySelector('.audio-mark[data-state="dismissed"] .audio-tag')).toHaveTextContent('Áudio dispensado');
    expect(screen.getByRole('button', { name: 'Ouvir o áudio, 0:09' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver texto como falado' }));
    expect(view.container.querySelector('.audio-heard')).toHaveTextContent('contato fixo oxidado');
    expect(await axe(view.container)).toHaveNoViolations();
    view.unmount();
    const newer = renderFailed({ rows: [dismissed, audioRow('done', { id: '019966b0-0000-7000-8000-0000000031b9' })] });
    expect(newer.container.querySelector('.audio-mark[data-state="dismissed"]')).toBeNull();
  });

  it('the failed state has no axe violations, with and without signal', async () => {
    const online = renderFailed();
    expect(await axe(online.container)).toHaveNoViolations();
    online.unmount();
    const offline = renderFailed({ online: false });
    expect(await axe(offline.container)).toHaveNoViolations();
  });
});
