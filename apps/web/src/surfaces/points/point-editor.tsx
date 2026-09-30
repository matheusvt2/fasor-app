import {
  deadlineState,
  extractPhotoRefs,
  formatCalendarDate,
  numberPhotos,
  pointCreatedDate,
  photoRefLabel,
  pointOrderText,
  pointTitle,
  recurringFindings,
  replaceLineText,
  type PointPriority,
  type PointPriorityWrites,
  type PointRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Chip, DateField, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { useRelatorioPhotoTiles, type PhotoTile } from '../../db/photo-store.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSectionTextArea } from '../../input/use-section-text-area.ts';
import { useDraftAutosave } from '../../state/draft-autosave.ts';
import { useDraftSource } from '../../state/drafts.tsx';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { DictatedSuggestion, DictationButton, useProseDictation } from '../../speech/dictation.tsx';
import { PhotoRefTile } from './photo-ref-tile.tsx';
import {
  actionValue,
  ownerValue,
  pointDraftValue,
  pointPlace,
  POINT_DRAFT_SURFACE,
  writeDeadline,
  writePoint,
  writePriorityPick,
  writeReplaceDeadline,
  type NewPointLink,
  type PointFieldsWrite,
  type PointValues,
} from './point-writes.ts';
import { PriorityPicker } from './priority-picker.tsx';
import { insertPhotoChip, insertPlainText, quickTextAt, relabelPhotoChips, renderPointText } from './point-text-editor.ts';
import { endRange, placeCaret } from '../templates/section-text-editor.ts';
import './points.css';

/*
 * Story 6.6 (`72-pontos.html` "4 in edit mode"): the point of attention editor. The text is
 * the section text editor's `contenteditable` area with photo-reference chips ("Imagem N",
 * stored as `[[foto:<id>]]`, never a number), the "Textos rápidos" chips insert the seed's
 * recurring findings as plain text at the caret, "Fotos referenciadas" lists the cited
 * photos and opens the picker of the relatório's live photos, and "Ação recomendada" is a
 * plain field. No photo draft (FR-75). Story 9.4 adds "Ditar o texto" beside the Texto label: the dictated text
 * waits under the text as a Suggestion field and "Usar" appends it the way a quick text
 * lands, at the end.
 *
 * E6-Q2: every field autosaves like the rest of the app (EXPERIENCE.md › Autosave): a
 * change commits through `useFieldCommit` (blur or 500 ms idle), a new point is created
 * (with the id generated when the editor opened) the first time its text or action is not
 * empty, and every later change is a field put (`point-writes.ts`). Closing the editor --
 * "Concluir", Esc, the scrim -- flushes the pending commit first, so nothing typed is lost;
 * there is no "Cancelar" (the mock has none, and autosave has nothing to discard). Text not
 * yet committed is a draft source (FR-61). A seeded new point the person never touched is
 * created only by "Concluir".
 *
 * Story 11.9 (`72-pontos.html` 233-255): after Ação, the Priority picker, Prazo as a
 * Suggestion field and Responsável. A pick, Delete on the picker, and "Substituir" are one
 * batch each, decided by the kernel and offered for undo ("Desfazer" restores priority and
 * deadline together); a pick on a point not stored yet creates it in the same batch. A typed
 * Prazo commits like a field (blur or idle), and Responsável autosaves like Ação. The
 * picker and Prazo read the stored row (`snapshot.points`), never a copy.
 *
 * The same editor opens inline on the Points surface (`variant: 'card'`, the mock's
 * `.is-editing` card) and in a Form dialog from an NC row or an untested sheet.
 */

/** What a new point starts with: its text, its equipment and where it came from. */
export interface PointSeed {
  text: string;
  equipmentId: string | null;
  origin: PointRow['origin'];
}

/** Where a point the editor wrote to sits in section 8 once it closed. */
export interface PointSaved {
  pointId: string;
  position: number;
  total: number;
}

export interface PointEditorProps {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  /** The point being edited, or null for a new one. */
  point: PointRow | null;
  /** A new point's id when the caller generated it (the Points surface); else the editor makes one. */
  newPointId?: string;
  /** A new point's start; ignored when editing. */
  seed?: PointSeed;
  /** 1-based position of the edited point among the live ones, and how many there are. */
  position?: number;
  total?: number;
  /**
   * Called once when the editor closes, after its last write settled: where the point sits
   * when this editor wrote to it, null when it wrote nothing.
   */
  onDone: (saved: PointSaved | null) => void;
  /** "Remover ponto" of an existing point (the caller confirms). */
  onRemove?: () => void;
  variant: 'card' | 'dialog';
  /** The dialog's Esc and scrim close through this: the pending commit is flushed first. */
  closeRef?: RefObject<(() => void) | null>;
}

const EMPTY_SEED: PointSeed = { text: '', equipmentId: null, origin: 'manual' };

export function PointEditor({ relatorioId, snapshot, point, newPointId, seed = EMPTY_SEED, position, total, onDone, onRemove, variant, closeRef }: PointEditorProps) {
  const t = copy.points;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const edits = useUndoableEdits();
  const tiles = useRelatorioPhotoTiles(db, relatorioId);

  const numbers = useMemo(() => numberPhotos(snapshot.files), [snapshot.files]);
  const numbersRef = useRef(numbers);
  numbersRef.current = numbers;
  const labelOf = useCallback((id: string) => {
    const n = numbersRef.current.get(id);
    return n === undefined ? copy.points.removedPhoto : photoRefLabel(n);
  }, []);

  const initialText = point?.text ?? seed.text;
  const [text, setText] = useState(initialText);
  const [action, setAction] = useState(point?.action ?? '');
  const [owner, setOwner] = useState(point?.owner ?? '');
  const [picking, setPicking] = useState(false);

  // --- E6-Q2: autosave ---------------------------------------------------------------------
  const [pointId] = useState(() => point?.id ?? newPointId ?? newId());
  /** A new point's link; null when editing a stored one (a missing row is then `gone`). */
  const [link] = useState<NewPointLink | null>(() => (point === null ? { equipmentId: seed.equipmentId, origin: seed.origin } : null));
  /** What the fields hold now (read by the commits, the draft source and the close). */
  const values = useRef<PointValues>({ text: initialText, action: point?.action ?? '', owner: point?.owner ?? '' });
  /** What the store holds, as far as this editor wrote or read it. */
  const stored = useRef<PointValues>({ text: point?.text ?? '', action: point?.action ?? '', owner: point?.owner ?? '' });
  /** The person changed something here (a seeded new point untouched is created only by "Concluir"). */
  const touched = useRef(false);
  /** This editor wrote to the point. */
  const wrote = useRef(false);
  const lastWrite = useRef<Promise<unknown>>(Promise.resolve());
  const goneShown = useRef(false);
  /** A write since the last close attempt was refused (quota, a closed database). */
  const refused = useRef(false);
  const finishing = useRef(false);
  const mounted = useRef(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const committers = useRef<{ flush: () => void } | null>(null);
  /** Writes this point's draft now (`useDraftSource`), set once the source is registered below. */
  const saveDraftRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // E6-R1: the draft is also written 300 ms after the typing stops, not only when the tab
  // hides: a plain reload fires no hide first, and the idle commit (500 ms) may not have run.
  const draftAutosave = useDraftAutosave(() => saveDraftRef.current());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Declared before the committers, so on unmount it runs before they drop their timers: a
  // surface left mid-typing (a route change) still stores what was typed.
  useEffect(
    () => () => {
      if (!finishing.current) committers.current?.flush();
    },
    [],
  );

  /** "Este ponto não está mais neste relatório", once. */
  const showGone = () => {
    if (mounted.current && !goneShown.current) {
      goneShown.current = true;
      edits.notify(t.gone);
    }
  };

  /**
   * Story 11.9: a priority or deadline not stored yet: picked or typed on a new point that
   * holds nothing to print (it is created with them by its first text, action or
   * Responsável), or a typed Prazo recovered from a draft. The ref is what the writes read.
   */
  const pendingRef = useRef<PointPriorityWrites>({});
  const [pending, setPendingState] = useState<PointPriorityWrites>({});
  const setPending = (next: PointPriorityWrites) => {
    pendingRef.current = next;
    setPendingState(next);
  };

  const persist = (fields: readonly (keyof PointValues)[]): Promise<void> => {
    if (db === null || user === null) return Promise.resolve();
    const author = { id: user.id, companyId: user.companyId };
    const taken = { ...values.current };
    const run = edits.write(
      async () => {
        const held = pendingRef.current;
        const result = await writePoint(db, author, relatorioId, pointId, taken, fields, link, held);
        if (result.kind === 'gone') {
          showGone();
          return null;
        }
        if (result.kind === 'written') {
          wrote.current = true;
          // The pending priority and deadline went into this batch.
          if (pendingRef.current === held && Object.keys(held).length > 0) setPending({});
        }
        // A create stores both fields; a put (or nothing to write) the fields it names.
        for (const field of result.kind === 'written' && result.created ? (['text', 'action', 'owner'] as const) : fields) stored.current[field] = taken[field];
        // E6-R1: the draft written while typing is now stored text: rewritten from what is
        // still unstored, which drops the row when nothing is.
        void saveDraftRef.current();
        return null;
      },
    );
    // A refused write is toasted once, by the edit queue (`writeErrorText`); the editor keeps
    // what was typed (`values`, and the draft source) and a close waiting on it stays open.
    // The promise resolves either way, so `useFieldCommit` does not say it a second time.
    const settled = run.then(
      () => undefined,
      () => {
        refused.current = true;
      },
    );
    lastWrite.current = settled;
    return settled;
  };

  const textCommit = useFieldCommit<string>({ commit: () => persist(['text']) });
  const actionCommit = useFieldCommit<string>({ commit: () => persist(['action']) });
  const ownerCommit = useFieldCommit<string>({ commit: () => persist(['owner']) });

  // --- Story 11.9: priority and Prazo -------------------------------------------------------
  const nextIntervention = snapshot.relatorio.setup.next_intervention_date;
  const liveRow = snapshot.points.find((row) => row.id === pointId) ?? null;
  // A point not stored yet shows what is pending for it.
  const priority = liveRow !== null ? liveRow.priority : (pending.priority ?? null);
  const deadline = liveRow !== null ? liveRow.deadline : (pending.deadline ?? null);
  const prazo = deadlineState({ id: pointId, priority, deadline }, nextIntervention);
  /** The Prazo field's value: the shown deadline, or what is being typed until it commits. */
  const [typedDeadline, setTypedDeadlineState] = useState(deadline);
  /** The typed value, for the draft source (FR-61): a typed Prazo not committed yet is a draft. */
  const typedRef = useRef(deadline);
  const setTypedDeadline = (next: string | null) => {
    typedRef.current = next;
    setTypedDeadlineState(next);
  };
  const shownDeadline = useRef(deadline);
  if (deadline !== shownDeadline.current) {
    shownDeadline.current = deadline;
    typedRef.current = deadline;
    if (deadline !== typedDeadline) setTypedDeadlineState(deadline);
  }

  /** What a priority/deadline write did, for the editor: the batch to offer for undo, or null. */
  const noteFieldsWrite = (result: PointFieldsWrite, taken: PointValues, held: PointPriorityWrites): string | null => {
    switch (result.kind) {
      case 'gone':
        showGone();
        return null;
      case 'pending':
        setPending(result.pending);
        return null;
      case 'unchanged':
        return null;
      case 'written':
        wrote.current = true;
        if (result.created) {
          stored.current = taken;
          if (pendingRef.current === held) setPending({});
          void saveDraftRef.current();
        }
        return result.batchId;
    }
  };

  const persistDeadline = (next: string | null): Promise<void> => {
    if (db === null || user === null) return Promise.resolve();
    const author = { id: user.id, companyId: user.companyId };
    const taken = { ...values.current };
    return edits.commit(async () => {
      const held = pendingRef.current;
      noteFieldsWrite(await writeDeadline(db, author, relatorioId, pointId, next, link, taken, held), taken, held);
      void saveDraftRef.current();
    });
  };
  const deadlineCommit = useFieldCommit<string | null>({ commit: (next) => persistDeadline(next) });

  /** A pick, a clear or "Substituir": one batch, offered for undo with `toast`. */
  const writeFields = (
    run: (database: NonNullable<typeof db>, author: { id: string; companyId: string }, taken: PointValues, held: PointPriorityWrites) => Promise<PointFieldsWrite>,
    toast: string,
  ) => {
    if (db === null || user === null) return;
    const author = { id: user.id, companyId: user.companyId };
    // A Prazo being typed lands first, so the pick reads it as typed.
    deadlineCommit.flush();
    const taken = { ...values.current };
    void edits
      .write(async () => {
        const held = pendingRef.current;
        return noteFieldsWrite(await run(db, author, taken, held), taken, held);
      })
      .then(
      (batchId) => edits.undoable(toast, batchId, { label: t.undo }),
      () => undefined,
    );
  };
  const pickPriority = (next: PointPriority) =>
    writeFields((database, author, taken, held) => writePriorityPick(database, author, relatorioId, pointId, next, link, taken, held), t.priorityWritten);
  const clearPriority = () =>
    writeFields((database, author, taken, held) => writePriorityPick(database, author, relatorioId, pointId, null, link, taken, held), t.priorityCleared);
  const replaceDeadline = () =>
    writeFields((database, author, taken, held) => writeReplaceDeadline(database, author, relatorioId, pointId, link, taken, held), t.deadlineReplaced);
  const changeDeadline = (next: string | null) => {
    setTypedDeadline(next);
    deadlineCommit.change(next);
    draftAutosave.changed();
  };
  committers.current = {
    flush: () => {
      textCommit.flush();
      actionCommit.flush();
      ownerCommit.flush();
      deadlineCommit.flush();
    },
  };

  // Story 9.4: a dictated text, held until "Usar"; typing into the text discards it.
  const dictation = useProseDictation();
  const discardDictation = dictation.discard;

  const area = useSectionTextArea({
    initialText,
    onChange: (next) => {
      discardDictation();
      setText(next);
      values.current.text = next;
      touched.current = true;
      textCommit.change(next);
      draftAutosave.changed();
    },
    onBlur: () => textCommit.blur(),
    render: (element, value) => renderPointText(element, value, labelOf),
    paste: insertPlainText,
  });
  const { areaRef, editAtCaret } = area;

  const changeAction = (next: string) => {
    setAction(next);
    values.current.action = next;
    touched.current = true;
    actionCommit.change(next);
    draftAutosave.changed();
  };

  const changeOwner = (next: string) => {
    setOwner(next);
    values.current.owner = next;
    touched.current = true;
    ownerCommit.change(next);
    draftAutosave.changed();
  };

  // FR-61: what is typed and not yet stored goes to `drafts` when the tab hides; enough to
  // write it with this editor closed (`usePointDraftRecovery`).
  saveDraftRef.current = useDraftSource({
    surface: POINT_DRAFT_SURFACE,
    entityId: pointId,
    read: () => {
      const now = values.current;
      const before = stored.current;
      // Story 11.9: a typed Prazo not committed yet, and what a point not stored holds pending.
      const heldPending: PointPriorityWrites = { ...pendingRef.current };
      if (typedRef.current !== shownDeadline.current) heldPending.deadline = typedRef.current;
      const unsaved =
        link !== null && !wrote.current
          ? touched.current && (now.text.trim() !== '' || actionValue(now.action) !== null || ownerValue(now.owner) !== null)
          : now.text !== before.text ||
            actionValue(now.action) !== actionValue(before.action) ||
            ownerValue(now.owner) !== ownerValue(before.owner) ||
            Object.keys(heldPending).length > 0;
      if (!unsaved) return null;
      return {
        pending: heldPending,
        relatorio_id: relatorioId,
        text: now.text,
        action: now.action,
        owner: now.owner,
        equipmentId: link?.equipmentId ?? point?.equipment_id ?? null,
        origin: link?.origin ?? point?.origin ?? 'manual',
        is_new: link !== null,
      };
    },
    apply: (value) => {
      const draft = pointDraftValue(value);
      if (draft === null) return;
      values.current = { text: draft.text, action: draft.action, owner: draft.owner };
      touched.current = true;
      area.setText(draft.text);
      setText(draft.text);
      setAction(draft.action);
      setOwner(draft.owner);
      // Story 11.9: a recovered typed Prazo (or pending pick) is written with the fields.
      if (Object.keys(draft.pending).length > 0) {
        setPending({ ...pendingRef.current, ...draft.pending });
        if (draft.pending.deadline !== undefined) setTypedDeadline(draft.pending.deadline);
      }
      void persist(['text', 'action', 'owner']);
    },
  });

  /** Closes the editor: the pending commits first ("Concluir" also creates an untouched seeded point), then `onDone`. */
  const finish = (explicit: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    refused.current = false;
    // A commit refused earlier left its value unstored with nothing pending: this close writes
    // both fields again (an untouched new point still writes nothing unless "Concluir").
    const unstored =
      link === null
        ? stored.current.text !== values.current.text ||
          actionValue(stored.current.action) !== actionValue(values.current.action) ||
          ownerValue(stored.current.owner) !== ownerValue(values.current.owner)
        : touched.current && !wrote.current;
    const retry = unstored && !textCommit.pending && !actionCommit.pending && !ownerCommit.pending;
    textCommit.flush();
    actionCommit.flush();
    ownerCommit.flush();
    deadlineCommit.flush();
    if ((explicit && link !== null && !wrote.current) || retry) void persist(['text', 'action', 'owner']);
    void lastWrite.current.then(async () => {
      // Refused: the editor stays open with what was typed (the toast said why).
      if (refused.current) {
        finishing.current = false;
        return;
      }
      if (!wrote.current || db === null) {
        onDoneRef.current(null);
        return;
      }
      const place = await pointPlace(db, relatorioId, pointId).catch(() => null);
      onDoneRef.current(place === null ? null : { pointId, ...place });
    });
  };
  if (closeRef !== undefined) closeRef.current = () => finish(false);

  // A photo added or removed elsewhere renumbers the chips already drawn.
  useEffect(() => {
    if (areaRef.current !== null) relabelPhotoChips(areaRef.current, labelOf);
  }, [numbers, areaRef, labelOf]);

  // The text is where the editor starts: typing is the first thing a person does here.
  // F-09: with the caret at the end of the text, so a photo or a quick text picked before the
  // engineer places it lands after the words, not at position 0.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = areaRef.current;
      if (element === null) return;
      element.focus();
      placeCaret(element, endRange(element));
    });
    return () => cancelAnimationFrame(frame);
  }, [areaRef]);

  const refs = useMemo(() => extractPhotoRefs(text), [text]);
  const tileOf = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);
  const findings = recurringFindings(snapshot.relatorio.seed_version);
  const equipmentTitle = pointTitle({ equipment_id: point?.equipment_id ?? seed.equipmentId }, snapshot);

  const textLabelId = useId();
  const helperId = useId();
  const photosLabelId = useId();
  const actionId = useId();
  const priorityLabelId = useId();
  const priorityHelperId = useId();
  const deadlineHelperId = useId();
  const ownerId = useId();

  const insertQuick = (value: string) => editAtCaret((element, range) => insertPlainText(element, range, quickTextAt(element, range, value)));
  /** "Usar": the dictated text at the end of the text, spaced as a quick text is. */
  const applyDictated = () => {
    const value = dictation.pending;
    dictation.discard();
    if (value === null) return;
    editAtCaret((element) => insertPlainText(element, null, quickTextAt(element, null, value)));
  };

  const pick = (id: string) => {
    editAtCaret((element, range) => insertPhotoChip(element, range, id, labelOf(id)));
    setPicking(false);
  };

  const unref = (id: string) =>
    editAtCaret((element) => {
      for (const chip of element.querySelectorAll<HTMLElement>('.var-chip.photo-ref[data-photo]')) {
        if (chip.dataset.photo === id) chip.remove();
      }
    });

  const order = position === undefined || total === undefined ? t.newOrder : pointOrderText(position, total);

  const body = (
    <div className="poa-body">
      <div>
        <span className="poa-order">{order}</span>
      </div>

      <div className="field">
        <span className="field-label">{t.equipmentLabel}</span>
        <p className="poa-equipment">{equipmentTitle}</p>
      </div>

      <div className="field">
        <div className="poa-text-head">
          <span className="field-label" id={textLabelId}>
            {t.textLabel}
          </span>
          <DictationButton label={t.dictateText} onStart={dictation.discard} onResult={dictation.offer} />
        </div>
        {findings.length === 0 ? null : (
          <>
            <p className="section-note poa-quick-note" aria-hidden="true">
              {t.quickTexts}
            </p>
            <div className="chip-row" role="group" aria-label={t.quickTexts}>
              {findings.map((finding) => (
                <Chip key={finding.label} onPress={() => insertQuick(finding.text)}>
                  {finding.label}
                </Chip>
              ))}
            </div>
          </>
        )}
        <div {...area.areaProps} className="observation-field poa-text-area" aria-labelledby={textLabelId} aria-describedby={helperId} />
        {dictation.pending === null ? null : <DictatedSuggestion text={dictation.pending} onUse={applyDictated} />}
        <span className="helper" id={helperId}>
          {t.textHelper}
        </span>
      </div>

      <div className="field">
        <span className="field-label" id={photosLabelId}>
          {t.photosLabel}
        </span>
        <div className="poa-photo-picker" role="group" aria-labelledby={photosLabelId}>
          {refs.map((id) => (
            <PhotoRefTile
              key={id}
              thumb={tileOf.get(id)?.thumb ?? null}
              number={numbers.get(id) ?? null}
              label={t.unrefPhotoLabel(labelOf(id))}
              onPress={() => unref(id)}
            />
          ))}
          <Button variant="secondary" onPress={() => setPicking(true)}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-image" />
            </svg>
            {t.choosePhotos}
          </Button>
        </div>
      </div>

      <div className="poa-fields-edit">
        <div className="field">
          <label className="field-label" htmlFor={actionId}>
            {t.actionLabel}
          </label>
          <textarea
            id={actionId}
            className="observation-field poa-action"
            value={action}
            onChange={(event) => changeAction(event.target.value)}
            onBlur={() => actionCommit.blur()}
          />
        </div>

        <div className="field">
          <span className="field-label" id={priorityLabelId}>
            {t.priorityLabel}
          </span>
          <PriorityPicker labelId={priorityLabelId} describedBy={priorityHelperId} value={priority} onPick={pickPriority} onClear={clearPriority} />
          <span className="helper" id={priorityHelperId}>
            {t.priorityHelper(formatCalendarDate(pointCreatedDate(pointId)))}
          </span>
        </div>

        <PrazoField
          helperId={deadlineHelperId}
          stored={deadline}
          value={typedDeadline}
          suggested={prazo.suggested && deadline !== null}
          replace={prazo.replace}
          helper={priority === 'P4' && nextIntervention === null && deadline === null ? t.deadlineNoNextIntervention : t.deadlineHelper}
          onChange={changeDeadline}
          onBlur={() => deadlineCommit.blur()}
          onReplace={replaceDeadline}
        />

        <div className="field">
          <label className="field-label" htmlFor={ownerId}>
            {t.ownerLabel}
          </label>
          <input id={ownerId} className="input" value={owner} onChange={(event) => changeOwner(event.target.value)} onBlur={() => ownerCommit.blur()} />
        </div>
      </div>

      <div className="poa-edit-actions">
        <Button variant="primary" onPress={() => finish(true)}>
          {t.concluir}
        </Button>
        {onRemove === undefined ? null : (
          <Button variant="destructive" onPress={onRemove}>
            {t.removePoint}
          </Button>
        )}
      </div>

      <PhotoPicker isOpen={picking} onOpenChange={setPicking} tiles={tiles} numbers={numbers} onPick={pick} />
    </div>
  );

  if (variant === 'dialog') return body;
  return (
    <article className="point-of-attention-card is-editing" aria-label={t.editingLabel(position ?? null)}>
      {body}
    </article>
  );
}

