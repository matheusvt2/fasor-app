import {
  formatDecimalGroupedPtBr,
  manufacturerValueView,
  nextUnit,
  numberEchoText,
  parseManufacturerValue,
  type BlockDefinition,
  type BlockRow,
  type TestDef,
} from '@app/domain';
import { useId, useRef, useState } from 'react';
import { TextButton } from '../../components/index.ts';
import { useNumberInput } from '../../components/number-input.tsx';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import type { FichaApi } from './ficha-api.ts';
import { DRAFT_SURFACE } from './ficha-fields.tsx';
import { testManufacturerValueOp } from './ficha-ops.ts';

/*
 * Batch e23a (Story 23.3, absorbs 14.13; `60-ficha.html` #/ficha/TR1 `.v13-mfr`): the manufacturer's
 * value of one test, an optional entry under the criterion row of the test's first table, on every
 * seed version. The operator sign (`.mfr-op`), the units and the note (`.mfr-note`) are the kernel's
 * (`manufacturerValueView`); the typed text is read by the kernel's `parseManufacturerValue`, so a
 * value the fold would refuse (a negative, a zero, no number, a unit the criterion cannot take) is
 * shown refused under the entry and never written. One op on commit (blur or Enter), the
 * `criterion_override` put; "Limpar" puts null and the table's or the test's criterion holds again.
 * Read-only, the stored value as text and no entry.
 */
export function ManufacturerValue({
  api,
  block,
  definition,
  test,
  title,
  readOnly,
}: {
  api: FichaApi;
  block: BlockRow;
  definition: BlockDefinition;
  test: TestDef;
  /** The test's heading, for the entry's accessible name. */
  title: string;
  readOnly: boolean;
}) {
  const t = copy.ficha.ensaios;
  const m = ui.measurementField;
  const helperId = useId();
  const echoId = useId();
  // The caller renders this only for a test that takes a value (`manufacturerApplies`).
  const view = manufacturerValueView(block, definition, test)!;
  // The unit chosen on the slot before a value holds it; a change of the stored value drops it.
  const [unitChoice, setUnitChoice] = useState<string | null>(null);
  const storedKey = `${view.value?.raw ?? ''}:${view.value?.unit ?? ''}`;
  const seen = useRef(storedKey);
  if (seen.current !== storedKey) {
    seen.current = storedKey;
    if (unitChoice !== null) setUnitChoice(null);
  }
  const slotUnit = unitChoice ?? view.unit;
  const cycles = view.units.length > 1;

  const write = (value: { raw: string; unit: string | null } | null) => {
    if (api.author === null) return undefined;
    return api.commit([testManufacturerValueOp(api.author, api.relatorioId, api.blockId, test.key, value)]);
  };

  const number = useNumberInput({
    storedText: view.text,
    storedRaw: view.value?.raw ?? null,
    parse: (text) => {
      const parsed = parseManufacturerValue(test, text, slotUnit);
      return 'refusal' in parsed ? 'invalid' : parsed.value;
    },
    commit: (value) => {
      const result = write(value === null ? null : { raw: value.raw, unit: value.unit });
      if (value !== null && value.unit !== view.unit) setUnitChoice(value.unit);
      return result;
    },
    echo: (value) => numberEchoText(value.raw, value.unit),
    format: (value) => formatDecimalGroupedPtBr(value.raw),
    draft: { surface: DRAFT_SURFACE, entityId: api.blockId, field: `manufacturer-${test.key}` },
  });

  const shownUnit = number.focused && number.parsed !== null && number.parsed !== 'invalid' ? number.parsed.unit : slotUnit;
  const refusal = number.invalid ? (() => {
    const parsed = parseManufacturerValue(test, number.text, slotUnit);
    return 'refusal' in parsed ? parsed.refusal : null;
  })() : null;

  /** The unit slot changed: a value already there (stored or typed) is rewritten in the new unit at once. */
  const chooseUnit = (unit: string | null) => {
    setUnitChoice(unit);
    const parsed = number.parsed;
    if (parsed !== null && parsed !== 'invalid') number.commitValue({ raw: parsed.raw, unit });
  };
  const keepFocus = (event: { preventDefault: () => void }) => {
    if (number.focused) event.preventDefault();
  };

  const note = (
    <p className="mfr-note" data-manufacturer-note="">
      {view.note.lead}
      <b>{view.note.criterion}</b>
      {view.note.tail}
    </p>
  );

  if (readOnly) {
    return (
      <div className="v13-mfr" data-manufacturer={test.key}>
        <div className="field">
          <span className="field-label" aria-hidden="true">
            {t.manufacturerLabel}
          </span>
          <div className="measurement-field" role="textbox" aria-readonly="true" aria-label={t.manufacturerName(title)}>
            <span className="mfr-op" aria-hidden="true">
              {view.operator}
            </span>
            <span className={view.value === null ? 'mf-value is-empty' : 'mf-value'}>{view.value === null ? '—' : view.text}</span>
            {view.unit === null ? null : <span className="mf-unit">{view.unit}</span>}
          </div>
        </div>
        {note}
      </div>
    );
  }

  const describedBy = [number.echo === null ? null : echoId, refusal === null ? null : helperId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="v13-mfr" data-manufacturer={test.key}>
      <div className="field">
        <span className="field-label" aria-hidden="true">
          {t.manufacturerLabel}
        </span>
        <div className="measurement-field">
          <span className="mfr-op" aria-hidden="true">
            {view.operator}
          </span>
          <input
            className="mf-value"
            {...number.inputProps}
            aria-label={t.manufacturerName(title)}
            aria-invalid={number.invalid || undefined}
            aria-describedby={describedBy}
            placeholder="—"
            data-manufacturer-input={test.key}
          />
          {cycles ? (
            <button
              type="button"
              className="mf-unit is-control unit-cycle"
              aria-label={m.unitCycle(m.unitNames[shownUnit ?? ''] ?? shownUnit ?? '')}
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={() => chooseUnit(nextUnit(shownUnit))}
            >
              <span className="unit-text">{shownUnit}</span>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-cycle" />
              </svg>
            </button>
          ) : shownUnit === null ? null : (
            <span className="mf-unit" aria-label={m.unitNames[shownUnit] ?? shownUnit}>
              {shownUnit}
            </span>
          )}
        </div>
        {number.echo === null ? null : (
          <span className="mf-echo" id={echoId}>
            {number.echo}
          </span>
        )}
        {refusal === null ? null : (
          <span className="helper" data-tone="red" id={helperId} role="alert">
            {refusal}
          </span>
        )}
      </div>
      {note}
      {view.value === null ? null : (
        <TextButton
          onPress={() => {
            number.discard();
            void write(null)?.catch(() => undefined);
          }}
        >
          {t.manufacturerClear}
        </TextButton>
      )}
    </div>
  );
}
