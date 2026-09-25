import { getDefinition } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, TEST_SEED } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { instrumentDraft, newRelatorioDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { tapCounter, type TapCounter } from './support/taps.ts';

/*
 * Stories 12.3 and 12.4: journeys J1 (SEC-ENEL, a new plate), J3 (SEC-ENEL-2, the second
 * seccionadora) and J2 (one NC, on the next seccionadora) of `review-journey-2026-09-24.md`
 * § 6, replayed at 768 x 1024 with instrument MG-01 pushed by ops. Every tap is a
 * `humanTap` that must show its effect on the first try; taps and keystrokes are counted
 * and recorded as annotations (and printed). Navigation to a sheet is not counted, as in
 * the review.
 *
 * J3's review target (5 taps, about 36 keystrokes) predates D-3: IDENTIFICAÇÃO and Nº SÉRIE
 * are never copied now, so the second seccionadora types its own two per-unit fields (two
 * taps). The target is asserted on the rest of the journey, which is what 12.3 cut (no
 * instrument picker, no plate typed but its own unit); the per-unit taps are reported apart.
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);
const EFFECT_MS = 3_000;
const READINGS = ['150', '160', '170', '180', '190', '200', '100', '110', '120'];
/** The seccionadora's checklist row whose NC chips offer "conexão frouxa" (1-based). */
const CONEXOES = getDefinition('v2', 'cabine_primaria', 'chave_seccionadora').checklist!.findIndex((item) => item.nc_phrases.includes('conexão frouxa')) + 1;

const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`[data-field-key="${key}"]`);
const bulk = (page: Page, name: string) => page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name });

/** A text field tapped and typed. */
async function typeField(page: Page, c: TapCounter, label: string, value: string, tag?: string): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  await c.tap(label, input, () => expect(input).toBeFocused({ timeout: EFFECT_MS }), tag);
  await c.type(value, tag);
}

/** "Outro…" on a registry field: the focus lands in its Combobox, the name is typed, "Criar". */
async function createWord(page: Page, c: TapCounter, key: string, name: string): Promise<void> {
  const combobox = field(page, key).getByRole('combobox');
  await c.tap(`${key} Outro…`, field(page, key).getByRole('button', { name: 'Outro…' }), () => expect(combobox).toBeFocused({ timeout: EFFECT_MS }));
  await c.type(name);
  await c.tap(`${key} Criar`, page.getByRole('option', { name: `Criar “${name}”` }), () => expect(combobox).toHaveValue(new RegExp(name), { timeout: EFFECT_MS }));
}

/** Both pickers of a seccionadora with no suggestion yet: open, pick MG-01 (two taps each). */
async function pickInstruments(page: Page, c: TapCounter): Promise<void> {
  for (const testKey of ['isolacao', 'resistencia_contato']) {
    const section = page.locator(`section[data-test-key="${testKey}"]`);
    await c.tap(`${testKey} picker`, section.getByRole('button', { name: /^Instrumento/ }), () =>
      expect(section.getByRole('radiogroup', { name: 'Instrumentos cadastrados' })).toBeVisible({ timeout: EFFECT_MS }),
    );
    await c.tap(`${testKey} MG-01`, section.getByRole('radio', { name: /^MG-01/ }), () =>
      expect(section.getByRole('button', { name: 'Instrumento MG-01 — Megôhmetro' })).toBeVisible({ timeout: EFFECT_MS }),
    );
  }
}

/** Both tests already suggest MG-01: nothing to tap. */
async function expectSuggestedInstruments(page: Page): Promise<void> {
  for (const testKey of ['isolacao', 'resistencia_contato']) {
    await expect(page.locator(`section[data-test-key="${testKey}"] .instrument-picker`)).toHaveAttribute('data-state', 'suggested');
  }
}

/** The first reading tapped, the nine typed with Enter (the run ends on the primary). */
async function readings(page: Page, c: TapCounter): Promise<void> {
  const first = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await c.tap('first reading', first, () => expect(first).toBeFocused({ timeout: EFFECT_MS }));
  for (const value of READINGS) {
    await c.type(value);
    await c.press('Enter');
  }
  await expect(page.locator('#ficha-primary')).toBeFocused();
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible();
}

/** The suggested pair confirmed with one tap. */
async function confirmPair(page: Page, c: TapCounter, restriction: 'Sem restrições' | 'Com restrições'): Promise<void> {
  await c.tap('Confirmar the suggestion', page.getByRole('group', { name: 'Sugestão' }).getByRole('button', { name: 'Confirmar' }), () =>
    expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: restriction })).toHaveAttribute('aria-checked', 'true', { timeout: EFFECT_MS }),
  );
}

