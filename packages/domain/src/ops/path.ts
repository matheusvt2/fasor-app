import { z } from 'zod';
import { uuidV7Schema } from '../ids.ts';
import {
  entityKeys,
  LOCATION_ENV_KEYS,
  LOCATION_SE_KEYS,
  registryKeys,
  registryKindSchema,
  RELATORIO_SETUP_KEYS,
  type Entity,
  type RegistryKind,
} from '../schemas/entities.ts';

/*
 * AD-3: `OpPath` is a discriminated union of families, read and written only
 * through `parsePath` and `formatPath`. The family list is append-only.
 * Seed-defined segments (nameplate `field_key`, checklist `item_key`,
 * `test_key`) are validated structurally only here (`seedKey`); `parsePath`
 * has no block state to check them against the block's own definition. That
 * check is `assertSeedPath` in `ops/apply.ts` (E3-A3), which runs in
 * `applyOp` where the target block is loaded. Cell `row`/`col` stay
 * structural (`cellIndex`) here; their meaning is the Porto Seguro fixture's
 * (Stories 5.5-5.6, `relatorio/readings.ts`): `row` counts the rows across the
 * test's tables in table order (contato aberto 0-2, contato fechado 3-5), `col`
 * indexes that row's table `value_columns` (the single insulation capture
 * `1 MINUTO` is col 1; the TP ratio inputs are cols 0 and 1, its capture col 3).
 * `assertSeedPath` refuses a row/col outside that geometry or a `derived` column.
 * `{field}` segments are keys of the target entity's schema.
 */

const seedKey = z.string().regex(/^[a-z0-9_]+$/);
const cellIndex = z.number().int().nonnegative();

export const LOCATION_FIELDS = ['name', 'parent_id', 'order_key', 'removed_at'] as const;
export const BLOCK_FIELDS = [
  'location_id',
  'order_key',
  'removed_at',
  'config',
  'feeds_block_id',
  'not_tested',
  'concluded_by',
] as const;
export const CHECKLIST_FIELDS = ['result', 'observation'] as const;
export const TEST_FIELDS = ['instrument', 'criterion_override'] as const;
export const CONCLUSION_FIELDS = ['result', 'restriction', 'text', 'text_status', 'text_basis'] as const;
export const EQUIPMENT_FIELDS = ['tag', 'removed_at'] as const;
export const FILE_FIELDS = ['caption', 'block_id', 'item_key', 'removed_at'] as const;
export const FILE_SERVER_FIELDS = ['uploaded_at', 'variants', 'reading_status'] as const;
export const GENERATION_JOB_FIELDS = ['status', 'error', 'result_file_id', 'result'] as const;

/**
 * Keys a `{field}` segment may never name: identity, ownership and derived values are set
 * at create. `template.version` is not among them (D-4, 2026-09-23): the reducer bumps it
 * on every content edit and a `template/{id}/version` put sets it explicitly.
 */
const IMMUTABLE_KEYS = new Set(['id', 'kind', 'company_id', 'relatorio_id', 'project_id', 'origin', 'seed_version']);

function mutableKeys(keys: readonly string[], alsoImmutable: readonly string[] = []): readonly string[] {
  return keys.filter((k) => !IMMUTABLE_KEYS.has(k) && !alsoImmutable.includes(k));
}

const PROJECT_FIELDS = mutableKeys(entityKeys('project'));
const POINT_FIELDS = mutableKeys(entityKeys('point'));
const TEMPLATE_FIELDS = mutableKeys(entityKeys('template'));
// `user.email` is identity-owned: better-auth writes it, never an op (AD-9). It is
// immutable for the `user` entity alone -- the Empresa registry's own `email` is a
// contact field a device edits like any other (Story 2.3).
const USER_FIELDS = mutableKeys(entityKeys('user'), ['email']);

const fieldOf = (keys: readonly string[]) => z.string().refine((f) => keys.includes(f));

