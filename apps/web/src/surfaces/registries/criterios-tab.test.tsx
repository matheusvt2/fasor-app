import { SEEDED_CRITERIA } from '@app/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CriteriosTab } from './criterios-tab.tsx';

afterEach(cleanup);

describe('CriteriosTab — Story 2.6 AC3', () => {
  it('renders a read-only data table sourced from SEEDED_CRITERIA, one row per criterion', () => {
    render(<CriteriosTab />);
    const table = screen.getByRole('table');
    const rows = screen.getAllByRole('row');
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
