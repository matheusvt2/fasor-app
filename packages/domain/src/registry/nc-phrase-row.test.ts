import { describe, expect, it } from 'vitest';
import { parsePath, type OpPath } from '../ops/path.ts';
import { insertPhrase } from '../relatorio/ficha.ts';
import { NC_PHRASE_MAX_LENGTH, registryRowSchema, type BlockRow, type Cell, type RegistryRow } from '../schemas/entities.ts';
import { SEED_VERSION, SEED_VERSIONS } from '../seed/definitions.ts';
import {
  learnedOptionCandidates,
  learnTouchedOf,
  ncChipPhrases,
  ncPhraseRegistryGroups,
  ncPhraseRegistryRows,
  seedNcPhrasesOf,
  typedPieces,
  type LearnTouched,
  type NcPhraseRow,
} from './nc-phrase-row.ts';

/*
 * Story 14.12 (contract 23): the kernel rule of the learned options, one test per row of the
 * spec's I/O matrix the kernel decides (the server's post-pass and the routes are the api's
 * `learned-options.integration.test.ts`).
 */

const ITEM = 'abertura_e_fechamento_mecanico';
const SEED = seedNcPhrasesOf('disjuntor_mt', ITEM);
const OP = '019966b0-0300-7000-8000-000000000001';

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

type LearnBlock = Parameters<typeof learnedOptionCandidates>[0];

function block(overrides: { result?: string | null; observation?: string | null; fabricacao?: string | null; removed?: boolean; type?: BlockRow['block_type']; seed?: string } = {}): LearnBlock {
  const entry: Record<string, Cell> = {};
  if (overrides.result !== undefined) entry.result = cell(overrides.result);
  if (overrides.observation !== undefined) entry.observation = cell(overrides.observation);
  return {
    block_type: overrides.type ?? 'disjuntor_mt',
    seed_version: overrides.seed ?? SEED_VERSION,
    removed_at: overrides.removed === true ? '2026-10-21T10:00:00.000Z' : null,
    sheet: {
      nameplate: overrides.fabricacao === undefined ? {} : { fabricacao: cell(overrides.fabricacao) },
      checklist: { [ITEM]: entry },
      test: {},
    } as unknown as BlockRow['sheet'],
  };
}

const ALL: LearnTouched = { checklist: [ITEM], nameplate: ['fabricacao'] };

let seq = 0;
function phraseRow(name: string, overrides: Partial<NcPhraseRow> = {}): NcPhraseRow {
  seq += 1;
  return registryRowSchema.parse({
    id: `019966b0-0301-7000-8000-${String(seq).padStart(12, '0')}`,
    kind: 'nc_phrase',
    block_type: 'disjuntor_mt',
    item_key: ITEM,
    name,
    removed_at: null,
    ...overrides,
  }) as NcPhraseRow;
}

function manufacturerRow(name: string, removed = false): RegistryRow {
  seq += 1;
  return { id: `019966b0-0302-7000-8000-${String(seq).padStart(12, '0')}`, kind: 'manufacturer', name, gender: null, number: null, removed_at: removed ? '2026-10-21T10:00:00.000Z' : null };
}

describe('the nc_phrase registry row (contract 23)', () => {
  it('parses with a closed block type and item key', () => {
    expect(phraseRow('Fuga no bujão').kind).toBe('nc_phrase');
    expect(registryRowSchema.safeParse({ id: OP, kind: 'nc_phrase', block_type: 'fusivel', item_key: ITEM, name: 'x', removed_at: null }).success).toBe(false);
    expect(registryRowSchema.safeParse({ id: OP, kind: 'nc_phrase', block_type: 'disjuntor_mt', item_key: 'nada', name: 'x', removed_at: null }).success).toBe(false);
  });

  it('accepts a rename and a remove, refuses a put of its type or item (op_path_unknown on the server)', () => {
    expect(parsePath(`registry/nc_phrase/${OP}/name`)).toMatchObject({ family: 'registry/field', field: 'name' });
    expect(parsePath(`registry/nc_phrase/${OP}/removed_at`)).toMatchObject({ family: 'registry/field', field: 'removed_at' });
    expect(() => parsePath(`registry/nc_phrase/${OP}/block_type`)).toThrow();
    expect(() => parsePath(`registry/nc_phrase/${OP}/item_key`)).toThrow();
    expect(parsePath(`registry/nc_phrase/${OP}`)).toMatchObject({ family: 'registry', kind: 'nc_phrase' });
  });
});

