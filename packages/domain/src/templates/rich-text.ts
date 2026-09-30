import type { SectionVariable } from '../seed/definitions.ts';
import { resolveSectionText } from './section-text.ts';

/*
 * Story 11.4 (FR-12, UX-DR69): the formatting a section block's boilerplate may carry, as
 * a small markup inside the same `section_text` string (no row-shape change). The kernel is
 * the only place that knows it (AD-1): the Template composer's rich editor turns its DOM
 * into `RichBlock[]` and calls `serializeRichText`; the printed relatório reads it back
 * through `parseRichText`. Formatting is what the DOCX and PDF renderers share: bold,
 * italic, bullet and numbered lists. Nothing else.
 *
 * The markup, one line per block, blank lines separating chunks:
 * - `- ` starts a bullet item; `N. ` (any digits) a numbered item, numbered by position
 *   (1, 2, 3...) and restarting after any block that is not numbered;
 * - in a chunk, the first unmarked line is a paragraph and later unmarked lines are bullet
 *   items (the flat text of Story 3.6 keeps its meaning exactly);
 * - `**x**` is bold and `*x*` italic, independent toggles within one line, `**` matched
 *   before `*`; an unbalanced `*` or `**` in a line is literal;
 * - `\` escapes `\ * - .`; the serializer escapes every literal `*` and `\`, and the leading
 *   `-` or `N.` of a paragraph;
 * - `{name}` variables are ordinary characters of a run and keep its marks; they are
 *   resolved per run after parsing, so a value holding `*` never formats.
 */

export interface RichRun {
  text: string;
  bold?: true;
  italic?: true;
}

export type RichBlockKind = 'paragraph' | 'bullet' | 'numbered';

export interface RichBlock {
  kind: RichBlockKind;
  runs: RichRun[];
}

const ESCAPABLE = new Set(['\\', '*', '-', '.']);
const BULLET_MARKER = /^- /;
const NUMBERED_MARKER = /^\d+\. /;

type InlineToken = { kind: 'text'; text: string } | { kind: 'delim'; size: 1 | 2 };

/** A line's characters as literal text and `*` / `**` delimiters (escapes resolved, `**` first). */
function inlineTokens(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let literal = '';
  const flush = () => {
    if (literal !== '') tokens.push({ kind: 'text', text: literal });
    literal = '';
  };
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '\\' && i + 1 < line.length && ESCAPABLE.has(line[i + 1]!)) {
      literal += line[i + 1]!;
      i++;
    } else if (char === '*') {
      flush();
      if (line[i + 1] === '*') {
        tokens.push({ kind: 'delim', size: 2 });
        i++;
      } else {
        tokens.push({ kind: 'delim', size: 1 });
      }
    } else {
      literal += char;
    }
  }
  flush();
  return tokens;
}

/** One line's inline content as runs: paired delimiters toggle their mark, an unpaired last one is literal. */
function parseInline(line: string): RichRun[] {
  const tokens = inlineTokens(line);
  const count = { 1: 0, 2: 0 };
  for (const token of tokens) if (token.kind === 'delim') count[token.size]++;
  // An odd count leaves the last delimiter of that size unpaired: it prints as typed.
  const literalAt = new Set<number>();
  for (const size of [1, 2] as const) {
    if (count[size] % 2 === 0) continue;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i]!;
      if (token.kind === 'delim' && token.size === size) {
        literalAt.add(i);
        break;
      }
    }
  }
  const runs: RichRun[] = [];
  let bold = false;
  let italic = false;
  tokens.forEach((token, i) => {
    if (token.kind === 'delim' && !literalAt.has(i)) {
      if (token.size === 2) bold = !bold;
      else italic = !italic;
      return;
    }
    const text = token.kind === 'text' ? token.text : '*'.repeat(token.size);
    runs.push(run(text, bold, italic));
  });
  return mergeRuns(runs);
}

function run(text: string, bold: boolean, italic: boolean): RichRun {
  return { text, ...(bold ? { bold: true as const } : {}), ...(italic ? { italic: true as const } : {}) };
}

const sameMarks = (a: RichRun, b: RichRun): boolean => (a.bold === true) === (b.bold === true) && (a.italic === true) === (b.italic === true);

/** Adjacent runs with the same marks merged, empty runs dropped, line breaks as spaces. */
function mergeRuns(runs: readonly RichRun[]): RichRun[] {
  const out: RichRun[] = [];
  for (const source of runs) {
    const text = source.text.replace(/\r\n?|\n/g, ' ');
    if (text === '') continue;
    const last = out.at(-1);
    if (last !== undefined && sameMarks(last, source)) out[out.length - 1] = { ...last, text: last.text + text };
    else out.push(run(text, source.bold === true, source.italic === true));
  }
  return out;
}