async function conclude(page: Page, c: TapCounter, nextBlockId: string): Promise<void> {
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');
  await c.tap('Concluir ficha', page.locator('#ficha-primary'), async () => {
    await expect(toast(page)).toContainText('Ficha concluída', { timeout: EFFECT_MS });
    await expect(page).toHaveURL(new RegExp(`/ficha/${nextBlockId}$`), { timeout: EFFECT_MS });
  });
}

function report(label: string, c: TapCounter, extra = ''): void {
  const text = `${c.taps} taps, ${c.keys} keystrokes, 0 lost${extra}`;
  test.info().annotations.push({ type: label, description: text });
  console.log(`${label}: ${text}`);
}

/** The sheet right after `sheet` in tree (template) order. */
function after(sheets: readonly SeededSheet[], sheet: SeededSheet): SeededSheet {
  const at = sheets.findIndex((s) => s.blockId === sheet.blockId);
  expect(sheets.length, `a sheet after ${sheet.tag}`).toBeGreaterThan(at + 1);
  return sheets[at + 1]!;
}

test('@p1 12.3-E2E-004 J1, J3 and J2 at 768 px: a new plate, the second seccionadora and one NC, every tap on the first try, taps and keystrokes counted', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB({ standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const secc = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora');
  const enel = secc.filter((sheet) => sheet.locationName === 'Cubículo Enel');
  expect(enel).toHaveLength(2);
  const [secEnel, secEnel2] = enel as [SeededSheet, SeededSheet];
  const ncSheet = secc.find((sheet) => sheet.locationName !== 'Cubículo Enel')!;
  expect(CONEXOES).toBeGreaterThan(0);
  await pushDrafts(page, database, [...built.drafts, instrumentDraft(account)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await syncNowAndReturn(page);

  // --- J1 SEC-ENEL: a new plate, typed -----------------------------------------------------
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${secEnel.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  // No "Digitar": the fields are there; the TAG comes from the block.
  await expect(page.getByLabel('TAG', { exact: true })).toHaveValue(secEnel.tag);
  const j1 = tapCounter(page, EFFECT_MS);
  await typeField(page, j1, 'Identificação', 'SC-01');
  await createWord(page, j1, 'fabricacao', 'Fabricante J1');
  await typeField(page, j1, 'Nº série', '123456');
  await typeField(page, j1, 'Tipo', 'Rotativa');
  const meio = page.getByLabel('Meio de extinção', { exact: true });
  await j1.tap('Meio de extinção', meio, () => expect(meio).toBeFocused({ timeout: EFFECT_MS }));
  await j1.pick('Meio de extinção AR', meio, 'AR');
  await createWord(page, j1, 'tensao_de_placa', '13,8');
  await typeField(page, j1, 'Corrente nominal', '630');
  const acionamento = page.getByLabel('Acionamento', { exact: true });
  await j1.tap('Acionamento', acionamento, () => expect(acionamento).toBeFocused({ timeout: EFFECT_MS }));
  await j1.pick('Acionamento MANUAL/PUNHO', acionamento, 'MANUAL/PUNHO');
  const day = field(page, 'data_de_fabricacao').getByRole('spinbutton').first();
  await j1.tap('Data de fabricação, dia', day, () => expect(day).toBeFocused({ timeout: EFFECT_MS }));
  await j1.type('01012020');
  await j1.tap('Marcar os restantes como Conforme', bulk(page, 'Marcar os restantes como Conforme'), () => expect(toast(page)).toContainText('marcados Conforme', { timeout: EFFECT_MS }));
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await pickInstruments(page, j1);
  await readings(page, j1);
  await confirmPair(page, j1, 'Sem restrições');
  await conclude(page, j1, secEnel2.blockId);
  report('J1 SEC-ENEL', j1, ' (baseline 24 taps + 1 lost, 87 keystrokes)');

  // --- J3 SEC-ENEL-2: "Igual à", its own unit, "Repetir", the suggested instruments --------
  const j3 = tapCounter(page, EFFECT_MS);
  // The copy's effect: its toast, and the chips gone with the plate no longer empty.
  const chips = page.getByRole('group', { name: 'Copiar dados de placa' });
  await j3.tap(`Igual à ${secEnel.tag}?`, chips.getByRole('button', { name: `Igual à ${secEnel.tag}?` }), async () => {
    await expect(toast(page)).toContainText(`Copiado de ${secEnel.tag}`, { timeout: EFFECT_MS });
    await expect(chips).toHaveCount(0, { timeout: EFFECT_MS });
  });
  await expect(page.getByLabel('TAG', { exact: true })).toHaveValue(secEnel2.tag);
  await typeField(page, j3, 'Identificação', 'SC-02', 'perUnit');
  await typeField(page, j3, 'Nº série', '654321', 'perUnit');
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await j3.tap('Repetir da ficha anterior do mesmo tipo', bulk(page, 'Repetir da ficha anterior do mesmo tipo'), async () => {
    await expect(toast(page)).toContainText(`Padrão de ${secEnel.tag} repetido`, { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible({ timeout: EFFECT_MS });
  });
  await expectSuggestedInstruments(page);
  await readings(page, j3);
  await confirmPair(page, j3, 'Sem restrições');
  await conclude(page, j3, after(built.sheets, secEnel2).blockId);
  const perUnit = j3.of('perUnit');
  report('J3 SEC-ENEL-2', j3, ` (${perUnit.taps} taps and ${perUnit.keys} keystrokes for the per-unit fields; baseline 9 taps + 2 lost, 36 keystrokes)`);

  // --- J2: one NC on the next seccionadora, the sheet observation never typed ---------------
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${ncSheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  // Every key or input the sheet observation itself receives, whatever sent it.
  const observation = page.getByLabel('Observações da ficha', { exact: true });
  await observation.evaluate((element) => {
    const w = window as unknown as { observationInputs: number };
    w.observationInputs = 0;
    for (const type of ['keydown', 'beforeinput', 'paste']) element.addEventListener(type, () => (w.observationInputs += 1));
  });
  const observationInputs = () => page.evaluate(() => (window as unknown as { observationInputs: number }).observationInputs);
  const j2 = tapCounter(page, EFFECT_MS);
  const copyChip = chips.getByRole('button', { name: /^Igual à / });
  await j2.tap('Igual à', copyChip, async () => {
    await expect(toast(page)).toContainText('Copiado de', { timeout: EFFECT_MS });
    await expect(chips).toHaveCount(0, { timeout: EFFECT_MS });
  });
  await typeField(page, j2, 'Identificação', 'SC-03', 'perUnit');
  await typeField(page, j2, 'Nº série', '777777', 'perUnit');
  const conexoes = page.locator('#ficha-step-verificacoes li.checklist-row').nth(CONEXOES - 1);
  await j2.tap('NC', conexoes.getByRole('radio', { name: 'Não conforme' }), () => expect(conexoes.getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true', { timeout: EFFECT_MS }));
  const chip = conexoes.getByRole('button', { name: 'conexão frouxa', exact: true });
  await j2.tap('NC chip "conexão frouxa"', chip, () => expect(page.getByLabel(`Observação do item ${CONEXOES}`, { exact: true })).toHaveValue('conexão frouxa', { timeout: EFFECT_MS }), 'ncChip');
  await j2.tap('Marcar os restantes como Conforme', bulk(page, 'Marcar os restantes como Conforme'), () => expect(toast(page)).toContainText('marcados Conforme', { timeout: EFFECT_MS }));
  await expectSuggestedInstruments(page);
  await readings(page, j2);
  await expect(observation).toHaveValue(/^Item \d+: conexão frouxa$/);
  await confirmPair(page, j2, 'Com restrições');
  await j2.tap('Confirmar the conclusion text (and the observation)', page.locator('.ficha-conc-text').getByRole('button', { name: 'Confirmar' }), async () => {
    await expect(page.locator('.field.suggestion-field').filter({ has: observation })).toHaveCount(0, { timeout: EFFECT_MS });
    await expect(observation).toHaveValue(/^Item \d+: conexão frouxa$/);
  });
  const typedInObservation = await observationInputs();
  await conclude(page, j2, after(built.sheets, ncSheet).blockId);
  report('J2 NC', j2, ` (${j2.of('ncChip').taps} chip, ${typedInObservation} keys or inputs received by the sheet observation)`);

  // Targets: J3 without its per-unit fields at most 5 taps, no instrument picker; J2 one chip, nothing typed in the observation.
  expect(j3.taps - perUnit.taps).toBeLessThanOrEqual(5);
  expect(j2.of('ncChip').taps).toBe(1);
  expect(typedInObservation).toBe(0);
});
