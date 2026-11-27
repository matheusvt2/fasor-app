import type { Locator, Page } from '@playwright/test';
import { aiOps, ncObservation, outboxCount, REFUSED, refusalLine, REWRITTEN, ROUGH, storedBlock, useProposal } from './support/ai-write.ts';
import { installVoice } from './support/audio.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { openChaveSheet } from './support/photos.ts';
import { clearDailyUsage, setDailyUsage } from './support/quota.ts';

/*
 * Story 31.10 (Matheus, 2026-11-27, "Opcao A"; `62-audio-estados.html` (h)): the audio and AI
 * controls sit in the field's own bar, the AI proposes before it writes, and a refusal says why.
 * Driven as a person would, against the real route and the `fake` writing provider
 * (`apps/api/src/jobs/transcription/fixtures/writing.json`): the bar on an NC observation, a
 * proposal compared, used and undone; "Manter o meu texto" writes nothing and reports the outcome
 * (Epic 32's route answers 404 until it is built: the call is made and its refusal ignored); a
 * guard refusal on "Texto da conclusão" names the reason and the control stays; the company's daily
 * limit disables the control with its reason; the bar at 390, 768 and 1280 px, recording included.
 * Waits poll; no fixed sleep.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const AI = /^Melhorar o texto com IA: observação do item \d+$/;
const RECORD = /^Gravar áudio: observação do item \d+$/;
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });

/** The bar's two controls of the "contatos" observation, and the tray and bar around them. */
function bar(contatos: Locator) {
  const tray = contatos.locator('textarea.observation-field + .field-tray');
  const fieldBar = tray.locator(':scope > .field-bar');
  return { tray, fieldBar, audio: fieldBar.locator(':scope > .audio-rec'), ai: fieldBar.locator(':scope > .ai-write') };
}

test('@p0 31.10-E2E-001 the bar on an NC observation: propose, compare, use, undo', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const contatos = await ncObservation(page, ROUGH);
  const field = contatos.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect.poll(async () => (await storedBlock(page, database, blockId)).sheet.checklist.contatos?.observation?.value).toBe(ROUGH);

  // The box holds the text and, under a hairline, one bar: "Gravar áudio" at its start, the AI control at its end.
  const { tray, fieldBar, audio, ai } = bar(contatos);
  await expect(tray).toBeVisible();
  await expect(fieldBar.locator(':scope > *').first()).toHaveClass(/audio-rec/);
  await expect(fieldBar.locator(':scope > *').last()).toHaveClass(/ai-write/);
  await expect(audio.getByRole('button', { name: RECORD })).toContainText('Gravar áudio');
  await expect(ai.getByRole('button', { name: AI })).toContainText('Melhorar o texto com IA');
  for (const control of [audio.getByRole('button', { name: RECORD }), ai.getByRole('button', { name: AI })]) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // No control stays elsewhere on the row: one audio control and one AI control, both in the bar.
  await expect(contatos.getByRole('button', { name: RECORD })).toHaveCount(1);
  await expect(contatos.getByRole('button', { name: AI })).toHaveCount(1);
  await expect(contatos.locator('.audio-tools')).toHaveCount(0);

  const before = await outboxCount(page, database);
  await ai.getByRole('button', { name: AI }).click();
  // Nothing is written: both texts side by side, the changed words marked by weight and an underline.
  const mine = contatos.getByRole('region', { name: 'Seu texto' });
  const proposal = contatos.getByRole('region', { name: 'Texto proposto pela IA' });
  await expect(proposal).toBeVisible({ timeout: 30_000 });
  await expect(mine).toHaveText(`Seu texto${ROUGH}`);
  await expect(proposal).toHaveText(`Texto proposto pela IA${REWRITTEN}`);
  const marked = proposal.locator('mark.ai-changed');
  await expect(marked).not.toHaveCount(0);
  const look = await marked.first().evaluate((mark) => {
    const style = getComputedStyle(mark);
    return { weight: Number(style.fontWeight), line: style.textDecorationLine };
  });
  expect(look.weight).toBeGreaterThanOrEqual(700);
  expect(look.line).toContain('underline');
  await expect(field).toHaveValue(ROUGH);
  expect(await aiOps(page, database)).toEqual([]);
  expect(await outboxCount(page, database)).toBeLessThanOrEqual(before);
  await expect(contatos.getByRole('button', { name: /^Manter o meu texto: / })).toBeVisible();

  await useProposal(contatos);
  await expect(field).toHaveValue(REWRITTEN, { timeout: 30_000 });
  await expect.poll(async () => (await storedBlock(page, database, blockId)).sheet.checklist.contatos?.observation?.value).toBe(REWRITTEN);
  // The ordinary op of Story 31.9, naming the call's run row.
  const written = await aiOps(page, database);
  expect(written.map((op) => [op.kind, op.path, op.value])).toEqual([['put', `sheet/${blockId}/checklist/contatos/observation`, REWRITTEN]]);
  expect(written[0]!.meta?.ai_run_id).toMatch(/^[0-9a-f-]{36}$/);
  const done = contatos.locator('.ai-done');
  await expect(done).toContainText('Texto melhorado por IA');

  await done.getByRole('button', { name: /^Desfazer o texto melhorado por IA: / }).click();
  await expect(field).toHaveValue(ROUGH, { timeout: 30_000 });
  await expect.poll(async () => (await storedBlock(page, database, blockId)).sheet.checklist.contatos?.observation?.value).toBe(ROUGH);
});

