import { INSERTABLE_SECTION_VARIABLES, sectionVariableChipLabel } from '@app/domain';
import { useEffect, useId, useState } from 'react';
import { Button, Chip, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { RichTextField } from '../../input/rich-text-field.tsx';
import { useRichTextArea } from '../../input/use-rich-text-area.ts';

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
 * Stories 3.6 and 11.4: the section text editor of the Template composer
 * (`42-template-composer.html` `#tc-dlg-rich`). The mock's `.rich-text`: the `.rt-toolbar`
 * (Negrito · Itálico · Lista · Numeração, and "Variável", which opens the "Inserir dado do
 * relatório" chip row) over the `.rt-area` `contenteditable` box holding the formatted text
 * and its atomic variable chips. The toolbar is one tab stop (arrow keys move inside it); a
 * press acts on the selection last left in the text and gives the focus back to it. Every
 * change autosaves like any field (500 ms idle, blur, and on close), as the kernel's markup.
 */
export function SectionTextDialog({ sectionTitle, sectionNumber, text, onCommit, onRestore, onClose }: SectionTextDialogProps) {
  const noteId = useId();
  const varsId = useId();
  const [focused, setFocused] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const committer = useFieldCommit<string>({ commit: onCommit });

  const editor = useRichTextArea({
    initialText: text,
    onChange: (value) => committer.change(value),
    onBlur: () => committer.blur(),
    onFocusChange: setFocused,
  });

  // The dialog opens with the focus in the text (E3-A9), not on the toolbar before it: the
  // shell focuses the first control only when nothing inside the dialog holds the focus.
  const areaRef = editor.areaProps.ref;
  useEffect(() => {
    areaRef.current?.focus({ preventScroll: true });
  }, [areaRef]);

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
      <RichTextField
        editor={editor}
        focused={focused}
        label={copy.composer.sectionTextLabel(sectionNumber)}
        describedBy={noteId}
        variable={{ expanded: varsOpen, controls: varsId, onPress: () => setVarsOpen((open) => !open) }}
      />
      <div id={varsId} hidden={!varsOpen}>
        <p className="field-label" aria-hidden="true">
          {copy.composer.insertVariable}
        </p>
        <div className="chip-row" role="group" aria-label={copy.composer.insertVariable}>
          {INSERTABLE_SECTION_VARIABLES.map((name) => (
            <Chip key={name} onPress={() => editor.insert(name)}>
              {sectionVariableChipLabel(name)}
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
