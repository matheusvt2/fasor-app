import {
  blockConfigWithSubBlock,
  choiceValue,
  enabledSubBlocksOf,
  measurementWhere,
  putBlockOp,
  thermalPhotoText,
  type BlockDefinition,
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
import { APPLIED_SECTION_CLASS, AppliedBand, NotApplicableTest } from './applicability-band.tsx';
import { conclusionOp, testCellOp, testChoiceCellOp, testValueOp } from './ficha-ops.ts';
import { InstrumentPicker } from './instrument-picker.tsx';
import { cellKey, MeasurementField, ReadOnlyMeasurementField, type RunDirection } from './measurement-field.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';
import { TestHelpAction } from './test-help-dialog.tsx';
import { TemperatureLine } from './corrected-value.tsx';
import { ThermalPhotoButton } from './photo-openers.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

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
  definition,
  evaluations,
  instruments,
  onRun,
  photoTarget,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  /** Batch e23h (Story 23.10): the sheet's definition, whose tests may carry "Como ensaiar". */
  definition: BlockDefinition;
  /** The kernel's `evaluateSheetMeasurements` of the sheet. */
  evaluations: readonly MeasurementTestEvaluation[];
  instruments: readonly InstrumentRow[];
  /** Moves the focus along the continuous Enter run; false when there is nowhere to go. */
  onRun: MeasurementRun;
  /** Batch e23e (Story 23.20): the sheet photo's target with a test's context caption ("Foto térmica"); none, no such action. */
  photoTarget?: (testKey: string) => CaptureTarget;
}) {
  if (evaluations.length === 0) return null;
  return (
    <div className="tests-stack">
      {evaluations.map((test) => (
        <MeasurementTestSection key={test.testKey} api={api} snapshot={snapshot} block={block} definition={definition} test={test} instruments={instruments} onRun={onRun} photoTarget={photoTarget} />
      ))}
    </div>
  );
}

