import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Trash2, ShieldCheck, ShieldAlert, ShieldQuestion, Fingerprint, Radio, Server, Activity, Terminal, X, Share2, QrCode, Search, Pencil, Check, Ban, Paperclip, Download, FileText, Mic, Lock, LockKeyhole, Loader2, HardDriveUpload, UserPlus, UserCheck, Video } from 'lucide-react';
import QRCode from 'qrcode';
import { useRelay } from '../useRelay';
import { normalizeQuery, messageMatches, splitOnQuery } from '../message-search';
import { attachmentKind, attachmentDataUrl, resolveMime, formatBytes, MAX_FILE_BYTES, MAX_P2P_FILE_BYTES, FileAttachment } from '../file-transfer';
import { decryptFileData, FileCipher } from '../file-crypto';
import { toBase64 } from '../crypto/noise-primitives';
import { KeyPair } from '../crypto/noise-xx';
import { VOICE_MIME_CANDIDATES, chooseSupportedMime, voiceFileName } from '../voice-record';
import { useContactVerification } from '../useContactVerification';
import { ContactVerificationPanel, KeyChangeWarning } from './ContactVerification';
import CallView from './CallView';

interface ChatRoomProps {
  sessionId: string;
  sessionName: string | null;
  peerId: string;
  isHost: boolean;
  expiresAt: number | null;
  timeLeft: string;
  isExpired: boolean;
  securityOptions: { blur: boolean };
  reset: () => void;
  identity?: KeyPair | null;
}

function highlightMatches(text: string, query: string): React.ReactNode {
  return splitOnQuery(text, query).map((seg, i) =>
    seg.match
      ? <mark key={i} className="bg-amber-300/70 dark:bg-amber-500/40 text-inherit rounded-sm px-0.5">{seg.text}</mark>
      : <React.Fragment key={i}>{seg.text}</React.Fragment>
  );
}

