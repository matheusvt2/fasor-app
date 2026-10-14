import {
  blockConfigWithSubBlock,
  choiceValue,
  enabledSubBlocksOf,
  measurementWhere,
  putBlockOp,
  type BlockRow,
  type EvaluatedMeasurementCell,
  type EvaluatedMeasurementRow,
  type EvaluatedMeasurementValue,
  type InstrumentRow,
  type MeasurementAddress,
  type MeasurementOption,
  type MeasurementTestEvaluation,
  type RelatorioSnapshot,
} from '@app/domain';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { OverflowMenu, SegmentedControl, TextButton, Toggle } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { wrapsOnPhone } from './configuracao-section.tsx';
import type { FichaApi } from './ficha-api.ts';
import { ReadOnlyField, SheetField } from './ficha-fields.tsx';
import { conclusionOp, testCellOp, testChoiceCellOp, testValueOp } from './ficha-ops.ts';
import { InstrumentPicker } from './instrument-picker.tsx';
import { cellKey, MeasurementField, ReadOnlyMeasurementField, type RunDirection } from './measurement-field.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';

/*
 * Story 14.5 (`63-ficha-cta.html`): the measurement tests of a library type's sheet, the
 * tests of the measurement-table grammar (the six of the Chave de transferência automática),
 * drawn in the "Ensaios" step after the seeded tests. Everything shown is the kernel's one
 * evaluation (`evaluateSheetMeasurements`): the rows the configuration shows, each cell's
 * kind, unit, verdict and helper, the lowest-of-column row, the values and how they read on
 * the method line, what is required. Nothing here judges a cell or hides a row.
 *
 * One section per test (`.lib-test`): its switch when the test can be switched off on the
 * sheet (a `block/{id}/config` put of `sub_blocks[key].enabled`, structure) with the off note
 * in place of the body; the Instrument picker when the seed names whose instruments it
 * offers; the test's values above the table (a choice of three or more as option rows, of two
 * as a Segmented control, a number as a sheet field), each one a
 * `sheet/{b}/test/{t}/value/{key}` put; the method line; the table; the grouped values after
 * it. A number cell is the sheet's Measurement field (the same commit, echo, unit slot, "Não
 * medido" and "Marcar Com restrições"), written through the cell family every reading uses;
 * a choice cell is a Segmented control (two options) or the sheet's select (more); a fixed
 * cell is text. EXPERIENCE.md › Measurement table: with one or two value columns the table
 * stays a table on phone; with more it stacks into one card per row below 768 px.
 */

/** A table with more value columns than this stacks into cards on phone (EXPERIENCE.md › Measurement table). */
const TABLE_COLUMNS_ON_PHONE = 2;
/** A choice with more options than this is not drawn as a Segmented control. */
const SEGMENTED_OPTIONS = 2;

export type MeasurementRun = (from: MeasurementAddress, direction: RunDirection) => boolean;

export function MeasurementTests({
  api,
  snapshot,
  block,
  evaluations,
  instruments,
  onRun,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  /** The kernel's `evaluateSheetMeasurements` of the sheet. */
  evaluations: readonly MeasurementTestEvaluation[];
  instruments: readonly InstrumentRow[];
  /** Moves the focus along the continuous Enter run; false when there is nowhere to go. */
  onRun: MeasurementRun;
}) {
  if (evaluations.length === 0) return null;
  return (
    <div className="tests-stack">
      {evaluations.map((test) => (
        <MeasurementTestSection key={test.testKey} api={api} snapshot={snapshot} block={block} test={test} instruments={instruments} onRun={onRun} />
      ))}
    </div>
  );
}