export const opPathSchema = z.discriminatedUnion('family', [
  z.object({ family: z.literal('project'), id: uuidV7Schema }),
  z.object({ family: z.literal('project/field'), id: uuidV7Schema, field: fieldOf(PROJECT_FIELDS) }),
  z.object({ family: z.literal('relatorio'), id: uuidV7Schema }),
  z.object({ family: z.literal('relatorio/setup'), field: fieldOf(RELATORIO_SETUP_KEYS) }),
  z.object({ family: z.literal('relatorio/status') }),
  z.object({ family: z.literal('relatorio/export/scheme') }),
  z.object({ family: z.literal('location'), id: uuidV7Schema }),
  z.object({ family: z.literal('location/field'), id: uuidV7Schema, field: z.enum(LOCATION_FIELDS) }),
  z.object({ family: z.literal('location/se'), id: uuidV7Schema, field: fieldOf(LOCATION_SE_KEYS) }),
  z.object({ family: z.literal('location/env'), id: uuidV7Schema, field: fieldOf(LOCATION_ENV_KEYS) }),
  z.object({ family: z.literal('location/agrupar_por_tipo'), id: uuidV7Schema }),
  z.object({ family: z.literal('block'), id: uuidV7Schema }),
  z.object({ family: z.literal('block/field'), id: uuidV7Schema, field: z.enum(BLOCK_FIELDS) }),
  z.object({ family: z.literal('sheet/nameplate'), block_id: uuidV7Schema, field_key: seedKey }),
  z.object({
    family: z.literal('sheet/checklist'),
    block_id: uuidV7Schema,
    item_key: seedKey,
    field: z.enum(CHECKLIST_FIELDS),
  }),
  z.object({
    family: z.literal('sheet/test'),
    block_id: uuidV7Schema,
    test_key: seedKey,
    field: z.enum(TEST_FIELDS),
  }),
  z.object({
    family: z.literal('sheet/test/cell'),
    block_id: uuidV7Schema,
    test_key: seedKey,
    row: cellIndex,
    col: cellIndex,
  }),
  z.object({ family: z.literal('sheet/conclusion'), block_id: uuidV7Schema, field: z.enum(CONCLUSION_FIELDS) }),
  z.object({ family: z.literal('sheet/observations'), block_id: uuidV7Schema }),
  z.object({ family: z.literal('equipment'), id: uuidV7Schema }),
  z.object({ family: z.literal('equipment/field'), id: uuidV7Schema, field: z.enum(EQUIPMENT_FIELDS) }),
  z.object({ family: z.literal('equipment/last_nameplate'), id: uuidV7Schema }),
  z.object({ family: z.literal('file'), id: uuidV7Schema }),
  z.object({ family: z.literal('file/field'), id: uuidV7Schema, field: z.enum(FILE_FIELDS) }),
  z.object({ family: z.literal('file/server'), id: uuidV7Schema, field: z.enum(FILE_SERVER_FIELDS) }),
  z.object({ family: z.literal('point'), id: uuidV7Schema }),
  z.object({ family: z.literal('point/field'), id: uuidV7Schema, field: fieldOf(POINT_FIELDS) }),
  z.object({ family: z.literal('suggestion'), id: uuidV7Schema }),
  z.object({ family: z.literal('suggestion/status'), id: uuidV7Schema }),
  z.object({ family: z.literal('registry'), kind: registryKindSchema, id: uuidV7Schema }),
  z
    .object({ family: z.literal('registry/field'), kind: registryKindSchema, id: uuidV7Schema, field: z.string() })
    // The field set depends on the kind, so a hand-built path is checked here, not only in matchFamily.
    .refine((p) => mutableKeys(registryKeys(p.kind)).includes(p.field), {
      path: ['field'],
      message: 'unknown field for this registry kind',
    }),
  z.object({ family: z.literal('template'), id: uuidV7Schema }),
  z.object({ family: z.literal('template/field'), id: uuidV7Schema, field: fieldOf(TEMPLATE_FIELDS) }),
  z.object({ family: z.literal('user/field'), id: uuidV7Schema, field: fieldOf(USER_FIELDS) }),
  z.object({ family: z.literal('generation_job'), id: uuidV7Schema }),
  // Appended (the family list is append-only): the provisioning projection of an identity user.
  z.object({ family: z.literal('user'), id: uuidV7Schema }),
  z.object({ family: z.literal('generation_job/field'), id: uuidV7Schema, field: z.enum(GENERATION_JOB_FIELDS) }),
  z.object({ family: z.literal('revision'), id: uuidV7Schema }),
  z.object({ family: z.literal('relatorio/preview_file_id') }),
  // E12-Q4: the server's move of an unedited seeded template to the current seed version.
  z.object({ family: z.literal('template/seed_version'), id: uuidV7Schema, field: z.literal('seed_version') }),
]);

