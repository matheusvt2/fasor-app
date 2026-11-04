import { describe, expect, it } from 'vitest';
import { opLog as portoSeguroLog, RELATORIO_ID as PORTO_SEGURO_RELATORIO } from '../../fixtures/porto-seguro/op-log.ts';
import { opLog as portoSeguroSmallLog } from '../../fixtures/porto-seguro/small/op-log.ts';
import { opLog as replaySmallLog } from '../../fixtures/replay-small/op-log.ts';
import { FUNCAO_MAX_LENGTH } from '../schemas/block-config.ts';
import { NC_PHRASE_MAX_LENGTH, RELATORIO_SETUP_KEYS, rowIndexColumns, rowRemovedAt } from '../schemas/entities.ts';
import { opSchema, type Op } from './op.ts';
import { splitEntityKey } from './apply.ts';
import { FAMILIES, parsePath } from './path.ts';
import { replay } from './replay.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { standardTemplate } from '../seed/template.ts';
import { shortStringsOfBytes } from '../../fixtures/value-caps.ts';
import {
  FAMILY_VALUE_RULES,
  longestArrayOf,
  openValueParts,
  opValueIssue,
  serializedBytes,
  SETUP_VALUE_RULES,
  SITE_ALTITUDE_RANGE_M,
  TEXT_CAPS,
  textCapOf,
  opDepthIssue,
  RELATORIO_MAX_BYTES,
  relatorioBudgetVerdict,
  VALUE_MAX_BYTES,
  VALUE_MAX_DEPTH,
  VALUE_MAX_ITEMS,
  valueDepth,
} from './value-limits.ts';

/*
 * Story 20.9 (contract 29, security pass S4): per-kind tests at the cap and one past it, the
 * type checks, the altitude's range, and the guard that every path family has a rule. Written
 * red-first against `spec-e20s-server-rules.md`.
 */

const COMPANY = '019966c1-0000-7000-8000-00000000000c';
const RELATORIO = '019966c1-0000-7000-8000-0000000000a1';
const PROJECT = '019966c1-0000-7000-8000-0000000000d1';
const BLOCK = '019966c1-0000-7000-8000-0000000000b1';
const LOCATION = '019966c1-0000-7000-8000-0000000000c1';
const POINT = '019966c1-0000-7000-8000-0000000000e1';
const FILE = '019966c1-0000-7000-8000-0000000000f1';
const EQUIPMENT = '019966c1-0000-7000-8000-0000000000a9';
const CLIENT = '019966c1-0000-7000-8000-0000000000a8';

