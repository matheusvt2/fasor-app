import {
  companyBlockType,
  definitionContext,
  getDefinition,
  initialOrderKey,
  newEquipmentBlock,
  publishedText,
  SEED_VERSION,
  testHelpMetaText,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { companyRow, duplicateLibraryType, editorTab, openTypeList, publishButton, scrollsSideways, typeInto, typeRows } from './support/company-type.ts';
import { signInForDurability, waitForShellCache } from './support/durability.ts';
import { deviceDatabaseName, expect, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 23.10 (batch e23h) in the durability matrix (desktop Chrome, Android Chrome emulation,
 * WebKit), against the built bundle. The library Quadro elétrico is duplicated, five of the eight
 * "Como ensaiar" headings of its insulation test are typed in the type editor and the copy is
 * published (the version row in the store carries them). A relatório gets a sheet of it (office
 * ops, born at v1); the sheet opened, the network goes off, and "Como ensaiar" opens from the
 * definition already on the device: at 1280 px reached with Tab and opened with Enter, the five
 * headings in the fixed order and the kernel's meta line, the focus on the title, Esc giving it
 * back to the button; at 390 px full screen with no sideways scroll, "Voltar ao ensaio" closing it.
 * Back online: a seeded sheet's tests show no "Como ensaiar", the editor's fields do not overflow
 * at 390 px, "Duplicar" of the published type carries the help, and the sheet made read-only (Não
 * ensaiado) keeps the action. Synthetic texts (M-1). Empresa
 * B is this worker's own (E6-Q7); nothing is generated, so the file stays in the parallel group.
 */

const QD = 'quadro_eletrico' as const;
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', QD);
const TEST_INDEX = DEFINITION.tests.findIndex((test) => test.key === 'isolacao');
const TEST_KEY = DEFINITION.tests[TEST_INDEX]!.key;
const NAME = 'Quadro com Como ensaiar';
const LOCAL = 'Geradores';
const TAG = 'QCE-01';

/** Five of the eight headings, typed out of order on purpose: the dialog lists them in the fixed one. */
const FIVE = [
  ['nr10', 'Pré-requisito (NR-10)', 'Painel desenergizado, bloqueado e aterrado (texto de exemplo).'],
  ['objective', 'Objetivo', 'Conferir a isolação do barramento (texto de exemplo).'],
  ['procedure', 'Procedimento', 'Passo um do exemplo.\nPasso dois do exemplo.'],
  ['instrument', 'Instrumento', 'Megôhmetro calibrado (texto de exemplo).'],
  ['connections', 'Ligações', 'Linha na fase, terra na massa (texto de exemplo).'],
] as const;
const ORDER = ['objective', 'instrument', 'connections', 'procedure', 'nr10'];
const HELP = Object.fromEntries(FIVE.map(([key, , text]) => [key, text]));
const LABEL = Object.fromEntries(FIVE.map(([key, label]) => [key, label])) as Record<string, string>;

interface OutboxRow {
  path: string;
  value: unknown;
}

const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const testRow = (page: Page) => page.locator(`li.registry-row[data-entry-key="tests:${TEST_INDEX}"]`);
const helpGroup = (page: Page) => page.locator('li.def-edit').getByRole('group', { name: 'Como ensaiar' });

/** Moves the focus forward with Tab until `target` holds it; false after `max` presses. */
async function tabTo(page: Page, target: Locator, max = 25): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return true;
  }
  return false;
}

