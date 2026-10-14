import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FUNCAO_KEYS, FUNCAO_MAX_LENGTH, ITEM_KEYS, SITE_ITEM_KEYS, siteItemKeySchema } from './block-config.ts';
import { ENTITIES, ENTITY_SCOPE, entityKeys, entityRowSchemas, registryKeys, type Entity } from './entities.ts';
import { snapshotFileSchema } from './snapshot.ts';

/** Every `*_id` key reachable in a schema, with its path, ignoring the given branches. */
function referenceKeys(schema: z.ZodType, path: string[] = [], skip: string[] = []): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, child]) => {
      const here = [...path, key];
      if (skip.includes(here.join('.'))) return [];
      const own = key.endsWith('_id') ? [here.join('.')] : [];
      return [...own, ...referenceKeys(child as z.ZodType, here, skip)];
    });
  }
  if (schema instanceof z.ZodDiscriminatedUnion || schema instanceof z.ZodUnion) {
    return (schema.options as z.ZodType[]).flatMap((o) => referenceKeys(o, path, skip));
  }
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    return referenceKeys(schema.unwrap() as z.ZodType, path, skip);
  }
  if (schema instanceof z.ZodArray) return referenceKeys(schema.element as z.ZodType, path, skip);
  if (schema instanceof z.ZodRecord) return referenceKeys(schema.valueType as z.ZodType, path, skip);
  return [];
}

const RELATORIO_SCOPE_ENTITIES = ENTITIES.filter((e) => ENTITY_SCOPE[e].includes('relatorio') && ENTITY_SCOPE[e].length === 1);

/** `relatorio_id`, `block_id`, `location_id`, ... name relatorio-scope rows; `file_id` may be either scope. */
const RELATORIO_ROW_REFERENCES = new Set([...RELATORIO_SCOPE_ENTITIES.map((e) => `${e}_id`), 'parent_id', 'feeds_block_id']);

describe('1.4-UNIT-005 schema references', () => {
  const upper = ENTITIES.filter((e) => !ENTITY_SCOPE[e].includes('relatorio'));

  it('covers the company and project scope entities', () => {
    expect(upper.sort()).toEqual(['equipment', 'project', 'registry', 'template', 'user']);
  });

  it.each(upper)('%s never references a relatorio-scope row', (entity: Entity) => {
    // AD-25: `last_nameplate` is a server projection of an issued revision; its relatorio_id is provenance, not a reference.
    const skip = entity === 'equipment' ? ['last_nameplate'] : [];
    const refs = referenceKeys(entityRowSchemas[entity], [], skip).map((p) => p.split('.').at(-1)!);
    expect(refs.filter((k) => RELATORIO_ROW_REFERENCES.has(k))).toEqual([]);
  });

  it('file is the one entity living in two scopes', () => {
    expect(ENTITY_SCOPE.file).toEqual(['company', 'relatorio']);
    for (const e of ENTITIES) if (e !== 'file') expect(ENTITY_SCOPE[e]).toHaveLength(1);
  });
});

describe('entityKeys', () => {
  it('lists the fields of a row schema, unions included', () => {
    expect(entityKeys('project')).toEqual(['id', 'client_id', 'name', 'site', 'removed_at']);
    expect(entityKeys('location')).toContain('se');
    expect(entityKeys('location')).toContain('name');
    expect(entityKeys('file')).toContain('caption');
    expect(registryKeys('instrument')).toContain('certificate_file_id');
    expect(registryKeys('client')).not.toContain('serial');
  });
});

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

describe('4.1-UNIT the Porto Seguro golden files still parse after location_id became nullable', () => {
  it.each(['../../fixtures/porto-seguro/snapshot.golden.json', '../../fixtures/porto-seguro/small/snapshot.golden.json'])('%s', (file) => {
    const path = fileURLToPath(new URL(file, import.meta.url));
    const golden = JSON.parse(readFileSync(path, 'utf8')) as { blocks: unknown[] };
    for (const block of golden.blocks) {
      const parsed = entityRowSchemas.block.parse(block);
      expect(typeof parsed.location_id).toBe('string');
      // A parse round trip changes no value: the golden file (canonical, keys sorted) stays
      // byte-identical to what the schema hands back once sorted the same way.
      expect(JSON.stringify(sortKeysDeep(parsed))).toBe(JSON.stringify(block));
    }
  });

  it('accepts a section block with no location', () => {
    const golden = JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/porto-seguro/small/snapshot.golden.json', import.meta.url)), 'utf8')) as { blocks: { location_id: string }[] };
    expect(entityRowSchemas.block.safeParse({ ...golden.blocks[0], location_id: null, equipment_id: null, block_type: 'section_2', config: {} }).success).toBe(true);
  });
});

