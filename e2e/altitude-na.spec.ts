import { NOT_APPLICABLE_TEXT } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 17.6 (contract 27): "Altitude do site" (Etapa 5) takes N/A and says when the device gave
 * none, driven as the engineer drives it. The committed state is asserted in the outbox and the
 * device store (E12-A6), and what the sheet shows after it.
 *
 * 17.6-E2E-001: a position with no altitude (the emulated geolocation carries none) leaves the
 * field empty with the hint and the "N/A" control; the tap writes `site_altitude_na` true and
 * `site_altitude_m` null in one batch, the step shows the resolved line, a reload keeps it, and
 * the Cubículo Enel sheet's read-only Altitude reads "N/A" with no unit; "Alterar" brings the
 * field, the control and the hint back and a typed 760 is written.
 * 17.6-E2E-002: a position with an altitude prefills it, "Sugerido", no hint, the control there.
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
  batch_id: string | null;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const HINT = 'O aparelho não informou a altitude: digite o valor ou marque N/A';
const NA_PATH = 'relatorio/setup/site_altitude_na';
const M_PATH = 'relatorio/setup/site_altitude_m';

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const altitudeInput = (page: Page) => page.getByRole('spinbutton', { name: 'Altitude do site', exact: true });
const control = (page: Page) => page.getByRole('button', { name: 'Marcar Altitude do site como não aplicável', exact: true });
const resolvedLine = (page: Page) => page.getByText(`Altitude do site: ${NOT_APPLICABLE_TEXT}`, { exact: true });
const lastValue = async (page: Page, path: string): Promise<unknown> => (await outbox(page)).filter((row) => row.path === path).at(-1)?.value;

/** The standard relatório, Em campo, pushed from the office. */
async function setUp(page: Page): Promise<{ relatorioId: string; sheets: SeededSheet[] }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  return { relatorioId: built.relatorioId, sheets: built.sheets };
}

async function openEtapa5(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=5`);
  await expect(page.getByRole('heading', { name: 'Etapa 5 — Local' })).toBeVisible({ timeout: 30_000 });
}

/** The first Cubículo Enel sheet, the one that draws the cabine's Ambiente de ensaio. */
function enelSheet(sheets: readonly SeededSheet[]): SeededSheet {
  return sheets.find((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel')!;
}

test.describe('no altitude from the device', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: -23.5505, longitude: -46.6333 } });

  test('@p0 17.6-E2E-001 the hint and the "N/A" control; the tap writes the mark in one batch, the line survives a reload, the sheet reads "N/A"; "Alterar" reopens the field', async ({ page }) => {
    test.setTimeout(180_000);
    const built = await setUp(page);
    await openEtapa5(page, built.relatorioId);

    // The device answered with no altitude: empty field, the hint under it, the control beside it.
    const input = altitudeInput(page);
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(page.getByText(HINT)).toBeVisible();
    await expect(input).toHaveAccessibleDescription(HINT);
    await expect(control(page)).toBeVisible();
    await expect(page.locator('.altitude-field .suggested-pill')).toHaveCount(0);

    // The tap: one batch, the mark and the cleared number.
    await control(page).click();
    await expect(resolvedLine(page)).toBeVisible();
    await expect(altitudeInput(page)).toHaveCount(0);
    await expect
      .poll(async () => (await outbox(page)).filter((row) => row.path === NA_PATH || row.path === M_PATH).map((row) => [row.path, row.value]))
      .toEqual([
        [NA_PATH, true],
        [M_PATH, null],
      ]);
    const [mark, cleared] = (await outbox(page)).filter((row) => row.path === NA_PATH || row.path === M_PATH);
    expect(mark!.batch_id).not.toBeNull();
    expect(cleared!.batch_id).toBe(mark!.batch_id);
    await expect
      .poll(async () => (await entities<{ setup: { site_altitude_na: boolean; site_altitude_m: number | null } }>(page)).find((record) => record.entity === 'relatorio' && record.id === built.relatorioId)?.row.setup)
      .toMatchObject({ site_altitude_na: true, site_altitude_m: null });

    // A reload keeps it.
    await page.reload();
    await expect(resolvedLine(page)).toBeVisible({ timeout: 30_000 });
    await expect(altitudeInput(page)).toHaveCount(0);

    // The cabine's sheet reads "N/A", no unit, from the setup.
    await page.goto(`/relatorio/${built.relatorioId}/ficha/${enelSheet(built.sheets).blockId}`);
    const shown = page.getByRole('textbox', { name: 'Altitude', exact: true });
    await expect(shown.locator('.mf-value')).toHaveText(NOT_APPLICABLE_TEXT, { timeout: 30_000 });
    await expect(shown.locator('.mf-unit')).toHaveCount(0);
    await expect(page.getByText('Do setup do relatório')).toBeVisible();

    // "Alterar": the field, the control and the hint come back; a typed value is written.
    await openEtapa5(page, built.relatorioId);
    await page.getByRole('button', { name: 'Alterar altitude do site' }).click();
    await expect(altitudeInput(page)).toBeVisible();
    await expect(altitudeInput(page)).toBeFocused();
    await expect(control(page)).toBeVisible();
    await expect(page.getByText(HINT)).toBeVisible();
    await expect.poll(() => lastValue(page, NA_PATH)).toBe(false);
    await altitudeInput(page).fill('760');
    await page.getByLabel('Justificativa').click();
    await expect.poll(() => lastValue(page, M_PATH)).toBe(760);
    await expect(page.getByText(HINT)).toHaveCount(0);
  });
});

test('@p1 17.6-E2E-002 a position with an altitude prefills it, "Sugerido", no hint, and the control is there', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) => ok({ coords: { altitude: 763.6 } } as GeolocationPosition),
      },
    });
  });
  const built = await setUp(page);
  await openEtapa5(page, built.relatorioId);
  const input = altitudeInput(page);
  await expect(input).toHaveValue('764');
  await expect(page.locator('.altitude-field .suggested-pill')).toHaveText('Sugerido');
  await expect(page.getByText(HINT)).toHaveCount(0);
  await expect(control(page)).toBeVisible();
});
