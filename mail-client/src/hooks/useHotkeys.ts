import { useEffect, useRef } from 'react';

type Handlers = Record<string, () => unknown>;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Single-key shortcuts. Ignored while typing, with Ctrl/Cmd/Alt held, or while a modal dialog is open. */
export function useHotkeys(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === 'Escape' && e.target instanceof HTMLInputElement && e.target.type === 'search') e.target.blur();
        return;
      }
      if (document.querySelector('.dialog-backdrop')) return;
      const fn = ref.current[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
