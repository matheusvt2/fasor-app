import { parseRichText, type RichBlock } from '@app/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deleteAt,
  formatState,
  fromLines,
  htmlToRichBlocks,
  insertVariable,
  pasteBlocks,
  pastedBlocks,
  placeSelection,
  readArea,
  readBlocks,
  renderBlocks,
  splitBlock,
  storedText,
  stripZeroWidth,
  toggleList,
  toggleMark,
  toLines,
  ZERO_WIDTH,
  type Selection,
} from './rich-text-editor.ts';

/*
 * Story 11.4: the rich editor's DOM side. The kernel owns the markup; these pin that the
 * area draws kernel blocks as `<p>`, lists, `<strong>`/`<em>` and chips, reads any browser
 * DOM back into blocks, and that the toolbar's edits act on a selection. The real-browser
 * caret behaviour is 11.4-E2E-001's.
 */

function area(blocks: RichBlock[] = []): HTMLDivElement {
  const element = document.createElement('div');
  element.contentEditable = 'true';
  document.body.append(element);
  renderBlocks(element, blocks);
  return element;
}

const at = (block: number, offset: number): Selection => ({ start: { block, offset }, end: { block, offset } });
const span = (block: number, start: number, end: number): Selection => ({ start: { block, offset: start }, end: { block, offset: end } });

afterEach(() => {
  document.body.replaceChildren();
});

describe('11.4-UNIT the area draws and reads kernel blocks', () => {
  const blocks = parseRichText('Serviços para **{cliente}**:\n- **Termografia** dos painéis\n1. Limpeza\n2. Reaperto *quando aplicável*\n\nFim.');

  it('draws <p>, <ul>/<ol> items, <strong>/<em> and chips, and reads them back as the same blocks', () => {
    const element = area(blocks);
    // (jsdom does not reflect `contentEditable` into the attribute a browser writes.)
    expect(element.innerHTML.replace(' contenteditable="false"', '')).toBe(
      '<p>Serviços para <strong><span class="var-chip" data-var="cliente">{cliente}</span></strong>:</p>' +
        '<ul><li><strong>Termografia</strong> dos painéis</li></ul>' +
        '<ol><li>Limpeza</li><li>Reaperto <em>quando aplicável</em></li></ol>' +
        '<p>Fim.</p>',
    );
    expect(readBlocks(element)).toEqual(blocks);
    expect(storedText(readBlocks(element))).toBe('Serviços para **{cliente}**:\n- **Termografia** dos painéis\n1. Limpeza\n2. Reaperto *quando aplicável*\n\nFim.');
  });

  it('reads the DOM a browser types: divs, <br> lines, <b>/<i>, styled spans, nested lists', () => {
    const element = area();
    element.innerHTML =
      'solto<div>linha <b>b</b></div><p>um<br>dois<br></p><p><br></p>' +
      '<p><span style="font-weight: 700">peso</span> <i>it</i></p><ul><li>a<ol><li>n</li></ol></li></ul>';
    expect(readBlocks(element)).toEqual([
      { kind: 'paragraph', runs: [{ text: 'solto' }] },
      { kind: 'paragraph', runs: [{ text: 'linha ' }, { text: 'b', bold: true }] },
      { kind: 'paragraph', runs: [{ text: 'um' }] },
      { kind: 'paragraph', runs: [{ text: 'dois' }] },
      { kind: 'paragraph', runs: [] },
      { kind: 'paragraph', runs: [{ text: 'peso', bold: true }, { text: ' ' }, { text: 'it', italic: true }] },
      { kind: 'bullet', runs: [{ text: 'a' }] },
      { kind: 'numbered', runs: [{ text: 'n' }] },
    ]);
    // The empty line is the editor's, never stored.
    expect(storedText(readBlocks(element))).toBe('solto\n\nlinha **b**\n\num\n\ndois\n\n**peso** *it*\n- a\n1. n');
  });

  it('maps a DOM selection to block positions and back', () => {
    const element = area(blocks);
    const selection: Selection = { start: { block: 1, offset: 2 }, end: { block: 3, offset: 12 } };
    placeSelection(element, selection);
    expect(readArea(element, document.getSelection()!.getRangeAt(0)).selection).toEqual(selection);
    // After a chip: its token counts whole.
    placeSelection(element, at(0, 'Serviços para {cliente}'.length));
    expect(readArea(element, document.getSelection()!.getRangeAt(0)).selection).toEqual(at(0, 23));
  });
});

