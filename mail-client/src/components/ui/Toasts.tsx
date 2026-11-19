import { useEffect, useState } from 'react';
import { LuX } from 'react-icons/lu';
import { dismissToast, subscribeToasts, type ToastItem } from '../../state/toast';

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} className={`toast${t.tone === 'error' ? ' is-error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span className="toast__msg">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="icon-btn icon-btn--xs toast__x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <LuX />
          </button>
        </div>
      ))}
    </div>
  );
}
