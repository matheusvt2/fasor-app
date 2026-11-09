import { describe, expect, it, vi } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { derivedPoints } from './derived.ts';

/*
 * Batch e23h, after merging e23v (Story 23.6): the recommendation (Story 23.11) starts only a
 * `reading` entry, a failed test; a `restricao` entry (a reading within its criterion, restricted)
 * keeps e23v's own composed text even when its test carries a recommendation. The seeds are frozen
 * and never carry one, so the v13 cable's definition is given one here through the resolver the
 * derivation reads (`blockDefinitionIn`). Synthetic text.
 */

const RECOMMENDATION = 'Recomendação sintética do ensaio de isolação';

vi.mock('../seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../seed/definitions.ts')>();
  return {
    ...actual,
    blockDefinitionIn: (...args: Parameters<typeof actual.blockDefinitionIn>) => {
      const definition = actual.blockDefinitionIn(...args);
      if (definition === null || definition.block_type !== 'cabos_entrada') return definition;
      const tests = definition.tests.map((test) => (test.key === 'isolacao' ? { ...test, recommendation: RECOMMENDATION } : test));
      return { ...definition, tests } as BlockDefinition;
    },
  };
});

let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: `019966b0-0e23-7000-8000-${(++opCounter).toString(16).padStart(12, '0')}` });
const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });

function cableWith(snapshot: RelatorioSnapshot, readings: readonly (readonly [string, string])[]): BlockRow {
  const cable = structuredClone(snapshot.blocks.find((block) => block.block_type === 'cabos_entrada' && block.removed_at === null)!);
  for (const [row, raw] of readings) cable.sheet.test.isolacao!.cells[row]!['1'] = cell(measured(raw, 'GΩ'));
  snapshot.blocks = snapshot.blocks.map((block) => (block.id === cable.id ? cable : block));
  return cable;
}

describe('23.11-UNIT the recommendation never starts a restricao entry (e23v merged)', () => {
  it('a restricted cable whose test recommends keeps e23v\'s restricao text, byte-equal', () => {
    const snapshot = structuredClone(layoutLockSnapshot('v13'));
    const cable = cableWith(snapshot, [
      ['0', '5'],
      ['1', '5'],
      ['2', '1.5'],
      ['3', '5'],
    ]);
    const entry = derivedPoints(snapshot).find((one) => one.key === `restricao:${cable.id}:isolacao`)!;
    expect(entry.kind).toBe('restricao');
    expect(entry.text).toBe('Ensaio de isolação: valor dentro do critério, com restrição (Fase C: abaixo de 50 % da maior leitura)');
    expect(entry.text).not.toContain(RECOMMENDATION);
  });

  it('the same cable with a reading out of its criterion derives a reading entry that starts with the recommendation', () => {
    const snapshot = structuredClone(layoutLockSnapshot('v13'));
    const cable = cableWith(snapshot, [
      ['0', '5'],
      ['1', '5'],
      ['2', '0.001'],
      ['3', '5'],
    ]);
    const entries = derivedPoints(snapshot).filter((one) => one.block_id === cable.id && (one.kind === 'reading' || one.kind === 'restricao'));
    expect(entries.map((one) => one.kind)).toEqual(['reading']);
    expect(entries[0]!.text.startsWith(`${RECOMMENDATION}. `)).toBe(true);
  });
});
