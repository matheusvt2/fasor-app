import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  getDefinition,
  normalizeReadingValue,
  normalizeRegistryName,
  PANEL_FIELDS,
  SEED_VERSION,
  type FieldDef,
  type OcrReadResult,
  type StructuringResult,
} from '@app/domain';
import { z } from 'zod';
import { readingImage, type ReadingImage } from '../jobs/reading/image.ts';
import { BEDROCK_DEFAULT_REGION, bedrockClientSource, bedrockStructuringProvider } from '../jobs/reading/providers/bedrock.ts';
import { createReadingProviders } from '../jobs/reading/providers/index.ts';
import { TEXTRACT_DEFAULT_REGION } from '../jobs/reading/providers/textract.ts';
import { renderVariants } from '../storage/variants.ts';

/*
 * Story 11.6: the manual evaluation of the Bedrock structuring candidates, never run by `pnpm
 * verify` (no test glob matches it and nothing imports it). For every image with expected
 * values it makes the print variant the job reads (`renderVariants`, then `readingImage`),
 * runs the OCR once (`--ocr`, default `textract`; `fake`, `ocr-svc` and `textract` are the
 * providers of the config), then one Converse structuring call per model of `--models` on the
 * same image, tokens and fields, the way the reading job does. It prints, per model, the field
 * accuracy over its successful readings (expected fields read right, after the job's own
 * normalization; a failed reading is counted in its own column), the share of
 * values whose citations are all OCR token ids of the read (11.6-TEXTRACT-TOKENS when the OCR
 * is Textract), the mean input and output tokens and the mean USD per reading. A model whose
 * call fails is counted as failed and the run goes on; the script exits non-zero only when
 * every call failed. It never writes anything.
 *
 * Inputs: without `--dir`, the two synthetic images of the repository with their known values
 * (`services/ocr/tests/fixtures/plate-transformador.jpg`, the table of its `.md`, and
 * `apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png`, its README). With
 * `--dir <folder>`, every `*.jpg|*.jpeg|*.png` beside a `<name>.expected.json` of the shape
 *
 *   {"kind": "plate", "block_type": "transformador_forca", "values": {"n_serie": "240815-07", "potencia_nominal": "500"}}
 *   {"kind": "panel", "values": {"block_type": "chave_seccionadora", "column": "C09"}}
 *
 * (a number field's value is its raw decimal, a date `YYYY-MM[-DD]`, anything else the text).
 * Real nameplate photos are client material: keep that folder under the git-ignored
 * `docs/media/` and never commit it.
 *
 * Credentials come only from the AWS SDK default chain, here the env session of the
 * `fasor-app` profile, exported by the pinned aws-cli image (as `infra/bin/tf` does; the AWS
 * CLI never runs on the host) into a throwaway env file under the git-ignored `secrets/`,
 * then handed to the tools container:
 *
 *   docker run --rm --user "$(id -u):$(id -g)" -e HOME=/home/aws -v "$HOME/.aws:/home/aws/.aws" \
 *     amazon/aws-cli:2.37.6 configure export-credentials --profile fasor-app --format env-no-export \
 *     > secrets/aws-session.env
 *   docker compose --profile tools run --rm --no-deps --env-from-file secrets/aws-session.env \
 *     tools pnpm --filter @app/api exec tsx src/scripts/bedrock-eval.ts \
 *     --models global.anthropic.claude-haiku-4-5-20251001-v1:0,global.amazon.nova-2-lite-v1:0,qwen.qwen3-vl-235b-a22b,mistral.mistral-large-3-675b-instruct
 *   rm secrets/aws-session.env
 *
 * Options: `--models a,b` (default: the four candidates and Nova Pro), `--ocr textract|fake|ocr-svc`,
 * `--dir <folder>`, `--verbose` (one line per reading). The regions are BEDROCK_REGION and
 * TEXTRACT_REGION, default us-east-1; an override goes on the run command, `-e
 * BEDROCK_REGION=...` after `--no-deps`.
 */

/** The four Story 11.6 candidates and the escalation model (Amazon Nova Pro). */
const CANDIDATES = [
  'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  'global.amazon.nova-2-lite-v1:0',
  'qwen.qwen3-vl-235b-a22b',
  'mistral.mistral-large-3-675b-instruct',
  'us.amazon.nova-pro-v1:0',
];

const repoRoot = resolve(import.meta.dirname, '../../../..');

const expectedFileSchema = z
  .object({
    kind: z.enum(['plate', 'panel']),
    block_type: z.string().min(1).optional(),
    values: z.record(z.string(), z.string()),
  })
  .refine((file) => file.kind === 'panel' || file.block_type !== undefined, { message: 'a plate names its block_type' });
