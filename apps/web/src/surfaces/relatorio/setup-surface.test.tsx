import 'fake-indexeddb/auto';
import type { RelatorioRow, UserRow } from '@app/domain';
import { INSTRUMENT_MEGOHMETRO_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { SetupSurface } from './setup-surface.tsx';

/*
 * Story 4.2: the five Etapa bands over the small Porto Seguro fixture, plus the
 * "Concluir dados do relatório" completeness gate and the instrument-referenced refusal.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;

let database: AppDatabase | null = null;
let counter = 0;

const RESPONSIBLE: UserRow = {
  id: USER,
  name: 'Bento Braga',
  email: 'b@teste.local',
  council: 'crea',
  registration_number: 'SP 5063583141',
  title: 'Eng. Eletricista',
  photo_location_enabled: false,
};

const OTHER_ID = '019966c1-000f-7000-8000-999999999999';
const OTHER_RESPONSIBLE: UserRow = {
  id: OTHER_ID,
  name: 'Carla Nunes',
  email: 'c@teste.local',
  council: 'crt',
  registration_number: 'SP 987654',
  title: 'Técnica em Eletrotécnica',
  photo_location_enabled: false,
};

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: RESPONSIBLE.name, email: RESPONSIBLE.email, companyId: COMPANY, companyName: 'Empresa B de Teste', council: 'crea', registrationNumber: RESPONSIBLE.registration_number, title: RESPONSIBLE.title },
  online: true,
  reAuthRequired: false,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

async function freshDb(): Promise<AppDatabase> {
  const user = `019966c1-000f-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

async function seeded(): Promise<AppDatabase> {
  const db = await freshDb();
  await applyPulled(db, portoSeguroSmall.log);
  await db.entities.put(toRecord(`user:${USER}`, RESPONSIBLE));
  return db;
}

function tree(id: string) {
  return (
    <MemoryRouter initialEntries={[`/relatorio/${id}/setup`]}>
      <ToastProvider>
        <Routes>
          <Route path="/relatorio/:id/setup" element={<SetupSurface />} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>
  );
}

function renderSetup(id = RELATORIO) {
  return render(tree(id));
}

afterEach(() => {
  database?.close();
  database = null;
});

describe('4.2 SetupSurface', () => {
  it('renders the five Etapa bands and the placeholder band, with no violations', async () => {
    database = await seeded();
    const { container } = renderSetup();
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' })).toBeVisible());
    expect(screen.getByRole('heading', { level: 2, name: 'Etapa 2 — Objetivo e escopo' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Etapa 3 — Responsável' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Etapa 4 — Instrumentos e certificados' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Etapa 5 — Local' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Conclusão e parecer' })).toBeVisible();
    expect(screen.getByText('Disponível na próxima etapa deste épico')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('autosaves Etapa 1 "Informações adicionais" as one relatorio/setup/additional_info op', async () => {
    database = await seeded();
    renderSetup();
    const field = await screen.findByRole('textbox', { name: 'Informações adicionais' });
    await userEvent.type(field, 'Manutenção preventiva');
    await userEvent.tab();
    await waitFor(async () => {
      const row = await database!.entities.get(['relatorio', RELATORIO]);
      expect((row!.row as RelatorioRow).setup.additional_info).toBe('Manutenção preventiva');
    });
  });

  it('refuses to uncheck an instrument a sheet still references, with an inline note', async () => {
    database = await seeded();
    renderSetup();
    const row = await screen.findByText('2E');
    const checkbox = row.closest('button')!;
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    // The fixture's instrument_ids starts empty; check it first so there is something to uncheck.
    await userEvent.click(checkbox);
    await waitFor(async () => {
      const relatorio = await database!.entities.get(['relatorio', RELATORIO]);
      expect((relatorio!.row as RelatorioRow).setup.instrument_ids).toContain(INSTRUMENT_MEGOHMETRO_ID);
    });
    await userEvent.click(checkbox);
    expect(await screen.findByText('Continua na seção 11 porque uma ficha usa este instrumento')).toBeVisible();
    const relatorio = await database!.entities.get(['relatorio', RELATORIO]);
    expect((relatorio!.row as RelatorioRow).setup.instrument_ids).toContain(INSTRUMENT_MEGOHMETRO_ID);
  });

  it('"Concluir dados do relatório" is aria-disabled while a gap remains (service_end, this fixture)', async () => {
    database = await seeded();
    const relatorioRecord = await database.entities.get(['relatorio', RELATORIO]);
    await database.entities.put({ ...relatorioRecord!, row: { ...(relatorioRecord!.row as RelatorioRow), status: 'rascunho' } });
    renderSetup();
    const button = await screen.findByRole('button', { name: 'Concluir dados do relatório' });
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled'));
    expect(screen.getByText('Concluir dados do relatório: falta a data de fim')).toBeVisible();
  });

  it('commits the Rascunho→Em campo transition once every gap is closed', async () => {
    database = await seeded();
    const relatorioRecord = await database.entities.get(['relatorio', RELATORIO]);
    await database.entities.put({
      ...relatorioRecord!,
      row: {
        ...(relatorioRecord!.row as RelatorioRow),
        status: 'rascunho',
        setup: { ...(relatorioRecord!.row as RelatorioRow).setup, service_end: '2026-09-08', art_trt_number: '2620262602583', instrument_ids: [INSTRUMENT_MEGOHMETRO_ID] },
      },
    });
    renderSetup();
    const button = await screen.findByRole('button', { name: 'Concluir dados do relatório' });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(button);
    await waitFor(async () => {
      const row = await database!.entities.get(['relatorio', RELATORIO]);
      expect((row!.row as RelatorioRow).status).toBe('em_campo');
    });
  });

  it('the Combobox shows the already-picked responsible\'s name once users resolve, not blank', async () => {
    // The fixture's relatório already names USER (the session user) as responsible; `users`
    // starts empty (`useLiveQuery`) and only resolves after mount.
    database = await seeded();
    renderSetup();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Responsável técnico' })).toHaveValue('Bento Braga'));
  });

  it('the ART/TRT label and echo text follow the council of whichever responsible is picked', async () => {
    database = await seeded();
    await database.entities.put(toRecord(`user:${OTHER_ID}`, OTHER_RESPONSIBLE));
    renderSetup();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Responsável técnico' })).toHaveValue('Bento Braga'));
    expect(screen.getByRole('textbox', { name: 'ART' })).toBeVisible();

    const combobox = screen.getByRole('combobox', { name: 'Responsável técnico' });
    await userEvent.clear(combobox);
    await userEvent.type(combobox, 'Carla');
    await userEvent.click(await screen.findByRole('option', { name: 'Carla Nunes' }));

    await waitFor(async () => {
      const row = await database!.entities.get(['relatorio', RELATORIO]);
      expect((row!.row as RelatorioRow).setup.responsible_user_id).toBe(OTHER_ID);
    });
    expect(screen.getByRole('textbox', { name: 'TRT' })).toBeVisible();
    await userEvent.type(screen.getByRole('textbox', { name: 'TRT' }), '123');
    await waitFor(() => expect(screen.getByText(/Na seção 10: "Este relatório tem validade apenas acompanhada da TRT/)).toBeVisible());
  });

  it('shows the altitude as "N m" for a value at or above 1000 m, before and after confirming', async () => {
    database = await seeded();
    const relatorioRecord = await database.entities.get(['relatorio', RELATORIO]);
    await database.entities.put({
      ...relatorioRecord!,
      row: { ...(relatorioRecord!.row as RelatorioRow), setup: { ...(relatorioRecord!.row as RelatorioRow).setup, site_altitude_m: 1200 } },
    });
    renderSetup();
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Altitude do site' })).toHaveValue(1200));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByText('Altitude do site: 1200 m — confirmada')).toBeVisible());
  });

  it('committing an exclusion edit writes the whole array to the relatório row', async () => {
    database = await seeded();
    renderSetup();
    const first = await screen.findByRole('textbox', { name: 'Exclusão 1' });
    await userEvent.clear(first);
    await userEvent.type(first, 'Item alterado');
    await userEvent.tab();
    await waitFor(async () => {
      const row = await database!.entities.get(['relatorio', RELATORIO]);
      expect((row!.row as RelatorioRow).setup.exclusions?.[0]).toBe('Item alterado');
    });
  });

  it('?etapa= scrolls to and focuses the named band\'s heading, once on mount', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    database = await seeded();
    render(
      <MemoryRouter initialEntries={[`/relatorio/${RELATORIO}/setup?etapa=3`]}>
        <ToastProvider>
          <Routes>
            <Route path="/relatorio/:id/setup" element={<SetupSurface />} />
          </Routes>
          <ToastOutlet />
        </ToastProvider>
      </MemoryRouter>,
    );
    const heading = await screen.findByRole('heading', { level: 2, name: 'Etapa 3 — Responsável' });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.instances[0]).toBe(heading.closest('.section-band'));
    expect(heading).toHaveFocus();
    // @ts-expect-error jsdom's Element has no scrollIntoView; the mock above added it.
    delete Element.prototype.scrollIntoView;
  });
});
