import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/*
 * Story 13.3 (CAP-3, review-field-ux-2026-10-06): the engineer's own photo as a magnifier.
 * One pointer-event zoom for the Photo viewer and the inline plate crop, no gesture library
 * and no reliance on the browser's page zoom:
 *
 * - pinch: two pointers' distance scales the picture about their midpoint, which also pans;
 * - pan: one pointer drags the picture while it is zoomed (at fit it does nothing, so a tap
 *   stays a tap and a sheet still scrolls under `touch-action: pan-y`);
 * - double-tap or double-click (optional): toggles fit and 2x, centred on the tap;
 * - Ctrl + wheel (a trackpad's pinch): scales about the cursor;
 * - `zoomIn` / `zoomOut` / `reset` for the visible buttons (a stylus or a mouse needs no gesture).
 *
 * The transform is `translate(x, y) scale(s)` from the stage's top-left corner on an element
 * that fills the stage; the scale is clamped to `[1, maxScale]` (fit to native resolution,
 * one picture pixel per CSS pixel) and the pan keeps the picture covering its stage. The
 * state resets whenever `resetKey` changes (another photo, another focused field).
 */

export interface ZoomSize {
  width: number;
  height: number;
}

export interface PinchZoomOptions {
  /** The size in picture pixels of what is drawn at fit (the photo, or the crop region); null while unknown (no zoom then). */
  content: ZoomSize | null;
  /** Any change returns the picture to fit. */
  resetKey: unknown;
  /** Double-tap / double-click toggles fit and 2x (the viewer); off where a tap has its own meaning (the plate crop). */
  doubleTap?: boolean;
}

export interface PinchZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface PinchZoom extends PinchZoomState {
  /** The stage: the element the pointers land on and the picture fills. */
  stageRef: RefObject<HTMLElement | null>;
  /** Spread on the stage. */
  handlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  /** The style of the transformed element (fills the stage). */
  pictureStyle: CSSProperties;
  maxScale: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /** True right after a pinch or a pan: the click that ends it is not a tap (read once). */
  takeGesture: () => boolean;
}

/** The step of the visible buttons. */
export const ZOOM_STEP = 1.5;
/** The double-tap's zoom (capped at `maxScale`). */
export const DOUBLE_TAP_SCALE = 2;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 40;
/** A pointer that moved less than this is still a tap. */
const TAP_SLOP = 8;
const EPS = 0.001;

const FIT: PinchZoomState = { scale: 1, x: 0, y: 0 };

/** The largest useful scale: one picture pixel per CSS pixel of the stage at fit (`object-fit: contain`), never below 1. */
export function maxZoomScale(content: ZoomSize | null, stage: ZoomSize | null): number {
  if (content === null || stage === null || !(content.width > 0) || !(content.height > 0) || !(stage.width > 0) || !(stage.height > 0)) return 1;
  return Math.max(1, Math.max(content.width / stage.width, content.height / stage.height));
}

/** Scale clamped to `[1, max]`, pan clamped so the scaled picture still covers the stage. */
export function clampZoom(state: PinchZoomState, max: number, stage: ZoomSize | null): PinchZoomState {
  const scale = Math.min(Math.max(state.scale, 1), Math.max(1, max));
  if (stage === null || scale <= 1 + EPS) return FIT;
  const minX = stage.width * (1 - scale);
  const minY = stage.height * (1 - scale);
  return { scale, x: Math.min(0, Math.max(minX, state.x)), y: Math.min(0, Math.max(minY, state.y)) };
}

/** `state` scaled to `scale` about the stage point `(px, py)`, which stays where it is. */
export function zoomAbout(state: PinchZoomState, scale: number, px: number, py: number): PinchZoomState {
  const cx = (px - state.x) / state.scale;
  const cy = (py - state.y) / state.scale;
  return { scale, x: px - scale * cx, y: py - scale * cy };
}

interface Gesture {
  /** The pointers on the stage, by id, at their last position (stage coordinates). */
  pointers: Map<number, { x: number; y: number; startX: number; startY: number }>;
  /** The pinch: the start distance and midpoint, and the state then. */
  pinch: { distance: number; midX: number; midY: number; from: PinchZoomState } | null;
  /** The one-pointer pan: where it started, and the state then. */
  pan: { x: number; y: number; from: PinchZoomState } | null;
  moved: boolean;
  /** A pinch or a pan happened since the last `takeGesture`. */
  gesture: boolean;
  lastTap: { at: number; x: number; y: number } | null;
}

