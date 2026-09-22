import { z } from 'zod';
import { isoTimestampSchema } from '../clock.ts';
import { actorIdSchema, uuidV7Schema } from '../ids.ts';

/*
 * Row schemas for every entity the op log materializes (AD-5, AD-10, AD-18).
 * Rows carry no `company_id` except `file` (AD-10); the Drizzle layer adds it
 * as a column. `{field}` segments of an op path are validated against these
 * schemas through `entityKeys`, so a later story extends a schema here and
 * `parsePath` follows.
 */

export const jsonValueSchema = z.json();
export type JsonValue = z.infer<typeof jsonValueSchema>;

const nullableIso = isoTimestampSchema.nullable();
const nullableId = uuidV7Schema.nullable();
const nullableString = z.string().nullable();

/** AD-11 `number` value shape; `raw` is a decimal string using `.`. */
export const numberValueSchema = z.object({
  raw: z.string(),
  unit: nullableString,
  state: z.enum(['measured', 'not_measured', 'empty']),
});

/** AD-11 `date` value shape: `YYYY-MM-DD` or `YYYY-MM`. */
export const dateValueSchema = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);

/** A field whose definition (AD-11) resolves through the seed: any JSON until Story 3.1. */
export const fieldValueSchema = jsonValueSchema;

/** Every sheet cell carries its provenance (AD-12). */
export const cellSchema = z.object({
  value: fieldValueSchema,
  source_suggestion_id: nullableId,
  op_id: uuidV7Schema,
});
export type Cell = z.infer<typeof cellSchema>;

const cellMap = z.record(z.string(), cellSchema);

// --- company scope ---------------------------------------------------------

export const projectRowSchema = z.object({
  id: uuidV7Schema,
  client_id: nullableId,
  name: z.string(),
  site: nullableString,
  removed_at: nullableIso,
});

export const registryKindSchema = z.enum([
  'empresa',
  'client',
  'instrument',
  'manufacturer',
  'voltage_class',
  'atividade',
  'local',
  'criterion',
]);
export type RegistryKind = z.infer<typeof registryKindSchema>;

const registryBase = { id: uuidV7Schema, removed_at: nullableIso };

/** AD-19 metadata for by-value registries (gender and number drive `contextCaption`). */
const wordMetadata = {
  name: z.string(),
  gender: z.enum(['m', 'f']).nullable(),
  number: z.enum(['singular', 'plural']).nullable(),
};

export const registryRowSchemas = {
  empresa: z.object({
    ...registryBase,
    kind: z.literal('empresa'),
    name: z.string(),
    cnpj: nullableString,
    address: nullableString,
    logo_file_id: nullableId,
    watermark_file_id: nullableId,
    cover_background_file_id: nullableId,
  }),
  client: z.object({
    ...registryBase,
    kind: z.literal('client'),
    name: z.string(),
    cnpj: nullableString,
    address: nullableString,
  }),
  instrument: z.object({
    ...registryBase,
    kind: z.literal('instrument'),
    code: z.string(),
    manufacturer: nullableString,
    model: nullableString,
    serial: nullableString,
    cert_number: nullableString,
    calibrated_at: dateValueSchema.nullable(),
    valid_until: dateValueSchema.nullable(),
    test_parameter: nullableString,
    certificate_file_id: nullableId,
  }),
  manufacturer: z.object({ ...registryBase, kind: z.literal('manufacturer'), ...wordMetadata }),
  voltage_class: z.object({ ...registryBase, kind: z.literal('voltage_class'), ...wordMetadata }),
  atividade: z.object({ ...registryBase, kind: z.literal('atividade'), ...wordMetadata }),
  local: z.object({ ...registryBase, kind: z.literal('local'), ...wordMetadata }),
  criterion: z.object({
    ...registryBase,
    kind: z.literal('criterion'),
    name: z.string(),
    operator: z.string(),
    value: z.string(),
    unit: nullableString,
    type: z.string(),
    source: z.object({ name: z.string(), edition: nullableString }),
  }),
} as const;

