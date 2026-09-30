import {
  confirmAllCandidates,
  confirmarTodosText,
  confirmedAllToastText,
  confirmedFieldToastText,
  confirmSuggestionOps,
  criarAnnouncement,
  criarText,
  discardSuggestionOp,
  fieldInputText,
  hasCreateHint,
  nameplateSuggestions,
  numberPhotos,
  parseFieldInput,
  pendingSuggestions,
  photoRemovedText,
  replaceLineText,
  screenLabel,
  suggestionAnnouncement,
  suggestionGroupCounts,
  suggestionGroupNoteText,
  suggestionRowsOf,
  singleSourcePhotoId,
  suggestionValueText,
  unknownManufacturer,
  type BlockRow,
  type EntityState,
  type FieldDef,
  type NameplateSuggestion,
  type NormalizedBox,
  type RelatorioSnapshot,
  type SuggestionRow,
  type WordRow,
} from '@app/domain';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { CropThumb } from '../../components/crop-thumb.tsx';
import { SuggestionField } from '../../components/suggestion-field.tsx';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { useRelatorioPhotoTiles, type PhotoTile } from '../../db/photo-store.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { removePhoto, restorePhoto } from '../photos/photo-ops.ts';
import { PhotoViewer } from '../photos/photo-viewer.tsx';
import type { FichaApi } from './ficha-api.ts';
import { firstFocusable } from './ficha-fields.tsx';
import { createWordOp, nameplateOp } from './ficha-ops.ts';
import { newId } from '../../ids.ts';

/*
 * Story 8.1 (EXPERIENCE.md › Suggestion field, `60-ficha.html` nameplate lines ~312-341):
 * the nameplate group reads the device's pending suggestion rows. Every rule is the
 * kernel's (`nameplateSuggestions`, `confirmAllCandidates`, `parseFieldInput`, the texts);
 * this renders them and writes their batches through the sheet's one edit queue:
 *
 * - a fill: the amber (or dashed "Verificar") field with the editable guess, its crop and
 *   "Confirmar" (the confirm pair); a committed different value writes the typed put and
 *   discards this suggestion alone;
 * - a replace: the engineer's field as it is, plus "Sugerido: 15 kV — Substituir";
 * - a confirmed cell: the field in `data-state="confirmed"` with the 24 px crop glyph.
 *
 * Story 8.6: a suggestion carrying a create hint for a manufacturer the registry does not
 * hold reads "Criar Celtta?" and writes the registry create with its confirm pair (one
 * batch); "Confirmar todos" leaves it for its own tap. A manufacturer typed over a guess that
 * the registry does not hold is created in the same batch as the typed put and the discard.
 * The group note names the plate photo ("da foto 3") when all its suggestions came from one
 * photo this device numbers.
 */

export type SuggestionCrop = Pick<SuggestionRow, 'source'>;

export interface NameplateSuggestionsModel {
  /** The pending suggestion of each field, with its view. */
  entries: ReadonlyMap<string, NameplateSuggestion>;
  counts: ReturnType<typeof suggestionGroupCounts>;
  /** The suggestion a confirmed cell was filled from (its crop), when the device holds it. */
  sourceOf: (suggestionId: string) => SuggestionRow | null;
  confirm: (s: SuggestionRow, field: FieldDef) => void;
  confirmAll: () => void;
  /**
   * Writes a typed value over a suggestion: the put and this suggestion's discard, one batch.
   * A write resolves true once the batch is in, false when nothing was written.
   */
  type: (s: SuggestionRow, field: FieldDef, text: string) => Promise<boolean> | 'invalid' | 'unchanged';
  openCrop: (s: SuggestionCrop) => void;
  /** Story 8.6: opens the viewer on one photo, zoomed on a region when given (the plate crop). */
  openPhoto: (photoId: string, zoom?: NormalizedBox | null) => void;
  /** The Photo viewer opened from a crop, zoomed on its region. */
  viewer: ReactNode;
  /** Story 8.6: the device's pending rows of the relatório (the plate photo's reading reads them). */
  pending: readonly SuggestionRow[];
  /** Story 8.2: the relatório's live photos on this device, and their provisional numbers. */
  tiles: readonly PhotoTile[];
  numbers: ReadonlyMap<string, number>;
  /** Story 8.6: the number of the one photo the group's suggestions were read from, else null. */
  photoNumber: number | null;
  /** Story 8.6: the suggestion's Confirmar creates its manufacturer ("Criar Celtta?"). */
  createsEntry: (s: SuggestionRow) => boolean;
}

