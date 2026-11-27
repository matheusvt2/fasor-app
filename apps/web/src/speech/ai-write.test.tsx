import type { AudioTarget } from '@app/domain';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '../copy/ui.ts';
import { AiFeaturesContext } from '../state/ai-features.tsx';
import { AudioField, AudioFieldLines } from './audio-field.tsx';
import { AudioRecorderCore, type AiUndo, type AiWriteOutcome, type AiWriteRun } from './audio-session.tsx';
import { fakeRecorderWorld } from './recorder-fakes.ts';

/*
 * 31.9-WEB: the AI control ("Melhorar o texto com IA", `62-audio-estados.html` (f)) on a prose
 * field: present only on a field holding text, hidden with AI features off or read-only, disabled
 * offline with "Precisa de conexão" and nothing run; "Escrevendo" while the request runs; a written
 * text shows "Texto melhorado por IA" with "Desfazer", which puts the former values back; a refusal
 * or a failed call says "Não foi possível melhorar o texto" and leaves the field as it was.
 */

const REL = '019966b0-0000-7000-8000-000000000901';
const BLOCK = '019966b0-0000-7000-8000-000000000902';
const AUTHOR = { companyId: '019966b0-0000-7000-8000-000000000903', actorId: '019966b0-0000-7000-8000-000000000904' };
const TARGET: AudioTarget = { type: 'item', block_id: BLOCK, item_key: 'contatos' };
const LABEL = 'observação do item 8';
const NAME = ui.aiWrite.name(LABEL);
const RESTORE = [{ path: `sheet/${BLOCK}/checklist/contatos/observation`, value: 'contato fase b aquecido oxidado' }];