export type OpPath = z.infer<typeof opPathSchema>;
export type PathFamily = OpPath['family'];

// --- family table: one description drives parse, format, target and kind rules ---

type Segment =
  | { lit: string }
  | { id: string }
  | { enum: readonly string[]; as: string }
  | { key: string }
  | { int: string }
  | { field: readonly string[] | ((p: Record<string, unknown>) => readonly string[]) }
  | { registryKind: true };

interface FamilyDef {
  family: PathFamily;
  entity: Entity;
  /** The target row id is the op's `relatorio_id`, not a path segment. */
  implicitRelatorio?: boolean;
  create?: boolean;
  serverOnly?: boolean;
  segments: readonly Segment[];
}

const id = (as = 'id'): Segment => ({ id: as });
const lit = (s: string): Segment => ({ lit: s });
const en = (values: readonly string[], as = 'field'): Segment => ({ enum: values, as });
const key = (as: string): Segment => ({ key: as });
const int = (as: string): Segment => ({ int: as });
const field = (keys: readonly string[]): Segment => ({ field: keys });

const REGISTRY_FIELD: Segment = {
  field: (p) => mutableKeys(registryKeys(p.kind as RegistryKind)),
};

export const FAMILIES: readonly FamilyDef[] = [
  { family: 'project', entity: 'project', create: true, segments: [lit('project'), id()] },
  { family: 'project/field', entity: 'project', segments: [lit('project'), id(), field(PROJECT_FIELDS)] },
  { family: 'relatorio', entity: 'relatorio', create: true, segments: [lit('relatorio'), id()] },
  {
    family: 'relatorio/setup',
    entity: 'relatorio',
    implicitRelatorio: true,
    segments: [lit('relatorio'), lit('setup'), field(RELATORIO_SETUP_KEYS)],
  },
  { family: 'relatorio/status', entity: 'relatorio', implicitRelatorio: true, segments: [lit('relatorio'), lit('status')] },
  {
    family: 'relatorio/export/scheme',
    entity: 'relatorio',
    implicitRelatorio: true,
    segments: [lit('relatorio'), lit('export'), lit('scheme')],
  },
  { family: 'location', entity: 'location', create: true, segments: [lit('location'), id()] },
  { family: 'location/field', entity: 'location', segments: [lit('location'), id(), en(LOCATION_FIELDS)] },
  { family: 'location/se', entity: 'location', segments: [lit('location'), id(), lit('se'), field(LOCATION_SE_KEYS)] },
  { family: 'location/env', entity: 'location', segments: [lit('location'), id(), lit('env'), field(LOCATION_ENV_KEYS)] },
  {
    family: 'location/agrupar_por_tipo',
    entity: 'location',
    segments: [lit('location'), id(), lit('agrupar_por_tipo')],
  },
  { family: 'block', entity: 'block', create: true, segments: [lit('block'), id()] },
  { family: 'block/field', entity: 'block', segments: [lit('block'), id(), en(BLOCK_FIELDS)] },
  {
    family: 'sheet/nameplate',
    entity: 'block',
    segments: [lit('sheet'), id('block_id'), lit('nameplate'), key('field_key')],
  },
  {
    family: 'sheet/checklist',
    entity: 'block',
    segments: [lit('sheet'), id('block_id'), lit('checklist'), key('item_key'), en(CHECKLIST_FIELDS)],
  },
  {
    family: 'sheet/test',
    entity: 'block',
    segments: [lit('sheet'), id('block_id'), lit('test'), key('test_key'), en(TEST_FIELDS)],
  },
  {
    family: 'sheet/test/cell',
    entity: 'block',
    segments: [lit('sheet'), id('block_id'), lit('test'), key('test_key'), lit('cell'), int('row'), int('col')],
  },
  {
    family: 'sheet/conclusion',
    entity: 'block',
    segments: [lit('sheet'), id('block_id'), lit('conclusion'), en(CONCLUSION_FIELDS)],
  },
  { family: 'sheet/observations', entity: 'block', segments: [lit('sheet'), id('block_id'), lit('observations')] },
  { family: 'equipment', entity: 'equipment', create: true, segments: [lit('equipment'), id()] },
  { family: 'equipment/field', entity: 'equipment', segments: [lit('equipment'), id(), en(EQUIPMENT_FIELDS)] },
  {
    family: 'equipment/last_nameplate',
    entity: 'equipment',
    serverOnly: true,
    segments: [lit('equipment'), id(), lit('last_nameplate')],
  },
  { family: 'file', entity: 'file', create: true, segments: [lit('file'), id()] },
  { family: 'file/field', entity: 'file', segments: [lit('file'), id(), en(FILE_FIELDS)] },
  { family: 'file/server', entity: 'file', serverOnly: true, segments: [lit('file'), id(), en(FILE_SERVER_FIELDS)] },
  { family: 'point', entity: 'point', create: true, segments: [lit('point'), id()] },
  { family: 'point/field', entity: 'point', segments: [lit('point'), id(), field(POINT_FIELDS)] },
  { family: 'suggestion', entity: 'suggestion', create: true, serverOnly: true, segments: [lit('suggestion'), id()] },
  { family: 'suggestion/status', entity: 'suggestion', segments: [lit('suggestion'), id(), lit('status')] },
  { family: 'registry', entity: 'registry', create: true, segments: [lit('registry'), { registryKind: true }, id()] },
  {
    family: 'registry/field',
    entity: 'registry',
    segments: [lit('registry'), { registryKind: true }, id(), REGISTRY_FIELD],
  },
  { family: 'template', entity: 'template', create: true, segments: [lit('template'), id()] },
  { family: 'template/field', entity: 'template', segments: [lit('template'), id(), field(TEMPLATE_FIELDS)] },
  { family: 'user/field', entity: 'user', segments: [lit('user'), id(), field(USER_FIELDS)] },
  {
    family: 'generation_job',
    entity: 'generation_job',
    create: true,
    serverOnly: true,
    segments: [lit('generation_job'), id()],
  },
  {
    family: 'generation_job/field',
    entity: 'generation_job',
    serverOnly: true,
    segments: [lit('generation_job'), id(), en(GENERATION_JOB_FIELDS)],
  },
  { family: 'revision', entity: 'revision', create: true, serverOnly: true, segments: [lit('revision'), id()] },
  {
    family: 'relatorio/preview_file_id',
    entity: 'relatorio',
    implicitRelatorio: true,
    serverOnly: true,
    segments: [lit('relatorio'), lit('preview_file_id')],
  },
  // Users are provisioned, never created by a device (AD-9): the seed projects each
  // identity user into the company stream as this `system:identity` create.
  { family: 'user', entity: 'user', create: true, serverOnly: true, segments: [lit('user'), id()] },
  // E12-Q4: a template's `seed_version` is set at create and never by a device; the seed
  // moves the unedited "Cabine primária — padrão" template to the current version with
  // this `system:identity` put (a relatório keeps the version it was made with, AR-20).
  { family: 'template/seed_version', entity: 'template', serverOnly: true, segments: [lit('template'), id(), en(['seed_version'])] },
];

