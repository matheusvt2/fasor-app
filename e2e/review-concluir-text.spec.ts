import { cellAddressesOf, getDefinition, SEED_VERSION, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { conclusionOpOf, concludeBatch, expectConcludeConfirmsText, lastTextStatus } from './support/conclude-batch.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Review fixes 2026-10-08, Decision 1 (`spec-review-fixes-2026-10-08-concluir-text.md`;
 * JRN-V1 and the stale row of AIB-1): "Concluir e avançar" and the menu's "Concluir ficha"
 * confirm the composed conclusion text in the conclude batch when the pair is set and no
 * text was stored; an edited text is left as it is; a stored text that went stale is named
 * on the Sumário's row 9 and in the Export dialog until "Substituir". Every test resets
 * Empresa B, pushes a standard relatório whose chave seccionadora is filled from an "office"
 * device (all but the conclusion) and drives the sheet as the engineer does.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const SECC = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
const CONFIRMED_HELPER = 'Confirmado · impresso na linha Conclusão da ficha (seção 9)';
const STALE_LINE = 'Sugerido: texto atualizado — Substituir';

type Scope = { relatorioId: string };

interface OutboxRow {
  path: string;
  value: unknown;
}

const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const row9 = (page: Page) => sumario(page).locator('li[data-row="section_9"]');
const generated = (page: Page) => page.locator('.ficha-conc-text .suggestion-field.is-generated');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });

/**
 * The Export dialog's summarized warnings ("N avisos — estão nas linhas do sumário"): the
 * stale row is one of them, like its twin `conclusion_unconfirmed` (not an explicit kind).
 */
async function exportWarnings(page: Page): Promise<number> {
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const line = exportDialog(page).locator('.precheck li').filter({ has: page.getByRole('button', { name: 'Ver no sumário' }) }).locator('.pc-text');
  await expect(line).toContainText(/^\d+ avisos? — /);
  const count = Number(/^(\d+)/.exec((await line.textContent()) ?? '')![1]);
  await page.keyboard.press('Escape');
  await expect(exportDialog(page)).toHaveCount(0);
  return count;
}

/** The plate (TAG from the block), every checklist item C and every reading within its criterion; no conclusion. */
function filledSheet(scope: Scope, blockId: string): OpDraft[] {
  const plate = (kind: string, unit: string | undefined, options: readonly string[] | undefined, key: string): unknown =>
    kind === 'number' ? { raw: '630', unit: unit ?? null, state: 'measured' } : kind === 'date' ? '2020-01-01' : kind === 'select' ? options![0] : kind === 'voltage_class' ? '15' : `P-${key}`;
  return [
    ...SECC.nameplate.filter((f) => f.key !== 'tag').map((f) => officeDraft(account, scope, `sheet/${blockId}/nameplate/${f.key}`, plate(f.kind, f.unit, f.options, f.key))),
    ...(SECC.checklist ?? []).map((item) => officeDraft(account, scope, `sheet/${blockId}/checklist/${item.key}/result`, 'C')),
    ...SECC.tests
      .flatMap((t) => cellAddressesOf(SECC, t.key))
      .map((c) =>
        officeDraft(account, scope, `sheet/${blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, c.testKey === 'isolacao' ? { raw: '150', unit: 'GΩ', state: 'measured' } : { raw: '100', unit: 'µΩ', state: 'measured' }),
      ),
  ];
}

/** Resets Empresa B, signs in at 1280 px and pushes a standard relatório with one filled seccionadora (not a cabine's first sheet). */
async function setUp(page: Page): Promise<{ relatorioId: string; sheet: SeededSheet }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const secc = built.sheets.filter((s) => s.blockType === 'chave_seccionadora');
  expect(secc.length, 'seccionadoras in the standard relatório').toBeGreaterThan(2);
  const sheet = secc[2]!;
  await pushDrafts(page, database, [...built.drafts, ...filledSheet({ relatorioId: built.relatorioId }, sheet.blockId)]);
  await openSumario(page, built.relatorioId);
  return { relatorioId: built.relatorioId, sheet };
}

async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  // Row 9 drawn from the relatório's rows: every other sheet is empty.
  await expect(row9(page)).toContainText(/\d+ fichas vazias/, { timeout: 30_000 });
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

async function openConclusao(page: Page): Promise<void> {
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Resultado' })).toBeVisible();
}

/** The suggested pair confirmed, the text left unconfirmed, then "Concluir e avançar". */
async function confirmPairAndConclude(page: Page, sheet: SeededSheet): Promise<void> {
  await openConclusao(page);
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Aprovado · Sem restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Sem restrições' })).toHaveAttribute('aria-checked', 'true');
  // The composed text stands unconfirmed: its own "Confirmar" is never tapped.
  await expect(generated(page).getByRole('button', { name: 'Confirmar' })).toBeVisible();
  expect(await lastTextStatus(page, database, sheet.blockId)).toBeUndefined();
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');
  await expect(page.locator('#ficha-primary')).toHaveText(/Concluir e avançar/);
  await page.locator('#ficha-primary').click();
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${sheet.blockId}$`));
}

test('@p0 R8CONC-E2E-001 "Concluir e avançar" on a sheet whose text was never confirmed confirms the composed text in the conclude batch; the sheet and row 9 read it confirmed', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, sheet } = await setUp(page);
  await openSheet(page, relatorioId, sheet.blockId);
  await confirmPairAndConclude(page, sheet);

  // One batch: the text, its status and its basis with `concluded_by`.
  const batch = await expectConcludeConfirmsText(page, database, sheet.blockId, `A seccionadora ${sheet.tag}`);
  expect(batch.some((row) => row.path === `block/${sheet.blockId}/concluded_by`)).toBe(true);
  const stored = String(conclusionOpOf(batch, sheet.blockId, 'text')!.value);

  // Back on the sheet: the stored text, confirmed, nothing left to confirm.
  await openSheet(page, relatorioId, sheet.blockId);
  await openConclusao(page);
  await expect(page.getByRole('textbox', { name: 'Texto da conclusão' })).toHaveText(stored);
  await expect(generated(page).locator('.helper')).toHaveText(CONFIRMED_HELPER);
  await expect(generated(page).getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  await expect(generated(page).locator('.suggestion-alt')).toHaveCount(0);

  // The Sumário's row 9 no longer says the sheet has no confirmed text.
  await openSumario(page, relatorioId);
  await expect(row9(page)).not.toContainText('sem texto de conclusão confirmado');
  await expect(row9(page)).not.toContainText('Texto de conclusão desatualizado');
});

