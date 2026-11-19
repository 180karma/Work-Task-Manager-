import { useEffect, useState } from 'react';
import { AccountsView } from './components/accounts/AccountsView';
import { ComposeDock } from './components/compose/ComposeWindow';
import { Sidebar } from './components/layout/Sidebar';
import { MailView } from './components/mail/MailView';
import { SettingsView } from './components/settings/SettingsView';
import { ShortcutsDialog } from './components/settings/Shortcuts';
import { ConfirmHost } from './components/ui/ConfirmHost';
import { Toasts } from './components/ui/Toasts';
import { useHost } from './host';
import { useLayoutMode } from './hooks/useMediaQuery';
import { MailProvider, useMailActions, useMailState } from './state/MailStore';
import { UIProvider, useUI } from './state/UIStore';

function Shell() {
  const host = useHost();
  const layout = useLayoutMode();
  const ui = useUI();
  const state = useMailState();
  const mail = useMailActions();
  const [railOpen, setRailOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  useEffect(() => {
    host.root.dataset.density = ui.prefs.density;
  }, [host, ui.prefs.density]);

  // Close overlays when the layout changes.
  useEffect(() => {
    setRailOpen(false);
    ui.setDrawer(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  if (state.status === 'error') {
    return (
      <div className="fatal">
        <h1>Mail couldn't load</h1>
        <p>{state.error}</p>
        <button type="button" className="btn btn--primary" onClick={() => void mail.reload()}>
          Try again
        </button>
      </div>
    );
  }

  const content =
    ui.screen === 'accounts' ? <AccountsView layout={layout} /> : ui.screen === 'settings' ? <SettingsView layout={layout} /> : <MailView layout={layout} onShowShortcuts={() => setShortcuts(true)} />;

  return (
    <div className={`app layout-${layout}`}>
      {layout === 'wide' && <Sidebar />}
      {layout === 'medium' && (
        <>
          <Sidebar rail onToggleRail={() => setRailOpen(true)} />
          {railOpen && (
            <div className="drawer" onPointerDown={(e) => e.target === e.currentTarget && setRailOpen(false)} onClick={(e) => (e.target as HTMLElement).closest('.nav-item__main') && setRailOpen(false)}>
              <Sidebar onToggleRail={() => setRailOpen(false)} />
            </div>
          )}
        </>
      )}
      {layout === 'narrow' && ui.drawerOpen && (
        <div className="drawer" onPointerDown={(e) => e.target === e.currentTarget && ui.setDrawer(false)}>
          <Sidebar onToggleRail={() => ui.setDrawer(false)} />
        </div>
      )}
      <div className="main">{content}</div>
      <ComposeDock layout={layout} />
      <Toasts />
      <ConfirmHost />
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <MailProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </MailProvider>
  );
}
