import { isSectionVariable, plainTextToRichBlocks, sectionTextTokens, serializeRichText, type RichBlock, type RichBlockKind, type RichRun } from '@app/domain';
import { chipElement, isChip } from './section-text-editor.ts';

/*
 * Story 11.4 (FR-12, UX-DR69): the DOM side of the Template composer's rich text editor.
 * The kernel owns the markup (`templates/rich-text.ts`: parse, serialize, normalize); this
 * module only turns kernel `RichBlock[]` into the `.rt-area`'s nodes, reads any DOM a
 * browser leaves there back into blocks, and edits blocks at a selection. It never writes a
 * `*` or a list marker: the stored text is always `serializeRichText` of what it reads.
 *
 * The area's canonical DOM: a `<p>` per paragraph, a `<ul>`/`<ol>` of `<li>` per list, runs
 * as text inside `<strong>` and `<em>`, variables as the atomic chips of Story 3.6
 * (`section-text-editor.ts`). What a browser types into it natively (text in those nodes,
 * sometimes a `<div>`, a `<br>`, a `<b>`, a styled `<span>`) reads back the same way.
 *
 * A selection is a pair of positions, each a block index and a character offset within the
 * block's text (a chip counts as its `{name}` token). The editing operations work on lines of
 * marked characters, so a toolbar command re-renders the area and puts the selection back
 * where it was. A zero-width space holds the marks a collapsed caret was given ("Negrito"
 * with nothing selected): what is typed next goes inside it; it never reaches the stored text.
 */

export const ZERO_WIDTH = '​';

export interface Pos {
  block: number;
  offset: number;
}

export interface Selection {
  start: Pos;
  end: Pos;
}

export type Mark = 'bold' | 'italic';
export type ListKind = 'bullet' | 'numbered';

interface Char {
  c: string;
  bold: boolean;
  italic: boolean;
}

export interface Line {
  kind: RichBlockKind;
  chars: Char[];
}

export interface Edit {
  lines: Line[];
  selection: Selection;
}

export interface FormatState {
  bold: boolean;
  italic: boolean;
  bullet: boolean;
  numbered: boolean;
}

// --- blocks <-> lines ------------------------------------------------------------------

export function toLines(blocks: readonly RichBlock[]): Line[] {
  return blocks.map((block) => ({
    kind: block.kind,
    chars: block.runs.flatMap((run) => run.text.split('').map((c) => ({ c, bold: run.bold === true, italic: run.italic === true }))),
  }));
}

/** Lines as blocks, runs merged; an empty line stays (the caret can sit in it while editing). */
export function fromLines(lines: readonly Line[]): RichBlock[] {
  return lines.map((line) => {
    const runs: RichRun[] = [];
    for (const char of line.chars) {
      const last = runs.at(-1);
      if (last !== undefined && (last.bold === true) === char.bold && (last.italic === true) === char.italic) last.text += char.c;
      else runs.push({ text: char.c, ...(char.bold ? { bold: true as const } : {}), ...(char.italic ? { italic: true as const } : {}) });
    }
    return { kind: line.kind, runs };
  });
}

/** The stored text of what the area shows: zero-width spaces dropped, serialized by the kernel. */
export function storedText(blocks: readonly RichBlock[]): string {
  return serializeRichText(blocks.map((block) => ({ kind: block.kind, runs: block.runs.map((run) => ({ ...run, text: run.text.replaceAll(ZERO_WIDTH, '') })) })));
}

// --- render ----------------------------------------------------------------------------

function inlineNodes(doc: Document, runs: readonly RichRun[]): Node[] {
  const out: Node[] = [];
  for (const run of runs) {
    const nodes: Node[] = [];
    for (const token of sectionTextTokens(run.text)) {
      nodes.push(token.kind === 'variable' ? chipElement(doc, token.name) : doc.createTextNode(token.text));
    }
    let wrapped = nodes;
    if (run.italic === true) {
      const em = doc.createElement('em');
      em.append(...wrapped);
      wrapped = [em];
    }
    if (run.bold === true) {
      const strong = doc.createElement('strong');
      strong.append(...wrapped);
      wrapped = [strong];
    }
    out.push(...wrapped);
  }
  return out;
}

