import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { LuSearch, LuSlidersHorizontal, LuX } from 'react-icons/lu';
import { useOutsideClose } from '../../hooks/useOutsideClose';
import { buildAdvancedQuery, type AdvancedSearch } from '../../lib/search';
import { useUI } from '../../state/UIStore';

const EMPTY: AdvancedSearch = { from: '', to: '', subject: '', words: '', hasAttachment: false, unread: false, after: '', before: '' };

/** Live search (debounced) with Gmail-style operators and an advanced form. */
export const SearchBar = forwardRef<HTMLInputElement, { placeholder: string }>(function SearchBar({ placeholder }, ref) {
  const ui = useUI();
  const [text, setText] = useState(ui.query);
  const [adv, setAdv] = useState<AdvancedSearch | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const closeAdv = useCallback(() => setAdv(null), []);
  useOutsideClose([wrap], !!adv, closeAdv);

  useEffect(() => setText(ui.query), [ui.query]);

  useEffect(() => {
    if (text === ui.query) return;
    const t = window.setTimeout(() => ui.setQuery(text), 180);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const field = (key: keyof AdvancedSearch, label: string, type = 'text') => (
    <label className="adv-field">
      <span>{label}</span>
      <input
        className="text-input"
        type={type}
        value={adv![key] as string}
        onChange={(e) => setAdv({ ...adv!, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="search" ref={wrap} role="search">
      <LuSearch className="search__icon" aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        className="search__input"
        placeholder={placeholder}
        aria-label={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') ui.setQuery(text);
          if (e.key === 'Escape') {
            setText('');
            ui.setQuery('');
          }
        }}
      />
      {text && (
        <button
          type="button"
          className="icon-btn icon-btn--xs"
          aria-label="Clear search"
          onClick={() => {
            setText('');
            ui.setQuery('');
          }}
        >
          <LuX />
        </button>
      )}
      <button type="button" className="icon-btn icon-btn--xs" aria-label="Advanced search" title="Advanced search" aria-expanded={!!adv} onClick={() => setAdv(adv ? null : { ...EMPTY })}>
        <LuSlidersHorizontal />
      </button>
      {adv && (
        <form
          className="adv-search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = buildAdvancedQuery(adv);
            setText(q);
            ui.setQuery(q);
            setAdv(null);
          }}
        >
          {field('from', 'From')}
          {field('to', 'To')}
          {field('subject', 'Subject')}
          {field('words', 'Has the words')}
          <div className="adv-row">
            {field('after', 'After', 'date')}
            {field('before', 'Before', 'date')}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={adv.hasAttachment} onChange={(e) => setAdv({ ...adv, hasAttachment: e.target.checked })} />
            <span>Has attachment</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={adv.unread} onChange={(e) => setAdv({ ...adv, unread: e.target.checked })} />
            <span>Unread only</span>
          </label>
          <p className="adv-hint">
            Tip: type operators directly, e.g. <code>from:lena has:attachment</code>
          </p>
          <div className="adv-actions">
            <button type="button" className="btn btn--sm" onClick={() => setAdv(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary btn--sm">
              Search
            </button>
          </div>
        </form>
      )}
    </div>
  );
});
