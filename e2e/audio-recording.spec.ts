import type { BlockRow, PointRow } from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { plainJpeg, type FilePayload } from './fixtures/photos/synthetic.ts';
import { deviceAudios, deviceBlob, installVoice, setVoice, type AudioRecord } from './support/audio.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * Stories 31.3 and 31.4 (AD-30): the audio of a prose field driven as a person would, on the
 * recorder's test seam (`support/audio.ts`: a Web Audio graph stands in for the microphone, so
 * MediaRecorder, the analyser and the measures all run for real). A recording offline is kept on
 * the device (the `file` row, its Blob and its create op) with the status line; a refused
 * microphone keeps nothing; quiet and loud input each warn; silence saves nothing. Back online, the
 * real transcription job (fake STT and writing providers, no server seeding) puts the text in the
 * field: the mark "Áudio", the heard text, the toast "1 áudio transcrito" whose "Ver" opens the
 * field; a photo's automatic caption replaced; typed text kept before the transcript; the sheet's
 * OBSERVAÇÕES and a point's text the same way. Waits poll; no fixed sleep.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const WRITTEN = 'Equipamento verificado, sem anomalias aparentes.';
const HEARD = 'equipamento verificado sem anomalias aparentes';
const REPORT = 'O equipamento foi verificado e não apresentou anomalias aparentes.';

interface OutboxRow {
  kind: string;
  path: string;
  value: { kind?: string } | null;
}

const row = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);

/** Marks the "contatos" row NC and hands back the row. */
async function contatosNc(page: Page): Promise<Locator> {
  const contatos = row(page, 'contatos');
  const nc = contatos.getByRole('radio', { name: 'Não conforme', exact: true });
  await nc.click();
  await expect(nc).toHaveAttribute('aria-checked', 'true');
  return contatos;
}

/**
 * One tap, a recording of at least `seconds` (read on the button's own time), and the second tap;
 * then, unless it heard nothing, waits until the device holds the new audio row (the commit runs
 * after the stop, so leaving the page earlier would drop it).
 */
async function record(scope: Locator, name: RegExp | string, seconds = 3, saves = true): Promise<void> {
  const before = (await audios(scope.page())).length;
  const button = scope.getByRole('button', { name: typeof name === 'string' ? `Gravar áudio: ${name}` : name });
  await button.click();
  const pressed = scope.getByRole('button', { name: /^Parar a gravação: / });
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');
  const time = scope.locator('.audio-rec .audio-time');
  await expect.poll(async () => Number(((await time.textContent()) ?? '0:00').split(':')[1]), { timeout: 15_000 }).toBeGreaterThanOrEqual(seconds);
  await pressed.click();
  await expect(scope.getByRole('button', { name: /^Gravar áudio: / }).first()).toHaveAttribute('aria-pressed', 'false');
  if (saves) await expect.poll(async () => (await audios(scope.page())).length).toBe(before + 1);
}

async function audios(page: Page): Promise<AudioRecord[]> {
  return deviceAudios(page, database);
}

async function audioOps(page: Page): Promise<OutboxRow[]> {
  return (await readStore<OutboxRow>(page, database, 'outbox')).filter((op) => op.kind === 'create' && op.path.startsWith('file/') && op.value?.kind === 'audio');
}

async function storedBlock(page: Page, blockId: string): Promise<BlockRow> {
  const records = await readStore<{ entity: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.row.id === blockId)!.row;
}

/** "Sincronizar agora" until `done` holds (the job runs on its own between the cycles); stays on Sync status. */
async function syncUntil(page: Page, done: () => Promise<boolean>): Promise<void> {
  await expect(async () => {
    await syncNow(page);
    expect(await done()).toBe(true);
  }).toPass({ timeout: 120_000, intervals: [1_000, 2_000, 3_000] });
}

async function offline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

