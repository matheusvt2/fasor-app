import {
  conflictCellHeading,
  conflictPickLabel,
  conflictSideView,
  conflictViewTitle,
  removalCardLines,
  removalColumnTitles,
  suggestionRowSchema,
  type BlockRemovalDecision,
  type CellConflict,
  type CellDecision,
  type ConflictPick,
  type DecisionSide,
  type DecisionTextContext,
  type SuggestionRow,
} from '@app/domain';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/index.ts';
import { CropThumb } from '../../components/crop-thumb.tsx';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import type { HeldDecisions } from '../../db/decision-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import type { DecisionActions } from './decision-actions.ts';
import './sync.css';

/*
 * Stories 10.2 and 10.3 (FR-59, `prototype/screens/86-sync-conflito.html`, epic-10
 * Conflict 7): the Conflict view, a React Aria modal dialog (`DialogShell`: `aria-modal`,
 * labelled by its `.dialog-title`, described by its `.cv-desc`). The cell variant lists only
 * the contradicting cells, each one radiogroup of two 56 px options with no preselection;
 * "Aplicar" waits for a pick on every cell. The removal variant shows one block card per
 * side and "Manter" / "Remover". Esc, the close button and a tap on the scrim close it
 * without writing; the merged rest of the sheet is not shown (it is listed in Sync status).
 */

export type ConflictDialogDecision = CellDecision | BlockRemovalDecision;

export interface ConflictDialogProps {
  entry: HeldDecisions;
  decision: ConflictDialogDecision;
  context: DecisionTextContext;
  actions: DecisionActions;
  onClose: () => void;
}

export function ConflictDialog({ entry, decision, context, actions, onClose }: ConflictDialogProps) {
  const titleId = useId();
  const descId = useId();
  const t = copy.conflict;
  const title = conflictViewTitle(decision.block_id, context);
  return (
    <DialogShell
      className="conflict-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="conflict-page">
        <div className="conflict-head">
          <div className="dialog-title">
            <span id={titleId}>{title}</span>
            <span className="t-meta ink-secondary cv-desc" id={descId}>
              {decision.kind === 'cell' ? t.desc : t.removalDesc}
            </span>
          </div>
          <button type="button" className="icon-btn" aria-label={t.close} onClick={onClose}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-close" />
            </svg>
          </button>
        </div>
        {decision.kind === 'cell' ? (
          <CellPicks entry={entry} decision={decision} context={context} actions={actions} onClose={onClose} />
        ) : (
          <RemovalCards entry={entry} decision={decision} context={context} actions={actions} onClose={onClose} />
        )}
      </div>
    </DialogShell>
  );
}

/** The suggestion rows behind the sides' values (their crops), read live. */
function useSideSuggestions(decision: CellDecision): ReadonlyMap<string, SuggestionRow> {
  const db = useSession().database;
  const ids = [...new Set(decision.cells.flatMap((cell) => [cell.standing.source_suggestion_id, cell.displaced.source_suggestion_id]).filter((id): id is string => id !== null))];
  const key = ids.join(',');
  return useLiveQuery(
    async () => {
      const out = new Map<string, SuggestionRow>();
      if (db === null || ids.length === 0) return out;
      const records = await db.entities.bulkGet(ids.map((id) => ['suggestion', id] as ['suggestion', string]));
      for (const record of records) {
        const parsed = record === undefined ? null : suggestionRowSchema.safeParse(record.row);
        if (parsed?.success) out.set(parsed.data.id, parsed.data);
      }
      return out;
    },
    [db, key],
    new Map<string, SuggestionRow>(),
  );
}

