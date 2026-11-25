import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import { PanelCapture, type PanelCaptureHandle } from '../relatorio/panel-capture.tsx';
import type { FichaApi } from './ficha-api.ts';
import { EnvReadDisplayButton, ReadDisplayButton } from './read-display.tsx';

/*
 * Story 30.1 H (L1335): "Abrindo câmera…" while the camera has not answered (the permission prompt may be
 * up), on "Ler visor" of a sheet and of the environment, and on "Fotografar equipamento" (the panel
 * capture), as `photo-openers.tsx` says it: the visually hidden status line, and the opener busy.
 * `useCamera` is stood in for: a press leaves it opening, as a `getUserMedia` not yet answered does.
 */

vi.mock('./camera-view.tsx', async () => {
  const { useState } = await vi.importActual<typeof import('react')>('react');
  return {
    useCamera: () => {
      const [opening, setOpening] = useState(false);
      return { open: () => setOpening(true), opening, burst: 0, denied: false, element: null };
    },
  };
});
vi.mock('./attach-file.tsx', () => ({ AttachFileAction: () => null, useAttachFile: () => ({ open: () => undefined, input: null }) }));
vi.mock('@app/domain', async (original) => ({
  ...(await original<typeof import('@app/domain')>()),
  displayBurstStops: () => [],
  displayBurstStart: () => 0,
  displayBurstStop: () => null,
}));
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));

const OPENING = 'Abrindo câmera…';
const target = () => ({ blockId: null, itemKey: null, caption: null });

describe('30.1-UNIT-H: "Abrindo câmera…" on every camera opener', () => {
  it('H1: the sheet\'s "Ler visor" reads it and is busy while the camera opens', async () => {
    render(
      <ToastProvider>
        <ReadDisplayButton
          api={{ relatorioId: '019966b0-0000-7000-8000-000000000001' } as unknown as FichaApi}
          snapshot={{ files: [] } as never}
          block={{ id: '019966b0-0000-7000-8000-0000000000b1', block_type: 'disjuntor_mt' } as never}
          definition={{} as never}
          testKey="isolacao"
          tableKey="t1"
          targetFor={target}
        />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: /Ler visor/ });
    expect(screen.queryByText(OPENING)).toBeNull();
    await userEvent.click(button);
    expect(await screen.findByText(OPENING)).toHaveAttribute('role', 'status');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('H2: the environment\'s "Ler visor" reads it and is busy while the camera opens', async () => {
    render(
      <ToastProvider>
        <EnvReadDisplayButton relatorioId="019966b0-0000-7000-8000-000000000001" cabineId="019966b0-0000-7000-8000-0000000000c1" target={target} />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: /Ler visor/ });
    await userEvent.click(button);
    expect(await screen.findByText(OPENING)).toHaveAttribute('role', 'status');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('H3: "Fotografar equipamento" says it while the camera opens (its palette has closed, so the line is the panel capture\'s own)', async () => {
    const ref = createRef<PanelCaptureHandle>();
    render(
      <ToastProvider>
        <PanelCapture
          ref={ref}
          relatorioId="019966b0-0000-7000-8000-000000000001"
          seedVersion="v18"
          locations={[]}
          equipment={[]}
          definitions={{ equipmentTypes: [] } as never}
          onConfirm={() => undefined}
        />
      </ToastProvider>,
    );
    expect(screen.queryByText(OPENING)).toBeNull();
    act(() => ref.current!.open({ locationId: '019966b0-0000-7000-8000-0000000000c1', anchorBlockId: null }));
    expect(await screen.findByText(OPENING)).toHaveAttribute('role', 'status');
  });
});
