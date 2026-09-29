import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet, shoot } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { holdPhotoBytes } from './support/reading-ops.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 9.5-E2E: the NC observation draft on the sheet, driven as a person would. A photo taken
 * from an NC row asks for that row's draft (`nc_obs`); its bytes stay on the device
 * (`holdPhotoBytes`: no reading job runs), and the drafts are written the way the reading
 * job writes them (`pushSuggestion`) and pulled with "Sincronizar agora". The draft shows
 * above the Observation field with "Usar"; typing instead keeps the typed text and discards
 * it; a row that is not NC shows none. The real job's path is `prose-reading-pipeline.spec.ts`.
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  meta: { source_suggestion_id?: string } | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const rowOf = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const DRAFT = 'Oxidação aparente na estrutura do equipamento.';

async function mark(row: Locator, name: 'Conforme' | 'Não conforme'): Promise<void> {
  const radio = row.getByRole('radio', { name, exact: true });
  await radio.click();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
}

async function draftOn(page: Page, ids: { relatorioId: string; blockId: string }, itemKey: string, text: string): Promise<string> {
  return pushSuggestion(account.companyId, ids.relatorioId, {
    targetPath: `sheet/${ids.blockId}/checklist/${itemKey}/observation`,
    value: text,
    bbox: [0, 0, 1, 1],
    actorId: account.userId,
  });
}

test('@p0 9.5-E2E-001 an NC row photo asks for the draft; the draft shows above the Observation with "Usar", which writes it with its provenance; typing instead keeps the text and discards it; a C row shows none', async ({ page }) => {
  test.setTimeout(240_000);
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database);

  // Contatos (item 8) NC, one photo from its row: the create asks for that row's draft.
  const contatos = rowOf(page, 'contatos');
  await mark(contatos, 'Não conforme');
  await contatos.getByRole('button', { name: 'Adicionar foto' }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  const create = (await outbox(page)).find((op) => op.kind === 'create' && op.path === `file/${photo!.id}`)!;
  expect(create.value).toMatchObject({
    block_id: ids.blockId,
    item_key: 'contatos',
    reading_kind: 'nc_obs',
    reading_target: { block_id: ids.blockId, block_type: 'chave_seccionadora', item_key: 'contatos' },
    reading_status: 'queued',
  });

  // Conexões (item 7) NC with nothing typed, Isoladores (item 6) C.
  const conexoes = rowOf(page, 'conexoes');
  await mark(conexoes, 'Não conforme');
  const isoladores = rowOf(page, 'isoladores');
  await mark(isoladores, 'Conforme');

  const contatosDraft = await draftOn(page, ids, 'contatos', DRAFT);
  const conexoesDraft = await draftOn(page, ids, 'conexoes', 'Conexão com sinais de aquecimento.');
  const isoladoresDraft = await draftOn(page, ids, 'isoladores', 'Isolador trincado.');
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  // The draft sits above the empty Observation field; nothing is written yet.
  const draft = contatos.getByRole('group', { name: 'Rascunho da observação do item 8' });
  await expect(draft).toBeVisible({ timeout: 30_000 });
  await expect(draft.locator('.sv-kicker')).toHaveText('Rascunho pela foto');
  await expect(draft.locator('.sv')).toContainText(DRAFT);
  await expect(draft.locator('.suggested-pill')).toHaveText('Sugerido');
  const observation = contatos.getByRole('textbox', { name: 'Observação do item 8' });
  await expect(observation).toHaveValue('');
  const draftBox = await draft.boundingBox();
  const fieldBox = await observation.boundingBox();
  expect(draftBox!.y).toBeLessThan(fieldBox!.y);
  expect((await outbox(page)).some((op) => op.path === `sheet/${ids.blockId}/checklist/contatos/observation`)).toBe(false);

  // A C row shows no draft, and the sweep after the pull discards it (it would hold the sheet open).
  await expect(isoladores.locator('.nc-draft')).toHaveCount(0);
  expect((await outbox(page)).find((op) => op.path === `suggestion/${isoladoresDraft}/status`)).toMatchObject({ value: 'discarded' });

  // "Usar": the observation written with its provenance, the draft confirmed, one batch.
  await draft.getByRole('button', { name: 'Usar o rascunho da observação do item 8' }).click();
  await expect(observation).toHaveValue(DRAFT);
  await expect(draft).toHaveCount(0);
  const used = (await outbox(page)).find((op) => op.path === `sheet/${ids.blockId}/checklist/contatos/observation`)!;
  expect(used).toMatchObject({ value: DRAFT, meta: { source_suggestion_id: contatosDraft } });
  expect((await outbox(page)).find((op) => op.path === `suggestion/${contatosDraft}/status`)).toMatchObject({ value: 'confirmed', batch_id: used.batch_id });

  // Typing on Conexões instead: the typed text stays, the draft is discarded.
  const other = conexoes.getByRole('group', { name: 'Rascunho da observação do item 7' });
  await expect(other).toBeVisible();
  const conexoesField = conexoes.getByRole('textbox', { name: 'Observação do item 7' });
  await conexoesField.click();
  await page.keyboard.type('Parafuso frouxo');
  await expect(other).toHaveCount(0);
  await expect(conexoesField).toHaveValue('Parafuso frouxo');
  await expect.poll(async () => (await outbox(page)).find((op) => op.path === `suggestion/${conexoesDraft}/status`)?.value ?? null, { timeout: 15_000 }).toBe('discarded');
  await conexoesField.blur();
  await expect
    .poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${ids.blockId}/checklist/conexoes/observation`).at(-1)?.value ?? null, { timeout: 15_000 })
    .toBe('Parafuso frouxo');
  expect((await outbox(page)).filter((op) => op.path === `sheet/${ids.blockId}/checklist/conexoes/observation`).every((op) => op.meta?.source_suggestion_id === undefined)).toBe(true);
});
