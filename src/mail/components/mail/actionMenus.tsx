import { LuArchive, LuFlag, LuFolderInput, LuInbox, LuMail, LuMailOpen, LuShieldAlert, LuStar, LuTrash2, LuUndo2 } from 'react-icons/lu';
import type { useCommands } from '../../hooks/useCommands';
import type { Folder, Label } from '../../types/mail';
import type { MenuEntry } from '../ui/Menu';

type Commands = ReturnType<typeof useCommands>;

export function moveEntries(ids: string[], cmd: Commands, folders: Folder[], currentFolder?: string): MenuEntry[] {
  const targets: { id: string; name: string }[] = [
    { id: 'inbox', name: 'Inbox' },
    { id: 'archive', name: 'Archive' },
    ...folders.map((f) => ({ id: f.id, name: f.name })),
  ];
  return [
    { heading: 'Move to', id: 'h-move' },
    ...targets
      .filter((t) => t.id !== currentFolder)
      .map((t) => ({
        id: `mv-${t.id}`,
        label: t.name,
        icon: t.id === 'inbox' ? <LuInbox /> : t.id === 'archive' ? <LuArchive /> : <LuFolderInput />,
        onSelect: () => cmd.move(ids, t.id),
      })),
  ];
}

export function labelEntries(ids: string[], cmd: Commands, labels: Label[]): MenuEntry[] {
  if (!labels.length) return [];
  return [
    { heading: 'Labels', id: 'h-labels' },
    ...labels.map((l) => ({
      id: `lb-${l.id}`,
      label: l.name,
      swatch: l.colour,
      checked: cmd.hasLabel(ids, l.id),
      keepOpen: true,
      onSelect: () => cmd.toggleLabel(ids, l.id),
    })),
  ];
}

/** The "More actions" menu for one conversation or a bulk selection. */
export function moreEntries(
  ids: string[],
  cmd: Commands,
  ctx: { folders: Folder[]; labels: Label[]; unread: boolean; starred: boolean; important: boolean; currentFolder?: string },
): MenuEntry[] {
  const trashed = cmd.isTrashed(ids);
  const spam = cmd.isSpam(ids);
  return [
    {
      id: 'read',
      label: ctx.unread ? 'Mark as read' : 'Mark as unread',
      icon: ctx.unread ? <LuMailOpen /> : <LuMail />,
      onSelect: () => cmd.setRead(ids, ctx.unread),
    },
    { id: 'star', label: ctx.starred ? 'Remove star' : 'Star', icon: <LuStar />, onSelect: () => cmd.toggleStar(ids) },
    {
      id: 'imp',
      label: ctx.important ? 'Mark as not important' : 'Mark as important',
      icon: <LuFlag />,
      onSelect: () => cmd.toggleImportant(ids),
    },
    ...(trashed ? [{ id: 'restore', label: 'Restore', icon: <LuUndo2 />, onSelect: () => cmd.restore(ids) }] : []),
    { id: 'spam', label: spam ? 'Not spam' : 'Report spam', icon: <LuShieldAlert />, onSelect: () => cmd.spam(ids) },
    { id: 'd1', divider: true },
    ...moveEntries(ids, cmd, ctx.folders, ctx.currentFolder),
    ...(ctx.labels.length ? [{ id: 'd2', divider: true } as MenuEntry] : []),
    ...labelEntries(ids, cmd, ctx.labels),
    { id: 'd3', divider: true },
    {
      id: 'del',
      label: trashed ? 'Delete forever' : 'Delete',
      icon: <LuTrash2 />,
      danger: true,
      onSelect: () => void cmd.trash(ids),
    },
  ];
}