test('@p0 R8CONC-E2E-002 an edited text is left as it is: the menu\'s "Concluir ficha" writes no conclusion text op', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, sheet } = await setUp(page);
  await openSheet(page, relatorioId, sheet.blockId);
  await openConclusao(page);
  await page.getByRole('group', { name: 'Sugestão' }).getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Sem restrições' })).toHaveAttribute('aria-checked', 'true');

  // "Editar": stored as edited at once, typed, blurred.
  await generated(page).getByRole('button', { name: 'Editar' }).click();
  await expect.poll(async () => lastTextStatus(page, database, sheet.blockId)).toBe('edited');
  const editor = page.getByRole('textbox', { name: 'Texto da conclusão' });
  await expect(editor).toBeFocused();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Texto revisado.');
  await editor.blur();
  const textOps = async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === `sheet/${sheet.blockId}/conclusion/text`).map((row) => String(row.value));
  await expect.poll(async () => (await textOps()).at(-1)).toMatch(/ Texto revisado\.$/);
  const edited = (await textOps()).at(-1)!;

  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');
  await page.getByRole('button', { name: `Mais opções da ficha ${sheet.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect(toast(page)).toContainText('Ficha concluída');

  const batch = await concludeBatch(page, database, sheet.blockId);
  expect(batch.filter((row) => row.path.startsWith(`sheet/${sheet.blockId}/conclusion/text`)), 'the conclude writes no text op over an edited text').toEqual([]);
  expect(await lastTextStatus(page, database, sheet.blockId)).toBe('edited');
  expect((await textOps()).at(-1)).toBe(edited);
});

test('@p0 R8CONC-E2E-003 a TAG renamed after the conclude makes the confirmed text stale: the sheet offers "Substituir", row 9 names the TAG and the Export dialog counts it until it is tapped', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, sheet } = await setUp(page);
  await openSheet(page, relatorioId, sheet.blockId);
  await confirmPairAndConclude(page, sheet);
  await expectConcludeConfirmsText(page, database, sheet.blockId, `A seccionadora ${sheet.tag}`);
  await openSumario(page, relatorioId);
  const warningsBefore = await exportWarnings(page);

  // "Renomear TAG" from the sheet's menu.
  const renamed = `${sheet.tag}-R`;
  await openSheet(page, relatorioId, sheet.blockId);
  await page.getByRole('button', { name: `Mais opções da ficha ${sheet.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Renomear TAG' }).click();
  const rename = page.getByRole('dialog', { name: `Renomear TAG ${sheet.tag}` });
  await rename.getByRole('textbox', { name: 'TAG' }).fill(renamed);
  await rename.getByRole('button', { name: 'Salvar' }).click();
  await expect(rename).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Mais opções da ficha ${renamed}` })).toBeVisible();

  // The sheet: the stored text stays, the recomposed one is offered.
  await openConclusao(page);
  await expect(generated(page).locator('.suggestion-alt')).toHaveText(STALE_LINE);

  // Row 9 and the Export dialog's pre-issue list name the sheet by its new TAG.
  const staleText = `Texto de conclusão desatualizado: ${renamed}`;
  await openSumario(page, relatorioId);
  await expect(row9(page)).toContainText(staleText);
  // The Export dialog counts it with the other warnings on the Sumário rows.
  expect(await exportWarnings(page)).toBe(warningsBefore + 1);

  // "Substituir" on the sheet: the recomposed text, under the new TAG; the row is gone.
  await openSheet(page, relatorioId, sheet.blockId);
  await openConclusao(page);
  await generated(page).locator('.suggestion-alt').getByRole('button', { name: 'Substituir' }).click();
  await expect(generated(page).locator('.suggestion-alt')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Texto da conclusão' })).toContainText(`A seccionadora ${renamed} `);
  const textOps = async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === `sheet/${sheet.blockId}/conclusion/text`).map((row) => String(row.value));
  await expect.poll(async () => (await textOps()).at(-1)).toMatch(new RegExp(`^A seccionadora ${renamed} `));
  expect(await lastTextStatus(page, database, sheet.blockId)).toBe('confirmed');
  await openSumario(page, relatorioId);
  await expect(row9(page)).not.toContainText('Texto de conclusão desatualizado');
  await expect(row9(page)).not.toContainText('sem texto de conclusão confirmado');
});
