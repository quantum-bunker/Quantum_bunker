import { Fingerprint, QrCode, Share2, X } from 'lucide-react';
import { ContactStatus } from '../../contact-verification';
import { ContactVerificationPanel } from '../ContactVerification';
import { JoinRequest, JoinRequests } from './JoinRequests';

// Left sidebar: session identity, share QR/link, relay interface readout, contact
// verification, and (host-only) pending join requests.
export function VaultSidebar({
  open, onClose,
  sessionId, sessionName, peerId, isGroup, isConnected, copied, onCopyId,
  expiresAt, isExpired, timeLeft,
  qrDataUrl, linkCopied, onCopyShareLink,
  otherPeers, displayName, verifyStatuses, safetyNumbers, fingerprints, ownFingerprint, verify, unverify,
  isHost, joinRequests, onAcceptJoin, onRejectJoin,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionName: string | null;
  peerId: string;
  isGroup: boolean;
  isConnected: boolean;
  copied: boolean;
  onCopyId: () => void;
  expiresAt: number | null;
  isExpired: boolean;
  timeLeft: string;
  qrDataUrl: string;
  linkCopied: boolean;
  onCopyShareLink: () => void;
  otherPeers: string[];
  displayName: (id: string) => string;
  verifyStatuses: Record<string, ContactStatus>;
  safetyNumbers: Record<string, string>;
  fingerprints: Record<string, string>;
  ownFingerprint: string | null;
  verify: (peerId: string) => void;
  unverify: (peerId: string) => void;
  isHost: boolean;
  joinRequests: JoinRequest[];
  onAcceptJoin: (peerId: string) => void;
  onRejectJoin: (peerId: string) => void;
}) {
  return (
    <aside className={`w-72 lg:w-72 border-r border-black/5 dark:border-white/5 bg-ui-aside dark:bg-brand-aside p-6 flex flex-col gap-8 shrink-0 z-[70] overflow-y-auto ${open ? 'fixed inset-y-0 left-0 shadow-2xl' : 'hidden lg:flex'}`}>
      <button onClick={onClose} className="lg:hidden absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
      <section>
        <h3 className="mono-label mb-4 uppercase tracking-widest font-bold">Active Session</h3>
        <div className="space-y-4">
          <div className="p-3 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm dark:shadow-none group cursor-pointer" onClick={onCopyId}>
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
          <button onClick={onCopyShareLink} className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[10px] font-mono uppercase tracking-widest transition-colors">
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

      {isHost && <JoinRequests requests={joinRequests} variant="sidebar" onAccept={onAcceptJoin} onReject={onRejectJoin} />}

      <div className="mt-auto">
        <div className="p-4 bg-cyan-500/5 dark:bg-cyan-900/10 border border-cyan-500/20 text-center">
          <p className="text-[9px] italic text-cyan-700 dark:text-cyan-200/60 leading-relaxed font-mono uppercase tracking-tighter">Server acts as a passive forwarder. Payloads are never persisted or decrypted. Memory-only store active.</p>
        </div>
      </div>
    </aside>
  );
}
