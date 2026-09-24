import {
  evaluateSheetReadings,
  evaluatedCells,
  runTarget,
  type BlockDefinition,
  type BlockRow,
  type CellAddress,
  type EvaluatedCell,
  type EvaluatedRow,
  type EvaluatedTable,
  type InstrumentRow,
  type RelatorioSnapshot,
  type TestEvaluation,
} from '@app/domain';
import { useId, useMemo, useRef } from 'react';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import type { FichaApi } from './ficha-api.ts';
import { InstrumentPicker } from './instrument-picker.tsx';
import { cellKey, MeasurementField, type RunDirection } from './measurement-field.tsx';

/*
 * The "Ensaios" step (Stories 5.5-5.7, FR-27, UX-DR39/40/42; `60-ficha.html`): one section
 * per enabled test, stacked, each with its Instrument picker and its Measurement tables --
 * a real table at every width (connection cells as row headers' neighbours, only the
 * columns the sheet measures; `print` columns are not drawn), the criterion value in the
 * title row with its source behind a chevron, the calculated cells read-only with a "calc."
 * mark. Only the ratio (TTR) tables stack into cards below 768 px (`ficha.css`). The whole
 * step is one continuous Enter run (`runTarget`): down the column, then the first empty
 * cell of what follows, and "Concluir ficha"/"Próxima ficha" after the last. Everything
 * shown is the kernel's one evaluation (`evaluateSheetReadings`). "Ler visor" and
 * Dictation are later epics' and are not drawn.
 */
export function EnsaiosSection({
  api,
  snapshot,
  block,
  definition,
  instruments,
  className,
  onFocus,
  primaryId,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  instruments: readonly InstrumentRow[];
  className: string;
  onFocus: () => void;
  /** The Sticky action bar's primary button, where the run ends. */
  primaryId: string;
}) {
  const evaluations = useMemo(() => evaluateSheetReadings(block, definition), [block, definition]);
  const host = useRef<HTMLDivElement | null>(null);
  const firstMissing = useMemo(() => evaluatedCells(evaluations).find((cell) => cell.missing)?.address ?? null, [evaluations]);

  /** Focuses the visible input of a cell (the table or, for a TTR on phone, its card). */
  const focusCell = (address: CellAddress): boolean => {
    const inputs = host.current?.querySelectorAll<HTMLInputElement>(`[data-cell-input="${cellKey(address)}"]`) ?? [];
    const visible = [...inputs].find((input) => input.getClientRects().length > 0);
    if (visible === undefined) return false;
    visible.focus();
    visible.select();
    return true;
  };

  const onRun = (from: CellAddress, direction: RunDirection): boolean => {
    const target = runTarget(evaluations, from, direction);
    if (target === null) return false;
    if (target === 'end') {
      const primary = document.getElementById(primaryId);
      if (primary === null) return false;
      primary.focus();
      return true;
    }
    return focusCell(target);
  };

  return (
    <div id="ficha-step-ensaios" ref={host} className={className} data-step="ensaios" tabIndex={-1} onFocus={onFocus}>
      {evaluations.map((test) => (
        <TestSection
          key={test.testKey}
          api={api}
          block={block}
          blocks={snapshot.blocks}
          test={test}
          instruments={instruments}
          serviceEnd={snapshot.relatorio.setup.service_end}
          firstMissing={firstMissing}
          onRun={onRun}
        />
      ))}
    </div>
  );
}

function sameAddress(a: CellAddress | null, b: CellAddress): boolean {
  return a !== null && a.testKey === b.testKey && a.row === b.row && a.col === b.col;
}

function TestSection({
  api,
  block,
  blocks,
  test,
  instruments,
  serviceEnd,
  firstMissing,
  onRun,
}: {
  api: FichaApi;
  block: BlockRow;
  blocks: readonly BlockRow[];
  test: TestEvaluation;
  instruments: readonly InstrumentRow[];
  serviceEnd: string | null;
  firstMissing: CellAddress | null;
  onRun: (from: CellAddress, direction: RunDirection) => boolean;
}) {
  const headingId = useId();
  const tables = test.tables.map((table) => (
    <MeasurementTable key={table.key} api={api} test={test} table={table} firstMissing={firstMissing} onRun={onRun} />
  ));
  return (
    <section className="section" aria-labelledby={headingId} data-test-key={test.testKey}>
      <div className="section-head">
        <h2 id={headingId}>{test.title}</h2>
      </div>
      <InstrumentPicker api={api} block={block} blocks={blocks} testKey={test.testKey} instruments={instruments} serviceEnd={serviceEnd} />
      {tables.length > 1 ? <div className="tests-two">{tables}</div> : tables}
    </section>
  );
}

