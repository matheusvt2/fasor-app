import { FUNCAO_MAX_LENGTH } from '../schemas/block-config.ts';
import { NC_PHRASE_MAX_LENGTH, rowIndexColumns, rowRemovedAt, type Entity, type EntityRow } from '../schemas/entities.ts';
import { applyOp, splitEntityKey, type EntityKey, type EntityState } from './apply.ts';
import type { Op } from './op.ts';
import { FAMILIES, familyDef, pathField, safeParsePath, type OpPath, type PathFamily } from './path.ts';

/*
 * Story 20.9 (2026-11-03, contract 29, security pass S4): every op value has a size and a type
 * the server enforces. The caps live here, in a check only new client ops pass (the push route's
 * validation), never in a row schema of `schemas/entities.ts` nor in `applyOp`: rows already
 * stored, and the pulled ops a device replays, keep parsing as they always did (AD-11 amended).
 * Stored values are never rewritten.
 *
 * Caps were chosen from the longest values of the Porto Seguro fixture and FO.SERV-03, with
 * headroom (coordinator's reading): short text 200 characters (names, TAG, serial, place, labels,
 * registry fields), medium 1 000 (a caption, a Não ensaiado note, a checklist observation, a
 * point's action, the next intervention's justification), long 20 000 (`additional_info`,
 * `escopo`, OBSERVAÇÕES, the conclusion text and its basis, a point's text, the parecer, section
 * texts). Numbers are finite; the site altitude, the one number with a range here, lies between
 * -500 and 9 000 m. Ids, enums, booleans, dates and instants are their own schema's (`applyOp`).
 * Every string of a value, whatever its field, is at most long. A length is counted in UTF-16
 * code units, as `maxLength` counts it in the browser.
 */

export const TEXT_CAPS = { short: 200, medium: 1000, long: 20000 } as const;
export type TextCapKind = keyof typeof TEXT_CAPS;

/** The site altitude, in meters (the Dead Sea shore to above any Brazilian site, with headroom). */
export const SITE_ALTITUDE_RANGE_M = { min: -500, max: 9000 } as const;

interface Range {
  readonly min: number;
  readonly max: number;
}

/** The check of one value, or of one field of a value. */
export type ValueRule =
  /** A text field: a string of at most `cap`; anything else is the row schema's to judge. */
  | { readonly kind: 'text'; readonly cap: number }
  /** A free-text cell (OBSERVAÇÕES, an observation, the conclusion text): a string of at most `cap`, or null; nothing else. */
  | { readonly kind: 'text_cell'; readonly cap: number }
  /** A list of short texts (the exclusions): each string at most `cap`. */
  | { readonly kind: 'texts'; readonly cap: number }
  /** A value of any shape whose every string is at most `cap` (a seed-defined cell, any JSON by design, K-10; a registry row). */
  | { readonly kind: 'strings'; readonly cap: number }
  /**
   * Story 22.10 (contract 32): a test cell, any JSON as `strings` (K-10), and a value in the
   * `over_range` state holds a positive plain decimal `raw` and a `unit` that is a short string.
   */
  | { readonly kind: 'test_cell'; readonly cap: number }
  /**
   * e22g (review S4): a seed-defined cell that is no test cell (a nameplate field, a measurement
   * test's value), any JSON as `strings` (K-10), and never a value in the `over_range` state: only
   * a test cell takes a reading above the instrument's limit.
   */
  | { readonly kind: 'plain_cell'; readonly cap: number }
  /** An AD-11 number value: `raw` and `unit` at most short, and `raw`, when set, a number in `range`. */
  | { readonly kind: 'number_value'; readonly range?: Range }
  /** A plain number in `range`, or null. */
  | { readonly kind: 'integer'; readonly range: Range }
  /** An object whose fields have rules of their own. */
  | { readonly kind: 'object'; readonly fields: Readonly<Record<string, ValueRule>> }
  /** A structured value not listed (a block's config, a reading target, a criterion override, template blocks): every string at most long. */
  | { readonly kind: 'structured' }
  /** An id, an enum, a boolean, a date or an instant: its own schema decides (`applyOp`). */
  | { readonly kind: 'schema' };

