import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readDraft, saveDraft } from '../../db/drafts.ts';
import { pointRowsOf } from '../../db/home-store.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { DraftsContext, type DraftSource, type DraftsState } from '../../state/drafts.tsx';
import type { SessionState } from '../../state/session.tsx';
import { usePointDraftRecovery } from './point-draft-recovery.ts';
import { POINT_DRAFT_SURFACE, type PointDraftValue } from './point-writes.ts';

/*
 * Story 14.3 (review of batch e14b, 2026-10-13): the recovery path of a closed point editor.
 * A draft saved from a site item ("Verificações do local") carries its local; "Recuperar"
 * after a reload writes it through `writePoint`, so the point is created with `location_id`.
 * The store and the write path are the real ones; the session and the draft registry are
 * stand-ins (the registry only hands back the source this hook registers).
 */

const USER = '019966b0-0152-7000-8000-000000000001';
const COMPANY = '019966b0-0152-7000-8000-000000000002';
const REL = '019966b0-0152-7000-8000-000000000003';
const OTHER_REL = '019966b0-0152-7000-8000-000000000004';
const LOCAL = '019966b0-0152-7000-8000-000000000005';
const POINT = '019966b0-0152-7000-8000-000000000006';
const PLAIN_POINT = '019966b0-0152-7000-8000-000000000007';
const ELSEWHERE_POINT = '019966b0-0152-7000-8000-000000000008';

const session = { status: 'signed-in', user: { id: USER, companyId: COMPANY }, database: null as AppDatabase | null } as unknown as SessionState;
const showToast = vi.fn();

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../../state/toast.tsx', () => ({ useToast: () => ({ showToast }) }));

/** What the editor's draft source reads for a new point (`point-editor.tsx`), with or without a local. */
const draft = (over: Partial<PointDraftValue> = {}): PointDraftValue => ({
  pending: {},
  relatorio_id: REL,
  text: 'Luminária de emergência inoperante',
  action: 'Substituir as baterias',
  owner: '',
  equipmentId: null,
  origin: 'manual',
  is_new: true,
  ...over,
});

async function freshDb(): Promise<AppDatabase> {
  await openDatabase(USER).delete();
  return openDatabase(USER);
}

describe('14.3-UNIT usePointDraftRecovery', () => {
  it('a draft saved from a site item is recovered and creates the point with its local; a draft with no local creates one with none; another relatório draft is not offered', async () => {
    const db = await freshDb();
    session.database = db;
    const now = new Date('2026-10-13T12:00:00.000Z');
    await saveDraft(db, { surface: POINT_DRAFT_SURFACE, entity_id: POINT }, draft({ locationId: LOCAL }), now);
    await saveDraft(db, { surface: POINT_DRAFT_SURFACE, entity_id: PLAIN_POINT }, draft({ text: 'Ponto geral' }), now);
    await saveDraft(db, { surface: POINT_DRAFT_SURFACE, entity_id: ELSEWHERE_POINT }, draft({ relatorio_id: OTHER_REL, locationId: LOCAL }), now);

    const sources: DraftSource[] = [];
    const drafts: DraftsState = {
      draftFound: true,
      register: (source) => {
        sources.push(source);
        return () => {};
      },
      persistAll: async () => {},
      persistOne: async () => {},
    };
    const wrapper = ({ children }: { children: ReactNode }) => <DraftsContext value={drafts}>{children}</DraftsContext>;
    renderHook(() => usePointDraftRecovery(REL), { wrapper });
    await waitFor(() => expect(sources).toHaveLength(2));
    expect(sources.map((source) => source.entity_id).sort()).toEqual([POINT, PLAIN_POINT]);
    // A recovery source holds nothing of its own.
    expect(sources.every((source) => source.surface === POINT_DRAFT_SURFACE && source.read() === null)).toBe(true);

    // "Recuperar": the provider hands each source the stored row's value.
    for (const source of sources) {
      const row = await readDraft(db, { surface: source.surface, entity_id: source.entity_id });
      source.apply(row!.value);
    }
    await waitFor(async () => expect(await pointRowsOf(db, REL)).toHaveLength(2));
    const rows = await pointRowsOf(db, REL);
    const site = rows.find((row) => row.id === POINT)!;
    expect(site).toMatchObject({ id: POINT, relatorio_id: REL, location_id: LOCAL, equipment_id: null, origin: 'manual', text: 'Luminária de emergência inoperante', action: 'Substituir as baterias' });
    const plain = rows.find((row) => row.id === PLAIN_POINT)!;
    expect(plain).toMatchObject({ id: PLAIN_POINT, equipment_id: null, text: 'Ponto geral' });
    expect(plain).not.toHaveProperty('location_id');
    expect(showToast).not.toHaveBeenCalled();
  });
});
