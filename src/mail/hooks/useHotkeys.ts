import { useEffect, useRef } from 'react';
import { eventOrigin, useHost } from '../host';

type Handlers = Record<string, () => unknown>;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Single-key shortcuts. Ignored while typing, with Ctrl/Cmd/Alt held, while a modal dialog is open, or while Mail isn't the WTM section on screen. */
export function useHotkeys(handlers: Handlers): void {
  const host = useHost();
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !host.isActive()) return;
      const origin = eventOrigin(e);
      if (isTyping(origin)) {
        if (e.key === 'Escape' && origin instanceof HTMLInputElement && origin.type === 'search') origin.blur();
        return;
      }
      if (host.root.querySelector('.dialog-backdrop')) return;
      const fn = ref.current[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [host]);
}