/** The rule of one path family: the value of a field-less put, the field of a put, the fields of a create's row, or none for a server-only family. */
export type FamilyValueRule =
  | { readonly kind: 'server_only' }
  | { readonly kind: 'value'; readonly rule: ValueRule }
  | { readonly kind: 'fields'; readonly fields: Readonly<Record<string, ValueRule>>; readonly otherwise?: ValueRule }
  | { readonly kind: 'row'; readonly fields: Readonly<Record<string, ValueRule>>; readonly otherwise?: ValueRule };

const text = (cap: number): ValueRule => ({ kind: 'text', cap });
const short = text(TEXT_CAPS.short);
const medium = text(TEXT_CAPS.medium);
const long = text(TEXT_CAPS.long);
const textCell = (cap: number): ValueRule => ({ kind: 'text_cell', cap });
const strings = (cap: number): ValueRule => ({ kind: 'strings', cap });
const shortStrings = strings(TEXT_CAPS.short);
const plainCell: ValueRule = { kind: 'plain_cell', cap: TEXT_CAPS.short };
const numberValue: ValueRule = { kind: 'number_value' };
const structured: ValueRule = { kind: 'structured' };
const schema: ValueRule = { kind: 'schema' };
/** A fractional `order_key` (`ops/order-key.ts`) grows a digit per insertion between two close neighbours: medium, not short. */
const orderKey = medium;

/** The relatório setup, field by field (`relatorioSetupSchema`); the guard test checks it names every key. */
export const SETUP_VALUE_RULES: Readonly<Record<string, ValueRule>> = {
  service_start: schema,
  service_end: schema,
  atividade: short,
  local: short,
  // An id; that it names a user of the company is the apply transaction's check (Story 20.10).
  responsible_user_id: schema,
  cover_photo_file_id: schema,
  escopo: long,
  exclusions: { kind: 'texts', cap: TEXT_CAPS.short },
  additional_info: long,
  art_trt_number: short,
  instrument_ids: schema,
  site_altitude_m: { kind: 'integer', range: SITE_ALTITUDE_RANGE_M },
  site_altitude_na: schema,
  site_altitude_confirmed: schema,
  next_intervention_date: schema,
  next_intervention_justification: medium,
  parecer: { kind: 'object', fields: { verdict: schema, text: long, text_status: schema, text_basis: long } },
};

/** CARACTERÍSTICAS DA SE (`locationSeSchema`). */
const SE_VALUE_RULES: Readonly<Record<string, ValueRule>> = { type: short, primary_kv: numberValue, secondary_kv: numberValue, installed_kva: numberValue };
/** AMBIENTE DE ENSAIO (`locationEnvSchema`): the cabine's altitude shares the site altitude's range. */
const ENV_VALUE_RULES: Readonly<Record<string, ValueRule>> = { altitude_m: { kind: 'number_value', range: SITE_ALTITUDE_RANGE_M }, temperature_c: numberValue, humidity_pct: numberValue };
/** A Não ensaiado mark (`notTestedSchema`): its note is medium text. */
const NOT_TESTED_RULE: ValueRule = { kind: 'object', fields: { text: medium } };

const SERVER_ONLY = { kind: 'server_only' } as const;

/**
 * Every path family of `ops/path.ts`, ruled once. The map is typed over `PathFamily`, so a family
 * added to `opPathSchema` fails `pnpm static` here until someone writes its rule, and
 * `value-limits.test.ts` checks the same against the runtime family table.
 */
