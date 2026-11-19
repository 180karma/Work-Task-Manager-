import { useEffect, useMemo, useState } from 'react';
import {
  LuArchive,
  LuArrowLeft,
  LuChevronDown,
  LuChevronUp,
  LuEllipsis,
  LuFolderInput,
  LuForward,
  LuInbox,
  LuMail,
  LuReply,
  LuReplyAll,
  LuShieldAlert,
  LuTag,
  LuTrash2,
  LuUndo2,
} from 'react-icons/lu';
import { useCommands } from '../../hooks/useCommands';
import type { LayoutMode } from '../../hooks/useMediaQuery';
import { formatFullDate, formatListDate } from '../../lib/format';
import { useMailState } from '../../state/MailStore';
import { conversationOf, type ListItem } from '../../state/selectors';
import { useUI } from '../../state/UIStore';
import type { Email, EmailAccount, Mailbox } from '../../types/mail';
import { Menu } from '../ui/Menu';
import { Avatar } from '../ui/primitives';
import { labelEntries, moreEntries, moveEntries } from './actionMenus';
import { AttachmentList } from './Attachments';
import { EmailBody } from './EmailBody';

interface Props {
  item: ListItem | null;
  layout: LayoutMode;
  onBack: () => void;
  onStep: (dir: 1 | -1) => void;
  canStep: { prev: boolean; next: boolean };
}

const people = (list: Mailbox[]) => list.map((m) => (m.name && m.name !== m.email ? `${m.name} <${m.email}>` : m.email)).join(', ');

