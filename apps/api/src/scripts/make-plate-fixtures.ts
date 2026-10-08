import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDefinition, SEED_VERSION, type FieldDef } from '@app/domain';
import sharp from 'sharp';

/*
 * Story 13.7 (E78-Q2 closed): the synthetic plates of the five nameplate block types that had
 * no default fixture (para_raio, chave_seccionadora, disjuntor_mt, tp, tc). A one-off,
 * re-runnable generator, never run by `pnpm verify` (no test glob matches it):
 *
 *   docker compose --profile tools run --rm tools pnpm exec tsx apps/api/src/scripts/make-plate-fixtures.ts
 *
 * For each type it lays out a plate (a header with the type's label, then one row per field:
 * the seed label's words at the left, the value's tokens at the right), draws it as an inline
 * SVG rendered by sharp to a 1200 x 900 PNG, and writes `fixtures/images/plate-<type>.png`
 * and `fixtures/<sha256 of that PNG>.json`. Every token box is measured, not placed by hand:
 * the token is drawn alone at its layout position on a white page and the page trimmed to the
 * ink. The values are invented (manufacturers are made-up words), valid for their field kind,
 * and each cites the value tokens that print all of its digits, so the kernel's rules make
 * them `suggested` (a voltage class absent from the company registry stays `verify`). It
 * prints each type's sha256 for `kinds/plate.ts`.
 */

/** `FIXTURES_DIR` of `providers/fake.ts`, without loading the reading kinds. */
const FIXTURES_DIR = join(import.meta.dirname, '..', 'jobs', 'reading', 'fixtures');
const WIDTH = 1200;
const HEIGHT = 900;
const FONT = 'DejaVu Sans';
const LABEL_X = 70;
const VALUE_X = 640;
const HEADER_SIZE = 40;
const ROW_SIZE = 26;
const WORD_GAP = 10;

/** One nameplate row: the value tokens as printed and the structured value the model returns. */
interface PlateRow {
  key: string;
  tokens: string[];
  value: unknown;
}

interface PlateSpec {
  blockType: 'para_raio' | 'chave_seccionadora' | 'disjuntor_mt' | 'tp' | 'tc';
  file: string;
  rows: PlateRow[];
}

const num = (raw: string, unit: string) => ({ raw, unit, state: 'measured' });

