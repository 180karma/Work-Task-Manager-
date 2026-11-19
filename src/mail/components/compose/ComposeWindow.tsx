import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuCircleAlert, LuMaximize2, LuMinimize2, LuMinus, LuPaperclip, LuSend, LuTrash2, LuX } from 'react-icons/lu';
import { config } from '../../config/env';
import type { LayoutMode } from '../../hooks/useMediaQuery';
import { signatureHtml } from '../../lib/compose';
import { formatBytes, formatTime } from '../../lib/format';
import { uid } from '../../lib/id';
import { htmlToText } from '../../lib/sanitize';
import { validateAttachment } from '../../lib/validation';
import { confirmAction } from '../../state/confirm';
import { useMailActions, useMailState } from '../../state/MailStore';
import { toast } from '../../state/toast';
import { useUI, type ComposeWindow as ComposeWin } from '../../state/UIStore';
import type { DraftInput, OutgoingAttachment } from '../../types/mail';
import { fileIcon } from '../mail/Attachments';
import { Spinner } from '../ui/primitives';
import { RecipientField, type Recipient } from './RecipientField';
import { RichEditor, type RichEditorHandle } from './RichEditor';

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error' };

const TITLES = { new: 'New message', reply: 'Reply', replyAll: 'Reply all', forward: 'Forward', draft: 'Draft' } as const;

