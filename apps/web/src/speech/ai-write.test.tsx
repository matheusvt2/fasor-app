import { aiRewriteDiff, aiRewriteRefusalText, type AiComparison, type AudioTarget } from '@app/domain';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '../copy/ui.ts';
import { AiFeaturesContext } from '../state/ai-features.tsx';
import { AudioField } from './audio-field.tsx';
import { aiRouteRefusal, AudioRecorderCore, type AiProposal, type AiProposeOutcome, type AiProposeRun, type AiReport, type AiUndo, type AiUse } from './audio-session.tsx';
import { SyncRequestError } from '../sync/client.ts';
import { fakeRecorderWorld, syllables, tone } from './recorder-fakes.ts';

/*
 * 31.9-WEB and 31.10-WEB: the AI control ("Melhorar o texto com IA") in the field bar
 * (`62-audio-estados.html` (h)): present only on a field holding text, at the bar's end with the
 * audio control at its start; hidden with AI features off or read-only; disabled offline with
 * "Precisa de conexão" and while the field records; "Escrevendo" while the request runs. Story
 * 31.10: the answer is a proposal compared beside the field's text, nothing written until "Usar o
 * texto da IA"; "Manter o meu texto" or the text changing drops it and reports it (online only);
 * a refusal says why in two parts, and the control reads "Tentar de novo" or is disabled (the daily
 * limit).
 */

const REL = '019966b0-0000-7000-8000-000000000901';
const BLOCK = '019966b0-0000-7000-8000-000000000902';
const AUTHOR = { companyId: '019966b0-0000-7000-8000-000000000903', actorId: '019966b0-0000-7000-8000-000000000904' };
const TARGET: AudioTarget = { type: 'item', block_id: BLOCK, item_key: 'contatos' };
const LABEL = 'observação do item 8';
const NAME = ui.aiWrite.name(LABEL);
const RETRY_NAME = ui.aiWrite.retryName(LABEL);
const FORMER = { text: 'contato fase b aquecido oxidado' };
const MINE = 'contato fase b aquecido oxidado, 23 graus';
const PROPOSED = 'Contatos da fase B com sinais de aquecimento e oxidação, 23 graus.';
const RUN_ID = '019966b0-0000-7000-8000-000000000905';
const speech = syllables(tone(0.3, 0.002), tone(0, 0.002));

const comparisonOf = (mine: string, proposed: string): AiComparison => ({
  mine: [{ kind: 'paragraph', segments: [{ text: mine, changed: false }] }],
  proposed: [{ kind: 'paragraph', segments: aiRewriteDiff(mine, proposed) }],
});
const proposal = (runId: string | null = RUN_ID): AiProposal => ({ target: TARGET, source: MINE, text: PROPOSED, runId, comparison: comparisonOf(MINE, PROPOSED) });
const proposed = (runId: string | null = RUN_ID): AiProposeOutcome => ({ kind: 'proposed', proposal: proposal(runId) });

