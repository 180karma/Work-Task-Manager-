import DOMPurify from 'dompurify';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const URL_RE = /\b(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Plain-text email to HTML: escaped, paragraphs and line breaks kept, bare URLs linked. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(URL_RE, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const BLOCK = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'UL', 'OL', 'TABLE']);

/** HTML to readable plain text (used for snippets, empty checks and the attachment reminder). */
export function htmlToText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let out = '';
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += (n.textContent ?? '').replace(/\s+/g, ' ');
      return;
    }
    if (!(n instanceof Element)) return;
    if (n.tagName === 'BR') {
      out += '\n';
      return;
    }
    if (n.tagName === 'STYLE' || n.tagName === 'SCRIPT') return;
    const block = BLOCK.has(n.tagName);
    if (block && out && !out.endsWith('\n')) out += '\n';
    n.childNodes.forEach(walk);
    if (block && !out.endsWith('\n')) out += '\n';
  };
  doc.body.childNodes.forEach(walk);
  return out
    .split('\n')
    // Keep the standard "-- " signature delimiter intact.
    .map((l) => (l.trim() === '--' ? '-- ' : l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Received mail. Strips scripts, handlers, forms and frames; opens links in a new tab;
 * holds back remote images (and so tracking pixels) unless allowed.
 */
export function sanitiseEmailHtml(html: string, opts: { allowRemoteImages: boolean }): { html: string; blockedImages: number } {
  let blocked = 0;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') ?? '';
      const remote = /^(https?:)?\/\//i.test(src);
      const pixel = node.getAttribute('width') === '1' || node.getAttribute('height') === '1';
      if (remote && (!opts.allowRemoteImages || pixel)) {
        blocked += 1;
        node.removeAttribute('src');
        node.removeAttribute('srcset');
        if (pixel) node.setAttribute('style', 'display:none');
        else node.setAttribute('data-blocked', '');
      }
    }
  });
  try {
    const clean = DOMPurify.sanitize(html, {
      FORBID_TAGS: ['form', 'input', 'button', 'select', 'textarea', 'iframe', 'frame', 'object', 'embed', 'link', 'meta', 'base'],
      FORBID_ATTR: ['srcdoc', 'formaction'],
      ALLOW_DATA_ATTR: false,
    });
    return { html: clean, blockedImages: blocked };
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

/** Composer content and pastes: formatting-only HTML. */
export function sanitiseComposerHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'div', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ul', 'ol', 'li', 'blockquote', 'a', 'pre', 'code'],
    ALLOWED_ATTR: ['href', 'data-signature'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
}