function MeasurementTestSection({
  api,
  snapshot,
  block,
  test,
  instruments,
  onRun,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  test: MeasurementTestEvaluation;
  instruments: readonly InstrumentRow[];
  onRun: MeasurementRun;
}) {
  const t = copy.ficha.measurement;
  const headingId = useId();
  const readOnly = useSheetReadOnly();

  const switchTest = (enabled: boolean) => {
    void api
      .edit((blocks, by) => {
        // The config as the freshest row holds it, so a switch never undoes another one.
        const fresh = blocks.find((row) => row.id === api.blockId);
        if (fresh === undefined || enabledSubBlocksOf(fresh).has(test.testKey) === enabled) return null;
        return [putBlockOp(by, api.relatorioId, api.blockId, 'config', blockConfigWithSubBlock(fresh.config, test.testKey, enabled))];
      })
      .catch(() => undefined);
  };

  // The values drawn above the table (how the test was run); the grouped ones come after it.
  const above = test.values.filter((value) => value.shown && value.group === null);
  const value = (item: EvaluatedMeasurementValue) => <TestValue key={item.key} api={api} testKey={test.testKey} value={item} readOnly={readOnly} />;

  return (
    <section
      className={readOnly ? 'section lib-test is-readonly' : 'section lib-test'}
      aria-labelledby={headingId}
      data-test-key={test.testKey}
      data-off={test.enabled ? undefined : ''}
      data-skipped={test.skipped ? '' : undefined}
    >
      <div className="section-head">
        <h2 id={headingId}>{test.title}</h2>
        {readOnly ? (
          <span className="btn-reason">{copy.ficha.checklist.readOnlyReason}</span>
        ) : test.switchable ? (
          <Toggle className="lib-test-switch" isSelected={test.enabled} onChange={switchTest} aria-label={t.switchLabel(test.title)} />
        ) : null}
      </div>
      {test.offNote === null ? null : (
        // Shown only while the test is off (`ficha.css`, the mock's `:has(.lib-test-switch[aria-checked="false"])` rule).
        <div className="lib-off-note">
          <svg className="ico ico-sm" aria-hidden="true">
            <use href="/sprite.svg#i-block" />
          </svg>
          <span>{test.offNote}</span>
        </div>
      )}
      {test.enabled ? (
        <div className="lib-test-body">
          {test.instrumentOf === null ? null : (
            <InstrumentPicker
              api={api}
              block={block}
              blocks={snapshot.blocks}
              testKey={test.testKey}
              instrumentOf={test.instrumentOf}
              instruments={instruments}
              serviceEnd={snapshot.relatorio.setup.service_end}
              setupInstrumentIds={snapshot.relatorio.setup.instrument_ids}
              readOnly={readOnly}
            />
          )}
          {above.length === 0 ? null : <div className={above.some((item) => item.kind === 'choice') ? 'test-options' : 'test-fields'}>{above.map(value)}</div>}
          {test.valuesLine === null ? null : (
            <p className="cta-method-tag" data-testid="measurement-values-line">
              {test.valuesLine.text}
            </p>
          )}
          <MeasurementTestTable api={api} test={test} readOnly={readOnly} onRun={onRun} />
          {test.groups.map((group) => (
            <div key={group.label} className="test-fields">
              <p className="np-group">{group.label}</p>
              {group.values.map(value)}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// --- the test's values ------------------------------------------------------------------------

function TestValue({ api, testKey, value, readOnly }: { api: FichaApi; testKey: string; value: EvaluatedMeasurementValue; readOnly: boolean }) {
  const t = copy.ficha;
  const labelId = useId();
  const stored = value.state === 'measured' ? { raw: value.raw, unit: value.unit, state: 'measured' as const } : null;
  if (value.kind === 'number') {
    const field = { key: value.key, label: value.label, kind: 'number' as const, ...(value.unit === null ? {} : { unit: value.unit }) };
    if (readOnly) return <ReadOnlyField field={field} value={stored} />;
    return (
      <SheetField
        field={field}
        value={stored}
        commit={(next) => (api.author === null ? undefined : api.commit([testValueOp(api.author, api.relatorioId, api.blockId, testKey, value.key, (next ?? null) as Parameters<typeof testValueOp>[5])]))}
        draft={{ entityId: api.blockId, field: `valor-${testKey}-${value.key}`.replace(/_/g, '-') }}
        missing={value.missing}
        invalidText={t.nameplate.invalidNumber}
        selectEmpty={t.nameplate.selectEmpty}
      />
    );
  }
  if (readOnly) return <ReadOnlyField field={{ kind: 'text', label: value.label }} value={value.state === 'measured' ? value.displayText : null} />;

  const choose = (optionKey: string) => {
    void api.edit((_blocks, by) => [testValueOp(by, api.relatorioId, api.blockId, testKey, value.key, choiceValue(optionKey))]).catch(() => undefined);
  };
  const chosen = value.state === 'measured' ? value.raw : '';
  return (
    <div className="field" data-value-key={value.key} data-missing-field={value.missing ? '' : undefined}>
      <span className="field-label" id={labelId}>
        {value.label}
      </span>
      {value.options.length > SEGMENTED_OPTIONS ? (
        <OptionRows labelledBy={labelId} options={value.options} value={chosen} onChange={choose} />
      ) : (
        <SegmentedControl
          aria-labelledby={labelId}
          value={chosen}
          onChange={choose}
          options={value.options.map((option) => ({ value: option.key, label: option.label }))}
          wrap={wrapsOnPhone(value.options.map((option) => option.label))}
        />
      )}
    </div>
  );
}

/**
 * A choice drawn as full-width option rows (`63-ficha-cta.html` `.cta-options`, the E5
 * método): a `radiogroup` whose change applies at once. The state sits on the element the
 * mock rule styles (`.option-row[aria-checked="true"]`). Keyboard, the APG radiogroup's: one
 * tab stop (the checked row, else the first), the arrows and Home/End move the focus and the
 * choice together, Space and Enter choose the focused row.
 */
function OptionRows({ labelledBy, options, value, onChange }: { labelledBy: string; options: readonly MeasurementOption[]; value: string; onChange: (optionKey: string) => void }) {
  const rows = useRef(new Map<string, HTMLButtonElement | null>());
  const selected = options.findIndex((option) => option.key === value);
  const tabbable = selected === -1 ? 0 : selected;
  const moveTo = (index: number) => {
    const target = options[(index + options.length) % options.length];
    if (target === undefined) return;
    rows.current.get(target.key)?.focus();
    if (target.key !== value) onChange(target.key);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const to = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? index - 1 : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? index + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    moveTo(to);
  };
  return (
    <div className="cta-options" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((option, index) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          className="option-row"
          aria-checked={option.key === value}
          tabIndex={index === tabbable ? 0 : -1}
          data-value={option.key}
          ref={(element) => {
            rows.current.set(option.key, element);
          }}
          onClick={() => {
            if (option.key !== value) onChange(option.key);
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className="radio" aria-hidden="true" />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

// --- the table ---------------------------------------------------------------------------------

function MeasurementTestTable({ api, test, readOnly, onRun }: { api: FichaApi; test: MeasurementTestEvaluation; readOnly: boolean; onRun: MeasurementRun }) {
  const t = copy.ficha;
  const multi = test.columns.length > 1;
  const stacks = test.columns.length > TABLE_COLUMNS_ON_PHONE;
  const tableClass = ['measurement-table', multi ? 'is-multi' : null, stacks ? 'is-compact has-cards' : null].filter((part) => part !== null).join(' ');

  const control = (row: EvaluatedMeasurementRow, cell: EvaluatedMeasurementCell, presentation: 'table' | 'card'): ReactNode => {
    const label = measurementWhere(test, row, cell);
    if (cell.kind === 'choice') return <ChoiceCell api={api} cell={cell} label={label} readOnly={readOnly} />;
    if (readOnly) return <ReadOnlyMeasurementField cell={cell} label={label} />;
    return <MeasurementField api={api} cell={cell} label={label} presentation={presentation} missing={cell.missing} onRun={onRun} />;
  };

  return (
    <div className="ficha-mt" data-table-key={test.testKey}>
      <div className="mt-title-row">
        <span className="mt-criterion">{test.criterionText}</span>
        <details className="ficha-details mt-source">
          <summary>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-chev-down" />
            </svg>
            {t.ensaios.sourceSummary}
          </summary>
          <p>{test.sourceName}</p>
        </details>
      </div>
      <div className="mt-scroll">
        <table className={tableClass} aria-label={test.title}>
          <thead>
            <tr>
              <th scope="col">{test.rowHeader}</th>
              {test.columns.map((column) => (
                <th key={column.col} scope="col" className={column.kind === 'number' ? 'col-value' : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {test.rows.map((row) => (
              <tr key={row.row} data-row-key={row.key}>
                <td className="cell-point">{row.label}</td>
                {row.cells.map((cell) =>
                  cell.fixed !== null ? (
                    <td key={cell.address.col} className="cell-dim">
                      {cell.fixed}
                    </td>
                  ) : (
                    <td key={cell.address.col} className={cell.kind === 'choice' && cell.options.length <= SEGMENTED_OPTIONS ? 'cell-yn' : 'cell-value'}>
                      {control(row, cell, 'table')}
                    </td>
                  ),
                )}
              </tr>
            ))}
            {test.reference === null ? null : (
              <tr className="row-derived">
                <td className="cell-point">{test.reference.label}</td>
                {test.reference.cells.map((cell) => (
                  <td key={cell.columnKey} className="cell-calc" data-column-key={cell.columnKey}>
                    {cell.text ?? '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {stacks ? (
        <div className="lib-cards">
          <div className="measurement-cards">
            {test.rows.map((row) => {
              const fixed = row.cells.filter((cell) => cell.fixed !== null);
              return (
                <div key={row.row} className="measurement-card" data-row-key={row.key}>
                  <p className="card-point">{row.label}</p>
                  {fixed.length === 0 ? null : <p className="card-dims">{fixed.map((cell) => t.measurement.cardPart(cell.column, cell.fixed ?? '')).join(t.measurement.cardSeparator)}</p>}
                  {row.cells
                    .filter((cell) => cell.fixed === null)
                    .map((cell) => (
                      <div key={cell.address.col} className="field">
                        <span className="field-label" aria-hidden="true">
                          {cell.column}
                        </span>
                        {control(row, cell, 'card')}
                      </div>
                    ))}
                </div>
              );
            })}
            {test.reference === null ? null : (
              <div className="measurement-card">
                <p className="card-point">{test.reference.label}</p>
                <p className="card-dims">{test.reference.cells.map((cell) => t.measurement.cardPart(cell.column, cell.text ?? '—')).join(t.measurement.cardSeparator)}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A choice cell: a Segmented control for two options (the mock's `td.cell-yn`), the sheet's
 * select for more (four options four columns wide fit no screen side by side). "Não medido"
 * and "Limpar" sit in the cell's Overflow beside the Segmented control and are options of the
 * select. Out of its criterion it shows the kernel's helper with "Marcar Com restrições", as
 * a number cell does.
 */
function ChoiceCell({ api, cell, label, readOnly }: { api: FichaApi; cell: EvaluatedMeasurementCell; label: string; readOnly: boolean }) {
  const { address } = cell;
  const chosen = cell.state === 'measured' ? cell.raw : '';
  const notMeasured = cell.state === 'not_measured';

  if (readOnly) {
    return (
      <div className="ficha-cell" data-cell={cellKey(address)}>
        <div className="input" role="textbox" aria-readonly="true" aria-label={label}>
          {cell.displayText}
        </div>
        {cell.helperText === null ? null : <div className="mf-helper">{cell.helperText}</div>}
      </div>
    );
  }

  const edit = (build: Parameters<FichaApi['edit']>[0]) => void api.edit(build).catch(() => undefined);
  const choose = (optionKey: string) => edit((_blocks, by) => [testChoiceCellOp(by, api.relatorioId, api.blockId, address.testKey, address.row, address.col, optionKey)]);
  const markNotMeasured = () => edit((_blocks, by) => [testCellOp(by, api.relatorioId, api.blockId, address.testKey, address.row, address.col, { raw: '', unit: null, state: 'not_measured' })]);
  const clear = () => edit((_blocks, by) => [testCellOp(by, api.relatorioId, api.blockId, address.testKey, address.row, address.col, null)]);
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

  return (
    <div className="ficha-cell" data-cell={cellKey(address)} data-missing-field={cell.missing ? '' : undefined}>
      {cell.options.length > SEGMENTED_OPTIONS ? (
        <select
          className="input"
          aria-label={label}
          value={notMeasured ? NOT_MEASURED_OPTION : chosen}
          data-cell-choice={cellKey(address)}
          onChange={(event) => {
            const next = event.target.value;
            if (next === '') clear();
            else if (next === NOT_MEASURED_OPTION) markNotMeasured();
            else choose(next);
          }}
        >
          <option value="">{copy.ficha.nameplate.selectEmpty}</option>
          {cell.options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
          <option value={NOT_MEASURED_OPTION}>{ui.measurementField.notMeasured}</option>
        </select>
      ) : (
        <div className="ficha-choice" data-cell-choice={cellKey(address)}>
          <SegmentedControl aria-label={label} value={chosen} onChange={choose} options={cell.options.map((option) => ({ value: option.key, label: option.label }))} />
          <OverflowMenu
            name={label}
            items={[
              { id: 'not-measured', label: ui.measurementField.notMeasured, onAction: markNotMeasured },
              ...(cell.state === 'empty' ? [] : [{ id: 'clear', label: copy.ficha.checklist.clear, onAction: clear }]),
            ]}
          />
        </div>
      )}
      {notMeasured && cell.options.length <= SEGMENTED_OPTIONS ? <span className="helper">{ui.measurementField.notMeasured}</span> : null}
      {cell.helperText === null ? null : (
        <div className="mf-helper" role="status">
          {cell.helperText}
          <TextButton onPress={markRestricted}>{ui.measurementField.markRestricted}</TextButton>
        </div>
      )}
    </div>
  );
}

/** The select's value for "Não medido": no option key of the seed can hold a colon (`^[a-z0-9_]+$`). */
const NOT_MEASURED_OPTION = ':not-measured';