export const registryRowSchema = z.discriminatedUnion('kind', [
  registryRowSchemas.empresa,
  registryRowSchemas.client,
  registryRowSchemas.instrument,
  registryRowSchemas.manufacturer,
  registryRowSchemas.voltage_class,
  registryRowSchemas.atividade,
  registryRowSchemas.local,
  registryRowSchemas.criterion,
]);

export const templateRowSchema = z.object({
  id: uuidV7Schema,
  name: z.string(),
  version: z.number().int().nonnegative(),
  seed_version: z.string(),
  blocks: jsonValueSchema,
  removed_at: nullableIso,
});

export const userRowSchema = z.object({
  id: uuidV7Schema,
  name: z.string(),
  email: z.string(),
  professional_registration: nullableString,
  photo_location_enabled: z.boolean(),
});

// --- project scope ---------------------------------------------------------

/**
 * AD-25 server projection of the last issued nameplate. `relatorio_id` here is
 * provenance of a value copied at issue time, never a reference that is followed.
 */
export const lastNameplateSchema = z.object({
  relatorio_id: uuidV7Schema,
  revision_number: z.number().int().positive(),
  issued_at: isoTimestampSchema,
  seed_version: z.string(),
  block_type: z.string(),
  fields: z.record(z.string(), fieldValueSchema),
});

export const equipmentRowSchema = z.object({
  id: uuidV7Schema,
  project_id: uuidV7Schema,
  tag: z.string(),
  type: z.string(),
  last_nameplate: lastNameplateSchema.nullable(),
  removed_at: nullableIso,
});

// --- relatorio scope -------------------------------------------------------

export const relatorioStatusSchema = z.enum(['rascunho', 'em_campo', 'em_revisao', 'emitido']);
export type RelatorioStatus = z.infer<typeof relatorioStatusSchema>;
export const exportSchemeSchema = z.enum(['por_local_e_tipo', 'ordem_de_campo']);

export const relatorioSetupSchema = z.object({
  service_start: dateValueSchema.nullable(),
  service_end: dateValueSchema.nullable(),
  atividade: nullableString,
  local: nullableString,
  responsible_user_id: nullableId,
  cover_photo_file_id: nullableId,
});

export const relatorioRowSchema = z.object({
  id: uuidV7Schema,
  project_id: uuidV7Schema,
  template_id: nullableId,
  template_version: z.number().int().nonnegative().nullable(),
  seed_version: z.string(),
  status: relatorioStatusSchema,
  setup: relatorioSetupSchema,
  export: z.object({ scheme: exportSchemeSchema }),
  preview_file_id: nullableId,
  removed_at: nullableIso,
});

export const locationSeSchema = z.object({
  type: nullableString,
  primary_kv: numberValueSchema.nullable(),
  secondary_kv: numberValueSchema.nullable(),
  installed_kva: numberValueSchema.nullable(),
});

export const locationEnvSchema = z.object({
  altitude_m: numberValueSchema.nullable(),
  temperature_c: numberValueSchema.nullable(),
  humidity_pct: numberValueSchema.nullable(),
});

const locationBase = {
  id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  parent_id: nullableId,
  name: z.string(),
  order_key: z.string(),
  removed_at: nullableIso,
};

/** AD-6: `se`, `env` and `agrupar_por_tipo` exist only on `kind = cabine`. */
export const locationRowSchema = z.discriminatedUnion('kind', [
  z.object({
    ...locationBase,
    kind: z.literal('cabine'),
    se: locationSeSchema,
    env: locationEnvSchema,
    agrupar_por_tipo: z.boolean(),
  }),
  z.object({ ...locationBase, kind: z.literal('coluna') }),
]);

export const notTestedSchema = z.object({
  reason: z.string(),
  text: nullableString,
  at: isoTimestampSchema,
  by: actorIdSchema,
});

export const concludedBySchema = z.object({ actor_id: actorIdSchema, at: isoTimestampSchema });