function fillBlock(element: HTMLElement, runs: readonly RichRun[]): void {
  const nodes = inlineNodes(element.ownerDocument, runs);
  // An empty block keeps a `<br>` so it has a line the caret can sit on.
  if (nodes.length === 0) element.append(element.ownerDocument.createElement('br'));
  else element.append(...nodes);
}

/** Replaces the area's content with the canonical DOM of `blocks`. */
export function renderBlocks(area: HTMLElement, blocks: readonly RichBlock[]): void {
  const doc = area.ownerDocument;
  const out: Node[] = [];
  let list: HTMLElement | null = null;
  let listKind: ListKind | null = null;
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      list = null;
      listKind = null;
      const p = doc.createElement('p');
      fillBlock(p, block.runs);
      out.push(p);
      continue;
    }
    if (list === null || listKind !== block.kind) {
      list = doc.createElement(block.kind === 'bullet' ? 'ul' : 'ol');
      listKind = block.kind;
      out.push(list);
    }
    const li = doc.createElement('li');
    fillBlock(li, block.runs);
    list.append(li);
  }
  area.replaceChildren(...out);
}

/** The area's block elements in order (its `<p>`s and every list's `<li>`s). */
function blockElements(area: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const child of Array.from(area.children)) {
    if (child.tagName === 'UL' || child.tagName === 'OL') out.push(...(Array.from(child.children) as HTMLElement[]));
    else out.push(child as HTMLElement);
  }
  return out;
}

// --- read ------------------------------------------------------------------------------

const CONTAINER_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TABLE', 'TR', 'TD', 'TH', 'DT', 'DD']);
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK']);

interface WorkLine extends Line {
  openedBy: 'container' | 'break' | 'loose';
  hasCaret: boolean;
}

interface Walk {
  /** Whether inline marks are read (`false` for a paste: its formatting is dropped). */
  marks: boolean;
  lines: Line[];
  current: WorkLine | null;
  /** The kind a new block gets: the innermost list item's kind, else a paragraph. */
  kinds: RichBlockKind[];
  boundaries: { container: Node; offset: number }[];
  found: (Pos | null)[];
}

function markOf(element: HTMLElement, walk: Walk, bold: boolean, italic: boolean): { bold: boolean; italic: boolean } {
  if (!walk.marks) return { bold: false, italic: false };
  const tag = element.tagName;
  let b = bold || tag === 'STRONG' || tag === 'B';
  let i = italic || tag === 'EM' || tag === 'I';
  const weight = element.style?.fontWeight ?? '';
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) b = true;
  else if (weight === 'normal' || weight === 'lighter' || (weight !== '' && Number(weight) < 600)) b = false;
  const style = element.style?.fontStyle ?? '';
  if (style === 'italic' || style === 'oblique') i = true;
  else if (style === 'normal') i = false;
  return { bold: b, italic: i };
}

function kindOf(walk: Walk): RichBlockKind {
  return walk.kinds.at(-1) ?? 'paragraph';
}

/** Ends the open line: kept when it holds anything, was a container of its own, or holds the caret. */
function closeLine(walk: Walk, force = false): void {
  const line = walk.current;
  walk.current = null;
  if (line === null) return;
  const keep = force || line.chars.length > 0 || line.hasCaret || line.openedBy === 'container';
  if (keep) walk.lines.push({ kind: line.kind, chars: line.chars });
}

function openLine(walk: Walk, openedBy: WorkLine['openedBy'], kind = kindOf(walk)): WorkLine {
  walk.current = { kind, chars: [], openedBy, hasCaret: false };
  return walk.current;
}

function ensureLine(walk: Walk): WorkLine {
  return walk.current ?? openLine(walk, 'loose');
}

function recordAt(walk: Walk, container: Node, offset: number, pos: () => Pos): void {
  walk.boundaries.forEach((boundary, i) => {
    if (walk.found[i] === null && boundary.container === container && boundary.offset === offset) walk.found[i] = pos();
  });
}

function here(walk: Walk): Pos {
  if (walk.current === null) return { block: walk.lines.length, offset: 0 };
  walk.current.hasCaret = true;
  return { block: walk.lines.length, offset: walk.current.chars.length };
}