function MeasurementTestSection({
  api,
  snapshot,
  block,
  definition,
  test,
  instruments,
  onRun,
  photoTarget,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  test: MeasurementTestEvaluation;
  instruments: readonly InstrumentRow[];
  onRun: MeasurementRun;
  photoTarget?: (testKey: string) => CaptureTarget;
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
  // The head's end: the read-only reason, or a switchable test's switch (kept on an NA test too).
  const headEnd = readOnly ? (
    <span className="btn-reason">{copy.ficha.checklist.readOnlyReason}</span>
  ) : test.switchable ? (
    <Toggle className="lib-test-switch" isSelected={test.enabled} onChange={switchTest} aria-label={t.switchLabel(test.title)} />
  ) : null;
  // Story 23.9 (seed v13): a test switched on that the nameplate makes not applicable shows its band
  // in place of its body, its switch kept; switched off it is the off test below. Applied by hand,
  // the applied band sits over it.
  if (test.enabled && test.applicability.state === 'na') {
    // Batch e23h (EXPERIENCE.md "Como ensaiar"): the head of every test with help, an NA one too.
    const naHeadEnd = (
      <>
        <TestHelpAction definition={definition} testKey={test.testKey} title={test.title} />
        {headEnd}
      </>
    );
    // Batch e23e (Story 23.20): a test NA by its own value ("Equipamento em carga") keeps that value's control under the band.
    const deciding = test.applicability.value === undefined ? undefined : test.values.find((item) => item.key === test.applicability.value);
    return (
      <NotApplicableTest api={api} testKey={test.testKey} title={test.title} applicability={test.applicability} headEnd={naHeadEnd}>
        {deciding === undefined ? null : <div className="test-options">{value(deciding)}</div>}
      </NotApplicableTest>
    );
  }
  const applied = test.enabled && test.applicability.state === 'applied';
  const sectionClass = ['section lib-test', readOnly ? 'is-readonly' : null, applied ? APPLIED_SECTION_CLASS : null].filter(Boolean).join(' ');

  return (
    <section
      className={sectionClass}
      aria-labelledby={headingId}
      data-test-key={test.testKey}
      data-off={test.enabled ? undefined : ''}
      data-skipped={test.skipped ? '' : undefined}
      data-applicability={applied ? 'applied' : undefined}
    >
      <div className="section-head">
        <h2 id={headingId}>{test.title}</h2>
        {/* Batch e23h (Story 23.10): "Como ensaiar" where the test's definition carries help. */}
        <TestHelpAction definition={definition} testKey={test.testKey} title={test.title} />
        {headEnd}
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
      {applied ? <AppliedBand api={api} testKey={test.testKey} applicability={test.applicability} /> : null}
      {test.enabled ? (
        <AppliedBody applied={applied}>
        <div className="lib-test-body">
          {test.instrumentOf === null ? null : (
            <InstrumentPicker
              api={api}
              block={block}
              blocks={snapshot.blocks}
              equipmentTypes={snapshot.equipment_types}
              testKey={test.testKey}
              instrumentOf={test.instrumentOf}
              instruments={instruments}
              serviceEnd={snapshot.relatorio.setup.service_end}
              setupInstrumentIds={snapshot.relatorio.setup.instrument_ids}
              readOnly={readOnly}
            />
          )}
          {/* Batch e23e (Story 23.20): the thermography's "Foto térmica", the sheet camera with the test's context caption. */}
          {test.testKey === THERMOGRAPHY_TEST && photoTarget !== undefined && !readOnly ? (
            <div className="mt-actions" data-thermal-actions="">
              <ThermalPhotoButton
                relatorioId={api.relatorioId}
                target={() => photoTarget(test.testKey)}
                label={thermalPhotoText(snapshot.files, block.id, photoTarget(test.testKey).caption)}
              />
            </div>
          ) : null}
          {/* Batch e23t (Story 23.17, `60-ficha.html` #/ficha/TR1 "Coleta de óleo"): a one-cell choice test is the frame's `.v13-choice`. */}
          {isSingleChoice(test) ? (
            <SingleChoiceTest api={api} test={test} readOnly={readOnly} />
          ) : (
            <>
              {above.length === 0 ? null : <div className={above.some((item) => item.kind === 'choice') ? 'test-options' : 'test-fields'}>{above.map(value)}</div>}
              {test.valuesLine === null ? null : (
                <p className="cta-method-tag" data-testid="measurement-values-line">
                  {test.valuesLine.text}
                </p>
              )}
              {/* Batch e23t (Story 23.15): the temperature the values are corrected from, the kernel's line (e23v's `.v13-line`). */}
              <TemperatureLine test={test} />
              <MeasurementTestTable api={api} test={test} readOnly={readOnly} onRun={onRun} />
              {/* Batch e23t (Stories 23.15 and 23.19): the kernel's requests under the table (the material, TIPO DE ISOLAÇÃO). */}
              {(test.notes ?? []).map((note) => (
                <p key={note} className="helper" data-tone="amber" data-measurement-note="">
                  {note}
                </p>
              ))}
            </>
          )}
          {test.groups.map((group) => (
            <div key={group.label} className="test-fields">
              <p className="np-group">{group.label}</p>
              {group.values.map(value)}
            </div>
          ))}
        </div>
        </AppliedBody>
      ) : null}
    </section>
  );
}

/** The thermography's test key (seed v13, batch e23e, Story 23.20), the one test with "Foto térmica". */
const THERMOGRAPHY_TEST = 'termografia';

/** The oil sampling's test key (seed v13, Story 23.17), the one test the frame draws as `.v13-choice` with its helper copy. */
const OIL_SAMPLING_TEST = 'coleta_oleo';

/** Batch e23t (Story 23.17): the oil sampling, one row and one choice column of two options, drawn as the frame's `.v13-choice`. */
function isSingleChoice(test: MeasurementTestEvaluation): boolean {
  const [row] = test.rows;
  const [column] = test.columns;
  return test.testKey === OIL_SAMPLING_TEST && test.rows.length === 1 && test.columns.length === 1 && row !== undefined && column !== undefined && column.kind === 'choice' && (row.cells[0]?.options.length ?? 0) <= SEGMENTED_OPTIONS;
}

/**
 * Batch e23t (Story 23.17, `60-ficha.html` #/ficha/TR1 "Coleta de óleo"): the row's label over its
 * choice (the sheet's choice cell, a Segmented control), the frame's helper, and each value the kernel
 * shows under it (`shown`, the Motivo under "Não coletado") as the frame's `.v13-reason` chips, a
 * `sheet/{b}/test/{t}/value/{key}` put each.
 */
function SingleChoiceTest({ api, test, readOnly }: { api: FichaApi; test: MeasurementTestEvaluation; readOnly: boolean }) {
  const t = copy.ficha.measurement;
  const labelId = useId();
  const row = test.rows[0]!;
  const cell = row.cells[0]!;
  const reasons = test.values.filter((value) => value.shown && value.kind === 'choice');
  const choose = (value: EvaluatedMeasurementValue, optionKey: string) => {
    void api.edit((_blocks, by) => [testValueOp(by, api.relatorioId, api.blockId, test.testKey, value.key, choiceValue(optionKey))]).catch(() => undefined);
  };
  return (
    <div className="v13-choice" data-row-key={row.key}>
      <span className="field-label" id={labelId}>
        {row.label}
      </span>
      <ChoiceCell api={api} cell={cell} label={measurementWhere(test, row, cell)} readOnly={readOnly} />
      <p className="helper">{t.samplingHelper}</p>
      {reasons.map((value) => (
        <div key={value.key} className="v13-reason" data-value-key={value.key} data-missing-field={value.missing ? '' : undefined}>
          <span className="field-label">{value.label}</span>
          <div className="chip-row chips-recent" role="group" aria-label={t.samplingReasonGroup}>
            {value.options.map((option) => (
              <button
                key={option.key}
                type="button"
                className="chip"
                aria-pressed={value.state === 'measured' && value.raw === option.key}
                disabled={readOnly}
                data-value={option.key}
                onClick={() => {
                  if (!(value.state === 'measured' && value.raw === option.key)) choose(value, option.key);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="helper">{t.samplingReasonHelper}</p>
        </div>
      ))}
    </div>
  );
}

/** Story 23.9: the body of a test applied by hand sits in the mock's `.v13-na-body`, which `.v13-na.is-applied` shows. */
function AppliedBody({ applied, children }: { applied: boolean; children: ReactNode }) {
  return applied ? <div className="v13-na-body">{children}</div> : <>{children}</>;
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
    // Batch e23t (Story 23.15): a value corrected to 75 °C stands under its reading, the kernel's words ("A 75 °C: 1,17 Ω calc.").
    const corrected = test.temperature === undefined || (cell.corrected ?? null) === null ? null : (
      <p className="card-dims corrected-line" data-corrected-line={`${cell.address.row}/${cell.address.col}`}>
        {test.temperature.cellLead} <b className="t-value">{cell.corrected!.text}</b>
        <span className="calc-mark" aria-hidden="true">
          {ui.measurementField.calcMark}
        </span>
        <span className="visually-hidden">{ui.measurementField.calcSpoken}</span>
      </p>
    );
    if (readOnly) {
      return (
        <>
          <ReadOnlyMeasurementField cell={cell} label={label} />
          {corrected}
        </>
      );
    }
    return (
      <>
        <MeasurementField api={api} cell={cell} label={label} presentation={presentation} missing={cell.missing} onRun={onRun} />
        {corrected}
      </>
    );
  };

  return (
    <div className="ficha-mt" data-table-key={test.testKey}>
      <div className="mt-title-row">
        {/* Story 24.9 (F17): the screen's line names each criterion by its medium while the medium is unknown. */}
        <span className="mt-criterion">{test.screenCriterionText ?? test.criterionText}</span>
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
