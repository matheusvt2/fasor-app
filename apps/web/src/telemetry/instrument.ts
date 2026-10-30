import { SCREENS, TELEMETRY_TARGET_PATTERN, type Screen } from '@app/domain';
import { beaconTelemetry } from './flush.ts';
import { telemetryDatabase, track } from './track.ts';

/*
 * Epic 18, Story 18.1 (AD-28): the `data-telemetry` attribute is the one source of a
 * control's `target` name. One document-level capturing `click` listener turns a press of
 * an enabled control into an `action` (or the `retry`/`undo` its `data-telemetry-event`
 * names); one capturing `pointerdown` listener turns a press of a disabled one (`disabled`
 * or `aria-disabled="true"`) into a `disabled_tap`. React Aria fires `onPress` from the
 * native click, so the capture here sees the control before the press changes the page.
 * Hiding the tab hands the queue to `sendBeacon`.
 */

const SELECTOR = '[data-telemetry]';

function isDisabled(control: Element): boolean {
  return control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true';
}

function controlOf(event: Event): Element | null {
  const origin = event.target;
  if (!(origin instanceof Element)) return null;
  const control = origin.closest(SELECTOR);
  if (control === null) return null;
  const name = control.getAttribute('data-telemetry') ?? '';
  return TELEMETRY_TARGET_PATTERN.test(name) ? control : null;
}

/** A container's `data-telemetry-screen` (the Export dialog's `export`) names the screen of what is pressed inside it. */
function screenOverride(control: Element): { screen?: Screen } {
  const declared = control.closest('[data-telemetry-screen]')?.getAttribute('data-telemetry-screen');
  return declared !== undefined && declared !== null && (SCREENS as readonly string[]).includes(declared) ? { screen: declared as Screen } : {};
}

function onClick(event: Event): void {
  const control = controlOf(event);
  if (control === null || isDisabled(control)) return;
  // Only `retry` and `undo` rename the press; any other value is a plain `action`.
  const declared = control.getAttribute('data-telemetry-event');
  track({
    name: declared === 'retry' ? 'retry' : declared === 'undo' ? 'undo' : 'action',
    target: control.getAttribute('data-telemetry') ?? undefined,
    ...screenOverride(control),
  });
}

function onPointerDown(event: Event): void {
  const control = controlOf(event);
  if (control === null || !isDisabled(control)) return;
  track({ name: 'disabled_tap', target: control.getAttribute('data-telemetry') ?? undefined, ...screenOverride(control) });
}

/**
 * Installs the listeners on `doc` and returns their removal. The visibility listener
 * beacons the configured user's queue when the tab is hidden.
 */
export function installTelemetryListeners(doc: Document = document): () => void {
  const onVisibility = () => {
    if (doc.visibilityState !== 'hidden') return;
    const db = telemetryDatabase();
    if (db !== null) void beaconTelemetry(db);
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}

let installed = false;

/**
 * Once per app load: the listeners and the `session_start` event (Story 18.1). A second
 * call (React's StrictMode double effect, a remount) does nothing.
 */
export function startTelemetry(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  try {
    installTelemetryListeners(document);
    track({ name: 'session_start' });
  } catch {
    // An event is never worth a failure.
  }
}
