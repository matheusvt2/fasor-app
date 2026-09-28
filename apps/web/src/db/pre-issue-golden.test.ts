// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { buildSnapshot, preIssue, progress, sumarioRows } from '@app/domain';
import { portoSeguro, PRE_ISSUE_GOLDEN_NOW } from '@app/domain/fixtures/porto-seguro';
import { describe, expect, it } from 'vitest';
import { relatorioState } from './home-store.ts';
import { openDatabase } from './schema.ts';
import { applyPulled } from './sync-store.ts';

/*
 * Story 7.5 (AD-2, the Sumário/pre-issue identity test): the Porto Seguro log pulled into a
 * Dexie store, read the way the Sumário reads it (`relatorioState`, `buildSnapshot`,
 * `preIssue` at the fixed clock reading), yields exactly `pre-issue.golden.json`, which the
 * api's integration suite writes from the same log applied to Postgres.
 */

const GOLDEN = new URL('../../../../packages/domain/fixtures/porto-seguro/pre-issue.golden.json', import.meta.url);

describe('7.5-UNIT AD-2 pre-issue identity (Dexie)', () => {
  it('the Sumário\'s pre-issue rows over Dexie equal pre-issue.golden.json', async () => {
    const user = '019966c1-0052-7000-8000-000000000001';
    const stale = openDatabase(user);
    await stale.delete();
    const db = openDatabase(user);
    await applyPulled(db, portoSeguro.log);
    const state = await relatorioState(db, portoSeguro.relatorioId);
    const snapshot = buildSnapshot(state!, portoSeguro.relatorioId);
    const computed = progress(snapshot);
    const rows = preIssue(snapshot, computed, { now: new Date(PRE_ISSUE_GOLDEN_NOW) });
    expect(rows).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    // What the Sumário draws from them: the one blocking row, on virtual row 10 (E78-Q1: the fixture predates section blocks).
    expect(sumarioRows(snapshot, rows, computed).filter((row) => row.blocking).map((row) => [row.number, row.virtual, row.meta])).toEqual([[10, true, 'Parecer não preenchido']]);
    expect(rows.filter((row) => row.severity === 'blocking').map((row) => row.text)).toEqual(['Parecer não preenchido']);
    db.close();
  }, 60_000);
});
