import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, UserPlus, Trash2, ShieldCheck, ShieldAlert, QrCode, KeyRound } from 'lucide-react';
import { useMembership } from '../useMembership';
import { useContacts } from '../useContacts';
import { Contact, isPinIntact } from '../contacts-store';

interface ContactBookProps {
  membership: ReturnType<typeof useMembership>;
  contacts: ReturnType<typeof useContacts>;
  hostSessions: { id: string; name: string }[];
}

const ContactBook: React.FC<ContactBookProps> = ({ membership, contacts, hostSessions }) => {
  const { memberPublicKey, issueInvite, saveToken } = membership;
  const { contacts: list, pinFromTrustLink, saveContactToken, revoke, encodeTrustPayload } = contacts;

  const [myLabel, setMyLabel] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [addInput, setAddInput] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addError, setAddError] = useState(false);

  // The trust link is a key-only artifact (no secret), safe to share anywhere.
  const myTrustPayload = useMemo(() => encodeTrustPayload(memberPublicKey, myLabel), [encodeTrustPayload, memberPublicKey, myLabel]);
  const myTrustLink = `${window.location.origin}/?trust=${myTrustPayload}`;

  useEffect(() => {
    QRCode.toDataURL(myTrustLink, { margin: 1, width: 220, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [myTrustLink]);

  const copyLink = () => {
    navigator.clipboard.writeText(myTrustLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const addContact = () => {
    const pinned = pinFromTrustLink(addInput, addLabel) ?? contacts.pinManual(addInput.trim(), addLabel);
    if (!pinned) { setAddError(true); setTimeout(() => setAddError(false), 2500); return; }
    setAddInput('');
    setAddLabel('');
  };

  return (
    <div className="p-8 glass-panel space-y-6 relative overflow-hidden">
      <div className="flex items-center gap-4 relative z-10">
        <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <UserPlus size={24} />
        </div>
        <div>
          <h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Trusted_Contacts</h3>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Pinned keys — auto-admit, zero host prompt</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
        {/* Your trust handshake (share once) */}
        <div className="space-y-3">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><QrCode size={11} />Your_Trust_Handshake</label>
          <input value={myLabel} onChange={(e) => setMyLabel(e.target.value)} placeholder="YOUR_LABEL (OPTIONAL)" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[10px] font-mono text-indigo-600 dark:text-indigo-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-indigo-500/50" />
          <div className="flex gap-3">
            {qr && <img src={qr} alt="Trust handshake QR" className="w-24 h-24 border border-black/10 dark:border-white/10 shrink-0" />}
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <div className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-indigo-500/20 px-3 py-2 text-[8px] font-mono text-indigo-600 dark:text-indigo-400/80 break-all overflow-y-auto custom-scrollbar">{myTrustLink}</div>
              <button onClick={copyLink} className="h-8 flex items-center justify-center gap-2 border border-indigo-500/30 text-slate-400 hover:text-indigo-500 transition-all text-[9px] font-mono uppercase tracking-widest">
                {linkCopied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy_Link</>}
              </button>
            </div>
          </div>
          <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">Send once. The other side pins your key — no secret travels.</p>
        </div>

        {/* Add a contact */}
        <div className="space-y-3">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><KeyRound size={11} />Add_Contact</label>
          <input value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder="LABEL" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-indigo-500/50" />
          <textarea value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="PASTE_TRUST_LINK_OR_MEMBER_CODE" rows={3} className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2.5 text-[9px] font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-indigo-500/50 resize-none custom-scrollbar" />
          <button onClick={addContact} disabled={!addInput.trim()} className="w-full h-9 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-400 border border-indigo-500/40 font-mono font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-30">
            Pin_Contact
          </button>
          {addError && <p className="text-[8px] font-mono uppercase tracking-tighter text-red-500">INVALID_TRUST_PAYLOAD</p>}
        </div>
      </div>

      {/* Contact list */}
      <div className="relative z-10 space-y-2">
        <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Pinned ({list.length})</label>
        {list.length === 0 ? (
          <p className="text-[9px] font-mono text-slate-400 italic uppercase tracking-tighter py-4 text-center opacity-50">No_Trusted_Contacts</p>
        ) : (
          <div className="space-y-2">
            {list.map(c => (
              <ContactRow
                key={c.publicKey}
                contact={c}
                hostSessions={hostSessions}
                onIssueToken={(vaultId) => issueInvite(c.publicKey, vaultId)}
                onSaveToken={(encoded) => { saveToken(encoded); saveContactToken(c.publicKey, encoded); }}
                onRevoke={() => revoke(c.publicKey)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface ContactRowProps {
  contact: Contact;
  hostSessions: { id: string; name: string }[];
  onIssueToken: (vaultId: string) => string;
  onSaveToken: (encoded: string) => void;
  onRevoke: () => void;
}

const ContactRow: React.FC<ContactRowProps> = ({ contact, hostSessions, onIssueToken, onSaveToken, onRevoke }) => {
  const [open, setOpen] = useState(false);
  const [vaultId, setVaultId] = useState(hostSessions[0]?.id ?? '');
  const [issued, setIssued] = useState('');
  const [issuedCopied, setIssuedCopied] = useState(false);
  const [redeem, setRedeem] = useState('');
  const intact = isPinIntact(contact);

  const issue = () => {
    const sid = (vaultId || hostSessions[0]?.id || '').trim();
    if (!sid) return;
    try { setIssued(onIssueToken(sid)); } catch { setIssued(''); }
  };

  const copyIssued = () => {
    if (!issued) return;
    navigator.clipboard.writeText(issued);
    setIssuedCopied(true);
    setTimeout(() => setIssuedCopied(false), 2000);
  };

  return (
    <div className="border border-black/5 dark:border-white/5 bg-white dark:bg-black/20">
      <div className="flex items-center gap-3 p-3">
        <div className={`w-7 h-7 shrink-0 flex items-center justify-center border ${intact ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' : 'border-red-500/40 text-red-500 bg-red-500/10'}`} title={intact ? 'Pin intact' : 'KEY MISMATCH — possible impersonation'}>
          {intact ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate">{contact.label}</div>
          <div className="text-[8px] font-mono text-slate-500 truncate" title={contact.pinnedFingerprint}>FP: {contact.pinnedFingerprint}</div>
        </div>
        {contact.membershipToken && <span className="text-[7px] font-mono px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase shrink-0">Has_Token</span>}
        <button onClick={() => setOpen(o => !o)} className="text-[8px] font-mono uppercase tracking-widest text-slate-400 hover:text-indigo-500 px-2 shrink-0">{open ? 'Hide' : 'Manage'}</button>
        <button onClick={onRevoke} title="Revoke (drop pin)" className="w-8 h-8 shrink-0 flex items-center justify-center border border-black/5 dark:border-white/5 text-slate-400 hover:text-red-500 hover:border-red-500/30 transition-all">
          <Trash2 size={12} />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-black/5 dark:border-white/5 pt-3">
          <div className="space-y-1.5">
            <label className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Grant_Auto-Admit_To_Your_Vault</label>
            {hostSessions.length > 0 ? (
              <div className="flex gap-2">
                <select value={vaultId} onChange={(e) => setVaultId(e.target.value)} className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-2 py-2 text-[9px] font-mono text-cyan-600 dark:text-cyan-400 outline-none focus:border-indigo-500/50">
                  {hostSessions.map(s => <option key={s.id} value={s.id}>{(s.name || s.id.substring(0, 8))} — {s.id.substring(0, 8)}…</option>)}
                </select>
                <button onClick={issue} className="px-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-400 border border-indigo-500/40 font-mono font-bold text-[9px] uppercase tracking-widest transition-all">Issue</button>
              </div>
            ) : (
              <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">Host a vault first to issue a token.</p>
            )}
            {issued && (
              <div className="flex gap-2">
                <div className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-emerald-500/20 px-2 py-1.5 text-[8px] font-mono text-emerald-600 dark:text-emerald-400/80 break-all max-h-14 overflow-y-auto custom-scrollbar">{issued}</div>
                <button onClick={copyIssued} title="Copy token" className="w-8 shrink-0 flex items-center justify-center border border-emerald-500/30 text-slate-400 hover:text-emerald-500 transition-all">
                  {issuedCopied ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Save_Token_They_Sent_You</label>
            <div className="flex gap-2">
              <input value={redeem} onChange={(e) => setRedeem(e.target.value)} placeholder="PASTE_TOKEN" className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-2 py-2 text-[8px] font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-indigo-500/50" />
              <button onClick={() => { if (redeem.trim()) { onSaveToken(redeem.trim()); setRedeem(''); } }} disabled={!redeem.trim()} className="px-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-400 border border-indigo-500/40 font-mono font-bold text-[9px] uppercase tracking-widest transition-all disabled:opacity-30">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactBook;
