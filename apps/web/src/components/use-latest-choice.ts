import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * E5-Q8: a radiogroup's value as its keyboard guards must read it. The rendered `value` is
 * one IndexedDB round trip behind a choice just emitted, so Space, ArrowRight and Delete in
 * quick succession would see Delete's "nothing to clear" guard read the stale `null` (or the
 * old segment) and drop the clear. `latest` holds the last value emitted by this control,
 * replaced by the prop whenever the prop changes; `emit` updates it before calling
 * `onChange`.
 */
export function useLatestChoice<T>(value: T | null, onChange: (value: T | null) => void): {
  latest: RefObject<T | null>;
  emit: (next: T | null) => void;
} {
  const latest = useRef<T | null>(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  const emit = useCallback(
    (next: T | null) => {
      latest.current = next;
      onChange(next);
    },
    [onChange],
  );
  return { latest, emit };
}
