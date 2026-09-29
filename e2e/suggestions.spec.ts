import type { JsonValue } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, horizontalOverflow, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * 8.1-E2E: a Suggestion is an entity nobody can write without a tap. Every test resets
 * Empresa B, pushes a relatório of the standard template, opens the first Chave
 * seccionadora of Cubículo Enel, then writes pending suggestions on its nameplate the way
 * the reading job will (server ops, `push-server-ops.ts`) and pulls them with "Sincronizar
 * agora", as the device would at the first signal. From there everything is a person's
 * taps and keys: Confirmar, Confirmar todos, typing over a guess, Substituir, and the
 * device's own auto-confirm of a value the engineer had already typed.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  op_id: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  meta: { source_suggestion_id?: string; auto?: boolean } | null;
  status: string;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const suggestionOf = (page: Page, key: string): Locator => field(page, key).locator('.field.suggestion-field');

/** Writes pending suggestions on the sheet's nameplate and pulls them; returns their ids by field. */
async function suggest(
  page: Page,
  ids: { relatorioId: string; blockId: string },
  entries: Record<string, { value: JsonValue; trust?: 'suggested' | 'verify'; photoId?: string }>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(entries)) {
    out[key] = await pushSuggestion(account.companyId, ids.relatorioId, {
      targetPath: `sheet/${ids.blockId}/nameplate/${key}`,
      value: entry.value,
      ...(entry.trust === undefined ? {} : { trust: entry.trust }),
      ...(entry.photoId === undefined ? {} : { photoId: entry.photoId }),
      bbox: [0.2, 0.3, 0.6, 0.45],
      actorId: account.userId,
    });
  }
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  return out;
}

/** The value the device holds for one nameplate cell, and its provenance. */
async function cell(page: Page, blockId: string, key: string): Promise<{ value: unknown; source_suggestion_id: string | null } | undefined> {
  const records = await readStore<{ entity: string; id: string; row: { sheet: { nameplate: Record<string, { value: unknown; source_suggestion_id: string | null }> } } }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.id === blockId)?.row.sheet.nameplate[key];
}

async function suggestionStatus(page: Page, id: string): Promise<string | undefined> {
  const records = await readStore<{ entity: string; id: string; row: { status: string } }>(page, database, 'entities');
  return records.find((record) => record.entity === 'suggestion' && record.id === id)?.row.status;
}

/** What the Sumário header says: its counts, read off the page. */
async function sumarioHeader(page: Page, relatorioId: string): Promise<Locator> {
  await page.goto(`/relatorio/${relatorioId}`);
  const summary = page.getByRole('group', { name: 'Resumo do relatório' });
  await expect(summary).toBeVisible({ timeout: 30_000 });
  return summary;
}

