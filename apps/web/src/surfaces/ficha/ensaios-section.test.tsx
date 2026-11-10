import {
  EMPTY_DEFINITION_CONTEXT,
  getDefinition,
  newEquipmentBlock,
  NO_VISIT_CONTEXT,
  type BlockDefinition,
  type BlockRow,
  type Cell,
  type EntityState,
  type JsonValue,
  type RelatorioSnapshot,
} from '@app/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { FichaApi } from './ficha-api.ts';
import { EnsaiosSection } from './ensaios-section.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Epic 23 QA (deferred row of batch e23h, "seeded-grammar NA head"): "Como ensaiar" on the head of
 * a seeded-grammar test the nameplate makes not applicable (`EnsaiosSection` draws it as
 * `NotApplicableTest` with `headEnd`, EXPERIENCE.md "Como ensaiar"). No seeded v13 test of the
 * seeded grammar carries a condition, so the definition is the v13 seccionadora with an invented one
 * (CORRENTE NOMINAL above 1.000 A) on both seeded tests, and synthetic help (M-1) on the insulation
 * only; the plate says 630 A. The applicability and its reason are the kernel's
 * (`sheetTestSections`); the test checks that the surface draws them with the action.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));

afterEach(cleanup);

const id = (n: number) => `019966b0-0146-7000-8000-${n.toString(16).padStart(12, '0')}`;
const BLOCK = id(1);
const RELATORIO = id(4);
const OP = id(9);
const AUTHOR = { id: 'u1', companyId: 'c1' };
const SECCIONADORA = getDefinition('v13', 'cabine_primaria', 'chave_seccionadora');
const HELP = { objective: 'Objetivo de exemplo.', procedure: 'Passos de exemplo.' };
const ABOVE = { op: 'above' as const, field: 'corrente_nominal', value: 1000, unmet: 'de até 1.000 A' };

/** The v13 seccionadora with the invented condition on both seeded tests, help on those named. */
function definitionWith(helped: readonly string[]): BlockDefinition {
  return {
    ...SECCIONADORA,
    tests: SECCIONADORA.tests.map((test) => ({ ...test, applies_when: ABOVE, ...(helped.includes(test.key) ? { help: HELP } : {}) })),
  } as BlockDefinition;
}

const stored = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: OP });

/** A v13 seccionadora sheet whose plate says CORRENTE NOMINAL 630 A. */
function sheet(): BlockRow {
  const { block } = newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: BLOCK, equipmentId: id(2), relatorioId: RELATORIO, projectId: id(5), locationId: id(3), type: 'chave_seccionadora', tag: 'SEC-1', seedVersion: 'v13', orderKey: 'a0' });
  return { ...block, sheet: { ...block.sheet, nameplate: { ...block.sheet.nameplate, corrente_nominal: stored({ raw: '630', unit: 'A', state: 'measured' }) } } };
}

function renderSection(definition: BlockDefinition) {
  const block = sheet();
  const api: FichaApi = {
    relatorioId: RELATORIO,
    projectId: id(5),
    blockId: BLOCK,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async () => null),
    undoable: vi.fn(),
    announce: vi.fn(),
  };
  const snapshot = {
    relatorio: { id: RELATORIO, seed_version: 'v13', setup: { service_end: null, instrument_ids: [] }, export: { scheme: 'ordem_de_campo' } },
    blocks: [block],
    equipment: [],
    locations: [],
    files: [],
    points: [],
    suggestions: [],
  } as unknown as RelatorioSnapshot;
  const targetFor = (testKey: string): CaptureTarget => ({ blockId: BLOCK, itemKey: testKey, caption: null }) as unknown as CaptureTarget;
  return render(
    <MemoryRouter>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <EnsaiosSection
            api={api}
            state={new Map() as EntityState}
            snapshot={snapshot}
            block={block}
            definition={definition}
            instruments={[]}
            className="ficha-step"
            onFocus={() => undefined}
            primaryId="ficha-primary"
            targetFor={targetFor}
            visit={NO_VISIT_CONTEXT}
          />
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

const section = (container: HTMLElement, testKey: string) => container.querySelector<HTMLElement>(`section[data-test-key="${testKey}"]`)!;

describe('Epic 23 QA: "Como ensaiar" on the head of a seeded-grammar test the nameplate makes not applicable', () => {
  it('the NA test with help keeps the action on its head beside the NA pill, and the band says the kernel\'s reason', () => {
    const { container } = renderSection(definitionWith(['isolacao']));
    const isolacao = section(container, 'isolacao');
    expect(isolacao).toHaveAttribute('data-applicability', 'na');
    expect(isolacao).toHaveClass('v13-na');
    const head = isolacao.querySelector<HTMLElement>('.section-head')!;
    expect(head.querySelector('.v13-na-pill')).toHaveTextContent('Não se aplica');
    expect(within(head).getByRole('button', { name: 'Como ensaiar' })).toBeVisible();
    expect(isolacao.querySelector('.v13-na-band')).toHaveTextContent('Não se aplica: CORRENTE NOMINAL de até 1.000 A.');
    // NA: no instrument picker, no table.
    expect(isolacao.querySelector('table')).toBeNull();
    expect(within(isolacao).queryByRole('button', { name: /^Instrumento/ })).toBeNull();
  });

  it('pressing it opens the read-only dialog named by the test\'s title, with only the filled headings', async () => {
    const { container } = renderSection(definitionWith(['isolacao']));
    const isolacao = section(container, 'isolacao');
    const title = isolacao.querySelector('h2')!.textContent!;
    await userEvent.click(within(isolacao.querySelector<HTMLElement>('.section-head')!).getByRole('button', { name: 'Como ensaiar' }));
    const dialog = screen.getByRole('dialog', { name: title });
    expect([...dialog.querySelectorAll('.como-list dt')].map((dt) => dt.textContent)).toEqual(['Objetivo', 'Procedimento']);
  });

  it('an NA test without help draws no action on its head', () => {
    const { container } = renderSection(definitionWith(['isolacao']));
    const contato = section(container, 'resistencia_contato');
    expect(contato).toHaveAttribute('data-applicability', 'na');
    expect(within(contato).queryByRole('button', { name: 'Como ensaiar' })).toBeNull();
  });
});
