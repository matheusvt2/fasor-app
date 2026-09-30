import { describe, expect, it } from 'vitest';
import { AI_READING_KINDS, readingNeedsAi } from './ai.ts';

describe('readingNeedsAi (Story 11.8 follow-up, AI_FEATURES)', () => {
  it.each([
    ['plate', true],
    ['panel', true],
    ['caption', true],
    ['nc_obs', true],
    ['display', false],
  ] as const)('%s needs the LLM step: %s', (kind, expected) => {
    expect(readingNeedsAi(kind)).toBe(expected);
  });

  it('lists exactly the four LLM kinds', () => {
    expect([...AI_READING_KINDS].sort()).toEqual(['caption', 'nc_obs', 'panel', 'plate']);
  });
});
