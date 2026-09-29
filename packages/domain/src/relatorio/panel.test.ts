import { describe, expect, it } from 'vitest';
import type { LocationRow, SuggestionRow } from '../schemas/entities.ts';
import { SEED_VERSION } from '../seed/definitions.ts';
import {
  panelCancelOps,
  panelCreateText,
  panelLocation,
  panelProposal,
  panelProvenance,
  panelReadingLine,
  panelRetargetOps,
  panelSuggestionOf,
  panelSuggestionStatusOp,
  panelTypeChips,
  type PanelSuggestion,
} from './panel.ts';
import { newLocation } from './tree.ts';
import type { TagEquipment } from './tag.ts';

const RELATORIO = '019966b0-0010-7000-8000-000000000001';
const CABINE = '019966b0-0010-7000-8000-000000000002';
const COL1 = '019966b0-0010-7000-8000-000000000003';
const COL9 = '019966b0-0010-7000-8000-000000000004';
const OTHER_CABINE = '019966b0-0010-7000-8000-000000000005';
const OTHER_COL9 = '019966b0-0010-7000-8000-000000000006';
const PHOTO = '019966b0-0010-7000-8000-000000000007';
const BLOCK = '019966b0-0010-7000-8000-000000000008';
const author = { id: '019966b0-0010-7000-8000-000000000009', companyId: '019966b0-0010-7000-8000-00000000000a' };

function locations(): LocationRow[] {
  const rows: LocationRow[] = [];
  const add = (id: string, parentId: string | null, name: string) => rows.push({ ...newLocation(rows, { id, relatorioId: RELATORIO, parentId }), name });
  add(CABINE, null, '1° Subsolo');
  add(COL1, CABINE, 'Coluna 1');
  add(COL9, CABINE, 'Coluna 9');
  add(OTHER_CABINE, null, 'Cobertura');
  add(OTHER_COL9, OTHER_CABINE, 'Coluna 9');
  return rows;
}

const live = (tag: string): TagEquipment => ({ tag, removed_at: null });

function suggestion(value: PanelSuggestion['value'], extra: Partial<SuggestionRow> = {}): PanelSuggestion {
  return {
    value,
    row: {
      id: '019966b0-0010-7000-8000-0000000000f1',
      relatorio_id: RELATORIO,
      target_path: `file/${PHOTO}/block_id`,
      value,
      trust: 'suggested',
      mode: 'fill',
      source: { photo_id: PHOTO, bbox: [0.1, 0.1, 0.5, 0.5], ocr_token_ids: ['t0'], reading_run_id: '019966b0-0010-7000-8000-0000000000f2' },
      status: 'pending',
      prompt_version: 'fake-1',
      hint: null,
      ...extra,
    },
  };
}

const SEC9 = { block_type: 'chave_seccionadora' as const, column: 9, column_text: 'C09' };
const seed = SEED_VERSION;

