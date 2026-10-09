import { expect, type Page } from '@playwright/test';
import { readStore } from './outbox.ts';

/*
 * Review 2026-10-08 Decision 1 (JRN-V1): "Concluir ficha" and "Concluir e avançar" confirm
 * the composed conclusion text in the conclude batch. These read the device outbox after
 * the counted tap (never a tap of their own), so a tap-timing spec can assert them.
 */

export interface OutboxOp {
  path: string;
  value: unknown;
  batch_id: string | null;
}

const outbox = (page: Page, database: string) => readStore<OutboxOp>(page, database, 'outbox');

/** The ops of the batch that wrote the sheet's `concluded_by` (the last one), polled until it lands. */
export async function concludeBatch(page: Page, database: string, blockId: string): Promise<OutboxOp[]> {
  const path = `block/${blockId}/concluded_by`;
  let rows: OutboxOp[] = [];
  await expect
    .poll(
      async () => {
        rows = await outbox(page, database);
        return rows.some((row) => row.path === path);
      },
      { message: `the conclude of ${blockId} is in the outbox`, timeout: 15_000 },
    )
    .toBe(true);
  const concluded = rows.filter((row) => row.path === path).at(-1)!;
  expect(concluded.batch_id, 'the conclude is one batch').not.toBeNull();
  return rows.filter((row) => row.batch_id === concluded.batch_id);
}

/** The conclude batch's `conclusion/{field}` op of the sheet, if any. */
export function conclusionOpOf(batch: readonly OutboxOp[], blockId: string, field: 'text' | 'text_status' | 'text_basis'): OutboxOp | undefined {
  return batch.find((row) => row.path === `sheet/${blockId}/conclusion/${field}`);
}

/**
 * Asserts that the conclude batch carries the composed text (starting with `textStart` when
 * given), `text_status = confirmed` and an 8-hex `text_basis`, with `concluded_by`.
 */
export async function expectConcludeConfirmsText(page: Page, database: string, blockId: string, textStart?: string): Promise<OutboxOp[]> {
  const batch = await concludeBatch(page, database, blockId);
  expect(conclusionOpOf(batch, blockId, 'text_status')?.value, 'the conclude batch confirms the text').toBe('confirmed');
  const text = conclusionOpOf(batch, blockId, 'text')?.value;
  expect(typeof text, 'the conclude batch writes the composed text').toBe('string');
  if (textStart !== undefined) expect(String(text).startsWith(textStart), `the text starts "${textStart}": ${String(text)}`).toBe(true);
  expect(String(conclusionOpOf(batch, blockId, 'text_basis')?.value), 'the conclude batch writes the basis').toMatch(/^[0-9a-f]{8}$/);
  return batch;
}

/** The value of the sheet's last `conclusion/text_status` op in the outbox. */
export async function lastTextStatus(page: Page, database: string, blockId: string): Promise<unknown> {
  return (await outbox(page, database)).filter((row) => row.path === `sheet/${blockId}/conclusion/text_status`).at(-1)?.value;
}
