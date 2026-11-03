import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCREENS, TELEMETRY_SERVER_KEYS, UX_EVENT_NAMES, UX_OUTCOMES, uxEventSchema } from '@app/domain';
import { describe, expect, it } from 'vitest';

/*
 * E18-A2 (batch e18fb, 2026-11-03, review R-V1 and P2 of the Epic 18 retrospective): the ten
 * Logs Insights queries of the usage dashboard (`infra/production/observability.tf`) are
 * bound to the kernel's vocabulary (`packages/domain/src/contract/telemetry.ts`, read through
 * `@app/domain`, never copied here): every event name, kind, outcome and screen a query
 * compares with is in its closed list, every field it reads is an event key, a server key or
 * an alias the query defines, every view but `users` leaves the smoke company out, and the
 * dashboard and the saved queries read the group the api writes to.
 */

const infra = resolve(import.meta.dirname, '../infra/production');
const read = (path: string) => readFileSync(path, 'utf8');
const observability = read(resolve(infra, 'observability.tf'));
const telemetry = read(resolve(infra, 'telemetry.tf'));
const ecs = read(resolve(infra, 'ecs.tf'));
const locals = read(resolve(infra, 'locals.tf'));
const runbook = read(resolve(import.meta.dirname, '../docs/observability.md'));

/** The value of `local.ux_smoke_filter`, the prefix every view but `users` carries. */
function smokeFilterOf(tf: string): string | undefined {
  return /^\s*ux_smoke_filter = "(.*)"$/m.exec(tf)?.[1];
}

/** `key -> query text` of `local.ux_queries`, in file order, with `local.ux_smoke_filter` resolved. */
function parseQueries(tf: string): Map<string, string> {
  const smokeFilter = smokeFilterOf(tf);
  const block = /\n {2}ux_queries = \{\n([\s\S]*?)\n {2}\}\n/.exec(tf)?.[1] ?? '';
  const queries = new Map<string, string>();
  for (const entry of block.matchAll(/^ {4}([a-z_]+) = \{\n([\s\S]*?)^ {4}\}$/gm)) {
    const query = /^ {6}query\s*= "(.*)"$/m.exec(entry[2]!)?.[1];
    if (query !== undefined) queries.set(entry[1]!, smokeFilter === undefined ? query : query.replaceAll('${local.ux_smoke_filter}', smokeFilter));
  }
  return queries;
}

/** The keys of `local.ux_query_order`, in order. */
function parseOrder(tf: string): string[] {
  const list = /\n {2}ux_query_order = \[([^\]]*)\]/.exec(tf)?.[1] ?? '';
  return [...list.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]!);
}

/**
 * The query as Logs Insights receives it, near enough to read its fields: the two label locals
 * become one `replace()` over the field they label, any other interpolation a quoted literal.
 */
function expand(query: string): string {
  return query
    .replaceAll('${local.ux_user_label}', "replace(user_id, 'id', 'label')")
    .replaceAll('${local.ux_company_label}', "replace(company_id, 'id', 'smoke')")
    .replace(/'\$\{[^}]*\}'/g, "'interpolated'")
    .replace(/\$\{[^}]*\}/g, "'interpolated'");
}

/** The literals the query compares with `field`: `=` and `!=`, `in [...]`, `strcontains(field, ...)`. */
function comparedLiterals(query: string, field: string): string[] {
  const text = expand(query);
  const out: string[] = [];
  for (const match of text.matchAll(new RegExp(`\\b${field}\\s*!?=\\s*'([^']*)'`, 'g'))) out.push(match[1]!);
  for (const match of text.matchAll(new RegExp(`\\b${field}\\s+(?:not\\s+)?in\\s*\\[([^\\]]*)\\]`, 'g'))) {
    for (const literal of match[1]!.matchAll(/'([^']*)'/g)) out.push(literal[1]!);
  }
  for (const match of text.matchAll(new RegExp(`strcontains\\(\\s*${field}\\s*,\\s*'([^']*)'\\s*\\)`, 'g'))) out.push(match[1]!);
  return out;
}

const KEYWORDS = new Set(['filter', 'fields', 'stats', 'sort', 'limit', 'by', 'as', 'in', 'not', 'and', 'or', 'like', 'asc', 'desc', 'display', 'parse', 'dedup']);