/** `isChip` without narrowing the other branch to `never` (a chip is an `HTMLElement` too). */
const chipNode = (node: HTMLElement): boolean => isChip(node);

function visit(node: Node, walk: Walk, bold: boolean, italic: boolean): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const data = (node as Text).data.replace(/\u00a0/g, ' ').replace(/[\r\n]/g, ' ');
    const inside = walk.boundaries.some((b, i) => walk.found[i] === null && b.container === node);
    if (data === '' && !inside) return;
    const line = ensureLine(walk);
    const base = line.chars.length;
    // UTF-16 code units, as a DOM offset counts them.
    for (const c of data.split('')) line.chars.push({ c, bold, italic });
    walk.boundaries.forEach((boundary, i) => {
      if (walk.found[i] === null && boundary.container === node) {
        line.hasCaret = true;
        walk.found[i] = { block: walk.lines.length, offset: base + Math.min(boundary.offset, data.length) };
      }
    });
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (SKIPPED_TAGS.has(node.tagName)) return;
  if (chipNode(node)) {
    const name = node.dataset.var ?? '';
    const token = isSectionVariable(name) ? `{${name}}` : (node.textContent ?? '');
    const line = ensureLine(walk);
    for (const c of token.split('')) line.chars.push({ c, bold, italic });
    // A boundary inside the chip is after it: the chip is never entered.
    walk.boundaries.forEach((boundary, i) => {
      if (walk.found[i] === null && node.contains(boundary.container)) walk.found[i] = here(walk);
    });
    return;
  }
  if (node.tagName === 'BR') {
    ensureLine(walk);
    closeLine(walk, true);
    openLine(walk, 'break');
    return;
  }
  const container = CONTAINER_TAGS.has(node.tagName);
  const list = node.tagName === 'UL' || node.tagName === 'OL';
  if (node.tagName === 'LI') {
    const parentList = node.parentElement?.closest('ol, ul');
    walk.kinds.push(parentList?.tagName === 'OL' ? 'numbered' : 'bullet');
  }
  if (container) {
    closeLine(walk);
    openLine(walk, 'container');
  } else if (list) {
    closeLine(walk);
  }
  const marks = markOf(node, walk, bold, italic);
  const children = Array.from(node.childNodes);
  children.forEach((child, index) => {
    recordAt(walk, node, index, () => here(walk));
    visit(child, walk, marks.bold, marks.italic);
  });
  recordAt(walk, node, children.length, () => here(walk));
  if (container || list) {
    // A line a trailing `<br>` opened is not a line of its own (a browser's placeholder).
    if (walk.current?.openedBy === 'break' && walk.current.chars.length === 0 && !walk.current.hasCaret) walk.current = null;
    closeLine(walk);
  }
  if (node.tagName === 'LI') walk.kinds.pop();
}

function readNode(root: Node, marks: boolean, boundaries: { container: Node; offset: number }[]): { lines: Line[]; found: (Pos | null)[] } {
  const walk: Walk = { marks, lines: [], current: null, kinds: [], boundaries, found: boundaries.map(() => null) };
  const children = Array.from(root.childNodes);
  children.forEach((child, index) => {
    recordAt(walk, root, index, () => here(walk));
    visit(child, walk, false, false);
  });
  recordAt(walk, root, children.length, () => here(walk));
  if (walk.current?.openedBy === 'break' && walk.current.chars.length === 0 && !walk.current.hasCaret) walk.current = null;
  closeLine(walk);
  return { lines: walk.lines, found: walk.found };
}

const clampPos = (lines: readonly Line[], pos: Pos | null): Pos => {
  if (lines.length === 0) return { block: 0, offset: 0 };
  if (pos === null || pos.block >= lines.length) return { block: lines.length - 1, offset: lines.at(-1)!.chars.length };
  return { block: pos.block, offset: Math.min(pos.offset, lines[pos.block]!.chars.length) };
};

/**
 * The area as lines, whatever DOM a browser left there (`<div>`, `<p>`, `<br>`, nested
 * lists, `<b>`/`<i>` or styled spans), and the selection `range` as positions in them when
 * it lies inside the area.
 */