export const sheetSchema = z.object({
  nameplate: cellMap,
  checklist: z.record(
    z.string(),
    z.object({ result: cellSchema.optional(), observation: cellSchema.optional() }),
  ),
  test: z.record(
    z.string(),
    z.object({
      instrument: cellSchema.optional(),
      criterion_override: cellSchema.optional(),
      cells: z.record(z.string(), cellMap),
    }),
  ),
  conclusion: z.object({
    result: cellSchema.optional(),
    restriction: cellSchema.optional(),
    text: cellSchema.optional(),
    text_status: cellSchema.optional(),
    text_basis: cellSchema.optional(),
  }),
  observations: cellSchema.nullable(),
});
export type Sheet = z.infer<typeof sheetSchema>;

export const emptySheet = (): Sheet => ({
  nameplate: {},
  checklist: {},
  test: {},
  conclusion: {},
  observations: null,
});

export const blockRowSchema = z.object({
  id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  location_id: uuidV7Schema,
  equipment_id: nullableId,
  block_type: z.string(),
  config: jsonValueSchema,
  seed_version: z.string(),
  order_key: z.string(),
  feeds_block_id: nullableId,
  not_tested: notTestedSchema.nullable(),
  concluded_by: concludedBySchema.nullable(),
  sheet: sheetSchema,
  // Derived columns (AD-18): materialized only by applyOp, never emitted.
  created_by: actorIdSchema.nullable(),
  first_edited_at: nullableIso,
  last_modified_by: actorIdSchema.nullable(),
  last_modified_at: nullableIso,
  removed_at: nullableIso,
});

export const fileVariantsSchema = z.object({ thumb: z.string(), print: z.string() });
export const readingStatusSchema = z.enum(['none', 'queued', 'running', 'done', 'failed']);

const fileBase = {
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  relatorio_id: nullableId,
  sha256: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  uploaded_at: nullableIso,
  variants: fileVariantsSchema.nullable(),
  removed_at: nullableIso,
};

export const photoFileRowSchema = z.object({
  ...fileBase,
  kind: z.literal('photo'),
  captured_at: isoTimestampSchema,
  tz_offset: z.number().int(),
  coords: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracy_m: z.number().nullable(),
      source: z.enum(['geolocation', 'exif']),
    })
    .nullable(),
  local_seq: z.number().int().nonnegative(),
  block_id: nullableId,
  item_key: nullableString,
  caption: nullableString,
  reading_kind: z.enum(['plate', 'display', 'caption', 'panel', 'nc_obs']).nullable(),
  reading_target: jsonValueSchema.nullable(),
  reading_status: readingStatusSchema,
});

export const otherFileKindSchema = z.enum([
  'certificate',
  'logo',
  'cover_background',
  'watermark',
  'cover_photo',
  'preview',
  'docx',
  'pdf',
]);

export const otherFileRowSchema = z.object({ ...fileBase, kind: otherFileKindSchema });

/** AD-7 union, minimal for this story. */
export const fileRowSchema = z.discriminatedUnion('kind', [photoFileRowSchema, otherFileRowSchema]);

export const pointRowSchema = z.object({
  id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  text: z.string(),
  equipment_id: nullableId,
  origin: z.enum(['manual', 'not_tested']),
  order_key: z.string(),
  removed_at: nullableIso,
});

export const suggestionRowSchema = z.object({
  id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  target_path: z.string(),
  value: fieldValueSchema,
  trust: z.enum(['suggested', 'verify']),
  mode: z.enum(['fill', 'replace']),
  source: z.object({
    photo_id: uuidV7Schema,
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    ocr_token_ids: z.array(z.string()),
    reading_run_id: uuidV7Schema,
  }),
  status: z.enum(['pending', 'confirmed', 'discarded']),
  prompt_version: z.string(),
});

export const generationJobRowSchema = z.object({
  id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  kind: z.enum(['issue', 'preview']),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  error: nullableString,
  result_file_id: nullableId,
  created_at: isoTimestampSchema,
});

export const revisionRowSchema = z.object({
  id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  number: z.number().int().positive(),
  snapshot_seq: z.number().int().nonnegative(),
  created_by: actorIdSchema,
  docx_file_id: uuidV7Schema,
  pdf_file_id: uuidV7Schema,
  created_at: isoTimestampSchema,
});

