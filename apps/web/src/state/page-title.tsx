import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/*
 * The App bar's title when the route alone cannot say it (Story 5.1: a sheet's title is its
 * TAG, which only the block's equipment row names). A surface sets it while mounted and
 * clears it on unmount; the shell reads it over the route's own `handle.title`, the same
 * shape and precedence as `back-target.tsx`.
 */

interface PageTitleState {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const PageTitleContext = createContext<PageTitleState | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const value = useMemo(() => ({ title, setTitle }), [title]);
  return <PageTitleContext value={value}>{children}</PageTitleContext>;
}

/** The current override, null when the route's own title applies. */
export function usePageTitleValue(): string | null {
  return useContext(PageTitleContext)?.title ?? null;
}

/** Sets the App bar's title while the caller is mounted. */
export function usePageTitle(title: string | null): void {
  const context = useContext(PageTitleContext);
  const setTitle = context?.setTitle;
  useEffect(() => {
    if (setTitle === undefined) return;
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
}
