import { describe, expect, it } from 'vitest';
import { homeCards, homeList, noSearchMatchText, type HomeCard } from '../home/cards.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { captionPartsOf, composeCaption, contextCaption, contextCaptionParts, NC_CAPTION_LEAD, type ContextCaptionMeta } from '../photos/caption.ts';
import { galleryCabineOptions } from '../photos/gallery.ts';
import { pluralImageRuns, resolveSection8 } from '../print/section-8.ts';
import { newPointRow } from '../points/checks.ts';
import { nextEditNote } from '../print/revisions.ts';
import { pointTextPieces } from '../points/display.ts';
import { ncRowPointText, withPhotoTokens } from '../points/derived.ts';
import { photoToken } from '../points/refs.ts';
import type { BlockRow, Cell, LocationRow, RelatorioStatus } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, findDefinition, getSeed, SEED_VERSION, siteItems } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { testApplicability } from './applicability.ts';
import { insertPhrase, sheetOrder } from './ficha.ts';
import { instantiateTemplate } from './instantiate.ts';
import { ncAbertosText } from './progress.ts';
import { fixedRowNote } from './sumario.ts';
import { formatServiceDates } from '../format/datetime.ts';

/*
 * 27.9-UNIT (Story 27.9, F29 to F40): the wording pass, each derived sentence old and new. The screen half reads on
 * every seed; the printed half (the NC photo caption, the point's closing clause, the plural reference in section 8)
 * only on a seed whose `wording_pass` is on (v17), so a v16 relatório keeps its words.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-2790-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId: idSequence('019966b0-2791-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-2792-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

/** The same relatório on seed v16: its row and every sheet. */
function onV16(snapshot: RelatorioSnapshot): RelatorioSnapshot {
  return {
    ...snapshot,
    relatorio: { ...snapshot.relatorio, seed_version: 'v16' },
    blocks: snapshot.blocks.map((block) => ({ ...block, seed_version: 'v16' })),
  };
}

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: '019966b0-2793-7000-8000-000000000001' });
const PHOTO_A = '019966b0-2794-7000-8000-00000000000a';
const PHOTO_B = '019966b0-2794-7000-8000-00000000000b';

function photo(snapshot: RelatorioSnapshot, id: string, owner: { block_id: string | null; location_id?: string | null }, itemKey: string, at: string) {
  return {
    id,
    relatorio_id: snapshot.relatorio.id,
    kind: 'photo' as const,
    sha256: 'x',
    mime: 'image/jpeg',
    size: 1,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: at,
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: owner.block_id,
    location_id: owner.location_id ?? null,
    item_key: itemKey,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none' as const,
    people_in_photo: false,
  };
}

function firstSheet(snapshot: RelatorioSnapshot, type: string): BlockRow {
  const node = sheetOrder(snapshot).find((one) => snapshot.blocks.find((block) => block.id === one.blockId)?.block_type === type)!;
  return snapshot.blocks.find((block) => block.id === node.blockId)!;
}

/** The relatório with its first chave seccionadora's first checklist row NC ("ressecadas"), holding `photos` of that row. */
function withNcRow(base: RelatorioSnapshot, photoIds: readonly string[], observation: string | null = 'isoladores ressecados'): { snapshot: RelatorioSnapshot; block: BlockRow; key: string; label: string } {
  const sheet = firstSheet(base, 'chave_seccionadora');
  const item = findDefinition(sheet.seed_version, sheet.block_type)!.checklist![0]!;
  const answer = observation === null ? { result: cell('NC') } : { result: cell('NC'), observation: cell(observation) };
  const block: BlockRow = { ...sheet, sheet: { ...sheet.sheet, checklist: { ...sheet.sheet.checklist, [item.key]: answer } } };
  const files = photoIds.map((id, i) => photo(base, id, { block_id: block.id }, item.key, `2026-09-06T1${i}:00:00.000Z`));
  return { snapshot: { ...base, blocks: base.blocks.map((one) => (one.id === block.id ? block : one)), files: [...base.files, ...files] }, block, key: item.key, label: item.label.toLocaleLowerCase('pt-BR') };
}

