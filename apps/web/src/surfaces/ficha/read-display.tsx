import {
  compareSuggestion,
  confirmarTodosText,
  confirmedAllToastText,
  confirmedFieldToastText,
  confirmSuggestionOps,
  discardSuggestionOp,
  displayBurstHintText,
  displayBurstStart,
  displayBurstStop,
  displayBurstStops,
  displayCellTarget,
  displayEnvTarget,
  displayMismatchText,
  MISMATCH_LINE_SEP,
  displayEnvLineField,
  displayLineShown,
  displayQueuedCells,
  displayQueuedEnv,
  envSuggestions,
  formatDecimalGroupedPtBr,
  measurementConfirmAllCandidates,
  measurementSuggestions,
  measurementTableVerifyCount,
  parseFieldInput,
  parseReadingPtBr,
  pendingSuggestions,
  readingNeedsAi,
  readingWaitStart,
  screenLabel,
  showsConfirmedGlyph,
  storedTestCell,
  suggestionAnnouncement,
  suggestionRowsOf,
  suggestionValueText,
  type BlockDefinition,
  type BlockRow,
  type CellAddress,
  type DisplayBurstStop,
  type DisplayQueuedEntry,
  type EntityState,
  type EnvSuggestion,
  type EvaluatedCell,
  type FieldDef,
  type JsonValue,
  type LocationRow,
  type MeasurementSuggestion,
  type PhotoFileRow,
  type RelatorioSnapshot,
  type SuggestionRow,
} from '@app/domain';
import { useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { CropThumb } from '../../components/crop-thumb.tsx';
import { SuggestionField } from '../../components/suggestion-field.tsx';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import { useAiFeatures } from '../../state/ai-features.tsx';
import { useServerReachable } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { useCamera } from './camera-view.tsx';
import type { FichaApi } from './ficha-api.ts';
import { cabineEnvOp, testCellOp } from './ficha-ops.ts';
import { cellKey, MeasurementField, type RunDirection } from './measurement-field.tsx';
import { useCropViewer } from './nameplate-suggestions.tsx';
import { CancelledReading, DisplayEmptyLine, DisplayFailedLine, ReadingWaitLine, useReadingCancelled, useRereadAt } from './reading-line.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Story 9.1 (FR-36/37, EXPERIENCE.md › Measurement readings and Read display button;
 * `60-ficha.html` `.mt-actions`, `.read-display-btn[data-count]`, `.queued-banner`, the
 * suggested and confirmed cells): "Ler visor" on the sheet.
 *
 * - The opener on each Measurement table's title row opens the burst camera; each shot is a
 *   sheet photo created with the display reading of one row (`displayCellTarget`), the hint
 *   naming the next row, until "Concluir" or the sheet's last row. The thermo-hygrometer's
 *   opener in "Da cabine" takes one shot of the cabine's environment.
 * - Until its reading runs the start cell shows "Foto guardada — leitura quando houver sinal"
 *   and stays typeable.
 * - A reading on an empty cell is a suggested (or "Verificar") cell: its crop, the editable
 *   guess and "Confirmar"; Enter confirms it and runs on; a changed value writes what was
 *   typed and discards this suggestion alone, one batch.
 * - A reading beside a different typed value is the line "Visor: 147 GΩ · digitado 14,7 GΩ —
 *   Conferir", a tap on either value keeping it; an equal one is confirmed by the device
 *   after the pull (`db/suggestion-store.ts`), the cell gaining its crop glyph.
 *
 * Every rule and text is the kernel's (`measurementSuggestions`, `displayBurst*`,
 * `displayMismatchText`, `displayQueuedCells`); this renders them and writes their batches.
 *
 * Review 2026-10-08: a reading that ended with nothing read, on an empty cell or field, is
 * "Nada foi lido nesta foto" with "Fotografar de novo" (one shot of that photo's own target
 * and caption; the line hosts its camera, which stays mounted when the new photo takes the
 * line) and "Digitar" (CAPT-V1). The wait counts only once the server holds the bytes (DG-4).
 */

type Cabine = Extract<LocationRow, { kind: 'cabine' }>;
type DisplayPhoto = Pick<PhotoFileRow, 'id' | 'reading_kind' | 'reading_target' | 'reading_status' | 'local_seq' | 'captured_at' | 'block_id' | 'item_key' | 'caption'> & {
  removed_at?: string | null;
};

