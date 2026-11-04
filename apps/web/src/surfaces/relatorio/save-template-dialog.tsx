import { textCapOf } from '@app/domain';
import { useId, useState } from 'react';
import { Button, CharCount, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';

/*
 * Story 11.3: the Sumário header Overflow's "Salvar como template" asks for one name,
 * prefilled with the project's name when known. A blank name keeps the primary disabled
 * with its reason; the projection itself is the kernel's (`templateFromRelatorio`).
 */

/** Story 20.9: the kernel's cap of a template's name (short text); a longer prefilled obra name is cut to it. */
const TEMPLATE_NAME_CAP = textCapOf('template', 'name');
const capName = (value: string) => (TEMPLATE_NAME_CAP === null ? value : value.slice(0, TEMPLATE_NAME_CAP));

export interface SaveTemplateDialogProps {
  initial: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function SaveTemplateDialog({ initial, onSubmit, onClose }: SaveTemplateDialogProps) {
  const t = copy.sumario;
  const [name, setName] = useState(() => capName(initial));
  const [left, setLeft] = useState(false);
  const helperId = useId();
  const empty = name.trim() === '';
  const submit = () => {
    if (empty) return;
    onSubmit(name.trim());
  };
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.saveTemplateTitle}
    >
      <label className="field">
        <span className="field-label">{t.saveTemplateNameLabel}</span>
        <input
          className="input"
          value={name}
          maxLength={TEMPLATE_NAME_CAP ?? undefined}
          aria-invalid={left && empty ? true : undefined}
          aria-describedby={left && empty ? helperId : undefined}
          onChange={(event) => {
            setLeft(false);
            setName(event.target.value);
          }}
          onBlur={() => setLeft(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              setLeft(true);
              submit();
            }
          }}
        />
        <CharCount length={name.length} cap={TEMPLATE_NAME_CAP} />
        {left && empty ? (
          <span className="helper" data-tone="red" id={helperId} role="alert">
            {t.tagDialogs.emptyName}
          </span>
        ) : null}
      </label>
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {ui.confirmDialog.cancel}
        </Button>
        <Button variant="primary" isDisabled={empty} disabledReason={empty ? t.saveTemplateMissingName : undefined} onPress={submit}>
          {t.saveTemplateSave}
        </Button>
      </div>
    </FormDialog>
  );
}
