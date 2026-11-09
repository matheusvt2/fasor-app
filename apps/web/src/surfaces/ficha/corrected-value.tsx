import type { EvaluatedCell, TestEvaluation } from '@app/domain';
import { ui } from '../../copy/ui.ts';

/*
 * Batch e23v (Story 23.5, seed v13; `60-ficha.html` #/ficha/TR1): what a test corrected to 20 °C draws beside its
 * readings, every word the kernel's (`TestEvaluation.temperature`, `EvaluatedCell.corrected`). Its own file, so the
 * Ensaios step (`ensaios-section.tsx`, which other batches edit) only places it.
 */

/** The `.v13-line` over the test's first table: "Temperatura **40 °C**" and where it came from (or what is missing). */
export function TemperatureLine({ test }: { test: Pick<TestEvaluation, 'temperature'> }) {
  const view = test.temperature;
  if (view === undefined) return null;
  return (
    <p className="v13-line" data-temperature-line={view.state}>
      <span>
        {view.line.label} <b>{view.line.value}</b>
      </span>
      <span>{view.line.note}</span>
    </p>
  );
}

/**
 * A capture's value corrected to 20 °C, "—" without one. In its own `td.cell-calc` column with the "calc." mark
 * (`.ficha-iso-v13 td.cell-calc`); `stacked`, the phone card's line "A 20 °C: 8 GΩ calc." under the cell, shown below
 * 768 px where the column is hidden (`app.css`). The unit stays with the value: a table's rows may hold MΩ and GΩ.
 */
export function CorrectedValue({ test, cell, stacked = false }: { test: TestEvaluation; cell: EvaluatedCell; stacked?: boolean }) {
  const text = cell.corrected?.text ?? null;
  const mark = (
    <>
      <span className="calc-mark" aria-hidden="true">
        {ui.measurementField.calcMark}
      </span>
      <span className="visually-hidden">{ui.measurementField.calcSpoken}</span>
    </>
  );
  if (stacked) {
    if (text === null || test.temperature === undefined) return null;
    return (
      <p className="card-dims corrected-stacked" data-corrected-line={cell.address.row}>
        {test.temperature.cellLead} <b className="t-value">{text}</b>
        {mark}
      </p>
    );
  }
  return (
    <td className="cell-calc" data-corrected-cell={cell.address.row}>
      {text ?? '—'}
      {text === null ? null : mark}
    </td>
  );
}