/** CAPT-V1: what "Fotografar de novo" on an empty display reading needs: the relatório and the live photos (the one to retake is found by id). */
export interface DisplayRetake {
  relatorioId: string;
  photos: readonly DisplayPhoto[];
}

/** The live display photos of the relatório on this device (the snapshot's photo rows). */
function photosOf(snapshot: RelatorioSnapshot): DisplayPhoto[] {
  return snapshot.files.flatMap((file) => (file.kind === 'photo' ? [file as DisplayPhoto] : []));
}

function numberOf(value: unknown): { raw: string; unit: string | null } {
  const v = (value ?? {}) as { raw?: unknown; unit?: unknown };
  return { raw: typeof v.raw === 'string' ? v.raw : '', unit: typeof v.unit === 'string' ? v.unit : null };
}

const NUMBER: Pick<FieldDef, 'kind'> = { kind: 'number' };

/**
 * One write per suggestion at a time: a second tap on a pick or a Confirmar before the first
 * batch has landed writes nothing (never two batches for one suggestion).
 */
function useOncePerSuggestion(): (s: Pick<SuggestionRow, 'id'>, write: () => Promise<unknown>) => void {
  const inFlight = useRef(new Set<string>());
  return (s, write) => {
    if (inFlight.current.has(s.id)) return;
    inFlight.current.add(s.id);
    void write()
      .catch(() => undefined)
      .finally(() => inFlight.current.delete(s.id));
  };
}

// --- the Measurement cells ---------------------------------------------------------------

export interface DisplayModel {
  block: BlockRow;
  /** The pending display suggestion of each cell (`cellKey`), with its view. */
  entries: ReadonlyMap<string, MeasurementSuggestion>;
  /** The start cells whose display photo still waits for its reading, or failed on an empty cell (`cellKey`). */
  queued: ReadonlyMap<string, DisplayQueuedEntry>;
  /** Story 13.5: the photo tiles (status op, capture time) the wait and failed lines read. */
  tiles: readonly PhotoTile[];
  /** The suggestion a confirmed cell was filled from (its crop), when the device holds it. */
  sourceOf: (id: string) => SuggestionRow | null;
  relatorioStatus: RelatorioSnapshot['relatorio']['status'];
  confirm: (s: SuggestionRow, label: string) => void;
  /** The typed value over a suggestion: the put and this suggestion's discard, one batch. */
  type: (s: SuggestionRow, cell: EvaluatedCell, text: string, label: string) => Promise<boolean> | 'invalid';
  keepTyped: (s: SuggestionRow) => void;
  /** E9-Q1: `exclude` names the cells that show a dictated reading (never confirmed in bulk, never counted). */
  confirmAll: (testKey: string, tableKey: string, exclude: readonly CellAddress[]) => void;
  confirmable: (testKey: string, tableKey: string, exclude: readonly CellAddress[]) => number;
  openCrop: (s: SuggestionRow) => void;
  viewer: ReactNode;
  photos: readonly DisplayPhoto[];
  /** CAPT-V1: the empty line's retake (the relatório and its photos). */
  retake: DisplayRetake;
}

