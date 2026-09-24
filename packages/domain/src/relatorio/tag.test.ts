import { describe, expect, it } from 'vitest';
import { isTagTaken, locationCode, normalizeTag, shortName, suggestTag, TAG_PREFIX, type TagEquipment } from './tag.ts';

const live = (tag: string): TagEquipment => ({ tag, removed_at: null });
const removed = (tag: string): TagEquipment => ({ tag, removed_at: '2026-09-07T10:00:00.000Z' });
const coluna5 = { kind: 'coluna' as const, name: 'Coluna 5' };

describe('4.1-UNIT suggestTag', () => {
  it('names a block by type prefix and column code, numbering a second one', () => {
    expect(suggestTag('chave_seccionadora', coluna5, [])).toBe('SEC-C05');
    expect(suggestTag('chave_seccionadora', coluna5, [live('SEC-C05')])).toBe('SEC-C05-2');
    expect(suggestTag('chave_seccionadora', coluna5, [live('SEC-C05'), live('SEC-C05-2')])).toBe('SEC-C05-3');
    expect(suggestTag('disjuntor_mt', coluna5, [])).toBe('DJ-C05');
    expect(suggestTag('tp', coluna5, [])).toBe('TP-C05');
    expect(suggestTag('tc', coluna5, [])).toBe('TC-C05');
    expect(suggestTag('cabos_entrada', coluna5, [])).toBe('CE-C05');
    expect(suggestTag('cabos_saida', coluna5, [])).toBe('CS-C05');
    expect(suggestTag('para_raio', coluna5, [])).toBe('PR-C05');
  });

  it('numbers transformers across the whole project, freeing removed ones', () => {
    expect(suggestTag('transformador_forca', coluna5, [live('TR-1'), live('TR-2')])).toBe('TR-3');
    expect(suggestTag('transformador_forca', { kind: 'cabine', name: 'Oxigênio' }, [])).toBe('TR-1');
    expect(suggestTag('transformador_forca', coluna5, [live('TR-1'), removed('TR-2'), live('TR-3')])).toBe('TR-2');
    expect(suggestTag('transformador_forca', coluna5, [live('tr-1')])).toBe('TR-2');
  });

  it('uses the cabine short name when the block sits on the cabine itself', () => {
    expect(suggestTag('cabos_entrada', { kind: 'cabine', name: 'Cubículo Enel' }, [])).toBe('CE-ENEL');
    expect(suggestTag('cabos_entrada', { kind: 'cabine', name: '1° Subsolo' }, [])).toBe('CE-SUBSOLO');
    expect(suggestTag('cabos_entrada', { kind: 'cabine', name: 'Cobertura A' }, [])).toBe('CE-CA');
    expect(suggestTag('cabos_entrada', { kind: 'cabine', name: 'Oxigênio' }, [])).toBe('CE-OXIGENIO');
  });

  it('never suggests a tag a live row holds, whatever its case, and ignores removed rows', () => {
    expect(suggestTag('chave_seccionadora', coluna5, [live(' sec-c05 ')])).toBe('SEC-C05-2');
    expect(suggestTag('chave_seccionadora', coluna5, [removed('SEC-C05')])).toBe('SEC-C05');
  });

  it('has one prefix per equipment type', () => {
    expect(Object.keys(TAG_PREFIX).sort()).toEqual([
      'cabos_entrada',
      'cabos_saida',
      'chave_seccionadora',
      'disjuntor_mt',
      'para_raio',
      'tc',
      'tp',
      'transformador_forca',
    ]);
  });
});

describe('4.1-UNIT locationCode and shortName', () => {
  it('zero-pads a column number to two digits', () => {
    expect(locationCode({ kind: 'coluna', name: 'Coluna 5' })).toBe('C05');
    expect(locationCode({ kind: 'coluna', name: 'coluna 12' })).toBe('C12');
    expect(locationCode({ kind: 'coluna', name: 'Coluna 105' })).toBe('C105');
    expect(locationCode({ kind: 'coluna', name: 'Entrada' })).toBe('ENTRADA');
  });

  it('shortens a name: last token, initials when the last token is one character, no diacritics', () => {
    expect(shortName('Cubículo Enel')).toBe('ENEL');
    expect(shortName('1° Subsolo')).toBe('SUBSOLO');
    expect(shortName('1º Subsolo')).toBe('SUBSOLO');
    expect(shortName('Cobertura A')).toBe('CA');
    expect(shortName('Cobertura Lado B')).toBe('CLB');
    expect(shortName('Geradores')).toBe('GERADORES');
    expect(shortName('Cabine 7')).toBe('CABINE');
    expect(shortName('   ')).toBe('LOCAL');
  });
});

describe('4.1-UNIT isTagTaken and normalizeTag', () => {
  it('compares trimmed and uppercased, live rows only', () => {
    const rows = [live('SEC-C05'), removed('DJ-C05')];
    expect(isTagTaken('SEC-C05', rows)).toBe(true);
    expect(isTagTaken('sec-c05', rows)).toBe(true);
    expect(isTagTaken(' SEC-C05 ', rows)).toBe(true);
    expect(isTagTaken('DJ-C05', rows)).toBe(false);
    expect(normalizeTag('  tp-c05 ')).toBe('TP-C05');
  });
});
