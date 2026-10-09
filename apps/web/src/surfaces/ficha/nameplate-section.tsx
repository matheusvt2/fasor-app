import {
  camposCopiadosText,
  discardSuggestionOp,
  isCellFilled,
  lastNameplateCopy,
  nameplateCopyFields,
  nameplateIsEmpty,
  nameplateTagPrefill,
  PLATE_CAPTION,
  plateCropRegion,
  platePhotoOf,
  plateReadingTarget,
  plateReadingView,
  showsConfirmedGlyph,
  supersededPlatePhotos,
  suggestionView,
  typedTurnsDownSuggestion,
  suggestNameplateCopy,
  toIso,
  type BlockDefinition,
  type BlockRow,
  type EntityState,
  type EquipmentRow,
  type JsonValue,
  type RelatorioSnapshot,
  type WordRow,
} from '@app/domain';
import { useId, useMemo, useRef, useState, type FocusEvent } from 'react';
import { Chip } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { writeReadingCancelled } from '../../db/prefs.ts';
import { discardCancelledReadings } from '../../db/suggestion-store.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { requestSyncCycle } from '../../state/sync.tsx';
import type { FichaApi } from './ficha-api.ts';
import { firstFocusable, ReadOnlyField, SheetField } from './ficha-fields.tsx';
import { createWordOp, nameplateOp } from './ficha-ops.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import { NameplateField, ReplaceLine, SuggestionFill, SuggestionGroupHead, useNameplateSuggestions } from './nameplate-suggestions.tsx';
import { useAiFeatures } from '../../state/ai-features.tsx';
import { PlateCameraGroup, PlateCrop, PlatePhotoRow, type PlateRetake } from './plate-photo.tsx';
import { useReadingCancelled } from './reading-line.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Stories 5.3 and 12.4 (FR-23, FR-34, AR-10, AR-24; `key-equipment-sheet-v09.html` "Dados
 * de placa"): every field of the definition is visible from the start, rendered by kind
 * and committing `sheet/{blockId}/nameplate/{fieldKey}` (D-6: "Digitar" is gone; the
 * "Fotografar placa" tile is Epic 8's and will sit above the fields). While the plate is
 * empty the copy chips that apply sit above the fields: "Igual à ⟨TAG⟩?" first (the most
 * specific match; never the per-unit fields, D-3), then "Copiar da última visita (⟨TAG⟩)";
 * both copy plain values in one batch with "Desfazer". The TAG field shows the block's TAG
 * while it has no cell of its own ("Do bloco · editável", J-09): nothing is written until
 * the engineer types, and renaming the block moves it.
 *
 * Story 8.1: the device's pending suggestions of this plate (`nameplate-suggestions.tsx`):
 * a fill takes the field's place as a Suggestion field, a differing value keeps the field
 * and adds the replace line, a confirmed cell shows its crop glyph; while any fill is
 * pending the section is `.nameplate-extraction` with the group head above the fields.
 *
 * Stories 8.2 and 8.6 (`plate-photo.tsx`): above the fields, the "Fotografar placa" tile
 * (with the copy chips) while the sheet has no plate photo; then the photo's row with its
 * reading line; and, while suggestions read from it wait, the plate crop with the focused
 * field's region outlined (focus inside the grid names the field by its `data-field-key`).
 *
 * Review 2026-10-08: a reading that read nothing offers "Fotografar de novo"; the new shot
 * becomes the plate photo and the older plate photos' readings are cancelled on this device,
 * so whatever they bring, now or later, is discarded (CAPT-V1). A typed value that changes a
 * field under a replace line discards that suggestion in the same batch (DG-2).
 */
export function NameplateSection({
  api,
  snapshot,
  state,
  block,
  definition,
  equipment,
  registries,
  onCaptionPhoto,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  /** The relatório's rows: its suggestion rows are read from here (a snapshot holds only confirmed ones). */
  state: EntityState;
  block: BlockRow;
  definition: BlockDefinition;
  equipment: readonly EquipmentRow[];
  registries: { manufacturer: readonly WordRow[]; voltage_class: readonly WordRow[] };
  /** "Editar legenda" in the viewer a crop opened. */
  onCaptionPhoto?: (tile: PhotoTile) => void;
}) {
  const t = copy.ficha.nameplate;
  // Story 11.8 follow-up: "Fotografar placa" (the plate reading) is hidden while the server's AI features are off.
  const aiFeatures = useAiFeatures();
  const headingId = useId();
  const readOnly = useSheetReadOnly();
  const suggestions = useNameplateSuggestions({
    api,
    state,
    snapshot,
    block,
    registry: registries.manufacturer,
    ...(onCaptionPhoto === undefined ? {} : { onCaptionPhoto }),
  });
  // --- Stories 8.2/8.6: the plate photo, its reading and the crop ---------------------------
  const plate = useMemo(() => platePhotoOf(suggestions.tiles, block.id), [suggestions.tiles, block.id]);
  const view = plate === null ? null : plateReadingView(plate, suggestions.rows);
  const db = useSession().database;
  // DG-2: the suggestions still pending as last drawn (a turn-down never discards one confirmed meanwhile).
  const pendingIds = useRef(new Set<string>());
  pendingIds.current = new Set(suggestions.pending.map((row) => row.id));
  // DG-2: the suggestions this sheet already wrote a discard for (one discard each, even when
  // Enter, a blur and "Criar" follow each other before the sheet is drawn again).
  const turnedDown = useRef(new Set<string>());
  const plateCancelled = useReadingCancelled(plate?.id ?? '');
  const region = plate === null || view !== 'ready' ? null : plateCropRegion(suggestions.pending, plate.id);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  if (definition.nameplate.length === 0) return null;
  const grouped = !readOnly && suggestions.counts.fills > 0;

  const empty = nameplateIsEmpty(block);
  const own = block.equipment_id === null ? undefined : equipment.find((row) => row.id === block.equipment_id);
  const same = empty && !readOnly ? suggestNameplateCopy({ blocks: snapshot.blocks, equipment }, block.id) : null;
  const lastVisit = empty && !readOnly && own?.last_nameplate != null ? lastNameplateCopy(own, definition) : [];
  const tagPrefill = nameplateTagPrefill({ blocks: snapshot.blocks, equipment }, block.id);

  function copyFrom(fields: readonly { fieldKey: string; value: unknown }[], toast: (n: number) => string): void {
    if (fields.length === 0) return;
    void api
      .edit((_blocks, by) => fields.map((entry) => nameplateOp(by, api.relatorioId, block.id, entry.fieldKey, entry.value)))
      .then((batch) => api.undoable(toast(fields.length), batch))
      .catch(() => undefined);
  }

  function copySame(): void {
    if (same === null) return;
    void api
      .edit((blocks, by) => {
        const source = blocks.find((row) => row.id === same.sourceBlockId && row.removed_at === null);
        if (source === undefined) return null;
        return nameplateCopyFields(source, definition).map((entry) => nameplateOp(by, api.relatorioId, block.id, entry.fieldKey, entry.value));
      })
      .then((batch) => api.undoable(t.copiedFrom(same.tag), batch))
      .catch(() => undefined);
  }

  /** The plate tile's shot: a normal sheet photo, captioned and asking for the plate reading. */
  const plateTarget = (): CaptureTarget => ({
    blockId: block.id,
    itemKey: null,
    caption: PLATE_CAPTION,
    reading: { kind: 'plate', target: plateReadingTarget(block.id, block.block_type) as JsonValue },
  });

  /**
   * CAPT-V1: "Fotografar de novo" took its shot: every older plate photo of this sheet has its
   * reading cancelled here (`reading_cancelled:{photo}`), and what they already brought is
   * discarded now; the post-pull sweep discards what they bring later. The photos stay.
   */
  const cancelOlderPlates = (shot: CaptureTarget) => {
    const author = api.author;
    if (db === null || author === null) return;
    // The new photo (its id assigned before the shot) is never among them, whatever the tiles hold now.
    const older = supersededPlatePhotos(suggestions.tiles, block.id, shot.fileId).map((tile) => tile.id);
    const at = toIso(now());
    void Promise.all(
      older.map((photoId) => writeReadingCancelled(db, photoId, at).then(() => discardCancelledReadings(db, author, { newId, now }, photoId))),
    )
      .then((discarded) => {
        if (discarded.some((ids) => ids.length > 0)) requestSyncCycle();
      })
      .catch((error: unknown) => console.error('older plate readings not cancelled', error));
  };
  // The retake's photo id is assigned up front, so the cancel above can spare it by id.
  const retakeTarget = (): CaptureTarget => ({ ...plateTarget(), fileId: newId() });
  const retake: PlateRetake | null = readOnly || !aiFeatures ? null : { relatorioId: api.relatorioId, target: retakeTarget, onShot: cancelOlderPlates };

  /** The focused field's region on the plate: its pending suggestion's, else its confirmed source's (this photo only). */
  const focusedBox = (() => {
    if (plate === null || region === null || focusedKey === null) return null;
    const entry = suggestions.entries.get(focusedKey);
    if (entry !== undefined && entry.suggestion.source.photo_id === plate.id) return entry.suggestion.source.bbox;
    const sourceId = block.sheet.nameplate[focusedKey]?.source_suggestion_id ?? null;
    const source = sourceId === null ? null : suggestions.sourceOf(sourceId);
    return source !== null && source.source.photo_id === plate.id ? source.source.bbox : null;
  })();

  const trackFocus = (event: FocusEvent<HTMLDivElement>) => {
    const key = event.target instanceof HTMLElement ? (event.target.closest('[data-field-key]')?.getAttribute('data-field-key') ?? null) : null;
    setFocusedKey(key);
  };
  const dropFocus = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocusedKey(null);
  };

  /** "Preencher manualmente": the first empty field of the plate takes the focus. */
  const fillManually = () => {
    // Every field filled: the first one (the engineer is taken to the plate either way).
    const key =
      definition.nameplate.find((field) => !isCellFilled(block.sheet.nameplate[field.key]) && !(field.key === 'tag' && tagPrefill !== null))?.key ?? definition.nameplate[0]?.key;
    if (key === undefined) return;
    const root = document.querySelector<HTMLElement>(`#ficha-nameplate .nameplate-grid [data-field-key="${key}"]`);
    const target = root === null ? null : firstFocusable(root);
    target?.focus();
  };

  /**
   * DG-2: the replace suggestion a typed `next` turns down: the field's pending suggestion under
   * "Sugerido: … — Substituir" when `next` is a value other than it; null otherwise (an equal
   * value is the device's auto-confirm to make, a cleared field makes it a fill again).
   */
  function replacedBy(fieldKey: string, next: unknown) {
    const entry = suggestions.entries.get(fieldKey);
    return entry !== undefined && typedTurnsDownSuggestion(entry.view, entry.suggestion.value, next, entry.field) ? entry.suggestion : null;
  }

  /**
   * DG-2 (r8cap-correctness-2): the engineer left the field (blur) or pressed Enter. The idle
   * commit while typing never discards; this one-op batch does, on the relatório's edit queue
   * after the field's own commit (the input's handlers run before this wrapper's), reading the
   * value as stored then: still under the replace line and not equal to the suggestion.
   */
  function turnDownOnLeave(fieldKey: string): void {
    const entry = suggestions.entries.get(fieldKey);
    if (entry?.view !== 'replace') return;
    const s = entry.suggestion;
    void api
      .edit((blocks, by) => {
        const fresh = blocks.find((row) => row.id === block.id);
        if (fresh === undefined || !pendingIds.current.has(s.id) || turnedDown.current.has(s.id)) return null;
        const cell = fresh.sheet.nameplate[fieldKey];
        const view = suggestionView(cell, s, entry.field);
        if (!typedTurnsDownSuggestion(view, s.value, cell?.value ?? null, entry.field)) return null;
        turnedDown.current.add(s.id);
        return [discardSuggestionOp(by, s)];
      })
      .catch(() => undefined);
  }

  function createWord(fieldKey: string, kind: 'manufacturer' | 'voltage_class', name: string): void {
    const replaced = replacedBy(fieldKey, name);
    if (replaced !== null) turnedDown.current.add(replaced.id);
    void api
      .edit((_blocks, by) => [
        createWordOp(by, kind, newId(), name),
        nameplateOp(by, api.relatorioId, block.id, fieldKey, name),
        ...(replaced === null ? [] : [discardSuggestionOp(by, replaced)]),
      ])
      .catch(() => undefined);
  }

  /** E78-Q4: "Criar ⟨nome⟩?" of a stored name the registry does not hold: the registry row alone. */
  function registerWord(kind: 'manufacturer' | 'voltage_class', name: string): void {
    void api.edit((_blocks, by) => [createWordOp(by, kind, newId(), name)]).catch(() => undefined);
  }

  const chipRow =
    same === null && (lastVisit.length === 0 || own === undefined) ? null : (
      <div className="chip-row ficha-nameplate-chips" role="group" aria-label={t.chipsLabel}>
        {same === null ? null : (
          <Chip onPress={copySame}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-repeat" />
            </svg>
            {t.igualA(same.tag)}
          </Chip>
        )}
        {lastVisit.length === 0 || own === undefined ? null : (
          <Chip onPress={() => copyFrom(lastVisit, camposCopiadosText)}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-repeat" />
            </svg>
            {t.lastVisit(own.tag)}
          </Chip>
        )}
      </div>
    );

  return (
    <section className={grouped ? 'section nameplate-extraction' : 'section'} id="ficha-nameplate" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{t.title}</h2>
      </div>
      {plate !== null && region !== null && !readOnly ? (
        <PlateCrop photoId={plate.id} region={region} focused={focusedBox} onOpen={() => suggestions.openPhoto(plate.id, region)} />
      ) : null}
      {grouped ? <SuggestionGroupHead model={suggestions} /> : null}
      {plate === null && !readOnly && aiFeatures ? <PlateCameraGroup relatorioId={api.relatorioId} target={plateTarget} chips={chipRow} /> : chipRow}
      {plate !== null && view !== null && view !== 'ready' ? (
        <>
          <PlatePhotoRow
            tile={plate}
            number={suggestions.numbers.get(plate.id) ?? null}
            view={view}
            onOpen={() => suggestions.openPhoto(plate.id)}
            onFillManually={readOnly ? null : fillManually}
            retake={retake}
          />
          {/* Review F-07: once the reading was cancelled here, nothing will overwrite the fields: no note. */}
          {(view === 'queued' || view === 'running') && plateCancelled !== true ? <p className="section-note">{t.fieldsNote}</p> : null}
        </>
      ) : null}
      <div className="nameplate-grid" onFocus={trackFocus} onBlur={dropFocus}>
        {definition.nameplate.map((field) => {
          const stored = block.sheet.nameplate[field.key];
          const prefilled = field.key === 'tag' && stored === undefined && tagPrefill !== null;
          const value = prefilled ? tagPrefill : (stored?.value ?? null);
          const helper = prefilled ? t.tagHelper : undefined;
          if (readOnly) return <ReadOnlyField key={field.key} field={field} value={value} {...(helper === undefined ? {} : { helper })} />;
          const pending = suggestions.entries.get(field.key);
          if (pending?.view === 'fill') return <SuggestionFill key={`${field.key}:${pending.suggestion.id}`} model={suggestions} field={field} suggestion={pending.suggestion} />;
          const after = pending?.view === 'replace' ? <ReplaceLine model={suggestions} field={field} suggestion={pending.suggestion} /> : null;
          const source = showsConfirmedGlyph(stored, snapshot.relatorio.status) ? suggestions.sourceOf(stored!.source_suggestion_id!) : null;
          const sheetField = (
            <SheetField
              key={field.key}
              field={field}
              value={value}
              {...(helper === undefined ? {} : { helper })}
              missing={!prefilled && !isCellFilled(stored)}
              draft={{ entityId: block.id, field: `placa-${field.key.replace(/_/g, '-')}` }}
              invalidText={t.invalidNumber}
              selectEmpty={t.selectEmpty}
              registries={registries}
              blocks={snapshot.blocks}
              onCreateWord={(kind, name) => createWord(field.key, kind, name)}
              onRegisterWord={registerWord}
              commit={(next) => {
                if (api.author === null) return undefined;
                // DG-2: a typed value that changes the field under "Sugerido: … — Substituir"
                // discards that suggestion in the same batch (the engineer chose the typed one).
                // DG-2: never a discard here (this may be the idle commit mid-typing); leaving
                // the field or Enter turns the suggestion down (`turnDownOnLeave`).
                return api.commit([nameplateOp(api.author, api.relatorioId, block.id, field.key, next)]);
              }}
              after={after}
              // F-01: a suggestion landing on this field while it holds uncommitted typing
              // swaps it out; the typed text is committed then, never replaced by the guess.
              flushOnUnmount
            />
          );
          // One wrapper for every field, confirmed or not, so the field keeps its place in the
          // tree when a typed correction clears the provenance mid-typing (no remount).
          return (
            <NameplateField key={field.key} model={suggestions} field={field} source={source} onLeave={pending?.view === 'replace' ? () => turnDownOnLeave(field.key) : undefined}>
              {sheetField}
            </NameplateField>
          );
        })}
      </div>
      {suggestions.viewer}
    </section>
  );
}