export function useDisplaySuggestions({
  api,
  state,
  snapshot,
  block,
  onCaptionPhoto,
}: {
  api: FichaApi;
  state: EntityState;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  onCaptionPhoto?: Parameters<typeof useCropViewer>[0]['onCaptionPhoto'];
}): DisplayModel {
  const { showToast } = useToast();
  const rows = useMemo(() => suggestionRowsOf(state, api.relatorioId), [state, api.relatorioId]);
  const pending = useMemo(() => pendingSuggestions(rows), [rows]);
  const list = useMemo(() => measurementSuggestions(block, pending), [block, pending]);
  const entries = useMemo(() => new Map(list.map((entry) => [cellKey(entry.address), entry])), [list]);
  const photos = useMemo(() => photosOf(snapshot), [snapshot]);
  // CAPT-V1: with every suggestion row of any status, a done reading that read nothing is `empty`.
  const queued = useMemo(() => new Map(displayQueuedCells(photos, block.id, block, rows).map((entry) => [cellKey(entry.address), entry])), [photos, block, rows]);
  const retake = useMemo<DisplayRetake>(() => ({ relatorioId: api.relatorioId, photos }), [api.relatorioId, photos]);
  const { openCrop, viewer, tiles } = useCropViewer({ api, snapshot, onCaptionPhoto });

  const said = (text: string) => {
    showToast(text);
    api.announce(text);
  };

  const once = useOncePerSuggestion();
  const confirm = (s: SuggestionRow, label: string) => {
    const text = confirmedFieldToastText(label, suggestionValueText(NUMBER, s.value));
    once(s, () =>
      api
        .edit((_blocks, by) => confirmSuggestionOps(by, s))
        .then((batch) => {
          if (batch !== null) said(text);
        }),
    );
  };

  const type = (s: SuggestionRow, cell: EvaluatedCell, text: string, label: string): Promise<boolean> | 'invalid' => {
    const read = numberOf(s.value);
    const parsed = parseReadingPtBr(text, { units: cell.units, defaultUnit: read.unit });
    if (parsed === 'invalid') return 'invalid';
    const value = parsed === null ? null : { raw: parsed.raw, unit: parsed.unit, state: 'measured' as const };
    // The reading retyped as it is: that is a confirm.
    if (value !== null && compareSuggestion(value, s.value, NUMBER) === 'equal') {
      confirm(s, label);
      return Promise.resolve(true);
    }
    const { testKey, row, col } = cell.address;
    return api
      .edit((_blocks, by) => (value === null ? [discardSuggestionOp(by, s)] : [testCellOp(by, api.relatorioId, block.id, testKey, row, col, value), discardSuggestionOp(by, s)]))
      .then((batch) => batch !== null)
      .catch(() => false);
  };

  const keepTyped = (s: SuggestionRow) => {
    once(s, () =>
      api
        .edit((_blocks, by) => [discardSuggestionOp(by, s)])
        .then((batch) => {
          if (batch !== null) said(copy.ficha.ensaios.typedKept);
        }),
    );
  };

  const confirmAll = (testKey: string, tableKey: string, exclude: readonly CellAddress[]) => {
    let done = 0;
    let skipped = 0;
    void api
      .edit((blocks, by) => {
        // The freshest sheet decides: a cell typed a moment ago is no longer a fill; a cell
        // showing a dictated reading is left out as the button's count left it out.
        const fresh = blocks.find((row) => row.id === block.id) ?? block;
        const picked = measurementConfirmAllCandidates(fresh, pending, testKey, tableKey, exclude);
        done = picked.length;
        skipped = measurementTableVerifyCount(fresh, pending, testKey, tableKey, exclude);
        return picked.length === 0 ? null : picked.flatMap((s) => confirmSuggestionOps(by, s));
      })
      .then((batch) => {
        if (batch !== null) said(confirmedAllToastText(done, skipped));
      })
      .catch(() => undefined);
  };

  const confirmable = (testKey: string, tableKey: string, exclude: readonly CellAddress[]) => measurementConfirmAllCandidates(block, pending, testKey, tableKey, exclude).length;
  const sourceOf = (id: string) => rows.find((row) => row.id === id) ?? snapshot.suggestions.find((row) => row.id === id) ?? null;

  return { block, entries, queued, tiles, sourceOf, relatorioStatus: snapshot.relatorio.status, confirm, type, keepTyped, confirmAll, confirmable, openCrop, viewer, photos, retake };
}

/**
 * "Foto guardada — leitura quando houver sinal" (queued, offline) or "Lendo…" (running) under
 * a cell or a field. F-17: a queued reading on a device with signal reads "Lendo…" (State
 * Patterns › Reading in progress); the waiting words are for a device without one, or whose
 * server did not answer (F-13, `useServerReachable`). Story 13.5: the running line is the
 * shared wait line (its age from 10 s, "Cancelar", the still-reading note past 120 s), and a
 * failed reading on an empty target is the failed line with "Tentar novamente" and "Digitar".
 * Once the reading was cancelled on this device, only "Ler de novo" shows (review F-07).
 *
 * Review 2026-10-08: an empty reading on an empty target is the empty line with "Fotografar de
 * novo" and "Digitar" (CAPT-V1); the retake's camera is hosted here, in one place whatever the
 * line shows, so the new photo taking the line never replaces the open view. The wait counts
 * from the moment the server holds the bytes, "Lendo…" alone before (DG-4).
 */
