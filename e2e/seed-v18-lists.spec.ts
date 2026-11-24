import { choiceValue, getDefinition, getSeed, SEED_VERSION, UTILITY_NAME_SLOT } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { openStep, outboxValues, setUpRelatorio, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';

/*
 * 28.4-E2E-001 (batch e28a, Story 28.4; B-5, B-17, B-8, B-15 with Bruno's Q-3, Q-4 and Q-5). On a v18 relatório from the
 * standard template at 1280 px, as a person fills it, every word the kernel's:
 * - a dry transformer (A SECO) asks nineteen items, 18 and 19 in the dry words; item 18 answered NC offers its phrases and
 *   "Criar ponto de atenção";
 * - a TP's thermography "Não realizada" offers six reasons, "Carga insuficiente para avaliação" chosen;
 * - a TC marked not tested for "Equipamento da concessionária" shows the justification with its TAG and the slot of the
 *   name; while the name is empty the Gerar dialog names it as blocking; the typed name fills the text;
 * - the No-break de comando's battery date names the exchange (from the kernel: the standard template has none);
 * - the issued DOCX prints rows 18 and 19 (18 marked NC), the thermography's reason and the TC's justification.
 * It issues a revision through the api's one queue and LibreOffice, so it runs in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TRANSFORMER = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const ITEM_18 = TRANSFORMER.checklist![17]!;
const ITEM_19 = TRANSFORMER.checklist![18]!;
const REASON = getSeed(SEED_VERSION, 'cabine_primaria').not_tested_reasons.find((reason) => reason.utility === true)!;
const UTILITY = 'Concessionária Exemplo';

const row = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const entities = <T,>(page: Page) => readStore<{ entity: string; id: string; row: T }>(page, database, 'entities');

test('@p0 28.4-E2E-001 v18 lists: items 18 and 19 in the dry words with NC, a new thermography reason, the utility reason with its name, the battery date; the DOCX prints them', async ({ page }) => {
  test.setTimeout(540_000);
  expect(SEED_VERSION).toBe('v18');
  expect(REASON.label).toBe('Equipamento da concessionária');
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [{ blockType: 'transformador_forca', key: 'tipo_de_isolacao', value: 'A SECO' }]);
  const tf = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const tp = sheets.find((sheet) => sheet.blockType === 'tp')!;
  const tc = sheets.find((sheet) => sheet.blockType === 'tc')!;

  // --- the dry transformer: nineteen items, 18 and 19 in the dry words; 18 NC offers its phrases and a point ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${tf.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#ficha-step-verificacoes li.checklist-row')).toHaveCount(19);
  await expect(row(page, ITEM_18.key)).toContainText('Sensores de temperatura (PT100) e relé térmico: alarme e desligamento');
  await expect(row(page, ITEM_19.key)).toContainText('Aterramento da carcaça e do neutro');
  // Neither is an oil item: nothing derived N.A. on the dry unit.
  for (const key of [ITEM_18.key, ITEM_19.key]) await expect(row(page, key).locator('[role="radio"][aria-checked="true"]'), key).toHaveCount(0);
  await row(page, ITEM_18.key).getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tf.blockId}/checklist/${ITEM_18.key}/result`)).at(-1)).toBe('NC');
  const phrases = page.getByRole('group', { name: 'Observações sugeridas do item 18' });
  for (const phrase of ITEM_18.nc_phrases) await expect(phrases.getByRole('button', { name: phrase, exact: true })).toBeVisible();
  await phrases.getByRole('button', { name: ITEM_18.nc_phrases[0]!, exact: true }).click();
  await expect(row(page, ITEM_18.key).getByRole('button', { name: 'Criar ponto de atenção' })).toBeVisible();
  await row(page, ITEM_19.key).getByRole('radio', { name: 'Conforme', exact: true }).click();

  // --- the TP's thermography: "Não realizada", six reasons, "Carga insuficiente para avaliação" ---
  await openStep(page, relatorioId, tp.blockId, 'Ensaios');
  const thermography = testSection(page, 'termografia');
  await thermography.getByRole('radiogroup', { name: 'Termografia' }).getByRole('radio', { name: 'Não realizada', exact: true }).click();
  const reasons = thermography.getByRole('group', { name: 'Motivo da termografia não realizada' });
  await expect(reasons.getByRole('button')).toHaveText(['Equipamento fora de carga', 'Sem acesso seguro ao equipamento', 'Sem termovisor disponível', 'Carga insuficiente para avaliação', 'Fora do escopo contratado', 'Outro']);
  await reasons.getByRole('button', { name: 'Carga insuficiente para avaliação', exact: true }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tp.blockId}/test/termografia/value/motivo`)).at(-1)).toEqual(choiceValue('carga_insuficiente'));

  // --- the TC, not tested for the utility's equipment: the justification with its TAG and the empty slot ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${tc.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: `Mais opções da ficha ${tc.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await expect(dialog.getByRole('radio')).toHaveText(['Impossibilidade de desligamento', 'Solicitação do cliente', 'Equipamento inacessível', 'Defeito no equipamento', REASON.label, 'Outro']);
  await dialog.getByRole('radio', { name: REASON.label }).click();
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(dialog).toBeHidden();
  const justification = page.getByRole('region', { name: 'Justificativa' }).or(page.locator('section', { has: page.getByRole('heading', { name: 'Justificativa' }) }));
  const name = page.getByRole('textbox', { name: 'Concessionária', exact: true });
  const text = page.getByRole('textbox', { name: 'Texto impresso na seção 9' });
  await expect(name).toBeVisible();
  await expect(justification.first().getByText('Digite o nome: ele completa o texto abaixo.')).toBeVisible();
  await expect(text).toHaveValue(new RegExp(`equipamento\\(s\\) ${tc.tag}, de propriedade da concessionária \\[nome da concessionária\\] e destinado`));
  expect(UTILITY_NAME_SLOT).toBe('[nome da concessionária]');

  // While the name is empty the issue is blocked, and the Gerar dialog says why.
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await expect(modal.locator('li.is-blocking')).toContainText(`Nome da concessionária em branco: ${tc.tag}`);
  // Fix batch e28w (S1): the row says only its own words, the reason under the button names it, and its action opens the sheet.
  const utilityRow = modal.locator('li.is-blocking').filter({ hasText: 'Nome da concessionária em branco' });
  await expect(utilityRow.locator('.pc-text')).toHaveText(`Nome da concessionária em branco: ${tc.tag}`);
  await expect(utilityRow).not.toContainText('Dados do relatório');
  await expect(modal.locator('.generate-row .btn-reason')).toContainText(`o nome da concessionária de ${tc.tag} para emitir a revisão 1.`);
  await utilityRow.getByRole('button', { name: 'Abrir ficha' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/ficha/${tc.blockId}\\?volta=exportar$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  // The typed name fills the text and is written with the mark.
  await page.goto(`/relatorio/${relatorioId}/ficha/${tc.blockId}`);
  await name.fill(UTILITY);
  await name.press('Tab');
  await expect.poll(async () => ((await outboxValues(database, page, `block/${tc.blockId}/not_tested`)).at(-1) as { utility_name?: string } | undefined)?.utility_name).toBe(UTILITY);
  await expect(text).toHaveValue(new RegExp(`concessionária ${UTILITY} e destinado`));
  await expect(justification.first().getByText('Digitado nesta ficha · entra no texto abaixo')).toBeVisible();

  // --- the No-break de comando's battery date: the standard template places no No-break de comando, so its v18 label is
  // read from the kernel here (28.4-UNIT-001 pins it in the seed); the sheet draws the seed's label as every field's.
  expect(getDefinition(SEED_VERSION, 'cabine_primaria', 'no_break_comando').nameplate.find((field) => field.key === 'baterias_data_de_fabricacao_ou_instalacao')!.label).toBe('BATERIAS: DATA DE FABRICAÇÃO, INSTALAÇÃO OU TROCA');

  // --- the DOCX ---
  await setParecer(page, relatorioId, 'Apto');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await entities<{ id: string; number: number; relatorio_id: string }>(page)).find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1)!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  const checklistRows = structure.tables.filter((table) => table[0]?.[0] === 'VERIFICAÇÕES GERAIS').flat();
  const row18 = checklistRows.find((cells) => cells[0] === `18. ${ITEM_18.dry_label}`);
  expect(row18).toBeDefined();
  // ITEM · C · NC · NA · OBSERVAÇÕES: the X under NC.
  expect(row18!.slice(1, 4)).toEqual(['', 'X', '']);
  expect(checklistRows.some((cells) => cells[0] === `19. ${ITEM_19.dry_label}`)).toBe(true);
  const all = JSON.stringify(structure);
  expect(all).toContain('CARGA INSUFICIENTE PARA AVALIAÇÃO');
  expect(all).toContain(
    `NÃO ENSAIADO — ${REASON.label}: Ensaios não realizados no(s) equipamento(s) ${tc.tag}, de propriedade da concessionária ${UTILITY} e destinado(s) à medição de faturamento, por não haver autorização da concessionária para intervenção.`,
  );
  expect(all).not.toContain(UTILITY_NAME_SLOT);
  // Fix batch e28w (S3): item 18's "PT100" keeps its capitals in section 10's summary, and nowhere prints "pt100" (the
  // point an NC row starts is `e28w-UNIT-002`'s: this relatório creates none).
  expect(all).toContain('item 18 (sensores de temperatura (PT100) e relé térmico: alarme e desligamento) em 1 ficha');
  expect(all.toLocaleLowerCase('pt-BR').split('pt100').length - 1).toBe(all.split('PT100').length - 1);
});
