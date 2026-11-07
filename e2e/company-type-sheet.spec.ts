import {
  companyBlockType,
  definitionContext,
  getDefinition,
  initialOrderKey,
  newEquipmentBlock,
  publishedText,
  screenLabel,
  SEED_VERSION,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { duplicateLibraryType, openTypeList, publishButton, typeInto, typeRows } from './support/company-type.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, shoot } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * Fix batch e22h (B1, S3: Story 14.8 AC2). A company sheet is filled as a person fills a library
 * one. The library Quadro elétrico is duplicated in Templates › "Tipos de equipamento", renamed
 * and published as v1; a relatório of the standard template gets three sheets of it on the local
 * Geradores from the office (as the palette creates them, born at v1). On the first sheet: the
 * header says "Tipo da empresa"; two plate suggestions list and "Confirmar todos" takes them; one
 * item is NC with a chip, a photo and a Ponto de atenção, and "Marcar os restantes como Conforme" marks
 * every other item; a reading is typed and judged out of its criterion; the suggested conclusion is
 * confirmed. The first sheet concluded, "Repetir da ficha anterior do mesmo tipo" copies its
 * pattern onto the second; the third is marked Não ensaiado. Every step asserts the outbox.
 *
 * The plate suggestions are written as the reading job writes them (`pushSuggestion`), as
 * `suggestions.spec.ts` does: under the `fake` providers the job picks a device photo's fixture
 * by block type, and a company type (`type:{id}`) has none. Empresa B is this worker's own (E6-Q7).
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
}

const QD = 'quadro_eletrico' as const;
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', QD);
const ITEMS = DEFINITION.checklist!;
const NC_ITEM = ITEMS[0]!;
const NAME = 'QGBT da empresa';
const LOCAL = 'Geradores';
const TAGS = ['QGE-01', 'QGE-02', 'QGE-03'] as const;
const ROWS = ['Fase A', 'Fase B', 'Fase C', 'Neutro'];
const POINT_TEXT = 'Barramento com sinais de aquecimento';

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const written = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).map((row) => row.value);
const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const checklistRow = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const bulk = (page: Page) => page.locator('#ficha-step-verificacoes .bulk-action-bar');
const cellInput = (page: Page, row: string) => page.getByRole('textbox', { name: `${row}, 1 minuto`, exact: true });
const cellBox = (page: Page, row: number) => page.locator(`.ficha-cell[data-cell="isolacao:${row}:1"]`).filter({ visible: true });

async function goToStep(page: Page, name: string, step: string): Promise<void> {
  await stepper(page).getByRole('button', { name: new RegExp(`^${name},`) }).click();
  await expect(page.locator(`#ficha-step-${step}`)).toBeFocused();
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toContainText(NAME, { timeout: 30_000 });
}

/** Types a reading into the 1 MINUTO cell of `row` and leaves it with Tab: the blur commits it. */
async function typeReading(page: Page, row: string, text: string): Promise<void> {
  const input = cellInput(page, row);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await input.fill(text);
  await input.press('Tab');
}

