import 'fake-indexeddb/auto';
import {
  companyBlockType,
  duplicateSeededType,
  entityKey,
  EMPTY_DEFINITION_CONTEXT,
  paletteTypeGroups,
  SEED_VERSION,
  standardTemplate,
  updateDraftFieldRefusal,
  VECTOR_GROUP_FIELD,
  type CompanyTypeDefinition,
  type CompanyTypeDraft,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
} from '@app/domain';
import { DEFINITION_1 } from '@app/domain/fixtures/company-types';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { COMPANY_STREAM, openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { TemplateComposerSurface } from './template-composer.tsx';
import { TemplatesSurface } from './templates-surface.tsx';
import { CriteriaPanel, NameplatePanel, type DraftEdit } from './type-editor-parts.tsx';

/*
 * Batch e24c (Stories 24.18 to 24.20), web units: the Critérios row of "nominal ± %" (the rule, the
 * two inputs, the kernel's text; back to "entre"); the Placa tab's refusal of a change of the
 * vector-group field (Story 24.20); the type list's hidden line and the composer's palette with a
 * published copy of the transformer (Story 24.19).
 */

configure({ asyncUtilTimeout: 5000 });

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const TEMPLATE_ID = '019966b0-0e24-7000-8000-000000000001';
const TYPE_ID = '019966b0-0e24-7000-8000-000000000002';
const VERSION_ID = '019966b0-0e24-7000-8000-000000000003';

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  settled: true,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

afterEach(async () => {
  cleanup();
  await database?.delete();
  database = null;
});

// --- the editor's tabs, over a draft held in memory ---------------------------------------------------

function Harness({ start, panel, onDraft }: { start: CompanyTypeDraft; panel: 'criteria' | 'nameplate'; onDraft: (draft: CompanyTypeDraft | null) => void }) {
  const latest = useRef<CompanyTypeDraft | null>(structuredClone(start));
  const [draft, setDraft] = useState(latest.current);
  const edit: DraftEdit = (change) => {
    latest.current = change(latest.current);
    onDraft(latest.current);
    setDraft(latest.current);
  };
  return (
    <ToastProvider>
      {panel === 'criteria' ? <CriteriaPanel draft={draft} issues={[]} edit={edit} /> : <NameplatePanel draft={draft} issues={[]} edit={edit} />}
      <ToastOutlet />
    </ToastProvider>
  );
}

function renderTab(start: CompanyTypeDraft, panel: 'criteria' | 'nameplate') {
  let last: CompanyTypeDraft | null = null;
  const writes: CompanyTypeDraft[] = [];
  render(
    <Harness
      start={start}
      panel={panel}
      onDraft={(draft) => {
        last = draft;
        if (draft !== null) writes.push(draft);
      }}
    />,
  );
  return { last: () => last, writes };
}

describe('24.18 the Critérios row of "nominal ± %"', () => {
  const name = 'Tensão de saída';
  it('offers the rule after "entre", takes 220 and 5 in its two inputs and shows the kernel\'s text; back to "entre" asks for the maximum', async () => {
    const at = DEFINITION_1.criteria.findIndex((criterion) => criterion.key === 'tensao_saida');
    const { last } = renderTab(structuredClone(DEFINITION_1) as unknown as CompanyTypeDraft, 'criteria');
    const rule = screen.getByRole('combobox', { name: `Regra de ${name}` });
    expect([...rule.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['maior que', 'menor que', 'maior ou igual a', 'menor ou igual a', 'entre', 'nominal ± %']);
    expect(screen.getByText(/^Regras: /)).toHaveTextContent('Regras: maior que · menor que · maior ou igual a · menor ou igual a · entre · nominal ± % · ± · aprovado ou reprovado.');
    await userEvent.selectOptions(rule, 'nominal ± %');
    expect(last()!.criteria![at]).toMatchObject({ operator: 'nominal_pct', value: 118 });
    const row = screen.getByRole('combobox', { name: `Regra de ${name}` }).closest('tr')!;
    expect(row.querySelector('.tipo-nominal')).not.toBeNull();
    expect(within(row).getByText('Valor nominal')).toHaveClass('field-label');
    expect(within(row).getByText('Tolerância (%)')).toHaveClass('field-label');
    const nominal = within(row).getByRole('textbox', { name: `Valor nominal de ${name}` });
    await userEvent.clear(nominal);
    await userEvent.type(nominal, '220');
    await userEvent.tab();
    await userEvent.type(within(row).getByRole('textbox', { name: `Tolerância (%) de ${name}` }), '5');
    await userEvent.tab();
    expect(last()!.criteria![at]).toMatchObject({ operator: 'nominal_pct', value: 220, tolerance_pct: 5 });
    expect(row.querySelector('.nominal-text')).toHaveTextContent('220 Vcc ±5 %');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: `Regra de ${name}` }), 'entre');
    expect(last()!.criteria![at]).toMatchObject({ operator: 'between', value: 220 });
    expect(last()!.criteria![at]).not.toHaveProperty('tolerance_pct');
    expect(last()!.criteria![at]).not.toHaveProperty('value_max');
    expect(within(row).getByRole('textbox', { name: `Valor máximo de ${name}` })).toHaveValue('');
    expect(row.querySelector('.tipo-nominal')).toBeNull();
  });
});