describe('Story 14.2 (contract 17): the location row gains the painel kind and the cabine Função', () => {
  const base = { id: '019966d0-0000-7000-8000-000000000011', relatorio_id: '019966d0-0000-7000-8000-000000000012', name: 'X', order_key: 'a0', removed_at: null };
  const PARENT = '019966d0-0000-7000-8000-000000000013';
  const cabine = { ...base, parent_id: null, kind: 'cabine', se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null }, env: { altitude_m: null, temperature_c: null, humidity_pct: null }, agrupar_por_tipo: false };
  const location = entityRowSchemas.location;

  it('accepts the three kinds; a painel always has a parent; a coluna under a cabine stays valid', () => {
    expect(location.safeParse(cabine).success).toBe(true);
    expect(location.safeParse({ ...base, parent_id: PARENT, kind: 'painel' }).success).toBe(true);
    expect(location.safeParse({ ...base, parent_id: PARENT, kind: 'coluna' }).success).toBe(true);
    expect(location.safeParse({ ...base, parent_id: null, kind: 'painel' }).success).toBe(false);
    expect(location.safeParse({ ...base, parent_id: PARENT, kind: 'andar' }).success).toBe(false);
  });

  it('funcao is a reserved key or a typed name on a cabine: never blank, at most 80 characters, null or absent for none', () => {
    for (const funcao of [...FUNCAO_KEYS, 'Medição', 'x'.repeat(FUNCAO_MAX_LENGTH), null]) expect(location.safeParse({ ...cabine, funcao }).success, String(funcao)).toBe(true);
    for (const funcao of ['', '  ', 'x'.repeat(FUNCAO_MAX_LENGTH + 1), 3, {}]) expect(location.safeParse({ ...cabine, funcao }).success, JSON.stringify(funcao)).toBe(false);
    expect(FUNCAO_KEYS).toEqual(['entrada', 'primaria', 'transformacao', 'distribuicao']);
  });

  it('a row stored before the field parses to the same bytes: no funcao key appears, and a painel or coluna never carries one', () => {
    expect(JSON.stringify(sortKeysDeep(location.parse(cabine)))).toBe(JSON.stringify(sortKeysDeep(cabine)));
    expect(Object.keys(location.parse(cabine))).not.toContain('funcao');
    expect(location.parse({ ...base, parent_id: PARENT, kind: 'painel', funcao: 'primaria', se: cabine.se })).toEqual({ ...base, parent_id: PARENT, kind: 'painel' });
    expect(location.parse({ ...base, parent_id: PARENT, kind: 'coluna', funcao: 'primaria' })).toEqual({ ...base, parent_id: PARENT, kind: 'coluna' });
    expect(entityKeys('location')).toContain('funcao');
  });

  it('the Porto Seguro golden locations parse to themselves (no stored row changes)', () => {
    const path = fileURLToPath(new URL('../../fixtures/porto-seguro/snapshot.golden.json', import.meta.url));
    const golden = JSON.parse(readFileSync(path, 'utf8')) as { locations: unknown[] };
    expect(golden.locations.length).toBeGreaterThan(0);
    for (const row of golden.locations) expect(JSON.stringify(sortKeysDeep(location.parse(row)))).toBe(JSON.stringify(row));
  });
});

