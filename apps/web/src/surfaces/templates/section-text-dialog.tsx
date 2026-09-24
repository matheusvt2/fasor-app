import { INSERTABLE_SECTION_VARIABLES, SECTION_VARIABLE_LABELS } from '@app/domain';
import { useId, useState } from 'react';
import { Button, Chip, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSectionTextArea } from '../../input/use-section-text-area.ts';

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
  const noteId = useId();
  const [focused, setFocused] = useState(false);
  const committer = useFieldCommit<string>({ commit: onCommit });

  const { areaProps, insert } = useSectionTextArea({
    initialText: text,
    onChange: (value) => committer.change(value),
    onBlur: () => committer.blur(),
    onFocusChange: setFocused,
  });

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
          {...areaProps}
          className="rt-area"
          aria-label={copy.composer.sectionTextLabel(sectionNumber)}
          aria-describedby={noteId}
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
