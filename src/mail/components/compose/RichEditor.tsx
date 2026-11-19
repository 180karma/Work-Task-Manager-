import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { LuBold, LuItalic, LuLink, LuList, LuListOrdered, LuQuote, LuRemoveFormatting, LuStrikethrough, LuUnderline } from 'react-icons/lu';
import { getSelection } from '../../host';
import { escapeHtml, sanitiseComposerHtml } from '../../lib/sanitize';
import { normaliseLink } from '../../lib/validation';

/**
 * Lightweight rich-text editor on contentEditable.
 * Paste is sanitised to formatting-only HTML. execCommand is deprecated but
 * universally supported; the toolbar is isolated here so a library editor
 * (e.g. TipTap) can replace it without touching the composer.
 */
export interface RichEditorHandle {
  getHtml(): string;
  setSignature(html: string): void;
  focus(): void;
}

const TOOLS = [
  { cmd: 'bold', label: 'Bold (Ctrl+B)', icon: <LuBold /> },
  { cmd: 'italic', label: 'Italic (Ctrl+I)', icon: <LuItalic /> },
  { cmd: 'underline', label: 'Underline (Ctrl+U)', icon: <LuUnderline /> },
  { cmd: 'strikeThrough', label: 'Strikethrough', icon: <LuStrikethrough /> },
  { sep: true },
  { cmd: 'insertUnorderedList', label: 'Bulleted list', icon: <LuList /> },
  { cmd: 'insertOrderedList', label: 'Numbered list', icon: <LuListOrdered /> },
  { cmd: 'formatBlock', arg: 'blockquote', label: 'Quote', icon: <LuQuote /> },
] as const;