describe('27.9-UNIT agreement (F32, F33, F34) and no internal words (F39)', () => {
  it('"NC aberta" / "NC abertas", the count agreeing with não conformidade; was "NC aberto" / "NC abertos"', () => {
    expect(ncAbertosText(0)).toBe('0 NC abertas');
    expect(ncAbertosText(1)).toBe('1 NC aberta');
    expect(ncAbertosText(2)).toBe('2 NC abertas');
    expect(ncAbertosText(1)).not.toBe('1 NC aberto');
  });

  it('the photo filter\'s first chip reads "Todas" (fotos); was "Todos"', () => {
    expect(galleryCabineOptions(fresh(), [])[0]).toEqual({ id: 'all', label: 'Todas' });
  });

  it('"Ainda não enviado ao cliente", the masculine of "Marcar como enviado ao cliente"; was "Ainda não enviada"', () => {
    expect(nextEditNote(1, { status: 'em_revisao', edited: false })).toBe('Ainda não enviado ao cliente. Qualquer alteração a partir de agora gera a revisão 2.');
    expect(nextEditNote(1, { status: 'emitido', edited: false })).toBe('Enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 2.');
  });

  it('the Controle do documento row reads "preenchido automaticamente"; was "montado sozinho"', () => {
    expect(fixedRowNote('controle')).toBe('preenchido automaticamente');
  });
});

describe('27.9-UNIT the joins (F36)', () => {
  it('a phrase joined after a comma starts in lower case; the first phrase keeps its case; an acronym is kept', () => {
    const first = insertPhrase('', 'Luvas ausentes');
    expect(first.text).toBe('Luvas ausentes');
    expect(insertPhrase(first.text, 'Luvas com furos').text).toBe('Luvas ausentes, luvas com furos');
    expect(insertPhrase('Luvas ausentes,', 'Luvas com furos').text).toBe('Luvas ausentes, luvas com furos');
    expect(insertPhrase('Luvas ausentes', 'TC sem placa').text).toBe('Luvas ausentes, TC sem placa');
    // A phrase already joined, in either case, is not repeated.
    expect(insertPhrase('Luvas ausentes, luvas com furos', 'Luvas com furos').text).toBe('Luvas ausentes, luvas com furos');
    // Before: "ausentes, Luvas com furos".
    expect(insertPhrase(first.text, 'Luvas com furos').text).not.toBe('Luvas ausentes, Luvas com furos');
  });

  it('v17: a point started from an NC row ends ", conforme Imagem 1" / ", conforme Imagens 1 e 2"; no photo, no clause', () => {
    const none = withNcRow(fresh(), []);
    expect(ncRowPointText(none.snapshot, { block: none.block }, none.key)).toBe(`Item 1 (${none.label}): isoladores ressecados`);
    const one = withNcRow(fresh(), [PHOTO_A]);
    const text1 = ncRowPointText(one.snapshot, { block: one.block }, one.key);
    expect(text1).toBe(`Item 1 (${one.label}): isoladores ressecados, conforme ${photoToken(PHOTO_A)}`);
    expect(pointTextPieces(text1, new Map([[PHOTO_A, 1]])).map((piece) => (piece.kind === 'text' ? piece.text : piece.label)).join('')).toBe(`Item 1 (${one.label}): isoladores ressecados, conforme Imagem 1`);
    const two = withNcRow(fresh(), [PHOTO_A, PHOTO_B]);
    const text2 = ncRowPointText(two.snapshot, { block: two.block }, two.key);
    expect(text2).toBe(`Item 1 (${two.label}): isoladores ressecados, conforme ${photoToken(PHOTO_A)} e ${photoToken(PHOTO_B)}`);
    const numbers = new Map([
      [PHOTO_A, 1],
      [PHOTO_B, 2],
    ]);
    expect(pointTextPieces(text2, numbers).map((piece) => (piece.kind === 'text' ? piece.text : piece.label)).join('')).toBe(`Item 1 (${two.label}): isoladores ressecados, conforme Imagens 1 e 2`);
    // A photo taken just before the tap joins the clause's list.
    expect(withPhotoTokens(text1, [PHOTO_A, PHOTO_B], SEED_VERSION)).toBe(text2);
    // The tokens alone with no text, as before.
    expect(withPhotoTokens('', [PHOTO_A], SEED_VERSION)).toBe(photoToken(PHOTO_A));
  });

  it('v16: the point keeps its bare tokens ("ressecados [[foto]]") and its print', () => {
    const one = withNcRow(onV16(fresh()), [PHOTO_A]);
    const text = ncRowPointText(one.snapshot, { block: one.block }, one.key);
    expect(text).toBe(`Item 1 (${one.label}): isoladores ressecados ${photoToken(PHOTO_A)}`);
    expect(withPhotoTokens(text, [PHOTO_A, PHOTO_B], 'v16')).toBe(`${text} ${photoToken(PHOTO_B)}`);
  });

  it('the print of a v17 relatório reads a list of references as one plural; a single one as before', () => {
    expect(pluralImageRuns('conforme Imagem 1 e Imagem 2.')).toBe('conforme Imagens 1 e 2.');
    expect(pluralImageRuns('conforme Imagem 1, Imagem 2 e Imagem 3')).toBe('conforme Imagens 1, 2 e 3');
    expect(pluralImageRuns('conforme Imagem 4')).toBe('conforme Imagem 4');
    // A card's reference the numbering lacks breaks the list: each reads alone.
    expect(pointTextPieces(`ver ${photoToken(PHOTO_A)} e ${photoToken(PHOTO_B)}`, new Map([[PHOTO_A, 1]])).map((piece) => (piece.kind === 'photo' ? piece.label : piece.text))).toEqual(['ver ', 'Imagem 1', ' e ', null]);
  });
});

