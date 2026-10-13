import type { EntityRow, EntityState, RelatorioStatus, RevisionRow } from '@app/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BannerSlot, pickBanner } from '../../state/banner-slot.tsx';
import { useFichaIssuedBanner } from './issued-banner.ts';

/*
 * Status flow 2026-10-10: the ficha's Emitido banner, drawn through the app's one banner slot
 * as `ficha-surface.tsx` contributes it (`pickBanner` of its candidates).
 */

const REL = '019966c1-0054-7000-8000-000000000001';
const OTHER = '019966c1-0054-7000-8000-000000000002';

function revision(relatorioId: string, number: number): [string, EntityRow] {
  const id = `019966c1-0054-7000-8000-0000000000${relatorioId === REL ? 'a' : 'b'}${number}`;
  const row: RevisionRow = { id, relatorio_id: relatorioId, number, snapshot_seq: number * 10, created_by: 'u', docx_file_id: 'd', pdf_file_id: 'p', created_at: '2026-09-10T12:00:00.000Z' };
  return [`revision:${id}`, row as unknown as EntityRow];
}

function Ficha({ status, state }: { status: RelatorioStatus; state: EntityState }) {
  const issued = useFichaIssuedBanner(state, REL, status);
  const banner = pickBanner(issued === null ? [] : [issued]);
  return <BannerSlot banners={banner === null ? [] : [banner]} />;
}

const stateOf = (entries: [string, EntityRow][]): EntityState => new Map(entries) as unknown as EntityState;
const TEXT = 'Relatório emitido (revisão 2). Editar esta ficha reabre o relatório como Em revisão e gera a revisão 3.';

describe('the ficha of an Emitido relatório', () => {
  it('shows the banner naming this relatório\'s newest revision, whatever another relatório holds', () => {
    render(<Ficha status="emitido" state={stateOf([revision(REL, 1), revision(REL, 2), revision(OTHER, 7)])} />);
    expect(screen.getByText(TEXT).closest('.banner')).not.toBeNull();
  });

  it('shows none in Em revisão, nor Emitido with no revision of its own', () => {
    const { unmount } = render(<Ficha status="em_revisao" state={stateOf([revision(REL, 2)])} />);
    expect(screen.queryByText(/Relatório emitido/)).toBeNull();
    unmount();
    render(<Ficha status="emitido" state={stateOf([revision(OTHER, 2)])} />);
    expect(screen.queryByText(/Relatório emitido/)).toBeNull();
  });
});
