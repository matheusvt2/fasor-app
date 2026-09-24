import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ENTITIES, ENTITY_SCOPE, entityKeys, entityRowSchemas, registryKeys, type Entity } from './entities.ts';

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