/*
 * Batch e27c (wave 2 review W1, W5): the citation clause after an observation's own closing mark, an NC row with no
 * observation, and a photo cited twice; in the stored text and in section 8's print. v16 keeps its words.
 */
describe('e27c-UNIT the citation clause (W1, W5)', () => {
  const numbers = new Map([
    [PHOTO_A, 1],
    [PHOTO_B, 2],
  ]);
  /** What section 8 prints for a point holding `text` on `snapshot`'s seed. */
  const printed = (snapshot: RelatorioSnapshot, text: string): string => {
    const row = newPointRow({ id: '019966b0-2795-7000-8000-000000000001', relatorioId: snapshot.relatorio.id, text, equipmentId: null, origin: 'manual', action: null }, snapshot.points);
    return resolveSection8({ ...snapshot, points: [...snapshot.points, row] }, numbers).at(-1)!.text;
  };
  const stored = (observation: string | null, photoIds: readonly string[], base: RelatorioSnapshot = fresh()) => {
    const nc = withNcRow(base, photoIds, observation);
    return { text: ncRowPointText(nc.snapshot, { block: nc.block }, nc.key), label: nc.label, snapshot: nc.snapshot };
  };

  it.each([
    ['.', 'Oxidação nos terminais.'],
    ['!', 'Oxidação nos terminais!'],
    ['?', 'Oxidação nos terminais?'],
    ['...', 'Oxidação nos terminais...'],
    ['none', 'Oxidação nos terminais'],
  ])('W1: an observation ending in %s gives "…terminais, conforme Imagem 1" (was "…terminais., conforme")', (_, observation) => {
    const one = stored(observation, [PHOTO_A]);
    expect(one.text).toBe(`Item 1 (${one.label}): Oxidação nos terminais, conforme ${photoToken(PHOTO_A)}`);
    expect(printed(one.snapshot, one.text)).toBe(`Item 1 (${one.label}): Oxidação nos terminais, conforme Imagem 1`);
    const two = stored(observation, [PHOTO_A, PHOTO_B]);
    expect(printed(two.snapshot, two.text)).toBe(`Item 1 (${two.label}): Oxidação nos terminais, conforme Imagens 1 e 2`);
  });

  it('W1: a closing ";", ":" or "," goes too; "etc." keeps its period; with no photo the text stays as typed', () => {
    for (const observation of ['Oxidação nos terminais;', 'Oxidação nos terminais:', 'Oxidação nos terminais,']) {
      const one = stored(observation, [PHOTO_A]);
      expect(one.text).toBe(`Item 1 (${one.label}): Oxidação nos terminais, conforme ${photoToken(PHOTO_A)}`);
    }
    const etc = stored('Oxidação, sujeira etc.', [PHOTO_A]);
    expect(etc.text).toBe(`Item 1 (${etc.label}): Oxidação, sujeira etc., conforme ${photoToken(PHOTO_A)}`);
    const none = stored('Oxidação nos terminais.', []);
    expect(none.text).toBe(`Item 1 (${none.label}): Oxidação nos terminais.`);
  });

  it('W1: a photo taken just before the tap joins a text that ends in a period the same way', () => {
    expect(withPhotoTokens('Oxidação nos terminais.', [PHOTO_A], SEED_VERSION)).toBe(`Oxidação nos terminais, conforme ${photoToken(PHOTO_A)}`);
    expect(withPhotoTokens('Oxidação nos terminais...', [PHOTO_A, PHOTO_B], SEED_VERSION)).toBe(`Oxidação nos terminais, conforme ${photoToken(PHOTO_A)} e ${photoToken(PHOTO_B)}`);
    // v16 as before: the bare tokens after the text.
    expect(withPhotoTokens('Oxidação nos terminais.', [PHOTO_A], 'v16')).toBe(`Oxidação nos terminais. ${photoToken(PHOTO_A)}`);
  });

  it('W5 (a): an NC row with no observation and a photo reads "Item 1 (⟨item⟩) não conforme (Imagem 1)"; was "não conforme, conforme Imagem 1"', () => {
    const one = stored(null, [PHOTO_A]);
    expect(one.text).toBe(`Item 1 (${one.label}) não conforme (${photoToken(PHOTO_A)})`);
    expect(printed(one.snapshot, one.text)).toBe(`Item 1 (${one.label}) não conforme (Imagem 1)`);
    expect(pointTextPieces(one.text, numbers).map((piece) => (piece.kind === 'text' ? piece.text : piece.label)).join('')).toBe(`Item 1 (${one.label}) não conforme (Imagem 1)`);
    const two = stored(null, [PHOTO_A, PHOTO_B]);
    expect(printed(two.snapshot, two.text)).toBe(`Item 1 (${two.label}) não conforme (Imagens 1 e 2)`);
    // A photo taken just before the tap joins the parentheses.
    expect(withPhotoTokens(one.text, [PHOTO_A, PHOTO_B], SEED_VERSION)).toBe(two.text);
    // No photo: no parentheses.
    expect(stored(null, []).text).toBe(`Item 1 (${one.label}) não conforme`);
    // v16 as before.
    const v16 = stored(null, [PHOTO_A], onV16(fresh()));
    expect(v16.text).toBe(`Item 1 (${v16.label}) não conforme ${photoToken(PHOTO_A)}`);
  });

  it('W5 (b): the same photo cited twice in a list is cited once, on the card and in the print; v16 prints as before', () => {
    const twice = `Oxidação, conforme ${photoToken(PHOTO_A)} e ${photoToken(PHOTO_A)}`;
    const snapshot = fresh();
    expect(printed(snapshot, twice)).toBe('Oxidação, conforme Imagem 1');
    expect(pointTextPieces(twice, numbers).map((piece) => (piece.kind === 'text' ? piece.text : piece.label)).join('')).toBe('Oxidação, conforme Imagem 1');
    const thrice = `Oxidação, conforme ${photoToken(PHOTO_A)}, ${photoToken(PHOTO_B)} e ${photoToken(PHOTO_A)}`;
    expect(printed(snapshot, thrice)).toBe('Oxidação, conforme Imagens 1 e 2');
    expect(pointTextPieces(thrice, numbers).map((piece) => (piece.kind === 'text' ? piece.text : piece.label)).join('')).toBe('Oxidação, conforme Imagens 1 e 2');
    expect(pluralImageRuns('conforme Imagem 1 e Imagem 1.')).toBe('conforme Imagem 1.');
    // Without a repeat the run prints as Story 27.9 left it, separators kept.
    expect(pluralImageRuns('Imagem 1 e Imagem 2 e Imagem 3')).toBe('Imagens 1 e 2 e 3');
    expect(printed(onV16(snapshot), twice)).toBe('Oxidação, conforme Imagem 1 e Imagem 1');
  });

  it.each([
    ['aprox.', 'Distância aprox.'],
    ['etc.', 'Oxidação, sujeira etc.'],
    ['máx.', 'Corrente máx.'],
    ['MÍN.', 'Nível MÍN.'],
    ['nº.', 'Ver placa nº.'],
    ['ref.', 'Conforme ref.'],
    ['Obs.', 'Ver Obs.'],
    ['cf.', 'Ver cf.'],
  ])('e27d X6: an abbreviation (%s) keeps its period before the clause; was "Distância aprox, conforme Imagem 1"', (_, observation) => {
    const one = stored(observation, [PHOTO_A]);
    expect(one.text).toBe(`Item 1 (${one.label}): ${observation}, conforme ${photoToken(PHOTO_A)}`);
    expect(printed(one.snapshot, one.text)).toBe(`Item 1 (${one.label}): ${observation}, conforme Imagem 1`);
    expect(withPhotoTokens(observation, [PHOTO_A], SEED_VERSION)).toBe(`${observation}, conforme ${photoToken(PHOTO_A)}`);
  });

  it('e27d X6: an abbreviation keeps one period of a longer closing run; a word that only ends like one, or one apart from its period, does not', () => {
    expect(withPhotoTokens('Distância aprox.;', [PHOTO_A], SEED_VERSION)).toBe(`Distância aprox., conforme ${photoToken(PHOTO_A)}`);
    expect(withPhotoTokens('Distância aprox...', [PHOTO_A], SEED_VERSION)).toBe(`Distância aprox., conforme ${photoToken(PHOTO_A)}`);
    // The ellipsis character is a closing run, not a period: it goes, as "..." does.
    expect(withPhotoTokens('Distância aprox…', [PHOTO_A], SEED_VERSION)).toBe(`Distância aprox, conforme ${photoToken(PHOTO_A)}`);
    // "href." and "cobs." end with the letters of "ref" and "obs" but are other words.
    expect(withPhotoTokens('Ver href.', [PHOTO_A], SEED_VERSION)).toBe(`Ver href, conforme ${photoToken(PHOTO_A)}`);
    expect(withPhotoTokens('Ver cobs.', [PHOTO_A], SEED_VERSION)).toBe(`Ver cobs, conforme ${photoToken(PHOTO_A)}`);
    // A space between the word and its period: not an abbreviation.
    expect(withPhotoTokens('Distância aprox .', [PHOTO_A], SEED_VERSION)).toBe(`Distância aprox, conforme ${photoToken(PHOTO_A)}`);
    // The abbreviation alone is a text too.
    expect(withPhotoTokens('etc.', [PHOTO_A], SEED_VERSION)).toBe(`etc., conforme ${photoToken(PHOTO_A)}`);
  });

  it.each([
    ['…', 'Oxidação nos terminais…'],
    ['…!', 'Oxidação nos terminais…!'],
    ['.…', 'Oxidação nos terminais.…'],
  ])('e27d X6: a closing "%s" goes like "..." (was kept: "terminais…, conforme")', (_, observation) => {
    const one = stored(observation, [PHOTO_A]);
    expect(one.text).toBe(`Item 1 (${one.label}): Oxidação nos terminais, conforme ${photoToken(PHOTO_A)}`);
  });

  it('e27d X6: v16 keeps its bare tokens after an abbreviation and after "…"', () => {
    expect(withPhotoTokens('Distância aprox.', [PHOTO_A], 'v16')).toBe(`Distância aprox. ${photoToken(PHOTO_A)}`);
    expect(withPhotoTokens('Oxidação nos terminais…', [PHOTO_A], 'v16')).toBe(`Oxidação nos terminais… ${photoToken(PHOTO_A)}`);
    const v16 = stored('Distância aprox.', [PHOTO_A], onV16(fresh()));
    expect(v16.text).toBe(`Item 1 (${v16.label}): Distância aprox. ${photoToken(PHOTO_A)}`);
  });
});

