import {
  checklistResultIsStored,
  checklistResultOf,
  checklistUnsetItems,
  confirmSuggestionOps,
  discardSuggestionOp,
  ncDraftFor,
  ncDraftUsarAnnouncement,
  insertPhrase,
  screenLabel,
  itensMarcadosConformeText,
  learnedBefore,
  ncChipPhrases,
  withPhotoTokens,
  ncRowPointText,
  ncObservationOnLeave,
  pointQuestionText,
  pointsAskedOnLeave,
  removePointOp,
  ncRowPointPositions,
  ncRowPointsText,
  recentChecklistObservations,
  repeatChecklistPattern,
  sheetChecklistPath,
  textCapOf,
  repeatChecklistSource,
  type BlockDefinition,
  type BlockRow,
  type ChecklistItem,
  type EquipmentRow,
  type NcRowOwner,
  type PointRow,
  type OpDraft,
  type RegistryRow,
  type RelatorioSnapshot,
  type SuggestionRow,
  snapshotDefinitionContext,
} from '@app/domain';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CharCount, Chip, OverflowMenu, TextButton, TriStateControl, type OverflowMenuAction, type TriStateValue } from '../../components/index.ts';
import { ConfirmDialog } from '../../components/confirm-dialog.tsx';
import { SuggestionBlock } from '../../components/suggestion-field.tsx';
import { copy } from '../../copy/pt-br.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import type { FichaApi } from './ficha-api.ts';
import { useTypedText } from './ficha-fields.tsx';
import { RowPhotoAction, RowPhotoList } from './photo-openers.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';
import { checklistObservationOp, checklistResultOp } from './ficha-ops.ts';
import { CreatePointAction } from '../points/create-point-action.tsx';
import type { PointSeed } from '../points/point-editor.tsx';
import type { Author } from '../relatorio/relatorio-ops.ts';
import { DictatedSuggestion, DictationButton, useProseDictation, useSpeechAvailable } from '../../speech/dictation.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';
import { LEGEND_KEY } from '../../state/user-storage.ts';

/*
 * Story 5.4 (FR-25, FR-26, UX-DR36-38, UX-DR44; `60-ficha.html` "Verificações gerais"):
 * the Bulk action bar at the head of the list, the legend (open on the session's first
 * checklist only), and one 56 px Checklist row per item with its Tri-state control and
 * Overflow ("Limpar", "Observação"). NA defaults show NA with no cell of their own; nothing
 * is ever pre-marked C. An NC row expands to its chips (the seed's phrases plus the five
 * most recent observations typed for the item in this relatório; Story 14.12 puts the
 * company's learned phrases of the type and item between them, `ncChipPhrases`) and the required
 * Observation field. Story 6.1 adds the NC row's "Adicionar foto" (the burst camera, the
 * caption "verificação de ⟨item⟩") and the item's Photo tile rows under the row's buttons;
 * Story 6.6 adds "Criar ponto de atenção" beside it (the point editor in a Form dialog,
 * pre-linked with the sheet's equipment and a token per photo of the item). Story 9.4 adds
 * the row's Dictation button ("Ditar observação do item N"): the dictated text waits under
 * the field as a Suggestion field and "Usar" appends it the way a chip does; hidden, never
 * disabled, with no engine or no signal.
 *
 * Story 9.5 (FR-75): an NC row whose photo was read shows the one-sentence draft above its
 * Observation field (the Suggestion field's block variant, "Rascunho pela foto", "Usar"):
 * "Usar" writes the observation with its `source_suggestion_id`; the first keystroke or chip
 * insert discards the draft and keeps what was typed. Which draft shows is the kernel's
 * (`ncDraftFor`: the row NC, its observation blank).
 *
 * Story 14.3: the row is not tied to a sheet. `ChecklistRow` draws and writes through a
 * `ChecklistRowTarget` (the entity holding the cells, the two op builders, the NC draft or
 * none, the point seed, the row's point mark, the recents), which the sheet supplies here
 * (`sheetRowTarget`) and "Verificações do local" supplies for a local
 * (`surfaces/local/verificacoes-surface.tsx`). `BulkActionBar` draws the first action alone
 * for a list with nothing to repeat from (`single`).
 */

