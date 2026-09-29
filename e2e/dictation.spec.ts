import type { BlockRow, PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { plainJpeg, type FilePayload } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, horizontalOverflow, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { disableSpeech, failSpeech, isListening, speak } from './support/speech.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 9.4-E2E: dictation driven as a person would, on the fake speech engine of the `build:e2e`
 * bundle. The batch caption and the Caption composer; the sheet's Measurement table (a
 * parsed reading as a Suggestion on its cell, unparsed speech as the observation's
 * suggestion); the checklist row and the point of attention; the button hidden offline and
 * with no engine. Every flow asserts what the device committed after a reload, not only the
 * screen.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id?: string | null;
  meta?: { source_suggestion_id?: string } | null;
}

/** The block row this device holds. */
async function storedBlock(page: Page, blockId: string): Promise<BlockRow> {
  const records = await readStore<{ entity: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.row.id === blockId)!.row;
}

const cellValue = (block: BlockRow, testKey: string, row: number, col: number) => block.sheet.test[testKey]?.cells[String(row)]?.[String(col)]?.value ?? null;

async function pickFiles(page: Page, opener: Locator, files: FilePayload[]): Promise<void> {
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
  await expect(sheet).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Escolher arquivos' }).click();
  await (await chooser).setFiles(files);
}

async function openGallery(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
}

/** Two files into the gallery, "Geral" chosen on "De qual equipamento?": the dialog. */
async function batchOnGeral(page: Page, relatorioId: string): Promise<Locator> {
  await openGallery(page, relatorioId);
  await pickFiles(page, page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }), [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')]);
  const sheet = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  await sheet.getByRole('radio', { name: 'Geral (sem equipamento)' }).click();
  return sheet;
}

const table = (page: Page, key: string) => page.locator(`#ficha-step-ensaios .ficha-mt[data-table-key="${key}"]`);
const FECHADO_MIC = 'Ditar leitura — ex.: “Fase A, 147 giga”';
const observacoes = (page: Page) => page.locator('#ficha-step-conclusao section').filter({ has: page.getByRole('heading', { level: 2, name: 'Observações' }) });

test('@p0 9.4-E2E-001 the batch caption at 390 px: "Ditar a legenda" listens (48 px, pressed, "Ouvindo…"); the heard text waits as a Suggestion with "Usar"; "Usar" and "Adicionar 2 fotos" put it on both photos', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await openChaveSheet(page, account, database, { width: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  const sheet = await batchOnGeral(page, relatorioId);
  const field = sheet.getByRole('textbox', { name: 'Legenda das 2 fotos' });
  await expect(field).toHaveValue('');

  const mic = sheet.getByRole('button', { name: 'Ditar a legenda' });
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  const box = (await mic.boundingBox())!;
  expect(Math.round(box.width)).toBe(48);
  expect(Math.round(box.height)).toBe(48);
  await expect(sheet.locator('.dictation .listening-word')).toBeVisible();
  await expect(sheet.locator('.dictation .listening-word')).toHaveText('Ouvindo…');

  await speak(page, 'detalhe da limpeza dos cubículos');
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  const suggestion = sheet.locator('.dictated-suggestion .suggestion-field[data-state="suggested"]');
  await expect(suggestion.locator('.sv')).toHaveText('Detalhe da limpeza dos cubículos');
  await expect(suggestion.locator('.suggested-pill')).toHaveText('Sugerido');
  // Nothing written before "Usar": the caption field is as it was.
  await expect(field).toHaveValue('');

  await suggestion.getByRole('button', { name: 'Usar' }).click();
  await expect(field).toHaveValue('Detalhe da limpeza dos cubículos');
  await expect(sheet.locator('.dictated-suggestion')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Adicionar 2 fotos' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('2 fotos adicionadas — legenda aplicada');

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await devicePhotos(page, database)).map((photo) => photo.caption))
    .toEqual(['Detalhe da limpeza dos cubículos', 'Detalhe da limpeza dos cubículos']);
});

