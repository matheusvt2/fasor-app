import { describe, expect, it } from 'vitest';
import { CABINE_ID, COMPANY_ID, companyTypes, DEFINITION_1, DEFINITION_2, DEVICE_ID, EQUIPMENT_1_ID, PROJECT_ID, RELATORIO_ID, USER_ID } from '../../fixtures/company-types/op-log.ts';
import { applyOp, entityKey, SeedPathError, targetsOf, type EntityKey, type EntityState } from '../ops/apply.ts';
import { opSchema, type Op } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { companyTypeNameIn, instantiateTemplate, omittedPlacementsOf, omittedPlacementsText } from '../relatorio/instantiate.ts';
import { companyBlockType, sameTypeVersion, typeVersionOf } from '../schemas/block-config.ts';
import type { BlockRow, EntityRow, EquipmentTypeRow, EquipmentTypeVersionRow, TemplateRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { definitionContextOf, EMPTY_DEFINITION_CONTEXT, findDefinitionIn, snapshotDefinitionContext, versionRowIn } from '../seed/definitions.ts';
import { companySubBlocksOf, type CompanyTypeDefinition } from '../types/definition.ts';
import { resendRenumberedVersions } from './resend.ts';

/*
 * e22h S2 (Epic 22 wave C review, the batch's deferred medium): a company block names its type
 * version by the version row's id beside the number (`type_version_id`), so a publish the server
 * refuses (another device took the number) never binds the losing device's blocks to the winning
 * device's definition, and "Reenviar" renumbers the refused version and the blocks naming it.
 * e22h N4: a template's company placement no version resolves for is named, never dropped silently.
 */

const id = (n: number) => `019a5d00-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const T = (n: number) => `2026-11-07T13:${String(n % 60).padStart(2, '0')}:00.000Z`;
let counter = 0;
const opId = () => `019a5d00-0001-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;

const TYPE_ID = id(1);
const OTHER_TYPE_ID = id(2);
const Z_ID = id(3); // the winning device's v2
const Y_ID = id(4); // the losing device's v2, larger id: `versions` keeps Z at number 2
const V1_ID = id(5);
const BLOCK_ID = id(10);
const TYPE = companyBlockType(TYPE_ID);

/** Y's own v2: an item Z's version does not have. */
const Y_DEFINITION: CompanyTypeDefinition = {
  ...structuredClone(DEFINITION_1),
  checklist: [...DEFINITION_1.checklist!, { key: 'alarme_remoto', label: 'Alarme remoto', nc_phrases: ['Sem sinal', 'Contato oxidado', 'Fiação solta'] }],
};

function op(kind: Op['kind'], scope: Op['scope'], path: string, value: unknown, extra: Partial<Op> = {}): Op {
  return opSchema.parse({
    op_id: opId(),
    kind,
    scope,
    company_id: COMPANY_ID,
    project_id: scope === 'project' ? PROJECT_ID : null,
    relatorio_id: scope === 'relatorio' ? RELATORIO_ID : null,
    path,
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER_ID,
    device_id: DEVICE_ID,
    client_ts: T(counter),
    ...extra,
  });
}

const typeCreate = (typeId: string) =>
  op('create', 'company', `equipment_type/${typeId}`, { id: typeId, derived_from: null, draft: DEFINITION_1, retired_at: null, removed_at: null, latest_version: 0 });
const versionCreate = (versionId: string, typeId: string, version: number, definition: unknown = DEFINITION_1) =>
  op('create', 'company', `equipment_type_version/${versionId}`, { id: versionId, type_id: typeId, version, definition, published_by: USER_ID, published_at: T(1) });
const subBlocks = (definition: CompanyTypeDefinition) => Object.fromEntries(companySubBlocksOf(definition).map((key) => [key, { enabled: true }]));
const configOf = (version: number, versionId: string | undefined, definition: CompanyTypeDefinition = DEFINITION_1) => ({
  block_type: TYPE,
  sub_blocks: subBlocks(definition),
  na_defaults: [],
  type_version: version,
  ...(versionId === undefined ? {} : { type_version_id: versionId }),
});
const blockCreate = (config: Record<string, unknown>, blockId = BLOCK_ID) =>
  op('create', 'relatorio', `block/${blockId}`, {
    id: blockId,
    relatorio_id: RELATORIO_ID,
    location_id: CABINE_ID,
    equipment_id: EQUIPMENT_1_ID,
    block_type: TYPE,
    config,
    seed_version: 'v12',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  });
const itemPut = (blockId: string, item: string) => op('put', 'relatorio', `sheet/${blockId}/checklist/${item}/result`, 'NC');

/** Folds ops one by one through `targetsOf` and every version row, as both layers do. */
function fold(ops: readonly Op[], start: EntityState = new Map()): Map<EntityKey, EntityRow> {
  const state = new Map(start);
  for (const o of ops) {
    const touched = new Map<EntityKey, EntityRow>();
    for (const ref of targetsOf(o)) {
      const row = state.get(ref.key);
      if (row) touched.set(ref.key, row);
    }
    for (const [key, row] of state) if (key.startsWith('equipment_type_version:') && !touched.has(key)) touched.set(key, row);
    const next = applyOp(touched, o);
    for (const [key, row] of next) if (row !== touched.get(key)) state.set(key, row);
  }
  return state;
}

/** The server after Z's push: T at v1 then Z's v2. */
const server = fold([typeCreate(TYPE_ID), versionCreate(V1_ID, TYPE_ID, 1), versionCreate(Z_ID, TYPE_ID, 2, DEFINITION_2)]);
/** Device Y after the pull, still holding its own v2 row (built from its create alone, beside Z's). */
const deviceY = new Map([...server, ...applyOp(new Map(), versionCreate(Y_ID, TYPE_ID, 2, Y_DEFINITION))]);

describe('e22h S2: a company block names its version row', () => {
  it('refuses a company block create without the version row id', () => {
    expect(() => fold([blockCreate(configOf(1, undefined))], server)).toThrow(SeedPathError);
    expect(() => fold([blockCreate(configOf(1, undefined))], server)).toThrow(/without the version row's id/);
    expect(fold([blockCreate(configOf(1, V1_ID))], server).get(entityKey('block', BLOCK_ID))).toBeDefined();
  });

  it('refuses a block naming (2, y) while Z holds number 2: it never binds to Z\'s definition', () => {
    expect(() => fold([blockCreate(configOf(2, Y_ID, Y_DEFINITION))], server)).toThrow(SeedPathError);
    // The id must be a row of that number and of that type.
    expect(() => fold([blockCreate(configOf(1, Z_ID))], server)).toThrow(SeedPathError);
    expect(() => fold([blockCreate(configOf(2, Z_ID))], fold([typeCreate(OTHER_TYPE_ID)], server))).not.toThrow();
  });

  it('on a device holding both rows of number 2, each block resolves its own row', () => {
    const ctx = definitionContextOf(deviceY);
    expect(ctx.versions.get(`${TYPE_ID}@2`)?.id).toBe(Z_ID);
    expect(ctx.byId.get(Y_ID)?.version).toBe(2);
    expect(findDefinitionIn(ctx, 'v12', TYPE, { version: 2, id: Y_ID })?.checklist?.map((item) => item.key)).toContain('alarme_remoto');
    expect(findDefinitionIn(ctx, 'v12', TYPE, { version: 2, id: Z_ID })?.checklist?.map((item) => item.key)).not.toContain('alarme_remoto');
    // Boundaries of `versionRowIn`: another number, another type, an unknown id.
    expect(versionRowIn(ctx, TYPE_ID, { version: 3, id: Y_ID })).toBeNull();
    expect(versionRowIn(ctx, OTHER_TYPE_ID, { version: 2, id: Y_ID })).toBeNull();
    expect(versionRowIn(ctx, TYPE_ID, { version: 2, id: id(99) })).toBeNull();
    expect(versionRowIn(ctx, TYPE_ID, 2)?.id).toBe(Z_ID);
    const onY = fold([blockCreate(configOf(2, Y_ID, Y_DEFINITION)), itemPut(BLOCK_ID, 'alarme_remoto')], deviceY);
    expect((onY.get(entityKey('block', BLOCK_ID)) as BlockRow).sheet.checklist).toHaveProperty('alarme_remoto');
    // A block on Z's row refuses the item only Y's version has.
    expect(() => fold([blockCreate(configOf(2, Z_ID)), itemPut(BLOCK_ID, 'alarme_remoto')], deviceY)).toThrow(SeedPathError);
  });

  it('after the renumbered push (y at 3, the block naming (3, y)) the block resolves y\'s definition', () => {
    const renumbered = fold([versionCreate(Y_ID, TYPE_ID, 3, Y_DEFINITION), blockCreate(configOf(3, Y_ID, Y_DEFINITION)), itemPut(BLOCK_ID, 'alarme_remoto')], server);
    expect((renumbered.get(entityKey('equipment_type', TYPE_ID)) as EquipmentTypeRow).latest_version).toBe(3);
    expect((renumbered.get(entityKey('block', BLOCK_ID)) as BlockRow).sheet.checklist).toHaveProperty('alarme_remoto');
  });

  it('a config put keeps the number and the id by value', () => {
    const state = fold([blockCreate(configOf(2, Z_ID))], server);
    expect(sameTypeVersion(typeVersionOf(configOf(2, Z_ID)), { version: 2, id: Z_ID })).toBe(true);
    expect(sameTypeVersion(2, { version: 2, id: Z_ID })).toBe(false);
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_ID}/config`, configOf(2, Z_ID))], state)).not.toThrow();
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_ID}/config`, configOf(2, Y_ID))], state)).toThrow(/keeps type_version 2 \(row /);
  });

  it('the snapshot keeps each block\'s own row when two share a number', () => {
    // The fixture's relatório and cabine (same ids), beside this test's type.
    const fixture = replay(companyTypes.log);
    const start = new Map(deviceY);
    for (const key of [entityKey('relatorio', RELATORIO_ID), entityKey('location', CABINE_ID)]) start.set(key, fixture.get(key)!);
    const both = fold([blockCreate(configOf(2, Y_ID, Y_DEFINITION)), blockCreate(configOf(2, Z_ID), id(11))], start);
    const snapshot = buildSnapshot(both, RELATORIO_ID);
    expect(snapshot.equipment_types?.map((row) => row.id)).toEqual([Z_ID, Y_ID]);
    const ctx = snapshotDefinitionContext(snapshot);
    expect(findDefinitionIn(ctx, 'v12', TYPE, { version: 2, id: Y_ID })?.checklist?.map((item) => item.key)).toContain('alarme_remoto');
  });
});