function CellPicks({ entry, decision, context, actions, onClose }: Omit<ConflictDialogProps, 'decision'> & { decision: CellDecision }) {
  const t = copy.conflict;
  const [picks, setPicks] = useState<Readonly<Record<string, ConflictPick>>>({});
  const [applying, setApplying] = useState(false);
  const suggestions = useSideSuggestions(decision);
  const block = entry.blocks.find((row) => row.id === decision.block_id);
  const complete = decision.cells.every((cell) => picks[cell.path] !== undefined);

  async function apply() {
    if (!complete || applying) return;
    setApplying(true);
    try {
      await actions.apply(decision, picks);
    } finally {
      setApplying(false);
      onClose();
    }
  }

  return (
    <>
      <div className="conflict-scroll">
        <div className="conflict-view">
          {decision.cells.map((cell) => (
            <div className="cv-cell" key={cell.path} data-path={cell.path}>
              <p className="cc-label">{conflictCellHeading(cell, decision.cells)}</p>
              <p className="cc-name">{cell.label}</p>
              <PickGroup
                cell={cell}
                context={context}
                block={block}
                suggestions={suggestions}
                picked={picks[cell.path] ?? null}
                onPick={(side) => setPicks((current) => ({ ...current, [cell.path]: side }))}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="sticky-action-bar">
        <span className="btn-reason">{t.reason}</span>
        <div className="bar-buttons">
          <Button isDisabled={!complete} disabledReason={t.pickEveryCell} onPress={() => void apply()}>
            {t.apply}
          </Button>
        </div>
      </div>
    </>
  );
}

/** The two options of one cell, the viewer's own side first (`86-sync-conflito.html` "A minha" first). */
function sidesOf(cell: CellConflict, context: DecisionTextContext): { key: ConflictPick; side: DecisionSide }[] {
  const both: { key: ConflictPick; side: DecisionSide }[] = [
    { key: 'standing', side: cell.standing },
    { key: 'displaced', side: cell.displaced },
  ];
  const mine = (side: DecisionSide) => side.actor_id !== null && side.actor_id === context.viewerActorId;
  return mine(cell.displaced) && !mine(cell.standing) ? [both[1]!, both[0]!] : both;
}

function PickGroup({
  cell,
  context,
  block,
  suggestions,
  picked,
  onPick,
}: {
  cell: CellConflict;
  context: DecisionTextContext;
  block: HeldDecisions['blocks'][number] | undefined;
  suggestions: ReadonlyMap<string, SuggestionRow>;
  picked: ConflictPick | null;
  onPick: (side: ConflictPick) => void;
}) {
  const sides = sidesOf(cell, context);
  const refs = useRef(new Map<ConflictPick, HTMLButtonElement | null>());
  // A roving tab stop: the picked option, else the first one (no preselection).
  const tabbable = picked ?? sides[0]!.key;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = sides[(index + step + sides.length) % sides.length]!;
    onPick(next.key);
    refs.current.get(next.key)?.focus();
  }

  return (
    <div className="cv-pick" role="radiogroup" aria-label={conflictPickLabel(cell)}>
      {sides.map(({ key, side }, index) => {
        const view = conflictSideView(cell, side, context, block);
        const suggestion = side.source_suggestion_id === null ? undefined : suggestions.get(side.source_suggestion_id);
        return (
          <button
            key={key}
            type="button"
            className="cv-option"
            role="radio"
            aria-checked={picked === key}
            data-side={key}
            tabIndex={key === tabbable ? 0 : -1}
            ref={(element) => {
              refs.current.set(key, element);
            }}
            onClick={() => onPick(key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="radio" aria-hidden="true" />
            {suggestion === undefined ? null : (
              <CropThumb presentational source="display" photoId={suggestion.source.photo_id} bbox={suggestion.source.bbox} label={cell.label} />
            )}
            <span className="cvo-text">
              <span className="cvo-who">
                <span className="avatar" aria-hidden="true">
                  {view.initial}
                </span>
                {view.who}
              </span>
              <span className="cvo-value">{view.value}</span>
              <span className="cvo-meta">{view.meta}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RemovalCards({ entry, decision, context, actions, onClose }: Omit<ConflictDialogProps, 'decision'> & { decision: BlockRemovalDecision }) {
  const t = copy.conflict;
  const titles = removalColumnTitles(decision, context);
  const lines = removalCardLines(
    decision,
    entry.blocks.find((row) => row.id === decision.block_id),
    context,
  );
  const [busy, setBusy] = useState(false);
  async function act(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await run();
    } finally {
      setBusy(false);
      onClose();
    }
  }
  return (
    <>
      <div className="conflict-scroll">
        <div className="conflict-view">
          <div className="conflict-columns">
            <div className="conflict-column" data-side="removed">
              <div className="conflict-column-title">{titles.removed}</div>
              {lines.removed.map((line, i) => (
                <div className={i === lines.removed.length - 1 ? 'conflict-cell is-changed' : 'conflict-cell'} key={i}>
                  {line}
                </div>
              ))}
            </div>
            <div className="conflict-column" data-side="edited">
              <div className="conflict-column-title">{titles.edited}</div>
              {lines.edited.map((line, i) => (
                <div className="conflict-cell" key={i}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="sticky-action-bar">
        <div className="bar-buttons">
          <Button variant="secondary" onPress={() => void act(() => actions.keep(entry, decision, context))}>
            {t.keep}
          </Button>
          <Button variant="destructive" onPress={() => void act(() => actions.remove(entry, decision, context))}>
            {t.remove}
          </Button>
        </div>
      </div>
    </>
  );
}
