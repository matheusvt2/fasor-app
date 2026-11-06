import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VECTOR_GROUP_CODE,
  isVectorGroupField,
  isVectorGroupOptions,
  parseVectorGroup,
  VECTOR_GROUP_CODES,
  VECTOR_GROUPS,
  vectorGroupByCode,
  vectorGroupCaptureLabel,
  vectorGroupFactor,
  vectorGroupFormulaText,
  vectorGroupShortText,
  type VectorGroupFactor,
} from './vector-group.ts';

/*
 * Story 21.1: the kernel table against the research note's table, row by row. The rows below are
 * copied verbatim from `research/ttr-vector-groups-2026-11-05/research.md` § The table, so a
 * transcription slip in `vector-group.ts` fails here.
 */
const RESEARCH_ROWS = [
  '| Dd0 [3] | H1-H3 / X1-X3 | H2-H1 / X2-X1 | H3-H2 / X3-X2 | — | 1 |',
  '| Dd6 [4] | H1-H3 / X3-X1 | H2-H1 / X1-X2 | H3-H2 / X2-X3 | — | 1 |',
  '| Dyn1 [5] | H1-H3 / X1-X0 | H2-H1 / X2-X0 | H3-H2 / X3-X0 | — | √3 |',
  '| Dyn7 [6] | H1-H3 / X0-X1 | H2-H1 / X0-X2 | H3-H2 / X0-X3 | — | √3 |',
  '| YNyn0 [7] | H1-H0 / X1-X0 | H2-H0 / X2-X0 | H3-H0 / X3-X0 | — | 1 |',
  '| YNyn6 [8] | H1-H0 / X0-X1 | H2-H0 / X0-X2 | H3-H0 / X0-X3 | — | 1 |',
  '| YNd1 [9] | H1-H0 / X1-X2 | H2-H0 / X2-X3 | H3-H0 / X3-X1 | — | 1/√3 |',
  '| YNd7 [10] | H1-H0 / X2-X1 | H2-H0 / X3-X2 | H3-H0 / X1-X3 | — | 1/√3 |',
  '| Dy1 [11] | H1-(H3-H2) / X1-X2 | H2-(H1-H3) / X2-X3 | H3-(H2-H1) / X3-X1 | H3-H2 / H1-H3 / H2-H1 | √3 |',
  '| Dyn5 [12] | H1-H3 / X3-X0 | H2-H1 / X1-X0 | H3-H2 / X2-X0 | — | √3 |',
  '| Dy5 [13] | H1-(H3-H2) / X3-X1 | H2-(H1-H3) / X1-X2 | H3-(H2-H1) / X2-X3 | H3-H2 / H1-H3 / H2-H1 | √3 |',
  '| Dy7 [14] | H1-(H3-H2) / X2-X1 | H2-(H1-H3) / X3-X2 | H3-(H2-H1) / X1-X3 | H3-H2 / H1-H3 / H2-H1 | √3 |',
  '| Dyn11 [15] | H1-H3 / X0-X3 | H2-H1 / X0-X1 | H3-H2 / X0-X2 | — | √3 |',
  '| Dy11 [16] | H1-(H3-H2) / X1-X3 | H2-(H1-H3) / X2-X1 | H3-(H2-H1) / X3-X2 | H3-H2 / H1-H3 / H2-H1 | √3 |',
  '| Dz0 [17] | H1-H3 / X1-X3 | H2-H1 / X2-X1 | H3-H2 / X3-X2 | — | 1 |',
  '| Dz6 [18] | H1-H3 / X3-X1 | H2-H1 / X1-X2 | H3-H2 / X2-X3 | — | 1 |',
  '| YNy0 [19] | H1-(H2-H0) / X1-X3 | H2-(H3-H0) / X2-X1 | H3-(H1-H0) / X3-X2 | H2-H0 / H3-H0 / H1-H0 | 1 |',
  '| Yyn0 [20] | H1-H3 / X1-X3 | H2-H1 / X2-X1 | H3-H2 / X3-X2 | — | 1 |',
  '| Yy0 [21] | H1-H3 / X1-X3 | H2-H1 / X2-X1 | H3-H2 / X3-X2 | — | 1 |',
  '| YNy6 [22] | H1-(H2-H0) / X3-X1 | H2-(H3-H0) / X1-X2 | H3-(H1-H0) / X2-X3 | H2-H0 / H3-H0 / H1-H0 | 1 |',
  '| Yyn6 [23] | H1-H3 / X3-X1 | H2-H1 / X1-X2 | H3-H2 / X2-X3 | — | 1 |',
  '| Yy6 [24] | H1-H3 / X3-X1 | H2-H1 / X1-X2 | H3-H2 / X2-X3 | — | 1 |',
  '| Yzn1 [25] | H1-H3 / X1-X0 | H2-H1 / X2-X0 | H3-H2 / X3-X0 | — | √3 |',
  '| Yz1 [26] | H1-(H3+H2) / X1-X2 | H2-(H1+H3) / X2-X3 | H3-(H2+H1) / X3-X1 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| Yzn5 [27] | H1-H3 / X3-X0 | H2-H1 / X1-X0 | H3-H2 / X2-X0 | — | √3 |',
  '| Yz5 [28] | H1-(H3+H2) / X3-X1 | H2-(H1+H3) / X1-X2 | H3-(H2+H1) / X2-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| Yzn7 [29] | H1-H3 / X0-X1 | H2-H1 / X0-X2 | H3-H2 / X0-X3 | — | √3 |',
  '| Yz7 [30] | H1-(H3+H2) / X2-X1 | H2-(H1+H3) / X3-X2 | H3-(H2+H1) / X1-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| Yzn11 [31] | H1-H3 / X0-X3 | H2-H1 / X0-X1 | H3-H2 / X0-X2 | — | √3 |',
  '| Yz11 [32] | H1-(H3+H2) / X1-X3 | H2-(H1+H3) / X2-X1 | H3-(H2+H1) / X3-X2 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| ZNy5 [33] | H1-H0 / X3-X1 | H2-H0 / X1-X2 | H3-H0 / X2-X3 | — | 1/√3 |',
  '| Zy5 [34] | H1-(H3+H2) / X3-X1 | H2-(H1+H3) / X1-X2 | H3-(H2+H1) / X2-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| ZNy11 [35] | H1-H0 / X1-X3 | H2-H0 / X2-X1 | H3-H0 / X3-X2 | — | 1/√3 |',
  '| Zy11 [36] | H1-(H3+H2) / X1-X3 | H2-(H1+H3) / X2-X1 | H3-(H2+H1) / X3-X2 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| Yd1 [37] | H1-(H3+H2) / X1-X2 | H2-(H1+H3) / X2-X3 | H3-(H2+H1) / X3-X1 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| YNd5 [38] | H1-H0 / X3-X1 | H2-H0 / X1-X2 | H3-H0 / X2-X3 | — | 1/√3 |',
  '| Yd5 [39] | H1-(H3+H2) / X3-X1 | H2-(H1+H3) / X1-X2 | H3-(H2+H1) / X2-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| Yd7 [40] | H1-(H3+H2) / X2-X1 | H2-(H1+H3) / X3-X2 | H3-(H2+H1) / X1-X3 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| YNd11 [41] | H1-H0 / X1-X3 | H2-H0 / X2-X1 | H3-H0 / X3-X2 | — | 1/√3 |',
  '| Yd11 [42] | H1-(H3+H2) / X1-X3 | H2-(H1+H3) / X2-X1 | H3-(H2+H1) / X3-X2 | H3-H2 / H1-H3 / H2-H1 | √3/2 |',
  '| Dyn3 [44] | H3-H1 / X2-X0 | H1-H2 / X3-X0 | H2-H3 / X1-X0 | — | 1/√3 (flag) |',
  '| Dy3 [45] | H1-(H3+H2) / X3-X2 | H2-(H1+H3) / X1-X3 | H3-(H2+H1) / X2-X1 | H3-H2 / H1-H3 / H2-H1 | 2/√3 (flag) |',
  '| Dyn9 [46] | H1-H3 / X2-X0 | H2-H1 / X3-X0 | H3-H2 / X1-X0 | — | 1/√3 (flag) |',
  '| Dy9 [47] | H1-(H3+H2) / X2-X3 | H2-(H1+H3) / X3-X1 | H3-(H2+H1) / X1-X2 | H3-H2 / H1-H3 / H2-H1 | 2/√3 (flag) |',
  '| YNzn1 [48] | H1-H3 / X1-X0 | H2-H1 / X2-X0 | H3-H2 / X3-X0 | — | √3 |',
  '| YNzn7 [49] | H1-H3 / X0-X1 | H2-H1 / X0-X2 | H3-H2 / X0-X3 | — | √3 |',
  '| YNzn11 [50] | H1-H3 / X0-X3 | H2-H1 / X0-X1 | H3-H2 / X0-X2 | — | √3 |',
];

