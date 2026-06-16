import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, ShieldCheck, ShieldAlert, ShieldQuestion, Radio, Server, Activity, Terminal, X, Search, Ban, Paperclip, UserPlus, UserCheck, Video } from 'lucide-react';
import QRCode from 'qrcode';
import { useRelay } from '../useRelay';
import { normalizeQuery, messageMatches } from '../message-search';
import { formatBytes, MAX_FILE_BYTES, MAX_P2P_FILE_BYTES } from '../file-transfer';
import { FileCipher } from '../file-crypto';
import { KeyPair } from '../crypto/noise-xx';
import { VOICE_MIME_CANDIDATES, chooseSupportedMime, voiceFileName } from '../voice-record';
import { useContactVerification } from '../useContactVerification';
import { KeyChangeWarning } from './ContactVerification';
import CallView from './CallView';
import { VaultSidebar } from './chat/VaultSidebar';
import { JoinRequests } from './chat/JoinRequests';
import { WhitelistRequests } from './chat/WhitelistRequests';
import { EventLogSidebar, LogEntry } from './chat/EventLogSidebar';
import { MessageBubble } from './chat/MessageBubble';
import { MessageComposer } from './chat/MessageComposer';
import { PasswordModal, PasswordModalState } from './chat/PasswordModal';

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
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
  const [pwModal, setPwModal] = useState<PasswordModalState | null>(null);
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

      <VaultSidebar
        open={showLeftSidebar}
        onClose={() => setShowLeftSidebar(false)}
        sessionId={sessionId}
        sessionName={sessionName}
        peerId={peerId}
        isGroup={isGroup}
        isConnected={isConnected}
        copied={copied}
        onCopyId={copyId}
        expiresAt={expiresAt}
        isExpired={isExpired}
        timeLeft={timeLeft}
        qrDataUrl={qrDataUrl}
        linkCopied={linkCopied}
        onCopyShareLink={copyShareLink}
        otherPeers={otherPeers}
        displayName={displayName}
        verifyStatuses={verifyStatuses}
        safetyNumbers={safetyNumbers}
        fingerprints={fingerprints}
        ownFingerprint={ownFingerprint}
        verify={verify}
        unverify={unverify}
        isHost={isHost}
        joinRequests={joinRequests}
        onAcceptJoin={acceptJoin}
        onRejectJoin={rejectJoin}
      />

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

        {isHost && <JoinRequests requests={joinRequests} variant="mobile" onAccept={acceptJoin} onReject={rejectJoin} />}
        {isHost && <JoinRequests requests={joinRequests} variant="desktop" onAccept={acceptJoin} onReject={rejectJoin} />}

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

        <WhitelistRequests
          requests={whitelistRequests}
          displayName={displayName}
          onAccept={acceptWhitelist}
          onDecline={declineWhitelist}
        />

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
            {visibleMessages.map((msg, i) => (
              <MessageBubble
                key={`${msg.nonce}-${i}`}
                msg={msg}
                peerId={peerId}
                displayName={displayName}
                blur={securityOptions.blur}
                query={trimmedQuery}
                editingNonce={editingNonce}
                editDraft={editDraft}
                onEditDraftChange={setEditDraft}
                onBeginEdit={beginEdit}
                onCancelEdit={cancelEdit}
                onCommitEdit={commitEdit}
                onDelete={deleteMessage}
                onMarkRead={markAsRead}
              />
            ))}
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

        <MessageComposer
          input={input}
          onInputChange={setInput}
          onSubmit={handleSend}
          onTyping={sendTyping}
          onPaste={handlePaste}
          isConnected={isConnected}
          peerCount={activePeers.length}
          isPending={isPending}
          messagingBlocked={messagingBlocked}
          directLinkFailed={directLinkFailed}
          attachMenuOpen={attachMenuOpen}
          onToggleAttachMenu={() => setAttachMenuOpen(o => !o)}
          onCloseAttachMenu={() => setAttachMenuOpen(false)}
          fileInputRef={fileInputRef}
          largeFileInputRef={largeFileInputRef}
          onPickFiles={onPickFiles}
          onLargeFiles={(files) => void handleLargeFiles(files)}
          onOpenFilePicker={openFilePicker}
          onOpenLargeFilePicker={openLargeFilePicker}
          isRecording={isRecording}
          onStartRecording={() => void startRecording()}
          onStopRecording={stopRecording}
          fileError={fileError}
          onClearFileError={() => setFileError(null)}
        />
      </section>

      {pwModal && (
        <PasswordModal
          state={pwModal}
          onChange={setPwModal}
          onClose={() => setPwModal(null)}
          onSubmit={() => void submitProtected()}
        />
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

      <EventLogSidebar
        logs={logs}
        ioLoad={ioLoad}
        latencyMs={latencyMs}
        showLogs={showLogs}
        showRightSidebar={showRightSidebar}
        onToggleLogs={() => setShowLogs(s => !s)}
        onCloseMobile={() => setShowRightSidebar(false)}
      />
    </>
  );
}

export default ChatRoom;