const PLATES: PlateSpec[] = [
  {
    blockType: 'para_raio',
    file: 'plate-para-raio.png',
    rows: [
      { key: 'fabricacao', tokens: ['Quelvar'], value: 'Quelvar' },
      { key: 'n_serie', tokens: ['PR-2207-114'], value: 'PR-2207-114' },
      { key: 'tipo', tokens: ['ZNO-15/10'], value: 'ZNO-15/10' },
      { key: 'tensao_nominal', tokens: ['15', 'kV'], value: '15 kV' },
      { key: 'corrente_nominal', tokens: ['10', 'kA'], value: num('10', 'kA') },
    ],
  },
  {
    blockType: 'chave_seccionadora',
    file: 'plate-chave-seccionadora.png',
    rows: [
      { key: 'identificacao', tokens: ['SEC-02'], value: 'SEC-02' },
      { key: 'fabricacao', tokens: ['Morvatec'], value: 'Morvatec' },
      { key: 'n_serie', tokens: ['SC-190344'], value: 'SC-190344' },
      { key: 'tipo', tokens: ['SFU-17/630'], value: 'SFU-17/630' },
      { key: 'meio_de_extincao', tokens: ['AR'], value: 'AR' },
      { key: 'tensao_de_placa', tokens: ['17,5', 'kV'], value: '17,5 kV' },
      { key: 'corrente_nominal', tokens: ['630', 'A'], value: num('630', 'A') },
      { key: 'acionamento', tokens: ['MANUAL/PUNHO'], value: 'MANUAL/PUNHO' },
      { key: 'data_de_fabricacao', tokens: ['03/2019'], value: '2019-03' },
    ],
  },
  {
    blockType: 'disjuntor_mt',
    file: 'plate-disjuntor-mt.png',
    rows: [
      { key: 'identificacao', tokens: ['DJ-01'], value: 'DJ-01' },
      { key: 'fabricacao', tokens: ['Tensilda'], value: 'Tensilda' },
      { key: 'n_serie', tokens: ['DJ-210587'], value: 'DJ-210587' },
      { key: 'tipo', tokens: ['VBX-17'], value: 'VBX-17' },
      { key: 'meio_de_extincao', tokens: ['SF6'], value: 'SF6' },
      { key: 'corrente_nominal', tokens: ['630', 'A'], value: num('630', 'A') },
      { key: 'capacidade_interruptor', tokens: ['25', 'kA'], value: num('25', 'kA') },
      { key: 'data_de_fabricacao', tokens: ['06/2021'], value: '2021-06' },
      { key: 'tensao_nominal', tokens: ['15', 'kV'], value: '15 kV' },
      { key: 'aj_bobina', tokens: ['220', 'Vcc'], value: '220 Vcc' },
      { key: 'aj_rele_50_51', tokens: ['120', 'A'], value: '120 A' },
    ],
  },
  {
    blockType: 'tp',
    file: 'plate-tp.png',
    rows: [
      { key: 'identificacao', tokens: ['TP-01'], value: 'TP-01' },
      { key: 'fabricacao', tokens: ['Ondarel'], value: 'Ondarel' },
      { key: 'n_serie', tokens: ['TP-118204'], value: 'TP-118204' },
      { key: 'tipo', tokens: ['UTE-15'], value: 'UTE-15' },
      { key: 'tipo_de_isolacao', tokens: ['EPÓXI'], value: 'EPÓXI' },
      { key: 'potencia_nominal', tokens: ['500', 'VA'], value: num('500', 'VA') },
      { key: 'tap_atual', tokens: ['2'], value: '2' },
      // AIR-V1 (review 2026-10-08): a plate that prints only the year, suggested as printed.
      { key: 'data_fabricacao', tokens: ['2020'], value: '2020' },
      // AIR-1 (review 2026-10-08): the AT voltage printed in V on a kV field, stored as 13,8 kV.
      { key: 'tensao_nominal_at', tokens: ['13.800', 'V'], value: num('13800', 'V') },
      { key: 'tensao_nominal_bt', tokens: ['115', 'V'], value: num('115', 'V') },
      { key: 'ligacao_secundaria', tokens: ['Y'], value: 'Y' },
    ],
  },
  {
    blockType: 'tc',
    file: 'plate-tc.png',
    rows: [
      { key: 'identificacao', tokens: ['TC-01'], value: 'TC-01' },
      { key: 'fabricacao', tokens: ['Velquor'], value: 'Velquor' },
      { key: 'n_serie', tokens: ['TC-305117'], value: 'TC-305117' },
      { key: 'tipo', tokens: ['UCE-15'], value: 'UCE-15' },
      { key: 'tipo_de_isolacao', tokens: ['Á', 'SECO'], value: 'Á SECO' },
      { key: 'potencia_nominal', tokens: ['25', 'VA'], value: num('25', 'VA') },
      { key: 'tap_atual', tokens: ['1'], value: '1' },
      { key: 'data_fabricacao', tokens: ['02/2022'], value: '2022-02' },
      { key: 'tensao_nominal_at', tokens: ['15', 'kV'], value: num('15', 'kV') },
      { key: 'tensao_nominal_bt', tokens: ['220', 'V'], value: num('220', 'V') },
      { key: 'ligacao_secundaria', tokens: ['Y'], value: 'Y' },
      { key: 'relacao', tokens: ['200-5', 'A'], value: '200-5 A' },
      { key: 'exatidao', tokens: ['10B100'], value: '10B100' },
    ],
  },
];