describe('9.2-UNIT the panel proposal', () => {
  it('finds the newest pending panel suggestion of the photo, ignoring other paths and bad values', () => {
    const older = suggestion(SEC9).row;
    const newer = { ...older, id: '019966b0-0010-7000-8000-0000000000f9', value: { block_type: 'tp', column: 9, column_text: 'C09' } };
    const bad = { ...older, id: '019966b0-0010-7000-8000-0000000000fa', value: 'x' };
    const elsewhere = { ...older, id: '019966b0-0010-7000-8000-0000000000fb', target_path: `sheet/${BLOCK}/nameplate/tag` };
    const done = { ...newer, id: '019966b0-0010-7000-8000-0000000000fc', status: 'discarded' as const };
    expect(panelSuggestionOf([older, newer, bad, elsewhere, done], PHOTO)!.row.id).toBe(newer.id);
    expect(panelSuggestionOf([elsewhere], PHOTO)).toBeNull();
  });

  it('places the block on the coluna of the palette cabine the label names, else on the palette location', () => {
    const rows = locations();
    expect(panelLocation(rows, COL1, 9)).toMatchObject({ location: { id: COL9 }, matched: true });
    expect(panelLocation(rows, CABINE, 9)).toMatchObject({ location: { id: COL9 }, matched: true });
    expect(panelLocation(rows, COL1, 7)).toMatchObject({ location: { id: COL1 }, matched: false });
    expect(panelLocation(rows, COL1, null)).toMatchObject({ location: { id: COL1 }, matched: false });
    const removed = rows.map((row) => (row.id === COL9 ? { ...row, removed_at: '2026-09-28T10:00:00.000Z' } : row));
    expect(panelLocation(removed, COL1, 9)).toMatchObject({ location: { id: COL1 }, matched: false });
    expect(panelLocation(rows, '019966b0-0010-7000-8000-0000000000ff', 9)).toBeNull();
  });

  it('shows the read type and the next three in seed order, then Outro; all eight expanded or with no type', () => {
    const collapsed = panelTypeChips(seed, 'chave_seccionadora', false);
    expect(collapsed.chips.map((chip) => chip.label)).toEqual(['Chave seccionadora', 'Disjuntor MT', expect.stringMatching(/^TP/), expect.stringMatching(/^TC/)]);
    expect(collapsed.other).toBe(true);
    expect(panelTypeChips(seed, 'transformador_forca', false).chips.map((chip) => chip.type)).toEqual(['transformador_forca', 'cabos_entrada', 'para_raio', 'chave_seccionadora']);
    expect(panelTypeChips(seed, null, false)).toMatchObject({ other: false });
    expect(panelTypeChips(seed, null, false).chips).toHaveLength(8);
    expect(panelTypeChips(seed, 'tp', true).chips).toHaveLength(8);
  });

  it('composes "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?" with SEC-C09 taken, and confirms the suggestion', () => {
    const proposal = panelProposal({ seedVersion: seed, locations: locations(), equipment: [live('SEC-C09')], paletteLocationId: COL1, suggestion: suggestion(SEC9), pickedType: null })!;
    expect(proposal.text).toBe('Criar SEC-C09-2 · Chave seccionadora · Coluna 9?');
    expect(proposal).toMatchObject({ type: 'chave_seccionadora', tag: 'SEC-C09-2', trust: 'suggested', suggestionStatus: 'confirmed', locationPath: '1° Subsolo › Coluna 9' });
    expect(panelProvenance(proposal, suggestion(SEC9))).toEqual([
      { label: 'Tipo', text: 'frente do painel' },
      { label: 'Coluna', text: 'etiqueta "C09" na foto' },
      { label: 'TAG', text: 'tipo + coluna · SEC-C09 já existe' },
    ]);
    expect(panelCreateText('TP-C01', 'TP', 'Coluna 1')).toBe('Criar TP-C01 · TP · Coluna 1?');
  });

  it('keeps a low-confidence guess flagged Verificar, and flags a column that is not in the cabine', () => {
    const low = panelProposal({ seedVersion: seed, locations: locations(), equipment: [], paletteLocationId: COL1, suggestion: suggestion(SEC9, { trust: 'verify' }), pickedType: null })!;
    expect(low).toMatchObject({ trust: 'verify', suggestionStatus: 'confirmed', tag: 'SEC-C09' });
    const missing = panelProposal({ seedVersion: seed, locations: locations(), equipment: [], paletteLocationId: COL1, suggestion: suggestion({ ...SEC9, column: 7, column_text: 'C07' }), pickedType: null })!;
    expect(missing).toMatchObject({ trust: 'verify', suggestionStatus: 'discarded', tag: 'SEC-C01', location: { id: COL1 } });
    expect(panelProvenance(missing, suggestion({ ...SEC9, column: 7, column_text: 'C07' }))[1]!.text).toBe('etiqueta "C07" na foto · coluna não encontrada, conferir');
  });

  it('has no line until a chip is tapped when the type was not read, and a picked type recomposes and discards', () => {
    const unknown = suggestion({ block_type: null, column: 9, column_text: 'C09' });
    const base = { seedVersion: seed, locations: locations(), equipment: [live('TR-1')], paletteLocationId: COL1, suggestion: unknown };
    expect(panelProposal({ ...base, pickedType: null })).toBeNull();
    const picked = panelProposal({ ...base, pickedType: 'transformador_forca' })!;
    expect(picked).toMatchObject({ tag: 'TR-2', trust: null, suggestionStatus: 'discarded', location: { id: COL9 } });
    expect(picked.text).toBe('Criar TR-2 · Transformador de força · Coluna 9?');
    expect(panelProvenance(picked, unknown)[0]!.text).toBe('escolhido por você');
    expect(panelProvenance(picked, unknown)[2]!.text).toBe('tipo · próximo número livre');
    const same = panelProposal({ ...base, suggestion: suggestion(SEC9), pickedType: 'chave_seccionadora' })!;
    expect(same).toMatchObject({ trust: 'suggested', suggestionStatus: 'confirmed' });
  });

  it('offline: the type chips alone give the TAG on the palette location, nothing to confirm or discard', () => {
    const offline = panelProposal({ seedVersion: seed, locations: locations(), equipment: [], paletteLocationId: COL1, suggestion: null, pickedType: 'disjuntor_mt' })!;
    expect(offline).toMatchObject({ tag: 'DJ-C01', trust: null, suggestionStatus: null });
    expect(panelProvenance(offline, null)).toEqual([
      { label: 'Tipo', text: 'escolhido por você' },
      { label: 'Coluna', text: 'não lida na foto · local onde a paleta abriu' },
      { label: 'TAG', text: 'tipo + coluna · nenhuma DJ-C01 no relatório' },
    ]);
  });

  it('re-targets the photo to the new block plate, and the cancel removes it and discards its suggestion', () => {
    const ops = panelRetargetOps(author, RELATORIO, PHOTO, { id: BLOCK, block_type: 'chave_seccionadora' });
    expect(ops.map((op) => [op.kind, op.path, op.value])).toEqual([
      ['put', `file/${PHOTO}/block_id`, BLOCK],
      ['put', `file/${PHOTO}/caption`, 'placa de identificação'],
      ['put', `file/${PHOTO}/reading_target`, { block_id: BLOCK, block_type: 'chave_seccionadora' }],
      ['put', `file/${PHOTO}/reading_kind`, 'plate'],
    ]);
    expect(ops.every((op) => op.relatorio_id === RELATORIO && op.actor_id === author.id && op.scope === 'relatorio')).toBe(true);
    const row = suggestion(SEC9).row;
    expect(panelSuggestionStatusOp(author, row, 'confirmed')).toMatchObject({ path: `suggestion/${row.id}/status`, value: 'confirmed' });
    const cancel = panelCancelOps(author, RELATORIO, PHOTO, row, '2026-09-28T10:00:00.000Z');
    expect(cancel.map((op) => [op.path, op.value])).toEqual([
      [`file/${PHOTO}/removed_at`, '2026-09-28T10:00:00.000Z'],
      [`suggestion/${row.id}/status`, 'discarded'],
    ]);
    expect(panelCancelOps(author, RELATORIO, PHOTO, null, '2026-09-28T10:00:00.000Z')).toHaveLength(1);
  });
});

