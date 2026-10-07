import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isPermanentReadingError, PermanentReadingError, ProviderError, ProviderTimeoutError } from './errors.ts';
import sharp from 'sharp';
import { digitCoverage, EQUIPMENT_BLOCK_TYPES, getDefinition, inTokenOrder, normalizeReadingValue, readingValueText, SEED_VERSION } from '@app/domain';
import {
  DEFAULT_FIXTURE_BY_BLOCK_TYPE,
  DEFAULT_FIXTURES_DIR,
  defaultFixtureFor,
  fakeOcrProvider,
  fakeProseProvider,
  fakeReadingFixtureSchema,
  fakeStructuringProvider,
  type FakeFixtureKey,
} from './fake.ts';
import { loadConfig } from '../../../config.ts';
import { createReadingProviders } from './index.ts';

/*
 * Story 8.4: the committed fake fixtures and the provider switch. Every fixture is keyed by
 * the sha256 of an image the repository holds (the synthetic plate of Story 8.3, one of the
 * two tiny error/timeout PNGs, or one of the six synthetic displays of Story 9.1), so a
 * fixture can never point at a photo nobody can take.
 */

const repoRoot = resolve(import.meta.dirname, '../../../../../..');
const OCR_FIXTURES = join(repoRoot, 'services/ocr/tests/fixtures');
const PLATE = join(OCR_FIXTURES, 'plate-transformador.jpg');
const IMAGES = join(DEFAULT_FIXTURES_DIR, 'images');
const PLATE_SHA = 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac';
const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' as const };
/** A plate of `block_type` (the Story 8.4 fallback key). */
const plate = (blockType: string | null): FakeFixtureKey => ({ reading_kind: 'plate', block_type: blockType, table_key: null });

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
  it('names every fixture after the sha256 of the plate JPEG, a synthetic display or an image in images/', () => {
    const known = new Map<string, string>([[sha256(PLATE), 'plate-transformador.jpg']]);
    for (const name of readdirSync(OCR_FIXTURES).filter((file) => /^display-.*\.jpg$/.test(file))) known.set(sha256(join(OCR_FIXTURES, name)), name);
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

describe('E78-Q2 the fake falls back to the block type\'s default fixture', () => {
  const NO_FIXTURE = 'e'.repeat(64);
  const jpeg = async (width: number, height: number) =>
    ({ bytes: new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg().toBuffer()), mime: 'image/jpeg' as const });

  it('a transformer photo with no fixture of its own replays the synthetic plate, its boxes scaled to the image read', async () => {
    expect(DEFAULT_FIXTURE_BY_BLOCK_TYPE.transformador_forca).toBe(PLATE_SHA);
    const own = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, PLATE_SHA).read(image);
    const scaled = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, NO_FIXTURE, plate('transformador_forca')).read(await jpeg(800, 550));
    expect(scaled.image).toEqual({ width: 800, height: 550 });
    expect(scaled.tokens.map((t) => t.text)).toEqual(own.tokens.map((t) => t.text));
    expect(scaled.tokens[0]!.bbox).toEqual(own.tokens[0]!.bbox.map((n) => n / 2));
    // Any size, even one that does not keep the plate's aspect; every box stays inside the image.
    const odd = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, NO_FIXTURE, plate('transformador_forca')).read(await jpeg(1000, 700));
    expect(odd.image).toEqual({ width: 1000, height: 700 });
    expect(odd.tokens.every(({ bbox: [x0, y0, x1, y1] }) => x0 < x1 && y0 < y1 && x1 <= 1000 && y1 <= 700)).toBe(true);
    const structured = await fakeStructuringProvider(DEFAULT_FIXTURES_DIR, NO_FIXTURE, plate('transformador_forca')).structure({ image, ocr: scaled, fields: [] });
    expect(structured.output.values).toHaveLength(11);
    expect(structured.model).toBe('fake');
  });

  it('a photo\'s own fixture wins over the default', async () => {
    const own = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, sha256(join(IMAGES, 'plate-error.png')), plate('transformador_forca')).read(image).catch((error: unknown) => error);
    expect(own).toBeInstanceOf(ProviderError);
  });

  it('any other block type with no fixture fails permanently, naming the type', async () => {
    const error = await failure(fakeOcrProvider(DEFAULT_FIXTURES_DIR, NO_FIXTURE, plate('disjuntor')).read(await jpeg(80, 60)));
    expect(error).toBeInstanceOf(PermanentReadingError);
    expect(String((error as Error).message)).toContain('no fixture for block type disjuntor');
    expect(await failure(fakeStructuringProvider(DEFAULT_FIXTURES_DIR, NO_FIXTURE, plate(null)).structure({ image, ocr: { image: { width: 1, height: 1 }, tokens: [], preprocessing_applied: false }, fields: [] }))).toBeInstanceOf(
      PermanentReadingError,
    );
    // The default fixture missing from the directory is permanent too.
    expect(await failure(fakeOcrProvider(scratch, NO_FIXTURE, plate('transformador_forca')).read(await jpeg(80, 60)))).toBeInstanceOf(PermanentReadingError);
  });
});

