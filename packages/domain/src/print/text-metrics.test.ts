import { describe, expect, it } from 'vitest';
import { printTextEm } from './text-metrics.ts';

/* Fix batch e23p (P2): the face's advance widths, against sums of Arial's widths done by hand. */
describe('e23p-P2 printTextEm (Arial / Liberation Sans advance widths)', () => {
  it('measures upper-case words, accents as their base letter, regular and bold', () => {
    // S 667, E 667, C 722, U 722, N 722, D 722, Á as A 667, R 722, I 278, O 778.
    expect(printTextEm('SECUNDÁRIO', false)).toBeCloseTo(6.667, 9);
    // Bold: P 667, O 778, L 611, A 722, R 722, I 278, Z 611, A 722, Ç as C 722, Ã as A 722, O 778.
    expect(printTextEm('POLARIZAÇÃO', true)).toBeCloseTo(7.333, 9);
  });

  it('measures numbers, punctuation and the sheet\'s signs', () => {
    expect(printTextEm('22,6', false)).toBeCloseTo(1.946, 9);
    // 2, 0, space, ° 0.400, C (bold 722).
    expect(printTextEm('20 °C', true)).toBeCloseTo(2.512, 9);
    // ≥ 0.550, space, 5, ., 0, 0, 0, space, M 833, Ω 0.780.
    expect(printTextEm('≥ 5.000 MΩ', false)).toBeCloseTo(5.221, 9);
    expect(printTextEm('ESTAB./10MIN', true)).toBeCloseTo(0.667 + 0.667 + 0.611 + 0.722 + 0.722 + 0.278 + 0.278 + 0.556 + 0.556 + 0.833 + 0.278 + 0.722, 9);
    expect(printTextEm('', false)).toBe(0);
  });

  it('measures lower case by its own widths, regular narrower than bold', () => {
    // m 833, é as e 556, d 556, i 222, o 556.
    expect(printTextEm('médio', false)).toBeCloseTo(2.723, 9);
    expect(printTextEm('médio', true)).toBeCloseTo(0.889 + 0.556 + 0.611 + 0.278 + 0.611, 9);
  });

  it('falls back to the class estimate for a character outside the table, bold 7 % wider', () => {
    expect(printTextEm('€', false)).toBeCloseTo(0.56, 9);
    expect(printTextEm('€', true)).toBeCloseTo(0.56 * 1.07, 9);
    expect(printTextEm('Ñ', false)).toBeCloseTo(0.72, 9);
  });
});
