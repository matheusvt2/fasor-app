import { cellAddressesOf, getDefinition, SEED_VERSION, type BlockRow, type OpDraft } from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { pushAudioStatus, pushHeldAudio, pushSpokenReadings } from './support/audio-ops.ts';
import { deviceAudios, installVoice } from './support/audio.ts';
import { deviceDatabaseName, expect, signIn, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openChaveSheet } from './support/photos.ts';
import { serverRow } from './support/reading-ops.ts';
import { newRelatorioDrafts, officeDraft, performedDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * Stories 31.5 and 31.6 (AD-30), driven as a person would. 31.5: the measurement table's Audio button records
 * (offline, kept with the table as its target); a spoken reading waits on its cell as a Suggestion field with
 * play in place of the crop, "Confirmar" and "Descartar", a filled cell reads "Sugerido: … Substituir", and
 * "Confirmar todos" takes a spoken reading as a display one; speech that is no reading, transcribed by the real
 * job, says "Não reconheci uma leitura. O texto foi para Observações." and the text is in OBSERVAÇÕES marked
 * "Áudio". 31.6: an audio on its way holds the ficha (its line, a refused conclude) and is counted by Sync
 * status, then the real job's text frees it; a pending and a failed audio block the issue in the Export dialog,
 * each with its place; the failed state's "Tentar de novo" needs signal and is sent; "Dispensar" frees the ficha
 * and keeps the audio. A spoken reading and a failed transcription are the job's outcomes written as the job
 * writes them (`support/audio-ops.ts`): the fake providers hear one default text, which is no reading, and never
 * fail on their own. Waits poll; no fixed sleep.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const SECC = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
const ISOLACAO = SECC.tests.find((one) => one.key === 'isolacao')!;
const REPORT = 'O equipamento foi verificado e não apresentou anomalias aparentes.';
const MOVED = 'Não reconheci uma leitura. O texto foi para Observações.';

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const firstTable = (page: Page) => page.locator('#ficha-step-ensaios section[data-test-key="isolacao"] .ficha-mt').first();
const cell = (page: Page, row: number, col: number) => page.locator(`#ficha-step-ensaios [data-cell="isolacao:${row}:${col}"]`).first();
const observacoes = (page: Page) => page.locator('#ficha-step-conclusao section').filter({ has: page.getByRole('heading', { level: 2, name: 'Observações' }) });
const holdLine = (page: Page) => page.getByTestId('ficha-audio-hold');
const toast = (page: Page) => page.getByTestId('toast');

async function storedBlock(page: Page, blockId: string): Promise<BlockRow> {
  const records = await readStore<{ entity: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.row.id === blockId)!.row;
}

async function storedSuggestion(page: Page, id: string): Promise<{ status: string } | undefined> {
  const records = await readStore<{ entity: string; row: { id: string; status: string } }>(page, database, 'entities');
  return records.find((record) => record.entity === 'suggestion' && record.row.id === id)?.row;
}

async function offline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

/** One tap, a recording of at least `seconds`, the second tap; then waits for the device's new audio row. */
async function record(scope: Locator, name: string, seconds = 3): Promise<void> {
  const before = (await deviceAudios(scope.page(), database)).length;
  await scope.getByRole('button', { name: `Gravar áudio: ${name}` }).click();
  const pressed = scope.getByRole('button', { name: `Parar a gravação: ${name}` });
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Number(((await scope.locator('.audio-rec .audio-time').first().textContent()) ?? '0:00').split(':')[1]), { timeout: 15_000 }).toBeGreaterThanOrEqual(seconds);
  await pressed.click();
  await expect.poll(async () => (await deviceAudios(scope.page(), database)).length).toBe(before + 1);
}

