import { describe, expect, it } from 'vitest';
import { equipmentMatchKey, isTagTaken, LEGACY_TAG_PREFIX, legacySuggestTag, locationCode, normalizeTag, reuseKeyFor, shortName, suggestTag, TAG_PREFIX, type TagEquipment } from './tag.ts';

const live = (tag: string): TagEquipment => ({ tag, removed_at: null });
const removed = (tag: string): TagEquipment => ({ tag, removed_at: '2026-09-07T10:00:00.000Z' });
const coluna5 = { kind: 'coluna' as const, name: 'Coluna 5' };

describe('4.1-UNIT suggestTag, kept frozen as legacySuggestTag by Story 24.8', () => {
  it('names a block by type prefix and column code, numbering a second one', () => {
    expect(legacySuggestTag('chave_seccionadora', coluna5, [])).toBe('SEC-C05');
    expect(legacySuggestTag('chave_seccionadora', coluna5, [live('SEC-C05')])).toBe('SEC-C05-2');
    expect(legacySuggestTag('chave_seccionadora', coluna5, [live('SEC-C05'), live('SEC-C05-2')])).toBe('SEC-C05-3');
    expect(legacySuggestTag('disjuntor_mt', coluna5, [])).toBe('DJ-C05');
    expect(legacySuggestTag('tp', coluna5, [])).toBe('TP-C05');
    expect(legacySuggestTag('tc', coluna5, [])).toBe('TC-C05');
    expect(legacySuggestTag('cabos_entrada', coluna5, [])).toBe('CE-C05');
    expect(legacySuggestTag('cabos_saida', coluna5, [])).toBe('CS-C05');
    expect(legacySuggestTag('para_raio', coluna5, [])).toBe('PR-C05');
  });

  it('numbers transformers across the whole project, freeing removed ones', () => {
    expect(legacySuggestTag('transformador_forca', coluna5, [live('TR-1'), live('TR-2')])).toBe('TR-3');
    expect(legacySuggestTag('transformador_forca', { kind: 'cabine', name: 'Oxigênio' }, [])).toBe('TR-1');
    expect(legacySuggestTag('transformador_forca', coluna5, [live('TR-1'), removed('TR-2'), live('TR-3')])).toBe('TR-2');
    expect(legacySuggestTag('transformador_forca', coluna5, [live('tr-1')])).toBe('TR-2');
  });

  it('uses the cabine short name when the block sits on the cabine itself', () => {
    expect(legacySuggestTag('cabos_entrada', { kind: 'cabine', name: 'Cubículo Enel' }, [])).toBe('CE-ENEL');
    expect(legacySuggestTag('cabos_entrada', { kind: 'cabine', name: '1° Subsolo' }, [])).toBe('CE-SUBSOLO');
    expect(legacySuggestTag('cabos_entrada', { kind: 'cabine', name: 'Cobertura A' }, [])).toBe('CE-CA');
    expect(legacySuggestTag('cabos_entrada', { kind: 'cabine', name: 'Oxigênio' }, [])).toBe('CE-OXIGENIO');
  });

  it('never suggests a tag a live row holds, whatever its case, and ignores removed rows', () => {
    expect(legacySuggestTag('chave_seccionadora', coluna5, [live(' sec-c05 ')])).toBe('SEC-C05-2');
    expect(legacySuggestTag('chave_seccionadora', coluna5, [removed('SEC-C05')])).toBe('SEC-C05');
  });

  it('has one prefix per equipment type', () => {
    expect(Object.keys(TAG_PREFIX).sort()).toEqual([
      'cabos_entrada',
      'cabos_saida',
      'chave_seccionadora',
      'chave_transferencia_automatica',
      'disjuntor_mt',
      'inspecao_qgbt',
      'malha_aterramento',
      'para_raio',
      'quadro_eletrico',
      'tc',
      'tp',
      'transformador_forca',
    ]);
    // Story 24.8: the frozen table names the same types, and only the seccionadora differs.
    expect(Object.keys(LEGACY_TAG_PREFIX).sort()).toEqual(Object.keys(TAG_PREFIX).sort());
    const differs = Object.keys(TAG_PREFIX).filter((type) => TAG_PREFIX[type as keyof typeof TAG_PREFIX] !== LEGACY_TAG_PREFIX[type as keyof typeof TAG_PREFIX]);
    expect(differs).toEqual(['chave_seccionadora']);
    expect([TAG_PREFIX.chave_seccionadora, LEGACY_TAG_PREFIX.chave_seccionadora]).toEqual(['SC', 'SEC']);
  });

  it('a company type keeps its own prefix under the frozen rule', () => {
    expect(legacySuggestTag('type:019966b0-0070-7000-8000-000000000001', coluna5, [], { tag_prefix: 'NB' })).toBe('NB-C05');
  });
});