describe('Story 14.3 (contract 18): the cabine row gains `checklist`, the photo and the point rows `location_id`', () => {
  const ID = '019966d0-0000-7000-8000-000000000021';
  const RELATORIO = '019966d0-0000-7000-8000-000000000022';
  const LOCAL = '019966d0-0000-7000-8000-000000000023';
  const OP = '019966d0-0000-7000-8000-000000000024';
  const base = { id: ID, relatorio_id: RELATORIO, name: 'X', order_key: 'a0', removed_at: null };
  const cabine = { ...base, parent_id: null, kind: 'cabine', se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null }, env: { altitude_m: null, temperature_c: null, humidity_pct: null }, agrupar_por_tipo: false };
  const cell = (value: unknown) => ({ value, source_suggestion_id: null, op_id: OP });
  const location = entityRowSchemas.location;
  const golden = (file: string) => JSON.parse(readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')) as { locations: unknown[]; files: unknown[]; points: unknown[] };

  it('SITE_ITEM_KEYS is the closed list of 19 keys, apart from the sheet item keys', () => {
    expect(SITE_ITEM_KEYS).toHaveLength(19);
    expect(new Set(SITE_ITEM_KEYS).size).toBe(19);
    for (const key of SITE_ITEM_KEYS) expect(key, key).toMatch(/^[a-z0-9_]+$/);
    expect(SITE_ITEM_KEYS.filter((key) => (ITEM_KEYS as readonly string[]).includes(key))).toEqual([]);
    expect(siteItemKeySchema.safeParse('ventilacao').success).toBe(true);
    expect(siteItemKeySchema.safeParse('limpeza').success).toBe(false);
    // The 45th sheet item key; seed v5 (Story 14.5) appended its 17 after it.
    expect(ITEM_KEYS[44]).toBe('no_break_de_comando');
  });

  it('a cabine holds a cell-shaped entry per answered site item; any subset of the 19 keys, an empty entry and an empty checklist parse', () => {
    const full = { ...cabine, checklist: { ventilacao: { result: cell('NC'), observation: cell('Exaustor inoperante') }, epi_disponivel: { result: cell(null) }, iluminacao_normal: {} } };
    expect(location.parse(full)).toEqual(full);
    expect(location.safeParse({ ...cabine, checklist: {} }).success).toBe(true);
    // The entry is written result first, then observation, whatever order it came in.
    const swapped = location.parse({ ...cabine, checklist: { ventilacao: { observation: cell('x'), result: cell('C') } } }) as { checklist: Record<string, object> };
    expect(Object.keys(swapped.checklist.ventilacao!)).toEqual(['result', 'observation']);
    expect(entityKeys('location')).toContain('checklist');
  });

  it('refuses a key outside the list, a value that is no cell, and a checklist that is no record', () => {
    expect(location.safeParse({ ...cabine, checklist: { limpeza: { result: cell('C') } } }).success).toBe(false);
    expect(location.safeParse({ ...cabine, checklist: { no_break_de_comando: {} } }).success).toBe(false);
    expect(location.safeParse({ ...cabine, checklist: { ventilacao: { result: 'C' } } }).success).toBe(false);
    expect(location.safeParse({ ...cabine, checklist: { ventilacao: { result: { value: 'C' } } } }).success).toBe(false);
    expect(location.safeParse({ ...cabine, checklist: [] }).success).toBe(false);
    expect(location.safeParse({ ...cabine, checklist: null }).success).toBe(false);
  });

  it('a painel and a coluna never carry one: the key is stripped', () => {
    const checklist = { ventilacao: { result: cell('C') } };
    expect(location.parse({ ...base, parent_id: LOCAL, kind: 'painel', checklist })).toEqual({ ...base, parent_id: LOCAL, kind: 'painel' });
    expect(location.parse({ ...base, parent_id: LOCAL, kind: 'coluna', checklist })).toEqual({ ...base, parent_id: LOCAL, kind: 'coluna' });
  });

  it('`location_id` is optional and nullable on a photo and on a point; a brand file never carries it', () => {
    // A snapshot file carries no `company_id` (AD-10): put one back to read it as a file row.
    const snapshotPhoto = (golden('../../fixtures/porto-seguro/snapshot.golden.json').files as Record<string, unknown>[]).find((row) => row.kind === 'photo');
    const [point] = golden('../../fixtures/porto-seguro/snapshot.golden.json').points as Record<string, unknown>[];
    expect(snapshotPhoto).toBeDefined();
    expect(point).toBeDefined();
    const photo = { ...snapshotPhoto, company_id: RELATORIO };
    for (const value of [LOCAL, null]) {
      expect(entityRowSchemas.file.parse({ ...photo, location_id: value })).toMatchObject({ location_id: value });
      expect(entityRowSchemas.point.parse({ ...point, location_id: value })).toMatchObject({ location_id: value });
    }
    for (const bad of ['not-a-uuid', 7, {}]) {
      expect(entityRowSchemas.file.safeParse({ ...photo, location_id: bad }).success, JSON.stringify(bad)).toBe(false);
      expect(entityRowSchemas.point.safeParse({ ...point, location_id: bad }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(Object.keys(entityRowSchemas.file.parse({ ...photo, kind: 'logo', location_id: LOCAL }))).not.toContain('location_id');
    expect(entityKeys('file')).toContain('location_id');
    expect(entityKeys('point')).toContain('location_id');
  });

  it.each(['../../fixtures/porto-seguro/snapshot.golden.json', '../../fixtures/replay-small/snapshot.golden.json', '../../fixtures/porto-seguro/small/snapshot.golden.json'])(
    'no stored row changes bytes: the locations, files and points of %s parse to themselves',
    (file) => {
      const rows = golden(file);
      expect(rows.locations.length).toBeGreaterThan(0);
      for (const row of rows.locations) {
        const parsed = location.parse(row);
        expect(Object.keys(parsed)).not.toContain('checklist');
        expect(JSON.stringify(sortKeysDeep(parsed))).toBe(JSON.stringify(row));
      }
      for (const row of rows.files as Record<string, unknown>[]) {
        // The snapshot's file shape (no `company_id`). `people_in_photo` is the one key a parse
        // adds to a photo stored before Story 9.3 (a default, as it always did); `location_id` adds none.
        const parsed = snapshotFileSchema.parse(row);
        expect(Object.keys(parsed)).not.toContain('location_id');
        const expected = row.kind === 'photo' ? { people_in_photo: false, ...row } : row;
        expect(JSON.stringify(sortKeysDeep(parsed))).toBe(JSON.stringify(sortKeysDeep(expected)));
      }
      for (const row of rows.points) {
        const parsed = entityRowSchemas.point.parse(row);
        expect(Object.keys(parsed)).not.toContain('location_id');
        expect(JSON.stringify(sortKeysDeep(parsed))).toBe(JSON.stringify(row));
      }
    },
  );
});
