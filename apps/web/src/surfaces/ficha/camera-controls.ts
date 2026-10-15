import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { pointerGesture } from '../../input/pointer-gesture.ts';
import { BASIC_CONSTRAINTS } from './camera-stream.ts';

/*
 * E13-A6: what the camera's track lets the view control (`camera-view.tsx` says what the camera
 * does): its capabilities, the zoom math, where a tap lands in the frame, and the controls
 * (torch, zoom, tap-to-focus) on the session's track.
 */

/** The zoom range a track offers. */
export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

/** Story 13.2: what the track lets the camera view control; each control renders only when offered. */
export interface CameraCapabilities {
  torch: boolean;
  zoom: ZoomRange | null;
  /** The focus mode a tap applies with its point of interest; null when focus is not offered. */
  focusMode: 'single-shot' | 'continuous' | 'manual' | null;
}

type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min?: number; max?: number; step?: number };
  focusMode?: string[];
  pointsOfInterest?: unknown;
};

const NO_CAPABILITIES: CameraCapabilities = { torch: false, zoom: null, focusMode: null };

/** Reads the track's capabilities; a browser without `getCapabilities` (or one that throws) offers nothing. */
export function cameraCapabilities(track: MediaStreamTrack | null): CameraCapabilities {
  if (track === null || typeof track.getCapabilities !== 'function') return NO_CAPABILITIES;
  let caps: ExtendedCapabilities;
  let settings: Record<string, unknown> = {};
  try {
    caps = track.getCapabilities() as ExtendedCapabilities;
    if (typeof track.getSettings === 'function') settings = track.getSettings() as Record<string, unknown>;
  } catch {
    return NO_CAPABILITIES;
  }
  const z = caps.zoom;
  const zoom =
    z !== undefined && typeof z.min === 'number' && typeof z.max === 'number' && Number.isFinite(z.min) && Number.isFinite(z.max) && z.max > z.min
      ? { min: z.min, max: z.max, step: typeof z.step === 'number' && z.step > 0 ? z.step : 0 }
      : null;
  const modes = Array.isArray(caps.focusMode) ? caps.focusMode : [];
  const points = 'pointsOfInterest' in caps || 'pointsOfInterest' in settings;
  const focusMode = modes.includes('single-shot')
    ? 'single-shot'
    : points && modes.includes('continuous')
      ? 'continuous'
      : points && modes.includes('manual')
        ? 'manual'
        : null;
  return { torch: caps.torch === true, zoom, focusMode };
}

/** `value` inside the range, on its step. */
export function clampZoom(value: number, range: ZoomRange): number {
  const clamped = Math.min(range.max, Math.max(range.min, Number.isFinite(value) ? value : range.min));
  if (!(range.step > 0)) return clamped;
  const snapped = range.min + Math.round((clamped - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, Number(snapped.toFixed(6))));
}

/** One press of "-" or "+": a tenth of the range, at least one step. */
export function zoomIncrement(range: ZoomRange): number {
  return Math.max(range.step, (range.max - range.min) / 10);
}

/**
 * Where a tap on the finder lands in the frame, 0..1 on each axis. The preview fills the
 * finder (`object-fit: cover`), so the frame's overflow is taken out first.
 */
export function framePoint(
  tap: { x: number; y: number },
  box: { width: number; height: number },
  frame: { width: number; height: number },
): { x: number; y: number } {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  if (box.width <= 0 || box.height <= 0) return { x: 0.5, y: 0.5 };
  if (frame.width <= 0 || frame.height <= 0) return { x: clamp(tap.x / box.width), y: clamp(tap.y / box.height) };
  const scale = Math.max(box.width / frame.width, box.height / frame.height);
  const offsetX = (box.width - frame.width * scale) / 2;
  const offsetY = (box.height - frame.height * scale) / 2;
  return { x: clamp((tap.x - offsetX) / scale / frame.width), y: clamp((tap.y - offsetY) / scale / frame.height) };
}

/** A tap that moved further than this is a drag, not a focus tap. */
const TAP_SLOP_PX = 10;
/** How long the focus ring stays on the tapped point. */
const FOCUS_RING_MS = 900;

const clientPoint = (event: { clientX: number; clientY: number }) => ({ x: event.clientX, y: event.clientY });

/**
 * Story 13.2 (CAP-2): torch, zoom and tap-to-focus on the session's track, each through
 * `applyConstraints`. A constraint the camera refuses leaves the state as it was. The torch
 * is set off when the session starts.
 */