type ExpectedFile = z.infer<typeof expectedFileSchema>;

interface Sample {
  name: string;
  path: string;
  expected: ExpectedFile;
}

/** The synthetic plate's table (`plate-transformador.md`) and the synthetic panel front (fixtures README). */
const SYNTHETIC: Sample[] = [
  {
    name: 'plate-transformador (synthetic)',
    path: join(repoRoot, 'services/ocr/tests/fixtures/plate-transformador.jpg'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      values: {
        identificacao: 'TR-01',
        fabricacao: 'Celtta',
        n_serie: '240815-07',
        tipo: 'TSE-500/15',
        tipo_de_isolacao: 'EPÓXI',
        vol_oleo: '0',
        potencia_nominal: '500',
        tap_atual: '3',
        data_fabricacao: '2024-08',
        tensao_nominal_at: '15',
        tensao_nominal_bt: '380',
        ligacao_secundaria: 'Dyn1',
      },
    },
  },
  {
    name: 'panel-seccionadora (synthetic)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png'),
    expected: { kind: 'panel', values: { block_type: 'chave_seccionadora', column: 'C09' } },
  },
];

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

async function samplesIn(dir: string): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (const file of (await readdir(dir)).sort()) {
    const extension = extname(file).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    const name = basename(file, extname(file));
    let text: string;
    try {
      text = await readFile(join(dir, `${name}.expected.json`), 'utf8');
    } catch {
      continue;
    }
    samples.push({ name, path: join(dir, file), expected: expectedFileSchema.parse(JSON.parse(text)) });
  }
  return samples;
}

function mimeOf(path: string): string {
  const extension = extname(path).toLowerCase();
  return extension === '.png' ? 'image/png' : 'image/jpeg';
}

function fieldsOf(expected: ExpectedFile): FieldDef[] {
  return expected.kind === 'panel' ? [...PANEL_FIELDS] : [...getDefinition(SEED_VERSION, 'cabine_primaria', expected.block_type!).nameplate];
}

/** Whether a model value, normalized the way the job stores it, is the expected one. */
function isRight(field: FieldDef, value: unknown, expected: string): boolean {
  const normalized = normalizeReadingValue(field, value);
  if (!normalized.ok) return false;
  const stored = normalized.value;
  if (field.kind === 'number') {
    const raw = (stored as { raw: string }).raw;
    return Number(raw) === Number(expected.replace(',', '.'));
  }
  return normalizeRegistryName(String(stored)) === normalizeRegistryName(expected);
}

interface Score {
  expected: number;
  right: number;
  values: number;
  validCitations: number;
  usage: StructuringResult['usage'];
}

function score(sample: Sample, fields: FieldDef[], ocr: OcrReadResult, result: StructuringResult): Score {
  const ids = new Set(ocr.tokens.map((token) => token.id));
  const byKey = new Map(result.output.values.map((value) => [value.key, value]));
  let right = 0;
  for (const [key, expected] of Object.entries(sample.expected.values)) {
    const field = fields.find((candidate) => candidate.key === key);
    const value = byKey.get(key);
    if (field !== undefined && value !== undefined && isRight(field, value.value, expected)) right += 1;
  }
  const validCitations = result.output.values.filter((value) => value.ocr_token_ids.every((id) => ids.has(id))).length;
  return { expected: Object.keys(sample.expected.values).length, right, values: result.output.values.length, validCitations, usage: result.usage };
}

