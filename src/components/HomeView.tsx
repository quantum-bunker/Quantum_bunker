import { Lock, Plus, LogIn, Trash2, ShieldCheck, Activity, Terminal, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useSession } from '../useSession';
import { useMembership } from '../useMembership';
import { useContacts } from '../useContacts';
import { useIdentity } from '../useIdentity';
import MembershipPanel from './MembershipPanel';
import ContactBook from './ContactBook';
import IdentityPanel from './IdentityPanel';

type SavedSession = ReturnType<typeof useSession>['savedSessions'][number];

const FEATURE_CARDS = [
  { icon: ShieldCheck, title: 'Zero Storage', desc: 'No messages ever touch a disk. Pure volatile memory routing.' },
  { icon: Lock, title: 'End-to-End', desc: 'Noise Protocol XX handshake ensures absolute privacy between peers.' },
  { icon: Activity, title: 'Auto Decay', desc: 'Sessions self-destruct after inactivity. No traces left behind.' },
];

// Landing view: create/enter a vault, browse reconnect history, and (collapsed)
// access-control panels for identity, whitelist and trusted contacts.
export function HomeView({
  createSessionName, onCreateSessionNameChange, onCreate, isCreating,
  joinId, onJoinIdChange, joinMsg, onJoinMsgChange, onJoin,
  savedSessions, onDestroySession,
  advOpen, onToggleAdv,
  identity, membership, contacts,
}: {
  createSessionName: string;
  onCreateSessionNameChange: (value: string) => void;
  onCreate: () => void;
  isCreating: boolean;
  joinId: string;
  onJoinIdChange: (value: string) => void;
  joinMsg: string;
  onJoinMsgChange: (value: string) => void;
  onJoin: (id: string) => void;
  savedSessions: SavedSession[];
  onDestroySession: (id: string) => void;
  advOpen: boolean;
  onToggleAdv: () => void;
  identity: ReturnType<typeof useIdentity>;
  membership: ReturnType<typeof useMembership>;
  contacts: ReturnType<typeof useContacts>;
}) {
  const hostSessions = savedSessions.filter(s => s.role === 'host');
  return (
    <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-6 lg:py-8 flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[9px] font-mono uppercase tracking-[0.2em]">
            <ShieldCheck size={12} />Quantum Hardened Security_
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter leading-[0.95] text-slate-900 dark:text-white">BUNKER <span className="text-cyan-500 italic opacity-80">PROTOCOL.</span></h1>
          <p className="text-slate-500 dark:text-slate-500 text-sm sm:text-base font-mono italic">Stateless routing · Ephemeral handshakes · No logs, no storage, no traces.</p>
        </div>
        <div className="hidden md:flex flex-wrap items-center gap-x-6 gap-y-2 shrink-0">
          <div className="flex items-center gap-2"><Activity size={14} className="text-cyan-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Relay: ACTIVE</span></div>
          <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Noise_XX</span></div>
          <div className="flex items-center gap-2"><Terminal size={14} className="text-amber-500" /><span className="text-[10px] font-mono text-slate-500 uppercase">Uptime 99.998%</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Init Vault */}
            <div className="group p-8 glass-panel hover:border-cyan-500/50 transition-all duration-500 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl group-hover:bg-cyan-500/10 transition-colors" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400"><Plus size={24} /></div>
                <div><h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Init_Vault</h3><p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Spawn unique relay hash</p></div>
              </div>
              <div className="space-y-4 relative z-10">
                <input type="text" value={createSessionName} onChange={(e) => onCreateSessionNameChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); }} placeholder="VAULT_LABEL (OPTIONAL)" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                <button onClick={onCreate} disabled={isCreating} className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-white dark:text-cyan-400 border border-cyan-500/50 font-mono font-bold text-xs uppercase transition-all tracking-widest flex items-center justify-center gap-2">
                  {isCreating ? 'PROCESS_INIT...' : 'CREATE_BUNKER'}
                </button>
              </div>
            </div>

            {/* Enter Vault */}
            <div className="group p-8 glass-panel hover:border-cyan-500/50 transition-all duration-500 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-500/5 blur-3xl group-hover:bg-cyan-500/10 transition-colors" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-slate-400"><LogIn size={24} /></div>
                <div><h3 className="text-base font-mono font-bold text-slate-900 dark:text-white uppercase tracking-widest">Enter_Vault</h3><p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">Join via existing hash</p></div>
              </div>
              <div className="space-y-3 relative z-10">
                <input type="text" value={joinId} onChange={(e) => onJoinIdChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) onJoin(joinId); }} placeholder="VAULT_HASH_ID" className="w-full bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                <div className="flex gap-2">
                  <input type="text" value={joinMsg} onChange={(e) => onJoinMsgChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && joinId.trim()) onJoin(joinId); }} placeholder="IDENT_TAG" className="flex-1 bg-black/[0.02] dark:bg-black/40 border border-black/10 dark:border-white/10 px-4 py-3 text-xs font-mono text-cyan-600 dark:text-cyan-400 placeholder:text-slate-400 dark:placeholder:text-slate-800 outline-none focus:border-cyan-500/50" />
                  <button onClick={() => onJoin(joinId)} disabled={!joinId.trim()} className="bg-slate-900 dark:bg-white text-white dark:text-black font-mono font-bold text-[10px] uppercase px-6 hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all disabled:opacity-30">
                    {savedSessions.some(s => s.id === joinId.trim()) ? 'RECONNECT' : 'JOIN'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURE_CARDS.map((item, i) => (
              <div key={i} className="p-5 border border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] space-y-3">
                <item.icon size={18} className="text-cyan-500/50" />
                <h4 className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">{item.title}</h4>
                <p className="text-[10px] font-mono text-slate-500 leading-relaxed uppercase tracking-tighter">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="border border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01]">
            <button
              onClick={onToggleAdv}
              className="w-full flex items-center justify-between px-5 py-4 group"
            >
              <span className="flex items-center gap-3">
                <SlidersHorizontal size={16} className="text-cyan-500/70" />
                <span className="text-left">
                  <span className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Access Control</span>
                  <span className="block text-[9px] font-mono text-slate-500 uppercase tracking-tighter mt-0.5">Identity · Whitelist · Trusted Contacts</span>
                </span>
              </span>
              <ChevronDown size={18} className={`text-slate-400 transition-transform ${advOpen ? 'rotate-180' : ''}`} />
            </button>
            {advOpen && (
              <div className="px-5 pb-5 space-y-8 border-t border-black/5 dark:border-white/5 pt-5">
                <IdentityPanel identity={identity} />
                <MembershipPanel membership={membership} hostSessions={hostSessions} />
                <ContactBook membership={membership} contacts={contacts} hostSessions={hostSessions} />
              </div>
            )}
          </div>
        </div>

        {/* Vault History */}
        <div className="xl:col-span-4 space-y-6">
          <div className="h-full flex flex-col p-8 glass-panel min-h-[400px]">
            <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />Active_Vault_History
            </h3>
            <div className="flex-1 space-y-3 custom-scrollbar pr-2">
              {savedSessions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-4 opacity-40">
                  <Activity size={32} className="text-slate-400" />
                  <p className="text-[10px] font-mono text-slate-400 italic uppercase tracking-tighter">History_Buffer_Empty</p>
                </div>
              ) : savedSessions.map((session) => (
                <div key={session.id} className="flex gap-2 w-full">
                  <button onClick={() => onJoin(session.id)} className="flex-1 text-left p-4 border border-black/5 dark:border-white/5 bg-white dark:bg-black/20 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group min-w-0">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate pr-2 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{session.name || session.id.substring(0, 8)}</span>
                      <span className={`text-[8px] font-mono px-2 py-0.5 rounded-sm ${session.role === 'host' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>{session.role.toUpperCase()}</span>
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 flex items-center gap-2"><span className="opacity-50">HASH:</span><span className="text-cyan-600/70 dark:text-cyan-400/50 truncate">{session.id.substring(0, 12)}...</span></div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-[8px] font-mono text-slate-400 flex items-center gap-1.5"><Activity size={8} />{new Date(session.lastJoined).toLocaleString()}</div>
                      <span className="text-[9px] font-mono font-bold text-cyan-600 dark:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase border border-cyan-500/30 px-2 py-0.5 bg-cyan-500/10">Reconnect</span>
                    </div>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDestroySession(session.id); }} title="Destroy Session" className="w-12 flex items-center justify-center border border-black/5 dark:border-white/5 bg-white dark:bg-black/20 hover:border-red-500/30 hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-black/5 dark:border-white/5 text-[9px] font-mono text-slate-400 uppercase tracking-[0.2em]">
        <div className="flex gap-8"><span>STATUS: ALL_SYSTEMS_GO</span><span className="hidden sm:inline">LATENCY: OPTIMAL</span></div>
        <div className="flex gap-8"><span>LOAD: 0.0012%</span><span className="text-cyan-500/50">SECURE_TUNNEL_READY</span></div>
      </div>
    </div>
  );
}