describe('learnedOptionCandidates (the I/O matrix)', () => {
  it('NC typed: learns the typed observation for that type and item', () => {
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'Fuga no bujão' }), ALL, [])).toEqual({
      ncPhrases: [{ block_type: 'disjuntor_mt', item_key: ITEM, name: 'Fuga no bujão' }],
      manufacturers: [],
    });
  });

  it('Chip + typed: splits at every offered phrase and learns only the typed piece', () => {
    const learned = phraseRow('Mola fraca');
    const text = `${SEED[0]}, fuga no bujão; Mola fraca.`;
    expect(learnedOptionCandidates(block({ result: 'NC', observation: text }), ALL, [learned]).ncPhrases).toEqual([
      { block_type: 'disjuntor_mt', item_key: ITEM, name: 'fuga no bujão' },
    ]);
  });

  it('Only chips: phrases joined by insertPhrase separators teach nothing', () => {
    let text = '';
    for (const phrase of SEED) text = insertPhrase(text, phrase).text;
    text = insertPhrase(text, 'Mola fraca').text;
    expect(learnedOptionCandidates(block({ result: 'NC', observation: text }), ALL, [phraseRow('Mola fraca')]).ncPhrases).toEqual([]);
  });

  it.each([['C'], ['NA'], [null]])('Not NC: a result %j teaches nothing from the item', (result) => {
    expect(learnedOptionCandidates(block({ result, observation: 'Fuga no bujão' }), ALL, []).ncPhrases).toEqual([]);
  });

  it('Too long: a piece over 200 characters is not learned; one of exactly 200 is', () => {
    const long = 'a'.repeat(NC_PHRASE_MAX_LENGTH + 1);
    const fits = 'b'.repeat(NC_PHRASE_MAX_LENGTH);
    expect(learnedOptionCandidates(block({ result: 'NC', observation: long }), ALL, []).ncPhrases).toEqual([]);
    expect(learnedOptionCandidates(block({ result: 'NC', observation: fits }), ALL, []).ncPhrases).toHaveLength(1);
  });

  it('Duplicate: a seed phrase of any shipped version, or a live or removed row of the key, is not learned again', () => {
    expect(learnedOptionCandidates(block({ result: 'NC', observation: SEED[0]!.toUpperCase() }), ALL, []).ncPhrases).toEqual([]);
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'fuga no bujao' }), ALL, [phraseRow('Fuga no Bujão')]).ncPhrases).toEqual([]);
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'fuga no bujao' }), ALL, [phraseRow('Fuga no Bujão', { removed_at: '2026-10-21T10:00:00.000Z' })]).ncPhrases).toEqual([]);
    // A row of another item does not count.
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'fuga no bujao' }), ALL, [phraseRow('Fuga no Bujão', { item_key: 'bobinas' })]).ncPhrases).toHaveLength(1);
    // The seed check spans every shipped version that defines the item.
    for (const version of Object.keys(SEED_VERSIONS)) {
      const phrases = SEED_VERSIONS[version]!.report_types.cabine_primaria.blocks.disjuntor_mt?.checklist?.find((i) => i.key === ITEM)?.nc_phrases ?? [];
      for (const phrase of phrases) expect(SEED).toContain(phrase);
    }
  });

  it('dedupes within its own result', () => {
    const learned = phraseRow('Mola fraca');
    const text = 'Fuga no bujão, Mola fraca, fuga no bujao';
    expect(learnedOptionCandidates(block({ result: 'NC', observation: text }), ALL, [learned]).ncPhrases.map((p) => p.name)).toEqual(['Fuga no bujão']);
  });

  it('learns only from touched items and fields', () => {
    const none: LearnTouched = { checklist: [], nameplate: [] };
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'Fuga no bujão', fabricacao: 'Celtta' }), none, [])).toEqual({ ncPhrases: [], manufacturers: [] });
  });

  it('Removed block: nothing is learned', () => {
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'Fuga no bujão', fabricacao: 'Celtta', removed: true }), ALL, [])).toEqual({ ncPhrases: [], manufacturers: [] });
  });

  it('FABRICANTE typed: learns the name as typed (trimmed) when no manufacturer row matches', () => {
    expect(learnedOptionCandidates(block({ fabricacao: ' Celtta ' }), ALL, []).manufacturers).toEqual(['Celtta']);
  });

  it('FABRICANTE known: a live or removed manufacturer of that normalized name teaches nothing', () => {
    expect(learnedOptionCandidates(block({ fabricacao: 'CELTTA' }), ALL, [manufacturerRow('Celtta')]).manufacturers).toEqual([]);
    expect(learnedOptionCandidates(block({ fabricacao: 'Celttá' }), ALL, [manufacturerRow('Celtta', true)]).manufacturers).toEqual([]);
    expect(learnedOptionCandidates(block({ fabricacao: '   ' }), ALL, []).manufacturers).toEqual([]);
  });

  it('a block with no definition (unknown seed version) teaches nothing', () => {
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'Fuga', seed: 'v999' }), ALL, [])).toEqual({ ncPhrases: [], manufacturers: [] });
  });
});

