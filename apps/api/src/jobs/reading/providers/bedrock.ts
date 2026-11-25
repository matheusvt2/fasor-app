import type { ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import {
  blockTypeLabel,
  proseResultSchema,
  SEED_VERSION,
  structuringResultSchema,
  VECTOR_GROUP_CODES,
  type FieldDef,
  type OcrImage,
  type ProseInput,
  type ProseProvider,
  type ProseResult,
  type StructuringInput,
  type StructuringProvider,
  type StructuringResult,
} from '@app/domain';
import { z } from 'zod';
import { assertPricedModel, converseTool, type BedrockProviderOptions, type JsonSchema } from '../../../ai/bedrock.ts';
import { log } from '../../../log.ts';
import { BilledCallError, PermanentReadingError, withPromptVersion } from './errors.ts';
import { withoutUncitedValues } from './uncited.ts';
import { logVectorDiagram, VECTOR_DIAGRAM_KEY, VECTOR_DIAGRAM_TOOL_SCHEMA, vectorGroupKeyOf, vectorGroupOf, withVectorDiagram, type PlateStructuringInput } from './vector-diagram.ts';

export type { PlateStructuringInput } from './vector-diagram.ts';
// e21a (R-4): the uncited drop lives in a provider-neutral module; its name stays importable from here.
export { withoutUncitedValues } from './uncited.ts';

// Review 2026-10-08 (C4): the Converse client layer moved to `apps/api/src/ai/bedrock.ts`; its
// names stay importable from here for the reading's tests and scripts.
export {
  assertPricedModel,
  BEDROCK_DEFAULT_REGION,
  BEDROCK_PRICES,
  BEDROCK_TIMEOUT_MS,
  bedrockClientSource,
  classifyBedrockError,
  converseTool,
  createBedrockClient,
  usdFor,
  type BedrockClientSource,
  type BedrockConverseOutput,
  type BedrockLike,
  type BedrockProviderOptions,
  type ConverseCall,
} from '../../../ai/bedrock.ts';

/*
 * Story 11.6: the `bedrock` LLM provider, one Amazon Bedrock Converse adapter behind both the
 * structuring step (plate and panel) and the prose step (vision caption, NC draft). Converse is
 * the same call for every Bedrock model, so the model is configuration (`BEDROCK_MODEL_ID`,
 * `BEDROCK_PROSE_MODEL_ID`, `BEDROCK_ESCALATION_MODEL_ID`); Claude Haiku 4.5 is the reference
 * (Matheus, 2026-10-05). Credentials come only from the AWS SDK default provider chain (the env
 * session of the `fasor-app` profile locally, the ECS task role on AWS); nothing here reads or
 * stores a key. The account's AI services opt-out policy is attached by
 * `infra/bootstrap/organization.tf`.
 *
 * Structured output goes through Converse tool use: one tool whose input JSON Schema is derived
 * from the field definitions, forced with `toolChoice: {tool}`, and its `input` validated with
 * the contract's own result schema. The model cites OCR token ids, sent as `t<n>: text` lines
 * without coordinates, and never a box: every box and every trust stays server side
 * (`buildReadingSuggestions`, `assessReadingValue`). A token id or field key the OCR did not
 * return passes through here and is dropped there. A value with a missing or empty
 * `ocr_token_ids` (read from the image alone, nothing to box) is dropped here, before
 * validation, and the rest of the reading goes on (Matheus, 2026-10-05, after the live
 * evaluation: Haiku 4.5 and Mistral Large 3 returned the panel's block type uncited).
 *
 * One client per process, built lazily on the first call, SDK retries off (`maxAttempts: 1`):
 * pg-boss retries a transient failure as a new attempt. A reply without the tool call or one the
 * schema refuses (once the uncited values are dropped) is permanent (the same request fails the same way); throttling, 5xx, a
 * credential hiccup and a timeout are transient; a denied model, a bad model id or a malformed request are refused
 * (permanent), as `classifyAwsError` (`apps/api/src/ai/aws.ts`) decides.
 */

/** The prompt of the structuring step; bump it with every change of the prompt or the tool schema. */
// 2 (review 2026-10-08, AIR-1/AIR-V1): dates as precise as printed, never an invented month; pt-BR separators spelled out.
// 3 (Story 21.2): the transformer's vector group, printed or read from the drawn HV and LV diagrams, one of the 47 codes.
// 4 (e21f): a drawn diagram is described in the tool's `vector_diagram` facts and composed by the kernel (`composeVectorGroup`), never by the model.
// 5 (Stories 22.7 and 22.9): TIPO is the maker's designation, never the oil; the oil class and the oil insulation; EXATIDÃO as printed.
// 6 (Story 23.7, seed v13): TAPS as the plate's whole list in plate order, TAP ATUAL one of them, the winding material, a voltage over √3 and the TC's ratio as printed.
// 7 (Story 23.17, seed v13): TIPO (ANP) as the oil's class letter and NATUREZA DO LÍQUIDO only when the plate names the liquid; the kernel composes the rest.
// 8 (Story 23.18, seed v13): FUNÇÃO DO TC by its options (only as printed), and the S classes ("0,3S") and the protection classes with their factor ("5P20") as printed.
// 9 (Story 24.13, seed v14): the No-break de comando's battery fields ("BATERIAS: ...") are the battery bank's, read only where the photo shows them, never the unit's.
// 10 (2026-11-23, Story 28.3, seed v18): the transformer's TIPO DE ISOLAÇÃO reads "A SECO" or "A ÓLEO" (its options, from the
//    seed), a dry unit's CONSTRUÇÃO only as printed; the TP's and the TC's options gain "ÓLEO VEGETAL" (from the seed).
export const BEDROCK_STRUCTURING_PROMPT_VERSION = 'bedrock-structuring-10';

/** The prompt of the prose step (caption, NC draft); bump it with every change of the prompt or the tool schema. */
export const BEDROCK_PROSE_PROMPT_VERSION = 'bedrock-prose-1';

/** Converse's limit on one image's bytes; the print variant (at most 2000 px, JPEG) stays far below it. */
export const BEDROCK_MAX_IMAGE_BYTES = 3_750_000;

const STRUCTURING_TOOL = 'record_values';
const PROSE_TOOL = 'record_text';
const STRUCTURING_MAX_TOKENS = 2048;
const PROSE_MAX_TOKENS = 400;

// --- tool schemas -----------------------------------------------------------------

const NUMBER_VALUE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    raw: { type: 'string', description: 'The number as a plain decimal: digits, an optional minus sign and a dot as decimal separator.' },
    unit: { type: ['string', 'null'], description: 'The unit as printed, or null when none is printed.' },
    state: { type: 'string', enum: ['measured'] },
  },
  required: ['raw', 'unit', 'state'],
  additionalProperties: false,
};

