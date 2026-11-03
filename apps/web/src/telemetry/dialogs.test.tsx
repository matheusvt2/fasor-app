import 'fake-indexeddb/auto';
import type { BlockRow, CellDecision, DecisionTextContext } from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeldDecisions } from '../db/decision-store.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import type { SessionState } from '../state/session.tsx';
import { FichaDialogs } from '../surfaces/ficha/ficha-dialogs.tsx';
import type { FichaActions } from '../surfaces/ficha/use-ficha-actions.ts';
import type { FichaPhotos } from '../surfaces/ficha/use-ficha-photos.ts';
import { ConflictDialog } from '../surfaces/sync/conflict-dialog.tsx';
import type { DecisionActions } from '../surfaces/sync/decision-actions.ts';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from './track.ts';

/*
 * E18-A1 (R-V7): the dialogs' `dialog_open` and `dialog_cancel`, read from the queue after a
 * real open and a press of the dialog's cancel control (`targets.test.ts` only finds the
 * hook's name in the source). The sheet's three dialogs open through `FichaDialogs`, as the
 * sheet mounts them; the Conflict view on its own. The Export dialog's pair is in
 * `surfaces/export/export-dialog.test.tsx`, over its own fixture.
 */

const DEVICE = '019966b0-0036-7000-8000-0000000000dd';
const RELATORIO = '019966b0-0036-7000-8000-000000000071';
const BLOCK = '019966b0-0036-7000-8000-000000000072';
const EQUIPMENT = '019966b0-0036-7000-8000-000000000073';

let counter = 0;
let db: AppDatabase;

vi.mock('../state/session.tsx', () => ({ useSession: (): Partial<SessionState> => ({ database: db, online: true }) }));

beforeEach(async () => {
  resetTelemetryForTests();
  db = openDatabase(`019966b0-0036-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  configureTelemetry({ db, deviceId: DEVICE });
});

afterEach(() => {
  cleanup();
  configureTelemetry(null);
  db.close();
});

async function dialogEvents() {
  await whenTelemetryWritten();
  return (await queuedUxEvents(db)).filter((e) => e.name === 'dialog_open' || e.name === 'dialog_cancel').map(({ name, target }) => ({ name, target }));
}

const block = { id: BLOCK, relatorio_id: RELATORIO, location_id: null, equipment_id: EQUIPMENT, block_type: 'transformador', seed_version: 'v2', concluded_by: null, not_tested: null } as unknown as BlockRow;

function renderFichaDialogs(open: Partial<Pick<FichaActions, 'renaming' | 'notTestedDialogOpen' | 'moveDialogOpen'>>) {
  const actions = {
    renaming: false,
    setRenaming: vi.fn(),
    rename: vi.fn(),
    notTestedDialogOpen: false,
    setNotTestedDialogOpen: vi.fn(),
    markNotTested: vi.fn(),
    moveDialogOpen: false,
    setMoveDialogOpen: vi.fn(),
    moveTo: vi.fn(),
    ...open,
  } as unknown as FichaActions;
  const photos = { importing: null, setImporting: vi.fn(), photoTarget: vi.fn(), captioning: null, setCaptioning: vi.fn(), saveCaption: vi.fn() } as unknown as FichaPhotos;
  const snapshot = { blocks: [block], locations: [] } as never;
  const own = { id: EQUIPMENT, tag: 'TR-01' } as never;
  render(<FichaDialogs relatorioId={RELATORIO} snapshot={snapshot} block={block} equipment={[own]} own={own} tag="TR-01" photos={photos} actions={actions} />);
  return actions;
}

describe('dialog_open and dialog_cancel, opened and cancelled (R-V7)', () => {
  it('rename_tag: the sheet\'s "Renomear TAG" dialog', async () => {
    const actions = renderFichaDialogs({ renaming: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(actions.setRenaming).toHaveBeenCalledWith(false);
    expect(await dialogEvents()).toEqual([
      { name: 'dialog_open', target: 'rename_tag' },
      { name: 'dialog_cancel', target: 'rename_tag' },
    ]);
  });

  it('not_tested: the sheet\'s "Marcar não ensaiado" dialog', async () => {
    const actions = renderFichaDialogs({ notTestedDialogOpen: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(actions.setNotTestedDialogOpen).toHaveBeenCalledWith(false);
    expect(await dialogEvents()).toEqual([
      { name: 'dialog_open', target: 'not_tested' },
      { name: 'dialog_cancel', target: 'not_tested' },
    ]);
  });

  it('move_block: the sheet\'s "Mover para…" dialog', async () => {
    const actions = renderFichaDialogs({ moveDialogOpen: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(actions.setMoveDialogOpen).toHaveBeenCalledWith(false);
    expect(await dialogEvents()).toEqual([
      { name: 'dialog_open', target: 'move_block' },
      { name: 'dialog_cancel', target: 'move_block' },
    ]);
  });

  it('a sheet with no dialog open tracks no dialog', async () => {
    renderFichaDialogs({});
    expect(await dialogEvents()).toEqual([]);
  });

  it('conflict: the Conflict view, left by "Voltar sem decidir"', async () => {
    const onClose = vi.fn();
    const decision: CellDecision = { kind: 'cell', relatorio_id: RELATORIO, block_id: BLOCK, cells: [] };
    const entry = { relatorioId: RELATORIO, projectId: RELATORIO, decisions: [decision], blocks: [block], locations: [] } as unknown as HeldDecisions;
    const context: DecisionTextContext = { blocks: [block], equipment: [{ id: EQUIPMENT, tag: 'TR-01' }], locations: [], users: [], viewerActorId: null, viewerDeviceId: null };
    render(<ConflictDialog entry={entry} decision={decision} context={context} actions={{} as DecisionActions} onClose={onClose} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voltar sem decidir' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await dialogEvents()).toEqual([
      { name: 'dialog_open', target: 'conflict' },
      { name: 'dialog_cancel', target: 'conflict' },
    ]);
  });
});
