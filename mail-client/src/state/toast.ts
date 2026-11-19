// A tiny toast bus so non-React code (stores, commands) can show messages.

export interface ToastItem {
  id: number;
  message: string;
  tone: 'default' | 'error';
  action?: { label: string; run: () => void };
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let next = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(items));

export function toast(message: string, opts: { tone?: ToastItem['tone']; action?: ToastItem['action']; durationMs?: number } = {}): number {
  const id = next++;
  items = [...items.slice(-2), { id, message, tone: opts.tone ?? 'default', action: opts.action }];
  emit();
  window.setTimeout(() => dismissToast(id), opts.durationMs ?? (opts.action ? 6000 : 3500));
  return id;
}

export function dismissToast(id: number): void {
  if (!items.some((t) => t.id === id)) return;
  items = items.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  l(items);
  return () => listeners.delete(l);
}
