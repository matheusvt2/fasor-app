import { describe, expect, it } from 'vitest';
import { FUNCAO_KEYS } from '../schemas/block-config.ts';
import { defaultLocalName, FUNCAO_OPTIONS, funcaoLabel, takesBlocks } from './local.ts';

/*
 * 14.2-UNIT: a local's Função as the surfaces read it. One function gives the label
 * (the tree, the composer card and the dialog call it), one the name the dialog proposes.
 */
describe('14.2-UNIT funcaoLabel', () => {
  it('labels the four reserved keys as the mock words them', () => {
    expect(FUNCAO_KEYS.map((key) => funcaoLabel(key))).toEqual(['Entrada', 'Primária', 'Transformação', 'Distribuição']);
  });

  it('gives a typed name back trimmed, and null when the local holds none', () => {
    expect(funcaoLabel('Medição')).toBe('Medição');
    expect(funcaoLabel('  Medição  ')).toBe('Medição');
    expect(funcaoLabel(null)).toBeNull();
    expect(funcaoLabel(undefined)).toBeNull();
    expect(funcaoLabel('   ')).toBeNull();
  });

  it('a typed text equal to a key reads as that key (Design Notes: accepted)', () => {
    expect(funcaoLabel('primaria')).toBe('Primária');
    expect(funcaoLabel(' entrada ')).toBe('Entrada');
    // Only the exact key is reserved: its label typed by hand stays what was typed.
    expect(funcaoLabel('Primária')).toBe('Primária');
    expect(funcaoLabel('PRIMARIA')).toBe('PRIMARIA');
  });
});

describe('14.2-UNIT FUNCAO_OPTIONS and defaultLocalName', () => {
  it('lists the reserved Funções in the dialog order, key and label', () => {
    expect(FUNCAO_OPTIONS).toEqual([
      { key: 'entrada', label: 'Entrada' },
      { key: 'primaria', label: 'Primária' },
      { key: 'transformacao', label: 'Transformação' },
      { key: 'distribuicao', label: 'Distribuição' },
    ]);
  });

  it('proposes the mock names for the keys, and "Cabine de ⟨função⟩" in lower case for a typed one', () => {
    expect(FUNCAO_KEYS.map(defaultLocalName)).toEqual(['Cabine de entrada', 'Cabine primária', 'Cabine de transformação', 'Cabine de distribuição']);
    expect(defaultLocalName('Medição')).toBe('Cabine de medição');
    expect(defaultLocalName('  Geração Própria ')).toBe('Cabine de geração própria');
    expect(defaultLocalName('')).toBe('Cabine');
    expect(defaultLocalName('   ')).toBe('Cabine');
  });
});

describe('14.2-UNIT takesBlocks', () => {
  it('a local and a coluna take blocks; a painel only groups colunas', () => {
    expect(takesBlocks({ kind: 'cabine' })).toBe(true);
    expect(takesBlocks({ kind: 'coluna' })).toBe(true);
    expect(takesBlocks({ kind: 'painel' })).toBe(false);
  });
});
