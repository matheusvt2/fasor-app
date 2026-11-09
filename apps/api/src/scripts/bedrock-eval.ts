import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  getDefinition,
  isVectorGroupField,
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
import { BEDROCK_DEFAULT_REGION, bedrockClientSource, bedrockStructuringProvider, type PlateStructuringInput } from '../jobs/reading/providers/bedrock.ts';
import { createReadingProviders } from '../jobs/reading/providers/index.ts';
import { groupRead } from './eval-group-read.ts';
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
 * Story 21.2: a transformador de força plate is asked for its vector group as the job asks for it
 * (`vectorGroupKey`, prompt `bedrock-structuring-4`; since e21f a drawn diagram comes back as
 * facts the provider composes, `providers/vector-diagram.ts`), and a second table reports, per plate and
 * model, the group read from LIGAÇÃO SECUNDÁRIA beside the expected one. e21a: the column reads the
 * kernel classification the job stores by (`vectorGroupReadOf`, through `eval-group-read.ts`): the code
 * when its cited words print it, "<code> (diagram)" when they print no group, "<code> (other group)"
 * when they print another, an unparsed text quoted, "- (dropped)" when the job stores nothing (an
 * unknown cited id, a value naming no option), "-" for no entry. The synthetic set gains the two seed v11 transformer plates
 * of `make-plate-fixtures.ts` (one printing "Dyn1", one drawing a Yyn0 diagram). Story 22.7 adds the
 * seed v12 oil transformer plate (prompt `bedrock-structuring-5`): TIPO is TRICAST and TIPO DO ÓLEO B.
 * Batch e23t (Story 23.17, prompt `bedrock-structuring-7`) adds two seed v13 transformer plates: the ANP class B
 * alone (TIPO (ANP) B, the kernel composing the insulation and a mineral liquid) and a silicone liquid.
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
    /** Story 23.7: the seed version whose nameplate the plate is scored on (default: the current one). */
    seed_version: z.string().min(1).optional(),
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
      // Story 23.7: drawn for the v1 to v12 transformer (its text TAP ATUAL, which v13 replaced by TAPS).
      seed_version: 'v12',
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
    name: 'plate-transformador-dyn1 (synthetic, Story 21.2)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-dyn1.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      values: { identificacao: 'TR-02', fabricacao: 'Varnelo', n_serie: 'TF-330918', potencia_nominal: '300', tensao_nominal_at: '13.8', tensao_nominal_bt: '380', ligacao_secundaria: 'Dyn1' },
    },
  },
  {
    name: 'plate-transformador-yyn0 (synthetic, drawn diagram, Story 21.2)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-yyn0.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      values: { identificacao: 'TR-03', fabricacao: 'Varnelo', tensao_nominal_at: '13.8', tensao_nominal_bt: '380', ligacao_secundaria: 'Yyn0' },
    },
  },
  {
    // Story 22.7: a seed v12 oil transformer printing "TIPO TRICAST" and "Tipo óleo isolante B" and no insulation word;
    // the kernel composes TIPO DE ISOLAÇÃO (ÓLEO MINERAL, verify) from TIPO DO ÓLEO, so the model is expected to leave it out.
    name: 'plate-transformador-oleo (synthetic, seed v12, Story 22.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-oleo.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      values: { identificacao: 'TR-04', fabricacao: 'Varnelo', tipo: 'TRICAST', tipo_do_oleo: 'B', potencia_nominal: '500', tensao_nominal_at: '13.8', tensao_nominal_bt: '220' },
    },
  },
  // Batch e23t (Story 23.17, prompt `bedrock-structuring-7`): a v13 plate printing the ANP class and no insulation or liquid
  // word, whose TIPO DE ISOLAÇÃO (ÓLEO ISOLANTE) and NATUREZA DO LÍQUIDO (MINERAL) the kernel composes, to verify; and a v13
  // plate naming a silicone liquid, which prints no class.
  {
    name: 'plate-transformador-tipo-b-v13 (synthetic, seed v13, Story 23.17)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-tipo-b-v13.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      seed_version: 'v13',
      values: { identificacao: 'TR-06', fabricacao: 'Varnelo', tipo: 'TRICAST', tipo_anp: 'B', potencia_nominal: '500', tensao_nominal_at: '13.8', tensao_nominal_bt: '220' },
    },
  },
  {
    name: 'plate-transformador-silicone-v13 (synthetic, seed v13, Story 23.17)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-silicone-v13.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      seed_version: 'v13',
      values: { identificacao: 'TR-07', fabricacao: 'Varnelo', tipo_de_isolacao: 'ÓLEO ISOLANTE', natureza_liquido: 'SILICONE', potencia_nominal: '300', tensao_nominal_at: '13.8', tensao_nominal_bt: '380' },
    },
  },
  // Story 23.7 (seed v13): one plate per type with the fields v13 adds (fixtures README); the list and the √3 as printed.
  {
    name: 'plate-transformador-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-v13.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      seed_version: 'v13',
      values: { identificacao: 'TR-05', fabricacao: 'Varnelo', taps: '13,8 / 13,2 / 12,6 / 12 / 11,4', tap_atual_kv: '12.6', impedancia_pct: '4.5', material_enrolamento: 'Cu', tensao_nominal_at: '13.8', tensao_nominal_bt: '380' },
    },
  },
  {
    name: 'plate-disjuntor-mt-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-disjuntor-mt-v13.png'),
    expected: { kind: 'plate', block_type: 'disjuntor_mt', seed_version: 'v13', values: { identificacao: 'DJ-02', tipo_montagem: 'EXTRAÍVEL', tensao_comando_v: '125 Vcc', acionamento: 'MOLA MOTORIZADA', tempo_abertura_fab_ms: '45', tempo_fechamento_fab_ms: '60' } },
  },
  {
    name: 'plate-chave-seccionadora-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-chave-seccionadora-v13.png'),
    expected: { kind: 'plate', block_type: 'chave_seccionadora', seed_version: 'v13', values: { identificacao: 'SEC-03', acionamento: 'MOTORIZADO', tipo_seccionadora: 'SOB CARGA COM FUSÍVEIS', fusivel_corrente_a: '63' } },
  },
  {
    name: 'plate-tp-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-tp-v13.png'),
    expected: { kind: 'plate', block_type: 'tp', seed_version: 'v13', values: { identificacao: 'TP-02', tensao_nominal_at: '13,8/√3 kV', tensao_nominal_bt: '115/√3 V', grupo_ligacao_tp: '2 (FASE-TERRA, SISTEMA ATERRADO)' } },
  },
  {
    name: 'plate-tc-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-tc-v13.png'),
    expected: { kind: 'plate', block_type: 'tc', seed_version: 'v13', values: { identificacao: 'TC-03', relacao: '200-5 A' } },
  },
  {
    name: 'plate-para-raio-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-para-raio-v13.png'),
    expected: { kind: 'plate', block_type: 'para_raio', seed_version: 'v13', values: { mcov_kv: '12.7', involucro: 'POLIMÉRICO' } },
  },
  {
    name: 'plate-cabos-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-cabos-v13.png'),
    expected: { kind: 'plate', block_type: 'cabos_entrada', seed_version: 'v13', values: { classe_cabo: '8,7/15 kV', isolacao_cabo: 'EPR', secao_mm2: '50', tipo_terminacao: 'TERMOCONTRÁTIL' } },
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
  return expected.kind === 'panel' ? [...PANEL_FIELDS] : [...getDefinition(expected.seed_version ?? SEED_VERSION, 'cabine_primaria', expected.block_type!).nameplate];
}

