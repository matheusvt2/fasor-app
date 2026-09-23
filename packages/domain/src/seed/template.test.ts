import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { applyOp } from '../ops/apply.ts';
import { templateRowSchema } from '../schemas/entities.ts';
import { blockConfigSchema } from '../schemas/block-config.ts';
import { defaultBlockConfig, STANDARD_TEMPLATE_NAME, standardTemplate, templateTotals } from './template.ts';

const ID = '019966b0-0000-7000-8000-0000000000f1';
const template = standardTemplate({ id: ID });

const blocksAt = (ref: string) => template.blocks.filter((b) => b.skeleton_location_ref === ref);
const quantities = (ref: string) => {
  const out: Record<string, number> = {};
  for (const block of blocksAt(ref)) out[block.block_type] = (out[block.block_type] ?? 0) + block.quantity;
  return out;
};

describe('standardTemplate', () => {
  it('is a valid template row named "Cabine primária — padrão" on seed v1', () => {
    expect(templateRowSchema.parse(template)).toEqual(template);
    expect(template).toMatchObject({ id: ID, name: STANDARD_TEMPLATE_NAME, version: 1, seed_version: 'v1', removed_at: null });
    expect(STANDARD_TEMPLATE_NAME).toBe('Cabine primária — padrão');
  });

  it('is pure: the same id builds the same row', () => {
    expect(standardTemplate({ id: ID })).toEqual(template);
  });

  it('starts with the section blocks 1-6, 8, 10 and 11 in order, outside the skeleton', () => {
    const sections = template.blocks.filter((b) => b.block_type.startsWith('section_'));
    expect(sections.map((b) => b.block_type)).toEqual([
      'section_1',
      'section_2',
      'section_3',
      'section_4',
      'section_5',
      'section_6',
      'section_8',
      'section_10',
      'section_11',
    ]);
    expect(template.blocks.slice(0, 9)).toEqual(sections);
    for (const block of sections) {
      expect(block).toEqual({ block_type: block.block_type, sub_blocks: {}, na_defaults: [], quantity: 1, skeleton_location_ref: null });
    }
  });

  it('has the skeleton of the reference job', () => {
    const cabines = template.skeleton.filter((n) => n.kind === 'cabine');
    expect(cabines.map((n) => n.name)).toEqual(['Cubículo Enel', '1° Subsolo', 'Oxigênio', 'Cobertura A', 'Cobertura B', 'Geradores']);
    const colunas = template.skeleton.filter((n) => n.kind === 'coluna');
    expect(colunas.map((n) => n.name)).toEqual(Array.from({ length: 17 }, (_, i) => `Coluna ${i + 1}`));
    for (const coluna of colunas) expect(coluna.parent_ref).toBe('subsolo-1');
    expect(new Set(template.skeleton.map((n) => n.ref)).size).toBe(template.skeleton.length);
  });

  it('turns agrupar_por_tipo on only for 1° Subsolo and Geradores', () => {
    const grouped = template.skeleton.filter((n) => n.kind === 'cabine' && n.agrupar_por_tipo).map((n) => n.name);
    expect(grouped).toEqual(['1° Subsolo', 'Geradores']);
  });

  it('places every equipment block on a skeleton node', () => {
    const refs = new Set(template.skeleton.map((n) => n.ref));
    for (const block of template.blocks.filter((b) => !b.block_type.startsWith('section_'))) {
      expect(refs.has(block.skeleton_location_ref!)).toBe(true);
    }
  });

  it('totals the reference job: 25/21/11/11/8/4/9/5', () => {
    expect(templateTotals(template)).toEqual({
      chave_seccionadora: 25,
      disjuntor_mt: 21,
      tp: 11,
      tc: 11,
      transformador_forca: 8,
      cabos_entrada: 4,
      cabos_saida: 9,
      para_raio: 5,
    });
  });

  it('places the per-location quantities of the Design Notes', () => {
    expect(quantities('enel')).toEqual({
      cabos_entrada: 1,
      para_raio: 2,
      chave_seccionadora: 2,
      tp: 1,
      tc: 1,
      disjuntor_mt: 1,
      cabos_saida: 1,
    });
    expect(quantities('subsolo-1')).toEqual({ transformador_forca: 5, cabos_saida: 5 });
    const perColumn = (type: string) =>
      Array.from({ length: 17 }, (_, i) => quantities(`subsolo-1/coluna-${i + 1}`)[type] ?? 0);
    //                                               1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17
    expect(perColumn('chave_seccionadora')).toEqual([1, 2, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1]);
    expect(perColumn('disjuntor_mt')).toEqual([0, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0]);
    expect(perColumn('tp')).toEqual([0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0]);
    expect(perColumn('tc')).toEqual(perColumn('tp'));
    expect(quantities('oxigenio')).toEqual({
      cabos_entrada: 1,
      chave_seccionadora: 1,
      para_raio: 1,
      cabos_saida: 1,
      transformador_forca: 1,
    });
    const cobertura = {
      cabos_entrada: 1,
      para_raio: 1,
      chave_seccionadora: 1,
      disjuntor_mt: 1,
      cabos_saida: 1,
      transformador_forca: 1,
    };
    expect(quantities('cobertura-a')).toEqual(cobertura);
    expect(quantities('cobertura-b')).toEqual(cobertura);
    expect(quantities('geradores')).toEqual({ chave_seccionadora: 7, disjuntor_mt: 4, tp: 4, tc: 4 });
  });

  it('carries the roles of the Design Notes', () => {
    const roles = (ref: string, type: string) => blocksAt(ref).filter((b) => b.block_type === type).map((b) => b.role ?? null);
    expect(roles('enel', 'cabos_entrada')).toEqual(['entrada']);
    expect(roles('enel', 'para_raio')).toEqual(['entrada', 'saida']);
    expect(roles('enel', 'chave_seccionadora')).toEqual(['entrada', 'saida']);
    expect(roles('enel', 'cabos_saida')).toEqual(['saida']);
    expect(roles('subsolo-1', 'cabos_saida')).toEqual(['alimentacao']);
    expect(roles('oxigenio', 'para_raio')).toEqual(['saida']);
    expect(roles('cobertura-a', 'para_raio')).toEqual(['entrada']);
    expect(roles('cobertura-b', 'para_raio')).toEqual(['entrada']);
  });

  it('makes every seccionadora manual, with MOTOR and FUSÍVEIS NA by default, and no other subtype', () => {
    for (const block of template.blocks) {
      if (block.block_type === 'chave_seccionadora') {
        expect(block.subtype).toBe('manual');
        expect(block.na_defaults).toEqual(['motor', 'fusiveis']);
      } else {
        expect(block.subtype).toBeUndefined();
        expect(block.na_defaults).toEqual([]);
      }
    }
  });

  it('switches "IA e IP lidos do visor" off everywhere it applies, and every other sub-block on', () => {
    let withIaIp = 0;
    for (const block of template.blocks) {
      for (const [key, config] of Object.entries(block.sub_blocks)) {
        expect(config.enabled, `${block.block_type}/${key}`).toBe(key !== 'ia_ip_display');
      }
      if (block.sub_blocks.ia_ip_display !== undefined) withIaIp += block.quantity;
    }
    // cabos de entrada 4 + cabos de saída 9 + para-raios 5 + TP 11 + TC 11 + transformadores 8
    expect(withIaIp).toBe(48);
  });

  it('is created through one template/{id} create op that applyOp accepts', () => {
    const op = makeOp(
      {
        kind: 'create',
        scope: 'company',
        company_id: '019966b0-0000-7000-8000-0000000000c1',
        project_id: null,
        relatorio_id: null,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: 'system:identity',
        device_id: 'server',
        path: `template/${ID}`,
        value: template,
      },
      { newId: () => '019966b0-0000-7000-8000-0000000000e1', now: new Date('2026-09-22T12:00:00Z') },
    );
    const state = applyOp(new Map(), op);
    expect(state.get(`template:${ID}`)).toEqual(template);
  });
});