test('@p0 9.4-E2E-002 a dictated reading on the contato fechado table: Fase A shows 147 GΩ as a Suggestion, nothing stored; "Confirmar" writes it, kept across a reload', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const fechado = table(page, 'contato_fechado');
  await fechado.getByRole('button', { name: FECHADO_MIC }).click();
  await speak(page, 'Fase A, 147 giga');

  const cell = fechado.locator('[data-cell="isolacao:3:0"]');
  const suggestion = cell.locator('.suggestion-field[data-state="suggested"]');
  await expect(suggestion.locator('input.mf-value')).toHaveValue('147');
  await expect(suggestion.locator('.mf-unit')).toHaveText('GΩ');
  await expect(suggestion.locator('.suggested-pill')).toHaveText('Sugerido');
  const confirm = suggestion.getByRole('button', { name: 'Sugerido, 147 GΩ, confirmar' });
  await expect(confirm).toHaveText('Confirmar');
  // Nothing stored and nothing queued before "Confirmar".
  expect(cellValue(await storedBlock(page, blockId), 'isolacao', 3, 0)).toBeNull();
  const queued = (await readStore<OutboxRow>(page, database, 'outbox')).filter((op) => op.path.includes('/test/isolacao/'));
  expect(queued).toHaveLength(0);

  await confirm.click();
  await expect(cell.locator('.suggestion-field')).toHaveCount(0);
  await expect(cell.locator('input.mf-value')).toHaveValue('147');
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(table(page, 'contato_fechado').locator('[data-cell="isolacao:3:0"] input.mf-value')).toHaveValue('147');
  expect(cellValue(await storedBlock(page, blockId), 'isolacao', 3, 0)).toEqual({ raw: '147', unit: 'GΩ', state: 'measured' });
});

test('@p0 9.4-E2E-003 speech a table cannot read changes no cell and waits in "Observações" as a Suggestion; "Usar" appends it after the text already there', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const section = observacoes(page);
  const observation = page.getByLabel('Observações da ficha', { exact: true });
  await observation.fill('Cubículo limpo.');
  await observation.blur();
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.observations?.value ?? null).toBe('Cubículo limpo.');

  const fechado = table(page, 'contato_fechado');
  await fechado.getByRole('button', { name: FECHADO_MIC }).click();
  await speak(page, 'está chovendo muito');
  await expect(page.getByTestId('ficha-announcer')).toHaveText('Leitura não reconhecida. O ditado ficou como sugestão em Observações.');
  await expect(fechado.locator('.suggestion-field')).toHaveCount(0);
  const suggestion = section.locator('.dictated-suggestion .suggestion-field[data-state="suggested"]');
  await expect(suggestion.locator('.sv')).toHaveText('Está chovendo muito');
  await expect(observation).toHaveValue('Cubículo limpo.');
  const block = await storedBlock(page, blockId);
  for (const row of [3, 4, 5]) expect(cellValue(block, 'isolacao', row, 0)).toBeNull();

  await suggestion.getByRole('button', { name: 'Usar' }).click();
  await expect(observation).toHaveValue('Cubículo limpo.\n\nEstá chovendo muito');
  await page.reload();
  await expect(page.getByLabel('Observações da ficha', { exact: true })).toHaveValue('Cubículo limpo.\n\nEstá chovendo muito', { timeout: 30_000 });
  expect((await storedBlock(page, blockId)).sheet.observations?.value).toBe('Cubículo limpo.\n\nEstá chovendo muito');
});

test('@p0 9.4-E2E-004 offline, no Dictation button is in the DOM while the fields remain; back online it returns; with no engine none renders', async ({ page, context }) => {
  test.setTimeout(150_000);
  await openChaveSheet(page, account, database);
  const mics = page.locator('.dictation-btn');
  await expect(page.getByRole('button', { name: 'Ditar observações' })).toBeVisible();
  await expect(table(page, 'contato_fechado').getByRole('button', { name: FECHADO_MIC })).toBeVisible();
  const online = await mics.count();
  expect(online).toBeGreaterThanOrEqual(4);

  await context.setOffline(true);
  await expect(mics).toHaveCount(0);
  await expect(page.locator('.dictation')).toHaveCount(0);
  await expect(page.getByLabel('Observações da ficha', { exact: true })).toBeVisible();
  await expect(table(page, 'contato_fechado').locator('[data-cell="isolacao:3:0"] input.mf-value')).toBeVisible();

  await context.setOffline(false);
  await expect(mics).toHaveCount(online);

  await disableSpeech(page);
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Observações da ficha', { exact: true })).toBeVisible();
  await expect(mics).toHaveCount(0);
});

