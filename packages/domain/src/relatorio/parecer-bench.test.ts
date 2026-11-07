import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { composeParecer, effectiveParecer, PARECER_VERDICTS, parecerLooser, parecerReasonText } from './parecer.ts';
import { isEquipmentBlock } from './sheet-state.ts';

/*
 * e22f S7: the Etapa 6 render's parecer reads over the 94-sheet Porto Seguro snapshot, as stored
 * (seed v1) and rewritten to v11, timed. Logged for the PR (no timing assertion: the host varies).
 */

function fixture(seed: 'v1' | 'v11'): RelatorioSnapshot {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  if (seed === 'v1') return snapshot;
  return {
    ...snapshot,
    relatorio: { ...snapshot.relatorio, seed_version: 'v11' },
    blocks: snapshot.blocks.map((block) =>
      isEquipmentBlock(block) ? ({ ...block, seed_version: 'v11', config: defaultBlockConfig('v11', block.block_type as EquipmentBlockType) } as BlockRow) : block,
    ),
  };
}

/** One Etapa 6 render: the verdict, the reason line, the composed summary and the three segments. */
function etapa6(snapshot: RelatorioSnapshot): unknown[] {
  return [effectiveParecer(snapshot), parecerReasonText(snapshot), composeParecer(snapshot).text, ...PARECER_VERDICTS.map((v) => parecerLooser(snapshot, v))];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe('e22f S7 benchmark: the Etapa 6 parecer reads on the 94-sheet Porto Seguro snapshot', () => {
  for (const seed of ['v1', 'v11'] as const) {
    it(`seed ${seed}`, () => {
      const base = fixture(seed);
      expect(base.blocks.filter(isEquipmentBlock).length).toBe(94);
      etapa6(base);
      // A first render (every block new) and a re-render after one block changed (a new snapshot object, the other 93 blocks the same rows).
      const cold: number[] = [];
      const one: number[] = [];
      for (let i = 0; i < 7; i++) {
        const fresh = { ...base, blocks: base.blocks.map((block) => ({ ...block })) };
        let t = performance.now();
        etapa6(fresh);
        cold.push(performance.now() - t);
        const index = fresh.blocks.findIndex(isEquipmentBlock);
        const changed = { ...fresh, blocks: fresh.blocks.map((block, n) => (n === index ? { ...block } : block)) };
        t = performance.now();
        etapa6(changed);
        one.push(performance.now() - t);
      }
      console.log(`E22F-BENCH seed=${seed} cold_median_ms=${median(cold).toFixed(1)} one_block_changed_median_ms=${median(one).toFixed(1)}`);
    });
  }
});