test('@p0 8.1-E2E-001 Confirmar writes the status and the value as one batch with the provenance; the field turns confirmed with its glyph and the Sumário count drops', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  const sid = await suggest(page, ids, { fabricacao: { value: 'Schneider' }, n_serie: { value: 'SU1240998' } });

  // The pending field: amber, "Sugerido", the value, a 48 px crop, the announced Confirmar.
  const fab = suggestionOf(page, 'fabricacao');
  await expect(fab).toHaveAttribute('data-state', 'suggested');
  await expect(fab.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(fab.locator('input.sv')).toHaveValue('Schneider');
  const crop = fab.getByRole('button', { name: /^Ver recorte da placa — Fabricação$/i });
  await expect(crop).toBeVisible();
  const cropBox = (await crop.boundingBox())!;
  expect(Math.round(cropBox.width)).toBe(48);
  expect(Math.round(cropBox.height)).toBe(48);
  await expect(crop.locator('[aria-label="Recorte da placa"], img[alt="Recorte da placa"]').first()).toBeAttached();
  const confirm = fab.getByRole('button', { name: 'Sugerido, Schneider, confirmar' });
  await expect(confirm).toBeVisible();
  // Nothing was written while it waited.
  expect((await outbox(page)).some((row) => row.path.includes('/nameplate/fabricacao'))).toBe(false);

  await confirm.click();
  await expect(toast(page)).toContainText('Schneider — confirmado');

  // One batch: the status put and the value put carrying the suggestion id.
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `suggestion/${sid.fabricacao}/status`).length).toBe(1);
  const rows = await outbox(page);
  const status = rows.find((row) => row.path === `suggestion/${sid.fabricacao}/status`)!;
  const value = rows.find((row) => row.path === `sheet/${ids.blockId}/nameplate/fabricacao`)!;
  expect(status.value).toBe('confirmed');
  expect(value.value).toBe('Schneider');
  expect(value.meta).toMatchObject({ source_suggestion_id: sid.fabricacao });
  expect(status.batch_id).not.toBeNull();
  expect(value.batch_id).toBe(status.batch_id);
  expect((await cell(page, ids.blockId, 'fabricacao'))?.source_suggestion_id).toBe(sid.fabricacao);

  // The field is the plain one now, in the confirmed state with its 24 px glyph (48 px hit area).
  const confirmed = page.locator('#ficha-nameplate .ficha-suggestion-confirmed[data-state="confirmed"]');
  await expect(confirmed).toHaveCount(1);
  await expect(confirmed.locator('[data-field-key="fabricacao"]')).toHaveCount(1);
  const glyph = page.locator('#ficha-nameplate .ficha-suggestion-confirmed .crop-thumb');
  const glyphBox = (await glyph.boundingBox())!;
  expect(Math.round(glyphBox.width)).toBe(24);
  expect(await glyph.evaluate((el) => getComputedStyle(el, '::before').top)).toBe('-12px');
  await expect(confirmed.locator('.suggested-pill, .confirm-btn')).toHaveCount(0);
  // The other suggestion still waits.
  await expect(suggestionOf(page, 'n_serie')).toHaveAttribute('data-state', 'suggested');

  // The Sumário counts the one still pending.
  const header = await sumarioHeader(page, ids.relatorioId);
  await expect(header.getByRole('button', { name: '1 sugestão por confirmar' })).toBeVisible();
});

test('@p0 8.1-E2E-002 Confirmar todos confirms the seven suggested fields in one batch, leaves the Verificar one pending and says so', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  const sid = await suggest(page, ids, {
    fabricacao: { value: 'Schneider' },
    n_serie: { value: 'SU1240998' },
    tipo: { value: 'Manual' },
    meio_de_extincao: { value: 'AR' },
    tensao_de_placa: { value: '15' },
    corrente_nominal: { value: { raw: '630', unit: 'A', state: 'measured' } },
    acionamento: { value: 'MANUAL/PUNHO' },
    data_de_fabricacao: { value: '2012-03', trust: 'verify' },
  });

  const section = page.locator('#ficha-nameplate');
  await expect(section).toHaveClass(/nameplate-extraction/);
  await expect(section.locator('.suggestion-group-head .section-note')).toHaveText(
    '8 sugestões lidas. Nada foi gravado: confirme um a um ou todos — o campo “Verificar” pede o seu toque.',
  );
  const verify = suggestionOf(page, 'data_de_fabricacao');
  await expect(verify).toHaveAttribute('data-state', 'verify');
  await expect(verify.locator('.verify-pill')).toHaveText('Verificar');
  await expect(verify.locator('input.sv')).toHaveValue('03/2012');
  await expect(verify.getByRole('button', { name: 'Verificar, 03/2012, confirmar' })).toBeVisible();
  // The number shows in the Measurement-field layout with its unit.
  await expect(suggestionOf(page, 'corrente_nominal').locator('.measurement-field input.mf-value')).toHaveValue('630');
  await expect(suggestionOf(page, 'corrente_nominal').locator('.mf-unit')).toHaveText('A');
  await expect(suggestionOf(page, 'tensao_de_placa').getByRole('button', { name: 'Sugerido, 15 kV, confirmar' })).toBeVisible();

  await section.locator('.suggestion-group-head').getByRole('button', { name: 'Confirmar todos (7)' }).click();
  await expect(toast(page)).toContainText('7 campos confirmados — 1 campo pede verificação');

  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith('suggestion/')).length).toBe(7);
  const rows = await outbox(page);
  const confirms = rows.filter((row) => row.path.startsWith('suggestion/') || row.path.startsWith(`sheet/${ids.blockId}/nameplate/`));
  expect(confirms).toHaveLength(14);
  expect(new Set(confirms.map((row) => row.batch_id)).size).toBe(1);
  for (const key of ['fabricacao', 'n_serie', 'tipo', 'meio_de_extincao', 'tensao_de_placa', 'corrente_nominal', 'acionamento']) {
    expect(rows.find((row) => row.path === `suggestion/${sid[key]}/status`)?.value).toBe('confirmed');
    expect(rows.find((row) => row.path === `sheet/${ids.blockId}/nameplate/${key}`)?.meta).toMatchObject({ source_suggestion_id: sid[key] });
  }
  expect(rows.some((row) => row.path === `suggestion/${sid.data_de_fabricacao}/status`)).toBe(false);
  expect(await suggestionStatus(page, sid.data_de_fabricacao!)).toBe('pending');
  await expect(verify).toHaveAttribute('data-state', 'verify');
  // The head stays for the Verificar field, without a button to confirm it in bulk.
  await expect(section.locator('.suggestion-group-head .section-note')).toHaveText('1 sugestão lida. Nada foi gravado até você confirmar — o campo “Verificar” pede o seu toque.');
  await expect(section.locator('.suggestion-group-head').getByRole('button')).toHaveCount(0);
  await expect(page.locator('#ficha-nameplate .ficha-suggestion-confirmed[data-state="confirmed"]')).toHaveCount(7);
});

