import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import { replay } from '../ops/replay.ts';
import { blockConfigSchema, EQUIPMENT_BLOCK_TYPES, type EquipmentBlockType } from '../schemas/block-config.ts';
import { blockRowSchema, type BlockRow, type EquipmentRow, type LocationRow, type RelatorioRow, type TemplateRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate, templateTotals } from '../seed/template.ts';
import { EMPTY_DEFINITION_CONTEXT, SEED_VERSION } from '../seed/definitions.ts';
import { addCabine, addColuna, addPainel, setQuantity, setSectionText, setTypeDefaults, typeConfigFor } from '../templates/compose.ts';
import { templateFromRelatorio } from '../templates/from-relatorio.ts';
import { emptyTemplate } from '../templates/list.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate, RELATORIO_SECTION_TYPES } from './instantiate.ts';
import { integrityFindings } from './integrity.ts';
import { newBlockOrderKey, newEquipmentBlock } from './tree.ts';

const TEMPLATE_ID = '019966b0-0043-7000-8000-000000000001';
const deps = () => ({ newId: idSequence('019966b0-0044-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY });
const project = { id: TEST_PROJECT };
// Story 24.8: the cases below were written for the TAG rule before it, so they pass it (`tagRule: 'legacy'`); 24.8-UNIT and 24.21-UNIT run the current rule.
const inputs = { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' as const };

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
      seed_version: SEED_VERSION,
      status: 'rascunho',
      setup: {
        service_start: '2026-09-06',
        service_end: '2026-09-08',
        responsible_user_id: null,
        escopo: null,
        exclusions: null,
        additional_info: null,
        art_trt_number: null,
        instrument_ids: [],
        site_altitude_m: null,
        site_altitude_na: false,
        site_altitude_confirmed: false,
        next_intervention_date: null,
        next_intervention_justification: null,
      },
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
    // Story 20.3 (FR-17): RELATÓRIOS DOS ENSAIOS (section_9) at position 8, PONTOS DE ATENÇÃO (section_8) at 9.
    expect(sortByOrderKey(sections).map((b) => b.block_type)).toEqual(RELATORIO_SECTION_TYPES.map((type) => (type === 'section_8' ? 'section_9' : type === 'section_9' ? 'section_8' : type)));
    expect(sortByOrderKey(sections).map((b) => b.block_type).slice(6, 9)).toEqual(['section_7', 'section_9', 'section_8']);
    for (const section of sections) {
      expect(section.equipment_id).toBeNull();
      expect(section.seed_version).toBe(SEED_VERSION);
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
    // The standard template holds none of the library type (seed v5).
    expect(totals).toEqual({ chave_seccionadora: 25, disjuntor_mt: 21, tp: 11, tc: 11, transformador_forca: 8, cabos_entrada: 4, cabos_saida: 9, para_raio: 5, chave_transferencia_automatica: 0, quadro_eletrico: 0, inspecao_qgbt: 0, malha_aterramento: 0 });
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

  it('feeds suggestTag the project equipment it already knows when the type differs (nothing to reuse)', () => {
    const existing = [
      { id: PRIOR(1), tag: 'SEC-C05', type: 'tp', removed_at: null },
      { id: PRIOR(2), tag: 'TR-1', type: 'tc', removed_at: null },
    ];
    const { drafts: all } = instantiateTemplate(standardTemplate({ id: TEMPLATE_ID }), project, { ...inputs, existingEquipment: existing }, deps());
    const created = valuesOf<EquipmentRow>(all, 'equipment');
    const tags = created.map((e) => e.tag);
    expect(created).toHaveLength(94);
    expect(tags).toContain('SEC-C05-2');
    expect(tags).not.toContain('SEC-C05');
    expect(tags).not.toContain('TR-1');
    expect(tags).toContain('TR-9');
  });

  it('writes the responsável técnico it is given into the setup (Q2)', () => {
    const { drafts: all } = instantiateTemplate(standardTemplate({ id: TEMPLATE_ID }), project, { ...inputs, responsible_user_id: TEST_USER }, deps());
    expect(valuesOf<RelatorioRow>(all, 'relatorio')[0]!.setup.responsible_user_id).toBe(TEST_USER);
  });
});

const PRIOR = (n: number) => `019966b0-0050-7000-8000-${n.toString(16).padStart(12, '0')}`;

/** One cabine with Coluna 5 holding `sec` seccionadoras and one disjuntor, plus the standard sections. */
function coluna5Template(sec: number): TemplateRow {
  const standard = standardTemplate({ id: TEMPLATE_ID });
  const coluna5 = 'subsolo-1/coluna-5';
  return {
    ...standard,
    skeleton: standard.skeleton.filter((node) => node.ref === 'subsolo-1' || node.ref === coluna5),
    blocks: standard.blocks
      .filter((block) => block.skeleton_location_ref === null || block.skeleton_location_ref === coluna5)
      .map((block) => (block.block_type === 'chave_seccionadora' ? { ...block, quantity: sec } : block)),
  };
}

const sheetsOf = (all: readonly { path: string; value: unknown }[]) => valuesOf<BlockRow>(all, 'block').filter((b) => b.location_id !== null);

describe('Epic 4 QA Q4: a later relatório of the obra reuses the project live equipment', () => {
  it('the second relatório of the standard template creates no equipment: 94 blocks bound to the first one ids, same TAGs', () => {
    const template = standardTemplate({ id: TEMPLATE_ID });
    const first = instantiateTemplate(template, project, inputs, deps());
    const firstEquipment = valuesOf<EquipmentRow>(first.drafts, 'equipment');
    const second = instantiateTemplate(template, project, { ...inputs, existingEquipment: firstEquipment }, { ...deps(), newId: idSequence('019966b0-0051-7000-8000-') });

    expect(valuesOf<EquipmentRow>(second.drafts, 'equipment')).toHaveLength(0);
    const firstSheets = sheetsOf(first.drafts);
    const secondSheets = sheetsOf(second.drafts);
    expect(secondSheets).toHaveLength(94);
    expect(second.drafts).toHaveLength(1 + 23 + 11 + 94);
    // Position by position (skeleton order), the same equipment id and so the same TAG.
    expect(secondSheets.map((b) => b.equipment_id)).toEqual(firstSheets.map((b) => b.equipment_id));
    expect(new Set(secondSheets.map((b) => b.equipment_id)).size).toBe(94);
    const tagOf = new Map(firstEquipment.map((e) => [e.id, e.tag]));
    expect(secondSheets.map((b) => tagOf.get(b.equipment_id!))).toEqual(firstSheets.map((b) => tagOf.get(b.equipment_id!)));
  });

  it('partial reuse: SEC-C05 is reused, the removed SEC-C05-2 is neither reused nor taken, a DJ-C05 of another type is not reused', () => {
    const existing = [
      { id: PRIOR(1), tag: 'SEC-C05', type: 'chave_seccionadora', removed_at: null },
      { id: PRIOR(2), tag: 'SEC-C05-2', type: 'chave_seccionadora', removed_at: '2026-09-20T10:00:00.000Z' },
      { id: PRIOR(3), tag: 'DJ-C05', type: 'tp', removed_at: null },
    ];
    const { drafts: all } = instantiateTemplate(coluna5Template(2), project, { ...inputs, existingEquipment: existing }, deps());
    const created = valuesOf<EquipmentRow>(all, 'equipment');
    expect(created.map((e) => [e.tag, e.type])).toEqual([
      ['SEC-C05-2', 'chave_seccionadora'],
      ['DJ-C05-2', 'disjuntor_mt'],
    ]);
    const sheets = sortByOrderKey(sheetsOf(all));
    expect(sheets.map((b) => b.block_type)).toEqual(['chave_seccionadora', 'chave_seccionadora', 'disjuntor_mt']);
    expect(sheets[0]!.equipment_id).toBe(PRIOR(1));
    expect(sheets[1]!.equipment_id).toBe(created[0]!.id);
    expect(sheets[2]!.equipment_id).toBe(created[1]!.id);
    expect(sheets.map((b) => b.equipment_id)).not.toContain(PRIOR(2));
    expect(sheets.map((b) => b.equipment_id)).not.toContain(PRIOR(3));
  });

  it('never binds one equipment twice: two SEC in Coluna 5 and only SEC-C05 in the project', () => {
    const existing = [{ id: PRIOR(1), tag: 'SEC-C05', type: 'chave_seccionadora', removed_at: null }];
    const { drafts: all } = instantiateTemplate(coluna5Template(2), project, { ...inputs, existingEquipment: existing }, deps());
    const created = valuesOf<EquipmentRow>(all, 'equipment');
    expect(created.map((e) => e.tag)).toEqual(['SEC-C05-2', 'DJ-C05']);
    const sheets = sortByOrderKey(sheetsOf(all));
    expect(sheets[0]!.equipment_id).toBe(PRIOR(1));
    expect(sheets[1]!.equipment_id).toBe(created[0]!.id);
  });

  it('matches a TAG case-insensitively and keeps the prior row as it is', () => {
    const existing = [{ id: PRIOR(1), tag: 'sec-c05', type: 'chave_seccionadora', removed_at: null }];
    const { drafts: all } = instantiateTemplate(coluna5Template(1), project, { ...inputs, existingEquipment: existing }, deps());
    expect(valuesOf<EquipmentRow>(all, 'equipment').map((e) => e.tag)).toEqual(['DJ-C05']);
    expect(sheetsOf(all).find((b) => b.block_type === 'chave_seccionadora')!.equipment_id).toBe(PRIOR(1));
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

describe('14.2-UNIT instantiateTemplate: Local › Painel › Coluna', () => {
  /**
   * The template of the story's end-to-end: one local (Função transformação) holding two
   * transformers directly and one painel with three colunas, one seccionadora each; plus a
   * second painel with its own "Coluna 5" for the TAG collision.
   */
  function template(): TemplateRow {
    let skeleton = addCabine([], 'loc', 'Cabine de transformação', 'transformacao');
    skeleton = addPainel(skeleton, 'loc', 'P1', 'Painel de média tensão');
    for (const n of [1, 2, 3]) skeleton = addColuna(skeleton, 'P1', `P1/c${n}`, `Coluna ${n}`);
    skeleton = addCabine(skeleton, 'outro', 'Geradores');
    skeleton = addPainel(skeleton, 'outro', 'A', 'Painel A');
    skeleton = addColuna(skeleton, 'A', 'A/c5', 'Coluna 5');
    skeleton = addPainel(skeleton, 'outro', 'B', 'Painel B');
    skeleton = addColuna(skeleton, 'B', 'B/c5', 'Coluna 5');
    let row: TemplateRow = { ...emptyTemplate(TEMPLATE_ID, 'v3'), skeleton };
    row = { ...row, blocks: setQuantity(row, 'loc', 'transformador_forca', 2, EMPTY_DEFINITION_CONTEXT) };
    for (const ref of ['P1/c1', 'P1/c2', 'P1/c3', 'A/c5', 'B/c5']) row = { ...row, blocks: setQuantity(row, ref, 'chave_seccionadora', 1, EMPTY_DEFINITION_CONTEXT) };
    return row;
  }
  const { relatorioId, drafts: all } = drafts(template());
  const locations = valuesOf<LocationRow>(all, 'location');
  const sheets = valuesOf<BlockRow>(all, 'block').filter((b) => b.location_id !== null);
  const equipment = valuesOf<EquipmentRow>(all, 'equipment');
  const named = (name: string, parent?: string) => locations.find((l) => l.name === name && (parent === undefined || l.parent_id === parent))!;
  const tagOf = (block: BlockRow) => equipment.find((e) => e.id === block.equipment_id)!.tag;

  it('creates the three kinds: each local, then its painéis with their colunas, a painel under its local and a coluna under its painel', () => {
    expect(locations.map((l) => l.kind)).toEqual(['cabine', 'painel', 'coluna', 'coluna', 'coluna', 'cabine', 'painel', 'coluna', 'painel', 'coluna']);
    const local = named('Cabine de transformação');
    const p1 = named('Painel de média tensão');
    expect(local.parent_id).toBeNull();
    expect(p1).toEqual({ id: p1.id, relatorio_id: relatorioId, parent_id: local.id, name: 'Painel de média tensão', order_key: 'a0', removed_at: null, kind: 'painel' });
    expect(sortByOrderKey(locations.filter((l) => l.parent_id === p1.id)).map((l) => [l.kind, l.name])).toEqual([
      ['coluna', 'Coluna 1'],
      ['coluna', 'Coluna 2'],
      ['coluna', 'Coluna 3'],
    ]);
    const outro = named('Geradores');
    expect(sortByOrderKey(locations.filter((l) => l.parent_id === outro.id)).map((l) => [l.kind, l.name])).toEqual([
      ['painel', 'Painel A'],
      ['painel', 'Painel B'],
    ]);
  });

  it('carries the Função onto the cabine row, and stores no funcao key for a local that holds none', () => {
    expect(named('Cabine de transformação')).toMatchObject({ kind: 'cabine', funcao: 'transformacao', agrupar_por_tipo: false });
    expect(Object.keys(named('Geradores'))).not.toContain('funcao');
  });

  it('places each block on the local itself or on its coluna, never on a painel, with the TAGs of the kernel rule', () => {
    const local = named('Cabine de transformação');
    const p1 = named('Painel de média tensão');
    const onLocal = sortByOrderKey(sheets.filter((b) => b.location_id === local.id));
    expect(onLocal.map((b) => [b.block_type, tagOf(b)])).toEqual([
      ['transformador_forca', 'TR-1'],
      ['transformador_forca', 'TR-2'],
    ]);
    const colunas = sortByOrderKey(locations.filter((l) => l.parent_id === p1.id));
    expect(colunas.map((c) => sheets.filter((b) => b.location_id === c.id).map(tagOf))).toEqual([['SEC-C01'], ['SEC-C02'], ['SEC-C03']]);
    const paineis = new Set(locations.filter((l) => l.kind === 'painel').map((l) => l.id));
    expect(sheets.some((b) => paineis.has(b.location_id!))).toBe(false);
    expect(sheets).toHaveLength(7);
  });

  it('matrix "TAG collision across painéis": two painéis each with a "Coluna 5" seccionadora give SEC-C05 then SEC-C05-2', () => {
    const a = named('Coluna 5', named('Painel A').id);
    const b = named('Coluna 5', named('Painel B').id);
    expect(sheets.filter((s) => s.location_id === a.id).map(tagOf)).toEqual(['SEC-C05']);
    expect(sheets.filter((s) => s.location_id === b.id).map(tagOf)).toEqual(['SEC-C05-2']);
    expect(integrityFindings({ equipment })).toEqual([]);
  });

  it('the drafts replay (no LocationKindError), and "Salvar como template" gives the same skeleton and placements back', () => {
    const ops = all.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0045-7000-8000-'), now: T0 }), seq: i + 1 }));
    const snapshot = buildSnapshot(replay(ops), relatorioId);
    expect(snapshot.locations.map((l) => l.kind).sort()).toEqual(['cabine', 'cabine', 'coluna', 'coluna', 'coluna', 'coluna', 'coluna', 'painel', 'painel', 'painel']);
    const saved = templateFromRelatorio(snapshot, { id: '019966b0-0046-7000-8000-000000000001', name: 'Salvo' });
    const shape = (row: TemplateRow) => ({
      skeleton: row.skeleton.map((n) => ({ kind: n.kind, name: n.name, funcao: n.kind === 'cabine' ? (n.funcao ?? null) : null })),
      placed: row.blocks.filter((b) => b.skeleton_location_ref !== null).map((b) => [b.block_type, b.quantity, row.skeleton.find((n) => n.ref === b.skeleton_location_ref)!.name]),
    });
    expect(shape(saved)).toEqual(shape(template()));
    // A cabine with no Função keeps the node shape from before the field.
    expect(Object.keys(saved.skeleton.find((n) => n.name === 'Geradores')!)).not.toContain('funcao');
    // And a relatório born from the saved template is the same tree again.
    const again = instantiateTemplate(saved, project, inputs, deps());
    expect(valuesOf<LocationRow>(again.drafts, 'location').map((l) => [l.kind, l.name])).toEqual(locations.map((l) => [l.kind, l.name]));
  });

  it('a stored template block on a painel ref is skipped, exactly as an orphan is', () => {
    const row = template();
    const stored: TemplateRow = { ...row, blocks: [...row.blocks, { ...row.blocks.at(-1)!, skeleton_location_ref: 'P1', quantity: 2 }] };
    const made = instantiateTemplate(stored, project, inputs, deps());
    expect(valuesOf<BlockRow>(made.drafts, 'block').filter((b) => b.location_id !== null)).toHaveLength(7);
    // Had it been placed, the fold would have refused it.
    const ops = made.drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0047-7000-8000-'), now: T0 }), seq: i + 1 }));
    expect(() => replay(ops)).not.toThrow();
  });
});

/*
 * Stories 24.8 and 24.21 (batch e24b): the TAG of a created equipment is `PREFIX-NN` (Story
 * 24.8), and the reuse matches a placement on the key stored at the equipment's creation, the
 * frozen rule's TAG of the placement (Story 24.21); a row from before the story has no key and
 * matches by its TAG. The obra's template: a cable at "Cubículo Enel", a seccionadora and a
 * breaker at "Coluna 5" of "1° Subsolo", a transformer on "1° Subsolo".
 */
const E24 = (n: number) => `019966b0-0060-7000-8000-${n.toString(16).padStart(12, '0')}`;
const current = { ...inputs, tagRule: 'current' as const };

function obraTemplate(options: { breakers?: number; breakerAt?: 'Coluna 5' | 'Coluna 6' | null } = {}): TemplateRow {
  let skeleton = addCabine([], 'enel', 'Cubículo Enel');
  skeleton = addCabine(skeleton, 'sub', '1° Subsolo');
  skeleton = addColuna(skeleton, 'sub', 'sub/c5', 'Coluna 5');
  skeleton = addColuna(skeleton, 'sub', 'sub/c6', 'Coluna 6');
  let row: TemplateRow = { ...emptyTemplate(TEMPLATE_ID, SEED_VERSION), skeleton };
  row = { ...row, blocks: setQuantity(row, 'enel', 'cabos_entrada', 1, EMPTY_DEFINITION_CONTEXT) };
  row = { ...row, blocks: setQuantity(row, 'sub/c5', 'chave_seccionadora', 1, EMPTY_DEFINITION_CONTEXT) };
  const breakerAt = options.breakerAt === undefined ? 'Coluna 5' : options.breakerAt;
  if (breakerAt !== null) row = { ...row, blocks: setQuantity(row, breakerAt === 'Coluna 5' ? 'sub/c5' : 'sub/c6', 'disjuntor_mt', options.breakers ?? 1, EMPTY_DEFINITION_CONTEXT) };
  row = { ...row, blocks: setQuantity(row, 'sub', 'transformador_forca', 1, EMPTY_DEFINITION_CONTEXT) };
  return row;
}

const LAST_RESULTS = {
  relatorio_id: E24(900),
  revision_number: 1,
  issued_at: '2026-09-30T12:00:00.000Z',
  seed_version: 'v13',
  block_type: 'disjuntor_mt',
  readings: { 'resistencia_contato|r|valor': { raw: '40', unit: 'µΩ', state: 'measured' as const } },
  prior: null,
};

/** The obra of 24.8's and 24.21's criteria whose equipment was created before Story 24.21: no key, the old TAGs, each with `last_results`. */
function oldObra(): EquipmentRow[] {
  return [
    { id: E24(1), project_id: TEST_PROJECT, tag: 'CE-ENEL', type: 'cabos_entrada', last_nameplate: null, last_results: { ...LAST_RESULTS, block_type: 'cabos_entrada' }, removed_at: null },
    { id: E24(2), project_id: TEST_PROJECT, tag: 'SEC-C05', type: 'chave_seccionadora', last_nameplate: null, last_results: { ...LAST_RESULTS, block_type: 'chave_seccionadora' }, removed_at: null },
    { id: E24(3), project_id: TEST_PROJECT, tag: 'DJ-C05', type: 'disjuntor_mt', last_nameplate: null, last_results: LAST_RESULTS, removed_at: null },
    { id: E24(4), project_id: TEST_PROJECT, tag: 'TR-1', type: 'transformador_forca', last_nameplate: null, last_results: { ...LAST_RESULTS, block_type: 'transformador_forca' }, removed_at: null },
  ];
}

const run = (template: TemplateRow, existingEquipment: readonly EquipmentRow[], prefix = '019966b0-0061-7000-8000-', extra: { tagRule?: 'current' | 'legacy' } = {}) =>
  instantiateTemplate(template, project, { ...current, ...extra, existingEquipment }, { ...deps(), newId: idSequence(prefix) });

/** The placements' bound equipment in skeleton order, as [block type, equipment id]. */
const bindings = (all: readonly { path: string; value: unknown }[]) => sheetsOf(all).map((b) => [b.block_type, b.equipment_id] as const);

describe('24.8-UNIT instantiateTemplate: a created equipment is suggested PREFIX-NN', () => {
  it('a new obra: CE-01, SC-01, DJ-01, TR-01, each with its placement key', () => {
    const created = valuesOf<EquipmentRow>(run(obraTemplate(), []).drafts, 'equipment');
    expect(created.map((e) => [e.type, e.tag, e.reuse_key])).toEqual([
      ['cabos_entrada', 'CE-01', 'CE-ENEL'],
      // A local's own blocks come before its colunas' (`canonicalSkeleton`).
      ['transformador_forca', 'TR-01', 'TR-1'],
      ['chave_seccionadora', 'SC-01', 'SEC-C05'],
      ['disjuntor_mt', 'DJ-01', 'DJ-C05'],
    ]);
    // The standard template: no TAG twice, the local enters none, every key distinct.
    const standard = valuesOf<EquipmentRow>(instantiateTemplate(standardTemplate({ id: TEMPLATE_ID }), project, current, deps()).drafts, 'equipment');
    expect(integrityFindings({ equipment: standard })).toEqual([]);
    expect(standard.every((e) => /^[A-Z]+-\d{2}$/.test(e.tag))).toBe(true);
    expect(standard.filter((e) => e.type === 'chave_seccionadora').map((e) => e.tag).slice(0, 3)).toEqual(['SC-01', 'SC-02', 'SC-03']);
    expect(new Set(standard.map((e) => e.reuse_key)).size).toBe(94);
  });

  it('the obra with the old TAGs (SEC-C05, DJ-C05, CE-ENEL, TR-1): every position binds its equipment by its TAG, nothing is created', () => {
    const second = run(obraTemplate(), oldObra());
    expect(second.drafts.some((d) => d.path.startsWith('equipment/'))).toBe(false);
    expect(bindings(second.drafts)).toEqual([
      ['cabos_entrada', E24(1)],
      ['transformador_forca', E24(4)],
      ['chave_seccionadora', E24(2)],
      ['disjuntor_mt', E24(3)],
    ]);
  });

  it('the obra created under the new rule (SC-01, DJ-01, TR-01): a second relatório binds the same equipment, none created', () => {
    const first = valuesOf<EquipmentRow>(run(obraTemplate(), []).drafts, 'equipment');
    const second = run(obraTemplate(), first, '019966b0-0062-7000-8000-');
    expect(valuesOf(second.drafts, 'equipment')).toEqual([]);
    expect(bindings(second.drafts).map(([, id]) => id)).toEqual(first.map((e) => e.id));
  });

  it('the obra with old TAGs and a template that gained a breaker: the old positions bind, the new one creates DJ-01', () => {
    const second = run(obraTemplate({ breakers: 2 }), oldObra());
    const created = valuesOf<EquipmentRow>(second.drafts, 'equipment');
    expect(created.map((e) => [e.tag, e.reuse_key])).toEqual([['DJ-01', 'DJ-C05-2']]);
    expect(bindings(second.drafts)).toEqual([
      ['cabos_entrada', E24(1)],
      ['transformador_forca', E24(4)],
      ['chave_seccionadora', E24(2)],
      ['disjuntor_mt', E24(3)],
      ['disjuntor_mt', created[0]!.id],
    ]);
  });

  it('the number is free in the obra: "TR-1" and "TR-2" give TR-03, whatever the type that holds the prefix', () => {
    const existing: EquipmentRow[] = [
      { id: E24(10), project_id: TEST_PROJECT, tag: 'TR-1', type: 'tc', last_nameplate: null, removed_at: null },
      { id: E24(11), project_id: TEST_PROJECT, tag: 'TR-2', type: 'tc', last_nameplate: null, removed_at: null },
    ];
    const created = valuesOf<EquipmentRow>(run(obraTemplate(), existing).drafts, 'equipment');
    expect(created.find((e) => e.type === 'transformador_forca')!.tag).toBe('TR-03');
  });

  it('with the old rule passed, the drafts are the rule before Story 24.8: the old TAGs and no key on any row', () => {
    const legacy = run(obraTemplate({ breakers: 2 }), [], '019966b0-0061-7000-8000-', { tagRule: 'legacy' });
    const created = valuesOf<EquipmentRow>(legacy.drafts, 'equipment');
    expect(created.map((e) => e.tag)).toEqual(['CE-ENEL', 'TR-1', 'SEC-C05', 'DJ-C05', 'DJ-C05-2']);
    expect(created.every((e) => !('reuse_key' in e))).toBe(true);
    expect(Object.keys(created[0]!)).toEqual(['id', 'project_id', 'tag', 'type', 'last_nameplate', 'removed_at']);
    // The second relatório under the old rule binds by TAG, as before.
    const second = run(obraTemplate({ breakers: 2 }), created, '019966b0-0062-7000-8000-', { tagRule: 'legacy' });
    expect(valuesOf(second.drafts, 'equipment')).toEqual([]);
  });
});

describe('24.21-UNIT the reuse matches the key stored at the equipment creation', () => {
  /** The first relatório of the obra under the current rule, then the TAGs renamed as `renames` says. */
  function keyedObra(renames: Record<string, string> = {}): EquipmentRow[] {
    return valuesOf<EquipmentRow>(run(obraTemplate(), []).drafts, 'equipment').map((row) => (renames[row.tag] === undefined ? row : { ...row, tag: renames[row.tag]! }));
  }

  it('a breaker renamed "52-1" and a transformer "TF-A": every placement binds the same equipment, none is created, the TAGs stand', () => {
    const obra = keyedObra({ 'DJ-01': '52-1', 'TR-01': 'TF-A' });
    const second = run(obraTemplate(), obra, '019966b0-0062-7000-8000-');
    expect(valuesOf(second.drafts, 'equipment')).toEqual([]);
    expect(bindings(second.drafts).map(([, id]) => id)).toEqual(obra.map((e) => e.id));
    expect(obra.map((e) => e.tag)).toEqual(['CE-01', 'TF-A', 'SC-01', '52-1']);
  });

  it('the keys of two relatórios of one template are equal whatever the TAGs became', () => {
    const first = keyedObra();
    const renamed = first.map((row, n) => ({ ...row, tag: `X-${n}` }));
    const again = valuesOf<EquipmentRow>(run(obraTemplate(), [], '019966b0-0062-7000-8000-').drafts, 'equipment');
    expect(again.map((e) => e.reuse_key)).toEqual(first.map((e) => e.reuse_key));
    expect(valuesOf(run(obraTemplate(), renamed, '019966b0-0063-7000-8000-').drafts, 'equipment')).toEqual([]);
  });

  it('an old obra with DJ-C05 renamed "52-1" before the relatório: the breaker placement creates a new keyed equipment', () => {
    const obra = oldObra().map((row) => (row.tag === 'DJ-C05' ? { ...row, tag: '52-1' } : row));
    const second = run(obraTemplate(), obra);
    const created = valuesOf<EquipmentRow>(second.drafts, 'equipment');
    expect(created.map((e) => [e.type, e.tag, e.reuse_key])).toEqual([['disjuntor_mt', 'DJ-01', 'DJ-C05']]);
    expect(bindings(second.drafts).map(([, id]) => id)).toEqual([E24(1), E24(4), E24(2), created[0]!.id]);
  });

  it('a template that gained a second breaker at "Coluna 5": the first placements bind, the new one gets the key DJ-C05-2 and the next free TAG', () => {
    const obra = keyedObra();
    const second = run(obraTemplate({ breakers: 2 }), obra, '019966b0-0062-7000-8000-');
    const created = valuesOf<EquipmentRow>(second.drafts, 'equipment');
    expect(created.map((e) => [e.tag, e.reuse_key])).toEqual([['DJ-02', 'DJ-C05-2']]);
    expect(bindings(second.drafts).map(([, id]) => id)).toEqual([...obra.map((e) => e.id), created[0]!.id]);
  });

  it('a breaker block removed, then added again at the same local: unbound, then bound again with its history', () => {
    const obra = keyedObra({ 'DJ-01': '52-1' });
    const without = run(obraTemplate({ breakerAt: null }), obra, '019966b0-0062-7000-8000-');
    expect(valuesOf(without.drafts, 'equipment')).toEqual([]);
    expect(bindings(without.drafts).map(([, id]) => id)).not.toContain(obra[3]!.id);
    const back = run(obraTemplate(), obra, '019966b0-0063-7000-8000-');
    expect(valuesOf(back.drafts, 'equipment')).toEqual([]);
    expect(bindings(back.drafts).find(([type]) => type === 'disjuntor_mt')![1]).toBe(obra[3]!.id);
  });

  it('a breaker moved from "Coluna 5" to "Coluna 6" in the template: a new equipment with no previous visit, the old one unbound', () => {
    const obra = keyedObra();
    const moved = run(obraTemplate({ breakerAt: 'Coluna 6' }), obra, '019966b0-0062-7000-8000-');
    const created = valuesOf<EquipmentRow>(moved.drafts, 'equipment');
    expect(created.map((e) => [e.type, e.tag, e.reuse_key, e.last_results])).toEqual([['disjuntor_mt', 'DJ-02', 'DJ-C06', undefined]]);
    expect(bindings(moved.drafts).map(([, id]) => id)).not.toContain(obra[3]!.id);
  });

  it('a breaker added from the palette at "Coluna 5" as "QM8", saved with "Salvar como template": both breakers bind their own equipment', () => {
    const first = run(obraTemplate(), []);
    const ops = first.drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0064-7000-8000-'), now: T0 }), seq: i + 1 }));
    let state = replay(ops);
    const snapshot = buildSnapshot(state, first.relatorioId);
    const coluna5 = snapshot.locations.find((l) => l.name === 'Coluna 5')!;
    const pair = newEquipmentBlock({
      blockId: E24(50),
      equipmentId: E24(51),
      relatorioId: first.relatorioId,
      projectId: TEST_PROJECT,
      locationId: coluna5.id,
      type: 'disjuntor_mt',
      tag: 'QM8',
      seedVersion: SEED_VERSION,
      orderKey: newBlockOrderKey(snapshot.blocks, coluna5.id, null),
      definitions: EMPTY_DEFINITION_CONTEXT,
      placement: { location: { kind: 'coluna', name: 'Coluna 5' }, equipment: snapshot.equipment },
    });
    expect(pair.equipment).toMatchObject({ tag: 'QM8', reuse_key: 'DJ-C05-2' });
    const base = { company_id: TEST_COMPANY, prev_op_id: null, batch_id: null, meta: null, actor_id: TEST_USER, device_id: 'tablet-test' };
    const palette = [
      makeOp({ ...base, scope: 'project', project_id: TEST_PROJECT, relatorio_id: null, kind: 'create', path: `equipment/${E24(51)}`, value: pair.equipment as never }, { newId: idSequence('019966b0-0065-7000-8000-'), now: T0 }),
      makeOp({ ...base, scope: 'relatorio', project_id: null, relatorio_id: first.relatorioId, kind: 'create', path: `block/${E24(50)}`, value: pair.block as never }, { newId: idSequence('019966b0-0066-7000-8000-'), now: T0 }),
    ];
    for (const op of palette) state = applyOp(state, op);
    const after = buildSnapshot(state, first.relatorioId);
    expect(after.equipment.find((e) => e.id === E24(51))!.reuse_key).toBe('DJ-C05-2');
    const saved = templateFromRelatorio(after, { id: '019966b0-0067-7000-8000-000000000001', name: 'Salvo' });
    const next = instantiateTemplate(saved, project, { ...current, existingEquipment: after.equipment }, { ...deps(), newId: idSequence('019966b0-0068-7000-8000-') });
    expect(valuesOf(next.drafts, 'equipment')).toEqual([]);
    const breakers = bindings(next.drafts).filter(([type]) => type === 'disjuntor_mt').map(([, id]) => id);
    expect(breakers).toEqual([after.equipment.find((e) => e.reuse_key === 'DJ-C05')!.id, E24(51)]);
  });

  it('two live equipment of one type with the same stored key: both runs bind the smallest id, nothing is created for that placement', () => {
    const obra = keyedObra();
    const twin: EquipmentRow = { ...obra[3]!, id: E24(20), tag: 'DJ-09' };
    const larger: EquipmentRow = { ...obra[3]!, id: '019966b0-ffff-7000-8000-000000000001' };
    for (const prefix of ['019966b0-0062-7000-8000-', '019966b0-0063-7000-8000-']) {
      const made = run(obraTemplate(), [larger, ...obra.filter((row) => row !== obra[3]), twin], prefix);
      expect(valuesOf(made.drafts, 'equipment'), prefix).toEqual([]);
      expect(bindings(made.drafts).find(([type]) => type === 'disjuntor_mt')![1]).toBe(E24(20));
    }
  });

  it('two rows from before the story with one TAG: the smallest id binds', () => {
    const obra = oldObra();
    const twin: EquipmentRow = { ...obra.find((row) => row.tag === 'DJ-C05')!, id: E24(0) };
    const made = run(obraTemplate(), [...obra, twin]);
    expect(bindings(made.drafts).find(([type]) => type === 'disjuntor_mt')![1]).toBe(E24(0));
  });

  it('a keyed equipment wins over an unkeyed one whose TAG equals the key', () => {
    const obra = keyedObra();
    const unkeyed: EquipmentRow = { id: E24(0), project_id: TEST_PROJECT, tag: 'DJ-C05', type: 'disjuntor_mt', last_nameplate: null, removed_at: null };
    const made = run(obraTemplate(), [unkeyed, ...obra], '019966b0-0062-7000-8000-');
    expect(bindings(made.drafts).find(([type]) => type === 'disjuntor_mt')![1]).toBe(obra[3]!.id);
  });

  it('two keyed breakers at "Coluna 5" and "Coluna 6", the first renamed "DJ-C06": each placement binds its own', () => {
    let template = obraTemplate();
    template = { ...template, blocks: setQuantity(template, 'sub/c6', 'disjuntor_mt', 1, EMPTY_DEFINITION_CONTEXT) };
    const first = valuesOf<EquipmentRow>(run(template, []).drafts, 'equipment');
    const c5 = first.find((e) => e.reuse_key === 'DJ-C05')!;
    const c6 = first.find((e) => e.reuse_key === 'DJ-C06')!;
    const obra = first.map((row) => (row.id === c5.id ? { ...row, tag: 'DJ-C06' } : row));
    const made = run(template, obra, '019966b0-0062-7000-8000-');
    expect(valuesOf(made.drafts, 'equipment')).toEqual([]);
    expect(bindings(made.drafts).filter(([type]) => type === 'disjuntor_mt').map(([, id]) => id)).toEqual([c5.id, c6.id]);
  });

  it('a removed keyed equipment is never bound: its placement creates a new one', () => {
    const obra = keyedObra().map((row) => (row.type === 'disjuntor_mt' ? { ...row, removed_at: '2026-10-01T10:00:00.000Z' } : row));
    const created = valuesOf<EquipmentRow>(run(obraTemplate(), obra, '019966b0-0062-7000-8000-').drafts, 'equipment');
    expect(created.map((e) => [e.tag, e.reuse_key])).toEqual([['DJ-01', 'DJ-C05']]);
  });
});
