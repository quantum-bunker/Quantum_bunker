export interface JoinRequest {
  peerId: string;
  message: string;
}

type JoinRequestsVariant = 'sidebar' | 'mobile' | 'desktop';

// Host-only join approval UI. The same request list is surfaced in three places
// (left sidebar, mobile banner, desktop banner); the variant picks the layout.
export function JoinRequests({
  requests, variant, onAccept, onReject,
}: {
  requests: JoinRequest[];
  variant: JoinRequestsVariant;
  onAccept: (peerId: string) => void;
  onReject: (peerId: string) => void;
}) {
  if (requests.length === 0) return null;

  if (variant === 'sidebar') {
    return (
      <section>
        <h3 className="mono-label mb-4 uppercase tracking-widest font-bold text-amber-500">Join Requests</h3>
        <div className="space-y-2">
          {requests.map(req => (
            <div key={req.peerId} className="p-3 bg-amber-500/10 border border-amber-500/20">
              <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mb-2 truncate">
                <strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"
              </div>
              <div className="flex gap-2">
                <button onClick={() => onAccept(req.peerId)} className="flex-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] py-1 border border-emerald-500/30 hover:bg-emerald-500/30">Accept</button>
                <button onClick={() => onReject(req.peerId)} className="flex-1 bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] py-1 border border-red-500/30 hover:bg-red-500/30">Reject</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (variant === 'mobile') {
    return (
      <div className="lg:hidden p-4 bg-amber-500/10 border-b border-amber-500/20">
        <h3 className="mono-label mb-2 uppercase tracking-widest font-bold text-amber-500">Join Requests</h3>
        <div className="flex flex-col gap-2">
          {requests.map(req => (
            <div key={req.peerId} className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center bg-white dark:bg-black/20 p-2 border border-amber-500/20">
              <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 truncate max-w-[200px]"><strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"</div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={() => onAccept(req.peerId)} className="flex-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-3 py-1 border border-emerald-500/30 hover:bg-emerald-500/30">Accept</button>
                <button onClick={() => onReject(req.peerId)} className="flex-1 bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-3 py-1 border border-red-500/30 hover:bg-red-500/30">Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="hidden lg:block px-6 py-3 bg-amber-500/10 border-b border-amber-500/20">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-[10px] font-mono uppercase tracking-widest font-bold text-amber-500 shrink-0">Join Requests ({requests.length}):</h3>
        {requests.map(req => (
          <div key={req.peerId} className="flex items-center gap-2 bg-white dark:bg-black/20 px-3 py-1.5 border border-amber-500/20">
            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 truncate max-w-[180px]"><strong>{req.peerId.substring(0, 8)}...</strong>: "{req.message}"</span>
            <button onClick={() => onAccept(req.peerId)} className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 border border-emerald-500/30 hover:bg-emerald-500/30 font-mono uppercase">Accept</button>
            <button onClick={() => onReject(req.peerId)} className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-2 py-0.5 border border-red-500/30 hover:bg-red-500/30 font-mono uppercase">Reject</button>
          </div>
        ))}
      </div>
    </div>
  );
}