const BY_FAMILY: ReadonlyMap<PathFamily, FamilyDef> = new Map(FAMILIES.map((f) => [f.family, f]));

export function familyDef(family: PathFamily): FamilyDef {
  const def = BY_FAMILY.get(family);
  if (!def) throw new Error(`unknown path family "${family}"`);
  return def;
}

export class PathError extends Error {
  readonly path: string;
  constructor(path: string, detail: string) {
    super(`invalid op path "${path}": ${detail}`);
    this.name = 'PathError';
    this.path = path;
  }
}

/** Result of matching one family: the object, or the index and reason of the first failing segment. */
type Match = { ok: true; value: Record<string, unknown> } | { ok: false; at: number; reason: string };

function matchFamily(def: FamilyDef, segments: readonly string[]): Match {
  if (segments.length !== def.segments.length) {
    return { ok: false, at: -1, reason: `expected ${def.segments.length} segments` };
  }
  const value: Record<string, unknown> = { family: def.family };
  for (let i = 0; i < def.segments.length; i++) {
    const seg = def.segments[i]!;
    const text = segments[i]!;
    if ('lit' in seg) {
      if (text !== seg.lit) return { ok: false, at: i, reason: `expected "${seg.lit}"` };
    } else if ('id' in seg) {
      if (!uuidV7Schema.safeParse(text).success) return { ok: false, at: i, reason: `"${text}" is not a uuidv7` };
      value[seg.id] = text;
    } else if ('enum' in seg) {
      if (!seg.enum.includes(text)) {
        return { ok: false, at: i, reason: `unknown field "${text}" for ${def.entity} (${def.family})` };
      }
      value[seg.as] = text;
    } else if ('key' in seg) {
      if (!seedKey.safeParse(text).success) return { ok: false, at: i, reason: `"${text}" is not a seed key` };
      value[seg.key] = text;
    } else if ('int' in seg) {
      if (!/^(0|[1-9][0-9]*)$/.test(text)) return { ok: false, at: i, reason: `"${text}" is not an index` };
      value[seg.int] = Number(text);
    } else if ('registryKind' in seg) {
      if (!registryKindSchema.safeParse(text).success) {
        return { ok: false, at: i, reason: `unknown registry kind "${text}"` };
      }
      value.kind = text;
    } else {
      const keys = typeof seg.field === 'function' ? seg.field(value) : seg.field;
      if (!keys.includes(text)) {
        const owner = def.entity === 'registry' ? `registry ${String(value.kind)}` : def.entity;
        return { ok: false, at: i, reason: `unknown field "${text}" for ${owner}` };
      }
      value.field = text;
    }
  }
  return { ok: true, value };
}

