import { describe, expect, it } from 'vitest';
import type { TemplateRow } from '../schemas/entities.ts';
import { sortTemplates, templatesHeading } from './list.ts';

const row = (id: string, name: string, removed_at: string | null = null): TemplateRow => ({
  id,
  name,
  version: 1,
  seed_version: 'v1',
  blocks: [],
  skeleton: [],
  removed_at,
});

describe('templatesHeading', () => {
  it('reads "Templates (n)" as the mock heading does', () => {
    expect(templatesHeading(0)).toBe('Templates (0)');
    expect(templatesHeading(2)).toBe('Templates (2)');
  });
});

describe('sortTemplates', () => {
  it('lists live templates by pt-BR name, ties by id, and never a removed one', () => {
    const rows = [
      row('019966b0-0000-7000-8000-000000000003', 'Porto Seguro'),
      row('019966b0-0000-7000-8000-000000000002', 'Cabine primária — padrão'),
      row('019966b0-0000-7000-8000-000000000001', 'Cabine primária — padrão'),
      row('019966b0-0000-7000-8000-000000000004', 'Antigo', '2026-09-20T10:00:00.000Z'),
    ];
    expect(sortTemplates(rows).map((r) => r.id)).toEqual([
      '019966b0-0000-7000-8000-000000000001',
      '019966b0-0000-7000-8000-000000000002',
      '019966b0-0000-7000-8000-000000000003',
    ]);
  });
});