const VALUE_RULES = {
  project: { kind: 'row', fields: { name: short, site: short } },
  'project/field': { kind: 'fields', fields: { name: short, site: short }, otherwise: schema },
  relatorio: { kind: 'row', fields: { seed_version: short, setup: { kind: 'object', fields: SETUP_VALUE_RULES } } },
  'relatorio/setup': { kind: 'fields', fields: SETUP_VALUE_RULES },
  'relatorio/status': { kind: 'value', rule: schema },
  'relatorio/export/scheme': { kind: 'value', rule: schema },
  location: {
    kind: 'row',
    fields: {
      name: short,
      order_key: orderKey,
      se: { kind: 'object', fields: SE_VALUE_RULES },
      env: { kind: 'object', fields: ENV_VALUE_RULES },
      funcao: text(FUNCAO_MAX_LENGTH),
    },
  },
  'location/field': { kind: 'fields', fields: { name: short, order_key: orderKey }, otherwise: schema },
  'location/se': { kind: 'fields', fields: SE_VALUE_RULES },
  'location/env': { kind: 'fields', fields: ENV_VALUE_RULES },
  'location/agrupar_por_tipo': { kind: 'value', rule: schema },
  'location/funcao': { kind: 'value', rule: text(FUNCAO_MAX_LENGTH) },
  'location/checklist': { kind: 'fields', fields: { result: shortStrings, observation: textCell(TEXT_CAPS.medium) } },
  block: { kind: 'row', fields: { block_type: short, seed_version: short, order_key: orderKey, not_tested: NOT_TESTED_RULE } },
  'block/field': { kind: 'fields', fields: { order_key: orderKey, not_tested: NOT_TESTED_RULE, config: structured }, otherwise: schema },
  'sheet/nameplate': { kind: 'value', rule: plainCell },
  'sheet/checklist': { kind: 'fields', fields: { result: shortStrings, observation: textCell(TEXT_CAPS.medium) } },
  // Story 23.9 (contract 35): the applicability override is `'applied'` or null, which the fold checks (`assertApplicability`).
  'sheet/test': { kind: 'fields', fields: { instrument: structured, criterion_override: structured, applicability: schema } },
  'sheet/test/cell': { kind: 'value', rule: { kind: 'test_cell', cap: TEXT_CAPS.short } },
  'sheet/conclusion': {
    kind: 'fields',
    fields: { result: shortStrings, restriction: shortStrings, text: textCell(TEXT_CAPS.long), text_status: shortStrings, text_basis: textCell(TEXT_CAPS.long) },
  },
  'sheet/observations': { kind: 'value', rule: textCell(TEXT_CAPS.long) },
  // Fix batch e24x (B3): Story 24.21's write-once `reuse_key` (no put path writes it) is a medium text in the create.
  equipment: { kind: 'row', fields: { tag: short, type: short, reuse_key: medium } },
  'equipment/field': { kind: 'fields', fields: { tag: short }, otherwise: schema },
  'equipment/last_nameplate': SERVER_ONLY,
  'equipment/last_results': SERVER_ONLY,
  file: { kind: 'row', fields: { sha256: short, mime: short, caption: medium, item_key: short, order_key: orderKey } },
  'file/field': { kind: 'fields', fields: { caption: medium, item_key: short, reading_target: structured, order_key: orderKey }, otherwise: schema },
  'file/server': SERVER_ONLY,
  point: { kind: 'row', fields: { text: long, order_key: orderKey, action: medium, owner: short, item_key: short, test_key: short } },
  'point/field': { kind: 'fields', fields: { text: long, order_key: orderKey, action: medium, owner: short }, otherwise: schema },
  suggestion: SERVER_ONLY,
  'suggestion/status': { kind: 'value', rule: schema },
  // Every registry kind's own fields are short texts (names, CNPJ, addresses, codes, a learned NC phrase).
  registry: { kind: 'row', fields: {}, otherwise: strings(Math.min(TEXT_CAPS.short, NC_PHRASE_MAX_LENGTH)) },
  'registry/field': { kind: 'fields', fields: {}, otherwise: strings(Math.min(TEXT_CAPS.short, NC_PHRASE_MAX_LENGTH)) },
  template: { kind: 'row', fields: { name: short, seed_version: short } },
  'template/field': { kind: 'fields', fields: { name: short }, otherwise: structured },
  'template/seed_version': SERVER_ONLY,
  'user/field': { kind: 'fields', fields: { registration_number: short, title: short }, otherwise: schema },
  generation_job: SERVER_ONLY,
  user: SERVER_ONLY,
  'generation_job/field': SERVER_ONLY,
  revision: SERVER_ONLY,
  'relatorio/preview_file_id': SERVER_ONLY,
  audit_run: SERVER_ONLY,
  'audit_run/field': SERVER_ONLY,
  // Batch e24s (Story 24.14, contract 47): a measurement test's `text` value (the oil sampling's "Descreva o motivo") is typed
  // or dictated as a checklist observation is, so the family takes medium; every other value keeps short (`applyOp`'s seed check).
  'sheet/test/value': { kind: 'value', rule: { kind: 'plain_cell', cap: TEXT_CAPS.medium } },
  'relatorio/removed_at': { kind: 'value', rule: schema },
  // Story 14.6 (contract 33): a type's draft and a version's definition are structured values
  // (every string at most long, the whole bounded by `VALUE_MAX_BYTES`); the rest is the row schema's.
  equipment_type: { kind: 'row', fields: { draft: structured }, otherwise: schema },
  'equipment_type/field': { kind: 'fields', fields: { draft: structured }, otherwise: schema },
  equipment_type_version: { kind: 'row', fields: { definition: structured }, otherwise: schema },
} as const satisfies Record<PathFamily, FamilyValueRule>;

