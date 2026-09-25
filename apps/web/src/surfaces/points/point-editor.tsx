import {
  extractPhotoRefs,
  numberPhotos,
  photoRefLabel,
  pointOrderText,
  pointTitle,
  recurringFindings,
  type PointRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Chip, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useRelatorioPhotoTiles, type PhotoTile } from '../../db/photo-store.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSectionTextArea } from '../../input/use-section-text-area.ts';
import { useDraftSource } from '../../state/drafts.tsx';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { PhotoRefTile } from './photo-ref-tile.tsx';
import { actionValue, pointDraftValue, pointPlace, POINT_DRAFT_SURFACE, writePoint, type NewPointLink, type PointValues } from './point-writes.ts';
import { insertPhotoChip, insertPlainText, quickTextAt, relabelPhotoChips, renderPointText } from './point-text-editor.ts';
import './points.css';

/*
 * Story 6.6 (`72-pontos.html` "4 in edit mode"): the point of attention editor. The text is
 * the section text editor's `contenteditable` area with photo-reference chips ("Imagem N",
 * stored as `[[foto:<id>]]`, never a number), the "Textos rápidos" chips insert the seed's
 * recurring findings as plain text at the caret, "Fotos referenciadas" lists the cited
 * photos and opens the picker of the relatório's live photos, and "Ação recomendada" is a
 * plain field. No priority, deadline or owner field (`source-deltas.md` row 29), no
 * Dictation button (Epic 9), no photo draft (FR-75).
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
  const [picking, setPicking] = useState(false);

  // --- E6-Q2: autosave ---------------------------------------------------------------------
  const [pointId] = useState(() => point?.id ?? newPointId ?? newId());
  /** A new point's link; null when editing a stored one (a missing row is then `gone`). */
  const [link] = useState<NewPointLink | null>(() => (point === null ? { equipmentId: seed.equipmentId, origin: seed.origin } : null));
  /** What the fields hold now (read by the commits, the draft source and the close). */
  const values = useRef<PointValues>({ text: initialText, action: point?.action ?? '' });
  /** What the store holds, as far as this editor wrote or read it. */
  const stored = useRef<PointValues>({ text: point?.text ?? '', action: point?.action ?? '' });
  /** The person changed something here (a seeded new point untouched is created only by "Concluir"). */
  const touched = useRef(false);
  /** This editor wrote to the point. */
  const wrote = useRef(false);
  const lastWrite = useRef<Promise<unknown>>(Promise.resolve());
  const goneShown = useRef(false);
  const finishing = useRef(false);
  const mounted = useRef(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const committers = useRef<{ flush: () => void } | null>(null);

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

  const persist = (fields: readonly (keyof PointValues)[]): Promise<void> => {
    if (db === null || user === null) return Promise.resolve();
    const author = { id: user.id, companyId: user.companyId };
    const taken = { ...values.current };
    const run = edits.write(
      async () => {
        const result = await writePoint(db, author, relatorioId, pointId, taken, fields, link);
        if (result.kind === 'gone') {
          if (mounted.current && !goneShown.current) {
            goneShown.current = true;
            edits.notify(t.gone);
          }
          return null;
        }
        if (result.kind === 'written') wrote.current = true;
        // A create stores both fields; a put (or nothing to write) the fields it names.
        for (const field of result.kind === 'written' && result.created ? (['text', 'action'] as const) : fields) stored.current[field] = taken[field];
        return null;
      },
      { quiet: true },
    );
    lastWrite.current = run.catch(() => undefined);
    return run.then(() => undefined);
  };

  const textCommit = useFieldCommit<string>({ commit: () => persist(['text']) });
  const actionCommit = useFieldCommit<string>({ commit: () => persist(['action']) });
  committers.current = {
    flush: () => {
      textCommit.flush();
      actionCommit.flush();
    },
  };

  const area = useSectionTextArea({
    initialText,
    onChange: (next) => {
      setText(next);
      values.current.text = next;
      touched.current = true;
      textCommit.change(next);
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
  };

  // FR-61: what is typed and not yet stored goes to `drafts` when the tab hides; enough to
  // write it with this editor closed (`usePointDraftRecovery`).
  useDraftSource({
    surface: POINT_DRAFT_SURFACE,
    entityId: pointId,
    read: () => {
      const now = values.current;
      const before = stored.current;
      const unsaved =
        link !== null && !wrote.current
          ? touched.current && (now.text.trim() !== '' || actionValue(now.action) !== null)
          : now.text !== before.text || actionValue(now.action) !== actionValue(before.action);
      if (!unsaved) return null;
      return {
        relatorio_id: relatorioId,
        text: now.text,
        action: now.action,
        equipmentId: link?.equipmentId ?? point?.equipment_id ?? null,
        origin: link?.origin ?? point?.origin ?? 'manual',
        is_new: link !== null,
      };
    },
    apply: (value) => {
      const draft = pointDraftValue(value);
      if (draft === null) return;
      values.current = { text: draft.text, action: draft.action };
      touched.current = true;
      area.setText(draft.text);
      setText(draft.text);
      setAction(draft.action);
      void persist(['text', 'action']).catch(() => undefined);
    },
  });

  /** Closes the editor: the pending commits first ("Concluir" also creates an untouched seeded point), then `onDone`. */
  const finish = (explicit: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    textCommit.flush();
    actionCommit.flush();
    if (explicit && link !== null && !wrote.current) void persist(['text', 'action']).catch(() => undefined);
    void lastWrite.current.then(async () => {
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
  useEffect(() => {
    const frame = requestAnimationFrame(() => areaRef.current?.focus());
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

  const insertQuick = (value: string) => editAtCaret((element, range) => insertPlainText(element, range, quickTextAt(element, range, value)));

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
        <span className="field-label" id={textLabelId}>
          {t.textLabel}
        </span>
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
