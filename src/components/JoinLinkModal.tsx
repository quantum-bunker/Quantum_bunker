import { LogIn, X } from 'lucide-react';

// Confirmation modal shown when arriving via a /join/:id share link: surfaces the
// target vault hash and collects an ident tag before connecting.
export function JoinLinkModal({
  vaultId, joinMsg, isReconnect, onJoinMsgChange, onClose, onJoin,
}: {
  vaultId: string;
  joinMsg: string;
  isReconnect: boolean;
  onJoinMsgChange: (value: string) => void;
  onClose: () => void;
  onJoin: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="qb-panel w-full max-w-md shadow-2xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <LogIn size={18} className="qb-accent-text" />
          <h3 className="qb-title text-sm font-bold">Join Vault</h3>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={16} /></button>
        </div>
        <div className="qb-muted text-[9px]" style={{ fontFamily: 'var(--qb-font)' }}>
          <span className="opacity-60">Vault_Hash:</span> <span className="qb-accent-text opacity-80 break-all">{vaultId}</span>
        </div>
        <div className="space-y-1.5">
          <label className="qb-label text-[9px]">Your_Name</label>
          <input
            type="text"
            autoFocus
            value={joinMsg}
            onChange={(e) => onJoinMsgChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onJoin(); }}
            placeholder="IDENT_TAG"
            className="qb-input qb-accent-text w-full px-4 py-3 text-xs"
          />
        </div>
        <button
          onClick={onJoin}
          className="qb-btn-accent w-full h-11 font-bold text-xs tracking-widest transition-all flex items-center justify-center gap-2"
        >
          {isReconnect ? 'RECONNECT' : 'JOIN'}<LogIn size={14} />
        </button>
      </div>
    </div>
  );
}
