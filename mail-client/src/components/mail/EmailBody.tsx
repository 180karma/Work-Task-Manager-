import { useEffect, useMemo, useRef, useState } from 'react';
import { LuImage } from 'react-icons/lu';
import { sanitiseEmailHtml, textToHtml } from '../../lib/sanitize';

/**
 * Renders untrusted email HTML inside a Shadow DOM:
 * the email's CSS cannot leak into the app and the app's CSS cannot break the email.
 * Content is sanitised first (no scripts, handlers, forms or frames).
 */
const BASE_CSS = `
:host { display:block; color: var(--text); font: 15px/1.6 var(--font-body); overflow-wrap: anywhere; }
.body { max-width: 100%; overflow-x: auto; }
.body.is-text { white-space: normal; }
.body.is-html.on-paper { background:#fff; color:#1d2433; border-radius: 12px; padding: 18px; }
img { max-width: 100%; height: auto; }
img[data-blocked] { display:inline-block; min-width: 24px; min-height: 24px; background: repeating-linear-gradient(45deg,#e8ecf2 0 6px,#f4f6f9 6px 12px); border-radius: 4px; }
table { max-width: 100%; }
a { color: var(--link); }
.on-paper a { color: #1f5fd6; }
blockquote { margin: 10px 0; padding: 2px 0 2px 14px; border-left: 3px solid var(--line-strong); color: var(--muted); }
.on-paper blockquote { border-color: #d4dae4; color: #5a6579; }
p { margin: 0 0 12px; }
pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
`;

export function EmailBody({ html, text, dark, allowRemote }: { html: string | null; text: string; dark: boolean; allowRemote: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [showImages, setShowImages] = useState(allowRemote);
  useEffect(() => setShowImages(allowRemote), [allowRemote, html]);

  const rendered = useMemo(() => {
    if (html) return { ...sanitiseEmailHtml(html, { allowRemoteImages: showImages }), isHtml: true };
    return { html: textToHtml(text), blockedImages: 0, isHtml: false };
  }, [html, text, showImages]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${BASE_CSS}</style><div class="body ${rendered.isHtml ? 'is-html' : 'is-text'}${rendered.isHtml && dark ? ' on-paper' : ''}">${rendered.html}</div>`;
  }, [rendered, dark]);

  return (
    <>
      {rendered.blockedImages > 0 && (
        <div className="notice notice--info">
          <LuImage />
          <span>Remote images are hidden so senders can't track when you open this.</span>
          <button type="button" className="btn btn--sm" onClick={() => setShowImages(true)}>
            Show images
          </button>
        </div>
      )}
      <div ref={host} className="email-body" />
    </>
  );
}