/** The rule of every path family (read by the guard test). */
export const FAMILY_VALUE_RULES: Readonly<Record<PathFamily, FamilyValueRule>> = VALUE_RULES;

/** The first string longer than `cap` anywhere in `value`, or the first number that is not finite; null when none. */
function stringsIssue(value: unknown, cap: number, where: string): string | null {
  if (typeof value === 'string') return value.length > cap ? `${where} holds ${value.length} characters, over ${cap}` : null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${where} is not a finite number`;
  if (value === null || typeof value !== 'object') return null;
  const entries = Array.isArray(value) ? value.map((item, i) => [String(i), item] as const) : Object.entries(value as Record<string, unknown>);
  for (const [key, item] of entries) {
    const issue = stringsIssue(item, cap, `${where}.${key}`);
    if (issue !== null) return issue;
  }
  return null;
}

function inRange(value: number, range: Range): boolean {
  return value >= range.min && value <= range.max;
}

/** A dot-decimal `raw` (AD-11), signed: what a number value's range judges. */
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

function ruleIssue(rule: ValueRule, value: unknown, where: string): string | null {
  switch (rule.kind) {
    case 'text':
      return typeof value === 'string' && value.length > rule.cap ? `${where} holds ${value.length} characters, over ${rule.cap}` : null;
    case 'text_cell':
      if (value === null) return null;
      if (typeof value !== 'string') return `${where} is not a text`;
      return value.length > rule.cap ? `${where} holds ${value.length} characters, over ${rule.cap}` : null;
    case 'texts':
      return Array.isArray(value) ? stringsIssue(value, rule.cap, where) : null;
    case 'strings':
      return stringsIssue(value, rule.cap, where);
    case 'plain_cell': {
      const issue = stringsIssue(value, rule.cap, where);
      if (issue !== null || value === null || typeof value !== 'object' || Array.isArray(value)) return issue;
      return (value as { state?: unknown }).state === 'over_range' ? `${where}.state over_range is a test cell's alone` : null;
    }
    case 'test_cell': {
      const issue = stringsIssue(value, rule.cap, where);
      if (issue !== null || value === null || typeof value !== 'object' || Array.isArray(value)) return issue;
      const { raw, unit, state } = value as { raw?: unknown; unit?: unknown; state?: unknown };
      if (state !== 'over_range') return null;
      // Story 22.10: the limit the instrument passed, a positive plain decimal ("2", "2000"), never "0", "-1" or "2,5".
      if (typeof raw !== 'string' || !/^\d+(\.\d+)?$/.test(raw) || !(Number(raw) > 0)) return `${where}.raw ${JSON.stringify(raw)} is no positive decimal limit`;
      if (typeof unit !== 'string' || unit === '' || unit.length > TEXT_CAPS.short) return `${where}.unit of an over_range value is no short text`;
      return null;
    }
    case 'number_value': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
      const { raw, unit, state } = value as { raw?: unknown; unit?: unknown; state?: unknown };
      // Story 22.10 (review fix): only a test cell takes a reading above the instrument's limit.
      if (state === 'over_range') return `${where}.state over_range is a test cell's alone`;
      const cap = TEXT_CAPS.short;
      if (typeof raw === 'string' && raw.length > cap) return `${where}.raw holds ${raw.length} characters, over ${cap}`;
      if (typeof unit === 'string' && unit.length > cap) return `${where}.unit holds ${unit.length} characters, over ${cap}`;
      // The range judges a raw that is a plain decimal number only: FO.SERV-03 also writes a bound
      // ("<1000" m, the Porto Seguro relatório's AMBIENTE DE ENSAIO), which the kind keeps as typed.
      if (rule.range === undefined || typeof raw !== 'string' || !PLAIN_DECIMAL.test(raw.trim())) return null;
      const parsed = Number(raw.trim());
      return Number.isFinite(parsed) && inRange(parsed, rule.range) ? null : `${where}.raw ${raw} is outside ${rule.range.min} to ${rule.range.max}`;
    }
    case 'integer':
      if (typeof value !== 'number') return null;
      return Number.isFinite(value) && inRange(value, rule.range) ? null : `${where} ${value} is outside ${rule.range.min} to ${rule.range.max}`;
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
      for (const [key, child] of Object.entries(rule.fields)) {
        const issue = ruleIssue(child, (value as Record<string, unknown>)[key], `${where}.${key}`);
        if (issue !== null) return issue;
      }
      return null;
    }
    case 'structured':
    case 'schema':
      return null;
  }
}

