import { HOME_PAGE_SIZES, homePageSizeTarget, homeStatusTileTarget, RELATORIO_STATUSES, UX_ACTION_TARGETS, type RelatorioStatus } from '@app/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotApplicableButton } from '../components/not-applicable-button.tsx';
import { TriStateControl } from '../components/tri-state-control.tsx';
import { FilterChipGroup } from '../components/chip.tsx';
import { StatusBoard } from '../surfaces/home/status-board.tsx';
import { StickyActionBar } from '../surfaces/ficha/sticky-action-bar.tsx';
import type { FichaActions } from '../surfaces/ficha/use-ficha-actions.ts';

/*
 * E18-A1 (R-V9): the names that reach `data-telemetry` through a prop pass `targets.test.ts`
 * by their call-site text only. Here the components are rendered with what their call sites
 * give them, and the attribute on the rendered control is read against the kernel's list.
 */

const TARGETS = new Set<string>(UX_ACTION_TARGETS);

afterEach(cleanup);

function renderedNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-telemetry]')].map((element) => element.getAttribute('data-telemetry') ?? '');
}

describe('prop-fed control names, as rendered', () => {
  it('Story 18.4: the Home status board names each tile by its status (home.status_chip_<status>)', () => {
    const counts = Object.fromEntries(RELATORIO_STATUSES.map((status) => [status, 1])) as Record<RelatorioStatus, number>;
    const { container } = render(<StatusBoard counts={counts} filter={null} onFilter={() => undefined} />);
    const names = renderedNames(container);
    expect(names).toEqual(RELATORIO_STATUSES.map(homeStatusTileTarget));
    expect(names).toEqual(['home.status_chip_rascunho', 'home.status_chip_em_campo', 'home.status_chip_em_revisao', 'home.status_chip_emitido']);
    for (const name of names) expect(TARGETS.has(name)).toBe(true);
  });

  it("Story 18.4: the Home page-size chips, as Home gives them, name each size (home.page_size_<size>)", () => {
    const options = HOME_PAGE_SIZES.map((size) => ({ id: String(size), label: String(size), telemetry: homePageSizeTarget(size) }));
    const { container } = render(<FilterChipGroup options={options} selectedId="10" onChange={() => undefined} aria-label="Relatórios por página" />);
    expect(renderedNames(container)).toEqual(['home.page_size_10', 'home.page_size_20', 'home.page_size_50', 'home.page_size_100']);
    for (const name of renderedNames(container)) expect(TARGETS.has(name)).toBe(true);
  });

  it('the checklist Tri-state (call site "ficha.mark") names its segments ficha.mark_c, _nc and _na', () => {
    const { container } = render(<TriStateControl value={null} onChange={() => undefined} aria-label="1. Limpeza" telemetry="ficha.mark" />);
    expect(screen.getByRole('radio', { name: 'Conforme' })).toHaveAttribute('data-telemetry', 'ficha.mark_c');
    expect(screen.getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('data-telemetry', 'ficha.mark_nc');
    expect(screen.getByRole('radio', { name: 'Não se aplica' })).toHaveAttribute('data-telemetry', 'ficha.mark_na');
    for (const name of renderedNames(container)) expect(TARGETS.has(name)).toBe(true);
  });

  it('a Tri-state without a name renders no data-telemetry', () => {
    const { container } = render(<TriStateControl value={null} onChange={() => undefined} aria-label="1. Limpeza" />);
    expect(renderedNames(container)).toEqual([]);
  });

  it('the N/A control of a sheet field renders ficha.na', () => {
    const { container } = render(<NotApplicableButton label="Corrente" onPress={() => undefined} telemetry="ficha.na" />);
    expect(renderedNames(container)).toEqual(['ficha.na']);
    expect(TARGETS.has('ficha.na')).toBe(true);
  });

  it("the Sticky action bar's primary renders each name the sheet's actions give it", () => {
    const given: FichaActions['primaryTelemetry'][] = ['ficha.conclude', 'ficha.next_sheet'];
    for (const name of given) {
      const { container, unmount } = render(<StickyActionBar stepper={null} secondary={null} primaryLabel="Concluir" onPrimary={() => undefined} primaryTelemetry={name} />);
      expect(renderedNames(container)).toEqual([name]);
      expect(TARGETS.has(name)).toBe(true);
      unmount();
    }
  });
});
