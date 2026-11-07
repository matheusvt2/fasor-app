import { describe, expect, it } from 'vitest';
import { ocrReadResultSchema, structuringOutputSchema, type StructuringOutput } from '../contract/ocr.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { buildReadingSuggestions, type BuildReadingSuggestionsInput } from './build.ts';

/*
 * Stories 22.7 and 22.9 (seed v12), plumbing tests: the kernel composes what the model reports
 * (P-1/P-2). A transformer plate printing its oil class and no insulation word suggests the oil
 * insulation to verify; a TC plate printing "0,6C25" suggests EXATIDÃO 0,6; an unparsable class is
 * dropped. Fake answers only, no model.
 */

const uuid = (n: number) => `019966b0-0224-7000-8000-${n.toString(16).padStart(12, '0')}`;
const box = (n: number): [number, number, number, number] => [10 * n, 10, 10 * n + 8, 20];

function counter(start = 100): () => string {
  let n = start;
  return () => uuid(n++);
}

const ocrOf = (words: string[]) =>
  ocrReadResultSchema.parse({ image: { width: 1600, height: 1100 }, tokens: words.map((text, i) => ({ id: `t${i}`, text, bbox: box(i), confidence: 0.99 })), preprocessing_applied: false });
const values = (rows: StructuringOutput['values']): StructuringOutput => structuringOutputSchema.parse({ values: rows });
const value = (key: string, v: unknown, ids: string[]) => ({ key, value: v, ocr_token_ids: ids, confidence: 0.9 }) as StructuringOutput['values'][number];

function input(blockType: string, seedVersion: string, words: string[], output: StructuringOutput): BuildReadingSuggestionsInput {
  return {
    relatorioId: uuid(1),
    photoId: uuid(2),
    runId: uuid(3),
    block: { id: uuid(4), seed_version: seedVersion, block_type: blockType, sheet: { nameplate: {}, checklist: {}, test: {} } as unknown as BlockRow['sheet'] },
    ocr: ocrOf(words),
    image: { width: 1600, height: 1100 },
    output,
    promptVersion: 'fake-1',
    registry: { manufacturers: [], voltageClasses: [] },
    newId: counter(),
  };
}

const rowOf = (rows: { target_path: string }[], key: string) => rows.find((row) => row.target_path.endsWith(`/${key}`));

describe('22.7 plumbing: the oil class composes the oil insulation (seed v12)', () => {
  const words = ['TIPO', 'TRICAST', 'Tipo', 'óleo', 'isolante', 'B'];
  const answer = values([value('tipo', 'TRICAST', ['t1']), value('tipo_do_oleo', 'B', ['t2', 't3', 't4', 't5'])]);

  it('"Tipo óleo isolante B" and "TIPO TRICAST" with no insulation word: TIPO DO ÓLEO B, TIPO TRICAST, TIPO DE ISOLAÇÃO ÓLEO MINERAL to verify citing the oil words', () => {
    const { rows, dropped } = buildReadingSuggestions(input('transformador_forca', 'v12', words, answer));
    expect(dropped).toEqual([]);
    expect(rowOf(rows, 'tipo_do_oleo')).toMatchObject({ value: 'B' });
    expect(rowOf(rows, 'tipo')).toMatchObject({ value: 'TRICAST' });
    expect(rowOf(rows, 'tipo_de_isolacao')).toMatchObject({ value: 'ÓLEO MINERAL', trust: 'verify', source: { ocr_token_ids: ['t2', 't3', 't4', 't5'] } });
    // In the nameplate's order: TIPO, TIPO DE ISOLAÇÃO, TIPO DO ÓLEO.
    expect(rows.map((row) => row.target_path.split('/').at(-1))).toEqual(['tipo', 'tipo_de_isolacao', 'tipo_do_oleo']);
  });

  it('an insulation the model read stands; v11 (no TIPO DO ÓLEO) composes nothing', () => {
    const read = values([value('tipo_de_isolacao', 'EPÓXI', ['t0']), value('tipo_do_oleo', 'B', ['t5'])]);
    expect(rowOf(buildReadingSuggestions(input('transformador_forca', 'v12', words, read)).rows, 'tipo_de_isolacao')).toMatchObject({ value: 'EPÓXI' });
    const v11 = buildReadingSuggestions(input('transformador_forca', 'v11', words, answer));
    expect(rowOf(v11.rows, 'tipo_de_isolacao')).toBeUndefined();
    expect(v11.dropped).toEqual([{ key: 'tipo_do_oleo', reason: 'unknown_key' }]);
  });

  it('an older ÓLEO read on v12 is stored as ÓLEO MINERAL', () => {
    const { rows } = buildReadingSuggestions(input('transformador_forca', 'v12', ['ÓLEO'], values([value('tipo_de_isolacao', 'ÓLEO', ['t0'])])));
    expect(rowOf(rows, 'tipo_de_isolacao')).toMatchObject({ value: 'ÓLEO MINERAL' });
  });
});

describe('22.9 plumbing: the printed class reaches EXATIDÃO through the parser (seed v12)', () => {
  it('a TC printing "0,6C25" suggests EXATIDÃO 0,6; "10P20" suggests 10P; an unparsable class is dropped', () => {
    expect(rowOf(buildReadingSuggestions(input('tc', 'v12', ['0,6C25'], values([value('exatidao', '0,6C25', ['t0'])]))).rows, 'exatidao')).toMatchObject({ value: '0,6' });
    expect(rowOf(buildReadingSuggestions(input('tc', 'v12', ['10P20'], values([value('exatidao', '10P20', ['t0'])]))).rows, 'exatidao')).toMatchObject({ value: '10P' });
    const bad = buildReadingSuggestions(input('tc', 'v12', ['C25'], values([value('exatidao', 'C25', ['t0'])])));
    expect(bad.rows).toEqual([]);
    expect(bad.dropped).toEqual([{ key: 'exatidao', reason: 'invalid_shape' }]);
  });

  it('a class the select does not offer is dropped (5P on a TP); a v11 TC keeps EXATIDÃO as printed text', () => {
    expect(buildReadingSuggestions(input('tp', 'v12', ['5P10'], values([value('exatidao', '5P10', ['t0'])]))).dropped).toEqual([{ key: 'exatidao', reason: 'invalid_shape' }]);
    expect(rowOf(buildReadingSuggestions(input('tc', 'v11', ['0,6C25'], values([value('exatidao', '0,6C25', ['t0'])]))).rows, 'exatidao')).toMatchObject({ value: '0,6C25' });
  });
});