describe('E9-Q10 the result dialog line while no panel suggestion is there', () => {
  it('offline: the mock line; online: "Lendo a foto…" while queued or running, a reason once failed or done with nothing; none once a suggestion is there', () => {
    const line = (online: boolean, reading_status: 'none' | 'queued' | 'running' | 'done' | 'failed', read: PanelSuggestion | null = null) =>
      panelReadingLine({ online, photo: { reading_status }, suggestion: read });
    for (const status of ['queued', 'running', 'done', 'failed'] as const) {
      expect(line(false, status)).toEqual({ kind: 'offline', text: 'Sem sinal, a foto fica guardada: o bloco é criado pelo tipo e a foto já vira a placa dele.' });
    }
    expect(line(true, 'queued')).toEqual({ kind: 'waiting', text: 'Lendo a foto…' });
    expect(line(true, 'running')).toEqual({ kind: 'waiting', text: 'Lendo a foto…' });
    expect(line(true, 'failed')).toEqual({ kind: 'failed', text: 'Não foi possível ler a foto.' });
    expect(line(true, 'done')).toEqual({ kind: 'empty', text: 'A foto não mostrou o tipo do equipamento.' });
    expect(line(true, 'none')).toBeNull();
    const read = suggestion({ block_type: 'chave_seccionadora', column: 9, column_text: 'C09' });
    expect(line(true, 'done', read)).toBeNull();
    expect(line(false, 'queued', read)).toBeNull();
  });
});
