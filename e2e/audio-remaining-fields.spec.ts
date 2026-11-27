import type { BlockRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { plainJpeg, type FilePayload } from './fixtures/photos/synthetic.ts';
import { deviceAudios, installVoice, type AudioRecord } from './support/audio.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 31.7 (AD-30): the mic on the fields that lacked it, driven as a person would on the recorder's
 * test seam (`support/audio.ts`). On "Texto da conclusão" an audio adds the written text after the
 * composed one, the field becomes the user's edited text and the picked result stays; on a section
 * text it is a new paragraph at the end with the formatting untouched. The last test is the
 * deferred-work row of batch e31c: online, the batch caption's audio text is on the first photo
 * before "Adicionar N fotos", which then leaves that photo's caption alone. Waits poll; no fixed sleep.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const WRITTEN = 'Equipamento verificado, sem anomalias aparentes.';
const REPORT = 'O equipamento foi verificado e não apresentou anomalias aparentes.';

async function audios(page: Page): Promise<AudioRecord[]> {
  return deviceAudios(page, database);
}

/** One tap, a recording of at least `seconds`, the second tap; then waits until the device holds the new audio row. */
async function record(scope: Locator, name: string, seconds = 3): Promise<void> {
  const before = (await audios(scope.page())).length;
  const button = scope.getByRole('button', { name: `Gravar áudio: ${name}` });
  await button.click();
  const pressed = scope.getByRole('button', { name: /^Parar a gravação: / });
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');
  const time = scope.locator('.audio-rec .audio-time');
  await expect.poll(async () => Number(((await time.textContent()) ?? '0:00').split(':')[1]), { timeout: 15_000 }).toBeGreaterThanOrEqual(seconds);
  await pressed.click();
  await expect(scope.getByRole('button', { name: /^Gravar áudio: / }).first()).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await audios(scope.page())).length).toBe(before + 1);
}

async function storedBlock(page: Page, blockId: string): Promise<BlockRow> {
  const records = await readStore<{ entity: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.row.id === blockId)!.row;
}

/** "Sincronizar agora" until `done` holds (the transcription job runs between the cycles). */
async function syncUntil(page: Page, done: () => Promise<boolean>): Promise<void> {
  await expect(async () => {
    await syncNow(page);
    expect(await done()).toBe(true);
  }).toPass({ timeout: 120_000, intervals: [1_000, 2_000, 3_000] });
}

const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });

test('@p0 31.7-E2E-001 audio on "Texto da conclusão" adds the written text after the composed one, makes it the edited text, and leaves the picked result', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const result = page.getByRole('radiogroup', { name: 'Resultado' });
  await result.getByRole('radio', { name: 'Reprovado', exact: true }).click();
  await expect(result.getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  const conclusion = page.locator('.ficha-conc-text');
  await expect(conclusion.locator('.suggestion-field.is-generated')).toBeVisible();
  // The composed text stands on the device with no audio and no model call: nothing is stored yet.
  expect((await storedBlock(page, blockId)).sheet.conclusion.text?.value ?? null).toBeNull();
  await record(conclusion, 'texto da conclusão');
  await expect(conclusion.locator('.audio-status')).toBeVisible();

  await syncUntil(page, async () => String((await storedBlock(page, blockId)).sheet.conclusion.text?.value ?? '').endsWith(REPORT));
  const block = await storedBlock(page, blockId);
  const text = String(block.sheet.conclusion.text?.value);
  expect(text).toMatch(new RegExp(`\\n\\n${REPORT}$`));
  expect(text.length).toBeGreaterThan(REPORT.length + 20);
  expect(block.sheet.conclusion.text_status?.value).toBe('edited');
  expect(block.sheet.conclusion.result?.value).toBe('reprovado');

  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const field = page.getByRole('textbox', { name: 'Texto da conclusão' });
  await expect(field).toHaveValue(text, { timeout: 30_000 });
  const mark = page.locator('.ficha-conc-text .audio-mark');
  await expect(mark.locator('.audio-tag')).toHaveText('Áudio');
  await expect(mark.getByRole('button', { name: /^Ouvir o áudio, / })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('@p0 31.7-E2E-002 audio on a relatório section text adds a paragraph at the end and keeps the formatting', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await page.getByRole('list', { name: 'Sumário do relatório' }).getByRole('button', { name: /^Definições/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/secao/[0-9a-f-]{36}$`));
  const sectionId = page.url().split('/').at(-1)!;
  const area = page.getByRole('textbox', { name: 'Texto da seção' });
  const sectionText = async () => String(((await storedBlock(page, sectionId)).config as { section_text?: string } | null)?.section_text ?? '');
  // Some formatting to keep: the first line of the text in bold, stored before the audio is recorded.
  await area.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Shift+End');
  await page.getByRole('toolbar', { name: 'Formatação' }).getByRole('button', { name: 'Negrito' }).click();
  await expect(area.locator('strong')).not.toHaveCount(0);
  await area.blur();
  await expect.poll(async () => (await sectionText()).includes('**')).toBe(true);
  const before = await sectionText();
  await record(page.locator('.secao-content'), 'texto da seção');

  await syncUntil(page, async () => (await sectionText()).endsWith(REPORT));
  const stored = await sectionText();
  expect(stored.startsWith(before)).toBe(true);
  expect(stored).toMatch(new RegExp(`\\n\\n${REPORT}$`));

  await page.goto(`/relatorio/${relatorioId}/secao/${sectionId}`);
  await expect(area.locator('strong')).not.toHaveCount(0, { timeout: 30_000 });
  await expect(area).toContainText(REPORT);
  await expect(area).not.toContainText('**');
  await expect(page.locator('.secao-content .audio-mark .audio-tag')).toHaveText('Áudio');
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

test('@p1 31.7-E2E-003 online, the audio text on the first photo before "Adicionar 2 fotos" survives the tap; the other photo takes the caption', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const sheet = await pickTwoPhotos(page, relatorioId);
  await sheet.getByRole('radio').first().click();
  const caption = sheet.getByRole('textbox', { name: 'Legenda das 2 fotos' });
  await expect(caption).not.toHaveValue('');
  const typed = await caption.inputValue();
  await record(sheet, 'legenda');
  const [audio] = await audios(page);
  const target = audio!.audio_target as { type: string; file_id: string };
  expect(target.type).toBe('photo_caption');

  // Online the job runs by itself; a sync cycle without leaving the sheet (the app's own `online` listener) pulls the text.
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    expect((await devicePhotos(page, database)).find((photo) => photo.id === target.file_id)?.caption).toBe(WRITTEN);
  }).toPass({ timeout: 150_000, intervals: [2_000, 3_000, 5_000] });

  await sheet.getByRole('button', { name: 'Adicionar 2 fotos' }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.id !== target.file_id).map((photo) => photo.caption)).toEqual([typed]);
  const photos = await devicePhotos(page, database);
  expect(photos.find((photo) => photo.id === target.file_id)?.caption).toBe(WRITTEN);
});
