import { describe, expect, it } from 'vitest';
import { integrityFindings } from './integrity.ts';

const E1 = '019966b0-0041-7000-8000-000000000001';
const E2 = '019966b0-0041-7000-8000-000000000002';
const E3 = '019966b0-0041-7000-8000-000000000003';
const E4 = '019966b0-0041-7000-8000-000000000004';

describe('4.1-UNIT integrityFindings duplicate_tag', () => {
  it('names a tag two live rows share, both ids, and never a removed row', () => {
    const findings = integrityFindings({
      equipment: [
        { id: E1, tag: 'SEC-C05', removed_at: null },
        { id: E2, tag: 'sec-c05', removed_at: null },
        { id: E3, tag: 'SEC-C05', removed_at: '2026-09-07T10:00:00.000Z' },
        { id: E4, tag: 'DJ-C05', removed_at: null },
      ],
    });
    expect(findings).toEqual([{ kind: 'duplicate_tag', tag: 'SEC-C05', equipment_ids: [E1, E2] }]);
  });

  it('is empty when every live tag is unique', () => {
    expect(
      integrityFindings({
        equipment: [
          { id: E1, tag: 'SEC-C05', removed_at: null },
          { id: E2, tag: 'SEC-C05-2', removed_at: null },
        ],
      }),
    ).toEqual([]);
  });
});

describe('7.3-UNIT integrityFindings cert_number_mismatch', () => {
  const I1 = '019966b0-0041-7000-8000-0000000000a1';
  const I2 = '019966b0-0041-7000-8000-0000000000a2';
  const B1 = '019966b0-0041-7000-8000-0000000000b1';
  const B2 = '019966b0-0041-7000-8000-0000000000b2';
  const B3 = '019966b0-0041-7000-8000-0000000000b3';
  const OP = '019966b0-0041-7000-8000-0000000000c1';
  const cell = (instrument_id: string, cert_number: string | null) => ({ value: { instrument_id, code: 'X', cert_number }, source_suggestion_id: null, op_id: OP });
  const block = (id: string, tests: Record<string, ReturnType<typeof cell>>, extra: { not_tested?: unknown; removed_at?: string | null; config?: unknown } = {}) => ({
    id,
    config: (extra.config ?? { block_type: 'chave_seccionadora', sub_blocks: { isolacao: { enabled: true }, resistencia_contato: { enabled: true } }, na_defaults: [] }) as never,
    sheet: {
      nameplate: {},
      checklist: {},
      test: Object.fromEntries(Object.entries(tests).map(([key, instrument]) => [key, { instrument, cells: {} }])),
      conclusion: {},
      observations: null,
    } as never,
    not_tested: (extra.not_tested ?? null) as never,
    removed_at: extra.removed_at ?? null,
  });
  const instruments = [
    { id: I1, cert_number: '1001/26', removed_at: null },
    { id: I2, cert_number: '  ', removed_at: null },
  ];

  it('names each sheet value that differs from the registry, trimmed, with the blocks carrying it', () => {
    const findings = integrityFindings({
      equipment: [],
      instruments,
      blocks: [
        block(B1, { isolacao: cell(I1, ' 1001/26 '), resistencia_contato: cell(I1, '9/25') }),
        block(B2, { isolacao: cell(I1, '9/25') }),
        // An empty registry value is not a mismatch; neither is an empty sheet value.
        block(B3, { isolacao: cell(I2, '5/26'), resistencia_contato: cell(I1, null) }),
      ],
    });
    expect(findings).toEqual([{ kind: 'cert_number_mismatch', instrument_id: I1, registry: '1001/26', sheet: '9/25', block_ids: [B1, B2] }]);
  });

  it('ignores removed and untested sheets and disabled tests, and runs only when both inputs are given', () => {
    const blocks = [
      block(B1, { isolacao: cell(I1, '9/25') }, { removed_at: '2026-09-07T10:00:00.000Z' }),
      block(B2, { isolacao: cell(I1, '9/25') }, { not_tested: { reason: 'outro', text: null, at: '2026-09-07T10:00:00.000Z', by: 'u' } }),
      block(B3, { isolacao: cell(I1, '9/25') }, { config: { block_type: 'chave_seccionadora', sub_blocks: { isolacao: { enabled: false } }, na_defaults: [] } }),
    ];
    expect(integrityFindings({ equipment: [], instruments, blocks })).toEqual([]);
    expect(integrityFindings({ equipment: [], blocks: [block(B1, { isolacao: cell(I1, '9/25') })] })).toEqual([]);
  });
});
