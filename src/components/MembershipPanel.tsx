import React, { useState } from 'react';
import { Copy, Check, Fingerprint, ArrowRight, UserPlus, KeyRound } from 'lucide-react';
import { useMembership } from '../useMembership';

interface MembershipPanelProps {
  membership: ReturnType<typeof useMembership>;
  hostSessions: { id: string; name: string }[];
}

type Role = 'member' | 'host';

// The whitelist hands one specific person a pre-approved pass to one specific
// room, so they skip the host's join queue. The flow has four hops across two
// people; this panel makes that sequence explicit (the stepper) and only shows
// the actions for whichever side you are (the Member / Host toggle), instead of
// dumping all four controls side by side.
const FLOW: { who: Role; label: string }[] = [
  { who: 'member', label: 'Member copies their code' },
  { who: 'host', label: 'Host makes an invite' },
  { who: 'host', label: 'Host sends it back' },
  { who: 'member', label: 'Member saves it' },
];

const MembershipPanel: React.FC<MembershipPanelProps> = ({ membership, hostSessions }) => {
  const { memberPublicKey, issueInvite, saveToken, tokens } = membership;
  const [role, setRole] = useState<Role>('member');
  const [codeCopied, setCodeCopied] = useState(false);
  const [memberCode, setMemberCode] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [invite, setInvite] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [redeem, setRedeem] = useState('');
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const copyCode = () => {
    navigator.clipboard.writeText(memberPublicKey);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const generate = () => {
    const sid = (vaultId || hostSessions[0]?.id || '').trim();
    if (!memberCode.trim() || !sid) { setInvite(''); return; }
    try { setInvite(issueInvite(memberCode, sid)); } catch { setInvite(''); }
  };

  const copyInvite = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const redeemInvite = () => {
    const token = saveToken(redeem);
    if (!token) { setRedeemMsg({ ok: false, text: 'That invite is invalid or malformed.' }); return; }
    setRedeemMsg({ ok: true, text: `Saved — you’ll auto-join vault ${token.claims.sid.substring(0, 12)}…` });
    setRedeem('');
  };

  return (
    <div className="p-8 qb-panel space-y-6 relative overflow-hidden">
      <div className="flex items-center gap-4 relative z-10">
        <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 qb-rounded-sm flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Fingerprint size={24} />
        </div>
        <div>
          <h3 className="qb-title text-base font-bold tracking-widest">Whitelist</h3>
          <p className="qb-muted text-[11px] mt-0.5" style={{ fontFamily: 'var(--qb-font)' }}>Pre-approve a person so they join a vault without waiting for the host.</p>
        </div>
      </div>

      {/* The whole four-step journey, so users see where their action fits. */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-2 qb-panel-flat px-4 py-3">
        {FLOW.map((s, i) => (
          <React.Fragment key={i}>
            <span className={`flex items-center gap-1.5 text-[10px] ${s.who === role ? 'qb-accent-text font-bold' : 'qb-muted'}`} style={{ fontFamily: 'var(--qb-font)' }}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${s.who === role ? 'qb-accent-bg text-white' : 'bg-black/10 dark:bg-white/10'}`}>{i + 1}</span>
              {s.label}
            </span>
            {i < FLOW.length - 1 && <ArrowRight size={11} className="qb-muted opacity-40 hidden sm:block" />}
          </React.Fragment>
        ))}
      </div>

      {/* Role toggle — show only the steps that are this user's job. */}
      <div className="relative z-10 flex gap-2">
        <button
          onClick={() => setRole('member')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 qb-rounded-sm border text-[11px] font-bold transition-colors ${role === 'member' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'qb-border qb-muted hover:qb-text'}`}
        >
          <UserPlus size={13} />I’m joining a vault
        </button>
        <button
          onClick={() => setRole('host')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 qb-rounded-sm border text-[11px] font-bold transition-colors ${role === 'host' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'qb-border qb-muted hover:qb-text'}`}
        >
          <KeyRound size={13} />I’m the host
        </button>
      </div>

      {role === 'member' ? (
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="qb-label text-[9px] flex items-center gap-1.5"><span className="qb-accent-text">Step 1</span> · Send the host your code</label>
            <div className="flex gap-2">
              <div className="qb-input flex-1 px-3 py-2.5 text-[9px] text-emerald-600 dark:text-emerald-400/80 break-all leading-relaxed">{memberPublicKey}</div>
              <button onClick={copyCode} title="Copy member code" className="qb-btn w-10 shrink-0 flex items-center justify-center hover:!text-emerald-500 hover:!border-emerald-500/40">
                {codeCopied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
            <p className="qb-muted text-[9px]" style={{ fontFamily: 'var(--qb-font)' }}>This is your public key — safe to share. The host needs it to make your invite.</p>
          </div>

          <div className="space-y-2">
            <label className="qb-label text-[9px] flex items-center gap-1.5"><span className="qb-accent-text">Step 4</span> · Paste the invite they send back</label>
            <textarea value={redeem} onChange={(e) => setRedeem(e.target.value)} placeholder="Paste the invite token from the host" rows={3} className="qb-input qb-accent-text w-full px-3 py-2.5 text-[9px] resize-none custom-scrollbar" />
            <button onClick={redeemInvite} disabled={!redeem.trim()} className="qb-rounded-sm w-full h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold text-[10px] transition-all disabled:opacity-30" style={{ fontFamily: 'var(--qb-font)' }}>
              Save membership
            </button>
            {redeemMsg && <p className={`text-[9px] ${redeemMsg.ok ? 'text-emerald-500' : 'text-red-500'}`} style={{ fontFamily: 'var(--qb-font)' }}>{redeemMsg.text}</p>}
            <p className="qb-muted text-[9px]" style={{ fontFamily: 'var(--qb-font)' }}>{Object.keys(tokens).length} saved membership(s). After saving, you’ll join that vault automatically.</p>
          </div>
        </div>
      ) : (
        <div className="relative z-10 space-y-4">
          <div className="space-y-2 max-w-xl">
            <label className="qb-label text-[9px] flex items-center gap-1.5"><span className="qb-accent-text">Step 2</span> · Make an invite for them</label>
            <input value={memberCode} onChange={(e) => setMemberCode(e.target.value)} placeholder="Paste the member’s code here" className="qb-input qb-accent-text w-full px-3 py-2.5 text-[10px]" />
            {hostSessions.length > 0 ? (
              <select value={vaultId || hostSessions[0]?.id} onChange={(e) => setVaultId(e.target.value)} className="qb-input qb-accent-text w-full px-3 py-2.5 text-[10px]">
                {hostSessions.map(s => <option key={s.id} value={s.id}>{(s.name || s.id.substring(0, 8))} — {s.id.substring(0, 8)}…</option>)}
              </select>
            ) : (
              <input value={vaultId} onChange={(e) => setVaultId(e.target.value)} placeholder="Vault address to grant access to" className="qb-input qb-accent-text w-full px-3 py-2.5 text-[10px]" />
            )}
            <button onClick={generate} disabled={!memberCode.trim()} className="qb-rounded-sm w-full h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold text-[10px] transition-all disabled:opacity-30" style={{ fontFamily: 'var(--qb-font)' }}>
              Generate invite
            </button>
            <p className="qb-muted text-[9px]" style={{ fontFamily: 'var(--qb-font)' }}>You must have created the vault with a long-term identity for whitelist invites to work.</p>
          </div>

          {invite && (
            <div className="space-y-2 max-w-xl">
              <label className="qb-label text-[9px] flex items-center gap-1.5"><span className="qb-accent-text">Step 3</span> · Send this back to them</label>
              <div className="flex gap-2">
                <div className="qb-rounded-sm flex-1 bg-black/[0.02] dark:bg-black/40 border border-emerald-500/20 px-3 py-2 text-[8px] text-emerald-600 dark:text-emerald-400/80 break-all max-h-16 overflow-y-auto custom-scrollbar" style={{ fontFamily: 'var(--qb-font)' }}>{invite}</div>
                <button onClick={copyInvite} title="Copy invite" className="qb-rounded-sm w-10 shrink-0 flex items-center justify-center border border-emerald-500/30 text-slate-400 hover:text-emerald-500 transition-all">
                  {inviteCopied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <p className="qb-muted text-[9px]" style={{ fontFamily: 'var(--qb-font)' }}>Safe to send openly — it’s useless without the member’s private key.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MembershipPanel;