describe('e22h S2: "Reenviar" renumbers a refused publish and the blocks naming it', () => {
  const typeRow = (latest: number, removed = false): Pick<EquipmentTypeRow, 'id' | 'latest_version' | 'removed_at'> => ({ id: TYPE_ID, latest_version: latest, removed_at: removed ? T(2) : null });

  it('equal: a version already the next free number moves nothing', () => {
    expect(resendRenumberedVersions([versionCreate(Y_ID, TYPE_ID, 3), blockCreate(configOf(3, Y_ID))], [typeRow(2)])).toEqual([]);
  });

  it('one ahead: v2 refused while the type is at 2 moves to 3, with its block create and config put', () => {
    const version = versionCreate(Y_ID, TYPE_ID, 2, Y_DEFINITION);
    const block = blockCreate(configOf(2, Y_ID, Y_DEFINITION));
    const put = op('put', 'relatorio', `block/${BLOCK_ID}/config`, configOf(2, Y_ID, Y_DEFINITION));
    const other = blockCreate(configOf(2, Z_ID), id(12));
    const sheet = itemPut(BLOCK_ID, 'alarme_remoto');
    const out = resendRenumberedVersions([version, block, put, other, sheet], [typeRow(2)]);
    expect(out.map((o) => o.op_id)).toEqual([version.op_id, block.op_id, put.op_id]);
    expect((out[0]!.value as { version: number }).version).toBe(3);
    expect(typeVersionOf((out[1]!.value as { config: unknown }).config)).toEqual({ version: 3, id: Y_ID });
    expect(typeVersionOf(out[2]!.value)).toEqual({ version: 3, id: Y_ID });
    // The stamps and every other key stay.
    expect(out[0]!.client_ts).toBe(version.client_ts);
    expect({ ...(out[0]!.value as object), version: 2 }).toEqual(version.value);
    // Folded on the server, the renumbered ops apply and the block reads y's definition.
    const applied = fold([...out.slice(0, 2), sheet], server);
    expect((applied.get(entityKey('block', BLOCK_ID)) as BlockRow).sheet.checklist).toHaveProperty('alarme_remoto');
  });

  it('two of one type: consecutive numbers in commit order', () => {
    const second = id(20);
    const out = resendRenumberedVersions([versionCreate(Y_ID, TYPE_ID, 2), versionCreate(second, TYPE_ID, 3), blockCreate(configOf(3, second))], [typeRow(2)]);
    expect(out.map((o) => (o.path.startsWith('equipment_type_version/') ? (o.value as { version: number }).version : typeVersionOf((o.value as { config: unknown }).config)))).toEqual([3, 4, { version: 4, id: second }]);
  });

  it('a create refused for its definition keeps its number and takes none; an unknown or removed type moves nothing', () => {
    // Built valid and then broken: the op schema would refuse it before "Reenviar" ever read it.
    const valid = versionCreate(Y_ID, TYPE_ID, 2);
    const bad = { ...valid, value: { ...(valid.value as object), definition: { ...DEFINITION_1, criteria: [{ ...DEFINITION_1.criteria[0]!, source: { name: '', edition: null } }] } } } as Op;
    const good = versionCreate(id(21), TYPE_ID, 2);
    const out = resendRenumberedVersions([bad, good], [typeRow(2)]);
    expect(out.map((o) => [o.op_id, (o.value as { version: number }).version])).toEqual([[good.op_id, 3]]);
    expect(resendRenumberedVersions([versionCreate(Y_ID, TYPE_ID, 2)], [])).toEqual([]);
    expect(resendRenumberedVersions([versionCreate(Y_ID, TYPE_ID, 2)], [typeRow(2, true)])).toEqual([]);
  });
});