/** The plain characters of some runs. */
export function richRunsText(runs: readonly RichRun[]): string {
  return runs.map((r) => r.text).join('');
}

/** A section text as blocks of runs, per the markup above. Never throws. */
export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    let paragraphSeen = false;
    for (const line of chunk.split('\n')) {
      if (line.trim() === '') continue;
      let kind: RichBlockKind;
      let content: string;
      if (BULLET_MARKER.test(line)) {
        kind = 'bullet';
        content = line.slice(2);
      } else if (NUMBERED_MARKER.test(line)) {
        kind = 'numbered';
        content = line.slice(line.indexOf('. ') + 2);
      } else {
        kind = paragraphSeen ? 'bullet' : 'paragraph';
        paragraphSeen = true;
        content = line;
      }
      const runs = parseInline(content);
      if (richRunsText(runs).trim() !== '') blocks.push({ kind, runs });
    }
  }
  return blocks;
}

/** Blocks in their normal form: runs merged, empty runs and blank blocks dropped. */
export function normalizeRichBlocks(blocks: readonly RichBlock[]): RichBlock[] {
  return blocks
    .map((block) => ({ kind: block.kind, runs: mergeRuns(block.runs) }))
    .filter((block) => richRunsText(block.runs).trim() !== '');
}

const escapeText = (text: string): string => text.replace(/[\\*]/g, (char) => `\\${char}`);

/** A run's delimiters: `**` for a bold change and `*` for an italic one (independent toggles). */
function serializeRuns(runs: readonly RichRun[]): string {
  let out = '';
  let bold = false;
  let italic = false;
  for (const r of runs) {
    if ((r.bold === true) !== bold) {
      out += '**';
      bold = !bold;
    }
    if ((r.italic === true) !== italic) {
      out += '*';
      italic = !italic;
    }
    out += escapeText(r.text);
  }
  if (bold) out += '**';
  if (italic) out += '*';
  return out;
}

/** A paragraph's own leading `- ` or `N. ` escaped, so it never reads back as a list item. */
function escapeParagraphStart(line: string): string {
  if (BULLET_MARKER.test(line)) return `\\${line}`;
  const numbered = /^(\d+)\. /.exec(line);
  return numbered === null ? line : `${numbered[1]}\\${line.slice(numbered[1]!.length)}`;
}

/** Blocks as markup: the only writer of it (the composer's rich editor calls it). */
export function serializeRichText(blocks: readonly RichBlock[]): string {
  let out = '';
  let number = 0;
  normalizeRichBlocks(blocks).forEach((block, index) => {
    number = block.kind === 'numbered' ? number + 1 : 0;
    const content = serializeRuns(block.runs);
    const line = block.kind === 'bullet' ? `- ${content}` : block.kind === 'numbered' ? `${number}. ${content}` : escapeParagraphStart(content);
    if (index > 0) out += block.kind === 'paragraph' ? '\n\n' : '\n';
    out += line;
  });
  return out;
}

/** A text's normal form: `serializeRichText(parseRichText(text))`. */
export function normalizeRichText(text: string): string {
  return serializeRichText(parseRichText(text));
}

/** Whether two texts mean the same formatted content (the composer's seed-equal check). */
export function sameRichText(a: string, b: string): boolean {
  return normalizeRichText(a) === normalizeRichText(b);
}

/** A paste of plain text: each non-blank line one unformatted paragraph, its characters literal. */
export function plainTextToRichBlocks(text: string): RichBlock[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => ({ kind: 'paragraph' as const, runs: [{ text: line }] }));
}

/** The 1-based position of each numbered block in its list (restarting after any other block), else null. */
export function richBlockNumbers(blocks: readonly RichBlock[]): (number | null)[] {
  let number = 0;
  return blocks.map((block) => {
    number = block.kind === 'numbered' ? number + 1 : 0;
    return block.kind === 'numbered' ? number : null;
  });
}

/**
 * Runs with every variable replaced by the relatório's value (`resolveSectionText`, run by
 * run, after parsing), merged. A value holding `*` stays literal; an unresolved variable
 * prints `[Label]` with the run's marks.
 */
export function richRunsResolved(runs: readonly RichRun[], variables: Partial<Record<SectionVariable, string>>): RichRun[] {
  return mergeRuns(runs.map((r) => ({ ...r, text: resolveSectionText(r.text, variables).resolved })));
}
