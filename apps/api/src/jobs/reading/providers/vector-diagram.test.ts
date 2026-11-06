import { getDefinition } from '@app/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withoutUncitedValues } from './bedrock.ts';
import { logVectorDiagram, vectorGroupKeyOf, vectorGroupOf, withVectorDiagram, type VectorGroupTarget } from './vector-diagram.ts';

/*
 * e21f: the fold of the drawn diagram's facts into the group field's structured value, row by row
 * of the spec's I/O matrix that does not need the job (the job rows are in `job.integration.test.ts`).
 * e21a: the group field is the v11 definition (the kernel classification reads it), and every row
 * names the fold's outcome.
 */

const KEY = 'ligacao_secundaria';
const GROUP: VectorGroupTarget = { key: KEY, field: getDefinition('v11', 'cabine_primaria', 'transformador_forca').nameplate.find((field) => field.key === KEY)! };
const tokens = [
  { id: 't0', text: 'LIGAÇÃO' },
  { id: 't1', text: 'Dyn1' },
  { id: 't2', text: 'H1' },
  { id: 't3', text: 'H2' },
  { id: 't4', text: 'X0' },
  { id: 't5', text: 'Dyn' },
  { id: 't6', text: '1' },
  { id: 't7', text: 'I' },
];
const yyn0 = { hv_shape: 'star', hv_neutral: false, lv_shape: 'star', lv_neutral: true, x1_hours: 0, ocr_token_ids: ['t2', 't3', 't4'] };
const other = { key: 'identificacao', value: 'TR-03', ocr_token_ids: ['t0'], confidence: 0.97 };
const composed = { key: KEY, value: 'Yyn0', ocr_token_ids: ['t2', 't3', 't4'], confidence: 0.5 };
/** The folded tool input, for the v11 group field unless another target (or none) is given. */
const fold = (input: unknown, ...group: [VectorGroupTarget | undefined] | []) => withVectorDiagram(input, group.length === 0 ? GROUP : group[0], tokens).input;
const outcomeOf = (input: unknown, ...group: [VectorGroupTarget | undefined] | []) => withVectorDiagram(input, group.length === 0 ? GROUP : group[0], tokens).outcome;