function Harness({
  online = true,
  aiPropose,
  aiUse,
  aiUndo,
  aiReport,
  children,
  ai = true,
  world = fakeRecorderWorld(),
}: {
  online?: boolean;
  aiPropose?: AiProposeRun;
  aiUse?: AiUse;
  aiUndo?: AiUndo;
  aiReport?: AiReport;
  children: React.ReactNode;
  ai?: boolean;
  world?: ReturnType<typeof fakeRecorderWorld>;
}) {
  return (
    <AiFeaturesContext value={ai}>
      <AudioRecorderCore
        deps={world.deps}
        online={online}
        relatorioId={REL}
        author={AUTHOR}
        commit={() => Promise.resolve()}
        wakeLock={() => Promise.resolve(null)}
        {...(aiPropose === undefined ? {} : { aiPropose })}
        {...(aiUse === undefined ? {} : { aiUse })}
        {...(aiUndo === undefined ? {} : { aiUndo })}
        {...(aiReport === undefined ? {} : { aiReport })}
      >
        {children}
      </AudioRecorderCore>
    </AiFeaturesContext>
  );
}

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('31.10-WEB-001 the field bar', () => {
  it('the bar sits in the tray after the field: the audio control at its start, the AI control at its end; no `.audio-tools`', () => {
    const { container } = render(
      <Harness aiPropose={vi.fn<AiProposeRun>()}>
        <textarea className="observation-field" aria-label="Observação" defaultValue={MINE} />
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    const tray = container.querySelector('textarea + .field-tray');
    expect(tray).not.toBeNull();
    const bar = tray!.querySelector(':scope > .field-bar')!;
    expect(bar.firstElementChild).toHaveClass('audio-rec');
    expect(bar.lastElementChild).toHaveClass('ai-write');
    const button = screen.getByRole('button', { name: NAME });
    expect(button).toHaveClass('ai-btn');
    expect(button.querySelector('use')?.getAttribute('href')).toMatch(/#i-sparkles$/);
    expect(button).toHaveTextContent(ui.aiWrite.label);
    expect(container.querySelector('.audio-tools')).toBeNull();
  });

  it('absent on an empty field, with AI features off, read-only, or with no runner mounted; a bar with no control is not drawn', () => {
    const run = vi.fn<AiProposeRun>();
    const { container, rerender } = render(
      <Harness aiPropose={run}>
        <AudioField target={TARGET} label={LABEL} text="   " />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
    // An empty field still has its audio control.
    expect(container.querySelector('.field-bar .audio-btn')).not.toBeNull();
    rerender(
      <Harness aiPropose={run} ai={false}>
        <AudioField target={TARGET} label={LABEL} text="texto" />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
    expect(container.querySelector('.field-tray')).toBeNull();
    rerender(
      <Harness aiPropose={run}>
        <AudioField target={TARGET} label={LABEL} text="texto" readOnly />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
    expect(container.querySelector('.field-tray')).toBeNull();
    rerender(
      <Harness>
        <AudioField target={TARGET} label={LABEL} text="texto" />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
  });

  it('a composed text the field shows counts as text (aiText); a field not stored yet (ai={false}) has the audio control only', () => {
    render(
      <Harness aiPropose={vi.fn<AiProposeRun>()}>
        <AudioField target={TARGET} label={LABEL} text={null} aiText="Texto composto." />
        <AudioField target={{ type: 'photo_caption', file_id: BLOCK }} label="legenda" text="Lote." ai={false} />
      </Harness>,
    );
    expect(screen.getByRole('button', { name: NAME })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ui.aiWrite.name('legenda') })).toBeNull();
    expect(screen.getByRole('button', { name: ui.audio.record('legenda') })).toBeInTheDocument();
  });

  it('while the field records, its audio control reads "Parar" and the AI control is disabled until the recording ends', async () => {
    const world = fakeRecorderWorld();
    world.setSource(speech);
    const run = vi.fn<AiProposeRun>();
    render(
      <Harness aiPropose={run} world={world}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: ui.audio.record(LABEL) }));
    const stop = screen.getByRole('button', { name: ui.audio.stop(LABEL) });
    expect(stop).toHaveAttribute('aria-pressed', 'true');
    const ai = screen.getByRole('button', { name: NAME });
    expect(ai).toHaveAttribute('aria-disabled', 'true');
    expect(ai).toHaveAccessibleDescription(ui.aiWrite.recordingReason);
    await userEvent.click(ai);
    expect(run).not.toHaveBeenCalled();
    act(() => world.advance(3000));
    await userEvent.click(stop);
    await flush();
    expect(screen.getByRole('button', { name: NAME })).not.toHaveAttribute('aria-disabled');
  });
});

describe('31.9-WEB-002 offline: disabled with its reason, nothing queued', () => {
  it('"Precisa de conexão" describes the disabled control and a tap runs nothing', async () => {
    const run = vi.fn<AiProposeRun>();
    render(
      <Harness online={false} aiPropose={run}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    const button = screen.getByRole('button', { name: NAME });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(ui.aiWrite.needsConnection);
    await userEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('31.10-WEB-002 the comparison: nothing written until "Usar o texto da IA"', () => {
  it('"Escrevendo" while it runs; then both texts side by side, the changed words marked, numbers never; no write', async () => {
    let finish: (outcome: AiProposeOutcome) => void = () => undefined;
    const run = vi.fn<AiProposeRun>(() => new Promise((resolve) => (finish = resolve)));
    const use = vi.fn<AiUse>();
    const { container } = render(
      <Harness aiPropose={run} aiUse={use}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    expect(run).toHaveBeenCalledWith(TARGET);
    const button = screen.getByRole('button', { name: NAME });
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => finish(proposed()));
    const tray = container.querySelector('.field-tray')!;
    expect(tray).toHaveAttribute('data-state', 'comparing');
    const mine = screen.getByRole('region', { name: ui.aiWrite.mine });
    const theirs = screen.getByRole('region', { name: ui.aiWrite.proposed });
    expect(mine).toHaveTextContent(MINE);
    expect(theirs).toHaveTextContent(PROPOSED);
    // The user's side comes first, then the proposal.
    expect(mine.compareDocumentPosition(theirs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const marks = [...theirs.querySelectorAll('mark.ai-changed')].map((mark) => mark.textContent);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.join(' ')).not.toMatch(/23/);
    expect(mine.querySelector('mark')).toBeNull();
    // The bar holds the two choices in place of both controls.
    expect(screen.getByRole('button', { name: ui.aiWrite.keepName(LABEL) })).toHaveClass('btn-text');
    expect(screen.getByRole('button', { name: ui.aiWrite.useName(LABEL) })).toHaveClass('btn-primary');
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
    expect(screen.queryByRole('button', { name: ui.audio.record(LABEL) })).toBeNull();
    expect(screen.getByTestId('audio-announcer')).toHaveTextContent(ui.aiWrite.proposedAnnounce);
    expect(use).not.toHaveBeenCalled();
  });

  it('"Usar o texto da IA" writes the proposal; "Texto melhorado por IA" with "Desfazer" once the field holds it; "Desfazer" puts the former text back', async () => {
    const run = vi.fn<AiProposeRun>(() => Promise.resolve(proposed()));
    const use = vi.fn<AiUse>(() => Promise.resolve({ kind: 'written', former: FORMER }));
    const undo = vi.fn<AiUndo>(() => Promise.resolve());
    const report = vi.fn<AiReport>(() => Promise.resolve());
    const view = (text: string) => (
      <Harness aiPropose={run} aiUse={use} aiUndo={undo} aiReport={report}>
        <AudioField target={TARGET} label={LABEL} text={text} />
      </Harness>
    );
    const { rerender } = render(view(MINE));
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: ui.aiWrite.useName(LABEL) }));
    await flush();
    expect(use).toHaveBeenCalledWith(proposal());
    expect(screen.queryByRole('region', { name: ui.aiWrite.proposed })).toBeNull();
    rerender(view(PROPOSED));
    const line = screen.getByText(ui.aiWrite.done).closest('.ai-done');
    expect(line).toHaveAttribute('role', 'status');
    // Writing the proposal is no change of text to report.
    expect(report).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: ui.aiWrite.undoName(LABEL) }));
    expect(undo).toHaveBeenCalledWith(TARGET, FORMER);
    expect(screen.queryByText(ui.aiWrite.done)).toBeNull();
  });

  it('"Usar o texto da IA" works without signal (the tap is the device\'s alone)', async () => {
    const run = vi.fn<AiProposeRun>(() => Promise.resolve(proposed()));
    const use = vi.fn<AiUse>(() => Promise.resolve({ kind: 'written', former: FORMER }));
    const view = (online: boolean) => (
      <Harness online={online} aiPropose={run} aiUse={use}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>
    );
    const { rerender } = render(view(true));
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    rerender(view(false));
    await userEvent.click(screen.getByRole('button', { name: ui.aiWrite.useName(LABEL) }));
    await flush();
    expect(use).toHaveBeenCalledTimes(1);
  });

  it('a "Usar" that finds the text changed meanwhile writes nothing and says so', async () => {
    const run = vi.fn<AiProposeRun>(() => Promise.resolve(proposed()));
    const use = vi.fn<AiUse>(() => Promise.resolve({ kind: 'refused', refusal: { kind: 'text_changed' } }));
    const report = vi.fn<AiReport>(() => Promise.resolve());
    render(
      <Harness aiPropose={run} aiUse={use} aiReport={report}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: ui.aiWrite.useName(LABEL) }));
    await flush();
    const text = aiRewriteRefusalText({ kind: 'text_changed' });
    expect(screen.getByText(text.why).closest('.ai-reason')).toHaveTextContent(text.what);
    expect(report).toHaveBeenCalledWith({ run_id: RUN_ID, outcome: 'refused', action: 'text_changed' });
  });
});

