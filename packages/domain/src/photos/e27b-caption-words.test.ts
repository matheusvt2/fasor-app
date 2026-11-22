import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { getSeed } from '../seed/definitions.ts';
import { STANDARD_SUBSOLO_NAME, standardTemplate } from '../seed/template.ts';
import { CAPTION_EQUIPMENT_WORDS, captionPartsOf, captionWordFor, composeCaption, equipmentChipOptions, type CaptionParts } from './caption.ts';

/*
 * Story 27.8 (batch e27b, F30 and F35): the caption words of a v17 relatório. The surge arrester's sheet names it
 * "para-raios" (seed flag `caption_para_raios`), and "limpeza e reaperto" keeps "da" while its participle reads
 * "realizados" (the seed word's `participle`); a v16 sheet keeps "para-raio" and "realizada". The standard template
 * built after this story names its second local "1º Subsolo" (U+00BA).
 */

/** The surge arrester's caption word on the version's rule-built relatório (its first para_raio sheet). */
function arresterWord(version: string) {
  const snapshot = layoutLockSnapshot(version);
  const arrester = snapshot.blocks.find((block) => block.block_type === 'para_raio' && block.removed_at === null)!;
  expect(arrester.seed_version).toBe(version);
  return equipmentChipOptions(snapshot, arrester.id)[0]!;
}

const limpeza = (version: string) => captionWordFor('limpeza e reaperto', 'atividade', getSeed(version, 'cabine_primaria').atividades, [])!;

describe('27.8-UNIT the caption words of a v17 relatório; a v16 one keeps its own', () => {
  it('the surge arrester reads "para-raios" on a v17 sheet and "para-raio" on a v16 one, masculine singular both', () => {
    expect(arresterWord('v17')).toEqual({ name: 'para-raios', gender: 'm', number: 'singular' });
    expect(arresterWord('v16')).toEqual({ name: 'para-raio', gender: 'm', number: 'singular' });
    expect(CAPTION_EQUIPMENT_WORDS.para_raio.name).toBe('para-raio');
  });

  it('"limpeza e reaperto" composes "Detalhe da limpeza e reaperto realizados no para-raios" on v17, "realizada no para-raio" on v16', () => {
    expect(limpeza('v17')).toEqual({ name: 'limpeza e reaperto', gender: 'f', number: 'singular', participle: { gender: 'm', number: 'plural' } });
    expect(limpeza('v16')).toEqual({ name: 'limpeza e reaperto', gender: 'f', number: 'singular' });
    expect(composeCaption({ atividade: limpeza('v17'), equipamento: arresterWord('v17'), local: null })).toBe('Detalhe da limpeza e reaperto realizados no para-raios');
    expect(composeCaption({ atividade: limpeza('v16'), equipamento: arresterWord('v16'), local: null })).toBe('Detalhe da limpeza e reaperto realizada no para-raio');
  });

  it('a word with no participle reads as before on v17 ("Detalhe dos ensaios de resistência de isolação realizados")', () => {
    const word = captionWordFor('ensaios de resistência de isolação', 'atividade', getSeed('v17', 'cabine_primaria').atividades, [])!;
    expect(word.participle).toBeUndefined();
    expect(composeCaption({ atividade: word, equipamento: null, local: null })).toBe('Detalhe dos ensaios de resistência de isolação realizados');
  });

  it('a stored v17 caption opens in the composer on the parts it was composed of, the participle kept apart from the article', () => {
    const prefill: CaptionParts = { atividade: null, equipamento: arresterWord('v17'), local: null };
    const stored = 'Detalhe da limpeza e reaperto realizados no para-raios';
    expect(captionPartsOf(stored, prefill, { atividades: getSeed('v17', 'cabine_primaria').atividades })).toEqual({ ...prefill, atividade: limpeza('v17') });
    // The v16 spelling of the same words is not v17's composition: it opens as free text there.
    expect(captionPartsOf('Detalhe da limpeza e reaperto realizada no para-raios', prefill, { atividades: getSeed('v17', 'cabine_primaria').atividades })).toEqual({
      ...prefill,
      atividade: { name: 'limpeza e reaperto', gender: 'f', number: 'singular' },
    });
  });

  it('the standard template built after Story 27.8 names its second local "1º Subsolo", the ordinal sign, on every seed', () => {
    expect(STANDARD_SUBSOLO_NAME).toBe('1º Subsolo');
    for (const seedVersion of ['v16', 'v17']) {
      const names = standardTemplate({ id: '019966b0-0278-7000-8000-000000000001', seedVersion }).skeleton.filter((node) => node.parent_ref === null).map((node) => node.name);
      expect(names, seedVersion).toEqual(['Cubículo Enel', '1º Subsolo', 'Oxigênio', 'Cobertura A', 'Cobertura B', 'Geradores']);
      expect(names.some((name) => name.includes('°')), seedVersion).toBe(false);
    }
  });
});
