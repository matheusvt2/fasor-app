import { pointTextTokens } from '@app/domain';
import { caretAfter, endRange, keepLastLineDrawn, placeCaret, rangeInside } from '../templates/section-text-editor.ts';

/*
 * Story 6.6: the DOM side of a point of attention's text, on the section text editor's
 * `contenteditable` area (`use-section-text-area.ts`). Its chips are photo references: the
 * text stores `[[foto:<id>]]` (`pointTextTokens`), the area draws `<span class="var-chip
 * photo-ref" contenteditable="false" data-photo="<id>">Imagem 12</span>`, which the caret
 * moves over and Backspace deletes as one unit, and `serializeArea` reads it back as its
 * token. Everything else is literal text: a `{name}` here is not a variable.
 */

/** The label a photo chip shows: "Imagem 12", or the removed-photo word when it has no number. */
export type PhotoLabel = (id: string) => string;

/** One photo chip, atomic. */
export function photoChipElement(doc: Document, id: string, label: string): HTMLSpanElement {
  const chip = doc.createElement('span');
  chip.className = 'var-chip photo-ref';
  chip.contentEditable = 'false';
  chip.dataset.photo = id;
  chip.textContent = label;
  return chip;
}

/** Literal text as nodes: runs split at each line break. */
function literalFragment(doc: Document, text: string, into: DocumentFragment): void {
  text.split('\n').forEach((line, i) => {
    if (i > 0) into.append(doc.createElement('br'));
    if (line !== '') into.append(doc.createTextNode(line));
  });
}

/** Replaces the area's content with a point text, a chip per photo token. */
export function renderPointText(area: HTMLElement, text: string, labelOf: PhotoLabel): void {
  const doc = area.ownerDocument;
  const fragment = doc.createDocumentFragment();
  for (const token of pointTextTokens(text)) {
    if (token.kind === 'photo') fragment.append(photoChipElement(doc, token.id, labelOf(token.id)));
    else literalFragment(doc, token.text, fragment);
  }
  area.replaceChildren(fragment);
  if (area.lastChild instanceof HTMLElement && area.lastChild.tagName === 'BR') area.append(doc.createElement('br'));
}

/** Inserts a photo chip at `range` (or at the end of the text), the caret after it. */
export function insertPhotoChip(area: HTMLElement, range: Range | null, id: string, label: string): void {
  const target = rangeInside(area, range) ? range : endRange(area);
  target.deleteContents();
  const chip = photoChipElement(area.ownerDocument, id, label);
  target.insertNode(chip);
  placeCaret(area, caretAfter(area, chip));
}

/**
 * Inserts plain text at `range` (or at the end): a quick-text chip or a paste. A token typed
 * or pasted stays literal text; photo references come in only through the picker.
 */
export function insertPlainText(area: HTMLElement, range: Range | null, text: string): void {
  const doc = area.ownerDocument;
  const target = rangeInside(area, range) ? range : endRange(area);
  target.deleteContents();
  const fragment = doc.createDocumentFragment();
  literalFragment(doc, text, fragment);
  const last = fragment.lastChild;
  target.insertNode(fragment);
  if (last === null) return;
  if (last instanceof HTMLElement && last.tagName === 'BR') {
    keepLastLineDrawn(area, last);
    const caret = doc.createRange();
    caret.setStartAfter(last);
    caret.collapse(true);
    placeCaret(area, caret);
  } else {
    placeCaret(area, caretAfter(area, last));
  }
}

/** A quick text lands as its own sentence: a space before it when the caret follows a word. */
export function quickTextAt(area: HTMLElement, range: Range | null, text: string): string {
  const target = rangeInside(area, range) ? range : endRange(area);
  const before = target.cloneRange();
  before.setStart(area, 0);
  const preceding = before.toString();
  return preceding === '' || /\s$/.test(preceding) ? text : ` ${text}`;
}

/** Keeps every chip's label in step with the current photo numbers. */
export function relabelPhotoChips(area: HTMLElement, labelOf: PhotoLabel): void {
  for (const chip of area.querySelectorAll<HTMLElement>('.var-chip.photo-ref[data-photo]')) {
    const label = labelOf(chip.dataset.photo!);
    if (chip.textContent !== label) chip.textContent = label;
  }
}
