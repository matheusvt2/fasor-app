import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from './state/session.tsx';

/*
 * Story 26.5 (2026-11-21 addition): after sign-in the app returns to the address that was asked.
 * The validator reads only an address of this app; RequireSession carries the asked address to
 * Login, and Login opens it once the session is signed in.
 */

let session: Partial<SessionState> = { status: 'signed-out' };

vi.mock('./state/session.tsx', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => session,
}));
vi.mock('./surfaces/login/login-surface.tsx', () => ({ LoginSurface: () => <p data-testid="login">login</p> }));

const { LoginRoute, RequireSession, returnAddress } = await import('./app.tsx');

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where" data-asked={JSON.stringify(location.state ?? null)}>
      {`${location.pathname}${location.search}${location.hash}`}
    </p>
  );
}

afterEach(cleanup);

describe('26.5-UNIT-005 the return address', () => {
  it.each([
    ['/relatorio/abc', '/relatorio/abc'],
    ['/relatorio/abc/ficha/def?volta=exportar#x', '/relatorio/abc/ficha/def?volta=exportar#x'],
    ['/', '/'],
    ['//evil.example/path', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example/', '/'],
    ['relatorio/abc', '/'],
    ['/login', '/'],
    ['/login?x=1', '/'],
    ['', '/'],
    [undefined, '/'],
    [42, '/'],
  ] as const)('%s opens %s', (asked, expected) => {
    expect(returnAddress(asked)).toBe(expected);
  });

  it('a signed-out visit goes to Login carrying the asked address', () => {
    session = { status: 'signed-out' };
    render(
      <MemoryRouter initialEntries={['/relatorio/abc?exportar=1#top']}>
        <Routes>
          <Route path="/login" element={<Where />} />
          <Route path="*" element={<RequireSession />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    expect(JSON.parse(screen.getByTestId('where').dataset.asked!)).toEqual({ asked: '/relatorio/abc?exportar=1#top' });
  });

  it('a signed-in Login opens the asked address, and Home without one', () => {
    session = { status: 'signed-in', reAuthRequired: false };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { asked: '/relatorio/abc' } }]}>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where')).toHaveTextContent('/relatorio/abc');
    cleanup();
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { asked: '//evil.example' } }]}>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where').textContent).toBe('/');
  });
});