describe('27.9-UNIT applicability in sentence case (F37)', () => {
  it('"Não se aplica: Tipo de seccionadora sem fusíveis." names the field in sentence case; was its capitals', () => {
    const v13 = getSeed('v13', 'cabine_primaria');
    const definition = v13.blocks.chave_seccionadora;
    const field = definition.nameplate.find((one) => one.key === 'tipo_seccionadora')!;
    const block = { sheet: { nameplate: { [field.key]: cell('SEM CARGA') }, checklist: {}, test: {} } } as unknown as BlockRow;
    const applicability = testApplicability(block, definition, 'resistencia_fusiveis');
    expect(field.label).toBe('TIPO DE SECCIONADORA');
    expect(applicability.reason?.startsWith('Não se aplica: Tipo de seccionadora ')).toBe(true);
    expect(applicability.reason).not.toContain('TIPO DE SECCIONADORA');
  });
});

describe('27.9-UNIT the caption of an NC photo (F40)', () => {
  const seed = getSeed(SEED_VERSION, 'cabine_primaria');
  const meta: ContextCaptionMeta = { step: 'verificacoes', testKey: null, words: { atividades: seed.atividades, locais: seed.locais }, registry: [] };

  it('v17: a photo on a checklist row answered NC is born "Não conformidade em ⟨item⟩ n⟨o/a⟩ ⟨equipamento⟩…"; on a C row as before', () => {
    const nc = withNcRow(fresh(), [PHOTO_A]);
    const caption = contextCaption({ block_id: nc.block.id, item_key: nc.key }, nc.snapshot, meta)!;
    expect(caption.startsWith(`${NC_CAPTION_LEAD} ${nc.label} na chave seccionadora`)).toBe(true);
    expect(caption).not.toContain('Detalhe da verificação');
    const c: RelatorioSnapshot = { ...nc.snapshot, blocks: nc.snapshot.blocks.map((block) => (block.id === nc.block.id ? { ...block, sheet: { ...block.sheet, checklist: { [nc.key]: { result: cell('C') } } } } : block)) };
    expect(contextCaption({ block_id: nc.block.id, item_key: nc.key }, c, meta)!.startsWith('Detalhe da verificação de')).toBe(true);
  });

  it('the composer reads an NC caption back into its parts, so a chip tap keeps "Não conformidade em"', () => {
    const nc = withNcRow(fresh(), [PHOTO_A]);
    const shot = { block_id: nc.block.id, item_key: nc.key };
    const prefill = contextCaptionParts(shot, nc.snapshot, meta);
    expect(prefill.atividade).toMatchObject({ name: nc.label, nc: true });
    const stored = contextCaption(shot, nc.snapshot, meta)!;
    const parts = captionPartsOf(stored, prefill)!;
    expect(composeCaption(parts)).toBe(stored);
    expect(composeCaption({ ...parts, local: { name: 'Oxigênio', gender: 'm', number: 'singular' } })).toBe(`${NC_CAPTION_LEAD} ${nc.label} na chave seccionadora ${parts.equipamento!.name.replace(/^chave seccionadora /, '')} do Oxigênio`);
  });

  it('v16: the NC photo keeps "Detalhe da verificação de ⟨item⟩ realizada…"', () => {
    const nc = withNcRow(onV16(fresh()), [PHOTO_A]);
    expect(contextCaption({ block_id: nc.block.id, item_key: nc.key }, nc.snapshot, meta)!.startsWith('Detalhe da verificação de')).toBe(true);
  });

  it('a site item answered NC: "Não conformidade em ⟨item⟩ d⟨o/a⟩ ⟨local⟩" on v17, "Verificação de" on v16', () => {
    const base = fresh();
    const item = siteItems(SEED_VERSION)[0]!;
    const local = base.locations.find((row) => row.kind === 'cabine')!;
    const answered = (snapshot: RelatorioSnapshot): RelatorioSnapshot => ({
      ...snapshot,
      locations: snapshot.locations.map((row) => (row.id === local.id ? ({ ...row, checklist: { [item.key]: { result: cell('NC') } } } as LocationRow) : row)),
    });
    const shot = { block_id: null, item_key: item.key, location_id: local.id };
    expect(contextCaption(shot, answered(base), meta)!.startsWith(`${NC_CAPTION_LEAD} `)).toBe(true);
    expect(contextCaption(shot, answered(onV16(base)), meta)!.startsWith('Verificação de ')).toBe(true);
  });
});

