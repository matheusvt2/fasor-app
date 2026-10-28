import { useRef, type ReactNode } from 'react';
import { copy } from '../../copy/pt-br.ts';
import { heicToJpeg, isHeic } from '../../files/photo-import.ts';
import type { CaptureTarget, PhotoCapture } from './use-photo-capture.ts';

/*
 * E13-A6: one shot of the camera (`camera-view.tsx` says what the camera does): the camera's
 * own photo or a frame of the stream (Story 13.1, review F-01), and the system picker that
 * takes the one shot: the device's camera app (Story 17.2, "Câmera do aparelho"), and the
 * fallback where the browser has no camera API.
 */

/** Story 13.1: how long a single shot waits for `takePhoto()` before it grabs a frame instead. */
export const TAKE_PHOTO_TIMEOUT_MS = 2000;

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}

/**
 * Review F-01: the frame on screen at the tap, decoded at once (before any await), so a single
 * shot never depends on the viewfinder still being there when `takePhoto()` fails or is slow.
 * Rejects when the video has no frame yet (or the browser has no `createImageBitmap`); the
 * caller then waits for one (`grabFrame`).
 */
export function frameAtTap(video: HTMLVideoElement): Promise<ImageBitmap> {
  let early: Promise<ImageBitmap>;
  try {
    early = typeof createImageBitmap === 'function' ? createImageBitmap(video) : Promise.reject(new Error('no createImageBitmap'));
  } catch (error) {
    early = Promise.reject(error instanceof Error ? error : new Error('no frame at the tap'));
  }
  // Never an unhandled rejection: whoever uses it reads the rejection itself.
  early.catch(() => undefined);
  return early;
}

/**
 * Story 13.1: the camera's own photo (full sensor resolution where the browser has
 * `ImageCapture`), or a frame when there is none, when it fails or when it has not answered in
 * `TAKE_PHOTO_TIMEOUT_MS`. Review F-01: that frame is `early`, the one taken at the tap; only if
 * it could not be read is a frame grabbed from the viewfinder now. When the photo wins the early
 * frame is closed; a photo that answers after the timeout is ignored (one shot, one photo).
 */
export async function takePhotoOrGrab(track: MediaStreamTrack | null, video: HTMLVideoElement, early: Promise<ImageBitmap>): Promise<Blob | ImageBitmap> {
  const Capture = (globalThis as { ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
  if (Capture !== undefined && track !== null && track.readyState !== 'ended') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const photo = await Promise.race([
        new Capture(track).takePhoto(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('takePhoto timed out')), TAKE_PHOTO_TIMEOUT_MS);
        }),
      ]);
      if (photo instanceof Blob && photo.size > 0) {
        void early.then(
          (bitmap) => bitmap.close(),
          () => undefined,
        );
        return photo;
      }
    } catch {
      // The frame of the tap takes the shot instead.
    } finally {
      clearTimeout(timer);
    }
  }
  return early.catch(() => grabFrame(video));
}

/** One frame of the live stream, decoded; waits for the first frame when the stream has none yet. */
export async function grabFrame(video: HTMLVideoElement): Promise<ImageBitmap> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no video frame')), 3000);
      video.addEventListener(
        'loadeddata',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
  return createImageBitmap(video);
}

export interface CameraPickerHost {
  capture: PhotoCapture;
  /** Whether the server answers (F-13: then the toast does not speak of a queue). */
  reachable: boolean;
  /** The host's `onShot` for a stored shot. */
  onStored: (target: CaptureTarget) => void;
  setBurst: (burst: number) => void;
  showToast: (message: string) => void;
  /** The opener takes the focus back once the shot is saved. */
  returnFocus: () => void;
}

/**
 * The system camera behind a hidden `capture` file input, one shot: the device's camera app
 * (Story 17.2) and the no-camera fallback. `pick` clicks it (inside the press, so the browser
 * still counts the user's gesture) and `input` renders beside the opener. A cancelled camera
 * app fires no change, so the opener stays at rest. One file per pick, so the done toast is
 * always the one-photo one (whatever the opener's burst mode).
 */
export function useCameraPicker({ capture, reachable, onStored, setBurst, showToast, returnFocus }: CameraPickerHost): { pick: (context: CaptureTarget) => void; input: ReactNode } {
  const fileInput = useRef<HTMLInputElement>(null);
  const fallbackTarget = useRef<CaptureTarget | null>(null);

  const pick = (context: CaptureTarget) => {
    fallbackTarget.current = context;
    fileInput.current?.click();
  };

  const onFallbackFile = (file: File | undefined) => {
    const context = fallbackTarget.current;
    fallbackTarget.current = null;
    if (file === undefined || context === null) return;
    setBurst(1);
    let failed = false;
    // Story 17.2: a camera app may answer HEIC; it takes the import path's conversion first.
    const source: Promise<Blob> = isHeic(file) ? heicToJpeg(file) : Promise.resolve(file);
    void source
      .then(
        (photo) => {
          capture.shoot(photo, context, (outcome) => {
            if (outcome === 'saved') onStored(context);
            else failed = true;
            // The camera view is not open: a failure is the toast.
            return false;
          });
          return capture.settle();
        },
        (error: unknown) => {
          console.error('camera app photo could not be converted', error);
          failed = true;
          return false;
        },
      )
      .then((allSaved) => {
        setBurst(0);
        // A failed shot keeps its failure toast, never replaced by the done one.
        if (failed) showToast(copy.photos.failedToast);
        else if (allSaved) showToast(reachable ? copy.photos.doneOneToastOnline : copy.photos.doneOneToast);
        returnFocus();
      });
  };

  const input = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      tabIndex={-1}
      aria-hidden="true"
      data-testid="camera-fallback-input"
      onChange={(event) => {
        onFallbackFile(event.target.files?.[0]);
        event.target.value = '';
      }}
    />
  );

  return { pick, input };
}
