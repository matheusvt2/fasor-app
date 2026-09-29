import { makeOp, SERVER_DEVICE_ID, suggestionPath, type JsonValue, type OpInput, type SuggestionRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';
import { asCompanyId } from '../../apps/api/src/db/repositories/company-id.ts';
import { newId } from '../../apps/api/src/ids.ts';
import { applyOps } from '../../apps/api/src/sync/apply.ts';
import { expect, signIn, type SeedAccount } from './merged-fixtures.ts';
import { pushNewRelatorio } from './relatorio-seed.ts';
import { resetEmpresaB } from './reset-empresa-b.ts';

/*
 * Stories 8.2 and 8.6 (batch P): the reading job's own writes, made the way the job makes
 * them (batch R owns the job): `file/{id}/reading_status` puts as `system:reading` and the
 * `suggestion/{id}` creates of one reading run, applied as the server
 * (`applyOps(..., {origin: 'server'})`, the pattern of `push-server-ops.ts`), so the device
 * pulls them on its next sync. Test-only; no production endpoint writes either.
 */

/** The reading job's actor (AD-3 `system:reading`). */
export const READING_ACTOR = 'system:reading';

async function applyAsServer(companyId: string, inputs: readonly OpInput[], what: string): Promise<void> {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    const at = new Date();
    const ops = inputs.map((input) => makeOp(input, { newId, now: at }));
    const result = await applyOps(db, asCompanyId(companyId), ops, { origin: 'server', now: () => at });
    if (result.rejected.length > 0) throw new Error(`${what} rejected: ${JSON.stringify(result.rejected)}`);
  } finally {
    await sql.end();
  }
}

/** E9-Q3: the row the server holds for `entity`/`id` in `companyId`, or undefined. */
export async function serverRow(companyId: string, entity: 'file' | 'suggestion' | 'block' | 'equipment', id: string): Promise<Record<string, unknown> | undefined> {
  const config = loadConfig();
  const { sql } = createDb(config.DATABASE_URL);
  try {
    const [found] = await sql<{ row: Record<string, unknown> }[]>`select row from entities where company_id = ${companyId} and entity = ${entity} and id = ${id}`;
    return found?.row;
  } finally {
    await sql.end();
  }
}

/** The reading job moving a photo's reading on: `file/{id}/reading_status = status`. */
export async function pushReadingStatus(
  companyId: string,
  relatorioId: string,
  photoId: string,
  status: 'queued' | 'running' | 'done' | 'failed',
  actorId: string = READING_ACTOR,
): Promise<void> {
  await applyAsServer(
    companyId,
    [
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: companyId,
        project_id: null,
        relatorio_id: relatorioId,
        path: `file/${photoId}/reading_status`,
        value: status,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: actorId,
        device_id: SERVER_DEVICE_ID,
      },
    ],
    'reading_status op',
  );
}

/** One field of a plate reading: its value, trust, source region, mode and (for a new manufacturer) its hint. */
export interface PlateField {
  value: JsonValue;
  trust?: SuggestionRow['trust'];
  bbox: SuggestionRow['source']['bbox'];
  hint?: SuggestionRow['hint'];
  /** `replace` when the target cell was filled before the reading (the job writes it so). */
  mode?: SuggestionRow['mode'];
}

/**
 * The reading job's run over the fixture plate (`services/ocr/tests/fixtures/plate-transformador.md`,
 * batch R's final fixture contract): eleven suggestions, all from the plate photo. Nine
 * grounded `suggested` without hint, the unknown manufacturer "Celtta" `suggested` with its
 * create hint, TAP ATUAL `verify` with one wrong digit ("5", the plate prints 3), none for
 * VOL. ÓLEO; `mode: 'replace'` on the keys in `filled` (cells the engineer typed first).
 */
