import {
  evaluateSheetReadings,
  evaluatedCells,
  runEnterKeyHint,
  runTarget,
  screenLabel,
  tableDictationLabel,
  type BlockDefinition,
  type BlockRow,
  type CellAddress,
  type EntityState,
  type EvaluatedCell,
  type EvaluatedRow,
  type EvaluatedTable,
  type InstrumentRow,
  type RelatorioSnapshot,
  type TestEvaluation,
} from '@app/domain';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import type { FichaApi } from './ficha-api.ts';
import { InstrumentPicker } from './instrument-picker.tsx';
import { cellKey, DictatedMeasurementField, ReadOnlyMeasurementField, type RunDirection } from './measurement-field.tsx';
import { ConfirmTableButton, ReadDisplayButton, ReadingCell, useDisplaySuggestions, type DisplayModel } from './read-display.tsx';
import { useTableDictation } from './sheet-observation-dictation.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';
import { DictationButton } from '../../speech/dictation.tsx';

/*
 * The "Ensaios" step (Stories 5.5-5.7, FR-27, UX-DR39/40/42; `60-ficha.html`): one section
 * per enabled test, stacked, each with its Instrument picker and its Measurement tables --
 * a real table at every width (connection cells as row headers' neighbours, only the
 * columns the sheet measures; `print` columns are not drawn), the criterion value in the
 * title row with its source behind a chevron, the calculated cells read-only with a "calc."
 * mark. Only the ratio (TTR) tables stack into cards below 768 px (`ficha.css`). The whole
 * step is one continuous Enter run (`runTarget`): down the column, then the first empty
 * cell of what follows, and "Concluir ficha"/"Próxima ficha" after the last. Everything
 * shown is the kernel's one evaluation (`evaluateSheetReadings`). Story 9.1: each table's
 * title row carries "Ler visor" and, while it holds suggested readings, "Confirmar todos"
 * (`.mt-actions`); each cell shows its display reading (`read-display.tsx`). Story 9.4: the
 * same `.mt-actions` ends with the table's Dictation button; the kernel reads the utterance
 * (`parseTableUtterance`) into a Suggestion on its target cell, never over a filled cell, and
 * speech it cannot read goes to the sheet observation as a suggestion, announced. On a sheet
 * marked not tested (Story 5.9)
 * every section is `.is-readonly` with the reason line: the cells show their stored
 * readings as read-only text and the Instrument picker its stored instrument, unchangeable.
 */
export function EnsaiosSection({
  api,
  state,
  snapshot,
  block,
  definition,
  instruments,
  className,
  onFocus,
  primaryId,
  targetFor,
  onCaptionPhoto,
}: {
  api: FichaApi;
  /** Story 9.1: the device's rows, for the display suggestions. */
  state: EntityState;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  instruments: readonly InstrumentRow[];
  className: string;
  onFocus: () => void;
  /** The Sticky action bar's primary button, where the run ends. */
  primaryId: string;
  /** Story 9.1: the capture target of a "Ler visor" shot of one test. */
  targetFor: (testKey: string) => CaptureTarget;
  onCaptionPhoto?: Parameters<typeof useDisplaySuggestions>[0]['onCaptionPhoto'];
}) {
  const evaluations = useMemo(() => evaluateSheetReadings(block, definition), [block, definition]);
  const display = useDisplaySuggestions({ api, state, snapshot, block, onCaptionPhoto });
  const host = useRef<HTMLDivElement | null>(null);
  const firstMissing = useMemo(() => evaluatedCells(evaluations).find((cell) => cell.missing)?.address ?? null, [evaluations]);

  useRunEnterKeyHints(host, evaluations);

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
          snapshot={snapshot}
          block={block}
          definition={definition}
          test={test}
          instruments={instruments}
          firstMissing={firstMissing}
          onRun={onRun}
          display={display}
          targetFor={targetFor}
        />
      ))}
      {display.viewer}
    </div>
  );
}