test('@p1 31.10-E2E-002 "Manter o meu texto" writes no op and reports what the user did', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const contatos = await ncObservation(page, ROUGH);
  const field = contatos.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect.poll(async () => (await storedBlock(page, database, blockId)).sheet.checklist.contatos?.observation?.value).toBe(ROUGH);
  const before = await outboxCount(page, database);
  await contatos.getByRole('button', { name: AI }).click();
  await expect(contatos.getByRole('region', { name: 'Texto proposto pela IA' })).toBeVisible({ timeout: 30_000 });

  const reported = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/write-outcome'));
  await contatos.getByRole('button', { name: /^Manter o meu texto: / }).click();
  const request = await reported;
  expect(request.postDataJSON()).toMatchObject({ outcome: 'refused', action: 'keep_mine', run_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });

  await expect(contatos.getByRole('region', { name: 'Texto proposto pela IA' })).toHaveCount(0);
  await expect(contatos.locator('.ai-reason')).toHaveCount(0);
  await expect(field).toHaveValue(ROUGH);
  expect(await aiOps(page, database)).toEqual([]);
  expect(await outboxCount(page, database)).toBeLessThanOrEqual(before);
  expect((await storedBlock(page, database, blockId)).sheet.checklist.contatos?.observation?.value).toBe(ROUGH);
  // The bar is back, the field as it was.
  await expect(contatos.getByRole('button', { name: AI })).toBeVisible();
  await expect(contatos.getByRole('button', { name: RECORD })).toBeVisible();
});

test('@p1 31.10-E2E-003 a guard refusal on "Texto da conclusão" names the reason; the control stays', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const result = page.getByRole('radiogroup', { name: 'Resultado' });
  await result.getByRole('radio', { name: 'Reprovado', exact: true }).click();
  await expect(result.getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  const conclusion = page.locator('.ficha-conc-text');
  await conclusion.getByRole('button', { name: 'Editar', exact: true }).click();
  const text = conclusion.getByRole('textbox', { name: 'Texto da conclusão' });
  // The fixture's answer to this text adds a number no context holds: the guard refuses it.
  const typed = 'conclusao revisada no local';
  await text.fill(typed);
  await text.blur();
  await expect.poll(async () => (await storedBlock(page, database, blockId)).sheet.conclusion.text?.value ?? null).toBe(typed);

  // The bar sits under the text, before the field's own lines.
  await expect(conclusion.locator('textarea + .field-tray .field-bar')).toBeVisible();
  await conclusion.getByRole('button', { name: 'Melhorar o texto com IA: texto da conclusão' }).click();
  const line = conclusion.locator('.field-tray .ai-reason');
  await expect(line).toHaveText(refusalLine({ kind: 'guard', guard_kinds: ['number'] }), { timeout: 30_000 });
  await expect(line).toHaveAttribute('role', 'status');
  // The control stays on the field (Matheus, 2026-11-27) and reads "Tentar de novo".
  const retry = conclusion.getByRole('button', { name: 'Tentar de novo com IA: texto da conclusão' });
  await expect(retry).toContainText('Tentar de novo');
  await expect(retry).not.toHaveAttribute('aria-disabled', 'true');
  await expect(text).toHaveValue(typed);
  expect((await storedBlock(page, database, blockId)).sheet.conclusion.text?.value).toBe(typed);
  expect(await aiOps(page, database)).toEqual([]);
  expect((await storedBlock(page, database, blockId)).sheet.conclusion.result?.value).toBe('reprovado');
});

test.describe('31.10-E2E-004 the daily limit', () => {
  test.afterEach(async () => {
    await clearDailyUsage(account.companyId);
  });

  test('@p1 31.10-E2E-004 the company at its daily limit: the line says why and the control is disabled with that reason', async ({ page }) => {
    test.setTimeout(150_000);
    const { blockId } = await openChaveSheet(page, account, database);
    const contatos = await ncObservation(page, REFUSED);
    await expect.poll(async () => (await storedBlock(page, database, blockId)).sheet.checklist.contatos?.observation?.value).toBe(REFUSED);
    await setDailyUsage(account.companyId, 'ai_write', 1_000_000);
    await contatos.getByRole('button', { name: AI }).click();
    const why = 'O limite diário de IA da empresa foi atingido. Volta amanhã.';
    await expect(contatos.locator('.ai-reason')).toHaveText(refusalLine({ kind: 'daily_limit' }), { timeout: 30_000 });
    const control = contatos.getByRole('button', { name: AI });
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    await expect(control).toHaveAccessibleDescription(why);
    // A tap where it cannot help sends nothing.
    let asked = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/relatorios\/[^/]+\/write$/.test(request.url())) asked += 1;
    });
    await control.click({ force: true });
    await expect(control).not.toHaveAttribute('aria-busy', 'true');
    expect(asked).toBe(0);
    await expect(contatos.getByRole('textbox', { name: /^Observação do item \d+$/ })).toHaveValue(REFUSED);
  });
});