export function QueuedBanner({ entry, tile, retake = null }: { entry: DisplayQueuedEntry; tile: PhotoTile | null; retake?: DisplayRetake | null }) {
  const t = copy.ficha.ensaios;
  // F-13 (review 2026-10-06): the plate row's rule, so both read alike on one sheet.
  const online = useServerReachable();
  const aiFeatures = useAiFeatures();
  const readOnly = useSheetReadOnly();
  const cancelled = useReadingCancelled(entry.photoId);
  // Epic 13 re-check N-1: after "Ler de novo" the wait counts from the press.
  const rereadAt = useRereadAt(entry.photoId);
  const canRetry = aiFeatures || !readingNeedsAi('display');
  // CAPT-V1: the retake's camera; the focus goes back to "Fotografar de novo", or to the cell's
  // or field's input once the new photo has replaced the empty line.
  const cellRoot = useRef<HTMLElement | null>(null);
  const opener = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const root = cellRoot.current;
        if (root === null || !root.isConnected) return null;
        return root.querySelector<HTMLElement>('[data-retake]') ?? root.querySelector<HTMLElement>('input');
      },
    }),
    [],
  );
  const retakePhoto = retake?.photos.find((photo) => photo.id === entry.photoId) ?? null;
  const retakeTarget = useRef<CaptureTarget | null>(null);
  if (entry.state === 'empty' && retakePhoto !== null) {
    retakeTarget.current = {
      blockId: retakePhoto.block_id,
      itemKey: retakePhoto.item_key,
      caption: retakePhoto.caption,
      reading: { kind: 'display', target: retakePhoto.reading_target as JsonValue },
    };
  }
  const camera = useCamera(retake?.relatorioId ?? '', () => retakeTarget.current ?? { blockId: null, itemKey: null, caption: null }, opener, { singleShot: true });
  const content = (() => {
    if (entry.state === 'failed') return <DisplayFailedLine photoId={entry.photoId} statusOpId={tile?.reading_status_op_id ?? null} canRetry={canRetry} />;
    // Review F-07: a reading cancelled on this device offers "Ler de novo" instead of the line.
    if (cancelled === true) return <CancelledReading photoId={entry.photoId} canRetry={canRetry} />;
    if (entry.state === 'empty') {
      if (cancelled !== false) return null;
      if (readOnly) {
        return (
          <p className="reading-line" role="status">
            {copy.readingWait.empty}
          </p>
        );
      }
      return (
        <DisplayEmptyLine
          photoId={entry.photoId}
          onRetake={
            retake === null || retakePhoto === null || !canRetry
              ? null
              : (root) => {
                  cellRoot.current = root;
                  camera.open();
                }
          }
          retakeOpening={camera.opening}
        />
      );
    }
    if (entry.state === 'queued' && (!online || tile?.upload_error)) {
      return (
        <span className="queued-banner">
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-image" />
          </svg>
          {online ? t.displayRunning : t.displayQueued}
        </span>
      );
    }
    if (tile === null) {
      // The photo's tile is not read yet: the plain line, nothing to count from.
      return (
        <span className="queued-banner">
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-image" />
          </svg>
          {t.displayRunning}
        </span>
      );
    }
    const startedAt = readingWaitStart({
      captured_at: tile.captured_at,
      bytes_acked_at: tile.bytes_acked_at ?? null,
      uploaded_at: tile.uploaded_at,
      reading_status_at: tile.reading_status_at ?? null,
      reread_at: rereadAt,
    });
    return <ReadingWaitLine photoId={entry.photoId} startedAt={startedAt} variant="display" />;
  })();
  return (
    <>
      {content}
      {camera.denied ? (
        <p className="camera-denied" role="status">
          {copy.photos.denied}
        </p>
      ) : null}
      {camera.element}
    </>
  );
}

/** The photo tile of a display line, when the device holds it. */
function tileOf(tiles: readonly PhotoTile[], photoId: string): PhotoTile | null {
  return tiles.find((tile) => tile.id === photoId) ?? null;
}

/**
 * "Visor: 147 GΩ · digitado 14,7 GΩ — Conferir": a tap on a value keeps it. Review fixes
 * 2026-10-06 (F-22): two lines on purpose, "Visor: 147 GΩ" then "digitado 14,7 GΩ — Conferir";
 * the " · " closing the first is visually hidden, so the read-out and `textContent` stay the
 * one-line text.
 */
