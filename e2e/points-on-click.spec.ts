import { cellAddressesOf, getDefinition, SEED_VERSION, siteItems, type PointRow } from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Fix batch e24h (Matheus, 2026-11-10, on Bruno's report of points created with no tap): a point of
 * attention exists only when the technician creates it. Driven as a person would at 1280 px on a new
 * relatório (seed v13): an NC row on a ficha, an NC item on a local's "Verificações do local", a
 * reading typed out of its criterion, a ficha concluded Reprovado by hand and an equipment marked Não
 * ensaiado. After each, the Points screen lists nothing ("Pontos de atenção" with its empty note),
 * Sumário row 8 reads "Nenhum ponto de atenção" and the device's store holds no point; the draft PDF
 * ("Pré-visualizar") prints section 8's empty note. Then "Criar ponto de atenção" on the ficha's NC row
 * writes one point of origin `nc` (its create op in the outbox), Pontos reads "Pontos de atenção (1)"
 * and the next draft prints it. The draft goes through the api's one queue and LibreOffice, so this
 * spec runs in the `queue` lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const SECC = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
const FIRST_ITEM = SECC.checklist![0]!;
const SITE_ITEM = siteItems(SEED_VERSION)[2]!;
const ENEL = 'Cubículo Enel';
const POINTS_HEADING = 'PONTOS DE ATENÇÃO';
const EMPTY_NOTE = '(sem conteúdo nesta revisão)';
const POINT_ACTION = 'Limpar e reapertar os terminais';

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const storedPoints = async (page: Page) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
const row8 = (page: Page) => page.locator('li.sum-row[data-row="section_8"]');
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const toast = (page: Page) => page.getByTestId('toast');
const checklistRow = (page: Page, itemKey: string) => page.locator(`li.checklist-row[data-item-key="${itemKey}"]`);
/** Text with every run of white space taken out: a PDF line may wrap anywhere. */
const compact = (text: string) => text.replace(/\s+/g, '');

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** The Points screen, Sumário row 8 and the device's store: no point anywhere. */
async function expectNoPoint(page: Page, relatorioId: string, after: string): Promise<void> {
  expect(await storedPoints(page), after).toEqual([]);
  expect((await outbox(page)).filter((op) => op.path.startsWith('point/')), after).toEqual([]);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await expect(row8(page).locator('.sum-status'), after).toHaveText('Nenhum ponto de atenção');
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção', exact: true }), after).toBeVisible();
  await expect(page.locator('.poa-empty'), after).toHaveText('Nenhum ponto de atenção.');
  await expect(page.locator('.poa-list > .point-of-attention-card'), after).toHaveCount(0);
  await expect(page.locator('.section-note'), after).not.toContainText('sozinhos');
}

/** "Pré-visualizar" in the Export dialog, as a person taps it; returns section 8 of the draft PDF, compacted. */
async function previewSection8(page: Page, context: BrowserContext, relatorioId: string): Promise<string> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const preview = dialog.locator('.generate-row').getByRole('button', { name: 'Pré-visualizar' });
  await expect(preview).toBeEnabled({ timeout: 30_000 });
  const tabPromise = context.waitForEvent('page');
  await preview.click();
  const tab = await tabPromise;
  const requested = await tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const pdf = await page.request.get(requested.url());
  expect(pdf.status()).toBe(200);
  await tab.close();
  await page.keyboard.press('Escape');
  const text = compact((await pdfTextItems(new Uint8Array(await pdf.body()))).join(' '));
  // The body's heading is the last one (the ÍNDICE lists it first); the section runs to the parecer's heading.
  const from = text.lastIndexOf(compact(POINTS_HEADING));
  expect(from, 'the draft has the points section').toBeGreaterThanOrEqual(0);
  const to = text.indexOf(compact('CONCLUSÃO E OBSERVAÇÕES TÉCNICAS'), from);
  return text.slice(from, to < 0 ? text.length : to);
}

