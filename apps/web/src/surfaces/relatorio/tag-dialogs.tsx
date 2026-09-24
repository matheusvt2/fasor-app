import { equipmentPathText, tagTakenText, tagVerdict, type BlockRow, type EquipmentRow, type LocationRow, type TagVerdict } from '@app/domain';
import { useId, useState } from 'react';
import { Button, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';

/*
 * Story 4.5: the Form dialogs the tree opens — "Duplicar ⟨TAG⟩" and "Renomear TAG ⟨TAG⟩"
 * (one TAG field) and a location's "Renomear ⟨nome⟩" (one name field). A field refuses on
 * blur with its sentence (the kernel's for a TAG already in the obra); the primary is
 * `aria-disabled` with a visible reason while the text would be refused, never removed.
 */

/** The sentence a TAG field shows under itself for a verdict, or null when the TAG is fine. */
export function tagRefusalText(
  verdict: TagVerdict,
  where: { blocks: readonly Pick<BlockRow, 'equipment_id' | 'location_id' | 'removed_at'>[]; locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'name'>[] },
): string | null {
  if (verdict === null) return null;
  if (verdict.reason === 'empty') return copy.sumario.tagDialogs.emptyTag;
  return tagTakenText(verdict.holder.tag, equipmentPathText(where.blocks, where.locations, verdict.holder.id));
}

/** The primary's reason for a verdict ("Duplicar: falta a TAG"), or undefined when it can act. */
export function tagReason(verdict: TagVerdict, action: string): string | undefined {
  if (verdict === null) return undefined;
  return verdict.reason === 'empty' ? copy.sumario.tagDialogs.missingTag(action) : copy.sumario.tagDialogs.takenReason(action);
}

export interface TagFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The sentence shown after blur, or null. */
  refusal: string | null;
  onEnter?: () => void;
}

/** The mock's `.field` with a TAG input; the refusal shows under it once the field is left. */
export function TagField({ label, value, onChange, refusal, onEnter }: TagFieldProps) {
  const [left, setLeft] = useState(false);
  const helperId = useId();
  const shown = left ? refusal : null;
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        value={value}
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={shown === null ? undefined : true}
        aria-describedby={shown === null ? undefined : helperId}
        onChange={(event) => {
          setLeft(false);
          onChange(event.target.value);
        }}
        onBlur={() => setLeft(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            setLeft(true);
            onEnter?.();
          }
        }}
      />
      {shown === null ? null : (
        <span className="helper" data-tone="red" id={helperId} role="alert">
          {shown}
        </span>
      )}
    </label>
  );
}

export interface TagDialogProps {
  title: string;
  /** The primary's word ("Duplicar", "Salvar"). */
  action: string;
  initial: string;
  /** The project's equipment (removed rows included) and where its live blocks sit, for the refusal sentence. */
  equipment: readonly EquipmentRow[];
  blocks: readonly BlockRow[];
  locations: readonly LocationRow[];
  /** The equipment row being renamed: its own TAG is never "taken". */
  selfId?: string;
  onSubmit: (tag: string) => void;
  onClose: () => void;
}

/** "Duplicar ⟨TAG⟩" and "Renomear TAG ⟨TAG⟩": one TAG field, Cancelar and the primary. */
export function TagDialog({ title, action, initial, equipment, blocks, locations, selfId, onSubmit, onClose }: TagDialogProps) {
  const t = copy.sumario.tagDialogs;
  const [tag, setTag] = useState(initial);
  const verdict = tagVerdict(tag, equipment, selfId);
  const reason = tagReason(verdict, action);
  const submit = () => {
    if (verdict !== null) return;
    onSubmit(tag.trim());
  };
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
    >
      <TagField label={t.tagLabel} value={tag} onChange={setTag} refusal={tagRefusalText(verdict, { blocks, locations })} onEnter={submit} />
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {ui.confirmDialog.cancel}
        </Button>
        <Button variant="primary" isDisabled={reason !== undefined} disabledReason={reason} onPress={submit}>
          {action}
        </Button>
      </div>
    </FormDialog>
  );
}

export interface NameDialogProps {
  title: string;
  initial: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

/** A location's "Renomear ⟨nome⟩": one "Nome" field; an empty name is refused. */
export function NameDialog({ title, initial, onSubmit, onClose }: NameDialogProps) {
  const t = copy.sumario.tagDialogs;
  const [name, setName] = useState(initial);
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
      title={title}
    >
      <label className="field">
        <span className="field-label">{t.nameLabel}</span>
        <input
          className="input"
          value={name}
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
        {left && empty ? (
          <span className="helper" data-tone="red" id={helperId} role="alert">
            {t.emptyName}
          </span>
        ) : null}
      </label>
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {ui.confirmDialog.cancel}
        </Button>
        <Button variant="primary" isDisabled={empty} disabledReason={empty ? t.missingName(t.save) : undefined} onPress={submit}>
          {t.save}
        </Button>
      </div>
    </FormDialog>
  );
}
