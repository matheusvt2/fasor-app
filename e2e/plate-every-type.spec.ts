import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { BASE_EQUIPMENT_BLOCK_TYPES, equipmentTypesOf, getDefinition, initialOrderKey, isLibraryType, newEquipmentBlock, SEED_VERSION, TAG_PREFIX, type EquipmentBlockType } from '@app/domain';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos } from './support/photos.ts';
import { openSheetOfType } from './support/reading-ops.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 13.7 (E8-A3, E78-Q2 closed): the plate tile on every block type, over the real reading
 * job under the compose api's `fake` providers. For each of the six types with a nameplate,
 * "Fotografar placa" on its sheet imports that type's synthetic plate through the system
 * picker (no camera: the device re-encodes the file, so only the type's default fixture can
 * read it), and the type's suggestions arrive without a "Sincronizar agora". The two cable
 * types have no nameplate in FO.SERV-03 (addendum §9): their sheets show
 * neither the nameplate nor the tile (spec OQ-1).
 *
 * Story 14.5: the library type of seed v5 (the Chave de transferência automática) has a
 * nameplate and its own synthetic plate too. The standard template places none, so its sheet
 * is created on the local Geradores by office ops, as the palette creates it, and read the
 * same way (14.5-E2E-004). Story 14.9: the Quadro elétrico (QGBT/QD) of seed v6 the same way.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

const root = resolve(import.meta.dirname, '..');
const FIXTURES = resolve(root, 'apps/api/src/jobs/reading/fixtures');

/** Each type's committed synthetic plate and the cabine of the standard template where the tree shows its row. */
const PLATES: Record<string, { image: string; cabine: string }> = {
  para_raio: { image: resolve(FIXTURES, 'images/plate-para-raio.png'), cabine: 'Oxigênio' },
  chave_seccionadora: { image: resolve(FIXTURES, 'images/plate-chave-seccionadora.png'), cabine: 'Oxigênio' },
  disjuntor_mt: { image: resolve(FIXTURES, 'images/plate-disjuntor-mt.png'), cabine: 'Cobertura A' },
  tp: { image: resolve(FIXTURES, 'images/plate-tp.png'), cabine: 'Geradores' },
  tc: { image: resolve(FIXTURES, 'images/plate-tc.png'), cabine: 'Geradores' },
  transformador_forca: { image: resolve(root, 'services/ocr/tests/fixtures/plate-transformador.jpg'), cabine: 'Oxigênio' },
};
const CABLES: Record<string, string> = { cabos_entrada: 'Oxigênio', cabos_saida: 'Oxigênio' };

interface FixtureValue {
  key: string;
  value: unknown;
}

/** The structured values of the fixture named after the committed image's sha256. */
function fixtureValues(image: Buffer): FixtureValue[] {
  const sha = createHash('sha256').update(image).digest('hex');
  return (JSON.parse(readFileSync(resolve(FIXTURES, `${sha}.json`), 'utf8')) as { structuring: { values: FixtureValue[] } }).structuring.values;
}

interface EntityRecord {
  entity: string;
  id: string;
  row: { reading_status?: string; status?: string; source?: { photo_id: string } };
}

const section = (page: Page) => page.locator('#ficha-nameplate');

