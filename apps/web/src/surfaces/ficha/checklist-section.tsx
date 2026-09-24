import {
  checklistResultOf,
  checklistUnsetItems,
  insertPhrase,
  itensMarcadosConformeText,
  recentChecklistObservations,
  repeatChecklistPattern,
  repeatChecklistSource,
  type BlockDefinition,
  type BlockRow,
  type ChecklistItem,
  type EquipmentRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useId, useRef, useState } from 'react';
import { Chip, OverflowMenu, TextButton, TriStateControl, type OverflowMenuAction, type TriStateValue } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { FichaApi } from './ficha-api.ts';
import { useTypedText } from './ficha-fields.tsx';
import { checklistObservationOp, checklistResultOp } from './ficha-ops.ts';
import { useSheetReadOnly } from './sheet-read-only.tsx';

/*
 * Story 5.4 (FR-25, FR-26, UX-DR36-38, UX-DR44; `60-ficha.html` "Verificações gerais"):
 * the Bulk action bar at the head of the list, the legend (open on the session's first
 * checklist only), and one 56 px Checklist row per item with its Tri-state control and
 * Overflow ("Limpar", "Observação"). NA defaults show NA with no cell of their own; nothing
 * is ever pre-marked C. An NC row expands to its chips (the seed's phrases plus the five
 * most recent observations typed for the item in this relatório) and the required
 * Observation field. The row's "Adicionar foto" / "Criar ponto de atenção" slot is Epic
 * 6's, and the Dictation button has no engine: both absent, never disabled.
 */

/** sessionStorage: the block whose checklist opened the legend in this session. */
const LEGEND_KEY = 'ficha:legend-first';

/** The legend heads the first checklist of the session only (EXPERIENCE.md › Checklist row). */
function legendOpensHere(blockId: string): boolean {
  try {
    const first = sessionStorage.getItem(LEGEND_KEY);
    if (first === null) {
      sessionStorage.setItem(LEGEND_KEY, blockId);
      return true;
    }
    return first === blockId;
  } catch {
    return true;
  }
}

export interface ChecklistBulk {
  /** How many rows "Marcar os restantes como Conforme" would set. */
  unset: number;
  markRest: () => void;
  /** The concluded sheet "Repetir" copies from, or null. */
  source: BlockRow | null;
  repeat: () => void;
}

/** The two bulk actions (UX-DR36), shared by the list head and the Sticky action bar's mirror. */
export function useChecklistBulk(api: FichaApi, snapshot: RelatorioSnapshot, block: BlockRow, equipment: readonly EquipmentRow[]): ChecklistBulk {
  const t = copy.ficha.checklist;
  const unset = checklistUnsetItems(block).length;
  const source = repeatChecklistSource(snapshot, block.id);
  return {
    unset,
    source,
    markRest: () => {
      let n = 0;
      void api
        .edit((blocks, by) => {
          const fresh = blocks.find((row) => row.id === block.id);
          if (fresh === undefined) return null;
          const keys = checklistUnsetItems(fresh);
          n = keys.length;
          return keys.map((key) => checklistResultOp(by, api.relatorioId, block.id, key, 'C'));
        })
        .then((batch) => api.undoable(itensMarcadosConformeText(n), batch))
        .catch(() => undefined);
    },
    repeat: () => {
      let tag = '';
      void api
        .edit((blocks, by) => {
          const fresh = blocks.find((row) => row.id === block.id);
          const from = repeatChecklistSource({ blocks: blocks.filter((row) => row.relatorio_id === api.relatorioId && row.removed_at === null) }, block.id);
          if (fresh === undefined || from === null) return null;
          tag = equipment.find((row) => row.id === from.equipment_id)?.tag ?? '';
          const pattern = repeatChecklistPattern(from, fresh);
          if (pattern.length === 0) api.announce(t.repeatNothing);
          return pattern.map((entry) => checklistResultOp(by, api.relatorioId, block.id, entry.itemKey, entry.value));
        })
        .then((batch) => api.undoable(t.repeated(tag), batch))
        .catch(() => undefined);
    },
  };
}

/** The Bulk action bar; `compact` is the Sticky action bar's mirror (the first action only). */
export function BulkActionBar({ bulk, compact = false }: { bulk: ChecklistBulk; compact?: boolean }) {
  const t = copy.ficha.checklist;
  const markIcon = (
    <svg className="ico" aria-hidden="true">
      <use href="/sprite.svg#i-check-all" />
    </svg>
  );
  return (
    <div className={compact ? 'bulk-action-bar is-compact' : 'bulk-action-bar'} role="group" aria-label={t.bulkLabel}>
      <div className="bulk-action">
        <TextButton onPress={bulk.markRest} isDisabled={bulk.unset === 0} disabledReason={t.allMarked}>
          {markIcon}
          {t.markRest}
        </TextButton>
      </div>
      {compact ? null : (
        <div className="bulk-action">
          <TextButton onPress={bulk.repeat} isDisabled={bulk.source === null} disabledReason={t.noConcluded}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-repeat" />
            </svg>
            {t.repeat}
          </TextButton>
        </div>
      )}
    </div>
  );
}