export function transformerPlateFields(filled: readonly string[] = []): Record<string, PlateField> {
  const box = (row: number, col: number): [number, number, number, number] => [0.05 + col * 0.45, 0.12 + row * 0.12, 0.45 + col * 0.45, 0.2 + row * 0.12];
  const fields: Record<string, PlateField> = {
    identificacao: { value: 'TR-01', bbox: box(0, 0) },
    fabricacao: { value: 'Celtta', bbox: box(0, 1), hint: { create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } } },
    n_serie: { value: '240815-07', bbox: box(1, 0) },
    tipo: { value: 'TSE-500/15', bbox: box(1, 1) },
    tipo_de_isolacao: { value: 'EPÓXI', bbox: box(2, 0) },
    potencia_nominal: { value: { raw: '500', unit: 'kVA', state: 'measured' }, bbox: box(2, 1) },
    tap_atual: { value: '5', trust: 'verify', bbox: box(3, 0) },
    data_fabricacao: { value: '2024-08', bbox: box(3, 1) },
    tensao_nominal_at: { value: { raw: '15', unit: 'kV', state: 'measured' }, bbox: box(4, 0) },
    tensao_nominal_bt: { value: { raw: '380', unit: 'V', state: 'measured' }, bbox: box(4, 1) },
    ligacao_secundaria: { value: 'Dyn1', bbox: box(5, 0) },
  };
  for (const key of filled) if (fields[key] !== undefined) fields[key] = { ...fields[key]!, mode: 'replace' };
  return fields;
}

/**
 * One reading run of a plate photo: a pending `suggestion` create per field, all citing the
 * photo and one `reading_run_id` (the arrival toast counts runs). Returns the ids by field.
 */
export async function pushPlateSuggestions(
  companyId: string,
  relatorioId: string,
  plate: { blockId: string; photoId: string; fields: Record<string, PlateField> },
  actorId: string = READING_ACTOR,
): Promise<Record<string, string>> {
  const run = newId();
  const ids: Record<string, string> = {};
  const inputs: OpInput[] = [];
  for (const [key, field] of Object.entries(plate.fields)) {
    const row: SuggestionRow = {
      id: newId(),
      relatorio_id: relatorioId,
      target_path: `sheet/${plate.blockId}/nameplate/${key}`,
      value: field.value,
      trust: field.trust ?? 'suggested',
      mode: field.mode ?? 'fill',
      source: { photo_id: plate.photoId, bbox: field.bbox, ocr_token_ids: ['t0'], reading_run_id: run },
      status: 'pending',
      prompt_version: 'e2e-1',
      hint: field.hint ?? null,
    };
    ids[key] = row.id;
    inputs.push({
      kind: 'create',
      scope: 'relatorio',
      company_id: companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: suggestionPath(row.id),
      value: row as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: actorId,
      device_id: SERVER_DEVICE_ID,
    });
  }
  await applyAsServer(companyId, inputs, 'suggestion op');
  return ids;
}

/**
 * Keeps the photo bytes on the device: every `PUT /api/files/{id}` is answered the retryable
 * `409 file_row_missing` (the uploader defers quietly: no error pill, no failed cycle), so
 * the server holds the photo row (its create op is pushed) but never receives the file, and
 * no reading job starts for it (Story 8.4 enqueues one on file receipt). The seeded reading
 * ops are then the only ones the device sees. Returns the ids of the photos the device tried.
 */
export async function holdPhotoBytes(page: Page): Promise<string[]> {
  const tried: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/files/'),
    async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      tried.push(new URL(route.request().url()).pathname.split('/')[3] ?? '');
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'file_row_missing', message: 'e2e: held on the device' }) });
    },
  );
  return tried;
}

/**
 * Resets Empresa B, signs in, pushes a relatório of the standard template and opens its
 * Oxigênio "Transformador de força" sheet (the Flow 2b plate is a transformer's) through the
 * tree, by the row's type.
 */
export async function openTransformerSheet(page: Page, account: SeedAccount, database: string, options: { width?: number } = {}): Promise<{ relatorioId: string; blockId: string }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: options.width ?? 1280, height: 900 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  const tree = page.getByRole('list', { name: 'Locais do relatório' });
  await expect(tree).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expandir Oxigênio' });
  if ((await expand.count()) > 0) await expand.click();
  const cabine = tree.locator(':scope > li.s9-cabine').filter({ has: page.locator(':scope > .s9-cab-row .s9-cab-name', { hasText: 'Oxigênio' }) });
  const row = cabine
    .locator(':scope > .s9-eqs > li.s9-eq')
    .filter({ has: page.locator('.s9-eq-name', { hasText: /^Transformador de força$/ }) })
    .first();
  await expect(row).toBeVisible();
  const blockId = (await row.getAttribute('data-block-id'))!;
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  return { relatorioId, blockId };
}
