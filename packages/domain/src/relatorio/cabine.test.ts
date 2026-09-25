import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { cabineLineText, cabineMissingText, cabineOf, cabineProgress, type CabineLocation } from './cabine.ts';
import { instantiateTemplate } from './instantiate.ts';
import { isCabineFirstSheet, sheetProgress } from './sheet-progress.ts';
import { firstInTree, locationTree } from './tree.ts';

/*
 * 12.3-UNIT: the cabine's required fields (J-03, D-5) over a relatório of the standard
 * template (seed v2): what `cabineProgress` reports, the "falta ⟨campo⟩" words, the line a
 * complete cabine collapses to, the count on the cabine's first sheet only, the Sumário row.
 */

const TEMPLATE_ID = '019966b0-0061-7000-8000-000000000001';

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0062-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0063-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const n = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });

const FULL_SE = { type: 'ALVENARIA - CONVENCIONAL', primary_kv: n('13.8', 'kV'), secondary_kv: n('380', 'V'), installed_kva: n('1500', 'kVA') };
const FULL_ENV = { altitude_m: null, temperature_c: n('25', '°C'), humidity_pct: n('65', '%') };

function withCabine(snapshot: RelatorioSnapshot, name: string, patch: (cabine: CabineLocation) => CabineLocation): { snapshot: RelatorioSnapshot; cabine: CabineLocation } {
  const found = snapshot.locations.find((l): l is CabineLocation => l.kind === 'cabine' && l.name === name)!;
  const next = patch(found);
  return { snapshot: { ...snapshot, locations: snapshot.locations.map((l: LocationRow) => (l.id === found.id ? next : l)) }, cabine: next };
}

describe('12.3-UNIT cabineProgress and its words', () => {
  it('reports every empty cabine field but the altitude, the setup owns it', () => {
    const snapshot = fresh();
    const enel = snapshot.locations.find((l) => l.name === 'Cubículo Enel')!;
    const p = cabineProgress(snapshot, enel.id);
    expect(p.complete).toBe(false);
    expect(p.missing.map((m) => [m.group, m.key, m.label])).toEqual([
      ['se', 'type', 'TIPO DE SE'],
      ['se', 'primary_kv', 'TENSÃO PRIMÁRIA'],
      ['se', 'secondary_kv', 'TENSÃO SECUNDÁRIA'],
      ['se', 'installed_kva', 'POTÊNCIA INSTALADA'],
      ['env', 'temperature_c', 'TEMPERATURA'],
      ['env', 'humidity_pct', 'UMIDADE RELATIVA DO AR'],
    ]);
    expect(cabineMissingText(p)).toBe('faltam 6 campos');
  });

  it('says the one field missing with its article, none when complete; an empty number or a blank type still misses', () => {
    const { snapshot, cabine } = withCabine(fresh(), 'Cubículo Enel', (c) => ({ ...c, se: FULL_SE, env: { ...FULL_ENV, humidity_pct: null } }));
    expect(cabineMissingText(cabineProgress(snapshot, cabine.id))).toBe('falta a umidade');
    const words = { type: 'o tipo de SE', primary_kv: 'a tensão primária', secondary_kv: 'a tensão secundária', installed_kva: 'a potência instalada', temperature_c: 'a temperatura', humidity_pct: 'a umidade' };
    for (const [key, word] of Object.entries(words)) expect(cabineMissingText({ missing: [{ group: 'se', key, label: 'X' }] })).toBe(`falta ${word}`);
    expect(cabineMissingText({ missing: [] })).toBeNull();
    const complete = withCabine(fresh(), 'Cubículo Enel', (c) => ({ ...c, se: FULL_SE, env: FULL_ENV }));
    expect(cabineProgress(complete.snapshot, complete.cabine.id)).toEqual({ missing: [], complete: true });
    const blank = withCabine(fresh(), 'Cubículo Enel', (c) => ({ ...c, se: { ...FULL_SE, type: '  ', primary_kv: { raw: '', unit: 'kV', state: 'empty' } }, env: FULL_ENV }));
    expect(cabineProgress(blank.snapshot, blank.cabine.id).missing.map((m) => m.key)).toEqual(['type', 'primary_kv']);
    // Not a cabine on this device: nothing to ask.
    expect(cabineProgress(complete.snapshot, TEMPLATE_ID)).toEqual({ missing: [], complete: true });
  });

  it('draws the collapsed line from the stored values in the seed order, leaving out what is not typed', () => {
    const { cabine } = withCabine(fresh(), 'Cubículo Enel', (c) => ({ ...c, se: FULL_SE, env: FULL_ENV }));
    expect(cabineLineText(cabine)).toBe('ALVENARIA - CONVENCIONAL · 13,8\u00a0kV · 380\u00a0V · 1.500\u00a0kVA · 25\u00a0°C · 65\u00a0%');
    expect(cabineLineText({ ...cabine, se: { ...FULL_SE, secondary_kv: null, installed_kva: null } })).toBe('ALVENARIA - CONVENCIONAL · 13,8\u00a0kV · 25\u00a0°C · 65\u00a0%');
  });

  it('E12-Q9: joins each value to its unit with a no-break space, so a wrap never splits "25" from "°C"', () => {
    const { cabine } = withCabine(fresh(), 'Cubículo Enel', (c) => ({ ...c, se: FULL_SE, env: FULL_ENV }));
    const measures = cabineLineText(cabine).split(' · ').slice(1);
    expect(measures).toHaveLength(5);
    for (const measure of measures) expect(measure).toMatch(/^[\d.,]+\u00a0\S+$/);
  });
});