test('@p0 8.1-E2E-003 typing over a suggested guess writes the typed value and discards that suggestion only', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  const sid = await suggest(page, ids, { fabricacao: { value: 'Schneider' }, n_serie: { value: 'SU1240998' }, corrente_nominal: { value: { raw: '630', unit: 'A', state: 'measured' } } });

  // A number that is no number shows the helper and writes nothing.
  const current = suggestionOf(page, 'corrente_nominal').locator('input.mf-value');
  await current.fill('abc');
  await current.press('Enter');
  await expect(suggestionOf(page, 'corrente_nominal').locator('.helper[data-tone="red"]')).toHaveText('Número não reconhecido');
  expect((await outbox(page)).some((row) => row.path.includes('corrente_nominal'))).toBe(false);

  const serie = suggestionOf(page, 'n_serie').locator('input.sv');
  await serie.fill('SU1240999');
  await serie.press('Enter');

  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `suggestion/${sid.n_serie}/status`).length).toBe(1);
  const rows = await outbox(page);
  const discard = rows.find((row) => row.path === `suggestion/${sid.n_serie}/status`)!;
  const typed = rows.find((row) => row.path === `sheet/${ids.blockId}/nameplate/n_serie`)!;
  expect(discard.value).toBe('discarded');
  expect(typed.value).toBe('SU1240999');
  // Contract 11: a plain put carries only the commit stamps (`merge/stamp.ts`), never a confirm's meta.
  expect(typed.meta?.source_suggestion_id).toBeUndefined();
  expect(typed.meta?.auto).toBeUndefined();
  expect(typed.batch_id).toBe(discard.batch_id);
  // The field is the plain one with the typed value; the others still wait.
  await expect(field(page, 'n_serie').locator('input')).toHaveValue('SU1240999');
  await expect(field(page, 'n_serie').locator('.suggestion-field')).toHaveCount(0);
  await expect(suggestionOf(page, 'fabricacao')).toHaveAttribute('data-state', 'suggested');
  expect(await suggestionStatus(page, sid.fabricacao!)).toBe('pending');
  expect(rows.some((row) => row.path === `suggestion/${sid.fabricacao}/status`)).toBe(false);
});

test('@p0 8.1-E2E-009 an edited guess confirmed with its "Confirmar" writes the typed value and discards the suggestion, never confirms it', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  const sid = await suggest(page, ids, { n_serie: { value: 'SU1240998' }, tipo: { value: 'Manual' } });

  const serie = suggestionOf(page, 'n_serie');
  await serie.locator('input.sv').fill('SU1240999');
  await serie.getByRole('button', { name: 'Sugerido, SU1240998, confirmar' }).click();

  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `suggestion/${sid.n_serie}/status`).length).toBe(1);
  const rows = await outbox(page);
  const statuses = rows.filter((row) => row.path === `suggestion/${sid.n_serie}/status`);
  expect(statuses.map((row) => row.value)).toEqual(['discarded']);
  const typed = rows.filter((row) => row.path === `sheet/${ids.blockId}/nameplate/n_serie`);
  expect(typed.map((row) => row.value)).toEqual(['SU1240999']);
  // Contract 11: a plain put carries only the commit stamps (`merge/stamp.ts`), never a confirm's meta.
  expect(typed[0]!.meta?.source_suggestion_id).toBeUndefined();
  expect(typed[0]!.meta?.auto).toBeUndefined();
  expect(typed[0]!.batch_id).toBe(statuses[0]!.batch_id);
  await expect(field(page, 'n_serie').locator('input')).toHaveValue('SU1240999');
  expect((await cell(page, ids.blockId, 'n_serie'))?.source_suggestion_id ?? null).toBeNull();
  await expect(page.locator('#ficha-nameplate .ficha-suggestion-confirmed')).toHaveCount(0);
  expect(await suggestionStatus(page, sid.tipo!)).toBe('pending');
});

