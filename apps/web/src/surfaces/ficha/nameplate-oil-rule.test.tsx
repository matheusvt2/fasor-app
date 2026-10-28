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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { withOilCrossing } from './ficha-ops.ts';
import { NameplateSection } from './nameplate-section.tsx';

/*
 * Story 14.11 (seed v6): the oil rule on the nameplate. The option lists of TIPO DE ISOLAÇÃO and
 * MEIO DE EXTINÇÃO; no "Marcar N itens de óleo como NA" chip; VOL. ÓLEO not missing on a dry unit;
 * and a write of the field that crosses between oil and non-oil, picked or confirmed, carries the
 * kernel's crossing puts in its own batch with the "N itens de óleo apagados" undo toast.
 */

const session: { database: AppDatabase | null; user: null; online: boolean } = { database: null, user: null, online: true };
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const ID = '019966b0-d0b2-7000-8000-000000000001';
const REL = '019966b0-d0b2-7000-8000-000000000002';
const OP = '019966b0-d0b2-7000-8000-000000000003';
const PHOTO = '019966b0-d0b2-7000-8000-000000000004';
const SUGGESTION = '019966b0-d0b2-7000-8000-000000000005';
const AUTHOR = { id: 'u1', companyId: 'c1' };

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function block(sheet: Partial<Sheet> = {}, type: EquipmentBlockType = 'transformador_forca', subtype?: 'a_seco', id = ID): BlockRow {
  return {
    id,
    relatorio_id: REL,
    location_id: null,
    equipment_id: null,
    block_type: type,
    config: defaultBlockConfig('v6', type, subtype === undefined ? {} : { subtype }),
    seed_version: 'v6',
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

/** An oil transformer: an oil item answered C, VOL. ÓLEO typed. */
const oilUnit = () =>
  block({
    nameplate: { tipo_de_isolacao: cell('ÓLEO'), vol_oleo: cell({ raw: '320', unit: 'L', state: 'measured' }) },
    checklist: { termometro: { result: cell('C') }, limpeza: { result: cell('C') } },
  });

const photo = { id: PHOTO, kind: 'photo', block_id: ID, item_key: 'termometro', removed_at: null, reading_target: null };

function snapshotOf(shown: BlockRow, others: readonly BlockRow[] = []): RelatorioSnapshot {
  return {
    relatorio: { id: REL, status: 'em_campo', seed_version: 'v1', export: { scheme: 'ordem_de_campo' } },
    blocks: [shown, ...others],
    equipment: [],
    locations: [],
    files: [photo],
    points: [],
    suggestions: [],
    instruments: [],
  } as unknown as RelatorioSnapshot;
}

function suggestion(value: string, mode: SuggestionRow['mode'] = 'replace'): SuggestionRow {
  return {
    id: SUGGESTION,
    relatorio_id: REL,
    target_path: `sheet/${ID}/nameplate/tipo_de_isolacao`,
    value,
    trust: 'suggested',
    mode,
    source: { photo_id: PHOTO, bbox: [0.1, 0.1, 0.4, 0.2], ocr_token_ids: ['t0'], reading_run_id: OP },
    status: 'pending',
    prompt_version: 'unit-1',
    hint: null,
  };
}

let counter = 0;
beforeEach(async () => {
  const user = `019966b0-d0b2-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  session.database = openDatabase(user);
});

afterEach(async () => {
  cleanup();
  await session.database?.close();
  session.database = null;
});

function draw(shown: BlockRow, rows: readonly SuggestionRow[] = [], others: readonly BlockRow[] = []) {
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
      const ops = build([shown, ...others], AUTHOR, { blocks: [shown, ...others], locations: [], allLocations: [], equipment: [] });
      if (ops === null) return null;
      built.push(ops);
      return 'b1';
    }),
    undoable: vi.fn(),
    announce: vi.fn(),
  };
  const state = new Map(rows.map((row) => [entityKey('suggestion', row.id), row])) as EntityState;
  render(
    <SyncContext value={makeSyncState()}>
      <ToastProvider>
        <NameplateSection
          api={api}
          snapshot={snapshotOf(shown, others)}
          state={state}
          block={shown}
          definition={getDefinition('v6', 'cabine_primaria', shown.block_type)}
          equipment={[]}
          registries={{ manufacturer: [], voltage_class: [] }}
        />
      </ToastProvider>
    </SyncContext>,
  );
  return { api, built, committed };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const options = (label: string) => within(screen.getByLabelText(label)).getAllByRole('option').map((option) => option.textContent);
const CROSSING = [
  `sheet/${ID}/nameplate/tipo_de_isolacao`,
  `sheet/${ID}/checklist/termometro/result`,
  `sheet/${ID}/nameplate/vol_oleo`,
  `file/${PHOTO}/item_key`,
];

describe('14.11 the option lists on seed v6', () => {
  it('TIPO DE ISOLAÇÃO offers EPÓXI, Á SECO and ÓLEO on the transformer, TP and TC; MEIO DE EXTINÇÃO AR to ÓLEO (GVO) on the disjuntor, AR and SF6 on the seccionadora', () => {
    for (const type of ['transformador_forca', 'tp', 'tc'] as const) {
      draw(block({}, type));
      expect(options('Tipo de isolação').slice(-3), type).toEqual(['EPÓXI', 'Á SECO', 'ÓLEO']);
      cleanup();
    }
    draw(block({}, 'disjuntor_mt'));
    expect(options('Meio de extinção').slice(-5)).toEqual(['AR', 'SF6', 'VÁCUO', 'ÓLEO (PVO)', 'ÓLEO (GVO)']);
    cleanup();
    draw(block({}, 'chave_seccionadora'));
    expect(options('Meio de extinção').slice(-2)).toEqual(['AR', 'SF6']);
  });
});

describe('14.11 the oil rule on the nameplate', () => {
  it('a dry unit offers no "Marcar N itens de óleo como NA" chip and VOL. ÓLEO is not missing', async () => {
    draw(block({ nameplate: { tipo_de_isolacao: cell('Á SECO') } }));
    await settle();
    expect(screen.queryByRole('button', { name: /itens? de óleo como NA$/ })).toBeNull();
    expect(document.querySelector('#ficha-nameplate [data-field-key="vol_oleo"] [data-missing-field]')).toBeNull();
  });

  it('QA G1: a dry unit offers no N/A control beside VOL. ÓLEO, Potência nominal keeps its own; an oil unit has it beside VOL. ÓLEO', async () => {
    draw(block({ nameplate: { tipo_de_isolacao: cell('Á SECO') } }));
    await settle();
    expect(screen.queryByRole('button', { name: 'Marcar Vol. óleo como não aplicável' })).toBeNull();
    expect(document.querySelector('#ficha-nameplate [data-field-key="vol_oleo"] .field-na-row')).toBeNull();
    expect(document.querySelector('#ficha-nameplate [data-field-key="potencia_nominal"] .field-na-row')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Marcar Potência nominal como não aplicável' })).toBeTruthy();
    cleanup();
    draw(oilUnit());
    await settle();
    expect(screen.getByRole('button', { name: 'Marcar Vol. óleo como não aplicável' })).toBeTruthy();
    expect(document.querySelector('#ficha-nameplate [data-field-key="vol_oleo"] .field-na-row')).not.toBeNull();
  });

  it('ÓLEO to Á SECO picked by hand: one batch with the item, VOL. ÓLEO and the photo tie, and "Desfazer" on "2 itens de óleo apagados" (the item with its photo, and VOL. ÓLEO)', async () => {
    const { api, built, committed } = draw(oilUnit());
    await userEvent.selectOptions(screen.getByLabelText('Tipo de isolação'), 'Á SECO');
    await waitFor(() => expect(built).toHaveLength(1));
    expect(committed).toEqual([]);
    expect(built[0]!.map((op) => op.path)).toEqual(CROSSING);
    expect(built[0]!.slice(1).every((op) => op.value === null)).toBe(true);
    await waitFor(() => expect(api.undoable).toHaveBeenCalledWith('2 itens de óleo apagados', 'b1'));
  });

  it('a change between two non-oil values clears nothing and shows no toast', async () => {
    const { api, built } = draw(block({ nameplate: { tipo_de_isolacao: cell('EPÓXI') }, checklist: { termometro: { result: cell('C') } } }));
    await userEvent.selectOptions(screen.getByLabelText('Tipo de isolação'), 'Á SECO');
    await waitFor(() => expect(built).toHaveLength(1));
    expect(built[0]!.map((op) => op.path)).toEqual([`sheet/${ID}/nameplate/tipo_de_isolacao`]);
    await settle();
    expect(api.undoable).not.toHaveBeenCalled();
  });

  it('a field outside the rule commits alone through the field path', async () => {
    const { committed, built } = draw(oilUnit());
    await userEvent.type(screen.getByRole('textbox', { name: 'Tipo' }), 'TSE{Enter}');
    await waitFor(() => expect(committed.length).toBeGreaterThan(0));
    expect(committed.flat().every((op) => op.path === `sheet/${ID}/nameplate/tipo`)).toBe(true);
    expect(built).toEqual([]);
  });

  it('"Substituir" a plate reading of Á SECO on an oil unit carries the crossing in the confirm batch', async () => {
    const { built } = draw(oilUnit(), [suggestion('Á SECO')]);
    await userEvent.click(screen.getByRole('button', { name: 'Substituir Tipo de isolação por Á SECO' }));
    await waitFor(() => expect(built).toHaveLength(1));
    const paths = built[0]!.map((op) => op.path);
    expect(paths).toEqual([`suggestion/${SUGGESTION}/status`, ...CROSSING]);
  });

  // A unit whose template subtype is Á SECO, insulation not stored yet: dry by its subtype, an oil item answered C on it.
  const drySubtype = (nameplate: Sheet['nameplate'] = {}) => block({ nameplate, checklist: { termometro: { result: cell('C') } } }, 'transformador_forca', 'a_seco');
  const TERMOMETRO = `sheet/${ID}/checklist/termometro/result`;

  it('"Igual à ⟨TAG⟩?" from an oil sheet onto a dry-subtype unit: the oil item\'s null put is in the copy batch and the copied VOL. ÓLEO appears once', async () => {
    const SOURCE = '019966b0-d0b2-7000-8000-000000000006';
    const source = block(
      { nameplate: { fabricacao: cell('Celtta'), tipo_de_isolacao: cell('ÓLEO'), vol_oleo: cell({ raw: '320', unit: 'L', state: 'measured' }) } },
      'transformador_forca',
      undefined,
      SOURCE,
    );
    const { api, built } = draw(drySubtype(), [], [{ ...source, equipment_id: null }]);
    await userEvent.click(screen.getByRole('button', { name: /^Igual à/ }));
    await waitFor(() => expect(built).toHaveLength(1));
    const ops = built[0]!;
    expect(ops.filter((op) => op.path === TERMOMETRO).map((op) => op.value)).toEqual([null]);
    expect(ops.filter((op) => op.path === `sheet/${ID}/nameplate/vol_oleo`).map((op) => op.value)).toEqual([{ raw: '320', unit: 'L', state: 'measured' }]);
    await waitFor(() => expect(api.undoable).toHaveBeenCalled());
  });

  it('withOilCrossing leaves a path the batch already writes to it: a copied VOL. ÓLEO is never nulled by the crossing', () => {
    const shown = oilUnit();
    const copied = { raw: '410', unit: 'L', state: 'measured' };
    const drafts = [`sheet/${ID}/nameplate/tipo_de_isolacao`, `sheet/${ID}/nameplate/vol_oleo`].map((path, i) => ({
      kind: 'put' as const,
      scope: 'relatorio' as const,
      company_id: AUTHOR.companyId,
      project_id: null,
      relatorio_id: REL,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: AUTHOR.id,
      path,
      value: i === 0 ? 'Á SECO' : copied,
    })) as OpDraft[];
    const built = withOilCrossing(AUTHOR, REL, { blocks: [shown], files: snapshotOf(shown).files }, drafts);
    expect(built.drafts.filter((op) => op.path === `sheet/${ID}/nameplate/vol_oleo`).map((op) => op.value)).toEqual([copied]);
    expect(built.drafts.map((op) => op.path)).toEqual([...drafts.map((op) => op.path), TERMOMETRO, `file/${PHOTO}/item_key`]);
    expect(built.cleared).toBe(1);
  });

  it('"Confirmar todos" with an ÓLEO reading on a dry-subtype unit: the crossing puts are in the batch and the toast offers "Desfazer"', async () => {
    const { api, built } = draw(drySubtype(), [suggestion('ÓLEO', 'fill')]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar todos (1)' }));
    await waitFor(() => expect(built).toHaveLength(1));
    expect(built[0]!.map((op) => op.path)).toEqual([`suggestion/${SUGGESTION}/status`, `sheet/${ID}/nameplate/tipo_de_isolacao`, TERMOMETRO, `file/${PHOTO}/item_key`]);
    await waitFor(() => expect(api.undoable).toHaveBeenCalledWith('1 item de óleo apagado', 'b1'));
  });

  it('ÓLEO typed over a pending reading on a dry-subtype unit: the crossing puts beside the discard op, with the toast', async () => {
    const { api, built } = draw(drySubtype(), [suggestion('Á SECO', 'fill')]);
    const guess = screen.getByRole('textbox', { name: 'Tipo de isolação' });
    await userEvent.clear(guess);
    await userEvent.type(guess, 'ÓLEO{Enter}');
    await waitFor(() => expect(built).toHaveLength(1));
    expect(built[0]!.map((op) => op.path)).toEqual([`sheet/${ID}/nameplate/tipo_de_isolacao`, `suggestion/${SUGGESTION}/status`, TERMOMETRO, `file/${PHOTO}/item_key`]);
    await waitFor(() => expect(api.undoable).toHaveBeenCalledWith('1 item de óleo apagado', 'b1'));
  });
});
