import { ui } from '../copy/ui.ts';

export interface NotApplicableButtonProps {
  /** The field's label as the screen shows it, named in the accessible name. */
  label: string;
  onPress: () => void;
  /** Epic 18: the control's usage-event name (`data-telemetry`), e.g. `ficha.na` on a sheet. */
  telemetry?: string;
}

/**
 * Story 17.3: the secondary "N/A" control at the trailing end of a field that accepts N/A.
 * Story 17.6: the one implementation, shared by the number fields of the sheets and the
 * setup's "Altitude do site" (which is not a `NumberField`). A plain button, so a tap that
 * does not move the focus (WebKit) still runs `onPress` and the caller decides the focus.
 */
export function NotApplicableButton({ label, onPress, telemetry }: NotApplicableButtonProps) {
  return (
    <button type="button" className="btn btn-secondary btn-na" data-telemetry={telemetry} aria-label={ui.notApplicable.markLabel(label)} onClick={onPress}>
      {ui.notApplicable.control}
    </button>
  );
}
