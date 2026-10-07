import { formatCalendarDate } from '../format/datetime.ts';
import { numberPhotos, photoRefLabel } from '../photos/numbering.ts';
import { livePoints } from '../points/checks.ts';
import { derivedPoints, groupDerivedPoints, type DerivedPoint, type DerivedPointGroup } from '../points/derived.ts';
import { priorityLabel } from '../points/priority.ts';
import { extractPhotoRefs, pointTextTokens } from '../points/refs.ts';
import { POINT_TITLE_GENERAL, pointTitle } from '../points/summary.ts';
import type { PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { listPtBr } from '../text/plural.ts';

/*
 * Story 7.3 (AC1): section 8, the points of attention, as printed bullets. First the live
 * points in `order_key` order, each `[[foto:id]]` token of its text replaced by the frozen
 * "Imagem N" of `numberPhotos` (the same map section 7 prints) as a "conforme Imagem N"
 * clause where the text does not introduce it (F-05, `resolveBulletPhotoTokens`), its Ação
 * recomendada after the text's full stop. A stored point written from an untested sheet (`origin: not_tested`) is a
 * bullet of its own, never merged (open question 1). Then the derived Não ensaiado entries
 * in tree order, consecutive entries with the same reason and justification as one bullet
 * (`groupDerivedPoints`, E3-A9 bullet 4).
 *
 * Story 11.10 (FR-52, AR-25): beneath the bullets, whenever section 8 prints, the
 * action-plan table: one row per bullet in bullet order, numbered 1..n continuously
 * (manual rows first, then the derived groups), with the point's resolved text, where it
 * sits, its priority, deadline, action, owner and the numbers of the photos it cites; "—"
 * for every missing value.
 */

/** authored: what a token prints when its photo is not numbered (removed since it was cited) (open for Bruno). */
export const REMOVED_PHOTO_REF_TEXT = 'imagem removida';

export type Section8Bullet =
  | { kind: 'point'; text: string; point_id: string }
  | { kind: 'derived'; text: string; block_ids: string[] };

/** One row of the action-plan table, every cell ready to print ("—" when missing). */
export interface ActionPlanRow {
  number: string;
  point: string;
  local: string;
  priority: string;
  deadline: string;
  action: string;
  owner: string;
  images: string;
}

/** The action-plan table's column titles, in print order (FR-52). */
export const ACTION_PLAN_COLUMNS: readonly string[] = ['Nº', 'Ponto de atenção', 'Local/TAG', 'Prioridade', 'Prazo', 'Ação recomendada', 'Responsável', 'Imagens'];

/** What an empty action-plan cell prints. */
export const ACTION_PLAN_NONE = '—';

export interface LayoutSectionPoints {
  number: number;
  title: string;
  kind: 'points';
  bullets: string[];
  /** Story 11.10: the action-plan table under the bullets, one row per bullet. */
  table: ActionPlanRow[];
}

type Section8Snapshot = Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment' | 'points'>;

/** A cell value: trimmed, "—" when blank or missing. */
function cell(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? ACTION_PLAN_NONE : trimmed;
}

/** A text with each photo token replaced by "Imagem N", or `REMOVED_PHOTO_REF_TEXT` for a photo the numbering lacks. */
export function resolvePhotoTokens(text: string, numbering: ReadonlyMap<string, number>): string {
  return pointTextTokens(text)
    .map((token) => {
      if (token.kind === 'text') return token.text;
      const n = numbering.get(token.id);
      return n === undefined ? REMOVED_PHOTO_REF_TEXT : photoRefLabel(n);
    })
    .join('');
}

/** Words after which a photo reference reads naturally as it is ("Ver Imagem 2", "em Imagem 3"). */
const REFERENCE_WORDS = /\b(conforme|ver|vide|veja|imagem|imagens)\b/i;
const CONNECTIVES: ReadonlySet<string> = new Set(['e', 'ou', 'em', 'na', 'no', 'nas', 'nos', 'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'com', 'para', 'por', 'pela', 'pelo']);
/** A sentence end inside a point's text: ".", "!" or "?" before a space, never the "." of "etc.". */
const SENTENCE_END = /(?<!\betc)[.!?](?=\s)/gi;

/** The part of `text` after its last sentence end. */
function currentSentence(text: string): string {
  let at = -1;
  for (const match of text.matchAll(SENTENCE_END)) at = match.index;
  return text.slice(at + 1);
}

/**
 * F-05 (review 2026-10-06): a bullet's photo reference reads as a clause, "…, conforme
 * Imagem N", unless the sentence already introduces it ("conforme", "ver", an earlier
 * "Imagem" of the same sentence) or the words before it lead into it ("em", "e", an open
 * parenthesis); a reference after a full stop takes the full stop after it ("Porta
 * danificada. [[foto]]" prints "Porta danificada, conforme Imagem 1."), and "etc." keeps its
 * period ("… etc., conforme Imagem 1"). A removed photo's token prints as `resolvePhotoTokens`
 * prints it. The action-plan table keeps `resolvePhotoTokens`.
 */
export function resolveBulletPhotoTokens(text: string, numbering: ReadonlyMap<string, number>): string {
  let out = '';
  /** The last thing printed is a reference, with at most spaces after it. */
  let afterRef = false;
  for (const token of pointTextTokens(text)) {
    if (token.kind === 'text') {
      // A full stop moved after a reference is not printed twice.
      out += /[.!?]$/.test(out) && /^[.!?]/.test(token.text) ? token.text.slice(1) : token.text;
      if (token.text.trim() !== '') afterRef = false;
      continue;
    }
    const n = numbering.get(token.id);
    if (n === undefined) {
      out += REMOVED_PHOTO_REF_TEXT;
      afterRef = false;
      continue;
    }
    const label = photoRefLabel(n);
    // Two references side by side read as a list: "Imagem 5 e Imagem 12".
    if (afterRef) {
      const trimmed = out.trimEnd();
      // A full stop moved after the first reference stays after the last one.
      const moved = /\d[.!?]$/.test(trimmed) ? trimmed.slice(-1) : '';
      out = `${moved === '' ? trimmed : trimmed.slice(0, -1)} e ${label}${moved}`;
      continue;
    }
    afterRef = true;
    const trimmed = out.trimEnd();
    const lastWord = /(\p{L}+)$/u.exec(trimmed)?.[1]?.toLocaleLowerCase('pt-BR') ?? null;
    const leadsIn = trimmed === '' || REFERENCE_WORDS.test(currentSentence(out)) || (lastWord !== null && CONNECTIVES.has(lastWord)) || /[(,;:\u2014-]$/.test(trimmed);
    if (leadsIn) {
      out += label;
    } else if (/[.!?]$/.test(trimmed) && !/\betc\.$/i.test(trimmed)) {
      // authored: the clause that cites a photo after a sentence (open for Bruno).
      out = `${trimmed.slice(0, -1)}, conforme ${label}${trimmed.slice(-1)}`;
    } else {
      out = `${trimmed}, conforme ${label}`;
    }
  }
  return out;
}

/** A sentence: trimmed, with a final period unless it already ends in ".", "!" or "?". */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * The bullet of one derived group: "Equipamento não ensaiado: ⟨title⟩. ⟨J⟩" for one sheet,
 * "Equipamentos não ensaiados: ⟨t1⟩, ⟨t2⟩ e ⟨t3⟩. ⟨J⟩" for several. J is the group's
 * justification (the typed text for "Outro"), else the reason's label, as a sentence.
 */
export function derivedGroupText(group: DerivedPointGroup, entries: readonly DerivedPoint[]): string {
  const byBlock = new Map(entries.map((entry) => [entry.block_id, entry]));
  const members = group.block_ids.map((id) => byBlock.get(id)).filter((entry): entry is DerivedPoint => entry !== undefined);
  const titles = members.map((entry) => entry.title);
  const reason = group.justification ?? members[0]?.reason_label ?? group.reason_key;
  // authored: the source prints one untested equipment per bullet in its own prose; the
  // merged sentence of a group of them is written here (open for Bruno).
  const head = titles.length === 1 ? `Equipamento não ensaiado: ${titles[0]}` : `Equipamentos não ensaiados: ${listPtBr(titles)}`;
  return `${head}. ${sentence(reason)}`;
}

/** Every bullet of section 8 in print order: the live points, then the derived groups. */
export function resolveSection8(snapshot: Section8Snapshot, numbering: ReadonlyMap<string, number>): Section8Bullet[] {
  const points: Section8Bullet[] = livePoints(snapshot.points).map((point) => {
    const parts = [point.text, point.action ?? '']
      .map((part) => resolveBulletPhotoTokens(part, numbering).trim())
      .filter((part) => part !== '');
    // F-05: the action starts a sentence of its own after the point's text.
    return { kind: 'point', text: parts.length === 2 ? `${sentence(parts[0]!)} ${parts[1]!}` : (parts[0] ?? ''), point_id: point.id };
  });
  const entries = derivedPoints(snapshot);
  const derived: Section8Bullet[] = groupDerivedPoints(entries).map((group) => ({
    kind: 'derived',
    text: derivedGroupText(group, entries),
    block_ids: [...group.block_ids],
  }));
  return [...points, ...derived];
}

/** The photo numbers a point cites (text, then action), first-seen order, each once; photos the numbering lacks are left out. */
function pointImages(point: Pick<PointRow, 'text' | 'action'>, numbering: ReadonlyMap<string, number>): string {
  const ids = extractPhotoRefs(`${point.text} ${point.action ?? ''}`);
  const numbers = ids.map((id) => numbering.get(id)).filter((n): n is number => n !== undefined);
  return numbers.length === 0 ? ACTION_PLAN_NONE : numbers.join(', ');
}

/** Where a point sits: its equipment as section 8 names it ("SEC-C12 · 1° Subsolo › Coluna 12"); "—" for a general point. */
function pointLocal(point: Pick<PointRow, 'equipment_id'>, snapshot: Section8Snapshot): string {
  if (point.equipment_id === null) return ACTION_PLAN_NONE;
  const title = pointTitle(point, snapshot);
  return title === POINT_TITLE_GENERAL ? ACTION_PLAN_NONE : title;
}

/**
 * The action-plan rows, one per section 8 bullet in the same order (`resolveSection8`):
 * the live points, then the derived groups (their bullet text, their sheets' titles joined
 * by "; ", nothing else), numbered 1..n.
 */
export function resolveActionPlan(snapshot: Section8Snapshot, numbering: ReadonlyMap<string, number>): ActionPlanRow[] {
  const points = livePoints(snapshot.points).map((point) => ({
    point: cell(resolvePhotoTokens(point.text, numbering)),
    local: pointLocal(point, snapshot),
    priority: point.priority === null ? ACTION_PLAN_NONE : priorityLabel(point.priority),
    deadline: cell(formatCalendarDate(point.deadline)),
    action: cell(resolvePhotoTokens(point.action ?? '', numbering)),
    owner: cell(point.owner),
    images: pointImages(point, numbering),
  }));
  const entries = derivedPoints(snapshot);
  const byBlock = new Map(entries.map((entry) => [entry.block_id, entry]));
  const derived = groupDerivedPoints(entries).map((group) => ({
    point: derivedGroupText(group, entries),
    local: cell(
      group.block_ids
        .map((id) => byBlock.get(id)?.title)
        .filter((title): title is string => title !== undefined)
        .join('; '),
    ),
    priority: ACTION_PLAN_NONE,
    deadline: ACTION_PLAN_NONE,
    action: ACTION_PLAN_NONE,
    owner: ACTION_PLAN_NONE,
    images: ACTION_PLAN_NONE,
  }));
  return [...points, ...derived].map((row, i) => ({ number: String(i + 1), ...row }));
}

/** Section 8's layout under its heading; null when there is no point and no derived entry (the section prints the empty note). */
export function section8Layout(snapshot: Section8Snapshot & Pick<RelatorioSnapshot, 'files'>, heading: { number: number; title: string }): LayoutSectionPoints | null {
  const numbering = numberPhotos(snapshot.files);
  const bullets = resolveSection8(snapshot, numbering).map((bullet) => bullet.text);
  if (bullets.length === 0) return null;
  return { number: heading.number, title: heading.title, kind: 'points', bullets, table: resolveActionPlan(snapshot, numbering) };
}
