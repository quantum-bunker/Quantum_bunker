import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Copy, Check, Fingerprint, AlertTriangle } from 'lucide-react';
import { ContactStatus } from '../contact-verification';

function groupFingerprint(fp: string | null | undefined): string | null {
  if (!fp) return null;
  return fp.match(/.{1,4}/g)?.join(' ') ?? fp;
}

function CopyButton({ value }: { value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-cyan-500 shrink-0" title="Copy">
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

const STATUS_META: Record<ContactStatus, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  verified: { label: 'Verified', cls: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10', Icon: ShieldCheck },
  unverified: { label: 'Unverified', cls: 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10', Icon: ShieldQuestion },
  changed: { label: 'Key Changed', cls: 'text-red-600 dark:text-red-400 border-red-500/40 bg-red-500/10', Icon: ShieldAlert },
};

function PeerVerificationRow({
  label, status, safetyNumber, fingerprint, onVerify, onUnverify,
}: {
  label: string;
  status: ContactStatus;
  safetyNumber: string | null | undefined;
  fingerprint: string | null | undefined;
  onVerify: () => void;
  onUnverify: () => void;
}) {
  const meta = STATUS_META[status];
  const ready = !!safetyNumber && !!fingerprint;
  return (
    <div className={`qb-rounded-sm p-2.5 border space-y-2 group ${status === 'changed' ? 'border-red-500/40 bg-red-500/5' : 'qb-panel-flat'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-slate-700 dark:text-slate-200 uppercase tracking-widest truncate font-bold">{label}</span>
        <span className={`flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 border rounded-sm shrink-0 ${meta.cls}`}>
          <meta.Icon size={9} /> {meta.label}
        </span>
      </div>

      {ready ? (
        <>
          <div className="space-y-0.5">
            <div className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">Safety Number</div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-mono text-slate-700 dark:text-slate-200 tracking-wider leading-relaxed tabular-nums">{safetyNumber}</span>
              <CopyButton value={safetyNumber} />
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">Fingerprint (SHA-256)</div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[8px] font-mono text-cyan-600 dark:text-cyan-400/80 break-all leading-relaxed tracking-wider">{groupFingerprint(fingerprint)}</span>
              <CopyButton value={fingerprint} />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {status === 'verified' ? (
              <button onClick={onUnverify} className="flex-1 flex items-center justify-center gap-1 text-[9px] font-mono uppercase tracking-widest text-slate-500 hover:text-red-500 border border-black/10 dark:border-white/10 py-1 transition-colors">
                Unverify
              </button>
            ) : (
              <button onClick={onVerify} className={`flex-1 flex items-center justify-center gap-1 text-[9px] font-mono uppercase tracking-widest py-1 border transition-colors ${status === 'changed' ? 'text-red-600 dark:text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20' : 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'}`}>
                <ShieldCheck size={10} /> {status === 'changed' ? 'Re-verify' : 'Verify contact'}
              </button>
            )}
          </div>
        </>
      ) : (
        <span className="block text-[9px] font-mono text-slate-400 italic">awaiting handshake…</span>
      )}
    </div>
  );
}

export function ContactVerificationPanel({
  peers, displayName, statuses, safetyNumbers, fingerprints, ownFingerprint, verify, unverify,
}: {
  peers: string[];
  displayName: (id: string) => string;
  statuses: Record<string, ContactStatus>;
  safetyNumbers: Record<string, string>;
  fingerprints: Record<string, string>;
  ownFingerprint: string | null;
  verify: (peerId: string) => void;
  unverify: (peerId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="qb-panel-flat p-2.5 space-y-1.5 group">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">YOUR FINGERPRINT</span>
          <CopyButton value={ownFingerprint} />
        </div>
        <div className="text-[8px] font-mono text-cyan-600 dark:text-cyan-400/80 break-all leading-relaxed tracking-wider">
          {groupFingerprint(ownFingerprint) ?? <span className="text-slate-400 italic">pending…</span>}
        </div>
      </div>

      {peers.map((id) => (
        <PeerVerificationRow
          key={id}
          label={displayName(id)}
          status={statuses[id] ?? 'unverified'}
          safetyNumber={safetyNumbers[id]}
          fingerprint={fingerprints[id]}
          onVerify={() => verify(id)}
          onUnverify={() => unverify(id)}
        />
      ))}
      {peers.length === 0 && (
        <p className="text-[9px] font-mono text-slate-400 italic uppercase tracking-tighter">Peers appear here after the handshake. Compare the safety number out of band, then verify.</p>
      )}
    </div>
  );
}

// LOUD, blocking overlay shown whenever a previously-pinned peer's fingerprint
// changes. Messaging is gated behind re-verification (or clearing the pin),
// because a changed key on the relay path is the signature of an interception.
export function KeyChangeWarning({
  changedPeers, displayName, safetyNumbers, fingerprints, verify, unverify,
}: {
  changedPeers: string[];
  displayName: (id: string) => string;
  safetyNumbers: Record<string, string>;
  fingerprints: Record<string, string>;
  verify: (peerId: string) => void;
  unverify: (peerId: string) => void;
}) {
  if (changedPeers.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-red-950/80 backdrop-blur-md p-4">
      <div className="qb-rounded w-full max-w-lg border-2 border-red-500 qb-surface shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 bg-red-500/15 border-b-2 border-red-500 animate-pulse">
          <AlertTriangle size={24} className="text-red-500 shrink-0" />
          <div>
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Key Changed — Possible Interception</h2>
            <p className="text-[10px] font-mono text-red-500/80 uppercase tracking-tighter mt-0.5">Messaging is blocked until you re-verify</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
            The identity key for the peer(s) below no longer matches the fingerprint you previously verified. This can mean the relay server (or someone on the path) is now sitting between you. Do NOT send anything until you confirm the new safety number with the peer over a trusted out-of-band channel.
          </p>
          {changedPeers.map((id) => (
            <div key={id} className="border border-red-500/40 bg-red-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Fingerprint size={12} className="text-red-500" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">{displayName(id)}</span>
              </div>
              <div className="space-y-0.5">
                <div className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">New Safety Number</div>
                <span className="text-[11px] font-mono text-slate-700 dark:text-slate-200 tracking-wider tabular-nums break-all">{safetyNumbers[id] ?? '—'}</span>
              </div>
              <div className="space-y-0.5">
                <div className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">New Fingerprint</div>
                <span className="text-[8px] font-mono text-cyan-600 dark:text-cyan-400/80 break-all leading-relaxed tracking-wider">{groupFingerprint(fingerprints[id])}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => verify(id)} className="flex-1 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-widest text-white dark:text-black bg-red-600 dark:bg-red-400 hover:bg-red-500 py-2 font-bold">
                  <ShieldCheck size={12} /> I confirmed it — re-verify
                </button>
                <button onClick={() => unverify(id)} className="flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-widest text-slate-500 hover:text-slate-900 dark:hover:text-white border border-black/10 dark:border-white/10 px-3 py-2">
                  Clear pin
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