/** Story 6.1: what the checklist rows need to shoot and show their photos. */
export interface ChecklistPhotos {
  /** Every photo of this sheet (the rows pick theirs by `item_key`). */
  tiles: readonly PhotoTile[];
  /** The capture target of an item's camera: the sheet, the item and its context caption. */
  target: (itemKey: string) => CaptureTarget;
  /** The error pill's retry (clears the error, runs "Sincronizar agora"). */
  retry: (fileId: string) => void;
  /** Story 6.4: the import path for an item (beside a denied camera). */
  addPhotos?: (itemKey: string) => void;
  /** Story 6.5: "Legendar" on a tile. */
  caption?: (tile: PhotoTile) => void;
}


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
  // e22h B1: a company sheet's checklist is its version's, from the snapshot.
  const definitions = snapshotDefinitionContext(snapshot);
  const unset = checklistUnsetItems(block, definitions).length;
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
          const keys = checklistUnsetItems(fresh, definitions);
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
          const pattern = repeatChecklistPattern(from, fresh, definitions);
          if (pattern.length === 0) api.announce(t.repeatNothing);
          return pattern.map((entry) => checklistResultOp(by, api.relatorioId, block.id, entry.itemKey, entry.value));
        })
        .then((batch) => api.undoable(t.repeated(tag), batch))
        .catch(() => undefined);
    },
  };
}

/** What the Bulk action bar needs of a list: how many rows the first action would set, and the action. */
export type BulkMarkRest = Pick<ChecklistBulk, 'unset' | 'markRest'>;

/**
 * The Bulk action bar; `compact` is the Sticky action bar's mirror (the first action only).
 * Story 14.3: `single` draws the first action alone at the head of a list that has no
 * "Repetir" (the site checklist, `61-verificacoes-local.html` `.vl-intro`), under `label`.
 */
export function BulkActionBar({
  bulk,
  compact = false,
  single = false,
  label,
}: {
  bulk: BulkMarkRest & Partial<Pick<ChecklistBulk, 'source' | 'repeat'>>;
  compact?: boolean;
  single?: boolean;
  /** The group's name; the sheet's own when omitted. */
  label?: string;
}) {
  const t = copy.ficha.checklist;
  const repeat = bulk.repeat;
  const markIcon = (
    <svg className="ico" aria-hidden="true">
      <use href="/sprite.svg#i-check-all" />
    </svg>
  );
  return (
    <div className={compact ? 'bulk-action-bar is-compact' : 'bulk-action-bar'} role="group" aria-label={label ?? t.bulkLabel}>
      <div className="bulk-action">
        <TextButton onPress={bulk.markRest} isDisabled={bulk.unset === 0} disabledReason={t.allMarked}>
          {markIcon}
          {t.markRest}
        </TextButton>
      </div>
      {compact || single || repeat === undefined ? null : (
        <div className="bulk-action">
          <TextButton onPress={repeat} isDisabled={(bulk.source ?? null) === null} disabledReason={t.noConcluded}>
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
  photos,
  pending = NO_PENDING,
  learned = NO_LEARNED,
  sectionRef,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  bulk: ChecklistBulk;
  photos?: ChecklistPhotos;
  /** Story 9.5: the device's pending suggestion rows of the relatório (the NC drafts among them). */
  pending?: readonly SuggestionRow[];
  /** Story 14.12: the company's learned NC phrases (`nc_phrase` registry rows) this device holds. */
  learned?: readonly RegistryRow[];
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
            target={sheetRowTarget(snapshot, block, item, pending, learned)}
            item={item}
            label={screenLabel(item.label)}
            number={index + 1}
            readOnly={readOnly}
            photos={photos}
            snapshot={snapshot}
          />
        ))}
      </ul>
    </section>
  );
}

const NO_PENDING: readonly SuggestionRow[] = [];
const NO_LEARNED: readonly RegistryRow[] = [];

/** The row's Dictation button on its own `.row-wrap` (a row with no photo action); nothing when the button is hidden. */
function DictationRow({ children }: { children: ReactNode }) {
  if (!useSpeechAvailable()) return null;
  return <div className="row-wrap">{children}</div>;
}

/**
 * Story 14.3: what a Checklist row reads and writes, whatever holds its cells: a sheet's
 * block (`sheetRowTarget`) or a local ("Verificações do local"). Everything a row took from
 * its block comes through here, so the row itself knows neither.
 */
