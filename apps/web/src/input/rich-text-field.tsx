import { useRef, useState, type KeyboardEvent } from 'react';
import { ui } from '../copy/ui.ts';
import type { UseRichTextArea } from './use-rich-text-area.ts';

/*
 * Story 11.4, E11-Q5: the one rich editor of the product, the mock's `.rich-text`
 * (`42-template-composer.html` `#tc-dlg-rich`): the `.rt-toolbar` (Negrito · Itálico · Lista ·
 * Numeração, and "Variável" where the caller hides its chip row behind it) over the `.rt-area`
 * `contenteditable` box of `useRichTextArea`. The Template composer's section text dialog and
 * the relatório's Section text surface both render it, so what either shows bold prints bold
 * and no one ever sees the stored `**` markup. The caller owns the hook (its autosave, its
 * restore) and the focus state it styles with `.is-focus`.
 */

export interface RichTextFieldProps {
  editor: UseRichTextArea;
  /** The area's own focus (`onFocusChange` of the hook), drawn as `.rich-text.is-focus`. */
  focused: boolean;
  /** The text area's accessible name, or the id of the element that names it. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  /** "Variável": the toolbar word that opens the caller's chip row (omitted where the row always shows). */
  variable?: { expanded: boolean; controls: string; onPress: () => void };
  /** Extra class names on the area (a surface's own sizing). */
  areaClassName?: string;
}

export function RichTextField({ editor, focused, label, labelledBy, describedBy, variable, areaClassName }: RichTextFieldProps) {
  const tools: ToolSpec[] = [
    { label: ui.richText.bold, pressed: editor.pressed.bold, onPress: () => editor.toggleMark('bold') },
    { label: ui.richText.italic, pressed: editor.pressed.italic, onPress: () => editor.toggleMark('italic') },
    { label: ui.richText.bullets, pressed: editor.pressed.bullet, onPress: () => editor.toggleList('bullet') },
    { label: ui.richText.numbered, pressed: editor.pressed.numbered, onPress: () => editor.toggleList('numbered') },
    ...(variable === undefined ? [] : [{ label: ui.richText.variable, variable: { expanded: variable.expanded, controls: variable.controls }, onPress: variable.onPress }]),
  ];
  return (
    <div className={focused ? 'rich-text is-focus' : 'rich-text'}>
      <Toolbar tools={tools} />
      <div
        {...editor.areaProps}
        className={areaClassName === undefined ? 'rt-area' : `rt-area ${areaClassName}`}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      />
    </div>
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
    <div ref={ref} className="rt-toolbar" role="toolbar" aria-label={ui.richText.toolbar} onKeyDown={onKeyDown}>
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