export const RichEditor = forwardRef<RichEditorHandle, { initialHtml: string; onInput: () => void; onSubmitShortcut: () => void; autoFocus?: boolean }>(
  function RichEditor({ initialHtml, onInput, onSubmitShortcut, autoFocus }, ref) {
    const el = useRef<HTMLDivElement>(null);
    const savedRange = useRef<Range | null>(null);
    const edited = useRef(false);
    const [active, setActive] = useState<Record<string, boolean>>({});
    const [link, setLink] = useState<null | { url: string; text: string; error: string }>(null);

    useImperativeHandle(ref, () => ({
      getHtml: () => sanitiseComposerHtml(el.current?.innerHTML ?? ''),
      setSignature(html) {
        const root = el.current;
        if (!root) return;
        const existing = root.querySelector('[data-signature]');
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const next = tmp.querySelector('[data-signature]');
        if (existing && next) existing.replaceWith(next);
        else if (existing) existing.remove();
        else if (next) root.insertBefore(next, root.children[1] ?? null);
      },
      focus: () => el.current?.focus(),
    }));

    useEffect(() => {
      if (el.current) el.current.innerHTML = initialHtml;
      if (autoFocus && el.current) {
        el.current.focus();
        const r = document.createRange();
        r.setStart(el.current, 0);
        r.collapse(true);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      // Only on mount: the editor owns its DOM afterwards.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const update = () => {
        if (!el.current || !el.current.contains(getSelection()?.anchorNode ?? null)) return;
        const s: Record<string, boolean> = {};
        for (const t of TOOLS) {
          if ('cmd' in t && t.cmd !== 'formatBlock') {
            try {
              s[t.cmd] = document.queryCommandState(t.cmd);
            } catch {
              s[t.cmd] = false;
            }
          }
        }
        setActive(s);
      };
      document.addEventListener('selectionchange', update);
      return () => document.removeEventListener('selectionchange', update);
    }, []);

    const exec = (cmd: string, arg?: string) => {
      el.current?.focus();
      document.execCommand(cmd, false, arg);
      onInput();
    };

    const openLink = () => {
      const sel = getSelection();
      if (sel && sel.rangeCount && el.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
      else savedRange.current = null;
      const anchor = sel?.anchorNode?.parentElement?.closest('a');
      setLink({ url: anchor?.getAttribute('href') ?? '', text: sel?.toString() ?? '', error: '' });
    };

    const applyLink = (e: React.FormEvent) => {
      e.preventDefault();
      if (!link) return;
      const href = normaliseLink(link.url);
      if (!href) {
        setLink({ ...link, error: 'Enter a web address (https://…) or an email address.' });
        return;
      }
      el.current?.focus();
      const sel = getSelection();
      if (savedRange.current && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
      }
      const label = link.text.trim() || link.url.trim();
      if (sel && !sel.isCollapsed && !link.text.trim()) {
        document.execCommand('createLink', false, href);
      } else {
        document.execCommand('insertHTML', false, `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>&nbsp;`);
      }
      setLink(null);
      onInput();
    };

    return (
      <div className="editor">
        <div
          ref={el}
          className="editor__surface"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          spellCheck
          suppressContentEditableWarning
          onInput={() => {
            edited.current = true;
            onInput();
          }}
          onPointerUp={() => {
            // Before the first keystroke, a click below the text shouldn't land after the signature or quote.
            if (edited.current || !el.current) return;
            const sel = getSelection();
            const node = sel?.anchorNode;
            const holder = node instanceof Element ? node : node?.parentElement;
            const lastChild = el.current.lastElementChild;
            const atEnd = node === el.current && sel?.anchorOffset === el.current.childNodes.length;
            if (sel && sel.isCollapsed && (atEnd || holder?.closest('[data-signature], blockquote') || (lastChild && holder === lastChild && lastChild.matches('blockquote')))) {
              const first = el.current.firstChild ?? el.current;
              const r = document.createRange();
              r.setStart(first, 0);
              r.collapse(true);
              sel.removeAllRanges();
              sel.addRange(r);
            }
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onSubmitShortcut();
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
              e.preventDefault();
              openLink();
            }
          }}
          onPaste={(e) => {
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            e.preventDefault();
            if (html) document.execCommand('insertHTML', false, sanitiseComposerHtml(html));
            else document.execCommand('insertText', false, text);
            onInput();
          }}
          onDrop={(e) => {
            // Files are handled by the compose window; block raw HTML drops.
            if (e.dataTransfer.files.length) e.preventDefault();
          }}
        />
        <div className="editor__toolbar" role="toolbar" aria-label="Formatting">
          {TOOLS.map((t, i) =>
            'sep' in t ? (
              <span key={i} className="editor__sep" />
            ) : (
              <button
                key={t.cmd}
                type="button"
                className={`icon-btn icon-btn--sm${active[t.cmd] ? ' is-active' : ''}`}
                aria-label={t.label}
                title={t.label}
                aria-pressed={t.cmd !== 'formatBlock' ? !!active[t.cmd] : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec(t.cmd, 'arg' in t ? t.arg : undefined)}
              >
                {t.icon}
              </button>
            ),
          )}
          <span className="editor__sep" />
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Insert link (Ctrl+K)" title="Insert link (Ctrl+K)" onMouseDown={(e) => e.preventDefault()} onClick={openLink}>
            <LuLink />
          </button>
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Clear formatting" title="Clear formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}>
            <LuRemoveFormatting />
          </button>
        </div>
        {link && (
          <form className="link-pop" onSubmit={applyLink} onKeyDown={(e) => e.key === 'Escape' && setLink(null)}>
            <label className="adv-field">
              <span>Text to show</span>
              <input className="text-input" value={link.text} onChange={(e) => setLink({ ...link, text: e.target.value })} placeholder="Optional" />
            </label>
            <label className="adv-field">
              <span>Link to</span>
              <input className="text-input" value={link.url} autoFocus onChange={(e) => setLink({ ...link, url: e.target.value, error: '' })} placeholder="https://example.com" />
            </label>
            {link.error && (
              <p className="field-error" role="alert">
                {link.error}
              </p>
            )}
            <div className="adv-actions">
              <button type="button" className="btn btn--sm" onClick={() => setLink(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary btn--sm">
                Insert link
              </button>
            </div>
          </form>
        )}
      </div>
    );
  },
);
