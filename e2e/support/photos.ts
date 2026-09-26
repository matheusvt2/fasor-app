import type { Locator, Page } from '@playwright/test';
import { expect, signIn, type SeedAccount } from './merged-fixtures.ts';
import { readStore } from './outbox.ts';
import { resetEmpresaB } from './reset-empresa-b.ts';
import { pushNewRelatorio } from './relatorio-seed.ts';

/*
 * Stories 6.1 and 6.2: the shared steps of the photo specs. Every spec resets Empresa B,
 * pushes a relatório of the standard template from an "office" device and opens its first
 * Chave seccionadora in Cubículo Enel through the tree, by the row's type.
 */

type Account = SeedAccount;

const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const enel = (page: Page) =>
  tree(page)
    .locator(':scope > li.s9-cabine')
    .filter({ has: page.locator(':scope > .s9-cab-row .s9-cab-name', { hasText: 'Cubículo Enel' }) });
const enelRows = (page: Page) => enel(page).locator(':scope > .s9-eqs > li.s9-eq');

/**
 * Resets Empresa B, signs in and opens the first Chave seccionadora of Cubículo Enel. The
 * durability projects pass their own sign-in (`signInForDurability`), which works on WebKit.
 */
export async function openChaveSheet(
  page: Page,
  account: Account,
  database: string,
  options: { width?: number; signIn?: () => Promise<void> } = {},
): Promise<{ relatorioId: string; blockId: string }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: options.width ?? 1280, height: 900 });
  if (options.signIn === undefined) await signIn(page, account.email);
  else await options.signIn();
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', {
    timeout: 30_000,
  });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expandir Cubículo Enel' });
  if ((await expand.count()) > 0) await expand.click();
  const row = enelRows(page)
    .filter({ has: page.locator('.s9-eq-name', { hasText: /^Chave seccionadora$/ }) })
    .first();
  await expect(row).toBeVisible();
  const blockId = (await row.getAttribute('data-block-id'))!;
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  return { relatorioId, blockId };
}

export interface PhotoRowRecord {
  id: string;
  kind: string;
  relatorio_id: string;
  block_id: string | null;
  item_key: string | null;
  caption: string | null;
  captured_at: string;
  tz_offset: number;
  local_seq: number;
  coords: { lat: number; lng: number; accuracy_m: number | null; source: string } | null;
  uploaded_at: string | null;
  variants: { thumb: string; print: string } | null;
  mime: string;
  reading_status: string;
  removed_at: string | null;
}

/** The photo rows the device holds, oldest first. */
export async function devicePhotos(page: Page, database: string): Promise<PhotoRowRecord[]> {
  const records = await readStore<{ entity: string; row: PhotoRowRecord }>(page, database, 'entities');
  return records
    .filter((record) => record.entity === 'file' && record.row.kind === 'photo')
    .map((record) => record.row)
    .sort((a, b) => (a.captured_at === b.captured_at ? a.local_seq - b.local_seq : a.captured_at < b.captured_at ? -1 : 1));
}

/** The width and height a JPEG declares in its first SOF segment. */
export function jpegSize(bytes: Buffer): { width: number; height: number } {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error('not a JPEG marker');
    const marker = bytes[at + 1]!;
    const length = bytes.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  throw new Error('no SOF segment');
}

/** Taps the shutter `n` times, waiting for the status line to count each shot. */
export async function shoot(page: Page, n: number): Promise<void> {
  const camera = page.getByRole('dialog', { name: 'Câmera' });
  for (let i = 1; i <= n; i++) {
    await camera.getByRole('button', { name: 'Disparar' }).click();
    await expect(camera.locator('.cam-count')).toHaveText(
      i === 1 ? '1 foto nesta rajada · salva neste aparelho com a legenda do contexto' : `${i} fotos nesta rajada · salvas neste aparelho com a legenda do contexto`,
    );
  }
}

/** The camera view, open with its live stream. */
export async function expectCameraOpen(page: Page): Promise<Locator> {
  const camera = page.getByRole('dialog', { name: 'Câmera' });
  await expect(camera).toBeVisible();
  await expect
    .poll(() => camera.locator('video').evaluate((video: HTMLVideoElement) => video.readyState >= 2 && video.videoWidth > 0), { timeout: 10_000 })
    .toBe(true);
  return camera;
}

/** A JPEG of `width` x `height` drawn in the page (no image library on the test side). */
export async function jpegFromPage(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = new OffscreenCanvas(w!, h!);
      const context = canvas.getContext('2d')!;
      const gradient = context.createLinearGradient(0, 0, w!, h!);
      gradient.addColorStop(0, '#2a5');
      gradient.addColorStop(1, '#a52');
      context.fillStyle = gradient;
      context.fillRect(0, 0, w!, h!);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    [width, height],
  );
  return Buffer.from(base64, 'base64');
}