/** "Fotografar placa" on the open sheet of `type`: the committed plate goes through the system picker, the real job reads it, and its suggestions arrive without a manual sync. */
async function readPlateThroughTheTile(page: Page, type: string, image: string, blockId: string): Promise<void> {
  const bytes = readFileSync(image);
  const values = fixtureValues(bytes);

  // No camera on this device: the tile opens the system picker, which gets the plate.
  const chooser = page.waitForEvent('filechooser');
  await section(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  const mimeType = image.endsWith('.png') ? 'image/png' : 'image/jpeg';
  await (await chooser).setFiles({ name: image.endsWith('.png') ? 'placa.png' : 'placa.jpg', mimeType, buffer: bytes });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const photoId = (await devicePhotos(page, database))[0]!.id;
  const create = (await readStore<{ kind: string; path: string; value: { reading_target: { block_id: string; block_type: string } } }>(page, database, 'outbox')).find(
    (op) => op.kind === 'create' && op.path === `file/${photoId}`,
  )!;
  expect(create.value.reading_target).toMatchObject({ block_id: blockId, block_type: type });

  // No "Sincronizar agora" from here: the upload, the job and the pulls run on their own.
  const first = values[0]!;
  const suggested = page.locator(`#ficha-nameplate [data-field-key="${first.key}"] .field.suggestion-field`);
  await expect(suggested).toBeVisible({ timeout: 30_000 });
  if (typeof first.value === 'string') await expect(suggested.locator('input')).toHaveValue(first.value);

  await expect
    .poll(async () => {
      const records = await readStore<EntityRecord>(page, database, 'entities');
      return {
        status: records.find((record) => record.entity === 'file' && record.id === photoId)?.row.reading_status,
        pending: records.filter((record) => record.entity === 'suggestion' && record.row.status === 'pending' && record.row.source?.photo_id === photoId).length,
      };
    })
    .toEqual({ status: 'done', pending: values.length });
}

// The eight FO.SERV-03 types: the ones the standard template places.
for (const type of BASE_EQUIPMENT_BLOCK_TYPES) {
  const label = getDefinition(SEED_VERSION, 'cabine_primaria', type).label;
  const plate = PLATES[type];

  if (plate === undefined) {
    test(`@p1 13.7-E2E-001 ${type}: the sheet has no "Dados de placa" and no "Fotografar placa" (a cabine's first sheet keeps its Placa step for the cabine fields only)`, async ({ page }) => {
      test.setTimeout(120_000);
      await openSheetOfType(page, account, database, { cabine: CABLES[type]!, typeLabel: label });
      await expect(page.locator('#ficha-step-verificacoes')).toBeVisible();
      await expect(section(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Fotografar placa' })).toHaveCount(0);
    });
    continue;
  }

  test(`@p1 13.7-E2E-002 ${type}: a plate imported through "Fotografar placa" is read by the real job and its suggestions arrive without a manual sync`, async ({ page }) => {
    test.setTimeout(180_000);
    const { blockId } = await openSheetOfType(page, account, database, { cabine: plate.cabine, typeLabel: label });
    await readPlateThroughTheTile(page, type, plate.image, blockId);
  });
}

// Story 14.5: the library type of seed v5; Story 14.9: the one of seed v6. Read from the kernel (E14-A3).
const LIBRARY_PLATES: Record<string, string> = {
  chave_transferencia_automatica: resolve(FIXTURES, 'images/plate-chave-transferencia-automatica.png'),
  quadro_eletrico: resolve(FIXTURES, 'images/plate-quadro-eletrico.png'),
};
const LIBRARY_TYPES = equipmentTypesOf(SEED_VERSION).filter((type) => isLibraryType(SEED_VERSION, type));

/**
 * Resets Empresa B, signs in, pushes a relatório of the standard template with one sheet of the
 * library type created on the local `cabine` from the office (the standard template places
 * none), and opens that sheet by its address.
 */
async function openLibrarySheet(page: Page, cabine: string, type: EquipmentBlockType): Promise<{ blockId: string }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const local = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === cabine)!.value as { id: string };
  const { equipment, block } = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: local.id,
    type,
    tag: `${TAG_PREFIX[type]}-GERADORES`,
    seedVersion: SEED_VERSION,
    // After the local's own blocks.
    orderKey: initialOrderKey(999),
  });
  // Status flow 2026-10-10: Em campo from the start, as a relatório being filled on site is.
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
    officeDraft(account, { relatorioId: built.relatorioId }, `block/${block.id}`, block, 'create'),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${block.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(getDefinition(SEED_VERSION, 'cabine_primaria', type).label, { timeout: 30_000 });
  return { blockId: block.id };
}

test('@p1 14.9-E2E-005 every library type of the current seed has its committed plate here', () => {
  expect(LIBRARY_TYPES.length).toBeGreaterThan(0);
  expect([...LIBRARY_TYPES].sort()).toEqual(Object.keys(LIBRARY_PLATES).sort());
});

for (const type of LIBRARY_TYPES) {
  test(`@p1 14.5-E2E-004 ${type}: the library type's plate imported through "Fotografar placa" is read by the real job and its suggestions arrive without a manual sync`, async ({ page }) => {
    test.setTimeout(180_000);
    const { blockId } = await openLibrarySheet(page, 'Geradores', type);
    await expect(section(page)).toBeVisible();
    await readPlateThroughTheTile(page, type, LIBRARY_PLATES[type]!, blockId);
  });
}