export function MismatchLine({ value, suggestion, onVisor, onTyped }: { value: unknown; suggestion: SuggestionRow; onVisor: () => void; onTyped: () => void }) {
  const { lines } = displayMismatchText(value, suggestion);
  return (
    <span className="suggestion-alt" role="group" aria-label={copy.ficha.ensaios.mismatchLabel} data-suggestion-id={suggestion.id}>
      {lines.map((line, l) => (
        <span key={l} className="mismatch-line">
          {line.map((part, i) =>
            part.pick === undefined ? (
              <span key={i}>{part.text}</span>
            ) : (
              <button key={i} type="button" className="btn btn-text" onClick={part.pick === 'visor' ? onVisor : onTyped}>
                {part.text}
              </button>
            ),
          )}
          {l < lines.length - 1 ? <span className="visually-hidden">{MISMATCH_LINE_SEP}</span> : null}
        </span>
      ))}
    </span>
  );
}

/**
 * One Measurement cell with its display reading, if any: the suggested cell on an empty cell;
 * otherwise the Measurement field, with the crop glyph once a reading filled it, the mismatch
 * line beside a different typed value, and the queued line while its photo waits.
 */
export function ReadingCell({
  model,
  api,
  cell,
  label,
  presentation,
  missing,
  onRun,
}: {
  model: DisplayModel;
  api: FichaApi;
  cell: EvaluatedCell;
  label: string;
  presentation: 'table' | 'card';
  missing: boolean;
  onRun: (from: CellAddress, direction: RunDirection) => boolean;
}) {
  const key = cellKey(cell.address);
  const entry = model.entries.get(key);
  const queued = model.queued.get(key);
  const banner = queued === undefined ? null : <QueuedBanner entry={queued} tile={tileOf(model.tiles, queued.photoId)} retake={model.retake} />;
  if (entry !== undefined && entry.view === 'fill') {
    return <SuggestedCell key={entry.suggestion.id} model={model} cell={cell} suggestion={entry.suggestion} label={label} missing={missing} onRun={onRun} after={banner} />;
  }
  const stored = storedTestCell(model.block, cell.address);
  const source = stored !== null && showsConfirmedGlyph(stored, model.relatorioStatus) ? model.sourceOf(stored.source_suggestion_id!) : null;
  const crop =
    source === null ? undefined : <CropThumb source="display" photoId={source.source.photo_id} bbox={source.source.bbox} label={label} onPress={() => model.openCrop(source)} />;
  const mismatch =
    entry !== undefined && entry.view === 'replace' && stored !== null ? (
      <MismatchLine value={stored.value} suggestion={entry.suggestion} onVisor={() => model.confirm(entry.suggestion, label)} onTyped={() => model.keepTyped(entry.suggestion)} />
    ) : null;
  return (
    <MeasurementField
      api={api}
      cell={cell}
      label={label}
      presentation={presentation}
      missing={missing}
      onRun={onRun}
      confirmedCrop={crop}
      after={
        mismatch === null && banner === null ? undefined : (
          <>
            {mismatch}
            {banner}
          </>
        )
      }
    />
  );
}

/**
 * A reading on an empty cell (`60-ficha.html` suggested cell): the crop, the editable guess,
 * the unit and "Confirmar", with the "Sugerido" or "Verificar" pill. Enter confirms it (or
 * writes what was typed over it) and runs on; a blur writes only a changed value.
 */