/** "Sincronizar agora" until `done` holds (the job runs on its own between the cycles); stays on Sync status. */
async function syncUntil(page: Page, done: () => Promise<boolean>): Promise<void> {
  await expect(async () => {
    await syncNow(page);
    expect(await done()).toBe(true);
  }).toPass({ timeout: 120_000, intervals: [1_000, 2_000, 3_000] });
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** The plate, every checklist item C, every reading inside its criterion and the thermography answered; no conclusion, no OBSERVAÇÕES. */
function filledSheet(relatorioId: string, blockId: string): OpDraft[] {
  const scope = { relatorioId };
  const plate = (kind: string, unit: string | undefined, options: readonly string[] | undefined, key: string): unknown =>
    kind === 'number' ? { raw: '630', unit: unit ?? null, state: 'measured' } : kind === 'date' ? '2020-01-01' : kind === 'select' ? options![0] : kind === 'voltage_class' ? '15' : `P-${key}`;
  return [
    ...SECC.nameplate.filter((f) => f.key !== 'tag').map((f) => officeDraft(account, scope, `sheet/${blockId}/nameplate/${f.key}`, plate(f.kind, f.unit, f.options, f.key))),
    ...(SECC.checklist ?? []).map((item) => officeDraft(account, scope, `sheet/${blockId}/checklist/${item.key}/result`, 'C')),
    ...SECC.tests
      .flatMap((t) => cellAddressesOf(SECC, t.key))
      .map((c) => officeDraft(account, scope, `sheet/${blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, c.testKey === 'isolacao' ? { raw: '150', unit: 'GΩ', state: 'measured' } : { raw: '100', unit: 'µΩ', state: 'measured' })),
    ...performedDrafts(account, scope, blockId, SECC),
  ];
}

/** Resets Empresa B, signs in and pushes a standard relatório with one filled seccionadora (all but the conclusion). */
async function filledSetUp(page: Page): Promise<{ relatorioId: string; sheet: SeededSheet }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const sheet = built.sheets.filter((s) => s.blockType === 'chave_seccionadora')[2]!;
  await pushDrafts(page, database, [...built.drafts, ...filledSheet(built.relatorioId, sheet.blockId)]);
  return { relatorioId: built.relatorioId, sheet };
}

/** The suggested pair confirmed on the Conclusão step: the ficha is complete but for what an audio holds. */
async function confirmPair(page: Page): Promise<void> {
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const suggestion = page.getByRole('group', { name: 'Prévia da conclusão' });
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');
}

test('@p0 31.5-E2E-001 a spoken reading waits on its cell: play, "Confirmar" writes it, "Descartar" drops it, a filled cell reads "Sugerido: … Substituir", "Confirmar todos" takes the rest', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  await stepper(page).getByRole('button', { name: /^Ensaios/ }).click();
  const table = firstTable(page);
  // The table's Audio button sits between "Ler visor" and "Confirmar todos", 48 px, named for its readings.
  const mic = table.locator('.mt-actions').getByRole('button', { name: /^Gravar áudio: leituras de / });
  await expect(mic).toBeVisible();
  const box = (await mic.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([48, 48]);
  const label = ((await mic.getAttribute('aria-label')) ?? '').replace(/^Gravar áudio: /, '');

  // Offline, a recording is kept with the table as its target and the table says so.
  await offline(context, page);
  await record(table, label);
  await expect(table.locator('.audio-status[data-step="saved"]')).toHaveText('Áudio guardado, aguardando sinal');
  const [recorded] = await deviceAudios(page, database);
  expect(recorded!.audio_target).toEqual({ type: 'table', block_id: blockId, test_key: 'isolacao', table_key: ISOLACAO.tables[0]!.key });
  await context.setOffline(false);

  // Four cells of the first table: two empty, one typed differently, one typed the same.
  const cells = cellAddressesOf(SECC, 'isolacao').slice(0, 4);
  const path = (c: { row: number; col: number }) => `sheet/${blockId}/test/isolacao/cell/${c.row}/${c.col}`;
  for (const [c, typed] of [
    [cells[2]!, '14,7'],
    [cells[3]!, '168'],
  ] as const) {
    const input = cell(page, c.row, c.col).locator('input.mf-value');
    await input.fill(typed);
    await input.press('Tab');
  }
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.test.isolacao?.cells[String(cells[3]!.row)]?.[String(cells[3]!.col)]?.value).toMatchObject({ raw: '168' });

  const target = { type: 'table' as const, block_id: blockId, test_key: 'isolacao', table_key: ISOLACAO.tables[0]!.key };
  const { suggestionIds } = await pushSpokenReadings(account.companyId, relatorioId, target, [
    { cellPath: path(cells[0]!), raw: '147', unit: 'GΩ' },
    { cellPath: path(cells[1]!), raw: '152', unit: 'GΩ' },
    { cellPath: path(cells[2]!), raw: '147', unit: 'GΩ' },
    { cellPath: path(cells[3]!), raw: '168', unit: 'GΩ' },
  ]);
  await syncNowAndReturn(page);
  await stepper(page).getByRole('button', { name: /^Ensaios/ }).click();

  // An empty cell: the Suggestion field, play in place of the crop, "Confirmar" and "Descartar"; nothing written yet.
  const first = cell(page, cells[0]!.row, cells[0]!.col);
  const suggested = first.locator('.suggestion-field[data-state="suggested"]');
  await expect(suggested.locator('input.mf-value')).toHaveValue('147', { timeout: 30_000 });
  await expect(suggested.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(suggested.getByRole('button', { name: /^Ouvir o áudio da leitura, \d:\d\d$/ })).toHaveClass(/audio-src/);
  await expect(suggested.locator('.crop-thumb')).toHaveCount(0);
  await expect(first.locator('.audio-sug-actions').getByRole('button', { name: 'Descartar' })).toBeVisible();
  expect((await storedBlock(page, blockId)).sheet.test.isolacao?.cells[String(cells[0]!.row)]?.[String(cells[0]!.col)]).toBeUndefined();

  // The same value typed beforehand confirmed itself, as for "Ler visor".
  await expect.poll(async () => (await storedSuggestion(page, suggestionIds[3]!))?.status, { timeout: 30_000 }).toBe('confirmed');

  // A different typed value: "Sugerido: 147 GΩ", play, "Substituir".
  const typed = cell(page, cells[2]!.row, cells[2]!.col);
  const alt = typed.getByRole('group', { name: 'Leitura falada diferente do valor digitado' });
  await expect(alt).toContainText('Sugerido: 147 GΩ');
  await expect(alt.getByRole('button', { name: /^Ouvir o áudio da leitura/ })).toBeVisible();

  // "Confirmar todos" counts the two empty cells' spoken readings.
  await expect(table.getByRole('button', { name: /^Confirmar todos/ })).toBeVisible();

  // "Descartar" on the second: the suggestion is discarded, the cell stays empty and typeable.
  await cell(page, cells[1]!.row, cells[1]!.col).getByRole('button', { name: 'Descartar' }).click();
  await expect.poll(async () => (await storedSuggestion(page, suggestionIds[1]!))?.status).toBe('discarded');
  await expect(cell(page, cells[1]!.row, cells[1]!.col).locator('.suggestion-field')).toHaveCount(0);

  // "Confirmar" on the first writes the reading with its source; "Substituir" writes the spoken value over the typed one.
  await suggested.getByRole('button', { name: /confirmar/i }).click();
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.test.isolacao?.cells[String(cells[0]!.row)]?.[String(cells[0]!.col)]).toMatchObject({
    value: { raw: '147', unit: 'GΩ', state: 'measured' },
    source_suggestion_id: suggestionIds[0],
  });
  // The confirmed cell keeps play as its small glyph (the cell itself is the confirmed Suggestion field).
  await expect(first).toHaveAttribute('data-state', 'confirmed');
  await expect(first.locator('.audio-src')).toBeVisible();
  await alt.getByRole('button', { name: 'Substituir' }).click();
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.test.isolacao?.cells[String(cells[2]!.row)]?.[String(cells[2]!.col)]?.value).toMatchObject({ raw: '147', unit: 'GΩ' });
  const ops = await outbox(page);
  expect(ops.some((op) => op.path === `suggestion/${suggestionIds[0]}/status` && op.value === 'confirmed')).toBe(true);
  expect(ops.some((op) => op.path === `suggestion/${suggestionIds[1]}/status` && op.value === 'discarded')).toBe(true);
});

test('@p0 31.5-E2E-002 speech on a table that is no reading: the real job sends it to OBSERVAÇÕES marked "Áudio", and the table says so', async ({ page, context }) => {
  test.setTimeout(300_000);
  await installVoice(context);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  await stepper(page).getByRole('button', { name: /^Ensaios/ }).click();
  const table = firstTable(page);
  const mic = table.locator('.mt-actions').getByRole('button', { name: /^Gravar áudio: leituras de / });
  const label = ((await mic.getAttribute('aria-label')) ?? '').replace(/^Gravar áudio: /, '');
  await record(table, label);
  await syncUntil(page, async () => (await storedBlock(page, blockId)).sheet.observations?.value === REPORT);
  const [audio] = await deviceAudios(page, database);
  expect(audio).toMatchObject({ audio_status: 'done', not_a_reading: true });
  // No reading was suggested on any cell.
  const suggestions = (await readStore<{ entity: string; row: { source: { audio_id?: string } } }>(page, database, 'entities')).filter(
    (record) => record.entity === 'suggestion' && record.row.source.audio_id === audio!.id,
  );
  expect(suggestions).toEqual([]);

  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await stepper(page).getByRole('button', { name: /^Ensaios/ }).click();
  await expect(firstTable(page).locator('.audio-status[data-step="moved"]')).toHaveText(MOVED, { timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(observacoes(page).getByRole('textbox', { name: 'Observações da ficha' })).toHaveValue(REPORT);
  await expect(observacoes(page).locator('.audio-mark .audio-tag')).toHaveText('Áudio');
});

test('@p0 31.6-E2E-001 an audio on its way holds the ficha (its line, a refused conclude) and Sync status counts it; the real job\'s text frees it and the ficha concludes', async ({ page, context }) => {
  test.setTimeout(300_000);
  await installVoice(context);
  const { relatorioId, sheet } = await filledSetUp(page);
  await openSheet(page, relatorioId, sheet.blockId);
  await confirmPair(page);

  await offline(context, page);
  await record(observacoes(page), 'observações');
  await expect(holdLine(page)).toContainText('1 áudio aguardando transcrição');
  // e31f: the place is the first button of its entry; "Dispensar" follows it.
  const place = holdLine(page).locator('.audio-held > button');
  await expect(place).toHaveText(/ · Observações da ficha$/);
  await expect(holdLine(page).getByRole('button', { name: /^Dispensar: .* · Observações da ficha$/ })).toBeVisible();

  // "Concluir e avançar" refuses, says why and stays; nothing concludes the sheet.
  await page.locator('#ficha-primary').click();
  await expect(toast(page)).toContainText('1 áudio aguardando transcrição');
  await expect(page).toHaveURL(new RegExp(`/ficha/${sheet.blockId}$`));
  expect((await outbox(page)).some((op) => op.path === `block/${sheet.blockId}/concluded_by`)).toBe(false);
  // The line leads to the field.
  await place.click();
  await expect(observacoes(page).getByRole('textbox', { name: 'Observações da ficha' })).toBeFocused();

  // Sync status counts the audio still to send (opened from the badge, offline).
  await syncBadge(page).click();
  await expect(page.getByTestId('sync-audios-to_upload')).toHaveText('1 áudio aguardando envio');

  // Back online the real job writes the text; the line goes and the ficha concludes.
  await context.setOffline(false);
  await syncUntil(page, async () => (await storedBlock(page, sheet.blockId)).sheet.observations?.value === REPORT);
  await expect(page.getByTestId('sync-audios')).toHaveCount(0);
  await openSheet(page, relatorioId, sheet.blockId);
  await expect(holdLine(page)).toHaveCount(0);
  await page.locator('#ficha-primary').click();
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === `block/${sheet.blockId}/concluded_by`)).toBe(true);
});

test('@p0 31.6-E2E-002 a pending and a failed audio block the issue, each with its place; "Tentar de novo" needs signal and is sent; "Dispensar" frees the ficha and keeps the audio', async ({ page, context }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheet } = await filledSetUp(page);
  const obs = { type: 'sheet_field' as const, block_id: sheet.blockId, field: 'observations' as const };
  const pending = await pushHeldAudio(account.companyId, relatorioId, { type: 'setup', field: 'parecer_text' }, 'queued');
  const failed = await pushHeldAudio(account.companyId, relatorioId, obs, 'failed');
  await openSheet(page, relatorioId, sheet.blockId);
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  // The Export dialog: both rows block, each audio named by its place, the reason asks for both.
  await page.goto(`/relatorio/${relatorioId}`);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const pendingRow = dialog.locator('li[data-audio-row="audios_pending"]');
  await expect(pendingRow.locator('.pc-block')).toHaveText('1 áudio aguardando transcrição');
  await expect(pendingRow.locator('[data-audio-place]')).toHaveText('Resumo do parecer');
  const failedRow = dialog.locator('li[data-audio-row="audios_failed"]');
  await expect(failedRow.locator('.pc-block')).toHaveText('1 áudio não transcrito');
  await expect(failedRow.locator('[data-audio-place]')).toHaveText(/ · Observações da ficha$/);
  const generate = dialog.getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toHaveAttribute('aria-disabled', 'true');
  await expect(generate).toHaveAccessibleDescription(/aguarde a transcrição do áudio e tente de novo ou dispense o áudio não transcrito para emitir a revisão/i);
  // A preview with the watermark is still offered.
  await expect(dialog.getByRole('button', { name: /^Pré-visualizar/ })).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  // The failed state on its field, the ficha's line naming both kinds of its own audio.
  await openSheet(page, relatorioId, sheet.blockId);
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(holdLine(page)).toContainText('1 áudio não transcrito');
  const group = observacoes(page).getByRole('group', { name: 'Áudio não transcrito' });
  await expect(group.locator('.audio-failed-word')).toHaveText('Não foi possível transcrever');
  await expect(group.getByRole('button', { name: /^Ouvir o áudio, / })).toBeVisible();
  const retry = group.getByRole('button', { name: 'Tentar de novo' });

  // Without signal "Tentar de novo" is disabled with its reason.
  await offline(context, page);
  await expect(retry).toHaveAttribute('aria-disabled', 'true');
  await expect(retry).toHaveAccessibleDescription('Tentar de novo precisa de conexão');
  // "Dispensar" works offline: the device's one status write; the line becomes the dismissed mark and the hold goes.
  await group.getByRole('button', { name: 'Dispensar' }).click();
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === `file/${failed}/audio_status` && op.value === 'dismissed')).toBe(true);
  await expect(observacoes(page).locator('.audio-mark[data-state="dismissed"] .audio-tag')).toHaveText('Áudio dispensado');
  await expect(holdLine(page)).toHaveCount(0);
  await expect((await deviceAudios(page, database)).find((row) => row.id === failed)).toMatchObject({ audio_status: 'dismissed' });
  await context.setOffline(false);

  // A second failure on the same field: Sync status counts it, and with signal "Tentar de novo" is sent and accepted.
  const again = await pushHeldAudio(account.companyId, relatorioId, obs, 'failed');
  await syncNow(page);
  await expect(page.getByTestId('sync-audios-failed')).toHaveText('1 áudio não transcrito');
  // The audio on its way from the other device never reached the server: it is counted as still to send.
  await expect(page.getByTestId('sync-audios-to_upload')).toHaveText('1 áudio aguardando envio');
  await openSheet(page, relatorioId, sheet.blockId);
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const answered = page.waitForResponse((response) => response.url().endsWith(`/api/audios/${again}/retranscribe`) && response.request().method() === 'POST');
  await observacoes(page).getByRole('group', { name: 'Áudio não transcrito' }).getByRole('button', { name: 'Tentar de novo' }).click();
  expect((await answered).status()).toBe(202);
  await expect.poll(async () => (await serverRow(account.companyId, 'file', again))?.audio_status).not.toBe('failed');

  // The audio on its way elsewhere arrives: the Export dialog lists no audio row any more once the retried one settles.
  await pushAudioStatus(account.companyId, relatorioId, pending, 'dismissed');
  await pushAudioStatus(account.companyId, relatorioId, again, 'dismissed');
  await syncNowAndReturn(page);
  await page.goto(`/relatorio/${relatorioId}`);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(page.getByRole('dialog', { name: 'Gerar relatório' }).locator('li[data-audio-row]')).toHaveCount(0);
});

test('@p0 e31f-E2E-001 every audio that holds can be dismissed from the Export dialog and from the ficha\'s line; "Tentar de novo" only where it applies', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheet } = await filledSetUp(page);
  const obs = { type: 'sheet_field' as const, block_id: sheet.blockId, field: 'observations' as const };
  // One on its way that never reached the server (no "Tentar de novo"), one failed (both actions).
  const pending = await pushHeldAudio(account.companyId, relatorioId, { type: 'setup', field: 'parecer_text' }, 'queued');
  const failed = await pushHeldAudio(account.companyId, relatorioId, obs, 'failed');
  await openSheet(page, relatorioId, sheet.blockId);
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  await page.goto(`/relatorio/${relatorioId}`);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const pendingRow = dialog.locator('li[data-audio-row="audios_pending"]');
  await expect(pendingRow.getByRole('button', { name: 'Dispensar: Resumo do parecer' })).toBeVisible();
  await expect(pendingRow.getByRole('button', { name: /^Tentar de novo: / })).toHaveCount(0);
  const failedRow = dialog.locator('li[data-audio-row="audios_failed"]');
  await expect(failedRow.getByRole('button', { name: /^Tentar de novo: .* · Observações da ficha$/ })).toBeVisible();
  await expect(failedRow.getByRole('button', { name: /^Dispensar: .* · Observações da ficha$/ })).toBeVisible();

  // "Dispensar" in the dialog: the device's status write; the row goes, the other stays.
  await pendingRow.getByRole('button', { name: 'Dispensar: Resumo do parecer' }).click();
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === `file/${pending}/audio_status` && op.value === 'dismissed')).toBe(true);
  await expect(pendingRow).toHaveCount(0);
  await expect(failedRow).toHaveCount(1);
  await page.keyboard.press('Escape');

  // The ficha's line: the failed audio's "Dispensar" frees the ficha and keeps the audio.
  await openSheet(page, relatorioId, sheet.blockId);
  await expect(holdLine(page)).toContainText('1 áudio não transcrito');
  await holdLine(page).getByRole('button', { name: /^Dispensar: / }).click();
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === `file/${failed}/audio_status` && op.value === 'dismissed')).toBe(true);
  await expect(holdLine(page)).toHaveCount(0);
  await expect((await deviceAudios(page, database)).find((row) => row.id === failed)).toMatchObject({ audio_status: 'dismissed' });

  // The server takes both dismisses: the queued one and the failed one.
  await syncNowAndReturn(page);
  await expect.poll(async () => (await serverRow(account.companyId, 'file', pending))?.audio_status).toBe('dismissed');
  await expect.poll(async () => (await serverRow(account.companyId, 'file', failed))?.audio_status).toBe('dismissed');
});

test('@p0 e31f-E2E-002 leaving the ficha mid-recording saves the recording to its field instead of throwing it away', async ({ page, context }) => {
  test.setTimeout(240_000);
  await installVoice(context);
  const { relatorioId, sheet } = await filledSetUp(page);
  await openSheet(page, relatorioId, sheet.blockId);
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await offline(context, page);
  const known = new Set((await deviceAudios(page, database)).map((row) => row.id));
  const before = known.size;
  const scope = observacoes(page);
  await scope.getByRole('button', { name: 'Gravar áudio: observações' }).click();
  await expect(scope.getByRole('button', { name: 'Parar a gravação: observações' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Number(((await scope.locator('.audio-rec .audio-time').first().textContent()) ?? '0:00').split(':')[1]), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  // The button goes away with the ficha (Sync status opened from the badge, in the app).
  await syncBadge(page).click();
  await expect.poll(async () => (await deviceAudios(page, database)).length).toBe(before + 1);
  const saved = (await deviceAudios(page, database)).find((row) => !known.has(row.id))!;
  expect(saved).toMatchObject({ audio_status: 'queued', audio_target: { type: 'sheet_field', block_id: sheet.blockId, field: 'observations' } });
  await expect.poll(async () => (await outbox(page)).some((op) => op.kind === 'create' && op.path === `file/${saved.id}`)).toBe(true);
});
