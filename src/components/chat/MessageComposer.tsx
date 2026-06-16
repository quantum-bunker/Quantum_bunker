import React, { RefObject } from 'react';
import { Ban, HardDriveUpload, Lock, LockKeyhole, Mic, Paperclip, ShieldCheck, Terminal, X } from 'lucide-react';
import { formatBytes, MAX_FILE_BYTES, MAX_P2P_FILE_BYTES } from '../../file-transfer';

// Message input bar: file/voice/large-file attach controls plus the text relay
// form. Holds no transfer logic — all actions are delegated to the parent.
export function MessageComposer({
  input, onInputChange, onSubmit, onTyping, onPaste,
  isConnected, peerCount, isPending, messagingBlocked, directLinkFailed,
  attachMenuOpen, onToggleAttachMenu, onCloseAttachMenu,
  fileInputRef, largeFileInputRef, onPickFiles, onLargeFiles, onOpenFilePicker, onOpenLargeFilePicker,
  isRecording, onStartRecording, onStopRecording,
  fileError, onClearFileError,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onTyping: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
  isConnected: boolean;
  peerCount: number;
  isPending: boolean;
  messagingBlocked: boolean;
  directLinkFailed: boolean;
  attachMenuOpen: boolean;
  onToggleAttachMenu: () => void;
  onCloseAttachMenu: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  largeFileInputRef: RefObject<HTMLInputElement>;
  onPickFiles: (files: FileList | null) => void;
  onLargeFiles: (files: FileList | null) => void;
  onOpenFilePicker: (protect: boolean) => void;
  onOpenLargeFilePicker: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  fileError: string | null;
  onClearFileError: () => void;
}) {
  const disabled = !isConnected || peerCount <= 1 || isPending || messagingBlocked;
  return (
    <div className="border-t border-black/5 dark:border-white/5 p-4 shrink-0 bg-ui-elevated dark:bg-brand-elevated">
      {fileError && (
        <div className="max-w-5xl mx-auto mb-2 flex items-center justify-between gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-mono uppercase tracking-tighter">
          <span className="truncate">{fileError}</span>
          <button onClick={onClearFileError} className="shrink-0 hover:text-red-800 dark:hover:text-red-200"><X size={12} /></button>
        </div>
      )}
      {isRecording && (
        <div className="max-w-5xl mx-auto mb-2 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-mono uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Recording — release to encrypt &amp; send
        </div>
      )}
      {peerCount > 1 && directLinkFailed && (
        <div className="max-w-5xl mx-auto mb-2 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-mono uppercase tracking-tighter">
          <Ban size={12} className="shrink-0" />
          <span>Direct P2P link unavailable — large files &amp; video cannot be sent until a peer-to-peer connection is established.</span>
        </div>
      )}
      <form onSubmit={onSubmit} className="h-12 flex gap-4 max-w-5xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { onPickFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={largeFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { onLargeFiles(e.target.files); e.target.value = ''; }}
        />
        <div className="relative">
          <button
            type="button"
            onClick={onToggleAttachMenu}
            disabled={disabled}
            title={`Attach a file — up to ${formatBytes(MAX_FILE_BYTES)} via encrypted relay, or up to ${formatBytes(MAX_P2P_FILE_BYTES)} direct P2P (large files)`}
            className="h-full px-4 border border-black/10 dark:border-white/10 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-500/40 transition-colors disabled:opacity-20 flex items-center"
          >
            <Paperclip size={16} />
          </button>
          {attachMenuOpen && (
            <>
              <div className="fixed inset-0 z-[80]" onClick={onCloseAttachMenu} />
              <div className="absolute bottom-full mb-2 left-0 z-[90] w-60 bg-ui-elevated dark:bg-brand-elevated border border-black/10 dark:border-white/10 shadow-2xl">
                <button
                  type="button"
                  onClick={() => onOpenFilePicker(true)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-amber-500/10 transition-colors border-b border-black/5 dark:border-white/5"
                >
                  <LockKeyhole size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-200">Password protected</span>
                    <span className="block text-[9px] font-mono text-slate-400">E2E encrypted + an extra password lock</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFilePicker(false)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-cyan-500/10 transition-colors border-b border-black/5 dark:border-white/5"
                >
                  <ShieldCheck size={15} className="text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-200">Send regular</span>
                    <span className="block text-[9px] font-mono text-slate-400">E2E encrypted end-to-end</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenLargeFilePicker}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-violet-500/10 transition-colors"
                >
                  <HardDriveUpload size={15} className="text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-200">Send large file</span>
                    <span className="block text-[9px] font-mono text-slate-400">Direct P2P up to {formatBytes(MAX_P2P_FILE_BYTES)} — never touches the server</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onMouseDown={onStartRecording}
          onMouseUp={onStopRecording}
          onMouseLeave={onStopRecording}
          onTouchStart={(e) => { e.preventDefault(); onStartRecording(); }}
          onTouchEnd={(e) => { e.preventDefault(); onStopRecording(); }}
          disabled={disabled}
          title="Hold to record a voice message, release to send"
          className={`px-4 border transition-colors disabled:opacity-20 flex items-center select-none ${isRecording ? 'border-red-500/60 bg-red-500/15 text-red-500 animate-pulse' : 'border-black/10 dark:border-white/10 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-500/40'}`}
        >
          <Mic size={16} />
        </button>
        <div className="flex-1 bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 focus-within:border-cyan-500/50 transition-colors flex items-center px-4 font-mono text-sm group">
          <span className="text-cyan-600 dark:text-cyan-500 mr-3 select-none">$</span>
          <input
            type="text"
            value={input}
            onChange={(e) => { onInputChange(e.target.value); onTyping(); }}
            onPaste={onPaste}
            placeholder={messagingBlocked ? 'Messaging blocked — re-verify contact' : 'Type encrypted payload...'}
            className="flex-1 bg-transparent border-none outline-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-700"
            autoComplete="off"
            disabled={peerCount <= 1 || isPending || messagingBlocked}
          />
        </div>
        <button type="submit" disabled={!isConnected || !input.trim() || peerCount <= 1 || isPending || messagingBlocked} className="bg-slate-900 dark:bg-white text-white dark:text-black px-10 font-mono text-xs font-bold uppercase transition-all enabled:hover:bg-cyan-600 dark:enabled:hover:bg-cyan-400 disabled:opacity-20 flex items-center gap-2">
          Relay<Terminal size={14} />
        </button>
      </form>
    </div>
  );
}