const K_BY_PRINT: Readonly<Record<string, VectorGroupFactor>> = { '1': '1', '√3': 'sqrt3', '1/√3': 'inv_sqrt3', '√3/2': 'sqrt3_half', '2/√3': 'two_inv_sqrt3' };

function parseResearchRow(line: string) {
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  const [, code, row] = /^(\S+) \[(\d+)\]$/.exec(cells[0]!)!;
  const pair = (text: string) => text.split(' / ') as [string, string];
  const shorts = cells[4] === '—' ? [null, null, null] : cells[4]!.split(' / ');
  const k = K_BY_PRINT[cells[5]!.replace(' (flag)', '')]!;
  return {
    code: code!,
    row: Number(row),
    phases: [1, 2, 3].map((i) => ({ h: pair(cells[i]!)[0], x: pair(cells[i]!)[1], short: shorts[i - 1] ?? null })),
    k,
  };
}

describe('21.1-UNIT the 47 vector groups', () => {
  it('transcribe the research note table exactly, row by row, in the manual order', () => {
    expect(RESEARCH_ROWS).toHaveLength(47);
    expect(VECTOR_GROUPS).toHaveLength(47);
    RESEARCH_ROWS.forEach((line, i) => {
      const expected = parseResearchRow(line);
      expect(expected.k, line).toBeDefined();
      expect(VECTOR_GROUPS[i], expected.code).toEqual(expected);
    });
    expect(VECTOR_GROUP_CODES).toEqual(VECTOR_GROUPS.map((group) => group.code));
    expect(new Set(VECTOR_GROUP_CODES).size).toBe(47);
  });

  it('the factor counts match the research rule table (15 √3, 12 one, 8 1/√3, 10 √3/2, 2 2/√3)', () => {
    const count = (k: VectorGroupFactor) => VECTOR_GROUPS.filter((group) => group.k === k).length;
    expect([count('sqrt3'), count('1'), count('inv_sqrt3'), count('sqrt3_half'), count('two_inv_sqrt3')]).toEqual([15, 12, 8, 10, 2]);
    expect(vectorGroupFactor('1')).toBe(1);
    expect(vectorGroupFactor('sqrt3')).toBe(Math.sqrt(3));
    expect(vectorGroupFactor('inv_sqrt3')).toBe(1 / Math.sqrt(3));
    expect(vectorGroupFactor('sqrt3_half')).toBe(Math.sqrt(3) / 2);
    expect(vectorGroupFactor('two_inv_sqrt3')).toBe(2 / Math.sqrt(3));
  });

  it('Dyn1 keeps the v1 seed capture labels; a shorted group prints the manual lead', () => {
    const dyn1 = vectorGroupByCode('Dyn1')!;
    expect([0, 1, 2].map((i) => vectorGroupCaptureLabel(dyn1, i))).toEqual(['H1-H3 / X1-X0', 'H2-H1 / X2-X0', 'H3-H2 / X3-X0']);
    expect(DEFAULT_VECTOR_GROUP_CODE).toBe('Dyn1');
    const yd1 = vectorGroupByCode('Yd1')!;
    expect(vectorGroupCaptureLabel(yd1, 0)).toBe('H1-(H3+H2) / X1-X2');
    expect(vectorGroupShortText(yd1)).toBe('Curto-circuitar H3-H2 na fase A, H1-H3 na B e H2-H1 na C');
    expect(vectorGroupShortText(vectorGroupByCode('YNy0')!)).toBe('Curto-circuitar H2-H0 na fase A, H3-H0 na B e H1-H0 na C');
    expect(vectorGroupShortText(dyn1)).toBeNull();
    expect(vectorGroupCaptureLabel(dyn1, 3)).toBeNull();
  });

  it('the formula helper by factor', () => {
    expect(vectorGroupFormulaText('1')).toBe('Calculado: U1 / U2');
    expect(vectorGroupFormulaText('sqrt3')).toBe('Calculado: U1 · √3 / U2');
    expect(vectorGroupFormulaText('inv_sqrt3')).toBe('Calculado: U1 / (U2 · √3)');
    expect(vectorGroupFormulaText('sqrt3_half')).toBe('Calculado: U1 · √3 / (2 · U2)');
    expect(vectorGroupFormulaText('two_inv_sqrt3')).toBe('Calculado: 2 · U1 / (√3 · U2)');
  });
});

