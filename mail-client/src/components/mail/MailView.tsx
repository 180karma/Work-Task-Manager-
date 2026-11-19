import { useCallback, useMemo, useRef } from 'react';
import { LuSquarePen } from 'react-icons/lu';
import { useCommands } from '../../hooks/useCommands';
import { useHotkeys } from '../../hooks/useHotkeys';
import type { LayoutMode } from '../../hooks/useMediaQuery';
import { parseQuery } from '../../lib/search';
import { useMailState } from '../../state/MailStore';
import { buildItems, SYSTEM_VIEW_NAMES, threadKey, type ListItem } from '../../state/selectors';
import { useUI } from '../../state/UIStore';
import { MessageList } from './MessageList';
import { ReadingPane } from './ReadingPane';

export function MailView({ layout, onShowShortcuts }: { layout: LayoutMode; onShowShortcuts: () => void }) {
  const state = useMailState();
  const ui = useUI();
  const cmd = useCommands();
  const searchRef = useRef<HTMLInputElement>(null);

  const myAddresses = useMemo(() => new Set(state.accounts.map((a) => a.providerEmail.toLowerCase())), [state.accounts]);
  const parsed = useMemo(() => (ui.query.trim() ? parseQuery(ui.query) : null), [ui.query]);

  const items = useMemo(
    () =>
      buildItems(state.emails, {
        view: ui.folder,
        scope: ui.scope,
        filter: ui.filter,
        query: parsed,
        conversations: ui.prefs.conversations,
        myAddresses,
        matchCtx: {
          labelName: (id) => state.labels.find((l) => l.id === id)?.name ?? '',
          accountText: (id) => {
            const a = state.accounts.find((x) => x.id === id);
            return a ? `${a.label} ${a.providerEmail} ${a.provider}` : '';
          },
          folderName: (id) => SYSTEM_VIEW_NAMES[id] ?? state.folders.find((f) => f.id === id)?.name ?? id,
        },
      }),
    [state.emails, state.labels, state.accounts, state.folders, ui.folder, ui.scope, ui.filter, parsed, ui.prefs.conversations, myAddresses],
  );

  // The open conversation stays open even if it stops matching the view (e.g. read while filtering by Unread).
  const selected = useMemo<ListItem | null>(() => {
    if (!ui.selectedKey) return null;
    const found = items.find((i) => i.key === ui.selectedKey);
    if (found) return found;
    const members = state.emails
      .filter((e) => (ui.prefs.conversations ? threadKey(e) : e.id) === ui.selectedKey)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    if (!members.length) return null;
    return {
      key: ui.selectedKey,
      latest: members[0],
      ids: members.map((e) => e.id),
      count: members.length,
      unread: members.some((e) => !e.isRead),
      starred: members.some((e) => e.isStarred),
      important: members.some((e) => e.isImportant),
      hasAttachments: members.some((e) => e.hasAttachments),
      hasDraft: members.some((e) => e.folderId === 'drafts'),
      participants: [members[0].from.name],
    };
  }, [items, ui.selectedKey, state.emails, ui.prefs.conversations]);
  const index = selected ? items.findIndex((i) => i.key === selected.key) : -1;

  const open = useCallback(
    (item: ListItem) => {
      if (ui.folder === 'drafts' && item.latest.folderId === 'drafts') {
        ui.openCompose('draft', item.latest);
        return;
      }
      ui.select(item.key);
      if (item.unread && ui.prefs.markReadOnOpen) cmd.setRead(item.ids, true);
    },
    [ui, cmd],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!items.length) return;
      const next = index === -1 ? (dir === 1 ? 0 : items.length - 1) : index + dir;
      if (next >= 0 && next < items.length) open(items[next]);
    },
    [items, index, open],
  );

  const title =
    ui.folder === 'inbox' && ui.scope === 'all'
      ? 'All inboxes'
      : (SYSTEM_VIEW_NAMES[ui.folder] ??
        (ui.folder.startsWith('folder:') ? state.folders.find((f) => `folder:${f.id}` === ui.folder)?.name : state.labels.find((l) => `label:${l.id}` === ui.folder)?.name) ??
        'Mail');

  const target = selected?.ids ?? [];
  const replySource = selected?.latest;
  useHotkeys({
    j: () => step(1),
    k: () => step(-1),
    ArrowDown: () => step(1),
    ArrowUp: () => step(-1),
    c: () => ui.openCompose('new'),
    '/': () => searchRef.current?.focus(),
    e: () => target.length && cmd.archive(target),
    '#': () => target.length && void cmd.trash(target),
    Delete: () => target.length && void cmd.trash(target),
    s: () => target.length && cmd.toggleStar(target),
    u: () => {
      if (!target.length) return;
      cmd.setRead(target, false);
      ui.select(null);
    },
    r: () => replySource && ui.openCompose('reply', replySource),
    a: () => replySource && ui.openCompose('replyAll', replySource),
    f: () => replySource && ui.openCompose('forward', replySource),
    Escape: () => {
      if (ui.checked.size) ui.setChecked(new Set());
      else ui.select(null);
    },
    '?': onShowShortcuts,
  });

  const reading = <ReadingPane item={selected} layout={layout} onBack={() => ui.select(null)} onStep={step} canStep={{ prev: index > 0, next: index !== -1 && index < items.length - 1 }} />;

  if (layout === 'narrow') {
    return (
      <div className="mail-view is-narrow">
        {selected ? (
          reading
        ) : (
          <>
            <MessageList items={items} layout={layout} title={title} searchRef={searchRef} onOpen={open} />
            <button type="button" className="fab" aria-label="New message" onClick={() => ui.openCompose('new')}>
              <LuSquarePen />
              <span>New</span>
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mail-view">
      <MessageList items={items} layout={layout} title={title} searchRef={searchRef} onOpen={open} />
      {reading}
    </div>
  );
}
