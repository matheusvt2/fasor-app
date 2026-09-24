import type { ReactNode } from 'react';
import { Button } from '../../components/index.ts';

/**
 * The sheet's Sticky action bar (UX-DR16, `60-ficha.html`): the Section stepper row above
 * the button row. The Camera capture button's slot at the left of the row is Epic 6's and
 * stays empty until then (no `.has-camera`, nothing disabled shown); `secondary` is the
 * Bulk action bar's mirror while the checklist is on screen. It sits above the keyboard
 * and unsticks below a 480 px viewport (`ficha.css`).
 */
export function StickyActionBar({
  stepper,
  secondary,
  primaryLabel,
  onPrimary,
  primaryId,
}: {
  stepper: ReactNode;
  secondary: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  /** The primary's id: the continuous Enter run of the readings ends on it (Story 5.6). */
  primaryId?: string;
}) {
  return (
    <div className="sticky-action-bar">
      {stepper}
      {secondary}
      <div className="bar-buttons">
        <Button variant="primary" onPress={onPrimary} id={primaryId}>
          {primaryLabel}
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-chev-right" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