/** Whether a model value, normalized the way the job stores it, is the expected one. */
function isRight(field: FieldDef, value: unknown, expected: string): boolean {
  const normalized = normalizeReadingValue(field, value);
  if (!normalized.ok) return false;
  const stored = normalized.value;
  if (field.kind === 'number') {
    const raw = (stored as { raw: string }).raw;
    // Story 23.7: a list (TAPS) or a value over √3 is right when it reads as the expected text reads.
    if (field.list === true || field.over_sqrt3 === true) {
      const wanted = normalizeReadingValue(field, expected);
      return wanted.ok && (wanted.value as { raw: string }).raw === raw;
    }
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

/** Story 21.2: one row per transformer plate, the expected group then each model's read. */
function groupTable(models: readonly string[], groups: readonly { sample: string; expected: string; read: Map<string, string> }[]): string {
  const header = ['plate', 'expected group', ...models];
  const lines = groups.map((entry) => [entry.sample, entry.expected, ...models.map((model) => entry.read.get(model) ?? 'failed')]);
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

  const groups: { sample: string; expected: string; read: Map<string, string> }[] = [];
  for (const sample of samples) {
    const fields = fieldsOf(sample.expected);
    // Story 21.2: the transformer's vector-group field, asked for as the plate job asks for it.
    const groupField = sample.expected.kind === 'plate' ? fields.find((field) => isVectorGroupField(sample.expected.block_type!, field)) : undefined;
    const groupKey = groupField?.key;
    const group = groupKey === undefined ? null : { sample: sample.name, expected: sample.expected.values[groupKey] ?? '-', read: new Map<string, string>() };
    if (group !== null) groups.push(group);
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
        const input: PlateStructuringInput = { image: { bytes: image.bytes, mime: image.mime }, ocr, fields, ...(groupKey === undefined ? {} : { vectorGroupKey: groupKey }) };
        const result = await providers.get(model)!.structure(input);
        if (group !== null) group.read.set(model, groupRead(result, groupField!, ocr));
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
  if (groups.length > 0) console.log(`\nVector group read (LIGAÇÃO SECUNDÁRIA)\n\n${groupTable(models, groups)}`);
  return all.every((row) => row.failed === row.readings) ? 1 : 0;
}

run().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exit(1);
  },
);
