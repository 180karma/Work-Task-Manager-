// Generated SVG "photos" for image attachments, so the demo needs no binary files.

function svg(body: string, w = 640, h = 420): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
}

export const mockImages = {
  mountains: svg(
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb86b"/><stop offset="1" stop-color="#f3e3c3"/></linearGradient></defs>` +
      `<rect width="640" height="420" fill="url(#s)"/><circle cx="470" cy="120" r="46" fill="#fff4d6"/>` +
      `<path d="M0 330 L150 170 L250 260 L370 130 L520 300 L640 210 L640 420 L0 420Z" fill="#5b6f8f"/>` +
      `<path d="M0 370 L120 290 L260 350 L400 270 L560 360 L640 320 L640 420 L0 420Z" fill="#33415c"/>`,
  ),
  office: svg(
    `<rect width="640" height="420" fill="#e9eef6"/><rect x="60" y="250" width="520" height="24" rx="6" fill="#8a6a4f"/>` +
      `<rect x="200" y="120" width="240" height="140" rx="10" fill="#1f2a44"/><rect x="214" y="134" width="212" height="112" rx="4" fill="#4f7cff"/>` +
      `<rect x="300" y="260" width="40" height="20" fill="#1f2a44"/><circle cx="120" cy="225" r="26" fill="#2e9d6b"/><rect x="112" y="225" width="16" height="30" fill="#8a6a4f"/>`,
  ),
  chart: svg(
    `<rect width="640" height="420" fill="#ffffff"/><g fill="#2f6feb"><rect x="90" y="250" width="60" height="110"/><rect x="190" y="200" width="60" height="160"/>` +
      `<rect x="290" y="150" width="60" height="210"/><rect x="390" y="180" width="60" height="180"/><rect x="490" y="90" width="60" height="270"/></g>` +
      `<line x1="70" y1="360" x2="580" y2="360" stroke="#5c6b80" stroke-width="3"/>`,
  ),
};
