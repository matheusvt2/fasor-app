import { moveTagSuggestion, moveTargets, type BlockRow, type EquipmentRow, type LocationRow } from '@app/domain';
import { useState } from 'react';
import { Button, Checkbox, FilterChipGroup, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';

/*
 * Story 11.2: "Mover para…", shared by the Sumário's Block card Overflow and the sheet
 * header's. The live locations (the kernel's `moveTargets`, the block's own left out) as a
 * Filter chip group with nothing preselected; once a target is picked and the kernel has a
 * TAG to re-suggest there, its question and a "Renomear para ⟨TAG⟩" checkbox, unchecked by
 * default (spec OPEN QUESTION). The primary waits, disabled with its reason, for a target.
 * The move itself is re-planned on the fresh rows at commit (`movePlan`).
 */

export interface MoveBlockDialogProps {
  /** What the title names the block by: its TAG, else its type. */
  name: string;
  blockId: string;
  locations: readonly LocationRow[];
  blocks: readonly BlockRow[];
  /** The project's equipment, removed rows included. */
  equipment: readonly EquipmentRow[];
  onClose: () => void;
  onSubmit: (targetId: string, rename: boolean) => void;
}

export function MoveBlockDialog({ name, blockId, locations, blocks, equipment, onClose, onSubmit }: MoveBlockDialogProps) {
  const t = copy.sumario.tree;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [rename, setRename] = useState(false);
  const block = blocks.find((row) => row.id === blockId);
  const targets = block === undefined ? [] : moveTargets([...locations], block);
  const target = targetId === null ? undefined : locations.find((row) => row.id === targetId);
  const own = block?.equipment_id == null ? undefined : equipment.find((row) => row.id === block.equipment_id && row.removed_at === null);
  const suggestion = block === undefined || target === undefined ? null : moveTagSuggestion(block, own, target, equipment);
  const disabledReason = targetId === null ? t.movePickReason : undefined;

  const submit = () => {
    if (targetId === null) return;
    onSubmit(targetId, suggestion !== null && rename);
  };

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.moveTitle(name)}
    >
      <FilterChipGroup options={targets.map((row) => ({ id: row.id, label: row.label }))} selectedId={targetId} onChange={setTargetId} aria-label={t.moveTargetsLabel} />
      {suggestion === null ? null : (
        <>
          <p className="t-body">{suggestion.question}</p>
          <Checkbox isSelected={rename} onChange={setRename}>
            {suggestion.renameLabel}
          </Checkbox>
        </>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {ui.confirmDialog.cancel}
        </Button>
        <Button variant="primary" isDisabled={disabledReason !== undefined} {...(disabledReason === undefined ? {} : { disabledReason })} onPress={submit}>
          {t.moveAction}
        </Button>
      </div>
    </FormDialog>
  );
}
