import { formatDecimalGroupedPtBr, isInsulationFamily, nextUnit, numberEchoText, parseReadingPtBr, type CellAddress, type EvaluatedCell } from '@app/domain';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { OverflowMenu, TextButton } from '../../components/index.ts';
import { useNumberInput } from '../../components/number-input.tsx';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { DRAFT_SURFACE } from './ficha-fields.tsx';
import type { FichaApi } from './ficha-api.ts';
import { conclusionOp, testCellOp } from './ficha-ops.ts';

/*
 * The Measurement field (Story 5.5, UX-DR39; `key-equipment-sheet.html`, `60-ficha.html`):
 * one cell of a Measurement table. The value is typed the Brazilian way and committed on
 * blur or Enter (`useNumberInput`), with the "= 3.300 MΩ" echo while typing; a suffix
 * ("147G") or the unit slot's tap-cycle (MΩ -> GΩ -> TΩ, insulation only; the M · G · T
 * chips on phone) sets the unit. Everything it shows about the committed value -- the
 * amber out-of-criterion state and helper, the neutral outlier helper -- is the kernel's
 * evaluation (`evaluateSheetReadings`); red is never used for a reading and nothing here
 * blocks. "Não medido" is the cell's Overflow item.
 */

export type RunDirection = 'next' | 'previous' | 'right';

/** The data attribute the continuous run finds a cell's input by. */
export function cellKey(address: CellAddress): string {
  return `${address.testKey}:${address.row}:${address.col}`;
}

