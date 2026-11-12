import { testHelpEntries, testHelpMetaText, testHelpOf, testIndexHelpOf, type BlockDefinition } from '@app/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, TextButton } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import './ficha.css';

/*
 * Story 23.10 (batch e23h; `60-ficha.html` `#ficha-dlg-como-iso`, EXPERIENCE.md › "Como ensaiar"):
 * the text button "Como ensaiar" in a test's section head, drawn only when the test's definition
 * carries help (`testHelpOf`), and the read-only dialog it opens. Everything shown comes from the
 * definition already on the device, so it opens offline; it is never printed. The dialog lists only
 * the filled headings in the kernel's order (`testHelpEntries`) and the kernel's meta line
 * (`testHelpMetaText`). The focus goes to its title on open; Esc, the close button and "Voltar ao
 * ensaio" close it, and the focus returns to the button that opened it (`DialogShell`). A Form
 * dialog on tablet and desktop, full screen on the phone (`ficha.css`).
 */

export function TestHelpAction({ definition, testKey, title }: { definition: BlockDefinition; testKey: string; title: string }) {
  const help = testHelpOf(definition, testKey);
  const [open, setOpen] = useState(false);
  if (help === null) return null;
  return (
    <>
      <TextButton aria-haspopup="dialog" data-test-help="" onPress={() => setOpen(true)}>
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-book" />
        </svg>
        {copy.testHelp.open}
      </TextButton>
      {open ? <TestHelpDialog title={title} typeLabel={definition.label} help={help} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Story 25.23: the polarization index's own "Como ensaiar" (`testIndexHelpOf`, the base's IP row on a
 * company copy), a text button under the test's tables opening the same read-only dialog, titled with
 * the index; drawn only when the test carries it, on a read-only sheet too. Never printed.
 */
export function IndexHelpAction({ definition, testKey }: { definition: BlockDefinition; testKey: string }) {
  const help = testIndexHelpOf(definition, testKey);
  const [open, setOpen] = useState(false);
  if (help === null) return null;
  return (
    <p className="helper" data-index-help="">
      <TextButton aria-haspopup="dialog" onPress={() => setOpen(true)}>
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-book" />
        </svg>
        {copy.testHelp.openIndex}
      </TextButton>
      {open ? <TestHelpDialog title={copy.testHelp.indexTitle} typeLabel={definition.label} help={help} onClose={() => setOpen(false)} /> : null}
    </p>
  );
}

function TestHelpDialog({ title, typeLabel, help, onClose }: { title: string; typeLabel: string; help: NonNullable<ReturnType<typeof testHelpOf>>; onClose: () => void }) {
  const t = copy.testHelp;
  const titleId = useId();
  const metaId = useId();
  const heading = useRef<HTMLHeadingElement | null>(null);
  const entries = testHelpEntries(help);
  // EXPERIENCE.md: the initial focus is the title (a passive effect, so the overlay has already
  // recorded the opener it restores the focus to; `DialogShell` keeps a focus already inside).
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <DialogShell
      className="form-dialog como-dialog"
      overlayClassName="como-scrim"
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      aria-labelledby={titleId}
      aria-describedby={metaId}
    >
      <div className="como-head">
        <div>
          <p className="como-kicker">{t.kicker}</p>
          <h2 className="dialog-title" id={titleId} tabIndex={-1} ref={heading}>
            {title}
          </h2>
        </div>
        <button type="button" className="icon-btn" aria-label={t.close} onClick={onClose}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-close" />
          </svg>
        </button>
      </div>
      <p className="como-meta" id={metaId}>
        {testHelpMetaText(typeLabel, entries.length)}
      </p>
      <dl className="como-list">
        {entries.map((entry) => (
          <div key={entry.key} data-help-key={entry.key}>
            <dt>{t.headings[entry.key]}</dt>
            <dd>{entry.text}</dd>
          </div>
        ))}
      </dl>
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {t.back}
        </Button>
      </div>
    </DialogShell>
  );
}