describe('21.1-UNIT parseVectorGroup', () => {
  it.each([
    ['DYN1', 'Dyn1'],
    ['Dyn 1', 'Dyn1'],
    ['D/yn1', 'Dyn1'],
    ['dyn-1', 'Dyn1'],
    ['dyn.1', 'Dyn1'],
    ['dyn_1', 'Dyn1'],
    [' Dyn1 ', 'Dyn1'],
    ['(Dyn1)', 'Dyn1'],
    ['Dyn1,', 'Dyn1'],
    ['Dyn1;', 'Dyn1'],
    ['YYN0', 'Yyn0'],
    ['yy0', 'Yy0'],
    ['Y/yn0', 'Yyn0'],
    ['YNyn0', 'YNyn0'],
    ['ynyn0', 'YNyn0'],
    ['YNY0', 'YNy0'],
    ['ZNy5', 'ZNy5'],
    ['zny11', 'ZNy11'],
    ['Yzn1', 'Yzn1'],
    ['YNzn11', 'YNzn11'],
    ['YNd11', 'YNd11'],
    ['Dyn11', 'Dyn11'],
    ['Dd0', 'Dd0'],
    ['Yd1', 'Yd1'],
  ])('%s reads %s', (text, code) => {
    expect(parseVectorGroup(text)?.code).toBe(code);
  });

  it('every canonical code, in upper and lower case, reads itself', () => {
    for (const code of VECTOR_GROUP_CODES) {
      expect(parseVectorGroup(code)?.code, code).toBe(code);
      expect(parseVectorGroup(code.toUpperCase())?.code, code).toBe(code);
      expect(parseVectorGroup(code.toLowerCase())?.code, code).toBe(code);
    }
  });

  it.each(['', '   ', 'Y', 'DYN', 'D', 'Dyn', 'Dyn2', 'Dyn12', 'Yy1', 'Dyn1x', 'xDyn1', 'Dyn01', 'LIG:Dyn1', 'Estrela', 'Triângulo-estrela', 'YN0', 'Dyn1 380V'])('%j reads null', (text) => {
    expect(parseVectorGroup(text)).toBeNull();
  });

  it('a non-string reads null', () => {
    for (const value of [null, undefined, 1, { code: 'Dyn1' }, ['Dyn1']]) expect(parseVectorGroup(value)).toBeNull();
  });
});

describe('21.2-UNIT the vector-group field', () => {
  it('is the transformador de força LIGAÇÃO SECUNDÁRIA only', () => {
    expect(isVectorGroupField('transformador_forca', 'ligacao_secundaria')).toBe(true);
    expect(isVectorGroupField('tp', 'ligacao_secundaria')).toBe(false);
    expect(isVectorGroupField('tc', 'ligacao_secundaria')).toBe(false);
    expect(isVectorGroupField('transformador_forca', 'tipo')).toBe(false);
    expect(isVectorGroupOptions([...VECTOR_GROUP_CODES])).toBe(true);
    expect(isVectorGroupOptions(['AR', 'SF6'])).toBe(false);
    expect(isVectorGroupOptions(undefined)).toBe(false);
  });
});
