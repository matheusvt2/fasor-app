import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasswordResetRequestResult } from '../../api/auth-client.ts';
import type { SessionState } from '../../state/session.tsx';
import { axe } from '../../test-axe.ts';
import { ForgotPasswordSurface } from './forgot-surface.tsx';

/*
 * Story 26.6, "Esqueci minha senha" (`11-login-esqueci.html`): one answer for any address, a
 * `429` with its own sentence and no field marked, offline disabled with its reason, the e-mail
 * typed on Login carried here. The session and the route call are mocked at the module.
 */

const requestPasswordReset = vi.fn<(email: string) => Promise<PasswordResetRequestResult>>();
vi.mock('../../api/auth-client.ts', () => ({ requestPasswordReset: (email: string) => requestPasswordReset(email) }));

let session: Partial<SessionState> = {};
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

const SENT = 'Se este e-mail estiver cadastrado, o link chega em alguns minutos. Ele vale por 1 hora. Veja também a caixa de spam.';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderForgot(state: unknown = { email: 'ana@teste.local' }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login/esqueci', state }]}>
      <Routes>
        <Route path="/login/esqueci" element={<ForgotPasswordSurface />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  requestPasswordReset.mockReset();
  session = { status: 'signed-out', user: null, online: true, reAuthRequired: false };
});

describe('26.6-UNIT-003 Esqueci minha senha', () => {
  it('carries the e-mail typed on Login and shows the frame words', async () => {
    const { container } = renderForgot();
    expect(screen.getByRole('heading', { name: 'Criar uma senha nova' })).toBeInTheDocument();
    expect(screen.getByText('Informe o seu e-mail. Enviamos um link para você criar uma senha nova.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@teste.local');
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar ao login' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('answers the same sentence for a known and an unknown address', async () => {
    requestPasswordReset.mockResolvedValue({ ok: true });
    renderForgot();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(requestPasswordReset).toHaveBeenCalledWith('ana@teste.local');
    expect(await screen.findByRole('heading', { name: 'Confira o seu e-mail' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(SENT);
    const firstAnswer = screen.getByRole('status').textContent;

    // "Usar outro e-mail" goes back to the request with the field kept; an unknown address reads the same.
    await userEvent.click(screen.getByRole('button', { name: 'Usar outro e-mail' }));
    const field = screen.getByLabelText('E-mail');
    expect(field).toHaveValue('ana@teste.local');
    await userEvent.clear(field);
    await userEvent.type(field, 'ninguem@teste.local');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(requestPasswordReset).toHaveBeenLastCalledWith('ninguem@teste.local');
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
    expect(screen.getByRole('status').textContent).toBe(firstAnswer);
  });

  it('a 429 has its own sentence and marks no field', async () => {
    requestPasswordReset.mockResolvedValue({ ok: false, reason: 'rate-limited' });
    const { container } = renderForgot();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitos pedidos de link. Tente novamente em alguns minutos.');
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid');
    expect(container.querySelector('.input.is-invalid')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Confira o seu e-mail' })).toBeNull();
  });

  it('a server that does not answer says so', async () => {
    requestPasswordReset.mockResolvedValue({ ok: false, reason: 'server' });
    renderForgot();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor. Tente de novo em instantes.');
  });

  it('an empty or malformed e-mail sends nothing and is named on the field', async () => {
    renderForgot({});
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('Informe o e-mail');
    await userEvent.type(screen.getByLabelText('E-mail'), 'nao-e-email');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('E-mail inválido');
  });

  it('offline, "Enviar link" is disabled with its reason and sends nothing', async () => {
    session = { ...session, online: false };
    renderForgot();
    const send = screen.getByRole('button', { name: 'Enviar link' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription('Enviar link precisa de conexão');
    await userEvent.click(send);
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('"Voltar ao login" goes to Login', async () => {
    renderForgot();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao login' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
  });
});