/** The field a put of a field family writes (`relatorio/setup/{field}`, `sheet/{b}/checklist/{item}/{field}`, ...), or null. */
function putField(path: OpPath): string | null {
  const field = (path as { field?: unknown }).field;
  return typeof field === 'string' ? field : null;
}

/*
 * e20f (2026-11-04, integrated review of 76cbdb79): the text caps bound each string, not a whole
 * value, so an open-shaped value (one a `strings` or `structured` rule judges: a seed-defined
 * cell, a block config, template blocks, a registry row's fields) could still hold thousands of
 * strings and weigh megabytes. Such a value is also bounded whole, by its serialized size, and
 * every array anywhere in a client value by its length. A value whose fields all have text caps
 * of their own is never byte-capped: its caps already bound it. The numbers, and the measured
 * maxima they were set from (the three fixture logs and the shipped seed template, with at least
 * 4x margin, `value-limits.test.ts`), are in `spec-e20f-wave-fixes.md` (Design Notes).
 */

/** The most a value judged by a `strings` or `structured` rule may weigh, serialized as the push body carries it (128 KiB; the largest measured, the seed template's blocks, is 23 840 B). */
export const VALUE_MAX_BYTES = 128 * 1024;

/** The most items any array in a client op's value may hold (the longest measured, the seed template's 76 blocks). */
export const VALUE_MAX_ITEMS = 500;

/**
 * e20f (QA N1): the deepest nesting of objects and arrays a client value (or an op's `meta`) may
 * hold. The deepest real value is far shallower (measured in `value-limits.test.ts`); a value
 * nested 20 000 levels deep overflowed the stack of the recursive walks and answered 500.
 */
export const VALUE_MAX_DEPTH = 32;

/**
 * How deep `value` nests (a scalar is 0, an empty object or array 1), walked iteratively so no
 * input can overflow the stack; stops counting at `limit + 1`, so a hostile value costs at most
 * that many levels of work per branch.
 */
export function valueDepth(value: unknown, limit = VALUE_MAX_DEPTH): number {
  let deepest = 0;
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (node === null || typeof node !== 'object') continue;
    const here = depth + 1;
    if (here > deepest) deepest = here;
    if (here > limit) return here;
    for (const child of Array.isArray(node) ? node : Object.values(node as Record<string, unknown>)) {
      if (child !== null && typeof child === 'object') stack.push({ node: child, depth: here });
    }
  }
  return deepest;
}

/**
 * e20f (QA N1): the issue of a raw client op whose `value` or `meta` nests deeper than
 * `VALUE_MAX_DEPTH`, or null. The push route asks it before any schema parse or recursive walk
 * reads the op, and refuses such an op alone (`op_value_invalid`).
 */
export function opDepthIssue(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  for (const key of ['value', 'meta'] as const) {
    const depth = valueDepth((raw as Record<string, unknown>)[key]);
    if (depth > VALUE_MAX_DEPTH) return `${key} nests more than ${VALUE_MAX_DEPTH} levels deep`;
  }
  return null;
}