/** The bare field names the query reads (not a function, a keyword, a literal or an alias it defines). */
function referencedFields(query: string): { fields: string[]; aliases: string[] } {
  const text = expand(query).replace(/'[^']*'/g, "''");
  const aliases = [...text.matchAll(/\bas\s+([A-Za-z_]\w*)/g)].map((match) => match[1]!);
  const fields = new Set<string>();
  for (const match of text.matchAll(/\b[A-Za-z_]\w*\b/g)) {
    const word = match[0];
    const after = text.slice(match.index + word.length);
    if (/^\s*\(/.test(after)) continue;
    if (KEYWORDS.has(word) || aliases.includes(word)) continue;
    fields.add(word);
  }
  return { fields: [...fields], aliases };
}

/** The kernel's closed lists, reached through the schema where the list is not exported on its own. */
const shape = uxEventSchema.shape;
const KINDS: readonly string[] = shape.kind.unwrap().options;
const EVENT_KEYS = new Set<string>([...Object.keys(shape), ...TELEMETRY_SERVER_KEYS]);
const CLOSED: Record<string, readonly string[]> = { name: UX_EVENT_NAMES, kind: KINDS, outcome: UX_OUTCOMES, screen: SCREENS };

/** The one event name the query keeps (`name = '...'`, no list), or undefined. */
function singleName(query: string): string | undefined {
  const text = expand(query);
  if (/\bname\s+(?:not\s+)?in\s*\[/.test(text)) return undefined;
  const names = new Set([...text.matchAll(/\bname\s*=\s*'([^']*)'/g)].map((match) => match[1]!));
  return names.size === 1 ? [...names][0] : undefined;
}

/** Whether the kernel's schema accepts `kind` on an event named `name` (its per-name list, `superRefine`). */
function kindAllowed(name: string, kind: string): boolean {
  const id = '0b000000-0000-4000-8000-00000000000b';
  return uxEventSchema.safeParse({ v: 1, ts: '2026-11-03T00:00:00.000Z', session_id: id, device_id: id, app_version: 'dev', name, screen: 'home', kind }).success;
}

/** Every way a query breaks the binding, one line each naming the query and the offender. */
function bindingViolations(queries: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [key, query] of queries) {
    const name = singleName(query);
    for (const [field, list] of Object.entries(CLOSED)) {
      for (const literal of comparedLiterals(query, field)) {
        if (!list.includes(literal)) out.push(`${key}: ${field} '${literal}' is not in the kernel list`);
        // A query on one name compares `kind` with that name's own kinds, not the union.
        else if (field === 'kind' && name !== undefined && (UX_EVENT_NAMES as readonly string[]).includes(name) && !kindAllowed(name, literal)) {
          out.push(`${key}: kind '${literal}' is not a kind of ${name}`);
        }
      }
    }
    for (const field of referencedFields(query).fields) if (!EVENT_KEYS.has(field)) out.push(`${key}: field ${field} is not an event key, a server key or an alias`);
  }
  return out;
}

const SMOKE_FILTER = "filter company_id != '${var.smoke_company_id}' | ";

describe('the usage dashboard queries are bound to the kernel vocabulary (observability.tf)', () => {
  const queries = parseQueries(observability);
  const order = parseOrder(observability);

  it('reads the ten queries and the dashboard order, each key once both ways', () => {
    expect([...queries.keys()]).toHaveLength(10);
    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort()).toEqual([...queries.keys()].sort());
  });

  it('compares name, kind, outcome and screen only with kernel literals, and reads only event keys, server keys or its own aliases', () => {
    // Not vacuous: the name comparisons of the queries are found.
    expect([...queries.values()].flatMap((query) => comparedLiterals(query, 'name')).length).toBeGreaterThanOrEqual(10);
    expect(bindingViolations(queries)).toEqual([]);
  });

  it('names an unknown event, kind, outcome, screen or field it is given', () => {
    const bad = new Map([
      ['typo', "filter name = 'screen_veiw' | stats count(*) as n by screen"],
      ['list', "filter name in ['action', 'tap'] and kind = 'photo' and outcome != 'meh' and screen in ['home', 'nowhere'] | stats count(*) as n by targett"],
      ['contains', "stats sum(strcontains(name, 'dialog_opened')) as opens by target"],
      ['crossed', "filter name = 'wait' and kind = 'plate' | stats count(*) as n by kind"],
      ['own', "filter name = 'reading_result' and kind = 'plate' | stats count(*) as n by outcome"],
    ]);
    expect(bindingViolations(bad)).toEqual([
      "typo: name 'screen_veiw' is not in the kernel list",
      "list: name 'tap' is not in the kernel list",
      "list: kind 'photo' is not in the kernel list",
      "list: outcome 'meh' is not in the kernel list",
      "list: screen 'nowhere' is not in the kernel list",
      'list: field targett is not an event key, a server key or an alias',
      "contains: name 'dialog_opened' is not in the kernel list",
      "crossed: kind 'plate' is not a kind of wait",
    ]);
  });

  it('binds the deploy\'s usage-events filter pattern to the kernel: a kernel event name and event keys only', () => {
    const deploy = read(resolve(import.meta.dirname, '../infra/bin/deploy'));
    const pattern = /^\s*local session_pattern="(.*)"$/m.exec(deploy)?.[1];
    expect(pattern).toBeDefined();
    const terms = [...pattern!.matchAll(/\\\$\.(\w+) = \\"([^"\\]*)\\"/g)].map((match) => ({ field: match[1]!, value: match[2]! }));
    expect(terms.map((term) => term.field)).toEqual(['name', 'app_version']);
    const unknown = terms.filter((term) => !Object.keys(shape).includes(term.field)).map((term) => term.field);
    expect(unknown).toEqual([]);
    const name = terms.find((term) => term.field === 'name')!.value;
    expect(UX_EVENT_NAMES).toContain(name);
    expect(name).toBe('session_start');
    expect(terms.find((term) => term.field === 'app_version')!.value).toBe('$tag');
  });

  it('leaves the smoke company out of every view but users, which labels it', () => {
    const unfiltered = [...queries].filter(([key, query]) => key !== 'users' && !query.startsWith(SMOKE_FILTER)).map(([key]) => key);
    expect(unfiltered).toEqual([]);
    expect(smokeFilterOf(observability)).toBe(SMOKE_FILTER);
    expect(queries.get('users')).not.toContain(SMOKE_FILTER);
    expect(observability).toMatch(/ux_company_label\s*=\s*"replace\(company_id, '\$\{var\.smoke_company_id\}', 'smoke'\)"/);
  });

  it('bins sessions_per_day by the device day (ts), not by receipt time', () => {
    const query = queries.get('sessions_per_day') ?? '';
    expect(query).toMatch(/\bsubstr\(ts, 0, 10\) as (\w+)\b.*\bby \1\b/);
    expect(query).not.toContain('bin(');
  });

  it('reads the group the api writes to: the dashboard and the saved queries through the local, the local from the resource', () => {
    expect(observability).toMatch(/^\s*ux_events_log_group = aws_cloudwatch_log_group\.ux_events\.name$/m);
    expect(observability).not.toMatch(/"\/fasor\/production\/ux-events"/);
    expect(observability).toContain("query  = \"SOURCE '${local.ux_events_log_group}' | ${local.ux_queries[key].query}\"");
    expect(observability).toMatch(/log_group_names = \[local\.ux_events_log_group\]/);
    expect(ecs).toMatch(/^\s*TELEMETRY_LOG_GROUP = aws_cloudwatch_log_group\.ux_events\.name$/m);

    const suffix = /resource "aws_cloudwatch_log_group" "ux_events" \{\n\s*name\s*= "\$\{local\.ssm_prefix\}(\/[a-z-]+)"/.exec(telemetry)?.[1];
    const prefix = /^\s*ssm_prefix = "([^"]+)"$/m.exec(locals)?.[1];
    expect(suffix).toBe('/ux-events');
    expect(prefix).toBeDefined();
    const group = `${prefix}${suffix}`;
    const named = [...runbook.matchAll(/`(\/fasor\/[a-z]+\/ux-[a-z-]+)`/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(new Set([group]));
  });
});
