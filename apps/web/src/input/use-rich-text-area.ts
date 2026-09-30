import { normalizeRichText, parseRichText, type SectionVariable } from '@app/domain';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import {
  deleteAt,
  endSelection,
  formatState,
  fromLines,
  insertVariable,
  pasteBlocks,
  pastedBlocks,
  placeSelection,
  readArea,
  renderBlocks,
  splitBlock,
  storedText,
  stripZeroWidth,
  toggleList,
  toggleMark,
  type Edit,
  type FormatState,
  type Line,
  type ListKind,
  type Mark,
  type Selection,
} from '../surfaces/templates/rich-text-editor.ts';

/*
 * Story 11.4 (FR-12, UX-DR69): the Template composer's rich text area, the only rich editor
 * of the product (the relatório's Section text surface and the point editor keep Story
 * 3.6's plain `useSectionTextArea`). The area is uncontrolled, filled once from the stored
 * text as the kernel parses it; typing is the browser's, and every other edit (Negrito,
 * Itálico, Lista, Numeração, Ctrl+B / Ctrl+I, Enter, a chip, a paste, Backspace at a block
 * edge or beside a chip) reads the area into blocks, edits them at the selection and draws
 * them again with the selection put back (`rich-text-editor.ts`). Every change reports the
 * kernel-serialized text for autosave.
 *
 * Undo is the editor's own: a history of stored texts (a run of typing is one step, each
 * command another). Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y restore a previous or later text, draw
 * it and report it for autosave; the browser's undo never runs, since it never saw the
 * editor's own DOM edits.
 */

export interface UseRichTextAreaOptions {
  /** The stored text the area is filled with once, on mount. */
  initialText: string;
  /** Called with the kernel-serialized text on every change. */
  onChange: (text: string) => void;
  onBlur?: () => void;
  onFocusChange?: (focused: boolean) => void;
}

