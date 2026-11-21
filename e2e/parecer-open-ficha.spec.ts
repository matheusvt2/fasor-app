import { cellAddressesOf, composeParecer, derivedParecer, getDefinition, parecerReplacedText, parecerVerdictLabel } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceSnapshot, openStep, outboxValues, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.3 (batch e27a, F7 of the 2026-11-21 pass), driven as a person does at 1280 px on a new v16 relatório.
 * With nothing judged, Apto is tapped in Etapa 6 (one op). Then a breaker's contact reading is typed out of its
 * criterion, and the ficha is left open: the fichas now give Não apto, so Etapa 6's hint and the Sumário's row 10
 * say in one line that the chosen Apto was replaced and why, and the composed summary names the breaker as an
 * open ficha with a reading out of criterion, never as reprovada. Every expected word is the kernel's over the
 * device's own rows (E12-A6). Nothing is issued: the print of a v16 relatório keeps its sentence (27.3-UNIT).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const RELATORIO_SEED = 'v16';
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const hint = (page: Page) => page.locator('#setup-parecer .conclusion-hint');
const verdicts = (page: Page) => page.getByRole('radiogroup', { name: 'Parecer' });

async function openEtapa6(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
}

test('@p0 27.3-E2E-001 Apto chosen, then a breaker\'s contact reading out on an open ficha: Etapa 6 and the Sumário say Apto was replaced by Não apto and why; the summary names the ficha as open with a reading out, never reprovada', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account, { seedVersion: RELATORIO_SEED });
  const breaker = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  // Nothing judged: no verdict, every segment enabled. One tap on Apto is one op with the whole parecer.
  await openEtapa6(page, built.relatorioId);
  const apto = verdicts(page).getByRole('radio', { name: 'Apto', exact: true });
  await expect(apto).toBeEnabled();
  await expect(apto).toHaveAttribute('aria-checked', 'false');
  await apto.click();
  await expect(apto).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => outboxValues(database, page, 'relatorio/setup/parecer')).toEqual([{ verdict: 'apto', text: null, text_status: null, text_basis: null }]);
  await expect(hint(page)).toHaveCount(0);

  // The breaker's contact resistance, typed out of its criterion on pole A; the ficha is left open (no "Concluir ficha").
  const [first] = cellAddressesOf(getDefinition(RELATORIO_SEED, 'cabine_primaria', 'disjuntor_mt'), 'resistencia_contato');
  await openStep(page, built.relatorioId, breaker.blockId, 'Ensaios');
  await typeCell(page, database, breaker.blockId, 'resistencia_contato', first!.row, first!.col, '310');
  await expect.poll(async () => ((await outboxValues(database, page, `sheet/${breaker.blockId}/test/resistencia_contato/cell/${first!.row}/${first!.col}`)).at(-1) as { raw?: string } | undefined)?.raw).toBe('310');

  // The kernel over the device's rows: the ficha is open with a reading out, the fichas give Não apto, the Apto chosen is replaced.
  const snapshot = await deviceSnapshot(page, database, built.relatorioId);
  const stored = snapshot.blocks.find((block) => block.id === breaker.blockId)!;
  expect(stored.concluded_by).toBeNull();
  expect(derivedParecer(snapshot)).toBe('nao_apto');
  const replaced = parecerReplacedText(snapshot);
  expect(replaced).toBe(`O parecer escolhido (Apto) foi substituído por Não apto: 1 ficha em aberto com leitura fora do critério (${breaker.tag}).`);
  const composed = composeParecer(snapshot);
  expect(composed.text).toContain(`1 ficha em aberto com leitura fora do critério: ${breaker.tag}.`);
  expect(composed.text).not.toMatch(/reprovad/);

  // Etapa 6: Não apto, the looser verdicts disabled, the one replaced line, and the composed summary.
  await openEtapa6(page, built.relatorioId);
  await expect(verdicts(page).getByRole('radio', { name: 'Não apto', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(apto).toBeDisabled();
  await expect(hint(page)).toHaveText(replaced!);
  const summary = page.locator('.suggestion-field.is-generated .generated-text');
  await expect(summary).toHaveText(composed.text);
  await expect(summary).not.toContainText('reprovada');
  await expect(page.locator('.suggestion-field.is-generated .criteria-line')).toContainText(`em aberto com leitura fora do critério (${breaker.tag})`);

  // The Sumário's row 10: the verdict, then the same line.
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await expect(sumario(page).locator('li[data-row="section_10"] .sum-status')).toHaveText(`${parecerVerdictLabel('nao_apto')} · ${replaced!}`);
  // The stored choice is untouched: still the one op with Apto.
  expect(await outboxValues(database, page, 'relatorio/setup/parecer')).toEqual([{ verdict: 'apto', text: null, text_status: null, text_basis: null }]);
});
