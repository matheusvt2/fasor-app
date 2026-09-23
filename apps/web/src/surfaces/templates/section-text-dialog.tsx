import { INSERTABLE_SECTION_VARIABLES, SECTION_VARIABLE_LABELS, type SectionVariable } from '@app/domain';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Chip, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import {
  insertChip,
  insertLineBreak,
  insertText,
  rangeInside,
  removeChipAtCaret,
  renderText,
  serializeArea,
} from './section-text-editor.ts';

export interface SectionTextDialogProps {
  /** "1 Objetivo": the section's number and title. */
  sectionTitle: string;
  sectionNumber: number;
  /** The text the dialog opens with: the template's own, or the seed's in force. */
  text: string;
  /** Autosave: writes the template's own text. */
  onCommit: (text: string) => Promise<void>;
  /** "Restaurar texto padrão": the seed's text back in force (the composer offers "Desfazer"). */
  onRestore: () => void;
  onClose: () => void;
}

/**
 * Story 3.6: the section text editor of the Template composer (`42-template-composer.html`
 * `#tc-dlg-rich`, without its toolbar: plain text in the MVP, rich text is FR-12). The
 * text area is the mock's `.rich-text .rt-area` `contenteditable` box holding atomic
 * variable chips; the "Inserir dado do relatório" chip row (`45-secao.html`) inserts one at
 * the caret. Every change autosaves like any field (500 ms idle, blur, and on close).
 */
export function SectionTextDialog({ sectionTitle, sectionNumber, text, onCommit, onRestore, onClose }: SectionTextDialogProps) {
  const area = useRef<HTMLDivElement>(null);
  const caret = useRef<Range | null>(null);
  const noteId = useId();
  const [focused, setFocused] = useState(false);
  const committer = useFieldCommit<string>({ commit: onCommit });

  // The area is uncontrolled: React never renders its children. It is filled once, when the
  // dialog opens, and from then on only the user and the helpers below change it.
  const initial = useRef(text);
  useLayoutEffect(() => {
    if (area.current !== null) renderText(area.current, initial.current);
  }, []);

  // The caret the chip row inserts at: the last one the user left in the area, kept while
  // the focus moves to a chip.
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
    if (area.current !== null) committer.change(serializeArea(area.current));
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
        event.inputType === 'insertFromDrop' ||
        event.inputType === 'deleteByDrag' ||
        event.inputType === 'formatBold' ||
        event.inputType === 'formatItalic'
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
    // `changed` reads refs only (the committer is stable), so binding once is enough.
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

  const close = () => {
    committer.flush();
    onClose();
  };

  return (
    <FormDialog
      isOpen
      className="rich-dialog"
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={copy.composer.textTitle(sectionTitle)}
    >
      <p className="dialog-meta" id={noteId}>
        {copy.composer.textNote}
      </p>
      <div className={focused ? 'rich-text is-focus' : 'rich-text'}>
        <div
          ref={area}
          className="rt-area"
          role="textbox"
          aria-multiline="true"
          aria-label={copy.composer.sectionTextLabel(sectionNumber)}
          aria-describedby={noteId}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          tabIndex={0}
          onInput={changed}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            committer.blur();
          }}
        />
      </div>
      <div>
        <p className="field-label" aria-hidden="true">
          {copy.composer.insertVariable}
        </p>
        <div className="chip-row" role="group" aria-label={copy.composer.insertVariable}>
          {INSERTABLE_SECTION_VARIABLES.map((name) => (
            <Chip key={name} onPress={() => insert(name)}>
              {SECTION_VARIABLE_LABELS[name].toLocaleLowerCase('pt-BR')}
            </Chip>
          ))}
        </div>
      </div>
      <p className="section-note">{copy.composer.textAutosave}</p>
      <div className="dialog-actions">
        <Button
          variant="secondary"
          onPress={() => {
            // A pending edit is written first, so "Desfazer" brings back the latest text.
            committer.flush();
            onRestore();
          }}
        >
          {copy.composer.restoreDefaultText}
        </Button>
        <Button variant="primary" onPress={close}>
          {copy.composer.close}
        </Button>
      </div>
    </FormDialog>
  );
}
