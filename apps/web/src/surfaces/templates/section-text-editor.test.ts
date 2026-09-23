import { afterEach, describe, expect, it } from 'vitest';
import {
  chipAtCaret,
  endRange,
  insertChip,
  insertLineBreak,
  insertText,
  removeChipAtCaret,
  renderText,
  serializeArea,
} from './section-text-editor.ts';

/*
 * Story 3.6: the section editor's DOM helpers. The real-browser behaviour (caret over a
 * `contenteditable="false"` chip, typing beside it) is exercised by 3.6-E2E-001; these
 * pin the text the area holds and reads back.
 */

function area(text = ''): HTMLDivElement {
  const element = document.createElement('div');
  element.contentEditable = 'true';
  document.body.append(element);
  renderText(element, text);
  return element;
}

function caretAt(node: Node, offset: number): Range {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  return range;
}

const chips = (element: HTMLElement) => [...element.querySelectorAll('.var-chip')].map((chip) => chip.textContent);

afterEach(() => {
  document.body.replaceChildren();
});

describe('3.6 section editor: text to nodes and back', () => {
  it('draws each variable as one non-editable chip and reads the same text back', () => {
    const text = 'Pela {empresa_executora}, em {obra}.\n\nSegundo parágrafo da {cliente}.';
    const element = area(text);
    expect(chips(element)).toEqual(['{empresa_executora}', '{obra}', '{cliente}']);
    for (const chip of element.querySelectorAll<HTMLElement>('.var-chip')) expect(chip.contentEditable).toBe('false');
    expect(element.querySelectorAll('br')).toHaveLength(2);
    expect(serializeArea(element)).toBe(text);
  });

  it('keeps a trailing line break (drawn with one extra, undrawn <br>) and an empty text', () => {
    const trailing = area('Linha\n');
    expect(trailing.querySelectorAll('br')).toHaveLength(2);
    expect(serializeArea(trailing)).toBe('Linha\n');
    expect(serializeArea(area(''))).toBe('');
    // A browser's placeholder <br> in an emptied area is not a line.
    const emptied = area('');
    emptied.append(document.createElement('br'));
    expect(serializeArea(emptied)).toBe('');
  });

  it('reads a line a browser wrapped in a <div> as its own line, and non-breaking spaces as spaces', () => {
    const element = area('Um');
    const div = document.createElement('div');
    div.textContent = 'dois três';
    element.append(div);
    expect(serializeArea(element)).toBe('Um\ndois três');
  });

  it('keeps an unknown {name} as literal text', () => {
    const element = area('A {foo} fica');
    expect(chips(element)).toEqual([]);
    expect(serializeArea(element)).toBe('A {foo} fica');
  });
});

describe('3.6 section editor: chips at the caret', () => {
  it('inserts a chip at the caret, splitting the text, and reads it back as its token', () => {
    const element = area('Olá mundo');
    const text = element.firstChild!;
    insertChip(element, caretAt(text, 4), 'cliente');
    expect(serializeArea(element)).toBe('Olá {cliente}mundo');
    // The caret sits right after the chip, where typing goes on as normal text.
    const selection = document.getSelection()!;
    expect(chipAtCaret(element, selection.getRangeAt(0), 'backward')?.textContent).toBe('{cliente}');
  });

  it('inserts at the end of the text when there is no caret in the area (before the undrawn <br>)', () => {
    const element = area('Fim\n');
    insertChip(element, null, 'datas');
    expect(serializeArea(element)).toBe('Fim\n{datas}');
    const stale = document.createRange();
    stale.selectNodeContents(document.body.appendChild(document.createElement('p')));
    insertChip(element, stale, 'obra');
    expect(serializeArea(element)).toBe('Fim\n{datas}{obra}');
  });

  it('replaces a selection with the chip', () => {
    const element = area('trocar isto');
    const range = document.createRange();
    range.setStart(element.firstChild!, 7);
    range.setEnd(element.firstChild!, 11);
    insertChip(element, range, 'responsavel');
    expect(serializeArea(element)).toBe('trocar {responsavel}');
  });

  it('Backspace right after a chip and Delete right before one remove the whole chip, never a character of it', () => {
    const element = area('a {cliente} b {obra} c');
    const [first, second] = element.querySelectorAll('.var-chip');
    // Backspace with the caret at the start of the text after the first chip.
    expect(removeChipAtCaret(element, caretAt(first!.nextSibling!, 0), 'backward')).toBe(true);
    expect(serializeArea(element)).toBe('a  b {obra} c');
    // Delete with the caret at the end of the text before the second chip.
    const before = second!.previousSibling as Text;
    expect(removeChipAtCaret(element, caretAt(before, before.data.length), 'forward')).toBe(true);
    expect(serializeArea(element)).toBe('a  b  c');
  });

  it('leaves a key alone when a character, not a chip, is beside the caret', () => {
    const element = area('a {cliente} b');
    const after = element.querySelector('.var-chip')!.nextSibling as Text;
    expect(removeChipAtCaret(element, caretAt(after, 1), 'backward')).toBe(false);
    expect(chipAtCaret(element, caretAt(element.firstChild!, 0), 'forward')).toBeNull();
    // A chip as a direct neighbour of an element caret (between two chips) is found too.
    const pair = area('{cliente}{datas}');
    expect(chipAtCaret(pair, caretAt(pair, 1), 'backward')?.textContent).toBe('{cliente}');
    expect(chipAtCaret(pair, caretAt(pair, 1), 'forward')?.textContent).toBe('{datas}');
    expect(serializeArea(element)).toBe('a {cliente} b');
  });
});

describe('3.6 section editor: line breaks and pastes', () => {
  it('Enter inserts a line break; at the end it keeps the new line drawn', () => {
    const element = area('Um dois');
    insertLineBreak(element, caretAt(element.firstChild!, 2));
    expect(serializeArea(element)).toBe('Um\n dois');
    insertLineBreak(element, endRange(element));
    expect(serializeArea(element)).toBe('Um\n dois\n');
    expect(element.lastChild?.nodeName).toBe('BR');
    expect(element.lastChild?.previousSibling?.nodeName).toBe('BR');
  });

  it('pastes plain text, its line breaks as <br> and its tokens as chips', () => {
    const element = area('Início');
    insertText(element, endRange(element), ' colado\npara {cliente}');
    expect(serializeArea(element)).toBe('Início colado\npara {cliente}');
    expect(chips(element)).toEqual(['{cliente}']);
  });
});