export function ChecklistSection({
  api,
  snapshot,
  block,
  definition,
  bulk,
  sectionRef,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  bulk: ChecklistBulk;
  sectionRef?: (element: HTMLElement | null) => void;
}) {
  const t = copy.ficha.checklist;
  const headingId = useId();
  const readOnly = useSheetReadOnly();
  const [legendOpen] = useState(() => legendOpensHere(block.id));
  const items = definition.checklist;
  if (items === null || items.length === 0) return null;
  return (
    <section className={readOnly ? 'section is-readonly' : 'section'} aria-labelledby={headingId} ref={sectionRef}>
      <div className="section-head">
        <h2 id={headingId}>{t.title}</h2>
        {readOnly ? <span className="btn-reason">{t.readOnlyReason}</span> : null}
      </div>
      {readOnly ? null : <BulkActionBar bulk={bulk} />}
      <details className="ficha-details ficha-legend" open={legendOpen}>
        <summary>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-chev-down" />
          </svg>
          {t.legend}
        </summary>
        <p className="checklist-legend">{t.legendText}</p>
      </details>
      <ul className="checklist">
        {items.map((item, index) => (
          <ChecklistRow
            key={item.key}
            api={api}
            block={block}
            item={item}
            number={index + 1}
            recents={recentChecklistObservations(snapshot, item.key, item.nc_phrases)}
            readOnly={readOnly}
          />
        ))}
      </ul>
    </section>
  );
}

function ChecklistRow({
  api,
  block,
  item,
  number,
  recents,
  readOnly,
}: {
  api: FichaApi;
  block: BlockRow;
  item: ChecklistItem;
  number: number;
  recents: readonly string[];
  readOnly: boolean;
}) {
  const t = copy.ficha.checklist;
  const result = checklistResultOf(block, item.key);
  // A `na_defaults` row shows NA with no cell of its own (checklistResultOf's display
  // default) -- the first tap on it must still commit a real cell (spec Design Notes).
  const resultCommitted = block.sheet.checklist[item.key]?.result !== undefined;
  const observationCell = block.sheet.checklist[item.key]?.observation;
  const stored = typeof observationCell?.value === 'string' ? observationCell.value : '';
  const [observationOpen, setObservationOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const fieldId = useId();
  const reasonId = useId();
  const name = `${number}. ${item.label}`;
  const typed = useTypedText(
    stored,
    (text) =>
      api.author === null ? undefined : api.commit([checklistObservationOp(api.author, api.relatorioId, block.id, item.key, text.trim() === '' ? null : text)]),
    { entityId: block.id, field: `obs-${item.key.replace(/_/g, '-')}` },
  );
  const nc = result === 'NC';
  const empty = typed.text.trim() === '';
  // The reason line goes once text exists (EXPERIENCE.md › Observation field); a
  // not-tested row is read-only end to end (AR-17), so nothing on it is ever required.
  const required = !readOnly && nc && empty;
  const expanded = nc || observationOpen || stored.trim() !== '';

  const choose = (value: TriStateValue | null) => {
    void api.edit((_blocks, by) => [checklistResultOp(by, api.relatorioId, block.id, item.key, value)]).catch(() => undefined);
  };

  const insert = (phrase: string) => {
    const element = area.current;
    const caret = element?.selectionStart ?? typed.text.length;
    const next = insertPhrase(typed.text, phrase, caret);
    typed.set(next.text);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const menu: OverflowMenuAction[] = [];
  if (result !== null) menu.push({ id: 'clear', label: t.clear, onAction: () => choose(null) });
  menu.push({
    id: 'observation',
    label: t.observation,
    onAction: () => {
      setObservationOpen(true);
      requestAnimationFrame(() => area.current?.focus());
    },
  });

  return (
    <li className="checklist-row" data-item-key={item.key} data-missing-field={result === null ? '' : undefined}>
      <div className="row-main">
        <span className="row-label">
          <span className="row-num">{number}.</span>
          {item.label}
        </span>
        <TriStateControl value={result} onChange={choose} committed={resultCommitted} aria-label={name} readOnly={readOnly} />
        <OverflowMenu name={item.label} items={menu} />
      </div>
      {expanded ? (
        <div className="row-expand">
          {nc && !readOnly ? (
            <div className="chip-row" role="group" aria-label={t.chipsLabel(number)}>
              {[...item.nc_phrases, ...recents].map((phrase) => (
                <Chip key={phrase} onPress={() => insert(phrase)}>
                  {phrase}
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="field">
            <label className="field-label" htmlFor={fieldId}>
              {t.observationLabel(number)}
            </label>
            <textarea
              id={fieldId}
              ref={area}
              className="observation-field"
              value={typed.text}
              readOnly={readOnly}
              data-required={required ? '' : undefined}
              data-missing-field={required ? '' : undefined}
              aria-invalid={required || undefined}
              aria-describedby={required ? reasonId : undefined}
              onChange={(event) => typed.change(event.target.value)}
              onBlur={typed.blur}
            />
            {required ? (
              <span className="helper" data-tone="red" id={reasonId}>
                {t.observationRequired}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
