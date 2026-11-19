// localStorage wrappers that never throw (private mode, quota, corrupt JSON).
// Keys are scoped to the signed-in WTM user, because WTM shares one origin (and often one device) between staff.

let prefix = 'relay-mail:';

export function setStorageScope(userId: string): void {
  prefix = userId ? `relay-mail:${userId}:` : 'relay-mail:';
}

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(prefix + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(prefix + key);
  } catch {
    /* ignore */
  }
}
