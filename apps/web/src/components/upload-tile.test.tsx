import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test-axe.ts';
import { describe, expect, it, vi } from 'vitest';
import { UploadTile } from './upload-tile.tsx';

/*
 * 2.2-UNIT: the shared tile. `crypto.subtle` is the jsdom environment's WebCrypto,
 * so the hash the surface commits is the same one the route checks.
 */

const pdf = () => new File(['%PDF-1.4 hello'], '35102-25.pdf', { type: 'application/pdf' });
const gif = () => new File(['GIF89a'], 'foto.gif', { type: 'image/gif' });
const huge = () => {
  const file = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: 26 * 1024 * 1024 });
  return file;
};

/** The tile's own `accept` would make user-event drop a refused candidate before the
 * component sees it; the point of these cases is the kernel's refusal, not the picker's. */
const anyFile = userEvent.setup({ applyAccept: false });

/*
 * The native inputs are `aria-hidden` mechanisms, not controls, so they are reached by
 * test id -- exactly as the tile itself reaches them, through the visible button.
 */
const certificateInput = () => screen.getByTestId('upload-input-certificate');
const logoInput = () => screen.getByTestId('upload-input-logo');

describe('UploadTile', () => {
  it('accepts a candidate the kernel allows and hands back its sha256', async () => {
    const onPick = vi.fn();
    render(<UploadTile kind="certificate" label="Arquivo do certificado" file={null} onPick={onPick} />);
    const input = certificateInput();
    expect(input).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png');

    await userEvent.upload(input, pdf());
    // The tile reads and hashes the bytes before it calls back, so this is not synchronous.
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    const picked = onPick.mock.calls[0]![0] as { file: File; sha256: string };
    expect(picked.file.name).toBe('35102-25.pdf');
    expect(picked.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a mime the kind does not take, inline and without calling onPick', async () => {
    const onPick = vi.fn();
    render(<UploadTile kind="certificate" label="Arquivo do certificado" file={null} onPick={onPick} />);
    await anyFile.upload(certificateInput(), gif());
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Formato não aceito');
  });

  it('refuses a file over 25 MB, inline and without calling onPick', async () => {
    const onPick = vi.fn();
    render(<UploadTile kind="certificate" label="Arquivo do certificado" file={null} onPick={onPick} />);
    await userEvent.upload(certificateInput(), huge());
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('25 MB');
  });

  it('draws the mock markup and the kernel tile line for an attached file', () => {
    const { container } = render(
      <UploadTile
        kind="certificate"
        label="Arquivo do certificado"
        helper="PDF ou imagem"
        file={{ name: '35102-25.pdf', mime: 'application/pdf', size: 3 * 1024 * 1024, uploaded_at: null }}
        onPick={vi.fn()}
      />,
    );
    // `key-registries.html` L154-172: `.input.file-input` with `.file-name` and a `.helper`.
    expect(container.querySelector('.input.file-input .file-name')).toHaveTextContent(
      '35102-25.pdf · 3,0 MB · Envio pendente',
    );
    expect(container.querySelector('.helper')).toHaveTextContent('PDF ou imagem');
    expect(screen.getByRole('button', { name: 'Substituir — Arquivo do certificado' })).toBeInTheDocument();
    // No "Abrir" unless the surface can open the file.
    expect(screen.queryByRole('button', { name: /Abrir/ })).not.toBeInTheDocument();
  });

  it('offers "Abrir" on an attached file when the surface can open it (Epic 2 retro D-3)', async () => {
    const onOpen = vi.fn();
    const file = { name: '35102-25.pdf', mime: 'application/pdf', size: 1024, uploaded_at: '2026-09-22T10:00:00.000Z' };
    const { rerender } = render(
      <UploadTile kind="certificate" label="Arquivo do certificado" file={null} onPick={vi.fn()} onOpen={onOpen} />,
    );
    expect(screen.queryByRole('button', { name: /Abrir/ })).not.toBeInTheDocument();
    rerender(<UploadTile kind="certificate" label="Arquivo do certificado" file={file} onPick={vi.fn()} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir — Arquivo do certificado' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('draws the brand-tile layout with its placeholder while the asset is missing', () => {
    const { container } = render(
      <UploadTile kind="logo" label="Logo" layout="tile" placeholder="Logo" file={null} onPick={vi.fn()} />,
    );
    // `80-cadastros.html` L135-145: `.brand-tile.is-logo` with a `.thumb` and `.tile-name`.
    expect(container.querySelector('.brand-tile.is-logo .thumb')).not.toBeNull();
    expect(container.querySelector('.tile-name')).toHaveTextContent('Logo · Nenhum arquivo');
  });

  it('shows an inline reason when the commit rejects, instead of an unhandled rejection', async () => {
    const onPick = vi.fn(async () => {
      throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    });
    render(<UploadTile kind="certificate" label="Arquivo do certificado" file={null} onPick={onPick} />);
    await userEvent.upload(certificateInput(), pdf());
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível anexar'));
    // The button is usable again: picking is the retry.
    expect(screen.getByRole('button', { name: 'Escolher — Arquivo do certificado' })).toBeEnabled();
  });

  it('is one control and one tab stop, with the formats on it, and no axe violations', async () => {
    const { container } = render(
      <UploadTile kind="logo" label="Logo" helper="PNG ou SVG" file={null} onPick={vi.fn()} />,
    );
    const button = screen.getByRole('button', { name: 'Escolher — Logo' });
    await userEvent.tab();
    // One tab stop for the tile: the hidden native input is opened through the button.
    expect(button).toHaveFocus();
    await userEvent.tab();
    expect(logoInput()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);

    // One control in the accessibility tree, not a phantom second one for the input.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByLabelText('Logo')).toBeNull();
    expect(logoInput()).toHaveAttribute('aria-hidden', 'true');

    // The formats are described on the control a screen-reader user actually lands on.
    expect(button).toHaveAccessibleDescription('PNG ou SVG');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('describes the visible button with the refusal reason, not only the hidden input', async () => {
    render(<UploadTile kind="logo" label="Logo" helper="PNG ou SVG" file={null} onPick={vi.fn()} />);
    await anyFile.upload(logoInput(), pdf());
    const button = screen.getByRole('button', { name: 'Escolher — Logo' });
    await waitFor(() => expect(button).toHaveAccessibleDescription(/Formato não aceito/));
    expect(button).toHaveAccessibleDescription(/PNG ou SVG/);
  });
});
