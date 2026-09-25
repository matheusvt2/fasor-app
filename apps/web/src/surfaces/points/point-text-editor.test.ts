import { photoToken } from '@app/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { removeChipAtCaret, serializeArea } from '../templates/section-text-editor.ts';
import { insertPhotoChip, insertPlainText, quickTextAt, relabelPhotoChips, renderPointText } from './point-text-editor.ts';

/*
 * Story 6.6: the point editor's DOM helpers on the section text area. The real-browser
 * behaviour (picker, chips, caret) is exercised by `e2e/points.spec.ts`; these pin that a
 * text keeps its `[[foto:<id>]]` tokens and never a number.
 */

const A = '019966b0-0080-7000-8000-00000000000a';
const B = '019966b0-0080-7000-8000-00000000000b';
const labels: Record<string, string> = { [A]: 'Imagem 3', [B]: 'Imagem 7' };
const labelOf = (id: string) => labels[id] ?? 'Foto removida';

function area(text = ''): HTMLDivElement {
  const element = document.createElement('div');
  element.contentEditable = 'true';
  document.body.append(element);
  renderPointText(element, text, labelOf);
  return element;
}

function caretAt(node: Node, offset: number): Range {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  return range;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('6.6-UNIT point text editor', () => {
  it('draws a photo token as an "Imagem N" chip and reads it back as the token', () => {
    const text = `Ver ${photoToken(A)} e\n${photoToken(B)}.`;
    const element = area(text);
    const chips = element.querySelectorAll<HTMLElement>('.var-chip.photo-ref');
    expect([...chips].map((chip) => chip.textContent)).toEqual(['Imagem 3', 'Imagem 7']);
    expect(chips[0]!.contentEditable).toBe('false');
    expect(chips[0]!.dataset.photo).toBe(A);
    expect(serializeArea(element)).toBe(text);
  });

  it('keeps a variable-looking text literal: no chip for {cliente} here', () => {
    const element = area('Para {cliente}');
    expect(element.querySelectorAll('.var-chip')).toHaveLength(0);
    expect(serializeArea(element)).toBe('Para {cliente}');
  });

  it('inserts a picked photo at the caret as a chip, the stored text holding its token', () => {
    const element = area('Ver  aqui');
    insertPhotoChip(element, caretAt(element.firstChild!, 4), A, labelOf(A));
    expect(serializeArea(element)).toBe(`Ver ${photoToken(A)} aqui`);
    expect(serializeArea(element)).not.toMatch(/Imagem/);
  });

  it('inserts plain text at the caret, a pasted token staying literal, and a quick text as its own sentence', () => {
    const element = area('Início.');
    const range = caretAt(element.firstChild!, 7);
    const value = quickTextAt(element, range, 'Texto rápido.');
    expect(value).toBe(' Texto rápido.');
    insertPlainText(element, range, value);
    expect(serializeArea(element)).toBe('Início. Texto rápido.');
    const pasted = area('');
    insertPlainText(pasted, null, `colado ${photoToken(A)}`);
    expect(pasted.querySelectorAll('.var-chip')).toHaveLength(0);
    expect(quickTextAt(area(''), null, 'X')).toBe('X');
    // A word right after the caret gets a space after the quick text too.
    const before = area('palavra');
    const start = caretAt(before.firstChild!, 0);
    const lead = quickTextAt(before, start, 'Texto (PIE).');
    expect(lead).toBe('Texto (PIE). ');
    insertPlainText(before, start, lead);
    expect(serializeArea(before)).toBe('Texto (PIE). palavra');  });

  it('removes a chip whole with one Backspace, and relabels chips when the numbers change', () => {
    const element = area(`Ver ${photoToken(A)}`);
    const after = document.createRange();
    after.setStartAfter(element.querySelector('.var-chip')!);
    after.collapse(true);
    expect(removeChipAtCaret(element, after, 'backward')).toBe(true);
    expect(serializeArea(element)).toBe('Ver ');

    const again = area(`${photoToken(A)} ${photoToken('019966b0-0080-7000-8000-0000000000ff')}`);
    expect(again.querySelectorAll('.var-chip')[1]!.textContent).toBe('Foto removida');
    labels[A] = 'Imagem 2';
    relabelPhotoChips(again, labelOf);
    expect(again.querySelector('.var-chip')!.textContent).toBe('Imagem 2');
  });
});
