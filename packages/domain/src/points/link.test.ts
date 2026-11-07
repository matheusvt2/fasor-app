import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { pointFieldPath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import { photoEquipmentOptions } from '../photos/gallery.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { putPointOp, type PointField } from '../relatorio/ops.ts';
import { siteLocals } from '../relatorio/site-checklist.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { pointLinkGroups, pointLinkKey, pointLinkOptions, pointLinkValues, POINT_LINK_GENERAL_KEY } from './link.ts';
import { pointTitle } from './summary.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';

/*
 * Story 20.4: the options of the point editor's "Equipamento ou local" picker, the option a
 * point names and the two fields a pick writes. Read over the standard template (seed v10,
 * every sheet under a site local) and over the same relatório on seed v3 (no site list).
 */

function fresh(seedVersion?: string): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0201-7000-8000-000000000001', ...(seedVersion === undefined ? {} : { seedVersion }) }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0202-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0203-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const base = fresh();
const MISSING = '019966b0-0201-7000-8000-0000000000ff';

describe('20.4-UNIT pointLinkGroups', () => {
  const groups = pointLinkGroups(base);

  it('starts with "Geral" alone, in a group with no heading', () => {
    expect(groups[0]).toEqual({ id: 'group:geral', label: null, options: [{ key: 'geral', equipmentId: null, locationId: null, text: 'Geral' }] });
    expect(POINT_LINK_GENERAL_KEY).toBe('geral');
  });

  it('then one group per site local, in tree order: the local first, then its equipment in sheet order', () => {
    const locals = siteLocals(base);
    expect(locals.length).toBeGreaterThan(1);
    expect(groups.slice(1).map((group) => group.label)).toEqual(locals.map((local) => local.name));
    const enel = groups[1]!;
    expect(enel.id).toBe(`group:local:${locals[0]!.id}`);
    expect(enel.options[0]).toEqual({ key: `local:${locals[0]!.id}`, equipmentId: null, locationId: locals[0]!.id, text: 'Cubículo Enel · Verificações do local' });
    expect(enel.options[1]!.text).toBe('CE-ENEL · Cabos de entrada · Cubículo Enel');
    const subsolo = groups.find((group) => group.label === '1° Subsolo')!;
    // A coluna's sheets sit in their local's group, named with their full place.
    expect(subsolo.options.map((option) => option.text)).toContain('SEC-C12 · Chave seccionadora · 1° Subsolo › Coluna 12');
  });

  it('names every equipment once, by the photo capture text, in sheet order', () => {
    const equipment = pointLinkOptions(groups).filter((option) => option.equipmentId !== null);
    const order = sheetOrder(base).filter((node) => node.equipmentId !== null);
    expect(equipment.map((option) => option.equipmentId)).toEqual(order.map((node) => node.equipmentId));
    const photoText = new Map(photoEquipmentOptions(base).map((option) => [option.blockId, option.text]));
    expect(equipment.map((option) => option.text)).toEqual(order.map((node) => photoText.get(node.blockId)));
    for (const option of equipment) {
      expect(option.key).toBe(`equipment:${option.equipmentId}`);
      expect(option.locationId).toBeNull();
    }
    expect(new Set(pointLinkOptions(groups).map((option) => option.key)).size).toBe(pointLinkOptions(groups).length);
  });

  it('skips a sheet with no equipment and lists an equipment held by two sheets once', () => {
    const order = sheetOrder(base);
    const [first, second, third] = order;
    const shared = base.blocks.find((block) => block.id === first!.blockId)!.equipment_id;
    const snapshot: RelatorioSnapshot = {
      ...base,
      blocks: base.blocks.map((block) =>
        block.id === second!.blockId ? { ...block, equipment_id: shared } : block.id === third!.blockId ? { ...block, equipment_id: null } : block,
      ),
    };
    const ids = pointLinkOptions(pointLinkGroups(snapshot)).map((option) => option.equipmentId).filter((id) => id !== null);
    expect(ids.filter((id) => id === shared)).toHaveLength(1);
    expect(ids).toHaveLength(order.length - 2);
  });

  it('on a relatório with no site list, groups the equipment by place with no local option', () => {
    const v3 = fresh('v3');
    expect(siteLocals(v3)).toEqual([]);
    const v3Groups = pointLinkGroups(v3);
    expect(v3Groups[0]!.id).toBe('group:geral');
    expect(pointLinkOptions(v3Groups).some((option) => option.locationId !== null)).toBe(false);
    expect(v3Groups.slice(1).map((group) => group.label)).toContain('1° Subsolo › Coluna 12');
    const equipment = pointLinkOptions(v3Groups).filter((option) => option.equipmentId !== null);
    expect(equipment).toHaveLength(sheetOrder(v3).filter((node) => node.equipmentId !== null).length);
  });

  it('a removed local leaves its group out and its sheets with it', () => {
    const enel = siteLocals(base)[0]!;
    const snapshot: RelatorioSnapshot = { ...base, locations: base.locations.filter((row) => row.id !== enel.id) };
    expect(pointLinkGroups(snapshot).some((group) => group.label === 'Cubículo Enel')).toBe(false);
  });
});

describe('20.4-UNIT pointLinkKey and pointLinkValues', () => {
  const groups = pointLinkGroups(base);
  const local = siteLocals(base)[1]!;
  const equipment = pointLinkOptions(groups).find((option) => option.equipmentId !== null)!;

  it('names the equipment, the local or "Geral", as pointTitle does', () => {
    const cases = [
      { equipment_id: equipment.equipmentId, location_id: null, key: equipment.key },
      { equipment_id: null, location_id: local.id, key: `local:${local.id}` },
      { equipment_id: null, location_id: null, key: 'geral' },
      { equipment_id: null, key: 'geral' },
      // Stale links: a removed equipment, a location that is no site local.
      { equipment_id: MISSING, location_id: null, key: 'geral' },
      { equipment_id: null, location_id: MISSING, key: 'geral' },
      // A stale equipment falls through to a live local, as the title does.
      { equipment_id: MISSING, location_id: local.id, key: `local:${local.id}` },
    ];
    const textOf = new Map(pointLinkOptions(groups).map((option) => [option.key, option.text]));
    for (const { key, ...point } of cases) {
      expect(pointLinkKey(point, base)).toBe(key);
      // The option a point names and its title agree on what it names.
      const title = pointTitle(point, base);
      if (key === 'geral') expect(title).toBe('Geral');
      else if (key.startsWith('local:')) expect(title).toBe(textOf.get(key));
      else expect(textOf.get(key)!.startsWith(title.split(' · ')[0]!)).toBe(true);
    }
  });

  it('a pick writes both fields every time', () => {
    expect(pointLinkValues(equipment)).toEqual({ equipment_id: equipment.equipmentId, location_id: null });
    expect(pointLinkValues({ equipmentId: null, locationId: local.id })).toEqual({ equipment_id: null, location_id: local.id });
    expect(pointLinkValues(groups[0]!.options[0]!)).toEqual({ equipment_id: null, location_id: null });
  });

  it('PointField names location_id, so a put of it is a point field path', () => {
    const field: PointField = 'location_id';
    const op = putPointOp({ id: TEST_USER, companyId: TEST_COMPANY }, base.relatorio.id, MISSING, field, local.id);
    expect(op.path).toBe(pointFieldPath(MISSING, 'location_id'));
    expect(op.value).toBe(local.id);
  });
});
