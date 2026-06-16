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
    <aside className={`qb-aside w-72 lg:w-72 border-r p-6 flex flex-col gap-8 shrink-0 z-[70] overflow-y-auto ${open ? 'fixed inset-y-0 left-0 shadow-2xl' : 'hidden lg:flex'}`}>
      <button onClick={onClose} className="lg:hidden absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
      <section>
        <h3 className="qb-label mb-4 font-bold">Active Session</h3>
        <div className="space-y-4">
          <div className="qb-panel-flat p-3 shadow-sm dark:shadow-none group cursor-pointer" onClick={onCopyId}>
            <div className="flex items-center justify-between mb-1">
              <div className="qb-label text-[10px]">{sessionName ? 'Vault_Name' : 'Vault_Hash'}</div>
              <div className="flex items-center gap-2">
                {isGroup && <span className="text-[8px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-1 rounded-sm uppercase">GROUP</span>}
                {copied
                  ? <span className="text-[9px] text-emerald-500">✓</span>
                  : <span className="qb-muted text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">copy</span>
                }
              </div>
            </div>
            <div className="qb-accent-text text-[11px] break-all leading-tight italic truncate" style={{ fontFamily: 'var(--qb-font)' }}>{sessionName || sessionId}</div>
            {sessionName && <div className="qb-muted text-[9px] truncate mt-1" style={{ fontFamily: 'var(--qb-font)' }}>ID: {sessionId}</div>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="qb-panel-flat p-2 shadow-sm dark:shadow-none">
              <div className="qb-muted text-[9px] text-center" style={{ fontFamily: 'var(--qb-font)' }}>PEER</div>
              <div className="qb-title text-xs text-center uppercase">{peerId?.replace('peer-', '') || ''}</div>
            </div>
            <div className="qb-panel-flat p-2 shadow-sm dark:shadow-none">
              <div className="qb-muted text-[9px] text-center" style={{ fontFamily: 'var(--qb-font)' }}>STATUS</div>
              <div className={`text-[10px] text-center font-bold ${isConnected ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-500'}`} style={{ fontFamily: 'var(--qb-font)' }}>{isConnected ? 'ONLINE' : 'OFFLINE'}</div>
            </div>
          </div>
          {expiresAt && (
            <div className="qb-panel-flat p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isExpired ? 'bg-red-500' : 'qb-accent-bg'}`} />
                <span className="qb-muted text-[9px]" style={{ fontFamily: 'var(--qb-font)' }}>Decay_Timer</span>
              </div>
              <span className={`text-[11px] font-bold ${isExpired ? 'text-red-500' : 'qb-accent-text'}`} style={{ fontFamily: 'var(--qb-font)' }}>{timeLeft}</span>
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="qb-label mb-4 font-bold flex items-center gap-2"><QrCode size={12} /> Share Vault</h3>
        <div className="space-y-3">
          {qrDataUrl && (
            <div className="qb-panel-flat p-3 bg-white flex items-center justify-center">
              <img src={qrDataUrl} alt="Vault join QR code" className="w-full max-w-[180px] aspect-square" />
            </div>
          )}
          <button onClick={onCopyShareLink} className="qb-btn w-full flex items-center justify-center gap-2 px-3 py-2 qb-accent-text text-[10px] tracking-widest" style={{ fontFamily: 'var(--qb-font)', textTransform: 'var(--qb-label-tt)' }}>
            {linkCopied ? <><Share2 size={12} /> Link_Copied</> : <><Share2 size={12} /> Copy_Share_Link</>}
          </button>
          <p className="qb-muted text-[9px] italic leading-relaxed text-center" style={{ fontFamily: 'var(--qb-font)' }}>Scan or share to auto-fill the vault hash</p>
        </div>
      </section>

      <section>
        <h3 className="qb-label mb-4 font-bold">Relay Interface</h3>
        <ul className="space-y-3">
          <li className="flex items-center justify-between text-[11px]"><span className="qb-muted" style={{ fontFamily: 'var(--qb-font)' }}>ENVELOPE_TYPE</span><span className="text-emerald-600 dark:text-emerald-500">LOCKED</span></li>
          <li className="flex items-center justify-between text-[11px]"><span className="qb-muted" style={{ fontFamily: 'var(--qb-font)' }}>SESSION_MEMORY</span><span className="qb-title uppercase">Ephem</span></li>
          <li className="flex items-center justify-between text-[11px]"><span className="qb-muted" style={{ fontFamily: 'var(--qb-font)' }}>ZERO_KNOWLEDGE</span><span className="text-emerald-600 dark:text-emerald-500 font-bold italic">ACTIVE</span></li>
          <li className="flex items-center justify-between text-[11px]"><span className="qb-muted" style={{ fontFamily: 'var(--qb-font)' }}>MSG_CRYPTO</span><span className="qb-accent-text font-bold">DoubleRatchet</span></li>
        </ul>
      </section>

      <section>
        <h3 className="qb-label mb-4 font-bold flex items-center gap-2"><Fingerprint size={12} /> Verify Contacts</h3>
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
        <div className="qb-rounded p-4 qb-accent-soft-bg border qb-accent-border text-center" style={{ borderColor: 'var(--qb-accent-soft)' }}>
          <p className="qb-accent-text text-[9px] italic leading-relaxed opacity-80" style={{ fontFamily: 'var(--qb-font)' }}>Server acts as a passive forwarder. Payloads are never persisted or decrypted. Memory-only store active.</p>
        </div>
      </div>
    </aside>
  );
}
