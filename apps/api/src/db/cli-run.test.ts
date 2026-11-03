import { describe, expect, it, vi } from 'vitest';
import { readThenEnd } from './cli-run.ts';

describe('readThenEnd (E18-A1, R-E8)', () => {
  it("keeps the read's own error when closing the database fails too", async () => {
    const end = vi.fn(async () => {
      throw new Error('end failed');
    });
    await expect(
      readThenEnd(async () => {
        throw new Error('read failed');
      }, end),
    ).rejects.toThrow('read failed');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("answers the read's result, closing once, even when closing fails", async () => {
    const end = vi.fn(async () => {
      throw new Error('end failed');
    });
    await expect(readThenEnd(async () => 42, end)).resolves.toBe(42);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('closes after the read, not before', async () => {
    const order: string[] = [];
    await readThenEnd(
      async () => {
        order.push('read');
      },
      async () => {
        order.push('end');
      },
    );
    expect(order).toEqual(['read', 'end']);
  });
});
