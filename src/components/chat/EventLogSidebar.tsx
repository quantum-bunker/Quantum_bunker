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
    <aside className={`w-72 border-l border-black/5 dark:border-white/5 bg-ui-aside dark:bg-brand-aside p-4 flex flex-col shrink-0 z-[70] ${expanded ? 'lg:w-64' : 'lg:w-48'} ${showRightSidebar ? 'fixed inset-y-0 right-0 shadow-2xl overflow-y-auto' : 'hidden lg:flex'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="mono-label uppercase tracking-widest font-bold flex items-center gap-2">{expanded ? 'Event Log' : 'Metrics'}</h3>
        <div className="flex items-center gap-2">
          <button onClick={onToggleLogs} className="hidden lg:inline text-[9px] font-mono uppercase tracking-widest text-slate-400 hover:text-emerald-500 transition-colors" title="Toggle event log">{showLogs ? 'Hide' : 'Show'}</button>
          <button onClick={onCloseMobile} className="lg:hidden text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        </div>
      </div>
      {expanded && (
        <div className="flex-1 font-mono text-[10px] space-y-3 opacity-60 overflow-y-auto custom-scrollbar italic leading-tight">
          {logs.map((log, i) => <div key={i} className={log.color}>[{log.t}] {log.msg}</div>)}
          <div className="text-slate-500 dark:text-slate-600 animate-pulse uppercase tracking-tight">[HANDSHAKE_WAIT] - Listening...</div>
        </div>
      )}
      <div className="pt-4 mt-4 border-t border-black/5 dark:border-white/5">
        <div className="flex justify-between items-end">
          <div>
            <div className="text-[9px] text-slate-500 font-mono uppercase">IO_LOAD</div>
            <div className="text-base font-mono text-slate-900 dark:text-white">{ioLoad.toFixed(3)}%</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-slate-500 font-mono uppercase">LATENCY</div>
            <div className={`text-base font-mono tracking-tighter ${latencyMs === null ? 'text-slate-400 dark:text-slate-600' : latencyMs < 50 ? 'text-emerald-600 dark:text-emerald-400' : latencyMs < 150 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
              {latencyMs === null ? '—' : `${latencyMs}ms`}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
