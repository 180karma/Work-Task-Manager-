import { useId, useState } from 'react';
import { useMailActions } from '../../state/MailStore';
import { Dialog } from '../ui/Dialog';

export const LABEL_COLOURS = ['#2f6feb', '#1d9a6c', '#d9480f', '#8b5cf6', '#c2255c', '#0c8599', '#e8a317', '#5c6b80'];

export function LabelDialog({ onClose }: { onClose: () => void }) {
  const mail = useMailActions();
  const [name, setName] = useState('');
  const [colour, setColour] = useState(LABEL_COLOURS[0]);
  const [error, setError] = useState('');
  const id = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter a label name.');
      return;
    }
    const created = await mail.createLabel(name, colour);
    if (created) onClose();
  };

  return (
    <Dialog title="New label" onClose={onClose}>
      <form className="form-stack" onSubmit={submit} noValidate>
        <label className="field-label" htmlFor={id}>
          Label name
        </label>
        <input id={id} className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Waiting on reply" maxLength={40} data-autofocus />
        <span className="field-label">Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Label colour">
          {LABEL_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={colour === c}
              aria-label={c}
              className={`swatch-btn${colour === c ? ' is-on' : ''}`}
              style={{ background: c }}
              onClick={() => setColour(c)}
            />
          ))}
        </div>
        <p className="field-error" role="alert">
          {error}
        </p>
        <div className="dialog__foot dialog__foot--inline">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Create label
          </button>
        </div>
      </form>
    </Dialog>
  );
}
