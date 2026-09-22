/**
 * Shared touch/stylus input layer (AD-23). Per-element `touch-action` values so every
 * interactive surface behaves the same on touch and stylus: taps never wait for the
 * double-tap-zoom timeout, presses that start a reorder (press-and-hold) never also pan
 * the page, and plain scroll areas keep the browser's native scrolling.
 *
 * No swipe gestures anywhere in the product (Interaction Primitives): nothing here maps
 * to `pan-x` alone, which would let a horizontal swipe compete with a tap.
 */

/** Named `touch-action` values used across the app's interactive elements. */
export const TOUCH_ACTION = {
  /** Buttons, chips, tabs, menu items: removes the double-tap-to-zoom delay, no panning implied. */
  tap: 'manipulation',
  /** Press-and-hold targets (Block card drag handle, future reorder handles): no scrolling
   * gesture may start while a hold is being timed or a drag is in progress. */
  hold: 'none',
  /** Vertical lists and the relatório tree: keep vertical scroll, block the browser's
   * horizontal swipe-navigation gesture. */
  scrollY: 'pan-y',
  /** Native default; used to document that an element intentionally keeps every gesture
   * (e.g. a plain content area with no custom pointer handling). */
  auto: 'auto',
} as const;

export type TouchActionKind = keyof typeof TOUCH_ACTION;

/** A style object for the given kind, ready to spread onto an element's `style` prop. */
export function touchActionStyle(kind: TouchActionKind): { touchAction: string } {
  return { touchAction: TOUCH_ACTION[kind] };
}
