import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SheetProgress } from '@app/domain';
import { FichaHeader } from './ficha-header.tsx';

/*
 * E6-Q1: the attribution line keeps its height before the first commit, so the line that
 * appears once someone fills the sheet never grows the header under an open Combobox list
 * (which a scroll-anchoring shift would close).
 */

const progress = { complete: false, firstIncompleteStep: 'placa', steps: {} } as unknown as SheetProgress;

function header(filledBy: string | null, savedAt?: string) {
  return render(
    <FichaHeader
      typeName="Chave seccionadora"
      tag="SEC-ENEL"
      locationText="Cubículo Enel"
      filledBy={filledBy}
      concludedBy={null}
      progress={progress}
      shown={[]}
      menu={[]}
      onRename={null}
      {...(savedAt === undefined ? {} : { savedAt })}
    />,
  );
}

describe('E6-Q1 FichaHeader attribution line', () => {
  it('draws an aria-hidden `.sheet-meta` placeholder while nobody filled the sheet', () => {
    const { container } = header(null);
    const metas = [...container.querySelectorAll('.sheet-meta')];
    expect(metas).toHaveLength(3);
    expect(metas[1]).toHaveAttribute('aria-hidden', 'true');
    expect(metas[1]!.textContent).toBe(' ');
  });

  it('draws the attribution in the same line once someone filled it', () => {
    const { container } = header('Preenchido por Bento Braga · 25/09 18:54');
    const metas = [...container.querySelectorAll('.sheet-meta')];
    expect(metas).toHaveLength(3);
    expect(metas[1]).not.toHaveAttribute('aria-hidden');
    expect(metas[1]).toHaveTextContent('Preenchido por Bento Braga · 25/09 18:54');
  });
});

describe('13.4 INP-4 FichaHeader saved line', () => {
  it('is a visible `.sheet-meta` status after the attribution, holding a non-breaking space before the first save', () => {
    const { container, getByTestId } = header(null);
    const saved = getByTestId('ficha-saved');
    expect(saved).toHaveClass('sheet-meta');
    expect(saved).not.toHaveClass('visually-hidden');
    expect(saved).toHaveAttribute('role', 'status');
    expect(saved.textContent).toBe('\u00a0');
    expect([...container.querySelectorAll('.sheet-meta')].at(-1)).toBe(saved);
  });

  it('shows the kernel text once a save landed, in the same element (outside a SyncProvider: not reachable)', () => {
    // 17:32 UTC is 14:32 in America/Sao_Paulo.
    const { getByTestId } = header('Preenchido por Bento Braga · 25/09 18:54', '2026-10-07T17:32:10.000Z');
    expect(getByTestId('ficha-saved')).toHaveTextContent('Salvo neste aparelho às 14:32');
  });
});

describe('14.5 FichaHeader library pill', () => {
  it('says "Tipo da biblioteca" beside the TAG on the sheet of a library type, and nothing on the eight', () => {
    const library = render(
      <FichaHeader typeName="Chave de transferência automática" tag="CTA-GER" locationText="Geradores" filledBy={null} concludedBy={null} progress={progress} shown={[]} menu={[]} onRename={null} library />,
    );
    const pill = library.container.querySelector('.sheet-title .lib-pill');
    expect(pill).toHaveTextContent('Tipo da biblioteca');
    expect(pill!.querySelector('use')).toHaveAttribute('href', '/sprite.svg#i-book');
    library.unmount();
    expect(header(null).container.querySelector('.lib-pill')).toBeNull();
  });
});