describe('e21f withVectorDiagram', () => {
  it('drawn Yyn0, no group value: the composed entry is appended citing the diagram labels', () => {
    expect(fold({ values: [other], vector_diagram: yyn0 })).toEqual({ values: [other, composed] });
    expect(withVectorDiagram({ values: [other], vector_diagram: yyn0 }, GROUP, tokens)).toMatchObject({ outcome: 'composed', code: 'Yyn0', cited: 3, replaced: false });
  });

  it('a printed Dyn1 citing its word wins; the diagram is ignored', () => {
    const printed = { key: KEY, value: 'Dyn1', ocr_token_ids: ['t1'], confidence: 0.95 };
    expect(fold({ values: [printed], vector_diagram: yyn0 })).toEqual({ values: [printed] });
    expect(withVectorDiagram({ values: [printed], vector_diagram: yyn0 }, GROUP, tokens)).toMatchObject({ outcome: 'printed_wins', code: 'Yyn0', replaced: false });
    // A group printed over two words ("Dyn" "1"), cited out of order, still prints it; so does "Dyn" "I" (e21a).
    for (const ocr_token_ids of [['t6', 't5'], ['t5', 't7']]) {
      const split = { key: KEY, value: 'Dyn1', ocr_token_ids, confidence: 0.95 };
      expect(fold({ values: [split], vector_diagram: yyn0 })).toEqual({ values: [split] });
    }
  });

  it('a group composed by the model ("Dy1" citing "H1") is replaced by the diagram, in place', () => {
    const wrong = { key: KEY, value: 'Dy1', ocr_token_ids: ['t2'], confidence: 0.9 };
    expect(fold({ values: [wrong, other], vector_diagram: yyn0 })).toEqual({ values: [composed, other] });
    expect(withVectorDiagram({ values: [wrong, other], vector_diagram: yyn0 }, GROUP, tokens)).toMatchObject({ outcome: 'composed', replaced: true });
  });

  it('an entry naming no option ("Y") is replaced, even when it cites a printed group', () => {
    for (const ocr_token_ids of [['t0'], ['t1']]) {
      const unparsed = { key: KEY, value: 'Y', ocr_token_ids, confidence: 0.9 };
      expect(fold({ values: [unparsed], vector_diagram: yyn0 })).toEqual({ values: [composed] });
    }
  });

  it('an entry citing unknown or malformed ids prints nothing and is replaced', () => {
    for (const ocr_token_ids of [['t99'], 't1', null, [7]]) {
      const entry = { key: KEY, value: 'Dyn1', ocr_token_ids, confidence: 0.9 };
      expect(fold({ values: [entry], vector_diagram: yyn0 })).toEqual({ values: [composed] });
    }
  });

  it('review: a printed entry citing one unknown id beside its word is not a printed read (the kernel would drop it): the diagram wins', () => {
    const entry = { key: KEY, value: 'Dyn1', ocr_token_ids: ['t1', 't99'], confidence: 0.9 };
    expect(fold({ values: [entry], vector_diagram: yyn0 })).toEqual({ values: [composed] });
  });

  it('review: an entry whose words print another group ("Dy1" citing "Dyn1") is replaced by the diagram', () => {
    const entry = { key: KEY, value: 'Dy1', ocr_token_ids: ['t1'], confidence: 0.9 };
    expect(fold({ values: [entry], vector_diagram: yyn0 })).toEqual({ values: [composed] });
  });

  it('review: the diagram cites only the labels the OCR returned, deduplicated', () => {
    const facts = { ...yyn0, ocr_token_ids: ['t2', 't99', 't3', 't2', 't4'] };
    expect(fold({ values: [], vector_diagram: facts })).toEqual({ values: [composed] });
  });

  it('e21a R-1: facts with no id the OCR returned are ignored (uncited): the model\'s own entry is kept, through withoutUncitedValues too', () => {
    const dy1 = { key: KEY, value: 'Dy1', ocr_token_ids: ['t2'], confidence: 0.9 };
    for (const ocr_token_ids of [['t98', 't99'], []]) {
      const input = { values: [dy1, other], vector_diagram: { ...yyn0, ocr_token_ids } };
      const result = withVectorDiagram(input, GROUP, tokens);
      expect(result).toMatchObject({ outcome: 'uncited', code: 'Yyn0', cited: 0, replaced: false });
      expect(withoutUncitedValues(result.input)).toEqual({ values: [dy1, other] });
      // No entry: nothing to keep, and nothing is added.
      expect(withoutUncitedValues(fold({ values: [other], vector_diagram: { ...yyn0, ocr_token_ids } }))).toEqual({ values: [other] });
    }
  });

  it('e21a R-2: printed-wins is the kernel\'s classification after normalization: "Dýn1" lands on the option Dyn1 and its word prints it', () => {
    const accented = { key: KEY, value: 'Dýn1', ocr_token_ids: ['t1'], confidence: 0.9 };
    expect(withVectorDiagram({ values: [accented], vector_diagram: yyn0 }, GROUP, tokens)).toMatchObject({ outcome: 'printed_wins', input: { values: [accented] } });
  });

  it('a null or absent diagram: the input unchanged but for the stripped key', () => {
    const entry = { key: KEY, value: 'Dy1', ocr_token_ids: ['t2'], confidence: 0.9 };
    expect(fold({ values: [entry], vector_diagram: null })).toEqual({ values: [entry] });
    expect(outcomeOf({ values: [entry], vector_diagram: null })).toBe('null');
    const absent = { values: [entry] };
    expect(fold(absent)).toBe(absent);
    expect(outcomeOf(absent)).toBe('absent');
  });

  it('an uncomposable diagram adds nothing and keeps an existing entry', () => {
    const entry = { key: KEY, value: 'Dy1', ocr_token_ids: ['t2'], confidence: 0.9 };
    for (const facts of [
      { ...yyn0, hv_shape: 'delta', hv_neutral: true },
      { ...yyn0, x1_hours: 4 },
      { ...yyn0, lv_neutral: false, x1_hours: 1 },
    ]) {
      expect(fold({ values: [other], vector_diagram: facts })).toEqual({ values: [other] });
      expect(fold({ values: [entry], vector_diagram: facts })).toEqual({ values: [entry] });
      expect(withVectorDiagram({ values: [entry], vector_diagram: facts }, GROUP, tokens)).toMatchObject({ outcome: 'uncomposable', code: null, facts: { hv_shape: facts.hv_shape } });
    }
  });

  it('a malformed diagram is ignored like null', () => {
    const missing: Record<string, unknown> = { ...yyn0 };
    delete missing.x1_hours;
    for (const facts of [{ ...yyn0, x1_hours: 12 }, { ...yyn0, x1_hours: 1.5 }, { ...yyn0, x1_hours: '0' }, missing, { ...yyn0, lv_shape: 'triangle' }, { ...yyn0, ocr_token_ids: ['H1'] }, 'Yyn0', [yyn0], 0]) {
      expect(fold({ values: [other], vector_diagram: facts })).toEqual({ values: [other] });
      expect(withVectorDiagram({ values: [other], vector_diagram: facts }, GROUP, tokens)).toMatchObject({ outcome: 'malformed', facts: null, code: null });
    }
  });

  it('extra keys in the facts are stripped, not refused', () => {
    expect(fold({ values: [], vector_diagram: { ...yyn0, note: 'two stars' } })).toEqual({ values: [composed] });
  });

  it('no vector-group key: the diagram is stripped and ignored, and no outcome is reported', () => {
    expect(fold({ values: [other], vector_diagram: yyn0 }, undefined)).toEqual({ values: [other] });
    expect(outcomeOf({ values: [other], vector_diagram: yyn0 }, undefined)).toBeNull();
    expect(outcomeOf({ values: [other] }, undefined)).toBeNull();
  });

  it('a malformed input is returned for the schema to judge; a values that is not an array keeps it, stripped', () => {
    for (const input of [null, 'values', [1], undefined]) expect(fold(input)).toBe(input);
    expect(fold({ values: 'x', vector_diagram: yyn0 })).toEqual({ values: 'x' });
  });

  it('e21a review: a tool input that is not an object is malformed, not absent; a record without vector_diagram is absent', () => {
    for (const input of [null, 'values', [1], undefined]) expect(withVectorDiagram(input, GROUP, tokens)).toMatchObject({ outcome: 'malformed', facts: null, code: null });
    expect(outcomeOf({ values: [] })).toBe('absent');
    expect(withVectorDiagram({ values: 'x', vector_diagram: yyn0 }, GROUP, tokens)).toMatchObject({ outcome: 'malformed', code: 'Yyn0', facts: { hv_shape: 'star' } });
  });

  it('the zigzag and neutral letters reach the fold: YNzn11 composes, ZNz0 (no table row) does not', () => {
    const facts = { hv_shape: 'zigzag', hv_neutral: true, lv_shape: 'zigzag', lv_neutral: false, x1_hours: 0, ocr_token_ids: ['t2'] };
    // ZNz0 is not a table row; YNzn11 is.
    expect(fold({ values: [], vector_diagram: facts })).toEqual({ values: [] });
    expect(fold({ values: [], vector_diagram: { ...facts, hv_shape: 'star', lv_neutral: true, x1_hours: 11 } })).toEqual({ values: [{ ...composed, value: 'YNzn11', ocr_token_ids: ['t2'] }] });
  });
});

