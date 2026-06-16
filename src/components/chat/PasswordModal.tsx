import React from 'react';
import { Lock, LockKeyhole, X } from 'lucide-react';
import { FileCipher } from '../../file-crypto';

export interface PasswordModalState {
  files: File[];
  password: string;
  confirm: string;
  algo: FileCipher;
}

// Modal for the optional password layer applied on top of the E2E channel before
// a file enters the ratchet. The password is shared out of band — never relayed.
export function PasswordModal({
  state, onChange, onClose, onSubmit,
}: {
  state: PasswordModalState;
  onChange: (next: PasswordModalState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-ui-elevated dark:bg-brand-elevated border border-black/10 dark:border-white/10 shadow-2xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <LockKeyhole size={18} className="text-amber-600 dark:text-amber-400" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">Password protect</h3>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={16} /></button>
        </div>
        <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
          {state.files.length === 1 ? state.files[0].name : `${state.files.length} files`} will be encrypted with this password on top of the end-to-end channel. Share the password through a separate channel — it is never sent through the vault.
        </p>
        <input
          type="password"
          autoFocus
          value={state.password}
          onChange={(e) => onChange({ ...state, password: e.target.value })}
          placeholder="Password"
          className="bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:border-amber-500/50 text-sm font-mono text-slate-700 dark:text-slate-300 px-3 py-2"
        />
        <input
          type="password"
          value={state.confirm}
          onChange={(e) => onChange({ ...state, confirm: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
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
                onClick={() => onChange({ ...state, algo })}
                className={`px-3 py-2 text-[10px] font-mono uppercase border transition-colors ${state.algo === algo ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-black/10 dark:border-white/10 text-slate-500 hover:border-amber-500/30'}`}
              >
                {algo}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-[10px] font-mono uppercase text-slate-500 hover:text-slate-900 dark:hover:text-white px-3 py-2">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={!state.password || state.password !== state.confirm}
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold text-white dark:text-black bg-amber-600 dark:bg-amber-400 enabled:hover:bg-amber-500 disabled:opacity-30 px-4 py-2"
          >
            <Lock size={12} /> Encrypt &amp; Send
          </button>
        </div>
      </div>
    </div>
  );
}