/** The Photo viewer a crop opens, zoomed on its region, and what it needs (shared with the Measurement cells, Story 9.1). */
export interface CropViewer {
  tiles: readonly PhotoTile[];
  numbers: ReadonlyMap<string, number>;
  openPhoto: (photoId: string, zoom?: NormalizedBox | null) => void;
  openCrop: (s: SuggestionCrop) => void;
  viewer: ReactNode;
}

/** The Photo viewer opened from a crop, zoomed on its region, when the photo is on this device. */
export function useCropViewer({ api, snapshot, onCaptionPhoto }: { api: FichaApi; snapshot: RelatorioSnapshot; onCaptionPhoto?: ((tile: PhotoTile) => void) | undefined }): CropViewer {
  const { showToast } = useToast();
  const db = useSession().database;
  const tiles = useRelatorioPhotoTiles(db, api.relatorioId);
  const numbers = useMemo(
    () => numberPhotos(tiles.map((tile) => ({ id: tile.id, kind: 'photo', removed_at: null, captured_at: tile.captured_at, local_seq: tile.local_seq }))),
    [tiles],
  );
  const [viewing, setViewing] = useState<{ photoId: string; zoom: NormalizedBox | null } | null>(null);
  const openPhoto = (photoId: string, zoom: NormalizedBox | null = null) => {
    if (tiles.some((tile) => tile.id === photoId)) setViewing({ photoId, zoom });
  };
  const openCrop = (s: SuggestionCrop) => openPhoto(s.source.photo_id, s.source.bbox);
  const remove = (tile: PhotoTile) => {
    if (db === null || api.author === null) return;
    const author = api.author;
    const number = numbers.get(tile.id) ?? 0;
    setViewing(null);
    void removePhoto(db, author, api.relatorioId, tile.id)
      .then(() =>
        showToast(photoRemovedText(number), {
          action: { label: copy.viewer.undo, onPress: () => void restorePhoto(db, author, api.relatorioId, tile.id).catch(() => undefined) },
        }),
      )
      .catch(() => undefined);
  };
  const viewer = (
    <PhotoViewer
      snapshot={snapshot}
      tiles={tiles}
      numbers={numbers}
      photoId={viewing?.photoId ?? ''}
      zoom={viewing?.zoom ?? null}
      onNavigate={(photoId) => setViewing({ photoId, zoom: null })}
      onClose={() => setViewing(null)}
      onEditCaption={(tile) => {
        setViewing(null);
        onCaptionPhoto?.(tile);
      }}
      onRemove={remove}
    />
  );
  return { tiles, numbers, openPhoto, openCrop, viewer };
}

