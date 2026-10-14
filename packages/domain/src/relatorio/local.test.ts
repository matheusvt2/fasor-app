import { describe, expect, it } from 'vitest';
import { FUNCAO_KEYS } from '../schemas/block-config.ts';
import { cabineDataNoteText, defaultLocalName, FUNCAO_OPTIONS, funcaoLabel, localDialogDescription, takesBlocks } from './local.ts';

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

describe('Epic 14 QA Q-17: the local\'s copy follows the seed version', () => {
  it('"Adicionar local" names the Verificações do local on a seed with site items (mock 42) and leaves them out on v1 to v3', () => {
    for (const version of ['v4', 'v5']) {
      expect(localDialogDescription(version)).toBe(
        'Cada cabine é um local. O local guarda a função, as características da SE, o ambiente de ensaio, o agrupamento por tipo e as Verificações do local. Os equipamentos ficam direto no local ou nas colunas de um painel.',
      );
    }
    for (const version of ['v1', 'v2', 'v3']) {
      expect(localDialogDescription(version)).toBe(
        'Cada cabine é um local. O local guarda a função, as características da SE, o ambiente de ensaio e o agrupamento por tipo. Os equipamentos ficam direto no local ou nas colunas de um painel.',
      );
    }
  });

  it('the "Do local" note says where SE and AMBIENTE print: under the local\'s heading from v4, on its first sheet before', () => {
    const edit = 'Editar aqui altera o local — todas as fichas do local passam a mostrar o mesmo valor.';
    expect(cabineDataNoteText('v5')).toBe(`Impressas uma vez, sob o título do local, antes das fichas. ${edit}`);
    expect(cabineDataNoteText('v4')).toBe(`Impressas uma vez, sob o título do local, antes das fichas. ${edit}`);
    expect(cabineDataNoteText('v3')).toBe(`Impressas uma vez, na primeira ficha do local. ${edit}`);
    expect(cabineDataNoteText('v1')).toBe(`Impressas uma vez, na primeira ficha do local. ${edit}`);
  });
});