export function readArea(area: HTMLElement, range: Range | null = null): { lines: Line[]; selection: Selection | null } {
  const inside = range !== null && area.contains(range.startContainer) && area.contains(range.endContainer);
  const boundaries = inside ? [{ container: range.startContainer, offset: range.startOffset }, { container: range.endContainer, offset: range.endOffset }] : [];
  const { lines, found } = readNode(area, true, boundaries);
  if (!inside) return { lines, selection: null };
  const start = clampPos(lines, found[0] ?? null);
  const end = clampPos(lines, found[1] ?? null);
  return { lines, selection: comparePos(start, end) <= 0 ? { start, end } : { start: end, end: start } };
}

/** The area's content as kernel blocks (empty lines kept; `storedText` drops them). */
export function readBlocks(area: HTMLElement): RichBlock[] {
  return fromLines(readArea(area).lines);
}

/**
 * A paste of HTML: its `<ul>`/`<ol>` items become bullet and numbered blocks, every other
 * element paragraph text with no marks. `{name}` tokens stay text (the area draws them as
 * chips); the serializer escapes a literal `*` or `\`.
 */
export function htmlToRichBlocks(html: string, doc: Document = document): RichBlock[] {
  // An inert document: nothing in it runs or loads, only its text and list structure are read.
  const parsed = new (doc.defaultView ?? window).DOMParser().parseFromString(html, 'text/html');
  const { lines } = readNode(parsed.body, false, []);
  return fromLines(lines.filter((line) => line.chars.some((char) => char.c.trim() !== '' && char.c !== ZERO_WIDTH)));
}

/**
 * What a paste lands as: the HTML's text and lists; HTML that yields nothing (an image,
 * markup with no text) or no HTML at all falls back to the plain text, line by line.
 */
export function pastedBlocks(html: string, plain: string, doc: Document = document): RichBlock[] {
  const fromHtml = html.trim() !== '' ? htmlToRichBlocks(html, doc) : [];
  return fromHtml.length > 0 ? fromHtml : plainTextToRichBlocks(plain);
}

// --- selection in the DOM ---------------------------------------------------------------

function domPoint(element: HTMLElement, offset: number): { node: Node; offset: number } {
  let acc = 0;
  const find = (node: Node): { node: Node; offset: number } | null => {
    const children = Array.from(node.childNodes);
    for (let index = 0; index < children.length; index++) {
      const child = children[index]!;
      if (child.nodeType === Node.TEXT_NODE) {
        const length = (child as Text).data.length;
        if (offset <= acc + length) return { node: child, offset: offset - acc };
        acc += length;
      } else if (isChip(child)) {
        if (offset <= acc) return { node, offset: index };
        acc += (child.textContent ?? '').length;
        if (offset <= acc) {
          // After the chip, in a text node so typing goes beside it.
          let next = child.nextSibling;
          if (next === null || next.nodeType !== Node.TEXT_NODE) {
            next = child.ownerDocument.createTextNode('');
            node.insertBefore(next, child.nextSibling);
          }
          return { node: next, offset: 0 };
        }
      } else if (child instanceof HTMLElement && child.tagName !== 'BR') {
        const inner = find(child);
        if (inner !== null) return inner;
      }
    }
    return null;
  };
  return find(element) ?? { node: element, offset: element.lastChild?.nodeName === 'BR' ? 0 : element.childNodes.length };
}

/** Puts the document's selection on `selection` in the area's canonical DOM. */
export function placeSelection(area: HTMLElement, selection: Selection): void {
  const blocks = blockElements(area);
  const doc = area.ownerDocument;
  const range = doc.createRange();
  if (blocks.length === 0) {
    range.setStart(area, 0);
    range.collapse(true);
  } else {
    const point = (pos: Pos) => {
      const element = blocks[Math.min(pos.block, blocks.length - 1)]!;
      return domPoint(element, pos.block >= blocks.length ? Number.MAX_SAFE_INTEGER : pos.offset);
    };
    const start = point(selection.start);
    range.setStart(start.node, start.offset);
    if (comparePos(selection.start, selection.end) === 0) range.collapse(true);
    else {
      const end = point(selection.end);
      range.setEnd(end.node, end.offset);
    }
  }
  const current = doc.getSelection();
  if (current === null) return;
  current.removeAllRanges();
  current.addRange(range);
}