const TEXT_VALUE_SCHEMA: JsonSchema = { type: 'string', minLength: 1 };

/** The value shapes the fields need: the number object, a string, or either. */
function valueSchemaFor(fields: readonly FieldDef[]): JsonSchema {
  const hasNumber = fields.some((field) => field.kind === 'number');
  const hasText = fields.some((field) => field.kind !== 'number');
  if (hasNumber && hasText) return { anyOf: [TEXT_VALUE_SCHEMA, NUMBER_VALUE_SCHEMA] };
  return hasNumber ? NUMBER_VALUE_SCHEMA : TEXT_VALUE_SCHEMA;
}

/**
 * The structuring tool's input JSON Schema, derived from the field definitions: the shape of
 * `structuringOutputSchema`, its keys narrowed to the fields' keys and its values to the
 * shapes their kinds take. Per-field detail (kind, unit, options) goes in the prompt.
 *
 * e21f: with a `vectorGroupKey` naming one of the fields, a required, nullable top-level
 * `vector_diagram` asks for the drawn diagrams' facts (`VECTOR_DIAGRAM_TOOL_SCHEMA`); the provider
 * folds them into the group's value (`withVectorDiagram`). Without one the schema is as before.
 */
export function structuringToolSchema(fields: readonly FieldDef[], vectorGroupKey?: string): JsonSchema {
  const schema = valuesToolSchema(fields);
  if (vectorGroupKey === undefined || !fields.some((field) => field.key === vectorGroupKey)) return schema;
  return {
    ...schema,
    properties: { ...(schema.properties as Record<string, unknown>), [VECTOR_DIAGRAM_KEY]: VECTOR_DIAGRAM_TOOL_SCHEMA },
    required: ['values', VECTOR_DIAGRAM_KEY],
  };
}

