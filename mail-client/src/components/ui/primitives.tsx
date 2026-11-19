import { initials } from '../../lib/format';

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

const AVATAR_COLOURS = ['#2f6feb', '#1d9a6c', '#d9480f', '#8b5cf6', '#c2255c', '#0c8599', '#b7791f', '#5c6b80'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, email, size = 32 }: { name: string; email: string; size?: number }) {
  const bg = AVATAR_COLOURS[hash(email.toLowerCase()) % AVATAR_COLOURS.length];
  return (
    <span className="avatar" style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
      {initials(name, email)}
    </span>
  );
}

export function Logo({ withName = true }: { withName?: boolean }) {
  return (
    <span className="logo">
      <svg className="logo__mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#4f7cff" />
        <path d="M7 11.5 16 17l9-5.5M8.5 9h15A1.5 1.5 0 0 1 25 10.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 7 21.5v-11A1.5 1.5 0 0 1 8.5 9Z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {withName ? <span className="logo__name">Relay</span> : <span className="sr-only">Relay</span>}
    </span>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={`toggle-row${disabled ? ' is-disabled' : ''}`}>
      <span className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {description && <span className="toggle-row__desc">{description}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
