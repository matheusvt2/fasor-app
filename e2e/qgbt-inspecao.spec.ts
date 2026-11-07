import { getDefinition, initialOrderKey, newEquipmentBlock, screenLabel, SEED_VERSION, type BlockRow, type LocationRow, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { paletteTypes, typeRows } from './support/palette.ts';
import { devicePhotos } from './support/photos.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 22.11-E2E. The Inspeção de QGBT, the library type of seed v12 (four nameplate fields, the Quadro
 * elétrico's visual items, no tests), driven as a person would, from the field palette to the DOCX.
 *
 * 22.11-E2E-001 (1024 px, where the field palette creates at a tap): a standard relatório on v12 whose local Geradores, grouped by type,
 * holds a painel with a coluna and a full Quadro elétrico there. "Adicionar bloco em Painel 1 de
 * Geradores" lists the Inspeção de QGBT after the Quadro elétrico under "Outros equipamentos" and
 * creates one in the coluna with a QGBT TAG; its sheet shows the four fields, the ten items and
 * no Ensaios step; the numbers are typed, an item is NC and the rest Conforme, a photo is added on
 * the sheet, and the conclusion floor (an NC item) asks Aprovado · Com restrições. The DOCX prints
 * it under the coluna's "Outros equipamentos" after the full QGBT sheet, as QGBT/QD's, with its
 * nameplate, its ten-item checklist, its photo and its conclusion. It generates through the one
 * queue and LibreOffice of the api, so the file is in the serial group. It resets this worker's
 * own Empresa B (E6-Q7).
 */

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

const TYPE = 'inspecao_qgbt';
const QD = 'quadro_eletrico';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', TYPE);
const LOCAL = 'Geradores';
const PAINEL = `Painel 1 de ${LOCAL}`;
const JOB_TIMEOUT = 150_000;
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const lastWritten = async (page: Page, path: string) => (await outbox(page)).filter((op) => op.path === path).at(-1)?.value;
const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const checklistRow = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);

async function goToStep(page: Page, name: string, step: string): Promise<void> {
  await stepper(page).getByRole('button', { name: new RegExp(`^${name},`) }).click();
  await expect(page.locator(`#ficha-step-${step}`)).toBeFocused();
}

/** The standard relatório (v12, Em campo) with a painel and its coluna in Geradores, grouped by type, and a full QGBT in the coluna. */
function relatorioWithPainel(): { relatorioId: string; colunaId: string; drafts: OpDraft[] } {
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const locations = built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('location/')).map((draft) => draft.value as unknown as LocationRow);
  const geradores = locations.find((location) => location.kind === 'cabine' && location.name === LOCAL)!;
  const painelId = newId();
  const colunaId = newId();
  const painel = { id: painelId, relatorio_id: built.relatorioId, parent_id: geradores.id, kind: 'painel', name: 'Painel 1', order_key: initialOrderKey(90), removed_at: null };
  const coluna = { id: colunaId, relatorio_id: built.relatorioId, parent_id: painelId, kind: 'coluna', name: 'Coluna 1', order_key: initialOrderKey(0), removed_at: null };
  const { equipment, block } = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: colunaId,
    type: QD,
    tag: 'QD-C01',
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(0),
  });
  return {
    relatorioId: built.relatorioId,
    colunaId,
    drafts: [
      ...built.drafts,
      officeDraft(account, scope, `location/${painelId}`, painel, 'create'),
      officeDraft(account, scope, `location/${colunaId}`, coluna, 'create'),
      officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
      officeDraft(account, scope, `block/${block.id}`, block, 'create'),
      officeDraft(account, scope, `location/${geradores.id}/agrupar_por_tipo`, true),
      emCampoDraft(account, built.relatorioId),
    ],
  };
}