export function MeasurementField({
  api,
  cell,
  label,
  presentation,
  missing,
  onRun,
}: {
  api: FichaApi;
  cell: EvaluatedCell;
  /** The accessible name: row + column ("Fase A, 1 minuto"). */
  label: string;
  presentation: 'table' | 'card';
  /** Marked for "Concluir ficha"'s jump to the first missing field. */
  missing: boolean;
  /** Moves the focus along the continuous run; false when there is nowhere to go. */
  onRun: (from: CellAddress, direction: RunDirection) => boolean;
}) {
  const t = ui.measurementField;
  const echoId = useId();
  const helperId = useId();
  const { address } = cell;
  const insulation = isInsulationFamily(cell.units);
  // The unit chosen on the slot before a value holds it (the tap-cycle or a chip). Any
  // change of the stored value (a commit, a remote edit, an undo) drops it, so the slot
  // shows the stored unit again.
  const [unitChoice, setUnitChoice] = useState<string | null>(null);
  const storedKey = `${cell.state}:${cell.raw}:${cell.unit ?? ''}`;
  const seen = useRef(storedKey);
  if (seen.current !== storedKey) {
    seen.current = storedKey;
    if (unitChoice !== null) setUnitChoice(null);
  }
  const slotUnit = unitChoice ?? cell.unit;

  const write = (value: Parameters<typeof testCellOp>[6]) => {
    if (api.author === null) return undefined;
    return api.commit([testCellOp(api.author, api.relatorioId, api.blockId, address.testKey, address.row, address.col, value)]);
  };

  const number = useNumberInput({
    // "Não medido" keeps the input empty and prints its "-" as the placeholder, so a value
    // typed over it is not read as "-5".
    storedText: cell.state === 'empty' || cell.state === 'not_measured' ? '' : cell.displayText,
    storedRaw: cell.state === 'measured' ? cell.raw : null,
    parse: (text) => parseReadingPtBr(text, { units: cell.units, defaultUnit: slotUnit }),
    commit: (value) => {
      const result = write(value === null ? null : { raw: value.raw, unit: value.unit, state: 'measured' });
      if (value !== null && value.unit !== cell.unit) setUnitChoice(value.unit);
      return result;
    },
    echo: (value) => numberEchoText(value.raw, value.unit),
    format: (value) => formatDecimalGroupedPtBr(value.raw),
    draft: { surface: DRAFT_SURFACE, entityId: api.blockId, field: `test-${address.testKey}-${address.row}-${address.col}${presentation === 'card' ? '-card' : ''}` },
    onEnter: (event) => {
      if (onRun(address, 'next')) event.preventDefault();
    },
    onKey: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        number.commitNow();
        onRun(address, 'previous');
        return true;
      }
      if (event.key === 'Tab' && !event.shiftKey && onRun(address, 'right')) {
        event.preventDefault();
        return true;
      }
      return false;
    },
  });

  // While typing, a suffix already shows its unit in the slot ("147G" -> GΩ).
  const shownUnit = number.focused && number.parsed !== null && number.parsed !== 'invalid' ? number.parsed.unit : slotUnit;
  const out = cell.verdict === 'out';

  /** The unit slot changed: a value already there (stored or typed) is rewritten in the new unit at once. */
  const chooseUnit = (unit: string | null) => {
    setUnitChoice(unit);
    const parsed = number.parsed;
    if (parsed !== null && parsed !== 'invalid') void write({ raw: parsed.raw, unit, state: 'measured' });
  };

  const markRestricted = () => {
    void api
      .edit((blocks, by) => {
        const fresh = blocks.find((row) => row.id === api.blockId);
        if (fresh?.sheet.conclusion.restriction?.value === 'com_restricoes') return null;
        return [conclusionOp(by, api.relatorioId, api.blockId, 'restriction', 'com_restricoes')];
      })
      .then((batch) => {
        if (batch !== null) api.announce(copy.ficha.ensaios.restrictionMarked);
      })
      .catch(() => undefined);
  };

  const describedBy = [number.echo === null ? null : echoId, number.invalid || (!number.focused && (cell.helperText !== null || cell.outlier !== null)) ? helperId : null].filter(Boolean).join(' ') || undefined;
  const keepFocus = (event: { preventDefault: () => void }) => {
    if (number.focused) event.preventDefault();
  };

  return (
    <div className="ficha-cell" data-cell={cellKey(address)}>
      <div className="measurement-field" data-state={out ? 'out-of-limit' : undefined}>
        <input
          className="mf-value"
          {...number.inputProps}
          aria-label={label}
          aria-invalid={number.invalid || undefined}
          aria-describedby={describedBy}
          placeholder={cell.state === 'not_measured' ? cell.displayText : cell.fallback?.text}
          data-cell-input={cellKey(address)}
          data-missing-field={missing ? '' : undefined}
        />
        {insulation ? (
          <button
            type="button"
            className="mf-unit is-control unit-cycle"
            aria-label={t.unitCycle(t.unitNames[shownUnit ?? ''] ?? shownUnit ?? '')}
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
          <span className="mf-unit" aria-label={t.unitNames[shownUnit] ?? shownUnit}>
            {shownUnit}
          </span>
        )}
        <OverflowMenu
          name={label}
          items={[{ id: 'not-measured', label: t.notMeasured, onAction: () => void write({ raw: '', unit: slotUnit, state: 'not_measured' }) }]}
        />
      </div>
      {number.echo === null ? null : (
        <span className="mf-echo" id={echoId}>
          {number.echo}
        </span>
      )}
      {number.focused && insulation ? (
        <div className="unit-suffix-row" role="group" aria-label={t.unitChips}>
          {cell.units.map((unit) => (
            <button
              key={unit}
              type="button"
              className="chip"
              aria-pressed={unit === shownUnit}
              aria-label={t.unitNames[unit] ?? unit}
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={() => chooseUnit(unit)}
            >
              {unit.charAt(0)}
            </button>
          ))}
        </div>
      ) : null}
      {number.invalid ? (
        <span className="helper" id={helperId}>
          {t.invalid}
        </span>
      ) : null}
      {!number.focused && !number.invalid && cell.helperText !== null ? (
        <div className="mf-helper" role="status" id={helperId}>
          {cell.helperText}
          <TextButton onPress={markRestricted}>{t.markRestricted}</TextButton>
        </div>
      ) : null}
      {!number.focused && !number.invalid && cell.outlier !== null ? (
        <div className="outlier-helper" role="status" id={cell.helperText === null ? helperId : undefined}>
          {cell.outlier.text}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A Measurement cell of a sheet marked not tested (Story 5.9, UX-DR49): the stored reading
 * as text with `aria-readonly`, the same box `ReadOnlyField` draws, and no input, unit
 * cycle, "Não medido" Overflow or "Marcar Com restrições". It carries no `data-cell-input`,
 * so the continuous run never lands on it.
 */
export function ReadOnlyMeasurementField({ cell, label }: { cell: EvaluatedCell; label: string }) {
  const t = ui.measurementField;
  const empty = cell.state === 'empty';
  const text = empty ? (cell.fallback?.text ?? cell.displayText) : cell.displayText;
  return (
    <div className="ficha-cell" data-cell={cellKey(cell.address)}>
      <div className="measurement-field" role="textbox" aria-readonly="true" aria-label={label} data-state={cell.verdict === 'out' ? 'out-of-limit' : undefined}>
        <span className={empty ? 'mf-value is-empty' : 'mf-value'}>{text}</span>
        {cell.unit === null ? null : (
          <span className="mf-unit" aria-label={t.unitNames[cell.unit] ?? cell.unit}>
            {cell.unit}
          </span>
        )}
      </div>
      {cell.helperText === null ? null : <div className="mf-helper">{cell.helperText}</div>}
      {cell.outlier === null ? null : <div className="outlier-helper">{cell.outlier.text}</div>}
    </div>
  );
}
