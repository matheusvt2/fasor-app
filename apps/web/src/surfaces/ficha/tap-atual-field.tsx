import { NOT_APPLICABLE_NUMBER, screenLabel, TAP_PICKER_NOT_APPLICABLE_KEY, tapPickerOf, type BlockDefinition, type BlockRow } from '@app/domain';
import { Combobox } from '../../components/index.ts';
import { SheetField, type FieldProps } from './ficha-fields.tsx';

/*
 * Story 23.7 (seed v13, decision K; `60-ficha.html` #/ficha/TR1 "Tap atual"): the field whose value
 * is picked from a list field of the plate (`FieldDef.pick_from`, the transformer's TAP ATUAL from
 * TAPS). With the list filled it is the shared Combobox (React Aria), one option per tap in plate
 * order, "3 — 12,6 kV", then "N/A" where the field takes it, the options and the selection the
 * kernel's (`tapPickerOf`); a pick commits the tap's value as the field's number cell,
 * `{raw, unit, state: 'measured'}`, "N/A" the not-applicable value every plate number field takes.
 * A stored value the list no longer holds stays readable as an option of its own. The select's empty
 * option (`selectEmpty`, "Selecione") leads the list as on every plate select: it reads while nothing
 * is stored, and picked it clears the field (being the selection then, the list closes as after any
 * pick). The helper and the suggestion's line (`after`) sit under the field, as on every plate field.
 * With the list empty the field is the plain number field.
 */

/** The empty option: what the field reads while it holds nothing, and what clears it. */
const CLEAR_KEY = 'limpar';

export function TapAtualField(props: FieldProps & { block: BlockRow; definition: BlockDefinition }) {
  const { field, commit, missing, label, block, definition, helper, after, selectEmpty, acceptsNotApplicable } = props;
  const picker = tapPickerOf(block, definition, field, { acceptsNotApplicable: acceptsNotApplicable === true });
  if (picker === null) return <SheetField {...props} />;
  const options = [{ id: CLEAR_KEY, label: selectEmpty ?? '' }, ...picker.options.map((option) => ({ id: option.key, label: option.label }))];
  const selectedKey = picker.selectedKey ?? CLEAR_KEY;
  return (
    <div data-field-key={field.key} data-missing-field={missing ? '' : undefined}>
      <Combobox
        label={screenLabel(label ?? field.label)}
        options={options}
        selectedKey={selectedKey}
        onSelectionChange={(key) => {
          if (key === null || key === selectedKey) return;
          if (key === CLEAR_KEY) {
            void commit(null);
            return;
          }
          if (key === TAP_PICKER_NOT_APPLICABLE_KEY) {
            void commit({ ...NOT_APPLICABLE_NUMBER });
            return;
          }
          const raw = picker.options.find((option) => option.key === key)?.raw ?? null;
          if (raw !== null) void commit({ raw, unit: field.unit ?? null, state: 'measured' });
        }}
      />
      {helper === undefined ? null : <span className="helper">{helper}</span>}
      {after}
    </div>
  );
}