describe('defaultBlockConfig', () => {
  it('builds a valid BlockConfig for every block type', () => {
    expect(blockConfigSchema.parse(defaultBlockConfig('v1', 'tp'))).toEqual({
      block_type: 'tp',
      sub_blocks: {
        nameplate: { enabled: true },
        checklist: { enabled: true },
        isolacao: { enabled: true },
        ia_ip_display: { enabled: false },
        relacao_transformacao: { enabled: true },
        observations: { enabled: true },
        conclusion: { enabled: true },
      },
      na_defaults: [],
    });
    expect(defaultBlockConfig('v1', 'tp', { subtype: 'a_seco' }).na_defaults).toHaveLength(8);
    expect(defaultBlockConfig('v1', 'section_5')).toEqual({ block_type: 'section_5', sub_blocks: {}, na_defaults: [] });
  });

  it('refuses a malformed BlockConfig', () => {
    expect(blockConfigSchema.safeParse({ block_type: 'foo', sub_blocks: {}, na_defaults: [] }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ block_type: 'tp', sub_blocks: { bogus: { enabled: true } }, na_defaults: [] }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ block_type: 'tp', sub_blocks: {}, na_defaults: ['bogus'] }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ block_type: 'tp', role: 'lado', sub_blocks: {}, na_defaults: [] }).success).toBe(false);
  });
});