function renderAttachment(att: import('../file-transfer').FileAttachment, urlOverride?: string): React.ReactNode {
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
    <a href={url} download={att.name} className="flex items-center gap-3 px-3 py-2 border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors">
      <FileText size={20} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
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
    <div className="flex flex-col gap-2 px-3 py-2.5 border border-cyan-500/20 bg-cyan-500/5 min-w-[14rem]">
      <div className="flex items-center gap-2 min-w-0">
        <Loader2 size={16} className="text-cyan-600 dark:text-cyan-400 shrink-0 animate-spin" />
        <span className="min-w-0">
          <span className="block text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
          <span className="block text-[9px] font-mono text-slate-400">{formatBytes(att.size)} · receiving {pct}%</span>
        </span>
      </div>
      <div className="h-1 w-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div className="h-full bg-cyan-500 transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// A file whose bytes have not arrived yet (empty data, no URL, no error): renders
// a safe placeholder so we never feed an empty base64 blob into an <img>/<video>.
function PendingAttachment({ att }: { att: FileAttachment }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border border-cyan-500/20 bg-cyan-500/5 min-w-[14rem]">
      <Loader2 size={16} className="text-cyan-600 dark:text-cyan-400 shrink-0 animate-spin" />
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

function ChatRoom({ sessionId, sessionName, peerId, isHost, expiresAt, timeLeft, isExpired, securityOptions, reset, identity }: ChatRoomProps) {
  const { messages, isConnected, isPending, activePeers, joinRequests, error, isGroup, sendMessage, sendFile, sendLargeFile, editMessage, deleteMessage, sendTyping, markAsRead, acceptJoin, rejectJoin, kickPeer, latencyMs, ioLoad, peerAliases, typingPeers, secured, safetyNumbers, fingerprints, ownFingerprint, p2pPeers, transport, directLinkFailed, peerMemberKeys, peerPinned, myPinned, whitelistRequests, requestWhitelist, acceptWhitelist, declineWhitelist, call, callEligiblePeer } = useRelay(sessionId, peerId, identity);
  const { statuses: verifyStatuses, changedPeers, verify, unverify } = useContactVerification(sessionId, fingerprints);
  const otherPeers = activePeers.filter(p => p !== peerId);
  const messagingBlocked = changedPeers.length > 0;
  // Whitelist trust derivations: a peer is mutual iff we have pinned them and
  // they have pinned us; a peer is in our whitelist group iff they are mutual
  // with us AND mutual with every other member of our mutual set (clique rule —
  // "anyone cannot be added").
  const isMutual = (p: string) => myPinned.includes(p) && (peerPinned[p]?.includes(peerId) ?? false);
  const myMutual = otherPeers.filter(isMutual);
  const pairMutual = (a: string, b: string) => (peerPinned[a]?.includes(b) ?? false) && (peerPinned[b]?.includes(a) ?? false);
  const inWhitelistGroup = (p: string) => isMutual(p) && myMutual.every(m => m === p || pairMutual(m, p));
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<{ t: string; msg: string; color: string }[]>([]);
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showLogs, setShowLogs] = useState(() => localStorage.getItem('qb-show-logs') !== 'false');
  const [editingNonce, setEditingNonce] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pwModal, setPwModal] = useState<{ files: File[]; password: string; confirm: string; algo: FileCipher } | null>(null);
  const protectNextRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const largeFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const shareLink = `${window.location.origin}/join/${sessionId}`;
  const displayName = (id: string) => peerAliases[id] || id.replace('peer-', 'PEER_');
  const trimmedQuery = normalizeQuery(searchQuery);
  const visibleMessages = trimmedQuery
    ? messages.filter(m => messageMatches(m.payload, trimmedQuery))
    : messages;

  useEffect(() => {
    QRCode.toDataURL(shareLink, { margin: 1, width: 240, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [shareLink]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => { localStorage.setItem('qb-show-logs', showLogs ? 'true' : 'false'); }, [showLogs]);

  useEffect(() => {
    const addLog = (msg: string, color: string = 'text-slate-500') => {
      setLogs(prev => [...prev.slice(-20), { t: new Date().toLocaleTimeString([], { hour12: false }), msg, color }]);
    };
    if (isConnected) addLog('WS_CONNECT: [ESTABLISHED]', 'text-emerald-600 dark:text-emerald-500');
    if (error) {
      addLog(`ERR: ${error}`, 'text-red-500');
      if (error.match(/Session destroyed|Join rejected|kicked/)) setTimeout(reset, 2000);
    }
  }, [isConnected, error, reset]);

  const handleSend = (e: React.FormEvent) => { e.preventDefault(); if (!input.trim() || messagingBlocked) return; sendMessage(input); setInput(''); };
  const beginEdit = (nonce: string, current: string) => { setEditingNonce(nonce); setEditDraft(current); };
  const cancelEdit = () => { setEditingNonce(null); setEditDraft(''); };
  const commitEdit = (nonce: string) => {
    const next = editDraft.trim();
    if (next) editMessage(nonce, next);
    cancelEdit();
  };

  const reportFileError = (file: File, error?: string) => {
    setFileError(error === 'File exceeds size limit'
      ? `${file.name} exceeds the ${formatBytes(MAX_FILE_BYTES)} limit`
      : error || 'Upload failed');
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    setFileError(null);
    for (const file of Array.from(files)) {
      const res = await sendFile(file);
      if (!res.ok) reportFileError(file, res.error);
    }
  };

  // Dedicated large-file path: streams each file directly over the WebRTC mesh
  // (sendLargeFile === sendFileStream). The bytes never reach the blind relay —
  // only a tiny key-bearing init envelope is exchanged P2P. No server load.
  const handleLargeFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    setFileError(null);
    for (const file of Array.from(files)) {
      const res = await sendLargeFile(file);
      if (!res.ok) {
        setFileError(res.error === 'File exceeds size limit'
          ? `${file.name} exceeds the ${formatBytes(MAX_P2P_FILE_BYTES)} direct-transfer limit`
          : res.error || 'Direct transfer failed');
      }
    }
  };

  const onPickFiles = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    if (protectNextRef.current) {
      protectNextRef.current = false;
      setPwModal({ files, password: '', confirm: '', algo: 'AES-GCM' });
    } else {
      void handleFiles(files);
    }
  };

  const openFilePicker = (protect: boolean) => {
    protectNextRef.current = protect;
    setAttachMenuOpen(false);
    fileInputRef.current?.click();
  };

  const openLargeFilePicker = () => {
    setAttachMenuOpen(false);
    largeFileInputRef.current?.click();
  };

  const submitProtected = async () => {
    if (!pwModal) return;
    if (!pwModal.password) { setFileError('Password required'); return; }
    if (pwModal.password !== pwModal.confirm) { setFileError('Passwords do not match'); return; }
    const { files, password, algo } = pwModal;
    setPwModal(null);
    setFileError(null);
    for (const file of files) {
      const res = await sendFile(file, { password, algo });
      if (!res.ok) reportFileError(file, res.error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (activePeers.length > 1) void handleFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0 && activePeers.length > 1) { e.preventDefault(); void handleFiles(files); }
  };

  const startRecording = async () => {
    if (isRecording || activePeers.length <= 1) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setFileError('Voice recording is not supported in this browser');
      return;
    }
    const mime = chooseSupportedMime(VOICE_MIME_CANDIDATES, (m) => MediaRecorder.isTypeSupported(m));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type });
        audioStreamRef.current?.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
        if (blob.size > 0) {
          void handleFiles([new File([blob], voiceFileName(type), { type })]);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setFileError('Microphone access denied');
      audioStreamRef.current?.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  useEffect(() => () => { audioStreamRef.current?.getTracks().forEach(t => t.stop()); }, []);
  const copyId = () => { if (!isConnected) return; navigator.clipboard.writeText(sessionId); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyShareLink = () => { navigator.clipboard.writeText(shareLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); };

  return (
    <>
      {(showLeftSidebar || showRightSidebar) && (
        <div className="fixed inset-0 bg-black/60 z-[60] lg:hidden backdrop-blur-sm transition-opacity" onClick={() => { setShowLeftSidebar(false); setShowRightSidebar(false); }} />
      )}

      {/* Left Sidebar */}
      <aside className={`w-72 lg:w-72 border-r border-black/5 dark:border-white/5 bg-ui-aside dark:bg-brand-aside p-6 flex flex-col gap-8 shrink-0 z-[70] overflow-y-auto ${showLeftSidebar ? 'fixed inset-y-0 left-0 shadow-2xl' : 'hidden lg:flex'}`}>
        <button onClick={() => setShowLeftSidebar(false)} className="lg:hidden absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        <section>
          <h3 className="mono-label mb-4 uppercase tracking-widest font-bold">Active Session</h3>
          <div className="space-y-4">
            <div className="p-3 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm dark:shadow-none group cursor-pointer" onClick={copyId}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] text-slate-500 font-mono uppercase">{sessionName ? 'Vault_Name' : 'Vault_Hash'}</div>
                <div className="flex items-center gap-2">
                  {isGroup && <span className="text-[8px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-1 rounded-sm uppercase">GROUP</span>}
                  {copied
                    ? <span className="text-[9px] text-emerald-500 font-mono">✓</span>
                    : <span className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity font-mono">copy</span>
                  }
                </div>
              </div>
              <div className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400 break-all leading-tight italic truncate">{sessionName || sessionId}</div>
              {sessionName && <div className="text-[9px] text-slate-500 font-mono truncate mt-1">ID: {sessionId}</div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 border border-black/5 dark:border-white/5 bg-white dark:bg-white/5 shadow-sm dark:shadow-none">
                <div className="text-[9px] text-slate-500 font-mono text-center">PEER</div>
                <div className="text-xs font-mono text-slate-900 dark:text-white text-center uppercase">{peerId?.replace('peer-', '') || ''}</div>
              </div>
              <div className="p-2 border border-black/5 dark:border-white/5 bg-white dark:bg-white/5 shadow-sm dark:shadow-none">
                <div className="text-[9px] text-slate-500 font-mono text-center">STATUS</div>
                <div className={`text-[10px] font-mono text-center font-bold ${isConnected ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-500'}`}>{isConnected ? 'ONLINE' : 'OFFLINE'}</div>
              </div>
            </div>
            {expiresAt && (
              <div className="p-3 bg-black/[0.02] dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isExpired ? 'bg-red-500' : 'bg-cyan-500'}`} />
                  <span className="text-[9px] text-slate-500 font-mono uppercase">Decay_Timer</span>
                </div>
                <span className={`text-[11px] font-mono font-bold ${isExpired ? 'text-red-500' : 'text-cyan-600 dark:text-cyan-400'}`}>{timeLeft}</span>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="mono-label mb-4 uppercase tracking-widest font-bold flex items-center gap-2"><QrCode size={12} /> Share Vault</h3>
          <div className="space-y-3">
            {qrDataUrl && (
              <div className="p-3 bg-white border border-black/5 dark:border-white/10 flex items-center justify-center">
                <img src={qrDataUrl} alt="Vault join QR code" className="w-full max-w-[180px] aspect-square" />
              </div>
            )}
            <button onClick={copyShareLink} className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[10px] font-mono uppercase tracking-widest transition-colors">
              {linkCopied ? <><Share2 size={12} /> Link_Copied</> : <><Share2 size={12} /> Copy_Share_Link</>}
            </button>
            <p className="text-[9px] font-mono text-slate-500 italic uppercase tracking-tighter leading-relaxed text-center">Scan or share to auto-fill the vault hash</p>
          </div>
        </section>

        <section>
          <h3 className="mono-label mb-4 uppercase tracking-widest font-bold">Relay Interface</h3>
          <ul className="space-y-3">
            <li className="flex items-center justify-between text-[11px]"><span className="font-mono text-slate-500 dark:text-slate-400">ENVELOPE_TYPE</span><span className="text-emerald-600 dark:text-emerald-500">LOCKED</span></li>
            <li className="flex items-center justify-between text-[11px]"><span className="font-mono text-slate-500 dark:text-slate-400">SESSION_MEMORY</span><span className="text-slate-700 dark:text-slate-200 uppercase">Ephem</span></li>
            <li className="flex items-center justify-between text-[11px]"><span className="font-mono text-slate-500 dark:text-slate-400">ZERO_KNOWLEDGE</span><span className="text-emerald-600 dark:text-emerald-500 font-bold italic">ACTIVE</span></li>
            <li className="flex items-center justify-between text-[11px]"><span className="font-mono text-slate-500 dark:text-slate-400">MSG_CRYPTO</span><span className="text-cyan-600 dark:text-cyan-400 font-bold">DoubleRatchet</span></li>
          </ul>
        </section>

        <section>
          <h3 className="mono-label mb-4 uppercase tracking-widest font-bold flex items-center gap-2"><Fingerprint size={12} /> Verify Contacts</h3>
          <ContactVerificationPanel
            peers={otherPeers}
            displayName={displayName}
            statuses={verifyStatuses}
            safetyNumbers={safetyNumbers}
            fingerprints={fingerprints}
            ownFingerprint={ownFingerprint}
            verify={verify}
            unverify={unverify}
          />
        </section>

        {isHost && joinRequests.length > 0 && (
          <section>
            <h3 className="mono-label mb-4 uppercase tracking-widest font-bold text-amber-500">Join Requests</h3>
            <div className="space-y-2">
              {joinRequests.map(req => (
                <div key={req.peerId} className="p-3 bg-amber-500/10 border border-amber-500/20">
                  <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mb-2 truncate">
                    <strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => acceptJoin(req.peerId)} className="flex-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] py-1 border border-emerald-500/30 hover:bg-emerald-500/30">Accept</button>
                    <button onClick={() => rejectJoin(req.peerId)} className="flex-1 bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] py-1 border border-red-500/30 hover:bg-red-500/30">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-auto">
          <div className="p-4 bg-cyan-500/5 dark:bg-cyan-900/10 border border-cyan-500/20 text-center">
            <p className="text-[9px] italic text-cyan-700 dark:text-cyan-200/60 leading-relaxed font-mono uppercase tracking-tighter">Server acts as a passive forwarder. Payloads are never persisted or decrypted. Memory-only store active.</p>
          </div>
        </div>
      </aside>

      {/* Main chat area */}
      <section className="flex-1 flex flex-col bg-ui-bg dark:bg-brand-bg relative min-w-0">
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 bg-ui-elevated dark:bg-brand-elevated">
          <button onClick={() => setShowLeftSidebar(true)} className="flex items-center gap-2 text-[10px] font-mono uppercase text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"><Info size={14} /> Vault Info</button>
          <div className="flex items-center gap-3">
            <button onClick={() => call.startCall()} disabled={!callEligiblePeer || !isConnected || call.callState !== 'idle'} className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-slate-500 enabled:hover:text-cyan-600 dark:enabled:hover:text-cyan-400 disabled:opacity-30 transition-colors" title={callEligiblePeer ? 'Start a 1-on-1 video call' : 'Video calls are available only in 1-on-1 sessions'}><Video size={14} /> Call</button>
            <button onClick={() => setShowSearch(s => !s)} className={`flex items-center gap-1.5 text-[10px] font-mono uppercase transition-colors ${showSearch ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400'}`}><Search size={14} /> Search</button>
            <button onClick={() => setShowRightSidebar(true)} className="flex items-center gap-2 text-[10px] font-mono uppercase text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">Logs <Activity size={14} /></button>
          </div>
        </div>

        {/* Desktop toolbar: call + search + logs toggles */}
        <div className="hidden lg:flex items-center justify-end gap-4 px-6 py-2 border-b border-black/5 dark:border-white/5 bg-ui-elevated dark:bg-brand-elevated">
          <button
            onClick={() => call.startCall()}
            disabled={!callEligiblePeer || !isConnected || call.callState !== 'idle'}
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors text-slate-500 enabled:hover:text-cyan-600 dark:enabled:hover:text-cyan-400 disabled:opacity-30 mr-auto"
            title={callEligiblePeer ? 'Start a 1-on-1 video call' : 'Video calls are available only in 1-on-1 sessions'}
          >
            <Video size={13} /> Video Call
          </button>
          <button onClick={() => setShowSearch(s => !s)} className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${showSearch ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400'}`} title="Search messages">
            <Search size={13} /> Search
          </button>
          <button onClick={() => setShowLogs(s => !s)} className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${showLogs ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'}`} title="Toggle event log (IO &amp; latency stay visible)">
            <Terminal size={13} /> Logs {showLogs ? 'On' : 'Off'}
          </button>
        </div>

        {/* Inline search row (shared mobile + desktop) */}
        {showSearch && (
          <div className="px-4 lg:px-6 py-2 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
            <div className="flex items-center gap-2 bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 focus-within:border-cyan-500/50 transition-colors px-3 py-2 max-w-2xl">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="FILTER_BY_KEYWORD"
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12px] font-mono text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-700"
                autoComplete="off"
              />
              {trimmedQuery && (
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter italic shrink-0">{visibleMessages.length} match{visibleMessages.length === 1 ? '' : 'es'}</span>
              )}
              {searchQuery
                ? <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0" title="Clear search"><X size={13} /></button>
                : <button onClick={() => setShowSearch(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0" title="Close search"><X size={13} /></button>}
            </div>
          </div>
        )}

        {/* Mobile Join Requests */}
        {isHost && joinRequests.length > 0 && (
          <div className="lg:hidden p-4 bg-amber-500/10 border-b border-amber-500/20">
            <h3 className="mono-label mb-2 uppercase tracking-widest font-bold text-amber-500">Join Requests</h3>
            <div className="flex flex-col gap-2">
              {joinRequests.map(req => (
                <div key={req.peerId} className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center bg-white dark:bg-black/20 p-2 border border-amber-500/20">
                  <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 truncate max-w-[200px]"><strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"</div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => acceptJoin(req.peerId)} className="flex-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-3 py-1 border border-emerald-500/30 hover:bg-emerald-500/30">Accept</button>
                    <button onClick={() => rejectJoin(req.peerId)} className="flex-1 bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-3 py-1 border border-red-500/30 hover:bg-red-500/30">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Desktop Join Requests Banner */}
        {isHost && joinRequests.length > 0 && (
          <div className="hidden lg:block px-6 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-[10px] font-mono uppercase tracking-widest font-bold text-amber-500 shrink-0">Join Requests ({joinRequests.length}):</h3>
              {joinRequests.map(req => (
                <div key={req.peerId} className="flex items-center gap-2 bg-white dark:bg-black/20 px-3 py-1.5 border border-amber-500/20">
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 truncate max-w-[180px]"><strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"</span>
                  <button onClick={() => acceptJoin(req.peerId)} className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 border border-emerald-500/30 hover:bg-emerald-500/30 font-mono uppercase">Accept</button>
                  <button onClick={() => rejectJoin(req.peerId)} className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-2 py-0.5 border border-red-500/30 hover:bg-red-500/30 font-mono uppercase">Reject</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePeers.length > 0 && (
          <div className="px-6 py-2 border-b border-black/5 dark:border-white/5 flex items-center gap-2 text-[10px] font-mono bg-black/[0.02] dark:bg-white/[0.02]">
            <span className="text-slate-500 uppercase">In Chat:</span>
            {isGroup && <span className="px-2 py-0.5 rounded-sm bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold ml-1 uppercase">GROUP</span>}
            {activePeers.length > 1 && (secured
              ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold uppercase" title="Noise_XX handshake complete — E2E encrypted."><ShieldCheck size={11} /> E2E_SECURED</span>
              : <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold uppercase animate-pulse" title="Establishing Noise_XX handshakes..."><ShieldAlert size={11} /> HANDSHAKING</span>
            )}
            {activePeers.length > 1 && (transport === 'p2p'
              ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-bold uppercase" title="Direct P2P data channel."><Radio size={11} /> DIRECT_P2P</span>
              : <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 font-bold uppercase" title="Via (blind) WS relay."><Server size={11} /> VIA_RELAY</span>
            )}
            {activePeers.length > 1 && directLinkFailed && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 font-bold uppercase animate-pulse" title="A direct peer-to-peer link could not be established (no STUN/NAT path). Large files & video cannot be sent — they are never relayed through the server."><Ban size={11} /> DIRECT_LINK_FAILED</span>
            )}
            <div className="flex gap-2 overflow-x-auto custom-scrollbar no-scrollbar ml-2">
              {activePeers.map(p => (
                <span key={p} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${p === peerId ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'}`}>
                  {p === peerId ? `${displayName(p)} (You)` : displayName(p)}
                  {p !== peerId && safetyNumbers[p] && (verifyStatuses[p] === 'verified'
                    ? <span className="text-emerald-600 dark:text-emerald-400 cursor-help" title={`Verified · Safety number:\n${safetyNumbers[p]}`}><ShieldCheck size={11} /></span>
                    : verifyStatuses[p] === 'changed'
                      ? <span className="text-red-500 cursor-help animate-pulse" title={`KEY CHANGED — re-verify · Safety number:\n${safetyNumbers[p]}`}><ShieldAlert size={11} /></span>
                      : <span className="text-amber-500 cursor-help" title={`Unverified — compare out of band · Safety number:\n${safetyNumbers[p]}`}><ShieldQuestion size={11} /></span>
                  )}
                  {p !== peerId && (p2pPeers.includes(p)
                    ? <span className="text-cyan-600 dark:text-cyan-400 cursor-help" title="Direct P2P"><Radio size={11} /></span>
                    : <span className="text-slate-400 dark:text-slate-500 cursor-help" title="Relayed"><Server size={11} /></span>
                  )}
                  {p !== peerId && peerMemberKeys[p] && (
                    inWhitelistGroup(p)
                      ? <span className="text-emerald-600 dark:text-emerald-400 cursor-help" title="Whitelisted — mutual with you and every group member"><UserCheck size={11} /></span>
                      : isMutual(p)
                        ? <span className="text-amber-500 cursor-help" title="Mutually whitelisted with you — not yet mutual with every group member"><UserCheck size={11} /></span>
                        : <button onClick={() => requestWhitelist(p)} className="text-slate-400 hover:text-emerald-500 transition-colors ml-0.5" title="Request to whitelist — they must accept"><UserPlus size={11} /></button>
                  )}
                  {isHost && isGroup && p !== peerId && <button onClick={() => kickPeer(p)} className="hover:text-red-500 transition-colors ml-0.5" title="Kick user">✕</button>}
                </span>
              ))}
            </div>
          </div>
        )}

        {whitelistRequests.length > 0 && (
          <div className="px-4 lg:px-6 py-3 bg-emerald-500/10 border-b border-emerald-500/20">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[10px] font-mono uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1.5"><UserPlus size={12} /> Whitelist Requests:</h3>
              {whitelistRequests.map(req => (
                <div key={req.peerId} className="flex items-center gap-2 bg-white dark:bg-black/20 px-3 py-1.5 border border-emerald-500/20">
                  <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 truncate max-w-[200px]"><strong>{req.label || displayName(req.peerId)}</strong> wants to whitelist you</span>
                  <button onClick={() => acceptWhitelist(req.peerId)} className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 border border-emerald-500/30 hover:bg-emerald-500/30 font-mono uppercase">Accept</button>
                  <button onClick={() => declineWhitelist(req.peerId)} className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-2 py-0.5 border border-red-500/30 hover:bg-red-500/30 font-mono uppercase">Decline</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar relative"
          onDragOver={(e) => { if (activePeers.length > 1) { e.preventDefault(); setIsDragging(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragging(false); }}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-2 z-30 border-2 border-dashed border-cyan-500/60 bg-cyan-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <span className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-mono text-xs uppercase tracking-widest"><Paperclip size={16} /> Drop to encrypt &amp; relay</span>
            </div>
          )}
          <AnimatePresence initial={false}>
            {visibleMessages.map((msg, i) => {
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
              const blurClass = securityOptions.blur ? 'blur-sm hover:blur-none active:blur-none cursor-pointer' : '';

              return (
                <motion.div key={`${msg.nonce}-${i}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={`flex flex-col max-w-[85%] ${alignClass} relative group/message`}>
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
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(msg.nonce); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        rows={2}
                        className="w-full bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:border-cyan-500/50 text-sm font-mono text-slate-700 dark:text-slate-300 p-2 resize-none text-left"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={cancelEdit} className="flex items-center gap-1 text-[10px] font-mono uppercase text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1"><X size={12} /> Cancel</button>
                        <button onClick={() => commitEdit(msg.nonce)} disabled={!editDraft.trim()} className="flex items-center gap-1 text-[10px] font-mono uppercase text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-30 px-2 py-1"><Check size={12} /> Save</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`p-4 bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 ${borderClass} text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-mono shadow-sm dark:shadow-xl relative overflow-hidden group transition-all duration-300 ${blurClass}`}
                      onMouseEnter={() => { if (!isMe) markAsRead(msg.nonce); }}
                      onTouchStart={() => { if (!isMe) markAsRead(msg.nonce); }}
                    >
                      <div className="relative z-10">
                        {msg.file
                          ? (msg.fileError
                              ? <FailedAttachment att={msg.file} error={msg.fileError} />
                              : msg.fileUrl
                                ? renderAttachment(msg.file, msg.fileUrl)
                                : msg.file.enc
                                  ? <LockedAttachment att={msg.file} />
                                  : (msg.progress !== undefined && msg.progress < 1)
                                    ? <StreamingAttachment att={msg.file} progress={msg.progress} />
                                    : msg.file.data
                                      ? renderAttachment(msg.file)
                                      : <PendingAttachment att={msg.file} />)
                          : (trimmedQuery ? highlightMatches(msg.payload, trimmedQuery) : msg.payload)}
                        {msg.locked && <span className="mt-1 flex items-center gap-1 text-[9px] font-mono uppercase text-amber-600 dark:text-amber-400"><LockKeyhole size={10} /> password-protected · share the password separately</span>}
                        {msg.edited && <span className="ml-2 text-[9px] text-slate-400 dark:text-slate-600 italic">(edited)</span>}
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-br from-black/[0.01] dark:from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      {isMe && (
                        <div className="absolute top-1 right-1 z-20 flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
                          {!msg.file && <button onClick={() => beginEdit(msg.nonce, msg.payload)} title="Edit message" className="p-1 bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400"><Pencil size={11} /></button>}
                          <button onClick={() => deleteMessage(msg.nonce)} title="Delete message" className="p-1 bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 text-slate-500 hover:text-red-500"><Trash2 size={11} /></button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          <div ref={scrollRef} className="shrink-0" />

          {isPending ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
              <Activity size={48} className="mb-4 text-amber-400 animate-pulse" />
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-500">Waiting for host approval...</p>
            </div>
          ) : trimmedQuery && visibleMessages.length === 0 && messages.length > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-40">
              <Search size={48} className="mb-4 text-slate-400 dark:text-slate-600" />
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">No messages match "{searchQuery.trim()}"</p>
            </div>
          ) : messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-30">
              <Activity size={48} className="mb-4 text-slate-400 dark:text-slate-600" />
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">Waiting for encrypted handshakes...</p>
            </div>
          )}
        </div>

        <AnimatePresence>
          {typingPeers.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="px-6 py-1.5 flex items-center gap-2 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 shrink-0">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1 h-1 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1 h-1 rounded-full bg-cyan-500 animate-bounce" />
              </span>
              <span className="uppercase tracking-tighter italic truncate">{typingPeers.map(displayName).join(', ')} {typingPeers.length > 1 ? 'are' : 'is'} typing...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="border-t border-black/5 dark:border-white/5 p-4 shrink-0 bg-ui-elevated dark:bg-brand-elevated">
          {fileError && (
            <div className="max-w-5xl mx-auto mb-2 flex items-center justify-between gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-mono uppercase tracking-tighter">
              <span className="truncate">{fileError}</span>
              <button onClick={() => setFileError(null)} className="shrink-0 hover:text-red-800 dark:hover:text-red-200"><X size={12} /></button>
            </div>
          )}
          {isRecording && (
            <div className="max-w-5xl mx-auto mb-2 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-mono uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Recording — release to encrypt &amp; send
            </div>
          )}
          {activePeers.length > 1 && directLinkFailed && (
            <div className="max-w-5xl mx-auto mb-2 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-mono uppercase tracking-tighter">
              <Ban size={12} className="shrink-0" />
              <span>Direct P2P link unavailable — large files &amp; video cannot be sent until a peer-to-peer connection is established.</span>
            </div>
          )}
          <form onSubmit={handleSend} className="h-12 flex gap-4 max-w-5xl mx-auto">
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
              onChange={(e) => { void handleLargeFiles(e.target.files); e.target.value = ''; }}
            />
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachMenuOpen(o => !o)}
                disabled={!isConnected || activePeers.length <= 1 || isPending || messagingBlocked}
                title={`Attach a file — up to ${formatBytes(MAX_FILE_BYTES)} via encrypted relay, or up to ${formatBytes(MAX_P2P_FILE_BYTES)} direct P2P (large files)`}
                className="h-full px-4 border border-black/10 dark:border-white/10 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-500/40 transition-colors disabled:opacity-20 flex items-center"
              >
                <Paperclip size={16} />
              </button>
              {attachMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[80]" onClick={() => setAttachMenuOpen(false)} />
                  <div className="absolute bottom-full mb-2 left-0 z-[90] w-60 bg-ui-elevated dark:bg-brand-elevated border border-black/10 dark:border-white/10 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => openFilePicker(true)}
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
                      onClick={() => openFilePicker(false)}
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
                      onClick={openLargeFilePicker}
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
              onMouseDown={() => void startRecording()}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={(e) => { e.preventDefault(); void startRecording(); }}
              onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
              disabled={!isConnected || activePeers.length <= 1 || isPending || messagingBlocked}
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
                onChange={(e) => { setInput(e.target.value); sendTyping(); }}
                onPaste={handlePaste}
                placeholder={messagingBlocked ? 'Messaging blocked — re-verify contact' : 'Type encrypted payload...'}
                className="flex-1 bg-transparent border-none outline-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-700"
                autoComplete="off"
                disabled={activePeers.length <= 1 || isPending || messagingBlocked}
              />
            </div>
            <button type="submit" disabled={!isConnected || !input.trim() || activePeers.length <= 1 || isPending || messagingBlocked} className="bg-slate-900 dark:bg-white text-white dark:text-black px-10 font-mono text-xs font-bold uppercase transition-all enabled:hover:bg-cyan-600 dark:enabled:hover:bg-cyan-400 disabled:opacity-20 flex items-center gap-2">
              Relay<Terminal size={14} />
            </button>
          </form>
        </div>
      </section>

      {pwModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPwModal(null)}>
          <div className="w-full max-w-md bg-ui-elevated dark:bg-brand-elevated border border-black/10 dark:border-white/10 shadow-2xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <LockKeyhole size={18} className="text-amber-600 dark:text-amber-400" />
              <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">Password protect</h3>
              <button onClick={() => setPwModal(null)} className="ml-auto text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={16} /></button>
            </div>
            <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
              {pwModal.files.length === 1 ? pwModal.files[0].name : `${pwModal.files.length} files`} will be encrypted with this password on top of the end-to-end channel. Share the password through a separate channel — it is never sent through the vault.
            </p>
            <input
              type="password"
              autoFocus
              value={pwModal.password}
              onChange={(e) => setPwModal(m => m && { ...m, password: e.target.value })}
              placeholder="Password"
              className="bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:border-amber-500/50 text-sm font-mono text-slate-700 dark:text-slate-300 px-3 py-2"
            />
            <input
              type="password"
              value={pwModal.confirm}
              onChange={(e) => setPwModal(m => m && { ...m, confirm: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void submitProtected(); }}
              placeholder="Confirm password"
              className="bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:border-amber-500/50 text-sm font-mono text-slate-700 dark:text-slate-300 px-3 py-2"
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Cipher</span>
              <div className="grid grid-cols-2 gap-2">
                {(['AES-GCM', 'ChaCha20-Poly1305'] as FileCipher[]).map(algo => (
                  <button
                    key={algo}
                    type="button"
                    onClick={() => setPwModal(m => m && { ...m, algo })}
                    className={`px-3 py-2 text-[10px] font-mono uppercase border transition-colors ${pwModal.algo === algo ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-black/10 dark:border-white/10 text-slate-500 hover:border-amber-500/30'}`}
                  >
                    {algo}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setPwModal(null)} className="text-[10px] font-mono uppercase text-slate-500 hover:text-slate-900 dark:hover:text-white px-3 py-2">Cancel</button>
              <button
                onClick={() => void submitProtected()}
                disabled={!pwModal.password || pwModal.password !== pwModal.confirm}
                className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold text-white dark:text-black bg-amber-600 dark:bg-amber-400 enabled:hover:bg-amber-500 disabled:opacity-30 px-4 py-2"
              >
                <Lock size={12} /> Encrypt &amp; Send
              </button>
            </div>
          </div>
        </div>
      )}

      <CallView call={call} displayName={displayName} />

      {call.callError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[130] flex items-center gap-2 px-4 py-2 bg-red-500/90 text-white text-[10px] font-mono uppercase tracking-widest shadow-2xl">
          <Ban size={12} /> {call.callError}
          <button onClick={() => call.endCall()} className="ml-2 hover:opacity-70"><X size={12} /></button>
        </div>
      )}

      <KeyChangeWarning
        changedPeers={changedPeers}
        displayName={displayName}
        safetyNumbers={safetyNumbers}
        fingerprints={fingerprints}
        verify={verify}
        unverify={unverify}
      />

      {/* Right Sidebar (Event Logs + always-on metrics) */}
      <aside className={`w-72 border-l border-black/5 dark:border-white/5 bg-ui-aside dark:bg-brand-aside p-4 flex flex-col shrink-0 z-[70] ${showLogs || showRightSidebar ? 'lg:w-64' : 'lg:w-48'} ${showRightSidebar ? 'fixed inset-y-0 right-0 shadow-2xl overflow-y-auto' : 'hidden lg:flex'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="mono-label uppercase tracking-widest font-bold flex items-center gap-2">{(showLogs || showRightSidebar) ? 'Event Log' : 'Metrics'}</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLogs(s => !s)} className="hidden lg:inline text-[9px] font-mono uppercase tracking-widest text-slate-400 hover:text-emerald-500 transition-colors" title="Toggle event log">{showLogs ? 'Hide' : 'Show'}</button>
            <button onClick={() => setShowRightSidebar(false)} className="lg:hidden text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
          </div>
        </div>
        {(showLogs || showRightSidebar) && (
          <div className="flex-1 font-mono text-[10px] space-y-3 opacity-60 overflow-y-auto custom-scrollbar italic leading-tight">
            {logs.map((log, i) => <div key={i} className={log.color}>[{log.t}] {log.msg}</div>)}
            <div className="text-slate-500 dark:text-slate-600 animate-pulse uppercase tracking-tight">[HANDSHAKE_WAIT] - Listening...</div>
          </div>
        )}
        <div className="pt-4 mt-4 border-t border-black/5 dark:border-white/5">
          <div className="flex justify-between items-end">
            <div>
              <div className="text-[9px] text-slate-500 font-mono uppercase">IO_LOAD</div>
              <div className="text-base font-mono text-slate-900 dark:text-white">{ioLoad.toFixed(3)}%</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-slate-500 font-mono uppercase">LATENCY</div>
              <div className={`text-base font-mono tracking-tighter ${latencyMs === null ? 'text-slate-400 dark:text-slate-600' : latencyMs < 50 ? 'text-emerald-600 dark:text-emerald-400' : latencyMs < 150 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                {latencyMs === null ? '—' : `${latencyMs}ms`}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default ChatRoom;
