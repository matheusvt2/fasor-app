import 'fake-indexeddb/auto';
import {
  defaultBlockConfig,
  emptySheet,
  entityKey,
  getDefinition,
  type BlockRow,
  type Cell,
  type EntityState,
  type EquipmentBlockType,
  type OpDraft,
  type RelatorioSnapshot,
  type Sheet,
  type SuggestionRow,
} from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readOilNaUsed, writeOilNaUsed } from '../../db/prefs.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { NameplateSection } from './nameplate-section.tsx';

/*
 * Review 2026-10-08, Decision 2, amended 2026-10-09 (r8dry): no write of TIPO DE ISOLAÇÃO marks
 * an oil item by itself ("Confirmar", "Substituir", "Confirmar todos", typed over the guess, the
 * select). A stored dry insulation, however written, offers the chip "Marcar N itens de óleo
 * como NA"; its tap reads the fresh block the edit hands its build, never the block the sheet
 * drew, so an item answered after the render is never written; once used the chip is not
 * offered again on this device.
 */

const session: { database: AppDatabase | null; user: null; online: boolean } = { database: null, user: null, online: true };
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const ID = '019966b0-d0a2-7000-8000-000000000001';
const REL = '019966b0-d0a2-7000-8000-000000000002';
const OP = '019966b0-d0a2-7000-8000-000000000003';
const PHOTO = '019966b0-d0a2-7000-8000-000000000004';
const S_INSULATION = '019966b0-d0a2-7000-8000-000000000005';
const S_IDENT = '019966b0-d0a2-7000-8000-000000000006';
const AUTHOR = { id: 'u1', companyId: 'c1' };
const OIL = [
  'valvula_de_alivio',
  'elemento_secante',
  'juntas_vedacoes_e_vazamentos',
  'indicador_nivel_de_oleo',
  'registros_radiadores',
  'rele_de_gas_funcionamento',
  'termometro',
  'oleo_isolante_indicador_de_nivel',
];

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function block(sheet: Partial<Sheet> = {}, type: EquipmentBlockType = 'transformador_forca', subtype?: 'epoxi' | 'a_seco'): BlockRow {
  return {
    id: ID,
    relatorio_id: REL,
    location_id: null,
    equipment_id: null,
    block_type: type,
    config: defaultBlockConfig('v1', type, subtype === undefined ? {} : { subtype }),
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), ...sheet },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

/** A stored insulation as any path writes it (a copy chip's cell carries no `source_suggestion_id`), with the given checklist. */
const insulated = (value: string, checklist: Sheet['checklist'] = {}): Partial<Sheet> => ({ nameplate: { tipo_de_isolacao: cell(value) }, checklist });
const answered = (key: string, value: 'C' | 'NC'): Sheet['checklist'] => ({ [key]: { result: cell(value) } });
const everyOilAnswered = (): Sheet['checklist'] => Object.fromEntries(OIL.map((key) => [key, { result: cell('C') }]));

function suggestion(id: string, fieldKey: string, value: string, mode: SuggestionRow['mode'] = 'fill', status: SuggestionRow['status'] = 'pending'): SuggestionRow {
  return {
    id,
    relatorio_id: REL,
    target_path: `sheet/${ID}/nameplate/${fieldKey}`,
    value,
    trust: 'suggested',
    mode,
    source: { photo_id: PHOTO, bbox: [0.1, 0.1, 0.4, 0.2], ocr_token_ids: ['t0'], reading_run_id: OP },
    status,
    prompt_version: 'unit-1',
    hint: null,
  };
}

const stateOf = (rows: readonly SuggestionRow[]): EntityState => new Map(rows.map((row) => [entityKey('suggestion', row.id), row])) as EntityState;

function snapshotOf(shown: BlockRow): RelatorioSnapshot {
  return {
    relatorio: { id: REL, status: 'em_campo' },
    blocks: [shown],
    equipment: [],
    locations: [],
    files: [],
    points: [],
    suggestions: [],
    instruments: [],
  } as unknown as RelatorioSnapshot;
}

