import { LuMenu } from 'react-icons/lu';
import type { LayoutMode } from '../../hooks/useMediaQuery';
import { confirmAction } from '../../state/confirm';
import { useMailActions } from '../../state/MailStore';
import { useUI, type Prefs } from '../../state/UIStore';
import { Toggle } from '../ui/primitives';
import { ShortcutList } from './Shortcuts';

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="setting">
      <span className="setting__label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className={`segmented__opt${value === o.value ? ' is-on' : ''}`} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsView({ layout }: { layout: LayoutMode }) {
  const ui = useUI();
  const mail = useMailActions();
  const p = ui.prefs;
  const set = (patch: Partial<Prefs>) => ui.setPrefs(patch);

  return (
    <section className="page" aria-labelledby="settings-title">
      <header className="page__head">
        {layout === 'narrow' && (
          <button type="button" className="icon-btn" aria-label="Open navigation" onClick={() => ui.setDrawer(true)}>
            <LuMenu />
          </button>
        )}
        <div>
          <h1 id="settings-title">Mail settings</h1>
          <p className="page__lede">Saved in this browser for your WTM account. Light and dark follow WTM.</p>
        </div>
      </header>

      <div className="page__body">
        <section className="settings-card">
          <h2>Appearance</h2>
          <Segmented<Prefs['density']>
            label="Density"
            value={p.density}
            onChange={(density) => set({ density })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
          <Segmented<Prefs['previewLines']>
            label="Preview lines"
            value={p.previewLines}
            onChange={(previewLines) => set({ previewLines })}
            options={[
              { value: 1, label: '1 line' },
              { value: 2, label: '2 lines' },
            ]}
          />
        </section>

        <section className="settings-card">
          <h2>Reading</h2>
          <Toggle label="Group by conversation" description="Show replies together as one thread." checked={p.conversations} onChange={(conversations) => set({ conversations })} />
          <Toggle label="Mark as read when opened" checked={p.markReadOnOpen} onChange={(markReadOnOpen) => set({ markReadOnOpen })} />
          <Toggle
            label="Always show remote images"
            description="Off keeps senders from knowing when you open their mail. You can still show images per message."
            checked={p.remoteImages}
            onChange={(remoteImages) => set({ remoteImages })}
          />
        </section>

        <section className="settings-card">
          <h2>Smart features</h2>
          <Toggle label="Smart features" description="Reserved for later AI features. They'll be off by default and chosen per account." checked={false} disabled onChange={() => {}} />
        </section>

        <section className="settings-card">
          <h2>Keyboard shortcuts</h2>
          <ShortcutList />
        </section>

        {mail.service.mode === 'mock' && (
          <section className="settings-card">
            <h2>Demo mailbox</h2>
            <p className="settings-card__text">Put every account, message, folder and label back the way they started.</p>
            <button
              type="button"
              className="btn btn--danger-ghost"
              onClick={async () => {
                const ok = await confirmAction({ title: 'Restore the demo mailbox?', message: 'Your changes to the demo data are lost.', confirmLabel: 'Restore', danger: true });
                if (ok) {
                  await mail.resetDemo();
                  ui.go('inbox', 'all');
                }
              }}
            >
              Restore demo mailbox
            </button>
          </section>
        )}
      </div>
    </section>
  );
}
