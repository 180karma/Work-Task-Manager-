import { useEffect, useState } from 'react';
import { subscribeConfirm, type PendingConfirm } from '../../state/confirm';
import { Dialog } from './Dialog';

export function ConfirmHost() {
  const [req, setReq] = useState<PendingConfirm | null>(null);
  useEffect(() => subscribeConfirm(setReq), []);
  if (!req) return null;
  return (
    <Dialog title={req.title} onClose={() => req.resolve(false)}>
      <p className="dialog__message">{req.message}</p>
      <div className="dialog__foot">
        <button type="button" className="btn" onClick={() => req.resolve(false)}>
          {req.cancelLabel ?? 'Cancel'}
        </button>
        <button type="button" className={`btn ${req.danger ? 'btn--danger' : 'btn--primary'}`} data-autofocus onClick={() => req.resolve(true)}>
          {req.confirmLabel ?? 'OK'}
        </button>
      </div>
    </Dialog>
  );
}
