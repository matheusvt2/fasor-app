import { describe, expect, it } from 'vitest';
import type { RelatorioSummary } from '../contract/sync.ts';
import type { ProjectRow, RegistryRow, RelatorioRow, RelatorioStatus, TemplateRow } from '../schemas/entities.ts';
import { idSequence } from '../test-support.ts';
import {
  CADASTROS_SUBLINE,
  homeCards,
  statusBoardCounts,
  templatesSubline,
  type HomeCardsInput,
  type HomeOutboxLike,
  type SyncStateLike,
} from './cards.ts';

/*
 * AD-2: every count, order and line of text on Home is decided here. The tests walk
 * the I/O matrix rows of the story: the board counts, the four device kinds, the
 * ordering rule, the filter, the summary-only card and the empty input.
 */

const ids = idSequence('019966b0-0005-7000-8000-');
const CLIENT = ids();
const PROJECT = ids();
const TEMPLATE = ids();
const R_DRAFT = ids();
const R_FIELD_HERE = ids();
const R_FIELD_AWAY = ids();
const R_ISSUED_A = ids();
const R_ISSUED_B = ids();

const client: RegistryRow = {
  id: CLIENT,
  kind: 'client',
  name: 'Porto Seguro Companhia de Seguros Gerais',
  cnpj: null,
  contact_name: null,
  contact_phone: null,
  sites: [],
  removed_at: null,
};

const project: ProjectRow = { id: PROJECT, client_id: CLIENT, name: 'Porto Seguro', site: null, removed_at: null };

const template: TemplateRow = {
  id: TEMPLATE,
  name: 'Cabine primária — padrão',
  version: 1,
  seed_version: 'v1',
  blocks: [],
  skeleton: [],
  archived_at: null,
  removed_at: null,
};

function relatorio(
  id: string,
  status: RelatorioStatus,
  setup: Partial<RelatorioRow['setup']> = {},
): RelatorioRow {
  return {
    id,
    project_id: PROJECT,
    template_id: TEMPLATE,
    template_version: 1,
    seed_version: 'v1',
    status,
    setup: {
      service_start: null,
      service_end: null,
      atividade: null,
      local: null,
      responsible_user_id: null,
      cover_photo_file_id: null,
      escopo: null,
      exclusions: null,
      additional_info: null,
      art_trt_number: null,
      instrument_ids: [],
      site_altitude_m: null,
      site_altitude_confirmed: false,
      next_intervention_date: null,
      next_intervention_justification: null,
      ...setup,
    },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  };
}

function summary(id: string, status: RelatorioStatus): RelatorioSummary {
  return { id, project_id: PROJECT, status, template_id: TEMPLATE, seed_version: 'v1', updated_seq: 10 };
}

const onDevice = (id: string, last_sync_at: string | null = '2026-09-08T00:40:00.000Z'): SyncStateLike => ({
  id,
  complete: true,
  last_sync_at,
});

function input(overrides: Partial<HomeCardsInput> = {}): HomeCardsInput {
  return {
    relatorios: [],
    summary: [],
    projects: [project],
    clients: [client],
    templates: [template],
    syncStates: [],
    outbox: [],
    filter: null,
    online: true,
    // 07/09 23:00 in America/Sao_Paulo: the same day as the default `onDevice` stamp,
    // so a card's line is the bare time unless a test moves `now` on.
    now: new Date('2026-09-08T02:00:00.000Z'),
    ...overrides,
  };
}

describe('statusBoardCounts', () => {
  it('has every status, zeros included', () => {
    const counts = statusBoardCounts([
      { status: 'rascunho' },
      { status: 'em_campo' },
      { status: 'emitido' },
      { status: 'emitido' },
    ]);
    expect(counts).toEqual({ rascunho: 1, em_campo: 1, em_revisao: 0, emitido: 2 });
    expect(Object.keys(counts)).toEqual(['rascunho', 'em_campo', 'em_revisao', 'emitido']);
  });

  it('is all zeros for an empty device', () => {
    expect(statusBoardCounts([])).toEqual({ rascunho: 0, em_campo: 0, em_revisao: 0, emitido: 0 });
  });
});

