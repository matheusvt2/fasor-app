import { charCountText, relatorioSetupPath, textCapOf } from '@app/domain';
import type { Page } from '@playwright/test';
import { outboxValues } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readFileBlobs } from './support/outbox.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.12 (batch e27c, F15 and F16 of the 2026-11-21 pass): Etapa 1 — Capa. A cover photo chosen
 * there shows its thumbnail in its tile, drawn from the file this device holds: after a reload with the
 * files API cut and after an in-app return while offline. "Informações adicionais" is a text area of the
 * mock's textarea class (`.observation-field`): three paragraphs show on several lines, the text is saved
 * when the field is left (the outbox holds it), the count follows, and a reload keeps it. The layout is
 * measured at 390, 768, 1024 and 1280 px, so the spec runs in the `solo` lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

/** A 1x1 PNG (the cover photo of `relatorio.spec.ts`): a real picture the thumbnail decodes. */
const COVER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CAP = textCapOf(relatorioSetupPath('additional_info'))!;
// Two long paragraphs that bring the count on (it shows from 90 % of the cap), the third typed by hand.
const PARAGRAPH = 'Manutenção preventiva nas cabines primárias, com ensaios de isolação e de resistência de contato. ';
const FIRST = PARAGRAPH.repeat(Math.ceil((CAP * 0.46) / PARAGRAPH.length)).trimEnd();
const THIRD = 'Acesso pela portaria 2.';

const etapa1 = (page: Page) => page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' });
const info = (page: Page) => page.getByRole('textbox', { name: 'Informações adicionais' });
const thumb = (page: Page) => page.locator('.brand-tile img.thumb-image');

async function openEtapa1(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await openEtapa1FromSumario(page);
}

async function openEtapa1FromSumario(page: Page): Promise<void> {
  const sumario = page.getByRole('list', { name: 'Sumário do relatório' });
  await expect(sumario.locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await sumario.getByRole('button', { name: /^Capa e dados do relatório/ }).click();
  await expect(etapa1(page)).toBeVisible({ timeout: 15_000 });
}

/** The thumbnail decoded a picture (its natural size) and is drawn with a box. */
async function expectThumbnail(page: Page): Promise<void> {
  await expect(thumb(page)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => thumb(page).evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0)), { timeout: 15_000 }).toBeGreaterThan(0);
  const box = await thumb(page).boundingBox();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
}

/** The text area's height against its own line height: how many lines it shows at once. */
async function linesShown(page: Page): Promise<number> {
  return info(page).evaluate((element) => {
    const style = getComputedStyle(element);
    const line = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4;
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    return (element.clientHeight - padding) / line;
  });
}

test('@p0 27.12-E2E-001 the cover photo shows its thumbnail from the local file, offline too; "Informações adicionais" is a text area that keeps three paragraphs, saved on leaving it, with its count', async ({ page, context }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await openEtapa1(page, relatorioId);

  // The cover photo: the tile shows its thumbnail as soon as it is chosen, and the outbox holds the pick.
  await expect(thumb(page)).toHaveCount(0);
  await page.getByTestId('upload-input-cover_photo').setInputFiles({ name: 'capa.png', mimeType: 'image/png', buffer: COVER });
  await expect(page.locator('.tile-name')).toContainText('capa.png');
  await expectThumbnail(page);
  await expect.poll(async () => (await outboxValues(database, page, relatorioSetupPath('cover_photo_file_id'))).length).toBe(1);
  const [coverId] = await outboxValues(database, page, relatorioSetupPath('cover_photo_file_id'));
  expect((await readFileBlobs(page, database)).map((blob) => blob.id)).toContain(coverId);

  // Three paragraphs: two filled, the third typed after an Enter, which is a new line, not a submit.
  const field = info(page);
  expect(await field.evaluate((element) => element.tagName)).toBe('TEXTAREA');
  await expect(field).toHaveClass(/\bobservation-field\b/);
  await field.fill(`${FIRST}\n${FIRST}`);
  await field.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(THIRD);
  const text = `${FIRST}\n${FIRST}\n${THIRD}`;
  await expect(field).toHaveValue(text);
  expect(text.length).toBeLessThanOrEqual(CAP);
  // The count follows what is typed (the kernel's sentence).
  await expect(page.getByTestId('char-count')).toHaveText(charCountText(text.length, CAP)!);
  // Several lines at once, not one (the mock's 96 px minimum height).
  expect(await linesShown(page)).toBeGreaterThanOrEqual(2);
  // Nothing is saved while typing goes on; leaving the field saves it.
  await field.blur();
  await expect.poll(() => outboxValues(database, page, relatorioSetupPath('additional_info')), { timeout: 15_000 }).toContainEqual(text);

  // A reload with the files API cut: the thumbnail is drawn from this device's file, the text stays.
  const fileRequests: string[] = [];
  await page.route('**/api/files/**', (route) => {
    fileRequests.push(route.request().url());
    return route.abort();
  });
  await page.reload();
  await expect(etapa1(page)).toBeVisible({ timeout: 30_000 });
  await expectThumbnail(page);
  await expect(info(page)).toHaveValue(text);
  await expect(page.getByTestId('char-count')).toHaveText(charCountText(text.length, CAP)!);
  expect(fileRequests.filter((url) => url.includes(coverId as string) && url.includes('thumb'))).toEqual([]);

  // Offline: back to the Sumário and into Etapa 1 again, the tile draws its thumbnail once more.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Voltar' }).click();
  await openEtapa1FromSumario(page);
  await expectThumbnail(page);
  await expect(info(page)).toHaveValue(text);
  await context.setOffline(false);

  // The layout at every width: no sideways scroll, the text area and the tile inside the screen, several lines shown.
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1280, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await field.scrollIntoViewIfNeeded();
    expect(await horizontalOverflow(page), `page overflow at ${width}`).toBeLessThanOrEqual(0);
    const area = (await field.boundingBox())!;
    expect(area.x, `text area left at ${width}`).toBeGreaterThanOrEqual(0);
    expect(area.x + area.width, `text area right at ${width}`).toBeLessThanOrEqual(width);
    expect(await linesShown(page), `lines shown at ${width}`).toBeGreaterThanOrEqual(2);
    await thumb(page).scrollIntoViewIfNeeded();
    await expectThumbnail(page);
    const tile = (await page.locator('.brand-tile').boundingBox())!;
    expect(tile.x + tile.width, `tile right at ${width}`).toBeLessThanOrEqual(width);
  }
});
