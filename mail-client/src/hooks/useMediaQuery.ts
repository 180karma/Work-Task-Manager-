import { useSyncExternalStore } from 'react';

export type LayoutMode = 'wide' | 'medium' | 'narrow';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Wide ≥ 1200 px (three columns), medium 860–1199 px (icon rail), narrow < 860 px (one pane). */
export function useLayoutMode(): LayoutMode {
  const wide = useMediaQuery('(min-width: 1200px)');
  const medium = useMediaQuery('(min-width: 860px)');
  return wide ? 'wide' : medium ? 'medium' : 'narrow';
}
