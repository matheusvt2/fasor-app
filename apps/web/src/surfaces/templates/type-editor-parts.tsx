import {
  addDraftField,
  addDraftItem,
  addDraftMeasurementRow,
  addDraftTest,
  CRITERION_RULE_WORDS,
  CRITERION_RULES,
  criterionRulesFor,
  criterionUsedByText,
  FIELD_KIND_WORDS,
  FIELD_KINDS,
  fieldSummaryText,
  formatCriterionValue,
  grammarHintText,
  grammarTaken,
  itemSummaryText,
  moveDraftEntry,
  ncPhrasesFull,
  parseDecimalPtBr,
  plateCriterionOf,
  removeDraftEntry,
  removeDraftMeasurementRow,
  SEED_VERSION,
  setDraftNoun,
  setDraftText,
  suggestedTagHelperText,
  TEST_GRAMMARS,
  testSummaryText,
  updateDraftCriterion,
  updateDraftField,
  updateDraftItem,
  updateDraftMeasurementRow,
  updateDraftTest,
  type CompanyCriterionOperator,
  type CompanyTypeDraft,
  type DraftFieldKind,
  type DraftListPart,
  TEST_GRAMMAR_WORDS,
  type TestGrammar,
  type TypeDraftIssue,
} from '@app/domain';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Chip, FormDialog, OverflowMenu, SegmentedControl, TextButton, Toggle, TriStateControl, type OverflowMenuAction, type TriStateValue } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

/*
 * Story 14.7: the tab panels of the type editor (`43-tipo-equipamento.html`). Each control hands
 * one kernel edit (`types/draft-edit.ts`) to `edit`, which writes the whole draft; a text input
 * writes when it is left (blur or Enter) or goes (a tab change, fix batch e22h B2), a choice at once. The kernel's issues (`validateTypeDraft`)
 * show inline beside the part they name, as the mock's red helper.
 */

export type DraftEdit = (change: (draft: CompanyTypeDraft | null) => CompanyTypeDraft) => void;

interface PanelProps {
  draft: CompanyTypeDraft | null;
  issues: readonly TypeDraftIssue[];
  edit: DraftEdit;
}

const t = copy.typeEditor;
type Entry = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const listOf = (draft: CompanyTypeDraft | null, part: string): Entry[] => {
  const list = (draft as Record<string, unknown> | null)?.[part];
  return Array.isArray(list) ? (list as Entry[]) : [];
};

/** The issues whose path starts with `prefix` (the part a control edits). */
function issuesAt(issues: readonly TypeDraftIssue[], prefix: readonly (string | number)[], exact = false): TypeDraftIssue[] {
  return issues.filter((issue) => (exact ? issue.path.length === prefix.length : issue.path.length >= prefix.length) && prefix.every((segment, i) => issue.path[i] === segment));
}

/** The mock's red helper, one per issue. */
function IssueLines({ issues }: { issues: readonly TypeDraftIssue[] }) {
  const unique = [...new Set(issues.map((issue) => issue.message))];
  return (
    <>
      {unique.map((message) => (
        <span key={message} className="helper" data-tone="red" data-type-issue="">
          {message}
        </span>
      ))}
    </>
  );
}

const icon = (name: string) => (
  <svg className="ico" aria-hidden="true">
    <use href={`/sprite.svg#${name}`} />
  </svg>
);

interface TextInputProps {
  value: string;
  onCommit: (value: string) => void;
  label?: string;
  'aria-label'?: string;
  placeholder?: string;
  className?: string;
  inputMode?: 'decimal' | 'text';
  describedBy?: string;
}

/**
 * Fix batch e22h (B2): what an `.input` of the editor keeps while it is typed in. It writes when
 * left (blur or Enter) and when it goes (its panel unmounts on a tab change before a blur reaches
 * React), never an unchanged value (React StrictMode runs the unmount cleanup once at mount) and
 * never the same value twice; a new value from the draft replaces it while it is not focused.
 */
