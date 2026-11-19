import { useMemo, useRef, type RefObject } from 'react';
import { LuArchive, LuChevronDown, LuEllipsis, LuLayers, LuMail, LuMailOpen, LuMenu, LuRefreshCw, LuSearch, LuSquarePen, LuTrash2, LuX } from 'react-icons/lu';
import { useCommands } from '../../hooks/useCommands';
import type { LayoutMode } from '../../hooks/useMediaQuery';
import { dateGroup } from '../../lib/format';
import { useMailActions, useMailState } from '../../state/MailStore';
import { SYSTEM_VIEW_NAMES, type ListItem, type QuickFilter } from '../../state/selectors';
import { useUI } from '../../state/UIStore';
import { Menu } from '../ui/Menu';
import { Spinner } from '../ui/primitives';
import { moreEntries } from './actionMenus';
import { MessageRow, type RowHandlers } from './MessageRow';
import { SearchBar } from './SearchBar';

const FILTERS: { id: QuickFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'attachments', label: 'Attachments' },
];

const EMPTY: Record<string, { title: string; body: string }> = {
  inbox: { title: 'Inbox zero', body: 'Nothing new here. New mail from your connected accounts lands in this list.' },
  starred: { title: 'No starred mail', body: 'Star a message to keep it here for quick access.' },
  important: { title: 'Nothing marked important', body: 'Flag a message as important and it appears here.' },
  drafts: { title: 'No drafts', body: 'Drafts save automatically while you write.' },
  sent: { title: 'Nothing sent yet', body: 'Messages you send from any account appear here.' },
  archive: { title: 'Archive is empty', body: 'Archive messages to clear your inbox without deleting them.' },
  spam: { title: 'No spam', body: 'Messages your providers flag as spam appear here.' },
  trash: { title: 'Trash is empty', body: 'Deleted messages stay here until you delete them forever.' },
};

interface Props {
  items: ListItem[];
  layout: LayoutMode;
  title: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onOpen: (item: ListItem) => void;
}