/** The UTF-8 length of a value as the push body serializes it (`JSON.stringify`); the one definition (the web's push budget reads it too). */
export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? '').length;
}

/*
 * e20f (2026-11-04, second QA pass on 76cbdb79, reproduced live): every op within its caps, two
 * pushes of 90 points of 20 000 characters each applied, and the next preview failed
 * `libreoffice_timeout` after 124 s. A per-value cap cannot bound that, so a relatório has a
 * budget of stored bytes: the serialized live rows of the relatório (what `entities.row` holds).
 * The Porto Seguro relatório, the largest real one, is 207 live rows and 643 247 bytes, so the
 * budget is 6.5x it (a kernel test asserts it stays under a quarter). ~~1.5 MiB, the orchestrator's
 * pick~~ 4 MiB, decided by Matheus on 2026-11-04 ("acho pouco"): a relatório of point text near 2 MiB
 * or more can outlast the 150 s job wait and the 120 s LibreOffice limit (2 MiB previewed in
 * 147.9 s, 1.5 MiB in 99.7 s), an accepted risk; the budget keeps the push volume bounded, the
 * per-value caps keep every single value bounded.
 */

/** The most bytes the live rows of one relatório may hold (4 MiB). */
export const RELATORIO_MAX_BYTES = 4 * 1024 * 1024;

/**
 * E20-A1 (R-1d): the entity kinds only the server creates (their create family is `serverOnly`:
 * suggestions, generation jobs, revisions, audit runs, users). Their rows are never counted in a
 * relatório's budget, so previews, audits and readings never spend the user's room.
 */
export const RELATORIO_BUDGET_SERVER_ENTITIES: readonly Entity[] = [
  ...new Set(FAMILIES.filter((family) => family.create === true && family.serverOnly === true).map((family) => family.entity)),
];

const serverEntities: ReadonlySet<string> = new Set(RELATORIO_BUDGET_SERVER_ENTITIES);

/**
 * E20-A1 (R-1c): the bytes one stored row counts toward relatório `relatorioId`'s budget: its
 * serialized bytes (`serializedBytes`, the push body's own serializer) when it is a live row of a
 * client entity kind filed under that relatório, else 0. The server sums this over the rows it
 * stores (`apps/api/src/sync/rules.ts`), so both sides of the budget are measured alike.
 */
export function relatorioBudgetRowBytes(entity: Entity, row: EntityRow, relatorioId: string): number {
  if (serverEntities.has(entity) || rowRemovedAt(row) !== null) return 0;
  if (rowIndexColumns(entity, row).relatorio_id !== relatorioId) return 0;
  return serializedBytes(row);
}

/**
 * E20-A1 (R-1a, R-1b): how many bytes a client op adds to the live rows of its relatório, given
 * the rows it targets (`state`, tombstoned ones included, as the server loads them): the kernel's
 * own reducer applies it, and the growth is the counted bytes of every row it changes after minus
 * before (`relatorioBudgetRowBytes`). So a put is judged by the value it replaces (a shorter text
 * is negative), a restore (`.../removed_at` put to null) by the whole row it revives, a removal by
 * the row it tombstones (negative), and a create by the row it stores. 0 for an op that names no
 * relatório, and for one the reducer refuses (the apply refuses it next, with its own code).
 */
export function relatorioBudgetGrowth(state: EntityState, op: Op): number {
  const relatorioId = op.relatorio_id;
  if (relatorioId == null) return 0;
  let next: EntityState;
  try {
    next = applyOp(state, op);
  } catch {
    return 0;
  }
  let growth = 0;
  for (const [key, row] of next) {
    const before = state.get(key);
    if (row === before) continue;
    const { entity } = splitEntityKey(key as EntityKey);
    growth += relatorioBudgetRowBytes(entity, row, relatorioId) - (before === undefined ? 0 : relatorioBudgetRowBytes(entity, before, relatorioId));
  }
  return growth;
}

/** A path that writes a row's tombstone (`relatorio/removed_at`, `{entity}/{id}/removed_at`). */
function isTombstonePath(path: string): boolean {
  const parsed = safeParsePath(path);
  return parsed !== null && (parsed.family === 'relatorio/removed_at' || pathField(parsed) === 'removed_at');
}

