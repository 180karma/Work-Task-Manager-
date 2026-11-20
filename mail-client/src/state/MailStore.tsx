import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mailService, type MailService } from '../services/mail';
import type { MailAccess } from '../services/mail/MailService';
import type { RedirectResult } from '../services/mail/oauth';
import type { Contact, DraftInput, Email, EmailAccount, EmailPatch, Folder, Label, Provider } from '../types/mail';
import { SYSTEM_VIEW_NAMES } from './selectors';
import { toast } from './toast';

export interface MailState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  accounts: EmailAccount[];
  emails: Email[];
  folders: Folder[];
  labels: Label[];
  contacts: Contact[];
  /** Account ids currently syncing. */
  syncing: Set<string>;
  access: MailAccess;
}

const INITIAL: MailState = {
  status: 'loading',
  error: null,
  accounts: [],
  emails: [],
  folders: [],
  labels: [],
  contacts: [],
  syncing: new Set(),
  access: { mode: 'demo', message: '', canConfigure: false, googleClientId: '', microsoftClientId: '' },
};

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

function useMailController(service: MailService) {
  const [state, setState] = useState<MailState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, status: s.status === 'ready' ? 'ready' : 'loading', error: null }));
    try {
      const snap = await service.load();
      setState((s) => ({ ...s, ...snap, access: service.access(), status: 'ready', error: null }));
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', error: message(err) }));
    }
  }, [service]);

  /** Optimistic update: apply locally, call the service, reload the truth on failure. */
  const optimistic = useCallback(
    async (apply: (s: MailState) => MailState, call: () => Promise<unknown>, failure: string): Promise<boolean> => {
      setState(apply);
      try {
        await call();
        return true;
      } catch (err) {
        toast(`${failure} ${message(err)}`, { tone: 'error' });
        void reload();
        return false;
      }
    },
    [reload],
  );

  const patchEmails = (ids: string[], fn: (e: Email) => Email) => (s: MailState) => {
    const set = new Set(ids);
    return { ...s, emails: s.emails.map((e) => (set.has(e.id) ? fn(e) : e)) };
  };

  const update = useCallback(
    (ids: string[], patch: EmailPatch) => optimistic(patchEmails(ids, (e) => ({ ...e, ...patch })), () => service.updateEmails(ids, patch), "Couldn't update the message."),
    [optimistic, service],
  );

  const moveQuiet = useCallback(
    (ids: string[], folderId: string) =>
      optimistic(
        patchEmails(ids, (e) => (e.folderId === folderId ? e : { ...e, previousFolderId: e.folderId, folderId })),
        () => service.moveEmails(ids, folderId),
        "Couldn't move the message.",
      ),
    [optimistic, service],
  );

  /** Moves with an Undo toast that puts each message back where it was. */
  const moveMessages = useCallback(
    async (ids: string[], folderId: string, folderName?: string) => {
      const before = new Map(stateRef.current.emails.filter((e) => ids.includes(e.id) && e.folderId !== folderId).map((e) => [e.id, e.folderId]));
      if (!before.size) return;
      const ok = await moveQuiet([...before.keys()], folderId);
      if (!ok) return;
      const n = before.size;
      const name = folderName ?? SYSTEM_VIEW_NAMES[folderId] ?? stateRef.current.folders.find((f) => f.id === folderId)?.name ?? 'folder';
      const verb = folderId === 'trash' ? 'Moved to Trash' : folderId === 'archive' ? 'Archived' : folderId === 'spam' ? 'Reported as spam' : `Moved to ${name}`;
      toast(`${verb}${n > 1 ? ` (${n})` : ''}`, {
        action: {
          label: 'Undo',
          run: () => {
            const byFolder = new Map<string, string[]>();
            for (const [id, f] of before) byFolder.set(f, [...(byFolder.get(f) ?? []), id]);
            for (const [f, list] of byFolder) void moveQuiet(list, f);
          },
        },
      });
    },
    [moveQuiet],
  );

  const setLabel = useCallback(
    (ids: string[], labelId: string, on: boolean) =>
      optimistic(
        patchEmails(ids, (e) => ({ ...e, labelIds: on ? [...new Set([...e.labelIds, labelId])] : e.labelIds.filter((l) => l !== labelId) })),
        () => service.setLabel(ids, labelId, on),
        "Couldn't change the label.",
      ),
    [optimistic, service],
  );

  const deleteForever = useCallback(
    async (ids: string[]) => {
      const set = new Set(ids);
      const ok = await optimistic((s) => ({ ...s, emails: s.emails.filter((e) => !set.has(e.id)) }), () => service.deleteForever(ids), "Couldn't delete the message.");
      if (ok) toast(ids.length > 1 ? `${ids.length} messages deleted forever` : 'Deleted forever');
    },
    [optimistic, service],
  );

  const upsertEmail = (email: Email, removeId?: string) => (s: MailState) => ({
    ...s,
    emails: [...s.emails.filter((e) => e.id !== email.id && e.id !== removeId), email],
  });

  const saveDraft = useCallback(
    async (input: DraftInput): Promise<Email | null> => {
      try {
        const saved = await service.saveDraft(input);
        setState(upsertEmail(saved));
        return saved;
      } catch (err) {
        toast(`Draft not saved. ${message(err)}`, { tone: 'error' });
        return null;
      }
    },
    [service],
  );

  const discardDraft = useCallback(
    (id: string) => optimistic((s) => ({ ...s, emails: s.emails.filter((e) => e.id !== id) }), () => service.discardDraft(id), "Couldn't discard the draft."),
    [optimistic, service],
  );

  const send = useCallback(
    async (input: DraftInput): Promise<boolean> => {
      try {
        await service.send(input);
        // Sending may also deliver to one of the user's own inboxes, so refresh from the service.
        const snap = await service.load();
        setState((s) => ({ ...s, ...snap }));
        toast('Message sent');
        return true;
      } catch (err) {
        toast(`Not sent. ${message(err)}`, { tone: 'error' });
        return false;
      }
    },
    [service],
  );

  const syncAccount = useCallback(
    async (accountId: string) => {
      if (stateRef.current.syncing.has(accountId)) return;
      setState((s) => ({ ...s, syncing: new Set([...s.syncing, accountId]) }));
      try {
        const { account, delivered } = await service.syncAccount(accountId);
        setState((s) => ({
          ...s,
          accounts: s.accounts.map((a) => (a.id === account.id ? account : a)),
          emails: [...s.emails.filter((e) => !delivered.some((d) => d.id === e.id)), ...delivered],
        }));
        return delivered.length;
      } catch (err) {
        const label = stateRef.current.accounts.find((a) => a.id === accountId)?.label ?? 'Account';
        toast(`${label} didn't sync. ${message(err)}`, { tone: 'error' });
        return 0;
      } finally {
        setState((s) => {
          const syncing = new Set(s.syncing);
          syncing.delete(accountId);
          return { ...s, syncing };
        });
      }
    },
    [service],
  );

  const syncAll = useCallback(async () => {
    const ids = stateRef.current.accounts.filter((a) => a.syncStatus !== 'error').map((a) => a.id);
    const counts = await Promise.all(ids.map((id) => syncAccount(id)));
    const total = counts.reduce<number>((s, n) => s + (n ?? 0), 0);
    toast(total ? `${total} new ${total === 1 ? 'message' : 'messages'}` : 'Up to date');
  }, [syncAccount]);

  const connect = useCallback(
    async (provider: Provider) => {
      const popup = window.open('about:blank', 'relay-oauth', 'width=520,height=720');
      const onMessage = async (event: MessageEvent) => {
        if (event.origin !== location.origin || (popup && event.source !== popup)) return;
        const data = event.data as (RedirectResult & { type?: string }) | null;
        if (!data || data.type !== 'relay-oauth') return;
        window.removeEventListener('message', onMessage);
        try {
          const email = await service.finishConnect({ connected: data.connected, error: data.error });
          toast(`Signed in as ${email}`);
          void reload();
        } catch (err) {
          toast(message(err) || "Couldn't sign in.", { tone: 'error' });
        }
      };
      window.addEventListener('message', onMessage);
      try {
        const { url, message: msg } = await service.beginConnect(provider);
        if (!url) {
          popup?.close();
          window.removeEventListener('message', onMessage);
          toast(msg);
          return;
        }
        if (popup) popup.location.href = url;
        else window.open(url, '_blank');
      } catch (err) {
        popup?.close();
        window.removeEventListener('message', onMessage);
        toast(`Couldn't start sign-in. ${message(err)}`, { tone: 'error' });
      }
    },
    [service, reload],
  );

  const disconnect = useCallback(
    async (accountId: string) => {
      try {
        await service.disconnect(accountId);
        const snap = await service.load();
        setState((s) => ({ ...s, ...snap }));
        toast('Account disconnected');
      } catch (err) {
        toast(`Couldn't disconnect. ${message(err)}`, { tone: 'error' });
      }
    },
    [service],
  );

  const updateAccount = useCallback(
    async (accountId: string, patch: Parameters<MailService['updateAccount']>[1], done?: string) => {
      try {
        const accounts = await service.updateAccount(accountId, patch);
        setState((s) => ({ ...s, accounts }));
        if (done) toast(done);
      } catch (err) {
        toast(`Couldn't save. ${message(err)}`, { tone: 'error' });
      }
    },
    [service],
  );

  const createFolder = useCallback(
    async (name: string): Promise<Folder | null> => {
      try {
        const f = await service.createFolder(name);
        setState((s) => ({ ...s, folders: [...s.folders, f] }));
        return f;
      } catch (err) {
        toast(message(err), { tone: 'error' });
        return null;
      }
    },
    [service],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      try {
        const f = await service.renameFolder(id, name);
        setState((s) => ({ ...s, folders: s.folders.map((x) => (x.id === id ? f : x)) }));
        return true;
      } catch (err) {
        toast(message(err), { tone: 'error' });
        return false;
      }
    },
    [service],
  );

  const deleteFolder = useCallback(
    (id: string) =>
      optimistic(
        (s) => ({
          ...s,
          folders: s.folders.filter((f) => f.id !== id),
          emails: s.emails.map((e) => (e.folderId === id ? { ...e, folderId: 'archive', previousFolderId: null } : e)),
        }),
        () => service.deleteFolder(id),
        "Couldn't delete the folder.",
      ),
    [optimistic, service],
  );

  const createLabel = useCallback(
    async (name: string, colour: string): Promise<Label | null> => {
      try {
        const l = await service.createLabel(name, colour);
        setState((s) => ({ ...s, labels: [...s.labels, l] }));
        return l;
      } catch (err) {
        toast(message(err), { tone: 'error' });
        return null;
      }
    },
    [service],
  );

  const deleteLabel = useCallback(
    (id: string) =>
      optimistic(
        (s) => ({ ...s, labels: s.labels.filter((l) => l.id !== id), emails: s.emails.map((e) => (e.labelIds.includes(id) ? { ...e, labelIds: e.labelIds.filter((l) => l !== id) } : e)) }),
        () => service.deleteLabel(id),
        "Couldn't delete the label.",
      ),
    [optimistic, service],
  );

  const saveSignInApps = useCallback(
    async (google: string, microsoft: string) => {
      try {
        await service.saveSignInApps(google, microsoft);
        setState((s) => ({ ...s, access: service.access() }));
        toast('Sign-in saved for everyone with Mail.');
        return true;
      } catch (err) {
        toast(`Couldn't save. ${message(err)}`, { tone: 'error' });
        return false;
      }
    },
    [service],
  );

  const resetDemo = useCallback(async () => {
    if (!service.reset) return;
    const snap = await service.reset();
    setState((s) => ({ ...s, ...snap, status: 'ready' }));
    toast('Demo mailbox restored');
  }, [service]);

  const actions = useMemo(
    () => ({
      service,
      reload,
      update,
      moveMessages,
      moveQuiet,
      setLabel,
      deleteForever,
      saveDraft,
      discardDraft,
      send,
      syncAccount,
      syncAll,
      connect,
      disconnect,
      setDefaultAccount: (id: string) => updateAccount(id, { isDefault: true }, 'Default account updated'),
      updateSignature: (id: string, signature: string) => updateAccount(id, { signature }, 'Signature saved'),
      createFolder,
      renameFolder,
      deleteFolder,
      createLabel,
      deleteLabel,
      saveSignInApps,
      resetDemo,
    }),
    [service, reload, update, moveMessages, moveQuiet, setLabel, deleteForever, saveDraft, discardDraft, send, syncAccount, syncAll, connect, disconnect, updateAccount, createFolder, renameFolder, deleteFolder, createLabel, deleteLabel, saveSignInApps, resetDemo],
  );

  return { state, actions };
}

export type MailActions = ReturnType<typeof useMailController>['actions'];

const StateCtx = createContext<MailState | null>(null);
const ActionsCtx = createContext<MailActions | null>(null);

export function MailProvider({ children, service = mailService }: { children: ReactNode; service?: MailService }) {
  const { state, actions } = useMailController(service);
  useEffect(() => {
    void actions.reload();
  }, [actions]);
  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useMailState(): MailState {
  const v = useContext(StateCtx);
  if (!v) throw new Error('useMailState must be used inside <MailProvider>');
  return v;
}

export function useMailActions(): MailActions {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error('useMailActions must be used inside <MailProvider>');
  return v;
}