function valuesToolSchema(fields: readonly FieldDef[]): JsonSchema {
  return {
    type: 'object',
    properties: {
      values: {
        type: 'array',
        description: 'One entry per field read on the photo; a field that cannot be read is left out.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: fields.map((field) => field.key) },
            value: valueSchemaFor(fields),
            ocr_token_ids: {
              type: 'array',
              items: { type: 'string', pattern: '^t\\d+$' },
              minItems: 1,
              description: 'The ids of the OCR words that spell the value, from the list given.',
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['key', 'value', 'ocr_token_ids', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['values'],
    additionalProperties: false,
  };
}

const PROSE_TOOL_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'One sentence in Brazilian Portuguese, or an empty string when nothing applies.' },
  },
  required: ['text'],
  additionalProperties: false,
};

// --- prompts ----------------------------------------------------------------------

const STRUCTURING_SYSTEM = [
  'You read equipment nameplates and panel fronts photographed during inspections of medium-voltage electrical substations in Brazil.',
  'You get the photo, the words an OCR engine found on it (one per line as "<id>: <text>", in reading order) and the fields to fill.',
  `Call the ${STRUCTURING_TOOL} tool exactly once.`,
  'For each field you can read on the photo, give one value and cite in ocr_token_ids the ids of the OCR words that spell it.',
  'Rules: cite only ids from the list; never invent a value or an id; leave out a field you cannot read or whose words are not in the list; never give coordinates.',
  'Value by field kind:',
  '- text, manufacturer: the text as printed.',
  '- select: exactly one of the options listed for the field.',
  '- date: exactly as precise as printed: YYYY for a year alone, YYYY-MM for a month and year, YYYY-MM-DD for a day; never add a month or a day the photo does not print.',
  '- voltage_class: the voltage as printed, for example "15 kV".',
  '- number: an object {"raw": the number with a dot as decimal separator and no thousands separator, "unit": the unit as printed or null, "state": "measured"}. Plates print the Brazilian way: "13.800" is 13800 and "1,5" is 1.5. Give the unit printed beside the number even when the field has another one.',
  'confidence is your confidence in the value, from 0 to 1.',
].join('\n');

function fieldLine(field: FieldDef): string {
  const details = [field.kind, field.unit === undefined ? null : `unit ${field.unit}`, field.options === undefined ? null : `options: ${field.options.join(' | ')}`].filter(
    (part): part is string => part !== null,
  );
  return `- ${field.key} (${details.join('; ')}): ${field.label}`;
}

/** Story 21.2: the paragraph that asks for the vector group, printed or drawn, as one of the 47 codes. */
export function vectorGroupPrompt(key: string): string {
  return [
    `The field ${key} holds the transformer's vector group (IEC 60076-1: high-voltage connection in capitals, low-voltage connection in lower case, then the clock number).`,
    `Give exactly one of these codes: ${VECTOR_GROUP_CODES.join(' | ')}.`,
    'When the plate prints the code (for example "Dyn1", "DYN1" or "Dyn 1"), give that code and cite the words that print it.',
    `When no code is printed, leave ${key} out of values and fill vector_diagram instead: describe what is drawn, never compose the code.`,
  ].join('\n');
}

/**
 * Stories 22.7 and 22.9 (seed v12): the lines that say what a v12 field holds, for the fields the
 * request carries: the transformer's TIPO (the maker's designation, never the oil), its TIPO DO
 * ÓLEO (the oil class letter) and its TIPO DE ISOLAÇÃO (oil when the plate names insulating oil),
 * and an EXATIDÃO select's class, sent as printed for the kernel to read (`parseAccuracyClass`).
 * Empty for a request with none of them, so every other plate's prompt is as before.
 *
 * Story 23.7 (seed v13): TAPS (a `list` field) as the whole list in plate order, TAP ATUAL (its
 * `pick_from` field) one of them, MATERIAL DO ENROLAMENTO by its options, a TP voltage over √3 (an
 * `over_sqrt3` field) and the TC's RELAÇÃO (a `dash_ratio` field) as printed: the kernel parses
 * them (`reading/value.ts`), never the model. A v12 request carries none of these keys.
 */
export function plateFieldNotes(fields: readonly FieldDef[]): string[] {
  const field = (key: string) => fields.find((candidate) => candidate.key === key);
  const notes: string[] = [];
  // Story 24.13 (seed v14): the No-break de comando's battery bank, whose fields carry "BATERIAS:" in their labels.
  const batteries = fields.filter((candidate) => candidate.key.startsWith('baterias_'));
  if (batteries.length > 0) {
    notes.push(
      `The fields ${batteries.map((candidate) => candidate.key).join(', ')} describe the battery bank (the labels start with "BATERIAS:"), not the no-break unit: fill them only from words printed for the batteries (a battery label or a "Baterias" section of the plate), and leave them out when the photo shows none. The unit's own maker, model, power and voltages are never the batteries'.`,
    );
    const quantity = field('baterias_quantidade');
    if (quantity !== undefined) notes.push('The field baterias_quantidade is the number of batteries in the bank (for example "10 x 12 V 7 Ah" gives 10), a plain number with no unit.');
  }
  const oil = field('tipo_do_oleo');
  if (oil !== undefined) {
    if (field('tipo') !== undefined) notes.push('The field tipo is the manufacturer\'s type or model designation (for example "TRICAST"), never the insulating oil.');
    notes.push(`The field tipo_do_oleo is the class letter of the insulating oil: "Tipo óleo isolante B" is tipo_do_oleo = B; give one of: ${oil.options?.join(' | ') ?? 'A | B'}.`);
    const insulation = field('tipo_de_isolacao');
    const oilOption = insulation?.options?.find((option) => /óleo/i.test(option));
    if (oilOption !== undefined) notes.push(`The field tipo_de_isolacao is ${oilOption} when the plate names an insulating oil ("óleo isolante", "óleo mineral"); leave it out when the plate prints no insulation word.`);
  }
  // Story 23.17 (seed v13): TIPO (ANP), the class letter, and NATUREZA DO LÍQUIDO only as printed; the kernel composes the insulation and a mineral liquid from a class (P-2).
  const anp = field('tipo_anp');
  if (anp !== undefined) {
    if (field('tipo') !== undefined) notes.push('The field tipo is the manufacturer\'s type or model designation (for example "TRICAST"), never the insulating oil.');
    notes.push(`The field tipo_anp is the class letter of the insulating oil: "Tipo óleo isolante B" is tipo_anp = B; give one of: ${(anp.options ?? []).filter((option) => option.length === 1).join(' | ') || 'A | B'}; leave it out when the plate prints no class.`);
    const liquid = field('natureza_liquido');
    if (liquid !== undefined) notes.push(`The field natureza_liquido is the insulating liquid the plate names (give one of: ${liquid.options?.join(' | ') ?? ''}); leave it out when the plate names none.`);
    const insulation = field('tipo_de_isolacao');
    const oilOption = insulation?.options?.find((option) => /óleo/i.test(option));
    if (oilOption !== undefined) notes.push(`The field tipo_de_isolacao is ${oilOption} when the plate names an insulating oil or liquid ("óleo isolante", "óleo mineral", "silicone"); leave it out when the plate prints no insulation word.`);
  }
  // Story 28.3 (seed v18): the transformer's dry option and its CONSTRUÇÃO, only as printed; the kernel reads an EPÓXI as the dry option.
  const construcao = field('construcao');
  if (construcao?.kind === 'select') {
    const dry = field('tipo_de_isolacao')?.options?.find((option) => /seco/i.test(option));
    if (dry !== undefined) notes.push(`The field tipo_de_isolacao is ${dry} when the plate names a dry unit ("a seco", "seco", "epóxi", "resina epóxi", "cast resin", "VPI"); leave it out when the plate prints no insulation word.`);
    notes.push(
      `The field construcao is how a dry unit is built, only as printed: give one of: ${construcao.options?.join(' | ') ?? ''} ("encapsulado", "resina epóxi" or "cast resin" is the first, "impregnado a vácuo" or "VPI" the second); leave it out when the plate prints neither.`,
    );
  }
  const exatidao = field('exatidao');
  if (exatidao?.kind === 'select') {
    notes.push('The field exatidao is the accuracy class exactly as printed, burden included (for example "0,6C25" or "10P20"): give it as text, not forced to one of its options.');
    // Story 23.18 (seed v13): a select offering the S classes and the protection classes with their accuracy limit factor.
    if ((exatidao.options ?? []).some((option) => /S$|P\d+$/.test(option))) {
      notes.push('The class of exatidao keeps the S of a special measurement class as printed ("0,3S", "0,6S") and the accuracy limit factor of a protection class ("5P20", "10P20"); never drop either.');
    }
  }
  // Story 23.18 (seed v13): FUNÇÃO DO TC only as the plate prints it.
  const funcao = field('funcao_tc');
  if (funcao?.kind === 'select') {
    notes.push(`The field funcao_tc is the transformer's function as printed: give one of: ${funcao.options?.join(' | ') ?? ''} ("medição" is MEDIÇÃO, "proteção" PROTEÇÃO, a billing or utility metering transformer, "faturamento", FATURAMENTO); leave it out when the plate prints no function.`);
  }
  // Story 23.7 (seed v13): the v13 keys the kernel parses (AD-13, E21-A4 P-2), named by the fields the request carries.
  for (const list of fields.filter((candidate) => candidate.kind === 'number' && candidate.list === true)) {
    notes.push(`The field ${list.key} is the plate's whole list of taps (derivações), every tap in plate order, exactly as printed with its unit (for example "13,8 / 13,2 / 12,6 / 12 / 11,4 kV" or "13800-13200-12600 V"): give it as text, never one tap alone.`);
    for (const picked of fields.filter((candidate) => candidate.pick_from === list.key)) {
      notes.push(`The field ${picked.key} is the tap in service, one value of ${list.key} with its unit; leave it out when the plate does not print which tap is in service.`);
    }
  }
  const material = field('material_enrolamento');
  if (material?.kind === 'select') notes.push(`The field material_enrolamento is the winding material: give one of: ${material.options?.join(' | ') ?? 'Cu | Al'} (Cu for copper, "cobre"; Al for aluminium, "alumínio").`);
  for (const over of fields.filter((candidate) => candidate.kind === 'number' && candidate.over_sqrt3 === true)) {
    notes.push(`The field ${over.key} may print a voltage over the square root of 3 ("115/√3", "115/V3"): give it exactly as printed, as text; a plain voltage as a number.`);
  }
  for (const ratio of fields.filter((candidate) => candidate.dash_ratio === true)) {
    notes.push(`The field ${ratio.key} is the ratio exactly as printed, a dash or a slash included (for example "200-5 A" or "200/5"): give it as text.`);
  }
  return notes;
}

/** The structuring request's text: the fields, then the OCR words as `t<n>: text` lines, never their boxes. */
export function structuringPrompt(input: Pick<PlateStructuringInput, 'ocr' | 'fields' | 'vectorGroupKey'>): string {
  const words = input.ocr.tokens.length === 0 ? '(no words)' : input.ocr.tokens.map((token) => `${token.id}: ${token.text}`).join('\n');
  const key = vectorGroupKeyOf(input);
  const group = key !== undefined ? `\n\n${vectorGroupPrompt(key)}` : '';
  const notes = plateFieldNotes(input.fields);
  const fieldNotes = notes.length === 0 ? '' : `\n\n${notes.join('\n')}`;
  return `Fields:\n${input.fields.map(fieldLine).join('\n')}${fieldNotes}${group}\n\nOCR words:\n${words}`;
}

const PROSE_SYSTEM = [
  'You write one short sentence in Brazilian Portuguese (pt-BR) for the technical report of an inspection of a medium-voltage electrical substation.',
  `Call the ${PROSE_TOOL} tool exactly once.`,
  'Describe only what the photo shows; never identify or describe a person; never invent a measurement or a brand.',
  'When nothing applies, give an empty text.',
].join('\n');

/** The prose request's text for a caption or an NC observation draft. */
export function prosePrompt(input: Pick<ProseInput, 'kind' | 'context'>): string {
  if (input.kind === 'caption') {
    return 'Write the caption of this photo: what it shows (equipment, room or condition), at most 12 words, like "Vista geral da cabine primária".';
  }
  const item = input.context.item_label ?? '(unnamed item)';
  // The seed's pt-BR name of the type ("Chave seccionadora"), the code itself when it has none.
  const block = input.context.block_type === null ? '(unknown equipment)' : blockTypeLabel(SEED_VERSION, input.context.block_type);
  return (
    `The checklist item "${item}" of the equipment "${block}" was marked non-conforming (NC). ` +
    'Write one observation sentence that describes the non-conformity this photo shows, like "Oxidação aparente na estrutura do equipamento.". ' +
    'If the photo does not show it, give an empty text.'
  );
}

// --- the tool input's members sent as JSON text -------------------------------------

/*
 * e28v (the paid eval of 2026-11-23, prompt 10, Haiku 4.5 on the drawn Yyn0 plate of seed v18):
 * twice the model sent the tool input's `values` as a string holding the JSON array instead of the
 * array, and the strict parse turned the reading into a permanent failure. Converse models do this
 * now and then with a nested array or object parameter. So, before the vector-diagram fold and the
 * contract parse, each member the tool schema types as an array or an object (`values`, each of its
 * entries, an entry's `ocr_token_ids`, `vector_diagram` and its `ocr_token_ids`) that arrives as a
 * string is replaced by its JSON parse when that parse has the member's shape. Anything else stays
 * as it came, and the same strict schema judges the result. A value (`values[].value`) is never
 * decoded: the schema takes a string there. The whole tool input as a string stays a failure.
 *
 * e28v2 (the same plate after #375, the raw input captured by the coordinator): the `values` text
 * was not the array alone but the tool object's body from `values` on without its braces, the
 * array followed by `,"vector_diagram": {...}`, and `vector_diagram` was missing from the top level.
 * When the `values` text does not parse on its own, `{"values":<text>}` is tried, and taken only
 * when it is a plain object of the tool's own members (`values` and `vector_diagram`) with at least
 * one leaked beside `values`, `values` is an array, and no leaked member is also at the top level
 * (a conflict stays a failure). Its members then go through the same steps and the same schema.
 */

/** The members decoded, by their path in the tool input; logged when not empty. */
export type DecodedMember = 'values+vector_diagram' | 'values' | 'values[]' | 'values[].ocr_token_ids' | 'vector_diagram' | 'vector_diagram.ocr_token_ids';

const isObjectRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The tool input's members the `values` text may carry after the array (e28v2). */
const LEAKABLE_MEMBERS: readonly string[] = [VECTOR_DIAGRAM_KEY];

/** e28v2: the tool input with the members leaked into the `values` text lifted back to the top level; null when the text does not carry them. */
function withLeakedMembers(input: Record<string, unknown>): Record<string, unknown> | null {
  const text = input.values;
  if (typeof text !== 'string') return null;
  try {
    JSON.parse(text);
    return null;
  } catch {
    // Not JSON on its own: maybe the body of the tool object from `values` on.
  }
  let body: unknown;
  try {
    body = JSON.parse(`{"values":${text}}`);
  } catch {
    return null;
  }
  if (!isObjectRecord(body) || !Array.isArray(body.values)) return null;
  const leaked = Object.keys(body).filter((key) => key !== 'values');
  if (leaked.length === 0 || leaked.some((key) => !LEAKABLE_MEMBERS.includes(key) || Object.hasOwn(input, key))) return null;
  return { ...input, ...body };
}

/** The JSON parse of a string member when it has the member's shape; the member as it came otherwise. */
function decodedMember(value: unknown, shape: 'array' | 'object'): { value: unknown; decoded: boolean } {
  if (typeof value !== 'string') return { value, decoded: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { value, decoded: false };
  }
  const fits = shape === 'array' ? Array.isArray(parsed) : isObjectRecord(parsed);
  return fits ? { value: parsed, decoded: true } : { value, decoded: false };
}

/** The tool input with its array and object members sent as JSON text parsed back, and which members were. */
export function withDecodedJsonMembers(raw: unknown): { input: unknown; decoded: DecodedMember[] } {
  if (!isObjectRecord(raw)) return { input: raw, decoded: [] };
  const decoded = new Set<DecodedMember>();
  const lifted = withLeakedMembers(raw);
  if (lifted !== null) decoded.add('values+vector_diagram');
  const input = lifted ?? raw;
  const member = (value: unknown, shape: 'array' | 'object', path: DecodedMember): unknown => {
    const result = decodedMember(value, shape);
    if (result.decoded) decoded.add(path);
    return result.value;
  };
  const withIds = (entry: unknown, path: 'values[].ocr_token_ids' | 'vector_diagram.ocr_token_ids'): unknown =>
    isObjectRecord(entry) && Object.hasOwn(entry, 'ocr_token_ids') ? { ...entry, ocr_token_ids: member(entry.ocr_token_ids, 'array', path) } : entry;
  const output: Record<string, unknown> = { ...input };
  if (Object.hasOwn(input, 'values')) {
    const values = member(input.values, 'array', 'values');
    output.values = Array.isArray(values) ? values.map((entry: unknown) => withIds(member(entry, 'object', 'values[]'), 'values[].ocr_token_ids')) : values;
  }
  if (Object.hasOwn(input, VECTOR_DIAGRAM_KEY)) output[VECTOR_DIAGRAM_KEY] = withIds(member(input[VECTOR_DIAGRAM_KEY], 'object', 'vector_diagram'), 'vector_diagram.ocr_token_ids');
  if (decoded.size === 0) return { input: raw, decoded: [] };
  const order: DecodedMember[] = ['values+vector_diagram', 'values','values[]', 'values[].ocr_token_ids', 'vector_diagram', 'vector_diagram.ocr_token_ids'];
  return { input: output, decoded: order.filter((path) => decoded.has(path)) };
}

// --- the call ---------------------------------------------------------------------

function imageBlock(image: OcrImage): ContentBlock {
  if (image.bytes.byteLength > BEDROCK_MAX_IMAGE_BYTES) {
    throw new PermanentReadingError(`bedrock: the image is ${image.bytes.byteLength} bytes, over the ${BEDROCK_MAX_IMAGE_BYTES} limit`);
  }
  return { image: { format: image.mime === 'image/png' ? 'png' : 'jpeg', source: { bytes: image.bytes } } };
}

/** Story 11.6: the structuring step (plate, panel) through Converse tool use on `modelId`. */
export function bedrockStructuringProvider(options: BedrockProviderOptions): StructuringProvider {
  assertPricedModel(options.modelId);
  return {
    async structure(input: StructuringInput): Promise<StructuringResult> {
      const plate = input as PlateStructuringInput;
      const groupKey = vectorGroupKeyOf(plate);
      const content: ContentBlock[] = [imageBlock(input.image), { text: structuringPrompt(plate) }];
      const answer = await converseTool(options, {
        modelId: options.modelId,
        system: STRUCTURING_SYSTEM,
        content,
        tool: { name: STRUCTURING_TOOL, description: 'Records the field values read on the photo, each citing the OCR word ids that spell it.', schema: structuringToolSchema(input.fields, groupKey) },
        maxTokens: STRUCTURING_MAX_TOKENS,
      }).catch((error: unknown) => {
        // Story 30.2 B: a billed failure names this step's prompt version.
        throw withPromptVersion(error, BEDROCK_STRUCTURING_PROMPT_VERSION);
      });
      // e28v: array and object members sent as JSON text are parsed back first; one log line says which, never their content.
      const members = withDecodedJsonMembers(answer.input);
      if (members.decoded.length > 0) log('reading structuring tool input decoded', { model: options.modelId, members: members.decoded });
      // e21f: the drawn diagram's facts become the group's value (or are dropped), then the uncited values go.
      // e21a (R-3): the fold's outcome is one log line.
      const fold = withVectorDiagram(members.input, vectorGroupOf(plate), input.ocr.tokens);
      logVectorDiagram(fold, options.modelId);
      const parsed = structuringResultSchema.safeParse({ output: withoutUncitedValues(fold.input), model: options.modelId, prompt_version: BEDROCK_STRUCTURING_PROMPT_VERSION, usage: answer.usage });
      if (!parsed.success) {
        // Story 30.2 B: the answer was billed: the call rides on the permanent error.
        throw new BilledCallError(`bedrock: ${options.modelId}: the tool input is not a StructuringOutput: ${parsed.error.message.slice(0, 300)}`, {
          model: options.modelId,
          prompt_version: BEDROCK_STRUCTURING_PROMPT_VERSION,
          usage: answer.usage,
        });
      }
      return parsed.data;
    },
  };
}

const proseToolInputSchema = z.object({ text: z.string().nullable() }).strict();

/** Story 11.6: the prose step (vision caption, NC draft) through Converse tool use on `modelId`; no OCR. */
export function bedrockProseProvider(options: BedrockProviderOptions): ProseProvider {
  assertPricedModel(options.modelId);
  return {
    async describe(input: ProseInput): Promise<ProseResult> {
      const answer = await converseTool(options, {
        modelId: options.modelId,
        system: PROSE_SYSTEM,
        content: [imageBlock(input.image), { text: prosePrompt(input) }],
        tool: { name: PROSE_TOOL, description: 'Records the one sentence written for the photo.', schema: PROSE_TOOL_SCHEMA },
        maxTokens: PROSE_MAX_TOKENS,
      }).catch((error: unknown) => {
        // Story 30.2 B: a billed failure names this step's prompt version.
        throw withPromptVersion(error, BEDROCK_PROSE_PROMPT_VERSION);
      });
      const billed = { model: options.modelId, prompt_version: BEDROCK_PROSE_PROMPT_VERSION, usage: answer.usage };
      const tool = proseToolInputSchema.safeParse(answer.input);
      if (!tool.success) throw new BilledCallError(`bedrock: ${options.modelId}: the tool input is not {text}: ${tool.error.message.slice(0, 300)}`, billed);
      const text = tool.data.text?.trim() ?? '';
      const parsed = proseResultSchema.safeParse({ output: text === '' ? null : { text }, model: options.modelId, prompt_version: BEDROCK_PROSE_PROMPT_VERSION, usage: answer.usage });
      if (!parsed.success) throw new BilledCallError(`bedrock: ${options.modelId}: not a ProseResult: ${parsed.error.message.slice(0, 300)}`, billed);
      return parsed.data;
    },
  };
}