interface Row {
  model: string;
  readings: number;
  failed: number;
  expected: number;
  right: number;
  values: number;
  validCitations: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

const percent = (part: number, whole: number) => (whole === 0 ? '-' : `${((100 * part) / whole).toFixed(1)} %`);

function table(rows: Row[]): string {
  const header = ['model', 'readings', 'failed', 'field accuracy', 'valid citations', 'mean input tokens', 'mean output tokens', 'mean USD/reading'];
  const lines = rows.map((row) => {
    const ok = row.readings - row.failed;
    return [
      row.model,
      String(row.readings),
      String(row.failed),
      `${percent(row.right, row.expected)} (${row.right}/${row.expected})`,
      `${percent(row.validCitations, row.values)} (${row.validCitations}/${row.values})`,
      ok === 0 ? '-' : (row.inputTokens / ok).toFixed(0),
      ok === 0 ? '-' : (row.outputTokens / ok).toFixed(0),
      ok === 0 ? '-' : (row.usd / ok).toFixed(6),
    ];
  });
  const widths = header.map((title, column) => Math.max(title.length, ...lines.map((line) => line[column]!.length)));
  const render = (cells: string[]) => `| ${cells.map((cell, column) => cell.padEnd(widths[column]!)).join(' | ')} |`;
  return [render(header), render(widths.map((width) => '-'.repeat(width))), ...lines.map(render)].join('\n');
}

async function run(): Promise<number> {
  const { values: options } = parseArgs({
    options: {
      models: { type: 'string' },
      ocr: { type: 'string', default: 'textract' },
      dir: { type: 'string' },
      verbose: { type: 'boolean', default: false },
    },
  });
  const models = options.models === undefined ? CANDIDATES : options.models.split(',').map((model) => model.trim()).filter((model) => model !== '');
  const ocrProvider = z.enum(['textract', 'fake', 'ocr-svc']).parse(options.ocr);
  const samples = options.dir === undefined ? SYNTHETIC : await samplesIn(resolve(options.dir));
  if (samples.length === 0) throw new Error(`no image with a .expected.json in ${options.dir}`);

  const ocrFactory = createReadingProviders({
    OCR_PROVIDER: ocrProvider,
    LLM_PROVIDER: 'fake',
    OCR_SERVICE_URL: process.env.OCR_SERVICE_URL || 'http://ocr:8000',
    TEXTRACT_REGION: process.env.TEXTRACT_REGION || TEXTRACT_DEFAULT_REGION,
  });
  const region = process.env.BEDROCK_REGION || BEDROCK_DEFAULT_REGION;
  const source = bedrockClientSource({ region });
  const providers = new Map(models.map((model) => [model, bedrockStructuringProvider({ source, modelId: model })]));
  const rows = new Map<string, Row>(
    models.map((model) => [model, { model, readings: 0, failed: 0, expected: 0, right: 0, values: 0, validCitations: 0, inputTokens: 0, outputTokens: 0, usd: 0 }]),
  );

  // An expected key the fields do not have is a typo in an expected file: stop before any call.
  for (const sample of samples) {
    const fields = fieldsOf(sample.expected);
    const unknown = Object.keys(sample.expected.values).filter((key) => !fields.some((field) => field.key === key));
    if (unknown.length > 0) {
      const of = sample.expected.kind === 'panel' ? 'the panel fields' : `the ${sample.expected.block_type} nameplate`;
      throw new Error(`${sample.name}: expected key(s) ${unknown.join(', ')} not in ${of} (${fields.map((field) => field.key).join(', ')})`);
    }
  }

  for (const sample of samples) {
    const fields = fieldsOf(sample.expected);
    const original = new Uint8Array(await readFile(sample.path));
    const mime = mimeOf(sample.path);
    const variants = await renderVariants(original, mime);
    if (variants === null) throw new Error(`no print variant for ${sample.path}`);
    const image: ReadingImage = await readingImage({ print: variants.print.bytes, printMime: variants.print.contentType });
    const sha = createHash('sha256').update(original).digest('hex');
    const ocr = await ocrFactory({ photo_sha256: sha, reading_kind: sample.expected.kind, block_type: sample.expected.block_type ?? null, table_key: null }).ocr.read(
      { bytes: image.bytes, mime: image.mime },
      { mode: 'text' },
    );
    console.log(`${sample.name}: ${image.width}x${image.height}, ${ocr.tokens.length} ${ocrProvider} tokens, ${fields.length} fields`);
    for (const model of models) {
      const row = rows.get(model)!;
      row.readings += 1;
      try {
        const result = await providers.get(model)!.structure({ image: { bytes: image.bytes, mime: image.mime }, ocr, fields });
        const scored = score(sample, fields, ocr, result);
        row.expected += scored.expected;
        row.right += scored.right;
        row.values += scored.values;
        row.validCitations += scored.validCitations;
        row.inputTokens += scored.usage.input_tokens;
        row.outputTokens += scored.usage.output_tokens;
        row.usd += scored.usage.usd;
        if (options.verbose) {
          console.log(`  ${model}: ${scored.right}/${scored.expected} right, ${scored.validCitations}/${scored.values} valid citations, ${JSON.stringify(scored.usage)}`);
        }
      } catch (error) {
        row.failed += 1;
        console.log(`  ${model}: failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
      }
    }
  }

  const all = [...rows.values()];
  console.log(`\nOCR ${ocrProvider}, Bedrock ${region}, ${samples.length} image(s)\n`);
  console.log(table(all));
  return all.every((row) => row.failed === row.readings) ? 1 : 0;
}

run().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exit(1);
  },
);
