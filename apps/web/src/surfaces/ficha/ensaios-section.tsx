import {
  evaluateSheetMeasurements,
  evaluatedCells,
  instrumentRangeFor,
  isTapTable,
  manufacturerApplies,
  measurementCells,
  previousHelpers,
  readingAddressKey,
  readingSlotsOf,
  measurementRunEnterKeyHint,
  measurementCellName,
  readingRowLabel,
  measurementRunTarget,
  runEnterKeyHint,
  snapshotDefinitionContext,
  runTarget,
  screenLabel,
  tableDictationLabel,
  rowVoltageCell,
  ratioRowCondicaoText,
  readingLabelText,
  sheetTestSections,
  tapCellTyped,
  tapInputText,
  tapMarkText,
  tapRowOptional,
  tapTableLine,
  testVoltageCheck,
  unitTapNeedsEdit,
  type BlockDefinition,
  type BlockRow,
  type CellAddress,
  type EntityState,
  type EvaluatedCell,
  type EvaluatedRow,
  type EvaluatedTable,
  type InstrumentRow,
  type MeasurementAddress,
  type MeasurementTestEvaluation,
  type RelatorioSnapshot,
  type TestApplicability,
  type TestEvaluation,
  type VisitContext,
} from '@app/domain';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { WholeWords } from '../../components/whole-words.tsx';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { APPLIED_SECTION_CLASS, AppliedBand, NotApplicableTest } from './applicability-band.tsx';
import type { FichaApi } from './ficha-api.ts';
import { focusRunEnd } from './ficha-fields.tsx';
import { testCellOp } from './ficha-ops.ts';
import { CorrectedValue, TemperatureLine } from './corrected-value.tsx';
import { InstrumentPicker } from './instrument-picker.tsx';
import { ManufacturerValue } from './manufacturer-value.tsx';
import { cellKey, DictatedMeasurementField, ReadOnlyMeasurementField, SheetCellExtrasProvider, UnitTapGuardProvider, type FieldAddress, type RunDirection, type SheetCellExtras } from './measurement-field.tsx';
import { MeasurementTests } from './measurement-test-section.tsx';
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
 * Story 14.5: after the seeded tests come the measurement tests of a library type
 * (`measurement-test-section.tsx`, the kernel's `evaluateSheetMeasurements`), in the same
 * step: their number cells run on Enter by the kernel's `measurementRunTarget` (down the
 * column, then the first empty cell of what follows, then the primary).
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
  visit,
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
  /** Batch e23v (Stories 23.5 and 23.6): the sheet's visit context (`visitContextOf`, from `useFichaData`), shared with the conclusion. */
  visit: VisitContext;
}) {
  // Story 23.9: every enabled test in the definition's order, an NA one with its band only; the
  // evaluations are `evaluateSheetReadings`'s (the tests in force), which the run and the cells read.
  // Batch e23v: judged under the sheet's visit context (a v13 test's correction and restriction rules read it).
  const sections = useMemo(() => sheetTestSections(block, definition, visit), [block, definition, visit]);
  const evaluations = useMemo(() => sections.flatMap((section) => (section.evaluation === null ? [] : [section.evaluation])), [sections]);
  // Story 14.5: the measurement tests of a library type; none on the eight FO.SERV-03 types.
  const measurements = useMemo(() => evaluateSheetMeasurements(block, definition), [block, definition]);
  const display = useDisplaySuggestions({ api, state, snapshot, block, onCaptionPhoto });
  const host = useRef<HTMLDivElement | null>(null);
  const firstMissing = useMemo(() => evaluatedCells(evaluations).find((cell) => cell.missing)?.address ?? null, [evaluations]);

  useRunEnterKeyHints(host, evaluations, measurements);

  /** Focuses the visible input of a cell (the table or, for a table stacked on phone, its card). */
  const focusCell = (address: FieldAddress): boolean => {
    const inputs = host.current?.querySelectorAll<HTMLInputElement>(`[data-cell-input="${cellKey(address)}"]`) ?? [];
    const visible = [...inputs].find((input) => input.getClientRects().length > 0);
    if (visible === undefined) return false;
    visible.focus();
    visible.select();
    return true;
  };

  /**
   * Review fixes 2026-10-08 (r8lay-layout-1): Enter leaving a ratio table's last capture cell
   * brings the table's end into its own scroller, so the rows' Condição (the verdict, the last
   * column) is in view where the table is wider than its box (657 px boxes).
   */
  const revealRatioEnd = (from: CellAddress) => {
    const test = evaluations.find((t) => t.testKey === from.testKey);
    const table = test?.tables.find((t) => t.rows.some((row) => row.cells.some((cell) => sameAddress(cell.address, from))));
    if (table === undefined || !table.ratio) return;
    const last = table.rows.at(-1)?.cells.filter((cell) => cell.role === 'capture').at(-1);
    if (last === undefined || !sameAddress(last.address, from)) return;
    const scroller = host.current?.querySelector<HTMLElement>(`.ficha-mt[data-table-key="${table.key}"] > .mt-scroll`);
    if (scroller !== null && scroller !== undefined) scroller.scrollLeft = scroller.scrollWidth;
  };

  /** e23f (R8LAY, Matheus 2026-11-08): both runs end on the primary through here, without scrolling the page (`focusRunEnd`). */
  const endRun = (): boolean => {
    const primary = document.getElementById(primaryId);
    if (primary === null) return false;
    focusRunEnd(primary);
    return true;
  };

  const onRun = (from: CellAddress, direction: RunDirection): boolean => {
    const target = runTarget(evaluations, from, direction);
    if (target === null) return false;
    const moved = target === 'end' ? endRun() : focusCell(target);
    if (moved && direction === 'next') revealRatioEnd(from);
    return moved;
  };

  /** Story 14.5: the same run over the measurement tests, by the kernel's `measurementRunTarget`. */
  const onMeasurementRun = (from: MeasurementAddress, direction: RunDirection): boolean => {
    const target = measurementRunTarget(measurements, from, direction);
    if (target === null) return false;
    return target === 'end' ? endRun() : focusCell(target);
  };

  // DB-2: the kernel says which unit taps only put a cell into editing (a concluded sheet's measured cells).
  const unitTapGuard = useCallback((cell: Pick<EvaluatedCell, 'state'>) => unitTapNeedsEdit(block, cell), [block]);

  // Story 22.10: the limit "OL" takes, from the instrument picked on each test (read live from the
  // registry); Story 22.12: the previous visit's "Anterior: …" line of each cell, from the sheet's
  // equipment row (`nameplate-section.tsx` finds it the same way). Both are the kernel's.
  // The context value changes only when a limit or a previous value does, never on every cell edit.
  const own = block.equipment_id === null ? undefined : snapshot.equipment.find((row) => row.id === block.equipment_id);
  const lastResults = own?.last_results ?? null;
  const blockType = block.block_type;
  // Story 23.8 (seed v13): a tap row's previous value is found by its tap, so the helpers read the
  // block's rows; `slots` names them and changes only with them, never on a cell edit.
  const sheet = block.sheet;
  const slots = readingSlotsOf(definition, block).map(readingAddressKey).join(' ');
  const previous = useMemo(
    () => previousHelpers({ last_results: lastResults }, { block_type: blockType, sheet }, definition, snapshot.relatorio.id),
    // `sheet` is read for its rows alone, which `slots` follows.
    [lastResults, blockType, definition, snapshot.relatorio.id, slots],
  );
  // Story 14.8: a company sheet's tests resolve through the snapshot's type versions.
  const definitions = snapshotDefinitionContext(snapshot);
  const testKeys = [...evaluations.map((test) => test.testKey as string), ...measurements.map((test) => test.testKey as string)];
  const rangesKey = JSON.stringify(Object.fromEntries(testKeys.map((testKey) => [testKey, instrumentRangeFor(block, instruments, testKey, definitions)])));
  const extras = useMemo<SheetCellExtras>(() => {
    const ranges = JSON.parse(rangesKey) as Record<string, ReturnType<typeof instrumentRangeFor>>;
    return {
      rangeOf: (testKey) => ranges[testKey] ?? null,
      previousOf: (address) => previous.get(readingAddressKey(address)) ?? null,
    };
  }, [rangesKey, previous]);

  return (
    <div id="ficha-step-ensaios" ref={host} className={className} data-step="ensaios" tabIndex={-1} onFocus={onFocus}>
      <SheetCellExtrasProvider value={extras}>
        <UnitTapGuardProvider value={unitTapGuard}>
          {sections.map((section) =>
            section.evaluation === null ? (
              <NotApplicableTest key={section.testKey} api={api} testKey={section.testKey} title={screenLabel(section.title)} applicability={section.applicability} />
            ) : (
              <TestSection
                key={section.testKey}
                api={api}
                snapshot={snapshot}
                block={block}
                definition={definition}
                test={section.evaluation}
                applicability={section.applicability}
                instruments={instruments}
                firstMissing={firstMissing}
                onRun={onRun}
                display={display}
                targetFor={targetFor}
              />
            ),
          )}
          <MeasurementTests api={api} snapshot={snapshot} block={block} evaluations={measurements} instruments={instruments} onRun={onMeasurementRun} />
        </UnitTapGuardProvider>
      </SheetCellExtrasProvider>
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
function useRunEnterKeyHints(host: { current: HTMLDivElement | null }, evaluations: readonly TestEvaluation[], measurements: readonly MeasurementTestEvaluation[]): void {
  const hints = useMemo(
    () =>
      new Map([
        ...evaluatedCells(evaluations).map((cell) => [cellKey(cell.address), runEnterKeyHint(evaluations, cell.address)] as const),
        // Story 14.5: the measurement tests' number cells, by the kernel's own run.
        ...measurementCells(measurements)
          .filter((cell) => cell.kind === 'number')
          .map((cell) => [cellKey(cell.address), measurementRunEnterKeyHint(measurements, cell.address)] as const),
      ]),
    [evaluations, measurements],
  );
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
  applicability,
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
  /** Story 23.9: the test's applicability; applied by hand, the applied band sits over the test. */
  applicability: TestApplicability;
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
  // Story 14.14 (seed v7): the instrument's TENSÃO ENSAIO against the band's, derived by the kernel.
  const testDef = definition.tests.find((candidate) => candidate.key === test.testKey);
  const voltage = testDef === undefined ? null : testVoltageCheck({ block, files: snapshot.files }, testDef);
  const voltageNotice =
    voltage === null || voltage.text === null ? null : (
      <p className="helper" data-tone={voltage.state === 'mismatch' ? 'amber' : undefined} role="status" data-test-voltage={voltage.state}>
        {voltage.text}
      </p>
    );
  // Batch e23a (Story 23.3): the manufacturer's value under the first table's criterion row, on every seed version.
  const manufacturer =
    testDef === undefined || !manufacturerApplies(testDef) ? null : <ManufacturerValue api={api} block={block} definition={definition} test={testDef} title={screenLabel(test.title)} readOnly={readOnly} />;
  const tables = test.tables.map((table, index) => (
    <MeasurementTable
      key={table.key}
      api={api}
      test={test}
      table={table}
      firstMissing={firstMissing}
      onRun={onRun}
      readOnly={readOnly}
      display={display}
      notice={
        index === 0 ? (
          <>
            {voltageNotice}
            {manufacturer}
            {/* Batch e23v (Story 23.5, seed v13): the temperature the test is corrected at, over its first table. */}
            <TemperatureLine test={test} />
          </>
        ) : null
      }
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
  const applied = applicability.state === 'applied';
  const sectionClass = ['section', readOnly ? 'is-readonly' : null, applied ? APPLIED_SECTION_CLASS : null].filter(Boolean).join(' ');
  const body = (
    <>
      <InstrumentPicker
        api={api}
        block={block}
        blocks={blocks}
        equipmentTypes={snapshot.equipment_types}
        testKey={test.testKey}
        instruments={instruments}
        serviceEnd={serviceEnd}
        setupInstrumentIds={snapshot.relatorio.setup.instrument_ids}
        readOnly={readOnly}
      />
      {tables.length > 1 ? <div className="tests-two">{tables}</div> : tables}
      {/* Batch e23a (Story 23.4, seed v13): the kernel's instrument-limit note under the test's tables, as the document prints it. */}
      {test.limitNote === undefined || test.limitNote === null ? null : (
        <p className="helper" data-limit-note="">
          {test.limitNote}
        </p>
      )}
      {/* Story 22.9 (seed v12): the kernel's helper while the class the ratio is judged by is empty; never printed. */}
      {test.classHelper === null ? null : (
        <p className="helper" data-class-helper="">
          {test.classHelper}
        </p>
      )}
    </>
  );
  return (
    <section className={sectionClass} aria-labelledby={headingId} data-test-key={test.testKey} data-applicability={applied ? 'applied' : undefined}>
      <div className="section-head">
        <h2 id={headingId}>{screenLabel(test.title)}</h2>
        {readOnly ? <span className="btn-reason">{copy.ficha.checklist.readOnlyReason}</span> : null}
      </div>
      {/* Story 23.9: applied by hand, the band says so and the body shows (the mock's `.v13-na.is-applied .v13-na-body`). */}
      {applied ? (
        <>
          <AppliedBand api={api} testKey={test.testKey} applicability={applicability} />
          <div className="v13-na-body">{body}</div>
        </>
      ) : (
        body
      )}
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
  notice,
  actions,
}: {
  api: FichaApi;
  test: TestEvaluation;
  table: EvaluatedTable;
  /** Story 14.14: a line under the title row's criterion (the test-voltage check); null for none. */
  notice?: ReactNode;
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
  // e22g (review N7): the row's name, its second connection joined where another row starts the same (the transformer's two PRIMÁRIO rows).
  const rowName = (row: EvaluatedRow) => screenLabel(readingRowLabel(table.rows, row));
  const field = (row: EvaluatedRow, cell: EvaluatedCell, presentation: 'table' | 'card') =>
    // Story 23.8: a row the plate no longer lists keeps its readings, never written again (the fold refuses it).
    readOnly || !tapCellTyped(row, cell) ? (
      <ReadOnlyMeasurementField cell={cell} label={measurementCellName(rowName(row), screenLabel(cell.column))} />
    ) : sameAddress(dictatedCell, cell.address) && dictated !== null ? (
      <DictatedMeasurementField
        api={api}
        cell={cell}
        label={measurementCellName(rowName(row), screenLabel(cell.column))}
        reading={dictated}
        onDone={() => setDictated(null)}
        onRun={onRun}
      />
    ) : (
      <ReadingCell
        model={display}
        api={api}
        cell={cell}
        label={measurementCellName(rowName(row), screenLabel(cell.column))}
        presentation={presentation}
        missing={sameAddress(firstMissing, cell.address)}
        onRun={onRun}
      />
    );
  // Story 23.8: an unmarked tap row with nothing measured reads "Não medido" (`ratioRowCondicaoText`).
  const derivedText = (row: EvaluatedRow, kind: 'calculated' | 'condicao' | null) => (kind === 'condicao' ? ratioRowCondicaoText(row) : (row.calculated?.text ?? '—'));
  // Story 23.8 (seed v13): the TTR's rows are the plate's taps; the line above the table counts them.
  // Fix batch e23g (R2-4): the count and the predicates are the kernel's.
  const tapRows = isTapTable(table.rows);
  const line = tapTableLine(table.rows);
  /** An unmarked tap of the plate: required nothing, drawn muted (the mock's `tr.tap-optional`). */
  const optional = (row: EvaluatedRow) => tapRowOptional(row);
  const markOf = (row: EvaluatedRow) => tapMarkText(row.tap);
  // Story 22.8 (seed v12): the row's test voltage, drawn right after the connection cells; null on v1 to v11 tables.
  const voltageColumn = table.voltageColumn;
  // Batch e23v (Story 23.5, seed v13): a corrected test's "Corrigido a 20 °C" column, after its (last) capture column.
  const correctedAfter = test.temperature === undefined ? null : (table.columns.filter((column) => column.role === 'capture').at(-1)?.col ?? null);
  const notices = table.rows.flatMap((row) => (row.voltage?.notice === null || row.voltage?.notice === undefined ? [] : [{ row: row.row, text: row.voltage.notice }]));

  return (
    <div className="ficha-mt" data-table-key={table.key}>
      <div className="mt-title-row">
        {table.title === null ? null : (
          <span className="mt-title" id={titleId}>
            {screenLabel(table.title)}
          </span>
        )}
        {/* Story 14.9: a test no criterion judges reads the kernel's "critério não avaliado" alone. */}
        <span className="mt-criterion">{test.criterion === null ? test.criterionText : t.criterion(test.criterionText)}</span>
        <details className="ficha-details mt-source">
          <summary>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-chev-down" />
            </svg>
            {t.sourceSummary}
          </summary>
          {/* Batch e23a (Stories 23.2, 23.3): the kernel's source lines (each row's table and edition, the manufacturer's line) where it gives them. */}
          {test.sourceLines === undefined ? (
            <p>{test.sourceName}</p>
          ) : (
            test.sourceLines.map((line) => (
              <p key={line} data-source-line="">
                {line}
              </p>
            ))
          )}
        </details>
        {readOnly ? null : (
          <div className="mt-actions">
            {actions(dictatedCell)}
            <DictationButton label={tableDictationLabel(table)} onStart={() => setDictated(null)} onResult={onDictated} />
          </div>
        )}
      </div>
      {notice}
      {line === null ? null : (
        <p className="v13-line" data-taps-line="">
          <span>
            {line.label} <b>{line.count}</b>
          </span>
          <span>{line.note}</span>
        </p>
      )}
      {/* Review fixes 2026-10-08 (DC-1, DB-3): authored, the table's own horizontal scroller, UX-DR40's
          last resort: a table wider than its box scrolls inside it, never the title row or the page. */}
      <div className="mt-scroll">
        <table
          className={table.ratio ? (tapRows ? 'measurement-table ficha-ttr is-wide ficha-ttr-taps' : 'measurement-table ficha-ttr is-wide') : test.temperature === undefined ? 'measurement-table' : 'measurement-table ficha-iso-v13'}
          aria-labelledby={table.title === null ? undefined : titleId}
          aria-label={table.title === null ? screenLabel(test.title) : undefined}
        >
          <thead>
            <tr>
              {table.connectionHeaders.map((header, i) => (
                <th key={`c${i}`} scope="col">
                  <WholeWords className="mt-word" text={screenLabel(header)} />
                </th>
              ))}
              {voltageColumn === null ? null : (
                <th scope="col" data-voltage-column="">
                  <WholeWords className="mt-word" text={voltageColumn.header} />
                </th>
              )}
              {table.columns.map((column) => [
                // DC-1: Condição is a word column (`60-ficha.html` draws its header without `col-value`).
                <th key={column.col} scope="col" className={column.role === 'input' || column.derivedKind === 'condicao' ? undefined : 'col-value'}>
                  <WholeWords className="mt-word" text={screenLabel(column.header)} />
                </th>,
                // Batch e23v (Story 23.5): `60-ficha.html` #/ficha/TR1, the corrected column's header (the kernel's words).
                column.col === correctedAfter && test.temperature !== undefined ? (
                  <th key={`corrected-${column.col}`} scope="col" className="col-value" data-corrected-column="">
                    <WholeWords className="mt-word" text={test.temperature.header} />
                  </th>
                ) : null,
              ])}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.row} className={optional(row) ? 'tap-optional' : undefined} data-tap-row={row.tap === null ? undefined : row.row}>
                {row.connection.map((text, i) =>
                  i === 0 && row.tap !== null ? (
                    // Story 23.8 (`60-ficha.html` #/ficha/TR1): the tap's position with its word mark under it.
                    <td key={`c${i}`} className="cell-point">
                      <span className="tap-cell">
                        <span>{text === '' ? '—' : text}</span>
                        {markOf(row) === null ? null : <span className="tap-mark">{markOf(row)}</span>}
                      </span>
                    </td>
                  ) : (
                    <td key={`c${i}`} className={i === 0 ? 'cell-point' : 'cell-dim'}>
                      {text === '' ? '—' : <WholeWords className="mt-word" text={screenLabel(text)} />}
                    </td>
                  ),
                )}
                {voltageColumn === null || row.voltage === null ? null : (
                  <td className="cell-voltage">
                    <RowVoltageField api={api} testKey={test.testKey} row={row} options={voltageColumn.options} label={measurementCellName(rowName(row), voltageColumn.header)} readOnly={readOnly} />
                  </td>
                )}
                {table.columns.map((column) => {
                  if (column.role === 'derived') {
                    return (
                      // DC-1: Condição is the mock's `td.cell-dim` ("Satisfatório", `60-ficha.html`), the calculated value `td.cell-calc`.
                      <td key={column.col} className={column.derivedKind === 'condicao' ? 'cell-dim' : 'cell-calc'}>
                        {derivedText(row, column.derivedKind)}
                        {column.derivedKind === 'condicao' ? null : (
                          <>
                            <span className="calc-mark" aria-hidden="true">
                              {ui.measurementField.calcMark}
                            </span>
                            <span className="visually-hidden">{ui.measurementField.calcSpoken}</span>
                          </>
                        )}
                      </td>
                    );
                  }
                  const cell = cellOf(row, column.col);
                  // Story 23.8: a tap row's V PRIMÁRIO and V SECUNDÁRIO come from the plate, drawn as text (the mock's `td.cell-dim`).
                  if (row.tap !== null && cell !== undefined && cell.role === 'input') {
                    return (
                      <td key={column.col} className="cell-dim">
                        {tapInputText(cell)}
                      </td>
                    );
                  }
                  // Story 22.8: below 768 px the row's voltage sits over its first typed cell, the column hidden (`ficha.css`).
                  const stacked = voltageColumn !== null && row.voltage !== null && cell !== undefined && cell === row.cells[0];
                  // Batch e23v (Story 23.5): the corrected value beside this capture, and under it below 768 px (the column hidden there).
                  const corrected = column.col === correctedAfter && cell !== undefined ? <CorrectedValue key={`corrected-${column.col}`} test={test} cell={cell} /> : null;
                  return [
                    <td key={column.col} className="cell-value">
                      {stacked ? (
                        <div className="voltage-stacked">
                          <span className="field-label" aria-hidden="true">
                            {voltageColumn.header}
                          </span>
                          <RowVoltageField api={api} testKey={test.testKey} row={row} options={voltageColumn.options} label={measurementCellName(rowName(row), voltageColumn.header)} readOnly={readOnly} stacked />
                        </div>
                      ) : null}
                      {cell === undefined ? null : field(row, cell, 'table')}
                      {corrected === null ? null : <CorrectedValue test={test} cell={cell!} stacked />}
                    </td>,
                    corrected,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.ratio ? (
        <div className="ficha-cards">
          <div className="measurement-cards">
            {table.rows.map((row) =>
              row.tap !== null ? (
                <TapCard key={row.row} row={row} table={table} optional={optional(row)} mark={markOf(row)} field={field} derivedText={derivedText} />
              ) : (
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
                      {column.derivedKind === 'condicao' ? null : (
                        <>
                          <span className="calc-mark" aria-hidden="true">
                            {ui.measurementField.calcMark}
                          </span>
                          <span className="visually-hidden">{ui.measurementField.calcSpoken}</span>
                        </>
                      )}
                    </p>
                  ))}
              </div>
              ),
            )}
          </div>
        </div>
      ) : null}
      {/* Story 22.8: the kernel's notice of a row tested above what its winding supports; on the sheet only, never blocking. */}
      {notices.map((notice) => (
        <p key={notice.row} className="helper" data-tone="amber" role="status" data-row-voltage-notice={notice.row}>
          {notice.text}
        </p>
      ))}
      {/* Story 15.6: the kernel's formula under a ratio table whose VAL CALCULADO applies a factor, at every width; never printed. */}
      {table.formulaHelper === null ? null : <p className="helper">{table.formulaHelper}</p>}
      {/* Story 21.1: the kernel's vector-group helpers (the windings to short, a missing or unrecognized group); never printed. */}
      {table.shortHelper === null ? null : <p className="helper">{table.shortHelper}</p>}
      {table.groupHelper === null ? null : <p className="helper">{table.groupHelper}</p>}
    </div>
  );
}

/**
 * Story 23.8 (`60-ficha.html` #/ficha/TR1 `.measurement-card`): a tap row as a phone card: "Tap 3"
 * with its mark, the plate's values in one line ("V primário 12,6 kV · V secundário 380 V ·
 * Calculado 57,43"), the three captures in a row (`.card-fields`), then the Condição.
 */
function TapCard({
  row,
  table,
  optional,
  mark,
  field,
  derivedText,
}: {
  row: EvaluatedRow;
  table: EvaluatedTable;
  optional: boolean;
  mark: string | null;
  field: (row: EvaluatedRow, cell: EvaluatedCell, presentation: 'table' | 'card') => ReactNode;
  derivedText: (row: EvaluatedRow, kind: 'calculated' | 'condicao' | null) => string;
}) {
  const t = copy.ficha.ensaios;
  const calculated = table.columns.find((column) => column.derivedKind === 'calculated');
  const condicao = table.columns.find((column) => column.derivedKind === 'condicao');
  const dims = [
    ...row.cells.filter((cell) => cell.role === 'input').map((cell) => `${readingLabelText(table.columns.find((column) => column.col === cell.address.col)?.label ?? cell.column)} ${tapInputText(cell)}`),
    ...(calculated === undefined ? [] : [`${screenLabel(calculated.header)} ${derivedText(row, 'calculated')}`]),
  ];
  return (
    <div className={optional ? 'measurement-card tap-optional' : 'measurement-card'} data-tap-card={row.row}>
      <p className="card-point">
        {screenLabel(row.label)}
        {mark === null ? null : <span className="tap-mark">{mark}</span>}
      </p>
      <p className="card-dims">{dims.join(t.tapCardSeparator)}</p>
      <div className="card-fields">
        {row.cells
          .filter((cell) => cell.role === 'capture')
          .map((cell) => (
            <div key={cell.address.col} className="field">
              <span className="field-label" aria-hidden="true">
                {screenLabel(cell.column)}
              </span>
              {field(row, cell, 'card')}
            </div>
          ))}
      </div>
      {condicao === undefined ? null : (
        <p className="card-dims" style={{ margin: 'var(--sp-2) 0 0' }}>
          {t.cardCondition(derivedText(row, 'condicao'))}
        </p>
      )}
    </div>
  );
}

/**
 * Story 22.8 (seed v12): a row's test voltage, a select of the kernel's options showing the row's
 * effective voltage (typed, else its default). Picking one writes the existing cell put
 * (`{raw, unit: 'kV', state: 'measured'}`, the kernel's `rowVoltageCell`); the empty option clears
 * the cell, so the row falls back to its default. Read-only, the effective voltage as text.
 */
function RowVoltageField({
  api,
  testKey,
  row,
  options,
  label,
  readOnly,
  stacked = false,
}: {
  api: FichaApi;
  testKey: string;
  row: EvaluatedRow;
  options: readonly string[];
  label: string;
  readOnly: boolean;
  /** Below 768 px the select is drawn over the row's first typed cell instead of in its own column. */
  stacked?: boolean;
}) {
  const voltage = row.voltage!;
  const current = voltage.kv === null ? '' : voltage.text;
  const where = stacked ? { 'data-row-voltage-stacked': row.row } : { 'data-row-voltage': row.row };
  if (readOnly) {
    return (
      <div className="input" role="textbox" aria-readonly="true" aria-label={label} {...where}>
        {voltage.text}
      </div>
    );
  }
  const write = (option: string) => {
    const value = option === '' ? null : rowVoltageCell(option);
    if ((option !== '' && value === null) || api.author === null) return;
    // The empty option on a row whose voltage is its default (nothing typed) has nothing to clear.
    if (value === null && voltage.source !== 'typed') return;
    void api.commit([testCellOp(api.author, api.relatorioId, api.blockId, testKey, row.row, voltage.col, value)]).catch(() => undefined);
  };
  return (
    <div className="ficha-cell" {...where}>
      {/* The empty option reads "—", as an empty cell does, so the select is as narrow as "2,5" at 390 px. */}
      <select className="input" aria-label={label} value={current} onChange={(event) => write(event.target.value)}>
        <option value="">—</option>
        {current !== '' && !options.includes(current) ? <option value={current}>{current}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
