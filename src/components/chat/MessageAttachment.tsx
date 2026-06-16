import React, { useState } from 'react';
import { Ban, Download, FileText, Loader2, Lock, LockKeyhole } from 'lucide-react';
import { attachmentKind, attachmentDataUrl, resolveMime, formatBytes, FileAttachment } from '../../file-transfer';
import { decryptFileData } from '../../file-crypto';
import { toBase64 } from '../../crypto/noise-primitives';

export function renderAttachment(att: FileAttachment, urlOverride?: string): React.ReactNode {
  const kind = attachmentKind(resolveMime(att.mime, att.name));
  const url = urlOverride ?? attachmentDataUrl(att);
  if (kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={att.name} className="max-h-64 max-w-full rounded border border-black/10 dark:border-white/10 object-contain" />
        <span className="block mt-1 text-[9px] font-mono text-slate-400 truncate">{att.name} · {formatBytes(att.size)}</span>
      </a>
    );
  }
  if (kind === 'audio') {
    return (
      <div className="flex flex-col gap-1">
        <audio controls src={url} className="w-full max-w-xs h-9" />
        <span className="text-[9px] font-mono text-slate-400 truncate">{att.name} · {formatBytes(att.size)}</span>
      </div>
    );
  }
  if (kind === 'video') {
    return (
      <div className="flex flex-col gap-1">
        <video controls src={url} className="max-h-64 max-w-full rounded border border-black/10 dark:border-white/10" />
        <span className="text-[9px] font-mono text-slate-400 truncate">{att.name} · {formatBytes(att.size)}</span>
      </div>
    );
  }
  return (
    <a href={url} download={att.name} className="flex items-center gap-3 px-3 py-2 border qb-accent-border bg-[var(--qb-accent-soft)] hover:opacity-90 transition-colors">
      <FileText size={20} className="qb-accent-text shrink-0" />
      <span className="min-w-0">
        <span className="block text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
        <span className="block text-[9px] font-mono text-slate-400">{formatBytes(att.size)} · click to download</span>
      </span>
      <Download size={14} className="text-slate-400 ml-auto shrink-0" />
    </a>
  );
}

// A streamed file mid-transfer: chunks are arriving over the direct mesh. Shows
// a live progress bar until the receiver reassembles and verifies every chunk.
function StreamingAttachment({ att, progress }: { att: FileAttachment; progress: number }) {
  const pct = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 qb-accent-border border bg-[var(--qb-accent-soft)] min-w-[14rem]">
      <div className="flex items-center gap-2 min-w-0">
        <Loader2 size={16} className="qb-accent-text shrink-0 animate-spin" />
        <span className="min-w-0">
          <span className="block text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
          <span className="block text-[9px] font-mono text-slate-400">{formatBytes(att.size)} · receiving {pct}%</span>
        </span>
      </div>
      <div className="h-1 w-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div className="h-full qb-accent-bg transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// A file whose bytes have not arrived yet (empty data, no URL, no error): renders
// a safe placeholder so we never feed an empty base64 blob into an <img>/<video>.
function PendingAttachment({ att }: { att: FileAttachment }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 qb-accent-border border bg-[var(--qb-accent-soft)] min-w-[14rem]">
      <Loader2 size={16} className="qb-accent-text shrink-0 animate-spin" />
      <span className="min-w-0">
        <span className="block text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
        <span className="block text-[9px] font-mono text-slate-400">{formatBytes(att.size)} · awaiting data…</span>
      </span>
    </div>
  );
}

// A streamed transfer that failed authentication — one corrupted chunk rejects
// the whole file, so nothing is rendered or downloadable.
function FailedAttachment({ att, error }: { att: FileAttachment; error: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border border-red-500/30 bg-red-500/5 min-w-[14rem]">
      <Ban size={16} className="text-red-500 shrink-0" />
      <span className="min-w-0">
        <span className="block text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
        <span className="block text-[9px] font-mono text-red-500">{error}</span>
      </span>
    </div>
  );
}

// A received file carrying a password lock. The blob is already E2E-decrypted by
// the ratchet; this gate is the additional password layer — the recipient must
// enter the out-of-band secret to reveal the file.
function LockedAttachment({ att }: { att: FileAttachment }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<FileAttachment | null>(null);

  if (revealed) return <>{renderAttachment(revealed)}</>;

  const unlock = async () => {
    if (!password || !att.enc) return;
    setBusy(true);
    setError(null);
    const bytes = await decryptFileData(att.data, att.enc, password);
    setBusy(false);
    if (!bytes) {
      setError('Wrong password');
      return;
    }
    setRevealed({ name: att.name, mime: att.mime, size: att.size, data: toBase64(bytes) });
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 border border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-2 min-w-0">
        <LockKeyhole size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="min-w-0">
          <span className="block text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
          <span className="block text-[9px] font-mono text-slate-400">{formatBytes(att.size)} · password-protected · {att.enc?.algo}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }}
          placeholder="Enter password to unlock"
          className="flex-1 bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:border-amber-500/50 text-xs font-mono text-slate-700 dark:text-slate-300 px-2 py-1.5"
        />
        <button
          onClick={() => void unlock()}
          disabled={!password || busy}
          className="flex items-center gap-1 text-[10px] font-mono uppercase text-amber-600 dark:text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-30 px-2.5 py-1.5"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />} Unlock
        </button>
      </div>
      {error && <span className="text-[9px] font-mono uppercase text-red-500">{error}</span>}
    </div>
  );
}

// Selects the right attachment view for a message's file, based on transfer state:
// rejected → failed, completed/echoed → rendered, password-locked → gated,
// in-flight → progress bar, ready bytes → rendered, otherwise → pending.
export function MessageAttachment({
  file, fileUrl, fileError, progress,
}: {
  file: FileAttachment;
  fileUrl?: string;
  fileError?: string;
  progress?: number;
}): React.ReactNode {
  if (fileError) return <FailedAttachment att={file} error={fileError} />;
  if (fileUrl) return <>{renderAttachment(file, fileUrl)}</>;
  if (file.enc) return <LockedAttachment att={file} />;
  if (progress !== undefined && progress < 1) return <StreamingAttachment att={file} progress={progress} />;
  if (file.data) return <>{renderAttachment(file)}</>;
  return <PendingAttachment att={file} />;
}
