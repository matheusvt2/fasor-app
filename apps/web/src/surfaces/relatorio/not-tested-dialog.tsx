import { getSeed } from '@app/domain';
import { useState } from 'react';
import { Button, FilterChipGroup, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';

/*
 * Stories 5.9 and 12.4: "Marcar não ensaiado", shared by the sheet header's Overflow and the
 * tree's Block card Overflow. The seed's reasons as a Filter chip group (never a hardcoded
 * list: seed v2 offers Impossibilidade de desligamento, Solicitação do cliente, Equipamento
 * inacessível and "Outro", a v1 relatório its own three), "Outro" reveals a required text
 * field. Nothing is preselected (J-16, `source-deltas.md` row 56): the primary waits,
 * disabled with its reason, for a tap on a reason and, with "Outro", for text.
 */
const OUTRO = 'outro';

export interface NotTestedDialogProps {
  seedVersion: string;
  onClose: () => void;
  onSubmit: (reasonKey: string, text: string | null) => void;
}

export function NotTestedDialog({ seedVersion, onClose, onSubmit }: NotTestedDialogProps) {
  const t = copy.sumario.tree;
  const reasons = getSeed(seedVersion, 'cabine_primaria').not_tested_reasons;
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState('');
  const disabledReason = selected === null ? t.notTestedPickReason : selected === OUTRO && text.trim() === '' ? t.notTestedTextReason : undefined;

  const submit = () => {
    if (selected === null || disabledReason !== undefined) return;
    onSubmit(selected, selected === OUTRO ? text.trim() : null);
  };

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.markNotTested}
    >
      <FilterChipGroup options={reasons.map((reason) => ({ id: reason.key, label: reason.label }))} selectedId={selected} onChange={setSelected} aria-label={t.notTestedReasonLabel} />
      {selected === OUTRO ? (
        <label className="field">
          <span className="field-label">{t.notTestedTextLabel}</span>
          <input className="input" value={text} onChange={(event) => setText(event.target.value)} />
        </label>
      ) : null}
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {ui.confirmDialog.cancel}
        </Button>
        <Button variant="primary" isDisabled={disabledReason !== undefined} {...(disabledReason === undefined ? {} : { disabledReason })} onPress={submit}>
          {t.markNotTested}
        </Button>
      </div>
    </FormDialog>
  );
}
