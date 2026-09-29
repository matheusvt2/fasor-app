import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictationButton, SpeechEngineProvider } from './dictation.tsx';
import { createSpeechEngine, type SpeechEngine } from './engine.ts';
import { createFakeEngine } from './fake-engine.ts';

/*
 * 9.4-UNIT: the Dictation button. Hidden (no element) with no engine, an unavailable one or
 * no signal; `aria-pressed` and "Ouvindo…" while it listens; one session app-wide; a second
 * tap and going offline end the session with no result; an engine error is announced.
 */

afterEach(() => {
  globalThis.__FAKE_SPEECH__ = undefined;
  globalThis.__fakeSpeech = undefined;
});

function renderButtons(engine: SpeechEngine, online: boolean, results: Record<string, (text: string) => void>) {
  const ui = (on: boolean) => (
    <SpeechEngineProvider engine={engine} online={on}>
      {Object.entries(results).map(([label, onResult]) => (
        <DictationButton key={label} label={label} onResult={onResult} />
      ))}
    </SpeechEngineProvider>
  );
  const view = render(ui(online));
  return { ...view, setOnline: (on: boolean) => view.rerender(ui(on)) };
}

const say = async (text: string) => {
  await act(async () => {
    globalThis.__fakeSpeech!.say(text);
  });
};

describe('9.4-UNIT DictationButton', () => {
  it('renders nothing outside the provider', () => {
    const { container } = render(<DictationButton label="Ditar a legenda" onResult={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden, not disabled, with the none engine, an unavailable engine or no signal', () => {
    const none = renderButtons(createSpeechEngine('none'), true, { 'Ditar a legenda': vi.fn() });
    expect(screen.queryByRole('button', { name: 'Ditar a legenda' })).toBeNull();
    expect(none.container.querySelector('.dictation-btn')).toBeNull();
    none.unmount();

    const engine = createFakeEngine();
    globalThis.__FAKE_SPEECH__ = { available: false };
    const unavailable = renderButtons(engine, true, { 'Ditar a legenda': vi.fn() });
    expect(unavailable.container.querySelector('.dictation')).toBeNull();
    unavailable.unmount();

    globalThis.__FAKE_SPEECH__ = undefined;
    const offline = renderButtons(engine, false, { 'Ditar a legenda': vi.fn() });
    expect(offline.container.querySelector('.dictation')).toBeNull();
    offline.setOnline(true);
    expect(screen.getByRole('button', { name: 'Ditar a legenda' })).toBeInTheDocument();
  });

  it('draws the mock markup; pressed while listening with "Ouvindo…"; the transcript goes to the caller', async () => {
    const onResult = vi.fn();
    const { container } = renderButtons(createFakeEngine(), true, { 'Ditar a legenda': onResult });
    const button = screen.getByRole('button', { name: 'Ditar a legenda' });
    expect(button).toHaveClass('dictation-btn');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('use')).toHaveAttribute('href', '/sprite.svg#i-mic');
    expect(container.querySelector('.dictation > .listening-word')).toHaveTextContent('Ouvindo…');
    // E9-Q11: the live region exists before listening, empty, and says the word once it listens.
    const live = container.querySelector('.dictation > [aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveTextContent(/^$/);

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(live).toHaveTextContent('Ouvindo…');
    expect(globalThis.__fakeSpeech!.listening).toBe(true);
    await say('detalhe da limpeza dos cubículos');
    expect(onResult).toHaveBeenCalledWith('detalhe da limpeza dos cubículos');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(live).toHaveTextContent(/^$/);
  });

  it('a second tap on the pressed button stops listening with no result', async () => {
    const onResult = vi.fn();
    renderButtons(createFakeEngine(), true, { 'Ditar a legenda': onResult });
    const button = screen.getByRole('button', { name: 'Ditar a legenda' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(globalThis.__fakeSpeech!.listening).toBe(false);
    await say('tarde demais');
    expect(onResult).not.toHaveBeenCalled();
  });

  it('one session app-wide: starting one aborts the other', async () => {
    const first = vi.fn();
    const second = vi.fn();
    renderButtons(createFakeEngine(), true, { 'Ditar observações': first, 'Ditar o texto': second });
    const a = screen.getByRole('button', { name: 'Ditar observações' });
    const b = screen.getByRole('button', { name: 'Ditar o texto' });
    await userEvent.click(a);
    await userEvent.click(b);
    expect(a).toHaveAttribute('aria-pressed', 'false');
    expect(b).toHaveAttribute('aria-pressed', 'true');
    await say('ponto quente');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('ponto quente');
  });

  it('going offline while listening aborts the session with no result and hides the button', async () => {
    const onResult = vi.fn();
    const view = renderButtons(createFakeEngine(), true, { 'Ditar a legenda': onResult });
    await userEvent.click(screen.getByRole('button', { name: 'Ditar a legenda' }));
    await act(async () => view.setOnline(false));
    expect(view.container.querySelector('.dictation-btn')).toBeNull();
    expect(globalThis.__fakeSpeech!.listening).toBe(false);
    await say('sem sinal');
    expect(onResult).not.toHaveBeenCalled();
  });

  it('a button that unmounts ends its own session', async () => {
    const onResult = vi.fn();
    const view = renderButtons(createFakeEngine(), true, { 'Ditar a legenda': onResult });
    await userEvent.click(screen.getByRole('button', { name: 'Ditar a legenda' }));
    view.unmount();
    expect(globalThis.__fakeSpeech!.listening).toBe(false);
  });

  it('an engine error returns the button to idle, with no result, and is announced', async () => {
    const onResult = vi.fn();
    renderButtons(createFakeEngine(), true, { 'Ditar a legenda': onResult });
    const button = screen.getByRole('button', { name: 'Ditar a legenda' });
    await userEvent.click(button);
    await act(async () => {
      globalThis.__fakeSpeech!.fail();
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByTestId('dictation-announcer')).toHaveTextContent('Não foi possível ouvir. Digite ou tente de novo.');
  });
});