describe('24.20 the Placa tab refuses a change of the vector-group field', () => {
  const copy = duplicateSeededType(SEED_VERSION, 'transformador_forca').draft as CompanyTypeDraft;
  const field = copy.nameplate!.find((entry) => entry.key === VECTOR_GROUP_FIELD)!;
  const index = copy.nameplate!.indexOf(field);

  it('a kind change shows the kernel\'s toast and writes nothing; the label still changes', async () => {
    const { writes, last } = renderTab(copy, 'nameplate');
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${field.label!}`) }));
    const kind = screen.getByRole('combobox', { name: 'Tipo do campo' });
    await userEvent.selectOptions(kind, 'Texto');
    const refusal = updateDraftFieldRefusal(copy, index, { kind: 'text' })!;
    expect(await screen.findByTestId('toast')).toHaveTextContent(refusal);
    expect(writes).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: 'Tipo do campo' })).toHaveValue('select');
    // Removing one option is refused the same way.
    await userEvent.click(screen.getByRole('button', { name: `Remover opção ${field.options![0]!}` }));
    expect(writes).toHaveLength(0);
    expect(screen.getByRole('button', { name: `Remover opção ${field.options![0]!}` })).toBeVisible();
    const label = screen.getByRole('textbox', { name: 'Rótulo' });
    await userEvent.clear(label);
    await userEvent.type(label, 'GRUPO DE LIGAÇÃO');
    await userEvent.tab();
    await waitFor(() => expect(last()!.nameplate![index]).toMatchObject({ label: 'GRUPO DE LIGAÇÃO', kind: 'select', options: field.options }));
  });
});

// --- the type list and the composer, over a device database holding a published copy -------------------

const trCopy: CompanyTypeDefinition = { ...duplicateSeededType(SEED_VERSION, 'transformador_forca').draft, label: 'Transformador de força — base 2026' };

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0e24-7000-8000-${(++counter + 100).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  await fresh.sync_state.put({ id: COMPANY_STREAM, cursor_seq: 1, complete: true, files_pending: 0, downloaded_at: '2026-11-11T12:00:00.000Z', last_sync_at: '2026-11-11T12:00:00.000Z', last_push_at: [], relatorios: [] });
  const type: EquipmentTypeRow = { id: TYPE_ID, derived_from: { seed_version: SEED_VERSION, block_type: 'transformador_forca' }, draft: null, retired_at: null, removed_at: null, latest_version: 1 };
  const version: EquipmentTypeVersionRow = { id: VERSION_ID, type_id: TYPE_ID, version: 1, definition: trCopy, published_by: USER, published_at: '2026-11-11T12:00:00.000Z' };
  await fresh.entities.bulkPut([toRecord(entityKey('equipment_type', TYPE_ID), type), toRecord(entityKey('equipment_type_version', VERSION_ID), version), toRecord(entityKey('template', TEMPLATE_ID), standardTemplate({ id: TEMPLATE_ID }))]);
  return fresh;
}

describe('24.19 a published copy hides its original', () => {
  it('the type list keeps the library transformer with the line saying it is hidden, and the note says so', async () => {
    database = await freshDb();
    render(
      <MemoryRouter initialEntries={['/templates']}>
        <ToastProvider>
          <Routes>
            <Route path="/templates" element={<TemplatesSurface />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );
    const library = await screen.findByRole('list', { name: /^Da biblioteca/ });
    const row = library.querySelector<HTMLElement>('[data-block-type="transformador_forca"]')!;
    await waitFor(() => expect(row.querySelector('[data-hidden-type]')).toHaveTextContent(`Oculto nas paletas: a cópia ${trCopy.label} está publicada.`));
    expect(row.querySelector('[data-hidden-type]')).toHaveClass('rr-secondary');
    expect(library.querySelectorAll('[data-hidden-type]')).toHaveLength(1);
    expect(screen.getByText(/^Para renomear um tipo da biblioteca/)).toHaveTextContent('Enquanto a cópia estiver publicada, o tipo da biblioteca sai das paletas.');
  });

  it('the composer\'s palette lists the copy where the transformer stood, marked "Tipo da empresa", and not the transformer', async () => {
    database = await freshDb();
    render(
      <MemoryRouter initialEntries={[`/templates/${TEMPLATE_ID}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/templates/:id" element={<TemplateComposerSurface />} />
          </Routes>
          <ToastOutlet />
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /^Coluna 9/ }));
    const palette = screen.getByRole('complementary', { name: 'Paleta de blocos' });
    const names = () => [...palette.querySelectorAll<HTMLElement>('.palette-item.is-stepper .pi-text > span:first-child')].map((span) => span.textContent);
    await waitFor(() => expect(names()).toContain(trCopy.label));
    const before = paletteTypeGroups(SEED_VERSION, EMPTY_DEFINITION_CONTEXT).flatMap((group) => group.types);
    expect(names()).toHaveLength(before.length);
    const at = before.indexOf('transformador_forca');
    expect(names()[at]).toBe(trCopy.label);
    expect(names()).not.toContain('Transformador de força');
    const row = [...palette.querySelectorAll<HTMLElement>('.palette-item.is-stepper')][at]!;
    expect(row.querySelector('.pi-meta')!.textContent).toMatch(/^Tipo da empresa · /);
    expect(companyBlockType(TYPE_ID)).toBe(`type:${TYPE_ID}`);
  });
});