describe('11.4-UNIT toolbar edits', () => {
  const lines = () => toLines(parseRichText('Um dois três\n\nQuatro\n\nCinco'));

  it('Negrito sets the mark on the selection, and clears it when all of it is bold', () => {
    const bold = toggleMark(lines(), span(0, 3, 7), 'bold');
    expect(storedText(fromLines(bold.lines))).toBe('Um **dois** três\n\nQuatro\n\nCinco');
    expect(formatState(bold.lines, span(0, 3, 7))).toMatchObject({ bold: true, italic: false });
    const back = toggleMark(bold.lines, span(0, 3, 7), 'bold');
    expect(storedText(fromLines(back.lines))).toBe('Um dois três\n\nQuatro\n\nCinco');
  });

  it('Negrito at a collapsed caret gives the next typed text the mark (a zero-width holder, never stored)', () => {
    const edit = toggleMark(lines(), at(1, 6), 'bold');
    expect(edit.selection).toEqual(at(1, 7));
    expect(edit.lines[1]!.chars.at(-1)).toEqual({ c: ZERO_WIDTH, bold: true, italic: false });
    expect(formatState(edit.lines, edit.selection).bold).toBe(true);
    // Itálico right after adds to the same holder.
    const both = toggleMark(edit.lines, edit.selection, 'italic');
    expect(both.lines[1]!.chars.at(-1)).toEqual({ c: ZERO_WIDTH, bold: true, italic: true });
    expect(storedText(fromLines(both.lines))).toBe('Um dois três\n\nQuatro\n\nCinco');
    // Another command drops a holder the caret left.
    expect(stripZeroWidth(both.lines, at(0, 0)).lines[1]!.chars).toHaveLength(6);
  });

  it('Lista and Numeração turn the selected blocks into that list, or back into paragraphs', () => {
    const selection: Selection = { start: { block: 1, offset: 0 }, end: { block: 2, offset: 2 } };
    const list = toggleList(lines(), selection, 'bullet');
    expect(storedText(fromLines(list.lines))).toBe('Um dois três\n- Quatro\n- Cinco');
    expect(formatState(list.lines, selection)).toMatchObject({ bullet: true, numbered: false });
    const numbered = toggleList(list.lines, selection, 'numbered');
    expect(storedText(fromLines(numbered.lines))).toBe('Um dois três\n1. Quatro\n2. Cinco');
    expect(storedText(fromLines(toggleList(numbered.lines, selection, 'numbered').lines))).toBe('Um dois três\n\nQuatro\n\nCinco');
  });

  it('Enter splits a paragraph, adds an item inside a list, and leaves the list on an empty item', () => {
    const split = splitBlock(lines(), at(0, 2));
    expect(storedText(fromLines(split.lines))).toBe('Um\n\n dois três\n\nQuatro\n\nCinco');
    expect(split.selection).toEqual(at(1, 0));
    const list = toggleList(lines(), at(1, 0), 'bullet');
    const item = splitBlock(list.lines, at(1, 6));
    expect(item.lines.map((l) => l.kind)).toEqual(['paragraph', 'bullet', 'bullet', 'paragraph']);
    const out = splitBlock(item.lines, item.selection);
    expect(out.lines.map((l) => l.kind)).toEqual(['paragraph', 'bullet', 'paragraph', 'paragraph']);
  });

  it('Backspace removes a chip whole, lifts an item out of its list at its start, and joins blocks', () => {
    const withChip = insertVariable(lines(), at(0, 2), 'cliente');
    expect(storedText(fromLines(withChip.lines))).toMatch(/^Um\{cliente\} dois/);
    const gone = deleteAt(withChip.lines, withChip.selection, 'backward')!;
    expect(storedText(fromLines(gone.lines))).toMatch(/^Um dois/);
    expect(deleteAt(lines(), at(0, 2), 'backward')).toBeNull();
    const list = toggleList(lines(), at(1, 0), 'bullet');
    expect(deleteAt(list.lines, at(1, 0), 'backward')!.lines[1]!.kind).toBe('paragraph');
    const joined = deleteAt(lines(), at(1, 0), 'backward')!;
    expect(storedText(fromLines(joined.lines))).toBe('Um dois trêsQuatro\n\nCinco');
    expect(joined.selection).toEqual(at(0, 12));
  });

  it('on an empty area, Negrito and Lista apply to what is typed next (an empty paragraph first)', () => {
    const bold = toggleMark([], at(0, 0), 'bold');
    expect(bold.lines).toHaveLength(1);
    expect(bold.lines[0]!.chars).toEqual([{ c: ZERO_WIDTH, bold: true, italic: false }]);
    expect(formatState(bold.lines, bold.selection).bold).toBe(true);
    const list = toggleList([], at(0, 0), 'numbered');
    expect(list.lines).toEqual([{ kind: 'numbered', chars: [] }]);
    expect(formatState(list.lines, list.selection).numbered).toBe(true);
  });

  it('a chip inserted inside bold text is bold', () => {
    const bold = toggleMark(lines(), span(0, 0, 2), 'bold');
    const chip = insertVariable(bold.lines, at(0, 2), 'obra');
    expect(storedText(fromLines(chip.lines))).toMatch(/^\*\*Um\{obra\}\*\* dois/);
  });
});