let seq = 0;
function op(input: Partial<Op> & Pick<Op, 'path' | 'kind'>): Op {
  seq += 1;
  return opSchema.parse({
    op_id: `019966c1-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: RELATORIO,
    value: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: '019966c1-0000-7000-8000-0000000000e9',
    device_id: 'tablet-1',
    client_ts: '2026-11-03T12:00:00.000Z',
    ...input,
  });
}

const put = (path: string, value: unknown, extra: Partial<Op> = {}) => op({ kind: 'put', path, value: value as Op['value'], ...extra });
const issue = (o: Op) => opValueIssue(o, parsePath(o.path));
const chars = (n: number) => 'x'.repeat(n);

describe('FAMILY_VALUE_RULES (Story 20.9)', () => {
  it('guard: every path family of ops/path.ts has a value rule, and the rules name no other family', () => {
    const families = FAMILIES.map((def) => def.family).sort();
    expect(Object.keys(FAMILY_VALUE_RULES).sort()).toEqual(families);
  });

  it('guard: the relatório setup rules name every key of the setup row schema', () => {
    expect(Object.keys(SETUP_VALUE_RULES).sort()).toEqual([...RELATORIO_SETUP_KEYS].sort());
  });

  it('a server-only family has no value rule of its own (the push route refuses it before)', () => {
    for (const def of FAMILIES) {
      if (def.serverOnly === true) expect(FAMILY_VALUE_RULES[def.family], def.family).toEqual({ kind: 'server_only' });
    }
  });

  it('the caps fit real data: every op of the Porto Seguro relatório (delivered), its small cut and the replay fixture passes', () => {
    for (const [name, log] of [
      ['porto-seguro', portoSeguroLog],
      ['porto-seguro/small', portoSeguroSmallLog],
      ['replay-small', replaySmallLog],
    ] as const) {
      const refused = log.filter((op) => opValueIssue(op, parsePath(op.path)) !== null).map((op) => `${op.path}: ${opValueIssue(op, parsePath(op.path))}`);
      expect(refused, name).toEqual([]);
      expect(log.length, name).toBeGreaterThan(0);
    }
  });

  it('the caps of the epic table, and the existing NC phrase and Função caps kept as they are', () => {
    expect(TEXT_CAPS).toEqual({ short: 200, medium: 1000, long: 20000 });
    expect(SITE_ALTITUDE_RANGE_M).toEqual({ min: -500, max: 9000 });
    expect(NC_PHRASE_MAX_LENGTH).toBe(200);
    expect(FUNCAO_MAX_LENGTH).toBe(80);
  });
});

describe('opValueIssue: the three text kinds at the cap and one past it (Story 20.9)', () => {
  const cases: ReadonlyArray<[string, string, number]> = [
    // Short: names, TAG, serial, place, labels, registry fields.
    ['relatorio/setup/local', 'short', TEXT_CAPS.short],
    ['relatorio/setup/atividade', 'short', TEXT_CAPS.short],
    ['relatorio/setup/art_trt_number', 'short', TEXT_CAPS.short],
    [`location/${LOCATION}/name`, 'short', TEXT_CAPS.short],
    [`equipment/${EQUIPMENT}/tag`, 'short', TEXT_CAPS.short],
    [`point/${POINT}/owner`, 'short', TEXT_CAPS.short],
    [`registry/client/${CLIENT}/name`, 'short', TEXT_CAPS.short],
    [`sheet/${BLOCK}/nameplate/n_serie`, 'short', TEXT_CAPS.short],
    // Medium: a caption, an item note, a point's action, the next intervention's justification.
    [`file/${FILE}/caption`, 'medium', TEXT_CAPS.medium],
    [`sheet/${BLOCK}/checklist/limpeza/observation`, 'medium', TEXT_CAPS.medium],
    [`point/${POINT}/action`, 'medium', TEXT_CAPS.medium],
    ['relatorio/setup/next_intervention_justification', 'medium', TEXT_CAPS.medium],
    // Long: additional_info, escopo, OBSERVAÇÕES, CONCLUSÃO, a point's text.
    ['relatorio/setup/additional_info', 'long', TEXT_CAPS.long],
    ['relatorio/setup/escopo', 'long', TEXT_CAPS.long],
    [`sheet/${BLOCK}/observations`, 'long', TEXT_CAPS.long],
    [`sheet/${BLOCK}/conclusion/text`, 'long', TEXT_CAPS.long],
    [`sheet/${BLOCK}/conclusion/text_basis`, 'long', TEXT_CAPS.long],
    [`point/${POINT}/text`, 'long', TEXT_CAPS.long],
  ];

  for (const [path, kind, cap] of cases) {
    it(`${path} (${kind}): ${cap} characters pass, ${cap + 1} are refused, and textCapOf says ${cap}`, () => {
      const scope = path.startsWith('registry/') ? { scope: 'company' as const, relatorio_id: null } : path.startsWith('equipment/') ? { scope: 'project' as const, relatorio_id: null, project_id: PROJECT } : {};
      expect(issue(put(path, chars(cap), scope))).toBeNull();
      expect(issue(put(path, chars(cap + 1), scope))).not.toBeNull();
      expect(textCapOf(path)).toBe(cap);
    });
  }

  it('S4: a 20 001-character additional_info is refused, and the 5 MB string of the security pass too', () => {
    expect(issue(put('relatorio/setup/additional_info', chars(20_001)))).not.toBeNull();
    expect(issue(put('relatorio/setup/additional_info', chars(5 * 1024 * 1024)))).not.toBeNull();
  });

  it('the parecer text and its basis are long; the exclusions are short each', () => {
    const parecer = (text: string) => ({ verdict: 'apto', text, text_status: 'edited', text_basis: null });
    expect(issue(put('relatorio/setup/parecer', parecer(chars(TEXT_CAPS.long))))).toBeNull();
    expect(issue(put('relatorio/setup/parecer', parecer(chars(TEXT_CAPS.long + 1))))).not.toBeNull();
    expect(issue(put('relatorio/setup/exclusions', [chars(200), 'b']))).toBeNull();
    expect(issue(put('relatorio/setup/exclusions', [chars(201)]))).not.toBeNull();
    expect(textCapOf('relatorio/setup', 'parecer.text')).toBe(TEXT_CAPS.long);
    expect(textCapOf('relatorio/setup', 'exclusions')).toBe(TEXT_CAPS.short);
  });

  it('a structured value (a section block config, template blocks) caps every string at long', () => {
    expect(issue(put(`block/${BLOCK}/config`, { block_type: 'apresentacao', sub_blocks: {}, na_defaults: [], section_text: chars(TEXT_CAPS.long) }))).toBeNull();
    expect(issue(put(`block/${BLOCK}/config`, { block_type: 'apresentacao', sub_blocks: {}, na_defaults: [], section_text: chars(TEXT_CAPS.long + 1) }))).not.toBeNull();
    expect(textCapOf(`block/${BLOCK}/config`)).toBe(TEXT_CAPS.long);
  });
});

describe('opValueIssue: types and ranges (Story 20.9)', () => {
  it('S4: sheet observations as an object are refused; a text or null passes', () => {
    expect(issue(put(`sheet/${BLOCK}/observations`, { a: 1 }))).not.toBeNull();
    expect(issue(put(`sheet/${BLOCK}/observations`, ['x']))).not.toBeNull();
    expect(issue(put(`sheet/${BLOCK}/observations`, 42))).not.toBeNull();
    expect(issue(put(`sheet/${BLOCK}/observations`, 'Sem anomalias'))).toBeNull();
    expect(issue(put(`sheet/${BLOCK}/observations`, null))).toBeNull();
    expect(issue(put(`sheet/${BLOCK}/checklist/limpeza/observation`, { text: 'x' }))).not.toBeNull();
    expect(issue(put(`sheet/${BLOCK}/conclusion/text`, { text: 'x' }))).not.toBeNull();
  });

  it('S4: the site altitude takes -500 and 9 000 m and refuses -501, 9 001 and the -99 999 of the security pass', () => {
    for (const ok of [-500, 0, 760, 9000, null]) expect(issue(put('relatorio/setup/site_altitude_m', ok)), String(ok)).toBeNull();
    for (const bad of [-501, 9001, -99_999]) expect(issue(put('relatorio/setup/site_altitude_m', bad)), String(bad)).not.toBeNull();
  });

  it('the cabine altitude (AMBIENTE DE ENSAIO) shares the range on its number value, and every number value keeps raw and unit short', () => {
    const value = (raw: string) => ({ raw, unit: 'm', state: 'measured' });
    expect(issue(put(`location/${LOCATION}/env/altitude_m`, value('-500')))).toBeNull();
    expect(issue(put(`location/${LOCATION}/env/altitude_m`, value('9000')))).toBeNull();
    expect(issue(put(`location/${LOCATION}/env/altitude_m`, value('-501')))).not.toBeNull();
    expect(issue(put(`location/${LOCATION}/env/altitude_m`, value('9001')))).not.toBeNull();
    expect(issue(put(`location/${LOCATION}/env/altitude_m`, { raw: '', unit: null, state: 'not_applicable' }))).toBeNull();
    // Real data: the Porto Seguro relatório's AMBIENTE DE ENSAIO writes a bound, "<1000" m; the range judges plain numbers only.
    expect(issue(put(`location/${LOCATION}/env/altitude_m`, value('<1000')))).toBeNull();
    expect(issue(put(`location/${LOCATION}/se/primary_kv`, value('13.8')))).toBeNull();
    expect(issue(put(`location/${LOCATION}/se/primary_kv`, value(chars(201))))).not.toBeNull();
    expect(issue(put(`location/${LOCATION}/env/temperature_c`, { raw: '25', unit: chars(201), state: 'measured' }))).not.toBeNull();
  });

  it('a seed-defined cell (a nameplate, a test cell, a test value) takes any shape whose strings are short', () => {
    expect(issue(put(`sheet/${BLOCK}/nameplate/potencia`, { raw: '1500', unit: 'kVA', state: 'measured' }))).toBeNull();
    expect(issue(put(`sheet/${BLOCK}/test/isolacao/cell/0/1`, { raw: chars(201), unit: null, state: 'measured' }))).not.toBeNull();
    expect(issue(put(`sheet/${BLOCK}/test/cta_tempos/value/metodo`, chars(201)))).not.toBeNull();
  });

  it('a create checks its row\'s typed strings: the obra name, a point\'s text, a registry row', () => {
    const project = (name: string) => op({ kind: 'create', scope: 'company', relatorio_id: null, path: `project/${PROJECT}`, value: { id: PROJECT, client_id: null, name, site: null, removed_at: null } });
    expect(issue(project(chars(200)))).toBeNull();
    expect(issue(project(chars(201)))).not.toBeNull();
    const client = (address: string) =>
      op({
        kind: 'create',
        scope: 'company',
        relatorio_id: null,
        path: `registry/client/${CLIENT}`,
        value: { id: CLIENT, kind: 'client', name: 'Cliente', cnpj: null, contact_name: null, contact_phone: null, sites: [{ id: PROJECT, address }], removed_at: null },
      });
    expect(issue(client(chars(200)))).toBeNull();
    expect(issue(client(chars(201)))).not.toBeNull();
    expect(textCapOf('project', 'name')).toBe(TEXT_CAPS.short);
    expect(textCapOf('point', 'text')).toBe(TEXT_CAPS.long);
    expect(textCapOf('registry', 'name')).toBe(TEXT_CAPS.short);
    expect(textCapOf('location', 'name')).toBe(TEXT_CAPS.short);
  });

  it('the Função keeps its 80 characters, and a remove carries no value to check', () => {
    expect(issue(put(`location/${LOCATION}/funcao`, chars(FUNCAO_MAX_LENGTH)))).toBeNull();
    expect(issue(put(`location/${LOCATION}/funcao`, chars(FUNCAO_MAX_LENGTH + 1)))).not.toBeNull();
    expect(textCapOf(`location/${LOCATION}/funcao`)).toBe(FUNCAO_MAX_LENGTH);
    expect(issue(op({ kind: 'remove', path: `point/${POINT}/removed_at` }))).toBeNull();
  });

  it('textCapOf holds no cap for a field that is no text, a create path or a path that does not parse', () => {
    expect(textCapOf('relatorio/setup/site_altitude_m')).toBeNull();
    expect(textCapOf('relatorio/status')).toBeNull();
    expect(textCapOf(`point/${POINT}`)).toBeNull();
    expect(textCapOf('not/a/path')).toBeNull();
  });
});

describe('whole-value caps, set from measurement (e20f)', () => {
  /** Every op the kernel and its fixtures write: the three fixture logs, a relatório of the shipped seed template, and that template's create and field puts. */
  function measuredOps(): Op[] {
    const template = standardTemplate({ id: '019966c1-0000-7000-8000-0000000000aa' });
    const { drafts } = instantiateTemplate(
      template,
      { id: PROJECT },
      { service_start: '2026-11-01', service_end: '2026-11-02', existingEquipment: [], responsible_user_id: null },
      { newId: (() => { let n = 0; return () => `019966c1-0000-7000-8001-${String(++n).padStart(12, '0')}`; })(), actorId: '019966c1-0000-7000-8000-0000000000e9', companyId: COMPANY },
    );
    const seeded = drafts.map((draft, i) => opSchema.parse({ ...draft, op_id: `019966c1-0000-7000-8002-${String(i).padStart(12, '0')}`, client_ts: '2026-11-04T12:00:00.000Z', device_id: 'tablet-1' }));
    const templateOps = [
      op({ kind: 'create', scope: 'company', relatorio_id: null, path: `template/${template.id}`, value: template as never }),
      ...Object.entries(template)
        .filter(([key]) => !['id', 'company_id', 'origin', 'seed_version', 'version'].includes(key))
        .flatMap(([key, value]) => {
          try {
            return [op({ kind: 'put', scope: 'company', relatorio_id: null, path: `template/${template.id}/${key}`, value: value as never })];
          } catch {
            return [];
          }
        }),
    ];
    return [...portoSeguroLog, ...portoSeguroSmallLog, ...replaySmallLog, ...seeded, ...templateOps];
  }

  it('measure: the caps leave at least 4x the largest open value and the longest array of every fixture and seed op', () => {
    let maxBytes = { where: '', bytes: 0 };
    let maxItems = { where: '', length: 0 };
    let checked = 0;
    for (const entry of measuredOps()) {
      const path = parsePath(entry.path);
      if (FAMILY_VALUE_RULES[path.family].kind === 'server_only') continue;
      checked++;
      for (const part of openValueParts(entry, path)) {
        const bytes = serializedBytes(part.value);
        if (bytes > maxBytes.bytes) maxBytes = { where: `${entry.path} ${part.where}`, bytes };
      }
      const longest = longestArrayOf(entry.value);
      if (longest !== null && longest.length > maxItems.length) maxItems = { where: `${entry.path} ${longest.where}`, length: longest.length };
    }
    console.log(`e20f measured: ${checked} ops; largest open value ${maxBytes.bytes} B at ${maxBytes.where}; longest array ${maxItems.length} at ${maxItems.where}`);
    expect(checked).toBeGreaterThan(1000);
    expect(VALUE_MAX_BYTES).toBeGreaterThanOrEqual(4 * maxBytes.bytes);
    expect(VALUE_MAX_ITEMS).toBeGreaterThanOrEqual(4 * maxItems.length);
  });

  it('QA N1, measure: the deepest value or meta of every fixture and seed op is at least 4x under VALUE_MAX_DEPTH', () => {
    let deepest = { where: '', depth: 0 };
    for (const entry of measuredOps()) {
      for (const key of ['value', 'meta'] as const) {
        const depth = valueDepth(entry[key]);
        if (depth > deepest.depth) deepest = { where: `${entry.path} ${key}`, depth };
      }
    }
    console.log(`e20f measured: deepest value ${deepest.depth} at ${deepest.where}`);
    expect(VALUE_MAX_DEPTH).toBe(32);
    expect(VALUE_MAX_DEPTH).toBeGreaterThanOrEqual(4 * deepest.depth);
  });

  it('QA N1: a value nested 20 000 levels deep is refused without overflowing the stack; 32 levels pass, 33 do not', () => {
    const nested = (levels: number): unknown => {
      let value: unknown = 'x';
      for (let i = 0; i < levels; i++) value = { a: value };
      return value;
    };
    expect(valueDepth(nested(32))).toBe(32);
    expect(valueDepth(nested(33))).toBe(33);
    expect(valueDepth(nested(20_000))).toBe(VALUE_MAX_DEPTH + 1);
    expect(valueDepth([[], {}])).toBe(2);
    expect(valueDepth('x')).toBe(0);
    expect(opDepthIssue({ value: nested(32), meta: null })).toBeNull();
    expect(opDepthIssue({ value: nested(33) })).toMatch(/value nests more than 32/);
    expect(opDepthIssue({ value: null, meta: nested(20_000) })).toMatch(/meta nests more than 32/);
    expect(issue(put(`block/${BLOCK}/config`, nested(33) as never))).toMatch(/nests more than 32/);
  });

  it('the numbers: 128 KiB for an open value, 500 items for any array', () => {
    expect(VALUE_MAX_BYTES).toBe(131_072);
    expect(VALUE_MAX_ITEMS).toBe(500);
  });

  it('a nameplate cell at exactly the byte and count caps passes; one more item, or one more byte, is refused', () => {
    const atCaps = shortStringsOfBytes(VALUE_MAX_ITEMS, VALUE_MAX_BYTES);
    expect(serializedBytes(atCaps)).toBe(VALUE_MAX_BYTES);
    expect(atCaps).toHaveLength(VALUE_MAX_ITEMS);
    const cell = (value: string[]) => put(`sheet/${BLOCK}/nameplate/fabricante`, value);
    expect(issue(cell(atCaps))).toBeNull();
    expect(issue(cell(shortStringsOfBytes(VALUE_MAX_ITEMS + 1, VALUE_MAX_BYTES)))).toMatch(/holds 501 items, over 500/);
    expect(issue(cell(shortStringsOfBytes(VALUE_MAX_ITEMS, VALUE_MAX_BYTES + 1)))).toMatch(/weighs 131073 bytes, over 131072/);
  });

  it('the matrix: a nameplate cell of 15 000 short strings and a structured value of many 20 000-character strings are refused', () => {
    expect(issue(put(`sheet/${BLOCK}/nameplate/fabricante`, Array.from({ length: 15_000 }, () => 'x')))).not.toBeNull();
    const many = Array.from({ length: 7 }, () => 'x'.repeat(TEXT_CAPS.long));
    expect(issue(put(`block/${BLOCK}/config`, { block_type: 'apresentacao', sub_blocks: {}, na_defaults: [], section_text: null, notes: many }))).toMatch(/weighs \d+ bytes, over 131072/);
    // Fewer than the cap's worth of long strings passes.
    expect(issue(put(`block/${BLOCK}/config`, { block_type: 'apresentacao', sub_blocks: {}, na_defaults: [], section_text: null, notes: many.slice(0, 6) }))).toBeNull();
  });

  it('every array of a client value is counted, the exclusions and the instruments of setup included', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `019966c1-0000-7000-8000-${String(i).padStart(12, '0')}`);
    expect(issue(put('relatorio/setup/instrument_ids', ids(VALUE_MAX_ITEMS)))).toBeNull();
    expect(issue(put('relatorio/setup/instrument_ids', ids(VALUE_MAX_ITEMS + 1)))).not.toBeNull();
    expect(issue(put('relatorio/setup/exclusions', Array.from({ length: VALUE_MAX_ITEMS + 1 }, () => 'x')))).not.toBeNull();
  });

  it('never refuses a value whose every field has a text cap: a setup of four long texts in three-byte characters weighs over the byte cap and passes', () => {
    const heavy = '€'.repeat(TEXT_CAPS.long);
    const setup = { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null, escopo: heavy, additional_info: heavy, parecer: { verdict: 'apto', text: heavy, text_status: 'edited', text_basis: heavy } };
    const create = op({
      kind: 'create',
      path: `relatorio/${RELATORIO}`,
      value: { id: RELATORIO, project_id: PROJECT, template_id: null, template_version: null, seed_version: 'v1', status: 'rascunho', setup, export: { scheme: 'por_local_e_tipo' }, preview_file_id: null, removed_at: null } as never,
    });
    expect(serializedBytes(create.value)).toBeGreaterThan(VALUE_MAX_BYTES);
    expect(openValueParts(create, parsePath(create.path)).map((part) => part.where)).not.toContain('value.setup');
    expect(issue(create)).toBeNull();
  });
});

describe('the relatório budget (e20f, aggregate)', () => {
  it('measure: the Porto Seguro relatório, replayed, holds its live rows in under a third of the budget', () => {
    const state = replay(portoSeguroLog);
    let rows = 0;
    let bytes = 0;
    for (const [key, row] of state) {
      const { entity } = splitEntityKey(key);
      if (rowIndexColumns(entity, row).relatorio_id !== PORTO_SEGURO_RELATORIO || rowRemovedAt(row) !== null) continue;
      rows++;
      bytes += serializedBytes(row);
    }
    console.log(`e20f measured: Porto Seguro ${rows} live rows, ${bytes} bytes`);
    expect(RELATORIO_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(rows).toBeGreaterThan(100);
    expect(bytes * 4).toBeLessThan(RELATORIO_MAX_BYTES);
  });

  it('refuses a value that takes the relatório past the budget; at the budget it applies; a remove and a put of null always apply', () => {
    const point = (text: string) => put(`point/${POINT}/text`, text);
    const op20k = point('x'.repeat(TEXT_CAPS.long));
    const bytes = serializedBytes(op20k.value);
    expect(relatorioBudgetVerdict(op20k, RELATORIO_MAX_BYTES - bytes)).toBe('allowed');
    expect(relatorioBudgetVerdict(op20k, RELATORIO_MAX_BYTES - bytes + 1)).toBe('refused');
    expect(relatorioBudgetVerdict(point('y'), RELATORIO_MAX_BYTES)).toBe('refused');
    expect(relatorioBudgetVerdict(put(`point/${POINT}/text`, null), RELATORIO_MAX_BYTES * 2)).toBe('allowed');
    expect(relatorioBudgetVerdict(op({ kind: 'remove', path: `point/${POINT}/removed_at` }), RELATORIO_MAX_BYTES * 2)).toBe('allowed');
    // An op naming no relatório (a company registry entry) is not counted.
    expect(relatorioBudgetVerdict({ kind: 'put', value: 'x', relatorio_id: null }, RELATORIO_MAX_BYTES * 2)).toBe('allowed');
  });
});