test('@p1 31.10-E2E-005 the bar at 390, 768 and 1280 px, recording included: nothing clipped, two lines on the phone', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { blockId } = await openChaveSheet(page, account, database);
  const contatos = await ncObservation(page, ROUGH);
  await expect.poll(async () => (await storedBlock(page, database, blockId)).sheet.checklist.contatos?.observation?.value).toBe(ROUGH);
  const { tray, fieldBar, audio, ai } = bar(contatos);

  // On the phone the comparison stacks, the user's text first, inside the box; the two choices are each 48 px.
  await page.setViewportSize({ width: 390, height: 900 });
  await tray.scrollIntoViewIfNeeded();
  await ai.getByRole('button', { name: AI }).click();
  const mine = contatos.getByRole('region', { name: 'Seu texto' });
  const proposal = contatos.getByRole('region', { name: 'Texto proposto pela IA' });
  await expect(proposal).toBeVisible({ timeout: 30_000 });
  const mineBox = (await mine.boundingBox())!;
  const proposalBox = (await proposal.boundingBox())!;
  expect(proposalBox.y).toBeGreaterThanOrEqual(mineBox.y + mineBox.height - 1);
  expect(Math.abs(proposalBox.x - mineBox.x)).toBeLessThanOrEqual(1);
  const stacked = (await tray.boundingBox())!;
  expect(proposalBox.x + proposalBox.width).toBeLessThanOrEqual(stacked.x + stacked.width + 1);
  for (const choice of [/^Manter o meu texto: /, /^Usar o texto da IA: /]) expect((await contatos.getByRole('button', { name: choice }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await fieldBar.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  // From the tablet up the two sides sit side by side.
  await page.setViewportSize({ width: 1280, height: 900 });
  const wideMine = (await mine.boundingBox())!;
  const wideProposal = (await proposal.boundingBox())!;
  expect(Math.abs(wideProposal.y - wideMine.y)).toBeLessThanOrEqual(1);
  expect(wideProposal.x).toBeGreaterThan(wideMine.x + wideMine.width - 1);
  await contatos.getByRole('button', { name: /^Manter o meu texto: / }).click();
  await expect(proposal).toHaveCount(0);

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await tray.scrollIntoViewIfNeeded();
    for (const recording of [false, true]) {
      if (recording) {
        await audio.getByRole('button', { name: RECORD }).click();
        const stop = audio.getByRole('button', { name: /^Parar a gravação: observação do item \d+$/ });
        await expect(stop).toHaveAttribute('aria-pressed', 'true');
        // "Parar" with the stop glyph on a primary round, then "Gravando", the time and the meter.
        await expect(stop.locator('.audio-stop-word')).toBeVisible();
        await expect(stop.locator('.audio-word')).toBeHidden();
        await expect(audio.locator('.audio-live')).toBeVisible();
        await expect(ai.getByRole('button', { name: AI })).toHaveAttribute('aria-disabled', 'true');
      }
      const label = `${width} px${recording ? ', recording' : ''}`;
      const trayBox = (await tray.boundingBox())!;
      const audioBox = (await audio.boundingBox())!;
      const aiBox = (await ai.locator('.ai-btn').boundingBox())!;
      // Nothing clipped: the bar does not scroll sideways and both controls sit inside the box.
      expect(await fieldBar.evaluate((element) => element.scrollWidth - element.clientWidth), label).toBeLessThanOrEqual(1);
      for (const box of [audioBox, aiBox]) {
        expect(box.x, label).toBeGreaterThanOrEqual(trayBox.x - 1);
        expect(box.x + box.width, label).toBeLessThanOrEqual(trayBox.x + trayBox.width + 1);
        expect(box.height, label).toBeGreaterThanOrEqual(48);
      }
      expect((await audio.getByRole('button', { name: /observação do item \d+$/ }).boundingBox())!.height, label).toBeGreaterThanOrEqual(48);
      if (width === 390) {
        // Two lines on the phone: the AI control under the audio control.
        expect(aiBox.y, label).toBeGreaterThanOrEqual(audioBox.y + audioBox.height - 1);
      } else {
        // One line: the audio control at the start, the AI control at the end.
        expect(Math.abs(aiBox.y + aiBox.height / 2 - (audioBox.y + audioBox.height / 2)), label).toBeLessThanOrEqual(12);
        expect(aiBox.x, label).toBeGreaterThan(audioBox.x + audioBox.width);
      }
      if (recording) {
        // The recording runs at least a second, so the stop keeps it, as a person's would.
        await expect.poll(async () => Number(((await audio.locator('.audio-time').textContent()) ?? '0:00').split(':')[1]), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
        await audio.getByRole('button', { name: /^Parar a gravação: / }).click();
        await expect(audio.getByRole('button', { name: RECORD })).toHaveAttribute('aria-pressed', 'false');
      }
    }
  }
});