describe('31.10-WEB-003 "Manter o meu texto" and a text that changes drop the proposal', () => {
  it('"Manter o meu texto": no write, the field as it was, the bar back, and the outcome reported online', async () => {
    const run = vi.fn<AiProposeRun>(() => Promise.resolve(proposed()));
    const use = vi.fn<AiUse>();
    const report = vi.fn<AiReport>(() => Promise.reject(new Error('404')));
    const { container } = render(
      <Harness aiPropose={run} aiUse={use} aiReport={report}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: ui.aiWrite.keepName(LABEL) }));
    await flush();
    expect(use).not.toHaveBeenCalled();
    expect(container.querySelector('.ai-compare')).toBeNull();
    expect(container.querySelector('.ai-reason')).toBeNull();
    expect(screen.getByRole('button', { name: NAME })).toBeInTheDocument();
    // Fire and forget: the report's refusal (a 404 before Epic 32's route) changes nothing.
    expect(report).toHaveBeenCalledWith({ run_id: RUN_ID, outcome: 'refused', action: 'keep_mine' });
  });

  it('offline, or with no run id from an older server, nothing is reported', async () => {
    const report = vi.fn<AiReport>(() => Promise.resolve());
    const view = (online: boolean, runId: string | null) => (
      <Harness online={online} aiPropose={vi.fn<AiProposeRun>(() => Promise.resolve(proposed(runId)))} aiUse={vi.fn<AiUse>()} aiReport={report}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>
    );
    const { rerender, unmount } = render(view(true, RUN_ID));
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    rerender(view(false, RUN_ID));
    await userEvent.click(screen.getByRole('button', { name: ui.aiWrite.keepName(LABEL) }));
    expect(report).not.toHaveBeenCalled();
    unmount();
    render(view(true, null));
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: ui.aiWrite.keepName(LABEL) }));
    expect(report).not.toHaveBeenCalled();
  });

  it('the field\'s text changes while the comparison is open: the proposal goes, one line says why, the outcome is reported', async () => {
    const run = vi.fn<AiProposeRun>(() => Promise.resolve(proposed()));
    const use = vi.fn<AiUse>();
    const report = vi.fn<AiReport>(() => Promise.resolve());
    const view = (text: string) => (
      <Harness aiPropose={run} aiUse={use} aiReport={report}>
        <AudioField target={TARGET} label={LABEL} text={text} />
      </Harness>
    );
    const { container, rerender } = render(view(MINE));
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    expect(container.querySelector('.ai-compare')).not.toBeNull();
    rerender(view(`${MINE}, lado B`));
    await flush();
    expect(container.querySelector('.ai-compare')).toBeNull();
    const text = aiRewriteRefusalText({ kind: 'text_changed' });
    const line = container.querySelector('.ai-reason')!;
    expect(line).toHaveAttribute('role', 'status');
    expect(line.querySelector('.ai-reason-what')).toHaveTextContent(text.what);
    expect(line.querySelector('.ai-reason-why')).toHaveTextContent(text.why);
    expect(screen.getByRole('button', { name: RETRY_NAME })).toHaveTextContent(ui.aiWrite.retry);
    expect(use).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith({ run_id: RUN_ID, outcome: 'refused', action: 'text_changed' });
  });

  it('leaving the screen drops the proposal and writes nothing', async () => {
    const use = vi.fn<AiUse>();
    const { rerender } = render(
      <Harness aiPropose={vi.fn<AiProposeRun>(() => Promise.resolve(proposed()))} aiUse={use}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    rerender(<Harness aiUse={use}>{null}</Harness>);
    rerender(
      <Harness aiPropose={vi.fn<AiProposeRun>()} aiUse={use}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    expect(screen.queryByRole('region', { name: ui.aiWrite.proposed })).toBeNull();
    expect(use).not.toHaveBeenCalled();
  });
});