describe('13.7-API every block type with a nameplate has its plate default', () => {
  const NO_FIXTURE = 'e'.repeat(64);
  const nameplateTypes = EQUIPMENT_BLOCK_TYPES.filter((type) => getDefinition(SEED_VERSION, 'cabine_primaria', type).nameplate.length > 0);
  const IMAGE_OF: Record<string, string> = {
    para_raio: 'plate-para-raio.png',
    chave_seccionadora: 'plate-chave-seccionadora.png',
    disjuntor_mt: 'plate-disjuntor-mt.png',
    tp: 'plate-tp.png',
    tc: 'plate-tc.png',
  };

  it('the plate defaults are exactly the six nameplate types, and no cable type', () => {
    expect(nameplateTypes).toHaveLength(6);
    expect(Object.keys(DEFAULT_FIXTURE_BY_BLOCK_TYPE).sort()).toEqual([...nameplateTypes].sort());
    for (const cable of ['cabos_entrada', 'cabos_saida']) {
      expect(DEFAULT_FIXTURE_BY_BLOCK_TYPE[cable]).toBeUndefined();
      expect(defaultFixtureFor(plate(cable))).toBeUndefined();
    }
    for (const [type, file] of Object.entries(IMAGE_OF)) {
      expect(DEFAULT_FIXTURE_BY_BLOCK_TYPE[type], type).toBe(sha256(join(IMAGES, file)));
      expect(defaultFixtureFor(plate(type))).toBe(DEFAULT_FIXTURE_BY_BLOCK_TYPE[type]);
    }
  });

  for (const type of ['para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'transformador_forca']) {
    it(`${type}: the scaled replay keeps the tokens inside the image, and every value is a ${type} nameplate key whose digits its cited tokens print`, async () => {
      const sha = DEFAULT_FIXTURE_BY_BLOCK_TYPE[type]!;
      const own = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, sha).read(image);
      if (type !== 'transformador_forca') expect(own.image).toEqual({ width: 1200, height: 900 });
      const jpeg = { bytes: new Uint8Array(await sharp({ create: { width: 1000, height: 700, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg().toBuffer()), mime: 'image/jpeg' as const };
      const scaled = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, NO_FIXTURE, plate(type)).read(jpeg);
      expect(scaled.image).toEqual({ width: 1000, height: 700 });
      expect(scaled.tokens.map((t) => t.text)).toEqual(own.tokens.map((t) => t.text));
      expect(scaled.tokens.every(({ bbox: [x0, y0, x1, y1] }) => x0 >= 0 && y0 >= 0 && x0 < x1 && y0 < y1 && x1 <= 1000 && y1 <= 700)).toBe(true);
      expect(own.tokens.every(({ bbox: [x0, y0, x1, y1] }) => x0 >= 0 && y0 >= 0 && x1 <= own.image.width && y1 <= own.image.height)).toBe(true);

      const fields = new Map(getDefinition(SEED_VERSION, 'cabine_primaria', type).nameplate.map((field) => [field.key, field]));
      const { output } = await fakeStructuringProvider(DEFAULT_FIXTURES_DIR, NO_FIXTURE, plate(type)).structure({ image: jpeg, ocr: scaled, fields: [] });
      expect(output.values.length).toBeGreaterThan(0);
      // Every nameplate key but the tag (never printed on a plate) and the oil volume (the model leaves it out).
      expect(output.values.map((value) => value.key)).toEqual([...fields.keys()].filter((key) => key !== 'tag' && key !== 'vol_oleo'));
      const tokens = new Map(own.tokens.map((token) => [token.id, token]));
      for (const value of output.values) {
        const field = fields.get(value.key);
        expect(field, `${type} ${value.key}`).toBeDefined();
        const normalized = normalizeReadingValue(field!, value.value);
        expect(normalized.ok && !normalized.verify, `${type} ${value.key} is valid for its kind`).toBe(true);
        const cited = inTokenOrder(value.ocr_token_ids.map((id) => tokens.get(id)!));
        expect(cited.every((token) => token !== undefined)).toBe(true);
        // The transformer's `tap_atual` is the wrong-digit case of Story 8.5 (README).
        if (type === 'transformador_forca' && value.key === 'tap_atual') continue;
        expect(digitCoverage(readingValueText(field!, normalized.ok ? normalized.value : null), cited), `${type} ${value.key} digits`).toBe(true);
      }
    });
  }
});

describe('9.1-API the default fixture is chosen by kind, block type and table, most specific first', () => {
  const SHA = {
    plate: 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac',
    megohmetro: '0cf24e91c3d6ddc4fd31dcfb7f133a46822344781c221ebfaffcf04b47f815ad',
    isolacao: 'a3a4e07dab0416ebb66adb045af94cd1ce7626d8eb990d8dcecfa8e47521e9b8',
    microhmimetro: '039d31eda2f7040dbba258385f395a5ccb53ae9e8a8dbe19770e1ef8a90c6c71',
    ttr: '084be7868dbd3b05cc7eda4f7797b36ab7f2e0347b624b564a2a6e0afdeccb7d',
    termo: '8ab01170c26a7474e8b8c8bbed7713074b8182d1364b21145867eed03a8a1c16',
    tresValores: '69f24caf149e40256ada9a73ac36ed1729f101a24f9216ebeaed1c1d9d07b83f',
  };
  const display = (blockType: string | null, tableKey: string | null): FakeFixtureKey => ({ reading_kind: 'display', block_type: blockType, table_key: tableKey });

  it('picks each committed display, the block type and table together first, the catch-all last', () => {
    expect(defaultFixtureFor(display('transformador_forca', 'isolacao'))).toBe(SHA.tresValores);
    expect(defaultFixtureFor(display('chave_seccionadora', 'isolacao'))).toBe(SHA.isolacao);
    expect(defaultFixtureFor(display('chave_seccionadora', 'resistencia_contato'))).toBe(SHA.microhmimetro);
    expect(defaultFixtureFor(display('tp', 'relacao_transformacao'))).toBe(SHA.ttr);
    expect(defaultFixtureFor(display(null, 'env'))).toBe(SHA.termo);
    expect(defaultFixtureFor(display('tp', 'nothing'))).toBe(SHA.megohmetro);
    expect(defaultFixtureFor(plate('transformador_forca'))).toBe(SHA.plate);
    expect(defaultFixtureFor(plate('cabos_entrada'))).toBeUndefined();
    // A display default never serves a plate, nor a plate default a display.
    for (const sha of Object.values(SHA)) expect(readdirSync(DEFAULT_FIXTURES_DIR)).toContain(`${sha}.json`);
  });

  it('a display photo with no fixture of its own replays its table default, its boxes scaled to the image read', async () => {
    const jpeg = { bytes: new Uint8Array(await sharp({ create: { width: 600, height: 450, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg().toBuffer()), mime: 'image/jpeg' as const };
    const read = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, 'e'.repeat(64), display('chave_seccionadora', 'isolacao')).read(jpeg, { mode: 'display' });
    expect(read.image).toEqual({ width: 600, height: 450 });
    expect(read.tokens.map((token) => token.text)).toEqual(['MODELOSINTETICO', '147', 'Gn']);
    expect(read.tokens[1]!.bbox).toEqual([139, 161.5, 307.5, 266.5]);
  });
});

describe('9.3/9.5-API the prose fixtures and their fallback', () => {
  const SHA = {
    caption: '1c9e7aafc2603b61d76e54c08f36183ff2ebdcf14bd58621bdb12483244139e8',
    ncObs: '14f52bebef057c7290ef65ff6951b4c56447f1d7e9e94d3d35ac8d39f197a312',
    none: '2dd03fe0930c0161fd2c190b150aef541c47b855f51f244e5499438334fddf67',
  };
  const key = (kind: 'caption' | 'nc_obs', blockType: string | null = null): FakeFixtureKey => ({ reading_kind: kind, block_type: blockType, table_key: null });
  const input = (kind: 'caption' | 'nc_obs') => ({ image, kind, context: { block_type: null, item_label: null } });

  it('the committed images are the ones the fixtures name', () => {
    expect(sha256(join(IMAGES, 'caption-default.png'))).toBe(SHA.caption);
    expect(sha256(join(IMAGES, 'nc-obs-default.png'))).toBe(SHA.ncObs);
    expect(sha256(join(IMAGES, 'caption-none.png'))).toBe(SHA.none);
  });

  it('a photo with no fixture of its own replays its kind default, whatever the block type', async () => {
    expect(defaultFixtureFor(key('caption'))).toBe(SHA.caption);
    expect(defaultFixtureFor(key('nc_obs', 'chave_seccionadora'))).toBe(SHA.ncObs);
    const caption = await fakeProseProvider(DEFAULT_FIXTURES_DIR, 'e'.repeat(64), key('caption')).describe(input('caption'));
    expect(caption).toEqual({ output: { text: 'Vista geral da cabine primária' }, model: 'fake', prompt_version: 'fake-1', usage: { input_tokens: 0, output_tokens: 0, usd: 0 } });
    const draft = await fakeProseProvider(DEFAULT_FIXTURES_DIR, 'e'.repeat(64), key('nc_obs', 'tp')).describe(input('nc_obs'));
    expect(draft.output).toEqual({ text: 'Oxidação aparente na estrutura do equipamento.' });
  });

  it('prose null, an absent prose (a plate fixture) read null; error and timeout fail transiently', async () => {
    expect((await fakeProseProvider(DEFAULT_FIXTURES_DIR, SHA.none, key('caption')).describe(input('caption'))).output).toBeNull();
    expect((await fakeProseProvider(DEFAULT_FIXTURES_DIR, PLATE_SHA).describe(input('caption'))).output).toBeNull();
    const error = await failure(fakeProseProvider(DEFAULT_FIXTURES_DIR, sha256(join(IMAGES, 'plate-error.png')), key('caption')).describe(input('caption')));
    expect(error).toBeInstanceOf(ProviderError);
    expect(isPermanentReadingError(error)).toBe(false);
    const timeout = await failure(fakeProseProvider(DEFAULT_FIXTURES_DIR, sha256(join(IMAGES, 'plate-timeout.png')), key('caption')).describe(input('caption')));
    expect(timeout).toBeInstanceOf(ProviderTimeoutError);
  });

  it('11.6-ROUTING: bedrock prose goes through Converse on BEDROCK_PROSE_MODEL_ID, through the injected client', async () => {
    const models: (string | undefined)[] = [];
    const client = {
      async send(command: { input: { modelId?: string } }) {
        models.push(command.input.modelId);
        return { output: { message: { role: 'assistant' as const, content: [{ toolUse: { toolUseId: 'u1', name: 'record_text', input: { text: 'Vista geral' } } }] } }, stopReason: 'tool_use' as const, usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } };
      },
    };
    const config = { OCR_SERVICE_URL: 'http://ocr:8000', OCR_PROVIDER: 'fake' as const, LLM_PROVIDER: 'bedrock' as const, BEDROCK_MODEL_ID: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', BEDROCK_PROSE_MODEL_ID: 'us.amazon.nova-2-lite-v1:0' };
    const providers = createReadingProviders(config, { bedrock: { client } })({ photo_sha256: SHA.caption, reading_kind: 'caption', block_type: null, table_key: null });
    const result = await providers.prose.describe(input('caption'));
    expect(result).toMatchObject({ output: { text: 'Vista geral' }, model: 'us.amazon.nova-2-lite-v1:0', prompt_version: 'bedrock-prose-1' });
    expect(models).toEqual(['us.amazon.nova-2-lite-v1:0']);
  });
});

describe('9.2-API the panel default fixture', () => {
  it('a panel photo with no fixture of its own replays the synthetic panel front: C09 and SECCIONADORA, its boxes scaled', async () => {
    const PANEL = '36f3fca92f329117f736195e6bcdcae60ba683a82a7d3dcd0aff154b158d3d51';
    const key: FakeFixtureKey = { reading_kind: 'panel', block_type: null, table_key: null };
    expect(defaultFixtureFor(key)).toBe(PANEL);
    expect(sha256(join(IMAGES, 'panel-seccionadora.png'))).toBe(PANEL);
    const jpeg = { bytes: new Uint8Array(await sharp({ create: { width: 600, height: 450, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg().toBuffer()), mime: 'image/jpeg' as const };
    const read = await fakeOcrProvider(DEFAULT_FIXTURES_DIR, 'f'.repeat(64), key).read(jpeg, { mode: 'text' });
    expect(read.tokens.map((token) => token.text)).toEqual(['C09', 'SECCIONADORA']);
    expect(read.tokens[0]!.bbox).toEqual([77.5, 59, 162.5, 91]);
    const structured = await fakeStructuringProvider(DEFAULT_FIXTURES_DIR, 'f'.repeat(64), key).structure({ image: jpeg, ocr: read, fields: [] });
    expect(structured.output.values.map((value) => [value.key, value.value, value.confidence])).toEqual([
      ['block_type', 'chave_seccionadora', 0.93],
      ['column', 'C09', 0.95],
    ]);
  });
});

describe('8.4-API provider switch', () => {
  const ctx = { photo_sha256: PLATE_SHA, reading_kind: 'plate' as const, block_type: null, table_key: null };
  const base = { OCR_SERVICE_URL: 'http://ocr:8000' };

  it('fake by default names the fake OCR; ocr-svc builds the sidecar adapter without calling it', () => {
    expect(createReadingProviders({ ...base, OCR_PROVIDER: 'fake', LLM_PROVIDER: 'fake' })(ctx).ocr_name).toBe('fake');
    expect(createReadingProviders({ ...base, OCR_PROVIDER: 'ocr-svc', LLM_PROVIDER: 'fake' })(ctx).ocr_name).toBe('ocr-svc');
  });

  it('11.7-ROUTING: textract reads plate and panel through Textract and display through ocr-svc; no OCR_PROVIDER is fake', async () => {
    const sent: unknown[] = [];
    const client = {
      async send(command: { input: unknown }) {
        sent.push(command.input);
        return { Blocks: [] };
      },
    };
    const factory = createReadingProviders({ ...base, OCR_PROVIDER: 'textract', LLM_PROVIDER: 'fake' }, { textract: { client } });
    const of = (reading_kind: 'plate' | 'panel' | 'display') => factory({ ...ctx, reading_kind });
    expect(of('plate').ocr_name).toBe('textract');
    expect(of('panel').ocr_name).toBe('textract');
    expect(of('display').ocr_name).toBe('ocr-svc');
    // One Textract provider per factory: every text kind shares it (and its one client).
    expect(of('plate').ocr).toBe(of('panel').ocr);
    expect(of('display').ocr).not.toBe(of('plate').ocr);
    const png = { bytes: new Uint8Array(await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer()), mime: 'image/png' as const };
    expect(await of('panel').ocr.read(png, { mode: 'text' })).toEqual({ image: { width: 40, height: 20 }, tokens: [], preprocessing_applied: false });
    expect(sent).toHaveLength(1);
    const defaults = loadConfig({
      DATABASE_URL: 'postgres://app:app@localhost:5432/app',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_BUCKET: 'app-files',
      PORT: '3000',
      SESSION_SECRET: 'x'.repeat(32),
      TRUSTED_ORIGINS: 'http://localhost:5173',
    });
    for (const reading_kind of ['plate', 'panel', 'display'] as const) {
      expect(createReadingProviders(defaults)({ ...ctx, reading_kind }).ocr_name).toBe('fake');
    }
    // TEXTRACT_REGION reaches the client builder, on the first Textract read and not before.
    const regions: string[] = [];
    const west = createReadingProviders(
      { ...base, OCR_PROVIDER: 'textract', LLM_PROVIDER: 'fake', TEXTRACT_REGION: 'us-west-2' },
      {
        textract: {
          createClient: (region) => {
            regions.push(region);
            return client;
          },
        },
      },
    );
    expect(regions).toEqual([]);
    await west({ ...ctx, reading_kind: 'plate' }).ocr.read(png, { mode: 'text' });
    expect(regions).toEqual(['us-west-2']);
    for (const reading_kind of ['plate', 'panel', 'display'] as const) {
      expect(createReadingProviders({ ...base, OCR_PROVIDER: 'ocr-svc', LLM_PROVIDER: 'fake' })({ ...ctx, reading_kind }).ocr_name).toBe('ocr-svc');
    }
  });

  it('11.6-ROUTING: bedrock structures on BEDROCK_MODEL_ID and escalates on BEDROCK_ESCALATION_MODEL_ID, one lazily built client in BEDROCK_REGION', async () => {
    const sent: { modelId?: string }[] = [];
    const client = {
      async send(command: { input: { modelId?: string } }) {
        sent.push(command.input);
        return { output: { message: { role: 'assistant' as const, content: [{ toolUse: { toolUseId: 'u1', name: 'record_values', input: { values: [] } } }] } }, stopReason: 'tool_use' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      },
    };
    const regions: string[] = [];
    const createClient = (region: string) => {
      regions.push(region);
      return client;
    };
    const bedrock = { ...base, OCR_PROVIDER: 'fake' as const, LLM_PROVIDER: 'bedrock' as const, BEDROCK_REGION: 'us-west-2' };
    const factory = createReadingProviders(bedrock, { bedrock: { createClient } });
    const providers = factory(ctx);
    expect(regions).toEqual([]);
    const ocr = await providers.ocr.read(image);
    const first = await providers.structuring.structure({ image, ocr, fields: [] });
    expect(first.model).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
    const second = await providers.escalation!.structure({ image, ocr, fields: [] });
    expect(second.model).toBe('us.amazon.nova-pro-v1:0');
    expect(sent.map((input) => input.modelId)).toEqual(['global.anthropic.claude-haiku-4-5-20251001-v1:0', 'us.amazon.nova-pro-v1:0']);
    // One client per factory, for every model and every kind.
    const panel = await factory({ ...ctx, reading_kind: 'panel' }).structuring.structure({ image, ocr, fields: [] });
    expect(regions).toEqual(['us-west-2']);
    // Panel fronts read on BEDROCK_PANEL_MODEL_ID (Qwen3 VL by default), never on the plate model or the escalation.
    expect(panel.model).toBe('qwen.qwen3-vl-235b-a22b');
    expect(sent.at(-1)?.modelId).toBe('qwen.qwen3-vl-235b-a22b');
    const sameModel = createReadingProviders({ ...bedrock, BEDROCK_PANEL_MODEL_ID: 'global.anthropic.claude-haiku-4-5-20251001-v1:0' }, { bedrock: { client } })({ ...ctx, reading_kind: 'panel' });
    expect((await sameModel.structuring.structure({ image, ocr, fields: [] })).model).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
    // An empty escalation model disables it; fake and AI_FEATURES=off never escalate.
    expect(createReadingProviders({ ...bedrock, BEDROCK_ESCALATION_MODEL_ID: '' }, { bedrock: { client } })(ctx).escalation).toBeUndefined();
    expect(createReadingProviders({ ...base, OCR_PROVIDER: 'fake', LLM_PROVIDER: 'fake' })(ctx).escalation).toBeUndefined();
    const off = createReadingProviders({ ...bedrock, AI_FEATURES: 'off' }, { bedrock: { client } })(ctx);
    expect(off.escalation).toBeUndefined();
    expect(await failure(off.structuring.structure({ image, ocr, fields: [] }))).toBeInstanceOf(PermanentReadingError);
    // An escalation model equal to the structuring model would make the same call twice: none.
    expect(
      createReadingProviders({ ...bedrock, BEDROCK_MODEL_ID: 'us.amazon.nova-pro-v1:0', BEDROCK_ESCALATION_MODEL_ID: 'us.amazon.nova-pro-v1:0' }, { bedrock: { client } })(ctx).escalation,
    ).toBeUndefined();
    // A model with no list price fails when the factory is built (at boot), not per reading...
    expect(() => createReadingProviders({ ...bedrock, BEDROCK_MODEL_ID: 'anthropic.claude-unknown' }, { bedrock: { client } })).toThrow(/no list price/);
    expect(() => createReadingProviders({ ...bedrock, BEDROCK_ESCALATION_MODEL_ID: 'anthropic.claude-unknown' }, { bedrock: { client } })).toThrow(/no list price/);
    expect(() => createReadingProviders({ ...bedrock, BEDROCK_PANEL_MODEL_ID: 'anthropic.claude-unknown' }, { bedrock: { client } })).toThrow(/no list price/);
    // ...unless AI features are off: then no Bedrock provider is built, no model checked, no client made.
    const offBuilt: string[] = [];
    const offUnknown = createReadingProviders(
      { ...bedrock, AI_FEATURES: 'off', BEDROCK_MODEL_ID: 'anthropic.claude-unknown', BEDROCK_ESCALATION_MODEL_ID: 'anthropic.claude-unknown' },
      { bedrock: { createClient: (region) => (offBuilt.push(region), client) } },
    )(ctx);
    expect(offUnknown.escalation).toBeUndefined();
    expect(await failure(offUnknown.structuring.structure({ image, ocr, fields: [] }))).toBeInstanceOf(PermanentReadingError);
    expect(await failure(offUnknown.prose.describe({ image, kind: 'caption', context: { block_type: null, item_label: null } }))).toBeInstanceOf(PermanentReadingError);
    expect(offBuilt).toEqual([]);
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