test('@p0 23.10-E2E-001 "Como ensaiar" typed in the type editor and published opens offline on the company sheet: Tab and Enter at 1280, the five headings in order with the kernel meta, focus on the title, Esc back to the button; full screen at 390 with "Voltar ao ensaio"; none on a seeded sheet; the editor fits 390; "Duplicar" carries it', async ({
  page,
  context,
  seed,
}) => {
  test.setTimeout(300_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  const written = async (path: string) => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInForDurability(page, context, account.email);
  await waitForShellCache(page);

  // --- the type: "Duplicar" of the library Quadro elétrico, five headings typed, published as v1 ---
  await openTypeList(page);
  const typeId = await duplicateLibraryType(page, QD);
  await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), NAME);
  await editorTab(page, 'Ensaios');
  await testRow(page).locator('button.rr-text').click();
  await expect(helpGroup(page)).toBeVisible();
  await expect(helpGroup(page).getByRole('textbox')).toHaveCount(8);
  for (const [, label, text] of FIVE) await typeInto(helpGroup(page).getByRole('textbox', { name: label, exact: true }), text);
  await expect.poll(async () => ((await written(`equipment_type/${typeId}/draft`)).at(-1) as { tests?: { help?: unknown }[] } | undefined)?.tests?.[TEST_INDEX]?.help).toEqual(HELP);
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(1));
  await syncNow(page);
  const rows = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId);
  expect(rows.versions.map((row) => row.version)).toEqual([1]);
  const version = rows.versions[0]!;
  expect(version.definition.tests[TEST_INDEX]!.help).toEqual(HELP);
  const definitions = definitionContext(rows.versions, rows.type === undefined ? [] : [rows.type]);

  // --- a relatório with one sheet of the company type on Geradores, born at v1 (office ops) ---
  const built = newRelatorioDrafts(account);
  const local = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === LOCAL)!.value as { id: string };
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: local.id,
    type: companyBlockType(typeId),
    tag: TAG,
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(999),
    typeVersion: { version: 1, id: version.id },
    definitions,
  });
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, { projectId: built.projectId }, `equipment/${pair.equipment.id}`, pair.equipment, 'create'),
    officeDraft(account, { relatorioId: built.relatorioId }, `block/${pair.block.id}`, pair.block, 'create'),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${pair.block.id}`);
  await expect(sheetTitle(page)).toContainText(NAME, { timeout: 30_000 });

  // --- offline: the dialog opens from the definition on the device ---
  await context.setOffline(true);
  const section = page.locator(`#ficha-step-ensaios section[data-test-key="${TEST_KEY}"]`);
  const title = (await section.locator('.section-head h2').textContent())!;
  const action = section.locator('.section-head').getByRole('button', { name: 'Como ensaiar' });
  await expect(action).toHaveAttribute('aria-haspopup', 'dialog');
  // Keyboard only at 1280: the stepper's Ensaios button with Enter, then Tab to the action, then Enter.
  const ensaios = page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' }).getByRole('button', { name: /^Ensaios,/ });
  await ensaios.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ficha-step-ensaios')).toBeFocused();
  // The stepper's jump lands the focus on the step again 12 frames on when it finds it on the body
  // (`use-ficha-steps.ts` `goTo`), which is where it sits for a frame as the dialog closes: past
  // that watch, the restore to the button is the dialog's alone.
  await page.evaluate(() => new Promise<void>((resolve) => {
    let left = 15;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }));
  expect(await tabTo(page, action), 'Tab reaches "Como ensaiar"').toBe(true);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 2, name: title })).toBeFocused();
  await expect(dialog.locator('.como-kicker')).toHaveText('Como ensaiar');
  await expect(dialog.locator('.como-meta')).toHaveText(testHelpMetaText(NAME, 5));
  await expect(dialog.locator('.como-list dt')).toHaveText(ORDER.map((key) => LABEL[key]!));
  await expect(dialog.locator('.como-list dd')).toHaveText(ORDER.map((key) => HELP[key]!.replace('\n', ' ')));
  // A Form dialog at 1280, not full screen.
  const wide = (await dialog.boundingBox())!;
  expect(wide.width).toBeLessThanOrEqual(640);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(action).toBeFocused();

  // --- at 390: full screen, no sideways scroll; "Voltar ao ensaio" closes it ---
  await page.setViewportSize({ width: 390, height: 844 });
  await action.scrollIntoViewIfNeeded();
  await action.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 2, name: title })).toBeFocused();
  const box = (await dialog.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.y)).toBe(0);
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(843);
  expect(await scrollsSideways(page)).toBe(false);
  await dialog.getByRole('button', { name: 'Voltar ao ensaio' }).click();
  await expect(dialog).toBeHidden();
  await expect(action).toBeFocused();
  await context.setOffline(false);

  // --- a seeded sheet: its tests carry no help, so no action ---
  await page.setViewportSize({ width: 1280, height: 900 });
  const seeded = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${seeded.blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#ficha-step-ensaios section[data-test-key]').first()).toBeVisible();
  await expect(page.locator('#ficha-step-ensaios').getByRole('button', { name: 'Como ensaiar' })).toHaveCount(0);

  // --- the editor at 390: the eight fields and the recommendation fit the phone ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/templates/tipos/${typeId}`);
  await expect(page.locator('.tipo-head h2')).toHaveText(NAME, { timeout: 30_000 });
  await editorTab(page, 'Ensaios');
  await testRow(page).locator('button.rr-text').click();
  await expect(helpGroup(page).getByRole('textbox', { name: 'Objetivo', exact: true })).toHaveValue(HELP.objective!);
  await expect(page.locator('li.def-edit').getByRole('textbox', { name: 'Recomendação se reprovado' })).toBeVisible();
  for (const field of await helpGroup(page).getByRole('textbox').all()) {
    const fieldBox = (await field.boundingBox())!;
    expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(390);
  }
  expect(await scrollsSideways(page)).toBe(false);

  // --- "Duplicar" of the published type: the copy's draft carries the help ---
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTypeList(page);
  await companyRow(page, typeId).getByRole('button', { name: 'Duplicar' }).click();
  await expect(page).toHaveURL(/\/templates\/tipos\/[0-9a-f-]{36}$/);
  const copyId = new URL(page.url()).pathname.split('/')[3]!;
  expect(copyId).not.toBe(typeId);
  await expect
    .poll(async () => ((await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, copyId)).type?.draft as { tests?: { help?: unknown }[] } | null | undefined)?.tests?.[TEST_INDEX]?.help)
    .toEqual(HELP);

  // --- a read-only sheet (marked Não ensaiado from the office) keeps "Como ensaiar", and it opens ---
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId: built.relatorioId }, `block/${pair.block.id}/not_tested`, { reason: 'solicitacao_cliente', text: null, at: new Date().toISOString(), by: account.userId }),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${pair.block.id}`);
  await expect(sheetTitle(page)).toContainText(NAME, { timeout: 30_000 });
  await expect(page.locator('.not-tested-band')).toBeVisible({ timeout: 30_000 });
  await expect(section).toHaveClass(/is-readonly/);
  await expect(section.locator('.section-head .btn-reason')).toBeVisible();
  await expect(action).toBeVisible();
  await action.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.como-list dt')).toHaveText(ORDER.map((key) => LABEL[key]!));
  await dialog.getByRole('button', { name: 'Fechar Como ensaiar' }).click();
  await expect(dialog).toBeHidden();
  await expect(action).toBeFocused();
});