test('@p1 9.4-E2E-005 the Caption composer: no mic until "Editar texto"; the dictated text lands in the text as "Sugerido" with its note; "Salvar legenda" keeps it through to the photos', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const sheet = await batchOnGeral(page, relatorioId);
  await sheet.getByRole('button', { name: 'Legendar' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda', exact: true });
  await expect(composer).toBeVisible();
  await expect(composer.locator('.dictation-btn')).toHaveCount(0);

  await composer.getByRole('button', { name: 'Editar texto' }).click();
  const text = composer.getByRole('textbox', { name: 'Texto da legenda' });
  await expect(text).toBeVisible();
  const mic = composer.getByRole('button', { name: 'Ditar a legenda' });
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await speak(page, 'detalhe do reaperto dos barramentos');
  await expect(text).toHaveValue('Detalhe do reaperto dos barramentos');
  const field = composer.locator('.caption-field');
  await expect(field).toHaveAttribute('data-state', 'suggested');
  await expect(field.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(field.locator('.dictated-note')).toHaveText(' · o ditado entrou como sugestão — Salvar confirma');

  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(composer).toHaveCount(0);
  await expect(sheet.getByRole('textbox', { name: 'Legenda das 2 fotos' })).toHaveValue('Detalhe do reaperto dos barramentos');
  await sheet.getByRole('button', { name: 'Adicionar 2 fotos' }).click();
  await expect(page.getByTestId('toast')).toContainText('2 fotos adicionadas — legenda aplicada');
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await devicePhotos(page, database)).map((photo) => photo.caption))
    .toEqual(['Detalhe do reaperto dos barramentos', 'Detalhe do reaperto dos barramentos']);
});

test('@p1 9.4-E2E-006 the composer: typing into a dictated text makes it the engineer\'s own (no "Sugerido")', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const sheet = await batchOnGeral(page, relatorioId);
  await sheet.getByRole('button', { name: 'Legendar' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda', exact: true });
  await composer.getByRole('button', { name: 'Editar texto' }).click();
  await composer.getByRole('button', { name: 'Ditar a legenda' }).click();
  await speak(page, 'painel limpo');
  const field = composer.locator('.caption-field');
  await expect(field).toHaveAttribute('data-state', 'suggested');
  const text = composer.getByRole('textbox', { name: 'Texto da legenda' });
  await text.press('End');
  await text.pressSequentially(' e seco');
  await expect(field).not.toHaveAttribute('data-state', 'suggested');
  await expect(field.locator('.suggested-pill')).toHaveCount(0);
  await expect(text).toHaveValue('Painel limpo e seco');
});

test('@p1 9.4-E2E-007 an NC row: "Ditar observação do item N" and "Usar" write the item observation; a keystroke into the field drops a pending dictation', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const row = page.locator('#ficha-step-verificacoes li.checklist-row[data-item-key="contatos"]');
  await row.getByRole('radio', { name: 'Não conforme' }).click();
  await expect(row.getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  const mic = row.getByRole('button', { name: /^Ditar observação do item \d+$/ });
  await mic.click();
  await speak(page, 'contato com oxidação');
  const suggestion = row.locator('.dictated-suggestion .suggestion-field[data-state="suggested"]');
  await expect(suggestion.locator('.sv')).toHaveText('Contato com oxidação');
  const field = row.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect(field).toHaveValue('');
  await suggestion.getByRole('button', { name: 'Usar' }).click();
  await expect(field).toHaveValue('Contato com oxidação');
  // E9-Q5: "Usar" commits through an async IndexedDB write; the reload waits until it has landed.
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe('Contato com oxidação');

  await page.reload();
  const again = page.locator('#ficha-step-verificacoes li.checklist-row[data-item-key="contatos"]');
  const reloaded = again.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect(reloaded).toHaveValue('Contato com oxidação', { timeout: 30_000 });
  expect((await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe('Contato com oxidação');

  // A pending dictation, then a key typed into the field: the suggestion goes, only the typed text is committed.
  await again.getByRole('button', { name: /^Ditar observação do item \d+$/ }).click();
  await speak(page, 'não deve entrar');
  await expect(again.locator('.dictated-suggestion')).toHaveCount(1);
  await reloaded.click();
  await reloaded.press('End');
  await reloaded.pressSequentially(' leve');
  await expect(again.locator('.dictated-suggestion')).toHaveCount(0);
  await reloaded.blur();
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe('Contato com oxidação leve');
});

test('@p1 9.4-E2E-008 the point editor: "Ditar o texto" and "Usar" put the text in the point, kept after "Concluir" and a reload', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Pontos de atenção/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Ditar o texto' }).click();
  await speak(page, 'fusível da fase B com aquecimento na base');
  const suggestion = editor.locator('.dictated-suggestion .suggestion-field[data-state="suggested"]');
  await expect(suggestion.locator('.sv')).toHaveText('Fusível da fase B com aquecimento na base');
  await suggestion.getByRole('button', { name: 'Usar' }).click();
  await expect(editor.getByRole('textbox', { name: 'Texto' })).toContainText('Fusível da fase B com aquecimento na base');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (1)' })).toBeVisible({ timeout: 30_000 });
  const points = (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
  expect(points).toHaveLength(1);
  expect(points[0]!.text).toContain('Fusível da fase B com aquecimento na base');
});

test('@p1 9.4-E2E-009 a row whose cell is filled keeps it and the speech goes to "Observações"; a second tap stops listening with no suggestion; an engine error is said', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const fechado = table(page, 'contato_fechado');
  const faseA = fechado.locator('[data-cell="isolacao:3:0"] input.mf-value');
  await faseA.fill('900');
  await faseA.blur();
  await expect.poll(async () => cellValue(await storedBlock(page, blockId), 'isolacao', 3, 0)).toEqual({ raw: '900', unit: 'GΩ', state: 'measured' });

  await fechado.getByRole('button', { name: FECHADO_MIC }).click();
  await speak(page, 'Fase A, 147 giga');
  await expect(observacoes(page).locator('.dictated-suggestion .sv')).toHaveText('Fase A, 147 giga');
  await expect(fechado.locator('.suggestion-field')).toHaveCount(0);
  await expect(faseA).toHaveValue('900');
  expect(cellValue(await storedBlock(page, blockId), 'isolacao', 3, 0)).toEqual({ raw: '900', unit: 'GΩ', state: 'measured' });

  // A second tap on the pressed mic: listening stops, nothing is suggested.
  const aberto = table(page, 'contato_aberto');
  const mic = aberto.getByRole('button', { name: 'Ditar leitura — ex.: “T1, 147 giga”' });
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => isListening(page)).toBe(true);
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  expect(await isListening(page)).toBe(false);
  await expect(aberto.locator('.suggestion-field')).toHaveCount(0);

  // A recognition error: the button idles and the app says so.
  await mic.click();
  await failSpeech(page);
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('dictation-announcer')).toHaveText('Não foi possível ouvir. Digite ou tente de novo.');
  await expect(aberto.locator('.suggestion-field')).toHaveCount(0);
});

