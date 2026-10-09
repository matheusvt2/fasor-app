import {
  defaultBlockConfig,
  emptySheet,
  entityKey,
  getDefinition,
  type BlockRow,
  type Cell,
  type EntityState,
  type OpDraft,
  type RelatorioSnapshot,
  type Sheet,
  type SuggestionRow,
} from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { NameplateSection } from './nameplate-section.tsx';

/*
 * Review 2026-10-08, Decision 2 (r8dry): the oil items a dry TIPO DE ISOLAÇÃO marks NA are
 * read from the fresh block the edit hands its build, never the block the sheet drew: an item
 * answered after the render is never written. A write that marks nothing raises no
 * "itens de óleo" undo toast.
 */

vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const ID = '019966b0-d0a2-7000-8000-000000000001';
const REL = '019966b0-d0a2-7000-8000-000000000002';
const OP = '019966b0-d0a2-7000-8000-000000000003';
const PHOTO = '019966b0-d0a2-7000-8000-000000000004';
const S_INSULATION = '019966b0-d0a2-7000-8000-000000000005';
const S_IDENT = '019966b0-d0a2-7000-8000-000000000006';
const AUTHOR = { id: 'u1', companyId: 'c1' };
const TF = getDefinition('v1', 'cabine_primaria', 'transformador_forca');
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