describe('e21a logVectorDiagram', () => {
  afterEach(() => vi.restoreAllMocks());

  it('one "reading vector diagram" line with the outcome, the code, the five facts and the counts; no OCR text', () => {
    const lines = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const wrong = { key: KEY, value: 'Dy1', ocr_token_ids: ['t2'], confidence: 0.9 };
    logVectorDiagram(withVectorDiagram({ values: [wrong], vector_diagram: yyn0 }, GROUP, tokens), 'fake');
    expect(lines).toHaveBeenCalledTimes(1);
    const text = String(lines.mock.calls[0]![0]);
    expect(JSON.parse(text)).toMatchObject({
      level: 'info',
      msg: 'reading vector diagram',
      model: 'fake',
      outcome: 'composed',
      code: 'Yyn0',
      hv_shape: 'star',
      hv_neutral: false,
      lv_shape: 'star',
      lv_neutral: true,
      x1_hours: 0,
      cited: 3,
      replaced: true,
    });
    for (const token of tokens) expect(text.includes(`"${token.text}"`), token.text).toBe(false);
    expect(text).not.toContain('Dy1');
  });

  it('a malformed diagram logs null facts; no group key logs nothing', () => {
    const lines = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logVectorDiagram(withVectorDiagram({ values: [], vector_diagram: 'Yyn0' }, GROUP, tokens), 'fake');
    expect(JSON.parse(String(lines.mock.calls[0]![0]))).toMatchObject({ outcome: 'malformed', code: null, hv_shape: null, x1_hours: null, cited: 0, replaced: false });
    lines.mockClear();
    logVectorDiagram(withVectorDiagram({ values: [], vector_diagram: yyn0 }, undefined, tokens), 'fake');
    expect(lines).not.toHaveBeenCalled();
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

  it('e21a vectorGroupOf: the key with its field definition', () => {
    const nameplate = [...getDefinition('v11', 'cabine_primaria', 'transformador_forca').nameplate];
    expect(vectorGroupOf({ fields: nameplate, vectorGroupKey: KEY })).toEqual(GROUP);
    expect(vectorGroupOf({ fields: nameplate })).toBeUndefined();
    expect(vectorGroupOf(undefined)).toBeUndefined();
  });
});
