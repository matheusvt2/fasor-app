import { describe, expect, it } from 'vitest';
import { getSeed, SEED_VERSIONS, sectionText } from '../seed/definitions.ts';
import {
  normalizeRichBlocks,
  normalizeRichText,
  parseRichText,
  plainTextToRichBlocks,
  richBlockNumbers,
  richRunsResolved,
  sameRichText,
  serializeRichText,
  type RichBlock,
} from './rich-text.ts';
import { flattenSectionText } from './section-text.ts';

/*
 * Story 11.4: the section text markup (bold, italic, bullet and numbered lists, variables),
 * one test per row of the spec's I/O matrix, the legacy flat text of Story 3.6 read exactly
 * as before, and the round trip of the serializer.
 */

const p = (...runs: RichBlock['runs']): RichBlock => ({ kind: 'paragraph', runs });
const b = (...runs: RichBlock['runs']): RichBlock => ({ kind: 'bullet', runs });
const n = (...runs: RichBlock['runs']): RichBlock => ({ kind: 'numbered', runs });

/** Story 3.6's line rule (`print/layout.ts` before 11.4), the reference legacy text must keep. */
function legacyParagraphs(text: string): { kind: 'paragraph' | 'item'; text: string }[] {
  const out: { kind: 'paragraph' | 'item'; text: string }[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    chunk
      .split('\n')
      .filter((line) => line.trim() !== '')
      .forEach((line, index) => out.push({ kind: index === 0 ? 'paragraph' : 'item', text: line }));
  }
  return out;
}

const asLegacy = (blocks: RichBlock[]) => blocks.map((block) => ({ kind: block.kind === 'paragraph' ? 'paragraph' : 'item', text: block.runs.map((r) => r.text).join('') }));

describe('11.4-UNIT parseRichText (the I/O matrix)', () => {
  it('reads legacy flat text as today: the first line of a chunk a paragraph, the lines under it items', () => {
    expect(parseRichText('Intro\nitem a\nitem b\n\nPara')).toEqual([p({ text: 'Intro' }), b({ text: 'item a' }), b({ text: 'item b' }), p({ text: 'Para' })]);
  });

  it('reads explicit bullet and numbered items, numbered by position', () => {
    const blocks = parseRichText('Intro\n- a\n1. b\n2. c\n\nFim');
    expect(blocks).toEqual([p({ text: 'Intro' }), b({ text: 'a' }), n({ text: 'b' }), n({ text: 'c' }), p({ text: 'Fim' })]);
    expect(richBlockNumbers(blocks)).toEqual([null, null, 1, 2, null]);
  });

  it('numbers by position whatever number was typed, restarting after any other block', () => {
    const blocks = parseRichText('7. a\n7. b\n- c\n3. d');
    expect(richBlockNumbers(blocks)).toEqual([1, 2, null, 1]);
  });

  it('reads bold, italic and both as independent toggles, ** before *', () => {
    expect(parseRichText('A **negrito** e *itálico* e ***ambos***')).toEqual([
      p({ text: 'A ' }, { text: 'negrito', bold: true }, { text: ' e ' }, { text: 'itálico', italic: true }, { text: ' e ' }, { text: 'ambos', bold: true, italic: true }),
    ]);
  });

  it('keeps an unbalanced * or ** literal', () => {
    expect(parseRichText('5 * 3 e a ** b')).toEqual([p({ text: '5 * 3 e a ** b' })]);
  });

  it('never matches a mark across lines', () => {
    expect(parseRichText('a **b\n- c** d')).toEqual([p({ text: 'a **b' }), b({ text: 'c** d' })]);
  });

  it('resolves escapes: \\* and \\\\ literal, a paragraph starting with an escaped marker', () => {
    expect(parseRichText('\\*nota\\* e \\\\')).toEqual([p({ text: '*nota* e \\' })]);
    expect(parseRichText('\\- x')).toEqual([p({ text: '- x' })]);
    expect(parseRichText('12\\. x')).toEqual([p({ text: '12. x' })]);
    // A backslash before any other character stays as typed.
    expect(parseRichText('C:\\pasta')).toEqual([p({ text: 'C:\\pasta' })]);
  });

  it('keeps a variable inside a bold run, resolved per run after parsing', () => {
    const [block] = parseRichText('**{cliente}**');
    expect(block).toEqual(p({ text: '{cliente}', bold: true }));
    expect(richRunsResolved(block!.runs, { cliente: 'A*B' })).toEqual([{ text: 'A*B', bold: true }]);
    expect(richRunsResolved(block!.runs, {})).toEqual([{ text: '[Cliente]', bold: true }]);
  });

  it('drops blank lines and blocks, and never throws', () => {
    expect(parseRichText('')).toEqual([]);
    expect(parseRichText('\n\n- \n**  **\n')).toEqual([]);
  });
});

