import { memo, useRef, useState } from 'react';
import { LuArchive, LuFlag, LuMail, LuMailOpen, LuPaperclip, LuStar, LuTrash2 } from 'react-icons/lu';
import { formatListDate } from '../../lib/format';
import type { ListItem } from '../../state/selectors';
import type { EmailAccount, Label } from '../../types/mail';
import { DRAG_TYPE } from '../layout/Sidebar';
import { Avatar } from '../ui/primitives';

export interface RowHandlers {
  open(item: ListItem): void;
  check(item: ListItem, shift: boolean): void;
  star(item: ListItem): void;
  important(item: ListItem): void;
  archive(item: ListItem): void;
  trash(item: ListItem): void;
  toggleRead(item: ListItem): void;
  dragIds(item: ListItem): string[];
}

interface RowProps {
  item: ListItem;
  account: EmailAccount | undefined;
  labels: Label[];
  selected: boolean;
  checked: boolean;
  selecting: boolean;
  showAccount: boolean;
  folderTag: string | null;
  draggable: boolean;
  swipeable: boolean;
  previewLines: 1 | 2;
  h: RowHandlers;
}

const SWIPE_COMMIT = 88;

export const MessageRow = memo(function MessageRow(p: RowProps) {
  const { item, account, h } = p;
  const e = item.latest;
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; active: boolean; locked: boolean } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (ev: React.PointerEvent) => {
    if (!p.swipeable || ev.pointerType !== 'touch') return;
    start.current = { x: ev.clientX, y: ev.clientY, active: false, locked: false };
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = ev.clientX - s.x;
    const my = ev.clientY - s.y;
    if (!s.active && !s.locked) {
      if (Math.abs(my) > 12) s.locked = true; // vertical scroll wins
      else if (Math.abs(mx) > 12) s.active = true;
    }
    if (s.active) setDx(Math.max(-140, Math.min(140, mx)));
  };
  const onPointerEnd = () => {
    const s = start.current;
    start.current = null;
    if (!s?.active) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 50);
    if (dx > SWIPE_COMMIT) h.toggleRead(item);
    else if (dx < -SWIPE_COMMIT) h.archive(item);
    setDx(0);
  };

  const labelChips = e.labelIds
    .map((id) => p.labels.find((l) => l.id === id))
    .filter((l): l is Label => !!l)
    .slice(0, 2);

  const sender = item.participants.length > 2 ? `${item.participants[0]} … ${item.participants[item.participants.length - 1]}` : item.participants.join(', ');

  return (
    <li
      className={`row${item.unread ? ' is-unread' : ''}${p.selected ? ' is-selected' : ''}${p.checked ? ' is-checked' : ''}${p.selecting ? ' is-selecting' : ''}${dx ? ' is-swiping' : ''}`}
      style={{ ['--acct' as string]: account?.colour ?? 'transparent' }}
      draggable={p.draggable}
      onDragStart={(ev) => {
        ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify(h.dragIds(item)));
        ev.dataTransfer.effectAllowed = 'move';
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {dx !== 0 && (
        <div className={`row__swipe ${dx > 0 ? 'is-read' : 'is-archive'}${Math.abs(dx) > SWIPE_COMMIT ? ' is-armed' : ''}`} aria-hidden="true">
          {dx > 0 ? (
            <span>
              {item.unread ? <LuMailOpen /> : <LuMail />} {item.unread ? 'Read' : 'Unread'}
            </span>
          ) : (
            <span>
              Archive <LuArchive />
            </span>
          )}
        </div>
      )}
      <div className="row__inner" style={dx ? { transform: `translateX(${dx}px)` } : undefined}>
        {p.showAccount && <span className="row__ribbon" aria-hidden="true" />}
        <div className="row__lead">
          <span className="row__avatar">
            <Avatar name={e.from.name} email={e.from.email} size={34} />
          </span>
          <label className="row__check" title="Select">
            <input
              type="checkbox"
              checked={p.checked}
              aria-label={`Select ${e.subject || 'message'}`}
              onChange={() => {}}
              onClick={(ev) => {
                ev.stopPropagation();
                h.check(item, ev.shiftKey);
              }}
            />
          </label>
        </div>
        <button
          type="button"
          className="row__main"
          onClick={(ev) => {
            if (suppressClick.current) return;
            if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
              h.check(item, ev.shiftKey);
              return;
            }
            h.open(item);
          }}
          aria-current={p.selected ? 'true' : undefined}
          aria-label={`${item.unread ? 'Unread. ' : ''}${sender}. ${e.subject || 'No subject'}. ${formatListDate(e.receivedAt)}${account ? `. ${account.label} account` : ''}`}
        >
          <span className="row__line1">
            {item.unread && <span className="unread-dot" aria-hidden="true" />}
            <span className="row__sender">{sender}</span>
            {item.count > 1 && <span className="row__count">{item.count}</span>}
            {item.hasDraft && <span className="row__draft">Draft</span>}
            <span className="row__date">{formatListDate(e.receivedAt)}</span>
          </span>
          <span className="row__line2">
            <span className="row__subject">{e.subject || '(no subject)'}</span>
            {item.hasAttachments && <LuPaperclip className="row__clip" aria-label="Has attachments" />}
          </span>
          <span className={`row__preview lines-${p.previewLines}`}>{e.snippet || 'No preview available'}</span>
          {(labelChips.length > 0 || p.folderTag || p.showAccount) && (
            <span className="row__meta">
              {p.showAccount && account && <span className="row__acct">{account.label}</span>}
              {p.folderTag && <span className="chip chip--folder">{p.folderTag}</span>}
              {labelChips.map((l) => (
                <span key={l.id} className="chip" style={{ ['--chip' as string]: l.colour }}>
                  {l.name}
                </span>
              ))}
            </span>
          )}
        </button>
        <div className="row__side">
          <button
            type="button"
            className={`icon-btn icon-btn--sm tone-star${item.starred ? ' is-active' : ''}`}
            aria-label={item.starred ? 'Remove star' : 'Star'}
            aria-pressed={item.starred}
            title={item.starred ? 'Remove star' : 'Star'}
            onClick={() => h.star(item)}
          >
            <LuStar />
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn--sm tone-important${item.important ? ' is-active' : ''}`}
            aria-label={item.important ? 'Mark as not important' : 'Mark as important'}
            aria-pressed={item.important}
            title={item.important ? 'Mark as not important' : 'Mark as important'}
            onClick={() => h.important(item)}
          >
            <LuFlag />
          </button>
        </div>
        <div className="row__hover">
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Archive" title="Archive (e)" onClick={() => h.archive(item)}>
            <LuArchive />
          </button>
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Delete" title="Delete (#)" onClick={() => h.trash(item)}>
            <LuTrash2 />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label={item.unread ? 'Mark as read' : 'Mark as unread'}
            title={item.unread ? 'Mark as read' : 'Mark as unread (u)'}
            onClick={() => h.toggleRead(item)}
          >
            {item.unread ? <LuMailOpen /> : <LuMail />}
          </button>
        </div>
      </div>
    </li>
  );
});
