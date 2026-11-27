import { aiRewriteRefusalText, type AiRewriteRefusal, type BlockRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { expect } from './merged-fixtures.ts';
import { readStore } from './outbox.ts';

/*
 * Story 31.10: what the AI control's specs share. The field bar of a prose field (`.field-tray`:
 * "Gravar áudio" at its start, "Melhorar o texto com IA" at its end), the comparison a tap opens
 * ("Seu texto" and "Texto proposto pela IA"), "Usar o texto da IA" and "Manter o meu texto", and the
 * refusal line in the kernel's two parts.
 */

/** The fixture's rough observation and its rewrite (`apps/api/src/jobs/transcription/fixtures/writing.json`). */
export const ROUGH = 'contato fase b aquecido oxidado';
export const REWRITTEN = 'Contatos da fase B com sinais de aquecimento e oxidação.';
/** The fixture's answer to this text adds "3 mm", a number the field does not hold: the guard refuses it. */
export const REFUSED = 'folga no acionamento do mecanismo';

/** The refusal line as the field shows it: what happened to the text, then why. */
export function refusalLine(refusal: AiRewriteRefusal): string {
  const text = aiRewriteRefusalText(refusal);
  return `${text.what} ${text.why}`;
}

/** The line of the fixture's guard refusal (an added number). */
export const GUARD_LINE = refusalLine({ kind: 'guard', guard_kinds: ['number'] });

/** Waits for the comparison inside `scope` and taps "Usar o texto da IA". */
export async function useProposal(scope: Locator): Promise<void> {
  await expect(scope.getByRole('region', { name: 'Texto proposto pela IA' })).toBeVisible({ timeout: 30_000 });
  await scope.getByRole('button', { name: /^Usar o texto da IA: / }).click();
}

export interface AiOutboxRow {
  kind: string;
  path: string;
  value: unknown;
  meta: { ai_written?: boolean; ai_run_id?: string } | null;
}

/** The ops the AI control wrote (`meta.ai_written`), in the device's outbox. */
export async function aiOps(page: Page, database: string): Promise<AiOutboxRow[]> {
  return (await readStore<AiOutboxRow>(page, database, 'outbox')).filter((op) => op.meta?.ai_written === true);
}

/** Every op in the device's outbox (to see that nothing was written). */
export async function outboxCount(page: Page, database: string): Promise<number> {
  return (await readStore<AiOutboxRow>(page, database, 'outbox')).length;
}

export async function storedBlock(page: Page, database: string, blockId: string): Promise<BlockRow> {
  const records = await readStore<{ entity: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.row.id === blockId)!.row;
}

/** The "contatos" checklist row of the open ficha. */
export const contatosRow = (page: Page): Locator => page.locator('#ficha-step-verificacoes li.checklist-row[data-item-key="contatos"]');

/** Marks the "contatos" row NC, types `text` into its observation and leaves the field; hands back the row. */
export async function ncObservation(page: Page, text: string): Promise<Locator> {
  const contatos = contatosRow(page);
  const nc = contatos.getByRole('radio', { name: 'Não conforme', exact: true });
  await nc.click();
  await expect(nc).toHaveAttribute('aria-checked', 'true');
  const field = contatos.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await field.fill(text);
  await field.blur();
  return contatos;
}
