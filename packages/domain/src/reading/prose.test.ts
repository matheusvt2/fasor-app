import { describe, expect, it } from 'vitest';
import { proseOutputSchema, proseResultSchema } from '../contract/prose.ts';
import { fileFieldPath, sheetChecklistPath } from '../ops/path.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { idSequence, TEST_RELATORIO } from '../test-support.ts';
import {
  buildProseSuggestion,
  captionReadingOf,
  captionSkipReason,
  checklistObservationFilled,
  FULL_IMAGE_BBOX,
  ncObsReadingOf,
  ncObsSkipReason,
  offersPeopleMark,
  proseText,
} from './prose.ts';
import { ncObsReadingTargetSchema } from './target.ts';

/*
 * 9.3/9.5-UNIT: the pure core of the prose readings: the answer's text, the one `suggested`
 * fill, which photo is read, and the run-time skip reasons (Conflicts 7, 8 and 10).
 */

const id = (n: number) => `019966b0-0095-7000-8000-${n.toString(16).padStart(12, '0')}`;
const PHOTO = id(1);
const RUN = id(2);
const BLOCK = id(3);
const OP = id(4);

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function block(checklist: BlockRow['sheet']['checklist'] = {}): BlockRow {
  return {
    id: BLOCK,
    relatorio_id: TEST_RELATORIO,
    location_id: id(5),
    equipment_id: null,
    block_type: 'chave_seccionadora',
    config: {},
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), checklist },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

describe('9.3-UNIT-001 the prose contract and its text', () => {
  it('the output is {text} or null, nothing else', () => {
    expect(proseOutputSchema.parse({ text: 'Vista geral' })).toEqual({ text: 'Vista geral' });
    expect(proseOutputSchema.parse(null)).toBeNull();
    expect(proseOutputSchema.safeParse({ text: 'x', confidence: 1 }).success).toBe(false);
    expect(proseResultSchema.safeParse({ output: null, model: 'fake', prompt_version: 'p', usage: { input_tokens: 0, output_tokens: 0, usd: 0 } }).success).toBe(true);
  });

  it('proseText trims and collapses whitespace; blank or null is null', () => {
    expect(proseText({ text: '  Vista   geral\n da cabine  ' })).toBe('Vista geral da cabine');
    expect(proseText({ text: '   ' })).toBeNull();
    expect(proseText(null)).toBeNull();
    expect(proseText(undefined)).toBeNull();
  });
});

describe('9.3-UNIT-002 buildProseSuggestion', () => {
  const base = { relatorioId: TEST_RELATORIO, photoId: PHOTO, runId: RUN, promptVersion: 'fake-1' };

  it('one pending suggested fill on the whole image, no token, no hint', () => {
    const built = buildProseSuggestion({ ...base, targetPath: fileFieldPath(PHOTO, 'caption'), output: { text: ' Vista geral da cabine primária ' }, newId: idSequence() });
    expect(built.dropped).toEqual([]);
    expect(built.rows).toHaveLength(1);
    const row = built.rows[0]!;
    expect(row).toMatchObject({
      relatorio_id: TEST_RELATORIO,
      target_path: `file/${PHOTO}/caption`,
      value: 'Vista geral da cabine primária',
      trust: 'suggested',
      mode: 'fill',
      status: 'pending',
      prompt_version: 'fake-1',
      hint: null,
      source: { photo_id: PHOTO, bbox: FULL_IMAGE_BBOX, ocr_token_ids: [], reading_run_id: RUN },
    });
  });

  it('no text is no row (dropped no_text); trust is never verify', () => {
    for (const output of [null, { text: '' }, { text: ' \n ' }]) {
      const built = buildProseSuggestion({ ...base, targetPath: sheetChecklistPath(BLOCK, 'contatos', 'observation'), output, newId: idSequence() });
      expect(built.rows).toEqual([]);
      expect(built.dropped).toEqual([{ key: `sheet/${BLOCK}/checklist/contatos/observation`, reason: 'no_text' }]);
    }
  });
});

describe('9.3-UNIT-003 which photo is read as caption, and the run-time skip', () => {
  it('a photo with no sheet, no caption and no mark reads as caption', () => {
    expect(captionReadingOf({ block_id: null, caption: null, people_in_photo: false })).toEqual({ kind: 'caption', target: null });
    expect(captionReadingOf({ block_id: null, caption: '  ' })).toEqual({ kind: 'caption', target: null });
  });

  it('a mark, a caption or a sheet: no caption reading, with the reason', () => {
    expect(captionReadingOf({ block_id: null, caption: null, people_in_photo: true })).toBeNull();
    expect(captionReadingOf({ block_id: null, caption: 'Detalhe' })).toBeNull();
    expect(captionReadingOf({ block_id: BLOCK, caption: null })).toBeNull();
    expect(captionSkipReason({ block_id: BLOCK, caption: 'x', people_in_photo: true })).toBe('people_in_photo');
    expect(captionSkipReason({ block_id: BLOCK, caption: 'x' })).toBe('captioned');
    expect(captionSkipReason({ block_id: BLOCK, caption: null })).toBe('has_block');
    expect(captionSkipReason({ block_id: null, caption: null })).toBeNull();
  });

  it('E9-Q10 a tile offers "Pessoas na foto" with no sheet, or once marked (to take it back)', () => {
    expect(offersPeopleMark({ block_id: null, people_in_photo: false })).toBe(true);
    expect(offersPeopleMark({ block_id: null })).toBe(true);
    expect(offersPeopleMark({ block_id: BLOCK, people_in_photo: true })).toBe(true);
    expect(offersPeopleMark({ block_id: BLOCK, people_in_photo: false })).toBe(false);
  });
});

describe('9.5-UNIT-001 the NC draft target and its run-time skip', () => {
  it('ncObsReadingOf names the block, its type and the item; the schema parses it', () => {
    const reading = ncObsReadingOf(block(), 'contatos');
    expect(reading).toEqual({ kind: 'nc_obs', target: { block_id: BLOCK, block_type: 'chave_seccionadora', item_key: 'contatos' } });
    expect(ncObsReadingTargetSchema.safeParse(reading.target).success).toBe(true);
    expect(ncObsReadingTargetSchema.safeParse({ block_id: BLOCK, block_type: 'x' }).success).toBe(false);
  });

  it('runs only on an NC row with a blank observation', () => {
    expect(ncObsSkipReason(block({ contatos: { result: cell('NC') } }), 'contatos')).toBeNull();
    expect(ncObsSkipReason(block({ contatos: { result: cell('NC'), observation: cell('  ') } }), 'contatos')).toBeNull();
    expect(ncObsSkipReason(block({ contatos: { result: cell('C') } }), 'contatos')).toBe('not_nc');
    expect(ncObsSkipReason(block({ contatos: { result: cell('NA') } }), 'contatos')).toBe('not_nc');
    expect(ncObsSkipReason(block({ contatos: { result: cell(null) } }), 'contatos')).toBe('not_nc');
    expect(ncObsSkipReason(block(), 'contatos')).toBe('not_nc');
    expect(ncObsSkipReason(block({ contatos: { result: cell('NC'), observation: cell('Oxidado') } }), 'contatos')).toBe('observation_filled');
    // A sheet marked not tested is read-only: no draft is read for it.
    expect(ncObsSkipReason({ ...block({ contatos: { result: cell('NC') } }), not_tested: { reason: 'desenergizado', note: null } as never }, 'contatos')).toBe('not_tested');
    expect(checklistObservationFilled(block({ contatos: { observation: cell('Oxidado') } }), 'contatos')).toBe(true);
  });
});
