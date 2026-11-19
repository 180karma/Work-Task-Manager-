import { useState, type ReactNode } from 'react';
import {
  LuArchive,
  LuCircleAlert,
  LuEllipsis,
  LuFileText,
  LuFlag,
  LuFolder,
  LuInbox,
  LuLayers,
  LuMoon,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPlus,
  LuSend,
  LuSettings,
  LuShieldAlert,
  LuSquarePen,
  LuStar,
  LuSun,
  LuTag,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu';
import { confirmAction } from '../../state/confirm';
import { useMailActions, useMailState } from '../../state/MailStore';
import { countUnread, type FolderView } from '../../state/selectors';
import { useUI } from '../../state/UIStore';
import { PromptDialog } from '../ui/Dialog';
import { Menu } from '../ui/Menu';
import { Logo, Spinner } from '../ui/primitives';
import { LabelDialog } from './LabelDialog';

export const DRAG_TYPE = 'application/x-relay-messages';

interface NavItemProps {
  icon: ReactNode;
  label: string;
  count?: number;
  countStyle?: 'unread' | 'total';
  active?: boolean;
  onClick: () => void;
  dropFolder?: string;
  accent?: string;
  trailing?: ReactNode;
  sublabel?: string;
}

function NavItem({ icon, label, count, countStyle = 'unread', active, onClick, dropFolder, accent, trailing, sublabel }: NavItemProps) {
  const { moveMessages } = useMailActions();
  const { folders } = useMailState();
  const [over, setOver] = useState(false);
  const drop = dropFolder
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOver(true);
          }
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: React.DragEvent) => {
          setOver(false);
          const raw = e.dataTransfer.getData(DRAG_TYPE);
          if (!raw) return;
          e.preventDefault();
          try {
            const ids = JSON.parse(raw) as string[];
            if (Array.isArray(ids) && ids.every((x) => typeof x === 'string')) {
              moveMessages(ids, dropFolder, folders.find((f) => f.id === dropFolder)?.name ?? label);
            }
          } catch {
            /* not ours */
          }
        },
      }
    : {};
  return (
    <div className={`nav-item${active ? ' is-active' : ''}${over ? ' is-drop' : ''}`} {...drop} style={accent ? { ['--acct' as string]: accent } : undefined}>
      <button type="button" className="nav-item__main" onClick={onClick} aria-current={active ? 'page' : undefined} title={label}>
        <span className="nav-item__icon">{icon}</span>
        <span className="nav-item__text">
          <span className="nav-item__label">{label}</span>
          {sublabel && <span className="nav-item__sub">{sublabel}</span>}
        </span>
        {!!count && <span className={`nav-count${countStyle === 'total' ? ' is-total' : ''}`}>{count > 999 ? '999+' : count}</span>}
      </button>
      {trailing}
    </div>
  );
}