describe('typedPieces (review of Story 14.12: whole phrases, any case)', () => {
  it('cuts only at a whole occurrence, bounded by the ends, whitespace or ,;.()', () => {
    expect(typedPieces('Trincado no isolador', ['Trinca'])).toEqual(['Trincado no isolador']);
    expect(typedPieces('Destrinca a mola', ['trinca'])).toEqual(['Destrinca a mola']);
    expect(typedPieces('Trinca, mola fraca', ['Trinca'])).toEqual(['mola fraca']);
    expect(typedPieces('mola fraca (trinca)', ['Trinca'])).toEqual(['mola fraca']);
    expect(typedPieces('folga (lado A), Trinca', ['Trinca'])).toEqual(['folga (lado A)']);
    expect(typedPieces('Trinca - Trinca', ['Trinca'])).toEqual([]);
    expect(typedPieces('mola fraca;Trinca.', ['Trinca'])).toEqual(['mola fraca']);
  });

  it('matches case-insensitively and takes a phrase holding regex metacharacters literally', () => {
    expect(typedPieces('TRINCA NO ISOLADOR', ['Trinca no isolador'])).toEqual([]);
    expect(typedPieces('vazamento (a+b)? e folga', ['vazamento (a+b)?'])).toEqual(['e folga']);
    expect(typedPieces('vazamento ab e folga', ['vazamento (a+b)?'])).toEqual(['vazamento ab e folga']);
  });

  it('learns nothing from a chip typed in another case, and keeps a word that only starts like a learned phrase', () => {
    const chip = phraseRow('Trinca no isolador');
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'TRINCA NO ISOLADOR' }), ALL, [chip]).ncPhrases).toEqual([]);
    const short = phraseRow('Trinca');
    expect(learnedOptionCandidates(block({ result: 'NC', observation: 'Trincado no isolador' }), ALL, [short]).ncPhrases.map((p) => p.name)).toEqual(['Trincado no isolador']);
  });
});

describe('learnedOptionCandidates with earlier names (review of Story 14.12)', () => {
  it('a phrase or a manufacturer the office renamed away is not learned again', () => {
    const renamed = phraseRow('Mola fraca na abertura');
    const earlier = { ncPhrases: [{ block_type: 'disjuntor_mt', item_key: ITEM, name: 'Mola fraca' }], manufacturers: ['Celta'] };
    const sheet = block({ result: 'NC', observation: 'mola fraca', fabricacao: 'CELTA' });
    expect(learnedOptionCandidates(sheet, ALL, [renamed, manufacturerRow('Celtta')], earlier)).toEqual({ ncPhrases: [], manufacturers: [] });
    // Another item's earlier name does not count.
    const other = { ...earlier, ncPhrases: [{ block_type: 'disjuntor_mt', item_key: 'bobinas', name: 'Mola fraca' }] };
    expect(learnedOptionCandidates(sheet, ALL, [renamed], other).ncPhrases.map((p) => p.name)).toEqual(['mola fraca']);
  });
});

describe('the nc_phrase name (review of Story 14.12)', () => {
  const row = (name: string) => ({ id: OP, kind: 'nc_phrase', block_type: 'disjuntor_mt', item_key: ITEM, name, removed_at: null });
  it('is never blank and at most NC_PHRASE_MAX_LENGTH characters', () => {
    expect(registryRowSchema.safeParse(row('')).success).toBe(false);
    expect(registryRowSchema.safeParse(row('   ')).success).toBe(false);
    expect(registryRowSchema.safeParse(row('a'.repeat(NC_PHRASE_MAX_LENGTH + 1))).success).toBe(false);
    expect(registryRowSchema.safeParse(row('a'.repeat(NC_PHRASE_MAX_LENGTH))).success).toBe(true);
    expect(registryRowSchema.safeParse(row('a')).success).toBe(true);
  });
});

describe('learnTouchedOf', () => {
  it('collects the checklist items and nameplate fields of a push per block', () => {
    const a = '019966b0-0303-7000-8000-000000000001';
    const b = '019966b0-0303-7000-8000-000000000002';
    const paths: OpPath[] = [
      `sheet/${a}/checklist/${ITEM}/result`,
      `sheet/${a}/checklist/${ITEM}/observation`,
      `sheet/${a}/nameplate/fabricacao`,
      `sheet/${b}/checklist/bobinas/observation`,
      `sheet/${b}/conclusion/text`,
      `block/${b}/removed_at`,
    ].map(parsePath);
    expect(learnTouchedOf(paths)).toEqual(
      new Map([
        [a, { checklist: [ITEM], nameplate: ['fabricacao'] }],
        [b, { checklist: ['bobinas'], nameplate: [] }],
      ]),
    );
  });
});

