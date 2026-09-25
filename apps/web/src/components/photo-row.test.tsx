import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhotoRow } from './photo-row.tsx';

/*
 * E6-Q10 (EXPERIENCE.md › Photo tile, "`aria-describedby` from the tile"): the tile that
 * opens the viewer is described by its stamp, its caption and its upload pill, so a screen
 * reader hears them with the tile instead of only as the next controls.
 */
describe('E6-Q10 PhotoRow describes its tile', () => {
  it('names the stamp, the caption and the pending pill', () => {
    render(<PhotoRow label="Foto 4, abrir" number={4} stamp={{ text: '06/09 14:32', gps: true }} caption="Detalhe da chave seccionadora SEC-ENEL do Cubículo Enel" thumb={null} state="pending" onOpen={() => {}} />);
    const tile = screen.getByRole('button', { name: 'Foto 4, abrir' });
    expect(tile).toHaveAccessibleDescription('06/09 14:32GPS Detalhe da chave seccionadora SEC-ENEL do Cubículo Enel Aguardando envio');
  });

  it('names the error pill, and leaves out what the tile does not show', () => {
    render(<PhotoRow label="Foto 5, abrir" caption={null} thumb={null} state="error" onRetry={() => {}} onOpen={() => {}} />);
    const tile = screen.getByRole('button', { name: 'Foto 5, abrir' });
    expect(tile).toHaveAccessibleDescription('Erro — Tentar novamente');
  });

  it('describes nothing when the server holds the photo and there is no stamp or caption', () => {
    render(<PhotoRow label="Foto 6, abrir" caption={null} thumb={null} state="uploaded" onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Foto 6, abrir' })).not.toHaveAttribute('aria-describedby');
  });
});
