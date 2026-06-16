import React from 'react';
import { motion } from 'motion/react';
import { Ban, Check, LockKeyhole, Pencil, Trash2, X } from 'lucide-react';
import { splitOnQuery } from '../../message-search';
import { LocalMessage } from '../../useRelay';
import { MessageAttachment } from './MessageAttachment';

function highlightMatches(text: string, query: string): React.ReactNode {
  return splitOnQuery(text, query).map((seg, i) =>
    seg.match
      ? <mark key={i} className="bg-amber-300/70 dark:bg-amber-500/40 text-inherit rounded-sm px-0.5">{seg.text}</mark>
      : <React.Fragment key={i}>{seg.text}</React.Fragment>
  );
}

export function MessageBubble({
  msg, peerId, displayName, blur, query,
  editingNonce, editDraft, onEditDraftChange, onBeginEdit, onCancelEdit, onCommitEdit,
  onDelete, onMarkRead,
}: {
  msg: LocalMessage;
  peerId: string;
  displayName: (id: string) => string;
  blur: boolean;
  query: string;
  editingNonce: string | null;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onBeginEdit: (nonce: string, current: string) => void;
  onCancelEdit: () => void;
  onCommitEdit: (nonce: string) => void;
  onDelete: (nonce: string) => void;
  onMarkRead: (nonce: string) => void;
}) {
  const isMe = msg.from === peerId;
  const accentColor = msg.from === 'peer-a' ? 'accent' : 'orange';
  const alignClass = isMe ? 'items-end self-end text-right' : 'items-start self-start text-left';
  const dotColor = accentColor === 'accent' ? 'qb-accent-bg' : 'bg-orange-500';
  const headColor = accentColor === 'accent' ? 'qb-accent-text' : 'text-orange-600 dark:text-amber-500';
  const borderClass = isMe ? 'border-r-2' : 'border-l-2 border-l-orange-500';
  const borderStyle = isMe ? { borderRightColor: 'var(--qb-accent)' } : undefined;
  const statusText = msg.status === 'seen' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : '...';
  const statusColor = msg.status === 'seen' ? 'qb-accent-text' : 'text-slate-400';
  const deliveredList = msg.deliveredTo.length > 0 ? msg.deliveredTo.map(p => p.replace('peer-', '')).join(', ') : 'None';
  const seenList = msg.seenBy.length > 0 ? msg.seenBy.map(p => p.replace('peer-', '')).join(', ') : 'None';
  const titleText = `Delivered to: ${deliveredList}\nSeen by: ${seenList}`;
  const blurClass = blur ? 'blur-sm hover:blur-none active:blur-none cursor-pointer' : '';

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={`flex flex-col max-w-[85%] ${alignClass} relative group/message`}>
      <div className="flex items-center gap-2 mb-1.5 px-1 qb-muted">
        {!isMe && <span className={`w-1.5 h-1.5 ${dotColor}`} />}
        <span className={`text-[10px] ${headColor} font-bold tracking-tighter`} style={{ fontFamily: 'var(--qb-font)', textTransform: 'var(--qb-label-tt)' }}>{displayName(msg.from)}</span>
        <span className="text-[9px] italic" style={{ fontFamily: 'var(--qb-font)' }}>{new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any)}</span>
        {isMe && <span className={`text-[10px] font-bold ${statusColor}`} style={{ fontFamily: 'var(--qb-font)' }} title={titleText}>{statusText}</span>}
        {isMe && <span className={`w-1.5 h-1.5 ${dotColor}`} />}
      </div>
      {msg.deleted ? (
        <div className={`qb-bubble p-4 border-dashed ${borderClass}`} style={borderStyle}>
          <span className="text-sm text-slate-400 dark:text-slate-600 italic flex items-center gap-2"><Ban size={13} /> message deleted</span>
        </div>
      ) : isMe && editingNonce === msg.nonce ? (
        <div className={`qb-bubble p-3 ${borderClass}`} style={{ borderColor: 'var(--qb-accent)', ...borderStyle }}>
          <textarea
            autoFocus
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommitEdit(msg.nonce); }
              if (e.key === 'Escape') onCancelEdit();
            }}
            rows={2}
            className="qb-input w-full text-sm p-2 resize-none text-left"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button onClick={onCancelEdit} className="flex items-center gap-1 text-[10px] qb-label hover:qb-title px-2 py-1"><X size={12} /> Cancel</button>
            <button onClick={() => onCommitEdit(msg.nonce)} disabled={!editDraft.trim()} className="qb-btn-accent flex items-center gap-1 text-[10px] disabled:opacity-30 px-2 py-1"><Check size={12} /> Save</button>
          </div>
        </div>
      ) : (
        <div
          className={`qb-bubble p-4 ${borderClass} text-sm leading-relaxed shadow-sm dark:shadow-xl relative overflow-hidden group transition-all duration-300 ${blurClass}`}
          style={borderStyle}
          onMouseEnter={() => { if (!isMe) onMarkRead(msg.nonce); }}
          onTouchStart={() => { if (!isMe) onMarkRead(msg.nonce); }}
        >
          <div className="relative z-10">
            {msg.file
              ? <MessageAttachment file={msg.file} fileUrl={msg.fileUrl} fileError={msg.fileError} progress={msg.progress} />
              : (query ? highlightMatches(msg.payload, query) : msg.payload)}
            {msg.locked && <span className="qb-label mt-1 flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400"><LockKeyhole size={10} /> password-protected · share the password separately</span>}
            {msg.edited && <span className="ml-2 text-[9px] text-slate-400 dark:text-slate-600 italic">(edited)</span>}
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-black/[0.01] dark:from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {isMe && (
            <div className="absolute top-1 right-1 z-20 flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
              {!msg.file && <button onClick={() => onBeginEdit(msg.nonce, msg.payload)} title="Edit message" className="p-1 bg-white/80 dark:bg-black/60 border qb-border text-slate-500 hover:qb-accent-text"><Pencil size={11} /></button>}
              <button onClick={() => onDelete(msg.nonce)} title="Delete message" className="p-1 bg-white/80 dark:bg-black/60 border qb-border text-slate-500 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