test('@p0 31.3-E2E-001 offline on an NC observation: the recording is kept on the device (row, Blob, create op) and the field says "Áudio guardado, aguardando sinal"', async ({ page, context }) => {
  test.setTimeout(150_000);
  await installVoice(context);
  const { blockId } = await openChaveSheet(page, account, database);
  const contatos = await contatosNc(page);
  const button = contatos.getByRole('button', { name: /^Gravar áudio: observação do item \d+$/ });
  // Story 31.10: the field bar's audio control, Text-button-shaped with its word, 48 px tall.
  const box = (await button.boundingBox())!;
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(48);
  expect(Math.round(box.width)).toBeGreaterThan(48);
  await expect(button).toContainText('Gravar áudio');
  await offline(context, page);

  await button.click();
  const pressed = contatos.getByRole('button', { name: /^Parar a gravação: observação do item \d+$/ });
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');
  await expect(contatos.locator('.audio-rec-word')).toHaveText('Gravando');
  await expect(contatos.locator('.audio-rec-word')).toBeVisible();
  await expect.poll(async () => Number(await contatos.locator('.audio-meter').getAttribute('data-level')), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await contatos.locator('.audio-time').textContent()) ?? '', { timeout: 15_000 }).toMatch(/^0:0[3-9]$/);
  // The field stays typeable while it records.
  await expect(contatos.getByRole('textbox', { name: /^Observação do item \d+$/ })).toBeEditable();
  await pressed.click();

  await expect(contatos.locator('.audio-status[data-step="saved"]')).toHaveText('Áudio guardado, aguardando sinal');
  await expect.poll(async () => (await audios(page)).length).toBe(1);
  const [audio] = await audios(page);
  expect(audio).toMatchObject({ kind: 'audio', audio_status: 'queued', audio_target: { type: 'item', block_id: blockId, item_key: 'contatos' }, quality: { verdict: 'good', reasons: [] } });
  expect(audio!.mime).toMatch(/^audio\/(webm|mp4)$/);
  expect(audio!.quality.duration_ms).toBeGreaterThanOrEqual(3000);
  const blob = await deviceBlob(page, database, audio!.id);
  expect(blob!.size).toBeGreaterThan(0);
  expect(blob!.type).toMatch(/^audio\//);
  expect((await audioOps(page)).map((op) => op.path)).toEqual([`file/${audio!.id}`]);
  await context.setOffline(false);
});

test('@p0 31.3-E2E-002 a refused microphone: the button stays, the explanation is shown and said, and nothing is stored', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installVoice(context, { mode: 'refuse' });
  await openChaveSheet(page, account, database);
  const contatos = await contatosNc(page);
  const button = contatos.getByRole('button', { name: /^Gravar áudio: observação do item \d+$/ });
  await button.click();
  const explanation = 'O microfone está bloqueado. Permita o microfone nas configurações do navegador e toque de novo.';
  await expect(contatos.locator('.audio-refused')).toHaveText(explanation);
  await expect(page.getByTestId('audio-announcer')).toHaveText(explanation);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await audios(page)).toEqual([]);
  expect(await audioOps(page)).toEqual([]);
  const blobs = await readStore<{ id: string }>(page, database, 'files');
  expect(blobs).toEqual([]);
});

test('@p1 31.3-E2E-003 quiet input warns "Fale mais perto do aparelho", then loud input "Muito alto, afaste um pouco", the meter amber', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installVoice(context, { level: 0.01 });
  await openChaveSheet(page, account, database);
  const contatos = await contatosNc(page);
  await contatos.getByRole('button', { name: /^Gravar áudio: observação do item \d+$/ }).click();
  const warning = contatos.locator('.audio-warning[role="status"]');
  await expect(warning).toHaveText('Fale mais perto do aparelho', { timeout: 10_000 });
  await expect(contatos.locator('.audio-meter')).toHaveAttribute('data-tone', 'warn');
  await setVoice(page, { level: 1.5 });
  await expect(warning).toHaveText('Muito alto, afaste um pouco', { timeout: 10_000 });
  await setVoice(page, { level: 0.3 });
  await expect(warning).toHaveCount(0, { timeout: 10_000 });
  await contatos.getByRole('button', { name: /^Parar a gravação: / }).click();
});