describe('homeCards: the four lines of a card', () => {
  it('joins the client and the local, the dates and the template', () => {
    const [card] = homeCards(
      input({
        relatorios: [
          relatorio(R_FIELD_HERE, 'em_campo', {
            local: 'Torres A e B',
            service_start: '2026-09-06',
            service_end: '2026-09-08',
          }),
        ],
        syncStates: [onDevice(R_FIELD_HERE)],
      }),
    );
    expect(card!.title).toBe('Porto Seguro Companhia de Seguros Gerais · Torres A e B');
    expect(card!.meta).toBe('06–08/09/2026 · Cabine primária — padrão');
    expect(card!.statusPillId).toBe('em-campo');
    expect(card!.device).toEqual({ kind: 'on-device', text: 'No aparelho · atualizado 21:40' });
  });

  it('drops a missing part from its line and falls back when the title is empty', () => {
    const [card] = homeCards(
      input({
        relatorios: [relatorio(R_DRAFT, 'rascunho')],
        projects: [{ ...project, client_id: null }],
        templates: [],
      }),
    );
    expect(card!.title).toBe('Relatório sem identificação');
    expect(card!.meta).toBe('');
  });
});

describe('homeCards: device availability (AD-7, AD-8)', () => {
  const cases: ReadonlyArray<[string, Partial<HomeCardsInput>, { kind: string; text: string }]> = [
    [
      'on this device and complete',
      { syncStates: [onDevice(R_DRAFT)] },
      { kind: 'on-device', text: 'No aparelho · atualizado 21:40' },
    ],
    [
      'downloading',
      { syncStates: [{ id: R_DRAFT, complete: false, last_sync_at: null }] },
      { kind: 'downloading', text: 'Baixando…' },
    ],
    ['not on this device, online', { online: true }, { kind: 'absent-online', text: 'Não está neste aparelho · baixa ao abrir' }],
    [
      'not on this device, offline',
      { online: false },
      { kind: 'absent-offline', text: 'Não está neste aparelho — conecte para baixar' },
    ],
  ];

  for (const [name, overrides, expected] of cases) {
    it(name, () => {
      const [card] = homeCards(input({ relatorios: [relatorio(R_DRAFT, 'rascunho')], ...overrides }));
      expect(card!.device).toEqual(expected);
      expect(card!.isUnavailable).toBe(expected.kind === 'absent-offline');
    });
  }

  it('a copy that came down on another day carries its date, not just a time of day', () => {
    const [card] = homeCards(
      input({
        relatorios: [relatorio(R_DRAFT, 'rascunho')],
        // Downloaded on the evening of 07/09; "today" is 08/09 in America/Sao_Paulo.
        syncStates: [onDevice(R_DRAFT, '2026-09-08T00:40:00.000Z')],
        now: new Date('2026-09-08T18:00:00.000Z'),
      }),
    );
    expect(card!.device.text).toBe('No aparelho · atualizado 07/09 21:40');
  });

  it('a copy that came down today keeps the bare time', () => {
    const [card] = homeCards(
      input({
        relatorios: [relatorio(R_DRAFT, 'rascunho')],
        syncStates: [onDevice(R_DRAFT, '2026-09-08T14:05:00.000Z')],
        now: new Date('2026-09-08T18:00:00.000Z'),
      }),
    );
    expect(card!.device.text).toBe('No aparelho · atualizado 11:05');
  });

  it('a relatório known only from the company summary is a card with no local row', () => {
    const cards = homeCards(input({ summary: [summary(R_ISSUED_A, 'emitido')] }));
    expect(cards).toHaveLength(1);
    expect(cards[0]!.status).toBe('emitido');
    expect(cards[0]!.device.kind).toBe('absent-online');
    expect(cards[0]!.meta).toBe('Cabine primária — padrão');
  });

  it('a local row wins over the same id in the summary', () => {
    const cards = homeCards(
      input({
        relatorios: [relatorio(R_FIELD_HERE, 'em_campo', { local: 'Torres A e B' })],
        summary: [summary(R_FIELD_HERE, 'emitido')],
        syncStates: [onDevice(R_FIELD_HERE)],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.status).toBe('em_campo');
  });

  it('a tombstoned relatório is not a card', () => {
    const cards = homeCards(
      input({ relatorios: [{ ...relatorio(R_DRAFT, 'rascunho'), removed_at: '2026-09-07T10:00:00.000Z' }] }),
    );
    expect(cards).toEqual([]);
  });
});

describe('homeCards: ordering', () => {
  it('the Em campo relatório on this device sorts first and is the current one', () => {
    const cards = homeCards(
      input({
        relatorios: [
          relatorio(R_FIELD_AWAY, 'em_campo', { service_start: '2026-09-20' }),
          relatorio(R_FIELD_HERE, 'em_campo', { service_start: '2026-09-06' }),
        ],
        syncStates: [onDevice(R_FIELD_HERE)],
      }),
    );
    expect(cards.map((c) => c.id)).toEqual([R_FIELD_HERE, R_FIELD_AWAY]);
    expect(cards[0]!.isCurrent).toBe(true);
    expect(cards[1]!.isCurrent).toBe(false);
  });

  it('then service start descending, missing dates last, then id', () => {
    const cards = homeCards(
      input({
        relatorios: [
          relatorio(R_ISSUED_B, 'emitido'),
          relatorio(R_ISSUED_A, 'emitido'),
          relatorio(R_DRAFT, 'rascunho', { service_start: '2026-07-01' }),
          relatorio(R_FIELD_AWAY, 'em_campo', { service_start: '2026-09-06' }),
        ],
      }),
    );
    expect(cards.map((c) => c.id)).toEqual([R_FIELD_AWAY, R_DRAFT, R_ISSUED_A, R_ISSUED_B]);
  });

  it('no Em campo relatório on this device means no current card', () => {
    const cards = homeCards(input({ relatorios: [relatorio(R_FIELD_AWAY, 'em_campo')] }));
    expect(cards[0]!.isCurrent).toBe(false);
  });
});

describe('homeCards: filter and badge', () => {
  const all = {
    relatorios: [
      relatorio(R_DRAFT, 'rascunho'),
      relatorio(R_FIELD_HERE, 'em_campo'),
      relatorio(R_ISSUED_A, 'emitido'),
      relatorio(R_ISSUED_B, 'emitido'),
    ],
    syncStates: [onDevice(R_FIELD_HERE)],
  };

  it('restricts the list to one status', () => {
    expect(homeCards(input({ ...all, filter: 'emitido' })).map((c) => c.id).sort()).toEqual(
      [R_ISSUED_A, R_ISSUED_B].sort(),
    );
    expect(homeCards(input({ ...all, filter: 'em_revisao' }))).toEqual([]);
  });

  it('the board counts do not change with the filter', () => {
    const unfiltered = homeCards(input(all));
    expect(statusBoardCounts(unfiltered)).toEqual({ rascunho: 1, em_campo: 1, em_revisao: 0, emitido: 2 });
  });

  it("a card's badge counts only its own outbox rows", () => {
    const outbox: HomeOutboxLike[] = [
      { path: `sheet/${CLIENT}/observations`, status: 'pending', relatorio_id: R_FIELD_HERE },
      { path: `sheet/${PROJECT}/observations`, status: 'pending', relatorio_id: R_DRAFT },
      { path: 'relatorio/setup/local', status: 'pending', relatorio_id: R_DRAFT },
    ];
    const cards = homeCards(input({ ...all, outbox }));
    const draft = cards.find((c) => c.id === R_DRAFT)!;
    const field = cards.find((c) => c.id === R_FIELD_HERE)!;
    const issued = cards.find((c) => c.id === R_ISSUED_A)!;
    expect(draft.badgeCounts.pending).toBe(2);
    expect(field.badgeCounts.pending).toBe(1);
    expect(issued.badgeCounts.pending).toBe(0);
    expect(draft.badgeState).toBe('pending');
    expect(issued.badgeState).toBe('ok');
  });

  it('offline makes every card badge read offline', () => {
    const cards = homeCards(input({ ...all, online: false }));
    expect(cards.every((c) => c.badgeState === 'offline')).toBe(true);
  });

  it('an unreachable server reads offline on every card too, and nothing changes the device words', () => {
    const reachable = homeCards(input({ ...all, online: true }));
    const cards = homeCards(input({ ...all, online: true, reachable: false }));
    expect(cards.every((c) => c.badgeState === 'offline')).toBe(true);
    expect(cards.map((c) => c.device)).toEqual(reachable.map((c) => c.device));
  });
});

describe('homeCards: empty input', () => {
  it('returns no cards', () => {
    expect(homeCards(input())).toEqual([]);
  });
});

describe('shortcut sub-lines', () => {
  it('counts the templates on this device', () => {
    expect(templatesSubline(0)).toBe('Nenhum template neste aparelho');
    expect(templatesSubline(1)).toBe('1 template');
    expect(templatesSubline(2)).toBe('2 templates');
  });

  it('names the registries the mock names', () => {
    expect(CADASTROS_SUBLINE).toBe('Empresa · Clientes · Instrumentos · Fabricantes · Classes de tensão · Critérios');
  });
});
