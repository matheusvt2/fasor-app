import type { ReactNode } from 'react';
import { Button } from '../../components/index.ts';

/**
 * The sheet's Sticky action bar (UX-DR16, `60-ficha.html`): the Section stepper row above
 * the button row. Story 6.1 fills the slot at the left of the row with the 56 px Camera
 * capture button (`.has-camera`), and Story 6.4 puts "Adicionar fotos" beside it (the import
 * path, `70-fotos.html`); a denied camera's reason and OS path go under the row
 * (`camera-denied`). `secondary` is the Bulk action bar's mirror while the checklist is on
 * screen. It sits above the keyboard and unsticks below a 480 px viewport (`ficha.css`).
 */
export function StickyActionBar({
  stepper,
  secondary,
  camera,
  importButton,
  cameraNote,
  primaryLabel,
  onPrimary,
  primaryId,
}: {
  stepper: ReactNode;
  secondary: ReactNode;
  /** The Camera capture button (and its camera view), or nothing. */
  camera?: ReactNode;
  /** Story 6.4: "Adicionar fotos" beside the camera, or nothing. */
  importButton?: ReactNode;
  /** The denied-camera reason under the button row, or nothing. */
  cameraNote?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  /** The primary's id: the continuous Enter run of the readings ends on it (Story 5.6). */
  primaryId?: string;
}) {
  const hasCamera = camera !== undefined && camera !== null;
  return (
    <div className="sticky-action-bar">
      {stepper}
      {secondary}
      <div className={hasCamera ? 'bar-buttons has-camera' : 'bar-buttons'}>
        {camera}
        {importButton}
        <Button variant="primary" onPress={onPrimary} id={primaryId}>
          {primaryLabel}
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-chev-right" />
          </svg>
        </Button>
      </div>
      {cameraNote}
    </div>
  );
}
