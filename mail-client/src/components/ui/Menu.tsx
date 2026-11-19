import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck } from 'react-icons/lu';
import { useOutsideClose } from '../../hooks/useOutsideClose';

/** One menu row. Use `divider` or `heading` for separators; otherwise give it a label and onSelect. */
export interface MenuEntry {
  id: string;
  label?: string;
  icon?: ReactNode;
  swatch?: string;
  checked?: boolean;
  danger?: boolean;
  /** Keep the menu open after selecting (e.g. toggling several labels). */
  keepOpen?: boolean;
  divider?: boolean;
  heading?: string;
  onSelect?: () => unknown;
}

interface Props {
  label: string;
  trigger: ReactNode;
  entries: MenuEntry[] | (() => MenuEntry[]);
  buttonClass?: string;
  align?: 'start' | 'end';
}

export function Menu({ label, trigger, entries, buttonClass = 'icon-btn', align = 'end' }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose([btn, pop], open, close);

  const list = open ? (typeof entries === 'function' ? entries() : entries) : [];

  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = pop.current.offsetWidth;
    const h = pop.current.offsetHeight;
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ top, left });
    pop.current.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [open, align]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(pop.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={buttonClass}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setPos(null);
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            id={id}
            className="menu"
            role="menu"
            aria-label={label}
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            onKeyDown={onKeyDown}
          >
            {list.map((m) =>
              m.divider ? (
                <div key={m.id} className="menu__divider" role="separator" />
              ) : m.heading ? (
                <div key={m.id} className="menu__heading">
                  {m.heading}
                </div>
              ) : (
                <button
                  key={m.id}
                  type="button"
                  role={m.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                  aria-checked={m.checked}
                  className={`menu__item${m.danger ? ' is-danger' : ''}`}
                  onClick={() => {
                    if (!m.keepOpen) setOpen(false);
                    void m.onSelect?.();
                  }}
                >
                  <span className="menu__icon">{m.swatch ? <span className="menu__swatch" style={{ background: m.swatch }} /> : m.icon}</span>
                  <span className="menu__label">{m.label}</span>
                  {m.checked && <LuCheck className="menu__check" />}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
