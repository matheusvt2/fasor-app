import type { SectionVariable } from '@app/domain';
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import {
  endRange,
  insertChip,
  insertLineBreak,
  insertText,
  placeCaret,
  rangeInside,
  removeChipAtCaret,
  renderText,
  serializeArea,
} from '../surfaces/templates/section-text-editor.ts';

/*
 * Story 4.7: the section text editor's DOM wiring (Story 3.6), extracted so both the
 * Template composer's `SectionTextDialog` and this batch's relatório `section-text-surface`
 * share one `contenteditable` area with atomic variable chips, no toolbar, no formatting
 * runs (FR-12 deferred). The area is uncontrolled: React never renders its children, only
 * the caller's DOM helpers and this hook change it once mounted.
 */

export interface UseSectionTextAreaOptions {
  /** The text the area is filled with once, on mount; later changes never re-render it. */
  initialText: string;
  /** Called with the area's current text on every input, paste or chip edit. */
  onChange: (text: string) => void;
  /** Called on blur, after `onChange`'s last call for that edit (the autosave flush point). */
  onBlur?: () => void;
  /** Called with the area's own focus state, for a caller that styles it (`.is-focus`). */
  onFocusChange?: (focused: boolean) => void;
  /**
   * Story 6.6: how a text becomes the area's nodes (default: `renderText`, variable chips)
   * and how a paste lands at the caret (default: `insertText`). The point editor passes its
   * own, whose chips are photo references and whose pastes stay plain text.
   */
  render?: (area: HTMLElement, text: string) => void;
  paste?: (area: HTMLElement, range: Range | null, text: string) => void;
  /**
   * Story 20.9: the kernel's cap of the stored text (`textCapOf`), or null for none. Typing past
   * it is stopped, a paste is cut at the room left, and an edit of the caller's (a chip, a quick
   * text) that would grow the text past it is taken back; a text already over it may shrink.
   */
  maxLength?: number | null;
}