/** Parses a path string into its family and typed segments; throws PathError otherwise. */
export function parsePath(path: string): OpPath {
  const segments = path.split('/');
  const head = segments[0] ?? '';
  const candidates = FAMILIES.filter((f) => 'lit' in f.segments[0]! && f.segments[0].lit === head);
  if (candidates.length === 0) throw new PathError(path, `unknown family "${head}"`);
  let best: { at: number; reason: string } = { at: -2, reason: '' };
  for (const def of candidates) {
    const match = matchFamily(def, segments);
    if (match.ok) {
      const parsed = opPathSchema.safeParse(match.value);
      if (parsed.success) return parsed.data;
      throw new PathError(path, parsed.error.message);
    }
    if (match.at > best.at) best = match;
  }
  throw new PathError(path, best.at < 0 ? `no ${head} family has ${segments.length} segments` : best.reason);
}

export function safeParsePath(path: string): OpPath | null {
  try {
    return parsePath(path);
  } catch {
    return null;
  }
}

/** The inverse of parsePath: `formatPath(parsePath(p)) === p`. */
export function formatPath(path: OpPath): string {
  const def = familyDef(path.family);
  const p = path as unknown as Record<string, unknown>;
  return def.segments
    .map((seg) => {
      if ('lit' in seg) return seg.lit;
      if ('id' in seg) return String(p[seg.id]);
      if ('enum' in seg) return String(p[seg.as]);
      if ('key' in seg) return String(p[seg.key]);
      if ('int' in seg) return String(p[seg.int]);
      if ('registryKind' in seg) return String(p.kind);
      return String(p.field);
    })
    .join('/');
}

/** Families emitted only by the server (`actor_id = system:*`, `device_id = server`). */
export function isServerOnly(path: OpPath | string): boolean {
  const parsed = typeof path === 'string' ? parsePath(path) : path;
  return familyDef(parsed.family).serverOnly === true;
}

export function isCreateFamily(path: OpPath): boolean {
  return familyDef(path.family).create === true;
}

/** The field a `put`/`remove` writes, when the family names one (`null` for create families). */
export function pathField(path: OpPath): string | null {
  const def = familyDef(path.family);
  if (def.create) return null;
  const p = path as unknown as Record<string, unknown>;
  if (typeof p.field === 'string') return p.field;
  const last = def.segments[def.segments.length - 1]!;
  return 'lit' in last ? last.lit : null;
}

export interface EntityRef {
  entity: Entity;
  /** `null` when the row is the op's own relatorio (`relatorio/setup/*`, `relatorio/status`, ...). */
  id: string | null;
}

/** The row an op path writes; `id` is null for the implicit-relatorio families. */
export function targetOf(path: OpPath): EntityRef {
  const def = familyDef(path.family);
  if (def.implicitRelatorio) return { entity: 'relatorio', id: null };
  const p = path as unknown as Record<string, unknown>;
  const id = typeof p.block_id === 'string' ? p.block_id : String(p.id);
  return { entity: def.entity, id };
}

