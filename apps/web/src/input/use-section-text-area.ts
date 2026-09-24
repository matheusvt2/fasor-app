import type { SectionVariable } from '@app/domain';
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import {
  insertChip,
  insertLineBreak,
  insertText,
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
    if (area.current !== null) renderText(area.current, initial.current);
  }, []);

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
    if (area.current !== null) latest.current.onChange(serializeArea(area.current));
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
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault();
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
      insertText(element, currentRange(), (event.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n'));
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
    if (area.current !== null) renderText(area.current, text);
  };

  return {
    areaRef: area,
    setText,
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
