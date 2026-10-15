import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

/*
 * Story 14.10 part 6: the production smoke's camera. The browser has no camera, so before any
 * page script runs `navigator.mediaDevices.getUserMedia` is replaced by a stream of a canvas
 * that keeps drawing the synthetic transformer plate of the OCR sidecar's tests. The app opens
 * its own camera view on it as on a tablet; the shutter's `ImageCapture.takePhoto()` refuses a
 * canvas track, and the app then saves the frame of the tap (review F-01), so the stored photo
 * is the plate. A real reading of it runs on the deployed providers.
 */

export const PLATE_IMAGE = resolve(import.meta.dirname, '../../services/ocr/tests/fixtures/plate-transformador.jpg');

/** The plate as a data URL (the api's CSP allows `img-src data:`). */
export function plateDataUrl(): string {
  return `data:image/jpeg;base64,${readFileSync(PLATE_IMAGE).toString('base64')}`;
}

/** Installs the plate camera on every page of `page`'s future navigations. */
export async function installPlateCamera(page: Page, dataUrl: string = plateDataUrl()): Promise<void> {
  await page.addInitScript((url: string) => {
    const media = navigator.mediaDevices;
    if (media === undefined) return;
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new DOMException('The plate image did not load', 'NotReadableError'));
    });
    image.src = url;
    const getUserMedia = async (): Promise<MediaStream> => {
      await loaded;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      const draw = () => context.drawImage(image, 0, 0);
      draw();
      // A canvas stream sends a frame only when the canvas is drawn: keep drawing while it is live.
      const stream = canvas.captureStream(10);
      const timer = setInterval(draw, 100);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          clearInterval(timer);
          stop();
        };
      }
      return stream;
    };
    Object.defineProperty(media, 'getUserMedia', { value: getUserMedia, configurable: true });
  }, dataUrl);
}
