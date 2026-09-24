import { getSeed } from '@app/domain';
import { useState } from 'react';
import { Button, FilterChipGroup, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';

/*
 * Story 5.9: "Marcar não ensaiado", shared by the sheet header's Overflow and the tree's
 * Block card Overflow. The seed's 3 reasons as a Filter chip group (source-deltas.md row
 * 18 -- never a hardcoded list), "Outro" reveals a text field, the last reason used in
 * this relatório preselected (EXPERIENCE.md › Não ensaiado reason).
 */
const OUTRO = 'outro';

export interface NotTestedDialogProps {
  seedVersion: string;
  /** The relatório's `lastNotTestedReason`, or null to default to the seed's first reason. */
  lastReason: string | null;
  onClose: () => void;
  onSubmit: (reasonKey: string, text: string | null) => void;
}

export function NotTestedDialog({ seedVersion, lastReason, onClose, onSubmit }: NotTestedDialogProps) {
  const t = copy.sumario.tree;
  const reasons = getSeed(seedVersion, 'cabine_primaria').not_tested_reasons;
  const [selected, setSelected] = useState(() => (lastReason !== null && reasons.some((r) => r.key === lastReason) ? lastReason : (reasons[0]?.key ?? '')));
  const [text, setText] = useState('');

  const submit = () => {
    if (selected === '') return;
    onSubmit(selected, selected === OUTRO ? (text.trim() === '' ? null : text.trim()) : null);
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
        <Button variant="primary" isDisabled={selected === ''} onPress={submit}>
          {t.markNotTested}
        </Button>
      </div>
    </FormDialog>
  );
}
