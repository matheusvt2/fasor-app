import { describe, expect, it, vi } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { pointsSummary } from '../points/summary.ts';
import { composeParecer, derivedParecer, effectiveParecer, PARECER_VERDICTS, parecerLooser, parecerReasonText } from './parecer.ts';
import { isEquipmentBlock } from './sheet-state.ts';

/*
 * e22f S7: the parecer readers share one reading evaluation per sheet. The evaluator is wrapped
 * with a counter (the memo in `sheet-evaluation.ts` imports it from `reading-evaluation.ts`), and
 * one Etapa 6 render over the 94-sheet Porto Seguro snapshot must evaluate each sheet at most
 * once; a re-render after one sheet changed evaluates that sheet alone.
 */

const calls = vi.hoisted(() => ({ count: 0 }));
vi.mock('./reading-evaluation.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./reading-evaluation.ts')>();
  return {
    ...actual,
    evaluateSheetReadings: (...args: Parameters<typeof actual.evaluateSheetReadings>) => {
      calls.count += 1;
      return actual.evaluateSheetReadings(...args);
    },
  };
});

describe('e22f S7: one reading evaluation per sheet per render', () => {
  it('Etapa 6 (verdict, reason line, summary, three segments, the points count) evaluates each of the 94 sheets once; a changed sheet alone again', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const sheets = snapshot.blocks.filter((block) => block.removed_at === null && isEquipmentBlock(block));
    expect(sheets).toHaveLength(94);
    const render = (s: typeof snapshot) => {
      derivedParecer(s);
      effectiveParecer(s);
      parecerReasonText(s);
      composeParecer(s);
      for (const verdict of PARECER_VERDICTS) parecerLooser(s, verdict);
      pointsSummary(s);
    };
    calls.count = 0;
    render(snapshot);
    const first = calls.count;
    // At most once per sheet (a not-tested sheet is never evaluated by the floor).
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(sheets.length);
    // The same rows again: nothing is evaluated.
    calls.count = 0;
    render({ ...snapshot });
    expect(calls.count).toBe(0);
    // One sheet changed (a new row object): that sheet alone.
    const target = sheets.find((block) => block.not_tested === null)!;
    calls.count = 0;
    render({ ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === target.id ? { ...block } : block)) });
    expect(calls.count).toBe(1);
  });
});
