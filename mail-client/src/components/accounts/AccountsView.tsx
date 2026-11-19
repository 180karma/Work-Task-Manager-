import { useState } from 'react';
import { LuCircleAlert, LuCircleCheck, LuMail, LuMenu, LuPlugZap, LuRefreshCw, LuShieldCheck, LuUnplug } from 'react-icons/lu';
import type { LayoutMode } from '../../hooks/useMediaQuery';
import { formatRelative } from '../../lib/format';
import { confirmAction } from '../../state/confirm';
import { useMailActions, useMailState } from '../../state/MailStore';
import { useUI } from '../../state/UIStore';
import type { EmailAccount } from '../../types/mail';
import { Spinner } from '../ui/primitives';

const SCOPES: Record<EmailAccount['provider'], string[]> = {
  gmail: ['Read and organise mail (gmail.modify)', 'Send mail as you', 'Your basic profile: name and email address'],
  outlook: ['Read and organise mail (Mail.ReadWrite)', 'Send mail as you (Mail.Send)', 'Stay signed in (offline_access)'],
};

export function AccountsView({ layout }: { layout: LayoutMode }) {
  const state = useMailState();
  const mail = useMailActions();
  const ui = useUI();
  const demo = mail.service.mode === 'mock';

  return (
    <section className="page" aria-labelledby="accounts-title">
      <header className="page__head">
        {layout === 'narrow' && (
          <button type="button" className="icon-btn" aria-label="Open navigation" onClick={() => ui.setDrawer(true)}>
            <LuMenu />
          </button>
        )}
        <div>
          <h1 id="accounts-title">Connected accounts</h1>
          <p className="page__lede">
            Relay reads and sends through your existing Gmail and Microsoft accounts using their official sign-in. Your mail stays with your provider, and Relay never asks for or stores your
            email password.
          </p>
        </div>
      </header>

      <div className="page__body">
        <div className="connect-row">
          <button type="button" className="connect-btn" onClick={() => void mail.connect('gmail')}>
            <span className="connect-btn__mark is-gmail">
              <LuMail />
            </span>
            <span>
              <span className="connect-btn__title">Connect Gmail</span>
              <span className="connect-btn__sub">Sign in with Google</span>
            </span>
          </button>
          <button type="button" className="connect-btn" onClick={() => void mail.connect('outlook')}>
            <span className="connect-btn__mark is-outlook">
              <LuMail />
            </span>
            <span>
              <span className="connect-btn__title">Connect Microsoft Outlook</span>
              <span className="connect-btn__sub">Outlook.com, Hotmail or Microsoft 365</span>
            </span>
          </button>
        </div>

        {demo && (
          <p className="notice notice--info">
            <LuCircleAlert />
            <span>Demo mailbox. These accounts are sample data so you can try every screen. Google and Microsoft sign-in are wired up in Phases 3 and 4.</span>
          </p>
        )}

        {state.accounts.length === 0 ? (
          <div className="empty">
            <LuPlugZap className="empty__icon" />
            <h2>No accounts connected</h2>
            <p>Connect a Gmail or Outlook account to start reading mail here. You can add as many as you like.</p>
          </div>
        ) : (
          <ul className="account-list">
            {state.accounts.map((a) => (
              <AccountCard key={a.id} account={a} syncing={state.syncing.has(a.id)} onlyAccount={state.accounts.length === 1} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AccountCard({ account: a, syncing, onlyAccount }: { account: EmailAccount; syncing: boolean; onlyAccount: boolean }) {
  const mail = useMailActions();
  const [sig, setSig] = useState(a.signature);
  const [showScopes, setShowScopes] = useState(false);
  const status = syncing ? 'syncing' : a.syncStatus;

  return (
    <li className="account-card" style={{ ['--acct' as string]: a.colour }}>
      <div className="account-card__head">
        <span className="account-card__swatch" aria-hidden="true" />
        <div className="account-card__id">
          <h2>{a.label}</h2>
          <span className="account-card__email">{a.providerEmail}</span>
          <span className="account-card__provider">{a.provider === 'gmail' ? 'Gmail' : 'Microsoft Outlook'}</span>
        </div>
        <span className={`status-badge is-${status}`}>
          {status === 'syncing' ? <Spinner size={12} /> : status === 'error' ? <LuCircleAlert /> : <LuCircleCheck />}
          {status === 'syncing' ? 'Syncing' : status === 'error' ? 'Needs attention' : 'Connected'}
        </span>
      </div>

      {a.syncStatus === 'error' && (
        <div className="notice notice--danger">
          <span>{a.syncError}</span>
          <button type="button" className="btn btn--sm" onClick={() => void mail.connect(a.provider)}>
            Reconnect
          </button>
        </div>
      )}

      <dl className="account-card__facts">
        <div>
          <dt>Last synced</dt>
          <dd title={a.lastSyncAt ?? undefined}>{formatRelative(a.lastSyncAt)}</dd>
        </div>
        <div>
          <dt>Connected</dt>
          <dd>{new Date(a.connectedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
        </div>
        <div>
          <dt>Sends as</dt>
          <dd>{a.displayName}</dd>
        </div>
      </dl>

      <label className="check-row">
        <input type="radio" name="default-account" checked={a.isDefault} onChange={() => mail.setDefaultAccount(a.id)} />
        <span>Default account for new messages</span>
      </label>

      <label className="field-label" htmlFor={`sig-${a.id}`}>
        Signature
      </label>
      <textarea
        id={`sig-${a.id}`}
        className="text-input text-area"
        rows={3}
        value={sig}
        maxLength={1000}
        onChange={(e) => setSig(e.target.value)}
        onBlur={() => sig !== a.signature && mail.updateSignature(a.id, sig)}
      />

      <button type="button" className="link-btn" aria-expanded={showScopes} onClick={() => setShowScopes((s) => !s)}>
        <LuShieldCheck /> What Relay can access
      </button>
      {showScopes && (
        <ul className="scope-list">
          {SCOPES[a.provider].map((s) => (
            <li key={s}>{s}</li>
          ))}
          <li className="is-never">Never your password. Sign-in tokens are encrypted on the server and never sent to this browser.</li>
        </ul>
      )}

      <div className="account-card__actions">
        <button type="button" className="btn" onClick={() => void mail.syncAccount(a.id)} disabled={syncing || a.syncStatus === 'error'}>
          {syncing ? <Spinner size={14} /> : <LuRefreshCw />} Sync now
        </button>
        <button
          type="button"
          className="btn btn--danger-ghost"
          onClick={async () => {
            const ok = await confirmAction({
              title: `Disconnect ${a.providerEmail}?`,
              message: `Relay stops syncing this account and removes its cached mail from Relay. Nothing is deleted from ${a.provider === 'gmail' ? 'Gmail' : 'Outlook'}. ${
                onlyAccount ? 'This is your only connected account.' : ''
              }`,
              confirmLabel: 'Disconnect',
              danger: true,
            });
            if (ok) await mail.disconnect(a.id);
          }}
        >
          <LuUnplug /> Disconnect
        </button>
      </div>
    </li>
  );
}
