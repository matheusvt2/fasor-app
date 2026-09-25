import 'fake-indexeddb/auto';
import type { RelatorioRow, UserRow } from '@app/domain';
import { INSTRUMENT_MEGOHMETRO_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { I18nProvider } from 'react-aria-components';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
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

/** Where a press navigated, with the navigation state it carried (Story 12.2). */
function Probe({ testId }: { testId: string }) {
  const location = useLocation();
  return <p data-testid={testId}>{`${location.pathname}${location.search} ${JSON.stringify(location.state)}`}</p>;
}

function tree(id: string) {
  return (
    // pt-BR orders the DateField segments day/month/year, as `app.tsx`'s own root
    // `I18nProvider` does for the real app; without it jsdom's default locale would
    // order them month/day/year, and the date-typing tests below would type into the
    // wrong segment.
    <I18nProvider locale="pt-BR">
      <MemoryRouter initialEntries={[`/relatorio/${id}/setup`]}>
        <ToastProvider>
          <Routes>
            <Route path="/relatorio/:id/setup" element={<SetupSurface />} />
            <Route path="/relatorio/:id" element={<Probe testId="sumario-route" />} />
            <Route path="/cadastros" element={<Probe testId="cadastros-route" />} />
          </Routes>
          <ToastOutlet />
        </ToastProvider>
      </MemoryRouter>
    </I18nProvider>
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
    expect(screen.getByText('Disponível em uma próxima etapa')).toBeVisible();
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

  it('typing a date at keyboard speed stores the full year, not a truncated one (review finding 1)', async () => {
    database = await seeded();
    renderSetup();
    const group = await screen.findByRole('group', { name: 'Início da execução' });
    const [day] = within(group).getAllByRole('spinbutton');
    await userEvent.click(day!);
    // No `{delay:}`, matching `date-field.test.tsx`'s own probe and the e2e helper
    // `typeDate`: the live query's own round trip through Dexie must never reset the
    // segments a keystroke is still building.
    await userEvent.keyboard('01102026');
    await waitFor(() => expect(within(group).getAllByRole('spinbutton').map((el) => el.textContent)).toEqual(['01', '10', '2026']));
    await waitFor(async () => {
      const row = await database!.entities.get(['relatorio', RELATORIO]);
      expect((row!.row as RelatorioRow).setup.service_start).toBe('2026-10-01');
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
    // Story 12.2 (J-06): forward to the Sumário with section 9 open, and the toast says it saved.
    expect(await screen.findByTestId('sumario-route')).toHaveTextContent(`/relatorio/${RELATORIO} {"openSection9":true}`);
    expect(await screen.findByText('Dados salvos')).toBeVisible();
  });

  it('12.2: with no instrument registered, Etapa 4 says so and "Cadastrar instrumento" opens Cadastros on a new instrument, returning here', async () => {
    database = await seeded();
    const instruments = (await database.entities.where('entity').equals('registry').toArray()).filter((record) => (record.row as { kind?: string }).kind === 'instrument');
    await database.entities.bulkDelete(instruments.map((record) => [record.entity, record.id] as [typeof record.entity, string]));
    renderSetup();
    expect(await screen.findByText('Nenhum instrumento cadastrado')).toBeVisible();
    const register = screen.getByRole('button', { name: 'Cadastrar instrumento' });
    expect(register).toHaveAccessibleDescription('Abre Cadastros › Instrumentos');
    await userEvent.click(register);
    expect(await screen.findByTestId('cadastros-route')).toHaveTextContent(
      `/cadastros {"tab":"instrumentos","newInstrument":true,"returnTo":"/relatorio/${RELATORIO}/setup?etapa=4"}`,
    );
  });

  it('the Combobox shows the already-picked responsible\'s name once users resolve, not blank', async () => {
    // The fixture's relatório already names USER (the session user) as responsible; `users`
    // starts empty (`useLiveQuery`) and only resolves after mount.
    database = await seeded();
    renderSetup();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Responsável técnico' })).toHaveValue('Bento Braga'));
  });

  it('shows an empty Combobox, not the signed-in account\'s name, while no responsible is set yet (review finding 3)', async () => {
    database = await seeded();
    const relatorioRecord = await database.entities.get(['relatorio', RELATORIO]);
    await database.entities.put({
      ...relatorioRecord!,
      row: { ...(relatorioRecord!.row as RelatorioRow), setup: { ...(relatorioRecord!.row as RelatorioRow).setup, responsible_user_id: null } },
    });
    renderSetup();
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Etapa 3 — Responsável' })).toBeVisible());
    // The screen must not look filled while `responsible_user_id` is still null: an empty
    // input (never the session user's name echoed with nothing actually committed), and no
    // council/number/ART fields (they only ever show once `selected` is a real picked row).
    expect(screen.getByRole('combobox', { name: 'Responsável técnico' })).toHaveValue('');
    expect(screen.queryByText('CREA', { exact: true })).toBeNull();
    const row = await database.entities.get(['relatorio', RELATORIO]);
    expect((row!.row as RelatorioRow).setup.responsible_user_id).toBeNull();
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

  it('shows an expired instrument\'s amber clause and a role="status" note the checkbox is described by (review finding 5)', async () => {
    database = await seeded();
    const EXPIRED_ID = '019966c1-000f-7000-8000-00000000ee01';
    await database.entities.put(
      toRecord(`registry:${EXPIRED_ID}`, {
        id: EXPIRED_ID,
        kind: 'instrument',
        code: 'X1',
        name: 'Instrumento vencido E2E',
        manufacturer: null,
        model: null,
        serial: null,
        cert_number: null,
        laboratory: null,
        calibrated_at: '2020-01-01',
        calibration_interval_months: 12,
        rbc_accredited: false,
        test_isolacao: null,
        test_resistencia_contato: null,
        test_relacao_transformacao: null,
        certificate_file_id: null,
        removed_at: null,
      } as never),
    );
    renderSetup();
    const checkbox = await screen.findByRole('checkbox', { name: /^X1/ });
    const note = screen.getByText(/Calibração do X1 vencida em/);
    expect(note).toHaveAttribute('role', 'status');
    expect(checkbox).toHaveAccessibleDescription(note.textContent!);
    expect(screen.getByText(/Vencida em/)).toHaveClass('ip-expired');
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

  it('Q8: without a geolocation reading the altitude is a plain field, no "Sugerido" pill and no suggested state', async () => {
    database = await seeded();
    renderSetup();
    const input = await screen.findByRole('spinbutton', { name: 'Altitude do site' });
    expect(input).toHaveValue(null);
    const field = input.closest('.altitude-field')!;
    expect(field).not.toHaveAttribute('data-state');
    expect(within(field as HTMLElement).queryByText('Sugerido')).toBeNull();
  });

  it('Q8: a geolocation reading shows the "Sugerido" pill until the user types over it', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { altitude: 763.6 } } as GeolocationPosition));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    try {
      database = await seeded();
      renderSetup();
      const input = await screen.findByRole('spinbutton', { name: 'Altitude do site' });
      await waitFor(() => expect(input).toHaveValue(764));
      const field = input.closest('.altitude-field') as HTMLElement;
      expect(field).toHaveAttribute('data-state', 'suggested');
      expect(within(field).getByText('Sugerido')).toHaveClass('suggested-pill');
      await userEvent.type(input, '1');
      expect(field).not.toHaveAttribute('data-state');
      expect(within(field).queryByText('Sugerido')).toBeNull();
    } finally {
      // @ts-expect-error jsdom has no geolocation; the property above added it.
      delete navigator.geolocation;
    }
  });

  it('Q8: a confirmed geolocation reading reopened by "Alterar" is a plain field, not "Sugerido" again', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { altitude: 763.6 } } as GeolocationPosition));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    try {
      database = await seeded();
      renderSetup();
      const input = await screen.findByRole('spinbutton', { name: 'Altitude do site' });
      await waitFor(() => expect(input).toHaveValue(764));
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      await screen.findByText('Altitude do site: < 1000 m — confirmada');
      await userEvent.click(screen.getByRole('button', { name: 'Alterar altitude do site' }));
      const reopened = await screen.findByRole('spinbutton', { name: 'Altitude do site' });
      expect(reopened).toHaveValue(764);
      const field = reopened.closest('.altitude-field') as HTMLElement;
      expect(field).not.toHaveAttribute('data-state');
      expect(within(field).queryByText('Sugerido')).toBeNull();
    } finally {
      // @ts-expect-error jsdom has no geolocation; the property above added it.
      delete navigator.geolocation;
    }
  });

  it('Q8: "Alterar" reopens a confirmed altitude with its value kept and the focus in the field', async () => {
    database = await seeded();
    const relatorioRecord = await database.entities.get(['relatorio', RELATORIO]);
    const row = relatorioRecord!.row as RelatorioRow;
    await database.entities.put({ ...relatorioRecord!, row: { ...row, setup: { ...row.setup, site_altitude_m: 764, site_altitude_confirmed: true } } });
    renderSetup();
    await screen.findByText('Altitude do site: < 1000 m — confirmada');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar altitude do site' }));
    const input = await screen.findByRole('spinbutton', { name: 'Altitude do site' });
    expect(input).toHaveValue(764);
    await waitFor(() => expect(input).toHaveFocus());
    const stored = (await database.entities.get(['relatorio', RELATORIO]))!.row as RelatorioRow;
    expect(stored.setup).toMatchObject({ site_altitude_m: 764, site_altitude_confirmed: false });
  });

  it('Q3: Etapa 2 carries no "Escopo" field (the cover prints Etapa 1\'s Informações adicionais)', async () => {
    database = await seeded();
    renderSetup();
    const band = (await screen.findByRole('heading', { level: 2, name: 'Etapa 2 — Objetivo e escopo' })).closest('section')!;
    expect(within(band).getByRole('textbox', { name: 'Local' })).toBeVisible();
    expect(within(band).queryByRole('textbox', { name: 'Escopo' })).toBeNull();
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

  it('E4 retro item 24: "Remover" in an exclusion\'s menu writes the list without it; "Desfazer" puts it back', async () => {
    database = await seeded();
    const record = await database.entities.get(['relatorio', RELATORIO]);
    const row = record!.row as RelatorioRow;
    await database.entities.put({ ...record!, row: { ...row, setup: { ...row.setup, exclusions: ['Item A', '  ', 'Item C'] } } });
    renderSetup();
    const exclusionsOf = async () => ((await database!.entities.get(['relatorio', RELATORIO]))!.row as RelatorioRow).setup.exclusions;

    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções da exclusão 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await waitFor(async () => expect(await exclusionsOf()).toEqual(['  ', 'Item C']));
    expect(screen.getAllByRole('textbox', { name: /^Exclusão \d$/ })).toHaveLength(2);
    expect(await screen.findByText('Exclusão 1 removida')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect(await exclusionsOf()).toEqual(['Item A', '  ', 'Item C']));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Exclusão 1' })).toHaveValue('Item A'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções da exclusão 1' })).toHaveFocus());
  });

  it('E4 retro item 12: "Concluir" follows the kernel table: offered on Rascunho only, "Dados salvos" otherwise', async () => {
    database = await seeded();
    const record = await database.entities.get(['relatorio', RELATORIO]);
    await database.entities.put({ ...record!, row: { ...(record!.row as RelatorioRow), status: 'emitido' } });
    renderSetup();
    expect(await screen.findByText('Dados salvos')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Concluir dados do relatório' })).toBeNull();
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
