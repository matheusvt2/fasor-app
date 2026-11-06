import { useRef, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { copy } from '../../copy/pt-br.ts';
import { PHOTO_ACCEPT, type ImportResult, type ImportTarget } from '../../files/photo-import.ts';
import { usePhotoImport } from '../photos/capture-sheet.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Story 22.1 (Matheus, 2026-11-06): "Anexar arquivo" beside every opener that asks a reading
 * (the plate tile and its retake, each "Ler visor", the panel capture). It opens the system
 * picker for one picture (Story 11.11's pattern: a hidden `<input type=file>` clicked inside
 * the press, so the browser counts the gesture) and commits the picked file through the import
 * path (`importPhotoFiles`: HEIC converted, EXIF DateTimeOriginal else the file's date,
 * re-encoded like a shot) with the opener's own `CaptureTarget`, its reading included. The
 * reading job, the suggestions, a retake's cancel of the older plates and the quota then
 * behave as for a shot. A cancelled picker does nothing; a file that is not a picture is
 * skipped with the import's toast. The look is the mock's text button with `i-image` (`.btn
 * .btn-text`, 44 px tall), no new style.
 */

/** A shot's target as the import path takes it: the same sheet, item, local, caption, reading and minted id. */
export function importTargetOf(target: CaptureTarget): ImportTarget {
  return {
    blockId: target.blockId,
    itemKey: target.itemKey,
    ...(target.locationId === undefined ? {} : { locationId: target.locationId }),
    caption: target.caption,
    ...(target.reading === undefined ? {} : { reading: target.reading }),
    ...(target.fileId === undefined ? {} : { fileId: target.fileId }),
  };
}

type ImportFiles = (files: readonly File[], target: ImportTarget) => Promise<ImportResult | null>;

/**
 * The picked files of one press: the first one only (the picker offers one), imported with the
 * opener's target; `onSaved` hears the target once the photo is stored. Nothing for an empty pick.
 */
export async function attachPicked(files: readonly File[], target: CaptureTarget, importFiles: ImportFiles, onSaved?: (target: CaptureTarget) => void): Promise<ImportResult | null> {
  const file = files[0];
  if (file === undefined) return null;
  const result = await importFiles([file], importTargetOf(target));
  if (result !== null && result.saved.length > 0) onSaved?.(target);
  return result;
}

/**
 * The picker behind an opener: `open(target)` clicks the hidden input inside the press, keeping
 * the target for the file it brings; `input` is rendered where it outlives the press (the panel
 * capture keeps it in the tree while the palette that pressed it closes).
 */
export function useAttachFile(relatorioId: string, onSaved?: (target: CaptureTarget) => void): { open: (target: CaptureTarget) => void; input: ReactNode } {
  const importFiles = usePhotoImport(relatorioId);
  const ref = useRef<HTMLInputElement>(null);
  const pending = useRef<CaptureTarget | null>(null);
  const latestSaved = useRef(onSaved);
  latestSaved.current = onSaved;
  return {
    open: (target) => {
      pending.current = target;
      ref.current?.click();
    },
    input: (
      <input
        ref={ref}
        type="file"
        accept={PHOTO_ACCEPT}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        data-testid="attach-file-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          const target = pending.current;
          pending.current = null;
          if (target === null || files.length === 0) return;
          void attachPicked(files, target, importFiles, (saved) => latestSaved.current?.(saved)).catch((error: unknown) => console.error('attached photo not saved', error));
        }}
      />
    ),
  };
}

/** "Anexar arquivo": the button and its picker, the target read at the press (a retake mints its photo id then). */
export function AttachFileAction({ relatorioId, target, onSaved }: { relatorioId: string; target: () => CaptureTarget; onSaved?: (target: CaptureTarget) => void }) {
  const picker = useAttachFile(relatorioId, onSaved);
  return (
    <>
      <AriaButton className="btn btn-text" onPress={() => picker.open(target())}>
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-image" />
        </svg>
        {copy.photos.attachFile}
      </AriaButton>
      {picker.input}
    </>
  );
}