describe('27.9-UNIT the Home search (F29)', () => {
  const card = (id: string, status: RelatorioStatus, keys: string[]): HomeCard => ({ id, status, searchKeys: keys }) as unknown as HomeCard;
  const cards = [card('a', 'emitido', ['seguradora exemplo', 'cabine primaria — padrao', '06/09/2026']), card('b', 'em_revisao', ['outro cliente'])];

  it('with "Em revisão" pressed and a search matching only an Emitido one, the message names the filter and the count elsewhere', () => {
    const list = homeList(cards, { filter: 'em_revisao', pageSize: 10, query: 'Seguradora' });
    expect(list.total).toBe(0);
    expect(list.empty).toEqual({ kind: 'none-for-query', text: 'Nenhum relatório com status Em revisão encontrado para Seguradora. 1 relatório em outro status.' });
    expect(noSearchMatchText('X', 'em_revisao', 2)).toBe('Nenhum relatório com status Em revisão encontrado para X. 2 relatórios em outros status.');
    // Nothing elsewhere, or no tile pressed: the message as before.
    expect(homeList(cards, { filter: 'em_revisao', pageSize: 10, query: 'nada' }).empty).toEqual({ kind: 'none-for-query', text: 'Nenhum relatório encontrado para nada.' });
    expect(noSearchMatchText('X')).toBe('Nenhum relatório encontrado para X.');
  });

  it('the search matches the template name and the dates as the card shows them', () => {
    expect(homeList(cards, { filter: null, pageSize: 10, query: 'padrão' }).cards.map((one) => one.id)).toEqual(['a']);
    expect(homeList(cards, { filter: null, pageSize: 10, query: '06/09' }).cards.map((one) => one.id)).toEqual(['a']);
  });

  it('a card\'s keys carry its template name and its dates as `formatServiceDates` writes them', () => {
    const snapshot = fresh();
    const [one] = homeCards({
      definitions: EMPTY_DEFINITION_CONTEXT,
      relatorios: [{ ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, service_start: '2026-09-06', service_end: '2026-09-08' }, template_id: 'tpl' }],
      summary: [],
      projects: [],
      clients: [],
      templates: [{ id: 'tpl', name: 'Cabine primária — padrão', version: 1, seed_version: SEED_VERSION, blocks: [], skeleton: [], archived_at: null, removed_at: null }],
      syncStates: [],
      outbox: [],
      filter: null,
      online: true,
      now: new Date('2026-09-08T02:00:00.000Z'),
    });
    expect(one!.searchKeys).toContain('cabine primaria — padrao');
    const dates = normalizeRegistryName(formatServiceDates('2026-09-06', '2026-09-08'));
    expect(dates).not.toBe('');
    expect(one!.searchKeys).toContain(dates);
    expect(homeList([one!], { filter: null, pageSize: 10, query: formatServiceDates('2026-09-06', '2026-09-08') }).total).toBe(1);
  });
});
