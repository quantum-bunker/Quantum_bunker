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
      <div className="qb-panel w-full max-w-md shadow-2xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <LockKeyhole size={18} className="text-amber-600 dark:text-amber-400" />
          <h3 className="qb-title text-sm font-bold">Password protect</h3>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={16} /></button>
        </div>
        <p className="qb-muted text-[10px] leading-relaxed" style={{ fontFamily: 'var(--qb-font)' }}>
          {state.files.length === 1 ? state.files[0].name : `${state.files.length} files`} will be encrypted with this password on top of the end-to-end channel. Share the password through a separate channel — it is never sent through the vault.
        </p>
        <input
          type="password"
          autoFocus
          value={state.password}
          onChange={(e) => onChange({ ...state, password: e.target.value })}
          placeholder="Password"
          className="qb-input text-sm px-3 py-2"
        />
        <input
          type="password"
          value={state.confirm}
          onChange={(e) => onChange({ ...state, confirm: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="Confirm password"
          className="qb-input text-sm px-3 py-2"
        />
        <div className="flex flex-col gap-1.5">
          <span className="qb-label text-[9px]">Cipher</span>
          <div className="grid grid-cols-2 gap-2">
            {(['AES-GCM', 'ChaCha20-Poly1305'] as FileCipher[]).map(algo => (
              <button
                key={algo}
                type="button"
                onClick={() => onChange({ ...state, algo })}
                className={`qb-rounded-sm px-3 py-2 text-[10px] border transition-colors ${state.algo === algo ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'qb-border text-slate-500 hover:border-amber-500/30'}`}
                style={{ fontFamily: 'var(--qb-font)' }}
              >
                {algo}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="qb-label text-[10px] hover:qb-title px-3 py-2">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={!state.password || state.password !== state.confirm}
            className="qb-rounded-sm flex items-center gap-1.5 text-[10px] font-bold text-white dark:text-black bg-amber-600 dark:bg-amber-400 enabled:hover:bg-amber-500 disabled:opacity-30 px-4 py-2"
            style={{ fontFamily: 'var(--qb-font)' }}
          >
            <Lock size={12} /> Encrypt &amp; Send
          </button>
        </div>
      </div>
    </div>
  );
}