// --- typed path builders (E5-A5, G-3) -----------------------------------------------------
//
// One builder per family a device writes, each built with `formatPath`, so no caller in
// `apps/web` composes an op path as a string. `formatPath` only joins: the path is still
// checked where every op is (`opSchema` at commit, `applyOp` for the seed-defined keys).
// Families only the server writes (`file/server`, `generation_job/*`, `revision`, ...) get
// no builder on purpose.

export const projectPath = (id: string): string => formatPath({ family: 'project', id });
export const projectFieldPath = (id: string, field: string): string => formatPath({ family: 'project/field', id, field });
export const relatorioPath = (id: string): string => formatPath({ family: 'relatorio', id });
export const relatorioSetupPath = (field: string): string => formatPath({ family: 'relatorio/setup', field });
export const relatorioStatusPath = (): string => formatPath({ family: 'relatorio/status' });
export const relatorioExportSchemePath = (): string => formatPath({ family: 'relatorio/export/scheme' });
export const locationPath = (id: string): string => formatPath({ family: 'location', id });
export const locationFieldPath = (id: string, field: (typeof LOCATION_FIELDS)[number]): string =>
  formatPath({ family: 'location/field', id, field });
export const locationSePath = (id: string, field: string): string => formatPath({ family: 'location/se', id, field });
export const locationEnvPath = (id: string, field: string): string => formatPath({ family: 'location/env', id, field });
export const locationAgruparPath = (id: string): string => formatPath({ family: 'location/agrupar_por_tipo', id });
export const blockPath = (id: string): string => formatPath({ family: 'block', id });
export const blockFieldPath = (id: string, field: (typeof BLOCK_FIELDS)[number]): string => formatPath({ family: 'block/field', id, field });
export const sheetNameplatePath = (blockId: string, fieldKey: string): string =>
  formatPath({ family: 'sheet/nameplate', block_id: blockId, field_key: fieldKey });
export const sheetChecklistPath = (blockId: string, itemKey: string, field: (typeof CHECKLIST_FIELDS)[number]): string =>
  formatPath({ family: 'sheet/checklist', block_id: blockId, item_key: itemKey, field });
export const sheetTestPath = (blockId: string, testKey: string, field: (typeof TEST_FIELDS)[number]): string =>
  formatPath({ family: 'sheet/test', block_id: blockId, test_key: testKey, field });
export const sheetTestCellPath = (blockId: string, testKey: string, row: number, col: number): string =>
  formatPath({ family: 'sheet/test/cell', block_id: blockId, test_key: testKey, row, col });
export const sheetConclusionPath = (blockId: string, field: (typeof CONCLUSION_FIELDS)[number]): string =>
  formatPath({ family: 'sheet/conclusion', block_id: blockId, field });
export const sheetObservationsPath = (blockId: string): string => formatPath({ family: 'sheet/observations', block_id: blockId });
export const equipmentPath = (id: string): string => formatPath({ family: 'equipment', id });
export const equipmentFieldPath = (id: string, field: (typeof EQUIPMENT_FIELDS)[number]): string =>
  formatPath({ family: 'equipment/field', id, field });
export const filePath = (id: string): string => formatPath({ family: 'file', id });
export const fileFieldPath = (id: string, field: (typeof FILE_FIELDS)[number]): string => formatPath({ family: 'file/field', id, field });
export const pointPath = (id: string): string => formatPath({ family: 'point', id });
export const pointFieldPath = (id: string, field: string): string => formatPath({ family: 'point/field', id, field });
export const suggestionStatusPath = (id: string): string => formatPath({ family: 'suggestion/status', id });
export const registryPath = (kind: RegistryKind, id: string): string => formatPath({ family: 'registry', kind, id });
export const registryFieldPath = (kind: RegistryKind, id: string, field: string): string =>
  formatPath({ family: 'registry/field', kind, id, field });
export const templatePath = (id: string): string => formatPath({ family: 'template', id });
export const templateFieldPath = (id: string, field: string): string => formatPath({ family: 'template/field', id, field });
export const userFieldPath = (id: string, field: string): string => formatPath({ family: 'user/field', id, field });