export interface ChecklistRowTarget {
  /** The entity whose row holds the cells (the block, the local): the typed observation's draft key. */
  entityId: string;
  /** The result the row shows (a sheet's `na_defaults` row shows NA with no cell of its own). */
  result: TriStateValue | null;
  /** The shown result is a stored cell: an uncommitted one still commits on its first tap. */
  committed: boolean;
  /** The stored observation, '' when none. */
  observation: string;
  resultOp: (by: Author, value: TriStateValue | null) => OpDraft;
  observationOp: (by: Author, value: string | null) => OpDraft;
  /** Story 20.9: the kernel's cap of the observation `observationOp` writes (`textCapOf`). */
  observationCap: number | null;
  /** Story 9.5: the row's photo-read NC draft the kernel holds now, or null (a site item never has one). */
  ncDraft: SuggestionRow | null;
  /** What "Criar ponto de atenção" starts with, given the ids of the item's photos. */
  pointSeed: (photoIds: readonly string[]) => PointSeed;
  /** E6-Q11: the row's point mark ("Ponto de atenção 3"), given the ids of the item's photos; null with none. */
  pointMark: (photoIds: readonly string[]) => string | null;
  /** Story 24.7: what the row's points belong to (the sheet's equipment, the local), so leaving NC asks about them. */
  pointOwner: NcRowOwner;
  /**
   * Story 14.12: the row's NC chips in the order they are offered, the kernel's one list
   * (`ncChipPhrases`): the item's seed phrases, the company's learned ones, the recents.
   */
  chips: readonly string[];
  /**
   * Story 24.6: the phrases the row offered when its observation was written, which
   * `ncObservationOnLeave` judges against (`learnedBefore`: a phrase learned from this very
   * observation after its push never makes it automatic); `chips` when absent.
   */
  leaveChips?: readonly string[];
}

/** The target of one item of a sheet's checklist: its cells on the block, its ops on `sheet/{blockId}/checklist/…`. */
export function sheetRowTarget(
  snapshot: RelatorioSnapshot,
  block: BlockRow,
  item: ChecklistItem,
  pending: readonly SuggestionRow[],
  learned: readonly RegistryRow[] = NO_LEARNED,
): ChecklistRowTarget {
  const observationCell = block.sheet.checklist[item.key]?.observation;
  const definitions = snapshotDefinitionContext(snapshot);
  const recents = recentChecklistObservations(snapshot, item.key, item.nc_phrases, block.id);
  return {
    entityId: block.id,
    result: checklistResultOf(block, item.key, definitions),
    // A `na_defaults` row (and, Story 14.11, an oil item of a non-oil unit on seed v6) shows NA
    // with no cell of its own (checklistResultOf's display default) -- the first tap on it must
    // still commit a real cell (spec Design Notes).
    committed: checklistResultIsStored(block, item.key, definitions),
    observation: typeof observationCell?.value === 'string' ? observationCell.value : '',
    resultOp: (by, value) => checklistResultOp(by, block.relatorio_id, block.id, item.key, value),
    observationOp: (by, value) => checklistObservationOp(by, block.relatorio_id, block.id, item.key, value),
    observationCap: textCapOf(sheetChecklistPath(block.id, item.key, 'observation')),
    ncDraft: ncDraftFor(block, item.key, pending),
    // Story 22.5: the point replaces the row's derived NC entry (`origin` `nc`, its item); e22f
    // S4: it starts with that entry's text and the item's photos, as "Editar" on the entry does.
    pointSeed: (photoIds) => ({
      text: withPhotoTokens(ncRowPointText(snapshot, { block }, item.key), photoIds),
      equipmentId: block.equipment_id,
      origin: 'nc',
      itemKey: item.key,
    }),
    pointMark: (photoIds) => ncRowPointsText(ncRowPointPositions(snapshot.points, block.equipment_id, photoIds, item.key)),
    pointOwner: { equipmentId: block.equipment_id },
    chips: ncChipPhrases({ seeded: item.nc_phrases, learned, blockType: block.block_type, itemKey: item.key, recents }),
    leaveChips: ncChipPhrases({ seeded: item.nc_phrases, learned: learnedBefore(learned, observationCell?.op_id), blockType: block.block_type, itemKey: item.key, recents }),
  };
}

