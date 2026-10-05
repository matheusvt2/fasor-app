import { describe, expect, it } from 'vitest';
import { betterReading, shouldEscalate } from './escalate.ts';

const rows = (...trust: ('suggested' | 'verify')[]) => trust.map((value) => ({ trust: value }));

describe('11.6-UNIT plate escalation', () => {
  it('escalates when more than half of the suggestions are verify, or when there is none', () => {
    expect(shouldEscalate(rows('verify', 'verify', 'suggested'))).toBe(true);
    expect(shouldEscalate(rows('verify'))).toBe(true);
    expect(shouldEscalate([])).toBe(true);
    expect(shouldEscalate(rows('verify', 'suggested'))).toBe(false);
    expect(shouldEscalate(rows('verify', 'verify', 'suggested', 'suggested'))).toBe(false);
    expect(shouldEscalate(rows('suggested', 'suggested'))).toBe(false);
  });

  it('keeps the reading with more suggested values, the first one on a tie', () => {
    const first = rows('verify', 'verify', 'suggested');
    const more = rows('verify', 'suggested', 'suggested');
    const same = rows('suggested', 'verify', 'verify', 'verify');
    const fewer = rows('verify', 'verify', 'verify');
    expect(betterReading(first, more)).toBe(more);
    expect(betterReading(first, same)).toBe(first);
    expect(betterReading(first, fewer)).toBe(first);
    expect(betterReading(more, first)).toBe(more);
  });

  it('an escalation with no rows, or fewer rows and no more suggested, never beats the first', () => {
    const eleven = rows(...Array<'suggested'>(10).fill('suggested'), 'verify');
    const none: { trust: 'suggested' | 'verify' }[] = [];
    expect(betterReading(eleven, none)).toBe(eleven);
    expect(betterReading(eleven, rows('suggested', 'suggested'))).toBe(eleven);
    expect(betterReading(rows('verify', 'verify'), none)).not.toBe(none);
    expect(betterReading(none, rows('suggested'))).toEqual(rows('suggested'));
  });
});
