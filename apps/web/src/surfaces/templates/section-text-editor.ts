import { isSectionVariable, photoToken, sectionTextTokens, type SectionVariable } from '@app/domain';

/*
 * Story 3.6: the DOM side of the plain-text section editor. The text area is a
 * `contenteditable` element (the mock's `.rt-area`) whose content is only text nodes, `<br>`
 * line breaks and variable chips (`<span class="var-chip" contenteditable="false">`), which a
 * browser moves the caret over and deletes as one unit. The kernel owns what a text means
 * (`sectionTextTokens`); this module only turns a text into those nodes, reads them back and
 * edits them at the caret.
 *
 * Story 6.6 reuses the area for a point of attention's text, whose chips are photo references
 * (`<span class="var-chip photo-ref" data-photo="<id>">Imagem 12</span>`, built by
 * `point-text-editor.ts`): a chip is either kind, and a photo chip reads back as its
 * `[[foto:<id>]]` token.
 *
 * The text read back is what the area shows, line for line. A browser draws no empty line
 * after a trailing `<br>`, so a text that ends in a line break is drawn with one more
 * `<br>`, and a trailing `<br>` is never read back as a line break.
 */

const CHIP_CLASS = 'var-chip';

/** One variable chip: atomic, never editable character by character. */
export function chipElement(doc: Document, name: SectionVariable): HTMLSpanElement {
  const chip = doc.createElement('span');
  chip.className = CHIP_CLASS;
  chip.contentEditable = 'false';
  chip.dataset.var = name;
  chip.textContent = `{${name}}`;
  return chip;
}

export function isChip(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.classList.contains(CHIP_CLASS) && (node.dataset.var !== undefined || node.dataset.photo !== undefined);
}

function isBreak(node: Node | null | undefined): boolean {
  return node instanceof HTMLElement && node.tagName === 'BR';
}

/** A text as nodes: literal runs split at each line break, and a chip per variable. */
export function textFragment(doc: Document, text: string): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const token of sectionTextTokens(text)) {
    if (token.kind === 'variable') {
      fragment.append(chipElement(doc, token.name));
      continue;
    }
    token.text.split('\n').forEach((line, i) => {
      if (i > 0) fragment.append(doc.createElement('br'));
      if (line !== '') fragment.append(doc.createTextNode(line));
    });
  }
  return fragment;
}

/** Replaces the area's content with a text. */
export function renderText(area: HTMLElement, text: string): void {
  const doc = area.ownerDocument;
  area.replaceChildren(textFragment(doc, text));
  if (isBreak(area.lastChild)) area.append(doc.createElement('br'));
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI']);

/** The text the area shows: its literal text, `\n` per line break and `{name}` per chip. */
export function serializeArea(area: HTMLElement): string {
  let out = '';
  let lastNode: Node | null = null;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const data = (child as Text).data.replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
        out += data;
        if (data !== '') lastNode = child;
      } else if (isChip(child)) {
        const name = child.dataset.var ?? '';
        const photo = child.dataset.photo;
        out += photo !== undefined ? photoToken(photo) : isSectionVariable(name) ? `{${name}}` : (child.textContent ?? '');
        lastNode = child;
      } else if (isBreak(child)) {
        out += '\n';
        lastNode = child;
      } else if (child instanceof HTMLElement) {
        // A block a browser wrapped a line in starts on its own line.
        if (BLOCK_TAGS.has(child.tagName) && out !== '' && !out.endsWith('\n')) out += '\n';
        walk(child);
      }
    }
  };
  walk(area);
  return isBreak(lastNode) && out.endsWith('\n') ? out.slice(0, -1) : out;
}

/** A collapsed range at the end of the area's content: before a trailing, undrawn `<br>`. */
export function endRange(area: HTMLElement): Range {
  const range = area.ownerDocument.createRange();
  const last = area.lastChild;
  if (isBreak(last)) range.setStartBefore(last!);
  else range.setStart(area, area.childNodes.length);
  range.collapse(true);
  return range;
}