/** Everything the nameplate reads and writes of its suggestions. */
export function useNameplateSuggestions({
  api,
  state,
  snapshot,
  block,
  registry,
  onCaptionPhoto,
}: {
  api: FichaApi;
  state: EntityState;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  /** The device's manufacturer words (the create hint and a typed manufacturer are checked against them). */
  registry: readonly WordRow[];
  onCaptionPhoto?: (tile: PhotoTile) => void;
}): NameplateSuggestionsModel {
  const { showToast } = useToast();
  const rows = useMemo(() => suggestionRowsOf(state, api.relatorioId), [state, api.relatorioId]);
  const pending = useMemo(() => pendingSuggestions(rows), [rows]);
  const list = useMemo(() => nameplateSuggestions(block, pending), [block, pending]);
  const entries = useMemo(() => new Map(list.map((entry) => [entry.field.key, entry])), [list]);
  const counts = useMemo(() => suggestionGroupCounts(block, pending, registry), [block, pending, registry]);
  const createsEntry = (s: SuggestionRow) => hasCreateHint(s, registry);

  const confirmed = (text: string) => {
    showToast(text);
    api.announce(text);
  };
  // F-25: a confirmation is said once the fields it confirmed are drawn confirmed (their
  // suggestions no longer pending on this device), never while a pill still shows.
  const [saying, setSaying] = useState<readonly { ids: readonly string[]; text: string }[]>([]);
  const sayWhenDrawn = (ids: readonly string[], text: string) => setSaying((current) => [...current, { ids, text }]);
  useEffect(() => {
    if (saying.length === 0) return;
    const waiting = new Set(pending.map((row) => row.id));
    const drawn = saying.filter((entry) => entry.ids.every((id) => !waiting.has(id)));
    if (drawn.length === 0) return;
    setSaying((current) => current.filter((entry) => !drawn.includes(entry)));
    for (const entry of drawn) confirmed(entry.text);
    // `confirmed` reads the latest toast and announcer; the pending rows and the queue decide.
  }, [pending, saying]);

  // A second tap before the first confirm has landed (and the registry query caught up) writes
  // nothing: "Criar Celtta?" tapped twice never creates two manufacturers.
  const inFlight = useRef(new Set<string>());
  const confirm = (s: SuggestionRow, field: FieldDef) => {
    if (inFlight.current.has(s.id)) return;
    inFlight.current.add(s.id);
    const text = confirmedFieldToastText(screenLabel(field.label), suggestionValueText(field, s.value));
    const hint = hasCreateHint(s, registry) ? s.hint!.create_registry_entry : null;
    void api
      // "Criar Celtta?": the registry row and the confirm pair, one batch.
      .edit((_blocks, by) => (hint === null ? confirmSuggestionOps(by, s) : [createWordOp(by, hint.kind, newId(), hint.name), ...confirmSuggestionOps(by, s)]))
      .then((batch) => {
        if (batch !== null) sayWhenDrawn([s.id], text);
      })
      .catch(() => undefined)
      .finally(() => inFlight.current.delete(s.id));
  };

  const confirmAll = () => {
    let done = 0;
    let skipped = 0;
    let ids: string[] = [];
    void api
      .edit((blocks, by) => {
        // The freshest sheet decides: a field typed a moment ago is no longer a fill.
        const fresh = blocks.find((row) => row.id === block.id) ?? block;
        const picked = confirmAllCandidates(fresh, pending, registry);
        done = picked.length;
        skipped = suggestionGroupCounts(fresh, pending, registry).verify;
        ids = picked.map((s) => s.id);
        return picked.length === 0 ? null : picked.flatMap((s) => confirmSuggestionOps(by, s));
      })
      .then((batch) => {
        if (batch !== null) sayWhenDrawn(ids, confirmedAllToastText(done, skipped));
      })
      .catch(() => undefined);
  };

  const type = (s: SuggestionRow, field: FieldDef, text: string): Promise<boolean> | 'invalid' | 'unchanged' => {
    if (text === fieldInputText(field, s.value)) return 'unchanged';
    const parsed = parseFieldInput(field, text);
    if (!parsed.ok) return 'invalid';
    const value = parsed.value;
    // A manufacturer the registry does not hold is created with the typed put (one batch).
    const create = unknownManufacturer(field, value, registry);
    return api
      .edit((_blocks, by) =>
        value === null
          ? [discardSuggestionOp(by, s)]
          : [
              ...(create ? [createWordOp(by, 'manufacturer', newId(), value as string)] : []),
              nameplateOp(by, api.relatorioId, block.id, field.key, value),
              discardSuggestionOp(by, s),
            ],
      )
      .then((batch) => batch !== null)
      .catch(() => false);
  };

  // --- the viewer, opened on a crop's region when the photo is on this device -----------
  const { tiles, numbers, openPhoto, openCrop, viewer } = useCropViewer({ api, snapshot, onCaptionPhoto });

  const sourceOf = (id: string) => rows.find((row) => row.id === id) ?? snapshot.suggestions.find((row) => row.id === id) ?? null;

  // "da foto 3": the group's suggestions all came from one photo this device numbers.
  const sourcePhoto = singleSourcePhotoId(list.filter((entry) => entry.view !== 'none').map((entry) => entry.suggestion));
  const photoNumber = sourcePhoto === null ? null : (numbers.get(sourcePhoto) ?? null);

  return { entries, counts, sourceOf, confirm, confirmAll, type, openCrop, openPhoto, viewer, pending, tiles, numbers, photoNumber, createsEntry };
}