function Harness({ online = true, aiWrite, aiUndo, children, ai = true }: { online?: boolean; aiWrite?: AiWriteRun; aiUndo?: AiUndo; children: React.ReactNode; ai?: boolean }) {
  const world = fakeRecorderWorld();
  return (
    <AiFeaturesContext value={ai}>
      <AudioRecorderCore
        deps={world.deps}
        online={online}
        relatorioId={REL}
        author={AUTHOR}
        commit={() => Promise.resolve()}
        wakeLock={() => Promise.resolve(null)}
        {...(aiWrite === undefined ? {} : { aiWrite })}
        {...(aiUndo === undefined ? {} : { aiUndo })}
      >
        {children}
      </AudioRecorderCore>
    </AiFeaturesContext>
  );
}

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('31.9-WEB-001 where the control is drawn', () => {
  it('beside the Audio button on a field holding text, with the sparkles glyph and its label', () => {
    const { container } = render(
      <Harness aiWrite={vi.fn<AiWriteRun>()}>
        <AudioField target={TARGET} label={LABEL} text="contato fase b aquecido oxidado" />
      </Harness>,
    );
    const button = screen.getByRole('button', { name: NAME });
    expect(button).toHaveClass('ai-btn');
    expect(button.closest('.ai-write')?.parentElement).toHaveClass('audio-tools');
    expect(button.querySelector('use')?.getAttribute('href')).toMatch(/#i-sparkles$/);
    expect(button).toHaveTextContent(ui.aiWrite.label);
    // The Audio button comes first in the row.
    const tools = container.querySelector('.audio-tools')!;
    expect(tools.firstElementChild).toHaveClass('audio-rec');
  });

  it('absent on an empty field, with AI features off, read-only, or with no runner mounted', () => {
    const run = vi.fn<AiWriteRun>();
    const { rerender } = render(
      <Harness aiWrite={run}>
        <AudioField target={TARGET} label={LABEL} text="   " />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
    rerender(
      <Harness aiWrite={run} ai={false}>
        <AudioField target={TARGET} label={LABEL} text="texto" />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
    rerender(
      <Harness aiWrite={run}>
        <AudioField target={TARGET} label={LABEL} text="texto" readOnly />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
    rerender(
      <Harness>
        <AudioField target={TARGET} label={LABEL} text="texto" />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
  });

  it('a composed text the field shows counts as text (aiText); a field with its button elsewhere draws the control in a row of its own', () => {
    render(
      <Harness aiWrite={vi.fn<AiWriteRun>()}>
        <AudioField target={TARGET} label={LABEL} text={null} aiText="Texto composto." />
        <AudioFieldLines target={{ type: 'setup', field: 'additional_info' }} label="informações adicionais" text="Texto." />
        <AudioFieldLines target={{ type: 'photo_caption', file_id: BLOCK }} label="legenda" text="Lote." ai={false} />
      </Harness>,
    );
    expect(screen.getByRole('button', { name: NAME })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ui.aiWrite.name('informações adicionais') }).closest('.audio-tools')).not.toBeNull();
    expect(screen.queryByRole('button', { name: ui.aiWrite.name('legenda') })).toBeNull();
  });
});

describe('31.9-WEB-002 offline: disabled with its reason, nothing queued', () => {
  it('"Precisa de conexão" describes the disabled control and a tap runs nothing', async () => {
    const run = vi.fn<AiWriteRun>();
    render(
      <Harness online={false} aiWrite={run}>
        <AudioField target={TARGET} label={LABEL} text="contato fase b aquecido oxidado" />
      </Harness>,
    );
    const button = screen.getByRole('button', { name: NAME });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(ui.aiWrite.needsConnection);
    await userEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('31.9-WEB-003 a tap: "Escrevendo", then the written text with "Desfazer"', () => {
  it('shows "Escrevendo" while it runs; the line appears once the field holds the new text; "Desfazer" puts the former values back', async () => {
    let finish: (outcome: AiWriteOutcome) => void = () => undefined;
    const run = vi.fn<AiWriteRun>(() => new Promise((resolve) => (finish = resolve)));
    const undo = vi.fn<AiUndo>(() => Promise.resolve());
    const { rerender } = render(
      <Harness aiWrite={run} aiUndo={undo}>
        <AudioField target={TARGET} label={LABEL} text="contato fase b aquecido oxidado" />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    expect(run).toHaveBeenCalledWith(TARGET);
    const button = screen.getByRole('button', { name: NAME });
    expect(button).toHaveAttribute('aria-busy', 'true');
    // A second tap while it runs runs nothing more.
    await userEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => finish({ kind: 'written', text: 'Contatos da fase B com sinais de aquecimento e oxidação.', restore: RESTORE }));
    expect(screen.getByRole('button', { name: NAME })).not.toHaveAttribute('aria-busy');
    // The field still shows the former text until the op lands: no line yet.
    expect(screen.queryByText(ui.aiWrite.done)).toBeNull();
    rerender(
      <Harness aiWrite={run} aiUndo={undo}>
        <AudioField target={TARGET} label={LABEL} text="Contatos da fase B com sinais de aquecimento e oxidação." />
      </Harness>,
    );
    const line = screen.getByText(ui.aiWrite.done).closest('.ai-done');
    expect(line).toHaveAttribute('role', 'status');
    await userEvent.click(screen.getByRole('button', { name: ui.aiWrite.undoName(LABEL) }));
    expect(undo).toHaveBeenCalledWith(RESTORE);
    expect(screen.queryByText(ui.aiWrite.done)).toBeNull();
  });

  it('the line goes once the user types over the written text', async () => {
    const run = vi.fn<AiWriteRun>(() => Promise.resolve({ kind: 'written', text: 'Texto melhor.', restore: RESTORE }));
    const { rerender } = render(
      <Harness aiWrite={run}>
        <AudioField target={TARGET} label={LABEL} text="texto" />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    rerender(
      <Harness aiWrite={run}>
        <AudioField target={TARGET} label={LABEL} text="Texto melhor." />
      </Harness>,
    );
    expect(screen.getByText(ui.aiWrite.done)).toBeInTheDocument();
    rerender(
      <Harness aiWrite={run}>
        <AudioField target={TARGET} label={LABEL} text="Texto melhor. E mais." />
      </Harness>,
    );
    expect(screen.queryByText(ui.aiWrite.done)).toBeNull();
  });
});

describe('31.9-WEB-004 a refusal or a failed call leaves the field unchanged and says so', () => {
  for (const [name, run] of [
    ['the guard refused the answer', () => Promise.resolve({ kind: 'refused' } as AiWriteOutcome)],
    ['the call failed', () => Promise.reject(new Error('offline'))],
  ] as const) {
    it(`${name}: "Não foi possível melhorar o texto", until the field changes`, async () => {
      const { rerender } = render(
        <Harness aiWrite={vi.fn<AiWriteRun>(run)}>
          <AudioField target={TARGET} label={LABEL} text="folga no acionamento do mecanismo" />
        </Harness>,
      );
      await userEvent.click(screen.getByRole('button', { name: NAME }));
      await flush();
      expect(screen.getByText(ui.aiWrite.failed)).toHaveClass('ai-error');
      expect(screen.getByText(ui.aiWrite.failed)).toHaveAttribute('role', 'status');
      rerender(
        <Harness aiWrite={vi.fn<AiWriteRun>(run)}>
          <AudioField target={TARGET} label={LABEL} text="folga no acionamento do mecanismo, lado B" />
        </Harness>,
      );
      expect(screen.queryByText(ui.aiWrite.failed)).toBeNull();
    });
  }
});