test('@p0 8.1-E2E-004 a filled field receiving a different suggestion keeps its value and offers Substituir, which writes the confirm batch', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  const input = field(page, 'n_serie').locator('input');
  await input.fill('ABC123');
  await input.press('Enter');
  await expect.poll(async () => (await cell(page, ids.blockId, 'n_serie'))?.value).toBe('ABC123');

  const sid = await suggest(page, ids, { n_serie: { value: 'XYZ999' } });
  await expect(field(page, 'n_serie').locator('input')).toHaveValue('ABC123');
  const alt = field(page, 'n_serie').locator('.suggestion-alt');
  await expect(alt).toContainText('Sugerido: XYZ999');
  expect((await cell(page, ids.blockId, 'n_serie'))?.value).toBe('ABC123');
  expect(await suggestionStatus(page, sid.n_serie!)).toBe('pending');
  // A replace is never a fill: no group head, nothing to confirm in bulk.
  await expect(page.locator('#ficha-nameplate .suggestion-group-head')).toHaveCount(0);

  await alt.getByRole('button', { name: 'Substituir' }).click();
  await expect.poll(async () => (await cell(page, ids.blockId, 'n_serie'))?.value).toBe('XYZ999');
  const rows = await outbox(page);
  const status = rows.find((row) => row.path === `suggestion/${sid.n_serie}/status`)!;
  const value = rows.filter((row) => row.path === `sheet/${ids.blockId}/nameplate/n_serie`).find((row) => row.value === 'XYZ999')!;
  expect(status.value).toBe('confirmed');
  expect(value.meta).toMatchObject({ source_suggestion_id: sid.n_serie });
  expect(value.batch_id).toBe(status.batch_id);
  await expect(field(page, 'n_serie').locator('input')).toHaveValue('XYZ999');
  await expect(page.locator('#ficha-nameplate .ficha-suggestion-confirmed[data-state="confirmed"]')).toHaveCount(1);
  await expect(field(page, 'n_serie').locator('.suggestion-alt')).toHaveCount(0);
});

test('@p0 8.1-E2E-005 a filled field receiving an equal suggestion is confirmed by the device after "Sincronizar agora", once, with meta.auto', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  const input = field(page, 'n_serie').locator('input');
  await input.fill('ABC123');
  await input.press('Enter');
  await expect.poll(async () => (await cell(page, ids.blockId, 'n_serie'))?.value).toBe('ABC123');

  const sid = await suggest(page, ids, { n_serie: { value: ' ABC123 ' } });
  await expect.poll(async () => (await cell(page, ids.blockId, 'n_serie'))?.source_suggestion_id).toBe(sid.n_serie);
  const auto = (await outbox(page)).filter((row) => row.meta?.auto === true);
  expect(auto.map((row) => row.path).sort()).toEqual([`sheet/${ids.blockId}/nameplate/n_serie`, `suggestion/${sid.n_serie}/status`].sort());
  // The engineer's own value is written back as typed, never the reading's spelling of it.
  expect(auto.find((row) => row.path === `sheet/${ids.blockId}/nameplate/n_serie`)!.value).toBe('ABC123');
  expect((await cell(page, ids.blockId, 'n_serie'))?.value).toBe('ABC123');
  await expect(field(page, 'n_serie').locator('input')).toHaveValue('ABC123');
  expect(new Set(auto.map((row) => row.batch_id)).size).toBe(1);
  expect(await suggestionStatus(page, sid.n_serie!)).toBe('confirmed');
  // No tap was asked for: no Suggestion field, no replace line; the glyph shows.
  await expect(field(page, 'n_serie').locator('.suggestion-field.field, .suggestion-alt')).toHaveCount(0);
  await expect(page.locator('#ficha-nameplate .ficha-suggestion-confirmed[data-state="confirmed"]')).toHaveCount(1);

  // A second cycle confirms nothing more.
  await syncNow(page);
  expect((await outbox(page)).filter((row) => row.meta?.auto === true)).toHaveLength(2);
});

