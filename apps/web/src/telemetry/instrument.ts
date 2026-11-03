import { SCREENS, TELEMETRY_TARGET_PATTERN, UX_INPUT_TARGETS, type Screen } from '@app/domain';
import { deviceContext } from './context.ts';
import { beaconTelemetry } from './flush.ts';
import { telemetryDatabase, track, whenTelemetryWritten } from './track.ts';
import { leaveScreen, resumeScreen } from './views.ts';

/*
 * Epic 18, Story 18.1 (AD-28): the `data-telemetry` attribute is the one source of a
 * control's `target` name. One document-level capturing `click` listener turns a press of
 * an enabled control into an `action` (or the `retry`/`undo` its `data-telemetry-event`
 * names); one capturing `pointerdown` listener turns a primary press of a disabled one
 * (`disabled`, `aria-disabled="true"`, or inside a read-only group, `aria-readonly="true"`:
 * a not-tested sheet's checklist, E18-A1 R-E3) into a `disabled_tap`. React Aria fires
 * `onPress` from the native click, so the capture here sees the control before the press
 * changes the page. Hiding the tab, or leaving the page (`pagehide`, which fires where
 * `visibilitychange` may not), hands the queue to `sendBeacon`.
 *
 * Story 18.4: hiding the tab or leaving the page first writes the open screen's `screen_view`
 * (`leaveScreen`), and the beacon follows once that write settled; showing the tab again opens
 * a view of the same screen (`resumeScreen`). A field (`input`, `textarea`, `select`, or a
 * control named for `input_refused`) is never pressed: a click into it queues nothing.
 */

const SELECTOR = '[data-telemetry]';

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const INPUT_TARGETS = new Set<string>(UX_INPUT_TARGETS);

/** A typing field or a field's name: its refusals are `input_refused`, never an `action` or a `disabled_tap`. */
function isField(control: Element): boolean {
  return FIELD_TAGS.has(control.tagName) || INPUT_TARGETS.has(control.getAttribute('data-telemetry') ?? '');
}

function isDisabled(control: Element): boolean {
  return control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true' || control.closest('[aria-readonly="true"]') !== null;
}

/** E18-A1 (R-E7): a secondary button or a second finger is no press. `in` checks: jsdom may lack `PointerEvent`. */
function isPrimaryPress(event: Event): boolean {
  if ('isPrimary' in event && event.isPrimary === false) return false;
  if ('button' in event && event.button !== 0) return false;
  return true;
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
  if (control === null || isField(control) || isDisabled(control)) return;
  // Only `retry` and `undo` rename the press; any other value is a plain `action`.
  const declared = control.getAttribute('data-telemetry-event');
  track({
    name: declared === 'retry' ? 'retry' : declared === 'undo' ? 'undo' : 'action',
    target: control.getAttribute('data-telemetry') ?? undefined,
    ...screenOverride(control),
  });
}

function onPointerDown(event: Event): void {
  if (!isPrimaryPress(event)) return;
  const control = controlOf(event);
  if (control === null || isField(control) || !isDisabled(control)) return;
  track({ name: 'disabled_tap', target: control.getAttribute('data-telemetry') ?? undefined, ...screenOverride(control) });
}

/**
 * Installs the listeners on `doc` and returns their removal. The visibility listener and
 * the window's `pagehide` beacon the configured user's queue when the tab is hidden or left.
 */
export function installTelemetryListeners(doc: Document = document): () => void {
  const beacon = () => {
    leaveScreen();
    const db = telemetryDatabase();
    if (db === null) return;
    // The open screen's `screen_view` goes with this beacon: it is sent once that write settled.
    void whenTelemetryWritten().then(() => beaconTelemetry(db));
  };
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') beacon();
    else resumeScreen();
  };
  // Story 18.4: a page restored from the back-forward cache may fire no `visibilitychange`; its `pageshow` reopens the view.
  const onPageShow = (event: Event) => {
    if ('persisted' in event && event.persisted === true) resumeScreen();
  };
  const view = doc.defaultView;
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('visibilitychange', onVisibility);
  view?.addEventListener('pagehide', beacon);
  view?.addEventListener('pageshow', onPageShow);
  return () => {
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('visibilitychange', onVisibility);
    view?.removeEventListener('pagehide', beacon);
    view?.removeEventListener('pageshow', onPageShow);
  };
}

let installed = false;
let uninstallInstalled: (() => void) | null = null;

/**
 * Once per app load: the listeners and the `session_start` event (Story 18.1). A second
 * call (React's StrictMode double effect, a remount) does nothing.
 */
export function startTelemetry(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  try {
    uninstallInstalled = installTelemetryListeners(document);
    track({ name: 'session_start', ...deviceContext() });
  } catch {
    // An event is never worth a failure.
  }
}

/** Removes what `startTelemetry` installed and lets it run again (tests). */
export function resetStartTelemetryForTests(): void {
  uninstallInstalled?.();
  uninstallInstalled = null;
  installed = false;
}