/**
 * Whether a client op may grow a relatório that holds `storedBytes` (its live rows of client
 * kinds, `relatorioBudgetRowBytes` summed) by `growth` bytes (`relatorioBudgetGrowth`). E20-A1:
 * refused only when the op names a relatório, grows it, and `storedBytes + growth` passes
 * `RELATORIO_MAX_BYTES`; an op that adds nothing or shrinks it always applies, so a full
 * relatório can still be edited down. A remove, and a put of null on any path but a tombstone,
 * always apply; a restore (a tombstone put to null) is judged like any growth: a relatório with
 * no room for the row refuses it, and the user removes something else first.
 */
export function relatorioBudgetVerdict(op: Pick<Op, 'kind' | 'value' | 'relatorio_id' | 'path'>, storedBytes: number, growth: number): 'allowed' | 'refused' {
  if (op.relatorio_id == null || op.kind === 'remove') return 'allowed';
  if (op.value === null && !isTombstonePath(op.path)) return 'allowed';
  if (growth <= 0) return 'allowed';
  return storedBytes + growth > RELATORIO_MAX_BYTES ? 'refused' : 'allowed';
}

/** A part of an op's value an open rule (`strings`, `structured`) judges, with where it sits, for the log. */
export interface OpenValuePart {
  readonly where: string;
  readonly value: unknown;
}

const isOpen = (rule: ValueRule): boolean => rule.kind === 'strings' || rule.kind === 'plain_cell' || rule.kind === 'test_cell' || rule.kind === 'structured';

/**
 * The parts of a client op's value an open rule judges: the whole value of a field-less put or of
 * a field put whose rule is open, each field of a create's row whose rule is open (an unlisted
 * field falls to `structured`). Empty for a remove, a server-only family, and a value whose rules
 * are all text caps or schemas.
 */
export function openValueParts(op: Op, path: OpPath): readonly OpenValuePart[] {
  if (op.kind === 'remove') return [];
  const rule: FamilyValueRule = VALUE_RULES[path.family];
  switch (rule.kind) {
    case 'server_only':
      return [];
    case 'value':
      return isOpen(rule.rule) ? [{ where: 'value', value: op.value }] : [];
    case 'fields': {
      const field = putField(path);
      const fieldRule = (field === null ? undefined : rule.fields[field]) ?? rule.otherwise ?? structured;
      return isOpen(fieldRule) ? [{ where: `value (${field ?? path.family})`, value: op.value }] : [];
    }
    case 'row': {
      const row = op.value;
      if (row === null || typeof row !== 'object' || Array.isArray(row)) return [];
      return Object.entries(row as Record<string, unknown>)
        .filter(([key]) => isOpen(rule.fields[key] ?? rule.otherwise ?? structured))
        .map(([key, item]) => ({ where: `value.${key}`, value: item }));
    }
  }
}

/** The length of the longest array anywhere in `value`, with where it sits; null when it holds none. */
export function longestArrayOf(value: unknown, where = 'value'): { where: string; length: number } | null {
  if (value === null || typeof value !== 'object') return null;
  let best: { where: string; length: number } | null = Array.isArray(value) ? { where, length: value.length } : null;
  const entries = Array.isArray(value) ? value.map((item, i) => [String(i), item] as const) : Object.entries(value as Record<string, unknown>);
  for (const [key, item] of entries) {
    const inner = longestArrayOf(item, `${where}.${key}`);
    if (inner !== null && (best === null || inner.length > best.length)) best = inner;
  }
  return best;
}

/** e20f: an array longer than `VALUE_MAX_ITEMS`, or an open part heavier than `VALUE_MAX_BYTES`; null when the value is bounded. */
function wholeValueIssue(op: Op, path: OpPath): string | null {
  const longest = longestArrayOf(op.value);
  if (longest !== null && longest.length > VALUE_MAX_ITEMS) return `${longest.where} holds ${longest.length} items, over ${VALUE_MAX_ITEMS}`;
  for (const part of openValueParts(op, path)) {
    const bytes = serializedBytes(part.value);
    if (bytes > VALUE_MAX_BYTES) return `${part.where} weighs ${bytes} bytes, over ${VALUE_MAX_BYTES}`;
  }
  return null;
}

