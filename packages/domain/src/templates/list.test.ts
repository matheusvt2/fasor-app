import { describe, expect, it } from 'vitest';
import type { RelatorioSummary } from '../contract/sync.ts';
import { templateRowSchema, type TemplateRow } from '../schemas/entities.ts';
import { standardTemplate } from '../seed/template.ts';
import {
  activeTemplates,
  archivedHeading,
  archivedTemplates,
  duplicateTemplate,
  emptyTemplate,
  pickableTemplates,
  sortTemplates,
  templatesHeading,
  templateUseCount,
} from './list.ts';

const row = (id: string, name: string, removed_at: string | null = null, archived_at: string | null = null): TemplateRow => ({
  id,
  name,
  version: 1,
  seed_version: 'v1',
  blocks: [],
  skeleton: [],
  archived_at,
  removed_at,
});

const ids = (rows: readonly TemplateRow[]) => rows.map((r) => r.id);

const A = '019966b0-0033-7000-8000-000000000001';
const B = '019966b0-0033-7000-8000-000000000002';
const C = '019966b0-0033-7000-8000-000000000003';
const D = '019966b0-0033-7000-8000-000000000004';
const E = '019966b0-0033-7000-8000-000000000005';
const AT = '2026-09-20T10:00:00.000Z';

describe('templatesHeading and archivedHeading', () => {
  it('read "Templates (n)" and "Arquivados (n)" as the mock headings do', () => {
    expect(templatesHeading(0)).toBe('Templates (0)');
    expect(templatesHeading(2)).toBe('Templates (2)');
    expect(archivedHeading(1)).toBe('Arquivados (1)');
  });
});

describe('sortTemplates', () => {
  it('lists live templates by pt-BR name, ties by id, and never a removed one', () => {
    const rows = [row(C, 'Porto Seguro'), row(B, 'Cabine primária — padrão'), row(A, 'Cabine primária — padrão'), row(D, 'Antigo', AT)];
    expect(ids(sortTemplates(rows))).toEqual([A, B, C]);
  });
});

describe('3.3-UNIT active, archived and pickable templates', () => {
  const rows = [
    row(A, 'Zeta'),
    row(B, 'Alfa'),
    row(C, 'Arquivado depois', null, AT),
    row(D, 'Removido', AT),
    row(E, 'Removido e arquivado', AT, AT),
  ];

  it('splits the live templates into active and archived, each by name', () => {
    expect(ids(activeTemplates(rows))).toEqual([B, A]);
    expect(ids(archivedTemplates(rows))).toEqual([C]);
  });

  it('never offers an archived or a removed template to the relatório creation picker', () => {
    expect(ids(pickableTemplates(rows))).toEqual([B, A]);
  });
});

describe('3.3-UNIT templateUseCount', () => {
  const summary = (id: string, template_id: string | null): RelatorioSummary => ({
    id,
    project_id: 'p',
    status: 'em_campo',
    template_id,
    seed_version: 'v1',
    updated_seq: 1,
  });

  it('counts the relatórios of the company summary created from the template', () => {
    const summaries = [summary('r1', A), summary('r2', A), summary('r3', B), summary('r4', null)];
    expect(templateUseCount(A, summaries)).toBe(2);
    expect(templateUseCount(B, summaries)).toBe(1);
    expect(templateUseCount(C, summaries)).toBe(0);
    expect(templateUseCount(A, [])).toBe(0);
  });
});

describe('3.3-UNIT duplicateTemplate', () => {
  it('copies blocks, skeleton and seed version deep under a new id named "⟨nome⟩ — cópia"', () => {
    const source = { ...standardTemplate({ id: A }), version: 4, archived_at: AT };
    const copy = duplicateTemplate(source, B);
    expect(copy).toMatchObject({ id: B, name: 'Cabine primária — padrão — cópia', version: 1, archived_at: null, removed_at: null });
    expect(copy.blocks).toEqual(source.blocks);
    expect(copy.skeleton).toEqual(source.skeleton);
    expect(copy.seed_version).toBe(source.seed_version);
    expect(copy.blocks).not.toBe(source.blocks);
    expect(copy.blocks[20]).not.toBe(source.blocks[20]);
    expect(templateRowSchema.parse(copy)).toEqual(copy);
  });
});

describe('3.3-UNIT emptyTemplate', () => {
  it('is an empty composition named "Novo template" on the given seed', () => {
    const empty = emptyTemplate(C, 'v1');
    expect(empty).toEqual({
      id: C,
      name: 'Novo template',
      version: 1,
      seed_version: 'v1',
      blocks: [],
      skeleton: [],
      archived_at: null,
      removed_at: null,
    });
    expect(templateRowSchema.parse(empty)).toEqual(empty);
  });

  it('a row written before archived_at existed parses with archived_at null', () => {
    const { archived_at: _, ...legacy } = emptyTemplate(C, 'v1');
    expect(templateRowSchema.parse(legacy).archived_at).toBeNull();
  });
});
