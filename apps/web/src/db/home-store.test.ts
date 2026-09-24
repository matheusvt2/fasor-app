import 'fake-indexeddb/auto';
import type { RelatorioRow } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { toRecord } from './commit.ts';
import {
  blockRowsOf,
  clientRows,
  equipmentRows,
  locationRows,
  originalFileCount,
  projectRow,
  projectRows,
  relatorioRow,
  relatorioRows,
  relatoriosOfProject,
  relatorioState,
  templateRows,
} from './home-store.ts';
import { openDatabase, type AppDatabase } from './schema.ts';

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0021-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const ids = (() => {
  let n = 0;
  return () => `019966b0-0022-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
})();

const RELATORIO = ids();
const TOMBSTONED = ids();
const PROJECT = ids();
const CLIENT = ids();
const MANUFACTURER = ids();
const TEMPLATE = ids();

function relatorio(id: string, removed_at: string | null): RelatorioRow {
  return {
    id,
    project_id: PROJECT,
    template_id: TEMPLATE,
    template_version: 1,
    seed_version: 'v1',
    status: 'em_campo',
    setup: {
      service_start: '2026-09-06',
      service_end: '2026-09-08',
      atividade: null,
      local: 'Torres A e B',
      responsible_user_id: null,
      cover_photo_file_id: null,
      escopo: null,
      exclusions: null,
      additional_info: null,
      art_trt_number: null,
      instrument_ids: [],
      site_altitude_m: null,
      site_altitude_confirmed: false,
      next_intervention_date: null,
      next_intervention_justification: null,
    },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at,
  };
}

async function seeded(): Promise<AppDatabase> {
  const db = await freshDb();
  await db.entities.bulkPut([
    toRecord(`relatorio:${RELATORIO}`, relatorio(RELATORIO, null)),
    toRecord(`relatorio:${TOMBSTONED}`, relatorio(TOMBSTONED, '2026-09-09T10:00:00.000Z')),
    toRecord(`project:${PROJECT}`, {
      id: PROJECT,
      client_id: CLIENT,
      name: 'Porto Seguro',
      site: null,
      removed_at: null,
    }),
    toRecord(`registry:${CLIENT}`, {
      id: CLIENT,
      kind: 'client',
      name: 'Seguradora Exemplo S.A.',
      cnpj: null,
      contact_name: null,
      contact_phone: null,
      sites: [],
      removed_at: null,
    }),
    toRecord(`registry:${MANUFACTURER}`, {
      id: MANUFACTURER,
      kind: 'manufacturer',
      name: 'Schneider',
      gender: 'm',
      number: 'singular',
      removed_at: null,
    }),
    toRecord(`template:${TEMPLATE}`, {
      id: TEMPLATE,
      name: 'Cabine primária — padrão',
      version: 1,
      seed_version: 'v1',
      blocks: [],
      skeleton: [],
      archived_at: null,
      removed_at: null,
    }),
  ]);
  return db;
}

describe('home-store', () => {
  it('reads the relatórios of this device and drops the tombstones', async () => {
    const db = await seeded();
    const rows = await relatorioRows(db);
    expect(rows.map((r) => r.id)).toEqual([RELATORIO]);
    expect(rows[0]!.setup.local).toBe('Torres A e B');
    db.close();
  });

  it('reads projects, only the client registries, and the templates', async () => {
    const db = await seeded();
    expect((await projectRows(db)).map((p) => p.id)).toEqual([PROJECT]);
    const clients = await clientRows(db);
    expect(clients.map((c) => c.id)).toEqual([CLIENT]);
    expect((await templateRows(db)).map((t) => t.name)).toEqual(['Cabine primária — padrão']);
    db.close();
  });

  it('drops a stored row its kernel schema no longer accepts instead of rendering it', async () => {
    const db = await seeded();
    await db.entities.put({
      entity: 'relatorio',
      id: 'not-a-uuid',
      relatorio_id: 'not-a-uuid',
      project_id: null,
      removed_at: null,
      row: { id: 'not-a-uuid' } as never,
    });
    expect((await relatorioRows(db)).map((r) => r.id)).toEqual([RELATORIO]);
    db.close();
  });

  it('counts one per file on this device, not one per stored variant', async () => {
    const db = await seeded();
    expect(await originalFileCount(db)).toBe(0);
    const photo = ids();
    const blob = () => new Blob(['x']);
    await db.files.bulkPut([
      { id: photo, variant: 'original', blob: blob(), acked: false, created_at: '2026-09-08T10:00:00.000Z' },
      // A thumb and a crop are variants, not more photos (AD-7). They carry their own
      // ids here only because `files` is still keyed by `id` alone; the count must
      // already ignore them, so widening that key later cannot inflate "fotos".
      { id: `${photo}-thumb`, variant: 'thumb', blob: blob(), acked: false, created_at: '2026-09-08T10:00:00.000Z' },
      { id: `${photo}-crop`, variant: 'crop', blob: blob(), acked: false, created_at: '2026-09-08T10:00:00.000Z' },
    ]);
    expect(await originalFileCount(db)).toBe(1);
    db.close();
  });

});

describe('home-store: the Project and Sumário readers (Story 4.1, 4.3)', () => {
  const LOCATION = ids();
  const BLOCK = ids();
  const REMOVED_BLOCK = ids();
  const EQUIPMENT = ids();

  async function withRelatorioRows(db: AppDatabase) {
    await db.entities.bulkPut([
      toRecord(`location:${LOCATION}`, {
        id: LOCATION,
        relatorio_id: RELATORIO,
        parent_id: null,
        kind: 'cabine',
        name: 'Cabine',
        order_key: 'a0',
        se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
        env: { altitude_m: null, temperature_c: null, humidity_pct: null },
        agrupar_por_tipo: false,
        removed_at: null,
      }),
      toRecord(`block:${BLOCK}`, block(BLOCK, null)),
      toRecord(`block:${REMOVED_BLOCK}`, block(REMOVED_BLOCK, '2026-09-09T10:00:00.000Z')),
      toRecord(`equipment:${EQUIPMENT}`, { id: EQUIPMENT, project_id: PROJECT, tag: 'SEC-C01', type: 'chave_seccionadora', last_nameplate: null, removed_at: null }),
    ]);
  }

  function block(id: string, removed_at: string | null) {
    return {
      id,
      relatorio_id: RELATORIO,
      location_id: LOCATION,
      equipment_id: EQUIPMENT,
      block_type: 'chave_seccionadora',
      config: {},
      seed_version: 'v1',
      order_key: 'a0',
      feeds_block_id: null,
      not_tested: null,
      concluded_by: null,
      sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
      created_by: null,
      first_edited_at: null,
      last_modified_by: null,
      last_modified_at: null,
      removed_at,
    };
  }

  it('reads one live project and relatório by id, null for a tombstone or an unknown id', async () => {
    const db = await seeded();
    expect((await projectRow(db, PROJECT))?.name).toBe('Porto Seguro');
    expect((await relatorioRow(db, RELATORIO))?.id).toBe(RELATORIO);
    expect(await relatorioRow(db, TOMBSTONED)).toBeNull();
    expect(await projectRow(db, ids())).toBeNull();
    db.close();
  });

  it('reads the live relatórios of a project, the locations, every block (tombstones included) and the equipment', async () => {
    const db = await seeded();
    await withRelatorioRows(db);
    expect((await relatoriosOfProject(db, PROJECT)).map((r) => r.id)).toEqual([RELATORIO]);
    expect((await locationRows(db, RELATORIO)).map((l) => l.name)).toEqual(['Cabine']);
    expect((await blockRowsOf(db, RELATORIO)).map((b) => b.id).sort()).toEqual([BLOCK, REMOVED_BLOCK].sort());
    expect((await equipmentRows(db, PROJECT)).map((e) => e.tag)).toEqual(['SEC-C01']);
    expect(await blockRowsOf(db, ids())).toEqual([]);
    db.close();
  });

  it('assembles the snapshot state of one relatório, null when this device holds none', async () => {
    const db = await seeded();
    await withRelatorioRows(db);
    const state = (await relatorioState(db, RELATORIO))!;
    expect([...state.keys()].sort()).toEqual(
      [`relatorio:${RELATORIO}`, `project:${PROJECT}`, `location:${LOCATION}`, `block:${BLOCK}`, `block:${REMOVED_BLOCK}`, `equipment:${EQUIPMENT}`, `registry:${CLIENT}`, `registry:${MANUFACTURER}`].sort(),
    );
    expect(await relatorioState(db, TOMBSTONED)).toBeNull();
    db.close();
  });
});