export interface SectionTextAreaProps {
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

export interface UseSectionTextArea {
  areaRef: RefObject<HTMLDivElement | null>;
  /** Spread onto the `contenteditable` `<div>`; the caller adds its own `aria-label`/`aria-describedby`. */
  areaProps: SectionTextAreaProps;
  /** Inserts a variable chip at the caret last left in the area (or at the end with none saved). */
  insert: (name: SectionVariable) => void;
  /**
   * Replaces the area's own text imperatively, outside the input/change cycle: the area is
   * uncontrolled (filled once, on mount) so a caller whose text changed for a reason other
   * than typing in it -- "Restaurar texto do template" and its "Desfazer" (Story 4.7) --
   * calls this to keep what is shown in step with what was just committed, without a remount
   * (which would drop caret and focus every ordinary autosave, since `section_text` changes
   * on every one of those too).
   */
  setText: (text: string) => void;
  /**
   * Story 6.6: runs an edit of the caller's (a photo chip, a quick text) at the caret last
   * left in the area -- or at the end with none saved -- then reports the change.
   */
  editAtCaret: (edit: (area: HTMLElement, range: Range | null) => void) => void;
}

/** The extracted hook: ref, caret tracking, `beforeinput`/`paste`/`keydown` wiring, chip insert. */
export function useSectionTextArea(options: UseSectionTextAreaOptions): UseSectionTextArea {
  const area = useRef<HTMLDivElement>(null);
  const caret = useRef<Range | null>(null);

  const latest = useRef(options);
  latest.current = options;

  // The area is uncontrolled: filled once, when it mounts, from then on only the user and
  // the helpers below change it.
  const initial = useRef(options.initialText);
  useLayoutEffect(() => {
    if (area.current !== null) (latest.current.render ?? renderText)(area.current, initial.current);
  }, []);
  /** Story 20.9: the last text the area held within the cap (or the stored one, which may be over it). */
  const accepted = useRef(options.initialText);

  // The caret the chip row inserts at: the last one the user left in the area, kept while
  // the focus moves to a chip button outside it.
  useEffect(() => {
    const onSelection = () => {
      const selection = document.getSelection();
      const element = area.current;
      if (element === null || selection === null || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (rangeInside(element, range)) caret.current = range.cloneRange();
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const changed = () => {
    const element = area.current;
    if (element === null) return;
    const text = serializeArea(element);
    const cap = latest.current.maxLength ?? null;
    if (cap !== null && text.length > cap && text.length > accepted.current.length) {
      // Story 20.9: an edit that grew the text past the cap is taken back whole.
      (latest.current.render ?? renderText)(element, accepted.current);
      placeCaret(element, endRange(element));
      return;
    }
    accepted.current = text;
    latest.current.onChange(text);
  };

  /** Story 20.9: how many more characters the stored text takes in place of `range`'s, or null for no cap. */
  const room = (element: HTMLElement, range: Range | null): number | null => {
    const cap = latest.current.maxLength ?? null;
    if (cap === null) return null;
    const selected = range !== null && rangeInside(element, range) ? range.toString().length : 0;
    return cap - (serializeArea(element).length - selected);
  };

  const currentRange = (): Range | null => {
    const selection = document.getSelection();
    return selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  };

  // Line breaks and pastes are the editor's own, so the area only ever holds text, `<br>`
  // and chips (a browser would add `<div>`s, or keep a paste's formatting).
  useEffect(() => {
    const element = area.current;
    if (element === null) return;
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType === 'insertText' || event.inputType === 'insertReplacementText') {
        // Story 20.9: typing stops at the cap of the stored text.
        const typed = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
        const left = room(element, currentRange());
        if (left !== null && typed.length > left) event.preventDefault();
      } else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault();
        const left = room(element, currentRange());
        if (left !== null && left < 1) return;
        insertLineBreak(element, currentRange());
        changed();
      } else if (
        // The browser's undo history never saw the editor's own DOM edits (chips, line
        // breaks, pastes, a chip removed whole), so its undo would take back the wrong thing.
        event.inputType === 'historyUndo' ||
        event.inputType === 'historyRedo' ||
        event.inputType === 'insertFromDrop' ||
        event.inputType === 'deleteByDrag' ||
        event.inputType === 'formatBold' ||
        event.inputType === 'formatItalic' ||
        event.inputType === 'formatUnderline' ||
        event.inputType === 'formatStrikeThrough'
      ) {
        event.preventDefault();
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      const pasted = (event.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
      // Story 20.9: a paste past the cap lands cut at the room the stored text has left.
      const left = room(element, currentRange());
      const text = left === null ? pasted : pasted.slice(0, Math.max(0, left));
      if (text === '' && pasted !== '') return;
      (latest.current.paste ?? insertText)(element, currentRange(), text);
      changed();
    };
    element.addEventListener('beforeinput', onBeforeInput);
    element.addEventListener('paste', onPaste);
    return () => {
      element.removeEventListener('beforeinput', onBeforeInput);
      element.removeEventListener('paste', onPaste);
    };
    // `changed` reads refs only; binding once is enough.
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Ctrl/Cmd+Z, Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z: the browser's undo and redo, stopped
    // before a browser that raises no `historyUndo` beforeinput for them acts.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      return;
    }
    const element = area.current;
    const range = currentRange();
    if (element === null || range === null) return;
    // A chip goes whole in one keystroke, never one character at a time.
    if (event.key === 'Backspace' || event.key === 'Delete') {
      if (removeChipAtCaret(element, range, event.key === 'Backspace' ? 'backward' : 'forward')) {
        event.preventDefault();
        changed();
      }
    } else if (event.key === 'Enter') {
      // Enter that confirms an IME composition is the input method's, not a line break.
      if (event.nativeEvent.isComposing) return;
      // Some browsers raise no `beforeinput` for Enter in every case; one path for both.
      event.preventDefault();
      const left = room(element, range);
      if (left !== null && left < 1) return;
      insertLineBreak(element, range);
      changed();
    }
  };

  const insert = (name: SectionVariable) => {
    const element = area.current;
    if (element === null) return;
    element.focus();
    insertChip(element, caret.current, name);
    changed();
  };

  const setText = (text: string) => {
    accepted.current = text;
    if (area.current !== null) (latest.current.render ?? renderText)(area.current, text);
  };

  const editAtCaret = (edit: (area: HTMLElement, range: Range | null) => void) => {
    const element = area.current;
    if (element === null) return;
    element.focus();
    edit(element, caret.current);
    changed();
  };

  return {
    areaRef: area,
    setText,
    editAtCaret,
    areaProps: {
      ref: area,
      role: 'textbox',
      'aria-multiline': true,
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: true,
      tabIndex: 0,
      onInput: changed,
      onKeyDown,
      onFocus: () => {
        latest.current.onFocusChange?.(true);
      },
      onBlur: () => {
        latest.current.onFocusChange?.(false);
        latest.current.onBlur?.();
      },
    },
    insert,
  };
}