// --- entity registry -------------------------------------------------------

export const entityRowSchemas = {
  project: projectRowSchema,
  relatorio: relatorioRowSchema,
  location: locationRowSchema,
  block: blockRowSchema,
  equipment: equipmentRowSchema,
  file: fileRowSchema,
  point: pointRowSchema,
  suggestion: suggestionRowSchema,
  registry: registryRowSchema,
  template: templateRowSchema,
  user: userRowSchema,
  generation_job: generationJobRowSchema,
  revision: revisionRowSchema,
} as const;

export type Entity = keyof typeof entityRowSchemas;
export const ENTITIES = Object.keys(entityRowSchemas) as Entity[];
export const entitySchema = z.enum(ENTITIES as [Entity, ...Entity[]]);

export type EntityRowOf<E extends Entity> = z.infer<(typeof entityRowSchemas)[E]>;
export type ProjectRow = EntityRowOf<'project'>;
export type RelatorioRow = EntityRowOf<'relatorio'>;
export type LocationRow = EntityRowOf<'location'>;
export type BlockRow = EntityRowOf<'block'>;
export type EquipmentRow = EntityRowOf<'equipment'>;
export type FileRow = EntityRowOf<'file'>;
export type PhotoFileRow = z.infer<typeof photoFileRowSchema>;
export type PointRow = EntityRowOf<'point'>;
export type SuggestionRow = EntityRowOf<'suggestion'>;
export type RegistryRow = EntityRowOf<'registry'>;
export type TemplateRow = EntityRowOf<'template'>;
export type UserRow = EntityRowOf<'user'>;
export type GenerationJobRow = EntityRowOf<'generation_job'>;
export type RevisionRow = EntityRowOf<'revision'>;
export type EntityRow = EntityRowOf<Entity>;

export const scopeSchema = z.enum(['company', 'project', 'relatorio']);
export type Scope = z.infer<typeof scopeSchema>;

/**
 * AD-5 ownership: the scopes an entity's rows live in. `file` is the one
 * entity with two: brand files and certificates are company scope, photos and
 * cover photos are relatorio scope (AD-7).
 */
export const ENTITY_SCOPE: Readonly<Record<Entity, readonly Scope[]>> = {
  project: ['company'],
  registry: ['company'],
  template: ['company'],
  user: ['company'],
  equipment: ['project'],
  relatorio: ['relatorio'],
  location: ['relatorio'],
  block: ['relatorio'],
  point: ['relatorio'],
  suggestion: ['relatorio'],
  generation_job: ['relatorio'],
  revision: ['relatorio'],
  file: ['company', 'relatorio'],
};

function keysOf(schema: z.ZodType): string[] {
  if (schema instanceof z.ZodObject) return Object.keys(schema.shape);
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const keys = new Set<string>();
    for (const option of schema.options as z.ZodType[]) for (const k of keysOf(option)) keys.add(k);
    return [...keys];
  }
  return [];
}

/** Field names of an entity's row schema (union of variants for `location` and `file`). */
export function entityKeys(entity: Entity): readonly string[] {
  return keysOf(entityRowSchemas[entity]);
}

/** Field names of one registry kind. */
export function registryKeys(kind: RegistryKind): readonly string[] {
  return keysOf(registryRowSchemas[kind]);
}

export const RELATORIO_SETUP_KEYS = keysOf(relatorioSetupSchema);
export const LOCATION_SE_KEYS = keysOf(locationSeSchema);
export const LOCATION_ENV_KEYS = keysOf(locationEnvSchema);

/** Adapter index columns that both layers derive the same way from a row. */
export function rowIndexColumns(
  entity: Entity,
  row: EntityRow,
): { relatorio_id: string | null; project_id: string | null } {
  const r = row as { relatorio_id?: string | null; project_id?: string | null };
  const relatorio_id = entity === 'relatorio' ? row.id : (r.relatorio_id ?? null);
  const project_id = r.project_id ?? null;
  return { relatorio_id, project_id };
}

export function rowRemovedAt(row: EntityRow): string | null {
  return (row as { removed_at?: string | null }).removed_at ?? null;
}
