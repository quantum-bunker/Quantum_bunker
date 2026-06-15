import React, { useState } from 'react';
import { Fingerprint, Lock, KeyRound, Loader2, Flame, Check } from 'lucide-react';
import { UseIdentity } from '../useIdentity';

interface IdentityPanelProps {
  identity: UseIdentity;
}

// Opt-in long-term identity controls. With no long-term identity the app stays
// on the burner path (per-session key); this panel lets the user create or
// unlock a durable, encrypted-at-rest identity whose fingerprint survives
// browser restarts, and offers to promote a legacy per-session key in place.
export default function IdentityPanel({ identity }: IdentityPanelProps) {
  const { exists, migratableSessionId, fingerprint, error, busy, create, unlock, promote, forget } = identity;
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');

  const unlocked = fingerprint !== null;
  const mismatch = !exists && confirm.length > 0 && pass !== confirm;

  const submit = async () => {
    if (busy || !pass) return;
    if (exists) {
      await unlock(pass);
    } else if (migratableSessionId) {
      if (pass !== confirm) return;
      await promote(pass);
    } else {
      if (pass !== confirm) return;
      await create(pass);
    }
    setPass('');
    setConfirm('');
  };

  return (
    <div className="p-8 glass-panel flex flex-col gap-5 relative overflow-hidden">
      <div className="flex items-center gap-4 relative z-10">
        <div className="w-12 h-12 bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
          <Fingerprint size={24} />
        </div>
        <div>
          <h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Identity_Key</h3>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">
            {unlocked ? 'Long-term key active' : exists ? 'Locked — unlock to use' : 'Burner (per-session)'}
          </p>
        </div>
      </div>

      {unlocked ? (
        <div className="space-y-3 relative z-10">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-emerald-600 dark:text-emerald-400">
            <Check size={12} /> Stable fingerprint
          </div>
          <code className="block break-all text-[10px] font-mono text-violet-600 dark:text-violet-400 bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2">
            {fingerprint}
          </code>
          <button
            onClick={forget}
            className="text-[10px] font-mono uppercase text-slate-400 hover:text-red-500 transition-colors"
          >
            Forget this device identity
          </button>
        </div>
      ) : (
        <div className="space-y-3 relative z-10">
          {migratableSessionId && !exists && (
            <p className="text-[10px] font-mono uppercase text-amber-600 dark:text-amber-400 tracking-tighter">
              A per-session key was found — set a passphrase to promote it to a durable identity.
            </p>
          )}
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder={exists ? 'PASSPHRASE' : 'NEW_PASSPHRASE'}
            className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-violet-600 dark:text-violet-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-violet-500/50"
          />
          {!exists && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              placeholder="CONFIRM_PASSPHRASE"
              className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-violet-600 dark:text-violet-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-violet-500/50"
            />
          )}
          <button
            onClick={() => void submit()}
            disabled={busy || !pass || mismatch}
            className="w-full h-12 bg-violet-600 hover:bg-violet-500 dark:bg-violet-500/20 dark:hover:bg-violet-500/30 text-white dark:text-violet-300 border border-violet-500/50 font-mono font-bold text-xs uppercase transition-all tracking-widest flex items-center justify-center gap-2 disabled:opacity-30"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : exists ? <Lock size={14} /> : migratableSessionId ? <Flame size={14} /> : <KeyRound size={14} />}
            {exists ? 'Unlock_Identity' : migratableSessionId ? 'Promote_To_Long_Term' : 'Create_Long_Term_Identity'}
          </button>
          {mismatch && <span className="text-[9px] font-mono uppercase text-red-500">Passphrases do not match</span>}
          {error && <span className="text-[9px] font-mono uppercase text-red-500">{error}</span>}
          <p className="text-[9px] font-mono text-slate-400 leading-relaxed uppercase tracking-tighter">
            Encrypted at rest (PBKDF2-SHA256). Without long-term identity, a fresh key is used per session.
          </p>
        </div>
      )}
    </div>
  );
}
