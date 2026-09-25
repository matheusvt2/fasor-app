import { type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, syncBadge, test, TEST_SEED } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { humanTap } from './support/taps.ts';

/*
 * Story 12.1: journeys J1 (SEC-ENEL, the plate typed) and J3 (SEC-ENEL-2, "Igual à" and
 * "Repetir") of `review-journey-2026-09-24.md` § 6, replayed at 768 x 1024 with instrument
 * MG-01 pushed by ops. Every tap goes through a counting `tap()` that asserts its effect on
 * the first try with a short timeout: a lost tap fails the test instead of costing a second
 * tap. The counts are recorded as annotations and printed, next to the review's baseline
 * (J1 24 taps + 1 lost; J3 9 taps + 2 lost). Navigation to the sheet is not counted, as in
 * the review.
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);
/** A tap that landed shows its effect well within this; a lost one never does. */
const EFFECT_MS = 3_000;
const READINGS = ['150', '160', '170', '180', '190', '200', '100', '110', '120'];

const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`[data-field-key="${key}"]`);

function instrumentDraft(): OpDraft {
  const id = newId();
  return {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/instrument/${id}`,
    value: {
      id,
      kind: 'instrument',
      code: 'MG-01',
      name: 'Megôhmetro',
      manufacturer: 'Instrum',
      model: 'DMG10Ki',
      serial: 'IN919021',
      cert_number: '37428/26',
      laboratory: null,
      calibrated_at: '2026-08-28',
      calibration_interval_months: 12,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  } as OpDraft;
}

/** Counts taps and keystrokes; each tap must show its effect on the first try. */
function counter(page: Page) {
  const info = test.info();
  let taps = 0;
  let keys = 0;
  return {
    async tap(what: string, target: Locator, effect: () => Promise<void>): Promise<void> {
      taps += 1;
      await humanTap(page, target, info);
      await test.step(`tap ${taps}: ${what}`, effect);
    },
    /** A native select's option: the second tap of a select (the popup is the browser's, out of the page). */
    async pick(what: string, select: Locator, option: string): Promise<void> {
      taps += 1;
      await select.selectOption(option);
      await test.step(`tap ${taps}: ${what}`, () => expect(select).toHaveValue(option, { timeout: EFFECT_MS }));
    },
    async type(text: string): Promise<void> {
      keys += text.length;
      await page.keyboard.type(text);
    },
    async press(key: string): Promise<void> {
      keys += 1;
      await page.keyboard.press(key);
    },
    get taps() {
      return taps;
    },
    get keys() {
      return keys;
    },
  };
}

type Counter = ReturnType<typeof counter>;

/** Both pickers of a seccionadora: open, pick MG-01 (two taps each). */
async function pickInstruments(page: Page, c: Counter): Promise<void> {
  for (const testKey of ['isolacao', 'resistencia_contato']) {
    const section = page.locator(`section[data-test-key="${testKey}"]`);
    const trigger = section.getByRole('button', { name: /^Instrumento/ });
    await c.tap(`${testKey} picker`, trigger, () => expect(section.getByRole('radiogroup', { name: 'Instrumentos cadastrados' })).toBeVisible({ timeout: EFFECT_MS }));
    await c.tap(`${testKey} MG-01`, section.getByRole('radio', { name: /^MG-01/ }), () =>
      expect(section.getByRole('button', { name: 'Instrumento MG-01 — Megôhmetro' })).toBeVisible({ timeout: EFFECT_MS }),
    );
  }
}

/** The first reading tapped, the nine typed with Enter (the run ends on the primary), the suggestion confirmed, the sheet concluded. */
async function readingsAndConclude(page: Page, c: Counter, nextBlockId: string): Promise<void> {
  const first = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await c.tap('first reading', first, () => expect(first).toBeFocused({ timeout: EFFECT_MS }));
  for (const value of READINGS) {
    await c.type(value);
    await c.press('Enter');
  }
  await expect(page.locator('#ficha-primary')).toBeFocused();
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible();
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await c.tap('Confirmar the suggestion', suggestion.getByRole('button', { name: 'Confirmar' }), () =>
    expect(page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Aprovado' })).toHaveAttribute('aria-checked', 'true', { timeout: EFFECT_MS }),
  );
  await expect(page.getByTestId('ficha-progress')).toHaveText('Completa');
  await c.tap('Concluir ficha', page.locator('#ficha-primary'), async () => {
    await expect(toast(page)).toContainText('Ficha concluída', { timeout: EFFECT_MS });
    await expect(page).toHaveURL(new RegExp(`/ficha/${nextBlockId}$`), { timeout: EFFECT_MS });
  });
}

function report(label: string, c: Counter, baseline: string): void {
  const text = `${c.taps} taps, ${c.keys} keystrokes, 0 lost (baseline ${baseline})`;
  test.info().annotations.push({ type: label, description: text });
  console.log(`${label}: ${text}`);
}

test('@p1 12.1-E2E-009 J1 and J3 at 768 px: every tap lands on the first try, counted against the review baseline', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB({ standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const enel = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');
  expect(enel).toHaveLength(2);
  const [secEnel, secEnel2] = enel as [(typeof enel)[number], (typeof enel)[number]];
  await pushDrafts(page, database, [...built.drafts, instrumentDraft()]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await syncBadge(page).click();
  const syncButton = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(syncButton).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await syncButton.click();
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 30_000 });

  // --- J1 SEC-ENEL: the plate typed field by field --------------------------------------
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${secEnel.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const j1 = counter(page);

  // Stories 12.3/12.4: the fields are visible from the start (no "Digitar"), "Outro…" lands
  // in its Combobox, and the TAG comes prefilled from the block.
  const identificacao = page.getByLabel('IDENTIFICAÇÃO', { exact: true });
  await j1.tap('IDENTIFICAÇÃO', identificacao, () => expect(identificacao).toBeFocused({ timeout: EFFECT_MS }));
  await j1.type('SC-01');

  const fabricacao = field(page, 'fabricacao').getByRole('combobox');
  await j1.tap('Fabricação Outro…', field(page, 'fabricacao').getByRole('button', { name: 'Outro…' }), () => expect(fabricacao).toBeFocused({ timeout: EFFECT_MS }));
  await j1.type('Fabricante J1');
  await j1.tap('Fabricação Criar', page.getByRole('option', { name: 'Criar “Fabricante J1”' }), () => expect(fabricacao).toHaveValue('Fabricante J1', { timeout: EFFECT_MS }));

  await expect(page.getByLabel('TAG', { exact: true })).toHaveValue(secEnel.tag);
  for (const [label, value] of [
    ['Nº SÉRIE', '123456'],
    ['TIPO', 'Rotativa'],
  ] as const) {
    const input = page.getByLabel(label, { exact: true });
    await j1.tap(label, input, () => expect(input).toBeFocused({ timeout: EFFECT_MS }));
    await j1.type(value);
  }

  // A native select: its tap, then the option (two taps, as on the tablet).
  const meio = page.getByLabel('MEIO DE EXTINÇÃO', { exact: true });
  await j1.tap('Meio de extinção', meio, () => expect(meio).toBeFocused({ timeout: EFFECT_MS }));
  await j1.pick('Meio de extinção AR', meio, 'AR');

  const tensao = field(page, 'tensao_de_placa').getByRole('combobox');
  await j1.tap('Tensão Outro…', field(page, 'tensao_de_placa').getByRole('button', { name: 'Outro…' }), () => expect(tensao).toBeFocused({ timeout: EFFECT_MS }));
  await j1.type('13,8');
  await j1.tap('Tensão Criar', page.getByRole('option', { name: 'Criar “13,8”' }), () => expect(tensao).toHaveValue(/13,8/, { timeout: EFFECT_MS }));

  const corrente = page.getByLabel('CORRENTE NOMINAL', { exact: true });
  await j1.tap('Corrente nominal', corrente, () => expect(corrente).toBeFocused({ timeout: EFFECT_MS }));
  await j1.type('630');

  const acionamento = page.getByLabel('ACIONAMENTO', { exact: true });
  await j1.tap('Acionamento', acionamento, () => expect(acionamento).toBeFocused({ timeout: EFFECT_MS }));
  await j1.pick('Acionamento MANUAL/PUNHO', acionamento, 'MANUAL/PUNHO');

  const day = field(page, 'data_de_fabricacao').getByRole('spinbutton').first();
  await j1.tap('Data de fabricação, dia', day, () => expect(day).toBeFocused({ timeout: EFFECT_MS }));
  await j1.type('01012020');

  // The review's first lost tap: the bulk action right after the date's last digit.
  await j1.tap('Marcar os restantes como Conforme', page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }), () =>
    expect(toast(page)).toContainText('marcados Conforme', { timeout: EFFECT_MS }),
  );
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible();

  await pickInstruments(page, j1);
  await readingsAndConclude(page, j1, secEnel2.blockId);
  report('J1 SEC-ENEL', j1, '24 taps + 1 lost');

  // --- J3 SEC-ENEL-2: "Igual à", its own unit, "Repetir" -----------------------------------
  // Story 12.3: IDENTIFICAÇÃO and Nº SÉRIE are never copied (typed here), the instruments
  // come suggested and "Concluir ficha" confirms them (no picker taps).
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  const j3 = counter(page);
  const chips = page.getByRole('group', { name: 'Copiar dados de placa' });
  await j3.tap(`Igual à ${secEnel.tag}?`, chips.getByRole('button', { name: `Igual à ${secEnel.tag}?` }), async () => {
    await expect(toast(page)).toContainText(`Copiado de ${secEnel.tag}`, { timeout: EFFECT_MS });
    // The chips go with the plate no longer empty: the fields below move up once.
    await expect(chips).toHaveCount(0, { timeout: EFFECT_MS });
  });
  for (const [label, value] of [
    ['IDENTIFICAÇÃO', 'SC-02'],
    ['Nº SÉRIE', '654321'],
  ] as const) {
    const input = page.getByLabel(label, { exact: true });
    await j3.tap(label, input, () => expect(input).toBeFocused({ timeout: EFFECT_MS }));
    await j3.type(value);
  }
  await j3.tap('Repetir da ficha anterior do mesmo tipo', page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Repetir da ficha anterior do mesmo tipo' }), async () => {
    await expect(toast(page)).toContainText(`Padrão de ${secEnel.tag} repetido`, { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible({ timeout: EFFECT_MS });
  });
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  const at = built.sheets.findIndex((sheet) => sheet.blockId === secEnel2.blockId);
  expect(at, 'SEC-ENEL-2 has a sheet after it').toBeGreaterThanOrEqual(0);
  expect(built.sheets.length).toBeGreaterThan(at + 1);
  const after = built.sheets[at + 1]!;
  await readingsAndConclude(page, j3, after.blockId);
  report('J3 SEC-ENEL-2', j3, '9 taps + 2 lost');

  // 24 and 9 at Story 12.1; Stories 12.3/12.4 took "Digitar", the two Combobox taps, the
  // TAG and J3's four picker taps out, and put J3's two per-unit fields in.
  expect(j1.taps).toBe(21);
  expect(j3.taps).toBe(7);
});