describe('11.4-UNIT paste', () => {
  it('keeps plain text plus list structure from HTML: marks, links and headings drop to text', () => {
    const blocks = htmlToRichBlocks('<h1>Título</h1><p><b>Neg</b> x *y* <a href="#">link</a> {obra}</p><ul><li>a</li><li><i>b</i></li></ul><ol><li>c</li></ol><script>alert(1)</script>');
    expect(blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Título' }] },
      { kind: 'paragraph', runs: [{ text: 'Neg x *y* link {obra}' }] },
      { kind: 'bullet', runs: [{ text: 'a' }] },
      { kind: 'bullet', runs: [{ text: 'b' }] },
      { kind: 'numbered', runs: [{ text: 'c' }] },
    ]);
    expect(storedText(blocks)).toBe('Título\n\nNeg x \\*y\\* link {obra}\n- a\n- b\n1. c');
  });

  it('falls back to the plain text when the HTML yields no block, and uses the plain text with no HTML', () => {
    expect(pastedBlocks('<img src="x.png">', 'texto simples')).toEqual([{ kind: 'paragraph', runs: [{ text: 'texto simples' }] }]);
    expect(pastedBlocks('', 'a\nb')).toEqual([
      { kind: 'paragraph', runs: [{ text: 'a' }] },
      { kind: 'paragraph', runs: [{ text: 'b' }] },
    ]);
    expect(pastedBlocks('<ul><li>item</li></ul>', 'outro')).toEqual([{ kind: 'bullet', runs: [{ text: 'item' }] }]);
  });

  it('lands one pasted paragraph inline, unformatted, and several blocks split the block at the caret', () => {
    const lines = toLines(parseRichText('**Antes depois**'));
    const inline = pasteBlocks(lines, at(0, 6), [{ kind: 'paragraph', runs: [{ text: 'colado ' }] }]);
    expect(storedText(fromLines(inline.lines))).toBe('**Antes **colado **depois**');
    expect(inline.selection).toEqual(at(0, 13));
    const blocks = pasteBlocks(lines, at(0, 6), htmlToRichBlocks('<p>x</p><ul><li>a</li></ul>'));
    expect(storedText(fromLines(blocks.lines))).toBe('**Antes **x\n- a**depois**');
    expect(blocks.selection).toEqual(at(1, 1));
  });
});