function SuggestedCell({
  model,
  cell,
  suggestion,
  label,
  missing,
  onRun,
  after,
}: {
  model: DisplayModel;
  cell: EvaluatedCell;
  suggestion: SuggestionRow;
  label: string;
  missing: boolean;
  onRun: (from: CellAddress, direction: RunDirection) => boolean;
  after: ReactNode;
}) {
  const t = ui.measurementField;
  const helperId = useId();
  const read = numberOf(suggestion.value);
  const initial = formatDecimalGroupedPtBr(read.raw);
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const written = useRef(false);
  const key = cellKey(cell.address);
  const valueText = suggestionValueText(NUMBER, suggestion.value);
  const verify = suggestion.trust === 'verify';

  /** Writes this cell: the reading as read (unchanged), else what was typed; false when nothing could be. */
  const commit = (typedOnly: boolean): boolean => {
    if (written.current) return true;
    if (text === initial) {
      if (typedOnly) return false;
      written.current = true;
      model.confirm(suggestion, label);
      return true;
    }
    const result = model.type(suggestion, cell, text, label);
    if (result === 'invalid') {
      setInvalid(true);
      return false;
    }
    written.current = true;
    void result.then((ok) => {
      if (!ok) written.current = false;
    });
    return true;
  };

  return (
    <div className="ficha-cell" data-cell={key} data-suggestion-id={suggestion.id}>
      <div className="field suggestion-field" data-state={verify ? 'verify' : 'suggested'}>
        <div className="measurement-field">
          <CropThumb source="display" photoId={suggestion.source.photo_id} bbox={suggestion.source.bbox} label={label} onPress={() => model.openCrop(suggestion)} />
          <input
            className="mf-value"
            inputMode="decimal"
            autoComplete="off"
            aria-label={label}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? helperId : undefined}
            value={text}
            data-cell-input={key}
            data-missing-field={missing ? '' : undefined}
            onChange={(event) => {
              setText(event.target.value);
              if (invalid) setInvalid(false);
            }}
            onBlur={(event) => {
              // A tap on this cell's "Confirmar" decides on its own.
              const next = event.relatedTarget;
              if (next instanceof HTMLElement && next.classList.contains('confirm-btn') && event.currentTarget.parentElement?.contains(next)) return;
              commit(true);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (event.shiftKey) {
                onRun(cell.address, 'previous');
                return;
              }
              if (commit(false)) onRun(cell.address, 'next');
            }}
          />
          {read.unit === null ? null : (
            <span className="mf-unit" aria-label={t.unitNames[read.unit] ?? read.unit}>
              {read.unit}
            </span>
          )}
          <button type="button" className="confirm-btn" aria-label={suggestionAnnouncement(suggestion.trust, valueText)} onClick={() => commit(false)}>
            {ui.suggestionField.confirm}
          </button>
        </div>
        <span className={verify ? 'verify-pill' : 'suggested-pill'}>{verify ? ui.suggestionField.verify : ui.suggestionField.suggested}</span>
      </div>
      {invalid ? (
        <span className="helper" data-tone="red" id={helperId}>
          {t.invalid}
        </span>
      ) : null}
      {after}
    </div>
  );
}

// --- the burst opener ------------------------------------------------------------------------

/**
 * "Ler visor" on a table's title row: the burst camera, one shot per row from the table's
 * first row no display photo targets yet, across the sheet's tests, the badge counting the
 * burst ("Ler visor · 3").
 */
export function ReadDisplayButton({
  api,
  snapshot,
  block,
  definition,
  testKey,
  tableKey,
  targetFor,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  testKey: string;
  tableKey: string;
  /** The photo's sheet target and context caption, for the test a shot reads. */
  targetFor: (testKey: string) => CaptureTarget;
}) {
  const t = copy.ficha.ensaios;
  const opener = useRef<HTMLButtonElement>(null);
  const deniedId = useId();
  const stops = useMemo(() => displayBurstStops(block, definition), [block, definition]);
  const start = useRef(0);
  const targetOf = (stop: DisplayBurstStop): CaptureTarget => ({
    ...targetFor(stop.testKey),
    reading: { kind: 'display', target: displayCellTarget(block.id, block.block_type, stop.testKey, { row: stop.row, col: stop.col }) as JsonValue },
  });
  const shotTarget = (shot: number): CaptureTarget | null => {
    const stop = displayBurstStop(stops, start.current, shot);
    return stop === null ? null : targetOf(stop);
  };
  const camera = useCamera(
    api.relatorioId,
    () => {
      start.current = displayBurstStart(stops, photosOf(snapshot), block.id, testKey, tableKey);
      return shotTarget(0) ?? targetFor(testKey);
    },
    opener,
    { shotTarget, shotHint: (shot) => displayBurstHintText(displayBurstStop(stops, start.current, shot)), doneLabel: t.readDisplayDone },
  );
  return (
    <>
      <AriaButton
        ref={opener}
        className="read-display-btn"
        data-count={camera.burst > 0 ? String(camera.burst) : ''}
        aria-describedby={camera.denied ? deniedId : undefined}
        onPress={camera.open}
      >
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-camera" />
        </svg>
        {t.readDisplay}
      </AriaButton>
      {camera.denied ? (
        <p className="camera-denied" id={deniedId} role="status">
          {copy.photos.denied}
        </p>
      ) : null}
      {camera.element}
    </>
  );
}

/**
 * A table's "Confirmar todos (N)" for its suggested fills, only while there is one. E9-Q1: the
 * cells in `exclude` show a dictated reading, so their display fill is neither counted nor confirmed.
 */
