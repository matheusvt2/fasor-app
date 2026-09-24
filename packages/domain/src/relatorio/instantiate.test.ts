import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import { replay } from '../ops/replay.ts';
import { blockConfigSchema, EQUIPMENT_BLOCK_TYPES, type EquipmentBlockType } from '../schemas/block-config.ts';
import { blockRowSchema, type BlockRow, type EquipmentRow, type LocationRow, type RelatorioRow, type TemplateRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate, templateTotals } from '../seed/template.ts';
import { setSectionText, setTypeDefaults, typeConfigFor } from '../templates/compose.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate, RELATORIO_SECTION_TYPES } from './instantiate.ts';
import { integrityFindings } from './integrity.ts';

const TEMPLATE_ID = '019966b0-0043-7000-8000-000000000001';
const deps = () => ({ newId: idSequence('019966b0-0044-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY });
const project = { id: TEST_PROJECT };
const inputs = { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [] };

function drafts(template: TemplateRow = standardTemplate({ id: TEMPLATE_ID })) {
  return instantiateTemplate(template, project, inputs, deps());
}

const valuesOf = <T>(all: readonly { path: string; value: unknown }[], family: string): T[] =>
  all.filter((d) => d.path.startsWith(`${family}/`)).map((d) => d.value as T);

describe('4.1-UNIT instantiateTemplate over the standard template', () => {
  const { relatorioId, drafts: all } = drafts();
  const relatorio = valuesOf<RelatorioRow>(all, 'relatorio')[0]!;
  const locations = valuesOf<LocationRow>(all, 'location');
  const blocks = valuesOf<BlockRow>(all, 'block');
  const equipment = valuesOf<EquipmentRow>(all, 'equipment');
  const sections = blocks.filter((b) => b.location_id === null);
  const sheets = blocks.filter((b) => b.location_id !== null);

  it('is 1 + 23 + 11 + 94 + 94 = 223 creates', () => {
    expect(all).toHaveLength(223);
    expect(all.every((d) => d.kind === 'create')).toBe(true);
    expect(locations).toHaveLength(23);
    expect(locations.filter((l) => l.kind === 'cabine')).toHaveLength(6);
    expect(locations.filter((l) => l.kind === 'coluna')).toHaveLength(17);
    expect(sections).toHaveLength(11);
    expect(sheets).toHaveLength(94);
    expect(equipment).toHaveLength(94);
  });

  it('the relatório copies the template id, version and seed version, in rascunho with the dates', () => {
    expect(relatorio).toMatchObject({
      id: relatorioId,
      project_id: TEST_PROJECT,
      template_id: TEMPLATE_ID,
      template_version: 1,
      seed_version: 'v1',
      status: 'rascunho',
      setup: { service_start: '2026-09-06', service_end: '2026-09-08', responsible_user_id: null },
    });
    expect(all[0]!.path).toBe(`relatorio/${relatorioId}`);
  });

  it('every op carries its scope: relatorio for the relatório, locations and blocks; project for equipment', () => {
    for (const d of all) {
      if (d.path.startsWith('equipment/')) {
        expect(d).toMatchObject({ scope: 'project', project_id: TEST_PROJECT, relatorio_id: null, company_id: TEST_COMPANY, actor_id: TEST_USER });
      } else {
        expect(d).toMatchObject({ scope: 'relatorio', relatorio_id: relatorioId, project_id: null, company_id: TEST_COMPANY, actor_id: TEST_USER });
      }
    }
  });

  it('the cabines carry se/env defaults and agrupar_por_tipo, the colunas hang under 1° Subsolo in order', () => {
    const subsolo = locations.find((l) => l.name === '1° Subsolo')!;
    expect(subsolo).toMatchObject({
      kind: 'cabine',
      parent_id: null,
      agrupar_por_tipo: true,
      se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
      env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    });
    const colunas = sortByOrderKey(locations.filter((l) => l.kind === 'coluna'));
    expect(colunas.every((c) => c.parent_id === subsolo.id)).toBe(true);
    expect(colunas.map((c) => c.name)).toEqual(Array.from({ length: 17 }, (_, n) => `Coluna ${n + 1}`));
    expect(sortByOrderKey(locations.filter((l) => l.kind === 'cabine')).map((c) => c.name)).toEqual([
      'Cubículo Enel',
      '1° Subsolo',
      'Oxigênio',
      'Cobertura A',
      'Cobertura B',
      'Geradores',
    ]);
  });

  it('the eleven section blocks come in FO.SERV-03 order with no location and no equipment, 7 and 9 synthesized', () => {
    expect(sortByOrderKey(sections).map((b) => b.block_type)).toEqual([...RELATORIO_SECTION_TYPES]);
    for (const section of sections) {
      expect(section.equipment_id).toBeNull();
      expect(section.seed_version).toBe('v1');
      expect(blockRowSchema.safeParse(section).success).toBe(true);
    }
    const s2 = sections.find((b) => b.block_type === 'section_2')!;
    expect(s2.config).toEqual({ block_type: 'section_2', sub_blocks: {}, na_defaults: [], section_text: null });
    expect(sections.find((b) => b.block_type === 'section_7')!.config).toEqual({ block_type: 'section_7', sub_blocks: {}, na_defaults: [], section_text: null });
  });

  it('distributes the 94 sheets as templateTotals says and each in its column', () => {
    const totals = templateTotals(standardTemplate({ id: TEMPLATE_ID }));
    const byType = Object.fromEntries(EQUIPMENT_BLOCK_TYPES.map((t) => [t, 0])) as Record<EquipmentBlockType, number>;
    for (const b of sheets) byType[b.block_type as EquipmentBlockType] += 1;
    expect(byType).toEqual(totals);
    expect(totals).toEqual({ chave_seccionadora: 25, disjuntor_mt: 21, tp: 11, tc: 11, transformador_forca: 8, cabos_entrada: 4, cabos_saida: 9, para_raio: 5 });
    const coluna5 = locations.find((l) => l.name === 'Coluna 5')!;
    expect(sortByOrderKey(sheets.filter((b) => b.location_id === coluna5.id)).map((b) => b.block_type)).toEqual(['chave_seccionadora', 'disjuntor_mt']);
    const coluna3 = locations.find((l) => l.name === 'Coluna 3')!;
    expect(sortByOrderKey(sheets.filter((b) => b.location_id === coluna3.id)).map((b) => b.order_key)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    // Every sheet names an equipment row of its own type.
    const byId = new Map(equipment.map((e) => [e.id, e]));
    for (const b of sheets) expect(byId.get(b.equipment_id!)?.type).toBe(b.block_type);
  });

  it('suggests the tags the matrix names and none twice', () => {
    const tags = equipment.map((e) => e.tag);
    expect(tags).toContain('SEC-C05');
    expect(tags).toContain('DJ-C05');
    expect(tags).toContain('SEC-C02');
    expect(tags).toContain('SEC-C02-2');
    expect(tags).toContain('CE-ENEL');
    expect(tags).toContain('CS-SUBSOLO');
    expect(tags).toContain('CE-CA');
    expect(tags).toContain('CE-OXIGENIO');
    expect(tags.filter((t) => /^TR-\d+$/.test(t)).sort()).toEqual(['TR-1', 'TR-2', 'TR-3', 'TR-4', 'TR-5', 'TR-6', 'TR-7', 'TR-8']);
    expect(integrityFindings({ equipment })).toEqual([]);
  });

  it('copies each block config (subtype, role, sub_blocks, na_defaults) from the template block', () => {
    const template = standardTemplate({ id: TEMPLATE_ID });
    const sec = sheets.find((b) => b.block_type === 'chave_seccionadora')!;
    const config = blockConfigSchema.parse(sec.config);
    expect(config.subtype).toBe('manual');
    expect(config.na_defaults).toEqual(typeConfigFor(template.blocks, 'chave_seccionadora')!.na_defaults);
    const enel = locations.find((l) => l.name === 'Cubículo Enel')!;
    const roles = sortByOrderKey(sheets.filter((b) => b.location_id === enel.id)).map((b) => blockConfigSchema.parse(b.config).role ?? null);
    expect(roles).toEqual(['entrada', 'entrada', 'entrada', 'saida', null, null, null, 'saida', 'saida']);
    expect((sec.config as { section_text?: unknown }).section_text).toBeUndefined();
  });

  it('is deterministic: the same id sequence gives equal drafts', () => {
    expect(drafts()).toEqual(drafts());
  });

  it('every id comes from newId, in a fixed order, and every draft passes makeOp', () => {
    const { relatorioId: first, drafts: all } = drafts();
    expect(first).toBe('019966b0-0044-7000-8000-000000000001');
    const ids = new Set<string>();
    for (const d of all) ids.add((d.value as { id: string }).id);
    expect(ids.size).toBe(223);
    const stamped = all.map((d) => makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0045-7000-8000-'), now: T0 }));
    expect(stamped).toHaveLength(223);
  });

  it('skips an orphan template block, exactly as templateTotals does', () => {
    const template = standardTemplate({ id: TEMPLATE_ID });
    const orphaned = { ...template, blocks: [...template.blocks, { ...template.blocks.at(-1)!, skeleton_location_ref: 'nowhere' }] };
    expect(drafts(orphaned).drafts).toHaveLength(223);
    expect(templateTotals(orphaned)).toEqual(templateTotals(template));
  });

  it('feeds suggestTag the project equipment it already knows', () => {
    const existing = [{ tag: 'SEC-C05', removed_at: null }, { tag: 'TR-1', removed_at: null }];
    const { drafts: all } = instantiateTemplate(standardTemplate({ id: TEMPLATE_ID }), project, { ...inputs, existingEquipment: existing }, deps());
    const tags = valuesOf<EquipmentRow>(all, 'equipment').map((e) => e.tag);
    expect(tags).toContain('SEC-C05-2');
    expect(tags).not.toContain('SEC-C05');
    expect(tags).not.toContain('TR-1');
    expect(tags).toContain('TR-9');
  });
});

describe('4.1-UNIT the drafts replay into a snapshot', () => {
  it('applyOp accepts every create and buildSnapshot sees 94 equipment, 105 blocks, 23 locations', () => {
    const { relatorioId, drafts: all } = drafts();
    const ops = all.map((d) => makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0046-7000-8000-'), now: T0 }));
    const state = replay(ops.map((op, i) => ({ ...op, seq: i + 1 })));
    const snapshot = buildSnapshot(state, relatorioId);
    expect(snapshot.equipment).toHaveLength(94);
    expect(snapshot.blocks).toHaveLength(105);
    expect(snapshot.locations).toHaveLength(23);
    expect(snapshot.relatorio.template_version).toBe(1);
  });
});

describe('4.1-UNIT FR-13: a template edited after instantiation leaves the relatório untouched (copy-on-create)', () => {
  it('editing the template section_text, type defaults and name bumps its version and changes no block config', () => {
    const template = standardTemplate({ id: TEMPLATE_ID });
    const { relatorioId, drafts: all } = drafts(template);
    const ops = all.map((d) => makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0047-7000-8000-'), now: T0 }));
    let state: EntityState = new Map();
    state = applyOp(new Map(state), makeOp({ kind: 'create', scope: 'company', company_id: TEST_COMPANY, project_id: null, relatorio_id: null, path: `template/${TEMPLATE_ID}`, value: template as never, prev_op_id: null, batch_id: null, meta: null, actor_id: TEST_USER, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0048-7000-8000-'), now: T0 }));
    for (const op of ops) state = applyOp(state, op);
    const before = new Map([...state].filter(([key]) => !key.startsWith('template:')).map(([key, row]) => [key, JSON.stringify(row)]));

    // The template changes: section 2 gets its own text, every seccionadora loses its
    // nameplate sub-block and the template is renamed.
    const sectionIndex = template.blocks.filter((b) => b.block_type.startsWith('section_')).findIndex((b) => b.block_type === 'section_2');
    const edited = setSectionText(template.blocks, sectionIndex, 'Texto novo {cliente}');
    const config = typeConfigFor(edited, 'chave_seccionadora')!;
    config.sub_blocks.nameplate = { enabled: false };
    const puts = [
      ['blocks', setTypeDefaults(edited, 'chave_seccionadora', config)],
      ['name', 'Outro nome'],
    ] as const;
    const factory = idSequence('019966b0-0049-7000-8000-');
    for (const [field, value] of puts) {
      state = applyOp(state, makeOp({ kind: 'put', scope: 'company', company_id: TEST_COMPANY, project_id: null, relatorio_id: null, path: `template/${TEMPLATE_ID}/${field}`, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: TEST_USER, device_id: 'tablet-test' }, { newId: factory, now: T0 }));
    }
    expect((state.get(entityKey('template', TEMPLATE_ID)) as TemplateRow).version).toBe(3);

    // Not one relatório-side row changed.
    for (const [key, row] of state) {
      if (key.startsWith('template:')) continue;
      expect(JSON.stringify(row), key).toBe(before.get(key));
    }
    const snapshot = buildSnapshot(state, relatorioId);
    expect(snapshot.relatorio.template_version).toBe(1);
    const s2 = snapshot.blocks.find((b) => b.block_type === 'section_2')!;
    expect((s2.config as { section_text: unknown }).section_text).toBeNull();
    const sec = snapshot.blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    expect(blockConfigSchema.parse(sec.config).sub_blocks.nameplate).toEqual({ enabled: true });
  });
});
