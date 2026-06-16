import React, { useState } from 'react';
import { Copy, Check, Fingerprint } from 'lucide-react';
import { useMembership } from '../useMembership';

interface MembershipPanelProps {
  membership: ReturnType<typeof useMembership>;
  hostSessions: { id: string; name: string }[];
}

const MembershipPanel: React.FC<MembershipPanelProps> = ({ membership, hostSessions }) => {
  const { memberPublicKey, issueInvite, saveToken, tokens } = membership;
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
    if (!token) { setRedeemMsg({ ok: false, text: 'INVALID_INVITE_TOKEN' }); return; }
    setRedeemMsg({ ok: true, text: `WHITELISTED_FOR ${token.claims.sid.substring(0, 12)}…` });
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
          <p className="qb-muted text-[11px] mt-0.5" style={{ fontFamily: 'var(--qb-font)' }}>Stateless membership — chat anytime, zero storage</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        <div className="space-y-2">
          <label className="qb-label text-[9px]">Your_Member_Code</label>
          <div className="flex gap-2">
            <div className="qb-input flex-1 px-3 py-2.5 text-[9px] text-emerald-600 dark:text-emerald-400/80 break-all leading-relaxed">{memberPublicKey}</div>
            <button onClick={copyCode} title="Copy member code" className="qb-btn w-10 shrink-0 flex items-center justify-center hover:!text-emerald-500 hover:!border-emerald-500/40">
              {codeCopied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <p className="qb-muted text-[8px]" style={{ fontFamily: 'var(--qb-font)' }}>Share with a host to be whitelisted</p>
        </div>

        <div className="space-y-2">
          <label className="qb-label text-[9px]">Issue_Invite <span className="text-slate-400">(host)</span></label>
          <input value={memberCode} onChange={(e) => setMemberCode(e.target.value)} placeholder="MEMBER_CODE" className="qb-input qb-accent-text w-full px-3 py-2.5 text-[10px]" />
          {hostSessions.length > 0 ? (
            <select value={vaultId || hostSessions[0]?.id} onChange={(e) => setVaultId(e.target.value)} className="qb-input qb-accent-text w-full px-3 py-2.5 text-[10px]">
              {hostSessions.map(s => <option key={s.id} value={s.id}>{(s.name || s.id.substring(0, 8))} — {s.id.substring(0, 8)}…</option>)}
            </select>
          ) : (
            <input value={vaultId} onChange={(e) => setVaultId(e.target.value)} placeholder="VAULT_HASH_ID" className="qb-input qb-accent-text w-full px-3 py-2.5 text-[10px]" />
          )}
          <button onClick={generate} disabled={!memberCode.trim()} className="qb-rounded-sm w-full h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold text-[10px] transition-all disabled:opacity-30" style={{ fontFamily: 'var(--qb-font)' }}>
            Generate_Invite
          </button>
          {invite && (
            <div className="flex gap-2">
              <div className="qb-rounded-sm flex-1 bg-black/[0.02] dark:bg-black/40 border border-emerald-500/20 px-3 py-2 text-[8px] text-emerald-600 dark:text-emerald-400/80 break-all max-h-16 overflow-y-auto custom-scrollbar" style={{ fontFamily: 'var(--qb-font)' }}>{invite}</div>
              <button onClick={copyInvite} title="Copy invite" className="qb-rounded-sm w-10 shrink-0 flex items-center justify-center border border-emerald-500/30 text-slate-400 hover:text-emerald-500 transition-all">
                {inviteCopied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="qb-label text-[9px]">Redeem_Invite <span className="text-slate-400">(member)</span></label>
          <textarea value={redeem} onChange={(e) => setRedeem(e.target.value)} placeholder="PASTE_INVITE_TOKEN" rows={3} className="qb-input qb-accent-text w-full px-3 py-2.5 text-[9px] resize-none custom-scrollbar" />
          <button onClick={redeemInvite} disabled={!redeem.trim()} className="qb-rounded-sm w-full h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold text-[10px] transition-all disabled:opacity-30" style={{ fontFamily: 'var(--qb-font)' }}>
            Save_Membership
          </button>
          {redeemMsg && <p className={`text-[8px] ${redeemMsg.ok ? 'text-emerald-500' : 'text-red-500'}`} style={{ fontFamily: 'var(--qb-font)' }}>{redeemMsg.text}</p>}
          <p className="qb-muted text-[8px]" style={{ fontFamily: 'var(--qb-font)' }}>{Object.keys(tokens).length} active membership(s)</p>
        </div>
      </div>
    </div>
  );
};

export default MembershipPanel;
