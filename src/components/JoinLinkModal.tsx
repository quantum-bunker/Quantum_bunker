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
      <div className="w-full max-w-md bg-ui-elevated dark:bg-brand-elevated border border-black/10 dark:border-white/10 shadow-2xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <LogIn size={18} className="text-cyan-600 dark:text-cyan-400" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">Join Vault</h3>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={16} /></button>
        </div>
        <div className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter">
          <span className="opacity-60">Vault_Hash:</span> <span className="text-cyan-600/80 dark:text-cyan-400/70 break-all">{vaultId}</span>
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Your_Name</label>
          <input
            type="text"
            autoFocus
            value={joinMsg}
            onChange={(e) => onJoinMsgChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onJoin(); }}
            placeholder="IDENT_TAG"
            className="w-full bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-700 outline-none focus:border-cyan-500/50"
          />
        </div>
        <button
          onClick={onJoin}
          className="w-full h-11 bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-white dark:text-cyan-400 border border-cyan-500/50 font-mono font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
        >
          {isReconnect ? 'RECONNECT' : 'JOIN'}<LogIn size={14} />
        </button>
      </div>
    </div>
  );
}