function MeasurementTable({
  api,
  test,
  table,
  firstMissing,
  onRun,
}: {
  api: FichaApi;
  test: TestEvaluation;
  table: EvaluatedTable;
  firstMissing: CellAddress | null;
  onRun: (from: CellAddress, direction: RunDirection) => boolean;
}) {
  const t = copy.ficha.ensaios;
  const titleId = useId();
  const cellOf = (row: EvaluatedRow, col: number): EvaluatedCell | undefined => row.cells.find((cell) => cell.address.col === col);
  const field = (row: EvaluatedRow, cell: EvaluatedCell, presentation: 'table' | 'card') => (
    <MeasurementField
      api={api}
      cell={cell}
      label={t.cellLabel(row.label, cell.column)}
      presentation={presentation}
      missing={sameAddress(firstMissing, cell.address)}
      onRun={onRun}
    />
  );
  const derivedText = (row: EvaluatedRow, kind: 'calculated' | 'condicao' | null) => (kind === 'condicao' ? (row.condicao ?? '—') : (row.calculated?.text ?? '—'));

  return (
    <div className="ficha-mt" data-table-key={table.key}>
      <div className="mt-title-row">
        {table.title === null ? null : (
          <span className="mt-title" id={titleId}>
            {table.title}
          </span>
        )}
        <span className="mt-criterion">{t.criterion(test.criterionText)}</span>
        <details className="ficha-details mt-source">
          <summary>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-chev-down" />
            </svg>
            {t.sourceSummary}
          </summary>
          <p>{test.sourceName}</p>
        </details>
      </div>
      <table className={table.ratio ? 'measurement-table ficha-ttr is-wide' : 'measurement-table'} aria-labelledby={table.title === null ? undefined : titleId} aria-label={table.title === null ? test.title : undefined}>
        <thead>
          <tr>
            {table.connectionHeaders.map((header, i) => (
              <th key={`c${i}`} scope="col">
                {header}
              </th>
            ))}
            {table.columns.map((column) => (
              <th key={column.col} scope="col" className={column.role === 'input' ? undefined : 'col-value'}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.row}>
              {row.connection.map((text, i) => (
                <td key={`c${i}`} className={i === 0 ? 'cell-point' : 'cell-dim'}>
                  {text === '' ? '—' : text}
                </td>
              ))}
              {table.columns.map((column) => {
                if (column.role === 'derived') {
                  return (
                    <td key={column.col} className="cell-calc">
                      {derivedText(row, column.derivedKind)}
                      <span className="calc-mark" aria-hidden="true">
                        {ui.measurementField.calcMark}
                      </span>
                      <span className="visually-hidden">{ui.measurementField.calcSpoken}</span>
                    </td>
                  );
                }
                const cell = cellOf(row, column.col);
                return (
                  <td key={column.col} className="cell-value">
                    {cell === undefined ? null : field(row, cell, 'table')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {table.ratio ? (
        <div className="ficha-cards">
          <div className="measurement-cards">
            {table.rows.map((row) => (
              <div key={row.row} className="measurement-card">
                <p className="card-point">{row.label}</p>
                {row.cells.map((cell) => (
                  <div key={cell.address.col} className="field">
                    <span className="field-label" aria-hidden="true">
                      {cell.role === 'capture' ? t.cardMeasured(cell.column) : cell.column}
                    </span>
                    {field(row, cell, 'card')}
                  </div>
                ))}
                {table.columns
                  .filter((column) => column.role === 'derived')
                  .map((column) => (
                    <p key={column.col} className="card-dims">
                      {column.derivedKind === 'condicao' ? t.cardCondition(derivedText(row, column.derivedKind)) : `${column.header} ${derivedText(row, column.derivedKind)}`}
                      <span className="calc-mark" aria-hidden="true">
                        {ui.measurementField.calcMark}
                      </span>
                      <span className="visually-hidden">{ui.measurementField.calcSpoken}</span>
                    </p>
                  ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