export function placeCaret(area: HTMLElement, range: Range): void {
  const selection = area.ownerDocument.getSelection();
  if (selection === null) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** A caret right after `node`, in an editable text node so typing goes beside the chip. */
export function caretAfter(area: HTMLElement, node: Node): Range {
  const doc = area.ownerDocument;
  let next = node.nextSibling;
  if (next === null || next.nodeType !== Node.TEXT_NODE) {
    next = doc.createTextNode('');
    node.parentNode!.insertBefore(next, node.nextSibling);
  }
  const range = doc.createRange();
  range.setStart(next, 0);
  range.collapse(true);
  return range;
}

/** Whether the range sits inside the area (a saved caret can go stale). */
export function rangeInside(area: HTMLElement, range: Range | null): range is Range {
  return range !== null && area.contains(range.startContainer) && area.contains(range.endContainer);
}

/**
 * Inserts a variable chip at `range` (replacing what it selects), or at the end of the text
 * when there is no caret in the area, and leaves the caret after it.
 */
export function insertChip(area: HTMLElement, range: Range | null, name: SectionVariable): void {
  const target = rangeInside(area, range) ? range : endRange(area);
  target.deleteContents();
  const chip = chipElement(area.ownerDocument, name);
  target.insertNode(chip);
  placeCaret(area, caretAfter(area, chip));
}

/** Inserts literal text at `range` (a paste: plain text only, its `{name}` tokens as chips). */
export function insertText(area: HTMLElement, range: Range | null, text: string): void {
  const target = rangeInside(area, range) ? range : endRange(area);
  target.deleteContents();
  const fragment = textFragment(area.ownerDocument, text);
  const last = fragment.lastChild;
  target.insertNode(fragment);
  if (last === null) return;
  if (isBreak(last)) {
    keepLastLineDrawn(area, last);
    const caret = area.ownerDocument.createRange();
    caret.setStartAfter(last);
    caret.collapse(true);
    placeCaret(area, caret);
  } else {
    placeCaret(area, caretAfter(area, last));
  }
}

/** A `<br>` that nothing drawn follows gets the extra, undrawn one, so its new line shows. */
export function keepLastLineDrawn(area: HTMLElement, br: Node): void {
  let after = br.nextSibling;
  while (isEmptyText(after)) after = after!.nextSibling;
  if (after === null && br.parentNode === area) area.append(area.ownerDocument.createElement('br'));
}

/** A line break at the caret (Enter): a `<br>`, plus the undrawn one when it ends the text. */
export function insertLineBreak(area: HTMLElement, range: Range | null): void {
  const doc = area.ownerDocument;
  const target = rangeInside(area, range) ? range : endRange(area);
  target.deleteContents();
  const br = doc.createElement('br');
  target.insertNode(br);
  keepLastLineDrawn(area, br);
  const caret = doc.createRange();
  caret.setStartAfter(br);
  caret.collapse(true);
  placeCaret(area, caret);
}

const isEmptyText = (node: Node | null): boolean =>
  node !== null && node.nodeType === Node.TEXT_NODE && (node as Text).data.replace(/\u200b/g, '') === '';

/** The chip right before (Backspace) or after (Delete) a collapsed caret, if one is there. */
export function chipAtCaret(area: HTMLElement, range: Range, direction: 'backward' | 'forward'): HTMLElement | null {
  if (!range.collapsed || !rangeInside(area, range)) return null;
  const { startContainer: container, startOffset: offset } = range;
  let node: Node | null;
  if (container.nodeType === Node.TEXT_NODE) {
    const data = (container as Text).data;
    const beside = direction === 'backward' ? data.slice(0, offset) : data.slice(offset);
    if (beside.replace(/\u200b/g, '') !== '') return null;
    node = direction === 'backward' ? container.previousSibling : container.nextSibling;
  } else {
    node = direction === 'backward' ? (container.childNodes[offset - 1] ?? null) : (container.childNodes[offset] ?? null);
  }
  while (isEmptyText(node)) node = direction === 'backward' ? node!.previousSibling : node!.nextSibling;
  return isChip(node) ? node : null;
}

/**
 * Backspace or Delete beside a chip removes the whole chip in one keystroke, leaving the
 * caret where it was. Returns whether a chip was removed (the caller then stops the key).
 */
export function removeChipAtCaret(area: HTMLElement, range: Range, direction: 'backward' | 'forward'): boolean {
  const chip = chipAtCaret(area, range, direction);
  if (chip === null) return false;
  const doc = area.ownerDocument;
  const caret = doc.createRange();
  caret.setStartBefore(chip);
  caret.collapse(true);
  chip.remove();
  placeCaret(area, caret);
  return true;
}