interface Token {
  id: string;
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function textElement(text: string, x: number, baseline: number, size: number, bold: boolean): string {
  return `<text x="${x}" y="${baseline}" font-family="${FONT}" font-size="${size}"${bold ? ' font-weight="bold"' : ''} fill="#111111">${escapeXml(text)}</text>`;
}

/** The ink box of one word drawn alone at its layout position, `[x0, y0, x1, y1]` in image pixels. */
async function measure(text: string, x: number, baseline: number, size: number, bold: boolean): Promise<[number, number, number, number]> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#FFFFFF"/>${textElement(text, x, baseline, size, bold)}</svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim({ background: '#FFFFFF', threshold: 10 }).toBuffer({ resolveWithObject: true });
  const left = -(info.trimOffsetLeft ?? 0);
  const top = -(info.trimOffsetTop ?? 0);
  return [left, top, left + info.width, top + info.height];
}

/** Lays the words out from `x`, one after the other; returns their tokens and SVG. */
async function words(texts: string[], x: number, baseline: number, size: number, bold: boolean, tokens: Token[]): Promise<{ ids: string[]; svg: string }> {
  const ids: string[] = [];
  let svg = '';
  let cursor = x;
  for (const text of texts) {
    const bbox = await measure(text, cursor, baseline, size, bold);
    const id = `t${tokens.length}`;
    tokens.push({ id, text, bbox, confidence: 0.99 });
    ids.push(id);
    svg += textElement(text, cursor, baseline, size, bold);
    cursor = bbox[2] + WORD_GAP;
  }
  return { ids, svg };
}

async function make(plate: PlateSpec): Promise<string> {
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', plate.blockType);
  const fields = new Map<string, FieldDef>(definition.nameplate.map((field) => [field.key, field]));
  const tokens: Token[] = [];
  const values: { key: string; value: unknown; ocr_token_ids: string[]; confidence: number }[] = [];

  const header = await words(definition.label.toUpperCase().split(' '), LABEL_X, 100, HEADER_SIZE, true, tokens);
  let body = header.svg;
  const step = Math.floor((HEIGHT - 210) / plate.rows.length);
  for (const [index, row] of plate.rows.entries()) {
    const field = fields.get(row.key);
    if (field === undefined) throw new Error(`${plate.blockType} has no nameplate key ${row.key}`);
    const baseline = 150 + step * index + ROW_SIZE;
    body += `<line x1="50" y1="${baseline + 14}" x2="1150" y2="${baseline + 14}" stroke="#9AA0A6" stroke-width="2"/>`;
    const label = await words(field.label.split(' '), LABEL_X, baseline, ROW_SIZE, false, tokens);
    const value = await words(row.tokens, VALUE_X, baseline, ROW_SIZE, true, tokens);
    body += label.svg + value.svg;
    values.push({ key: row.key, value: row.value, ocr_token_ids: value.ids, confidence: 0.97 });
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#5A6068"/>` +
    `<rect x="30" y="30" width="1140" height="840" rx="18" fill="#E4E6E8" stroke="#3A3F46" stroke-width="6"/>` +
    `<circle cx="60" cy="60" r="10" fill="#3A3F46"/><circle cx="1140" cy="60" r="10" fill="#3A3F46"/>` +
    `<circle cx="60" cy="840" r="10" fill="#3A3F46"/><circle cx="1140" cy="840" r="10" fill="#3A3F46"/>` +
    `${body}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const sha = createHash('sha256').update(png).digest('hex');
  await writeFile(join(FIXTURES_DIR, 'images', plate.file), png);
  const fixture = {
    outcome: 'ok',
    ocr: { image: { width: WIDTH, height: HEIGHT }, tokens, preprocessing_applied: false },
    structuring: { values },
  };
  await writeFile(join(FIXTURES_DIR, `${sha}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  return sha;
}

for (const plate of PLATES) {
  const sha = await make(plate);
  console.log(`${plate.blockType} ${plate.file} ${sha}`);
}
