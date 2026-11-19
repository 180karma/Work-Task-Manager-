import { createContext, useContext, type ReactNode } from 'react';

/**
 * Where the mail UI is mounted inside WTM. The UI lives in a shadow root so WTM's
 * global CSS and the mail CSS can't affect each other; anything that would normally
 * use `document` (portals, outside clicks, selection, theme attributes) goes through here.
 */
export interface MailHost {
  /** Element inside the shadow root that holds the app; also the portal target for menus and dialogs. */
  root: HTMLElement;
  shadow: ShadowRoot;
  /** False while WTM shows another section or one of its own dialogs, so mail shortcuts stay quiet. */
  isActive(): boolean;
}

let current: MailHost | null = null;

export function setHost(host: MailHost | null): void {
  current = host;
}

const HostCtx = createContext<MailHost | null>(null);

export function HostProvider({ host, children }: { host: MailHost; children: ReactNode }) {
  return <HostCtx.Provider value={host}>{children}</HostCtx.Provider>;
}

export function useHost(): MailHost {
  const h = useContext(HostCtx);
  if (!h) throw new Error('Mail components must be rendered through mount() in embed.tsx');
  return h;
}

/** The selection inside the shadow root (Chromium exposes it there; elsewhere the document selection is used). */
export function getSelection(): Selection | null {
  const s = current?.shadow as (ShadowRoot & { getSelection?: () => Selection | null }) | undefined;
  return s?.getSelection?.() ?? document.getSelection();
}

/** The element an event really started on, looking through the shadow boundary. */
export function eventOrigin(e: Event): EventTarget | null {
  return e.composedPath()[0] ?? e.target;
}