// --- editing ---------------------------------------------------------------------------

export function comparePos(a: Pos, b: Pos): number {
  return a.block !== b.block ? a.block - b.block : a.offset - b.offset;
}

const collapsed = (selection: Selection) => comparePos(selection.start, selection.end) === 0;
const at = (pos: Pos): Selection => ({ start: pos, end: pos });
const copyLines = (lines: readonly Line[]): Line[] => lines.map((line) => ({ kind: line.kind, chars: line.chars.map((char) => ({ ...char })) }));
const visible = (chars: readonly Char[]) => chars.filter((char) => char.c !== ZERO_WIDTH);

/** A copy of the lines; an empty area gets one empty paragraph, so a command applies to what is typed next. */
const withALine = (source: readonly Line[]): Line[] => (source.length === 0 ? [{ kind: 'paragraph', chars: [] }] : copyLines(source));

/** The document's end: the caret an edit with no selection in the area lands at. */
export function endSelection(lines: readonly Line[]): Selection {
  return at(clampPos(lines, null));
}

/**
 * Drops every zero-width space but one right before a collapsed caret (the marks a caret
 * was given and nothing typed into yet), moving the selection with the text.
 */
export function stripZeroWidth(lines: readonly Line[], selection: Selection): Edit {
  const keep = collapsed(selection) ? selection.start : null;
  const moved = (pos: Pos, line: Char[]) => {
    let removed = 0;
    for (let i = 0; i < pos.offset && i < line.length; i++) if (line[i]!.c === ZERO_WIDTH && !(keep !== null && keep.block === pos.block && i === keep.offset - 1)) removed++;
    return { block: pos.block, offset: pos.offset - removed };
  };
  const start = moved(selection.start, lines[selection.start.block]?.chars ?? []);
  const end = moved(selection.end, lines[selection.end.block]?.chars ?? []);
  const out = lines.map((line, block) => ({
    kind: line.kind,
    chars: line.chars.filter((char, i) => char.c !== ZERO_WIDTH || (keep !== null && keep.block === block && i === keep.offset - 1)),
  }));
  return { lines: out, selection: { start, end } };
}

/** The marks a caret types with: those of the character before it, else the one after. */
function marksAt(lines: readonly Line[], pos: Pos): { bold: boolean; italic: boolean } {
  const chars = lines[pos.block]?.chars ?? [];
  const char = chars[pos.offset - 1] ?? chars[pos.offset];
  return { bold: char?.bold ?? false, italic: char?.italic ?? false };
}

/** Every character of the selection, block by block. */
function selectedChars(lines: readonly Line[], selection: Selection): Char[] {
  const out: Char[] = [];
  for (let block = selection.start.block; block <= selection.end.block; block++) {
    const chars = lines[block]?.chars ?? [];
    const from = block === selection.start.block ? selection.start.offset : 0;
    const to = block === selection.end.block ? selection.end.offset : chars.length;
    out.push(...chars.slice(from, to));
  }
  return out.filter((char) => char.c !== ZERO_WIDTH);
}

/** What the toolbar shows pressed for a selection. */
export function formatState(lines: readonly Line[], selection: Selection | null): FormatState {
  if (selection === null || lines.length === 0) return { bold: false, italic: false, bullet: false, numbered: false };
  const chars = collapsed(selection) ? [] : selectedChars(lines, selection);
  const caret = marksAt(lines, selection.start);
  const kinds = lines.slice(selection.start.block, selection.end.block + 1).map((line) => line.kind);
  return {
    bold: chars.length === 0 ? caret.bold : chars.every((char) => char.bold),
    italic: chars.length === 0 ? caret.italic : chars.every((char) => char.italic),
    bullet: kinds.length > 0 && kinds.every((kind) => kind === 'bullet'),
    numbered: kinds.length > 0 && kinds.every((kind) => kind === 'numbered'),
  };
}

/**
 * "Negrito" / "Itálico": over a selection, sets the mark on every character unless all
 * carry it (then clears it); at a collapsed caret, the next characters typed carry the
 * toggled mark (a zero-width space holds it).
 */
