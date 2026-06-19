import React, { RefObject } from 'react';
import { Ban, HardDriveUpload, LockKeyhole, Mic, Paperclip, Send, ShieldCheck, Terminal, X } from 'lucide-react';
import { formatBytes, MAX_FILE_BYTES, MAX_P2P_FILE_BYTES } from '../../file-transfer';

// Message input bar: file/voice/large-file attach controls plus the text relay
// form. Holds no transfer logic — all actions are delegated to the parent.
export function MessageComposer({
  classic = false,
  input, onInputChange, onSubmit, onTyping, onPaste,
  isConnected, peerCount, isPending, messagingBlocked, directLinkFailed,
  attachMenuOpen, onToggleAttachMenu, onCloseAttachMenu,
  fileInputRef, largeFileInputRef, onPickFiles, onLargeFiles, onOpenFilePicker, onOpenLargeFilePicker,
  isRecording, onStartRecording, onStopRecording,
  fileError, onClearFileError,
}: {
  classic?: boolean;
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
  fileInputRef: RefObject<HTMLInputElement | null>;
  largeFileInputRef: RefObject<HTMLInputElement | null>;
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
    <div className="qb-surface border-t p-4 shrink-0">
      {fileError && (
        <div className="qb-label max-w-5xl mx-auto mb-2 flex items-center justify-between gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px]">
          <span className="truncate">{fileError}</span>
          <button onClick={onClearFileError} className="shrink-0 hover:text-red-800 dark:hover:text-red-200"><X size={12} /></button>
        </div>
      )}
      {isRecording && (
        <div className="qb-label max-w-5xl mx-auto mb-2 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px]">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Recording — release to encrypt &amp; send
        </div>
      )}
      {peerCount > 1 && directLinkFailed && (
        <div className="qb-label max-w-5xl mx-auto mb-2 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px]">
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
            className="qb-btn h-full px-4 disabled:opacity-20 flex items-center"
          >
            <Paperclip size={16} />
          </button>
          {attachMenuOpen && (
            <>
              <div className="fixed inset-0 z-[80]" onClick={onCloseAttachMenu} />
              <div className="qb-panel absolute bottom-full mb-2 left-0 z-[90] w-60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => onOpenFilePicker(true)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-amber-500/10 transition-colors border-b qb-border"
                >
                  <LockKeyhole size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="qb-title block text-xs font-bold">Password protected</span>
                    <span className="qb-muted block text-[9px]">E2E encrypted + an extra password lock</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFilePicker(false)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:qb-accent-soft-bg transition-colors border-b qb-border"
                >
                  <ShieldCheck size={15} className="qb-accent-text shrink-0 mt-0.5" />
                  <span>
                    <span className="qb-title block text-xs font-bold">Send regular</span>
                    <span className="qb-muted block text-[9px]">E2E encrypted end-to-end</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenLargeFilePicker}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-violet-500/10 transition-colors"
                >
                  <HardDriveUpload size={15} className="text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="qb-title block text-xs font-bold">Send large file</span>
                    <span className="qb-muted block text-[9px]">Direct P2P up to {formatBytes(MAX_P2P_FILE_BYTES)} — never touches the server</span>
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
          className={`px-4 qb-rounded-sm border transition-colors disabled:opacity-20 flex items-center select-none ${isRecording ? 'border-red-500/60 bg-red-500/15 text-red-500 animate-pulse' : 'qb-border text-slate-500 hover:qb-accent-text hover:qb-accent-border'}`}
        >
          <Mic size={16} />
        </button>
        <div className="qb-input flex-1 flex items-center px-4 text-sm group">
          {!classic && <span className="qb-accent-text mr-3 select-none">$</span>}
          <input
            type="text"
            value={input}
            onChange={(e) => { onInputChange(e.target.value); onTyping(); }}
            onPaste={onPaste}
            placeholder={messagingBlocked ? 'Messaging blocked — re-verify contact' : classic ? 'Write a message…' : 'Type encrypted payload...'}
            className="flex-1 bg-transparent border-none outline-none qb-text placeholder:opacity-60"
            autoComplete="off"
            disabled={peerCount <= 1 || isPending || messagingBlocked}
          />
        </div>
        <button type="submit" disabled={!isConnected || !input.trim() || peerCount <= 1 || isPending || messagingBlocked} className={`qb-btn-accent text-xs font-bold flex items-center gap-2 ${classic ? 'px-8' : 'px-10'}`}>
          {classic ? <>Send<Send size={14} /></> : <>Relay<Terminal size={14} /></>}
        </button>
      </form>
    </div>
  );
}
