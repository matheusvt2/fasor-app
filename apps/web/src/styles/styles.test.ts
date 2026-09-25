// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mockups = resolve(
  __dirname,
  '../../../../_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups',
);

describe('mockup styles', () => {
  for (const name of ['tokens.css', 'components.css']) {
    it(`${name} is byte-identical to the mockup`, () => {
      expect(readFileSync(resolve(__dirname, name)).equals(readFileSync(resolve(mockups, name)))).toBe(true);
    });
  }

  it('self-hosts Inter', () => {
    expect(existsSync(resolve(__dirname, 'fonts/inter-latin-wght-normal.woff2'))).toBe(true);
  });
});
