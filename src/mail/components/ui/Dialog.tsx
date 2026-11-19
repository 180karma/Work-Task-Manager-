import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';
import { useHost } from '../../host';

/** Modal dialog: traps Tab, closes on Escape or backdrop click, restores focus on close. */
export function Dialog({ title, onClose, width = 440, children }: { title: string; onClose: () => void; width?: number; children: ReactNode }) {
  const host = useHost();
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = host.shadow.activeElement as HTMLElement | null;
    const el = box.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input, textarea, select, button:not(.dialog__x)');
    first?.focus();
    return () => prev?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((x) => !x.hasAttribute('disabled'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const focused = host.shadow.activeElement;
    if (e.shiftKey && focused === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && focused === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ maxWidth: width }} onKeyDown={onKeyDown}>
        <header className="dialog__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn icon-btn--sm dialog__x" aria-label="Close" onClick={onClose}>
            <LuX />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
      </div>
    </div>,
    host.root,
  );
}

interface PromptProps {
  title: string;
  label: string;
  placeholder?: string;
  initial?: string;
  confirmLabel: string;
  onClose: () => void;
  /** Return false to keep the dialog open (e.g. the name was rejected). */
  onSubmit: (value: string) => unknown;
}

export function PromptDialog({ title, label, placeholder, initial = '', confirmLabel, onClose, onSubmit }: PromptProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      setError(`Enter a ${label.toLowerCase()}.`);
      return;
    }
    setBusy(true);
    const result = await onSubmit(value.trim());
    setBusy(false);
    if (result !== false) onClose();
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <form className="form-stack" onSubmit={submit} noValidate>
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          className="text-input"
          value={value}
          placeholder={placeholder}
          maxLength={40}
          data-autofocus
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
        />
        <p className="field-error" role="alert">
          {error}
        </p>
        <div className="dialog__foot dialog__foot--inline">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
