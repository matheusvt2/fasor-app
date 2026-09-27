import type { LayoutSectionPoints } from '@app/domain';
import { Paragraph } from 'docx';
import { text } from '../docx.ts';

/*
 * Story 7.3 (AC1): section 8, the points of attention, rendered from the kernel's
 * `LayoutSectionPoints`: one bulleted paragraph per bullet, its text exactly as
 * `resolveSection8` composed it (tokens already "Imagem N", derived groups already a
 * sentence). No table, no priority, deadline or owner (`source-deltas.md` row 29).
 */

export function section8Children(section: LayoutSectionPoints): Paragraph[] {
  return section.bullets.map((bullet) => new Paragraph({ children: [text(bullet)], bullet: { level: 0 }, spacing: { after: 80 } }));
}
