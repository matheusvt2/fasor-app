import { describe, expect, it } from 'vitest';
import {
  composeVectorGroup,
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
  type VectorDiagramFacts,
  type VectorGroupFactor,
  type WindingShape,
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

describe('e21a parseVectorGroup: a trailing letter I or l after a connection letter is clock 1 ("Dyn I")', () => {
  it.each([
    ['Dyn I', 'Dyn1'],
    ['DynI', 'Dyn1'],
    ['Dynl', 'Dyn1'],
    ['dyn l', 'Dyn1'],
    ['Dy I', 'Dy1'],
    ['YNd l', 'YNd1'],
    ['Yd I', 'Yd1'],
    ['(Dyn I)', 'Dyn1'],
  ])('%j reads %s', (text, code) => {
    expect(parseVectorGroup(text)?.code).toBe(code);
  });

  it.each(['Dyn II', 'Dyn ll', 'Dyn 1I', 'Dyn lI', 'Dyn Il', 'Dyn i', 'DynL', 'Yyn I', 'I', 'l', ' I ', 'Dyn I1', 'Dyn l0'])('%j reads null', (text) => {
    expect(parseVectorGroup(text)).toBeNull();
  });

  it('property: over the 47 codes, an I/l spelling of the clock reads the code only when the clock is exactly 1, never a clock 10 or 11', () => {
    const spellings = ['I', 'l', ' I', ' l'];
    for (const code of VECTOR_GROUP_CODES) {
      const clock = /\d+$/.exec(code)![0];
      const letters = code.slice(0, -clock.length);
      for (const spelling of spellings) {
        // The letters followed by one I or l: the clock-1 code when the table has it, else nothing.
        const read = parseVectorGroup(`${letters}${spelling}`)?.code ?? null;
        expect(read, `${letters}${spelling}`).toBe(VECTOR_GROUP_CODES.includes(`${letters}1`) ? `${letters}1` : null);
        if (clock === '1') expect(read, `${code} as ${letters}${spelling}`).toBe(code);
      }
      if (clock === '10' || clock === '11') {
        for (const two of ['II', 'Il', 'lI', 'll', '1I', 'I1', '1l', 'l1', 'I0', 'l0', 'I 1', '1 I']) {
          expect(parseVectorGroup(`${letters}${two}`), `${letters}${two}`).toBeNull();
        }
      }
    }
  });
});

describe('21.2-UNIT the vector-group field', () => {
  it('is the transformador de força LIGAÇÃO SECUNDÁRIA only', () => {
    // A seeded type answers by its block type, whatever the field's kind (v9/v10 kept a text field).
    expect(isVectorGroupField('transformador_forca', { key: 'ligacao_secundaria' })).toBe(true);
    expect(isVectorGroupField('transformador_forca', { key: 'ligacao_secundaria', kind: 'text' })).toBe(true);
    expect(isVectorGroupField('tp', { key: 'ligacao_secundaria', kind: 'select', options: [...VECTOR_GROUP_CODES] })).toBe(false);
    expect(isVectorGroupField('tc', { key: 'ligacao_secundaria' })).toBe(false);
    expect(isVectorGroupField('transformador_forca', { key: 'tipo' })).toBe(false);
    expect(isVectorGroupOptions([...VECTOR_GROUP_CODES])).toBe(true);
    expect(isVectorGroupOptions(['AR', 'SF6'])).toBe(false);
    expect(isVectorGroupOptions(undefined)).toBe(false);
  });

  it('e22h N9: a company type by its data, the ligacao_secundaria select of the vector-group codes', () => {
    const company = 'type:0190f5a0-0000-7000-8000-000000000001';
    expect(isVectorGroupField(company, { key: 'ligacao_secundaria', kind: 'select', options: [...VECTOR_GROUP_CODES] })).toBe(true);
    // The boundaries: another key, a text field, one code short.
    expect(isVectorGroupField(company, { key: 'ligacao', kind: 'select', options: [...VECTOR_GROUP_CODES] })).toBe(false);
    expect(isVectorGroupField(company, { key: 'ligacao_secundaria', kind: 'text' })).toBe(false);
    expect(isVectorGroupField(company, { key: 'ligacao_secundaria', kind: 'select', options: VECTOR_GROUP_CODES.slice(1) })).toBe(false);
  });
});

describe('21.2-UNIT composeVectorGroup (e21f: the model describes the diagram, the kernel composes the code)', () => {
  const SHAPE: Readonly<Record<string, WindingShape>> = { Y: 'star', D: 'delta', Z: 'zigzag' };
  /** The facts a code's drawing shows, decomposed from the code itself: HV letter and N, LV letter and n, hour. */
  function factsOf(code: string): VectorDiagramFacts {
    const match = /^(Y|D|Z)(N?)(y|d|z)(n?)(\d+)$/.exec(code);
    if (match === null) throw new Error(`cannot decompose ${code}`);
    const [, hv, hvN, lv, lvN, hours] = match;
    return { hv_shape: SHAPE[hv!]!, hv_neutral: hvN === 'N', lv_shape: SHAPE[lv!.toUpperCase()]!, lv_neutral: lvN === 'n', x1_hours: Number(hours) };
  }

  it('composes each of the 47 codes back from its facts', () => {
    expect(VECTOR_GROUP_CODES).toHaveLength(47);
    for (const code of VECTOR_GROUP_CODES) expect(composeVectorGroup(factsOf(code)), code).toBe(code);
  });

  it('the drawn Yyn0 plate: two stars, X0 at the LV centre, no H0, X1 with H1', () => {
    expect(composeVectorGroup({ hv_shape: 'star', hv_neutral: false, lv_shape: 'star', lv_neutral: true, x1_hours: 0 })).toBe('Yyn0');
    expect(composeVectorGroup({ hv_shape: 'delta', hv_neutral: false, lv_shape: 'star', lv_neutral: true, x1_hours: 1 })).toBe('Dyn1');
  });

  it('a delta with a neutral reads null', () => {
    expect(composeVectorGroup({ hv_shape: 'delta', hv_neutral: true, lv_shape: 'star', lv_neutral: true, x1_hours: 1 })).toBeNull();
    expect(composeVectorGroup({ hv_shape: 'star', hv_neutral: false, lv_shape: 'delta', lv_neutral: true, x1_hours: 1 })).toBeNull();
  });

  it.each([-1, 12, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('hour %s reads null', (hours) => {
    expect(composeVectorGroup({ hv_shape: 'delta', hv_neutral: false, lv_shape: 'star', lv_neutral: true, x1_hours: hours })).toBeNull();
  });

  it('a combination the table does not hold reads null (star-star at 1 o\'clock, star-star at 4)', () => {
    expect(composeVectorGroup({ hv_shape: 'star', hv_neutral: false, lv_shape: 'star', lv_neutral: false, x1_hours: 1 })).toBeNull();
    expect(composeVectorGroup({ hv_shape: 'star', hv_neutral: false, lv_shape: 'star', lv_neutral: false, x1_hours: 4 })).toBeNull();
  });

  it('an unknown shape or a non-boolean neutral reads null', () => {
    expect(composeVectorGroup({ hv_shape: 'triangle' as WindingShape, hv_neutral: false, lv_shape: 'star', lv_neutral: true, x1_hours: 0 })).toBeNull();
    expect(composeVectorGroup({ hv_shape: 'star', hv_neutral: false, lv_shape: 'toString' as WindingShape, lv_neutral: true, x1_hours: 0 })).toBeNull();
    expect(composeVectorGroup({ hv_shape: 'star', hv_neutral: 'no' as unknown as boolean, lv_shape: 'star', lv_neutral: true, x1_hours: 0 })).toBeNull();
  });
});
