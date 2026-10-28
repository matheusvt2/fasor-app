import { NOT_APPLICABLE_TEXT } from '@app/domain';
import type { Page } from '@playwright/test';
import { signInForDurability, waitForShellCache } from './support/durability.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 17.6 on the durability projects (Android Chrome emulation, WebKit, desktop): the
 * device's position answers with no altitude (stubbed, so every engine answers alike); the
 * "N/A" control at 390 px writes `site_altitude_na` true and `site_altitude_m` null, the device
 * store holds the mark, a reload keeps the resolved line, and the cabine's sheet reads "N/A".
 * The desktop projects' `altitude-na.spec.ts` covers the hint, "Alterar" and the prefilled case;
 * the Android project matches only `*.durability.spec.ts`, hence this file.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  value: unknown;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const NA_PATH = 'relatorio/setup/site_altitude_na';
const M_PATH = 'relatorio/setup/site_altitude_m';
const lastValue = async (page: Page, path: string): Promise<unknown> =>
  (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === path).at(-1)?.value;
const resolvedLine = (page: Page) => page.getByText(`Altitude do site: ${NOT_APPLICABLE_TEXT}`, { exact: true });

test('@p0 17.6-DUR-001 at 390 px the "N/A" control on "Altitude do site" writes the mark, the store holds it, a reload keeps it, and the sheet reads "N/A"', async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) => ok({ coords: { altitude: null } } as GeolocationPosition),
      },
    });
  });
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await signInForDurability(page, context, account.email);
  await waitForShellCache(page);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);

  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=5`);
  const input = page.getByRole('spinbutton', { name: 'Altitude do site', exact: true });
  await expect(input).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('O aparelho não informou a altitude: digite o valor ou marque N/A')).toBeVisible();
  const button = page.getByRole('button', { name: 'Marcar Altitude do site como não aplicável', exact: true });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(resolvedLine(page)).toBeVisible();
  await expect.poll(() => lastValue(page, NA_PATH)).toBe(true);
  await expect.poll(() => lastValue(page, M_PATH)).toBeNull();
  await expect
    .poll(async () => (await readStore<EntityRecord<{ setup: { site_altitude_na: boolean } }>>(page, database, 'entities')).find((record) => record.entity === 'relatorio' && record.id === built.relatorioId)?.row.setup.site_altitude_na)
    .toBe(true);

  await page.reload();
  await expect(resolvedLine(page)).toBeVisible({ timeout: 30_000 });
  await expect(input).toHaveCount(0);

  const sheet = built.sheets.find((candidate) => candidate.blockType === 'chave_seccionadora' && candidate.locationName === 'Cubículo Enel')!;
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  const shown = page.getByRole('textbox', { name: 'Altitude', exact: true });
  await expect(shown.locator('.mf-value')).toHaveText(NOT_APPLICABLE_TEXT, { timeout: 30_000 });
  await expect(shown.locator('.mf-unit')).toHaveCount(0);
});
