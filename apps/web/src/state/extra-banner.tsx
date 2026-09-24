import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Banner } from './banner-slot.tsx';

/*
 * A route's own contribution to the app's one banner slot (`banner-slot.tsx`'s `extra`
 * candidates), mirroring `back-target.tsx`'s pattern: `AppShell` renders the slot above
 * `<Outlet/>`, so a leaf surface (the Sumário's issued-revision banner, Story 4.6) cannot
 * hand it a candidate directly. It sets one while mounted and clears it on unmount or when
 * its own condition stops holding.
 */

interface ExtraBannerState {
  banner: Banner | null;
  setBanner: (banner: Banner | null) => void;
}

const ExtraBannerContext = createContext<ExtraBannerState | null>(null);

export function ExtraBannerProvider({ children }: { children: ReactNode }) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const value = useMemo(() => ({ banner, setBanner }), [banner]);
  return <ExtraBannerContext value={value}>{children}</ExtraBannerContext>;
}

/** The current route's contributed banner, read by `AppShell`. */
export function useExtraBannerValue(): Banner | null {
  return useContext(ExtraBannerContext)?.banner ?? null;
}

/** Publishes a banner into the app's one slot while the caller is mounted and this stays non-null. */
export function useExtraBanner(banner: Banner | null): void {
  const context = useContext(ExtraBannerContext);
  const setBanner = context?.setBanner;
  useEffect(() => {
    if (setBanner === undefined) return;
    setBanner(banner);
    return () => setBanner(null);
  }, [setBanner, banner]);
}