/** A full calendar day (`YYYY-MM-DD`): what the Date field can hold; a P4 deadline may be a month only. */
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Prazo as a Suggestion field (`72-pontos.html` 245-250 `.poa-prazo-sf`): the date, amber
 * with "Sugerido" while it is the priority's suggestion, neutral once typed; beside a typed
 * date, the differing suggestion with "Substituir" (the ficha's `.suggestion-alt` line). A
 * month-only deadline (a P4 next intervention stored as `YYYY-MM`) is shown as it prints
 * (`mm/aaaa`) under an empty Date field (it holds whole days only), where a typed date
 * replaces it.
 */
function PrazoField({
  helperId,
  stored,
  value,
  suggested,
  replace,
  helper,
  onChange,
  onBlur,
  onReplace,
}: {
  helperId: string;
  stored: string | null;
  value: string | null;
  suggested: boolean;
  replace: string | null;
  helper: string;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  onReplace: () => void;
}) {
  const t = copy.points;
  const state = suggested ? 'suggested' : 'confirmed';
  const monthId = useId();
  const month = stored !== null && !FULL_DATE.test(stored) ? formatCalendarDate(stored) : null;
  const after = (
    <>
      {suggested ? <span className="suggested-pill">{ui.suggestionField.suggested}</span> : null}
      {month === null ? null : (
        <span className="helper tabular poa-prazo-month" id={monthId}>
          {t.deadlineMonth(month)}
        </span>
      )}
      <span className="helper" id={helperId}>
        {helper}
      </span>
      {replace === null ? null : (
        <span className="suggestion-alt">
          {replaceLineText(formatCalendarDate(replace))}
          <button type="button" className="btn btn-text" onClick={onReplace}>
            {ui.suggestionField.replace}
          </button>
        </span>
      )}
    </>
  );
  return (
    <DateField
      className="suggestion-field poa-prazo-sf"
      state={state}
      label={t.deadlineLabel}
      value={value !== null && FULL_DATE.test(value) ? value : null}
      onChange={onChange}
      onBlur={onBlur}
      describedBy={month === null ? helperId : `${monthId} ${helperId}`}
      after={after}
    />
  );
}

/** The picker of the relatório's live photos (`key-photos.html` tiles with their number). */
function PhotoPicker({
  isOpen,
  onOpenChange,
  tiles,
  numbers,
  onPick,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tiles: readonly PhotoTile[];
  numbers: ReadonlyMap<string, number>;
  onPick: (id: string) => void;
}) {
  const t = copy.points;
  return (
    <FormDialog isOpen={isOpen} onOpenChange={onOpenChange} title={t.pickerTitle} className="poa-picker-dialog">
      {tiles.length === 0 ? (
        <p className="section-note">{t.pickerEmpty}</p>
      ) : (
        <div className="poa-picker-grid" role="group" aria-label={t.pickerLabel}>
          {tiles.map((tile) => {
            const n = numbers.get(tile.id) ?? null;
            return (
              <PhotoRefTile
                key={tile.id}
                thumb={tile.thumb}
                number={n}
                label={t.pickPhotoLabel(n === null ? t.removedPhoto : photoRefLabel(n), tile.caption)}
                onPress={() => onPick(tile.id)}
              />
            );
          })}
        </div>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          {t.cancel}
        </Button>
      </div>
    </FormDialog>
  );
}

/**
 * "Criar ponto de atenção" from a sheet (an NC row, an untested sheet): the editor in a Form
 * dialog. Esc and the scrim close through the editor, which flushes what was typed first.
 */
export function PointEditorDialog({
  isOpen,
  onOpenChange,
  relatorioId,
  snapshot,
  seed,
  onDone,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  seed: PointSeed;
  onDone: (saved: PointSaved | null) => void;
}) {
  const close = useRef<(() => void) | null>(null);
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open) onOpenChange(true);
        else if (close.current !== null) close.current();
        else onOpenChange(false);
      }}
      title={copy.points.createFromRow}
      className="point-editor-dialog"
    >
      <PointEditor variant="dialog" relatorioId={relatorioId} snapshot={snapshot} point={null} seed={seed} onDone={onDone} closeRef={close} />
    </FormDialog>
  );
}
