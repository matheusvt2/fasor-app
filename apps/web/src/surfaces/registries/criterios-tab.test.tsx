import { criteriaTablesView, NETA_100_1, NETA_100_5, SEEDED_CRITERIA, seededCriterionAppliesText } from '@app/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CriteriosTab } from './criterios-tab.tsx';

afterEach(cleanup);

describe('CriteriosTab — Story 2.6 AC3', () => {
  it('renders a read-only data table sourced from SEEDED_CRITERIA, one row per criterion', () => {
    render(<CriteriosTab />);
    // Story 27.6: the seeded criteria are the first table; the ANSI/NETA tables follow.
    const table = screen.getAllByRole('table')[0]!;
    const rows = within(table).getAllByRole('row');
    // Header row + one row per seeded criterion.
    expect(rows).toHaveLength(SEEDED_CRITERIA.length + 1);
    for (const criterion of SEEDED_CRITERIA) {
      expect(table).toHaveTextContent(criterion.label);
      expect(table).toHaveTextContent(criterion.source.name);
      expect(table).toHaveTextContent(criterion.usedBy);
    }
  });

  it('has no interactive row controls', () => {
    render(<CriteriosTab />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('27.6 CriteriosTab lists every criterion the fichas judge by, each with when it applies', () => {
  it('each seeded row carries the kernel\'s "when it applies" line', () => {
    const { container } = render(<CriteriosTab />);
    const table = screen.getAllByRole('table')[0]!;
    const lines = [...table.querySelectorAll('[data-applies]')].map((el) => el.textContent);
    expect(lines).toEqual(SEEDED_CRITERIA.map((criterion) => seededCriterionAppliesText(criterion)));
    expect(container.querySelectorAll('section[data-criteria-table]')).toHaveLength(2);
  });

  it('the Tabela 100.1 and the Tabela 100.5: their heading, applies line and every row, as the kernel composes them', () => {
    render(<CriteriosTab />);
    const views = criteriaTablesView();
    expect(views.map((view) => view.rows.length)).toEqual([NETA_100_1.rows.length, NETA_100_5.rows.length]);
    for (const view of views) {
      const table = screen.getByRole('table', { name: view.title });
      const section = table.closest('section')!;
      expect(within(section as HTMLElement).getByRole('heading', { level: 2, name: view.title })).toBeVisible();
      expect(section.querySelector('.section-note[data-applies]')).toHaveTextContent(view.appliesText);
      const body = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
      expect(body).toEqual(view.rows.map((row) => [row.ratedText, row.testVoltageText, ...row.minimums]));
    }
    // Two minimum columns on the winding table, one on the apparatus table.
    expect(within(screen.getByRole('table', { name: views[0]!.title })).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(screen.getByRole('table', { name: views[1]!.title })).getAllByRole('columnheader')).toHaveLength(4);
  });
});
