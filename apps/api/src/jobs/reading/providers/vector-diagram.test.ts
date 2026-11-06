import { describe, expect, it } from 'vitest';
import { vectorGroupKeyOf, withVectorDiagram } from './vector-diagram.ts';

/*
 * e21f: the fold of the drawn diagram's facts into the group field's structured value, row by row
 * of the spec's I/O matrix that does not need the job (the job rows are in `job.integration.test.ts`).
 */

const KEY = 'ligacao_secundaria';
const tokens = [
  { id: 't0', text: 'LIGAÇÃO' },
  { id: 't1', text: 'Dyn1' },
  { id: 't2', text: 'H1' },
  { id: 't3', text: 'H2' },
  { id: 't4', text: 'X0' },
  { id: 't5', text: 'Dyn' },
  { id: 't6', text: '1' },
];
const yyn0 = { hv_shape: 'star', hv_neutral: false, lv_shape: 'star', lv_neutral: true, x1_hours: 0, ocr_token_ids: ['t2', 't3', 't4'] };
const other = { key: 'identificacao', value: 'TR-03', ocr_token_ids: ['t0'], confidence: 0.97 };
const composed = { key: KEY, value: 'Yyn0', ocr_token_ids: ['t2', 't3', 't4'], confidence: 0.5 };