test('@p0 14.8-E2E-002 a company sheet of a duplicated library type: plate suggestions listed and "Confirmar todos", an NC item with its photo and point, "Marcar os restantes como Conforme", a reading judged, the conclusion confirmed; "Repetir" onto a second sheet, a third marked Não ensaiado', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // --- the type: "Duplicar" of the library Quadro elétrico, renamed, published as v1 ---
  await openTypeList(page);
  const typeId = await duplicateLibraryType(page, QD);
  await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), NAME);
  await expect(page.locator('.tipo-head h2')).toHaveText(NAME);
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(1));
  await syncNow(page);
  const rows = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId);
  expect(rows.versions.map((row) => row.version)).toEqual([1]);
  const version = rows.versions[0]!;
  const definitions = definitionContext(rows.versions, rows.type === undefined ? [] : [rows.type]);

  // --- a relatório with three sheets of the company type on Geradores, born at v1 (office ops) ---
  const built = newRelatorioDrafts(account);
  const local = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === LOCAL)!.value as { id: string };
  const pairs = TAGS.map((tag, i) =>
    newEquipmentBlock({
      blockId: newId(),
      equipmentId: newId(),
      relatorioId: built.relatorioId,
      projectId: built.projectId,
      locationId: local.id,
      type: companyBlockType(typeId),
      tag,
      seedVersion: SEED_VERSION,
      orderKey: initialOrderKey(997 + i),
      typeVersion: { version: 1, id: version.id },
      definitions,
    }),
  );
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    ...pairs.flatMap(({ equipment, block }) => [
      officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
      officeDraft(account, { relatorioId: built.relatorioId }, `block/${block.id}`, block, 'create'),
    ]),
  ]);
  const relatorioId = built.relatorioId;
  const [first, second, third] = pairs.map((pair) => pair.block.id) as [string, string, string];
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });

  // --- the first sheet: the office's own type says so in the header (N11) ---
  await openSheet(page, relatorioId, first);
  await expect(sheetTitle(page).locator('.lib-pill')).toHaveText('Tipo da empresa');

  // --- B1: two plate suggestions list on the company plate, and "Confirmar todos" takes them ---
  const serial = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${first}/nameplate/n_serie`, value: 'QG-778812', actorId: account.userId });
  const volts = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${first}/nameplate/tensao_nominal`, value: measured('380', 'V'), actorId: account.userId });
  await syncNowAndReturn(page);
  await expect(sheetTitle(page)).toContainText(NAME);
  await expect(page.locator('#ficha-nameplate .field.suggestion-field')).toHaveCount(2, { timeout: 30_000 });
  await expect(field(page, 'n_serie').locator('.field.suggestion-field input.sv')).toHaveValue('QG-778812');
  await page.locator('#ficha-nameplate .suggestion-group-head').getByRole('button', { name: 'Confirmar todos (2)' }).click();
  await expect.poll(() => written(page, `sheet/${first}/nameplate/n_serie`)).toEqual(['QG-778812']);
  await expect.poll(() => written(page, `sheet/${first}/nameplate/tensao_nominal`)).toEqual([measured('380', 'V')]);
  expect(await written(page, `suggestion/${serial}/status`)).toEqual(['confirmed']);
  expect(await written(page, `suggestion/${volts}/status`)).toEqual(['confirmed']);

  // --- the checklist: the first item NC with a photo and a Ponto de atenção ---
  await goToStep(page, 'Verificações', 'verificacoes');
  const nc = checklistRow(page, NC_ITEM.key);
  await nc.scrollIntoViewIfNeeded();
  await nc.getByRole('radiogroup', { name: `1. ${screenLabel(NC_ITEM.label)}` }).getByRole('radio', { name: 'Não conforme' }).click();
  await expect(nc.getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => written(page, `sheet/${first}/checklist/${NC_ITEM.key}/result`)).toEqual(['NC']);
  const phrase = NC_ITEM.nc_phrases[0]!;
  await nc.getByRole('group', { name: 'Observações sugeridas do item 1' }).getByRole('button', { name: phrase }).click();
  await expect(page.getByLabel('Observação do item 1', { exact: true })).toHaveValue(phrase);
  await expect.poll(async () => (await written(page, `sheet/${first}/checklist/${NC_ITEM.key}/observation`)).at(-1)).toBe(phrase);
  await nc.getByRole('button', { name: 'Adicionar foto' }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.block_id === first && photo.item_key === NC_ITEM.key).length, { timeout: 15_000 }).toBe(1);
  await nc.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const pointDialog = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(pointDialog).toBeVisible();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(POINT_TEXT);
  await page.keyboard.press('Escape');
  await expect(pointDialog).toHaveCount(0);
  await expect(toast(page)).toContainText('Ponto de atenção salvo · 1 de 1 na seção 9');
  await expect(nc.locator('.nc-point-ref')).toHaveText('Ponto de atenção 1');
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path.startsWith('point/')).some((row) => JSON.stringify(row.value).includes(POINT_TEXT)))
    .toBe(true);

  // --- B1: "Marcar os restantes como Conforme" marks every item still unanswered ---
  await bulk(page).getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(toast(page)).toContainText(`${ITEMS.length - 1} itens marcados Conforme`);
  await expect
    .poll(async () => {
      const ops = await outbox(page);
      return ITEMS.slice(1).every((item) => ops.some((row) => row.path === `sheet/${first}/checklist/${item.key}/result` && row.value === 'C'));
    })
    .toBe(true);
  expect(await written(page, `sheet/${first}/checklist/${NC_ITEM.key}/result`)).toEqual(['NC']);
  await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible({ timeout: 15_000 });

  // --- a reading typed and judged: FASE C under the criterion at 380 V ---
  await goToStep(page, 'Ensaios', 'ensaios');
  const readings = ['850', '1200', '0,4', '900'];
  for (const [i, row] of ROWS.entries()) await typeReading(page, row, readings[i]!);
  await expect(cellBox(page, 2).locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellBox(page, 2).locator('.mf-helper[role="status"]')).toContainText('Abaixo do aceitável');
  for (const row of [0, 1, 3]) await expect(cellBox(page, row).locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');
  await expect.poll(() => written(page, `sheet/${first}/test/isolacao/cell/2/1`)).toEqual([measured('0.4', 'MΩ')]);

  // --- the suggested conclusion, confirmed ---
  await goToStep(page, 'Conclusão', 'conclusao');
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Reprovado · Com restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await written(page, `sheet/${first}/conclusion/result`)).at(-1)).toBe('reprovado');
  await expect.poll(async () => (await written(page, `sheet/${first}/conclusion/restriction`)).at(-1)).toBe('com_restricoes');

  // --- B1: "Repetir da ficha anterior do mesmo tipo" from the first sheet, concluded, onto the second ---
  await syncNowAndReturn(page);
  await pushDrafts(page, database, [officeDraft(account, { relatorioId }, `block/${first}/concluded_by`, { actor_id: account.userId, at: new Date().toISOString() })]);
  await syncNowAndReturn(page);
  await openSheet(page, relatorioId, second);
  await goToStep(page, 'Verificações', 'verificacoes');
  await bulk(page).getByRole('button', { name: 'Repetir da ficha anterior do mesmo tipo' }).click();
  await expect(toast(page)).toContainText(`Padrão de ${TAGS[0]} repetido`);
  await expect(checklistRow(page, NC_ITEM.key).getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(async () => {
      const ops = await outbox(page);
      return ITEMS.map((item) => ops.filter((row) => row.path === `sheet/${second}/checklist/${item.key}/result`).at(-1)?.value);
    })
    .toEqual(ITEMS.map((item) => (item.key === NC_ITEM.key ? 'NC' : 'C')));

  // --- the third sheet, marked Não ensaiado from its header ---
  await openSheet(page, relatorioId, third);
  await page.getByRole('button', { name: `Mais opções da ficha ${TAGS[2]}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Outro' }).click();
  await dialog.getByLabel('Descreva o motivo').fill('Quadro energizado sem janela de desligamento');
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText('Marcada como não ensaiada — entra na seção 9');
  await expect(sheetTitle(page).locator('.not-tested-chip')).toHaveText('Não ensaiado');
  await expect(sheetTitle(page).locator('.lib-pill')).toHaveText('Tipo da empresa');
  await expect
    .poll(async () => (await outbox(page)).find((row) => row.path === `block/${third}/not_tested`)?.value)
    .toMatchObject({ reason: 'outro', text: 'Quadro energizado sem janela de desligamento' });
});