describe('11.4-UNIT legacy compatibility over every seeded section text', () => {
  for (const version of Object.keys(SEED_VERSIONS)) {
    for (const entry of getSeed(version, 'cabine_primaria').sections) {
      if (entry.blocks === null) continue;
      it(`seed ${version} section ${entry.section} (${entry.effective_from}) reads as Story 3.6 read it`, () => {
        const flat = flattenSectionText(sectionText(version, entry.section, entry.effective_from));
        expect(asLegacy(parseRichText(flat))).toEqual(legacyParagraphs(flat));
        // And its normal form means the same text.
        expect(sameRichText(flat, normalizeRichText(flat))).toBe(true);
      });
    }
  }
});

describe('11.4-UNIT serializeRichText round trip', () => {
  const lists: RichBlock[][] = [
    [p({ text: 'Serviços:' }), b({ text: 'Termografia', bold: true }, { text: ' dos painéis' }), n({ text: 'Limpeza' }), n({ text: 'Reaperto ' }, { text: 'quando aplicável', italic: true })],
    [p({ text: '- não é item' }), p({ text: '3. nem este' }), p({ text: 'a * b ** c \\ d' })],
    [n({ text: 'um' }), b({ text: 'dois' }), n({ text: 'três' }), p({ text: 'x', bold: true }, { text: 'y', bold: true, italic: true }, { text: 'z', italic: true })],
    [b({ text: '- item que começa com traço' }), n({ text: '1. item numerado' }), p({ text: 'A ' }, { text: '{cliente}', bold: true }, { text: '.' })],
    [p({ text: '' }), p({ text: 'a', bold: true }, { text: 'b', bold: true }, { text: '' }), b({ text: '   ' }), p({ text: 'linha\nquebrada' })],
  ];

  lists.forEach((blocks, i) => {
    it(`parse(serialize(blocks)) deep-equals the normalized blocks (${i + 1})`, () => {
      expect(parseRichText(serializeRichText(blocks))).toEqual(normalizeRichBlocks(blocks));
    });
  });

  it('normalizes: adjacent same-mark runs merged, empty runs and blank blocks dropped, line breaks as spaces', () => {
    expect(normalizeRichBlocks(lists[4]!)).toEqual([p({ text: 'ab', bold: true }), p({ text: 'linha quebrada' })]);
  });

  it('writes the markup of the design note example', () => {
    expect(serializeRichText(lists[0]!)).toBe('Serviços:\n- **Termografia** dos painéis\n1. Limpeza\n2. Reaperto *quando aplicável*');
    expect(serializeRichText(lists[1]!)).toBe('\\- não é item\n\n3\\. nem este\n\na \\* b \\*\\* c \\\\ d');
  });

  it('compares texts by meaning: a legacy text and its normal form are the same', () => {
    expect(sameRichText('Intro\nitem a', 'Intro\n- item a')).toBe(true);
    expect(sameRichText('Intro\nitem a', 'Intro\n\nitem a')).toBe(false);
  });
});

describe('11.4-UNIT plainTextToRichBlocks', () => {
  it('makes each non-blank line an unformatted paragraph with its characters literal', () => {
    const blocks = plainTextToRichBlocks('a *b*\r\n\r\n- c\n');
    expect(blocks).toEqual([p({ text: 'a *b*' }), p({ text: '- c' })]);
    expect(serializeRichText(blocks)).toBe('a \\*b\\*\n\n\\- c');
    expect(parseRichText(serializeRichText(blocks))).toEqual(blocks);
  });
});
