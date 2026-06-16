import { UserPlus } from 'lucide-react';

export interface WhitelistRequest {
  peerId: string;
  label: string;
  pk: string;
}

// In-chat mutual whitelist: a peer has asked to whitelist us. Acceptance is
// required from both sides, so this is a request→accept handshake, not a grant.
export function WhitelistRequests({
  requests, displayName, onAccept, onDecline,
}: {
  requests: WhitelistRequest[];
  displayName: (id: string) => string;
  onAccept: (peerId: string) => void;
  onDecline: (peerId: string) => void;
}) {
  if (requests.length === 0) return null;
  return (
    <div className="px-4 lg:px-6 py-3 bg-emerald-500/10 border-b border-emerald-500/20">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="qb-label text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1.5"><UserPlus size={12} /> Whitelist Requests:</h3>
        {requests.map(req => (
          <div key={req.peerId} className="flex items-center gap-2 bg-white dark:bg-black/20 px-3 py-1.5 border border-emerald-500/20">
            <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 truncate max-w-[200px]"><strong>{req.label || displayName(req.peerId)}</strong> wants to whitelist you</span>
            <button onClick={() => onAccept(req.peerId)} className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 border border-emerald-500/30 hover:bg-emerald-500/30 font-mono uppercase">Accept</button>
            <button onClick={() => onDecline(req.peerId)} className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-2 py-0.5 border border-red-500/30 hover:bg-red-500/30 font-mono uppercase">Decline</button>
          </div>
        ))}
      </div>
    </div>
  );
}