export interface RichTextAreaProps {
  ref: RefObject<HTMLDivElement | null>;
  role: 'textbox';
  'aria-multiline': true;
  contentEditable: true;
  suppressContentEditableWarning: true;
  spellCheck: true;
  tabIndex: 0;
  onInput: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export interface UseRichTextArea {
  areaProps: RichTextAreaProps;
  /** What the toolbar shows pressed for the selection. */
  pressed: FormatState;
  toggleMark: (mark: Mark) => void;
  toggleList: (kind: ListKind) => void;
  /** Inserts a variable chip at the selection last left in the area (or at the end). */
  insert: (name: SectionVariable) => void;
  undo: () => void;
  redo: () => void;
}

const NONE: FormatState = { bold: false, italic: false, bullet: false, numbered: false };
const sameState = (a: FormatState, b: FormatState) => a.bold === b.bold && a.italic === b.italic && a.bullet === b.bullet && a.numbered === b.numbered;

type ChangeKind = 'typing' | 'command' | 'history';

export function useRichTextArea(options: UseRichTextAreaOptions): UseRichTextArea {
  const area = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const [pressed, setPressed] = useState<FormatState>(NONE);

  const initial = useRef(options.initialText);
  const history = useRef<{ entries: string[]; index: number; last: ChangeKind | null }>({ entries: [normalizeRichText(options.initialText)], index: 0, last: null });

  useLayoutEffect(() => {
    if (area.current !== null) renderBlocks(area.current, parseRichText(initial.current));
  }, []);

  const liveRange = (): Range | null => {
    const selection = document.getSelection();
    const element = area.current;
    if (element === null || selection === null || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return element.contains(range.startContainer) && element.contains(range.endContainer) ? range : null;
  };

  const refreshPressed = () => {
    const element = area.current;
    if (element === null) return;
    const range = liveRange() ?? saved.current;
    const { lines, selection } = readArea(element, range);
    const next = formatState(lines, selection);
    setPressed((current) => (sameState(current, next) ? current : next));
  };

  // The selection the toolbar and the chip row act on: the last one left in the area, kept
  // while the focus is on a toolbar button or a chip outside it.
  useEffect(() => {
    const onSelection = () => {
      const range = liveRange();
      if (range === null) return;
      saved.current = range.cloneRange();
      refreshPressed();
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
    // Reads refs only.
  }, []);

  const report = (kind: ChangeKind) => {
    const element = area.current;
    if (element === null) return;
    const text = storedText(fromLines(readArea(element).lines));
    const h = history.current;
    if (text !== h.entries[h.index]) {
      if (kind === 'typing' && h.last === 'typing' && h.index > 0) {
        h.entries[h.index] = text;
        h.entries.length = h.index + 1;
      } else {
        h.entries.length = h.index + 1;
        h.entries.push(text);
        h.index++;
      }
      h.last = kind;
    } else if (kind !== 'typing') {
      h.last = kind;
    }
    latest.current.onChange(text);
  };

  /** Reads the area and the selection, runs `edit`, draws the result and puts the selection back. */
  const apply = (edit: (lines: Line[], selection: Selection) => Edit | null): boolean => {
    const element = area.current;
    if (element === null) return false;
    const read = readArea(element, liveRange() ?? saved.current);
    const selection = read.selection ?? endSelection(read.lines);
    const stripped = stripZeroWidth(read.lines, selection);
    const result = edit(stripped.lines, stripped.selection);
    if (result === null) return false;
    renderBlocks(element, fromLines(result.lines));
    if (document.activeElement !== element) element.focus({ preventScroll: true });
    placeSelection(element, result.selection);
    saved.current = liveRange()?.cloneRange() ?? null;
    report('command');
    refreshPressed();
    return true;
  };

  const restore = (text: string) => {
    const element = area.current;
    if (element === null) return;
    renderBlocks(element, parseRichText(text));
    if (document.activeElement !== element) element.focus({ preventScroll: true });
    const { lines } = readArea(element);
    placeSelection(element, endSelection(lines));
    saved.current = liveRange()?.cloneRange() ?? null;
    refreshPressed();
    latest.current.onChange(text);
  };

  const undo = () => {
    const h = history.current;
    if (h.index === 0) return;
    h.index--;
    h.last = 'history';
    restore(h.entries[h.index]!);
  };

  const redo = () => {
    const h = history.current;
    if (h.index >= h.entries.length - 1) return;
    h.index++;
    h.last = 'history';
    restore(h.entries[h.index]!);
  };

  const commands = { toggleMark: (mark: Mark) => apply((lines, s) => toggleMark(lines, s, mark)), toggleList: (kind: ListKind) => apply((lines, s) => toggleList(lines, s, kind)) };
  const latestCommands = useRef({ apply, undo, redo });
  latestCommands.current = { apply, undo, redo };

  // Line breaks, pastes, formatting and history are the editor's own.
  useEffect(() => {
    const element = area.current;
    if (element === null) return;
    const onBeforeInput = (event: InputEvent) => {
      const { apply: run, undo: back, redo: forward } = latestCommands.current;
      switch (event.inputType) {
        case 'insertParagraph':
        case 'insertLineBreak':
          event.preventDefault();
          run(splitBlock);
          return;
        case 'historyUndo':
          event.preventDefault();
          back();
          return;
        case 'historyRedo':
          event.preventDefault();
          forward();
          return;
        case 'formatBold':
          event.preventDefault();
          run((lines, s) => toggleMark(lines, s, 'bold'));
          return;
        case 'formatItalic':
          event.preventDefault();
          run((lines, s) => toggleMark(lines, s, 'italic'));
          return;
        default:
          // Any other formatting (underline, colour, indent...) and drag and drop never land.
          if (event.inputType.startsWith('format') || event.inputType === 'insertFromDrop' || event.inputType === 'deleteByDrag') event.preventDefault();
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      const html = event.clipboardData?.getData('text/html') ?? '';
      const plain = event.clipboardData?.getData('text/plain') ?? '';
      const blocks = pastedBlocks(html, plain);
      latestCommands.current.apply((lines, s) => pasteBlocks(lines, s, blocks));
    };
    element.addEventListener('beforeinput', onBeforeInput);
    element.addEventListener('paste', onPaste);
    return () => {
      element.removeEventListener('beforeinput', onBeforeInput);
      element.removeEventListener('paste', onPaste);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === 'b' || key === 'i') {
        event.preventDefault();
        commands.toggleMark(key === 'b' ? 'bold' : 'italic');
        return;
      }
    }
    if (event.key === 'Enter') {
      // Enter that confirms an IME composition is the input method's.
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      apply(splitBlock);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      // A deletion inside an IME composition is the input method's.
      if (event.nativeEvent.isComposing) return;
      const direction = event.key === 'Backspace' ? 'backward' : 'forward';
      if (apply((lines, s) => deleteAt(lines, s, direction))) event.preventDefault();
    }
  };

  const insert = (name: SectionVariable) => {
    apply((lines, s) => insertVariable(lines, s, name));
  };

  return {
    pressed,
    toggleMark: commands.toggleMark,
    toggleList: commands.toggleList,
    insert,
    undo,
    redo,
    areaProps: {
      ref: area,
      role: 'textbox',
      'aria-multiline': true,
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: true,
      tabIndex: 0,
      onInput: () => report('typing'),
      onKeyDown,
      onFocus: () => latest.current.onFocusChange?.(true),
      onBlur: () => {
        latest.current.onFocusChange?.(false);
        latest.current.onBlur?.();
      },
    },
  };
}