export function ConfirmTableButton({ model, testKey, tableKey, exclude }: { model: DisplayModel; testKey: string; tableKey: string; exclude: readonly CellAddress[] }) {
  const n = model.confirmable(testKey, tableKey, exclude);
  if (n === 0) return null;
  return (
    <button type="button" className="btn btn-secondary" onClick={() => model.confirmAll(testKey, tableKey, exclude)}>
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-check-all" />
      </svg>
      {confirmarTodosText(n)}
    </button>
  );
}

// --- the thermo-hygrometer ---------------------------------------------------------------------

export interface EnvDisplayModel {
  entries: ReadonlyMap<string, EnvSuggestion>;
  queued: DisplayQueuedEntry | null;
  /** CAPT-V1: the empty line's retake (the relatório and its photos); absent, no retake. */
  retake?: DisplayRetake;
  tiles: readonly PhotoTile[];
  confirm: (s: SuggestionRow, label: string) => void;
  type: (s: SuggestionRow, field: FieldDef, text: string) => Promise<boolean> | 'invalid' | 'unchanged';
  keepTyped: (s: SuggestionRow) => void;
  openCrop: (s: SuggestionRow) => void;
  viewer: ReactNode;
}

export function useEnvDisplay({ api, state, snapshot, cabine }: { api: FichaApi; state: EntityState; snapshot: RelatorioSnapshot; cabine: Cabine }): EnvDisplayModel {
  const { showToast } = useToast();
  const rows = useMemo(() => suggestionRowsOf(state, api.relatorioId), [state, api.relatorioId]);
  const pending = useMemo(() => pendingSuggestions(rows), [rows]);
  const entries = useMemo(() => new Map(envSuggestions(cabine, pending).map((entry) => [entry.field as string, entry])), [cabine, pending]);
  const photos = useMemo(() => photosOf(snapshot), [snapshot]);
  // CAPT-V1: with every suggestion row of any status, a done reading that read nothing is `empty`.
  const queued = useMemo(() => displayQueuedEnv(photos, cabine.id, rows), [photos, cabine.id, rows]);
  const retake = useMemo<DisplayRetake>(() => ({ relatorioId: api.relatorioId, photos }), [api.relatorioId, photos]);
  const { openCrop, viewer, tiles } = useCropViewer({ api, snapshot });
  const said = (text: string) => {
    showToast(text);
    api.announce(text);
  };
  const once = useOncePerSuggestion();
  const confirm = (s: SuggestionRow, label: string) => {
    const text = confirmedFieldToastText(label, suggestionValueText(NUMBER, s.value));
    once(s, () =>
      api
        .edit((_blocks, by) => confirmSuggestionOps(by, s))
        .then((batch) => {
          if (batch !== null) said(text);
        }),
    );
  };
  const type = (s: SuggestionRow, field: FieldDef, text: string): Promise<boolean> | 'invalid' | 'unchanged' => {
    if (text === formatDecimalGroupedPtBr(numberOf(s.value).raw)) return 'unchanged';
    const parsed = parseFieldInput(field, text);
    if (!parsed.ok) return 'invalid';
    const value = parsed.value;
    return api
      .edit((_blocks, by) => (value === null ? [discardSuggestionOp(by, s)] : [cabineEnvOp(by, api.relatorioId, cabine.id, field.key, value), discardSuggestionOp(by, s)]))
      .then((batch) => batch !== null)
      .catch(() => false);
  };
  const keepTyped = (s: SuggestionRow) => {
    once(s, () =>
      api
        .edit((_blocks, by) => [discardSuggestionOp(by, s)])
        .then((batch) => {
          if (batch !== null) said(copy.ficha.ensaios.typedKept);
        }),
    );
  };
  return { entries, queued, retake, tiles, confirm, type, keepTyped, openCrop, viewer };
}

/** The thermo-hygrometer's "Ler visor" and its reason ("Termo-higrômetro"): one shot of the cabine's environment. */
export function EnvReadDisplayButton({ relatorioId, cabineId, target }: { relatorioId: string; cabineId: string; target: () => CaptureTarget }) {
  const t = copy.ficha.cabine;
  const opener = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const deniedId = useId();
  const shot = (): CaptureTarget => ({ ...target(), reading: { kind: 'display', target: displayEnvTarget(cabineId) as JsonValue } });
  const camera = useCamera(relatorioId, shot, opener, { singleShot: true, shotTarget: (n) => (n === 0 ? shot() : null) });
  return (
    <>
      <AriaButton
        ref={opener}
        className="read-display-btn"
        data-count={camera.burst > 0 ? String(camera.burst) : ''}
        aria-describedby={camera.denied ? `${reasonId} ${deniedId}` : reasonId}
        onPress={camera.open}
      >
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-camera" />
        </svg>
        {t.readDisplay}
      </AriaButton>
      <span className="btn-reason" id={reasonId}>
        {t.readDisplayReason}
      </span>
      {camera.denied ? (
        <p className="camera-denied" id={deniedId} role="status">
          {copy.photos.denied}
        </p>
      ) : null}
      {camera.element}
    </>
  );
}

