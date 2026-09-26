import { composeConclusion, defaultBlockConfig, emptySheet, getDefinition, type BlockRow, type Cell, type Sheet } from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import type { Build } from '../relatorio/relatorio-editor.ts';
import { ConclusaoSection } from './conclusao-section.tsx';
import type { FichaApi } from './ficha-api.ts';

/*
 * E5-A4 (matrix rows "Stale confirm" and "Fresh confirm"): the conclusion text's
 * "Confirmar" recomposes from the freshest block inside the edit and writes nothing when the
 * basis moved since the render.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const ID = '019966b0-0052-7000-8000-000000000001';
const OP = '019966b0-0052-7000-8000-000000000002';
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const AUTHOR = { id: 'u1', companyId: 'c1' };

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string) => cell({ raw, unit, state: 'measured' });

function block(sheet: Partial<Sheet>): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
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

const pair = { result: cell('aprovado'), restriction: cell('sem_restricoes') };
const readings = (raw: string): Sheet['test'] => ({ isolacao: { cells: { '0': { '0': measured(raw, 'GΩ') } } } });

const announced: string[] = [];

/** `current`: the block the store holds when the edit runs (the build is then run against it). */
function renderSection(shown: BlockRow, current?: BlockRow) {
  const builds: Build[] = [];
  announced.length = 0;
  const api: FichaApi = {
    relatorioId: ID,
    projectId: ID,
    blockId: ID,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async (build: Build) => {
      builds.push(build);
      if (current !== undefined) build([current], AUTHOR, { blocks: [], locations: [], equipment: [] });
      return null;
    }),
    undoable: vi.fn(),
    announce: vi.fn((text: string) => {
      announced.push(text);
    }),
  };
  render(
    <ToastProvider>
      <ConclusaoSection api={api} block={shown} definition={SEC} tag="SEC-C05" className="ficha-step" onFocus={() => undefined} />
    </ToastProvider>,
  );
  return builds;
}

const fresh = { blocks: [], locations: [], equipment: [] };

describe('E5-A4 the conclusion confirm guards its basis', () => {
  it('a fresh confirm writes the text, its status and its basis in one batch', async () => {
    const shown = block({ test: readings('147'), conclusion: pair });
    const builds = renderSection(shown);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(builds).toHaveLength(1);
    const ops = builds[0]!([shown], AUTHOR, fresh) ?? [];
    const composed = composeConclusion(shown, SEC, 'SEC-C05');
    expect(ops.map((op) => [op.path.split('/').slice(-1)[0], op.value])).toEqual([
      ['text', composed.text],
      ['text_status', 'confirmed'],
      ['text_basis', composed.basis],
    ]);
  });

  it('a confirm whose block changed since the render writes nothing', async () => {
    const shown = block({ test: readings('147'), conclusion: pair });
    const builds = renderSection(shown);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    const changed = block({ test: readings('148'), conclusion: pair });
    expect(builds[0]!([changed], AUTHOR, fresh)).toBeNull();
  });

  it('carry-over F: a stale "Confirmar" says "O texto mudou; confira e confirme de novo" in the live region; a fresh one says nothing', async () => {
    const shown = block({ test: readings('147'), conclusion: pair });
    renderSection(shown, block({ test: readings('148'), conclusion: pair }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(announced).toEqual(['O texto mudou; confira e confirme de novo']));
    cleanup();
    renderSection(shown, shown);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(announced).toEqual([]);
  });
});