describe('12.3-UNIT the cabine counts on its first sheet only', () => {
  it('adds the empty cabine fields to the placa step of the cabine first sheet, and never to another sheet', () => {
    const snapshot = fresh();
    const enel = snapshot.locations.find((l) => l.name === 'Cubículo Enel')!;
    const first = firstInTree(snapshot, enel.id)!;
    const other = snapshot.blocks.find((b) => b.id !== first && b.equipment_id !== null && cabineOf(snapshot.locations, b.location_id)?.id === enel.id)!;
    expect(isCabineFirstSheet(snapshot, first)).toBe(true);
    expect(isCabineFirstSheet(snapshot, other.id)).toBe(false);

    const firstBlock = snapshot.blocks.find((b) => b.id === first)!;
    const plateOnly = sheetProgress({ blocks: snapshot.blocks }, first).steps.placa.missing;
    expect(sheetProgress(snapshot, first).steps.placa.missing).toBe(plateOnly + 6 - (firstBlock.equipment_id !== null && tagPrefilled(snapshot, first) ? 1 : 0));
    const otherPlate = sheetProgress({ blocks: snapshot.blocks }, other.id).steps.placa.missing;
    expect(sheetProgress(snapshot, other.id).steps.placa.missing).toBe(otherPlate - (tagPrefilled(snapshot, other.id) ? 1 : 0));

    // E12-Q10: the Placa step carries its cabine share, so the header names it apart.
    expect(sheetProgress(snapshot, first).steps.placa.cabine).toBe(6);
    expect(sheetProgress(snapshot, other.id).steps.placa.cabine).toBeUndefined();

    const done = withCabine(snapshot, 'Cubículo Enel', (c) => ({ ...c, se: FULL_SE, env: FULL_ENV })).snapshot;
    expect(sheetProgress(done, first).steps.placa.missing).toBe(plateOnly - (tagPrefilled(snapshot, first) ? 1 : 0));
    expect(sheetProgress(done, first).steps.placa.cabine).toBeUndefined();
  });

  it('counts the block TAG as the prefilled nameplate TAG, so a seccionadora misses one field fewer', () => {
    const snapshot = fresh();
    const sec = snapshot.blocks.find((b) => b.block_type === 'chave_seccionadora' && !isCabineFirstSheet(snapshot, b.id))!;
    const cells = sheetProgress({ blocks: snapshot.blocks }, sec.id).steps.placa.missing;
    expect(sheetProgress(snapshot, sec.id).steps.placa.missing).toBe(cells - 1);
    // A typed TAG counts as itself; a cleared one is missing again (it no longer follows the block).
    const cleared = { ...sec, sheet: { ...sec.sheet, nameplate: { tag: { value: null, source_suggestion_id: null, op_id: TEMPLATE_ID } } } };
    expect(sheetProgress({ ...snapshot, blocks: snapshot.blocks.map((b) => (b.id === sec.id ? cleared : b)) }, sec.id).steps.placa.missing).toBe(cells);
  });

  it('writes "falta …" on the Sumário cabine row, null once complete and on a coluna', () => {
    const snapshot = fresh();
    const tree = locationTree(snapshot);
    expect(tree.find((node) => node.name === 'Cubículo Enel')!.metaMissing).toBe('faltam 6 campos');
    expect(tree.flatMap((node) => node.locations).every((coluna) => coluna.metaMissing === null)).toBe(true);
    const almost = withCabine(snapshot, 'Cubículo Enel', (c) => ({ ...c, se: FULL_SE, env: { ...FULL_ENV, humidity_pct: null } })).snapshot;
    expect(locationTree(almost).find((node) => node.name === 'Cubículo Enel')!.metaMissing).toBe('falta a umidade');
    const done = withCabine(snapshot, 'Cubículo Enel', (c) => ({ ...c, se: FULL_SE, env: FULL_ENV })).snapshot;
    expect(locationTree(done).find((node) => node.name === 'Cubículo Enel')!.metaMissing).toBeNull();
    // A cabine holding no equipment block has no sheet to fill it on: nothing is named (as in preIssue).
    const geradores = snapshot.locations.find((l) => l.name === 'Geradores')!;
    const inGeradores = new Set(snapshot.locations.filter((l) => l.id === geradores.id || l.parent_id === geradores.id).map((l) => l.id));
    const withoutEquipment = { ...snapshot, blocks: snapshot.blocks.filter((b) => b.location_id === null || !inGeradores.has(b.location_id)) };
    expect(locationTree(withoutEquipment).find((node) => node.name === 'Geradores')!.metaMissing).toBeNull();
    // Without the relatório row (no seed version) the tree names nothing missing.
    expect(locationTree({ locations: snapshot.locations, blocks: snapshot.blocks, equipment: snapshot.equipment })[0]!.metaMissing).toBeNull();
  });
});

/** Whether the block's definition has a TAG field its block TAG prefills. */
function tagPrefilled(snapshot: RelatorioSnapshot, blockId: string): boolean {
  const block = snapshot.blocks.find((b) => b.id === blockId)!;
  return ['chave_seccionadora', 'disjuntor_mt'].includes(block.block_type) && block.sheet.nameplate.tag === undefined;
}