export function usePinchZoom({ content, resetKey, doubleTap = false }: PinchZoomOptions): PinchZoom {
  const stageRef = useRef<HTMLElement | null>(null);
  const [stage, setStage] = useState<ZoomSize | null>(null);
  const [state, setState] = useState<PinchZoomState>(FIT);
  const gesture = useRef<Gesture>({ pointers: new Map(), pinch: null, pan: null, moved: false, gesture: false, lastTap: null });
  const maxScale = maxZoomScale(content, stage);

  // The latest values for handlers that outlive a render (the native wheel listener).
  const live = useRef({ state, maxScale, stage });
  live.current = { state, maxScale, stage };

  // The stage's size, kept current (a rotation, the viewer's bottom wrapping).
  useLayoutEffect(() => {
    const element = stageRef.current;
    if (element === null) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setStage((current) => (current !== null && current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Another photo, another focused field: back to fit.
  useEffect(() => {
    setState(FIT);
    const g = gesture.current;
    g.pointers.clear();
    g.pinch = null;
    g.pan = null;
    g.lastTap = null;
    g.moved = false;
    g.gesture = false;
  }, [resetKey]);

  // A smaller maximum (a thumb replaced, a resize) clamps what is shown.
  useEffect(() => {
    setState((current) => {
      const next = clampZoom(current, maxScale, stage);
      return next.scale === current.scale && next.x === current.x && next.y === current.y ? current : next;
    });
  }, [maxScale, stage]);

  const apply = useCallback((next: PinchZoomState) => {
    const { maxScale: max, stage: size } = live.current;
    setState(clampZoom(next, max, size));
  }, []);

  const local = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect === undefined ? { x: event.clientX, y: event.clientY } : { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startPinch = (g: Gesture) => {
    const [a, b] = [...g.pointers.values()];
    if (a === undefined || b === undefined) return;
    g.pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, from: live.current.state };
    g.pan = null;
  };

  const startPan = (g: Gesture) => {
    const [only] = [...g.pointers.values()];
    g.pan = only === undefined ? null : { x: only.x, y: only.y, from: live.current.state };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const g = gesture.current;
    const at = local(event);
    g.pointers.set(event.pointerId, { ...at, startX: at.x, startY: at.y });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer (tests) or one the browser already released: no capture needed.
    }
    if (g.pointers.size === 1) {
      // A new touch starts a new gesture: what the last one did no longer decides a click.
      g.moved = false;
      g.gesture = false;
      startPan(g);
    } else if (g.pointers.size === 2) {
      g.moved = true;
      g.gesture = true;
      startPinch(g);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    const pointer = g.pointers.get(event.pointerId);
    if (pointer === undefined) return;
    const at = local(event);
    pointer.x = at.x;
    pointer.y = at.y;
    if (Math.hypot(at.x - pointer.startX, at.y - pointer.startY) > TAP_SLOP) g.moved = true;
    if (g.pinch !== null && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      if (a === undefined || b === undefined) return;
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const { from } = g.pinch;
      const scale = Math.min(Math.max(from.scale * (distance / g.pinch.distance), 1), live.current.maxScale);
      // The picture point under the starting midpoint follows the fingers' midpoint.
      const cx = (g.pinch.midX - from.x) / from.scale;
      const cy = (g.pinch.midY - from.y) / from.scale;
      apply({ scale, x: midX - scale * cx, y: midY - scale * cy });
      return;
    }
    if (g.pan !== null && g.pointers.size === 1 && g.pan.from.scale > 1 + EPS && g.moved) {
      g.gesture = true;
      apply({ scale: g.pan.from.scale, x: g.pan.from.x + (at.x - g.pan.x), y: g.pan.from.y + (at.y - g.pan.y) });
    }
  };

  const end = (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const g = gesture.current;
    const pointer = g.pointers.get(event.pointerId);
    if (pointer === undefined) return;
    g.pointers.delete(event.pointerId);
    if (g.pointers.size >= 2) {
      startPinch(g);
      return;
    }
    if (g.pointers.size === 1) {
      // From a pinch to one finger: the pan goes on from here.
      g.pinch = null;
      startPan(g);
      return;
    }
    const wasPinch = g.pinch !== null;
    g.pinch = null;
    g.pan = null;
    if (cancelled || wasPinch || g.moved) {
      g.lastTap = null;
      return;
    }
    if (!doubleTap) return;
    const at = local(event);
    const tapAt = event.timeStamp;
    const last = g.lastTap;
    if (last !== null && tapAt - last.at <= DOUBLE_TAP_MS && Math.hypot(at.x - last.x, at.y - last.y) <= DOUBLE_TAP_SLOP) {
      g.lastTap = null;
      const current = live.current.state;
      if (current.scale > 1 + EPS) apply(FIT);
      else apply(zoomAbout(current, Math.min(DOUBLE_TAP_SCALE, live.current.maxScale), at.x, at.y));
      return;
    }
    g.lastTap = { at: tapAt, x: at.x, y: at.y };
  };

  // Ctrl + wheel (a trackpad's pinch): a native listener, so the page's own zoom can be refused.
  useEffect(() => {
    const element = stageRef.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = live.current.state;
      const factor = Math.exp(-event.deltaY * 0.01);
      const scale = Math.min(Math.max(current.scale * factor, 1), live.current.maxScale);
      apply(zoomAbout(current, scale, event.clientX - rect.left, event.clientY - rect.top));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [apply]);

  const zoomAtCentre = (scale: number) => {
    const size = live.current.stage;
    const current = live.current.state;
    const target = Math.min(Math.max(scale, 1), live.current.maxScale);
    apply(size === null ? { ...current, scale: target } : zoomAbout(current, target, size.width / 2, size.height / 2));
  };

  return {
    ...state,
    stageRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp: (event) => end(event, false), onPointerCancel: (event) => end(event, true) },
    pictureStyle: { transform: `translate(${round(state.x)}px, ${round(state.y)}px) scale(${round(state.scale, 4)})`, transformOrigin: '0 0' },
    maxScale,
    canZoomIn: state.scale < maxScale - EPS,
    canZoomOut: state.scale > 1 + EPS,
    zoomIn: () => zoomAtCentre(live.current.state.scale * ZOOM_STEP),
    zoomOut: () => zoomAtCentre(live.current.state.scale / ZOOM_STEP),
    reset: () => apply(FIT),
    takeGesture: () => {
      const g = gesture.current;
      const was = g.gesture || g.moved;
      g.gesture = false;
      g.moved = false;
      return was;
    },
  };
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