describe('e21f withVectorDiagram', () => {
  it('drawn Yyn0, no group value: the composed entry is appended citing the diagram labels', () => {
    expect(withVectorDiagram({ values: [other], vector_diagram: yyn0 }, KEY, tokens)).toEqual({ values: [other, composed] });
  });

  it('a printed Dyn1 citing its word wins; the diagram is ignored', () => {
    const printed = { key: KEY, value: 'Dyn1', ocr_token_ids: ['t1'], confidence: 0.95 };
    expect(withVectorDiagram({ values: [printed], vector_diagram: yyn0 }, KEY, tokens)).toEqual({ values: [printed] });
    // A group printed over two words ("Dyn" "1"), cited out of order, still prints it.
    const split = { key: KEY, value: 'Dyn1', ocr_token_ids: ['t6', 't5'], confidence: 0.95 };
    expect(withVectorDiagram({ values: [split], vector_diagram: yyn0 }, KEY, tokens)).toEqual({ values: [split] });
  });

  it('a group composed by the model ("Dy1" citing "H1") is replaced by the diagram, in place', () => {
    const wrong = { key: KEY, value: 'Dy1', ocr_token_ids: ['t2'], confidence: 0.9 };
    expect(withVectorDiagram({ values: [wrong, other], vector_diagram: yyn0 }, KEY, tokens)).toEqual({ values: [composed, other] });
  });

  it('an unparsed entry ("Y", the v9/v10 text) is replaced, even when it cites a printed group', () => {
    for (const ocr_token_ids of [['t0'], ['t1']]) {
      const unparsed = { key: KEY, value: 'Y', ocr_token_ids, confidence: 0.9 };
      expect(withVectorDiagram({ values: [unparsed], vector_diagram: yyn0 }, KEY, tokens)).toEqual({ values: [composed] });
    }
  });

  it('an entry citing unknown or malformed ids prints nothing and is replaced', () => {
    for (const ocr_token_ids of [['t99'], 't1', null, [7]]) {
      const entry = { key: KEY, value: 'Dyn1', ocr_token_ids, confidence: 0.9 };
      expect(withVectorDiagram({ values: [entry], vector_diagram: yyn0 }, KEY, tokens)).toEqual({ values: [composed] });
    }
  });

  it('a null or absent diagram: the input unchanged but for the stripped key', () => {
    const entry = { key: KEY, value: 'Dy1', ocr_token_ids: ['t2'], confidence: 0.9 };
    expect(withVectorDiagram({ values: [entry], vector_diagram: null }, KEY, tokens)).toEqual({ values: [entry] });
    const absent = { values: [entry] };
    expect(withVectorDiagram(absent, KEY, tokens)).toBe(absent);
  });

  it('an uncomposable diagram adds nothing and keeps an existing entry', () => {
    const entry = { key: KEY, value: 'Dy1', ocr_token_ids: ['t2'], confidence: 0.9 };
    for (const facts of [
      { ...yyn0, hv_shape: 'delta', hv_neutral: true },
      { ...yyn0, x1_hours: 4 },
      { ...yyn0, lv_neutral: false, x1_hours: 1 },
    ]) {
      expect(withVectorDiagram({ values: [other], vector_diagram: facts }, KEY, tokens)).toEqual({ values: [other] });
      expect(withVectorDiagram({ values: [entry], vector_diagram: facts }, KEY, tokens)).toEqual({ values: [entry] });
    }
  });

  it('a malformed diagram is ignored like null', () => {
    const missing: Record<string, unknown> = { ...yyn0 };
    delete missing.x1_hours;
    for (const facts of [{ ...yyn0, x1_hours: 12 }, { ...yyn0, x1_hours: 1.5 }, { ...yyn0, x1_hours: '0' }, missing, { ...yyn0, lv_shape: 'triangle' }, { ...yyn0, ocr_token_ids: ['H1'] }, 'Yyn0', [yyn0], 0]) {
      expect(withVectorDiagram({ values: [other], vector_diagram: facts }, KEY, tokens)).toEqual({ values: [other] });
    }
  });

  it('extra keys in the facts are stripped, not refused', () => {
    expect(withVectorDiagram({ values: [], vector_diagram: { ...yyn0, note: 'two stars' } }, KEY, tokens)).toEqual({ values: [composed] });
  });

  it('a diagram citing no token is folded as an uncited entry (withoutUncitedValues drops it next)', () => {
    expect(withVectorDiagram({ values: [other], vector_diagram: { ...yyn0, ocr_token_ids: [] } }, KEY, tokens)).toEqual({ values: [other, { ...composed, ocr_token_ids: [] }] });
  });

  it('no vector-group key: the diagram is stripped and ignored', () => {
    expect(withVectorDiagram({ values: [other], vector_diagram: yyn0 }, undefined, tokens)).toEqual({ values: [other] });
  });

  it('a malformed input is returned for the schema to judge; a values that is not an array keeps it, stripped', () => {
    for (const input of [null, 'values', [1], undefined]) expect(withVectorDiagram(input, KEY, tokens)).toBe(input);
    expect(withVectorDiagram({ values: 'x', vector_diagram: yyn0 }, KEY, tokens)).toEqual({ values: 'x' });
  });

  it('the zigzag and neutral letters reach the fold: YNzn11 composes, ZNz0 (no table row) does not', () => {
    const facts = { hv_shape: 'zigzag', hv_neutral: true, lv_shape: 'zigzag', lv_neutral: false, x1_hours: 0, ocr_token_ids: ['t2'] };
    // ZNz0 is not a table row; YNzn11 is.
    expect(withVectorDiagram({ values: [], vector_diagram: facts }, KEY, tokens)).toEqual({ values: [] });
    expect(withVectorDiagram({ values: [], vector_diagram: { ...facts, hv_shape: 'star', lv_neutral: true, x1_hours: 11 } }, KEY, tokens)).toEqual({ values: [{ ...composed, value: 'YNzn11', ocr_token_ids: ['t2'] }] });
  });
});

describe('e21f vectorGroupKeyOf', () => {
  const fields = [{ key: 'identificacao' }, { key: KEY }] as never;
  it('the key when it names one of the fields, else undefined', () => {
    expect(vectorGroupKeyOf({ fields, vectorGroupKey: KEY })).toBe(KEY);
    expect(vectorGroupKeyOf({ fields, vectorGroupKey: 'nao_existe' })).toBeUndefined();
    expect(vectorGroupKeyOf({ fields })).toBeUndefined();
    expect(vectorGroupKeyOf({ vectorGroupKey: KEY })).toBeUndefined();
    expect(vectorGroupKeyOf(undefined)).toBeUndefined();
  });
});
