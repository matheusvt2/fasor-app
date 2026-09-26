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

function header(filledBy: string | null) {
  return render(<FichaHeader typeName="Chave seccionadora" tag="SEC-ENEL" locationText="Cubículo Enel" filledBy={filledBy} concludedBy={null} progress={progress} shown={[]} menu={[]} onRename={null} />);
}

describe('E6-Q1 FichaHeader attribution line', () => {
  it('draws an aria-hidden `.sheet-meta` placeholder while nobody filled the sheet', () => {
    const { container } = header(null);
    const metas = [...container.querySelectorAll('.sheet-meta')];
    expect(metas).toHaveLength(2);
    expect(metas[1]).toHaveAttribute('aria-hidden', 'true');
    expect(metas[1]!.textContent).toBe(' ');
  });

  it('draws the attribution in the same line once someone filled it', () => {
    const { container } = header('Preenchido por Bento Braga · 25/09 18:54');
    const metas = [...container.querySelectorAll('.sheet-meta')];
    expect(metas).toHaveLength(2);
    expect(metas[1]).not.toHaveAttribute('aria-hidden');
    expect(metas[1]).toHaveTextContent('Preenchido por Bento Braga · 25/09 18:54');
  });
});
