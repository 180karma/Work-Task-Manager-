// Promise-based confirm dialogs, rendered by <ConfirmHost />.

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PendingConfirm extends ConfirmRequest {
  resolve(ok: boolean): void;
}

let pending: PendingConfirm | null = null;
const listeners = new Set<(p: PendingConfirm | null) => void>();
const emit = () => listeners.forEach((l) => l(pending));

export function confirmAction(req: ConfirmRequest): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = {
      ...req,
      resolve(ok) {
        pending = null;
        emit();
        resolve(ok);
      },
    };
    emit();
  });
}

export function subscribeConfirm(l: (p: PendingConfirm | null) => void): () => void {
  listeners.add(l);
  l(pending);
  return () => listeners.delete(l);
}
