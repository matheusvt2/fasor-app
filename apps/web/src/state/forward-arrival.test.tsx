import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useForwardArrival } from './forward-arrival.ts';

/** A shell like `AppShell`: its heading and one control stay mounted across routes. */
function Shell() {
  const heading = useRef<HTMLHeadingElement>(null);
  useForwardArrival(heading);
  return (
    <>
      <h1 tabIndex={-1} ref={heading}>
        Título
      </h1>
      <button type="button">Outro controle</button>
      <Outlet />
    </>
  );
}

function setUp() {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: '/a', element: <p>A</p> },
          { path: '/b', element: <p>B</p> },
        ],
      },
    ],
    { initialEntries: ['/a'] },
  );
  render(<RouterProvider router={router} />);
  const other = screen.getByRole('button', { name: 'Outro controle' });
  return { router, other, heading: screen.getByRole('heading', { name: 'Título' }) };
}

describe('E12-Q2 useForwardArrival', () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a push to another pathname scrolls to the top and focuses the heading', async () => {
    const { router, other, heading } = setUp();
    other.focus();
    await act(() => router.navigate('/b'));
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(heading).toHaveFocus();
  });

  it('a browser back or forward (POP) is left to the browser', async () => {
    const { router, other } = setUp();
    await act(() => router.navigate('/b'));
    scrollTo.mockClear();
    other.focus();
    await act(() => router.navigate(-1));
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(other).toHaveFocus();
  });

  it('a search-only change on the same pathname is left alone', async () => {
    const { router, other } = setUp();
    other.focus();
    await act(() => router.navigate('/a?etapa=4'));
    expect(router.state.location.search).toBe('?etapa=4');
    expect(scrollTo).not.toHaveBeenCalled();
    expect(other).toHaveFocus();
  });
});
