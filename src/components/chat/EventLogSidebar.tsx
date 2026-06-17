import { X } from 'lucide-react';

export interface LogEntry {
  t: string;
  msg: string;
  color: string;
}

// Right sidebar: scrolling event log (toggleable) plus the always-on IO load and
// latency metrics. Collapses to a metrics-only strip when the log is hidden.
export function EventLogSidebar({
  logs, ioLoad, latencyMs, showLogs, showRightSidebar, onToggleLogs, onCloseMobile,
}: {
  logs: LogEntry[];
  ioLoad: number;
  latencyMs: number | null;
  showLogs: boolean;
  showRightSidebar: boolean;
  onToggleLogs: () => void;
  onCloseMobile: () => void;
}) {
  const expanded = showLogs || showRightSidebar;
  return (
    <aside className={`qb-aside w-72 border-l p-4 flex flex-col shrink-0 z-[70] ${expanded ? 'lg:w-64' : 'lg:w-48'} ${showRightSidebar ? 'fixed inset-y-0 right-0 shadow-2xl overflow-y-auto' : 'hidden lg:flex'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="qb-label font-bold flex items-center gap-2">{expanded ? 'Event Log' : 'Metrics'}</h3>
        <div className="flex items-center gap-2">
          <button onClick={onToggleLogs} className="qb-label hidden lg:inline text-[9px] text-slate-400 hover:text-emerald-500 transition-colors" title="Toggle event log">{showLogs ? 'Hide' : 'Show'}</button>
          <button onClick={onCloseMobile} className="lg:hidden text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        </div>
      </div>
      {expanded && (
        <div className="flex-1 text-[10px] space-y-3 opacity-60 overflow-y-auto custom-scrollbar italic leading-tight" style={{ fontFamily: 'var(--qb-font)' }}>
          {logs.map((log, i) => <div key={i} className={log.color}>[{log.t}] {log.msg}</div>)}
          <div className="text-slate-500 dark:text-slate-600 animate-pulse uppercase tracking-tight">[HANDSHAKE_WAIT] - Listening...</div>
        </div>
      )}
      <div className="pt-4 mt-4 border-t qb-border">
        <div className="flex justify-between items-end">
          <div>
            <div className="qb-muted text-[9px]" style={{ fontFamily: 'var(--qb-font)' }}>IO_LOAD</div>
            <div className="qb-title text-base">{ioLoad.toFixed(3)}%</div>
          </div>
          <div className="text-right">
            <div className="qb-muted text-[9px]" style={{ fontFamily: 'var(--qb-font)' }}>LATENCY</div>
            <div className={`text-base tracking-tighter ${latencyMs === null ? 'text-slate-400 dark:text-slate-600' : latencyMs < 50 ? 'text-emerald-600 dark:text-emerald-400' : latencyMs < 150 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`} style={{ fontFamily: 'var(--qb-font)' }}>
              {latencyMs === null ? '—' : `${latencyMs}ms`}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
