import { afterEach, describe, expect, it, vi } from 'vitest';
import { enabledSubBlocksOf } from '../relatorio/sheet-state.ts';
import { blockConfigWithSubBlock } from '../relatorio/measurement-evaluation.ts';
import { findDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { enabledSubBlocks } from './compose.ts';

/*
 * Epic 14 QA Q-12: `enabledSubBlocks` reads a type's locked measurement tests at the block's
 * own seed version, never at `SEED_VERSION` whatever the block says. No shipped version yet
 * makes a locked test switchable, so the lookup itself is pinned: the definition is asked for
 * at the version handed in (the block row's, through `enabledSubBlocksOf`), and only a version
 * that does not ship the type falls back to the current one.
 */

vi.mock('../seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../seed/definitions.ts')>();
  return { ...actual, findDefinition: vi.fn(actual.findDefinition) };
});

const CTA = 'chave_transferencia_automatica';
const E4 = 'cta_ajustes_controlador';

afterEach(() => {
  vi.mocked(findDefinition).mockClear();
});

describe('Epic 14 QA Q-12: the locked tests are read at the block\'s own seed version', () => {
  it('asks the definition at the version handed in, and at the current one only when that version does not ship the type', () => {
    // E4 is locked on the CTA: switched off in the config, it stays in.
    const config = blockConfigWithSubBlock(defaultBlockConfig('v5', CTA), E4, false) as Parameters<typeof enabledSubBlocks>[0];
    expect(enabledSubBlocks(config, 'v5')).toContain(E4);
    expect(vi.mocked(findDefinition).mock.calls).toEqual([['v5', CTA]]);
    vi.mocked(findDefinition).mockClear();
    // v4 ships no CTA: read at v4 first, then the current version.
    expect(enabledSubBlocks(config, 'v4')).toContain(E4);
    expect(vi.mocked(findDefinition).mock.calls).toEqual([
      ['v4', CTA],
      [SEED_VERSION, CTA],
    ]);
  });

  it('enabledSubBlocksOf hands the block row\'s seed_version, the current one for a caller with no row, each kept apart', () => {
    const config = blockConfigWithSubBlock(defaultBlockConfig('v5', CTA), E4, false);
    expect(enabledSubBlocksOf({ config, seed_version: 'v5' })).toContain(E4);
    expect(vi.mocked(findDefinition).mock.calls.at(-1)).toEqual(['v5', CTA]);
    vi.mocked(findDefinition).mockClear();
    // The same config object read for another version is judged again, not served from the first answer.
    enabledSubBlocksOf({ config, seed_version: 'v4' });
    expect(vi.mocked(findDefinition).mock.calls[0]).toEqual(['v4', CTA]);
    vi.mocked(findDefinition).mockClear();
    enabledSubBlocksOf({ config: blockConfigWithSubBlock(defaultBlockConfig('v5', CTA), E4, false) });
    expect(vi.mocked(findDefinition).mock.calls[0]).toEqual([SEED_VERSION, CTA]);
  });
});
