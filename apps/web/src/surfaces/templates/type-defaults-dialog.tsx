import {
  getDefinition,
  LOCKED_SUB_BLOCKS,
  naDefaultsCountText,
  naDefaultsFor,
  subtypeSchema,
  type EquipmentBlockType,
  type SubBlockKey,
  type TypeConfig,
} from '@app/domain';
import { useId } from 'react';
import { Button, Combobox, FormDialog, LockedToggle, Toggle } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

/** The option for a type used with no subtype (a React Aria key cannot be empty). */
const NO_SUBTYPE = 'sem_subtipo';

export interface TypeDefaultsDialogProps {
  type: EquipmentBlockType;
  seedVersion: string;
  /** The type's one config in the template, as this device holds it now. */
  config: TypeConfig;
  /** Autosave: one change, applied by the composer to the freshest row (`setTypeDefaults`). */
  onChange: (update: (current: TypeConfig) => TypeConfig) => void;
  onClose: () => void;
}

/**
 * Story 3.5: the sub-block defaults of one equipment type (the mock's expanded equipment
 * card in `42-template-composer.html`, opened here from the palette's equipment row). Every
 * sub-block of the type's definition is a Toggle row with its state word, except checklist
 * and conclusion, which read "Sempre" and are not controls; a type with subtypes in the
 * seed gets the subtype select, which pre-marks that subtype's items NA and removes none.
 * Every change autosaves and reaches every placement of the type.
 */
export function TypeDefaultsDialog({ type, seedVersion, config, onChange, onClose }: TypeDefaultsDialogProps) {
  const definition = getDefinition(seedVersion, 'cabine_primaria', type);
  const typeName = copy.composer.equipmentNames[type];
  const rowIdPrefix = useId();

  const setEnabled = (key: SubBlockKey, enabled: boolean) =>
    onChange((current) => ({ ...current, sub_blocks: { ...current.sub_blocks, [key]: { ...current.sub_blocks[key], enabled } } }));

  const setSubtype = (value: string) =>
    onChange((current) => {
      const parsed = subtypeSchema.safeParse(value);
      if (parsed.success) return { ...current, subtype: parsed.data, na_defaults: naDefaultsFor(seedVersion, type, parsed.data) };
      const next: TypeConfig = { ...current, na_defaults: [] };
      delete next.subtype;
      return next;
    });

  return (
    <FormDialog
      isOpen
      className="defaults-dialog"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.composer.defaultsTitle(typeName)}
    >
      <p className="dialog-meta">{copy.composer.defaultsScope}</p>
      {definition.subtypes.length === 0 ? null : (
        <div>
          <Combobox
            label={copy.composer.subtypeLabel}
            options={[
              { id: NO_SUBTYPE, label: copy.composer.noSubtype },
              ...definition.subtypes.map((subtype) => ({ id: subtype.key, label: subtype.label })),
            ]}
            selectedKey={config.subtype ?? NO_SUBTYPE}
            onSelectionChange={(key) => setSubtype(key ?? NO_SUBTYPE)}
          />
          <span className="helper">{naDefaultsCountText(config.na_defaults.length)}</span>
        </div>
      )}
      <div>
        <p className="table-title">{copy.composer.subBlocksTitle}</p>
        {definition.sub_blocks.map((key) => {
          const label = copy.composer.subBlockLabels[key];
          const locked = LOCKED_SUB_BLOCKS.includes(key);
          const toggleId = `${rowIdPrefix}-${key}`;
          return (
            <div className="toggle-row" key={key}>
              <div>
                {/* Tapping the row label toggles too (EXPERIENCE.md › Toggle). */}
                <label className="toggle-label" htmlFor={toggleId}>
                  {label}
                </label>
                {locked ? <div className="toggle-sub">{copy.composer.alwaysOnSheet}</div> : null}
              </div>
              {locked ? (
                <LockedToggle id={toggleId} aria-label={label} />
              ) : (
                <Toggle
                  id={toggleId}
                  isSelected={config.sub_blocks[key]?.enabled === true}
                  aria-label={label}
                  onChange={(enabled) => setEnabled(key, enabled)}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="section-note">{copy.composer.defaultsNote}</p>
      <div className="dialog-actions">
        <Button variant="primary" onPress={onClose}>
          {copy.composer.close}
        </Button>
      </div>
    </FormDialog>
  );
}
