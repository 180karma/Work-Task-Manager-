import { useEffect, type RefObject } from 'react';
import { eventOrigin } from '../host';

/** Calls `onClose` on a pointer press outside every given element, or on Escape. */
export function useOutsideClose(refs: RefObject<HTMLElement | null>[], open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      // Inside the shadow root, e.target is retargeted to the host element, so use the real origin.
      const origin = eventOrigin(e) as Node;
      if (refs.some((r) => r.current?.contains(origin))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);
}
