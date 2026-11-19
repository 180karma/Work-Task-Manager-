import { useState } from 'react';
import { LuCalendar, LuFile, LuFileArchive, LuFileSpreadsheet, LuFileText, LuImage } from 'react-icons/lu';
import { formatBytes } from '../../lib/format';
import { fileExtension } from '../../lib/validation';
import type { Attachment, EmailAccount } from '../../types/mail';
import { Dialog } from '../ui/Dialog';

export function fileIcon(mime: string, name: string) {
  const ext = fileExtension(name);
  if (mime.startsWith('image/')) return <LuImage />;
  if (mime === 'text/calendar' || ext === 'ics') return <LuCalendar />;
  if (mime.includes('zip') || ['zip', 'rar', '7z', 'gz'].includes(ext)) return <LuFileArchive />;
  if (mime.includes('sheet') || ['xlsx', 'xls', 'csv'].includes(ext)) return <LuFileSpreadsheet />;
  if (mime === 'application/pdf' || mime.includes('word') || ['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return <LuFileText />;
  return <LuFile />;
}

export function AttachmentList({ attachments, account }: { attachments: Attachment[]; account: EmailAccount | undefined }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (!attachments.length) return null;
  const total = attachments.reduce((s, a) => s + a.fileSize, 0);
  return (
    <div className="attachments">
      <div className="attachments__head">
        {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
        <span className="attachments__size">{formatBytes(total)}</span>
      </div>
      <ul className="attachments__grid">
        {attachments.map((a) => (
          <li key={a.id}>
            <button type="button" className="att-tile" onClick={() => setOpen(a)} aria-label={`Preview ${a.filename}, ${formatBytes(a.fileSize)}`}>
              {a.previewUrl && a.mimeType.startsWith('image/') ? (
                <img className="att-tile__thumb" src={a.previewUrl} alt="" />
              ) : (
                <span className="att-tile__icon" data-ext={fileExtension(a.filename)}>
                  {fileIcon(a.mimeType, a.filename)}
                </span>
              )}
              <span className="att-tile__text">
                <span className="att-tile__name">{a.filename}</span>
                <span className="att-tile__size">{formatBytes(a.fileSize)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <Dialog title={open.filename} onClose={() => setOpen(null)} width={open.previewUrl ? 760 : 440}>
          {open.previewUrl && open.mimeType.startsWith('image/') ? (
            <img className="att-preview" src={open.previewUrl} alt={open.filename} />
          ) : (
            <div className="att-info">
              <span className="att-info__icon">{fileIcon(open.mimeType, open.filename)}</span>
              <dl>
                <dt>Type</dt>
                <dd>{open.mimeType}</dd>
                <dt>Size</dt>
                <dd>{formatBytes(open.fileSize)}</dd>
                <dt>From</dt>
                <dd>{account ? `${account.label} (${account.provider === 'gmail' ? 'Gmail' : 'Outlook'})` : 'Unknown account'}</dd>
              </dl>
            </div>
          )}
          <p className="dialog__note">
            Demo data. Opening and downloading files arrives in Phase 5, when attachments are fetched from{' '}
            {account?.provider === 'gmail' ? 'Gmail' : 'Microsoft Graph'} through a signed, short-lived Storage link.
          </p>
        </Dialog>
      )}
    </div>
  );
}