/** The group head: the note and "Confirmar todos (N)", the button only while N > 0. */
export function SuggestionGroupHead({ model }: { model: NameplateSuggestionsModel }) {
  const { counts } = model;
  return (
    <div className="suggestion-group-head">
      <p className="section-note">{suggestionGroupNoteText(counts.shown, counts.verify, model.photoNumber)}</p>
      {counts.confirmable > 0 ? (
        <button type="button" className="btn btn-secondary" onClick={model.confirmAll}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-check-all" />
          </svg>
          {confirmarTodosText(counts.confirmable)}
        </button>
      ) : null}
    </div>
  );
}

const COMBOBOX_KINDS: ReadonlySet<FieldDef['kind']> = new Set(['select', 'manufacturer', 'voltage_class']);

/**
 * A pending suggestion on an empty field: the guess, editable in place. "Confirmar" writes
 * it as it was read; a committed change (blur or Enter) writes what was typed instead.
 */
export function SuggestionFill({ model, field, suggestion }: { model: NameplateSuggestionsModel; field: FieldDef; suggestion: SuggestionRow }) {
  const t = copy.ficha.nameplate;
  const labelId = useId();
  const helperId = useId();
  const initial = fieldInputText(field, suggestion.value);
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const label = screenLabel(field.label);
  const valueText = suggestionValueText(field, suggestion.value);
  const isNumber = field.kind === 'number';
  const root = useRef<HTMLDivElement>(null);
  /** While a typed value is being written (and once it is), a second blur or tap writes nothing. */
  const written = useRef(false);
  /**
   * F-01: a pointer press on this field's own "Confirmar" is in progress. Only then does the
   * input's blur leave the decision to the button (one write, never two); Tab onto the
   * button, a tap on another field or anywhere else commits the typed value on the blur.
   */
  const pressingConfirm = useRef(false);

  const commit = (refocus: boolean) => {
    if (written.current) return;
    const result = model.type(suggestion, field, text);
    setInvalid(result === 'invalid');
    if (typeof result === 'string') return;
    written.current = true;
    void result.then((ok) => {
      // A refused or empty write leaves the guess editable again.
      if (!ok) {
        written.current = false;
        return;
      }
      if (refocus) focusPlainField(field.key);
    });
  };
  const invalidText = field.kind === 'number' ? t.invalidNumber : field.kind === 'date' ? t.invalidDate : field.kind === 'voltage_class' ? t.invalidVoltage : t.invalidOption;
  const input = (
    <input
      className={isNumber ? 'mf-value' : 'sv'}
      aria-labelledby={labelId}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? helperId : undefined}
      inputMode={isNumber ? 'decimal' : undefined}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        if (invalid) setInvalid(false);
      }}
      onBlur={() => {
        // A press on this field's "Confirmar" decides on its own (below), never twice.
        if (pressingConfirm.current) return;
        commit(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit(true);
      }}
    />
  );
  const creates = model.createsEntry(suggestion) && text === initial;
  const createName = suggestion.hint?.create_registry_entry.name ?? '';
  return (
    <div
      ref={root}
      data-field-key={field.key}
      className="ficha-suggestion"
      data-suggestion-id={suggestion.id}
      onPointerDownCapture={(event) => {
        pressingConfirm.current = event.target instanceof Element && event.target.closest('.confirm-btn') !== null;
      }}
      onBlur={(event) => {
        // F-01: the focus left the field for good (a press on "Confirmar" that did not land,
        // then a tap elsewhere): whatever was typed is committed, never dropped.
        const next = event.relatedTarget;
        if (next instanceof Node && root.current?.contains(next)) return;
        pressingConfirm.current = false;
        commit(false);
      }}
    >
      <SuggestionField
        label={label}
        labelId={labelId}
        state={suggestion.trust === 'verify' ? 'verify' : 'suggested'}
        // "Criar Celtta?" only while the guess is the one read: an edited guess confirms what was
        // typed. Its accessible name starts with those visible words (E78-Q13, label in name).
        {...(creates
          ? { confirmLabel: criarText(createName), announcement: criarAnnouncement(createName, suggestion.trust) }
          : { announcement: suggestionAnnouncement(suggestion.trust, valueText) })}
        combobox={COMBOBOX_KINDS.has(field.kind)}
        valueClassName={isNumber ? 'measurement-field' : 'input'}
        bare
        crop={<CropThumb photoId={suggestion.source.photo_id} bbox={suggestion.source.bbox} label={label} onPress={() => model.openCrop(suggestion)} />}
        // An edited guess confirms what the engineer sees: the typed value, this suggestion discarded.
        onConfirm={() => {
          pressingConfirm.current = false;
          if (text === initial) model.confirm(suggestion, field);
          else commit(false);
        }}
        after={
          invalid ? (
            <span className="helper" data-tone="red" id={helperId}>
              {invalidText}
            </span>
          ) : null
        }
      >
        {input}
        {isNumber && field.unit !== undefined ? <span className="mf-unit">{field.unit}</span> : null}
      </SuggestionField>
    </div>
  );
}