test('@p1 31.3-E2E-004 a recording of silence saves nothing and the field says "Não ouvi nada, grave de novo"', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installVoice(context, { level: 0, noise: 0 });
  await openChaveSheet(page, account, database);
  const contatos = await contatosNc(page);
  await record(contatos, /^Gravar áudio: observação do item \d+$/, 2, false);
  await expect(contatos.locator('.audio-status[data-step="empty"]')).toHaveText('Não ouvi nada, grave de novo');
  await expect(page.getByTestId('audio-announcer')).toHaveText('Não ouvi nada, grave de novo');
  expect(await audios(page)).toEqual([]);
  expect(await audioOps(page)).toEqual([]);
});

test('@p0 31.4-E2E-001 recorded offline, synced online: the text is in the NC observation with the mark "Áudio" and the heard text; "1 áudio transcrito — Ver" opens the field', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { blockId } = await openChaveSheet(page, account, database);
  const contatos = await contatosNc(page);
  await offline(context, page);
  await record(contatos, /^Gravar áudio: observação do item \d+$/);
  await expect(contatos.locator('.audio-status[data-step="saved"]')).toHaveText('Áudio guardado, aguardando sinal');
  await context.setOffline(false);

  // The cycles push the create op, upload the bytes (the job starts), and pull the transcript.
  const toast = page.getByTestId('toast');
  await syncUntil(page, async () => (await toast.count()) > 0 && ((await toast.first().textContent()) ?? '').includes('1 áudio transcrito'));
  expect((await audios(page))[0]).toMatchObject({ audio_status: 'done', transcript_heard: HEARD, transcript_written: WRITTEN });
  expect((await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe(WRITTEN);
  await toast.getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));

  const field = row(page, 'contatos').getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect(field).toHaveValue(WRITTEN, { timeout: 30_000 });
  await expect(field).toBeFocused();
  const mark = row(page, 'contatos').locator('.audio-mark');
  await expect(mark.locator('.audio-tag')).toHaveText('Áudio');
  await expect(mark).not.toHaveAttribute('data-state', 'edited');
  await expect(mark.getByRole('button', { name: /^Ouvir o áudio, 0:0\d$/ })).toBeVisible();
  const toggle = mark.getByRole('button', { name: 'Ver texto como falado' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(mark.locator('.audio-heard')).toHaveText(`Texto como falado${HEARD}`);
  await expect(row(page, 'contatos').locator('.audio-status')).toHaveCount(0);

  // Story 31.4: an edit makes it the user's text; play and the heard text stay.
  // The audio's own words changed (a text added around them would keep the mark "Áudio").
  await field.fill('Equipamento verificado, com oxidação na fase B.');
  await expect(mark.locator('.audio-tag')).toHaveText('Áudio, editado');
  await expect(mark).toHaveAttribute('data-state', 'edited');
  await expect(mark.getByRole('button', { name: /^Ouvir o áudio, / })).toBeVisible();
  await expect(mark.locator('.audio-heard')).toBeVisible();
});

/** Two files into the gallery from the sheet's photos: the "De qual equipamento?" step. */
async function pickTwoPhotos(page: Page, relatorioId: string): Promise<Locator> {
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  const files: FilePayload[] = [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')];
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles(files);
  const sheet = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  return sheet;
}

test('@p1 31.4-E2E-002 the batch caption: an audio on the first photo replaces its automatic caption; the other keeps it', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const sheet = await pickTwoPhotos(page, relatorioId);
  // The sheet opened last leads the list: its context caption fills the field (the automatic caption).
  await sheet.getByRole('radio').first().click();
  const caption = sheet.getByRole('textbox', { name: 'Legenda das 2 fotos' });
  await expect(caption).not.toHaveValue('');
  const automatic = await caption.inputValue();
  await offline(context, page);
  await record(sheet, 'legenda');
  await expect(sheet.locator('.audio-status[data-step="saved"]')).toHaveText('Áudio guardado, aguardando sinal');
  await sheet.getByRole('button', { name: 'Adicionar 2 fotos' }).click();
  await expect(sheet).toHaveCount(0);
  const [audio] = await audios(page);
  const target = audio!.audio_target as { type: string; file_id: string };
  expect(target.type).toBe('photo_caption');
  await context.setOffline(false);

  await syncUntil(page, async () => (await devicePhotos(page, database)).find((photo) => photo.id === target.file_id)?.caption === WRITTEN);
  const photos = await devicePhotos(page, database);
  expect(photos.filter((photo) => photo.id !== target.file_id).map((photo) => photo.caption)).toEqual([automatic]);
});

test('@p1 31.4-E2E-003 text typed while the audio waited is kept, and the transcript is added after it', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { blockId } = await openChaveSheet(page, account, database);
  const contatos = await contatosNc(page);
  const field = contatos.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await offline(context, page);
  await record(contatos, /^Gravar áudio: observação do item \d+$/);
  await field.fill('Contatos escurecidos.');
  await field.blur();
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe('Contatos escurecidos.');
  await context.setOffline(false);

  const expected = `Contatos escurecidos.\n\n${WRITTEN}`;
  await syncUntil(page, async () => (await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value === expected);
  await page.goto(`/relatorio/${(await audios(page))[0]!.relatorio_id}/ficha/${blockId}`);
  await expect(row(page, 'contatos').getByRole('textbox', { name: /^Observação do item \d+$/ })).toHaveValue(expected, { timeout: 30_000 });
  await expect(row(page, 'contatos').locator('.audio-mark .audio-tag')).toHaveText('Áudio');
});

test('@p1 31.4-E2E-004 an audio on the sheet\'s OBSERVAÇÕES and one on a point\'s text land the same way', async ({ page, context }) => {
  test.setTimeout(300_000);
  await installVoice(context);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  const observacoes = page.locator('#ficha-step-conclusao section').filter({ has: page.getByRole('heading', { level: 2, name: 'Observações' }) });
  await record(observacoes, 'observações');

  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Pontos de atenção/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  const mic = editor.getByRole('button', { name: 'Gravar áudio: texto do ponto' });
  // A point not saved yet has no row for the text to land on.
  await expect(mic).toHaveAttribute('aria-disabled', 'true');
  await expect(mic).toHaveAccessibleDescription('Salve o ponto para gravar o áudio');
  const text = editor.getByRole('textbox', { name: 'Texto' });
  await text.click();
  await text.pressSequentially('Fusível com aquecimento.');
  await expect(mic).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });
  const points = async () => (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
  await expect.poll(async () => (await points()).length).toBe(1);
  const pointId = (await points())[0]!.id;
  await record(editor, 'texto do ponto');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);

  const pointText = async () => (await points()).find((point) => point.id === pointId)?.text ?? '';
  await syncUntil(page, async () => (await storedBlock(page, blockId)).sheet.observations?.value === REPORT && (await pointText()).includes(WRITTEN));
  // The typed text first, untouched; the transcript after it.
  expect((await pointText()).startsWith('Fusível com aquecimento.')).toBe(true);

  await syncNowAndReturn(page);
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  const again = page.locator('#ficha-step-conclusao section').filter({ has: page.getByRole('heading', { level: 2, name: 'Observações' }) });
  await expect(again.getByRole('textbox', { name: 'Observações da ficha' })).toHaveValue(REPORT, { timeout: 30_000 });
  await expect(again.locator('.audio-mark .audio-tag')).toHaveText('Áudio');
});