/**
 * Story 20.9: the issue of a client op's value (for the log), or null when it fits. Every string
 * of the value is at most long and every number finite; e20f: every array at most
 * `VALUE_MAX_ITEMS` long and every open-shaped part at most `VALUE_MAX_BYTES`; then the family's
 * rule: the field's cap, a free-text cell that is text or null, a number value's length and the
 * altitude's range. A `remove` writes no value. A server-only family has no rule: the push route
 * refuses it before.
 */
export function opValueIssue(op: Op, path: OpPath): string | null {
  if (op.kind === 'remove') return null;
  // e20f (QA N1): checked first, iteratively, so the recursive walks below never meet a deep value.
  if (valueDepth(op.value) > VALUE_MAX_DEPTH) return `value nests more than ${VALUE_MAX_DEPTH} levels deep`;
  const general = stringsIssue(op.value, TEXT_CAPS.long, 'value');
  if (general !== null) return general;
  const whole = wholeValueIssue(op, path);
  if (whole !== null) return whole;
  const rule: FamilyValueRule = VALUE_RULES[path.family];
  switch (rule.kind) {
    case 'server_only':
      return null;
    case 'value':
      return ruleIssue(rule.rule, op.value, 'value');
    case 'fields': {
      const field = putField(path);
      const fieldRule = (field === null ? undefined : rule.fields[field]) ?? rule.otherwise ?? structured;
      return ruleIssue(fieldRule, op.value, `value (${field ?? path.family})`);
    }
    case 'row': {
      const row = op.value;
      if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
      for (const [key, item] of Object.entries(row as Record<string, unknown>)) {
        const fieldRule = rule.fields[key] ?? rule.otherwise ?? structured;
        const issue = ruleIssue(fieldRule, item, `value.${key}`);
        if (issue !== null) return issue;
      }
      return null;
    }
  }
}

/** The text cap a rule holds a string to, descending `object` rules along `keys`; null for a rule that holds no text. */
function capOfRule(rule: ValueRule | undefined, keys: readonly string[]): number | null {
  if (rule === undefined) return null;
  if (keys.length > 0) return rule.kind === 'object' ? capOfRule(rule.fields[keys[0]!], keys.slice(1)) : null;
  switch (rule.kind) {
    case 'text':
    case 'text_cell':
    case 'texts':
    case 'strings':
    case 'plain_cell':
    case 'test_cell':
      return rule.cap;
    case 'structured':
      return TEXT_CAPS.long;
    default:
      return null;
  }
}

/** The cap of a family's value (a field-less put) or of one of its fields, dotted for a nested one. */
function capOfFamily(family: PathFamily, field: string | null): number | null {
  const rule: FamilyValueRule | undefined = (VALUE_RULES as Readonly<Record<string, FamilyValueRule>>)[family];
  if (rule === undefined || rule.kind === 'server_only') return null;
  if (rule.kind === 'value') return capOfRule(rule.rule, []);
  if (field === null) return null;
  const [head, ...rest] = field.split('.');
  return capOfRule(rule.fields[head!] ?? rule.otherwise ?? structured, rest);
}

/**
 * Story 20.9: the cap a text input takes as `maxLength`, so a user never types into a refusal:
 * by the op path the input writes (`textCapOf('relatorio/setup/additional_info')`), or by a
 * family and a field, dotted for a nested one (`textCapOf('project', 'name')` for the obra name
 * a create carries, `textCapOf('relatorio/setup', 'parecer.text')`). Null for a field that holds
 * no text, or a path that does not parse.
 */
export function textCapOf(path: string): number | null;
export function textCapOf(family: PathFamily, field: string): number | null;
export function textCapOf(pathOrFamily: string, field?: string): number | null {
  if (field !== undefined) return capOfFamily(pathOrFamily as PathFamily, field);
  const parsed = safeParsePath(pathOrFamily);
  if (parsed === null || familyDef(parsed.family).create === true) return null;
  return capOfFamily(parsed.family, putField(parsed));
}