test('@p1 9.4-E2E-010 a different value typed over a dictated reading is written instead and the dictation dropped', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const fechado = table(page, 'contato_fechado');
  await fechado.getByRole('button', { name: FECHADO_MIC }).click();
  await speak(page, 'fase b cento e quarenta e sete vírgula cinco mega');
  const cell = fechado.locator('[data-cell="isolacao:4:0"]');
  const guess = cell.locator('.suggestion-field[data-state="suggested"] input.mf-value');
  await expect(guess).toHaveValue('147,5');
  await expect(cell.locator('.suggestion-field .mf-unit')).toHaveText('MΩ');
  await guess.fill('210');
  await guess.press('Enter');
  await expect(cell.locator('.suggestion-field')).toHaveCount(0);
  await expect.poll(async () => cellValue(await storedBlock(page, blockId), 'isolacao', 4, 0)).toEqual({ raw: '210', unit: 'MΩ', state: 'measured' });
});

const GOHM = 'G\u03a9';
const reading = (raw: string) => ({ raw, unit: GOHM, state: 'measured' });

test('@p0 9.4-E2E-011 at 390 px a dictated reading over a pending display reading: "Confirmar todos" leaves it out; its "Confirmar" writes the heard value and the display shows as "Conferir"; every table fits', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database, { width: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  const cellPath = (row: number) => `sheet/${blockId}/test/isolacao/cell/${row}/0`;
  // Two display readings on the contato fechado table (Fase A and Fase B), as the reading job writes them.
  const faseA = await pushSuggestion(account.companyId, relatorioId, { targetPath: cellPath(3), value: reading('147'), actorId: account.userId });
  const faseB = await pushSuggestion(account.companyId, relatorioId, { targetPath: cellPath(4), value: reading('200'), actorId: account.userId });
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const fechado = table(page, 'contato_fechado');
  const confirmAll = fechado.locator('.mt-actions').getByRole('button', { name: /^Confirmar todos/ });
  await expect(confirmAll).toHaveText('Confirmar todos (2)');

  // Fase A dictated as 150: the cell shows the heard value, and "Confirmar todos" no longer counts it.
  await fechado.getByRole('button', { name: FECHADO_MIC }).click();
  await speak(page, 'Fase A, 150 giga');
  const cellA = fechado.locator('[data-cell="isolacao:3:0"]');
  const dictated = cellA.locator('.suggestion-field[data-state="suggested"]');
  await expect(dictated.locator('input.mf-value')).toHaveValue('150');
  await expect(confirmAll).toHaveText('Confirmar todos (1)');

  // E9-Q4: a dictated cell and a display suggested cell fit the table at 390 px, "Confirmar" inside it.
  const overflow = () => fechado.evaluate((element) => element.scrollWidth - element.clientWidth);
  const within = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    const host = (await fechado.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(host.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(host.x + host.width + 0.5);
  };
  await expect(fechado.locator('[data-cell="isolacao:4:0"] .field.suggestion-field[data-state="suggested"]')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await within(dictated.getByRole('button', { name: `Sugerido, 150 ${GOHM}, confirmar` }));
  await within(fechado.locator('[data-cell="isolacao:4:0"] .confirm-btn'));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // "Confirmar todos (1)": Fase B alone, one batch; nothing for Fase A.
  await confirmAll.click();
  await expect.poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).find((op) => op.path === `suggestion/${faseB}/status`)?.value ?? null).toBe('confirmed');
  let rows = await readStore<OutboxRow>(page, database, 'outbox');
  const batch = rows.find((op) => op.path === `suggestion/${faseB}/status`)!.batch_id;
  expect(rows.filter((op) => op.batch_id === batch).map((op) => op.path).sort()).toEqual([cellPath(4), `suggestion/${faseB}/status`].sort());
  expect(rows.some((op) => op.path === cellPath(3) || op.path === `suggestion/${faseA}/status`)).toBe(false);
  expect(cellValue(await storedBlock(page, blockId), 'isolacao', 3, 0)).toBeNull();

  // The dictated "Confirmar": the heard value, with no provenance; the display reading becomes the "Conferir" line.
  await dictated.getByRole('button', { name: `Sugerido, 150 ${GOHM}, confirmar` }).click();
  await expect.poll(async () => cellValue(await storedBlock(page, blockId), 'isolacao', 3, 0)).toEqual(reading('150'));
  expect((await storedBlock(page, blockId)).sheet.test.isolacao!.cells['3']!['0']!.source_suggestion_id).toBeNull();
  rows = await readStore<OutboxRow>(page, database, 'outbox');
  expect(rows.filter((op) => op.path === cellPath(3)).map((op) => op.meta?.source_suggestion_id ?? null)).toEqual([null]);
  const line = cellA.getByRole('group', { name: 'Leitura do visor diferente do valor digitado' });
  await expect(line).toHaveText(`Visor: 147 ${GOHM} · digitado 150 ${GOHM} — Conferir`);
  // E9-Q4: the "Conferir" cell fits as well.
  expect(await overflow()).toBeLessThanOrEqual(0);
  await within(line);
});

test('@p1 9.4-E2E-012 Enter on a dictated reading writes it as heard and runs on to the next cell', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const fechado = table(page, 'contato_fechado');
  await fechado.getByRole('button', { name: FECHADO_MIC }).click();
  await speak(page, 'Fase A, 147 giga');
  const guess = fechado.locator('[data-cell="isolacao:3:0"] .suggestion-field[data-state="suggested"] input.mf-value');
  await expect(guess).toHaveValue('147');
  await guess.click();
  await guess.press('Enter');
  await expect
    .poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).find((op) => op.path === `sheet/${blockId}/test/isolacao/cell/3/0`)?.value ?? null)
    .toEqual(reading('147'));
  await expect(fechado.locator('[data-cell="isolacao:4:0"] input.mf-value')).toBeFocused();
  await expect(fechado.locator('[data-cell="isolacao:3:0"] .suggestion-field')).toHaveCount(0);
});
