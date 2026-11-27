import type { BlockRow } from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openChaveSheet } from './support/photos.ts';

/*
 * Story 31.9 (AD-30, FR-79): the AI control ("Melhorar o texto com IA") driven as a person would,
 * against the real route and the `fake` writing provider (`LLM_PROVIDER=fake`, the committed
 * fixture `apps/api/src/jobs/transcription/fixtures/writing.json`). A tap rewrites an NC
 * observation by an ordinary op of the user's and "Desfazer" puts the former text back; offline
 * the control stays, disabled, "Precisa de conexão", and nothing is queued; an answer the guard
 * refuses leaves the field as it was and says so; "Texto da conclusão" holding the composed text
 * becomes the user's edited text and the picked result stays. Waits poll; no fixed sleep.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const ROUGH = 'contato fase b aquecido oxidado';
const REWRITTEN = 'Contatos da fase B com sinais de aquecimento e oxidação.';
// The fixture's answer to this text adds "3 mm", a number the field does not hold: the guard refuses it.
const REFUSED = 'folga no acionamento do mecanismo';
const OBSERVATION_CONTROL = /^Melhorar o texto com IA: observação do item \d+$/;

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  meta: { ai_written?: boolean } | null;
}

const row = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);

/** Marks the "contatos" row NC, types `text` into its observation and leaves the field; hands back the row. */
async function ncObservation(page: Page, text: string): Promise<Locator> {
  const contatos = row(page, 'contatos');
  const nc = contatos.getByRole('radio', { name: 'Não conforme', exact: true });
  await nc.click();
  await expect(nc).toHaveAttribute('aria-checked', 'true');
  const field = contatos.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await field.fill(text);
  await field.blur();
  return contatos;
}

async function storedBlock(page: Page, blockId: string): Promise<BlockRow> {
  const records = await readStore<{ entity: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.row.id === blockId)!.row;
}

async function aiOps(page: Page): Promise<OutboxRow[]> {
  return (await readStore<OutboxRow>(page, database, 'outbox')).filter((op) => op.meta?.ai_written === true);
}

async function offline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });

test('@p0 31.9-E2E-001 a tap rewrites an NC observation by an ordinary op, and "Desfazer" puts the former text back', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const contatos = await ncObservation(page, ROUGH);
  const field = contatos.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe(ROUGH);

  const control = contatos.getByRole('button', { name: OBSERVATION_CONTROL });
  await expect(control).toBeVisible();
  await expect(control.locator('use')).toHaveAttribute('href', /#i-sparkles$/);
  // 48 px, the touch minimum.
  expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await control.click();

  await expect(field).toHaveValue(REWRITTEN, { timeout: 30_000 });
  const done = contatos.locator('.ai-done');
  await expect(done).toContainText('Texto melhorado por IA');
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe(REWRITTEN);
  // An ordinary put of the user's, named as the AI control's.
  const written = await aiOps(page);
  expect(written.map((op) => [op.kind, op.path, op.value])).toEqual([['put', `sheet/${blockId}/checklist/contatos/observation`, REWRITTEN]]);
  // The picked answer is untouched.
  expect((await storedBlock(page, blockId)).sheet.checklist.contatos?.result?.value).toBe('NC');

  await done.getByRole('button', { name: /^Desfazer o texto melhorado por IA: / }).click();
  await expect(field).toHaveValue(ROUGH, { timeout: 30_000 });
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe(ROUGH);
  await expect(contatos.locator('.ai-done')).toHaveCount(0);
});

test('@p0 31.9-E2E-002 offline the control stays, disabled with "Precisa de conexão", and a tap queues nothing', async ({ page, context }) => {
  test.setTimeout(150_000);
  await openChaveSheet(page, account, database);
  const contatos = await ncObservation(page, ROUGH);
  const field = contatos.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await offline(context, page);
  const control = contatos.getByRole('button', { name: OBSERVATION_CONTROL });
  await expect(control).toHaveAttribute('aria-disabled', 'true');
  await expect(control).toHaveAccessibleDescription('Precisa de conexão');
  await control.click({ force: true });
  await expect(control).not.toHaveAttribute('aria-busy', 'true');
  await expect(field).toHaveValue(ROUGH);
  expect(await aiOps(page)).toEqual([]);
  await expect(contatos.locator('.ai-done, .ai-error')).toHaveCount(0);
  await context.setOffline(false);
  await expect(control).not.toHaveAttribute('aria-disabled', 'true');
});

test('@p0 31.9-E2E-003 an answer the guard refuses leaves the field unchanged and says "Não foi possível melhorar o texto"', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const contatos = await ncObservation(page, REFUSED);
  const field = contatos.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe(REFUSED);
  await contatos.getByRole('button', { name: OBSERVATION_CONTROL }).click();
  await expect(contatos.locator('.ai-error')).toHaveText('Não foi possível melhorar o texto', { timeout: 30_000 });
  await expect(field).toHaveValue(REFUSED);
  expect((await storedBlock(page, blockId)).sheet.checklist.contatos?.observation?.value).toBe(REFUSED);
  expect(await aiOps(page)).toEqual([]);
});

test('@p0 31.9-E2E-004 "Texto da conclusão" holding the composed text becomes the edited text; the result stays; "Desfazer" brings the composed text back', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const result = page.getByRole('radiogroup', { name: 'Resultado' });
  await result.getByRole('radio', { name: 'Reprovado', exact: true }).click();
  await expect(result.getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  const conclusion = page.locator('.ficha-conc-text');
  await expect(conclusion.locator('.suggestion-field.is-generated')).toBeVisible();
  // Composed on the device with no model call: nothing stored until the user asks.
  expect((await storedBlock(page, blockId)).sheet.conclusion.text?.value ?? null).toBeNull();

  await conclusion.getByRole('button', { name: 'Melhorar o texto com IA: texto da conclusão' }).click();
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.conclusion.text_status?.value ?? null, { timeout: 30_000 }).toBe('edited');
  const block = await storedBlock(page, blockId);
  const text = String(block.sheet.conclusion.text?.value ?? '');
  expect(text.length).toBeGreaterThan(20);
  expect(block.sheet.conclusion.result?.value).toBe('reprovado');
  await expect(conclusion.locator('.ai-done')).toContainText('Texto melhorado por IA');
  const written = await aiOps(page);
  expect(written.map((op) => op.path).sort()).toEqual([`sheet/${blockId}/conclusion/text`, `sheet/${blockId}/conclusion/text_basis`, `sheet/${blockId}/conclusion/text_status`]);
  expect(written.some((op) => op.path.endsWith('/result'))).toBe(false);

  await conclusion.locator('.ai-done').getByRole('button', { name: /^Desfazer o texto melhorado por IA: / }).click();
  await expect.poll(async () => (await storedBlock(page, blockId)).sheet.conclusion.text_status?.value ?? null).toBeNull();
  expect((await storedBlock(page, blockId)).sheet.conclusion.text?.value ?? null).toBeNull();
  await expect(conclusion.locator('.suggestion-field.is-generated')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
});