describe('templateRowSchema cross-field rules', () => {
  type Row = ReturnType<typeof standardTemplate>;
  const clone = (): Row => structuredClone(template);
  const firstOf = (row: Row, type: string) => row.blocks.find((b) => b.block_type === type)!;
  const rejects = (row: Row, message: RegExp) => {
    const result = templateRowSchema.safeParse(row);
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.message).join('\n')).toMatch(message);
  };

  it('accepts the standard template and an empty one', () => {
    expect(templateRowSchema.safeParse(template).success).toBe(true);
    expect(templateRowSchema.safeParse({ ...template, blocks: [], skeleton: [] }).success).toBe(true);
  });

  it('refuses a section block with a subtype, a role, sub-blocks, NA defaults or a skeleton ref', () => {
    let row = clone();
    Object.assign(firstOf(row, 'section_1'), { subtype: 'manual' });
    rejects(row, /section block has no subtype/);
    row = clone();
    Object.assign(firstOf(row, 'section_1'), { role: 'entrada' });
    rejects(row, /section block has no role/);
    row = clone();
    firstOf(row, 'section_1').sub_blocks = { checklist: { enabled: true } };
    rejects(row, /section block has no sub-blocks/);
    row = clone();
    firstOf(row, 'section_1').na_defaults = ['motor'];
    rejects(row, /section block has no NA defaults/);
    row = clone();
    firstOf(row, 'section_1').skeleton_location_ref = 'enel';
    rejects(row, /section block sits outside the skeleton/);
  });

  it('refuses a subtype the block type does not have', () => {
    const row = clone();
    Object.assign(firstOf(row, 'tp'), { subtype: 'manual' });
    rejects(row, /tp has no subtype "manual"/);
  });

  it('refuses a sub-block the block type does not have, and a locked one switched off', () => {
    let row = clone();
    firstOf(row, 'chave_seccionadora').sub_blocks.relacao_transformacao = { enabled: true };
    rejects(row, /chave_seccionadora has no sub-block "relacao_transformacao"/);
    row = clone();
    firstOf(row, 'tp').sub_blocks.checklist = { enabled: false };
    rejects(row, /"checklist" is always on/);
    row = clone();
    firstOf(row, 'tp').sub_blocks.conclusion = { enabled: false };
    rejects(row, /"conclusion" is always on/);
    row = clone();
    delete firstOf(row, 'tp').sub_blocks.checklist;
    rejects(row, /"checklist" is always on and must be present/);
  });

  it('refuses an NA default that is not an item of the block type', () => {
    const row = clone();
    firstOf(row, 'disjuntor_mt').na_defaults = ['motor'];
    rejects(row, /"motor" is not an item of disjuntor_mt/);
  });

  it('refuses an equipment block with no skeleton ref', () => {
    const row = clone();
    firstOf(row, 'tp').skeleton_location_ref = null;
    rejects(row, /tp must sit on a node of the skeleton/);
  });

  it('accepts an equipment block whose node is gone from the skeleton: an orphan two devices can fold into (Story 3.4)', () => {
    const row = clone();
    firstOf(row, 'tp').skeleton_location_ref = 'nowhere';
    expect(templateRowSchema.safeParse(row).success).toBe(true);
    // Every reader ignores it: the totals count only blocks that sit on a live node.
    expect(templateTotals(row).tp).toBe(templateTotals(template).tp - 1);
  });

  it('refuses duplicate skeleton refs and a coluna not under a cabine', () => {
    let row = clone();
    row.skeleton.push({ ref: 'enel', kind: 'cabine', parent_ref: null, name: 'Outra', agrupar_por_tipo: false });
    rejects(row, /duplicate skeleton ref "enel"/);
    row = clone();
    row.skeleton.push({ ref: 'solta', kind: 'coluna', parent_ref: 'subsolo-1/coluna-1', name: 'Solta' });
    rejects(row, /coluna "solta" must sit under a cabine/);
    row = clone();
    row.skeleton.push({ ref: 'orfa', kind: 'coluna', parent_ref: 'nenhum', name: 'Órfã' });
    rejects(row, /coluna "orfa" must sit under a cabine/);
  });
});
