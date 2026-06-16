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
  const accentColor = msg.from === 'peer-a' ? 'cyan' : 'orange';
  const alignClass = isMe ? 'items-end self-end text-right' : 'items-start self-start text-left';
  const dotColor = accentColor === 'cyan' ? 'bg-cyan-500' : 'bg-orange-500';
  const headColor = accentColor === 'cyan' ? 'text-cyan-600 dark:text-cyan-500' : 'text-orange-600 dark:text-amber-500';
  const borderClass = isMe ? 'border-r-2 border-r-cyan-500' : 'border-l-2 border-l-orange-500';
  const statusText = msg.status === 'seen' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : '...';
  const statusColor = msg.status === 'seen' ? 'text-cyan-500' : 'text-slate-400';
  const deliveredList = msg.deliveredTo.length > 0 ? msg.deliveredTo.map(p => p.replace('peer-', '')).join(', ') : 'None';
  const seenList = msg.seenBy.length > 0 ? msg.seenBy.map(p => p.replace('peer-', '')).join(', ') : 'None';
  const titleText = `Delivered to: ${deliveredList}\nSeen by: ${seenList}`;
  const blurClass = blur ? 'blur-sm hover:blur-none active:blur-none cursor-pointer' : '';

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={`flex flex-col max-w-[85%] ${alignClass} relative group/message`}>
      <div className="flex items-center gap-2 mb-1.5 px-1 text-ui-muted dark:text-slate-600">
        {!isMe && <span className={`w-1.5 h-1.5 ${dotColor}`} />}
        <span className={`text-[10px] font-mono ${headColor} uppercase font-bold tracking-tighter`}>{displayName(msg.from)}</span>
        <span className="text-[9px] font-mono italic">{new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any)}</span>
        {isMe && <span className={`text-[10px] font-mono font-bold ${statusColor}`} title={titleText}>{statusText}</span>}
        {isMe && <span className={`w-1.5 h-1.5 ${dotColor}`} />}
      </div>
      {msg.deleted ? (
        <div className={`p-4 bg-black/[0.02] dark:bg-white/[0.03] border border-dashed border-black/10 dark:border-white/10 ${borderClass} text-sm text-slate-400 dark:text-slate-600 font-mono italic flex items-center gap-2`}>
          <Ban size={13} /> message deleted
        </div>
      ) : isMe && editingNonce === msg.nonce ? (
        <div className={`p-3 bg-black/[0.02] dark:bg-white/[0.03] border border-cyan-500/40 ${borderClass} flex flex-col gap-2`}>
          <textarea
            autoFocus
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommitEdit(msg.nonce); }
              if (e.key === 'Escape') onCancelEdit();
            }}
            rows={2}
            className="w-full bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:border-cyan-500/50 text-sm font-mono text-slate-700 dark:text-slate-300 p-2 resize-none text-left"
          />
          <div className="flex items-center justify-end gap-2">
            <button onClick={onCancelEdit} className="flex items-center gap-1 text-[10px] font-mono uppercase text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1"><X size={12} /> Cancel</button>
            <button onClick={() => onCommitEdit(msg.nonce)} disabled={!editDraft.trim()} className="flex items-center gap-1 text-[10px] font-mono uppercase text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-30 px-2 py-1"><Check size={12} /> Save</button>
          </div>
        </div>
      ) : (
        <div
          className={`p-4 bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 ${borderClass} text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-mono shadow-sm dark:shadow-xl relative overflow-hidden group transition-all duration-300 ${blurClass}`}
          onMouseEnter={() => { if (!isMe) onMarkRead(msg.nonce); }}
          onTouchStart={() => { if (!isMe) onMarkRead(msg.nonce); }}
        >
          <div className="relative z-10">
            {msg.file
              ? <MessageAttachment file={msg.file} fileUrl={msg.fileUrl} fileError={msg.fileError} progress={msg.progress} />
              : (query ? highlightMatches(msg.payload, query) : msg.payload)}
            {msg.locked && <span className="mt-1 flex items-center gap-1 text-[9px] font-mono uppercase text-amber-600 dark:text-amber-400"><LockKeyhole size={10} /> password-protected · share the password separately</span>}
            {msg.edited && <span className="ml-2 text-[9px] text-slate-400 dark:text-slate-600 italic">(edited)</span>}
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-black/[0.01] dark:from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {isMe && (
            <div className="absolute top-1 right-1 z-20 flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
              {!msg.file && <button onClick={() => onBeginEdit(msg.nonce, msg.payload)} title="Edit message" className="p-1 bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400"><Pencil size={11} /></button>}
              <button onClick={() => onDelete(msg.nonce)} title="Delete message" className="p-1 bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 text-slate-500 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
