import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OCR_READ_MAX_BYTES } from '@app/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isPermanentReadingError, PermanentReadingError, ProviderError, ProviderTimeoutError } from './errors.ts';
import { ocrSvcProvider } from './ocr-svc.ts';

/*
 * Story 8.4: the `ocr-svc` adapter against a stub `node:http` sidecar on port 0 (no network
 * beyond the loopback, no Python): what it sends, and how each answer is classified.
 */

interface Seen {
  method: string;
  url: string;
  contentType: string | undefined;
  body: Buffer;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let baseUrl = '';
let handler: Handler = () => {};
const seen: Seen[] = [];
const hanging: ServerResponse[] = [];

const READ = { image: { width: 100, height: 50 }, tokens: [{ id: 't0', text: 'TR-01', bbox: [1, 2, 30, 20], confidence: 0.9 }], preprocessing_applied: false };
const image = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03]), mime: 'image/jpeg' as const };

function reply(status: number, body: string, type = 'application/json'): Handler {
  return (_req, res) => {
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', contentType: req.headers['content-type'], body: Buffer.concat(chunks) });
      handler(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const res of hanging) res.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen.length = 0;
});

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the read to fail');
}

describe('8.4-API ocr-svc provider', () => {
  it('posts the raw bytes with their mime to OCR_SERVICE_URL + /read and parses a 200', async () => {
    handler = reply(200, JSON.stringify(READ));
    const result = await ocrSvcProvider(`${baseUrl}/`).read(image);
    expect(result).toEqual(READ);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.url).toBe('/read');
    expect(seen[0]!.contentType).toBe('image/jpeg');
    expect(new Uint8Array(seen[0]!.body)).toEqual(image.bytes);

    const png = { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mime: 'image/png' as const };
    await ocrSvcProvider(baseUrl).read(png);
    expect(seen[1]!.contentType).toBe('image/png');
  });

  it('a 422 and a 413 are permanent', async () => {
    handler = reply(422, JSON.stringify({ error: 'invalid_image' }));
    const invalid = await failure(ocrSvcProvider(baseUrl).read(image));
    expect(invalid).toBeInstanceOf(PermanentReadingError);
    handler = reply(413, JSON.stringify({ error: 'too_large' }));
    const large = await failure(ocrSvcProvider(baseUrl).read(image));
    expect(large).toBeInstanceOf(PermanentReadingError);
  });

  it('a 500, a body that is not JSON and a body that is not an OcrReadResult are transient', async () => {
    for (const handle of [
      reply(500, JSON.stringify({ error: 'internal' })),
      reply(200, 'garbage<html>', 'text/html'),
      reply(200, JSON.stringify({ ...READ, tokens: [{ id: 't7', text: 'x', bbox: [0, 0, 1, 1], confidence: 1 }] })),
    ]) {
      handler = handle;
      const error = await failure(ocrSvcProvider(baseUrl).read(image));
      expect(error).toBeInstanceOf(ProviderError);
      expect(isPermanentReadingError(error)).toBe(false);
    }
  });

  it('a sidecar that never answers times out, transient', async () => {
    handler = (_req, res) => {
      hanging.push(res);
    };
    const error = await failure(ocrSvcProvider(baseUrl, { timeoutMs: 200 }).read(image));
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect(isPermanentReadingError(error)).toBe(false);
  });

  it('a refused connection is transient', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const error = await failure(ocrSvcProvider(`http://127.0.0.1:${port}`).read(image));
    expect(error).toBeInstanceOf(ProviderError);
    expect(isPermanentReadingError(error)).toBe(false);
  });

  it('refuses a body over OCR_READ_MAX_BYTES before sending anything', async () => {
    handler = reply(200, JSON.stringify(READ));
    const error = await failure(ocrSvcProvider(baseUrl).read({ bytes: new Uint8Array(OCR_READ_MAX_BYTES + 1), mime: 'image/jpeg' }));
    expect(error).toBeInstanceOf(PermanentReadingError);
    expect(seen).toEqual([]);
  });
});