export function MessageList({ items, layout, title, searchRef, onOpen }: Props) {
  const state = useMailState();
  const mail = useMailActions();
  const ui = useUI();
  const cmd = useCommands();
  const lastChecked = useRef<string | null>(null);

  const accountById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);
  const scopeAccount = accountById.get(ui.scope);
  const searching = ui.query.trim().length > 0;
  const showAccount = ui.scope === 'all' && state.accounts.length > 1;
  const checkedItems = items.filter((i) => ui.checked.has(i.key));
  const checkedIds = checkedItems.flatMap((i) => i.ids);
  const selecting = ui.checked.size > 0;
  const currentFolder = ui.folder.startsWith('folder:') ? ui.folder.slice(7) : ui.folder;

  const handlers = useMemo<RowHandlers>(
    () => ({
      open: onOpen,
      check(item, shift) {
        const next = new Set(ui.checked);
        if (shift && lastChecked.current) {
          const a = items.findIndex((i) => i.key === lastChecked.current);
          const b = items.findIndex((i) => i.key === item.key);
          if (a !== -1 && b !== -1) {
            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(items[i].key);
            ui.setChecked(next);
            return;
          }
        }
        if (next.has(item.key)) next.delete(item.key);
        else next.add(item.key);
        lastChecked.current = item.key;
        ui.setChecked(next);
      },
      star: (item) => cmd.toggleStar(item.ids),
      important: (item) => cmd.toggleImportant(item.ids),
      archive: (item) => cmd.archive(item.ids),
      trash: (item) => void cmd.trash(item.ids),
      toggleRead: (item) => cmd.setRead(item.ids, item.unread),
      dragIds: (item) => (ui.checked.has(item.key) ? items.filter((i) => ui.checked.has(i.key)).flatMap((i) => i.ids) : item.ids),
    }),
    [items, ui, cmd, onOpen],
  );

  // Group rows by date for scanning.
  const groups = useMemo(() => {
    const now = new Date();
    const out: { name: string; items: ListItem[] }[] = [];
    for (const item of items) {
      const g = dateGroup(item.latest.receivedAt, now);
      const last = out[out.length - 1];
      if (last && last.name === g) last.items.push(item);
      else out.push({ name: g, items: [item] });
    }
    return out;
  }, [items]);

  const folderLabel = (id: string) => SYSTEM_VIEW_NAMES[id] ?? state.folders.find((f) => f.id === id)?.name ?? 'Folder';
  const syncing = ui.scope === 'all' ? state.syncing.size > 0 : state.syncing.has(ui.scope);
  const unreadInView = items.filter((i) => i.unread).length;
  const allChecked = items.length > 0 && checkedItems.length === items.length;
  const empty = EMPTY[ui.folder] ?? { title: 'Nothing here yet', body: 'Drag messages onto this folder in the sidebar, or use Move to.' };

  return (
    <section className="list-pane" aria-label="Message list">
      <header className="list-head">
        <div className="list-head__title">
          {layout === 'narrow' && (
            <button type="button" className="icon-btn" aria-label="Open navigation" onClick={() => ui.setDrawer(true)}>
              <LuMenu />
            </button>
          )}
          <div className="list-head__text">
            <h1>{searching ? 'Search results' : title}</h1>
            <span className="list-head__sub">
              <span>{searching ? `${items.length} ${items.length === 1 ? 'conversation' : 'conversations'}` : scopeAccount ? scopeAccount.providerEmail : state.accounts.length > 1 ? `${state.accounts.length} accounts` : ''}</span>
              {!searching && unreadInView > 0 && <span className="list-head__unread">{unreadInView} unread</span>}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Sync now"
            title="Sync now"
            onClick={() => (ui.scope === 'all' ? mail.syncAll() : mail.syncAccount(ui.scope))}
            disabled={syncing}
          >
            {syncing ? <Spinner /> : <LuRefreshCw />}
          </button>
        </div>
        <SearchBar ref={searchRef} placeholder={scopeAccount ? `Search ${scopeAccount.label}` : 'Search all mail'} />

        {selecting ? (
          <div className="bulk-bar" role="toolbar" aria-label="Selected messages">
            <label className="bulk-bar__all">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = !allChecked && selecting;
                }}
                onChange={() => ui.setChecked(allChecked ? new Set() : new Set(items.map((i) => i.key)))}
                aria-label={allChecked ? 'Clear selection' : 'Select all'}
              />
              <span>{checkedItems.length} selected</span>
            </label>
            <div className="bulk-bar__actions">
              <button type="button" className="icon-btn" aria-label={cmd.isArchived(checkedIds) ? 'Move to Inbox' : 'Archive'} title="Archive" onClick={() => { cmd.archive(checkedIds); ui.setChecked(new Set()); }}>
                <LuArchive />
              </button>
              <button type="button" className="icon-btn" aria-label="Delete" title="Delete" onClick={async () => { await cmd.trash(checkedIds); ui.setChecked(new Set()); }}>
                <LuTrash2 />
              </button>
              <button type="button" className="icon-btn" aria-label="Mark as read" title="Mark as read" onClick={() => cmd.setRead(checkedIds, true)}>
                <LuMailOpen />
              </button>
              <button type="button" className="icon-btn" aria-label="Mark as unread" title="Mark as unread" onClick={() => cmd.setRead(checkedIds, false)}>
                <LuMail />
              </button>
              <Menu
                label="More actions"
                trigger={<LuEllipsis />}
                entries={() =>
                  moreEntries(checkedIds, cmd, {
                    folders: state.folders,
                    labels: state.labels,
                    unread: checkedItems.some((i) => i.unread),
                    starred: checkedItems.some((i) => i.starred),
                    important: checkedItems.some((i) => i.important),
                    currentFolder,
                  })
                }
              />
              <button type="button" className="icon-btn" aria-label="Clear selection" title="Clear selection" onClick={() => ui.setChecked(new Set())}>
                <LuX />
              </button>
            </div>
          </div>
        ) : (
          <div className="filters" role="toolbar" aria-label="Filter messages">
            <div className="filters__chips">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className={`filter-chip${ui.filter === f.id ? ' is-on' : ''}`} aria-pressed={ui.filter === f.id} onClick={() => ui.setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {state.accounts.length > 1 && (
              <Menu
                label="Filter by account"
                buttonClass="filter-chip filter-chip--menu"
                trigger={
                  <>
                    {scopeAccount ? <span className="acct-dot" style={{ background: scopeAccount.colour }} /> : <LuLayers className="filter-chip__icon" />}
                    <span className="filter-chip__label">{scopeAccount ? scopeAccount.label : 'All accounts'}</span>
                    <LuChevronDown />
                  </>
                }
                entries={[
                  { id: 'all', label: 'All accounts', checked: ui.scope === 'all', onSelect: () => ui.setScope('all') },
                  { id: 'd', divider: true },
                  ...state.accounts.map((a) => ({
                    id: a.id,
                    label: `${a.label} (${a.providerEmail})`,
                    swatch: a.colour,
                    checked: ui.scope === a.id,
                    onSelect: () => ui.setScope(a.id),
                  })),
                ]}
              />
            )}
          </div>
        )}
      </header>

      {state.status === 'loading' ? (
        <div className="list-loading" aria-busy="true">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="skeleton-row">
              <span className="sk sk--avatar" />
              <span className="sk-lines">
                <span className="sk" style={{ width: '42%' }} />
                <span className="sk" style={{ width: '78%' }} />
                <span className="sk" style={{ width: '64%' }} />
              </span>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          {searching ? <LuSearch className="empty__icon" /> : <LuMail className="empty__icon" />}
          <h2>{searching ? 'No matches' : ui.filter !== 'all' ? `No ${FILTERS.find((f) => f.id === ui.filter)?.label.toLowerCase()} messages` : empty.title}</h2>
          <p>
            {searching
              ? 'Try fewer words, check the spelling, or search with operators like from: or has:attachment.'
              : ui.filter !== 'all'
                ? 'Switch the filter back to All to see everything in this folder.'
                : empty.body}
          </p>
          {(searching || ui.filter !== 'all') && (
            <button type="button" className="btn" onClick={() => (searching ? ui.setQuery('') : ui.setFilter('all'))}>
              {searching ? 'Clear search' : 'Show all'}
            </button>
          )}
          {ui.folder === 'inbox' && !searching && ui.filter === 'all' && (
            <button type="button" className="btn btn--primary" onClick={() => ui.openCompose('new')}>
              <LuSquarePen /> New message
            </button>
          )}
        </div>
      ) : (
        <div className="list-scroll">
          {groups.map((g) => (
            <section key={g.name} aria-label={g.name}>
              <h3 className="list-group">{g.name}</h3>
              <ul className="rows">
                {g.items.map((item) => (
                  <MessageRow
                    key={item.key}
                    item={item}
                    account={accountById.get(item.latest.accountId)}
                    labels={state.labels}
                    selected={ui.selectedKey === item.key}
                    checked={ui.checked.has(item.key)}
                    selecting={selecting}
                    showAccount={showAccount}
                    folderTag={searching ? folderLabel(item.latest.folderId) : null}
                    draggable={layout !== 'narrow'}
                    swipeable={layout === 'narrow'}
                    previewLines={ui.prefs.previewLines}
                    h={handlers}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
