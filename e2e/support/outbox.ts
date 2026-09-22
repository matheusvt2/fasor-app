import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, makeOp, targetsOf, type Op, type OpInput } from '@app/domain';
import type { APIRequestContext, Page } from '@playwright/test';
import { newId } from '../../apps/api/src/ids.ts';

/**
 * Seeds the device outbox the way a capture surface would have left it: ops built with
 * the kernel's `makeOp` in Node, written as `pending` rows (with their `targets`) into
 * `releng-{user_id}` through raw IndexedDB. Dexie's live queries do not observe raw
 * writes, so a spec reloads the page after seeding.
 */

export interface SeedUser {
  companyId: string;
  userId: string;
  /** This device's id from `local_prefs`, so the pushed ops read as "Este aparelho". */
  deviceId: string;
}

function op(user: SeedUser, input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id'>): Op {
  return makeOp(
    {
      company_id: user.companyId,
      actor_id: user.userId,
      device_id: user.deviceId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      ...input,
    },
    { newId, now: new Date() },
  );
}

export function clientCreateOp(user: SeedUser, clientId = newId()): Op {
  return op(user, {
    kind: 'create',
    scope: 'company',
    path: `registry/client/${clientId}`,
    value: { id: clientId, kind: 'client', name: 'Cliente E2E', cnpj: null, address: null, removed_at: null },
  });
}

export function projectCreateOp(user: SeedUser, projectId = newId(), clientId: string | null = null): Op {
  return op(user, {
    kind: 'create',
    scope: 'company',
    path: `project/${projectId}`,
    value: { id: projectId, client_id: clientId, name: 'Projeto E2E', site: null, removed_at: null },
  });
}

export interface RelatorioSeed {
  status?: 'rascunho' | 'em_campo' | 'em_revisao' | 'emitido';
  local?: string | null;
  serviceStart?: string | null;
  serviceEnd?: string | null;
}

export function relatorioCreateOp(
  user: SeedUser,
  relatorioId = newId(),
  projectId = newId(),
  seed: RelatorioSeed = {},
): Op {
  return op(user, {
    kind: 'create',
    scope: 'relatorio',
    relatorio_id: relatorioId,
    path: `relatorio/${relatorioId}`,
    value: {
      id: relatorioId,
      project_id: projectId,
      template_id: null,
      template_version: null,
      seed_version: 'v1',
      status: seed.status ?? 'rascunho',
      setup: {
        service_start: seed.serviceStart ?? null,
        service_end: seed.serviceEnd ?? null,
        atividade: null,
        local: seed.local ?? null,
        responsible_user_id: null,
        cover_photo_file_id: null,
      },
      export: { scheme: 'por_local_e_tipo' },
      preview_file_id: null,
      removed_at: null,
    },
  });
}

/** A server-only family from a client: the server answers `op_server_only` (AD-3). */
export function serverOnlyOp(user: SeedUser, fileId = newId(), relatorioId = newId()): Op {
  return op(user, {
    kind: 'put',
    scope: 'relatorio',
    relatorio_id: relatorioId,
    path: `file/${fileId}/uploaded_at`,
    value: new Date().toISOString(),
  });
}

interface SeedArgs {
  name: string;
  rows: unknown[];
}

/** Writes the ops as `pending` outbox rows with their `targets`. */
export async function seedOutbox(page: Page, database: string, ops: readonly Op[]): Promise<void> {
  const rows: unknown[] = ops.map((o) => ({
    ...o,
    status: 'pending',
    error_code: null,
    targets: targetsOf(o).map((ref) => ref.key),
  }));
  const args: SeedArgs = { name: database, rows };
  await page.evaluate(async ({ name, rows }: SeedArgs) => {
    const open = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = open.transaction('outbox', 'readwrite');
      for (const row of rows) tx.objectStore('outbox').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    open.close();
  }, args);
}

/** The device id the sync provider minted into `local_prefs` on sign-in (retried while it lands). */
export async function readDeviceId(page: Page, database: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const prefs = await readStore<{ key: string; value: unknown }>(page, database, 'local_prefs');
    const value = prefs.find((p) => p.key === 'device_id')?.value;
    if (typeof value === 'string' && value !== '') return value;
    await page.waitForTimeout(100);
  }
  throw new Error('device_id was never written to local_prefs');
}

interface ReadArgs {
  name: string;
  store: string;
}

/** Every row of one store of the device database. */
export async function readStore<T = unknown>(page: Page, database: string, store: string): Promise<T[]> {
  const args: ReadArgs = { name: database, store };
  const rows: unknown[] = await page.evaluate(async ({ name, store }: ReadArgs) => {
    const open = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise<unknown[]>((resolve, reject) => {
      const request = open.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    open.close();
    return all;
  }, args);
  return rows as T[];
}

export interface FileBlobSummary {
  id: string;
  variant: string;
  acked: boolean;
  name: string | null;
  size: number;
}

/**
 * The `files` store without the Blobs: a Blob cannot cross `page.evaluate`, so the rows
 * are projected in the browser and only their summary comes back.
 */
export async function readFileBlobs(page: Page, database: string): Promise<FileBlobSummary[]> {
  return page.evaluate(async (name: string) => {
    const open = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise<{ id: string; variant: string; acked: boolean; name?: string; blob: Blob }[]>(
      (resolve, reject) => {
        const request = open.transaction('files', 'readonly').objectStore('files').getAll();
        request.onsuccess = () => resolve(request.result as never);
        request.onerror = () => reject(request.error);
      },
    );
    open.close();
    return all.map((row) => ({
      id: row.id,
      variant: row.variant,
      acked: row.acked,
      name: row.name ?? null,
      size: row.blob?.size ?? 0,
    }));
  }, database);
}

/** Pulls one stream to its head through the contract, page by page, and returns every op. */
export async function pullAll(request: APIRequestContext, path: string): Promise<{ ops: Op[]; seq: number }> {
  const ops: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await request.get(`${path}?since=${since}`, {
      headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    });
    if (!res.ok()) throw new Error(`${path} answered ${res.status()}: ${await res.text()}`);
    const page = (await res.json()) as { ops: Op[]; seq: number };
    ops.push(...page.ops);
    const last = page.ops.at(-1)?.seq;
    if (last === undefined || last >= page.seq) return { ops, seq: page.seq };
    since = last;
  }
}
