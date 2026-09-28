import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isPermanentReadingError, PermanentReadingError, ProviderError, ProviderNotImplementedError, ProviderTimeoutError } from './errors.ts';
import { DEFAULT_FIXTURES_DIR, fakeOcrProvider, fakeReadingFixtureSchema, fakeStructuringProvider } from './fake.ts';
import { createReadingProviders } from './index.ts';

/*
 * Story 8.4: the committed fake fixtures and the provider switch. Every fixture is keyed by
 * the sha256 of an image the repository holds (the synthetic plate of Story 8.3 or one of the
 * two tiny error/timeout PNGs), so a fixture can never point at a photo nobody can take.
 */

const repoRoot = resolve(import.meta.dirname, '../../../../../..');
const PLATE = join(repoRoot, 'services/ocr/tests/fixtures/plate-transformador.jpg');
const IMAGES = join(DEFAULT_FIXTURES_DIR, 'images');
const PLATE_SHA = 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac';
const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' as const };

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const scratch = mkdtempSync(join(tmpdir(), 'fake-reading-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
}

describe('8.4-API committed fake fixtures', () => {
  it('names every fixture after the sha256 of the plate JPEG or an image in images/', () => {
    const known = new Map<string, string>([[sha256(PLATE), 'plate-transformador.jpg']]);
    for (const name of readdirSync(IMAGES)) known.set(sha256(join(IMAGES, name)), name);
    expect(known.get(PLATE_SHA)).toBe('plate-transformador.jpg');
    const fixtures = readdirSync(DEFAULT_FIXTURES_DIR).filter((name) => name.endsWith('.json'));
    expect(fixtures.length).toBe(known.size);
    for (const name of fixtures) {
      const sha = name.replace(/\.json$/, '');
      expect(known.has(sha), `${name} names no committed image`).toBe(true);
      expect(fakeReadingFixtureSchema.safeParse(JSON.parse(readFileSync(join(DEFAULT_FIXTURES_DIR, name), 'utf8'))).success, name).toBe(true);
    }
    expect(readdirSync(DEFAULT_FIXTURES_DIR).filter((name) => statSync(join(DEFAULT_FIXTURES_DIR, name)).isFile()).sort()).toEqual(
      [...fixtures, 'README.md'].sort(),
    );
  });

  it('replays the plate: its 43 tokens, the model fake, prompt fake-1 and zero usage', async () => {
    const ocr = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, PLATE_SHA).read(image);
    expect(ocr.image).toEqual({ width: 1600, height: 1100 });
    expect(ocr.tokens).toHaveLength(43);
    const structured = await fakeStructuringProvider(DEFAULT_FIXTURES_DIR, PLATE_SHA).structure({ image, ocr, fields: [] });
    expect(structured.model).toBe('fake');
    expect(structured.prompt_version).toBe('fake-1');
    expect(structured.usage).toEqual({ input_tokens: 0, output_tokens: 0, usd: 0 });
    expect(structured.output.values.map((v) => v.key)).not.toContain('vol_oleo');
    expect(structured.output.values).toHaveLength(11);
  });

  it('the error and timeout images fail transiently, at once', async () => {
    const started = Date.now();
    const error = await failure(fakeOcrProvider(DEFAULT_FIXTURES_DIR, sha256(join(IMAGES, 'plate-error.png'))).read(image));
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).not.toBeInstanceOf(ProviderTimeoutError);
    expect(isPermanentReadingError(error)).toBe(false);
    const timeout = await failure(fakeOcrProvider(DEFAULT_FIXTURES_DIR, sha256(join(IMAGES, 'plate-timeout.png'))).read(image));
    expect(timeout).toBeInstanceOf(ProviderTimeoutError);
    expect(isPermanentReadingError(timeout)).toBe(false);
    const structuring = await failure(fakeStructuringProvider(DEFAULT_FIXTURES_DIR, sha256(join(IMAGES, 'plate-timeout.png'))).structure({ image, ocr: { image: { width: 1, height: 1 }, tokens: [], preprocessing_applied: false }, fields: [] }));
    expect(structuring).toBeInstanceOf(ProviderTimeoutError);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('a photo without a fixture, a malformed key and a malformed fixture are permanent', async () => {
    expect(await failure(fakeOcrProvider(DEFAULT_FIXTURES_DIR, 'f'.repeat(64)).read(image))).toBeInstanceOf(PermanentReadingError);
    expect(await failure(fakeOcrProvider(DEFAULT_FIXTURES_DIR, '../README').read(image))).toBeInstanceOf(PermanentReadingError);
    writeFileSync(join(scratch, `${'a'.repeat(64)}.json`), JSON.stringify({ outcome: 'maybe' }));
    writeFileSync(join(scratch, `${'b'.repeat(64)}.json`), '{not json');
    writeFileSync(join(scratch, `${'c'.repeat(64)}.json`), JSON.stringify({}));
    expect(await failure(fakeOcrProvider(scratch, 'a'.repeat(64)).read(image))).toBeInstanceOf(PermanentReadingError);
    expect(await failure(fakeOcrProvider(scratch, 'b'.repeat(64)).read(image))).toBeInstanceOf(PermanentReadingError);
    // `ok` without an OCR read cannot be replayed.
    expect(await failure(fakeOcrProvider(scratch, 'c'.repeat(64)).read(image))).toBeInstanceOf(PermanentReadingError);
  });
});

describe('8.4-API provider switch', () => {
  const base = { OCR_SERVICE_URL: 'http://ocr:8000' };

  it('fake by default names the fake OCR; ocr-svc builds the sidecar adapter without calling it', () => {
    expect(createReadingProviders({ ...base, OCR_PROVIDER: 'fake', LLM_PROVIDER: 'fake' })({ photo_sha256: PLATE_SHA }).ocr_name).toBe('fake');
    expect(createReadingProviders({ ...base, OCR_PROVIDER: 'ocr-svc', LLM_PROVIDER: 'fake' })({ photo_sha256: PLATE_SHA }).ocr_name).toBe('ocr-svc');
  });

  it('textract, anthropic and bedrock fail permanently with ProviderNotImplementedError', async () => {
    const textract = createReadingProviders({ ...base, OCR_PROVIDER: 'textract', LLM_PROVIDER: 'fake' })({ photo_sha256: PLATE_SHA });
    const error = await failure(textract.ocr.read(image));
    expect(error).toBeInstanceOf(ProviderNotImplementedError);
    expect(isPermanentReadingError(error)).toBe(true);
    for (const llm of ['anthropic', 'bedrock'] as const) {
      const providers = createReadingProviders({ ...base, OCR_PROVIDER: 'fake', LLM_PROVIDER: llm })({ photo_sha256: PLATE_SHA });
      const ocr = await providers.ocr.read(image);
      const refused = await failure(providers.structuring.structure({ image, ocr, fields: [] }));
      expect(refused).toBeInstanceOf(ProviderNotImplementedError);
      expect(isPermanentReadingError(refused)).toBe(true);
    }
  });

  it('no api source reads a cloud credential or names the personal Claude app', () => {
    const src = resolve(import.meta.dirname, '../../..');
    const banned = new RegExp([['ANTHROPIC', 'API', 'KEY'].join('_'), ['AWS', 'ACCESS', 'KEY'].join('_'), ['claude', 'ai'].join('\\.')].join('|'));
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (banned.test(readFileSync(path, 'utf8'))) hits.push(relative(src, path));
      }
    };
    walk(src);
    expect(hits).toEqual([]);
  });
});