describe('e22h N4: a company placement the device cannot resolve is named', () => {
  const template: TemplateRow = {
    id: id(30),
    name: 'Com no-break',
    version: 1,
    seed_version: 'v12',
    skeleton: [
      { ref: 'cab', kind: 'cabine', parent_ref: null, name: 'Cabine', agrupar_por_tipo: false },
      { ref: 'col', kind: 'coluna', parent_ref: 'cab', name: 'Coluna 1' },
    ],
    blocks: [
      { ...configOf(1, undefined), quantity: 2, skeleton_location_ref: 'cab', section_text: null },
      { ...configOf(1, undefined), quantity: 1, skeleton_location_ref: 'col', section_text: null },
      { block_type: 'tp', sub_blocks: {}, na_defaults: [], quantity: 1, skeleton_location_ref: 'cab', section_text: null },
    ],
    archived_at: null,
    removed_at: null,
  } as TemplateRow;
  const inputs = { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null };
  const deps = () => ({ newId: opId, actorId: USER_ID, companyId: COMPANY_ID });

  it('instantiateTemplate returns the placements it left out, once per type with every quantity', () => {
    const typeOnly = fold([typeCreate(TYPE_ID)]);
    const ctx = definitionContextOf(typeOnly);
    const made = instantiateTemplate(template, { id: PROJECT_ID }, { ...inputs, definitions: ctx }, deps());
    expect(made.omitted).toEqual([{ blockType: TYPE, label: DEFINITION_1.label, quantity: 3 }]);
    expect(made.drafts.some((draft) => draft.path.startsWith('block/') && (draft.value as { block_type?: unknown }).block_type === TYPE)).toBe(false);
    expect(omittedPlacementsOf(template, ctx)).toEqual(made.omitted);
    expect(omittedPlacementsText(made.omitted)).toBe('Fica de fora deste relatório: No-break de comando (3 equipamentos), cuja versão publicada ainda não chegou a este aparelho.');
  });

  it('a resolvable type leaves nothing out, and its blocks name the latest version row', () => {
    const ctx = definitionContextOf(server);
    const made = instantiateTemplate(template, { id: PROJECT_ID }, { ...inputs, definitions: ctx }, deps());
    expect(made.omitted).toEqual([]);
    expect(omittedPlacementsOf(template, ctx)).toEqual([]);
    expect(omittedPlacementsText([])).toBeNull();
    const blocks = made.drafts.filter((draft) => (draft.value as { block_type?: unknown }).block_type === TYPE).map((draft) => draft.value as unknown as BlockRow);
    expect(blocks.map((block) => typeVersionOf(block.config))).toEqual([{ version: 2, id: Z_ID }, { version: 2, id: Z_ID }, { version: 2, id: Z_ID }]);
  });

  it('names a type it knows nothing of generically, and lists several', () => {
    expect(companyTypeNameIn(EMPTY_DEFINITION_CONTEXT, TYPE)).toBeNull();
    expect(omittedPlacementsOf(template, EMPTY_DEFINITION_CONTEXT)).toEqual([{ blockType: TYPE, label: null, quantity: 3 }]);
    expect(
      omittedPlacementsText([
        { blockType: TYPE, label: null, quantity: 1 },
        { blockType: companyBlockType(OTHER_TYPE_ID), label: 'Fonte auxiliar', quantity: 2 },
      ]),
    ).toBe('Ficam de fora deste relatório: um tipo de equipamento da empresa (1 equipamento) e Fonte auxiliar (2 equipamentos), cujas versões publicadas ainda não chegaram a este aparelho.');
    // The highest number's row the context keeps per number (Z's, the smaller id).
    const kept = (deviceY.get(entityKey('equipment_type_version', Z_ID)) as EquipmentTypeVersionRow).definition.label;
    expect(companyTypeNameIn(definitionContextOf(deviceY), TYPE)).toBe(kept);
    expect(kept).toBe(DEFINITION_2.label);
  });
});