function block(sheet: Partial<Sheet> = {}): BlockRow {
  return {
    id: ID,
    relatorio_id: REL,
    location_id: null,
    equipment_id: null,
    block_type: 'transformador_forca',
    config: defaultBlockConfig('v1', 'transformador_forca'),
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

/** The store's block when the edit runs: `valvula_de_alivio` answered after the render. */
const answeredAfterRender = (value: 'C' | 'NC') => block({ checklist: { valvula_de_alivio: { result: cell(value) } } });
const everyOilAnswered = () => block({ checklist: Object.fromEntries(OIL.map((key) => [key, { result: cell('C') }])) });

function suggestion(id: string, fieldKey: string, value: string, status: SuggestionRow['status'] = 'pending'): SuggestionRow {
  return {
    id,
    relatorio_id: REL,
    target_path: `sheet/${ID}/nameplate/${fieldKey}`,
    value,
    trust: 'suggested',
    mode: 'fill',
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

afterEach(() => cleanup());

/** Draws the nameplate over `shown`; the edit runs its build against `current` (the store's block) and writes batch "b1". */
function draw(shown: BlockRow, current: BlockRow, rows: readonly SuggestionRow[] = []) {
  const built: OpDraft[][] = [];
  const api: FichaApi = {
    relatorioId: REL,
    projectId: REL,
    blockId: ID,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
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
  const ui = (state: EntityState) => (
    <SyncContext value={sync}>
      <ToastProvider>
        <NameplateSection
          api={api}
          snapshot={snapshotOf(shown)}
          state={state}
          block={shown}
          definition={TF}
          equipment={[]}
          registries={{ manufacturer: [], voltage_class: [] }}
        />
      </ToastProvider>
    </SyncContext>
  );
  const view = render(ui(stateOf(rows)));
  return { api, built, rerender: (next: readonly SuggestionRow[]) => view.rerender(ui(stateOf(next))) };
}

const paths = (ops: readonly OpDraft[]) => ops.map((op) => op.path);
const marksOf = (ops: readonly OpDraft[]) => ops.filter((op) => op.path.includes('/checklist/'));

describe('r8dry: the oil marks read the fresh block of the edit', () => {
  it.each(['C', 'NC'] as const)('the select picked by hand never writes over an item answered %s after the render', async (value) => {
    const { api, built } = draw(block(), answeredAfterRender(value));
    await userEvent.selectOptions(screen.getByLabelText('Tipo de isolação'), 'EPÓXI');
    await waitFor(() => expect(built).toHaveLength(1));
    const ops = built[0]!;
    expect(paths(ops)).not.toContain(`sheet/${ID}/checklist/valvula_de_alivio/result`);
    expect(marksOf(ops).map((op) => op.path)).toEqual(OIL.slice(1).map((key) => `sheet/${ID}/checklist/${key}/result`));
    expect(ops.find((op) => op.path === `sheet/${ID}/nameplate/tipo_de_isolacao`)?.value).toBe('EPÓXI');
    await waitFor(() => expect(api.undoable).toHaveBeenCalledWith('7 itens de óleo marcados NA', 'b1'));
  });

  it('"Confirmar" never writes over an item answered after the render; its drawn confirmation names the seven marks with "Desfazer"', async () => {
    const pending = suggestion(S_INSULATION, 'tipo_de_isolacao', 'EPÓXI');
    const { api, built, rerender } = draw(block(), answeredAfterRender('C'), [pending]);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerido, EPÓXI, confirmar' }));
    await waitFor(() => expect(built).toHaveLength(1));
    const ops = built[0]!;
    expect(paths(ops)).not.toContain(`sheet/${ID}/checklist/valvula_de_alivio/result`);
    expect(marksOf(ops)).toHaveLength(7);
    expect(ops).toHaveLength(2 + 7);
    // Drawn confirmed (no longer pending): said with "Desfazer".
    rerender([{ ...pending, status: 'confirmed' }]);
    await waitFor(() => expect(api.undoable).toHaveBeenCalledWith('Tipo de isolação: EPÓXI — confirmado · 7 itens de óleo marcados NA', 'b1'));
  });

  it('"Confirmar todos" reads the fresh block too', async () => {
    const rows = [suggestion(S_INSULATION, 'tipo_de_isolacao', 'Á SECO'), suggestion(S_IDENT, 'identificacao', 'TR-01')];
    const { built } = draw(block(), answeredAfterRender('NC'), rows);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar todos (2)' }));
    await waitFor(() => expect(built).toHaveLength(1));
    expect(paths(built[0]!)).not.toContain(`sheet/${ID}/checklist/valvula_de_alivio/result`);
    expect(marksOf(built[0]!)).toHaveLength(7);
  });
});

describe('r8dry: nothing marked, no "itens de óleo" toast', () => {
  it('a dry "Confirmar" with every oil item answered writes the confirm pair alone and a plain toast', async () => {
    const pending = suggestion(S_INSULATION, 'tipo_de_isolacao', 'EPÓXI');
    const { api, built, rerender } = draw(block(), everyOilAnswered(), [pending]);
    await userEvent.click(screen.getByRole('button', { name: 'Sugerido, EPÓXI, confirmar' }));
    await waitFor(() => expect(built).toHaveLength(1));
    expect(built[0]!).toHaveLength(2);
    rerender([{ ...pending, status: 'confirmed' }]);
    await waitFor(() => expect(api.announce).toHaveBeenCalledWith('Tipo de isolação: EPÓXI — confirmado'));
    expect(api.undoable).not.toHaveBeenCalled();
  });

  it('a dry pick by hand with every oil item answered writes the put alone, no undo toast', async () => {
    const { api, built } = draw(block(), everyOilAnswered());
    await userEvent.selectOptions(screen.getByLabelText('Tipo de isolação'), 'Á SECO');
    await waitFor(() => expect(built).toHaveLength(1));
    expect(paths(built[0]!)).toEqual([`sheet/${ID}/nameplate/tipo_de_isolacao`]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.undoable).not.toHaveBeenCalled();
  });

  it('a value typed over a suggestion on another field writes the put and the discard, no undo toast', async () => {
    const { api, built } = draw(block(), block(), [suggestion(S_IDENT, 'identificacao', 'TR-01')]);
    const guess = screen.getByRole('textbox', { name: 'Identificação' });
    await userEvent.clear(guess);
    await userEvent.type(guess, 'TR-02{Enter}');
    await waitFor(() => expect(built).toHaveLength(1));
    expect(paths(built[0]!)).toEqual([`sheet/${ID}/nameplate/identificacao`, `suggestion/${S_IDENT}/status`]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.undoable).not.toHaveBeenCalled();
  });
});
