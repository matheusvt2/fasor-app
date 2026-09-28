import { numberPhotos, photoRefLabel } from '../photos/numbering.ts';
import { livePoints } from '../points/checks.ts';
import { derivedPoints, groupDerivedPoints, type DerivedPoint, type DerivedPointGroup } from '../points/derived.ts';
import { pointTextTokens } from '../points/refs.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { listPtBr } from '../text/plural.ts';

/*
 * Story 7.3 (AC1): section 8, the points of attention, as printed bullets. First the live
 * points in `order_key` order, each `[[foto:id]]` token of its text replaced by the frozen
 * "Imagem N" of `numberPhotos` (the same map section 7 prints), its Ação recomendada after
 * one space. A stored point written from an untested sheet (`origin: not_tested`) is a
 * bullet of its own, never merged (open question 1). Then the derived Não ensaiado entries
 * in tree order, consecutive entries with the same reason and justification as one bullet
 * (`groupDerivedPoints`, E3-A9 bullet 4). No action-plan table, no priority, deadline or
 * owner (`source-deltas.md` row 29).
 */

/** authored: what a token prints when its photo is not numbered (removed since it was cited) (open for Bruno). */
export const REMOVED_PHOTO_REF_TEXT = 'imagem removida';

export type Section8Bullet =
  | { kind: 'point'; text: string; point_id: string }
  | { kind: 'derived'; text: string; block_ids: string[] };

export interface LayoutSectionPoints {
  number: number;
  title: string;
  kind: 'points';
  bullets: string[];
}

type Section8Snapshot = Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment' | 'points'>;

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
      .map((part) => resolvePhotoTokens(part, numbering).trim())
      .filter((part) => part !== '');
    return { kind: 'point', text: parts.join(' '), point_id: point.id };
  });
  const entries = derivedPoints(snapshot);
  const derived: Section8Bullet[] = groupDerivedPoints(entries).map((group) => ({
    kind: 'derived',
    text: derivedGroupText(group, entries),
    block_ids: [...group.block_ids],
  }));
  return [...points, ...derived];
}

/** Section 8's layout under its heading; null when there is no point and no derived entry (the section prints the empty note). */
export function section8Layout(snapshot: Section8Snapshot & Pick<RelatorioSnapshot, 'files'>, heading: { number: number; title: string }): LayoutSectionPoints | null {
  const bullets = resolveSection8(snapshot, numberPhotos(snapshot.files)).map((bullet) => bullet.text);
  return bullets.length === 0 ? null : { number: heading.number, title: heading.title, kind: 'points', bullets };
}
