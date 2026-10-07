import { STANDARD_TEMPLATE_NAME, templateRowSchema } from '@app/domain';
import type { Page } from '@playwright/test';
import { readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * 11.4-E2E-002 (Story 11.4, FR-12): a template's section text formatted in the composer's
 * rich editor reaches a relatório made from it and its printed document. E11-Q5: the
 * relatório's Section text surface is the same rich editor, so the bold word shows bold with
 * its toolbar, the stored `**` never shows, and an edit there keeps the formatting. The DOCX
 * of the relatório's revision carries the bold run, and "PDF — enviar ao cliente" saves its PDF
 * (the PDF's fonts are read in the api's `rich-text.integration.test.ts`). It generates through the api's one queue and LibreOffice,
 * so it runs in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;

type EntityRecord = { entity: string; id: string; row: Record<string, unknown> };

async function deviceTemplateSection2(page: Page): Promise<string | null> {
  const records = await readStore<EntityRecord>(page, database, 'entities');
  const template = records.map((r) => (r.entity === 'template' ? templateRowSchema.safeParse(r.row) : null)).find((r) => r?.success && r.data.name === STANDARD_TEMPLATE_NAME);
  return template?.success ? (template.data.blocks.find((b) => b.block_type === 'section_2')?.section_text ?? null) : null;
}

async function deviceRelatorioSection2(page: Page, relatorioId: string): Promise<string | null> {
  const records = await readStore<EntityRecord>(page, database, 'entities');
  const block = records.find((r) => r.entity === 'block' && r.row.relatorio_id === relatorioId && r.row.block_type === 'section_2');
  const text = (block?.row.config as { section_text?: unknown } | undefined)?.section_text;
  return typeof text === 'string' ? text : null;
}

test('@p1 11.4-E2E-002 a relatório made from a formatted template: section 2 opens in the rich editor, bold shown and no markup, kept by an edit, and its DOCX prints the bold run', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });

  // The composer: "manutenção" in section 2's first line in bold.
  await page.getByRole('link', { name: /Templates/ }).click();
  await page.getByRole('button', { name: `Abrir template ${STANDARD_TEMPLATE_NAME}`, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Mais opções de 2 Definições' }).click();
  await page.getByRole('menuitem', { name: 'Editar texto' }).click();
  const dialog = page.getByRole('dialog', { name: '2 Definições — texto fixo' });
  const area = dialog.getByRole('textbox', { name: 'Texto da seção 2' });
  await expect(area).toBeFocused();
  await expect(area).toContainText(/^A manutenção caracteriza-se/);
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight');
  await dialog.getByRole('toolbar', { name: 'Formatação' }).getByRole('button', { name: 'Negrito' }).click();
  await expect.poll(() => deviceTemplateSection2(page), { timeout: 10_000 }).toMatch(/^A \*\*manutenção\*\* caracteriza-se/);
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialog).toBeHidden();

  // A relatório from Home, born from that template.
  await page.goto('/');
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect.poll(() => deviceRelatorioSection2(page, relatorioId), { timeout: 30_000 }).toMatch(/^A \*\*manutenção\*\* caracteriza-se/);

  // Its section 2: the rich editor, "manutenção" drawn bold, no stored markup shown.
  await page.getByRole('list', { name: 'Sumário do relatório' }).getByRole('button', { name: /^Definições/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/secao/[0-9a-f-]{36}$`));
  const plain = page.getByRole('textbox', { name: 'Texto da seção' });
  await expect(plain).toContainText('A manutenção caracteriza-se');
  await expect(plain.locator('strong')).toHaveText('manutenção');
  await expect(plain).not.toContainText('**');
  const toolbar = page.getByRole('toolbar', { name: 'Formatação' });
  await expect(toolbar.getByRole('button', { name: 'Negrito' })).toBeVisible();
  // The caret on the bold word: Negrito reads pressed.
  await plain.locator('strong').click();
  await expect(toolbar.getByRole('button', { name: 'Negrito' })).toHaveAttribute('aria-pressed', 'true');
  // An edit there keeps the formatting.
  await plain.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Nota deste relatório.');
  await expect
    .poll(() => deviceRelatorioSection2(page, relatorioId), { timeout: 10_000 })
    .toMatch(/^A \*\*manutenção\*\* caracteriza-se[\s\S]* Nota deste relatório\.$/);
  await page.getByRole('button', { name: 'Voltar ao sumário' }).click();

  // Issued: the DOCX prints "manutenção" in a bold run under "2 DEFINIÇÕES".
  await setParecer(page, relatorioId);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  // F-03 (D1): the new relatório's sheets are empty, so the issue is confirmed first.
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const document = readZipEntries(await downloadBytes(download)).get('word/document.xml')!.toString('utf8');
  const paragraphs = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
  const heading = paragraphs.findIndex((p) => p.includes('w:val="Heading1"') && p.includes('>2 DEFINIÇÕES<'));
  expect(heading).toBeGreaterThanOrEqual(0);
  const first = paragraphs[heading + 1]!;
  const runs = [...first.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map((m) => m[0]);
  expect(runs.find((run) => run.includes('>manutenção</w:t>'))).toContain('<w:b/>');
  expect(runs.find((run) => run.includes('>A </w:t>'))).not.toContain('<w:b/>');
  // 11.4-PRINT-BOTH, the UI half: the PDF of the same revision, saved from the dialog.
  const pdf = await downloadFrom(page, () => modal.getByRole('button', { name: 'PDF — enviar ao cliente' }).click());
  expect(pdf.suggestedFilename()).toBe('relatorio-rev-1.pdf');
  expect((await downloadBytes(pdf)).subarray(0, 4).toString('latin1')).toBe('%PDF');
});