describe('ncChipPhrases (the only chip list)', () => {
  it('offers the seed, then the live learned phrases of the type and item by id, then the recents, once each', () => {
    const first = phraseRow('Fuga no bujão');
    const second = phraseRow('Mola fraca');
    const removed = phraseRow('Removida', { removed_at: '2026-10-21T10:00:00.000Z' });
    const other = phraseRow('Outro item', { item_key: 'bobinas' });
    const otherType = phraseRow('Outro tipo', { block_type: 'tp' });
    const chips = ncChipPhrases({
      seeded: SEED,
      learned: [second, removed, other, otherType, first, manufacturerRow('WEG')],
      blockType: 'disjuntor_mt',
      itemKey: ITEM,
      recents: ['fuga no bujao', 'Texto recente', SEED[0]!.toUpperCase()],
    });
    expect(chips).toEqual([...SEED, 'Fuga no bujão', 'Mola fraca', 'Texto recente']);
  });

  it('a site item (no type) offers no learned phrase', () => {
    expect(ncChipPhrases({ seeded: ['A'], learned: [phraseRow('Fuga')], blockType: null, itemKey: ITEM, recents: ['B'] })).toEqual(['A', 'B']);
  });
});

describe('ncPhraseRegistryRows (Cadastros › Frases de NC)', () => {
  it('lists the live rows by type name, item name and phrase, with the item as the secondary line', () => {
    const rows = [
      phraseRow('Zebra', { block_type: 'tp', item_key: 'limpeza' as NcPhraseRow['item_key'] }),
      phraseRow('Mola fraca'),
      phraseRow('Fuga no bujão'),
      phraseRow('Removida', { removed_at: '2026-10-21T10:00:00.000Z' }),
    ].filter((row) => registryRowSchema.safeParse(row).success);
    const listed = ncPhraseRegistryRows(rows);
    expect(listed.map((entry) => entry.text.primary)).toEqual(['Fuga no bujão', 'Mola fraca', 'Zebra']);
    expect(listed[0]!.group).toBe('Disjuntor MT');
    expect(listed[0]!.text.secondary).toBe('Abertura e fechamento mecânico');
    expect(ncPhraseRegistryGroups(rows).map((group) => [group.label, group.rows.length])).toEqual([
      ['Disjuntor MT', 2],
      ['TP', 1],
    ]);
  });
});

describe('Story 15.3 (seed v9): the learned phrases of the dropped transformer item `indicador_nivel_de_oleo`', () => {
  const DROPPED = 'indicador_nivel_de_oleo';
  const learned = [phraseRow('visor do nível embaçado', { block_type: 'transformador_forca', item_key: DROPPED })];
  /** The chips each checklist row of a sheet on `version` offers, by item. */
  const chipsBySheet = (version: string) =>
    Object.fromEntries(
      SEED_VERSIONS[version]!.report_types.cabine_primaria.blocks.transformador_forca!.checklist!.map((item) => [
        item.key,
        ncChipPhrases({ seeded: item.nc_phrases, learned, blockType: 'transformador_forca', itemKey: item.key, recents: [] }),
      ]),
    );

  it('are not offered on a v9 sheet (it has no such row), are offered on a v8 one, and stay in the office list', () => {
    const v9 = chipsBySheet('v9');
    expect(Object.keys(v9)).not.toContain(DROPPED);
    expect(Object.values(v9).flat()).not.toContain('visor do nível embaçado');
    expect(chipsBySheet('v8')[DROPPED]).toEqual(['nível de óleo abaixo do mínimo', 'indicador de nível ilegível', 'indicador de nível danificado', 'visor do nível embaçado']);
    expect(ncPhraseRegistryRows(learned).map((entry) => [entry.row.name, entry.text.secondary])).toEqual([['visor do nível embaçado', 'Indicador nível de óleo']]);
  });

  it('the kept item 13 offers the absorbed "indicador de nível danificado" on v9; the seed phrases across versions keep first-seen order', () => {
    expect(chipsBySheet('v9').oleo_isolante_indicador_de_nivel).toEqual(['nível de óleo abaixo do mínimo', 'óleo com coloração escura', 'indicador de nível ilegível', 'indicador de nível danificado']);
    expect(seedNcPhrasesOf('transformador_forca', 'oleo_isolante_indicador_de_nivel')).toEqual([
      'nível de óleo abaixo do mínimo',
      'óleo com coloração escura',
      'indicador de nível ilegível',
      'indicador de nível danificado',
    ]);
    expect(seedNcPhrasesOf('transformador_forca', DROPPED)).toHaveLength(3);
  });
});