/**
 * Review F-08: the one environment field the thermo-hygrometer photo's line shows under (the
 * kernel's `displayEnvLineField`), from the fields in definition order and their stored values.
 */
export function envLineField(model: EnvDisplayModel, fields: readonly FieldDef[], valueOf: (field: FieldDef) => unknown): string | null {
  return displayEnvLineField(
    model.queued,
    fields.map((field) => ({ key: field.key, value: valueOf(field), filling: model.entries.get(field.key)?.view === 'fill' })),
  );
}

/**
 * What an environment field adds under itself: the mismatch line beside a different value and
 * the queued (or, while it is empty, failed) line, under `lineField` only (review F-08).
 */
export function envAfter(model: EnvDisplayModel, field: FieldDef, value: unknown, lineField: string | null): ReactNode {
  const entry = model.entries.get(field.key);
  const label = screenLabel(field.label);
  const mismatch =
    entry !== undefined && entry.view === 'replace' ? (
      <MismatchLine value={value} suggestion={entry.suggestion} onVisor={() => model.confirm(entry.suggestion, label)} onTyped={() => model.keepTyped(entry.suggestion)} />
    ) : null;
  const banner = model.queued === null || field.key !== lineField || !displayLineShown(model.queued, value) ? null : <QueuedBanner entry={model.queued} tile={tileOf(model.tiles, model.queued.photoId)} retake={model.retake ?? null} />;
  if (mismatch === null && banner === null) return undefined;
  return (
    <>
      {mismatch}
      {banner}
    </>
  );
}

/** A thermo-hygrometer reading on an empty environment field: the Suggestion field with the guess editable. */
export function EnvSuggestionFill({ model, field, suggestion }: { model: EnvDisplayModel; field: FieldDef; suggestion: SuggestionRow }) {
  const labelId = useId();
  const helperId = useId();
  const initial = formatDecimalGroupedPtBr(numberOf(suggestion.value).raw);
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const written = useRef(false);
  const label = screenLabel(field.label);
  const unit = numberOf(suggestion.value).unit ?? field.unit ?? null;
  const commit = (confirmIfUnchanged: boolean) => {
    if (written.current) return;
    const result = model.type(suggestion, field, text);
    if (result === 'unchanged') {
      if (!confirmIfUnchanged) return;
      written.current = true;
      model.confirm(suggestion, label);
      return;
    }
    setInvalid(result === 'invalid');
    if (result === 'invalid') return;
    written.current = true;
    void result.then((ok) => {
      if (!ok) written.current = false;
    });
  };
  return (
    <div data-field-key={field.key} className="ficha-suggestion" data-suggestion-id={suggestion.id}>
      <SuggestionField
        label={label}
        labelId={labelId}
        state={suggestion.trust === 'verify' ? 'verify' : 'suggested'}
        announcement={suggestionAnnouncement(suggestion.trust, suggestionValueText(NUMBER, suggestion.value))}
        valueClassName="measurement-field"
        bare
        crop={<CropThumb source="display" photoId={suggestion.source.photo_id} bbox={suggestion.source.bbox} label={label} onPress={() => model.openCrop(suggestion)} />}
        onConfirm={() => commit(true)}
        after={
          invalid ? (
            <span className="helper" data-tone="red" id={helperId}>
              {copy.ficha.cabine.invalidNumber}
            </span>
          ) : null
        }
      >
        <input
          className="mf-value"
          inputMode="decimal"
          autoComplete="off"
          aria-labelledby={labelId}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? helperId : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (invalid) setInvalid(false);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof HTMLElement && next.classList.contains('confirm-btn')) return;
            commit(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit(true);
          }}
        />
        {unit === null ? null : <span className="mf-unit">{unit}</span>}
      </SuggestionField>
    </div>
  );
}