export function toggleMark(source: readonly Line[], selection: Selection, mark: Mark): Edit {
  const lines = withALine(source);
  if (collapsed(selection)) {
    const pos = selection.start;
    const chars = lines[pos.block]?.chars;
    if (chars === undefined) return { lines, selection };
    const before = chars[pos.offset - 1];
    if (before !== undefined && before.c === ZERO_WIDTH) {
      before[mark] = !before[mark];
      return { lines, selection };
    }
    const marks = marksAt(lines, pos);
    chars.splice(pos.offset, 0, { c: ZERO_WIDTH, ...marks, [mark]: !marks[mark] });
    return { lines, selection: at({ block: pos.block, offset: pos.offset + 1 }) };
  }
  const all = selectedChars(lines, selection);
  const value = !(all.length > 0 && all.every((char) => char[mark]));
  for (let block = selection.start.block; block <= selection.end.block; block++) {
    const chars = lines[block]?.chars ?? [];
    const from = block === selection.start.block ? selection.start.offset : 0;
    const to = block === selection.end.block ? selection.end.offset : chars.length;
    for (let i = from; i < to; i++) chars[i]![mark] = value;
  }
  return { lines, selection };
}

/** "Lista" / "Numeração": the selected blocks become that list, or paragraphs when all already are. */
export function toggleList(source: readonly Line[], selection: Selection, kind: ListKind): Edit {
  const lines = withALine(source);
  const range = lines.slice(selection.start.block, selection.end.block + 1);
  const next: RichBlockKind = range.length > 0 && range.every((line) => line.kind === kind) ? 'paragraph' : kind;
  for (const line of range) line.kind = next;
  return { lines, selection };
}

/** Removes the selected characters, joining the first and last block of the selection. */
export function deleteSelection(source: readonly Line[], selection: Selection): Edit {
  const lines = copyLines(source);
  if (collapsed(selection)) return { lines, selection };
  const { start, end } = selection;
  const first = lines[start.block];
  const last = lines[end.block];
  if (first === undefined || last === undefined) return { lines, selection: at(start) };
  first.chars = [...first.chars.slice(0, start.offset), ...last.chars.slice(end.offset)];
  lines.splice(start.block + 1, end.block - start.block);
  return { lines, selection: at(start) };
}

/**
 * Enter: a new paragraph, or a new item inside a list; Enter on an empty item leaves the
 * list (the item becomes a paragraph). The marks at the caret carry to the new block.
 */
export function splitBlock(source: readonly Line[], selection: Selection): Edit {
  const { lines, selection: cleared } = deleteSelection(source, selection);
  const pos = cleared.start;
  const line = lines[pos.block];
  if (line === undefined) {
    lines.push({ kind: 'paragraph', chars: [] });
    return { lines, selection: at({ block: lines.length - 1, offset: 0 }) };
  }
  if (line.kind !== 'paragraph' && visible(line.chars).length === 0) {
    line.kind = 'paragraph';
    return { lines, selection: cleared };
  }
  const marks = marksAt(lines, pos);
  const head = line.chars.slice(0, pos.offset);
  const tail = line.chars.slice(pos.offset);
  line.chars = head;
  const next: Line = { kind: line.kind, chars: tail };
  let offset = 0;
  if (visible(tail).length === 0 && (marks.bold || marks.italic)) {
    next.chars = [{ c: ZERO_WIDTH, ...marks }];
    offset = 1;
  }
  lines.splice(pos.block + 1, 0, next);
  return { lines, selection: at({ block: pos.block + 1, offset }) };
}

/** Inserts characters at the caret (replacing the selection), each with `marks`, and leaves the caret after them. */
function insertChars(source: readonly Line[], selection: Selection, text: string, marks: { bold: boolean; italic: boolean } | null): Edit {
  const { lines, selection: cleared } = deleteSelection(source, selection);
  const pos = cleared.start;
  if (lines.length === 0) lines.push({ kind: 'paragraph', chars: [] });
  const line = lines[Math.min(pos.block, lines.length - 1)]!;
  const with_ = marks ?? marksAt(lines, pos);
  const chars = text.split('').map((c) => ({ c, ...with_ }));
  line.chars.splice(pos.offset, 0, ...chars);
  return { lines, selection: at({ block: pos.block, offset: pos.offset + chars.length }) };
}

