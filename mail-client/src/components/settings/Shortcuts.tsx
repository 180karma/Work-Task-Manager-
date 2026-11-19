import { Dialog } from '../ui/Dialog';

export const SHORTCUTS: [string, string][] = [
  ['c', 'New message'],
  ['/', 'Search'],
  ['j / k', 'Next / previous conversation'],
  ['r', 'Reply'],
  ['a', 'Reply all'],
  ['f', 'Forward'],
  ['e', 'Archive'],
  ['#', 'Delete'],
  ['s', 'Star'],
  ['u', 'Mark as unread'],
  ['Ctrl + Enter', 'Send (in the composer)'],
  ['Ctrl + K', 'Insert link (in the composer)'],
  ['Esc', 'Close or go back'],
  ['?', 'Show shortcuts'],
];

export function ShortcutList() {
  return (
    <dl className="shortcut-list">
      {SHORTCUTS.map(([k, d]) => (
        <div key={k}>
          <dt>
            {k.split(' ').map((part, i) => (part === '/' || part === '+' ? <span key={i}> {part} </span> : <kbd key={i}>{part}</kbd>))}
          </dt>
          <dd>{d}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width={480}>
      <ShortcutList />
    </Dialog>
  );
}