describe('31.10-WEB-004 a refusal says why, in two parts', () => {
  const cases: { name: string; outcome: () => Promise<AiProposeOutcome>; refusal: Parameters<typeof aiRewriteRefusalText>[0] }[] = [
    { name: 'the guard refused a number', outcome: () => Promise.resolve({ kind: 'refused', refusal: { kind: 'guard', guard_kinds: ['number'] }, runId: RUN_ID }), refusal: { kind: 'guard', guard_kinds: ['number'] } },
    { name: 'the guard refused a result word', outcome: () => Promise.resolve({ kind: 'refused', refusal: { kind: 'guard', guard_kinds: ['result'] }, runId: RUN_ID }), refusal: { kind: 'guard', guard_kinds: ['result'] } },
    { name: 'the provider failed', outcome: () => Promise.resolve({ kind: 'refused', refusal: { kind: 'failed' }, runId: RUN_ID }), refusal: { kind: 'failed' } },
    { name: 'the call threw', outcome: () => Promise.reject(new Error('offline')), refusal: { kind: 'failed' } },
    { name: 'the per-user limit', outcome: () => Promise.resolve({ kind: 'refused', refusal: { kind: 'rate_limited' }, runId: null }), refusal: { kind: 'rate_limited' } },
    { name: 'the server not caught up', outcome: () => Promise.resolve({ kind: 'refused', refusal: { kind: 'not_caught_up' }, runId: null }), refusal: { kind: 'not_caught_up' } },
  ];
  for (const one of cases) {
    it(`${one.name}: the line inside the box above the bar, the control reads "Tentar de novo", until the field changes`, async () => {
      const run = vi.fn<AiProposeRun>(one.outcome);
      const view = (text: string) => (
        <Harness aiPropose={run}>
          <AudioField target={TARGET} label={LABEL} text={text} />
        </Harness>
      );
      const { container, rerender } = render(view(MINE));
      await userEvent.click(screen.getByRole('button', { name: NAME }));
      await flush();
      const text = aiRewriteRefusalText(one.refusal);
      const tray = container.querySelector('.field-tray')!;
      expect(tray).toHaveAttribute('data-state', 'refused');
      const line = tray.querySelector('.ai-reason')!;
      expect(line.querySelector('.ai-reason-what')).toHaveTextContent(text.what);
      expect(line.querySelector('.ai-reason-why')).toHaveTextContent(text.why);
      // Above the bar.
      expect(line.compareDocumentPosition(tray.querySelector('.field-bar')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const retry = screen.getByRole('button', { name: RETRY_NAME });
      expect(retry).toHaveTextContent(ui.aiWrite.retry);
      expect(retry).not.toHaveAttribute('aria-disabled');
      await userEvent.click(retry);
      expect(run).toHaveBeenCalledTimes(2);
      await flush();
      rerender(view(`${MINE}, lado B`));
      expect(container.querySelector('.ai-reason')).toBeNull();
      expect(screen.getByRole('button', { name: NAME })).toHaveTextContent(ui.aiWrite.label);
    });
  }

  it('the daily limit: the line says why and the control is disabled with that reason; a tap runs nothing', async () => {
    const run = vi.fn<AiProposeRun>(() => Promise.resolve({ kind: 'refused', refusal: { kind: 'daily_limit' }, runId: null }));
    render(
      <Harness aiPropose={run}>
        <AudioField target={TARGET} label={LABEL} text={MINE} />
      </Harness>,
    );
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await flush();
    const text = aiRewriteRefusalText({ kind: 'daily_limit' });
    expect(document.querySelector('.ai-reason-why')).toHaveTextContent(text.why);
    const button = screen.getByRole('button', { name: NAME });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(text.why);
    await userEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('31.10-WEB-005 the route refusals by kind (aiRouteRefusal)', () => {
  it('quota_exceeded is the daily limit, rate_limited the per-user limit, not_caught_up the barrier, anything else a failure', () => {
    expect(aiRouteRefusal(new SyncRequestError({ kind: 'http', status: 429, code: 'quota_exceeded' }))).toEqual({ kind: 'daily_limit' });
    expect(aiRouteRefusal(new SyncRequestError({ kind: 'http', status: 429, code: 'rate_limited' }))).toEqual({ kind: 'rate_limited' });
    expect(aiRouteRefusal(new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up' }))).toEqual({ kind: 'not_caught_up' });
    expect(aiRouteRefusal(new SyncRequestError({ kind: 'http', status: 500 }))).toEqual({ kind: 'failed' });
    expect(aiRouteRefusal(new SyncRequestError({ kind: 'network' }))).toEqual({ kind: 'failed' });
    expect(aiRouteRefusal(new Error('boom'))).toEqual({ kind: 'failed' });
  });
});
