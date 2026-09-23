import { describe, expect, it } from 'vitest';
import { sectionText } from '../seed/definitions.ts';
import {
  defaultSectionText,
  flattenSectionText,
  INSERTABLE_SECTION_VARIABLES,
  resolveSectionText,
  SECTION_VARIABLE_LABELS,
  sectionTextTokens,
} from './section-text.ts';

const TODAY = new Date('2026-09-23T15:00:00.000Z');

const INPUTS = {
  empresa_executora: 'Empresa Executora Ltda.',
  cliente: 'Cliente S.A.',
  obra: 'Torres A e B',
  escopo: 'manutenção preventiva',
  datas: '06, 07 e 08 de setembro de 2026',
  responsavel: 'Responsável Técnico',
};

describe('3.6-UNIT flattenSectionText', () => {
  it("sets paragraphs apart by a blank line and keeps a heading's items on their own lines", () => {
    expect(
      flattenSectionText([
        { kind: 'paragraph', text: 'P1' },
        { kind: 'paragraph', text: 'P2' },
        { kind: 'heading', text: 'H' },
        { kind: 'item', text: 'i1' },
        { kind: 'item', text: 'i2' },
        { kind: 'paragraph', text: 'P3' },
      ]),
    ).toBe('P1\n\nP2\n\nH\ni1\ni2\n\nP3');
    expect(flattenSectionText([])).toBe('');
  });

  it('flattens section 1 Objetivo of seed v1 with its variable tokens intact', () => {
    const text = flattenSectionText(sectionText('v1', 1, '2026-09-23'));
    expect(text.split('\n\n')).toHaveLength(2);
    expect(text).toContain('{empresa_executora}');
    expect(text).toContain('{obra}');
    expect(text).toContain('{cliente}');
  });
});

describe('3.6-UNIT defaultSectionText', () => {
  it('is the flattened seed text in force for a section with boilerplate, null for 8 and 11', () => {
    expect(defaultSectionText('v1', 'section_1', TODAY)).toBe(flattenSectionText(sectionText('v1', 1, '2026-09-23')));
    expect(defaultSectionText('v1', 'section_10', TODAY)).toMatch(/^Foram realizados/);
    expect(defaultSectionText('v1', 'section_8', TODAY)).toBeNull();
    expect(defaultSectionText('v1', 'section_11', TODAY)).toBeNull();
    // Section 5 keeps resolving past the empty NR-10 slot.
    expect(defaultSectionText('v1', 'section_5', new Date('2027-07-01T12:00:00.000Z'))).toBe(
      flattenSectionText(sectionText('v1', 5, '2026-09-23')),
    );
  });
});

describe('3.6-UNIT sectionTextTokens', () => {
  it('cuts a text into literal runs and variable tokens; an unknown {name} stays literal', () => {
    expect(sectionTextTokens('Pela {empresa_executora}, em {obra} {foo}.')).toEqual([
      { kind: 'text', text: 'Pela ' },
      { kind: 'variable', name: 'empresa_executora' },
      { kind: 'text', text: ', em ' },
      { kind: 'variable', name: 'obra' },
      { kind: 'text', text: ' {foo}.' },
    ]);
    expect(sectionTextTokens('{cliente}{datas}')).toEqual([
      { kind: 'variable', name: 'cliente' },
      { kind: 'variable', name: 'datas' },
    ]);
    expect(sectionTextTokens('')).toEqual([]);
  });
});

describe('3.6-UNIT resolveSectionText', () => {
  it('resolves every variable of section 1 Objetivo', () => {
    const text = flattenSectionText(sectionText('v1', 1, '2026-09-23'));
    const { resolved, unresolved } = resolveSectionText(text, INPUTS);
    expect(unresolved).toEqual([]);
    expect(resolved).not.toMatch(/\{[a-z_]+\}/);
    expect(resolved).toContain('realizadas pela Empresa Executora Ltda., referentes');
    expect(resolved).toContain('de Torres A e B da Cliente S.A.');
  });

  it('prints an unresolved variable as its label in brackets and lists it once, in order of first appearance', () => {
    const text = 'Por {responsavel} em {obra}; assina {responsavel}; {datas}.';
    const { resolved, unresolved } = resolveSectionText(text, { obra: 'Torres A e B', datas: '  ' });
    expect(resolved).toBe('Por [Responsável] em Torres A e B; assina [Responsável]; [Datas].');
    expect(unresolved).toEqual(['responsavel', 'datas']);
  });

  it('leaves an unknown token as it is and never throws', () => {
    expect(resolveSectionText('A {foo} e {cliente}', {})).toEqual({ resolved: 'A {foo} e [Cliente]', unresolved: ['cliente'] });
    expect(resolveSectionText('', {})).toEqual({ resolved: '', unresolved: [] });
  });

  it('labels every variable and offers the five of the story for insertion, in order', () => {
    expect(INSERTABLE_SECTION_VARIABLES).toEqual(['cliente', 'obra', 'datas', 'empresa_executora', 'responsavel']);
    expect(SECTION_VARIABLE_LABELS.responsavel).toBe('Responsável');
    expect(SECTION_VARIABLE_LABELS.empresa_executora).toBe('Empresa executora');
  });
});