/** What a row writes through: the relatório, the author and the two write paths of `FichaApi`. */
export type ChecklistRowApi = Pick<FichaApi, 'relatorioId' | 'author' | 'commit' | 'edit' | 'undoable'>;

/**
 * One Checklist row (`60-ficha.html`, `61-verificacoes-local.html`). `observationLine`
 * (Story 14.3, the site checklist's page rule `.vl-obs-line`): an answered C or NA row that
 * holds an observation shows it as one line with "Editar" instead of the open field; the
 * field opens from "Editar" or the Overflow's "Observação", for the rest of the visit.
 */
export function ChecklistRow({
  api,
  target,
  item,
  label,
  number,
  readOnly,
  photos,
  snapshot,
  observationLine = false,
}: {
  api: ChecklistRowApi;
  target: ChecklistRowTarget;
  /**
   * The item's key (the row's photos and its draft key go by it) and (seed v6, Story 14.9) the
   * seed's hint, shown under the label on the sheet only. Its chips come from `target.chips`.
   */
  item: { key: string; hint?: string | undefined };
  /** The item's label as the screen shows it. */
  label: string;
  number: number;
  readOnly: boolean;
  photos?: ChecklistPhotos;
  snapshot: RelatorioSnapshot;
  observationLine?: boolean;
}) {
  const t = copy.ficha.checklist;
  const result = target.result;
  const resultCommitted = target.committed;
  const stored = target.observation;
  const chips = target.chips;
  const photoIds = (photos?.tiles ?? []).filter((tile) => tile.item_key === item.key).map((tile) => tile.id);
  const [observationOpen, setObservationOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const fieldId = useId();
  const reasonId = useId();
  const name = `${number}. ${label}`;
  const typed = useTypedText(
    stored,
    (text) =>
      api.author === null ? undefined : api.commit([target.observationOp(api.author, text.trim() === '' ? null : text)]),
    { entityId: target.entityId, field: `obs-${item.key.replace(/_/g, '-')}` },
    { cap: target.observationCap },
  );
  // Story 9.4: a dictated observation, held until "Usar"; a keystroke into the field discards it.
  const dictation = useProseDictation();
  const nc = result === 'NC';
  const empty = typed.text.trim() === '';
  // Story 9.5: the row's NC draft, while nothing is typed; a draft discarded here is not shown again before its echo.
  const [discardedId, setDiscardedId] = useState<string | null>(null);
  const kernelDraft = readOnly || !empty ? null : target.ncDraft;
  const draft = kernelDraft !== null && kernelDraft.id === discardedId ? null : kernelDraft;
  const discardDraft = () => {
    const held = readOnly ? null : target.ncDraft;
    if (held === null || api.author === null || discardedId === held.id) return;
    setDiscardedId(held.id);
    // A refused write leaves the draft pending: it shows again.
    void api.commit([discardSuggestionOp(api.author, held)]).catch(() => setDiscardedId(null));
  };
  const applyDraft = () => {
    if (draft === null || api.author === null) return;
    void api.commit(confirmSuggestionOps(api.author, draft));
  };
  // The reason line goes once text exists (EXPERIENCE.md › Observation field); a
  // not-tested row is read-only end to end (AR-17), so nothing on it is ever required.
  const required = !readOnly && nc && empty;
  // Story 24.6: the row left NC keeping an edited observation: the warning shows on this device
  // until the row's observation or result changes again.
  const [kept, setKept] = useState<{ observation: string; result: TriStateValue | null } | null>(null);
  const showKept = !readOnly && kept !== null && kept.observation === stored && typed.text === stored && kept.result === result;
  const keptLineId = useId();
  const expanded = nc || observationOpen || (stored.trim() !== '' && !observationLine);
  const rowPoints = nc ? target.pointMark(photoIds) : null;
  // Story 14.3: the observation of an answered C or NA row as one line, until its field is opened.
  const obsLine = observationLine && !nc && !observationOpen && stored.trim() !== '' && !showKept;
  const openObservation = () => {
    setObservationOpen(true);
    requestAnimationFrame(() => area.current?.focus());
  };

  // Story 24.7: the result chosen while the question about the row's points is open, shown behind it.
  const [question, setQuestion] = useState<{ value: TriStateValue; points: PointRow[] } | null>(null);
  const answered = useRef(false);

  /**
   * Writes a result, one batch: Story 24.6, an NC row set to C or N.A. drops its observation
   * while it is still only the offered phrases (`ncObservationOnLeave` `clear`; nothing typed
   * since, `typed.text` the stored text) and keeps an edited one with the warning; Story 24.7,
   * with the points "Remover ponto" removes.
   */
  const write = (value: TriStateValue | null, remove: readonly PointRow[] = []) => {
    // Review of e24b: a text still being saved (`typed.text` ahead of the store) is judged as typed:
    // kept with the warning when it holds a typed piece, never cleared here (its own commit would
    // land after the clear and bring it back).
    const pending = typed.text !== stored;
    const judged = ncObservationOnLeave(result, value, pending ? typed.text : stored, target.leaveChips ?? chips);
    const leave = pending && judged === 'clear' ? null : judged;
    setKept(leave === 'keep' ? { observation: pending ? typed.text : stored, result: value } : null);
    const removed = remove.length === 0 ? null : pointQuestionText(snapshot.points, remove, value === 'NA' ? 'NA' : 'C');
    void api
      .edit((_blocks, by) => [
        target.resultOp(by, value),
        ...(leave === 'clear' ? [target.observationOp(by, null)] : []),
        ...remove.map((point) => removePointOp(by, api.relatorioId, point.id)),
      ])
      .then((batch) => {
        if (remove.length > 0 && removed !== null) api.undoable(removed.removed, batch);
      })
      .catch(() => undefined);
  };

  const choose = (value: TriStateValue | null) => {
    // Story 24.7: an NC row with a stored point written from it asks first; the result waits for the answer.
    const asked = readOnly || value === null ? [] : pointsAskedOnLeave(snapshot.points, target.pointOwner, item.key, result, value);
    if (asked.length > 0 && value !== null) {
      answered.current = false;
      setQuestion({ value, points: asked });
      return;
    }
    write(value);
  };

  /** Story 24.7: the question's answer; "Manter ponto" and a close write the result alone (the point keeps "Origem resolvida"). */
  const answer = (remove: boolean) => {
    if (question === null || answered.current) return;
    answered.current = true;
    write(question.value, remove ? question.points : []);
    setQuestion(null);
  };

  /** Story 24.6: "Apagar observação" removes the kept observation, with "Desfazer". */
  const clearKept = () => {
    setKept(null);
    void api
      .edit((_blocks, by) => [target.observationOp(by, null)])
      .then((batch) => api.undoable(t.keptCleared, batch))
      .catch(() => undefined);
  };
  const questionText = question === null ? null : pointQuestionText(snapshot.points, question.points, question.value === 'NA' ? 'NA' : 'C');
  // Review of e24b: the asked points left meanwhile (removed or moved on another device): nothing is
  // left to ask, so the chosen result is written alone instead of waiting behind a closed dialog.
  useEffect(() => {
    if (question === null || questionText !== null || answered.current) return;
    answered.current = true;
    write(question.value);
    setQuestion(null);
  });

  /** "Usar": the dictated text appended at the end, as a chip inserts. */
  const applyDictated = () => {
    const text = dictation.pending;
    dictation.discard();
    if (text === null) return;
    // Story 9.5: dictated text is typed text: the NC draft goes.
    discardDraft();
    const next = insertPhrase(typed.text, text, typed.text.length);
    typed.set(next.text);
  };

  const insert = (phrase: string) => {
    discardDraft();
    const element = area.current;
    const caret = element?.selectionStart ?? typed.text.length;
    const next = insertPhrase(typed.text, phrase, caret);
    typed.set(next.text);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const dictationButton = readOnly ? null : <DictationButton label={t.dictateObservation(number)} onStart={dictation.discard} onResult={dictation.offer} />;

  const menu: OverflowMenuAction[] = [];
  if (result !== null) menu.push({ id: 'clear', label: t.clear, onAction: () => choose(null) });
  menu.push({ id: 'observation', label: t.observation, onAction: openObservation });

  return (
    <li className={showKept ? 'checklist-row e24-kept' : 'checklist-row'} data-item-key={item.key} data-missing-field={result === null ? '' : undefined}>
      <div className="row-main">
        <span className="row-label">
          <span className="row-num">{number}.</span>
          {label}
          {/* Story 14.9 (Bruno 2026-10-20 answer 4): a reminder for the technician, never printed. */}
          {item.hint === undefined ? null : <span className="helper row-hint">{screenLabel(item.hint)}</span>}
        </span>
        <TriStateControl value={question === null ? result : question.value} onChange={choose} committed={resultCommitted} aria-label={name} readOnly={readOnly} telemetry="ficha.mark" />
        <OverflowMenu name={label} items={menu} />
      </div>
      {obsLine ? (
        <div className="vl-obs-line">
          <span className="vl-obs-label">{t.observation}</span>
          <span className="vl-obs-text">{stored.trim()}</span>
          {readOnly ? null : (
            <TextButton aria-label={t.obsLineEditLabel(number)} onPress={openObservation}>
              {t.obsLineEdit}
            </TextButton>
          )}
        </div>
      ) : null}
      {expanded || showKept ? (
        <div className="row-expand">
          {nc && !readOnly ? (
            <div className="chip-row" role="group" aria-label={t.chipsLabel(number)}>
              {chips.map((phrase) => (
                <Chip key={phrase} onPress={() => insert(phrase)}>
                  {phrase}
                </Chip>
              ))}
            </div>
          ) : null}
          {draft === null ? null : (
            <SuggestionBlock
              className="nc-draft"
              label={t.draftLabel(number)}
              kicker={t.draftKicker}
              text={String(draft.value)}
              confirmLabel={t.draftUse}
              announcement={ncDraftUsarAnnouncement(number)}
              onConfirm={applyDraft}
            />
          )}
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
              maxLength={target.observationCap ?? undefined}
              data-required={required ? '' : undefined}
              data-missing-field={required ? '' : undefined}
              aria-invalid={required || undefined}
              aria-describedby={required ? reasonId : showKept ? keptLineId : undefined}
              onChange={(event) => {
                discardDraft();
                dictation.discard();
                typed.change(event.target.value);
              }}
              onBlur={typed.blur}
            />
            {readOnly ? null : <CharCount length={typed.text.length} cap={target.observationCap} />}
            {required ? (
              <span className="helper" data-tone="red" id={reasonId}>
                {t.observationRequired}
              </span>
            ) : null}
          </div>
          {showKept ? (
            <p className="helper e24-kept-line" data-tone="amber" role="status" id={keptLineId}>
              <span>{t.keptLine}</span>
              <TextButton onPress={clearKept}>{t.keptClear}</TextButton>
            </p>
          ) : null}
          {dictation.pending === null || readOnly ? null : <DictatedSuggestion text={dictation.pending} onUse={applyDictated} />}
          {nc && !readOnly && photos !== undefined ? (
            <RowPhotoAction
              relatorioId={api.relatorioId}
              target={() => photos.target(item.key)}
              {...(photos.addPhotos === undefined ? {} : { onAddPhotos: () => photos.addPhotos?.(item.key) })}
              before={dictationButton}
            />
          ) : readOnly ? null : (
            <DictationRow>{dictationButton}</DictationRow>
          )}
          {nc && (!readOnly || rowPoints !== null) ? (
            <div className="row-wrap">
              {readOnly ? null : <CreatePointAction
                relatorioId={api.relatorioId}
                snapshot={snapshot}
                seed={() => target.pointSeed(photoIds)}
              />}
              {/* E6-Q11: the point this row already has, so a second tap is a choice, not a duplicate. */}
              {rowPoints === null ? null : <span className="nc-point-ref">{rowPoints}</span>}
            </div>
          ) : null}
        </div>
      ) : null}
      {questionText === null ? null : (
        <ConfirmDialog
          title={questionText.title}
          description={questionText.description}
          cancelLabel={t.pointKeep}
          confirmLabel={t.pointRemove}
          isDestructive
          isOpen
          onConfirm={() => answer(true)}
          onOpenChange={(open) => {
            if (!open) answer(false);
          }}
        />
      )}
      {photos === undefined ? null : (
        <RowPhotoList
          tiles={photos.tiles.filter((tile) => tile.item_key === item.key)}
          number={number}
          onRetry={photos.retry}
          {...(photos.caption === undefined ? {} : { onCaption: photos.caption })}
        />
      )}
    </li>
  );
}