test('@p1 8.1-E2E-006 the Sumário counts the device pending suggestions, never counts their sheet as concluded, and its count opens that sheet', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  // The sheet is set aside as not tested elsewhere: concluded, until a suggestion waits on it.
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId: ids.relatorioId }, `block/${ids.blockId}/not_tested`, { reason: 'solicitacao_cliente', text: null, at: new Date().toISOString(), by: account.userId }),
  ]);
  await syncNow(page);
  let header = await sumarioHeader(page, ids.relatorioId);
  const concluded = header.getByRole('button', { name: /fichas concluídas$/ });
  await expect(concluded).toHaveText(/^1 de \d+ fichas concluídas$/);
  await expect(header.getByRole('button', { name: '0 sugestões por confirmar' })).toBeVisible();

  await pushSuggestion(account.companyId, ids.relatorioId, { targetPath: `sheet/${ids.blockId}/nameplate/fabricacao`, value: 'Schneider', actorId: account.userId });
  await syncNow(page);
  header = await sumarioHeader(page, ids.relatorioId);
  await expect(header.getByRole('button', { name: /fichas concluídas$/ })).toHaveText(/^0 de \d+ fichas concluídas$/);
  await header.getByRole('button', { name: '1 sugestão por confirmar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${ids.relatorioId}/ficha/${ids.blockId}$`));
});

test('@p1 8.1-E2E-007 the nameplate with suggestions fits 390 px without a sideways scroll', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database, { width: 390 });
  await suggest(page, ids, {
    fabricacao: { value: 'Schneider Electric do Brasil' },
    n_serie: { value: 'SU1240998' },
    corrente_nominal: { value: { raw: '630', unit: 'A', state: 'measured' } },
    data_de_fabricacao: { value: '2012-03', trust: 'verify' },
  });
  await expect(page.locator('#ficha-nameplate .suggestion-group-head')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  for (const key of ['fabricacao', 'n_serie', 'corrente_nominal', 'data_de_fabricacao']) {
    const box = (await suggestionOf(page, key).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});

test('@p0 8.1-E2E-008 the crop of a photo on this device draws the picture and opens the Photo viewer zoomed on its region, before and after Confirmar', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  const add = page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' });
  await add.click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Escolher arquivos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, 'placa.jpg')]);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const photoId = (await devicePhotos(page, database))[0]!.id;

  await suggest(page, ids, { fabricacao: { value: 'Schneider', photoId } });
  const crop = suggestionOf(page, 'fabricacao').locator('.crop-thumb');
  await expect(crop.locator('img[alt="Recorte da placa"]')).toBeVisible();
  await crop.click();
  const viewer = page.getByRole('dialog', { name: 'Foto 1 de 1' });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('svg.viewer-zoom[data-zoom="0.2,0.3,0.6,0.45"] .viewer-zoom-region')).toBeVisible();
  await viewer.getByRole('button', { name: 'Fechar' }).click();
  await expect(viewer).toHaveCount(0);

  // Confirmed, the crop is the 24 px glyph beside the field, and its tap opens the same zoom.
  await suggestionOf(page, 'fabricacao').getByRole('button', { name: 'Sugerido, Schneider, confirmar' }).click();
  const glyph = page.locator('#ficha-nameplate .ficha-suggestion-confirmed[data-state="confirmed"] .crop-thumb');
  await expect(glyph).toBeVisible();
  expect(Math.round((await glyph.boundingBox())!.width)).toBe(24);
  await glyph.click();
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('svg.viewer-zoom[data-zoom="0.2,0.3,0.6,0.45"] .viewer-zoom-region')).toBeVisible();
  await viewer.getByRole('button', { name: 'Fechar' }).click();
  await expect(viewer).toHaveCount(0);
});