test('@p0 22.11-E2E-001 at 1024: the field palette of a painel adds an Inspeção de QGBT with a QGBT TAG; its sheet has four fields, ten items, no Ensaios, a photo and the conclusion floor; the DOCX prints it under "Outros equipamentos" after the full QGBT sheet with its checklist and photo', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page, account.email);
  const seeded = relatorioWithPainel();
  const { relatorioId } = seeded;
  await pushDrafts(page, database, seeded.drafts);

  // --- the field palette of the painel: the inspection after the full QGBT, under "Outros equipamentos" ---
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await expandLocation(page, PAINEL);
  await page.getByRole('button', { name: `Adicionar bloco em ${PAINEL}`, exact: true }).click();
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(fieldPalette.locator('.palette-where')).toHaveText(`Em: ${LOCAL} › Painel 1 › Coluna 1`);
  const types = paletteTypes(SEED_VERSION);
  expect(types.library.indexOf(TYPE)).toBe(types.library.indexOf(QD) + 1);
  const row = typeRows(fieldPalette, [TYPE]);
  await expect(row.locator('.pi-text > span').first()).toHaveText(DEFINITION.label);
  const tag = (await row.locator('.pi-meta').innerText()).trim().split(' · ').at(-1)!;
  expect(tag).toMatch(/^QGBT-C01(-\d+)?$/);
  await row.click();
  await expect(fieldPalette).toBeHidden();
  await expect(toast(page)).toContainText(`${tag} criada na Coluna 1`);
  const create = (await outbox(page)).find((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === TYPE)!;
  expect(create.value).toMatchObject({ block_type: TYPE, seed_version: SEED_VERSION, relatorio_id: relatorioId, location_id: seeded.colunaId });
  const blockId = (create.value as BlockRow).id;

  // --- the sheet: four fields, ten items, no test step ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(DEFINITION.label, { timeout: 30_000 });
  await expect(page.locator('.sheet-header .sheet-title .lib-pill')).toHaveText('Tipo da biblioteca');
  const keys = await page.locator('#ficha-nameplate [data-field-key]').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-field-key')))]);
  expect(keys).toEqual(DEFINITION.nameplate.map((one) => one.key));
  await expect(stepper(page).getByRole('button', { name: /^Ensaios,/ })).toHaveCount(0);
  const identificacao = field(page, 'identificacao').locator('input');
  await identificacao.fill('QGBT GERAL');
  await identificacao.press('Tab');
  const tensao = field(page, 'tensao_nominal').locator('input');
  await tensao.fill('380');
  await tensao.press('Tab');
  const corrente = field(page, 'corrente_nominal').locator('input');
  await corrente.fill('800');
  await corrente.press('Tab');
  await expect
    .poll(async () => ({
      identificacao: await lastWritten(page, `sheet/${blockId}/nameplate/identificacao`),
      tensao: await lastWritten(page, `sheet/${blockId}/nameplate/tensao_nominal`),
      corrente: await lastWritten(page, `sheet/${blockId}/nameplate/corrente_nominal`),
    }))
    .toEqual({ identificacao: 'QGBT GERAL', tensao: measured('380', 'V'), corrente: measured('800', 'A') });

  // The checklist: the ten visual items; one NC with a chip, the rest Conforme.
  await goToStep(page, 'Verificações', 'verificacoes');
  const items = DEFINITION.checklist!;
  const listed = await page.locator('#ficha-step-verificacoes li.checklist-row').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-key')));
  expect(listed).toEqual(items.map((item) => item.key));
  expect(items).toHaveLength(10);
  const nc = items.findIndex((item) => item.key === 'barramentos');
  const ncItem = items[nc]!;
  await checklistRow(page, ncItem.key).getByRole('radiogroup', { name: `${nc + 1}. ${screenLabel(ncItem.label)}` }).getByRole('radio', { name: 'Não conforme' }).click();
  const phrase = ncItem.nc_phrases[0]!;
  await checklistRow(page, ncItem.key).getByRole('group', { name: `Observações sugeridas do item ${nc + 1}` }).getByRole('button', { name: phrase }).click();
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(toast(page)).toContainText('marcados Conforme');

  // A photo on the sheet: the picker, then "De qual equipamento?" with this sheet chosen.
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, 'qgbt.jpg')]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(which).toBeVisible();
  await which.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.block_id === blockId).length, { timeout: 15_000 }).toBe(1);

  // The conclusion: the NC item sets the floor Aprovado · Com restrições.
  await goToStep(page, 'Conclusão', 'conclusao');
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Aprovado · Com restrições?');
  await expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Sem restrições', exact: true })).toBeDisabled();
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => lastWritten(page, `sheet/${blockId}/conclusion/restriction`)).toBe('com_restricoes');

  // --- the DOCX ---
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await setParecer(page, relatorioId, 'Apto com restrições');
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(modal);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));

  // Under the coluna's "Outros equipamentos", after the full QGBT sheet.
  const outros = structure.headings.filter((heading) => heading.level === 2 && heading.text.includes('Outros equipamentos') && heading.text.includes('Coluna 1'));
  expect(outros, JSON.stringify(structure.headings)).toHaveLength(1);
  const title = `${DEFINITION.print_title} ${tag}`;
  const full = `${DEFINITION.print_title} QD-C01`;
  expect(structure.paragraphs).toContain(title);
  expect(structure.paragraphs.indexOf(full)).toBeGreaterThan(-1);
  expect(structure.paragraphs.indexOf(full)).toBeLessThan(structure.paragraphs.indexOf(title));
  // Its checklist: the ten items, the NC one with its phrase.
  const checklist = structure.tables.find((table) => table[0]?.[0] === 'VERIFICAÇÕES GERAIS' && table.some((cells) => cells[4] === phrase))!;
  expect(checklist).toHaveLength(2 + 10);
  expect(checklist[2 + nc]).toEqual([`${nc + 1}. ${ncItem.label}`, '', 'X', '', phrase]);
  // Its nameplate with CORRENTE NOMINAL, and its photo after its title.
  const plate = structure.tables.find((table) => table[0]?.[0] === 'DADOS DO EQUIPAMENTO' && table.some((cells) => cells.includes('QGBT GERAL')))!;
  expect(JSON.stringify(plate)).toContain('CORRENTE NOMINAL');
  expect(JSON.stringify(plate)).toContain('800 A');
  const after = structure.paragraphs.slice(structure.paragraphs.indexOf(title));
  expect(after.some((paragraph) => /^Imagem \d+:/.test(paragraph))).toBe(true);
  // Its conclusion, the one sheet of the relatório concluded: Aprovado · Com restrições, the floor of its NC item.
  const concluded = structure.tables.filter((table) => table[0]?.[0] === 'CONCLUSÃO' && table[1]?.includes('X'));
  expect(concluded.map((table) => table[1])).toEqual([['APROVADO', 'X', 'REPROVADO', '', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']]);
});
