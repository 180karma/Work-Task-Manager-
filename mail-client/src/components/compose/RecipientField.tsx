import { useId, useMemo, useRef, useState } from 'react';
import { LuX } from 'react-icons/lu';
import { isValidEmail, parseMailbox, splitAddresses } from '../../lib/validation';
import type { Contact, Mailbox } from '../../types/mail';
import { Avatar } from '../ui/primitives';

export interface Recipient extends Mailbox {
  invalid?: boolean;
}

interface Props {
  label: string;
  value: Recipient[];
  onChange: (v: Recipient[]) => void;
  contacts: Contact[];
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}

export function toRecipient(raw: string): Recipient | null {
  const text = raw.trim();
  if (!text) return null;
  const mb = parseMailbox(text);
  if (mb) return mb;
  return { name: text, email: text, invalid: true };
}

export function RecipientField({ label, value, onChange, contacts, autoFocus, trailing }: Props) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 1) return [];
    const taken = new Set(value.map((v) => v.email.toLowerCase()));
    return contacts
      .filter((c) => !taken.has(c.email.toLowerCase()) && (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
      .slice(0, 6);
  }, [text, contacts, value]);

  const commit = (raw: string) => {
    const parts = splitAddresses(raw).map(toRecipient).filter((r): r is Recipient => !!r);
    if (!parts.length) return;
    const existing = new Set(value.map((v) => v.email.toLowerCase()));
    onChange([...value, ...parts.filter((p) => !existing.has(p.email.toLowerCase()))]);
    setText('');
    setActive(0);
  };

  const pick = (c: Contact) => {
    onChange([...value, { name: c.name, email: c.email }]);
    setText('');
    setActive(0);
    input.current?.focus();
  };

  const showList = focused && suggestions.length > 0;

  return (
    <div className="recipients" onClick={() => input.current?.focus()}>
      <label className="compose-field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="recipients__box">
        {value.map((r, i) => (
          <span key={`${r.email}-${i}`} className={`recipient-chip${r.invalid ? ' is-invalid' : ''}`} title={r.invalid ? `${r.email} isn't a valid email address` : r.email}>
            <button
              type="button"
              className="recipient-chip__text"
              onClick={(e) => {
                e.stopPropagation();
                // Click to edit: put it back in the input.
                onChange(value.filter((_, j) => j !== i));
                setText(r.name !== r.email ? `${r.name} <${r.email}>` : r.email);
                input.current?.focus();
              }}
            >
              {r.name !== r.email ? r.name : r.email}
            </button>
            <button
              type="button"
              className="recipient-chip__x"
              aria-label={`Remove ${r.email}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((_, j) => j !== i));
              }}
            >
              <LuX />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={inputId}
          className="recipients__input"
          value={text}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim()) commit(text);
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]\s*$/.test(v) && isValidEmail(v.replace(/[,;]\s*$/, '').trim().replace(/^.*<|>$/g, ''))) commit(v);
            else setText(v);
            setActive(0);
          }}
          onPaste={(e) => {
            const data = e.clipboardData.getData('text');
            if (/[,;\n]/.test(data)) {
              e.preventDefault();
              commit(text + data);
            }
          }}
          onKeyDown={(e) => {
            if (showList && e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (showList && e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter' || (e.key === 'Tab' && text.trim())) {
              if (showList) {
                e.preventDefault();
                pick(suggestions[active]);
              } else if (text.trim()) {
                e.preventDefault();
                commit(text);
              }
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {trailing}
      {showList && (
        <ul className="suggest" id={listId} role="listbox" aria-label="Contacts">
          {suggestions.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`suggest__item${i === active ? ' is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Avatar name={c.name} email={c.email} size={28} />
              <span className="suggest__text">
                <span className="suggest__name">{c.name}</span>
                <span className="suggest__email">{c.email}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