/**
 * Story 13.4 (INP-2): every input of the continuous Enter run labels the mobile keyboard's
 * Enter key with the kernel's `runEnterKeyHint` ("next", or "done" where Enter hands the focus
 * to the primary). The hint is set on the DOM here, over every `[data-cell-input]` under the
 * section, rather than as a prop of each cell component: the run's inputs are drawn by three
 * components (`MeasurementField`, `DictatedMeasurementField` and the suggested cell of
 * `read-display.tsx`, owned by another batch), and this section is the one place that knows
 * the whole run. A layout effect sets it after every render of the section (cells filling
 * move the "done"), and a MutationObserver covers an input a child mounts on its own (a cell
 * swapping to its suggested or dictated form). Only the attribute changes, so the observer,
 * watching the child list, never feeds itself.
 */
function useRunEnterKeyHints(host: { current: HTMLDivElement | null }, evaluations: readonly TestEvaluation[]): void {
  const hints = useMemo(() => new Map(evaluatedCells(evaluations).map((cell) => [cellKey(cell.address), runEnterKeyHint(evaluations, cell.address)])), [evaluations]);
  const latest = useRef(hints);
  latest.current = hints;
  useLayoutEffect(() => {
    if (host.current !== null) applyRunEnterKeyHints(host.current, hints);
  });
  useEffect(() => {
    const root = host.current;
    if (root === null) return;
    const observer = new MutationObserver(() => applyRunEnterKeyHints(root, latest.current));
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [host]);
}

function applyRunEnterKeyHints(root: HTMLElement, hints: ReadonlyMap<string, 'next' | 'done'>): void {
  for (const input of root.querySelectorAll<HTMLInputElement>('input[data-cell-input]')) {
    const hint = hints.get(input.dataset.cellInput ?? '') ?? 'done';
    if (input.getAttribute('enterkeyhint') !== hint) input.setAttribute('enterkeyhint', hint);
  }
}

function sameAddress(a: CellAddress | null, b: CellAddress): boolean {
  return a !== null && a.testKey === b.testKey && a.row === b.row && a.col === b.col;
}

function TestSection({
  api,
  snapshot,
  block,
  definition,
  test,
  instruments,
  firstMissing,
  onRun,
  display,
  targetFor,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  test: TestEvaluation;
  instruments: readonly InstrumentRow[];
  firstMissing: CellAddress | null;
  onRun: (from: CellAddress, direction: RunDirection) => boolean;
  display: DisplayModel;
  targetFor: (testKey: string) => CaptureTarget;
}) {
  const headingId = useId();
  const readOnly = useSheetReadOnly();
  const blocks = snapshot.blocks;
  const serviceEnd = snapshot.relatorio.setup.service_end;
  const tables = test.tables.map((table) => (
    <MeasurementTable
      key={table.key}
      api={api}
      test={test}
      table={table}
      firstMissing={firstMissing}
      onRun={onRun}
      readOnly={readOnly}
      display={display}
      actions={(dictated) =>
        readOnly ? null : (
          <>
            <ReadDisplayButton api={api} snapshot={snapshot} block={block} definition={definition} testKey={test.testKey} tableKey={table.key} targetFor={targetFor} />
            <ConfirmTableButton model={display} testKey={test.testKey} tableKey={table.key} exclude={dictated === null ? [] : [dictated]} />
          </>
        )
      }
    />
  ));
  return (
    <section className={readOnly ? 'section is-readonly' : 'section'} aria-labelledby={headingId} data-test-key={test.testKey}>
      <div className="section-head">
        <h2 id={headingId}>{screenLabel(test.title)}</h2>
        {readOnly ? <span className="btn-reason">{copy.ficha.checklist.readOnlyReason}</span> : null}
      </div>
      <InstrumentPicker
        api={api}
        block={block}
        blocks={blocks}
        testKey={test.testKey}
        instruments={instruments}
        serviceEnd={serviceEnd}
        setupInstrumentIds={snapshot.relatorio.setup.instrument_ids}
        readOnly={readOnly}
      />
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
  readOnly,
  display,
  actions,
}: {
  api: FichaApi;
  test: TestEvaluation;
  table: EvaluatedTable;
  firstMissing: CellAddress | null;
  onRun: (from: CellAddress, direction: RunDirection) => boolean;
  readOnly: boolean;
  display: DisplayModel;
  /**
   * Story 9.1: the title row's `.mt-actions` ("Ler visor", "Confirmar todos"); null on a
   * read-only sheet. Story 9.4 adds the Dictation button after them. E9-Q1: drawn from the cell
   * that shows this table's dictated reading, which "Confirmar todos" leaves out.
   */
  actions: (dictated: CellAddress | null) => ReactNode;
}) {
  const t = copy.ficha.ensaios;
  const titleId = useId();
  // Story 9.4: the reading dictated on this table, held until its cell's "Confirmar" (never a row).
  const { dictated, setDictated, onDictated } = useTableDictation(table, api.announce);
  // The cell the dictated reading is drawn on (held only while that cell is empty).
  const dictatedCell = dictated?.address ?? null;
  const cellOf = (row: EvaluatedRow, col: number): EvaluatedCell | undefined => row.cells.find((cell) => cell.address.col === col);
  const field = (row: EvaluatedRow, cell: EvaluatedCell, presentation: 'table' | 'card') =>
    readOnly ? (
      <ReadOnlyMeasurementField cell={cell} label={t.cellLabel(screenLabel(row.label), screenLabel(cell.column))} />
    ) : sameAddress(dictatedCell, cell.address) && dictated !== null ? (
      <DictatedMeasurementField
        api={api}
        cell={cell}
        label={t.cellLabel(screenLabel(row.label), screenLabel(cell.column))}
        reading={dictated}
        onDone={() => setDictated(null)}
        onRun={onRun}
      />
    ) : (
      <ReadingCell
        model={display}
        api={api}
        cell={cell}
        label={t.cellLabel(screenLabel(row.label), screenLabel(cell.column))}
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
            {screenLabel(table.title)}
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
        {readOnly ? null : (
          <div className="mt-actions">
            {actions(dictatedCell)}
            <DictationButton label={tableDictationLabel(table)} onStart={() => setDictated(null)} onResult={onDictated} />
          </div>
        )}
      </div>
      <table className={table.ratio ? 'measurement-table ficha-ttr is-wide' : 'measurement-table'} aria-labelledby={table.title === null ? undefined : titleId} aria-label={table.title === null ? screenLabel(test.title) : undefined}>
        <thead>
          <tr>
            {table.connectionHeaders.map((header, i) => (
              <th key={`c${i}`} scope="col">
                {screenLabel(header)}
              </th>
            ))}
            {table.columns.map((column) => (
              <th key={column.col} scope="col" className={column.role === 'input' ? undefined : 'col-value'}>
                {screenLabel(column.header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.row}>
              {row.connection.map((text, i) => (
                <td key={`c${i}`} className={i === 0 ? 'cell-point' : 'cell-dim'}>
                  {text === '' ? '—' : screenLabel(text)}
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
                <p className="card-point">{screenLabel(row.label)}</p>
                {row.cells.map((cell) => (
                  <div key={cell.address.col} className="field">
                    <span className="field-label" aria-hidden="true">
                      {cell.role === 'capture' ? t.cardMeasured(screenLabel(cell.column)) : screenLabel(cell.column)}
                    </span>
                    {field(row, cell, 'card')}
                  </div>
                ))}
                {table.columns
                  .filter((column) => column.role === 'derived')
                  .map((column) => (
                    <p key={column.col} className="card-dims">
                      {column.derivedKind === 'condicao' ? t.cardCondition(derivedText(row, column.derivedKind)) : `${screenLabel(column.header)} ${derivedText(row, column.derivedKind)}`}
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