/**
 * After Enter over a guess: the focus follows the field to its plain form once the discard
 * has landed and the fill is gone, trying for a few frames (never the fill that unmounts).
 */
function focusPlainField(key: string, frames = 10): void {
  requestAnimationFrame(() => {
    const root = document.querySelector<HTMLElement>(`#ficha-nameplate [data-field-key="${key}"]:not(.ficha-suggestion)`);
    const target = root === null ? null : firstFocusable(root);
    if (target !== null) target.focus();
    else if (frames > 1) focusPlainField(key, frames - 1);
  });
}

/** "Sugerido: 15 kV — Substituir" under a field the engineer filled with another value. */
export function ReplaceLine({ model, field, suggestion }: { model: NameplateSuggestionsModel; field: FieldDef; suggestion: SuggestionRow }) {
  return (
    <span className="suggestion-alt" data-suggestion-id={suggestion.id}>
      {replaceLineText(suggestionValueText(field, suggestion.value))}
      <button type="button" className="btn btn-text" onClick={() => model.confirm(suggestion, field)}>
        {ui.suggestionField.replace}
      </button>
    </span>
  );
}

/**
 * The wrapper of every plain nameplate field. A cell a suggestion filled (`source`) shows as
 * `data-state="confirmed"` with the crop shrunk to its glyph; otherwise only the field. The
 * element stays the same either way, so the field is never remounted when that changes.
 */
export function NameplateField({ model, field, source, children }: { model: NameplateSuggestionsModel; field: FieldDef; source: SuggestionRow | null; children: ReactNode }) {
  return (
    <div
      className={source === null ? 'ficha-nameplate-field' : 'ficha-nameplate-field suggestion-field ficha-suggestion-confirmed'}
      data-state={source === null ? undefined : 'confirmed'}
      data-suggestion-id={source?.id}
    >
      {children}
      {source === null ? null : (
        <CropThumb photoId={source.source.photo_id} bbox={source.source.bbox} label={screenLabel(field.label)} onPress={() => model.openCrop(source)} />
      )}
    </div>
  );
}
