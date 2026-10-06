import { describe, expect, it } from 'vitest';
import { betterReading, shouldEscalate } from './escalate.ts';

const rows = (...trust: ('suggested' | 'verify')[]) => trust.map((value) => ({ trust: value }));

describe('11.6-UNIT plate escalation', () => {
  it('escalates when more than half of the suggestions are verify, or when there is none', () => {
    expect(shouldEscalate(rows('verify', 'verify', 'suggested'), 40)).toBe(true);
    expect(shouldEscalate(rows('verify'), 40)).toBe(true);
    expect(shouldEscalate([], 40)).toBe(true);
    expect(shouldEscalate(rows('verify', 'suggested'), 40)).toBe(false);
    expect(shouldEscalate(rows('verify', 'verify', 'suggested', 'suggested'), 40)).toBe(false);
    expect(shouldEscalate(rows('suggested', 'suggested'), 40)).toBe(false);
  });

  it('never escalates an OCR read with no word: a second model has nothing to cite', () => {
    expect(shouldEscalate([], 0)).toBe(false);
    expect(shouldEscalate(rows('verify', 'verify'), 0)).toBe(false);
    expect(shouldEscalate([], 1)).toBe(true);
  });

  it('keeps the reading with more suggested values; on a tie the one with more rows; then the escalation', () => {
    const first = rows('verify', 'verify', 'suggested');
    const more = rows('verify', 'suggested', 'suggested');
    const sameMoreRows = rows('suggested', 'verify', 'verify', 'verify');
    const sameFewerRows = rows('suggested');
    const fewer = rows('verify', 'verify', 'verify');
    expect(betterReading(first, more)).toBe(more);
    expect(betterReading(first, sameMoreRows)).toBe(sameMoreRows);
    expect(betterReading(first, sameFewerRows)).toBe(first);
    expect(betterReading(first, fewer)).toBe(first);
    expect(betterReading(more, first)).toBe(more);
    // Same counts and rows: the escalation, the stronger model, wins.
    const twin = rows('verify', 'verify', 'suggested');
    expect(betterReading(first, twin)).toBe(twin);
  });

  it('an escalation that returns only verify rows replaces an empty first reading', () => {
    const none: { trust: 'suggested' | 'verify' }[] = [];
    const verifyOnly = rows('verify', 'verify', 'verify');
    expect(betterReading(none, verifyOnly)).toBe(verifyOnly);
  });

  it('an escalation with no rows, or fewer rows and no more suggested, never beats the first', () => {
    const eleven = rows(...Array<'suggested'>(10).fill('suggested'), 'verify');
    const none: { trust: 'suggested' | 'verify' }[] = [];
    expect(betterReading(eleven, none)).toBe(eleven);
    expect(betterReading(eleven, rows('suggested', 'suggested'))).toBe(eleven);
    expect(betterReading(rows('verify', 'verify'), none)).toEqual(rows('verify', 'verify'));
    expect(betterReading(none, rows('suggested'))).toEqual(rows('suggested'));
  });
});
