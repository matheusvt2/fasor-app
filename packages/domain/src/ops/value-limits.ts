import { FUNCAO_MAX_LENGTH } from '../schemas/block-config.ts';
import { NC_PHRASE_MAX_LENGTH } from '../schemas/entities.ts';
import type { Op } from './op.ts';
import { familyDef, safeParsePath, type OpPath, type PathFamily } from './path.ts';

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
  'sheet/nameplate': { kind: 'value', rule: shortStrings },
  'sheet/checklist': { kind: 'fields', fields: { result: shortStrings, observation: textCell(TEXT_CAPS.medium) } },
  'sheet/test': { kind: 'fields', fields: { instrument: structured, criterion_override: structured } },
  'sheet/test/cell': { kind: 'value', rule: shortStrings },
  'sheet/conclusion': {
    kind: 'fields',
    fields: { result: shortStrings, restriction: shortStrings, text: textCell(TEXT_CAPS.long), text_status: shortStrings, text_basis: textCell(TEXT_CAPS.long) },
  },
  'sheet/observations': { kind: 'value', rule: textCell(TEXT_CAPS.long) },
  equipment: { kind: 'row', fields: { tag: short, type: short } },
  'equipment/field': { kind: 'fields', fields: { tag: short }, otherwise: schema },
  'equipment/last_nameplate': SERVER_ONLY,
  file: { kind: 'row', fields: { sha256: short, mime: short, caption: medium, item_key: short } },
  'file/field': { kind: 'fields', fields: { caption: medium, item_key: short, reading_target: structured }, otherwise: schema },
  'file/server': SERVER_ONLY,
  point: { kind: 'row', fields: { text: long, order_key: orderKey, action: medium, owner: short } },
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
  'sheet/test/value': { kind: 'value', rule: shortStrings },
  'relatorio/removed_at': { kind: 'value', rule: schema },
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
    case 'number_value': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
      const { raw, unit } = value as { raw?: unknown; unit?: unknown };
      const cap = TEXT_CAPS.short;
      if (typeof raw === 'string' && raw.length > cap) return `${where}.raw holds ${raw.length} characters, over ${cap}`;
      if (typeof unit === 'string' && unit.length > cap) return `${where}.unit holds ${unit.length} characters, over ${cap}`;
      if (rule.range === undefined || typeof raw !== 'string' || raw.trim() === '') return null;
      const parsed = Number(raw);
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

/**
 * Story 20.9: the issue of a client op's value (for the log), or null when it fits. Every string
 * of the value is at most long and every number finite; then the family's rule: the field's cap,
 * a free-text cell that is text or null, a number value's length and the altitude's range. A
 * `remove` writes no value. A server-only family has no rule: the push route refuses it before.
 */
export function opValueIssue(op: Op, path: OpPath): string | null {
  if (op.kind === 'remove') return null;
  const general = stringsIssue(op.value, TEXT_CAPS.long, 'value');
  if (general !== null) return general;
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