export function ComposeWindow({ win, layout }: { win: ComposeWin; layout: LayoutMode }) {
  const ui = useUI();
  const mail = useMailActions();
  const { accounts, contacts } = useMailState();
  const d = win.draft;

  const [accountId, setAccountId] = useState(d.accountId);
  const [to, setTo] = useState<Recipient[]>(d.to);
  const [cc, setCc] = useState<Recipient[]>(d.cc);
  const [bcc, setBcc] = useState<Recipient[]>(d.bcc);
  const [showCc, setShowCc] = useState(d.cc.length > 0);
  const [showBcc, setShowBcc] = useState(d.bcc.length > 0);
  const [subject, setSubject] = useState(d.subject);
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>(d.attachments);
  const [errors, setErrors] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(d.id);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const editor = useRef<RichEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;

  const account = accounts.find((a) => a.id === accountId);

  // Contacts plus the user's own addresses, for autocomplete.
  const suggestions = useMemo(
    () => [...contacts, ...accounts.map((a) => ({ id: `self_${a.id}`, name: `${a.displayName} (${a.label})`, email: a.providerEmail, company: null }))],
    [contacts, accounts],
  );

  const snapshot = useCallback(
    (): DraftInput => ({
      id: draftIdRef.current,
      accountId,
      to: to.filter((r) => !r.invalid),
      cc: cc.filter((r) => !r.invalid),
      bcc: bcc.filter((r) => !r.invalid),
      subject: subject.trim(),
      bodyHtml: editor.current?.getHtml() ?? '',
      attachments,
      inReplyToId: d.inReplyToId,
      threadId: d.threadId,
    }),
    [accountId, to, cc, bcc, subject, attachments, d.inReplyToId, d.threadId],
  );

  const hasContent = useCallback(() => {
    const s = snapshot();
    const text = htmlToText(s.bodyHtml).replace(/^--\s[\s\S]*$/m, '').trim();
    return s.to.length + s.cc.length + s.bcc.length > 0 || !!s.subject || !!text || s.attachments.length > 0;
  }, [snapshot]);

  const saveNow = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current || !hasContent()) return draftIdRef.current;
    dirty.current = false;
    setSave({ kind: 'saving' });
    const saved = await mail.saveDraft(snapshot());
    if (saved) {
      setDraftId(saved.id);
      draftIdRef.current = saved.id;
      setSave({ kind: 'saved', at: saved.receivedAt });
      return saved.id;
    }
    dirty.current = true;
    setSave({ kind: 'error' });
    return draftIdRef.current;
  }, [mail, snapshot, hasContent]);

  const touch = useCallback(() => {
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveNow(), config.autosaveDelayMs);
  }, [saveNow]);

  // Field changes count as edits (skip the first render).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    touch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, to, cc, bcc, subject, attachments]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const addFiles = (files: FileList | File[]) => {
    const problems: string[] = [];
    let next = [...attachments];
    for (const f of Array.from(files)) {
      const problem = validateAttachment(f, next);
      if (problem) {
        problems.push(problem);
        continue;
      }
      next = [
        ...next,
        {
          id: uid('att'),
          filename: f.name,
          mimeType: f.type || 'application/octet-stream',
          fileSize: f.size,
          file: f,
          previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
        },
      ];
    }
    setAttachments(next);
    setErrors(problems);
  };

  const close = async () => {
    const id = await saveNow();
    ui.closeComposer(win.key);
    if (id) toast('Saved to Drafts');
  };

  const discard = async () => {
    window.clearTimeout(timer.current);
    dirty.current = false;
    if (draftIdRef.current) await mail.discardDraft(draftIdRef.current);
    ui.closeComposer(win.key);
    toast('Draft discarded');
  };

  const send = async () => {
    const all = [...to, ...cc, ...bcc];
    const invalid = all.filter((r) => r.invalid);
    if (!all.length) {
      setErrors(['Add at least one recipient.']);
      return;
    }
    if (invalid.length) {
      setErrors([`Fix ${invalid.length === 1 ? 'this address' : 'these addresses'} before sending: ${invalid.map((r) => r.email).join(', ')}`]);
      return;
    }
    if (!account) {
      setErrors(['Choose an account to send from.']);
      return;
    }
    if (!subject.trim()) {
      const ok = await confirmAction({ title: 'Send without a subject?', message: 'Messages without a subject are easy to miss and more likely to be filtered as spam.', confirmLabel: 'Send anyway' });
      if (!ok) return;
    }
    const body = htmlToText(editor.current?.getHtml() ?? '').split(/\n-- \n|On .* wrote:/)[0];
    if (/\b(attach(ed|ment|ing)?|enclosed)\b/i.test(body) && attachments.length === 0) {
      const ok = await confirmAction({ title: 'Forgot an attachment?', message: 'You mention an attachment, but nothing is attached.', confirmLabel: 'Send anyway' });
      if (!ok) return;
    }
    window.clearTimeout(timer.current);
    dirty.current = false;
    setSending(true);
    setErrors([]);
    const ok = await mail.send(snapshot());
    setSending(false);
    if (ok) ui.closeComposer(win.key);
  };

  const changeAccount = (id: string) => {
    const next = accounts.find((a) => a.id === id);
    setAccountId(id);
    if (next) editor.current?.setSignature(signatureHtml(next.signature));
  };

  const title = subject.trim() || TITLES[win.mode];
  const status =
    save.kind === 'saving' ? 'Saving…' : save.kind === 'saved' ? `Draft saved ${formatTime(save.at)}` : save.kind === 'error' ? 'Not saved' : draftId ? 'Draft' : '';

  const totalSize = attachments.reduce((s, a) => s + a.fileSize, 0);

  return (
    <section
      className={`compose${win.minimized ? ' is-min' : ''}${win.maximized && !win.minimized ? ' is-max' : ''}${layout === 'narrow' ? ' is-sheet' : ''}${dragOver ? ' is-drop' : ''}`}
      role="dialog"
      aria-label={title}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }
        setDragOver(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && layout !== 'narrow') {
          e.stopPropagation();
          ui.updateComposer(win.key, { minimized: true });
        }
      }}
    >
      <header className="compose__head">
        {layout === 'narrow' ? (
          <button type="button" className="icon-btn on-navy" aria-label="Close and save draft" onClick={() => void close()}>
            <LuX />
          </button>
        ) : null}
        <button type="button" className="compose__title" onClick={() => ui.updateComposer(win.key, { minimized: !win.minimized })} aria-expanded={!win.minimized}>
          {title}
        </button>
        <span className="compose__status" aria-live="polite">
          {status}
        </span>
        {layout !== 'narrow' && (
          <>
            <button
              type="button"
              className="icon-btn icon-btn--sm on-navy"
              aria-label={win.minimized ? 'Open' : 'Minimise'}
              title={win.minimized ? 'Open' : 'Minimise (Esc)'}
              onClick={() => ui.updateComposer(win.key, { minimized: !win.minimized })}
            >
              <LuMinus />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--sm on-navy"
              aria-label={win.maximized ? 'Restore size' : 'Expand'}
              title={win.maximized ? 'Restore size' : 'Expand'}
              onClick={() => ui.updateComposer(win.key, { maximized: !win.maximized })}
            >
              {win.maximized ? <LuMinimize2 /> : <LuMaximize2 />}
            </button>
            <button type="button" className="icon-btn icon-btn--sm on-navy" aria-label="Close and save draft" title="Close (saves draft)" onClick={() => void close()}>
              <LuX />
            </button>
          </>
        )}
        {layout === 'narrow' && (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void send()} disabled={sending}>
            {sending ? <Spinner size={14} /> : <LuSend />} Send
          </button>
        )}
      </header>

      <div className="compose__body">
      <div className="compose__fields">
        <div className="compose-field">
          <label className="compose-field__label" htmlFor={`${win.key}-from`}>
            From
          </label>
          <select id={`${win.key}-from`} className="compose-field__select" value={accountId} onChange={(e) => changeAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} &lt;{a.providerEmail}&gt; ({a.label})
              </option>
            ))}
          </select>
          {account && <span className="acct-dot" style={{ background: account.colour }} aria-hidden="true" />}
        </div>
        {account?.syncStatus === 'error' && (
          <p className="compose__warn">
            <LuCircleAlert /> {account.label} needs to be reconnected before it can send. Pick another account or reconnect it in Connected accounts.
          </p>
        )}
        <RecipientField
          label="To"
          value={to}
          onChange={setTo}
          contacts={suggestions}
          autoFocus={win.mode === 'new' || win.mode === 'forward'}
          trailing={
            <span className="compose-field__toggles">
              {!showCc && (
                <button type="button" className="link-btn" onClick={() => setShowCc(true)}>
                  Cc
                </button>
              )}
              {!showBcc && (
                <button type="button" className="link-btn" onClick={() => setShowBcc(true)}>
                  Bcc
                </button>
              )}
            </span>
          }
        />
        {showCc && <RecipientField label="Cc" value={cc} onChange={setCc} contacts={suggestions} />}
        {showBcc && <RecipientField label="Bcc" value={bcc} onChange={setBcc} contacts={suggestions} />}
        <div className="compose-field">
          <label className="compose-field__label" htmlFor={`${win.key}-subject`}>
            Subject
          </label>
          <input id={`${win.key}-subject`} className="compose-field__input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
        </div>
      </div>

      <RichEditor ref={editor} initialHtml={d.bodyHtml} onInput={touch} onSubmitShortcut={() => void send()} autoFocus={win.mode === 'reply' || win.mode === 'replyAll' || win.mode === 'draft'} />

      {(attachments.length > 0 || errors.length > 0) && (
        <div className="compose__extras">
          {errors.map((er, i) => (
            <p key={i} className="compose__error" role="alert">
              <LuCircleAlert /> {er}
            </p>
          ))}
          {attachments.length > 0 && (
            <ul className="compose__atts" aria-label={`Attachments, ${formatBytes(totalSize)} total`}>
              {attachments.map((a) => (
                <li key={a.id} className="att-chip">
                  {a.previewUrl ? <img src={a.previewUrl} alt="" /> : <span className="att-chip__icon">{fileIcon(a.mimeType, a.filename)}</span>}
                  <span className="att-chip__name">{a.filename}</span>
                  <span className="att-chip__size">{formatBytes(a.fileSize)}</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn--xs"
                    aria-label={`Remove ${a.filename}`}
                    onClick={() => {
                      if (a.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
                      setAttachments((list) => list.filter((x) => x.id !== a.id));
                    }}
                  >
                    <LuX />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className="compose__foot">
        {layout !== 'narrow' && (
          <button type="button" className="btn btn--primary" onClick={() => void send()} disabled={sending}>
            {sending ? <Spinner size={14} /> : <LuSend />}
            <span>{sending ? 'Sending…' : 'Send'}</span>
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Attach files" title={`Attach files (up to ${formatBytes(config.maxAttachmentBytes)})`} onClick={() => fileInput.current?.click()}>
          <LuPaperclip />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="compose__foot-spacer" />
        <button type="button" className="btn btn--ghost" onClick={() => void saveNow().then((id) => id && toast('Draft saved'))}>
          Save draft
        </button>
        <button type="button" className="icon-btn" aria-label="Discard draft" title="Discard draft" onClick={() => void discard()}>
          <LuTrash2 />
        </button>
      </footer>
      </div>
      {dragOver && <div className="compose__dropzone">Drop files to attach</div>}
    </section>
  );
}

export function ComposeDock({ layout }: { layout: LayoutMode }) {
  const ui = useUI();
  if (!ui.composers.length) return null;
  const anyMax = ui.composers.some((c) => c.maximized && !c.minimized);
  return (
    <div className={`compose-dock${layout === 'narrow' ? ' is-narrow' : ''}${anyMax ? ' has-max' : ''}`}>
      {ui.composers.map((c) => (
        <ComposeWindow key={c.key} win={c} layout={layout} />
      ))}
    </div>
  );
}
