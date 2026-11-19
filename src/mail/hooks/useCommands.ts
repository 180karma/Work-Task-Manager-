import { useMemo } from 'react';
import { confirmAction } from '../state/confirm';
import { useMailActions, useMailState } from '../state/MailStore';

/**
 * Context-aware message actions shared by the list, reading pane, menus and shortcuts.
 * They decide e.g. whether Archive means "archive" or "move back to Inbox", and whether
 * Delete means "move to Trash" or "delete forever".
 */
export function useCommands() {
  const { emails } = useMailState();
  const mail = useMailActions();

  return useMemo(() => {
    const pick = (ids: string[]) => {
      const set = new Set(ids);
      return emails.filter((e) => set.has(e.id));
    };
    const allIn = (ids: string[], folder: string) => {
      const list = pick(ids);
      return list.length > 0 && list.every((e) => e.folderId === folder);
    };

    const isArchived = (ids: string[]) => allIn(ids, 'archive');
    const isTrashed = (ids: string[]) => allIn(ids, 'trash');
    const isSpam = (ids: string[]) => allIn(ids, 'spam');
    const hasLabel = (ids: string[], labelId: string) => {
      const list = pick(ids);
      return list.length > 0 && list.every((e) => e.labelIds.includes(labelId));
    };

    return {
      isArchived,
      isTrashed,
      isSpam,
      hasLabel,
      setRead: (ids: string[], read: boolean) => void mail.update(ids, { isRead: read }),
      toggleStar: (ids: string[]) => {
        const on = !pick(ids).some((e) => e.isStarred);
        void mail.update(ids, { isStarred: on });
      },
      toggleImportant: (ids: string[]) => {
        const on = !pick(ids).some((e) => e.isImportant);
        void mail.update(ids, { isImportant: on });
      },
      archive: (ids: string[]) => void mail.moveMessages(ids, isArchived(ids) ? 'inbox' : 'archive'),
      move: (ids: string[], folderId: string) => void mail.moveMessages(ids, folderId),
      /** Moves to Trash, or deletes forever (after confirming) when already in Trash. */
      trash: async (ids: string[]) => {
        if (!ids.length) return;
        if (!isTrashed(ids)) {
          await mail.moveMessages(ids, 'trash');
          return;
        }
        const ok = await confirmAction({
          title: ids.length > 1 ? `Delete ${ids.length} messages forever?` : 'Delete forever?',
          message: "This can't be undone.",
          confirmLabel: 'Delete forever',
          danger: true,
        });
        if (ok) await mail.deleteForever(ids);
      },
      /** Restores trashed messages to the folder they came from. */
      restore: (ids: string[]) => {
        const byFolder = new Map<string, string[]>();
        for (const e of pick(ids)) {
          const to = e.previousFolderId && e.previousFolderId !== 'trash' ? e.previousFolderId : 'inbox';
          byFolder.set(to, [...(byFolder.get(to) ?? []), e.id]);
        }
        for (const [folder, list] of byFolder) void mail.moveMessages(list, folder);
      },
      spam: (ids: string[]) => void mail.moveMessages(ids, isSpam(ids) ? 'inbox' : 'spam', isSpam(ids) ? 'Inbox' : 'Spam'),
      toggleLabel: (ids: string[], labelId: string) => void mail.setLabel(ids, labelId, !hasLabel(ids, labelId)),
    };
  }, [emails, mail]);
}