export function useCameraControls(track: MediaStreamTrack | null, capabilities: CameraCapabilities, video: RefObject<HTMLVideoElement | null>) {
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const apply = useCallback(
    (constraints: Record<string, unknown>): Promise<void> => {
      if (track === null || typeof track.applyConstraints !== 'function') return Promise.reject(new Error('no track'));
      try {
        // The session's basic constraints go with every change, so the camera keeps its resolution.
        return track.applyConstraints({ ...BASIC_CONSTRAINTS, advanced: [constraints as MediaTrackConstraintSet] });
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error('applyConstraints threw'));
      }
    },
    [track],
  );

  // Torch: off at the start of every session, whatever the camera kept from the last one.
  const [torch, setTorchState] = useState(false);
  useEffect(() => {
    if (capabilities.torch) void apply({ torch: false }).catch(() => undefined);
  }, [capabilities.torch, apply]);
  const setTorch = useCallback(
    (on: boolean) => {
      apply({ torch: on }).then(
        () => {
          if (live.current) setTorchState(on);
        },
        () => undefined,
      );
    },
    [apply],
  );

  // Zoom: one request in flight at a time; a pinch keeps only its latest wish.
  const range = capabilities.zoom;
  const initialZoom = useMemo(() => {
    if (range === null) return 1;
    const current = track !== null && typeof track.getSettings === 'function' ? (track.getSettings() as { zoom?: unknown }).zoom : undefined;
    return clampZoom(typeof current === 'number' ? current : range.min, range);
  }, [range, track]);
  const [zoom, setZoomState] = useState(initialZoom);
  const applied = useRef(initialZoom);
  const wanted = useRef(initialZoom);
  const busy = useRef(false);
  const pump = useCallback(() => {
    if (busy.current) return;
    const next = wanted.current;
    if (next === applied.current) return;
    busy.current = true;
    apply({ zoom: next })
      .then(
        () => {
          applied.current = next;
          if (live.current) setZoomState(next);
        },
        () => {
          // Refused: the camera stays where it was, and so does the wish.
          if (wanted.current === next) wanted.current = applied.current;
        },
      )
      .finally(() => {
        busy.current = false;
        pump();
      });
  }, [apply]);
  const zoomTo = useCallback(
    (value: number) => {
      if (range === null) return;
      wanted.current = clampZoom(value, range);
      pump();
    },
    [range, pump],
  );
  const zoomIn = useCallback(() => {
    if (range !== null) zoomTo(wanted.current + zoomIncrement(range));
  }, [range, zoomTo]);
  const zoomOut = useCallback(() => {
    if (range !== null) zoomTo(wanted.current - zoomIncrement(range));
  }, [range, zoomTo]);

  // Focus: a tap on the preview names the point; a brief ring marks it.
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(ringTimer.current), []);
  const focusAt = (element: HTMLElement, clientX: number, clientY: number) => {
    if (capabilities.focusMode === null) return;
    const box = element.getBoundingClientRect();
    const tap = { x: clientX - box.left, y: clientY - box.top };
    const frame = { width: video.current?.videoWidth ?? 0, height: video.current?.videoHeight ?? 0 };
    const point = framePoint(tap, { width: box.width, height: box.height }, frame);
    void apply({ pointsOfInterest: [point], focusMode: capabilities.focusMode }).catch(() => undefined);
    setFocusRing((ring) => ({ x: tap.x, y: tap.y, key: (ring?.key ?? 0) + 1 }));
    clearTimeout(ringTimer.current);
    ringTimer.current = setTimeout(() => {
      if (live.current) setFocusRing(null);
    }, FOCUS_RING_MS);
  };

  // Pointers on the finder (client coordinates, E13-A6's shared core): one that lifts where it
  // went down is a focus tap; two pinch the zoom.
  const pointers = useRef(pointerGesture({ tapSlop: TAP_SLOP_PX, coords: clientPoint }));
  const pinch = useRef<{ spread: number; zoom: number } | null>(null);
  const tap = useRef<{ id: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // Captured, so a finger lifted outside the finder still ends here and leaves no stale pointer.
    pointers.current.down(event);
    if (pointers.current.size === 1) {
      tap.current = { id: event.pointerId };
      return;
    }
    tap.current = null;
    if (pointers.current.size === 2 && range !== null) pinch.current = { spread: pointers.current.spread(), zoom: wanted.current };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const moved = pointers.current.move(event);
    if (moved === null) return;
    if (tap.current !== null && pointers.current.beyondSlop(moved)) tap.current = null;
    const from = pinch.current;
    if (from !== null && from.spread > 0 && pointers.current.size >= 2) zoomTo(from.zoom * (pointers.current.spread() / from.spread));
  };
  const release = (event: ReactPointerEvent<HTMLElement>, lifted: boolean) => {
    const start = tap.current;
    if (lifted && start !== null && start.id === event.pointerId && pointers.current.size === 1) focusAt(event.currentTarget, event.clientX, event.clientY);
    pointers.current.up(event);
    tap.current = null;
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => release(event, true);
  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => release(event, false);

  return { torch, setTorch, zoom, zoomIn, zoomOut, focusRing, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