export function ReadingPane({ item, layout, onBack, onStep, canStep }: Props) {
  const state = useMailState();
  const ui = useUI();
  const cmd = useCommands();

  const messages = useMemo(() => (item ? conversationOf(state.emails, item, ui.prefs.conversations) : []), [item, state.emails, ui.prefs.conversations]);
  const accountById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);

  // Older messages start collapsed; the latest and any unread ones open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!messages.length) return;
    setExpanded(new Set(messages.filter((m, i) => i === messages.length - 1 || !m.isRead).map((m) => m.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key]);

  if (!item || !messages.length) {
    if (layout === 'narrow') return null;
    return (
      <section className="reading-pane is-empty" aria-label="Reading pane">
        <div className="empty">
          <LuMail className="empty__icon" />
          <h2>Select a conversation</h2>
          <p>Choose a message from the list to read it here. Press ? to see keyboard shortcuts.</p>
        </div>
      </section>
    );
  }

  const ids = item.ids;
  const trashed = cmd.isTrashed(ids);
  const spam = cmd.isSpam(ids);
  const archived = cmd.isArchived(ids);
  const currentFolder = item.latest.folderId;
  const subject = item.latest.subject || '(no subject)';
  const labelIds = [...new Set(messages.flatMap((m) => m.labelIds))];
  const last = messages[messages.length - 1];
  const account = accountById.get(item.latest.accountId);

  return (
    <section className="reading-pane" aria-label="Reading pane">
      <header className="reading-toolbar" role="toolbar" aria-label="Conversation actions">
        {layout === 'narrow' && (
          <button type="button" className="icon-btn" aria-label="Back to list" onClick={onBack}>
            <LuArrowLeft />
          </button>
        )}
        {trashed ? (
          <button type="button" className="btn btn--sm" onClick={() => cmd.restore(ids)}>
            <LuUndo2 /> Restore
          </button>
        ) : spam ? (
          <button type="button" className="btn btn--sm" onClick={() => cmd.spam(ids)}>
            <LuInbox /> Not spam
          </button>
        ) : (
          <button type="button" className="icon-btn" aria-label={archived ? 'Move to Inbox' : 'Archive'} title={archived ? 'Move to Inbox' : 'Archive (e)'} onClick={() => cmd.archive(ids)}>
            {archived ? <LuInbox /> : <LuArchive />}
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={trashed ? 'Delete forever' : 'Delete'} title={trashed ? 'Delete forever' : 'Delete (#)'} onClick={() => void cmd.trash(ids)}>
          <LuTrash2 />
        </button>
        {!spam && !trashed && (
          <button type="button" className="icon-btn" aria-label="Report spam" title="Report spam" onClick={() => cmd.spam(ids)}>
            <LuShieldAlert />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Mark as unread"
          title="Mark as unread (u)"
          onClick={() => {
            cmd.setRead(ids, false);
            ui.select(null);
          }}
        >
          <LuMail />
        </button>
        <Menu label="Move to" trigger={<LuFolderInput />} entries={() => moveEntries(ids, cmd, state.folders, currentFolder)} />
        {state.labels.length > 0 && <Menu label="Labels" trigger={<LuTag />} entries={() => labelEntries(ids, cmd, state.labels)} />}
        <Menu
          label="More actions"
          trigger={<LuEllipsis />}
          entries={() =>
            moreEntries(ids, cmd, { folders: state.folders, labels: state.labels, unread: item.unread, starred: item.starred, important: item.important, currentFolder })
          }
        />
        <span className="reading-toolbar__spacer" />
        <button type="button" className="icon-btn" aria-label="Newer conversation" title="Newer (k)" disabled={!canStep.prev} onClick={() => onStep(-1)}>
          <LuChevronUp />
        </button>
        <button type="button" className="icon-btn" aria-label="Older conversation" title="Older (j)" disabled={!canStep.next} onClick={() => onStep(1)}>
          <LuChevronDown />
        </button>
      </header>

      <div className="reading-scroll">
        <div className="reading-head">
          <h1 className="reading-subject">{subject}</h1>
          <div className="reading-tags">
            {account && (
              <span className="chip chip--acct" style={{ ['--chip' as string]: account.colour }}>
                {account.label}
              </span>
            )}
            {labelIds.map((id) => {
              const l = state.labels.find((x) => x.id === id);
              return l ? (
                <span key={id} className="chip" style={{ ['--chip' as string]: l.colour }}>
                  {l.name}
                </span>
              ) : null;
            })}
          </div>
        </div>

        {trashed && <p className="notice notice--info">This conversation is in Trash. Restore it, or delete it forever.</p>}
        {spam && <p className="notice notice--danger">This message was marked as spam. Links and images may be unsafe.</p>}

        <ol className="conversation">
          {messages.map((m) => (
            <MessageCard
              key={m.id}
              email={m}
              account={accountById.get(m.accountId)}
              open={expanded.has(m.id)}
              onToggle={() =>
                setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(m.id)) n.delete(m.id);
                  else n.add(m.id);
                  return n;
                })
              }
            />
          ))}
        </ol>

        {last.folderId !== 'drafts' && (
          <div className="reply-bar">
            <button type="button" className="btn" onClick={() => ui.openCompose('reply', last)}>
              <LuReply /> Reply
            </button>
            {last.to.length + last.cc.length > 1 && (
              <button type="button" className="btn" onClick={() => ui.openCompose('replyAll', last)}>
                <LuReplyAll /> Reply all
              </button>
            )}
            <button type="button" className="btn" onClick={() => ui.openCompose('forward', last)}>
              <LuForward /> Forward
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function MessageCard({ email: m, account, open, onToggle }: { email: Email; account: EmailAccount | undefined; open: boolean; onToggle: () => void }) {
  const ui = useUI();
  const [details, setDetails] = useState(false);
  const isDraft = m.folderId === 'drafts';

  return (
    <li className={`msg${open ? ' is-open' : ''}${m.isRead ? '' : ' is-unread'}`}>
      <div className="msg__head">
        <Avatar name={m.from.name} email={m.from.email} size={36} />
        <button type="button" className="msg__summary" onClick={onToggle} aria-expanded={open}>
          <span className="msg__from">
            {m.from.name || m.from.email}
            {open && m.from.name && <span className="msg__email"> &lt;{m.from.email}&gt;</span>}
            {isDraft && <span className="row__draft">Draft</span>}
          </span>
          {open ? <span className="msg__to">to {m.to.map((t) => t.name || t.email).join(', ') || '(no recipients)'}</span> : <span className="msg__snippet">{m.snippet}</span>}
        </button>
        <span className="msg__date" title={formatFullDate(m.receivedAt)}>
          {formatListDate(m.receivedAt)}
        </span>
        {open && !isDraft && (
          <Menu
            label="Message actions"
            trigger={<LuEllipsis />}
            buttonClass="icon-btn icon-btn--sm"
            entries={[
              { id: 'reply', label: 'Reply', icon: <LuReply />, onSelect: () => ui.openCompose('reply', m) },
              { id: 'replyAll', label: 'Reply all', icon: <LuReplyAll />, onSelect: () => ui.openCompose('replyAll', m) },
              { id: 'fwd', label: 'Forward', icon: <LuForward />, onSelect: () => ui.openCompose('forward', m) },
              { id: 'd', divider: true },
              { id: 'details', label: details ? 'Hide details' : 'Show details', onSelect: () => setDetails((d) => !d) },
            ]}
          />
        )}
      </div>
      {open && (
        <div className="msg__body">
          <button type="button" className="link-btn msg__details-toggle" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            {details ? 'Hide details' : 'Details'}
          </button>
          {details && (
            <dl className="msg__details">
              <dt>From</dt>
              <dd>{people([m.from])}</dd>
              <dt>To</dt>
              <dd>{people(m.to) || '—'}</dd>
              {m.cc.length > 0 && (
                <>
                  <dt>Cc</dt>
                  <dd>{people(m.cc)}</dd>
                </>
              )}
              {m.bcc.length > 0 && (
                <>
                  <dt>Bcc</dt>
                  <dd>{people(m.bcc)}</dd>
                </>
              )}
              <dt>Date</dt>
              <dd>{formatFullDate(m.receivedAt)}</dd>
              <dt>Account</dt>
              <dd>{account ? `${account.label} (${account.providerEmail})` : 'Unknown'}</dd>
            </dl>
          )}
          <EmailBody html={m.bodyHtml} text={m.bodyText} dark={ui.resolvedTheme === 'dark'} allowRemote={ui.prefs.remoteImages && m.folderId !== 'spam'} />
          <AttachmentList attachments={m.attachments} account={account} />
          {isDraft && (
            <button type="button" className="btn btn--sm" onClick={() => ui.openCompose('draft', m)}>
              Continue editing
            </button>
          )}
        </div>
      )}
    </li>
  );
}
