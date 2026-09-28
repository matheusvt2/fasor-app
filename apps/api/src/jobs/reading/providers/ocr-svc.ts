import { OCR_READ_MAX_BYTES, OCR_SERVICE_ROUTES, ocrReadResultSchema, type OcrImage, type OcrProvider, type OcrReadResult } from '@app/domain';
import { PermanentReadingError, ProviderError, ProviderTimeoutError } from './errors.ts';

/*
 * Story 8.4: the `ocr-svc` provider, the `services/ocr` sidecar of Story 8.3 (compose
 * profile `ocr`) reached through `OCR_SERVICE_URL`. One `POST /read` with the raw image
 * bytes and their mime. A body over the sidecar's limit is refused before sending; the
 * sidecar's own 413 and 422 are permanent (no retry makes the image readable); a 5xx, a
 * dropped connection, an answer that does not parse and a call that outlives the timeout
 * are transient.
 */

/** How long one read may take before the attempt fails with `ProviderTimeoutError`. */
export const OCR_SVC_TIMEOUT_MS = 60_000;

export interface OcrSvcOptions {
  /** Injectable for tests; defaults to `OCR_SVC_TIMEOUT_MS`. */
  timeoutMs?: number;
}

export function ocrSvcProvider(baseUrl: string, options: OcrSvcOptions = {}): OcrProvider {
  const url = `${baseUrl.replace(/\/+$/, '')}${OCR_SERVICE_ROUTES.read.path}`;
  const timeoutMs = options.timeoutMs ?? OCR_SVC_TIMEOUT_MS;
  return {
    async read(image: OcrImage): Promise<OcrReadResult> {
      if (image.bytes.byteLength > OCR_READ_MAX_BYTES) {
        throw new PermanentReadingError(`ocr-svc: the image is ${image.bytes.byteLength} bytes, over the ${OCR_READ_MAX_BYTES} limit`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response: Response;
        let text: string;
        try {
          response = await fetch(url, {
            method: OCR_SERVICE_ROUTES.read.method,
            headers: { 'content-type': image.mime },
            body: image.bytes,
            signal: controller.signal,
          });
          text = await response.text();
        } catch (error) {
          if (controller.signal.aborted) throw new ProviderTimeoutError(`ocr-svc: no answer within ${timeoutMs} ms`);
          throw new ProviderError(`ocr-svc: request failed: ${String(error)}`, { cause: error });
        }
        if (response.status === 413 || response.status === 422) {
          throw new PermanentReadingError(`ocr-svc: ${response.status} ${text.slice(0, 200)}`);
        }
        if (response.status !== 200) throw new ProviderError(`ocr-svc: ${response.status} ${text.slice(0, 200)}`);
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          throw new ProviderError('ocr-svc: the answer is not JSON');
        }
        const parsed = ocrReadResultSchema.safeParse(body);
        if (!parsed.success) throw new ProviderError(`ocr-svc: the answer is not an OcrReadResult: ${parsed.error.message.slice(0, 300)}`);
        return parsed.data;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
