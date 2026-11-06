import { getDefinition } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { groupRead } from './eval-group-read.ts';

/*
 * e21a (R-2): the eval's group column reads the kernel classification the job stores
 * (`vectorGroupReadOf`), so an entry the job drops is printed as dropped, never as a code.
 */

const field = (version: string) => getDefinition(version, 'cabine_primaria', 'transformador_forca').nameplate.find((candidate) => candidate.key === 'ligacao_secundaria')!;
const ocr = {
  tokens: [
    { id: 't0', text: 'LIGAÇÃO' },
    { id: 't1', text: 'Dyn1' },
    { id: 't2', text: 'H1' },
  ],
};
const result = (value: unknown, ocr_token_ids: string[]) => ({ output: { values: [{ key: 'ligacao_secundaria', value, ocr_token_ids, confidence: 0.9 }] } }) as never;

describe('e21a groupRead (bedrock-eval)', () => {
  it('an entry citing an id the OCR did not return reads "- (dropped)", as the job stores nothing', () => {
    expect(groupRead(result('Dyn1', ['t1', 't99']), field('v11'), ocr)).toBe('- (dropped)');
    expect(groupRead(result('Dy1', ['t2', 't99']), field('v11'), ocr)).toBe('- (dropped)');
  });

  it('printed, diagram, other group, unparsed, a v11 value naming no option, and no entry', () => {
    expect(groupRead(result('Dyn1', ['t1']), field('v11'), ocr)).toBe('Dyn1');
    expect(groupRead(result('Dy1', ['t2']), field('v11'), ocr)).toBe('Dy1 (diagram)');
    expect(groupRead(result('Dy1', ['t1']), field('v11'), ocr)).toBe('Dy1 (other group)');
    expect(groupRead(result(' Y ', ['t0']), field('v10'), ocr)).toBe('"Y"');
    expect(groupRead(result('Y', ['t0']), field('v11'), ocr)).toBe('- (dropped)');
    expect(groupRead({ output: { values: [] } } as never, field('v11'), ocr)).toBe('-');
  });
});
