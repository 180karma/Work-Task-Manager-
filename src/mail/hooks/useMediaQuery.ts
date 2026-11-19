import { useEffect, useState, useSyncExternalStore } from 'react';
import { useHost } from '../host';

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

/**
 * Mail sits beside WTM's navigation, so the layout follows the width Mail actually has, not the window.
 * Wide ≥ 1100 px (three columns), medium 860–1099 px (icon rail), narrow < 860 px (one pane).
 */
export function useLayoutMode(): LayoutMode {
  const { root } = useHost();
  const [width, setWidth] = useState(() => root.clientWidth || window.innerWidth);
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);
  return width >= 1100 ? 'wide' : width >= 860 ? 'medium' : 'narrow';
}
