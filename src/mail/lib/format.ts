const DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Heading for the date group a message falls into in the list. */
export function dateGroup(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const weekday = (now.getDay() + 6) % 7; // Monday = 0
  if (days <= weekday) return 'Earlier this week';
  if (days <= weekday + 7) return 'Last week';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'Earlier this month';
  return d.toLocaleDateString(undefined, { month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Compact date for list rows: time today, weekday this week, then day and month. */
export function formatListDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days <= 0) return formatTime(iso);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
}

/** Full date for the reading pane. */
export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const diff = now.getTime() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function initials(name: string, email: string): string {
  const parts = (name || email).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/);
  const out = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return out.toUpperCase();
}