describe('24.8-UNIT suggestTag: PREFIX-NN, the smallest number free in the obra', () => {
  it('a relatório with no breaker: DJ-01, then DJ-02; the local never enters', () => {
    expect(suggestTag('disjuntor_mt', [])).toBe('DJ-01');
    expect(suggestTag('disjuntor_mt', [live('DJ-01')])).toBe('DJ-02');
    expect(suggestTag('chave_seccionadora', [])).toBe('SC-01');
    expect(suggestTag('chave_transferencia_automatica', [])).toBe('CTA-01');
    expect(suggestTag('cabos_entrada', [live('CE-ENEL')])).toBe('CE-01');
  });

  it('a TAG takes its number whatever its zeros and case: "TR-1" and "TR-2" give TR-03', () => {
    expect(suggestTag('transformador_forca', [live('TR-1'), live('TR-2')])).toBe('TR-03');
    expect(suggestTag('transformador_forca', [live('tr-001'), live(' TR-02 ')])).toBe('TR-03');
    expect(suggestTag('transformador_forca', [live('TR-1'), live('TR-3')])).toBe('TR-02');
  });

  it('a removed row never counts, and a TAG not of the PREFIX-number form takes no number', () => {
    expect(suggestTag('disjuntor_mt', [removed('DJ-01')])).toBe('DJ-01');
    expect(suggestTag('disjuntor_mt', [live('DJ-C05'), live('DJ-01A'), live('QM8'), live('DJX-01')])).toBe('DJ-01');
  });

  it('two digits up to 99, then three from 100', () => {
    const ninetyNine = Array.from({ length: 99 }, (_, n) => live(`DJ-${String(n + 1).padStart(2, '0')}`));
    expect(suggestTag('disjuntor_mt', ninetyNine)).toBe('DJ-100');
    expect(suggestTag('disjuntor_mt', [...ninetyNine, live('DJ-100')])).toBe('DJ-101');
  });

  it('a company type with its own prefix shares that prefix\'s numbers', () => {
    const copy = 'type:019966b0-0070-7000-8000-000000000001';
    expect(suggestTag(copy, [live('TR-01'), live('TR-02')], { tag_prefix: 'TR' })).toBe('TR-03');
    expect(suggestTag(copy, [], { tag_prefix: 'NB' })).toBe('NB-01');
  });
});

describe('24.21-UNIT equipmentMatchKey and reuseKeyFor', () => {
  it('a row matches by its stored key, else by its TAG, both trimmed and uppercased', () => {
    expect(equipmentMatchKey({ tag: '52-1', reuse_key: 'DJ-C05' })).toBe('DJ-C05');
    expect(equipmentMatchKey({ tag: ' dj-c05 ' })).toBe('DJ-C05');
    expect(equipmentMatchKey({ tag: 'QM8', reuse_key: ' dj-c05-2' })).toBe('DJ-C05-2');
  });

  it('the palette key is the frozen rule\'s TAG at the local, free among the obra\'s live match keys', () => {
    const keyed = (tag: string, key: string, removedAt: string | null = null) => ({ tag, reuse_key: key, removed_at: removedAt });
    expect(reuseKeyFor('disjuntor_mt', coluna5, [])).toBe('DJ-C05');
    // A keyed row counts by its key, not its TAG.
    expect(reuseKeyFor('disjuntor_mt', coluna5, [keyed('52-1', 'DJ-C05')])).toBe('DJ-C05-2');
    expect(reuseKeyFor('disjuntor_mt', coluna5, [keyed('DJ-C05', 'DJ-C06')])).toBe('DJ-C05');
    // A row from before the story counts by its TAG.
    expect(reuseKeyFor('disjuntor_mt', coluna5, [live('DJ-C05')])).toBe('DJ-C05-2');
    // A removed row never counts.
    expect(reuseKeyFor('disjuntor_mt', coluna5, [keyed('52-1', 'DJ-C05', '2026-10-01T10:00:00.000Z')])).toBe('DJ-C05');
    expect(reuseKeyFor('chave_seccionadora', coluna5, [])).toBe('SEC-C05');
    expect(reuseKeyFor('transformador_forca', { kind: 'cabine', name: 'Oxigênio' }, [keyed('TF-A', 'TR-1')])).toBe('TR-2');
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
