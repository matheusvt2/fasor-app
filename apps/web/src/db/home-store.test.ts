import 'fake-indexeddb/auto';
import type { RelatorioRow } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { toRecord } from './commit.ts';
import {
  clientRows,
  companySummaryRelatorios,
  originalFileCount,
  projectRows,
  relatorioRows,
  templateRows,
} from './home-store.ts';
import { COMPANY_STREAM, openDatabase, type AppDatabase } from './schema.ts';

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
      name: 'Porto Seguro Companhia de Seguros Gerais',
      cnpj: null,
      address: null,
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

  it('reads the company summary from the company sync_state row', async () => {
    const db = await seeded();
    expect(await companySummaryRelatorios(db)).toEqual([]);
    await db.sync_state.put({
      id: COMPANY_STREAM,
      cursor_seq: 12,
      complete: true,
      files_pending: 0,
      downloaded_at: null,
      last_sync_at: null,
      last_push_at: [],
      relatorios: [
        { id: RELATORIO, project_id: PROJECT, status: 'emitido', template_id: TEMPLATE, seed_version: 'v1', updated_seq: 12 },
      ],
    });
    expect((await companySummaryRelatorios(db)).map((r) => r.status)).toEqual(['emitido']);
    db.close();
  });
});
