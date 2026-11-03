import { describe, expect, it } from 'vitest';
import { FUNCAO_MAX_LENGTH } from '../schemas/block-config.ts';
import { NC_PHRASE_MAX_LENGTH, RELATORIO_SETUP_KEYS } from '../schemas/entities.ts';
import { opSchema, type Op } from './op.ts';
import { FAMILIES, parsePath } from './path.ts';
import { FAMILY_VALUE_RULES, opValueIssue, SETUP_VALUE_RULES, SITE_ALTITUDE_RANGE_M, TEXT_CAPS, textCapOf } from './value-limits.ts';

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
