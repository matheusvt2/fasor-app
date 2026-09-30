import { INSERTABLE_SECTION_VARIABLES, sectionVariableChipLabel } from '@app/domain';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Chip, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
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
      <div className={focused ? 'rich-text is-focus' : 'rich-text'}>
        <Toolbar
          tools={[
            { label: copy.composer.formatBold, pressed: editor.pressed.bold, onPress: () => editor.toggleMark('bold') },
            { label: copy.composer.formatItalic, pressed: editor.pressed.italic, onPress: () => editor.toggleMark('italic') },
            { label: copy.composer.formatBullets, pressed: editor.pressed.bullet, onPress: () => editor.toggleList('bullet') },
            { label: copy.composer.formatNumbered, pressed: editor.pressed.numbered, onPress: () => editor.toggleList('numbered') },
            { label: copy.composer.formatVariable, variable: { expanded: varsOpen, controls: varsId }, onPress: () => setVarsOpen((open) => !open) },
          ]}
        />
        <div
          {...editor.areaProps}
          className="rt-area"
          aria-label={copy.composer.sectionTextLabel(sectionNumber)}
          aria-describedby={noteId}
        />
      </div>
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

interface ToolSpec {
  label: string;
  onPress: () => void;
  /** A formatting toggle's state (`aria-pressed`). */
  pressed?: boolean;
  /** "Variável": whether its chip row is open (`aria-expanded`) and which row it controls. */
  variable?: { expanded: boolean; controls: string };
}

/**
 * The mock's `.rt-toolbar` (`role="toolbar"`, "Formatação") of `.rt-tool` word buttons:
 * one tab stop, the arrow keys, Home and End move between its buttons (APG toolbar). A
 * mouse press on a formatting toggle never takes the focus from the text, so its selection
 * stays; "Variável" takes it, so the chip row it opens is next in the tab order.
 */
function Toolbar({ tools }: { tools: readonly ToolSpec[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const buttons = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('.rt-tool') ?? []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = buttons();
    const index = all.indexOf(event.target as HTMLButtonElement);
    if (index === -1) return;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % all.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + all.length) % all.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = all.length - 1;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    all[next]!.focus();
  };

  return (
    <div ref={ref} className="rt-toolbar" role="toolbar" aria-label={copy.composer.formatToolbar} onKeyDown={onKeyDown}>
      {tools.map((tool, index) => (
        <button
          key={tool.label}
          type="button"
          className={tool.variable === undefined ? 'rt-tool' : 'rt-tool rt-var'}
          tabIndex={index === active ? 0 : -1}
          {...(tool.pressed === undefined ? {} : { 'aria-pressed': tool.pressed })}
          {...(tool.variable === undefined ? {} : { 'aria-expanded': tool.variable.expanded, 'aria-controls': tool.variable.controls })}
          onFocus={() => setActive(index)}
          onMouseDown={(event) => {
            if (tool.variable === undefined) event.preventDefault();
          }}
          onClick={tool.onPress}
        >
          {tool.variable === undefined ? null : (
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-plus" />
            </svg>
          )}
          {tool.label}
        </button>
      ))}
    </div>
  );
}
