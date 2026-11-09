import { screenLabel, tapPickerOf, type BlockDefinition, type BlockRow } from '@app/domain';
import { Combobox } from '../../components/index.ts';
import { SheetField, type FieldProps } from './ficha-fields.tsx';

/*
 * Story 23.7 (seed v13, decision K; `60-ficha.html` #/ficha/TR1 "Tap atual"): the field whose value
 * is picked from a list field of the plate (`FieldDef.pick_from`, the transformer's TAP ATUAL from
 * TAPS). With the list filled it is the shared Combobox (React Aria), one option per tap in plate
 * order, "3 — 12,6 kV", the options and the selection the kernel's (`tapPickerOf`); a pick commits
 * the tap's value as the field's number cell, `{raw, unit, state: 'measured'}`. A stored value the
 * list no longer holds stays readable as an option of its own. With the list empty the field is the
 * plain number field.
 */
export function TapAtualField(props: FieldProps & { block: BlockRow; definition: BlockDefinition }) {
  const { field, commit, missing, label, block, definition } = props;
  const picker = tapPickerOf(block, definition, field);
  if (picker === null) return <SheetField {...props} />;
  return (
    <div data-field-key={field.key} data-missing-field={missing ? '' : undefined}>
      <Combobox
        label={screenLabel(label ?? field.label)}
        options={picker.options.map((option) => ({ id: option.key, label: option.label }))}
        selectedKey={picker.selectedKey}
        onSelectionChange={(key) => {
          if (key === null || key === picker.selectedKey) return;
          const raw = picker.options.find((option) => option.key === key)?.raw ?? null;
          if (raw !== null) void commit({ raw, unit: field.unit ?? null, state: 'measured' });
        }}
      />
    </div>
  );
}
