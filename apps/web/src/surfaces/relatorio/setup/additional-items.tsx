import { additionalItemsWithoutBlanks, sameAdditionalItems, textCapOf, withoutAdditionalItem } from '@app/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { CharCount, OverflowMenu, TextButton } from '../../../components/index.ts';
import { copy } from '../../../copy/pt-br.ts';
import { restoreFocus } from '../../../input/focus-restore.ts';
import { useFieldCommit } from '../../../input/use-field-commit.ts';
import type { UndoableEdits } from '../../../state/use-undoable-edits.ts';
import { spriteHref } from '../../../styles/sprite.ts';

/*
 * Story 28.9 (seed v18, B-15, contract 59; `50-relatorio-setup.html` `#setup-e28-items`, the exclusion list's pattern):
 * the relatório's "Itens adicionais" under the parecer of Etapa 6. Each row is one item, numbered, with an Overflow
 * whose "Remover" writes the list without it at once, with "Desfazer". "Adicionar item" opens an empty row, focused;
 * the list is stored as typed, every blank row left out (`additionalItemsWithoutBlanks`, the kernel's rule), so an
 * empty row is never stored. Etapa 6 draws this only on a seed whose rules offer the items (`offersAdditionalItems`).
 */

/** Story 20.9 and 28.9: each item is capped as the long texts are (`SETUP_VALUE_RULES`). */
const ITEM_CAP = textCapOf('relatorio/setup', 'additional_items');

/** A content key for a stored list, so a resync compares what changed, not which array it lives in. */
const keyOf = (items: readonly string[]): string => JSON.stringify(items);

