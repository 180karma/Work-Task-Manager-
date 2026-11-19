// Entry point for WTM's Mail section. Built to js/mail/relay-mail.js, which sets window.RelayMail.
// js/app.js calls RelayMail.mount() the first time someone opens Mail, and unmount() on sign-out.
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { configure } from './config/env';
import { HostProvider, setHost, type MailHost } from './host';
import { setStorageScope } from './lib/storage';
import { resetMailService } from './services/mail';
import appCss from './styles/app.css?inline';
import tokensCss from './styles/tokens.css?inline';

export interface MountOptions {
  /** The signed-in WTM user. Demo data is kept per user on a shared device. */
  userId?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** WTM's Supabase client, for the Phase 2 backend (shared project and sign-in). */
  getSupabase?: () => unknown;
  isActive?: () => boolean;
}

export interface Mounted {
  unmount(): void;
}

let active: { host: HTMLElement; root: Root } | null = null;

export function mount(hostEl: HTMLElement, opts: MountOptions = {}): Mounted {
  if (active) unmount();
  configure({ supabaseUrl: opts.supabaseUrl, supabaseAnonKey: opts.supabaseAnonKey, getSupabase: opts.getSupabase });
  setStorageScope(opts.userId ?? '');
  resetMailService();

  const shadow = hostEl.shadowRoot ?? hostEl.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = `${tokensCss}\n${appCss}`;
  const container = document.createElement('div');
  container.className = 'relay-root';
  shadow.append(style, container);

  const host: MailHost = { root: container, shadow, isActive: () => hostEl.isConnected && hostEl.offsetParent !== null && (opts.isActive?.() ?? true) };
  setHost(host);
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <HostProvider host={host}>
        <App />
      </HostProvider>
    </StrictMode>,
  );
  active = { host: hostEl, root };
  return { unmount };
}

export function unmount(): void {
  if (!active) return;
  active.root.unmount();
  if (active.host.shadowRoot) active.host.shadowRoot.innerHTML = '';
  active = null;
  setHost(null);
}