function useCommittedText(value: string, onCommit: (value: string) => void) {
  const [typed, setTyped] = useState(value);
  const [focused, setFocused] = useState(false);
  const latest = useRef({ typed: value, value, onCommit, sent: null as string | null });
  useEffect(() => {
    latest.current.value = value;
    latest.current.onCommit = onCommit;
  });
  useEffect(() => {
    if (focused) return;
    setTyped(value);
    latest.current.typed = value;
    latest.current.sent = null;
  }, [value, focused]);
  const flush = useCallback(() => {
    const now = latest.current;
    if (now.typed === now.value || now.typed === now.sent) return;
    now.sent = now.typed;
    now.onCommit(now.typed);
  }, []);
  useEffect(() => flush, [flush]);
  return {
    typed,
    onFocus: () => setFocused(true),
    onChange: (next: string) => {
      latest.current.typed = next;
      setTyped(next);
    },
    onBlur: () => {
      flush();
      setFocused(false);
    },
  };
}

/** An `.input` that keeps what is typed and writes it when left or unmounted (`useCommittedText`). */
function TextInput({ value, onCommit, placeholder, className = 'input', inputMode, describedBy, id, ...rest }: TextInputProps & { id?: string }) {
  const text = useCommittedText(value, onCommit);
  return (
    <input
      id={id}
      className={className}
      value={text.typed}
      placeholder={placeholder}
      inputMode={inputMode}
      aria-label={id === undefined ? (rest['aria-label'] ?? rest.label) : undefined}
      aria-describedby={describedBy}
      onFocus={text.onFocus}
      onChange={(event) => text.onChange(event.target.value)}
      onBlur={text.onBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** A `.field` with its label, input, helper and issues. */
function TextField({ label, value, onCommit, helper, issues = [], className = 'field', placeholder }: { label: string; value: string; onCommit: (value: string) => void; helper?: ReactNode; issues?: readonly TypeDraftIssue[]; className?: string; placeholder?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <TextInput id={id} value={value} onCommit={onCommit} placeholder={placeholder} />
      {helper === undefined ? null : <span className="helper">{helper}</span>}
      <IssueLines issues={issues} />
    </div>
  );
}

/** A native select in the mock's `.field.combobox`. */
function SelectField<Value extends string>({ label, value, options, onChange, hideLabel = false }: { label: string; value: Value | ''; options: readonly { value: Value; label: string }[]; onChange: (value: Value) => void; hideLabel?: boolean }) {
  const id = useId();
  return (
    <div className="field combobox">
      <label className={hideLabel ? 'field-label visually-hidden' : 'field-label'} htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value as Value)}>
        {value === '' ? <option value="" /> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="combobox-chevron" aria-hidden="true">
        {icon('i-chev-down')}
      </span>
    </div>
  );
}

/**
 * Chips of a list of words (select options, NC phrases), each removed by a tap, and the add input
 * with the add-chip; `full` (the kernel's `ncPhrasesFull`) hides the input. Fix batch e22h (B2): a
 * word typed and not yet added is added when the input goes (a tab change unmounts the panel).
 */
function ChipList({ words, onChange, full = false, addLabel, addWord, removeLabel }: { words: readonly string[]; onChange: (words: string[]) => void; full?: boolean; addLabel: string; addWord: string; removeLabel: (word: string) => string }) {
  const [typed, setTyped] = useState('');
  const latest = useRef({ typed: '', words, onChange, full });
  useEffect(() => {
    latest.current.words = words;
    latest.current.onChange = onChange;
    latest.current.full = full;
  });
  const add = () => {
    const word = latest.current.typed.trim();
    if (word === '' || latest.current.full) return;
    latest.current.typed = '';
    latest.current.onChange([...latest.current.words, word]);
    setTyped('');
  };
  useEffect(
    () => () => {
      const now = latest.current;
      const word = now.typed.trim();
      if (word === '' || now.full) return;
      now.typed = '';
      now.onChange([...now.words, word]);
    },
    [],
  );
  const type = (next: string) => {
    latest.current.typed = next;
    setTyped(next);
  };
  return (
    <div className="chip-row">
      {words.map((word, i) => (
        <Chip key={`${i}:${word}`} aria-label={removeLabel(word)} onPress={() => onChange(words.filter((_, j) => j !== i))}>
          {word}
          {icon('i-close')}
        </Chip>
      ))}
      {full ? null : (
        <>
          <input
            className="input chip-input"
            aria-label={addLabel}
            value={typed}
            onChange={(event) => type(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="chip chip-add" onClick={add}>
            {icon('i-plus')}
            {addWord}
          </button>
        </>
      )}
    </div>
  );
}

/** Subir · Descer · Remover of one entry of a list. */
function rowMenu(edit: DraftEdit, part: DraftListPart, index: number, count: number, onRemoved: () => void): { items: OverflowMenuAction[]; destructiveItems: OverflowMenuAction[] } {
  const items: OverflowMenuAction[] = [];
  if (index > 0) items.push({ id: 'up', label: t.moveUp, onAction: () => edit((d) => moveDraftEntry(d, part, index, index - 1)) });
  if (index < count - 1) items.push({ id: 'down', label: t.moveDown, onAction: () => edit((d) => moveDraftEntry(d, part, index, index + 1)) });
  return {
    items,
    destructiveItems: [
      {
        id: 'remove',
        label: t.remove,
        onAction: () => {
          onRemoved();
          edit((d) => removeDraftEntry(d, part, index));
        },
      },
    ],
  };
}

// --- Identificação ---------------------------------------------------------------------------------

export function IdentityPanel({ draft, issues, edit, nextVersion }: PanelProps & { nextVersion: number }) {
  const genderId = useId();
  const noun = (draft?.noun ?? {}) as { singular?: string; plural?: string; gender?: 'm' | 'f' };
  return (
    <div>
      <div className="banner" data-variant="info" role="note">
        <span className="banner-text">{t.autosaveBanner(nextVersion)}</span>
      </div>
      <div className="field-grid">
        <TextField className="field span-2" label={t.nameLabel} value={text(draft?.label)} helper={t.nameHelper} issues={issuesAt(issues, ['label'])} onCommit={(value) => edit((d) => setDraftText(d, 'label', value))} />
        <TextField label={t.prefixLabel} value={text(draft?.tag_prefix)} helper={suggestedTagHelperText(draft?.tag_prefix)} issues={issuesAt(issues, ['tag_prefix'])} onCommit={(value) => edit((d) => setDraftText(d, 'tag_prefix', value))} />
        <div className="field">
          <span className="field-label">{t.printGroupLabel}</span>
          <div className="input is-readonly">{t.printGroupValue}</div>
        </div>
        <TextField className="field span-2" label={t.printTitleLabel} value={text(draft?.print_title)} helper={t.printTitleHelper} issues={issuesAt(issues, ['print_title'])} onCommit={(value) => edit((d) => setDraftText(d, 'print_title', value))} />
        <TextField label={t.singularLabel} value={text(noun.singular)} issues={issuesAt(issues, ['noun', 'singular'])} onCommit={(value) => edit((d) => setDraftNoun(d, { singular: value }))} />
        <TextField label={t.pluralLabel} value={text(noun.plural)} issues={issuesAt(issues, ['noun', 'plural'])} onCommit={(value) => edit((d) => setDraftNoun(d, { plural: value }))} />
        <div className="field span-2">
          <span className="field-label" id={genderId}>
            {t.genderLabel}
          </span>
          <SegmentedControl
            aria-labelledby={genderId}
            value={noun.gender ?? ('' as 'm')}
            onChange={(gender) => edit((d) => setDraftNoun(d, { gender }))}
            options={[
              { value: 'm', label: t.masculine },
              { value: 'f', label: t.feminine },
            ]}
          />
          <span className="helper">{t.genderHelper}</span>
          <IssueLines issues={[...issuesAt(issues, ['noun', 'gender']), ...issuesAt(issues, ['noun'], true)]} />
        </div>
      </div>
    </div>
  );
}

// --- the list of a tab (Placa, Verificações, Ensaios) ---------------------------------------------------

interface ListRow {
  key: string;
  name: string;
  secondary: string;
  issues: TypeDraftIssue[];
  menu: { items: OverflowMenuAction[]; destructiveItems: OverflowMenuAction[] };
  editor: ReactNode;
  editLabel: string;
}

/** `.registry-list` of rows, one open below itself (`.registry-row.is-open` + `.def-edit`). */
function RowList({ label, rows, open, setOpen }: { label: string; rows: readonly ListRow[]; open: string | null; setOpen: (key: string | null) => void }) {
  return (
    <ul className="registry-list" aria-label={label}>
      {rows.flatMap((row) => {
        const isOpen = open === row.key;
        const out = [
          <li key={row.key} className={isOpen ? 'registry-row is-open' : 'registry-row'} data-entry-key={row.key}>
            <button type="button" className="rr-text" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.key)}>
              <span className="rr-primary">{row.name}</span>
              <span className="rr-secondary">{row.secondary}</span>
              {isOpen ? null : <IssueLines issues={row.issues} />}
            </button>
            <OverflowMenu name={row.name} items={row.menu.items} destructiveItems={row.menu.destructiveItems} />
          </li>,
        ];
        if (isOpen) {
          out.push(
            <li key={`${row.key}:edit`} className="def-edit" aria-label={row.editLabel}>
              {row.editor}
              <IssueLines issues={row.issues} />
            </li>,
          );
        }
        return out;
      })}
    </ul>
  );
}

// --- Placa ---------------------------------------------------------------------------------------

export function NameplatePanel({ draft, issues, edit }: PanelProps) {
  const fields = listOf(draft, 'nameplate');
  const [open, setOpen] = useState<string | null>(null);
  const rows: ListRow[] = fields.map((field, index) => {
    const name = text(field.label).trim() === '' ? `${t.fieldLabel} ${index + 1}` : text(field.label);
    const kind = field.kind as DraftFieldKind | undefined;
    const options = Array.isArray(field.options) ? (field.options as string[]) : [];
    return {
      key: `nameplate:${index}`,
      name,
      secondary: fieldSummaryText(field),
      issues: issuesAt(issues, ['nameplate', index]),
      menu: rowMenu(edit, 'nameplate', index, fields.length, () => setOpen(null)),
      editLabel: t.editFieldLabel(name),
      editor: (
        <div className="field-grid">
          <TextField label={t.fieldLabel} value={text(field.label)} onCommit={(value) => edit((d) => updateDraftField(d, index, { label: value }))} />
          <SelectField label={t.fieldKind} value={kind ?? ''} options={FIELD_KINDS.map((value) => ({ value, label: FIELD_KIND_WORDS[value] }))} onChange={(value) => edit((d) => updateDraftField(d, index, { kind: value }))} />
          {kind === 'select' ? (
            <div className="field span-2">
              <span className="field-label">{t.fieldOptions}</span>
              <ChipList words={options} onChange={(words) => edit((d) => updateDraftField(d, index, { options: words }))} addLabel={t.newOptionLabel} addWord={t.newOption} removeLabel={t.removeOption} />
              <span className="helper">{t.unitNotForList}</span>
            </div>
          ) : kind === 'number' || kind === 'voltage_class' ? (
            <TextField label={t.fieldUnit} value={text(field.unit)} onCommit={(value) => edit((d) => updateDraftField(d, index, { unit: value }))} />
          ) : null}
        </div>
      ),
    };
  });
  return (
    <section className="section" aria-labelledby="tipo-h-placa">
      <div className="section-head">
        <h2 id="tipo-h-placa">{t.nameplateHeading}</h2>
      </div>
      <p className="section-note">{t.nameplateNote}</p>
      <IssueLines issues={issuesAt(issues, ['nameplate'], true)} />
      <RowList label={t.nameplateList} rows={rows} open={open} setOpen={setOpen} />
      <TextButton
        onPress={() => {
          let index = 0;
          edit((d) => {
            const added = addDraftField(d);
            index = added.index;
            return added.draft;
          });
          setOpen(`nameplate:${index}`);
        }}
      >
        {icon('i-plus')}
        {t.addField}
      </TextButton>
    </section>
  );
}

// --- Verificações ------------------------------------------------------------------------------------

export function ChecklistPanel({ draft, issues, edit }: PanelProps) {
  const items = listOf(draft, 'checklist');
  const [open, setOpen] = useState<string | null>(null);
  const rows: ListRow[] = items.map((item, index) => {
    const phrases = Array.isArray(item.nc_phrases) ? (item.nc_phrases as string[]) : [];
    const label = text(item.label);
    return {
      key: `checklist:${index}`,
      name: `${index + 1}. ${label}`,
      secondary: itemSummaryText(item),
      issues: issuesAt(issues, ['checklist', index]),
      menu: rowMenu(edit, 'checklist', index, items.length, () => setOpen(null)),
      editLabel: t.editItemLabel(index + 1),
      editor: (
        <>
          <TextField label={t.itemText} value={label} onCommit={(value) => edit((d) => updateDraftItem(d, index, { label: value }))} />
          <div className="field">
            <span className="field-label">{t.itemPhrases}</span>
            <ChipList words={phrases} full={ncPhrasesFull(phrases)} onChange={(words) => edit((d) => updateDraftItem(d, index, { nc_phrases: words }))} addLabel={t.newPhraseLabel} addWord={t.newPhrase} removeLabel={t.removePhrase} />
            {ncPhrasesFull(phrases) ? <span className="helper">{t.phrasesFull}</span> : null}
          </div>
          <TextField label={t.itemHint} value={text(item.hint)} onCommit={(value) => edit((d) => updateDraftItem(d, index, { hint: value }))} />
        </>
      ),
    };
  });
  return (
    <section className="section" aria-labelledby="tipo-h-verif">
      <div className="section-head">
        <h2 id="tipo-h-verif">{t.checklistHeading}</h2>
      </div>
      <p className="section-note">{t.checklistNote}</p>
      <IssueLines issues={issuesAt(issues, ['checklist'], true)} />
      <RowList label={t.checklistList} rows={rows} open={open} setOpen={setOpen} />
      <TextButton
        onPress={() => {
          let index = 0;
          edit((d) => {
            const added = addDraftItem(d);
            index = added.index;
            return added.draft;
          });
          setOpen(`checklist:${index}`);
        }}
      >
        {icon('i-plus')}
        {t.addItem}
      </TextButton>
    </section>
  );
}

// --- Ensaios -------------------------------------------------------------------------------------

export function TestsPanel({ draft, issues, edit }: PanelProps) {
  const tests = listOf(draft, 'tests');
  const measurement = listOf(draft, 'measurement_tests');
  const criteria = listOf(draft, 'criteria');
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [grammar, setGrammar] = useState<TestGrammar>('medicoes');

  const seededRows: ListRow[] = tests.map((test, index) => {
    const name = text(test.label);
    return {
      key: `tests:${index}`,
      name,
      secondary: testSummaryText(draft, 'tests', index),
      issues: issuesAt(issues, ['tests', index]),
      menu: rowMenu(edit, 'tests', index, tests.length, () => setOpen(null)),
      editLabel: t.editTestLabel(name),
      editor: (
        <>
          <TextField label={t.testTitle} value={name} onCommit={(value) => edit((d) => updateDraftTest(d, 'tests', index, { label: value }))} />
          <p className="section-note">{t.seededTableNote}</p>
        </>
      ),
    };
  });
  const measurementRows: ListRow[] = measurement.map((test, index) => {
    const name = text(test.label);
    const rows = Array.isArray(test.rows) ? (test.rows as Entry[]) : [];
    const columns = Array.isArray(test.columns) ? (test.columns as Entry[]) : [];
    const testCriteria = Array.isArray(test.criteria) ? (test.criteria as Entry[]) : [];
    const columnLabel = columns.map((column) => text(column.label)).join(' · ');
    const criterionOf = (rowKey: string): string => {
      const named = testCriteria.find((criterion) => criterion.type === 'absolute' && Array.isArray(criterion.rows) && criterion.rows.includes(rowKey) && typeof criterion.seeded === 'string');
      const row = named === undefined ? undefined : criteria.find((criterion) => criterion.key === named.seeded);
      if (row === undefined || typeof row.value !== 'number' || typeof row.operator !== 'string') return text(named?.text);
      return formatCriterionValue({ operator: row.operator, value: row.value, ...(typeof row.value_max === 'number' ? { value_max: row.value_max } : {}), unit: typeof row.unit === 'string' ? row.unit : null });
    };
    return {
      key: `measurement_tests:${index}`,
      name,
      secondary: testSummaryText(draft, 'measurement_tests', index),
      issues: issuesAt(issues, ['measurement_tests', index]),
      menu: rowMenu(edit, 'measurement_tests', index, measurement.length, () => setOpen(null)),
      editLabel: t.editTestLabel(name),
      editor: (
        <>
          <div className="field-grid">
            <TextField label={t.testTitle} value={name} onCommit={(value) => edit((d) => updateDraftTest(d, 'measurement_tests', index, { label: value }))} />
          </div>
          <table className="data-table" aria-label={t.rowsTable}>
            <thead>
              <tr>
                <th scope="col">{t.rowColumn}</th>
                <th scope="col">{t.rowUnit}</th>
                <th scope="col">{columnLabel}</th>
                <th scope="col">{t.rowCriterion}</th>
                <th scope="col">
                  <span className="visually-hidden">{t.remove}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={`${r}:${text(row.key)}`} data-row-key={text(row.key)}>
                  <td data-label={t.rowColumn}>
                    <TextInput aria-label={`${t.rowColumn} ${r + 1}`} value={text(row.label)} onCommit={(value) => edit((d) => updateDraftMeasurementRow(d, index, r, { label: value }))} />
                  </td>
                  <td data-label={t.rowUnit}>
                    <TextInput aria-label={`${t.rowUnit} ${text(row.label)}`} value={text(row.unit)} onCommit={(value) => edit((d) => updateDraftMeasurementRow(d, index, r, { unit: value }))} />
                  </td>
                  <td data-label={columnLabel}>{fieldSummaryText({ kind: row.kind ?? 'number', unit: row.unit })}</td>
                  <td className="cell-crit" data-label={t.rowCriterion}>
                    {criterionOf(text(row.key))}
                  </td>
                  <td>
                    {rows.length > 1 ? (
                      <TextButton tone="red" aria-label={t.removeRow(text(row.label))} onPress={() => edit((d) => removeDraftMeasurementRow(d, index, r))}>
                        {icon('i-trash')}
                      </TextButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TextButton onPress={() => edit((d) => addDraftMeasurementRow(d, index))}>
            {icon('i-plus')}
            {t.addRow}
          </TextButton>
          <div className="toggle-row">
            <span>
              <span className="toggle-label">{t.optionalLabel}</span>
              <br />
              <span className="toggle-sub">{t.optionalSub}</span>
            </span>
            <Toggle isSelected={test.switchable !== undefined} aria-label={t.optionalLabel} onChange={(on) => edit((d) => updateDraftTest(d, 'measurement_tests', index, { switchable: on }))} />
          </div>
        </>
      ),
    };
  });

  const add = () => {
    let opened: string | null = null;
    edit((d) => {
      const added = addDraftTest(d, grammar, SEED_VERSION);
      if (added === null) return d ?? {};
      opened = `${added.part}:${added.index}`;
      return added.draft;
    });
    setPicking(false);
    setOpen(opened);
  };

  return (
    <section className="section" aria-labelledby="tipo-h-ensaios">
      <div className="section-head">
        <h2 id="tipo-h-ensaios">{t.testsHeading}</h2>
        <Button variant="secondary" onPress={() => setPicking(true)}>
          {icon('i-plus')}
          {t.addTest}
        </Button>
      </div>
      <p className="section-note">{t.testsNote}</p>
      <IssueLines issues={[...issuesAt(issues, ['tests'], true), ...issuesAt(issues, ['measurement_tests'], true), ...issuesAt(issues, ['config_fields'])]} />
      <RowList label={t.testsList} rows={[...seededRows, ...measurementRows]} open={open} setOpen={setOpen} />

      <FormDialog isOpen={picking} onOpenChange={setPicking} title={t.grammarTitle} className="grammar-dialog">
        <div className="grammar-list" role="radiogroup" aria-label={t.grammarGroup}>
          {TEST_GRAMMARS.map((option) => {
            const checked = grammar === option;
            const taken = grammarTaken(draft, option);
            return (
              <button
                key={option}
                type="button"
                className={checked ? 'option-row is-selected' : 'option-row'}
                role="radio"
                aria-checked={checked}
                aria-disabled={taken || undefined}
                onClick={() => {
                  if (!taken) setGrammar(option);
                }}
              >
                <span className={checked ? 'radio is-on' : 'radio'} aria-hidden="true" />
                <span className="og-text">
                  <span>{TEST_GRAMMAR_WORDS[option].label}</span>
                  <span className="og-hint">{grammarHintText(draft, option)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="dialog-actions">
          <Button variant="secondary" onPress={() => setPicking(false)}>
            {copy.types.cancel}
          </Button>
          <Button variant="primary" isDisabled={grammarTaken(draft, grammar)} disabledReason={grammarHintText(draft, grammar)} onPress={add}>
            {t.add}
          </Button>
        </div>
      </FormDialog>
    </section>
  );
}

// --- Critérios -----------------------------------------------------------------------------------

/** A number as typed in pt-BR ("0,5"), or null when blank or not a number. */
function numberOf(typed: string): number | null {
  const parsed = parseDecimalPtBr(typed);
  return parsed === null ? null : Number(parsed);
}

const numberText = (value: unknown): string => (typeof value === 'number' ? String(value).replace('.', ',') : '');

export function CriteriaPanel({ draft, issues, edit }: PanelProps) {
  const criteria = listOf(draft, 'criteria');
  // The rules the kernel allows for where the criterion is used (the rule held now stays listed, its issue said).
  const rulesOf = (key: string, current: CompanyCriterionOperator | undefined): CompanyCriterionOperator[] => {
    const allowed = criterionRulesFor(draft, key);
    return current === undefined || allowed.includes(current) ? allowed : CRITERION_RULES.filter((rule) => rule === current || allowed.includes(rule));
  };
  return (
    <section className="section" aria-labelledby="tipo-h-crit">
      <div className="section-head">
        <h2 id="tipo-h-crit">{t.criteriaHeading}</h2>
      </div>
      <p className="section-note">{t.criteriaNote}</p>
      <IssueLines issues={issuesAt(issues, ['criteria'], true)} />
      {criteria.length === 0 ? (
        <p className="section-note">{t.noCriteria}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t.colCriterion}</th>
              <th scope="col">{t.colRule}</th>
              <th scope="col">{t.colValue}</th>
              <th scope="col">{t.colSource}</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion, index) => {
              const name = text(criterion.label).trim() === '' ? `${t.colCriterion} ${index + 1}` : text(criterion.label);
              const operator = criterion.operator as CompanyCriterionOperator | undefined;
              const unit = typeof criterion.unit === 'string' ? criterion.unit : '';
              const source = (criterion.source ?? {}) as { name?: string; edition?: string | null };
              const usedBy = criterionUsedByText(draft, index);
              const at = (leaf: string) => issuesAt(issues, ['criteria', index, leaf]);
              // Fix batch e22h (S1): a criterion the plate picks, read-only; a row that judges nothing offers no edit.
              const plate = plateCriterionOf(draft, index);
              const readOnly = plate !== null && !plate.rowJudges;
              return (
                <tr key={`${index}:${text(criterion.key)}`} data-criterion-key={text(criterion.key)} data-plate-picked={plate === null ? undefined : ''}>
                  <td data-label={t.colCriterion}>
                    {name}
                    {usedBy === null ? null : <span className="helper used-by">{usedBy}</span>}
                    {plate === null ? null : (
                      <span className="plate-criterion" data-plate-criterion="">
                        <span className="helper">{plate.lead}</span>
                        <ul className="plate-lines">
                          {plate.lines.map((line) => (
                            <li key={line} className="helper">
                              {line}
                            </li>
                          ))}
                        </ul>
                        <span className="helper" data-tone={readOnly ? undefined : 'amber'}>
                          {plate.rowNote}
                        </span>
                      </span>
                    )}
                    <IssueLines issues={[...at('label'), ...issuesAt(issues, ['criteria', index], true)]} />
                  </td>
                  {readOnly ? (
                    <>
                      <td data-label={t.colRule}>{operator === undefined ? '' : CRITERION_RULE_WORDS[operator]}</td>
                      <td className="cell-crit" data-label={t.colValue}>
                        {typeof criterion.value === 'number' && operator !== undefined ? formatCriterionValue({ operator, value: criterion.value, ...(typeof criterion.value_max === 'number' ? { value_max: criterion.value_max } : {}), unit: unit === '' ? null : unit }) : ''}
                      </td>
                      <td className="cell-src" data-label={t.colSource}>
                        {[text(source.name), text(source.edition)].filter((part) => part.trim() !== '').join(' ')}
                        <IssueLines issues={at('source')} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td data-label={t.colRule}>
                        <SelectField hideLabel label={t.ruleLabel(name)} value={operator ?? ''} options={rulesOf(text(criterion.key), operator).map((value) => ({ value, label: CRITERION_RULE_WORDS[value] }))} onChange={(value) => edit((d) => updateDraftCriterion(d, index, { operator: value }))} />
                        <IssueLines issues={[...at('operator'), ...at('type')]} />
                      </td>
                      <td className="cell-crit" data-label={t.colValue}>
                        {operator === 'pass_fail' ? (
                          CRITERION_RULE_WORDS.pass_fail
                        ) : (
                          <div className="value-pair">
                            <TextInput className="input tabular" inputMode="decimal" aria-label={t.valueLabel(name)} value={numberText(criterion.value)} onCommit={(value) => edit((d) => updateDraftCriterion(d, index, { value: numberOf(value) }))} />
                            {operator === 'between' ? (
                              <>
                                <span className="unit">{t.and}</span>
                                <TextInput className="input tabular" inputMode="decimal" aria-label={t.valueMaxLabel(name)} value={numberText(criterion.value_max)} onCommit={(value) => edit((d) => updateDraftCriterion(d, index, { value_max: numberOf(value) }))} />
                              </>
                            ) : null}
                            {unit === '' ? null : <span className="unit">{unit}</span>}
                          </div>
                        )}
                        <IssueLines issues={[...at('value'), ...at('value_max'), ...at('unit')]} />
                      </td>
                      <td className="cell-src" data-label={t.colSource}>
                        <TextInput aria-label={t.sourceLabel(name)} placeholder={t.sourcePlaceholder} value={text(source.name)} onCommit={(value) => edit((d) => updateDraftCriterion(d, index, { source_name: value }))} />
                        <TextInput aria-label={t.editionLabel(name)} placeholder={t.editionPlaceholder} value={text(source.edition)} onCommit={(value) => edit((d) => updateDraftCriterion(d, index, { source_edition: value }))} />
                        <IssueLines issues={at('source')} />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="section-note rules-note">{t.criteriaRules}</p>
    </section>
  );
}

// --- Pré-visualização ---------------------------------------------------------------------------

/** The sheet as the field will see it with the current draft, drawn with the sheet's own markup; nothing here is saved. */
export function PreviewPanel({ draft }: { draft: CompanyTypeDraft | null }) {
  const [marks, setMarks] = useState<Record<number, TriStateValue | null>>({});
  const prefix = text(draft?.tag_prefix).trim() === '' ? '' : `${text(draft?.tag_prefix).trim()}-01`;
  const label = text(draft?.label);
  const fields = listOf(draft, 'nameplate');
  const items = listOf(draft, 'checklist');
  const tests = listOf(draft, 'tests');
  const measurement = listOf(draft, 'measurement_tests');
  return (
    <div>
      <p className="section-note">{t.previewNote}</p>
      <div className="preview-frame" aria-label={t.previewLabel(prefix)}>
        <div className="tipo-title">
          <h2>{[prefix, label].filter((part) => part !== '').join(' · ')}</h2>
        </div>
        {fields.length === 0 ? null : (
          <div className="field-grid">
            {fields.map((field, i) => (
              <div key={`${i}:${text(field.key)}`} className={field.kind === 'select' || field.kind === 'manufacturer' ? 'field combobox' : 'field'}>
                <span className="field-label">{text(field.label)}</span>
                <div className="input">
                  <span className="placeholder">{field.kind === 'select' || field.kind === 'manufacturer' ? t.choose : typeof field.unit === 'string' ? field.unit : ''}</span>
                </div>
                {field.kind === 'select' || field.kind === 'manufacturer' ? (
                  <span className="combobox-chevron" aria-hidden="true">
                    {icon('i-chev-down')}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {items.length === 0 ? null : (
          <ul className="checklist">
            {items.map((item, i) => {
              const name = `${i + 1}. ${text(item.label)}`;
              return (
                <li key={`${i}:${text(item.key)}`} className="checklist-row">
                  <div className="row-main">
                    <span className="row-label">
                      <span className="row-num">{i + 1}.</span>
                      {text(item.label)}
                    </span>
                    <TriStateControl aria-label={name} value={marks[i] ?? null} onChange={(value) => setMarks((m) => ({ ...m, [i]: value }))} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {tests.map((test, i) => (
          <p key={`t:${i}`} className="table-title">
            {text(test.label)}
          </p>
        ))}
        {measurement.map((test, i) => {
          const rows = Array.isArray(test.rows) ? (test.rows as Entry[]) : [];
          const columns = Array.isArray(test.columns) ? (test.columns as Entry[]) : [];
          // Fix batch e22h (N12): inside the ficha's horizontal scroller (`.ficha-mt`), so a wide table scrolls in its box, never the page.
          return (
            <div key={`m:${i}`} className="ficha-mt" data-preview-table="">
              <table className="measurement-table" aria-label={text(test.label)}>
                <thead>
                  <tr>
                    <th scope="col">{text(test.row_header)}</th>
                    {columns.map((column, c) => (
                      <th key={c} scope="col" className="col-value">
                        {text(column.label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r}>
                      <td className="cell-point">{text(row.label)}</td>
                      {columns.map((column, c) => (
                        <td key={c} className="cell-value">
                          <div className="measurement-field">
                            <span className="mf-value" />
                            <span className="mf-unit">{text(row.unit) || text(column.unit)}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