/** A variable chip at the caret, carrying the marks there ("a chip inside bold" prints bold). */
export function insertVariable(source: readonly Line[], selection: Selection, name: string): Edit {
  return insertChars(source, selection, `{${name}}`, null);
}

/**
 * A paste at the caret: one pasted paragraph lands inline, unformatted; several blocks
 * split the block at the caret, the first pasted paragraph joining the text before it and
 * the text after it following the last pasted block. The caret ends after the pasted text.
 */
export function pasteBlocks(source: readonly Line[], selection: Selection, pasted: readonly RichBlock[]): Edit {
  const incoming = toLines(pasted).map((line) => ({ kind: line.kind, chars: line.chars.map((char) => ({ ...char, bold: false, italic: false })) }));
  if (incoming.length === 0) return { lines: copyLines(source), selection };
  if (incoming.length === 1 && incoming[0]!.kind === 'paragraph') {
    return insertChars(source, selection, incoming[0]!.chars.map((char) => char.c).join(''), { bold: false, italic: false });
  }
  const { lines, selection: cleared } = deleteSelection(source, selection);
  const pos = cleared.start;
  if (lines.length === 0) lines.push({ kind: 'paragraph', chars: [] });
  const index = Math.min(pos.block, lines.length - 1);
  const current = lines[index]!;
  const head = current.chars.slice(0, pos.offset);
  const tail = current.chars.slice(pos.offset);
  const out = incoming;
  if (visible(head).length > 0) {
    if (out[0]!.kind === 'paragraph') out[0] = { kind: current.kind, chars: [...head, ...out[0]!.chars] };
    else out.unshift({ kind: current.kind, chars: head });
  }
  const last = out.at(-1)!;
  const caret = { block: index + out.length - 1, offset: last.chars.length };
  last.chars.push(...tail);
  lines.splice(index, 1, ...out);
  return { lines, selection: at(caret) };
}

const VARIABLE_BEFORE = /\{([a-z_]+)\}$/;
const VARIABLE_AFTER = /^\{([a-z_]+)\}/;

/**
 * Backspace (`backward`) or Delete (`forward`) where the editor acts rather than the
 * browser: a selection, a chip beside the caret (removed whole), the start of a list item
 * (it leaves the list), or a block edge (the blocks join). Null elsewhere: the browser's own
 * deletion of one character stands.
 */
export function deleteAt(source: readonly Line[], selection: Selection, direction: 'backward' | 'forward'): Edit | null {
  if (!collapsed(selection)) return deleteSelection(source, selection);
  const lines = copyLines(source);
  const pos = selection.start;
  const line = lines[pos.block];
  if (line === undefined) return null;
  const text = line.chars.map((char) => char.c).join('');
  if (direction === 'backward') {
    const chip = VARIABLE_BEFORE.exec(text.slice(0, pos.offset));
    if (chip !== null && isSectionVariable(chip[1]!)) {
      line.chars.splice(pos.offset - chip[0].length, chip[0].length);
      return { lines, selection: at({ block: pos.block, offset: pos.offset - chip[0].length }) };
    }
    if (pos.offset > 0) return null;
    if (line.kind !== 'paragraph') {
      line.kind = 'paragraph';
      return { lines, selection };
    }
    if (pos.block === 0) return { lines, selection };
    const previous = lines[pos.block - 1]!;
    const offset = previous.chars.length;
    previous.chars.push(...line.chars);
    lines.splice(pos.block, 1);
    return { lines, selection: at({ block: pos.block - 1, offset }) };
  }
  const chip = VARIABLE_AFTER.exec(text.slice(pos.offset));
  if (chip !== null && isSectionVariable(chip[1]!)) {
    line.chars.splice(pos.offset, chip[0].length);
    return { lines, selection };
  }
  if (pos.offset < line.chars.length) return null;
  const next = lines[pos.block + 1];
  if (next === undefined) return { lines, selection };
  line.chars.push(...next.chars);
  lines.splice(pos.block + 1, 1);
  return { lines, selection };
}
