import { EMPTY_DEFINITION_CONTEXT, getDefinition, initialOrderKey, newEquipmentBlock, SEED_VERSION, type LocationRow, type OpDraft } from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Fix batch e24h, H9 (Bruno through Matheus, 2026-11-10): an observation never forces a restriction.
 * Driven as a person would at 1280 px on a new relatório: an Inspeção de QGBT (nothing to measure) in
 * a coluna of Geradores, its plate filled and its ten items Conforme on the office device, gets text in
 * its OBSERVAÇÕES. The suggestion still offers "Aprovado · Sem restrições", the Sem segment stays
 * enabled and no line names the observation; "Concluir ficha" stores Aprovado · Sem restrições; the
 * relatório's parecer reads Apto (the one concluded ficha, nothing stricter); and the draft PDF
 * ("Pré-visualizar") marks APROVADO and SEM RESTRIÇÕES for it. The draft goes through the api's one
 * queue and LibreOffice, so this spec runs in the `queue` lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const TYPE = 'inspecao_qgbt';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', TYPE);
const LOCAL = 'Geradores';
const TAG = 'QGBT-OBS';
const OBSERVATION = 'Pintura da porta desgastada, sem efeito na operação';

interface OutboxRow {
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const lastValue = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).at(-1)?.value;
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const toast = (page: Page) => page.getByTestId('toast');
const compact = (text: string) => text.replace(/\s+/g, '');

/** The standard relatório (Em campo) with a painel and its coluna in Geradores holding one Inspeção de QGBT, its plate filled and its items Conforme. */
function relatorioWithInspection(): { relatorioId: string; blockId: string; drafts: OpDraft[] } {
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
    definitions: EMPTY_DEFINITION_CONTEXT,
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: colunaId,
    type: TYPE,
    tag: TAG,
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(0),
  });
  const plate = DEFINITION.nameplate.map((f) =>
    officeDraft(
      account,
      scope,
      `sheet/${block.id}/nameplate/${f.key}`,
      f.kind === 'number' ? { raw: '380', unit: f.unit ?? null, state: 'measured' } : f.kind === 'date' ? '2020-01-01' : f.kind === 'select' ? f.options![0] : 'QGBT GERAL',
    ),
  );
  const conforme = DEFINITION.checklist!.map((item) => officeDraft(account, scope, `sheet/${block.id}/checklist/${item.key}/result`, 'C'));
  return {
    relatorioId: built.relatorioId,
    blockId: block.id,
    drafts: [
      ...built.drafts,
      officeDraft(account, scope, `location/${painelId}`, painel, 'create'),
      officeDraft(account, scope, `location/${colunaId}`, coluna, 'create'),
      officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
      officeDraft(account, scope, `block/${block.id}`, block, 'create'),
      ...plate,
      ...conforme,
      emCampoDraft(account, built.relatorioId),
    ],
  };
}

/** "Pré-visualizar" in the Export dialog; the draft PDF's text, compacted. */
async function previewText(page: Page, context: BrowserContext, relatorioId: string): Promise<string> {
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
  return compact((await pdfTextItems(new Uint8Array(await pdf.body()))).join(' '));
}

test('@p0 e24h-H9-E2E-001 an observation on a clean ficha leaves "Aprovado · Sem restrições" offered and enabled; concluded so, the parecer reads Apto and the draft marks SEM RESTRIÇÕES', async ({ page, context }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const seeded = relatorioWithInspection();
  const { relatorioId, blockId } = seeded;
  await pushDrafts(page, database, seeded.drafts);

  // The ficha: an observation typed in OBSERVAÇÕES.
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(DEFINITION.label, { timeout: 30_000 });
  const observations = page.getByLabel('Observações da ficha');
  await observations.scrollIntoViewIfNeeded();
  await observations.fill(OBSERVATION);
  await observations.press('Tab');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/observations`)).toBe(OBSERVATION);
  // A comment, never a restriction: not required, Sem enabled, no reason line, the suggestion Sem.
  await expect(observations).not.toHaveAttribute('data-required', '');
  const restriction = page.getByRole('radiogroup', { name: 'Restrições' });
  await expect(restriction.getByRole('radio', { name: 'Sem restrições', exact: true })).toBeEnabled();
  await expect(page.locator('.conclusion-control .conclusion-hint')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Sugestão' })).toContainText('Aprovado · Sem restrições?');

  // "Concluir ficha": the pair the floor gives is stored with the conclude, Aprovado · Sem restrições.
  await page.getByRole('button', { name: `Mais opções da ficha ${TAG}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `block/${blockId}/concluded_by`)).toBe(true);
  expect(await lastValue(page, `sheet/${blockId}/conclusion/result`)).toBe('aprovado');
  expect(await lastValue(page, `sheet/${blockId}/conclusion/restriction`)).toBe('sem_restricoes');

  // The relatório's parecer: Apto (Sumário row and Etapa 6).
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('li[data-row="section_10"] .sum-status')).toHaveText('Apto', { timeout: 30_000 });
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByRole('radiogroup', { name: 'Parecer' }).getByRole('radio', { name: 'Apto', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#setup-parecer .conclusion-hint')).toHaveCount(0);

  // The draft: the one concluded ficha marks APROVADO and SEM RESTRIÇÕES, and prints the observation.
  const text = await previewText(page, context, relatorioId);
  expect(text, 'the draft prints the observation').toContain(compact(OBSERVATION));
  expect(text.split('APROVADOXREPROVADOSEMRESTRIÇÕESXCOMRESTRIÇÕES')).toHaveLength(2);
  expect(text).not.toContain(compact('COM RESTRIÇÕES (VER OBSERVAÇÕES) X'));
});
