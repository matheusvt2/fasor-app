import { useEffect, useRef } from 'react';

// Moved from `instrument-panel.tsx` (Story 14.12 review): the Frases de NC panel re-seeds its field the same way.
/**
 * Ledger 310 (Story 10.4): a field seeds its text from the live row once, and re-seeds it when
 * the row changes under it (another device edited the instrument) while the person is not in
 * the field and has no unsaved change of their own; the field they are editing keeps its text.
 * A change that lands while the field is focused is applied on blur when the person made no
 * change of their own meanwhile.
 */
export function useLiveReseed(key: string, reseed: () => void, dirty: () => boolean): { onFocus: () => void; onBlur: () => void } {
  const focused = useRef(false);
  const latest = useRef({ key, reseed, dirty });
  latest.current = { key, reseed, dirty };
  /** The row key the field's text was last seeded from. */
  const seeded = useRef(key);
  const apply = () => {
    if (latest.current.dirty()) return;
    seeded.current = latest.current.key;
    latest.current.reseed();
  };
  useEffect(() => {
    if (key === seeded.current || focused.current) return;
    apply();
  }, [key]);
  return {
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (latest.current.key !== seeded.current) apply();
    },
  };
}
