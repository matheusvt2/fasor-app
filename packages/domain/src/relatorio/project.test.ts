import { describe, expect, it } from 'vitest';
import type { ProjectRow } from '../schemas/entities.ts';
import { unprojectedSites } from './project.ts';

const CLIENT = '019966b0-0000-7000-8000-0000000000c1';
const project = (id: string, site: string | null, name = 'Obra'): ProjectRow => ({ id, client_id: CLIENT, name, site, removed_at: null });

describe('F-05 unprojectedSites', () => {
  it('offers the client sites no obra names yet, trimmed, each once, in registry order', () => {
    const client = {
      sites: [
        { id: '019966b0-0000-7000-8000-0000000000a1', address: 'Obra UX' },
        { id: '019966b0-0000-7000-8000-0000000000a2', address: ' Galpão 2 ' },
        { id: '019966b0-0000-7000-8000-0000000000a3', address: 'obra ux' },
        { id: '019966b0-0000-7000-8000-0000000000a4', address: '   ' },
        { id: '019966b0-0000-7000-8000-0000000000a5', address: 'Sede' },
      ],
    };
    expect(unprojectedSites(client, [project('019966b0-0000-7000-8000-0000000000b1', 'SEDE')])).toEqual([
      { id: '019966b0-0000-7000-8000-0000000000a1', address: 'Obra UX' },
      { id: '019966b0-0000-7000-8000-0000000000a2', address: 'Galpão 2' },
    ]);
  });

  it('is empty with no client', () => {
    expect(unprojectedSites(null, [])).toEqual([]);
  });
});