export function Sidebar({ rail = false, onToggleRail }: { rail?: boolean; onToggleRail?: () => void }) {
  const state = useMailState();
  const mail = useMailActions();
  const ui = useUI();
  const [dialog, setDialog] = useState<null | { kind: 'folder' } | { kind: 'rename'; id: string; name: string } | { kind: 'label' }>(null);
  const counts = countUnread(state.emails, ui.scope);
  const scopeAccount = state.accounts.find((a) => a.id === ui.scope);
  const isMail = ui.screen === 'mail';
  const allInboxActive = isMail && ui.folder === 'inbox' && ui.scope === 'all' && !ui.query;
  const at = (f: FolderView) => isMail && !ui.query && ui.folder === f && !(f === 'inbox' && ui.scope === 'all');

  const system: { f: FolderView; label: string; icon: ReactNode; count?: number; countStyle?: 'total'; drop?: string }[] = [
    { f: 'inbox', label: 'Inbox', icon: <LuInbox />, count: counts.inbox, drop: 'inbox' },
    { f: 'starred', label: 'Starred', icon: <LuStar /> },
    { f: 'important', label: 'Important', icon: <LuFlag /> },
    { f: 'drafts', label: 'Drafts', icon: <LuFileText />, count: counts.drafts, countStyle: 'total' },
    { f: 'sent', label: 'Sent', icon: <LuSend /> },
    { f: 'archive', label: 'Archive', icon: <LuArchive />, drop: 'archive' },
    { f: 'spam', label: 'Spam', icon: <LuShieldAlert />, count: counts.spam, drop: 'spam' },
    { f: 'trash', label: 'Trash', icon: <LuTrash2 />, drop: 'trash' },
  ];

  const anySyncing = state.syncing.size > 0;

  return (
    <nav className={`sidebar${rail ? ' is-rail' : ''}`} aria-label="Mail folders">
      <div className="sidebar__top">
        <Logo withName={!rail} />
        {onToggleRail && (
          <button type="button" className="icon-btn on-navy" aria-label={rail ? 'Expand navigation' : 'Collapse navigation'} title={rail ? 'Expand navigation' : 'Collapse navigation'} onClick={onToggleRail}>
            {rail ? <LuPanelLeftOpen /> : <LuPanelLeftClose />}
          </button>
        )}
      </div>

      <button type="button" className="compose-btn" onClick={() => ui.openCompose('new')} title="New message (c)">
        <LuSquarePen />
        {!rail && <span>New message</span>}
      </button>

      <div className="sidebar__scroll">
        <div className="nav-group">
          <NavItem icon={<LuLayers />} label="All inboxes" count={counts.allInboxes} active={allInboxActive} onClick={() => ui.go('inbox', 'all')} />
        </div>

        <div className="nav-group">
          {!rail && (
            <div className="nav-heading">
              <span>{scopeAccount ? scopeAccount.label : 'All accounts'}</span>
              {scopeAccount && (
                <button type="button" className="nav-heading__link" onClick={() => ui.setScope('all')}>
                  Show all
                </button>
              )}
            </div>
          )}
          {system.map((s) => (
            <NavItem
              key={s.f}
              icon={s.icon}
              label={s.label}
              count={s.count}
              countStyle={s.countStyle}
              active={at(s.f)}
              dropFolder={s.drop}
              onClick={() => ui.go(s.f)}
            />
          ))}
        </div>

        <div className="nav-group">
          {!rail && (
            <div className="nav-heading">
              <span>Folders</span>
              <button type="button" className="icon-btn icon-btn--xs on-navy" aria-label="New folder" title="New folder" onClick={() => setDialog({ kind: 'folder' })}>
                <LuPlus />
              </button>
            </div>
          )}
          {state.folders.map((f) => (
            <NavItem
              key={f.id}
              icon={<LuFolder />}
              label={f.name}
              count={counts.folders[f.id]}
              active={at(`folder:${f.id}`)}
              dropFolder={f.id}
              onClick={() => ui.go(`folder:${f.id}`)}
              trailing={
                !rail && (
                  <Menu
                    label={`${f.name} options`}
                    trigger={<LuEllipsis />}
                    buttonClass="icon-btn icon-btn--xs on-navy nav-item__more"
                    entries={[
                      { id: 'rename', label: 'Rename', onSelect: () => setDialog({ kind: 'rename', id: f.id, name: f.name }) },
                      {
                        id: 'delete',
                        label: 'Delete folder',
                        danger: true,
                        onSelect: async () => {
                          const ok = await confirmAction({
                            title: `Delete ${f.name}?`,
                            message: 'Messages in this folder move to Archive. Nothing is deleted.',
                            confirmLabel: 'Delete folder',
                            danger: true,
                          });
                          if (ok) {
                            if (ui.folder === `folder:${f.id}`) ui.go('inbox');
                            mail.deleteFolder(f.id);
                          }
                        },
                      },
                    ]}
                  />
                )
              }
            />
          ))}
        </div>

        {!rail && (
          <div className="nav-group">
            <div className="nav-heading">
              <span>Labels</span>
              <button type="button" className="icon-btn icon-btn--xs on-navy" aria-label="New label" title="New label" onClick={() => setDialog({ kind: 'label' })}>
                <LuPlus />
              </button>
            </div>
            {state.labels.map((l) => (
              <NavItem
                key={l.id}
                icon={<LuTag style={{ color: l.colour }} />}
                label={l.name}
                active={at(`label:${l.id}`)}
                onClick={() => ui.go(`label:${l.id}`)}
                trailing={
                  <Menu
                    label={`${l.name} options`}
                    trigger={<LuEllipsis />}
                    buttonClass="icon-btn icon-btn--xs on-navy nav-item__more"
                    entries={[
                      {
                        id: 'delete',
                        label: 'Delete label',
                        danger: true,
                        onSelect: async () => {
                          const ok = await confirmAction({
                            title: `Delete the ${l.name} label?`,
                            message: 'The label is removed from every message. The messages stay where they are.',
                            confirmLabel: 'Delete label',
                            danger: true,
                          });
                          if (ok) {
                            if (ui.folder === `label:${l.id}`) ui.go('inbox');
                            mail.deleteLabel(l.id);
                          }
                        },
                      },
                    ]}
                  />
                }
              />
            ))}
          </div>
        )}

        <div className="nav-group">
          {!rail && (
            <div className="nav-heading">
              <span>Accounts</span>
              {anySyncing && <Spinner size={12} />}
            </div>
          )}
          {state.accounts.map((a) => (
            <NavItem
              key={a.id}
              accent={a.colour}
              icon={<span className="acct-chip" />}
              label={a.label}
              sublabel={rail ? undefined : a.providerEmail}
              count={counts.accounts[a.id]}
              active={isMail && ui.scope === a.id && ui.folder === 'inbox' && !ui.query}
              onClick={() => ui.go('inbox', a.id)}
              trailing={a.syncStatus === 'error' && !rail ? <LuCircleAlert className="nav-item__alert" aria-label="Sync error" /> : undefined}
            />
          ))}
        </div>
      </div>

      <div className="sidebar__foot">
        <NavItem icon={<LuUsers />} label="Connected accounts" active={ui.screen === 'accounts'} onClick={() => ui.setScreen('accounts')} />
        <NavItem icon={<LuSettings />} label="Settings" active={ui.screen === 'settings'} onClick={() => ui.setScreen('settings')} />
        <button
          type="button"
          className="icon-btn on-navy theme-toggle"
          aria-label={ui.resolvedTheme === 'dark' ? 'Use light theme' : 'Use dark theme'}
          title={ui.resolvedTheme === 'dark' ? 'Use light theme' : 'Use dark theme'}
          onClick={() => ui.setPrefs({ theme: ui.resolvedTheme === 'dark' ? 'light' : 'dark' })}
        >
          {ui.resolvedTheme === 'dark' ? <LuSun /> : <LuMoon />}
        </button>
      </div>

      {dialog?.kind === 'folder' && (
        <PromptDialog
          title="New folder"
          label="Folder name"
          placeholder="e.g. Clients"
          confirmLabel="Create folder"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const f = await mail.createFolder(name);
            if (f) ui.go(`folder:${f.id}`);
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <PromptDialog
          title="Rename folder"
          label="Folder name"
          initial={dialog.name}
          confirmLabel="Rename"
          onClose={() => setDialog(null)}
          onSubmit={(name) => mail.renameFolder(dialog.id, name)}
        />
      )}
      {dialog?.kind === 'label' && <LabelDialog onClose={() => setDialog(null)} />}
    </nav>
  );
}