export function AdditionalItems({
  stored,
  onWrite,
  undoable,
}: {
  /** `setup.additional_items` as the store holds it. */
  stored: readonly string[];
  /** Writes the whole list now, as its own batch; resolves to the batch id, null when nothing was written. */
  onWrite: (value: string[]) => Promise<string | null>;
  undoable: UndoableEdits['undoable'];
}) {
  const t = copy.setup;
  const labelId = useId();
  const [rows, setRows] = useState<string[]>(() => [...stored]);
  // `committed`: the list this page last wrote (or found stored), set at once when it writes. `pending`: its writes not
  // seen back yet, in order, so its own write coming back through the live query (even an earlier one of two quick
  // writes) is not read as another device's change. `observed`: the stored list last seen. A stored list that changes to
  // anything but one of this page's pending writes (another device, an undo) resyncs the rows.
  const committed = useRef(keyOf(stored));
  const pending = useRef<string[]>([]);
  const observed = useRef(keyOf(stored));
  const storedKey = keyOf(stored);
  if (storedKey !== observed.current) {
    observed.current = storedKey;
    const own = pending.current.indexOf(storedKey);
    if (own === -1) {
      pending.current = [];
      committed.current = storedKey;
      setRows([...stored]);
    } else {
      pending.current = pending.current.slice(own + 1);
    }
  }
  // A stable key per row, so removing one never hands its field (focus, DOM) to the neighbour below (W-12).
  const rowKeys = useRef<string[]>([]);
  while (rowKeys.current.length < rows.length) rowKeys.current.push(newRowKey());
  if (rowKeys.current.length > rows.length) rowKeys.current = rowKeys.current.slice(0, rows.length);

  /** The list to store for these rows, written only when it differs from the stored one. */
  async function store(next: readonly string[]): Promise<string | null> {
    const kept = additionalItemsWithoutBlanks(next);
    if (sameAdditionalItems(kept, JSON.parse(committed.current) as string[])) return null;
    const before = committed.current;
    const key = keyOf(kept);
    committed.current = key;
    pending.current = [...pending.current, key];
    const batchId = await onWrite(kept).catch(() => null);
    // Nothing was written (refused, or the role may not write): the store still holds the old list.
    if (batchId === null) {
      committed.current = before;
      pending.current = pending.current.filter((one) => one !== key);
    }
    return batchId;
  }

  const committer = useFieldCommit<string[]>({ commit: (value) => store(value).then(() => undefined) });

  const listRef = useRef<HTMLUListElement>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  useEffect(() => {
    if (focusRow === null) return;
    listRef.current?.querySelectorAll<HTMLTextAreaElement>(':scope > li textarea')[focusRow]?.focus();
    setFocusRow(null);
  }, [focusRow]);

  function onChange(index: number, value: string): void {
    const next = rows.slice();
    next[index] = value;
    setRows(next);
    committer.change(next);
  }

  function onAdd(): void {
    committer.flush();
    setRows([...rows, '']);
    setFocusRow(rows.length);
  }

  const addButton = (): HTMLElement | null => listRef.current?.parentElement?.querySelector<HTMLElement>(':scope > .row > .btn') ?? null;
  const triggerAt = (index: number): HTMLElement | null => listRef.current?.querySelectorAll<HTMLElement>(':scope > li .overflow-trigger')[index] ?? null;

  async function onRemove(index: number): Promise<void> {
    committer.flush();
    const before = rows;
    const keysBefore = rowKeys.current;
    const next = withoutAdditionalItem(rows, index);
    rowKeys.current = keysBefore.filter((_, i) => i !== index);
    setRows(next);
    const focusAfter = () => restoreFocus(() => triggerAt(index) ?? triggerAt(index - 1) ?? addButton(), { mode: 'settled' });
    // A blank row was never stored: it goes with nothing written and nothing to undo.
    if (before[index]!.trim() === '') {
      focusAfter();
      return;
    }
    const batchId = await store(next);
    if (batchId === null) {
      rowKeys.current = keysBefore;
      setRows(before);
      return;
    }
    focusAfter();
    undoable(t.additionalItemRemoved(index + 1), batchId, {
      label: t.undo,
      onUndo: () => restoreFocus(() => triggerAt(index), { mode: 'settled' }),
    });
  }

  return (
    <div className="e28-items" id="setup-e28-items" role="group" aria-labelledby={labelId}>
      <span className="field-label" id={labelId}>
        {t.additionalItemsLabel}
      </span>
      <p className="section-note">{t.additionalItemsNote}</p>
      {rows.length === 0 ? <p className="section-note e28-empty">{t.additionalItemsEmpty}</p> : null}
      <ul className="exclusion-list" aria-label={t.additionalItemsLabel} ref={listRef} hidden={rows.length === 0}>
        {rows.map((text, i) => (
          <li key={rowKeys.current[i]}>
            <span className="exclusion-num" aria-hidden="true">
              {i + 1}.
            </span>
            <div className="field grow">
              <textarea
                className="input"
                rows={1}
                aria-label={t.additionalItemFieldLabel(i + 1)}
                placeholder={t.additionalItemPlaceholder}
                value={text}
                maxLength={ITEM_CAP ?? undefined}
                onChange={(event) => onChange(i, event.target.value)}
                onBlur={() => committer.blur()}
              />
              <CharCount length={text.length} cap={ITEM_CAP} />
            </div>
            <OverflowMenu
              name={t.additionalItemFieldLabel(i + 1)}
              label={t.additionalItemMenuLabel(i + 1)}
              items={[]}
              destructiveItems={[{ id: 'remove', label: t.removeAdditionalItem, onAction: () => void onRemove(i) }]}
            />
          </li>
        ))}
      </ul>
      <div className="row">
        <TextButton onPress={onAdd}>
          <svg className="ico" aria-hidden="true">
            <use href={spriteHref('i-plus')} />
          </svg>
          {t.addAdditionalItem}
        </TextButton>
      </div>
      <span className="helper">{t.additionalItemsHelper}</span>
    </div>
  );
}

let rowKeySeq = 0;
/** W-12: a key for one item row, unique on this page. */
function newRowKey(): string {
  rowKeySeq += 1;
  return `additional-item-${rowKeySeq}`;
}