test('@p0 e24h-E2E-001 an NC row, a site NC, a reading out of criterion, a Reprovado by hand and a Não ensaiado sheet create no point; "Criar ponto de atenção" on the NC row writes the one point and the draft prints it', async ({
  page,
  context,
}) => {
  test.setTimeout(420_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const relatorioId = built.relatorioId;
  const enelId = (built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === ENEL)!.value as { id: string }).id;
  const [chave, second] = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === ENEL) as [SeededSheet, SeededSheet];
  const dj = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const untested = built.sheets.find((sheet) => sheet.blockType === 'para_raio')!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, relatorioId)]);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await expectNoPoint(page, relatorioId, 'before anything');

  // (1) An NC row of a ficha.
  await openSheet(page, relatorioId, chave.blockId);
  const ncRow = checklistRow(page, FIRST_ITEM.key);
  await ncRow.scrollIntoViewIfNeeded();
  await ncRow.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect(ncRow.getByRole('radio', { name: 'Não conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/result`).map((op) => op.value)).toEqual(['NC']);
  await expectNoPoint(page, relatorioId, 'after an NC row');

  // (2) An NC item of the local's "Verificações do local".
  await page.goto(`/relatorio/${relatorioId}/local/${enelId}/verificacoes`);
  const siteRow = checklistRow(page, SITE_ITEM.key);
  await siteRow.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await siteRow.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect(siteRow.getByRole('radio', { name: 'Não conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `location/${enelId}/checklist/${SITE_ITEM.key}/result`).map((op) => op.value)).toEqual(['NC']);
  await expectNoPoint(page, relatorioId, 'after a site NC');

  // (3) A reading typed out of its criterion: the disjuntor's first insulation capture at 300 MΩ (> 400 MΩ).
  const [first] = cellAddressesOf(getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt'), 'isolacao');
  await openSheet(page, relatorioId, dj.blockId);
  const input = page.locator(`input[data-cell-input="isolacao:${first!.row}:${first!.col}"]`).filter({ visible: true });
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.keyboard.type('300M');
  await page.keyboard.press('Tab');
  await expect
    .poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${dj.blockId}/test/isolacao/cell/${first!.row}/${first!.col}`).map((op) => op.value))
    .toEqual([{ raw: '300', unit: 'MΩ', state: 'measured' }]);
  await expectNoPoint(page, relatorioId, 'after a reading out of criterion');

  // (4) A ficha concluded Reprovado by hand.
  await openSheet(page, relatorioId, second.blockId);
  const reprovado = page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Reprovado' });
  await reprovado.scrollIntoViewIfNeeded();
  await reprovado.click();
  await expect(reprovado).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${second.blockId}/conclusion/result`).map((op) => op.value)).toContainEqual('reprovado');
  await expectNoPoint(page, relatorioId, 'after a Reprovado by hand');

  // (5) An equipment marked Não ensaiado: the toast and the band promise no point.
  await openSheet(page, relatorioId, untested.blockId);
  await page.getByRole('button', { name: `Mais opções da ficha ${untested.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const mark = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await mark.getByRole('radio', { name: 'Outro' }).click();
  await mark.getByLabel('Descreva o motivo').fill('Sala trancada na visita');
  await mark.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(mark).toBeHidden();
  await expect(toast(page)).toContainText('Marcada como não ensaiada');
  await expect(toast(page)).not.toContainText('entra na');
  await expect(page.locator('.not-tested-band')).toContainText('a ficha imprime com os dados de placa e o motivo.');
  await expect(page.locator('.not-tested-band')).not.toContainText('entra na');
  await expectNoPoint(page, relatorioId, 'after a Não ensaiado sheet');

  // The draft: section 8 prints its empty note, none of the five findings.
  const empty = await previewSection8(page, context, relatorioId);
  expect(empty).toContain(compact(EMPTY_NOTE));
  for (const head of ['Item não conforme', 'Ensaio fora do critério', 'Equipamento reprovado', 'Equipamento não ensaiado', 'Sala trancada']) expect(empty).not.toContain(compact(head));

  // "Criar ponto de atenção" on the ficha's NC row: one point of origin nc, its create op in the outbox.
  await openSheet(page, relatorioId, chave.blockId);
  await ncRow.scrollIntoViewIfNeeded();
  await ncRow.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  const rowText = `Item 1 (${FIRST_ITEM.label.toLocaleLowerCase('pt-BR')}) não conforme`;
  await expect(editor.getByRole('textbox', { name: 'Texto' })).toContainText(rowText);
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill(POINT_ACTION);
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(async () => (await outbox(page)).filter((op) => op.kind === 'create' && op.path.startsWith('point/')).map((op) => op.value))
    .toEqual([expect.objectContaining({ origin: 'nc', item_key: FIRST_ITEM.key, text: rowText })]);
  await expect.poll(async () => (await storedPoints(page)).map((point) => point.origin)).toEqual(['nc']);
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (1)' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(1);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(row8(page).locator('.sum-status')).toHaveText('1 ponto · 1 ponto sem prazo', { timeout: 30_000 });

  // The next draft prints it, and it alone.
  const printed = await previewSection8(page, context, relatorioId);
  expect(printed).toContain(compact(rowText));
  expect(printed).toContain(compact(POINT_ACTION));
  expect(printed).not.toContain(compact(EMPTY_NOTE));
  for (const head of ['Item não conforme:', 'Ensaio fora do critério', 'Equipamento reprovado', 'Equipamento não ensaiado']) expect(printed).not.toContain(compact(head));
});