let counter = 0;
beforeEach(async () => {
  const user = `019966b0-d0a2-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  session.database = openDatabase(user);
});

afterEach(async () => {
  cleanup();
  await session.database?.close();
  session.database = null;
});

/** Draws the nameplate over `shown`; each edit runs its build against `current` (the store's block) and writes batch "b1". */
function draw(shown: BlockRow, current: BlockRow = shown, rows: readonly SuggestionRow[] = []) {
  const built: OpDraft[][] = [];
  const committed: OpDraft[][] = [];
  const api: FichaApi = {
    relatorioId: REL,
    projectId: REL,
    blockId: ID,
    author: AUTHOR,
    commit: vi.fn(async (drafts: OpDraft[]) => {
      committed.push(drafts);
    }),
    edit: vi.fn(async (build: Build) => {
      const ops = build([current], AUTHOR, { blocks: [current], locations: [], equipment: [] });
      if (ops === null) return null;
      built.push(ops);
      return 'b1';
    }),
    undoable: vi.fn(),
    announce: vi.fn(),
  };
  const sync = makeSyncState();
  const ui = (b: BlockRow, state: EntityState) => (
    <SyncContext value={sync}>
      <ToastProvider>
        <NameplateSection
          api={api}
          snapshot={snapshotOf(b)}
          state={state}
          block={b}
          definition={getDefinition('v1', 'cabine_primaria', b.block_type)}
          equipment={[]}
          registries={{ manufacturer: [], voltage_class: [] }}
        />
      </ToastProvider>
    </SyncContext>
  );
  const view = render(ui(shown, stateOf(rows)));
  return { api, built, committed, rerender: (b: BlockRow, next: readonly SuggestionRow[] = rows) => view.rerender(ui(b, stateOf(next))) };
}

const chip = (n: number) => screen.findByRole('button', { name: `Marcar ${n} itens de óleo como NA` });
const noChip = () => expect(screen.queryByRole('button', { name: /itens? de óleo como NA$/ })).toBeNull();
const checklistOps = (ops: readonly OpDraft[]) => ops.filter((op) => op.path.includes('/checklist/'));
/** Lets the flag read and any pending promise settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('r8dry 2026-10-09: no write of the insulation marks an oil item', () => {
  it('the select picked by hand commits the put alone, no undo toast', async () => {
    const { api, committed } = draw(block());
    await userEvent.selectOptions(screen.getByLabelText('Tipo de isolação'), 'EPÓXI');
    await waitFor(() => expect(committed).toHaveLength(1));
    expect(committed[0]!.map((op) => op.path)).toEqual([`sheet/${ID}/nameplate/tipo_de_isolacao`]);
    expect(api.edit).not.toHaveBeenCalled();
    await settle();
    expect(api.undoable).not.toHaveBeenCalled();
  });

  it('"Confirmar" writes the confirm pair alone; its confirmation is the plain one', async () => {
    const pending = suggestion(S_INSULATION, 'tipo_de_isolacao', 'EPÓXI');
    const { api, built, rerender } = draw(block(), block(), [pending]);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerido, EPÓXI, confirmar' }));
    await waitFor(() => expect(built).toHaveLength(1));
    expect(built[0]!).toHaveLength(2);
    expect(checklistOps(built[0]!)).toHaveLength(0);
    rerender(block(insulated('EPÓXI')), [{ ...pending, status: 'confirmed' }]);
    await waitFor(() => expect(api.announce).toHaveBeenCalledWith('Tipo de isolação: EPÓXI — confirmado'));
    expect(api.undoable).not.toHaveBeenCalled();
  });

  it('"Substituir" on a replace line writes the confirm pair alone', async () => {
    const shown = block(insulated('Á SECO'));
    const { api, built } = draw(shown, shown, [suggestion(S_INSULATION, 'tipo_de_isolacao', 'EPÓXI', 'replace')]);
    await userEvent.click(screen.getByRole('button', { name: 'Substituir' }));
    await waitFor(() => expect(built).toHaveLength(1));
    expect(built[0]!).toHaveLength(2);
    expect(checklistOps(built[0]!)).toHaveLength(0);
    await settle();
    expect(api.undoable).not.toHaveBeenCalled();
  });

  it('"Confirmar todos" writes the confirm pairs alone', async () => {
    const { built } = draw(block(), block(), [suggestion(S_INSULATION, 'tipo_de_isolacao', 'Á SECO'), suggestion(S_IDENT, 'identificacao', 'TR-01')]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar todos (2)' }));
    await waitFor(() => expect(built).toHaveLength(1));
    expect(built[0]!).toHaveLength(4);
    expect(checklistOps(built[0]!)).toHaveLength(0);
  });

  it('a dry value typed over the guess writes the put and the discard alone, no undo toast', async () => {
    const { api, built } = draw(block(), block(), [suggestion(S_INSULATION, 'tipo_de_isolacao', 'EPÓXI')]);
    const guess = screen.getByRole('textbox', { name: 'Tipo de isolação' });
    await userEvent.clear(guess);
    await userEvent.type(guess, 'Á SECO{Enter}');
    await waitFor(() => expect(built).toHaveLength(1));
    expect(built[0]!.map((op) => op.path)).toEqual([`sheet/${ID}/nameplate/tipo_de_isolacao`, `suggestion/${S_INSULATION}/status`]);
    await settle();
    expect(api.undoable).not.toHaveBeenCalled();
  });
});

describe('r8dry 2026-10-09: the chip "Marcar N itens de óleo como NA"', () => {
  it.each(['transformador_forca', 'tp', 'tc'] as const)('is offered on %s with a stored dry insulation however written, and not with a subtype', async (type) => {
    draw(block(insulated('EPÓXI'), type));
    expect(await chip(8)).toBeInTheDocument();
    cleanup();
    draw(block(insulated('EPÓXI'), type, 'epoxi'));
    await settle();
    noChip();
  });

  it('counts only the oil items with no value, and is not offered once every one is answered', async () => {
    draw(block(insulated('Á SECO', answered('valvula_de_alivio', 'C'))));
    expect(await chip(7)).toBeInTheDocument();
    cleanup();
    draw(block(insulated('Á SECO', everyOilAnswered())));
    await settle();
    noChip();
  });

  it('its tap marks the oil items the fresh block leaves unanswered, never one answered after the render; then it is gone for good on this device', async () => {
    const shown = block(insulated('EPÓXI'));
    const { api, built } = draw(shown, block(insulated('EPÓXI', answered('valvula_de_alivio', 'NC'))));
    await userEvent.click(await chip(8));
    await waitFor(() => expect(built).toHaveLength(1));
    const ops = built[0]!;
    expect(ops.map((op) => op.path)).toEqual(OIL.slice(1).map((key) => `sheet/${ID}/checklist/${key}/result`));
    for (const op of ops) expect(op.value).toBe('NA');
    await waitFor(() => expect(api.undoable).toHaveBeenCalledWith('7 itens de óleo marcados NA', 'b1'));
    expect(await readOilNaUsed(session.database!, ID)).toBe(true);
    noChip();
    // A remount (a reload) over the same device store: still not offered.
    cleanup();
    draw(shown);
    await settle();
    noChip();
  });

  it('is not offered on a block where this device already used it', async () => {
    await writeOilNaUsed(session.database!, ID, '2026-10-09T12:00:00.000Z');
    draw(block(insulated('EPÓXI')));
    await settle();
    noChip();
  });

  it('goes away when the insulation is cleared, and VOL. ÓLEO is missing again', async () => {
    const volOleo = () => document.querySelector('#ficha-nameplate [data-field-key="vol_oleo"] [data-missing-field]');
    const { rerender } = draw(block(insulated('EPÓXI')));
    expect(await chip(8)).toBeInTheDocument();
    expect(volOleo()).toBeNull();
    rerender(block({ nameplate: { tipo_de_isolacao: cell(null) } }));
    await settle();
    noChip();
    expect(volOleo()).not.toBeNull();
  });
});
