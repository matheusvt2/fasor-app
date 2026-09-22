import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unsyncedForDays } from './checks/unsynced.ts';
import { isoTimestampSchema, toIso } from './clock.ts';
import { uuidV7Schema } from './ids.ts';
import { makeOp } from './ops/op.ts';
import { invertBatch } from './ops/outbox.ts';
import { idSequence, opFactory, T0, T1, TEST_COMPANY, TEST_RELATORIO, TEST_USER } from './test-support.ts';

const B1 = '019966b0-0007-7000-8000-000000000001';

describe('1.4-UNIT-006 clock injection', () => {
  it('unsyncedForDays answers differently for two fixed dates', () => {
    const pending = '2026-09-21T12:00:00.000Z';
    expect(unsyncedForDays(pending, T0)).toBe(false);
    expect(unsyncedForDays(pending, T1)).toBe(true);
    expect(unsyncedForDays(pending, new Date('2026-09-26T11:59:59.999Z'))).toBe(false);
    expect(unsyncedForDays(pending, new Date('2026-09-26T12:00:00.000Z'))).toBe(true);
    expect(unsyncedForDays(pending, T1, 7)).toBe(false);
    expect(unsyncedForDays(null, T1)).toBe(false);
  });

  it('makeOp stamps client_ts from the injected date and op_id from the injected minter', () => {
    const input = {
      kind: 'put' as const,
      scope: 'relatorio' as const,
      company_id: TEST_COMPANY,
      relatorio_id: TEST_RELATORIO,
      path: `block/${B1}/order_key`,
      value: 'a1',
      actor_id: TEST_USER,
      device_id: 'tablet-test',
    };
    const newId = idSequence();
    const a = makeOp(input, { newId, now: T0 });
    const b = makeOp(input, { newId, now: T1 });
    expect(a.client_ts).toBe('2026-09-21T12:00:00.000Z');
    expect(b.client_ts).toBe('2026-09-27T12:00:00.000Z');
    expect(a.op_id).not.toBe(b.op_id);
    expect(uuidV7Schema.safeParse(a.op_id).success).toBe(true);
  });

  it('invertBatch stamps the inverse ops from the injected date', () => {
    const f = opFactory();
    const op = f.op({ path: `block/${B1}/order_key`, value: 'a1' });
    const at = (now: Date) => invertBatch([op], new Map([[op.op_id, 'a0']]), { newId: idSequence('019966b0-0008-7000-8000-'), now })[0]!;
    expect(at(T0).client_ts).toBe(toIso(T0));
    expect(at(T1).client_ts).toBe(toIso(T1));
    expect(at(T0).value).toBe('a0');
  });

  it('accepts only UTC ISO timestamps', () => {
    expect(isoTimestampSchema.safeParse('2026-09-21T12:00:00.000Z').success).toBe(true);
    expect(isoTimestampSchema.safeParse('2026-09-21T09:00:00.000-03:00').success).toBe(false);
    expect(isoTimestampSchema.safeParse('2026-09-21T12:00:00Z').success).toBe(false);
    expect(isoTimestampSchema.safeParse('2026-09-21T12:00:00.000000Z').success).toBe(false);
    expect(isoTimestampSchema.safeParse('2026-09-21 12:00:00').success).toBe(false);
  });
});

describe('determinism source scan', () => {
  const root = join(import.meta.dirname);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(path);
    }
  };
  walk(root);

  const banned: [string, RegExp][] = [
    ['Date.now', /\bDate\s*\.\s*now\s*\(/],
    ['new Date() without argument', /\bnew\s+Date\s*\(\s*\)/],
    ['Math.random', /\bMath\s*\.\s*random\s*\(/],
    ['crypto.randomUUID', /\brandomUUID\s*\(/],
    ['performance.now', /\bperformance\s*\.\s*now\s*\(/],
    ['process.env', /\bprocess\s*\.\s*env\b/],
    ['Buffer', /\bBuffer\s*\./],
    // The kernel is pure TypeScript: no Node built-ins (Node types exist for the tests only).
    ['node built-in import', /from\s+['"](node:[a-z_/]+|fs|path|crypto|os|url|child_process)['"]/],
    ['dynamic node built-in import', /\bimport\s*\(\s*['"]node:/],
  ];

  it('scans the kernel sources', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(banned)('no %s in packages/domain/src', (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
